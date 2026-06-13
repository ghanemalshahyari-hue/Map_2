# Unit Symbol Understanding Audit

SYMBOL-UNIT-INTEL-A audit and implementation notes.

## Existing Symbol Systems

RMOOZ currently has three distinct symbol lanes:

1. Real scenario/SIDC symbols: `UI_MOdified/client/app.js`, `UI_MOdified/client/sidc-data.js`, `UI_MOdified/client/symbology.js`, `UI_MOdified/client/ui/controllers/symbol-controller.js`, `UI_MOdified/client/shell/scenario-edit-mode.js`, `UI_MOdified/client/shell/unit-status-panel.js`, and `UI_MOdified/client/wargame/adjudicator-map.js` use explicit user-selected or scenario-provided SIDCs with `milsymbol`. This is the real unit-symbol path.

2. Step 1 review display symbols: `UI_MOdified/client/shell/symbol-registry.js`, `placement-candidates-panel.js`, `base-status-panel.js`, and `symbol-db.js` provide review-only glyphs for extracted bases, objects, and proposed-unit categories. These are not authoritative SIDCs.

3. Demo-only movement symbols: `demo-units.js`, `demo-movement.js`, `free-fight-ai.js`, and `free-fight-demo.js` convert Step 1 proposed units and anchors into temporary visual groups. They are `demo_only`, `review_only`, `needs_review`, `exact_unit_position:false`, and do not write scenario/world state.

## Dot Source

The generic RED/BLUE demo dots came from the demo overlay lane. `demo-movement.js` renders plain colored square/dot markers. `free-fight-demo.js` already asked `RmoozSymbolRegistry.platformSymbol(...)` for a glyph, but `demo-units.js` collapsed many useful categories into `ground_unit`, so infantry, mechanized infantry, armor, radar, air defense, engineer, logistics, and HQ could not survive into the Free Fight marker.

## Missing Layer

Before SYMBOL-UNIT-INTEL-A there was no pure Arabic/English unit phrase normalizer. Existing categorization handled platform strings and catalog systems, but it did not parse phrases such as `لواء المشاة الآلي 71 (3 كتائب مشاة + كتيبة دبابات)` into echelon, unit type, composition, symbol category, and review-required SIDC status.

## Implemented Review Layer

`UI_MOdified/client/shell/unit-intel-normalizer.js` is the shared pure normalizer. It returns review-only unit understanding with:

- original Arabic/English text
- language
- normalized names
- unit number
- echelon
- unit family and type
- symbol and platform categories
- composition items
- confidence, warnings, and missing information
- `sidc_candidate:"review_required"`
- `needs_review:true`
- `exact_unit_position:false`

It maps Arabic and English unit terms for brigade, battalion, company, platoon, battery, infantry, mechanized infantry, armor/tank, reconnaissance, air defense/SAM, radar, engineer, artillery, logistics, HQ, and base categories.

## Free Fight Integration

`demo-units.js` now calls the normalizer before falling back to the existing Symbol DB/category ladder. It keeps normalized categories in `category_counts` and attaches `unit_intel_summary` to demo groups. `free-fight-demo.js` uses that dominant normalized category for the marker glyph and shows unit-intel details in the demo unit card.

The integration remains demo-only:

- no final tasking
- no final COA
- no weapons/effects/damage
- no kill probability
- no WHITE adjudication
- no commander-approved orders
- no exact unit position
- no permanent world-state mutation

## Base/Object Card Integration

`base-status-panel.js` now uses the normalizer as an early classifier and shows the expanded unit-intel block in proposed-unit details: source text, normalized type/echelon, composition, symbol category, SIDC review status, confidence, and warnings.

## SIDC Boundary

The normalizer intentionally does not mint final SIDCs. Even when the unit type is understood, the result is `sidc_candidate:"review_required"` and `sidc_confidence:"review_required"`. The existing real SIDC/milsymbol workflow remains the only authoritative path for scenario unit symbols.

## Optional LLM Cross-Check Design Note (design only — not implemented)

The deterministic `unit-intel-normalizer.js` is and remains the **primary** parser.
An optional Qwen/LiteLLM pass may *cross-check* its output, but only as an advisory
second opinion — never as the source of truth. Flow:

1. **Deterministic parser runs first**, always, and produces the full schema
   (echelon / unit_type / symbol_category / composition / `sidc_candidate:"review_required"` …).
   This output stands on its own with no LLM present (the offline default).
2. **Optional cross-check** (only when explicitly enabled, e.g. `RMOOZ_FREE_FIGHT_LLM=1`
   with a configured provider — endpoint/key from `.env.offline` / `ai-secrets.local.js`,
   never hardcoded): the LLM is given the same text and asked to classify into the *same*
   fixed schema (the 14 symbol categories + echelon list). It may not introduce new fields.
3. **Agreement → higher confidence.** If the LLM's `symbol_category` (and ideally echelon)
   matches the deterministic result, raise the entry's `confidence` one step (low→medium,
   medium→high) and record `cross_check: "agree"`. Symbols/text are unchanged.
4. **Disagreement → conflict warning, deterministic wins.** If they differ, keep the
   deterministic `symbol_category` and add a `unit_intel_conflict` warning (e.g.
   `"llm_suggests:armor vs parser:mechanized_infantry"`) for operator review. The marker
   still renders the deterministic category; nothing is silently overwritten.
