# Applying CMO Scenario Editor Lessons

This note maps the practical workflow from P Gatcomb's Command: Modern Operations (CMO) tutorial videos onto the Rmooz scenario workspace and JSON scenario pipeline.

Source videos were reviewed through auto-generated YouTube transcripts, so exact spoken wording may be imperfect. The lessons below focus on stable workflow concepts, not verbatim quotes.

> **Accuracy note (2026-05-29 rewrite).** An earlier version of this note claimed many CMO concepts were already "direct matches" in the project, including fields that do **not** exist in the codebase (`unit_state[*].magazine`, `airframes`, `hulls_remaining`, radar/EMCON roles on `off_map_markers`). It also proposed "first targets" — Source/Clock/Environment cards, sides/postures — that are largely already built. This rewrite replaces those claims with status verified against the actual schema, adjudicator, and workspace HTML. Every status below is backed by a file reference.

---

## What This App Actually Is (read before proposing features)

Two facts change how every CMO lesson should be applied here:

1. **The workspace is a read-only review surface, not an editor.** [`app.html`](../UI_MOdified/client/app.html) line ~950 states: *"Read-only workspace. Scenario mutation is disabled."* The pipeline is:

   ```
   scenario JSON  →  scenario-validator  →  AI adjudicator (LLM, per step)
        →  Monte Carlo runner  →  journal / proposal safety boundary
        →  read-only workspace cards + map renderer
   ```

   CMO's tutorials are about an **authoring tool** (build geography → sides → doctrine → units → test). This app *consumes* an already-built scenario and presents it for operator review + AI-proposed decisions. So "add a builder card" is not a like-for-like port — it would change what the app is. The closest legitimate move is a guided **scenario-readiness review**, not an editor.

2. **The domain is ground/amphibious operational, not tactical air/naval.** The adjudicator's state model ([`adjudicator-schema.js`](../UI_MOdified/server/ai/adjudicator-schema.js)) is built around Beach Landing Sites (`BLS_STATUS`), phase lines (`phase_line_km`), throughput ceilings, force ratio, EW bands, and a Red-advance pipeline. CMO's signature concepts — WRA, IADS/EMCON, airfield components, strike/escort/tanker packages — are tactical air/naval mechanics. They are **genuinely absent** here, but they are also domain features that may or may not belong in an operational ground model. Treat them as "new domain," not "missing port."

---

## Scenario Sources — One Canonical Target, Five Source Formats

**Authoritative catalog: [`docs/pr-286L2-scenario-folder-catalog-and-conversion-plan.md`](pr-286L2-scenario-folder-catalog-and-conversion-plan.md).** Do not re-derive this — the project already classified every scenario format RMOOZ sees, with a conversion matrix, five lifecycle routes, and five adapter priorities. (An earlier version of this note invented a "two contracts" framing; that was incomplete.)

The **canonical target** is **RMOOZ Live Scenario JSON v1** (minimum: `scenario_id` + `scenario_label` + non-empty `steps[]`). Every converter must produce it. The five recognised source formats:

| | Format | Example | Import status today |
| --- | --- | --- | --- |
| **A** | RMOOZ Live Scenario JSON (the canonical target) | hand-authored / converter output | ✅ direct live import (`validateLiveScenarioJson` → `loadLiveScenarioFromJson`, PR-286L0/L1) |
| **B** | Decision Package folder | `DP_01..03` (خطوات صنع القرار) | preview only; needs a Priority-1 converter to go live |
| **C** | Wargame 3 full-step JSON | `wargame3.json` | reference template; loadable as JSON, only missing `decision_options[]` |
| **D** | **Command Community Pack (CSP51)** | `~/Downloads/CommunityScenarioPack51` | **detect-only** — `.scen` binary not parsed, `.ini` are weapon patches (not metadata), Lua **permanently blocked** |
| **E** | External Scenario Catalog | `external_scenario_source_manifest.json` (630 scenarios) | **browse-only** metadata (`conversionReady:false`, `requiresHumanReview:true`) |

The two formats that carry *importable scenario data* are the internal scenario (C, feeds the adjudicator) and the Decision Package (B) — detailed next. D + E are the actual CMO community scenarios (see "CSP51" below the comparison).

