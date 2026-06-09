'use strict';

// ── Constants ──────────────────────────────────────────────────────────────
const WIN_LINES = [
  [0,1,2],[3,4,5],[6,7,8], // rows
  [0,3,6],[1,4,7],[2,5,8], // cols
  [0,4,8],[2,4,6],         // diags
];

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  board: Array(9).fill(null),
  currentPlayer: 'X',
  mode: 'pvp',   // 'pvp' | 'pve'
  level: 1,
  gameOver: false,
  aiThinking: false,
};

// ── Audio ──────────────────────────────────────────────────────────────────
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, dur, type = 'sine', vol = 0.22) {
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
      case 'click':
        playTone(900, 0.05, 'sine', 0.08);
        break;
      case 'place-x':
        playTone(523, 0.1, 'square', 0.12);
        break;
      case 'place-o':
        playTone(392, 0.1, 'square', 0.12);
        break;
      case 'win':
        [523, 659, 784].forEach((f, i) =>
          setTimeout(() => playTone(f, 0.2, 'sine', 0.22), i * 140));
        break;
      case 'lose':
        [392, 330, 262].forEach((f, i) =>
          setTimeout(() => playTone(f, 0.2, 'sine', 0.22), i * 140));
        break;
      case 'draw':
        playTone(440, 0.12);
        setTimeout(() => playTone(415, 0.18), 130);
        break;
      case 'level-up':
        [523, 784].forEach((f, i) =>
          setTimeout(() => playTone(f, 0.16, 'sine', 0.26), i * 140));
        break;
      case 'victory':
        [523, 659, 784, 1047, 1319].forEach((f, i) =>
          setTimeout(() => playTone(f, 0.2, 'sine', 0.26), i * 130));
        break;
    }
  } catch (_) {}
}

// ── Game Logic ─────────────────────────────────────────────────────────────
function checkWinner(board) {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: [a, b, c] };
    }
  }
  if (board.every(v => v !== null)) return { winner: 'draw', line: [] };
  return null;
}

function emptyCells(board) {
  return board.reduce((acc, v, i) => (v === null ? [...acc, i] : acc), []);
}

function findThreat(board, sym) {
  for (const [a, b, c] of WIN_LINES) {
    const row = [board[a], board[b], board[c]];
    if (row.filter(v => v === sym).length === 2 && row.includes(null)) {
      return [a, b, c][row.indexOf(null)];
    }
  }
  return -1;
}

// Level 1 – mostly random, occasionally blocks
function aiMoveLevel1(board) {
  if (Math.random() < 0.3) {
    const block = findThreat(board, 'X');
    if (block !== -1) return block;
  }
  const empty = emptyCells(board);
  return empty[Math.floor(Math.random() * empty.length)];
}

// Level 2 – take win, block loss, prefer center/corners, then random
function aiMoveLevel2(board) {
  const win   = findThreat(board, 'O');
  if (win   !== -1) return win;
  const block = findThreat(board, 'X');
  if (block !== -1) return block;
  for (const i of [4, 0, 2, 6, 8, 1, 3, 5, 7]) {
    if (board[i] === null) return i;
  }
  return emptyCells(board)[0];
}

// Level 3 – full minimax (unbeatable)
function minimax(board, depth, isMax) {
  const result = checkWinner(board);
  if (result) {
    if (result.winner === 'O') return 10 - depth;
    if (result.winner === 'X') return depth - 10;
    return 0;
  }
  const empty = emptyCells(board);
  if (isMax) {
    let best = -Infinity;
    for (const i of empty) {
      board[i] = 'O';
      best = Math.max(best, minimax(board, depth + 1, false));
      board[i] = null;
    }
    return best;
  } else {
    let best = Infinity;
    for (const i of empty) {
      board[i] = 'X';
      best = Math.min(best, minimax(board, depth + 1, true));
      board[i] = null;
    }
    return best;
  }
}

function aiMoveLevel3(board) {
  let bestScore = -Infinity, bestMove = -1;
  for (const i of emptyCells(board)) {
    board[i] = 'O';
    const score = minimax(board, 0, false);
    board[i] = null;
    if (score > bestScore) { bestScore = score; bestMove = i; }
  }
  return bestMove;
}

function getAiMove(board, level) {
  if (level === 1) return aiMoveLevel1(board);
  if (level === 2) return aiMoveLevel2(board);
  return aiMoveLevel3([...board]);
}

// ── DOM References ─────────────────────────────────────────────────────────
const screens = {
  menu:    document.getElementById('screen-menu'),
  board:   document.getElementById('screen-board'),
  victory: document.getElementById('screen-victory'),
};

const cells          = document.querySelectorAll('.cell');
const turnLabel      = document.getElementById('turn-label');
const levelBadge     = document.getElementById('level-badge');
const overlay        = document.getElementById('game-over-overlay');
const resultText     = document.getElementById('result-text');
const resultSubtitle = document.getElementById('result-subtitle');
const btnNextLevel   = document.getElementById('btn-next-level');
const victoryStar    = document.getElementById('victory-star');

// ── Screen Management ──────────────────────────────────────────────────────
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

function showVictoryScreen() {
  showScreen('victory');
  // Reset star animation so it plays fresh each time
  victoryStar.classList.remove('animate');
  void victoryStar.offsetWidth; // trigger reflow
  victoryStar.classList.add('animate');
}

