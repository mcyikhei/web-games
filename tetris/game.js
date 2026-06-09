'use strict';

// ── Constants ──────────────────────────────────────────────────────────────
const COLS = 10;
const ROWS = 20;
const GHOST_ALPHA = 0.2;

// CELL size is computed at init time based on screen dimensions
let CELL = 30;
let CANVAS_W = COLS * CELL;
let CANVAS_H = ROWS * CELL;
const LOCK_DELAY  = 500;
const DAS_DELAY   = 170;
const DAS_REPEAT  = 50;

const COLORS = {
  I: '#00f0f0', O: '#f0d000', T: '#c000f0',
  S: '#00e000', Z: '#f02000', J: '#2060f0', L: '#f08000',
};

// ms per gravity drop, indexed by level 1–15+
const GRAVITY = [0, 800,717,633,550,467,383,300,217,133,100, 83,83,83,67,50];

// Points for 1/2/3/4 lines cleared × level
const SCORE_TABLE = [0, 100, 300, 500, 800];

// ── Piece Definitions (SRS, 4×4 matrices) ─────────────────────────────────
const PIECES = {
  I: [
    [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
    [[0,0,1,0],[0,0,1,0],[0,0,1,0],[0,0,1,0]],
    [[0,0,0,0],[0,0,0,0],[1,1,1,1],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[0,1,0,0],[0,1,0,0]],
  ],
  O: [
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
  ],
  T: [
    [[0,1,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,0,0],[0,1,1,0],[0,1,0,0],[0,0,0,0]],
    [[0,0,0,0],[1,1,1,0],[0,1,0,0],[0,0,0,0]],
    [[0,1,0,0],[1,1,0,0],[0,1,0,0],[0,0,0,0]],
  ],
  S: [
    [[0,1,1,0],[1,1,0,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,0,0],[0,1,1,0],[0,0,1,0],[0,0,0,0]],
    [[0,0,0,0],[0,1,1,0],[1,1,0,0],[0,0,0,0]],
    [[1,0,0,0],[1,1,0,0],[0,1,0,0],[0,0,0,0]],
  ],
  Z: [
    [[1,1,0,0],[0,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,0,1,0],[0,1,1,0],[0,1,0,0],[0,0,0,0]],
    [[0,0,0,0],[1,1,0,0],[0,1,1,0],[0,0,0,0]],
    [[0,1,0,0],[1,1,0,0],[1,0,0,0],[0,0,0,0]],
  ],
  J: [
    [[1,0,0,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,1,0],[0,1,0,0],[0,1,0,0],[0,0,0,0]],
    [[0,0,0,0],[1,1,1,0],[0,0,1,0],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[1,1,0,0],[0,0,0,0]],
  ],
  L: [
    [[0,0,1,0],[1,1,1,0],[0,0,0,0],[0,0,0,0]],
    [[0,1,0,0],[0,1,0,0],[0,1,1,0],[0,0,0,0]],
    [[0,0,0,0],[1,1,1,0],[1,0,0,0],[0,0,0,0]],
    [[1,1,0,0],[0,1,0,0],[0,1,0,0],[0,0,0,0]],
  ],
};

// SRS wall-kick offsets [dc, dr] in canvas coords (y-axis down)
// For JLSTZ pieces, CW rotations 0→1, 1→2, 2→3, 3→0
const KICKS_JLSTZ = [
  [[ 0, 0],[-1, 0],[-1,-1],[ 0, 2],[-1, 2]],
  [[ 0, 0],[ 1, 0],[ 1, 1],[ 0,-2],[ 1,-2]],
  [[ 0, 0],[ 1, 0],[ 1,-1],[ 0, 2],[ 1, 2]],
  [[ 0, 0],[-1, 0],[-1, 1],[ 0,-2],[-1,-2]],
];
// For I piece, CW rotations
const KICKS_I = [
  [[ 0, 0],[-2, 0],[ 1, 0],[-2, 1],[ 1,-2]],
  [[ 0, 0],[-1, 0],[ 2, 0],[-1,-2],[ 2, 1]],
  [[ 0, 0],[ 2, 0],[-1, 0],[ 2,-1],[-1, 2]],
  [[ 0, 0],[ 1, 0],[-2, 0],[ 1, 2],[-2,-1]],
];

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  screen:   'menu',
  board:    null,
  current:  null,
  next:     null,
  held:     null,
  canHold:  true,

  score:    0,
  level:    1,
  lines:    0,

  gameOver: false,
  paused:   false,

  lastDrop:    0,
  lockTimer:   null,
  onGround:    false,

  flashRows:   [],
  flashUntil:  0,
  clearing:    false,

  dasDir:     0,
  dasTimer:   null,
  dasRepeat:  null,

  bgmPlaying:       false,
  awaitingInitials: false,
};

