# Falling Sand — Backlog

## Physics

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

*(nothing yet)*
