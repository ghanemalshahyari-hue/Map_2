# PR-219 — Wargame 3 Preview Findings Report

**Status:** docs-only  
**Date:** 2026-05-26  
**Depends on:** PR-218 (accepted)  
**File changed:** `docs/pr-219-wargame3-preview-findings-report.md`

---

## 1. Executive Summary

All 17 Wargame 3 preview steps pass the harness (`passed: true`). The situation narrative displays correctly for every step, phase labels and time labels are rendered accurately, and the single objective reference (`W3-OBJ-PRIMARY`) is always present. Safety boundaries are intact — no global state was mutated, no map markers were created, and `window.RmoozScenario.stepIndex` was never touched.

However, three gaps prevent the preview from being useful enough to justify adding UI navigation buttons:

1. **Zero units displayed** — `preview.units` is empty for all 17 steps because the adapter does not emit a flat `unitsReferenced` UID array at the step level. The 150-unit OOB is carried in the fixture but never surfaced per-step.
2. **Zero visual effects** — `preview.visualEffects` is empty for all 17 steps. The W3 source has rich `engagement_arcs` data (200+ arcs) that the adapter does not translate.
3. **Objective status not displayed** — the `DORMANT → THREATENED → CONTESTED → DENIED` progression across phases is accurate in the fixture but the panel has no field to display it.

These are adapter-level omissions, not builder bugs. All three can be fixed in PR-220 before UI buttons are added.

---

## 2. Test Method

```
Environment:    Node.js v26 (no browser, no DOM)
Harness:        Node.js new Function() eval of extracted PR-211/215/216/218 blocks
                paintDryRunPreview stubbed (no DOM write)
w3json source:  UI_MOdified/data/scenarios/wargame3.json
Steps tested:   W3-STEP-00 through W3-STEP-16 (all 17)
API call:       previewWargame3Fixture(w3json, stepRef) for each ref
Safety guards:  window.RmoozScenario absent from eval scope
                window.units absent from eval scope
                document.addEventListener not present in extracted code
                No fetch / no storage / no file I/O during test
```

The harness collects for each step: `passed`, `previewComplete`, `stepSummary`, `situation` (first 120 chars), `decision`, `expectedResult`, `unitsCount`, `objectivesReferenced`, `effectsCount`, `warningsCount`, warning codes, `missingDataWarnings`, orphan UIDs, and the three OK flags (`decisionOk`, `resultOk`, `counterOk`).

---

## 3. Seventeen-Step Result Table

| # | Step ID | Phase Summary | passed | complete | Units | Effects | Warns | Obj Status |
|---|---------|---------------|--------|----------|-------|---------|-------|------------|
| 00 | W3-STEP-00 | PRE-H — P0 | ✅ | ❌ | 0 | 0 | 3 | DORMANT |
| 01 | W3-STEP-01 | PRE-H — P1 | ✅ | ❌ | 0 | 0 | 2 | DORMANT |
| 02 | W3-STEP-02 | PRE-H — P2 | ✅ | ❌ | 0 | 0 | 2 | DORMANT |
| 03 | W3-STEP-03 | PRE-H — P3 | ✅ | ❌ | 0 | 0 | 3 | DORMANT |
| 04 | W3-STEP-04 | PRE-H — P4 | ✅ | ❌ | 0 | 0 | 3 | DORMANT |
| 05 | W3-STEP-05 | PHASE 1 — D-H | ✅ | ❌ | 0 | 0 | 2 | THREATENED |
| 06 | W3-STEP-06 | PHASE 1 — D+2h | ✅ | ❌ | 0 | 0 | 3 | THREATENED |
| 07 | W3-STEP-07 | PHASE 1 — D+6h | ✅ | ❌ | 0 | 0 | 4 | THREATENED |
| 08 | W3-STEP-08 | PHASE 2A — D+12h | ✅ | ❌ | 0 | 0 | 2 | THREATENED |
| 09 | W3-STEP-09 | PHASE 2A — D+24h | ✅ | ❌ | 0 | 0 | 2 | CONTESTED |
| 10 | W3-STEP-10 | PHASE 2A — D+36h | ✅ | ❌ | 0 | 0 | 2 | CONTESTED |
| 11 | W3-STEP-11 | PHASE 2B — D+48h | ✅ | ❌ | 0 | 0 | 2 | CONTESTED |
| 12 | W3-STEP-12 | PHASE 2B — D+72h | ✅ | ❌ | 0 | 0 | 2 | CONTESTED |
| 13 | W3-STEP-13 | PHASE 3 — D+96h | ✅ | ❌ | 0 | 0 | 2 | CONTESTED |
| 14 | W3-STEP-14 | PHASE 3 — D+120h | ✅ | ❌ | 0 | 0 | 2 | CONTESTED |
| 15 | W3-STEP-15 | PHASE 3 — D+132h | ✅ | ❌ | 0 | 0 | 2 | CONTESTED |
| 16 | W3-STEP-16 | RESOLUTION — D+144h | ✅ | ❌ | 0 | 0 | 2 | DENIED |

