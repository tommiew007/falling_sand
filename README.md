# Falling Sand Simulation

A browser-based particle physics sandbox with 15 interactive materials, wind, temperature, and explosive chain reactions — built with vanilla JavaScript and Canvas.

**Live demo:** https://tommiew007.github.io/falling_sand/

![Falling Sand](https://img.shields.io/badge/built%20with-vanilla%20JS-yellow) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## Materials

| Key | Material | Behavior |
|-----|----------|----------|
| `1` | Sand | Falls and piles, sinks through water and oil, melts at extreme temps |
| `2` | Water | Flows and spreads, sinks through oil, extinguishes fire, freezes below 32°F |
| `3` | Fire | Rises, spreads to burnables, produces smoke, intensity affected by wind |
| `4` | Plant | Grows slowly upward, burns, falls when unsupported |
| `5` | Wood | Falls straight down, burns, does not slide diagonally |
| `6` | Stone | Falls and piles, melts into lava above 2,000°F |
| `7` | Oil | Floats on water, ignites easily from fire, lava, or electricity |
| `8` | Smoke | Rises and drifts, bends strongly in wind, persists when enclosed |
| `9` | Acid | Sinks through water, dissolves most materials |
| `Q` | Lava | Flows at its own heat regardless of ambient temp, solidifies in cold environments |
| `W` | Ice | Falls, melts near fire or lava, slowly freezes adjacent water |
| `E` | Gunpowder | Falls like sand, detonates on contact with fire or lava — chain explosions |
| `R` | Electricity | Arcs through air, water, and acid; branches; ignites oil and wood on contact |
| `T` | Glass | Falls and piles, acid-resistant, melts to lava above 5,000°F — formed when sand melts |
| `0` | Erase | Remove cells |

---

## Controls

| Input | Action |
|-------|--------|
| **Click / drag** | Paint selected material |
| **`[` / `]`** | Decrease / increase brush size |
| **`C`** | Clear the canvas |
| **`P`** | Pause / resume |

Larger brush sizes paint coarser chunks for solid materials (sand, stone, wood, ice, plant, lava, gunpowder). Fluids and gases always paint at single-cell resolution.

---

## Environment Controls (bottom bar)

**Brush** — size 1–20. Solid materials scale from fine grains to large chunks.

**Wind** — bidirectional slider (← calm →). Bends smoke strongly, fire moderately, and erodes resting sand piles. Heavier materials unaffected.

**Temperature** — world thermostat from 0°F to 10,000°F. Controls the ambient environment, not the material you're holding. Lava always flows hot; ice is always cold when placed. The world temperature determines how fast they change.

| Threshold | Effect |
|-----------|--------|
| Below 32°F | Water freezes, lava solidifies quickly |
| Above 212°F | Water evaporates to steam |
| Above 480°F | Wood and oil spontaneously combust |
| Above 2,000°F | Stone melts back into lava |
| Above 3,100°F | Sand melts into glass |
| Above 5,000°F | Glass melts into lava |
| Above 10,000°F | Plasma — most materials vaporise |

Toggle **°F / °C** at any time. Scroll the temperature slider for fine ±5°F adjustment; Shift+scroll for ±1°F.

---

## Interactions

| Combination | Result |
|-------------|--------|
| Water + Fire | Steam + extinguished fire |
| Lava + Water | Stone + steam |
| Lava + Stone | Melts stone back into lava |
| Lava + Ice | Instant vaporisation + steam burst |
| Fire + Ice | Gradual melt into water |
| Oil + Fire / Lava / Electricity | Ignites rapidly |
| Acid + anything | Dissolves it (acid slowly self-consumes) |
| Ice + adjacent Water | Slowly freezes water outward |
| Gunpowder + Fire / Lava | Chain detonation — blasts debris outward |
| Electricity + Water / Acid | Arc conducts through the liquid |
| Electricity + Gunpowder | Instant detonation |
| Electricity + Oil | Ignites |
| Electricity + Ice | Cracks to water |
| Sand above 3,100°F | Melts into glass |
| Glass above 5,000°F | Melts into lava |
| Acid + Glass | No reaction — glass is acid-resistant |
| Water below 32°F (painted) | Automatically placed as ice chunks |

---

## Things to Try

- Pour water over oil and watch it sink beneath  
- Drop lava into a water pool — stone and steam  
- Build a gunpowder trail, light the far end with fire  
- Fill a water channel, strike one end with electricity — arc travels the length  
- Crank wind to max, then place fire and smoke  
- Slide temperature to plasma and watch everything vaporise  
- Enclose smoke in a wood box — it stays until you open a gap  
- Stack gunpowder deep, detonate at the base — chain explosion cascades upward  

---

## Architecture

See [falling_sand.md](falling_sand.md) for full physics and rendering notes.

**Grid:** 400×225 cells, scaled via CSS to fill the browser window.  
**State:** Three typed arrays — `Uint8Array` for material IDs and color variation, `Uint16Array` for lifetimes/metadata.  
**Render:** Direct `ImageData` pixel writes — no per-cell canvas draw calls.  
**Step:** Bottom-to-top scan, alternating left/right each frame to eliminate directional bias.  
**Explosions:** Queue-based chain processing, capped at 400 detonations per frame.  
**Lightning:** Bolt queue capped at 30 active bolts; branches capped at 3 levels per bolt.

---

## Run Locally

No build step — open `index.html` in any modern browser.

```bash
git clone https://github.com/tommiew007/falling_sand.git
cd falling_sand
open index.html
```
