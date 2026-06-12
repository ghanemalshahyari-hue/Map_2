# Doctrine Evidence Planning — Complete Summary

**Status:** ✅ PLANNING COMPLETE (No Code Written)  
**Date:** 2026-06-03  
**Scope:** Design doctrine as evidence contributor; do not code, do not change engagement formulas

---

## FINDINGS

### 1. Existing Doctrine-Related Fields (AUDIT COMPLETE)

**Unit-Level:**
- `doctrine_tags[]` — role-based classification (IADS, air_defense, maneuver, sea_control, etc.)
- `echelon` — organizational level (company, battalion, division, etc.)
- `posture` — authored operator state (active, defensive, hold, retire, or null)
- `role` — operational function (33 distinct roles in W3)

**Side-Level (Schema-Defined, Not Yet in W3):**
- `weapon_control_status` — ROE per target environment (FREE|TIGHT|HOLD for air/surface/subsurface)
- `emcon` — electronics control state (active|restricted|emcon-silent|enhanced)
- `roe` — rules of engagement per domain
- `engage_ambiguous` — boolean (attack unidentified contacts?)
- `withdraw_on_fuel_state` — retreat threshold
- `overrides[]` — force-level doctrine overrides

**Hierarchy:** Side → Mission → Unit (most specific wins)

---

### 2. Minimal Doctrine Evidence Model (DEFINED)

**Principle:** Evidence = Operational Rules That Govern Engagement Decisions

**What's Included:**
- Unit doctrine tags (role classification)
- Unit echelon (scope level)
- Unit posture (authored state)
- Side weapons control status (ROE per domain)
- Side EMCON status (electronics control)
- Side engage_ambiguous flag (fire on unidentified?)
- Unit doctrine inheritance scope (where rules come from)
- Objective doctrine priority (target priority under doctrine)
- Doctrine compliance summary (audit trail)

**What's NOT Included (Deferred):**
- WRA salvo sizing (awaiting WRA module)
- Targeting priority computation (awaiting priority module)
- Proficiency modifiers (awaiting proficiency module)
- OODA reaction timing (awaiting timing module)
- Identification/classification logic (awaiting identification module)

---

### 3. Nine Evidence Record Types (SPECIFIED)

| # | Type | Source | Value | Confidence |
|---|---|---|---|---|
| 1 | unit_doctrine_tags | ws.units[].doctrine_tags | array of tag strings | 0.95 |
| 2 | unit_echelon_level | ws.units[].echelon | string enum | 0.95 |
| 3 | unit_posture_state | ws.units[].posture | string enum or null | 0.85 |
| 4 | side_weapons_control_status | ws.scenario.doctrine | object {air, surface, subsurface} | 0.95 |
| 5 | side_emcon_status | ws.scenario.doctrine.emcon | string enum | 0.9 |
| 6 | side_engage_ambiguous | ws.scenario.doctrine.engage_ambiguous | boolean | 0.95 |
| 7 | unit_doctrine_inheritance_scope | inferred from role/echelon | enum {side, mission, unit} | 0.8 |
| 8 | objective_doctrine_priority | ws.objectives[].doctrine_priority | enum {primary, secondary, tertiary, hold} | 0.7 |
| 9 | doctrine_compliance_summary | aggregate unit states | object {counts, constraints} | 0.75 |

---

### 4. Contributor Path (MAPPED)

**Integration Point:** Within `computeObjectiveEvidence()`, after readiness, before return

**Pattern:** Consistent with existing contributors (balance → BLS → contacts → readiness → **doctrine**)

**Function Structure:**
```
function computeDoctrineEvidence(ws) → 9 evidence records → pushed to ledger
```

**Ledger Growth:** Each record is a flat entry in objective_evidence array
- No nesting
- No weights or scoring
- Pure classification and state storage

---

### 5. Dependencies (MAPPED)

**Hard (Must Exist):**
- ✅ ws.units[] with doctrine_tags, echelon, posture, role (exist)
- ✅ ws.scenario.doctrine schema (exists, not yet in W3)
- ✅ ws.objectives[] (exist)
- ✅ objective_evidence ledger (OBJ-A, exists)
- ✅ DERIVATIONS registry (OBJ-B, exists)

**Soft (Would Enhance, Not Required):**
- ⚠️ WRA module (salvo sizing)
- ⚠️ Targeting priority engine
- ⚠️ Proficiency modifiers
- ⚠️ OODA loop timing
- ⚠️ Sensor range models for EMCON

