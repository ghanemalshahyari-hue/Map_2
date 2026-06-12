# Wargame 3 — Live vs Dry-Run Unit Difference Audit

**Date:** 2026-05-28  
**Scope:** Read-only audit. No code changes.  
**Files inspected:**
- `UI_MOdified/client/shell/scenario-workspace.js` (15 330 lines)
- `UI_MOdified/client/wargame/adjudicator-map.js` (4 585 lines)
- `UI_MOdified/client/app.js` (18 045 lines)
- `UI_MOdified/data/scenarios/wargame3.json` (67 749 lines)

---

## 1. Executive Summary

The difference is **by design, not a bug.** The two panels answer different questions:

| Panel | Question answered | Units shown |
|---|---|---|
| **Live Scenario Step Navigator** | "Where is the full Order of Battle right now?" | All 150 positioned units (70 RED + 80 BLUE) for every step |
| **Wargame 3 Dry-Run Preview** | "Which units engaged in this step?" | 4–16 actor+affected units (capped at 12 on map) |

The mismatch is **12 preview markers vs 150 live markers** — a **12.5× difference at step 0**, ranging from 4×–38× across all 17 steps.

No data is lost. All 150 unit coordinates exist in the JSON. The dry-run adapter deliberately selects only the step-relevant subset.

---

## 2. Data Model — wargame3.json

### Top-level unit arrays

| Array | Count | Notes |
|---|---|---|
| `red_units` | **70** | Each has `uid`, `label`, `echelon`, `role`, `domain`, `coord` (baseline [lon, lat]) |
| `blue_units_initial` | **83** | Each has `unit_uid`, `base_id`, etc. |
| **Total OOB** | **153** | 3 blue units have no step coordinates (in `blue_units_initial` but not `blue_unit_step_coords`) |

### Per-step coordinate tables

| Table | UIDs with coords |
|---|---|
| `red_unit_step_coords` | **70** UIDs × 17 steps |
| `blue_unit_step_coords` | **80** UIDs × 17 steps |
| **Total with per-step coords** | **150 units** |

Every one of the 150 units has a non-null, non-sentinel coordinate at every step index (verified programmatically).

### Step structure

Each of the **17 steps** contains:
- `index` (0–16), `phase` (PRE-H / PHASE 1 / 2A / 2B / 3 / RESOLUTION), `time_label`
- `actors[]` — units that performed an action this step (each has `uid`, `side`, `action_what`, ...)
- `affected[]` — units that were hit this step (each has `uid`, `status_change`, `damage_pct`, ...)
- `unit_state` — uid → `{ is_actor, is_affected, strength, ... }` for visual emphasis
- `engagement_arcs[]`, `bls_status_baseline`, narrative fields

Steps do **not** contain a dedicated `unitsReferenced` field — unit membership is computed by the adapter.

---

## 3. Data Flow Diagrams

### 3.1 Live Scenario Step Navigator Pipeline

```
window.RmoozScenario
  ├── .scenario  ──→  sc (full JSON, read-only)
  │     ├── .blue_unit_step_coords  (80 UIDs × 17 coords)
  │     ├── .red_unit_step_coords   (70 UIDs × 17 coords)
  │     └── .steps[stepIdx].unit_state  (is_actor / is_affected flags)
  └── .stepIndex ──→  getActiveStepIndex()
                           │
                           ▼
                  buildScenarioOverlay(stepIdx)        [line 848]
                    for EVERY uid in blue_unit_step_coords:
                      coord = arr[stepIdx]
                      if coord is non-null and non-sentinel:
                        L.circleMarker(coord) → _swScenarioOverlay
                    for EVERY uid in red_unit_step_coords:
                      coord = arr[stepIdx]
                      if coord is non-null and non-sentinel:
                        L.circleMarker(coord) → _swScenarioOverlay
                    RESULT: up to 150 markers
```

**Key fact:** `buildScenarioOverlay` iterates `Object.keys(coordTable)` — all 80+70 UIDs — and tests each one. There is no step-action filter.

---

### 3.2 Wargame 3 Dry-Run Preview Pipeline

