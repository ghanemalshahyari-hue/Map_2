# Live Scenario Workspace Integration Audit — PR-287L1

**Date:** 2026-05-29
**Status:** AUDIT ONLY — no code changes
**Scope:** `/Users/engcode/Desktop/Map_2/UI_MOdified/`
**Reason:** After PR-287L0 hid the W3 dry-run, the live workflow still feels disconnected. This audit explains why and prescribes PR-287L2.

---

## 1. The user complaint, restated

The Live Scenario Step Navigator is visible, but the workspace does not *read* as one connected live screen. Live cards, navigation, decision action, and identity feel like loose tiles arranged in flat order — not a single live workflow.

---

## 2. Current DOM layout map (top-down inside `#scenario-workspace-panel`)

After hiding W3 dry-run in PR-287L0, the visible top-down order is:

| # | Line | ID | Category | Notes |
|---|---|---|---|---|
| 1 | 943 | `.sw-readonly-strip` | static | read-only lock pill |
| 2 | 954 | `.sw-briefing-hdr` | static | "Scenario Briefing" header text |
| 3 | 964 | `.sw-w3-section-hdr` | **DRY-RUN hidden** | (PR-287L0) |
| 4 | 975 | `#sw-w3-load-bar` | **DRY-RUN hidden** | (PR-287L0) |
| 5 | 994 | `#sw-drp-section` | **DRY-RUN hidden** | (PR-287L0) |
| 6 | **1331** | `#sw-meta-card` | LIVE (scenario meta) | reads `sc.scenario_label`, steps.length, etc. |
| 7 | 1361 | `#sw-brfg-card` | LIVE (briefing) | reads `sc.purpose_*`, `sc.end_state_*`, `sc.constraints`, `sc.assumptions` |
| 8 | **1406** | `#sw-nav-card` | LIVE **(Step Navigator)** | reads step counter + phase; **buried below briefing** |
| 9 | 1463 | `#sw-wt-card` | LIVE (walkthrough — repaints 4 sub-cards) | |
| 10 | 1626 | `#sw-sps-card` | LIVE (step phase summary) | |
| 11 | 1656 | `#sw-sn-card` | LIVE (step narrative) | |
| 12 | 1669 | `#sw-fr-card` | LIVE (force ratio) | |
| 13 | 1695 | `#sw-dp-card` | LIVE (decision point snapshot) | |
| 14 | **1725** | `#sw-live-decision-card` | LIVE (PR-286L decision action) | **buried between #sw-dp-card and #sw-obj-card** |
| 15 | 1758 | `#sw-obj-card` | LIVE (objective) | |
| 16 | 1788 | `#sw-bls-card` | LIVE (BLS) | |
| 17 | 1808 | `#sw-fs-card` | LIVE (force summary strip) | |
| 18 | 1837 | `#sw-bf-card` | LIVE (blue force) | |
| 19 | 1853 | `#sw-rf-card` | LIVE (red force) | |
| 20 | **1895** | `#spt-card` | **MOCK** (hardcoded PHASES) | painted from `PHASES` array, lines 224–231 |
| 21 | **1906** | `#oid-card` | **MIXED** (6 live, 3 mock) | Operator Intent Draft |
| 22 | **1920** | `#apc-card` | **MOCK** (only phase tag live) | AI Proposal Card |
| 23 | **1934** | `#pra-card` | **MOCK** (Approve/Reject/Hold) | Proposal Review Actions |
| 24 | **1955** | `#dps-card` | **MOCK** (mirrors praSelection) | Decision Preview Summary |
| 25 | 1973 | `#uild-card` | static | UI Locale/Direction info |
| 26 | 2048 | `#sw-dp-loader-row` | **DPKG developer** | Decision Package fixture loader |
| 27 | 2073 | `#sw-dp-manifest-card` | **DPKG hidden** | unhidden only when DPKG loaded |
| 28 | 2106 | `#sw-dp-step-card` | **DPKG hidden** | |
| 29 | 2153 | `#sw-dp-units-card` | **DPKG hidden** | |
| 30 | 2195 | `#sw-dp-source-card` | **DPKG hidden** | |
| 31 | 2225 | `#sw-dpkg-step-list-card` | **DPKG hidden** | |
| 32 | 2250 | `#sw-dpkg-diagnostics` | **DIAG hidden** | collapsible |
| 33 | 2700 | `#sw-scenario-source-section` | **SOURCE** | Local JSON + External Catalog subcards (PR-283) |
| 34 | (end) | `.sw-invariants` | static | footer badges |

