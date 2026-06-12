"""
build_bootstrap.py — package the wargame run for the 3D viewer.

Reads (defaults to the latest run via runs/latest symlink):
  - <run_dir>/outputs/geojson/step*.geojson  (per-phase features)
  - <run_dir>/checkpoints/phase*.json        (engagement narrative + metrics)
  - inputs/scenario.json                      (bbox, objective, off-map markers)

Writes:
  - viewer/data/bootstrap.js     (single self-contained JS file)

Why a single bootstrap.js?
  Browsers block fetch() against file:// URLs for security. Bundling
  everything as `window.WARGAME_DATA = {...}` in one JS file means the
  viewer works by just double-clicking viewer/index.html — no local
  web server needed.

Usage:
  python viewer/build_bootstrap.py                              # latest run
  python viewer/build_bootstrap.py --run-dir runs/2026-05-21_*  # specific run

Idempotent. Re-run after every wargame run to refresh the viewer's data.
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
    latest = runs_root / "latest"
    if latest.is_symlink() or latest.is_dir():
        resolved = latest.resolve()
        if resolved.exists() and resolved.is_dir():
            return resolved
    candidates = [d for d in runs_root.iterdir() if d.is_dir() and d.name != "latest"]
    if not candidates:
        # Legacy fallback — old single-dir layout
        legacy = project_root / "tests" / "full_run_audit"
        return legacy if legacy.exists() else None
    candidates.sort(key=lambda d: d.stat().st_mtime, reverse=True)
    return candidates[0]


def build(project_root: Path, run_dir: Path | None = None) -> int:
    project_root = project_root.resolve()
    if run_dir is None:
        run_dir = _find_latest_run_dir(project_root)
        if run_dir is None:
            print("[bootstrap] ERROR: no run dir found under runs/ — "
                  "run tests/test_full_run.py first")
            return 1
        print(f"[bootstrap] using latest run dir: {run_dir.name}")
    else:
        run_dir = run_dir.resolve()
        if not run_dir.exists():
            print(f"[bootstrap] ERROR: run_dir does not exist: {run_dir}")
            return 1
        print(f"[bootstrap] using specified run dir: {run_dir.name}")
    geo_dir = run_dir / "outputs" / "geojson"
    ck_dir = run_dir / "checkpoints"
    scenario_path = project_root / "inputs" / "scenario.json"

    if not geo_dir.exists():
        print(f"[bootstrap] ERROR: no GeoJSON dir at {geo_dir}")
        return 1
    if not scenario_path.exists():
        print(f"[bootstrap] ERROR: no scenario.json at {scenario_path}")
        return 1

    scenario = json.loads(scenario_path.read_text(encoding="utf-8"))

    # Build the per-phase payload — merge GeoJSON features + checkpoint metadata
    phases_data = []
    geo_files = sorted(geo_dir.glob("step*.geojson"))
    for f in geo_files:
        fc = json.loads(f.read_text(encoding="utf-8"))
        meta = fc.get("properties", {})
        step = meta.get("phase")
        # Pull richer narrative + outcomes from the checkpoint
        ck_file = ck_dir / f"phase{step:02d}.json"
        ck = json.loads(ck_file.read_text(encoding="utf-8")) if ck_file.exists() else {}
        phases_data.append({
            "step": step,
            "time_label": meta.get("time_label", ""),
            "phase_name_ar": meta.get("phase_name_ar", ""),
            "phase_name_en": ck.get("phase_name_en", ""),
            "kind": meta.get("kind", ""),
            "phase_line_km": meta.get("phase_line_km", 0),
            "combined_effect": meta.get("combined_effect", ""),
            "step_advantage": meta.get("step_advantage", ""),
            "force_ratio_local": meta.get("force_ratio_local", 0),
            "force_ratio_operational": meta.get("force_ratio_operational", 0),
            "metrics": ck.get("metrics_before", {}),
            "snapshot_after": ck.get("snapshot_after", {}),
            "scene": ck.get("scene", ""),
            "red_intent": ck.get("red_action", {}).get("overall_intent", ""),
            "blue_intent": ck.get("blue_reaction", {}).get("overall_intent", ""),
            "unit_outcomes": ck.get("resolution", {}).get("unit_outcomes", []),
            "advantage_reason": ck.get("resolution", {}).get("advantage_reason", ""),
            "cum_losses_red": ck.get("cum_losses_red", 0),
            "cum_losses_blue": ck.get("cum_losses_blue", 0),
            "features": fc["features"],
        })

    # Build aggregated unit list (spawn positions) — for "initial state" rendering
    # First phase's features include actors/affected at their spawn positions
    all_units_seen: dict[str, dict] = {}
    for ph in phases_data:
        for feat in ph["features"]:
            props = feat["properties"]
            if props.get("kind") in ("actor_unit", "affected_unit"):
                uid = props.get("uid")
                if uid and uid not in all_units_seen:
                    all_units_seen[uid] = {
                        "uid": uid,
                        "side": props.get("side"),
                        "domain": props.get("domain"),
                        "type": props.get("type"),
                        "name_ar": props.get("name_ar", ""),
                        "lon": feat["geometry"]["coordinates"][0],
                        "lat": feat["geometry"]["coordinates"][1],
                    }
    units_list = list(all_units_seen.values())

    # Compose the bootstrap payload
    payload = {
        "operation_name": scenario.get("operation_name", ""),
        "bbox": scenario.get("bbox_wgs84", []),
        "coast_lat_approx": scenario.get("coast_lat_approx", 0.0),
        "objective": scenario.get("objective", {}),
        "off_map_markers": scenario.get("off_map_markers", []),
        "d_day_iso": scenario.get("d_day_iso", ""),
        "units": units_list,                # all unit spawn positions seen across phases
        "phases": phases_data,
    }

    # Write as a JS module that defines window.WARGAME_DATA
    out_dir = project_root / "viewer" / "data"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "bootstrap.js"
    js_blob = (
        "// Auto-generated by viewer/build_bootstrap.py — do not hand-edit.\n"
        "// Regenerate after each wargame run.\n\n"
        f"window.WARGAME_DATA = {json.dumps(payload, ensure_ascii=False, indent=2)};\n"
    )
    out_path.write_text(js_blob, encoding="utf-8")
    print(f"[bootstrap] wrote {out_path}")
    print(f"  Operation : {payload['operation_name']}")
    print(f"  Bbox      : {payload['bbox']}")
    print(f"  Phases    : {len(phases_data)}")
    print(f"  Units     : {len(units_list)} unique spawn positions")
    print(f"  Total features : {sum(len(p['features']) for p in phases_data)}")
    print(f"  Total outcomes : {sum(len(p['unit_outcomes']) for p in phases_data)}")
    print(f"  Size      : {out_path.stat().st_size / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--run-dir", type=str, default=None,
                    help="Path to a specific run directory. "
                         "Default: runs/latest (most recent).")
    args = ap.parse_args()
    project = Path(__file__).resolve().parent.parent
    rd = Path(args.run_dir) if args.run_dir else None
    raise SystemExit(build(project, run_dir=rd))
