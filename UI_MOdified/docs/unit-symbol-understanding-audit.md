# Unit Symbol Understanding Audit — SYMBOL-UNIT-INTEL-A

**Date:** 2026-06-13  
**Scope:** `UI_MOdified/client/` symbol + unit-identity systems  
**Purpose:** Baseline audit before and after SYMBOL-UNIT-INTEL-A implementation

---

## 1. Symbol Systems Inventory

RMOOZ has three distinct symbol tiers. They do not share state and should never be conflated.

### Tier 1 — Final/Authoritative (milsymbol + APP-6D SIDC)

| File | API | What it does |
|---|---|---|
| `sidc-data.js` | `SIDC_PICKER_STANDARD` | APP-6D entity hierarchy lookup table (20-digit SIDC → entity/type/subtype). Pure data, no rendering. |
| `ui/controllers/symbol-controller.js` | `__APP_SIDC_PICKER_SET` | Symbol picker UI. Calls `ms.Symbol(sidc)` (milsymbol library) to render SVG thumbnails. Writes chosen SIDC into scenario on user selection. |
| `wargame/adjudicator-map.js` | (internal) | Wargame live-playback map. Renders real unit icons with `ms.Symbol(sidc, {size})` — division aggregates, off-map installation markers, damaged/status variants. Falls back to glyph div when milsymbol unavailable. |
| `symbology.js` | `AppSymbology` | **Tactical Mission Graphics only** (attack arrows, breach, bypass lines). NOT unit markers. Includes `FALLBACK_SIDC_FAVORITES` for picker chrome. |

**These are the only authoritative symbol renderers. Nothing else should produce final unit SIDCs.**

### Tier 2 — Step 1 Review Display (symbol-registry glyphs)

| File | API | What it does |
|---|---|---|
| `shell/symbol-registry.js` | `RmoozSymbolRegistry` | 13 object types → Unicode glyphs (`✈ ⚓ ▣ ◇ ⬢ ◎ ⊕ ▦ ★ ◉ ⌂ ?`). 13 platform categories → glyphs. `objectSymbol()`, `platformSymbol()`, `iconHtml()`. Review-only. |
| `shell/placement-candidates-panel.js` | `RmoozPlacementPanel` | Renders Step 1 anchor markers on the Leaflet map. Calls `RmoozSymbolRegistry.resolveBaseSymbol()` for icons. Read-only. |
| `shell/base-status-panel.js` | `RmoozBaseStatusPanel` | Unit/base detail card. Calls `RmoozUnitIntelNormalizer` to parse unit text; renders normalized type, echelon, composition, SIDC candidate, confidence, warnings. |

### Tier 3 — Demo-Only (review-only temporary overlays)

| File | API | What it does |
|---|---|---|
| `shell/demo-units.js` | `RmoozDemoUnits` | Builds demo groups from `placement_candidates`. Calls `RmoozUnitIntelNormalizer` per unit, tallies `category_counts`, builds `unit_intel_summary`. All groups: `demo_only:true, review_only:true, exact_unit_position:false`. |
| `shell/demo-movement.js` | `RmoozDemoMovement` | Simple demo movement (3 BLUE + 2 RED sample groups). DivIcon = color chip + country label. No glyph categorization. |
| `shell/free-fight-demo.js` | `RmoozFreeFightDemo` | RED-attacks-Objective-X / BLUE-reacts demo. Divicon uses `groupGlyph(g)` → `RmoozSymbolIdentity.resolve()` → category-appropriate Unicode glyph. milsymbol SVG preview shown in unit card when a safe SIDC candidate exists. |
| `shell/free-fight-ai.js` | `RmoozFreeFightAI` | Deterministic planner. Uses `category_counts` for attack/intercept suitability scoring. No rendering. |
| `shell/domain-movement.js` | `RmoozDomainMovement` | Route-shape helper. Uses `symbol_category` to classify movement domain (air/naval/ground/support). No rendering. |

### Tier 4 — SYMBOL-UNIT-INTEL-A Components (review-only understanding layer)

