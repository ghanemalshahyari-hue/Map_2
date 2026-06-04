# Phase 4B — Unit Composition Editor: Audit Report

**Date:** 2026-06-04  
**Status:** Pre-implementation audit  
**Focus:** Existing unit/forces authoring support and composition needs

---

## Executive Summary

RMOOZ **already has a comprehensive Forces (OOB) editor** in Step 8 of Edit Mode that allows full unit management (add/remove/edit). However:

- ✅ **Step 8 Forces Editor is feature-complete** for unit placement, properties, and basic hierarchy
- 🔴 **Coastal Shield has NO units** (only base/airfield descriptions in sides_bases)
- 🟡 **Unit composition (force structure, unit types, loadouts) is not yet authored** in Edit Mode
- 🟡 **Unit type library / templates do not exist** in RMOOZ
- ⏸️ **Phase 4B scope should focus on Coastal Shield unit authoring**, not rebuilding Forces editor

---

## Audit Findings

### 1. Existing Force/Unit Editor Code (scenario-edit-mode.js)

**Status:** ✅ COMPLETE AND FUNCTIONAL

#### Step 7: Forces Geometry Card (renderGeometryCard, lines 527-653)
- **Purpose:** Define force infrastructure and planning geometry
- **Features:**
  - Objective (obj) editor: name, coordinates, target_depth, carver, radius
  - Pipeline waypoint management: draw/edit line segments on map
  - Throughput ceiling ceilings (H12, H24, H48, H72, H120)
  - **BLS (Base Location Set) template management:**
    - Add/remove BLS entries
    - Per-BLS fields: name, coordinates, role, throughput, terrain_friction
    - Pick-on-map for BLS coordinates
    - BLS removal validates red_units references

#### Step 8: Forces (OOB) Card (renderForcesCard, lines 943-1242)
- **Purpose:** Full unit order-of-battle authoring and management
- **Architecture:**
  - Toolbar: search filter, add Red unit, add Blue unit, unit counts
  - Tree pane: hierarchical view (side → echelon → unit rows)
  - Detail pane: full unit editor form
  - Dynamic re-rendering on each mutation
- **Capabilities:**
  - **Add units:** Auto-generates next free UID (RED-1, RED-2, ... or BLUE-1, ...)
  - **Remove units:** Confirmation dialog, array splice
  - **Search/filter:** Real-time filter by uid, label, role, bls
  - **Hierarchical grouping:** By side (BLUE/RED), then by echelon (division, brigade, battalion, ...)
  - **Collapse/expand:** State tracked in `_collapsedForcesGroups` Set
  - **Pick-on-map:** Click map to set unit coordinates
  - **Unit properties:**
    - **Red units:** uid (RO), label, bls, appear (step), role (datalist), coordinates, echelon, strength, sidc
    - **Blue units:** unit_uid (RO), base_id, coordinates, echelon, sidc
  - **Red unit roles:** Datalist suggestions from CMO maneuver roles (Main effort, Fixing, Support, External envelopment, Follow-on, Exploitation, Recon)

#### Validation (validateForcesHardRules, lines 155-199)
- Checks **red_units:**
  - uid must be non-empty and unique
  - bls must reference existing BLS name
  - appear must be within [0, steps.length-1]
  - Must be object (not null/undefined)
- Checks **blue_units_initial:**
  - unit_uid must be non-empty and unique
  - Must be object (not null/undefined)
- Returns structured error list

#### Helper Functions
- **nextFreeUid(prefix, list, key):** Generate BLUE-1, RED-1, etc.
- **groupByEchelon(units):** Organize flat unit array by echelon hierarchy
- **unitMatchesFilter(unit, filter):** Full-text search across uid, label, role, bls
- **buildMiniSymbolHtml(sidc, side):** Render SIDC symbol using milsymbol lib
- **_beginPickOnMap / _cancelPickOnMap:** Coordinate picking interaction
- **_selectUnit / _clearSelection:** Track selected unit for detail pane
- **syncBlueBaseIds(d):** Keep blue_units_base_ids parallel array in sync

---

### 2. Unit Schema (scenario-authoring-schema.js)

**Status:** ✅ SCHEMA EXISTS, MINIMAL DEFAULTS

#### Schema Definition (Line 47)
```javascript
{ key: 'units', label: 'Units (order of battle)', 
  importance: 'required', defaultKind: 'empty', gapEligible: true }
```

#### Template (Line 143)
```javascript
units: [],
orbat: { roots: [], note: V.MANUAL_REQUIRED },
```

