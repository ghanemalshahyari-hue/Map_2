# COA Visualization & Wargame Design — DECISION DOCUMENT

**Status: PROPOSED — implementation paused after MDMP-EXTERNAL-1/G-1 until the owner confirms the
decisions marked `DECISION D#` below.** (2026-06-11)

Scope: how RMOOZ turns a reviewed Operational Brief (from DOCX, JSON, or the external MDMP
bundle) into **AI-assisted COA possibilities**, wargames them BLUE vs RED under WHITE control,
and lets the commander adjust draft unit positions — without ever bypassing review, mutating
the baseline scenario, or presenting AI output as tactical truth.

Global rule (unchanged, enforced): **AI understands → user reviews → RMOOZ validates → RMOOZ
generates.** Everything below is marked *AI-assisted possibilities / needs review*.

---

## 1. BLUE / RED / WHITE roles

| Role | What it is | Maps to existing RMOOZ |
|---|---|---|
| **BLUE** | Friendly commander — the operator. Owns BLUE COAs, approves plans, drags draft units. | Operator session (`operator_id` already stamped on commits); `blue-team-agent` proposes, never decides. |
| **RED** | Enemy — plays reaction/counteraction. | `red-team-agent` (exists, perspective-flipped, rule-validated, no mutation). Could be a second human later. |
| **WHITE** | Control/adjudication cell — rules on each engagement, owns ground truth, writes the ledger. | `adjudicator-agent` **proposes** → operator Accept/Reject/Hold → `POST /api/sim/commit` → durable journal. WHITE = the *role* wrapped around that existing boundary. |

- WHITE is a **role, not a side** — the NEUTRAL side stays as-is (civilians/infrastructure).
- In **auto-run** mode WHITE's accept step is performed automatically **but still journaled** with
  `operator_id: "WHITE-AUTO"` so the ledger never has silent state changes.
- `DECISION D1` — RED player default: AI red-team-agent (recommended) vs second operator seat.
- `DECISION D2` — may WHITE auto-adjudicate in auto-run, or must every ruling stay human-gated
  even there? (Recommended: auto allowed in auto-run only, always journaled, reversible by replay.)

## 2. COA count behavior

