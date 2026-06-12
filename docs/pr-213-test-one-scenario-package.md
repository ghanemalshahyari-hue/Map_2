# PR-213 — Test One Scenario Package

**Type:** Test report — documentation only  
**Status:** Proposed  
**Depends on:** PR-210 (Fixture), PR-211 (`buildScenarioStepPreview`), PR-212 (Dry-Run Preview UI)  
**Blocks:** PR-214 (Scenario Structure Corrections)

> **This document records real console-test results from running Exercise AMBER RIDGE through `buildScenarioStepPreview`. No runtime code was modified. No unit was moved. No map was mutated. No scenario state was changed. All results are read-only observations.**

---

## 1. Test Method

All results in this document were produced by calling `window.AppShellScenarioWorkspace.buildScenarioStepPreview(fixture, stepRef)` directly in the browser console against `window.RmoozDryRunFixtures.AMBER_RIDGE` (the static fixture loaded by `scenario-dry-run-fixtures.js`).

**No apply path was exercised. No live scenario was modified. `window.RmoozScenario.stepIndex` was not changed.**

The fixture was run in the following sequence:

1. All 4 steps tested individually by `step_id`.
2. Secondary tests run for edge cases (unknown step, unknown unit, deleted globals, frozen fixture, map markers, forbidden labels, storage/backend usage).

---

## 2. Step-by-Step Test Results

### Step 1 — AMBER-STEP-01 "Movement to Contact"

| Field | Result |
|---|---|
| `passed` | ✅ `true` |
| `previewComplete` | ✅ `true` |
| `situation` parsed | ✅ Full text extracted |
| `selectedDecision` parsed | ✅ Full decision extracted |
| `expectedResult` parsed | ✅ Full result extracted |
| Units referenced | ✅ 4 resolved, 0 unresolved — `1st Recon Platoon (f)`, `Alpha Company 1st Platoon (f)`, `Mortar Section (f)`, `Enemy Forward Observer (e)` |
| Objectives referenced | ✅ 1 — `OBJ RIDGE` (clear: true) |
| Warnings generated | ✅ 0 — step is warning-free |
| Proposed visual effects | ✅ 4 text entries — 3 `friendly_action`, 1 `enemy_counter_action` |
| `readOnly` | ✅ `true` |
| `liveMutationAllowed` | ✅ `false` |
| `safety.mapMutationAllowed` | ✅ `false` |
| `safety.noStepIndexMutation` | ✅ `true` |

**Verdict:** Step 1 is fully preview-complete. RMOOZ read all fields correctly. No gaps.

---

### Step 2 — AMBER-STEP-02 "Contact Made — Decision Required"

| Field | Result |
|---|---|
| `passed` | ✅ `true` |
| `previewComplete` | ✅ `false` (intentional — missing decision and result) |
| `situation` parsed | ✅ Full text extracted |
| `selectedDecision` | ✅ `null` — correctly returned as `null`, not guessed |
| `expectedResult` | ✅ `null` — correctly returned as `null`, not guessed |
| Units referenced | ✅ 5 resolved, 0 unresolved — includes `RED-MOB-01` (enemy reserve) |
| Objectives referenced | ✅ 1 — `OBJ RIDGE` (clear: true) |
| Warnings generated | ⚠️ 3 warnings |
| Proposed visual effects | ✅ 4 text entries — 2 `friendly_action`, 2 `enemy_counter_action` |
| `readOnly` | ✅ `true` |

**Warnings produced:**

| Code | Target | Message |
|---|---|---|
| `MISSING_COORDINATE` | `RED-MOB-01` | Unit "Enemy Mobile Reserve" has no start location |
| `MISSING_FIELD` | `AMBER-STEP-02` | selectedDecision is missing — step cannot be marked preview-complete |
| `MISSING_FIELD` | `AMBER-STEP-02` | expectedResult is missing — step cannot be marked preview-complete |

**Verdict:** `previewComplete: false` correctly applied. Missing fields shown as warnings. No data was guessed. `MISSING_COORDINATE` fires for `RED-MOB-01` because this step references it and its `startLocation` is `null`.

**Note — fixture gap observed:** The fixture's `expectedWarnings` array listed `RED-MOB-01` MISSING_COORDINATE with a note "warning fires if resolver scans all units" but did not explicitly record it as expected in Step 2. The builder fires it correctly for every step that references a unit with `null` startLocation. See §6.

---

### Step 3 — AMBER-STEP-03 "Bypass East via OBJ FORD"

