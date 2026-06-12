---
name: project-rtl-context-panel-overlap-deferred
description: In RTL mode context-panel is mostly covered by unit-panel; deferred until full RTL layout refinement
metadata: 
  node_type: memory
  type: project
  originSessionId: 7f293b17-89b6-4b86-a3dc-6beef59be27b
---

In RTL mode, `unit-panel` now remains visible and `tool-rail` is usable, but `context-panel` is still mostly covered by `unit-panel`.

**Why deferred:** A targeted z-index / offset patch would only paper over the broader RTL layout issues. The fix belongs in a dedicated RTL layout refinement pass that re-examines panel stacking, mirroring, and sizing as a whole.

**How to apply:** If a task touches RTL styling, `unit-panel`, `context-panel`, or `tool-rail` positioning, don't spot-fix the overlap — surface that the full RTL layout refinement is the right vehicle. Don't treat this as a bug to fix opportunistically.
