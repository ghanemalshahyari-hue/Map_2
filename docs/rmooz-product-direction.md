# RMOOZ Product Direction

**Updated:** 2026-06-04  
**Status:** Active — Development ongoing  
**Scope:** Platform vision and guardrails

---

## Vision

RMOOZ is intended to become a **realistic CMO-style operational scenario authoring, planning, and wargaming platform** for offline/private use.

The platform will enable military planners, game designers, and scenario authors to:
- Design and test operational scenarios with realistic constraints
- Model strike and defense planning structures
- Support red-team / blue-team scenario design workflows
- Conduct force-level wargaming with map-based unit placement
- Apply doctrine, readiness, supply, and decision-support logic

**Important:** RMOOZ is a **tool for authoring and executing scenarios**, not a repository of operational plans. All scenarios are user-created and stored locally (air-gapped, no external data import). Real operational plans are authored in RMOOZ by users as needed; they are not embedded in the codebase.

---

## Capabilities to Support

RMOOZ should enable authoring and execution of scenarios that include:

### Core Scenario Elements
- ✅ Realistic map-based geography (bounded operating areas, terrain)
- ✅ Multiple sides (2+) with distinct doctrines and postures
- ✅ Strategic objectives (destroyable, defendable, valued differently by sides)
- ✅ Force composition (aircraft, units, SAM systems, etc. with realistic loadouts)
- ✅ Phased timeline (H+0:00 to H+X:XX operational flow)

### Operational Mechanics
- ✅ Air defense modeling (SAM sites, radar coverage, AAA rings)
- ✅ Strike planning (target selection, force allocation, tanker support)
- ✅ Support aircraft (tankers, early warning, electronic warfare)
- ✅ Readiness & supply constraints (fuel, munitions, base capacity)
- ✅ Doctrine & rules of engagement (collateral damage constraints, unit behavior)
- ✅ Decision-support (victory conditions, risk/feasibility trade-offs)

### Scenario Complexity Over Time
- ✅ Multi-phase operations (deployment → strike → consolidation → assessment)
- ✅ Player decision points (continue or abort, shift targets, reallocate forces)
- ✅ Dynamic force degradation (losses affect subsequent waves)
- ✅ Environmental factors (weather, time-of-day effects)
- ✅ CMO-style complexity (many units, distributed objectives, competing priorities)

---

## Important Distinctions

### What RMOOZ IS:

✅ **Realistic scenario modeling platform** — Designed to support military planning workflows and force-level wargaming with fidelity

✅ **Architecture-capable of CMO-style complexity** — Built to scale from simple training scenarios (like Coastal Shield) to full operational planning (like Iran Strike)

✅ **Reference-informed by external sources** — Uses published CMO scenario pack as reference for capability mapping and learning (read-only, non-proprietary analysis only)

✅ **Demo/training scenario capable** — Coastal Shield and similar are valid test data and learning tools for scenario authoring

✅ **Open architecture** — Supports any realistic scenario, not hard-coded to demo data

### What RMOOZ IS NOT:

🔴 **Hard-coded to one fictional demo scenario** — Coastal Shield is test data only; the platform must remain generic and flexible

🔴 **A source of real-world operational plans** — The app will not generate, embed, or export actionable military plans for real conflicts

🔴 **A CMO replacement or clone** — RMOOZ is an independent platform inspired by CMO's approach, not a copy or derivative work

🔴 **A binary .scen payload parser** — Will not reverse-engineer or execute CMO proprietary format; scenarios are authored in RMOOZ's own JSON schema

🔴 **A repository of proprietary CMO data** — External scenario pack work is reference/learning only; all RMOOZ data is native and user-created

🔴 **Operational mission planner for real conflicts** — Even for realistic scenarios, RMOOZ is for training, wargaming, and decision support—not live operational execution

---

## Guardrails

### On Scenario Authoring:
- ✅ Do support realistic operational scenarios (geographic, force composition, objectives)
- ✅ Do document scenarios clearly (situation, mission, forces, victory conditions)
- ✅ Do include safety/ROE mechanics (collateral damage constraints, rules of engagement)
- 🔴 Do NOT generate real-world targeting data or step-by-step execution plans for actual conflicts
- 🔴 Do NOT hard-code scenarios to real-world facilities, coordinates, or timings

### On External Data:
- ✅ Reference external scenario packs (CMO, other wargaming platforms) for **capability mapping and learning**
- ✅ Use external pack as proof-of-concept for scenario complexity and patterns
- 🔴 Do NOT copy proprietary scenario data without explicit legal review
- 🔴 Do NOT parse binary .scen payloads (too proprietary; author native JSON instead)
- 🔴 Do NOT re-distribute or embed external scenario content in RMOOZ

