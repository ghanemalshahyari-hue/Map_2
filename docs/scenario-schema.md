# Wargame Scenario Schema

This document describes the JSON shape that a wargame scenario must conform to. Hand this file to anyone producing scenarios for the system (analysts, planners, customer teams) — they have everything they need to deliver a valid file.

The validator (`UI_MOdified/server/ai/scenario-validator.js`) enforces this spec at load time and on import via the HUD. Malformed scenarios are rejected with structured errors (`path` + `msg`) before the adjudicator or map ever see them.

A **minimum-viable example** lives at `docs/scenario-template.json`. Fork it.

---

## Drop-in flow

1. Produce a JSON conforming to this spec.
2. Either:
   - Drag-drop it into the wargame HUD's "Import scenario" panel (validates client-side, saves on confirm), OR
   - Copy the file directly into `UI_MOdified/data/scenarios/<your-name>.json`, restart the server.
3. The scenario appears in the dropdown picker automatically.

---

## Top-level keys

| Key | Required | Type | Description |
|-----|----------|------|-------------|
| `name` | **yes** | string | Unique scenario id. Must match the filename without `.json`. |
| `scenario_label` | **yes** | string | Human-readable title for the HUD. |
| `model_version` | no | string | Producer-defined version tag for tracking changes. |
| `map_bbox` | **yes** | `[lon_min, lat_min, lon_max, lat_max]` | Operation map bounds. Validated to be within [-180,180]/[-90,90] with min<max. |
| `obj` | **yes** | object | Mission objective (see below). |
| `pipeline` | **yes** | array of `[lon, lat]` | Planned Red advance route. 2–64 waypoints. |
| `red_units` | **yes** | array | Red OOB (see below). |
| `blue_units_base_ids` | **yes** | array of string | Short ids matching `blue_units_initial[i].base_id`. |
| `blue_units_initial` | **yes** | array | Blue starting positions (see below). |
| `bls_template` | **yes** | array | Beach Landing Sites (see below). |
| `ao_boundaries` | no | array | Optional AO/zone polygons for map overlay. |
| `phase_table` | **yes** | array | Per-step phase metadata (length must equal `steps.length`). |
| `throughput_ceilings_km` | no | object | Per-time-checkpoint upper bounds, e.g. `{ "H24": 12, "H48": 50, "H96": 75, "H144": 100 }`. |
| `terrain_note` | no | string | Free-text constraint shown in the adjudicator prompt. |
| `steps` | **yes** | array | Per-step baselines (length 4–20). |
| `nominal_throughput` | no | object | Per-BLS nominal capacities; defaults to `bls_template[i].throughput`. |
| `blue_units_source`, `ported_at`, `ported_from` | no | string | Provenance metadata. |

### Allowed count ranges (parametric)

| Array | Min | Max | wargame1/2 norm |
|-------|-----|-----|-----------------|
| `steps` | 4 | 20 | 12 |
| `bls_template` | 1 | 8 | 4 |
| `red_units` | 1 | 200 | 11 |
| `blue_units_initial` | 1 | 100 | 39 |
| `pipeline` | 2 | 64 | ~15 |

Counts outside `[min..max]` produce **errors** (load blocked). Counts inside the range but != norm produce **warnings** (load proceeds, flagged in HUD).

---

## Sub-shapes

### `obj`

```json
{
  "name": "OBJ NASSER-95",
  "coord": [19.842, 29.614],
  "target_depth_km": 95,
  "radius_km": 5,
  "carver": 37
}
```

| Key | Required | Notes |
|-----|----------|-------|
| `name` | yes | Display name |
| `coord` | yes | `[lon, lat]`, must lie within `map_bbox` (warning if not) |
| `target_depth_km` | yes | Distance from coast to objective |
| `radius_km` | no | Display ring radius; default 5 |
| `carver` | yes | CARVER score 0–60 |

### `bls_template[i]`

```json
{
  "name": "BLS-1",
  "coord": [19.6, 30.4],
  "role": "shallow",
  "throughput": 0.8,
  "terrain_friction": 0.7,
  "permanently_limited": false
}
```

| Key | Required | Notes |
|-----|----------|-------|
| `name` | yes | e.g. `BLS-1`, `BLS-2`… `BLS-N` |
| `coord` | yes | `[lon, lat]` |
| `role` | no | `"shallow"` / `"deep"` / etc. (free-form) |
| `throughput` | no | Nominal capacity in coy-equivalents/24h |
| `nominal_throughput` | no | Alias of `throughput` |
| `terrain_friction` | no | 0.0–1.0 multiplier |
| `permanently_limited` | no | If true, the validator forbids this BLS reaching `SECURE` (sabkha/bypass case) |
| `score`, `nearest_blue_uid`, `nearest_blue_km`, `capacity` | no | Producer metadata |

### `red_units[i]`

```json
{
  "uid": "RED_44ARMD",
  "label": "44 ARMD",
  "echelon": "BN",
  "bls": "BLS-3",
  "appear": 2,
  "role": "armor",
  "coord": [19.7, 29.8]
}
```

