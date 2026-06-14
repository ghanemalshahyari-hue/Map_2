# Review Card Density / Objective X / Preview Decision Steps — Deep Audit

_Branch: `fix/review-density-objective-preview` · Audited: 2026-06-14_

---

## 1. Git State

| Check | Result |
|---|---|
| Current branch | `fix/review-density-objective-preview` |
| HEAD | `c6a025ed` — `fix(preview): avoid deriving Objective X from base anchors` |
| `origin/main` | `7877aa50` — `docs: add review density objective preview handoff` |
| Branch delta | **1 commit ahead of main** — only `demo-scenario-preview.js` differs |
| Merge in progress | No |
| Unmerged files | None |
| Unstaged changes | `data/scenarios/_active.json` (runtime write — expected) |
| Untracked | `data/scenarios/attack_objective_draft-15.json`, `test-demo-scenario-preview.js` |
| UTF-8 mojibake fix | ✅ Present — commit `52dfc6e` (`fix(UTF8-MOJIBAKE-ARABIC-FIX-A)`) |
| Step 1 JSON analyze path | ✅ Present — `server/wargame-sim-bridge.js:1276` |
| `assigned_base_id` / `base_id` matching | ✅ Present — `base-status-panel.js:baseIdMatches()` |

**Local main vs origin/main**: local `main` is at `7877aa50` = `origin/main`. No divergence. The PR branch has one clean commit on top.

---

## 2. Proposed Units Density

### Code path (`doc-understanding-review.js`)

`renderProposedUnits(p)` — lines 319–373:
- Reads from `opBrief(p).proposed_units`, fallback to `p.understanding.proposed_units`. Does **not** read `generation.review_proposed_units`.
- Groups by `assigned_base_id` or `base_id`; falls back to `base_name + coords`.
- Iterates all groups with `Object.keys(groups).forEach()` — **no row cap**.
- Inner `glist.forEach()` renders every unit card — **no row cap**.
- Section wrapped in a plain `<section>` div. **No `<details>/<summary>`, no "Show all", no progressive disclosure.**

### Live test evidence (452-unit payload)

| Metric | Measured |
|---|---|
| Unit cards rendered by default | **452** (all) |
| DOM nodes in review panel | **9,232** |
| HTML size | **797 KB** |
| `[data-el="proposed-units"]` height | **37,035 px** (~37 metres) |
| `[data-el="enemy-bases"]` height | **18,112 px** |
| Total review `scrollHeight` | **56,264 px** |
| Render time | 26 ms (fast, but browser must lay out 9k nodes) |

The section heading shows `الوحدات المقترحة — Proposed Units (452)` then immediately dumps all 452 cards. The BLUE group alone (359 units) is taller than the usable screen height of any monitor.

### Grouping structure present

Groups by base anchor ID (e.g., all 36 F-22 Raptors at `BLUE-US-AL-DHAFRA` appear under one heading). This grouping is correct in design but the group bodies are fully expanded with no limit.

### Missing: required progressive disclosure pattern

```
الوحدات المقترحة — Proposed Units (452)
[RED: 93]  [BLUE: 359]  [Countries: N]  [Bases attached: N]  [Unassigned: N]

▶ RED units (collapsed by default when > 20)
▶ BLUE units (collapsed by default when > 20)
▶ By country
▶ By base
▶ Unassigned / needs base review
```

No implementation of this pattern currently exists.

---

## 3. Enemy Bases Density

### Code path (`doc-understanding-review.js`)

`renderEnemyBases(p)` → `renderEnemyBasesReviewPanel(bases, friendlyTrials)`:
- `enemyBases(p)` reads `ob.enemy_bases` + `ob.enemy_forces.bases/air_bases/naval_bases/land_bases`.
- `friendlyTrialBases(p)` reads `ob.friendly_trial_bases` + `ob.friendly_forces.trial_bases`.
- Both rendered with `.forEach()` — **no row cap, no grouping by country/type**.
- **No duplicate check** between `enemy_bases`, `placement_candidates`, and `country_bases`.
- Friendly trial bases show in a separate section but same flat render.

### Live test evidence (63 RED bases + 137 BLUE bases)