| Field | Result |
|---|---|
| `passed` | ✅ `true` |
| `previewComplete` | ✅ `false` (intentional — empty counter-actions) |
| `situation` parsed | ✅ Full text extracted |
| `selectedDecision` parsed | ✅ Full bypass decision extracted |
| `expectedResult` parsed | ✅ Partial result extracted |
| Units referenced | ✅ 5 resolved, 0 unresolved — includes `BLU-HQ-01` and `RED-MOB-01` (both null coordinates) |
| Objectives referenced | ✅ 1 — `OBJ FORD` (clear: false — ambiguous) |
| Warnings generated | ⚠️ 4 warnings |
| Proposed visual effects | ✅ 4 text entries — all `friendly_action` (correct: no enemy actions defined) |
| `readOnly` | ✅ `true` |

**Warnings produced:**

| Code | Target | Message |
|---|---|---|
| `MISSING_COORDINATE` | `BLU-HQ-01` | Unit "Alpha Company HQ" has no start location |
| `MISSING_COORDINATE` | `RED-MOB-01` | Unit "Enemy Mobile Reserve" has no start location |
| `AMBIGUOUS_OBJECTIVE` | `OBJ-FORD` | Objective "OBJ FORD" is not the primary objective for this phase — requires operator review |
| `INCOMPLETE_FIELD` | `AMBER-STEP-03` | enemyCounterActions is empty — enemy response not defined |

**Verdict:** All four expected warning types fire. `previewComplete: false` because `enemyCounterActions` is empty (`counterOk = false`). Objective marked `clear: false` correctly. No enemy effects in `proposedVisualEffects` because the array is empty in the fixture — correct behaviour.

---

### Step 4 — AMBER-STEP-04 "Consolidation at OBJ FORD"

| Field | Result |
|---|---|
| `passed` | ✅ `true` |
| `previewComplete` | ✅ `true` (all structural fields present) |
| `situation` parsed | ✅ Full text extracted |
| `selectedDecision` parsed | ✅ Full consolidation order extracted |
| `expectedResult` parsed | ✅ Full result extracted |
| Units referenced | ✅ 6 resolved, 0 unresolved — all units present including `BLU-HQ-01` and `RED-MOB-01` |
| Objectives referenced | ✅ 1 — `OBJ FORD` (clear: true — not ambiguous in this step) |
| Warnings generated | ⚠️ 2 warnings (non-blocking coordinate warnings) |
| Proposed visual effects | ✅ 6 text entries — 4 `friendly_action`, 2 `enemy_counter_action` |
| `readOnly` | ✅ `true` |

**Warnings produced:**

| Code | Target | Message |
|---|---|---|
| `MISSING_COORDINATE` | `BLU-HQ-01` | Unit "Alpha Company HQ" has no start location |
| `MISSING_COORDINATE` | `RED-MOB-01` | Unit "Enemy Mobile Reserve" has no start location |

**Verdict:** `previewComplete: true` because all structural fields (decision, result, counter-actions) are present. Coordinate warnings are non-blocking — correct per §6 of PR-210. The operator would see two warnings for `BLU-HQ-01` and `RED-MOB-01` but the step is still considered displayable.

---

## 3. Summary Table

| Step | passed | previewComplete | Units resolved | Objectives | Warnings | Effects |
|---|---|---|---|---|---|---|
| AMBER-STEP-01 | ✅ true | ✅ true | 4 / 4 | OBJ RIDGE | 0 | 4 (text) |
| AMBER-STEP-02 | ✅ true | ❌ false | 5 / 5 | OBJ RIDGE | 3 | 4 (text) |
| AMBER-STEP-03 | ✅ true | ❌ false | 5 / 5 | OBJ FORD [ambig] | 4 | 4 (text) |
| AMBER-STEP-04 | ✅ true | ✅ true | 6 / 6 | OBJ FORD | 2 | 6 (text) |
| **Total** | 4 / 4 | 2 / 4 | 20 / 20 | — | **9** | **18** |

---

## 4. Expected vs Actual Warning Table

The fixture's `expectedWarnings` array defined 6 expected warning entries. The builder generated 9 warnings across all 4 steps. The discrepancy is expected and documented below.

| Expected in fixture | Step(s) | Code | Builder result | Match? |
|---|---|---|---|---|
| `BLU-HQ-01` MISSING_COORDINATE | Step 3 (note says "Step 4") | `MISSING_COORDINATE` | Fired in Step 3 ✅ and Step 4 ✅ | ✅ (both) |
| `RED-MOB-01` MISSING_COORDINATE | "Any step with note" | `MISSING_COORDINATE` | Fired in Step 2 ✅, Step 3 ✅, Step 4 ✅ | ✅ (all three) |
| Step 2 `selectedDecision` | Step 2 | `MISSING_FIELD` | Fired ✅ | ✅ |
| Step 2 `expectedResult` | Step 2 | `MISSING_FIELD` | Fired ✅ | ✅ |
| Step 3 `enemyCounterActions` | Step 3 | `INCOMPLETE_FIELD` | Fired ✅ | ✅ |
| Step 3 `objectivesReferenced` | Step 3 | `AMBIGUOUS_OBJECTIVE` | Fired ✅ | ✅ |

