<?php

use App\Models\User;
use Illuminate\Support\Facades\Vite;

/**
 * The labs: every page is behind the login, standalone like the game page, and loads its own entry.
 */
dataset('labs', [
    'people' => ['lab.people', 'People Lab', 'resources/js/game/labs/people/main.ts'],
    'fixtures' => ['lab.fixtures', 'Fixtures Lab', 'resources/js/game/labs/fixtures/main.ts'],
    'buildings' => ['lab.buildings', 'Buildings Lab', 'resources/js/game/labs/buildings/main.ts'],
]);

test('guests are sent to the login page from every lab', function (string $route) {
    $this->get(route($route))->assertRedirect(route('login'));
})->with([
    'index' => ['lab.index'],
    'people' => ['lab.people'],
    'fixtures' => ['lab.fixtures'],
    'buildings' => ['lab.buildings'],
]);

test('signing in is all the labs ask, so the unverified local dev cast can use them', function () {
    $this->withoutVite();
    $this->actingAs(User::factory()->unverified()->create());

    $this->get(route('lab.people'))->assertOk();
});

test('the lab index links to every lab and names the categories', function () {
    $this->withoutVite();
    $this->actingAs(User::factory()->create());

    $this->get(route('lab.index'))
        ->assertOk()
        ->assertSee('<title>Labs', false)
        ->assertSee(route('lab.people'), false)
        ->assertSee(route('lab.fixtures'), false)
        ->assertSee(route('lab.buildings'), false)
        ->assertSee('Fixtures')
        ->assertSee('Scenery');
});

test('a lab page carries the lab bar and its mount point', function (string $route, string $title) {
    $this->withoutVite();
    $this->actingAs(User::factory()->create());

    $this->get(route($route))
        ->assertOk()
        ->assertSee("<title>{$title}", false)
        ->assertSee('id="lab-bar"', false)
        ->assertSee('id="lab-tools"', false)
        ->assertSee('id="lab"', false)
        ->assertSee(route('play'), false);
})->with('labs');

test('a lab page loads its own entry and the lab stylesheet, and nothing of the app shell or the game', function (string $route, string $title, string $entry) {
    $this->actingAs(User::factory()->create());
    // A hot file of its own, so the test reads the tags @vite writes without needing a build.
    $hot = storage_path('framework/testing/lab-page.hot');
    file_put_contents($hot, 'http://localhost:5173');
    Vite::useHotFile($hot);

    try {
        $response = $this->get(route($route));
    } finally {
        unlink($hot);
    }

    $response->assertOk()
        ->assertSee("http://localhost:5173/{$entry}", false)
        ->assertSee('http://localhost:5173/resources/css/lab.css', false)
        ->assertDontSee('resources/js/game/main.ts', false)
        ->assertDontSee('resources/css/game.css', false)
        ->assertDontSee('resources/css/app.css', false)
        ->assertDontSee('flux', false);
})->with('labs');
