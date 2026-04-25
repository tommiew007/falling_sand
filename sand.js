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
const ICE       = 11;
const GUNPOWDER   = 12;
const ELECTRICITY = 13;
const GLASS       = 14;
const IRON        = 15;

// ─── Material display ─────────────────────────────────────────────────────────
const MAT_INFO = [
  { name: 'Erase',       color: '#1a1a1a', key: '0' },
  { name: 'Sand',        color: '#c8a050', key: 'W' },
  { name: 'Water',       color: '#1a6fff', key: 'T' },
  { name: 'Fire',        color: '#ff5500', key: '3' },
  { name: 'Plant',       color: '#22aa22', key: 'Q' },
  { name: 'Wood',        color: '#8b5e3c', key: 'Y' },
  { name: 'Stone',       color: '#888888', key: 'R' },
  { name: 'Oil',         color: '#a07810', key: '9' },
  { name: 'Smoke',       color: '#666666', key: 'E' },
  { name: 'Acid',        color: '#39ff14', key: '1' },
  { name: 'Lava',        color: '#ff6600', key: '8' },
  { name: 'Ice',         color: '#a0dfff', key: '6' },
  { name: 'Gunpowder',   color: '#28241e', key: '5' },
  { name: 'Electricity', color: '#c8eeff', key: '2' },
  { name: 'Glass',       color: '#b8e0f8', key: '4' },
  { name: 'Iron',        color: '#8899aa', key: '7' },
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
const velX      = new Int8Array(W * H);  // per-cell horizontal velocity -10…+10

const imgData = ctx.createImageData(W, H);
const pixels  = imgData.data;

let frame  = 0;
let paused = false;

// ─── Speed ────────────────────────────────────────────────────────────────────
const SPEED_STEPS  = [0.25, 0.5, 1, 2, 4];
const SPEED_LABELS = ['¼×', '½×', '1×', '2×', '4×'];
let speedMult  = 1;
let speedAccum = 0;

// ─── Wind ─────────────────────────────────────────────────────────────────────
// windX: -1 (full left) → 0 (calm) → +1 (full right)
let windX = 0;

// ─── Gravity ──────────────────────────────────────────────────────────────────
// 0 = off (nothing falls), 1 = normal, 2 = crushing
let gravityStr = 1.0;

// Returns true when gravity permits a downward move this frame.
// Below 1.0: probabilistic (floaty). At or above 1.0: always true.
function gravCheck() {
  if (gravityStr <= 0) return false;
  if (gravityStr >= 1) return true;
  return rand() < gravityStr;
}

// Count non-air cells directly above (x,y) up to depth 6 — used for crush.
function pressureAbove(x, y) {
  let p = 0;
  for (let py = y - 1; py >= Math.max(0, y - 6); py--) {
    const m = grid[idx(x, py)];
    if (m === AIR || m === SMOKE || m === FIRE) break;
    p++;
  }
  return p;
}

// ─── Ambient temperature ──────────────────────────────────────────────────────
// Stored internally in Fahrenheit. Slider range 0–5,000°F; Inferno button → 10,000°F.
let ambientF   = 70;
let useCelsius = false;
let infernoOn    = false;
let preInfernoF  = 70;  // temp saved before Inferno activates

// Piecewise linear curve: [sliderPct (0–100), tempF]
// Key thresholds each get proportional slider travel so precision is
// highest where it matters (low–mid temps).
const TEMP_CURVE = [
  [  0,     0],
  [ 15,    32],   // freeze
  [ 25,   212],   // boiling
  [ 35,   480],   // combustion / wood ignition
  [ 50,  1300],   // lava stays molten
  [ 65,  2000],   // stone melts
  [ 80,  3100],   // sand melts (silica)
  [100,  5000],   // glass melts to lava (slider max)
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
const T_ACID_BOIL  =  639;   // acid (H₂SO₄) boils to smoke
const T_OIL_FLASH  =  500;   // oil auto-ignites
const T_WOOD_BURN  =  480;   // wood / plant auto-ignites
const T_LAVA_COOL  = 1300;   // lava solidifies without water below this
const T_LAVA_INTRINSIC = 1800; // lava's own heat — used for flow/reactions regardless of ambient
const T_STONE_MELT = 2000;   // stone → lava
const T_IRON_MELT  = 2800;   // iron → lava
const T_SAND_MELT  = 3100;   // sand → glass (silica melting point)
const T_GLASS_MELT = 5000;   // glass → lava (above this ambient)

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
  t = velX[i];     velX[i]     = velX[j];     velX[j]     = t;
  processed[i] = 1;
  processed[j] = 1;
}

const isBurnable = mat => mat === WOOD || mat === PLANT || mat === OIL;
const isPassable = mat => mat === AIR || mat === SMOKE;

// ─── Explosion system ─────────────────────────────────────────────────────────
const explosionQueue = [];

function triggerExplosion(x, y) {
  explosionQueue.push({x, y});
}

function processExplosions() {
  if (explosionQueue.length === 0) return;
  const detonated = new Set();
  let limit = 400; // cap chain length to prevent frame drops

  while (explosionQueue.length > 0 && limit-- > 0) {
    const {x, y} = explosionQueue.shift();
    const key = y * W + x;
    if (detonated.has(key)) continue;
    detonated.add(key);

    const r  = 12;
    const r2 = r * r;
    const coreLim = r2 * 0.12;  // inner 35% radius — vaporised
    const midLim  = r2 * 0.42;  // mid 65% radius — fire cloud

    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const px = x + dx, py = y + dy;
        if (!inBounds(px, py)) continue;
        const pi  = idx(px, py);
        const mat = grid[pi];

        // Chain-detonate any gunpowder in blast radius
        if (mat === GUNPOWDER) {
          const gk = py * W + px;
          if (!detonated.has(gk)) explosionQueue.push({x: px, y: py});
        }

        if (d2 < coreLim) {
          // Core: vaporize
          grid[pi] = AIR; meta[pi] = 0; processed[pi] = 1;
        } else if (d2 < midLim) {
          // Mid: fire cloud
          if (mat !== AIR) {
            grid[pi] = FIRE; meta[pi] = (rand()*50+20)|0; colorVar[pi] = (rand()*255)|0; processed[pi] = 1;
          }
        } else {
          // Outer ring: scatter debris outward, remainder becomes smoke/fire
          if (mat !== AIR && mat !== SMOKE && mat !== FIRE) {
            if (rand() < 0.40) {
              const dist    = Math.sqrt(d2);
              const scatter = 2 + ((rand() * 5) | 0);
              const tx = (px + (dx / dist) * scatter + 0.5) | 0;
              const ty = (py + (dy / dist) * scatter + 0.5) | 0;
              if (inBounds(tx, ty) && grid[idx(tx, ty)] === AIR) {
                const ti = idx(tx, ty);
                grid[ti] = mat; colorVar[ti] = colorVar[pi]; meta[ti] = meta[pi];
                grid[pi] = AIR; processed[pi] = 1;
              } else {
                grid[pi] = FIRE; meta[pi] = (rand()*25+10)|0; colorVar[pi] = (rand()*255)|0; processed[pi] = 1;
              }
            } else if (rand() < 0.5) {
              grid[pi] = SMOKE; meta[pi] = (rand()*40+20)|0; colorVar[pi] = (rand()*255)|0; processed[pi] = 1;
            }
          }
        }
      }
    }
  }
}

// ─── Lightning bolt system ────────────────────────────────────────────────────
const activeBolts = [];
const BOLT_CAP    = 30;

function spawnBolt(x, y) {
  if (activeBolts.length >= BOLT_CAP) return;
  const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  const [dx, dy] = dirs[randInt(dirs.length)];
  activeBolts.push({x, y, dx, dy, len: 0, maxLen: 12 + (rand() * 14)|0, branches: 0});
}

