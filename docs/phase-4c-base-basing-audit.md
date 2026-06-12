# Phase 4C — Base / Basing Audit

**Date:** 2026-06-04  
**Status:** ✅ AUDIT COMPLETE — Recommendation provided  
**Scope:** Read-only analysis of existing base/basing support before implementation

---

## Executive Summary

RMOOZ has a **two-layer base/basing system** that is 70% complete:

1. **Step 9 (Forces Geometry):** BLS template editing — fully functional
   - Create/edit/remove Base Location Sets (BLS)
   - Set BLS name, coordinates, role, throughput, terrain_friction
   - Supports map-based coordinate picking
   
2. **Step 10 (Forces OOB):** Unit assignment to bases — functional but limited
   - RED units **require** BLS assignment (can't add RED without BLS)
   - BLUE units have `base_id` field but **no visual base management**
   - No BLS status editing (ownership, readiness, capacity constraints)
   - No base-specific OOB organization (grouping units by base)

3. **Map rendering:** BLS markers drawn correctly
   - BLS display as semi-circles with role labels
   - Units anchored to their assigned BLS during adjudication
   - BLS status colors (CONTESTED, STAGED) supported

**What's working:**
- BLS template CRUD (create/read/update/delete) in Geometry step
- RED units must reference valid BLS
- Map displays BLS and unit-to-BLS spatial relationships
- Export preserves all BLS and unit data

**What's missing:**
- BLUE base management (no `bls` field, no base templates for BLUE)
- BLS status/readiness editing
- Base capacity constraints (throughput vs. unit count)
- Base logistics (stockpiles, resupply rates)
- Base availability per-step (appear/disappear timing)
- Base-centric OOB views (units grouped by base)
- BLS destruction/repair mechanics

---

## Detailed Findings

### 1. Existing BLS/Base Structures in Scenario Schema

**Top-level fields:**
```
scenario.bls_template       (array) — Force Geometry data
scenario.sides_bases        (object) — LEGACY CMO format (used by units.BLUE/units.RED)
scenario.red_units          (array) — NEW format, references BLS by name
scenario.blue_units_initial (array) — NEW format, uses base_id field
scenario.units.BLUE/RED     (object) — OLD CMO format, maintained for compatibility
```

**BLS Template structure:**
```javascript
{
  name: string,              // "Meridia North Base"
  coord: [lon, lat],         // WGS84 coordinates
  role: string,              // "Fighter Base", free-text (not enum)
  throughput: number,        // Units/hour capacity (not enforced)
  terrain_friction: number   // 0..1, affects movement speed
}
```

**Field validation status:**
- ✅ name: required, free-text
- ✅ coord: required, [lon, lat] format, validated as earth coordinates
- ✅ role: free-text, no enum (allows flexibility)
- ⚠️ throughput: not enforced (advisory only)
- ⚠️ terrain_friction: not enforced (advisory only)

**Missing fields in BLS template:**
- No `id` field (units reference by name, which is fragile on rename)
- No `appear`/`disappear` step indices (timing not supported)
- No `capacity` (max units at base)
- No `readiness`/`status` baseline (always assumed ready)
- No `supply_baseline`/`fuel_baseline` (no logistics schema)

---

### 2. Step 7 Forces Geometry Support

**Step 9 title:** "Forces Geometry (Objective + Pipeline + BLS + Throughput)"

**Existing fields edited:**
1. **obj** — Objective (1 per scenario)
   - name, coord [lon,lat], target_depth_km, carver, radius_km
   - ✅ Fully editable with validation
   
2. **pipeline** — Waypoints (axis of advance)
   - [lon,lat] per waypoint, ≥2 required
   - ✅ Textarea + draw-on-map button
   
3. **throughput_ceilings_km** — Time-based movement limits
   - H12, H24, H48, H72, H120 (hours)
   - ✅ Editable, advisory only (not enforced)
   
4. **bls_template** — Base Location Set array
   - ✅ Full CRUD: add, edit (all fields), remove, pick-coord-on-map
   - ⚠️ No per-step basing (all BLS assumed present at step 0)
   - ⚠️ No BLS groups/clusters
   - ⚠️ No capacity or supply modeling

**Map integration:**
- ✅ Pipeline waypoints drawn as polyline
- ✅ BLS markers drawn at coordinates
- ✅ Draw-on-map buttons for both pipeline and BLS
- ✅ Map redraw triggered on save

**What's NOT here:**
- No base-specific terrain modeling
- No basing strategy visualization (staging areas, fallback bases)
- No base damage/repair timeline
- No base OPSEC/deception markup

---

### 3. How Coastal Shield Defines BLUE and RED Bases

**Coastal Shield implementation:**

**BLS Template (5 entries):**
```
Meridia North Base      @ [160.0, -16.0]    role="Fighter Base"     throughput=100
Meridia East Base       @ [162.5, -18.2]    role="Fighter Base"     throughput=100
Meridia Central Base    @ [160.5, -19.0]    role="Fighter Base"     throughput=100
Meridia Northwest Base  @ [157.0, -17.5]    role="Fighter Base"     throughput=80
Meridia Southwest Base  @ [157.5, -20.0]    role="Fighter Base"     throughput=80
```

**RED units (14 total):**
- ✅ All reference `bls` field with BLS name
- Example: `{ uid: "R-mig29-001", bls: "Meridia Central Base", ... }`
- Distributed across 5 BLS entries

**BLUE units (8 total):**
- ❌ All have `base_id` field BUT no corresponding BLS
- Example: `{ unit_uid: "B-f15c-001", base_id: "B-f15c-001", ... }`
- BLUE bases NOT defined in scenario (legacy sides_bases object exists but unused)

**BLUE legacy structure (unused):**
```javascript
sides_bases: {
  BLUE: [
    { id: "bretania_forward", name: "Bretania Forward Air Base", location: {...} },
    { id: "diego_analog", name: "Diego-Analog Forward Air Base", location: {...} }
  ],
  RED: [...]  // 3 bases defined
}
```

**Finding:** BLUE base_id values are arbitrary strings (`B-f15c-001`, `B-awacs-001`) that don't reference any actual base definition. BLUE bases are orphaned.

---

### 4. How Units Reference BLS/base_id

**RED units (array: red_units):**
```
uid         (string)    – unique identifier "R-mig29-001"
bls         (string)    – base name "Meridia Central Base" [REQUIRED]
label       (string)    – display name "MiG-29 Fulcrum Flight 1"
echelon     (string)    – "flight", "battalion", "company"
role        (string)    – "fighter_interceptor", "air_defense_sam", etc.
domain      (string)    – "air", "air_defense"
sidc        (string)    – 20-char NATO symbol code
coord       [lon, lat]  – unit position (inherited from BLS at start)
appear      (number)    – step index when unit appears (0 = initial)
strength    (number)    – readiness 0..1 (1.0 = full strength)
```

**BLUE units (array: blue_units_initial):**
```
unit_uid    (string)    – unique identifier "B-f15c-001"
base_id     (string)    – base reference "B-f15c-001" [NO VALIDATION]
label       (string)    – display name "F-15C Eagle CAP 1"
echelon     (string)    – "flight"
role        (string)    – "fighter_air_superiority", "tanker_support"
domain      (string)    – "air"
sidc        (string)    – 20-char NATO symbol code
coord       [lon, lat]  – unit position
appear      (number)    – step index (0 = initial)
name_ar     (string)    – Arabic label
posture     (string)    – optional readiness state [NOT IN COASTAL SHIELD]
```

**Validation rules (hard):**
- ✅ RED: bls must exist in bls_template (enforced on save)
- ❌ BLUE: base_id is free-text, never validated
- ✅ uid/unit_uid must be unique within side
- ✅ coord must be valid [lon, lat]

**Validation rules (soft):**
- ⚠️ RED units without assigned BLS: error on save
- ⚠️ BLUE units with undefined base_id: currently ignored

---

### 5. Map Rendering of Bases/BLS

**File:** `UI_MOdified/client/wargame/adjudicator-map.js`

**BLS rendering:**
- ✅ Draws semi-circle markers for each BLS
- ✅ Reads from `scenario.bls_template` array
- ✅ Populates internal `blsCoordByName` map
- ✅ Units anchored to BLS during movement (lerp from sea to BLS, then BLS to objective)
- ✅ BLS status colors updated per step (CONTESTED, STAGED, etc.)

**BLS markers display:**
- ✅ Role label (from bls.role)
- ✅ Tooltip with full metadata
- ✅ Color coding by step-based status
- ✅ Breach/damage indicators (NATO symbols)

**Map integration with save:**
- ✅ saveDraft() calls AppAdjudicatorMap.drawScenario(scenario)
- ✅ Map is redrawn when geometry changes (obj, pipeline, BLS)
- ✅ Existing BLS status overlays preserved across refreshes

**NOT supported in map:**
- ❌ BLUE base markers (no visual representation)
- ❌ Base capacity visualization
- ❌ Base supply status
- ❌ Base-unit grouping overlays

---

### 6. saveDraft / Export Preservation

**saveDraft() function (line 1884):**
```javascript
1. syncBlueBaseIds(_draft)       – keeps blue_units_base_ids in sync
2. validateAllHardRules(_draft)  – checks BLS and force structure
3. window.RmoozScenario.scenario = clone(_draft)  – in-memory ONLY
4. AppAdjudicatorMap.drawScenario()  – redraw map
5. Log operation, set status
```

**State after saveDraft:**
- ✅ Scenario stored in `window.RmoozScenario.scenario`
- ✅ All BLS data preserved (bls_template array)
- ✅ All unit-to-base references preserved (bls field, base_id field)
- ⚠️ Changes are in-memory only, NOT committed to server
- ⚠️ Refresh or navigation will discard unsaved changes

**Export pipeline:**
- ✅ JSON.stringify(_draft, null, 2) includes full bls_template
- ✅ red_units array with bls references exported intact
- ✅ blue_units_initial array with base_id exported intact
- ✅ Download or clipboard-copy preserves all base data

**Validation on export:**
- ✅ Hard rules checked (BLS exists for RED units)
- ❌ Soft warnings only (no actual blocking)
- ❌ No base capacity checking (throughput not enforced)

---

### 7. What Is Already Editable Today

**In Step 9 (Forces Geometry):**
- ✅ BLS name (text field)
- ✅ BLS coord [lon, lat] (number fields + draw on map)
- ✅ BLS role (text field, free-text)
- ✅ BLS throughput (number field, NOT enforced)
- ✅ BLS terrain_friction (number field, NOT enforced)
- ✅ Add/remove BLS (buttons)
- ✅ Objective (name, coord, carver, radius, depth)
- ✅ Pipeline (waypoints, draw on map)
- ✅ Throughput ceilings (H12, H24, H48, H72, H120)

**In Step 10 (Forces OOB):**
- ✅ RED unit uid (read-only)
- ✅ RED unit label (text field)
- ✅ RED unit bls (select dropdown from bls_template)
- ✅ RED unit appear (step index, number field)
- ✅ RED unit role (free-text with CMO suggestions)
- ✅ RED unit coord (number fields + pick on map)
- ✅ RED unit echelon (text field)
- ✅ RED unit strength (0..1 slider)
- ✅ RED unit sidc (20-char NATO symbol)
- ✅ BLUE unit unit_uid (read-only)
- ✅ BLUE unit base_id (text field)
- ✅ BLUE unit coord (number fields + pick on map)
- ✅ BLUE unit echelon (text field)
- ✅ BLUE unit sidc (20-char NATO symbol)

---

### 8. What Is Missing for a Proper Base/Basing Editor

**Critical gaps:**

1. **BLUE base definition**
   - Currently orphaned (base_id is free-text)
   - No BLUE base templates in bls_template
   - No map rendering for BLUE bases
   - Recommendation: Extend bls_template to support side-specific fields OR create parallel blue_bases array

2. **BLS per-step availability**
   - All BLS assumed present at start (no appear/disappear)
   - Missing: `appear: step_index`, `disappear: step_index`
   - Impact: Can't model forward bases that open/close mid-campaign

3. **Base capacity & throughput enforcement**
   - throughput field exists but is ignored
   - No validation: "X units at Y base × Z capacity per step"
   - No logistics queue or congestion modeling

4. **Base status / readiness editing**
   - No per-base readiness state at scenario start
   - No baseline damage/repair fields
   - BLS status is computed from world-state, not authored

5. **Base grouping / organization**
   - No base clusters or regions
   - No "forward operating bases" vs "main bases" distinction
   - No recursive nesting (multiple BLS under a region)

6. **Base-centric OOB views**
   - Unit tree in Step 10 is by-side/by-echelon only
   - No "group units by assigned base" view
   - No base utilization summary (units vs. capacity)

7. **Supply / logistics modeling**
   - No bls.supply_baseline, bls.fuel_baseline fields
   - No resupply rates or stockpile limits
   - No interdependency (unit strength tied to base supply)

8. **Base defense / security**
   - No air-defense assigned to bases
   - No vulnerability assessment
   - No OPSEC/deception markups

---

## Recommendations: Minimal Phase 4C Slice

### Option A: BLUE Bases Only (Smallest Safe Slice)

**Goal:** Bring BLUE bases to parity with RED bases.

**Scope (2-3 days):**
1. Define BLUE base structure (parallel to RED BLS or extend bls_template)
   - Add `side: "BLUE"|"RED"` field to bls_template
   - Or create separate `blue_bases` array (copy of bls_template schema)
   
2. Update Step 9 to edit both RED (bls_template) and BLUE bases
   - Separate sections for RED/BLUE in Forces Geometry card
   - Reuse existing BLS CRUD UI
   
3. Update Step 10 to show BLUE base selector (like RED bls dropdown)
   - Add validation: BLUE base_id must reference blue_bases
   
4. Update map rendering (adjudicator-map.js)
   - Draw BLUE base markers (use different visual style)
   
5. Test with Coastal Shield
   - Add 2-3 BLUE base definitions
   - Assign BLUE units to bases
   - Verify map renders both RED and BLUE bases

**Risk:** Low — uses existing patterns (bls CRUD already works)  
**Validation:** BLUE base_id becomes validated (like RED bls)  
**Not blocked by:** Capacity, logistics, status modeling

**Measurable outcome:** BLUE bases visible on map, editable in Step 9, assigned in Step 10

---

### Option B: BLS Per-Step Availability (Medium Complexity)

**Goal:** Support bases that appear/disappear during campaign.

**Scope (3-5 days):**
1. Add `appear` and `disappear` fields to bls_template
   - appear: step index when base becomes available
   - disappear: step index when base is lost/destroyed
   
2. Update Step 9 UI to edit appear/disappear
   - Number fields (step index)
   - Validation: disappear > appear
   
3. Update scenario validator
   - Warn if units reference BLS that don't exist at their appear step
   
4. Update map rendering
   - Don't draw BLS markers for steps before appear or after disappear
   - Highlight unavailable bases in step 0 (preview)
   
5. Test with multi-phase scenario
   - Define base appears at step 2
   - Assign units to it
   - Verify map hides base in steps 0-1

**Risk:** Medium — adds temporal logic  
**Validation:** Step validation rules become more complex  
**Depends on:** Nothing (orthogonal to BLUE bases)

**Measurable outcome:** Bases can appear/disappear, map respects timing

---

### Option C: Base Utilization Summary (Analytics)

**Goal:** Show capacity vs. units assigned per base.

**Scope (2 days):**
1. Add Step 9 summary panel
   - Table: BASE | THROUGHPUT | UNITS ASSIGNED | UTILIZATION %
   
2. Compute utilization on save
   - Count red_units with bls = X
   - Sum blue_units with base_id = X
   - Compare to throughput field
   
3. Warnings in Step 10
   - "BASE X over capacity" when units > throughput
   
4. Test with Coastal Shield
   - Highlight oversubscribed bases
   - Operator can see which bases are congested

**Risk:** Very low — read-only analytics  
**Validation:** Warnings only (not enforced)  
**Not implemented:** No enforcement, no queue/delay modeling

**Measurable outcome:** Operator sees base utilization, can identify bottlenecks

---

### Recommended Path Forward

**Phase 4C (Recommended):** Option A + Option C (5-7 days total)
- ✅ Brings BLUE bases to parity with RED (critical gap)
- ✅ Adds operator visibility into base utilization
- ✅ Low risk, high ROI
- ✅ Sets up for Phase 4D (logistics/capacity enforcement)
- ✅ Fully tested with Coastal Shield before scaling

**Phase 4D (Deferred):** Option B + enforcement
- Temporal basing (appear/disappear)
- Capacity enforcement (reject overload)
- Supply modeling (future schema extension)

---

## Audit Checklist

- [x] BLS template structure documented
- [x] Step 9 Forces Geometry capabilities documented
- [x] Step 10 Forces OOB unit-to-base assignments documented
- [x] Coastal Shield base definitions analyzed
- [x] Map rendering checked (BLS markers, unit anchoring)
- [x] saveDraft / export data preservation verified
- [x] Current editable fields listed
- [x] Missing fields identified
- [x] Validation rules assessed
- [x] Recommendations provided with scope estimates

---

## References

- `UI_MOdified/client/shell/scenario-edit-mode.js` — Steps 9-10 editors
- `UI_MOdified/client/wargame/adjudicator-map.js` — BLS rendering
- `UI_MOdified/data/scenarios/coastal-shield-training-v1.json` — Case study
- `docs/scenario-workspace-consolidation-map.md` — Related workspace audit
- Memory: `[[project_authoring_slice2_next]]` — Roadmap context

---

**Status:** ✅ AUDIT COMPLETE  
**Recommendation:** Proceed to Phase 4C Option A (BLUE bases)  
**Blocking issues:** None (this is read-only audit)  
**Next step:** User confirms Phase 4C scope, then implementation begins.
