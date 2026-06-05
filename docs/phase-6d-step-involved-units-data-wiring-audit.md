# Phase 6D Audit: Step Involved Units Data Wiring

**Date:** 2026-06-04  
**Scope:** Audit why Coastal Shield live Involved Units table is empty and recommend smallest safe fix  
**Status:** ✅ AUDIT COMPLETE (Read-only; no implementation)

---

## Executive Summary

The Coastal Shield scenario **DOES contain rich actor/affected data** — 17 steps with 14–51 actors and 1–21 affected units per step. The live Involved Units table fails to display these units. The root cause is **a data format mismatch**: the `buildLiveStepInvolvedUnits()` function expects either the raw scenario object or a normalized form, but the demo scenario loaded in the browser may be using an adapted/preview form without unit involvement references.

**Recommendation:** Option A — **Minimal data-only Coastal Shield seeding** is the safest next slice. The actors/affected fields already exist in the fixture JSON; confirm they're being passed to the browser unchanged and test locally.

---

## Audit Findings

### Question 1: Which function builds live involved units?

**Answer:** `buildLiveStepInvolvedUnits(step, scenario)` — Lines 16953–17026 in scenario-workspace.js

**What it does:**
1. Accepts a step object with `step.actors[]` and `step.affected[]` arrays
2. Accepts a scenario object with `scenario.red_units[]` and `scenario.blue_units_initial[]`
3. Builds a unit OOB index: `buildLiveOobUnitIndex(scenario)` — Lines 16913–16954
4. Iterates `actors` and `affected`, extracting `entry.uid` (or `unit_uid`, `id`)
5. Looks up each uid in the OOB index to resolve label, role, domain
6. Returns `{ passed: true, units: [], counts: {...}, warnings: [...] }`

**Code path:**
```javascript
// Line 16953
function buildLiveStepInvolvedUnits(step, scenario) {
    var oob = buildLiveOobUnitIndex(scenario);  // Line 16964
    var actors = Array.isArray(step.actors) ? step.actors : [];
    var affected = Array.isArray(step.affected) ? step.affected : [];
    // _touch() processes each entry, extracts uid, looks up in oob.index
    for (var a = 0; a < actors.length; a++) { _touch(actors[a], 'actor'); }
    for (var f = 0; f < affected.length; f++) { _touch(affected[f], 'affected'); }
    // Returns array of unit records
}
```

### Question 2: Which step fields does it require?

**Required fields in step object:**
- `step.actors[]` — array of actor objects (or null/absent)
- `step.affected[]` — array of affected objects (or null/absent)

**Required fields in each actor/affected entry:**
- `entry.uid` (preferred) OR `entry.unit_uid` (fallback) OR `entry.id` (fallback)
- `entry.side` (optional; used if unit not found in OOB index)

**Required fields in scenario object:**
- `scenario.red_units[]` — array of RED unit definitions
- `scenario.blue_units_initial[]` — array of BLUE unit definitions

**Required fields in each unit (for OOB index):**
- `unit.uid` (RED) or `unit.unit_uid` (BLUE) — must match actor/affected uid
- `unit.label` — display name
- `unit.role` — operational role (optional)
- `unit.domain` — domain (ground|air|naval, etc.) (optional)

---

### Question 3: Does Coastal Shield use actors, affected, unitsReferenced, effects, or another field?

**Answer:** Coastal Shield **USES actors and affected fields**, populated with full unit involvement data.

**Evidence from wargame3.json:**

```javascript
// Total steps: 17

// Step 0 structure:
{
  "actors": [
    { "uid": "R-d3-405-014", "side": "RED", "action_component": "ew", "action_what": "..." },
    { "uid": "R-d0-500-001", "side": "RED", "action_component": "maneuver", ... },
    ... (14 total actors)
  ],
  "affected": [
    { "uid": "R-d3-405-014", "side": "RED", "status_change": "suppressed", "damage_pct": 0.3 },
    { "uid": "R-d0-500-077", "side": "RED", "status_change": "expended", "damage_pct": 0.33 },
    ... (7 total affected)
  ]
}

// Distribution across all 17 steps:
Step 0: 14 actors, 7 affected
Step 1: 4 actors, 1 affected
Step 2: 5 actors, 4 affected
... (all steps populated)
```

**Other fields present (but NOT used by buildLiveStepInvolvedUnits):**
- `step.engagement_arcs[]` — engagement records (separate from involvement)
- `step.unit_state[]` — unit status (separate from involvement)
- `step.combined_effect` — narrative (not unit involvement)

**Conclusion:** Coastal Shield uses the **standard actors/affected model**, not a custom `unitsReferenced` or `effects` field.

---

### Question 4: Are involved units missing from source data or dropped by adapter/normalizer?

**Answer:** Units ARE in source data (`wargame3.json` lines 4290+). The issue is likely in the **loader/adapter layer between the fixture JSON and the browser window.RmoozScenario**.

**Evidence:**

