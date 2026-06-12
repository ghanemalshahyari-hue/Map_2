# External Scenario Pack Inventory
## Command: Modern Operations — Community Scenario Pack 5.1

**Audit Date:** 2026-05-28
**Auditor:** Discovery-only automated audit (no files modified, no Lua executed, no binary parsing)
**Source Path:** `/Users/engcode/Downloads/CommunityScenarioPack51`
**Output Path:** `/Users/engcode/Desktop/Map_2/docs/scenario-pack-audit/`

---

## Pack Overview

| Field | Value |
|---|---|
| Pack Name | Command: Modern Operations Community Scenario Pack 5.1 |
| Maintainer | KushanGaming (KushanGaming@gmail.com) |
| Original Creator | Miguel Molina "Meroka37" |
| Total Files | 1,327 |
| Total Directories | 12 |
| Total Size | ~462 MB |
| Scenario Files (.scen) | 630 |
| Companion Files (.ini) | 632 |
| Lua Scripts | 8 |

---

## Section 1 — File Type Inventory

| Extension | Count | Total Size (bytes) |
|---|---|---|
| .scen | 630 | 437,477,678 |
| .ini | 632 | 38,880,936 |
| .pdf | 20 | 4,313,982 |
| .docx | 8 | 174,995 |
| .html | 16 | 67,891 |
| .rtf | 3 | 79,431 |
| .xlsx | 1 | 47,495 |
| .css | 4 | 3,856 |
| .lua | 8 | 16,609 |
| .txt | 4 | 16,149 |
| .jpg | 1 | 23,165 |

---

## Section 2 — Folder Structure

```
CommunityScenarioPack51/
├── [root]                    554 .scen + 572 .ini + 58 mini .ini + 2 list .ini
├── Lua/
│   └── GulfofSidra1981/      8 Lua scripts (all for one scenario)
├── Documents/                34 files (20 PDF, 8 DOCX, 3 RTF, 1 XLSX, 2 TXT)
├── Assets/                   13 files (12 HTML, 4 CSS, 1 JPG — overlap counts)
└── Northern Fury/            76 .scen files in 6 campaign sub-series folders
    ├── 1. Northern Fury/     45 scenarios
    ├── 2. Baltic Fury/       5 scenarios
    ├── 3. Caribbean Fury/    5 scenarios
    ├── 4. Indian Ocean Fury/ 8 scenarios
    ├── 5. Mediterranean Fury/ 7 scenarios
    └── 6. Pacific Fury/      6 scenarios
```

**Key Finding:** The Northern Fury campaign is organized into subfolders, not the root. This is the only series stored this way. All other 554 .scen files are in the root directory alongside their .ini companions.

---

## Section 3 — .scen File Audit

**Total .scen files:** 630
**Location:** 554 in root, 76 in Northern Fury subfolders
**Format:** Proprietary binary (not parsed — filename + stat only)

### Filename Pattern
Most files follow the pattern: `[Title], [YEAR].scen`
- Year is almost always a 4-digit suffix after a comma
- 4 files deviate (year embedded differently or absent)
- Year range: 1941–2031

### .scen/.ini Match Status
- 613 scenarios: exact-match .ini found (same base name)
- 17 scenarios: no exact .ini match (case-mismatch pairs — 17 .ini exist with slightly different capitalization)
- 4 .ini files exist with NO matching .scen (2 are list index files: `_Community Scenario List.ini`, `_Northern Fury Scenario List_.ini`)

The 17 apparent mismatches are case/punctuation differences (e.g., `BALTAP - Break through The Sound, 1963.scen` vs `BALTAP - Break Through The Sound, 1963.ini`). These represent confirmed pairs, not orphans.

**Net result: all 630 .scen files have a companion .ini. All 630 .ini metadata are accounted for.**

---

## Section 4 — .ini File Format (Critical Finding)

**The .ini files are NOT standard INI key-value metadata files.**

They are XML-based `<ScenarioUnits>` patch documents containing:
- Unit GUID references
- Weapon/magazine inventory edits (`WeaponRecAdd`, `WeaponEdit`)
- Mount additions (`MountAdd`)
- Sensor state overrides (`SensorActive`)

