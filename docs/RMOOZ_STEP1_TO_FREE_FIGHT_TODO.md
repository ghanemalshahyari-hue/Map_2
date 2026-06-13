# RMOOZ Step 1 → AI Free Fight TODO

Purpose: keep the project aligned with the owner target: Step 1 import must produce correct, reviewable units at correct bases with app symbology; then Objective X is confirmed; then AI runs a free-fight battle between RED and BLUE with realistic movement, detection, engagement, and operator-readable results.

This document is the working TODO for the current import-to-free-fight gap. It should be read together with:

- `docs/RMOOZ_AI_DOC_UNDERSTANDING_START_HERE.md`
- `docs/cmo-functional-rules/4-scenario-authoring.md`
- `docs/cmo-functional-rules/2-doctrine-wra-engagement.md`
- `docs/session-memory/session_2026-06-01_world_state_engine.md`
- `APP_INVENTORY.md`

---

## Target end state

1. Operator clicks Import Scenario / Step 1.
2. Operator imports RED and BLUE planning documents or structured JSON.
3. RMOOZ reads the documents and shows what the AI understood before generation.
4. Units are grouped under the correct bases/anchors.
5. Units use RMOOZ app symbology. If a unit type has no symbol, create or map a safe family symbol instead of using a wrong icon.
6. Objective X is shown and confirmed as the single objective source for the run.
7. Operator approves the reviewed brief.
8. RMOOZ generates a draft scenario with RED and BLUE units anchored to reviewed bases, not blindly around Objective X.
9. On refresh, reviewed anchors and generated scenario state remain understandable.
10. AI Free Fight starts: RED and BLUE make decisions against each other using World State, detection, engagement, doctrine/WRA-style constraints, movement, attrition, terrain, and physics-style rules.
11. The map shows realistic movement, attack/counterattack, losses, status, why-not blockers, and unit status in a way the operator can understand.

---

## Where we are now

### Done / partly done

- CMO research exists in repo as functional-rule docs and raw caption files.
- CMO authoring order is documented: database/sides/posture/doctrine/time/weather/features before units, then areas/missions/events/test/briefing.
- CMO doctrine/WRA engagement logic is documented: doctrine layers, per-environment WCS/WRA, opportunity targets, self-defense, salvo logic, OODA/proficiency.
- RMOOZ has a World State stack already built in prior work: WS1, DB1, DET1, ENG1, WS3, MOVE1.
- The timeline Import button opens the existing import wizard.
- The wizard still contains RED and BLUE DOCX import buttons.
- Objective X setup exists in the import wizard.
- Scenario markers dispatch `rmooz:unit-selected` and Unit Status consumes that event.

### Not yet acceptable

- Step 1 import/review/generate is not stable enough to be treated as final.
- Review AI Understanding can be enabled with only one DOCX staged, while Start requires both RED and BLUE.
- Objective X has split state: server override path and generate-from-review input path can diverge.
- Current remote generate path still places draft RED/BLUE units using objective-relative template geometry unless the local uncommitted fix is applied.
- Proposed units and reviewed base anchors are not yet clearly persisted through refresh as review-only metadata.
- Unit Status uses weak name fallback and can show the wrong or missing unit name.
- Old Demo Movement and newer Free Fight preview can be confused with actual generated units if not clearly separated.
- Physics/terrain/detection/engagement realism exists as direction/components, but must remain parked until Step 1 placement is correct.

---

## Phase 1 — lock Step 1 import correctness

Goal: importing documents/JSON produces a reviewable military laydown with correct side, base, symbol, and name before any free fight.

### 1.1 Import button and wizard process

- Confirm `tl-import-scenario` only opens the import wizard; do not put generation logic in the timeline button.
- Keep RED DOCX and BLUE DOCX upload cards.
- Keep Advanced Import Tools, but clearly separate them from the main operator flow.
- Main flow should read: choose RED doc + BLUE doc → Review AI Understanding → approve/generate.

Acceptance:

- `tl-import-scenario` opens `wg-wizard-card`.
- RED/BLUE DOCX inputs are visible.
- Advanced tools are collapsed and not confused with the main Step 1 path.

### 1.2 Review AI Understanding gating

- Normal DOCX review requires both RED and BLUE staged.
- MDMP JSON-only review can run separately, but it must be labelled as separate mode.
- Do not allow a half-staged DOCX flow to look like a complete scenario review.

Acceptance:

- One DOCX alone does not enable normal review.
- Both DOCX staged enables review.
- MDMP-only mode is explicit and labelled.

### 1.3 Base/anchor matching

- Proposed units must match anchors by explicit IDs first:
  - unit: `assigned_base_id`, `base_id`, `assigned_base`, `base_location_id`
  - anchor: `base_id`, `id`, `location_id`, `assigned_base`
- Only fallback to name/coordinate matching when no ID exists.

Acceptance:

- Unit with `assigned_base_id=B1` groups under anchor `base_id=B1` even if names differ.
- Units are not merged just because base names are missing.

### 1.4 Symbology

- Use existing RMOOZ app symbology first.
- If a provided SIDC is valid, use it.
- If a specific SIDC is unsupported, map to a correct family/category symbol.
- If no symbol exists, create a safe generic family symbol; do not show a misleading symbol.

Acceptance:

- RED and BLUE units render with app symbology.
- Unsupported symbols degrade to family/category symbols.
- No generic marker is used when a better family symbol is available.

### 1.5 Unit Status naming

