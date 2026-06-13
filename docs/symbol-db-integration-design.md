# Symbol DB Integration Design

> **Status: DESIGN + partial build.** The Base Status Panel (BASE-STATUS-A) is the **first concrete
> implementation of the generic RMOOZ _Object Status Card_** (`docs/object-status-card-design.md`).
> This doc covers the symbol/catalog layer that fills the card's `systems` / `capability_summary` /
> map-marker glyph. Everything here is **read-only / review-only**: a card or anchor shows what RMOOZ
> understands about an object; it never creates, tasks, or executes anything.

---

## 1. Selected Object Panel Contract

`window.openSelectedObjectPanel(object)` is the common read-only entry point for map/review selections.

Supported object kinds:

- `unit`: delegates to the existing Commander Unit Status Panel path.
- `base`: renders BASE-STATUS-A content for Step 1 base anchors and proposed unit groups.
- `infrastructure`: renders `Infrastructure status support pending` (FUTURE — see §5).
- unknown values: render an unsupported placeholder and do not throw.

Step 1 placement anchors call:

```js
openSelectedObjectPanel({
  object_kind: "base",
  source: "step1_external_app",
  review_only: true,
  exact_unit_position: false,
  data: candidateOrBaseData
});
```

The base view remains review-only. It displays base identity, side, type, location, grouped proposed
units, catalog-required placeholders, doctrine-required status, the **symbol descriptor** (§3), and
evidence/message-log entries. It must not create final units, placement, tasking, COA, movement,
execution, or world-state state.

---

## 2. Object Status Card framing — Base Status Panel is the first card

`base-status-panel.js` (`window.RmoozBaseStatusPanel.open`) is **the first concrete instance** of the
generic Object Status Card. The card envelope (provenance, side, status, evidence, warnings, symbol)
is shared across object types; the body adapts per `object_type`. See
`docs/object-status-card-design.md` §3 for the full envelope schema.

**Supported `object_type` values (closed enum, additive — never free text):**

```
base · air_base · naval_base · land_base · unit · infrastructure · airport · port ·
bridge · power_station · radar_site · air_defense_site · logistics_node ·
civilian_facility · objective · unknown
```

`unknown` is **mandatory and is the fallback** — an unrecognised `object_type` renders the generic
card envelope (whatever evidence exists), never an error and never invented detail.

What ships today: `object_type` is effectively a base kind (`base` / `air_base` / `naval_base` /
`land_base` / `friendly_trial_anchor` / `base_facility`) for Step 1 anchors. The remaining types
(`infrastructure`, `airport`, `port`, `bridge`, `power_station`, `radar_site`, `air_defense_site`,
`logistics_node`, `civilian_facility`, `objective`) are **documented future types** — the symbol
registry (§3) already carries display symbols for most of them so the map/card never falls back to a
generic "B", but their **behavioural bodies are not built** (§5).

---

## 3. Symbol Registry (SYMBOL-DB-B) — object/base/platform → display symbol

`client/shell/symbol-registry.js` (`window.RmoozSymbolRegistry`, also Node-requireable) is a
deterministic, **review/display-only** symbol layer. It is **deliberately separate** from the
MIL-STD-2525 milsymbol system (`client/symbology.js` → `window.AppSymbology`), which renders real
scenario units. The registry exists so Step 1 base anchors stop rendering as a generic "B" (or as
infantry) and instead show a base/facility symbol matching their type.

API:

- `normObjectType(s)` → canonical `object_type` key from any of `site_type | base_type | anchor_type
  | placement_type` (specific sites before generic air/naval/land; generic `base/facility` last).
- `objectSymbol(type)` / `platformSymbol(category)` → `{ glyph, label_en, label_ar, kind,
  symbol_source, fallback, warning }`.
- `resolveBaseSymbol(anchorOrBase)` → two-tier fallback: a base-ish object with an unmapped type →
  `base_facility` (+warning); a truly unrecognised object → `unknown` (+warning).
- `iconHtml(sym, { side })` → the Leaflet `divIcon` HTML (side drives fill/ring; glyph is the symbol).

