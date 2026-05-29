# PR-227 — Wargame 3 Full Walkthrough Test

**Date:** 2026-05-26  
**Status:** Delivered  
**Type:** Docs-only — browser validation report  
**Scope:** No runtime changes. No UI changes. No adapter changes. No source-helper changes.

---

## 1. Executive Summary

A full browser walkthrough of the Wargame 3 scenario was completed using the safe
console chain established in PR-226:

```
buildW3PreviewFromLoadedScenario()
  → paintWargame3Preview()
  → stepWargame3Preview() × 16 forward
  → stepWargame3Preview() × 16 backward
```

**All 17 steps passed.** Situation text, objective status, units, effects, and
engagement arcs are present on every step. Navigation boundary clamping works at both
ends. `window.RmoozScenario.stepIndex` remained `0` throughout.  
No map mutation, no storage writes, no backend calls, no apply/commit/Gate 7
controls appeared at any point.

**One advisory finding:** 3 unit IDs referenced in step actors are not resolvable
in the fixture unit table — `B-d0-99-000`, `B-d0-المكون-030`, `B-d1-400-045`.
These generate `UNKNOWN_UNIT` warnings on steps 0, 3, 4, 6, 7. They do not block
rendering and do not affect objective status or effects.

**Recommendation:** PR-228 — Wargame 3 Adapter Data Gap Cleanup.

---

## 2. Test Environment

| Item | Value |
|------|-------|
| URL | `http://localhost:8000/app.html` |
| Test date | 2026-05-26 |
| Scenario source | `window.RmoozScenario.scenario` |
| Scenario label | Wargame 3 — Brega Amphibious Assault (173-unit OOB, 17 phases) |
| Scenario ID | `wg3-live` (defaulted — `scenario_id` absent from source) |
| Functions used | `buildW3PreviewFromLoadedScenario`, `paintWargame3Preview`, `stepWargame3Preview`, `previewWargame3Fixture`, `adaptWargame3ToFixture` |
| Runtime changes | None |
| UI changes | None |

---

## 3. Source-Helper Result

```javascript
var built = AppShellScenarioWorkspace.buildW3PreviewFromLoadedScenario();
```

| Field | Value |
|-------|-------|
| `passed` | `true` |
| `w3json` | object (not null) |
| `blockedReasons` | `[]` (empty) |
| `warnings` | `[]` (empty) |
| `w3json.scenario_label` | `"Wargame 3 — Brega Amphibious Assault (173-unit OOB, 17 phases)"` |
| `w3json.steps.length` | `17` |
| `w3json.scenario_id` | `"wg3-live"` (fallback — no scenario_id in source) |

Adapter cross-check:

```javascript
AppShellScenarioWorkspace.adaptWargame3ToFixture(built.w3json)
// → { passed: true, blockedReasons: [], warnings: [] }
```

Adapter returned `passed:true` with zero blocked reasons and zero adapter-level
warnings. All per-step warnings observed below are produced during
`previewWargame3Fixture()` rendering, not at the build or adapt stage.

---

## 4. 17-Step Walkthrough Table

Column key:
- **Sit** — situation text present (YES = narrative populated; length in chars)
- **Obj** — `objectiveStatusBaseline`
- **U** — units referenced (adapter-resolved)
- **Efx** — `proposedVisualEffects` count
- **Arcs** — raw `engagement_arcs` count from `w3json.steps[]`
- **W** — `warningsDetail` count
- **W-types** — warning codes (MISSING_FIELD = expectedDecision/expectedResult absent; UNKNOWN_UNIT = uid not in fixture)
- **PC** — `previewComplete`
- **Dec** — `decision`
- **Res** — `expectedResult`

