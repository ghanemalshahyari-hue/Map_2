# 5. GeoJSON Writer v2 — what changed and why

**Status:** As of 2026-05-21, the GeoJSON output went from v1 (sparse) → v2 (full force + movement + arcs). This document explains every change so the Linux Claude understands what's in the files and how to regenerate them.

## Quick summary — what was wrong with v1

v1 (the one originally built on Mac) emitted only ~12-15 features per phase:
- 1× objective Point
- 0-1× phase_line LineString
- N× "affected_unit" Points (only units in `PhaseResolution.unit_outcomes`)
- N× "actor_unit" Points (only units in the active components of Red/Blue actions)

This meant when you opened `step00.geojson` in geojson.io, you saw a handful of dots instead of the full 173-unit OOB. You couldn't see:
- Where units that did nothing this phase were sitting
- Where units moved between phases
- How engagements connected attacker → target
- The full operational picture

The user (correctly) called this out. **v2 fixes all of it.**

## What v2 emits per phase

Each `stepNN.geojson` is a FeatureCollection with:

| Feature kind | Count per phase | Description |
|---|---:|---|
| `objective` | 1 | The operational objective (OBJ-X) marker |
| `phase_line` | 0-1 | LineString across the bbox at the current inland depth (when phase_line_km > 0) |
| `off_map_marker` | 11 | Red/Blue bases, SSM TELs from `scenario.off_map_markers` |
| `unit` | **173** | **Every unit in the OOB**, at its current visualization position |
| `engagement_arc` | 8-14 | LineString per `unit_outcome` connecting `cause_actor` → `unit_uid` |
| **Total** | **~194-198** | (was ~12 in v1) |

The FeatureCollection's top-level `properties` carries summary metadata + `version: 2` so consumers can distinguish v1 from v2.

## Per-unit Point feature — what's inside

Every unit Point feature has these `properties`:

### Identity
```json
{
  "kind": "unit",
  "uid": "R-d3-12-008",
  "side": "RED",
  "domain": "air",
  "type": "strike",
  "name_ar": "...",
  "echelon": "sqn"
}
```

### Live state (post-application of this phase's outcomes)
```json
{
  "current_strength": 3.5,        // post-damage
  "initial_strength": 4.0,        // never changes — for % damage calc
  "destroyed": false,
  "suppressed_pct": 0.20,
  "delayed_pct": 0.0,
  "magazine": null,               // or integer if applicable
  "airframes": 11,                // or null if not air
  "hulls_remaining": null         // or integer if naval
}
```

### Animation hooks
```json
{
  "phase": 5,
  "prev_lon": 18.0,               // position in the PREVIOUS phase
  "prev_lat": 33.0                // a 3D viewer can lerp current → prev
}
```

### Activity flags (only present when applicable)
```json
{
  "is_actor": true,
  "action_component": "air",
  "action_what": "MiG-29s engage Blue F-16 patrols",
  "action_why": "...",
  "action_intended_effect": "...",
  "action_doctrine_cited": ["AJP-3.3"]
}
```

```json
{
  "is_affected": true,
  "status_change": "damaged_partial",
  "damage_pct": 0.30,
  "cause_actor": "B-d2-3-048",
  "cause_what": "Engaged by Blue F-16 patrol",
  "cause_doctrine": "Black Sea 2024 USV survival 25-30%"
}
```

## Position interpolation — the movement logic

**This is the key change for visualization.** Units no longer all sit at their spawn positions; they move based on role + phase. The logic lives in `_compute_unit_position()` in `src/output/geojson_writer.py`.

### Red ground / SOF units
- **Phases 0-4** (pre-H-hour, D-7 through D-1): At offshore spawn. Doctrinally correct — they're loaded on amphibious lift and haven't landed yet.
- **Phase 5+** (D-H onward): Distributed along the **phase_line_km** inland depth. As `phase_line_km` grows (1.5 km at D-H → 95 km at D+144h), Red ground units shift south. UID-hashed x-spread so brigades don't all stack on one coordinate.

