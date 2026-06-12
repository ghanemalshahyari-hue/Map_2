# Phase 6F Audit: Apply-State Contract Design

**Date:** 2026-06-04  
**Scope:** Design contract for when/how accepted deltas become applied state (audit only, no implementation)  
**Status:** ✅ COMPLETE — All 10 audit questions answered, 4 implementation options analyzed, recommendation provided

---

## Executive Summary

**RESULT: ✅ AUDIT COMPLETE**

Phase 6E-A successfully logged accepted readiness/supply deltas. Phase 6F designs where and when those deltas become "applied state" (actual operational state used in next step).

**Key Findings:**
- Applied state must be distinct from authored baseline (immutability requirement)
- Event log is the canonical source of accepted deltas
- Applied state should be reconstructed/derived rather than stored separately
- Smallest safe slice: **In-memory run-state overlay (Option A)**
- Must defer: supply consumption, step-to-step carryover, recovery logic

**Recommendation:** Option A (in-memory overlay) allows single-step delta application with journal foundation for later multi-step carryover.

---

## Audit Question Answers

### Q1: What does "applied state" mean in RMOOZ?

**Answer:**

Applied state is the operational state used in the current/next simulation step that differs from the authored scenario baseline due to accepted operator decisions.

**Three-Layer State Model:**

```
┌─────────────────────────────────────────────────┐
│ AUTHORED BASELINE (immutable)                   │
│ - scenario.json red_units, blue_units_initial  │
│ - Never modified after scenario load            │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│ ACCEPTED DELTAS (event log)                     │
│ - Readiness/supply changes operator accepted    │
│ - Logged as SYSTEM category with event_type    │
│ - Never applied to baseline                     │
└─────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────┐
│ APPLIED RUN-STATE (derived from deltas)         │
│ - Baseline + accepted deltas overlaid           │
│ - Used in simulation/display for next step      │
│ - Can be reconstructed from event log           │
└─────────────────────────────────────────────────┘
```

**Example:**
```
Baseline: R1 readiness='ready', supply=0.75
Accepted delta: readiness→'limited', supply→0.55
Applied state: R1 readiness='limited', supply=0.55
```

---

### Q2: Should accepted deltas affect current step, next step, or derived run-state layer?

**Answer: Next step + Derived layer**

**Current Step:** ❌ NO
- Adjudication already happened for current step
- Proposal is for future state changes
- Deltas don't affect current engagement outcomes

**Next Step:** ✅ YES (primary)
- Natural timeline: proposal accepted → apply to next step
- Operator decision made at T=N → effects at T=N+1
- Clear causality and audit trail

**Derived Layer:** ✅ YES (architectural)
- Don't mutate scenario baseline
- Use "applied state" overlay computed from baseline + deltas
- Can be reconstructed at any time from event log
- Allows reverting changes without scenario mutations

**Timeline Example:**
```
Step 1: Proposal offered (AI model predicts deltas)
        ↓
        Operator accepts proposal
        ↓
        Delta logged: R1 readiness ready→limited
        ↓
Step 2: Applied state has R1 readiness='limited'
        (used for next engagement, readiness checks, etc.)
```

---

### Q3: Should scenario baseline remain immutable forever?

**Answer: YES, immutable for the authored baseline; YES, mutable for applied state**

**Scenario Baseline (Authored):** ✅ IMMUTABLE FOREVER
- `window.RmoozScenario.scenario` is the source of truth
- Represents the operator's authored scenario design
- Never write to it during adjudication
- Allows reset/restart to original conditions
- Legal requirement: audit trail must show original intent

**Applied State:** ✅ MUTABLE (but derived, not destructive)
- Lives separately from baseline
- Computed from baseline + accepted deltas
- Changes don't mutate the baseline
- Can be reconstructed from event log at any time
- Safe to "undo" by recomputing without deleted events

**Guarantees:**
- ✓ Baseline is provenance (legal/historical record)
- ✓ Applied state is working copy (operational)
- ✓ Clear separation: read baseline, write to derived state only
- ✓ No mutation of authored scenario

---

### Q4: Where should applied state live?

**Answer: In-memory during session, reconstructable from journal**

**Options Evaluated:**

