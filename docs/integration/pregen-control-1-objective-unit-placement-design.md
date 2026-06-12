# PREGEN-CONTROL-1 — Pre-Generation Objective & Unit Placement Design

**Date:** 2026-06-06 · **Mode:** audit + design (no implementation) · **Status:** discovery complete

**Headline:** RMOOZ can let operators control Objective X placement **today with zero engine changes** by
using the existing DOCX metadata override mechanism. Unit placement requires WarGamingGEN code changes.
The minimum viable proof is a 3-step flow: (1) UI to move Objective X, (2) RMOOZ writes scenario override
JSON, (3) WarGamingGEN reads it and uses the new coordinates.

---

## 1. Current State: What Is Hardcoded?

### Objective X (Static)
- **Source:** `WarGamingGEN/inputs/scenario.json` field `objective`
- **Current value:** lon=19.55, lat=29.74, depth_km_from_coast=90.1
- **In GeoJSON:** Written as a single Point feature (identical across all 17 phases):
  ```json
  { "kind": "objective", "id": "OBJ-X", "coordinates": [19.55, 29.74], … }
  ```
- **Override mechanism already exists:** scenario_parser.py reads `WG_OBJECTIVE_LON`, `WG_OBJECTIVE_LAT` from
  red_team.docx metadata (lines 101-165) via `apply_docx_objective_override()` in test_full_run.py.
  **WarGamingGEN already supports this pattern.**

### Unit Start Positions (Hardcoded)
- **RED ground/SOF:** Spawn at hardcoded (18.0, 32.0) — off-map embarkation point
- **RED air/naval:** Spawn at first matching Red off-map marker (air_base, naval_base) from scenario.off_map_markers
- **BLUE ground/SOF:** Spawn at AO bbox center: `((bbox[0] + bbox[2])/2, (bbox[1] + bbox[3])/2)` ≈ (19.57, 30.03)
- **BLUE air/naval:** Spawn at first matching Blue off-map marker
- **No override fields exist** in scenario.json or code for red_staging_area, blue_defense_area, etc.
- **Override mechanism does not exist** — would require modifying world_state.py `_spawn_position()` method
  (lines 185–217).

### Phase Line Progression (Deterministic)
- **Driven by:** scenario.json phases[].phase_line_km + coast_lat_approx (from scenario.json, line "coast_lat_approx":30.55)
- **In geojson_writer.py**, lines 125–192: RED ground advances inland from coast progressively; BLUE distributes defensively.
- **No override mechanism** — would require modifying `_compute_unit_position()` method.

---

## 2. What's Already Possible Without Engine Changes

### Objective X Override (Ready Today)
RMOOZ can **control Objective X placement right now** by using the existing DOCX metadata pattern:

**Current flow:**
1. User uploads red_team.docx (contains OOB)
2. WarGamingGEN's docx_parser.py extracts OOB + metadata
3. **scenario_parser.py reads `WG_OBJECTIVE_LON`, `WG_OBJECTIVE_LAT` from DOCX paragraphs**
4. If present, `apply_docx_objective_override()` merges them into scenario.objective
5. Output GeoJSON uses the overridden coordinates

**Proof:** scenario_parser.py lines 101–165 explicitly handle this:
```python
def apply_docx_objective_override(scenario, docx_metadata):
    if 'WG_OBJECTIVE_LON' in docx_metadata:
        scenario.objective.lon = float(docx_metadata['WG_OBJECTIVE_LON'])
    # … etc for LAT, depth_km, carver_total
```

**RMOOZ can inject this metadata by:**
1. Adding metadata comments to red_team.docx before staging it (unlikely)
2. **Writing a separate override JSON file and merging it at parse time** (cleanest — no DOCX modification)

---

## 3. What Requires WarGamingGEN Code Changes

### Unit Start Areas
- **RED staging area** — where ground forces embark/stage before assault
- **BLUE defense area** — where ground forces anchor their defense
- **Axis of attack** — direction Red advances toward Objective (currently derived from phase_line progression)

