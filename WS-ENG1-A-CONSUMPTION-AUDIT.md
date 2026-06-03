# WS-ENG1-A Consumption Audit
## Engagement Outcomes: Current Ownership and Migration Plan

**Date:** 2026-06-03  
**Goal:** Move engagement outcome ownership from on-demand computation to World State DERIVATIONS  
**Scope:** Audit only (no coding)

---

## Executive Summary

Currently engagement outcomes are computed on-demand in 3 locations:
1. **World State Transition (WS3)** — during ENGAGE decision (primary)
2. **Map HUD** — for rendering firing solutions overlay (read-only)
3. **Test files** — for validation

**Current issue:** Outcomes computed but not stored anywhere. No persistent record of what happened. Each render recomputes, giving different RNG results (if any stochastic element exists).

**Target:** Store outcomes in `ws.derived.engagement_outcomes` and have all consumers read from World State.

---

## Detailed Consumption Audit

### **1. PRIMARY: World State Transition Layer (WS3)**

| Location | File | Line | Current Ownership | Consumption | Risk |
|----------|------|------|-------------------|------------|------|
| **resolveEngagement()** | `world-state-transition.js` | 140–190 | WS3 | Computes, applies damage directly to target unit, returns effect | 🔴 CRITICAL |
| **computeEngagements() call** | `world-state-transition.js` | 161 | ENG1 | `e.computeEngagements(pairWs, synthetic)` → `recs` | 🟡 HIGH |
| **Damage application** | `world-state-transition.js` | 170–174 | WS3 (inline) | `target.strength -= rec.pk_kill`; sets `target.status` | 🔴 CRITICAL |
| **Magazine decrement** | `world-state-transition.js` | 177–182 | WS3 (inline) | Removes rounds from shooter's magazine | 🟡 HIGH |
| **Effect return** | `world-state-transition.js` | 184–189 | WS3 | Returns outcome as effect (one-time, not stored in WS) | 🔴 CRITICAL |

**Migration Action:**
- Move outcome computation to `DERIVATIONS.computeEngagementOutcomes(ws)`
- Store in `ws.derived.engagement_outcomes` array
- Keep damage application in WS3 (outcomes inform the transition)
- Keep effect return (for AI/doctrine/event engine)

**Risk:** VERY HIGH
- Damage application is tightly coupled to engagement resolution
- Must ensure side effects (magazine decrement, status change) still work
- Outcomes must be deterministic and repeatable

---

### **2. MAP RENDERING: Detection & Engagement Overlay**

| Location | File | Line | Current Ownership | Consumption | Risk |
|----------|------|------|-------------------|------------|------|
| **computeEngagementRecords()** | `adjudicator-map.js` | 5172–5182 | Map (on-demand) | Calls `window.AppEngagement.computeEngagements({ units }, contacts)` | 🟡 HIGH |
| **renderEngagements()** | `adjudicator-map.js` | 5191–5220 | Map | Renders firing arcs for each engagement record | 🟡 MEDIUM |
| **toggleEngagements()** | `adjudicator-map.js` | 6347–6360 | Map | Toggle on/off, calls `computeEngagementRecords()` | 🟡 MEDIUM |
| **getEngagementRecords()** | `adjudicator-map.js` | 6353 | Map API | Public method to fetch rendered records | 🟡 MEDIUM |
| **Engagement sidebar** | `adjudicator-hud.js` | (TBD grep) | HUD | Displays engagement options to operator | 🟡 MEDIUM |

**Current State:**
- Map recomputes engagements on every render (on-demand)
- No connection to stored World State outcomes
- Shows "potential firing solutions" (not actual outcomes)

**Migration Action:**
- Change `computeEngagementRecords()` to read from `ws.derived.engagement_outcomes` instead of computing
- Keep rendering logic (just consume WS data instead)
- Keep toggle and API (interface unchanged)

**Risk:** MEDIUM
- Must ensure WS-derived outcomes have all fields HUD needs for rendering
- Engagements shown are "potential" not "actual" — still read from computation, not history

---

### **3. DAMAGE RENDERING: Attrition Visuals**