| Metric | Measured |
|---|---|
| Enemy (RED) base cards | 63 |
| Friendly (BLUE) base cards | 137 |
| Total base cards | **200** |
| Section heading | `Bases Review — مراجعة القواعد` |
| Country/type grouping | None |
| Deduplication vs placement_candidates | None |

The "64" figure cited in the handoff is the `enemy_bases` count from the brief that generated this dataset; the actual data here has 63 RED bases. No functional difference.

### Duplicate risk

In a real workflow the 63 RED bases in `enemy_bases` may also appear in `placement_candidates` (which uses them as anchor targets). No check exists to prevent showing the same base twice.

---

## 4. RED / BLUE Base Attachment

Analysis run against `attack_objective_draft-14.json` `generation.review_proposed_units` (452 units) and `generation.review_placement_candidates` (200 anchors).

### Summary table

| Side | Proposed Units | Anchors Available | Attached | Orphaned | Attach Rate |
|---|---|---|---|---|---|
| RED | 93 | 63 | **89** | **4** | 95.7% |
| BLUE | 359 | 137 | **359** | **0** | 100% |

### Root cause of 4 RED orphans

All 4 orphaned RED units share the same `assigned_base_id`:

```
assigned_base_id = "RED-IRAN-NAVAL_BASE-KONARAK-CHABAHAR"
```

The anchor for Konarak/Chabahar was generated with type `AIR_BASE`:

```
anchor.base_id = "RED-IRAN-AIR_BASE-KONARAK-CHABAHAR"
anchor.id      = "ANCHOR-RED-IRAN-AIR_BASE-KONARAK-CHABAHAR"
```

`baseIdMatches()` in `base-status-panel.js` does an exact-string match: `"RED-IRAN-NAVAL_BASE-KONARAK-CHABAHAR" ≠ "RED-IRAN-AIR_BASE-KONARAK-CHABAHAR"`. No match → orphaned.

**This is a DATA GENERATION bug, not a `base-status-panel.js` logic bug.** Konarak/Chabahar hosts both an air base and a naval base. The generation pipeline created only the `AIR_BASE` anchor variant; the 4 naval units were assigned to the `NAVAL_BASE` variant which has no anchor in `placement_candidates`.

| Platform | Assigned base ID | Closest anchor (type-stripped match) |
|---|---|---|
| Frigates: Moudge-class | `RED-IRAN-NAVAL_BASE-KONARAK-CHABAHAR` | `RED-IRAN-AIR_BASE-KONARAK-CHABAHAR` |
| Corvettes: Sina-class | same | same |
| Submarines: Ghadir-class | same | same |
| Support: Hovercraft, Logistics | same | same |

### `base-status-panel.js` matching logic — confirmed correct for the 89 attached

`baseIdMatches(unit, anchor)` checks:
- unit: `[assigned_base_id, base_id]`
- anchor: `[base_id, id, assigned_base, location_id]`

For the 89 attached RED units: `unit.assigned_base_id` matches `anchor.base_id` exactly. The `ANCHOR-` prefix on `anchor.id` is irrelevant because `anchor.base_id` (without prefix) is checked first. No ANCHOR-prefix bug for attached units.

### How to fix the 4 orphans

The generation pipeline should create both `AIR_BASE` and `NAVAL_BASE` anchor variants for dual-purpose sites, or use a site-level ID (e.g., `RED-IRAN-BASE-KONARAK-CHABAHAR`) that is type-agnostic. The matcher already handles this correctly; it just needs the correct anchor to exist.

---

## 5. Objective X Source Audit

### Per-module source table

| Module | Objective Source | Uses placement_candidates? | Status |
|---|---|---|---|
| `scenario-import-wizard.js` | Operator lon/lat inputs; server default via `loadObjective()` | ❌ Never | ✅ Safe |
| `demo-scenario-preview.js` (PR branch) | Explicit fields → `objectives[]` → `ao.center` | ❌ Never | ✅ Fixed by PR #10 |
| `demo-scenario-preview.js` (main/old) | **placement_candidates first**, then `ao.center`, then `objectives[]` | ✅ **YES — BUG** | ❌ Broken on main |
| `free-fight-demo.js::deriveObjective()` | `operational_brief.objectives[]` → `ao.center` | ❌ Never | ✅ Safe |
| `domain-movement.js` | Receives objective as parameter from caller | ❌ N/A | ✅ Safe |
| **`server /generate-preview`** (wargame-sim-bridge.js:1598–1608) | `body.objective` if provided, else **first `placement_candidate`** | ✅ **YES — BUG** | ❌ Server fallback wrong |

