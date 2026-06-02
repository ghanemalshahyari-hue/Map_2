---
name: project-authoring-slice2-next
description: Post-audit (2026-06-02) RMOOZ state — structural CMO backbone is built+wired; next build step is Edit Mode Slice 2 (Geography & Forces / unit placement)
metadata: 
  node_type: memory
  type: project
  originSessionId: 7fca86e4-e6c4-4274-a551-da787767e6cf
---

`/audit-app` at HEAD `e0cf324` (branch `claude/magical-lewin-e1ab3a`, 32 ahead of `main`) found the
structural CMO backbone from [[session_2026-06-01_world_state_engine]] is **no longer pending — it
landed, merged, and is wired**: WS1/WS3/DB1/DET1/ENG1 (`client/shell/world-state*.js`, `detection.js`,
`engagement.js` + server seam `sim/world-state-engine.js`), MOVE1 continuous movement
(`wargame/movement-playback.js`), 3D Cesium globe + Libya DEM, and the engines are wired onto the map
as read-only overlays (coverage rings 41/41, detection contacts 30/30, firing solutions 28/28).
Engine tests green (WS1 25 / DB1 15 / DET1 15 / ENG1 17 / WS3 15). D3 unlocked: `/api/sim/commit`
live + journals; `/api/sim/decide` (WS3) and `/api/units/:id/place` added.

**Why:** the user wants to "start building a scenario by placing units, from the CMO captions." The
ground truth is that placement + the engine already exist — so the work is *continuing the authoring
slices*, not building from scratch (avoids the CLAUDE.md rebuild trap).

**How to apply:** the **next concrete step is Edit Mode Slice 2 — Geography & Forces**.
[[project_workspace_editable_owner_ruling]]: `shell/scenario-edit-mode.js` (`window.AppEditMode`) has
Slice 1 done (Metadata + Sides + Posture, in-memory working copy). Slice 2 adds the CMO build-order's
next steps: define the AO (objective, BLS, pipeline/`ao_boundaries`) **then** place units/OOB. Unit
placement already works (`units-orbat-dock.js` drag + `units-map.js` cursor-follow →
`/api/units/:id/place`) — Slice 2 should *drive those from Edit Mode*, not reimplement them. Build
against the CMO rules now in the workbench: `docs/cmo-functional-rules/exhaustive/scenario-authoring-part{1,2}.md`
+ the validated `docs/cmo-functional-rules/sample-sahil-corridor.json` as the target JSON shape
(passes `scenario-validator`). Keep the in-memory working-copy / commit-journal boundary.