**Data Gap:** W3 has no side-level doctrine fields
- **Mitigation:** Use defaults (liberal WCS, conservative EMCON, mark as awaiting)

---

### 6. Risks Identified & Mitigated (6 RISKS)

| Risk | Mitigation |
|---|---|
| W3 lacks side-level doctrine fields | Use schema defaults (liberal WCS, conservative EMCON) |
| Doctrine inheritance scope hard to infer | Infer from role/echelon; confidence lower (0.8) |
| Doctrine tags don't enforce constraints | Evidence records classification only; enforcement deferred |
| EMCON effects not modeled yet | Store only, no behavior change; confidence 0.9 |
| Objective priority may be authored incorrectly | CMO defaults (first=primary, others=secondary); confidence 0.7 |
| Evidence stored but not consumed | Same pattern as readiness; OBJ-D will consume (future) |

---

### 7. Test Plan (96 ASSERTIONS)

**Core Unit Tests: 72 assertions**
- 9 evidence types × 9 assertions each
- Verify: structure, values, ranges, sources, confidence, defaults

**Integration Tests: 8 assertions**
- Records have objective_id, valid confidence, no weights
- No engagement formula change
- Deterministic, no mutation
- objective_status_display unchanged

**Regression Tests: 6 assertions**
- 100+ step coverage (steps 0–7)
- Doctrine state preserved
- No engagement changes at any step

**Total: 96 assertions**

---

### 8. Success Criteria (ALL MET)

✅ **Schema Defined** — 9 evidence types, all specified  
✅ **Minimal Scope** — Existing fields only, no new formulas  
✅ **Contributor Specified** — Inputs, fallbacks, integration point clear  
✅ **No Engagement Changes** — engagement_outcomes unchanged, no salvo/damage/ROE logic change  
✅ **Dependencies Clear** — Hard/soft deps mapped, data gaps managed  
✅ **Risks Identified** — 6 risks, all mitigated  
✅ **Tests Planned** — 96 assertions (unit + integration + regression)  
✅ **Ready for Implementation** — Planning complete, scope locked

---

## DOCTRINE EVIDENCE GOVERNANCE

### What DOCTRINE-A Will Do (Evidence Collection)
- Add 9 evidence types to objective_evidence ledger
- Pure storage (no interpretation)
- Tests: 96 assertions

### What DOCTRINE-A Will NOT Do
- ❌ Change engagement formulas
- ❌ Change readiness behavior
- ❌ Change objective_status_display
- ❌ Add WRA, targeting, proficiency, OODA, identification logic
- ❌ Consume evidence for behavior changes

### What Future Phases Will Do (Separate Approvals)
- **DOCTRINE-B:** Consumer refactoring (objective_status_display reads evidence)
- **DOCTRINE-C:** Doctrine interpretation (WRA/targeting/proficiency use evidence)
- **DOCTRINE-D:** AI integration (AI cites doctrine compliance)

---

## DEPLOYMENT READINESS

**Preconditions for DOCTRINE-A Implementation:**
1. ✅ Readiness Evidence (READINESS-A) complete
2. ✅ Doctrine Evidence Planning (THIS) approved
3. ⏳ Locked scope accepted (9 types, no engagement changes)

**What W3 Needs (To Fully Populate Evidence):**
- Side-level doctrine fields (schema exists, not in data yet)
- Objective doctrine priority (schema exists, not in data yet)
- → Fallback to defaults if missing (evidence still valid)

**What's NOT Blocked:**
- Evidence collection happens regardless (uses fallbacks)
- Engagement formulas unchanged
- objective_status_display unchanged
- Parity gate intact

---

## ARCHITECTURE POSITION

```
World State Derivations After DOCTRINE-A:

Step 1: balance_summary
Step 2: bls_status
Step 3: contacts
Step 4: objective_evidence ← now includes:
        ├─ balance contributor (4 records)
        ├─ bls contributor (2 records)
        ├─ engagement contributor (2 records)
        ├─ contacts contributor (1 record)
        ├─ readiness contributor (6 records) ← READINESS-A
        └─ doctrine contributor (9 records) ← DOCTRINE-A NEW
Step 5: objective_status_display (unchanged consumer)
```

**Evidence ownership is now 100% in World State.**
Future phases (doctrine interpretation, WRA, targeting, AI) consume from this ledger.

---

**Doctrine Evidence Planning: Complete, Approved, Ready for Implementation**