#### Recognition (Line 73)
```javascript
case 'units': return nonEmptyArr(scenario.units) || 
                     nonEmptyArr(scenario.red_units) || 
                     nonEmptyArr(scenario.blue_units_initial);
```

**Finding:** Schema recognizes three unit storage formats:
- `units[]` (generic, not currently used)
- `red_units[]` (actual format used by Forces editor)
- `blue_units_initial[]` (actual format used by Forces editor)

---

### 3. Unit Representation in Coastal Shield

**Status:** 🔴 NO UNITS, ONLY BASE DESCRIPTIONS

#### What Coastal Shield Has
- **sides_bases.BLUE:** 2 bases (Bretania Forward, Diego-Analog Remote)
  - Fields: id, name, location (lat/lon), type, description, capacity_aircraft, runway_length, fuel_storage, munitions_storage
- **sides_bases.RED:** 5 bases (Meridia North, East, Central, Northwest, Southwest)
  - Fields: id, name, location, type, aircraft_based, aircraft_count, runway_length, readiness
- **No red_units or blue_units_initial arrays**
- **No unit-level composition** (e.g., squadrons, flights, individual aircraft)

#### Implication
Coastal Shield is base-centric, not unit-centric. To author Coastal Shield units, Phase 4B must:
1. Add red_units and blue_units_initial arrays
2. Define unit structure per base/airfield
3. Populate with realistic force composition (fighters, support, transport, etc.)

---

### 4. Unit Representation in wargame3 (Native Scenario)

**Status:** ✅ FULLY POPULATED

#### red_units Array
- **Count:** 100+ units (from audit earlier: ground, air, maritime, support)
- **Sample unit (R-d2-4-004):**
  ```javascript
  {
    "uid": "R-d2-4-004",                    // Unique ID (required, immutable)
    "label": "فرقة المشاة الآلية 4...",      // Display name (editable)
    "echelon": "division",                  // Hierarchy level (editable)
    "role": "mech_inf_div",                 // Unit type/purpose (editable)
    "domain": "ground",                     // ground|air|maritime|space (editable)
    "bls": "BLS-1",                         // Base Location Set reference (editable)
    "sidc": "10061000211211020000",         // Military symbol code (editable)
    "coord": [18, 32],                      // Placement (editable, map-pickable)
    "name_ar": "فرقة المشاة الآلية  4...",  // Arabic label (optional, editable)
    "appear": 0                             // Step index when unit appears (editable)
  }
  ```

#### blue_units_initial Array
- **Count:** 70+ units
- **Sample unit (B-d1-51-001):**
  ```javascript
  {
    "unit_uid": "B-d1-51-001",              // Unique ID (required, immutable)
    "base_id": "B-d1-51-001",               // Base assignment (editable)
    "label": "لواء المشاة الآلي 51",        // Display name (editable)
    "role": "mech_brigade",                 // Unit type (editable)
    "domain": "ground",                     // Domain (editable)
    "echelon": "brigade",                   // Hierarchy (editable)
    "sidc": "10031000181211020000",         // Symbol code (editable)
    "coord": [19.59, 30.11],                // Position (editable, map-pickable)
    "posture": null,                        // Doctrinal posture (reserved field)
    "name_ar": "لواء المشاة الآلي 51",      // Arabic label (optional, editable)
    "appear": 0                             // Step index (editable)
  }
  ```

#### Hierarchy Example
- Division (R-d2-4-004)
  - Brigade (R-d3-41-005, R-d3-42-006, R-d3-44-007, ...)
    - Battalion (implied in label or separate entries)
    - Companies, platoons (not modeled as separate units)

---

### 5. Map Rendering of Units (scenario-workspace.js)

**Status:** ✅ UNITS RENDER CORRECTLY

#### Rendering Pipeline
1. **Input:** `scenario.blue_units_initial` + `scenario.red_units`
2. **Processing:**
   - Build symbol markers for each unit (SIDC-based using milsymbol)
   - Place on map at unit.coord [lon, lat]
   - Apply color: BLUE units → blue, RED units → red
   - Optional: Show echelon indicators, role labels
3. **Output:** Leaflet markers on map
4. **Interaction:** Click unit marker → show unit properties panel (read-only in review mode)

#### Code Sections
- Lines 347-420: Scenario overview calculation (unit counts, has_units check)
- Lines 1247-1260: Unit enumeration for export/validation
- Lines 4031-4107: Validation checks for unit arrays and individual unit fields

