# Phase 4A — Objective Placement Editor: Audit Report

**Date:** 2026-06-04  
**Status:** Pre-implementation audit  
**Focus:** Current objective handling in RMOOZ

---

## Executive Summary

RMOOZ has a **foundation for objective editing** but **no active editor UI**:

- ✅ **Schema exists** — `scenario-authoring-schema.js` defines objectives as required array
- ✅ **Coastal Shield has 4 objectives** — All properly structured with id, name, owner, location, defenses
- 🔴 **No Edit Mode Step for objectives** — Steps 1-4 cover Metadata, Region, Sides, Postures only
- 🔴 **No objective editor UI** — No card/panel to edit objectives in Edit Mode
- ✅ **Save/Export ready** — Objectives in `window.RmoozScenario.scenario.objectives` export cleanly

---

## Audit Findings

### 1. Objective Schema (scenario-authoring-schema.js)

**Current State:**
```javascript
// Line 49: Objectives defined as REQUIRED + EMPTY collection
{ key: 'objectives', label: 'Objectives', importance: 'required', defaultKind: 'empty', gapEligible: true }

// Line 145: Default template includes empty array
objectives: []

// Line 75: Recognition function for raw scenarios
case 'objectives': return nonEmptyArr(scenario.objectives) || nonEmptyObj(scenario.obj);
```

**Finding:** ✅ Schema supports objectives. Recognizes both `scenario.objectives` array and `scenario.obj` (legacy).

### 2. Coastal Shield Objective Structure

**Coastal Shield provides:**
```javascript
"objectives": [
  {
    "id": "NORD",
    "name": "Meridian North Power Station",
    "owner": "RED",
    "type": "strategic_facility",
    "location": { "lat": -16.2, "lon": 159.5 },
    "description": "Strategic dual-use power generation facility, 8 years old. Regional infrastructure hub.",
    "damage_threshold_percent": 60,
    "defenses": { "aaa_count": 45, "sam_count": 4 },
    "constraints": ["Do NOT damage civilian power distribution grid"],
    "difficulty_rating": "HIGH",
    "value": "High (regional dominance infrastructure)"
  },
  // ... 3 more (EAST, CENT, SOUT)
]
```

**Finding:** ✅ **Realistic objective structure** with all needed fields for editing:
- id (unique identifier)
- name (English label)
- owner (side: RED in this case)
- type (category: strategic_facility)
- location (coordinates: lat/lon)
- difficulty_rating (priority indicator)
- defenses (AAA + SAM counts)
- constraints (ROE/collateral rules)
- value (importance to side)

### 3. Current Edit Mode Coverage

**Edit Mode Slice 1 (Live in code):**
- ✅ Step 1: Metadata (scenario name, year, theater)
- ✅ Step 2: Region/AO (map bounding box, geometry)
- ✅ Step 3: Sides (define BLUE/RED/NEUTRAL with colors/names)
- ✅ Step 4: Postures (relationship matrix: FRIENDLY/HOSTILE/NEUTRAL)

**NOT in Edit Mode:**
- 🔴 Step 5+: Objectives (no editor, no card, no panel)
- 🔴 Units/Forces (planned Phase 4B)
- 🔴 Doctrine/ROE (planned Phase 8)

**Finding:** Objectives are a **gap in the current UI**. No Edit Mode step exists.

### 4. Scenario Workspace Rendering (scenario-workspace.js)

**Current Map Rendering:**
- ✅ Objectives **are rendered on map** from `window.RmoozScenario.scenario.objectives`
- ✅ Symbols appear as markers/icons with names
- ✅ Clicking objective shows read-only evidence panel (objective-evidence-panel.js)

**Finding:** ✅ **Map rendering is ready**. Objectives already appear on map in review mode.

### 5. Save/Export Behavior

**saveDraft() function (scenario-edit-mode.js):**
- Currently saves: metadata, sides, postures
- Saves to: `window.RmoozScenario.scenario`

