# WS-ENG1-A Implementation Plan
## Engagement Outcomes: Ownership Inversion Design

**Date:** 2026-06-03  
**Status:** PLANNING (no code yet)  
**Scope:** Locked per user requirements  
**Ground Truth:** WS-ENG1-A-CONSUMPTION-AUDIT.md

---

## Executive Summary

**SCOPE (LOCKED):** WS-ENG1-A stores engagement outcome RECORDS ONLY. Damage application logic stays UNCHANGED.

Decouple in layers:
- **WS-ENG1-A (THIS):** World State owns outcome records (ws.derived.engagement_outcomes) — no damage application changes
- **WS-ENG1-B (FUTURE):** Consume outcomes for damage application
- **WS-ENG1-C (FUTURE):** Readiness computation from outcomes
- **WS-OBJ-A (FUTURE):** Objective evidence / outcome history

**Key Finding:** ENG1 is **deterministic** (no randomness) — outcomes can be stored once and safely read by all consumers.

**Complexity:** 4/10 (lower than originally planned — outcome storage only, no refactoring)  
**Risk:** 🟡 MEDIUM (outcome storage is isolated, damage logic unchanged)  
**Estimated Effort:** 40-50 lines changed + 15 tests

---

## Answer to 8 Planning Questions

### **1. Does ENG1 Use Randomness?**

**Answer: NO — ENG1 is deterministic**

Evidence from `engagement.js`:
```javascript
// Line 68: Pure math formula
function pkSalvo(pk, salvo) { return 1 - Math.pow(1 - pk, Math.max(1, salvo)); }

// Line 130: Calculated deterministically
rec.pk_kill = +pkSalvo(def.pk, fired).toFixed(3);
```

**Implication:**
- ✅ Outcomes CAN be stored (deterministic, repeatable)
- ✅ Safe to reuse same outcome across multiple renders
- ✅ No RNG side effects to worry about
- ✅ DERIVATIONS can compute once per step, consumers read from WS

---

### **2. Engagement Outcomes Schema**

**Record Structure** (one entry per weapon-target pair evaluated):

```javascript
{
  // Identification
  shooter_uid:           "R-d3-4-023",          // who fired
  target_uid:            "B-d1-2-013",          // at whom
  detected_by_side:      "RED",                 // shooter's side
  weapon_id:             "wpn_001",             // weapon.id or weapon.class
  weapon_class:          "long_range_sam",      // class from DB
  contact_uid:           "c_001_002_013",       // reference to ws.derived.contacts entry (optional)

  // Gate checks (in order)
  detection_gate:        true,                  // target in detected contacts?
  wra_gate:              true,                  // weapon not on HOLD?
  range_gate:            true,                  // in WRA range?
  ammo_gate:             true,                  // magazine has stock?
  fire_control_gate:     true,                  // FC channel available?

  // Status and reason
  status:                "engaged",             // "engaged" | "blocked"
  reason:                null,                  // if blocked: "weapons_hold", "out_of_range", "winchester", "no_fire_control_channel", etc.

  // Outcome (only if status = "engaged")
  salvo:                 2,                     // rounds fired
  pk_single:             0.70,                  // single-shot probability
  pk_kill:               0.910,                 // computed via pkSalvo formula
  rounds_remaining:      18,                    // after firing

  // Context
  range_nm:              42.5,                  // distance to target
  max_range_nm:          80.0,                  // effective range of weapon
  mode:                  "max",                 // WRA mode (max, 75pct, nez)

  // Damage (applied by WS3, not computed here)
  target_status_before:  "ACTIVE",              // before engagement
  target_status_after:   "DEGRADED",            // after damage applied
  target_strength_before: 0.95,                 // health before
  target_strength_after:  0.85,                 // health after (would compute as: before - pk_kill)

  // Audit
  step_index:            5,                     // which scenario step
  decision_index:        2,                     // which decision in the step (if batched)
}
```

