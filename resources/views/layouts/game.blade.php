{{-- The shell the game is mounted on: one full-bleed page, with its HUD markup in the slot. Standalone, like Dimidium's game pages: no Livewire, Flux or Tailwind. --}}
@props(['title' => null, 'entry'])

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
@vite(['resources/css/game.css', $entry])
</head>
<body>
{{ $slot }}
</body>
</html>
