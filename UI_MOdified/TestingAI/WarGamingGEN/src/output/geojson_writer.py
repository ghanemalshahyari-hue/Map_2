"""
geojson_writer.py — per-phase GeoJSON snapshots for visualization (v2).

CHANGED from v1 (2026-05-21):
  v1 emitted ~10-15 features/phase (only actors + affected units).
  v2 emits ALL units in every phase, plus engagement arcs, plus per-unit
  movement deltas so a 3D viewer can interpolate positions between phases.

Per-phase output structure (`stepNN.geojson`):
  • 1× objective Point
  • 1× phase_line LineString (when phase_line_km > 0)
  • 173× unit Point features — EVERY unit in the OOB, at its phase-current
       visualization position. Each Point carries:
         - kind          : "unit"
         - uid, side, domain, type, name_ar — identity
         - current_strength, destroyed — live state
         - is_actor      : true if took action this phase
         - is_affected   : true if hit by an outcome this phase
         - status_change, damage_pct, cause_actor, cause_what, cause_doctrine
                           (populated when is_affected = true)
         - prev_lon, prev_lat — position in the previous phase (for animation lerp)
         - action_what, action_why, action_component, action_doctrine
                           (populated when is_actor = true)
  • N× engagement_arc LineString features — one per unit_outcome that has
       both a cause_actor and a target. Carries status_change + doctrine so
       viewers can color/animate appropriately.
  • K× off_map_marker Points (Red/Blue bases, SSM TELs etc.) — for context

Position interpolation logic (doctrinally grounded):
  Red ground / SOF:
    - Phase 0-4 (pre-H-hour): at offshore spawn (staging on amphibious lift)
    - Phase 5+ (H-hour onward): distributed along the phase_line_km inland depth
      with deterministic UID-hashed x-spread so units don't all stack
  Red air:
    - Phase 0-2: at home air bases (spawn)
    - Phase 3+: over the AO at altitude
  Red naval:
    - Phase 0-2: at naval bases
    - Phase 3+ (naval engagement onward): offshore north of AO
  Red strategic (SSM):
    - Always at TEL/launch site (it's an off-map standoff asset)
  Blue ground / SOF:
    - Distributed across the AO defensively (not all at bbox center)
  Blue air / naval / strategic:
    - At their bases, shift forward in heavy engagement phases

Scenario-portable: nothing here knows the operation is Libya. All driven
by scenario.coast_lat_approx, scenario.bbox_wgs84, scenario.off_map_markers.
"""
from __future__ import annotations
import json
import hashlib
from pathlib import Path
from typing import Iterable

from ..orchestrator import PhaseRecord
from ..state.world_state import WorldState, UnitState
from ..parsers.scenario_parser import Scenario


# Approximate degrees per km in latitude
_DEG_PER_KM_LAT = 1.0 / 110.574


# ============================================================================
# Public entry
# ============================================================================

def write_phase_geojsons(
    records: Iterable[PhaseRecord],
    world: WorldState,
    scenario: Scenario,
    out_dir: Path,
) -> int:
    """Write one GeoJSON file per phase. Returns the count written.

    IMPORTANT: This consumes the world state's CURRENT positions/strengths/etc.
    For accurate per-phase rendering, you must either:
      (a) call this from inside the orchestrator's per-phase loop, OR
      (b) replay all phase outcomes into the world state via the regenerator
          (src/tools/regenerate_outputs.py).
    Otherwise unit states will only reflect the FINAL phase.
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    records = list(records)
    n = 0

    # Track previous-phase positions for movement deltas (prev_lon/prev_lat).
    # Seed is shifted (PREGEN-CONTROL-2) so it matches the shifted curr positions
    # — otherwise phase-0 would animate a jump from the unshifted spawn.
    prev_positions: dict[str, tuple[float, float]] = {
        u.uid: _shift_xy(u.lon, u.lat, scenario) for u in world.units.values()
    }

    for rec in records:
        # Compute this phase's positions
        curr_positions = {
            uid: _compute_unit_position(world.units[uid], rec, scenario)
            for uid in world.units
        }
        fc = _build_feature_collection(rec, world, scenario, curr_positions, prev_positions)
        path = out_dir / f"step{rec.phase:02d}.geojson"
        path.write_text(json.dumps(fc, ensure_ascii=False, indent=2), encoding="utf-8")
        n += 1
        prev_positions = curr_positions

    # Combined file — every feature from every phase, tagged by phase
    combined = _build_combined(records, world, scenario)
    (out_dir / "all_phases.geojson").write_text(
        json.dumps(combined, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return n


# ============================================================================
# Position interpolation
# ============================================================================

def _hash_spread(uid: str) -> float:
    """Deterministic 0..1 value from UID. Used to spread units along a line
    so multiple units don't stack at identical coordinates."""
    h = hashlib.md5(uid.encode("utf-8")).digest()
    return (h[0] << 8 | h[1]) / 65535.0