Example structure:
```xml
<ScenarioUnits>
  <Unit_s24qy6-0hlt6nsl86at8>
    <Mag_1_1185>
      <WeaponRecAdd_4511_1764 />
      <WeaponEdit_1764_24 />
    </Mag_1_1185>
  </Unit_s24qy6-0hlt6nsl86at8>
  ...
</ScenarioUnits>
```

**This means:** No title, author, description, side names, or date metadata is readable from .ini files. Those fields exist only inside the binary .scen files.

**INI classification breakdown:**
- 572: `scenario_units_patch` — full XML weapon data
- 58: `mini_stub` — under 100 bytes, minimal XML
- 2: `scenario_list` — `_Community Scenario List.ini` and `_Northern Fury Scenario List_.ini` (XML index files listing all scenario paths)

---

## Section 5 — Campaign / Series Groups

28 identified groups from filename pattern matching:

| Group | Count |
|---|---|
| Standalone Scenario | 431 |
| Operation Scenarios (standalone) | 45 |
| Northern Fury Campaign (NF) | 45 |
| The War That Never Was Series | 16 |
| Indian Ocean Fury Sub-Series (IOF) | 8 |
| BALTAP Campaign | 7 |
| Khrushchev's War Campaign | 7 |
| Mediterranean Fury Sub-Series (MF) | 7 |
| Pacific Fury Sub-Series (PF) | 6 |
| Black Tiger Series | 5 |
| Putin's War Series | 5 |
| Red Episodes Series | 5 |
| Baltic Fury Sub-Series (BF) | 5 |
| Caribbean Fury Sub-Series (CF) | 5 |
| Korean Scenarios | 4 |
| Sandbox/Tutorial | 4 |
| Battle Ocean 64 Series | 3 |
| Indonesian War Series | 3 |
| SC Andes Campaign | 3 |
| SC Mauritania Campaign | 3 |
| Sumatra Crisis Series | 3 |
| 688 Attack Sub Series | 2 |
| The V-Bombers Series | 2 |
| Wargasm Series | 2 |
| 2nd Fleet Series | 1 |
| April Storm Series | 1 |
| CWC Series | 1 |
| SC Egypt Campaign | 1 |

**Note:** The Northern Fury "universe" (NF + 5 sub-series) totals **76 scenarios** and is the single largest campaign group. The full Northern Fury series was created by Gunner98.

---

## Section 6 — Documents Folder Audit

### Key Documents

| File | Type | Readable | Purpose |
|---|---|---|---|
| Command Community Pack Scenario List.xlsx | XLSX | Yes | Master scenario list with columns: #, SCENARIO TITLE, YEAR, Package, AUTHOR, NOTES (~630 rows) |
| Iran Strike 2022 (6 PDFs) | PDF | Binary | Player-side briefings for Israel/USA/USA-Israel (2022 scenario) |
| Iran Strike 2025 (3 PDFs) | PDF | Binary | Player-side briefings for 3 sides (2025 scenario) |
| Northern Fury Load Tables (5 PDFs) | PDF | Binary | Unit load tables for NF 25, 43, 45, Baltic Fury 2, Med Fury 1 |
| Operation El Dorado Canyon Designer Notes.pdf | PDF | Binary | Designer notes for 1986 Libya strike scenario |
| Eve of Destruction.docx | DOCX | Yes | Scenario description: Nov 1995, Cold War hot in Germany |
| Revenge in Beirut 1983 (2 DOCX) | DOCX | Yes | Description + USN orders for Beirut retaliation scenario |
| Senkaku Island Conflict 2019 (DOCX) | DOCX | Yes | Description: PRC/Japan/US dispute over Senkaku/Diaoyu |
| BD_Briefing.docx | DOCX | Yes | PLAN Liaoning Task Force briefing, Angola context, Aug 2018 |
| Ulleungdo Island 2018 (2 DOCX) | DOCX | Yes | Description + USN orders for North Korea civil war scenario |
| Halloween Horror 1991 (2 TXT) | TXT | Yes | Scenario description (rogue Soviet sub K-84 nuclear threat) + USN orders |
| Peeling the Onion 1957 Target List.rtf | RTF | Yes | Cold War nuclear target list (RAF SECRET UK/US ONLY) |
| RAF Target List.rtf | RTF | Yes | Secret nuclear target list: Sandal/Skean launch pads in Baltic region |
| Wargasm 1962 Target List.rtf | RTF | Yes | SIOP-63 annotated nuclear target list, USSR targets with megatonnage |

