# OBJ-B Planning — Objective Status Consumer Refactoring

**Date:** 2026-06-03  
**Scope:** Refactor objective_status_display to consume objective_evidence ledger  
**Goal:** Replace direct balance_summary reads with evidence ledger reads (output unchanged)

---

## 1. OVERVIEW

### Current State (OBJ-A)
```
objective_status_display reads balance_summary directly:
  ├─ force_ratio_value < 2 → DENIED
  ├─ blue_destroyed > 25% → DENIED
  ├─ red_company_equivalent > 6 → DENIED
  └─ keyword blocks (e.g., "below decisive") → DENIED
```

### Target State (OBJ-B)
```
objective_status_display reads objective_evidence ledger:
  ├─ Extract force_ratio evidence record
  ├─ Extract blue_destroyed_count evidence record
  ├─ Extract red_company_equivalent evidence record
  ├─ Apply same thresholds to ledger values
  └─ Return same status (DORMANT|THREATENED|CONTESTED|DENIED|CAPTURED)
```

**Key Principle:** Output must be identical before and after refactoring.

---

## 2. REFACTORING STRATEGY

### Phase 1: Extract Evidence Values from Ledger
```javascript
// OLD: reads balance_summary directly
var bal = obj(d.balance_summary);
var frNum = bal.force_ratio_value;
var blueLost = bal.losses.blue_destroyed;
var blueTotal = bal.losses.blue_total;
var redCoyEq = bal.losses.red_company_equivalent;

// NEW: extracts same values from evidence ledger
var evidence = arr(d.objective_evidence).find(e => e.objective_id === obj_id);
var frNum = evidence && evidence.find(r => r.evidence_type === 'force_ratio')?.value;
var blueLost = evidence && evidence.find(r => r.evidence_type === 'blue_destroyed_count')?.value;
var blueTotal = ... // derived from blue_intact_ratio
var redCoyEq = evidence && evidence.find(r => r.evidence_type === 'red_company_equivalent')?.value;
```

### Phase 2: Apply Existing Thresholds
```javascript
// Thresholds unchanged:
// - Force ratio < 2 → blocks CAPTURED
// - Blue destroyed > 25% → blocks CAPTURED
// - Red losses > 6 company-eq → blocks CAPTURED
// - Keyword blocks on authored mirror → blocks CAPTURED

// Code path UNCHANGED, just data source different
```

### Phase 3: Parity Gate
```javascript
// If evidence ledger not available (degraded scenario):
// Fallback to direct balance_summary read (existing behavior)
if (!evidence || !evidence.length) {
  var bal = obj(d.balance_summary);
  // use balance_summary directly (old path)
}
```

---

## 3. IMPLEMENTATION TASKS

### Task 1: Add Evidence Extraction Helper
**File:** world-state.js

Create a helper function to extract evidence values by type:
```javascript
function findEvidenceValue(evidence, type) {
  var record = arr(evidence).find(r => r.evidence_type === type);
  return record ? record.value : null;
}
```

**Tests:**
- Helper extracts force_ratio correctly
- Helper returns null if type not found
- Helper works with empty array

### Task 2: Refactor objective_status_display
**File:** world-state.js

Modify function signature and flow:
```javascript
function computeObjectiveStatusDisplay(ws) {
  var d = obj(ws && ws.derived);
  var status = d.objective_status || 'DORMANT';
  if (status !== 'CAPTURED') return status;

  // TRY evidence ledger (new path)
  var evidence = arr(d.objective_evidence);
  if (evidence && evidence.length > 0) {
    var frNum = findEvidenceValue(evidence, 'force_ratio');
    var blueLost = findEvidenceValue(evidence, 'blue_destroyed_count');
    var blueTotal = ... // compute from blue_intact_ratio
    var redCoyEq = findEvidenceValue(evidence, 'red_company_equivalent');
    
    // Apply thresholds (same logic as before)
    if (frNum < 2 || blueLost > threshold || redCoyEq > 6) return 'DENIED';
    return status;
  }

  // FALLBACK to balance_summary (backward compat)
  var bal = obj(d.balance_summary);
  // ... existing code path ...
}
```

**Tests:**
- Output unchanged (parity gate)
- Evidence path produces same result as balance_summary path
- Fallback works when evidence not available

### Task 3: Add Evidence-to-Balance Mapping
**File:** world-state.js (helper)

Document mapping from evidence types to balance_summary fields:
```
Evidence Type → Balance Summary Path → Threshold
─────────────────────────────────────────────────
force_ratio → balance_summary.force_ratio_value → < 2
blue_destroyed_count → balance_summary.losses.blue_destroyed → > 25%
red_company_equivalent → balance_summary.losses.red_company_equivalent → > 6
blue_intact_ratio → computed from losses → < 75%
```

**Purpose:** Ensure thresholds stay aligned between old and new paths.

### Task 4: Tests for Refactored Consumer
**File:** test-obj-b.js (new)

