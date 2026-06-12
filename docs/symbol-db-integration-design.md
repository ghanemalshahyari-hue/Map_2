# SYMBOL-DB-A Integration Design

Status: audit and design only.

Non-goals for this pass:

- No final Step 1 `proposed_units` conversion into scenario units.
- No final tasking.
- No scenario execution.
- No CMO database copying or proprietary data import.
- No push.

## Summary

RMOOZ already has three related but separate systems:

1. A SIDC/milsymbol map-symbol layer for placed and scenario units.
2. A review-only Step 1 understanding layer for proposed units, bases, and placement candidates.
3. A DB-Lite capability layer that enriches approved scenario units with readiness, supply, sensors, weapons, magazines, and doctrine tags.

The gap before converting Step 1 `proposed_units` is a small, explicit symbol/catalog bridge. That bridge should classify messy platform text into a safe `symbol_category` first, then optionally attach platform/catalog detail later. Unknown platforms must stay review-only and render as `unknown`, not crash, not disappear, and not become final tasking.

## Current Audit

| Area | Current files/functions | Current behavior | SYMBOL-DB-A implication |
| --- | --- | --- | --- |
| Manual symbol catalog and chrome | `UI_MOdified/client/symbology.js`, `STATUS_OPTIONS`, `FALLBACK_SIDC_FAVORITES` | Provides tactical graphic presets, status options, and fallback SIDC favorites. Default favorites include friendly, hostile, and unknown infantry SIDCs. | Existing operator symbol picking is SIDC-first. The new layer should not replace it; it should feed safe categories into it when exact SIDC is not available. |
| Symbol picker and SIDC resolution | `UI_MOdified/client/ui/controllers/symbol-controller.js`, `resolveSidcInfo()`, `applyAffiliation()` | Resolves SIDC labels from the APP-6 picker standard, applies affiliation digit changes, and renders quick-start milsymbol previews. | Keep this as the operator/manual symbol workflow. A platform category should be able to suggest a generic SIDC/icon, but operator SIDC remains authoritative when provided. |
| Unit popup for placed symbols | `UI_MOdified/client/popups.js`, `buildSymbolPopupContent()` | Builds marker popups from marker-private fields. Falls back to SIDC `10031000001200000000` if marker has no `_sidc`. Includes status, coordinates, range tools, raw SIDC, labels, and symbol controls. | Popup fallback currently means unknown typed content can still render. Proposed Step 1 grouped-unit popups should use this same "never throw" posture but should not expose final unit controls. |
| Tactical map graphic popup | `UI_MOdified/client/popups.js`, `buildGroupTmgPopupContent()` | Builds popup content for tactical graphics. | Not directly part of platform cataloging, but confirms popups are modular and HTML-rendered. |
| Scenario unit map markers | `UI_MOdified/client/wargame/adjudicator-map.js`, Red/Blue marker creation around scenario render, `sidcIcon()`, `resolveUnitSymbolProfile()` | Scenario units use authored SIDC when valid, then role/domain family remaps, then frame-only, then colored diamond/square fallback. Markers dispatch `rmooz:unit-selected` with `_unitData`. | Approved units already have a robust symbol fallback ladder. Future approved platform categories should enter before the diamond/square fallback, not bypass authored SIDC. |
| Aggregate/off-map markers | `UI_MOdified/client/wargame/adjudicator-map.js`, `buildAggregateIcon()`, `offMapMarkerIcon()` | Aggregate/off-map display uses milsymbol where possible and falls back to simple Leaflet div icons. | Base/facility anchors can follow this pattern: meaningful generic icon first, simple div icon fallback. |
| Marker status rendering | `UI_MOdified/client/wargame/adjudicator-map.js`, `renderMarkerByStatus()`, `buildUnitMarkerIcon()` | Applies active/degraded/destroyed marker styling around the base icon. | Symbol category should be separate from lifecycle status. A unit can be `air_fighter` and also degraded/destroyed later. |
| Step 1 AI Understanding renderer | `UI_MOdified/client/shell/doc-understanding-review.js`, `renderProposedUnits()`, `renderTaskAssembly()`, `renderDoctrineRequired()` | Renders operational brief fields, proposed units, Task Assembly, Doctrine Required, bases, and diagnostics when debug is enabled. Proposed units are displayed for review. | This is the correct first UI home for platform normalization. Show category labels here without creating final map units. |
| Step 1 placement anchors | `UI_MOdified/client/shell/placement-candidates-panel.js`, `renderMapAnchors()`, `mapAnchorIcon()` | Renders placement candidates as review-only map anchors. Marker metadata includes `_rmoozReviewOnly = true` and `_rmoozExactUnitPosition = false`; popup says `review marker only`. | Step 1 map anchors should remain base/facility markers. Group proposed platforms in popup/detail content, not as aircraft markers. |
| Commander Unit Status Panel | `UI_MOdified/client/shell/unit-status-panel.js`, `populatePanel()`, `enrichUnitForDisplay()`, `getPlatformLabel()`, `_renderSymbol()`, `populateIdentity()`, `populateSystems()`, `populateMagazines()`, `populateSensors()`, `populateWeapons()` | Read-only panel enriches selected units through DB-Lite, shows platform identity, readiness, supply, magazines, sensors, weapons, EMCON, deltas, and tasking only if current tasking exists. Symbol hero prefers local real image, then milsymbol SIDC, then SVG silhouette fallback. | Future approved units should pass platform/catalog fields into this panel. Proposed units should not appear here as live units until approved. |
| DB-Lite capability catalog | `UI_MOdified/client/shell/world-state-db.js`, `CAPABILITY_CATALOG`, `classifyKind()`, `capabilityFor()`, `enrichUnit()`, `enrichWorldState()` | Lightweight original catalog. Generic classes include `air_defense`, `naval_combatant`, `ground_maneuver`, `air_unit`, `ew_site`, and `generic`. Named entries include SAM/AAA/radar and selected air/naval/ground platforms. Enrichment fills missing `rcs_class`, `readiness`, `supply`, `doctrine_tags`, `sensors`, `weapons`, `magazines`, and image metadata without overwriting authored fields. | This is the right Level 2 destination for approved catalog details. Do not stuff uncertain Step 1 strings directly into DB-Lite as final facts. |
| World-state projection | `UI_MOdified/client/shell/world-state.js`, `projectUnit()`, `deriveWorldState()` | Projects scenario units into normalized world-state units carrying `role`, `domain`, `sidc`, `readiness`, `supply`, `sensors`, `weapons`, and `magazines`, then calls DB-Lite enrichment if present. | Approved units can carry `symbol_category` and platform fields through this projection later. Review-only Step 1 proposed units should stay out of derived live world state. |
| Doctrine/readiness/supply evidence | `UI_MOdified/client/shell/world-state.js`, `computeObjectiveEvidence()`, `computeDoctrineEvidence()` | Uses world-state `readiness`, `supply`, and `doctrine_tags` evidence. | Catalog links can strengthen future evidence after approval. They must not imply final doctrine or tasking during Step 1 review. |
| Scenario schema unit fields | `UI_MOdified/server/ai/scenario-schema-spec.js` | Red units require `uid`, `label`, `bls`, `appear`, `role`, `coord`; optional `echelon`, `strength`, `sidc`. Blue initial units require `unit_uid`, `base_id`, `coord`; optional `echelon`, `sidc`, `posture`. Off-map markers allow `label`, `kind`, `sidc`, `role`, `echelon`, `side`. | Current final scenario unit schema is role/SIDC oriented and has no explicit platform catalog fields. Add platform fields only in a later approved-unit pass. |
| Server unit storage | `UI_MOdified/server/app-data.js`, `units` table | Stores `sidc`, `unit_type`, `level`, `parent_id`, `size`, and `side`, but not rich catalog details. | Existing `unit_type` is a lightweight enum/string bucket, not a full platform catalog. Avoid making Step 1 proposed platform text depend on this table. |
| Existing unit type enums/families | `scenario-schema-spec.js`; `world-state-db.js`; `adjudicator-map.js` | No single universal platform enum exists. Current families are `role`, `domain`, DB-Lite `kind`, SQLite `unit_type`, scenario `kind`, SIDC symbol set, and map resolver families. | SYMBOL-DB-A should introduce a narrow `symbol_category` enum and keep it distinct from `role`, `domain`, `kind`, and SIDC. |
| Unknown fallback behavior | `world-state-db.js`, `classifyKind()`; `adjudicator-map.js`, `resolveUnitSymbolProfile()`; `unit-status-panel.js`, `_renderSymbol()`; `popups.js`, `buildSymbolPopupContent()` | DB-Lite falls back to `generic`; map symbol resolver falls back to unknown/frame-only/diamond/square; status panel falls back to SVG silhouette; popup falls back to a default SIDC. | Preserve this philosophy. Unknown platform normalization must return a valid object with `symbol_category: "unknown"` and empty capability arrays. |

