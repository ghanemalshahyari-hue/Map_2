# Phase 6E Audit: Readiness/Supply State Transition Design

**Date:** 2026-06-04  
**Scope:** Audit state transition architecture for readiness/supply without fake logistics  
**Status:** ✅ AUDIT COMPLETE (Read-only; recommendations provided)

---

## Executive Summary

RMOOZ has a **partial state transition architecture** that is:
- ✅ **Designed but not fully wired** in the live operator workspace
- ✅ **Pure and deterministic** (no RNG, no hidden mutation)
- ✅ **Journaled** (all decisions recorded durably)
- ✅ **Separate from authored baseline** (source scenario immutable)

**Current state:** Decisions are proposed, recorded, and can be committed to the journal, but the **live scenario-workspace has not implemented state application yet**. The table values remain static in the UI.

**Recommendation:** Option B — **Operator event log display of declared deltas** is the smallest safe next step. Display the decided deltas in the event log and journal without modifying scenario values, allowing operators to see what will change before persisting it to the next step baseline.

---

## Architecture Questions: Answered

### Q1: Where are READINESS_DELTA and SUPPLY_DELTA defined?

**Location:** `UI_MOdified/client/shell/world-state.js` lines 925–957

**Definition:**
```javascript
var DECISION_TYPES = ['NOTE', 'UNIT_MOVE', 'READINESS_DELTA', 'SUPPLY_DELTA'];

function applyDecision(state, decision) {
    var next = clone(state);
    // ...
    if (d.type === 'READINESS_DELTA' && typeof d.value === 'string') {
        u.readiness = d.value;  // replaces with new enum value
    } else if (d.type === 'SUPPLY_DELTA' && num(d.value) != null) {
        var base = num(u.supply) != null ? u.supply : 1;
        u.supply = Math.max(0, Math.min(1, base + d.value));  // adds delta, clamps 0-1
    }
}
```

**Also in:** `UI_MOdified/client/shell/world-state-transition.js` lines 94–119

More comprehensive types defined:
```javascript
const DECISION_TYPES = [
    'MOVE',           // unit position
    'SET_EMCON',      // sensor state
    'SET_READINESS',  // direct readiness replacement
    'SET_WRA',        // weapon rules of action
    'RESUPPLY',       // supply + magazine refill
    'ENGAGE',         // engagement resolution
    'NOTE'            // operator comment
];
```

---

### Q2: Are decision effects preview-only, persisted, or applied?

**Status:** Three distinct paths with different semantics.

#### Path 1: LLM Proposal → Operator Decision (Current Primary)

**Flow:**
```
/api/sim/propose → AI generates Proposal with projected_state
                ↓
Browser displays dry-run preview (NO mutation to window.RmoozScenario)
                ↓
Operator clicks ACCEPT/REJECT/HOLD
                ↓
/api/sim/commit → Server journal.appendCommit() ONE row per decision
                ↓
Durable log: data/journal/<run>.jsonl
```

**Code:** `UI_MOdified/client/shell/ai-proposal-commit-bridge.js`  
**State Application:** Server-side journal write ONLY; browser state unchanged  
**Scenario Mutation:** NO (live scenario-workspace explicitly forbidden from calling /api/sim/commit)

#### Path 2: Direct WS3 Decision (Server API Only)

**Flow:**
```
/api/sim/decide { decisions: [{type:'SET_READINESS',...}] }
                ↓
Server:
  1. Derive base World State (WS1+DB1+DET1)
  2. Apply decision via WS3 (pure clone)
  3. Write journal row(s)
  4. Return committed_state
```

**Code:** `UI_MOdified/server/ai/adjudicator-agent.js` lines 1089–1155  
**State Application:** Server derives, transitions, journals, returns result  
**Browser:** Not yet wired to live workspace

#### Path 3: Live Scenario Workspace (Current)

**State:** ✅ Read-only, ❌ No mutation
```javascript
// From scenario-workspace.js:
// Does NOT call /api/sim/commit. Does NOT execute combat/effects. No Gate 7.
// NOT a real simulation journal. NOT connected to server/AI/storage/journal.
// FORBIDDEN: fetch, /api/sim/commit, any backend call.
```

