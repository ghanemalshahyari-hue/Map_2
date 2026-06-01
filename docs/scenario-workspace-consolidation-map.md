# Scenario Workspace — Card Consolidation Map (PR-A, docs-only)

**Status:** docs-only. This file is PR-A. It changes no DOM, no JS, no behavior. It is the shared map that PR-B…PR-F reviewers use to verify every later move respects the contract boundaries.

**Ground truth:** `UI_MOdified/client/app.html` (DOM ids), `UI_MOdified/client/shell/scenario-workspace.js` (paint functions + data sources), `UI_MOdified/server/web-server.js` (import routes). Findings were produced by a read-only mapping pass over those files (line numbers cited inline) and adversarially re-verified for contract attribution and duplication. Not derived from the CMO lessons doc.

---

## 1. Executive Summary

The Scenario Workspace carries **~150 live DOM surfaces** (≈25–35 meaningful cards plus many duplicated sub-fields) across **three data contracts**, not two:

- **Internal adjudication scenario** — `window.RmoozScenario` via `getScenario()` (wargame3.json shape).
- **Decision Package preview** — `_swDecisionPackage` / `_swDecisionSteps` (the external "خطوات صنع القرار" packages), **preview-only by design**.
- **External Scenario Catalog** — `_externalScenarioCatalogSubset` / `_extPreviewEntry` (CSP51 browse metadata), **deferred/disabled**. The original "two-contract" framing cannot express this third source; the map treats it explicitly.

The dominant problem is **intra-contract duplication**, all confirmed in code: the scenario label renders **3×**, active-step `phase` **6×**, the "N of T" step counter **9×**, the live operator step-status badge **3×**, objective-status **6×**, and the per-step briefing is restated across `sw-wt-card` plus four redundant step-detail cards (`sw-sps`/`sw-sn`/`sw-fr`/`sw-dp`). There are **3 confirmed DEAD fields** (`sw-blue-force`, `sw-red-force`, `sw-terrain`) with zero JS readers despite a false `app.html` comment.

Two large regions must be **left intact**: the hidden Wargame-3 Dry-Run Preview block (`sw-drp-*`, removed from production per PR-287L0) and the **locked AI/sim-boundary staging chain** (`sw-diag-staging-card` → `sw-staging-prop`/`drc`/`ac`/`conf`/`fcl`, whose "committed=No / dry-run only / no live mutation" assertions are safety-locked). The legacy mock decision cluster (`oid`/`apc`/`pra`/`dps`) is superseded by the live decision card but is hidden only **after team sign-off**.

The plan sequences six PRs: **PR-A** docs (this file) → **PR-B** zero-behavior visual grouping (+ delete the 3 dead fields) → **PR-C** source/provenance → **PR-D** clock/timeline/navigation → **PR-E** decision/proposal → **PR-F** event log. `Sides & Posture` has **no current card** and is out of scope (a future feature, not a regroup).

---

## 2. Contract Model (the framing, corrected)

You asked for two contracts; verification found **three sources**. Keeping them distinct is the single most important rule for every later PR — most "looks identical" cards are actually different contracts and **must not be merged**.

| Contract | Source object (truth) | Importer / entry | Read/write semantics | Status |
| --- | --- | --- | --- | --- |
| **Internal adjudication scenario** | `window.RmoozScenario.scenario` via `getScenario()` (`sc.steps`, `blue_units_initial`, `red_units`, `bls_template`, `phase_table`, `obj`, `map_bbox`) | `sw-live-scenario-import-card` → `loadLiveScenarioFromJson` (FileReader → sets `window.RmoozScenario`, L15518) | **live** — drives the workspace; `goToStep` writes `stepIndex` | live + read-only views |
| **Decision Package preview** | `_swDecisionPackage` / `_swDecisionSteps` (manifest + `steps/stepXX.json` + `source_trace`) | `sw-local-json-source-card` → `loadDecisionPackagePreview` / `importDecisionPackageJson` | **preview-only** — never written to `window.RmoozScenario`; `read_only`/`no_auto_adjudication` | preview-only |
| **External Scenario Catalog** | `_externalScenarioCatalogSubset` / `_extPreviewEntry` (`entryType==='external_scenario_catalog_entry'`) | `sw-external-catalog-source-card` (selector + preview + trace) | browse metadata only; `conversionReady:false`, `requiresHumanReview:true` | deferred/disabled |

