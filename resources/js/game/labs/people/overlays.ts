/**
 * Everything the crowd view draws over the crowd: colliders, separation radii, heading and velocity,
 * the spatial grid and how full each cell is, group links, a disc in each person's archetype color,
 * the furniture's own colliders, and a ring round whoever is selected.
 *
 * All of it reads the same interpolated poses the renderer reads and the simulation's own numbers
 * (`r`, `colOff`, `sepR`, the grid's cell size), and none of it writes anything back. The lines are
 * one dynamic buffer refilled each frame -- a crowd of 190 is a few thousand segments, and one draw
 * call -- and drawn over everything, so a ring under a stroller still shows.
 */
import * as THREE from 'three';
import { ARCH } from '../../archetypes.ts';
import type { Agent } from '../../sim/agent.ts';
import type { Obstacle } from '../../sim/obstacles.ts';
import type { Player } from '../../sim/player.ts';
import type { Pose } from '../../sim/pose.ts';
import { L, MAX } from '../../world/layout.ts';
import { PATH } from '../../world/path.ts';
import { MARK, onTop } from '../../inspect/markers.ts';

/** How far over the surface the marks are laid, so they never z-fight it. */
const LIFT = 0.04;
const CIRCLE = 20;
const MAX_SEGMENTS = 24000;

const C = new THREE.Color();

/** Which overlays are on, by id. */
export interface Shown {
    key: boolean; collider: boolean; separation: boolean; vectors: boolean; grid: boolean; groups: boolean;
}

export class CrowdOverlays {
    readonly group = new THREE.Group();
    private readonly pos = new Float32Array(MAX_SEGMENTS * 6);
    private readonly col = new Float32Array(MAX_SEGMENTS * 6);
    private readonly lines: THREE.LineSegments;
    private n = 0;
    private readonly discs: THREE.InstancedMesh;
    private readonly cells: THREE.InstancedMesh;
    private readonly gridLines: THREE.LineSegments;
    private readonly furniture: THREE.LineSegments;
    private readonly selection: THREE.Mesh;
    private readonly cell: number;
    private readonly m = new THREE.Matrix4();
    private readonly q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    private readonly v = new THREE.Vector3();
    private readonly s = new THREE.Vector3();

