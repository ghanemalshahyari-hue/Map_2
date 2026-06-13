# Import Scenario JSON Loss Audit

Date: 2026-06-13
Run: IMPORT-SCENARIO-JSON-LOSS-AUDIT-A
Scope: audit only. No code changed except this report. No commits or pushes.

## Executive Summary

The data loss is primarily a **wrong import path** issue, not JSON parsing corruption.

The visible **Import Scenario** wizard is rendered by `UI_MOdified/client/shell/scenario-import-wizard.js::mount()`. It has Red DOCX and Blue DOCX inputs plus an optional **External MDMP JSON** bundle input. It does **not** have a general Step 1 / multi-country / operational-brief JSON file input, and it does not support pasted JSON.

The separate **Live Scenario JSON** card is rendered in `UI_MOdified/client/app.html` and handled by `UI_MOdified/client/shell/scenario-workspace.js::initLiveScenarioImport()`. That path parses JSON in the browser and calls `loadLiveScenarioFromJson()`, which requires a full RMOOZ scenario with non-empty `steps[]`. It does not call `/api/wargame-sim/analyze`, so Step 1 fields such as `participants`, `friendly_forces.countries`, `proposed_units`, `placement_candidates`, and `country_bases` are never adapted into `operational_brief`.

There is also a secondary Review UI/base-card display gap: `base-status-panel.js::unitBelongsToAnchor()` links proposed units to bases by side + name/coordinates only. It does not check `assigned_base_id` / `base_id`, although `demo-units.js::buildGroupsFromAnchors()` does. Therefore some proposed units can be present in the analyze payload but missing from Base Status cards.

## Entry Points

| Surface | File / function | JSON support | Endpoint | Result |
|---|---|---:|---|---|
| Timeline Import button | `UI_MOdified/client/shell/timeline.js` calls `AppNativeScenarioLoader.openImportScenario()` | indirect only | opens modal | Opens `wg-wizard-card` |
| Import Scenario modal | `native-scenario-loader.js::openImportScenario()` -> `openImportCardModal('wg-wizard-card', 'Import Scenario')` | MDMP JSON bundle only | `/api/wargame-sim/analyze` | Review path only for DOCX or MDMP bundle |
| Import Scenario card | `scenario-import-wizard.js::mount()` | Red/Blue `.docx`; optional `#wg-wz-mdmp` `.json,.jsonc` multiple | stage DOCX or analyze bundle | No general JSON input |
| Live Scenario JSON card | `app.html` `#sw-live-scenario-import-input` | `.json,application/json` file | none | Browser-only full scenario load |
| Scenario folder JSON | `scenario-workspace.js::importSelectedFolderScenarioJson()` | `.json` candidate | none | Browser-only full scenario load |
| Decision Package Import | `app.html` `#sw-dpkg-*` | manifest + step JSON | none | Decision package preview, not live scenario |

## Browser Parsing

| Path | Exact parser | What is preserved/lost |
|---|---|---|
| MDMP JSON bundle in Import Scenario | `scenario-import-wizard.js`, `f.text()` only; parse happens server-side | Browser preserves file text in `{ bundle:[{ filename, content }] }` |
| Live Scenario JSON | `scenario-workspace.js::initLiveScenarioImport()`, `JSON.parse(e.target.result)` | Browser parses full object, then validator requires `steps[]`; no adapter runs |
| Folder JSON import | `scenario-workspace.js::importSelectedFolderScenarioJson()`, `JSON.parse(...)` | Same as Live Scenario JSON |
| Decision package import | `scenario-workspace.js::readJsonFile()`, `JSON.parse(...)` | Goes to decision package adapter, not scenario/brief review |

The browser JSON parser itself is not dropping Arabic fields or unknown keys. In the Live Scenario path, after validation, `validateLiveScenarioJson()` deep-copies with `JSON.parse(JSON.stringify(json))`, so full scenario-shaped JSON is preserved. Non-scenario Step 1 JSON is rejected at `STEPS_MISSING_OR_EMPTY`, or loaded into the wrong surface if it happens to contain `steps[]`.

## Server Analyze Path

`UI_MOdified/server/wargame-sim-bridge.js` handles `/api/wargame-sim/analyze`.

Decision tree:

