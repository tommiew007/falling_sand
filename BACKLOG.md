# Falling Sand — Backlog

## Physics

**Mass and weight simulation** ⚠ Complicated
Currently there is no mass model. Density differences are faked via hardcoded movement priority rules — lava can displace water because its fall check lists water as passable, not because a density value is compared. True mass simulation would require per-cell weight values, force accumulation, acceleration vectors, and a summation pass each frame to propagate pressure downward through stacked materials. This would also mean momentum, inertia, and realistic buoyancy. The CPU and architectural cost would be significant, and most of the visual payoff is already approximated by the current priority table. The crushing gravity mechanic (`pressureAbove()`) is a partial workaround — it counts cells, not mass, so a column of iron and a column of sand crush identically.

---

**Density lookup table**
No material has a numeric density value. Displacement rules are hardcoded per-material as explicit lists of what each cell can push through — a hand-written approximation that breaks silently when new materials are added and requires auditing a dozen places for every change. The fix is a single `DENSITY[]` array (one value per material ID) and a `canDisplace(a, b)` helper that replaces all hardcoded displacement lists with a `density[a] > density[b]` check. Moderate refactor — touches every material's movement block — but eliminates an entire class of bugs and makes future materials trivial to place correctly in the ordering. Also enables naturally correct buoyancy for any new material without manual list updates.

---

**Thermal diffusion**
Each cell carries its own temperature rather than reacting to a single global ambient. Heat radiates outward from fire and lava, cold propagates from ice, and phase transitions respond to local conditions instead of the world thermostat. Key design questions: per-cell array type (Uint16 vs Float32), diffusion frequency (every frame vs alternating), and whether air cells participate or simply reset to ambient each tick. Benchmark before committing — memory bandwidth is the primary risk to frame rate.

---

## Materials

**New material candidates**
Identify materials that add meaningfully distinct behavior rather than variations on existing ones. Priorities: something indestructible at Inferno temps (tungsten is the leading candidate — melts above 6,192°F, conducts electricity, acid-resistant), plus any material that enables interactions not currently possible.

---

## Environment Controls

**New world parameter candidates**
Audit what physical variables are currently hardcoded (atmosphere composition, pressure, humidity, etc.) and evaluate which ones would produce interesting emergent behavior if exposed as sliders or toggles. Criteria: the control should visibly change how at least two materials behave, and the effect should be legible to the user without explanation.

---

## Architecture

**Adaptive frame-rate governor**
Measure rolling average frame time via `requestAnimationFrame` timestamps. When sustained fps drops below ~45 for ~30 consecutive frames, automatically step the speed multiplier down one notch; restore it when fps recovers above ~58 for ~60 frames. Governs only downward from the user's chosen speed setting, never upward past it. Hysteresis prevents oscillation. Show a subtle `fps↓` badge on the existing fps counter when the governor is active so the user knows why the speed changed. ~40 lines, touches only the main loop and speed display.
