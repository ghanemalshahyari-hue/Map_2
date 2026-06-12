# PR-230 — Wargame 3 Objective Status Color Tokens

**Date:** 2026-05-26  
**Status:** Delivered  
**Type:** CSS display-only — no logic changes  
**Scope:** `style.css` only

---

## 1. Summary

CSS-only update to the objective status badge (`#sw-drp-obj-status`) in the Wargame 3
dry-run preview panel. CONTESTED and DENIED previously shared the same red value
(`#c62828` / `rgb(198,40,40)`), making them visually indistinguishable. This PR
completes the four-step escalation ladder with distinct, readable colors in both
dark and light themes.

No logic changed, no adapter changed, no data changed, no i18n keys added.
AMBER RIDGE default behaviour confirmed intact.

---

## 2. Files Changed

| File | Change |
|------|--------|
| `UI_MOdified/client/style.css` | 14 lines replaced (objective status block, lines ~9183–9195) |

---

## 3. Color Ladder — Before / After

### Dark theme (default)

| Status | Before | After | Hex |
|--------|--------|-------|-----|
| DORMANT | `rgb(148, 163, 184)` | `rgb(158, 158, 158)` | `#9e9e9e` — medium gray |
| THREATENED | `rgb(230, 81, 0)` | `rgb(255, 179, 0)` | `#ffb300` — amber-600 |
| CONTESTED | `rgb(198, 40, 40)` | `rgb(239, 83, 80)` | `#ef5350` — red-400, vibrant red-orange |
| DENIED | `rgb(198, 40, 40)` + italic | `rgb(183, 28, 28)` + italic | `#b71c1c` — red-900, deep red |

### Light theme (`[data-theme="light"]`)

| Status | Before | After | Hex |
|--------|--------|-------|-----|
| DORMANT | `#757575` | `#757575` | unchanged — medium gray |
| THREATENED | `#bf360c` | `#ef6c00` | orange-700, warmer |
| CONTESTED | `#b71c1c` | `#c62828` | red-800, distinguishable from denied |
| DENIED | `#b71c1c` + italic | `#7f0000` + italic | darkest red — clear bottom rung |

---

## 4. CSS Diff

```css
/* before */
/* PR-222: Objective status badge — Wargame 3 dry-run preview only.
   Row hidden by JS for non-W3 fixtures. Text only — no map, no mutations. */
.sw-drp-obj-status-val { font-weight: 600; text-transform: uppercase;
                          letter-spacing: 0.04em; font-size: 0.78rem; }
.sw-drp-obj-status-val[data-status="dormant"]    { color: var(--text-muted,   #888888); }
.sw-drp-obj-status-val[data-status="threatened"] { color: var(--text-warning, #e65100); }
.sw-drp-obj-status-val[data-status="contested"]  { color: var(--text-danger,  #c62828); }
.sw-drp-obj-status-val[data-status="denied"]     { color: var(--text-danger,  #c62828);
                                                    font-style: italic; }
[data-theme="light"] .sw-drp-obj-status-val[data-status="dormant"]    { color: #757575; }
[data-theme="light"] .sw-drp-obj-status-val[data-status="threatened"] { color: #bf360c; }
[data-theme="light"] .sw-drp-obj-status-val[data-status="contested"]  { color: #b71c1c; }
[data-theme="light"] .sw-drp-obj-status-val[data-status="denied"]     { color: #b71c1c; }

/* after */
/* PR-230: Objective status badge — Wargame 3 dry-run preview only.
   Row hidden by JS for non-W3 fixtures. Text only — no map, no mutations.
   Escalation ladder: dormant(gray) → threatened(amber) → contested(red-orange) → denied(deep red). */
.sw-drp-obj-status-val { font-weight: 600; text-transform: uppercase;
                          letter-spacing: 0.04em; font-size: 0.78rem; }
.sw-drp-obj-status-val[data-status="dormant"]    { color: #9e9e9e; }
.sw-drp-obj-status-val[data-status="threatened"] { color: #ffb300; }
.sw-drp-obj-status-val[data-status="contested"]  { color: #ef5350; }
.sw-drp-obj-status-val[data-status="denied"]     { color: #b71c1c; font-style: italic; }
[data-theme="light"] .sw-drp-obj-status-val[data-status="dormant"]    { color: #757575; }
[data-theme="light"] .sw-drp-obj-status-val[data-status="threatened"] { color: #ef6c00; }
[data-theme="light"] .sw-drp-obj-status-val[data-status="contested"]  { color: #c62828; }
[data-theme="light"] .sw-drp-obj-status-val[data-status="denied"]     { color: #7f0000; font-style: italic; }
```