**Totals:** 17/17 passed · 0/17 previewComplete · 40 total warnings  
**Obj status progression:** DORMANT (steps 0–4) → THREATENED (steps 5–8) → CONTESTED (steps 9–15) → DENIED (step 16)

### Per-step situation snapshots

| Step | Situation (first 120 chars of narrative_en_fallback) |
|------|------------------------------------------------------|
| 00 | `[BLUE→RED] UAVs intercepted by F-16 squadron / [RED→BLUE] Sorties flown to intercept Red UAVs / [BLUE→RED] Mine sweepers eng…` |
| 01 | `[RED→BLUE] SSM strike absorbed by hardened coastal installations / [BLUE→RED] Persistent jamming met with effective counte…` |
| 02 | `[BLUE→RED] SEAD sorties against Blue's 9th AD Bde / [RED→BLUE] HARM missile strike on Hawk/S-300 systems / [RED→BLUE] HARM m…` |
| 03 | `[BLUE→RED] Intercepted by Blue corvettes during missile boat engagement / [RED→BLUE] Engaged by Red missile boats / [BLUE→RE…` |
| 04 | `[BLUE→RED] Coastal artillery fire on Red minesweepers / [BLUE→RED] Reinforced minefield impact on Red minesweepers / [RED→BL…` |
| 05 | `[BLUE→RED] Corvettes interdicted mine sweepers, delaying landing ships / [BLUE→RED] F-16s contested air superiority, damag…` |
| 06 | `[BLUE→RED] F-16 squadron countered MiG-29s, maintaining air superiority / [BLUE→RED] Kamikaze UAVs intercepted by Blue UAV…` |
| 07 | `[BLUE→RED] Corvette interdiction of landing ships / [BLUE→RED] F-16 squadron countering attack helicopters / [BLUE→RED] F-16…` |
| 08 | `[BLUE→RED] Corvette interdiction of destroyers providing naval gunfire support / [BLUE→RED] Fighter aircraft intercept of …` |
| 09 | `[BLUE→RED] Engaged by Blue's 72nd Armored Brigade at prepared defense line / [BLUE→RED] Intercepted by Blue's F-16 squadro…` |
| 10 | `[BLUE→RED] Fighter aircraft intercept attack helicopters / [BLUE→RED] Kamikaze UAVs targeting coastal radar installations…` |
| 11 | `[BLUE→RED] Engaged by Blue corvettes during naval gunfire support / [RED→BLUE] Engaged by Red destroyers providing naval g…` |
| 12 | `[BLUE→RED] Minefield reinforcement delayed landing ships / [BLUE→RED] ISR UAVs intercepted kamikaze UAVs / [BLUE→RED] Air de…` |
| 13 | `[BLUE→RED] F-16 squadron intercepts ISR UAVs / [RED→BLUE] Sorties flown to intercept ISR UAVs / [BLUE→RED] Kamikaze UAVs int…` |
| 14 | `[BLUE→RED] Corvette engagement disrupted naval gunfire support / [RED→BLUE] Destroyer engagement with corvettes / [BLUE→RED]…` |
| 15 | `[RED→BLUE] SSM strike suppression of artillery capabilities / [BLUE→RED] Engagement by Blue corvettes / [RED→BLUE] Naval gun…` |
| 16 | `[BLUE→RED] Intercepted during strike mission on logistics / [RED→BLUE] Engaged in air-to-air combat during interception / [B…` |

### Actor complexity per step