**Required changes:**
1. Add optional fields to scenario.json:
   ```json
   "red_staging_area": {"lon": 18.0, "lat": 32.0},  // or null = default
   "blue_defense_area": {"lon": 19.57, "lat": 30.03},  // or null = default
   "axis_of_attack_degrees": 180,  // or null = auto from phase_line
   ```

2. Modify world_state.py `_spawn_position()` (lines 185–217):
   - Check for red_staging_area override; use it if present
   - Check for blue_defense_area override; use it if present

3. Modify geojson_writer.py `_compute_unit_position()` (lines 125–192):
   - Use axis_of_attack_degrees to rotate the advance vector if present

**Effort:** ~50 lines of code changes (conditionals + override reads).

---

## 4. Safest Data Contract: Pre-Generation Override File

RMOOZ should write a **scenario override JSON file** that WarGamingGEN can optionally consume:

### File: `WarGamingGEN/inputs/scenario_overrides.json`
```json
{
  "schema_version": "rmooz-scenario-overrides-1.0",
  "created_by": "RMOOZ",
  "created_at": "2026-06-06T12:34:56Z",
  "operator_id": "user@example.com",
  "operator_note": "Moved Objective to block coastal road",
  
  "objective": {
    "id": "OBJ-X",
    "lon": 19.8,
    "lat": 29.5,
    "override_reason": "operator moved objective on map",
    "changed_from": {"lon": 19.55, "lat": 29.74}
  },
  
  "red": {
    "staging_area": {"lon": 17.5, "lat": 32.2, "label": "off-Benghazi embarkation"},
    "axis_of_attack_degrees": 175,
    "main_effort_unit_echelon": "brigade"
  },
  
  "blue": {
    "defense_area": {"lon": 19.5, "lat": 30.2, "label": "coastal defense sector"},
    "orientation_degrees": 275,
    "priority_defended_objective": "OBJ-X"
  },
  
  "unit_overrides": [
    {"uid": "R-D1-001", "override": "position", "fixed_lon": 18.0, "fixed_lat": 31.9, "reason": "HQ element staging area"}
  ]
}
```

**Key design choices:**
- **Optional fields**: All fields are optional; null/absent means "use scenario.json default"
- **Provenance stamps**: include `changed_from`, `override_reason`, `operator_id` so generated output can trace inputs
- **No DOCX mutation**: RMOOZ writes only JSON; never modifies red_team.docx
- **Immutable input**: red_team.docx is read-only input; OOB is never changed by operator moves
- **Run manifest inclusion**: test_full_run.py should include scenario_overrides.json hash in the run's output metadata so
  RMOOZ can detect "was this run made with override file X?"

---

## 5. Three-Phase Implementation (Safe Minimum Path)

### Phase 1: RMOOZ UI + Metadata (0 engine changes)
**Goal:** Prove the pattern — operator moves Objective X in UI, file changes, but generation doesn't use it yet.

**Changes:**
1. **RMOOZ server** (`wargame-sim-bridge.js`):
   - Add `POST /api/wargame-sim/objective-move?lon=X&lat=Y` endpoint
   - Write `scenario_overrides.json` with operator-moved coordinates
   - Return the file hash + metadata

2. **RMOOZ client** (new "Scenario Setup" card):
   - Show Objective X current coordinates (read from scenario.json + any existing override)
   - Map interaction: click to move, drag to new location
   - Show before/after coordinates + delta
   - "Save position" button (calls /objective-move)

3. **Source Inspector** (updated):
   - Add `scenario_overrides.json` row (if present)
   - Show operator, timestamp, what was changed

4. **Test:** User moves Objective X from (19.55, 29.74) to (19.8, 29.5) → file written → Source Inspector shows it

**Verification:** No generation yet; just the file exists and is detected.