function processLightning() {
  if (activeBolts.length === 0) return;
  const toAdd = [];

  for (let b = activeBolts.length - 1; b >= 0; b--) {
    const bolt  = activeBolts[b];
    const steps = 2 + ((rand() * 2)|0);
    let alive   = true;

    for (let s = 0; s < steps && alive; s++) {
      // Zigzag jitter
      if (rand() < 0.32) {
        if (bolt.dx !== 0) bolt.dy = rand() < 0.5 ? 1 : -1;
        else                bolt.dx = rand() < 0.5 ? 1 : -1;
      }

      const nx = bolt.x + bolt.dx, ny = bolt.y + bolt.dy;
      if (!inBounds(nx, ny)) { alive = false; break; }

      const ni  = idx(nx, ny);
      const mat = grid[ni];
      const conductive = mat === AIR || mat === WATER || mat === ACID ||
                         mat === SMOKE || mat === ELECTRICITY || mat === IRON;

      if (!conductive) {
        // React with whatever stopped the bolt
        if (mat === OIL) {
          grid[ni] = FIRE; meta[ni] = (rand()*80+40)|0; colorVar[ni] = (rand()*255)|0;
        } else if ((mat === WOOD || mat === PLANT) && rand() < 0.4) {
          grid[ni] = FIRE; meta[ni] = (rand()*120+60)|0; colorVar[ni] = (rand()*255)|0;
        } else if (mat === GUNPOWDER) {
          triggerExplosion(nx, ny);
        } else if (mat === ICE && rand() < 0.3) {
          grid[ni] = WATER; colorVar[ni] = (rand()*255)|0; meta[ni] = 0;
        }
        alive = false; break;
      }

      // Leave electricity trail — iron conducts without being consumed
      if (mat !== IRON) {
        grid[ni] = ELECTRICITY; meta[ni] = 4 + ((rand()*4)|0); colorVar[ni] = (rand()*255)|0; processed[ni] = 1;
      }
      bolt.x = nx; bolt.y = ny; bolt.len++;

      // Branch (perpendicular, capped)
      if (rand() < 0.18 && bolt.branches < 3 && toAdd.length < 8) {
        const branchMax = ((bolt.maxLen - bolt.len) * 0.6)|0;
        if (branchMax > 3) {
          const bdx = bolt.dy !== 0 ? (rand() < 0.5 ? 1 : -1) : bolt.dx;
          const bdy = bolt.dx !== 0 ? (rand() < 0.5 ? 1 : -1) : bolt.dy;
          toAdd.push({x: bolt.x, y: bolt.y, dx: bdx, dy: bdy, len: 0, maxLen: branchMax, branches: bolt.branches + 1});
          bolt.branches++;
        }
      }

      if (bolt.len >= bolt.maxLen) { alive = false; }
    }

    if (!alive) activeBolts.splice(b, 1);
  }

  for (const b of toAdd) {
    if (activeBolts.length < BOLT_CAP) activeBolts.push(b);
  }
}

