# PR-286L2 — Scenario Folder Catalog and Conversion Plan

**Date:** 2026-05-29
**Status:** AUDIT / DOCUMENTATION ONLY — no runtime changes, no UI changes, no new import path
**Scope:** Catalog every scenario-folder/data shape RMOOZ currently sees or expects, and define the canonical live-scenario JSON contract + the conversion roadmap that gets future formats into it.

---

## 0. Why this document exists

PR-286L0 added single-file Live Scenario Import. PR-286L1 added Scenario Folder Intake. PR-286L1A consolidated the source area into a primary/advanced hub. The system can now accept *one* shape — **RMOOZ-compatible JSON validated by `validateLiveScenarioJson()`** — directly into `window.RmoozScenario`. Everything else (Decision Packages, Wargame 3 full JSON, Command `.scen` / `.ini` / Lua) either needs an adapter or is detected-only.

Without a documented rulebook, the next PR is likely to add yet another import button. This document is the rulebook: every format gets a row in the conversion matrix, a place in the lifecycle map, and a clear answer to *"can the operator import this directly today?"*

---

## 1. Catalog — formats RMOOZ sees today

### A. RMOOZ Live Scenario JSON (the canonical format)

**Purpose:** Direct production import into `window.RmoozScenario.scenario`. Drives the Live Scenario Workspace.

**Entry point:** `validateLiveScenarioJson(json)` → `loadLiveScenarioFromJson(json)` (PR-286L0).

**Required fields:**
| Field | Notes |
|---|---|
| `scenario_id` (or `id` / `name` fallback) | Identity. Falls back to `"imported-live-scenario"` (validator warns). |
| `scenario_label` (or `title` / `name` fallback) | Display name in the live header. |
| `steps[]` | Non-empty array. Each step must have at least one of: `id`, `step_id`, `title`, `phase`, `time_label`, `narrative`, `situation`, `decision_point_baseline`, `objective_status_baseline`, `actors`, `affected`. |

**Optional accepted scenario fields:**
- `model_version`, `schema_variant`, `ported_from`
- `map_bbox` — `[west, south, east, north]`
- `phase_table` — array or number
- `obj` — `{ name, target_depth_km, carver, coord }`
- `bls_template[]`
- `blue_units_initial[]`, `red_units[]`
- `blue_unit_step_coords`, `red_unit_step_coords` — per-step `{ [uid]: [[lon,lat], …] }`
- `objectives`, `briefing`, `metadata`, `constraints[]`, `assumptions[]`
- `purpose_en`, `purpose_ar`, `end_state_en`, `end_state_ar`

**Optional accepted step fields:**
- `id` / `step_id` / `title` / `phase` / `time_label` / `kind_native`
- `narrative` / `narrative_en` / `narrative_ar` / `situation`
- `decision_point_baseline`, `objective_status_baseline`, `force_ratio_baseline`, `phase_line_km_baseline`, `ew_effect_baseline`, `bls_status_baseline`
- `actors[]`, `affected[]`, `engagement_arcs[]`, `unit_state`
- **Decision options** in any of: `decision_options`, `decisionOptions`, `options`, `coa_options`, `coaOptions` — used by PR-286L's Live Decision Action card

**Forbidden fields** (rejected anywhere in the tree by `_LIVE_IMPORT_UNSAFE_KEYS`):
- `scenario_compressed`, `Scenario_Compressed`, `compressed`, `compressedPayload`
- `lua`, `script`, `scripts`
- `execute`, `executeNow`, `applyNow`, `commitNow`
- `gate7Approved`
- `liveMutationAllowed: true`, `backendCommitAllowed: true`
- `backendUrl`, `fetchUrl`, `apiUrl`, `urlToFetch`
- `storageKey`, `localStorage`, `sessionStorage`, `indexedDB`

**Validator warnings (informational, do NOT block):**
- `SCENARIO_ID_FALLBACK_USED` — no id-like field provided
- `NO_COORDINATE_TABLES` — no `blue_unit_step_coords` / `red_unit_step_coords`
- `NO_DECISION_OPTIONS_IN_ANY_STEP` — no step has any of the 5 decision-options aliases
- `STEPS_LACK_TITLES_AND_PHASES` — none of the steps has `title` or `phase`

**Result:** **Direct import now** via PR-286L0 / PR-286L1.

---

### B. Decision Package folders

