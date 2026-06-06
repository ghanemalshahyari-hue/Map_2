# SYMBOL-FLOW-1 — Unit Symbol Rendering Pipeline (audit)

**Scope:** how RMOOZ turns a generated/imported WarGamingGEN unit into a visual
military symbol on the map. **Audit only** — no code was modified.

**Paths (official):**
- App: `C:\Users\ADMIN\Desktop\MAP_2\UI_MOdified`
- TestingAI: `C:\Users\ADMIN\Desktop\MAP_2\UI_MOdified\TestingAI`

**Evidence base:** latest generated GeoJSON
`TestingAI/WarGamingGEN/runs/2026-06-06_13-51-45/outputs/geojson/all_phases.geojson`
(1,190 unit features) and the imported scenario
`data/scenarios/gulf_of_sidra_2026_amphibious_assault.json` (17 RED + 32 BLUE).

---

## 1. The pipeline at a glance

```
WarGamingGEN GeoJSON unit feature        scripts/port-wargame.js                 data/scenarios/<name>.json            client/wargame/adjudicator-map.js
  properties: { side, domain, type,  ─▶  buildW3Scenario():                  ─▶  red_units[]   { uid, role,    ─▶   resolveUnitSymbolProfile(unit)  (4 tiers)
                echelon, name_ar,           w3SidcFor(props) BUILDS the sidc        domain, echelon, sidc, ... }       └▶ sidcIcon(resolved_sidc)  (milsymbol SVG)
                uid, strength, ... }        from name_ar + type + domain +       blue_units_initial[] { unit_uid,        └▶ diamondIcon / squareIcon (fallback)
  NO `sidc` field                           echelon                                role, domain, echelon, sidc }
```

**Key fact:** the source GeoJSON carries **no `sidc`**. SIDC is *synthesized by the
porter* from `name_ar` + `type` + `domain` + `echelon`. The map renderer then
validates/repairs that SIDC through milsymbol with a 4-tier fallback.

---

## 2. Where each field comes from / what drives the visual

| Field | Origin | Used for the symbol? |
|-------|--------|----------------------|
| `side` (RED/BLUE) | GeoJSON feature `properties.side` | Yes — affiliation digit (3=friend, 6=hostile) + chooses diamond vs square fallback |
| `domain` (naval/air/ground/strategic/sof) | GeoJSON `properties.domain` | Yes — input to porter `pickSymbolSet`; resolver `symbol_family` |
| `type`/`role` | GeoJSON `properties.type` → porter `role` | Yes — porter `pickMainIcon`; resolver Tier-2 family remap (`SYMBOL_FAMILY_ENTITY`) |
| `echelon` | GeoJSON `properties.echelon` (div/bde/bn/coy/sqn) | Yes — SIDC amplifier digits 8-9 (size) |
| `name_ar` | GeoJSON `properties.name_ar` | **Yes — dominant** input to porter `pickSymbolSet` + `pickMainIcon` |
| `sidc` | **Built by porter** (`w3SidcFor`) — not in GeoJSON | Yes — primary symbol source in the renderer |
| `status`/`destroyed`/`strength` | per-step `affected[]` / `engagement_arcs[]` / `unit_state` | Visual *state* only (gray + X overlay), not the base symbol |

---

## 3. Does WarGamingGEN export SIDC?

**No.** Confirmed: the 1,190 unit features in `all_phases.geojson` carry
`{action_*, airframes, current_strength, delayed_pct, destroyed, domain, echelon,
hulls_remaining, initial_strength, is_actor, is_affected, kind, magazine, name_ar,
phase, prev_lat, prev_lon, side, suppressed_pct, type, uid}` — **no `sidc`**.

RMOOZ therefore *infers* the symbol. The inference happens in **two stages**:
1. **Porter** builds a 20-char APP-6D SIDC (`scripts/port-wargame.js`).
2. **Renderer** repairs/validates it against milsymbol (`adjudicator-map.js`).

---

## 4. How `port-wargame.js` transforms unit features (`buildW3Scenario`)

- **RED/BLUE split:** `properties.side === 'RED'` → `red_units[]`; `'BLUE'` →
  `blue_units_initial[]`. (`isW3CombatUnit` filters out pure org/HQ/base/label nodes.)
- **Role/type:** `role = type || domain || 'unit'`; `label = shortenLabel(name_ar)`.
- **SIDC build (`w3SidcFor`):**
  - `pickSymbolSet(props)` → symbol set: **Sea-surface (30)**, Sea-sub (35), Air (01),
    Installation (20), or **Land (10)**. **`name_ar` leading word dominates** — a
    leading formation word (`لواء`/`كتيبة`/`فرقة`/`قيادة`…) forces **Land** even when
    `domain === 'naval'`; a leading ship word (`زورق`/`فرقاطة`/`مدمرة`…) forces Sea.
  - `pickMainIcon(props, ss)` → 6-digit entity from `name_ar`/`type` (ATGM, SAM,
    armor, infantry, destroyer, frigate, helo, UAV, …).
  - `buildSidc()` → `10 0 <aff> <set> 0 0 <echAmp> <icon> 0000`.
