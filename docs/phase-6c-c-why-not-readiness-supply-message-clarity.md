# Phase 6C-C Verification: Why-Not Readiness/Supply Message Clarity

**Date:** 2026-06-04  
**Scope:** Improve operator-facing Why-Not messages for readiness and supply constraints  
**Status:** ✅ COMPLETE AND VERIFIED

---

## Executive Summary

Phase 6C-C improves the clarity of Why-Not action-feasibility messages for readiness and supply constraints. The implementation:

1. **Replaces jargon** — "not_ready" enum value → "not ready" readable text
2. **Clarifies consequences** — "not ideal" vague statement → "execution risk is increased" concrete impact
3. **Explains thresholds** — "neutral level" jargon → "below 50%" operator-readable percentage
4. **Preserves all logic** — Blockers, risks, thresholds, and classifications unchanged
5. **No new simulation** — Display-only improvement; no logistics or consumption logic added

**Test Results:** ✅ **30/30 assertions PASS** (10 comprehensive test suites)

---

## Message Changes

### 1. readiness_unavailable Blocker

**Before:**  
> Actor readiness is not_ready — the unit cannot act.

**After:**  
> Unit is not ready to execute this action.

**Improvements:**
- Removed enum jargon ("not_ready" → "not ready")
- Simplified phrasing (operator-readable)
- Clearer consequence implied

### 2. readiness_degraded Risk

**Before:**  
> Unit readiness is limited (not ideal).

**After:**  
> Unit readiness is limited - execution risk is increased.

**Improvements:**
- Removed vague phrase ("not ideal")
- Made consequence explicit ("execution risk is increased")
- Clearer link between state and impact

### 3. supply_limited Risk

**Before:**  
> Supply is below the readiness layer's neutral level.

**After:**  
> Supply is low (below 50%) - sustainability is at risk.

**Improvements:**
- Removed jargon ("neutral level")
- Explained threshold numerically ("50%")
- Made impact explicit ("sustainability is at risk")
- Clearer for operators unfamiliar with "readiness layer" terminology

---

## Implementation Details

### File: action-feasibility.js

**Location:** Lines 44, 48, 49 in EXPLAIN object

```javascript
readiness_unavailable:      'Unit is not ready to execute this action.',                   // ws.units[].readiness
readiness_degraded:         'Unit readiness is limited - execution risk is increased.',      // ws.units[].readiness
supply_limited:             'Supply is low (below 50%) - sustainability is at risk.',         // ws.units[].supply
```

**Logic Unchanged:**
- Line 173: `readiness_unavailable` blocker still fires when `actor.readiness === 'not_ready'`
- Lines 184–185: `readiness_degraded` risk still fires when readiness === 'limited'
- Lines 188–189: `supply_limited` risk still fires when supply < 0.5
- All thresholds preserved; all classifications preserved

---

## Test Coverage: 30/30 Assertions PASS

| Test | Suite | Assertions | Status |
|------|-------|-----------|--------|
| 1 | readiness_unavailable blocker fires | 4 | ✅ PASS |
| 2 | readiness_degraded risk fires | 4 | ✅ PASS |
| 3 | supply_limited risk fires | 5 | ✅ PASS |
| 4 | supply = 0.5 (threshold) no risk | 2 | ✅ PASS |
| 5 | supply > 0.5 no risk | 1 | ✅ PASS |
| 6 | Multiple risks coexist | 2 | ✅ PASS |
| 7 | ready + good supply = feasible | 4 | ✅ PASS |
| 8 | Force-level readiness degradation | 2 | ✅ PASS |
| 9 | No new logistics simulation | 4 | ✅ PASS |
| 10 | Messages operator-readable | 2 | ✅ PASS |
| **TOTAL** | | **30** | **✅ PASS** |

### Key Test Scenarios

**TEST 1: readiness_unavailable Blocker**
- ✅ not_ready produces blocker (not risk)
- ✅ Verdict is blocked (not feasible_with_risk)
- ✅ Message is improved (no "not_ready" enum jargon)
- ✅ Message is operator-readable

**TEST 2: readiness_degraded Risk**
- ✅ limited readiness produces risk (not blocker)
- ✅ Verdict is feasible_with_risk
- ✅ Message mentions risk explicitly
- ✅ Message is clearer than "not ideal"

**TEST 3: supply_limited Risk**
- ✅ supply < 0.5 produces risk
- ✅ Verdict is feasible_with_risk
- ✅ Message explains threshold (50%)
- ✅ Message mentions sustainability impact
- ✅ Message is clearer than "neutral level"

**TEST 4–5: Threshold Logic**
- ✅ supply = 0.5 does NOT produce risk (threshold is <, not <=)
- ✅ supply > 0.5 does NOT produce risk

**TEST 6: Multiple Risks**
- ✅ readiness_degraded + supply_limited can coexist
- ✅ No duplication

**TEST 7: Feasible State**
- ✅ ready unit with good supply and clear contacts is simply feasible
- ✅ No spurious risks

**TEST 8: Force-Level Readiness**
- ✅ When actor is missing, force-level readiness still creates risk
- ✅ No unit-level blocker (force-level is always risk, never blocker)

