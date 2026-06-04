# Scenario Loading & Testing Track — Test Plan

**Date:** 2026-06-04  
**Objective:** Verify RMOOZ scenario pipeline (load → display → edit → export)  
**Test Fixture:** Coastal Shield (coastal-shield-training-v1.json)  
**Scope:** Infrastructure testing only (no Phase 4 features)

---

## Test Cases (13 Total)

### A. Load Coastal Shield from File Picker
**Test:** User clicks "Load Scenario" button, selects coastal-shield-training-v1.json  
**Expected:** File is read, validated, staged in sessionStorage, app navigates to /app.html?launch=load  
**Status:** [ ] PASS [ ] FAIL  
**Notes:**

### B. Load Coastal Shield from data/scenarios API
**Test:** Scenario is accessible at `/api/scenario/coastal-shield-training-v1`  
**Expected:** API returns full scenario JSON (not empty object)  
**Status:** [ ] PASS [ ] FAIL  
**Notes:**

### C. Scenario Workspace Header/Title
**Test:** Scenario loads; page title shows scenario name  
**Expected:** Page shows "Coastal Shield" or scenario label in header  
**Status:** [ ] PASS [ ] FAIL  
**Notes:**

### D. Map Does Not Crash
**Test:** Map container renders without JavaScript errors  
**Expected:** Leaflet map initializes, OSM tile layer loads (or fallback), no console errors  
**Status:** [ ] PASS [ ] FAIL  
**Notes:**

### E. Sides BLUE/RED Appear
**Test:** Both BLUE (Andor Coalition) and RED (Meridia) sides are rendered  
**Expected:** Side indicators visible (color coded, labeled, posture shown)  
**Status:** [ ] PASS [ ] FAIL  
**Notes:**

### F. Objectives Appear or Degrade Safely
**Test:** 4 power station objectives are placed on map  
**Expected:** Objectives render as icons/symbols on map OR error is caught gracefully (not crash)  
**Status:** [ ] PASS [ ] FAIL  
**Notes:**

### G. Steps/Navigation Work
**Test:** User can navigate between Step 1–4  
**Expected:** Step rail shows all 4 steps; clicking each updates the phase/description  
**Status:** [ ] PASS [ ] FAIL  
**Notes:**

### H. Edit Mode Opens and Reads Scenario
**Test:** Edit Mode button opens; scenario data is populated in panels  
**Expected:** Step 1–4 authoring panels show correct data (sides, objectives, etc.)  
**Status:** [ ] PASS [ ] FAIL  
**Notes:**

### I. Export Works and JSON is Valid
**Test:** User clicks "Export Scenario"; downloaded file is valid JSON  
**Expected:** Exported JSON parses successfully; contains scenario_id, sides, objectives, steps  
**Status:** [ ] PASS [ ] FAIL  
**Notes:**

### J. Quick Demo Still Works (Regression)
**Test:** Home page > "Quick Demo" button  
**Expected:** Loads demo scenario (wargame3 or default) without breaking  
**Status:** [ ] PASS [ ] FAIL  
**Notes:**

### K. Start New Still Works (Regression)
**Test:** Home page > "Start New Scenario" button  
**Expected:** Opens Edit Mode with blank scenario draft  
**Status:** [ ] PASS [ ] FAIL  
**Notes:**

### L. Resume Works (Regression)
**Test:** Home page > "Resume Last Session" button  
**Expected:** If session exists, loads previous scenario; if not, shows "no session" notification  
**Status:** [ ] PASS [ ] FAIL  
**Notes:**

### M. Direct /app.html is Safe (Regression)
**Test:** Navigate directly to `/app.html` (no query params)  
**Expected:** App loads safely; defaults to no scenario or shows picker  
**Status:** [ ] PASS [ ] FAIL  
**Notes:**

### N. No Console Errors
**Test:** Load Coastal Shield; open browser console  
**Expected:** No JavaScript errors (warnings OK; expected "No plan" bootstrap messages acceptable)  
**Status:** [ ] PASS [ ] FAIL  
**Notes:**

---

## Execution Results

### Prerequisites ✓
- [ ] coastal-shield-training-v1.json exists at `/data/scenarios/`
- [ ] File size: 25KB (verified)
- [ ] JSON valid (verified)
- [ ] RMOOZ server running on :8000

### Test Execution

#### A. File Picker Load
**Result:** [ ] PASS [ ] FAIL  
**Evidence:** 
**Blocker:** 

#### B. API Load
**Result:** [ ] PASS [ ] FAIL  
**Evidence:** 
**Blocker:** 

#### C. Workspace Header
**Result:** [ ] PASS [ ] FAIL  
**Evidence:** 
**Blocker:** 

#### D. Map Rendering
**Result:** [ ] PASS [ ] FAIL  
**Evidence:** 
**Blocker:** 

#### E. Sides Display
**Result:** [ ] PASS [ ] FAIL  
**Evidence:** 
**Blocker:** 

#### F. Objectives Display
**Result:** [ ] PASS [ ] FAIL  
**Evidence:** 
**Blocker:** 

#### G. Step Navigation
**Result:** [ ] PASS [ ] FAIL  
**Evidence:** 
**Blocker:** 

#### H. Edit Mode
**Result:** [ ] PASS [ ] FAIL  
**Evidence:** 
**Blocker:** 

#### I. Export
**Result:** [ ] PASS [ ] FAIL  
**Evidence:** 
**Blocker:** 

#### J. Quick Demo
**Result:** [ ] PASS [ ] FAIL  
**Evidence:** 
**Blocker:** 

#### K. Start New
**Result:** [ ] PASS [ ] FAIL  
**Evidence:** 
**Blocker:** 

#### L. Resume
**Result:** [ ] PASS [ ] FAIL  
**Evidence:** 
**Blocker:** 

#### M. Direct /app.html
**Result:** [ ] PASS [ ] FAIL  
**Evidence:** 
**Blocker:** 

#### N. Console Errors
**Result:** [ ] PASS [ ] FAIL  
**Evidence:** 
**Blocker:** 

---

## Summary Table

| Test | Result | Status | Blocker? |
|------|--------|--------|----------|
| A. File picker load | | | |
| B. API load | | | |
| C. Workspace header | | | |
| D. Map rendering | | | |
| E. Sides display | | | |
| F. Objectives display | | | |
| G. Step navigation | | | |
| H. Edit Mode | | | |
| I. Export | | | |
| J. Quick Demo (regression) | | | |
| K. Start New (regression) | | | |
| L. Resume (regression) | | | |
| M. Direct /app.html (regression) | | | |
| N. Console errors | | | |

**Total:** 14 tests  
**Passed:** ?  
**Failed:** ?  
**Success Rate:** ?%

---

## Issues Found

### Critical (Blockers)
- 

### High (UI gaps, missing fields)
- 

### Medium (Degradation, workarounds)
- 

### Low (Polish, non-blocking)
- 

---

## Recommendation

**Proceed to Phase 4 if:**
- ✅ 12+ tests pass
- ✅ No critical blockers
- ✅ All regressions pass
- ✅ Scenario loads and displays reliably

**Return to infrastructure if:**
- 🔴 < 12 tests pass
- 🔴 Critical blockers found
- 🔴 Regression failures
- 🔴 Console errors prevent use

**Next Step:**
- [ ] Fix blockers, re-test, proceed to Phase 4
- [ ] Document issues, flag for triage, proceed to Phase 4 with known gaps
- [ ] Return to infrastructure work before Phase 4

---

**Test Plan Created:** 2026-06-04  
**Status:** Ready for execution
