# Unit Symbol Fidelity Audit (SYM1)

**Type:** audit / design only. No simulation, no scenario mutation, no rendering change (a read-only diagnostic test accompanies this). Verified empirically against `wargame3.json` data **and** the live milsymbol renderer (v2.0.0).

## TL;DR

**117 of 153 Wargame 3 units render as proper APP-6/milsymbol military symbols. 36 fall back to a plain colored marker** (red diamond / blue square — *affiliation-correct but function-less*). The 36 are the **naval family** + **land air-defense / missile / radar** + a few `unknown`-role units.

**Root cause is NOT a data gap and NOT the recent scaling/roll-up work.** Every one of the 153 units carries a complete 20-digit APP-6D SIDC plus `role` + `domain` + `echelon`. The fallback happens because **milsymbol 2.0.0 rejects (`isValid()===false`) the *specific child entity codes* the W3 producer used** (e.g. destroyer `120103`, minesweeper `120601`, MANPADS `130501`) — even though milsymbol fully supports the **canonical parent codes** for those same families (sea-surface combatant `120100`, air-defense `130500`, subsurface `1101xx`, air `1101xx`). So `sidcIcon()` returns `null` and the marker falls through to `diamondIcon`/`squareIcon`.

**Therefore the fix is a safe, honest role/domain → canonical-SIDC remap** (no DB/profile library required for category-level symbols).

## Q1 — Classification of all 153 markers

| Class | Count | Marker class | Renderer path |
|---|---|---|---|
| **Proper milsymbol symbol** | **117** | `units-map-marker wg-adj-sidc` (SVG) | `sidcIcon(sidc)` → `ms.Symbol(...).asSVG()` (valid) |
| **Generic fallback** (red diamond / blue square) | **36** | `wg-adj-diamond` (red) / `wg-adj-square` (blue) | `sidcIcon()` returned `null` → `diamondIcon()` / `squareIcon()` |
| Frame-only (valid SIDC, no entity icon) | 0 | — | none in W3 |
| Missing-data fallback | 0 | — | all units have SIDC + role + domain + echelon |
| Destroyed-state replacement | per step (≤ a few) | `wg-adj-diamond` + `wg-destroyed` | `markUnitAsDestroyed()` — *by design* (AN1) |
| Roll-up aggregate | 7 (wide zoom) | `wg-adj-aggregate` | `buildAggregateIcon()` — *by design* (echelon) |

**The 36 fallback units** (affiliation-correct; *no platform identity is wrong, only the function glyph is missing*):

| Domain | Roles (count) | Side split |
|---|---|---|
| **naval** (16) | landing_ship, destroyer, hovercraft, missile_boat, mine_layer, mine_sweeper, corvette | RED + BLUE |
| **ground** (18) | manpads ×9, ssm_brigade, radar, + `unknown` | RED + BLUE |
| **air** (1) | (one air unit with an unsupported entity) | — |
| **strategic** (1) | (one strategic unit) | — |
| | **RED 22 · BLUE 14** | |

Unsupported entity codes observed: `120103, 120104, 120105, 120106, 120601, 120602, 120902, 120903, 130201, 130501, 130502, 130901` (12 distinct → 36 units).

## Q2 — Why generic? (reason per case)

Only **one** reason applies across all 36: **unsupported SIDC entity code in milsymbol 2.0.0.** Specifically:

- ❌ missing SIDC — *0 units* (all have one)
- ❌ structurally invalid SIDC — *0 units* (all are well-formed 20-digit)
- ✅ **unsupported entity sub-code** — *36 units*: `ms.Symbol(sidc).isValid() === false` for the W3 child entity (e.g. `120103`), though the canonical parent (`120100`) is supported → `sidcIcon` returns `null`
- ❌ missing role/domain — *0 units*
- ❌ unsupported domain — *0* (milsymbol supports naval/subsurface/air/land; **proven**: canonical `120100`, `1101xx` set35, `1305xx`, `1101xx` set01 all render valid icons)
- ▸ destroyed marker / roll-up aggregate — *by design*, not a fidelity defect
- ❌ CSS/icon scaling issue — *no* (the SYM scaling/hover-peek work is unrelated; it scales whatever icon is rendered, including the fallback diamonds, and did not cause genericness)
- ▸ data-model limitation — *only* for exact platform identity (see Q4)

## Q3 — What can be fixed from existing data (safe mapping plan)

Every fallback unit has `role` + `domain` + `echelon`. milsymbol **does** support the canonical family codes (verified). So a resolver can remap the unsupported entity to a supported one **of the same family**, preserving affiliation + symbol-set + echelon amplifier:

| W3 role | domain / symbol set | → canonical supported entity (milsymbol-valid) | result |
|---|---|---|---|
| destroyer, corvette, missile_boat, naval_unit | naval / 30 | `120100` sea-surface combatant | ship symbol |
| mine_sweeper, mine_layer | naval / 30 | mine-warfare code if supported, else `120100` | naval symbol |
| landing_ship, hovercraft | naval / 30 | amphibious-warfare code if supported, else `120100` | naval symbol |
| submarine | subsurface / 35 | `110100` submarine | sub symbol |
| manpads, sam_* | ground / 10 | `130500` air defense | AD symbol |
| ssm_brigade | ground / 10 | land missile/rocket (supported) | missile symbol |
| radar | ground / 10 | land sensor/radar (supported) | sensor symbol |
| air units (unsupported) | air / 01 | `110100` air track | air symbol |

**Rules:** (1) an existing **valid** SIDC always stays authoritative; (2) the remapped SIDC must itself be re-checked with `ms.Symbol(...).isValid()` before use; (3) if even the remap is unsupported, fall to **milsymbol frame-only with the correct symbol set** (a *naval / air / subsurface frame* — already more informative than today's land diamond) rather than a generic diamond.

This is honest: `role` already states the *category* (destroyer, MANPADS), so a *category* symbol invents nothing — it does **not** assert a specific platform.

## Q4 — What cannot be fixed without a DB / profile library

Do **not** invent, and the resolver must not: exact platform/hull/airframe type, weapons, sensors, ammo, fuel, combat power, DB3000-level identity. Where the category itself is unknown, use honest fallbacks:

- **Unknown land unit** · **Unknown naval unit** · **Unknown air unit** · **Unknown support unit** · **Unknown formation**

(implemented as the correct affiliation + symbol-set **frame** with no entity icon — visually honest "we know it's a hostile surface ship, not which one").

## Q5 — Roll-up (formation) symbols

Current aggregate already shows **side** (color) + **echelon** (division `XX`) + **count badge**. Assessment of additions (documented, **not** implemented here):

| Field | Recommendation |
|---|---|
| side | ✅ already (frame color) |
| echelon | ✅ already (XX amplifier) |
| count badge | ✅ already |
| formation id / name | ➕ worth adding to the tooltip (already `B-d2 — 34 units`); on-symbol label optional |
| dominant role | ➕ future: pick the modal role of members (e.g. "mech division") for the aggregate's entity icon — honest (derived from members) |
| degraded / destroyed summary | ➕ future (after AN1 integration): e.g. badge tint or "−N" when members are attrited — needs care to stay non-fabricated |

## Q6 — Recommended resolver design (future SYM2)

```
resolveUnitSymbolProfile(unit, options = {}) → {
  sidc,              // milsymbol-valid SIDC to render
  symbol_family,     // 'land' | 'naval' | 'subsurface' | 'air' | 'unknown'
  domain,            // echo of unit.domain
  role,              // echo of unit.role
  echelon,           // echo of unit.echelon (→ amplifier)
  confidence,        // 'authoritative' | 'template' | 'frame_only' | 'unknown'
  source,            // 'scenario_sidc' | 'role_domain_template' | 'symbol_set_frame' | 'unknown'
  fallback_reason,   // null | 'unsupported_sidc_entity' | 'remap_unsupported' | 'insufficient_data'
  operator_editable  // true — an authoring step may override
}
```

**Tiered logic (pure, read-only, no fabrication):**
1. `unit.sidc` present **and** `ms.Symbol(unit.sidc).isValid()` → use it. `confidence:'authoritative'`, `source:'scenario_sidc'`.
2. else if `role`/`domain` known → remap to the canonical family SIDC (Q3 table); re-check `isValid()`. If valid → `confidence:'template'`, `source:'role_domain_template'`, `fallback_reason:'unsupported_sidc_entity'`.
3. else if `domain`/symbol-set known → milsymbol **frame-only** with that set + affiliation. `confidence:'frame_only'`, `source:'symbol_set_frame'`, `fallback_reason:'remap_unsupported'`.
4. else → honest unknown frame. `confidence:'unknown'`, `fallback_reason:'insufficient_data'`.

Always record `source`/`confidence`/`fallback_reason`. Never assert platform-specific identity.

## Did scaling / hover-peek affect symbol clarity?

**No.** The zoom-responsive scaling + hover-peek (committed `4da9a41`) operate on whatever icon is rendered — they scale/reveal the fallback diamonds exactly like proper symbols. They *improved* legibility (less clutter) but are orthogonal to symbol fidelity. The 36 fallbacks were generic *before* and *after* that work.

## Recommended next PR

**SYM2 — Symbol resolver + family remap (read-only):** implement `resolveUnitSymbolProfile` and route `sidcIcon` through it so the 36 naval/AD/radar units render correct **family** symbols (ship/sub/AD/sensor) instead of bare diamonds — using only `role`/`domain`/`echelon`, re-validated against milsymbol, with honest frame-only fallback. No DB, no fabrication, no scenario mutation. Then refresh the legend to show the family fallbacks.

## Re-running the diagnostic

`node test-sym1-unit-symbol-fidelity.js` — structural SIDC + role/domain/echelon coverage + the known-unsupported-entity inventory (the 117/36 split). Live milsymbol validity is browser-verified (this audit).