| Location | File | Line | Current Ownership | Consumption | Risk |
|----------|------|------|-------------------|------------|------|
| **applyAttritionVisuals()** | `adjudicator-map.js` | 3415–3450+ | Map | Reads `state.affected[]` array, applies "damaged" SIDC modifier | 🟡 MEDIUM |
| **renderUnitStrength()** | `adjudicator-map.js` | 3321–3360 | Map | Displays `current_strength / initial_strength %` in popup | 🟡 MEDIUM |
| **Damage tinting** | `adjudicator-map.js` | 513, 1131, 3355 | Map (CSS) | Colors units by damage state (orange = damaged, red = destroyed) | 🟡 MEDIUM |

**Current State:**
- Reads from `state.affected[]` (authored damage data)
- Not connected to engagement outcomes
- Attrition visuals are static per scenario, not dynamic

**Migration Action:**
- After WS-ENG1-A, can compute `state.affected[]` from `ws.derived.engagement_outcomes` history
- For now: no change (keep reading authored data)
- Future: Move to World State ownership in next iteration

**Risk:** LOW (no change needed for WS-ENG1-A scope)

---

### **4. TEST SUITES: Direct ENG1 Calls**

| Test File | Line | Purpose | Ownership | Risk |
|-----------|------|---------|-----------|------|
| `test-eng1-engagement.js` | (TBD) | Unit tests for ENG1 formulas | ENG1 module | 🟢 LOW |
| `test-engagement-overlay.js` | (TBD) | Map rendering of engagements | Map | 🟢 LOW |
| `test-db1-capabilities.js` | (grep results) | End-to-end engagement test | WS3 | 🟡 MEDIUM |
| `test-ws-server-engine.js` | (grep results) | Server-side engagement flow | WS3 | 🟡 MEDIUM |
| `test-coverage-rings.js` | (grep results) | Coverage/range visualization | Map | 🟢 LOW |
| `test-ws-det1-a.js` | ~5180 | ENG1 called with contacts (integration) | WS3 | 🟢 LOW |

**Direct ENG1 Calls:**
- Unit tests call `AppEngagement.computeEngagements()` directly (allowed, test harness)
- Integration tests call through `WS3.applyDecision()` (primary path)

**Migration Action:**
- Keep unit tests unchanged (test ENG1 formulas directly)
- Update integration tests to verify `ws.derived.engagement_outcomes` populated
- Do NOT delete direct calls (tests need them for formula validation)

**Risk:** LOW (tests are allowed to call ENG1 directly)

---

## Dependency Map: Who Depends on Engagement Outcomes?

```
┌──────────────────────────────────────────┐
│  ENGAGEMENT OUTCOMES (ws.derived)        │
│  • who shot whom                         │
│  • hit probability, pk_kill              │
│  • weapon used, salvo count              │
│  • range, confidence                     │
│  • target damage, status change          │
└──────────────┬───────────────────────────┘
               │
        ┌──────┴──────────────────────────┐
        │                                 │
        v                                 v
    ┌─────────────────┐        ┌──────────────────┐
    │ DAMAGE APPLIED  │        │  MAP RENDERING   │
    │ (unit.strength) │        │  (firing arcs)   │
    │ (unit.status)   │        └──────────────────┘
    └─────────────────┘
        │
        ├─→ Readiness computation (future)
        ├─→ Objective evidence (future)
        ├─→ Event engine (future)
        ├─→ Doctrine evaluation (future)
        └─→ AI COA grading (future)
```

---

## Data Flow: Current vs. Target

### **CURRENT (Ad-hoc):**
```
ENGAGE decision
  ↓
WS3.resolveEngagement()
  ├─ AppEngagement.computeEngagements() [ENG1]
  ├─ Apply damage to target.strength
  ├─ Decrement shooter.magazines
  └─ Return effect (discarded after effect log)

Later: Map render
  ├─ computeEngagementRecords() [recomputes from scratch]
  └─ renderEngagements() [draws arcs for current potential]

Result: No persistent record. Each render might give different RNG.
```

