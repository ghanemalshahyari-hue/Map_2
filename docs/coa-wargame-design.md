# COA Visualization & Wargame Design — v3 (DECISIONS LOCKED · MISSION-FIRST)

**Status: LOCKED by owner (L1–L13 ruled 2026-06-11; L14–L16 mission-first rulings added by
owner the same day). This document is the build contract for the G-track — COA, location
intelligence, tasking, timeline, doctrine, animation.** Supersedes the v1 decision draft
(D1–D10 are resolved by L1–L10). v3 adds the **mission-first / outcome-driven operating model**
(§0.6) and the updated build order (L12).

Global rule (unchanged, enforced): **AI suggests → RMOOZ validates → commander approves →
WHITE adjudicates → state changes are journaled.** Everything AI-produced is *AI-assisted
possibilities / needs review* — never tactical truth.

> **Identity (L14): RMOOZ is a mission decision-support and wargaming platform — NOT an AI
> document importer.** Documents are one data feed among many (§0.6.3); the session starts from
> a desired **outcome**, not from an upload.

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
| **L12 (D10 · updated by owner 2026-06-11)** | Build order: **G-2** MDMP adapter ✅ → **G-3** COA Review Panel ✅ (visible in the real wizard flow) → **G-3A** Planning Model Unification (upload data and in-app-built scenario data normalize into ONE internal planning model — the implementation slot of L13) → **G-3B** Location Intelligence Resolver (place names, coordinates, AO checks, confidence, incident history — `docs/location-intelligence-design.md`) → **OBJLINK-B** Unit ↔ Objective/BLS/Route derivation ✅ (read-only evidence layer from existing World State; `ws.derived.unit_objective_links`) → **G-4** Unit Tasking Mode (CMO-style task/order/direction/objective/posture — not just dragging) → **G-5** RED/BLUE/WHITE Wargame Timeline (action → reaction → counteraction → WHITE decision → result) → **G-6** Doctrine Rule Cards (public NATO-style test doctrine first, uploaded doctrine later) → **G-7** Animation (timeline-driven playback only after tasking/timeline exist) → **G-8** civilian / infrastructure / ROE reality layer (later). |
| **L13 (owner, 2026-06-11)** | **Native Scenario Builder parity is MANDATORY.** Every COA/planning capability must work from BOTH input paths: **(A) upload/import** (MDMP docs, external JSON) and **(B) the RMOOZ in-app scenario builder** — user-created AO, objectives, BLUE/RED units, assigned/requested locations, manual incident notes (مجرى الحوادث), and "ask AI for COAs" with **no document uploaded**. All manually created app data is converted into the **same Operational Brief / Planning Model** used by imported data before any AI step — **no separate upload-only AI logic, ever.** Every planning object carries a `source.type` from the global taxonomy (§0.5). |
| **L14 (owner, 2026-06-11)** | **Mission-first / outcome-driven, NOT upload-first.** A session starts from a desired **outcome** — السيطرة على هدف · اختبار عملية إبرار · حماية قاعدة · منع تقدم عدو · تقييم رد فعل العدو · مقارنة الأعمال الممكنة — and **RMOOZ derives what it needs** (AO, objectives, BLUE/RED units, locations, incident history, doctrine, readiness/supply, routes/BLS/objective links, COAs, missing-info list) as a deterministic requirements checklist (§0.6.2). Uploads, the builder, and AI are all just ways to **fill** that checklist. Outcome-driven tasking: taskings/COAs are evaluated against the mission's success criteria, not in the abstract. |
| **L15 (owner, 2026-06-11)** | **Data fusion model.** All sources — manual scenario builder · DOCX/PDF · JSON/MDMP external outputs · location DB/gazetteer · incident log (مجرى الحوادث) · doctrine PDF/DOCX · existing World State · DB-Lite capabilities · commander input — normalize into the **one** planning model (§0.5), each object stamped `source.type` + confidence + citations. Fusion precedence: **operator-declared > reviewed > derived > AI-suggested**; conflicts are SURFACED for review (`conflicts[]`), never silently resolved. AI is an **orchestration/reasoning layer over fused data — never final authority** (the global rule). |
| **L16 (owner, 2026-06-11)** | **Inspiration attribution & boundary.** The public product direction of **tacticalabs.ai / TACTICA AI** (mission-first tasking, data fusion, human-in-the-loop, digital-twin visualization, AI-as-orchestration, outcome/risk analysis, on-prem modular deployment) is acknowledged as *direction inspiration only*. **No UI, code, asset, schema, or text is to be copied from it.** RMOOZ implements these ideas on its own locked architecture (L1–L15, the AI/sim boundary, the journal). Digital-twin direction per §0.6.5: the live map + World State projection is the twin — evidence-first, every rendered relationship traceable to a derivation or a declared source. |