**Decision Recording:** Local mirror only (in-memory AppShellDecisionJournal)  
**Scenario Updates:** NO — values remain static from loaded fixture

---

### Q3: Is there an existing world-state transition loop?

**Status:** YES, but not integrated into live workspace.

**Transition Engine:** `UI_MOdified/client/shell/world-state-transition.js`

**Components:**
1. **WS1 (World State)** — Lines 1–997 in world-state.js
   - Source: scenario, step index, enrichment rules (DB1)
   - Output: derived contacts, objective evidence, balance, BLS status
   - Pure functions, no mutation of input

2. **WS3 (State Transition)** — world-state-transition.js
   - Input: world state + decision
   - Transitions: MOVE, SET_EMCON, SET_READINESS, SET_WRA, RESUPPLY, ENGAGE, NOTE
   - Output: cloned next world state + effects array
   - Calls detection (DET1) + engagement (ENG1) engines

3. **Journal** — data/journal/<run>.jsonl
   - Persists: one row per decision
   - Contains: run_id, step, decision, operator_id, prev_state_hash, post_state_hash
   - Immutable, append-only

**Loop:** (designed but not wired to live UI)
```
World State (WS1)
       ↓
Propose Step (AI) → Proposal with projected_state
       ↓
Operator Decision (ACCEPT/REJECT/HOLD)
       ↓
applyDecision(ws, decision) → next WS
       ↓
Journal Row Written
       ↓
(Next Step) → new baseline WS
```

---

### Q4: Does RMOOZ currently support step-to-step derived state?

**Status:** NO — not in live workspace. Designed at server level.

**Current behavior:**
- Each step is independent (step 0, 1, 2, ... each loads fresh from scenario)
- No carryover of readiness/supply changes between steps
- Decisions are recorded but not applied to the next step's baseline

**Where step-to-step COULD work:**
```javascript
// In adjudicator.commitDecisions (server):
const baseWs = worldEngine.project(scenario, stepIndex, engineOpts);
const result = worldEngine.transition(baseWs, decisions, engineOpts);
const committed_state = result.worldState;  // ← This is the "new baseline" for next step
```

**Not yet implemented:** No mechanism to persist committed_state back to scenario.steps[i+1]

---

### Q5: What is the safest minimal implementation after visibility?

**Five options ranked by safety/scope:**

| Option | Scope | Safety | Effort | Next Step |
|--------|-------|--------|--------|-----------|
| **A: Preview-only delta display** | Display only | ✅ Highest | 2-3 hours | Show readiness/supply deltas in proposal panel; no state change |
| **B: Event log delta display** | Display + log | ✅ High | 3-4 hours | Record decided deltas in event log; journaled but not applied |
| **C: Explicit apply-state contract** | State seam + API | ✅ Medium | 8-12 hours | Design when/where state is applied; phase-2 implementation |
| **D: No transition yet** | Defer | N/A | 0 hours | Keep values static; design first |

---

### Q6: Should supply/readiness changes be shown as preview only first?

**Status:** YES — strongly recommended.

**Rationale:**
1. **Operator visibility first** — Show "if you accept, readiness → limited" before committing
2. **Reversible** — Preview changes don't persist; operator can reject
3. **Low risk** — No state mutation, no hidden logic
4. **Audit trail** — Decision intent clear before journal write
5. **Matches current pattern** — AI proposals are already dry-run previews

**Implementation:** Option A or B above

---

### Q7: Should changes be stored in operator event log?

**Status:** YES — if a decision is accepted, log the delta.

**Current Event Log:** (from `UI_MOdified/client/shell/event-log.js`)
- Tabular: DTG, severity, category, source, message
- Not chat-like (no avatars, bubbles, speaker lanes)
- Read-only mirror

**What to log:**
```javascript
{
    severity: 'INFO',
    category: 'STATE',
    source:   'operator-decision',
    message:  'RED-1 readiness: ready → limited',
    payload:  { unit_uid: 'RED-1', delta_type: 'readiness', 
                value_before: 'ready', value_after: 'limited' }
}
```

