{{-- The people lab. Everything below the bar is built by resources/js/game/labs/people/main.ts, whose view (individual, row and the rest) is chosen by the query string. View-only: nothing here edits or saves. --}}
<x-layouts::game title="People Lab" entry="resources/js/game/labs/people/main.ts" css="resources/css/lab.css" body-class="lab-stage">
<x-lab-bar current="people" />
<main id="lab" data-lab="people"></main>
</x-layouts::game>
