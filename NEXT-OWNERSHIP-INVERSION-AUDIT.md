# Next Ownership Inversion Audit
## What Comes After WS-DET1-A?

**Date:** 2026-06-03  
**Context:** DET1 contacts now World State owned. Which field/subsystem should be inverted next?

---

## Candidate Analysis

### 1. ENG1 Outcomes (Engagement Results)

**Current Owner:** ENG1 module (called on-demand from transition layer)  
**Target Owner:** World State DERIVATIONS (computed once per decision, stored in ws.derived.engagements)  

**Dependencies:**
- ✅ DET1 (contacts must exist — just finished)
- ✅ WS3 transition (decision application)
- ⏳ Damage tracking (units must track strength/status changes)

**Simulation Value:** ⭐⭐⭐⭐⭐ (CRITICAL)
- Engagements drive attrition — core loop that advances the battle
- Without centralized ENG1 outcomes, unit degradation is untracked
- AI/doctrine decisions depend on knowing engagement effectiveness
- Foundation for casualty tracking and readiness computation

**Complexity:** HIGH
- Must integrate damage application into World State
- Must track engagement history (what happened, to whom, when)
- Must compute probability → actual outcome (stochastic → deterministic)
- Risk of breaking ENG1 probability models during ownership inversion

**Risk:** ⚠️ VERY HIGH
- Any bug breaks attrition tracking
- Engagements are central to simulation coherence
- Affects every downstream feature (doctrine, readiness, supply)
- Database schema must track engagement results

**Required Before DB2?** YES
- DB2 schema must track engagement history (outcomes, casualties, damage per unit)

**Required Before MTH1?** YES — CRITICAL
- MTH1 (military theory handler) evaluates doctrine effectiveness
- Without knowing actual engagement outcomes, doctrine layer is blind

**Complexity Score:** 8/10

---

### 2. Objective Evidence (Ground Truth State)

**Current Owner:** Scattered (no single authority)
- Some effects applied directly (damage, supply consumed)
- Some computed ad-hoc (what units see, what happened)
- No centralized "this is what actually occurred" record

**Target Owner:** World State DERIVATIONS
- Compute actual outcome state after each decision (deterministic, auditable, repeatable)
- Store in ws.derived.evidence (or ws.derived.actual_state)
- Single source of truth for "what happened in this step"

**Dependencies:**
- ✅ DET1 (what was detected)
- ⏳ ENG1 (what damage occurred)
- ⏳ Damage tracking (units updated)
- ⏳ Supply tracking (resources consumed)

**Simulation Value:** ⭐⭐⭐⭐⭐ (CRITICAL)
- Without ground truth, no feature can trust the simulation state
- AI CoA evaluation depends on knowing actual outcomes
- Doctrine layer must audit what actually happened vs. what was ordered
- Debugging/explainability impossible without objective evidence

**Complexity:** VERY HIGH
- Requires "commit semantics" — when is a change committed to the world?
- Must track both intended (decision) and actual (outcome) state
- Stochastic outcomes (engagement kill probabilities) must map to deterministic results
- Must be auditable and reproducible

**Risk:** ⚠️ EXTREMELY HIGH
- Conceptually the hardest problem (what is "ground truth" in a simulation?)
- Touches every subsystem
- If evidence is inconsistent, entire doctrine layer fails
- Must be done carefully or it cascades

**Required Before DB2?** YES — FOUNDATIONAL
- DB2 schema depends on having coherent evidence to persist

**Required Before MTH1?** YES — BLOCKER
- MTH1 cannot function without knowing actual outcomes

**Complexity Score:** 9/10

---

### 3. Phase-line Status (Control/Objectives)

**Current Owner:** World State DERIVATIONS (BLS-B is already owned by WS)  
**Status:** ✅ ALREADY INVERTED

- BLS status (STAGED/SECURED/DENIED/CONTESTED) computed in DERIVATIONS
- Uses parity gates and degraded checks
- All consumers read from ws.derived.bls_status

**Simulation Value:** ⭐⭐⭐⭐ (HIGH)
- Control status drives doctrine decisions
- Affects objectives and mission success/failure
- Needed for AI COA evaluation

