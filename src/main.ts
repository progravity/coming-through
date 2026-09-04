/**
 * Entry point. A normal run loads the game; `?inspect=1` (or `?inspect=row`) loads the character
 * inspector instead.
 *
 * The two are separate dynamic imports so a normal run never downloads or executes the dev tool:
 * the inspector is a driver for the character code, not a branch of it, and it costs a real run
 * nothing.
 */
const inspect = new URLSearchParams(location.search).get('inspect');

if (inspect === null || inspect === '' || inspect === '0') {
    await import('./game.ts');
} else {
    const { startInspector } = await import('./inspect/index.ts');
    startInspector(inspect);
}