- **Preserves** `domain`, `name_ar`, `coord`, per-step coords; **adds** `sidc`.
- **Caps/filters:** drops non-combat org nodes (`isW3CombatUnit`); no numeric cap on
  combat units. Pipeline points capped at 64 (not unit-related).
- **Loses:** nothing symbol-relevant from the source — but note the source had no
  SIDC to begin with, so fidelity is bounded by `name_ar`/`type`/`domain` quality.

---

## 5. How the map renderer displays symbols (`adjudicator-map.js`)

Marker creation: **RED** `adjudicator-map.js:2134`, **BLUE** `:2200`.

```
_sym = resolveUnitSymbolProfile(unit)             // 4-tier resolve/repair
icon = sidcIcon(_sym.resolved_sidc, size)         // milsymbol SVG divIcon
       || diamondIcon(RED,label) / squareIcon(BLUE,base_id)   // Tier-4 fallback
```

- **milsymbol** (`window.ms.Symbol`) renders the SVG (`sidcIcon`, `:1587`).
- **`_resolveSidc`** (`:1572`) progressively strips entity subtype/type until the
  SIDC validates (handles milsymbol 2.0.0 rejecting specific child entity codes).
- **CSS classes:** `wg-adj-sidc` (milsymbol), `wg-adj-diamond`, `wg-adj-square`.
- **State overlays** (separate from base symbol): grayscale + `wg-adj-x` destroyed
  overlay, damaged SIDC status digit, opacity by strength.

---

## 6. Symbol resolver status (already present)

| Capability | Status | Location |
|------------|--------|----------|
| `resolveUnitSymbolProfile` | **Present** | `:1634` |
| `auditResolvedUnitSymbols` | **Present** (tallies tiers + examples) | `:1672` |
| milsymbol used | **Yes** | `:1590`, `:861`, `:1474` |
| `_resolveSidc` progressive-strip | **Yes** | `:1572` |
| Family remap of unsupported entities | **Yes** (`SYMBOL_FAMILY_ENTITY`, `SET_DEFAULT_ENTITY`) | `:1615` |
| Generic diamond/square still used | **Yes — Tier 4 only** (true unknowns) | `:1535`, `:1552` |
| `derivedSidcFor` (when no SIDC shipped) | **Yes** | `:1702` |

**Fallback tiers (`resolveUnitSymbolProfile`):**
1. **Tier 1 `scenario_sidc`** — original SIDC valid in milsymbol → used unchanged (authoritative).
2. **Tier 2 `role_domain_template`** — unsupported entity remapped to canonical family parent (ship/sub/AD/sensor) of the same affiliation+set+echelon.
3. **Tier 3 `symbol_set_frame`** — frame-only with the correct symbol set (honest family frame, no fake icon).
4. **Tier 4 `unknown`** — generic diamond (RED) / square (BLUE).

---

## 7. Traced units (imported `gulf_of_sidra_2026_amphibious_assault`)

| Unit uid | Side | GeoJSON role/domain/echelon | RMOOZ SIDC (set·icon) | Resolver source* | Visual result |
|----------|------|-----------------------------|-----------------------|------------------|---------------|
| R-d1-…-002 | RED | landing_ship / naval / company | `10`·`121000` | scenario_sidc | **Land** command icon — ⚠ naval shown as land |
| R-d1-41-003 | RED | naval_unit / naval / brigade | `10`·`121100` | scenario_sidc | **Land** infantry — ⚠ naval shown as land |
| R-d2-411-004 | RED | naval_unit / naval / battalion | `12`?`30`·`121105` | scenario_sidc | naval/recon |
| R-d2-412-005 | RED | naval_unit / naval / battalion | `30`·`121100` | scenario_sidc | sea-surface ✓ |
| R-d2-414-006 | RED | unknown / ground / brigade | `10`·`130501` | scenario_sidc | air-defense (SAM) ✓ |
| B-d1-51-002 | BLUE | landing_ship / naval / brigade | `10`·`121102` | scenario_sidc | **Land** mech — ⚠ naval shown as land |
| B-d2-511-003 | BLUE | mech_bn / ground / battalion | `10`·`121102` | scenario_sidc | mech infantry ✓ |
| B-d2-512-004 | BLUE | mech_bn / ground / battalion | `10`·`121102` | scenario_sidc | mech infantry ✓ |
| B-d1-52-005 | BLUE | mech_brigade / ground / brigade | `10`·`121102` | scenario_sidc | mech brigade ✓ |
| B-d2-521-006 | BLUE | mech_bn / ground / battalion | `10`·`121102` | scenario_sidc | mech infantry ✓ |

