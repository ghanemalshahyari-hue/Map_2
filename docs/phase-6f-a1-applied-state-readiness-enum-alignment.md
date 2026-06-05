# Phase 6F-A1: Applied State Readiness Enum Alignment Fix

**Date:** 2026-06-04  
**Status:** AUDIT COMPLETE — FIX IN PROGRESS  
**Scope:** Resolve readiness enum consistency before UI integration

---

## Executive Summary

**FINDING:** Phase 6F-A's `AppAppliedState` module uses incorrect readiness enum:
- ❌ **Current (wrong):** `['ready', 'limited', 'degraded']`
- ✅ **Correct:** `['ready', 'limited', 'not_ready']`

**Impact:**
- `not_ready` deltas would be silently rejected (critical bug)
- `not_ready` is a blocker state in Why-Not (action-feasibility.js:173)
- Applied state must preserve `not_ready` for Why-Not contract
- No `degraded` value exists in RMOOZ readiness system

**Resolution:**
1. Update `AppAppliedState.READINESS_VALUES` to accept correct enum
2. Update tests to prove all three values overlay correctly
3. Ensure `not_ready` deltas trigger Why-Not blockers
4. Silently ignore invalid readiness values (graceful degradation)

---

## Audit Results

### 1. scenario-edit-mode.js (Authoring Interface)

**Lines 1157, 1178:**
```javascript
selectInput(['ready', 'limited', 'not_ready'], u.readiness || 'ready', ...)
```

✅ **Enum:** `['ready', 'limited', 'not_ready']` (CANONICAL)

**Finding:** Scenario authoring UI accepts all three readiness values. This is the canonical source.

---

### 2. action-feasibility.js (Why-Not L3-A Feasibility Evaluator)

**Lines 172-173 (BLOCKER):**
```javascript
// readiness_unavailable: ONLY the existing 'not_ready' enum, and only for a named actor.
if (actor && actor.readiness === 'not_ready') block('readiness_unavailable', 'ws.units[].readiness');
```

✅ **Blocker condition:** `readiness === 'not_ready'` (exact match)

**Finding:** `not_ready` is the BLOCKER state. Why-Not explicitly checks for this value.

**Lines 183-185 (RISK):**
```javascript
var readyState = actor ? actor.readiness : evVal(ws, 'combat_readiness_state');
if (readyState === 'limited' || (!actor && readyState === 'not_ready'))
    risk('readiness_degraded', 'ws.units[].readiness');
```

✅ **Risk condition:** `readiness === 'limited'` or `'not_ready'` (force-level check only)

**Finding:** Both `limited` and `not_ready` contribute to risk assessment.

---

### 3. delta-extractor.js (Delta Extraction & Formatting)

**Lines 42-43, 55-56:**
```javascript
readiness: u.readiness || 'ready',
```

**Finding:** Delta extractor uses whatever readiness value exists in units, with fallback to 'ready'. It does NOT validate the enum — that's the responsibility of the authoring/overlay layer.

---

### 4. world-state-db.js (DB-Lite Catalog Defaults)

**Lines 27, 34, 43, 49, 54, 59:**
```javascript
readiness: 'ready',
```

✅ **Default:** All DB-Lite capability categories default to `'ready'`

**Finding:** world-state-db provides generic defaults only. No `limited` or `not_ready` in the catalog.

---

### 5. middle-east-platform-loader.js

**Finding:** Module loads platforms.json, does not define readiness values.

---

### 6. platforms.json (Middle East Platform Catalog)

**All entries (5 platforms):**
```json
"readiness_default": "ready"
```

✅ **Default:** All platforms specify `"ready"` as default readiness.

**Finding:** Platform catalog is canonical for authored readiness defaults only. Does not include `limited` or `not_ready`.

---

### 7. applied-state.js (Phase 6F-A Module) ❌ **WRONG**

**Line 24:**
```javascript
const READINESS_VALUES = new Set(['ready', 'limited', 'degraded']);
```

❌ **Current enum:** `['ready', 'limited', 'degraded']` (INCORRECT)

**Problems:**
1. ✅ `ready` — correct
2. ✅ `limited` — correct
3. ❌ `degraded` — does NOT exist in RMOOZ
4. ❌ Missing `not_ready` — critical blocker state
5. `not_ready` deltas would be silently rejected

---

## Canonical Readiness Enum for RMOOZ Phase 6

**Contract Source:** scenario-edit-mode.js (authoring UI) + action-feasibility.js (feasibility evaluator)

```javascript
const READINESS_VALUES = new Set(['ready', 'limited', 'not_ready']);
```

