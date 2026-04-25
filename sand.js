'use strict';

// ─── Grid dimensions ──────────────────────────────────────────────────────────
const W = 400;
const H = 225;

// ─── Material IDs ─────────────────────────────────────────────────────────────
const AIR   = 0;
const SAND  = 1;
const WATER = 2;
const FIRE  = 3;
const PLANT = 4;
const WOOD  = 5;
const STONE = 6;
const OIL   = 7;
const SMOKE = 8;
const ACID  = 9;
const LAVA  = 10;
const ICE   = 11;

// ─── Material display ─────────────────────────────────────────────────────────
const MAT_INFO = [
  { name: 'Erase',  color: '#1a1a1a', key: '0' },
  { name: 'Sand',   color: '#c8a050', key: '1' },
  { name: 'Water',  color: '#1a6fff', key: '2' },
  { name: 'Fire',   color: '#ff5500', key: '3' },
  { name: 'Plant',  color: '#22aa22', key: '4' },
  { name: 'Wood',   color: '#8b5e3c', key: '5' },
  { name: 'Stone',  color: '#888888', key: '6' },
  { name: 'Oil',    color: '#a07810', key: '7' },
  { name: 'Smoke',  color: '#666666', key: '8' },
  { name: 'Acid',   color: '#39ff14', key: '9' },
  { name: 'Lava',   color: '#ff6600', key: 'Q' },
  { name: 'Ice',    color: '#a0dfff', key: 'W' },
];

// ─── Canvas setup ─────────────────────────────────────────────────────────────
const canvas  = document.getElementById('canvas');
const ctx     = canvas.getContext('2d');
canvas.width  = W;
canvas.height = H;

// ─── Simulation state ─────────────────────────────────────────────────────────
const grid      = new Uint8Array(W * H);
const colorVar  = new Uint8Array(W * H);
const meta      = new Uint16Array(W * H);
const processed = new Uint8Array(W * H);

const imgData = ctx.createImageData(W, H);
const pixels  = imgData.data;

let frame  = 0;
let paused = false;

// ─── Ambient temperature ──────────────────────────────────────────────────────
// Stored internally in Fahrenheit. Range 0–10,000°F.
let ambientF   = 70;
let useCelsius = false;

// Piecewise linear curve: [sliderPct (0–100), tempF]
// Key thresholds each get proportional slider travel so precision is
// highest where it matters (low–mid temps).
const TEMP_CURVE = [
  [  0,     0],
  [ 15,    32],   // freeze
  [ 25,   212],   // boiling
  [ 35,   480],   // combustion / wood ignition
  [ 50,  1300],   // lava stays molten
  [ 62,  2000],   // stone melts
  [ 72,  3100],   // sand melts (silica)
  [ 85,  6000],   // inferno
  [100, 10000],   // plasma
];

function sliderToTemp(pct) {
  for (let i = 1; i < TEMP_CURVE.length; i++) {
    const [p0, t0] = TEMP_CURVE[i - 1];
    const [p1, t1] = TEMP_CURVE[i];
    if (pct <= p1) {
      return Math.round(t0 + (pct - p0) / (p1 - p0) * (t1 - t0));
    }
  }
  return 10000;
}

function tempToSlider(temp) {
  for (let i = 1; i < TEMP_CURVE.length; i++) {
    const [p0, t0] = TEMP_CURVE[i - 1];
    const [p1, t1] = TEMP_CURVE[i];
    if (temp <= t1) {
      return p0 + (temp - t0) / (t1 - t0) * (p1 - p0);
    }
  }
  return 100;
}

// Slider stores 0–1000 (= pct × 10) for fine integer resolution
function syncSlider() {
  document.getElementById('sTempSlider').value =
    Math.round(tempToSlider(ambientF) * 10);
}

// Key thresholds (°F)
const T_FREEZE     =   32;   // water ↔ ice
const T_BOIL       =  212;   // water → steam
const T_OIL_FLASH  =  500;   // oil auto-ignites
const T_WOOD_BURN  =  480;   // wood / plant auto-ignites
const T_LAVA_COOL  = 1300;   // lava solidifies without water below this
const T_STONE_MELT = 2000;   // stone → lava
const T_SAND_MELT  = 3100;   // sand → lava (silica melting point)