# PREGEN-CONTROL-2 (objective-relative force placement): the objective override
# delta recorded on the scenario.  Every objective-derived OUTPUT coordinate is
# translated by this so units, engagement arcs, phase lines, and bases follow a
# moved objective while each unit keeps its offset from it.  The objective Point
# feature itself is written at the active objective and is NOT re-shifted.
def _obj_shift(scenario: Scenario) -> tuple[float, float]:
    return (getattr(scenario, "objective_shift_lon", 0.0) or 0.0,
            getattr(scenario, "objective_shift_lat", 0.0) or 0.0)


def _shift_xy(lon: float, lat: float, scenario: Scenario) -> tuple[float, float]:
    sdx, sdy = _obj_shift(scenario)
    return lon + sdx, lat + sdy


def _compute_unit_position(u: UnitState, rec: PhaseRecord,
                            scenario: Scenario) -> tuple[float, float]:
    """Return the (lon, lat) where unit `u` should be visualized for phase `rec`,
    translated by the objective-relative shift (PREGEN-CONTROL-2) so unit Points
    AND the engagement arcs that read these positions follow a moved objective.
    """
    base_lon, base_lat = _compute_unit_position_base(u, rec, scenario)
    return _shift_xy(base_lon, base_lat, scenario)


def _compute_unit_position_base(u: UnitState, rec: PhaseRecord,
                                 scenario: Scenario) -> tuple[float, float]:
    """Return the base-grid (lon, lat) where unit `u` is visualized for phase
    `rec`, BEFORE the objective-relative shift.

    Falls back to spawn if no rule matches. Destroyed units stay at their
    last position (renderer should fade them out).
    """
    spawn_lon, spawn_lat = u.src_lon, u.src_lat
    if u.destroyed:
        return spawn_lon, spawn_lat   # keep destroyed units at last position

    bbox = scenario.bbox_wgs84              # [lon_min, lat_min, lon_max, lat_max]
    coast_lat = scenario.coast_lat_approx
    phase = rec.phase
    spread = _hash_spread(u.uid)            # 0..1

    # Lon spread across full AO bbox (used when unit enters AO)
    ao_lon = bbox[0] + spread * (bbox[2] - bbox[0])

    if u.side == "RED":
        if u.domain in ("ground", "sof"):
            # Pre-H-hour: at offshore spawn (staging on amphibious lift)
            if phase < 5:
                return spawn_lon, spawn_lat
            # H-hour onward: position along the current phase line
            # Phase line moves inland as rec.phase_line_km grows
            line_lat = coast_lat - max(0.5, rec.phase_line_km) * _DEG_PER_KM_LAT
            return ao_lon, line_lat
        if u.domain == "air":
            # Phase 0-2: at home base; phase 3+: over the AO
            if phase < 3:
                return spawn_lon, spawn_lat
            # Slightly north of coast (incoming) shifting south as battle progresses
            offset_lat = coast_lat + 0.15 - min(0.4, rec.phase_line_km * _DEG_PER_KM_LAT)
            return ao_lon, offset_lat
        if u.domain == "naval":
            # Phase 0-2: at base; phase 3+: approach AO offshore
            if phase < 3:
                return spawn_lon, spawn_lat
            # Offshore staging just north of the coastline
            naval_lat = coast_lat + 0.35   # ~38 km offshore
            return ao_lon, naval_lat
        if u.domain == "strategic":
            return spawn_lon, spawn_lat   # SSM stays at off-map TEL site
        return spawn_lon, spawn_lat

    # BLUE — defender, holds positions
    if u.side == "BLUE":
        if u.domain in ("ground", "sof"):
            # Distribute Blue defenders across the AO bbox instead of clumping
            # at the geometric center. Use lat spread too — defense in depth.
            lat_spread = (_hash_spread(u.uid + "_LAT"))   # different seed
            defender_lat = bbox[1] + 0.15 + lat_spread * (bbox[3] - bbox[1] - 0.3)
            return ao_lon, defender_lat
        if u.domain == "air":
            # Blue air patrols over AO from phase 0 (defensive CAP)
            return ao_lon, coast_lat - 0.10 - 0.3 * _hash_spread(u.uid + "_AIR_LAT")
        if u.domain == "naval":
            # Blue naval near home base by default; advance to coast under contest
            if phase < 5:
                return spawn_lon, spawn_lat
            return ao_lon, coast_lat + 0.10
        if u.domain == "strategic":
            return spawn_lon, spawn_lat
        return spawn_lon, spawn_lat

    return spawn_lon, spawn_lat