### Phase 2: WarGamingGEN Reads Objective Override (Engine changes)
**Goal:** Move Objective X in UI, regenerate, see the GeoJSON coordinates change.

**Changes:**
1. **WarGamingGEN** (`scenario_parser.py`, lines 165–180):
   - Add `load_scenario_overrides()` function
   - If `scenario_overrides.json` exists and contains objective, merge it into scenario.objective
   - Log the merge: "Applying operator override: Objective moved from (19.55, 29.74) to (19.8, 29.5)"

2. **WarGamingGEN** (`test_full_run.py`, lines 170–176):
   - Call `load_scenario_overrides(scenario)` after loading scenario.json
   - Include scenario_overrides.json hash in the run manifest

3. **Test A:**
   - Set Objective X at (19.8, 29.5) via UI
   - Start generation
   - all_phases.geojson: Objective feature coordinates are (19.8, 29.5) not (19.55, 29.74)
   - GeoJSON hash differs from default run

4. **Test B:**
   - Move Objective X to (20.1, 29.2)
   - Start generation (new run)
   - Import both as scenarios
   - Map shows two scenarios with Objective at different locations
   - Source Inspector shows override hashes differ

**Effort:** ~30 lines added to scenario_parser + test_full_run.

### Phase 3: Unit Placement Overrides (Engine changes)
**Goal:** Operator can set RED staging area and BLUE defense area; generated unit positions change accordingly.

**Changes:**
1. **WarGamingGEN** (`scenario_parser.py`):
   - Add `red_staging_area`, `blue_defense_area`, `axis_of_attack_degrees` to scenario JSON schema
   - Read them from scenario_overrides.json if present

2. **WarGamingGEN** (`world_state.py`, lines 185–217):
   - In `_spawn_position()`: check for red_staging_area override; use it if present
   - Check for blue_defense_area override; use it if present

3. **WarGamingGEN** (`geojson_writer.py`, lines 125–192):
   - In `_compute_unit_position()`: if axis_of_attack_degrees present, use it to rotate unit advance direction

4. **RMOOZ UI** (extend "Scenario Setup" card):
   - Add RED staging area picker (map click/drag)
   - Add BLUE defense area picker
   - Add axis of attack arrow/bearing selector

5. **Test:**
   - Set RED staging at (17.5, 32.2) instead of (18.0, 32.0)
   - Generate
   - GeoJSON shows RED ground at (17.5, 32.2) in phase 0, not (18.0, 32.0)
   - Change axis to 180° instead of 175° → RED advance direction rotates in phases 5+

**Effort:** ~80 lines in world_state + geojson_writer + scenario_parser.

---

## 6. What RMOOZ Can Do Today (No Engine Changes)