**TEST 9: No New Simulation**
- ✅ Supply is not consumed per action
- ✅ Depletion not implemented
- ✅ Resupply routes not simulated
- ✅ Ammo/fuel/food not split

**TEST 10: Operator Language**
- ✅ No jargon in messages ("not_ready", "neutral level", "not ideal" all removed)
- ✅ Plain English throughout

---

## Impact Assessment

### What Changed
- **Message text only** — 3 strings in EXPLAIN object
- **Logic unchanged** — All feasibility rules identical
- **Thresholds preserved** — 'not_ready' blocks, 'limited' risks, < 0.5 risks
- **UI unchanged** — Messages display the same way

### What Did NOT Change
- ✅ Blocker/risk classification (not_ready still blocks; limited still risks; supply < 0.5 still risks)
- ✅ Thresholds (still < 0.5 for supply; still === 'not_ready' for blocker)
- ✅ Code logic (no new conditions, no new variables)
- ✅ Simulation status (still display-only, no consumption/depletion)
- ✅ Feasible alternatives (same ALT_MAP, same remedies)

### Backward Compatibility
- ✅ Existing Why-Not calls unaffected (same code paths, same verdicts)
- ✅ Existing scenarios work identically (no scenario schema changes)
- ✅ No API changes (evaluateAction() signature unchanged)

---

## Verification Results Summary

### Code Inspection
- ✅ 3 message strings improved
- ✅ 0 logic changes
- ✅ 0 threshold changes
- ✅ 0 new simulation

### Unit Tests
- ✅ 30/30 assertions pass
- ✅ All blockers/risks verified
- ✅ All thresholds verified
- ✅ No regressions

### Integration
- ✅ Messages match EXPLAIN object
- ✅ Feasibility logic unchanged
- ✅ Alternatives mapping unaffected

---

## Operator-Facing Impact

### Scenario 1: Unit Not Ready (Blocker)
**Old message:** "Actor readiness is not_ready — the unit cannot act."  
**New message:** "Unit is not ready to execute this action."  
**Operator benefit:** Clear, jargon-free explanation of the blocker.

### Scenario 2: Limited Readiness (Risk)
**Old message:** "Unit readiness is limited (not ideal)."  
**New message:** "Unit readiness is limited - execution risk is increased."  
**Operator benefit:** Explains the concrete consequence (increased risk), not vague "not ideal".

### Scenario 3: Low Supply (Risk)
**Old message:** "Supply is below the readiness layer's neutral level."  
**New message:** "Supply is low (below 50%) - sustainability is at risk."  
**Operator benefit:** Clear threshold (50%), removal of jargon ("readiness layer"), and stated consequence (sustainability risk).

---

## Files Modified

| File | Lines | Change | Scope |
|------|-------|--------|-------|
| `UI_MOdified/client/shell/action-feasibility.js` | 44, 48, 49 | Message text only | 3 strings in EXPLAIN object |

---

## Files Added

| File | Size | Purpose |
|------|------|---------|
| `test-phase-6c-c-why-not-readiness-supply-messages.js` | ~300 lines | 30 assertions verifying messages and logic |
| `docs/phase-6c-c-why-not-readiness-supply-message-clarity.md` | This file | Verification documentation |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation | Status |
|------|------------|--------|-----------|--------|
| Message not displayed | Low | Low | Message is in EXPLAIN; UI uses EXPLAIN unchanged | ✅ Verified |
| Wrong message shown | Very low | Low | Unit tests verify exact message text | ✅ Tested 30/30 |
| Logic broken | Very low | Critical | Logic unchanged; thresholds verified | ✅ Tested |
| Regression in feasibility | Very low | High | All verdict tests pass; no new paths added | ✅ Tested |

**Overall risk:** ✅ **VERY LOW** (display-only change, no logic changes)

---

## Acceptance Decision

### Verification Criteria: All Met ✅

| Criterion | Status | Evidence |
|-----------|--------|----------|
| Messages are clearer | ✅ | 3 improved strings; jargon removed; consequences explicit |
| Logic preserved | ✅ | 0 code logic changes; all tests pass |
| Thresholds preserved | ✅ | TEST 4–5 verify < 0.5; TEST 1 verifies not_ready |
| No new simulation | ✅ | TEST 9: supply not consumed, depletion not added |
| Operator-readable | ✅ | TEST 10: no jargon in messages |

### Final Verdict

**Status:** ✅ **VERIFIED & COMPLETE**

Phase 6C-C has improved the clarity of readiness/supply Why-Not messages while preserving all existing logic, thresholds, and classifications. The implementation is minimal, tested, and ready for deployment.

**Confidence level:** High (30/30 unit tests pass; no logic changes; backward compatible)

---

## Next Steps

### Phase 6C-D (if scheduled)
- Implement readiness/supply consumption logic (supply depletion, readiness degradation)
- Add logistics simulation (resupply routes, sustainment pools)

### Phase 6B+ Future
- Add schema validation for readiness/supply
- Add backend persistence (save per-step state)
- Add UI color-coding for readiness states
- Add visual supply bar in table

---

**Verification completed:** 2026-06-04  
**Verified by:** 30/30 unit test assertions  
**Confidence:** High  
**Ready for:** Deployment or Phase 6C-D planning
