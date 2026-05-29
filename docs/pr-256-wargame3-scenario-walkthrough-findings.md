# PR-256 — Wargame 3 Scenario Walkthrough Findings

**Date:** 2026-05-27
**Type:** Verification / findings report — no production code changes
**Test file:** `test-pr-256.js` (29/29 PASS)
**Depends on:** PR-252 (objective coord pipeline), PR-253 (circleMarker paint), PR-254 (full walkthrough), PR-255 (ops ledger)

---

## 1. Executive Summary

Wargame 3 is **ready for read-only operator walkthrough**.

`buildWargame3MapPreviewReadinessReport(w3json)` returns `ready_for_walkthrough`.

All 17 scenario steps (W3-STEP-00 through W3-STEP-16) render correctly in the read-only preview pipeline:

- Unit preview markers update per step.
- Movement trails update per transition.
- Objective highlight (circleMarker, pixel-radius) is visible on every step.
- Ops ledger / event log provides structured context for every step.
- Nav buttons and jump selector work without mutation.

**This walkthrough is read-only only.** No live scenario mutation occurs. No apply/commit path exists. No simulation or adjudication engine is connected. Gate 7 controls are not present.

---

## 2. Current Capability

| Capability | Status |
|---|---|
| 17-step W3 walkthrough | ✅ All 17 steps build and paint |
| Unit preview markers | ✅ Count varies per step (4–12) |
| Movement trails | ✅ 31 total trails across 13/16 transitions |
| Objective highlight (circleMarker) | ✅ Present on all 17 steps |
| Objective coordinate | ✅ lat=29.74 / lon=19.55 — real, not invented |
| Ops ledger / event log | ✅ 9–10 structured rows per step |
| Top/bottom nav (prev/next) | ✅ Verified forward and backward |
| Jump selector | ✅ Verified direct jump to any step |
| Old overlay clears before repaint | ✅ 16 layer-group removals in 17-step walk |
| AMBER RIDGE / non-W3 hides event log | ✅ Confirmed by `_paintToDOM` hide path |
| Production file unchanged | ✅ No scenario-workspace.js / app.js / adjudicator-map.js changes |

---

## 3. Step-by-Step Findings

All values are live-verified from `buildScenarioStepPreview` + `buildWargame3ReadOnlyMapOverlayData` + `paintWargame3ReadOnlyMapOverlay` in `test-pr-256.js`.

| Step | Phase / Summary | Markers | Trails | Obj Status | OHC | Notes |
|---|---|---|---|---|---|---|
| W3-STEP-00 | PRE-H — P0 | 12 | 0 | DORMANT | 1 | No previous step → 0 trails. First step in walkthrough. |
| W3-STEP-01 | PRE-H — P1 | 4 | 0 | DORMANT | 1 | Quiet pre-deployment. Only 4 markers (reduced force visible). |
| W3-STEP-02 | PRE-H — P2 | 7 | 0 | DORMANT | 1 | Quiet. 7 markers. No delta from step-00 yet produces trails. |
| W3-STEP-03 | PRE-H — P3 | 12 | 0 | DORMANT | 1 | Last 0-trail step. Full 12 markers restored. |
| W3-STEP-04 | PRE-H — P4 | 9 | 1 | DORMANT | 1 | First movement visible. Pre-H deployment begins. |
| W3-STEP-05 | PHASE 1 — D-H | 12 | 3 | THREATENED | 1 | Phase 1 opens. Objective becomes THREATENED. Good demo step. |
| W3-STEP-06 | PHASE 1 — D+2h | 12 | 3 | THREATENED | 1 | Sustained Phase 1 activity. |
| W3-STEP-07 | PHASE 1 — D+6h | 12 | 2 | THREATENED | 1 | Phase 1 conclusion. Trails reduce before Phase 2A surge. |
| **W3-STEP-08** | **PHASE 2A — D+12h** | **12** | **4** | **THREATENED** | **1** | **Strongest visual step. Peak trails (4). Primary demo step.** |
| W3-STEP-09 | PHASE 2A — D+24h | 12 | 3 | CONTESTED | 1 | Objective transitions to CONTESTED. Key status change step. |
| W3-STEP-10 | PHASE 2A — D+36h | 12 | 2 | CONTESTED | 1 | Phase 2A continues under contested objective. |
| W3-STEP-11 | PHASE 2B — D+48h | 12 | 3 | CONTESTED | 1 | Phase 2B opens. 3 trails. |
| W3-STEP-12 | PHASE 2B — D+72h | 12 | 2 | CONTESTED | 1 | Phase 2B sustained. |
| W3-STEP-13 | PHASE 3 — D+96h | 12 | 2 | CONTESTED | 1 | Phase 3 opens. Still contested. |
| W3-STEP-14 | PHASE 3 — D+120h | 12 | 1 | CONTESTED | 1 | Late Phase 3. Trail count falls. |
| W3-STEP-15 | PHASE 3 — D+132h | 12 | 2 | CONTESTED | 1 | Phase 3 continuation. |
| W3-STEP-16 | RESOLUTION — D+144h | 12 | 3 | DENIED | 1 | Final step. Objective denied. Scenario concludes. |