**Minimum viable demo:**
1. Add a "Scenario Setup" card in the wizard (collapsed by default, before Start Generation)
2. Show Objective X current coordinates (hardcoded from scenario.json: 19.55, 29.74)
3. Add a **mock map preview** or text input to set new coordinates
4. On "Save", write scenario_overrides.json with the new objective coordinates
5. Show in Source Inspector: "scenario_overrides.json [pending engine support]"
6. On Start Generation, pass the file to WarGamingGEN (it won't use it yet, but it will be there)
7. After implementing Phase 2, the GeoJSON will use the new coordinates with zero UI changes

**Safety:**
- No DOCX modification
- No SmartSearch change
- No scenario DB mutation until final import
- Pure JSON override file
- Easy to audit: RMOOZ writes override, Source Inspector shows it, WarGamingGEN consumes it or ignores it

---

## 7. Minimum Proof That Scenario Is Not Hardcoded

**Test sequence (requires Phase 1 + 2):**

```
Step 1: Generate with default Objective X = (19.55, 29.74)
  → all_phases.geojson has Objective feature at (19.55, 29.74)
  → hash A = sha256(all_phases.geojson)

Step 2: In RMOOZ UI, move Objective X to (19.8, 29.5)
  → scenario_overrides.json written with new coordinates

Step 3: Regenerate scenario
  → all_phases.geojson has Objective feature at (19.8, 29.5)
  → hash B = sha256(all_phases.geojson)
  → hash A ≠ hash B ✓ (proves scenario changed)

Step 4: Import both as "scenario-default" and "scenario-override"
  → In RMOOZ map view, load "scenario-override"
  → Objective symbol appears at (19.8, 29.5), not (19.55, 29.74) ✓

Step 5: Inspect "scenario-override" metadata
  → Source Inspector shows:
    - scenario_overrides.json present
    - Objective override applied
    - source_run = <run_id_with_override>
    - hash matches geojson we generated ✓
```

**Proof result:** The scenario is **not hardcoded**. Moving Objective X before generation produces a visibly different GeoJSON/map.

---

## 8. What Should Never Be Manually Edited

- **red_team.docx** — parser would reject it if format breaks; no spatial config should go here
- **scenario.json** — RMOOZ UI should handle moves, not manual edits
- **all_phases.geojson** — generated output; any manual changes are lost on next generate
- **Any run outputs** (checkpoints/, outputs/, export/) — read-only generated state

**Safe manual edits (for testing only):**
- scenario_overrides.json — delete and re-create via UI
- scenario.json objective field — only for initial setup, not for operator moves (those go in override file)

---

## 9. File Ownership & Responsibility

| File | Owner | Mutates? | Notes |
|---|---|---|---|
| scenario.json | WarGamingGEN setup | Never | Scenario definition (phases, AO, objective default) |
| red_team.docx | Operator | Never in RMOOZ | Unit OOB source; no spatial config here |
| blue_team.docx | Operator | Never in RMOOZ | Unit OOB source; no spatial config here |
| scenario_overrides.json | **RMOOZ operator** | **YES** | Operator-moved Objective X, unit areas, axis (Phase 1+) |
| all_phases.geojson | WarGamingGEN | Generated | Output; includes operator overrides if applied |
| \_active.json | RMOOZ | Set on import | Active scenario in workspace |
| data/scenarios/*.json | RMOOZ porter | Generated on import | Final scenario record (includes source_run, generation_status) |

---

## 10. Acceptance Criteria

**The design is PASS if:**

✅ We know exactly what is hardcoded today (Objective X at 19.55, 29.74; RED at 18.0, 32.0; BLUE at AO center)  
✅ We know WarGamingGEN already has objective override mechanism (DOCX metadata pattern)  
✅ We know unit placement has no override mechanism (would need code changes)  
✅ We have a safe override file contract (scenario_overrides.json) that RMOOZ can write and WarGamingGEN can read  
✅ We have a 3-phase implementation plan: (1) UI writes file, (2) engine reads objective override, (3) engine reads unit overrides  
✅ Phase 1 alone (RMOOZ UI) requires zero engine changes  
✅ Minimum proof (move Objective X → different GeoJSON hash → visible on map) is achievable with Phase 1 + 2  
✅ No DOCX parsing, no SmartSearch, no unsafe mutations  

**The design is FAIL if:**

❌ The scenario is fully hardcoded with no override path (but it's not — DOCX metadata override exists)  
❌ WarGamingGEN cannot be modified to read JSON overrides (but it can — it's already designed to merge DOCX metadata)  
❌ There's no way to pass operator inputs to the engine (but scenario_overrides.json solves this)  

---

## Next Steps (Not in This PR)

- **PREGEN-CONTROL-2:** Implement Phase 1 (UI + file writing, no engine changes)
- **PREGEN-CONTROL-3:** Implement Phase 2 (WarGamingGEN reads objective override)
- **PREGEN-CONTROL-4:** Implement Phase 3 (WarGamingGEN reads unit placement overrides)
- Test with fixtures at different objective positions + unit areas to prove the scenario adapts to operator input