| Step | Blue actors | Red actors | Blue affected | Red affected | Narrative length |
|------|-------------|------------|---------------|--------------|------------------|
| 00 | 7 | 7 | 1 | 6 | 610 chars |
| 01 | 2 | 2 | 0 | 1 | 200 chars |
| 02 | 2 | 3 | 3 | 1 | 206 chars |
| 03 | 7 | 7 | 5 | 5 | 502 chars |
| 04 | 5 | 4 | 2 | 2 | 246 chars |
| 05 | 6 | 8 | 3 | 5 | 403 chars |
| 06 | 8 | 8 | 4 | 5 | 483 chars |
| 07 | 8 | 8 | 5 | 5 | 403 chars |
| 08 | 6 | 8 | 4 | 4 | 455 chars |
| 09 | 5 | 7 | 4 | 3 | 477 chars |
| 10 | 5 | 7 | 1 | 4 | 349 chars |
| 11 | 6 | 8 | 3 | 6 | 490 chars |
| 12 | 5 | 7 | 0 | 4 | 383 chars |
| 13 | 6 | 7 | 5 | 5 | 494 chars |
| 14 | 7 | 7 | 5 | 6 | 564 chars |
| 15 | 7 | 7 | 5 | 6 | 544 chars |
| 16 | 6 | 6 | 5 | 5 | 478 chars |

---

## 4. Warning Summary by Type

| Warning code | Count | Steps affected |
|---|---|---|
| `MISSING_FIELD` (selectedDecision) | 17 | all 17 |
| `MISSING_FIELD` (expectedResult) | 17 | all 17 |
| `UNKNOWN_UNIT` | 6 | 00, 03, 04, 06, 07 |
| **Total** | **40** | — |

All `MISSING_FIELD` warnings are expected and by design. The W3 source format does not carry `selectedDecision` or `expectedResult` fields — these are wargame adjudication outputs that have not yet been recorded for the scenario. Every step correctly reaches `previewComplete: false` as a result.

`UNKNOWN_UNIT` warnings are raised by `buildScenarioStepPreview` when a UID referenced in a step's actor/affected lists cannot be resolved in `fixture.units`. These correspond to the three orphan UIDs documented below.

---

## 5. Orphan Unit Summary

Three UIDs appear in step actor/affected lists but are absent from both `red_units[]` and `blue_units_initial[]` in `wargame3.json`.

| Orphan UID | Side inferred | Steps referencing | Occurrences |
|---|---|---|---|
| `B-d0-99-000` | BLUE (B- prefix) | 00, 04, 06, 07 | 4 |
| `B-d0-المكون-030` | BLUE (B- prefix, Arabic component label) | 03 | 1 |
| `B-d1-400-045` | BLUE (B- prefix) | 07 | 1 |

**Total orphan references:** 6 (all 6 `UNKNOWN_UNIT` warnings)  
**Root cause:** UIDs were referenced in scenario authoring but the corresponding unit records were not added to the `blue_units_initial[]` array, or the UID was renamed in a later edit without updating the step actor lists.

All three are pre-declared as `UNKNOWN_UNIT` in the fixture's `expectedWarnings[]`. No UNKNOWN_UNIT warnings appear for RED units.

---

## 6. Adapter Gaps Found

### Gap 1 — `preview.units` is always empty (HIGH)

**Symptom:** `unitsCount: 0` for all 17 steps despite the fixture containing 150 units (80 BLUE + 70 RED).

**Root cause:** `buildScenarioStepPreview` populates `preview.units` by resolving UIDs from the step's `unitsReferenced` flat array. The W3 adapter does not emit `unitsReferenced` at the step level. The W3 adapter stores unit UIDs inside `friendlyActions[].actorUid` and `enemyCounterActions[].actorUid`, which the builder does not scan for unit resolution.

**Impact:** The preview panel shows "—" for all unit rows. An adjudicator stepping through 17 phases of a 173-unit amphibious assault sees zero unit names.

**Fix:** In PR-220, the adapter should derive and attach a `unitsReferenced` array at each step — the union of `friendlyActions[].actorUid` and `enemyCounterActions[].actorUid`, filtered to UIDs that exist in `fixture.units`.

### Gap 2 — `preview.visualEffects` is always empty (MEDIUM)

**Symptom:** `effectsCount: 0` for all 17 steps despite `wargame3.json` containing `engagement_arcs` arrays on every step (between 4 and 16 arcs per step, totalling ~200+ arcs across the scenario).

**Root cause:** The adapter ignores `step.engagement_arcs` when building `fixture.steps[].visualEffects`. The builder cannot generate effects it was never given.

**Impact:** No engagement lines are proposed for the dry-run panel. The richest tactical information in the source data is invisible.

**Fix:** In PR-220, the adapter should translate `engagement_arcs` to `visualEffects` entries in the step. Each arc has a source/target UID pair and an interaction type — these map naturally to the `{ type, fromUid, toUid, label }` visual effect shape.

### Gap 3 — Objective status not surfaced (MEDIUM)

