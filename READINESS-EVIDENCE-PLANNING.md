# Readiness Evidence Planning — New Evidence Source

**Date:** 2026-06-03  
**Scope:** Design readiness as a new evidence source (planning only, no code)  
**Goal:** Add readiness evidence to objective_evidence ledger using existing fields only

---

## 1. CURRENT READINESS FIELDS AUDIT

### Unit-Level Fields (Already Exist)

**Location:** `ws.units[uid]`

| Field | Type | Current Values | Source | Used For |
|---|---|---|---|---|
| `strength` | number | 0..2.5 (from scenario, modified by damage) | DB1 + WS3 (ENGAGE) | Balance calculation, unit capability |
| `status` | string | null, 'DESTROYED', 'DEGRADED' | WS3 (damage gate) | Unit operational state |
| `readiness` | string | 'ready', 'limited', 'not_ready' (authored) | Scenario + WS3 decisions | Operator state for display |
| `supply` | number | 0..1 (fraction, authored) | Scenario + WS3 decisions | Supply consumption tracking |
| `suppressed_pct` | number | null or 0..100 (authored) | Scenario | Suppression level |

### Engagement Context (Already Exists)

**Location:** `ws.derived.engagement_outcomes[]`

| Field | Type | Relevance to Readiness |
|---|---|---|
| `shooter.uid` | string | Which unit fired (consumed ammunition) |
| `target.uid` | string | Which unit was engaged (took damage) |
| `status` | string | 'engaged' or 'blocked' (if blocked: couldn't fight back) |
| `pk_kill` | number | Damage dealt (affects target strength) |
| `weapon` | string | Weapon type (ammo consumption pattern) |
| `salvo` | number | Rounds fired (magazine depletion) |

### Balance Summary (Already Exists)

**Location:** `ws.derived.balance_summary`

| Field | Relevance to Readiness |
|---|---|
| `force_ratio_value` | Overall combat capability ratio |
| `losses.blue_destroyed` | Unit losses (readiness impact) |
| `losses.blue_total` | Force size |
| `losses.red_company_equivalent` | RED attrition |

---

## 2. MINIMAL READINESS EVIDENCE MODEL

### Design Principle

**Readiness = Operational Capability After Engagement**

Derived from existing fields only:
- Unit strength (0..2.5) → operational effectiveness
- Unit status (null / DESTROYED / DEGRADED) → combat availability
- Engagement outcomes → ammunition consumption, casualties
- Supply level (0..1) → logistical sustainability

**NOT included (deferred):**
- Maintenance backlog (requires maintenance module)
- Personnel state (requires crew module)
- Fatigue (requires time-tracking module)
- Doctrine ROE (requires doctrine module)
- AI preference (deferred)

---

## 3. EVIDENCE RECORD TYPES

### Type 1: Unit Operational Capability
```
evidence_type: "unit_strength_avg"
source: "engagement_outcomes + balance_summary"
value: number (0..1, normalized from strength 0..2.5)
confidence: 0.85

Calculation:
  per_unit_strength = (unit.strength - 0.5) / 2.0  // normalize to 0..1
  avg = sum(per_unit_strength) / side_unit_count
  
Purpose: Measure post-engagement unit operational effectiveness
Range: 0 (all destroyed/damaged) to 1 (all full strength)
```

### Type 2: Force Availability
```
evidence_type: "force_availability_ratio"
source: "balance_summary.losses + engagement_outcomes"
value: number (0..1, ratio of active to total units)
confidence: 1.0

Calculation:
  active_units = total_units - destroyed_units
  availability = active_units / total_units
  
Purpose: What percentage of force can still fight
Range: 0 (all destroyed) to 1 (all active)
```

### Type 3: Ammunition State
```
evidence_type: "ammunition_sustainability"
source: "engagement_outcomes (salvo consumption)"
value: number (0..1, estimated remaining ammo)
confidence: 0.75

Calculation:
  Based on engagement_outcomes cumulative salvo fired
  Estimate remaining rounds in magazines
  Normalize to 0..1 (0 = out of ammo, 1 = full magazines)
  
Purpose: Can units continue offensive operations
Range: 0 (depleted) to 1 (full)
Fallback: 1.0 (if no engagement data available)
```

### Type 4: Supply Status
```
evidence_type: "supply_sustainability"
source: "ws.units[].supply (authored field)"
value: number (0..1, supply level)
confidence: 0.7

Calculation:
  avg_supply = sum(unit.supply) / unit_count
  
Purpose: Can units sustain operations logistically
Range: 0 (no supply) to 1 (fully supplied)
Note: Authored value; no consumption formula yet (deferred to logistics)
```

### Type 5: Combat Readiness State
```
evidence_type: "combat_readiness_state"
source: "ws.units[].readiness (authored field)"
value: string enum ('ready' | 'limited' | 'not_ready')
confidence: 0.8

Purpose: Operator-declared readiness state
Values: 
  'ready' → unit can fight
  'limited' → unit can fight but at reduced capacity
  'not_ready' → unit cannot engage
Note: Authored value; set via WS3 SET_READINESS decision
```

### Type 6: Casualty Impact
```
evidence_type: "casualty_rate"
source: "balance_summary.losses"
value: number (0..1, fraction of force lost)
confidence: 0.9

Calculation:
  casualties = destroyed_units / total_units
  casualty_rate = min(1.0, casualties)
  
Purpose: Impact of losses on force effectiveness
Range: 0 (no losses) to 1 (all units lost)
```

---

## 4. READINESS EVIDENCE CONTRIBUTOR

### Function Structure

```
function computeReadinessEvidence(ws) {
  // Input: ws.units[], ws.derived.engagement_outcomes, ws.derived.balance_summary
  // Output: array of evidence records
  
  // For BLUE side only (or adapt for both sides)
  const blueUnits = ws.units.filter(u => u.side === 'BLUE' && !u.off_map);
  
  // Record 1: unit_strength_avg
  // Record 2: force_availability_ratio
  // Record 3: ammunition_sustainability
  // Record 4: supply_sustainability
  // Record 5: combat_readiness_state
  // Record 6: casualty_rate
  
  return [...records];
}
```

### Contributor Contract

| Record Type | Input Fields | Confidence | Fallback |
|---|---|---|---|
| unit_strength_avg | strength, status | 0.85 | null |
| force_availability_ratio | total_units, destroyed_units | 1.0 | 1.0 (no losses) |
| ammunition_sustainability | engagement_outcomes.salvo | 0.75 | 1.0 (no engagements) |
| supply_sustainability | supply | 0.7 | 0.5 (unknown) |
| combat_readiness_state | readiness | 0.8 | 'ready' (default) |
| casualty_rate | destroyed_units, total_units | 0.9 | 0.0 (no losses) |

---

## 5. INTEGRATION INTO OBJECTIVE_EVIDENCE

### Ledger Extension

**Addition to objective_evidence computation:**

```javascript
function computeObjectiveEvidence(ws) {
  // ... existing contributors (balance, bls, engagements, contacts) ...
  
  // NEW: readiness evidence
  ledger.records.push(...contributeReadinessEvidence(ws, obj_id));
  
  return ledger;
}
```

### New Evidence in Ledger

Example objective_evidence array after readiness added:

```javascript
ws.derived.objective_evidence = [
  // ... existing records (force_ratio, blue_destroyed, etc.) ...
  
  // NEW: readiness records
  {
    objective_id: "alpha",
    evidence_type: "unit_strength_avg",
    value: 0.72,
    source: "engagement_outcomes + balance_summary",
    confidence: 0.85,
    step_index: 5
  },
  {
    objective_id: "alpha",
    evidence_type: "force_availability_ratio",
    value: 0.94,
    source: "balance_summary.losses",
    confidence: 1.0,
    step_index: 5
  },
  // ... more readiness records ...
]
```

---

## 6. DEPENDENCIES

### Hard Dependencies (Must Exist)

✅ ws.units[] with strength, status, readiness, supply fields  
✅ ws.derived.balance_summary (losses, unit counts)  
✅ ws.derived.engagement_outcomes (salvo, target uid)  
✅ objective_evidence ledger (OBJ-A)  
✅ DERIVATIONS registry (OBJ-B)

### Soft Dependencies (Would Enhance But Not Required)

⚠️ Magazine tracking (to calculate ammunition accurately)  
⚠️ Crew/maintenance state (deferred to later)  
⚠️ Time tracking (to calculate supply drain rate)  
⚠️ Doctrine (to apply combat multipliers)

---

## 7. RISKS & MITIGATIONS

### Risk 1: Readiness Authored but Not Consumed

**Problem:** `ws.units[].readiness` is authored but objective logic doesn't use it yet  
**Mitigation:**
- Store as evidence (ready for future OBJ-C consumption)
- Don't change objective_status_display yet (deferred to OBJ-D+)
- Mark as "awaiting interpretation" in comments

### Risk 2: Ammunition Calculation Inaccurate

**Problem:** Inferring magazine state from engagements is estimated, not authoritative  
**Mitigation:**
- Set confidence to 0.75 (lower than direct measurements)
- Fallback to 1.0 if no engagement data (assume full)
- Note: real ammo tracking deferred to DB2

### Risk 3: Supply Level Never Changes

**Problem:** Current `ws.units[].supply` is authored, no consumption formula  
**Mitigation:**
- Store authored value as-is (confidence: 0.7)
- Note in description: "awaiting logistics consumption formula"
- Add supply-change evidence later when logistics module exists

### Risk 4: Casualty Rate vs. Strength Redundancy

**Problem:** casualty_rate and unit_strength_avg both reflect losses  
**Mitigation:**
- casualty_rate: binary count (units destroyed)
- unit_strength_avg: continuous measure (strength 0..2.5)
- Both are useful; different perspectives on readiness

### Risk 5: Missing Suppression State

**Problem:** `suppressed_pct` exists but not used in readiness  
**Mitigation:**
- Defer suppression evidence to later (when suppression mechanics clarified)
- Note: suppressed units aren't destroyed but are combat-ineffective

---

## 8. TESTS

### Unit Tests (6 assertions per type × 6 types = 36 core assertions)

**Type 1: unit_strength_avg**
```
✓ computed from all units in force
✓ normalized to 0..1 range
✓ reflects destroyed units (strength → 0)
✓ reflects damaged units (0 < strength < 1)
✓ accounts for off_map units (excluded)
```

**Type 2: force_availability_ratio**
```
✓ ratio = active / total units
✓ returns 1.0 when no casualties
✓ returns 0.0 when all destroyed
✓ accounts for off_map units
✓ matches balance_summary.losses
```

**Type 3: ammunition_sustainability**
```
✓ estimated from engagement_outcomes.salvo
✓ fallback to 1.0 if no engagements
✓ decreases with fired salvos
✓ confidence is 0.75
```

**Type 4: supply_sustainability**
```
✓ average of unit.supply values
✓ fallback to 0.5 if missing
✓ matches authored supply level
✓ confidence is 0.7
```

**Type 5: combat_readiness_state**
```
✓ reads unit.readiness field
✓ enum values: ready | limited | not_ready
✓ fallback to 'ready' if missing
✓ confidence is 0.8
```

**Type 6: casualty_rate**
```
✓ fraction of units destroyed
✓ returns 0 if no losses
✓ returns 1.0 if all destroyed
✓ confidence is 0.9
```

### Integration Tests (7 assertions)

```
✓ readiness evidence records created
✓ all records have objective_id
✓ all records have valid source ('engagement_outcomes', 'balance_summary', etc.)
✓ all records have confidence in [0, 1]
✓ no weights or scoring added
✓ objective_status_display unchanged (parity gate)
✓ deterministic (same step → same evidence)
```

### Regression Tests (5 assertions)

```
✓ 100+ scenario steps produce valid evidence
✓ step 5 with engagements → accurate ammunition estimate
✓ step 0 with no engagements → ammunition defaults to 1.0
✓ supply values preserved from scenario
✓ readiness values preserved from authored state
```

---

## 9. SUCCESS CRITERIA

✅ **Schema Defined**
- 6 evidence types designed
- Each record structure specified
- Confidence values assigned

✅ **Minimal Scope**
- Uses only existing fields (strength, status, readiness, supply, engagement_outcomes)
- No new formulas (except normalization)
- No maintenance, personnel, fatigue, doctrine, AI, logistics

✅ **Contributor Specified**
- Input fields identified
- Fallback values defined
- Integration point clear (objective_evidence ledger)

✅ **Dependencies Clear**
- Hard dependencies: existing WS fields
- Soft dependencies: deferred modules noted

✅ **Risks Identified & Mitigated**
- 5 risks enumerated
- Mitigation strategy for each
- Deferred work explicit

✅ **Tests Planned**
- 36 core unit test assertions (6 types × 6 assertions)
- 7 integration test assertions
- 5 regression test assertions
- Total: 48 planned assertions

✅ **Ready for Implementation**
- No code written (planning only)
- No changes to objective_status_display
- No changes to damage logic
- Evidence ready to plug into ledger

---

## 10. READINESS EVIDENCE AT A GLANCE

### Before (Readiness Absent)
```
World State
  └─ Balance Summary
      └─ Objective Evidence (balance, BLS, engagements, contacts)
          └─ Objective Status Display
```

### After (Readiness Evidence Added)
```
World State
  ├─ Balance Summary
  ├─ Engagement Outcomes
  └─ Units (strength, status, readiness, supply)
      └─ Objective Evidence (balance, BLS, engagements, contacts, READINESS)
          └─ Objective Status Display (unchanged consumer)
```

### What's New
- 6 readiness evidence types
- Unit operational capability perspective
- Ammunition sustainability estimate
- Force availability metric
- Supply status tracking
- Combat readiness state (authored)

### What's NOT New
- No formulas for maintenance, fatigue, personnel
- No changes to objective logic
- No supply consumption (awaiting logistics)
- No doctrine integration (awaiting doctrine module)
- No AI scoring (awaiting AI layer)

---

## 11. NEXT STEPS

**After approval:**

1. **Implementation (READINESS-A):**
   - Add `computeReadinessEvidence()` function
   - Add to DERIVATIONS registry
   - Create test-readiness-evidence.js (48 assertions)

2. **Verification:**
   - All 48 test assertions pass
   - objective_status_display unchanged
   - evidence ledger extended with readiness records

3. **Decision:**
   - Doctrine Evidence (OBJ-C)
   - Logistics Evidence (OBJ-D)
   - DB2 (orthogonal persistence layer)

---

**Readiness Evidence: Minimal, Extensible, Ready for Design Approval.**

