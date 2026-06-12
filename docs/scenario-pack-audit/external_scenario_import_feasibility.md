# External Scenario Import Feasibility
## Command: Modern Operations Community Scenario Pack 5.1 → RMOOZ

**Document:** Import feasibility analysis based on discovery-only audit
**Audit Date:** 2026-05-28
**Status:** Pre-implementation analysis — no code written, no files imported

---

## Executive Summary

The CMO Community Scenario Pack 5.1 is **importable at the catalog/manifest level** using filename metadata, the XLSX master list, and external documents. The .scen binary files are opaque; however, all the information needed to build a rich External Scenario Catalog (title, year, author, campaign group, size, supplementary briefings) is available through non-binary sources.

**Safe to import:** Title, year, filename, size, campaign series, HTML briefings (3 scenarios), DOCX summaries (~10 scenarios), XLSX author data.

**Not safe to import or execute:** .scen binary internals, .ini XML weapon patches, Lua scripts, PDF binaries (without external tool).

---

## What RMOOZ Can Safely Ingest

### Tier 1 — Filename Metadata (630 scenarios, zero parsing risk)
All 630 .scen files follow `[Title], [YEAR].scen`. From filenames alone RMOOZ can extract:
- `title` — the portion before the trailing year
- `year` — 4-digit year at end of base name
- `size_bytes` — from file stat
- `campaign_series` — from prefix pattern matching (28 groups identified)
- `relative_path` — for display/loading

**Risk: ZERO.** No binary parsing. No execution.

### Tier 2 — XLSX Author Attribution
`Documents/Command Community Pack Scenario List.xlsx` contains columns: `#`, `SCENARIO TITLE`, `YEAR`, `Package`, `AUTHOR`, `NOTES`.

Reading this file with a standard XLSX parser (e.g., Python `openpyxl`, or Node.js `xlsx`) provides:
- `author` field for most scenarios
- `package_version` (when the scenario was added)
- Additional `notes`

**Risk: LOW.** Standard ZIP/XML parsing of a spreadsheet. No CMO-specific format.

### Tier 3 — HTML Briefing Files (3 scenarios)
Three scenarios have HTML + CSS briefings in the `Assets/` folder:
1. **Iran Strike, 2025** — 4 HTML files (description + 3 side briefings: Israel, USA, USA-Israel)
2. **Operation Ghost Rider, 1985** — 4 HTML files (description + briefing, two variants)
3. **Gulf of Sidra Incident, 1981** — 1 HTML file + 1 JPG cover image

These are plain HTML files. RMOOZ can display them as-is or extract text.

