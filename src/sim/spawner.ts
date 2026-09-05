import { ARCH, weightedType } from '../archetypes.ts';
import type { Streams } from '../core/rng.ts';
import { OUTFIT_FAMILY } from '../palette.ts';
import { clamp } from '../util.ts';
import { DOORS, L, SPAWN_S, W } from '../world/layout.ts';
import { PATH, newWorldPoint } from '../world/path.ts';
import { Agent } from './agent.ts';
import type { Crowd } from './crowd.ts';

const _w = newWorldPoint();

export interface SpawnOptions {
    /** Place path-end spawns anywhere along the path instead of at the ends (used to pre-fill a crowd). */
    scatter?: boolean;
}

/**
 * Add one new person (or family, or parent+child) at a path end or a doorway.
 *
 * Every random draw comes from a fork named after the spawn event number, and every agent's own
 * rolls come from forks named after its spawn index, so spawn event N and agent N are the same
 * regardless of crowd size, tier, or anything drawn elsewhere. Returns false if the crowd is full.
 */
export function spawn(crowd: Crowd, streams: Streams, opts: SpawnOptions = {}): boolean {
    if (crowd.freeSlotCount < 5) return false;
    const event = crowd.nextSpawnEvent();
    const where = streams.spawn.fork(`spawn:${event}`);
    const how = streams.behavior.fork(`spawn:${event}`);
    const type = weightedType(where), A = ARCH[type];
    // Every placement draw is taken unconditionally, then selected between. Drawing inside the
    // branches would let `scatter` (which is not part of the seed) shift every later draw from
    // this fork, so the same spawn event would produce a different person depending on whether it
    // came from priming or from topping the crowd up.
    const dir: 1 | -1 = where.chance(0.5) ? 1 : -1;
    const atDoor = where.chance(0.25);
    const door = where.pick(DOORS);
    const alongPath = where.range(-L, L);
    const acrossPath = where.range(-W + 1, W - 1);
    // Placement is decided in path coordinates and only turned into a world position at the last
    // moment, so a spawn at "one end of the path" stays at the end of the path however it bends.
    let s: number, n: number;
    if (atDoor) { n = door.side > 0 ? W - 0.8 : -W + 0.8; s = door.s; }
    else { n = acrossPath; s = opts.scatter ? alongPath : -dir * SPAWN_S; }
    const make = (t: typeof type, an: number, o: ConstructorParameters<typeof Agent>[7] = {}) => {
        const w = PATH.toWorld(s, an, _w);
        return new Agent(streams, crowd.nextAgentIndex(), t, w.x, w.z, dir, crowd.takeSlot(), o);
    };
    if (A.group) {
        // One draw, exactly as before: this is the last value this fork produces, so retuning the
        // green family cannot shift any other spawn decision.
        const size = Math.round(how.sample(A.group)), gid = crowd.nextGroupId(), spacing = A.spacing ?? 1;
        // The whole family is dressed from one outfit rather than issued one shirt colour: they
        // still read as a set, but as people who coordinated rather than as a uniform.
        const outfit = where.pick(OUTFIT_FAMILY.green);
        const leader = make(type, n, { group: gid, outfit });
        crowd.add(leader);
        for (let i = 1; i < size; i++) {
            const off = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * spacing;
            crowd.add(make(type, clamp(n + off, -W + 0.6, W - 0.6), { leader, offset: off, group: gid, outfit, speed: leader.speed }));
        }
    } else if (A.parentType) {
        const parent = make(A.parentType, n);
        crowd.add(parent);
        crowd.add(make(type, clamp(n + where.range(-1, 1), -W + 0.5, W - 0.5), { parent }));
    } else crowd.add(make(type, n));
    return true;
}