## Current Capability Fields

DB-Lite currently supports the capability fields needed for a CMO-inspired but original RMOOZ catalog layer:

| Capability field | Current source | Notes |
| --- | --- | --- |
| `platform class` | Not explicit as a shared field. Currently implied by DB-Lite `kind`, scenario `role`/`domain`, and catalog row keys. | SYMBOL-DB-A should add explicit `platform_class` for the new bridge. |
| `sensors[]` | `CAPABILITY_CATALOG` rows and authored units, projected by `world-state.js`. | Preserved by `enrichUnit()` if authored data exists. |
| `weapons[]` | `CAPABILITY_CATALOG` rows and authored units. | Preserved by `enrichUnit()` if authored data exists. |
| `magazines[]` | `CAPABILITY_CATALOG` rows and authored units. | Used by status panel and world-state evidence. |
| `readiness` | Catalog default, authored unit, applied state overlays. | Existing enum style is `ready`, `limited`, `not_ready`. |
| `supply` | Catalog default or authored unit numeric value. | Existing convention is `0..1`. |
| `doctrine_tags` | `CAPABILITY_CATALOG` rows and projected world state. | Used by doctrine evidence. |

## Proposed Two-Level Symbol Strategy

### Level 1: Generic Symbol Category

Add a small, stable enum used by Step 1 review, map anchors, and future approved unit rendering:

```text
air_fighter
air_attack
air_transport
maritime_patrol
helicopter
uav
naval_surface
submarine
ground_unit
air_defense
radar
base_facility
hq
logistics
unknown
```

Level 1 answers: "What safe generic symbol should this thing use?"

Rules:

- The enum must always resolve to one value.
- If resolution fails, use `unknown`.
- Level 1 never creates final units by itself.
- Existing authored SIDC remains higher priority for approved live units.
- For Step 1 map anchors, use `base_facility` even when the popup contains aircraft or other proposed units.

### Level 2: Platform/Catalog Detail

Level 2 answers: "What platform/catalog detail can RMOOZ safely display or later link?"

It should carry normalized platform text, match status, confidence, and optional capability details. It may link to DB-Lite only when the match is strong enough or commander-approved.

Recommended match statuses:

```text
matched
category_only
ambiguous
unknown
review_required
```

Recommended confidence:

- Numeric `0..1`.
- `1.0` only for authored or curated catalog links.
- Step 1 LLM-derived names should normally remain below `0.9` and keep `needs_review: true`.

## Proposed Platform Normalization

This normalization is for review and symboling, not final unit conversion.

| Raw platform text | `symbol_category` | Notes |
| --- | --- | --- |
| `F-14A Tomcat` | `air_fighter` | Fighter category only unless an approved catalog row exists later. |
| `F-4D Phantom II` | `air_fighter` | Ambiguous fighter/attack family; preserve secondary candidate. |
| `F-4E Phantom II` | `air_fighter` | Ambiguous fighter/attack family; preserve secondary candidate. |
| `Su-24MK2` | `air_attack` | Strike/attack category. |
| `P-3F Orion` | `maritime_patrol` | Maritime patrol category. |
| `C-130E` | `air_transport` | Air transport category. |
| `C-130H` | `air_transport` | Air transport category. |
| `Bell 214` | `helicopter` | Helicopter category. |
| `AB-212` | `helicopter` | Helicopter category. |
| `Shahed-129` | `uav` | UAV category. |
| `Mohajer-6` | `uav` | UAV category. |
| `F-7M` | `air_fighter` | Fighter category. |
| `F-7N` | `air_fighter` | Fighter category. |
| `F-5E` | `air_fighter` | Fighter category. |
| `F-5F` | `air_fighter` | Fighter category. |
| `Su-25K` | `air_attack` | Attack/CAS category. |

For ambiguous platforms such as `F-4D/E Phantom II`, store:

```json
{
  "symbol_category": "air_fighter",
  "symbol_category_candidates": ["air_fighter", "air_attack"],
  "catalog_match_status": "ambiguous",
  "needs_review": true
}
```

## Recommended Schema

Attach this shape to proposed-unit review records first. Later, the same shape can be copied into approved units after commander approval.

```json
{
  "symbol_category": "air_fighter",
  "platform_class": "fighter_aircraft",
  "platform_name": "F-14A Tomcat",
  "catalog_match_status": "category_only",
  "catalog_confidence": 0.82,
  "capability_summary": "Review-only fighter aircraft candidate; no approved catalog row linked.",
  "sensors": [],
  "weapons": [],
  "magazines": [],
  "unknown_fields": [],
  "needs_review": true
}
```

Unknown platform example:

```json
{
  "symbol_category": "unknown",
  "platform_class": null,
  "platform_name": "Raw platform string from source",
  "catalog_match_status": "unknown",
  "catalog_confidence": 0,
  "capability_summary": "Unknown review-only platform; no capabilities inferred.",
  "sensors": [],
  "weapons": [],
  "magazines": [],
  "unknown_fields": ["platform"],
  "needs_review": true
}
```

Base/facility anchor example:

```json
{
  "symbol_category": "base_facility",
  "platform_class": "airbase",
  "platform_name": "Bandar Abbas",
  "catalog_match_status": "category_only",
  "catalog_confidence": 0.7,
  "capability_summary": "Review-only base/facility anchor with grouped proposed units.",
  "sensors": [],
  "weapons": [],
  "magazines": [],
  "unknown_fields": [],
  "needs_review": true
}
```

## Step 1 Map Anchor Design

For Step 1 proposed-unit review:

- Map marker symbol: always `base_facility` for base/facility anchors.
- Popup/detail content: group proposed units by side, base, and platform category.
- Do not place each aircraft as an exact unit marker yet.
- Keep marker metadata review-only:
  - `_rmoozReviewOnly = true`
  - `_rmoozExactUnitPosition = false`
- Keep proposed units out of scenario `red_units`, `blue_units_initial`, derived world state, tasking, and Commander Unit Status Panel until approval.

Suggested popup grouping:

```text
Base: Bandar Abbas
RED proposed units
- air_fighter: F-14A Tomcat x N
- air_attack: Su-24MK2 x N
- maritime_patrol: P-3F Orion x N
Review status: proposed only, exact unit positions not established
```

## Future Approved Unit Design

After commander approval, a proposed record may become a scenario unit. At that point:

- Marker symbol can use the approved unit's `symbol_category`.
- Authored SIDC still wins if present and valid.
- If no SIDC exists, map rendering can choose a generic category icon/SIDC.
- Unit Status Panel can show full catalog details if `catalog_match_status: "matched"`.
- `sensors[]`, `weapons[]`, and `magazines[]` should remain empty unless authored, approved, or matched to an RMOOZ catalog row.
- `needs_review` should remain true for ambiguous or category-only approvals until a human resolves the catalog link.

Recommended resolution order for future approved units:

1. Authored unit `sidc`.
2. Approved `symbol_category` to generic symbol mapping.
3. Existing role/domain/SIDC family resolver.
4. Existing diamond/square/unknown fallback.

## Implementation Shape For A Later Pass

Documentation-only recommendation:

- Add a small normalizer module near the Step 1 review/client shell boundary, for example `UI_MOdified/client/shell/symbol-catalog-lite.js`.
- Expose one pure function: `normalizePlatformSymbol(input)`.
- Input may include `{ platform, role, domain, side, base_id, source }`.
- Output must always match the recommended schema.
- Add a category-to-icon helper for review anchors and future approved units.
- Keep DB-Lite as Level 2 enrichment, not as the first parser for raw Step 1 text.

Pseudo-contract:

```js
function normalizePlatformSymbol(input) {
  return {
    symbol_category: 'unknown',
    platform_class: null,
    platform_name: input && input.platform || null,
    catalog_match_status: 'unknown',
    catalog_confidence: 0,
    capability_summary: 'Unknown review-only platform; no capabilities inferred.',
    sensors: [],
    weapons: [],
    magazines: [],
    unknown_fields: ['platform'],
    needs_review: true
  };
}
```

## Acceptance Tests

Design acceptance for SYMBOL-DB-A:

- Unknown platform must not crash renderer, normalizer, popup, or status panel.
- Unknown platform returns `symbol_category: "unknown"`.
- Unknown platform returns empty `sensors[]`, `weapons[]`, and `magazines[]`.
- Step 1 `proposed_units` remain review-only.
- Step 1 map anchors remain base/facility anchors, not exact aircraft markers.
- Proposed unit grouping can display platform categories in AI Understanding or placement-anchor popup.
- Approved units can later link to DB-Lite/catalog detail without changing the Step 1 review contract.
- Existing authored SIDC and existing DB-Lite enrichment remain backward compatible.

## Main Risks

- Conflating `symbol_category` with `role`, `domain`, `kind`, or SQLite `unit_type` would repeat the current fragmentation. Keep `symbol_category` narrow and explicit.
- Inferring sensors/weapons from Step 1 text would make review data look authoritative. Keep capabilities empty unless matched or approved.
- Rendering aircraft as live markers during Step 1 would violate the current placement-candidate contract. Base/facility anchors are the right visual boundary.
- Treating CMO as a source database would violate project direction. RMOOZ should keep this an original, lightweight capability catalog inspired by operational concepts, not copied platform data.