### Visual problems immediately apparent
1. **No single parent** groups items 6–19 as "the live workspace." They are siblings of mock items 20–24, DPKG items 26–31, and the source section item 33.
2. **Live identity cards (#sw-meta-card, #sw-brfg-card) sit above** the Live Step Navigator — the user has to scroll past briefing to find the navigator, then keep scrolling to find live decision action.
3. **`#sw-live-decision-card` is buried** at item 14, surrounded by snapshot cards. It is *not* visually adjacent to the Step Navigator (item 8).
4. **Mock cards (items 20–24)** sit *after* the real live cards but *before* the source/diagnostic sections — they look like "more live cards" but are not.
5. **`#sw-dp-loader-row` (DPKG)** at item 26 is *visible* by default and looks like a live control to a naive operator.

---

## 3. Current live repaint flow

There are **two repaint code paths** with different scope and no clear contract between them:

### Path A — `refresh()` (line 15137)
Called externally (scenario load events, panel-show hooks, app shell ticks). Full sweep, ~22 paint calls including all live cards + all 4 mock cards + decision packages.

### Path B — `goToStep(newIdx)` (lines 699–722)
The **only writer of `window.RmoozScenario.stepIndex`**. Called by Step Navigator buttons (prev/next/first/last) and the playback timer. Does **NOT** call `refresh()`. Instead calls a curated subset:

```
goToStep(newIdx)
 ├─ window.RmoozScenario.stepIndex = newIdx
 ├─ previewStepIndex = null
 ├─ paintStepNavigator()
 ├─ paintScenarioOverview()
 ├─ paintPhaseTimeline()        ← mock; repaints but emits same hardcoded list
 ├─ paintIntentCard()
 ├─ paintProposalCard()         ← only phase tag actually updates
 ├─ paintStepSummaryCard()
 ├─ paintNarrativeCard()
 ├─ paintDecisionPointCard()
 ├─ paintForceRatioCard()
 ├─ paintWalkthroughCard()
 ├─ paintActionsCard()
 ├─ paintScenarioOverlay()      ← live map rebuild for new step
 └─ paintDecisionPackageCards()
```

**`paintLiveDecisionActionCard()` is missing from `goToStep`.** This is a verified PR-286L oversight (function not added to the navigator chain). Until the next `refresh()` tick, the PR-286L card shows stale options after a step advance.

`paintProposalActions` (`#pra-card`) and `paintDecisionSummary` (`#dps-card`) are also missing from `goToStep` — but they are mock so step-coherence is moot. `praSelection` is module-local and persists across step changes, which is itself a defect of the mock UI but out of scope here.

---

## 4. What is truly live (drives from `window.RmoozScenario`)

Confirmed LIVE — reads `window.RmoozScenario.scenario` and/or active step via `resolveLiveValue`, `getActiveStep`, `getActiveStepIndex`:

| Card / Element | Source paths |
|---|---|
| `#sw-name`, `#sw-status`, `#sw-phase` (paintScenarioOverview) | `sc.scenario_label`, `sc.name`, `step.objective_status_baseline`, `step.phase` |
| `#sw-meta-card` | `sc.scenario_label`, `sc.steps.length`, `sc.phase_table`, `sc.map_bbox`, `sc.schema_variant` |
| `#sw-brfg-card` | `sc.purpose_en/_ar`, `sc.end_state_en/_ar`, `sc.constraints[]`, `sc.assumptions[]`, `sc.model_version`, `sc.ported_from` |
| `#sw-nav-card` (Step Navigator) | `sc.steps.length`, `step.time_label`, `step.phase` |
| `#sw-wt-card` (Walkthrough) | scenario label + 10+ step fields |
| `#sw-obj-card` | `sc.obj.name`, `sc.obj.target_depth_km`, `sc.obj.carver`, `sc.obj.coord` |
| `#sw-bls-card` | `sc.bls_template[]` |
| `#sw-fs-card`, `#sw-bf-card`, `#sw-rf-card` | `sc.blue_units_initial[]`, `sc.red_units[]` |
| `#sw-sps-card`, `#sw-sn-card`, `#sw-dp-card`, `#sw-fr-card` | active step fields |
| `#sw-act-details` (actions) | `step.actors[]`, `step.affected[]` |
| `#sw-live-decision-card` (PR-286L) | `getActiveLiveStepContext()`, `extractLiveDecisionOptions(step)` |
| `_swScenarioOverlay` (map) | `sc.blue_unit_step_coords`, `sc.red_unit_step_coords` per step |

**`sc.scenario_id` is NOT read by any live card.** Only `scenario_label` / `name` surface. Same for `step.title` / `step.kind_native` — used only by W3 dry-run adapter, never by live cards.

---

## 5. What is mock or static

Confirmed MOCK / partial mock — has live-card classification problems:

### `#spt-card` Scenario Phase Timeline — paintPhaseTimeline (line 233)
- **Verdict: MOCK.** Iterates hardcoded `PHASES` array (lines 223–231: briefing, planning, proposal-review, decision, dryrun-preview, aar) with fixed statuses `current` / `not-started`. **Active scenario step does NOT change which phase is marked current.**
- Source comment line 223: *"In-memory placeholder phases — no backend, no mutation, no persistence."*
- Verdict: should leave the LIVE area or be rebuilt to read `sc.phase_table`.

### `#oid-card` Operator Intent Draft — paintIntentCard (line 305)
- **Verdict: MIXED.** Out of 9 rows, 6 are wired to `resolveLiveValue` (phase, obj.name, decision_point_baseline, narrative_en_fallback, force_ratio_baseline, phase_line_km_baseline) and 3 are pure i18n placeholder (constraints, safety, status) because their `liveKey` is null.
- Carries `.oid-draft-badge` "Draft only".
- Source comment line 289: *"In-memory placeholder fields — no backend, no mutation, no persistence."*
- Verdict: keep visible but with a clearer "MOCK" badge until fully wired, or move out of the primary live area.

### `#apc-card` AI Proposal Card — paintProposalCard (line 367)
- **Verdict: MOCK.** Only `apc-value-linked-intent` row pulls live phase string. All other 7 rows (title, source, summary, assumptions, risks, operator-action, status) are static i18n.
- Carries `.apc-mock-badge` "Mock preview".
- i18n.js line 1412: `'apc-value-source': 'Mock preview — not connected to AI service'`.
- Verdict: should NOT be in the LIVE area until a real AI bridge exists. Hide or relocate.

### `#pra-card` Proposal Review Actions — paintProposalActions (line 424)
- **Verdict: MOCK.** Mirrors `praSelection` module-local string ('approve' | 'reject' | 'hold' | null). Three big buttons (Approve / Reject / Hold) that look like live commit actions but write nothing.
- Carries `.pra-preview-badge` "Preview only".
- Click handler comment line 472: *"No persistence. No API calls. No mutation. No event log."*
- This is the card that PR-287L0 verifier C18 caught as an "Approve" button. **It looks dangerously live.** Memory note `feedback_ai_sim_boundary_rules.md` already locked the boundary.
- Verdict: most urgent demotion. Hide from production area until rebuilt as the real live decision write path (could be merged with PR-286L's `#sw-live-decision-card`).

### `#dps-card` Decision Preview Summary — paintDecisionSummary (line 506)
- **Verdict: MOCK.** Mirrors `praSelection`. Four static rows + explicit safety-note row reading `dps-safety-note` "Preview only. No decision is recorded and the scenario is unchanged." (i18n.js line 1456).
- Verdict: hide alongside `#pra-card`.

### `#uild-card` UI Locale / Direction
- **Verdict: static / informational.** Shows current locale + RTL/LTR. Not pretending to be live.
- Verdict: keep, but move out of the live area into a Developer / Footer block.

---

## 6. What is hidden dry-run (PR-287L0 already handled)

- `<div class="sw-w3-section-hdr">` (line 964)
- `#sw-w3-load-bar` (line 975)
- `#sw-drp-section` (line 994) — wraps `#sw-drp-amber-badge`, `#sw-drp-nav`, `#sw-drp-jump-row`, `#sw-drp-w3-context`, `#sw-drp-step-summary`, `#sw-drp-unit-scope`, `#sw-drp-event-log`, `#sw-drp-decision-options`, `#sw-drp-selection-review`, `#sw-drp-bottom-nav`

All hidden via `hidden` attribute. Inner JS exports stay available for console use. **No further dry-run demotion needed in PR-287L2.**

---

## 7. Suspicious-card classification answers (specific to user's question)

| Card | Reads live? | Mock/static? | Keep in live area? | Rebuild later? | Action now |
|---|---|---|---|---|---|
| `#spt-card` | ❌ no | yes (hardcoded PHASES) | no | yes (read `sc.phase_table`) | move to developer block OR add MOCK badge |
| `#oid-card` | partial | mixed (6 live, 3 static) | maybe | yes | keep with clearer MOCK label, or move out |
| `#apc-card` | only phase tag | yes (mock badge present) | no | yes (real AI bridge — long way off) | move out of live area |
| `#pra-card` | ❌ no | yes (Approve/Reject/Hold buttons LOOK live) | **NO — actively confusing** | yes (merge into `#sw-live-decision-card`) | demote / hide |
| `#dps-card` | ❌ no | yes (mirrors praSelection) | no | merge into `#sw-live-decision-card` | demote / hide |
| `#sw-dp-card` | ✅ yes (step.decision_point_baseline) | no | **yes (primary live)** | already live | leave |
| `#sw-live-decision-card` | ✅ yes (PR-286L) | no | **yes (primary live)** | already live | fix the `goToStep` repaint omission |

---

## 8. Root cause of "not combined"

**Six concrete causes, ordered by impact:**

### Cause A — No single live parent container
All live cards are flat siblings of `#scenario-workspace-panel`. There is no `<section id="sw-live-workspace">` wrapping items 6–19 in the layout map. Without a parent, CSS can't visually group them, and the DOM ordering puts mock and dry-run siblings adjacent.

### Cause B — Step Navigator is buried beneath identity cards
`#sw-nav-card` (line 1406) sits **below** `#sw-meta-card` and `#sw-brfg-card`. The first thing the operator sees is metadata and briefing prose — not "what step am I on, what can I do." The natural top-of-workspace control is two cards down.

### Cause C — Live Decision Action card is buried in the middle
`#sw-live-decision-card` (line 1725) is between `#sw-dp-card` and `#sw-obj-card`. The operator's primary action — selecting a decision — is **not visually adjacent** to the navigator that put them on this step. The action and the navigator should be co-located.

### Cause D — Mock cards interleaved with live cards
`#spt-card`, `#oid-card`, `#apc-card`, `#pra-card`, `#dps-card` are siblings of all the live cards. They look identical (same `.builder-card.sw-card` styling, same parent). An operator cannot visually tell which card is real and which is a placeholder. `#pra-card`'s Approve button is especially dangerous.

### Cause E — `paintLiveDecisionActionCard` not in `goToStep` chain
After clicking Next/Prev, the navigator updates, the meta/briefing/walkthrough cards update, the map updates — but the **Live Decision Action card shows stale options** until `refresh()` fires. This breaks the "one live screen" feel: the operator clicks Next and the action card lags.

### Cause F — No workspace-level scenario header
`sc.scenario_id`, `sc.scenario_label`, current step + phase, and load source are scattered across three duplicated card-body rows (`#sw-name`, `#sw-meta-label-val`, `#sw-wt-scenario`). There is no sticky header reading "Brega Amphibious Assault · Step 4 of 17 · briefing". The operator has to look in different cards to answer "what scenario, what step."

### Bonus — `#sw-dp-loader-row` is visible by default
The Decision Package fixture loader (a developer / training tool) is shown at the top of the DPKG section without a collapse — looks like a primary action.

---

## 9. Recommended fix scope — PR-287L2

**Title:** Live Scenario Workspace Consolidation.

**Goal:** Move/restructure existing live elements into one clear parent section. **No new behavior. No new data sources. No dry-run. No backend. No Gate 7.** This is a structural / clarity PR.

### 9.1 Add a single parent `<section id="sw-live-workspace">`
Wrap items 6–14 (and selected later items) into one parent section. Inside it, the order should be:

```
<section id="sw-live-workspace">
  1.  #sw-live-scenario-header     ← NEW (Cause F): scenario name + id + step + phase + load source
  2.  #sw-nav-card                  ← MOVED UP (Cause B)
  3.  #sw-live-decision-card        ← MOVED UP (Cause C): primary action right under navigator
  4.  #sw-meta-card                 ← (live identity, demoted below navigator)
  5.  #sw-brfg-card
  6.  #sw-wt-card
  7.  #sw-sps-card, #sw-sn-card, #sw-dp-card, #sw-fr-card  (live step snapshot row)
  8.  #sw-obj-card, #sw-bls-card    (live objective row)
  9.  #sw-fs-card, #sw-bf-card, #sw-rf-card                (live force row)
</section>
```

### 9.2 Move mock-masquerading cards out of the live area
Wrap items 20–24 (`#spt-card`, `#oid-card`, `#apc-card`, `#pra-card`, `#dps-card`) plus `#uild-card` into a separate `<section id="sw-secondary-cards">` placed AFTER `#sw-live-workspace` and BEFORE the source/diagnostic sections. This section should be collapsed-by-default with a "These cards are placeholders" disclaimer.

(`#pra-card`'s Approve/Reject/Hold buttons stay technically reachable but no longer sit in the primary live area.)

### 9.3 Fix the `paintLiveDecisionActionCard` step-incoherence
Add one line to `goToStep`:
```js
paintLiveDecisionActionCard();   // PR-287L2: keep step-scoped live decision card coherent
```
This is the one tiny behavior change needed.

### 9.4 Add a new live scenario header `#sw-live-scenario-header`
A small static-styled strip at the top of `#sw-live-workspace` showing:
- `sc.scenario_label || sc.name` (live)
- `sc.scenario_id` (live, currently never surfaced — small badge)
- `Step N of T · phase` (live)
- `sc.model_version` + `sc.ported_from` (live, optional small subtitle)

This consolidates the answers to "what scenario / what step / what source" into one glance.

### 9.5 Hide `#sw-dp-loader-row` by default
Move it under the same collapsible "Developer Tools" wrapper as `#sw-dpkg-diagnostics` (which is already collapsed).

### Strict non-goals for PR-287L2
- Do NOT delete mock cards. Demote only.
- Do NOT rewrite `paintIntentCard` / `paintProposalCard` to fully wire live data — those are separate PRs.
- Do NOT add a real decision commit path. PR-286L's in-memory store is correct for now.
- Do NOT unhide W3 dry-run.
- Do NOT add import button (that is PR-286L0).
- Do NOT add live status field (that is PR-287L).
- Do NOT touch wargame3.json, app.js, adjudicator-map.js, or backend.

### Files PR-287L2 will touch
- `UI_MOdified/client/app.html` — DOM restructure (move, do not delete). +1 new header element. +2 new section wrappers. +1 collapsed wrapper for developer tools.
- `UI_MOdified/client/shell/scenario-workspace.js` — +1 `paintLiveDecisionActionCard()` call in `goToStep`. +1 `paintLiveScenarioHeader()` function (~30 lines) + export. +1 call in `refresh()` and `goToStep()`.
- `UI_MOdified/client/style.css` — `.sw-live-workspace` parent styling, `.sw-secondary-cards` muted styling, `.sw-live-scenario-header` strip.
- `UI_MOdified/client/i18n.js` — header labels EN/AR (~6 keys each).

### Expected test file
`test-pr-287L2.js` covering:
- Single parent `#sw-live-workspace` exists and wraps all live cards
- DOM order: header → nav → live decision → meta → briefing → ...
- Mock cards live inside `#sw-secondary-cards`
- `paintLiveDecisionActionCard` called by `goToStep`
- `paintLiveScenarioHeader` reads `sc.scenario_label`, `sc.scenario_id`, current step + phase
- All previous live card paint functions unchanged
- No dry-run usage in new code
- No scenario / unit / map mutation
- No fetch / backend / storage / Gate 7
- wargame3.json, app.js, adjudicator-map.js unchanged
- PR-286L exports still present

### Browser verification
- One clear live workspace section visible at top
- Header shows scenario name + id + step + phase
- Click Next → header + decision action update in one cycle (no lag)
- Mock cards collapsed by default, "placeholders" label visible
- `#sw-dp-loader-row` not visible by default
- Scenario Source section still present below
- Zero console errors

---

## 10. Exact next coding PR scope

**PR-287L2 — Live Scenario Workspace Consolidation**

Single-PR scope per §9.1 – §9.5. Structural / layout / wiring only. No new live data sources, no new actions, no backend. The one functional change is wiring `paintLiveDecisionActionCard` into `goToStep` so the live decision card stays coherent on step navigation. Everything else is DOM move + 1 new header element + collapsed-by-default wrappers.

This PR alone should turn the workspace from "loose tiles" into "one live screen" without changing any behavior or data path.

After PR-287L2, the natural follow-ups (in priority order, none committed):
1. **PR-287L3** — Wire `#spt-card` to `sc.phase_table` (real live phase timeline) — replaces hardcoded PHASES.
2. **PR-286L0** — Live Scenario Import button (originally next after PR-287L0; defer until consolidation lands).
3. **PR-287L** — Live Step Status Baseline (status field per step in `_liveOperatorWorkflowState`).
4. **PR-288L** — Merge `#pra-card` / `#dps-card` into `#sw-live-decision-card` once the live decision write path is solid.

---

## 11. Quick browser observations (from PR-287L0 verify run)

The PR-287L0 browser verify run already exercised the live navigator and confirmed:
- ✅ `#sw-nav-next` click advances `window.RmoozScenario.stepIndex` 0 → 1
- ✅ Live meta card present, live cards still in DOM
- ✅ `paintScenarioOverlay` still triggered by `goToStep` (line 720)
- ✅ Live Decision Action card visible and accepts inject-test-scenario flow

The **specific defect found by source analysis** — `paintLiveDecisionActionCard` missing from `goToStep` — could not be directly observed in the PR-287L0 run because that run injected the test scenario AFTER the navigator click. To observe the defect:
1. Inject a test scenario with `decision_options` on step 0 AND step 1.
2. Trigger `refresh()` once so live decision card shows step-0 options.
3. Click navigator Next → `goToStep(1)` runs.
4. **Observe:** other live cards update; live decision card still shows step-0 options until next `refresh()` tick.

This will be the regression-target test added to `test-pr-287L2.js`.

---

## 12. Summary

**The live workflow is "not combined" because:**
1. No single live parent container.
2. Step Navigator is buried below identity cards.
3. Live Decision Action is buried in the middle of snapshot cards.
4. Mock cards interleave with real live cards.
5. `paintLiveDecisionActionCard` is not in `goToStep`.
6. No workspace-level scenario / step / phase header.

**The fix is structural and one tiny behavior change** — PR-287L2 — consolidating the live cards into one parent, demoting mock cards into a clearly-labelled secondary section, adding a single scenario header, and wiring the live decision card into `goToStep`. No data path changes, no backend, no Gate 7.

---

**End of audit.**