```
wargame3.json (raw)
        │
        ▼
adaptWargame3ToFixture(w3json)        [line 3622]
  For each of 17 steps:
    actors   = step.actors[].uid     (5–16 UIDs)
    affected = step.affected[].uid   (1–11 UIDs)
    unitsRefArr = deduplicated union  ←── FILTER #1: step-action scope
      e.g. step 0: 14 UIDs, step 1: 4 UIDs
    _stepUnitLocations = {uid: coord} for ALL 150 units at this step
  fixture.steps[N].unitsReferenced = unitsRefArr   (4–16 UIDs)
  fixture.steps[N]._stepUnitLocations = full per-step coord map
        │
        ▼  (_drpPreviewStepRef = "W3-STEP-NN")
buildScenarioStepPreview(fixture, stepRef)          [line 3219]
  step = fixture.steps[N]
  resolvedUnits = []
  for refUid in step.unitsReferenced:    ←── iterates 4–16 UIDs only
    loc = step._stepUnitLocations[refUid]
    resolvedUnits.push({ uid, displayName, side, startLocation: loc })
  preview.unitsReferenced = resolvedUnits
        │
        ▼
buildWargame3ReadOnlyMapOverlayData(preview)        [line 10532]
  rawUnits = preview.unitsReferenced  (4–16 objects)
  MAX_MARKERS = 12                    ←── FILTER #2: hard cap
  for ui in range(min(len(rawUnits), MAX_MARKERS)):
    if unit.startLocation has valid lat/lng:
      markers.push({ ... })
  overlay.markers = markers (≤12 entries)
        │
        ▼
paintWargame3ReadOnlyMapOverlay(overlay)            [line 10934]
  _w3PreviewLayer = L.layerGroup()
  for mk in overlay.markers where hasCoordinate == true:
    L.circleMarker → _w3PreviewLayer
  RESULT: 4–12 markers
```

---

## 4. Live Step vs Dry-Run Step Comparison

### Step cursors — completely independent

| Variable | Lives in | Updated by | Reset by |
|---|---|---|---|
| `window.RmoozScenario.stepIndex` | `window` global | `goToStep()` ← nav buttons in Live Navigator | Scenario reload / adjudicator reset |
| `_drpPreviewStepRef` | Module-private (`scenario-workspace.js` line 7421) | Dry-run nav buttons (◀ ▶ jump) | `_drpClearWargame3()` (line 9444) |

These two variables are **never synchronized**. When the operator opens the Scenario Workspace and loads the W3 fixture, `_drpPreviewStepRef` starts at `"W3-STEP-00"`. Meanwhile `window.RmoozScenario.stepIndex` may be at any step (0–16) depending on how far the adjudicator trial has advanced.

**The operator is very likely comparing two different steps**, in addition to the unit-scope difference.

### Example state when both cursors are on the same step

Even with both cursors on step 0 (`PRE-H`):

| Panel | Step | Units in source | Units on map |
|---|---|---|---|
| Live Navigator | 0 | 150 (all with coords) | 150 |
| Dry-Run Preview | W3-STEP-00 | 14 referenced → 12 capped | 11 (1 has no coord: B-d0-99-000) |

---

## 5. Unit Count Comparison Table (All 17 Steps)

| Step | Phase | Dry-Run Refs | Preview Map (≤12, w/ coord) | Live Map | Gap |
|---|---|---|---|---|---|
| 00 | PRE-H | 14 | 11 | 150 | 139 |
| 01 | PRE-H | 4 | 4 | 150 | 146 |
| 02 | PRE-H | 7 | 7 | 150 | 143 |
| 03 | PRE-H | 14 | 11 | 150 | 139 |
| 04 | PRE-H | 9 | 8 | 150 | 142 |
| 05 | PHASE 1 | 14 | 12 | 150 | 138 |
| 06 | PHASE 1 | 16 → **capped** | 11 | 150 | 139 |
| 07 | PHASE 1 | 16 → **capped** | 11 | 150 | 139 |
| 08 | PHASE 2A | 14 | 12 | 150 | 138 |
| 09 | PHASE 2A | 12 | 12 | 150 | 138 |
| 10 | PHASE 2A | 12 | 12 | 150 | 138 |
| 11 | PHASE 2B | 14 | 12 | 150 | 138 |
| 12 | PHASE 2B | 12 | 12 | 150 | 138 |
| 13 | PHASE 3 | 13 | 12 | 150 | 138 |
| 14 | PHASE 3 | 14 | 12 | 150 | 138 |
| 15 | PHASE 3 | 14 | 12 | 150 | 138 |
| 16 | RESOLUTION | 12 | 12 | 150 | 138 |

