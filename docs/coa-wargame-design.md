# COA Visualization & Wargame Design — v2 (DECISIONS LOCKED)

**Status: LOCKED by owner 2026-06-11 (rulings L1–L10 below). This document is the build
contract for G-2/G-3 and the COA/wargame phases that follow.** Supersedes the v1 decision
draft (D1–D10 are resolved by L1–L10).

Global rule (unchanged, enforced): **AI understands → user reviews → RMOOZ validates → RMOOZ
generates.** Everything AI-produced is *AI-assisted possibilities / needs review* — never
tactical truth.

---

## 0. Locked decision register

| # | Ruling (final, per owner D1–D10 of 2026-06-11) |
|---|---|
| **L1 (D1)** | Role picker **every session**, default **BLUE**. User may choose BLUE / RED / WHITE. Choosing BLUE ⇒ RED is AI opposing force; choosing RED ⇒ BLUE is AI opposing force. **WHITE is always controller/adjudicator, never a fighting side.** |
| **L2 (D3)** | **BLUE default = 3 COAs. RED default = 2 COAs** (1 most-likely + 1 most-dangerous). **Generate More** available; **hard cap = 5 COAs per side** for now. |
| **L3 (D4)** | Modes user-selectable: Auto-run / Step-by-step / Manual (later). **Default = Step-by-step approval**: Action → Reaction → Counteraction → WHITE decision → commander accepts/rejects/modifies → next turn. |
| **L4 (D2/D9)** | **Hybrid WHITE adjudication**: AI/rules may *suggest* the WHITE decision; the human must be able to approve/reject/modify; auto-run may write `WHITE-AUTO` entries; **every state-changing result is journaled — no silent mutation.** |
| **L5 (D7)** | Planning uses **both** targets: in-session **working copy** for temporary planning + **save-as-new-draft** for committed wargame output. **Deltas first: `baseline + planning delta = current planning view`.** Baseline never mutated. |
| **L6** | AI placement may render draft- or final-looking, but **every AI placement keeps `needs_review` + `confidence` + `source`** — no exceptions. |
| **L7** | Doctrine: public NATO-style test doctrine first; uploaded PDF/DOCX later — **extracted into reviewed doctrine rule cards before use**. |
| **L8** | Reuse existing RMOOZ vocabulary; missing terms (suppressed, delayed, turn beats) added as **additive enums, never hardcoded text** (§4.3). |
| **L9 (D5)** | **Detailed timeline records**: action, reaction, counteraction, WHITE adjudication, result, **affected units, confidence, needs_review, source_citations** — mapping directly from external Step-4 triads. |
| **L10 (D6)** | `amphibious_landing` / عملية إبرار requires **objective AND landing-area confirmation; missing either ⇒ 422.** AI may *suggest* draft landing areas; the user must confirm. |
| **L11 (D8)** | **Animation is NOT built first** (G-7, after timeline + tasking). When built: one event at a time, play/pause/step fwd/back, arrows/routes/effects tied to actual A/R/C records, **no decorative-only animation**, commander can stop & modify before continuing. |
| **L12 (D10)** | Build order: **G-2** MDMP adapter (step3→COAs+force comparison, step4→A/R/C wargame turns, step5→comparison/recommendation, placeholder scrub, per-key citations) → **G-3** COA Review Panel → **G-4** Unit Tasking Mode → **G-5** Wargame Timeline (RED/BLUE/WHITE) → **G-6** Doctrine Rule Cards → **G-7** Animation → **G-8** civilians/infrastructure/ROE reality layer (later). |

Roles (L1): at wargame start a role picker offers **BLUE (default) / RED / WHITE**; the chosen
role gates which side's taskings the user may issue and whether they hold the WHITE approval
gavel. `operator_id` + chosen role are stamped on every journal row. NEUTRAL remains a side,
not a role.

---

## 1. COA Review Panel

Where: a new section of the existing AI-Understanding review flow (shared renderer pattern —
`client/shell/coa-review-panel.js` consuming the same `/analyze` payload; loaded like
`doc-understanding-review.js`). RTL Arabic-first.