- Add a display-name helper with priority:
  `label || name || name_en || name_ar || unit_name || callsign || code || uid || unit_uid || id || '—'`
- Use this helper in Unit Status title, UID/name rows, fuel/ammo, fuel section, and image alt text.

Acceptance:

- Unit Status shows correct names for units that only have `name`, `name_ar`, `unit_uid`, or `base_id`.

---

## Phase 2 — Objective X single-source behavior

Goal: operator sees one Objective X and the same Objective X is used by review, generate, preview, and free fight.

Tasks:

- Treat Scenario Setup Objective X as the visible source of truth.
- When Objective X is saved, update the wizard inputs and any review/free-fight preview state.
- When Generate from Reviewed Brief runs, use the current Scenario Setup Objective X.
- Add status text showing whether Objective X is default or override.
- Prevent Free Fight Objective X and Scenario Setup Objective X from silently diverging.

Acceptance:

- Saved Objective X = generated scenario Objective X.
- Free Fight preview objective = generated scenario Objective X.
- Refresh does not silently revert to a different objective without a visible status.

---

## Phase 3 — generate from reviewed anchors, not objective-ring placeholders

Goal: approved review produces a draft scenario whose units start at reviewed base anchors when anchors exist.

Tasks:

- In `brief-to-scenario.js`, consume reviewed placement candidates.
- Place draft RED/BLUE units at side-matching reviewed anchors with small deterministic jitter.
- Fall back to objective-relative geometry only when no anchor exists for that side.
- Add provenance fields on every draft unit:
  - `exact_unit_position:false`
  - `needs_review:true`
  - `placement_source:"reviewed_base_anchor"` or `"template_geometry_relative_to_objective"`
  - `draft_template_position:false` for anchor-based placement
  - `draft_template_position:true` for fallback geometry

Acceptance:

- RED/enemy units do not remain at old objective-template positions when RED anchors exist.
- BLUE units do not use wrong default positions when BLUE anchors exist.
- Operator can tell which positions are draft/review-only.

---

## Phase 4 — refresh persistence

Goal: after Generate and browser refresh, the scenario remains understandable.

Tasks:

- Persist reviewed placement candidates into generated scenario metadata, not as final exact unit markers.
- Persist proposed units as review metadata.
- On scenario reload, redraw review/base anchors if saved review metadata exists.
- Keep proposed units grouped under anchors; do not draw them as exact final markers unless explicitly approved later.

Acceptance:

- Import → Review → Generate → Refresh still shows saved review anchors or an equivalent Base Status review layer.
- No duplicate demo overlays appear after refresh.

---

## Phase 5 — Free Fight preview separation

Goal: preview/demo movement is never mistaken for actual imported unit placement.

Tasks:

- Old Demo Movement and new Free Fight preview must not stack.
- Starting one clears the other.
- Add visible legend: preview/demo only, not real unit positions.
- Keep marker metadata explicit:
  - `demo_only:true`
  - `review_only:true`
  - `exact_unit_position:false`

Acceptance:

- No old/new preview marker duplication.
- Operator can tell actual generated units from demo/free-fight preview groups.

---

## Phase 6 — AI Free Fight engine

Goal: after Step 1 is correct and Objective X is confirmed, AI starts a live RED-vs-BLUE battle loop.

This is not Step 1. Do not wire it prematurely.

Required ingredients:

- World State is the single runtime state.
- Detection contacts determine what each side knows.
- Engagement logic uses WRA/doctrine-style constraints, not arbitrary firing.
- Movement responds to objective, enemy contacts, terrain, unit role, supply, attrition, and mission intent.
- RED and BLUE both choose actions; no single scripted side should dominate the logic.
- The system explains why a unit moved, fired, held, withdrew, or failed.
- Operator can pause/review before committing major AI-generated outcomes if needed.

Acceptance:

- RED and BLUE produce actions from the same decision loop.
- Movement looks alive but is explainable.
- Units do not teleport unless explicitly modelled as off-map/air/long-range effect.
- Effects are auditable: detection → decision → engagement → result → new World State.

---

## Parked future realism engine — do not forget, do not wire too early

The owner wants RMOOZ to become very strong in realism: physics-like movement, terrain, detection, weapon effects, supply, readiness, and real constraints. Some components already exist or are documented, but they should be activated only after Step 1 import and placement are reliable.

Future realism areas:

- Terrain friction and LOS.
- Radar horizon and sensor detection.
- EMCON and passive detection.
- Weather/sea-state effects.
- Weapon ranges, WRA, salvo sizing, fire-control channels.
- OODA/proficiency reaction delays.
- Fuel, ammo, supply, readiness, maintenance.
- Movement physics: speed, turning, acceleration, terrain limits, maritime constraints, air endurance.
- Damage states: suppressed, degraded, destroyed, expended, delayed.
- Doctrine inheritance: side → mission → unit.
- Mission/tasking layer: patrol, strike, support, defend, retreat, intercept.

Rule:

- Do not let realism modules hide Step 1 errors.
- First prove imported units are correctly named, symbolized, anchored, and persisted.
- Then turn on the free-fight realism engine incrementally.

---

## Immediate next implementation order

1. Fix Unit Status name fallback.
2. Fix Review AI Understanding gating for DOCX completeness.
3. Fix Objective X single-source behavior.
4. Land/verify anchor-based draft generation in `brief-to-scenario.js`.
5. Persist review anchors/proposed units through refresh as review-only metadata.
6. Clean up old/new demo overlay stacking.
7. Only after all above: start wiring true AI Free Fight from World State + detection + engagement + movement.