| Location | Pros | Cons |
|----------|------|------|
| **In-memory (Option A)** | Fast, session-scoped, safe | Lost on page reload, must reconstruct |
| **Journal as entries** | Persistent, audit trail | Requires parsing deltas from log |
| **Separate run-state JSON** | Persistent, queryable | Must keep in sync with journal |
| **Reconstructed on demand** | Always consistent with journal | Recomputation overhead |

**Recommendation: Hybrid approach**

```
┌──────────────────────────────────────┐
│ In-Memory Applied State (fast)       │
│ Cached for current step display      │
└──────────────────────────────────────┘
         ↑                    ↓
    Read on               Invalidate
    load/apply            on new delta
         ↑                    ↓
┌──────────────────────────────────────┐
│ Journal (authoritative source)       │
│ Event log with STATE_DELTA entries   │
└──────────────────────────────────────┘
```

**Responsibilities:**
- Journal: Canonical record of what deltas were accepted
- In-memory: Fast cache for current session
- Reconstruction: Possible anytime from journal (for recovery, replay, save/load)

---

### Q5: Should applied state be reconstructed from journal/event log or stored separately?

**Answer: Reconstructed from journal; in-memory cache for performance**

**Reconstruction Approach (Stateless):**
```javascript
function getAppliedState(step) {
  // Start with baseline
  const applied = deepClone(scenario.units);
  
  // Find all accepted deltas for this step
  const deltas = eventLog.getRows().filter(e =>
    e.payload?.event_type === 'STATE_DELTA' &&
    e.payload?.step === step  // or however we track step
  );
  
  // Apply deltas in order
  for (const deltaEvent of deltas) {
    const delta = deltaEvent.payload;
    const unit = applied.find(u => u.uid === delta.unit_uid);
    if (unit) {
      if (delta.delta_type === 'readiness') {
        unit.readiness = delta.value_after;
      } else if (delta.delta_type === 'supply') {
        unit.supply = delta.value_after;
      }
    }
  }
  
  return applied;
}
```

**Benefits:**
- ✓ Single source of truth (event log)
- ✓ Always consistent with journal
- ✓ No sync issues between copies
- ✓ Can replay/recover at any time
- ✓ Safe: reading event log doesn't mutate it

**Caching Layer (for performance):**
```javascript
let cachedAppliedState = null;
let cachedForStep = null;

function getAppliedStateWithCache(step) {
  if (cachedForStep !== step || !cachedAppliedState) {
    cachedAppliedState = reconstructAppliedState(step);
    cachedForStep = step;
  }
  return cachedAppliedState;
}

function invalidateCache() {
  cachedAppliedState = null;
  cachedForStep = null;
}

// Invalidate when new delta accepted
function onDeltaAccepted(delta) {
  logEvent(delta);
  invalidateCache();
  displayUpdates();
}
```

---

### Q6: Difference between authored baseline, projected_state, accepted delta, and applied run-state?

**Answer: Four distinct layers with clear progression**

**Layer 1: Authored Scenario Baseline**
```javascript
{
  uid: 'R1',
  label: 'RED Company',
  readiness: 'ready',      // Authored value
  supply: 0.75             // Authored value
}
```
- Immutable, source of truth
- Operator-designed starting state
- Can be reset at any time
- Live in `window.RmoozScenario.scenario`

**Layer 2: Projected State (in proposal)**
```javascript
{
  uid: 'R1',
  label: 'RED Company',
  readiness: 'limited',    // AI-predicted future state
  supply: 0.55             // AI-predicted future state
}
```
- AI's forecast of what state will be after accepting the proposal
- Used to display deltas to operator: "ready → limited"
- Never applied to scenario
- Discarded if operator rejects

**Layer 3: Accepted Delta Event (in event log)**
```javascript
{
  severity: 'INFO',
  category: 'SYSTEM',
  payload: {
    event_type: 'STATE_DELTA',
    delta_type: 'readiness',
    unit_uid: 'R1',
    unit_label: 'RED Company',
    side: 'RED',
    value_before: 'ready',
    value_after: 'limited',
    proposal_id: 'PROP-001',
    step: 2,               // Could include step reference
    timestamp: 1717478400
  }
}
```
- Operator's accepted decision
- Permanent audit trail
- Canonical record of what changed
- Immutable (part of journal)

**Layer 4: Applied Run-State (derived)**
```javascript
{
  uid: 'R1',
  label: 'RED Company',
  readiness: 'limited',    // Derived from baseline + deltas
  supply: 0.55             // Derived from baseline + deltas
}
```
- Computed from baseline + accepted deltas
- Used in next step simulation/display
- Reconstructed from event log
- Can be discarded and recreated safely

