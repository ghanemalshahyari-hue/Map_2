# Phase 6A Audit: Readiness & Supply in RMOOZ Scenario Data, World-State Logic, and Authoring UI

**Date:** 2026-06-04  
**Scope:** Audit only — no code implementation. Purpose: baseline readiness and supply representation before Edit Mode Slice 2 adds Geography & Forces editing.

**Key Finding:** RMOOZ has a **working readiness/supply foundation** (READINESS-A evidence ledger + Why-Not constraints) but **zero Edit Mode authoring** for these fields. All values are sourced from DB-Lite defaults or scenario JSON; operators cannot edit them on the map.

---

## 1. Readiness: Current Representation

### A. Enum and Definition
**Location:** `world-state.js` line 665–674 (evidence collection)

```javascript
var rdiness = runit.readiness || 'ready';
if (rdiness === 'ready') readyCount++;
else if (rdiness === 'limited') limitedCount++;
else if (rdiness === 'not_ready') notReadyCount++;
// Majority state becomes evidence_type: 'combat_readiness_state'
```

**Enum Values:**
- `'ready'` — unit can execute full tasking
- `'limited'` — unit can act but with constraints (risk in engagement)
- `'not_ready'` — unit cannot act (blocker in why-not analysis)

**Majority-Vote Rule:** Combat readiness state = majority readiness of Blue units. If 50 Blue units are 'ready' and 25 are 'limited', the force state is 'ready'.

### B. Data Sources (Precedence)
1. **Authored in scenario JSON:** `red_units[*].readiness`, `blue_units[*].readiness`
2. **DB-Lite default:** From `CAPABILITY_CATALOG[role].readiness` (currently all default to `'ready'`)
3. **Fallback:** `'ready'` (hardcoded in evidence computation)

**Current Authored Usage in Scenarios:**
- wargame3.json: **No units have readiness field** (all inherit DB-Lite 'ready')
- coastal-shield-training-v1.json: Does not exist yet
- dp-test-*.json: No readiness fields

### C. Evidence Ledger Integration
**Location:** `world-state.js` line 675–682

| Evidence Type | Value | Source | Confidence | Purpose |
|---------------|-------|--------|-----------|---------|
| `combat_readiness_state` | 'ready' \| 'limited' \| 'not_ready' | `ws.units[].readiness` (majority) | 0.8 | Readable in OBJ-C evidence panel; fed to operator Why-Not |

**Evidence is display-only.** Not yet consumed to modify objective status (OBJ-D pending approval per `OBJ-C-COMPLETION-2026-06-03.md`).

### D. Action-Feasibility (Why-Not) Integration
**Location:** `action-feasibility.js` line 173–189

| Constraint | Trigger | Effect |
|-----------|---------|--------|
| `readiness_unavailable` | `unit.readiness === 'not_ready'` | **BLOCKS** action (cannot fire, move, etc.) |
| `readiness_degraded` | `unit.readiness === 'limited'` | **RISK** (action is feasible but sub-optimal) |

**Remediation Options Offered to Operator:**
- `restore_readiness`: "Restore unit readiness" (read-only; no simulation of how/when)
- `resupply`: Listed as a capability requirement; implementation deferred

---

## 2. Supply: Current Representation

### A. Data Type and Scale
**Location:** `world-state.js` line 105–106, 626–658

```javascript
supply: num(u.supply),  // numeric field, 0–1 scale (percent)
```

**Meaning:** 0.0 = depleted (no fuel, ammo, or food), 1.0 = fully supplied. **No semantic distinction** between fuel, ammo, or food (all pooled as "supply").

**Current Thresholds:**
- Neutral point: **0.5** (used in action-feasibility risk calculation)
- No hard zero/max limits enforced; clamped to [0, 1] when modified by decisions

### B. Data Sources (Precedence)
1. **Authored in scenario JSON:** `units[*].supply` (numeric 0–1)
2. **DB-Lite default:** From `CAPABILITY_CATALOG[role].supply` (range 0.7–0.95 by role)
3. **Fallback:** Computed from decisions (if not authored or enriched)

**Current Authored Usage:**
- wargame3.json: **No units have supply field**
- coastal-shield-training-v1.json: Does not exist
- Air Defense units (6 platforms): DB-Lite defaults (0.7–0.95)

