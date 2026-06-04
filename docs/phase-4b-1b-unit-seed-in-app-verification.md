# Phase 4B-1B — Coastal Shield Unit Seed: In-App Verification Report

**Date:** 2026-06-04  
**Status:** ⏳ OFFLINE VERIFICATION COMPLETE; IN-APP TESTING PENDING SERVER RESTART  
**Commit:** `db16812` — Units added, `292749c` — Verification audit

---

## Overview

Phase 4B-1B testing validates the 22-unit Coastal Shield seed inside the RMOOZ app using the existing Step 8 Forces/OOB editor. Testing is **READY TO EXECUTE** after server restart but **BLOCKED by server cache** (preview server loaded old scenario version before units were added).

**Test Status:**
- ✅ **Offline verification:** Units present in file, JSON valid, schema compatible
- ⏳ **In-app testing:** Requires server restart (npm run serve or node server/web-server.js)
- ✅ **Test suite prepared:** 16 test cases documented below

---

## Pre-Test Verification (Offline — COMPLETED)

### Unit Presence in File

**✅ VERIFIED: Units are in the Coastal Shield JSON**

```
File: UI_MOdified/data/scenarios/coastal-shield-training-v1.json
- RED units: 14 (R-mig29-001 through R-radar-001)
- BLUE units: 8 (B-f15c-001 through B-kc135-002)
- BLS template: 5 (Meridia North/East/Central/Northwest/Southwest Bases)
- Total units: 22
```

**First unit verification:**
- RED: `R-mig29-001` (MiG-29 Fulcrum Flight 1)
- BLUE: `B-f15c-001` (F-15C Eagle CAP 1)

### Schema Validation

**✅ VERIFIED: All fields match Step 8 editor expectations**

Red units have fields:
- uid, label, echelon, role, domain, bls, sidc, coord, name_ar, appear, strength

Blue units have fields:
- unit_uid, base_id, label, role, domain, echelon, sidc, coord, posture, name_ar, appear

BLS template has fields:
- name, coord, role, throughput, terrain_friction

### File Integrity

**✅ VERIFIED: JSON syntax valid, data complete**

```
RED units: 14 ✓
BLUE units: 8 ✓
BLS templates: 5 ✓
UID uniqueness: All 22 UIDs unique ✓
Coordinates valid: All within map bounds ✓
SIDC codes present: All have 20-char codes ✓
```

---

## In-App Testing Plan

### Prerequisites

**BEFORE STARTING:** Server must be restarted to clear cache

```bash
# Option 1: Using npm
cd UI_MOdified && npm run serve

# Option 2: Direct node
cd UI_MOdified && node server/web-server.js

# Option 3: Using tile server
npm run app  # starts both web-server.js and tile-server.js
```

Navigate to: `http://localhost:8000/app.html`

### Test Cases (16 Total)

#### Test 1-5: Load and Display

**Test 1: Load Coastal Shield**
- [ ] Navigate to `/app.html?launch=load&scenario=coastal-shield-training-v1`
- [ ] Verify scenario loads without error
- [ ] Check window.RmoozScenario.scenario has units

**Test 2: Open Edit Mode**
- [ ] Click "Edit mode / تحرير" button
- [ ] Verify Edit Mode UI appears
- [ ] Confirm step carousel is visible

**Test 3: Navigate to Step 8 Forces/OOB**
- [ ] Click Step 8 in carousel (forces id)
- [ ] Verify Forces card loads
- [ ] Confirm tree and detail panes render

**Test 4: Verify BLUE Units Appear**
- [ ] Confirm tree shows BLUE side group
- [ ] Count 8 BLUE units visible
- [ ] Check grouping by echelon (all "flight" in this seed)
- [ ] Verify units show: B-f15c-001, B-f15c-002, B-f16-001, B-f16-002, B-kc135-001, B-awacs-001, B-b52-001, B-kc135-002

**Test 5: Verify RED Units Appear**
- [ ] Confirm tree shows RED side group  
- [ ] Count 14 RED units visible
- [ ] Check grouping by echelon (flights, battalion, company, detachment)
- [ ] Verify units organized as:
  - Flights: R-mig29-001, R-mig29-002, R-f4-001, R-f4-002, R-f5-001, R-f5-002, R-mig29-003, R-f5-003
  - Battalion: R-sam-001, R-sam-002, R-sam-003
  - Company: R-aaa-001, R-aaa-002
  - Detachment: R-radar-001

#### Test 6-11: Unit Types and Detail Panes

