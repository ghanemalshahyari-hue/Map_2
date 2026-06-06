"""
test_one_phase.py — Run ONE phase end-to-end with all 3 agents.

Compares the LLM output against the kind of quality we got in Claude3:
  • Specific UIDs (not vague "Red forces")
  • Doctrine citations (FM 3-90, AJP-3.1, calibration coefficients)
  • Per-component coverage (multiple of strategic/maritime/air/mines/usv_uav/sof/land/ew filled)
  • Adjudicator echoes engine force ratios verbatim
  • Adjudicator's unit_outcomes reference real UIDs

We pick Phase 5 (D-H — multi-vector strike + landing) since it's the most
complex phase and matches what Claude3 produced as its largest narrative.
"""
from __future__ import annotations
import sys
import json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.parsers.docx_parser import parse_docx_oob
from src.parsers.scenario_parser import load_scenario, apply_docx_objective_override
from src.parsers.gis_loader import load_gis
from src.state.world_state import build_world_state_from_inputs
from src.state.force_model import ForceModel
from src.llm.client import LLMClient
from src.agents.red_agent import RedAgent
from src.agents.blue_agent import BlueAgent
from src.agents.adjudicator import Adjudicator


PHASE_TO_TEST = 5  # D-H multi-vector strike + landing


def main() -> int:
    project = Path(__file__).resolve().parent.parent
    print("=" * 80)
    print(f"  Single-phase end-to-end test — Phase {PHASE_TO_TEST}")
    print("=" * 80)

    # ----------------------------------------------------------------------
    # Setup
    # ----------------------------------------------------------------------
    scenario = load_scenario(project / "inputs" / "scenario.json")
    scenario = apply_docx_objective_override(
        scenario, project / "inputs/forces/red_team.docx"
    )
    red_oob = parse_docx_oob(project / "inputs/forces/red_team.docx", "RED")
    blue_oob = parse_docx_oob(project / "inputs/forces/blue_team.docx", "BLUE")
    gis = load_gis(project / "inputs" / "gis", tuple(scenario.bbox_wgs84))
    world = build_world_state_from_inputs(scenario, red_oob, blue_oob, gis)
    fm = ForceModel(
        attack_ratio_decisive=scenario.attack_ratio_decisive,
        attack_ratio_contested=scenario.attack_ratio_contested,
        prepared_defense_mult=scenario.prepared_defense_mult,
    )
    audit_dir = Path(__file__).resolve().parent / "one_phase_audit"
    llm = LLMClient(audit_dir=audit_dir)

    red = RedAgent(llm, world, scenario)
    blue = BlueAgent(llm, world, scenario)
    judge = Adjudicator(llm, world, scenario)

    phase = scenario.phase_by_step(PHASE_TO_TEST)
    assert phase is not None
    metrics = fm.compute(world, phase.step)
    print(f"\n  Phase: {phase.step} ({phase.time_label}) — kind={phase.kind} — {phase.phase_name_ar}")
    print(f"  Engine metrics:")
    print(f"    force_ratio_local = {metrics.force_ratio_local}:1 ({metrics.advantage_label})")
    print(f"    force_ratio_op    = {metrics.force_ratio_operational}:1")
    print(f"    EW R/B = {metrics.ew_strength_red:.2f} / {metrics.ew_strength_blue:.2f}")
    print(f"    Mines = {metrics.blue_mines_remaining}/400")

    # ----------------------------------------------------------------------
    # STEP 1 — Adjudicator scene setter
    # ----------------------------------------------------------------------
    print("\n[1] Adjudicator scene-setter…")
    scene = judge.scene_setter(phase, metrics)
    print(f"    {scene}")

    # ----------------------------------------------------------------------
    # STEP 2 — Red acts
    # ----------------------------------------------------------------------
    print("\n[2] Red agent acts (RedAgent.act)…")
    red_result = red.act(phase, metrics, prior_blue_actions=None)
    red_action = red_result.output
    print(f"    Doctrine chunks retrieved: {len(red_result.retrieved_chunks)}")
    print(f"    Red overall intent: {red_action.overall_intent}")
    n_red_components = sum(1 for c in red_action.components().values() if c is not None)
    print(f"    Red components active: {n_red_components}/8")
    for cn, comp in red_action.components().items():
        if comp is None: continue
        print(f"      [{cn}] actor={comp.actor} → {comp.what[:100]}")

    # ----------------------------------------------------------------------
    # STEP 3 — Blue reacts
    # ----------------------------------------------------------------------
    print("\n[3] Blue agent reacts (BlueAgent.react)…")
    blue_result = blue.react(phase, metrics, red_action)
    blue_reaction = blue_result.output
    print(f"    Doctrine chunks retrieved: {len(blue_result.retrieved_chunks)}")
    print(f"    Blue overall intent: {blue_reaction.overall_intent}")
    n_blue_components = sum(1 for c in blue_reaction.components().values() if c is not None)
    print(f"    Blue components active: {n_blue_components}/8")
    for cn, comp in blue_reaction.components().items():
        if comp is None: continue
        print(f"      [{cn}] actor={comp.actor} → {comp.what[:100]}")

    # ----------------------------------------------------------------------
    # STEP 4 — Adjudicator resolves
    # ----------------------------------------------------------------------
    print("\n[4] Adjudicator resolves (Adjudicator.resolve)…")
    res_result = judge.resolve(phase, metrics, red_action, blue_reaction)
    resolution = res_result.output
    print(f"    Doctrine chunks retrieved: {len(res_result.retrieved_chunks)}")
    print(f"    Combined effect: {resolution.combined_effect[:240]}")
    print(f"    Step advantage : {resolution.step_advantage} — {resolution.advantage_reason}")
    print(f"    Unit outcomes  : {len(resolution.unit_outcomes)}")
    for u in resolution.unit_outcomes[:8]:
        print(f"      {u.unit_uid}: {u.status_change} ({u.damage_pct:.0%}) by {u.cause_actor} — {u.cause_what[:80]}")

    # ----------------------------------------------------------------------
    # Quality checks vs Claude3 bar
    # ----------------------------------------------------------------------
    print("\n" + "=" * 80)
    print("  QUALITY CHECKS")
    print("=" * 80)

    # Pull all UIDs that exist in the OOB
    all_uids = {u.uid for u in world.units.values()}
    red_uids = {u.uid for u in world.units.values() if u.side == "RED"}
    blue_uids = {u.uid for u in world.units.values() if u.side == "BLUE"}

    # Check Red used real UIDs
    red_actors_used = [c.actor for c in red_action.components().values() if c is not None]
    red_valid_uids = [a for a in red_actors_used if a in red_uids]

    # Check Blue used real UIDs
    blue_actors_used = [c.actor for c in blue_reaction.components().values() if c is not None]
    blue_valid_uids = [a for a in blue_actors_used if a in blue_uids]

    # Adjudicator referenced real UIDs
    adj_uids_used = [u.unit_uid for u in resolution.unit_outcomes]
    adj_valid_uids = [u for u in adj_uids_used if u in all_uids]

    checks = [
        ("Red active components ≥ 3 (Claude3 baseline)", n_red_components >= 3),
        ("Blue active components ≥ 2 (Claude3 baseline)", n_blue_components >= 2),
        ("Red actors ≥ 80% real UIDs", len(red_valid_uids) >= 0.8 * len(red_actors_used) if red_actors_used else False),
        ("Blue actors ≥ 80% real UIDs", len(blue_valid_uids) >= 0.8 * len(blue_actors_used) if blue_actors_used else False),
        ("Adjudicator outcomes ≥ 80% real UIDs", len(adj_valid_uids) >= 0.8 * len(adj_uids_used) if adj_uids_used else False),
        ("Adjudicator has ≥ 2 unit_outcomes", len(resolution.unit_outcomes) >= 2),
        ("Force ratio echoed verbatim", resolution.force_ratio_local == metrics.force_ratio_local),
        ("Mines remaining echoed verbatim", resolution.mines_remaining == metrics.blue_mines_remaining),
        ("Combined effect ≥ 80 chars", len(resolution.combined_effect) >= 80),
        ("Advantage call matches engine", resolution.step_advantage == metrics.advantage_label),
        ("Doctrine citations present in Red actions", any(c.doctrine_cited for c in red_action.components().values() if c)),
        ("Doctrine citations present in Blue actions", any(c.doctrine_cited for c in blue_reaction.components().values() if c)),
    ]

    passed = 0
    for name, ok in checks:
        if ok: passed += 1
        print(f"  {'✓' if ok else '✗'}  {name}")
    print("=" * 80)
    print(f"  Result: {passed}/{len(checks)} quality checks passed")
    print("=" * 80)

    # Save full transcript for review
    transcript = project / "tests" / "one_phase_transcript.json"
    transcript.write_text(json.dumps({
        "phase": phase.step,
        "engine_metrics": {
            "force_ratio_local": metrics.force_ratio_local,
            "force_ratio_operational": metrics.force_ratio_operational,
            "advantage_label": metrics.advantage_label,
        },
        "scene": scene,
        "red_action": red_action.model_dump(),
        "blue_reaction": blue_reaction.model_dump(),
        "resolution": resolution.model_dump(),
        "checks": [(name, bool(ok)) for name, ok in checks],
        "passed": passed,
        "total": len(checks),
    }, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
    print(f"\n  Full transcript saved to: {transcript}")

    return 0 if passed >= len(checks) - 2 else 1


if __name__ == "__main__":
    raise SystemExit(main())
