/**
 * Entry point. A normal run loads the game.
 *
 * `?inspect=` no longer opens anything here: the entity inspector lives in the labs now
 * (`/lab/people`, `/lab/fixtures`, `/lab/buildings`, behind the login), and an old address is sent
 * to the lab that shows what it named, with the rest of its query intact. That is a dynamic import,
 * so a normal run never downloads the registry the redirect reads. `?compare=`, which opened the
 * render-direction comparator, opens the game: the comparator drew primitive people, and every
 * person is a model now.
 */
const q = new URLSearchParams(location.search);
const off = (v: string | null): boolean => v === null || v === '' || v === '0';
const inspect = q.get('inspect');

if (!off(inspect)) {
    const { labAddressFor } = await import('./labs/redirect.ts');
    location.replace(labAddressFor(location.search));
} else {
    await import('./game.ts');
}
