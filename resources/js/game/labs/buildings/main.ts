/** The buildings lab's entry point: `resources/views/labs/buildings.blade.php` loads it through `@vite`. */
import { LABS } from '../labs.ts';
import { startLab } from '../start.ts';

await startLab(LABS.buildings);
