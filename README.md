# web-games

A small collection of self-contained browser games. Each game is a single `index.html`
file with no dependencies, no build step, and no assets — just open it in a browser.

## Games

### 🧟 Dead Sector — `zombie-shooter/`
A *Bullet Echo*–style top-down zombie survival shooter. A lone soldier holds a dark, walled
arena against escalating hordes, revealed only by a flashlight **vision cone**. Canvas 2D with
raycast fog-of-war, Web Audio synth, and a top-5 dashboard — no assets.

- **WASD** move · **mouse** aims the light & gun (fires **automatically**) · **R** reload
  (auto-reloads when empty) · **Space / left-click** launches the RPG · **P/Esc** pause · **M** mute.
- **Vision cone + fog of war:** the map is dark; a raycast flashlight cone (plus a small
  near-radius) reveals zombies, and **walls block the light** and bullets.
- **100 HP / 100 armor:** damage hits armor first; armor regenerates after ~4s without being hit,
  but once it **fully breaks** it won't recharge until you grab an **armor core**. Ammo is infinite.
- **6 rounds** of escalating zombie count/HP/speed (round 6 is **endless**); zombies stream from
  all sides and path around cover via a flow field. **+10 points per kill.**
- **Weapon progression** (one drops each cleared round): pistol → twin pistols → shotgun → SMG →
  M4 rifle → M429 machine gun. In round 6 an **RPG** spawns every 30s — pick it up to fire one
  explosive rocket, then it reverts to the M429.
- Pickups (health kit, ammo, armor core) drop over time and from kills; procedural muzzle flashes,
  blood, explosions, damage numbers, and synthesized weapon/explosion/zombie sounds.
- Top-5 high scores with name entry, persisted via `localStorage`.

**Play:** open `zombie-shooter/index.html`.

### 🐉 Dragon Slayer — `pokemon-dragon/`
A retro, turn-based battle game. Pick one of three heroes and fight an ancient dragon.

- **🛡️ Knight** — Sword, high attack (30), 100 HP.
- **🧙 Witch** — Staff, low attack (12), 125 HP, auto-heals +10 HP every round.
- **🏹 Archer** — Bow, normal attack (20), 75 HP, 50% chance to dodge the dragon's attack.

Each round you **Attack** or **Strengthen**. A single buff value (capped at +3 / −3)
tracks your power: Strengthen adds +1 (×1.5 damage per point), the dragon's Weaken
subtracts 1 (×0.5 per point). The dragon uses a weighted AI to attack, heal, or weaken
you. Features HP bars, floating damage numbers, and CSS sprite animations.

**Play:** open `pokemon-dragon/index.html`.

### 🟦 Tetris — `tetris/`
Classic Tetris with a dark neon 80s aesthetic. Full SRS rotation system, BGM, and a top-5 high-score board.

- All 7 standard pieces (I/O/T/S/Z/J/L) with SRS wall kicks and a 7-bag randomizer.
- Ghost piece shows where the active piece will land.
- Hold piece (C / Shift), soft drop (↓), hard drop (Space), CCW rotation (Z).
- Gravity speeds up every 10 lines; scoring follows the standard 1/2/3/4-line multiplier.
- BGM: Korobeiniki (Tetris A-theme) synthesized via Web Audio API — square-wave chip-tune, loops seamlessly.
- Line-clear flash animation, level-up stat pop, CRT scanline overlay.
- Top-5 high scores with initials entry, persisted via `localStorage`.

**Play:** open `tetris/index.html`.

### ❌ Tic Tac Toe — `tictactoe/`
Classic 3-in-a-row, two modes: local 2-player or solo vs AI.

- **2 Players** — pass-and-play on the same screen.
- **vs AI** — three escalating levels:
  - Level 1: mostly random, blocks 30% of the time.
  - Level 2: always takes a winning move or blocks yours; prefers center and corners.
  - Level 3: full minimax — unbeatable.
- Sound effects via Web Audio API (place, win, lose, draw, level-up, victory fanfare).
- Beat all three AI levels to reach the victory screen.

**Play:** open `tictactoe/index.html`.

### 🔢 2048 — `2048/`
The classic sliding-tile puzzle. Combine matching tiles to reach 2048.

- Arrow keys / WASD on desktop, swipe on touch devices.
- Score + best score (best persists via `localStorage`).
- Win detection at 2048 with a "Keep going" option, plus game-over detection.

**Play:** open `2048/index.html`.