# ============================================================================
# Feature builders
# ============================================================================

def _collect_actor_metadata(rec: PhaseRecord) -> dict[str, dict]:
    """Return UID → dict(component, what, why, intended_effect, doctrine_cited, side)
    for every unit that acted this phase."""
    out: dict[str, dict] = {}
    for side_label, action_dict in (("RED", rec.red_action), ("BLUE", rec.blue_reaction)):
        for comp_name in ("strategic", "maritime", "air", "mines",
                          "usv_uav", "sof", "land", "ew"):
            c = action_dict.get(comp_name)
            if c is None:
                continue
            actor = c.get("actor")
            if not actor:
                continue
            out[actor] = {
                "side": side_label,
                "component": comp_name,
                "what": c.get("what", ""),
                "why": c.get("why", ""),
                "intended_effect": c.get("intended_effect", ""),
                "doctrine_cited": c.get("doctrine_cited") or [],
            }
    return out


def _collect_affected_metadata(rec: PhaseRecord) -> dict[str, dict]:
    """Return UID → outcome dict for every unit hit this phase."""
    out: dict[str, dict] = {}
    for o in rec.resolution.get("unit_outcomes", []):
        uid = o.get("unit_uid")
        if not uid:
            continue
        out[uid] = o    # last one wins if duplicate; rare
    return out