### Red air units
- **Phases 0-2**: At home air base (one of the R-AB-A/B/C off-map markers).
- **Phase 3+**: Over the AO. Latitude shifts south slightly as `phase_line_km` grows (escorting the advance).

### Red naval units
- **Phases 0-2**: At naval base.
- **Phase 3+** (naval_engagement onward): Offshore staging just north of the coast (~38 km out).

### Red strategic (SSM brigade)
- Always at TEL site. It's a standoff asset firing from off-map.

### Blue ground / SOF units
- **Distributed across the AO bbox defensively** instead of clustering at the geometric center. Both lon and lat are UID-hashed so units spread in a defensive grid pattern. Doctrinally correct — Blue is the defender with depth.

### Blue air units
- Over the AO from phase 0 (defensive CAP). Hashed positions for spread.

### Blue naval units
- At home base by default. Phase 5+: approach the coast (Blue counter-fire during landing).

### Blue strategic (SSM)
- At base.

**All positions are computed from `scenario.coast_lat_approx`, `scenario.bbox_wgs84`, and the phase's `phase_line_km`.** Nothing hardcodes Libya — swap the scenario and the same logic produces the right positions for whatever AO.

## Engagement arcs — Red action → Blue reaction visualization

For every `unit_outcome` in the phase's resolution, v2 emits a LineString:

```json
{
  "type": "Feature",
  "geometry": {
    "type": "LineString",
    "coordinates": [
      [src_lon, src_lat],   // cause_actor's current position
      [dst_lon, dst_lat]    // target's current position
    ]
  },
  "properties": {
    "kind": "engagement_arc",
    "phase": 5,
    "cause_actor": "R-d3-12-008",
    "target_uid": "B-d2-3-048",
    "status_change": "damaged_partial",
    "damage_pct": 0.30,
    "cause_what": "Engaged by Red MiG-29s",
    "cause_doctrine": "ATP 3-01.8 Combined Arms",
    "actor_side": "RED",
    "target_side": "BLUE"
  }
}
```

8-14 per phase typically. These let viewers draw animated tracers (e.g. dashed lines pulsing red→blue) showing causality.

## What 3D viewers can do with this

Animation interpolation:
```js
// Pseudo-code for a Cesium / Three.js viewer
for (const unit of currentPhaseFeatures) {
  const prev = [unit.properties.prev_lon, unit.properties.prev_lat];
  const curr = unit.geometry.coordinates;
  // Lerp position over phase duration:
  const t = (now - phaseStartTime) / phaseDurationMs;
  const interpolated = lerp(prev, curr, t);
  positionEntity(unit.properties.uid, interpolated);
}
```

Engagement arc rendering:
```js
for (const arc of currentPhaseArcs) {
  drawAnimatedDashedLine(
    arc.geometry.coordinates,
    color: statusToColor(arc.properties.status_change),
    duration: 1500
  );
}
```

Status overlay:
```js
const colorByStatus = {
  destroyed:       '#b00020',  // red
  damaged_partial: '#d97706',  // orange
  suppressed:      '#ca8a04',  // yellow
  delayed:         '#7c3aed',  // purple
  expended:        '#2563eb',  // blue
  unchanged:       '#4b5563',  // gray
};
```

## Code files added / changed

### Changed
- **`src/output/geojson_writer.py`** — completely rewritten. All v1 logic replaced.

### Added
- **`src/tools/__init__.py`** — empty (marks `tools/` as a Python package)
- **`src/tools/regenerate_outputs.py`** — replays existing checkpoints + rewrites CSV/MD/GeoJSON without LLM calls. **Zero cost.**

### Not changed
- `src/output/csv_schedule.py` — same as before, no v2 changes
- `src/output/markdown_report.py` — same
- `src/orchestrator.py` — no changes (the writer is called at end-of-run by `test_full_run.py`; orchestrator just passes records along)
- `src/llm/schemas.py` — no schema changes
- `src/state/world_state.py` — no changes
- All agent code — no changes

## How to regenerate outputs from existing checkpoints (Linux)