**Field Categories:**
- **Identification (4 fields):** shooter, target, side, weapon
- **Gates (5 boolean fields):** detection, WRA, range, ammo, fire-control (for explainability)
- **Status (2 fields):** status + reason
- **Outcome (4 fields):** salvo, pk_single, pk_kill, rounds_remaining (if engaged)
- **Context (4 fields):** range_nm, max_range_nm, mode, contact_uid
- **Damage (4 fields):** status_before, status_after, strength_before, strength_after
- **Audit (2 fields):** step_index, decision_index

**Total: 25 fields per record**

---

### **3. Current-Step Only or History?**

**Recommendation: Current-step derived outcomes for WS-ENG1-A**

```javascript
ws.derived.engagement_outcomes = [
  { shooter_uid, target_uid, status, pk_kill, … },  // step 5
  { shooter_uid, target_uid, status, pk_kill, … },  // step 5
  // ... other engagement records for this step only
]
```

**Why current-step only:**
- ✅ WS already snapshots per step (contacts, units, objectives)
- ✅ DERIVATIONS computes fresh per step (no history needed)
- ✅ Simpler to implement (no accumulation logic)
- ✅ Sufficient for map rendering (shows potential engagements at current step)
- ✅ Future Objective Evidence (OBJ-A) will build historical journal separately

**Future (not now):**
- When OBJ-A comes, will store decision → engagement_outcomes → side_effects → actual_state
- That path will have historical tracking

---

### **4. Outcome Storage (WS-ENG1-A) vs. Damage Application (WS-ENG1-B)**

**⚠️ IMPORTANT: WS-ENG1-A does NOT change damage application. Damage logic stays UNCHANGED.**

**Current Code (WS3.resolveEngagement) — UNCHANGED in WS-ENG1-A:**

```javascript
// Lines 158-189: Damage application logic stays exactly as-is
var recs = e.computeEngagements(pairWs, synthetic, ...);
var rec = recs.filter(...)[0];

// Apply damage (THIS STAYS UNCHANGED)
var before = target.strength || 1;
var after = Math.max(0, before - rec.pk_kill);
target.strength = after;
if (after <= DESTROY_AT) { target.status = 'DESTROYED'; }

// Decrement magazines (THIS STAYS UNCHANGED)
var w = (shooter.weapons || [])[...];
mag.stock[key] = Math.max(0, mag.stock[key] - rec.salvo);
```

**WS-ENG1-A Addition ONLY:**

```javascript
// NEW: Store outcome for other consumers (maps, future layers)
if (!ws.derived) ws.derived = {};
if (!ws.derived.engagement_outcomes) ws.derived.engagement_outcomes = [];
ws.derived.engagement_outcomes.push(rec);

// ^ That's it. Everything else in resolveEngagement() unchanged.
```

**Why This Approach:**

1. ✅ **Outcome storage is isolated** — no risk to existing damage logic
2. ✅ **Damage application unchanged** — proven code path stays intact
3. ✅ **Determinism proven** — outcomes computed once, stored, reused
4. ✅ **Future refactoring safe** — WS-ENG1-B will consume stored outcomes for damage later

**NOT in WS-ENG1-A:**
- ❌ Reading outcomes to apply damage
- ❌ Refactoring damage application
- ❌ Computing readiness from outcomes
- ❌ Computing objective evidence

**These come in WS-ENG1-B, C, OBJ-A (future phases)**

---

### **5. Map Rendering Consumption**

**Current State (Map):**
```javascript
computeEngagementRecords(state) {
  const { units, posByUid } = buildDetectionUnits(state);
  let contacts = (lastWorldState && lastWorldState.derived && lastWorldState.derived.contacts) || [];
  let recs = window.AppEngagement.computeEngagements({ units }, contacts) || [];
  return { recs, posByUid };
}

renderEngagements(state) {
  const computed = computeEngagementRecords(state);  // RECOMPUTES each render
  for (const r of computed.recs) {
    if (r.status !== 'engaged') continue;
    // Draw firing arc from shooter to target
  }
}
```

