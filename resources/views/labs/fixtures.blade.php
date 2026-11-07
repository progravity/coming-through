{{-- The fixtures lab. Everything below the bar is built by resources/js/game/labs/fixtures/main.ts, whose view (individual, row and the rest) is chosen by the query string. View-only: nothing here edits or saves. --}}
<x-layouts::game title="Fixtures Lab" entry="resources/js/game/labs/fixtures/main.ts" css="resources/css/lab.css" body-class="lab-stage">
<x-lab-bar current="fixtures" />
<main id="lab" data-lab="fixtures"></main>
</x-layouts::game>
