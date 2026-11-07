<?php

use Illuminate\Support\Facades\Vite;

test('the game page is public and carries the HUD, the controls and the start overlay', function () {
    $this->withoutVite();

    $response = $this->get(route('play'));

    $response->assertOk()
        ->assertSee('<title>'.config('app.name'), false)
        ->assertSee('id="stats"', false)
        ->assertSee('id="stamina"', false)
        ->assertSee('id="controls"', false)
        ->assertSee('id="bobPanel"', false)
        ->assertSee('id="debugCanvas"', false)
        ->assertSee('id="overlay"', false)
        ->assertSee('id="seedInput"', false)
        ->assertSee('id="start"', false);
});

test('the game page loads the game entry and its stylesheet, and nothing of the app shell', function () {
    // A hot file of its own, so the test reads the tags @vite writes without needing a build.
    $hot = storage_path('framework/testing/play-page.hot');
    file_put_contents($hot, 'http://localhost:5173');
    Vite::useHotFile($hot);

    try {
        $response = $this->get(route('play'));
    } finally {
        unlink($hot);
    }

    $response->assertOk()
        ->assertSee('http://localhost:5173/resources/js/game/main.ts', false)
        ->assertSee('http://localhost:5173/resources/css/game.css', false)
        ->assertDontSee('resources/css/app.css', false)
        ->assertDontSee('flux', false);
});
