/**
 * The rule the static obstacles exist to enforce, and the rule they must not break.
 *
 * They enforce: benches, bins and lamp posts are solid. The player is stopped by them and the crowd
 * goes round them, and both happen through the grid the crowd was already querying.
 *
 * They must not break: **a bump is player-versus-person contact and nothing else.** Walking into a
 * bench is not a bump however hard you walk into it, and being shoved into the player by a crowd
 * bunched behind a bench still is one. The score has one definition and furniture is not in it.
 *
 * The colliders are also checked against the drawn furniture rather than against numbers written
 * down here, because the promise to the player is that what stops you is what you can see.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AS_DESIGNED } from '../../resources/js/game/composition.ts';
import { hasProperty } from '../../resources/js/game/entity.ts';
import { Agent } from '../../resources/js/game/sim/agent.ts';
import { SpatialGrid } from '../../resources/js/game/sim/grid.ts';
import { buildObstacles, insideFurniture, pushOutOf, reachOf } from '../../resources/js/game/sim/obstacles.ts';
import type { Obstacle, Push } from '../../resources/js/game/sim/obstacles.ts';
import { createPlayer, updatePlayer } from '../../resources/js/game/sim/player.ts';
import { OBSTACLE_ROOM } from '../../resources/js/game/sim/steering.ts';
import { IDLE_COMMAND, Simulation } from '../../resources/js/game/sim/simulation.ts';
import type { StepCommand } from '../../resources/js/game/sim/simulation.ts';
import type { Solid } from '../../resources/js/game/world/edge.ts';
import { furniturePlan } from '../../resources/js/game/world/furniture.ts';
import { edgePlans } from '../../resources/js/game/world/plan.ts';
import { W } from '../../resources/js/game/world/layout.ts';
import { PATH, PathCurve, newPathFrame, newPathPoint, newWorldPoint, pathPlace } from '../../resources/js/game/world/path.ts';
import type { Along, PathRun } from '../../resources/js/game/world/path.ts';

/** Below this a part of a prop is something a body walks into; above it, something it walks under. */
const WALKING_HEIGHT = 1.2;

const push: Push = { nx: 0, nz: 0, depth: 0 };
const frame = newPathFrame(), at = newWorldPoint(), q = newPathPoint();

/** A grid holding nothing but the furniture, for the unit-level checks below. */
function fixedGrid(obstacles: readonly Obstacle[]): SpatialGrid<Agent, Obstacle> {
    const g = new SpatialGrid<Agent, Obstacle>(2);
    g.setFixed(obstacles, reachOf);
    return g;
}

/** The bench nearest a body: the one it can reach in the seconds a test is willing to walk for. */
function nearestBench(obstacles: readonly Obstacle[], from: { x: number; z: number }): Obstacle {
    const benches = obstacles.filter(o => o.half > 0);
    assert.ok(benches.length > 0, 'there are no long thin colliders to walk into');
    return benches.reduce((best, o) =>
        Math.hypot(o.cx - from.x, o.cz - from.z) < Math.hypot(best.cx - from.x, best.cz - from.z) ? o : best);
}

/** The deepest any obstacle has a body of radius `r` at (x, z). Zero when it is clear of all of them. */
function penetration(obstacles: readonly Obstacle[], x: number, z: number, r: number): number {
    let deepest = 0;
    for (const o of obstacles) if (pushOutOf(o, x, z, r, push)) deepest = Math.max(deepest, push.depth);
    return deepest;
}

// ---------- the colliders themselves ----------

/**
 * The footprints in a plan that are really colliders, in the plan's own order.
 *
 * Not every footprint is one, and pairing them off positionally stopped being safe when the shops
 * arrived: a shopfront presents a footprint and declines `static-obstacle`, so `buildObstacles`
 * skips it and every collider after it would be compared against the wrong object. Selecting by the
 * property is also the honest version of the check -- it is the join `obstaclesFrom` itself makes.
 */
function colliderSolids(plan = edgePlans()): Solid[] {
    const walls = new Set(plan.entities.filter(e => hasProperty(e.meta, 'static-obstacle')).map(e => e.piece));
    return plan.solids.filter(so => walls.has(so.piece));
}

test('a collider is the thing it is derived from, placed through the same frame', () => {
    // Every layer that has footprints, not just the furniture: the kiosks are solid through the
    // same path and a collider that only the drawing side knew about would be invisible here.
    const solids = colliderSolids(), obstacles = buildObstacles();
    assert.equal(obstacles.length, solids.length, 'one collider per solid, in order');
    assert.ok(solids.length > 20, 'there is furniture to collide with');
    for (let i = 0; i < solids.length; i++) {
        const s = solids[i], o = obstacles[i];
        const f = PATH.frameAt(s.s, frame);
        pathPlace(f, s.n, 0, at);
        assert.ok(Math.hypot(o.cx - at.x, o.cz - at.z) < 1e-12, `collider ${i} is not where its piece is`);
        // The axis is the path's tangent flattened into the walking plane, and it is a unit vector
        // so the segment is exactly `2 * half` long.
        assert.ok(Math.abs(Math.hypot(o.ax, o.az) - 1) < 1e-12, 'the axis is a unit vector');
        assert.ok(Math.abs(o.ax * f.nx + o.az * f.nz) < 1e-12, 'and it lies along the path, not across it');
    }
});

