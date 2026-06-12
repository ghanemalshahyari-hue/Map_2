"""
orchestrator.py — turn-by-turn wargame engine.

Owns the per-phase loop:
  1. ForceModel.compute(world, phase)              → engine metrics
  2. Adjudicator.scene_setter(phase, metrics)      → 2-sentence opener (no JSON)
  3. RedAgent.act(phase, metrics, prior_blue)      → Red's TurnAction
  4. BlueAgent.react(phase, metrics, red_action)   → Blue's TurnAction (fog of war on Red reasoning)
  5. Adjudicator.resolve(phase, metrics, red, blue)→ PhaseResolution
  6. WorldState.apply_resolution(resolution)       → mutate state for next phase

After each phase we persist a checkpoint JSON so a mid-run crash doesn't
lose the work; after the final phase we kick the output writers (CSV +
Markdown + per-phase GeoJSONs).

Scenario-portable by design: nothing here knows it's Libya. Whatever
phases the Scenario carries, this loop runs.
"""
from __future__ import annotations
import json
import sys
import time
import traceback
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional

from .parsers.scenario_parser import Scenario, Phase
from .state.world_state import WorldState, PhaseMetrics
from .state.force_model import ForceModel
from .llm.client import LLMClient
from .llm.schemas import TurnAction, PhaseResolution
from .agents.red_agent import RedAgent
from .agents.blue_agent import BlueAgent
from .agents.adjudicator import Adjudicator

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


# ============================================================================
# Per-phase record
# ============================================================================

@dataclass
class PhaseRecord:
    """Everything that happened in one phase. Persisted to disk after each turn."""
    phase: int
    time_label: str
    phase_name_ar: str
    phase_name_en: str
    kind: str
    phase_line_km: float
    scene: str
    metrics_before: dict           # PhaseMetrics serialized
    red_action: dict               # TurnAction serialized
    blue_reaction: dict            # TurnAction serialized
    resolution: dict               # PhaseResolution serialized
    snapshot_after: dict           # WorldState.snapshot() after applying resolution
    inventory_red: dict = field(default_factory=dict)    # per-side detailed inventory
    inventory_blue: dict = field(default_factory=dict)
    cum_losses_red: int = 0
    cum_losses_blue: int = 0
    ammo_red: dict = field(default_factory=dict)         # magazine totals, airframes, hulls
    ammo_blue: dict = field(default_factory=dict)
    wall_seconds: float = 0.0

    def to_dict(self) -> dict:
        return asdict(self)


# ============================================================================
# Orchestrator
# ============================================================================

