import { BEHAVIORS } from '../behaviors.ts';
import type { Streams } from '../core/rng.ts';
import { behaviorAhead } from '../recipe.ts';
import { clamp } from '../util.ts';
import { DOORS, L, SPAWN_S, W } from '../world/layout.ts';
import { PATH, newWorldPoint } from '../world/path.ts';
import { Agent } from './agent.ts';
import type { AgentOptions } from './agent.ts';
import type { Crowd } from './crowd.ts';

const _w = newWorldPoint();

export interface SpawnOptions {
    /** Place path-end spawns anywhere along the path instead of at the ends (used to pre-fill a crowd). */
    scatter?: boolean;
}

/**
 * Add one new person (or family, or parent and child) at a path end or a doorway.
 *
 * Every placement draw comes from a fork named after the spawn event number, and every agent's own
 * rolls come from forks named after its spawn index, so spawn event N and agent N are the same
 * regardless of crowd size, tier, or anything drawn elsewhere. Who agent N is -- their behavior
 * profile among the rest -- is their own recipe's to roll; the spawner reads the profile ahead
 * (`behaviorAhead`, the recipe's first draw) to know whether a family or a parent comes with them.
 * Returns false if the crowd is full.
 */
export function spawn(crowd: Crowd, streams: Streams, opts: SpawnOptions = {}): boolean {
    if (crowd.freeSlotCount < 5) return false;
    const event = crowd.nextSpawnEvent();
    const where = streams.spawn.fork(`spawn:${event}`);
    const how = streams.behavior.fork(`spawn:${event}`);
    const index = crowd.nextAgentIndex();
    const type = behaviorAhead(streams.recipe.fork(`agent:${index}`), crowd.mix), A = BEHAVIORS[type];
    // Every placement draw is taken unconditionally, then selected between. Drawing inside the
    // branches would let `scatter` (which is not part of the seed) shift every later draw from
    // this fork, so the same spawn event would produce a different person depending on whether it
    // came from priming or from topping the crowd up.
    const dir: 1 | -1 = where.chance(0.5) ? 1 : -1;
    const atDoor = where.chance(0.25);
    const door = where.pick(DOORS);
    const alongPath = where.range(-L, L);
    // Drawn against the walkway's nominal width, and fitted to the actual width at `s` below. The
    // draw cannot read the width itself: `s` is not decided until after it, and a draw whose range
    // depends on a later decision is exactly the reordering the rules above forbid. Once the width
    // really varies this wants to become a normalised offset scaled after selection -- which moves
    // `identityHash`, so it is a deliberate change and not a tidy-up.
    const acrossPath = where.range(-W + 1, W - 1);
    // Placement is decided in path coordinates and only turned into a world position at the last
    // moment, so a spawn at "one end of the path" stays at the end of the path however it bends.
    const s = atDoor ? door.s : opts.scatter ? alongPath : -dir * SPAWN_S;
    const edge = PATH.halfWidth(s);
    const n = atDoor ? (door.side > 0 ? edge - 0.8 : -edge + 0.8) : clamp(acrossPath, -edge + 1, edge - 1);
    const make = (i: number, an: number, o: AgentOptions = {}) => {
        const w = PATH.toWorld(s, an, _w);
        return new Agent(streams, i, w.x, w.z, dir, crowd.takeSlot(), { mix: crowd.mix, ...o });
    };
    if (A.group) {
        // One draw, exactly as before: this is the last value this fork produces, so retuning the
        // group cannot shift any other spawn decision.
        const size = Math.round(how.sample(A.group)), gid = crowd.nextGroupId(), spacing = A.spacing ?? 1;
        const leader = make(index, n, { group: gid });
        crowd.add(leader);
        // The family walks with the leader's profile, and -- when the leader's roll says so -- in
        // the leader's clothing, each of them arranged their own way.
        const outfit = leader.recipe.sharesScheme ? leader.recipe.outfit : undefined;
        for (let i = 1; i < size; i++) {
            const off = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * spacing;
            crowd.add(make(crowd.nextAgentIndex(), clamp(n + off, -edge + 0.6, edge - 0.6), {
                leader, offset: off, group: gid, speed: leader.speed, choices: { behavior: type },
                ...(outfit === undefined ? {} : { outfit }),
            }));
        }
    } else if (A.parentType) {
        // The parent comes first, as it always has, so it has moved before the child reads where
        // it is; the child keeps the spawn index its own roll was read from.
        const parent = make(crowd.nextAgentIndex(), n, { choices: { behavior: A.parentType } });
        crowd.add(parent);
        crowd.add(make(index, clamp(n + where.range(-1, 1), -edge + 0.5, edge - 0.5), { parent }));
    } else crowd.add(make(index, n));
    return true;
}