**Examples:** `DP_01_Fictional_Coastal_Corridor`, `DP_02_Desert_Logistics_Route`, `DP_03_Urban_Evacuation_Decision`.

**Purpose:** External app contract — "خطوات صنع القرار" (decision-making steps). These were authored as training/preview packages, not as full live scenarios.

**Typical files inside a DP folder:**
- `scenario_manifest.json` — package metadata (name, version, classification, team, date, step count)
- `stepXX.json` — one file per step (decision point, expected result text, references)
- optional `GeoJSON` overlay files for display
- optional `image` references
- `source_trace` and `read_only: true` flags on entries
- `no_auto_adjudication` flag

**Current entry point:** Existing **Decision Package Import** card (`#sw-local-json-source-card`) — preview-only path. Routes through `loadParsedDecisionPackageFixture` / `loadDecisionPackagePreview`. **Never touches `window.RmoozScenario`.**

**What overlaps with the canonical RMOOZ Live Scenario JSON:**
| Field | Overlap | Notes |
|---|---|---|
| Scenario name + version + classification | ✅ partial | Manifest has them; maps to `scenario_id` / `scenario_label` / `model_version`. |
| Per-step decision point text | ✅ direct | Could become `step.decision_point_baseline`. |
| Per-step objective status | ✅ partial | DPs include this; matches `step.objective_status_baseline`. |
| Per-step units list | ✅ partial | DPs include unit names; would need normalisation to `actors[]` / `affected[]`. |
| Source-trace + read-only badges | ✅ direct | Already structured; would map to `metadata.source_trace`. |

**What is missing for full live import:**
- No `blue_units_initial[]` / `red_units[]` master roster — DPs only show per-step unit lists
- No `blue_unit_step_coords` / `red_unit_step_coords` — DPs typically have GeoJSON layers, not per-step lon/lat tables keyed by UID
- No structured `decision_options[]` per step — DPs have one "decision point" sentence per step
- No `map_bbox`, no `phase_table` (in the W3-rich sense), no `obj` object

**How they could be converted later (Priority 1 adapter):**
1. Read `scenario_manifest.json` → produce `{ scenario_id, scenario_label, model_version, steps: [] }`
2. For each `stepXX.json` → produce `{ id, phase, decision_point_baseline, narrative, actors, affected }`
3. If GeoJSON layers exist with point-per-unit features, transform them into `blue_unit_step_coords` / `red_unit_step_coords`
4. If a step's decision text enumerates options, split into `decision_options[]`
5. Run the result through `validateLiveScenarioJson()` and load via `loadLiveScenarioFromJson()`

**What should remain decision-package-only:**
- Synthetic training packages like DP_01/02/03 — should stay as previews until intentionally converted
- Packages without unit rosters or coordinate data — can't drive the live map overlay

**Result:** **Advanced / Developer Import** (collapsed under `#sw-source-advanced-imports`). Not primary live import until a converter PR ships.

---

### C. Wargame 3 JSON / full-step data

**Path:** `UI_MOdified/data/scenarios/wargame3.json` (1.76 MB).

**Purpose:** Currently the *only* working full-scenario example in the codebase. Used by all PR-244–PR-285A dry-run preview functionality (now hidden by PR-287L0).

**What Wargame 3 already has that the canonical RMOOZ Live Scenario JSON contract needs:**
| Field | Wargame 3 has it | Notes |
|---|---|---|
| `scenario_id` | ✅ yes | `"wargame3"` |
| `scenario_label` | ✅ yes | `"Brega Amphibious Assault — 173-unit OOB, 17 phases"` |
| `model_version` | ✅ yes | |
| `map_bbox` | ✅ yes | Real bbox |
| `phase_table` | ✅ yes | Array form |
| `obj` | ✅ yes | `{ name, target_depth_km, carver, coord }` |
| `bls_template[]` | ✅ yes | |
| `blue_units_initial[]` (83 units) | ✅ yes | |
| `red_units[]` (70 units) | ✅ yes | |
| `blue_unit_step_coords` | ✅ yes | per-step `[lon,lat]` arrays for 80 of 83 blue units |
| `red_unit_step_coords` | ✅ yes | per-step `[lon,lat]` arrays for all 70 red units |
| `steps[]` (17 steps) | ✅ yes | Each step has `phase`, `time_label`, `narrative_en_fallback`, `decision_point_baseline`, `objective_status_baseline`, `actors[]`, `affected[]`, `engagement_arcs[]`, `unit_state` |
| Briefing fields (`purpose_en/_ar`, `end_state_en/_ar`, `constraints[]`, `assumptions[]`) | ✅ yes | |
| `nominal_throughput`, `throughput_ceilings_km`, `terrain_note` | ✅ yes | Extra W3-rich fields |
| `regression_expect` | ✅ yes | Reference values for regression testing |

