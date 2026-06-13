# RMOOZ Object Status Card — Architecture (DESIGN)

**Status: DESIGN. Reframes BASE-STATUS-A as the first concrete implementation of a *generic*
status-card framework.** No code rename required yet (concept lives in docs first). Extends the
locked contract in `docs/coa-wargame-design.md` (global rule, L13 source taxonomy, L14 mission-first,
L15 fusion, L6 needs_review/confidence/source on every AI-produced object).

> Global rule (unchanged): **AI suggests → RMOOZ validates → commander approves → WHITE adjudicates
> → state changes are journaled.** A status card is a **read-only review surface** — it shows what
> RMOOZ understands about an object; it never creates, tasks, or executes anything.

---

## 1. Concept rename (docs, not code yet)

| Layer | Name | Meaning |
|---|---|---|
| **Architecture concept** | **Object Status Card** / **RMOOZ Status Card** | One reusable read-only card model for *any* operational object type. |
| **Current concrete implementation** | **Base Status Panel** (BASE-STATUS-A) | `UI_MOdified/client/shell/base-status-panel.js` — `window.RmoozBaseStatusPanel.open(anchor, payload)`. The *first* card; today it specialises in Step-1 base/placement anchors. |

Code keeps the `RmoozBaseStatusPanel` / `base-status-panel.js` names for now — the rename to a
generic `RmoozObjectStatusCard` is a later, explicit refactor. (History note: a premature panel
unification was attempted in `86af86e` and **reverted** in `083afb1` — this doc is the deliberate
architecture so the next generalisation is correct, not ad-hoc.)

---

## 2. One card model, many object types

The same card model (§3) must render every object type via an `object_type` discriminator. The
card body adapts per type; the envelope (provenance, status, evidence, warnings) is shared.

Supported `object_type` values (closed enum, additive — never free text, per L8):

```
base · air_base · naval_base · land_base · unit · infrastructure · airport · port ·
bridge · power_station · radar_site · air_defense_site · logistics_node ·
civilian_facility · objective · unknown
```

**`unknown` is mandatory and is the fallback** — an unrecognised `object_type` renders the *generic*
status card (envelope + whatever evidence exists), never an error and never invented detail (§11).

---

## 3. Reusable status-card schema (proposal)

One envelope for every object type. Type-specific data lives in the optional sub-objects
(`grouped_assets`, `infrastructure_profile`, `systems`); absent sub-objects simply don't render.

```jsonc
{
  object_id,                 // stable id (loc_id / unit uid / facility id)
  object_type,               // §2 enum; 'unknown' ⇒ generic fallback
  display_name_ar,
  display_name_en,
  side,                      // BLUE | RED | NEUTRAL | UNKNOWN
  affiliation,               // friendly | hostile | neutral | unknown (APP-6 sense)
  location,                  // { lat, lon } | named ref | null
  exact_position,            // boolean — false for base anchors (the unit is "based at", not pinned)
  confidence,                // high | medium | low   (L6)
  needs_review,              // boolean — true for everything AI/derived (L6)
  source_type,               // L13 taxonomy: uploaded_doc · external_json · mdmp_adapter ·
                             //   manual_app_entry · map_click · location_db · incident_log ·
                             //   llm_candidate · doctrine_rule · world_state · scenario_builder
  status,                    // object-type-appropriate status (e.g. active|degraded|destroyed|suspected|unknown)
  capability_summary,        // string[] derived from catalog/category — "Catalog required" when unmapped
  grouped_assets,            // base/unit-bearing types: { category -> [proposed assets] } (review-only)
  infrastructure_profile,    // FUTURE infra types (§10) — null until that slot is built
  systems,                   // sensors/weapons/comms when catalog-mapped; else "Catalog required"
  doctrine_refs,             // citable rule cards (L7) touching this object; [] if none
  terrain,                   // advisory terrain context (GIS-TERRAIN-1); render-only, never gating
  evidence,                  // [{ source_type, file, key, note }] — provenance trail
  warnings,                  // string[] — base_known_exact_unit_position_unknown, catalog_required, …
  message_log                // append-only review notes for this object (no execution)
}
```

