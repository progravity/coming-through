import { ARCH, SHIRT, weightedType } from '../archetypes.ts';
import { clamp, pick, rand, rr } from '../util.ts';
import { DOORS, L, W } from '../world/layout.ts';
import { Agent } from './agent.ts';
import type { Crowd } from './crowd.ts';

let groupSeq = 0;

/** Add one new person (or family, or parent+child) at a path end or a doorway. */
export function spawn(crowd: Crowd): void {
    const type = weightedType(), A = ARCH[type];
    let x: number, z: number;
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    if (Math.random() < 0.25) { const d = pick(DOORS); x = d.x > 0 ? W - 0.8 : -W + 0.8; z = d.z; }
    else { z = -dir * (L + 2); x = rand(-W + 1, W - 1); }
    if (crowd.freeSlotCount < 5) return;
    if (A.group) {
        const n = Math.round(rr(A.group)), gid = ++groupSeq, shirt = pick(SHIRT.green), spacing = A.spacing ?? 1;
        const leader = new Agent(type, x, z, dir, crowd.takeSlot(), { group: gid, shirt });
        crowd.add(leader);
        for (let i = 1; i < n; i++) {
            const off = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * spacing;
            crowd.add(new Agent(type, clamp(x + off, -W + 0.6, W - 0.6), z, dir, crowd.takeSlot(), { leader, offset: off, group: gid, shirt, speed: leader.speed }));
        }
    } else if (A.parentType) {
        const parent = new Agent(A.parentType, x, z, dir, crowd.takeSlot());
        crowd.add(parent);
        crowd.add(new Agent(type, clamp(x + rand(-1, 1), -W + 0.5, W - 0.5), z, dir, crowd.takeSlot(), { parent }));
    } else crowd.add(new Agent(type, x, z, dir, crowd.takeSlot()));
}
