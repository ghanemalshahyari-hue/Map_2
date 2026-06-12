"""
scenario_parser.py — load + validate scenario.json.

The scenario file carries every geographic/temporal parameter that's not in
the force OOB DOCX or the GIS files. It's what makes the same code work on
different operations: drop a new scenario.json, get a new wargame.
"""
from __future__ import annotations
import json
import re
from pathlib import Path
from typing import Optional
from pydantic import BaseModel, Field, field_validator


# ============================================================================
# Pydantic schema
# ============================================================================

class Objective(BaseModel):
    id: str = Field(..., description="Short identifier, e.g. 'OBJ-X'")
    name_ar: str
    name_en: str = ""
    lon: float = Field(..., ge=-180.0, le=180.0)
    lat: float = Field(..., ge=-90.0, le=90.0)
    depth_km_from_coast: Optional[float] = Field(None, description="Inland depth in km")
    carver_total: Optional[int] = Field(None, ge=0, le=60, description="CARVER score sum")


class Phase(BaseModel):
    step: int = Field(..., ge=0, le=30)
    time_label: str = Field(..., description="e.g. 'D-7', 'D+24h'")
    phase_name_ar: str
    phase_name_en: str = ""
    kind: str = Field("", description="shaping | sead | naval_engagement | beach_assault | counterattack | culmination_check | final_resolution | ...")
    phase_line_km: float = Field(0.0, ge=0.0, description="Inland depth represented by this phase line in km")


class OffMapMarker(BaseModel):
    id: str
    name_ar: str
    lon: float = Field(..., ge=-180.0, le=180.0)
    lat: float = Field(..., ge=-90.0, le=90.0)
    side: str = Field(..., description="'RED' | 'BLUE'")
    type: str = Field(..., description="naval_base | air_base | ssm_brigade | logistics_node")


class Scenario(BaseModel):
    operation_name: str
    bbox_wgs84: list[float] = Field(..., min_length=4, max_length=4, description="[lon_min, lat_min, lon_max, lat_max]")
    coast_lat_approx: float = Field(..., description="Approximate coastline latitude for depth-from-coast computation")
    objective: Objective
    d_day_iso: str = Field(..., description="ISO 8601 D-day timestamp, e.g. '2026-05-20T00:00:00Z'")
    phases: list[Phase] = Field(..., min_length=1)
    off_map_markers: list[OffMapMarker] = Field(default_factory=list)
    # Doctrinal knobs (optional overrides for the engine defaults)
    attack_ratio_decisive: float = Field(3.0, gt=1.0)
    attack_ratio_contested: float = Field(1.5, gt=1.0)
    prepared_defense_mult: float = Field(1.5, gt=1.0)
    # PREGEN-CONTROL-2 (objective-relative force placement): the lon/lat delta
    # between the ACTIVE objective (after operator override) and the BASE
    # objective the force lay-down was authored around (scenario.json). The
    # GeoJSON writer translates every objective-derived position (units,
    # engagement arcs, phase lines, bases) by this delta so the whole operation
    # follows a moved objective while each unit keeps its offset from it. Zero
    # when no override is present → existing scenarios render identically.
    objective_shift_lon: float = 0.0
    objective_shift_lat: float = 0.0

    @field_validator("bbox_wgs84")
    @classmethod
    def _check_bbox(cls, v: list[float]) -> list[float]:
        if not (v[0] < v[2] and v[1] < v[3]):
            raise ValueError(f"bbox must be [lon_min, lat_min, lon_max, lat_max] with min<max; got {v}")
        return v

    def phase_by_step(self, step: int) -> Optional[Phase]:
        for p in self.phases:
            if p.step == step:
                return p
        return None

    def phases_count(self) -> int:
        return len(self.phases)


# ============================================================================
# Parser
# ============================================================================

