/* ===========================================================================
 * DEAD SECTOR — a self-contained top-down zombie survival shooter.
 * Vanilla Canvas 2D + Web Audio. No build step, no dependencies, no assets.
 * =========================================================================== */
'use strict';

/* ----------------------------- Math helpers ----------------------------- */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
function normAngle(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }

// Returns true when a wall AABB clips the segment (x1,y1)→(x2,y2).
function segBlockedByRect(x1, y1, x2, y2, rx, ry, rw, rh) {
  const dx = x2 - x1, dy = y2 - y1;
  let t0 = 0, t1 = 1;
  const ps = [-dx, dx, -dy, dy], qs = [x1 - rx, rx + rw - x1, y1 - ry, ry + rh - y1];
  for (let i = 0; i < 4; i++) {
    if (ps[i] === 0) { if (qs[i] < 0) return false; }
    else { const r = qs[i] / ps[i]; if (ps[i] < 0) { if (r > t0) t0 = r; } else { if (r < t1) t1 = r; } }
    if (t0 > t1) return false;
  }
  return true;
}
// True when no interior wall blocks line-of-sight from (px,py) to (tx,ty).
function hasLOS(px, py, tx, ty) {
  for (const w of walls) {
    // Skip border walls (they surround the playfield; both points are inside them).
    if (w.w >= WORLD.w - 2 || w.h >= WORLD.h - 2) continue;
    if (segBlockedByRect(px, py, tx, ty, w.x, w.y, w.w, w.h)) return false;
  }
  return true;
}
// Returns the closest zombie in the player's firing arc with LOS, or null.
// Firing arc = same half-angle as the flashlight cone so "visible = shootable".
function findTarget() {
  if (!player || !zombies) return null;
  const w = player.weapon;
  const range = w.range || 0;
  let best = null, bestD2 = Infinity;
  for (const z of zombies) {
    if (z.dying) continue;
    const d2 = dist2(player.x, player.y, z.x, z.y);
    if (d2 > range * range) continue;
    const angle = normAngle(Math.atan2(z.y - player.y, z.x - player.x) - player.facing);
    if (Math.abs(angle) > CONE_HALF) continue;
    if (!hasLOS(player.x, player.y, z.x, z.y)) continue;
    if (d2 < bestD2) { bestD2 = d2; best = z; }
  }
  return best;
}

/* ----------------------------- World / config --------------------------- */
const WORLD = { w: 1100, h: 820 };
const CELL = 44;

const PLAYER_RADIUS = 13;
const PLAYER_SPEED = 168;          // px/s
const ARMOR_MAX = 100, HP_MAX = 100;
const ARMOR_REGEN_DELAY = 4.0;     // s without damage before armor recharges
const ARMOR_REGEN_RATE = 13;       // armor/s

const ZOMBIE_RADIUS = 14;
const ZOMBIE_CONTACT_DMG = 8;
const ZOMBIE_ATTACK_CD = 0.55;

const CONE_HALF = 0.74;            // half-angle of flashlight cone (~42deg)
const CONE_RANGE = 540;
const NEAR_RADIUS = 96;            // full-circle awareness around player

const WEAPONS = {
  pistol:  { key: 'pistol',  name: 'PISTOL',        dmg: 25, rps: 3.3, mag: 12,  reload: 1.2, pellets: 1, spread: 0.04, speed: 760,  range: 560, twin: false, shake: 1.5, maxMags: 3 },
  twin:    { key: 'twin',    name: 'TWIN PISTOLS',  dmg: 22, rps: 6.0, mag: 24,  reload: 1.4, pellets: 1, spread: 0.06, speed: 770,  range: 560, twin: true,  shake: 1.8, maxMags: 3 },
  shotgun: { key: 'shotgun', name: 'SHOTGUN',       dmg: 11, rps: 1.35,mag: 6,   reload: 2.0, pellets: 8, spread: 0.30, speed: 700,  range: 360, twin: false, shake: 5.0, maxMags: 4 },
  smg:     { key: 'smg',     name: 'SMG',           dmg: 13, rps: 11,  mag: 30,  reload: 1.5, pellets: 1, spread: 0.11, speed: 840,  range: 560, twin: false, shake: 1.6, maxMags: 3 },
  m4:      { key: 'm4',      name: 'M4 RIFLE',      dmg: 27, rps: 7.5, mag: 30,  reload: 1.8, pellets: 1, spread: 0.045,speed: 1020, range: 780, twin: false, shake: 2.4, maxMags: 3, pierce: 3 },
  m429:    { key: 'm429',    name: 'M429 MG',       dmg: 21, rps: 13,  mag: 100, reload: 3.0, pellets: 1, spread: 0.13, speed: 1020, range: 780, twin: false, shake: 2.2, maxMags: 2, pierce: Infinity },
  rpg:     { key: 'rpg',     name: 'RPG',           dmg: 0,  rps: 0,   mag: 1,   reload: 0,   special: 'rpg', maxMags: 0 },
};
// Pickup order: pistol -> twin -> shotgun -> smg -> m4 -> m429 (one per cleared round)
const WEAPON_ORDER = ['pistol', 'twin', 'shotgun', 'smg', 'm4', 'm429'];

const RPG = { speed: 480, radius: 260, dmg: 360, edgeDmg: 100 };
const RPG_RESPAWN = 15;            // seconds between RPG spawns in round ∞

// Rounds 1..5; round 6 is endless (handled separately).
const ROUNDS = [
  { count: 10, hp: 50,  speed: 46 },
  { count: 16, hp: 70,  speed: 49 },
  { count: 24, hp: 92,  speed: 53 },
  { count: 34, hp: 120, speed: 57 },
  { count: 46, hp: 152, speed: 61 },
];

/* ----------------------------- Canvas setup ----------------------------- */
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const lightCanvas = document.createElement('canvas');
const lctx = lightCanvas.getContext('2d');
let W = 0, H = 0, DPR = 1;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = Math.floor(W * DPR); canvas.height = Math.floor(H * DPR);
  lightCanvas.width = canvas.width; lightCanvas.height = canvas.height;
}
window.addEventListener('resize', resize);
resize();

