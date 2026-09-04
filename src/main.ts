// @ts-nocheck
import * as THREE from 'three';

// ---------- config ----------
const W = 6;            // half width of the path
const L = 45;           // half length of the path
const MAX = 200;        // crowd capacity (pools are sized from this)
const PLAYER_SLOT = MAX;
const DOORS = [{x:-W, z:-14},{x:-W, z:18},{x:W, z:4},{x:W, z:-28}];
const isTouch = matchMedia('(pointer: coarse)').matches;
let targetCount = isTouch ? 60 : 80;
let inkOn = true;
let camMode = 'shoulder';

// ---------- helpers ----------
const rand = (a,b) => a + Math.random()*(b-a);
const rr = v => Array.isArray(v) ? rand(v[0], v[1]) : v;
const pick = a => a[Math.floor(Math.random()*a.length)];
const clamp = (v,a,b) => v < a ? a : v > b ? b : v;
const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

// ---------- palette ----------
const SKIN = [0xf3d3b8,0xe0b48c,0xc68f62,0x9a6640,0x6b452c];
const SHIRT = {
    any:    [0xe8e4dc,0x4a7fb5,0xd9534f,0x6bb36b,0xf0c04a,0x8a6fd1,0x3fb5a8,0xe37f3c,0xf1a4c0],
    orange: [0xff8c2b,0xff7a1a,0xf5a244],
    pink:   [0xd94f8c,0xe06aa3,0xc23b7a],
    blue:   [0x7fd0ff,0x5ab8f0,0x9adcff],
    yellow: [0xffd54f,0xf7c631,0xffe27a],
    green:  [0x59b25f,0x4aa352,0x6cc46f],
    purple: [0xab47bc,0x9c3fb0,0xb85dc8],
};
const PANTS = [0x2f3d5c,0x5d5a52,0xb6a27d,0x3a5a8c,0x2c2c2c];
const HATC  = [0xd9534f,0x2f3d5c,0xf2f0ea,0x3fb5a8,0xf0c04a];
const HAIRC = [0x2c2218,0x5a3a22,0xd9b26a,0x1a1a1a,0x8c8c8c];

// ---------- archetypes: behavior + look constraints in one place ----------
const ARCH = {
    tourist:{ name:'Tourist', weight:6, color:0x4a7fb5, desc:'walks normally',
        speed:[1.2,1.5], radius:0.32, sepR:1.4, sepW:2.5, wander:0.3, wanderEvery:[2,4], avoidPlayer:1, accel:6,
        look:{ h:[0.9,1.1], shirt:'any', hat:0.4, acc:['none','none','backpack','balloon'] } },
    dave:{ name:'Dave', weight:2, color:0xff8c2b, desc:'fast, cuts across',
        speed:[2.2,2.6], radius:0.3, sepR:0.9, sepW:1.2, wander:1.6, wanderEvery:[0.8,1.6], avoidPlayer:0.6, accel:9,
        look:{ h:[1.1,1.2], w:0.85, shirt:'orange', hat:0.1, acc:['none'], stride:1.3, cadence:1.1 } },
    mary:{ name:'Mary', weight:2, color:0xd94f8c, desc:'slow, pushes a stroller',
        speed:[0.7,0.9], radius:0.62, colOffset:0.6, sepR:2.0, sepW:3, wander:0.1, wanderEvery:[4,7], avoidPlayer:1, accel:3,
        look:{ h:[0.95,1.05], shirt:'pink', hat:0.3, acc:['stroller'], stride:0.6, bob:0.4 } },
    kyle:{ name:'Kyle', weight:2, color:0x7fd0ff, desc:'on his phone, avoids no one',
        speed:[0.9,1.1], radius:0.32, sepR:0.5, sepW:0.3, wander:0.5, wanderEvery:[2,4], avoidPlayer:0.1, accel:4,
        look:{ h:[0.95,1.1], shirt:'blue', hat:0.2, acc:['phone'], headPitch:0.55, stride:0.7, cadence:1.2 } },
    linda:{ name:'Linda', weight:2, color:0xffd54f, desc:'stops dead for photos',
        speed:[1.1,1.3], radius:0.32, sepR:1.4, sepW:2.5, wander:0.4, wanderEvery:[2,4], avoidPlayer:1, accel:6, stopEvery:[4,8], stopFor:[1.5,3],
        look:{ h:[0.9,1.05], shirt:'yellow', hat:0.9, hatType:'brim', acc:['camera'] } },
    family:{ name:'The Johnsons', weight:1, color:0x59b25f, desc:'walk four abreast',
        speed:[0.9,1.1], radius:0.34, sepR:1.2, sepW:1.5, wander:0, wanderEvery:[9,9], avoidPlayer:0.7, accel:5, group:[3,4], spacing:0.9,
        look:{ h:[0.9,1.1], shirt:'green', sameShirt:true, hat:0.5, acc:['none','backpack'] } },
    timmy:{ name:'Timmy', weight:2, color:0xab47bc, desc:'small, fast, unpredictable',
        speed:[2.0,2.8], radius:0.22, sepR:0.8, sepW:1.0, wander:3, wanderEvery:[0.5,1.2], avoidPlayer:0.2, accel:12, parentType:'tourist',
        look:{ h:[0.55,0.62], shirt:'purple', hat:0.6, hatType:'cone', acc:['none','balloon'], stride:1.4, cadence:1.8 } },
};
const ARCH_KEYS = Object.keys(ARCH);
const TOTAL_WEIGHT = ARCH_KEYS.reduce((s,k) => s + ARCH[k].weight, 0);
function weightedType(){
    let r = Math.random()*TOTAL_WEIGHT;
    for (const k of ARCH_KEYS){ r -= ARCH[k].weight; if (r <= 0) return k; }
    return 'tourist';
}

