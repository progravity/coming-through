/**
 * Records the StepCommand fed to every fixed step so a run can later be reconstructed from
 * seed + log. Playback is not built yet; see the note at the bottom.
 */
import { CAMERA_MODES } from '../sim/player.ts';
import type { StepCommand } from '../sim/simulation.ts';
import { AXIS_STEPS, MAG_STEPS } from './index.ts';

const FLAG_HURRY = 1, FLAG_RUNNING = 2;
/** Fields per change entry in the typed buffer: step, x, y, mag, flags, cam, crowd. */
const STRIDE = 7;
/** Hard cap on stored change entries (about 1.8 MB); recording stops, and is flagged, beyond this. */
export const MAX_ENTRIES = 1 << 16;

export interface SerializedRun {
    version: 1;
    seed: number;
    /** Crowd size the run was primed with; playback must prime with the same value. */
    primeCrowd: number;
    /** Total fixed steps recorded. */
    steps: number;
    truncated: boolean;
    /** Change entries only: [step, x, y, mag, flags, cam, crowd]. A command holds until the next entry. */
    frames: number[][];
}

/** Log of every fixed step's command, stored run-length: an entry is written only when the command changes. */
export class Recorder {
    private buf = new Int32Array(STRIDE * 256);
    private entries = 0;
    private lastKey = '';
    steps = 0;
    truncated = false;

    readonly seed: number;
    readonly primeCrowd: number;

    constructor(seed: number, primeCrowd: number) { this.seed = seed; this.primeCrowd = primeCrowd; }

    /** Call exactly once per fixed step with the command that step consumed. */
    record(cmd: Readonly<StepCommand>): void {
        const x = Math.round(cmd.x * AXIS_STEPS), y = Math.round(cmd.y * AXIS_STEPS), mag = Math.round(cmd.mag * MAG_STEPS);
        const flags = (cmd.hurry ? FLAG_HURRY : 0) | (cmd.running ? FLAG_RUNNING : 0);
        const cam = CAMERA_MODES.indexOf(cmd.cam), crowd = cmd.crowd;
        const key = `${x},${y},${mag},${flags},${cam},${crowd}`;
        const step = this.steps++;
        if (key === this.lastKey) return;
        this.lastKey = key;
        if (this.entries >= MAX_ENTRIES) { this.truncated = true; return; }
        if ((this.entries + 1) * STRIDE > this.buf.length) { const n = new Int32Array(this.buf.length * 2); n.set(this.buf); this.buf = n; }
        const o = this.entries * STRIDE;
        this.buf[o] = step; this.buf[o + 1] = x; this.buf[o + 2] = y; this.buf[o + 3] = mag; this.buf[o + 4] = flags; this.buf[o + 5] = cam; this.buf[o + 6] = crowd;
        this.entries++;
    }

    get entryCount(): number { return this.entries; }

    /** Compact JSON-friendly form of the whole run so far. */
    serialize(): SerializedRun {
        const frames: number[][] = [];
        for (let i = 0; i < this.entries; i++) frames.push(Array.from(this.buf.subarray(i * STRIDE, (i + 1) * STRIDE)));
        return { version: 1, seed: this.seed, primeCrowd: this.primeCrowd, steps: this.steps, truncated: this.truncated, frames };
    }

    /**
     * Playback (not implemented yet) would be: `const sim = new Simulation(run.seed)` followed by
     * `sim.prime(run.primeCrowd)`, then for step s in 0..run.steps, take the latest frame with
     * frame[0] <= s, expand it back into a StepCommand (x/AXIS_STEPS, y/AXIS_STEPS, mag/MAG_STEPS,
     * flags bits, CAMERA_MODES[cam], crowd) and call `sim.step(cmd)`. Because the live game
     * quantises input the same way before it reaches the simulation, and because a run always
     * begins from a freshly primed simulation, the replayed run hashes identically to the original.
     */
}
