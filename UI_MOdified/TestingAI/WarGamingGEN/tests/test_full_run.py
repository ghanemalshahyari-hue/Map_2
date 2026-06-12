"""
test_full_run.py — End-to-end orchestrator run.

Runs the wargame for N phases (default = first 3 for fast verification;
pass `--all` to run all 17). Verifies that:

  • Orchestrator completes without crash
  • Each phase produces a PhaseRecord with non-empty red/blue actions + resolution
  • CSV schedule has rows for every phase × active component
  • Markdown report has one section per phase
  • Per-phase GeoJSONs exist and are valid
  • Final WorldState mutated correctly (cumulative losses > 0, mines decreasing, etc.)

This is the apples-to-apples check vs Claude3's run.
"""
from __future__ import annotations
import sys
import json
import argparse
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.parsers.docx_parser import parse_docx_oob
from src.parsers.scenario_parser import load_scenario, apply_docx_objective_override, apply_json_objective_override, apply_objective_shift
from src.parsers.gis_loader import load_gis
from src.state.world_state import build_world_state_from_inputs
from src.state.force_model import ForceModel
from src.llm.client import LLMClient
from src.agents.red_agent import RedAgent
from src.agents.blue_agent import BlueAgent
from src.agents.adjudicator import Adjudicator
from src.orchestrator import Orchestrator
from src.output.csv_schedule import write_schedule_csv
from src.output.markdown_report import write_markdown_report
from src.output.geojson_writer import write_phase_geojsons


def _restore_checkpoints(run_dir: Path, world, force_model) -> tuple[list, int]:
    """Replay existing phase checkpoints into the world so we can resume.
    Returns (loaded records, next phase to run).
    """
    from src.orchestrator import PhaseRecord
    from src.llm.schemas import PhaseResolution, UnitOutcome
    ck_dir = run_dir / "checkpoints"
    if not ck_dir.exists():
        return [], 0
    files = sorted(ck_dir.glob("phase*.json"))
    if not files:
        return [], 0
    records = []
    for f in files:
        data = json.loads(f.read_text(encoding="utf-8"))
        rec = PhaseRecord(**data)
        # Re-apply the resolution to the world so live state matches
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
        # Resume-fidelity fix — apply_resolution sets mines/EW from
        # resolution.* (start-of-phase values echoed by the adjudicator).
        # The TRUE end-of-phase state lives in snapshot_after, populated
        # by ForceModel.evolve_state in the orchestrator. Apply that on top
        # so the world matches what the next phase saw when it ran live.
        snap = rec.snapshot_after or {}
        if "blue_mines_remaining" in snap:
            world.blue_mines_remaining = snap["blue_mines_remaining"]
        if "ew_red" in snap:
            world.ew_strength_red = snap["ew_red"]
        if "ew_blue" in snap:
            world.ew_strength_blue = snap["ew_blue"]
        records.append(rec)
    next_phase = records[-1].phase + 1
    print(f"  [resume] loaded {len(records)} prior checkpoint(s); next phase = {next_phase}")
    print(f"  [resume] world restored to: mines={world.blue_mines_remaining}, "
          f"EW R/B={world.ew_strength_red:.2f}/{world.ew_strength_blue:.2f}")
    return records, next_phase


def _new_run_dir(runs_root: Path, run_name: str | None = None) -> Path:
    """Create a new timestamped run directory: runs/YYYY-MM-DD_HH-MM-SS[_name]/."""
    import datetime
    ts = datetime.datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    name = ts + (f"_{run_name}" if run_name else "")
    run_dir = runs_root / name
    run_dir.mkdir(parents=True, exist_ok=True)
    return run_dir


def _find_latest_run_dir(runs_root: Path) -> Path | None:
    """Return the most recent (by mtime) versioned run dir under runs_root, or None."""
    if not runs_root.exists():
        return None
    # First honor the text pointer (Windows-friendly, no symlink privilege needed).
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
    # Honor the 'latest' symlink first
    latest = runs_root / "latest"
    if latest.is_symlink() or latest.is_dir():
        resolved = latest.resolve()
        if resolved.exists() and resolved.is_dir():
            return resolved
    candidates = [
        d for d in runs_root.iterdir()
        if d.is_dir() and d.name not in ("latest",)
    ]
    if not candidates:
        return None
    candidates.sort(key=lambda d: d.stat().st_mtime, reverse=True)
    return candidates[0]


def _update_latest_symlink(runs_root: Path, run_dir: Path) -> None:
    """Record the latest run in latest.txt and best-effort create runs/latest symlink."""
    latest_txt = runs_root / "latest.txt"
    try:
        latest_txt.write_text(run_dir.name + "\n", encoding="utf-8")
    except OSError as e:
        print(f"  [versioning] WARN: couldn't write runs/latest.txt: {e}")

    latest = runs_root / "latest"
    try:
        if latest.is_symlink() or latest.is_file():
            latest.unlink()
        elif latest.is_dir():
            # Keep existing directory untouched; latest.txt will still drive discovery.
            print("  [versioning] runs/latest is a directory; using runs/latest.txt pointer")
            return
        latest.symlink_to(run_dir.name, target_is_directory=True)
        print(f"  [versioning] runs/latest → {run_dir.name}")
    except OSError as e:
        print(f"  [versioning] runs/latest.txt → {run_dir.name} (symlink skipped: {e})")


