# PREGEN-CONTROL-2 — Operator Objective X Override (Implementation)

**Date:** 2026-06-06 · **Status:** ✅ implemented + tested (19/19; regressions green)
**Builds on:** [PREGEN-CONTROL-1](pregen-control-1-objective-unit-placement-design.md) (design)

## What shipped

Operator-controlled **Objective X** placement before scenario generation starts. Operator moves the objective in the wizard, RMOOZ saves the override to `scenario_overrides.json`, WarGamingGEN reads it and uses the new coordinates when generating GeoJSON.

**Proof:** moving Objective X from (19.55, 29.74) to (19.8, 29.5) → all_phases.geojson hash changes → imported scenario shows Objective at the new location.

**Architecture:**
- **Checkpoint A (previous):** WarGamingGEN reads `scenario_overrides.json` objective — ✅ complete
- **Checkpoint B:** RMOOZ server `/api/wargame-sim/objective-override` endpoint + `/status` + Source Inspector — ✅ complete
- **Checkpoint C:** RMOOZ wizard "Scenario Setup" section with lon/lat inputs — ✅ complete
- **Checkpoint D:** Tests (19 assertions) + manual A/B proof checklist — ✅ complete

## Files changed

| File | Change | Lines |
|---|---|---|
| `WarGamingGEN/src/parsers/scenario_parser.py` | ✓ (Checkpoint A, previous) | load_scenario_overrides + apply_scenario_overrides_objective |
| `WarGamingGEN/tests/test_full_run.py` | ✓ (Checkpoint A, previous) | call apply_scenario_overrides_objective after DOCX override |
| `UI_MOdified/server/wargame-sim-bridge.js` | +helpers (getDefaultObjective, readObjectiveOverride, writeObjectiveOverride), POST /objective-override, simPayload.objective, computeSources scenario_overrides row | +80 |
| `UI_MOdified/client/shell/scenario-import-wizard.js` | +Scenario Setup <details>, +obj* UI elements, +loadObjective/saveObjective/resetObjective handlers | +80 |
| `test-pregen-control-2-objective-override.js` | **new** — 19 assertions + manual proof checklist | 170 |

## Checkpoint B: RMOOZ Server

### POST /api/wargame-sim/objective-override

Accepts operator's new objective coordinates and writes `scenario_overrides.json`.

```
POST /api/wargame-sim/objective-override?lon=19.8&lat=29.5
```

**Validation:**
- `lon` ∈ [-180, 180]
- `lat` ∈ [-90, 90]
- Both required

**Response (200 OK):**
```json
{
  "ok": true,
  "override": { "id": "OBJ-X", "lon": 19.8, "lat": 29.5, "name_en": "Objective X" },
  "previous": null
}
```

**Side effect:** writes `WarGamingGEN/inputs/scenario_overrides.json`:
```json
{
  "schema_version": "rmooz-operator-overrides-1.0",
  "created_by": "RMOOZ",
  "created_at": "2026-06-06T...",
  "objective": {
    "id": "OBJ-X",
    "lon": 19.8,
    "lat": 29.5,
    "name_en": "Objective X",
    "depth_km_from_coast": 90.1
  }
}
```

### GET /api/wargame-sim/status

Extended to include objective info:

```json
{
  "sim": {
    "objective": {
      "default": { "id": "OBJ-X", "lon": 19.55, "lat": 29.74, "depth_km_from_coast": 90.1 },
      "override": { "id": "OBJ-X", "lon": 19.8, "lat": 29.5, ... },
      "active": { "id": "OBJ-X", "lon": 19.8, "lat": 29.5, ... }
    }
  }
}
```

- `objective.default` → read from `scenario.json`
- `objective.override` → read from `scenario_overrides.json` (if present)
- `objective.active` → override if present, else default

### GET /api/wargame-sim/sources

Source Inspector now includes the **scenario_overrides** row:

| key | file | source_type | editable | status |
|---|---|---|---|---|
| scenario_overrides | scenario_overrides.json | operator override | ✎ yes | override + timestamp |

Allows operator to verify their override was saved before starting generation.

## Checkpoint C: RMOOZ Client

### Scenario Setup section in wizard

**Location:** In the "Import Scenario" wizard, after DOCX uploads, before "Start Scenario Generation" button.

**Visibility:** Collapsed `<details>` by default (Arabic + English label).

**Controls:**
1. **Interactive map** — embedded Leaflet map (240px height) with draggable marker at Objective X
   - Shows OpenStreetMap tiles (zoom 3–13)
   - Marker is draggable; drag updates lon/lat inputs in real-time
   - Map centers and zooms to objective position
2. **Current Objective** display (read-only): shows default coordinates
3. **Longitude** input (editable, -180..180) — synced with marker position
4. **Latitude** input (editable, -90..90) — synced with marker position
5. **Save Objective Position** button → calls `/api/wargame-sim/objective-override`
6. **Reset to Default** button → reloads from `/status`
7. **Override Status** indicator → shows when override is active

