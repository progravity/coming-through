/**
 * Everything standing on or along the walkway, as one list.
 *
 * There are two readers of that list and they must not be able to disagree: `world/index.ts` draws
 * it, and `sim/obstacles.ts` takes the footprints out of it and gives them to the crowd. Before the
 * kiosks there was only one layer with footprints in it, so both sides could name `furniturePlan`
 * and stay honest by accident. With two there is a real chance of a layer being drawn and not being
 * solid, or the reverse -- so the list lives here, in the one place, and adding the next layer of
 * props is a single entry that both readers pick up at once.
 *
 * Pure by construction, which is what lets the simulation import it: the plans are functions of the
 * curve, and none of them has ever touched three.js.
 */
import { mergePlans } from './edge.ts';
import type { EdgePlan } from './edge.ts';
import { furniturePlan } from './furniture.ts';
import { kioskPlan } from './kiosks.ts';
import { PATH } from './path.ts';
import type { PathCurve } from './path.ts';
import { railingPlan } from './railings.ts';

/**
 * Every edge layer, with `piece` ids renumbered unique across the lot.
 *
 * The renumbering matters because a `piece` is how a collider is checked against the parts it is a
 * collider *for*, and each layer numbers its own objects from one. Merging here rather than at each
 * reader means the ids a collider carries are the same ids the drawn parts carry, whichever side is
 * asking.
 */
export function edgePlans(curve: PathCurve = PATH): EdgePlan {
    return mergePlans([railingPlan(curve), furniturePlan(curve), kioskPlan(curve)]);
}
