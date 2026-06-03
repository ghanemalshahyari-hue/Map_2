# OBJ-A Planning — Objective Evidence Ledger

**Date:** 2026-06-03  
**Scope:** Design evidence ledger ownership (no code, no formula changes)  
**Goal:** Create `ws.derived.objective_evidence` as auditable evidence collection point

---

## 1. ARCHITECTURE OVERVIEW

### Current State (What Exists)
```
Units (strength, status, echelon, side)
    ↓
balance_summary (computed: force_ratio, losses)
    ↓
objective_status_display (re-litigates CAPTURED status)
    ↓
Map/HUD renders status
```

Evidence is implicit inside `objective_status_display` conditions.

### Proposed State (OBJ-A)
```
Units
├─→ balance_summary (FR, losses)
├─→ bls_status (control per BLS)
├─→ engagement_outcomes (hits, damage)
├─→ contacts (confidence summary)
└─→ [future: readiness, doctrine, logistics]
        ↓
    objective_evidence (ledger)
    [explicit evidence records]
        ↓
    objective_status_display
    (unchanged consumer; reads ledger)
        ↓
    Map/HUD renders status
```

**Key difference:** Evidence becomes a first-class, auditable artifact.

---

## 2. SCHEMA DESIGN

### 2.1 Objective Evidence Ledger

**Path:** `ws.derived.objective_evidence`

**Type:** Array of evidence ledgers (one per objective per step)

**Root structure:**
```javascript
ws.derived.objective_evidence = [
  {
    // Identity
    id: "obj-alpha_step-5_evidence",
    objective_id: "alpha",
    step_index: 5,
    
    // Ledger records
    records: [
      { record shape — see below },
      { record shape — see below },
      ...
    ],
    
    // Metadata
    computed_at_step: 5,
    source: "DERIVATIONS.computeObjectiveEvidence",
    version: "OBJ-A.1"
  }
]
```

### 2.2 Individual Evidence Record

**Purpose:** One piece of evidence (one fact) that contributes to objective status

**Shape:**
```javascript
{
  // Identity
  id: "ev_force_ratio",           // unique within objective
  source: "balance_summary",       // computed field that provides this
  type: "force_ratio",             // evidence type (not formula, not decision)
  
  // Value
  value: 2.4,                      // the actual evidence (number, string, or bool)
  unit: "ratio",                   // unit of measurement (optional)
  confidence: 0.95,                // 0..1 confidence in this evidence
  
  // Explanation (for human reader)
  label: "Red-to-Blue Force Ratio",
  explanation: "Computed from live unit weights and strengths",
  
  // Traceability (how was it computed?)
  contributing_refs: [
    { unit_uid: "R-d2-4-004", strength: 0.8, weight: 15 },
    { unit_uid: "R-d3-41-005", strength: 1.0, weight: 15 }
  ],
  
  // Weight in objective judgment (set by OBJ-A design, used later)
  weight: 0.25,                    // how much does this evidence matter?
  
  // Temporal
  timestamp_step: 5,               // when this evidence was computed
  
  // Future extensibility
  tags: ["combat", "balance"],     // classification (for filtering)
  severity: "high"                 // signal strength for UI emphasis
}
```

### 2.3 Evidence Types (Complete List)

**Current (OBJ-A provides):**
- force_ratio
- blue_destroyed_count
- blue_intact_ratio
- red_company_equivalent
- red_casualty_rate
- bls_control_count
- bls_contested_count
- bls_denied_count
- bls_secured_count
- engagement_outcomes_total
- engagement_effectiveness_ratio
- contact_confidence_summary
- authored_objective_baseline

**Future (contributors will add):**
- blue_readiness_avg
- red_maintenance_backlog
- logistics_throughput_available
- doctrine_objective_priority
- ai_threat_assessment
- morale_sustainability
- unit_cohesion_index

---

## 3. CONTRIBUTORS & CONTRIBUTOR CONTRACTS

### 3.1 Balance Summary Contributor

**Input:** `ws.derived.balance_summary` (already exists)