// ---------- recipe: everything about how one person looks and moves ----------
function makeRecipe(A, opts = {}){
    const lk = A.look;
    const hatType = Math.random() < lk.hat ? (lk.hatType || pick(['cap','cap','brim','cone'])) : 'none';
    return {
        h: rr(lk.h), w: (lk.w || 1) * rand(0.9, 1.1), headR: rand(0.2, 0.24),
        skin: pick(SKIN), shirt: opts.shirt !== undefined ? opts.shirt : pick(SHIRT[lk.shirt]), pants: pick(PANTS),
        hat: hatType, hatColor: pick(HATC),
        hair: hatType === 'none' ? pick(['round','round','flat','none']) : 'none', hairColor: pick(HAIRC),
        acc: pick(lk.acc), accColor: pick(HATC),
        headPitch: lk.headPitch || 0,
        gait: { bob: (lk.bob || 1) * rand(0.03, 0.05), stride: (lk.stride || 1) * rand(0.5, 0.65),
            cadence: (lk.cadence || 1) * rand(8, 10), arm: rand(0.35, 0.5) },
    };
}

// ---------- scene ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ed0e6);
scene.fog = new THREE.Fog(0x9ed0e6, 40, 110);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(70, innerWidth/innerHeight, 0.1, 200);
camera.rotation.order = 'YXZ';
const topCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 200);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a5a, 0.9));
const sun = new THREE.DirectionalLight(0xfff2d6, 0.9);
sun.position.set(20, 40, 10);
scene.add(sun);

function box(w,h,d,color,x,y,z){
    const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshLambertMaterial({ color }));
    m.position.set(x,y,z); scene.add(m); return m;
}
// ground and path
box(2*W, 0.1, 2*L+16, 0xcfc4ad, 0, -0.05, 0);                     // path
box(60, 0.1, 2*L+16, 0x8bb56f, -(W+30), -0.06, 0);               // grass left
box(60, 0.1, 2*L+16, 0x8bb56f, (W+30), -0.06, 0);                // grass right
box(2*W, 0.02, 3, 0x4a7fb5, 0, 0.01, L-3);                         // start pad
box(2*W, 0.02, 3, 0x59b25f, 0, 0.01, -(L-3));                      // goal pad
// railings with gaps at doorways
for (const side of [-1, 1]){
    const doors = DOORS.filter(d => Math.sign(d.x) === side).map(d => d.z).sort((a,b) => a-b);
    let z0 = -L-8;
    for (const dz of doors.concat([L+8])){
        const z1 = dz === L+8 ? dz : dz - 1.6;
        if (z1 > z0) box(0.15, 1.0, z1 - z0, 0x6f6a5f, side*W, 0.5, (z0+z1)/2);
        z0 = dz === L+8 ? dz : dz + 1.6;
    }
}
// shops behind doorways, lamp posts, a distant skyline
const SHOPC = [0xe37f3c, 0x3fb5a8, 0xd9534f, 0x8a6fd1];
DOORS.forEach((d,i) => {
    box(6, 3.2, 7, 0xf2ead8, d.x + Math.sign(d.x)*3.2, 1.6, d.z);
    box(6.4, 0.5, 2, SHOPC[i], d.x + Math.sign(d.x)*0.9, 2.6, d.z);
});
for (let z = -L; z <= L; z += 12){
    for (const side of [-1,1]){
        box(0.12, 3.2, 0.12, 0x3b3a36, side*(W+0.7), 1.6, z);
        const g = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshLambertMaterial({ color: 0xfff2c4 }));
        g.position.set(side*(W+0.7), 3.3, z); scene.add(g);
    }
}
const wheel = new THREE.Mesh(new THREE.TorusGeometry(9, 0.5, 8, 24), new THREE.MeshLambertMaterial({ color: 0xd9534f }));
wheel.position.set(-24, 11, -L-40); scene.add(wheel);
box(0.8, 11, 0.8, 0x5d5a52, -24, 5.5, -L-40);
for (let i = 0; i < 7; i++) box(3, 1 + i*2.2, 3, 0x4a7fb5, 12 + i*3.5, (1 + i*2.2)/2, -L-38);
box(14, 20, 14, 0x9a8f7a, 40, 10, -L-60);
const grid = new THREE.GridHelper(2*L+16, (2*L+16)/2, 0xb8ad97, 0xb8ad97);
grid.position.y = 0.005; grid.material.opacity = 0.35; grid.material.transparent = true; scene.add(grid);