**Progression Example:**
```
Baseline:      R1 readiness='ready'
         ↓
AI proposes: readiness→'limited' (projected_state)
         ↓
Operator accepts
         ↓
Logged event: { event_type: 'STATE_DELTA', value_before: 'ready', value_after: 'limited' }
         ↓
Applied state: R1 readiness='limited' (used in Step 2)
```

---

### Q7: What guardrails are needed before any state mutation?

**Answer: Seven critical guardrails**

**Guardrail 1: Scenario Baseline Protection**
```javascript
// NEVER write to window.RmoozScenario.scenario
// ONLY read from it

// ✗ BAD:
scenario.units[0].readiness = 'limited';

// ✓ GOOD:
const applied = deepClone(scenario.units);
applied[0].readiness = 'limited';
```

**Guardrail 2: Event Log as Authoritative Source**
```javascript
// Applied state must only derive from event log deltas
// NEVER from AI proposals, frontend guesses, or other sources

// ✗ BAD:
appliedState.readiness = proposal.projected_state.readiness;

// ✓ GOOD:
const deltas = eventLog.getRows()
  .filter(e => e.payload?.event_type === 'STATE_DELTA');
applyDeltas(appliedState, deltas);
```

**Guardrail 3: Immutability Verification Tests**
```javascript
// Before allowing any mutation, verify baseline can't be changed
test('scenario baseline immutable', () => {
  const before = JSON.stringify(scenario);
  applyDeltas(scenario, [{...}]);  // Try to mutate
  const after = JSON.stringify(scenario);
  assert(before === after, 'scenario was mutated!');
});
```

**Guardrail 4: Operator Audit Trail**
```javascript
// Every state change must be traceable to operator decision
// All applied state must have corresponding event-log entry

// ✓ GOOD:
if (eventLog.exists({
  payload: {
    event_type: 'STATE_DELTA',
    unit_uid: 'R1',
    value_after: 'limited'
  }
})) {
  appliedState.R1.readiness = 'limited';
}
```

**Guardrail 5: Step-Bounded State**
```javascript
// Applied state is per-step
// Can't apply delta from Step 2 to Step 1

// ✓ GOOD:
function getAppliedState(stepNumber) {
  const deltas = eventLog.getRows()
    .filter(e => e.payload?.step === stepNumber);
  return applyDeltas(baseline, deltas);
}
```

**Guardrail 6: No Silent State Loss**
```javascript
// Applied state must be derivable/recoverable
// Never discard unless we can rebuild it

// ✓ GOOD:
const applied = reconstructFromEventLog(step);  // Can rebuild anytime

// ✗ BAD:
appliedState = {};  // Now lost forever
```

**Guardrail 7: Deterministic Reconstruction**
```javascript
// Same input (baseline + deltas) → same output always
// Allows verification: reconstruction1 === reconstruction2

// ✓ GOOD:
const applied1 = reconstructAppliedState(step);
const applied2 = reconstructAppliedState(step);
assert(JSON.stringify(applied1) === JSON.stringify(applied2));
```

---

### Q8: What tests are required before implementation?

**Answer: Seven test categories**

**Test Category 1: Scenario Baseline Immutability (4 tests)**
- [ ] Baseline unchanged after applying deltas
- [ ] Applied state doesn't reference baseline (deep clone verified)
- [ ] Multiple delta applications don't mutate baseline
- [ ] Baseline reset works after applied state changes

**Test Category 2: Delta Reconstruction (3 tests)**
- [ ] Single delta reconstructs correctly from event log
- [ ] Multiple deltas apply in order
- [ ] Non-existent units in deltas are skipped safely

**Test Category 3: Event Log Consistency (3 tests)**
- [ ] Only STATE_DELTA events are used for reconstruction
- [ ] Non-STATE_DELTA events ignored
- [ ] Deltas missing from event log don't apply

**Test Category 4: Step-Bounded Application (3 tests)**
- [ ] Deltas for Step N don't affect Step N-1
- [ ] Applied state correct per step
- [ ] Step references tracked in events

**Test Category 5: Deterministic Reconstruction (2 tests)**
- [ ] Same deltas always produce same applied state
- [ ] Multiple reconstructions are identical

