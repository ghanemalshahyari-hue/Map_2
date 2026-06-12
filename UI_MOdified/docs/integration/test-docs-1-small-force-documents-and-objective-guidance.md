# TEST-DOCS-1: Small Force Documents and Objective Guidance

TEST-DOCS-1 creates smaller WarGamingGEN input documents for faster unified-import testing.

## Created Files

Active WarGamingGEN tree:

`C:\Users\EngCoder\Desktop\TestingAI\WarGamingGEN`

New test copies:

- `inputs\forces\red_team_small_test.docx`
- `inputs\forces\blue_team_small_test.docx`
- `inputs\scenario_small_test.json`

Original source files were not replaced:

- `inputs\forces\red_team.docx`
- `inputs\forces\blue_team.docx`
- `inputs\scenario.json`

## Parsed Unit Counts

Verified with `src.parsers.docx_parser.parse_docx_oob`.

| File | Parsed units | Domain mix | Echelon mix |
| --- | ---: | --- | --- |
| `red_team_small_test.docx` | 15 | ground 11, naval 3, air 1 | unit 9, div 2, bde 2, bn 1, sqn 1 |
| `blue_team_small_test.docx` | 15 | ground 11, naval 2, air 2 | unit 7, bde 2, bn 4, sqn 2 |

Both files keep the original Arabic outline style and preserve enough variety for test runs:

- ground maneuver force
- support/fire or air-defense element
- naval component
- air or air-defense component
- reserve or mission context
- Objective X mission context where present

The small files intentionally avoid preserving every COA bullet as a parsed outline entry, because WarGamingGEN's parser treats outline bullets as force elements. Keeping all COA bullets would make the "small" documents noisy again.

## Scenario JSON

`scenario_small_test.json` is a separate test copy. It keeps the same operation, map bounds, off-map markers, force-ratio knobs, and Objective X. It reduces `phases` to the first six phases:

- step 0, `D-7`, `shaping`
- step 1, `D-5`, `strategic_strike`
- step 2, `D-3`, `sead`
- step 3, `D-2`, `naval_engagement`
- step 4, `D-1`, `mine_clearance`
- step 5, `D-H`, `h_hour_strike`

This is for fast import/generation flow testing. It is not a final-objective-resolution scenario.

### What Controls Phase Count

WarGamingGEN loads `inputs\scenario.json` in `tests\test_full_run.py`.

The number of entries in `scenario.json` field `phases` controls the phase count. The unified wizard runs:

`python tests/test_full_run.py --all`

So `--all` means "all phases in the currently staged `inputs\scenario.json`", not necessarily 17.

### What Controls Phase Names

Each item in `phases[]` controls one step:

- `step`
- `time_label`
- `phase_name_ar`
- optional `phase_name_en`
- `kind`
- `phase_line_km`

The generator uses these in prompts, checkpoints, reports, and GeoJSON metadata.

## Objective X Guidance

Objective X is currently defined by `inputs\scenario.json`:

- `objective.id`: `OBJ-X`
- `objective.name_en`: `Objective X (Nasser-Brega pipeline midpoint)`
- `objective.lon`: `19.55`
- `objective.lat`: `29.74`
- `objective.depth_km_from_coast`: `90.1`
- `objective.carver_total`: `48`

Where Objective X currently appears:

- `inputs\scenario.json`: authoritative objective configuration and coordinates.
- `inputs\forces\red_team.docx`: plain mission/COA text mentions Objective X, but does not define coordinates.
- `src\agents\personas\red.md` and `src\agents\personas\blue.md`: persona prompt text mentions Objective X.
- generated `outputs\geojson\*.geojson`: WarGamingGEN writes Objective X as a map Point feature.
- RMOOZ imported scenario record: built from the generated GeoJSON objective Point.

The original DOCX files mention Objective X in mission text, but they do not contain `WG_OBJECTIVE_*` metadata override paragraphs. The small DOCX files also do not add objective override metadata.

WarGamingGEN can optionally override the scenario objective from `red_team.docx` if metadata paragraphs exist, for example `WG_OBJECTIVE_LON=19.55`. They are not present in the current originals or in the small test copies.