def _build_feature_collection(
    rec: PhaseRecord,
    world: WorldState,
    scenario: Scenario,
    curr_positions: dict[str, tuple[float, float]],
    prev_positions: dict[str, tuple[float, float]],
) -> dict:
    features: list[dict] = []

    # ---------- 1. Objective ----------
    obj = scenario.objective
    if obj:
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [obj.lon, obj.lat]},
            "properties": {
                "kind": "objective",
                "id": obj.id,
                "name_ar": obj.name_ar,
                "name_en": obj.name_en,
                "phase": rec.phase,
                "depth_km_from_coast": obj.depth_km_from_coast,
            },
        })

    # ---------- 2. Phase line ----------
    # Translated by the objective shift (PREGEN-CONTROL-2) so the advancing
    # front stays consistent with the (shifted) unit positions and the objective.
    if rec.phase_line_km and rec.phase_line_km > 0:
        line_lat = scenario.coast_lat_approx - rec.phase_line_km * _DEG_PER_KM_LAT
        bbox = scenario.bbox_wgs84
        pl_a = _shift_xy(bbox[0], line_lat, scenario)
        pl_b = _shift_xy(bbox[2], line_lat, scenario)
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [[pl_a[0], pl_a[1]], [pl_b[0], pl_b[1]]],
            },
            "properties": {
                "kind": "phase_line",
                "phase": rec.phase,
                "phase_line_km": rec.phase_line_km,
                "time_label": rec.time_label,
            },
        })

    # ---------- 3. Off-map markers (Red/Blue bases) ----------
    # Bases are the spawn anchors for naval/air units, which _compute_unit_position
    # also shifts; translate the markers by the same delta so a base and the units
    # launching from it stay co-located after an objective override.
    for m in scenario.off_map_markers:
        m_lon, m_lat = _shift_xy(m.lon, m.lat, scenario)
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [m_lon, m_lat]},
            "properties": {
                "kind": "off_map_marker",
                "id": m.id,
                "name_ar": m.name_ar,
                "side": m.side,
                "type": m.type,
                "phase": rec.phase,
            },
        })

    # ---------- 4. All 173 units ----------
    actors = _collect_actor_metadata(rec)
    affected = _collect_affected_metadata(rec)

    for uid, u in world.units.items():
        curr = curr_positions.get(uid, (u.lon, u.lat))
        prev = prev_positions.get(uid, curr)
        is_actor = uid in actors
        is_affected = uid in affected
        feature: dict = {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [curr[0], curr[1]]},
            "properties": {
                "kind": "unit",
                "uid": uid,
                "side": u.side,
                "domain": u.domain,
                "type": u.type,
                "name_ar": u.name_ar,
                "echelon": u.echelon,
                "phase": rec.phase,

                # Live state (post-application of this phase's outcomes — see regenerator)
                "current_strength": round(u.strength, 2),
                "initial_strength": round(u.initial_strength, 2),
                "destroyed": bool(u.destroyed),
                "suppressed_pct": round(u.suppressed_pct, 2),
                "delayed_pct": round(u.delayed_pct, 2),

                # Equipment counters (None if N/A for this unit type)
                "magazine": u.magazine,
                "airframes": u.airframes,
                "hulls_remaining": u.hulls_remaining,

                # Animation interp
                "prev_lon": prev[0],
                "prev_lat": prev[1],

                # Flags
                "is_actor": is_actor,
                "is_affected": is_affected,
            },
        }
        if is_actor:
            a = actors[uid]
            feature["properties"].update({
                "action_component": a["component"],
                "action_what": a["what"],
                "action_why": a["why"],
                "action_intended_effect": a["intended_effect"],
                "action_doctrine_cited": a["doctrine_cited"],
            })
        if is_affected:
            o = affected[uid]
            feature["properties"].update({
                "status_change": o.get("status_change"),
                "damage_pct": o.get("damage_pct", 0.0),
                "cause_actor": o.get("cause_actor", ""),
                "cause_what": o.get("cause_what", ""),
                "cause_doctrine": o.get("cause_doctrine", ""),
            })
        features.append(feature)

    # ---------- 5. Engagement arcs (cause_actor → target) ----------
    for o in rec.resolution.get("unit_outcomes", []):
        src_uid = o.get("cause_actor")
        dst_uid = o.get("unit_uid")
        if not src_uid or not dst_uid:
            continue
        if src_uid not in world.units or dst_uid not in world.units:
            continue
        src = curr_positions.get(src_uid, (world.units[src_uid].lon, world.units[src_uid].lat))
        dst = curr_positions.get(dst_uid, (world.units[dst_uid].lon, world.units[dst_uid].lat))
        # Skip zero-length arcs (cause == target — happens for self-expended munitions)
        if src == dst:
            continue
        features.append({
            "type": "Feature",
            "geometry": {
                "type": "LineString",
                "coordinates": [[src[0], src[1]], [dst[0], dst[1]]],
            },
            "properties": {
                "kind": "engagement_arc",
                "phase": rec.phase,
                "cause_actor": src_uid,
                "target_uid": dst_uid,
                "status_change": o.get("status_change"),
                "damage_pct": o.get("damage_pct", 0.0),
                "cause_what": o.get("cause_what", ""),
                "cause_doctrine": o.get("cause_doctrine", ""),
                "actor_side": world.units[src_uid].side,
                "target_side": world.units[dst_uid].side,
            },
        })

    # ---------- FeatureCollection wrapper ----------
    n_actor = sum(1 for f in features if f["properties"].get("is_actor"))
    n_affected = sum(1 for f in features if f["properties"].get("is_affected"))
    n_arcs = sum(1 for f in features if f["properties"].get("kind") == "engagement_arc")

    return {
        "type": "FeatureCollection",
        "name": f"step{rec.phase:02d}",
        "properties": {
            "version": 2,
            "phase": rec.phase,
            "time_label": rec.time_label,
            "phase_name_ar": rec.phase_name_ar,
            "kind": rec.kind,
            "phase_line_km": rec.phase_line_km,
            "combined_effect": rec.resolution.get("combined_effect", ""),
            "step_advantage": rec.resolution.get("step_advantage", ""),
            "force_ratio_local": rec.metrics_before.get("force_ratio_local"),
            "force_ratio_operational": rec.metrics_before.get("force_ratio_operational"),
            "n_units": len(world.units),
            "n_actors": n_actor,
            "n_affected": n_affected,
            "n_engagement_arcs": n_arcs,
        },
        "features": features,
    }


def _build_combined(records, world: WorldState, scenario: Scenario) -> dict:
    """All phases merged into one FeatureCollection. NOTE — this re-runs the
    per-phase builder, which uses world.units' CURRENT state. For combined
    output we accept that destroyed/damaged state reflects the FINAL phase
    (since we can't snapshot world state per-feature without storing it).
    """
    all_features: list[dict] = []
    prev_positions: dict[str, tuple[float, float]] = {
        u.uid: _shift_xy(u.lon, u.lat, scenario) for u in world.units.values()
    }
    for rec in records:
        curr_positions = {
            uid: _compute_unit_position(world.units[uid], rec, scenario)
            for uid in world.units
        }
        fc = _build_feature_collection(rec, world, scenario, curr_positions, prev_positions)
        all_features.extend(fc["features"])
        prev_positions = curr_positions
    return {
        "type": "FeatureCollection",
        "name": "all_phases",
        "properties": {
            "version": 2,
            "operation_name": scenario.operation_name,
        },
        "features": all_features,
    }
