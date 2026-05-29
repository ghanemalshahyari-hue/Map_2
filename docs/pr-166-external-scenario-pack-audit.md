# PR-166 — External Scenario Pack Readiness Audit

**Status:** Audit complete. No code changes in this PR.  
**Pack:** Community Scenario Pack v51 (`CommunityScenarioPack51/`)  
**Audited:** 554 `.scen` files, 558 catalog entries, 554 `.ini` files  
**Date:** 2026-05-25

---

## 1. What RMOOZ Can Use Right Now

### 1a. Outer wrapper — readable without any decompression

Every `.scen` file is an XML document whose outer wrapper contains fully readable
fields. All 554 files expose these fields cleanly:

| Field | Present | Notes |
|---|---|---|
| `ScenTitle` | 554/554 | Human-readable name |
| `ScenDescription` | 554/554 | HTML-encoded briefing text |
| `ScenSetting` | 492/554 | Geographic theater (e.g. "Mediterranean") |
| `ScenDate` | 554/554 | Year string (e.g. "1986") |
| `Difficulty` | 554/554 | Integer 1–5 (1 = easiest) |
| `Complexity` | 554/554 | Integer 1–5 (1 = simplest) |
| `DBVersion` | 554/554 | Database the scenario requires |
| `BuildNumber` | 554/554 | Command version used to save |
| `Version` | 554/554 | Full version string |
| `IsCampaignCheckpoint` | 554/554 | `true`/`false` string |

These 10 fields require no decompression and no proprietary library.
A standard XML parser (DOMParser in the browser) reads them directly.

### 1b. Catalog index — usable as a file manifest

`_Community Scenario List.ini` is XML-over-INI: a `<ScenarioList>` with 558
`<Scenario>` entries. Each entry contains only two fields — `<ScenarioFilePath>`
and `<ConfigFilePath>` — both as XML comments inside the tags (not text nodes).
The paths are Windows Steam paths but the basenames are portable.

The catalog can serve as a scenario manifest. A filename parser strips the path
prefix to get the bare scenario name and lets RMOOZ enumerate what is available.

**Catalog vs file count discrepancy:** 558 catalog entries, 554 `.scen` files present.
Four catalog entries point to files not in this pack. Any catalog reader must
handle missing files gracefully.

---

## 2. What Is Locked — The Compressed Blob

Every `.scen` file contains a single `<Scenario_Compressed>` element. All 554
files use `<CompressVersion>5</CompressVersion>`.

This blob contains the entire playable scenario:
- All units (name, type, side, lat/lon, altitude, heading, speed)
- Sides and postures
- Missions, objectives, doctrine settings
- Reference points, routes
- Event triggers and scripts
- Time compression and game state

**CompressVersion 5 is proprietary to Command: Modern Operations.**
The format is not publicly documented. The blob appears to be a
gzip-compressed inner XML encoded in a custom base64-like scheme.
RMOOZ cannot parse it without reverse-engineering or a dedicated decompressor
library, neither of which is in scope before PR-185+.

**Until the blob is decodable, RMOOZ has zero access to:**
- Unit identities, positions, sides, or coordinates
- Mission structures or objectives
- Decision logic or triggers

---

## 3. The `.ini` Unit Patch Files

`.ini` files contain `<ScenarioUnits>` blocks — delta patches that the game
applies on top of a scenario's compressed base state.

| Condition | Count |
|---|---|
| Empty (`<ScenarioUnits />`) | 58 |
| Contains unit patches | 496 |
| Total | 554 |

### What the patches contain

Each `<Unit_GUID>` block references a unit that exists inside the compressed
blob and applies operations like:

- `WeaponRecAdd_{slot}_{dbId}` — add a weapon from the Command DB
- `WeaponEdit_{dbId}_{qty}` — set quantity of a weapon
- `MountAdd_{mountId}` — add a weapon mount
- `MountRemove_{slot}_{mountId}` — remove a mount
- `SensorAdd_{sensorId}` — add a sensor
- `SensorActive_{sensorId}` — activate a sensor
- `SensorRemove_{slot}_{sensorId}` — remove a sensor

### Why RMOOZ cannot use these patches

1. **Unit GUIDs are from the compressed blob.** The GUIDs (e.g.
   `Unit_s24qy6-0hlt6nsl86at8`) are session-assigned IDs that only match
   units defined inside the blob. Without the blob, the GUIDs are orphans.

2. **DB IDs reference the Command database.** Numeric IDs like `_1764` in
   `WeaponRecAdd_4511_1764` are primary keys in the Command Modern Operations
   DB3K or CWDB database files. RMOOZ does not have these databases.

3. **Patches are deltas, not base state.** They describe changes to an existing
   unit configuration. There is no standalone base state in the `.ini` file.

