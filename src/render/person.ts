import type { Poseable } from '../sim/agent.ts';
import type { PartPools } from './pools.ts';

/** Draw one person into a render slot. All parts are in "unit height" space and scaled by recipe.h. */
export function drawPerson(pools: PartPools, slot: number, who: Poseable, t: number): void {
    const r = who.recipe, { phase, mv, lean } = who;
    pools.setBase(who.x, 0, who.z, who.yaw, r.h);
    const put = pools.put.bind(pools), hide = pools.hide.bind(pools);
    const g = r.gait, c6 = slot * 6, b5 = slot * 5, k2 = slot * 2;
    const bob = Math.sin(phase * 2) * g.bob * mv + Math.sin(t * 1.7 + slot) * 0.008 * (1 - mv);
    const sw = Math.sin(phase) * g.stride * mv;
    // legs swing about the hip
    put('cyl', c6,     -0.11, 0.8 - 0.39 * Math.cos(sw), -0.39 * Math.sin(sw),  sw, 0, 0, 0.15, 0.78, 0.15, r.pants);
    put('cyl', c6 + 1,  0.11, 0.8 - 0.39 * Math.cos(sw),  0.39 * Math.sin(sw), -sw, 0, 0, 0.15, 0.78, 0.15, r.pants);
    // arms swing opposite
    const ax = 0.27 * r.w + 0.06, asw = -sw * g.arm, ay = 1.32 + bob;
    put('cyl', c6 + 2, -ax, ay - 0.26 * Math.cos(asw), -0.26 * Math.sin(asw),  asw, 0, 0, 0.11, 0.52, 0.11, r.skin);
    put('cyl', c6 + 3,  ax, ay - 0.26 * Math.cos(asw),  0.26 * Math.sin(asw), -asw, 0, 0, 0.11, 0.52, 0.11, r.skin);
    // body
    put('body', slot, 0, 1.05 + bob, 0, 0.06 * mv, 0, lean, 0.52 * r.w, 0.72, 0.38 * r.w, r.shirt);
    // head
    const hr = r.headR, hy = 1.55 + bob + hr * 0.2;
    const hp = r.headPitch + Math.sin(phase) * 0.03 * mv;
    put('head', slot, 0, hy, 0, hp, 0, lean * 0.5, hr * 2, hr * 2, hr * 2, r.skin);
    const hz = hr * hp * 0.8, hyy = hy - hr * hp * 0.3;
    // hair
    if (r.hair === 'round')     put('ball', k2, 0, hyy + hr * 0.35, hz - hr * 0.15, hp, 0, 0, hr * 2.15, hr * 1.6, hr * 2.15, r.hairColor);
    else if (r.hair === 'flat') put('ball', k2, 0, hyy + hr * 0.55, hz,             hp, 0, 0, hr * 2.1,  hr * 0.9, hr * 2.1,  r.hairColor);
    else hide('ball', k2);
    // hat
    if (r.hat === 'cap') {
        put('cyl', c6 + 4, 0, hyy + hr * 0.75, hz,            hp, 0, 0, hr * 2.2, hr * 0.6,  hr * 2.2, r.hatColor);
        put('cyl', c6 + 5, 0, hyy + hr * 0.6,  hz + hr * 1.1, hp, 0, 0, hr * 1.6, hr * 0.15, hr * 1.2, r.hatColor);
        hide('cone', slot);
    } else if (r.hat === 'brim') {
        put('cyl', c6 + 4, 0, hyy + hr * 0.55, hz, hp, 0, 0, hr * 3.4, hr * 0.15, hr * 3.4, r.hatColor);
        put('cyl', c6 + 5, 0, hyy + hr * 1.0,  hz, hp, 0, 0, hr * 1.9, hr * 0.8,  hr * 1.9, r.hatColor);
        hide('cone', slot);
    } else if (r.hat === 'cone') {
        hide('cyl', c6 + 4); hide('cyl', c6 + 5);
        put('cone', slot, 0, hyy + hr * 0.9 + 0.22, hz, hp, 0, 0, hr * 1.7, 0.5, hr * 1.7, r.hatColor);
    } else { hide('cyl', c6 + 4); hide('cyl', c6 + 5); hide('cone', slot); }
    // accessories
    for (let i = 0; i < 5; i++) hide('box', b5 + i);
    hide('ball', k2 + 1);
    if (r.acc === 'phone')         put('box', b5, 0.12, 1.3 + bob, 0.3, -0.6, 0, 0, 0.09, 0.15, 0.02, 0x1e1e22);
    else if (r.acc === 'camera')   put('box', b5, 0, 1.22 + bob, 0.26, 0, 0, 0, 0.18, 0.12, 0.12, 0x2a2a2e);
    else if (r.acc === 'backpack') put('box', b5, 0, 1.1 + bob, -0.3, 0, 0, 0, 0.38, 0.44, 0.2, r.accColor);
    else if (r.acc === 'stroller') {
        put('box', b5,     0, 0.55, 0.95, 0, 0, 0, 0.5, 0.4, 0.7, r.accColor);
        put('box', b5 + 1, 0, 0.85, 1.12, 0, 0, 0, 0.5, 0.28, 0.36, 0x2a2a2e);
        put('box', b5 + 2, 0, 0.92, 0.55, 0.3, 0, 0, 0.5, 0.04, 0.04, 0x2a2a2e);
        put('box', b5 + 3, -0.27, 0.15, 0.75, 0, 0, 0, 0.06, 0.3, 0.3, 0x2a2a2e);
        put('box', b5 + 4,  0.27, 0.15, 0.75, 0, 0, 0, 0.06, 0.3, 0.3, 0x2a2a2e);
    } else if (r.acc === 'balloon') {
        const bx = 0.36 + Math.sin(t * 1.3 + slot) * 0.05;
        put('ball', k2 + 1, bx, 2.35 + bob, 0.05, 0, 0, 0, 0.42, 0.5, 0.42, r.accColor);
        put('box', b5, bx * 0.9, 1.65 + bob, 0.05, 0, 0, 0, 0.015, 1.1, 0.015, 0xdddddd);
    }
}
