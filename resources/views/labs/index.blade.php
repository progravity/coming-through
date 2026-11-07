{{-- The labs' front page: what each lab shows, by category, and a way into every view of it. Plain Blade with no script: it is a page of links. --}}
@php
    $labs = [
        [
            'id' => 'people',
            'route' => 'lab.people',
            'name' => 'People',
            'what' => 'The person family: everyone who walks the promenade. "Crowd" means only the flowing, spawned population; stationed staff, when they exist, are people but not crowd.',
            'views' => [
                ['Individual', [], 'One person on a turntable, rolled by the game\'s own recipe: seed stepping, archetype, age, build and mobility, walk, run or idle, gait scrub and freeze, a held angle.'],
                ['Row', ['view' => 'row'], 'One of each archetype side by side, from the same seed.'],
                ['Model source', ['source' => 'model', 'view' => 'row'], 'The same recipe drawn as the rigged model and as primitives, with the model\'s color regions, clips, anchors and torso width.'],
                ['Crowd', ['view' => 'crowd'], 'A seeded crowd running the real simulation in its own instance, with time controls, cameras, overlays, live statistics and a click-to-select readout.'],
            ],
        ],
        [
            'id' => 'fixtures',
            'route' => 'lab.fixtures',
            'name' => 'Fixtures',
            'what' => 'On-path, solid things the crowd and the player steer around: the kiosk and furniture families.',
            'views' => [
                ['Individual', [], 'One cart, bench, lamp or bin, built where the game builds it, with its collider and its spots.'],
                ['Row', ['view' => 'row'], 'Every cart type side by side; step the seed to re-roll their paint.'],
                ['Furniture', ['entity' => 'furniture', 'view' => 'row'], 'The bench, the lamp post and the bin.'],
                ['Placement', ['view' => 'placement'], 'A fixture standing in its place on the promenade, with the stretch of edge it keeps clear and its spots relative to the path.'],
            ],
        ],
        [
            'id' => 'buildings',
            'route' => 'lab.buildings',
            'name' => 'Buildings',
            'what' => 'Near-path and never obstacles, interactable through their spots: the building family, which is the shops and the restaurants today.',
            'views' => [
                ['Individual', [], 'One shopfront or restaurant on the turntable, with its symbol, livery, footprint and spots.'],
                ['Row', ['view' => 'row'], 'The five shops side by side: can you tell them apart?'],
                ['Restaurants', ['entity' => 'restaurant', 'view' => 'row'], 'The five restaurants side by side.'],
                ['Placement', ['view' => 'placement'], 'A building in its place on the promenade, with the railing gap it opens and its spots relative to the path.'],
            ],
        ],
    ];
@endphp
<x-layouts::game title="Labs" css="resources/css/lab.css" body-class="lab-page">
<x-lab-bar />
<main class="lab-index">
    <header class="lab-index-head">
        <h1>Labs</h1>
        <p>Tools for inspecting and understanding every element of the game, one lab per category. Everything here is drawn by the game's own code and is view-only: nothing is edited or saved, and every view is a link you can reload or share.</p>
    </header>

    <div class="lab-cards">
        @foreach ($labs as $lab)
            <section class="lab-card" aria-labelledby="lab-{{ $lab['id'] }}">
                <h2 id="lab-{{ $lab['id'] }}"><a href="{{ route($lab['route']) }}">{{ $lab['name'] }}</a></h2>
                <p>{{ $lab['what'] }}</p>
                <ul>
                    @foreach ($lab['views'] as [$name, $query, $about])
                        <li><a href="{{ route($lab['route'], $query) }}">{{ $name }}</a><span>{{ $about }}</span></li>
                    @endforeach
                </ul>
            </section>
        @endforeach
    </div>

    <section class="lab-terms" aria-labelledby="lab-terms">
        <h2 id="lab-terms">Categories</h2>
        <dl>
            <dt>People</dt><dd>The person family. "Crowd" is only the flowing, spawned population; stationed staff are people but not crowd.</dd>
            <dt>Fixtures</dt><dd>On-path, solid things the crowd and the player steer around: kiosks and furniture.</dd>
            <dt>Buildings</dt><dd>Near-path, never obstacles, interactable through their spots: shops and restaurants, and later restrooms and ride entrances.</dd>
            <dt>Scenery</dt><dd>Visual only, and not entities: the ground, the railings, the distant rides and the skyline.</dd>
            <dt>Effects</dt><dd>Transient visuals, and not entities either.</dd>
        </dl>
        <p>A category groups families; behavior never asks it. A fixture is solid because it declares the <code>static-obstacle</code> property, not because it is a fixture.</p>
    </section>
</main>
</x-layouts::game>