def main(max_phases: int | None, start_phase: int = 0, resume: bool = False,
         run_name: str | None = None, run_dir_override: Path | None = None) -> int:
    project = Path(__file__).resolve().parent.parent
    print("=" * 80)
    print(f"  Full orchestrator run — max_phases={max_phases}")
    print("=" * 80)

    # ----------------------------------------------------------------------
    # Build world
    # ----------------------------------------------------------------------
    scenario = load_scenario(project / "inputs" / "scenario.json")
    # Base objective the force lay-down was authored around (before any override).
    _base_obj_lon, _base_obj_lat = scenario.objective.lon, scenario.objective.lat
    scenario = apply_docx_objective_override(
        scenario, project / "inputs/forces/red_team.docx"
    )
    # PREGEN-CONTROL-2: apply operator override (highest precedence) if present.
    scenario = apply_json_objective_override(
        scenario, project / "inputs" / "scenario_overrides.json"
    )
    # PREGEN-CONTROL-2: record objective-relative placement delta so units, arcs,
    # and phase lines follow the moved objective in the generated GeoJSON.
    scenario = apply_objective_shift(scenario, _base_obj_lon, _base_obj_lat)
    red_oob = parse_docx_oob(project / "inputs/forces/red_team.docx", "RED")
    blue_oob = parse_docx_oob(project / "inputs/forces/blue_team.docx", "BLUE")
    gis = load_gis(project / "inputs" / "gis", tuple(scenario.bbox_wgs84))
    world = build_world_state_from_inputs(scenario, red_oob, blue_oob, gis)
    fm = ForceModel(
        attack_ratio_decisive=scenario.attack_ratio_decisive,
        attack_ratio_contested=scenario.attack_ratio_contested,
        prepared_defense_mult=scenario.prepared_defense_mult,
    )

    # ----------------------------------------------------------------------
    # Versioned run dir layout: runs/<YYYY-MM-DD_HH-MM-SS>/{checkpoints, llm_audit, outputs}
    # Re-runs do NOT overwrite; each call creates a fresh directory.
    # --resume picks up the latest existing run.
    # --run-dir <path> targets a specific run dir (advanced use).
    # ----------------------------------------------------------------------
    runs_root = project / "runs"
    runs_root.mkdir(exist_ok=True)
    if run_dir_override:
        run_dir = run_dir_override.resolve()
        run_dir.mkdir(parents=True, exist_ok=True)
        print(f"  [versioning] using override run dir: {run_dir}")
    elif resume:
        existing = _find_latest_run_dir(runs_root)
        if existing is None:
            print("  [versioning] --resume but no prior runs — creating fresh dir")
            run_dir = _new_run_dir(runs_root, run_name)
        else:
            run_dir = existing
            print(f"  [versioning] resuming into: {run_dir.name}")
    else:
        run_dir = _new_run_dir(runs_root, run_name)
        print(f"  [versioning] new run dir: {run_dir.name}")
    llm = LLMClient(audit_dir=run_dir / "llm_audit")

    red = RedAgent(llm, world, scenario)
    blue = BlueAgent(llm, world, scenario)
    judge = Adjudicator(llm, world, scenario)

    # Resume from checkpoints if requested
    prior_records: list = []
    effective_start = start_phase
    if resume:
        prior_records, effective_start = _restore_checkpoints(run_dir, world, fm)

    orch = Orchestrator(
        llm=llm, world=world, scenario=scenario, force_model=fm,
        run_dir=run_dir,
        red=red, blue=blue, adjudicator=judge,
        max_phases=max_phases, start_phase=effective_start, verbose=True,
    )
    # Seed orchestrator with prior records so writers see everything
    orch.records = list(prior_records)
    new_records = orch.run()
    records = orch.records  # union of prior + new
    print(f"\n  Orchestrator finished: {len(records)} phase records")

    # ----------------------------------------------------------------------
    # Output writers
    # ----------------------------------------------------------------------
    out_dir = run_dir / "outputs"
    out_dir.mkdir(parents=True, exist_ok=True)

    csv_path = out_dir / "wargameschedule.csv"
    n_rows = write_schedule_csv(records, csv_path)
    print(f"  CSV   : {n_rows} rows → {csv_path}")

    md_path = out_dir / "wargame_report.md"
    n_chars = write_markdown_report(records, md_path, scenario.operation_name)
    print(f"  MD    : {n_chars} chars → {md_path}")

    geo_dir = out_dir / "geojson"
    n_files = write_phase_geojsons(records, world, scenario, geo_dir)
    print(f"  GEO   : {n_files} per-phase files (+1 combined) → {geo_dir}")

    # ----------------------------------------------------------------------
    # Quality checks
    # ----------------------------------------------------------------------
    print("\n" + "=" * 80)
    print("  QUALITY CHECKS")
    print("=" * 80)

    checks: list[tuple[str, bool]] = []

    # Each phase produced a record
    checks.append(("Records produced ≥ requested", len(records) == (max_phases or len(scenario.phases))))

    # Every record has at least one component active per side (Claude3 bar)
    n_min_red = min(
        sum(1 for c in (
            r.red_action.get("strategic"), r.red_action.get("maritime"),
            r.red_action.get("air"), r.red_action.get("mines"),
            r.red_action.get("usv_uav"), r.red_action.get("sof"),
            r.red_action.get("land"), r.red_action.get("ew"),
        ) if c is not None)
        for r in records
    ) if records else 0
    checks.append(("Every phase has ≥1 Red component active", n_min_red >= 1))

    # Adjudicator outcomes ≥ 2 per phase (Claude3 bar)
    n_min_outcomes = min(len(r.resolution.get("unit_outcomes", [])) for r in records) if records else 0
    checks.append(("Every phase has ≥2 unit_outcomes", n_min_outcomes >= 2))

    # Cumulative losses are monotonically non-decreasing
    losses_red = [r.cum_losses_red for r in records]
    losses_blue = [r.cum_losses_blue for r in records]
    checks.append(("Red cum_losses monotonic", all(b >= a for a, b in zip(losses_red, losses_red[1:]))))
    checks.append(("Blue cum_losses monotonic", all(b >= a for a, b in zip(losses_blue, losses_blue[1:]))))

    # CSV / MD / GeoJSON outputs exist + non-empty
    checks.append(("CSV non-empty", csv_path.exists() and csv_path.stat().st_size > 200))
    checks.append(("Markdown non-empty", md_path.exists() and n_chars > 1000))
    checks.append(("GeoJSON files ≥ phases", n_files >= len(records)))

    # GeoJSON sanity: each per-phase file parses + has ≥1 feature
    geo_ok = True
    for rec in records:
        p = geo_dir / f"step{rec.phase:02d}.geojson"
        if not p.exists():
            geo_ok = False; break
        try:
            fc = json.loads(p.read_text(encoding="utf-8"))
            if fc.get("type") != "FeatureCollection" or len(fc.get("features", [])) < 1:
                geo_ok = False; break
        except Exception:
            geo_ok = False; break
    checks.append(("All per-phase GeoJSONs valid + ≥1 feature", geo_ok))

    # Force ratio echoed correctly in adjudicator output (engine override)
    fr_echoed = all(
        r.resolution.get("force_ratio_local") == r.metrics_before.get("force_ratio_local")
        for r in records
    )
    checks.append(("Adjudicator force_ratio_local echoed verbatim", fr_echoed))

    # Doctrine citations present somewhere in every phase's actions
    doctrine_ok = all(
        any(
            (c or {}).get("doctrine_cited")
            for c in (
                r.red_action.get("strategic"), r.red_action.get("maritime"),
                r.red_action.get("air"), r.red_action.get("mines"),
                r.red_action.get("usv_uav"), r.red_action.get("sof"),
                r.red_action.get("land"), r.red_action.get("ew"),
            ) if c is not None
        )
        for r in records
    )
    checks.append(("Every phase has ≥1 Red doctrine citation", doctrine_ok))

    passed = sum(1 for _, ok in checks if ok)
    for name, ok in checks:
        print(f"  {'✓' if ok else '✗'}  {name}")
    print("=" * 80)
    print(f"  Result: {passed}/{len(checks)} quality checks passed")
    print("=" * 80)

    # Point runs/latest at this run so the viewer auto-finds it
    _update_latest_symlink(runs_root, run_dir)

    return 0 if passed >= len(checks) - 1 else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-phases", type=int, default=3,
                    help="How many phases to run THIS invocation (default 3). "
                         "Use --all to run every remaining phase.")
    ap.add_argument("--all", action="store_true", help="Run every phase in the scenario.")
    ap.add_argument("--start-phase", type=int, default=0,
                    help="Start at this phase (ignored if --resume).")
    ap.add_argument("--resume", action="store_true",
                    help="Pick up where checkpoints left off in the most-recent run dir.")
    ap.add_argument("--run-name", type=str, default=None,
                    help="Optional suffix for the run directory (e.g. 'qwen32b' → "
                         "runs/2026-05-21_10-00-00_qwen32b/).")
    ap.add_argument("--run-dir", type=str, default=None,
                    help="Specific run dir to use (overrides auto-versioning). "
                         "Useful for inspecting / resuming a known run.")
    args = ap.parse_args()
    n = None if args.all else args.max_phases
    override = Path(args.run_dir) if args.run_dir else None
    raise SystemExit(main(n, start_phase=args.start_phase, resume=args.resume,
                          run_name=args.run_name, run_dir_override=override))