| Key | Required | Notes |
|-----|----------|-------|
| `uid` | yes | Stable id like `RED_*` |
| `label` | yes | Short display label |
| `bls` | yes | Must match a `bls_template[*].name` |
| `appear` | yes | Step index when the unit becomes active (must be in `[0..steps.length-1]`) |
| `role` | yes | `"armor"`, `"ew"`, `"infantry"`, etc. (free-form) |
| `coord` | yes | `[lon, lat]` starting position |
| `echelon`, `strength`, `sidc` | no | Optional rendering hints |

### `blue_units_initial[i]`

```json
{
  "unit_uid": "BLUE_lc",
  "base_id": "lc",
  "echelon": "div",
  "sidc": "SFGPUCIZ---*****",
  "coord": [19.9, 30.5],
  "posture": "deliberate"
}
```

| Key | Required | Notes |
|-----|----------|-------|
| `unit_uid` | yes | `BLUE_<base_id>` |
| `base_id` | yes | Matches one entry in `blue_units_base_ids` |
| `coord` | yes | `[lon, lat]` |
| `echelon`, `sidc`, `posture` | no | Rendering hints |

### `phase_table[i]`

```json
{ "index": 0, "time_label": "D-3h", "elapsed_hours": -3, "phase": "PRE-H" }
```

| Key | Required | Notes |
|-----|----------|-------|
| `index` | yes | 0-based row id (must equal array index) |
| `time_label` | yes | e.g. `D-3h`, `H+24` |
| `elapsed_hours` | yes | Negative for pre-H, 0 at H-Hour |
| `phase` | yes | Scenario-defined string. Wargame 1/2 use `PRE-H`, `PHASE 1`, `PHASE 2A`, `PHASE 2B`, `PHASE 3`, `RESOLUTION`. |

### `steps[i]`

```json
{
  "index": 0,
  "time_label": "D-3h",
  "elapsed_hours": -3,
  "phase": "PRE-H",
  "phase_line_km_baseline": 0,
  "objective_status_baseline": "DORMANT",
  "bls_status_baseline": { "BLS-1": "STAGED", "BLS-2": "STAGED" },
  "blue_destroyed_baseline": [],
  "blue_destroyed_count_baseline": 0,
  "red_degraded_baseline": [],
  "force_ratio_baseline": "1:1 pre-contact",
  "ew_effect_baseline": "Idle",
  "logistics_state_baseline": "Building",
  "narrative_ar_baseline": "...",
  "narrative_en_baseline": "..."
}
```

Required: `index`, `time_label`, `elapsed_hours`, `phase`.

**Important — array types:**
- `blue_destroyed_baseline` is an **array of unit_uid strings**, not a count. Example: `["BLUE_c121", "BLUE_c123"]`. The count goes in `blue_destroyed_count_baseline`.
- `red_degraded_baseline` is an **array of unit uid strings**, same shape. Example: `["RED_44ARMD"]`.

All `*_baseline` fields are optional — they're the fallback values used when the LLM adjudicator fails or `mockMode` is on. Producing them gives the system something to fall back to; omitting them means failed steps reset to scenario defaults (acceptable for early prototypes). When you DO produce them, follow the array-of-uid shape exactly — the schema validator and adjudicator both expect it.

---

## State-machine enums

These are the legal values for `*_baseline` and runtime state fields. Producers must stick to these strings exactly.

| Field | Allowed values |
|-------|----------------|
| `phase` (phase_table & steps) | Scenario-defined string. Wargame 1/2 use `PRE-H`, `PHASE 1`, `PHASE 2A`, `PHASE 2B`, `PHASE 3`, `RESOLUTION`. |
| `objective_status_baseline` | `DORMANT`, `THREATENED`, `CONTESTED`, `CAPTURED`, `DENIED` |
| `bls_status_baseline[<bls>]` | `STAGED`, `CONTESTED`, `SECURE`, `LIMITED`, `DENIED` |
| `ew_effect_baseline` | `Idle`, `Active`, `Heavy`, `Moderate`, `Low` (monotone decreasing post-H) |

---

## Validation outcomes

When you submit a scenario, the validator returns:

```json
{
  "ok": true | false,
  "errors":   [ { "path": "red_units[3].coord", "msg": "must be [lon, lat]" }, ... ],
  "warnings": [ { "path": "steps", "msg": "count 8 deviates from wargame1/2 norm (12); valid but off-pattern" }, ... ],
  "summary":  { "stepCount": 8, "blsCount": 3, "redCount": 7, "blueCount": 22 }
}
```

- `errors.length > 0` → `ok: false`. Load is blocked. Fix all listed issues.
- `errors.length === 0`, `warnings.length > 0` → `ok: true`, proceed with caveats. Worth a look.

---

## Common mistakes

1. **`phase_table.length ≠ steps.length`** — they must match exactly.
2. **`obj.coord` outside `map_bbox`** — warning, not error, but the map won't render the objective if you don't fix it.
3. **`red_units[i].bls` references an unknown BLS name** — must match one of `bls_template[*].name` letter-for-letter (case-sensitive).
4. **`red_units[i].appear` beyond `steps.length`** — units that never appear cause silent gaps.
5. **Non-string enum values** — `"phase": 2` will be rejected; must be `"phase": "PHASE 2A"`.
6. **`coord` ordering** — always `[lon, lat]`, never `[lat, lon]`. The validator enforces this implicitly via the `[-180,180]/[-90,90]` ranges.