**Total movement trails:** 31  
**Transitions with trails:** 13 / 16  
**Transitions without trails:** 3 (W3-STEP-00→01, W3-STEP-01→02, W3-STEP-02→03)

---

## 4. Best Demonstration Steps

### Primary: W3-STEP-08 — PHASE 2A — D+12h

- **12 markers** — full force visible  
- **4 movement trails** — peak trail count across the entire scenario  
- **1 objective highlight** — Objective X at lat=29.74 / lon=19.55  
- **Objective status: THREATENED** — tension at its highest before contested transition  
- **Ops ledger: 10 rows** — STEP + OBJ[THREATENED] + 4 UNIT + overflow(+10 more) + EFFECT[22] + 2 WARN  

This step provides the richest visual combination: maximum trail activity, full marker count, and a named threat-status at the objective. It is the best single-step demonstration of W3 capability.

### Supporting: W3-STEP-05 — PHASE 1 — D-H

- **12 markers, 3 trails** — Phase 1 opens  
- **First THREATENED objective status** — shows the status changing from DORMANT  
- Good for demonstrating the DORMANT → THREATENED boundary transition  

### Supporting: W3-STEP-09 — PHASE 2A — D+24h

- **12 markers, 3 trails** — full activity sustained  
- **Objective status: CONTESTED** — captures the THREATENED → CONTESTED transition from step-08  
- **Ops ledger: 10 rows** — same structure, different status  
- Best for demonstrating objective status progression alongside step-08  

### Closing: W3-STEP-16 — RESOLUTION — D+144h

- Shows final DENIED objective outcome  
- 3 trails confirm continued activity at resolution  
- Natural end-of-walkthrough demo moment

---

## 5. Quiet / Early-Phase Steps

Steps **W3-STEP-00 through W3-STEP-03** have **zero movement trails**.

This is expected behavior, not a bug:

- W3-STEP-00 has no previous step to compute a delta against — trails require a `previousPreview` to compare coordinate changes.
- W3-STEP-01 through W3-STEP-03 are pre-deployment (PRE-H) steps where no significant unit movement has yet occurred relative to the step before.
- All four steps still show unit preview markers and the objective highlight.
- The ops ledger produces valid STEP/OBJ/UNIT/EFFECT/WARN rows for all four steps.

**This is not a blocker.** Quiet PRE-H steps are accurate to the scenario structure. An operator viewing these steps sees the initial force disposition before operational movement begins.

W3-STEP-04 (PRE-H — P4) is the **first step with visible movement** (1 trail), marking the beginning of pre-H deployment activity.

---

## 6. Objective Findings

| Property | Value |
|---|---|
| Objective ID | `W3-OBJ-PRIMARY` |
| Objective name | Objective X (Nasser-Brega pipeline midpoint) |
| Source field | `w3json.obj.coord` |
| Source value | `[19.55, 29.74]` (GeoJSON `[lon, lat]`) |
| Rendered lat | 29.74 |
| Rendered lon | 19.55 |
| Coordinate confidence | direct (no mapping required) |
| Marker type | `L.circleMarker` (pixel radius 10px) — not a range/weapon/sensor circle |
| Marker class | `sw-w3-preview-obj` |
| Objective highlight count | 1 on all 17 steps |
| Objective is cleared on nav | Yes — cleared with `_w3PreviewLayer` each step |

**Coordinate pipeline (PR-252/253):**
```
w3json.obj.coord [19.55, 29.74]
  → _w3aLonLatToStartLoc → fixture.objectives[0].location
  → buildScenarioStepPreview → resolvedObjectives[0].location
  → buildWargame3ReadOnlyMapOverlayData → overlay.objectiveHighlights[0]
  → paintWargame3ReadOnlyMapOverlay → L.circleMarker([lat, lon])
```

**Objective status progression across the walkthrough:**

| Status | Steps |
|---|---|
| DORMANT | W3-STEP-00 through W3-STEP-04 |
| THREATENED | W3-STEP-05 through W3-STEP-08 |
| CONTESTED | W3-STEP-09 through W3-STEP-15 |
| DENIED | W3-STEP-16 |

The status changes are reflected in the ops ledger OBJ row for each step. The objective is never hidden and never incorrectly placed.

---