// ── Board Rendering ────────────────────────────────────────────────────────
function renderBoard() {
  cells.forEach((cell, i) => {
    const val = state.board[i];
    cell.className = 'cell';
    cell.innerHTML = '';
    if (val) {
      cell.classList.add(val.toLowerCase());
      const span = document.createElement('span');
      span.className = 'piece';
      span.textContent = val;
      cell.appendChild(span);
    }
  });
}

function updateTurnLabel() {
  if (state.mode === 'pvp') {
    turnLabel.textContent = `Player ${state.currentPlayer}'s Turn`;
  } else {
    turnLabel.textContent = state.currentPlayer === 'X' ? 'Your Turn' : 'AI is thinking…';
  }
}

function updateLevelBadge() {
  if (state.mode === 'pve') {
    levelBadge.className = `level-badge level-${state.level}`;
    levelBadge.textContent = `Level ${state.level}`;
    levelBadge.classList.remove('hidden');
  } else {
    levelBadge.classList.add('hidden');
  }
}

// ── Game Over ──────────────────────────────────────────────────────────────
function showGameOver(result) {
  state.gameOver = true;

  // Highlight winning cells
  if (result.line.length) {
    result.line.forEach(i => cells[i].classList.add('winning-cell'));
  }

  // Special case: player wins level 3 → show victory screen
  if (state.mode === 'pve' && result.winner === 'X' && state.level === 3) {
    setTimeout(() => {
      playSound('victory');
      state.level = 1;
      showVictoryScreen();
    }, 800);
    return;
  }

  setTimeout(() => {
    overlay.classList.remove('hidden');
    // Force reflow so transition plays
    void overlay.offsetWidth;
    overlay.classList.add('show');

    btnNextLevel.classList.add('hidden');

    if (state.mode === 'pvp') {
      if (result.winner === 'draw') {
        resultText.textContent = "It's a Draw!";
        resultSubtitle.textContent = '';
        playSound('draw');
      } else {
        resultText.textContent = `Player ${result.winner} Wins!`;
        resultSubtitle.textContent = '';
        playSound('win');
      }
    } else {
      if (result.winner === 'X') {
        resultText.textContent = 'You Win!';
        resultSubtitle.textContent = `Level ${state.level} Complete!`;
        btnNextLevel.classList.remove('hidden');
        playSound('level-up');
      } else if (result.winner === 'O') {
        resultText.textContent = 'You Lose!';
        resultSubtitle.textContent = 'Try again?';
        playSound('lose');
      } else {
        resultText.textContent = "It's a Draw!";
        resultSubtitle.textContent = 'Try again?';
        playSound('draw');
      }
    }
  }, 600);
}

// ── Game Start ─────────────────────────────────────────────────────────────
function startGame() {
  state.board = Array(9).fill(null);
  state.currentPlayer = 'X';
  state.gameOver = false;
  state.aiThinking = false;

  overlay.classList.add('hidden');
  overlay.classList.remove('show');
  btnNextLevel.classList.add('hidden');

  renderBoard();
  updateLevelBadge();
  updateTurnLabel();
  showScreen('board');
}

// ── Click Handler ──────────────────────────────────────────────────────────
function handleCellClick(index) {
  if (state.gameOver || state.board[index] !== null || state.aiThinking) return;
  if (state.mode === 'pve' && state.currentPlayer === 'O') return;

  playSound(state.currentPlayer === 'X' ? 'place-x' : 'place-o');
  state.board[index] = state.currentPlayer;
  renderBoard();

  const result = checkWinner(state.board);
  if (result) { showGameOver(result); return; }

  state.currentPlayer = state.currentPlayer === 'X' ? 'O' : 'X';
  updateTurnLabel();

  if (state.mode === 'pve' && state.currentPlayer === 'O') {
    state.aiThinking = true;
    const delay = state.level === 3 ? 620 : state.level === 2 ? 450 : 300 + Math.random() * 300;

    setTimeout(() => {
      if (state.gameOver) return;

      const move = getAiMove([...state.board], state.level);
      if (move === -1) return;

      playSound('place-o');
      state.board[move] = 'O';
      state.aiThinking = false;
      renderBoard();

      const aiResult = checkWinner(state.board);
      if (aiResult) { showGameOver(aiResult); return; }

      state.currentPlayer = 'X';
      updateTurnLabel();
    }, delay);
  }
}

// ── Event Listeners ────────────────────────────────────────────────────────
document.getElementById('btn-pvp').addEventListener('click', () => {
  playSound('click');
  state.mode = 'pvp';
  state.level = 1;
  startGame();
});

document.getElementById('btn-pve').addEventListener('click', () => {
  playSound('click');
  state.mode = 'pve';
  state.level = 1;
  startGame();
});

document.getElementById('btn-menu').addEventListener('click', () => {
  playSound('click');
  showScreen('menu');
});

cells.forEach((cell, i) => {
  cell.addEventListener('click', () => handleCellClick(i));
});

document.getElementById('btn-retry').addEventListener('click', () => {
  playSound('click');
  startGame();
});

document.getElementById('btn-next-level').addEventListener('click', () => {
  playSound('click');
  state.level++;
  startGame();
});

document.getElementById('btn-back-menu').addEventListener('click', () => {
  playSound('click');
  showScreen('menu');
});

document.getElementById('btn-play-again').addEventListener('click', () => {
  playSound('click');
  state.mode = 'pve';
  state.level = 1;
  startGame();
});

document.getElementById('btn-victory-menu').addEventListener('click', () => {
  playSound('click');
  showScreen('menu');
});