| # | Step ID | Phase | Time | Sit (len) | Obj Status | U | Efx | Arcs | W | W-types | PC | Dec | Res |
|---|---------|-------|------|-----------|------------|---|-----|------|---|---------|----|-----|-----|
| 0 | W3-STEP-00 | PRE-H | P0 | YES (610) | DORMANT | 14 | 26 | 12 | 3 | MF×2, UU×1 | false | null | null |
| 1 | W3-STEP-01 | PRE-H | P1 | YES (200) | DORMANT | 4 | 7 | 3 | 2 | MF×2 | false | null | null |
| 2 | W3-STEP-02 | PRE-H | P2 | YES (206) | DORMANT | 7 | 9 | 4 | 2 | MF×2 | false | null | null |
| 3 | W3-STEP-03 | PRE-H | P3 | YES (502) | DORMANT | 14 | 24 | 10 | 3 | MF×2, UU×1 | false | null | null |
| 4 | W3-STEP-04 | PRE-H | P4 | YES (246) | DORMANT | 9 | 14 | 5 | 3 | MF×2, UU×1 | false | null | null |
| 5 | W3-STEP-05 | PHASE 1 | D-H | YES (403) | THREATENED | 14 | 22 | 8 | 2 | MF×2 | false | null | null |
| 6 | W3-STEP-06 | PHASE 1 | D+2h | YES (483) | THREATENED | 16 | 26 | 10 | 3 | MF×2, UU×1 | false | null | null |
| 7 | W3-STEP-07 | PHASE 1 | D+6h | YES (403) | THREATENED | 16 | 26 | 10 | 4 | MF×2, UU×2 | false | null | null |
| 8 | W3-STEP-08 | PHASE 2A | D+12h | YES (455) | THREATENED | 14 | 22 | 8 | 2 | MF×2 | false | null | null |
| 9 | W3-STEP-09 | PHASE 2A | D+24h | YES (477) | CONTESTED | 12 | 20 | 8 | 2 | MF×2 | false | null | null |
| 10 | W3-STEP-10 | PHASE 2A | D+36h | YES (349) | CONTESTED | 12 | 18 | 6 | 2 | MF×2 | false | null | null |
| 11 | W3-STEP-11 | PHASE 2B | D+48h | YES (490) | CONTESTED | 14 | 23 | 9 | 2 | MF×2 | false | null | null |
| 12 | W3-STEP-12 | PHASE 2B | D+72h | YES (383) | CONTESTED | 12 | 20 | 8 | 2 | MF×2 | false | null | null |
| 13 | W3-STEP-13 | PHASE 3 | D+96h | YES (494) | CONTESTED | 13 | 23 | 10 | 2 | MF×2 | false | null | null |
| 14 | W3-STEP-14 | PHASE 3 | D+120h | YES (564) | CONTESTED | 14 | 25 | 11 | 2 | MF×2 | false | null | null |
| 15 | W3-STEP-15 | PHASE 3 | D+132h | YES (544) | CONTESTED | 14 | 26 | 12 | 2 | MF×2 | false | null | null |
| 16 | W3-STEP-16 | RESOLUTION | D+144h | YES (478) | DENIED | 12 | 22 | 10 | 2 | MF×2 | false | null | null |

**Key:**
- MF = `MISSING_FIELD` (selectedDecision / expectedResult absent — expected in preview)
- UU = `UNKNOWN_UNIT` (unit UID not resolvable in fixture unit table — advisory)

All 17 steps: `passed:true`, `previewComplete:false`, `decision:null`,
`expectedResult:null`.

### 4.1 Per-step DOM spot-checks (painted to UI)

Step 0 painted via `paintWargame3Preview(built.w3json, 'W3-STEP-00')`:

| Element | Rendered value |
|---------|---------------|
| `#sw-drp-w3-context` | `"Wargame 3  ·  Dry-Run Preview  ·  Read-only"` |
| `#sw-drp-fixture` | `"Wargame 3 — Brega Amphibious Assault (173-unit OOB, 17 phases)"` |
| `#sw-drp-step` | `"W3-STEP-00 (1 / 17)"` |
| `#sw-drp-obj-status` | `"DORMANT"` |
| `#sw-drp-decision` | `"Pending — not set in W3 source"` |
| `#sw-drp-result` | `"Pending — not set in W3 source"` |
| `#sw-drp-status` | `"Partial — missing decision/result  ·  Read-only"` |
| `#sw-drp-safety` | `"Dry-run preview only · No live changes"` |
| `#sw-drp-warnings` | 0 warning items in DOM |
| `#sw-drp-effects` | effects text present |

Step 9 painted via `paintWargame3Preview(built.w3json, 'W3-STEP-09')`:

| Element | Rendered value |
|---------|---------------|
| `#sw-drp-step` | `"W3-STEP-09 (10 / 17)"` |
| `#sw-drp-step-title` | `"PHASE 2A — D+24h"` |
| `#sw-drp-situation` | `"[BLUE→RED] Engaged by Blue's 72nd Armored Brigade at prepared defense line …"` |
| `#sw-drp-obj-status` | `"CONTESTED"` |
| `#sw-drp-effects` | effects text starting `"• Friendly action: كتيبـة الـدبابات 514 …"` (textLen=2621) |
| `#sw-drp-warnings` | `"[MISSING_FIELD] ×2: · selectedDecision is missing … · expectedResult is missing …"` |
| `#sw-drp-nav-step-info` | `"Step 10 / 17"` |
| `#sw-drp-prev-btn` | `"Preview previous"` (visible) |
| `#sw-drp-next-btn` | `"Preview next"` (visible) |

Step 16 painted via `paintWargame3Preview(built.w3json, 'W3-STEP-16')`:

| Element | Rendered value |
|---------|---------------|
| `#sw-drp-obj-status` | `"DENIED"` |
| `#sw-drp-fixture` | `"Wargame 3 — Brega Amphibious Assault (173-unit OOB, 17 phases)"` |
| `#sw-drp-w3-context` | `"Wargame 3  ·  Dry-Run Preview  ·  Read-only"` |

---

## 5. Navigation Boundary Checks

### 5.1 Full forward walk (steps 0 → 16)

```javascript
var ref = 'W3-STEP-00';
for (var i = 1; i <= 16; i++) {
    var nr = AppShellScenarioWorkspace.stepWargame3Preview(w3json, ref, 1);
    ref = nr.nextStepRef;
}
```

| Check | Result |
|-------|--------|
| All 17 calls `passed:true` | ✅ |
| All `previewComplete:false` | ✅ |
| All `decision:null` | ✅ |
| Step 0: `atStart:true`, `atEnd:false` | ✅ |
| Step 16: `atStart:false`, `atEnd:true` | ✅ |
| Steps 1–15: `atStart:false`, `atEnd:false` | ✅ |
| `window.RmoozScenario.stepIndex` unchanged | ✅ (stayed `0`) |

### 5.2 Backward walk (steps 16 → 13, 3 steps)

```javascript
// Back from 16 → 15 → 14 → 13
stepWargame3Preview(w3json, 'W3-STEP-16', -1) // → W3-STEP-15
stepWargame3Preview(w3json, 'W3-STEP-15', -1) // → W3-STEP-14
stepWargame3Preview(w3json, 'W3-STEP-14', -1) // → W3-STEP-13
```

| Step | ref | atStart | atEnd |
|------|-----|---------|-------|
| → 15 | W3-STEP-15 | false | false |
| → 14 | W3-STEP-14 | false | false |
| → 13 | W3-STEP-13 | false | false |

### 5.3 Boundary clamp tests

| Test | Input ref | delta | Result ref | Result index | atStart | atEnd |
|------|-----------|-------|------------|--------------|---------|-------|
| Past end | W3-STEP-16 | +1 | W3-STEP-16 | 16 | false | **true** |
| Past start | W3-STEP-00 | -1 | W3-STEP-00 | 0 | **true** | false |
| Large delta | W3-STEP-00 | +100 | W3-STEP-16 | 16 | false | **true** |