### Meaning and Contract

| Value | Meaning | Blocker? | Why-Not Impact |
|-------|---------|----------|----------------|
| `ready` | Unit operationally ready for all tasking | No | Feasible |
| `limited` | Unit partially capable; some degradation | Risk only | Risky |
| `not_ready` | Unit unavailable for tasking | YES | BLOCKED |

### Where It's Used

1. **Scenario baseline** (scenario.json units): any of the three
2. **Authoring UI** (scenario-edit-mode.js): dropdown with all three
3. **Why-Not blocker** (action-feasibility.js:173): exact match on `'not_ready'`
4. **Why-Not risk** (action-feasibility.js:183-185): checks for `'limited'` or `'not_ready'` (force-level)
5. **Platform defaults** (world-state-db.js, platforms.json): always `'ready'`
6. **Event log deltas** (ai-proposal-panel.js): any authored value
7. **Applied state overlay** (applied-state.js): should accept all three

---

## What About "degraded"?

### Where Did "degraded" Come From?

I mistakenly introduced it in Phase 6F-A as a third readiness state, thinking it might represent a separate condition between `limited` and `not_ready`.

### Why It's Wrong

1. No existing code checks for `degraded`
2. Not in scenario-edit-mode.js dropdown
3. Not in world-state-db.js or platforms.json
4. Not in action-feasibility.js Why-Not logic
5. Would be silently ignored in all upstream consumers

### Decision

**Resolution:** Do NOT add `degraded` as a readiness value.

**Rationale:**
- Readiness is binary (ready/not-ready) with a gradient (limited) in between
- Operational semantics already covered by {ready, limited, not_ready}
- `degraded` would be orphaned — nowhere to handle it
- If future needs require finer granularity, it should be a separate field (e.g., `readiness_degradation_level: 0-100`)

**Treatment in applied-state.js:**
- Accept only: `['ready', 'limited', 'not_ready']`
- Silently ignore `degraded` (graceful degradation)
- Unit baseline unchanged if delta has invalid readiness

---

## The "Why-Not Blocker" Contract

This is critical for Phase 6F-A1:

### Blocker: readiness_unavailable

**Code location:** action-feasibility.js:173

```javascript
if (actor && actor.readiness === 'not_ready') block('readiness_unavailable', 'ws.units[].readiness');
```

**Semantics:**
- If a unit's readiness is `'not_ready'`, Why-Not says the action is BLOCKED
- Explanation: "Unit is not ready to execute this action"
- This applies to ATTACK_OBJECTIVE actions when a named actor is specified

### Applied State Implication

**When an operator accepts a delta that changes readiness to `'not_ready'`:**
1. Delta is logged as STATE_DELTA event
2. Applied state overlay applies the delta
3. Next-step adjudication reads applied readiness
4. Why-Not evaluator sees `readiness === 'not_ready'`
5. Why-Not blocks the action with `readiness_unavailable`

**If applied-state.js rejects `'not_ready'`:**
- ❌ Delta silently ignored
- ❌ Baseline still has old readiness
- ❌ Why-Not never sees the blocker
- ❌ User cannot block actions via readiness

**This makes the feature broken at its core.**

---

## Test Audit

### Current Phase 6F-A Tests

**File:** test-phase-6f-a-applied-state.js

**Current test values:**
- Test 2 (readiness): ✅ 'ready' → 'limited' ✓
- Test 4 (multiple deltas): ✅ 'ready' → 'limited' → 'degraded' ✗ (should use 'not_ready')
- Test 12 (extract deltas): ✅ 'readiness' delta ✓, but values are flexible

### Required Test Updates

**New tests needed:**
1. ✅ Readiness 'ready' → 'limited' (already pass)
2. ✅ Readiness 'ready' → 'not_ready' (NEW)
3. ✅ Readiness 'limited' → 'not_ready' (NEW)
4. ✅ Readiness 'not_ready' → 'ready' (NEW — recovery)
5. ✅ Invalid readiness value (e.g., 'degraded') silently ignored (NEW)
6. ✅ Why-Not contract preserved (applied 'not_ready' → blocker) (NEW)

---

## Implementation Plan

### Step 1: Fix AppAppliedState Enum
**File:** UI_MOdified/client/shell/applied-state.js

**Change:**
```javascript
// BEFORE
const READINESS_VALUES = new Set(['ready', 'limited', 'degraded']);

// AFTER
const READINESS_VALUES = new Set(['ready', 'limited', 'not_ready']);
```

### Step 2: Update Tests
**File:** test-phase-6f-a-applied-state.js