5. **LLM failure never blocks.** Timeout, unreachable provider, invalid JSON, or
   out-of-schema output → silently keep the deterministic result (optionally a
   `cross_check:"unavailable"` note). The demo/review path never hangs or errors on the LLM.

Hard guardrail (unchanged): RMOOZ must reject any LLM output that would create new units,
exact positions, bases, weapons, effects, damage, tasking, world-state mutation, final
SIDCs, or commander-approved orders. The cross-check may only adjust *confidence* and raise
*conflict warnings* within the deterministic schema. See
[`free-fight-ai-litellm-design.md`](free-fight-ai-litellm-design.md) for the broader
advisory-LLM posture this mirrors.

## SIDC Preview Bridge (SIDC-BRIDGE-A)

`client/shell/sidc-preview.js` (`window.RmoozSidcPreview`) bridges the normalizer to the
real AppSymbology / milsymbol world as a **review-only preview** — never an authority. It
takes `{ symbol_category, echelon, side }` and returns:

```
{ symbol_category, echelon, side, affiliation_preview, echelon_preview,
  sidc_preview_candidate: null | { sidc, source:"internal_app_symbology_mapping", matched_favorite, confidence },
  sidc_candidate:"review_required", confidence, warnings, needs_review:true, exact_unit_position:false }
```

**It uses ONLY existing internal data and invents nothing.** `sidc-data.js`
(`SIDC_PICKER_STANDARD`) holds picker *building blocks*, not finished SIDC strings — the app
assembles a SIDC when an operator picks one. The only **pre-built, app-sanctioned** SIDC
strings are the three `AppSymbology.FALLBACK_SIDC_FAVORITES` (Friendly / Hostile / Unknown
Infantry). So the bridge maps:

- **infantry** → the favorite chosen by side (BLUE→Friendly, RED→Hostile, none→Unknown);
  `source:"internal_app_symbology_mapping"`, confidence medium (low for unknown side). Read
  live from `AppSymbology.FALLBACK_SIDC_FAVORITES`, with an in-file mirror for Node/offline.
- **everything else** (mechanized_infantry, armor, reconnaissance, artillery, air_defense,
  radar, engineer, logistics, hq, bases, unknown) → `sidc_preview_candidate:null` +
  `warning:"No safe internal SIDC mapping found"`. Reconstructing those from picker parts
  would be "inventing" a SIDC, which this bridge does not do.

Boundaries: affiliation (side) and echelon are **preview-only** — echelon is *not* encoded
into the SIDC; composition children create no sub-markers; `sidc_candidate` stays
`review_required` (no final/approved SIDC); no units, world-state, weapons, damage, or
adjudication. The **display glyphs (RmoozSymbolRegistry) remain the primary renderer** and
the fallback; the SIDC preview is additive.

UI: the Free Fight demo unit card and Base Status proposed-unit detail rows show the
display category, normalized type/echelon, the SIDC preview candidate (or the
no-safe-mapping note), and a **"Review required before final symbol"** line. When
milsymbol (`window.ms`) is present, a small SVG preview of the candidate is rendered via
`previewSvg()` (guarded — returns null on any error); otherwise the category glyph stands
alone. Test: `scripts/test-sidc-bridge-a.js`.

## GLOBAL-SYMBOL-IDENTITY-A

`client/shell/symbol-identity.js` (`window.RmoozSymbolIdentity.resolve(input)`) is the **one
shared review-only symbol-identity layer** for every RMOOZ review surface — Free Fight,
Step 1 review, base/anchor cards, and (in future) the scenario editor, import wizard, unit
status cards, and map review layers. It composes the three deterministic pieces into a
single decision so all screens agree:

```
unit-intel-normalizer  → understand Arabic/English unit text
symbol-registry        → display glyph (unit category + object/base)
sidc-preview           → optional, additive review-only SIDC preview
```

**It is identity, not authority.** `resolve()` returns `{ original_text,
normalized_unit_intel, display_glyph, display_label, symbol_category, platform_category,
object_symbol, sidc_preview, sidc_candidate:"review_required", confidence, warnings,
missing_information, needs_review:true, exact_unit_position:false, source_type }`. It runs
the deterministic normalizer first, takes the glyph from the registry, and adds the
SIDC preview only when one is safe (else null + warning). Unknown text → unknown glyph +
`unknown_unit_type` warning. No final units, no approved SIDC, no world-state, no
weapons/damage/adjudication.

**It does NOT replace the real milsymbol final rendering** (`symbology.js` /
`units-map.js` / `adjudicator-map.js` / final scenario unit creation are untouched). It only
gives the review screens one consistent symbol decision.

Consumers (all keep their existing behavior as fallback when the resolver is absent —
the resolver is read from `window` only, never hard-required):

- **Free Fight** demo group markers/card resolve the group glyph via the resolver.
- **Base Status** proposed-unit rows prefix the resolved glyph on the category cell.
- **Placement/base anchors** consult the resolver for a *confident* object identity and
  otherwise fall through to the registry's base resolver (preserving the base_facility /
  unknown two-tier fallback).

**LLM later:** an optional Qwen/LiteLLM pass may cross-check this resolved result
(agreement raises confidence; disagreement raises a conflict warning; failure never
blocks) — but it can **never directly approve a SIDC**; `sidc_candidate` stays
`review_required`. Test: `scripts/test-symbol-identity-a.js` (12 cases).
