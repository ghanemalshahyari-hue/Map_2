# Doctrine Evidence Planning — New Evidence Contributor

**Date:** 2026-06-03  
**Scope:** Design doctrine as evidence contributor (planning only, no code)  
**Goal:** Add doctrine evidence to objective_evidence ledger without changing engagement formulas

---

## 1. EXISTING DOCTRINE FIELDS AUDIT

### Unit-Level Fields (Already Present)

**Location:** `ws.units[uid]`

| Field | Type | Current Values | Source | Relevance |
|---|---|---|---|---|
| `doctrine_tags` | array | ['IADS', 'air_defense', 'maneuver', 'sea_control', 'air', 'EW', 'early_warning', etc.] | DB1 (from role) | Unit tactical role classification |
| `echelon` | string | 'battalion', 'company', 'platoon', 'division', etc. | Scenario | Unit organizational level |
| `posture` | string or null | 'active', 'defensive', 'hold', null (authored) | Scenario + WS3 decisions | Operator-set posture |
| `role` | string | 'mech_inf_div', 'sam_s300', 'submarine', 'awacs', etc. | Scenario | Unit operational role (33 variants in W3) |

### Side-Level Doctrine Fields (Schema-Defined, Not Yet in W3)

**Location:** `ws.scenario.doctrine` or `ws.sides[side_id].doctrine`

| Field | Type | Values | Purpose |
|---|---|---|---|
| `weapon_control_status` | enum per domain | FREE \| TIGHT \| HOLD (per air/surface/sub-surface) | ROE weapons control state |
| `emcon` | string | 'active' \| 'restricted' \| 'emcon-silent' (and variants) | Electronics management |
| `roe` | enum per domain | FREE \| TIGHT \| HOLD | Rules of Engagement per target environment |
| `engage_ambiguous` | boolean | true \| false | Engage unidentified contacts |
| `withdraw_on_fuel_state` | enum | 'bingo' \| 'low' \| 'never' | Retreat threshold |
| `overrides` | array | [{scope, setting, value}] | Force-override doctrine flags |

### CMO Doctrine Hierarchy (From Functional Rules)

**Inheritance Pattern:** Side → Mission → Unit (most specific wins)

- **Side-level:** Applies to entire side unless force-override flag set
- **Mission-level:** Can override side defaults (e.g., Sea Control mission resets ROE)
- **Unit-level:** Individual unit can override mission/side (if not force-locked)
- **Scenario-designer lock:** Per-setting lock prevents player changes at runtime

### Engagement-Related Fields (Already in WS)

| Field | Location | Relevance to Doctrine |
|---|---|---|
| `echelon` | ws.units[].echelon | Doctrine scope + targeting priority (company-level vs battalion-level) |
| `force_ratio_value` | ws.derived.balance_summary | Used in targeting priority (strength of sides affects doctrine application) |
| `engagement_outcomes` | ws.derived.engagement_outcomes | Fire decisions cite doctrine (WCS state, WRA salvo size, ROE target classification) |

---

## 2. MINIMAL DOCTRINE EVIDENCE MODEL

### Design Principle

**Doctrine = Operational Rules That Govern Engagement Decision-Making**

Evidence from existing doctrine fields only:
- Unit doctrine_tags (role-based classification)
- Unit echelon (organizational scope)
- Unit posture (authored operator state)
- Unit role (operational function)
- Side doctrine settings (WCS, ROE, EMCON)

**NOT included (deferred):**
- WRA salvo sizing (awaiting WRA module)
- Targeting priority computation (awaiting priority module)
- Proficiency modifiers (awaiting proficiency module)
- OODA reaction timing (awaiting timing module)
- Collective responsibility checks (awaiting identification module)

### What Doctrine Evidence Represents

Doctrine evidence **describes the rules environment** in which engagement decisions occur.
It does **NOT change engagement formulas** or introduce new combat modifiers.

Instead, it records:
- What doctrine rules are active (ROE state, WCS, EMCON)
- Which units inherit from which scope (side vs mission vs unit)
- What doctrine tags classify each unit
- Which doctrine constraints apply to objectives