// ---------- instanced part pools ----------
const gradData = new Uint8Array([100, 170, 240]);
const toonMap = new THREE.DataTexture(gradData, 3, 1, THREE.RedFormat);
toonMap.minFilter = THREE.NearestFilter; toonMap.magFilter = THREE.NearestFilter; toonMap.needsUpdate = true;

const pools = {};
const ZERO = new THREE.Matrix4().makeScale(0,0,0);
function makePool(name, geo, per){
    const n = (MAX+1) * per;
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: toonMap }), n);
    const out  = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x1b1a1f, side: THREE.BackSide }), n);
    mesh.frustumCulled = out.frustumCulled = false;
    const white = new THREE.Color(0xffffff);
    for (let i = 0; i < n; i++){ mesh.setMatrixAt(i, ZERO); out.setMatrixAt(i, ZERO); mesh.setColorAt(i, white); }
    scene.add(mesh); scene.add(out);
    pools[name] = { mesh, out, per };
}
makePool('body', new THREE.SphereGeometry(0.5, 14, 10), 1);
makePool('head', new THREE.SphereGeometry(0.5, 14, 10), 1);
makePool('ball', new THREE.SphereGeometry(0.5, 10, 8), 2);          // hair, balloon
makePool('cyl',  new THREE.CylinderGeometry(0.5, 0.5, 1, 10), 6);   // 4 limbs + 2 hat pieces
makePool('cone', new THREE.CylinderGeometry(0.02, 0.5, 1, 10), 1);
makePool('box',  new THREE.BoxGeometry(1, 1, 1), 5);                // accessories

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _c = new THREE.Color(), BASE = new THREE.Matrix4();
function put(pool, idx, x,y,z, rx,ry,rz, sx,sy,sz, color){
    const P = pools[pool];
    _p.set(x,y,z); _e.set(rx,ry,rz); _q.setFromEuler(_e); _s.set(sx,sy,sz);
    _m.compose(_p,_q,_s); _m2.multiplyMatrices(BASE,_m); P.mesh.setMatrixAt(idx,_m2);
    _s.set(sx*1.06+0.025, sy*1.06+0.025, sz*1.06+0.025);
    _m.compose(_p,_q,_s); _m2.multiplyMatrices(BASE,_m); P.out.setMatrixAt(idx,_m2);
    P.mesh.setColorAt(idx, _c.setHex(color));
}
function hide(pool, idx){ const P = pools[pool]; P.mesh.setMatrixAt(idx, ZERO); P.out.setMatrixAt(idx, ZERO); }
function freeSlot(slot){
    hide('body',slot); hide('head',slot); hide('cone',slot);
    hide('ball',slot*2); hide('ball',slot*2+1);
    for (let i = 0; i < 6; i++) hide('cyl', slot*6+i);
    for (let i = 0; i < 5; i++) hide('box', slot*5+i);
}