**Layout**
- Header: operation type chip + role chip (L1) + recommendation strip (rule-engine + AI
  rationale, from step-5 `overall_comparison_conclusion` when external) — **final selection is
  operator-only** (`coa_recommendation.decided_by` can never be AI).
- **3 COA cards by default (L2)**, horizontally scrollable; **+ Generate More** card appends one
  candidate per click (engine/template first, LLM on deployment), soft cap 5 with "more requires
  removing one" beyond it.
- Card contents: name + side badge · intent · phase mini-strip (P1..Pn) · units-involved count
  (from `force_comparison` counts) · risks · `missing_data` chips · confidence badge (L6) ·
  expected enemy reaction · possible counter · evaluation block (step-5 criteria
  strengths/weaknesses) · source-file citations.
- Card actions: **Approve** (exactly one BLUE COA may hold `approved`; approving another demotes
  the first to `retained`) · **Edit** (inline fields write back to the *reviewed* brief) ·
  **Reject** · **Compare** (two-card side-by-side of the 5 evaluation criteria).
- Footer: existing Generate flow — the approved COA id is passed to `/api/wargame-sim/generate`;
  the 422 objective guard and the review gate stay exactly as built.

**States:** `proposed → edited → approved | rejected | retained`. The panel never mutates the
brief silently; every edit lands in the reviewed-brief working copy with an audit field.

## 2. Unit Tasking Mode (CMO-style, L4 + L5)

**Flow (one turn):**
```
select unit (existing rmooz:unit-selected event)
  → Tasking Panel: task kind · direction (bearing picker) · objective (pick existing brief/scenario
    objective or map point) · route (draw / pick waypoints — reuses drawing tools) · posture
  → [Run Turn]
  → engine prediction: movement (MOVE1/World-State), detection (DET1), engagement (ENG1),
    feasibility pre-check (action-feasibility.js)
  → AI predicts opposing reaction (red/blue-team agent, perspective-flipped)
  → WHITE adjudication (§4)
  → commander Accept / Reject / Modify (modify → edits tasking → re-run)
  → on Accept: result applied to the WORKING COPY + journal entry; baseline untouched (L5)
```

**Global `unit_tasking` model (L5)** — additive, lives OUTSIDE the baseline scenario file:

```
tasking = {
  tasking_id, scenario_name, turn_id,
  unit_uid, side,                       // side must match the user's role (L1) unless WHITE
  task: TASK_KINDS,                     // additive enum extending ACTION_KINDS (§4.3)
  direction_deg?: number,
  objective_ref?: { id? , coord? },     // never invented — picked or existing
  route?: [[lon,lat], ...],
  posture?: existing posture enum,
  status: draft | submitted | predicted | adjudicated | accepted | rejected | modified,
  issued_by: operator_id, issued_role: BLUE|RED|WHITE, issued_at,
  source: 'commander' | 'coa' | 'ai-suggested',
  needs_review: true, confidence, citations[]          // L6 invariants
}
```

- Store: in-memory tasking store per scenario+turn (server `server/sim/` next to
  proposal-store, same pattern), journaled on accept; **never written into
  `data/scenarios/<name>.json`**.
- A COA's `units_involved` pre-seeds taskings (`source: 'coa'`) which the commander can edit —
  the same model serves commander-manual and COA-driven play.
- Map affordances: direction ghost arrow, draft-styled route polyline, objective link line —
  drawn on the planning overlay layer (Appendix A), never on baseline markers.
- Drag remains available as a *positional* tasking (`task: MOVE` with route = [drop point]) —
  drag is a shortcut into the same tasking model, not a separate mutation path.

## 3. Wargame Timeline (L3 + L10)

**Structure** — per approved COA:

```
courses_of_action[].wargame_turns[] = {
  turn_id, phase_index, trigger,              // e.g. "crossing LD & breaching" (step-4 event families)
  action:        { side, units[], taskings[], what, why, source_citation },
  reaction:      { side, units[], what, why },
  counteraction: { side, units[], what, why },
  white_decision: { decision: accept|reject|auto,      // existing journal DECISIONS enum
                    decided_by: operator_id | 'WHITE-AUTO', rule_cards_fired[],
                    rationale, journal_ref },
  result: { effects[],                        // UNIT_EFFECTS additive enum (§4.3)
            state_delta, losses{}, objective_status?,   // existing OBJECTIVE_STATUS
            narrative_ar, narrative_en },
  affected_units: [],                         // L9/D5: uids touched by this turn
  status: proposed | approved | edited | rejected | adjudicated,
  ai_assisted: true, needs_review: true,
  confidence: low|medium|high, source_citations: [{file, keys[]}]   // L9/D5
}
```

**Mode behavior (L3):**
- **Auto-run:** all turns process continuously; `white_decision.decision='auto'` (existing enum
  value) with `decided_by:'WHITE-AUTO'`; every turn journaled; **nothing durable until the
  commander's end-of-run batch Accept** (or rewind to a turn and accept up to it).
- **Step-by-step (default):** engine pauses after **each beat** — action, reaction,
  counteraction — and at the white_decision; commander approves/edits/rejects before the next
  beat. This is the existing propose→commit pattern applied per beat.
- **Manual (later phase):** no auto-beats; commander issues taskings (§2) and explicitly runs
  each turn; AI only suggests.
- Timeline UI: horizontal phase-grouped turn strip; each turn shows five beat icons
  (A/R/C/W/R) with status colors; click to jump; synchronized with the Event Log ledger
  (tabular, DTG/severity/category/source/message — locked rule respected).

## 4. White Adjudication (L9)

**Three-stage gate per turn:**
1. **AI suggests** — adjudicator-agent proposal (existing Proposal contract:
   `proposal_id/step_index/source/proposed_actions`, `PROPOSAL_SOURCES`).
2. **Rule engine evaluates** — deterministic checks, each producing pass/warn/fail + citation:
   feasibility (`action-feasibility.js`), movement/terrain (World-State MOVE1), detection
   plausibility (DET1), engagement ratios (ENG1 + `parseForceRatio`), throughput ceiling
   (`throughputCeilingKm`), **active doctrine rule cards (§5)** → `rule_cards_fired[]`.
3. **Human approves** — commander/controller Accept/Reject/Modify via the existing
   `/api/sim/commit` boundary (`validateCommitRequest`: operator_id required); journal row per
   decision. In auto-run, stage 3 is the batch acceptance (see §3).

### 4.3 Outcome vocabulary (L8) — existing vs additive

| Decision-8 term | Status | Source of truth |
|---|---|---|
| mission success / fail | **EXISTS** | `OBJECTIVE_STATUS` → `CAPTURED` / `DENIED` (+ `step_advantage`) |
| destroyed | **EXISTS** | World-State `status:'DESTROYED'` (`world-state.js:102`), `blue_destroyed` deltas, destroyed-marker styling (MAP-CLARITY-1) |
| damaged | **EXISTS (as degraded)** | `RED_UNIT_STATUS.DEGRADED`, W3 `affected.status_change` + `damage_pct`, `world-state-transition.js:180` |
| withdrawn | **EXISTS** | `BLUE_ACTION_VALUES.WITHDRAW` |
| detected | **EXISTS (domain)** | DET1 detection engine (`shell/detection.js`) contact states |
| white decision accept/reject/auto | **EXISTS** | `DECISIONS` (journal contract) |
| task kinds MOVE/ENGAGE/HOLD | **EXISTS** | `ACTION_KINDS` (+ `client/wargame/approved-actions.js`) |
| confidence high/medium/low | **EXISTS** | `confidence_per_field` convention |
| action / reaction / counteraction | **ADD** | new `TURN_BEATS = ['action','reaction','counteraction','white_decision','result']` |
| suppressed | **ADD** | new `UNIT_EFFECTS` entry |
| delayed | **ADD** | new `UNIT_EFFECTS` entry |