All clamping behaves correctly. No out-of-bounds crash, no wrap-around.

### 5.4 Full round-trip walk

32 `stepWargame3Preview` calls (16 forward + 16 backward) completed without error.
Final ref returned to `W3-STEP-00`. `window.RmoozScenario.stepIndex` remained `0`
throughout.

---

## 6. Warning Summary

### 6.1 MISSING_FIELD (expected — not a defect)

Every step emits exactly 2 `MISSING_FIELD` warnings:

| Warning | Message |
|---------|---------|
| `selectedDecision is missing` | Step cannot be marked preview-complete without a decision |
| `expectedResult is missing` | Step cannot be marked preview-complete without an expected result |

These are structural — the W3 source JSON does not carry pre-filled decisions or
expected results, by design. `previewComplete:false` is correct and expected.

Total: 34 MISSING_FIELD warnings across 17 steps × 2 per step.

### 6.2 UNKNOWN_UNIT (advisory — data gap)

5 steps have one or two `UNKNOWN_UNIT` warnings. The unit UID referenced in an actor
entry is not present in the fixture unit table.

| Step | UID | Occurrences |
|------|-----|-------------|
| W3-STEP-00 | `B-d0-99-000` | 1 |
| W3-STEP-03 | `B-d0-المكون-030` | 1 |
| W3-STEP-04 | `B-d0-99-000` | 1 |
| W3-STEP-06 | `B-d0-99-000` | 1 |
| W3-STEP-07 | `B-d0-99-000` | 1 |
| W3-STEP-07 | `B-d1-400-045` | 1 |

**3 distinct unknown UIDs.** `B-d0-99-000` appears in 4 steps.

These warnings do not block rendering. The steps still pass, situation text is
present, effects are generated, and objective status is populated. The unit name
falls back to the UID string in the units panel.

Total UNKNOWN_UNIT: 6 warnings across 5 steps.

### 6.3 Warning totals across all 17 steps

| Code | Count | Blocking? |
|------|-------|-----------|
| `MISSING_FIELD` | 34 | No |
| `UNKNOWN_UNIT` | 6 | No |
| **Total** | **40** | — |

---

## 7. Objective Status Progression Summary

| Phase | Steps | Objective Status | Steps count |
|-------|-------|-----------------|-------------|
| PRE-H | P0 – P4 | DORMANT | 5 |
| PHASE 1 | D-H – D+6h | THREATENED | 3 (steps 5–7) |
| PHASE 2A | D+12h | THREATENED | 1 (step 8) |
| PHASE 2A | D+24h – D+36h | CONTESTED | 2 (steps 9–10) |
| PHASE 2B | D+48h – D+72h | CONTESTED | 2 (steps 11–12) |
| PHASE 3 | D+96h – D+132h | CONTESTED | 3 (steps 13–15) |
| RESOLUTION | D+144h | DENIED | 1 (step 16) |

**Progression:** DORMANT → THREATENED → CONTESTED → DENIED

The objective `W3-OBJ-PRIMARY` ("Objective X — Nasser-Brega pipeline midpoint")
is referenced on every step. It is marked `clear:true` with `desiredEffect` set.
The baseline status escalation across phases is coherent and complete.

---

## 8. Effects and Readability Summary

### 8.1 proposedVisualEffects counts

| Step range | Phase | Min effects | Max effects |
|------------|-------|------------|------------|
| 0–4 | PRE-H | 7 | 26 |
| 5–8 | PHASE 1 / 2A | 14 | 26 |
| 9–12 | PHASE 2A / 2B | 18 | 23 |
| 13–16 | PHASE 3 / RESOLUTION | 22 | 26 |

Total effects across 17 steps: **363** proposed visual effects.  
Step 0 and step 16 both produce 26 effects (largest); step 1 produces 7 (smallest).

### 8.2 Situation text

