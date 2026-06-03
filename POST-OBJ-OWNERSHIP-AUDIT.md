# POST-OBJ OWNERSHIP AUDIT — World State Derivation Spine

**Date:** 2026-06-03  
**Purpose:** Map current evidence ownership after OBJ-A implementation  
**Status:** Complete

---

## OWNERSHIP CHAIN: UNITS → EVIDENCE → OBJECTIVES

### Current Ownership Map

```
UNITS (live state)
├─ strength (via ENGAGE decision in WS3)
├─ status (DESTROYED via damage gate in WS3)
├─ position (via MOVE decision in WS3)
├─ side (RED|BLUE)
├─ echelon (affects operational weight)
└─ sensors/weapons/magazines (from DB1)
    ↓
DERIVED FIELDS (computed once per step):
│
├─ balance_summary (WS4 computation)
│  ├─ force_ratio_value (echelon-weighted forces)
│  └─ losses { blue_destroyed, blue_total, red_company_equivalent }
│
├─ bls_status (WS-BLS-B computation)
│  └─ { [bls_id]: STAGED|SECURED|DENIED|CONTESTED }
│
├─ contacts (WS-DET1-A computation)
│  └─ [{ target_uid, detected_by_side, confidence, range_nm }]
│
├─ engagement_outcomes (WS-ENG1-A computation)
│  └─ [{ shooter, target, status, pk_kill, weapon, salvo, ... }]
│
└─ objective_evidence (OBJ-A computation) ← NEW
   └─ [{ objective_id, evidence_type, value, source, confidence, step_index }]
       ↓
      objective_status_display (unchanged logic, reads balance_summary directly)
       ↓
      Map/HUD Rendering
```

---

## EVIDENCE OWNERSHIP SUMMARY

| Evidence Source | Exists | Owner | World State Location | Consumer | Status |
|---|---|---|---|---|---|
| Force Ratio | ✓ YES | balance_summary | ws.derived.balance_summary.force_ratio_value | objective_status_display | ✅ OWNED |
| Blue Destroyed | ✓ YES | balance_summary | ws.derived.balance_summary.losses.blue_destroyed | objective_status_display | ✅ OWNED |
| Blue Intact % | ✓ YES | balance_summary | computed from losses | objective_status_display | ✅ OWNED |
| Red Company Equiv | ✓ YES | balance_summary | ws.derived.balance_summary.losses.red_company_equivalent | objective_status_display | ✅ OWNED |
| BLS Control Count | ✓ YES | bls_status | ws.derived.bls_status | objective_evidence | ✅ OWNED |
| BLS Contested Count | ✓ YES | bls_status | ws.derived.bls_status | objective_evidence | ✅ OWNED |
| Engagement Outcomes | ✓ YES (WS-ENG1-A) | World State Transition | ws.derived.engagement_outcomes[] | objective_evidence + map | ✅ OWNED |
| Engagement Effectiveness | ✓ YES | engagement_outcomes | computed ratio | objective_evidence | ✅ OWNED |
| Contact Confidence | ✓ YES | contacts | ws.derived.contacts | objective_evidence | ✅ OWNED |
| Objective Status | ✓ YES | scenario (authored) | ws.objectives[].status | objective_status_display | ✅ OWNED |
| Readiness (unit) | ✓ YES | scenario (authored) | ws.units[].readiness | (unused, future) | ⚠️ AWAITING |
| Readiness Summary | ✗ NO | — | — | (future OBJ-B+) | — |
| Doctrine | ✗ NO | — | — | (future OBJ-C+) | — |
| Logistics | ✗ NO | — | — | (future OBJ-D+) | — |

---

## DERIVATION EXECUTION ORDER

```
STEP 1: balance_summary
  Input: ws.units[] (strength, status, echelon, side)
  Output: force_ratio_value, losses
  Used by: objective_status_display (direct), objective_evidence (indirect)

STEP 2: bls_status
  Input: ws.lines.bls[], ws.units[] (position, status)
  Output: { [bls_id]: control_state }
  Used by: objective_evidence, map rendering

STEP 3: contacts
  Input: ws.units[] (sensors, RCS, position)
  Output: [{ target_uid, detected_by_side, confidence }]
  Used by: objective_evidence, map/HUD for detection overlay

STEP 4: objective_evidence ← NEW
  Input: balance_summary, bls_status, engagement_outcomes, contacts
  Output: [{ objective_id, evidence_type, value, source, confidence, step_index }]
  Used by: (storage only; consumption deferred to OBJ-B)

STEP 5: objective_status_display
  Input: ws.objectives[].status (authored), balance_summary (direct)
  Output: DORMANT|THREATENED|CONTESTED|DENIED|CAPTURED
  Used by: map/HUD rendering (unchanged)
```

---

## OWNERSHIP INVERSION SEQUENCE

**Wave 1 (WS-DET1-A):** Ownership inversion for contacts
- Before: Map recomputed contacts on every render
- After: Contacts owned by World State, computed once per step
- Benefit: Deterministic detection

**Wave 2 (WS-ENG1-A):** Ownership inversion for engagement outcomes
- Before: Map recomputed engagements on every render
- After: Outcomes owned by World State, computed once per decision
- Benefit: Deterministic damage, no recomputation