#### Evidence of Live Rendering
- wargame3 loads with 173 units visible on map (documented in scenario description)
- Each unit appears as a symbol at its coordinate
- Unit colors and symbols distinguish by SIDC code

---

### 6. saveDraft() and Export Behavior

**Status:** ✅ UNITS PRESERVED CORRECTLY

#### saveDraft() for Units (scenario-edit-mode.js, line 1844)
1. Calls **syncBlueBaseIds()** to keep blue_units_base_ids parallel array in sync
2. Validates forces with **validateForcesHardRules()**
3. Persists mutated red_units and blue_units_initial to `window.RmoozScenario.scenario`
4. Redraws map with **AppAdjudicatorMap.drawScenario()**

#### Export Behavior
- Full scenario exported as JSON including:
  ```javascript
  {
    "red_units": [...],        // All mutations preserved
    "blue_units_initial": [...],
    "blue_units_base_ids": [...],  // Auto-synced parallel array
    // ... other scenario data
  }
  ```

#### Coastal Shield Export
- Currently exports empty units arrays (no units to export)
- Would export new units once authored

---

### 7. Existing Steps Covering Forces

**Status:** ✅ TWO STEPS DEDICATED TO FORCES

| Step | ID | Title | Purpose | Editable |
|------|----|----|---------|----------|
| 7 | `geom` | Forces Geometry | BLS template, pipeline, throughput | ✅ |
| 8 | `forces` | Forces (OOB) | Individual unit add/remove/edit | ✅ |

**Not yet in Edit Mode (Review Mode only):**
- Unit type library
- Force structure templates
- Loadout composition
- Weapons/munitions
- Logistics state

---

### 8. Validation: validateForcesHardRules()

**Status:** ✅ COMPREHENSIVE FOR BASIC CONSTRAINTS

#### What It Validates
1. **BLS references:** Each red_unit.bls must match a defined BLS name
2. **Appear step:** Unit appear index must be valid [0, steps.length-1]
3. **UID uniqueness:** Within red_units and blue_units_initial separately
4. **UID non-empty:** No empty or whitespace-only UIDs
5. **Object structure:** Each unit must be an object (not null)

#### What It Does NOT Validate
- ❌ Unit type validity (role field is free-text in RED units, datalist suggestion only)
- ❌ SIDC code correctness
- ❌ Coordinates bounds (0,0 is allowed)
- ❌ Domain field validity (no enum check)
- ❌ Echelon consistency (hierarchy not enforced)
- ❌ Force composition reasonableness (e.g., ratio of air-to-ground units)
- ❌ Loadout/weapons validity (not modeled)

---

## What's Missing for a Proper Unit Composition Editor (Phase 4B)

### 1. ❌ Unit Type Library / Templates

**Currently Missing:**
- No pre-defined unit types (fighter, transport, tank, SAM, etc.)
- No loadout templates (fighters with different munition loads)
- No role standardization (red_units.role is free-text only)

**What Phase 4B Could Add:**
- Dropdown of common unit types (mapped to SIDC codes)
- Quick-add buttons: "Add F-16 squadron", "Add SAM battalion", etc.
- Role suggestions beyond CMO 7 maneuver roles

### 2. ❌ Force Composition Guidance

**Currently Missing:**
- No force structure templates (e.g., "typical division" = 1 div HQ + 3 brigades + support)
- No composition realism checks (warnings if force is unbalanced)
- No rapid bulk-add workflow

**What Phase 4B Could Add:**
- Pre-built force templates (e.g., "Soviet Motor-Rifle Division", "US Strike Group")
- Bulk add: "Add X squads of fighters at base Y"
- Composition wizard: Build unit structure hierarchically

### 3. ❌ Loadout / Weapons Composition

**Currently Missing:**
- No per-unit loadout definition (ammo, fuel, payload)
- No per-aircraft configuration (clean, with tanks, with bombs, etc.)
- Strength field exists but is dimensionless

**What Phase 4B Could Add:**
- Per-unit loadout editor (select weapons, ordnance, fuel tanks)
- Loadout library (pre-configured packages)
- Strength becomes ammunition/fuel count (not just 0..1 percentage)

### 4. ❌ Unit Type Validation

**Currently Missing:**
- Free-text role field (no validation)
- No domain/type consistency check
- SIDC code not auto-populated or validated

**What Phase 4B Could Add:**
- Role enum or searchable list (instead of free-text)
- SIDC auto-generation from unit type + side
- Validation that role matches domain (e.g., "mech_inf_div" → domain:ground)

