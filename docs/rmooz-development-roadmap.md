# RMOOZ Development Roadmap

**Updated:** 2026-06-04  
**Status:** Active planning  
**Scope:** 7-function operational planning platform

---

## Complete Capability Set Required

RMOOZ must support all 7 operational planning functions for realistic scenario authoring and execution:

1. **Force Composition** — Unit types, loadouts, base capacity, fuel/munitions
2. **Air Defense Modeling** — SAM coverage, radar arcs, AAA rings, integrated defense
3. **Strike Planning** — Target selection, route planning, tanker support, timing
4. **Readiness/Supply** — Constraints on aircraft availability, fuel, munitions, base capacity
5. **Doctrine & ROE** — Collateral damage constraints, rules of engagement, unit behavior
6. **Decision Support** — Victory conditions, risk assessment, trade-off scoring
7. **Phased Operations** — Multi-wave strikes, consolidation, re-tasking, force degradation

---

## Current Status (as of 2026-06-04)

### Completed ✅
- **World State Engine** (WS1, WS3, DB1, DET1, ENG1) — Core simulation foundation
- **Movement System** (MOVE1) — Unit positioning, route planning groundwork
- **Command Launch** (Home hub, scenario loading, workspace)
- **Edit Mode Slice 1** (Metadata, Sides, Postures authoring)
- **Coastal Shield Training Scenario** (4-objective, 4-step test fixture)

### Partially Complete 🟡
- **Scenario Schema** — Supports sides, objectives, units, steps; needs force composition detail
- **Map/Leaflet Integration** — Renders map, objectives; needs unit placement/visualization
- **Step Navigation** — 4-phase timeline works; needs decision-point scripting

### Not Yet Built 🔴
1. **Force Composition Editor** (Edit Mode Slice 2a)
2. **Air Defense Modeling** (Edit Mode Slice 2b + Engine)
3. **Strike Planning UI** (Edit Mode Slice 2c + Engine)
4. **Readiness/Supply System** (Engine + UI)
5. **Doctrine & ROE System** (Engine + UI)
6. **Decision Support** (Scoring, victory conditions, risk assessment)
7. **Phased Operations Controller** (Multi-wave management, re-tasking)

---

## Development Phases

### Phase 4: Edit Mode Slice 2 — Geography & Forces (Current Priority)

**Goal:** Enable full force composition and objective authoring

**Components:**
- 4a. **Objective Placement Editor** — Place/edit 4 power stations (coordinates, defenses, constraints)
- 4b. **Unit Composition Editor** — Define 8 BLUE + 6 RED unit types (aircraft, SAMs, AAA, radars)
- 4c. **Base/Basing Editor** — Configure 2 BLUE + 6 RED air bases (ramp capacity, fuel storage, runway length)
- 4d. **Unit Placement Visualization** — Render units on map (symbols, groupings, base assignments)

**Deliverable:** Coastal Shield scenario fully editable in UI; all sides, objectives, units visible on map

**Estimated effort:** 4–6 weeks

---

### Phase 5: Air Defense Modeling System (High Priority)

**Goal:** Realistic SAM/AAA modeling for strike planning

**Components:**
- 5a. **SAM System Editor** — Define SAM types (range, coverage area, effectiveness bands)
- 5b. **SAM Coverage Visualization** — Render SAM coverage arcs on map (radar range, engagement zones)
- 5c. **AAA Ring Modeling** — Fixed AAA sites around objectives (density, engagement rules)
- 5d. **Integrated Defense Calculation** — Compute defense effectiveness (overlapping coverage, degradation over time)
- 5e. **Air Defense Engagement Logic** — SAM/AAA fire simulation (hit probability, attrition)

**Deliverable:** Air defense network fully modeled; strike planners can assess approach routes and defense suppression needs

**Estimated effort:** 6–8 weeks

---

### Phase 6: Readiness/Supply System (High Priority)

**Goal:** Realistic force constraints (fuel, munitions, base capacity)