| File | API | What it does |
|---|---|---|
| `shell/unit-intel-normalizer.js` | `RmoozUnitIntelNormalizer` | **Arabic/English unit text → full schema.** Parses echelon, unit_type, composition, symbol_category. Pure, testable, no side effects. `normalizeUnitText(text)`, `normalizeUnit(unit)`, `normalizeUnits(units)`. |
| `shell/sidc-preview.js` | `RmoozSidcPreview` | Review-only SIDC preview. Returns a candidate **only** when `AppSymbology.FALLBACK_SIDC_FAVORITES` already ships that SIDC. Currently: Infantry (Friendly/Hostile/Unknown). All others → `sidc_candidate:"review_required"`. |
| `shell/symbol-identity.js` | `RmoozSymbolIdentity` | **Single resolution point.** Composes normalizer → symbol-registry → sidc-preview into one `resolve(input)` call. Returns `display_glyph`, `symbol_category`, `sidc_preview`, `confidence`, `warnings`. |
| `shell/symbol-db.js` | `RmoozSymbolDB` | Platform name → 13 categories. Reads `AppWorldStateDB` capability catalog. Used by `base-status-panel.js` as a secondary enrichment step. |

---

## 2. Audit Questions

### What symbols do we already have?

Three non-overlapping systems:
1. **milsymbol SVGs** via `ms.Symbol(sidc)` — only in Tier 1 (picker + wargame playback)
2. **Unicode category glyphs** via `symbol-registry.js` — Step 1 review and Free Fight demo
3. **Color-chip divIcons** — demo-movement.js simple demo (no glyph categorization)

### Which ones are real unit symbols?

Only Tier 1. `adjudicator-map.js` renders final NATO APP-6D symbols during wargame playback. `symbol-controller.js` lets the operator pick and assign a SIDC. Everything else is review-only display.

`symbology.js` is Tactical Mission Graphics (arrows, lines), not unit icons.

### Which ones are only Step 1 display symbols?

`symbol-registry.js` + `placement-candidates-panel.js`. These render base/object glyphs (✈ ⚓ ▣ etc.) for Step 1 placement candidates — never final unit SIDCs, never scenario state.

### Which ones are demo-only?

`demo-units.js`, `demo-movement.js`, `free-fight-demo.js` groups. All are `demo_only:true, review_only:true, exact_unit_position:false`. Markers are `_rmoozDemoOnly:true, _rmoozReviewOnly:true`. They disappear on `.clear()` and are never written to scenario or journal.

### Where are the current red/blue dots coming from?

`free-fight-demo.js` `syncMarkers()`:

```
groupGlyph(g)
  → RmoozSymbolIdentity.resolve({ symbol_category: dominant(g), side: g.side })
  → RmoozSymbolRegistry.platformSymbol(symCat)
  → { glyph: '◆', symbol_category: 'air_attack', ... }
```

These are **not generic dots**. The glyph reflects the group's dominant symbol category (▲ air_fighter, ◆ air_attack, ▢ naval_surface, ▬ ground_unit, ⊕ air_defense, ◎ radar, ▦ logistics). Only a group whose category resolves to `unknown` shows `?`.

`demo-movement.js` (separate simpler demo) still uses plain color-chip + country label — no glyph.

### Why are free-fight groups not using the app's richer milsymbol SVG symbols?

Two reasons:

1. milsymbol requires a valid 20-digit SIDC. `sidc_candidate` is always `"review_required"` — no final SIDC has been approved for demo groups.
2. `sidc-preview.js` only maps SIDC candidates from `AppSymbology.FALLBACK_SIDC_FAVORITES`, which currently ships Infantry (Friendly/Hostile/Unknown) only. Other categories return `sidc_preview_candidate:null`.

When a safe SIDC candidate exists (Infantry groups), `free-fight-demo.js` does render the milsymbol SVG inline in the unit card popup (`sidcPreviewHtml()`). The map marker icon itself stays a Unicode glyph — milsymbol SVGs at 15px marker size are illegible.

### What is missing to convert Arabic unit text into a symbol category?