Object glyphs: `air_base ✈ · airport ✈ · naval_base ⚓ · port ⚓ · land_base ▣ ·
friendly_trial_anchor ◇ · base_facility ⬢ · radar_site ◎ · air_defense_site ⊕ · logistics_node ▦ ·
hq ★ · objective ◉ · infrastructure ⌂ · unknown ?`. Platform categories (`air_fighter`,
`air_attack`, `air_transport`, `maritime_patrol`, `helicopter`, `uav`, `naval_surface`, `submarine`,
`ground_unit`, `air_defense`, `radar`, `logistics`, `unknown`) carry their own display glyphs for the
panel's grouped-platform list. Consumers: `placement-candidates-panel.js` (anchor markers delegate
here, with a local glyph guard if the registry isn't loaded) and `base-status-panel.js` (Symbol
section: `object_type` / `base_type` / `symbol` / `symbol_category` / `symbol_source` /
`catalog_match_status` + fallback warning).

Test: `scripts/test-symbol-registry-a.js`.

---

## 4. Catalog Boundary

Step 1 external app data can identify candidate base anchors and proposed platforms, but it is **not**
a final symbol or capability database match. BASE-STATUS-A therefore uses category-only placeholders
until a catalog record is available.

Required future integration points:

- stable base identifier or normalized base name
- platform catalog key or candidate keys
- symbol category candidate (now provided by the symbol registry, §3)
- confidence and review status
- source file and source type
- doctrine requirement status

Until catalog integration is complete, missing sensors, weapons, comms, logistics, and
doctrine-specific fields must render as **catalog-required placeholders**
(`Catalog required / يحتاج ربط بقاعدة البيانات`) rather than inferred operational truth. The symbol
registry fills the *display symbol* and *category*; the DB-Lite catalog (`world-state-db.js`, via
`symbol-db.js`) fills *systems* when a named platform matches — never invented.

---

## 5. Infrastructure objects — FUTURE schema only (NOT implemented now)

Infrastructure object types (`infrastructure`, `bridge`, `power_station`, `radar_site`,
`air_defense_site`, `logistics_node`, `port`, `airport`, `civilian_facility`, …) will reuse the
**exact same Object Status Card envelope** (§2, `docs/object-status-card-design.md` §3) and populate
an optional `infrastructure_profile` sub-object. **No infrastructure behaviour is built now — this
section documents the schema and the future path only.**

`infrastructure_profile` future fields:

```
facility_type        // e.g. bridge | power_station | radar_site | port | airport | depot | civilian
capacity             // throughput / storage / generation (typed per facility_type)
operational_status   // operational | degraded | offline | unknown   (review-only; never adjudicated here)
damage_state         // none | light | moderate | severe | destroyed | unknown   (FUTURE — no damage model now)
repair_status        // none | in_progress | complete | unknown      (FUTURE)
criticality          // low | medium | high | vital                  (planning hint, not a target list)
dependencies         // object_id[] this facility depends on (e.g. power → radar)
protected_by         // object_id[] of defending air_defense_site / unit groups
civilian_impact       // none | low | medium | high | unknown         (ROE/L-of-AC consideration)
logistics_value      // none | low | medium | high                   (sustainment relevance)
```

Hard rules for this future slot:

- **No damage/repair/dependency BEHAVIOUR now** — `damage_state` / `repair_status` are display-only
  fields with no model behind them yet; nothing computes or applies them.
- It reuses the existing card framework — **only a new typed sub-object + a per-type body renderer**,
  never a new card model.
- An `object_type` with no body renderer MUST fall through to the generic envelope with a
  `catalog_required` / `unknown` posture — adding a type must never crash the card or fabricate
  capabilities.

---

## 6. Acceptance / invariants (today)

| Criterion | State | Verified by |
|---|---|---|
| **Base Status Panel still works for Step 1 anchors** — anchor opens the card with grouped proposed units, review-only, `exact_unit_position:false`. | ✅ | `test-base-status-panel-a.js`, `test-step1-unified-bases-map-anchors.js` |
| **Step 1 anchors render a base-type symbol, never a generic "B" / infantry.** | ✅ | `test-symbol-registry-a.js`, `test-placement-candidates-panel-1.js` |
| **Unknown object/base type → safe fallback (`base_facility` or `unknown`) + warning, never a crash, never invented detail.** | ✅ (symbol) / ◑ (generic body dispatch is future) | `test-symbol-registry-a.js` |
| **Missing catalog/system data → "Catalog required" placeholder, not inferred truth.** | ✅ | `test-base-status-panel-a.js` (`CATALOG_REQUIRED`) |
| **No final units / tasking / execution / world-state from the card.** | ✅ (read-only by design) | review-only surface; `docs/read-only-surface-audit.md` |

See `docs/object-status-card-design.md` for the full generic card architecture this integrates with.