class Orchestrator:
    """Runs the wargame phase-by-phase. Single point of state mutation
    is WorldState.apply_resolution() — invoked here, not in the agents.
    """

    def __init__(
        self,
        llm: LLMClient,
        world: WorldState,
        scenario: Scenario,
        force_model: ForceModel,
        run_dir: Path,
        red: Optional[RedAgent] = None,
        blue: Optional[BlueAgent] = None,
        adjudicator: Optional[Adjudicator] = None,
        max_phases: Optional[int] = None,
        start_phase: int = 0,
        verbose: bool = True,
    ) -> None:
        self.llm = llm
        self.world = world
        self.scenario = scenario
        self.fm = force_model
        self.run_dir = Path(run_dir)
        self.run_dir.mkdir(parents=True, exist_ok=True)
        (self.run_dir / "checkpoints").mkdir(parents=True, exist_ok=True)
        # Agents — allow caller-provided (with custom temperatures/etc.) or build defaults
        self.red = red or RedAgent(llm, world, scenario)
        self.blue = blue or BlueAgent(llm, world, scenario)
        self.judge = adjudicator or Adjudicator(llm, world, scenario)
        self.max_phases = max_phases
        self.start_phase = start_phase
        self.verbose = verbose
        # Records accumulate across the run
        self.records: list[PhaseRecord] = []
        # Build the list of prior Blue actions we feed to Red — fog-of-war-safe
        # (Red sees what Blue published, not Blue's reasoning).
        self._prior_blue_summaries: list[dict] = []

    # -----------------------------------------------------------------
    # Public entry point
    # -----------------------------------------------------------------
    def run(self) -> list[PhaseRecord]:
        """Run every phase in scenario.phases (or until max_phases reached).

        Returns the list of PhaseRecord objects collected.
        """
        phases = sorted(self.scenario.phases, key=lambda p: p.step)
        phases = [p for p in phases if p.step >= self.start_phase]
        if self.max_phases is not None:
            phases = phases[: self.max_phases]

        self._log(f"\n{'=' * 80}")
        self._log(f"  Wargame orchestrator — {self.scenario.operation_name}")
        self._log(f"  Phases to run: {len(phases)} (start={self.start_phase}, "
                  f"max_phases={self.max_phases})")
        self._log(f"  Run dir: {self.run_dir}")
        self._log(f"{'=' * 80}\n")

        for phase in phases:
            try:
                rec = self.run_phase(phase)
                self.records.append(rec)
                self._persist_checkpoint(rec)
            except Exception as e:
                self._log(f"  [FATAL] phase {phase.step} crashed: {e}")
                self._log(traceback.format_exc())
                # Persist what we have and re-raise
                self._persist_index()
                raise

        self._persist_index()
        return self.records

    # -----------------------------------------------------------------
    # One phase
    # -----------------------------------------------------------------
    def run_phase(self, phase: Phase) -> PhaseRecord:
        t0 = time.time()
        self.world.current_phase = phase.step
        metrics = self.fm.compute(self.world, phase.step)

        self._log(f"--- Phase {phase.step} ({phase.time_label}) — {phase.kind} ---")
        self._log(f"    {phase.phase_name_ar}")
        self._log(f"    FR_local={metrics.force_ratio_local}:1  "
                  f"FR_op={metrics.force_ratio_operational}:1  "
                  f"adv={metrics.advantage_label}")
        self._log(f"    EW R/B={metrics.ew_strength_red:.2f}/{metrics.ew_strength_blue:.2f}  "
                  f"mines={metrics.blue_mines_remaining}")

        # 1) Adjudicator scene setter (cheap, no schema)
        scene = self.judge.scene_setter(phase, metrics)
        self._log(f"    scene: {scene[:140]}")

        # 2) Red acts — sees prior phases' Blue published actions
        red_result = self.red.act(phase, metrics, prior_blue_actions=self._prior_blue_summaries)
        red_action: TurnAction = red_result.output
        n_red = sum(1 for c in red_action.components().values() if c is not None)
        self._log(f"    Red:  {n_red}/8 components active — '{red_action.overall_intent[:80]}'")

        # 3) Blue reacts — sees Red's just-played action (but NOT Red's reasoning)
        blue_result = self.blue.react(phase, metrics, red_action)
        blue_reaction: TurnAction = blue_result.output
        n_blue = sum(1 for c in blue_reaction.components().values() if c is not None)
        self._log(f"    Blue: {n_blue}/8 components active — '{blue_reaction.overall_intent[:80]}'")

        # 4) Adjudicator resolves
        res_result = self.judge.resolve(phase, metrics, red_action, blue_reaction)
        resolution: PhaseResolution = res_result.output
        self._log(f"    Resolution: {len(resolution.unit_outcomes)} outcomes — "
                  f"{resolution.step_advantage}")
        self._log(f"    Effect: {resolution.combined_effect[:200]}")

        # 5) Mutate world — the ONLY place state changes
        self.world.apply_resolution(resolution)

        # 5b) Engine-side state evolution (mines depletion, EW ramp/decay).
        # This runs AFTER apply_resolution so unit outcomes land first.
        # Without this, mines/EW are stuck because the adjudicator output is
        # force-overridden to the same value the engine fed in (closed loop).
        state_delta = self.fm.evolve_state(
            self.world, phase.kind or "", red_action, blue_reaction
        )
        if state_delta.get("mines_swept"):
            self._log(f"    [engine] mines swept this phase: {state_delta['mines_swept']} "
                      f"({state_delta['mines_before']}→{state_delta['mines_after']})")
        if (state_delta.get("ew_red_after") != state_delta.get("ew_red_before")
            or state_delta.get("ew_blue_after") != state_delta.get("ew_blue_before")):
            self._log(f"    [engine] EW evolved: R "
                      f"{state_delta['ew_red_before']:.2f}→{state_delta['ew_red_after']:.2f}, "
                      f"B {state_delta['ew_blue_before']:.2f}→{state_delta['ew_blue_after']:.2f}")

        # 6) Update fog-of-war record so Red can see Blue's published actions next phase
        self._prior_blue_summaries.append({
            "phase": phase.step,
            "summary": _summarize_action_for_fogofwar(blue_reaction),
        })
        # Keep memory bounded — last 5 only (Red doesn't realistically remember
        # Blue's every move across a week of operations)
        self._prior_blue_summaries = self._prior_blue_summaries[-5:]

        wall = time.time() - t0
        self._log(f"    [{wall:.1f}s] world snapshot: {self.world.snapshot()}\n")

        # Per-side inventory + cumulative loss + ammo snapshots — used by CSV writer
        inv_red = _inventory_for_side(self.world, "RED")
        inv_blue = _inventory_for_side(self.world, "BLUE")
        cum_red = sum(1 for e in self.world.losses_log if e.get("side") == "RED")
        cum_blue = sum(1 for e in self.world.losses_log if e.get("side") == "BLUE")
        ammo_red = _ammo_snapshot(self.world, "RED")
        ammo_blue = _ammo_snapshot(self.world, "BLUE")

        return PhaseRecord(
            phase=phase.step,
            time_label=phase.time_label,
            phase_name_ar=phase.phase_name_ar,
            phase_name_en=phase.phase_name_en or "",
            kind=phase.kind or "",
            phase_line_km=phase.phase_line_km,
            scene=scene,
            metrics_before=_metrics_to_dict(metrics),
            red_action=red_action.model_dump(),
            blue_reaction=blue_reaction.model_dump(),
            resolution=resolution.model_dump(),
            snapshot_after=self.world.snapshot(),
            inventory_red=inv_red,
            inventory_blue=inv_blue,
            cum_losses_red=cum_red,
            cum_losses_blue=cum_blue,
            ammo_red=ammo_red,
            ammo_blue=ammo_blue,
            wall_seconds=round(wall, 2),
        )

    # -----------------------------------------------------------------
    # Persistence
    # -----------------------------------------------------------------
    def _persist_checkpoint(self, rec: PhaseRecord) -> None:
        """Write one phase's record to disk so we can resume / inspect."""
        path = self.run_dir / "checkpoints" / f"phase{rec.phase:02d}.json"
        path.write_text(
            json.dumps(rec.to_dict(), ensure_ascii=False, indent=2, default=str),
            encoding="utf-8",
        )

    def _persist_index(self) -> None:
        """Write an index summarizing the whole run for fast loading by writers."""
        idx = {
            "operation_name": self.scenario.operation_name,
            "n_phases_run": len(self.records),
            "phases": [
                {
                    "phase": r.phase,
                    "time_label": r.time_label,
                    "phase_name_ar": r.phase_name_ar,
                    "kind": r.kind,
                    "step_advantage": r.resolution.get("step_advantage"),
                    "n_unit_outcomes": len(r.resolution.get("unit_outcomes", [])),
                    "force_ratio_local": r.metrics_before.get("force_ratio_local"),
                    "wall_seconds": r.wall_seconds,
                }
                for r in self.records
            ],
            "losses_log_total": len(self.world.losses_log),
        }
        path = self.run_dir / "run_index.json"
        path.write_text(json.dumps(idx, ensure_ascii=False, indent=2), encoding="utf-8")
        self._log(f"  [persist] {len(self.records)} phase records → {self.run_dir}")

    # -----------------------------------------------------------------
    # Misc
    # -----------------------------------------------------------------
    def _log(self, msg: str) -> None:
        if self.verbose:
            print(msg)