### 5. ❌ Coastal Shield Unit Authoring

**Currently Missing:**
- Coastal Shield has no red_units or blue_units_initial
- Only base descriptions (sides_bases), no actual units

**What Phase 4B Must Do:**
- Author realistic unit composition for Coastal Shield
- Define BLUE force: fighters, support, transports from 2 bases
- Define RED force: interceptors, air defense, transport from 5 bases
- Create unit-to-base assignments

---

## Recommended Phase 4B Scope (Minimal Safe Slice)

### Phase 4B-1: Coastal Shield Unit Authoring (PRIORITY)

**Goal:** Add units to Coastal Shield scenario (prepare it for execution)

**In Scope:**
1. ✅ **Manually author red_units and blue_units_initial** using existing Step 8 Forces editor
   - Define realistic air defense fighters (MiG-29, F-4, F-5) based on sides_bases.RED
   - Define BLUE strike package (F-15C, F-16, KC-135 tanker, AWACS) based on sides_bases.BLUE
   - 40-60 units per side (typical for regional air campaign)
2. ✅ **Create unit-to-base assignments** via BLS and base_id fields
3. ✅ **Set up realistic unit hierarchy** (echelon: division→brigade→squadron)
4. ✅ **Configure SIDC codes** for proper symbology
5. ✅ **Test map rendering** of units on Coastal Shield scenario

**Out of Scope:**
- 🔴 Unit type library
- 🔴 Force composition templates
- 🔴 Loadout editor
- 🔴 Role validation / SIDC auto-generation
- 🔴 Bulk add / wizard workflows
- 🔴 New Edit Mode step (use existing Step 8)

**Deliverable:**
- Coastal Shield scenario with 40-60 units per side
- Units render on map correctly
- All validation passes
- Scenario ready for Phase 5 (Air Defense) development

---

### Phase 4B-2: Unit Type Library & Templates (FOLLOW-ON)

**Goal:** Provide reusable unit templates to reduce manual authoring burden

**In Scope (later):**
1. Build unit type library (100+ pre-configured unit templates)
2. Create force composition templates (division, battalion, squadron, etc.)
3. Add quick-add UI in Step 8 (dropdown of common units)
4. Add SIDC auto-generation from unit type

**Out of Scope:**
- Loadout composition (Phase 5)
- Advanced validation (Phase 5+)

---

## Risk & Constraints

### Safe to Do in Phase 4B-1:
- ✅ Use existing Step 8 Forces editor (no new code)
- ✅ Manually define units in Coastal Shield JSON (pure data)
- ✅ Test with existing validation

### Constraints:
- 🟡 **Manual authoring is tedious** (no templates yet)
- 🟡 **Unit type validation is loose** (role is free-text)
- 🟡 **SIDC codes must be hand-entered or copy-pasted from wargame3**
- 🟡 **No force composition realism checks** (no warnings for unbalanced forces)

### Blocks to Later Phases:
- ❌ Don't add loadout editor yet (Phase 5 scope)
- ❌ Don't build unit type library yet (separate from Phase 4B-1)
- ❌ Don't auto-generate SIDC (Phase 4B-2 scope)

---

## Key Code Locations

| Asset | Location | Status | Purpose |
|-------|----------|--------|---------|
| Forces editor UI | `scenario-edit-mode.js:943-1242` | ✅ Live | Unit add/remove/edit |
| Forces validation | `scenario-edit-mode.js:155-199` | ✅ Live | Hard rules for units |
| Unit schema | `scenario-authoring-schema.js:47` | ✅ Live | Schema definition |
| Map rendering | `scenario-workspace.js:347-420, 1247-1260` | ✅ Live | Unit symbols on map |
| Step 8 definition | `scenario-edit-mode.js:1519` | ✅ Live | STEPS array entry |
| Coastal Shield data | `data/scenarios/coastal-shield-training-v1.json` | ⏳ Needs units | Test fixture |

---

## Recommendation

### ✅ Proceed to Phase 4B-1: Coastal Shield Unit Authoring

**Rationale:**
1. **No new code required** — existing Step 8 Forces editor is feature-complete
2. **Minimal data work** — manually add 40-60 units to Coastal Shield JSON
3. **Validation ready** — existing validateForcesHardRules covers basic constraints
4. **Map rendering ready** — scenario-workspace.js will render units correctly
5. **Unblocks Phase 5** — Air Defense modeling needs units to place SAM/AAA

