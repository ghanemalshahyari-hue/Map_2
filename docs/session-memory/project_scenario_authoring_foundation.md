---
name: project_scenario_authoring_foundation
description: "P0 Scenario Authoring foundation shipped (shell/scenario-authoring-schema.js) — pure data/schema, unwired by design, stays inside the locked AI/sim boundary; P1–P4 editor UI pending"
metadata: 
  node_type: memory
  type: project
  originSessionId: 9eb3f1a0-b8db-4c0b-9cd6-720621edec4c
---

A **P0 Scenario Authoring foundation** landed 2026-05-31 (`aec386a`) at
`UI_MOdified/client/shell/scenario-authoring-schema.js`: pure data/schema utilities —
canonical authoring schema (17 sections), `buildStandardScenarioAuthoringTemplate`,
`fillScenarioAuthoringGaps` (works on a **copy**, never mutates input),
`diagnoseScenarioAuthoringGaps`, and `isScenarioAuthoringDraftSafe`. Dual export
`window.AppScenarioAuthoring` + `module.exports`. **Not loaded in `app.html`** (unwired by
design) — Node-testable, `test-p0-authoring-foundation.js` 33/33. Doc:
`docs/rmooz-authoring-foundation.md`.

**Why:** operational scenarios (Decision Packages, CSP51 imports) routinely miss CMO-style
fields. RMOOZ should **detect the gaps and offer a standard structure** the operator can review
and edit — but must **never fabricate combat data**. Hence honest placeholders
(`unknown`/`not_assigned`/`not_modeled`/`manual_required`/`not_available`): doctrine is a
**skeleton** (`manual_required`), and capabilities/logistics/attrition/detection are
`not_modeled` rather than invented.

**How to apply:** when building the authoring UI (roadmap **P1** Sides/Posture → **P2**
Doctrine/ROE → **P3** Missions/Events → **P4** Save/Export + "New from template"/"Fill
standards"), build **on this module** — don't re-derive the schema or template. Authoring edits
scenario **data** (canonical RMOOZ Live Scenario JSON) that then loads into the existing
read-only Review/Playback. Critically, **operator authoring ≠ AI mutation**: this stays *inside*
the locked AI/sim boundary — the module hard-codes `liveMutationAllowed:false` /
`aiCommitAllowed:false` and `isScenarioAuthoringDraftSafe` rejects lua/scripts, fetch/backend
URLs, storage keys, and auto-apply/commit flags. So this does **not** affect drift **D3** (the
server `/api/sim/commit` question) — see [[feedback_ai_sim_boundary_rules]]. Related:
[[project_decision_package_import]] (imported packages are a prime source of gap-filled
scenarios the authoring layer would standardize).