// ─── Helpers ──────────────────────────────────────────────────────────────────
const inBounds  = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
const idx       = (x, y) => y * W + x;
const rand      = ()     => Math.random();
const randInt   = n      => (Math.random() * n) | 0;
const clamp     = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

function setCel(x, y, mat, life) {
  const i = idx(x, y);
  grid[i]     = mat;
  colorVar[i] = (rand() * 255) | 0;
  meta[i]     = life !== undefined ? life : 0;
}

function swapCells(i, j) {
  let t;
  t = grid[i];     grid[i]     = grid[j];     grid[j]     = t;
  t = colorVar[i]; colorVar[i] = colorVar[j]; colorVar[j] = t;
  t = meta[i];     meta[i]     = meta[j];     meta[j]     = t;
  processed[i] = 1;
  processed[j] = 1;
}

const isBurnable = mat => mat === WOOD || mat === PLANT || mat === OIL;
const isPassable = mat => mat === AIR || mat === SMOKE;

// ─── Per-material update ──────────────────────────────────────────────────────
function updateCell(x, y) {
  const i   = idx(x, y);
  if (processed[i]) return;
  const mat = grid[i];
  if (mat === AIR) return;

  // ── Sand ──────────────────────────────────────────────────────────────────
  if (mat === SAND) {
    // Melt at extreme temps — scales to ~70% chance/frame at 10,000°F
    if (ambientF > T_SAND_MELT) {
      const p = Math.min(0.70, (ambientF - T_SAND_MELT) / 9857);
      if (rand() < p) {
        // Above 7,000°F a fraction vaporises directly instead of becoming lava
        const vaporise = ambientF > 7000 && rand() < (ambientF - 7000) / 10000;
        grid[i] = vaporise ? SMOKE : LAVA;
        meta[i] = vaporise ? (rand()*80+40)|0 : 0;
        colorVar[i] = (rand()*255)|0; processed[i] = 1; return;
      }
    }
    if (y < H - 1) {
      const dn = idx(x, y + 1);
      const bt = grid[dn];
      if (bt === AIR || bt === SMOKE || bt === WATER || bt === OIL) { swapCells(i, dn); return; }
      const d = rand() < 0.5 ? 1 : -1;
      for (const dx of [d, -d]) {
        const nx = x + dx;
        if (!inBounds(nx, y + 1)) continue;
        const di = idx(nx, y + 1);
        const dt = grid[di];
        if (dt === AIR || dt === SMOKE || dt === WATER || dt === OIL) { swapCells(i, di); return; }
      }
    }
    return;
  }

  // ── Water ─────────────────────────────────────────────────────────────────
  if (mat === WATER) {
    // Freeze below 32°F — scales to ~5% chance/frame at 0°F
    if (ambientF < T_FREEZE && rand() < Math.min(0.05, (T_FREEZE - ambientF) / 640)) {
      setCel(x, y, ICE); processed[i] = 1; return;
    }
    // Evaporate above 212°F — scales to ~90% chance/frame at 10,000°F
    if (ambientF > T_BOIL && rand() < Math.min(0.90, (ambientF - T_BOIL) / 10876)) {
      grid[i] = SMOKE; meta[i] = (rand()*60+30)|0; colorVar[i] = (rand()*255)|0; processed[i] = 1; return;
    }
    if (y < H - 1) {
      const dn = idx(x, y + 1);
      const bt = grid[dn];
      if (isPassable(bt) || bt === OIL) { swapCells(i, dn); return; }
    }
    const d      = rand() < 0.5 ? 1 : -1;
    const spread = 4 + randInt(4);
    for (const dir of [d, -d]) {
      for (let s = 1; s <= spread; s++) {
        const nx = x + dir * s;
        if (!inBounds(nx, y)) break;
        const ni = idx(nx, y);
        if (grid[ni] === AIR) { swapCells(i, ni); return; }
        if (grid[ni] !== WATER) break;
      }
    }
    return;
  }

  // ── Oil ───────────────────────────────────────────────────────────────────
  if (mat === OIL) {
    // Auto-ignition above flash point — scales to ~60% chance/frame at 10,000°F
    if (ambientF > T_OIL_FLASH && rand() < Math.min(0.60, (ambientF - T_OIL_FLASH) / 15833)) {
      grid[i] = FIRE; meta[i] = (rand()*120+80)|0; colorVar[i] = (rand()*255)|0; processed[i] = 1; return;
    }
    if (y < H - 1) {
      const dn = idx(x, y + 1);
      if (isPassable(grid[dn])) { swapCells(i, dn); return; }
    }
    const d      = rand() < 0.5 ? 1 : -1;
    const spread = 2 + randInt(3);
    for (const dir of [d, -d]) {
      for (let s = 1; s <= spread; s++) {
        const nx = x + dir * s;
        if (!inBounds(nx, y)) break;
        const ni = idx(nx, y);
        if (grid[ni] === AIR) { swapCells(i, ni); return; }
        if (grid[ni] !== OIL) break;
      }
    }
    return;
  }

  // ── Fire ──────────────────────────────────────────────────────────────────
  if (mat === FIRE) {
    // Cold air kills fire faster; hot air makes it last longer
    const burnRate = ambientF < T_FREEZE ? 3 : ambientF < 100 ? 2 : 1;
    meta[i] -= burnRate;

    if (meta[i] <= 0) {
      grid[i]     = rand() < 0.55 ? SMOKE : AIR;
      meta[i]     = (rand() * 50 + 20) | 0;
      colorVar[i] = (rand() * 255) | 0;
      processed[i] = 1;
      return;
    }

    // Water extinguishes — check all 4 neighbors
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (grid[ni] === WATER && rand() < 0.3) {
        grid[ni]     = SMOKE; meta[ni]     = (rand()*30+10)|0;
        grid[i]      = SMOKE; meta[i]      = (rand()*30+10)|0;
        processed[i] = 1; return;
      }
    }

    // Spread to burnable neighbors — faster in hot ambient
    const spreadChance = clamp(0.07 * (1 + ambientF / 5000), 0.04, 0.18);
    if (rand() < spreadChance) {
      const nx = x + randInt(3) - 1;
      const ny = y + randInt(3) - 1;
      if (inBounds(nx, ny)) {
        const ni = idx(nx, ny);
        if (isBurnable(grid[ni])) {
          grid[ni]     = FIRE;
          meta[ni]     = (rand() * 100 + 60) | 0;
          colorVar[ni] = (rand() * 255) | 0;
        }
      }
    }

    // Rise upward
    if (y > 0 && rand() < 0.5) {
      const up = idx(x, y - 1);
      if (isPassable(grid[up])) { swapCells(i, up); return; }
      const dx = rand() < 0.5 ? 1 : -1;
      if (inBounds(x + dx, y - 1)) {
        const ui = idx(x + dx, y - 1);
        if (isPassable(grid[ui])) { swapCells(i, ui); return; }
      }
    }
    return;
  }

  // ── Smoke ─────────────────────────────────────────────────────────────────
  if (mat === SMOKE) {
    meta[i]--;
    if (meta[i] <= 0) { grid[i] = AIR; processed[i] = 1; return; }
    if (y > 0) {
      const dx = rand() < 0.3 ? (rand() < 0.5 ? 1 : -1) : 0;
      const nx = x + dx;
      if (inBounds(nx, y - 1)) {
        const ui = idx(nx, y - 1);
        if (grid[ui] === AIR) { swapCells(i, ui); return; }
      }
      const up = idx(x, y - 1);
      if (grid[up] === AIR) { swapCells(i, up); return; }
    }
    return;
  }

  // ── Lava ──────────────────────────────────────────────────────────────────
  if (mat === LAVA) {
    // Ambient cooling — solidifies without water; scales to ~10% chance/frame at 0°F
    if (ambientF < T_LAVA_COOL && rand() < Math.min(0.10, (T_LAVA_COOL - ambientF) / 13000)) {
      grid[i] = STONE; colorVar[i] = (rand()*255)|0; meta[i] = 0; processed[i] = 1; return;
    }
    // At plasma temps lava itself can vaporise
    if (ambientF > 8000 && rand() < Math.min(0.08, (ambientF - 8000) / 25000)) {
      grid[i] = SMOKE; meta[i] = (rand()*80+40)|0; colorVar[i] = (rand()*255)|0; processed[i] = 1; return;
    }

    // React with all 4 cardinal neighbors
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const ni = idx(nx, ny);
      const nt = grid[ni];

      // Lava + water → stone + steam
      if (nt === WATER && rand() < 0.4) {
        grid[i]      = STONE; colorVar[i]  = (rand()*255)|0; meta[i]      = 0;
        grid[ni]     = SMOKE; meta[ni]     = (rand()*50+30)|0; colorVar[ni] = (rand()*255)|0;
        processed[i] = 1; return;
      }
      // Lava melts adjacent stone back into lava
      if (nt === STONE && rand() < 0.08) {
        grid[ni] = LAVA; colorVar[ni] = (rand()*255)|0; meta[ni] = 0;
      }
      // Lava ignites burnables (oil ignites very readily)
      if (isBurnable(nt) && rand() < (nt === OIL ? 0.15 : 0.05)) {
        grid[ni] = FIRE; meta[ni] = (rand()*100+60)|0; colorVar[ni] = (rand()*255)|0;
      }
    }

    // Flow speed scales with temperature — much more fluid at extreme heat
    const lavaFallProb = Math.min(0.90, 0.45 + ambientF / 22222);
    const lavaSideProb = Math.min(0.50, 0.12 + ambientF / 26316);

    if (y < H - 1 && rand() < lavaFallProb) {
      const dn = idx(x, y + 1);
      const bt = grid[dn];
      if (bt === AIR || bt === SMOKE || bt === WATER || bt === OIL || bt === SAND) {
        swapCells(i, dn); return;
      }
    }
    if (rand() < lavaSideProb) {
      const dx = rand() < 0.5 ? 1 : -1;
      const nx = x + dx;
      if (inBounds(nx, y)) {
        const ni = idx(nx, y);
        if (isPassable(grid[ni])) { swapCells(i, ni); return; }
      }
    }
    return;
  }

  // ── Acid ──────────────────────────────────────────────────────────────────
  if (mat === ACID) {
    // Dissolves faster at higher ambient temps
    const dissolveRate = clamp(0.06 * (1 + ambientF / 5000), 0.03, 0.14);
    if (rand() < dissolveRate) {
      const offsets = [[-1,0],[1,0],[0,-1],[0,1]];
      for (const [dx, dy] of offsets) {
        const nx = x + dx, ny = y + dy;
        if (!inBounds(nx, ny)) continue;
        const ni = idx(nx, ny);
        const nt = grid[ni];
        if (nt !== AIR && nt !== ACID && nt !== SMOKE) {
          grid[ni]     = SMOKE; meta[ni]     = (rand()*20+5)|0; colorVar[ni] = (rand()*255)|0;
          if (rand() < 0.2) { grid[i] = AIR; processed[i] = 1; return; }
          break;
        }
      }
    }
    // Acid is denser than water — sinks through it
    if (y < H - 1) {
      const dn = idx(x, y + 1);
      const bt = grid[dn];
      if (isPassable(bt) || bt === WATER) { swapCells(i, dn); return; }
    }
    const d      = rand() < 0.5 ? 1 : -1;
    const spread = 2 + randInt(3);
    for (const dir of [d, -d]) {
      for (let s = 1; s <= spread; s++) {
        const nx = x + dir * s;
        if (!inBounds(nx, y)) break;
        const ni = idx(nx, y);
        if (grid[ni] === AIR) { swapCells(i, ni); return; }
        if (grid[ni] !== ACID) break;
      }
    }
    return;
  }

  // ── Plant ─────────────────────────────────────────────────────────────────
  if (mat === PLANT) {
    // Auto-ignition — scales to ~50% chance/frame at 10,000°F
    if (ambientF > T_WOOD_BURN && rand() < Math.min(0.50, (ambientF - T_WOOD_BURN) / 19040)) {
      grid[i] = FIRE; meta[i] = (rand()*100+60)|0; colorVar[i] = (rand()*255)|0; processed[i] = 1; return;
    }
    // Falls straight down when unsupported
    if (y < H - 1) {
      const dn = idx(x, y + 1);
      const bt = grid[dn];
      if (bt === AIR || bt === SMOKE || bt === WATER) { swapCells(i, dn); return; }
    }
    // Grow slowly once settled (upward preference)
    if (rand() < 0.004) {
      const dx = randInt(3) - 1;
      const dy = rand() < 0.65 ? -1 : randInt(3) - 1;
      const nx = x + dx, ny = y + dy;
      if (inBounds(nx, ny)) {
        const ni = idx(nx, ny);
        if (grid[ni] === AIR || grid[ni] === WATER) setCel(nx, ny, PLANT);
      }
    }
    return;
  }

  // ── Stone ─────────────────────────────────────────────────────────────────
  if (mat === STONE) {
    // Melt at extreme temps — scales to ~70% chance/frame at 10,000°F
    if (ambientF > T_STONE_MELT) {
      const p = Math.min(0.70, (ambientF - T_STONE_MELT) / 11428);
      if (rand() < p) {
        const vaporise = ambientF > 7000 && rand() < (ambientF - 7000) / 10000;
        grid[i] = vaporise ? SMOKE : LAVA;
        meta[i] = vaporise ? (rand()*80+40)|0 : 0;
        colorVar[i] = (rand()*255)|0; processed[i] = 1; return;
      }
    }
    if (y < H - 1) {
      const dn = idx(x, y + 1);
      const bt = grid[dn];
      if (bt === AIR || bt === SMOKE || bt === WATER) { swapCells(i, dn); return; }
      const d = rand() < 0.5 ? 1 : -1;
      for (const dx of [d, -d]) {
        const nx = x + dx;
        if (!inBounds(nx, y + 1)) continue;
        const di = idx(nx, y + 1);
        const dt = grid[di];
        if (dt === AIR || dt === SMOKE || dt === WATER) { swapCells(i, di); return; }
      }
    }
    return;
  }

  // ── Ice ───────────────────────────────────────────────────────────────────
  if (mat === ICE) {
    // Fall like sand
    if (y < H - 1) {
      const dn = idx(x, y + 1);
      const bt = grid[dn];
      if (bt === AIR || bt === SMOKE || bt === WATER) { swapCells(i, dn); return; }
      const d = rand() < 0.5 ? 1 : -1;
      for (const dx of [d, -d]) {
        const nx = x + dx;
        if (!inBounds(nx, y + 1)) continue;
        const di = idx(nx, y + 1);
        const dt = grid[di];
        if (dt === AIR || dt === SMOKE || dt === WATER) { swapCells(i, di); return; }
      }
    }

    // Lava contact: near-instant vaporisation to steam
    // Fire contact: gradual melt to water
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const nt = grid[idx(nx, ny)];
      if (nt === LAVA && rand() < 0.85) {
        grid[i] = SMOKE; meta[i] = (rand()*60+40)|0; colorVar[i] = (rand()*255)|0;
        for (const [sx, sy] of [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0]]) {
          const snx = x+sx, sny = y+sy;
          if (!inBounds(snx,sny)) continue;
          const si = idx(snx,sny);
          if (grid[si] === AIR) { grid[si] = SMOKE; meta[si] = (rand()*40+20)|0; colorVar[si] = (rand()*255)|0; }
        }
        processed[i] = 1; return;
      }
      if (nt === FIRE && rand() < 0.06) {
        grid[i] = WATER; colorVar[i] = (rand()*255)|0; meta[i] = 0; processed[i] = 1; return;
      }
    }

    // Ambient melt — scales to ~95% chance/frame at 10,000°F
    if (ambientF > T_FREEZE && rand() < Math.min(0.95, (ambientF - T_FREEZE) / 10492)) {
      grid[i]     = ambientF > T_BOIL ? SMOKE : WATER;
      meta[i]     = grid[i] === SMOKE ? (rand()*60+30)|0 : 0;
      colorVar[i] = (rand()*255)|0; processed[i] = 1; return;
    }

    // Freeze adjacent water — faster at lower temps
    const freezeProb = ambientF < T_FREEZE
      ? clamp((T_FREEZE - ambientF) / 1067, 0, 0.03)
      : 0.0001;
    if (rand() < freezeProb) {
      for (const [dx, dy] of [[-1,0],[1,0],[0,1]]) {
        const nx = x+dx, ny = y+dy;
        if (!inBounds(nx,ny)) continue;
        if (grid[idx(nx,ny)] === WATER) { setCel(nx, ny, ICE); break; }
      }
    }
    return;
  }

  // ── Wood ──────────────────────────────────────────────────────────────────
  if (mat === WOOD) {
    // Auto-ignition — scales to ~50% chance/frame at 10,000°F
    if (ambientF > T_WOOD_BURN && rand() < Math.min(0.50, (ambientF - T_WOOD_BURN) / 19040)) {
      grid[i] = FIRE; meta[i] = (rand()*150+80)|0; colorVar[i] = (rand()*255)|0; processed[i] = 1; return;
    }
    // Falls straight down — rigid solid, doesn't slide diagonally
    if (y < H - 1) {
      const dn = idx(x, y + 1);
      const bt = grid[dn];
      if (bt === AIR || bt === SMOKE || bt === WATER) { swapCells(i, dn); return; }
    }
    return;
  }
}

