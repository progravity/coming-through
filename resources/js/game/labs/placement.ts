/**
 * The placement view: one fixture or building standing in its place on the real promenade, with
 * what governs where it stands drawn over it -- the stretch of edge it keeps clear (the railing gap
 * a building opens, the stretch of bench rhythm a cart takes), its spots relative to the path, its
 * collider or its footprint, and a ruler along the walkway.
 *
 * Entity-agnostic like the rest of the lab shell: it asks an entity for its `sites` and draws what
 * comes back. The world it draws is `buildWorld`, the game's own, under the look the game ships in,
 * so the object in the middle of the frame is the object a player walks past -- painted as the
 * promenade paints it, which a turntable's seed does not.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { hasProperty } from '../entity.ts';
import { InfoPanel } from '../inspect/info.ts';
import type { Control, InfoSection, Inspectable, Site, SiteSpan } from '../inspect/inspectable.ts';
import { MARK, arrow, capsuleLoop, onTop, spotAt } from '../inspect/markers.ts';
import { byId } from '../inspect/registry.ts';
import { resolveIn } from '../inspect/state.ts';
import { lookNamed } from '../render/look.ts';
import { buildWorld } from '../world/index.ts';
import { edgePlans } from '../world/plan.ts';
import { PATH, newPathFrame, newWorldPoint, pathDir, pathPlace } from '../world/path.ts';
import { LabChrome } from './chrome.ts';
import { button, card, el, label, segmented } from './dom.ts';
import { primaries } from './labs.ts';
import type { Lab, LabView } from './labs.ts';

/** The look a run of the game ships under (`DEFAULT_LOOK` in game.ts). */
const SHIPPED_LOOK = 'toon-bare';
/** How much of the walkway either side of the object the ruler covers. */
const REACH = 20;
/** How far either side an entity counts as a neighbor. */
const NEAR = 12;

const OVERLAYS = [
    { id: 'spans', label: 'kept-clear edge', on: true },
    { id: 'spots', label: 'spots', on: true },
    { id: 'collider', label: 'collider / footprint', on: true },
    { id: 'ruler', label: 'path ruler', on: true },
    { id: 'facing', label: 'orientation', on: false },
] as const;
type OverlayId = (typeof OVERLAYS)[number]['id'];

const SPOT_COLORS: Readonly<Record<string, number>> = { service: MARK.service, staff: MARK.staff, seating: MARK.seating };
const n2 = (v: number): string => v.toFixed(2);

/** The control that picks a type: the entity's first enum that rebuilds (`type` for a cart, `kind` for furniture). */
const typeControl = (e: Inspectable): Extract<Control, { kind: 'enum' }> | undefined =>
    e.controls.find((c): c is Extract<Control, { kind: 'enum' }> => c.kind === 'enum' && c.rebuilds === true);

/** A flat band along the path's edge from `sMin` to `sMax`, straddling the edge on one side. */
function band(span: SiteSpan, side: 1 | -1, color: number): THREE.Mesh {
    const f = newPathFrame(), p = newWorldPoint(), pos: number[] = [];
    const steps = Math.max(2, Math.ceil((span.sMax - span.sMin) / 0.25));
    for (let i = 0; i < steps; i++) {
        const a = span.sMin + ((span.sMax - span.sMin) * i) / steps;
        const b = span.sMin + ((span.sMax - span.sMin) * (i + 1)) / steps;
        const corner = (s: number, dn: number): number[] => {
            PATH.frameAt(s, f);
            pathPlace(f, side * (f.w + dn), 0.03, p);
            return [p.x, p.y, p.z];
        };
        const a0 = corner(a, -0.6), a1 = corner(a, 0.6), b0 = corner(b, -0.6), b1 = corner(b, 0.6);
        pos.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return onTop(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, opacity: 0.45, side: THREE.DoubleSide })), 9);
}

