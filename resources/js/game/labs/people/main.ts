/** The people lab's entry point: `resources/views/labs/people.blade.php` loads it through `@vite`. */
import { LABS } from '../labs.ts';
import { startLab } from '../start.ts';

await startLab(LABS.people);
