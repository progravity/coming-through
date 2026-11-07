{{-- The shell the game and the labs are mounted on: one standalone page, with its markup in the slot. Like Dimidium's game pages: no Livewire, Flux or Tailwind. `css` is the page's stylesheet (the game's, or the labs'), and `entry` its script, which a page without one leaves out. --}}
@props(['title' => null, 'entry' => null, 'css' => 'resources/css/game.css', 'bodyClass' => null])

<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<title>{{ $title ? $title.' - ' : '' }}{{ config('app.name', 'Coming Through!') }}</title>
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
{{-- Module scripts are deferred, so the entry runs after the slot is parsed, as it did from the end of index.html's body. --}}
@vite(array_values(array_filter([$css, $entry])))
</head>
<body @class([$bodyClass])>
{{ $slot }}
</body>
</html>