Test plan (30+ assertions):
```
PARITY TESTS (output unchanged):
  ✓ Same objective state before and after refactoring
  ✓ CAPTURED → DENIED gate still works
  ✓ All status values (DORMANT, THREATENED, CONTESTED, DENIED) pass through
  ✓ Thresholds applied correctly (FR < 2, destroyed > 25%, losses > 6)
  ✓ Keyword blocks still apply

EVIDENCE PATH TESTS:
  ✓ Evidence ledger path extracts force_ratio correctly
  ✓ Evidence ledger path extracts blue_destroyed correctly
  ✓ Evidence ledger path extracts red_company_equivalent correctly
  ✓ Thresholds applied to evidence values
  ✓ Same result as balance_summary path

FALLBACK PATH TESTS:
  ✓ Degr degraded scenario falls back to balance_summary
  ✓ Missing evidence ledger falls back to balance_summary
  ✓ Fallback produces same output as evidence path

REGRESSION TESTS:
  ✓ 100+ scenario steps tested for parity
  ✓ Edge cases: 0 losses, all units destroyed, force ratio = 1
  ✓ Authored baseline still honored
```

### Task 5: Documentation
**File:** memory/ (session notes)

Record:
- Why refactoring was needed (evidence storage → evidence consumption)
- What changed (data source: balance_summary → objective_evidence)
- What stayed (output, thresholds, parity gate)
- When to refactor further (OBJ-C+ adding new evidence sources)

---

## 4. RISK MITIGATION

### Risk 1: Parity Gate Fails (Output Changes)
**Mitigation:**
- Run 100+ scenario steps before and after
- Assert JSON output is identical
- Fallback to balance_summary if evidence missing

### Risk 2: Threshold Drift
**Mitigation:**
- Document thresholds explicitly as constants
- Test extracted values vs. original values
- Use same comparison operators (< vs ≤)

### Risk 3: Performance Regression
**Mitigation:**
- Evidence extraction is array search (O(n) where n ≤ 9)
- Computed once per step (not per-render)
- No performance concern expected

### Risk 4: Edge Cases Break
**Mitigation:**
- Test with 0 losses, all units destroyed, force ratio = 1, etc.
- Test with multiple objectives (if scenario has > 1)
- Test with missing evidence records

---

## 5. SUCCESS CRITERIA

✅ **Output Parity**
- objective_status_display output identical before and after
- CAPTURED → DENIED gate works as before
- All status values DORMANT|THREATENED|CONTESTED|DENIED|CAPTURED

✅ **Evidence Consumption**
- Evidence ledger successfully extracted from ws.derived
- Values match balance_summary values (within precision)
- Thresholds applied correctly

✅ **Fallback Protection**
- Missing evidence ledger falls back to balance_summary
- Degraded scenarios still work
- No regressions on non-W3 fixtures

✅ **Tests Pass**
- 30+ assertions covering parity, evidence path, fallback, regression
- Edge cases handled
- 100+ scenario steps verified

✅ **Documentation**
- Refactoring rationale documented
- Threshold mapping explicit
- Path to future evidence sources clear

---

## 6. TIMELINE & DEPENDENCIES

**Prerequisites:**
- ✅ OBJ-A Implementation (COMPLETE)
- ✅ OBJ-A Testing (COMPLETE)
- ✅ Post-OBJ Ownership Audit (COMPLETE)

**OBJ-B Work:**
- Task 1 (helper): 1-2 hours
- Task 2 (refactor): 2-3 hours
- Task 3 (mapping): 1 hour
- Task 4 (tests): 2-3 hours
- Task 5 (docs): 1 hour
- **Total: 7-10 hours**

**Sequencing:**
1. Implement helper (Task 1)
2. Refactor function (Task 2)
3. Add tests (Task 4) in parallel
4. Verify parity
5. Document (Task 5)

---

## 7. POST-OBJ-B STATE

After OBJ-B implementation:

```
WS-DET1-A  (contacts to WS)          ✅
WS-ENG1-A  (engagements to WS)       ✅
OBJ-A      (evidence ledger)         ✅
OBJ-B      (consumer refactoring)    ✅ (after this)
───────────────────────────────────────────
OBJ-C      (readiness evidence)      🔵 NEXT
OBJ-D      (doctrine evidence)       🔵 FUTURE
OBJ-E      (logistics evidence)      🔵 FUTURE
```

Evidence ownership is **complete and extensible**. New sources plug in without touching objective logic.

---

## 8. FUTURE-PROOFING

**Design decisions that enable future layers:**

1. **Flat ledger schema** - New evidence sources just add records
2. **Evidence extraction helper** - Easy to add new thresholds later
3. **Fallback pattern** - Backward-compatible with authored data
4. **Threshold constants** - Easy to reweight evidence in future
5. **Parity gate** - Each refactoring proves output correctness

**What OBJ-C will do differently:**
- Add readiness_summary contributor
- Add new evidence types (readiness_avg, cohesion)
- Maybe reweight existing evidence (not required)
- Objective status logic could change (future)

**What stays the same:**
- Ledger schema
- Evidence extraction pattern
- Fallback mechanism
- Derivation order

---

## 9. APPROVAL CRITERIA

Ready for OBJ-B implementation when:
- ✅ OBJ-A Complete and tested (DONE)
- ✅ Post-OBJ Ownership Audit documented (DONE)
- ✅ OBJ-B Plan reviewed and approved (THIS)
- ✅ Stakeholders agree on refactoring timeline

**Locked Scope:**
- Refactor consumer only
- No new evidence sources
- No new thresholds
- No new formulas
- Output must match (parity gate)

---

**Ready for approval. No implementation until signed off.**