// draw one person from a recipe; all parts are in "unit height" space and scaled by r.h
function drawPerson(slot, r, x, z, yaw, phase, mv, lean, t){
    _p.set(x,0,z); _e.set(0,yaw,0); _q.setFromEuler(_e); _s.set(r.h,r.h,r.h); BASE.compose(_p,_q,_s);
    const g = r.gait, c6 = slot*6, b5 = slot*5, k2 = slot*2;
    const bob = Math.sin(phase*2)*g.bob*mv + Math.sin(t*1.7+slot)*0.008*(1-mv);
    const sw = Math.sin(phase)*g.stride*mv;
    // legs swing about the hip
    put('cyl', c6,   -0.11, 0.8-0.39*Math.cos(sw), -0.39*Math.sin(sw),  sw,0,0, 0.15,0.78,0.15, r.pants);
    put('cyl', c6+1,  0.11, 0.8-0.39*Math.cos(sw),  0.39*Math.sin(sw), -sw,0,0, 0.15,0.78,0.15, r.pants);
    // arms swing opposite
    const ax = 0.27*r.w+0.06, asw = -sw*g.arm, ay = 1.32+bob;
    put('cyl', c6+2, -ax, ay-0.26*Math.cos(asw), -0.26*Math.sin(asw),  asw,0,0, 0.11,0.52,0.11, r.skin);
    put('cyl', c6+3,  ax, ay-0.26*Math.cos(asw),  0.26*Math.sin(asw), -asw,0,0, 0.11,0.52,0.11, r.skin);
    // body
    put('body', slot, 0, 1.05+bob, 0, 0.06*mv,0,lean, 0.52*r.w,0.72,0.38*r.w, r.shirt);
    // head
    const hr = r.headR, hy = 1.55+bob+hr*0.2;
    const hp = r.headPitch + Math.sin(phase)*0.03*mv;
    put('head', slot, 0, hy, 0, hp,0,lean*0.5, hr*2,hr*2,hr*2, r.skin);
    const hz = hr*hp*0.8, hyy = hy - hr*hp*0.3;
    // hair
    if (r.hair === 'round')     put('ball', k2, 0, hyy+hr*0.35, hz-hr*0.15, hp,0,0, hr*2.15,hr*1.6,hr*2.15, r.hairColor);
    else if (r.hair === 'flat') put('ball', k2, 0, hyy+hr*0.55, hz,         hp,0,0, hr*2.1, hr*0.9,hr*2.1,  r.hairColor);
    else hide('ball', k2);
    // hat
    if (r.hat === 'cap'){
        put('cyl', c6+4, 0, hyy+hr*0.75, hz,        hp,0,0, hr*2.2,hr*0.6, hr*2.2, r.hatColor);
        put('cyl', c6+5, 0, hyy+hr*0.6,  hz+hr*1.1, hp,0,0, hr*1.6,hr*0.15,hr*1.2, r.hatColor);
        hide('cone', slot);
    } else if (r.hat === 'brim'){
        put('cyl', c6+4, 0, hyy+hr*0.55, hz, hp,0,0, hr*3.4,hr*0.15,hr*3.4, r.hatColor);
        put('cyl', c6+5, 0, hyy+hr*1.0,  hz, hp,0,0, hr*1.9,hr*0.8, hr*1.9, r.hatColor);
        hide('cone', slot);
    } else if (r.hat === 'cone'){
        hide('cyl', c6+4); hide('cyl', c6+5);
        put('cone', slot, 0, hyy+hr*0.9+0.22, hz, hp,0,0, hr*1.7,0.5,hr*1.7, r.hatColor);
    } else { hide('cyl', c6+4); hide('cyl', c6+5); hide('cone', slot); }
    // accessories
    for (let i = 0; i < 5; i++) hide('box', b5+i);
    hide('ball', k2+1);
    if (r.acc === 'phone')         put('box', b5, 0.12, 1.3+bob, 0.3, -0.6,0,0, 0.09,0.15,0.02, 0x1e1e22);
    else if (r.acc === 'camera')   put('box', b5, 0, 1.22+bob, 0.26, 0,0,0, 0.18,0.12,0.12, 0x2a2a2e);
    else if (r.acc === 'backpack') put('box', b5, 0, 1.1+bob, -0.3, 0,0,0, 0.38,0.44,0.2, r.accColor);
    else if (r.acc === 'stroller'){
        put('box', b5,   0, 0.55, 0.95, 0,0,0, 0.5,0.4,0.7, r.accColor);
        put('box', b5+1, 0, 0.85, 1.12, 0,0,0, 0.5,0.28,0.36, 0x2a2a2e);
        put('box', b5+2, 0, 0.92, 0.55, 0.3,0,0, 0.5,0.04,0.04, 0x2a2a2e);
        put('box', b5+3, -0.27, 0.15, 0.75, 0,0,0, 0.06,0.3,0.3, 0x2a2a2e);
        put('box', b5+4,  0.27, 0.15, 0.75, 0,0,0, 0.06,0.3,0.3, 0x2a2a2e);
    } else if (r.acc === 'balloon'){
        const bx = 0.36 + Math.sin(t*1.3+slot)*0.05;
        put('ball', k2+1, bx, 2.35+bob, 0.05, 0,0,0, 0.42,0.5,0.42, r.accColor);
        put('box', b5, bx*0.9, 1.65+bob, 0.05, 0,0,0, 0.015,1.1,0.015, 0xdddddd);
    }
}