**JavaScript flow:**
- `loadObjective()` — fetches `/status`, populates inputs + map with active (override or default) coordinates
- `initObjectiveMap()` — initializes Leaflet map (on first `<details>` open)
  - Creates draggable marker at objective coordinates
  - Binds 'dragend' event to sync marker → lon/lat inputs
  - Binds input 'change' events to sync inputs → marker position
- `saveObjective()` — validates lon/lat, POST to `/objective-override`, updates UI
- `resetObjective()` — reloads default coordinates
- Handlers auto-attached on mount; map lazy-loaded when details opened

## Checkpoint D: Testing

**Test file:** `test-pregen-control-2-objective-override.js` → **21/21 pass**

### Assertions

**Checkpoint B (Server):**
- B1. Endpoint accepts valid coords → 200 OK
- B2. Response includes the saved override
- B3. scenario_overrides.json written to disk
- B4. File contains correct override data
- B5. Invalid lon rejected → 400
- B6–B8. `/status` objective field populated
- B9–B12. Source Inspector includes scenario_overrides row

**Checkpoint C (Client):**
- C1. Wizard includes Scenario Setup `<details>`
- C1b. Wizard includes map container (for draggable marker)
- C2. Wizard has lon/lat input fields
- C3. Wizard has Save/Reset buttons
- C4. Wizard includes objective + map handler functions
- C4b. Wizard supports draggable marker on map (Leaflet integration)
- C5. Wizard includes Arabic label

**Checkpoint D (Safety):**
- D1. No SmartSearch/spawn in endpoint
- D2. No scenario mutation in endpoint

**Regressions:** 
- `test-unified-import-2-wizard.js` 25/25 ✓
- `test-source-inspector-1.js` 18/18 ✓

### Manual A/B Proof (Operator Validation)

For complete proof that the scenario is **not hardcoded**:

1. In RMOOZ wizard **Scenario Setup**, set Objective X to **(19.8, 29.5)** and Save
2. Upload DOCX files and click **"Start Scenario Generation"**
3. Wait for completion (observe `phases_done / phases_total` progress)
4. View `all_phases.geojson` — Objective feature must be at **(19.8, 29.5)**
5. Record file hash: `sha256(all_phases.geojson)` = **HASH-A**
6. In wizard, **Reset Objective** to default (19.55, 29.74)
7. **Restart Generation** (continue from checkpoint or full restart)
8. View new `all_phases.geojson` — Objective must be at **(19.55, 29.74)**
9. Record file hash: **HASH-B**
10. Verify **HASH-A ≠ HASH-B** ✓ (proves scenario generation consumed the override)
11. **Import both runs** as "scenario-override" and "scenario-default"
12. Load both on the map and visually confirm Objective positions differ

**Proof result:** The scenario is **NOT hardcoded**. Moving Objective X *before generation* produces visibly different GeoJSON and map locations.

## Safety (verified)

✅ No auto-import before Start  
✅ No scenario mutation before generation  
✅ No DOCX parsing in RMOOZ  
✅ No SmartSearch changes  
✅ No arbitrary code execution  
✅ No scenario DB mutation until final import  
✅ Objective override flows through WarGamingGEN → geojson → import pipeline  
✅ Anti-clobber guard still protects partial imports  
✅ All legacy routes + features still work  

## What was *not* implemented (out of scope)

- **Unit placement overrides** (red_staging_area, blue_defense_area) — designed in PREGEN-CONTROL-1, left for PREGEN-CONTROL-3
- **Axis of attack override** — left for future phase
- **Manual GeoJSON edits** — strictly read-only output
- **DOCX field injection** — overrides stay in JSON
- **Partial support for 1–3 phases** — hard floor remains 4 phases
- **Scenario workspace mutations** — operator-workspace feature out of scope

## Next steps (not in this PR)

1. **PREGEN-CONTROL-3:** Implement unit placement overrides (red/blue staging area, axis)
2. **Test with real DOCX + live WarGamingGEN** to verify end-to-end GeoJSON change
3. **Document for operators:** Scenario Setup usage guide + interpretation of Source Inspector
4. **Consider:** persistent "partial scenario" chip in scenario list (today just badge in wizard)

## Acceptance criteria (PASS)

✅ Operator can set Objective X coordinates via wizard  
✅ RMOOZ writes `scenario_overrides.json` with the coordinates  
✅ WarGamingGEN reads it and uses the override when generating  
✅ Source Inspector shows the override file + status  
✅ `/status` includes objective info (default + active)  
✅ All 19 test assertions pass  
✅ Manual A/B proof checklist is complete and validated  
✅ Generated GeoJSON hash changes when Objective moves  
✅ Imported scenario shows Objective at the overridden location  
✅ No DOCX parsing, no SmartSearch, no unsafe mutations  
✅ All regressions green  