/* ----------------------------- Audio (Web Audio synth) ------------------ */
const Audio2 = (() => {
  let actx = null, master = null, muted = false;
  function ensure() {
    if (actx) return;
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain(); master.gain.value = 0.5; master.connect(actx.destination);
  }
  function noiseBuffer(dur) {
    const n = Math.floor(actx.sampleRate * dur);
    const buf = actx.createBuffer(1, n, actx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  function env(node, t, peak, dur, type) {
    const g = node; g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function tone(freq, dur, type, peak, slideTo) {
    if (muted || !actx) return;
    const t = actx.currentTime;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    env(g, t, peak, dur); o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, peak, filterFreq, type) {
    if (muted || !actx) return;
    const t = actx.currentTime;
    const src = actx.createBufferSource(); src.buffer = noiseBuffer(dur);
    const g = actx.createGain(); const f = actx.createBiquadFilter();
    f.type = type || 'lowpass'; f.frequency.value = filterFreq || 1200;
    env(g, t, peak, dur); src.connect(f).connect(g).connect(master); src.start(t); src.stop(t + dur + 0.02);
  }

  const api = {
    init() { ensure(); if (actx.state === 'suspended') actx.resume(); },
    setMuted(m) { muted = m; },
    isMuted() { return muted; },
    shot(weapon) {
      if (!actx) return;
      switch (weapon) {
        case 'shotgun': noise(0.22, 0.6, 1600, 'lowpass'); tone(90, 0.18, 'sawtooth', 0.25, 50); break;
        case 'smg':     noise(0.05, 0.32, 2600, 'highpass'); tone(420, 0.04, 'square', 0.12, 180); break;
        case 'm4':      noise(0.07, 0.4, 2200); tone(260, 0.07, 'sawtooth', 0.2, 110); break;
        case 'm429':    noise(0.06, 0.36, 2000); tone(180, 0.06, 'sawtooth', 0.2, 90); break;
        case 'twin':    noise(0.06, 0.34, 1900); tone(340, 0.05, 'square', 0.16, 150); break;
        default:        noise(0.08, 0.36, 1700); tone(300, 0.07, 'square', 0.18, 130); break; // pistol
      }
    },
    reload() { tone(520, 0.05, 'square', 0.12); setTimeout(() => tone(700, 0.06, 'square', 0.12), 90); },
    reloadDone() { tone(880, 0.07, 'triangle', 0.14); },
    explosion() { noise(0.6, 0.9, 700, 'lowpass'); tone(70, 0.5, 'sawtooth', 0.4, 32); },
    growl() { tone(rand(70, 120), 0.3, 'sawtooth', 0.07, rand(50, 80)); },
    zombieHit() { noise(0.06, 0.18, 900); },
    pickup() { tone(660, 0.08, 'triangle', 0.2); setTimeout(() => tone(990, 0.1, 'triangle', 0.2), 70); },
    weaponPickup() { tone(440, 0.1, 'square', 0.2); setTimeout(() => tone(660, 0.1, 'square', 0.2), 90); setTimeout(() => tone(880, 0.12, 'square', 0.2), 180); },
    hurt() { noise(0.18, 0.4, 500, 'lowpass'); tone(160, 0.16, 'sawtooth', 0.18, 70); },
    roundStart() { tone(330, 0.12, 'square', 0.2); setTimeout(() => tone(440, 0.12, 'square', 0.2), 130); setTimeout(() => tone(660, 0.18, 'square', 0.22), 260); },
    gameOver() { tone(330, 0.3, 'sawtooth', 0.25, 110); setTimeout(() => tone(220, 0.4, 'sawtooth', 0.25, 70), 260); setTimeout(() => tone(140, 0.7, 'sawtooth', 0.25, 50), 540); },
    rpgReady() { tone(740, 0.1, 'triangle', 0.2); setTimeout(() => tone(1100, 0.14, 'triangle', 0.22), 110); },
  };
  return api;
})();

/* ----------------------------- Input ------------------------------------ */
const keys = {};
const mouse = { x: W / 2, y: H / 2, down: false };
let firePressed = false; // edge-trigger for RPG (space / click)

window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (k === 'p' || k === 'escape') { if (state.running) togglePause(); }
  if (k === 'm') toggleMute();
  if (k === ' ') { firePressed = true; e.preventDefault(); }
  if (k === 'r') tryReload();
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
canvas.addEventListener('mousemove', (e) => {
  const r = canvas.getBoundingClientRect();
  mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
});
canvas.addEventListener('mousedown', (e) => { mouse.down = true; if (e.button === 0) firePressed = true; });
window.addEventListener('mouseup', () => { mouse.down = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

/* ----------------------------- Walls / map ------------------------------ */
let walls = [];        // {x,y,w,h}
let wallSegs = [];     // {x1,y1,x2,y2}

function buildMap() {
  const B = 26; // border thickness
  walls = [
    { x: 0, y: 0, w: WORLD.w, h: B },
    { x: 0, y: WORLD.h - B, w: WORLD.w, h: B },
    { x: 0, y: 0, w: B, h: WORLD.h },
    { x: WORLD.w - B, y: 0, w: B, h: WORLD.h },
    // interior cover
    { x: 180, y: 150, w: 120, h: 20 },
    { x: 180, y: 150, w: 20, h: 115 },
    { x: 800, y: 130, w: 20, h: 150 },
    { x: 670, y: 260, w: 150, h: 20 },
    { x: 450, y: 380, w: 180, h: 22 },
    { x: 530, y: 380, w: 22, h: 120 },
    { x: 150, y: 490, w: 140, h: 20 },
    { x: 270, y: 490, w: 20, h: 130 },
    { x: 820, y: 490, w: 20, h: 160 },
    { x: 680, y: 620, w: 160, h: 20 },
    { x: 380, y: 590, w: 110, h: 110 }, // bunker block
    { x: 910, y: 280, w: 80, h: 20 },
    { x: 100, y: 280, w: 20, h: 100 },
    { x: 590, y: 510, w: 20, h: 120 },
  ];
  wallSegs = [];
  for (const w of walls) {
    wallSegs.push({ x1: w.x, y1: w.y, x2: w.x + w.w, y2: w.y });
    wallSegs.push({ x1: w.x + w.w, y1: w.y, x2: w.x + w.w, y2: w.y + w.h });
    wallSegs.push({ x1: w.x + w.w, y1: w.y + w.h, x2: w.x, y2: w.y + w.h });
    wallSegs.push({ x1: w.x, y1: w.y + w.h, x2: w.x, y2: w.y });
  }
}
function pointInWalls(x, y, pad) {
  pad = pad || 0;
  for (const w of walls) {
    if (x > w.x - pad && x < w.x + w.w + pad && y > w.y - pad && y < w.y + w.h + pad) return true;
  }
  return false;
}
// circle-vs-AABB resolution; moves (e) out of walls. Returns adjusted {x,y}.
function collideCircle(x, y, r) {
  for (const w of walls) {
    const cx = clamp(x, w.x, w.x + w.w);
    const cy = clamp(y, w.y, w.y + w.h);
    const dx = x - cx, dy = y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      const d = Math.sqrt(d2) || 0.0001;
      const push = (r - d);
      x += (dx / d) * push; y += (dy / d) * push;
    }
  }
  return { x, y };
}

/* ----------------------------- Flow field ------------------------------- */
const flow = { cols: 0, rows: 0, blocked: null, dist: null, fx: null, fy: null, queue: null };
function initFlow() {
  flow.cols = Math.ceil(WORLD.w / CELL);
  flow.rows = Math.ceil(WORLD.h / CELL);
  const n = flow.cols * flow.rows;
  flow.blocked = new Uint8Array(n);
  flow.dist = new Float32Array(n);
  flow.fx = new Float32Array(n);
  flow.fy = new Float32Array(n);
  flow.queue = new Int32Array(n);
  for (let r = 0; r < flow.rows; r++) {
    for (let c = 0; c < flow.cols; c++) {
      const x = c * CELL + CELL / 2, y = r * CELL + CELL / 2;
      flow.blocked[r * flow.cols + c] = pointInWalls(x, y, ZOMBIE_RADIUS - 2) ? 1 : 0;
    }
  }
}
function rebuildFlow(tx, ty) {
  const C = flow.cols, R = flow.rows, n = C * R;
  flow.dist.fill(Infinity);
  let pc = clamp(Math.floor(tx / CELL), 0, C - 1);
  let pr = clamp(Math.floor(ty / CELL), 0, R - 1);
  let start = pr * C + pc;
  if (flow.blocked[start]) { // nudge to nearest free cell
    let best = -1, bd = Infinity;
    for (let i = 0; i < n; i++) if (!flow.blocked[i]) {
      const cc = i % C, rr = (i / C) | 0;
      const d = (cc - pc) * (cc - pc) + (rr - pr) * (rr - pr);
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) start = best;
  }
  const q = flow.queue; let head = 0, tail = 0;
  flow.dist[start] = 0; q[tail++] = start;
  while (head < tail) {
    const cur = q[head++]; const cc = cur % C, rr = (cur / C) | 0; const cd = flow.dist[cur];
    // 4-neighbour BFS
    if (cc > 0)   { const ni = cur - 1; if (!flow.blocked[ni] && flow.dist[ni] === Infinity) { flow.dist[ni] = cd + 1; q[tail++] = ni; } }
    if (cc < C-1) { const ni = cur + 1; if (!flow.blocked[ni] && flow.dist[ni] === Infinity) { flow.dist[ni] = cd + 1; q[tail++] = ni; } }
    if (rr > 0)   { const ni = cur - C; if (!flow.blocked[ni] && flow.dist[ni] === Infinity) { flow.dist[ni] = cd + 1; q[tail++] = ni; } }
    if (rr < R-1) { const ni = cur + C; if (!flow.blocked[ni] && flow.dist[ni] === Infinity) { flow.dist[ni] = cd + 1; q[tail++] = ni; } }
  }
  // flow vectors: point toward 8-neighbour with lowest dist
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const i = r * C + c;
      if (flow.blocked[i]) { flow.fx[i] = 0; flow.fy[i] = 0; continue; }
      let bestD = flow.dist[i], bx = 0, by = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= C || nr >= R) continue;
        const ni = nr * C + nc; if (flow.blocked[ni]) continue;
        if (flow.dist[ni] < bestD) { bestD = flow.dist[ni]; bx = dc; by = dr; }
      }
      const m = Math.hypot(bx, by) || 1; flow.fx[i] = bx / m; flow.fy[i] = by / m;
    }
  }
}
function flowAt(x, y) {
  const c = clamp(Math.floor(x / CELL), 0, flow.cols - 1);
  const r = clamp(Math.floor(y / CELL), 0, flow.rows - 1);
  const i = r * flow.cols + c;
  return { fx: flow.fx[i], fy: flow.fy[i], reachable: flow.dist[i] !== Infinity };
}

/* ----------------------------- Visibility raycast ----------------------- */
function raySeg(ox, oy, dx, dy, s) {
  const sx = s.x2 - s.x1, sy = s.y2 - s.y1;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-9) return Infinity;
  const t2 = ((s.x1 - ox) * dy - (s.y1 - oy) * dx) / denom;
  if (t2 < 0 || t2 > 1) return Infinity;
  const t1 = ((s.x1 - ox) * sy - (s.y1 - oy) * sx) / denom;
  if (t1 < 0) return Infinity;
  return t1;
}
function computeVisibility(px, py, facing) {
  const angles = [-CONE_HALF, CONE_HALF];
  // wall corners within cone
  for (const s of wallSegs) {
    for (const [ex, ey] of [[s.x1, s.y1], [s.x2, s.y2]]) {
      const d = normAngle(Math.atan2(ey - py, ex - px) - facing);
      if (d >= -CONE_HALF - 0.02 && d <= CONE_HALF + 0.02) {
        angles.push(clamp(d - 0.0008, -CONE_HALF, CONE_HALF));
        angles.push(clamp(d + 0.0008, -CONE_HALF, CONE_HALF));
      }
    }
  }
  const STEPS = 28;
  for (let i = 0; i <= STEPS; i++) angles.push(-CONE_HALF + (2 * CONE_HALF) * i / STEPS);
  angles.sort((a, b) => a - b);
  const pts = [];
  for (const rel of angles) {
    const a = facing + rel;
    const dx = Math.cos(a), dy = Math.sin(a);
    let best = CONE_RANGE;
    for (const s of wallSegs) { const t = raySeg(px, py, dx, dy, s); if (t < best) best = t; }
    pts.push({ rel, x: px + dx * best, y: py + dy * best });
  }
  return pts;
}

/* ----------------------------- Entities --------------------------------- */
let player, zombies, bullets, rockets, pickups, oilCans, particles, dmgNums, decals;

function freshPlayer() {
  return {
    x: WORLD.w / 2, y: WORLD.h / 2, r: PLAYER_RADIUS,
    hp: HP_MAX, armor: 0, armorBroken: true, armorUnlocked: false,
    facing: 0, weapon: WEAPONS.pistol, ammo: WEAPONS.pistol.mag,
    mags: WEAPONS.pistol.maxMags,  // spare magazines (not counting current mag)
    fireCd: 0, reloading: false, reloadT: 0, reloadDur: 0,
    sinceHit: 99, walkPhase: 0, moving: false, twinSide: 1,
    prevWeaponKey: 'm429',
    muzzle: 0,
  };
}