- **BLUE:** default **2** candidates (matches the external app's output), operator may request up
  to **5**; minimum 1. External MDMP import yields exactly its 2 — never padded with invented COAs.
- **RED:** the doctrinal pair — **most likely** + **most dangerous** enemy action (the external
  step-4 `Most_likely_enemy_action` feeds the first; most-dangerous is AI-assisted and flagged).
- Exactly **one approved BLUE COA** proceeds to scenario draft; the others are retained in the
  brief for audit/comparison (`status: rejected|retained`).
- `DECISION D3` — confirm counts (BLUE default 2 / max 5; RED = ML+MD pair, not full COA sets).

## 3. Wargame mode

One engine, three modes (mode picker at wargame start; pausing auto-run drops into step mode):

| Mode | Behavior | Boundary posture |
|---|---|---|
| **auto-run** | AI plays BLUE+RED, WHITE auto-adjudicates; operator watches the animation, can pause anytime. | Like today's WarGamingGEN python run, but every adjudication journaled (`WHITE-AUTO`). |
| **step-by-step approval** *(recommended default)* | Engine pauses at every timeline beat (action → reaction → counteraction → adjudication); operator Approve / Edit / Reject each before it commits. | Exactly the existing propose→commit pattern — zero new mutation paths. |
| **manual** | Operator moves units on the planning layer and declares outcomes; AI only suggests (Why-Not / feasibility panels). WHITE ruling still required to advance state. | Operator-driven; AI advisory only. |
| `DECISION D4` — confirm the three modes + step-by-step as default. |

## 4. COA timeline structure

The wargame is a sequence of **events**; each event is one beat of the classic staff wargame and
maps 1:1 onto the external step-4 triads and the existing adjudicator schema:

```
event = {
  event_id, phase_index, trigger,                     // e.g. "crossing LD", from step-4 event families
  action:         { side, units[], what, why, source_citation },
  reaction:       { side, units[], what, why },        // opposing side
  counteraction:  { side, units[], what, why },        // initiator's counter
  white_adjudication: {
      ruling, losses{}, effects[], rationale,
      mode: 'operator' | 'WHITE-AUTO',                 // who accepted it
      journal_ref                                      // ledger entry id
  },
  result: { state_delta, narrative_ar, narrative_en }, // feeds the next event
  status: proposed | approved | edited | rejected | adjudicated,
  ai_assisted: true, needs_review: true
}
```

- Events group under **phases** (template phases P1..P4); the per-event A/R/C/W/R beats are the
  animation sub-steps (§7).
- Every adjudication writes a **journal entry** — the Event Log remains a **ledger, not chat**
  (DTG/severity/category/source/message — locked rule respected).
- `DECISION D5` — timeline granularity: per-event beats (recommended) vs per-phase rollup only.

## 5. Draft unit placement rules (confirmed behavior, already partly implemented)

Priority ladder, never inventing precision:

1. **Explicit coordinates** in source/brief → use them, `placement: 'exact'`.
2. **MGRS string** (e.g. step-1 `Assembly_Area: "R CN 64215 7114840"`) → parse server-side →
   `placement: 'approximate'`, `needs_review: true` (server needs a small MGRS→lon/lat util; the
   client already ships an MGRS lib).
3. **Location name only** → geocode-free: anchor to the named brief feature if it exists (objective,
   BLS, AO center), else leave unplaced → `placement: 'approximate'`, flagged.
4. **Nothing** → template placeholder geometry (existing axis/ring around the operator-set
   objective), `placement: 'template'`, `draft: true`, low confidence.
5. **No objective coordinate ⇒ no generation** — the existing 422 `requires_objective` stands;
   amphibious additionally requires the operator to confirm the **landing area** on the map
   (objective alone is not enough). `DECISION D6` — confirm landing-area confirmation is required
   for `amphibious_landing` (recommended yes).

Amphibious skeleton stays: P1 preparation/recon → P2 sea approach/movement → P3 landing →
P4 secure/expand. Every placed unit carries `placement_confidence` + `missing_fields`.

## 6. Editable unit planning layer (from the marker investigation — see §11)

**Today:** scenario units on the adjudicator map are **read-only by design** (no `draggable`);
the separate ORBAT placement system (`units-map.js`) *is* draggable but **commits straight to the
server on dragend** (`/api/units/{id}/place`) — drag-to-commit, no draft stage.

**Design — "Planning Overlay" (no baseline mutation):**

- New `planningUnitsLayer` (own pane, z-index just above units). Entering *Planning Mode* spawns
  **draggable clones** of the selected scenario units; the baseline markers stay untouched.
- Drags update only an in-memory delta store:
  `RmoozPlanningOverlay.positions[uid] = { lat, lng, dirty: true }` + emit
  `rmooz:planning-position-changed`. **No server call on dragend.**
- Visuals: draft marker style (dashed halo + "draft" badge), ghost line from baseline position to
  draft position, counter chip "N units repositioned · Save / Discard".
- **Save** routes through sanctioned paths only — `DECISION D7`, pick one:
  - (a) in-memory working copy only (`window.RmoozScenario.scenario` clone, like Edit Mode Slice 1) —
    survives the session, not the disk;
  - (b) durable save via existing `POST /api/scenarios` (validates, 409 anti-clobber, `?overwrite=1`) —
    recommended: save **as a new draft scenario name** (`<name>-plan-<n>`), never overwriting the baseline;
  - (c) both: working copy immediately, explicit "Save as draft scenario" button for (b).
- **Discard** clears deltas and removes the overlay. Baseline scenario JSON on disk is never
  modified by the overlay in any option.
- Out of scope: changing `units-map.js` drag-to-commit (different feature — live ORBAT placement).

## 7. Animation requirements

- **Reuse the W3 per-step machinery**: `red/blue_unit_step_coords` + `*_step_prev` lerp hooks and
  `engagement_arcs` already exist in the schema and the adjudicator map — the COA player drives the
  same primitives per event beat instead of per step.
- Controls: play / pause / step-forward / step-back / scrub; speeds 1× / 2× / 4×; "skip to ruling".
- Beat choreography per event: action units move/engage → reaction → counteraction → WHITE ruling
  badge (with Accept/Edit/Reject in step mode) → result applied (losses/markers update).
- Arabic-first labels (RTL), severity-colored engagement arcs, draft units keep the draft halo.
- Performance budget: ≤500 units/side — marker pooling + `setLatLng` tweening only (no per-frame
  DOM rebuilds), arcs as one canvas/SVG layer.
- `DECISION D8` — animation granularity default: per-event beats (recommended) vs per-phase.

## 8. Missing data handling

- Placeholder values from external files (`<نص>`, `…`, `"..."`, `يصدر لاحقاً`) are scrubbed at the
  adapter and listed in `missing[]` — never displayed as content (no-invention rule, tested).
- Two classes: **blockers** (objective/landing area absent → generation refused, 422) vs
  **flags** (everything else → draft proceeds with `needs_review` + chips on the review screen).
- Every COA carries `missing_data[]`, `required_assumptions[]`, `confidence: low|medium|high`
  (low = template/external-placeholder origin; medium = single-source extracted; high = operator-
  confirmed). Confidence is shown on the COA card and inherited by generated units.
- The review screen's ambiguity list remains the single funnel — nothing generates around it.

## 9. Step 3/4/5 → `courses_of_action[]` mapping

New **additive** brief sections (schema change is backward-compatible):

```
operational_brief.force_comparison = {
  categories: [ { key: 'infantry_battalions', our: {count, unit_type, weight},
                  enemy: {count, unit_type, weight} }, ... ×9 ],
  qualitative: { training, morale, experience, technology, c2, doctrine_our, doctrine_enemy },
  strengths_weaknesses: { maneuver|firepower|protection|leadership|information:
                          { our: {strengths, weaknesses}, enemy: {...} } }
}
operational_brief.courses_of_action = [ {
  id: 'coa-1', name, side: 'BLUE',
  intent,                                  // step3 commander_intent / task
  phases: [ {index, label} ×3 + prep ],    // step3 phose_one/two/three + Boot_operations
  fires:  [ per-phase artillery ],         // step3 Artillery_fires_phose_*
  units_involved: [],                      // step3 task + step4 task_organization (+ counts)
  required_assumptions: [],                // step1/WARNO Operational_Assumptions
  risks: [],                               // step3 Acceptance_of_packaging_risk, step1 Risk_assy
  missing_data: [],                        // adapter placeholder scrub
  wargame_events: [ event × ≤6 ],          // §4 records seeded from step4 triads
  expected_enemy_reaction,                 // step4 *_reaction fields + Most_likely_enemy_action
  possible_counter,                        // step4 *_counter_action fields
  evaluation: { criteria: { attacking_cog|fire_support|c2|protection|admin_support:
                            {strengths, weaknesses} },  // step5
                conclusion },                            // step5 conclusions_c1/c2
  confidence: 'low', ai_assisted: true, needs_review: true,
  source_files: [ {file, keys[]} ]         // citations per populated field
} ]
operational_brief.coa_recommendation = {
  recommended_id, rationale,               // step5 overall_comparison_conclusion
  decided_by: 'operator' | null            // ONLY the operator can set final
}
```

Per-file mapping (suffix families `<k>` / `<k>2` / `<k>_2` / `<k>_c2` → COA 1 / COA 2; `phose` typo
is a registered synonym):

| External (step file) | Lands in |
|---|---|
| step3 `task`, `commander_intent`, `main_duties`, `desired_end_state`, `critical_operations` | `coa.name/intent` (+ brief.mission context) |
| step3 `phose_one/two/three(2)`, `Boot_operations(2)` | `coa.phases` |
| step3 `Artillery*`, `Artillery_fires_phose_*(2)` | `coa.fires` |
| step3 `*_total_our/enemy {count, unit_type, weight}` ×9 | `force_comparison.categories` → draft `units_involved` counts |
| step3 strengths/weaknesses ×5 functions | `force_comparison.strengths_weaknesses` |
| step4 `possible_operation_phase1-3(_2)` | `coa.phases` enrichment |
| step4 `*_acting` / `*_reaction` / `*_counter_action` ×6 events | `coa.wargame_events[].action/reaction/counteraction` |
| step4 `Most_likely_enemy_action(_2)` | `coa.expected_enemy_reaction` + RED ML COA |
| step4 `task_organization` | `coa.units_involved` |
| step5 `strengths/weaknesses_*(_c2)` ×5 criteria | `coa.evaluation.criteria` |
| step5 `conclusions_c1/c2`, `overall_comparison_conclusion` | `coa.evaluation.conclusion`, `coa_recommendation.rationale` |
| step1 `Operational_Assumptions`, `Risk_assy`, `ROE`, `Timings`, `Assembly_Area` | brief `assumptions/constraints/timeline/area_of_operations` |

`DECISION D9` — approve the schema above (esp. that `coa_recommendation.decided_by` can only be
set by the operator, never by AI).

## 10. Tests required (when un-paused)

| Layer | Tests |
|---|---|
| Adapter (G-2) | step3→2 COAs + force_comparison sides correct; step4 triads→wargame_events/reaction/counter; step5→evaluation+recommendation rationale; placeholders→`missing_data` never content; suffix families resolve to COA 1/2; warning_order dictionary never produces content |
| Bundle (G-3) | 5 files → ONE brief, 2 COAs (not 4/6); conflicts[] on disagreeing values; per-file `source_files` citations |
| COA review (G-4) | payload carries courses_of_action + recommendation; cards render (browser verify); operator edit/approve persists to the reviewed brief; recommendation cannot auto-finalize |
| Generation (G-5) | approved-COA-only input; objective/landing-area blockers (422); counts→draft units ≤500; placement ladder (exact/approximate/template) flags correct |
| Modes | step mode: nothing advances without approval (no journal entry ⇒ no state change); auto mode: every adjudication journaled `WHITE-AUTO`; manual: AI never moves units |
| Planning layer | drag updates delta store only; baseline scenario file hash unchanged on disk; Save-as-draft writes NEW name (409 on collision honored); Discard restores; boundary-audit self-test still green |
| Animation | beat sequencing fires in order; scrub idempotent; 500-unit perf smoke |
| Regression | all 7 existing suites; existing AI/import button; offline-image gate before any rebuild |

---

## 11. Marker investigation findings (why clickable but not draggable)

**Two marker systems exist; only one is draggable:**

| | Scenario units (what the commander sees) | ORBAT placement units |
|---|---|---|
| File | `client/wargame/adjudicator-map.js` (marker sites at :895, :3119, …) | `client/units-map.js:347-349` |
| Draggable | **No** — `L.marker(..., { icon, interactive: true })`, no `draggable` option (Leaflet default false) | **Yes** — `draggable: true` |
| Click | popup/select handlers bound (hence "clickable") | click → `rmooz:unit-selected` |
| On drag | n/a | `dragend` → **immediate `POST /api/units/{id}/place`** (drag-to-commit, `units-map.js:364-388`) |
| Layer | per-step `L.layerGroup`s — read-only render of scenario JSON | `unitsMarkerPane` (z-650) / active user layer |

- **Root cause:** scenario unit markers are created without `draggable: true` — a deliberate
  read-only render of `red_units`/`blue_units_initial`, consistent with the boundary rule that the
  client never mutates scenario state (`window.units`/map/lines closed; `boundary-audit-panel.js`
  asserts it).
- **No editable unit layer exists today**: no geoman/L.Draw/`pm:` on units; the draggable
  infrastructure that does exist is for **drawing-shape handles** (`app.js:7019`, `:9245`, `:10283`)
  and the drag-to-commit ORBAT system — neither is a draft layer.
- **Working-copy precedent exists**: Edit Mode (`scenario-edit-mode.js:36,113-130,2182-2204`)
  already keeps a deep-clone draft and saves to `window.RmoozScenario.scenario` only — the planning
  overlay (§6) extends this proven pattern to positions.
- **Minimal change for commander drag/drop without touching baseline:** add the planning overlay
  layer + delta store + `rmooz:planning-*` events (§6); reuse `units-map.js` drag/`nudgeAwayFromOthers`
  spacing logic and Edit Mode's save gate. Do **not** add `draggable: true` to the adjudicator-map
  markers themselves — that would invite direct baseline mutation and violate the read-only-surface
  audit.

---

## 12. Decision checklist (blockers for un-pausing)

- [ ] **D1** RED default player: AI red-team-agent vs human seat
- [ ] **D2** WHITE auto-adjudication allowed in auto-run (journaled) — yes/no
- [ ] **D3** COA counts: BLUE default 2 / max 5; RED = most-likely + most-dangerous
- [ ] **D4** Three wargame modes; step-by-step approval as default
- [ ] **D5** Timeline granularity: per-event A/R/C/W/R beats vs per-phase
- [ ] **D6** Amphibious requires operator-confirmed landing area (in addition to objective)
- [ ] **D7** Planning-layer save target: (a) working copy only / (b) save-as-new-draft-scenario / (c) both
- [ ] **D8** Animation default granularity: per-event vs per-phase
- [ ] **D9** `courses_of_action[]` schema + operator-only final recommendation
- [ ] **D10** Confirm G-2→G-5 build order: adapter → bundle → COA review cards → COA-aware generation
