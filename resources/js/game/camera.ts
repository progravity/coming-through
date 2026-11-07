import * as THREE from 'three';
import { CAMERA, bobAt, bobHz, newBobOffsets } from './feel.ts';
import { eyeHeight, standingHeight } from './render/person.ts';
import type { Recipe } from './recipe.ts';
import { CAMERA_MODES } from './sim/player.ts';
import type { CameraMode } from './sim/player.ts';
import type { Pose } from './sim/pose.ts';
import { START_S } from './world/layout.ts';
import { PATH, newWorldPoint } from './world/path.ts';

export type { CameraMode };

/**
 * What the rig needs from the player, already interpolated to the current frame.
 *
 * `speed` is the one field that is not interpolated, and does not need to be: it is already a
 * smoothed quantity by the time the simulation has finished with it, and the rig eases its own
 * response to it anyway.
 */
export interface PlayerView extends Pose { camYaw: number; speed: number; }

const _p = new THREE.Vector3();

/**
 * Owns both cameras and the smoothed follow position; returns whichever camera should render this frame.
 * The camera yaw itself is simulated (Player.camYaw) because input is relative to it; only the
 * position smoothing here is visual and may use the frame delta.
 */
export class CameraRig {
    /**
     * The view the game opens in. First person rather than over the shoulder, which is a choice
     * about what the game is: threading a crowd is a judgement about gaps, and a gap reads
     * truthfully only from where the player's own eyes are.
     *
     * It changes what the stick means -- `updatePlayer` steers by yaw at `MOVE.lookTurn` here and
     * by heading in the shoulder view -- so it changes the path a given input walks. That is a
     * simulation input carried on `StepCommand.cam` and hashed through the player's position, but
     * it moves no stored hash: `tests/js/determinism.test.ts` scripts `cmd.cam` explicitly rather than
     * reading whatever the rig happens to default to. **`CAMERA_MODES` is a different matter and
     * must not be reordered** -- `input/recorder.ts` encodes the mode into the input log by its
     * index in that list.
     */
    mode: CameraMode = 'first';
    readonly persp = new THREE.PerspectiveCamera(CAMERA.fov, 1, 0.1, 200);
    readonly top = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 200);
    /** Where the rig sits before a run: a few paces behind the start pad, on the path. */
    private readonly home = PATH.toWorld(START_S + 5, 0, newWorldPoint());
    private readonly pos = new THREE.Vector3(this.home.x, this.home.y + 3, this.home.z);
    private readonly target = new THREE.Vector3();
    /**
     * Heights taken from the player's own body rather than hardcoded, so a change to the character
     * proportions cannot silently leave the camera looking at where the chest used to be. Defaults
     * match a person of unit height until setBody is called.
     *
     * All three are heights **above the walkway**, not world y: each is added to the path's surface
     * under whatever it is measuring from, so the rig rides a slope instead of burying itself in it.
     */
    private eye = 1.68;
    private look = 1.15;
    private high = 2.70;
    /**
     * 0 at a walk, 1 at a full sprint, eased rather than read straight off the speed. This is the
     * whole "running feels fast" trick: the same velocity looks quicker through a wider lens from
     * further back, and easing it is what keeps the two cues from snapping on at the threshold.
     */
    private rush = 0;
    /**
     * The bump jolt: a unit direction, how much of it is left (decaying), and the last field of
     * view written, so the projection matrix is only rebuilt on the frames it actually changed.
     */
    private kickX = 0;
    private kickZ = 0;
    private hit = 0;
    private fov: number = CAMERA.fov;
    /**
     * The head bob's own phase, in cycles, and the offsets it produced this frame.
     *
     * Its own accumulator rather than the body's gait phase, and that is the whole reason the
     * frequency is tunable at all: a gait-locked phase turns at whatever cadence the walk cycle is
     * running at, which is precisely the coupling `BOB.freqCap` exists to be able to break. It
     * keeps its value while the player stands still -- `bobAt` gates the output on `mv` instead of
     * resetting the phase, so stopping settles the head rather than snapping it.
     */
    private bobPhase = 0;
    private readonly bob = newBobOffsets();

    constructor() { this.persp.rotation.order = 'YXZ'; }

    /**
     * Punch the shot away from a collision. Purely visual and frame-timed: nothing here reaches the
     * simulation, so a jolt cannot move a hash or change where the player ends up.
     *
     * @param nx Collision normal, from the person to the player -- the way the player was shoved.
     * @param strength 0..1, how hard the hit was. Stacks up to a full-strength jolt if you are
     *   ricocheting through a crowd, and the most recent hit owns the direction.
     */
    kick(nx: number, nz: number, strength: number): void {
        this.kickX = nx; this.kickZ = nz;
        this.hit = Math.min(1, this.hit + strength);
    }

    /** Re-derive the camera heights from the body it is following. Call once per run. */
    setBody(recipe: Recipe): void {
        const top = standingHeight(recipe);
        this.eye = eyeHeight(recipe);
        // Chest height for the follow camera to aim at, and a rig that clears the head comfortably.
        this.look = top * 0.62;
        this.high = top * 1.45;
    }

    cycle(): CameraMode {
        this.mode = CAMERA_MODES[(CAMERA_MODES.indexOf(this.mode) + 1) % CAMERA_MODES.length];
        return this.mode;
    }

    reset(): void {
        this.pos.set(this.home.x, this.home.y + 3, this.home.z);
        this.rush = 0; this.hit = 0; this.bobPhase = 0;
    }

    resize(width: number, height: number): void {
        const a = width / height;
        this.persp.aspect = a; this.persp.updateProjectionMatrix();
        const h = 22;
        this.top.left = -h * a; this.top.right = h * a; this.top.top = h; this.top.bottom = -h; this.top.updateProjectionMatrix();
    }

    /** @param dt Frame delta in seconds, used only for the visual smoothing, easing and decay. */
    update(dt: number, v: PlayerView): THREE.Camera {
        const cam = this.persp;
        // How hard the player is running, and how much of a bump is left. Both are eased here
        // rather than in the simulation: they are how the shot behaves, not where anyone is.
        const want = Math.min(1, Math.max(0, (v.speed - CAMERA.rushFrom) / (CAMERA.rushTo - CAMERA.rushFrom)));
        this.rush += (want - this.rush) * Math.min(1, dt * CAMERA.rushEase);
        this.hit *= Math.exp(-dt / CAMERA.kickDecay);
        const fov = CAMERA.fov + CAMERA.rushFov * this.rush + CAMERA.kickFov * this.hit;
        if (fov !== this.fov) { this.fov = fov; cam.fov = fov; cam.updateProjectionMatrix(); }
        // The jolt is a shift along the hit normal plus a roll about the view axis, the roll taken
        // from the sideways component of the hit so a shove from the left tips the horizon the way
        // a shove from the left would. Both are applied after the follow so they read as a hit
        // landing on the shot rather than as something the follow smooths away.
        const shift = this.hit * CAMERA.kickShift;
        // The head bob, advanced at whatever rate the tuning says and turned into three offsets.
        // Frame-timed and read-only over the player's view, exactly like `rush` and the jolt above:
        // nothing here reaches the simulation, so no setting of it can move a hash.
        this.bobPhase += dt * bobHz(v.speed);
        const b = bobAt(this.bobPhase, v.speed, v.mv, this.bob);
        // Sway is across the *view*, not across the world -- in world x it would rotate with the
        // player and read as drift rather than as a gait. This is the camera's own right vector.
        const rx = Math.cos(v.camYaw), rz = -Math.sin(v.camYaw);
        const roll = -(this.kickX * Math.cos(v.camYaw) - this.kickZ * Math.sin(v.camYaw)) * this.hit * CAMERA.kickRoll;

        // Every height below is a height above the walkway, added to the path's surface under the
        // point it belongs to. Zero on today's level path; the point is that none of them is a
        // world y of its own.
        if (this.mode === 'shoulder') {
            const fx = -Math.sin(v.camYaw), fz = -Math.cos(v.camYaw);
            // Rig and target each stand above the path where *they* are, not where the player is,
            // so on a slope the camera climbs with the ground behind and aims along it in front.
            const back = CAMERA.back + CAMERA.rushBack * this.rush;
            const bx = v.x - fx * back, bz = v.z - fz * back;
            const tx = v.x + fx * CAMERA.ahead, tz = v.z + fz * CAMERA.ahead;
            this.pos.lerp(_p.set(bx, PATH.surfaceY(bx, bz) + this.high, bz), Math.min(1, dt * CAMERA.follow));
            cam.up.set(0, 1, 0); cam.position.copy(this.pos);
            cam.position.x += this.kickX * shift; cam.position.z += this.kickZ * shift;
            cam.lookAt(this.target.set(tx, PATH.surfaceY(tx, tz) + this.look, tz));
            // The bob lands *after* the aim, as a pure translation of the eye. Offsetting before
            // `lookAt` would have the shot re-aim at a fixed target every frame, which turns a
            // vertical bounce into a pitch oscillation as well -- two axes moving from one slider,
            // which is the exact coupling this whole parameter set exists to avoid.
            cam.position.x += rx * b.dx; cam.position.y += b.dy; cam.position.z += rz * b.dx;
            // After lookAt, and last in the YXZ order, so this is a roll about the camera's own axis.
            cam.rotation.z = roll + b.roll;
            return cam;
        }
        const under = PATH.surfaceY(v.x, v.z);
        if (this.mode === 'first') {
            cam.up.set(0, 1, 0);
            cam.position.set(
                v.x + this.kickX * shift + rx * b.dx,
                under + this.eye + b.dy,
                v.z + this.kickZ * shift + rz * b.dx);
            cam.rotation.set(-0.08, v.camYaw, roll + b.roll);
            this.pos.copy(cam.position);
            return cam;
        }
        this.top.up.set(0, 0, -1); this.top.position.set(v.x, under + 40, v.z);
        this.top.lookAt(v.x, under, v.z);
        return this.top;
    }
}