function spawnParticle(x, y, vx, vy, life, size, color, kind) {
  particles.push({ x, y, vx, vy, life, max: life, size, color, kind: kind || 'spark' });
}
function blood(x, y, amt) {
  for (let i = 0; i < amt; i++) {
    const a = rand(0, TAU), s = rand(30, 160);
    spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.3, 0.7), rand(2, 4), '#9e1b1b', 'blood');
  }
  decals.push({ x: x + rand(-6, 6), y: y + rand(-6, 6), r: rand(6, 13), a: 0.5 });
  if (decals.length > 120) decals.shift();
}
function muzzleFlash(x, y, a) {
  for (let i = 0; i < 5; i++) {
    const sp = rand(120, 320), aa = a + rand(-0.3, 0.3);
    spawnParticle(x, y, Math.cos(aa) * sp, Math.sin(aa) * sp, rand(0.06, 0.14), rand(2, 4), '#ffd86b', 'spark');
  }
}
function dmgNumber(x, y, val, crit) {
  dmgNums.push({ x: x + rand(-6, 6), y, val: Math.round(val), life: 0.7, crit: !!crit });
}

/* ----------------------------- Game state ------------------------------- */
const state = {
  running: false, paused: false,
  round: 1, phase: 'active', // active | intermission
  toSpawn: 0, spawnTimer: 0, intermT: 0,
  r6time: 0, rpgTimer: RPG_RESPAWN,
  score: 0, kills: 0,
  shake: 0, vignette: 0,
  dropTimer: 8,
  flowTick: 0,
  oilRespawnTimer: 60,
};
let camX = 0, camY = 0;

/* ----------------------------- Round handling --------------------------- */
function startGame() {
  buildMap(); initFlow();
  player = freshPlayer();
  zombies = []; bullets = []; rockets = []; pickups = []; particles = []; dmgNums = []; decals = [];
  buildOilCans();
  state.running = true; state.paused = false;
  state.round = 0; state.score = 0; state.kills = 0;
  state.shake = 0; state.vignette = 0; state.rpgTimer = RPG_RESPAWN; state.r6time = 0; state.dropTimer = 8; state.oilRespawnTimer = 60;
  rebuildFlow(player.x, player.y);
  document.getElementById('pause-overlay').classList.remove('show');
  showScreen('screen-game');
  Audio2.init();
  nextRound();
}

function nextRound() {
  state.round++;
  state.phase = 'active';
  if (state.round <= 5) {
    state.toSpawn = ROUNDS[state.round - 1].count;
    state.spawnTimer = 0.5;
  } else {
    // endless
    state.toSpawn = Infinity;
    state.spawnTimer = 1.0;
    state.r6time = 0;
    state.rpgTimer = RPG_RESPAWN;
    state.oilRespawnTimer = 60;
  }
  if (state.round >= 3) buildOilCans(); else oilCans = [];
  if (state.round === 4 && !player.armorUnlocked) spawnPickup('armor');
  banner(state.round >= 6 ? 'ROUND ∞' : 'ROUND ' + state.round, state.round >= 6 ? 'ENDLESS — SURVIVE' : roundSub());
  Audio2.roundStart();
}
function roundSub() {
  const subs = ['CONTACT', 'THEY KEEP COMING', 'HOLD THE LINE', 'OVERRUN', 'FINAL STAND'];
  return subs[clamp(state.round - 1, 0, 4)];
}
function roundCleared() {
  if (state.round <= 5) {
    // drop the next weapon as a pickup near the player
    const wk = WEAPON_ORDER[state.round]; // round 1 cleared -> index 1 (twin) ... round5 -> m429
    if (wk) spawnPickup('weapon', wk);
    banner('ROUND ' + state.round + ' CLEARED', wk ? 'NEW WEAPON DROPPED' : '');
    state.phase = 'intermission';
    state.intermT = 3.2;
  }
}

function banner(text, sub) {
  const el = document.getElementById('round-banner');
  el.innerHTML = text + (sub ? '<span class="sub">' + sub + '</span>' : '');
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}

/* ----------------------------- Spawning --------------------------------- */
function spawnZombie() {
  const cfg = state.round <= 5 ? ROUNDS[state.round - 1] : null;
  let hp, speed;
  if (cfg) { hp = cfg.hp; speed = cfg.speed; }
  else {
    // round 6 endless ramp
    const t = state.r6time;
    hp = Math.min(300, 150 + t * 2.4);
    speed = 52 + Math.min(26, t * 0.22);
  }
  // pick a spawn point on a ring just outside view, inside the world, not in a wall
  let x, y, tries = 0;
  const ring = Math.max(W, H) * 0.62 + 120;
  do {
    const a = rand(0, TAU);
    x = clamp(player.x + Math.cos(a) * ring, 40, WORLD.w - 40);
    y = clamp(player.y + Math.sin(a) * ring, 40, WORLD.h - 40);
    tries++;
  } while (pointInWalls(x, y, ZOMBIE_RADIUS + 4) && tries < 30);
  zombies.push({
    x, y, r: ZOMBIE_RADIUS, hp, maxhp: hp, speed: speed * rand(0.85, 1.12),
    attackCd: 0, hitFlash: 0, wob: rand(0, TAU), dead: false, dying: 0,
    vx: 0, vy: 0,
  });
}

function spawnPickup(type, weaponKey) {
  // place near player but not in a wall
  let x, y, tries = 0;
  do {
    const a = rand(0, TAU), d = rand(90, 230);
    x = clamp(player.x + Math.cos(a) * d, 50, WORLD.w - 50);
    y = clamp(player.y + Math.sin(a) * d, 50, WORLD.h - 50);
    tries++;
  } while (pointInWalls(x, y, 18) && tries < 30);
  pickups.push({ type, weaponKey: weaponKey || null, x, y, age: 0, ttl: type === 'weapon' ? Infinity : 26 });
}
function spawnRPG() {
  let x, y, tries = 0;
  do {
    const a = rand(0, TAU), d = rand(140, 360);
    x = clamp(player.x + Math.cos(a) * d, 50, WORLD.w - 50);
    y = clamp(player.y + Math.sin(a) * d, 50, WORLD.h - 50);
    tries++;
  } while (pointInWalls(x, y, 18) && tries < 30);
  pickups.push({ type: 'weapon', weaponKey: 'rpg', x, y, age: 0, ttl: RPG_RESPAWN - 3 });
  Audio2.rpgReady();
}
function randomDrop() {
  const choices = ['ammo'];
  if (player.hp < HP_MAX) choices.push('health', 'health');
  if (state.round >= 4 && (!player.armorUnlocked || player.armorBroken)) choices.push('armor', 'armor');
  spawnPickup(choices[Math.floor(Math.random() * choices.length)]);
}

/* ----------------------------- Oil cans --------------------------------- */
const OIL_CAN_POSITIONS = [
  { x: 240, y: 200 }, { x: 620, y: 160 }, { x: 920, y: 210 },
  { x: 130, y: 420 }, { x: 400, y: 450 }, { x: 730, y: 350 },
  { x: 330, y: 560 }, { x: 760, y: 570 }, { x: 200, y: 720 },
  { x: 880, y: 690 }, { x: 540, y: 710 },
];
function buildOilCans() {
  oilCans = OIL_CAN_POSITIONS
    .filter(p => !pointInWalls(p.x, p.y, 14))
    .map(p => ({ x: p.x, y: p.y, r: 9 }));
}
function explodeOilCan(x, y) {
  const RADIUS = 95;
  state.shake = Math.max(state.shake, 9);
  Audio2.explosion();
  for (let i = 0; i < 28; i++) {
    const a = rand(0, TAU), s = rand(60, 320);
    spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s,
      rand(0.4, 1.0), rand(4, 9), Math.random() < 0.55 ? '#ff7a18' : '#ffd24a', 'explosion');
  }
  for (let i = 0; i < 12; i++) {
    const a = rand(0, TAU), s = rand(10, 70);
    spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s - 20,
      rand(0.7, 1.4), rand(7, 14), '#555', 'smoke');
  }
  decals.push({ x, y, r: 30, a: 0.55 });
  for (const z of zombies) {
    if (z.dying) continue;
    const d = dist(z.x, z.y, x, y);
    if (d < RADIUS) {
      damageZombie(z, lerp(220, 55, clamp(d / RADIUS, 0, 1)), x, y, true);
    }
  }
}

