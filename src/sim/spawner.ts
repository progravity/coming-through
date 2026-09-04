import { ARCH, SHIRT, weightedType } from '../archetypes.ts';
import type { Streams } from '../core/rng.ts';
import { clamp } from '../util.ts';
import { DOORS, L, W } from '../world/layout.ts';
import { Agent } from './agent.ts';
import type { Crowd } from './crowd.ts';

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
    const n = crowd.nextSpawnEvent();
    const where = streams.spawn.fork(`spawn:${n}`);
    const how = streams.behavior.fork(`spawn:${n}`);
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
    let x: number, z: number;
    if (atDoor) { x = door.x > 0 ? W - 0.8 : -W + 0.8; z = door.z; }
    else { x = acrossPath; z = opts.scatter ? alongPath : -dir * (L + 2); }
    const make = (t: typeof type, ax: number, o: ConstructorParameters<typeof Agent>[7] = {}) =>
        new Agent(streams, crowd.nextAgentIndex(), t, ax, z, dir, crowd.takeSlot(), o);
    if (A.group) {
        const size = Math.round(how.sample(A.group)), gid = crowd.nextGroupId(), shirt = where.pick(SHIRT.green), spacing = A.spacing ?? 1;
        const leader = make(type, x, { group: gid, shirt });
        crowd.add(leader);
        for (let i = 1; i < size; i++) {
            const off = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * spacing;
            crowd.add(make(type, clamp(x + off, -W + 0.6, W - 0.6), { leader, offset: off, group: gid, shirt, speed: leader.speed }));
        }
    } else if (A.parentType) {
        const parent = make(A.parentType, x);
        crowd.add(parent);
        crowd.add(make(type, clamp(x + where.range(-1, 1), -W + 0.5, W - 0.5), { parent }));
    } else crowd.add(make(type, x));
    return true;
}
