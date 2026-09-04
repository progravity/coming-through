/** Order-sensitive hash of a stream of numbers and strings; used by the determinism test. */
export class Hasher {
    private a = 0x811c9dc5;
    private b = 0x050c5d1f;
    private readonly view = new DataView(new ArrayBuffer(8));

    private byte(v: number): void {
        this.a = Math.imul(this.a ^ v, 0x01000193) >>> 0;
        this.b = Math.imul(this.b ^ v, 0x1b873593) >>> 0;
    }

    /** Exact float64 bits, so any drift shows up. */
    f64(v: number): this {
        this.view.setFloat64(0, v);
        for (let i = 0; i < 8; i++) this.byte(this.view.getUint8(i));
        return this;
    }

    u32(v: number): this {
        this.view.setUint32(0, v >>> 0);
        for (let i = 0; i < 4; i++) this.byte(this.view.getUint8(i));
        return this;
    }

    str(s: string): this {
        for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i) & 0xff);
        this.byte(0xff);
        return this;
    }

    bool(v: boolean): this { this.byte(v ? 1 : 0); return this; }

    /** 16 hex characters. */
    digest(): string { return this.a.toString(16).padStart(8, '0') + this.b.toString(16).padStart(8, '0'); }
}