**Notes:**
- "Refs" = `len(actors∪affected)` before MAX_MARKERS cap
- "Preview Map" = `min(refs, 12)` counting only those with a valid coordinate
- Steps 06 and 07 have 16 refs; `MAX_MARKERS=12` drops the last 4
- `B-d0-99-000` appears in step 0 actors but has no entry in `blue_unit_step_coords` → counted as missing coord in 4 steps (00, 01, 03, 04) where it appears
- Live is always 150 regardless of step

---

## 6. Exact Cause Determination

### Cause B — **Primary (design intent):** Live = full OOB; dry-run = step-referenced only

`buildScenarioOverlay()` (line 848–923) iterates the **entire coordinate tables** (`blue_unit_step_coords`, `red_unit_step_coords`) — all 150 UIDs. It paints every unit that has a non-null, non-sentinel position at the given step.

`adaptWargame3ToFixture()` (lines 3789–3804) builds `step.unitsReferenced` as the **deduplicated union of `step.actors[].uid` + `step.affected[].uid`** — 4 to 16 units per step. This is then the **only** source that `buildScenarioStepPreview()` (line 3326) iterates. The other 136–146 units that are present and positioned but not engaging are deliberately excluded from the preview card.

**This is correct behavior.** The dry-run preview is an "engagement spotlight" — it shows which units fired, moved, or were affected in that decision step. The live overlay is a "force posture display" — it shows where every unit is.

### Cause C — **Secondary (also design intent):** Dry-run filters by step actions/effects

The `unitsReferenced` set is built strictly from `step.actors[]` and `step.affected[]`. Units that are present and positioned but neither acting nor being acted upon are invisible in the dry-run preview. This matches the purpose of the dry-run: to support operator decision-making about the specific step action, not to display the full OOB.

### Cause A — **Compounding factor (likely in practice):** Different steps

`window.RmoozScenario.stepIndex` and `_drpPreviewStepRef` are **independent variables** updated by different navigation controls. In typical use, the operator has the adjudicator at one step while the dry-run preview may be on a completely different step. There is no UI affordance or warning that they may be misaligned.

### Cause E — **Minor, specific to step 0:** Missing coordinate for one unit

`B-d0-99-000` (a BLUE unit) appears in `step.actors[]` for steps 0, 1, 3, 4, and 5 but has **no entry** in `blue_unit_step_coords`. The adapter will build a `resolvedUnits` entry with `startLocation: null` for this unit. `buildWargame3ReadOnlyMapOverlayData` will set `hasCoordinate: false` and count it in `unitsMissingCoord`. The `W3MOD_UNITS_NO_COORD` warning fires, but this is soft — the unit is listed in the panel but has no map dot.

### Causes D, F, G — **Not applicable**

- **D (missing adapter mapping):** All 150 units are in `fixture.units` via `adaptWargame3ToFixture`. The selectivity is intentional, not a gap in mapping.
- **F (different coordinate source):** Both pipelines use `*_unit_step_coords` tables. The live overlay reads them directly from the raw JSON; the adapter pre-builds a `_stepUnitLocations` map from the same tables.
- **G (bug):** No bug. The behavior is consistent with the design purpose of each panel.

---

## 7. Key Function Reference

### Live Navigator

| Function | Line | Role |
|---|---|---|
| `getScenario()` | 26 | Reads `window.RmoozScenario.scenario` |
| `getActiveStepIndex()` | 31 | Reads `window.RmoozScenario.stepIndex` |
| `buildScenarioOverlay(stepIdx)` | 848 | Iterates ALL coords in `*_unit_step_coords`, paints to `_swScenarioOverlay` |
| `paintScenarioOverlay()` | 925 | Calls `buildScenarioOverlay(getActiveStepIndex())` |
| `goToStep(newIdx)` | 694–720 | Updates `window.RmoozScenario.stepIndex`, calls `paintScenarioOverlay()` |

### Dry-Run Preview

