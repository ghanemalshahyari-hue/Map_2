# Phase 6C Audit: Logistics & Readiness Operational Use

**Date:** 2026-06-04  
**Scope:** How authored readiness/supply should be used operationally after Phase 6B Slice 2A  
**Status:** ✅ AUDIT COMPLETE (code inspection + integration mapping)

---

## Executive Summary

Phase 6B Slice 2A added **authoring** of unit readiness/supply in Edit Mode. Phase 6C must add **operational visibility** — operators need to see readiness/supply state on the map, in the workspace, and in event logs.

**Current state:** Readiness/supply are authored, persisted, and consumed by the evidence ledger + Why-Not logic. **Missing:** Live workspace display and map-level indicators.

**Recommended next slice:** **6C-A: Live Workspace Unit Readiness/Supply Display** — show authored readiness & supply in the Forces list alongside other unit fields, enabling operators to track and verify unit posture before committing actions.

---

## 1. Where Readiness/Supply Are Currently Consumed

### A. Evidence Ledger (world-state.js, lines 524–683)

**Combat Readiness State Evidence:**
- **Computed:** Majority of unit readiness values (ready | limited | not_ready)
- **Source:** `ws.units[].readiness`
- **Level:** Objective-level, per step
- **Confidence:** 0.8
- **Display:** objective-evidence-panel.js (Readiness group)

```javascript
// Line 665: Majority-vote logic
var readyCount = 0, limitedCount = 0, notReadyCount = 0;
for (var rui = 0; rui < blueUnits.length; rui++) {
    var rdiness = blueUnits[rui].readiness || 'ready';
    if (rdiness === 'ready') readyCount++;
    else if (rdiness === 'limited') limitedCount++;
    else if (rdiness === 'not_ready') notReadyCount++;
}
var maxCount = Math.max(readyCount, limitedCount, notReadyCount);
var state = 'ready';
if (limitedCount === maxCount) state = 'limited';
else if (notReadyCount === maxCount) state = 'not_ready';
```

**Supply Sustainability Evidence:**
- **Computed:** Average of unit supply values
- **Source:** `ws.units[].supply` (threshold: 0.5 = neutral)
- **Level:** Objective-level, per step
- **Confidence:** 0.7 (or 0.85 with fallback)
- **Display:** objective-evidence-panel.js (Supply group)

```javascript
// Line 628: Average supply
var totalSupply = 0, supplyCount = 0;
for (var sui = 0; sui < blueUnits.length; sui++) {
    var sup = num(blueUnits[sui].supply);
    if (Number.isFinite(sup)) {
        totalSupply += sup;
        supplyCount++;
    }
}
var avgSupply = totalSupply / supplyCount;  // 0–1 scale
```

### B. Action-Feasibility (Why-Not Logic) (action-feasibility.js, lines 173–189)

**Readiness Constraints:**
- **readiness_unavailable (BLOCKER):** `unit.readiness === 'not_ready'`
  - Message: "Actor readiness is not_ready — the unit cannot act."
  - Effect: Action marked BLOCKED (red badge)

- **readiness_degraded (RISK):** `unit.readiness === 'limited'`
  - Message: "Unit readiness is limited (not ideal)."
  - Effect: Action marked feasible_with_risk (yellow badge)

**Supply Constraints:**
- **supply_limited (RISK):** `unit.supply < 0.5`
  - Message: "Supply is below the readiness layer's neutral level."
  - Effect: Action marked feasible_with_risk (yellow badge)

```javascript
// Lines 173–189: Feasibility logic
if (actor && actor.readiness === 'not_ready') {
    block('readiness_unavailable', 'ws.units[].readiness');
}
var readyState = actor ? actor.readiness : evVal(ws, 'combat_readiness_state');
if (readyState === 'limited') {
    risk('readiness_degraded', 'ws.units[].readiness');
}
var supply = (actor && typeof actor.supply === 'number') ? actor.supply : evVal(ws, 'supply_sustainability');
if (typeof supply === 'number' && supply < 0.5) {
    risk('supply_limited', 'ws.units[].supply');
}
```