## 7. Movement Findings

| Metric | Value |
|---|---|
| Total movement trails | 31 |
| Transitions with trails | 13 / 16 |
| Transitions without trails | 3 (W3-STEP-00→01, 01→02, 02→03) |
| Strongest transition | W3-STEP-07→08 with 4 trails |
| Max clutter risk | Low (maxTrailsInTransition=4, clutterRisk not flagged) |
| Average trails per transition | 1.94 |
| Friendly trails | 1 |
| Enemy trails | 30 |

Movement trails are **read-only dashed preview lines**. They represent coordinate deltas between consecutive steps — units that changed position since the previous step. They are painted by `paintWargame3ReadOnlyMapOverlay` into `_w3PreviewLayer` as `L.polyline` elements.

**No live unit movement occurs.** No `window.units` or `window.lines` are used. No `window.RmoozScenario.stepIndex` is mutated. The trails are derived entirely from `previousPreview.unitsReferenced` vs `currentPreview.unitsReferenced` coordinate deltas inside `buildWargame3ReadOnlyMapOverlayData`.

---

## 8. Ops Ledger Findings

The `_buildW3EventLog(p, warnsArr)` function produces a tabular ops ledger for every W3 preview step. The ledger has columns: **Time / Type / Source / Message**.

### Row structure per step

| Row type | Rule | Typical count |
|---|---|---|
| STEP | Always present — stepSummary or situation first line | 1 per step |
| OBJ | Present when objectiveStatusBaseline is set | 1 per step (all 17 steps have it) |
| UNIT | Up to 4 named units, then overflow row (`+N more`) | 5 per step (4+1 overflow) |
| EFFECT | Present when proposedVisualEffects.length > 0 | 1 per step |
| WARN | One per missingDataWarning (from preview.warningsDetail) | 2 per step |

### Verified for W3-STEP-08 (10 rows)

| Row | Type | Source | Time | Message |
|---|---|---|---|---|
| 1 | STEP | PREVIEW | PHASE 2A | PHASE 2A — D+12h |
| 2 | OBJ | PREVIEW | PHASE 2A | THREATENED — Objective X (Nasser-Brega pipeline midpoint) |
| 3 | UNIT | ENEMY | PHASE 2A | فرقة المشاة الآلية 4 / mech_inf_div |
| 4 | UNIT | ENEMY | PHASE 2A | سرب طائرات عمودية هجومية (12) / strike |
| 5 | UNIT | ENEMY | PHASE 2A | كتيبة هندسة ميدان آلية 403 / mech_bn |
| 6 | UNIT | ENEMY | PHASE 2A | كتيبة حرب الكترونية 405 / ew_bn |
| 7 | UNIT | PREVIEW | PHASE 2A | +10 more (14 unitsReferenced total, capped at 4) |
| 8 | EFFECT | PREVIEW | PHASE 2A | Text-only preview effects available: 22 |
| 9 | WARN | PREVIEW | PHASE 2A | selectedDecision is missing — step cannot be marked preview-complete |
| 10 | WARN | PREVIEW | PHASE 2A | expectedResult is missing — step cannot be marked preview-complete |

### Verified for W3-STEP-09 (10 rows)

| Row | Type | Source | Time | Message |
|---|---|---|---|---|
| 1 | STEP | PREVIEW | PHASE 2A | PHASE 2A — D+24h |
| 2 | OBJ | PREVIEW | PHASE 2A | CONTESTED — Objective X (Nasser-Brega pipeline midpoint) |
| 3 | UNIT | ENEMY | PHASE 2A | فرقة المشاة الآلية 4 / mech_inf_div |
| 4 | UNIT | ENEMY | PHASE 2A | كتيبة حرب الكترونية 405 / ew_bn |
| 5 | UNIT | ENEMY | PHASE 2A | 10 مدمرات / destroyer |
| 6 | UNIT | ENEMY | PHASE 2A | السرب 11 ميج 29 / fighter_ad |
| 7 | UNIT | PREVIEW | PHASE 2A | +8 more (12 unitsReferenced total, capped at 4) |
| 8 | EFFECT | PREVIEW | PHASE 2A | Text-only preview effects available: 20 |
| 9 | WARN | PREVIEW | PHASE 2A | selectedDecision is missing — step cannot be marked preview-complete |
| 10 | WARN | PREVIEW | PHASE 2A | expectedResult is missing — step cannot be marked preview-complete |

### Safety properties confirmed