**Records it contributes:**
- ev_force_ratio (force_ratio, type: "force_ratio", value: numeric)
- ev_blue_destroyed (blue_destroyed_count, type: "blue_destroyed_count", value: count)
- ev_blue_intact (blue_intact_ratio, type: "blue_intact_ratio", value: percent)
- ev_red_losses (red_company_equivalent, type: "red_company_equivalent", value: numeric)

**Weight assignment:**
- force_ratio: 0.30 (high importance)
- blue_destroyed: 0.25 (moderate-high)
- blue_intact: 0.25 (moderate-high)
- red_losses: 0.20 (moderate)

### 3.2 BLS Status Contributor

**Input:** `ws.derived.bls_status` (already exists)

**Records it contributes:**
- ev_bls_control (bls_control_count, value: count of SECURED | DENIED BLS)
- ev_bls_contested (bls_contested_count, value: count of CONTESTED BLS)

**Weight assignment:**
- bls_control: 0.15 (moderate-low)
- bls_contested: 0.10 (low)

### 3.3 Engagement Outcomes Contributor

**Input:** `ws.derived.engagement_outcomes[]` (moved to WS via WS-ENG1-A)

**Records it contributes:**
- ev_engagement_outcomes (engagement_outcomes_total, value: count of all outcomes)
- ev_engagement_effectiveness (engagement_effectiveness_ratio, value: engaged/total)

**Weight assignment:**
- outcomes_total: 0.20 (moderate)
- effectiveness: 0.15 (moderate-low)

### 3.4 Contacts Contributor

**Input:** `ws.derived.contacts[]` (already exists via DET1)

**Records it contributes:**
- ev_contact_confidence (contact_confidence_summary, value: { total, firm, probable, possible })

**Weight assignment:**
- confidence: 0.10 (low-moderate)

### 3.5 Authored Baseline Contributor

**Input:** `ws.objectives[i].status` (authored at scenario step)

**Records it contributes:**
- ev_authored_baseline (authored_objective_baseline, value: status enum)

**Weight assignment:**
- baseline: 1.0 (starting point, not weighted)

### 3.6 Future Contributors (Deferred)

**Readiness (OBJ-B+):**
- source: readiness_summary
- types: blue_readiness_avg, red_readiness_avg

**Doctrine (OBJ-C+):**
- source: doctrine
- types: objective_priority_weight, doctrine_compliance

**Logistics (OBJ-D+):**
- source: logistics
- types: throughput_available, supply_consumption_rate

---

## 4. EVIDENCE COMPUTATION (DERIVATION RULE)

### 4.1 Where It Runs

**Function name:** `computeObjectiveEvidence(ws)`

**Location:** `world-state.js` (new DERIVATION)

**Order in DERIVATIONS registry:**
```javascript
var DERIVATIONS = {
  balance_summary:           computeBalanceSummary,        // 1st
  bls_status:                computeBlsStatusB,             // 2nd
  contacts:                  computeContacts,               // 3rd
  objective_evidence:        computeObjectiveEvidence,      // 4th (NEW)
  objective_status_display:  computeObjectiveStatusDisplay  // 5th (unchanged)
};
```

**Why this order:**
1. All source derivations run first
2. objective_evidence aggregates all sources
3. objective_status_display runs last (unchanged)

### 4.2 Pseudocode

```javascript
function computeObjectiveEvidence(ws) {
  if (!ws || ws.degraded) return null;  // parity gate
  
  var objectives = arr(ws.objectives);
  if (!objectives.length) return null;
  
  var result = [];
  
  objectives.forEach(function(obj) {
    var ledger = {
      id: obj.objective_id + "_step-" + (ws.meta?.step_index || 0),
      objective_id: obj.objective_id,
      step_index: ws.meta?.step_index || 0,
      records: [],
      computed_at_step: ws.meta?.step_index || 0,
      source: "DERIVATIONS.computeObjectiveEvidence",
      version: "OBJ-A.1"
    };
    
    // Collect records from each contributor
    ledger.records.push(...contributeBalanceSummaryEvidence(ws, obj));
    ledger.records.push(...contributeBlsStatusEvidence(ws, obj));
    ledger.records.push(...contributeEngagementOutcomesEvidence(ws, obj));
    ledger.records.push(...contributeContactsEvidence(ws, obj));
    ledger.records.push(...contributeAuthoredBaselineEvidence(ws, obj));
    
    result.push(ledger);
  });
  
  return result.length ? result : null;
}
```