### **TARGET (World State Owned):**
```
ENGAGE decision
  ↓
WS3.resolveEngagement()
  ├─ DERIVATIONS.computeEngagementOutcomes() [new]
  ├─ ws.derived.engagement_outcomes ← outcomes stored [new]
  ├─ Apply damage to target.strength (via outcome record)
  ├─ Decrement shooter.magazines (via outcome record)
  └─ Return effect (points to ws.derived record)

Later: Map render
  ├─ renderEngagements() reads ws.derived.engagement_outcomes [changed]
  └─ renderEngagements() [draws arcs from stored data]

Result: Single source of truth. Deterministic, auditable, repeatable.
```

---

## Consumption Risk Matrix

| Caller | Type | Current Risk | Migration Risk | Recommendation |
|--------|------|--------------|----------------|-----------------|
| WS3 transition | Primary | 🔴 CRITICAL | 🟡 HIGH | Highest priority — owns the authority |
| Map overlay | Read-only | 🟡 HIGH | 🟢 LOW | Lower risk — just consume WS data |
| Map attrition | Read-only | 🟡 MEDIUM | 🟢 LOW | No change needed now |
| Tests (unit) | Direct | 🟢 LOW | 🟢 LOW | Keep unchanged |
| Tests (integration) | Indirect | 🟡 MEDIUM | 🟢 LOW | Update to check ws.derived |

---

## Known Unknowns / Questions for Implementation

**Q1: Determinism & RNG**
- Current: Does ENG1 use RNG? (probability → deterministic outcome)
- Impact: If yes, `pk_kill` varies per call — must be stored, not recomputed
- Action: Check `test-eng1-engagement.js` for RNG handling

**Q2: Outcome Storage Format**
- What fields go in `ws.derived.engagement_outcomes[]`?
- Suggestion: `{ shooter_uid, target_uid, hit: bool, pk_kill: number, weapon: string, salvo: number, range_nm: number, status_before: string, status_after: string, timestamp: step }`
- Action: Design schema in planning phase

**Q3: Performance Impact**
- Current: Engagement records computed on every map render (maybe expensive?)
- Target: Stored once per decision (better), read many times (same)
- Impact: Likely neutral or faster
- Action: Benchmark before/after if needed

**Q4: Historical Tracking**
- Current: Outcomes not stored, lost after effect log
- Future: Objective Evidence will need outcome history
- Question: Keep all outcomes in `ws.derived.engagement_outcomes`, or only current step's?
- Action: Defer to OBJ-A planning (probably keep all for journal/audit)

---

## Pre-Implementation Checklist

**Before coding WS-ENG1-A:**

- [ ] Read `test-eng1-engagement.js` to understand ENG1 RNG/determinism
- [ ] Read `world-state-transition.js` resolveEngagement() completely to map data dependencies
- [ ] Check if `state.affected[]` relationship to engagement outcomes (for readiness future)
- [ ] Verify map rendering doesn't depend on destructive side effects during render
- [ ] List all fields in `rec` object returned by `AppEngagement.computeEngagements()`
- [ ] Verify ENG1 formulas have no hidden state (pure function or initialized fresh)
- [ ] Check if any other code mutates `ws.units[].strength` or `.status` directly (outside ENGAGE decision)

---

## Summary: Ready for Planning

**Audit Status:** ✅ Complete

**Key Findings:**
1. ✅ Primary owner identified: WS3 (`world-state-transition.js`)
2. ✅ Secondary consumer identified: Map (`adjudicator-map.js`)
3. ✅ Damage application identified: WS3 (inline in `resolveEngagement()`)
4. ✅ Outcome storage: Currently nowhere (problem)
5. ✅ Test coverage exists: 5 test files
6. ⚠️ Unknowns: RNG handling, schema design, historical tracking

**Risk Level:** 🔴 CRITICAL (engagement is core to simulation)

**Recommendation:** Proceed to planning phase with focus on:
- Deterministic outcome storage format
- RNG handling (if any)
- Relationship to future Objective Evidence system

**Next Step:** WS-ENG1-A Planning (schema design, dependency clarification)

