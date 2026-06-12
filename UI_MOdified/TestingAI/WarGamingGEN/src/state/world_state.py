"""
world_state.py — single source of truth for the simulation.

Owns:
  • Every unit's mutable state (position, strength, status, suppression, magazine, hulls, airframes)
  • Per-phase numeric metrics (force ratios, EW intensities, mines remaining)
  • The deterministic mutation API (apply(PhaseResolution) → updates)

Design rule: LLM agents NEVER mutate this directly. They propose actions/
reactions; the Adjudicator returns a PhaseResolution; only WorldState.apply()
mutates state. This guarantees reproducibility.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
import math
from ..parsers.docx_parser import ForceOOB, ForceUnit
from ..parsers.scenario_parser import Scenario
from ..parsers.gis_loader import GISContext


# ============================================================================
# Per-unit live state
# ============================================================================

@dataclass
class UnitState:
    """Live combat state for one unit. Mutable."""
    uid: str
    side: str                        # "RED" | "BLUE"
    name_ar: str
    name_en: str
    domain: str                      # "ground" | "air" | "naval" | "sof" | "strategic"
    type: str                        # subtype, e.g. "mech_brigade"
    echelon: str                     # "div" | "bde" | "bn" | "coy" | "sqn" | "flot" | "unit"
    parent_uid: Optional[str]
    # Strength and position
    strength: float                  # 0..N — combat power points
    initial_strength: float
    lon: float
    lat: float
    src_lon: float                   # original spawn position
    src_lat: float
    # Live attributes (vary per phase)
    status: str = "active"           # active | suppressed | delayed | destroyed | expended | offshore_expected | in_port | in_hangar | in_reserve | committed
    suppressed_pct: float = 0.0      # 0..0.85
    delayed_pct: float = 0.0         # 0..0.85
    destroyed: bool = False
    # Equipment counts (for naval, air, AD batteries)
    count: Optional[int] = None      # e.g. 10 destroyers
    hulls_remaining: Optional[int] = None
    airframes: Optional[int] = None
    magazine: Optional[int] = None   # SAM/SSM missile count
    # Provenance + audit
    raw_line: str = ""

    def effective_power(self) -> float:
        """Combat power after suppression + delay."""
        if self.destroyed: return 0.0
        sup = max(0.0, min(0.85, self.suppressed_pct))
        delay = max(0.0, min(0.85, self.delayed_pct))
        return self.strength * (1 - sup) * (1 - delay * 0.5)


# ============================================================================
# Per-side aggregate
# ============================================================================

def _strength_for(echelon: str, type_: str, side: str) -> float:
    """Initial strength points for a unit, avoiding double-counting in the
    hierarchical OOB (a brigade and its battalions are both listed in the DOCX
    — counting both would double-count the same combat power).

    Rule:
      coy = 1.0 fighting power (1.2 for Red — slightly heavier doctrine)
      bn  = 0.5 (HQ only — its companies are counted separately)
      bde = 1.5 (HQ + organic supports — its bns are counted separately)
      div = 2.5 (HQ + division troops — its bdes are counted separately)
      sqn = airframes × 0.5 (air) or 0.2 (helo/UAV/transport)
      flot = ship count × per-class weight (handled at unit-build time)
    """
    coy_pts = 1.2 if side == "RED" else 1.0
    table = {
        "coy": coy_pts, "bn": 0.5, "bde": 1.5, "div": 2.5,
        "sqn": 4.0, "flot": 5.0, "unit": 1.0,
    }
    return table.get(echelon, 1.0)


# ============================================================================
# Per-phase aggregate metrics
# ============================================================================

@dataclass
class PhaseMetrics:
    """Computed by ForceModel before each phase. Read by agents + adjudicator."""
    phase: int
    red_power_in_contact: float
    blue_power_in_contact: float
    red_power_total: float
    blue_power_total: float
    force_ratio_local: float
    force_ratio_operational: float
    ew_strength_red: float = 0.0
    ew_strength_blue: float = 0.0
    blue_mines_remaining: int = 0
    advantage_label: str = "BLUE_ADV"  # RED_ADV | CONTESTED | BLUE_ADV
    advantage_reason_brief: str = ""


# ============================================================================
# World state — the central simulation state
# ============================================================================

class WorldState:
    """Container for the entire mutable simulation state."""

    def __init__(
        self,
        scenario: Scenario,
        red_oob: ForceOOB,
        blue_oob: ForceOOB,
        gis: GISContext,
    ) -> None:
        self.scenario = scenario
        self.gis = gis
        self.red_oob = red_oob
        self.blue_oob = blue_oob

        # Build live unit states
        self.units: dict[str, UnitState] = {}
        for u in red_oob.units:
            self.units[u.uid] = self._make_unit_state(u, side="RED", scenario=scenario)
        for u in blue_oob.units:
            self.units[u.uid] = self._make_unit_state(u, side="BLUE", scenario=scenario)

        # Per-phase EW / mines / current phase
        self.current_phase: int = 0
        self.blue_mines_remaining: int = 400        # default; later loaded from scenario
        self.ew_strength_red: float = 0.0
        self.ew_strength_blue: float = 0.0

        # Cumulative losses log
        self.losses_log: list[dict] = []            # one entry per unit-outcome over time

    # ----- construction helpers -----
    def _make_unit_state(self, u: ForceUnit, side: str, scenario: Scenario) -> UnitState:
        strength = _strength_for(u.echelon, u.type, side)
        # Default spawn position based on side + domain
        # Off-map markers for SSM, naval bases, air bases will come from scenario.off_map_markers later
        lon, lat = self._spawn_position(u, side, scenario)
        # Equipment counts pulled from parsed counts dict
        counts = u.counts
        airframes = counts.get("aircraft") or (12 if u.echelon == "sqn" else None)
        magazine = None
        if u.type.startswith("sam_") or u.type == "ssm_brigade":
            magazine = 36 if u.type == "ssm_brigade" else 120
        hulls = counts.get("count") if u.domain == "naval" else None

        # Initial status — naval/air units in port; ground in marshalling
        if u.domain == "air":
            status = "in_hangar"
        elif u.domain == "naval":
            status = "in_port"
        elif u.domain == "strategic":
            status = "deployed"
        elif side == "RED" and u.echelon in ("div", "bde", "bn", "coy") and u.domain == "ground":
            status = "offshore_expected"  # Red ground units load on amphibious lift
        else:
            status = "active"

        return UnitState(
            uid=u.uid, side=side,
            name_ar=u.name_ar, name_en=u.name_en or u.uid,
            domain=u.domain, type=u.type, echelon=u.echelon, parent_uid=u.parent_uid,
            strength=strength, initial_strength=strength,
            lon=lon, lat=lat, src_lon=lon, src_lat=lat,
            status=status,
            count=hulls, hulls_remaining=hulls,
            airframes=airframes, magazine=magazine,
            raw_line=u.raw_line,
        )

    def _spawn_position(self, u: ForceUnit, side: str, scenario: Scenario) -> tuple[float, float]:
        """Default spawn:
            Red units → spawn near a Red off-map marker matching their domain
            Blue units → spawn in the AO bbox (Blue defenders are in their AO)
        """
        # Find a matching off-map marker
        if side == "RED":
            marker_type = "naval_base" if u.domain == "naval" else ("air_base" if u.domain == "air" else None)
            if marker_type:
                candidates = [m for m in scenario.off_map_markers if m.side == "RED" and m.type == marker_type]
                if candidates:
                    m = candidates[0]
                    return (m.lon, m.lat)
            # Strategic / SOF / Ground
            ssm_candidates = [m for m in scenario.off_map_markers if m.side == "RED" and m.type == "ssm_brigade"]
            if u.domain == "strategic" and ssm_candidates:
                return (ssm_candidates[0].lon, ssm_candidates[0].lat)
            # Default Red ground = south of a naval base (loaded on ships)
            return (18.0, 32.0)
        else:
            # Blue
            if u.domain == "naval":
                candidates = [m for m in scenario.off_map_markers if m.side == "BLUE" and m.type == "naval_base"]
                if candidates: return (candidates[0].lon, candidates[0].lat)
            if u.domain == "air":
                candidates = [m for m in scenario.off_map_markers if m.side == "BLUE" and m.type == "air_base"]
                if candidates: return (candidates[0].lon, candidates[0].lat)
            if u.domain == "strategic":
                candidates = [m for m in scenario.off_map_markers if m.side == "BLUE" and m.type == "ssm_brigade"]
                if candidates: return (candidates[0].lon, candidates[0].lat)
            # Ground / SOF default — center of AO
            bbox = scenario.bbox_wgs84
            return ((bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2)

    # ----- query helpers -----
    def units_of_side(self, side: str) -> list[UnitState]:
        return [u for u in self.units.values() if u.side == side]

    def units_of_domain(self, side: str, domain: str) -> list[UnitState]:
        return [u for u in self.units.values() if u.side == side and u.domain == domain and not u.destroyed]

    def alive_count(self, side: str) -> int:
        return sum(1 for u in self.units.values() if u.side == side and not u.destroyed)

    def total_power(self, side: str, only_in_contact: bool = False) -> float:
        total = 0.0
        for u in self.units.values():
            if u.side != side or u.destroyed: continue
            if only_in_contact and u.status in ("offshore_expected", "in_port", "in_hangar", "in_reserve"):
                continue
            total += u.effective_power()
        return total

    # ----- mutation API (the only legal way to change state) -----
    def apply_outcome(self, outcome) -> None:
        """Apply a single UnitOutcome from the adjudicator's PhaseResolution.
        Mutates the target unit's state. Logs the loss.
        """
        u = self.units.get(outcome.unit_uid)
        if u is None:
            print(f"[world_state] WARN: unit {outcome.unit_uid} not found")
            return
        if u.destroyed:
            return  # already gone
        sc = outcome.status_change
        if sc == "destroyed":
            u.destroyed = True; u.status = "destroyed"; u.strength = 0.0
        elif sc == "damaged_partial":
            frac = outcome.damage_pct
            u.strength *= (1 - frac)
            if u.hulls_remaining is not None and u.hulls_remaining > 0:
                lost = max(1, int(round(u.hulls_remaining * frac)))
                u.hulls_remaining = max(0, u.hulls_remaining - lost)
                if u.hulls_remaining <= 0:
                    u.destroyed = True; u.status = "destroyed"
            if u.airframes is not None and u.airframes > 0:
                lost = max(1, int(round(u.airframes * frac)))
                u.airframes = max(0, u.airframes - lost)
                if u.airframes <= 0:
                    u.destroyed = True; u.status = "destroyed"
        elif sc == "suppressed":
            u.suppressed_pct = min(0.85, u.suppressed_pct + outcome.damage_pct)
            u.status = "suppressed"
        elif sc == "delayed":
            u.delayed_pct = min(0.85, u.delayed_pct + outcome.damage_pct)
            u.status = "delayed"
        elif sc == "expended":
            # Munitions / sorties consumed — decrement magazine or airframes,
            # don't drop strength or kill the launcher. damage_pct is the
            # fraction of the magazine/airframe pool consumed this phase.
            frac = max(0.0, min(1.0, outcome.damage_pct))
            if u.magazine is not None and u.magazine > 0:
                u.magazine = max(0, u.magazine - max(1, int(round(u.magazine * frac))))
            if u.airframes is not None and u.airframes > 0 and u.domain == "air":
                # Sortie expenditure consumes airframes only partially (sorties != kills)
                u.airframes = max(0, u.airframes - max(1, int(round(u.airframes * frac * 0.3))))
            # Status stays "active" — the unit's still combat-effective, it just
            # spent rounds. We don't set u.status = "expended" because that's
            # not in the lifecycle status field; it's a per-outcome marker.
        # "unchanged" → no-op
        self.losses_log.append({
            "phase": self.current_phase,
            "unit_uid": outcome.unit_uid,
            "unit_name_ar": u.name_ar,
            "side": u.side,
            "domain": u.domain,
            "status_change": sc,
            "damage_pct": outcome.damage_pct,
            "cause_actor": outcome.cause_actor,
            "cause_what": outcome.cause_what,
            "cause_doctrine": outcome.cause_doctrine,
        })

    def apply_resolution(self, resolution) -> None:
        """Apply a full PhaseResolution to the world. Updates EW + mines."""
        for outcome in resolution.unit_outcomes:
            self.apply_outcome(outcome)
        self.ew_strength_red = resolution.ew_strength_red
        self.ew_strength_blue = resolution.ew_strength_blue
        self.blue_mines_remaining = resolution.mines_remaining

    # ----- snapshot / serialization -----
    def snapshot(self) -> dict:
        return {
            "phase": self.current_phase,
            "red_alive": self.alive_count("RED"),
            "blue_alive": self.alive_count("BLUE"),
            "red_power_total": round(self.total_power("RED"), 2),
            "blue_power_total": round(self.total_power("BLUE"), 2),
            "red_power_in_contact": round(self.total_power("RED", only_in_contact=True), 2),
            "blue_power_in_contact": round(self.total_power("BLUE", only_in_contact=True), 2),
            "ew_red": self.ew_strength_red,
            "ew_blue": self.ew_strength_blue,
            "blue_mines_remaining": self.blue_mines_remaining,
            "losses_to_date": len(self.losses_log),
        }


# ============================================================================
# Builder helper
# ============================================================================

def build_world_state_from_inputs(
    scenario: Scenario,
    red_oob: ForceOOB,
    blue_oob: ForceOOB,
    gis: GISContext,
) -> WorldState:
    return WorldState(scenario, red_oob, blue_oob, gis)


# ============================================================================
# Smoke test
# ============================================================================
if __name__ == "__main__":
    from ..parsers.docx_parser import parse_docx_oob
    from ..parsers.scenario_parser import load_scenario
    from ..parsers.gis_loader import load_gis

    project = Path(__file__).resolve().parent.parent.parent
    scenario = load_scenario(project / "inputs" / "scenario.json")
    red = parse_docx_oob(project / "inputs/forces/red_team.docx", "RED")
    blue = parse_docx_oob(project / "inputs/forces/blue_team.docx", "BLUE")
    gis = load_gis(project / "inputs" / "gis", tuple(scenario.bbox_wgs84))

    world = build_world_state_from_inputs(scenario, red, blue, gis)

    print("\n" + "=" * 72)
    print("  Initial WorldState snapshot")
    print("=" * 72)
    import json
    print(json.dumps(world.snapshot(), indent=2))

    # Per-domain breakdown
    for side in ("RED", "BLUE"):
        print(f"\n  {side} per-domain unit counts + power:")
        for dom in ("strategic", "naval", "air", "ground", "sof"):
            ulist = world.units_of_domain(side, dom)
            pwr = sum(u.effective_power() for u in ulist)
            print(f"    {dom:10s}  units={len(ulist):3d}  power={pwr:6.1f}")