**Risk: LOW.** Standard HTML parsing. No CMO-specific format. CSS is dark-theme only (bg #333333, Arial).

### Tier 4 — DOCX Scenario Supplements (~10 scenarios)
The following scenarios have attached DOCX files with scenario description, background, and/or orders:
- Eve of Destruction, 1995
- Revenge in Beirut, 1983 (description + USN orders)
- Senkaku Island Conflict, 2019 (description + Japan-US orders)
- Ulleungdo Island, 2018 (description + USN orders)
- BD_Briefing (PLAN Liaoning TF, 2018)
- Halloween Horror, 1991 (General Description TXT + USN orders TXT)

Text is extractable via standard DOCX/ZIP parsing.

**Risk: LOW.** Standard ZIP+XML parsing. No CMO-specific format.

### Tier 5 — RTF Target Lists (3 scenarios with supplemental flavor text)
- `Peeling the Onion, 1957 Target List.rtf` — Cold War nuclear target list
- `RAF Target List.rtf` — Secret nuclear target list (Baltic region)
- `Wargasm, 1962 Target List.rtf` — SIOP-63 USSR target list with megatonnage

These are flavor/historical documents, not gameplay metadata. Optional for catalog enrichment.

**Risk: LOW.** RTF is ASCII-based. Standard text extraction works.

---

## What RMOOZ Cannot or Should Not Ingest

### Hard Block 1 — .scen Binary Files
The .scen format is a proprietary CMO binary. RMOOZ has no .scen parser. Attempting to parse would be reverse engineering a commercial product's format.

**Decision: Do not parse. Index by filename + size only.**

Only if Wargame Labs (MatriX Games / WarfareSims) provides an official schema or API should this be revisited.

### Hard Block 2 — .ini XML Weapon Patches
Despite the `.ini` extension, these files contain CMO `<ScenarioUnits>` XML with unit GUIDs and weapon inventory edits. They contain:
- No title
- No author
- No description
- No date
- Only internal CMO unit GUIDs and weapon DB IDs

**Decision: Do not parse for metadata. These are CMO-internal files that are only meaningful to the CMO engine during scenario loading.**

### Hard Block 3 — Lua Scripts (MUST NOT EXECUTE)
All 8 Lua scripts are CMO Lua API scripts designed to run inside CMO's embedded Lua interpreter. They:
- Mutate side posture (`ScenEdit_SetSidePosture`)
- Fire attack events (`ScenEdit_AttackContact`)
- Modify scores (`ScenEdit_SetScore`)
- Change unit loadouts (`ScenEdit_SetLoadout`)
- Alter unit courses (`ScenEdit_SetUnit`)

**Decision: Flag Gulf of Sidra 1981 with `has_lua_scripts: true` and `lua_execution_blocked: true`. Do not execute under any circumstances. Text-reading for documentation is safe; execution is not.**

### Hard Block 4 — PDF Files (Without External Tool)
20 PDF files in Documents/ are binary. Without `pdftotext` (poppler-utils) or similar, they cannot be read.

**Decision: Index by filename only. If pdftotext becomes available, a follow-up extraction pass can enrich these entries.**

---

## The .ini File Warning (Detailed)

This deserves a dedicated section because the filename extension is deceptive.

In many game formats, `.ini` means a simple key-value metadata file. In CMO Community Pack:

**`.ini` = `<ScenarioUnits>` XML weapon patch**

When CMO loads `[scenario].scen` + `[scenario].ini` together:
- The `.scen` provides the full scenario state
- The `.ini` provides "after-load overrides" — typically weapon count adjustments to match the latest CMO database version

Example from `119 Squadron Makes a Little Noise, 2021.ini`:
```xml
<Unit_s24qy6-0hlt6nsl86at8>
  <Mag_1_1185>
    <WeaponRecAdd_4511_1764 />  ← Add weapon DB ID 4511 to mag slot 1764
    <WeaponEdit_1764_24 />      ← Set weapon 1764 count to 24
  </Mag_1_1185>
</Unit_s24qy6-0hlt6nsl86at8>
```

These GUIDs and DB IDs are meaningless outside the CMO engine. They cannot provide title, author, or any human-readable metadata.

**Impact on RMOOZ catalog:** Zero metadata is extractable from .ini files. The only safe use is confirming that an `.ini` companion exists (indicating the scenario has been database-updated).

---

## Import Safety Matrix

| Source | Action | Risk | Outcome |
|---|---|---|---|
| .scen filename | Parse for title + year | SAFE | title, year |
| .scen file stat | Read size | SAFE | size_bytes |
| .scen binary | Parse internals | BLOCKED | proprietary format |
| .ini file | Check existence | SAFE | has_ini_patch flag |
| .ini XML | Parse for metadata | DO NOT | no metadata present |
| XLSX master list | Parse with openpyxl | SAFE | author, package, notes |
| HTML briefings | Read as text | SAFE | briefing_html |
| DOCX documents | Extract XML text | SAFE | description, orders |
| RTF documents | Read as text | SAFE | flavor text |
| PDF documents | Read binary | BLOCKED (no parser) | index filename only |
| Lua scripts | Read as text for docs | SAFE | audit documentation |
| Lua scripts | Execute | HARD BLOCK | state mutation risk |
| JPG image | Copy path | SAFE | cover_image |
| CSS stylesheets | Read | SAFE | theme_css |

---

## Recommended Import Pipeline (Future PR-280A)

```
Phase 1: buildBaseManifest()
  - Walk all .scen files
  - Extract: filename, title, year, size, relative_path, has_ini
  - Apply campaign_series classifier (28 groups)
  Output: 630-entry base manifest

Phase 2: enrichFromXLSX()
  - Parse XLSX with openpyxl
  - Join on title (fuzzy-tolerant)
  - Add: author, package_version, notes
  Output: 630-entry enriched manifest (~500 with authors)

Phase 3: enrichFromDocuments()
  - Parse HTML briefings for Iran Strike 2025, Ghost Rider, Sidra 1981
  - Parse DOCX for 8 scenarios
  - Add: briefing_html, description_text, has_document_supplement
  Output: ~13 scenarios with rich text

Phase 4: flagSpecialCases()
  - Gulf of Sidra 1981: lua_scripts = ['Setup', 'LibyanAircraftAttack', ...], lua_blocked = true
  - Northern Fury series: subfolder = 'Northern Fury/1. Northern Fury', etc.
  - Sandbox/Tutorial scenarios: catalog_visible = false (optional)
  Output: special_flags applied

Phase 5: writeSourceManifest()
  - Output: external_scenario_source_manifest.json
  - Feed into buildExternalScenarioCatalog() in future PR
```

---

## Data Quality Notes

1. **Title extraction from filename** — 626/630 titles are clean. 4 have year embedded without comma (require regex variant).
2. **Author coverage** — XLSX master list covers historical pack; newer scenarios (2024-2025 additions) may not be in it. Approximately 80-90% author coverage expected.
3. **Campaign series classification** — 431 of 630 scenarios classified as "Standalone." This is correct; the pack is predominantly individual community-authored scenarios, not campaigns. The 28-group classification captures all identifiable series.
4. **Northern Fury subfolder** — Only series stored in subfolders. All 76 Northern Fury sub-series scenarios have consistent naming (`[Sub-Series] [N] - [Title], 1994.scen`) making automated ordering trivial.
5. **PDF inaccessibility** — 20 PDF files remain unread. They contain load tables and side briefings for Northern Fury, Baltic Fury, Caribbean Fury, Mediterranean Fury, Iran Strike, and El Dorado Canyon. These are supplemental reference documents, not required for a basic catalog card.

---

## Conclusion

The CMO Community Scenario Pack 5.1 is **import-ready at the catalog metadata level** today, using only:
- Filename parsing (630 titles + years)
- XLSX master list (authors)
- External HTML/DOCX/TXT documents (briefings for ~13 scenarios)

The .scen binaries, .ini XML patches, and Lua scripts are all CMO-internal formats that must not be parsed or executed. A clean `sourceManifest` JSON can be built in PR-280A without touching any of those files, providing RMOOZ a safe, complete, and maintainable external scenario catalog foundation.
