# Evidence Consumption Audit

**Date:** 2026-06-03  
**Goal:** Determine which evidence sources are stored but not consumed  
**Question:** Is the ledger delivering value or just accumulating data?

---

## FINDINGS

### Evidence Status Matrix

| Evidence Source | Stored | Consumed | Consumer | Value Today |
|---|---|---|---|---|
| **Combat Evidence** | ✅ YES | ⚠️ PARTIAL | objective_status_display (force_ratio, blue_destroyed, red_company_eq) | 🟡 LIMITED |
| **Readiness Evidence** | ✅ YES | ❌ NO | (none) | 🔴 ZERO |
| **Doctrine Evidence** | 📋 PLANNED | ❌ NO | (none) | 🔴 ZERO |

---

## DETAILED AUDIT

### Combat Evidence (OBJ-A)

**Stored:** ✅ YES
- 4 evidence records in objective_evidence ledger:
  - force_ratio (from balance_summary)
  - blue_destroyed_count (from balance_summary)
  - blue_intact_ratio (derived)
  - red_company_equivalent (from balance_summary)

**Consumed:** ⚠️ PARTIAL
- Location: objective_status_display (OBJ-B implementation)
- How: Reads evidence ledger with fallback to balance_summary
- What it does: Applies three gates to determine CAPTURED vs DENIED status
  - `force_ratio < 2` → DENIED
  - `blue_destroyed > 25%` → DENIED
  - `red_company_equivalent > 6` → DENIED
- Limitation: Uses values only for gate logic, **does not display them to operator**

**Consumer Quality:** IMPLICIT
- Evidence used internally by objective_status_display
- Operator sees status (DORMANT/THREATENED/CONTESTED/DENIED/CAPTURED) but not the evidence
- No evidence transparency to justify why status changed

**Value Today:** 🟡 LIMITED
- ✅ Proof that ledger architecture works
- ✅ Fallback pattern verified (evidence + balance_summary)
- ❌ Operator cannot see WHY a status changed
- ❌ No audit trail (operator sees result, not reasoning)

---

### Readiness Evidence (READINESS-A)

**Stored:** ✅ YES
- 6 evidence records in objective_evidence ledger:
  - unit_strength_avg
  - force_availability_ratio
  - ammunition_sustainability
  - supply_sustainability
  - combat_readiness_state
  - casualty_rate

**Consumed:** ❌ NO
- Location: nowhere
- How: (not used)
- What it does: (nothing)
- Limitation: Pure storage; no consumer exists

**Consumer Quality:** NONE
- Evidence sits in ledger untouched
- Operator is unaware readiness evidence exists
- No mechanism to display or use readiness values

**Value Today:** 🔴 ZERO
- ❌ Operator cannot see force readiness metrics
- ❌ Objective assessment does not reference readiness
- ❌ Evidence not visible, not actionable
- ⚠️ Adding data without proving utility creates technical debt

---

### Doctrine Evidence (DOCTRINE-A Planned)

**Stored:** 📋 PLANNED
- 9 planned evidence records in objective_evidence ledger:
  - unit_doctrine_tags
  - unit_echelon_level
  - unit_posture_state
  - side_weapons_control_status
  - side_emcon_status
  - side_engage_ambiguous
  - unit_doctrine_inheritance_scope
  - objective_doctrine_priority
  - doctrine_compliance_summary

**Consumed:** ❌ NO (Planned)
- Location: nowhere yet
- How: (not designed)
- What it does: (nothing)
- Limitation: Would be pure storage; no consumer designed

**Consumer Quality:** NONE
- Would sit in ledger untouched
- Operator unaware doctrine evidence exists
- No mechanism to display or use doctrine values

**Value Today:** 🔴 ZERO
- ❌ Operator cannot see why doctrine restricts engagement
- ❌ Objective assessment does not reference doctrine
- ❌ Evidence not visible, not actionable
- ⚠️ **Risk: Adding third evidence layer before first is consumed**

---

## DIAGNOSIS

### Pattern Recognition

**Current trajectory:**
```
OBJ-A (Storage)      ✅ DONE
OBJ-B (Refactoring)  ✅ DONE
READINESS-A (Source) ✅ DONE
DOCTRINE-A (Source)  📋 PLANNED
```

**Problem:**
```
Evidence is being added faster than consumption.
Ledger grows; value does not.
```

**Architecture Health:**
```
Layer 1: Storage ————————————————— ✅ Proven (OBJ-A, OBJ-B)
Layer 2: Consumption (Internal) — ⚠️  Partial (Combat only)
Layer 3: Visibility ——————————— ❌ None (Readiness, Doctrine invisible)
Layer 4: New Sources ————————— 📋 Queued (Doctrine-A waiting)
```

### The Missing Link

**What exists:**
- Evidence ledger (OBJ-A) ✅
- Consumer for combat evidence (OBJ-B) ✅
- Readiness evidence generation (READINESS-A) ✅

**What does NOT exist:**
- **Visibility of readiness to operator** ❌
- **Consumption of readiness by objective assessment** ❌
- **Proof that evidence is valuable** ❌

**Result:**
- Operator cannot see readiness evidence exists
- Objective status does not reference readiness
- Ledger is accumulating data without delivering value

---

## ROOT CAUSE

The implementation sequence was:
```
Storage → Refactoring → Sources → Sources → Sources
```

But the value delivery sequence should be:
```
Storage → Refactoring → Visibility → Consumption → New Sources
```

**We jumped from Storage/Refactoring directly to Sources, skipping Visibility.**

---

## RECOMMENDATION

