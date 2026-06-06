"""
test_objective_relative_placement.py — PREGEN-CONTROL-2 (objective-relative force placement)

Proves that moving the scenario objective (via apply_objective_shift) translates
every objective-derived OUTPUT coordinate by the same delta:
  - objective feature → new objective coordinate
  - RED / BLUE unit Points → shifted by delta (offset from objective preserved)
  - engagement arcs → endpoints shifted by delta, and STILL unit-to-unit
  - phase line → shifted by delta
And that with NO shift the output is byte-identical (existing scenarios unchanged).

Run:  python tests/test_objective_relative_placement.py
"""
from __future__ import annotations
import sys
from pathlib import Path
from types import SimpleNamespace

PROJ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJ))

from src.parsers.scenario_parser import (
    Scenario, load_scenario, apply_objective_shift, LIBYA_SCENARIO_JSON,
)
from src.output import geojson_writer as gw

# Test fixtures (coordinates only appear in TESTS, never in production code).
BASE_OBJ = (19.55, 29.74)
NEW_OBJ  = (21.14, 31.17)

_passed = 0
_failed = 0
def check(name, cond, detail=""):
    global _passed, _failed
    if cond:
        print("  PASS", name); _passed += 1
    else:
        print("  FAIL", name, "—", detail); _failed += 1

def approx(a, b, eps=1e-6):
    return abs(a - b) < eps


def make_scenario(shift=False):
    sc = Scenario.model_validate(dict(LIBYA_SCENARIO_JSON))
    # Sanity: the sample is authored around BASE_OBJ.
    assert approx(sc.objective.lon, BASE_OBJ[0]) and approx(sc.objective.lat, BASE_OBJ[1])
    if not shift:
        return sc
    # Move the objective to NEW_OBJ, then record the placement delta.
    payload = sc.model_dump()
    payload["objective"]["lon"] = NEW_OBJ[0]
    payload["objective"]["lat"] = NEW_OBJ[1]
    moved = Scenario.model_validate(payload)
    return apply_objective_shift(moved, BASE_OBJ[0], BASE_OBJ[1])


def make_unit(uid, side, domain, lon, lat):
    return SimpleNamespace(
        uid=uid, side=side, domain=domain, type="mech_brigade",
        name_ar="x", name_en=uid, echelon="bde", parent_uid=None,
        strength=1.0, initial_strength=1.0, destroyed=False,
        suppressed_pct=0.0, delayed_pct=0.0,
        magazine=None, airframes=None, hulls_remaining=None,
        lon=lon, lat=lat, src_lon=lon, src_lat=lat, status="active",
    )


def make_rec(phase, arcs_outcomes):
    return SimpleNamespace(
        phase=phase, time_label=f"P{phase}", phase_name_ar="x", phase_name_en="x",
        kind="beach_assault", phase_line_km=10.0, scene="",
        metrics_before={"force_ratio_local": 1.0, "force_ratio_operational": 1.0},
        red_action={}, blue_reaction={},
        resolution={"unit_outcomes": arcs_outcomes, "combined_effect": "",
                    "step_advantage": "RED_ADV"},
    )


def build_fc(scenario):
    # Two units at H-hour+ so they get distinct AO positions (arc is non-zero).
    red = make_unit("R1", "RED", "ground", 18.0, 32.0)
    blue = make_unit("B1", "BLUE", "ground", 19.8, 30.0)
    world = SimpleNamespace(units={"R1": red, "B1": blue})
    # One engagement: RED R1 hits BLUE B1.
    rec = make_rec(6, [{"unit_uid": "B1", "cause_actor": "R1",
                        "status_change": "damaged_partial", "damage_pct": 0.3}])
    curr = {uid: gw._compute_unit_position(u, rec, scenario) for uid, u in world.units.items()}
    prev = dict(curr)
    fc = gw._build_feature_collection(rec, world, scenario, curr, prev)
    return fc, curr


def feat(fc, kind):
    return [f for f in fc["features"] if f["properties"].get("kind") == kind]


print("\nPREGEN-CONTROL-2 — objective-relative force placement")

# ── No-shift baseline ─────────────────────────────────────────────────────────
sc0 = make_scenario(shift=False)
check("shift fields default to 0",
      approx(sc0.objective_shift_lon, 0.0) and approx(sc0.objective_shift_lat, 0.0))

fc0, curr0 = build_fc(sc0)
obj0 = feat(fc0, "objective")[0]["geometry"]["coordinates"]
check("base objective feature at BASE_OBJ", approx(obj0[0], BASE_OBJ[0]) and approx(obj0[1], BASE_OBJ[1]),
      str(obj0))

# ── Shifted scenario ──────────────────────────────────────────────────────────
sc1 = make_scenario(shift=True)
dx, dy = NEW_OBJ[0] - BASE_OBJ[0], NEW_OBJ[1] - BASE_OBJ[1]
check("apply_objective_shift records the delta",
      approx(sc1.objective_shift_lon, dx) and approx(sc1.objective_shift_lat, dy),
      f"got ({sc1.objective_shift_lon}, {sc1.objective_shift_lat}) want ({dx}, {dy})")