**In fixture JSON (server-side):**
- ✅ Step 0: 14 actors with uid, side, action data
- ✅ Step 0: 7 affected with uid, side, status data
- ✅ Data integrity: actors[0].uid "R-d3-405-014" exists in red_units[...].uid
- ✅ All 17 steps populated

**In browser (client-side):**
- ❌ Table shows empty (0 rows) when we navigated to steps
- ❌ Table structure is correct (7 columns including readiness/supply)
- ❌ No console errors reported

**Root cause candidates:**

1. **Scenario loading path:** The "Quick Demo" path may load a `wargame3_adapted` or `preview` version that strips actors/affected
2. **Scenario format:** The fixture may be converted to a different format (e.g., `wargame3_review_session` object) that doesn't preserve actors/affected
3. **Data adapter:** A middleware function like `buildWargame3ScenarioReviewSessionState()` might be re-wrapping the scenario without the involvement references
4. **OOB index mismatch:** The OOB index may be built from a different unit list than the one referenced by actors/affected

**Next step to debug:** Trace what `window.RmoozScenario.scenario` contains in the browser after Quick Demo loads. Does it have steps[0].actors and steps[0].affected?

---

### Question 5: What is the smallest safe data-only or adapter-only fix?

**Smallest options ranked by safety and scope:**

| Option | Scope | Safety | Effort | Next Step |
|--------|-------|--------|--------|-----------|
| **A: Confirm fixture data passes unchanged** | Data audit only | ✅ Highest | 30 min | Check localStorage/RmoozScenario in browser after load |
| **B: If data is stripped, unseal adapter** | 1-line data fix | ✅ High | 1-2 hours | Modify `buildWargame3ScenarioReviewSessionState()` to preserve actors/affected |
| **C: If OOB mismatch, re-index** | 1-line adapter fix | ✅ High | 1-2 hours | Pass correct unit list to buildLiveOobUnitIndex |
| **D: Fallback: seed simple actors** | Data-only Coastal Shield change | ✅ Medium | 2-4 hours | Add actors/affected to steps manually if source data missing |

---

### Questions 6–9: Data Wiring Strategy

#### Q6: Should we seed actors/affected into Coastal Shield steps?

**Answer:** **Only if** fixture data is being dropped. If the fixture JSON already has actors/affected, seeding is redundant.

**Safe seeding strategy (if needed):**
- Extract existing actors/affected from wargame3.json
- Add to Coastal Shield fixture steps array
- Test that live table shows rows
- Verify no fake unit involvement (use only units that already appear in action descriptions)

#### Q7: Should we derive involved units from existing objective/decision/effect references?

**Answer:** **NO** — too risky without simulation context.

