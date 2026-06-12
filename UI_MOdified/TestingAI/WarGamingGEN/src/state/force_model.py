"""
force_model.py — deterministic combat math.

ALL numbers come from here. The LLM agents never compute force ratios,
attrition, or magazine depletion. They propose actions; ForceModel computes
the numbers; the Adjudicator narrates the result and assigns it to specific
named units.

Calibration coefficients come from /WarReferences/WarReferences.md (the
18 historical analogs we ingested into the smart-search corpus). When a
new coefficient is needed, query the corpus first — don't hardcode unless
the value is universal (e.g. FM 3-90's 3:1 rule).
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import TYPE_CHECKING
from .world_state import PhaseMetrics, WorldState

if TYPE_CHECKING:
    pass  # avoid circular imports


# ============================================================================
# Doctrinal thresholds — defaults match FM 3-90 + ADP 3-90
# ============================================================================
# Overridable per-scenario via scenario.attack_ratio_decisive etc.
ATTACK_RATIO_DECISIVE = 3.0      # ≥ 3:1 → RED_ADV (attacker can decisively succeed)
ATTACK_RATIO_CONTESTED = 1.5     # 1.5–3:1 → CONTESTED
PREPARED_DEFENSE_MULT = 1.5      # Blue defender × 1.5 when prepared


# ============================================================================
# EW degradation coefficients
# ============================================================================
# When Red EW strength = 1.0, it degrades Blue combat power by 18%.
# When Blue EW strength = 1.0, it degrades Red combat power by 10%.
# Calibrated to typical operational EW effects.
EW_DEGRADE_RED_TO_BLUE = 0.18
EW_DEGRADE_BLUE_TO_RED = 0.10


# ============================================================================
# Per-phase state-evolution coefficients
# ============================================================================
# Calibration from WarReferences.md (historical analogs).
#
# MINES_CLEARED_PER_ACTIVE_PHASE: Wonsan 1950 — 5-10 MCM ships × 10-15
# mines/day each = ~60 mines/phase swept while clearance is actively underway.
# If Blue counter-fires from coast (also has `mines` component active), the
# rate is halved (Wonsan: minesweepers under coastal-artillery fire lost ~50%
# productivity).
MINES_CLEARED_PER_ACTIVE_PHASE = 60
MINES_CLEARED_HALVED_UNDER_FIRE = 30

# EW intensity (normalized 0..1) during an active jamming engagement.
# Calibrated to NATO SEAD doctrine — typical saturation = 0.6-0.8.
EW_INTENSITY_ACTIVE = 0.7
# Per-phase decay if EW not exercised — atmospheric/geo/temporal factors.
EW_PHASE_DECAY = 0.5


class ForceModel:
    """Computes per-phase metrics from the world state.

    Stateless. Reads WorldState; returns PhaseMetrics. Never mutates state.
    """

    def __init__(
        self,
        attack_ratio_decisive: float = ATTACK_RATIO_DECISIVE,
        attack_ratio_contested: float = ATTACK_RATIO_CONTESTED,
        prepared_defense_mult: float = PREPARED_DEFENSE_MULT,
    ) -> None:
        self.r_decisive = attack_ratio_decisive
        self.r_contested = attack_ratio_contested
        self.prep_def_mult = prepared_defense_mult

    def compute(self, world: WorldState, phase: int) -> PhaseMetrics:
        """Compute metrics for the given phase from current world state."""
        # Only-in-contact ratio (early phases when most Red units are still
        # in port/hangar) vs. total ratio (later phases when divisions land).
        only_in_contact = phase < 10

        red_power = world.total_power("RED", only_in_contact=only_in_contact)
        blue_power_base = world.total_power("BLUE", only_in_contact=only_in_contact)

        # Apply prepared-defense multiplier (Blue is the defender)
        blue_power = blue_power_base * self.prep_def_mult

        # Apply EW degradations
        blue_power *= (1 - EW_DEGRADE_RED_TO_BLUE * world.ew_strength_red)
        red_power *= (1 - EW_DEGRADE_BLUE_TO_RED * world.ew_strength_blue)

        # Avoid divide-by-zero
        fr_local = red_power / max(0.1, blue_power)
        red_total = world.total_power("RED")
        blue_total_base = world.total_power("BLUE")
        blue_total = blue_total_base * self.prep_def_mult
        blue_total *= (1 - EW_DEGRADE_RED_TO_BLUE * world.ew_strength_red)
        fr_op = world.total_power("RED") / max(0.1, blue_total_base)

        # Advantage label
        if fr_local >= self.r_decisive:
            label = "RED_ADV"
            reason = f"force ratio {fr_local:.2f}:1 ≥ {self.r_decisive}:1 — decisive attacker"
        elif fr_local >= self.r_contested:
            label = "CONTESTED"
            reason = f"force ratio {fr_local:.2f}:1 ∈ [{self.r_contested}:1, {self.r_decisive}:1] — contested"
        else:
            label = "BLUE_ADV"
            reason = f"force ratio {fr_local:.2f}:1 < {self.r_contested}:1 — Red approaching culmination"

        return PhaseMetrics(
            phase=phase,
            red_power_in_contact=round(red_power, 2),
            blue_power_in_contact=round(blue_power, 2),
            red_power_total=round(red_total, 2),
            blue_power_total=round(blue_total, 2),
            force_ratio_local=round(fr_local, 2),
            force_ratio_operational=round(fr_op, 2),
            ew_strength_red=world.ew_strength_red,
            ew_strength_blue=world.ew_strength_blue,
            blue_mines_remaining=world.blue_mines_remaining,
            advantage_label=label,
            advantage_reason_brief=reason,
        )

    # ------------------------------------------------------------------
    # Per-phase state evolution (mines, EW) driven by ACTIONS taken
    # ------------------------------------------------------------------
    def evolve_state(self, world: WorldState, phase_kind: str,
                      red_action, blue_reaction) -> dict:
        """Apply action-driven state deltas to the world AFTER unit outcomes
        are applied. Called once per phase by the orchestrator.

        Mines:
          Deplete when (phase is mine-clearance-like) OR (Red ran a `mines`
          component this phase). Blue counter-fire (Blue `mines` component
          active) halves the rate.

        EW:
          If a side ran an `ew` component this phase, ramp its EW intensity to
          EW_INTENSITY_ACTIVE (or keep higher if already higher).
          Otherwise decay by EW_PHASE_DECAY.

        Returns a dict describing what changed — for audit.
        """
        delta = {"mines_swept": 0,
                 "ew_red_before": world.ew_strength_red, "ew_red_after": 0.0,
                 "ew_blue_before": world.ew_strength_blue, "ew_blue_after": 0.0,
                 "mines_before": world.blue_mines_remaining,
                 "mines_after": world.blue_mines_remaining}

        # --- Mines ---
        red_did_mines = bool(_comp_active(red_action, "mines"))
        blue_did_mines = bool(_comp_active(blue_reaction, "mines"))
        clearance_phase = phase_kind in ("mine_clearance", "h_hour_strike", "beach_assault")
        if (clearance_phase or red_did_mines) and world.blue_mines_remaining > 0:
            rate = MINES_CLEARED_HALVED_UNDER_FIRE if blue_did_mines else MINES_CLEARED_PER_ACTIVE_PHASE
            swept = min(rate, world.blue_mines_remaining)
            world.blue_mines_remaining -= swept
            delta["mines_swept"] = swept
            delta["mines_after"] = world.blue_mines_remaining

        # --- EW ---
        red_did_ew = bool(_comp_active(red_action, "ew"))
        blue_did_ew = bool(_comp_active(blue_reaction, "ew"))
        if red_did_ew:
            world.ew_strength_red = max(world.ew_strength_red, EW_INTENSITY_ACTIVE)
        else:
            world.ew_strength_red = round(world.ew_strength_red * EW_PHASE_DECAY, 3)
        if blue_did_ew:
            world.ew_strength_blue = max(world.ew_strength_blue, EW_INTENSITY_ACTIVE)
        else:
            world.ew_strength_blue = round(world.ew_strength_blue * EW_PHASE_DECAY, 3)
        delta["ew_red_after"] = world.ew_strength_red
        delta["ew_blue_after"] = world.ew_strength_blue
        return delta


def _comp_active(turn_action, comp_name: str) -> bool:
    """Return True if the named component on a TurnAction is actively engaged
    (NOT an explicit hold).

    Hold-documentation entries (e.g. 'Held position — preserving reserve …')
    are non-null but don't produce kinetic effects, so the engine ignores them
    for state-evolution purposes.
    """
    if turn_action is None:
        return False
    if hasattr(turn_action, "components"):
        c = turn_action.components().get(comp_name)
        if c is None:
            return False
        what = (c.what or "").strip().lower()
    elif isinstance(turn_action, dict):
        c = turn_action.get(comp_name)
        if c is None:
            return False
        what = (c.get("what") or "").strip().lower()
    else:
        return False
    # Hold markers — any of these prefixes mean "documented inactivity"
    hold_prefixes = ("held position", "held in reserve", "hold position",
                     "hold in reserve", "holding position", "observe", "no engagement")
    return not any(what.startswith(p) for p in hold_prefixes)


# ============================================================================
# Smoke test
# ============================================================================
if __name__ == "__main__":
    from pathlib import Path
    from ..parsers.docx_parser import parse_docx_oob
    from ..parsers.scenario_parser import load_scenario
    from ..parsers.gis_loader import load_gis
    from .world_state import build_world_state_from_inputs

    project = Path(__file__).resolve().parent.parent.parent
    scenario = load_scenario(project / "inputs" / "scenario.json")
    red = parse_docx_oob(project / "inputs/forces/red_team.docx", "RED")
    blue = parse_docx_oob(project / "inputs/forces/blue_team.docx", "BLUE")
    gis = load_gis(project / "inputs" / "gis", tuple(scenario.bbox_wgs84))
    world = build_world_state_from_inputs(scenario, red, blue, gis)

    fm = ForceModel(
        attack_ratio_decisive=scenario.attack_ratio_decisive,
        attack_ratio_contested=scenario.attack_ratio_contested,
        prepared_defense_mult=scenario.prepared_defense_mult,
    )

    print("\n" + "=" * 72)
    print("  ForceModel metrics across all phases (no LLM)")
    print("=" * 72)
    print(f"{'phase':>5}  {'time':<8} {'FR_local':>8} {'FR_op':>8}  {'advantage':<10}  reason")
    print("-" * 90)
    for p in scenario.phases:
        m = fm.compute(world, p.step)
        print(f"{p.step:>5}  {p.time_label:<8} {m.force_ratio_local:>8.2f} {m.force_ratio_operational:>8.2f}  "
              f"{m.advantage_label:<10}  {m.advantage_reason_brief}")