### Do NOT implement Doctrine-A next.

Instead:

### 1. Implement OBJ-C: Evidence Visibility & Consumption

**Goal:** Make readiness evidence visible and consumed by objective assessment

**Scope:** Non-behavior-changing, pure evidence display

**What it does:**
- Objective assessment panel shows evidence ledger summary
- Display force readiness metrics alongside combat metrics
- No change to objective_status_display logic (output identical)
- No new formulas (pure display of existing evidence)

**Example output:**
```
Objective Alpha
Status: THREATENED
┌─ Combat Evidence ─────────────┐
│ Force Ratio: 2.4 (threshold 2) │
│ Blue Destroyed: 8% (threshold 25%) │
│ Red Losses: 2.3 CE (threshold 6) │
└───────────────────────────────┘
┌─ Readiness Evidence ──────────┐
│ Unit Strength Avg: 0.71       │
│ Force Availability: 0.83      │
│ Ammunition Sustainability: 1.0 │
│ Supply Sustainability: 0.74    │
│ Combat Readiness: ready       │
│ Casualty Rate: 0%             │
└───────────────────────────────┘
```

**Value:**
- ✅ Operator sees why status is THREATENED (combat metrics explain it)
- ✅ Operator sees readiness state (force can continue, ammo full, supply ok)
- ✅ Ledger is now visible and actionable
- ✅ Readiness evidence proves its utility
- ✅ Audit trail: "Why is Alpha THREATENED?" → Shows evidence

**Test Plan:**
- Display matches evidence ledger values
- Thresholds displayed correctly
- No change to objective_status_display output (parity gate)
- operator can read and understand evidence

---

### 2. Then implement Doctrine-A

Once OBJ-C proves readiness evidence is valuable:
- Operator can see readiness evidence works
- Operator understands the evidence pattern
- Next evidence source (doctrine) can be added with confidence
- Display panel extended to include doctrine evidence

**New display (after OBJ-C + Doctrine-A):**
```
Objective Alpha
Status: THREATENED
├─ Combat Evidence
├─ Readiness Evidence
└─ Doctrine Evidence
    ├─ Unit Doctrine Tags: [air_defense, maneuver]
    ├─ Weapons Control: FREE (surface), HOLD (air)
    ├─ EMCON: active
    ├─ Objective Priority: primary
    └─ Doctrine Compliance: 45/48 units compliant
```

---

### 3. Future phases (After evidence visibility is proven)

- OBJ-D: Doctrine interpretation (objectives refactored to consider doctrine)
- WRA module: Use doctrine evidence for salvo sizing
- Targeting priority: Use doctrine evidence for target ranking
- AI integration: AI cites doctrine compliance

---

## REVISED ROADMAP

### Current State (2026-06-03)

```
WS1–WS4            ✅ COMPLETE
WS-DET1-A          ✅ COMPLETE
WS-ENG1-A          ✅ COMPLETE
OBJ-A              ✅ COMPLETE
OBJ-B              ✅ COMPLETE
READINESS-A        ✅ COMPLETE
```

### Recommended Next (In Order)

```
OBJ-C              🔵 NEXT (Evidence Visibility)
  Goal: Display readiness evidence in objective assessment
  Value: Proves evidence system works
  
DOCTRINE-A         🔵 AFTER OBJ-C (Doctrine Evidence)
  Goal: Add 9 doctrine types to ledger
  Value: More evidence available for future consumption
  
OBJ-D              🔵 FUTURE (Doctrine Consumption)
  Goal: Refactor objective logic to use doctrine evidence
  Value: Objectives become doctrine-aware
```

---

## EVIDENCE PATTERN (CORRECTED)

**Healthy evidence system:**

```
Layer 1: Storage
  ↓
Layer 2: Internal Consumption (refactoring)
  ↓
Layer 3: Operator Visibility (display)
  ↓
Layer 4: New Sources (add more evidence)
  ↓
Layer 5: Higher-Order Consumption (formulas use evidence)
```

**Current state (with OBJ-C):**

```
Layer 1: Storage              ✅ OBJ-A (objective_evidence ledger)
Layer 2: Internal Consumption ✅ OBJ-B (objective_status_display reads ledger)
Layer 3: Visibility           ✅ OBJ-C (operator sees evidence summary)
Layer 4: New Sources          📋 DOCTRINE-A (9 types added)
Layer 5: Higher Consumption   🔵 OBJ-D (objectives use doctrine)
```

---

## DECISION CHECKPOINT

**Question:** Should we store evidence that the operator cannot see?

**Answer (per this audit):** No.

**Consequence:** Before adding Doctrine-A (more stored evidence), implement OBJ-C (make stored evidence visible).

---

## SUMMARY

| Item | Status | Reason |
|---|---|---|
| Combat Evidence Stored | ✅ | OBJ-A |
| Combat Evidence Consumed | ⚠️ | OBJ-B (implicit) |
| Combat Evidence Visible | ❌ | No display panel |
| Readiness Evidence Stored | ✅ | READINESS-A |
| Readiness Evidence Consumed | ❌ | No consumer |
| Readiness Evidence Visible | ❌ | No display |
| Doctrine Evidence Planned | 📋 | DOCTRINE-A (queued) |
| Next Implementation | 🔵 | OBJ-C (Evidence Display) |
| Doctrine-A Timing | ⏸️ | After OBJ-C proves value |

---

## ARCHITECTURAL PRINCIPLE

**"Stored evidence that is not visible to the operator is technical debt, not a feature."**

OBJ-C addresses this by making the ledger visible and actionable, proving the evidence system delivers value before adding more sources.