// ---------- simulation ----------
const freeSlots = []; for (let i = MAX-1; i >= 0; i--) freeSlots.push(i);
const agents = [];
let groupSeq = 0;
const cells = new Map();
const cellKey = (x,z) => ((Math.floor(x/2)+500) * 4000 + (Math.floor(z/2)+500));
function rebuildGrid(){
    cells.clear();
    for (const a of agents){ if (a.dead) continue; const k = cellKey(a.cx, a.cz); let arr = cells.get(k); if (!arr){ arr = []; cells.set(k, arr); } arr.push(a); }
}
function forNeighbors(x, z, fn){
    const cx = Math.floor(x/2)+500, cz = Math.floor(z/2)+500;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++){
        const arr = cells.get((cx+i)*4000 + (cz+j)); if (!arr) continue;
        for (let k = 0; k < arr.length; k++) fn(arr[k]);
    }
}

class Agent {
    constructor(type, x, z, dir, opts = {}){
        const A = ARCH[type];
        this.type = type; this.A = A;
        this.x = x; this.z = z; this.vx = 0; this.vz = dir*0.5; this.dir = dir;
        this.speed = opts.speed || rr(A.speed); this.r = A.radius; this.colOff = A.colOffset || 0;
        this.yaw = dir > 0 ? 0 : Math.PI; this.hx = 0; this.hz = dir;
        this.t = 0; this.phase = Math.random()*6.28; this.mv = 0; this.lean = 0;
        this.wanderX = x; this.wanderZ = 0; this.nextWander = rr(A.wanderEvery);
        this.stopUntil = 0; this.nextStop = A.stopEvery ? rr(A.stopEvery) : Infinity;
        this.leader = opts.leader || null; this.offset = opts.offset || 0; this.parent = opts.parent || null;
        this.group = opts.group || 0; this.bumpCd = 0; this.dead = false;
        this.recipe = makeRecipe(A, opts);
        this.slot = freeSlots.pop();
    }
    get cx(){ return this.x + this.hx*this.colOff; }
    get cz(){ return this.z + this.hz*this.colOff; }
    update(dt, player){
        this.t += dt; this.bumpCd -= dt;
        const A = this.A;
        let dx = 0, dz = 0;
        if (this.leader){
            const Ld = this.leader; if (Ld.dead){ this.dead = true; return; }
            const tx = clamp(Ld.x + this.offset, -W+0.6, W-0.6), tz = Ld.z;
            dx = (tx-this.x)*2.0 + Ld.vx; dz = (tz-this.z)*2.0 + Ld.vz;
            const m = Math.hypot(dx,dz), cap = this.speed*1.5; if (m > cap){ dx *= cap/m; dz *= cap/m; }
        } else if (this.parent){
            const P = this.parent; if (P.dead){ this.dead = true; return; }
            if (this.t > this.nextWander){ this.wanderX = rand(-3,3); this.wanderZ = rand(-3,3); this.nextWander = this.t + rr(A.wanderEvery); }
            const tx = clamp(P.x + this.wanderX, -W+0.5, W-0.5), tz = P.z + this.wanderZ;
            const ex = tx-this.x, ez = tz-this.z, d = Math.hypot(ex,ez);
            if (d > 0.4){ dx = ex/d*this.speed; dz = ez/d*this.speed; }
        } else {
            if (this.t > this.nextWander){ this.wanderX = rand(-W+0.7, W-0.7); this.nextWander = this.t + rr(A.wanderEvery); }
            const lat = clamp((this.wanderX-this.x)*0.8, -1, 1) * A.wander;
            dx = lat; dz = this.dir;
            const m = Math.hypot(dx,dz); dx = dx/m*this.speed; dz = dz/m*this.speed;
        }
        if (this.t > this.nextStop){ this.stopUntil = this.t + rr(A.stopFor); this.nextStop = this.stopUntil + rr(A.stopEvery); }
        if (this.stopUntil > this.t){ dx = 0; dz = 0; }
        // separation from neighbours (group mates excluded)
        let sx = 0, sz = 0; const cx = this.cx, cz = this.cz;
        forNeighbors(cx, cz, o => {
            if (o === this || o.dead) return;
            if (this.group && o.group === this.group) return;
            const ex = cx-o.cx, ez = cz-o.cz, R = A.sepR + o.r, d2 = ex*ex+ez*ez;
            if (d2 > R*R || d2 < 1e-6) return;
            const d = Math.sqrt(d2), f = (1-d/R)/d; sx += ex*f; sz += ez*f;
        });
        dx += sx*A.sepW; dz += sz*A.sepW;
        { const ex = cx-player.x, ez = cz-player.z, R = A.sepR + player.r, d2 = ex*ex+ez*ez;
            if (d2 < R*R && d2 > 1e-6){ const d = Math.sqrt(d2), f = (1-d/R)/d*A.sepW*A.avoidPlayer; dx += ex*f; dz += ez*f; } }
        // soft wall repulsion
        const lim = W - this.r - 0.6;
        if (this.x > lim) dx -= (this.x-lim)*4; if (this.x < -lim) dx += (-lim-this.x)*4;
        // steer toward desired velocity
        let ax = dx-this.vx, az = dz-this.vz; const al = Math.hypot(ax,az);
        if (al > A.accel){ ax *= A.accel/al; az *= A.accel/al; }
        this.vx += ax*dt; this.vz += az*dt;
        const sp = Math.hypot(this.vx,this.vz), cap = this.speed*1.4;
        if (sp > cap){ this.vx *= cap/sp; this.vz *= cap/sp; }
        this.x += this.vx*dt; this.z += this.vz*dt;
        this.x = clamp(this.x, -W+this.r, W-this.r);
        // heading, lean, gait
        const s2 = Math.hypot(this.vx,this.vz);
        if (s2 > 0.15){
            const d = wrapAngle(Math.atan2(this.vx,this.vz) - this.yaw);
            this.yaw += d*Math.min(1, dt*8); this.lean = clamp(-d*0.8, -0.25, 0.25);
            this.hx = Math.sin(this.yaw); this.hz = Math.cos(this.yaw);
        } else this.lean *= 0.9;
        this.mv += (clamp(s2/this.speed, 0, 1) - this.mv) * Math.min(1, dt*10);
        this.phase += s2*dt*this.recipe.gait.cadence;
        if (!this.leader && !this.parent && this.z*this.dir > L+4) this.dead = true;
    }
}