Server note: `web-server.js` exposes `/api/scenario/import` + `/api/scenario/events` + an `fs.watch` watcher, but **none of these is wired to a workspace card today** — the live import path is FileReader-only. Keep them separate (see §7).

**Verification corrections applied:** `uild-card` was mis-tagged (a status value leaked into its contract field) — it is **internal_scenario** (reads `getScenario().blue_units_initial`/`red_units`, L352-353). `sw-external-catalog-source-card` was mis-tagged `decision_package` — it is the **third (external catalog)** contract, which the four-value enum cannot represent.

---

## 3. Full Card-by-Card Table

Curated to the meaningful cards/sections (the ~150 raw surfaces collapse to these; pure sub-field duplicates are summarized in §5). Columns: **Contract** = INT (internal) · DP (decision package) · EXT (external catalog) · BOTH · UI. **Status** = live · preview · read-only (ro) · ui. **Action** = keep/merge/move/hide/rename. **Risk** = if moved.

### → Source & Provenance
| DOM id | Title / purpose | Contract | Status | Action | Duplicate of | Risk | PR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sw-scenario-source-section` | Source section wrapper | BOTH | ro | keep + **rename stale subtitle** ("Preview only" is false — live child mutates memory) | — | low | C |
| `sw-live-scenario-import-card` | Live scenario importer (FileReader→`loadLiveScenarioFromJson`) | INT | live | keep (flatten thin `sw-source-live-primary` wrapper only) | — | low | C |
| `sw-local-json-source-card` | Decision Package importer | DP | preview | **keep separate** (different contract) | — | low | C |
| `sw-external-catalog-source-card` (+ `sw-ext-select/preview/trace`) | External catalog selector/preview/trace | EXT | deferred | **do not touch** | — | — | none |
| `sw-meta-card` | Scenario Metadata (label/steps/phases/schema) | INT | ro | **canonical identity** — absorb legacy summary | `sw-section-scenario` | low | C |
| `sw-legacy-summary-section` / `sw-section-scenario` "Current Scenario" | Legacy name/status/phase/blue/red/terrain dl | INT | ro | **merge → drop** into `sw-meta-card` (holds 3 dead fields) | `sw-meta-card`, `sw-fs-card` | low | C |
| `sw-dpkg-validation-card` | DP import validation | DP | preview | **canonical** — absorb the overlap below | — | med | C |
| `sw-dpkg-readiness-card` | DP package readiness checklist | DP | preview | merge → `sw-dpkg-validation-card` | `sw-dpkg-validation-card` | med | C |
| `sw-dp-source-card` | DP compact validation+warning | DP | preview | merge → `sw-dpkg-validation-card` | `sw-dpkg-validation-card` | med | C |
| `sw-dpkg-source-review-card` | DP source-trace path display (step/geojson/image/report) | DP | preview | keep (distinct path-display) | partial | low | C |
| `sw-wt-health-row` | Per-step data-completeness readout | INT | ro | move here (keep `paintWalkthroughCard` wiring) | — | low | C |

### → Geography & Objective
| DOM id | Title / purpose | Contract | Status | Action | Duplicate of | Risk | PR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sw-obj-card` | Objective Snapshot (name/depth/CARVER/coord) | INT | ro | keep (canonical objective) | — | none | B |
| `sw-bls-card` | BLS / Landing Sites Snapshot | INT | ro | keep (canonical; per-step status follows live step) | — | low | B |
| `sw-nav-overlay-row` | Map overlay toggle (mis-located in navigator) | UI | ui | **move** next to map/geography | — | low | B |
| `sw-live-map-status` | Map overlay state badge | INT | ro | move with overlay toggle | — | low | B |
| `sw-meta-bbox-val` | `map_bbox` row (lives in Metadata dl) | INT | ro | optional move from Metadata | — | low | B |

### → Sides & Posture  *(EMPTY — new surface, deferred)*
No existing card. `posture` appears only as fixture/narrative text (`scenario-workspace.js` L4262/L4456/L6678/L9642), never as a card. **Out of scope** — see §7.