/** The centerline and both edges for `REACH` meters either side of `s`, ticked every meter and every five. */
function ruler(s0: number): THREE.LineSegments {
    const f = newPathFrame(), p = newWorldPoint(), q = newWorldPoint(), pts: number[] = [];
    const push = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): void => { pts.push(a.x, a.y, a.z, b.x, b.y, b.z); };
    const from = Math.floor(s0 - REACH), to = Math.ceil(s0 + REACH);
    for (let s = from; s < to; s += 0.5) {
        for (const k of [0, -1, 1]) {
            PATH.frameAt(s, f); pathPlace(f, k * f.w, 0.03, p);
            PATH.frameAt(s + 0.5, f); pathPlace(f, k * f.w, 0.03, q);
            push(p, q);
        }
    }
    for (let s = from; s <= to; s++) {
        const long = s % 5 === 0, len = long ? 0.7 : 0.3;
        PATH.frameAt(s, f);
        for (const side of [-1, 1]) {
            pathPlace(f, side * (f.w - len), 0.03, p); pathPlace(f, side * f.w, 0.03, q); push(p, q);
        }
        if (long) { pathPlace(f, -0.35, 0.03, p); pathPlace(f, 0.35, 0.03, q); push(p, q); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return onTop(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.55 })), 8);
}

/** Everything with a footprint near the site, read off the same plan the world draws and the crowd walks round. */
function neighbors(site: Site): InfoSection {
    const plan = edgePlans();
    const rows = plan.entities.flatMap(e => {
        const sol = plan.solids.find(x => x.piece === e.piece);
        if (sol === undefined) return [];
        const ds = sol.s - site.solid.s;
        if (Math.abs(ds) > NEAR || (Math.abs(ds) < 1e-6 && Math.abs(sol.n - site.solid.n) < 1e-6)) return [];
        return [{ ds, cells: [e.meta.type, e.meta.family, `${ds >= 0 ? '+' : ''}${n2(ds)}`, n2(sol.n), hasProperty(e.meta, 'static-obstacle') ? 'yes' : 'no'] }];
    }).sort((a, b) => a.ds - b.ds);
    return {
        id: 'geometry', title: 'Neighbors',
        tables: [{ caption: `everything with a footprint within ${NEAR} m along the path`, columns: ['type', 'family', 'Δs', 'n', 'collider'], rows: rows.map(r => r.cells) }],
    };
}

