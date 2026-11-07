// The `?people=` experiment's sweep: both crowd renderers at several crowd sizes, with ink and
// (for the model) the animation throttle on and off, each as its own ?stress=1&crowd=N run.
//
// Usage: npm run dev -- --port 5198 & node scripts/bench-people.mjs http://localhost:5198 [capSeconds]
//        node scripts/bench-people.mjs http://localhost:5198 30 --gpu --sizes=60,190 --only=model
//        node scripts/bench-people.mjs http://localhost:5198 45 --model=casual-man-low   (a name in MODELS)
//
// Each run waits for a few settling frames, then averages over the frames that follow, read off the
// running totals game.ts keeps in `game.stress` -- so shader compiles at the start are never in the
// average however slowly the frames come. `capSeconds` bounds the measuring window per run.
//
// Read the columns knowing where each comes from:
//   frame   wall time per frame: everything, GPU included. Under headless SwiftShader that is
//           software rasterisation and says nothing about a real GPU. --gpu runs Chrome headed on
//           the real one, which is the only way to get a frame column worth comparing.
//   pose    CPU only: posing primitives into instance buffers, or placing and animating clones.
//   render  CPU only, pose included: the time renderer.render takes to *submit* the frame. The GPU
//           finishes later and asynchronously, so its cost shows in `frame`, never here.
//   calls, tris, anim   exact counts from the last frame.
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const gpu = args.includes('--gpu');
const opt = name => args.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
const [base = 'http://localhost:5173', secs = '60'] = args.filter(a => !a.startsWith('--'));
const sizes = (opt('sizes') ?? '40,60,80,120,190').split(',').map(Number);
const only = opt('only');
const model = opt('model');

const runs = [];
for (const crowd of sizes) {
    if (only !== 'model') for (const ink of [false, true]) runs.push({ people: 'prim', crowd, ink, throttle: false });
    if (only !== 'prim') for (const ink of [false, true]) for (const throttle of [false, true]) runs.push({ people: 'model', crowd, ink, throttle });
}

const CH = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9335;
const flags = ['--window-size=800,600', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    `--remote-debugging-port=${port}`, '--user-data-dir=' + (process.env.TMPDIR ?? '/tmp/') + 'coming-through-people'];
if (!gpu) flags.unshift('--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader');
const chrome = spawn(CH, [...flags, 'about:blank'], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
let ver = null;
for (let i = 0; i < 50 && !ver; i++) { try { ver = await (await fetch(`http://localhost:${port}/json/version`)).json(); } catch { await sleep(200); } }
if (!ver) { chrome.kill(); throw new Error('chrome did not start'); }
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(m.params.exceptionDetails).slice(0, 300));
};
const send = (method, params = {}, sessionId) => new Promise(r => {
    const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId }));
});
const read = async sessionId => {
    const r = await send('Runtime.evaluate', { expression: 'JSON.stringify({ s: window.game?.stress ?? null, p: window.game?.people ?? null })', returnByValue: true }, sessionId);
    return JSON.parse(r.result?.result?.value ?? '{"s":null,"p":null}');
};

const SETTLE = 3, MIN_FRAMES = 15, MIN_SECS = 8;
const rows = [];
for (const run of runs) {
    // The shipped look has no ink anywhere; `current` is the shipped look with it, on the world and the people alike.
    const url = base.replace(/\/$/, '') + `/?stress=1&tier=high&people=${run.people}&crowd=${run.crowd}`
        + (run.ink ? '&look=current' : '') + (run.throttle ? '&throttle=1' : '')
        + (model !== undefined && run.people === 'model' ? `&model=${encodeURIComponent(model)}` : '');
    const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
    const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Runtime.enable', {}, sessionId);
    await send('Page.navigate', { url }, sessionId);
    const deadline = Date.now() + Number(secs) * 1000 + 60_000;
    let a = null, b = null, t0 = 0;
    for (;;) {
        const got = await read(sessionId);
        // The page reloaded under us (the dev server does that when a file changes): start again.
        if (got.s === null || (a !== null && got.s.frames < a.s.frames)) { a = null; b = null; await sleep(400); continue; }
        if (a === null && got.s.frames >= SETTLE) { a = got; t0 = Date.now(); }
        if (a !== null) {
            b = got;
            const n = b.s.frames - a.s.frames, el = (Date.now() - t0) / 1000;
            if ((n >= MIN_FRAMES && el >= MIN_SECS) || el >= Number(secs)) break;
        }
        if (Date.now() > deadline) break;
        await sleep(400);
    }
    await send('Target.closeTarget', { targetId });
    const n = a && b ? b.s.frames - a.s.frames : 0;
    if (n < 2) { console.error(`  ${run.people} ${run.crowd}: too few frames to measure`); continue; }
    const per = k => (b.s[k] - a.s[k]) / n;
    const row = {
        ...run, frames: n, frameMs: per('totalFrameMs'), simMs: per('totalSimMs'), poseMs: per('totalPoseMs'),
        renderMs: per('totalRenderMs'), calls: b.s.drawCalls, tris: b.s.triangles, onPath: b.s.people,
        animated: b.p?.renderer === 'model' ? b.p.animated : null,
    };
    rows.push(row);
    // Each row as soon as it is measured, so a sweep that dies late still leaves its numbers behind.
    console.error('  row ' + JSON.stringify(row));
}
for (const e of errors) console.error('page error:', e);

const col = (s, w) => String(s).padStart(w);
console.log(`\n  ${gpu ? 'real GPU (headed Chrome)' : 'headless SwiftShader: frame column is software rasterisation'}`
    + `${model !== undefined ? ` · model ${model}` : ''}\n`);
console.log('  ' + ['renderer'.padEnd(9), col('crowd', 5), col('ink', 4), col('thr', 4), col('fps', 6), col('frame', 8),
    col('sim', 6), col('pose', 6), col('render', 7), col('calls', 6), col('tris', 7), col('anim', 5), col('n', 4)].join(' '));
for (const r of rows) {
    console.log('  ' + [r.people.padEnd(9), col(r.crowd, 5), col(r.ink ? 'on' : 'off', 4),
        col(r.people === 'model' ? (r.throttle ? 'on' : 'off') : '-', 4), col((1000 / r.frameMs).toFixed(1), 6),
        col(r.frameMs.toFixed(0), 8), col(r.simMs.toFixed(2), 6), col(r.poseMs.toFixed(2), 6), col(r.renderMs.toFixed(2), 7),
        col(r.calls, 6), col(`${(r.tris / 1e6).toFixed(2)}M`, 7), col(r.animated ?? '-', 5), col(r.frames, 4)].join(' '));
}
console.log('\n  frame/sim/pose/render in ms per frame; pose and render are CPU only (see the header of this file).\n');
console.log(JSON.stringify(rows));
ws.close(); chrome.kill();