// ── Audio ──────────────────────────────────────────────────────────────────
let audioCtx = null;

function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, dur, type = 'square', vol = 0.12) {
  if (!audioCtx) return;
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
  osc.start(audioCtx.currentTime);
  osc.stop(audioCtx.currentTime + dur + 0.02);
}

function playSound(type) {
  try {
    initAudio();
    switch (type) {
      case 'move':
        playTone(200, 0.04, 'square', 0.05);
        break;
      case 'rotate':
        playTone(350, 0.05, 'square', 0.07);
        break;
      case 'lock':
        playTone(160, 0.06, 'sawtooth', 0.09);
        setTimeout(() => playTone(120, 0.06, 'sawtooth', 0.06), 40);
        break;
      case 'line':
        [440,550,660].forEach((f,i) =>
          setTimeout(() => playTone(f, 0.1, 'square', 0.1), i * 55));
        break;
      case 'tetris':
        [440,550,660,880,1100].forEach((f,i) =>
          setTimeout(() => playTone(f, 0.12, 'square', 0.14), i * 50));
        break;
      case 'levelup':
        [523,659,784,1047].forEach((f,i) =>
          setTimeout(() => playTone(f, 0.14, 'square', 0.15), i * 75));
        break;
      case 'gameover':
        [330,294,262,220,196].forEach((f,i) =>
          setTimeout(() => playTone(f, 0.22, 'sawtooth', 0.18), i * 140));
        break;
      case 'click':
        playTone(700, 0.04, 'sine', 0.07);
        break;
      case 'hold':
        playTone(440, 0.06, 'sine', 0.08);
        break;
    }
  } catch (_) {}
}

// ── BGM – Korobeiniki (Tetris A-theme) ─────────────────────────────────────
const NOTES = {
  'A4':440.00,'B4':493.88,'C5':523.25,'D5':587.33,
  'E5':659.25,'F5':698.46,'G5':783.99,'A5':880.00,
};

const BGM_BPM  = 158;
const BEAT_SEC = 60 / BGM_BPM;

// [note|'_', beats]  — '_' is a rest
const BGM_MELODY = [
  // Section A
  ['E5',1],['B4',0.5],['C5',0.5],['D5',1],['C5',0.5],['B4',0.5],
  ['A4',1],['A4',0.5],['C5',0.5],['E5',1],['D5',0.5],['C5',0.5],
  ['B4',1.5],['C5',0.5],['D5',1],['E5',1],
  ['C5',1],['A4',1],['A4',1],['_',1],
  // Section A'
  ['_',0.5],['D5',1.5],['F5',0.5],['A5',1],['G5',0.5],['F5',0.5],
  ['E5',1.5],['C5',0.5],['E5',1],['D5',0.5],['C5',0.5],
  ['B4',1],['B4',0.5],['C5',0.5],['D5',1],['E5',1],
  ['C5',1],['A4',1],['A4',1],['_',1],
  // Section B
  ['E5',1],['C5',1],['D5',1],['B4',1],
  ['C5',1],['A4',1],['A4',1],['_',1],
  ['A4',0.5],['B4',0.5],['C5',1],['A4',0.5],['C5',0.5],['B4',1.5],['_',0.5],
  ['E5',1],['C5',1],['D5',1],['B4',1],
  ['C5',0.5],['E5',0.5],['A5',1],['A5',1],['_',1],
  ['G5',1.5],['_',0.5],['D5',1],['F5',0.5],['E5',0.5],
  ['C5',1],['E5',1],['A4',1],['A4',1],
  // Repeat A
  ['E5',1],['B4',0.5],['C5',0.5],['D5',1],['C5',0.5],['B4',0.5],
  ['A4',1],['A4',0.5],['C5',0.5],['E5',1],['D5',0.5],['C5',0.5],
  ['B4',1.5],['C5',0.5],['D5',1],['E5',1],
  ['C5',1],['A4',1],['A4',1],['_',1],
  ['_',0.5],['D5',1.5],['F5',0.5],['A5',1],['G5',0.5],['F5',0.5],
  ['E5',1.5],['C5',0.5],['E5',1],['D5',0.5],['C5',0.5],
  ['B4',1],['B4',0.5],['C5',0.5],['D5',1],['E5',1],
  ['C5',1],['A4',1],['A4',1],['_',1],
];