test('a collider is no bigger than the thing you can see', () => {
    // The fairness promise: you are never stopped by a bench you can see you have walked past. Both
    // extents are measured off the drawn parts, so a bench that changes shape moves them together.
    //
    // The furniture only. The kiosks make the same promise and are held to it in `kiosks.test.ts`,
    // but they cannot be measured by the rule below: it reads `across`/`along` as lateral and
    // along-path extents, which stops being true the moment a part is turned inside the frame -- and
    // a cart's wheels are, so its bounding box here would be a fiction.
    const plan = furniturePlan();
    let benches = 0;
    for (const sol of plan.solids) {
        // The parts of this object, by the id the plan gave them: a bench and a lamp post can
        // stand at the same place on the same side, so proximity is not an answer.
        const parts = plan.standing.filter(p => p.piece === sol.piece);
        assert.ok(parts.length > 0, `nothing is drawn where a collider stands, at s=${sol.s}`);
        const box = (of: typeof parts): { n0: number; n1: number; a0: number; a1: number } => {
            let n0 = Infinity, n1 = -Infinity, a0 = Infinity, a1 = -Infinity;
            for (const p of of) {
                n0 = Math.min(n0, p.n - p.across / 2); n1 = Math.max(n1, p.n + p.across / 2);
                const a = p.ahead ?? 0;
                a0 = Math.min(a0, a - p.along / 2); a1 = Math.max(a1, a + p.along / 2);
            }
            return { n0, n1, a0, a1 };
        };
        const all = box(parts);
        // The capsule's own bounding box, in the same terms.
        const cn0 = sol.n - sol.r, cn1 = sol.n + sol.r;
        const ca0 = -(sol.half + sol.r), ca1 = sol.half + sol.r;
        assert.ok(cn0 >= all.n0 - 1e-9 && cn1 <= all.n1 + 1e-9, `collider at s=${sol.s} is wider than the object`);
        assert.ok(ca0 >= all.a0 - 1e-9 && ca1 <= all.a1 + 1e-9, `collider at s=${sol.s} is longer than the object`);
        // And no *smaller* than what a body would actually walk into, which is the object below
        // walking height rather than all of it: a lamp is a thin column with a globe three metres
        // up, and a collider the width of the globe would stop you a foot short of a lamp post.
        const low = box(parts.filter(p => p.y < WALKING_HEIGHT));
        assert.ok(cn0 - low.n0 < 0.12 && low.n1 - cn1 < 0.12, `collider at s=${sol.s} is much narrower than the object`);
        if (sol.half > 0) { benches++; assert.ok(ca0 - all.a0 < 1e-9, 'a bench collider is exactly as long as the bench'); }
    }
    assert.ok(benches > 0, 'the long thin case was exercised');
});

test('colliders follow a walkway that bends, widens and climbs', () => {
    const BEND: readonly PathRun[] = [
        { sAt: 0, x: 0, z: 0, tx: 0, tz: 1, sMin: -60, sMax: 0 },
        { sAt: 0, x: 0, z: 0, tx: Math.SQRT1_2, tz: Math.SQRT1_2, sMin: 0, sMax: 60 },
    ];
    const WIDENING: Along = (s: number) => W + s * 0.04;
    const HILL: Along = (s: number) => s * s * 0.004;
    const varied = new PathCurve(BEND, WIDENING, HILL);
    const solids = colliderSolids(edgePlans(varied)), obstacles = buildObstacles(varied);
    assert.ok(obstacles.length > 20, 'the stub walkway is furnished');
    let turned = 0;
    for (let i = 0; i < solids.length; i++) {
        const s = solids[i], o = obstacles[i];
        const f = varied.frameAt(s.s, frame);
        pathPlace(f, s.n, 0, at);
        assert.ok(Math.hypot(o.cx - at.x, o.cz - at.z) < 1e-12, 'the collider went where the curve put the piece');
        // The obstacle is a footprint on the walking plane, so it stays flat and unit-length even
        // where the tangent is climbing: a hill must not shorten a bench's collider.
        assert.ok(Math.abs(Math.hypot(o.ax, o.az) - 1) < 1e-12, 'the axis stays a unit vector on a slope');
        if (Math.abs(o.ax) > 0.01 && Math.abs(o.az) > 0.01) turned++;
    }
    assert.ok(turned > 0, 'and some of them are on the run the bend turned onto');
    // A fixed-width layer would put every collider at the same offset from the centreline.
    const offs = solids.map(s => Math.abs(s.n));
    assert.ok(Math.max(...offs) - Math.min(...offs) > 2, 'the widening really moved them');
});