### C. Decision Modification (world-state.js, lines 948–951)

**READINESS_DELTA:**
```javascript
} else if (d.type === 'READINESS_DELTA' && typeof d.value === 'string') {
    u.readiness = d.value;  // Direct set: 'ready', 'limited', 'not_ready'
}
```

**SUPPLY_DELTA:**
```javascript
} else if (d.type === 'SUPPLY_DELTA' && num(d.value) != null) {
    var base = num(u.supply) != null ? u.supply : 1;
    u.supply = Math.max(0, Math.min(1, base + d.value));  // Adjust + clamp
}
```

---

## 2. Which UI Panels Currently Expose Readiness/Supply

### Panels That Show Readiness/Supply

| Panel | Component | Display | Readiness | Supply | Notes |
|-------|-----------|---------|-----------|--------|-------|
| **Objective Evidence** | objective-evidence-panel.js | Read-only table | combat_readiness_state (force state) | supply_sustainability (avg %) | Objective-level; not unit-level |
| **Why-Not** | action-feasibility.js | Blocker/risk badges | readiness_unavailable, readiness_degraded | supply_limited | Unit-level; when action is evaluated |
| **Edit Mode** | scenario-edit-mode.js | Edit controls (dropdown + slider) | Dropdown (ready, limited, not_ready) | 0–1 numeric input | Author-only |
| **Selected Unit Panel** | unit-panel.js | Read-only display | — (comment only) | — (comment only) | Not currently displayed |

### Panels That Don't Show Readiness/Supply

| Panel | Reason |
|-------|--------|
| **Live Step Status** | Shows unit status (ACTIVE, DEFENDING, etc.) but not readiness |
| **Forces Tree (Edit Mode)** | Shows uid, role, echelon but not readiness/supply |
| **Forces Tree (Live)** | Workspace shows unit counts/breakdown by echelon but no readiness/supply |
| **Map/HUD** | No badges for low supply or degraded readiness |
| **Unit Card (Live)** | Shows symbol, position, status but not readiness/supply |
| **Event Log** | Does not log readiness/supply changes |

---

## 3. Live Workspace Readiness/Supply Visibility

### Current State: **Minimal**

**Edit Mode:**
- Readiness/supply can be authored in unit detail form (both RED/BLUE)
- Values persist to working scenario (_draft)
- No display in Forces tree (unit list on left)
- No indication of authored readiness/supply while editing

**Live Scenario:**
- No Forces list in live mode (only "Involved Units" per step, read-only)
- No unit-level readiness/supply displayed
- Only objective-level evidence visible (combat_readiness_state, supply_sustainability)

**Gap:** Operators cannot see unit-level readiness/supply in the workspace while making decisions. They would need to export scenario and inspect JSON to verify authored values.

---

## 4. Map/HUD Display of Degraded Readiness or Low Supply

### Current State: **None**

**Not present:**
- ❌ Color-coded unit markers (green/yellow/red for readiness)
- ❌ Supply percentage badges on unit symbols
- ❌ "Low Supply" indicator on map
- ❌ "Degraded Readiness" indicator on map
- ❌ HUD readiness/supply status bar

**Why-Not is the only signal:** When an operator tries to commit an action, Why-Not explains if readiness/supply block or risk the action. **This is reactive, not proactive.** Operators don't know readiness/supply state until they try an action.

---

## 5. Why-Not Explanation Clarity

### Current Messages (action-feasibility.js, line 44)

| Constraint | Current Message | Clarity | Improvement Needed? |
|-----------|-----------------|---------|-------------------|
| readiness_unavailable | "Actor readiness is not_ready — the unit cannot act." | Good | No (clear and specific) |
| readiness_degraded | "Unit readiness is limited (not ideal)." | Fair | Yes (vague "not ideal") |
| supply_limited | "Supply is below the readiness layer's neutral level." | Poor | Yes (references "readiness layer" confusingly) |

