/** Anything the grid can index: a collision-circle centre plus a liveness flag. */
export interface GridItem {
    readonly cx: number;
    readonly cz: number;
    readonly dead: boolean;
}

/**
 * Uniform hash grid over the XZ plane for cheap neighbour queries.
 *
 * It holds **two layers in one indexing scheme**: the moving one, cleared and refilled every step
 * from the crowd, and a fixed one set once from the walkway's furniture. Both are keyed the same
 * way and both are read by the same 3x3 block query, so an agent finds the bench beside it through
 * the lookup it was already doing -- there is no pass over every obstacle, and the static side is
 * not rebuilt sixty times a second for scenery that has not moved.
 *
 * They are separate maps rather than one list of a union type on purpose: `forNeighbors` runs
 * inside the separation loop for every agent every step and stays monomorphic, and neither query
 * has to ask what kind of thing it just found.
 */
export class SpatialGrid<T extends GridItem, S extends GridItem = never> {
    private readonly cells = new Map<number, T[]>();
    /** The fixed layer: every cell from which an item is reachable, holding that item. */
    private readonly fixedCells = new Map<number, S[]>();
    private fixedCount = 0;
    private readonly cellSize: number;
    private readonly inv: number;

    constructor(cellSize = 2) { this.cellSize = cellSize; this.inv = 1 / cellSize; }

    /**
     * How far from a fixed item's own footprint a query is guaranteed to find it.
     *
     * See `setFixed`: an item is indexed into every cell within a cell's width of its footprint, so
     * a query one cell away still meets it. Any interaction radius larger than this would fade in
     * and out depending on where the cell boundaries happened to fall under a bench, which is a bug
     * that only shows up in one place on the path. `test/obstacles.test.ts` pins it.
     */
    get reach(): number { return this.cellSize; }

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

    /**
     * Load the fixed layer. Called once; the walkway does not move.
     *
     * Each item is indexed into every cell within **one cell's width of its own footprint**, not
     * just the cells it sits in. That is the trade a static layer can make and a moving one cannot:
     * spreading the work over the handful of items once, at build time, buys `forFixed` a single
     * map lookup instead of the nine a 3x3 block needs. It matters because nearly every agent is
     * nowhere near a bench, so the nine lookups were almost all misses -- and there are two of these
     * queries per agent per step, which measured at a fifth of the whole simulation.
     *
     * `reachOf` is how far an item extends from its centre.
     */
    setFixed(items: readonly S[], reachOf: (o: S) => number): void {
        this.fixedCells.clear();
        this.fixedCount = items.length;
        for (const o of items) {
            const e = reachOf(o) + this.cellSize;
            const x0 = this.index(o.cx - e), x1 = this.index(o.cx + e);
            const z0 = this.index(o.cz - e), z1 = this.index(o.cz + e);
            for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
                const k = this.key(ix, iz);
                let arr = this.fixedCells.get(k);
                if (!arr) { arr = []; this.fixedCells.set(k, arr); }
                arr.push(o);
            }
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

    /**
     * Every fixed item within `reach` of (x, z), each reported exactly once.
     *
     * One cell, because `setFixed` already spread each item over the cells it can be reached from.
     * Exactly once follows from that too: an item appears at most once in any one cell's list, so
     * there is no double-counting to guard against -- which matters, because a repulsion summed
     * twice would make a bench push harder in some places than others for no visible reason.
     */
    forFixed(x: number, z: number, fn: (o: S) => void): void {
        if (this.fixedCount === 0) return;
        const arr = this.fixedCells.get(this.key(this.index(x), this.index(z)));
        if (arr === undefined) return;
        for (let k = 0; k < arr.length; k++) fn(arr[k]);
    }
}