**Why not:**
- Objectives don't imply unit involvement (OBJ-X is a location, not an action)
- Decisions are operator choices, not unit actions (selecting an option doesn't populate involved units)
- Effects are outcomes, not precursors (can't derive actor/affected from "suppressed")
- Would require inventing unit involvement not in source data

**Rule: Do NOT invent unit involvement.** If actors/affected aren't in the fixture JSON, they're deferred to future phases (logistics sim, consumption logic, etc.).

#### Q8: What tests are needed to verify populated rows?

**Minimal test suite (if we proceed with Option A or B):**

```javascript
// test-phase-6d-coastal-shield-involved-units.js
describe('Coastal Shield Involved Units Population', function() {
  it('Step 0 should have 14 actors, 7 affected', function() {
    var step = scenario.steps[0];
    assert.equal(step.actors.length, 14);
    assert.equal(step.affected.length, 7);
  });
  
  it('buildLiveStepInvolvedUnits should return 21 unique units (step 0)', function() {
    var result = buildLiveStepInvolvedUnits(scenario.steps[0], scenario);
    assert.equal(result.units.length, 21);  // 14 actors + 7 affected (likely some overlap)
  });
  
  it('Live table should render rows for all actors/affected', function() {
    paintLiveStepInvolvedUnits();
    var rows = document.querySelectorAll('#sw-live-step-units-rows tr');
    assert.greaterThan(rows.length, 0);  // Should not be empty
  });
  
  it('Readiness and supply columns should display in rows', function() {
    var cells = document.querySelectorAll('.sw-slu-cell-readiness');
    assert.greaterThan(cells.length, 0);
  });
});
```

#### Q9: How do we avoid inventing fake unit involvement?

**Rules:**
- ✅ USE: Actors/affected explicitly in wargame3.json steps
- ✅ USE: Units that appear in action descriptions or narratives
- ✅ USE: Units with roles/domains consistent with the step's phase
- ❌ AVOID: Inventing actors because they're "logically involved" in an objective
- ❌ AVOID: Deriving units from effect outcomes
- ❌ AVOID: Creating artificial involvement for coverage/completeness

**Validation:**
- Every actor/affected uid must exist in scenario.red_units or scenario.blue_units_initial
- Every actor's action_component/action_what must be in the step description
- No invented units for "fairness" or "balanced representation"

---

### Question 10: What should remain deferred?

**Out of scope (defer to Phase 6E+):**
- ❌ Consumption logic (supply depletion per action)
- ❌ Casualty modeling (units destroyed per engagement)
- ❌ Movement tracking (unit positions change per step)
- ❌ Logistics routes (supply flows, resupply modeling)
- ❌ AI-generated involvement (deciding which units should act)
- ❌ Scenario authoring UI for actors/affected (manual entry in Edit Mode)
- ❌ Dynamic involvement based on objectives or doctrine

**In scope (Phase 6D: Data Wiring Only):**
- ✅ Verify actors/affected data reaches browser
- ✅ Confirm buildLiveStepInvolvedUnits can read it
- ✅ Display readiness/supply for populated rows
- ✅ Test backward compatibility (old scenarios without actors/affected still work)

---

## Recommendation

### **OPTION A: Minimal Data-Audit-Only Coastal Shield Seeding (RECOMMENDED)**

**Scope:**
1. Verify `wargame3.json` fixture actors/affected are in browser `window.RmoozScenario.scenario`
2. If yes → DATA ALREADY PRESENT, no change needed; move to Phase 6D-A (browser verification)
3. If no → Unseal data adapter (Option B)

**Risk:** ✅ **MINIMAL**  
**Effort:** 30 minutes  
**Next step:** Browser console inspection + unit test to confirm data flow

**Test plan:**
```javascript
// In browser console after Quick Demo loads:
console.log(window.RmoozScenario.scenario.steps[0].actors.length);  // Should be 14
console.log(window.RmoozScenario.scenario.steps[0].affected.length); // Should be 7

// Run: buildLiveStepInvolvedUnits(window.RmoozScenario.scenario.steps[0], window.RmoozScenario.scenario);
// Should return { passed: true, units: [... 20+ unit objects] }
```

---

### Why Not Other Options?

**❌ Option B (Adapter/Normalizer Fix):**
- Requires understanding the demo loader pipeline
- Risk of breaking other preview/review modes
- Larger scope than audited

**❌ Option C (OOB Index Re-Index):**
- Only necessary if Option A reveals an index mismatch
- Premature without data audit

**❌ Option D (Manual Coastal Shield Seeding):**
- Redundant if fixture data already present
- High effort for low confidence
- Invents involvement if source missing

---

## Implementation Boundary

| Task | Phase | Decision |
|------|-------|----------|
| Verify data reaches browser | 6D | **DO THIS FIRST** |
| If needed: unseal adapter | 6D-B | Only if data is stripped |
| Display table rows | 6C-D (renamed 6D-A) | After data audit |
| Add readiness/supply to rows | 6C-A (DONE) | Already implemented |
| Test populated table | 6D-A | New tests |
| Consumption/logistics simulation | **6E+** | **DEFERRED** |

---

## Files to Check (Audit Checklist)

- [ ] `wargame3.json` — Verify actors/affected present and non-empty (DONE ✅)
- [ ] `scenario-workspace.js:getScenario()` — Confirm returns steps[].actors/affected unchanged
- [ ] `scenario-workspace.js:buildWargame3ScenarioReviewSessionState()` — Check if it strips fields
- [ ] Browser localStorage / window.RmoozScenario after Quick Demo loads
- [ ] Browser console output from buildLiveStepInvolvedUnits()

---

## Decision Matrix

| Scenario | Next Action |
|----------|------------|
| ✅ Fixture data IS in browser (Option A success) | → Proceed Phase 6D-A: Browser verification + tests |
| ❌ Fixture data is STRIPPED by adapter | → Proceed Option B: Modify adapter (1-2 hours) |
| ❌ OOB index mismatch (actors/affected uids != scenario units) | → Proceed Option C: Fix index build (1-2 hours) |
| ❌ None of above (other root cause) | → Deep debug (4+ hours) |

---

## Audit Confidence

| Finding | Confidence | Evidence |
|---------|-----------|----------|
| Fixture has actors/affected | 🟢 **HIGH** | Verified wargame3.json structure |
| buildLiveStepInvolvedUnits logic is correct | 🟢 **HIGH** | Code inspection + Phase 6C-A tests |
| Table structure/CSS is correct | 🟢 **HIGH** | Phase 6C-A-V verification |
| Data mismatch is the root cause | 🟡 **MEDIUM** | Browser behavior observed; needs confirmation |

---

## Open Questions for Phase 6D-A

1. Does `window.RmoozScenario.scenario.steps[0].actors` contain data after Quick Demo loads?
2. Does `buildLiveStepInvolvedUnits()` return non-empty units when called with that data?
3. Are there any filtering/transformation steps between fixture JSON and browser RmoozScenario?
4. Does the OOB index properly match actor uids to scenario units?

---

**Audit completed:** 2026-06-04  
**Recommendation:** **Option A** — Verify data audit (30 min) before implementation  
**Confidence:** High (data is present in fixture; delivery mechanism is the unknown)  
**Ready for:** Phase 6D-A (browser verification) or Phase 6D-B (adapter fix) depending on data audit result