test('the interaction radius stays inside what the grid guarantees to find', () => {
    // An obstacle is indexed across its own footprint and a query reaches one cell either way, so
    // anything closer than `grid.reach` to that footprint is found. A repulsion that reached
    // further would fade in and out depending on where the cell boundaries happened to fall.
    const obstacles = buildObstacles();
    const grid = fixedGrid(obstacles);
    // The widest body the crowd produces, taken off real crowds rather than guessed at: a stroller
    // pusher is the biggest circle in the game and no aid is wider. Today's crowd holds none -- no
    // model can be drawn with a stroller yet -- so these are crowds as designed, which do.
    let widest = 0;
    for (const seed of [1, 7, 20260903]) {
        const sim = new Simulation(seed, { drawable: AS_DESIGNED });
        sim.crowd.fill(190);
        for (const a of sim.crowd.agents) widest = Math.max(widest, a.r);
    }
    assert.ok(widest > 0.6, 'the widest body in the crowd was found');
    const biggest = Math.max(...obstacles.map(o => o.r));
    assert.ok(biggest + widest + OBSTACLE_ROOM < grid.reach,
        `an obstacle can push from ${(biggest + widest + OBSTACLE_ROOM).toFixed(2)}m, past the grid's ${grid.reach}m`);
});

// ---------- the crowd ----------

const running = (crowd: number): StepCommand => ({ ...IDLE_COMMAND, crowd, running: true });

test('the crowd goes round the furniture instead of through it', () => {
    const sim = new Simulation(1);
    sim.prime(190);
    const cmd = running(190);
    const obstacles = sim.crowd.obstacles;
    let worst = 0, overlapping = 0, samples = 0;
    for (let i = 0; i < 900; i++) {
        sim.step(cmd);
        if (i % 3) continue;
        for (const a of sim.crowd.agents) {
            samples++;
            const d = penetration(obstacles, a.cx, a.cz, a.r);
            if (d > 0) { overlapping++; worst = Math.max(worst, d); }
        }
    }
    assert.ok(samples > 40000, 'a full crowd was watched for a while');
    // Not "never": a body shoved into a bench by the press behind it is real, and the railing has
    // the final say on how far across the walkway anyone may be, so the last centimetres of a
    // squeeze are resolved against the wall rather than against the furniture. What matters is that
    // it is rare and shallow -- a brush past the back of a bench, not a walk through one.
    assert.ok(overlapping / samples < 0.01, `too many bodies inside the furniture: ${(100 * overlapping / samples).toFixed(2)}%`);
    assert.ok(worst < 0.25, `something walked ${worst.toFixed(2)}m into the furniture`);
});

test('the furniture narrows the walkway without stopping anyone in it', () => {
    // The narrowing is the point -- the crowd should bunch beside a bench -- but a pinch that holds
    // somebody still is a bug. Measured as throughput against the same run with the colliders taken
    // out, which is the only baseline that separates "slower" from "stuck". Summed over four seeds:
    // thirty seconds of one seed is sixty-odd people, and a single seed can tie either way.
    const flow = (withFurniture: boolean): number => {
        let through = 0;
        for (const seed of [1, 2, 3, 4]) {
            const sim = new Simulation(seed);
            if (!withFurniture) sim.crowd.grid.setFixed([], reachOf);
            sim.prime(190);
            const cmd = running(190);
            for (let i = 0; i < 1800; i++) { sim.step(cmd); through += sim.crowd.released.length; }
        }
        return through;
    };
    const bare = flow(false), furnished = flow(true);
    assert.ok(furnished > 0 && bare > 0, 'people reach the end of the path either way');
    assert.ok(furnished < bare, 'the furniture should narrow the walkway at all');
    assert.ok(furnished > bare * 0.8, `the furniture is jamming the walkway: ${furnished} through against ${bare}`);
});

// ---------- the player ----------

type TestPlayer = ReturnType<typeof createPlayer>;

/**
 * Push the player toward (tx, tz) for `steps` fixed steps, and say how many of them scraped.
 *
 * Driven in first person, where the stick is relative to the body rather than to a camera the test
 * would then have to keep pointing: aim `yaw` at the target and hold the stick forward.
 */
