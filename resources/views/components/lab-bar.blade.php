{{-- The bar across the top of every lab page: the way between the labs and back to the game. A lab view's own controls (which view, which source) are filled into #lab-tools by labs/chrome.ts. --}}
@props(['current' => null])

@php
    $labs = [
        'people' => ['People', 'lab.people'],
        'fixtures' => ['Fixtures', 'lab.fixtures'],
        'buildings' => ['Buildings', 'lab.buildings'],
    ];
@endphp

<header id="lab-bar">
    <a class="lab-brand" href="{{ route('lab.index') }}" @if ($current === null) aria-current="page" @endif>Labs</a>
    <nav class="lab-nav" aria-label="Labs">
        @foreach ($labs as $id => [$name, $route])
            <a href="{{ route($route) }}" @if ($current === $id) aria-current="page" @endif>{{ $name }}</a>
        @endforeach
    </nav>
    <div id="lab-tools"></div>
    <a class="lab-play" href="{{ route('play') }}">Play</a>
</header>