### C. Evidence Ledger Integration
**Location:** `world-state.js` line 626–658

| Evidence Type | Computation | Source | Confidence |
|---------------|------------|--------|-----------|
| `supply_sustainability` | Average of all unit `supply` values, thresholded vs 0.5 | `ws.units[].supply` | 0.85–0.9 |

**Output Format:**
- `value: <0–1 numeric>` (average across units)
- Rendered in evidence panel as "Supply" under readiness group
- Not yet consumed for status logic

### D. Decision Modification
**Location:** `world-state.js` line 948–951

```javascript
u.readiness = d.value;                        // Set readiness directly
var base = num(u.supply) != null ? u.supply : 1;
u.supply = Math.max(0, Math.min(1, base + d.value));  // Increment/decrement
```

Decisions (operator commits on map) can:
- **Set readiness** to 'ready', 'limited', or 'not_ready'
- **Increment supply** (e.g., `+0.2` for resupply) or **decrement** (e.g., `-0.15` for combat loss)

**Clamped to [0, 1]; applied immediately** (no staging, no journal versioning).

---

## 3. Scenario Schema Support

### A. Current Schema Definition
**Location:** `UI_MOdified/client/shell/scenario-authoring-schema.js` — **No readiness or supply fields defined**

**Validation Coverage:**
- Unit labels, coordinates, bls, echelon, role, domain, sidc: ✅ Defined
- Readiness, supply: ❌ Not in schema (pass-through only)

**Implication:** Authoring tools cannot validate readiness/supply in EDIT_MODE; values are accepted but not verified for type/range.

### B. DB-Lite Catalog (Defaults)
**Location:** `world-state-db.js` line 63–93

All 11 platform variants have defaults:

```javascript
sam_s300: {
    readiness: 'ready',
    supply: 0.9,  // 90% supplied
    ...
}
```

**New Air-Defense Variants (Phase 5D-1):** samS300, sam_s75, aaa_zsu, aaa_23mm, radar_p37 all have defaults.

**Example:** A Coastal Shield S-300 inherits `readiness: 'ready', supply: 0.9` unless explicitly overridden in JSON.

---

## 4. Edit Mode Support (Authoring UI)

### A. Current Edit Mode Readiness
**Slice 1 (Metadata/Sides/Posture) — COMPLETE per project_authoring_slice2_next:**
- Unit metadata editing: uid, label, role, echelon, domain, bls ✅
- Readiness/supply editing: ❌ Not present

**Slice 2 (Geography & Forces) — IN DESIGN:**
- Objective/BLS placement ✅ (next)
- Unit positioning/movement ✅ (next)
- Unit readiness/supply: ❓ Not yet scoped

### B. Why-Not Panel Integration (Decision Support)
**Location:** `action-feasibility.js` line 254–264

When operator tries to commit an action (e.g., "Fire at target X"), the panel shows:
- **Blocker:** "Readiness unavailable — restore_readiness"
- **Risk:** "Supply limited — resupply"

**Current State:**
- Read-only options (no UI to execute resupply)
- Message text references "Resupply availability and timing are not simulated"
- Linked capability: `readiness` (exists), `supply` (declared but no simulation)

---

## 5. Coastal Shield Training Scenario State

### A. Current Unit Readiness/Supply
**File:** `UI_MOdified/data/scenarios/coastal-shield-training-v1.json` (or wargame3 as baseline)

**6 Air-Defense Units (Phase 5B-C):**

| UID | Role | readiness | supply |
|-----|------|-----------|--------|
| SA300-01 | S-300 SAM | (DB-Lite) 'ready' | (DB-Lite) 0.9 |
| SA300-02 | S-300 SAM | 'ready' | 0.9 |
| SA75-01 | S-75 SAM | 'ready' | 0.8 |
| ZSU-01 | ZSU-23-4 | 'ready' | 0.7 |
| AAA23-01 | 23mm AAA | 'ready' | 0.7 |
| P37-01 | P-37 Radar | 'ready' | 0.95 |

**All units:** No explicit readiness or supply authored. All inherit DB-Lite defaults (scenario editor did not include these fields).

### B. Implications for Scenario Narrative
**Training Goal:** Demonstrate air-defense coverage + detection/engagement mechanics.