function spawn(){
    const type = weightedType(), A = ARCH[type];
    let x, z, dir = Math.random() < 0.5 ? 1 : -1;
    if (Math.random() < 0.25){ const d = pick(DOORS); x = d.x > 0 ? W-0.8 : -W+0.8; z = d.z; }
    else { z = -dir*(L+2); x = rand(-W+1, W-1); }
    if (freeSlots.length < 5) return;
    if (A.group){
        const n = Math.round(rr(A.group)), gid = ++groupSeq, shirt = pick(SHIRT.green);
        const leader = new Agent(type, x, z, dir, { group: gid, shirt });
        agents.push(leader);
        for (let i = 1; i < n; i++){
            const off = (i%2 ? 1 : -1) * Math.ceil(i/2) * A.spacing;
            agents.push(new Agent(type, clamp(x+off, -W+0.6, W-0.6), z, dir, { leader, offset: off, group: gid, shirt, speed: leader.speed }));
        }
    } else if (A.parentType){
        const parent = new Agent(A.parentType, x, z, dir);
        agents.push(parent);
        agents.push(new Agent(type, clamp(x+rand(-1,1), -W+0.5, W-0.5), z, dir, { parent }));
    } else agents.push(new Agent(type, x, z, dir));
}

// ---------- player ----------
const player = { x:0, z:L-3, yaw:Math.PI, r:0.32, vx:0, vz:0, phase:0, mv:0, lean:0,
    recipe: makeRecipe(ARCH.tourist, { shirt: 0xf2f0ea }) };
player.recipe.h = 1.0; player.recipe.hat = 'cap'; player.recipe.hatColor = 0xd9534f; player.recipe.hair = 'none'; player.recipe.acc = 'none';
let bumps = 0, elapsed = 0, running = false, finished = false;

// ---------- input: one abstraction, two adapters ----------
const input = { x:0, y:0, mag:0, hurry:false };
const keys = {};
addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyC') cycleCamera();
    if (e.code === 'KeyO') toggleInk();
    if (e.code === 'BracketLeft') setCount(targetCount-10);
    if (e.code === 'BracketRight') setCount(targetCount+10);
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });

const stickEl = document.getElementById('stick'), knobEl = document.getElementById('knob');
let stick = null;
renderer.domElement.addEventListener('pointerdown', e => {
    if (!running) return;
    stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
    stickEl.style.display = 'block'; stickEl.style.left = (e.clientX-60)+'px'; stickEl.style.top = (e.clientY-60)+'px';
    knobEl.style.transform = 'translate(0,0)';
});
addEventListener('pointermove', e => {
    if (!stick || e.pointerId !== stick.id) return;
    let dx = e.clientX-stick.ox, dy = e.clientY-stick.oy; const d = Math.hypot(dx,dy), R = 50;
    if (d > R){ dx *= R/d; dy *= R/d; }
    knobEl.style.transform = `translate(${dx}px,${dy}px)`;
    stick.x = dx/R; stick.y = -dy/R;
});
const endStick = e => { if (stick && e.pointerId === stick.id){ stick = null; stickEl.style.display = 'none'; } };
addEventListener('pointerup', endStick); addEventListener('pointercancel', endStick);