---

## 3. EVIDENCE RECORD TYPES

### Type 1: Unit Doctrine Classification
```
evidence_type: "unit_doctrine_tags"
source: "ws.units[].doctrine_tags (from DB1 enrichment)"
value: array of strings (e.g., ['IADS', 'air_defense', 'maneuver'])
confidence: 0.95 (from DB1 role-based classification)

Purpose: Classify unit by doctrine role
Range: [] (no tags) to ~5 tags per unit
Example: SAM unit = ['IADS', 'air_defense']
Note: Tags inform which doctrine constraints apply
```

### Type 2: Unit Echelon Level
```
evidence_type: "unit_echelon_level"
source: "ws.units[].echelon"
value: string enum ('company', 'battalion', 'division', 'squad', etc.)
confidence: 0.95 (scenario-authored)

Purpose: Unit organizational scope for doctrine inheritance
Range: 7–8 echelon levels
Example: Battalion = can have independent WRA; Company = inherits from Battalion
Note: Echelon determines which doctrine scope applies
```

### Type 3: Unit Posture State
```
evidence_type: "unit_posture_state"
source: "ws.units[].posture (authored or WS3-set)"
value: string enum ('active', 'defensive', 'hold', 'retire', null)
confidence: 0.85 (authored, may be null)

Purpose: Operator-declared engagement posture
Range: {active, defensive, hold, retire, null}
Example: Hold = self-defense only
Note: Posture gates engagement decisions; differs from readiness
Fallback: null → treated as 'active'
```

### Type 4: Side Weapons Control Status (Per Environment)
```
evidence_type: "side_weapons_control_status"
source: "ws.scenario.doctrine.weapon_control_status" or side-level
value: object { air, surface, subsurface } with values FREE | TIGHT | HOLD
confidence: 0.95 (scenario-authored)

Purpose: What ROE state governs this objective
Range: {air: FREE|TIGHT|HOLD, surface: FREE|TIGHT|HOLD, subsurface: FREE|TIGHT|HOLD}
Example: { air: 'HOLD', surface: 'FREE', subsurface: 'TIGHT' }
Note: WCS is per-environment; different states apply simultaneously
```

### Type 5: Side EMCON Status
```
evidence_type: "side_emcon_status"
source: "ws.scenario.doctrine.emcon"
value: string enum ('active', 'restricted', 'emcon-silent', 'enhanced')
confidence: 0.9 (scenario-authored)

Purpose: Electronics control state (affects sensor use, engagement range)
Range: {active, restricted, emcon-silent, enhanced}
Example: emcon-silent = no radar transmit, detection at reduced range
Note: Awaiting integration with sensor range calculations (deferred)
```

### Type 6: Side Engage Ambiguous Flag
```
evidence_type: "side_engage_ambiguous"
source: "ws.scenario.doctrine.engage_ambiguous"
value: boolean (true | false)
confidence: 0.95 (scenario-authored)

Purpose: Will units attack unidentified contacts?
Range: true (yes, risks civilian) | false (no, require identification)
Example: true = FREE ROE includes unidentified; false = requires identification
Note: Gates contact classification logic
```

### Type 7: Unit Doctrine Inheritance Scope
```
evidence_type: "unit_doctrine_inheritance_scope"
source: "ws.units[].doctrine_inherit_from or inferred from role/echelon"
value: string enum ('side', 'mission', 'unit')
confidence: 0.8 (inferred; explicit field deferred)

Purpose: Where does this unit's doctrine come from?
Range: {side, mission, unit}
Example: Battalion → side; attached to mission → mission; override set → unit
Note: Determines which doctrine values apply
Fallback: 'side' (most common)
```

### Type 8: Objective Doctrine Priority
```
evidence_type: "objective_doctrine_priority"
source: "ws.objectives[].doctrine_priority or inferred from objective type"
value: string enum ('primary', 'secondary', 'tertiary', 'hold')
confidence: 0.7 (authored or CMO default)

Purpose: What priority does this objective have under current doctrine?
Range: {primary, secondary, tertiary, hold}
Example: Objective labeled 'objective_alpha' → primary attack target
Note: Affects targeting priority order (not salvo size; awaiting WRA)
Fallback: 'secondary'
```

