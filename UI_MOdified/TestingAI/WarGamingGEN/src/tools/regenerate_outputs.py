"""
regenerate_outputs.py — rebuild CSV/MD/GeoJSON outputs from existing checkpoints.

Use cases:
  • The GeoJSON writer was updated (e.g. v1 → v2 with full force + arcs).
    You want fresh outputs from your prior run WITHOUT spending another
    ~$2.40 on the LLM. This script replays checkpoints into a clean world
    state, applying outcomes phase-by-phase, then re-invokes the writers.
  • You changed how the CSV / Markdown report is formatted.
  • You need to inspect a specific run's outputs after fixing a writer bug.

Costs:
  $0. No LLM calls. Parsers + writers only.

Usage:
  python -m src.tools.regenerate_outputs                          # use runs/latest
  python -m src.tools.regenerate_outputs --run-dir runs/<name>    # specific run

Output:
  Writes into <run_dir>/outputs/. Overwrites existing CSV/MD/GeoJSON files
  in that dir. The checkpoints, llm_audit, and run_index.json are untouched.
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path


def _find_latest_run_dir(project_root: Path) -> Path | None:
    runs_root = project_root / "runs"
    if not runs_root.exists():
        return None
    latest_txt = runs_root / "latest.txt"
    if latest_txt.exists():
        try:
            target_raw = latest_txt.read_text(encoding="utf-8").strip()
            if target_raw:
                target = Path(target_raw)
                if not target.is_absolute():
                    target = runs_root / target
                if target.exists() and target.is_dir():
                    return target.resolve()
        except OSError:
            pass
    latest = runs_root / "latest"
    if latest.is_symlink() or latest.is_dir():
        resolved = latest.resolve()
        if resolved.exists() and resolved.is_dir():
            return resolved
    candidates = [d for d in runs_root.iterdir() if d.is_dir() and d.name != "latest"]
    if not candidates:
        return None
    candidates.sort(key=lambda d: d.stat().st_mtime, reverse=True)
    return candidates[0]


def regenerate(run_dir: Path) -> int:
    """Replay checkpoints + rewrite outputs for one run dir."""
    project_root = Path(__file__).resolve().parent.parent.parent
    sys.path.insert(0, str(project_root))

    # Lazy imports — keep them after sys.path tweak
    from src.parsers.scenario_parser import load_scenario, apply_docx_objective_override, apply_json_objective_override, apply_objective_shift
    from src.parsers.docx_parser import parse_docx_oob
    from src.parsers.gis_loader import load_gis
    from src.state.world_state import build_world_state_from_inputs
    from src.state.force_model import ForceModel
    from src.llm.schemas import PhaseResolution, UnitOutcome
    from src.orchestrator import PhaseRecord, _inventory_for_side, _ammo_snapshot
    from src.output.csv_schedule import write_schedule_csv
    from src.output.markdown_report import write_markdown_report
    from src.output.geojson_writer import write_phase_geojsons

    ck_dir = run_dir / "checkpoints"
    if not ck_dir.exists():
        print(f"[regenerate] ERROR: no checkpoints at {ck_dir}")
        return 1
    files = sorted(ck_dir.glob("phase*.json"))
    if not files:
        print(f"[regenerate] ERROR: no phase*.json files in {ck_dir}")
        return 1
    print(f"[regenerate] run_dir = {run_dir}")
    print(f"[regenerate] {len(files)} checkpoint(s) found")

    # Rebuild world from inputs
    scenario = load_scenario(project_root / "inputs" / "scenario.json")
    # Base objective the force lay-down was authored around (before any override).
    _base_obj_lon, _base_obj_lat = scenario.objective.lon, scenario.objective.lat
    scenario = apply_docx_objective_override(
        scenario, project_root / "inputs/forces/red_team.docx"
    )
    # PREGEN-CONTROL-2: apply operator override (highest precedence) if present.
    scenario = apply_json_objective_override(
        scenario, project_root / "inputs" / "scenario_overrides.json"
    )
    # PREGEN-CONTROL-2: record objective-relative placement delta so units, arcs,
    # and phase lines follow the moved objective in the generated GeoJSON.
    scenario = apply_objective_shift(scenario, _base_obj_lon, _base_obj_lat)
    red_oob = parse_docx_oob(project_root / "inputs/forces/red_team.docx", "RED")
    blue_oob = parse_docx_oob(project_root / "inputs/forces/blue_team.docx", "BLUE")
    gis = load_gis(project_root / "inputs" / "gis", tuple(scenario.bbox_wgs84))
    world = build_world_state_from_inputs(scenario, red_oob, blue_oob, gis)
    fm = ForceModel(
        attack_ratio_decisive=scenario.attack_ratio_decisive,
        attack_ratio_contested=scenario.attack_ratio_contested,
        prepared_defense_mult=scenario.prepared_defense_mult,
    )
    print(f"[regenerate] world rebuilt — {len(world.units)} units")

    # Replay every checkpoint, applying outcomes + engine state evolution
    records: list[PhaseRecord] = []
    for f in files:
        data = json.loads(f.read_text(encoding="utf-8"))
        outcomes = [UnitOutcome(**o) for o in data["resolution"].get("unit_outcomes", [])]
        res = PhaseResolution(
            phase=data["resolution"]["phase"],
            combined_effect=data["resolution"]["combined_effect"],
            unit_outcomes=outcomes,
            step_advantage=data["resolution"]["step_advantage"],
            advantage_reason=data["resolution"]["advantage_reason"],
            force_ratio_local=data["resolution"]["force_ratio_local"],
            force_ratio_operational=data["resolution"]["force_ratio_operational"],
            mines_remaining=data["resolution"]["mines_remaining"],
            ew_strength_red=data["resolution"]["ew_strength_red"],
            ew_strength_blue=data["resolution"]["ew_strength_blue"],
        )
        world.current_phase = data["phase"]
        world.apply_resolution(res)

        # Re-apply engine state evolution (mines + EW deltas) — exact same
        # logic the orchestrator uses live, but we replay it from stored
        # red_action + blue_reaction dicts.
        fm.evolve_state(world, data.get("kind", ""), data["red_action"], data["blue_reaction"])

        # Rebuild snapshot data from the (now-mutated) world state
        inv_red = _inventory_for_side(world, "RED")
        inv_blue = _inventory_for_side(world, "BLUE")
        cum_red = sum(1 for e in world.losses_log if e.get("side") == "RED")
        cum_blue = sum(1 for e in world.losses_log if e.get("side") == "BLUE")

        rec = PhaseRecord(
            phase=data["phase"],
            time_label=data["time_label"],
            phase_name_ar=data["phase_name_ar"],
            phase_name_en=data.get("phase_name_en", ""),
            kind=data.get("kind", ""),
            phase_line_km=data.get("phase_line_km", 0.0),
            scene=data.get("scene", ""),
            metrics_before=data.get("metrics_before", {}),
            red_action=data["red_action"],
            blue_reaction=data["blue_reaction"],
            resolution=data["resolution"],
            snapshot_after=world.snapshot(),
            inventory_red=inv_red,
            inventory_blue=inv_blue,
            cum_losses_red=cum_red,
            cum_losses_blue=cum_blue,
            ammo_red=_ammo_snapshot(world, "RED"),
            ammo_blue=_ammo_snapshot(world, "BLUE"),
            wall_seconds=data.get("wall_seconds", 0.0),
        )
        records.append(rec)
        print(f"  [phase {rec.phase:2d}] {rec.time_label:8s} {rec.kind:25s} — "
              f"outcomes={len(outcomes)}  mines={world.blue_mines_remaining}  "
              f"EW R/B={world.ew_strength_red:.2f}/{world.ew_strength_blue:.2f}")

    # Rewrite all output files
    out_dir = run_dir / "outputs"
    out_dir.mkdir(parents=True, exist_ok=True)

    csv_path = out_dir / "wargameschedule.csv"
    n_rows = write_schedule_csv(records, csv_path)
    print(f"[regenerate] CSV  : {n_rows} rows → {csv_path}")

    md_path = out_dir / "wargame_report.md"
    n_chars = write_markdown_report(records, md_path, scenario.operation_name)
    print(f"[regenerate] MD   : {n_chars} chars → {md_path}")

    # IMPORTANT: For accurate per-phase positions, we'd need to walk the
    # checkpoints AGAIN inside the writer (so world reflects each phase
    # individually, not just final state). The current writer accepts this
    # limitation — the static spawn positions don't change per-phase EXCEPT
    # for our role-based interpolation logic (which only needs the phase
    # number, not the world state). So this is fine for v2.
    geo_dir = out_dir / "geojson"
    # First, reset world to a fresh state and re-replay phase-by-phase,
    # writing each phase's GeoJSON in order. This gives correct
    # current_strength / destroyed / damage flags per phase.
    fresh_world = build_world_state_from_inputs(scenario, red_oob, blue_oob, gis)
    n_files = _write_geojsons_phase_by_phase(fresh_world, fm, scenario, files, geo_dir)
    print(f"[regenerate] GEO  : {n_files} per-phase files (+1 combined) → {geo_dir}")

    print(f"\n[regenerate] DONE — outputs in {out_dir}")
    return 0


def _write_geojsons_phase_by_phase(world, fm, scenario, checkpoint_files, geo_dir):
    """Walk checkpoints in order, applying outcomes + writing one GeoJSON
    per phase. This gives every stepNN.geojson the correct LIVE world state
    for that phase (destroyed flags, current_strength, etc.)."""
    from src.llm.schemas import PhaseResolution, UnitOutcome
    from src.orchestrator import PhaseRecord
    from src.output.geojson_writer import write_phase_geojsons

    geo_dir = Path(geo_dir)
    geo_dir.mkdir(parents=True, exist_ok=True)

    records = []
    for f in checkpoint_files:
        data = json.loads(f.read_text(encoding="utf-8"))
        outcomes = [UnitOutcome(**o) for o in data["resolution"].get("unit_outcomes", [])]
        res = PhaseResolution(
            phase=data["resolution"]["phase"],
            combined_effect=data["resolution"]["combined_effect"],
            unit_outcomes=outcomes,
            step_advantage=data["resolution"]["step_advantage"],
            advantage_reason=data["resolution"]["advantage_reason"],
            force_ratio_local=data["resolution"]["force_ratio_local"],
            force_ratio_operational=data["resolution"]["force_ratio_operational"],
            mines_remaining=data["resolution"]["mines_remaining"],
            ew_strength_red=data["resolution"]["ew_strength_red"],
            ew_strength_blue=data["resolution"]["ew_strength_blue"],
        )
        # Apply BEFORE building record so the world reflects post-phase state
        world.current_phase = data["phase"]
        world.apply_resolution(res)
        fm.evolve_state(world, data.get("kind", ""), data["red_action"], data["blue_reaction"])

        rec = PhaseRecord(
            phase=data["phase"],
            time_label=data["time_label"],
            phase_name_ar=data["phase_name_ar"],
            phase_name_en=data.get("phase_name_en", ""),
            kind=data.get("kind", ""),
            phase_line_km=data.get("phase_line_km", 0.0),
            scene=data.get("scene", ""),
            metrics_before=data.get("metrics_before", {}),
            red_action=data["red_action"],
            blue_reaction=data["blue_reaction"],
            resolution=data["resolution"],
            snapshot_after=world.snapshot(),
            wall_seconds=data.get("wall_seconds", 0.0),
        )
        records.append(rec)

    # Now write_phase_geojsons walks records — for accurate per-phase state,
    # we need to reset world AGAIN and write each phase as its outcomes apply.
    # The writer's internal loop must own the apply-then-write sequence.
    return _write_with_per_phase_world(records, scenario, geo_dir, fm)


def _write_with_per_phase_world(records, scenario, geo_dir, fm):
    """Re-replay outcomes phase-by-phase, writing one GeoJSON between each
    apply. This is the only way to get accurate `current_strength` /
    `destroyed` flags in each step's GeoJSON.
    """
    from src.parsers.docx_parser import parse_docx_oob
    from src.parsers.gis_loader import load_gis
    from src.state.world_state import build_world_state_from_inputs
    from src.llm.schemas import PhaseResolution, UnitOutcome
    from src.output.geojson_writer import _build_feature_collection, _compute_unit_position, _shift_xy
    import json

    project_root = Path(__file__).resolve().parent.parent.parent
    red_oob = parse_docx_oob(project_root / "inputs/forces/red_team.docx", "RED")
    blue_oob = parse_docx_oob(project_root / "inputs/forces/blue_team.docx", "BLUE")
    gis = load_gis(project_root / "inputs" / "gis", tuple(scenario.bbox_wgs84))
    world = build_world_state_from_inputs(scenario, red_oob, blue_oob, gis)

    # Seed shifted (PREGEN-CONTROL-2) to match shifted curr positions on phase 0.
    prev_positions = {u.uid: _shift_xy(u.lon, u.lat, scenario) for u in world.units.values()}
    n = 0
    all_features = []

    for rec in records:
        # Apply this phase's outcomes BEFORE rendering, so destroyed/damaged
        # flags reflect what JUST happened.
        outcomes = [UnitOutcome(**o) for o in rec.resolution.get("unit_outcomes", [])]
        res = PhaseResolution(
            phase=rec.resolution["phase"],
            combined_effect=rec.resolution["combined_effect"],
            unit_outcomes=outcomes,
            step_advantage=rec.resolution["step_advantage"],
            advantage_reason=rec.resolution["advantage_reason"],
            force_ratio_local=rec.resolution["force_ratio_local"],
            force_ratio_operational=rec.resolution["force_ratio_operational"],
            mines_remaining=rec.resolution["mines_remaining"],
            ew_strength_red=rec.resolution["ew_strength_red"],
            ew_strength_blue=rec.resolution["ew_strength_blue"],
        )
        world.current_phase = rec.phase
        world.apply_resolution(res)
        fm.evolve_state(world, rec.kind, rec.red_action, rec.blue_reaction)

        curr_positions = {
            uid: _compute_unit_position(world.units[uid], rec, scenario)
            for uid in world.units
        }
        fc = _build_feature_collection(rec, world, scenario, curr_positions, prev_positions)
        path = geo_dir / f"step{rec.phase:02d}.geojson"
        path.write_text(json.dumps(fc, ensure_ascii=False, indent=2), encoding="utf-8")
        all_features.extend(fc["features"])
        prev_positions = curr_positions
        n += 1

    # Combined
    (geo_dir / "all_phases.geojson").write_text(
        json.dumps({
            "type": "FeatureCollection",
            "name": "all_phases",
            "properties": {"version": 2, "operation_name": scenario.operation_name},
            "features": all_features,
        }, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )
    return n


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-dir", type=str, default=None,
                    help="Path to run dir. Default: runs/latest")
    args = ap.parse_args()
    project_root = Path(__file__).resolve().parent.parent.parent
    if args.run_dir:
        run_dir = Path(args.run_dir).resolve()
    else:
        run_dir = _find_latest_run_dir(project_root)
        if run_dir is None:
            print("[regenerate] no runs/ dir found", file=sys.stderr)
            sys.exit(1)
    sys.exit(regenerate(run_dir))