    constructor(scene: THREE.Scene, obstacles: readonly Obstacle[], cellSize: number) {
        this.cell = cellSize;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
        this.lines = onTop(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true })), 12);
        this.lines.frustumCulled = false;

        const disc = new THREE.CircleGeometry(1, 20);
        this.discs = new THREE.InstancedMesh(disc, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.6, depthWrite: false }), MAX + 1);
        this.discs.renderOrder = 5;
        this.discs.frustumCulled = false;
        this.discs.setColorAt(0, C.set(0xffffff));

        this.cells = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.35, depthWrite: false }), 400);
        this.cells.renderOrder = 4;
        this.cells.frustumCulled = false;
        this.cells.setColorAt(0, C.set(0xffffff));

        this.gridLines = this.buildGrid();
        this.furniture = this.buildFurniture(obstacles);

        this.selection = onTop(new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 32), new THREE.MeshBasicMaterial({ color: MARK.facing, side: THREE.DoubleSide })), 13);
        this.selection.quaternion.copy(this.q);
        this.selection.visible = false;

        this.group.add(this.cells, this.discs, this.gridLines, this.furniture, this.lines, this.selection);
        scene.add(this.group);
    }

    /** Lines on every cell boundary the walkway crosses: the grid is keyed on multiples of its cell size. */
    private buildGrid(): THREE.LineSegments {
        const pts: number[] = [];
        const reach = 10, c = this.cell;
        for (let x = -reach; x <= reach + 1e-6; x += c) pts.push(x, LIFT, -L - 6, x, LIFT, L + 6);
        for (let z = Math.floor((-L - 6) / c) * c; z <= L + 6 + 1e-6; z += c) pts.push(-reach, LIFT, z, reach, LIFT, z);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        return onTop(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.18 })), 6);
    }

    /** The furniture's capsules, read off the crowd's own obstacle list. Drawn with the colliders. */
    private buildFurniture(obstacles: readonly Obstacle[]): THREE.LineSegments {
        const pts: number[] = [];
        for (const o of obstacles) {
            // A circle has no axis of its own; any will do, so long as across is square to it.
            const ax = o.ax === 0 && o.az === 0 ? 1 : o.ax, az = o.ax === 0 && o.az === 0 ? 0 : o.az;
            const at = (along: number, across: number): [number, number] =>
                [o.cx + ax * along - az * across, o.cz + az * along + ax * across];
            const ring: [number, number][] = [];
            for (let k = 0; k <= CIRCLE / 2; k++) {
                const a = -Math.PI / 2 + (k / (CIRCLE / 2)) * Math.PI;
                ring.push(at(o.half + o.r * Math.cos(a), o.r * Math.sin(a)));
            }
            for (let k = 0; k <= CIRCLE / 2; k++) {
                const a = Math.PI / 2 + (k / (CIRCLE / 2)) * Math.PI;
                ring.push(at(-o.half + o.r * Math.cos(a), o.r * Math.sin(a)));
            }
            for (let i = 0; i < ring.length; i++) {
                const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
                pts.push(ax, LIFT, az, bx, LIFT, bz);
            }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        return onTop(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xec5440, opacity: 0.9 })), 7);
    }

    private seg(ax: number, az: number, bx: number, bz: number, color: number, k = 1): void {
        if (this.n >= MAX_SEGMENTS) return;
        const p = this.pos, c = this.col, i = this.n * 6;
        p[i] = ax; p[i + 1] = PATH.surfaceY(ax, az) + LIFT; p[i + 2] = az;
        p[i + 3] = bx; p[i + 4] = PATH.surfaceY(bx, bz) + LIFT; p[i + 5] = bz;
        C.setHex(color).multiplyScalar(k);
        c[i] = c[i + 3] = C.r; c[i + 1] = c[i + 4] = C.g; c[i + 2] = c[i + 5] = C.b;
        this.n++;
    }

    private circle(x: number, z: number, r: number, color: number, k = 1): void {
        let px = x, pz = z + r;
        for (let i = 1; i <= CIRCLE; i++) {
            const a = (i / CIRCLE) * Math.PI * 2;
            const nx = x + Math.sin(a) * r, nz = z + Math.cos(a) * r;
            this.seg(px, pz, nx, nz, color, k);
            px = nx; pz = nz;
        }
    }

    private arrow(x: number, z: number, dx: number, dz: number, color: number): void {
        const len = Math.hypot(dx, dz);
        if (len < 1e-3) return;
        const ex = x + dx, ez = z + dz, ux = dx / len, uz = dz / len, h = Math.min(0.25, len * 0.35);
        this.seg(x, z, ex, ez, color);
        this.seg(ex, ez, ex - ux * h + uz * h * 0.6, ez - uz * h - ux * h * 0.6, color);
        this.seg(ex, ez, ex - ux * h - uz * h * 0.6, ez - uz * h + ux * h * 0.6, color);
    }

    /**
     * Redraw for this frame. `poses[i]` is `agents[i]`'s interpolated pose; `sel` the selected
     * person's spawn index, or -1.
     */
    draw(agents: readonly Agent[], poses: readonly Pose[], player: Player, playerPose: Pose, show: Shown, sel: number): void {
        this.n = 0;
        let discs = 0;
        this.selection.visible = false;
        const byIndex = new Map<number, number>();
        agents.forEach((a, i) => byIndex.set(a.index, i));
        for (let i = 0; i < agents.length; i++) {
            const a = agents[i], p = poses[i];
            const hx = Math.sin(p.yaw), hz = Math.cos(p.yaw);
            const cx = p.x + hx * a.colOff, cz = p.z + hz * a.colOff;
            const key = ARCH[a.type].color;
            if (show.key) {
                this.m.compose(this.v.set(cx, PATH.surfaceY(cx, cz) + 0.02, cz), this.q, this.s.set(a.r, a.r, 1));
                this.discs.setMatrixAt(discs, this.m);
                this.discs.setColorAt(discs, C.setHex(key));
                discs++;
            }
            if (show.collider) this.circle(cx, cz, a.r, MARK.collider);
            if (show.separation) this.circle(cx, cz, a.sepR, MARK.separation, 0.8);
            if (show.vectors) {
                this.arrow(p.x, p.z, hx * 0.9, hz * 0.9, MARK.facing);
                this.arrow(p.x, p.z, a.vx * 0.6, a.vz * 0.6, 0xffffff);
            }
            if (show.groups) {
                // A follower to the family member leading it, and a child to the parent it orbits.
                const to = a.leader ?? a.parent;
                const j = to === null ? undefined : byIndex.get(to.index);
                if (j !== undefined) this.seg(p.x, p.z, poses[j].x, poses[j].z, key);
            }
            if (a.index === sel) {
                this.selection.visible = true;
                this.selection.position.set(cx, PATH.surfaceY(cx, cz) + 0.05, cz);
                this.selection.scale.setScalar(Math.max(1, a.r / 0.42 + 0.2));
            }
        }
        // The player, idle on the start pad: the crowd avoids them, so they are part of the picture.
        if (show.collider) this.circle(playerPose.x, playerPose.z, player.r, 0xffffff);
        if (show.key) {
            this.m.compose(this.v.set(playerPose.x, 0.02, playerPose.z), this.q, this.s.set(player.r, player.r, 1));
            this.discs.setMatrixAt(discs, this.m);
            this.discs.setColorAt(discs, C.set(0xffffff));
            discs++;
        }
        this.discs.count = discs;
        this.discs.instanceMatrix.needsUpdate = true;
        if (this.discs.instanceColor !== null) this.discs.instanceColor.needsUpdate = true;
        this.discs.visible = show.key;
        this.gridLines.visible = show.grid;
        this.cells.visible = show.grid;
        this.furniture.visible = show.collider;
        const attrs = this.lines.geometry.attributes;
        (attrs.position as THREE.BufferAttribute).needsUpdate = true;
        (attrs.color as THREE.BufferAttribute).needsUpdate = true;
        this.lines.geometry.setDrawRange(0, this.n * 2);
    }

    /** Tint each occupied grid cell by how many people the simulation filed in it. */
    occupancy(counts: ReadonlyMap<number, { ix: number; iz: number; n: number }>): void {
        let i = 0;
        for (const { ix, iz, n } of counts.values()) {
            if (i >= this.cells.count) break;
            const x = (ix + 0.5) * this.cell, z = (iz + 0.5) * this.cell;
            this.m.compose(this.v.set(x, 0.015, z), this.q, this.s.set(this.cell, this.cell, 1));
            this.cells.setMatrixAt(i, this.m);
            // One person a cell is a faint wash; four or more is solid.
            this.cells.setColorAt(i, C.setHSL(0.13 - Math.min(1, (n - 1) / 3) * 0.13, 0.9, 0.55).multiplyScalar(Math.min(1, 0.35 + n * 0.18)));
            i++;
        }
        for (let k = i; k < this.cells.count; k++) this.cells.setMatrixAt(k, this.m.makeScale(0, 0, 0));
        this.cells.instanceMatrix.needsUpdate = true;
        if (this.cells.instanceColor !== null) this.cells.instanceColor.needsUpdate = true;
    }
}