**Test Category 6: Cache Invalidation (2 tests)**
- [ ] Cache invalidates on new delta
- [ ] Reconstruction after invalidation is correct

**Test Category 7: Operator Audit (2 tests)**
- [ ] Every applied state change has event-log entry
- [ ] Operator can trace why state is different
- [ ] Unauthorized mutations are detectable

---

### Q9: What should remain deferred?

**Answer: Nine capability areas deferred**

| Capability | Why Deferred | Risk if rushed |
|-----------|-------------|----------------|
| **Step-to-step carryover** | Requires state machine, step boundaries | Silent data loss across steps |
| **Supply consumption** | Needs consumption model, rates | Fake logistics, unrealistic results |
| **Readiness recovery** | Requires recovery model, time coefficients | Units heal unrealistically |
| **Ammo/fuel/food splits** | Requires detailed logistics model | Oversimplification masks reality |
| **Route logistics** | Needs pathfinding, travel time model | Fake movement efficiency |
| **Base stockpiles** | Requires logistics hub model | Supply appears from nowhere |
| **Probability/scoring** | Needs engagement model | Deterministic results unrealistic |
| **AI autonomy** | Requires independent AI reasoning | Loses operator control |
| **Hidden apply behavior** | Requires background state mutations | Invisible state changes, bugs |