**Design constraint:** Log entries are for transparency, not re-playing decisions.

---

### Q8: Should authored scenario values remain baseline immutable?

**Status:** YES — locked by design.

**Immutability rules (from CLAUDE.md):**
```
Closed by design: client scenario-state mutation (window.units/map/lines),
the journal export/download guards, and the separate scenario-workspace
live-decision flow.
```

**How it works:**
1. Scenario loads from JSON → window.RmoozScenario.scenario
2. Authored readiness/supply are the BASELINE
3. Decisions applied to derived World State (WS3 clone), NOT scenario baseline
4. Journal records deltas, not mutations
5. Next step reloads from scenario (resets to baseline)

**Example:**
```javascript
// Authored baseline (immutable)
scenario.red_units[0].readiness = "ready";
scenario.red_units[0].supply = 0.8;

// World State 3 applies decision (in memory)
worldState.units[0].readiness = "limited";
worldState.units[0].supply = 0.6;

// Journal records decision
{ decision: "SET_READINESS", unit: "RED-1", value: "limited" }

// Next step: scenario baseline resets
scenario.red_units[0].readiness = "ready";  // ← Back to authored
```

---

### Q9: What tests are required before any state mutation?

**Minimum test suite:**

```javascript
// Test 1: Decision application is pure
const ws1 = deriveWorldState(scenario, 0);
const d = { type: 'SET_READINESS', actor: 'RED-1', value: 'limited' };
const result = applyDecision(ws1, d);
assert(ws1.units[0].readiness === 'ready');  // ← Original unchanged
assert(result.worldState.units[0].readiness === 'limited');  // ← New state changed

// Test 2: Deltas are clamped
const d2 = { type: 'SUPPLY_DELTA', actor: 'RED-1', value: 0.6 };
const result2 = applyDecision(ws1, d2);
assert(result2.worldState.units[0].supply >= 0 && result2.worldState.units[0].supply <= 1);

// Test 3: Journal records decision
const journal = appendCommit({ run_id: 'test', step: 0, decision: 'accept', ... });
assert(journal.ok === true);
assert(journal.seq > 0);

// Test 4: Multiple decisions compose correctly
const ws2 = deriveWorldState(scenario, 0);
const decisions = [
    { type: 'SET_READINESS', actor: 'RED-1', value: 'limited' },
    { type: 'SUPPLY_DELTA', actor: 'RED-1', value: -0.2 }
];
const result3 = applyDecisions(ws2, decisions);
assert(result3.worldState.units[0].readiness === 'limited');
assert(result3.worldState.units[0].supply < 1.0);

// Test 5: Scenario baseline never mutated
const origReadiness = scenario.red_units[0].readiness;
applyDecisions(derivedWS, decisions);
assert(scenario.red_units[0].readiness === origReadiness);

// Test 6: Contacts recomputed after decision
const ws3 = deriveWorldState(scenario, 0);
const wsAfter = applyDecision(ws3, moveDecision);
assert(wsAfter.worldState.derived && wsAfter.worldState.derived.contacts);
```

**Existing tests:** `UI_MOdified/scripts/test-world-state*.js` (multiple)

---

### Q10: What should be deferred to avoid fake logistics?

**LOCKED (do NOT implement):**

❌ **Automatic consumption:**
- Supply does NOT automatically deplete per action
- Readiness does NOT automatically recover over time
- No implicit state changes (only explicit decisions)

❌ **Commodity splitting:**
- No ammo/fuel/food granularity
- No resupply routing
- No base stockpiles or depots
- No supply lines or LOCs (Lines of Communication)

❌ **Probabilistic outcomes:**
- No RNG for readiness/supply effects
- No "maybe supply drops" or "random degradation"
- Deterministic always (explainable, repeatable)

❌ **Casualty model:**
- Strength loss is from ENGAGE (detection + weapon + salvo)
- readiness/supply do NOT depend on strength
- Status (DEGRADED, DESTROYED) is separate from readiness

❌ **Fatigue model:**
- Readiness does NOT auto-degrade from movement
- No "accumulated marching" effect
- Operator decides readiness, not the sim