// ─── Simulation step ──────────────────────────────────────────────────────────
function step() {
  processed.fill(0);
  const ltr = frame % 2 === 0;
  for (let y = H - 1; y >= 0; y--) {
    if (ltr) {
      for (let x = 0;     x < W;  x++) updateCell(x, y);
    } else {
      for (let x = W - 1; x >= 0; x--) updateCell(x, y);
    }
  }
  frame++;
}

// ─── Render ───────────────────────────────────────────────────────────────────
const BASE = [
  [0,   0,   0  ],  // AIR
  [200, 158,  80],  // SAND
  [25,  115, 255],  // WATER
  [255,  80,   0],  // FIRE
  [28,  130,  22],  // PLANT
  [115,  75,  40],  // WOOD
  [108, 108, 108],  // STONE
  [148, 112,  18],  // OIL
  [85,   85,  85],  // SMOKE
  [20,  220,  10],  // ACID
  [255,  80,   0],  // LAVA
  [155, 220, 255],  // ICE
];
const VAR = [0, 28, 0, 0, 22, 22, 18, 16, 0, 0, 0, 12];

function render() {
  const t = frame;
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    const mat = grid[i];
    const cv  = colorVar[i];
    const lf  = meta[i];
    let r = 0, g = 0, b = 0;

    if (mat === AIR) {
      // black
    } else if (mat === FIRE) {
      const heat    = Math.min(lf / 80, 1);
      const flicker = 0.75 + (cv / 255) * 0.25;
      r = 255;
      g = (heat * 200 + (1 - heat) * 20) * flicker | 0;
      b = heat > 0.75 ? ((heat - 0.75) / 0.25 * 120 * flicker) | 0 : 0;
    } else if (mat === LAVA) {
      const pulse = 0.82 + Math.sin(t * 0.08 + cv * 0.05) * 0.18;
      r = 255;
      g = (50 + cv * 0.28) * pulse | 0;
      b = (cv * 0.04) | 0;
    } else if (mat === WATER) {
      const shimmer = Math.sin(t * 0.15 + cv * 0.09) * 12;
      r = 18;
      g = 115 + ((cv / 255 - 0.5) * 18) | 0;
      b = Math.min(255, 230 + shimmer) | 0;
    } else if (mat === ACID) {
      const pulse = 0.75 + Math.sin(t * 0.12 + cv * 0.07) * 0.25;
      r = (cv / 255 * 25) | 0;
      g = (170 + cv / 255 * 85) * pulse | 0;
      b = (cv / 255 * 10) | 0;
    } else if (mat === SMOKE) {
      const fade = Math.max(0, Math.min(1, lf / 60));
      const v    = (70 * fade + (cv / 255 - 0.5) * 20) | 0;
      r = g = b = Math.max(0, v);
    } else {
      const bc = BASE[mat];
      const va = VAR[mat];
      const v  = (cv / 255 - 0.5) * va;
      r = Math.max(0, Math.min(255, bc[0] + v)) | 0;
      g = Math.max(0, Math.min(255, bc[1] + v)) | 0;
      b = Math.max(0, Math.min(255, bc[2] + v)) | 0;
    }

    pixels[p]     = r;
    pixels[p + 1] = g;
    pixels[p + 2] = b;
    pixels[p + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);
}