### On Architecture:
- ✅ Keep scenario schema flexible (support any realistic scenario, not just demos)
- ✅ Keep authoring UI generic (no special cases for specific scenarios)
- ✅ Document patterns learned from external sources in architecture docs
- 🔴 Do NOT create hard-coded UI paths for specific scenarios (e.g., "Iran Strike button")
- 🔴 Do NOT bake external scenario data into the codebase

---

## Current Status & Roadmap

### Completed (as of 2026-06-04):
- ✅ **Core RMOOZ engine** (World State 1, movement, detection, engagement)
- ✅ **Edit Mode Slice 1** (Metadata, Sides, Postures authoring)
- ✅ **Command Launch** (Home hub, scenario loading, workspace)
- ✅ **Coastal Shield training scenario** (Multi-side, defended objectives, 4-phase timeline) — **Test data for authoring pipeline**

### Next Build (Recommended Priority Order):
1. **Edit Mode Slice 2: Geography & Forces** (objective placement, unit authoring)
   - Enables realistic scenario design from scratch
   - Uses Coastal Shield as test harness (not as target scenario)
2. **Readiness/Supply System** (fuel, munitions, base capacity)
   - Critical for realistic force planning
3. **Decision Support** (victory conditions, scoring, risk assessment)
   - Completes player feedback loop

### Out of Scope / Lower Priority:
- ⏸️ CMO scenario pack importer (reference only, no binary parsing)
- ⏸️ Lua script support (CMO-specific; use native RMOOZ logic instead)
- ⏸️ Perfect CMO fidelity (RMOOZ is independent; similar but not identical)

---

## Important Note on Coastal Shield

**Coastal Shield is a successful pipeline test, not a target product.**

✅ Coastal Shield demonstrates:
- Multi-side scenario structure
- Defended objective modeling
- Phased timeline with decision points
- Readiness & supply constraints

🔴 Coastal Shield is NOT:
- A target demo scenario for RMOOZ
- Meant to be the only training scenario
- An example of hard-coded behavior
- A model for scenario naming or structure

**Use of Coastal Shield:**
- ✅ Test fixture for Edit Mode development
- ✅ Learning material for scenario authoring patterns
- ✅ Proof-of-concept for multi-side conflict
- 🔴 NOT a target scenario for marketing or release

The main RMOOZ roadmap remains **realistic operational planning capability** — generic authoring UI, flexible scenario schema, support for CMO-style complexity. Coastal Shield is one possible scenario type; the platform must remain equally capable of other realistic scenarios (naval, strategic lift, peacekeeping, etc.).

---

## Governance

### Design Reviews:
- All scenario designs reviewed for:
  - Real-world operational feasibility (avoid fantasy)
  - Collateral damage constraints (safety guardrails)
  - Generic pattern matching (avoid one-off hard-coding)
  - External reference clarity (cite sources, note proprietary boundaries)

### External Scenario Pack Use:
- ✅ **Permitted:** Read-only inspection for capability learning, metadata extraction, pattern discovery
- ✅ **Permitted:** Reference in docs/comments for "inspired by" comparisons
- ✅ **Permitted:** Building independent RMOOZ scenarios informed by external understanding
- 🔴 **Prohibited:** Binary payload parsing, proprietary format reverse-engineering
- 🔴 **Prohibited:** Copying scenario content (objectives, forces, timings) without explicit approval
- 🔴 **Prohibited:** Embedding external data in RMOOZ codebase or distribution

### Code Review Checklist:
- [ ] Scenario schema remains generic (not scenario-specific)
- [ ] No hard-coded demo scenario paths or special cases
- [ ] Real-world data (if any) properly sourced and cited
- [ ] Collateral damage / ROE constraints present
- [ ] External references are read-only, not embedded data

---

## Success Criteria

RMOOZ is on track if:
1. ✅ Edit Mode can author any realistic scenario (not just Coastal Shield)
2. ✅ No hard-coded scenario paths or behaviors in UI
3. ✅ Scenario schema is flexible and extensible
4. ✅ External references are documented and bounded
5. ✅ Real-world data is clearly sourced and safety-gated
6. ✅ Platform is usable for wargaming and training (not operational execution)

---

## Questions / Contact

For guidance on:
- **Scenario design approach:** See docs/cmo-functional-rules/ and scenario authoring patterns
- **External data use:** Consult architecture docs and external reference guardrails above
- **Roadmap alignment:** Check APP_INVENTORY.md and Edit Mode Slice planning

---

**Version:** 1.0  
**Last Updated:** 2026-06-04  
**Status:** Active  
**Audience:** Developers, scenario authors, product stakeholders