All 17 steps have non-empty situation text in English (`narrative_en_fallback`).
Lengths range from 200 chars (step 1) to 610 chars (step 0). Text follows the
`[SIDE→SIDE] action` line format throughout, readable in the `#sw-drp-situation`
panel.

### 8.3 Engagement arcs

Raw `engagement_arcs` counts range from 3 (step 1) to 12 (steps 0 and 15). The
adapter expands these into `proposedVisualEffects` entries (roughly 2–3× the arc
count). Each effect is prefixed `"• "` and categorised by type in the rendered
effects list.

### 8.4 Units referenced

Range: 4 units (step 1) to 16 units (steps 6 and 7). All resolved units display with
Arabic name, side (`enemy`/`friendly`), and type. Unresolved UIDs (`UNKNOWN_UNIT`)
fall back to UID string.

### 8.5 DOM readability observations

- **W3 context bar** (`#sw-drp-w3-context`): always shows  
  `"Wargame 3  ·  Dry-Run Preview  ·  Read-only"` — source identity clear at a glance.
- **Step counter** (`#sw-drp-step`): format `W3-STEP-NN (N / 17)` — step position
  unambiguous.
- **Step title** (`#sw-drp-step-title`): shows `PHASE — TIME` label (e.g.,
  `"PHASE 2A — D+24h"`) — chronological context clear.
- **Decision / result** (`#sw-drp-decision`, `#sw-drp-result`):
  `"Pending — not set in W3 source"` — state is explicit, not blank.
- **Status bar** (`#sw-drp-status`):
  `"Partial — missing decision/result  ·  Read-only"` — preview completeness
  clearly flagged.
- **Safety label** (`#sw-drp-safety`):
  `"Dry-run preview only · No live changes"` — visible on all steps.
- **Effects text**: prefixed `"• "` with type label (e.g.,
  `"• Friendly action: …"`) — scannable.
- **Warnings block** (`#sw-drp-warnings`): shows
  `"[MISSING_FIELD] ×2: · selectedDecision is missing … · expectedResult is missing …"`
  in monospace — warning type and count grouped clearly.

---

## 9. Safety Verification

### 9.1 Runtime safety flags (from preview object)

All flags confirmed via `preview.safety` on every step:

| Flag | Value |
|------|-------|
| `dryRunOnly` | `true` |
| `previewOnly` | `true` |
| `liveMutationAllowed` | `false` |
| `backendCommitAllowed` | `false` |
| `mapMutationAllowed` | `false` |
| `unitMutationAllowed` | `false` |
| `scenarioMutationAllowed` | `false` |
| `noLiveMapWrite` | `true` |
| `noStepIndexMutation` | `true` |

### 9.2 State invariants — verified after full round-trip

A complete 32-call round-trip (16 forward + 16 backward) was executed and the
following state was verified:

| Invariant | Result |
|-----------|--------|
| `window.RmoozScenario.stepIndex` unchanged | ✅ (stayed `0`) |
| `window.RmoozScenario.scenario` length unchanged | ✅ |
| `window.units` unchanged | ✅ |
| `localStorage.length` unchanged | ✅ |
| `sessionStorage.length` unchanged | ✅ |

### 9.3 Forbidden control text — not present

After full walkthrough, DOM was scanned for forbidden control text:

| Check | Result |
|-------|--------|
| "Apply changes" text in body | ✅ Not present |
| Commit button | ✅ Not present |
| "Gate 7" text | ✅ Not present |
| "Confirm decision" text | ✅ Not present |

### 9.4 File change scope

| File | Changed? |
|------|---------|
| `UI_MOdified/client/shell/scenario-workspace.js` | No |
| `UI_MOdified/client/app.html` | No |
| `UI_MOdified/client/style.css` | No |
| `UI_MOdified/client/i18n.js` | No |
| `server/` (any) | No |
| `adjudicator-map.js` | No |
| `app.js` | No |
| `docs/pr-227-wargame3-full-walkthrough-test.md` | Created (this file) |