**Target Design (WS-ENG1-A):**
```javascript
computeEngagementRecords(state) {
  const { posByUid } = buildDetectionUnits(state);
  // PR-WS-ENG1-A: read from World State (computed once per step)
  let recs = (lastWorldState && lastWorldState.derived && lastWorldState.derived.engagement_outcomes) || [];
  return { recs, posByUid };
}

renderEngagements(state) {
  const computed = computeEngagementRecords(state);  // READS from WS
  for (const r of computed.recs) {
    if (r.status !== 'engaged') continue;
    // Draw firing arc from shooter to target
  }
}
```

**Key Points:**

1. **Map shows potential engagements** (what CAN fire, not what DID fire in history)
   - ws.derived.engagement_outcomes shows "potential engagements at this step"
   - Future: Objective Evidence will track actual engagements (what fired, hit, killed)

2. **Rendering logic UNCHANGED**
   - Same fire-arc drawing code
   - Same HUD display
   - Just reads from WS instead of computing

3. **No double-computation**
   - Old: Every render recomputed (expensive, inconsistent RNG)
   - New: Computed once per decision, read many times (efficient, consistent)

---

### **6. Preventing Double Computation**

**Architecture Rule:**

```
┌──────────────────────────────────────────┐
│  ENG1.computeEngagements() [pure]        │
│  Called ONLY from:                       │
│  • WS3.applyDecision() [primary]         │
│  • test-eng1-engagement.js [unit tests]  │
└────────────┬─────────────────────────────┘
             │
             └─→ ws.derived.engagement_outcomes
                 (stored, immutable for rest of step)
                     │
         ┌───────────┼───────────┐
         v           v           v
     Map reads   HUD reads   Future reads
     (no recompute)
```

**Implementation Safeguards:**

1. **Remove direct ENG1 calls from Map:**
   ```javascript
   // REMOVE THIS:
   recs = window.AppEngagement.computeEngagements({ units }, contacts);
   
   // REPLACE WITH:
   recs = lastWorldState.derived.engagement_outcomes;
   ```

2. **Keep ENG1 calls ONLY in WS3 and tests:**
   ```javascript
   // ALLOWED:
   // • WS3.resolveEngagement() — line 161
   // • test-eng1-engagement.js — unit tests
   
   // PROHIBITED:
   // • Map rendering
   // • HUD display
   // • Any other consumer
   ```

3. **Add defensive check in DERIVATIONS:**
   ```javascript
   function computeEngagementOutcomes(ws) {
     // If outcomes already computed in THIS ws, return as-is
     if (ws.derived && ws.derived.engagement_outcomes) {
       return ws.derived.engagement_outcomes;
     }
     // Should not reach here (WS3 already computed)
     return null;
   }
   ```

---

### **7. Required Tests**

**Test Suite: `test-ws-eng1-a.js`** (new file)

**Assertions:**

```
✓ ENG1 is exported
✓ computeEngagements is pure (clones inputs, no mutation)
✓ engagement_outcomes schema validates (all required fields)
✓ determinism: same inputs → same outputs
✓ detection-gated: blocked outcome if no contact
✓ range-gated: blocked outcome if out of range
✓ ammo-gated: blocked outcome if magazine empty
✓ fire-control-gated: blocked if no channels
✓ weapons_hold: blocked if WRA.hold set
✓ engaged outcome has all fields (salvo, pk_kill, etc)
✓ W3 step 5: has engagement_outcomes in ws.derived
✓ W3 step 5: outcomes are deterministic (repeat call same result)
✓ pk_salvo formula correct: 1 - (1-pk)^salvo
✓ no production AppEngagement.computeEngagements calls outside WS3
✓ map.computeEngagementRecords reads from WS (not recomputing)
✓ outcomes.reason set for all blocked statuses
✓ rounds_remaining decremented after firing
✓ target can defend itself (symmetric detection)
✓ units with no weapons blocked (no weapon to fire)
✓ units with no sensors blocked (no detection)
✓ damage_pct computed: (strength_before - strength_after) / strength_before
✓ status_after is DESTROYED if strength ≤ 0.1, else DEGRADED
✓ no mutation of input world state
✓ no side effects (fetch, journal, window mutation)
```

**Existing Tests (Update):**