### Type 9: Doctrine Compliance Summary
```
evidence_type: "doctrine_compliance_summary"
source: "ws.units[].doctrine_tags + ws.derived.engagement_outcomes"
value: object { compliant_unit_count, non_compliant_unit_count, doctrine_constraints_active }
confidence: 0.75 (aggregate of unit classifications + ROE state)

Purpose: Summary of doctrine adherence
Range: {compliant_unit_count: 0..N, non_compliant_unit_count: 0..M, 
         doctrine_constraints_active: [list of active rules]}
Example: { compliant: 45, non_compliant: 3, active: ['HOLD_on_air', 'EMCON_restricted'] }
Note: Audit trail for doctrine enforcement
```

---

## 4. DOCTRINE EVIDENCE CONTRIBUTOR

### Function Structure (Not Implemented)

```
function computeDoctrineEvidence(ws) {
  // Input: 
  //   ws.units[] (doctrine_tags, echelon, posture, role)
  //   ws.scenario.doctrine (WCS, EMCON, ROE, engage_ambiguous)
  //   ws.objectives[] (doctrine priority)
  //
  // Output: array of evidence records
  
  // Record 1: unit_doctrine_tags (per BLUE unit)
  // Record 2: unit_echelon_level (per BLUE unit) — aggregate
  // Record 3: unit_posture_state (majority state)
  // Record 4: side_weapons_control_status (side doctrine)
  // Record 5: side_emcon_status (side doctrine)
  // Record 6: side_engage_ambiguous (side doctrine)
  // Record 7: unit_doctrine_inheritance_scope (inferred)
  // Record 8: objective_doctrine_priority (per objective)
  // Record 9: doctrine_compliance_summary (audit)
  
  return [...records];
}
```

### Contributor Contract

| Record Type | Input Fields | Confidence | Fallback |
|---|---|---|---|
| unit_doctrine_tags | doctrine_tags[] | 0.95 | [] (no tags) |
| unit_echelon_level | echelon | 0.95 | null |
| unit_posture_state | posture | 0.85 | 'active' |
| side_weapons_control_status | doctrine.weapon_control_status | 0.95 | {air: FREE, surface: FREE, subsurface: HOLD} (liberal) |
| side_emcon_status | doctrine.emcon | 0.9 | 'active' (default) |
| side_engage_ambiguous | doctrine.engage_ambiguous | 0.95 | false (conservative) |
| unit_doctrine_inheritance_scope | inferred from role/echelon | 0.8 | 'side' (fallback) |
| objective_doctrine_priority | objectives[].doctrine_priority or CMO default | 0.7 | 'secondary' |
| doctrine_compliance_summary | aggregate | 0.75 | {compliant: N, non_compliant: 0, active: []} |

---

## 5. INTEGRATION INTO OBJECTIVE_EVIDENCE

### Ledger Extension

**Addition to objective_evidence computation:**

```javascript
function computeObjectiveEvidence(ws) {
  // ... existing contributors (balance, bls, engagements, contacts, readiness) ...
  
  // NEW: doctrine evidence
  ledger.records.push(...contributeDoctrineEvidence(ws, obj_id));
  
  return ledger;
}
```

### New Evidence in Ledger

Example objective_evidence array after doctrine added:

```javascript
ws.derived.objective_evidence = [
  // ... existing records (force_ratio, blue_destroyed, casualty_rate, etc.) ...
  
  // NEW: doctrine records
  {
    objective_id: "alpha",
    evidence_type: "unit_doctrine_tags",
    value: ['air_defense', 'maneuver', 'IADS', 'sea_control'],
    source: "ws.units[].doctrine_tags",
    confidence: 0.95,
    step_index: 5
  },
  {
    objective_id: "alpha",
    evidence_type: "side_weapons_control_status",
    value: { air: 'HOLD', surface: 'FREE', subsurface: 'TIGHT' },
    source: "ws.scenario.doctrine",
    confidence: 0.95,
    step_index: 5
  },
  // ... more doctrine records ...
]
```

