/**
 * The inspection shell: a stage, a fixed camera, a turntable, and whatever the entity says it is.
 *
 * Reached only through `?inspect=1` (one thing) or `?inspect=row` (several side by side), with
 * `&entity=` choosing what. It knows the registry and the interface and nothing else: there is no
 * archetype in this file, no cart, no bench. What is on the stage builds itself through the game's
 * own assembler and hands back parts, a readout and a line of status; everything else here -- the
 * spin, the pause, the seed, the bounding boxes, the address bar -- is the same for all of them.
 *
 * Determinism: the shell reads no `spawn` or `behavior` draw, never builds a `Simulation`, and is
 * loaded by a dynamic import that a normal run never reaches.
 */
import * as THREE from 'three';
import { parseSeed } from '../core/rng.ts';
import { MAX_CATCHUP_STEPS, SIM_DT } from '../core/time.ts';
import { LOOK_NAMES, lookNamed } from '../render/look.ts';
import { PartGizmos, measure, newBounds } from './gizmos.ts';
import { GIZMOS, INK, controlOf, findKey } from './inspectable.ts';
import type { ControlValue, DrawnPart, Inspectable, Readout } from './inspectable.ts';
import { Panel } from './panel.ts';
import { DEFAULT_ENTITY, byId } from './registry.ts';
import { REST, Stage, ZOOM_STEP, clampView, zoomAt } from './stage.ts';
import type { Extent } from './stage.ts';
import { readState, writeState } from './state.ts';
import type { InspectState, PanelId } from './state.ts';

const TAU = Math.PI * 2;
/** Turntable rate in radians per second: slow enough to read a silhouette as it comes round. */
const SPIN = 0.4;

/** How fast a wheel notch magnifies. The step the keys and buttons take is the stage's own. */
const WHEEL_RATE = 0.0015;

const wrapTau = (a: number): number => ((a % TAU) + TAU) % TAU;
const wrap01 = (v: number): number => ((v % 1) + 1) % 1;
const cycle = (options: readonly string[], current: string, step: number): string =>
    options[(options.indexOf(current) + step + options.length) % options.length];

