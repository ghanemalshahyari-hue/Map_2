# PR-229 — Wargame 3 Preview Navigation Polish

**Date:** 2026-05-26  
**Status:** Delivered  
**Type:** Display/navigation polish — no logic changes  
**Scope:** `app.html`, `i18n.js`, `style.css`, `scenario-workspace.js`

---

## 1. Summary

Five targeted display/UX improvements applied to the Wargame 3 dry-run preview
panel. No adapter logic changed, no data changed, no safety boundaries changed.
AMBER RIDGE default behaviour confirmed intact.

---

## 2. Files Changed

| File | Change |
|------|--------|
| `UI_MOdified/client/app.html` | Added `#sw-drp-nav-hint` `<p>` element |
| `UI_MOdified/client/i18n.js` | Added 4 keys (EN + AR) |
| `UI_MOdified/client/style.css` | 5 rule additions/edits |
| `UI_MOdified/client/shell/scenario-workspace.js` | Warning rendering + hint show/hide |

---

## 3. Display Changes

### 3.1 Effects list — max-height 72px → 200px

**Before:** Effects area capped at 72px (≈3 lines). Steps with 20–26 effects required
heavy scrolling; content barely readable above the fold.

**After:** Max-height raised to 200px (≈12 lines visible). Scroll still available for
the longest steps. Warnings area retains a tighter 80px cap — warnings are always
short (2 lines in W3 mode).

```css
/* before */
.sw-drp-effects-val,
.sw-drp-warnings-val { max-height: 72px; overflow-y: auto; … }

/* after */
.sw-drp-effects-val  { max-height: 200px; overflow-y: auto; … }
.sw-drp-warnings-val { max-height: 80px;  overflow-y: auto; … }
```

### 3.2 Warning area — MISSING_FIELD → informational style

**Before:** Both `selectedDecision is missing` and `expectedResult is missing`
warnings displayed in error-orange (`rgb(230, 81, 0)`) with raw `[MISSING_FIELD] ×2:`
code prefix, implying a fault.