**Readiness/Supply Gap:** 
- Operators cannot set initial posture (e.g., "S-300 is fuel-depleted, cannot leave base")
- Cannot model logistics constraints (e.g., "Resupply convoy delayed, readiness drops to 'limited' at hour 6")
- Cannot explain outcomes via readiness state (always 'ready' → Why-Not never blocks for readiness)

---

## 6. Decision-Support Usage (Why-Not Panel)

### A. Current Constraints (in action-feasibility.js)

**Readiness Constraints:**
- `readiness_unavailable` (blocker) — only when `unit.readiness === 'not_ready'`
  - Message: "Actor readiness is not_ready — the unit cannot act."
  - Inverse option: "Restore unit readiness"
- `readiness_degraded` (risk) — when `unit.readiness === 'limited'`
  - Message: "Unit readiness is limited (not ideal)."

**Supply Constraints:**
- `supply_limited` (risk) — when `unit.supply < 0.5`
  - Message: "Supply is below the readiness layer's neutral level."
  - Inverse option: "Resupply before committing"

### B. User Workflow
1. Operator selects unit (e.g., ZSU-23-4)
2. Operator commits action (e.g., "Move to position X")
3. Why-Not panel evaluates constraints:
   - If `readiness === 'not_ready'` → **BLOCKED** (red badge)
   - If `readiness === 'limited'` → **RISK** (yellow badge)
   - If `supply < 0.5` → **RISK** (yellow badge)
4. If blocked: operator sees "Restore readiness" as remediation (non-actionable, documentation only)

### C. Remediation Gap
- Current: "Restore readiness" is an **option label** but has no simulation/state change
- Operator can make a decision (commit a decision record to journal), but:
  - Decision sets `readiness: 'ready'` immediately
  - No realistic recovery time, logistics cost, or consequence modeling
  - Not suitable for multi-hour scenarios where readiness takes time to recover

---

## 7. Key Gaps & Recommendations

### Gap 1: No Readiness/Supply Authoring in Edit Mode
**Issue:** Operators cannot set initial readiness or supply on units in Slice 1/2 authoring.

**Impact:** 
- All scenarios assume units are 'ready' with 0.7–0.95 supply at start
- Realistic scenarios with force imbalance (depleted reserves, tired units) cannot be built

**Recommendation for Slice 2:** Add two fields to Edit Mode:
- Unit Readiness Selector: dropdown ('ready', 'limited', 'not_ready') — persist to JSON
- Supply Slider: 0–100% range — persist to JSON
- Add schema validation: readiness must be enum, supply must be [0, 1]

### Gap 2: No Base-Level (Side-Wide) Readiness/Supply Modeling
**Issue:** RMOOZ tracks **unit-level** readiness/supply only. No Blue Side logistics posture, fuel reserve, or force-wide sustainment state.

**Current Behavior:**
- Evidence: combat_readiness_state = majority of unit states
- Decision support: constraints per unit
- No "Blue loses supply depot at hour 12 → all units drop to 'limited'" scenario

**Recommendation:** (Post-Slice 2) Design side-level supply:
- Base-level supply pool (e.g., "Central Blue Supply Hub: 150 units, 2,000 liters fuel")
- BLS (Battlefield Logistics Site) readiness/capacity
- Consumption rules (units draw from pool; when pool drops below threshold, all units degrade)

### Gap 3: No Consumption Logic (Supply Depletion via Engagement)
**Issue:** Supply is static after authoring. Decisions can increment/decrement, but no automatic depletion.

**Current:** Unit fires 100 rounds, supply stays 0.9 (unless operator decides to decrement).

**Desired (future):** 
- Ammo sustainability evidence shows "3 hours of CAS operations remaining"
- Supply auto-decrements based on: rounds fired + distance traveled + casualties

**Recommendation:** (Locked for now per project scope) Defer to personnel/maintenance/reliability phase. For now, document decision-point: "When firing engagement at hour 2, operator should manually reduce supply to reflect ammunition consumption."

### Gap 4: No Fuel/Ammo/Food Distinction
**Issue:** All three are pooled as single `supply` decimal. Cannot model "enough fuel but no ammunition" scenario.