# ============================================================================
# Helpers
# ============================================================================

def _metrics_to_dict(m: PhaseMetrics) -> dict:
    return {
        "phase": m.phase,
        "red_power_in_contact": m.red_power_in_contact,
        "blue_power_in_contact": m.blue_power_in_contact,
        "red_power_total": m.red_power_total,
        "blue_power_total": m.blue_power_total,
        "force_ratio_local": m.force_ratio_local,
        "force_ratio_operational": m.force_ratio_operational,
        "ew_strength_red": m.ew_strength_red,
        "ew_strength_blue": m.ew_strength_blue,
        "blue_mines_remaining": m.blue_mines_remaining,
        "advantage_label": m.advantage_label,
        "advantage_reason_brief": m.advantage_reason_brief,
    }


def _inventory_for_side(world: WorldState, side: str) -> dict:
    """Per-domain alive/total counts + aggregate combat power. Real data,
    pulled live from world.units — no hardcoded magic numbers."""
    out = {"by_domain": {}, "alive_total": 0, "destroyed_total": 0, "power_total": 0.0}
    for dom in ("strategic", "naval", "air", "ground", "sof"):
        units = [u for u in world.units.values() if u.side == side and u.domain == dom]
        alive = [u for u in units if not u.destroyed]
        out["by_domain"][dom] = {
            "alive": len(alive),
            "total": len(units),
            "power": round(sum(u.effective_power() for u in alive), 2),
        }
        out["alive_total"] += len(alive)
        out["destroyed_total"] += (len(units) - len(alive))
        out["power_total"] += sum(u.effective_power() for u in alive)
    out["power_total"] = round(out["power_total"], 2)
    return out


def _ammo_snapshot(world: WorldState, side: str) -> dict:
    """Aggregate magazines / airframes / hulls remaining for a side.
    Real data from world.units — used in CSV ammo columns."""
    mag_total = 0
    air_total = 0
    hulls_total = 0
    for u in world.units.values():
        if u.side != side or u.destroyed: continue
        if u.magazine is not None: mag_total += u.magazine
        if u.airframes is not None: air_total += u.airframes
        if u.hulls_remaining is not None: hulls_total += u.hulls_remaining
    return {
        "magazines_remaining": mag_total,
        "airframes_remaining": air_total,
        "hulls_remaining": hulls_total,
    }


def _summarize_action_for_fogofwar(ta: TurnAction) -> str:
    """Build a Red-observable summary of Blue's action.
    Red sees WHAT Blue did, NOT Blue's why/intended_effect/doctrine."""
    parts = []
    for cn, comp in ta.components().items():
        if comp is None: continue
        parts.append(f"[{cn}] {comp.actor}: {comp.what[:90]}")
    if not parts:
        return "(no observable Blue activity)"
    return " | ".join(parts)