def load_scenario(path: Path) -> Scenario:
    """Load + validate scenario.json."""
    if not path.exists():
        raise FileNotFoundError(f"scenario file not found: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    return Scenario.model_validate(data)


_OBJ_KEY_TO_FIELD = {
    "WG_OBJECTIVE_ID": "id",
    "WG_OBJECTIVE_NAME_AR": "name_ar",
    "WG_OBJECTIVE_NAME_EN": "name_en",
    "WG_OBJECTIVE_LON": "lon",
    "WG_OBJECTIVE_LAT": "lat",
    "WG_OBJECTIVE_DEPTH_KM": "depth_km_from_coast",
    "WG_OBJECTIVE_CARVER": "carver_total",
}


def extract_docx_objective_override(red_docx_path: Path) -> dict:
    """Read WG_OBJECTIVE_* metadata from red_team.docx.

    Expected lines in the DOCX (one per paragraph):
      WG_OBJECTIVE_ID=OBJ-X
      WG_OBJECTIVE_NAME_AR=...
      WG_OBJECTIVE_NAME_EN=...
      WG_OBJECTIVE_LON=19.55
      WG_OBJECTIVE_LAT=29.74
      WG_OBJECTIVE_DEPTH_KM=90.1
      WG_OBJECTIVE_CARVER=48
    """
    if not red_docx_path.exists():
        return {}
    try:
        from docx import Document
    except Exception as e:
        raise RuntimeError("python-docx is required to read objective override from red_team.docx") from e

    doc = Document(str(red_docx_path))
    raw: dict[str, str] = {}
    for p in doc.paragraphs:
        line = (p.text or "").strip()
        if not line or "=" not in line:
            continue
        k, v = line.split("=", 1)
        key = re.sub(r"\s+", "", k).upper()
        if key not in _OBJ_KEY_TO_FIELD:
            continue
        val = v.strip()
        if val:
            raw[key] = val

    if not raw:
        return {}

    out: dict = {}
    for k, v in raw.items():
        field = _OBJ_KEY_TO_FIELD[k]
        if field in ("lon", "lat", "depth_km_from_coast"):
            out[field] = float(v)
        elif field == "carver_total":
            out[field] = int(v)
        else:
            out[field] = v
    return out


def apply_docx_objective_override(scenario: Scenario, red_docx_path: Path) -> Scenario:
    """Return scenario with objective overridden from DOCX metadata when present."""
    override = extract_docx_objective_override(red_docx_path)
    if not override:
        return scenario

    merged_obj = scenario.objective.model_dump()
    merged_obj.update(override)
    for required in ("id", "name_ar", "lon", "lat"):
        if merged_obj.get(required) in (None, ""):
            raise RuntimeError(
                f"red_team.docx objective override missing required field: {required}"
            )

    payload = scenario.model_dump()
    payload["objective"] = merged_obj
    return Scenario.model_validate(payload)


def apply_json_objective_override(scenario: Scenario, overrides_path: Path) -> Scenario:
    """Return scenario with objective overridden from scenario_overrides.json when present.

    Written by the RMOOZ operator UI (PREGEN-CONTROL-2).  Has higher precedence
    than the DOCX-embedded metadata so the UI selection always wins.  Only fields
    present in the JSON are merged; required Scenario fields (e.g. name_ar) are
    preserved from the base scenario when absent from the override file.

    File format (written by RMOOZ):
        {
          "schema_version": "rmooz-operator-overrides-1.0",
          "objective": {"id": "OBJ-X", "lon": 20.63, "lat": 30.98, ...}
        }

    Returns the original scenario unchanged if the file is absent or has no
    objective block.
    """
    if not overrides_path or not overrides_path.exists():
        return scenario
    try:
        data = json.loads(overrides_path.read_text(encoding="utf-8"))
    except Exception:
        return scenario

    if not isinstance(data, dict):
        return scenario
    obj_data = data.get("objective")
    if not obj_data or not isinstance(obj_data, dict):
        return scenario

    # Start from the current objective so required fields are always present.
    merged = scenario.objective.model_dump()
    _FLOAT_FIELDS = {"lon", "lat", "depth_km_from_coast"}
    for field in ("id", "name_ar", "name_en", "lon", "lat", "depth_km_from_coast"):
        val = obj_data.get(field)
        if val is None:
            continue
        if field in _FLOAT_FIELDS:
            try:
                merged[field] = float(val)
            except (TypeError, ValueError):
                pass
        else:
            merged[field] = val

    payload = scenario.model_dump()
    payload["objective"] = merged
    return Scenario.model_validate(payload)


def apply_objective_shift(scenario: Scenario, base_lon: float, base_lat: float) -> Scenario:
    """Record the objective-relative placement delta on the scenario.

    PREGEN-CONTROL-2 (objective-relative force placement): `base_lon/base_lat`
    are the objective coordinates the force lay-down was authored around (the
    objective in scenario.json BEFORE any DOCX/operator override).  After all
    objective overrides have been applied, this records how far the ACTIVE
    objective moved, so the GeoJSON writer can translate every objective-derived
    position (units, engagement arcs, phase lines, bases) by the same delta —
    each unit keeps its offset from the objective and the whole operation
    follows the moved objective.

    No-op (shift stays 0) when the objective did not move, so scenarios without
    an override render byte-for-byte identically.
    """
    dx = scenario.objective.lon - base_lon
    dy = scenario.objective.lat - base_lat
    if dx == 0.0 and dy == 0.0:
        return scenario
    payload = scenario.model_dump()
    payload["objective_shift_lon"] = dx
    payload["objective_shift_lat"] = dy
    return Scenario.model_validate(payload)


# ============================================================================
# Sample scenario for Libya (reproduces Claude3 hardcoded constants)
# ============================================================================

LIBYA_SCENARIO_JSON = {
    "operation_name": "Gulf of Sidra 2026 — Amphibious Assault",
    "bbox_wgs84": [19.12, 29.50, 20.02, 30.56],
    "coast_lat_approx": 30.55,
    "objective": {
        "id": "OBJ-X",
        "name_ar": "الهدف X (نقطة الناصر-البريقة)",
        "name_en": "Objective X (Nasser-Brega pipeline midpoint)",
        "lon": 19.55,
        "lat": 29.74,
        "depth_km_from_coast": 90.1,
        "carver_total": 48
    },
    "d_day_iso": "2026-05-20T00:00:00Z",
    "phases": [
        {"step": 0,  "time_label": "D-7",     "phase_name_ar": "تمهيد - الوضع قبل العمليات",                         "kind": "shaping",               "phase_line_km": 0.0},
        {"step": 1,  "time_label": "D-5",     "phase_name_ar": "تبادل صواريخ استراتيجية",                              "kind": "strategic_strike",      "phase_line_km": 0.0},
        {"step": 2,  "time_label": "D-3",     "phase_name_ar": "حملة قمع الدفاع الجوي SEAD",                           "kind": "sead",                  "phase_line_km": 0.0},
        {"step": 3,  "time_label": "D-2",     "phase_name_ar": "اشتباك بحري سطحي + ASW",                                "kind": "naval_engagement",      "phase_line_km": 0.0},
        {"step": 4,  "time_label": "D-1",     "phase_name_ar": "تطهير حقول الألغام البحرية",                            "kind": "mine_clearance",        "phase_line_km": 0.0},
        {"step": 5,  "time_label": "D-H",     "phase_name_ar": "الضربة المركزة متعددة الاتجاهات + الإنزال",              "kind": "h_hour_strike",         "phase_line_km": 1.5},
        {"step": 6,  "time_label": "D+2h",    "phase_name_ar": "اقتحام الشاطئ - المرحلة 1 (طلائع)",                     "kind": "beach_assault",         "phase_line_km": 3.0},
        {"step": 7,  "time_label": "D+6h",    "phase_name_ar": "المرحلة 2أ - الموجة الرئيسية للفرقة 4",                  "kind": "main_wave",             "phase_line_km": 6.0},
        {"step": 8,  "time_label": "D+12h",   "phase_name_ar": "تكوين رأس الجسر",                                       "kind": "beachhead_consolidation","phase_line_km": 8.5},
        {"step": 9,  "time_label": "D+24h",   "phase_name_ar": "الهجوم الأزرق المضاد الأول (لواء 72 المدرع)",            "kind": "first_counterattack",   "phase_line_km": 9.5},
        {"step": 10, "time_label": "D+36h",   "phase_name_ar": "الفرقة 9 تلتحق - دفع 8-10 كم",                          "kind": "9mid_lands",            "phase_line_km": 14.0},
        {"step": 11, "time_label": "D+48h",   "phase_name_ar": "اندفاع نحو 40-50 كم",                                   "kind": "push_inland",           "phase_line_km": 28.0},
        {"step": 12, "time_label": "D+72h",   "phase_name_ar": "المرحلة 3 - الفرقة المدرعة 1 تنزل",                     "kind": "1ad_lands",             "phase_line_km": 50.0},
        {"step": 13, "time_label": "D+96h",   "phase_name_ar": "الاحتياطي الأزرق العملياتي (لواء 73)",                  "kind": "blue_op_reserve",       "phase_line_km": 65.0},
        {"step": 14, "time_label": "D+120h",  "phase_name_ar": "اقتراب من نقطة الانهيار",                                "kind": "culmination_check",     "phase_line_km": 80.0},
        {"step": 15, "time_label": "D+132h",  "phase_name_ar": "ضربة صواريخ أحمر نهائية + دفع أخير",                    "kind": "final_red_push",        "phase_line_km": 88.0},
        {"step": 16, "time_label": "D+144h",  "phase_name_ar": "الحسم النهائي عند الهدف X",                              "kind": "final_resolution",      "phase_line_km": 95.0},
    ],
    "off_map_markers": [
        {"id": "R-NAV-A", "name_ar": "قاعدة أ البحرية الحمراء", "side": "RED", "type": "naval_base", "lon": 18.30, "lat": 32.50},
        {"id": "R-NAV-B", "name_ar": "قاعدة ب البحرية الحمراء", "side": "RED", "type": "naval_base", "lon": 17.50, "lat": 32.00},
        {"id": "R-AB-A",  "name_ar": "القاعدة الجوية أ (أحمر)",  "side": "RED", "type": "air_base",   "lon": 18.00, "lat": 33.00},
        {"id": "R-AB-B",  "name_ar": "القاعدة الجوية ب (أحمر)",  "side": "RED", "type": "air_base",   "lon": 17.80, "lat": 32.70},
        {"id": "R-AB-C",  "name_ar": "القاعدة الجوية ج (أحمر)",  "side": "RED", "type": "air_base",   "lon": 18.20, "lat": 32.30},
        {"id": "R-SSM",   "name_ar": "لواء صواريخ أرض/أرض (أحمر) 500-600 كم", "side": "RED", "type": "ssm_brigade", "lon": 18.00, "lat": 32.00},
        {"id": "B-NAV",   "name_ar": "قاعدة بحرية زرقاء",         "side": "BLUE","type": "naval_base", "lon": 20.40, "lat": 29.10},
        {"id": "B-AB-A",  "name_ar": "القاعدة الجوية أ (أزرق)",    "side": "BLUE","type": "air_base",   "lon": 20.60, "lat": 29.30},
        {"id": "B-AB-B",  "name_ar": "القاعدة الجوية ب (أزرق)",    "side": "BLUE","type": "air_base",   "lon": 20.80, "lat": 29.20},
        {"id": "B-AB-C",  "name_ar": "القاعدة الجوية ج (أزرق)",    "side": "BLUE","type": "air_base",   "lon": 20.50, "lat": 28.90},
        {"id": "B-SSM",   "name_ar": "لواء صواريخ أرض/أرض (أزرق) 800-1000 كم", "side": "BLUE", "type": "ssm_brigade", "lon": 19.40, "lat": 29.50},
    ],
    "attack_ratio_decisive": 3.0,
    "attack_ratio_contested": 1.5,
    "prepared_defense_mult": 1.5,
}


def write_libya_sample(path: Path) -> None:
    """Write the Libya sample scenario to disk."""
    path.write_text(json.dumps(LIBYA_SCENARIO_JSON, ensure_ascii=False, indent=2), encoding="utf-8")


# ============================================================================
# Smoke test
# ============================================================================
if __name__ == "__main__":
    project = Path(__file__).resolve().parent.parent.parent
    out = project / "inputs" / "scenario.json"
    if not out.exists():
        write_libya_sample(out)
        print(f"Wrote sample scenario to {out}")
    s = load_scenario(out)
    print(f"\nLoaded scenario: {s.operation_name}")
    print(f"  bbox      : {s.bbox_wgs84}")
    print(f"  coast_lat : {s.coast_lat_approx}")
    print(f"  OBJ       : {s.objective.id} at ({s.objective.lon}, {s.objective.lat}), depth={s.objective.depth_km_from_coast} km")
    print(f"  D-day     : {s.d_day_iso}")
    print(f"  phases    : {s.phases_count()}")
    for p in s.phases[:3]:
        print(f"     step {p.step:2d}  {p.time_label:8s}  {p.phase_name_ar}")
    print(f"     ... ({len(s.phases)-3} more)")
    print(f"  off-map markers: {len(s.off_map_markers)}")
    for m in s.off_map_markers[:3]:
        print(f"     {m.id:8s}  ({m.lon}, {m.lat})  {m.name_ar}")
    print(f"  doctrinal thresholds: decisive={s.attack_ratio_decisive}, contested={s.attack_ratio_contested}, prep_def_mult={s.prepared_defense_mult}")
