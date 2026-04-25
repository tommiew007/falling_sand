# Falling Sand — Design & Physics Notes

## Architecture

The simulation runs on a fixed 400×225 cell grid, scaled via CSS to fill the browser window. Each animation frame:

1. **Step** — update every cell once (bottom-to-top scan, alternating left/right each frame to eliminate directional bias)
2. **Render** — write the grid to a `ImageData` pixel buffer and call `putImageData`

Three typed arrays hold all state:

| Array | Type | Purpose |
|-------|------|---------|
| `grid` | `Uint8Array` | Material ID per cell |
| `colorVar` | `Uint8Array` | Per-cell random color offset (assigned once, persists through movement) |
| `meta` | `Uint16Array` | Fire/smoke lifetime, misc per-material data |

A fourth `processed` array (`Uint8Array`) is zeroed each frame and set to `1` when a cell moves, preventing any cell from being updated twice in one frame.

---

## Physics Model

### Density ordering

Materials are implicitly ranked by density, which determines what can displace what:

```
Air < Smoke < Oil < Water < Sand = Stone = Ice < Lava
```

- Heavier materials fall through lighter ones
- Liquids flow sideways when blocked below
- Solids pile up at their natural angle of repose

### Per-material rules

**Sand**
Falls straight down. If blocked, tries both diagonal-down cells (random order). Sinks through water and oil. Piles at ~45° angle of repose from the diagonal-only slide logic.

**Water**
Falls if below is air, smoke, or oil (water is denser than oil — they separate by buoyancy). Spreads sideways up to 4–7 cells, stopping at the first non-water/non-air obstacle. Does not spread through oil sideways.

**Oil**
Falls through air and smoke only — does not sink through water, so it naturally floats. Spreads sideways more slowly than water (2–4 cells). Catches fire very readily from fire or lava contact.

**Fire**
Has a random lifetime (60–160 frames). Each frame:
- Checks all 4 cardinal neighbors for water — 30% chance per adjacent water cell to be extinguished into smoke
- 7% chance to attempt spreading to a random adjacent burnable cell (wood, plant, oil)
- 50% chance to rise upward into air or smoke
- When lifetime expires, becomes smoke (55%) or air (45%)

**Smoke**
Has a random lifetime (20–70 frames). Rises upward, with a 30% chance of sideways drift each frame. Fades visually as lifetime decreases. Becomes air at zero lifetime.

**Lava**
Each frame checks all 4 cardinal neighbors:
- **Water** (40% chance): lava solidifies to stone, water vaporises to steam
- **Stone** (8% chance): stone melts back into lava
- **Oil** (15% chance): oil ignites to fire
- **Wood/Plant** (5% chance): ignites to fire

Falls straight down with 45% probability per frame (thick, slow). Spreads sideways at 12% probability. This gives lava its characteristic sluggish flow.

**Acid**
Sinks through water (acid is ~1.8× denser). Each frame, 6% chance to dissolve one adjacent non-acid cell into smoke, with 20% chance the dissolving reaction consumes the acid cell too. Flows sideways like a slow liquid.

**Ice**
Falls and slides like sand. Each frame checks all 4 neighbors:
- Adjacent to **lava** (85% chance): flash-vaporises into steam, scatters steam puffs to nearby cells
- Adjacent to **fire** (6% chance): melts gradually into water

Slowly freezes adjacent water cells (0.1% per frame) to create spreading ice sheets.

**Stone**
Falls and piles like sand. Produced by lava cooling against water. Melted back to lava by sustained lava contact.

**Plant**
Static. 0.4% chance per frame of growing one cell (upward preference, can also grow sideways). Grows into air or water. Burns when fire spreads to it.

**Wood**
Fully static. Burns when fire or lava spreads to it.

---

## Rendering

Each cell is one canvas pixel, scaled up via CSS (`image-rendering: pixelated`). The render loop writes directly into a `Uint8ClampedArray` (ImageData) for maximum throughput — no per-cell canvas draw calls.

Color is computed per material:

- **Static materials** (sand, wood, stone, plant, ice): base RGB + per-cell random offset from `colorVar`, giving a natural grainy texture
- **Fire**: RGB interpolated by remaining lifetime — hot white-blue core fades to orange-red as fuel runs out
- **Lava**: pulsing brightness driven by `sin(frame + colorVar)` — gives the molten glow effect
- **Water**: blue channel shimmer via `sin(frame + colorVar)`
- **Acid**: green channel pulse
- **Smoke**: brightness proportional to remaining lifetime (fades to black before disappearing)

---

## Known Simplifications

- No thermal diffusion — heat doesn't spread through materials, only through direct cell contact
- No pressure simulation — water doesn't seek equal levels through connected vessels (it spreads laterally but has no concept of communicating vessels)
- Plant has no root requirement — it can grow floating in mid-air
- Acid doesn't differentiate between materials (dissolves everything at the same rate)
- No fluid viscosity beyond the lava movement probability tweak