**Test 6: Select Fighter (BLUE F-15C)**
- [ ] Click B-f15c-001 in tree
- [ ] Verify detail pane loads
- [ ] Check fields: unit_uid (RO), base_id, label, role (fighter_air_superiority), domain (air), echelon (flight), sidc, coord, posture

**Test 7: Select Strike Aircraft (BLUE F-16)**
- [ ] Click B-f16-001
- [ ] Verify role = attack_fighter
- [ ] Confirm all fields editable

**Test 8: Select Tanker (BLUE KC-135)**
- [ ] Click B-kc135-001
- [ ] Verify role = tanker_support
- [ ] Confirm domain = air

**Test 9: Select AWACS (BLUE E-3)**
- [ ] Click B-awacs-001
- [ ] Verify role = early_warning_control
- [ ] Confirm label mentions AWACS

**Test 10: Select Bomber (BLUE B-52)**
- [ ] Click B-b52-001
- [ ] Verify role = heavy_bomber
- [ ] Confirm label mentions Stratofortress

**Test 11: Select SAM System (RED S-300)**
- [ ] Click R-sam-001 in tree
- [ ] Verify detail pane shows: uid (RO), label, echelon (battalion), role (air_defense_sam), domain (air_defense), bls, sidc, coord, strength
- [ ] Confirm role indicates air defense

#### Test 12-14: Edit and Persist

**Test 12: Edit BLUE Unit Label**
- [ ] Select B-f15c-001
- [ ] Change label from "F-15C Eagle CAP 1" to "Eagle Flight Alpha"
- [ ] Click Save Draft (or press Enter in text field)
- [ ] Verify "saved in-memory" or status message appears
- [ ] Click B-f15c-001 again
- [ ] Confirm label change persisted in detail pane

**Test 13: Edit RED SAM Coordinates**
- [ ] Select R-sam-001
- [ ] Change coord.lon from -19.05 to -19.1
- [ ] Change coord.lat from 160.55 to 160.6
- [ ] Save Draft
- [ ] Verify coordinates display updated values

**Test 14: Edit RED AAA Strength**
- [ ] Select R-aaa-001
- [ ] Change strength from 0.7 to 0.8
- [ ] Save Draft
- [ ] Verify strength field shows new value on re-select

#### Test 15: Map Rendering and Export

**Test 15: Map Rendering**
- [ ] Close Edit Mode or switch to review mode
- [ ] Zoom to Coastal Shield map area (approx -16 to -21 lat, 155 to 165 lon)
- [ ] Look for unit symbols on map
- [ ] Expected: BLUE units should render as blue symbols, RED as red
- [ ] Verify no console errors or rendering crashes
- [ ] Note: Units should appear at assigned coordinates

**Test 16: Export and Persistence**
- [ ] In Edit Mode or from workspace, click Export Scenario
- [ ] Save exported JSON
- [ ] Open JSON in editor
- [ ] Search for "red_units"
- [ ] Confirm arrays present and unit count matches:
  - red_units length = 14
  - blue_units_initial length = 8
- [ ] Spot-check that edited units (B-f15c-001, R-sam-001, R-aaa-001) have persisted changes
- [ ] Verify bls_template has 5 entries

#### Regression Tests (4 Total)

**Test 17: Quick Demo Still Works**
- [ ] Navigate to home
- [ ] Click Quick Demo button
- [ ] Verify wargame3 loads with 173 units
- [ ] No console errors

**Test 18: Start New Still Works**
- [ ] Navigate to home
- [ ] Click Start New button
- [ ] Verify new scenario loads with 0 units
- [ ] Edit Mode Step 8 shows empty forces

**Test 19: Load/Resume/Back/Direct /app.html Safe**
- [ ] Load a previously saved scenario
- [ ] Click Resume Last Session (if available)
- [ ] Click Back to home
- [ ] Navigate directly to `/app.html`
- [ ] Verify no crashes, intact UI

**Test 20: No Console Errors**
- [ ] Throughout all tests above, open browser console (F12)
- [ ] Check for JavaScript errors (red X icons)
- [ ] Verify no warnings related to units/Step 8
- [ ] Expected: Warnings about "No plan" are OK (part of initialization)

---

## Expected Results Summary

### If All Tests PASS

✅ **Result:** Proceed to Phase 4C — Base/Basing Audit

- Units load correctly in Step 8
- Edit Mode preserves edits
- Map renders units
- No regressions in other scenarios
- Schema is sound for scaling to 40-60 units

### If Tests FAIL

❌ **Result:** Debug and fix before scaling

Common failure modes and next steps:

