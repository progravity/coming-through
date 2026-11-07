{{-- The game, mounted on the shell in layouts/game.blade.php. The markup is the Vite app's index.html body, unchanged, since ui.ts finds all of it by id. --}}
<x-layouts::game entry="resources/js/game/main.ts">
<div id="stats" class="chip"><b id="time">0.0s</b><span id="bumps">0 bumps</span><div id="stamina" data-state="ok"><i id="staminaFill"></i><i id="staminaMark"></i><em id="staminaTag">Winded</em></div></div>
<div id="controls">
  <button id="less" aria-label="Fewer people">−</button><button id="count" aria-label="Crowd size">80</button><button id="more" aria-label="More people">+</button>
  <button id="cam">Camera: first</button>
  <button id="ink">Ink: on</button>
  <button id="tier">Tier: High</button>
  <button id="debug">Debug: off</button>
  <button id="bobBtn">Bob: off</button>
  <div id="bobPanel" hidden></div>
</div>
<div id="legend" class="chip"></div>
<canvas id="debugCanvas" hidden></canvas>
<div id="stick"><div id="knob"></div></div>
<div id="flash"></div>
<div id="scrape"></div>
<div id="fps" class="chip"></div>
<div id="overlay"><div>
  <h1 id="overlayTitle">Coming Through!</h1>
  <p>Get from the blue pad to the green pad without bumping into anyone.</p>
  <p>Touch and drag anywhere to move. Keyboard: WASD or arrows, shift to hurry. Hurrying spends the yellow stamina bar; stand still to get it back. C cycles the camera, O toggles ink, [ and ] change the crowd size, T cycles the device tier, G toggles the debug view. R replays the current seed from the start, N rolls a new one.</p>
  <p id="result"></p>
  <p class="seednote">Same seed, same crowd, every time. Share the link to race a friend through the same people.</p>
  <p class="seedline">
    <label for="seedInput">Seed</label>
    <input id="seedInput" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" size="11" aria-label="Seed">
    <button id="randomSeed">Random</button>
    <button id="copyLink">Copy link</button>
  </p>
  <button class="go" id="start">Start</button>
</div></div>
</x-layouts::game>
