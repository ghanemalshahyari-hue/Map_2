# RMOOZ Roadmap — Updated 2026-06-03

**Revision:** Evidence Consumption Audit → OBJ-C Priority Shift  
**Rationale:** Prove evidence system value before adding more sources

---

## Current Build Status

```
World State Engine (WS1–WS4)          ✅ COMPLETE
Detection (WS-DET1-A)                ✅ COMPLETE
Engagement (WS-ENG1-A)               ✅ COMPLETE
Objective Evidence Ledger (OBJ-A)    ✅ COMPLETE
Evidence Consumer (OBJ-B)            ✅ COMPLETE
Readiness Evidence (READINESS-A)     ✅ COMPLETE
```

**Total:** 6 major components complete. World State spine is solid.

---

## Decision Point: Evidence Accumulation

### What the Audit Revealed

| Layer | Status | Healthy? |
|---|---|---|
| Storage (OBJ-A) | ✅ Working | ✅ YES |
| Refactoring (OBJ-B) | ✅ Working | ✅ YES |
| **Visibility** | ❌ Missing | ❌ NO |
| **Consumption** | ⚠️ Partial | ⚠️ RISKY |
| New Sources (Doctrine) | 📋 Planned | ❌ NO |

**Finding:** Operator cannot see readiness evidence exists. Objective assessment doesn't display or use it. Adding more sources before proving value is technical debt.

**Recommendation:** Pause DOCTRINE-A. Implement OBJ-C first (evidence visibility). Then add DOCTRINE-A.

---

## Revised Sequencing

### Phase 1: Evidence Visibility (OBJ-C) — NEXT

**Goal:** Make evidence visible and actionable to operator

**Scope:**
- Display readiness evidence in objective assessment panel
- Show combat evidence + readiness evidence side-by-side
- No behavior change (objective_status_display output identical)
- No new formulas (pure evidence display)

**Value:**
- ✅ Proves evidence ledger is useful
- ✅ Operator understands evidence pattern
- ✅ Readiness evidence becomes actionable
- ✅ Justifies adding more evidence sources
- ✅ Creates audit trail (why did status change?)

**Tests:**
- Display matches ledger values
- Thresholds clearly marked
- Parity gate: status output identical
- Operator can read and act on evidence

**Timeline:** 4–6 hours (UI + tests)

---

### Phase 2: Doctrine Evidence (DOCTRINE-A) — AFTER OBJ-C

**Goal:** Add doctrine evidence sources to ledger

**Scope:**
- 9 doctrine evidence types (already planned)
- No behavior change (pure storage)
- No new formulas

**Precondition:**
- ✅ OBJ-C complete (proves readiness evidence works)

**Value:**
- ✅ More evidence available
- ✅ Operator already understands evidence display
- ✅ Foundation for doctrine interpretation (OBJ-D)

**Timeline:** 3–5 hours (implementation + 96 assertions)

---

### Phase 3: Doctrine Interpretation (OBJ-D) — Future

**Goal:** Refactor objective logic to consume doctrine evidence

**Scope:**
- Objectives consider doctrine priority, WCS state, echelon hierarchy
- Evidence drives tactical decisions
- Output behavior may change (pending design)

**Preconditions:**
- ✅ DOCTRINE-A complete (evidence sources available)
- ✅ OBJ-C deployed (operator understands evidence)
- 📋 Doctrine interpretation rules clarified

---

## Roadmap (Updated)

```
COMPLETED (2026-06-03)
├─ WS1–WS4: World State Spine ✅
├─ WS-DET1-A: Detection ✅
├─ WS-ENG1-A: Engagement ✅
├─ OBJ-A: Evidence Ledger ✅
├─ OBJ-B: Ledger Consumer ✅
└─ READINESS-A: Readiness Evidence ✅

NEXT (2026-06-03→?)
├─ OBJ-C: Evidence Visibility (operator sees evidence)
├─ DOCTRINE-A: Doctrine Evidence (more sources)
└─ OBJ-D: Doctrine Interpretation (evidence drives decisions)

FUTURE
├─ WRA Module: Weapon Release Authorization
├─ Targeting Priority: Doctrine-driven priorities
├─ Proficiency: Experience modifiers
├─ OODA Loop: Reaction timing
└─ Logistics: Supply drain & throughput
```

---

## Why OBJ-C Before DOCTRINE-A?

**Theory:**
```
Stored Evidence
  ↓ (invisible, unknown value)
More Stored Evidence
  ↓ (still invisible)
Even More Stored Evidence
  ↓ (accumulation without value)
Technical Debt
```

**vs.**

**Practice (healthier):**
```
Stored Evidence (OBJ-A)
  ↓ (internal use only)
Visible Evidence (OBJ-C)
  ↓ (operator sees and understands)
New Evidence Sources (DOCTRINE-A)
  ↓ (operator familiar with pattern)
Evidence Interpretation (OBJ-D)
  ↓ (evidence drives behavior)
Value
```

**Principle:** "Stored evidence that is not visible is technical debt."

OBJ-C makes readiness evidence visible, proving the evidence system works before we add doctrine evidence.

---

## Implementation Order

1. **OBJ-C (Evidence Visibility)**
   - Objective assessment panel shows evidence summary
   - Display: Combat + Readiness evidence side-by-side
   - Tests: 15–20 assertions (display accuracy + parity)
   - Verification: Operator can explain objective status by reading evidence

2. **DOCTRINE-A (Doctrine Evidence)**
   - Add 9 doctrine types to objective_evidence
   - Tests: 96 assertions (unit + integration + regression)
   - Verification: Doctrine evidence appears in ledger, still invisible until OBJ-C extended

3. **OBJ-C Extension (Display Doctrine)**
   - Add doctrine evidence to same display panel
   - No additional logic
   - Tests: 5–10 assertions (new display elements)

4. **OBJ-D (Doctrine Interpretation)**
   - Objectives refactored to consider doctrine
   - Output behavior may change (pending design)
   - Tests: Comprehensive (behavior is changing)

---

## Checkpoint: Evidence System Health

**Before OBJ-C:** Ledger exists but invisible
```
✅ Storage working
✅ Internal consumption working
❌ Visible to operator
❌ Actionable
```

**After OBJ-C:** Ledger visible and actionable
```
✅ Storage working
✅ Internal consumption working
✅ Visible to operator
✅ Actionable (operator can explain objectives via evidence)
```

**Decision:** Only add more sources (DOCTRINE-A) after (OBJ-C) proves visibility works.

---

## Summary

| Phase | Component | Status | Next |
|---|---|---|---|
| 1 | World State | ✅ | (complete) |
| 2 | Evidence Storage | ✅ | (complete) |
| 3 | Evidence Refactoring | ✅ | (complete) |
| **4** | **Evidence Visibility** | 🔵 | **OBJ-C** |
| 5 | More Evidence | 📋 | DOCTRINE-A (after OBJ-C) |
| 6 | Evidence Interpretation | 🔵 | OBJ-D (future) |

---

**Reason for Pause:** Evidence system must be proven visible and valuable before accumulating more sources. OBJ-C is the checkpoint.