**How its data maps to live workspace concerns:**
- **Live units:** `blue_units_initial` + `red_units` → unit rosters
- **Step coordinates:** `*_unit_step_coords[uid][stepIndex]` → live map overlay (drawn by `paintScenarioOverlay`)
- **Objective status:** `step.objective_status_baseline` → live header / `#sw-dp-card` / `#sw-wt-card`
- **Involved units:** `step.actors[]` ∪ `step.affected[]` → live decision context

**What Wargame 3 is missing for the live decision write path:**
- ❌ **No `decision_options[]` per step.** Confirmed by Python audit during PR-286L: 0 of 17 steps contain `decision_options` / `decisionOptions` / `options` / `coa_options` / `coaOptions`. Live Decision Action card shows "No decision options available for this live step" against the real W3 data.
- ❌ **No `selectedDecision` per step** — and per safety rules, the import must NEVER set this.
- ❌ **No `expectedResult`** — and per safety rules, the import must NEVER invent this.
- ❌ **No live operator event log embedded** — that lives in `_liveOperatorWorkflowState.events` (PR-286L), not in the scenario itself. Correct: events are session memory, not file persistence.

**Verdict:** Wargame 3 is the **closest existing match to the canonical RMOOZ Live Scenario JSON v1 contract** (Section 4 below). The only blocker for live decision testing is that no step has decision options. A future "Wargame 3 Live JSON Normalizer" (Priority 2 adapter) could either:
- (a) Add a sibling `wargame3-with-options.json` that has decision options layered on top, OR
- (b) Define the contract so `decision_options[]` are optional and the live decision card correctly shows "no options" — which it already does.