Roles (L1): at wargame start a role picker offers **BLUE (default) / RED / WHITE**; the chosen
role gates which side's taskings the user may issue and whether they hold the WHITE approval
gavel. `operator_id` + chosen role are stamped on every journal row. NEUTRAL remains a side,
not a role.

---

## 0.5 Input paths — upload AND native builder (L13, MANDATORY)

The planning pipeline has exactly **one** model and **two** front doors. Everything downstream of
the Operational Brief (COA generation, review panel, tasking, wargame turns, adjudication,
location resolution) is **source-blind** — it must not know or care whether the brief came from a
document or from in-app authoring.

**Path A — Upload / import (exists / G-2):** doc-understanding flow (PDF/DOCX → extractors →
reviewed brief), MDMP step-3/4/5 adapter, external JSON import. Source types: `uploaded_doc`,
`external_json`, `mdmp_adapter`.

**Path B — RMOOZ native scenario builder (in-app, no document):** the user can
- create the **AO** (draw/confirm boundaries),
- create **objectives**,
- create **BLUE/RED units**,
- **assign locations** (map click / typed place name / pick from `location_db`) or **request**
  a location (typed phrase → the same Location Intelligence resolver ladder,
  `docs/location-intelligence-design.md` LI‑11),
- add **incident notes / مجرى الحوادث manually** (same `incident_log` schema, `source.type:
  'manual_app_entry'`),
- **ask AI for COAs without uploading any document.**

**Convergence rule (the heart of L13):** native-builder objects are assembled into the **same
`operational_brief` / planning model** (same `emptyBrief` shape, same validators, same
`/analyze`-equivalent payload) that Path A produces. One brief builder, one COA engine, one
review panel. **Do not create separate upload-only AI logic** — if a capability works for an
uploaded brief it must work for a hand-built brief, and vice versa.

**Global `source` field (mandatory on every planning object)** — every brief object, unit,
objective, AO, incident, placement candidate, tasking, COA, and wargame turn carries:

```
source: {
  type: 'uploaded_doc'      // extracted from an uploaded document
      | 'external_json'     // imported machine-readable scenario/package
      | 'mdmp_adapter'      // produced by the MDMP step-3/4/5 adapter
      | 'manual_app_entry'  // typed/authored in the RMOOZ builder UI
      | 'map_click'         // operator clicked/drew it on the map
      | 'location_db'       // resolved from the internal gazetteer
      | 'incident_log'      // derived from a مجرى الحوادث entry
      | 'llm_candidate'     // AI-suggested, needs_review (L6 invariants apply)
      | 'doctrine_rule',    // produced/required by a doctrine rule card
  ref?, citation?           // existing per-source citation conventions
}
```

`source.type` composes with — never replaces — the L6 invariants (`needs_review`, `confidence`,
citations). Operator-authored objects (`manual_app_entry`, `map_click`) are declared data:
`confidence:'high'`, no review gate; AI/LLM objects keep `needs_review:true` regardless of path.

## 0.6 Mission-first operating model (L14–L16, owner 2026-06-11)

### 0.6.1 The mission-first workflow (the front door)

The session begins with an **outcome**, not a file. Upload is demoted from "step 1" to "one way
to fill a requirement."

```
1. OUTCOME   المطلوب أولاً — operator picks/states the desired outcome (§0.6.2 catalog)
      → mission object created (journaled, source.type:'manual_app_entry')
2. DERIVE    RMOOZ computes the requirements checklist for that outcome — deterministic
      needs-matrix, NOT prose: AO · objectives · BLUE/RED units · locations · incident
      history (مجرى الحوادث) · doctrine rules · readiness/supply · routes/BLS/objective
      links · COAs · explicit missing-information list
3. FUSE      each requirement row shows status (present / missing / stale) and is fillable
      from ANY source in §0.6.3 — builder, upload, location DB, world state, commander…
4. REVIEW    human-in-the-loop gates (§0.6.4): nothing fused becomes planning truth
      without review, unless operator-declared
5. EXECUTE   COAs (§1) → tasking (§2) → RED/BLUE/WHITE timeline (§3) → WHITE
      adjudication (§4) — all evaluated AGAINST the mission's success criteria
6. ASSESS    outcome analysis: results vs success_criteria; risk / predicted-outcome view
      (COA evaluation block + wargame results + MC distribution where available)
```