**Implementation rule:** one additive registry module — `server/sim/wargame-enums.js` —
re-exporting the existing enums from `adjudicator-schema.js` and adding
`TURN_BEATS`, `UNIT_EFFECTS = ['DETECTED','DAMAGED','DESTROYED','DELAYED','SUPPRESSED','WITHDRAWN']`
(mapping DAMAGED→DEGRADED where legacy code expects it) and
`TASK_KINDS = ACTION_KINDS ∪ ['RECON','SCREEN','DEFEND','SUPPORT','SUPPRESS','WITHDRAW']`.
Validators accept only enum values — **no free-text statuses anywhere** (L8).

## 5. Doctrine Rule Cards (L7)

A rule card is a **reviewed, structured, citable** rule the WHITE rule engine can evaluate:

```
rule_card = {
  card_id, title_ar, title_en,
  source: { doc, section, page?, quote },              // citation is mandatory
  applies_to: { sides?, unit_roles?, task_kinds?, phase_kinds?, terrain? },
  rule_type: 'constraint' | 'modifier' | 'trigger' | 'evaluation',
  logic: { when: {field, op, value}[], then: {effect, magnitude?, message} },   // structured, no prose logic
  status: draft | reviewed | active | retired,
  reviewed_by?, reviewed_at?, confidence, language, version
}
```

- **Seed pack (now):** public NATO-style *test* doctrine shipped as already-`reviewed` cards in
  `data/doctrine/seed/*.json` (clearly stamped `source.doc: 'NATO-style public test doctrine'`)
  — e.g. 3:1 attacker ratio guidance, recon-before-movement, AD coverage of high-value assets,
  amphibious lodgement-before-buildup. `docs/cmo-functional-rules/` (945 caption-grounded rules)
  is a named future source for additional cards.
- **Upload path (later):** PDF/DOCX → existing extractors (`docx-text.js`; pdf skill on
  deployment) → LLM extraction into **`draft` cards** → operator review screen (same card-grid
  pattern as the COA panel) → only `active` cards are evaluated. **Draft/retired cards are never
  evaluated** — same gate philosophy as the brief review.
- Every adjudication lists `rule_cards_fired[]` (card_id + message) — explainable rulings.

## 6. Animation requirements

- **Beat choreography per turn (L10):** action units move/engage → reaction → counteraction →
  WHITE badge (decision + fired cards; pauses in step mode) → result (effect badges from
  `UNIT_EFFECTS`, loss counters, objective status).
- **Mode coupling (L3):** auto-run plays beats continuously (pause anytime → drops to step
  mode); step mode auto-pauses after action, reaction, and counteraction (locked); manual
  animates only on explicit Run Turn.
- **Reuse, don't rebuild:** W3 per-step lerp hooks (`*_unit_step_coords/_prev`),
  `engagement_arcs` rendering, destroyed-marker styling + arrows (MAP-CLARITY-1), detection
  rings (DET1 overlays). The COA player drives these per beat instead of per step.
- Controls: play/pause, step fwd/back, scrub, speeds 1×/2×/4×, "skip to ruling".
- Tasking visuals (§2): animated route polyline, direction ghost, objective link.
- Draft/AI placements keep the draft halo + confidence badge during animation (L6).
- Perf: ≤500 units/side — marker pooling, `setLatLng` tweening, one canvas/SVG layer for arcs,
  no per-frame DOM rebuilds. RTL labels throughout.

## 7. Required schema additions (all additive — validator ignores unknown keys; precedent: `neutral_units`)