```
test-db1-capabilities.js:
  + Add assertion: engagements run end-to-end with WS-ENG1-A
  + Verify outcomes stored in ws.derived

test-engagement-overlay.js:
  + Add assertion: map reads from ws.derived.engagement_outcomes
  + No direct computeEngagements calls

test-ws-det1-a.js:
  + Verify contacts available before engagement gate
```

**Total: ~30 new assertions + 5 updated tests**

---

### **8. Browser Verification Protocol**

**Steps 0, 5, 12 Test Run:**

```
Load Wargame 3 scenario
  ↓
Step 0: Verify
  ├─ lastWorldState.derived.engagement_outcomes exists (empty, no contacts yet)
  ├─ No RED detects BLUE (units far apart)
  ├─ No engagements possible
  ├─ Map firing arcs: none visible
  ├─ Console: no errors
  ├─ Network: no failed requests
  
Step 5: Verify
  ├─ lastWorldState.derived.engagement_outcomes has ~40-50 entries (sample)
  ├─ All outcomes have required fields (shooter, target, status, pk_kill)
  ├─ Some outcomes status = "engaged", some = "blocked"
  ├─ Map firing arcs: visible where status = "engaged"
  ├─ Map arcs match outcomes (both show same shooter→target pairs)
  ├─ Clicking arc shows engagement details from ws.derived
  ├─ Console: no errors, no direct computeEngagements calls
  ├─ Network: no unexpected calls
  
Step 12: Verify
  ├─ lastWorldState.derived.engagement_outcomes updated
  ├─ Different outcomes than step 5 (units moved, new contacts)
  ├─ Determinism: repeat step 5 → identical outcomes
  ├─ Map rendering consistent with outcomes
  ├─ No console errors

Overall:
  ├─ Confirm: ws.derived.engagement_outcomes always present
  ├─ Confirm: Map reads from WS, not recomputing
  ├─ Confirm: No direct AppEngagement.computeEngagements in production
  ├─ Confirm: All outcomes deterministic and repeatable
```

---

## Architecture & Data Flow

### **Ownership Model (WS-ENG1-A: Outcome Storage Only)**

```
┌──────────────────────────────────────────────────┐
│  ENG1: Engagement Computation Engine (unchanged) │
│  • Purely functional                             │
│  • Deterministic (1 - (1-pk)^salvo formula)     │
│  • Input: units, contacts, weapon DB            │
│  • Output: engagement records (blocked/engaged) │
│  • Called from: WS3.applyDecision() ONLY        │
└────────────────┬─────────────────────────────────┘
                 │
                 └─ Compute once per ENGAGE decision
                    │ [NEW: Store outcome]
                    │
    ┌───────────────┘
    │
    v
[WS-ENG1-A: Outcome Storage]
    ws.derived.engagement_outcomes ← store rec
    (That's it! Damage logic unchanged below)
    │
    └──→ ws.derived.engagement_outcomes
         (immutable, read-only for rest of step)
             │
    ┌────────┴──────────┬──────────────┐
    │                   │              │
    v                   v              v
[WS3: Damage]    [Map Consumer]   [Future (WS-ENG1-B/C)]
(OLD CODE)       • Read outcomes  • Refactor damage
• Apply damage   • Render arcs    • Compute readiness
• Decrement mags • Show details   • Objective evidence
• Update status  • (No recompute)
(UNCHANGED)
```

**Key:** WS-ENG1-A stores outcomes. Damage application unchanged. Future phases refactor.

### **Step-by-Step Data Flow**

**Scenario Step 5 with ENGAGE Decision:**