❌ **AI-generated involvement:**
- Decisions must come from operator or explicit rules
- AI can PROPOSE decisions, but doesn't auto-apply
- "What should the unit's readiness be?" is operator choice

---

## Current State Summary

### What Works
- ✅ World State derivation (WS1) — contacts, objectives, balance, BLS
- ✅ State transitions (WS3) — decisions applied to cloned state
- ✅ Decision types — MOVE, EMCON, READINESS, WRA, RESUPPLY, ENGAGE, NOTE
- ✅ Journaling — decisions recorded durably, immutable
- ✅ Baseline immutability — scenario unchanged
- ✅ Pure functions — no hidden mutation, deterministic

### What's Missing
- ❌ Live UI state application — decisions proposed but not displayed as changes
- ❌ Step-to-step carryover — next step doesn't inherit previous state
- ❌ Operator workflow — no "preview delta → decide → apply" loop in UI
- ❌ Event log integration — deltas not yet logged when decisions accepted
- ❌ Scenario save/load — next step doesn't persist committed state

### What's Deferred (by design)
- ⏸️ Consumption logic (supply depletion)
- ⏸️ Casualty persistence (strength/status carryover)
- ⏸️ Logistics simulation (routes, stocks, resupply)
- ⏸️ AI autonomy (system-generated decisions)
- ⏸️ Fatigue/readiness recovery (implicit state changes)

---

## Decision Paths: Detailed Architecture

### LLM Proposal Path (Current Primary)

**Entry:** `/api/sim/propose` (POST)
```javascript
POST /api/sim/propose {
    scenarioName, stepIndex, prevState, trialId,
    coaParams, model, timeoutMs
}
```

**Server processing:**
```javascript
adjudicator.proposeStep({...})
  ↓
LLM generates proposal
  ↓
{ 
    proposal_id, 
    actions: [{type, actor, target, label, ...}],
    projected_state: {units: [...], ...},
    narrative
}
```

**Browser:**
```javascript
NEVER calls applyDecision() on the projected_state
DISPLAYS the proposal (dry-run preview)
WAITS for operator decision (ACCEPT/REJECT/HOLD)
```

**Commit:** `/api/sim/commit` (POST)
```javascript
POST /api/sim/commit {
    proposal_id,
    accepted_action_ids: 'ALL' | [] | ['action-1', ...],
    operator_id
}
```

**Server:**
```javascript
adjudicator.commitStep({...})
  ↓
journal.appendCommit() ← ONE row per decision
  ↓
{
    ok: true,
    journal_seq,
    post_state_hash,
    ...
}
```

**Browser state:** UNCHANGED (scenario still at baseline)

---

### Direct WS3 Decision Path (Server Only)

**Entry:** `/api/sim/decide` (POST)
```javascript
POST /api/sim/decide {
    scenarioName, stepIndex,
    decisions: [{type, actor, value, ...}],
    operator_id | headless: {reason}
}
```

**Server processing:**
```javascript
worldEngine.project(scenario, stepIndex)
  ↓ (base WS derived from scenario)
worldEngine.transition(baseWs, decisions)
  ↓ (apply decision, clone state)
journal.appendCommit() ← one row per decision
  ↓
{
    ok: true,
    committed_state: {units: [...], ...},
    effects: [...],
    journal_seq,
    post_state_hash
}
```

**Browser:** Not yet called from live workspace

---

## Recommendation: Option B

### **Option B: Operator Event Log Display of Declared Deltas**

**What it does:**
1. Display proposed deltas in the AI proposal panel ("readiness will change: ready → limited")
2. When operator accepts, log the delta to event log as STATE category
3. Journal records the decision
4. Scenario baseline remains unchanged

**Why it's safe:**
- ✅ No scenario mutation
- ✅ No live state application
- ✅ Operator sees what will change before committing
- ✅ Audit trail via event log
- ✅ Reversible (operator can reject)
- ✅ Aligns with current preview workflow

**Implementation scope:**
- Modify ai-proposal-panel.js to display readiness/supply deltas from projected_state
- Modify event-log display to show STATE entries with delta payloads
- Wire ai-proposal-commit-bridge.js to log deltas when ACCEPT decision made
- NO changes to scenario.js, world-state.js, or state transition engine