// ─── Canvas scaling ───────────────────────────────────────────────────────────
const viewport = document.getElementById('viewport');

function fitCanvas() {
  const vw    = viewport.clientWidth;
  const vh    = viewport.clientHeight;
  const scale = Math.min(vw / W, vh / H);
  canvas.style.width  = (W * scale) + 'px';
  canvas.style.height = (H * scale) + 'px';
}

fitCanvas();
window.addEventListener('resize', fitCanvas);

// ─── Mouse / Touch painting ───────────────────────────────────────────────────
let selectedMat = SAND;
let brushSize   = 4;
let painting    = false;
let lastGX      = -1;
let lastGY      = -1;

function toGrid(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width  * W) | 0,
    y: ((clientY - rect.top)  / rect.height * H) | 0,
  };
}

function paintAt(gx, gy) {
  const r   = brushSize;
  const r2  = r * r;
  const life = selectedMat === FIRE  ? ((rand() * 100 + 60) | 0)
             : selectedMat === SMOKE ? ((rand() * 50  + 20) | 0)
             : 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy > r2) continue;
      const px = gx + dx, py = gy + dy;
      if (!inBounds(px, py)) continue;
      setCel(px, py, selectedMat, life);
    }
  }
}

function paintLine(x0, y0, x1, y1) {
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    paintAt(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = err * 2;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 <  dx) { err += dx; y0 += sy; }
  }
}