function readInput(){
    let x = 0, y = 0;
    if (stick){ x = stick.x || 0; y = stick.y || 0; }
    else {
        if (keys.KeyW || keys.ArrowUp) y += 1; if (keys.KeyS || keys.ArrowDown) y -= 1;
        if (keys.KeyD || keys.ArrowRight) x += 1; if (keys.KeyA || keys.ArrowLeft) x -= 1;
    }
    const m = Math.hypot(x,y);
    input.mag = Math.min(1, m);
    if (m > 1){ x /= m; y /= m; }
    input.x = x; input.y = y;
    input.hurry = !!(keys.ShiftLeft || keys.ShiftRight) || (stick && m > 0.85);
}

// ---------- camera ----------
let camYaw = Math.PI;          // three.js convention: forward = (-sin, 0, -cos)
const camPos = new THREE.Vector3(0, 3, L+2), camTarget = new THREE.Vector3();
function cycleCamera(){
    camMode = camMode === 'shoulder' ? 'first' : camMode === 'first' ? 'top' : 'shoulder';
    document.getElementById('cam').textContent = 'Camera: ' + camMode;
}
function updateCamera(dt){
    if (camMode === 'shoulder'){
        const target = player.yaw + Math.PI;
        camYaw += wrapAngle(target - camYaw) * Math.min(1, dt*3);
        const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
        camPos.lerp(_p.set(player.x - fx*4.2, 2.7, player.z - fz*4.2), Math.min(1, dt*6));
        camera.up.set(0,1,0); camera.position.copy(camPos);
        camera.lookAt(camTarget.set(player.x + fx*2.5, 1.1, player.z + fz*2.5));
        return camera;
    }
    if (camMode === 'first'){
        camYaw = player.yaw + Math.PI;
        camera.up.set(0,1,0);
        camera.position.set(player.x, 1.55 + Math.sin(player.phase*2)*0.03*player.mv, player.z);
        camera.rotation.set(-0.08, camYaw, 0);
        camPos.copy(camera.position);
        return camera;
    }
    camYaw = 0;
    topCam.up.set(0,0,-1); topCam.position.set(player.x, 40, player.z);
    topCam.lookAt(player.x, 0, player.z);
    return topCam;
}

// ---------- ui ----------
function setCount(n){ targetCount = clamp(n, 10, MAX-10); document.getElementById('count').textContent = targetCount; }
function toggleInk(){ inkOn = !inkOn; for (const k in pools) pools[k].out.visible = inkOn; document.getElementById('ink').textContent = 'Ink: ' + (inkOn ? 'on' : 'off'); }
document.getElementById('less').onclick = () => setCount(targetCount-10);
document.getElementById('more').onclick = () => setCount(targetCount+10);
document.getElementById('cam').onclick = cycleCamera;
document.getElementById('ink').onclick = toggleInk;
setCount(targetCount);
const legend = document.getElementById('legend');
for (const k of ARCH_KEYS){
    const A = ARCH[k]; const row = document.createElement('div');
    row.innerHTML = `<i style="background:#${A.color.toString(16).padStart(6,'0')}"></i>${A.name} <span>${A.desc}</span>`;
    legend.appendChild(row);
}
const overlay = document.getElementById('overlay'), flashEl = document.getElementById('flash');
document.getElementById('start').onclick = () => {
    if (finished){ player.x = 0; player.z = L-3; player.yaw = Math.PI; player.vx = player.vz = 0; camYaw = Math.PI; camPos.set(0,3,L+2); bumps = 0; elapsed = 0; finished = false; }
    overlay.style.display = 'none'; running = true;
};
function finish(){
    running = false; finished = true;
    document.querySelector('#overlay h1').textContent = 'Made it';
    document.getElementById('result').textContent = `${elapsed.toFixed(1)} seconds, ${bumps} bump${bumps === 1 ? '' : 's'}.`;
    document.getElementById('start').textContent = 'Go again';
    overlay.style.display = 'flex';
}
function flash(){ flashEl.style.opacity = 1; setTimeout(() => flashEl.style.opacity = 0, 120); }

addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
    const a = innerWidth/innerHeight, h = 22;
    topCam.left = -h*a; topCam.right = h*a; topCam.top = h; topCam.bottom = -h; topCam.updateProjectionMatrix();
});
dispatchEvent(new Event('resize'));