/* ----------------------------- Weapons / firing ------------------------- */
function muzzlePos() {
  const len = 18;
  return { x: player.x + Math.cos(player.facing) * len, y: player.y + Math.sin(player.facing) * len };
}
function tryReload() {
  if (!state.running || state.paused || !player) return;
  const w = player.weapon;
  if (w.special === 'rpg' || player.reloading) return;
  if (player.ammo >= w.mag || player.mags <= 0) return;
  startReload();
}
function startReload() {
  const w = player.weapon;
  player.mags--;
  player.reloading = true; player.reloadT = 0; player.reloadDur = w.reload;
  Audio2.reload();
}
function fireWeapon() {
  const w = player.weapon;
  const m = muzzlePos();
  const pierce = w.pierce || 0;
  // Twin pistols: offset bullet origin perpendicular to facing, alternating sides.
  // twinSide is captured before toggling so each shot comes from a distinct barrel.
  let bx = m.x, by = m.y;
  if (w.twin) {
    const perp = 5; // half-separation between the two barrels
    bx += -Math.sin(player.facing) * player.twinSide * perp;
    by +=  Math.cos(player.facing) * player.twinSide * perp;
  }
  for (let p = 0; p < w.pellets; p++) {
    const a = player.facing + rand(-w.spread, w.spread);
    bullets.push({
      x: bx, y: by, vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed,
      dmg: w.dmg, dist: 0, range: w.range, r: 2.4,
      pierce, hitSet: pierce > 0 ? new Set() : null,
    });
  }
  muzzleFlash(bx, by, player.facing);
  player.muzzle = 0.05;
  state.shake = Math.max(state.shake, w.shake);
  Audio2.shot(w.key);
  player.ammo--;
  if (w.twin) player.twinSide *= -1;
  if (player.ammo <= 0 && player.mags > 0) startReload();
}
function fireRPG() {
  const m = muzzlePos();
  rockets.push({ x: m.x, y: m.y, vx: Math.cos(player.facing) * RPG.speed, vy: Math.sin(player.facing) * RPG.speed, dist: 0, smoke: 0 });
  state.shake = Math.max(state.shake, 4);
  Audio2.shot('rpg'); Audio2.reload();
  // revert to M429
  equipWeapon('m429');
}
function equipWeapon(key) {
  const w = WEAPONS[key];
  if (key !== 'rpg') player.prevWeaponKey = key;
  player.weapon = w;
  player.ammo = w.mag;
  player.mags = w.maxMags;
  player.reloading = false; player.fireCd = 0;
}
function explodeRocket(x, y) {
  state.shake = Math.max(state.shake, 14);
  Audio2.explosion();
  for (let i = 0; i < 55; i++) {
    const a = rand(0, TAU), s = rand(100, 640);
    spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.4, 1.0), rand(4, 9),
      Math.random() < 0.5 ? '#ff7a18' : '#ffd24a', 'explosion');
  }
  for (let i = 0; i < 24; i++) {
    const a = rand(0, TAU), s = rand(20, 130);
    spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.7, 1.5), rand(10, 20), '#444', 'smoke');
  }
  decals.push({ x, y, r: RPG.radius * 0.5, a: 0.4 });
  for (const z of zombies) {
    if (z.dying) continue;
    const d = dist(z.x, z.y, x, y);
    if (d < RPG.radius) {
      const dmg = lerp(RPG.dmg, RPG.edgeDmg, clamp(d / RPG.radius, 0, 1));
      damageZombie(z, dmg, x, y, true);
    }
  }
}

/* ----------------------------- Damage ----------------------------------- */
function damageZombie(z, dmg, fromX, fromY, big) {
  if (z.dying) return;
  z.hp -= dmg; z.hitFlash = 0.12;
  dmgNumber(z.x, z.y - 10, dmg, big);
  blood(z.x, z.y, big ? 10 : 4);
  Audio2.zombieHit();
  // small knockback
  const a = Math.atan2(z.y - fromY, z.x - fromX);
  z.x += Math.cos(a) * (big ? 6 : 2); z.y += Math.sin(a) * (big ? 6 : 2);
  if (z.hp <= 0) killZombie(z);
}
function killZombie(z) {
  z.dying = 0.35; z.dead = true;
  state.kills++; state.score += 10;
  blood(z.x, z.y, 14);
  if (Math.random() < 0.13) randomDropAt(z.x, z.y);
}
function randomDropAt(x, y) {
  if (pointInWalls(x, y, 16)) return;
  const choices = ['ammo'];
  if (player.hp < HP_MAX) choices.push('health', 'health');
  if (state.round >= 4 && (!player.armorUnlocked || player.armorBroken)) choices.push('armor');
  const type = choices[Math.floor(Math.random() * choices.length)];
  pickups.push({ type, weaponKey: null, x, y, age: 0, ttl: 24 });
}
function hurtPlayer(dmg) {
  player.sinceHit = 0;
  if (player.armorBroken) {
    player.hp -= dmg;
  } else if (player.armor > 0) {
    const absorbed = Math.min(player.armor, dmg);
    player.armor -= absorbed;
    const overflow = dmg - absorbed;
    if (overflow > 0) player.hp -= overflow;
    if (player.armor <= 0) { player.armor = 0; player.armorBroken = true; }
  } else {
    player.hp -= dmg;
  }
  state.vignette = 1;
  state.shake = Math.max(state.shake, 3);
  Audio2.hurt();
  if (player.hp <= 0) { player.hp = 0; endGame(); }
}

/* ----------------------------- Pickups apply ---------------------------- */
function applyPickup(p) {
  switch (p.type) {
    case 'health': player.hp = Math.min(HP_MAX, player.hp + 40); Audio2.pickup(); break;
    case 'ammo':
      player.mags = player.weapon.maxMags;
      player.ammo = player.weapon.mag;
      player.reloading = false;
      Audio2.pickup(); break;
    case 'armor':
      player.armorUnlocked = true;
      player.armor = ARMOR_MAX; player.armorBroken = false;
      banner('SHIELD ACTIVATED', 'ARMOR ONLINE');
      Audio2.pickup(); break;
    case 'weapon':
      if (p.weaponKey === 'rpg') { equipWeapon('rpg'); banner('RPG ARMED', 'FIRE: SPACE / CLICK'); }
      else { equipWeapon(p.weaponKey); }
      Audio2.weaponPickup();
      break;
  }
}