Step0 files do not need to change for this test. The current generation path gets phase count, phase names, and Objective X from `scenario.json`.

Generated GeoJSON includes Objective X as a Point feature with `properties.kind = "objective"`. RMOOZ imports the generated GeoJSON and builds its scenario objective coordinate from that output. For direct RMOOZ scenario records, `obj.coord` is required; for WarGamingGEN imports, the generated GeoJSON objective point supplies it.

Changing only the unit documents does not require changing Objective X. For the smaller test, keep Objective X unchanged so the map, prompts, and import pipeline stay comparable to the full scenario.

Objective X is consumed by both systems:

- WarGamingGEN uses it in prompts, phase context, and generated GeoJSON.
- RMOOZ uses the imported GeoJSON objective Point to display the map objective.

Minimal safe Objective X configuration for WarGamingGEN:

- `id`
- `name_ar`
- `lon`
- `lat`

The current test copy also keeps `name_en`, `depth_km_from_coast`, and `carver_total` to avoid changing behavior outside the phase count.

## Validation Performed

- `red_team_small_test.docx` parsed successfully: 15 units.
- `blue_team_small_test.docx` parsed successfully: 15 units.
- `scenario_small_test.json` loaded successfully with `load_scenario`.
- Original `red_team.docx`, `blue_team.docx`, and `scenario.json` SHA256 hashes matched before and after creation.

## Fast Test Checklist

### Option A: Use Wizard DOCX Pickers

Use the unified Import Scenario wizard:

- Red document: `C:\Users\EngCoder\Desktop\TestingAI\WarGamingGEN\inputs\forces\red_team_small_test.docx`
- Blue document: `C:\Users\EngCoder\Desktop\TestingAI\WarGamingGEN\inputs\forces\blue_team_small_test.docx`

If you also want the six-phase test, stage the small scenario copy before clicking Start:

```powershell
cd C:\Users\EngCoder\Desktop\TestingAI\WarGamingGEN
Copy-Item inputs\scenario.json inputs\scenario.TEST-DOCS-1-original.bak -Force
Copy-Item inputs\scenario_small_test.json inputs\scenario.json -Force
```

Restore the full scenario after testing:

```powershell
cd C:\Users\EngCoder\Desktop\TestingAI\WarGamingGEN
Copy-Item inputs\scenario.TEST-DOCS-1-original.bak inputs\scenario.json -Force
```

### Option B: Manual Staging

Use this when testing outside the wizard or when you want exact fixed input names:

```powershell
cd C:\Users\EngCoder\Desktop\TestingAI\WarGamingGEN
Copy-Item inputs\forces\red_team.docx inputs\forces\red_team.TEST-DOCS-1-original.bak -Force
Copy-Item inputs\forces\blue_team.docx inputs\forces\blue_team.TEST-DOCS-1-original.bak -Force
Copy-Item inputs\scenario.json inputs\scenario.TEST-DOCS-1-original.bak -Force

Copy-Item inputs\forces\red_team_small_test.docx inputs\forces\red_team.docx -Force
Copy-Item inputs\forces\blue_team_small_test.docx inputs\forces\blue_team.docx -Force
Copy-Item inputs\scenario_small_test.json inputs\scenario.json -Force
```

Restore originals:

```powershell
cd C:\Users\EngCoder\Desktop\TestingAI\WarGamingGEN
Copy-Item inputs\forces\red_team.TEST-DOCS-1-original.bak inputs\forces\red_team.docx -Force
Copy-Item inputs\forces\blue_team.TEST-DOCS-1-original.bak inputs\forces\blue_team.docx -Force
Copy-Item inputs\scenario.TEST-DOCS-1-original.bak inputs\scenario.json -Force
```

## Warnings

- Do not delete the original DOCX files.
- Do not treat `_small_test.docx` files as production force files.
- Do not leave `scenario_small_test.json` staged as `scenario.json` after a full 17-phase test is needed.
- Do not edit SmartSearch, Step0, or WarGamingGEN core for this small-doc test.
- If a run is already active, stop or finish it before staging files for the next test.