**Changes:**
- Test 4: Change 'degraded' to 'not_ready'
- Add tests for 'not_ready' transitions
- Add test for invalid readiness values being silently ignored
- Add test verifying Why-Not contract (not_ready blocker)

### Step 3: Update Documentation
**Files:**
- Phase 6F-A module documentation
- This alignment audit
- Test documentation

### Step 4: Verify No Regressions
- ✅ Scenario authoring still works (scenario-edit-mode.js uses same enum)
- ✅ Why-Not still evaluates correctly (action-feasibility.js unchanged)
- ✅ Deltas still extract correctly (delta-extractor.js unchanged)
- ✅ No persistence changes needed (applied-state is in-memory only)

---

## Files to Update

| File | Change | Reason |
|------|--------|--------|
| `UI_MOdified/client/shell/applied-state.js` | Change READINESS_VALUES enum | Fix incorrect values |
| `test-phase-6f-a-applied-state.js` | Update tests to use correct enum | Validate fix |
| `docs/phase-6f-a-in-memory-applied-state-overlay.md` | Update enum documentation | Reflect correct values |

---

## Edge Cases

### Unknown Readiness Value
**Scenario:** Delta has `readiness: 'unknown_status'`

**Current behavior (Phase 6F-A):**
```javascript
if (READINESS_VALUES.has(delta.value_after)) {
    applied.readiness = delta.value_after;
}
// If not in set, silently skip
```

**Behavior preserved:** ✅ Invalid values silently ignored, unit unchanged

### Transition from not_ready
**Scenario:** Unit at `not_ready`, delta changes to `limited`

**Behavior:**
```javascript
if (actor.readiness === 'not_ready') {
    // Why-Not blocks with readiness_unavailable
}

// If delta applied:
applied.readiness = 'limited';

// Next-step:
if (actor.readiness === 'limited') {
    // Why-Not marks as risk (readiness_degraded)
    // NOT a blocker — action is feasible_with_risk
}
```

**Semantics:** ✅ Operator can lift blocker by changing to 'limited', but action is still risky

### Multiple Deltas
**Scenario:** Delta1 'ready'→'limited', Delta2 'limited'→'not_ready'

**Behavior:**
```javascript
// Apply in chronological order
for (const delta of deltas) { /* apply */ }

// Result: applied.readiness = 'not_ready'
// Why-Not sees: readiness_unavailable blocker
```

**Semantics:** ✅ Last delta wins; if final state is 'not_ready', it blocks

---

## Acceptance Criteria

✅ **PASS only if:**

1. ✅ Applied state enum is `['ready', 'limited', 'not_ready']`
2. ✅ 'ready' deltas overlay correctly
3. ✅ 'limited' deltas overlay correctly
4. ✅ 'not_ready' deltas overlay correctly
5. ✅ Invalid readiness values (e.g., 'degraded') silently ignored
6. ✅ Scenario baseline remains immutable
7. ✅ Why-Not contract preserved: `readiness === 'not_ready'` → BLOCKER
8. ✅ All tests pass (old + new)
9. ✅ No UI changes yet (Phase 6F-B)
10. ✅ No simulation or persistence (display-only overlay)

---

## Verification Checklist

- [ ] Applied-state.js READINESS_VALUES updated
- [ ] Tests updated to use correct enum
- [ ] Test for 'not_ready' delta application added
- [ ] Test for invalid readiness value handling added
- [ ] Why-Not contract test added (not_ready → blocker)
- [ ] All 38+ tests pass
- [ ] Documentation updated
- [ ] Scenario baseline immutability verified
- [ ] No upstream changes required
- [ ] Ready for Phase 6F-B UI integration

---

## Conclusion

Phase 6F-A1 audit identifies critical enum mismatch in `AppAppliedState`. The module must accept RMOOZ Phase 6 canonical readiness values: `['ready', 'limited', 'not_ready']`.

Key findings:
- ✅ Canonical enum determined from scenario-edit-mode.js + action-feasibility.js
- ❌ Applied-state.js currently uses wrong enum (includes 'degraded', missing 'not_ready')
- 🔴 This breaks Why-Not blocker contract (not_ready → action BLOCKED)
- ✅ Fix is straightforward: update enum + tests
- ✅ No other files require changes (upstream already correct)

**Status:** Ready for implementation (Phase 6F-A1 fix in progress)

---

**Audit completed:** 2026-06-04  
**Enum audit:** ✅ Complete  
**Contract audit:** ✅ Complete  
**Impact assessment:** ✅ Critical (blocker state missing)  
**Fix scope:** Minimal (enum + tests only)