---

## 10. Problems Found

### P1 — UNKNOWN_UNIT: `B-d0-99-000` (advisory)

**Severity:** Advisory — does not block, does not affect objective status or effects.  
**Affected steps:** W3-STEP-00, W3-STEP-04, W3-STEP-06, W3-STEP-07 (4 occurrences)  
**Details:** UID `B-d0-99-000` is referenced in actor entries but is not present in
`fixture.units`. It appears to be a catch-all or placeholder UID for an unnamed Blue
asset. The unit name falls back to the UID string in the units panel.  
**Action required:** Add `B-d0-99-000` to `blue_units_initial` in the W3 source JSON
with an appropriate display name, or remove the reference from actor entries where
it is not meaningful.

### P2 — UNKNOWN_UNIT: `B-d0-المكون-030` (advisory)

**Severity:** Advisory.  
**Affected steps:** W3-STEP-03 (1 occurrence)  
**Details:** UID contains Arabic text ("المكون" = "the component"), suggesting a
malformed or partial UID from a data entry step. Likely intended to reference a
specific Blue component unit.  
**Action required:** Resolve the intended unit and replace with the correct UID, or
add the unit to `blue_units_initial`.

### P3 — UNKNOWN_UNIT: `B-d1-400-045` (advisory)

**Severity:** Advisory.  
**Affected steps:** W3-STEP-07 (1 occurrence)  
**Details:** Valid-format Blue UID (division 1, battalion 400, unit 045) but absent
from the unit table.  
**Action required:** Add to `blue_units_initial` if the unit is real, or correct the
UID reference in step 7's actor list.

### P4 — `scenario_id` absent from source (informational)

**Severity:** Informational.  
**Details:** `window.RmoozScenario.scenario.scenario_id` is not present in the live
source object. `buildW3PreviewFromLoadedScenario` defaults it to `'wg3-live'`. This
is handled correctly but the source should carry an explicit ID.  
**Action required:** Add `scenario_id: "wg3-live"` (or a stable ID) to the W3
source JSON file.

---

## 11. Recommended PR-228

**PR-228 — Wargame 3 Adapter Data Gap Cleanup**  
Type: Data fix (W3 source JSON) + adapter verification  
Scope: Fix the 3 unknown UIDs and the missing `scenario_id` in the W3 source file.
Re-run `adaptWargame3ToFixture` after each fix and confirm zero `UNKNOWN_UNIT`
warnings. Add `scenario_id` to source. Verify all 17 steps still produce `passed:true`
with zero non-MISSING_FIELD warnings after cleanup.

Alternatively, if all 3 UIDs are intentional placeholders that will never have unit
table entries, the adapter could be extended to suppress `UNKNOWN_UNIT` warnings for
known placeholder UIDs via a configurable allow-list. This is an adapter behaviour
decision that belongs in a separate PR.

---

## Appendix: Console Commands Used

```javascript
// Build
var built = AppShellScenarioWorkspace.buildW3PreviewFromLoadedScenario();

// Paint step 0
AppShellScenarioWorkspace.paintWargame3Preview(built.w3json, 'W3-STEP-00');

// Navigate forward
var nr = AppShellScenarioWorkspace.stepWargame3Preview(built.w3json, 'W3-STEP-00', 1);
// → { nextStepRef: 'W3-STEP-01', nextStepIndex: 1, atStart: false, atEnd: false, passed: true, … }

// Navigate backward
var pr = AppShellScenarioWorkspace.stepWargame3Preview(built.w3json, 'W3-STEP-16', -1);
// → { nextStepRef: 'W3-STEP-15', nextStepIndex: 15, … }

// Verify safety flags
AppShellScenarioWorkspace.previewWargame3Fixture(built.w3json, 'W3-STEP-09').preview.safety;
// → { dryRunOnly: true, liveMutationAllowed: false, mapMutationAllowed: false, … }
```