// ─── Lateral velocity helper ─────────────────────────────────────────────────
// windSens: wind push probability at full gravity (0.10 for sand, 0 for heavy mats).
// At lower gravity an extra 0–0.25 boost is added so weightless objects respond well.
// Returns true and moves the cell if it successfully applied velocity or wind.
function applyVelocity(x, y, i, windSens) {
  // Wind push — stronger when gravity is low
  if (windX !== 0) {
    const boost = (1 - Math.min(gravityStr, 1)) * 0.25;
    if (rand() < Math.abs(windX) * (windSens + boost)) {
      const dir = Math.sign(windX);
      const nx  = x + dir;
      if (inBounds(nx, y) && isPassable(grid[idx(nx, y)])) {
        velX[i] = clamp(velX[i] + dir * 3, -10, 10); // accelerate toward wind
        swapCells(i, idx(nx, y)); return true;
      }
    }
  }
  // Inertia — carry stored velocity; gravity provides friction
  if (velX[i] !== 0) {
    if (gravityStr > 0 && rand() < gravityStr * 0.3) {
      velX[i] -= Math.sign(velX[i]); // friction decay
    }
    if (velX[i] !== 0 && rand() < Math.abs(velX[i]) / 10) {
      const dir = Math.sign(velX[i]);
      const nx  = x + dir;
      if (inBounds(nx, y) && isPassable(grid[idx(nx, y)])) {
        swapCells(i, idx(nx, y)); return true;
      }
      velX[i] = 0; // blocked — stop
    }
  }
  return false;
}

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
        // Above 7,000°F vaporises; above T_GLASS_MELT becomes lava; otherwise glass
        const vaporise = ambientF > 7000 && rand() < (ambientF - 7000) / 10000;
        grid[i] = vaporise ? SMOKE : (ambientF > T_GLASS_MELT ? LAVA : GLASS);
        meta[i] = vaporise ? (rand()*80+40)|0 : 0;
        colorVar[i] = (rand()*255)|0; processed[i] = 1; return;
      }
    }
    if (gravCheck() && y < H - 1) {
      const dn = idx(x, y + 1);
      const bt = grid[dn];
      if (bt === AIR || bt === SMOKE || bt === WATER || bt === OIL) { swapCells(i, dn); return; }
      // Diagonal: prefer wind direction when wind is active
      const wdir = windX !== 0 ? Math.sign(windX) : 0;
      const d = wdir !== 0 && rand() < 0.5 + Math.abs(windX) * 0.35 ? wdir : (rand() < 0.5 ? 1 : -1);
      for (const dx of [d, -d]) {
        const nx = x + dx;
        if (!inBounds(nx, y + 1)) continue;
        const di = idx(nx, y + 1);
        const dt = grid[di];
        if (dt === AIR || dt === SMOKE || dt === WATER || dt === OIL) { swapCells(i, di); return; }
      }
    }
    if (applyVelocity(x, y, i, 0.10)) return;
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
    if (gravCheck() && y < H - 1) {
      const dn = idx(x, y + 1);
      const bt = grid[dn];
      if (isPassable(bt) || bt === OIL) { swapCells(i, dn); return; }
    }
    if (gravityStr > 0) {
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
    }
    return;
  }

  // ── Oil ───────────────────────────────────────────────────────────────────
  if (mat === OIL) {
    // Auto-ignition above flash point — scales to ~60% chance/frame at 10,000°F
    if (ambientF > T_OIL_FLASH && rand() < Math.min(0.60, (ambientF - T_OIL_FLASH) / 15833)) {
      grid[i] = FIRE; meta[i] = (rand()*120+80)|0; colorVar[i] = (rand()*255)|0; processed[i] = 1; return;
    }
    if (gravCheck() && y < H - 1) {
      const dn = idx(x, y + 1);
      if (isPassable(grid[dn])) { swapCells(i, dn); return; }
    }
    if (gravityStr > 0) {
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
    }
    return;
  }

  // ── Fire ──────────────────────────────────────────────────────────────────
  if (mat === FIRE) {
    if (y === 0) { grid[i] = AIR; processed[i] = 1; return; } // exit top of frame

    // Suffocate — fire sealed by solid material on all 4 sides has no oxygen
    const enclosed = [[-1,0],[1,0],[0,-1],[0,1]].every(([dx, dy]) => {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) return true;
      const m = grid[idx(nx, ny)];
      return m !== AIR && m !== SMOKE && m !== FIRE;
    });
    if (enclosed) { grid[i] = AIR; processed[i] = 1; return; }

    // Cold air kills fire faster; hot air makes it last longer
    // Guard against Uint16 underflow (e.g. meta=1, burnRate=2 → wraps to 65535)
    const burnRate = ambientF < T_FREEZE ? 3 : ambientF < 100 ? 2 : 1;
    meta[i] = meta[i] > burnRate ? meta[i] - burnRate : 0;

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

    // Rise upward — wind biases the lateral lean
    if (gravityStr > 0 && y > 0 && rand() < 0.5) {
      const up = idx(x, y - 1);
      if (isPassable(grid[up])) { swapCells(i, up); return; }
      const wdir = windX !== 0 ? Math.sign(windX) : 0;
      const dx = wdir !== 0 && rand() < 0.5 + Math.abs(windX) * 0.45 ? wdir : (rand() < 0.5 ? 1 : -1);
      if (inBounds(x + dx, y - 1)) {
        const ui = idx(x + dx, y - 1);
        if (isPassable(grid[ui])) { swapCells(i, ui); return; }
      }
    }
    // Wind pushes fire laterally
    if (windX !== 0 && rand() < Math.abs(windX) * 0.35) {
      const wx = x + Math.sign(windX);
      if (inBounds(wx, y) && isPassable(grid[idx(wx, y)])) { swapCells(i, idx(wx, y)); return; }
    }
    return;
  }

  // ── Smoke ─────────────────────────────────────────────────────────────────
  if (mat === SMOKE) {
    if (y === 0) { grid[i] = AIR; processed[i] = 1; return; } // exit top of frame
    // Only age smoke when it has somewhere to escape — trapped smoke persists
    const hasEscape = (
      (y > 0     && (grid[idx(x, y-1)] === AIR || (x > 0     && grid[idx(x-1, y-1)] === AIR) || (x < W-1 && grid[idx(x+1, y-1)] === AIR))) ||
      (x > 0     && grid[idx(x-1, y)] === AIR) ||
      (x < W - 1 && grid[idx(x+1, y)] === AIR)
    );
    if (hasEscape) meta[i]--;
    if (meta[i] <= 0) { grid[i] = AIR; processed[i] = 1; return; }
    if (gravityStr > 0 && y > 0) {
      // Drift direction biased by wind; stronger wind = more consistent lean
      const wdir = windX !== 0 ? Math.sign(windX) : 0;
      const driftChance = 0.3 + Math.abs(windX) * 0.55;
      let dx = 0;
      if (rand() < driftChance) {
        dx = wdir !== 0 && rand() < 0.55 + Math.abs(windX) * 0.40 ? wdir : (rand() < 0.5 ? 1 : -1);
      }
      const nx = x + dx;
      if (inBounds(nx, y - 1)) {
        const ui = idx(nx, y - 1);
        if (grid[ui] === AIR) { swapCells(i, ui); return; }
      }
      const up = idx(x, y - 1);
      if (grid[up] === AIR) { swapCells(i, up); return; }
    }
    // Wind pushes smoke sideways even when it can't rise
    if (windX !== 0 && rand() < Math.abs(windX) * 0.5) {
      const wx = x + Math.sign(windX);
      if (inBounds(wx, y) && grid[idx(wx, y)] === AIR) { swapCells(i, idx(wx, y)); return; }
    }
    return;
  }

  // ── Lava ──────────────────────────────────────────────────────────────────
  if (mat === LAVA) {
    // Ambient cooling — solidifies without water; ~0.8% chance/frame at room temp → ~2s per cell
    if (ambientF < T_LAVA_COOL && rand() < Math.min(0.008, (T_LAVA_COOL - ambientF) / 100000)) {
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
    // Lava flows at its own heat; ambient only controls how fast it solidifies
    const lavaTemp     = Math.max(ambientF, T_LAVA_INTRINSIC);
    const lavaFallProb = Math.min(0.90, 0.45 + lavaTemp / 22222);
    // Side spread kept close to 12% at intrinsic heat; scales up at extreme temps
    const lavaSideProb = Math.min(0.45, 0.08 + lavaTemp / 50000);

    if (gravCheck() && y < H - 1 && rand() < lavaFallProb) {
      const dn = idx(x, y + 1);
      const bt = grid[dn];
      if (bt === AIR || bt === SMOKE || bt === WATER || bt === OIL || bt === SAND || bt === ACID) {
        swapCells(i, dn); return;
      }
      // Diagonal fall — gives lava an angle of repose instead of spreading flat
      const d = rand() < 0.5 ? 1 : -1;
      for (const ddx of [d, -d]) {
        const nx = x + ddx;
        if (!inBounds(nx, y + 1)) continue;
        const di = idx(nx, y + 1);
        if (isPassable(grid[di])) { swapCells(i, di); return; }
      }
    }
    if (gravityStr > 0 && rand() < lavaSideProb) {
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
    // Evaporates above boiling point (H₂SO₄ boils at 639°F)
    if (ambientF > T_ACID_BOIL && rand() < Math.min(0.90, (ambientF - T_ACID_BOIL) / 10390)) {
      grid[i] = SMOKE; meta[i] = (rand()*60+30)|0; colorVar[i] = (rand()*255)|0; processed[i] = 1; return;
    }
    // Lava contact: acid flash-vaporises (lava is ~1000°C — far above acid's boiling point)
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      if (grid[idx(nx, ny)] === LAVA && rand() < 0.6) {
        grid[i] = SMOKE; meta[i] = (rand()*40+20)|0; colorVar[i] = (rand()*255)|0; processed[i] = 1; return;
      }
    }
    // Dissolves faster at higher ambient temps
    const dissolveRate = clamp(0.06 * (1 + ambientF / 5000), 0.03, 0.14);
    if (rand() < dissolveRate) {
      const offsets = [[-1,0],[1,0],[0,-1],[0,1]];
      for (const [dx, dy] of offsets) {
        const nx = x + dx, ny = y + dy;
        if (!inBounds(nx, ny)) continue;
        const ni = idx(nx, ny);
        const nt = grid[ni];
        if (nt !== AIR && nt !== ACID && nt !== SMOKE && nt !== GLASS && nt !== IRON && nt !== LAVA) {
          grid[ni]     = SMOKE; meta[ni]     = (rand()*20+5)|0; colorVar[ni] = (rand()*255)|0;
          if (rand() < 0.2) { grid[i] = AIR; processed[i] = 1; return; }
          break;
        }
        // Iron dissolves very slowly — ~5% of normal rate
        if (nt === IRON && rand() < 0.003) {
          grid[ni]     = SMOKE; meta[ni]     = (rand()*20+5)|0; colorVar[ni] = (rand()*255)|0;
          if (rand() < 0.2) { grid[i] = AIR; processed[i] = 1; return; }
          break;
        }
      }
    }
    // Acid is denser than water — sinks through it
    if (gravCheck() && y < H - 1) {
      const dn = idx(x, y + 1);
      const bt = grid[dn];
      if (isPassable(bt) || bt === WATER) { swapCells(i, dn); return; }
    }
    if (gravityStr > 0) {
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
    if (gravCheck() && y < H - 1) {
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
    if (applyVelocity(x, y, i, 0)) return;
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
    if (gravCheck() && y < H - 1) {
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
    // Crushing gravity — stone crumbles to sand under pressure
    if (gravityStr >= 1.6 && !processed[i]) {
      const pressure = pressureAbove(x, y);
      if (pressure > 0 && rand() < (gravityStr - 1.6) * 0.005 + pressure * 0.0008) {
        grid[i] = SAND; colorVar[i] = (rand()*255)|0; processed[i] = 1; return;
      }
    }
    if (applyVelocity(x, y, i, 0)) return;
    return;
  }

  // ── Ice ───────────────────────────────────────────────────────────────────
  if (mat === ICE) {
    // Fall like sand
    if (gravCheck() && y < H - 1) {
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
    // Crushing gravity — ice cracks to water under heavy columns
    if (gravityStr >= 1.6 && !processed[i]) {
      const pressure = pressureAbove(x, y);
      if (pressure > 1 && rand() < (gravityStr - 1.6) * 0.006 + pressure * 0.001) {
        grid[i] = WATER; colorVar[i] = (rand()*255)|0; meta[i] = 0; processed[i] = 1; return;
      }
    }
    if (applyVelocity(x, y, i, 0)) return;
    return;
  }

  // ── Electricity ───────────────────────────────────────────────────────────
  if (mat === ELECTRICITY) {
    meta[i]--;
    if (meta[i] <= 0) { grid[i] = AIR; processed[i] = 1; return; }
    // Spread short-range through adjacent water and acid
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = x+dx, ny = y+dy;
      if (!inBounds(nx,ny)) continue;
      const ni = idx(nx,ny);
      const nb = grid[ni];
      if ((nb === WATER || nb === ACID) && rand() < 0.35) {
        grid[ni] = ELECTRICITY; meta[ni] = 3+((rand()*3)|0); colorVar[ni] = (rand()*255)|0;
      }
      if (nb === OIL && rand() < 0.25)              { grid[ni] = FIRE; meta[ni] = (rand()*60+30)|0; colorVar[ni] = (rand()*255)|0; }
      if ((nb === WOOD||nb===PLANT) && rand() < 0.1){ grid[ni] = FIRE; meta[ni] = (rand()*100+60)|0; colorVar[ni] = (rand()*255)|0; }
      if (nb === GUNPOWDER)                          { triggerExplosion(nx,ny); }
    }
    return;
  }

  // ── Gunpowder ─────────────────────────────────────────────────────────────
  if (mat === GUNPOWDER) {
    // Spontaneous ignition above wood-burn threshold
    if (ambientF > T_WOOD_BURN && rand() < 0.001) {
      grid[i] = FIRE; meta[i] = 15; colorVar[i] = (rand()*255)|0; processed[i] = 1;
      triggerExplosion(x, y); return;
    }
    // Ignite from adjacent fire or lava — instant detonation
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = x + dx, ny = y + dy;
      if (!inBounds(nx, ny)) continue;
      const nb = grid[idx(nx, ny)];
      if (nb === FIRE || nb === LAVA) {
        grid[i] = FIRE; meta[i] = 15; colorVar[i] = (rand()*255)|0; processed[i] = 1;
        triggerExplosion(x, y); return;
      }
    }
    // Gravity — falls and piles like sand, sinks through liquids
    if (gravCheck() && y < H - 1) {
      const dn = idx(x, y + 1);
      const bt = grid[dn];
      if (bt === AIR || bt === SMOKE || bt === WATER || bt === OIL) { swapCells(i, dn); return; }
      const dirs = rand() < 0.5 ? [-1, 1] : [1, -1];
      for (const ddx of dirs) {
        const nx = x + ddx;
        if (inBounds(nx, y + 1)) {
          const di = idx(nx, y + 1);
          const dt = grid[di];
          if (dt === AIR || dt === SMOKE || dt === WATER || dt === OIL) { swapCells(i, di); return; }
        }
      }
    }
    if (applyVelocity(x, y, i, 0)) return;
    return;
  }

  // ── Glass ─────────────────────────────────────────────────────────────────
  if (mat === GLASS) {
    // Melts back to lava at extreme temps
    if (ambientF > T_GLASS_MELT) {
      const p = Math.min(0.70, (ambientF - T_GLASS_MELT) / 7143);
      if (rand() < p) {
        grid[i] = LAVA; colorVar[i] = (rand()*255)|0; meta[i] = 0; processed[i] = 1; return;
      }
    }
    // Falls and piles like stone
    if (gravCheck() && y < H - 1) {
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
    // Crushing gravity — glass shatters under heavy columns
    if (gravityStr >= 1.6 && !processed[i]) {
      const pressure = pressureAbove(x, y);
      if (pressure > 1 && rand() < (gravityStr - 1.6) * 0.008 + pressure * 0.0012) {
        grid[i] = AIR; processed[i] = 1; return;
      }
    }
    if (applyVelocity(x, y, i, 0)) return;
    return;
  }

  // ── Iron ──────────────────────────────────────────────────────────────────
  if (mat === IRON) {
    // Melts at 2,800°F (iron melting point) → lava
    if (ambientF > T_IRON_MELT) {
      const p = Math.min(0.70, (ambientF - T_IRON_MELT) / 10286);
      if (rand() < p) {
        grid[i] = LAVA; colorVar[i] = (rand()*255)|0; meta[i] = 0; processed[i] = 1; return;
      }
    }
    // Falls and piles like stone — sinks through water and oil
    if (gravCheck() && y < H - 1) {
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
    if (applyVelocity(x, y, i, 0)) return;
    return;
  }

  // ── Wood ──────────────────────────────────────────────────────────────────
  if (mat === WOOD) {
    // Auto-ignition — scales to ~50% chance/frame at 10,000°F
    if (ambientF > T_WOOD_BURN && rand() < Math.min(0.50, (ambientF - T_WOOD_BURN) / 19040)) {
      grid[i] = FIRE; meta[i] = (rand()*150+80)|0; colorVar[i] = (rand()*255)|0; processed[i] = 1; return;
    }
    // Falls straight down — rigid solid, doesn't slide diagonally
    if (gravCheck() && y < H - 1) {
      const dn = idx(x, y + 1);
      const bt = grid[dn];
      if (bt === AIR || bt === SMOKE || bt === WATER) { swapCells(i, dn); return; }
    }
    // Crushing gravity — wood splinters to sand under heavy columns
    if (gravityStr >= 1.6 && !processed[i]) {
      const pressure = pressureAbove(x, y);
      if (pressure > 0 && rand() < (gravityStr - 1.6) * 0.007 + pressure * 0.001) {
        grid[i] = SAND; colorVar[i] = (rand()*255)|0; processed[i] = 1; return;
      }
    }
    if (applyVelocity(x, y, i, 0)) return;
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
  processExplosions();
  processLightning();
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
  [ 40,  35,  28],  // GUNPOWDER
  [  0,   0,   0],  // ELECTRICITY (handled above)
  [175, 215, 240],  // GLASS
  [136, 153, 170],  // IRON
];
const VAR = [0, 28, 0, 0, 22, 22, 18, 16, 0, 0, 0, 12, 10, 0, 30, 14];

function getBgRGB() {
  if (infernoOn) {
    const pulse = 0.5 + 0.5 * Math.sin(frame * 0.06);
    return [(160 + pulse * 60) | 0, (pulse * 55) | 0, 0];
  }
  const heat = Math.min(1, Math.max(0, ambientF / 5000));
  return [(heat * 42) | 0, 0, 0];
}

function render() {
  const t = frame;
  const [bgR, bgG, bgB] = getBgRGB();
  viewport.style.background = `rgb(${bgR},${bgG},${bgB})`;

  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    const mat = grid[i];
    const cv  = colorVar[i];
    const lf  = meta[i];
    let r = bgR, g = bgG, b = bgB;

    if (mat === AIR) {
      // background color already set as default
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
    } else if (mat === ELECTRICITY) {
      const intensity = 0.55 + (lf / 8) * 0.45;
      const flicker   = Math.sin(t * 1.8 + cv * 0.25) * 0.2;
      const v = clamp(intensity + flicker, 0.25, 1.0);
      r = (160 + cv * 0.37 * v) | 0;
      g = (210 * v)              | 0;
      b = 255;
    } else if (mat === GLASS) {
      const shimmer = Math.sin(t * 0.05 + cv * 0.13) * 12;
      r = Math.min(255, Math.max(0, 148 + (cv / 255) * 60 + shimmer)) | 0;
      g = Math.min(255, Math.max(0, 200 + (cv / 255) * 30 + shimmer * 0.6)) | 0;
      b = Math.min(255, Math.max(0, 230 + shimmer * 0.4)) | 0;
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

const CHUNKY_MATS = new Set([SAND, STONE, WOOD, ICE, PLANT, LAVA, GUNPOWDER, GLASS]);

function paintAt(gx, gy) {
  // Electricity spawns directional bolts rather than placing cells
  if (selectedMat === ELECTRICITY) {
    const count = 1 + ((rand() * 2)|0);
    for (let b = 0; b < count; b++) spawnBolt(gx + randInt(3) - 1, gy + randInt(3) - 1);
    return;
  }

  const r   = brushSize;
  const r2  = r * r;
  // Water placed below freezing becomes ice
  const mat = (selectedMat === WATER && ambientF < T_FREEZE) ? ICE : selectedMat;
  const life = mat === FIRE  ? ((rand() * 100 + 60) | 0)
             : mat === SMOKE ? ((rand() * 50  + 20) | 0)
             : 0;

  if (CHUNKY_MATS.has(mat) && brushSize >= 3) {
    // Chunk size scales with brush: brush 3-5→2, 6-9→3, 10-14→4, 15+→5
    const cs = Math.min(5, 1 + Math.floor(brushSize / 3));
    const half = cs / 2;
    for (let dy = -r; dy <= r; dy += cs) {
      for (let dx = -r; dx <= r; dx += cs) {
        // Test chunk center against brush circle
        const ccx = dx + half, ccy = dy + half;
        if (ccx * ccx + ccy * ccy > r2) continue;
        for (let ky = 0; ky < cs; ky++) {
          for (let kx = 0; kx < cs; kx++) {
            const px = gx + dx + kx, py = gy + dy + ky;
            if (!inBounds(px, py)) continue;
            setCel(px, py, mat, life);
          }
        }
      }
    }
  } else {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const px = gx + dx, py = gy + dy;
        if (!inBounds(px, py)) continue;
        setCel(px, py, selectedMat, life);
      }
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
canvas.addEventListener('mousemove',  e => { onPointerMove(e.clientX, e.clientY); if (!painting) _icShow(e.clientX, e.clientY); else _icHide(); });
canvas.addEventListener('mouseleave', _icDelay);
window.addEventListener('mouseup',    () => onPointerUp());
canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('touchstart', e => { e.preventDefault(); dismissHelp(); onPointerDown(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
canvas.addEventListener('touchmove',  e => { e.preventDefault(); onPointerMove(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
window.addEventListener('touchend',   () => onPointerUp());

// ─── Help overlay ─────────────────────────────────────────────────────────────
let helpDismissed = false;
const helpEl = document.getElementById('help');

function dismissHelp() {
  if (helpDismissed) return;
  helpDismissed = true;
  helpEl.style.pointerEvents = 'none';
  helpEl.classList.add('fading');
  setTimeout(() => { helpEl.style.display = 'none'; }, 480);
}

function showHelp() {
  if (!paused) togglePause();
  helpEl.style.display = 'flex';
  helpEl.style.opacity = '1';
  helpEl.classList.remove('fading');
  helpEl.style.pointerEvents = 'auto';
  helpDismissed = false;
}

// Overlay blocks clicks to canvas while visible; links still work
helpEl.addEventListener('mousedown', e => {
  if (e.target.closest('a')) return;
  e.preventDefault();
  e.stopPropagation();
});

// ─── Keyboard ─────────────────────────────────────────────────────────────────
const KEY_MAP = {
  '0': AIR,  '1': ACID,  '2': ELECTRICITY, '3': FIRE, '4': GLASS,
  '5': GUNPOWDER, '6': ICE, '7': IRON, '8': LAVA, '9': OIL,
  'q': PLANT, 'Q': PLANT, 'w': SAND,  'W': SAND,  'e': SMOKE, 'E': SMOKE,
  'r': STONE, 'R': STONE, 't': WATER, 'T': WATER,
  'y': WOOD,  'Y': WOOD,
};

window.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveGrid(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 'o') { e.preventDefault(); openLoad(); return; }
  if (e.key === ' ') {
    e.preventDefault();
    if (!helpDismissed) { dismissHelp(); if (paused) togglePause(); } else togglePause();
    return;
  }
  if (e.key === 'h' || e.key === 'H') {
    if (helpDismissed) showHelp(); else { dismissHelp(); if (paused) togglePause(); }
    return;
  }
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
  if (infernoOn) return;
  ambientF = Math.max(0, Math.min(5000, ambientF + (e.deltaY < 0 ? step : -step)));
  syncSlider();
  updateTempDisplay();
}, { passive: false });

// Arrow keys when slider is focused — override browser default step
sliderEl.addEventListener('keydown', e => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  e.preventDefault();
  const step  = e.shiftKey ? 10 : 1;
  const delta = e.key === 'ArrowRight' ? step : -step;
  if (infernoOn) return;
  ambientF = Math.max(0, Math.min(5000, ambientF + delta));
  syncSlider();
  updateTempDisplay();
});

document.getElementById('btnUnit').addEventListener('click', () => {
  useCelsius = !useCelsius;
  document.getElementById('btnUnit').textContent = useCelsius ? '°F' : '°C';
  updateTempDisplay();
});

document.getElementById('btnInferno').addEventListener('click', () => {
  infernoOn = !infernoOn;
  const btn = document.getElementById('btnInferno');
  btn.classList.toggle('on', infernoOn);
  sliderEl.disabled = infernoOn;
  if (infernoOn) {
    preInfernoF = ambientF;
    ambientF = 10000;
  } else {
    ambientF = preInfernoF;
    syncSlider();
  }
  updateTempDisplay();
});

// ─── Palette UI ───────────────────────────────────────────────────────────────
function updatePaletteUI() {
  document.querySelectorAll('.mat-btn').forEach((btn, i) => {
    btn.classList.toggle('selected', PALETTE_ORDER[i] === selectedMat);
  });
}

function updateBrushUI() {
  document.getElementById('sBrush').value       = brushSize;
  document.getElementById('vBrush').textContent = brushSize;
}

function clearGrid() {
  grid.fill(AIR); meta.fill(0); velX.fill(0);
}

function togglePause() {
  paused = !paused;
  document.getElementById('btnPause').textContent = paused ? 'resume (P)' : 'pause (P)';
  if (musicIdx !== -1) { if (paused) musicAudio.pause(); else musicAudio.play().catch(() => {}); }
}

// Palette display order — alphabetical, Erase pinned first
const PALETTE_ORDER = [AIR, ACID, ELECTRICITY, FIRE, GLASS, GUNPOWDER, ICE, IRON, LAVA, OIL, PLANT, SAND, SMOKE, STONE, WATER, WOOD];

const palette = document.getElementById('palette');
PALETTE_ORDER.forEach(matId => {
  const m   = MAT_INFO[matId];
  const btn = document.createElement('div');
  btn.className = 'mat-btn' + (matId === SAND ? ' selected' : '');
  btn.title = `${m.name}  [${m.key}]`;
  btn.innerHTML =
    `<div class="swatch" style="background:${m.color}"></div>` +
    `<span class="mat-name">${m.name}</span>` +
    `<span class="mat-key">${m.key}</span>`;
  btn.addEventListener('click', () => { selectedMat = matId; updatePaletteUI(); });
  palette.appendChild(btn);
});

document.getElementById('sBrush').addEventListener('input', function () {
  brushSize = parseInt(this.value);
  document.getElementById('vBrush').textContent = brushSize;
});

document.getElementById('sWind').addEventListener('input', function () {
  windX = parseInt(this.value) / 10;
  const pct = Math.abs(windX * 100) | 0;
  document.getElementById('vWind').textContent =
    windX === 0 ? 'calm' : (windX < 0 ? '← ' : '→ ') + pct + '%';
});

function gravDesc(v) {
  if (v <= 0)    return 'none';
  if (v <= 0.4)  return 'light';
  if (v <= 0.8)  return 'low';
  if (v <= 1.15) return 'normal';
  if (v <= 1.4)  return 'strong';
  if (v <= 1.8)  return 'heavy';
  return 'crushing';
}

document.getElementById('sGrav').addEventListener('input', function () {
  gravityStr = parseInt(this.value) / 5;
  document.getElementById('vGrav').textContent = gravDesc(gravityStr);
});
document.getElementById('sSpeed').addEventListener('input', function () {
  const idx = parseInt(this.value) - 1;
  speedMult  = SPEED_STEPS[idx];
  speedAccum = 0;
  document.getElementById('vSpeed').textContent = SPEED_LABELS[idx];
});

document.getElementById('btnClear').addEventListener('click', clearGrid);
document.getElementById('btnPause').addEventListener('click', togglePause);

// ─── Save / Load ──────────────────────────────────────────────────────────────
function _buildSaveBuf() {
  const size = W * H;
  // 8-byte header + grid + colorVar + 10-byte UI state block (version 2)
  const buf = new Uint8Array(8 + size * 2 + 10);
  buf[0] = 0x53; buf[1] = 0x41; buf[2] = 0x4E; buf[3] = 0x44; // "SAND"
  buf[4] = W >> 8; buf[5] = W & 0xFF;
  buf[6] = H >> 8; buf[7] = H & 0xFF;
  buf.set(grid,     8);
  buf.set(colorVar, 8 + size);
  const ui = 8 + size * 2;
  buf[ui + 0] = 2;                                           // version marker
  buf[ui + 1] = (Math.round(ambientF) >> 8) & 0xFF;         // ambientF high byte
  buf[ui + 2] =  Math.round(ambientF)       & 0xFF;         // ambientF low byte
  buf[ui + 3] = Math.round(windX * 10) + 10;                // wind −10..+10 → 0..20
  buf[ui + 4] = Math.round(gravityStr * 5);                 // grav slider 0..10
  buf[ui + 5] = Math.max(0, SPEED_STEPS.indexOf(speedMult)); // speed index 0..4
  buf[ui + 6] = brushSize;                                   // brush 1..20
  buf[ui + 7] = (infernoOn ? 1 : 0) | (useCelsius ? 2 : 0); // flags
  buf[ui + 8] = musicIdx + 1;                               // music −1..3 → 0..4
  buf[ui + 9] = selectedMat;                                // selected material 0..14
  return buf;
}

function _restoreFromBuf(buf) {
  if (buf.length < 8) return;
  if (buf[0] !== 0x53 || buf[1] !== 0x41 || buf[2] !== 0x4E || buf[3] !== 0x44) return;
  const fw = (buf[4] << 8) | buf[5], fh = (buf[6] << 8) | buf[7];
  if (fw !== W || fh !== H) { alert('Save was made at a different grid size and cannot be loaded.'); return; }
  const size = W * H;
  grid.set(buf.subarray(8, 8 + size));
  colorVar.set(buf.subarray(8 + size, 8 + size * 2));
  meta.fill(0); velX.fill(0); processed.fill(0);
  for (let i = 0; i < size; i++) {
    if (grid[i] === FIRE)        meta[i] = (rand() * 60 + 40) | 0;
    if (grid[i] === SMOKE)       meta[i] = (rand() * 40 + 20) | 0;
    if (grid[i] === ELECTRICITY) meta[i] = (rand() *  4 +  2) | 0;
  }
  // Restore UI state if v2 block is present
  const ui = 8 + size * 2;
  if (buf.length >= ui + 10 && buf[ui] === 2) {
    ambientF   = (buf[ui + 1] << 8) | buf[ui + 2];
    windX      = (buf[ui + 3] - 10) / 10;
    gravityStr = buf[ui + 4] / 5;
    const si   = Math.min(buf[ui + 5], SPEED_STEPS.length - 1);
    speedMult  = SPEED_STEPS[si]; speedAccum = 0;
    brushSize  = Math.max(1, Math.min(20, buf[ui + 6]));
    const flags = buf[ui + 7];
    infernoOn  = !!(flags & 1);
    useCelsius = !!(flags & 2);
    musicIdx   = buf[ui + 8] - 1;
    selectedMat = Math.min(buf[ui + 9], MAT_INFO.length - 1);

    // Sync all UI widgets to restored state
    infernoOn
      ? (document.getElementById('btnInferno').classList.add('on'), sliderEl.disabled = true)
      : (document.getElementById('btnInferno').classList.remove('on'), sliderEl.disabled = false, syncSlider());
    updateTempDisplay();
    document.getElementById('btnUnit').textContent = useCelsius ? '°F' : '°C';

    const windRaw = Math.round(windX * 10);
    document.getElementById('sWind').value = windRaw;
    document.getElementById('vWind').textContent = windX === 0 ? 'calm'
      : (windX < 0 ? '← ' : '→ ') + Math.abs(windRaw) + '%';

    document.getElementById('sGrav').value = buf[ui + 4];
    document.getElementById('vGrav').textContent = gravDesc(gravityStr);

    document.getElementById('sSpeed').value = si + 1;
    document.getElementById('vSpeed').textContent = SPEED_LABELS[si];

    updateBrushUI();
    _musicUpdate();
    updatePaletteUI();
  }
}

// Save — File System Access API shows a "Save As" dialog so the user picks
// the folder; the browser remembers it for the next open. Falls back to a
// direct download on browsers that don't support the API (Firefox, Safari).
async function saveGrid() {
  const buf = _buildSaveBuf();
  if (window.showSaveFilePicker) {
    try {
      const handle   = await window.showSaveFilePicker({
        suggestedName: 'falling_sand.sand',
        types: [{ description: 'Falling Sand save', accept: { 'application/octet-stream': ['.sand'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(buf);
      await writable.close();
    } catch (e) { if (e.name !== 'AbortError') console.error(e); }
  } else {
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/octet-stream' }));
    const a   = document.createElement('a');
    a.href = url; a.download = 'falling_sand.sand'; a.click();
    URL.revokeObjectURL(url);
  }
}

// Load — same API; the browser reopens the last-used folder automatically.
const _fileInput = document.createElement('input');
_fileInput.type = 'file'; _fileInput.accept = '.sand'; _fileInput.style.display = 'none';
document.body.appendChild(_fileInput);
_fileInput.addEventListener('change', async () => {
  if (_fileInput.files[0]) _restoreFromBuf(new Uint8Array(await _fileInput.files[0].arrayBuffer()));
  _fileInput.value = '';
});

async function openLoad() {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Falling Sand save', accept: { 'application/octet-stream': ['.sand'] } }],
        multiple: false,
      });
      _restoreFromBuf(new Uint8Array(await (await handle.getFile()).arrayBuffer()));
    } catch (e) { if (e.name !== 'AbortError') console.error(e); }
  } else {
    _fileInput.click();
  }
}

document.getElementById('btnSave').addEventListener('click', saveGrid);
document.getElementById('btnLoad').addEventListener('click', openLoad);

// ─── Music ────────────────────────────────────────────────────────────────────
const TRACKS = [
  { file: 'sound/509740__andrewkn__horizon.wav',                                              label: 'Horizon' },
  { file: 'sound/531506__andrewkn__ambient-meditation-in-eternity.wav',                      label: 'Eternity' },
  { file: 'sound/540908__kjartan_abel__altweibersommer-a-mellow-and-ambient-soundscape.wav', label: 'Altweibersommer' },
  { file: 'sound/825435__andrewkn__ambient-pad-ionosphere.wav',                              label: 'Ionosphere' },
];
let musicIdx = -1;
const musicAudio = new Audio();
musicAudio.loop = true;
musicAudio.volume = 0.5;

function _musicUpdate() {
  const btn = document.getElementById('btnMusic');
  if (musicIdx === -1) {
    btn.textContent = '♫ music';
    btn.classList.remove('on');
    musicAudio.pause();
    musicAudio.src = '';
  } else {
    const t = TRACKS[musicIdx];
    btn.textContent = '♫ ' + t.label;
    btn.classList.add('on');
    musicAudio.src = t.file;
    musicAudio.play().catch(() => {});
  }
}

document.getElementById('btnMusic').addEventListener('click', () => {
  musicIdx = musicIdx >= TRACKS.length - 1 ? -1 : musicIdx + 1;
  _musicUpdate();
});

// ─── Info card ────────────────────────────────────────────────────────────────
const _ic      = document.getElementById('info-card');
let   _icTimer = null;

// Title colour per material — brighter than swatch so it reads on dark card
const IC_COL = ['#333','#c8a050','#4a9eff','#ff6622','#33cc33','#aa7755',
                '#aaaaaa','#cc9922','#999999','#44ff22','#ff8833','#aaddff',
                '#bbaa88','#88ddff','#cce8ff','#99aabb'];

// Collect distinct non-air materials within a 5×5 neighbourhood
function _icNear(x, y) {
  const s = new Set();
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -2; dx <= 2; dx++) {
      if (!dx && !dy) continue;
      if (inBounds(x+dx,y+dy)) { const m=grid[idx(x+dx,y+dy)]; if(m!==AIR) s.add(m); }
    }
  return s;
}

// Build innerHTML for the card based on material + current world state
function _icBuild(mat, x, y) {
  const nr = _icNear(x, y);
  const T  = ambientF;
  const Ts = useCelsius ? `${Math.round((T-32)*5/9)}°C` : `${Math.round(T)}°F`;
  let formula='', state='', rx=[], fx=[];

  switch (mat) {
    case SAND:
      formula='Silicon dioxide · SiO₂';
      state = T>T_SAND_MELT ? `⚠ Melting to glass at ${Ts}` : 'Stable granular solid';
      if(nr.has(WATER)) rx.push(['Water','sinking through — SiO₂ denser (2.65 g/cm³)']);
      if(nr.has(LAVA))  rx.push(['Lava','heat exposure — vitrifying above 3,100°F']);
      if(nr.has(ACID))  rx.push(['Acid','dissolving silica bonds']);
      fx=['Most abundant compound on Earth\'s crust',
          'Melts to amorphous glass above 3,100°F (1,710°C)',
          'Geological grain size: 0.0625–2 mm by classification'];
      break;
    case WATER:
      formula='Dihydrogen monoxide · H₂O';
      state = T<T_FREEZE ? `⚠ Below freezing (${Ts}) — crystallizing`
            : T>T_BOIL   ? `⚠ Above boiling (${Ts}) — evaporating`
            : `Stable liquid at ${Ts}`;
      if(nr.has(FIRE))        rx.push(['Fire','quenching combustion']);
      if(nr.has(LAVA))        rx.push(['Lava','flash-cooling to stone + steam']);
      if(nr.has(ICE))         rx.push(['Ice','freezing outward from boundary']);
      if(nr.has(ELECTRICITY)) rx.push(['Electricity','conducting via ion transport']);
      if(nr.has(OIL))         rx.push(['Oil','oil floating above — immiscible, ~0.8 g/cm³']);
      fx=['Expands 9% on freezing — one of nature\'s rare anomalies',
          'Maximum density at 39.2°F (4°C) — why ice floats',
          'Surface tension 72.8 mN/m — highest of non-metallic liquids'];
      break;
    case FIRE:
      formula='Rapid exothermic oxidation (combustion)';
      state = T<T_FREEZE ? 'Burning in cold air — quenching faster' : 'Active combustion';
      if(nr.has(WATER))     rx.push(['Water','extinguishing — H₂O absorbs combustion heat']);
      if(nr.has(WOOD))      rx.push(['Wood','spreading — cellulose pyrolysis at 480°F']);
      if(nr.has(OIL))       rx.push(['Oil','igniting hydrocarbons']);
      if(nr.has(GUNPOWDER)) rx.push(['Gunpowder','⚠ Detonation chain starting']);
      if(nr.has(ICE))       rx.push(['Ice','melting — absorbing latent heat (334 J/g)']);
      fx=['Not a material — fire is a chemical reaction',
          'Colour = temperature: blue (hottest) → white → yellow → orange → red',
          'Typical wood flame: 1,100–1,500°F (600–800°C)'];
      break;
    case PLANT:
      formula='Cellulose (C₆H₁₀O₅)ₙ + chlorophyll';
      state = T>T_WOOD_BURN ? `⚠ World above ignition point (${Ts})` : 'Living biomass — growing slowly';
      if(nr.has(FIRE))  rx.push(['Fire','burning — rapid cellulose oxidation']);
      if(nr.has(LAVA))  rx.push(['Lava','igniting from radiant heat']);
      if(nr.has(WATER)) rx.push(['Water','hydrating — supports photosynthesis']);
      if(nr.has(ACID))  rx.push(['Acid','destroying cell walls']);
      fx=['Photosynthesis: 6CO₂ + 6H₂O + light → C₆H₁₂O₆ + 6O₂',
          'Cellulose is the most abundant organic polymer on Earth',
          'Ignition point ~480°F (249°C) — lower density than wood'];
      break;
    case WOOD:
      formula='Lignin + cellulose + hemicellulose';
      state = T>T_WOOD_BURN ? `⚠ Above kindling point (${Ts}) — auto-igniting` : 'Dry structural fibre';
      if(nr.has(FIRE))        rx.push(['Fire','burning — lignocellulose pyrolysis']);
      if(nr.has(LAVA))        rx.push(['Lava','igniting on direct heat contact']);
      if(nr.has(ELECTRICITY)) rx.push(['Electricity','arcing — potential ignition']);
      fx=['Kindling temperature: ~480°F (249°C)',
          'Density: 0.4–0.9 g/cm³ depending on species',
          '1 cord of wood ≈ 20 million BTUs of stored energy'];
      break;
    case STONE:
      formula='Silicate minerals · granite / basalt / rhyolite';
      state = T>T_STONE_MELT ? `⚠ Above melt point (${Ts}) — reverting to lava`
            : gravityStr>=1.6 ? '⚠ Under crushing gravity — stress fracturing'
            : 'Solid silicate rock';
      if(nr.has(LAVA))  rx.push(['Lava','remelting — absorbing magma heat']);
      if(nr.has(ACID))  rx.push(['Acid','dissolving silicate mineral bonds']);
      fx=['Melting point: 2,000–2,300°F (1,093–1,260°C) by composition',
          'Formed via: cooling magma, sedimentation, or metamorphism',
          'Density: 2.6–3.3 g/cm³ — always sinks in water'];
      break;
    case OIL:
      formula='Hydrocarbons · CₙH₂ₙ₊₂ (alkane series)';
      state = T>T_OIL_FLASH ? `⚠ Above flash point (${Ts}) — auto-igniting` : 'Stable — floating on water';
      if(nr.has(FIRE))        rx.push(['Fire','igniting — exothermic hydrocarbon combustion']);
      if(nr.has(LAVA))        rx.push(['Lava','igniting on radiant heat contact']);
      if(nr.has(ELECTRICITY)) rx.push(['Electricity','igniting on arc contact']);
      if(nr.has(WATER))       rx.push(['Water','floating above — immiscible, ~0.8 g/cm³']);
      fx=['Always floats on water — density ~0.8 vs 1.0 g/cm³',
          'Flash point varies: crude oil -40°F · diesel +126°F · motor oil +400°F',
          'Takes ~300–400 million years to form from organic sediment'];
      break;
    case SMOKE:
      formula='Aerosol · CO + CO₂ + H₂O vapour + soot';
      state = 'Rising — buoyancy from heat differential';
      if(nr.has(FIRE)) rx.push(['Fire','produced by — incomplete combustion byproduct']);
      fx=['Particle size: 0.01–10 µm — falls in the PM2.5 hazardous range',
          'Rises due to buoyancy — less dense than surrounding air',
          'Enclosed smoke persists — no escape path, no dissipation'];
      break;
    case ACID:
      formula='Strong corrosive acid · modelled as H₂SO₄';
      state = 'Dissolving contact materials each frame';
      if(nr.has(STONE)) rx.push(['Stone','dissolving silicate mineral bonds']);
      if(nr.has(WOOD))  rx.push(['Wood','hydrolyzing cellulose polymer chains']);
      if(nr.has(WATER)) rx.push(['Water','sinking — density 1.84 vs 1.0 g/cm³']);
      if(nr.has(ICE))   rx.push(['Ice','dissolving — exothermic acid-ice reaction']);
      if(nr.has(GLASS)) rx.push(['Glass','no reaction — SiO₂ resists all acids except HF']);
      fx=['Concentrated H₂SO₄: pH < 0, density 1.84 g/cm³',
          'Glass resists all common acids — only HF can dissolve SiO₂',
          'Self-consuming — each reaction depletes the acid cell'];
      break;
    case LAVA:
      formula='Molten basaltic rock · SiO₂ ~50%';
      state = T<T_LAVA_COOL ? `World below 1,300°F — ambient cooling`
            : `Flowing at intrinsic ~1,800°F minimum`;
      if(nr.has(WATER)) rx.push(['Water','quenching — instant stone + steam burst']);
      if(nr.has(ICE))   rx.push(['Ice','instant vaporization — ΔT ~2,000°F+']);
      if(nr.has(STONE)) rx.push(['Stone','remelting adjacent silicate rock']);
      if(nr.has(OIL))   rx.push(['Oil','igniting hydrocarbon on contact']);
      fx=['Basaltic lava: 1,300–2,200°F (700–1,200°C)',
          'Flow speed: 0.2–30 mph depending on viscosity and slope',
          'Emits SO₂, CO₂, HCl, and H₂O while degassing'];
      break;
    case ICE:
      formula='Crystalline H₂O · hexagonal phase Iₕ';
      state = T>T_BOIL   ? `⚠ Far above melt (${Ts}) — flashing to steam`
            : T>T_FREEZE ? `⚠ Above melt point (${Ts}) — thawing`
            : `Stable at ${Ts} — nucleating adjacent water`;
      if(nr.has(LAVA))        rx.push(['Lava','instant vaporization — extreme thermal shock']);
      if(nr.has(FIRE))        rx.push(['Fire','melting — absorbing latent heat (334 J/g)']);
      if(nr.has(WATER))       rx.push(['Water','slowly freezing outward via nucleation']);
      if(nr.has(ELECTRICITY)) rx.push(['Electricity','cracking crystal lattice on arc']);
      fx=['Density 0.917 g/cm³ — floats on water (rare property in nature)',
          'Latent heat 334 J/g — enormous energy required to melt',
          'Freezes outward via crystal nucleation from existing ice'];
      break;
    case GUNPOWDER:
      formula='KNO₃ 75% · Charcoal 15% · Sulfur 10%';
      state = T>T_WOOD_BURN ? `⚠ Above auto-ignition threshold (${Ts})`
            : 'Stable — awaiting ignition source';
      if(nr.has(FIRE))        rx.push(['Fire','⚠ Detonating — deflagration chain']);
      if(nr.has(LAVA))        rx.push(['Lava','⚠ Igniting from radiant heat']);
      if(nr.has(ELECTRICITY)) rx.push(['Electricity','⚠ Instant detonation on arc']);
      if(nr.has(WATER))       rx.push(['Water','desensitizing — wet powder won\'t fire']);
      fx=['Invented in Tang Dynasty China, ~9th century AD',
          'Burns at ~3,300°F — generates 1,000× its volume in gas instantly',
          'Deflagrates (fast subsonic burn), not detonates, unless confined'];
      break;
    case ELECTRICITY:
      formula='Arc discharge · directed electron flow';
      state = 'Transient — decaying each frame';
      if(nr.has(WATER))       rx.push(['Water','conducting — ion transport through H₂O']);
      if(nr.has(ACID))        rx.push(['Acid','conducting — high ion concentration']);
      if(nr.has(OIL))         rx.push(['Oil','igniting on arc contact']);
      if(nr.has(GUNPOWDER))   rx.push(['Gunpowder','⚠ Instant detonation']);
      if(nr.has(ICE))         rx.push(['Ice','cracking — arc shatters crystal lattice']);
      fx=['Lightning bolt: ~30,000°F — hotter than the sun\'s surface',
          'Travels at ~2/3 the speed of light through conductors',
          'Branching follows the path of least resistance (Lichtenberg pattern)'];
      break;
    case GLASS:
      formula='Amorphous silicon dioxide · SiO₂';
      state = T>T_GLASS_MELT ? `⚠ Above melt point (${Ts}) — reverting to lava`
            : gravityStr>=1.6 ? '⚠ Under crushing gravity — fracture risk'
            : 'Stable amorphous solid';
      if(nr.has(LAVA))  rx.push(['Lava','remelting — above 5,000°F threshold']);
      if(nr.has(ACID))  rx.push(['Acid','no reaction — SiO₂ resists all common acids']);
      if(nr.has(WATER)) rx.push(['Water','no reaction — chemically inert surface']);
      fx=['Formed when sand melts and cools without crystallising',
          'Amorphous — atoms lack long-range order (not technically a solid)',
          'Glass transition ~1,100°F (593°C) — softens before melting',
          'Only HF acid can dissolve SiO₂ — all others bounce off'];
      break;
    case IRON:
      formula='Iron · Fe';
      state = T>T_IRON_MELT ? `⚠ Above melt point (${Ts}) — liquefying to lava`
            : 'Dense solid metal — electrically conductive';
      if(nr.has(LAVA))        rx.push(['Lava','melting — iron liquefies above 2,800°F']);
      if(nr.has(ELECTRICITY)) rx.push(['Electricity','conducting — iron is a metallic conductor']);
      if(nr.has(ACID))        rx.push(['Acid','slow corrosion — Fe + H₂SO₄ → FeSO₄ + H₂']);
      fx=['Melting point 2,800°F (1,538°C) — most common metal on Earth by mass',
          'Density 7.87 g/cm³ — ~3× denser than stone, sinks through most materials',
          'Excellent conductor: resistivity 10 nΩ·m — lightning passes through intact',
          'Earth\'s core is primarily molten iron and nickel at ~9,000°F'];
      break;
  }

  const col  = IC_COL[mat];
  const name = MAT_INFO[mat].name.toUpperCase();
  let h = `<div class="ic-name" style="color:${col}">${name}</div>`;
  h += `<div class="ic-formula">${formula}</div>`;
  if (state) {
    const warn = state.startsWith('⚠') ? ' ic-warn' : '';
    h += `<div class="ic-state${warn}">${state}</div>`;
  }
  if (rx.length) {
    h += `<div class="ic-section">REACTING WITH</div>`;
    rx.slice(0, 3).forEach(([m, d]) => {
      h += `<div class="ic-react"><span class="ic-rm">${m}</span> — ${d}</div>`;
    });
  }
  if (fx.length) {
    h += `<div class="ic-section">SCIENCE</div>`;
    fx.slice(0, 4).forEach(f => { h += `<div class="ic-fact">${f}</div>`; });
  }
  return h;
}

function _icShow(cx, cy) {
  const g   = toGrid(cx, cy);
  const mat = grid[idx(g.x, g.y)];

  clearTimeout(_icTimer); _icTimer = null;

  if (mat === AIR || !helpDismissed) { _icHide(); return; }

  _ic.classList.remove('ic-on');
  _ic.innerHTML = _icBuild(mat, g.x, g.y);
  void _ic.offsetWidth; // flush reflow so transition fires cleanly

  // Position right+below cursor; flip if near window edge
  const CW = 270;
  let lx = cx + 16, ly = cy + 16;
  if (lx + CW > window.innerWidth  - 6) lx = cx - CW - 6;
  if (ly       > window.innerHeight - 310) ly = Math.max(6, cy - 320);
  _ic.style.left = Math.max(4, lx) + 'px';
  _ic.style.top  = Math.max(4, ly) + 'px';
  _ic.classList.add('ic-on');
}

function _icHide()  { _ic.classList.remove('ic-on'); }
function _icDelay() { if (!_icTimer) _icTimer = setTimeout(_icHide, 2000); }

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
  if (!paused) {
    speedAccum += speedMult;
    const steps = Math.min(Math.floor(speedAccum), 8); // cap at 8 steps/frame
    speedAccum -= steps;
    for (let s = 0; s < steps; s++) step();
    render(); // always render for smooth display even at sub-1× speeds
  }
  requestAnimationFrame(loop);
}

updateTempDisplay();
syncSlider();
requestAnimationFrame(loop);
