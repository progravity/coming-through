/** The fixtures lab's entry point: `resources/views/labs/fixtures.blade.php` loads it through `@vite`. */
import { LABS } from '../labs.ts';
import { startLab } from '../start.ts';

await startLab(LABS.fixtures);