**Wave 3 (OBJ-A):** Aggregation point for objective evidence
- Before: Evidence implicit in objective_status_display conditions
- After: Evidence explicit in objective_evidence ledger
- Benefit: Auditable, extensible for future layers

---

## FUTURE OWNERSHIP EXPANSION

**OBJ-B (Refactor Consumer):**
- objective_status_display reads objective_evidence instead of balance_summary
- Output unchanged (parity gate)
- Evidence consumption begins

**Readiness (OBJ-C+):**
- New contributor: readiness_summary
- New evidence types: blue_readiness_avg, red_readiness_avg, unit_cohesion
- Evidence ledger expanded; objective logic unchanged

**Doctrine (OBJ-D+):**
- New contributor: doctrine_engine
- New evidence types: objective_priority, doctrine_compliance
- Evidence ledger expanded; objective logic unchanged

**Logistics (OBJ-E+):**
- New contributor: logistics_summary
- New evidence types: throughput_available, supply_drain
- Evidence ledger expanded; objective logic unchanged

---

## WORLD STATE DERIVATIONS REGISTRY (COMPLETE)

```javascript
var DERIVATIONS = {
  balance_summary:          computeBalanceSummary,        // WS4
  bls_status:               computeBlsStatusB,             // WS-BLS-B
  contacts:                 computeContacts,               // WS-DET1-A
  objective_evidence:       computeObjectiveEvidence,      // OBJ-A ← NEW
  objective_status_display: computeObjectiveStatusDisplay  // WS2 (unchanged)
};
```

**Order matters:** balance_summary → bls_status → contacts → objective_evidence → objective_status_display

---

## PARITY GATES (FALLBACK PROTECTION)

All consumers use parity gates to fallback to authored data if World State not available:

| Consumer | World State Path | Fallback | Condition |
|---|---|---|---|
| objective_status_display | ws.derived.balance_summary | state.balance | if degraded scenario |
| map rendering | ws.derived.bls_status | state.bls_status | if degraded scenario |
| map rendering | ws.derived.contacts | state.contacts | if degraded scenario |
| (future OBJ-B) | ws.derived.objective_evidence | ws.derived.balance_summary | if degraded scenario |

---

## KEY ARCHITECTURAL DECISIONS

**1. Evidence Storage vs. Interpretation**
- OBJ-A stores evidence (pure aggregation)
- OBJ-B+ interprets evidence (reweighting, scoring)
- Separation allows independent iteration

**2. Flat Array Schema**
- Enables filtering by objective_id, source, evidence_type
- Supports future evidence sources without schema change
- No nesting; no weights; no interpretation

**3. Deterministic Computation**
- All derivations are pure functions
- Same unit state → same evidence
- No RNG; no timestamps; idempotent

**4. Order-Dependent Derivations**
- balance_summary must run first (needed by other derivations)
- objective_evidence must run after all sources
- objective_status_display must run last (unchanged logic)

---

## OWNERSHIP COVERAGE

**Evidence Sources Owned by World State: 9/9 (100%)**
- ✅ force_ratio
- ✅ blue_destroyed_count
- ✅ blue_intact_ratio
- ✅ red_company_equivalent
- ✅ bls_control_count
- ✅ bls_contested_count
- ✅ engagement_outcomes_total
- ✅ engagement_effectiveness_ratio
- ✅ contact_confidence_summary

**Future Evidence Sources (Placeholder Contracts): 5**
- ⚠️ readiness_summary (OBJ-C)
- ⚠️ doctrine_engine (OBJ-D)
- ⚠️ logistics_summary (OBJ-E)
- ⚠️ morale_cohesion (OBJ-F)
- ⚠️ maintenance_status (OBJ-G)

---

## CONSUMER PATH VERIFICATION

**Current Consumers (OBJ-A):**
- objective_status_display: Reads balance_summary (unchanged)
- Map/HUD: Reads objective_status_display (unchanged output)
- objective_evidence: Consumed by nobody (storage only)

**Future Consumers (OBJ-B+):**
- objective_status_display: Will read objective_evidence (refactored)
- Map detail panel: Will read objective_evidence (UI enhancement)
- AI COA grading: Will read objective_evidence (future)

---

## ARCHITECTURE MATURITY

World State Ownership Spine Status:

```
WS1 (projection):        ✅ COMPLETE
  └─ deriveWorldState()

WS2 (objective status):  ✅ COMPLETE
  └─ computeObjectiveStatusDisplay()

WS2.5 (derivations):     ✅ COMPLETE
  └─ DERIVATIONS registry

WS3 (transitions):       ✅ COMPLETE
  └─ applyDecision() + resolveEngagement()

WS4 (balance):           ✅ COMPLETE
  └─ computeBalanceSummary()

WS-DET1-A (contacts):    ✅ COMPLETE
  └─ computeContacts()

WS-ENG1-A (engagements): ✅ COMPLETE
  └─ Outcomes in ws.derived.engagement_outcomes

OBJ-A (evidence):        ✅ COMPLETE
  └─ ws.derived.objective_evidence ledger

OBJ-B (consumer):        🔵 PLANNED
  └─ objective_status_display reads evidence ledger

OBJ-C+ (future):         🔵 PLANNED
  └─ readiness, doctrine, logistics contributors
```

**The World State spine is solid and extensible.** Evidence ownership is clear. Future layers plug in without changing objective core logic.