| Test # | Failure | Investigation | Fix |
|--------|---------|---------------|-----|
| 1-3 | Scenario doesn't load | API/file server issue | Restart server, check /api/scenario endpoint |
| 4-5 | Units missing from tree | Schema incompatibility | Compare loaded JSON to renderForcesCard expectations |
| 6-11 | Detail pane empty/errors | Field mismatch | Check red_units/blue_units field names match editor code |
| 12-14 | Edits don't persist | saveDraft() issue | Verify saveDraft() handles red_units/blue_units |
| 15 | Map doesn't render units | Coordinate issue | Check coords are [lon, lat], within bbox |
| 16 | Export missing units | Export pipeline issue | Verify exportScenario() includes unit arrays |
| 17-19 | Regressions | Unintended side effects | Revert Coastal Shield, verify other scenarios work |

---

## Test Execution Instructions

### For Manual Testing by User

1. **Restart server:**
   ```bash
   cd C:\Users\ADMIN\Desktop\MAP_2
   npm run serve
   # or
   cd UI_MOdified && node server/web-server.js
   ```

2. **Open browser to:**
   ```
   http://localhost:8000/app.html
   ```

3. **Run tests 1-20 in order** (check boxes above)

4. **Record results:**
   - Pass/Fail for each test
   - Any errors or unexpected behavior
   - Screenshots if rendering differs from expectations

5. **Report back:**
   - If PASS: ready for Phase 4C
   - If FAIL: which test(s) failed, what error message

### Troubleshooting Server Cache

If API still returns empty response after restart:

```bash
# Clear npm cache
npm cache clean --force

# Kill all node processes
taskkill /IM node.exe /F

# Restart completely
cd UI_MOdified
node server/web-server.js
```

Then refresh browser (Ctrl+Shift+F5) and retry API call.

---

## Notes for Phase 4B-2 (Unit Scaling)

These 22 units provide baseline patterns for scaling to 40-60 units:

**What works:**
- BLS template structure
- Unit field completeness
- Role field flexibility (free-text)
- Strength field for readiness

**What needs improvement before 40-60:**
- [ ] SIDC code auto-generation (copy-paste tedious)
- [ ] Unit type templates (eliminate repetition)
- [ ] Role enum/validation (prevent typos)
- [ ] Bulk-add workflow (current: manual one-by-one)

---

## Conclusion

### Status Summary

| Phase | Item | Status |
|-------|------|--------|
| 4B-1 | Add 22 units to file | ✅ COMPLETE |
| 4B-1 | Verify schema | ✅ COMPLETE |
| 4B-1 | Verify JSON validity | ✅ COMPLETE |
| **4B-1B** | **In-app load test** | ⏳ BLOCKED (server cache) |
| **4B-1B** | **Step 8 editor test** | ⏳ READY (awaiting server restart) |
| **4B-1B** | **Regression tests** | ⏳ READY (awaiting server restart) |
| **4B-1B** | **Map rendering test** | ⏳ READY (awaiting server restart) |
| **4B-1B** | **Export test** | ⏳ READY (awaiting server restart) |

### Next Action

**REQUIRED:** User must restart RMOOZ server and run tests 1-20 to complete Phase 4B-1B validation.

Once server is restarted and tests pass → **Proceed to Phase 4C: Base/Basing Audit**

---

## Test Checklist (Copy for Manual Testing)

```
[ ] Test 1: Load Coastal Shield
[ ] Test 2: Open Edit Mode
[ ] Test 3: Navigate to Step 8
[ ] Test 4: Verify BLUE units (8 total)
[ ] Test 5: Verify RED units (14 total)
[ ] Test 6: Select Fighter (F-15C)
[ ] Test 7: Select Strike (F-16)
[ ] Test 8: Select Tanker (KC-135)
[ ] Test 9: Select AWACS (E-3)
[ ] Test 10: Select Bomber (B-52)
[ ] Test 11: Select SAM (S-300)
[ ] Test 12: Edit BLUE label, verify persist
[ ] Test 13: Edit RED coordinates, verify persist
[ ] Test 14: Edit RED strength, verify persist
[ ] Test 15: Map renders units correctly
[ ] Test 16: Export includes units
[ ] Test 17: Quick Demo works (regression)
[ ] Test 18: Start New works (regression)
[ ] Test 19: Load/Resume/Back safe (regression)
[ ] Test 20: No console errors

RESULT: [ ] PASS → Proceed to 4C | [ ] FAIL → Debug & fix
```

---

**Report Status:** Ready for user execution  
**Server Status:** Requires restart (cache blocking API)  
**Code Status:** ✅ All 22 units committed and ready  
**Next Phase:** Phase 4C — Base/Basing Audit (if tests pass)

