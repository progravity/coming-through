/**
 * Entry point. A normal run loads the game; `?compare=1` (or `?compare=row`) loads the throwaway
 * render-comparison harness instead.
 *
 * `?inspect=` no longer opens anything here: the entity inspector lives in the labs now
 * (`/lab/people`, `/lab/fixtures`, `/lab/buildings`, behind the login), and an old address is sent
 * to the lab that shows what it named, with the rest of its query intact. Both are dynamic imports,
 * so a normal run never downloads a dev tool or the registry the redirect reads.
 */
const q = new URLSearchParams(location.search);
const off = (v: string | null): boolean => v === null || v === '' || v === '0';
const inspect = q.get('inspect');
const compare = q.get('compare');

if (!off(inspect)) {
    const { labAddressFor } = await import('./labs/redirect.ts');
    location.replace(labAddressFor(location.search));
} else if (!off(compare)) {
    const { startCompare } = await import('./compare/index.ts');
    startCompare(compare as string);
} else {
    await import('./game.ts');
}
