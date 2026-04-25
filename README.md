# Falling Sand Simulation

A browser-based particle physics sandbox with 16 interactive materials, wind, temperature, gravity, and explosive chain reactions — built with vanilla JavaScript and Canvas.

**Created by Tom Wellborn · 2026**

**Live demo:** https://tommiew007.github.io/falling_sand/

> **Requires a larger screen in landscape orientation.** Phones are not supported — the app will display a warning and block interaction on small or portrait-mode screens (minimum 768px wide, width must exceed height).

![Falling Sand](https://img.shields.io/badge/built%20with-vanilla%20JS-yellow) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## Materials

| Key | Material | Behavior |
|-----|----------|----------|
| `1` | Acid | Sinks through water, dissolves most materials, evaporates above 639°F |
| `2` | Electricity | Arcs through air, water, and acid; branches; ignites oil and wood on contact |
| `3` | Fire | Rises, spreads to burnables, produces smoke, intensity affected by wind |
| `4` | Glass | Falls and piles, acid-resistant, melts to lava above 5,000°F — formed when sand melts |
| `5` | Gunpowder | Falls like sand, detonates on contact with fire or lava — chain explosions |
| `6` | Ice | Falls, melts near fire or lava, slowly freezes adjacent water |
| `7` | Iron | Falls and piles, conducts electricity, melts to lava above 2,800°F, acid-resistant |
| `8` | Lava | Flows at its own heat regardless of ambient temp, solidifies in cold environments |
| `9` | Oil | Floats on water, ignites easily from fire, lava, or electricity |
| `Q` | Plant | Grows slowly upward, burns, falls when unsupported |
| `W` | Sand | Falls and piles, sinks through water and oil, melts at extreme temps |
| `E` | Smoke | Rises and drifts, bends strongly in wind, persists when enclosed |
| `R` | Stone | Falls and piles, melts into lava above 2,000°F |
| `T` | Water | Flows and spreads, sinks through oil, extinguishes fire, freezes below 32°F |
| `Y` | Wood | Falls straight down, burns, does not slide diagonally |
| `0` | Erase | Remove cells |

---

## Controls

| Input | Action |
|-------|--------|
| **Click / drag** | Paint selected material |
| **`[` / `]`** | Decrease / increase brush size |
| **`Space` / `P`** | Pause / resume |
| **`C`** | Clear the canvas |
| **`H`** | Show / hide the help screen |
| **`Ctrl+S`** | Save canvas to `.sand` file |
| **`Ctrl+O`** | Load `.sand` file |

Larger brush sizes paint coarser chunks for solid materials (sand, stone, wood, ice, plant, lava, gunpowder). Fluids and gases always paint at single-cell resolution.

Hover any material on the canvas for a live **info card** showing its chemical formula, current state, active reactions, and science facts.

---

## Environment Controls (bottom bar)

**Brush** — size 1–20.

**Wind** — bidirectional slider (← calm →). Bends smoke strongly, fire moderately, and erodes resting sand piles. Heavier materials unaffected.

**Gravity** — 0 = weightless (nothing falls; wind is the only force), 5 = Earth normal, 10 = crushing. At extreme gravity, stone fractures to sand, ice melts to water, glass shatters, and wood splinters.

**Speed** — ¼× · ½× · 1× · 2× · 4×. Scales simulation rate; rendering stays smooth.

**Temperature** — world thermostat from 0°F to 5,000°F. Controls the ambient environment, not the material you're holding. Lava always flows hot; ice is always cold when placed. The world temperature determines how fast they change.

| Threshold | Effect |
|-----------|--------|
| Below 32°F | Water freezes, lava solidifies quickly |
| Above 212°F | Water evaporates to steam |
| Above 480°F | Wood and oil spontaneously combust |
| Above 2,000°F | Stone melts back into lava |
| Above 3,100°F | Sand melts into glass |
| Above 5,000°F | Glass melts into lava |
| **INFERNO** | Instantly sets 10,000°F — most materials vaporise. Disables slider until toggled off. |

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
| Acid above 639°F | Evaporates to smoke |
| Ice + adjacent Water | Slowly freezes water outward |
| Gunpowder + Fire / Lava | Chain detonation — blasts debris outward |
| Electricity + Water / Acid | Arc conducts through the liquid |
| Electricity + Iron | Conducts through without damaging iron |
| Electricity + Gunpowder | Instant detonation |
| Electricity + Oil | Ignites |
| Electricity + Ice | Cracks to water |
| Iron above 2,800°F | Melts into lava |
| Acid + Iron | Very slow corrosion (5% of normal dissolve rate) |
| Sand above 3,100°F | Melts into glass |
| Lava + Glass | Glass re-liquefies to lava — lava exceeds glass softening point |
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
- Hit INFERNO and watch everything vaporise
- Enclose smoke in a wood box — it stays until you open a gap
- Set gravity to 0, drop sand, then add wind — particles drift like dust in space

---

## Architecture

See [falling_sand.md](falling_sand.md) for full physics and rendering notes.

**Grid:** 400×225 cells, scaled via CSS to fill the browser window.  
**State:** Three typed arrays — `Uint8Array` for material IDs and color variation, `Uint16Array` for lifetimes/metadata, `Int8Array` for per-cell horizontal velocity.  
**Render:** Direct `ImageData` pixel writes — no per-cell canvas draw calls.  
**Step:** Bottom-to-top scan, alternating left/right each frame to eliminate directional bias.  
**Explosions:** Queue-based chain processing, capped at 400 detonations per frame.  
**Lightning:** Bolt queue capped at 30 active bolts; branches capped at 3 levels per bolt.  
**Save/Load:** Binary `.sand` format (magic header + grid + color variation arrays). Uses File System Access API where available so the browser remembers the last folder.

---

## Run Locally

No build step — open `index.html` in any modern browser.

```bash
git clone https://github.com/tommiew007/falling_sand.git
cd falling_sand
open index.html
```