**Impact:** Training scenarios cannot show logistics branching (e.g., "SEAD mission fails due to ammo shortage but fuel is OK").

**Recommendation:** (Locked for now) Defer to Phase 6B (Future Personnel/Supply). For Slice 2, note in schema documentation: "supply field represents combined logistics; refinement to fuel/ammo/food will occur in future DB-Lite versions."

---

## 8. Smallest Next Implementation Slice

### Slice 2 Scope (Geography & Forces — already approved):
**Current Plan:** Objective/BLS placement + unit positioning + existing unit movement.

**Smallest next-slice addition (Readiness/Supply Authoring):**

**Title:** Edit Mode Slice 2A — Unit Readiness & Supply Fields

**Scope (5–8 hours):**
1. Add two fields to scenario-authoring-schema.js validation:
   ```javascript
   readiness: { type: 'enum', values: ['ready', 'limited', 'not_ready'], default: 'ready' }
   supply: { type: 'number', min: 0, max: 1, default: 0.8 }
   ```

2. Wire schema into Edit Mode unit card (alongside role, domain, bls):
   - Readiness: 3-state radio or dropdown
   - Supply: 0–100% slider (displayed to user; stored as 0–1 in JSON)

3. Add tests: 2–3 test files
   - Authored readiness overrides DB-Lite default
   - Supply value round-trips through JSON
   - Evidence reflects authored values (not just DB-Lite)

4. Verification: Screenshot of Coastal Shield scenario with 2–3 units set to 'limited' + 50% supply, confirm evidence panel shows these values.

**NOT in Slice 2A:**
- Why-Not changes (already correct; just needs unit values to work with)
- Decision/recovery modeling (defer to Phase 6B)
- Base-level or BLS readiness (defer to Phase 6B+)

**Outcome:** Operators can author realistic initial postures; evidence ledger reflects them; Why-Not panel can now meaningfully block/risk actions.

---

## 9. Audit Checklist

| Item | Status | Notes |
|------|--------|-------|
| **Readiness Enum** | ✅ Complete | 'ready', 'limited', 'not_ready' + majority-vote evidence |
| **Supply Data Type** | ✅ Complete | 0–1 numeric; threshold 0.5 |
| **Evidence Ledger** | ✅ Complete | 6 evidence types in READINESS-A; display-only |
| **Why-Not Integration** | ✅ Complete | Blockers + risks; remediation options defined |
| **DB-Lite Defaults** | ✅ Complete | All 11 catalog entries have readiness + supply |
| **Schema Validation** | ❌ Gap | No schema for readiness/supply |
| **Edit Mode Authoring** | ❌ Gap | Not in Slice 1; not yet in Slice 2 scope |
| **Unit Initial Posture** | 🟡 Partial | Coded via JSON; no UI |
| **Decision Modification** | ✅ Complete | Can set readiness, increment supply |
| **Consumption (auto-depletion)** | ❌ Locked | Deferred to Phase 6B+ |
| **Base-Level/Side Supply** | ❌ Locked | Deferred to Phase 6B+ |
| **Fuel/Ammo/Food Breakdown** | ❌ Locked | Single supply field; future refinement |

---

## 10. Summary

**RMOOZ has a working readiness/supply foundation:**
- ✅ Evidence ledger captures unit readiness state (majority vote) + supply (average)
- ✅ Action-feasibility (Why-Not) correctly blocks on 'not_ready', risks on 'limited' / low supply
- ✅ Decisions can modify values; journals preserve state changes
- ✅ DB-Lite provides sensible defaults for all 11 platform types

**Key missing piece:** **Operators cannot author or edit readiness/supply on the map.** All scenarios inherit DB-Lite defaults (always 'ready', 0.7–0.95 supply).

**Next step (Slice 2A):** Add two fields to Edit Mode unit card (readiness selector + supply slider). This unlocks realistic training scenarios and makes Why-Not constraints meaningful.

**Deferred to Phase 6B+:** 
- Automatic consumption (firing → ammo loss)
- Base-level logistics (side-wide pool + capacity)
- Recovery/resupply simulation
- Fuel/ammo/food separation

---

**Audit Date:** 2026-06-04  
**Prepared for:** Phase 6A Readiness & Supply Authoring  
**Next Review:** After Slice 2A implementation (readiness/supply field authoring)