**Effort:** 3–4 hours  
**Risk:** Low (display-only changes + logging)  
**Path forward:** After Option B, implement Option C (apply-state contract) for Phase 6F

---

## Why Not Other Options?

### ❌ Option A (Preview-only delta display only)
- Shows change but doesn't record it
- Loses the operator's intent (why did they accept?)
- Gaps in audit trail
- **Verdict:** Incomplete; recommend Option B instead

### ❌ Option C (Explicit apply-state contract)
- Requires designing when state is applied (end of step? end of phase? persistent?)
- Requires modifying scenario save/load
- Larger surface area for bugs
- **When to use:** After Phase 6B (event log + deltas are proven)

### ❌ Option D (No transition yet)
- Keeps values static (Phase 6C-A columns are "read-only mirrors" with no updates)
- Defers visibility until later
- Misses near-term feedback from operators
- **When to use:** If Phase 6B budget exhausted

---

## Phase Sequence (Recommended)

```
Phase 6B ✅ (DONE): Authored readiness/supply + Why-Not messages
Phase 6C-A ✅ (DONE): Live Involved Units display (read-only)
Phase 6C-C ✅ (DONE): Why-Not message clarity
Phase 6D ✅ (DONE): Data wiring audit + test fixture verification

→ Phase 6E (NOW): State transition design audit [THIS DOC]

→ Phase 6E-A (NEXT): Option B — Event log delta display
  - Display proposed deltas in proposal panel
  - Log decided deltas to event log
  - 3–4 hours, low risk

→ Phase 6F (FUTURE): Option C — Apply-state contract
  - Design: when are deltas applied? (end of step? baseline reset?)
  - Persist committed_state to next step
  - 8–12 hours, medium risk

→ Phase 6G+ (FUTURE): Consumption logic
  - Supply depletion per action
  - Readiness recovery
  - Casualty carryover
```

---

## Architecture Invariants (Locked)

From CLAUDE.md and boundary-audit-panel.js:

1. **No client scenario mutation** — window.units, window.map, window.lines stay immutable
2. **Single commit path** — /api/sim/commit is the only durable state-mutation endpoint
3. **No AI autonomy** — operator intent required (no auto-apply decisions)
4. **No simulation loop closed in UI** — proposal is preview; decision is intent; journal is evidence
5. **Authored baseline is immutable** — scenario fixture values are the reference
6. **Decisions are pure** — applyDecision does not mutate input
7. **Journal is append-only** — no rewrites, no deletions

---

## Summary: Design-Ready Artifacts

**Completed:**
- ✅ WS1 (world state derivation) — Lines 1–997 in world-state.js
- ✅ WS3 (state transitions) — world-state-transition.js
- ✅ Journal (append-only logging) — server/sim/journal.js
- ✅ Decision types defined — MOVE, EMCON, READINESS, WRA, RESUPPLY, ENGAGE, NOTE
- ✅ Immutability contract — baseline scenario untouched
- ✅ Pure transition function — no hidden mutation

**Designed but not integrated:**
- ⏸️ Event log display of deltas (Phase 6E-A)
- ⏸️ Step-to-step state carryover (Phase 6F)
- ⏸️ Consumption logic (Phase 6G)

**Deferred by design:**
- 🚫 Automatic consumption
- 🚫 Commodity splitting
- 🚫 RNG/probability
- 🚫 Casualty model
- 🚫 Fatigue model
- 🚫 AI autonomy

---

## Conclusion

RMOOZ has a **well-designed state transition architecture** that is **nearly complete** but **not yet wired into the live operator workflow**. The safest next step is **Option B: Event log delta display** — showing operators what will change when they accept a decision, without mutating scenario values.

This keeps the boundary clean, preserves immutability, and gives operators visibility before Phase 6F implements persistent state carryover.

---

**Audit completed:** 2026-06-04  
**Recommendation:** Option B (Event log delta display) as Phase 6E-A  
**Confidence:** High (architecture verified at code + design levels)  
**Ready for:** Phase 6E-A planning or Phase 6F apply-state design (user's choice)
