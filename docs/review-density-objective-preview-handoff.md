# RMOOZ Review Card Density / Objective X / Preview Decision Handoff

_Last updated: 2026-06-13_

This handoff captures the current RMOOZ review-card and preview issues discussed after the Step 1 JSON, Arabic/RTL, and mojibake work. It is intentionally written as a practical continuation note for Claude, ChatGPT, or any future coding agent.

## Current GitHub state observed

Repository: `ghanemalshahyari-hue/Map_2`

Default branch: `main`

Important current state:

- Arabic mojibake fix appears to be on GitHub. The corrupted text such as `â€”`, `Ù`, `Ø`, and `�` should be treated as a regression marker if it reappears.
- `i18n.js` now has updated English and Arabic labels for the Legacy / Full Scenario JSON loader.
- Step 1 / operational JSON import path exists in `scenario-import-wizard.js` and routes the parsed JSON to `/api/wargame-sim/analyze`.
- Base Status unit-to-base matching has improved ID-first matching using fields such as `assigned_base_id`, `base_id`, `anchor_id`, `placement_candidate_id`, `base_location_id`, `location_id`, `assigned_base`, and `id`.
- A draft PR was created for one focused Objective X preview fix:
  - Branch: `fix/review-density-objective-preview`
  - PR: `#10` — `Fix preview objective source for review-only decision steps`
  - Commit: `c6a025ed4b81b36208a532d676351d4a4549fef6`
  - It changes only `UI_MOdified/client/shell/demo-scenario-preview.js`.
  - It is draft and should not be merged without local browser and Node test verification.

## Very important instruction for next agent

Do not assume that PR #10 is ready to merge.

The PR was created from ChatGPT through the GitHub connector. It was not tested locally in the browser and Node tests were not run from this environment.

Before merging PR #10, run local tests and live verification.

## Why PR #10 exists

The Preview Decision Steps module used this risky Objective X priority:

1. First `placement_candidate`
2. `area_of_operations.center`
3. `operational_brief.objectives[]`

This is wrong because a placement candidate is usually a base, anchor, air base, naval base, or placement location. It should not automatically become Objective X.

The intended rule is:

1. User-selected or explicit objective fields
2. `operational_brief.objectives[]` or `objectives_list[]`
3. `area_of_operations.center` only as an approximate fallback
4. Never use the first `placement_candidate` as Objective X

PR #10 implements that safer client-side rule in `demo-scenario-preview.js`.

## Required verification for PR #10

Run:

```bash
git fetch origin
git checkout fix/review-density-objective-preview
node test-demo-scenario-preview.js
```

Then live browser verification:

1. Start the app normally.
2. Import the real Step 1 / operational JSON that reproduces the issue.
3. Open Review AI Understanding.
4. Click `Preview Decision Steps / معاينة خطوات القرار`.
5. Confirm the preview target is not the first base/placement anchor.
6. Confirm Objective X comes from explicit/user objective or `operational_brief.objectives[]`.
7. Confirm base/placement candidates remain anchors, not target markers.
8. Confirm all preview markers remain `preview_only:true` and `requires_review:true`.
9. Confirm no scenario state is committed or mutated.
10. Confirm no console errors.

If the test fails because the static test expected placement candidates as objective, update the test expectation to the new safe rule. Do not revert the safe rule.

## Pending issue 1: Proposed Units density

Current user-visible problem:

```text
الوحدات المقترحة — Proposed Units (452)
```

The Review card still renders too much data for large payloads.

Known code area:

- `UI_MOdified/client/shell/doc-understanding-review.js`
- Function: `renderProposedUnits(p)`

Current behavior observed from code:

- `renderProposedUnits()` collects all `proposed_units`.
- It groups them by side + base name + coordinates.
- It then loops through every group and every unit using `list.forEach()`.
- It renders all rows/cards immediately.
- There is no collapsed default, no `details/summary`, no pagination, no row limit, no `Show all`, and no virtualized view.

This means 452 proposed units can dump 452 visible cards/rows into the review card by default.

Desired behavior:

```text
الوحدات المقترحة — Proposed Units (452)
[RED: N] [BLUE: N] [Countries: N] [Bases attached: N] [Unassigned: N]

▶ RED units
▶ BLUE units
▶ By country
▶ By base
▶ Unassigned / needs base review
```