| Function | Line | Role |
|---|---|---|
| `adaptWargame3ToFixture(w3json)` | 3622 | Builds fixture; per-step `unitsReferenced` = actors∪affected UIDs |
| `buildScenarioStepPreview(fixture, stepRef)` | 3219 | Resolves `unitsReferenced` UIDs against `fixture.units` + `_stepUnitLocations` |
| `buildWargame3ReadOnlyMapOverlayData(preview)` | 10532 | Converts `preview.unitsReferenced` → markers; `MAX_MARKERS = 12` at line 10564 |
| `paintWargame3ReadOnlyMapOverlay(overlay)` | 10934 | Paints to `_w3PreviewLayer` (separate from live overlay) |

### State variables

| Variable | Line | Value |
|---|---|---|
| `window.RmoozScenario.stepIndex` | external | Live adjudicator step (0–16) |
| `_drpPreviewStepRef` | 7421 | `"W3-STEP-NN"` — dry-run cursor, independent |
| `_swScenarioOverlay` | 7468 | Leaflet layerGroup for live dots |
| `_w3PreviewLayer` | 7474 | Leaflet layerGroup for preview dots (replaced each paint) |
| `MAX_MARKERS` | 10564 | Hard cap: `12` |

---

## 8. Is This a Bug?

**No.** The behavior is architecturally coherent:

1. The **Live Navigator** is designed as a "full OOB posture display." It paints all 150 units so the operator sees the entire force disposition.

2. The **Dry-Run Preview** is designed as a "step engagement spotlight." It shows only the units that participated in the step's action/reaction cycle. This is intentional — it reduces cognitive load by highlighting only what matters for the decision at hand.

3. The **independent step cursors** are intentional — the dry-run is a planning tool that may run ahead of or behind the live trial.

The only arguably surprising behavior is:
- **No visual label** tells the operator that the dry-run map shows "engaged units only, not full OOB."
- **No synchronization affordance** tells the operator which live step corresponds to the dry-run step.
- The `MAX_MARKERS = 12` cap silently drops units when a step has 13–16 participants (steps 06, 07).

---

## 9. Recommended Next PR

### If this is considered expected behavior (it is):

**PR-285A — "Preview Unit Scope Label"** (label clarification, no logic changes):

Add two pieces of text to the dry-run preview panel:
1. **Scope badge** on the map overlay: `"Engaged units only — N of 150"` or similar.
2. **Step sync indicator**: a small note showing `"Preview: W3-STEP-NN  |  Live: Step M"` so the operator knows whether they are looking at the same step or different steps.

No changes to `adaptWargame3ToFixture`, `buildScenarioStepPreview`, or `buildWargame3ReadOnlyMapOverlayData`.

**Estimated scope:** `app.html` (+2–4 lines), `scenario-workspace.js` (+10–20 lines in paint functions), `i18n.js` (+4–6 keys).

### If MAX_MARKERS cap is considered too restrictive:

**PR-285B — "Raise MAX_MARKERS to 20"** (single-line logic change):

Change line 10564 from `var MAX_MARKERS = 12;` to `var MAX_MARKERS = 20;`. Steps 06 and 07 have 16 refs; this would allow all of them to appear. Requires updating the PR-241 overlay tests.

### If step cursor desynchronization is considered a UX problem:

**PR-286A — "Live/Dry-Run Step Sync Indicator"** (read-only display, no logic change):

In the dry-run nav bar header, add a live read of `getActiveStepIndex()` to display `"Live step: N"` alongside `_drpPreviewStepRef`. No mutation.

---

## 10. Appendix — Unit B-d0-99-000 Missing Coordinate

This unit (`B-d0-99-000`) appears in `step.actors[]` for steps 0, 1, 3, 4 and 5, but is absent from `blue_unit_step_coords`. When the adapter encounters it in `unitsReferenced`, it finds no step location. The `W3MOD_UNITS_NO_COORD` warning fires.

**This is not a rendering bug** — the unit will appear in the dry-run preview panel's text list (actors section) with no map dot. The live overlay is not affected because `buildScenarioOverlay` only iterates UIDs *present in* `blue_unit_step_coords`; since `B-d0-99-000` is not in that table, it simply never appears on the live map either.

The unit may represent a command/HQ element that has no physical position (e.g., is off-map or virtual). The `off_map_markers` array in wargame3.json (top-level key confirmed) likely accounts for this class of units.