let bgmNoteIdx  = 0;
let bgmNextTime = 0;
let bgmTimer    = null;

const BGM_LOOKAHEAD = 0.12;
const BGM_INTERVAL  = 50;

function bgmPlayNote(freq, start, dur) {
  const osc  = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.055, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + dur * 0.92);
  osc.start(start);
  osc.stop(start + dur);
}

function bgmSchedule() {
  if (!state.bgmPlaying) return;
  while (bgmNextTime < audioCtx.currentTime + BGM_LOOKAHEAD) {
    const [note, beats] = BGM_MELODY[bgmNoteIdx % BGM_MELODY.length];
    const dur = beats * BEAT_SEC;
    if (note !== '_') bgmPlayNote(NOTES[note], bgmNextTime, dur * 0.88);
    bgmNextTime += dur;
    bgmNoteIdx++;
  }
  bgmTimer = setTimeout(bgmSchedule, BGM_INTERVAL);
}

function bgmStart() {
  if (state.bgmPlaying) return;
  try {
    initAudio();
    state.bgmPlaying = true;
    bgmNoteIdx  = 0;
    bgmNextTime = audioCtx.currentTime + 0.12;
    bgmSchedule();
  } catch (_) {}
}

function bgmStop() {
  state.bgmPlaying = false;
  clearTimeout(bgmTimer);
}

function bgmPause() {
  state.bgmPlaying = false;
  clearTimeout(bgmTimer);
}

function bgmResume() {
  if (state.bgmPlaying) return;
  try {
    state.bgmPlaying = true;
    bgmNextTime = audioCtx.currentTime + 0.05;
    bgmSchedule();
  } catch (_) {}
}

// ── High Scores ────────────────────────────────────────────────────────────
const HS_KEY = 'tetris_highscores';

function loadScores() {
  try { return JSON.parse(localStorage.getItem(HS_KEY)) || []; }
  catch (_) { return []; }
}

function saveScores(arr) {
  localStorage.setItem(HS_KEY, JSON.stringify(arr));
}

function isHighScore(score) {
  const s = loadScores();
  return s.length < 5 || score > s[s.length - 1].score;
}

function addHighScore(name, score) {
  const s = loadScores();
  s.push({ name: (name.toUpperCase() + '   ').slice(0, 3), score, date: new Date().toLocaleDateString() });
  s.sort((a, b) => b.score - a.score);
  s.splice(5);
  saveScores(s);
}