### Server `/generate-preview` — remaining objective bug

```javascript
// wargame-sim-bridge.js lines 1598–1608
var objective = (body.objective && typeof body.objective === 'object') ? body.objective : null;
if (!objective) {
    var ob = briefNorm.operational_brief || {};
    var cands = Array.isArray(ob.placement_candidates) ? ob.placement_candidates : [];
    for (var ci = 0; ci < cands.length; ci++) {
        var cand = cands[ci];
        if (cand && typeof cand.lon === 'number' && typeof cand.lat === 'number') {
            objective = { lon: cand.lon, lat: cand.lat };   // ← first placement_candidate used as objective
            break;
        }
    }
    // operational_brief.objectives[] is NEVER checked as fallback
}
```

PR #10 fixes the **client** so `body.objective` is now always populated from `objectives[]`. The server fallback is therefore masked in the normal wizard flow. However, any direct POST to `/generate-preview` without an objective in the body will still use the first placement_candidate. The server needs its own safe fallback: `objectives[]` → `ao.center` → null.

### Live test — Preview Decision Steps (PR branch)

```
Fetch intercepted: POST /api/wargame-sim/generate-preview
body.objective = { lat: 24.33, lon: 54.66 }   ← from objectives[0].coord = [54.66, 24.33] ✓
```

The objective was correctly derived from `operational_brief.objectives[0]`, not from a placement_candidate. PR #10 fix working as intended.

---

## 6. Preview Decision Steps Behavior Map

### Live test results

| Check | Result |
|---|---|
| Fetch URL | `/api/wargame-sim/generate-preview` ✓ |
| `body.objective` | `{lat:24.33, lon:54.66}` — from `objectives[0]` ✓ |
| Steps returned | **7** |
| Panel visible | ✓ |
| Step navigation | ◀ / ▶ buttons working |
| `window.RmoozScenario.stepIndex` after build | **0** — not mutated ✓ |
| `isActive()` after build | `true` ✓ |
| Source JSON mutated | No ✓ |
| Preview flag on response | `preview._isPreview: true` checked ✓ |

### Panel text sample (Step 1 of 7)

```
Phase / المرحلة: Initial posture — تمركز ابتدائي
Action / العمل: Establish the preview force posture around known bases and trial anchors.
Reason / السبب: The reviewed payload identifies bases, anchors, and proposed units before
any committed tasking...
```

Action/Reason/Risk/Evidence labels are **English-only**. Arabic is present only in static headings.

### Panel style issues

| Issue | Evidence |
|---|---|
| `direction: ltr` hardcoded | `panelDir = "ltr"` via `getComputedStyle` |
| Background hardcoded dark | `panelBg = "rgb(14, 22, 32)"` = `#0e1620` |
| `#121a22` in panel HTML | 15 occurrences |
| `#16222e`, `#0f1922`, `#0b131b` | 1–2 each |
| Light theme response | **None** — panel stays dark after `data-theme` toggle |

---

## 7. i18n and Theme Audit

### Mojibake scan — all clear

No `Ù`, `Ø`, `â€"`, `â€`, `Ã`, `ï¿½` markers found in any of the 6 audited shell files. The UTF-8 fix from commit `52dfc6e` is effective.

### i18n integration — critical gap

| File | Lines | i18n() calls | Hardcoded dark hex colors |
|---|---|---|---|
| `doc-understanding-review.js` | 923 | **0** | 31 |
| `scenario-import-wizard.js` | 1,408 | **0** | ~12 |
| `base-status-panel.js` | 550 | **0** | ~20 |
| `placement-candidates-panel.js` | 327 | **0** | ~15 |
| `demo-scenario-preview.js` | 565 | **0** | ~18 |
| `free-fight-demo.js` | 730 | **0** | ~22 |
| **Total** | **4,503** | **0 / 4,503** | **~118** |

