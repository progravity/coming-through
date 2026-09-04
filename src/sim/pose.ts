import { wrapAngle } from '../util.ts';

/** The rendered part of a body's state. Each body keeps a previous and a current copy so the renderer can interpolate. */
export interface Pose {
    x: number;
    z: number;
    yaw: number;
    /** Gait phase in radians; advanced by the simulation, never by the renderer. */
    phase: number;
    /** 0..1 how much the body is moving; drives bob and arm swing. */
    mv: number;
    lean: number;
}

export function newPose(): Pose { return { x: 0, z: 0, yaw: 0, phase: 0, mv: 0, lean: 0 }; }

export function copyPose(dst: Pose, src: Pose): void {
    dst.x = src.x; dst.z = src.z; dst.yaw = src.yaw; dst.phase = src.phase; dst.mv = src.mv; dst.lean = src.lean;
}

/** out = a + (b - a) * t, with the yaw taking the short way round. */
export function lerpPose(out: Pose, a: Pose, b: Pose, t: number): void {
    out.x = a.x + (b.x - a.x) * t;
    out.z = a.z + (b.z - a.z) * t;
    out.yaw = a.yaw + wrapAngle(b.yaw - a.yaw) * t;
    out.phase = a.phase + (b.phase - a.phase) * t;
    out.mv = a.mv + (b.mv - a.mv) * t;
    out.lean = a.lean + (b.lean - a.lean) * t;
}