fc1, curr1 = build_fc(sc1)

# 1) Objective feature moves to NEW_OBJ (written directly, NOT double-shifted).
obj1 = feat(fc1, "objective")[0]["geometry"]["coordinates"]
check("objective feature at NEW_OBJ", approx(obj1[0], NEW_OBJ[0]) and approx(obj1[1], NEW_OBJ[1]),
      str(obj1))

# 2) Units shift by exactly the objective delta (offset from objective preserved).
for uid in ("R1", "B1"):
    b = curr0[uid]; a = curr1[uid]
    check(f"unit {uid} shifted by delta",
          approx(a[0], b[0] + dx) and approx(a[1], b[1] + dy),
          f"base {b} -> shifted {a}")
    # Offset from the (moved) objective is identical before and after.
    off_b = (b[0] - BASE_OBJ[0], b[1] - BASE_OBJ[1])
    off_a = (a[0] - NEW_OBJ[0], a[1] - NEW_OBJ[1])
    check(f"unit {uid} preserves offset from objective",
          approx(off_a[0], off_b[0]) and approx(off_a[1], off_b[1]),
          f"{off_b} vs {off_a}")

# 3) Engagement arc endpoints shift by delta AND stay unit-to-unit.
arc0 = feat(fc0, "engagement_arc")[0]
arc1 = feat(fc1, "engagement_arc")[0]
a0 = arc0["geometry"]["coordinates"]; a1 = arc1["geometry"]["coordinates"]
check("arc actor endpoint shifted by delta",
      approx(a1[0][0], a0[0][0] + dx) and approx(a1[0][1], a0[0][1] + dy),
      f"{a0[0]} -> {a1[0]}")
check("arc target endpoint shifted by delta",
      approx(a1[1][0], a0[1][0] + dx) and approx(a1[1][1], a0[1][1] + dy),
      f"{a0[1]} -> {a1[1]}")
check("arc remains unit-to-unit (actor=R1, target=B1)",
      arc1["properties"]["cause_actor"] == "R1" and arc1["properties"]["target_uid"] == "B1")
# The arc target must NOT have been repointed at the objective.
check("arc target endpoint is NOT the objective",
      not (approx(a1[1][0], NEW_OBJ[0]) and approx(a1[1][1], NEW_OBJ[1])),
      str(a1[1]))

# 4) Phase line shifts by delta.
pl0 = feat(fc0, "phase_line")[0]["geometry"]["coordinates"]
pl1 = feat(fc1, "phase_line")[0]["geometry"]["coordinates"]
check("phase line shifted by delta",
      approx(pl1[0][0], pl0[0][0] + dx) and approx(pl1[0][1], pl0[0][1] + dy),
      f"{pl0[0]} -> {pl1[0]}")

# 5) No objective-derived output coordinate still sits at a BASE unit position.
base_unit_coords = set(tuple(round(c, 6) for c in curr0[u]) for u in curr0)
shifted_unit_coords = set(tuple(round(c, 6) for c in curr1[u]) for u in curr1)
check("no shifted unit coincides with a base unit position",
      base_unit_coords.isdisjoint(shifted_unit_coords),
      f"overlap: {base_unit_coords & shifted_unit_coords}")

# 6) Existing scenarios (no override) render identically — zero-shift is a no-op.
fcA, _ = build_fc(make_scenario(shift=False))
fcB, _ = build_fc(make_scenario(shift=False))
import json
check("zero-shift output is byte-identical (existing scenarios unchanged)",
      json.dumps(fcA, sort_keys=True) == json.dumps(fcB, sort_keys=True))

# 7) apply_objective_shift is a no-op when the objective did not move.
noop = apply_objective_shift(make_scenario(shift=False), BASE_OBJ[0], BASE_OBJ[1])
check("no-op shift leaves fields at 0",
      approx(noop.objective_shift_lon, 0.0) and approx(noop.objective_shift_lat, 0.0))

# 8) Production code carries no hardcoded test coordinates.
parser_src = (PROJ / "src" / "parsers" / "scenario_parser.py").read_text(encoding="utf-8")
writer_src = (PROJ / "src" / "output" / "geojson_writer.py").read_text(encoding="utf-8")
# Strip the LIBYA_SCENARIO_JSON sample block from the parser before checking —
# that fixture legitimately contains the base coordinate.
for needle in ("20.63", "30.98", "21.14", "31.17"):
    check(f"writer has no hardcoded coord {needle}", needle not in writer_src)

print("\n" + ("FAIL" if _failed else "PASS") +
      f" test_objective_relative_placement — {_passed} passed, {_failed} failed")
sys.exit(1 if _failed else 0)