**Deferral Contract:**
- Supply: Operator declares change manually (doesn't consume automatically)
- Readiness: Operator declares change (doesn't recover automatically)
- Movement: No automatic carryover between steps
- Logistics: No supply/ammo tracking yet
- Recovery: No time-based improvements to readiness
- Autonomy: All changes require explicit operator decisions

---

### Q10: Smallest safe implementation slice?

**Answer: Four options analyzed; Option A recommended**

### **Option A: In-Memory Run-State Overlay** ← RECOMMENDED

**Scope:**
- Accept button allows operator to "Apply deltas to next step"
- Applied state stored in memory (lost on reload)
- Displayed in UI as "applied readiness/supply"
- Single step only (no carryover)

**Implementation:**
- [ ] AppliedState module (in-memory cache)
- [ ] reconstructFromEventLog(step) function
- [ ] "Apply" button in proposal panel
- [ ] Display applied state in units table
- [ ] Tests for reconstruction + immutability

**Effort:** 1-2 weeks  
**Risk:** Very low (in-memory only, no persistence)  
**Foundation for:** Phase 6G (journal persistence, step carryover)

**Code sketch:**
```javascript
// In-memory applied state
let appliedState = null;

function applyDeltasToNextStep(proposal, deltas) {
  const eventLog = window.AppShellEventLog;
  
  // Log deltas (already done in Phase 6E-A)
  logDeltasAsStateEvents(deltas);
  
  // Compute applied state for next step
  appliedState = reconstructAppliedState(deltas);
  
  // Display in UI
  updateUnitsTableWithAppliedState();
}

function reconstructAppliedState(deltas) {
  const baseline = window.RmoozScenario.scenario;
  const applied = deepClone(baseline.units);
  
  for (const delta of deltas) {
    const unit = applied.find(u => u.uid === delta.unit_uid);
    if (unit) {
      if (delta.delta_type === 'readiness') {
        unit.readiness = delta.value_after;
      } else if (delta.delta_type === 'supply') {
        unit.supply = delta.value_after;
      }
    }
  }
  
  return applied;
}
```

**Acceptance criteria:**
- ✓ Baseline never mutated
- ✓ Applied state matches accepted deltas
- ✓ Display shows applied values correctly
- ✓ Immutability tests pass

---

### **Option B: Journal-Replayed Derived State**

**Scope:**
- Applied state reconstructed from event log on demand
- No in-memory cache
- Per-step application from historical journal

**Implementation:**
- [ ] Journal replay engine
- [ ] journalReplay(upToStep) function
- [ ] Query applied state from replay
- [ ] Detect inconsistencies

**Effort:** 2-3 weeks  
**Risk:** Low (read-only replay)  
**Foundation for:** Multi-step carryover, historical analysis

**Advantage:** Always consistent with journal, no cache bugs  
**Disadvantage:** Slower queries, complex replay logic

---

### **Option C: Explicit "Apply to Next Step" Operator Design**

**Scope:**
- Operator explicitly decides "Apply accepted deltas to Step N+1"
- Creates explicit "apply" event in log
- Clear audit trail of apply decisions

**Implementation:**
- [ ] "Apply to next step" button
- [ ] Apply event logging
- [ ] Step-bound applied state
- [ ] Reject/revert operations

**Effort:** 2 weeks  
**Risk:** Medium (step-bound logic)  
**Foundation for:** Operator-controlled state progression

**Advantage:** Transparent, auditable  
**Disadvantage:** More events in log, more UI complexity

---

### **Option D: Keep Deltas Logged Only (No Apply Yet)**

**Scope:**
- Log deltas indefinitely
- No applied state implementation
- Wait for Phase 6G (full feature design)

**Implementation:**
- [ ] Continue Phase 6E-A as-is
- [ ] Build applied state module after more research

**Effort:** 0 weeks  
**Risk:** Zero (no new code)  
**Foundation for:** Future phases after CMO research

**Advantage:** Time to research proper state machine  
**Disadvantage:** Deltas not used operationally yet

---

## Recommendation: Option A (In-Memory Run-State Overlay)

### **Why Option A?**

1. **Smallest safe slice:** In-memory only, no persistence yet
2. **Foundation ready:** Event log with STATE_DELTA is already built
3. **No irreversible decisions:** Lost on reload, safe to experiment
4. **Clear path forward:** Phase 6G can add persistence/carryover
5. **Operator-visible:** Deltas actually affect next-step display
6. **Test-friendly:** Immutability easily verified
7. **Risk-controlled:** Very low blast radius

### **Implementation Order**

1. **Phase 6F-A:** Applied State Module (in-memory cache)
   - [ ] Reconstruction from event log
   - [ ] Immutability verification
   - [ ] Step-bound queries

2. **Phase 6F-B:** UI Integration
   - [ ] "Apply deltas" button in proposal panel
   - [ ] Display applied state in units table
   - [ ] Next-step preview

3. **Phase 6F-C:** Testing & Verification
   - [ ] Immutability tests
   - [ ] Reconstruction tests
   - [ ] UI integration tests

4. **Phase 6G:** Journal Persistence (later)
   - [ ] Store applied state in journal
   - [ ] Step-to-step carryover
   - [ ] Historical replay

### **Success Criteria**

✓ Baseline immutability guaranteed (tests pass)  
✓ Applied state matches accepted deltas  
✓ Display shows applied readiness/supply correctly  
✓ No world-state engine mutation  
✓ Deltas visible/meaningful to operator  
✓ Can be discarded safely on reload

---

## What Remains Deferred

### **Explicitly NOT in Phase 6F-A:**
- ❌ Supply consumption logic
- ❌ Readiness recovery over time
- ❌ Step-to-step carryover
- ❌ Journal persistence
- ❌ Undo/revert operations
- ❌ Applied state in export/download
- ❌ Ammo/fuel/food management
- ❌ Route/logistics calculations

### **Explicitly Preserved:**
- ✅ Scenario baseline immutability
- ✅ Event log as canonical source
- ✅ Operator audit trail
- ✅ No hidden state changes
- ✅ Reconstructible from journal

---

## Contract Summary

**The Apply-State Contract:**

1. **Baseline is sacred:** `window.RmoozScenario.scenario` never mutates
2. **Deltas are events:** Accepted deltas live only in event log
3. **Applied state is derived:** Computed from baseline + deltas, not stored
4. **Step-bounded:** Applied state valid for one step only (initially)
5. **Operator-audited:** Every state change traceable to operator decision
6. **Reconstructible:** Can be rebuilt from event log at any time
7. **Optional:** Applied state only affects display, not adjudication
8. **Deferring:** No consumption, recovery, carryover, or probability yet

---

## Conclusion

**Phase 6F Audit: ✅ COMPLETE**

The contract for applied state is clear: it's derived from accepted deltas in the event log, overlaid on the immutable baseline, and used only for next-step display/readiness checks. The smallest safe slice is an in-memory overlay (Option A) that makes deltas operationally visible to the operator while deferring persistence and carryover to Phase 6G.

**Ready for:** Phase 6F-A implementation planning

---

**Audit completed:** 2026-06-04  
**Recommendation:** Option A (In-Memory Run-State Overlay)  
**Risk level:** Very low (in-memory only)  
**Effort estimate:** 1-2 weeks  
**Foundation for:** Phase 6G (persistence + carryover)