**Complexity:** ✅ DONE (no action needed)

**Risk:** ✅ LOW (already implemented, tested)

**Complexity Score:** 0/10 (completed)

---

### 4. Readiness (Unit Combat Effectiveness)

**Current Owner:** Authored/manual (units have readiness field but it's static)  
**Target Owner:** World State DERIVATIONS
- Compute readiness from damage, supply, maintenance state
- Update as side effects of decisions (damage reduces readiness, supply consumed, etc.)
- Store in ws.derived.unit_readiness (or as part of unit enrichment)

**Dependencies:**
- ✅ DET1 (what units can detect depends on readiness)
- ⏳ ENG1 (engagement outcomes reduce readiness)
- ⏳ Objective evidence (must know actual damage taken)
- ⏳ Supply tracking (consumed resources reduce readiness)
- ⏳ Maintenance model (units degrade over time without maintenance)

**Simulation Value:** ⭐⭐⭐⭐ (HIGH)
- Units currently fight at full strength until destroyed
- Unrealistic — real units degrade with damage, low supply, fatigue
- Affects all doctrine decisions (which unit can do what)
- Critical for realistic CMO modeling

**Complexity:** HIGH
- Readiness formula: damage % + supply depletion % + fatigue × factors
- Must be editable (operators can set readiness multipliers)
- Affects detection ranges, engagement effectiveness, movement
- Cascades through DET1 and ENG1

**Risk:** ⚠️ HIGH
- Changes how units behave throughout the simulation
- Affects detection (readiness affects radar effectiveness)
- Affects engagement (damaged units may have lower hit probability)
- Schema expansion (units need supply_current, damage_severity, fatigue)

**Required Before DB2?** YES
- DB2 must track readiness evolution and recovery

**Required Before MTH1?** YES
- MTH1 makes readiness-based decisions (preserve weak units, rest fatigued units)

**Complexity Score:** 7/10

---

### 5. Remaining Mirrored Fields

**Examples:**
- Unit status (ACTIVE, DAMAGED, DEGRADED, DESTROYED)
- Casualty tracking (personnel losses per unit)
- Weapon status (damaged weapons, ammo tracking)
- Supply levels (fuel, ammo, food, water per unit)
- Morale/fatigue (unit effectiveness degradation over time)
- Maintenance state (when was last maintenance, what needs repairs)

**Current Owner:** Scattered or missing
- Some units have status field (DESTROYED)
- Some computed in ENG1 but not stored in WS
- Some authored but never updated
- Some completely missing

**Target Owner:** World State DERIVATIONS
- Consolidate all unit state fields into coherent model
- Compute from damage, supply, maintenance history
- Store in ws.derived.units_enriched (or enrich units directly)

**Dependencies:**
- ✅ DET1, ⏳ ENG1, ⏳ Objective evidence, ⏳ Readiness (everything above)

**Simulation Value:** ⭐⭐⭐ (MEDIUM-HIGH)
- Consequences of engagement outcomes (casualties, damage)
- Driven by readiness model
- Needed for realistic unit degradation

**Complexity:** MEDIUM-HIGH
- Dependent on ENG1 and readiness being finalized
- Complex interactions (damage affects readiness, affects detection, affects engagement outcome)
- Cycles: engagement → damage → readiness change → detection change → next engagement

**Risk:** ⚠️ MEDIUM-HIGH
- Mirrored in multiple places (units, history, doctrine layer)
- Easy to get inconsistencies if not carefully owned
- Must be consolidated into single World State source

**Required Before DB2?** YES
- DB2 schema depends on having coherent unit state model

**Required Before MTH1?** YES
- MTH1 makes decisions based on unit state

**Complexity Score:** 6/10

---

## Synthesis & Recommendation

### Dependency Chain (Critical Path)

```
WS-DET1-A ✅
    ↓
WS-ENG1-A (Engagement Outcomes)
    ↓
WS-OBJ-A (Objective Evidence / Ground Truth)
    ↓
WS-READY-A (Readiness Computation)
    ↓
WS-STATE-A (Consolidate Remaining Fields)
    ↓
DB2 (Expand data schema to track history)
    ↓
MTH1 (Military Theory Handler / Doctrine)
```

### Recommendation Matrix

| Candidate | Simulation Value | Complexity | Blocker? | Recommendation |
|-----------|------------------|------------|----------|---|
| **ENG1 Outcomes** | ⭐⭐⭐⭐⭐ | 8/10 | YES (DB2, MTH1) | **🟢 NEXT** — Do immediately after DET1 |
| **Objective Evidence** | ⭐⭐⭐⭐⭐ | 9/10 | YES (critical) | 🟡 PLAN (do after ENG1, before DB2) |
| **Phase-line Status** | ⭐⭐⭐⭐ | 0/10 | NO | ✅ DONE (skip) |
| **Readiness** | ⭐⭐⭐⭐ | 7/10 | YES (MTH1) | 🟡 DO (after Objective Evidence) |
| **Remaining Fields** | ⭐⭐⭐ | 6/10 | NO | 🟡 CONSOLIDATE (after Readiness) |

---

## Detailed Recommendation: Next Ownership Inversion

### **WS-ENG1-A: Engagement Outcomes to DERIVATIONS**

**Why Now?**
- ✅ DET1 is complete (contacts ready to feed ENG1)
- ✅ DB2 and MTH1 are both blocked waiting for this
- ✅ No other prerequisites (ENG1 is independent of readiness/supply)
- 🔴 Without this, all downstream features are blind

**What to Invert:**
```
BEFORE: ENG1.computeEngagements(units, contacts) → { recs, effects }
        Effects applied ad-hoc to units (strength -= damage, etc.)
        No record of what happened
        
AFTER:  WS.DERIVATIONS.computeEngagements(ws) → ws.derived.engagements
        stores: [{ shooter_uid, target_uid, hit, damage, casualties, outcome }]
        all consumers read from ws.derived.engagements
        map/HUD/AI/doctrine read from World State, not calling ENG1
```

**Scope (Locked):**
- Compute engagement outcomes (hit/miss, damage)
- Store in World State
- All consumers read from WS
- NO changes to engagement formulas (keep ENG1 math intact)
- NO AI changes
- NO readiness/supply integration (leave for later)
- NO doctrine changes

**Complexity:** 8/10 (high but manageable)
- Integrate damage application into transition layer
- Replace "effects applied ad-hoc" with "effects stored in ws.derived"
- Update map/HUD to read from ws.derived.engagements
- Keep ENG1 formulas unchanged

**Risk:** Medium-high (engagements are central, but WS ownership is proven by DET1)

**Estimated Effort:** ~60-80 lines changed (similar to DET1-A)

**Unblocks:**
- 🟢 DB2 schema design (now has engagement history to persist)
- 🟢 MTH1 doctrine layer (can now see actual outcomes)
- 🟢 Objective evidence work (has concrete engagement data to build on)

---

## Alternative: Objective Evidence First?

**Argument for skipping ENG1 and doing Objective Evidence:**
- "Ground truth is conceptually foundational"
- "Everything depends on knowing what actually happened"

**Counter-argument (Recommendation):**
- ENG1 is more concrete and lower-risk
- Objective evidence is philosophically harder (when exactly is a state committed?)
- Better to do ENG1 first, then use engagement data to build objective evidence model
- ENG1-A + OBJ-A together create a coherent evidence trail

---

## Summary

```
┌─────────────────────────────────────────────────┐
│  RECOMMENDED NEXT OWNERSHIP INVERSION           │
├─────────────────────────────────────────────────┤
│  WS-ENG1-A: Engagement Outcomes to DERIVATIONS │
│                                                 │
│  Why:  DET1 ✅ → ENG1 ⏳ → OBJ ⏳ → DB2 ⏳    │
│  Risk: Medium-high (but proven pattern)        │
│  Value: Blocks DB2 + MTH1 (highest impact)    │
│  Scope: Locked (engagement formulas unchanged) │
│  Effort: ~70 lines (similar to DET1-A)         │
│                                                 │
│  Then: OBJ-A → READY-A → STATE-A → DB2 → MTH1 │
└─────────────────────────────────────────────────┘
```

**Proceed with planning WS-ENG1-A after stakeholder approval.**
