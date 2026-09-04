/** Anything the grid can index: a collision-circle centre plus a liveness flag. */
export interface GridItem {
    readonly cx: number;
    readonly cz: number;
    readonly dead: boolean;
}

/** Uniform hash grid over the XZ plane for cheap neighbour queries. */
export class SpatialGrid<T extends GridItem> {
    private readonly cells = new Map<number, T[]>();
    private readonly inv: number;

    constructor(cellSize = 2) { this.inv = 1 / cellSize; }

    private key(ix: number, iz: number): number { return ix * 4000 + iz; }
    private index(v: number): number { return Math.floor(v * this.inv) + 500; }

    rebuild(items: readonly T[]): void {
        this.cells.clear();
        for (const a of items) {
            if (a.dead) continue;
            const k = this.key(this.index(a.cx), this.index(a.cz));
            let arr = this.cells.get(k);
            if (!arr) { arr = []; this.cells.set(k, arr); }
            arr.push(a);
        }
    }

    /** Visit every item in the 3x3 block of cells around (x, z). */
    forNeighbors(x: number, z: number, fn: (o: T) => void): void {
        const cx = this.index(x), cz = this.index(z);
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
            const arr = this.cells.get(this.key(cx + i, cz + j));
            if (!arr) continue;
            for (let k = 0; k < arr.length; k++) fn(arr[k]);
        }
    }

}