---

## 6. DEPENDENCIES

### Hard Dependencies (Must Exist)

✅ ws.units[] with doctrine_tags, echelon, posture, role  
✅ ws.scenario.doctrine (schema-defined, not yet in W3)  
✅ ws.objectives[] with doctrine priority (schema placeholder)  
✅ objective_evidence ledger (OBJ-A)  
✅ DERIVATIONS registry (OBJ-B)

### Soft Dependencies (Would Enhance But Not Required)

⚠️ WRA module (salvo sizing — awaiting WRA-adjudication)  
⚠️ Targeting priority engine (target ranking — awaiting priority module)  
⚠️ Proficiency modifiers (confidence in doctrine — awaiting proficiency module)  
⚠️ OODA loop timing (reaction time — awaiting timing module)  
⚠️ Sensor range models (for EMCON effects — awaiting sensor module)

### Data Gap: W3 Doctrine Fields

**Current state:** W3 has `units[].posture = null` and no side-level doctrine defined.

**Migration path:**
1. **Phase 1:** Store doctrine evidence from available fields (doctrine_tags, echelon, posture)
2. **Phase 2:** Add scenario-level doctrine defaults (when authoring implements doctrine section)
3. **Phase 3:** Consume evidence for doctrine-aware engagement logic (OBJ-D, future)

---

## 7. RISKS & MITIGATIONS

### Risk 1: W3 Lacks Side-Level Doctrine Fields

**Problem:** W3 scenario has no `doctrine` object yet (schema exists but not in data)  
**Mitigation:**
- Evidence collection falls back to defaults (liberal WCS, conservative EMCON)
- Mark as "awaiting authoring" in evidence records
- No engagement formula change (parity gate intact)

### Risk 2: Doctrine Inheritance Scope Hard to Infer

**Problem:** W3 has no explicit "inherit_from_side" flag; scope must be inferred from role/echelon  
**Mitigation:**
- Infer scope: battalion → side-level doctrine, attached units → mission/unit
- Confidence lower (0.8) than authored fields (0.95)
- Document inference rule clearly

### Risk 3: Doctrine Tags Are Generic, Not Binding

**Problem:** doctrine_tags classify unit role but don't enforce constraints  
**Mitigation:**
- Evidence records role classification only (what the unit is)
- Enforcement logic deferred to future OBJ-D (when doctrine becomes consumer)
- No engagement formula change now

### Risk 4: EMCON Effects Not Modeled Yet

**Problem:** EMCON status recorded but has no impact on sensor range  
**Mitigation:**
- Store EMCON as evidence only (no behavior change)
- Confidence set to 0.9 (lower than WCS)
- Note in evidence: "awaiting sensor range integration"

### Risk 5: Objective Doctrine Priority May Be Authored Incorrectly

**Problem:** Scenario operator may forget to set objective priority  
**Mitigation:**
- Provide CMO-based defaults (first objective = primary, others = secondary)
- Confidence 0.7 (indicating authoring uncertainty)
- Fallback to 'secondary' if missing

### Risk 6: Doctrine Evidence Stored But Not Consumed

**Problem:** Doctrine evidence collected but objective_status_display won't use it yet  
**Mitigation:**
- Same pattern as readiness (storage first, consumption later)
- Mark as "awaiting interpretation" in comments
- OBJ-D will use evidence for doctrine-aware changes (future)

---

## 8. TESTS

### Unit Tests (9 assertions per type × 8 types = 72 core assertions)

**Type 1: unit_doctrine_tags** — 9 assertions
```
✓ record exists
✓ value is array
✓ array contains valid tag strings
✓ tags match doctrine_tags from DB1
✓ confidence = 0.95
✓ source is correct
✓ multiple units have consistent tags
✓ IADS units tagged correctly
✓ all Blue units have tags
```