**Conclusion:** The `.ini` unit patch files are not useful to RMOOZ until the
compressed blob is decodable and the Command DB is available. They can be
cataloged as present/absent but not consumed.

---

## 4. Database Versioning

Two database variants appear across the 554 scenarios:

| DBVersion | Count | Notes |
|---|---|---|
| `DB3K_512.db3` | 429 | Modern era scenarios |
| `CWDB_512.db3` | 123 | Cold War era scenarios |
| `DB3K_511.db3` | 1 | Older DB version |
| `DB3K_510.db3` | 1 | Older DB version |

Any future staging workflow must validate that the DB version available to
RMOOZ's adjudicator matches the DB version declared in the scenario file.
Mismatched DB versions are silent data corruption (wrong weapon stats, missing
platform definitions).

---

## 5. Theater Distribution

The 492 scenarios with a `ScenSetting` field span 279 distinct theater values.
Top 10:

| Theater | Count |
|---|---|
| Mediterranean | 20 |
| South China Sea | 18 |
| Indian Ocean | 15 |
| Caribbean | 12 |
| North Atlantic | 11 |
| South Atlantic | 10 |
| West Africa | 10 |
| Norwegian Sea | 10 |
| Persian Gulf | 8 |
| Middle East | 8 |

62 scenarios have no `ScenSetting` field.

---

## 6. Pack-Level Warnings (Required Before Any Future Staging)

These warnings must be displayed if RMOOZ ever offers a staging or apply path
for an external scenario pack:

1. **Proprietary compression.** Core scenario data (units, positions, sides,
   objectives) is locked in a CompressVersion=5 blob. RMOOZ cannot read or
   apply it. Do not proceed without a verified decompressor.

2. **Database dependency.** Scenarios require DB3K_512 or CWDB_512. RMOOZ must
   validate DB version before staging. DB mismatch produces silently incorrect
   unit data.

3. **Lua script dependency.** Some scenarios require Lua scripts from a separate
   Lua folder. The README states: *"The contents of the Lua folder need to be
   placed in the Lua folder in your main Command directory."* These scripts are
   not inside the scenario files and are not included in the file pack.

4. **Catalog/file mismatch.** 4 catalog entries have no matching `.scen` file.
   A catalog reader must handle absent files without crashing.

5. **Pack is rebuilt periodically.** The pack authors state the pack is
   regularly rebuilt against the latest Command DB. Scenarios imported at one
   point may differ from a later pack version. Any staged scenario should
   record the pack version (v51) and DBVersion at import time.

6. **Old duplicates must be purged.** The README warns that scenarios are
   sometimes renamed across versions, leaving stale duplicates. If RMOOZ ever
   manages a local scenario library, deduplication by scenario title or GUID
   is required before merging a new pack.

---

## 7. What RMOOZ Needs for Real Scenario Testing

To test against real Command scenarios, RMOOZ needs one of the following:

**Option A — Outer-wrapper catalog only (achievable now):**  
Use the 10 readable fields (title, description, setting, year, difficulty,
complexity, DB version) as a read-only preview catalog. No unit data, no map
data. Suitable for browsing and selecting scenarios before any staging.

**Option B — Decompressed inner XML:**  
Reverse-engineer or implement CompressVersion=5 decompression to expose the
inner scenario XML. This unlocks units, positions, sides, missions, and
triggers. Significant engineering work; must be audited before enabling
any write path.

**Option C — User exports from the game:**  
Command: Modern Operations can export scenarios in readable formats through
its built-in editor. A RMOOZ import pipeline accepting a pre-exported XML
avoids the compression problem entirely. This is the lowest-risk path if
a real scenario import workflow is desired.

---

## 8. Can the Scenario List Become a Read-Only Catalog?

**Yes.** Using only the outer wrapper fields, RMOOZ can build a read-only
catalog of 554 scenarios with:
- Title and description
- Theater / setting
- Year
- Difficulty and complexity ratings
- DB version requirement
- Campaign flag

This catalog is safe — it is purely display data, touches no map or simulation
state, and requires no decompression.

**This is the recommended scope for PR-167.**

---

## 9. What PR-167 Should Be

**PR-167 — External Scenario Catalog Preview Contract**

Scope:
- Parse `.scen` outer wrapper fields (10 fields, no decompression) for some
  or all of the 554 pack scenarios
- Build a read-only catalog panel in the imported preview UI
- Display: title, description, year, setting, difficulty (★ bars), complexity,
  DB version tag, campaign flag
- Support search by title and filter by setting/year/difficulty
- No import button. No staging. No apply. No map mutation. No unit data.
- Catalog entries that point to missing files show a `[missing]` badge

Out of scope for PR-167:
- Decompressing the blob
- Resolving `.ini` unit patches
- Any write or staging path
- DB validation logic (document it, don't implement it yet)
