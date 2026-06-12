---
name: project-scenario-marker-selection-deferred
description: "RESOLVED 2026-05-30 (@7307b16): adjudicator-map.js scenario markers now emit rmooz:unit-selected (Red :1490, Blue :1557), consumed by unit-panel.js:211 — scenario+ORBAT selection converged on the shared event"
metadata: 
  node_type: memory
  type: project
  originSessionId: 7f293b17-89b6-4b86-a3dc-6beef59be27b
---

**RESOLVED 2026-05-30 (verified @7307b16).** Scenario markers rendered by `adjudicator-map.js` now DO emit `rmooz:unit-selected` on click — Red at `:1490`, Blue at `:1557` — and `unit-panel.js:211` (`document.addEventListener('rmooz:unit-selected', …)`) consumes it. That's the same event `units-map.js` emits, so scenario-unit and ORBAT-unit selection now share one signal.

**History (why it was deferred):** fixing it in isolation risked entrenching three parallel selection paths; the plan was to unify scenario/ORBAT/sim selection first. In practice they converged on the shared `rmooz:unit-selected` event rather than a single formal selection module.

**How to apply:** treat scenario-marker selection as wired. A single formal selection *module* across scenario/ORBAT/sim still doesn't exist — if you build one later, route through `rmooz:unit-selected`. See `APP_INVENTORY.md` → drift D1 (reconciled). Related: [[project-bls-not-drawn-on-map-deferred]].
