---
name: project-authoring-slice2-next
description: Slices 1 + 2A + 2B + 2C + 2D-1 BUILT 2026-06-02 — next concrete step is Slice 2D-2 (Map-as-editor for AO/pipeline/objective) then DOC1
metadata: 
  node_type: memory
  type: project
  originSessionId: 7fca86e4-e6c4-4274-a551-da787767e6cf
---

**Status (2026-06-02).** Edit Mode has FIVE slices live, all on the same
in-memory working-copy boundary:

- **Slice 1** — Metadata + Sides + Posture.
- **Slice 2A (Geography)** — AO + Forces Geometry editing.
- **Slice 2B (Forces)** — `red_units[]` + `blue_units_initial[]` add/edit.
- **Slice 2C (Layout + New Scenario)** — 13-step left-rail navigator;
  "+ New scenario" inline form; Save As JSON + Save to server
  (`POST /api/scenarios`); Time & Duration card + Briefing card.
- **Slice 2D-1 (Forces redesigned for scale)** — replaces the 2B flat
  list with a **tree + detail-pane + search** sized for wargame3
  (70+83 units). Tree groups: side → echelon → compact one-line rows.
  Click row → SINGLE detail pane renders that unit's full editor
  (only ~10 inputs in DOM at a time, not 1,198). Search/filter spans
  uid/label/role/bls/echelon, auto-expands matching groups. Group
  collapse persists across rerenders. **Bug fix: role is now
  `<input list=…>` + `<datalist>` (free-text with 7 CMO suggestions),
  NOT a strict `<select>` — wargame3 has 33 distinct roles
  (mech_inf_div, sam_s300, submarine, awacs, …) and a strict enum
  would have silently corrupted every single one on first edit.**
  "Pick coord on map" button on the detail pane: next map click sets
  the selected unit's coord; ESC cancels. Uses Leaflet's `once('click')`
  pattern; never touches the durable `/api/units/:id/place` SQLite.

**Scale evidence (wargame3 loaded into Edit Mode → Forces step):**

| Metric | Pre-2D (2C end) | Post-2D-1 |
|---|---|---|
| Forces step scrollH | **51,688 px** | **785 px** (65× ↓) |
| Inputs in DOM at rest | **1,198** | **1** (search box) |
| Inputs in DOM when unit selected | 1,198 | **10** (single detail pane) |

**Tests (4 suites, 189 client assertions, all green):**
- `test-edit-mode-slice2a.js` — 50 / 50
- `test-edit-mode-slice2b.js` — 46 / 46
- `test-edit-mode-slice2c.js` — 50 / 50
- `test-edit-mode-slice2d.js` — 43 / 43

Plus `test-api-scenarios-post.js` — 17 / 17 server end-to-end.

**Architectural notes for the next slice author:**

- **DON'T duplicate `units-orbat-dock.js`.** Slice 2D-1 lifted the
  conceptual shape (tree + collapse state + side grouping) but writes
  into the scenario draft instead of the durable ORBAT DB. The existing
  ORBAT dock continues to handle the durable units store; the Forces
  step handles authoring.
- **`_collapsedForcesGroups`** is a module-level `Set` of group keys
  (`"RED"`, `"RED:division"`, etc.). Survives in-step rerenders but
  resets on a fresh setMode(true) because `_draft` rebuilds.
- **`unitMatchesFilter(u, q)`** searches uid/label/role/bls/base_id/echelon.
  Extend this for new unit fields, not the renderer.
- **Pick-on-map** uses Leaflet's `map.once('click', …)` for a one-shot
  handler; `_cancelPickOnMap()` is idempotent.
- **Don't reintroduce `<select>` for fields with open vocabularies.**
  Role, sidc, echelon are all free-text. BLS is a `<select>` only
  because it MUST reference an existing `bls_template[].name` (a real
  validator hard rule). Add the unit's current value as an option even
  if stale to avoid silent overwrite.

**Next = Slice 2D-2 — Map-as-editor for AO / pipeline / objective.**
Step 2 (Map & AO) currently uses lon/lat number inputs; CMO uses
drawing tools (Ctrl+K rectangle, Ctrl+P polygon, click waypoints).
**Audit first:** `UI_MOdified/client/ui/panels/draw-panel.js`,
`shapes-panel.js`, and the existing TMG-builder (engagement mission
graphics) for a draw tool we can reuse rather than reinvent. If
nothing fits, hand-roll click-to-add-vertex with native Leaflet.

After 2D-2 = **DOC1 — Doctrine/ROE/WRA** (CMO playbook Step 5 ⚠️ GAP,
highest-value engine gap). The Step 5 placeholder card in the rail
just needs to flip `gap:true → false` and point at a new
`renderDoctrineCard()`. Three pre-DOC1 schema questions to settle:

1. Schema shape — bilateral matrix vs per-side flat? Hierarchical
   override semantics?
2. WRA UI: per-unit override, or only side/group level? CMO does both.
3. AI citation: do we add a `cites:[{path, policy}]` field on AI
   proposals or wire it through the existing explainability surface?