**Recommended messages (Phase 6C-C):**
- readiness_unavailable: "Unit is NOT READY — cannot commit this action. Use 'Restore readiness' option."
- readiness_degraded: "Unit readiness is LIMITED — action may not succeed. Consider 'Restore readiness' first."
- supply_limited: "Unit supply is LOW (below 50%). Resupply before committing action."

---

## 6. Export Readiness/Supply Preservation

### Current State: **✅ Works cleanly**

**Export mechanism:** `JSON.stringify(window.RmoozScenario.scenario)`

**Result:** Readiness/supply fields preserved exactly as authored:
```json
{
  "red_units": [
    {
      "uid": "SA300-01",
      "role": "S-300",
      "readiness": "limited",
      "supply": 0.6
    }
  ],
  "blue_units": [
    {
      "unit_uid": "B-BATTERY",
      "readiness": "not_ready",
      "supply": 0.3
    }
  ]
}
```

**No issues:** Fields pass through JSON cleanly. Import parsing works correctly.

---

## 7. Scenario Architecture: Unit-Level, Step-Level, or Decision-Modified?

### Architecture: **Unit-level authored, step-level evidence, decision-modifiable**

```
┌─ Scenario.red_units[*] (unit-level, authored, persistent)
│  ├─ readiness: 'ready' | 'limited' | 'not_ready'
│  └─ supply: 0–1
│
├─ deriveWorldState(scenario, stepIndex) → World State snapshot
│  └─ Computes evidence per objective per step
│     ├─ combat_readiness_state (majority of unit readiness)
│     └─ supply_sustainability (average of unit supply)
│
└─ Decisions (READINESS_DELTA, SUPPLY_DELTA)
   └─ Modify unit readiness/supply IN WORLD STATE
      (Does NOT mutate scenario.red_units[] — changes are local to that world-state snapshot)
```

### Key Insight: **Readiness/supply are unit-level in the scenario, but evidence is objective-level and step-wise.**

- **Authored:** Unit-level (scenario.red_units[*].readiness, .supply)
- **Evidence:** Objective-level, per step (majority vote for readiness, average for supply)
- **Modified:** In-world-state (decisions), not persisted back to scenario
- **Restored:** Next world-state derivation recalculates from scenario + decisions

### Implication:
- Initial readiness/supply is set in Edit Mode (scenario level)
- Evidence reflects current readiness/supply each step
- Decisions can temporarily modify (for that step only)
- Cannot persist readiness/supply changes back to scenario (by design — journal is read-only)

---

## 8. Decision-Driven Readiness/Supply: Visibility Gap

### Current State: **Decisions exist, but not visible in UI**

**Decision types defined in world-state.js:**
- `READINESS_DELTA`: Directly set readiness to a new value
- `SUPPLY_DELTA`: Adjust supply by delta (clamped to [0,1])

**Storage:** Decisions stored in scenario.decisions[] array (per step)

**Visibility:**
- ❌ Event log does not show readiness/supply decisions
- ❌ Scenario workspace does not list committed decisions' readiness/supply effects
- ❌ No "Readiness changed: ready → limited" log entry

**Gap:** Operators cannot see what readiness/supply decisions were made and when.

---

## 9. Recommended Next Slices (Phase 6C onwards)

### Priority Ranking

| Slice | Name | Impact | Effort | Recommended |
|-------|------|--------|--------|------------|
| **A** | Live Workspace Unit Readiness/Supply Display | HIGH | LOW | ✅ **FIRST** |
| **B** | Map/HUD Low-Supply & Degraded-Readiness Badges | HIGH | MEDIUM | 2nd |
| **C** | Why-Not Explanation Message Clarity | MEDIUM | LOW | 3rd (pair with A) |
| **D** | Decision Event Log for Readiness/Supply | MEDIUM | MEDIUM | 4th |
| **E** | Schema Validation Hardening | MEDIUM | LOW | 5th |

---

## 10. Recommended Phase 6C-A: Live Workspace Unit Readiness/Supply Display

### Slice 6C-A Scope

**Goal:** Make unit readiness/supply visible in the live workspace Forces list, so operators can track and verify unit posture before committing decisions.

