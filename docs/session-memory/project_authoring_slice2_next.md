---
name: project-authoring-slice2-next
description: Slices 1 + 2A + 2B + 2C + 2D-1 + 2D-2 BUILT 2026-06-02 — next concrete step is DOC1 (Doctrine/ROE/WRA)
metadata: 
  node_type: memory
  type: project
  originSessionId: 7fca86e4-e6c4-4274-a551-da787767e6cf
---

**Status (2026-06-02).** Edit Mode has SIX slices live:

- **Slice 1** — Metadata + Sides + Posture.
- **Slice 2A (Geography)** — AO + Forces Geometry data editing.
- **Slice 2B (Forces)** — `red_units[]` + `blue_units_initial[]` editing.
- **Slice 2C (Layout + New Scenario)** — 13-step rail; "+ New scenario";
  Save As JSON + Save to server (`POST /api/scenarios`); Time +
  Briefing cards.
- **Slice 2D-1 (Forces redesigned for scale)** — tree + detail-pane +
  search; role free-text fix; map-pick for unit coord; "Editing:" +
  saved-state badge; "Start from existing" picker; fixed-position
  overlay + picking-mode overlay collapse.
- **Slice 2D-2 (Map-as-editor)** — replaces lon/lat textareas with
  **click-to-draw on the live map**: Set objective (single click),
  Draw AO (polygon with double-click finish), Draw pipeline (polyline
  with double-click finish), per-BLS Pick coord. Native Leaflet
  (`L.polygon`/`L.polyline` with hand-rolled vertex collection — no
  plugin, matching the rest of the codebase). After each pick the
  draft is mirrored to live `RmoozScenario` and the map repaints via
  `AppAdjudicatorMap.drawScenario` for preview.

**Tests — 5 suites, 219 client assertions, 17 server assertions, all green:**
- `test-edit-mode-slice2a.js` — 50 / 50
- `test-edit-mode-slice2b.js` — 46 / 46
- `test-edit-mode-slice2c.js` — 50 / 50
- `test-edit-mode-slice2d.js` — 43 / 43
- `test-edit-mode-slice2e.js` — 30 / 30 (new — polygon/polyline state machine)
- `test-api-scenarios-post.js` — 17 / 17 (server endpoint)

**Architectural notes for the next slice author:**

- **Pick helpers — three shapes:**
  - `_beginPickOnMap(onPicked, onCancel)` — single point.
  - `_beginPickOnMapPolygon(onFinish, onCancel)` — closed ring.
  - `_beginPickOnMapPolyline(onFinish, onCancel)` — open polyline.

  All three: install Leaflet click/dblclick handlers; collapse the
  workspace panel via `.sw-editmode-picking`; show a banner in the bar;
  ESC cancels; double-click finishes (multi-vertex); minimum-vertex
  enforcement (≥3 polygon, ≥2 polyline) or onCancel fires.

- **`_maybeRepaintMap()`** is the standard "after edit, preview on map"
  hook. It clones `_draft` into `window.RmoozScenario.scenario` (in-memory
  only) and calls `AppAdjudicatorMap.drawScenario`. Save draft is still
  the official commit path; this is just a visual preview.

- **No Leaflet plugins.** Stay hand-rolled. The existing pattern is in
  `_beginMultiPick` (scenario-edit-mode.js) — copy it for any new
  vertex-collection flow rather than adding a dependency.

**Next = DOC1 — Doctrine/ROE/WRA.** Step 5 placeholder card in the rail.
Three open schema questions still need settling:

1. Schema shape — bilateral matrix vs per-side flat? Hierarchical
   override semantics (side → mission → group → unit)?
2. WRA UI: per-unit override, or only side/group level? CMO does both.
3. AI citation: do we add a `cites:[{path, policy}]` field on AI
   proposals or wire it through the existing explainability surface?

DOC1 build sketch:
- Add `doctrine{}` top-level scenario block.
- WRA state (Free / Tight / Hold) per side; self-defense, EMCON,
  fuel/withdrawal policies.
- `renderDoctrineCard()` filling the Step 5 placeholder. Flip
  `gap:true → false` in the STEPS entry.
- `stepIsComplete('doctrine')` predicate (currently null).

After DOC1: TASK1 (Tasking/Mission layer — Step 10 placeholder), then
Weather (Step 7) when the schema is settled.