### 0.6.2 Outcome catalog → requirements matrix (deterministic, data-driven)

`OUTCOME_TYPES` — additive enum (L8 style; AR labels via i18n, never hardcoded prose):

| Outcome | النتيجة | Auto-derived requirements (checklist seeds) |
|---|---|---|
| `SEIZE_OBJECTIVE` | السيطرة على هدف | objective + AO · BLUE maneuver units · RED defenders · routes/BLS/objective links · force comparison · attack-ratio doctrine cards · COAs |
| `TEST_AMPHIB_OP` | اختبار عملية إبرار | objective **and landing area (L10 — 422 if either missing)** · naval/amphib BLUE · RED coastal defense · BLS/throughput · coastal incident history · readiness/supply |
| `DEFEND_BASE` | حماية قاعدة | base location (location DB) · BLUE defenders + AD coverage (DB-Lite/DET1) · RED threat axis · detection coverage · incident history at the base |
| `DENY_ADVANCE` | منع تقدم عدو | AO + avenue of approach · RED units + routes · BLUE blocking units · terrain/BLS · doctrine constraints |
| `ASSESS_ENEMY_REACTION` | تقييم رد فعل العدو | an existing plan/tasking set · RED doctrine/posture · red-team agent · wargame timeline |
| `COMPARE_COAS` | مقارنة الأعمال الممكنة | ≥2 COAs · evaluation criteria · force comparison (step-3/step-5 model) |

**`mission` object (additive schema, §7):**

```
mission = {
  mission_id, outcome_type: OUTCOME_TYPES, title_ar, title_en,
  params: { objective_ref?, base_ref?, axis?, enemy_focus? },        // picked/existing, never invented
  success_criteria: [ { metric, target, source } ],
  requirements: [ { kind, status: present|missing|stale|declined,
                    filled_by: source.type, refs[] } ],
  status: draft | ready | in_planning | wargamed | assessed,
  created_by: operator_id, created_at, journal_refs[]
}
```

### 0.6.3 Data fusion model (L15)

One planning model (§0.5), many feeds. Every object carries `source.type` + confidence +
citations; the fusion layer's job is **inventory and conflict surfacing**, not silent merging.

| Source | `source.type` | Trust class |
|---|---|---|
| Manual scenario builder (in-app) | `manual_app_entry` / `map_click` | operator-declared |
| DOCX/PDF documents | `uploaded_doc` | reviewed-after-extraction |
| JSON / MDMP external outputs | `external_json` / `mdmp_adapter` | reviewed-after-adaptation |
| Location DB / gazetteer | `location_db` | reviewed data |
| Incident log (مجرى الحوادث) | `incident_log` | evidence (LI-8: never truth) |
| Doctrine PDF/DOCX → rule cards | `doctrine_rule` | active cards only (L7) |
| Existing World State | (derived) | derived evidence (e.g. OBJLINK-B links) |
| DB-Lite unit capabilities | (derived) | derived enrichment |
| Commander input | `manual_app_entry` | operator-declared |
| LLM suggestions | `llm_candidate` | AI-suggested (lowest; never auto-truth) |

**Precedence: operator-declared > reviewed > derived > AI-suggested.** Disagreement between
sources ⇒ `conflicts[]` entry surfaced for review (same philosophy as the location resolver
ladder, LI-2). **AI is an orchestration/reasoning layer over fused data — never final authority.**

### 0.6.4 Human-in-the-loop validation (unchanged rule, mapped to gates)

**AI suggests → RMOOZ validates → commander approves → WHITE adjudicates → state changes are
journaled.** Gate map: brief/understanding review (G-1/G-2) · placement-candidate review (G-3B)
· COA approve/reject/edit (§1) · tasking accept (§2) · per-beat / batch WHITE decisions (§3–§4)
· journal boundary on every commit (`operator_id` + role stamp). No gate may be bypassed by any
source type — including operator uploads.

### 0.6.5 Digital-twin visualization direction (L16)

The live map + World State projection **is** the twin — *evidence-first*: every rendered
relationship must trace to a derivation or a declared source (no decorative intel).