// ---------- main loop ----------
let last = performance.now(), spawnTimer = 0, fpsFrames = 0, fpsTime = 0;
function frame(now){
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now-last)/1000); last = now;
    const t = now/1000;

    // crowd population
    spawnTimer -= dt;
    if (agents.length < targetCount && spawnTimer <= 0){ spawn(); spawnTimer = 0.15; }

    // player
    readInput();
    if (running){
        elapsed += dt;
        let mx = 0, mz = 0;
        if (camMode === 'first'){
            player.yaw -= input.x*dt*2.4;
            mx = Math.sin(player.yaw)*input.y; mz = Math.cos(player.yaw)*input.y;
        } else {
            const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
            mx = fx*input.y + rx*input.x; mz = fz*input.y + rz*input.x;
        }
        const spd = input.hurry ? 2.4 : 1.7*Math.min(1, input.mag/0.85);
        const tvx = mx*spd, tvz = mz*spd;
        player.vx += (tvx-player.vx)*Math.min(1, dt*9); player.vz += (tvz-player.vz)*Math.min(1, dt*9);
        player.x = clamp(player.x + player.vx*dt, -W+player.r, W-player.r);
        player.z = clamp(player.z + player.vz*dt, -L-1, L+1);
        const ps = Math.hypot(player.vx, player.vz);
        if (ps > 0.2 && camMode !== 'first'){
            const d = wrapAngle(Math.atan2(player.vx, player.vz) - player.yaw);
            player.yaw += d*Math.min(1, dt*10); player.lean = clamp(-d*0.6, -0.2, 0.2);
        } else player.lean *= 0.9;
        player.mv += (clamp(ps/1.7, 0, 1) - player.mv)*Math.min(1, dt*10);
        player.phase += ps*dt*player.recipe.gait.cadence;
        if (player.z < -(L-4)) finish();
    }

    // agents
    rebuildGrid();
    for (const a of agents) a.update(dt, player);
    // hard overlap resolution between agents
    rebuildGrid();
    for (const a of agents){
        if (a.dead) continue;
        forNeighbors(a.cx, a.cz, o => {
            if (o.dead || o.slot <= a.slot) return;
            const ex = o.cx-a.cx, ez = o.cz-a.cz, R = a.r+o.r, d2 = ex*ex+ez*ez;
            if (d2 >= R*R || d2 < 1e-6) return;
            const d = Math.sqrt(d2), push = (R-d)/2, nx = ex/d, nz = ez/d;
            a.x -= nx*push; a.z -= nz*push; o.x += nx*push; o.z += nz*push;
        });
    }
    // player collisions -> bumps
    forNeighbors(player.x, player.z, a => {
        if (a.dead) return;
        const ex = player.x-a.cx, ez = player.z-a.cz, R = player.r+a.r, d2 = ex*ex+ez*ez;
        if (d2 >= R*R || d2 < 1e-6) return;
        const d = Math.sqrt(d2), nx = ex/d, nz = ez/d;
        player.x += nx*(R-d); player.z += nz*(R-d);
        if (running && a.bumpCd <= 0){
            bumps++; a.bumpCd = 1.2; a.stopUntil = a.t + 0.8; a.vx = -nx*0.6; a.vz = -nz*0.6;
            player.vx += nx*1.5; player.vz += nz*1.5; flash();
        }
    });
    // reap
    for (let i = agents.length-1; i >= 0; i--){
        if (agents[i].dead){ freeSlot(agents[i].slot); freeSlots.push(agents[i].slot); agents.splice(i,1); }
    }

    // draw people
    for (const a of agents) drawPerson(a.slot, a.recipe, a.x, a.z, a.yaw, a.phase, a.mv, a.lean, t);
    if (camMode === 'first') freeSlot(PLAYER_SLOT);
    else drawPerson(PLAYER_SLOT, player.recipe, player.x, player.z, player.yaw, player.phase, player.mv, player.lean, t);
    for (const k in pools){ const P = pools[k]; P.mesh.instanceMatrix.needsUpdate = true; P.out.instanceMatrix.needsUpdate = true; P.mesh.instanceColor.needsUpdate = true; }
    wheel.rotation.z = t*0.15;

    const cam = updateCamera(dt);
    renderer.render(scene, cam);

    // hud
    document.getElementById('time').textContent = elapsed.toFixed(1) + 's';
    document.getElementById('bumps').textContent = bumps + (bumps === 1 ? ' bump' : ' bumps');
    fpsFrames++; fpsTime += dt;
    if (fpsTime >= 0.5){
        document.getElementById('fps').textContent = `${Math.round(fpsFrames/fpsTime)} fps · ${agents.length} people · ${renderer.info.render.calls} draw calls`;
        fpsFrames = 0; fpsTime = 0;
    }
}
requestAnimationFrame(frame);