**Components:**
- 6a. **Fuel System** — Tanker support, aircraft range, refuel windows, fuel consumption modeling
- 6b. **Munitions System** — Loadout tracking, munitions availability, resupply constraints
- 6c. **Base Capacity** — Ramp space, runway capacity, maintenance queues, aircraft availability
- 6d. **Force Degradation** — Track losses, wounded aircraft, sortie availability over campaign phases
- 6e. **Constraint Visualization** — Show fuel/munitions/ramp limitations in strike planning UI

**Deliverable:** Realistic force limitations; planners must account for logistics, not just unit count

**Estimated effort:** 4–6 weeks

---

### Phase 7: Strike Planning Engine (Medium Priority)

**Goal:** Support realistic strike package composition and execution

**Components:**
- 7a. **Target Selection** — UI for choosing objectives, difficulty assessment, defense analysis
- 7b. **Force Allocation** — Assign aircraft types to targets (air superiority, strike, EW, CSAR)
- 7c. **Route Planning** — Route optimization considering SAM coverage, tanker orbits, terrain
- 7d. **Timing & Coordination** — Multi-wave timing, refuel windows, engagement sequencing
- 7e. **Sortie Management** — Track launched aircraft, fuel state, weapons state, damage assessment

**Deliverable:** Realistic strike planning workflow (target → allocate → route → execute → assess)

**Estimated effort:** 6–8 weeks

---

### Phase 8: Doctrine & ROE System (Medium Priority)

**Goal:** Rules-based unit behavior and constraint enforcement

**Components:**
- 8a. **ROE Editor** — Define rules of engagement (collateral damage threshold, target priorities, escalation rules)
- 8b. **Doctrine Templates** — Pre-built doctrine sets (defensive, offensive, mixed, constrained)
- 8c. **Unit Behavior Scripting** — Define unit responses (CAP patterns, intercept behavior, SAM tactics)
- 8d. **Constraint Enforcement** — Auto-flag violations (collateral damage, friendly fire, ROE breach)
- 8e. **Behavior Visualization** — Show unit movement patterns, CAP orbits, SAM activation

**Deliverable:** Units behave realistically per doctrine; players must respect ROE constraints

**Estimated effort:** 4–6 weeks

---

### Phase 9: Decision Support System (Medium Priority)

**Goal:** Scoring, victory conditions, risk assessment

**Components:**
- 9a. **Victory Condition Engine** — Evaluate objective damage, force losses, casualties, mission success
- 9b. **Scoring System** — Point allocation (facility damage, aircraft losses, collateral damage penalties)
- 9c. **Risk Assessment** — Calculate probability of success, estimated casualties, force attrition
- 9d. **Decision Analytics** — Show trade-offs (fast strike high-risk vs. slow strike low-risk, etc.)
- 9e. **After-Action Analysis** — Post-mission summary, performance metrics, lessons learned

**Deliverable:** Players can assess feasibility before committing; clear feedback on decisions made

**Estimated effort:** 4–6 weeks

---

### Phase 10: Phased Operations Controller (Lower Priority)

**Goal:** Multi-wave, multi-phase campaign execution

**Components:**
- 10a. **Wave Management** — Define first/second/third wave compositions and timing
- 10b. **Consolidation Phase** — Assess damage, reassess forces, plan follow-on waves
- 10c. **Re-tasking UI** — Shift targets mid-campaign, reallocate forces, adjust doctrine
- 10d. **Force Regeneration** — Recover damaged aircraft, rearm, refresh tankers between waves
- 10e. **Campaign Tracking** — Multi-phase timeline, decision history, cumulative metrics

**Deliverable:** Realistic multi-day/multi-wave campaigns; dynamic player decision-making

**Estimated effort:** 6–8 weeks

---

## Dependency Graph

```
Phase 4 (Edit Mode Slice 2: Geography & Forces)
    ↓
Phase 5 (Air Defense Modeling)
    ↓
Phase 6 (Readiness/Supply)
    ↓
Phase 7 (Strike Planning)
    ↓
Phase 8 (Doctrine & ROE) — can run parallel with Phase 9
    ↓
Phase 9 (Decision Support)
    ↓
Phase 10 (Phased Operations)
```

