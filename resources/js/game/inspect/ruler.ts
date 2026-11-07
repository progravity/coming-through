/**
 * A height ruler beside each exhibit: a bar from the ground up, ticked every ten centimeters and
 * marked every half meter, with a line across at the exhibit's measured height and that height
 * written above it. Shell-owned and entity-agnostic: it is given where an exhibit stands, how tall
 * it measured and how far it sweeps, and knows nothing else about it.
 *
 * It stands just to the left of what it measures, in the exhibit's own plane, so it reads against
 * the figure at the figure's depth -- a ruler hung further back would read short by the perspective
 * it lost, and a head line that misses the head by a few centimeters is worse than none.
 */
import * as THREE from 'three';

/** How far left of an exhibit's swept edge the bar stands. */
const OFF = 0.08;
const COLOR = 0xe8c34a;

interface Ruler { group: THREE.Group; top: number; half: number; scale: number }

export class HeightRulers {
    private readonly group = new THREE.Group();
    private readonly rulers: Ruler[] = [];
    private readonly lineMat = new THREE.LineBasicMaterial({ color: COLOR, transparent: true, opacity: 0.85 });
    private readonly tickMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 });
    private readonly textures = new Map<string, THREE.CanvasTexture>();

    constructor(scene: THREE.Scene) {
        this.group.visible = false;
        scene.add(this.group);
    }

    setVisible(on: boolean): void { this.group.visible = on; }

    /**
     * Stand exhibit `i`'s ruler at `x`, for something `top` meters tall sweeping `half` either side.
     * Rebuilt only when the height or the sweep moves by more than half a centimeter; otherwise moved.
     */
    set(i: number, x: number, top: number, half: number, scale: number): void {
        let r = this.rulers[i];
        if (r === undefined || Math.abs(r.top - top) > 0.005 || Math.abs(r.half - half) > 0.005 || r.scale !== scale) {
            if (r !== undefined) this.dispose(r);
            r = { group: this.build(top, half, scale), top, half, scale };
            this.rulers[i] = r;
            this.group.add(r.group);
        }
        r.group.visible = true;
        r.group.position.set(x - half - OFF, 0, 0);
    }

    /** Hide rulers left over from a longer row. */
    trim(count: number): void {
        for (let i = count; i < this.rulers.length; i++) { const r = this.rulers[i]; if (r !== undefined) r.group.visible = false; }
    }

    private build(top: number, half: number, scale: number): THREE.Group {
        const g = new THREE.Group();
        const height = Math.max(0.5, Math.ceil((top + 0.1) * 10) / 10);
        const ticks: number[] = [0, 0, 0, 0, height, 0];
        for (let k = 1; k * 0.1 <= height + 1e-6; k++) {
            const y = k * 0.1, major = k % 5 === 0;
            ticks.push(0, y, 0, major ? 0.12 : 0.05, y, 0);
        }
        const tg = new THREE.BufferGeometry();
        tg.setAttribute('position', new THREE.Float32BufferAttribute(ticks, 3));
        g.add(new THREE.LineSegments(tg, this.tickMat));
        // The measured height, across the exhibit, and written above the bar.
        const head = new THREE.BufferGeometry();
        head.setAttribute('position', new THREE.Float32BufferAttribute([0, top, 0, half * 2 + OFF, top, 0], 3));
        g.add(new THREE.LineSegments(head, this.lineMat));
        const label = this.label(`${top.toFixed(2)} m`, scale);
        label.position.set(0.16 * scale, top + 0.08 * scale, 0);
        g.add(label);
        for (let m = 0.5; m <= height - 0.25 + 1e-6; m += 0.5) {
            if (Math.abs(m - top) < 0.12) continue;
            const l = this.label(`${m.toFixed(1)}`, scale * 0.7, 0.55);
            l.position.set(-0.1 * scale, m, 0);
            g.add(l);
        }
        return g;
    }

    /** A text sprite, its texture shared by every label that reads the same. */
    private label(text: string, scale: number, opacity = 1): THREE.Sprite {
        let tex = this.textures.get(text);
        if (tex === undefined) {
            const c = document.createElement('canvas');
            c.width = 256; c.height = 64;
            const ctx = c.getContext('2d');
            if (ctx !== null) {
                ctx.font = '600 40px ui-sans-serif, -apple-system, "Segoe UI", sans-serif';
                ctx.textBaseline = 'middle';
                ctx.lineWidth = 8;
                ctx.strokeStyle = 'rgba(20,22,28,0.85)';
                ctx.strokeText(text, 8, 32);
                ctx.fillStyle = '#ffe9a8';
                ctx.fillText(text, 8, 32);
            }
            tex = new THREE.CanvasTexture(c);
            this.textures.set(text, tex);
        }
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, opacity }));
        s.center.set(0, 0.5);
        s.scale.set(0.44 * scale, 0.11 * scale, 1);
        s.renderOrder = 20;
        return s;
    }

    private dispose(r: Ruler): void {
        r.group.removeFromParent();
        r.group.traverse(o => {
            if (o instanceof THREE.LineSegments) o.geometry.dispose();
            if (o instanceof THREE.Sprite) o.material.dispose();
        });
    }
}