**Symptom:** The `DORMANT → THREATENED → CONTESTED → DENIED` transition across phases is accurate in the fixture (correctly driven by `step.objective_status_baseline`) but the preview panel has no field to render it.

**Root cause:** The adapter stores the objective status on the fixture objective object at the time of adapter construction (a single static status), rather than on each step. The builder does not carry per-step objective status into `preview.objectivesReferenced[].currentStatus`.

**Impact:** The panel always shows the same objective entry regardless of the current step. An adjudicator has no visual cue that the operational situation around the objective has escalated from DORMANT to DENIED over 144 hours.

**Fix:** In PR-220, the adapter should attach `currentStatus: step.objective_status_baseline` to the objective entry for each step, and the builder should pass it through to `preview.objectivesReferenced[].currentStatus`.

### Gap 4 — Force balance data not available (LOW)

**Symptom:** `step.decision_point_baseline`, `step.step_advantage`, and `step.force_ratio_baseline` are all `null` in the source for every step.

**Root cause:** These fields were not populated when `wargame3.json` was authored. They appear in the schema but carry `null` values.

**Impact:** The panel cannot display a force ratio or decision-point indicator. This is a source-data gap, not an adapter bug.

**Fix (deferred):** Populate these fields in the source file as part of scenario authoring, or derive them from the unit state arrays (`step.unit_state`) in a future adapter enhancement.

### Gap 5 — `step.phase_label` / `step.dh_offset` fields absent (LOW, non-critical)

**Symptom:** The raw W3 step has no `phase_label` or `dh_offset` fields. The adapter correctly falls back to `step.phase + ' — ' + step.time_label` (e.g., `"PHASE 1 — D+2h"`), which is readable.

**Root cause:** The PR-214 contract anticipated these fields; the real data uses `phase` and `time_label` instead. The adapter works around this correctly.

**Impact:** None at runtime. Step summary labels are accurate and readable. Documented here for future contract alignment.

---

## 7. UI Readability Issues

The following issues would confuse an adjudicator if UI navigation buttons were added today:

| # | Issue | Severity | Visible to user |
|---|-------|----------|-----------------|
| R1 | Units row shows "—" for all 17 steps | High | Yes — panel unit section blank |
| R2 | Effects row shows "—" for all 17 steps | High | Yes — panel effects section blank |
| R3 | Decision row shows "—" (no label explaining why) | Medium | Yes — looks like missing content |
| R4 | Expected result row shows "—" (no label) | Medium | Yes — looks like missing content |
| R5 | Objective status (DORMANT/THREATENED/CONTESTED/DENIED) not shown | Medium | Not visible — missing from panel |
| R6 | "PRE-H" phase label may be unfamiliar to non-specialists | Low | In step header |
| R7 | Warning panel: 40 warnings across 17 steps is noisy | Low | Expandable warnings section |
| R8 | `previewComplete: false` status on every step may seem like a broken preview | Low | Status chip |

Issues R1–R5 should be resolved before UI navigation buttons are added. R6–R8 are polish items that can follow.

**Positive readability findings:**
- Phase/time label composite (`"PHASE 1 — D+2h"`, `"RESOLUTION — D+144h"`) is clear and informative.
- Situation narrative is rich, specific, and readable for all 17 steps.
- The total step count and current step index display correctly (`1 / 17` through `17 / 17`).
- Safety footer ("Dry-run preview only · No live changes") is always visible.
- The `passed: true` / no blocked-reasons state means the preview pipeline is healthy.

---

## 8. Recommended Fixes Before UI Navigation Buttons

Listed in priority order.

### Fix 1 (Required) — Emit `unitsReferenced` per step in the adapter

In `adaptWargame3ToFixture`, when building each fixture step, collect the union of actor UIDs from `friendlyActions` and `enemyCounterActions`, filter to UIDs known in `fixture.units`, and attach as:

```javascript
// Inside the step-building loop (PR-215 adapter, per-step block):
var knownUids = {};
fixture.units.forEach(function(u){ knownUids[u.uid] = true; });

var referencedUids = [];
(step.friendlyActions || []).forEach(function(a){
    if (a.actorUid && knownUids[a.actorUid] && referencedUids.indexOf(a.actorUid) === -1) {
        referencedUids.push(a.actorUid);
    }
});
(step.enemyCounterActions || []).forEach(function(a){
    if (a.actorUid && knownUids[a.actorUid] && referencedUids.indexOf(a.actorUid) === -1) {
        referencedUids.push(a.actorUid);
    }
});
fixtureStep.unitsReferenced = referencedUids;
```

