# PR-280A — External Scenario Source Manifest

**Generated:** 2026-05-28  
**Source:** CommunityScenarioPack51  
**Pack Path:** `/Users/engcode/Downloads/CommunityScenarioPack51`  
**Status:** Read-only catalog. No production RMOOZ files modified.

---

## Manifest Overview

| Field | Value |
|---|---|
| Total files in pack | 1,327 |
| Total folders | 12 |
| Estimated pack size | ~462 MB |
| Scenario (.scen) files | 630 |
| .scen total size (partial) | 437,477,678 bytes (~417 MB) |
| .ini weapon-patch files | 632 |
| Lua scripts | 8 |
| HTML briefing files | 16 |
| Document files (PDF/DOCX/TXT/RTF/XLSX) | 34 |
| XLSX metadata rows | 631 |
| XLSX-matched scenarios | 512 (81.3%) |
| Filename-fallback scenarios | 118 (18.7%) |
| manifestType | `external_scenario_source_manifest` |
| liveMutationAllowed | `false` |
| backendCommitAllowed | `false` |
| dryRunOnly | `true` |

---

## Metadata Policy

| Policy | Value |
|---|---|
| `.scen` binary parsed | **false** — binary format, not parsed |
| `.ini` treated as metadata | **false** — CMO weapon-patch XML only |
| `.ini` purpose | `scenario_units_weapon_patch` |
| XLSX treated as metadata | **true** — primary title/author/year source |
| Lua scripts executed | **false** — all blocked |
| Docs parsed for text | **true** — text-only, read-only |
| Human review required | **true** — all 630 scenarios |

**Read policies:**
- `.scen` → `blocked_binary`
- `.ini` → `blocked_binary`
- `.lua` → `blocked_script`
- `.html`, `.css`, `.txt`, `.rtf` → `safe_text_read`
- `.pdf`, `.docx`, `.xlsx` → `safe_text_read`
- `.jpg` → `catalog_only`

---

## Campaign Series Summary

| Campaign Series | Scenario Count |
|---|---|
| Standalone Scenario | 431 |
| Operation Scenarios (standalone) | 45 |
| Northern Fury Campaign (1. Northern Fury) | 45 |
| The War That Never Was Series | 16 |
| Northern Fury Sub-Series (4. Indian Ocean Fury) | 8 |
| BALTAP Campaign | 7 |
| Khrushchev's War Campaign | 7 |
| Northern Fury Sub-Series (5. Mediterranean Fury) | 7 |
| Northern Fury Sub-Series (6. Pacific Fury) | 6 |
| Black Tiger Series | 5 |
| Putin's War Series | 5 |
| Red Episodes Series | 5 |
| Northern Fury Sub-Series (2. Baltic Fury) | 5 |
| Northern Fury Sub-Series (3. Caribbean Fury) | 5 |
| Korean Scenarios | 4 |
| Sandbox/Tutorial | 4 |
| Battle Ocean 64 Series | 3 |
| Indonesian War Series | 3 |
| SC Andes Campaign | 3 |
| SC Mauritania Campaign | 3 |

*Total series groups shown: 20 of 28*

---

## XLSX Match Summary

The XLSX spreadsheet (`Command Community Pack Scenario List.xlsx`) contains **631 rows** of metadata.
Matching was performed by normalizing both the .scen filename title and XLSX title (uppercase, strip year suffix, collapse punctuation).

| Match Result | Count | Percent |
|---|---|---|
| XLSX match found | 512 | 81.3% |
| Filename fallback (no XLSX match) | 118 | 18.7% |

**Confidence distribution:**
- `high` (XLSX match + ini present): 509
- `medium` (XLSX match OR ini, but not both): 120
- `low` (filename-only, no xlsx, no ini): 1

---

## HTML Briefing Packages

Three scenarios have structured HTML briefing files in the `Assets/` folder:

