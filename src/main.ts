/**
 * Entry point. A normal run loads the game; `?inspect=1` (or `?inspect=row`) loads the entity
 * inspector instead, and `?compare=1` (or `?compare=row`) the throwaway render-comparison harness.
 *
 * All three are separate dynamic imports so a normal run never downloads or executes a dev tool:
 * they are drivers for the game's own code, not branches of it, and they cost a real run nothing.
 */
const q = new URLSearchParams(location.search);
const off = (v: string | null): boolean => v === null || v === '' || v === '0';
const inspect = q.get('inspect');
const compare = q.get('compare');

if (!off(inspect)) {
    const { startInspector } = await import('./inspect/index.ts');
    startInspector(inspect as string);
} else if (!off(compare)) {
    const { startCompare } = await import('./compare/index.ts');
    startCompare(compare as string);
} else {
    await import('./game.ts');
}
