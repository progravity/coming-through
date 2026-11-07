{{-- The buildings lab. Everything below the bar is built by resources/js/game/labs/buildings/main.ts, whose view (individual, row and the rest) is chosen by the query string. View-only: nothing here edits or saves. --}}
<x-layouts::game title="Buildings Lab" entry="resources/js/game/labs/buildings/main.ts" css="resources/css/lab.css" body-class="lab-stage">
<x-lab-bar current="buildings" />
<main id="lab" data-lab="buildings"></main>
</x-layouts::game>