```
┌─ OPERATOR DECISION ────────────────────────────────┐
│ { type: 'ENGAGE', shooter: 'R-d3', target: 'B-d1' }│
└──────────┬──────────────────────────────────────────┘
           │
           v
┌─ WS3.applyDecision() (ALMOST UNCHANGED) ─────────────┐
│ 1. Read ws.derived.contacts (from DET1)              │
│ 2. Gate: shooter detects target?                     │
│ 3. Call AppEngagement.computeEngagements() [unchanged]
│    Input: { units: [R-d3, B-d1], contacts: [...] }  │
│    Output: [ { status:'engaged', pk_kill:0.85 } ]   │
│                                                      │
│ [NEW] 4. Store in ws.derived.engagement_outcomes    │
│          → That's the ONLY new line! ←              │
│                                                      │
│ 5-9. OLD CODE (apply damage, decrement mags) [unchanged]
│ 5. Extract pk_kill from outcome                     │
│ 6. Apply damage: B-d1.strength -= 0.85              │
│ 7. Update status: B-d1.status = 'DEGRADED'         │
│ 8. Decrement magazines: R-d3.magazines[0] -= 2     │
│ 9. Return effect record                            │
│                                                     │
│ ws.derived.engagement_outcomes = [outcome]          │
│ (new field added to ws for consumers to read)      │
└──────────┬──────────────────────────────────────────┘
           │
           v ws is returned with derived.engagement_outcomes
           │
    ┌──────┴──────────────────────────────┐
    │                                     │
    v                                     v
┌─ MAP LAYER ──────────────┐    ┌─ FUTURE CONSUMERS ─┐
│ lastWorldState = ws      │    │ Read outcomes from │
│ renderEngagements() {    │    │ ws.derived for:    │
│   recs =                 │    │ • Evidence engine  │
│   lastWorldState.        │    │ • Doctrine layer   │
│   derived.              │    │ • AI evaluation    │
│   engagement_outcomes;  │    │ • Event log        │
│   for (r of recs) {     │    │                    │
│     if (r.status ==     │    └────────────────────┘
│     'engaged') {        │
│       drawArc(r);       │
│     }                   │
│   }                     │
│ }                       │
└─────────────────────────┘
```

---

## Risk Controls

### **Critical Risks**

| Risk | Mitigation | Verification |
|------|-----------|---|
| **Outcomes lost if WS not persisted** | Outcomes stored IN ws, not separately | Test: ws.derived.engagement_outcomes present at each step |
| **Damage applied twice** | Apply once per outcome, not per contact | Test: target.strength decrements exactly once |
| **Map recomputes (defeats purpose)** | Map reads from ws.derived, no ENG1 call | Grep: no `computeEngagements` in map rendering |
| **Outcomes stale across steps** | DERIVATIONS or WS3 refreshes per decision | Test: step 0 → 5 outcomes differ |
| **Ammunition never consumed** | Magazine decrement tied to outcome.salvo | Test: rounds_remaining decreases |
| **Units can't defend selves** | Engagements computed both directions | Test: both RED→BLUE and BLUE→RED computed |
| **Fire-control starvation** | Channels decremented per weapon-target pair | Test: 3 weapons on same platform compete for channels |

### **Design Safeguards**

1. **Single Source of Truth:** outcomes computed once, read by all
2. **Determinism:** ENG1 pure math (1 - (1-pk)^salvo), no RNG
3. **Immutability:** outcomes stored in ws.derived (read-only after step)
4. **Audit Trail:** outcomes include reason (explainable gates)
5. **Test Coverage:** 30+ assertions for schema, gates, side effects

---

## Implementation Sequence

### **Phase 1: Core WS-ENG1-A (1 day)**

1. Add ONE line to WS3.resolveEngagement(): `ws.derived.engagement_outcomes = outcomes;`
2. Update map.computeEngagementRecords() to read from ws.derived (no ENG1 call)
3. Write test-ws-eng1-a.js (20+ assertions, focused on outcome storage and map consumption)
4. Grep verification: no production computeEngagements calls in map/HUD
5. Browser verify: steps 0, 5, 12 (outcomes present, map unchanged)

### **Phase 2: Verification & Cleanup (half day)**

1. Run full test suite (240+ tests)
2. Browser smoke test (all layers)
3. Commit + tag
4. Post-audit document (similar to POST-DET-OWNERSHIP-AUDIT.md)

### **Phases 3+: Future (separate commits)**

- **WS-ENG1-B:** Refactor damage application to read from stored outcomes
- **WS-ENG1-C:** Readiness computation from outcomes
- **WS-OBJ-A:** Objective evidence / outcome history