| Addition | Where | Notes |
|---|---|---|
| `operational_brief.courses_of_action[]` | brief (operational-brief.js `emptyBrief`) | card fields (§1) + `wargame_turns[]` (§3, L10) |
| `operational_brief.force_comparison` | brief | step-3 `{count, unit_type, weight}` ×9 categories ×2 sides + qualitative + strengths/weaknesses |
| `operational_brief.coa_recommendation` | brief | `{ recommended_id, rationale, decided_by: operator-only }` |
| `unit_tasking` store | `server/sim/` (NOT scenario JSON) | §2 model; journaled on accept (L5) |
| `wargame-enums.js` registry | `server/sim/` | §4.3 — `TURN_BEATS`, `UNIT_EFFECTS`, `TASK_KINDS`; re-exports existing enums |
| Doctrine rule cards | `data/doctrine/` + card schema module | §5; seed pack `reviewed`, uploads land `draft` |
| Journal row kinds | journal (additive) | `white_decision`, `tasking_accepted` alongside existing kinds |
| Placement invariants (L6) | brief-to-scenario + adapters | every AI-placed unit: `needs_review`, `placement_confidence`, `source` — schema-checked, not convention |
| Role stamp (L1) | commit/journal payloads | `issued_role: BLUE|RED|WHITE` next to `operator_id` |

## 8. Tests

| Area | Required tests |
|---|---|
| Adapter (G-2) | step3→**3-default behavior** (2 external COAs imported as-is + Generate More path adds the 3rd); step4 triads → `wargame_turns[].action/reaction/counteraction`; step5 → evaluation + recommendation rationale; placeholders → `missing_data` never content; suffix families (`<k>`/`<k>2`/`<k>_2`/`<k>_c2`) resolve to COA 1/2 |
| Bundle (G-3) | 5 files → ONE brief; conflicts[]; per-file citations; JSONC regression stays green |
| COA panel | exactly-one-approved invariant; Generate More appends (soft cap honored); operator-only recommendation (`decided_by` rejects AI values); edits land in reviewed brief; browser verify (cards render RTL) |
| Tasking (L4/L5) | creating/submitting taskings leaves the baseline scenario file hash unchanged; accept → journal row + working-copy delta; reject discards; role gating (BLUE user cannot task RED units); drag produces a MOVE tasking, not a position write |
| White adjudication (L9) | step mode: no state advance without a journaled decision; auto-run: all turns `decision:'auto'` + nothing durable before batch accept; `rule_cards_fired[]` present; Modify loops back to prediction |
| Enums (L8) | registry-only values pass validators; free-text status rejected; legacy enums unchanged (adjudicator regression) |
| Doctrine cards (L7) | draft/retired never evaluated; seed pack loads as reviewed; extracted card requires operator transition to active; every ruling cites fired cards |
| Animation | beat order A→R→C→W→R; step-mode pauses after A, R, C (locked); scrub idempotent; 500/side perf smoke |
| Regression | all 8 existing suites; existing AI/import button; boundary-audit self-test; offline-image gate before any rebuild |

---

## Appendix A — Marker investigation (unchanged from v1, grounds §2/§6)

Two marker systems: scenario units (`adjudicator-map.js` :895/:3119…) are **read-only by
design** (no `draggable`); ORBAT placement markers (`units-map.js:348`) are draggable but
**drag-commits immediately** (`/api/units/{id}/place`, :364-388). No draft/planning layer
exists; draggable infra that does exist is drawing-shape handles (`app.js:7019/:9245/:10283`).
Edit Mode proves the working-copy pattern (`scenario-edit-mode.js:36,113-130,2182-2204`).
**Resolution (L4/L5):** the tasking model + planning overlay replace naive drag-to-commit for
scenario units; baseline markers never get `draggable:true`.

## Appendix B — Remaining minor opens (non-blocking, resolve during build)

- ~~Amphibious landing-area confirmation~~ **RESOLVED (L10/D6): required, 422 when missing.**
- ~~COA caps~~ **RESOLVED (L2/D3): BLUE 3 / RED 2 (ML+MD), Generate More, hard cap 5/side.**
- ~~Planning save target~~ **RESOLVED (L5/D7): working copy + save-as-new-draft; deltas first.**
- Turn → game-time mapping (elapsed_hours per turn) defaults — resolve in G-5.