### Internal adjudication scenario (PR-286L2 format C; normalises toward target A)
- Example: [`data/scenarios/wargame3.json`](../UI_MOdified/data/scenarios/wargame3.json); contract in [`scenario-schema-spec.js`](../UI_MOdified/server/ai/scenario-schema-spec.js). Also the `Wargame1/2/3` source folders in the repo.
- Purpose: feed the **AI adjudicator + Monte Carlo runner**.
- Step shape: `actors` / `affected` / `engagement_arcs` (adjudication *deltas*); units via `*_unit_step_coords`; geometry inline + `ao_boundaries`.

### External Decision Package (PR-286L2 format B — "خطوات صنع القرار")
- Example: `~/Downloads/rmooz_dummy_decision_packages/DP_01..03` (DP_01 Coastal Corridor, DP_02 Desert Logistics, DP_03 Urban Evacuation). There is **no schema file** — the contract is the folder layout + `scenario_manifest.json` + `steps/stepXX.json`.
- Purpose: **read-only operator decision review**, authored by an external app / AI. Explicitly `read_only`, `no_auto_adjudication`, `dry_run_only`, `display_only`.
- Package layout: `scenario_manifest.json`, `steps/stepXX.json`, `geojson/stepXX.geojson`, `images/stepXX.png`, `references/doctrine_sources.json`, `reports/decision_report.md`, and a root `validation_checklist.json`.
- **Manifest fields**: `package_version`, `scenario_id`, `scenario_title_ar/en`, `created_by_app`, `generated_by_ai`, `language[ar,en]`, `map_bbox`, `coord_system`, **`sides` { BLUE/RED: `label_ar`, `label_en`, `role` }**, `objective` {id, name, position}, `total_steps`, `outcome`, `read_only`, `no_auto_adjudication`, `source_notes`, `required_files` {steps, geojson, images}.
- **Step fields**: `step_index`, `step_id`, `time_label`, `phase`, `situation` {ar,en}, `friendly/enemy_forces_summary`, **`decision_point` {question_ar, question_en, required}**, **`options[]` {id, text_ar, text_en, risk}**, `selected_decision`, `actions[]`/`counter_actions[]` {actor_uid, action, intended_effect}, `result` {ar,en}, `affected_units[]`, `objective_status` (**same enum as the adjudicator** — DORMANT/THREATENED/…), `risks[]`, `confidence`, `units[]` {uid, side, name, role, position, status}, **`source_trace` {source_file, source_geojson, source_image, confidence, note}**, **`safety` {read_only, dry_run_only, no_auto_adjudication, display_only}**.

**This is wired, not aspirational.** Ingest / preview / validate / render lives in [`scenario-workspace.js`](../UI_MOdified/client/shell/scenario-workspace.js): `normaliseDecisionPackage`, `loadDecisionPackagePreview`, `paintDecisionManifestCard`, `paintDecisionStepCard`, `paintDecisionUnitsCard`, `paintSourceTraceReviewCard`, `buildImportValidationSummary`, `buildPackageReadinessChecklist`, `paintImportedStepListPanel`, `paintImportDiagnosticsPanel`, `importDecisionPackageJson` (and ~15 more). The server exposes `/api/scenario/import` + `/api/scenario/events` and an `fs.watch` upload + live-reload watcher in [`web-server.js`](../UI_MOdified/server/web-server.js).

### Side-by-side

| | A. Internal adjudication scenario | B. External Decision Package |
| --- | --- | --- |
| Source | `data/scenarios/*.json` + Wargame folders | `DP_*` folders (Downloads / external app) |
| Contract | `scenario-schema-spec.js` | folder layout + manifest + step (no schema file) |
| Sides | array `{id,name_en,name_ar,color}` — optional, loader-defaulted | object `{BLUE/RED: label_ar,label_en,role}` — **authored** |
| Step focus | `actors`/`affected`/`engagement_arcs` (deltas) | `decision_point`/`options`/`selected_decision` (choices) |
| Units | `*_unit_step_coords` | per-step `units[] {uid,side,name,role,position,status}` |
| Geometry | inline + `ao_boundaries` | separate `geojson/stepXX.geojson` |
| Imagery | none | `images/stepXX.png` per step |
| Safety | adjudicator invariants | explicit manifest + per-step `safety{}` |
| Doctrine | none (LLM-prompt prose) | `references/doctrine_sources.json` (citations, display-only) |
| Consumed by | AI adjudicator + Monte Carlo | read-only DRP / import-preview cards |