Composes with the existing pieces: `source_type` is the L13 taxonomy (`planning-model.js`
`SOURCE_TYPES`); `confidence` + `needs_review` are the L6 invariants; `location`/`exact_position`/
`warnings` mirror a G-3B `placement_candidate`; `terrain` is the GIS-TERRAIN-1 advisory block.

---

## 4. BASE-STATUS-A = the first concrete implementation

What ships today (`base-status-panel.js` + `test-base-status-panel-a.js`):

- A Step-1 **base/placement anchor** (from `placement-candidates-panel.js` map markers, the G-3B
  resolver output) is clicked → `RmoozBaseStatusPanel.open(anchor, payload)` renders the card.
- The card shows the base envelope + **grouped proposed units** (`grouped_assets`): platforms
  normalised by category (air_fighter / helicopters / uav / naval / ground / unknown) with a
  category-derived `capability_summary`, plus `evidence` (source file, doctrine-required warning).
- `object_type` for this implementation is effectively a base kind (`base`/`air_base`/`naval_base`/
  `land_base`); the generic envelope above is the model it instantiates.

This is the reference instance the rest of the framework generalises from.

---

## 5–9. Hard scope boundaries (this slot)

| # | Boundary | Why |
|---|---|---|
| 5 | **Proposed units are NOT converted to final units.** `grouped_assets` are review-only candidates. | L1/L6 — commander review before any real unit. |
| 6 | **No infrastructure behavior yet.** `infrastructure_profile` stays `null`; §10 is future-only. | Keep the slot minimal; behaviour needs its own design. |
| 7 | **No final tasking** from the card. | Tasking is G-4, gated separately. |
| 8 | **No execution / state change.** The card is read-only; no journal write, no mutation. | The global rule + the read-only-surface invariant. |
| 9 | **Do NOT copy CMO UI.** RMOOZ renders its own card on its own architecture. | L16 (TACTICA/CMO = inspiration only, never copied). |

---

## 10. Future: infrastructure objects use the SAME framework

When infrastructure object types (`infrastructure`, `bridge`, `power_station`, `radar_site`,
`air_defense_site`, `logistics_node`, `port`, `airport`, `civilian_facility`, …) are built, they
reuse this exact card envelope (§3) and populate `infrastructure_profile` with infra-specific fields:

```
facility_type · capacity · operational_status · damage_state · repair_status ·
criticality · dependencies · protected_by · civilian_impact · logistics_value
```

No new card framework — only a new typed sub-object + per-type body renderer. (Behaviour for these
fields — damage/repair/dependency effects — is explicitly out of scope here, §6.)

---

## 11. Design / test acceptance

| Criterion | State today | Verified by |
|---|---|---|
| **Base Status Panel still works** — Step-1 base anchor opens the card with grouped proposed units. | ✅ met | `test-base-status-panel-a.js` (opens Hamedan/Bandar Abbas/Chabahar; grouped platforms; review-only; `exact_unit_position:false`). |
| **Unknown object type falls back to the generic status card** — never an error, never invented detail. | ◑ design requirement (generic `object_type` dispatch is future); the unknown-**platform** path already degrades to `unknown` + "Catalog required". | `normalizePlatform('Unlisted Platform X').symbol_category === 'unknown'`; doc acceptance for the type-level fallback. |
| **Missing catalog / system data shows "Catalog required / يحتاج ربط بقاعدة البيانات"** — not invented details. | ✅ met | `CATALOG_REQUIRED` constant rendered for unmapped systems/platforms; asserted in the test. |

**Acceptance rule for the generalisation:** any new `object_type` that lacks a body renderer MUST
fall through to the generic envelope with a `catalog_required` / `unknown` posture — adding a type
must never be able to crash the card or fabricate capabilities.

---

### Build-order placement
`BASE-STATUS-A` (shipped, first card) → **this architecture doc** → future: generic
`object_type` dispatch + the infrastructure profile (§10), each its own slot. Sits alongside G-3B
(placement candidates feed the base cards) and ahead of G-4 (tasking), consistent with
`docs/coa-wargame-design.md` L12.

> Note: a separate `docs/symbol-db-integration-design.md` (the symbol/DB-Lite → card `systems`/
> `capability_summary` wiring) was authored uncommitted on another machine and had not synced to
> this checkout when this doc was written; this architecture is the card framework that the
> symbol-DB integration plugs into (it fills `systems` / `capability_summary`, replacing
> "Catalog required").