**All 6 expected warning types fired.** The 3 additional warnings (9 − 6) are correct builder behaviour — `MISSING_COORDINATE` fires once per step per null-coordinate unit referenced, not once globally. The fixture `expectedWarnings` undercounted per-step occurrences.

### Warning count reconciliation

| Source | Count |
|---|---|
| Fixture `expectedWarnings` entries | 6 |
| Builder warnings generated | 9 |
| Discrepancy | +3 (all correct — builder fires per-step) |
| False positives (warnings that should not have fired) | 0 |
| Missing warnings (expected but not fired) | 0 |

---

## 5. Secondary Test Results

| Test | Result | Detail |
|---|---|---|
| A — Unknown step ID blocks safely | ✅ PASS | `passed: false`, blockedReason: "step not found for stepRef: NO-SUCH-STEP" |
| B — Unknown unit UID → `UNKNOWN_UNIT` warning | ✅ PASS | Warning fired, `passed: true`, preview returned |
| C — Unknown objective → `UNKNOWN_OBJECTIVE` warning | ✅ PASS | Warning fired, `passed: true`, preview returned |
| D — `window.units` deleted — no throw | ✅ PASS | Builder never reads `window.units`; result `passed: true` |
| E — `window.RmoozScenario` deleted — no throw | ✅ PASS | Builder never reads `window.RmoozScenario`; result `passed: true` |
| F — `window.RmoozScenario.stepIndex` unchanged | ✅ PASS | Before: 0 / After: 0 — no mutation |
| G — Fixture frozen — mutation silently fails | ✅ PASS | `fixtureId` unchanged after attempted write |
| H — No map markers created | ✅ PASS | Leaflet marker count: 163 before / 163 after |
| I — No forbidden labels in `#sw-drp-section` | ✅ PASS | No "apply", "commit", "execute", "run live", etc. found |
| J — No storage/backend in `paintDryRunPreview` source | ✅ PASS | No `localStorage`, `fetch`, `/api/sim`, etc. found |

---

## 6. Gaps Found

### 6.1 Fixture gaps

| Gap | Severity | Detail |
|---|---|---|
| `expectedWarnings` undercounts per-step occurrences | Minor | The fixture lists 6 expected warnings but the builder correctly fires 9. The array documents unique warning scenarios, not per-step occurrences. For PR-213 assertion tests, the array is misleading. Fix: update `expectedWarnings` to list one entry per step per firing (9 entries), or add a `perStep: true` flag to indicate the warning fires each time the unit is referenced. |
| Step 2 `expectedWarnings` note for `RED-MOB-01` is ambiguous | Minor | The note says "warning fires if resolver scans all units" — this confused whether the warning was expected in Step 2. The builder fires it correctly; the note should say "fires in Step 2, 3, 4 (any step that references RED-MOB-01)". |
| `startLocation.lat` and `startLocation.lng` are all `null` | Informational | All units use `null` lat/lng (only description text). Future steps: supply approximate grid coordinates, even fictional ones, so the visual preview can show position descriptions more usefully. |

### 6.2 Builder gaps