**Type 2: unit_echelon_level** — 9 assertions
```
✓ record exists (aggregate)
✓ value is string enum
✓ enum values valid (company|battalion|division|etc.)
✓ echelon maps to unit level
✓ confidence = 0.95
✓ battalion units identified
✓ company units identified
✓ hierarchy preserved
✓ null echelon handled (fallback)
```

**Type 3: unit_posture_state** — 9 assertions
```
✓ record exists
✓ value is string enum or null
✓ enum values valid (active|defensive|hold|retire)
✓ posture from units[].posture
✓ confidence = 0.85
✓ majority posture computed when mixed
✓ null posture defaults to 'active'
✓ all units included in majority
✓ deterministic (same step = same majority)
```

**Type 4: side_weapons_control_status** — 9 assertions
```
✓ record exists
✓ value is object with {air, surface, subsurface}
✓ each domain has FREE|TIGHT|HOLD
✓ confidence = 0.95
✓ source correct (scenario.doctrine or default)
✓ default liberal (air=FREE, surface=FREE) when missing
✓ confidence lower when using default
✓ asymmetry allowed (different per domain)
✓ all domains present
```

**Type 5: side_emcon_status** — 9 assertions
```
✓ record exists
✓ value is string enum
✓ enum valid (active|restricted|emcon-silent|enhanced)
✓ confidence = 0.9
✓ source correct
✓ default to 'active' when missing
✓ confidence lower when default
✓ affects interpretation (noted but not calculated)
✓ single value per side
```

**Type 6: side_engage_ambiguous** — 9 assertions
```
✓ record exists
✓ value is boolean
✓ confidence = 0.95
✓ true = engage unidentified
✓ false = require identification
✓ default to false (conservative) when missing
✓ affects ROE logic (noted)
✓ confidence indicator when missing
```

**Type 7: unit_doctrine_inheritance_scope** — 9 assertions
```
✓ record exists (aggregate or per-unit)
✓ value is enum {side|mission|unit}
✓ confidence = 0.8 (inferred)
✓ most units inherit from side
✓ attached units inherit from mission
✓ units with override = 'unit'
✓ inferred from role/echelon
✓ fallback to 'side'
```

**Type 8: objective_doctrine_priority** — 9 assertions
```
✓ record exists (per objective)
✓ value is enum {primary|secondary|tertiary|hold}
✓ confidence = 0.7 (authored)
✓ first objective defaults to 'primary'
✓ others default to 'secondary'
✓ CMO convention respected
✓ confidence low (operator may forget)
✓ one priority per objective
```

**Type 9: doctrine_compliance_summary** — 9 assertions
```
✓ record exists
✓ value object has {compliant_unit_count, non_compliant_unit_count, doctrine_constraints_active}
✓ confidence = 0.75
✓ unit counts match Force level
✓ constraints list populated
✓ constraints reflect active WCS/EMCON/posture
✓ all units classified (compliant + non_compliant = total)
✓ compliance audit trail
```

### Integration Tests (8 assertions)

```
✓ all doctrine records have objective_id
✓ all records have confidence in [0, 1]
✓ no weights or scoring in doctrine records
✓ doctrine records have valid source attribution
✓ engagement_outcomes unchanged (no formula change)
✓ doctrine evidence is deterministic
✓ no mutation of world state
✓ objective_status_display still unchanged
```

### Regression Tests (6 assertions)

```
✓ 100+ step regression (steps 0–7 all produce doctrine evidence)
✓ doctrine tags consistent across steps
✓ WCS state preserved across steps
✓ EMCON state preserved across steps
✓ echelon hierarchy consistent
✓ no new engagement changes at any step
```

### Total Test Assertions: 96
- 72 core unit tests (8 types × 9 assertions)
- 8 integration tests
- 6 regression tests

---

## 9. SUCCESS CRITERIA

✅ **Schema Defined**
- 9 evidence types designed
- Each record structure specified
- Confidence values assigned based on authoring vs. inference

