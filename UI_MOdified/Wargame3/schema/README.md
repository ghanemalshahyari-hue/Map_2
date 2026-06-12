# Wargame GeoJSON Schema Pack

You'll receive a folder of GeoJSON files. This pack tells you (and your IDE / Claude) exactly what's in them and how to consume them.

## Files in this pack

| File | What it is |
|---|---|
| `wargame_geojson.schema.json` | **Formal JSON Schema 2020-12** — validates any wargame GeoJSON file. Drop into your IDE/linter or use with `jsonschema` / `ajv` for programmatic validation. |
| `README.md` | This document — human-readable spec + code recipes. |
| `sample_step.geojson` | One real step file (Phase 5 — D-H multi-vector strike) as a concrete example to read alongside this doc. |

## What you're consuming

A wargame run produces **17 per-phase files** named `step00.geojson` … `step16.geojson` plus one combined `all_phases.geojson`. Each per-phase file is a snapshot of the operational picture at the end of that phase.

**Wire format**: Strict RFC 7946 GeoJSON. Verified against the IETF spec — works in:
- ✅ [geojson.io](https://geojson.io)
- ✅ Cesium (CesiumJS, Cesium for Unity, Cesium for Unreal)
- ✅ Mapbox GL / MapLibre GL
- ✅ deck.gl, kepler.gl
- ✅ QGIS, ArcGIS
- ✅ Any RFC 7946-compliant parser

**Application layer**: Each Feature is one of **five "kinds"** discriminated by `feature.properties.kind`. See per-kind sections below.

## File structure at a glance

```
{
  "type": "FeatureCollection",
  "name": "step05",
  "properties": {
    "version": 2,
    "phase": 5,
    "time_label": "D-H",
    "phase_name_ar": "الضربة المركزة متعددة الاتجاهات + الإنزال",
    "kind": "h_hour_strike",
    "phase_line_km": 1.5,
    "combined_effect": "Red's coordinated multi-domain assault faced significant challenges...",
    "step_advantage": "BLUE_ADV",
    "force_ratio_local": 0.23,
    "force_ratio_operational": 1.42,
    "n_units": 173,
    "n_actors": 14,
    "n_affected": 8,
    "n_engagement_arcs": 8
  },
  "features": [
    { ... objective ... },
    { ... phase_line ... },
    { ... 11 off_map_marker ... },
    { ... 173 unit ... },
    { ... 8 engagement_arc ... }
  ]
}
```

The top-level `properties` block is **non-standard at FeatureCollection level** per strict RFC 7946 — most parsers tolerate it as a "foreign member". If your renderer is strict, ignore it and read summary stats from the features themselves. The actual data is always in `features[]`.

---

## The 5 Feature kinds

Every Feature has `feature.properties.kind` ∈ `{"objective", "phase_line", "off_map_marker", "unit", "engagement_arc"}`. Branch on it:

### 1. `objective` (1 per file)

The operational objective — what Red is trying to seize. Point geometry.

```json
{
  "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [19.55, 29.74] },
  "properties": {
    "kind": "objective",
    "id": "OBJ-X",
    "name_ar": "الهدف X (نقطة الناصر-البريقة)",
    "name_en": "Objective X (Nasser-Brega pipeline midpoint)",
    "phase": 5,
    "depth_km_from_coast": 90.1
  }
}
```

**Render as**: large gold/yellow diamond or star. Always visible.

### 2. `phase_line` (0-1 per file)

The leading edge of Red's advance. LineString across the AO bbox at the current inland depth.

```json
{
  "type": "Feature",
  "geometry": { "type": "LineString",
                "coordinates": [[19.12, 30.546], [20.02, 30.546]] },
  "properties": {
    "kind": "phase_line",
    "phase": 5,
    "phase_line_km": 1.5,
    "time_label": "D-H"
  }
}
```

Only present when `phase_line_km > 0` — early shaping phases (0-4) may not have one.

**Render as**: dashed orange line. As you scrub through phases, this line moves inland (lat decreases) showing Red's progress.

### 3. `off_map_marker` (~11 per file)

Bases, SSM TELs, logistics nodes that exist outside the AO but matter operationally. Point geometry.

```json
{
  "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [18.0, 33.0] },
  "properties": {
    "kind": "off_map_marker",
    "id": "R-AB-A",
    "name_ar": "القاعدة الجوية أ (أحمر)",
    "side": "RED",
    "type": "air_base",
    "phase": 5
  }
}
```

`type` ∈ `{"naval_base", "air_base", "ssm_brigade", "logistics_node"}`.

**Render as**: smaller, dimmer Point. Colored by `side` (Red/Blue). Labeled with `id`.

### 4. `unit` (always 173 per file — the full OOB)

**The most important feature kind.** One Point per unit in the order of battle, at its phase-current visualization position.

```json
{
  "type": "Feature",
  "geometry": { "type": "Point", "coordinates": [19.512, 30.536] },
  "properties": {
    "kind": "unit",
    "uid": "R-d3-12-008",
    "side": "RED",
    "domain": "air",
    "type": "strike",
    "name_ar": "...",
    "echelon": "sqn",
    "phase": 5,

    "current_strength": 3.5,
    "initial_strength": 4.0,
    "destroyed": false,
    "suppressed_pct": 0.0,
    "delayed_pct": 0.0,
    "magazine": null,
    "airframes": 11,
    "hulls_remaining": null,

    "prev_lon": 18.0,
    "prev_lat": 33.0,

    "is_actor": true,
    "action_component": "air",
    "action_what": "MiG-29s engage Blue F-16 patrols",
    "action_why": "...",
    "action_intended_effect": "Achieve local air superiority",
    "action_doctrine_cited": ["AJP-3.3 Air & Space Operations Ed B"],

    "is_affected": true,
    "status_change": "damaged_partial",
    "damage_pct": 0.30,
    "cause_actor": "B-d2-3-048",
    "cause_what": "Engaged by Blue F-16 patrol",
    "cause_doctrine": "Black Sea 2024 USV survival 25-30%"
  }
}
```

#### Key fields explained

**Identity** — never changes across phases:
- `uid` — stable unit ID from OOB. Use as the join key for cross-phase tracking.
- `side` — `"RED"` (attacker) or `"BLUE"` (defender)
- `domain` — `"strategic" | "naval" | "air" | "ground" | "sof"`
- `type` — sub-type, e.g. `"destroyer"`, `"fighter_ad"`, `"mech_brigade"`, `"kamikaze_uav"`. 38 distinct types in the parsed OOB.
- `echelon` — `"div" | "bde" | "bn" | "coy" | "sqn" | "flot" | "unit"`

**Live state** — reflects post-application of this phase's outcomes:
- `current_strength` ∈ [0, initial_strength] — combat power points remaining
- `destroyed` — once true, unit stays at last position and won't appear in future phase's actions
- `suppressed_pct` ∈ [0, 0.85] — combat-effective but pinned
- `delayed_pct` ∈ [0, 0.85] — movement slowed
- `magazine` / `airframes` / `hulls_remaining` — domain-specific counters, `null` when not applicable

**Animation hooks** — for interpolating positions when transitioning between phases:
- `prev_lon`, `prev_lat` — position in the previous phase
- `geometry.coordinates` — position in the current phase
- A 3D viewer can `lerp(prev, current, t)` over the phase duration

**Activity flags** — booleans that gate the conditional fields below:
- `is_actor` — `true` if this unit took action this phase (will have `action_*` fields)
- `is_affected` — `true` if this unit was hit by an outcome (will have `status_change`, `cause_*` fields)

**When `is_actor === true`** — the following are populated:
- `action_component` — which of the 8 components: `strategic | maritime | air | mines | usv_uav | sof | land | ew`
- `action_what` — 1-2 sentence description of what the unit did
- `action_why` — doctrinal reasoning + cited doctrine
- `action_intended_effect` — what success looks like
- `action_doctrine_cited` — array of doctrine references

**When `is_affected === true`** — the following are populated:
- `status_change` — `destroyed | damaged_partial | suppressed | delayed | expended | unchanged`
- `damage_pct` ∈ [0, 1] — magnitude of effect
- `cause_actor` — UID of the unit that caused the outcome
- `cause_what` — short tactical description
- `cause_doctrine` — doctrinal calibration reference (often cites a historical analog like "Wonsan 1950" or "Black Sea 2024")

**Both flags can be true simultaneously** (a unit acted AND was hit — e.g. attacked then got intercepted on egress).

### 5. `engagement_arc` (~3-14 per file)

Visual representation of cause-and-effect. One LineString per `unit_outcome` connecting the attacking unit's position to the target's position.

```json
{
  "type": "Feature",
  "geometry": { "type": "LineString",
                "coordinates": [[19.51, 30.54], [19.85, 29.91]] },
  "properties": {
    "kind": "engagement_arc",
    "phase": 5,
    "cause_actor": "R-d3-12-008",
    "target_uid": "B-d2-3-048",
    "status_change": "damaged_partial",
    "damage_pct": 0.30,
    "cause_what": "Engaged by Red MiG-29s",
    "cause_doctrine": "ATP 3-01.8 Combined Arms for Air Defense",
    "actor_side": "RED",
    "target_side": "BLUE"
  }
}
```

**Render as**: animated dashed line from source to target, color-coded by `status_change`. Fade in/out over ~1.5s. The two coordinates ARE valid lat/lon endpoints — geodesic line in 3D viewers, straight line in 2D.

---

## Status → color recipe

Standard colors for `status_change` values (use whatever palette fits your app; these are our viewer defaults):

```js
const STATUS_COLORS = {
  destroyed:       '#b00020',  // red — full kill
  damaged_partial: '#d97706',  // orange — partial; use damage_pct for intensity
  suppressed:      '#ca8a04',  // yellow — combat-effective but pinned
  delayed:         '#7c3aed',  // purple — arrival/movement slowed
  expended:        '#2563eb',  // blue — munitions consumed (SSMs fired, USVs spent)
  unchanged:       '#4b5563',  // gray — engagement happened, no effect
};

const SIDE_COLORS = {
  RED:  '#ef4444',
  BLUE: '#3b82f6',
};
```

---

## Common consumer tasks — code recipes

### JavaScript / TypeScript

#### Load + validate a step file
```js
async function loadPhase(phaseN) {
  const res = await fetch(`step${String(phaseN).padStart(2,'0')}.geojson`);
  const fc = await res.json();
  if (fc.type !== 'FeatureCollection') throw new Error('Not a FeatureCollection');
  return fc;
}
```

#### Filter to just the unit Points (the "OOB at this moment")
```js
function unitsInPhase(fc) {
  return fc.features.filter(f => f.properties.kind === 'unit');
}
```

#### Find every unit that was hit this phase
```js
const affectedUnits = fc.features.filter(
  f => f.properties.kind === 'unit' && f.properties.is_affected === true
);
```

#### Build a UID → Feature map for cross-phase tracking
```js
function indexByUid(fc) {
  const map = {};
  for (const f of fc.features) {
    if (f.properties.kind === 'unit') {
      map[f.properties.uid] = f;
    }
  }
  return map;
}
```

#### Interpolate a unit's position between phases
```js
function lerpPosition(unitFeature, t) {
  const [prevLon, prevLat] = [unitFeature.properties.prev_lon, unitFeature.properties.prev_lat];
  const [currLon, currLat] = unitFeature.geometry.coordinates;
  return [
    prevLon + (currLon - prevLon) * t,
    prevLat + (currLat - prevLat) * t,
  ];
}
// Use: lerpPosition(feature, 0.3) → 30% of the way from previous to current
```

#### Draw engagement arcs as animated dashed lines
```js
const arcs = fc.features.filter(f => f.properties.kind === 'engagement_arc');
for (const arc of arcs) {
  const [src, dst] = arc.geometry.coordinates;
  const color = STATUS_COLORS[arc.properties.status_change] || '#888';
  drawAnimatedDashedLine(src, dst, { color, durationMs: 1500 });
}
```

### Python

#### Load + validate against the schema
```python
import json
from jsonschema import validate

with open('wargame_geojson.schema.json') as f:
    schema = json.load(f)

with open('step05.geojson') as f:
    fc = json.load(f)

validate(instance=fc, schema=schema)   # raises ValidationError if non-conformant
```

#### Get all actors of Red side this phase
```python
red_actors = [
    f for f in fc['features']
    if f['properties'].get('kind') == 'unit'
    and f['properties'].get('is_actor')
    and f['properties'].get('side') == 'RED'
]
```

#### Compute cumulative losses by side across all phases
```python
import glob, json
red_losses = blue_losses = 0
for path in sorted(glob.glob('step*.geojson')):
    fc = json.load(open(path))
    for f in fc['features']:
        if f['properties'].get('kind') == 'unit' and f['properties'].get('is_affected'):
            if f['properties']['status_change'] == 'destroyed':
                if f['properties']['side'] == 'RED':  red_losses += 1
                else:                                  blue_losses += 1
print(f'Red losses: {red_losses}, Blue losses: {blue_losses}')
```

### Cesium (Cesium for Unity / Unreal / JS)

Cesium ingests GeoJSON natively via `Cesium.GeoJsonDataSource.load(url)`. Style by `kind`:

```js
const ds = await Cesium.GeoJsonDataSource.load('step05.geojson', {
  clampToGround: true,
  markerSymbol: '?'  // overridden per-feature below
});

ds.entities.values.forEach(entity => {
  const kind = entity.properties.kind?.getValue();
  if (kind === 'objective') {
    entity.point = new Cesium.PointGraphics({
      pixelSize: 18,
      color: Cesium.Color.fromCssColorString('#facc15'),
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
    });
  } else if (kind === 'unit') {
    const side = entity.properties.side?.getValue();
    const isAffected = entity.properties.is_affected?.getValue();
    const status = entity.properties.status_change?.getValue();
    entity.point = new Cesium.PointGraphics({
      pixelSize: isAffected ? 14 : 10,
      color: Cesium.Color.fromCssColorString(side === 'RED' ? '#ef4444' : '#3b82f6'),
      outlineColor: status
        ? Cesium.Color.fromCssColorString(STATUS_COLORS[status])
        : Cesium.Color.BLACK,
      outlineWidth: isAffected ? 3 : 1,
    });
  } else if (kind === 'engagement_arc') {
    entity.polyline = new Cesium.PolylineGraphics({
      width: 2,
      material: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.fromCssColorString(STATUS_COLORS[entity.properties.status_change?.getValue()] || '#888'),
        dashLength: 16,
      }),
    });
  }
});

viewer.dataSources.add(ds);
```

### deck.gl

```js
import { GeoJsonLayer } from '@deck.gl/layers';

const layer = new GeoJsonLayer({
  id: 'wargame-phase-5',
  data: 'step05.geojson',
  pointType: 'circle',
  pickable: true,
  filled: true,
  getFillColor: f => {
    if (f.properties.kind === 'objective') return [250, 204, 21, 255];
    if (f.properties.kind === 'unit') {
      return f.properties.side === 'RED' ? [239, 68, 68, 255] : [59, 130, 246, 255];
    }
    return [128, 128, 128, 200];
  },
  getPointRadius: f => {
    if (f.properties.kind === 'objective') return 100;
    if (f.properties.is_affected) return 70;
    return 40;
  },
  getLineColor: f => {
    if (f.properties.kind === 'engagement_arc') {
      const c = STATUS_COLORS[f.properties.status_change];
      return c ? hexToRgb(c) : [136, 136, 136, 255];
    }
    return [0, 0, 0, 255];
  },
  getLineWidth: 3,
});
```

### Mapbox GL / MapLibre GL

```js
map.addSource('wargame', { type: 'geojson', data: 'step05.geojson' });

map.addLayer({
  id: 'units',
  type: 'circle',
  source: 'wargame',
  filter: ['==', ['get', 'kind'], 'unit'],
  paint: {
    'circle-radius': ['case', ['get', 'is_affected'], 8, 5],
    'circle-color': ['case',
      ['==', ['get', 'side'], 'RED'], '#ef4444',
      '#3b82f6'
    ],
    'circle-stroke-width': ['case', ['get', 'is_actor'], 2, 1],
    'circle-stroke-color': '#000',
  },
});

map.addLayer({
  id: 'arcs',
  type: 'line',
  source: 'wargame',
  filter: ['==', ['get', 'kind'], 'engagement_arc'],
  paint: {
    'line-width': 2,
    'line-dasharray': [2, 2],
    'line-color': [
      'match', ['get', 'status_change'],
      'destroyed', '#b00020',
      'damaged_partial', '#d97706',
      'suppressed', '#ca8a04',
      'delayed', '#7c3aed',
      'expended', '#2563eb',
      '#4b5563'
    ],
  },
});
```

---

## Critical invariants — what your renderer can rely on

1. **`features` array length** ≥ `1 + n_units` (always has objective + all units; may add phase_line, markers, arcs)
2. **Every unit feature has a stable `uid`** that's identical across all 17 step files (so you can track a unit over time)
3. **All coordinates are [lon, lat] in WGS84** (decimal degrees). NEVER [lat, lon].
4. **`prev_lon`/`prev_lat` in `step00.geojson` equals `geometry.coordinates`** (no previous phase — animation starts here)
5. **`is_actor` ↔ `action_*` fields**: if `is_actor === true`, `action_what` and `action_component` are populated; if false, they're absent (NOT empty strings)
6. **`is_affected` ↔ `status_change` + `cause_*` fields**: same pattern
7. **`engagement_arc.cause_actor` is always a unit UID** that exists somewhere in the `features` array as a `kind: "unit"` feature (you can join them)
8. **`engagement_arc.coordinates`** is exactly 2 positions; never zero-length (start != end)
9. **`destroyed` is sticky** — once true in phase N, true in all phases > N
10. **The `objective` feature appears in every step file** at the same coordinates (operational objective doesn't move)

---

## Time / phase semantics

- **Phases are discrete operational events**, not equal-duration ticks. `time_label` tells you how to think about elapsed time: D-7 (week before) → D-5 → D-3 → D-2 → D-1 → **D-H** (H-hour, the assault begins) → D+2h → D+6h → D+12h → D+24h → D+36h → D+48h → D+72h → D+96h → D+120h → D+132h → **D+144h** (final resolution).
- A reasonable animation pace is **2-3 seconds per phase** for an interactive viewer, or **30 frames per phase at 24fps** for a cinematic render.
- The combined `all_phases.geojson` has all 17 phases' features merged in. Each feature's `properties.phase` says which phase it belongs to. Use it for overview maps; use `stepNN.geojson` for per-phase rendering.

---

## Validation in CI / IDE

### VSCode + Red Hat YAML extension OR built-in JSON schema support

`settings.json`:
```json
"json.schemas": [
  {
    "fileMatch": ["**/step*.geojson", "**/all_phases.geojson"],
    "url": "./wargame_geojson.schema.json"
  }
]
```

### CLI (`ajv-cli`)

```bash
npm i -g ajv-cli
ajv validate -s wargame_geojson.schema.json -d "step*.geojson"
```

### Python

```python
from jsonschema import validate
import json, glob
schema = json.load(open('wargame_geojson.schema.json'))
for path in glob.glob('step*.geojson'):
    fc = json.load(open(path))
    validate(instance=fc, schema=schema)   # raises on any non-conformance
```

---

## If something seems off

1. **Open the file at https://geojson.io/next/** — it renders any valid GeoJSON and shows the JSON tree alongside. Great for spot-checking.
2. **Run the file through `ajv validate`** with our schema — gives exact path of the field that's wrong.
3. **Check the `properties.version`** — must be `2`. If it's missing or `1`, you have an old file from the prior writer; ask for a regeneration.
4. **If `n_units < 173`** — the file is incomplete. Source pipeline didn't replay all checkpoints. Re-run `src/tools/regenerate_outputs.py`.
5. **If `engagement_arc` features have null `cause_actor` or `target_uid`** — that's a bug; report it.

---

## Contact

If your app needs additional fields (like terrain elevation per unit, or a per-unit history array), ping the producer of these files. The schema is intended to be additive — new optional properties can be added without breaking existing consumers.