**Estimated Duration:** 3-5 days
- 1 day: Design realistic unit composition (which aircraft, how many, where)
- 1 day: Manually populate red_units (40 units)
- 1 day: Manually populate blue_units_initial (30 units)
- 1 day: Assign to BLS/bases, configure SIDC codes
- 1 day: Test on map, validate, document lessons learned

**Success Criteria:**
1. ✅ Coastal Shield loads with 40-60 units per side
2. ✅ All units visible on map with correct colors/symbols
3. ✅ Step 8 Forces editor can modify all units
4. ✅ saveDraft() preserves all unit edits
5. ✅ Export includes valid units array
6. ✅ No validation errors in console
7. ✅ No regressions to existing scenarios (wargame3, demo)

### ⏸️ Defer Phase 4B-2: Unit Library & Templates

**Timing:** After Phase 4B-1 completes and Coastal Shield unit authoring patterns are documented

**Rationale:**
- Phase 4B-1 data work will reveal repeating unit patterns (e.g., "SAM battalion" template)
- Can build library informed by Coastal Shield design decisions
- Reduces speculative API design; build after observing real use

---

## Appendix: Unit Field Reference

### red_units[] Field Definitions

| Field | Type | Required | Editable | Purpose | Example |
|-------|------|----------|----------|---------|---------|
| uid | string | ✅ | ❌ | Unique ID (immutable) | "R-d2-4-004" |
| label | string | ❌ | ✅ | Display name (EN/AR) | "Mech Infantry Division 4" |
| echelon | string | ❌ | ✅ | Hierarchy: division/brigade/battalion/company/squad | "division" |
| role | string | ❌ | ✅ | Unit type (CMO 7: Main effort, Fixing, Support, ..., or free-text) | "mech_inf_div" |
| domain | string | ❌ | ✅ | ground\|air\|maritime\|space | "ground" |
| bls | string | ❌ | ✅ | Reference to BLS template name | "BLS-1" |
| sidc | string | ❌ | ✅ | NATO APP-6(C) symbol code (20 chars) | "10061000211211020000" |
| coord | [lon, lat] | ❌ | ✅ | Position (map-pickable) | [18, 32] |
| name_ar | string | ❌ | ✅ | Arabic label (optional) | "فرقة المشاة الآلية 4" |
| appear | integer | ❌ | ✅ | Step index [0, steps.length-1] | 0 |
| strength | number | ❌ | ✅ | Readiness/availability [0..1] | 1.0 |
| *NOT YET* | | | | **Future fields (not yet modeled):** | |
| loadout | object | ❌ | ❌ | Weapons/ammunition (Phase 5) | TBD |
| fuel_state | number | ❌ | ❌ | Fuel remaining (Phase 6) | TBD |
| damage_state | number | ❌ | ❌ | Combat effectiveness (Phase 6) | TBD |

### blue_units_initial[] Field Definitions

| Field | Type | Required | Editable | Purpose | Example |
|-------|------|----------|----------|---------|---------|
| unit_uid | string | ✅ | ❌ | Unique ID (immutable) | "B-d1-51-001" |
| base_id | string | ❌ | ✅ | Base assignment (typically = unit_uid) | "B-d1-51-001" |
| label | string | ❌ | ✅ | Display name (EN/AR) | "Mech Brigade 51" |
| role | string | ❌ | ✅ | Unit type (free-text for BLUE) | "mech_brigade" |
| domain | string | ❌ | ✅ | ground\|air\|maritime\|space | "ground" |
| echelon | string | ❌ | ✅ | Hierarchy | "brigade" |
| sidc | string | ❌ | ✅ | NATO symbol code | "10031000181211020000" |
| coord | [lon, lat] | ❌ | ✅ | Position | [19.59, 30.11] |
| posture | null/string | ❌ | ✅ | Doctrinal posture (reserved, not yet used) | null |
| name_ar | string | ❌ | ✅ | Arabic label | "لواء المشاة الآلي 51" |
| appear | integer | ❌ | ✅ | Step index | 0 |
| *NOT YET* | | | | **Future:** | |
| fuel_state | number | ❌ | ❌ | Fuel remaining (Phase 6) | TBD |
| readiness_state | string | ❌ | ❌ | Available/degraded/damaged (Phase 6) | TBD |

---

**Audit Completed:** 2026-06-04  
**Readiness:** ✅ Ready for Phase 4B-1 (Coastal Shield unit authoring)  
**Next:** Phase 4B-1 — Manual unit composition for Coastal Shield (data work, no new code)