### Iran Strike, 2025 (4 HTML files)
- `Assets/IranStrike2025BriefingIsrael.html`
- `Assets/IranStrike2025BriefingUS.html`
- `Assets/IranStrike2025BriefingUSIsrael.html`
- `Assets/IranStrike2025Description.html`

### Operation Ghost Rider, 1985 (4 HTML files)
- `Assets/OpGhostRiderBriefing.html`
- `Assets/OpGhostRiderDescription.html`
- `Assets/OpGhostRider_1985_Briefing.html`
- `Assets/OpGhostRider_1985_Description.html`

### Gulf of Sidra Incident, 1981 (1 HTML file)
- `Assets/Sidra1981.html`

---

## Lua Scripts

**All 8 Lua scripts are in `Lua/GulfofSidra1981/` and are blocked from execution.**
All scripts relate exclusively to the Gulf of Sidra Incident, 1981 scenario.

| Script | Risk | Purpose |
|---|---|---|
| `BusterNorthFunction.lua` | HIGH: MUTATES_UNIT_STATE | state-tracking; unit-control; rtb-control |
| `DeEscalate.lua` | HIGH: MUTATES_POSTURE | state-tracking; posture-escalation; player-messages |
| `LibyanAircraftAttack.lua` | HIGH: MUTATES_POSTURE; FIRES_ATTACK_EVENTS | state-tracking; posture-escalation; player-messages; contact-detection; ai-attack-trigger; rtb-control |
| `LibyanAircraftDestroyedConsequences.lua` | HIGH: MUTATES_POSTURE; MUTATES_SCORE; MUTATES_LOADOUT | state-tracking; posture-escalation; scoring; player-messages; loadout-setup; condition-check |
| `LibyanAircraftRTB.lua` | HIGH: MUTATES_UNIT_STATE | contact-detection; unit-control; rtb-control |
| `NoMissilesInFlight.lua` | LOW: read-only/condition-check | player-messages; condition-check |
| `ScenarioEndMessages.lua` | HIGH: MUTATES_SCORE | scoring; player-messages |
| `Setup.lua` | LOW: read-only/condition-check | state-tracking; player-messages |

> All Lua scripts have `luaExecutionBlocked: true` set on every scenario in this manifest.

---

## Document Briefings

The following scenarios have associated document briefings in `Documents/`:

**CWC 1 Eve of Destruction, 1995**
- `Documents/Eve of Destruction.docx`

**Halloween Horror, 1991**
- `Documents/Halloween Horror, 1991 General Description.txt`
- `Documents/Halloween Horror, 1991 USN Description.txt`

**Iran Strike, 2022**
- `Documents/Iran Strike, 2022 Israel Briefing.pdf`
- `Documents/Iran Strike, 2022 Israel Gameplay Notes Message.pdf`
- `Documents/Iran Strike, 2022 USA Briefing.pdf`
- `Documents/Iran Strike, 2022 USA Gameplay Notes Message.pdf`
- `Documents/Iran Strike, 2022 USA-Israel Briefing.pdf`
- `Documents/Iran Strike, 2022 USA-Israel Gameplay Notes Message.pdf`
- `Documents/Iran Strike, 2025 Israel Briefing.pdf`
- `Documents/Iran Strike, 2025 USA Briefing.pdf`
- `Documents/Iran Strike, 2025 USA-Israel Briefing.pdf`

**Iran Strike, 2025**
- `Documents/Iran Strike, 2022 Israel Briefing.pdf`
- `Documents/Iran Strike, 2022 Israel Gameplay Notes Message.pdf`
- `Documents/Iran Strike, 2022 USA Briefing.pdf`
- `Documents/Iran Strike, 2022 USA Gameplay Notes Message.pdf`
- `Documents/Iran Strike, 2022 USA-Israel Briefing.pdf`
- `Documents/Iran Strike, 2022 USA-Israel Gameplay Notes Message.pdf`
- `Documents/Iran Strike, 2025 Israel Briefing.pdf`
- `Documents/Iran Strike, 2025 USA Briefing.pdf`
- `Documents/Iran Strike, 2025 USA-Israel Briefing.pdf`