**Gaps:** the manifest `required_files` array is not consumed by validation (0 refs); the external scenario *catalog* UI was reverted/deferred (`scen-catalog-contract.js` stays unlinked).

### CSP51 — the actual CMO scenarios (formats D + E)

`CommunityScenarioPack51` is a **Command: Modern Operations community scenario pack** — the very ecosystem these tutorials come from. It was deep-audited 2026-05-28 (`project_csp51_audit.md`; reports in [`docs/scenario-pack-audit/`](scenario-pack-audit/)): 1,327 files / ~462 MB / **630 `.scen`** + 632 `.ini` + 8 Lua + briefings + 1 XLSX master list.

The handling decision is already made **and built** (PR-280A → PR-284, PR-286L1):

- **Never parse `.scen`** (binary, opaque) and **never treat `.ini` as metadata** (they are `<ScenarioUnits>` weapon-DB patches, not scenario data). **Lua is permanently blocked** from execution (`feedback_ai_sim_boundary_rules.md`).
- The only non-binary metadata (the XLSX: title / year / package / author) was harvested into `external_scenario_source_manifest.json` (630 scenarios) by PR-280A.
- That manifest powers a **browse-only catalog** (`#sw-ext-select-section` selector + preview + source-trace) with hardcoded `conversionReady:false`, `requiresHumanReview:true`. The folder-intake scanner (PR-286L1) classifies `.scen`/`.ini`/Lua/docs/assets as **detected, not importable**.
- The **only sanctioned path** from a Command scenario to a live RMOOZ scenario is a future **Priority-4 export adapter** (Command emits a readable export → normalise → RMOOZ Live Scenario JSON v1). It does not exist; only **3 of 630** scenarios even have full HTML briefings that could be hand-transcribed.

**CMO tie-in (important):** "import the CMO scenarios" is, by design, *browse the metadata now* and *(maybe) build a Command-side export adapter later* — **not** a binary-parsing task. The CMO concepts in this doc (doctrine, WRA, IADS, mission packages) live *inside* those opaque `.scen` files; RMOOZ cannot extract them without an upstream export. So treat the tutorials as **design reference**, and CSP51 as a **catalog to browse**, not as content we can ingest into the workspace.

---

## Reviewed Videos

Full playlist inventory and caption-read status lives in [cmo-pgatcomb-playlist-inventory.md](cmo-pgatcomb-playlist-inventory.md).

Playlist pass status:

- Playlist inventory found 287 videos.
- Caption fetching successfully read 39 videos before YouTube/API throttling blocked the batch.
- 225 distinct videos were attempted across the interrupted transcript/API passes.
- 186 attempted videos failed after throttling/blocking started.
- 62 videos remain pending for a later slower/batched pass.
- Continuation attempt on 2026-05-31 resumed at playlist item 35 ("C: MO Tutorial - Refueling"). YouTube returned transcript API `IpBlocked`, and the lower-level timed-text endpoint returned HTTP 429, so caption fetching should pause until the block cools down or a sanctioned caption-access method is available.
- The 39 read videos cover the core scenario-builder topics: basics, layers/map settings, movement/attack, loadouts, scenario editor, event editor, CAS, naval/air, ASW, EW, submarine operations, mines, cargo, coordinated ASM strike, SEAD, IADS/SAMs, stealth, workflow, recon, bombing, disabling airfields, support missions, doctrine, WRA, proficiency, waypoint weapons, database reading, radar, grouping/formations, CAP/AAW patrols, quick battles, land cover, PGMs, torpedoes, point defense, and airfield construction.

