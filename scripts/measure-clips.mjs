// Measures the speed every person model's walk and run were authored at, and lists every clip each
// GLB holds with the clip role the data file maps it to.
//
//   node scripts/measure-clips.mjs            print the table
//   node scripts/measure-clips.mjs --write    and record each measurement in its data file
//
// The speed is read off the clip as authored, before the game strips its travel: how fast a planted
// foot moves back under the hips (`measureGait` in resources/js/game/modelcrowd/clips.ts). A hand-set
// "override" in the data file is left alone; only "measured" is written. A walk or run with no
// "speed" yet is reported, to be added by hand as { "measured": <m/s> }.
import { readFileSync, writeFileSync } from 'node:fs';

// The loader looks for `self`, and cannot decode a texture under node: neither matters for clips.
globalThis.self ??= globalThis;
const { DATA_FILES, SPEED_CLIP_ROLES } = await import('../resources/js/game/data/people.ts');
const { measureGait } = await import('../resources/js/game/modelcrowd/clips.ts');
const { parseModel } = await import('../resources/js/game/render/model-file.ts');

const write = process.argv.includes('--write');
const root = new URL('..', import.meta.url);
let failed = false;
for (const f of DATA_FILES) {
    if (f.model === null) { console.log(`${f.path}: not a valid data file, skipped\n  ${f.errors.join('\n  ')}`); failed = true; continue; }
    const m = f.model;
    const bytes = readFileSync(new URL(`public${m.modelFile}`, root));
    const quiet = console.error;
    console.error = () => {};
    const file = await parseModel(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), m).finally(() => { console.error = quiet; });
    console.log(`${m.id} (${m.modelFile.slice(m.modelFile.lastIndexOf('/') + 1)})`);
    let text = readFileSync(new URL(f.path, root), 'utf8');
    for (const clip of file.animations) {
        const roles = Object.entries(m.clips).filter(([, e]) => e.clip === clip.name).map(([r]) => r);
        const gait = roles.some(r => SPEED_CLIP_ROLES.includes(r)) ? measureGait(file.scene, clip) : null;
        console.log(`  "${clip.name}" ${clip.duration.toFixed(3)} s -> ${roles.length === 0 ? 'no role' : roles.join(', ')}`
            + (gait === null ? '' : ` · ${gait.speed.toFixed(2)} m/s, ${(gait.speed * clip.duration).toFixed(2)} m a cycle`));
        for (const role of roles.filter(r => SPEED_CLIP_ROLES.includes(r))) {
            if (gait === null) { console.log(`    ${role}: cannot be measured`); failed = true; continue; }
            const now = Number(gait.speed.toFixed(2)), was = m.clips[role].speed?.measured;
            if (was === now) continue;
            const line = new RegExp(`("${role}"\\s*:\\s*\\{[^\\n]*?"measured"\\s*:\\s*)[0-9.]+`);
            if (!line.test(text)) { console.log(`    ${role}: no "speed" yet; add "speed": { "measured": ${now} }`); failed = true; continue; }
            console.log(`    ${role}: recorded ${was ?? 'nothing'}, measures ${now}${write ? ', written' : '; --write records it'}`);
            text = text.replace(line, `$1${now}`);
            if (!write) failed = true;
        }
    }
    for (const role of SPEED_CLIP_ROLES) if (m.clips[role] === undefined) console.log(`  ${role}: not mapped`);
    if (write) writeFileSync(new URL(f.path, root), text);
}
process.exitCode = failed ? 1 : 0;
