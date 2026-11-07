/**
 * The stretches of the path's edge the `building` family opens, as one list.
 *
 * There are three readers of it -- the railings run up to it and stop, the furniture keeps clear of
 * it, and `debug.ts` draws it -- and they must not be able to disagree. Before the restaurants there
 * was one building type, so all three could name `SHOP_SPANS` and stay honest by accident; with two
 * there is a real chance of a layer routing around the shops and not the restaurants, which is a
 * doorway with a bench across it that nobody would notice until they walked into it.
 *
 * It lives in a file of its own for one dull, load-bearing reason: `railings.ts` and `furniture.ts`
 * read it, and `shops.ts` and `restaurants.ts` produce it. Anywhere else -- `layout.ts`, `plan.ts`,
 * either of the two building modules -- and the import graph closes on itself.
 *
 * **A span is not the same thing as a building.** A shop stands 0.2 m off the path's edge, inside
 * the lamp posts, so its span is its whole frontage; a restaurant stands 1.3 m off it, outside them,
 * so its span is only its doorway. Which one a type registers is a fact about where it stands and
 * belongs with it -- see `SHOP_SPANS` and `RESTAURANT_SPANS`.
 *
 * The kiosks are deliberately **not** a reader. A cart routes around the shops because a cart in a
 * shop doorway is a cart standing where the spawner walks people onto the promenade; a restaurant
 * has a frontage and no such doorway, and keeping the carts off five more stretches of walkway would
 * cost five of the nine carts. See `RESTAURANT_PLACEMENTS`.
 */
import { RESTAURANT_SPANS } from './restaurants.ts';
import { SHOP_SPANS } from './shops.ts';
import type { EdgeSpan } from './layout.ts';

/** Every building's interruption in the edge: the shops' frontages and the restaurants' doorways. */
export const BUILDING_SPANS: readonly EdgeSpan[] = [...SHOP_SPANS, ...RESTAURANT_SPANS];