/* ----------------------------- Update ----------------------------------- */
function update(dt) {
  // ----- player movement -----
  let mvx = 0, mvy = 0;
  if (keys['w']) mvy -= 1; if (keys['s']) mvy += 1;
  if (keys['a']) mvx -= 1; if (keys['d']) mvx += 1;
  const mlen = Math.hypot(mvx, mvy);
  player.moving = mlen > 0;
  if (mlen > 0) {
    mvx /= mlen; mvy /= mlen;
    player.x += mvx * PLAYER_SPEED * dt;
    player.y += mvy * PLAYER_SPEED * dt;
    player.walkPhase += dt * 10;
  }
  player.x = clamp(player.x, 26, WORLD.w - 26);
  player.y = clamp(player.y, 26, WORLD.h - 26);
  const fixed = collideCircle(player.x, player.y, player.r);
  player.x = fixed.x; player.y = fixed.y;

  // ----- aim (mouse world position) -----
  const mwx = mouse.x + camX, mwy = mouse.y + camY;
  player.facing = Math.atan2(mwy - player.y, mwx - player.x);

  // ----- armor regen -----
  player.sinceHit += dt;
  if (player.armorUnlocked && !player.armorBroken && player.armor < ARMOR_MAX && player.sinceHit >= ARMOR_REGEN_DELAY) {
    player.armor = Math.min(ARMOR_MAX, player.armor + ARMOR_REGEN_RATE * dt);
  }
  if (state.vignette > 0) state.vignette = Math.max(0, state.vignette - dt * 2.2);
  if (player.muzzle > 0) player.muzzle -= dt;

  // ----- firing -----
  if (player.weapon.special === 'rpg') {
    if (firePressed) fireRPG();
  } else {
    if (player.reloading) {
      player.reloadT += dt;
      if (player.reloadT >= player.reloadDur) {
        player.reloading = false; player.ammo = player.weapon.mag; Audio2.reloadDone();
      }
    } else {
      player.fireCd -= dt;
      if (player.fireCd <= 0 && player.ammo > 0 && findTarget()) {
        fireWeapon();
        player.fireCd = 1 / player.weapon.rps;
      }
    }
  }
  firePressed = false;

  // ----- bullets -----
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
    b.dist += Math.hypot(b.vx, b.vy) * dt;
    let hit = false;
    if (pointInWalls(nx, ny, 0)) { spawnParticle(b.x, b.y, rand(-40, 40), rand(-40, 40), 0.12, 2, '#bbb', 'spark'); hit = true; }
    if (!hit) {
      for (const z of zombies) {
        if (z.dying) continue;
        if (b.hitSet && b.hitSet.has(z)) continue;
        if (dist2(nx, ny, z.x, z.y) < (z.r + b.r) * (z.r + b.r)) {
          damageZombie(z, b.dmg, b.x, b.y, false);
          if (b.pierce > 0) {
            b.pierce--;
            if (b.hitSet) b.hitSet.add(z);
          } else {
            hit = true;
          }
          break; // one per tick; hitSet prevents re-hitting on next tick
        }
      }
    }
    if (!hit) {
      for (let ci = oilCans.length - 1; ci >= 0; ci--) {
        const c = oilCans[ci];
        if (dist2(nx, ny, c.x, c.y) < (c.r + b.r) * (c.r + b.r)) {
          explodeOilCan(c.x, c.y);
          oilCans.splice(ci, 1);
          hit = true; break;
        }
      }
    }
    b.x = nx; b.y = ny;
    if (hit || b.dist > b.range) bullets.splice(i, 1);
  }

  // ----- rockets -----
  for (let i = rockets.length - 1; i >= 0; i--) {
    const rk = rockets[i];
    const nx = rk.x + rk.vx * dt, ny = rk.y + rk.vy * dt;
    rk.dist += Math.hypot(rk.vx, rk.vy) * dt;
    rk.smoke -= dt;
    if (rk.smoke <= 0) { spawnParticle(rk.x, rk.y, rand(-12, 12), rand(-12, 12), 0.5, 5, '#777', 'smoke'); rk.smoke = 0.02; }
    let boom = false;
    if (pointInWalls(nx, ny, 0)) boom = true;
    if (!boom) for (const z of zombies) { if (!z.dying && dist2(nx, ny, z.x, z.y) < (z.r + 6) * (z.r + 6)) { boom = true; break; } }
    rk.x = nx; rk.y = ny;
    if (boom || rk.dist > 900) { explodeRocket(rk.x, rk.y); rockets.splice(i, 1); }
  }

  // ----- flow field (periodic) -----
  state.flowTick -= dt;
  if (state.flowTick <= 0) { rebuildFlow(player.x, player.y); state.flowTick = 0.12; }

  // ----- zombies -----
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i];
    if (z.dying) {
      z.dying -= dt;
      if (z.dying <= 0) zombies.splice(i, 1);
      continue;
    }
    if (z.hitFlash > 0) z.hitFlash -= dt;
    z.wob += dt * 6;
    // steering: flow field toward player, fallback direct
    const f = flowAt(z.x, z.y);
    let dx, dy;
    if (f.reachable && (f.fx || f.fy)) { dx = f.fx; dy = f.fy; }
    else { dx = player.x - z.x; dy = player.y - z.y; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m; }
    // separation from nearby zombies
    let sx = 0, sy = 0;
    for (const o of zombies) {
      if (o === z || o.dying) continue;
      const d2 = dist2(z.x, z.y, o.x, o.y);
      if (d2 < (z.r * 2.1) * (z.r * 2.1) && d2 > 0.01) {
        const d = Math.sqrt(d2); sx += (z.x - o.x) / d; sy += (z.y - o.y) / d;
      }
    }
    let vx = dx + sx * 0.6, vy = dy + sy * 0.6;
    const vm = Math.hypot(vx, vy) || 1; vx /= vm; vy /= vm;
    z.x += vx * z.speed * dt; z.y += vy * z.speed * dt;
    const cz = collideCircle(z.x, z.y, z.r); z.x = cz.x; z.y = cz.y;
    // attack player
    z.attackCd -= dt;
    if (dist2(z.x, z.y, player.x, player.y) < (z.r + player.r) * (z.r + player.r)) {
      if (z.attackCd <= 0) { hurtPlayer(ZOMBIE_CONTACT_DMG); z.attackCd = ZOMBIE_ATTACK_CD; }
    }
    if (!state.running) break;
  }
  if (!state.running) return;

  // ----- spawning / round logic -----
  if (state.phase === 'active') {
    if (state.round <= 5) {
      if (state.toSpawn > 0) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          spawnZombie(); state.toSpawn--;
          if (Math.random() < 0.2) Audio2.growl();
          const base = clamp(0.95 - state.round * 0.08, 0.35, 0.95);
          state.spawnTimer = base * rand(0.7, 1.2);
        }
      } else if (zombies.length === 0) {
        roundCleared();
      }
    } else {
      // round 6 endless
      state.r6time += dt;
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        const alive = zombies.reduce((n, z) => n + (z.dying ? 0 : 1), 0);
        const zombieCap = 30 + Math.floor(state.r6time / 60) * 5;
        if (alive < zombieCap) {
          const batch = clamp(1 + Math.floor(state.r6time / 40), 1, zombieCap - alive);
          for (let k = 0; k < batch; k++) spawnZombie();
          if (Math.random() < 0.3) Audio2.growl();
        }
        const interval = clamp(1.2 - state.r6time * 0.012, 0.32, 1.2);
        state.spawnTimer = interval;
      }
      // RPG spawner
      state.rpgTimer -= dt;
      if (state.rpgTimer <= 0) { spawnRPG(); state.rpgTimer = RPG_RESPAWN; }
      // Oil can respawn every 60s
      state.oilRespawnTimer -= dt;
      if (state.oilRespawnTimer <= 0) { buildOilCans(); state.oilRespawnTimer = 60; }
    }
  } else if (state.phase === 'intermission') {
    state.intermT -= dt;
    if (state.intermT <= 0) nextRound();
  }

  // ----- timed random drops (ensure supplies) -----
  state.dropTimer -= dt;
  if (state.dropTimer <= 0) { randomDrop(); state.dropTimer = rand(12, 20); }

  // ----- pickups -----
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.age += dt; if (p.ttl !== Infinity) p.ttl -= dt;
    if (p.ttl <= 0) { pickups.splice(i, 1); continue; }
    if (dist2(p.x, p.y, player.x, player.y) < (player.r + 18) * (player.r + 18)) {
      applyPickup(p); pickups.splice(i, 1);
    }
  }

  // ----- particles -----
  for (let i = particles.length - 1; i >= 0; i--) {
    const pa = particles[i];
    pa.life -= dt;
    if (pa.life <= 0) { particles.splice(i, 1); continue; }
    pa.x += pa.vx * dt; pa.y += pa.vy * dt;
    if (pa.kind === 'blood' || pa.kind === 'explosion') { pa.vx *= 0.92; pa.vy *= 0.92; }
    if (pa.kind === 'smoke') { pa.vy -= 8 * dt; pa.vx *= 0.96; }
  }
  // ----- damage numbers -----
  for (let i = dmgNums.length - 1; i >= 0; i--) {
    const d = dmgNums[i]; d.life -= dt; d.y -= 34 * dt;
    if (d.life <= 0) dmgNums.splice(i, 1);
  }
  // ----- camera + shake -----
  state.shake = Math.max(0, state.shake - dt * 22);
  camX = clamp(player.x - W / 2, 0, Math.max(0, WORLD.w - W));
  camY = clamp(player.y - H / 2, 0, Math.max(0, WORLD.h - H));
  if (WORLD.w < W) camX = (WORLD.w - W) / 2;
  if (WORLD.h < H) camY = (WORLD.h - H) / 2;

  // ----- emergency ammo: auto-spawn when player is completely dry -----
  if (player.ammo === 0 && player.mags === 0 && !player.reloading &&
      player.weapon.special !== 'rpg' && !pickups.some(p => p.type === 'ammo')) {
    spawnPickup('ammo');
  }

  updateHUD();
}

/* ----------------------------- Render ----------------------------------- */
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#0a0d0a'; ctx.fillRect(0, 0, W, H);

  const sh = state.shake;
  const ox = sh ? rand(-sh, sh) : 0, oy = sh ? rand(-sh, sh) : 0;
  ctx.save();
  ctx.translate(-camX + ox, -camY + oy);

  drawFloor();
  drawDecals();
  drawOilCans();
  drawPickups();
  drawZombies();
  drawPlayer();
  drawBullets();
  drawRockets();
  drawParticles();
  drawDamageNumbers();

  ctx.restore();

  // ---- lighting / fog ----
  buildLight(ox, oy);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.drawImage(lightCanvas, 0, 0, W, H);

  // ---- damage vignette ----
  if (state.vignette > 0) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(180,0,0,0)');
    g.addColorStop(1, 'rgba(180,0,0,' + (0.5 * state.vignette).toFixed(3) + ')');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  // ---- ammo-out arrow ----
  if (state.running && player && player.ammo === 0 && player.mags === 0 &&
      player.weapon.special !== 'rpg') drawAmmoArrow();
  // ---- RPG arrow ----
  if (state.running && player) drawRPGArrow();
  // ---- low-HP health arrow ----
  if (state.running && player && player.hp < 50) drawPickupArrow('health', '#66ee66', 'HEALTH');
  // ---- broken-armor shield arrow ----
  if (state.running && player && player.armorBroken && player.armorUnlocked) drawPickupArrow('armor', '#42b4fc', 'SHIELD');
  // ---- last-zombie arrows ----
  if (state.running && player) drawZombieArrows();
}

function drawAmmoArrow() { drawPickupArrow('ammo', '#ffcf4a', 'AMMO'); }
function drawRPGArrow() {
  if (!pickups.some(p => p.type === 'weapon' && p.weaponKey === 'rpg')) return;
  // RPG is a weapon pickup — borrow the generic helper via a temporary type match
  const nearest = pickups.find(p => p.type === 'weapon' && p.weaponKey === 'rpg');
  if (!nearest) return;
  const psx = player.x - camX, psy = player.y - camY;
  const angle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
  const pulse = 0.65 + 0.35 * Math.sin(Date.now() * 0.007);
  const ox = psx + Math.cos(angle) * 44, oy = psy + Math.sin(angle) * 44;
  ctx.save(); ctx.globalAlpha = pulse;
  ctx.strokeStyle = '#ff7a18'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(psx + Math.cos(angle)*26, psy + Math.sin(angle)*26); ctx.lineTo(ox - Math.cos(angle)*6, oy - Math.sin(angle)*6); ctx.stroke();
  ctx.save(); ctx.translate(ox, oy); ctx.rotate(angle); ctx.fillStyle = '#ff7a18'; ctx.beginPath(); ctx.moveTo(10,0); ctx.lineTo(-5,-6); ctx.lineTo(-5,6); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.font = 'bold 11px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ff7a18';
  ctx.fillText('RPG', psx + Math.cos(angle)*68, psy + Math.sin(angle)*68);
  ctx.globalAlpha = 1; ctx.restore();
}

