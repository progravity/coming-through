<?php

use Illuminate\Support\Facades\Route;

Route::view('/', 'welcome')->name('home');
Route::view('play', 'game')->name('play');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::view('dashboard', 'dashboard')->name('dashboard');
});

// The labs: view-only tools for inspecting the game's entities, one per category. Each lab page is
// standalone like the game's, and every view of one is a query string on its route. Behind the
// login and nothing more: the auth package's local dev cast is seeded unverified, and a tool that
// edits and saves nothing has no reason to turn it away.
Route::middleware('auth')->prefix('lab')->name('lab.')->group(function () {
    Route::view('/', 'labs.index')->name('index');
    Route::view('people', 'labs.people')->name('people');
    Route::view('fixtures', 'labs.fixtures')->name('fixtures');
    Route::view('buildings', 'labs.buildings')->name('buildings');
});

require __DIR__.'/settings.php';
