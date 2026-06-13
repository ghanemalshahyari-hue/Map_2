# Review Card Density, Objective X, Preview Decision Steps — Next Update Backlog

Saved after the current Step 1 work so it can be picked up in the next update without losing context.

## Current GitHub inspection summary

GitHub main shows good progress, but the review/import/preview workflow still needs a deep follow-up pass.

### Progress already visible

- Arabic mojibake appears fixed in the review renderer.
- The legacy full scenario JSON card now has clearer English and Arabic labels.
- Step 1 / operational JSON now has a path into Review AI Understanding through `/api/wargame-sim/analyze`.
- Base matching now includes ID-style fields such as `assigned_base_id`, `base_id`, `anchor_id`, `placement_candidate_id`, `base_location_id`, `location_id`, `assigned_base`, and `id`.

### Still incomplete

- `الوحدات المقترحة — Proposed Units (452)` is still too dense and appears to render too many rows by default.
- `Enemy Bases / قواعد العدو` with 64 bases is still too dense and needs grouping/collapse behavior.
- Objective X is still risky because preview logic may derive an objective from the first placement candidate.
- RED unit placement into bases still needs live verification against BLUE unit placement using the real JSON.
- `Preview Decision Steps / معاينة خطوات القرار` exists, but needs deeper testing for Objective X source, preview-only semantics, i18n, theme behavior, and map marker behavior.
- Light/dark theme coverage is incomplete because multiple review/preview panels still use hardcoded dark inline styles.
- Full English/Arabic coverage is incomplete; mojibake is fixed, but many visible labels are still English-only or hardcoded.

## Areas to audit next

### 1. Proposed Units density

Current issue:

```text
الوحدات المقترحة — Proposed Units (452)
```

Expected next design:

```text
الوحدات المقترحة — Proposed Units (452)

RED: <count>
BLUE: <count>
Attached to bases: <count>
Unassigned: <count>
Countries: <count>
Bases: <count>

▶ RED units
▶ BLUE units
▶ By country
▶ By base
▶ Unassigned / needs base review
```

Rules:

- Do not delete data.
- Collapse by default when count is high.
- Show first 10 or 25 rows per group.
- Add a Show all / Show less control.
- Use `dir="auto"` for Arabic names and dynamic text.
- Group by side, country, base, and unassigned status.

### 2. Enemy Bases density

Current issue:

```text
Enemy: 64
Friendly: 0
Enemy Bases (RED) (64)
```

Expected next design:

```text
Enemy Bases — قواعد العدو (64)

[Air bases: <count>] [Naval bases: <count>] [Land bases: <count>]
[With coordinates: <count>] [Needs review: <count>]

▶ By country
▶ By base type
▶ Missing coordinates
▶ Needs review
```

Rules:

- Collapse by default when count is high.
- Group by side, country, and base type.
- Avoid duplicated headings.
- Check if bases are duplicated between `enemy_bases`, `country_bases`, and `placement_candidates`.

### 3. RED units not placed into bases like BLUE

The code now has better matching, but it needs live verification using the real JSON.

Need counts:

```text
RED proposed units total
RED units attached to bases
RED units unassigned
BLUE proposed units total
BLUE units attached to bases
BLUE units unassigned
```

For each RED orphan, print:

```text
unit name/platform
side
country/country_key
assigned_base_id
base_id
assigned_base/base_name
available matching RED base IDs/names
reason it did not attach
```

Possible causes:

- RED units have IDs that do not match RED base IDs.
- RED bases live in `enemy_bases`, while BLUE bases live in `placement_candidates`.
- `country_key` mismatch blocks the match.
- Arabic country names and English country keys are not normalized together.
- Another map/preview layer still uses old matching logic.

### 4. Objective X source rule

Current risk:

`Preview Decision Steps` may derive Objective X from the first placement candidate. A placement candidate can be a base or anchor, not the real objective.

Expected rule:

```text
Objective X must come from:
1. user-selected objective,
2. operational_brief.objectives[],
3. explicit objective_x / target_location if present,
4. area_of_operations center only as a clearly labeled fallback.

Objective X must never come from the first placement_candidate.
```

Need to inspect:

- `scenario-import-wizard.js` objective picker.
- `demo-scenario-preview.js::_deriveObjective()`.
- `free-fight-demo.js` objective usage.
- `domain-movement.js` target usage.
- `/api/wargame-sim/generate-preview` server route.

### 5. Preview Decision Steps / معاينة خطوات القرار

Need live test:

- Click Preview Decision Steps.
- Inspect the request payload to `/api/wargame-sim/generate-preview`.
- Confirm which objective is sent.
- Check where RED units are placed.
- Check where BLUE units are placed.
- Confirm preview markers are clearly `preview_only` and `requires_review`.
- Confirm it does not mutate scenario state.
- Confirm it respects Arabic/RTL and light/dark theme.

Needed improvements likely include:

- Stop using first placement candidate as objective.
- Use theme variables instead of hardcoded dark colors.
- Add better bilingual labels.
- Make preview-only status more visible.
- Ensure map markers cannot be mistaken for committed scenario units.

### 6. i18n and Arabic coverage

Scan:

- `doc-understanding-review.js`
- `scenario-import-wizard.js`
- `base-status-panel.js`
- `placement-candidates-panel.js`
- `demo-scenario-preview.js`
- `free-fight-demo.js`
- `scenario-workspace.js`
- `app.html`
- `i18n.js`