**Total Effort for WS-ENG1-A:** ~1.5 days (minimal change, maximum safety)

---

## Rollback Plan

**If anything breaks:**

```
1. Identify issue (test failure, console error, rendering change)
2. Revert commit (git revert <hash>)
3. Diagnose in code review
4. Fix in new branch
5. Retro test before re-commit
```

**No partial rollback needed** (single commit, all-or-nothing inversion)

---

## Success Criteria (Exact)

All must be true at merge:

1. ✅ `test-ws-eng1-a.js`: 30/30 assertions passing
2. ✅ `test-eng1-engagement.js`: 0 regressions
3. ✅ `test-engagement-overlay.js`: 0 regressions
4. ✅ `test-db1-capabilities.js`: updated + passing
5. ✅ Full test suite: 240+/240+ passing (no new failures)
6. ✅ Browser step 0: no outcomes (correct, no contacts)
7. ✅ Browser step 5: 40-50 engagement_outcomes visible
8. ✅ Browser step 12: outcomes updated and different from step 5
9. ✅ Map firing arcs: visible where status='engaged'
10. ✅ Console: zero errors (including "not a function" errors)
11. ✅ Network: zero failed requests
12. ✅ Grep: zero production `AppEngagement.computeEngagements()` calls outside {WS3, unit-tests}
13. ✅ Commits: clean, signed, well-documented
14. ✅ Audit report: documents all changes, risks, verification

---

## Pre-Implementation Checklist

**Before coding, verify:**

- [ ] ENG1 understanding confirmed (no RNG, pure math)
- [ ] Schema approved (25 fields per record)
- [ ] DERIVATIONS approach accepted (shallow copy, not primary computation)
- [ ] WS3 damage application approach accepted (read from outcomes)
- [ ] Map rendering approach accepted (read from WS, no recompute)
- [ ] Test plan reviewed (30 assertions + integration)
- [ ] Risk matrix reviewed (7 mitigations acceptable)
- [ ] Rollback strategy understood
- [ ] All 14 success criteria approved

**Sign-off:** Engineering team + user approval required before Phase 1

---

## Appendix: Field Reference

### **Outcome Record Fields (25 total)**

**Identification (4):**
- `shooter_uid` (string) — unit UID firing the weapon
- `target_uid` (string) — unit UID being engaged
- `detected_by_side` (string) — "RED" | "BLUE"
- `weapon_id` (string) — weapon.id or weapon.class

**Gates (5):**
- `detection_gate` (boolean) — target in detected contacts
- `wra_gate` (boolean) — weapon not on HOLD
- `range_gate` (boolean) — within WRA range
- `ammo_gate` (boolean) — magazine has stock
- `fire_control_gate` (boolean) — FC channel available

**Status (2):**
- `status` (string) — "engaged" | "blocked"
- `reason` (string | null) — gate name if blocked, null if engaged

**Outcome (4):**
- `salvo` (number) — rounds fired (if engaged)
- `pk_single` (number) — single-shot probability
- `pk_kill` (number) — computed via pkSalvo formula
- `rounds_remaining` (number) — ammo left after firing

**Context (4):**
- `range_nm` (number) — distance to target
- `max_range_nm` (number) — effective WRA range
- `mode` (string) — "max" | "75pct" | "nez"
- `contact_uid` (string) — reference to ws.derived.contacts entry

**Damage (4):**
- `target_status_before` (string) — "ACTIVE" | "DEGRADED" | "DESTROYED"
- `target_status_after` (string) — same
- `target_strength_before` (number) — health 0.0-1.0
- `target_strength_after` (number) — after damage applied

**Audit (2):**
- `step_index` (number) — scenario step
- `decision_index` (number) — which decision in step

**Total: 25 fields per engagement record**

---

## Next Step

✅ **Planning complete**

**Gate:** User approval of this plan  
**Approval Items:** 14 success criteria, schema, approach, risk controls  
**Timeline:** Ready for Phase 1 (core implementation) upon approval