This is the key win — you can iterate the writer without burning LLM tokens.

```bash
cd ~/wargame/WarGameGenerator
source ../DecisionMakingSteps_TRANSFER/venv_linux/bin/activate

# Regenerate from runs/latest:
python -m src.tools.regenerate_outputs

# Or a specific run:
python -m src.tools.regenerate_outputs --run-dir runs/2026-05-21_some_run
```

Takes ~3-5 seconds. Output goes to `<run_dir>/outputs/` (overwrites the existing CSV/MD/GeoJSON in place — checkpoints are untouched).

## Verification — what to expect after regenerating

For a 17-phase Libya run, every `stepNN.geojson` should have:
- **`features`** array of ~194-198 entries
- Top-level `properties.version` = `2`
- Top-level `properties.n_units` = `173`
- Top-level `properties.n_actors` = 12-15
- Top-level `properties.n_affected` = 4-14
- Top-level `properties.n_engagement_arcs` = 4-14

Quick verify on Linux:
```bash
python3 -c "
import json
for p in [0, 5, 9, 16]:
    fc = json.load(open(f'runs/latest/outputs/geojson/step{p:02d}.geojson'))
    props = fc['properties']
    print(f'step{p:02d}: features={len(fc[\"features\"])} version={props[\"version\"]} '
          f'units={props[\"n_units\"]} actors={props[\"n_actors\"]} '
          f'affected={props[\"n_affected\"]} arcs={props[\"n_engagement_arcs\"]}')
"
```

Expected output:
```
step00: features=197 version=2 units=173 actors=14 affected=12 arcs=12
step05: features=194 version=2 units=173 actors=14 affected=8 arcs=8
step09: features=194 version=2 units=173 actors=12 affected=8 arcs=8
step16: features=196 version=2 units=173 actors=12 affected=10 arcs=10
```

## Known limitations / future work

1. **`all_phases.geojson` final-state caveat**: When the combined file is built, the world state at write-time reflects the FINAL phase's destroyed/damaged flags for every feature. The per-phase step files don't have this issue (they replay phase-by-phase). If a downstream consumer needs accurate per-phase state in the combined file, it should iterate the individual `stepNN.geojson` files instead.

2. **Position interpolation is doctrinal heuristic, not GPS-tracked movement**: We don't simulate physical maneuver. Red ground units "appear" at the phase line as it grows — they don't have a velocity vector. For more realism (movement paths, formations, terrain following) we'd need a movement model added to `world_state.py`.

3. **UID-hashed spread is deterministic but arbitrary**: Two consecutive UIDs (R-d3-12-001 and R-d3-12-002) won't necessarily end up adjacent on the map. This is intentional (avoids them stacking) but means the spatial layout doesn't reflect the OOB hierarchy. A future improvement would group brigade-mates near each other.

4. **Engagement arcs are direct line-of-sight**: They don't follow road networks or maritime routes. Real-world projectile paths (SSMs, USVs) would arc; we draw straight lines.

5. **`prev_position` reset on regenerate**: When you re-run `regenerate_outputs.py`, the `prev_lon`/`prev_lat` for phase 0 references the initial spawn (i.e. prev == current). Phase 1 onward references the previous run's current position. This is correct — phase 0 has no "before" to reference.

## If you need to roll back to v1

`git log src/output/geojson_writer.py` — find the commit before this rewrite, then `git checkout <hash> -- src/output/geojson_writer.py`. The orchestrator + schemas + checkpoints are unchanged so v1 will still work, just with sparse output.

## Files on USB to update

When you copy the latest project from Mac to Linux #1, these files reflect v2:

| Path | Why |
|---|---|
| `WarGameGenerator/src/output/geojson_writer.py` | New writer logic |
| `WarGameGenerator/src/tools/__init__.py` | New package marker |
| `WarGameGenerator/src/tools/regenerate_outputs.py` | New regenerator |
| `Linux_Handoff/5_CHANGES_GEOJSON_V2.md` | This document |

Everything else is unchanged.
