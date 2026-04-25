# Falling Sand Simulation

A browser-based particle physics sandbox with 11 interactive materials, built with vanilla JavaScript and Canvas.

**Live demo:** https://tommiew007.github.io/falling_sand/

![Falling Sand](https://img.shields.io/badge/built%20with-vanilla%20JS-yellow) ![License](https://img.shields.io/badge/license-MIT-blue)

## Materials

| Key | Material | Behavior |
|-----|----------|----------|
| `1` | Sand | Falls, piles up, sinks through water and oil |
| `2` | Water | Flows and spreads, sinks through oil, extinguishes fire |
| `3` | Fire | Rises, spreads to burnable materials, produces smoke |
| `4` | Plant | Grows slowly upward, burns |
| `5` | Wood | Static solid, burns |
| `6` | Stone | Falls and piles, melts into lava on contact |
| `7` | Oil | Floats on water, ignites easily |
| `8` | Smoke | Rises and dissipates |
| `9` | Acid | Sinks through water, dissolves most materials |
| `Q` | Lava | Flows slowly, ignites burnables, solidifies when touching water, melts stone |
| `W` | Ice | Falls, melts near fire (→ water) or lava (→ steam), slowly freezes adjacent water |
| `0` | Erase | Remove cells |

## Controls

- **Click / drag** — paint selected material
- **`[` / `]`** — decrease / increase brush size
- **`C`** — clear the canvas
- **`P`** — pause / resume

## Interactions

- Water + Fire → Steam + extinguished fire
- Lava + Water → Stone + steam
- Lava + Stone → Melts stone back into lava
- Lava + Ice → Instant vaporisation + steam burst
- Fire + Ice → Gradual melt into water
- Oil + Fire/Lava → Burns rapidly
- Acid + anything → Dissolves it (acid slowly self-consumes)
- Ice + Water (adjacent) → Slowly freezes water

## Run Locally

No build step required — just open `index.html` in a browser.

```bash
git clone https://github.com/tommiew007/falling_sand.git
cd falling_sand
open index.html
```

## See Also

- [Simulation design notes](falling_sand.md)