| Condition | Server classification | Data behavior |
|---|---|---|
| empty body / GET | staged DOCX analysis | Builds operational brief from staged Red/Blue DOCX |
| `{ bundle:[...] }` | `mdmp_external` | Each entry parsed as JSONC, then adapted by `mdmp-external-adapter.js` |
| `{ workbook_base64 }` | `multi_country_step1` | XLSX -> `multi-country-orbat.js` -> operational brief |
| raw object with `participants` or `friendly_forces.countries` | `multi_country_step1` | Preserves proposed units, placement candidates, country bases |
| raw object with `countries[].bases`/air/naval/land bases | `multi_country_step1` | Preserves coalition layer |
| `red_units` + `blue_units_initial` | `rmooz_scenario` | Validates/normalizes scenario; not a Step 1 review payload |
| `operational_brief` | `operational_brief` | `normalizeBrief()` preserves known brief arrays |
| unknown | `unknown` | `unknownToBrief()` maps only mission/intent/objectives/phases/friendly/enemy summaries; drops Step 1-specific arrays |

Server-side multi-country support is present and passes existing tests, but the Import Scenario UI does not expose a general JSON file path that posts the selected JSON object to this decision tree.

## Count Table

Representative flexible Step 1 fixture from `UI_MOdified/scripts/test-multi-country-flexible-a.js`:

| Field | Raw JSON | Browser parse in Import Scenario card | Request payload | Server analyze | Operational brief | Review UI | Map/Base cards |
|---|---:|---:|---:|---:|---:|---:|---:|
| participants | 3 | n/a for general JSON | n/a | 3 if manually posted | 3 | rollup visible | not map objects |
| countries | 3 derived | n/a | n/a | 3 | 3 | rollup visible | country shown on base card |
| RED countries | 1 | n/a | n/a | 1 | 1 | visible | visible via base side |
| BLUE countries | 2 | n/a | n/a | 2 | 2 | visible | visible via base side |
| proposed_units | 4 | n/a | n/a | 4 | 4 | Import Summary shows 4 | may be orphaned if only `assigned_base_id` links |
| placement_candidates | 3 | n/a | n/a | >=3 | >=3 | Placement panel shows | used as base anchors |
| country_bases | 5 | n/a | n/a | 5 | 5 | base counts visible | available to Base Status |
| enemy_bases | 3 | n/a | n/a | 3 | 3 | base counts visible | available |
| friendly_bases | 0 in `friendly_trial_bases`; BLUE bases live in `country_bases` | n/a | n/a | 0 trial / 2 country bases | 0 trial / 2 country bases | total via coalition/base rollup | available via `country_bases` |
| objectives | 0 | n/a | n/a | 0 | 0 | missing objective warning | operator sets objective later |
| units with `assigned_base_id` | fixture-specific | n/a | n/a | preserved if present | preserved if present | present in proposed_units | Base Status does not join by id today |
| units attached to base | depends on names/coords | n/a | n/a | payload intact | payload intact | present | name/coord matches only |
| units orphaned | depends on names/coords | n/a | n/a | payload intact | payload intact | present | any id-only assignments |

`n/a` here means the live Import Scenario card has no general JSON file input for that raw object. If the same JSON is manually POSTed to `/api/wargame-sim/analyze`, the server adapter preserves the data.

## Root Cause

| Class | Finding |
|---|---|
| wrong import path | The user-facing Import Scenario card does not route generic JSON to `/api/wargame-sim/analyze`. |
| legacy/card ambiguity | The adjacent Live Scenario JSON card looks like an import path but bypasses Review AI Understanding and server adapters. |
| field loss in browser parser | Not for valid scenario JSON. The browser parser preserves objects; the path rejects non-scenario JSON before adaptation. |
| field loss in server builder | Not for recognized `multi_country_step1`; tests show `normalizeBrief()` preserves coalition fields. Unknown JSON path is lossy by design. |
| classifier wrong type | Server classifier is correct for posted flexible multi-country Step 1. The issue is the UI does not post that JSON through it. |
| multi-country detection gap | No current gap found for `participants` / `friendly_forces.countries` / `{ countries[] }` shapes. |
| base matching gap | Yes. Base Status ignores `assigned_base_id` / `base_id` joins. |
| side/country normalization gap | Server canonicalizes known country keys in the flexible adapter; no primary loss found there. |
| UI render filter | Yes for Base Status unit attachment; no for Import Summary/proposed_units display. |
| map layer skip | Review map uses `placement_candidates` as anchors only. Proposed units are not exact map markers by design. |
| stale cache / duplicate old layer | Not the data-loss cause for JSON import. Separate demo-overlay confusion exists in `docs/import-units-base-placement-audit.md`. |

## Exact Loss Points