**Northern Fury 25 - Jar Heads on Ice, 1994**
- `Documents/Northern Fury 25 - Jar Heads on Ice - Load Tables.pdf`

**Northern Fury 43 - Red Devils, 1994**
- `Documents/Northern Fury 43 - Red Devils - Load Tables.pdf`
- `Documents/Northern Fury 43 - Red Devils - OPERATION ODINS THRUST.pdf`

**Operation El Dorado Canyon, 1986**
- `Documents/Operation El Dorado Canyon, 1986 Designer Notes.pdf`

**Operation El Dorado Canyon, 1996**
- `Documents/Operation El Dorado Canyon, 1986 Designer Notes.pdf`

**Peeling the Onion, 1957**
- `Documents/Peeling the Onion, 1957 Target List.rtf`

**Revenge in Beirut, 1983**
- `Documents/Revenge in Beirut, 1983 Description.docx`
- `Documents/Revenge in Beirut, 1983 USN Orders.docx`

**Ulleungdo Island, 2018**
- `Documents/Ulleungdo Island, 2018 Description.docx`
- `Documents/Ulleungdo Island, 2018 USN Orders.docx`

**Wargasm, 1962**
- `Documents/Wargasm, 1962 Target List.rtf`

**Wargasm, 1962 (No AC Dmg)**
- `Documents/Wargasm, 1962 Target List.rtf`

---

## Warnings

| Warning Code | Count |
|---|---|
| `INI_NOT_METADATA` | 1 |
| `INI_ORPHAN` | 1 |
| `LUA_EXECUTION_BLOCKED` | 1 |
| `NO_INI_PATCH` | 4 |
| `NO_XLSX_MATCH` | 118 |

**Total warnings: 125**

- `NO_XLSX_MATCH` — 118 scenarios had no matching XLSX metadata row. Title and year derived from filename.
- `NO_INI_PATCH` — 4 scenarios have no companion .ini weapon-patch file.
- `INI_ORPHAN` — 632 .ini files vs 630 .scen files; a small number of .ini files have no matching .scen.
- `LUA_EXECUTION_BLOCKED` — All 8 Lua scripts blocked from execution.
- `INI_NOT_METADATA` — All .ini files are weapon-patch XML, not scenario metadata.

---

## Import Safety Summary

### Safe to read (text extraction only)
- XLSX spreadsheet (scenario metadata)
- HTML briefing files (structured briefing content)
- DOCX/TXT/RTF documents (briefing text)
- CSS stylesheets (display only)

### Blocked
- All `.scen` files: binary CMO format, not parsed (`blocked_binary`)
- All `.ini` files: CMO weapon-patch XML, not used as metadata (`blocked_binary`)
- All `.lua` files: execution blocked; state-mutating CMO API calls (`blocked_script`)

### Catalog only
- `.jpg` image files: catalogued by filename, not loaded into UI (`catalog_only`)

### Never reached
- No `/api/sim/commit` calls
- No `applyDecision` or `executeSimulation` invocations
- No live mutation of RMOOZ state
- No modification of any production file under `UI_MOdified/`

---

## Next Step: PR-280B

PR-280B will build the **scenario catalog UI panel** that reads this manifest and presents:

- Searchable/filterable list of 630 scenarios
- Campaign series grouping
- Per-scenario metadata display (title, year, author, confidence level)
- HTML briefing viewer (read-only, sandboxed iframe)
- Document briefing links (open-in-viewer, not executed)
- Dry-run import gate with human-review confirmation
- All Lua scripts remain blocked; no sim commit path

> PR-280B reads this manifest as a static data source only.
> No .scen binary parsing, no .ini metadata use, no Lua execution.