✅ **Minimal Scope**
- Uses only existing fields (doctrine_tags, echelon, posture, role, scenario.doctrine)
- No new formulas (only classification and defaults)
- No WRA, targeting priority, proficiency, OODA, or identification logic

✅ **Contributor Specified**
- Input fields identified
- Fallback values defined per type
- Integration point clear (objective_evidence ledger, step 4.5)

✅ **No Engagement Changes**
- engagement_outcomes computed exactly as before
- No salvo size change, no damage change, no ROE logic change
- Evidence purely storage (no consumption yet)

✅ **Dependencies Clear**
- Hard dependencies: existing fields + authoring schema
- Soft dependencies: deferred modules noted
- Data gaps (W3 doctrine) managed via defaults

✅ **Risks Identified & Mitigated**
- 6 risks enumerated
- Mitigation for each
- Deferred work explicit

✅ **Tests Planned**
- 72 core unit assertions (8 types × 9 assertions)
- 8 integration assertions
- 6 regression assertions
- Total: 96 planned assertions

✅ **Ready for Implementation**
- No code written (planning only)
- No engagement formula changes
- No objective_status_display changes
- Evidence ready to plug into ledger

---

## 10. DOCTRINE EVIDENCE AT A GLANCE

### Before (Doctrine Absent)
```
World State
  ├─ Balance Summary
  ├─ Engagement Outcomes
  └─ Units (strength, status, readiness, supply)
      └─ Objective Evidence (balance, BLS, engagements, contacts, readiness)
          └─ Objective Status Display
```

### After (Doctrine Evidence Added)
```
World State
  ├─ Balance Summary
  ├─ Engagement Outcomes
  ├─ Units (strength, status, readiness, supply, doctrine_tags, echelon, posture)
  └─ Scenario (doctrine: WCS, EMCON, ROE, engage_ambiguous)
      └─ Objective Evidence (balance, BLS, engagements, contacts, readiness, DOCTRINE)
          └─ Objective Status Display (unchanged consumer)
```

### What's New
- 9 doctrine evidence types
- Unit doctrine classification (tags, echelon)
- Side doctrine state (WCS, EMCON, ROE)
- Doctrine inheritance scope
- Objective priority under doctrine
- Compliance audit trail

### What's NOT New
- No engagement formula changes
- No WRA/salvo sizing (awaiting WRA module)
- No targeting priority computation (awaiting priority module)
- No proficiency modifiers (awaiting proficiency module)
- No OODA timing (awaiting timing module)
- No objective_status_display changes
- Evidence storage only (consumption awaiting OBJ-D)

---

## 11. INTEGRATION PATH

### DOCTRINE-A (Evidence Storage)
- Add 9 evidence types to computeObjectiveEvidence()
- No engagement formula change
- Tests: 96 assertions
- Output: Doctrine evidence in ledger

### DOCTRINE-B (Consumer Refactoring) — Future
- objective_status_display reads doctrine evidence
- Output format: same (parity gate)
- Example: consider doctrine_priority when computing status (awaiting rules clarification)

### DOCTRINE-C (Doctrine Interpretation) — Future
- WRA module: use doctrine evidence for salvo sizing
- Targeting Priority: use doctrine evidence for target ranking
- Proficiency: use doctrine evidence for confidence modifiers

### DOCTRINE-D (AI Integration) — Future
- AI COA grading cites doctrine compliance
- Audit trail shows which doctrine rules were followed/violated

---

## 12. DOCTRINE EVIDENCE IS EVIDENCE ONLY

**Locked Constraints (DOCTRINE-A):**
- ✅ Store doctrine evidence (9 types)
- ✅ Use existing fields only
- ❌ Do NOT change engagement formulas
- ❌ Do NOT change readiness behavior
- ❌ Do NOT change objective_status_display
- ❌ Do NOT add WRA, targeting, proficiency, OODA, identification logic
- ❌ Do NOT consume evidence for behavior changes
- ❌ Evidence storage only

---

**Doctrine Evidence: Classification & Storage, Not Interpretation**