export async function startPlacement(lab: Lab): Promise<void> {
    const q = new URLSearchParams(location.search);
    const resolved = resolveIn(location.search, lab);
    const entity = resolved.entity.modelOf !== undefined ? (byId(resolved.entity.modelOf) ?? resolved.entity) : resolved.entity;
    const choices = primaries(lab).filter(e => e.sites !== undefined);
    const tc = typeControl(entity);
    const types = (tc?.options ?? []).filter(o => o !== 'seed');
    const asked = q.get(tc?.id ?? '') ?? String(resolved.pinned[tc?.id ?? ''] ?? '');
    const type = types.includes(asked) ? asked : (types[0] ?? '');
    const sites = entity.sites?.(tc === undefined ? {} : { [tc.id]: type }) ?? [];
    const index = Math.max(0, Math.min(sites.length - 1, Math.round(Number(q.get('site') ?? 1) - 1) || 0));
    const site = sites[index];
    const shown = new Set<OverlayId>(OVERLAYS.filter(o => o.on).map(o => o.id));
    for (const o of OVERLAYS) { const raw = q.get(o.id); if (raw === '1') shown.add(o.id); else if (raw === '0') shown.delete(o.id); }

    new LabChrome({
        lab, view: 'placement', source: 'primitives',
        modelBlocked: `${entity.title}: no model yet. Primitives only for now (see STRUCTURE_MODELS in render/model-file.ts).`,
        onView: (v: LabView) => {
            const t = new URLSearchParams();
            if (v !== 'single') t.set('view', v);
            if (entity.id !== lab.entities[0]?.id) t.set('entity', entity.id);
            if (tc !== undefined && type !== '') t.set(tc.id, type);
            location.search = t.toString();
        },
        onSource: () => {},
    });

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.domElement.classList.add('stage');
    document.body.appendChild(renderer.domElement);
    const world = buildWorld();
    world.dress(lookNamed(SHIPPED_LOOK));
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.maxPolarAngle = Math.PI / 2 - 0.03;

    // ---------- overlays ----------
    const layers = new Map<OverlayId, THREE.Group>(OVERLAYS.map(o => [o.id, new THREE.Group()]));
    for (const g of layers.values()) world.scene.add(g);
    function frameOn(s: Site): void {
        const f = PATH.frameAt(s.s, newPathFrame());
        const at = pathPlace(f, s.n, 1.2, newWorldPoint());
        const side = Math.sign(s.n) || 1;
        const from = pathPlace(f, s.n - side * 15, 9, newWorldPoint());
        const along = pathDir(f, -7, 0, newWorldPoint());
        camera.position.set(from.x + along.x, from.y, from.z + along.z);
        orbit.target.set(at.x, at.y, at.z);
        orbit.update();
    }
    if (site !== undefined) {
        for (const span of site.spans) {
            for (const side of span.side === undefined ? [-1, 1] as const : [span.side]) layers.get('spans')?.add(band(span, side, MARK.span));
        }
        for (const p of site.spots) layers.get('spots')?.add(spotAt(p, SPOT_COLORS[p.name] ?? MARK.facing));
        layers.get('collider')?.add(capsuleLoop(site.solid, site.collider ? MARK.collider : 0xb9b6ad, site.collider ? 1 : 0.8));
        layers.get('ruler')?.add(ruler(site.s));
        const f = PATH.frameAt(site.s, newPathFrame());
        const p = pathPlace(f, site.n, 0.05, newWorldPoint());
        const d = pathDir(f, 0, site.facing, newWorldPoint());
        const a = arrow(2.2, MARK.facing, new THREE.Vector3(d.x, d.y, d.z));
        a.position.set(p.x, p.y, p.z);
        layers.get('facing')?.add(a);
        const cam = (q.get('orbit') ?? '').split(',').map(Number);
        if (cam.length === 6 && cam.every(Number.isFinite)) {
            camera.position.set(cam[0], cam[1], cam[2]);
            orbit.target.set(cam[3], cam[4], cam[5]);
            orbit.update();
        } else frameOn(site);
    }
    const applyOverlays = (): void => { for (const [id, g] of layers) g.visible = shown.has(id); };
    applyOverlays();

    // ---------- cards ----------
    const ui = el('div', 'lab-ui');
    const left = el('div', 'card lab-read');
    const info = new InfoPanel();
    left.append(info.el);
    const { card: right, body } = card('lab-ctl', `${lab.title} lab`);
    const keys = el('div', 'card lab-keys', 'drag turn · right-drag pan · wheel zoom');
    ui.append(left, right, keys);
    document.body.append(ui);

    const go = (p: Record<string, string>): void => {
        const t = new URLSearchParams({ view: 'placement', ...p });
        location.search = t.toString();
    };
    if (choices.length > 1) {
        const pick = segmented(choices.map(e => e.id), id => go({ entity: id }), id => byId(id)?.title ?? id);
        pick.set(entity.id);
        body.append(label('entity'), pick.el);
    }
    if (tc !== undefined && types.length > 0) {
        const seg = segmented(types, v => go({ entity: entity.id, [tc.id]: v }));
        seg.set(type);
        body.append(label(tc.label), seg.el);
    }
    if (sites.length > 1) {
        const nums = sites.map((_, i) => String(i + 1));
        const seg = segmented(nums, v => go({ entity: entity.id, ...(tc === undefined ? {} : { [tc.id]: type }), site: v }), v => `#${v}`);
        seg.set(String(index + 1));
        body.append(label(`placement (${sites.length} on the promenade)`), seg.el);
    }
    const btns = new Map<OverlayId, HTMLButtonElement>();
    const ov = el('div', 'row');
    for (const o of OVERLAYS) {
        const b = button(o.label, () => { if (shown.has(o.id)) shown.delete(o.id); else shown.add(o.id); applyOverlays(); sync(); });
        btns.set(o.id, b);
        ov.append(b);
    }
    body.append(label('overlays'), ov, label('camera'), el('div', 'row'));
    (body.lastElementChild as HTMLElement).append(button('frame it', () => { if (site !== undefined) { frameOn(site); sync(); } }));
    const legend = el('div', 'legend');
    for (const [name, c] of [['kept-clear edge', MARK.span], ['collider', MARK.collider], ['footprint, no collider', 0xb9b6ad], ['service', MARK.service], ['staff', MARK.staff], ['seating', MARK.seating]] as const) {
        const s = el('span');
        const sw = el('i', 'sw');
        sw.style.background = '#' + c.toString(16).padStart(6, '0');
        s.append(sw, document.createTextNode(name));
        legend.append(s);
    }
    body.append(label('key'), legend);
    body.append(el('p', 'hint', 'The whole promenade is the game\'s own, painted as it is in every run. The ruler ticks every meter along both edges, longer every five, with a cross tick on the centerline.'));

    if (site === undefined) {
        info.empty(entity.title, `Nothing of this kind stands on the promenade${type === '' ? '' : ` as a ${type}`}.`);
    } else {
        const d = Math.abs(site.solid.n) - PATH.halfWidth(site.solid.s);
        const keeps = site.spans.length === 0 ? 'nothing: it stands in the gaps the other layers leave'
            : site.spans.map(s => `s ${n2(s.sMin)} to ${n2(s.sMax)} (${n2(s.sMax - s.sMin)} m) on ${s.side === undefined ? 'both sides' : s.side > 0 ? 'the +n side' : 'the −n side'}: ${s.clears}`).join('; ');
        info.show({
            title: site.title,
            sub: `placement ${index + 1} of ${sites.length} · ${site.label}`,
            rows: [
                ['stands at', `s ${n2(site.solid.s)} · n ${n2(site.solid.n)}`],
                ['edge', `${d < 0 ? `${n2(-d)} m inside` : `${n2(d)} m outside`} the path's edge (half width ${n2(PATH.halfWidth(site.solid.s))} m)`],
                ['facing', site.facing > 0 ? '+n' : '−n'],
                ['collider', site.collider ? `capsule · half ${n2(site.solid.half)} · r ${n2(site.solid.r)}` : 'none: its footprint is drawn gray'],
                ['keeps clear', keeps],
            ],
            sections: [...site.sections, neighbors(site)],
        });
    }

    // ---------- the address bar ----------
    function sync(): void {
        for (const [id, b] of btns) b.classList.toggle('on', shown.has(id));
        const t = new URLSearchParams();
        t.set('view', 'placement');
        if (entity.id !== lab.entities[0]?.id) t.set('entity', entity.id);
        if (tc !== undefined && type !== '') t.set(tc.id, type);
        if (index > 0) t.set('site', String(index + 1));
        for (const o of OVERLAYS) if (shown.has(o.id) !== o.on) t.set(o.id, shown.has(o.id) ? '1' : '0');
        const p = camera.position, tg = orbit.target;
        t.set('orbit', [p.x, p.y, p.z, tg.x, tg.y, tg.z].map(v => String(Math.round(v * 100) / 100)).join(','));
        history.replaceState(null, '', `${location.pathname}?${t}`);
    }
    orbit.addEventListener('end', sync);
    sync();

    function resize(): void {
        renderer.setSize(innerWidth, innerHeight);
        camera.aspect = innerWidth / Math.max(1, innerHeight);
        camera.updateProjectionMatrix();
    }
    addEventListener('resize', resize);
    resize();
    renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

    function frame(now: number): void {
        requestAnimationFrame(frame);
        orbit.update();
        world.animate(now / 1000);
        renderer.render(world.scene, camera);
    }
    requestAnimationFrame(frame);
}