| Topic | Video |
| --- | --- |
| Scenario editor foundations | <https://www.youtube.com/watch?v=vy5glbQ1G6k> |
| Event editor | <https://www.youtube.com/watch?v=TCApvEgog4U> |
| Building a mission, part 1 | <https://www.youtube.com/watch?v=ixu2x6doLFA> |
| Building a mission, part 2 | <https://www.youtube.com/watch?v=wCaE47aRaHA> |
| Building a mission, part 3 | <https://www.youtube.com/watch?v=b5RbZgiSpPU> |
| Building a mission, part 4 | <https://www.youtube.com/watch?v=0SwTlMuRdzo> |
| Doctrine settings | <https://www.youtube.com/watch?v=XjfL2uNhGR0> |
| Weapon Release Authorization | <https://www.youtube.com/watch?v=YepPcVyCtnA> |
| WRA and doctrine interaction | <https://www.youtube.com/watch?v=H4_mmTVn_Yk> |
| Unit proficiency | <https://www.youtube.com/watch?v=NPvpb7s5SNE> |
| Airfield construction | <https://www.youtube.com/watch?v=5xB8RNooK50> |
| Legacy IADS/SAM scenario setup | <https://www.youtube.com/watch?v=sfxAYvnk8FM> |
| Modern IADS/SAM scenario setup | <https://www.youtube.com/watch?v=flw8O10fxPE> |

---

## CMO Concept → Verified Status In This Codebase

Legend:
- **BUILT** — exists in schema *and* surfaced in the workspace today.
- **SCHEMA-READY** — schema accepts it and the loader auto-defaults it, but no scenario authors it and no dedicated card surfaces it.
- **PARTIAL** — some data or UI exists, with meaningful gaps.
- **ABSENT** — confirmed zero presence in client + server source (excluding `node_modules` and i18n string tables).

| CMO concept | Status | Evidence |
| --- | --- | --- |
| Pick database / version before building | **BUILT** | `model_version`, `schema_variant`, `ported_from` ([`scenario-schema-spec.js`](../UI_MOdified/server/ai/scenario-schema-spec.js) l.45–92); Scenario Metadata + `sw-scenario-source-section` cards |
| Choose location / map bounds | **BUILT** | `map_bbox`, `obj`, `pipeline`, `ao_boundaries`; Objective & Landing Sites group + map render |
| Create sides | **SCHEMA-READY** | `sides` optional (schema l.114); **absent from `wargame3.json`**; loader default-fills BLUE/RED/NEUTRAL. No dedicated Sides card |
| Set side posture (directional) | **SCHEMA-READY** | `postures` matrix optional (schema l.116); **absent from data**; loader defaults BLUE↔RED HOSTILE. Not surfaced as a card |
| Build side briefing | **BUILT** | `scenario_label`, `purpose_en/ar`, `end_state_en/ar`; Scenario Brief + Briefing header cards |
| Set start time & duration | **PARTIAL** | `phase_table` + `steps[].time_label`/`elapsed_hours` act as the clock; no explicit `start_utc`/`duration` field |
| Place units | **BUILT** | `blue_units_initial`, `red_units`, `*_unit_step_coords`; Unit Composition card + map |
| Group units / formations | **PARTIAL** | `echelon`/`role` fields only; no formation objects |
| Mission / AI setup | **BUILT** (different shape) | adjudicator-agent + Decision Point + AI Proposal Preview/Review + `steps[].actors`/`affected`/`engagement_arcs` (schema l.158–163) |
| Weather & terrain effects | **PARTIAL** | `terrain_note` + BLS `terrain_friction` + throughput ceilings exist; **weather/sea_state ABSENT** (matches are i18n strings only) |
| Magazines / loadouts | **ABSENT** | `magazine`/`airframes`/`hulls_remaining`/`suppression` = 0 in schema (earlier doc fabricated these). Only `strength` exists |
| Realism settings | **PARTIAL** (different) | safety invariants + read-only/preview boundary substitute for it; no realism-toggle block |
| Event triggers / actions | **PARTIAL** | Event Log ledger + adjudicator hooks + journal exist; **no structured `events[]`** (trigger/condition/action rules) |
| WRA | **ABSENT** | 0 occurrences |
| IADS / SAM network, EMCON | **ABSENT** | `off_map_markers` carry only `{id, side, type, coord, sidc, name}` — no radar role, EMCON, or coverage; `emcon` = 0 |
| Airfield components | **ABSENT** | BLS + `off_map_markers` are point installations; no runway/hangar/fuel/magazine model |
| Doctrine (layered ROE/EMCON) | **ABSENT** (as scenario data) | "doctrine" hits are flank-drawing presets (`config.js` `FLANK_DOCTRINE`, `free_draw_signature.js`) + LLM-prompt prose (`adjudicator-system*.txt`) — not policy data |
| Unit proficiency | **ABSENT** | 0 occurrences |