---

## 5. CONSUMER PATH (UNCHANGED FOR OBJ-A)

### 5.1 Current Consumer: objective_status_display

**Behavior:** UNCHANGED from today

**Reads from:** `ws.derived.balance_summary` (direct, as today)

**Does NOT read from:** `ws.derived.objective_evidence` (not yet)

**Why:** OBJ-A is ledger design only. OBJ-B will refactor consumer to use evidence records.

### 5.2 Future Consumer Path (OBJ-B)

In OBJ-B, objective_status_display will refactor to consume evidence records:

```javascript
function computeObjectiveStatusDisplay(ws) {  // signature unchanged
  var d = obj(ws && ws.derived);
  var status = d.objective_status || 'DORMANT';
  if (status !== 'CAPTURED') return status;
  
  // OBJ-B: read from evidence ledger
  var evidence = (d.objective_evidence || [])
    .find(e => e.objective_id === obj.objective_id);
  
  if (!evidence) return status;
  
  // Score evidence against thresholds
  var verdict = scoreEvidenceForObjectiveStatus(evidence.records);
  if (verdict.allows_capture) return status;
  return 'DENIED';
}
```

Output remains identical (DORMANT|THREATENED|CONTESTED|DENIED|CAPTURED).

### 5.3 Map/HUD Usage (Unchanged)

Map and HUD continue to render `ws.derived.objective_status_display` as today.

**Future (OBJ-D):** Map could show evidence detail panel on hover.

---

## 6. TESTS

### 6.1 Ledger Structure Tests
```
✓ objective_evidence array exists and is array
✓ each ledger has id, objective_id, step_index, records, version
✓ each record has id, source, type, value, confidence
✓ record.id is unique within ledger
✓ record.source is in allowed set [balance_summary, bls_status, ...]
✓ record.type matches known evidence_type enum
✓ record.confidence is in [0, 1] or null
```

### 6.2 Determinism Tests
```
✓ computeObjectiveEvidence(ws) is deterministic (same input = same output)
✓ same scenario step produces same evidence across runs
✓ evidence values have no RNG or timestamp variance
✓ contributing_refs are reproducible
```

### 6.3 Traceability Tests
```
✓ record.contributing_refs point to valid sources
✓ unit_uids in refs exist in ws.units (or ref is null)
✓ bls_ids in refs exist in ws.lines.bls (or ref is null)
✓ outcome_indices < ws.derived.engagement_outcomes.length
✓ no dangling references
```

### 6.4 Value Validation Tests
```
✓ force_ratio > 0 (or null)
✓ blue_destroyed_count <= blue_total
✓ red_company_equivalent >= 0
✓ engagement_effectiveness_ratio in [0, 1]
✓ bls_count >= 0
```

### 6.5 Consumer Path Tests
```
✓ objective_status_display produces same output as before
✓ CAPTURED → DENIED gate logic unchanged
✓ output is in (DORMANT, THREATENED, CONTESTED, DENIED, CAPTURED)
✓ no side effects: ws unchanged after evidence computation
✓ no mutation of balance_summary or other derived fields
```

### 6.6 Integration Tests
```
✓ evidence ledger created by applyDerivations
✓ objective_evidence runs after balance_summary (evidence values are populated)
✓ objective_evidence runs before objective_status_display
✓ full derivation chain works end-to-end
✓ parity gate: degraded scenario returns null (fallback to authored)
```

---

## 7. RISKS & MITIGATIONS

### Risk 1: Evidence Ledger Becomes a Dumping Ground
**Problem:** Future layers add evidence without discipline → bloat, noise  
**Mitigation:**
- Define strict evidence_type enum (whitelist only known types)
- Require schema validation before adding new types
- Document new types in memory files with justification

### Risk 2: Ledger Size Grows Unbounded
**Problem:** contributing_refs could store hundreds of entries per step  
**Mitigation:**
- contributing_refs is optional, not mandatory
- For simple metrics (force_ratio, count), refs can be sparse
- Evidence computed once per step, not per-render (negligible perf impact)