function renderScoresTable() {
  const tbody = document.getElementById('scores-body');
  const scores = loadScores();
  const ranks = ['1ST','2ND','3RD','4TH','5TH'];
  tbody.innerHTML = '';
  if (!scores.length) {
    tbody.innerHTML = '<tr><td colspan="4" class="no-scores">NO SCORES YET</td></tr>';
    return;
  }
  scores.forEach((s, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${ranks[i] || i+1}</td><td>${s.name}</td><td>${s.score.toLocaleString()}</td><td>${s.date}</td>`;
    tbody.appendChild(tr);
  });
}

// ── Board Logic ────────────────────────────────────────────────────────────
function emptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function pieceCells(type, rot, col, row) {
  const cells = [];
  PIECES[type][rot].forEach((rowArr, dr) => {
    rowArr.forEach((v, dc) => {
      if (v) cells.push({ r: row + dr, c: col + dc });
    });
  });
  return cells;
}

function isValid(type, rot, col, row) {
  return pieceCells(type, rot, col, row).every(
    ({ r, c }) => c >= 0 && c < COLS && r < ROWS && (r < 0 || !state.board[r][c])
  );
}

function clearLockTimer() {
  if (state.lockTimer) { clearTimeout(state.lockTimer); state.lockTimer = null; }
}

function resetLockDelay() {
  clearLockTimer();
  state.lockTimer = setTimeout(() => {
    if (state.onGround && !state.gameOver && !state.paused && !state.clearing) lockPiece();
  }, LOCK_DELAY);
}

function checkGrounded() {
  const { type, rotation: rot, col, row } = state.current;
  const grounded = !isValid(type, rot, col, row + 1);
  if (grounded && !state.onGround) {
    state.onGround = true;
    resetLockDelay();
  } else if (!grounded && state.onGround) {
    state.onGround = false;
    clearLockTimer();
  }
}

function lockPiece() {
  clearLockTimer();
  pieceCells(state.current.type, state.current.rotation, state.current.col, state.current.row)
    .forEach(({ r, c }) => { if (r >= 0) state.board[r][c] = state.current.type; });
  playSound('lock');
  clearLines();
}

function clearLines() {
  const full = [];
  for (let r = 0; r < ROWS; r++) {
    if (state.board[r].every(c => c !== null)) full.push(r);
  }
  if (!full.length) { spawnPiece(); return; }

  state.clearing  = true;
  state.flashRows = full;
  state.flashUntil = Date.now() + 380;

  if (full.length === 4) playSound('tetris');
  else                   playSound('line');

  setTimeout(() => {
    full.slice().sort((a, b) => b - a).forEach(r => {
      state.board.splice(r, 1);
      state.board.unshift(Array(COLS).fill(null));
    });
    state.flashRows  = [];
    state.flashUntil = 0;

    const n = full.length;
    state.score += SCORE_TABLE[n] * state.level;
    state.lines += n;

    const newLevel = Math.floor(state.lines / 10) + 1;
    if (newLevel > state.level) {
      state.level = newLevel;
      playSound('levelup');
      popStat('display-level');
    }

    updateHUD();
    state.clearing = false;
    spawnPiece();
  }, 380);
}

// ── Piece System ───────────────────────────────────────────────────────────
const BAG_TYPES = ['I','O','T','S','Z','J','L'];
let bag = [];

function nextFromBag() {
  if (!bag.length) bag = [...BAG_TYPES].sort(() => Math.random() - 0.5);
  return bag.pop();
}

function spawnPiece() {
  state.current = {
    type:     state.next.type,
    rotation: 0,
    col:      3,
    row:      -1,
  };
  state.next = { type: nextFromBag() };
  state.canHold   = true;
  state.onGround  = false;

  if (!isValid(state.current.type, 0, state.current.col, state.current.row)) {
    triggerGameOver();
    return;
  }
  checkGrounded();
  drawPreview(nextCtx, nextCanvas, state.next.type);
  if (nextCtxM) drawPreview(nextCtxM, nextCanvasM, state.next.type);
}

function ghostRow() {
  let r = state.current.row;
  while (isValid(state.current.type, state.current.rotation, state.current.col, r + 1)) r++;
  return r;
}

function tryMove(dc) {
  const { type, rotation: rot, col, row } = state.current;
  if (!isValid(type, rot, col + dc, row)) return false;
  state.current.col += dc;
  checkGrounded();
  playSound('move');
  return true;
}

function tryRotate(dir) {
  const { type, rotation: rot, col, row } = state.current;
  const newRot = (rot + (dir === 1 ? 1 : 3)) % 4;
  const kicks  = type === 'I' ? KICKS_I : KICKS_JLSTZ;
  const idx    = dir === 1 ? rot : newRot;
  for (const [dc, dr] of kicks[idx]) {
    if (isValid(type, newRot, col + dc, row + dr)) {
      state.current.rotation = newRot;
      state.current.col += dc;
      state.current.row += dr;
      checkGrounded();
      playSound('rotate');
      return true;
    }
  }
  return false;
}

function hardDrop() {
  const gr = ghostRow();
  const dist = gr - state.current.row;
  state.current.row = gr;
  state.score += dist * 2;
  updateHUD();
  clearLockTimer();
  lockPiece();
}

function softDrop() {
  const { type, rotation: rot, col, row } = state.current;
  if (!isValid(type, rot, col, row + 1)) return;
  state.current.row++;
  state.score++;
  state.lastDrop = performance.now();
  updateHUD();
  checkGrounded();
}

function holdPiece() {
  if (!state.canHold) return;
  playSound('hold');
  const prev = state.held ? state.held.type : null;
  state.held    = { type: state.current.type };
  state.canHold = false;
  clearLockTimer();

  if (prev) {
    state.current = { type: prev, rotation: 0, col: 3, row: -1 };
    state.onGround = false;
    if (!isValid(state.current.type, 0, state.current.col, state.current.row)) {
      triggerGameOver(); return;
    }
    checkGrounded();
  } else {
    spawnPiece();
  }
  drawPreview(holdCtx, holdCanvas, state.held.type);
  if (holdCtxM) drawPreview(holdCtxM, holdCanvasM, state.held.type);
}

// ── Rendering ──────────────────────────────────────────────────────────────
const boardCanvas = document.getElementById('canvas-board');
const boardCtx    = boardCanvas.getContext('2d');
const nextCanvas  = document.getElementById('canvas-next');
const nextCtx     = nextCanvas.getContext('2d');
const holdCanvas  = document.getElementById('canvas-hold');
const holdCtx     = holdCanvas.getContext('2d');

// Mobile-only mirror canvases (null on desktop)
const nextCanvasM = document.getElementById('canvas-next-m');
const nextCtxM    = nextCanvasM?.getContext('2d') ?? null;
const holdCanvasM = document.getElementById('canvas-hold-m');
const holdCtxM    = holdCanvasM?.getContext('2d') ?? null;

function drawCell(ctx, c, r, color, alpha) {
  const x = c * CELL;
  const y = r * CELL;
  ctx.save();
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  // Fill
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
  // Top-left highlight
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.fillRect(x + 1, y + 1, CELL - 2, 4);
  ctx.fillRect(x + 1, y + 1, 4, CELL - 2);
  // Bottom-right shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x + 1, y + CELL - 5, CELL - 2, 4);
  ctx.fillRect(x + CELL - 5, y + 1, 4, CELL - 2);
  ctx.restore();
}

function render() {
  // Background
  boardCtx.fillStyle = '#080810';
  boardCtx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);

  // Subtle grid
  boardCtx.strokeStyle = 'rgba(255,255,255,0.04)';
  boardCtx.lineWidth = 1;
  for (let r = 1; r < ROWS; r++) {
    boardCtx.beginPath();
    boardCtx.moveTo(0, r * CELL);
    boardCtx.lineTo(COLS * CELL, r * CELL);
    boardCtx.stroke();
  }
  for (let c = 1; c < COLS; c++) {
    boardCtx.beginPath();
    boardCtx.moveTo(c * CELL, 0);
    boardCtx.lineTo(c * CELL, ROWS * CELL);
    boardCtx.stroke();
  }

  const now = Date.now();
  const flashing = state.flashRows.length > 0 && now < state.flashUntil;
  const flashOn  = flashing && Math.floor(now / 70) % 2 === 0;

  // Locked cells
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const type = state.board[r][c];
      if (!type) continue;
      if (flashing && state.flashRows.includes(r)) {
        drawCell(boardCtx, c, r, flashOn ? '#ffffff' : '#888899');
      } else {
        drawCell(boardCtx, c, r, COLORS[type]);
      }
    }
  }

  if (state.current && !state.gameOver) {
    // Ghost piece
    const gr = ghostRow();
    if (gr !== state.current.row) {
      pieceCells(state.current.type, state.current.rotation, state.current.col, gr)
        .forEach(({ r, c }) => { if (r >= 0) drawCell(boardCtx, c, r, COLORS[state.current.type], GHOST_ALPHA); });
    }
    // Active piece
    pieceCells(state.current.type, state.current.rotation, state.current.col, state.current.row)
      .forEach(({ r, c }) => { if (r >= 0) drawCell(boardCtx, c, r, COLORS[state.current.type]); });
  }
}

function drawPreview(ctx, canvas, type) {
  ctx.fillStyle = '#080810';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!type) return;

  const matrix = PIECES[type][0];
  let minR=4,maxR=0,minC=4,maxC=0;
  matrix.forEach((row,r)=>row.forEach((v,c)=>{
    if(v){minR=Math.min(minR,r);maxR=Math.max(maxR,r);minC=Math.min(minC,c);maxC=Math.max(maxC,c);}
  }));
  const pc = 14;
  const pw = (maxC - minC + 1) * pc;
  const ph = (maxR - minR + 1) * pc;
  const ox = Math.floor((canvas.width  - pw) / 2) - minC * pc;
  const oy = Math.floor((canvas.height - ph) / 2) - minR * pc;

  matrix.forEach((rowArr, r) => rowArr.forEach((v, c) => {
    if (!v) return;
    const x = ox + c * pc;
    const y = oy + r * pc;
    ctx.fillStyle = COLORS[type];
    ctx.fillRect(x+1, y+1, pc-2, pc-2);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(x+1, y+1, pc-2, 3);
    ctx.fillRect(x+1, y+1, 3, pc-2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x+1, y+pc-4, pc-2, 3);
    ctx.fillRect(x+pc-4, y+1, 3, pc-2);
  }));
}

function updateHUD() {
  document.getElementById('display-score').textContent = state.score.toLocaleString();
  document.getElementById('display-level').textContent = state.level;
  document.getElementById('display-lines').textContent = state.lines;
}

function popStat(id) {
  const el = document.getElementById(id);
  el.classList.remove('stat-pop');
  void el.offsetWidth;
  el.classList.add('stat-pop');
}

// ── Game Loop ──────────────────────────────────────────────────────────────
let loopId = null;

function gameLoop(timestamp) {
  loopId = requestAnimationFrame(gameLoop);

  if (!state.gameOver && !state.paused && !state.clearing && state.current) {
    const gravity = GRAVITY[Math.min(state.level, GRAVITY.length - 1)];
    if (timestamp - state.lastDrop >= gravity) {
      const { type, rotation: rot, col, row } = state.current;
      if (isValid(type, rot, col, row + 1)) {
        state.current.row++;
        state.onGround = false;
        clearLockTimer();
      } else {
        checkGrounded();
      }
      state.lastDrop = timestamp;
    }
  }

  render();
}

// ── Screen Management ──────────────────────────────────────────────────────
const screens = {
  menu:   document.getElementById('screen-menu'),
  scores: document.getElementById('screen-scores'),
  game:   document.getElementById('screen-game'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
  state.screen = name;
}

// ── Game Start / Over ──────────────────────────────────────────────────────
function startGame() {
  state.board     = emptyBoard();
  state.score     = 0;
  state.level     = 1;
  state.lines     = 0;
  state.gameOver  = false;
  state.paused    = false;
  state.held      = null;
  state.canHold   = true;
  state.flashRows = [];
  state.flashUntil= 0;
  state.clearing  = false;
  state.onGround  = false;
  state.awaitingInitials = false;
  bag = [];

  document.getElementById('pause-overlay').classList.add('hidden');
  document.getElementById('gameover-overlay').classList.add('hidden');

  updateHUD();
  drawPreview(holdCtx, holdCanvas, null);
  if (holdCtxM) drawPreview(holdCtxM, holdCanvasM, null);

  state.next = { type: nextFromBag() };
  spawnPiece();

  showScreen('game');
  bgmStart();

  if (loopId) cancelAnimationFrame(loopId);
  state.lastDrop = performance.now();
  loopId = requestAnimationFrame(gameLoop);
}

function triggerGameOver() {
  state.gameOver = true;
  clearLockTimer();
  bgmStop();
  playSound('gameover');

  document.getElementById('gameover-score').textContent = state.score.toLocaleString();
  const overlay = document.getElementById('gameover-overlay');
  overlay.classList.remove('hidden');

  const entry = document.getElementById('initials-entry');
  if (isHighScore(state.score) && state.score > 0) {
    entry.classList.remove('hidden');
    state.awaitingInitials = true;
    const input = document.getElementById('initials-input');
    input.value = '';
    setTimeout(() => input.focus(), 50);
  } else {
    entry.classList.add('hidden');
    state.awaitingInitials = false;
  }
}

function submitInitials() {
  if (!state.awaitingInitials) return;
  const raw   = document.getElementById('initials-input').value.trim();
  const name  = raw || 'AAA';
  addHighScore(name, state.score);
  state.awaitingInitials = false;
  document.getElementById('initials-entry').classList.add('hidden');
}

function togglePause() {
  if (state.gameOver) return;
  state.paused = !state.paused;
  document.getElementById('pause-overlay').classList.toggle('hidden', !state.paused);
  if (state.paused) {
    bgmPause();
    clearLockTimer();
  } else {
    bgmResume();
    if (state.onGround) resetLockDelay();
    state.lastDrop = performance.now();
  }
}

function goToMenu() {
  bgmStop();
  if (state.awaitingInitials) submitInitials();
  stopDAS();
  showScreen('menu');
}

// ── DAS (Delayed Auto-Shift) ───────────────────────────────────────────────
function startDAS(dir) {
  stopDAS();
  state.dasDir = dir;
  state.dasTimer = setTimeout(() => {
    state.dasRepeat = setInterval(() => {
      if (!state.paused && !state.gameOver && !state.clearing) tryMove(dir);
    }, DAS_REPEAT);
  }, DAS_DELAY);
}

function stopDAS() {
  clearTimeout(state.dasTimer);
  clearInterval(state.dasRepeat);
  state.dasTimer = null;
  state.dasRepeat = null;
  state.dasDir = 0;
}

let softDropInterval = null;

function startSoftDrop() {
  stopSoftDrop();
  softDropInterval = setInterval(() => {
    if (!state.paused && !state.gameOver && !state.clearing) softDrop();
  }, 50);
}

function stopSoftDrop() {
  clearInterval(softDropInterval);
  softDropInterval = null;
}

// ── Input ──────────────────────────────────────────────────────────────────
const keysHeld = {};

document.addEventListener('keydown', e => {
  // Let initials input handle its own keys
  if (document.activeElement === document.getElementById('initials-input')) {
    if (e.code === 'Enter') { e.preventDefault(); submitInitials(); }
    return;
  }

  if (keysHeld[e.code]) return;
  keysHeld[e.code] = true;

  if (state.screen === 'menu') {
    if (e.code === 'Enter') { playSound('click'); startGame(); }
    return;
  }

  if (state.screen === 'scores') {
    if (e.code === 'Escape' || e.code === 'Enter') {
      playSound('click'); showScreen('menu');
    }
    return;
  }

  // Game screen
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (!state.gameOver) { playSound('click'); togglePause(); }
    return;
  }

  if (state.paused || state.gameOver || state.clearing) return;

  switch (e.code) {
    case 'ArrowLeft':
      tryMove(-1); startDAS(-1); break;
    case 'ArrowRight':
      tryMove(1);  startDAS(1);  break;
    case 'ArrowDown':
      softDrop(); startSoftDrop(); break;
    case 'ArrowUp': case 'KeyX':
      tryRotate(1); break;
    case 'KeyZ':
      tryRotate(-1); break;
    case 'Space':
      e.preventDefault(); hardDrop(); break;
    case 'KeyC': case 'ShiftLeft': case 'ShiftRight':
      holdPiece(); break;
  }
});

document.addEventListener('keyup', e => {
  keysHeld[e.code] = false;
  if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') stopDAS();
  if (e.code === 'ArrowDown') stopSoftDrop();
});

// ── Event Listeners ────────────────────────────────────────────────────────
document.getElementById('btn-start').addEventListener('click', () => {
  playSound('click'); startGame();
});

document.getElementById('btn-scores').addEventListener('click', () => {
  playSound('click'); renderScoresTable(); showScreen('scores');
});

document.getElementById('btn-scores-back').addEventListener('click', () => {
  playSound('click'); showScreen('menu');
});

document.getElementById('btn-resume').addEventListener('click', () => {
  playSound('click'); togglePause();
});

document.getElementById('btn-pause-menu').addEventListener('click', () => {
  playSound('click'); goToMenu();
});

document.getElementById('btn-play-again').addEventListener('click', () => {
  playSound('click');
  if (state.awaitingInitials) submitInitials();
  startGame();
});

document.getElementById('btn-gameover-menu').addEventListener('click', () => {
  playSound('click');
  if (state.awaitingInitials) submitInitials();
  goToMenu();
});

// Initials input: enter key submits
document.getElementById('initials-input').addEventListener('keydown', e => {
  if (e.code === 'Enter') { e.preventDefault(); submitInitials(); }
});

// ── Touch Controls ─────────────────────────────────────────────────────────
let tcStartX = 0, tcStartY = 0;
const SWIPE_THRESH = 14;

boardCanvas.addEventListener('touchstart', e => {
  e.preventDefault();
  tcStartX = e.touches[0].clientX;
  tcStartY = e.touches[0].clientY;
}, { passive: false });

boardCanvas.addEventListener('touchend', e => {
  e.preventDefault();
  if (state.paused || state.gameOver || state.clearing) return;
  const dx = e.changedTouches[0].clientX - tcStartX;
  const dy = e.changedTouches[0].clientY - tcStartY;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax < SWIPE_THRESH && ay < SWIPE_THRESH) {
    tryRotate(1);                            // tap → rotate CW
  } else if (ax > ay) {
    tryMove(dx > 0 ? 1 : -1);               // horizontal swipe → move
  } else if (dy > SWIPE_THRESH) {
    softDrop();                              // swipe down → soft drop
  } else {
    hardDrop();                              // swipe up → hard drop
  }
}, { passive: false });

function wireTouchDAS(id, dir) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('touchstart', e => {
    e.preventDefault();
    if (!state.paused && !state.gameOver && !state.clearing) { tryMove(dir); startDAS(dir); }
  }, { passive: false });
  el.addEventListener('touchend',   e => { e.preventDefault(); stopDAS(); }, { passive: false });
  el.addEventListener('touchcancel',e => { e.preventDefault(); stopDAS(); }, { passive: false });
}

function wireTouchTap(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('touchstart', e => {
    e.preventDefault();
    if (!state.paused && !state.gameOver && !state.clearing) fn();
  }, { passive: false });
}

wireTouchDAS('tc-left', -1);
wireTouchDAS('tc-right', 1);
wireTouchTap('tc-rotate', () => tryRotate(1));
wireTouchTap('tc-drop',   hardDrop);

document.getElementById('tc-hold-btn')?.addEventListener('touchstart', e => {
  e.preventDefault();
  if (!state.paused && !state.gameOver && !state.clearing) holdPiece();
}, { passive: false });

document.getElementById('tc-pause-btn')?.addEventListener('touchstart', e => {
  e.preventDefault();
  if (!state.gameOver) { playSound('click'); togglePause(); }
}, { passive: false });

// ── Layout Init ────────────────────────────────────────────────────────────
function initLayout() {
  const touch  = window.matchMedia('(pointer: coarse)').matches;
  const narrow = window.innerWidth < 600;
  if (!touch && !narrow) return;

  const safeW = window.innerWidth - 24;
  const safeH = window.innerHeight - 220;   // reserve space for stats + touch controls
  CELL = Math.min(30, Math.floor(Math.min(safeW / COLS, safeH / ROWS)));
  CANVAS_W = COLS * CELL;
  CANVAS_H = ROWS * CELL;

  boardCanvas.width  = CANVAS_W;
  boardCanvas.height = CANVAS_H;

  const root = document.documentElement;
  root.style.setProperty('--board-w', CANVAS_W + 'px');
  root.style.setProperty('--board-h', CANVAS_H + 'px');
}

// ── Init ───────────────────────────────────────────────────────────────────
initLayout();
drawPreview(nextCtx, nextCanvas, null);
drawPreview(holdCtx, holdCanvas, null);
if (nextCtxM) drawPreview(nextCtxM, nextCanvasM, null);
if (holdCtxM) drawPreview(holdCtxM, holdCanvasM, null);