### XLSX Master List — Column Structure
`Command Community Pack Scenario List.xlsx` (1 sheet: "Page 1"):
- Column 1: `#` (row number)
- Column 2: `SCENARIO TITLE`
- Column 3: `YEAR`
- Column 4: `Package` (pack version the scenario was added in)
- Column 5: `AUTHOR`
- Column 6: `NOTES`

**This is the primary source of author attribution for all scenarios.** The .scen binary contains these fields internally; the XLSX provides a human-readable extract.

---

## Section 7 — Assets Folder Audit

| File | Type | Related Scenario | Purpose |
|---|---|---|---|
| IranStrike2025Description.html | HTML | Iran Strike, 2025 | Sandbox description + designer notes; mentions lua randomization |
| IranStrike2025BriefingIsrael.html | HTML | Iran Strike, 2025 | Full Israel-side briefing: situation, enemy forces, friendly forces, mission |
| IranStrike2025BriefingUS.html | HTML | Iran Strike, 2025 | US-side briefing |
| IranStrike2025BriefingUSIsrael.html | HTML | Iran Strike, 2025 | Combined US+Israel briefing |
| IranStrike.css | CSS | Iran Strike, 2022/2025 | Dark theme stylesheet (bg #333333) |
| OpGhostRiderDescription.html | HTML | Operation Ghost Rider, 1985 | Historical background + designer notes |
| OpGhostRiderBriefing.html | HTML | Operation Ghost Rider, 1985 | Player briefing |
| OpGhostRider_1985_Description.html | HTML | Operation Ghost Rider, 1985 | Variant description |
| OpGhostRider_1985_Briefing.html | HTML | Operation Ghost Rider, 1985 | Variant briefing |
| OpGhostRider.css | CSS | Operation Ghost Rider, 1985 | Dark theme stylesheet |
| Sidra1981.html | HTML | Gulf of Sidra Incident, 1981 | Scenario description: date, location, sides, duration, author (boogabooga) |
| briefing_style_dark.css | CSS | Multiple | Shared dark-theme CSS |
| Gulf_of_Sidra_1981.jpg | JPG | Gulf of Sidra, 1981 | Cover image (23KB) |

**Note:** Only 3 scenarios have HTML briefings: Iran Strike 2025, Operation Ghost Rider 1985, and Gulf of Sidra 1981. These are the most richly documented scenarios in the pack.

---

## Section 8 — Lua Script Audit

All 8 Lua scripts are in `Lua/GulfofSidra1981/` and belong exclusively to the Gulf of Sidra 1981 scenario. No other scenario in the pack has associated Lua scripts.

| Script | Purpose | Import Risk |
|---|---|---|
| Setup.lua | Initialize state variables (tensionLevel, key-values) + show gameplay notes | LOW — only SetKeyValue + MsgBox |
| LibyanAircraftRTB.lua | Contact detection loop: if US radar targets Libyan a/c within range, order RTB | HIGH — MUTATES_UNIT_STATE (SetUnit RTB) |
| LibyanAircraftAttack.lua | Contact detection: if US targets Libyan a/c at close range, set posture Hostile + AttackContact | HIGH — MUTATES_POSTURE + FIRES_ATTACK_EVENTS |
| LibyanAircraftDestroyedConsequences.lua | Triggered when Libya a/c shot down; adjusts score, releases reserve fighters, escalates to level 3 | HIGH — MUTATES_POSTURE + MUTATES_SCORE + MUTATES_LOADOUT |
| DeEscalate.lua | Reset tensionLevel to 1, set postures Unknown | HIGH — MUTATES_POSTURE |
| BusterNorthFunction.lua | Function: BusterNorth() — redirect AI units on a retreat course northward | HIGH — MUTATES_UNIT_STATE |
| ScenarioEndMessages.lua | End-game scoring: evaluate tensionLevel, LibyaWasAggressor, unacceptableCasualties → special message + score | HIGH — MUTATES_SCORE |
| NoMissilesInFlight.lua | Condition check: returns true if no weapons in flight for any side | LOW — read-only |

**CMO API calls used:** `ScenEdit_GetContacts`, `ScenEdit_GetUnit`, `ScenEdit_SetUnit`, `ScenEdit_SetSidePosture`, `ScenEdit_AttackContact`, `ScenEdit_SetScore`, `ScenEdit_AddCustomLoss`, `ScenEdit_SetLoadout`, `ScenEdit_SetKeyValue`, `ScenEdit_GetKeyValue`, `ScenEdit_MsgBox`, `ScenEdit_SpecialMessage`, `VP_GetSide`, `Tool_Range`, `Tool_Bearing`

**Import risk summary:** 6 of 8 scripts directly mutate game state. These scripts must NEVER be executed in a RMOOZ context. They are embedded in the Gulf of Sidra .scen binary's event triggers and would only run inside CMO's Lua engine.

---

## Section 9 — Special Files

### `_IMPORTANT NOTE - READ THIS FIRST.txt`
> "Please delete all old Community Scenario files before extracting these files. Many scenarios have been given new names which may leave old duplicates. The Lua folder contents must be placed in Command Modern Operations\Lua. Maintained by KushanGaming. Original credit to Miguel Molina 'Meroka37'."

### `_IMPORTANT NOTE - Scenario Authors Please Read This.txt`
> "Scenarios are regularly rebuilt with the latest Command database. Changes may be made by the developer team (e.g. F-35B weapon loadout corrections, Quick Turnaround settings for ~200 scenarios). Authors should always use the latest pack version as the base for updates."

### `_Community Scenario List.ini`
XML file listing all 630 scenario pairs as Windows absolute paths:
```xml
<ScenarioList>
  <Scenario>
    <ScenarioFilePath><!--C:\Program Files (x86)\Steam\...Community Scenario Pack\[name].scen--></ScenarioFilePath>
    <ConfigFilePath><!--...Community Scenario Pack\[name].ini--></ConfigFilePath>
  </Scenario>
  ...
</ScenarioList>
```
The paths are embedded in XML comments (not element text), making them read-only annotations. The file confirms all 630 pairs.

---

## Section 10 — Top-N Lists

### Top 20 Largest .scen Files

| Rank | Size (bytes) | Filename |
|---|---|---|
| 1 | 10,237,026 | Korean Campaign (Operation Dragon Fire), 2018 |
| 2 | 6,519,980 | Mediterranean Fury 4 - Secure the Flank, 1994 |
| 3 | 6,316,872 | Mediterranean Fury 5 - Serbia Right!, 1994 |
| 4 | 5,648,814 | Operation True Promise III, 2025 |
| 5 | 5,608,060 | SandBox Nations 1, 2018 |
| 6 | 5,493,097 | Operation Rising Lion (Improved), 2025 |
| 7 | 4,863,307 | Saudia Arabia Crisis - Attack of IS, 2016 |
| 8 | 4,845,639 | Indian Fury 6 - Into the Breach, 1994 |
| 9 | 4,597,479 | Hanukkah War, 2018 |
| 10 | 4,263,153 | Mediterranean Fury 2 - Syrian Surprise, 1994 |
| 11 | 3,885,449 | Mediterranean Fury 1 - The Road to Byzantium, 1994 |
| 12 | 3,596,946 | Operation Eagle Guardian, 2019 |
| 13 | 3,596,134 | Korean Campaign, 2018 |
| 14 | 3,549,768 | Indian Fury 4 - The Gate of Tears, 1994 |
| 15 | 3,488,030 | Indian Fury 1 - Persian Pounce, 1994 |
| 16 | 3,487,643 | Caribbean Fury 1 - Hot Tamales, 1994 |
| 17 | 3,332,923 | Pacific Fury 4 - I Come from a Land Down Under, 1994 |
| 18 | 3,136,136 | The V-Bombers, 1962 |
| 19 | 3,114,350 | The V-Bombers, 1962 (No AC Dmg) |
| 20 | 3,004,235 | CWC 1 Eve of Destruction, 1995 |

### Top 20 Smallest .scen Files

| Rank | Size (bytes) | Filename |
|---|---|---|
| 1 | 18,126 | Scenario Editor Tutorial-Adding Weapons, 2015 |
| 2 | 20,717 | Kiwi Strike!, 1998 |
| 3 | 21,494 | Growler Vs. Growler, 2014 |
| 4 | 23,655 | Sinking a Battlewagon, 1990 |
| 5 | 25,139 | The Battle of Palmdale, 1956 |
| 6 | 25,573 | Myanmar Defense, 1995 |
| 7 | 26,470 | Chilean Chevauchee, 1947 |
| 8 | 26,969 | Turkish Revenge, 2012 |
| 9 | 28,196 | Needle in a Wet Haystack, 2009 |
| 10 | 29,226 | US-UK Fellowship Exercise, 2012 |
| 11 | 29,345 | SEAL Submarine Exercise, 2010 |
| 12 | 32,437 | The Snipe Incident, 1958 |
| 13 | 32,862 | Rollback - Hoisting the Net, 1998 |
| 14 | 33,886 | The Old Regime and the New Nation, 1966 |
| 15 | 38,004 | SC Mauritania Pt 1, 2011 |
| 16 | 38,892 | Old Feuds Have Now Returned, 2014 |
| 17 | 41,550 | Turkmen Bombardment, 1998 |
| 18 | 41,651 | Sandbox Scenario 1 - Surface Encounter, 1991 |
| 19 | 41,820 | Red Episodes - SOS SOSUS, 1989 |
| 20 | 42,938 | Assault on Banak, 1985 |

---

## Section 11 — Metadata Reliability Assessment

### What Is Reliable (can be derived without opening .scen binary)

| Source | Fields | Reliability |
|---|---|---|
| Filename | Title (approximate), Year | High — all 630 follow pattern `[Title], [YEAR]` |
| Filename | Campaign/series group | High — prefix patterns are consistent |
| Filename | Relative path / subfolder | Exact |
| File stat | size_bytes | Exact |
| XLSX master list | Scenario title, year, author, package version, notes | High (but XLSX may not list all 630) |
| HTML Assets | Briefing text, sides, date, duration, designer notes | High for 3 scenarios only |
| DOCX Documents | Background text, orders, sides, date | High for ~10 scenarios |
| _Community Scenario List.ini | Windows path pairs (scen+ini) | Confirmed — all 630 |

### What Is Uncertain (requires opening .scen binary or extracting from XLSX)

| Field | Uncertainty |
|---|---|
| Author | Only from XLSX or HTML/DOCX docs; not in .ini |
| Database version required | Only in .scen binary |
| Side names | Only in .scen binary |
| Scenario duration | Only in .scen binary |
| Has Lua scripts | Mostly no; 1 confirmed (Gulf of Sidra 1981) |
| Detailed description | Only in .scen binary or external documents |
| Number of units | Only in .scen binary |

---

## Final Report

### Summary Statistics

| Metric | Value |
|---|---|
| Total files | 1,327 |
| Total folders | 12 |
| Total size | ~462 MB |
| .scen scenario files | 630 |
| .ini companion files | 632 |
| Readable documents | 20 (DOCX + RTF + TXT + HTML + XLSX; PDFs unread) |
| Unreadable documents | 20 PDF files (binary, require pdftotext) |
| Lua scripts | 8 (all one scenario: Gulf of Sidra 1981) |
| Campaign/series groups | 28 identified |
| Confirmed scen+ini pairs | 613 exact-match + 17 case-mismatch = all 630 accounted for |

### Files That Were Unreadable and Why

- 20 PDF files: Proprietary binary PDF format. `pdftotext` was not available on this machine. Filenames clearly describe content (load tables, side briefings, designer notes). Text extraction would require installing `pdftotext` (poppler-utils) or similar.
- 630 .scen files: Proprietary binary CMO scenario format. Per audit rules, binary internals were NOT parsed. Only filename + file size extracted.

### What RMOOZ Should Import First (Priority List)

1. **XLSX master list** (`Command Community Pack Scenario List.xlsx`) — parse Title, Year, Author columns. This gives author attribution for potentially all 630 scenarios without touching any binary.
2. **Filename-only metadata** — title and year from all 630 .scen filenames. Reliable, no binary parsing needed. Enough to build a catalog card for every scenario.
3. **Campaign series groupings** — 28 groups are fully derivable from filenames. Import the 76 Northern Fury scenarios (in organized subfolders) first as a well-structured pilot batch.
4. **HTML briefings for 3 rich scenarios** — Iran Strike 2025, Operation Ghost Rider 1985, Gulf of Sidra 1981. These have the most complete metadata: HTML briefings, CSS, designer notes, image (Gulf of Sidra).
5. **DOCX documents** — ~10 scenarios have attached DOCX descriptions (Senkaku, Beirut, Ulleungdo, Eve of Destruction, BD, Halloween Horror). These provide background text for catalog cards.
6. **RTF target lists** — useful game-asset flavor text for Peeling the Onion, RAF Target List, Wargasm scenarios.

### What RMOOZ Should Avoid Importing First (Risk List)

1. **Lua scripts** — All 8 scripts in `Lua/GulfofSidra1981/` mutate CMO game state (posture, score, loadout, unit position). Must NEVER be executed outside CMO. Import flag: `has_lua_scripts = true`, `lua_execution_blocked = true`.
2. **Binary .scen files** — Do not attempt to parse or import binary content. Only the filename, size, and path should be indexed.
3. **Binary .ini files** — Despite the `.ini` extension, these are CMO XML weapon patches, not metadata. Do not parse them expecting title/author/description — they contain none. The weapon data is CMO-internal and meaningless to RMOOZ.
4. **20 PDF files** — Not readable without external tool. Safe to index by filename only; do not attempt binary parse.
5. **Largest scenarios first** — The top 10 largest files (3–10 MB each) are complex campaign scenarios (Korean Campaign, Northern Fury sub-series). They likely have the most intricate Lua, event, and side configurations. Better to pilot-test with small standalones first.
6. **Windows paths in `_Community Scenario List.ini`** — Path strings embed Windows absolute paths (`C:\Program Files (x86)\Steam\...`). These are non-portable and must be stripped / re-resolved against the local pack path before use.

### Top 20 Campaign Groups by Scenario Count

1. Standalone Scenario — 431
2. Operation Scenarios — 45
3. Northern Fury Campaign (NF) — 45
4. The War That Never Was Series — 16
5. Indian Ocean Fury Sub-Series — 8
6. BALTAP Campaign — 7
7. Khrushchev's War Campaign — 7
8. Mediterranean Fury Sub-Series — 7
9. Pacific Fury Sub-Series — 6
10. Black Tiger Series — 5
11. Putin's War Series — 5
12. Red Episodes Series — 5
13. Baltic Fury Sub-Series — 5
14. Caribbean Fury Sub-Series — 5
15. Korean Scenarios — 4
16. Sandbox/Tutorial — 4
17. Battle Ocean 64 Series — 3
18. Indonesian War Series — 3
19. SC Andes Campaign — 3
20. SC Mauritania Campaign — 3

---

## Recommended Next PR

**PR-280A — External Scenario Pack Manifest Builder**

**Purpose:** Use the findings from this audit to define a clean `sourceManifest` JSON shape that RMOOZ can feed into `buildExternalScenarioCatalog()` later.

**Manifest shape recommended:**

```json
{
  "manifest_version": "1.0",
  "pack_id": "cmo-community-pack-51",
  "pack_name": "CMO Community Scenario Pack 5.1",
  "maintainer": "KushanGaming",
  "source_path": "[local absolute path to pack root]",
  "scenarios": [
    {
      "scenario_id": "cmo-csp51-001",
      "title": "119 Squadron Makes a Little Noise",
      "year": 2021,
      "filename": "119 Squadron Makes a Little Noise, 2021.scen",
      "relative_path": "119 Squadron Makes a Little Noise, 2021.scen",
      "size_bytes": 463142,
      "campaign_series": "Standalone Scenario",
      "has_ini_patch": true,
      "has_lua_scripts": false,
      "has_html_briefing": false,
      "has_document_supplement": false,
      "author": null,
      "confidence": "confirmed"
    }
  ]
}
```

**What PR-280A should NOT do:**
- Parse .scen binary
- Execute Lua
- Import weapons data from .ini
- Resolve Windows paths from `_Community Scenario List.ini`

**What PR-280A SHOULD do:**
- Read XLSX for author attribution (openpyxl or xlsx parser)
- Build manifest from filenames + XLSX merge
- Add `lua_blocked: true` flag to Gulf of Sidra 1981
- Normalize Windows paths to POSIX relative paths
- Group Northern Fury sub-series correctly (preserve subfolder hierarchy)