> The table above is the **internal adjudication schema**. The **external Decision Package** contract (see "Two Scenario Contracts") additionally *authors* sides-with-roles, decision options, per-step `source_trace`, explicit `safety{}` flags, and `doctrine_sources` citations — so several rows are "more built" on the import side than on the internal-schema side.

---

## What The Workspace Already Renders

Before proposing any new card, check this list — it is the actual set of sections in [`app.html`](../UI_MOdified/client/app.html) (§939–2210), painted by [`scenario-workspace.js`](../UI_MOdified/client/shell/scenario-workspace.js):

- **Briefing / source**: Scenario Briefing header, Scenario Metadata, Scenario Brief, Scenario Source section (`sw-scenario-source-section`)
- **Clock**: Scenario Phase Timeline, Live Step Navigator (play/speed), Scenario Timeline — *three overlapping clock surfaces*
- **Forces & state**: Force Balance, Blue Force Snapshot, Red Force Snapshot, Red Attrition, Engagement Tempo, Scenario Unit Composition
- **Objective**: Objective Snapshot, BLS Snapshot
- **Step detail**: Step Summary, Step Narrative, Step Effects, Decision Point
- **Decision / AI**: Operator Intent Draft, AI Proposal Preview, Proposal Review, Decision Preview Summary, DRP Selection Review (with the dry-run / live-mutation / backend-commit / expected-result / preview-complete safety fields)
- **Ledger**: Event Log; Legacy Summary ("Current Scenario")
- **Decision Package import** (renders external `DP_*` packages — see "Two Scenario Contracts"): Decision Manifest card, Decision Step card, Decision Units card, Source-Trace Review card, Import Validation card, Package Readiness Checklist, Imported Step List + Step Detail, Import Diagnostics; plus `sw-ext-select-section`, `sw-ext-trace-section`, `sw-dpkg-source-review-card`
- **Unit panel (right)**: Unit Identity, Position, Operational Status, Combat Readiness, Command & Control, AI Advisor, AI Proposal Review
- **Separate panel**: Boundary Audit

This is ~25 cards. Several overlap heavily (see Consolidation Opportunity below).

---

## Consolidation Opportunity (CMO "feels better organized" — here is why and the fix)

CMO presents one linear build flow; this app presents ~25 read-only cards organized around the adjudication/preview flow, with visible redundancy. Most of the "better organization" win is **grouping + dedup of existing cards**, not new features. Proposed CMO-style grouping (all content already exists):

1. **Source & Provenance** — Scenario Metadata + Scenario Source section (currently two places)
2. **Geography & Objective** — Objective Snapshot + BLS Snapshot + AO
3. **Sides & Posture** — schema-ready + loader-defaulted today, but never shown; surface it as one card
4. **Clock & Phases** — Phase Timeline + Step Navigator + Scenario Timeline (three clocks → one)
5. **Forces & Readiness** — Force Balance + Blue + Red + Attrition + Engagement Tempo + Unit Composition
6. **Narrative & Brief** — Scenario Brief + Step Summary + Step Narrative + Step Effects
7. **Decision & AI Proposal** — Decision Point + Operator Intent Draft + AI Proposal Preview + Proposal Review + Selection Review + Decision Preview Summary (*six* surfaces for one flow → one grouped section)
8. **Event Log & Journal** — Event Log + journal/audit

Known overlaps to resolve: Legacy Summary's "Current Scenario" duplicates Scenario Metadata + Force Balance; the Live Scenario header overlaps the Step Navigator.

---

## Good Practices To Adopt

