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
const grid      = new Uint8Array(W * H);   // material type
const colorVar  = new Uint8Array(W * H);   // per-cell color noise (static)
const meta      = new Uint16Array(W * H);  // fire/smoke lifetime, etc.
const processed = new Uint8Array(W * H);   // updated this frame?

const imgData = ctx.createImageData(W, H);
const pixels  = imgData.data;

let frame   = 0;
let paused  = false;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const inBounds  = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
const idx       = (x, y) => y * W + x;
const rand      = ()     => Math.random();
const randInt   = n      => (Math.random() * n) | 0;

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
const isLiquid   = mat => mat === WATER || mat === OIL || mat === ACID;
const isPassable = mat => mat === AIR || mat === SMOKE;

// ─── Per-material update ──────────────────────────────────────────────────────
function updateCell(x, y) {
  const i   = idx(x, y);
  if (processed[i]) return;
  const mat = grid[i];
  if (mat === AIR) return;

  // ── Sand ──────────────────────────────────────────────────────────────────
  if (mat === SAND) {
    if (y < H - 1) {
      const dn = idx(x, y + 1);
      const bt = grid[dn];
      // Sand is denser than water and oil — sinks through both
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
    if (y < H - 1) {
      const dn = idx(x, y + 1);
      const bt = grid[dn];
      // Water is denser than oil — sinks through it (oil rises)
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
    meta[i]--;

    if (meta[i] <= 0) {
      grid[i]     = rand() < 0.55 ? SMOKE : AIR;
      meta[i]     = (rand() * 50 + 20) | 0;
      colorVar[i] = (rand() * 255) | 0;
      processed[i] = 1;
      return;
    }

    // Water extinguishes fire — check all 4 neighbors directly
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (grid[ni] === WATER && rand() < 0.3) {
        grid[ni]     = SMOKE;
        meta[ni]     = (rand() * 30 + 10) | 0;
        grid[i]      = SMOKE;
        meta[i]      = (rand() * 30 + 10) | 0;
        processed[i] = 1;
        return;
      }
    }

    // Spread to burnable neighbors
    if (rand() < 0.07) {
      const nx = x + randInt(3) - 1;
      const ny = y + randInt(3) - 1;
      if (inBounds(nx, ny)) {
        const ni = idx(nx, ny);
        const nt = grid[ni];
        if (isBurnable(nt)) {
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
      // try up-diag
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
    if (meta[i] <= 0) {
      grid[i] = AIR;
      processed[i] = 1;
      return;
    }
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
    // Check all 4 cardinal neighbors for water/ice/burnable reactions
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const ni = idx(nx, ny);
      const nt = grid[ni];

      // Lava + water → lava solidifies to stone, water vaporises
      if (nt === WATER && rand() < 0.4) {
        grid[i]      = STONE;
        colorVar[i]  = (rand() * 255) | 0;
        meta[i]      = 0;
        grid[ni]     = SMOKE;
        meta[ni]     = (rand() * 50 + 30) | 0;
        colorVar[ni] = (rand() * 255) | 0;
        processed[i] = 1;
        return;
      }

      // Lava ignites adjacent burnables (oil catches very readily)
      if (isBurnable(nt) && rand() < (nt === OIL ? 0.15 : 0.05)) {
        grid[ni]     = FIRE;
        meta[ni]     = (rand() * 100 + 60) | 0;
        colorVar[ni] = (rand() * 255) | 0;
      }

      // Lava melts adjacent stone back into lava (lava is liquid rock)
      if (nt === STONE && rand() < 0.08) {
        grid[ni]     = LAVA;
        colorVar[ni] = (rand() * 255) | 0;
        meta[ni]     = 0;
      }
    }

    // Fall slowly (thick liquid)
    if (y < H - 1 && rand() < 0.45) {
      const dn = idx(x, y + 1);
      const bt = grid[dn];
      if (bt === AIR || bt === SMOKE || bt === WATER || bt === OIL || bt === SAND) {
        swapCells(i, dn); return;
      }
    }
    // Slow sideways spread
    if (rand() < 0.12) {
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
    // Dissolve adjacent non-acid cells
    if (rand() < 0.06) {
      const offsets = [[-1,0],[1,0],[0,-1],[0,1]];
      for (const [dx, dy] of offsets) {
        const nx = x + dx, ny = y + dy;
        if (!inBounds(nx, ny)) continue;
        const ni = idx(nx, ny);
        const nt = grid[ni];
        if (nt !== AIR && nt !== ACID && nt !== SMOKE) {
          grid[ni]     = SMOKE;  // dissolve → puff of smoke
          meta[ni]     = (rand() * 20 + 5) | 0;
          colorVar[ni] = (rand() * 255) | 0;
          if (rand() < 0.2) {   // acid gets consumed
            grid[i]      = AIR;
            processed[i] = 1;
            return;
          }
          break;
        }
      }
    }
    // Fall — acid is denser than water, sinks through it
    if (y < H - 1) {
      const dn = idx(x, y + 1);
      const bt = grid[dn];
      if (isPassable(bt) || bt === WATER) { swapCells(i, dn); return; }
    }
    // Flow sideways
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
    if (rand() < 0.004) {
      // Grow toward light (upward preference)
      const dx = randInt(3) - 1;
      const dy = rand() < 0.65 ? -1 : randInt(3) - 1;
      const nx = x + dx, ny = y + dy;
      if (inBounds(nx, ny)) {
        const ni = idx(nx, ny);
        if (grid[ni] === AIR || grid[ni] === WATER) {
          setCel(nx, ny, PLANT);
        }
      }
    }
    return;
  }

  // ── Stone ─────────────────────────────────────────────────────────────────
  if (mat === STONE) {
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
    // Melt near heat sources — lava is near-instant, fire is gradual
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const nt = grid[idx(nx, ny)];
      if (nt === LAVA && rand() < 0.85) {
        // Lava flash-vaporises ice → steam burst
        grid[i]     = SMOKE;
        meta[i]     = (rand() * 60 + 40) | 0;
        colorVar[i] = (rand() * 255) | 0;
        processed[i] = 1;
        // Scatter extra steam puffs into nearby air cells
        for (const [sx, sy] of [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0]]) {
          const snx = x + sx, sny = y + sy;
          if (!inBounds(snx, sny)) continue;
          if (grid[idx(snx, sny)] === AIR) {
            grid[idx(snx, sny)]     = SMOKE;
            meta[idx(snx, sny)]     = (rand() * 40 + 20) | 0;
            colorVar[idx(snx, sny)] = (rand() * 255) | 0;
          }
        }
        return;
      }
      if (nt === FIRE && rand() < 0.06) {
        // Fire slowly melts ice → water
        grid[i]     = WATER;
        colorVar[i] = (rand() * 255) | 0;
        meta[i]     = 0;
        processed[i] = 1;
        return;
      }
    }
    // Slow freeze: water adjacent to ice may turn to ice
    if (rand() < 0.001) {
      for (const [dx, dy] of [[-1,0],[1,0],[0,1]]) {
        const nx = x + dx, ny = y + dy;
        if (!inBounds(nx, ny)) continue;
        const ni = idx(nx, ny);
        if (grid[ni] === WATER) {
          setCel(nx, ny, ICE);
          break;
        }
      }
    }
    return;
  }

  // WOOD: static — fire handles spreading to it
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
// Base colors per material [r, g, b]
const BASE = [
  [0,   0,   0  ],  // AIR
  [200, 158,  80],  // SAND
  [25,  115, 255],  // WATER  (overridden)
  [255,  80,   0],  // FIRE   (overridden)
  [28,  130,  22],  // PLANT
  [115,  75,  40],  // WOOD
  [108, 108, 108],  // STONE
  [148, 112,  18],  // OIL
  [85,   85,  85],  // SMOKE  (overridden)
  [20,  220,  10],  // ACID   (overridden)
  [255,  80,   0],  // LAVA   (overridden)
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
      // black — fall through
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
  const vw     = viewport.clientWidth;
  const vh     = viewport.clientHeight;
  const scale  = Math.min(vw / W, vh / H);
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
  const r    = brushSize;
  const r2   = r * r;
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
  // Bresenham to avoid gaps when dragging fast
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

canvas.addEventListener('mousedown',  e => { e.preventDefault(); onPointerDown(e.clientX, e.clientY); });
canvas.addEventListener('mousemove',  e => onPointerMove(e.clientX, e.clientY));
window.addEventListener('mouseup',    () => onPointerUp());
canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('touchstart', e => { e.preventDefault(); onPointerDown(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
canvas.addEventListener('touchmove',  e => { e.preventDefault(); onPointerMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
window.addEventListener('touchend',   () => onPointerUp());

// ─── Keyboard ─────────────────────────────────────────────────────────────────
const KEY_MAP = {
  '0': AIR, '1': SAND, '2': WATER, '3': FIRE,  '4': PLANT,
  '5': WOOD,'6': STONE,'7': OIL,   '8': SMOKE, '9': ACID,
  'q': LAVA, 'Q': LAVA, 'w': ICE, 'W': ICE,
};

window.addEventListener('keydown', e => {
  if (e.key in KEY_MAP) {
    selectedMat = KEY_MAP[e.key];
    updatePaletteUI();
  }
  if (e.key === 'c' || e.key === 'C') clearGrid();
  if (e.key === 'p' || e.key === 'P') togglePause();
  if (e.key === '[') { brushSize = Math.max(1, brushSize - 1);  updateBrushUI(); }
  if (e.key === ']') { brushSize = Math.min(20, brushSize + 1); updateBrushUI(); }
});

// ─── Palette UI ───────────────────────────────────────────────────────────────
function updatePaletteUI() {
  document.querySelectorAll('.mat-btn').forEach((btn, i) => {
    btn.classList.toggle('selected', i === selectedMat);
  });
}

function updateBrushUI() {
  document.getElementById('sBrush').value    = brushSize;
  document.getElementById('vBrush').textContent = brushSize;
}

function clearGrid() {
  grid.fill(AIR);
  meta.fill(0);
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
    `<span>${m.name}</span>` +
    `<small>${m.key}</small>`;
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
let lastT   = 0;
let fcount  = 0;
const fpsEl = document.getElementById('fps');

function tickFPS(now) {
  fcount++;
  if (now - lastT >= 1000) {
    fpsEl.textContent = `fps: ${fcount}`;
    fcount = 0;
    lastT  = now;
  }
}

// ─── Main loop ────────────────────────────────────────────────────────────────
function loop(now) {
  tickFPS(now);
  if (!paused) {
    step();
    render();
  }
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