- **No `new Date()` / `Date.now()`** — time token is sliced from `stepSummary` before ` — `, never from system clock.
- **No COMBAT / CASUALTY / DETECTION / WEAPON row types** — these event categories do not exist in `_buildW3EventLog`.
- **No `fetch()` / `localStorage` / `/api/sim/`** — ledger is built entirely from the in-memory preview object.
- **No `window.units` / `window.RmoozScenario` mutation** inside `_buildW3EventLog`.
- **Ledger is sufficient for read-only operator walkthrough.** An operator can understand phase, objective status, active units, and preview effects from the ledger alone.

---

## 9. Remaining Gaps Before Controlled Live Execution

The following are **real gaps** that must be resolved before W3 can proceed to controlled live apply/commit.

| Gap | Detail | Impact |
|---|---|---|
| `selectedDecision` missing | All 17 steps emit this MISSING_FIELD warning. The preview cannot be marked preview-complete. | Blocks any future controlled-apply guard that checks preview-complete. |
| `expectedResult` missing | Same — all 17 steps. | Same as above. |
| effectHints are text-only | `proposedVisualEffects` are counted in the EFFECT ledger row but not spatially rendered on the map. Effects are preview text, not geo-overlays. | Not a walkthrough blocker, but limits visual fidelity. |
| No controlled live apply path | No apply/commit/confirm UI exists. Gate 7 controls are absent by design. | Required before any live execution. |
| No adjudication/simulation engine connection | `_buildW3EventLog` and `buildWargame3ReadOnlyMapOverlayData` work from static fixture data. No sim engine is queried. | Required before outcomes can be computed. |
| No operator approval path | No operator identity, confirmation dialog, or approval record. | Required before PR-257+ controlled-apply PRs. |

**Not listed as gaps (resolved):**

- ~~Objective coordinates missing~~ — resolved in PR-252/253. lat=29.74 / lon=19.55 is real data.
- ~~Objective not visible on map~~ — resolved in PR-253 (circleMarker paint).
- ~~Walkthrough not ready~~ — resolved in PR-254 (ready_for_walkthrough).
- ~~Ops ledger not functional~~ — resolved in PR-255 (10 rows per step, correct types).

---

## 10. Safety Boundary Confirmation

All safety invariants were verified by `test-pr-256.js` (V07, V15, V16, V17):

| Invariant | Status |
|---|---|
| No live map/unit/line/scenario mutation | ✅ Confirmed |
| `window.RmoozScenario.stepIndex` unchanged | ✅ Remains 8 throughout |
| `window.units` not mutated (same array reference) | ✅ Confirmed |
| `window.RmoozScenario` not replaced | ✅ Confirmed |
| Raw `w3json` not mutated | ✅ Confirmed |
| No `localStorage` / `sessionStorage` | ✅ Not present in any exercised function |
| No `fetch()` / `XMLHttpRequest` | ✅ Not present |
| No journal / AI / simulation calls | ✅ Not present |
| No apply / commit / confirm / execute / Gate 7 | ✅ Not present |
| `app.js` unchanged | ✅ No PR-256 marker found |
| `adjudicator-map.js` unchanged | ✅ No PR-256 marker found |
| `scenario-workspace.js` unchanged | ✅ No PR-256 marker found |

---

## 11. Recommended Next PR

### PR-257 — Wargame 3 Selected Decision / Expected Result Source Audit

**Reason:**

Every one of the 17 W3 steps emits two MISSING_FIELD warnings:
- `selectedDecision is missing — step cannot be marked preview-complete`
- `expectedResult is missing — step cannot be marked preview-complete`

Before RMOOZ can support any form of controlled execution, these fields must be resolved. This requires answering:

1. Does `wargame3.json` contain `selectedDecision` / `expectedResult` fields at the step level?
2. If yes — does `adaptWargame3ToFixture` drop them?
3. If no — must these be provided by a future adjudication layer (post-apply)?
4. What is the minimum shape of these fields for `previewComplete` to be `true`?

This audit should produce a contract doc (similar to `pr-228-wargame3-adapter-data-gap-cleanup.md`) that defines whether the data gap is in the source, the adapter, or the adjudication layer. It does not require UI changes and does not require live execution.

**Do not recommend** UI polish, new panels, or styling as the next PR — there is no display blocker currently.

---

## Appendix: Audit Values

From `test-pr-256.js` live run (2026-05-27):

```
readiness:                  ready_for_walkthrough
stepCount:                  17
totalMovementTrails:        31
transitionsWithTrails:      13 / 16
maxTrailsInTransition:      4 (W3-STEP-07→08)
averageTrailsPerTransition: 1.94
markerTotal (all steps):    176
effectHintTotal (all steps):327
objectivesWithDirectCoord:  1
objectiveCoord:             lat=29.74 lon=19.55 (source: w3json.obj.coord)
step-08 evl rows:           10
step-09 evl rows:           10
OBJ status step-08:         THREATENED
OBJ status step-09:         CONTESTED
```