*Resolver source = data-level read; final Tier (1 vs 2/3/4) depends on milsymbol
validity at render time and can only be confirmed in-browser via
`auditResolvedUnitSymbols(scenario)`.

**Field coverage (all 49 units): `sidc` 49/49, `role` 49/49, `domain` 49/49,
`echelon` 49/49.** Symbol-set distribution: Land(10)=38, Air(01)=6, Sea(30)=5.

> The read-only audit test (`scripts/test-symbol-flow-1-audit.js`) auto-selects the
> largest w3-rich scenario — currently `wargame3.json` (153 units: Land 90 / Air 33 /
> Sea-surface 29 / Sea-sub 1; `role==='unknown'` ×20; G1 mismatches ×7, all air). Pass
> an explicit path to audit a specific import, e.g.
> `node scripts/test-symbol-flow-1-audit.js data/scenarios/gulf_of_sidra_2026_amphibious_assault.json`.

---

## 8. Gaps identified

| # | Gap | Where | Severity |
|---|-----|-------|----------|
| G1 | **Naval AND air units render as LAND symbols** when their `name_ar` starts with a formation word (`لواء`/`كتيبة`/`قيادة`…). `pickSymbolSet` lets the Arabic leading word override `domain`. Confirmed by the audit test: in `gulf_of_sidra` it hits `landing_ship`/`naval_unit` (naval→land); in `wargame3` it hits 7 air units (`strike`/`uav_isr`/`utility_helo`/`air_unit`, air→land). | porter `pickSymbolSet` | **High** (visible mis-domain) |
| G2 | `role` synthesized as `type || domain || 'unit'` → some units carry `role = 'unknown'` (icon then derived from `name_ar` only). | porter `buildW3Scenario` | Medium |
| G3 | No subsurface (35) units appeared though the domain exists — depends on source naming. | source data | Low (data-dependent) |
| G4 | SIDC fidelity is bounded by `name_ar`/`type` quality; the generator never emits an explicit SIDC, so there is no authoritative platform identity to preserve. | WarGamingGEN export | Medium |
| G5 | Final tier (proper milsymbol vs frame vs diamond) is only observable in-browser; no headless tier metric. | tooling | Low |

**Not gaps (working correctly):** ground/armor/infantry/SAM/recon symbols resolve
correctly; affiliation framing is correct; the 4-tier resolver prevents bare
diamonds for known families; destroyed/damaged state overlays are correct.

---

## 9. Where to change symbols safely (later — not in this task)

Ordered by leverage and safety:

1. **Porter `pickSymbolSet` (`scripts/port-wargame.js`)** — *highest-value, lowest-risk.*
   Make `domain === 'naval'/'air'` win over a leading formation word for the **symbol
   set** (keep land set only when domain is ground). Fixes G1 directly, generic, no
   per-unit hardcoding. (This is a data-mapping rule, not the renderer.)
2. **OOB parser / DOCX** — improve `type`/`domain` tagging at the source so `role` is
   never `'unknown'` (fixes G2). Requires DOCX edits + regeneration.
3. **WarGamingGEN GeoJSON export** — emit an explicit `sidc` (or a richer
   `platform_type`) per unit so RMOOZ preserves authoritative identity instead of
   inferring it (fixes G4). Largest change; generator-side.
4. **RMOOZ resolver tables (`SYMBOL_FAMILY_ENTITY` / `SET_DEFAULT_ENTITY`)** — extend
   family coverage for any milsymbol-unsupported entities that fall to Tier 3/4.
5. **Imported-scenario editor** — allow an operator to correct a unit's
   role/domain/SIDC post-import (the resolver already marks profiles `operator_editable`).

**Do NOT** hardcode per-unit icons, fabricate SIDCs, or special-case scenario names —
all fixes above are generic, data-shape driven.

---

## Acceptance — what we now know for certain

1. **Source fields driving visuals:** `side`, `domain`, `echelon`, `type`/`role`,
   and (dominantly) `name_ar` — combined by the porter into a synthesized `sidc`.
2. **Where symbol data is preserved/lost:** GeoJSON ships no SIDC; the porter *builds*
   it (no loss of an existing SIDC because none exists); the renderer preserves the
   porter's SIDC and only repairs invalid entity codes.
3. **How RMOOZ chooses the final symbol:** `resolveUnitSymbolProfile` 4-tier resolve →
   `sidcIcon` (milsymbol SVG).
4. **Fallback path:** Tier 2 family remap → Tier 3 frame-only → Tier 4 diamond/square.
5. **What to change later for fidelity:** primarily porter `pickSymbolSet` (G1), then
   OOB/DOCX tagging (G2), then optionally an explicit SIDC in the generator export (G4).
