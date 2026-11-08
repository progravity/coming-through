/**
 * Open a lab at whichever view its address asks for.
 *
 * Each view is its own dynamic import, so the turntable never downloads the crowd and the crowd
 * never downloads the turntable: a lab page pays for the one view it is showing. Switching view is
 * a fresh page for the same reason switching entity is -- the cheapest clean stage there is.
 */
import type { Lab } from './labs.ts';
import { viewOf } from './labs.ts';

export async function startLab(lab: Lab): Promise<void> {
    const view = viewOf(lab, location.search);
    document.body.dataset.view = view;
    if (view === 'crowd') {
        const { startCrowd } = await import('./people/crowd.ts');
        await startCrowd(lab);
        return;
    }
    if (view === 'single' && lab.pathMode === true && new URLSearchParams(location.search).get('mode') === 'path') {
        document.body.dataset.view = 'path';
        const { startPath } = await import('./people/path.ts');
        await startPath(lab);
        return;
    }
    if (view === 'placement') {
        const { startPlacement } = await import('./placement.ts');
        await startPlacement(lab);
        return;
    }
    const { startTurntable } = await import('../inspect/index.ts');
    await startTurntable(lab, view === 'row' ? 'row' : 'single');
}