function driveToward(p: TestPlayer, grid: SpatialGrid<Agent, Obstacle>, tx: number, tz: number, steps: number): number {
    let scrapes = 0;
    for (let i = 0; i < steps; i++) {
        p.yaw = Math.atan2(tx - p.x, tz - p.z);
        if (updatePlayer(p, { x: 0, y: 1, mag: 1, hurry: false }, 'first', grid)) scrapes++;
    }
    return scrapes;
}

test('the player is stopped by a bench, and never ends up inside one', () => {
    const obstacles = buildObstacles();
    const grid = fixedGrid(obstacles);
    const bench = nearestBench(obstacles, createPlayer());
    const p = createPlayer();
    const scrapes = driveToward(p, grid, bench.cx, bench.cz, 1200);
    assert.ok(scrapes > 0, 'walking into a bench should report a scrape');
    assert.equal(penetration(obstacles, p.x, p.z, p.r), 0, 'the player finished inside the bench');
    assert.equal(insideFurniture(grid, p.x, p.z, p.r), false);
    // Stopped short of it: touching, not standing on it.
    const gap = Math.hypot(p.x - bench.cx, p.z - bench.cz);
    assert.ok(gap > bench.r, `the player got ${gap.toFixed(2)}m from a bench centre of radius ${bench.r}`);
    assert.ok(gap < bench.half + bench.r + p.r + 0.35, 'and did actually reach it rather than stopping in the distance');
});

test('the player never crosses a bench, however long they lean on it', () => {
    const obstacles = buildObstacles();
    const grid = fixedGrid(obstacles);
    const bench = nearestBench(obstacles, createPlayer());
    const p = createPlayer();
    // Start on the walkway side of the bench and push at it for twenty seconds.
    PATH.toPath(bench.cx, bench.cz, q);
    const side = Math.sign(q.n);
    const from = PATH.toWorld(q.s, q.n - side * 2, newWorldPoint());
    p.x = from.x; p.z = from.z;
    const startN = PATH.toPath(p.x, p.z, q).n;
    for (let i = 0; i < 1200; i++) {
        driveToward(p, grid, bench.cx, bench.cz, 1);
        assert.equal(penetration(obstacles, p.x, p.z, p.r), 0, `the player entered the bench at step ${i}`);
    }
    const endN = PATH.toPath(p.x, p.z, q).n;
    assert.ok(Math.abs(endN) > Math.abs(startN), 'the player did press outward against it');
    assert.ok(Math.abs(endN) < Math.abs(q.n) + 5, 'and stayed on the walkway');
});

// ---------- what counts ----------

test('walking into the scenery is a scrape and never a bump', () => {
    const sim = new Simulation(1);
    sim.prime(30);
    let bumps = 0, scrapes = 0;
    sim.onBump = () => { bumps++; };
    sim.onScrape = () => { scrapes++; };
    // Nobody else on the walkway, so the only thing to hit is the furniture.
    sim.crowd.agents.length = 0;
    const bench = nearestBench(sim.crowd.obstacles, sim.player);
    const cmd = running(0);
    const p = sim.player;
    for (let i = 0; i < 900; i++) {
        p.yaw = Math.atan2(bench.cx - p.x, bench.cz - p.z);
        sim.step({ ...cmd, cam: 'first', x: 0, y: 1, mag: 1 });
    }
    assert.ok(scrapes > 0, 'the player leaned on a bench and nothing was reported');
    assert.equal(bumps, 0, 'hitting the scenery must never count as a bump');
    assert.equal(sim.bumps, 0, 'and must never reach the score');
});

test('walking into a person is a bump, whatever pushed them there', () => {
    const sim = new Simulation(1);
    sim.prime(30);
    let bumps = 0, scrapes = 0;
    sim.onBump = () => { bumps++; };
    sim.onScrape = () => { scrapes++; };
    // Stand somebody on the player. The cause of the contact is deliberately not part of the rule:
    // a person shoved into the player by a crowd bunched round a bench is the same bump as one the
    // player walked into, so a test that puts a body there and steps is the whole definition.
    const victim = sim.crowd.agents[0];
    victim.x = sim.player.x + 0.2; victim.z = sim.player.z;
    victim.vx = 0; victim.vz = 0;
    sim.step({ ...IDLE_COMMAND, crowd: 30, running: true });
    assert.equal(bumps, 1, 'contact with a person is a bump');
    assert.equal(sim.bumps, 1, 'and it reaches the score');
    assert.equal(scrapes, 0, 'and it is not also a scrape');
});

test('the furniture is the same in every run and draws nothing from a seed', () => {
    // Scenery is not seeded, and an obstacle that were would be invisible to both determinism
    // hashes -- the crowd would simply behave differently from run to run for no stated reason.
    const a = buildObstacles(), b = buildObstacles();
    assert.deepEqual(a, b);
    assert.deepEqual(new Simulation(1).crowd.obstacles, new Simulation(99).crowd.obstacles);
});