1. `UI_MOdified/client/shell/scenario-import-wizard.js::runAnalyze()` builds:
   - `analyzeBody = { bundle: st.mdmpFiles }` when MDMP files are staged.
   - `analyzeBody = null` otherwise.
   It never reads or posts a general selected Step 1 JSON object.

2. `UI_MOdified/client/shell/scenario-workspace.js::validateLiveScenarioJson()` blocks Step 1 / operational brief JSON with `STEPS_MISSING_OR_EMPTY`. This is correct for a live scenario loader, but wrong for a Step 1 review import.

3. `UI_MOdified/server/ai/operational-brief.js::unknownToBrief()` is lossy by design. If a JSON shape misses classifier rules and reaches `unknown`, only a small set of summary fields survive.

4. `UI_MOdified/client/shell/base-status-panel.js::unitBelongsToAnchor()` does not match:
   - `unit.assigned_base_id` -> `anchor.base_id` / `anchor.id` / `base.id`
   - `unit.base_id` -> `anchor.base_id` / `anchor.id`
   - `unit.base_location_id` -> `anchor.location_id`
   As a result, proposed units can be present but hidden from the base card.

## Answers

- Did the server receive the missing data?  
  Usually no, when using the visible Live Scenario JSON path or when expecting the Import Scenario wizard to accept general JSON. Yes, if the object is manually posted to `/api/wargame-sim/analyze` or arrives through supported workbook/per-country paths.

- Did operational-brief builder drop it?  
  Not for recognized `multi_country_step1` or `operational_brief`. It preserves `proposed_units`, `placement_candidates`, `country_bases`, `participants`, `countries`, `country_orbats`, and `coalition_totals`.

- Did multi-country flexible detection handle it?  
  Yes for the existing tested shapes: `participants`, `enemy_forces`, `friendly_forces.countries`, top-level `proposed_units`, top-level `placement_candidates`, and `{ countries:[...] }`.

- Did classifier classify it as wrong document type?  
  Not in the tested flexible Step 1 shapes. But the Import Scenario wizard only sends general JSON as an MDMP bundle, so non-MDMP JSON selected there is rejected as unrecognized bundle content rather than classified as a single Step 1 body.

- Did it become generic scenario JSON instead of `multi_country_step1`?  
  Only if routed through the Live Scenario loader. That path never invokes the server classifier.

## Recommended Minimal Fix

1. Add a real JSON import row to the Import Scenario wizard that reads one selected `.json/.jsonc` file, parses JSON/JSONC, and POSTs the object directly to `/api/wargame-sim/analyze`.
2. Preserve the original selected object under `source_payload` or equivalent audit-only field before any adapter normalization.
3. Keep the old Red/Blue DOCX flow intact, but label it as DOCX generation. Do not delete it yet.
4. Add a lossless adapter contract for imported JSON -> `operational_brief` and keep `unknownToBrief()` as a last-resort warning path only.
5. Fix Base Status proposed-unit attachment by matching `assigned_base_id` / `base_id` / `base_location_id` before name/coordinate fallback.
6. Add an Import Diagnostics panel: raw count -> parsed count -> request count -> analyze count -> review count -> base-card attached/orphaned count.
7. Add an orphaned proposed units section in Review/Base Status so unmatched units remain visible.

## Tests Required

1. UI test: selecting a flexible Step 1 JSON in the Import Scenario wizard sends POST `/api/wargame-sim/analyze` with the parsed object, not `{ bundle:[...] }`.
2. Server test: flexible Step 1 JSON returns `kind:'multi_country_step1'` and exact counts for participants, countries, proposed units, placement candidates, country bases, and enemy bases.
3. Regression test: MDMP bundle JSON still uses `{ bundle:[...] }` and still rejects non-MDMP bundle entries clearly.
4. Review UI test: Import Summary and coalition rollup show the same proposed-unit and base counts as `brief.operational_brief`.
5. Base Status test: unit with `assigned_base_id:'B1'` attaches to anchor `{ id:'B1' }` even if names differ.
6. Orphan test: unmatched proposed units appear in an explicit orphaned section.
7. Live Scenario loader test: full RMOOZ scenario JSON still loads via `loadLiveScenarioFromJson()` and bypasses analyze intentionally.
8. No-regression suites: `test-multi-country-flexible-a.js`, `test-multi-country-orbat-a.js`, Base Status tests, Review renderer tests.

## Verification Run

- `node UI_MOdified/scripts/test-multi-country-flexible-a.js`: 7 passed, 0 failed.
- `node UI_MOdified/scripts/test-multi-country-orbat-a.js`: 20 passed, 0 failed.