| Gap | Severity | Detail |
|---|---|---|
| Ambiguity detection is fixture-flag-driven, not data-driven | Minor | `AMBIGUOUS_OBJECTIVE` fires only when `missingDataExpected` contains `'objectivesReferenced_ambiguous'`. This requires the fixture author to manually flag ambiguity. A future improvement would detect ambiguity automatically (e.g., when an objective appears in a step that is not the step's primary phase objective). |
| `previewComplete` requires non-empty `enemyCounterActions` | Informational | Step 3's `previewComplete: false` is caused by empty `enemyCounterActions`. This is correct per the contract definition. However, for some step types (e.g., pure reconnaissance), enemy counter-actions may legitimately be unknown. A future `stepType` field could allow counter-action to be optional for certain types. |
| No `stepType` field | Informational | The fixture steps have no `type` field (e.g., `"recon"`, `"assault"`, `"consolidation"`). Adding step types would allow the builder to adjust which fields are required for `previewComplete`. |

### 6.3 UI gaps

| Gap | Severity | Detail |
|---|---|---|
| PR-212 shows Step 1 only — no navigation | Known / planned | Steps 2–4 warnings are not visible in the UI. Step navigation is deferred to PR-214+. Operators can view other steps via console only at this point. |
| Warnings for Steps 2–4 are not visible in the current panel | Known | `#sw-drp-warnings` shows "None" because Step 1 has no warnings. To see Step 2–4 warnings, the operator would need to call `paintDryRunPreview` with a different step ID, which is not yet wired. |
| `missingDataWarnings` in the preview object duplicates the `warnings` array messages | Minor | Both `preview.missingDataWarnings` (string array) and `result.warnings` (object array) carry the same information. The paint function uses `result.warnings` (object array) which is more useful. The `missingDataWarnings` string array could be removed in a future builder revision to reduce redundancy. |
| `proposedVisualEffects` type labels (`friendly_action`, `enemy_counter_action`) are raw code strings | Minor | PR-212 displays them as `[friendly_action] …`. Future UI improvement: map these to human-readable labels (e.g., "Friendly action", "Enemy response") or i18n keys. |

---

## 7. What Should Be Fixed Before Testing a Real Imported Scenario

Before running `buildScenarioStepPreview` against a real imported decision package (rather than the controlled AMBER RIDGE fixture), the following should be addressed:

| Priority | Fix | Reason |
|---|---|---|
| **High** | Update `expectedWarnings` array to reflect per-step firing | Test assertions in PR-213+ will fail if they compare the array length to actual warning counts |
| **High** | Add step navigation to the UI | Without navigation, Steps 2–4 are invisible to operators in the panel |
| **Medium** | Add `stepType` field to fixture steps | Needed to relax `previewComplete` requirements for recon/observe steps with no enemy counter-action |
| **Medium** | Replace flag-driven ambiguity detection with data-driven detection | The `objectivesReferenced_ambiguous` flag in `missingDataExpected` is a workaround; real packages won't have this flag |
| **Medium** | Supply fictional lat/lng values for fixture units | All coordinates are `null`; once map overlay is approved, positions will be needed |
| **Low** | Map `proposedVisualEffects` type labels to i18n keys in UI | Display-only improvement |
| **Low** | Remove redundant `missingDataWarnings` string array from preview object | Reduces duplication; `result.warnings` object array is sufficient |

---

## 8. Recommendations for PR-214

| PR | Type | Description |
|---|---|---|
| **PR-214** | Docs + fixture fix | **Fixture corrections** — update `expectedWarnings` to 9 per-step entries; add `stepType` field to each step; supply fictional lat/lng coordinates for all units; fix `RED-MOB-01` note in Step 2 expected warning. |
| **PR-215** | Runtime (read-only) | **Step navigation** — add read-only previous/next navigation to `#sw-drp-section`. Must use a local `_drpActiveStepId` variable, not `window.RmoozScenario.stepIndex`. Must not mutate fixture. |
| **PR-216** | Pure JS | **Ambiguity detection improvement** — derive `AMBIGUOUS_OBJECTIVE` from step data rather than `missingDataExpected` flag. Requires a `primaryObjectiveIds` field on the step or fixture. |
| **PR-217** | Test | **Test with real imported package** — run `buildScenarioStepPreview` against a real imported DP fixture (DP_01, DP_02, or DP_03) after fixing the gaps above. Document importer gaps. |

---

## 9. Safety Checklist

- [x] All tests run via console — no runtime code modified
- [x] `window.RmoozScenario.stepIndex` confirmed unchanged before and after all tests (0 → 0)
- [x] `window.units` deletion test: no throw — builder never reads `window.units`
- [x] `window.RmoozScenario` deletion test: no throw — builder never reads `window.RmoozScenario`
- [x] Fixture frozen — `Object.freeze()` confirmed: mutation attempt silently no-ops
- [x] Map marker count: 163 before, 163 after — zero markers created by builder
- [x] No forbidden labels in `#sw-drp-section`: "apply", "commit", "execute", "run live", "push to map" — none found
- [x] No `localStorage`, `sessionStorage`, `fetch`, `/api/sim/*` in `paintDryRunPreview` source
- [x] All 4 steps returned `passed: true` — no unexpected blocks
- [x] All 9 generated warnings are correct — 0 false positives, 0 missed expected warnings
- [x] `proposedVisualEffects` confirmed text-only — 18 entries across 4 steps, all `{ type, description, unitUid }` only
- [x] No runtime code introduced in this PR
- [x] No UI changes introduced in this PR
- [x] No staging state created
- [x] No storage used
- [x] No fetch or backend
- [x] No apply path
- [x] Gate 7 remains forbidden
- [x] Staging-state expansion remains paused
- [x] `app.js` / `adjudicator-map.js` untouched