1. Keep source/version metadata authoritative (already captured; just surface it once, not twice).
2. Define the operational area before units: `map_bbox`, objective, BLS, AO, pipeline (already enforced by the validator's required keys).
3. **Author** sides and postures in scenario data instead of relying on loader defaults, then surface them as a card.
4. Treat `phase_table` as the scenario clock and keep `phase_table.length === steps.length` (validator already checks count alignment).
5. Add environmental constraints where the domain needs them: terrain friction + throughput ceilings exist; weather/sea-state would be new.
6. Keep readiness explicit using fields that actually exist (`strength`, `echelon`, BLS status/throughput) — do not reference magazine/airframe/hull fields, which the schema does not have.
7. Keep AI behavior legible through `actors`, `affected`, `engagement_arcs`, and decision options rather than hidden map mutation (already the design).
8. Preserve the safety model: preview first, operator review, controlled commit/apply only through approved paths.

---

## Video-Specific Lessons

Each subsection is tagged with its verified status here. Candidate JSON shapes are **proposed designs for concepts not present today** unless marked otherwise.

### Scenario Editor Foundations
*Status: the build sequence is an editor concept; this app reviews, it does not author.*

The tutorial's sequence — geography → database → sides → posture → doctrine/ROE → time → weather/realism → units → test — is the canonical CMO build order. Stable points worth keeping as review-ordering principles:

1. Database/version is fixed before unit placement. (We capture version metadata; **BUILT**.)
2. Posture is directional. (Schema models this as a `postures[from][to]` matrix; **SCHEMA-READY**.)
3. Briefings are scenario data, not decoration. (**BUILT**.)
4. Doctrine and player-editable settings are design controls. (**ABSENT** as data here.)
5. Weather and sea state affect sensors/movement/weapons. (**ABSENT**; only `terrain_note` exists.)
6. Unit copy/clone must be explicit about cargo/loadout/state. (N/A — no editor.)
7. A quick test run catches range/fuel realism failures. (Analogue: Monte Carlo runner + validator.)

Rmooz implication: pursue a guided **scenario-readiness review** ordering of the *existing* cards before adding any new authoring surface.

### Event Editor
*Status: **PARTIAL**. Event Log + adjudicator hooks + journal exist; structured `events[]` rules do not.*

CMO events are named rules of triggers + conditions + actions, separate from Lua scripting. Here, the Event Log is a *ledger of things that happened*, not a *rule that fires*. If we add rules, keep them previewable and log firings as timeline facts (the journal already does this for proposals).

Proposed shape (not present today):

```json
{
  "events": [
    {
      "id": "EVT-CONVOY-DETECTED",
      "label": "Convoy detected",
      "repeatable": false,
      "triggers": [{ "type": "unit_enters_area", "side": "RED", "area_id": "AO-SEA-LANE" }],
      "conditions": [{ "type": "side_posture", "from": "BLUE", "to": "RED", "posture": "HOSTILE" }],
      "actions": [
        { "type": "message", "side": "BLUE", "text": "Convoy contact reported." },
        { "type": "score_delta", "side": "BLUE", "delta": 15 }
      ]
    }
  ]
}
```

### Building A Mission
*Status: **BUILT** as adjudicated narrative (`actors`/`affected`/`engagement_arcs` + Decision/Proposal flow); **ABSENT** as structured strike/escort/tanker packages.*

CMO models missions as packages with roles (strikers, escorts, tankers, AEW, SEAD), target sets, prosecution/transit areas, and refuel/overflight constraints. Those are tactical-air concepts; this app instead expresses per-step actor actions and AI-proposed decisions. Adding mission packages would be a new domain layer, not a reorg.

Proposed shape (not present today):

```json
{
  "missions": [
    {
      "id": "MSN-STRIKE-001", "type": "land_strike", "side": "BLUE",
      "status": "planned", "start_time_label": "H+02",
      "targets": ["OBJ-CHEM-PLANT-1"],
      "areas": { "prosecution": "AREA-STRIKE-BOX", "transit": "ROUTE-NORTH" },
      "packages": [
        { "role": "striker", "unit_uids": ["BLUE-F16-1", "BLUE-F16-2"] },
        { "role": "escort",  "unit_uids": ["BLUE-F15-1"] },
        { "role": "support", "unit_uids": ["BLUE-AEW-1", "BLUE-TANKER-1"] }
      ],
      "constraints": { "requires_refuel": true, "overflight_required": ["TURKEY"], "launch_authority": "operator" }
    }
  ]
}
```

### Doctrine Settings
*Status: **ABSENT** as scenario data. "Doctrine" in this codebase = flank-drawing presets + LLM-prompt prose.*

CMO doctrine is a layered policy (scenario → side → mission → unit) over ROE, EMCON, plotted-course behavior, fuel/withdrawal, and self-defense. If added, the UI must show inherited vs overridden and validate doctrine against intent.

Proposed shape (not present today):

```json
{
  "doctrine": {
    "defaults": { "weapon_control_status_air": "tight", "emcon": "passive", "withdraw_on_fuel_state": "bingo" },
    "overrides": [
      { "scope": "mission", "id": "MSN-STRIKE-001",
        "values": { "weapon_control_status_air": "free" }, "locked": ["weapon_control_status_air"] }
    ]
  }
}
```

### Weapon Release Authorization
*Status: **ABSENT** (0 occurrences).*

WRA is a target-class weapon policy (when/how-many/what-range/what-target/self-defense), and it only works if doctrine permits the engagement. Treat as policy, validate against doctrine and target classes.

Proposed shape (not present today):

```json
{
  "wra": [
    { "scope": "mission", "id": "MSN-STRIKE-001", "target_class": "aircraft",
      "weapon_class": "aam_bvr", "range_policy": "within_dlz",
      "salvo_policy": { "mode": "fixed", "quantity": 2 }, "self_defense": true }
  ]
}
```

### Unit Proficiency
*Status: **ABSENT** (0 occurrences).*

Proficiency is crew/unit skill (low → ace) affecting detection and engagement quality, set at side level with unit overrides. Keep distinct from `strength`/readiness; use as an adjudication input.

Proposed shape (not present today; would extend the existing `sides`):

```json
{
  "sides": [{ "id": "BLUE", "default_proficiency": "regular" }, { "id": "RED", "default_proficiency": "veteran" }],
  "unit_overrides": [{ "unit_uid": "RED-SAM-ELITE-1", "proficiency": "ace" }]
}
```

### Airfield Construction
*Status: **ABSENT**. BLS and `off_map_markers` are point installations with no component model.*

CMO airfields fail when modeled as single units: runways need access points, taxiways ≠ runway-grade, hangars/fuel/magazines/parking matter. A component model + minimum-viable-component validation would be new here.

Proposed shape (not present today):

```json
{
  "installations": [
    { "uid": "BASE-TUMACO", "type": "airfield", "side": "BLUE", "coord": [-78.75, 1.82],
      "mode": "detailed", "orientation_deg": 45,
      "components": [
        { "uid": "BASE-TUMACO-RWY-1", "type": "runway", "length_m": 2600, "access_points": 2 },
        { "uid": "BASE-TUMACO-HGR-1", "type": "hangar", "capacity_aircraft": 12 },
        { "uid": "BASE-TUMACO-FUEL-1", "type": "fuel_storage" },
        { "uid": "BASE-TUMACO-MAG-1", "type": "magazine" }
      ] }
  ]
}
```

### IADS And SAMs
*Status: **ABSENT** as a network. `off_map_markers` carry `{id, side, type, coord, sidc, name}` only — no role, EMCON, or coverage.*

Air defense is a network problem: radar roles (early warning / acquisition / fire control / organic), EMCON state per node, coverage envelopes, terrain masking. Today there are individual markers, not a network model.

Proposed shape (not present today):

```json
{
  "iads_networks": [
    { "id": "RED-IADS-NORTH", "side": "RED", "doctrine": "integrated_air_defense",
      "nodes": [
        { "unit_uid": "RED-EWR-1", "role": "early_warning_radar", "emcon": "active" },
        { "unit_uid": "RED-SAM-1", "role": "sam_battery", "emcon": "passive_until_cued" }
      ],
      "coverage_notes": "Legacy network; EW radar cues passive SAM sites." }
  ]
}
```

---

## Additional Caption-Read Topics

The expanded 39-video caption pass adds these planning themes beyond the initial scenario-builder subset:

1. Basics, layers, and map settings: the app needs clear layer posture, map readability controls, and a distinction between operational data layers and decorative map layers.
2. Moving and attacking: unit movement and attack actions should be explicit planned actions with previewable consequences, not drag-only map gestures.
3. Aircraft/ship loadouts: loadout choice belongs in mission planning and validation because range, role, and target compatibility depend on it.
4. CAS, bombing, PGMs, waypoint weapons, and coordinated ASM strikes: strike planning needs target selection, release geometry, weapon type, timing, and deconfliction.
5. Naval/air, ASW, submarine, torpedoes, mines, and point defense: maritime scenarios need separate modeling for detection, search patterns, self-defense, mine threats, and subsurface uncertainty.
6. EW, radar, stealth, recon, and land cover: the app should treat detection as scenario state, affected by sensors, terrain, emissions, stealth, altitude, and line of sight.
7. Cargo and support missions: logistics movement is a first-class mission type; cargo, unloading, support tasking, and targets of opportunity need their own validation.
8. Database reading: producers need a way to inspect source platform metadata and understand what unit capabilities mean before placing units.
9. Grouping and formations: formations need leader, spacing, relative bearing, orientation, and group membership semantics.
10. CAP/AAW patrols and prosecution areas: patrol missions need reference areas, prosecution zones, target filters, and doctrine/WRA alignment.
11. Quick battles and quick-battle locations: the builder can eventually support templates that prefill geography, sides, units, and objectives, then let the operator customize.

Rmooz implication: the app should evolve cautiously from scenario import/review toward explicit setup, mission, detection, logistics, and validation surfaces only where those tactical-air/naval concepts fit the operational model.

---

## Aspirational Superset (for reference, not a build plan)

CMO's full builder implies these top-level concepts. Roughly half already exist here (marked); the rest are new domain work:

1. `scenario_source` — **mostly BUILT** (scattered as `model_version`/`schema_variant`/`ported_from` + Source section)
2. `scenario_clock` — **PARTIAL** (phase_table/steps; no explicit start/duration)
3. `environment` — **PARTIAL** (terrain only; no weather/sea)
4. `sides` — **SCHEMA-READY**
5. `postures` — **SCHEMA-READY**
6. `doctrine` — ABSENT
7. `wra` — ABSENT
8. `installations` — ABSENT (point markers only)
9. `missions` — ABSENT as packages (narrative actors exist)
10. `events` — PARTIAL (log/journal exist; no rules)
11. `iads_networks` — ABSENT
12. `validation` — **BUILT** (scenario-validator + adjudicator-validator already enforce counts, enums, ceilings)

---

## Realistic First Targets (revised)

Ordered by value-to-effort, and aligned to "this is a read-only review surface":

1. **Consolidate the existing ~25 cards into the 8 groups above.** Pure reorg + dedup. No schema change, no new domain. Biggest "looks organized like CMO" win.
2. **Surface Sides & Posture.** The schema and loader already produce them; add one read-only card showing the (currently invisible) side list + directional posture matrix.
3. **Add an explicit clock field** (`scenario_clock.start_utc` / `duration_hours`) as optional, defaulting from `phase_table`. Small, closes a real PARTIAL gap.
4. **Decide domain fit before building** doctrine/WRA/IADS/missions/installations/weather. These are tactical-air concepts in a ground/amphibious model — scope them deliberately (separate decision), not as "missing ports."
5. **Keep everything read-only** behind the existing preview → operator-review → controlled-apply boundary.

---

## Notes For Future Editors Of This Doc

- Verify any "we already have X" claim with `grep` against `UI_MOdified/client` + `UI_MOdified/server` (exclude `node_modules` and the i18n string tables) before writing it down.
- The schema source of truth is [`scenario-schema-spec.js`](../UI_MOdified/server/ai/scenario-schema-spec.js); the runtime state model is [`adjudicator-schema.js`](../UI_MOdified/server/ai/adjudicator-schema.js); the rendered surfaces are in [`app.html`](../UI_MOdified/client/app.html) + [`scenario-workspace.js`](../UI_MOdified/client/shell/scenario-workspace.js).
- `sides`/`postures` being in the schema does **not** mean a scenario authors them — `wargame3.json` does not; the loader synthesizes defaults.
- There are **two scenario contracts** (internal adjudication scenario vs external Decision Package) — see that section before claiming a field is "missing." Sample Decision Packages live at `~/Downloads/rmooz_dummy_decision_packages/DP_01..03`; the import code is in `scenario-workspace.js` + `web-server.js`.
