---
name: project-bls-not-drawn-on-map-deferred
description: "RESOLVED 2026-05-30 (@7307b16): workspace draws scenario on map (PR-288M maybeDrawLiveScenarioOnMap) AND per-step playback wired (P4 5f0b272: goToStep → applyStepProgress); BLS/markers advance with the transport bar"
metadata: 
  node_type: memory
  type: project
  originSessionId: 7deb72c4-c896-44ad-8d36-7b4903d952af
---

**RESOLVED 2026-05-30 (verified @7307b16).** Both halves are now wired:
- **Load:** `scenario-workspace.js` `maybeDrawLiveScenarioOnMap()` (`:15521`) delegates to `AppAdjudicatorMap.drawScenario()` right after `window.RmoozScenario` is set (PR-288M).
- **Per-step:** `goToStep()` (`:986`) calls `window.AppAdjudicatorMap.applyStepProgress(newIdx)` (`:1001`), and the bottom transport bar drives `goToStep` (P4, commit `5f0b272`). `applyStepProgress` lives in `wargame/adjudicator-map.js:4394` (exported `:4628`) and uses the same per-step model as `applyState`. So stepping in the workspace now advances BLS/markers on the map.

**History (why it was deferred):** workspace cards (PR-287C–G) were deliberately built map-free as a safety boundary; the map↔workspace bridge was added later — load in PR-288M, per-step in P4.

**How to apply:** treat workspace→map draw + per-step playback as wired and read-only (the bridge does no geometry/data mutation). See `APP_INVENTORY.md` → drift D2 (reconciled). Related: [[project-scenario-marker-selection-deferred]].