function onPointerDown(clientX, clientY) {
  painting = true;
  const g = toGrid(clientX, clientY);
  lastGX = g.x; lastGY = g.y;
  paintAt(g.x, g.y);
}
function onPointerMove(clientX, clientY) {
  if (!painting) return;
  const g = toGrid(clientX, clientY);
  paintLine(lastGX, lastGY, g.x, g.y);
  lastGX = g.x; lastGY = g.y;
}
function onPointerUp() { painting = false; }

canvas.addEventListener('mousedown',  e => { e.preventDefault(); dismissHelp(); onPointerDown(e.clientX, e.clientY); });
canvas.addEventListener('mousemove',  e => onPointerMove(e.clientX, e.clientY));
window.addEventListener('mouseup',    () => onPointerUp());
canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('touchstart', e => { e.preventDefault(); dismissHelp(); onPointerDown(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
canvas.addEventListener('touchmove',  e => { e.preventDefault(); onPointerMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
window.addEventListener('touchend',   () => onPointerUp());

// ─── Help overlay ─────────────────────────────────────────────────────────────
let helpDismissed = false;

function dismissHelp() {
  if (helpDismissed) return;
  helpDismissed = true;
  const el = document.getElementById('help');
  el.style.pointerEvents = 'none'; // pass events to canvas immediately
  el.classList.add('fading');
  setTimeout(() => { el.style.display = 'none'; }, 480);
}

// Clicking the overlay only dismisses it — does not start painting
document.getElementById('help').addEventListener('mousedown', e => {
  e.preventDefault();
  e.stopPropagation();
  dismissHelp();
});

// ─── Keyboard ─────────────────────────────────────────────────────────────────
const KEY_MAP = {
  '0': AIR,  '1': SAND, '2': WATER, '3': FIRE,  '4': PLANT,
  '5': WOOD, '6': STONE,'7': OIL,   '8': SMOKE, '9': ACID,
  'q': LAVA, 'Q': LAVA, 'w': ICE,   'W': ICE,
};

window.addEventListener('keydown', e => {
  if (e.key in KEY_MAP)               { dismissHelp(); selectedMat = KEY_MAP[e.key]; updatePaletteUI(); }
  if (e.key === 'c' || e.key === 'C') { dismissHelp(); clearGrid(); }
  if (e.key === 'p' || e.key === 'P') { dismissHelp(); togglePause(); }
  if (e.key === '[') { brushSize = Math.max(1,  brushSize - 1); updateBrushUI(); }
  if (e.key === ']') { brushSize = Math.min(20, brushSize + 1); updateBrushUI(); }
});

// ─── Temperature UI ───────────────────────────────────────────────────────────
function tempDescriptor(f) {
  if (f <    0) return 'ARCTIC';
  if (f <   32) return 'BELOW FREEZING';
  if (f <  100) return 'COLD';
  if (f <  212) return 'NORMAL';
  if (f <  480) return 'HOT';
  if (f < 1300) return 'COMBUSTION';
  if (f < 3100) return 'EXTREME';
  if (f < 6000) return 'INFERNO';
  return 'PLASMA';
}

function tempColor(f) {
  if (f <   32) return '#66aaff';   // icy blue
  if (f <  212) return '#cccccc';   // neutral
  if (f <  480) return '#ffdd44';   // warm yellow
  if (f < 1300) return '#ff8800';   // orange
  if (f < 3100) return '#ff3300';   // red
  return '#ffffff';                  // white-hot / plasma
}

function updateTempDisplay() {
  const display = useCelsius
    ? Math.round((ambientF - 32) * 5 / 9) + '°C'
    : Math.round(ambientF) + '°F';
  const col = tempColor(ambientF);
  const valEl  = document.getElementById('tempVal');
  const descEl = document.getElementById('tempDesc');
  valEl.textContent  = display;
  valEl.style.color  = col;
  descEl.textContent = tempDescriptor(ambientF);
  descEl.style.color = col;
}

const sliderEl = document.getElementById('sTempSlider');

// Dragging — piecewise non-linear mapping
sliderEl.addEventListener('input', function () {
  ambientF = sliderToTemp(parseInt(this.value) / 10);
  updateTempDisplay();
});

// Scroll wheel over slider — fine-tune without moving the thumb far
// Normal: ±5°F   Shift: ±1°F
sliderEl.addEventListener('wheel', e => {
  e.preventDefault();
  const step = e.shiftKey ? 1 : 5;
  ambientF = Math.max(0, Math.min(10000, ambientF + (e.deltaY < 0 ? step : -step)));
  syncSlider();
  updateTempDisplay();
}, { passive: false });

// Arrow keys when slider is focused — override browser default step
sliderEl.addEventListener('keydown', e => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  const step  = e.shiftKey ? 10 : 1;
  const delta = e.key === 'ArrowRight' ? step : -step;
  ambientF = Math.max(0, Math.min(10000, ambientF + delta));
  syncSlider();
  updateTempDisplay();
});

document.getElementById('btnUnit').addEventListener('click', () => {
  useCelsius = !useCelsius;
  document.getElementById('btnUnit').textContent = useCelsius ? '°F' : '°C';
  updateTempDisplay();
});

// ─── Palette UI ───────────────────────────────────────────────────────────────
function updatePaletteUI() {
  document.querySelectorAll('.mat-btn').forEach((btn, i) => {
    btn.classList.toggle('selected', i === selectedMat);
  });
}

function updateBrushUI() {
  document.getElementById('sBrush').value       = brushSize;
  document.getElementById('vBrush').textContent = brushSize;
}

function clearGrid() {
  grid.fill(AIR); meta.fill(0);
}

function togglePause() {
  paused = !paused;
  document.getElementById('btnPause').textContent = paused ? 'resume (P)' : 'pause (P)';
}

const palette = document.getElementById('palette');
MAT_INFO.forEach((m, i) => {
  const btn = document.createElement('div');
  btn.className = 'mat-btn' + (i === SAND ? ' selected' : '');
  btn.innerHTML =
    `<div class="swatch" style="background:${m.color}"></div>` +
    `<span>${m.name}</span>`;
  btn.addEventListener('click', () => { selectedMat = i; updatePaletteUI(); });
  palette.appendChild(btn);
});

document.getElementById('sBrush').addEventListener('input', function () {
  brushSize = parseInt(this.value);
  document.getElementById('vBrush').textContent = brushSize;
});
document.getElementById('btnClear').addEventListener('click', clearGrid);
document.getElementById('btnPause').addEventListener('click', togglePause);

// ─── FPS ──────────────────────────────────────────────────────────────────────
let lastT  = 0;
let fcount = 0;
const fpsEl = document.getElementById('fps');

function tickFPS(now) {
  fcount++;
  if (now - lastT >= 1000) {
    fpsEl.textContent = `fps: ${fcount}`;
    fcount = 0; lastT = now;
  }
}

// ─── Main loop ────────────────────────────────────────────────────────────────
function loop(now) {
  tickFPS(now);
  if (!paused) { step(); render(); }
  requestAnimationFrame(loop);
}

updateTempDisplay();
syncSlider();
requestAnimationFrame(loop);