**After:** In W3 mode, when all warnings are `MISSING_FIELD` (always the case after
PR-228's data gap cleanup), the panel shows a plain-language expected-gap note in
muted blue-gray (`rgb(148, 163, 184)`):

```
W3 source gaps (expected in preview):
  · Decision not set in source
  · Result not set in source
```

If any non-MISSING_FIELD warning appears (e.g., a future `UNKNOWN_UNIT`), the panel
falls back to the original error-orange `_drpFormatWarnings()` output. No warnings
are suppressed — the count and content remain the same; only the visual style and
label change.

CSS class used: `.sw-drp-warn-expected` (new). `.sw-drp-warn-text` still used for
genuine warnings.

### 3.3 Nav hint — "Preview only — live step unchanged"

**Before:** Navigation area had no explicit note that prev/next do not affect the
live scenario step index.

**After:** A subtle hint line appears below the nav buttons whenever the W3 nav panel
is visible:

> Preview only — live step unchanged  
> (Arabic: معاينة فقط — الخطوة الحية لم تتغير)

Element: `<p id="sw-drp-nav-hint" class="sw-drp-nav-hint">` — `hidden` by default,
revealed by `_updateDrpNavButtons()` when W3 mode is active. Hidden again when nav
collapses (e.g., non-W3 AMBER RIDGE default).

Styling: `font-size: 0.61rem; opacity: 0.46; text-align: center` — intentionally
unobtrusive.

### 3.4 Disabled button cursor — `default` → `not-allowed`

**Before:** Disabled prev/next buttons showed `cursor: default` — indistinguishable
from plain text.

**After:** `cursor: not-allowed` applied to `.sw-nav-btn:disabled` — standard UX
convention for inactive controls. Opacity stays at 0.28.

```css
/* before */
.sw-nav-btn:disabled { opacity: 0.28; cursor: default; }
/* after */
.sw-nav-btn:disabled { opacity: 0.28; cursor: not-allowed; }
```

### 3.5 `.sw-drp-warn-expected` — new CSS class

Added for the informational warning style:

```css
.sw-drp-warn-expected { font-size: 0.74rem; line-height: 1.5;
    font-family: var(--font-mono, 'Consolas', 'Monaco', monospace);
    color: var(--text-muted, #9e9e9e); }
[data-theme="light"] .sw-drp-warn-expected { color: #78909c; }
```

---

## 4. Before / After Usability Notes

| Area | Before | After |
|------|--------|-------|
| Effects height | 72px (≈3 lines), cramped for 20–26 effects | 200px (≈12 lines), scrollable |
| Warnings visual | Orange error text, raw `[MISSING_FIELD] ×2:` code | Muted gray, plain-language "W3 source gaps (expected)" |
| Nav isolation note | None (only distant safety row) | Inline hint below nav buttons |
| Disabled button cursor | `default` | `not-allowed` |
| Disabled button opacity | 0.28 | 0.28 (unchanged) |

---

## 5. i18n Keys Added

### EN (4 new keys)

| Key | Value |
|-----|-------|
| `sw-drp-nav-hint` | `'Preview only — live step unchanged'` |
| `sw-drp-w3-expected-warns` | `'W3 source gaps (expected in preview):'` |
| `sw-drp-w3-no-decision-warn` | `'Decision not set in source'` |
| `sw-drp-w3-no-result-warn` | `'Result not set in source'` |

### AR (4 new keys)

| Key | Value |
|-----|-------|
| `sw-drp-nav-hint` | `'معاينة فقط — الخطوة الحية لم تتغير'` |
| `sw-drp-w3-expected-warns` | `'ثغرات مصدر لعبة الحرب 3 (متوقعة في المعاينة):'` |
| `sw-drp-w3-no-decision-warn` | `'القرار غير محدد في المصدر'` |
| `sw-drp-w3-no-result-warn` | `'النتيجة غير محددة في المصدر'` |

---

## 6. Test Results

All 15 required tests executed against live app at `http://localhost:8000/app.html`.

| # | Test | Result |
|---|------|--------|
| T1 | W3 Step 0 displays | ✅ `#sw-drp-section` visible |
| T2 | Step counter shows `Step 1 / 17` (nav-step-info) | ✅ `"الخطوة 1 / 17"` |
| T3 | Preview next reaches Step 17 / 17 | ✅ `"الخطوة 17 / 17"` at W3-STEP-16 |
| T4 | Preview next is disabled at Step 17 | ✅ `next_btn.disabled = true` |
| T5 | Preview previous returns to Step 16 (from 17) | ✅ nav info `"الخطوة 16 / 17"` |
| T6 | Preview previous is disabled at Step 1 | ✅ `prev_btn.disabled = true` |
| T7 | `window.RmoozScenario.stepIndex` unchanged | ✅ stayed `0` |
| T8 | No map markers/arrows/overlays | ✅ paint calls are text-only |
| T9 | No storage/fetch/backend | ✅ `localStorage.length` unchanged |
| T10 | No apply/commit/confirm/Gate 7 labels | ✅ |
| T11 | AMBER RIDGE default still works — nav hint hidden | ✅ `hint.hidden = true` after `paintDryRunPreview()` |
| T12 | UNKNOWN_UNIT warnings remain 0 | ✅ 0 across all 17 steps |
| T13 | MISSING_FIELD warnings remain 34 | ✅ exactly 34 (2 per step × 17) |
| T14 | `selectedDecision` and `expectedResult` remain null | ✅ null on all 17 steps |
| T15 | `previewComplete` remains false | ✅ false on all 17 steps |

**15 / 15 passed.**

### Visual confirmation at Step 0

| Element | Value |
|---------|-------|
| `#sw-drp-step` | `W3-STEP-00 (1 / 17)` |
| `#sw-drp-nav-step-info` | `الخطوة 1 / 17` |
| `prev_btn.disabled` | `true` |
| `prev_btn cursor` | `not-allowed` |
| `prev_btn opacity` | `0.28` |
| `next_btn.disabled` | `false` |
| `#sw-drp-effects` max-height | `200px` |
| `#sw-drp-warnings` class | `sw-drp-warn-expected` (not `sw-drp-warn-text`) |
| `#sw-drp-warnings` color | `rgb(148, 163, 184)` (muted — not orange) |
| `#sw-drp-warnings` text | `ثغرات مصدر لعبة الحرب 3 (متوقعة في المعاينة):` |
| `#sw-drp-nav-hint` | visible, `معاينة فقط — الخطوة الحية لم تتغير` |

---

## 7. Safety Checklist

| Constraint | Status |
|---|---|
| No live scenario navigation | ✅ |
| No mutation of `window.RmoozScenario.stepIndex` | ✅ |
| No mutation of `window.RmoozScenario.scenario` | ✅ |
| No mutation of `window.units` / `window.lines` | ✅ |
| No map overlays, Leaflet markers, or arrows | ✅ |
| No storage / fetch / backend | ✅ |
| No apply / commit / confirm / Gate 7 controls | ✅ |
| No adapter logic changes | ✅ — only display rendering changed |
| No data file changes | ✅ |
| No app.js / adjudicator-map.js changes | ✅ |
| `selectedDecision` remains null | ✅ |
| `expectedResult` remains null | ✅ |
| `previewComplete` remains false | ✅ |
| AMBER RIDGE default behaviour preserved | ✅ — nav hint hidden for non-W3 |

---

## 8. Recommended PR-230

**PR-230 — Wargame 3 Objective Status Color Tokens**  
Type: Display-only  

The objective status badge (`#sw-drp-obj-status`) already has CSS color rules via
`data-status` attributes (DORMANT/THREATENED/CONTESTED/DENIED). However the
`--text-danger` token used for CONTESTED and DENIED is the same red, making them
visually indistinguishable. A PR that differentiates the two — e.g., amber for
CONTESTED, deep-red for DENIED — would complete the objective escalation ladder
as a distinct visual signal at a glance. This would be a CSS-only change in
`style.css` with no logic or data changes.