- **Exists now:** read-only overlays of the deterministic engines (DB1 coverage rings, DET1
  contacts, ENG1 firing solutions), W3 presentation suite, OBJLINK-B objective/BLS/route
  evidence links, doctrine/objective evidence panels.
- **Adds per slot:** G-3B location confidence/AO halos on candidates · G-4 tasking ghosts
  (direction arrow, draft route, objective link) on the planning overlay · G-5 turn-beat state
  on the timeline · G-7 timeline-driven playback (only after tasking/timeline exist, L11).
- **Planned-vs-actual:** baseline + planning delta (L5) is the twin's "two layers" — the
  baseline never mutates; the working copy is the what-if surface. Risk / predicted-outcome
  views read the COA evaluation block, wargame `result` records, and MC distributions.
- Deployment stays modular + on-prem capable (offline image): every fusion source is an
  adapter; no cloud dependency is ever required for the core loop.

### 0.6.6 Coverage map (where each mandated capability lives)

| Capability | Where |
|---|---|
| Mission-first workflow / outcome catalog | §0.6.1–0.6.2 (model lands with **G-3A**) |
| Outcome-driven tasking | §2 + mission.success_criteria (G-4) |
| Data fusion model | §0.6.3 (G-3A normalization is the enforcement point) |
| Human-in-the-loop validation | §0.6.4 gates (already enforced; extended per slot) |
| Digital-twin visualization | §0.6.5 (incremental per slot) |
| Manual scenario builder support | §0.5 Path B (L13) |
| Upload / import support | §0.5 Path A (G-1/G-2, shipped) |
| Location intelligence | `docs/location-intelligence-design.md` (**G-3B**) |
| Incident history (مجرى الحوادث) | location design §B.3 + fusion row (LI-8) |
| COA review | §1 (shipped, G-3) |
| Unit tasking | §2 (G-4) |
| RED/BLUE/WHITE timeline | §3 (G-5) |
| Event journal boundary | §4 + global rule (shipped: commit boundary + journal) |

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
- **Live unit state (L13 test #5):** the prediction/feasibility stage consumes the unit's
  existing `readiness` / `supply` / `status` (World-State projection, DB-Lite enrichment) **when
  available**, and degrades honestly when absent (W3 carries nulls) — no fabricated values, same
  rule for both input paths.

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
| **`source.type` on EVERY planning object (L13)** | brief objects, units, objectives, AO, incidents, placement candidates, taskings, COAs, wargame turns | global taxonomy (§0.5): `uploaded_doc · external_json · mdmp_adapter · manual_app_entry · map_click · location_db · incident_log · llm_candidate · doctrine_rule` — schema-checked enum, composes with L6 invariants |
| Native builder → brief assembly (L13) | one brief builder module shared by Path A + Path B | in-app AO/objectives/units/incidents serialize into the same `operational_brief`; no upload-only branch anywhere in the AI pipeline |
| **`mission` object (L14)** | planning model root (additive; NOT scenario JSON) | §0.6.2 — outcome_type enum + success_criteria + requirements checklist; journaled on create/state-change |
| `OUTCOME_TYPES` enum (L14) | `server/sim/wargame-enums.js` (same registry as §4.3) | additive enum; AR labels in i18n, no free text |
| `conflicts[]` on fused artifacts (L15) | brief / candidates / fusion layer | source disagreements surfaced for review, never silently resolved |

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
| **Dual input path (L13)** | (1) COA review works end-to-end from **uploaded MDMP files**; (2) COA review works end-to-end from a **manual RMOOZ-built scenario with NO upload** (AO + objectives + units + incidents authored in-app → same brief → COAs); both runs produce the same brief/COA shape (source fields differ, structure identical); every object in both runs carries a valid `source.type`; no code path branches on "was uploaded" |
| **Tasking uses live unit state (L13)** | unit tasking prediction/feasibility consumes existing unit `readiness` / `supply` / `status` **when available** (DB-Lite/WS-enriched units), and degrades honestly (no fabricated values) when absent — asserted for both input paths |
| Location resolver dual path | see `docs/location-intelligence-design.md` §C — resolver works from **document text** AND from a **manually typed location** (LI‑11 parity tests) |
| **Mission-first (L14/L15)** | outcome pick → deterministic requirements checklist (same checklist for the same outcome, every run); checklist fillable builder-only AND upload-only with identical resulting planning-model shape; missing-info list explicit (no silent gaps); fusion conflict ⇒ `conflicts[]` + review (never silent); mission create/state-change journaled; no gate bypassed by any `source.type` |
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