**Nothing.** `unit-intel-normalizer.js` (SYMBOL-UNIT-INTEL-A) handles all documented Arabic patterns:

| Arabic | → | symbol_category |
|---|---|---|
| لواء / كتيبة / سرية / فصيل / بطارية | echelon | — |
| مشاة آلي / ميكانيكي | mechanized_infantry | ✓ |
| مدرع / دبابات | armor | ✓ |
| دفاع جوي / صواريخ أرض جو / سام | air_defense | ✓ |
| رادار / إنذار مبكر | radar | ✓ |
| استطلاع | reconnaissance | ✓ |
| مدفعية | artillery | ✓ |
| هندسة | engineer | ✓ |
| لوجستي / إمداد / تموين | logistics | ✓ |
| قيادة / مقر | hq | ✓ |
| قاعدة جوية / مطار | air_base | ✓ |
| قاعدة بحرية / ميناء | naval_base | ✓ |
| مشاة | infantry | ✓ |

Composition parsing: `(3 كتائب مشاة + كتيبة دبابات)` → `[ {count:3, echelon:'battalion', unit_type:'infantry'}, {count:1, echelon:'battalion', unit_type:'tank'} ]`

---

## 3. Script Load Order in app.html

```
4667  shell/symbol-db.js?v=symbol-db-b
4671  shell/symbol-registry.js?v=symbol-db-b
4673  shell/unit-intel-normalizer.js?v=symbol-unit-intel-a
4675  shell/sidc-preview.js?v=sidc-bridge-a
4677  shell/symbol-identity.js?v=global-symbol-identity-a
4678  shell/base-status-panel.js?v=base-status-a       ← after all its dependencies ✓
4679  shell/placement-candidates-panel.js?v=1
4683  shell/demo-units.js?v=demo-a
4684  shell/demo-movement.js?v=demo-a
4690  shell/domain-movement.js?v=domain-aware-movement-a
4691  shell/free-fight-demo.js?v=domain-aware-movement-a
```

Load order is correct. All consumers load after their dependencies.

---

## 4. Test Coverage

| Test file | Suite | Assertions | Status |
|---|---|---|---|
| `scripts/test-symbol-unit-intel-a.js` | SYMBOL-UNIT-INTEL-A | 29 | ✅ |
| `scripts/test-symbol-identity-a.js` | GLOBAL-SYMBOL-IDENTITY-A | 30 | ✅ |
| `scripts/test-domain-movement-a.js` | DOMAIN-AWARE-MOVEMENT-A | 39 | ✅ |

Part 6 required test cases coverage (all in `test-symbol-unit-intel-a.js`):

1. ✅ Arabic mech infantry brigade + composition (`لواء المشاة الآلي 71`)
2. ✅ Arabic tank battalion (`كتيبة دبابات`)
3. ✅ Arabic air defense battery (`بطارية صواريخ أرض جو`)
4. ✅ Arabic radar site (`موقع رادار إنذار مبكر`)
5. ✅ English mechanized infantry brigade (`71st Mechanized Infantry Brigade`)
6. ✅ Unknown Arabic falls back safely (`تشكيل غير واضح`)
7. ✅ Free Fight marker uses category symbol, not generic dot
8. ✅ No final units created (`demo_only:true, review_only:true`)
9. ✅ No world-state mutation (`global.units` and `global.AppWorldState` unchanged)
10. ✅ No final SIDC without review (`sidc_candidate:"review_required"` on all outputs)

---

## 5. Hard Boundaries (never cross)

- `needs_review:true` and `exact_unit_position:false` on all normalizer + identity outputs
- `sidc_candidate:"review_required"` unless an internal `FALLBACK_SIDC_FAVORITES` entry covers the type
- No mutations to `window.units`, `window.AppWorldState`, scenario JSON, or journal
- Demo markers: `_rmoozDemoOnly:true`, `_rmoozReviewOnly:true`, `_rmoozExactUnitPosition:false`
- The real milsymbol path (`symbol-controller.js`, `adjudicator-map.js`) is not touched by any Tier 3/4 code