Rules:

- Do not delete or hide data permanently.
- Collapse large sections by default when count is greater than 20.
- Header must always show the full count.
- Show summary chips first.
- Group by side, country, base, and unassigned.
- Show the first 10 to 25 rows per expanded group, then `Show all`.
- Use `dir="auto"` for dynamic Arabic/English names.
- Preserve `needs_review`, `source_type`, `exact_unit_position:false`, warnings, and confidence data.
- Do not generate final scenario units from this review panel.

Suggested implementation pattern:

- Add small helpers inside `doc-understanding-review.js`, such as:
  - `sectionDetails(title, summaryHtml, bodyHtml, openByDefault)`
  - `countBy(units, keyFn)`
  - `previewRows(rows, limit)`
- Prefer native `<details>` / `<summary>` first to avoid heavy JS.
- Avoid a large UI framework or refactor.

## Pending issue 2: Enemy Bases density

Current user-visible problem examples:

```text
Enemy Bases
Enemy: 64 Friendly: 0
Enemy Bases (RED) (64)
```

Known code area:

- `UI_MOdified/client/shell/doc-understanding-review.js`
- Function: `renderEnemyBases(p)`

Current behavior observed from code:

- It renders all enemy bases with `bases.forEach()`.
- It renders all friendly trial bases with `friendlyTrials.forEach()`.
- There is no collapsed default, no grouping, no count-limited preview.

Desired behavior:

```text
Enemy Bases — قواعد العدو (64)
[Air bases: N] [Naval bases: N] [Land bases: N]
[With coordinates: N] [Needs review: N]

▶ By country
▶ By base type
▶ Missing coordinates
▶ Needs review
```

Rules:

- Collapse if count is greater than 20.
- Group by side, country, and site/base type.
- Do not duplicate headings.
- Keep friendly trial bases visible but separate.
- Check whether the same base appears in `enemy_bases`, `country_bases`, and `placement_candidates` and avoid duplicate display if possible.
- Use bilingual headings and `dir="auto"` for dynamic names.

## Pending issue 3: RED units not placed in their bases like BLUE

Current status:

- GitHub main now appears to have improved ID-first matching in `base-status-panel.js`.
- This does not prove the live map/preview attaches RED units correctly.
- Need real JSON verification.

Known code area:

- `UI_MOdified/client/shell/base-status-panel.js`
- `unitBelongsToAnchor(unit, anchor, base)`
- `unassignedUnits(payload)`
- `scenario-import-wizard.js` attach diagnostics helpers
- Any other map/preview layer that performs separate matching, especially `demo-units.js`, `placement-candidates-panel.js`, and preview/free-fight modules.

Required live diagnostic using the real JSON:

Compute:

- total RED proposed units
- RED attached to bases
- RED orphaned
- total BLUE proposed units
- BLUE attached to bases
- BLUE orphaned

For every RED orphan, print:

- unit name/platform
- side
- country/country_key
- assigned_base_id
- base_id
- assigned_base/base_name
- available matching RED base IDs/names
- reason it did not attach

Likely remaining causes if RED still fails:

1. RED units have `assigned_base_id` but RED bases use another field.
2. RED bases are in `enemy_bases`, while BLUE bases are in `placement_candidates` or `friendly_trial_bases`.
3. `country_key` differs between unit and base.
4. Arabic country name and English country key block matching.
5. RED base names are Arabic while units reference English or ID-only fields.
6. Base Status panel is fixed, but another map/preview layer uses older matching logic.

Important rule:

Never silently hide unmatched RED units. Show them under `Unassigned / needs base review`.

## Pending issue 4: Objective X still needs full audit beyond PR #10

PR #10 only fixes the client-side `Preview Decision Steps` objective source in `demo-scenario-preview.js`.

Still audit all Objective X sources:

- Scenario Setup objective picker in `scenario-import-wizard.js`
- Review payload `operational_brief.objectives[]`
- user-selected objective if stored in wizard state
- Free Fight objective usage in `free-fight-demo.js`
- domain movement objective usage in `domain-movement.js`
- server `/api/wargame-sim/generate-preview`
- legacy Start Scenario Generation path

