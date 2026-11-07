// Headless stress benchmark: opens ?stress=1 in Chrome over the DevTools protocol (plain
// --headless --timeout only ever runs one animation frame) and prints window.game.stress.
// Usage: npm run dev & node scripts/stress-headless.mjs [https://coming-through.test/play] [seconds] [--prim]
// People are drawn with models, as the game draws them by default; --prim runs the primitives instead.
// (Herd serves the page; Vite, or a prior `npm run build`, serves its scripts.)
// Note: headless rAF runs at only a few fps under SwiftShader, so each frame does the maximum
// catch-up steps; compare avgSimPerStepMs and avgRenderMs, not simMs per frame.
import { spawn } from 'node:child_process';
const argv = process.argv.slice(2);
const prim = argv.includes('--prim');
const [base = 'https://coming-through.test/play', secs = '60'] = argv.filter(a => !a.startsWith('--'));
// The game page with this query: a bare origin means its /play page, and a trailing slash is dropped.
const gamePage = (base, query) => { const u = new URL(base); u.pathname = u.pathname === '/' ? '/play' : u.pathname.replace(/\/$/, ''); u.search = query; return u.href; };
const url = gamePage(base, `stress=1&tier=high${prim ? '&people=prim' : ''}`);
const CH = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9333;
const chrome = spawn(CH, ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=800,600',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', `--remote-debugging-port=${port}`,
    '--user-data-dir=' + (process.env.TMPDIR ?? '/tmp/') + 'coming-through-stress', 'about:blank'], { stdio: 'ignore' });
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
    if (m.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(m.params.exceptionDetails).slice(0, 400));
};
const send = (method, params = {}, sessionId) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
const { result: { targetId } } = await send('Target.createTarget', { url: 'about:blank' });
const { result: { sessionId } } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Runtime.enable', {}, sessionId);
await send('Page.navigate', { url }, sessionId);
await sleep(Number(secs) * 1000);
const r = await send('Runtime.evaluate', { expression: 'JSON.stringify(window.game.stress)', returnByValue: true }, sessionId);
for (const e of errors) console.error('page error:', e);
console.log(r.result?.result?.value ?? JSON.stringify(r));
ws.close(); chrome.kill();
