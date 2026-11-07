// Fails if Math.random appears anywhere under resources/js/game/ except core/rng.ts. See CLAUDE.md, "Determinism rules".
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../resources/js/game/', import.meta.url).pathname;
const ALLOWED = new Set(['core/rng.ts']);
const offenders = [];

function walk(dir) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (!/\.(ts|js|mjs|tsx)$/.test(name)) continue;
        const rel = relative(ROOT, p);
        if (ALLOWED.has(rel)) continue;
        readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
            if (line.includes('Math.random')) offenders.push(`resources/js/game/${rel}:${i + 1}: ${line.trim()}`);
        });
    }
}
walk(ROOT);
if (offenders.length) {
    console.error('Math.random is only allowed in resources/js/game/core/rng.ts. Use a named RNG stream instead:');
    for (const o of offenders) console.error('  ' + o);
    process.exit(1);
}
console.log('ok: no Math.random outside resources/js/game/core/rng.ts');