// Generic pickup-arrow: finds the nearest pickup of `type`, draws a coloured arrow + label.
function drawPickupArrow(type, color, label) {
  let nearest = null, bestD2 = Infinity;
  for (const p of pickups) {
    if (p.type !== type) continue;
    const d2 = dist2(player.x, player.y, p.x, p.y);
    if (d2 < bestD2) { bestD2 = d2; nearest = p; }
  }
  if (!nearest) return;
  const psx = player.x - camX, psy = player.y - camY;
  const angle = Math.atan2(nearest.y - player.y, nearest.x - player.x);
  const pulse = 0.65 + 0.35 * Math.sin(Date.now() * 0.009);
  const ox = psx + Math.cos(angle) * 44, oy = psy + Math.sin(angle) * 44;
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(psx + Math.cos(angle) * 26, psy + Math.sin(angle) * 26);
  ctx.lineTo(ox - Math.cos(angle) * 6, oy - Math.sin(angle) * 6);
  ctx.stroke();
  ctx.save();
  ctx.translate(ox, oy); ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  const lx = psx + Math.cos(angle) * 68, ly = psy + Math.sin(angle) * 68;
  ctx.font = 'bold 11px Courier New';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(label, lx, ly);
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawZombieArrows() {
  const alive = zombies.filter(z => !z.dying);
  if (alive.length === 0 || alive.length > 3) return;
  const psx = player.x - camX, psy = player.y - camY;
  const pulse = 0.6 + 0.4 * Math.sin(Date.now() * 0.008);
  for (const z of alive) {
    const angle = Math.atan2(z.y - player.y, z.x - player.x);
    const orbit = 54;
    const ax = psx + Math.cos(angle) * orbit, ay = psy + Math.sin(angle) * orbit;
    ctx.save();
    ctx.globalAlpha = pulse;
    // shaft
    ctx.strokeStyle = '#ff4040'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(psx + Math.cos(angle) * 28, psy + Math.sin(angle) * 28);
    ctx.lineTo(ax - Math.cos(angle) * 8, ay - Math.sin(angle) * 8);
    ctx.stroke();
    // head
    ctx.save();
    ctx.translate(ax, ay); ctx.rotate(angle);
    ctx.fillStyle = '#ff4040';
    ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

function drawFloor() {
  const x0 = Math.max(0, camX - 40), y0 = Math.max(0, camY - 40);
  const x1 = Math.min(WORLD.w, camX + W + 40), y1 = Math.min(WORLD.h, camY + H + 40);
  ctx.fillStyle = '#10140f'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.strokeStyle = 'rgba(60,80,55,0.10)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = Math.floor(x0 / 80) * 80; x < x1; x += 80) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  for (let y = Math.floor(y0 / 80) * 80; y < y1; y += 80) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
  ctx.stroke();
  // walls
  for (const w of walls) {
    ctx.fillStyle = '#2a3326';
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.fillStyle = '#3a4632';
    ctx.fillRect(w.x, w.y, w.w, 4);
    ctx.strokeStyle = '#161c13'; ctx.lineWidth = 2; ctx.strokeRect(w.x, w.y, w.w, w.h);
  }
}
function drawDecals() {
  for (const d of decals) {
    ctx.fillStyle = 'rgba(70,12,12,' + d.a + ')';
    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, TAU); ctx.fill();
  }
}
function drawOilCans() {
  for (const c of oilCans) {
    ctx.save();
    ctx.translate(c.x, c.y);
    // body
    ctx.fillStyle = '#5c3a0e';
    ctx.beginPath(); ctx.roundRect(-7, -10, 14, 20, 3); ctx.fill();
    // hazard stripes
    ctx.fillStyle = '#e05000';
    ctx.fillRect(-7, -10, 14, 6);
    ctx.fillRect(-7, 4, 14, 6);
    // spout
    ctx.fillStyle = '#7a5010';
    ctx.fillRect(-2, -15, 4, 7);
    ctx.fillRect(-4, -16, 8, 3);
    // shine
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(-4, -8, 3, 10);
    ctx.restore();
  }
}
function drawPickups() {
  for (const p of pickups) {
    const bob = Math.sin(p.age * 3) * 3;
    const y = p.y + bob;
    const blink = (p.ttl !== Infinity && p.ttl < 5 && Math.floor(p.age * 6) % 2 === 0);
    ctx.save();
    ctx.translate(p.x, y);
    // glow
    ctx.globalAlpha = blink ? 0.25 : 0.6;
    let col = '#7dd35f';
    if (p.type === 'health') col = '#ff5566';
    else if (p.type === 'ammo') col = '#ffcf4a';
    else if (p.type === 'armor') col = '#3da9fc';
    else if (p.type === 'weapon') col = p.weaponKey === 'rpg' ? '#ff7a18' : '#c08bff';
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#0a0d0a';
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, TAU); ctx.fill();
    ctx.fillStyle = col; ctx.font = 'bold 13px Courier New'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const icon = p.type === 'health' ? '+' : p.type === 'ammo' ? '∎' : p.type === 'armor' ? '◈' :
      (p.weaponKey === 'rpg' ? '➶' : '⚒');
    ctx.fillText(icon, 0, 1);
    ctx.restore();
  }
}
function drawPlayer() {
  const p = player;
  ctx.save();
  ctx.translate(p.x, p.y);
  // legs (walk cycle)
  if (p.moving) {
    const sw = Math.sin(p.walkPhase) * 6;
    ctx.strokeStyle = '#3b4a2e'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-4, 9 + sw); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(4, 9 - sw); ctx.stroke();
  }
  ctx.rotate(p.facing);
  // bubble shield (drawn behind everything else)
  if (p.armorUnlocked && p.armor > 0) {
    const strength = p.armor / ARMOR_MAX;
    const pulse = 0.85 + 0.15 * Math.sin(Date.now() * 0.005);
    ctx.fillStyle = 'rgba(60,160,255,' + (0.10 + 0.12 * strength * pulse) + ')';
    ctx.beginPath(); ctx.arc(0, 0, p.r + 7, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(100,200,255,' + (0.55 + 0.35 * strength * pulse) + ')';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, p.r + 7, 0, TAU); ctx.stroke();
  }
  // weapon (drawn behind body)
  drawWeaponShape(p);
  // body
  ctx.fillStyle = '#4a6138';
  ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.fill();
  ctx.fillStyle = '#5e7a46';
  ctx.beginPath(); ctx.arc(2, 0, p.r - 4, 0, TAU); ctx.fill();
  // helmet front
  ctx.fillStyle = '#33442a';
  ctx.beginPath(); ctx.arc(0, 0, p.r, -0.9, 0.9); ctx.fill();
  ctx.restore();
}

// All weapon drawings are in the player's rotated frame: +x = forward, body at origin r=13.
// The body covers x < 13, so grip details (x < 13) are hidden—by design.
function drawWeaponShape(p) {
  const key = p.weapon.key;
  let muzzleX = 26; // where muzzle flash appears

  switch (key) {

    case 'pistol': {
      // Grip
      ctx.fillStyle = '#1c140c'; ctx.fillRect(6, 1.5, 8, 5);
      ctx.fillStyle = '#2c1e10'; ctx.fillRect(7, 2, 5, 3.5);
      // Trigger guard
      ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(12, 2.5, 3, 0, Math.PI); ctx.stroke();
      // Slide
      ctx.fillStyle = '#252525'; ctx.fillRect(7, -2.5, 14, 5);
      ctx.fillStyle = '#3a3a3a'; ctx.fillRect(9, -2.5, 8, 2); // ejection port
      ctx.fillStyle = '#181818'; ctx.fillRect(7, -2.5, 14, 1); // top rail
      // Barrel
      ctx.fillStyle = '#303030'; ctx.fillRect(19, -1.2, 8, 2.4);
      // Front sight
      ctx.fillStyle = '#aaa'; ctx.fillRect(25, -2.5, 1.5, 1.5);
      muzzleX = 27;
      break;
    }

    case 'twin': {
      // Two compact pistols, each offset ±5px on y
      for (const s of [-5, 5]) {
        ctx.save(); ctx.translate(0, s);
        ctx.fillStyle = '#1c140c'; ctx.fillRect(7, 1.2, 7, 4);
        ctx.fillStyle = '#252525'; ctx.fillRect(7, -2, 12, 4);
        ctx.fillStyle = '#3a3a3a'; ctx.fillRect(9, -2, 6, 1.5); // ejection port
        ctx.fillStyle = '#303030'; ctx.fillRect(17, -0.9, 5, 1.8);
        ctx.fillStyle = '#aaa'; ctx.fillRect(21, -2, 1, 1.2); // sight
        ctx.restore();
      }
      muzzleX = 22;
      break;
    }

    case 'shotgun': {
      // Wood stock
      ctx.fillStyle = '#6b4218'; ctx.fillRect(5, -2.5, 8, 5);
      ctx.fillStyle = '#7c4e22'; ctx.fillRect(5, -2.5, 8, 1.8);
      ctx.fillStyle = '#5a3814'; ctx.fillRect(5, 1.5, 8, 1);
      // Receiver
      ctx.fillStyle = '#222'; ctx.fillRect(11, -3, 9, 6);
      ctx.fillStyle = '#333'; ctx.fillRect(11, -3, 9, 2); // top
      // Pump forend (wood)
      ctx.fillStyle = '#8a5428'; ctx.fillRect(18, -2, 6, 4);
      ctx.fillStyle = '#9a6030'; ctx.fillRect(18, -2, 6, 1.5);
      // Twin barrels
      ctx.fillStyle = '#2a2a2a'; ctx.fillRect(22, -3, 10, 2.2);  // top barrel
      ctx.fillStyle = '#2a2a2a'; ctx.fillRect(22,  0.8, 10, 2.2); // bottom barrel
      ctx.fillStyle = '#404040'; ctx.fillRect(22, -0.2, 10, 1);   // rib between barrels
      // Muzzle ends
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(30, -3, 2, 6);
      muzzleX = 32;
      break;
    }

    case 'smg': {
      // Folded stock
      ctx.fillStyle = '#2a2a2a'; ctx.fillRect(5, -1.5, 5, 3);
      // Box magazine
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(10, 2.5, 5, 7);
      ctx.fillStyle = '#2a2a2a'; ctx.fillRect(11, 3, 3, 5);
      // Receiver
      ctx.fillStyle = '#222'; ctx.fillRect(8, -2.5, 13, 5);
      ctx.fillStyle = '#333'; ctx.fillRect(8, -2.5, 13, 1.5); // top rail
      // Charging handle
      ctx.fillStyle = '#444'; ctx.fillRect(15, -2.5, 2, 1.2);
      // Foregrip
      ctx.fillStyle = '#1e1e1e'; ctx.fillRect(16, 2.5, 4, 5);
      // Barrel
      ctx.fillStyle = '#2e2e2e'; ctx.fillRect(19, -1.2, 5, 2.4);
      // Compensator at tip
      ctx.fillStyle = '#383838'; ctx.fillRect(22, -1.8, 3, 3.6);
      ctx.fillStyle = '#555'; ctx.fillRect(23, -1.8, 1, 3.6);
      muzzleX = 25;
      break;
    }

    case 'm4': {
      // Curved STANAG magazine
      ctx.fillStyle = '#252522'; ctx.fillRect(11, 2.2, 5, 8);
      ctx.fillStyle = '#1a1a18'; ctx.fillRect(12, 2.5, 3, 6.5);
      // Trigger guard
      ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(13, 2.2, 3, 0, Math.PI); ctx.stroke();
      // Barrel (long, thin)
      ctx.fillStyle = '#2a2a2a'; ctx.fillRect(7, -0.9, 24, 1.8);
      // Handguard (M-LOK)
      ctx.fillStyle = '#2e2a24'; ctx.fillRect(18, -2.2, 11, 4.4);
      ctx.strokeStyle = '#3e3830'; ctx.lineWidth = 0.8; ctx.strokeRect(18, -2.2, 11, 4.4);
      // Slot details on handguard
      ctx.fillStyle = '#222'; ctx.fillRect(19, -2.2, 1.5, 1.2); ctx.fillRect(21.5, -2.2, 1.5, 1.2); ctx.fillRect(24, -2.2, 1.5, 1.2);
      ctx.fillRect(19, 1, 1.5, 1.2); ctx.fillRect(21.5, 1, 1.5, 1.2); ctx.fillRect(24, 1, 1.5, 1.2);
      // Upper receiver
      ctx.fillStyle = '#252522'; ctx.fillRect(8, -2.2, 12, 4.4);
      // Optic / carry handle
      ctx.fillStyle = '#1c2218'; ctx.fillRect(10, -4.8, 8, 2.7);
      ctx.strokeStyle = '#2e3828'; ctx.lineWidth = 0.8; ctx.strokeRect(10, -4.8, 8, 2.7);
      ctx.fillStyle = '#283020'; ctx.fillRect(12, -4.6, 4, 2.3); // lens
      // Charging handle
      ctx.fillStyle = '#444'; ctx.fillRect(17, -2.2, 2, 1.2);
      // Flash hider
      ctx.fillStyle = '#383838'; ctx.fillRect(29, -1.5, 3, 3);
      ctx.fillStyle = '#555'; ctx.fillRect(30, -1.5, 1, 3);
      muzzleX = 32;
      break;
    }

    case 'm429': {
      // Pistol grip
      ctx.fillStyle = '#1a160c'; ctx.fillRect(8, 3.5, 6, 6);
      ctx.fillStyle = '#241e0e'; ctx.fillRect(9, 4, 4, 4.5);
      // Belt feed box (top)
      ctx.fillStyle = '#333028'; ctx.fillRect(9, -6, 8, 2.8);
      ctx.strokeStyle = '#555'; ctx.lineWidth = 0.8;
      for (let i = 0; i < 4; i++) { ctx.strokeRect(10 + i * 1.7, -5.6, 1.2, 1.6); }
      // Receiver body
      ctx.fillStyle = '#1e1e1e'; ctx.fillRect(7, -3.5, 13, 7);
      ctx.fillStyle = '#2a2a2a'; ctx.fillRect(7, -3.5, 13, 2); // top plate
      // Perforated barrel jacket
      ctx.fillStyle = '#2e2e2e'; ctx.fillRect(18, -2.2, 15, 4.4);
      ctx.fillStyle = '#222';
      for (let i = 0; i < 6; i++) {
        ctx.fillRect(19 + i * 2.2, -2.2, 1.2, 1.2);
        ctx.fillRect(19 + i * 2.2, 1, 1.2, 1.2);
      }
      // Heavy barrel
      ctx.fillStyle = '#262626'; ctx.fillRect(7, -1.4, 28, 2.8);
      // Bipod legs
      ctx.strokeStyle = '#444'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(25, 2.2); ctx.lineTo(27, 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(25, -2.2); ctx.lineTo(27, -7); ctx.stroke();
      // Muzzle brake
      ctx.fillStyle = '#383838'; ctx.fillRect(33, -2.2, 3.5, 4.4);
      ctx.fillStyle = '#505050'; ctx.fillRect(34, -2.2, 1.2, 4.4);
      muzzleX = 37;
      break;
    }

    case 'rpg': {
      // Shoulder support / stock
      ctx.fillStyle = '#3a3020'; ctx.fillRect(5, -2, 6, 4);
      // Main tube
      ctx.fillStyle = '#4a3820'; ctx.fillRect(9, -3.5, 21, 7);
      ctx.fillStyle = '#5a4828'; ctx.fillRect(9, -3.5, 21, 1.8); // top highlight
      ctx.fillStyle = '#3a2a14'; ctx.fillRect(9, 1.2, 21, 1);   // bottom shadow
      // Pistol grip
      ctx.fillStyle = '#2a2010'; ctx.fillRect(14, 3.5, 5, 5.5);
      ctx.fillStyle = '#342a18'; ctx.fillRect(15, 4, 3, 4);
      // Optical sight
      ctx.fillStyle = '#1a2818'; ctx.fillRect(16, -6.5, 6, 3.2);
      ctx.strokeStyle = '#2a4028'; ctx.lineWidth = 0.8; ctx.strokeRect(16, -6.5, 6, 3.2);
      ctx.fillStyle = '#223022'; ctx.fillRect(17.5, -6.2, 3, 2.4); // lens
      // Rear exhaust cone
      ctx.fillStyle = '#f0d060'; ctx.beginPath(); ctx.moveTo(9, -2); ctx.lineTo(5, 0); ctx.lineTo(9, 2); ctx.closePath(); ctx.fill();
      // Rocket warhead tip
      ctx.fillStyle = '#cc3800'; ctx.fillRect(28, -3.5, 6, 7);
      ctx.fillStyle = '#ff7a18'; ctx.beginPath(); ctx.moveTo(34, -3.5); ctx.lineTo(38, 0); ctx.lineTo(34, 3.5); ctx.closePath(); ctx.fill();
      muzzleX = 38;
      break;
    }

    default: {
      ctx.fillStyle = '#1a1a1a'; ctx.fillRect(6, -2.5, 18, 5);
      muzzleX = 26;
    }
  }

  // Muzzle flash at the weapon's barrel tip
  if (p.muzzle > 0) {
    const my = key === 'twin' ? (p.twinSide * 5) : 0;
    ctx.fillStyle = 'rgba(255,230,140,0.95)';
    ctx.beginPath(); ctx.arc(muzzleX, my, rand(4, 8), 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,210,0.8)';
    ctx.beginPath(); ctx.arc(muzzleX, my, rand(2, 4), 0, TAU); ctx.fill();
  }
}
function drawZombies() {
  for (const z of zombies) {
    const dyingA = z.dying ? clamp(z.dying / 0.35, 0, 1) : 1;
    ctx.save();
    ctx.globalAlpha = dyingA;
    ctx.translate(z.x, z.y);
    const lean = Math.sin(z.wob) * 0.12;
    ctx.rotate(Math.atan2(player.y - z.y, player.x - z.x) + lean);
    // arms reaching
    ctx.strokeStyle = '#3f5e2e'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(2, -6); ctx.lineTo(14, -5 + Math.sin(z.wob) * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, 6); ctx.lineTo(14, 5 - Math.sin(z.wob) * 2); ctx.stroke();
    // body
    ctx.fillStyle = z.hitFlash > 0 ? '#e8f0e0' : '#4f7a34';
    ctx.beginPath(); ctx.arc(0, 0, z.r, 0, TAU); ctx.fill();
    ctx.fillStyle = z.hitFlash > 0 ? '#fff' : '#3c5d27';
    ctx.beginPath(); ctx.arc(0, 0, z.r, -1.2, 1.2); ctx.fill();
    // eyes
    if (!z.dying) {
      ctx.fillStyle = '#ff3b3b';
      ctx.beginPath(); ctx.arc(7, -4, 2, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(7, 4, 2, 0, TAU); ctx.fill();
    }
    ctx.restore();
    // hp bar for wounded
    if (!z.dying && z.hp < z.maxhp) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(z.x - 14, z.y - z.r - 8, 28, 4);
      ctx.fillStyle = '#cc3b3b'; ctx.fillRect(z.x - 14, z.y - z.r - 8, 28 * clamp(z.hp / z.maxhp, 0, 1), 4);
    }
  }
}
function drawBullets() {
  ctx.strokeStyle = '#fff2a8'; ctx.lineWidth = 2.4; ctx.lineCap = 'round';
  for (const b of bullets) {
    const len = 7;
    const m = Math.hypot(b.vx, b.vy) || 1;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx / m * len, b.y - b.vy / m * len);
    ctx.stroke();
  }
}
function drawRockets() {
  for (const rk of rockets) {
    ctx.save(); ctx.translate(rk.x, rk.y); ctx.rotate(Math.atan2(rk.vy, rk.vx));
    ctx.fillStyle = '#ffcf4a'; ctx.beginPath(); ctx.arc(-8, 0, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#bbb'; ctx.fillRect(-6, -3, 12, 6);
    ctx.fillStyle = '#ff5522'; ctx.beginPath(); ctx.arc(6, 0, 3.5, 0, TAU); ctx.fill();
    ctx.restore();
  }
}
function drawParticles() {
  for (const pa of particles) {
    const a = clamp(pa.life / pa.max, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = pa.color;
    ctx.beginPath(); ctx.arc(pa.x, pa.y, pa.size * (pa.kind === 'explosion' ? (0.5 + a) : 1), 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawDamageNumbers() {
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const d of dmgNums) {
    ctx.globalAlpha = clamp(d.life / 0.7, 0, 1);
    ctx.fillStyle = d.crit ? '#ff7a18' : '#ffe9a8';
    ctx.font = (d.crit ? 'bold 18px' : 'bold 13px') + ' Courier New';
    ctx.fillText(d.val, d.x, d.y);
  }
  ctx.globalAlpha = 1;
}

/* ----------------------------- Lighting / fog --------------------------- */
function buildLight(ox, oy) {
  lctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  lctx.globalCompositeOperation = 'source-over';
  lctx.fillStyle = 'rgba(4,6,4,0.95)';
  lctx.fillRect(0, 0, W, H);

  const psx = player.x - camX + ox, psy = player.y - camY + oy;

  // cone
  const poly = computeVisibility(player.x, player.y, player.facing);
  lctx.save();
  lctx.beginPath();
  lctx.moveTo(psx, psy);
  for (const pt of poly) lctx.lineTo(pt.x - camX + ox, pt.y - camY + oy);
  lctx.closePath();
  lctx.clip();
  const g = lctx.createRadialGradient(psx, psy, 0, psx, psy, CONE_RANGE);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.96)');
  g.addColorStop(0.85, 'rgba(255,255,255,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  lctx.globalCompositeOperation = 'destination-out';
  lctx.fillStyle = g;
  lctx.fillRect(0, 0, W, H);
  lctx.restore();

  // near circle (full awareness)
  lctx.globalCompositeOperation = 'destination-out';
  const ng = lctx.createRadialGradient(psx, psy, 0, psx, psy, NEAR_RADIUS);
  ng.addColorStop(0, 'rgba(255,255,255,1)');
  ng.addColorStop(0.7, 'rgba(255,255,255,0.85)');
  ng.addColorStop(1, 'rgba(255,255,255,0)');
  lctx.fillStyle = ng;
  lctx.beginPath(); lctx.arc(psx, psy, NEAR_RADIUS, 0, TAU); lctx.fill();

  // warm tint inside the cone
  lctx.globalCompositeOperation = 'source-over';
  lctx.save();
  lctx.beginPath();
  lctx.moveTo(psx, psy);
  for (const pt of poly) lctx.lineTo(pt.x - camX + ox, pt.y - camY + oy);
  lctx.closePath();
  lctx.clip();
  const tg = lctx.createRadialGradient(psx, psy, 0, psx, psy, CONE_RANGE);
  tg.addColorStop(0, 'rgba(255,240,200,0.05)');
  tg.addColorStop(1, 'rgba(255,240,200,0)');
  lctx.fillStyle = tg; lctx.fillRect(0, 0, W, H);
  lctx.restore();
}

/* ----------------------------- HUD -------------------------------------- */
const hud = {
  hpFill: document.getElementById('hp-fill'), hpText: document.getElementById('hp-text'),
  armorFill: document.getElementById('armor-fill'), armorText: document.getElementById('armor-text'),
  round: document.getElementById('round-text'), score: document.getElementById('score-text'),
  zcount: document.getElementById('zombie-count'),
  weapon: document.getElementById('weapon-name'), ammo: document.getElementById('ammo-text'),
  reload: document.getElementById('reload-hint'), mute: document.getElementById('mute-indicator'),
};
function updateHUD() {
  hud.hpFill.style.width = clamp(player.hp / HP_MAX * 100, 0, 100) + '%';
  hud.hpText.textContent = Math.ceil(player.hp);
  hud.armorFill.style.width = player.armorUnlocked ? clamp(player.armor / ARMOR_MAX * 100, 0, 100) + '%' : '0%';
  hud.armorFill.classList.toggle('broken', player.armorUnlocked && player.armorBroken);
  hud.armorFill.classList.toggle('locked', !player.armorUnlocked);
  hud.armorText.textContent = !player.armorUnlocked ? (state.round < 4 ? '—' : '!') : player.armorBroken ? 'X' : Math.ceil(player.armor);
  hud.round.textContent = state.round >= 6 ? 'ROUND ∞' : 'ROUND ' + state.round;
  hud.score.textContent = state.score;
  const alive = zombies.reduce((a, z) => a + (z.dying ? 0 : 1), 0);
  hud.zcount.textContent = '☣ ' + alive;
  hud.weapon.textContent = player.weapon.name;
  if (player.weapon.special === 'rpg') {
    hud.ammo.textContent = 'FIRE ▶'; hud.ammo.classList.add('low');
    hud.reload.textContent = 'SPACE / CLICK TO LAUNCH';
  } else {
    const magsStr = '×' + player.mags;
    hud.ammo.textContent = player.ammo + ' | ' + magsStr;
    hud.ammo.classList.toggle('low', player.ammo <= player.weapon.mag * 0.25 && player.mags === 0);
    if (player.reloading) {
      hud.reload.textContent = 'RELOADING…';
    } else if (player.ammo === 0 && player.mags === 0) {
      hud.reload.textContent = '⚠ OUT OF AMMO';
    } else if (player.ammo === 0) {
      hud.reload.textContent = 'PRESS R TO RELOAD';
    } else {
      hud.reload.textContent = '';
    }
  }
}

/* ----------------------------- Game over / scores ----------------------- */
const SCORE_KEY = 'zombieShooterScores';
function loadScores() { try { return JSON.parse(localStorage.getItem(SCORE_KEY)) || []; } catch (e) { return []; } }
function saveScores(s) { try { localStorage.setItem(SCORE_KEY, JSON.stringify(s)); } catch (e) {} }
function isHighScore(score) {
  const s = loadScores();
  return score > 0 && (s.length < 5 || score > s[s.length - 1].score);
}

let pendingScore = 0;
function endGame() {
  state.running = false;
  Audio2.gameOver();
  pendingScore = state.score;
  document.getElementById('final-score').textContent = state.score;
  document.getElementById('gameover-detail').textContent =
    'Reached round ' + state.round + ' · ' + state.kills + ' kills';
  const nameEntry = document.getElementById('name-entry');
  if (isHighScore(state.score)) {
    nameEntry.classList.add('show');
    setTimeout(() => document.getElementById('name-input').focus(), 60);
  } else {
    nameEntry.classList.remove('show');
  }
  showScreen('screen-gameover');
}
function commitScore() {
  let name = (document.getElementById('name-input').value || 'SOLDIER').trim().toUpperCase().slice(0, 12) || 'SOLDIER';
  const s = loadScores();
  s.push({ name, score: pendingScore });
  s.sort((a, b) => b.score - a.score);
  saveScores(s.slice(0, 5));
  document.getElementById('name-entry').classList.remove('show');
  renderScores();
  showScreen('screen-dashboard');
}
function renderScores() {
  const body = document.getElementById('scores-body');
  const s = loadScores();
  body.innerHTML = '';
  if (s.length === 0) {
    body.innerHTML = '<tr class="scores-empty"><td colspan="3">No scores yet — be the first.</td></tr>';
    return;
  }
  s.slice(0, 5).forEach((e, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td>' + (i + 1) + '</td><td>' + escapeHtml(e.name) + '</td><td>' + e.score + '</td>';
    body.appendChild(tr);
  });
}
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/* ----------------------------- Pause / mute ----------------------------- */
function togglePause() {
  if (!state.running) return;
  state.paused = !state.paused;
  document.getElementById('pause-overlay').classList.toggle('show', state.paused);
}
function toggleMute() {
  Audio2.setMuted(!Audio2.isMuted());
  hud.mute.textContent = Audio2.isMuted() ? '🔇 MUTED (M)' : '🔊 SOUND (M)';
}

/* ----------------------------- Screens ---------------------------------- */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

/* ----------------------------- Main loop -------------------------------- */
let lastT = 0, acc = 0;
const STEP = 1 / 60;
function frame(t) {
  requestAnimationFrame(frame);
  if (!lastT) lastT = t;
  let dt = (t - lastT) / 1000; lastT = t;
  if (dt > 0.25) dt = 0.25;

  if (state.running && !state.paused) {
    acc += dt;
    let guard = 0;
    while (acc >= STEP && guard < 5) { update(STEP); acc -= STEP; guard++; if (!state.running) break; }
    if (acc > STEP) acc = 0;
  }
  if (document.getElementById('screen-game').classList.contains('active') && player) {
    render();
  }
}
requestAnimationFrame(frame);

/* ----------------------------- Wire up UI ------------------------------- */
document.getElementById('btn-start').addEventListener('click', () => { Audio2.init(); startGame(); });
document.getElementById('btn-howto').addEventListener('click', () => showScreen('screen-howto'));
document.getElementById('btn-dashboard').addEventListener('click', () => { renderScores(); showScreen('screen-dashboard'); });
document.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => showScreen('screen-menu')));
document.getElementById('btn-resume').addEventListener('click', togglePause);
document.getElementById('btn-quit').addEventListener('click', () => { state.running = false; state.paused = false; document.getElementById('pause-overlay').classList.remove('show'); showScreen('screen-menu'); });
document.getElementById('btn-retry').addEventListener('click', () => { Audio2.init(); startGame(); });
document.getElementById('btn-menu').addEventListener('click', () => showScreen('screen-menu'));
document.getElementById('btn-save').addEventListener('click', commitScore);
document.getElementById('name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') commitScore(); });

renderScores();