### → Clock & Phases  *(the "overlapping clocks" epicenter)*
| DOM id | Title / purpose | Contract | Status | Action | Duplicate of | Risk | PR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `spt-card` / `spt-phase-list` | Scenario Phase Timeline | INT | ro | **canonical phase surface** | — | med | D |
| `sw-nav-card` / `sw-nav-controls` | Live Step Navigator (writes `stepIndex` via `goToStep`) | INT | live | **canonical LIVE navigator** | — | **high** | D |
| `sw-nav-counter` | Live "N of T" counter | INT | ro | **canonical counter** (kill 8 mirrors) | many | med | D |
| `sw-timeline-hdr` | "Scenario Timeline" header (3rd timeline header) | INT | ro | dedupe into one header | `spt-card`, `sw-nav-card` | low | D |
| `sw-wt-controls` (+ `sw-wt-cmp-strip`, `sw-wt-source-row`) | **Preview** navigator (writes `previewStepIndex`; shares i18n keys with live) | INT | preview | **reconcile or retire** (don't naive-delete) | `sw-nav-controls` | **high** | D |
| `sw-drp-jump-row` / `sw-drp-nav` | DRP preview step jump/nav | DP/preview | preview | **keep separate** (`_drpPreviewSource`) | — | low | (E block) |
| `sw-dpkg-step-list-card` | DP per-step list | DP | preview | keep (step list) | — | low | C/E |

### → Forces & Readiness
| DOM id | Title / purpose | Contract | Status | Action | Duplicate of | Risk | PR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sw-fs-card` | Force Balance (blue/red counts + ratio) | INT | ro | keep (compact header) | — | low | B |
| `sw-bf-card` / `sw-rf-card` | Blue / Red Force rosters | INT | ro | keep rosters (counts dup `sw-fs`) | `sw-fs-card` | low | B |
| `sw-attr-card` | Red Attrition | INT | ro | keep (unique, step-aware) | — | low | B |
| `sw-tempo-card` | Engagement Tempo | INT | ro | keep (unique) | — | low | B |
| `uild-card` | Unit Composition (by domain/echelon) | INT | ro (secondary) | keep (unique breakdown) | — | low | B |
| `sw-live-step-units-card` / `-table` | Live involved-units (PR-289L) | INT | live | keep | — | low | B |
| `sw-dp-units-card` / `sw-dpkg-units-table` | DP imported step units | DP | preview | **keep separate** (different contract, identical-looking) | — | med | — |
| `sw-fr-card` | "Step Effects" (force_ratio/EW/phase_line) — **mis-named** | INT | ro | merge step rows → `sw-wt-kv` | `sw-wt-kv` | low | B/E |

### → Narrative & Brief
| DOM id | Title / purpose | Contract | Status | Action | Duplicate of | Risk | PR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sw-brfg-card` | Scenario Brief (purpose/end-state/constraints/assumptions) | INT | ro | keep (canonical brief; unique data) | — | none | B |
| `sw-wt-card` / `sw-wt-kv` | Live Walkthrough — master per-step briefing dl | INT | ro | **canonical per-step briefing** | — | med | E |
| `sw-sps-card` | Step Summary | INT | ro | merge → `sw-wt-kv` | `sw-wt-kv` | low | B/E |
| `sw-sn-card` | Step Narrative (= `narrative_en_fallback`, exact dup of Situation) | INT | ro | merge → `sw-wt-kv` | `sw-wt-kv` | low | B/E |
| `sw-dp-card` | Decision Point (**read-only** `decision_point_baseline`) | INT | ro | merge → `sw-wt-kv`; **do NOT move to live workflow** | `sw-sps-card` | med | E |
| `sw-act-details` | Actors / Affected (W3-rich) | INT | ro | keep (unique) | — | low | B |

### → Decision & AI Proposal
| DOM id | Title / purpose | Contract | Status | Action | Duplicate of | Risk | PR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sw-live-decision-card` / `-options` | **Live operator decision** (PR-286L; in-memory selection) | INT | live | **anchor** — do not relocate outside PR-E | — | **high** | E |
| `sw-live-step-status-badge` (+ row/actions/summary) | Live step status (decided/skipped/blocked) | INT | live | **canonical status** — drop `sw-nav-status-badge`, `sw-live-scenario-status` mirrors | mirrors | med | E |
| `sw-operator-state-card` + `sw-safety-chip`/`sw-service-chip` | Operator/AI state mirrors | UI | ui | keep (display) | — | low | E |
| `sw-dp-step-card` / `sw-dpkg-step-detail-card` | DP active-step decision (compact + drilldown) | DP | preview | merge **intra-DP** (`sw-dp-step-card` primary) | each other | med | E |
| `sw-diag-staging-card` + `sw-staging-prop`/`drc`/`ac`/`conf`/`fcl` | **LOCKED** AI/sim-boundary staging chain | DP | preview | **do not touch** (only fold `sw-fcl` into header w/ extreme care) | `sw-fcl`↔`sw-conf` | **high** | E (guarded) |
| `sw-drp-section` (+ ~40 children) | Hidden W3 Dry-Run Preview block | DP/preview | hidden | **do not touch / keep hidden** | — | — | none |
| `oid-card` / `apc-card` / `pra-card` / `dps-card` | Legacy **mock** cluster (Draft/Mock/Approve-Reject-Hold) | UI | ui (mock) | hide **after team sign-off** | superseded by `sw-live-decision-card` | low | E (gated) |

### → Event Log & Journal
| DOM id | Title / purpose | Contract | Status | Action | Duplicate of | Risk | PR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `sw-live-event-log-card` / `-table` / `-rows` | **Live operator ledger** (PR-288L, in-memory audit) | INT | live | canonical; group visually | — | med | F |
| `sw-drp-event-log` / `sw-drp-evl-body` | DRP **preview** log ("Not connected to simulation journal") | DP/preview | preview | **keep separate** (never merge data) | — | low | F |
| *(external)* `#event-log` | Workspace-wide ledger **outside** this region | — | — | verify no overlap **before** PR-F | — | — | F (check) |

### → UI-only / no group
`sw-readonly-strip` (lock banner — wording now partially stale), `sw-briefing-hdr` (heading), `sw-w3-section-hdr` / `sw-w3-load-bar` (hidden dev-only W3 load), and the **3 dead fields** `sw-blue-force` / `sw-red-force` / `sw-terrain` (zero JS readers → delete in PR-B).

---

## 4. Proposed 8-Group Final Structure

```
Scenario Workspace
├─ 1. Source & Provenance      [INT + DP + EXT — keep all three importers SEPARATE]
│     canonical identity: sw-meta-card   (absorbs legacy sw-section-scenario)
│     importers: sw-live-scenario-import-card (INT, live) | sw-local-json-source-card (DP, preview) | sw-external-catalog-source-card (EXT, deferred — untouched)
│     DP checks: sw-dpkg-validation-card (canonical) + sw-dpkg-source-review-card
├─ 2. Geography & Objective    [INT]
│     sw-obj-card · sw-bls-card · (map controls: sw-nav-overlay-row + sw-live-map-status)
├─ 3. Sides & Posture          [EMPTY — NEW SURFACE, DEFERRED — builds nothing in PR-A..F]
├─ 4. Clock & Phases           [INT + DP — one phase, one live nav, one counter]
│     spt-phase-list (phase) · sw-nav-controls (LIVE nav) · sw-nav-counter (counter)
│     preview nav sw-wt-controls reconciled/retired; DP nav sw-drp-jump kept separate
├─ 5. Forces & Readiness       [INT + DP — INT force cards vs DP unit roster KEEP SEPARATE]
│     sw-fs-card · sw-bf-card · sw-rf-card · sw-attr-card · sw-tempo-card · uild-card · sw-live-step-units-card
├─ 6. Narrative & Brief        [INT — collapse 4 step-detail cards into the master dl]
│     sw-brfg-card · sw-wt-card/sw-wt-kv (master) ← sw-sps/sw-sn/sw-fr/sw-dp · sw-act-details
├─ 7. Decision & AI Proposal   [INT live + DP preview + LOCKED staging — 3 lineages NEVER cross-merged]
│     LIVE: sw-live-decision-card + sw-live-step-status-badge (canonical)
│     DP:   sw-dp-step-card (← sw-dpkg-step-detail-card)
│     LOCKED: sw-diag-staging-card chain (untouched) · hidden sw-drp-section (untouched) · mock oid/apc/pra/dps (hide after sign-off)
└─ 8. Event Log & Journal      [INT live ledger + DP preview log — separate data sources]
      sw-live-event-log-card (canonical) · sw-drp-event-log (preview, separate)
```

Group flags:
- **Has current cards / regroup-only:** 1, 2, 4, 5, 6, 7, 8.
- **New surface needed (out of scope):** 3 (Sides & Posture). A unified clock in 4 is partly new *layout* but reuses existing cards.
- **Contracts spanned:** 1 = INT+DP+EXT · 4,5,7,8 = INT+DP · 2,6 = INT.

---

## 5. Duplicate / Overlap List + Must-Stay-Separate

### 5a. Confirmed duplicate clusters (28) — keep the primary, retire the rest
**Identity / status (cross-card):**
- **Scenario label ×3** → keep `sw-meta-label-val`; drop `sw-name`, `sw-live-scenario-title` (all `sc.scenario_label || sc.name`).
- **Active step `phase` ×6** → keep `spt-phase-list`; drop `sw-phase`, `sw-live-scenario-phase`, `sw-wt-phase`, `sw-nav-phase-badge`, `sw-sps-phase-val`.
- **Objective status ×6** → keep `sw-wt-status`; drop `sw-status`, `sw-live-scenario-status`, `sw-fr-obj-val`, `sw-sps-obj-val`, `sw-dp-obj-val`.
- **"N of T" counter ×9** → keep `sw-nav-counter`; drop `sw-live-scenario-step`, `sw-nav-step-info`, `sw-wt-step`, `sw-wt-source-idx`, `sw-meta-steps-val`, `sw-drp-step`, `sw-drp-nav-step-info`, `sw-drp-bottom-step-counter`.
- **Live step-status badge ×3** → keep `sw-live-step-status-badge`; drop `sw-live-scenario-status`, `sw-nav-status-badge`.
- **Scenario identity card ×3** → keep `sw-meta-card`; absorb `sw-section-scenario` (legacy) + `sw-live-scenario-header` summary.
- **Blue / Red force counts** → keep `sw-fs-blue-num`/`sw-fs-red-num`; `sw-bf-count`/`sw-rf-count` echo them; **`sw-blue-force`/`sw-red-force` are DEAD** (delete).

**Narrative / step (internal):**
- **Step Summary vs Decision Point vs Walkthrough** → keep `sw-wt-kv`; `sw-sps-card` + `sw-dp-card` are near-total subsets.
- **Step Narrative / Situation** → keep `sw-wt-kv`; `sw-sn-card` is the exact same `narrative_en_fallback`.
- **Step force-ratio / phase-line** → keep `sw-wt-kv`; `sw-fr-card` re-renders the same rows.
- **Live vs preview step indices** → `sw-wt-cmp-strip` + `sw-wt-source-row` exist only to support the duplicate preview nav.
- **Live vs preview prev/next** → keep `sw-nav-controls`; `sw-wt-controls` shares the same i18n keys but different write semantics.

**DRP-internal (preview block — dedupe *inside* the block only):** top/bottom nav mirror (`sw-drp-nav` vs `sw-drp-bottom-nav`); 4 "preview only/not live" captions → one; selection-review vs main rows for expected-result, preview-complete, obj-status, units, COA, effects, warnings, source identity, step title.

**Decision Package-internal:** `sw-dp-step-card` vs `sw-dpkg-step-detail-card` (same active step); `sw-dp-source-card`/`sw-dpkg-validation-card`/`sw-dpkg-readiness-card`/`sw-dpkg-source-review-card`/`sw-dpkg-step-warning` (overlapping checks → `sw-dpkg-validation-card` primary); `sw-fcl-section` re-states `sw-diag-staging-card` gates.

**Legacy mock:** `oid`/`apc`/`pra`/`dps` superseded by `sw-live-decision-card`.

### 5b. Must stay separate (different contracts — never merge)
1. `sw-live-scenario-import-card` (INT, live) **vs** `sw-local-json-source-card` (DP, preview) **vs** `sw-external-catalog-source-card` (EXT) — three importers, three contracts.
2. INT force/unit cards (`sw-fs`/`sw-bf`/`sw-rf`/`uild`/`sw-live-step-units`) **vs** `sw-dp-units-card` (DP) — identical-looking UID/Side/Name tables, different sources.
3. `sw-live-decision-card` (INT live) **vs** `sw-dp-step-card`/`sw-dpkg-step-detail-card` (DP) **vs** `sw-staging-prop-section` (locked) — three decision lineages.
4. `sw-live-event-log-card` (INT live audit) **vs** `sw-drp-event-log` (DP preview log) — same table schema, different lifecycle.
5. `sw-wt-controls` (INT preview nav) **vs** `sw-drp-nav` (DP preview nav) — different sources.
6. `sw-dp-card` (read-only `decision_point_baseline`) **vs** `sw-live-decision-card` (live operator workflow) — do not conflate.
7. `sw-drp-decision-options` (preview display, "FORBIDDEN: apply") **vs** `sw-live-decision-options` (live, writes state).

---

## 6. Safe Consolidation Sequence

| PR | Scope | Behavior change | Risk |
| --- | --- | --- | --- |
| **PR-A** | This doc. 8-group taxonomy, 3 contracts, duplicate clusters, dead fields, locked surfaces. No DOM/JS. | none | none |
| **PR-B** | Introduce 7 static group wrappers; **reparent existing cards by id only** (no rename, no paint_fn change). **Delete the 3 dead fields.** Move map controls (`sw-nav-overlay-row`, `sw-live-map-status`) + `sw-meta-bbox-val` to Geography. Merge the 4 DRP "not live" captions into one (static text). | **none** | low |
| **PR-C** | **Source & Provenance.** Drop legacy `sw-name` + `sw-legacy-summary-section`/`sw-section-scenario` → `sw-meta-card` canonical. Fix stale `sw-scenario-source-section` subtitle. Flatten `sw-source-live-primary`. Consolidate DP validation/readiness/warning → `sw-dpkg-validation-card`. **Keep all 3 importers separate; don't touch External Catalog.** | yes | med |
| **PR-D** | **Clock / timeline / navigation.** Keep `spt-phase-list` (phase), `sw-nav-counter` (counter), `sw-nav-controls` (LIVE nav). Reconcile or retire preview nav `sw-wt-controls` (preserve preview-without-advancing-live). Drop phase/counter mirrors. Dedupe 3 timeline headers. Keep DRP jump + DP step list separate. | yes | **high** |
| **PR-E** | **Decision / proposal / DRP.** `sw-live-decision-card` = single live surface; `sw-live-step-status-badge` = single status (drop mirrors). Merge `sw-dpkg-step-detail-card` → `sw-dp-step-card` (intra-DP). Fold `sw-fcl` into `sw-diag-staging-card` header **with extreme care**. Hide mock cluster **after sign-off**. **Preserve every staging "committed=No/dry-run" assertion verbatim; never cross live/DP/DRP boundaries.** | yes | **high** |
| **PR-F** | **Event log.** Confirm `sw-live-event-log-card` is the single live ledger; group it. Keep `sw-drp-event-log` separate (preserve "Not connected to simulation journal"). **Verify the external `#event-log` is unaffected before any change.** | yes | med |

Rule for PR-B onward: every paint fn captures its target by `getElementById`, so **reparenting is safe iff ids are preserved**. No id renames in PR-B.

---

## 7. Do NOT Build / Touch Yet

**Do not build (not part of consolidation):**
- `Sides & Posture` surface (side intent/alignment/ROE) — no card exists; future feature.
- Doctrine, WRA, IADS, missions/tasking, weather, proficiency, airfield components.
- Priority-4 `.scen` export adapter (CSP51 `.scen` is binary — never parsed).
- **Decision Package → Live converter** (DP is preview-only by design; do not add a path that turns DP data into `window.RmoozScenario`).
- External Scenario Catalog activation (`scen-catalog-contract.js` stays unlinked; selector disabled).
- Server import-pipeline UI wiring (`/api/scenario/import` + SSE `/api/scenario/events`) — keep the FileReader-only live path separate.
- BLS map markers (deferred per memory).
- Gate 7 / any apply/commit/execute for the staging chain (boundary-locked: propose dry-run only, no `/api/sim/commit`).

**Do not touch yet (load-bearing / locked):**
- `sw-diag-staging-card` + `sw-staging-prop`/`drc`/`ac`/`conf` — locked AI/sim boundary; every "committed=No / dry-run / no live mutation / no Gate 7" assertion preserved verbatim.
- `sw-drp-section` (+ children) — hidden W3 dry-run; keep hidden, do not surface or merge.
- `sw-drp-selection-review`, `sw-drp-safety` — safety-critical preview-only rows (hard-coded Dry-run=Yes/Live=No/Commit=No).
- `oid`/`apc`/`pra`/`dps` mock cluster (incl. `pra-actions` Approve/Reject/Hold) — hide only after team sign-off in PR-E.
- `sw-live-decision-card`, `sw-live-event-log-card`, `sw-live-scenario-import-card`, `sw-nav-controls` — live-workflow chokepoints mid-sprint; modify only inside their designated PR.
- `sw-local-json-source-card` (DP importer) + `sw-external-catalog-source-card` (EXT) — separate-contract import wiring; do not merge with the live importer.

---

*Generated as PR-A. Line numbers reflect `scenario-workspace.js` / `app.html` at time of mapping; re-verify before each later PR.*