### Risk 3: Evidence Exists but Consumer Ignores It
**Problem:** OBJ-A ledger is created but objective_status_display doesn't use it yet  
**Mitigation:**
- OBJ-A is explicitly evidence design, not consumer refactoring
- OBJ-B is dedicated consumer refactoring step
- Test ensures objective output unchanged (parity gate)

### Risk 4: Schema Fragility in Future Contributors
**Problem:** Future layers extend schema incompatibly  
**Mitigation:**
- Define core fields as required (id, source, type, value, confidence)
- Additional fields optional (label, explanation, weight, tags)
- Versioning field (version: "OBJ-A.1") enables backward-compat

### Risk 5: Misalignment with Future Readiness/Doctrine/Logistics
**Problem:** Evidence schema doesn't support what future layers need  
**Mitigation:**
- Schema is extensible (optional fields, open tags)
- future_contributors contracts defined (placeholders)
- OBJ-A plan includes placeholders for readiness, doctrine, logistics evidence

---

## 8. SUCCESS CRITERIA

✅ **Schema designed & documented**
- Evidence record shape specified with examples
- Evidence type enumeration complete
- Optional vs. required fields clear

✅ **Contributors identified & contracted**
- balance_summary contribution path specified
- bls_status contribution path specified
- engagement_outcomes contribution path specified
- contacts contribution path specified
- future contributor placeholders (readiness, doctrine, logistics)

✅ **Computation order specified**
- DERIVATIONS registry updated with objective_evidence position
- objective_evidence runs AFTER all sources
- objective_status_display runs AFTER objective_evidence

✅ **Consumer path clear**
- objective_status_display reads same as today (no change)
- future refactoring path (OBJ-B) documented
- Map/HUD continues unchanged

✅ **Tests planned**
- ledger structure validation
- determinism verification
- source traceability
- output equivalence (objective_status_display unchanged)
- no mutation guarantees
- parity fallback tested

✅ **Evidence is auditable**
- Planners can inspect ws.derived.objective_evidence
- Understand "why is this objective DENIED?"
- Each evidence record traceable to source
- Values explicit, not hidden in rules

✅ **Extensibility is clear**
- New evidence sources can add records
- No changes to objective logic needed
- Migration path to OBJ-B documented
- No breaking changes to API

---

## 9. FUTURE MIGRATION PATH

### OBJ-B: Refactor Consumer
- objective_status_display reads objective_evidence instead of balance_summary
- Output remains identical
- Schema unchanged

### OBJ-C: Add Doctrine Evidence
- New contributor: doctrine_summary
- New evidence types: objective_priority, doctrine_compliance
- Objective logic still unchanged

### OBJ-D: UI Detail Panel
- Map shows evidence ledger tooltip
- "Why is this objective DENIED?" explained
- Pure UI, no World State changes

### OBJ-E+: Readiness, Logistics, Morale
- Each adds evidence sources
- Objective logic can weigh new evidence (future)
- But evidence ledger pattern unchanged

---

## 10. DEPENDENCIES

**Must exist before OBJ-A implementation:**
- ✅ WS-ENG1-A (engagement outcomes in WS) — DONE
- ✅ WS4 (balance summary in WS) — DONE
- ✅ WS-BLS-B (BLS status in WS) — DONE
- ✅ WS-DET1-A (contacts in WS) — DONE

**Must be planned before OBJ-A implementation:**
- ✅ OBJ-A plan (this document)

---

## 11. SUMMARY

**OBJ-A creates an evidence ledger, not a formula rewrite.**

Current evidence (balance, BLS, engagements, contacts) feeds into `ws.derived.objective_evidence[]`, making it auditable and extensible.

**For OBJ-A:**
- No changes to objective_status_display
- No changes to readiness, doctrine, logistics
- Pure ledger design and aggregation

**For future:**
- OBJ-B refactors consumer
- OBJ-C+ add evidence sources without rewriting objective logic

**This bridges the gap from WS-ENG1-A (engagement outcomes) to readiness/doctrine/logistics layers.**

Architecture is clean, extensible, and auditable. Evidence is a first-class citizen in World State.