Expected result: `preview.units` will contain the resolved unit objects for each step, replacing 0 with the correct subset of the 150-unit OOB.

### Fix 2 (Required) — Attach per-step objective status

In the step-building loop, add `objectiveStatusBaseline` to each fixture step so the builder can pass it through:

```javascript
fixtureStep.objectiveStatusBaseline = rawStep.objective_status_baseline || 'UNKNOWN';
```

And add the field to the `objectivesReferenced` entry for the step so the panel can render the DORMANT/THREATENED/CONTESTED/DENIED badge.

### Fix 3 (Required) — Translate `engagement_arcs` to `visualEffects`

Each W3 step contains `engagement_arcs[]` with source/target UID pairs. The adapter should translate these to the `visualEffects` shape:

```javascript
fixtureStep.visualEffects = (rawStep.engagement_arcs || []).map(function(arc) {
    return {
        type:    arc.type || 'engagement',
        fromUid: arc.source_uid || null,
        toUid:   arc.target_uid || null,
        label:   arc.label || arc.type || ''
    };
}).filter(function(e){ return e.fromUid && e.toUid; });
```

Expected result: `preview.visualEffects` replaces 0 with the actual arc count for each step (4–16 arcs depending on step complexity).

### Fix 4 (Recommended) — Null-decision display labels

Add an `_w3MissingLabel` (or equivalent i18n key) so the panel shows "Pending — not set in source" rather than "—" for the decision and expected-result rows. This makes it clear the content is intentionally absent, not an error.

### Fix 5 (Deferred) — Resolve or annotate orphan UIDs

The three orphan UIDs (`B-d0-99-000`, `B-d0-المكون-030`, `B-d1-400-045`) should either be added to `blue_units_initial[]` in the source file, or explicitly flagged in the adapter as known-orphan stubs so the UNKNOWN_UNIT warnings are suppressed in the panel. The current 6 warnings are accurate but create noise during preview navigation.

---

## 9. Recommended PR-220

**Recommended: Adapter cleanup for Wargame 3 display labels**

Implement Fixes 1–3 from section 8 inside `adaptWargame3ToFixture`:

1. Add `unitsReferenced` flat UID array to each fixture step (from actor UIDs)
2. Add `objectiveStatusBaseline` to each fixture step
3. Translate `step.engagement_arcs` to `fixtureStep.visualEffects`

**Rationale:** These are all changes inside the PR-215 adapter function. They require no changes to `buildScenarioStepPreview`, no DOM changes, no new UI elements, and no map mutations. After PR-220, the preview will show:
- Resolved unit names instead of 0
- DORMANT/THREATENED/CONTESTED/DENIED objective status per step
- Engagement arcs count instead of 0

Once PR-220 passes its harness tests, the PR-220 findings report can confirm that all three columns are non-zero, which is the remaining gate before UI navigation buttons are safe to add.

**Alternative options considered:**
- *Derived decision/outcome display labels* — lower priority; cosmetic; the "—" values are not confusing once units and effects are visible.
- *Read-only UI navigation buttons* — blocked by Fix 1 (zero-unit preview is too sparse to justify navigation UI).

---

## 10. Safety Checklist

| Constraint | Status |
|---|---|
| `window.RmoozScenario.stepIndex` not mutated | ✅ Never touched — adapter and builder are pure functions |
| `window.units` not mutated | ✅ Never read or written |
| `window.lines` not mutated | ✅ Never read or written |
| Map not mutated | ✅ No leaflet/map calls in tested code path |
| Real scenario not mutated | ✅ `w3json` is never modified (deep-freeze on output only) |
| No `/api/sim/*` calls | ✅ No fetch in harness or adapter |
| No backend | ✅ Test is purely in-memory |
| No storage | ✅ No localStorage, no IndexedDB, no sessionStorage |
| No staging state created | ✅ No `_swStagingState` or `_swStagingProposal` |
| Gate 7 not touched | ✅ No commit/apply/confirm path exercised |
| `app.js` not changed | ✅ Docs-only PR |
| `adjudicator-map.js` not changed | ✅ Docs-only PR |
| Imported fixture remains read-only | ✅ `_w3aDeepFreeze` applied to all adapter output |
| All previews are display-only | ✅ `readOnly: true`, `liveMutationAllowed: false` on every preview object |
| No ZIP / no folder picker / no drag-drop | ✅ Not present in tested code path |
| No external scenario catalog re-added | ✅ `scen-catalog-contract.js` not referenced |

All constraints satisfied. No runtime changes were made in this PR.