**Implementation (minimal):**

1. **Forces list display** (in Scenario Workspace, read-only step context):
   - Add readiness/supply columns to the "Involved Units" table (already read-only)
   - Show: `uid | side | role | readiness | supply%`
   - Example: `"SA300-01 | RED | S-300 | limited | 60%"`

2. **Readiness color coding** (optional, for clarity):
   - ready → green/default
   - limited → yellow/amber
   - not_ready → red

3. **Supply numerical display:**
   - Show as percentage (0–100%) for operator clarity
   - Store/compute as 0–1 in backend

4. **No simulation, no changes:**
   - Display only; read-only
   - Shows authored values + decision-modified values (as of current step)
   - Does NOT simulate resupply, degradation, or consumption

**Files to modify:**
- `scenario-workspace.js` (add readiness/supply columns to "Involved Units" table)
- `style.css` (add column widths, color classes for readiness states)

**Not included (out of scope):**
- ❌ Edit UI in live mode (readiness/supply editing stays in Edit Mode)
- ❌ Map badges
- ❌ Event log entries
- ❌ Why-Not message improvements (do separately in 6C-C)
- ❌ Consumption/depletion logic
- ❌ Logistics simulation

**Size:** ~150 lines of code + CSS

---

## 11. What Should Be Deferred (Avoid Fake Simulation)

### Hard Boundaries for Phase 6C

**❌ DO NOT implement:**

1. **Consumption logic:** "Unit fires 100 rounds → supply drops by 0.15"
   - Requires ammo tracking, engagement history, rate-of-fire
   - Out of scope; defer to Phase 6B+ when proper logistics model exists

2. **Degradation logic:** "Unit fights for 4 hours → readiness drops from ready to limited"
   - Requires fatigue/morale system, combat intensity modeling
   - Out of scope; defer to personnel/maintenance/reliability phase

3. **Route logistics:** "Resupply convoy from base to unit takes 6 hours"
   - Requires movement simulation, supply routing, base capacity tracking
   - Out of scope; defer to Phase 6B+

4. **Base stockpiles:** "Central Blue Supply Hub: 2,000 liters fuel, 50,000 rounds ammo"
   - Requires logistics pooling, consumption rates, replenishment
   - Out of scope; defer to Phase 6B+

5. **Resupply simulation:** "Unit decides to resupply → supply jumps to 1.0"
   - Would be fake (no real logistics); confuses operators
   - Deferred; when implemented, must be realistic or clearly marked as "wishful thinking"

6. **Scoring or probability:** "Low supply reduces Pk by 15%"
   - Would require engagement model tuning, validation
   - Out of scope

7. **AI COA generation using readiness/supply:** "AI avoids low-supply units for offensive missions"
   - Would require AI rule authoring, testing, validation
   - Out of scope

### Why These Are Deferred