Find:

- English-only visible labels.
- Stale Arabic translations.
- Mojibake markers: `Ù`, `Ø`, `â€”`, `�`.
- Missing `dir="auto"` on dynamic text.
- Arabic displayed in monospace where not appropriate.

### 7. Light/dark theme coverage

Many panels still appear to use hardcoded dark colors.

Need to find:

- Inline styles with dark backgrounds.
- Injected CSS strings with hardcoded colors.
- Panels that ignore light theme.
- Low-contrast text in light mode.

Expected direction:

- Move major review/preview styles into CSS classes.
- Use app theme variables instead of fixed color values.
- Keep side colors for RED/BLUE, but make surfaces theme-aware.

## Recommended implementation order after Step 1

1. Confirm GitHub main and local main are clean and equal.
2. Fix Objective X source priority.
3. Verify and fix RED base attachment using real JSON counts.
4. Add progressive disclosure for Proposed Units.
5. Add progressive disclosure for Enemy Bases.
6. Clean Preview Decision Steps objective/i18n/theme behavior.
7. Run full i18n and theme pass.
8. Add regression tests for large counts, Objective X source, RED/BLUE base attachment, and theme/i18n coverage.

## Audit prompt to run next

```text
Run REVIEW-CARD-DENSITY-OBJECTIVE-PREVIEW-DEEP-AUDIT-B.

Goal:
Deeply test the current pushed main/local code using the real JSON that produces:
- Proposed Units (452)
- Enemy Bases (64)
- RED units not attached like BLUE
- Objective X confusion
- Preview Decision Steps / معاينة خطوات القرار

Do not implement first.
Do not push.
Do not refactor.
Inspect Git first, then run live app tests.

Step 1 — Git state
Run:
git status
git branch --show-current
git fetch origin
git rev-parse HEAD
git rev-parse origin/main
git log --oneline -n 10

Confirm:
- local main equals origin/main or explain mismatch
- no merge in progress
- no unmerged files
- UTF-8 mojibake fix is present
- Step 1 JSON analyze path is present
- base_id / assigned_base_id matching is present

Step 2 — Proposed Units density
Inspect:
UI_MOdified/client/shell/doc-understanding-review.js::renderProposedUnits()

Using the real JSON:
- import through Step 1 / operational JSON
- open Review AI Understanding
- count DOM rows/cards under Proposed Units
- confirm whether all 452 units render by default
- measure if the page slows or freezes

Report:
- current grouping key
- number of groups
- rows rendered by default
- missing progressive disclosure
- recommended grouped/collapsed design

Step 3 — Enemy Bases density
Inspect:
renderEnemyBases()
enemyBases()
friendlyTrialBases()

Using the real JSON:
- count RED bases
- count BLUE/friendly bases
- count cards rendered by default
- check duplicate headings
- check Arabic/English labels

Report:
- whether all 64 bases render by default
- whether bases are duplicated between enemy_bases, country_bases, and placement_candidates
- recommended grouping by side, country, and base type

Step 4 — RED unit base attachment
Inspect:
base-status-panel.js::unitBelongsToAnchor()
scenario-import-wizard.js diagnostics
demo-units.js matching logic
operational-brief adapter fields

Using the real JSON, compute:
- total RED proposed units
- RED attached to bases
- RED orphaned
- total BLUE proposed units
- BLUE attached to bases
- BLUE orphaned

For each RED orphan, print:
- unit name/platform
- side
- country/country_key
- assigned_base_id
- base_id
- assigned_base/base_name
- available matching RED base IDs/names
- reason it did not attach

Step 5 — Objective X source audit
Inspect:
scenario-import-wizard.js objective picker
demo-scenario-preview.js::_deriveObjective()
free-fight-demo.js objective usage
domain-movement.js
server /api/wargame-sim/generate-preview

Using the real JSON:
- record objective sources available in payload
- record which source Preview Decision Steps uses
- record which source Free Fight uses
- record whether any code uses first placement_candidate as objective
- record whether a base anchor is mistaken as Objective X

Expected rule:
Objective X must come from user-selected objective or operational_brief.objectives[].
It must not come from the first placement_candidate.

Step 6 — Preview Decision Steps test
Click Preview Decision Steps.

Check:
- what request payload is sent to /api/wargame-sim/generate-preview
- what objective is sent
- where RED units are placed
- where BLUE units are placed
- whether preview units are clearly preview_only
- whether it mutates scenario state
- whether it uses dark hardcoded styles
- whether Arabic labels are complete
- whether light theme changes it

Step 7 — i18n and theme audit
Scan these files:
- doc-understanding-review.js
- scenario-import-wizard.js
- base-status-panel.js
- placement-candidates-panel.js
- demo-scenario-preview.js
- free-fight-demo.js
- scenario-workspace.js
- app.html
- i18n.js

Find:
- English-only visible labels
- stale Arabic translations
- mojibake markers
- missing dir="auto"
- hardcoded dark colors
- panels that do not change in light theme

Step 8 — Deliverable
Create:
docs/review-card-density-objective-preview-audit.md

Include:
- Git state
- live test evidence
- Proposed Units findings
- Enemy Bases findings
- RED/BLUE base attachment table
- Objective X source diagram
- Preview Decision Steps behavior map
- i18n gap table
- theme gap table
- recommended implementation order

No code changes until approved.
```