export function startInspector(mode: string): void {
    const state: InspectState = readState(mode, location.search);
    const entity = byId(state.entity) as Inspectable;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    document.body.appendChild(renderer.domElement);

    const stage = new Stage();
    const cast = entity.mount(stage.scene);
    const gizmos = new PartGizmos(stage.scene);
    const bounds = newBounds();

    let xs: number[] = [];
    /** Anchors for the probe draw: every exhibit at the origin, so each one measures only itself. */
    const origins: number[] = [];
    /** What the probe measured, handed to the stage so it frames what is actually on it. */
    const extents: Extent[] = [];
    /** Highest silhouette seen per exhibit since the last rebuild, so heights settle and hold. */
    const tops: number[] = [];
    /** Every drawn part this frame, for the gizmo layer. Filled only when the gizmos are on. */
    const scratch: DrawnPart[] = [];
    let needsReadout = true;
    let clock = 0, acc = 0, last = performance.now();

    const count = (): number => (state.mode === 'row' ? entity.row : 1);

    /**
     * Build the cast, measure it, and frame what was measured.
     *
     * The measuring is a **probe draw**: the same `draw` the frame loop makes, with every anchor at
     * the origin, so each exhibit reports its own size free of where it is about to stand. Asking
     * the geometry is the honest way round -- the shell is already drawing the thing and already
     * measuring every part of it, and a `size` declared on `Inspectable` would be a second statement
     * of the same fact with nothing keeping the two in step. It also settles in no frames at all,
     * where a high-water mark taken from the live draw would chase a layout that its own
     * measurements had moved. One extra draw per rebuild, and `draw` writes nothing the next frame
     * does not overwrite.
     */
    function rebuild(): void {
        const n = count();
        cast.rebuild(state.seed, n, state.controls);
        while (origins.length < n) origins.push(0);
        cast.draw(clock, origins, state.yaw);
        extents.length = 0;
        for (let i = 0; i < n; i++) {
            const parts = cast.parts(i);
            measure(parts, 0, parts.length, bounds);
            extents.push({ radius: bounds.radius, minY: bounds.minY, maxY: bounds.maxY });
        }
        xs = stage.layout(extents);
        tops.length = 0;
        for (let i = 0; i < n; i++) tops.push(0);
        needsReadout = true;
        // The exhibits are new, so whatever look was on has to be put back on them -- and whatever
        // the overlay buttons say has to be put back over the top of that.
        dressAll();
    }

    /**
     * Put the current look on everything the stage is holding, then let the overlays have the last
     * word. Called on a look change and after a rebuild.
     *
     * The second half is the load-bearing one. `dress` sets every surface's ink to what the look
     * asks for, and **an absent `inkOn` asks for the shipped line** -- so a dress alone turns the
     * ink back on under `current`, which is the shipped look and four of the six. Re-asserting the
     * overlays over the top is what makes the `ink` button a switch rather than a suggestion: it
     * survives a rebuild, and it survives a look with no opinion about the line.
     */
    function dressAll(): void {
        cast.dress(lookNamed(state.look));
        cast.overlays(state.overlays);
    }

    /**
     * Move the `ink` button to match the look just chosen, so the two cannot disagree.
     *
     * A look that turns the line off and a button that says it is on cannot both be right: the look
     * wins and the button moves, which is how you see why the line went away. An absent `inkOn`
     * means the shipped line, so `current` brings the button back on -- that is the same
     * "absent means as shipped" rule every surface dresses by, applied to the switch.
     *
     * **Choosing a look is the only thing that may do this.** A rebuild is not a choice, and a
     * start-up is not one either: the URL states the look and the button separately, and the
     * button is the more specific of the two. Reconciling there is what used to strip `?ink=0` out
     * of a reloaded address bar and put the line back after every `[`.
     */
    function syncInk(): void {
        const wants = lookNamed(state.look)?.inkOn ?? true;
        if (wants !== state.overlays.has(INK)) toggleOverlay(INK);
    }

    /** Apply a change, rebuilding the cast only when it must. */
    function patch(p: Partial<InspectState>, rebuilds = false): void {
        let must = rebuilds;
        if (p.mode !== undefined && p.mode !== state.mode) must = true;
        if (p.seed !== undefined && p.seed !== state.seed) must = true;
        // Merged rather than replaced: the cast keeps the object it was handed at rebuild.
        if (p.controls !== undefined) Object.assign(state.controls, p.controls);
        if (p.mode !== undefined) state.mode = p.mode;
        if (p.seed !== undefined) state.seed = p.seed;
        if (p.paused !== undefined) state.paused = p.paused;
        if (p.yaw !== undefined) state.yaw = wrapTau(p.yaw);
        if (p.view !== undefined) { state.view = clampView(p.view); stage.setView(state.view); }
        if (p.overlays !== undefined) {
            state.overlays = p.overlays;
            gizmos.setVisible(state.overlays.has(GIZMOS));
            cast.overlays(state.overlays);
        }
        // Reconciling the button belongs here rather than in `dressAll`, which a rebuild also calls:
        // a rebuild is not a look change, and treating it as one is what took the ink away from
        // anyone who had switched it off by hand.
        if (p.look !== undefined) { state.look = p.look; syncInk(); dressAll(); }
        if (p.minimised !== undefined) state.minimised = p.minimised;
        panel.sync(state);
        // After `sync`, which is what put the class on the card: `reframe` measures what the cards
        // actually cover, so it has to run once the DOM already reflects the change. Not a rebuild
        // -- the cast is exactly the same, it just has more room to stand in.
        if (p.minimised !== undefined) reframe();
        if (must) { rebuild(); reframe(); }
        // Once per change, never per frame: a held arrow key or a slider drag reaches here many
        // times a second, and browsers rate-limit replaceState -- Safari throws past 100 in 30s.
        writeState(state, entity);
    }

    /**
     * Set one control. Every write to a control goes through here, which is what lets the gate rule
     * live in one place: setting a gated scalar turns its gate on, so the slider and the nudge keys
     * cannot drift apart. A rebuild is owed if either the scalar or the gate it just switched asked
     * for one -- miss the second and a declared `rebuilds` would hold for the drag and not the key.
     */
    function setControl(id: string, v: ControlValue): void {
        const c = controlOf(entity, id);
        const gate = c?.kind === 'scalar' ? c.gate : undefined;
        const controls = gate === undefined ? { [id]: v } : { [id]: v, [gate]: true };
        const rebuilds = c?.rebuilds === true
            || (gate !== undefined && controlOf(entity, gate)?.rebuilds === true);
        patch({ controls }, rebuilds);
    }

    function toggleOverlay(id: string): void {
        const next = new Set(state.overlays);
        if (next.has(id)) next.delete(id); else next.add(id);
        patch({ overlays: next });
    }

    /** Next or previous variation: whatever the entity said browsing means. */
    function stepVariation(delta: number): void {
        if (entity.stepping === 'seed') { patch({ seed: (state.seed + delta) >>> 0 }); return; }
        const c = controlOf(entity, entity.stepping);
        if (c === undefined || c.kind !== 'enum') return;
        setControl(c.id, cycle(c.options, String(state.controls[c.id]), delta));
    }

    /** Switching entity reloads: a fresh page is the cheapest clean stage there is. */
    function setEntity(id: string): void {
        if (id === state.entity) return;
        const q = new URLSearchParams();
        q.set('inspect', state.mode === 'row' ? 'row' : '1');
        q.set('seed', String(state.seed));
        if (id !== DEFAULT_ENTITY) q.set('entity', id);
        // The view is dimensionless, so it carries: 4x on a person is 4x on a cart.
        if (state.view.zoom !== REST.zoom) q.set('zoom', state.view.zoom.toFixed(2));
        location.search = q.toString();
    }

    const panel = new Panel({
        patch: p => patch(p),
        setControl,
        toggleOverlay,
        step: stepVariation,
        setSeedText: (text: string) => { if (text.trim() !== '') patch({ seed: parseSeed(text) }); },
        setEntity,
        setLook: (slug: string) => patch({ look: slug }),
        zoom: stepZoom,
        resetView: () => patch({ view: REST }),
        togglePanel,
    });
    panel.setEntity(entity);

    // ---------- input: drag or arrows to hold an angle, wheel and a modified drag to look closer ----------
    let dragging = -1, dragX = 0, dragY = 0, panning = false;
    const canvas = renderer.domElement;
    canvas.style.touchAction = 'none';
    /** Where a pointer is on the canvas, as -1..1 from the middle, with y up as the world has it. */
    const at = (e: PointerEvent | WheelEvent): { u: number; v: number } => {
        const r = canvas.getBoundingClientRect();
        return {
            u: (2 * (e.clientX - r.left)) / r.width - 1,
            v: 1 - (2 * (e.clientY - r.top)) / r.height,
        };
    };
    canvas.addEventListener('pointerdown', e => {
        dragging = e.pointerId; dragX = e.clientX; dragY = e.clientY;
        // Shift or the right button pans; a plain drag still turns the thing on the stage.
        panning = e.shiftKey || e.button === 2;
        canvas.setPointerCapture(e.pointerId);
        // Turning is how you hold an angle, so it stops the turntable rather than fighting it.
        // Panning does not: it has no quarrel with the spin.
        if (!panning && !state.paused) patch({ paused: true });
    });
    canvas.addEventListener('pointermove', e => {
        if (e.pointerId !== dragging) return;
        const dx = e.clientX - dragX, dy = e.clientY - dragY;
        dragX = e.clientX; dragY = e.clientY;
        if (!panning) { state.yaw = wrapTau(state.yaw + dx * 0.008); return; }
        // A pan is a fraction of what the resting shot showed, and the zoomed shot is exactly
        // `zoom` times smaller -- so a pixel is worth `2 / (size * zoom)` of it whatever is on
        // stage, and the content follows the pointer rather than fleeing it.
        const { zoom } = state.view;
        patch({ view: {
            zoom,
            panX: state.view.panX - (dx * 2) / (canvas.clientWidth * zoom),
            panY: state.view.panY + (dy * 2) / (canvas.clientHeight * zoom),
        } });
    });
    const endDrag = (e: PointerEvent): void => { if (e.pointerId === dragging) { dragging = -1; panning = false; } };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    // Right-dragging to pan would otherwise leave a menu open over the stage on the way out.
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const { u, v } = at(e);
        // Multiplicative, so a notch is worth the same fraction at every zoom, and about the
        // pointer, so you put it on the thing you want and roll.
        patch({ view: zoomAt(state.view, state.view.zoom * Math.exp(-e.deltaY * WHEEL_RATE), u, v) });
    }, { passive: false });

    /** Shut a card down to its title, or open it again. */
    function togglePanel(id: PanelId): void {
        const next = new Set(state.minimised);
        if (next.has(id)) next.delete(id); else next.add(id);
        patch({ minimised: next });
    }

    /** Zoom a step about the middle of the stage, which is where a key press has to aim. */
    function stepZoom(by: number): void {
        patch({ view: zoomAt(state.view, state.view.zoom * by, 0, 0) });
    }

    /** The entity's own half of the keyboard, from its declaration. */
    function declaredKey(key: string, shift: boolean): boolean {
        const hit = findKey(entity, key);
        if (hit === undefined) return false;
        if (hit.kind === 'overlay') { toggleOverlay(hit.overlay.id); return true; }
        if (hit.kind === 'nudge') {
            const c = hit.control;
            setControl(c.id, wrap01(Number(state.controls[c.id]) + hit.delta * 0.02));
            return true;
        }
        const c = hit.control;
        if (c.kind === 'toggle') { setControl(c.id, state.controls[c.id] !== true); return true; }
        if (c.kind === 'enum') {
            setControl(c.id, cycle(c.options, String(state.controls[c.id]), shift ? -1 : 1));
            return true;
        }
        return false;
    }

    addEventListener('keydown', e => {
        if (e.target instanceof HTMLInputElement) return;
        const turn = (e.shiftKey ? 15 : 2) * (Math.PI / 180);
        switch (e.key) {
            case 'ArrowLeft': patch({ paused: true, yaw: state.yaw - turn }); break;
            case 'ArrowRight': patch({ paused: true, yaw: state.yaw + turn }); break;
            case '[': stepVariation(-1); break;
            case ']': stepVariation(1); break;
            case ' ': patch({ paused: !state.paused }); break;
            case '1': patch({ mode: 'single' }); break;
            case '2': patch({ mode: 'row' }); break;
            case '0': patch({ view: REST }); break;
            case 'h': case 'H': togglePanel('ctl'); break;
            case '+': case '=': stepZoom(ZOOM_STEP); break;
            case '-': case '_': stepZoom(1 / ZOOM_STEP); break;
            case 'l': case 'L': patch({ look: cycle(LOOK_NAMES, state.look, 1) }); break;
            default: if (!declaredKey(e.key, e.shiftKey)) return;
        }
        e.preventDefault();
    });

    /** Re-frame against the chrome's current width; the cards differ between the two sub-modes. */
    function reframe(): void {
        const { left, right } = panel.insets();
        renderer.setSize(innerWidth, innerHeight);
        stage.resize(innerWidth, innerHeight, left, right);
    }
    addEventListener('resize', reframe);

    // ---------- start ----------
    gizmos.setVisible(state.overlays.has(GIZMOS));
    cast.overlays(state.overlays);
    // No dressing here: `rebuild` does it, along with re-asserting these overlays over the top. The
    // URL's `look` and its `ink` are two statements of equal standing and the button is the more
    // specific, so a URL that says both is honoured as written -- which is what makes `?ink=0`
    // reload as `?ink=0`. The tool always writes both together, so the pair can only disagree in a
    // hand-typed URL, where the button is the reading that survives.
    stage.setView(state.view);
    panel.sync(state);
    rebuild();
    reframe();
    writeState(state, entity);

    function frame(now: number): void {
        requestAnimationFrame(frame);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;

        // Paused holds the whole frame still -- spin, gait and idle clock -- so two renders taken
        // either side of a change are pixel-comparable.
        if (!state.paused) {
            clock += dt;
            if (dragging < 0) state.yaw = wrapTau(state.yaw + SPIN * dt);
            acc = Math.min(acc + dt, MAX_CATCHUP_STEPS * SIM_DT);
            while (acc >= SIM_DT) { cast.step(); acc -= SIM_DT; }
        }

        const n = count();
        cast.draw(clock, xs, state.yaw);

        const showGizmos = state.overlays.has(GIZMOS);
        scratch.length = 0;
        for (let i = 0; i < n; i++) {
            const parts = cast.parts(i);
            measure(parts, 0, parts.length, bounds);
            stage.setShadow(i, bounds.footMinX, bounds.footMaxX, bounds.footMinZ, bounds.footMaxZ);
            if (bounds.maxY > tops[i] + 1e-4) { tops[i] = bounds.maxY; needsReadout = true; }
            if (showGizmos) for (const p of parts) scratch.push(p);
        }
        stage.trimShadows(n);
        gizmos.update(scratch, scratch.length);

        if (needsReadout) {
            if (state.mode === 'row') {
                const rs: Readout[] = [];
                for (let i = 0; i < n; i++) rs.push(cast.readout(i, tops[i]));
                panel.describeRow(rs);
            } else {
                panel.describe(cast.readout(0, tops[0]));
            }
            needsReadout = false;
        }
        panel.setStatus((state.yaw * 180) / Math.PI, state, cast.status?.() ?? '');
        renderer.render(stage.scene, stage.camera);
    }
    requestAnimationFrame(frame);
}