---

## 5. Design Rationale

The four statuses form a threat escalation sequence. The previous scheme broke the
visual logic at the CONTESTED→DENIED transition (identical red). The new scheme:

- **DORMANT** (`#9e9e9e`): neutral gray — situation inactive, no urgency
- **THREATENED** (`#ffb300`): amber — caution/attention warranted
- **CONTESTED** (`#ef5350`): vibrant red-orange — active engagement, high tension
- **DENIED** (`#b71c1c`) + italic: deep red + italic — objective lost, maximum severity

The italic on DENIED was already present from PR-222 and is retained as a secondary
differentiator. Color is now the primary signal; italic reinforces it.

CSS tokens (`--text-muted`, `--text-warning`, `--text-danger`) were removed in favour
of hard-coded hex values. The token values map to the same CSS custom properties but
did not resolve to the desired escalation colors; direct hex gives predictable,
auditable rendering across both themes without theme-token ambiguity.

---

## 6. W3 Step Coverage

All four `objective_status_baseline` values appear in `wargame3.json`:

| Status | Steps |
|--------|-------|
| DORMANT | 0, 1, 2, 3, 4 |
| THREATENED | 5, 6, 7, 8 |
| CONTESTED | 9, 10, 11, 12, 13, 14, 15 |
| DENIED | 16 |

Every status was rendered and verified in the browser (see §7).

---

## 7. Test Results

All 13 required tests executed against live app at `http://localhost:8000/app.html`.

| # | Test | Result |
|---|------|--------|
| T1 | `window.RmoozScenario.stepIndex` unchanged during color tests | ✅ stayed `0` |
| T2 | `scenario.name` intact (`'wargame3'`) | ✅ |
| T3 | `window.units` not mutated | ✅ N/A — not at global scope; constraint trivially satisfied |
| T4 | `window.lines` not mutated | ✅ N/A — not at global scope; constraint trivially satisfied |
| T5 | `localStorage` unchanged | ✅ length unchanged |
| T6 | No backend / fetch calls | ✅ CSS-only paint; no network activity |
| T7 | AMBER RIDGE default — nav hint still hidden after `paintDryRunPreview(null)` | ✅ `hint.hidden = true` |
| T8 | All four status colors are distinct | ✅ 4 unique `rgb(…)` values |
| T9 | CONTESTED ≠ DENIED (original bug fixed) | ✅ `rgb(239,83,80)` ≠ `rgb(183,28,28)` |
| T10 | THREATENED ≠ CONTESTED (escalation step intact) | ✅ `rgb(255,179,0)` ≠ `rgb(239,83,80)` |
| T11 | DENIED renders italic | ✅ `fontStyle = "italic"` confirmed at W3-STEP-16 |
| T12 | No Gate 7 / apply / commit / confirm UI visible | ✅ |
| T13 | `previewComplete` remains false across all 17 steps | ✅ false on all steps |

**13 / 13 passed.**

### Live-render spot-check (dark theme, W3 step samples)

| Step | Status | Computed color | Font style |
|------|--------|----------------|------------|
| W3-STEP-00 | `dormant` | `rgb(158, 158, 158)` | normal |
| W3-STEP-05 | `threatened` | `rgb(255, 179, 0)` | normal |
| W3-STEP-09 | `contested` | `rgb(239, 83, 80)` | normal |
| W3-STEP-16 | `denied` | `rgb(183, 28, 28)` | italic |

---

## 8. Safety Checklist

| Constraint | Status |
|---|---|
| No live scenario navigation | ✅ |
| No mutation of `window.RmoozScenario.stepIndex` | ✅ |
| No mutation of `window.RmoozScenario.scenario` | ✅ |
| No mutation of `window.units` / `window.lines` | ✅ |
| No map overlays, Leaflet markers, or arrows | ✅ |
| No storage / fetch / backend | ✅ |
| No apply / commit / confirm / Gate 7 controls | ✅ |
| No adapter logic changes | ✅ |
| No data file changes | ✅ |
| No app.js / adjudicator-map.js changes | ✅ |
| No scenario-workspace.js changes | ✅ |
| No app.html changes | ✅ |
| No i18n.js changes | ✅ |
| `selectedDecision` remains null | ✅ |
| `expectedResult` remains null | ✅ |
| `previewComplete` remains false | ✅ |
| AMBER RIDGE default behaviour preserved | ✅ — nav hint hidden for non-W3 |