**exportScenario() function:**
- Exports full scenario including objectives
- Output: JSON with all fields

**Finding:** ✅ **Save/export framework is ready**. Adding objectives to saveDraft() will work.

### 6. Validation Logic

**Current validation in Edit Mode:**
- ✅ Metadata validation (name required, year as number)
- ✅ Sides validation (at least 2 sides, name_en required)
- ✅ Postures validation (matrix completeness)
- 🔴 **No objective validation** (no step exists yet)

**Finding:** Need to add objective-specific validation:
- Require: id, name, owner (side), location (lat/lon)
- Validate: id uniqueness, owner in defined sides

---

## What Needs to Be Built (Phase 4A)

### New Edit Mode Step: Step 5 — Objectives

**UI Components:**
1. **Objective List Card** — Table/list of all 4 objectives
   - Columns: id, name, owner, type, difficulty, actions
   - Add/Remove buttons (if safe)

2. **Objective Detail Editor** — Form for selected objective
   - name (text input, required)
   - owner/side (select from defined sides)
   - type/category (text input or select)
   - location (coordinate display + "pick on map" button)
   - difficulty_rating (select: HIGH, MEDIUM_HIGH, MEDIUM, etc.)
   - constraints (textarea for collateral damage notes)
   - value/importance (text)
   - notes (textarea)

3. **Validation Messages**
   - Red hints for required fields
   - "Objective 'NORD' requires a name"
   - "Owner must be one of: BLUE, RED, NEUTRAL"

4. **Map Integration**
   - "Pick on map" button → click map to set lat/lon
   - Objectives render with updated values

### Acceptance Criteria for Phase 4A

1. ✅ Coastal Shield loads with 4 objectives visible
2. ✅ Objective editor shows all 4 objectives in a list
3. ✅ Clicking an objective opens detail editor
4. ✅ Editing name/owner/location saves to draft
5. ✅ Save Draft updates `window.RmoozScenario.scenario.objectives`
6. ✅ Export includes edited objectives
7. ✅ Map still renders objectives without crash
8. ✅ Quick Demo/Start New/Load/Resume still work
9. ✅ Back/direct /app.html remain safe
10. ✅ No console errors

---

## Implementation Roadmap

### Files to Create:
- `client/shell/objectives-editor-step.js` — Step 5 UI component (new)

### Files to Modify:
- `scenario-edit-mode.js` — Add Step 5 objective editor to step carousel
- `app.html` — Add CSS classes for objective editor inputs/hints

### Files to Avoid Touching:
- `scenario-workspace.js` (objective rendering already works)
- `objective-evidence-panel.js` (review-mode only)
- `scenario-authoring-schema.js` (schema already correct)

---

## Risk & Constraints

### Safe to Implement:
- ✅ Edit Mode already has a step system (Steps 1-4)
- ✅ saveDraft() already updates `window.RmoozScenario.scenario`
- ✅ Objectives array already exports correctly
- ✅ Map rendering works with objectives

### Constraints:
- 🔴 **No adding/removing objectives yet** — Keep the fixed 4 from Coastal Shield during this phase
- 🔴 **No coordinates picking yet** — Display but don't save manual coordinate entry
- 🔴 **No SAM/AAA engagement logic** — Just show the fields, don't compute coverage

---

## Next Steps (Phase 4A Implementation)

1. **Create objectives-editor-step.js** — New Step 5 component
2. **Integrate into scenario-edit-mode.js** — Add to step carousel
3. **Add CSS to app.html** — Input styling
4. **Test with Coastal Shield** — Verify all 4 objectives load and edit
5. **Verify regression** — Quick Demo, Start New, Load, Resume work

---

**Audit Completed:** 2026-06-04  
**Readiness:** ✅ Ready to begin Phase 4A implementation  
**Estimated Phase 4A Duration:** 2-3 weeks (baseline objective editor without advanced features)