Expected rule:

Objective X must come from an explicit objective source or operator-selected objective. It must never come from the first placement/base candidate.

Check whether each feature uses the same objective source:

- Review card
- Preview Decision Steps
- Free Fight
- Start Scenario Generation
- any map overlay

## Pending issue 5: Preview Decision Steps cleanup

Known code area:

- `UI_MOdified/client/shell/demo-scenario-preview.js`
- server route `/api/wargame-sim/generate-preview`
- `test-demo-scenario-preview.js`
- preview button binding in `doc-understanding-review.js`

Current status:

- The module is intended to be preview-only.
- It should not mutate scenario state.
- It should not mutate imported JSON.
- It should not write final scenario output.
- It should not call live commit paths.

Remaining UI issues:

- Panel uses many inline hardcoded dark colors.
- Panel uses `direction:ltr`.
- Some legend text is English-only.
- Theme/light mode does not fully apply.
- Need clearer labeling that preview units are not actual scenario units.

Do not mix a full theme refactor with the Objective X safety fix unless explicitly approved.

## Pending issue 6: Arabic/i18n and theme pass

Arabic mojibake appears fixed, but full translation coverage is not complete.

Files to audit:

- `UI_MOdified/client/shell/doc-understanding-review.js`
- `UI_MOdified/client/shell/scenario-import-wizard.js`
- `UI_MOdified/client/shell/base-status-panel.js`
- `UI_MOdified/client/shell/placement-candidates-panel.js`
- `UI_MOdified/client/shell/demo-scenario-preview.js`
- `UI_MOdified/client/shell/free-fight-demo.js`
- `UI_MOdified/client/shell/scenario-workspace.js`
- `UI_MOdified/client/app.html`
- `UI_MOdified/client/i18n.js`

Look for:

- English-only visible labels
- stale Arabic translations
- mojibake markers: `Ù`, `Ø`, `â€”`, `�`
- dynamic Arabic text missing `dir="auto"`
- Arabic inside monospace/table cells
- hardcoded dark colors
- panels that ignore light theme
- labels that should use i18n keys instead of string literals

Theme issue:

Many review/preview panels still use inline hardcoded colors such as:

- `#0e1620`
- `#101820`
- `#121a22`
- `#e8eaed`
- `#cfe6ff`

These panels may remain dark even when the app is switched to light mode.

Preferred future fix:

- Move high-use styles to CSS classes.
- Use theme variables.
- Avoid a large rewrite in the same patch as logic fixes.

## Recommended implementation order

1. Verify PR #10 locally.
2. If PR #10 passes, merge it.
3. Patch Proposed Units density in `doc-understanding-review.js`.
4. Patch Enemy Bases density in `doc-understanding-review.js`.
5. Run live test with the real 452-unit JSON.
6. Run RED/BLUE base attachment diagnostics with the real JSON.
7. Audit remaining Objective X paths beyond preview.
8. Do a focused Arabic/i18n pass.
9. Do a focused light/dark theme pass.

Do not merge density, Objective X server logic, Free Fight, i18n, and theme refactor in one large commit unless there is no alternative.

## Suggested next Claude task

Use this prompt next:

```text
Run REVIEW-DENSITY-OBJECTIVE-PREVIEW-CONTINUATION-A.

Start by reading docs/review-density-objective-preview-handoff.md.

Then:
1. Check PR #10 / branch fix/review-density-objective-preview.
2. Run `node test-demo-scenario-preview.js`.
3. Live-test Preview Decision Steps with the real Step 1 JSON.
4. Confirm the preview objective is not first placement_candidate.
5. If good, mark PR #10 ready or merge only with user approval.
6. Then implement Proposed Units and Enemy Bases collapsed/grouped rendering in a separate branch/commit.
7. Use the real JSON to verify Proposed Units (452) and Enemy Bases (64) do not dump all rows by default.
8. Do not push to main until tests and live verification pass.
```

## Final principle

The review UI must show everything the AI understood, but it must not overload the commander. Large data must be summarized first, then expanded on demand.

The safe rule remains:

AI suggests → RMOOZ validates → Commander reviews/approves → only then final scenario state changes.