**Critical Path:** Phase 4 → Phase 5 → Phase 6 → Phase 7 → Phase 9 → Phase 10
**Parallel track:** Phase 8 (Doctrine & ROE) can develop alongside Phase 5–7

---

## Resource & Timeline Estimate

| Phase | Focus | Effort | Timeline | Cumulative |
|-------|-------|--------|----------|-----------|
| 4 | Edit Mode + Forces | 5 weeks | Weeks 1–5 | 5 weeks |
| 5 | Air Defense | 7 weeks | Weeks 6–12 | 12 weeks |
| 6 | Readiness/Supply | 5 weeks | Weeks 13–17 | 17 weeks |
| 7 | Strike Planning | 7 weeks | Weeks 18–24 | 24 weeks |
| 8 | Doctrine & ROE | 5 weeks | Weeks 6–25 (parallel) | 25 weeks |
| 9 | Decision Support | 5 weeks | Weeks 25–29 | 29 weeks |
| 10 | Phased Operations | 7 weeks | Weeks 30–36 | 36 weeks |

**Total Estimated Time:** ~9 months (36 weeks) for all 7 functions

**MVP (Minimum for realistic planning):** Phases 4–7 = ~6 months for core strike planning capability

---

## Key Success Metrics

By the end of each phase:

**Phase 4:** ✅ User can author objectives and units; map shows realistic force distribution
**Phase 5:** ✅ User can assess air defense; planning considers SAM suppression
**Phase 6:** ✅ User can plan realistic sorties; fuel/munitions limitations visible
**Phase 7:** ✅ User can plan multi-target strikes; route planning accounts for defenses
**Phase 8:** ✅ Units behave per doctrine; collateral damage constraints enforced
**Phase 9:** ✅ User can assess feasibility before executing; victory conditions clear
**Phase 10:** ✅ User can execute multi-phase campaigns; re-tasking and consolidation work

---

## Testing Strategy

### Unit-Level Testing
- Each phase includes scenario testing with Coastal Shield (and user-authored scenarios)
- Validate functions in isolation (e.g., SAM coverage calculation, fuel consumption model)

### Integration Testing
- End-to-end strike planning workflow (target → allocate → route → execute → assess)
- Multi-phase campaign simulation (first wave → consolidation → second wave)

### User Acceptance Testing
- Can users plan realistic strikes without hard-coding?
- Do constraints force realistic decision-making?
- Does feedback support learning?

---

## Coastal Shield Role in Development

Coastal Shield serves as the **continuous test fixture**:
- 4 objectives (power stations) at varying difficulty
- 80+ BLUE aircraft (8 unit types) for force composition testing
- 250+ RED air defense (6 unit types) for air defense modeling
- 4-phase timeline for phased operations testing
- Realistic constraints (tanker support, collateral damage) for readiness/ROE testing

**As each phase completes, Coastal Shield scenario gains new capabilities:**
- Phase 4: Full force visualization
- Phase 5: SAM coverage display
- Phase 6: Fuel/munitions planning
- Phase 7: Multi-target strike execution
- Phase 8: Unit behavior per doctrine
- Phase 9: Scoring and victory assessment
- Phase 10: Multi-wave campaign management

---

## Future Enhancements (Post-MVP)

Once all 7 functions are complete:
- Naval unit types (ships, submarines)
- Strategic lift operations
- Electronic warfare modeling
- Weather system (dynamic conditions)
- AI opponent (auto-generates counter-plans)
- Campaign recording/playback
- Multiplayer scenario execution

---

## Governance Notes

- **No embedded operational plans** — All scenarios user-authored, stored locally
- **Air-gapped deployment** — RMOOZ runs standalone, no external data import
- **CMO reference learning only** — Capabilities inspired by CMO, not reverse-engineered
- **User-authored content only** — Real operational scenarios created by users as needed, not baked into codebase

---

**Roadmap approved by:** User  
**Date:** 2026-06-04  
**Status:** Ready for Phase 4 kickoff