**Result:** **Reference template** for the canonical contract. Already importable today via PR-286L0/L1 if loaded as a JSON file (we just don't expose a button for it in production).

---

### D. Command Community Scenario Pack folders

**Path:** `~/Downloads/CommunityScenarioPack51` (audited 2026-05-28, see `project_csp51_audit.md`).

**Numbers:** 1,327 files, ~462 MB, 630 `.scen` scenarios, 632 `.ini` files, 20 PDF, 16 HTML, 8 Lua, 8 DOCX, 4 CSS, 4 TXT, 3 RTF, 1 XLSX, 1 JPG, 12 directories.

**Known file types:**
| Extension | Count | What it is | Importable now? |
|---|---|---|---|
| `.scen` | 630 | Command-style **binary** scenario containers (NOT JSON). Opaque. | ❌ no |
| `.ini` | 632 | CMO `<ScenarioUnits>` XML weapon-patch documents (unit GUIDs + weapon DB IDs). **NOT scenario metadata.** | ❌ no |
| `.lua` | 8 | All belong to `Lua/GulfofSidra1981/`. 6 of 8 mutate CMO game state. | ❌ **BLOCKED** |
| `.pdf` / `.docx` / `.html` / `.rtf` / `.txt` | ~50 | Briefing / documentation. | ❌ no (detect only) |
| `.png` / `.jpg` / `.css` | ~10 | Assets / styling. | ❌ no (detect only) |
| `.xlsx` | 1 | `Command Community Pack Scenario List.xlsx` — author / package master list. **Only non-binary author source.** | ❌ no (already harvested by PR-280A) |

**Current safe handling** (after PR-286L1):
- The Folder Intake scanner classifies each file by extension only — no content read
- `.scen` → `command_scen_binary`, marked `importable: false`, reason "Command .scen binary is not directly importable"
- `.ini` → `command_ini_weapon_patch`, marked `importable: false`, reason ".ini weapon patch is not scenario metadata"
- `.lua` → `lua_script`, marked `blocked: true`, reason "Lua scripts are blocked"
- briefings → `briefing_document`, marked `importable: false`, info only
- images → `asset`, marked `importable: false`, info only

**What direct conversion would need (Priority 4 adapter):**
- A documented `.scen` export format (Command itself can export to text/XML in some versions — needs investigation). Without an export step, RMOOZ has no path.
- A separate ingestion plan for the `.ini` weapon-patch DB (this is not scenario data — it patches the live weapon database). Likely never becomes live scenario import.
- Lua scripts stay **permanently blocked** for execution. If a Lua script defines static scenario state, it would need to be hand-transcribed.

**Result:** **Detected only, not imported directly.** PR-286L1 already implements correct detection.

---

### E. External Scenario Catalog

**Source:** `docs/scenario-pack-audit/external_scenario_source_manifest.json` (1.1 MB, 630 scenarios — built by PR-280A).

**Purpose:** Read-only catalog / metadata preview surface (PR-280B/C/281/282/284).

**What it provides:** Per-scenario metadata for browsing — title, year, author (from XLSX), campaign series, file size, confidence, source-trace fields, INI weapon-patch path, HTML/document briefing references, Lua presence flags.

**What it explicitly cannot do** (hardcoded by `external_scenario_catalog_entry` safety flags):
- `luaExecutionBlocked: true`
- `scenBinaryParsed: false`
- `iniTreatedAsMetadata: false`
- `conversionReady: false`
- `requiresHumanReview: true`
- `importStatus: 'catalog_entry_only'`

**How it could become live scenario import:** It cannot, until **either** (a) a `.scen` export adapter exists, **or** (b) an alternative readable source (HTML briefing converted to structured JSON) is documented for a subset of catalog entries. Currently only **3 of 630** scenarios have full HTML briefing packages (Iran Strike 2025, Operation Ghost Rider 1985, Gulf of Sidra 1981).

**Result:** **Browsing surface only.** Helps the operator know what exists. Does not become live import without an upstream conversion.

---

## 2. Conversion Matrix

| # | Folder / data type | Example | Current RMOOZ handling | Direct live import now? | Decision-package import? | Needs adapter? | Blocked / safety notes | Recommended next action |
|---|---|---|---|---|---|---|---|---|
| A | **RMOOZ Live Scenario JSON** | hand-authored / future converter outputs | `validateLiveScenarioJson` → `loadLiveScenarioFromJson` | **✅ YES** (PR-286L0/L1) | n/a | no | only `_LIVE_IMPORT_UNSAFE_KEYS` block unsafe fields | nothing — this is the canonical path |
| B | **Decision Package folder** | `DP_01_Fictional_Coastal_Corridor`, DP_02, DP_03 | `loadDecisionPackagePreview` → `#sw-local-json-source-card` | ❌ no (preview only) | **✅ yes** (existing) | yes — Priority 1 | preview-only by design; no scenario mutation | author Priority 1 converter or keep as preview |
| C | **Wargame 3 full-step JSON** | `UI_MOdified/data/scenarios/wargame3.json` | dry-run preview engine (now hidden by PR-287L0) | ✅ yes if loaded as JSON via PR-286L0/L1 (no UI button today) | n/a | optional — Priority 2 normalizer for canonical conformance | no `decision_options[]`; otherwise close to canonical | promote as reference template + optional normalizer |
| D | **Command `.scen` binary** | any `*.scen` under `CommunityScenarioPack51/Scenarios/` | folder intake classifier marks as `command_scen_binary`, NOT importable | ❌ no | ❌ no | yes — Priority 4 (export contract first) | binary, opaque, no JSON path | detect only until Command provides readable export |
| D2 | **Command `.ini` weapon patch** | any `*.ini` co-located with `.scen` | folder intake marks `command_ini_weapon_patch`, NOT scenario metadata | ❌ no | ❌ no | separate ingestion plan (NOT scenario import) | XML weapon-DB patches, not metadata | document weapon-DB patch flow separately if ever needed |
| D3 | **Lua script** | `Lua/GulfofSidra1981/*.lua` | folder intake marks `lua_script`, `blocked: true` | ❌ no | ❌ no | **never** for execution | blocked permanently per `feedback_ai_sim_boundary_rules.md` | stay blocked |
| D4 | **Briefing docs** | `*.pdf` / `*.docx` / `*.html` / `*.rtf` / `*.txt` | folder intake marks `briefing_document`, info only | ❌ no | ❌ no | Priority 5 (separate doc ingestion) | reference text only | display alongside scenario, not as scenario |
| D5 | **Assets** | `*.png` / `*.jpg` / `*.svg` / `*.css` | folder intake marks `asset`, info only | ❌ no | ❌ no | no | reference only | display alongside scenario |
| E | **External Scenario Catalog** | `external_scenario_source_manifest.json` | PR-280B/C/281/282/284 catalog preview surface | ❌ no | n/a | adapter only after .scen export exists | hardcoded `catalog_entry_only`, `conversionReady: false`, `requiresHumanReview: true` | browsing only |

**Summary count:**
- **Direct live import today:** 1 path (A)
- **Decision-package preview today:** 1 path (B)
- **Detected only:** 5 file categories (D, D2, D3, D4, D5)
- **Browsing only:** 1 path (E)
- **Reference template:** 1 path (C)

---

## 3. Lifecycle Map — the five correct routes

```
Route 1  ───────────────────────────────────────────────
RMOOZ Live Scenario JSON
  → Import as Live Scenario (single-file input)
  → validateLiveScenarioJson()
  → loadLiveScenarioFromJson()
  → window.RmoozScenario = { scenario, stepIndex: 0 }
  → refresh()
  → Live Scenario Workspace fully repaints

Route 2  ───────────────────────────────────────────────
Folder containing RMOOZ-compatible JSON  (+ unsupported neighbours)
  → Scan Scenario Folder (webkitdirectory input)
  → scanScenarioFolderFiles() classifies all by extension
  → JSON candidates listed; .scen / .ini / Lua / docs / assets listed as unsupported
  → User picks one JSON candidate
  → FileReader.readAsText on selected file ONLY
  → JSON.parse → loadLiveScenarioFromJson()
  → same as Route 1 from here

Route 3  ───────────────────────────────────────────────
Decision Package folder  (DP_01 / DP_02 / DP_03 / future external packages)
  → Advanced / Developer Imports (collapsed)
  → Decision Package Import card (#sw-local-json-source-card)
  → loadDecisionPackagePreview() builds preview cards
  → source-trace / decision-step analysis available
  → [Priority 1 adapter, not yet built] → RMOOZ Live Scenario JSON → Route 1
  → otherwise: preview only, never live

Route 4  ───────────────────────────────────────────────
Wargame 3 style full JSON  (or future scenarios in the same shape)
  → If already canonical-conformant: Route 2 (drop into a folder + scan)
  → If not yet conformant: [Priority 2 normalizer, not yet built]
  → Then Route 1

Route 5  ───────────────────────────────────────────────
Command .scen / .ini / Lua
  → Folder Intake detects + classifies, listed as unsupported
  → Lua permanently blocked
  → .scen requires a Command-side readable export
  → .ini routes through a separate weapon-DB-patch flow (NOT scenario import)
  → [Priority 4 adapter, only if a readable export becomes available]
  → otherwise: detect only forever
```

---

## 4. Canonical Target Format — **RMOOZ Live Scenario JSON v1**

This is the format every future converter (Priority 1, 2, 4) must produce.

### Minimum required
```jsonc
{
  "scenario_id":    "string-unique-id",     // OR scenario.id / scenario.name fallback
  "scenario_label": "Human-Readable Title", // OR title / name fallback
  "steps": [                                 // non-empty array
    { "phase": "briefing"                   // each step needs ≥1 recognised field
      /* ... */ }
  ]
}
```

### Recommended (rich format aligned with Wargame 3)
```jsonc
{
  "scenario_id":   "...",
  "scenario_label": "...",
  "model_version":  "1.x",
  "schema_variant": "rmooz-live-v1",
  "ported_from":    "optional source identifier",

  "map_bbox":       [west, south, east, north],
  "phase_table":    [/* phase identifiers or count */],

  "obj":            { "name": "...", "target_depth_km": 50, "carver": 6, "coord": [lon, lat] },
  "bls_template":   [/* landing-site entries */],

  "blue_units_initial":    [{ "uid": "...", "label": "...", "echelon": "...", "role": "...", "appear": "..." }],
  "red_units":             [{ "uid": "...", "label": "...", "echelon": "...", "role": "...", "appear": "..." }],
  "blue_unit_step_coords": { "uid-1": [[lon0,lat0], [lon1,lat1], ...] },
  "red_unit_step_coords":  { "uid-1": [[lon0,lat0], [lon1,lat1], ...] },

  "objectives":     [/* additional objective items */],
  "briefing": {
      "purpose_en":  "...",
      "purpose_ar":  "...",
      "end_state_en": "...",
      "end_state_ar": "...",
      "constraints":  ["..."],
      "assumptions":  ["..."]
  },
  "metadata":       { "source_trace": "...", "authored_by": "...", "authored_at": "..." },

  "steps": [
    {
      "id":          "STEP-0",
      "step_id":     "alt-id-alias",
      "title":       "...",
      "phase":       "briefing",
      "time_label":  "T+0",
      "kind_native": "native-phase-kind",

      "narrative":              "primary narrative",
      "narrative_en":           "English narrative",
      "narrative_ar":           "Arabic narrative",
      "situation":              "alternative narrative alias",

      "decision_point_baseline":  "decision-point text",
      "objective_status_baseline": "DORMANT | THREATENED | CONTESTED | DENIED | ACTIVE | COMPLETE | SUCCESS | FAILURE",
      "force_ratio_baseline":      "3:1",
      "phase_line_km_baseline":     12,

      "actors":         [{ "uid": "...", "side": "blue", "action_what": "...", "action_component": "..." }],
      "affected":       [{ "uid": "...", "side": "red", "status_change": "...", "cause_what": "..." }],
      "engagement_arcs": [/* optional */],
      "unit_state":     { /* optional per-step state map */ },

      "decision_options": [                  // ANY of these 5 aliases is accepted:
        { "id": "OPT-A", "label": "Action A", "summary": "...", "description": "...", "rationale": "..." }
      ]
      // also accepted: "decisionOptions", "options", "coa_options", "coaOptions"
    }
  ]
}
```

### Forbidden everywhere in the tree (rejected by validator)

- `compressed`, `compressedPayload`, `scenario_compressed`, `Scenario_Compressed`
- `lua`, `script`, `scripts`
- `execute`, `executeNow`, `applyNow`, `commitNow`
- `gate7Approved`
- `liveMutationAllowed: true`
- `backendCommitAllowed: true`
- `backendUrl`, `fetchUrl`, `apiUrl`, `urlToFetch`
- `storageKey`, `localStorage`, `sessionStorage`, `indexedDB`
- **`selectedDecision`** pre-filled by import — must be set by the operator at runtime through `recordLiveOperatorSelection()` only
- **`expectedResult`** invented by import — never set by the file; reserved for future adjudicator output
- **`previewComplete: true`** — never true in the canonical live format (only meaningful in dry-run, now hidden)

### Lifecycle commitments

A scenario produced by ANY converter MUST satisfy:
1. `validateLiveScenarioJson(json).passed === true`
2. After `loadLiveScenarioFromJson(json)`: `window.RmoozScenario.scenario === <deep-copy of normalised input>` and `window.RmoozScenario.stepIndex === 0`
3. `_liveOperatorWorkflowState.selections === {}` (scenario-scoped reset)
4. The Live Scenario Workspace fully repaints on the same call (header + nav + decision card + map overlay all coherent)
5. No fetch, no XHR, no storage write, no Gate-7 reachable from the import

---

## 5. Future Adapter Priorities

### Priority 1 — Decision Package → Live Scenario JSON converter contract
**Triggered by:** "We want DP_01 / DP_02 / DP_03 (or future external decision packages) to also work as live scenarios, not just previews."
**Deliverable:** A pure function `convertDecisionPackageToLiveScenario(manifest, steps[]) → { passed, scenario, warnings, blockedReasons }` that maps DP-shape fields to canonical Live Scenario JSON. NO scenario mutation. NO fetch. The output is fed back through `validateLiveScenarioJson()` before storage.
**Risk:** Decision packages lack unit rosters + coordinate tables, so the resulting live scenario will trigger `NO_COORDINATE_TABLES` warnings and `NO_DECISION_OPTIONS_IN_ANY_STEP` unless DP step descriptions enumerate options.

### Priority 2 — Wargame 3 full JSON → canonical Live Scenario JSON normalizer
**Triggered by:** "Make Wargame 3 the template for all future RMOOZ live scenarios."
**Deliverable:** A pure function `normaliseW3ToLiveScenario(w3json) → { passed, scenario, warnings }` that copies field-for-field (W3 already aligns with the canonical shape) and adds any missing canonical fields with safe defaults. May also add optional `decision_options[]` to specific steps if a sibling overlay file is provided.
**Risk:** None — W3 is already close to the canonical contract. This is mostly a no-op + assertion that future scenarios follow the same shape.

### Priority 3 — GeoJSON display layer → live map overlay / involved-units mapping
**Triggered by:** "Decision Package GeoJSON layers should drive the live overlay, not just be display-only."
**Deliverable:** A pure function `mapGeoJsonToStepCoords(geoJson, stepIndex) → { passed, blueCoords, redCoords, warnings }` that extracts point features by side and produces per-step coordinate entries. Used by Priority 1's DP converter.
**Risk:** GeoJSON features must be tagged with side + UID; otherwise mapping is ambiguous.

### Priority 4 — Command scenario export adapter contract (conditional)
**Triggered by:** "A readable Command export format becomes available."
**Deliverable:** A specification of the input format + a `convertCommandExportToLiveScenario(exportObj) → { passed, scenario, warnings }` builder. **Do not start this PR until the input format exists and is documented by Command.**
**Risk:** Without a readable export from Command, this adapter is impossible. `.scen` binary stays untouched.

### Priority 5 — Briefing / document reference ingestion (not live scenario)
**Triggered by:** "Show briefing PDFs / DOCX / HTML alongside the active live scenario."
**Deliverable:** A display-only surface (collapsible card or sidebar) that lists briefing references attached to the active scenario's `metadata.briefing_refs`. No content parsing — references only. NOT a path into `window.RmoozScenario`.
**Risk:** Must not be confused with live import. UI must clearly label as "reference".

---

## 6. Final Recommendation — next implementation PR

**Choose one of three options based on what the user wants to unlock next.**

### Option A — PR-286L3 Decision Package to Live Scenario JSON Converter Contract
**Choose if:** the operator wants to reuse DP_01 / DP_02 / DP_03 (or any external decision package) as a live scenario today, not just preview it.
**Output:** new function `convertDecisionPackageToLiveScenario`, exposed in `window.AppShellScenarioWorkspace`, NOT auto-wired to any button yet — first the contract; UI wiring is a follow-up.
**Cost:** Medium. Requires DP-shape → canonical-shape field mapping logic + new tests.

### Option B — PR-286L3W Wargame 3 Live JSON Normalizer Contract
**Choose if:** the operator wants Wargame 3 (and any future scenario authored in the same shape) to be officially declared the canonical reference template.
**Output:** new function `normaliseW3ToLiveScenario`, plus an explicit canonical-shape conformance test against wargame3.json that ships green.
**Cost:** Low. W3 already aligns; mostly assertion + documentation.

### Option C — PR-287L Live Step Status Baseline
**Choose if:** import / conversion planning is sufficient for now and we want to advance the live operator workflow itself (per-step status: `decided` / `skipped` / `blocked` / `pending`).
**Output:** new field on `_liveOperatorWorkflowState.selections[key].status`, status badge on the Live Decision Action card and Step Navigator, status changes recorded as events.
**Cost:** Low-medium. Builds directly on PR-286L's existing in-memory state; no new import or backend work.

---

### Author's recommendation

**Pick Option C (PR-287L).** Rationale:
1. Live import is already functional via two paths (single-file + folder).
2. Wargame 3 already conforms to the canonical contract well enough to serve as the reference today — Option B would be mostly documentation.
3. Decision-package conversion (Option A) requires authoring real DP samples and validating they have enough structure to populate coordinates + decision options. That's a research project.
4. **The live operator workflow itself is the thinnest** — the operator can select a decision, but cannot mark a step as "decided" or "skipped" yet. Adding per-step status is the next natural piece of the production workflow that PR-287L1's audit identified.

If the user prefers Option A or B explicitly, this document already contains the contract definition needed to start it.

---

## 7. Boundaries — what this document explicitly does NOT do

- ❌ Does not modify any runtime file (`*.html`, `*.js`, `*.css`).
- ❌ Does not modify `i18n.js`.
- ❌ Does not modify `wargame3.json` or any backend / dry-run fixture file.
- ❌ Does not add any new import button or UI surface.
- ❌ Does not parse `.scen` / `.ini` / Lua / PDF / DOCX.
- ❌ Does not call backend / `/api/sim/commit` / Gate-7.
- ❌ Does not convert any file today — only documents the conversion roadmap.
- ❌ Does not unhide Wargame 3 dry-run.
- ❌ Does not relax any unsafe-field check in `validateLiveScenarioJson`.

The next coding PR (whichever option is chosen) inherits the contract defined here.

---

**End of catalog + conversion plan.**