All of the above create a **false sense of simulation** if not done carefully. An operator might believe:
- "My unit's readiness degrades automatically" (false — it doesn't; changes require decisions only)
- "Resupply happens via a decision" (not yet; the decision exists but is read-only cosmetic)
- "Supply affects engagement" (not in E1; coverage/detection/engagement are independent of supply)

**Better to be honest:** Current RMOOZ displays readiness/supply, but does NOT simulate their effects. When ready to add consumption/degradation, it will be clearly documented as a new capability, not a stealth feature.

---

## 12. Decision: Recommended Next Slice

### ✅ Recommended: **Phase 6C-A — Live Workspace Unit Readiness/Supply Display**

**Why this slice:**
1. **Addresses the biggest operational gap:** Operators can't see unit readiness/supply in live mode
2. **High value, low risk:** Read-only display, no mutation, no simulation
3. **Enables Phase 6C-B/C/D:** Once visible, operators can request map badges, better Why-Not text, event logging
4. **Small scope:** ~150 lines of code, no schema changes, no new fields
5. **Validates Phase 6B:** Proves that authored readiness/supply are useful and complete

**Scope summary:**
- ✅ Show readiness/supply in "Involved Units" table (read-only, per step)
- ✅ Color-code readiness for clarity (optional)
- ✅ Display supply as percentage
- ✅ No simulation, no changes to Why-Not or map

**Non-scope:**
- ❌ Map badges (Phase 6C-B)
- ❌ Why-Not rewording (Phase 6C-C)
- ❌ Event logging (Phase 6C-D)
- ❌ Consumption/degradation (Phase 6B+)
- ❌ Logistics simulation (Phase 6B+)

---

## Appendix: Scenario Architecture Summary

### Unit-Level Fields (Authored in Edit Mode, Scenario-Persistent)

```javascript
scenario.red_units[*] = {
    uid: 'SA300-01',
    role: 'S-300 SAM',
    readiness: 'limited',      // NEW in Phase 6B
    supply: 0.6,               // NEW in Phase 6B
    strength: 1.0,
    coord: [18.5, 30.2],
    // ... other fields
}

scenario.blue_units_initial[*] = {
    unit_uid: 'B-BATTERY',
    readiness: 'ready',        // NEW in Phase 6B
    supply: 0.8,               // NEW in Phase 6B
    // ... other fields
}
```

### Step-Level Evidence (Computed from World State)

```javascript
worldState.derived.objective_evidence[*] = {
    objective_id: 'OBJ-X',
    evidence_type: 'combat_readiness_state',  // Majority of unit readiness
    value: 'limited',                          // Reflects authored readiness
    source: 'ws.units[].readiness',
    confidence: 0.8,
    step_index: 0                              // Per-step evidence
}

worldState.derived.objective_evidence[*] = {
    objective_id: 'OBJ-X',
    evidence_type: 'supply_sustainability',    // Average of unit supply
    value: 0.7,                                // Reflects authored supply
    source: 'ws.units[].supply',
    confidence: 0.7,
    step_index: 0
}
```

### Decision-Level Modification (In-World-State Only)

```javascript
scenario.decisions[stepIndex][*] = {
    type: 'READINESS_DELTA',
    actor_uid: 'SA300-01',
    value: 'ready',            // New readiness value
    // Does NOT persist to scenario.red_units[] — local to world-state only
}

scenario.decisions[stepIndex][*] = {
    type: 'SUPPLY_DELTA',
    actor_uid: 'SA300-01',
    value: -0.2,              // Adjust by -0.2 (clamped to [0,1])
    // Does NOT persist to scenario.red_units[] — local to world-state only
}
```

---

## Final Audit Checklist

| Question | Answer | Evidence |
|----------|--------|----------|
| 1. Where is readiness consumed? | Evidence ledger + Why-Not | world-state.js, action-feasibility.js ✅ |
| 2. Where is supply consumed? | Evidence ledger + Why-Not | world-state.js, action-feasibility.js ✅ |
| 3. Which UI panels expose readiness/supply? | Objective-evidence-panel + Why-Not + Edit Mode | Code inspection ✅ |
| 4. Does live workspace show unit readiness/supply? | **No** (gap identified) | "Involved Units" table read-only, no readiness/supply ❌ |
| 5. Does map/HUD show degraded readiness or low supply? | **No** (gap identified) | No markers, badges, or HUD indicators ❌ |
| 6. Does Why-Not explain readiness/supply clearly? | Partially; could be clearer | Messages are technical; suggest 6C-C improvement 🟡 |
| 7. Does export preserve readiness/supply? | **Yes** ✅ | JSON.stringify works; round-trip tested ✅ |
| 8. Architecture: unit/step/decision level? | Unit-authored, step-evidence, decision-modifiable | Layered correctly ✅ |
| 9. What's the smallest useful next slice? | 6C-A: Live workspace display | Addresses operator visibility gap ✅ |
| 10. What should be deferred? | Consumption, degradation, logistics, AI | Documented as hard boundaries ✅ |

---

**Audit Status:** ✅ **COMPLETE**  
**Recommendation:** Proceed to Phase 6C-A (Live Workspace Unit Readiness/Supply Display)  
**Risk Level:** Low  
**Confidence:** High (code-based audit, no speculation)