`i18n.js` has 1,000+ translation keys but zero are called from any of these modules.

### English-only visible labels (selected examples)

| File | Label | Line range | Missing Arabic |
|---|---|---|---|
| `scenario-import-wizard.js` | "Start Scenario Generation" | ~139 | Yes |
| `scenario-import-wizard.js` | "Continue Generation", "Restart Generation" | ~156–158 | Yes |
| `placement-candidates-panel.js` | All 14 `WARN_LABEL` strings | ~172–185 | Yes |
| `demo-scenario-preview.js` | "From:", "To:", "requires_review:true" | ~67–74 | Yes |
| `base-status-panel.js` | "Platform", "Count", "Review" table headers | ~392–393 | Yes |
| `free-fight-demo.js` | "Nearest RED anchor fallback" | ~152 | Yes |

### Missing `dir="auto"` (selected examples)

| File | Dynamic content | Impact |
|---|---|---|
| `doc-understanding-review.js:243` | `esc(c.mention \|\| c.base_name_en \|\| c.base_name_ar)` | Arabic base names render LTR |
| `placement-candidates-panel.js:244` | Base name chip text | Arabic chips mis-aligned |
| `base-status-panel.js:471,484` | `titleAr`, `titleEn` fields | Arabic unit names LTR |
| `free-fight-demo.js:511` | `g.base_name_en \|\| g.base_name_ar` | Mixed direction |
| `demo-scenario-preview.js:342–344` | Unit labels from data | AI-generated Arabic not marked |

### Hardcoded dark colors — theme isolation failure

Live test: toggling `data-theme` from `dark` → `light` does not change review panel or preview panel backgrounds. Both stay at `rgb(14, 22, 32)` = `#0e1620` because inline styles override any CSS variable cascade.

The 6 shell files collectively contain ~118 hardcoded hex color instances. None reference CSS custom properties. This means:
- The review card is permanently dark regardless of `data-theme`
- The preview panel is permanently dark
- The base status panel is permanently dark
- Light mode is effectively cosmetic (affects Leaflet map and top chrome only)

---

## 8. Recommended Implementation Order

### Priority 1 — Already verified, ready to merge
- **PR #10** (`fix/review-density-objective-preview`): 21/21 tests pass. Client-side `_deriveObjective()` fixed. Merge with owner approval.

### Priority 2 — Density (two separate commits)

**2A — Proposed Units collapse** (`doc-understanding-review.js::renderProposedUnits`):

Pattern to implement (native `<details>/<summary>` only, no framework):
```
header: "الوحدات المقترحة — Proposed Units (452)"
chips: [RED: 93] [BLUE: 359] [Bases attached: N] [Unassigned: N]
<details open="false"> RED units (93) — collapsed when > 20
  first 20 rows, then "Show all 93 ▾"
<details open="false"> BLUE units (359)
  first 20 rows, then "Show all 359 ▾"
<details open="false"> Unassigned / needs base review
```

Helpers to add inside the file (no new file needed):
```javascript
function sectionDetails(title, summaryHtml, bodyHtml, openDefault) { ... }
function previewRows(rows, limit, showAllLabel) { ... }
function countBy(arr, keyFn) { ... }
```

**2B — Enemy Bases collapse** (`doc-understanding-review.js::renderEnemyBases`):

```
header: "Enemy Bases — قواعد العدو (63)"
chips: [Air: N] [Naval: N] [Land: N] [With coords: N] [Needs review: N]
<details> By country → Iran (63)
<details> Missing coordinates
```

Rule: collapse when count > 20. Always show full count in heading.

### Priority 3 — Server Objective X fallback fix (`server/wargame-sim-bridge.js:1601–1608`)

Replace placement_candidates fallback with `objectives[]` → `ao.center` → null:

```javascript
if (!objective) {
    var ob = briefNorm.operational_brief || {};
    // Check objectives[] before giving up
    var objs = Array.isArray(ob.objectives) ? ob.objectives : [];
    for (var oi = 0; oi < objs.length; oi++) {
        var o = objs[oi];
        if (Array.isArray(o.coord) && o.coord.length >= 2 &&
            Number.isFinite(Number(o.coord[0])) && Number.isFinite(Number(o.coord[1]))) {
            objective = { lon: Number(o.coord[0]), lat: Number(o.coord[1]) };
            break;
        }
        if (o && Number.isFinite(Number(o.lon)) && Number.isFinite(Number(o.lat))) {
            objective = { lon: Number(o.lon), lat: Number(o.lat) };
            break;
        }
    }
    // Fallback: ao.center (approximate)
    if (!objective) {
        var ao = ob.area_of_operations || {};
        if (Array.isArray(ao.center) && ao.center.length === 2 &&
            Number.isFinite(Number(ao.center[0])) && Number.isFinite(Number(ao.center[1]))) {
            objective = { lon: Number(ao.center[0]), lat: Number(ao.center[1]) };
        }
    }
    // NEVER use placement_candidates as objective
}
```

### Priority 4 — RED orphan fix (data generation pipeline)

The 4 RED orphaned naval units at Konarak/Chabahar result from a data generation issue: the anchor was created as `AIR_BASE` but the units reference `NAVAL_BASE`. Fix: in the generation pipeline, when a site has both air and naval units, generate both `AIR_BASE` and `NAVAL_BASE` anchor variants, or use a type-agnostic site ID (`BASE` instead of `AIR_BASE`/`NAVAL_BASE`). `base-status-panel.js` matching logic is correct and does not need changes.

### Priority 5 — Live RED/BLUE attachment diagnostics

Add a collapsible diagnostics block to the review card showing:
```
Attachment summary: RED 89/93 attached (4 orphaned) | BLUE 359/359
[Show RED orphans ▾]
  Frigates: Moudge-class — assigned_base_id: RED-IRAN-NAVAL_BASE-KONARAK-CHABAHAR — no anchor found
  ...
```

### Priority 6 — Preview panel cleanup (focused, single commit)

- Replace `direction:ltr` with `direction:auto` in the preview panel `cssText`.
- Replace the 6 hardcoded color constants in the panel with CSS variables or light/dark-aware values.
- Do **not** refactor the whole file; patch only the panel `style.cssText` string.

### Priority 7 — Arabic/i18n pass (separate sprint)

- Add i18n keys for all operational labels in `i18n.js`.
- Wrap dynamic content with `<span dir="auto">`.
- Replace hardcoded strings with `i18n('key')` calls.
- Do not mix with logic fixes.

### Priority 8 — Theme pass (separate sprint)

- Define CSS custom properties (`--rmooz-surface`, `--rmooz-surface-2`, `--rmooz-text`) in root stylesheet.
- Replace inline hex colors in all 6 shell files.
- Test with both `data-theme="dark"` and `data-theme="light"`.

---

## Appendix — Key File Locations

| What | File | Key functions |
|---|---|---|
| Review card rendering | `client/shell/doc-understanding-review.js` | `renderProposedUnits()` L319, `renderEnemyBases()` L374, Preview button L816/885 |
| Base attachment | `client/shell/base-status-panel.js` | `unitBelongsToAnchor()` L113, `baseIdMatches()` L105, `allBases()` L48 |
| Import wizard + analyze | `client/shell/scenario-import-wizard.js` | `runAnalyze()` L530, `attachDiagnostics()` L495, objective inputs L273–274 |
| Preview module | `client/shell/demo-scenario-preview.js` | `_deriveObjective()` L155, `asObjectiveCoord()` L46, `build()` L121 |
| Free Fight objective | `client/shell/free-fight-demo.js` | `deriveObjective()` L63 |
| Server preview route | `server/wargame-sim-bridge.js` | `/generate-preview` L1588, objective fallback L1598–1608 |
| Real test data | `data/scenarios/attack_objective_draft-14.json` | `generation.review_proposed_units` (452), `generation.review_placement_candidates` (200) |

---

_No code changes in this document. All findings are inspection and live-test evidence only._
