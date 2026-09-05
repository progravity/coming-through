import { ARCH } from './archetypes.ts';
import type { Crowd } from './sim/crowd.ts';
import type { Player } from './sim/player.ts';
import { DOORS, EXIT_S, GOAL_S, L, PAD_LENGTH, START_S, W } from './world/layout.ts';
import { PATH, newWorldPoint } from './world/path.ts';

export interface DebugStats { fps: number; drawCalls: number; }

/** How many points the centreline is sampled at to draw the walkway; enough for a bend to read. */
const SAMPLES = 48;
const _w = newWorldPoint();

/**
 * Toggleable top-down 2D overlay: the whole path, every agent as a dot in its archetype colour,
 * its separation radius as a circle, its collision circle, heading, and the player.
 */
export class DebugOverlay {
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    visible = false;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('2D canvas unavailable');
        this.ctx = ctx;
    }

    toggle(): boolean {
        this.visible = !this.visible;
        this.canvas.hidden = !this.visible;
        return this.visible;
    }

    draw(crowd: Crowd, player: Player, stats: DebugStats): void {
        if (!this.visible) return;
        const c = this.canvas, ctx = this.ctx;
        const dpr = Math.min(devicePixelRatio, 2);
        const cssW = c.clientWidth, cssH = c.clientHeight;
        if (c.width !== cssW * dpr || c.height !== cssH * dpr) { c.width = cssW * dpr; c.height = cssH * dpr; }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);

        // World -> canvas: z runs down the long axis of the panel; +z (start) at the bottom.
        const pad = 10, worldLen = 2 * L + 8, worldWid = 2 * W + 4;
        const s = Math.min((cssH - 2 * pad) / worldLen, (cssW - 2 * pad) / worldWid);
        const ox = cssW / 2, oy = cssH / 2;
        const X = (x: number) => ox + x * s, Y = (z: number) => oy + z * s;

        // path, pads, railings and doors, all traced along the centreline rather than assumed
        // straight, so this overlay keeps telling the truth when the path bends.
        const at = (ps: number, pn: number): [number, number] => { const p = PATH.toWorld(ps, pn, _w); return [X(p.x), Y(p.z)]; };
        /** Walk one edge of the walkway from `from` to `to`, opening a subpath or continuing one. */
        const edge = (pn: number, from: number, to: number, back: boolean, open: boolean): void => {
            for (let k = 0; k <= SAMPLES; k++) {
                const i = back ? SAMPLES - k : k;
                const [px, py] = at(from + (to - from) * (i / SAMPLES), pn);
                if (open && k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
        };
        /** The strip of walkway between two lateral offsets, as one closed polygon. */
        const band = (from: number, to: number): void => {
            ctx.beginPath();
            edge(-W, from, to, false, true);
            edge(W, from, to, true, false);
            ctx.closePath();
        };
        ctx.fillStyle = 'rgba(207,196,173,.35)'; band(-EXIT_S, EXIT_S); ctx.fill();
        const HALF = PAD_LENGTH / 2;
        ctx.fillStyle = 'rgba(74,127,181,.6)'; band(START_S - HALF, START_S + HALF); ctx.fill();
        ctx.fillStyle = 'rgba(89,178,95,.6)';  band(GOAL_S - HALF, GOAL_S + HALF); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (const side of [-1, 1]) edge(side * W, -EXIT_S, EXIT_S, false, true);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,220,120,.9)'; ctx.lineWidth = 2;
        for (const d of DOORS) {
            const n = d.side * W;
            ctx.beginPath(); ctx.moveTo(...at(d.s - 1.6, n)); ctx.lineTo(...at(d.s + 1.6, n)); ctx.stroke();
        }

        // agents
        ctx.lineWidth = 1;
        for (const a of crowd.agents) {
            if (a.dead) continue;
            const col = '#' + ARCH[a.type].color.toString(16).padStart(6, '0');
            // separation radius (about the collision centre, matching the steering test)
            ctx.strokeStyle = col; ctx.globalAlpha = 0.35;
            ctx.beginPath(); ctx.arc(X(a.cx), Y(a.cz), a.sepR * s, 0, Math.PI * 2); ctx.stroke();
            // collision circle
            ctx.globalAlpha = 0.9;
            ctx.beginPath(); ctx.arc(X(a.cx), Y(a.cz), a.r * s, 0, Math.PI * 2); ctx.stroke();
            // body dot and heading
            ctx.fillStyle = col; ctx.globalAlpha = 1;
            ctx.beginPath(); ctx.arc(X(a.x), Y(a.z), Math.max(1.5, 0.15 * s), 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.moveTo(X(a.x), Y(a.z)); ctx.lineTo(X(a.x + a.hx * 0.7), Y(a.z + a.hz * 0.7)); ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // player
        ctx.strokeStyle = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(X(player.x), Y(player.z), player.r * s, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(X(player.x), Y(player.z));
        ctx.lineTo(X(player.x + Math.sin(player.yaw) * 1.0), Y(player.z + Math.cos(player.yaw) * 1.0)); ctx.stroke();

        // stats
        ctx.fillStyle = '#f2f0ea'; ctx.font = '11px -apple-system, Segoe UI, Roboto, sans-serif'; ctx.textBaseline = 'top';
        const lines = [`${stats.fps} fps`, `${crowd.agents.length} agents`, `${stats.drawCalls} draw calls`, `${crowd.freeSlotCount} free slots`];
        lines.forEach((ln, i) => ctx.fillText(ln, pad, pad + i * 13));
    }
}
