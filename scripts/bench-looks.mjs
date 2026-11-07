// What each look costs in the real game: ?stress=1&look=<slug> at a full crowd, swept over all six,
// printed as a table. This is the half the comparator cannot measure -- fill cost scales with the
// pixels people cover, and a comparison panel covers almost none.
//
// Usage: npm run dev & node scripts/bench-looks.mjs [https://coming-through.test/play] [seconds]
//        node scripts/bench-looks.mjs https://coming-through.test/play 30 --gpu
//        node scripts/bench-looks.mjs https://coming-through.test/play 30 --prim   (primitive people)
//
// People are drawn with models, as the game draws them by default; --prim benches the primitives.
//
// `seconds` is a cap per look, not a duration: each one is read as soon as its ring holds only
// settled frames, and the cap is what stops a slow machine running forever. Headless SwiftShader
// manages about two frames a second at a full crowd, so it needs 90s or more to fill a 120-frame
// ring; a real GPU gets there in a couple of seconds. A look that hits the cap early says so.
//
// Read the columns knowing where each comes from:
//   pose   CPU only, no GL. Trustworthy headless -- it is what scripts/bench-pose.mjs measures.
//   render pose plus everything the driver did. Under headless SwiftShader that is software
//          rasterisation and says nothing about a real GPU, so it is printed without a comparison
//          column: a first run of this had matcap at +640% there, when on real hardware it is one
//          of the cheapest of the six. --gpu is the only way to get a render column worth reading.
//   calls  draw calls in the frame, people and world together. Exact either way.
//
// Each look is sampled only once its ring buffer holds nothing but steady-state frames. game.ts
// averages over the last RING frames, so reading too early averages in shader compilation and
// texture upload -- which under SwiftShader, at single-digit fps, is most of a short window.
//
// --gpu drops SwiftShader and runs Chrome headed on the real GPU. It opens and closes a visible
// window per look, so expect focus to move around while it runs.
import { spawn } from 'node:child_process';

const args = process.argv.slice(2);
const gpu = args.includes('--gpu');
const prim = args.includes('--prim');
const [base = 'https://coming-through.test/play', secs = gpu ? '20' : '120'] = args.filter(a => !a.startsWith('--'));
// The game page with this query: a bare origin means its /play page, and a trailing slash is dropped.
const gamePage = (base, query) => { const u = new URL(base); u.pathname = u.pathname === '/' ? '/play' : u.pathname.replace(/\/$/, ''); u.search = query; return u.href; };
// The one hand-kept copy of the slugs: this is plain node and cannot import the .ts. Keep it in
// step with `LOOKS` in resources/js/game/render/look.ts -- a seventh look added there and not here is simply
// never benched, and nothing complains.
const LOOKS = ['current', 'toon-bare', 'soft-ink', 'soft', 'soft-thin', 'matcap'];

const CH = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9334;
const flags = ['--window-size=1280,800', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    `--remote-debugging-port=${port}`, '--user-data-dir=' + (process.env.TMPDIR ?? '/tmp/') + 'coming-through-looks'];
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

const rows = [];
for (const look of LOOKS) {
    // A fresh target per look, so nothing a previous look left on the pools can carry over.
    const url = gamePage(base, `stress=1&tier=high&look=${look}${prim ? '&people=prim' : ''}`);
    const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
    const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
    await send('Runtime.enable', {}, sessionId);
    await send('Page.navigate', { url }, sessionId);

    // Wait for a ring full of settled frames, capped by the time budget so a slow machine still
    // finishes. RING is game.ts's own; SETTLE is the frames thrown away before it starts counting.
    const RING = 120, SETTLE = 30, deadline = Date.now() + Number(secs) * 1000;
    let stats = null;
    for (;;) {
        const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.game?.stress ?? null)', returnByValue: true }, sessionId);
        stats = JSON.parse(r.result?.result?.value ?? 'null');
        if (stats !== null && stats.frames >= RING + SETTLE) break;
        if (Date.now() > deadline) break;
        await sleep(500);
    }
    await send('Target.closeTarget', { targetId });
    if (stats === null) { console.error(`${look}: no stress stats (is the dev server up?)`); continue; }
    if (stats.frames < RING + SETTLE) console.error(`  note: ${look} only reached ${stats.frames} frames; raise the seconds argument`);
    rows.push({ look, ...stats });
}
for (const e of errors) console.error('page error:', e);

const base0 = rows.find(r => r.look === 'current');
const pct = (v, b) => (b > 0 ? `${v >= b ? '+' : ''}${(((v - b) / b) * 100).toFixed(0)}%` : '');
const col = (s, n) => String(s).padEnd(n);
const rcol = (s, n) => String(s).padStart(n);
console.log(`\n  ${rows[0]?.people ?? '?'} people · ${gpu ? 'real GPU' : 'headless SwiftShader'}\n`);
// The render comparison column is earned only on a real GPU. Under software rasterisation the
// number is printed as a raw reading and nothing is computed from it, because a percentage beside
// it would be read as a ranking and the ranking would be wrong.
console.log('  ' + col('look', 11) + rcol('pose ms', 9) + rcol('vs', 7) + rcol('render ms', 11)
    + (gpu ? rcol('vs', 7) : '') + rcol('calls', 7));
console.log('  ' + '-'.repeat(gpu ? 52 : 45));
for (const r of rows) {
    console.log('  ' + col(r.look, 11)
        + rcol(r.avgPoseMs.toFixed(3), 9) + rcol(base0 ? pct(r.avgPoseMs, base0.avgPoseMs) : '', 7)
        + rcol(r.avgRenderMs.toFixed(2), 11)
        + (gpu ? rcol(base0 ? pct(r.avgRenderMs, base0.avgRenderMs) : '', 7) : '')
        + rcol(r.drawCalls ?? '-', 7));
}
if (!gpu) console.log('\n  render ms is software rasterisation and is not comparable between looks;\n  re-run with --gpu for a figure that is.');
console.log('');
ws.close(); chrome.kill();
