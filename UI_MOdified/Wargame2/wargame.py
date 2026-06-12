"""
Terrain-informed Wargame2 generator for the Brega-Ajdabiya amphibious scenario.

This script is intentionally self-contained for Wargame2. It reads the source
NATO overlay, the local GIS layers under Wargame1/gis/gis, selects four landing
sites from the source coastal trace, applies terrain/mobility adjudication, and
regenerates:

  Wargame2/bls_selection.geojson
  Wargame2/terrain_reference.geojson
  Wargame2/step00.geojson ... step11.geojson
  Wargame2/step00.png/jpeg ... step11.png/jpeg
"""

from __future__ import annotations

from dataclasses import dataclass, field
from io import BytesIO
from pathlib import Path
import copy
import json
import math
import textwrap
import urllib.request

from PIL import Image, ImageDraw, ImageEnhance, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "Wargame2"
SOURCE_GEOJSON = ROOT / "nato-map-layers.geojson"
ENEMY_DOCX = ROOT / "enemy.docx"
GIS_DIR = ROOT / "Wargame1" / "gis" / "gis"
LANDUSE = GIS_DIR / "landuse.geojson"
INLAND_WATER = GIS_DIR / "inland_water.geojson"
WATER_WAY = GIS_DIR / "water_way.geojson"
SATELLITE_BASE = OUT_DIR / "satellite_base.jpeg"

MODEL_VERSION = "brega-wargame2-gis-v1.0"
MAP_BBOX = (19.12, 29.50, 20.02, 30.56)  # lon W, lat S, lon E, lat N
IMAGE_SIZE = (2400, 1350)
PANEL_W = 620
MAP_W = IMAGE_SIZE[0] - PANEL_W
MAP_H = IMAGE_SIZE[1]

# Approximate public pipeline route. Coordinates are lon, lat.
PIPELINE_ROUTE = [
    (19.6091, 30.4102),
    (19.6064, 30.3963),
    (19.7163, 30.2585),
    (19.8173, 29.8705),
    (19.8831, 29.7740),
    (19.8126, 29.4964),
    (19.8145, 29.4575),
    (19.8141, 29.2898),
    (19.8234, 29.1452),
    (19.8175, 29.1246),
    (19.8144, 29.0667),
    (19.7948, 29.0027),
    (19.7798, 28.9833),
    (19.7810, 28.9384516),
    (19.7701, 28.9162),
]

OBJ_NASSER = {
    "name": "OBJ NASSER-95",
    "coord": (19.842646921904134, 29.614712418731745),
    "target_depth_km": 95,
    "radius_km": 5.0,
}

HARD_WATER = {"wetland_saltmarsh", "wetland_marsh", "wetland", "water", "reservoir", "riverbank"}
BAD_LAND = {"industrial", "residential", "commercial", "landfill", "quarry", "cemetery"}
SOFT_LAND = {"farmland", "orchard", "scrub"}
TERRAIN_DRAW = {
    "water": ((32, 142, 190, 46), (20, 105, 150, 135)),
    "reservoir": ((32, 142, 190, 44), (20, 105, 150, 128)),
    "wetland": ((55, 184, 145, 54), (30, 135, 105, 142)),
    "wetland_marsh": ((55, 184, 145, 58), (30, 135, 105, 145)),
    "wetland_saltmarsh": ((68, 200, 165, 62), (32, 128, 102, 150)),
    "industrial": ((198, 104, 56, 42), (145, 71, 38, 135)),
    "residential": ((238, 174, 55, 38), (160, 110, 30, 125)),
    "commercial": ((238, 174, 55, 36), (160, 110, 30, 120)),
    "farmland": ((88, 160, 86, 28), (68, 125, 66, 92)),
    "orchard": ((65, 145, 90, 32), (48, 110, 70, 95)),
    "scrub": ((117, 142, 86, 30), (92, 112, 64, 92)),
    "quarry": ((154, 128, 104, 36), (115, 94, 73, 115)),
    "cemetery": ((150, 150, 150, 34), (105, 105, 105, 105)),
    "landfill": ((120, 110, 95, 34), (90, 80, 70, 110)),
}


def km_per_lon(lat: float) -> float:
    return 111.32 * math.cos(math.radians(lat))


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lon1, lat1 = a
    lon2, lat2 = b
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    s = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    return 2 * 6371.0 * math.asin(math.sqrt(s))


def dist_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat = (a[1] + b[1]) / 2
    x = (b[0] - a[0]) * km_per_lon(lat)
    y = (b[1] - a[1]) * 110.57
    return math.hypot(x, y)


def lerp(a: tuple[float, float], b: tuple[float, float], t: float) -> tuple[float, float]:
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def offset_lonlat(coord: tuple[float, float], east_km: float = 0.0, north_km: float = 0.0) -> tuple[float, float]:
    lon, lat = coord
    return (lon + east_km / km_per_lon(lat), lat + north_km / 110.57)


def geom_bbox(geom: dict) -> tuple[float, float, float, float]:
    xs: list[float] = []
    ys: list[float] = []

    def rec(coords):
        if isinstance(coords[0], (int, float)):
            xs.append(float(coords[0]))
            ys.append(float(coords[1]))
        else:
            for item in coords:
                rec(item)

    rec(geom["coordinates"])
    return min(xs), min(ys), max(xs), max(ys)


def bbox_intersects(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> bool:
    return not (a[2] < b[0] or a[0] > b[2] or a[3] < b[1] or a[1] > b[3])


def xy_km(p: tuple[float, float], ref_lat: float = 30.2) -> tuple[float, float]:
    return p[0] * km_per_lon(ref_lat), p[1] * 110.57


def point_segment_dist_km(p: tuple[float, float], a: tuple[float, float], b: tuple[float, float]) -> float:
    px, py = xy_km(p)
    ax, ay = xy_km(a)
    bx, by = xy_km(b)
    dx = bx - ax
    dy = by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def point_in_ring(p: tuple[float, float], ring: list[list[float]]) -> bool:
    x, y = p
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if (yi > y) != (yj > y):
            x_at_y = (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi
            if x < x_at_y:
                inside = not inside
        j = i
    return inside


def polygon_distance_km(p: tuple[float, float], polygon: list[list[list[float]]]) -> float:
    if point_in_ring(p, polygon[0]):
        return 0.0
    best = 1e9
    for ring in polygon:
        for a, b in zip(ring, ring[1:]):
            best = min(best, point_segment_dist_km(p, tuple(a[:2]), tuple(b[:2])))
    return best


def geom_distance_km(p: tuple[float, float], geom: dict) -> float:
    typ = geom["type"]
    coords = geom["coordinates"]
    if typ == "MultiPolygon":
        return min(polygon_distance_km(p, polygon) for polygon in coords)
    if typ == "Polygon":
        return polygon_distance_km(p, coords)
    if typ == "LineString":
        return min(point_segment_dist_km(p, tuple(a[:2]), tuple(b[:2])) for a, b in zip(coords, coords[1:]))
    return 1e9


class Projector:
    def __init__(self, bbox: tuple[float, float, float, float]):
        self.w, self.s, self.e, self.n = bbox

    def __call__(self, lon: float, lat: float) -> tuple[int, int]:
        x = (lon - self.w) / (self.e - self.w) * MAP_W
        y = (self.n - lat) / (self.n - self.s) * MAP_H
        return int(round(x)), int(round(y))


P = Projector(MAP_BBOX)


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Helvetica Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Helvetica.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except Exception:
            pass
    return ImageFont.load_default()


FONT = {
    "title": load_font(31, True),
    "subtitle": load_font(22, True),
    "body": load_font(19),
    "body_bold": load_font(19, True),
    "small": load_font(15),
    "small_bold": load_font(15, True),
    "tiny": load_font(12),
    "tiny_bold": load_font(12, True),
    "map_label": load_font(18, True),
    "unit": load_font(14, True),
}


@dataclass
class TerrainFeature:
    source_path: str
    fclass: str
    name: str
    geometry: dict
    bbox: tuple[float, float, float, float]


@dataclass
class Candidate:
    coord: tuple[float, float]
    score: float
    nearest_blue_uid: str
    nearest_blue_km: float
    bad_class: str
    bad_name: str
    bad_km: float
    water_class: str
    water_name: str
    water_km: float
    soft_class: str
    soft_name: str
    soft_km: float
    inside: list[tuple[str, str]]


@dataclass
class BLS:
    name: str
    coord: tuple[float, float]
    role: str
    capacity: str
    throughput: float
    candidate_score: float
    terrain_friction: float
    nearest_blue_uid: str
    nearest_blue_km: float
    mobility_summary: str
    selection_rationale: str
    satellite_xy: tuple[int, int] | None = None
    satellite_rgb: tuple[int, int, int] | None = None
    shoreline_validated: bool = False


@dataclass
class Step:
    index: int
    time_label: str
    hours: int
    phase: str
    phase_line_km: int
    objective_status: str
    headline: str
    narrative_en: str
    bls_status: dict[str, str]
    blue_destroyed: list[str]
    red_losses: int
    red_degraded: list[str]
    force_ratio: str
    mobility_state: str
    ew_effect: str
    logistics_state: str
    decision_point: str
    progress: float = field(init=False)

    def __post_init__(self) -> None:
        self.progress = min(1.0, self.phase_line_km / OBJ_NASSER["target_depth_km"])


def load_source() -> tuple[dict, list[dict], list[dict], list[tuple[float, float]]]:
    source = json.loads(SOURCE_GEOJSON.read_text(encoding="utf-8"))
    ao_features: list[dict] = []
    blue_units: list[dict] = []
    coast: list[tuple[float, float]] = []
    for idx, feat in enumerate(source["features"]):
        props = feat.get("properties", {})
        app = props.get("app", {})
        sidc = app.get("sidc", "")
        if app.get("kind") == "multipolygon":
            ao_features.append(feat)
        elif app.get("kind") == "symbol" and len(sidc) >= 10 and sidc[3] == "3":
            label = app.get("textModifiers", {}).get("uniqueDesignation", f"blue-{idx}")
            echelon = {"15": "company", "16": "battalion", "18": "brigade", "21": "division"}.get(sidc[8:10], "unit")
            blue_units.append(
                {
                    "uid": f"BLUE_{label}",
                    "label": label,
                    "coord": tuple(feat["geometry"]["coordinates"]),
                    "echelon": echelon,
                    "sidc": sidc,
                    "source_index": idx,
                }
            )
        elif app.get("kind") == "tmg-group" and app.get("typeId") == "scalloped":
            for pt in app.get("points", []):
                tup = tuple(pt)
                if not coast or coast[-1] != tup:
                    coast.append(tup)
    return source, ao_features, blue_units, coast


def load_terrain() -> list[TerrainFeature]:
    terrain: list[TerrainFeature] = []
    for path in (LANDUSE, INLAND_WATER, WATER_WAY):
        if not path.exists():
            continue
        data = json.loads(path.read_text(encoding="utf-8"))
        for feat in data.get("features", []):
            geom = feat.get("geometry")
            if not geom:
                continue
            bbox = geom_bbox(geom)
            if not bbox_intersects(bbox, MAP_BBOX):
                continue
            props = feat.get("properties", {})
            terrain.append(
                TerrainFeature(
                    source_path=str(path.relative_to(ROOT)),
                    fclass=props.get("fclass", ""),
                    name=props.get("name", "") or "",
                    geometry=geom,
                    bbox=bbox,
                )
            )
    return terrain


SOURCE, AO_FEATURES, BLUE_UNITS, COAST_TRACE = load_source()
TERRAIN = load_terrain()


def sample_coast(points: list[tuple[float, float]], spacing_km: float = 2.0) -> list[tuple[float, float]]:
    samples: list[tuple[float, float]] = []
    for a, b in zip(points, points[1:]):
        seg = dist_km(a, b)
        count = max(1, int(seg / spacing_km))
        for i in range(count):
            samples.append(lerp(a, b, i / count))
    if points:
        samples.append(points[-1])
    return samples


def load_selection_satellite() -> Image.Image | None:
    for path in (
        SATELLITE_BASE,
        Path("/private/tmp/brega_wargame2_exact_4326.jpg"),
        Path("/private/tmp/brega_full_4326.jpg"),
    ):
        if path.exists():
            return Image.open(path).convert("RGB")
    return None


def is_dry_beach_pixel(rgb: tuple[int, int, int]) -> bool:
    r, g, b = rgb
    # Reject dark sea and require bright exposed beach/desert tones. This is a
    # conservative pixel gate so BLS markers do not land in water.
    return r >= 170 and g >= 145 and b >= 115 and r >= b + 10 and g >= b + 5


def satellite_pixel_to_lonlat(x: int, y: int, width: int, height: int) -> tuple[float, float]:
    w, s, e, n = MAP_BBOX
    return (w + x / width * (e - w), n - y / height * (n - s))


def lonlat_to_satellite_pixel(coord: tuple[float, float], width: int, height: int) -> tuple[int, int]:
    lon, lat = coord
    w, s, e, n = MAP_BBOX
    x = round((lon - w) / (e - w) * width)
    y = round((n - lat) / (n - s) * height)
    return max(0, min(width - 1, x)), max(0, min(height - 1, y))


def lon_to_satellite_x(lon: float, width: int) -> int:
    w, _, e, _ = MAP_BBOX
    return max(0, min(width - 1, round((lon - w) / (e - w) * width)))


def is_sea_pixel(rgb: tuple[int, int, int]) -> bool:
    r, g, b = rgb
    return b > g and g >= r and r < 70 and g < 100 and b < 130


def first_dry_beach_for_lon(image: Image.Image, lon: float) -> tuple[tuple[float, float], tuple[int, int], tuple[int, int, int]] | None:
    width, height = image.size
    x = lon_to_satellite_x(lon, width)
    for y in range(height):
        # Majority filter smooths out surf foam and JPEG speckles.
        votes = [
            is_dry_beach_pixel(image.getpixel((min(width - 1, max(0, x + dx)), y)))
            for dx in range(-4, 5)
        ]
        if sum(votes) >= 5:
            return satellite_pixel_to_lonlat(x, y, width, height), (x, y), image.getpixel((x, y))
    return None


SNAP_CACHE: dict[tuple[int, int], tuple[tuple[float, float], bool, tuple[int, int], tuple[int, int, int]]] = {}


def snap_ground_coord(coord: tuple[float, float]) -> tuple[tuple[float, float], bool, tuple[int, int] | None, tuple[int, int, int] | None]:
    image = load_selection_satellite()
    if image is None:
        return coord, False, None, None
    width, height = image.size
    x, y = lonlat_to_satellite_pixel(coord, width, height)
    key = (x, y)
    if key in SNAP_CACHE:
        snapped, changed, snap_xy, rgb = SNAP_CACHE[key]
        return snapped, changed, snap_xy, rgb
    rgb = image.getpixel((x, y))
    if not is_sea_pixel(rgb):
        SNAP_CACHE[key] = (coord, False, (x, y), rgb)
        return coord, False, (x, y), rgb

    # Prefer moving inland/south from the coast, with a small lateral search in
    # case the coastline is angled or the point is just off a curved beach.
    best: tuple[int, int] | None = None
    best_dist = 1e9
    for dy in range(1, 260):
        for dx in range(-70, 71):
            xx = max(0, min(width - 1, x + dx))
            yy = max(0, min(height - 1, y + dy))
            candidate_rgb = image.getpixel((xx, yy))
            if is_sea_pixel(candidate_rgb):
                continue
            dist = dy * dy + dx * dx * 0.35
            if dist < best_dist:
                best = (xx, yy)
                best_dist = dist
        if best is not None:
            break
    if best is None:
        SNAP_CACHE[key] = (coord, False, (x, y), rgb)
        return coord, False, (x, y), rgb
    snapped = satellite_pixel_to_lonlat(best[0], best[1], width, height)
    snap_rgb = image.getpixel(best)
    SNAP_CACHE[key] = (snapped, True, best, snap_rgb)
    return snapped, True, best, snap_rgb


def satellite_info(coord: tuple[float, float]) -> tuple[tuple[int, int] | None, tuple[int, int, int] | None, bool | None]:
    image = load_selection_satellite()
    if image is None:
        return None, None, None
    width, height = image.size
    xy = lonlat_to_satellite_pixel(coord, width, height)
    rgb = image.getpixel(xy)
    return xy, rgb, is_sea_pixel(rgb)


def satellite_shoreline_candidates() -> tuple[list[tuple[Candidate, tuple[int, int] | None, tuple[int, int, int] | None]], bool]:
    image = load_selection_satellite()
    if image is None:
        return [(score_candidate(p), None, None) for p in sample_coast(COAST_TRACE)], False

    candidates: list[tuple[Candidate, tuple[int, int], tuple[int, int, int]]] = []
    sectors = [(19.22, 19.29), (19.31, 19.37), (19.43, 19.47), (19.60, 19.65)]
    for lo, hi in sectors:
        for i in range(21):
            lon = lo + (hi - lo) * i / 20
            beach = first_dry_beach_for_lon(image, lon)
            if beach is None:
                continue
            coord, xy, rgb = beach
            candidates.append((score_candidate(coord), xy, rgb))
    return candidates, True


def score_candidate(point: tuple[float, float]) -> Candidate:
    nearest_blue_km, nearest_blue_uid, _ = min((dist_km(point, u["coord"]), u["label"], u["coord"]) for u in BLUE_UNITS)
    bad_km, bad_class, bad_name = 99.0, "", ""
    water_km, water_class, water_name = 99.0, "", ""
    soft_km, soft_class, soft_name = 99.0, "", ""
    inside: list[tuple[str, str]] = []
    for feat in TERRAIN:
        d = geom_distance_km(point, feat.geometry)
        if d == 0:
            inside.append((feat.fclass, feat.name))
        if feat.fclass in HARD_WATER and d < water_km:
            water_km, water_class, water_name = d, feat.fclass, feat.name
        if feat.fclass in BAD_LAND and d < bad_km:
            bad_km, bad_class, bad_name = d, feat.fclass, feat.name
        if feat.fclass in SOFT_LAND and d < soft_km:
            soft_km, soft_class, soft_name = d, feat.fclass, feat.name

    score = 0.0
    score += min(nearest_blue_km, 12.0) * 4.0
    score += min(bad_km, 10.0) * 3.0
    score += min(water_km, 10.0) * 5.0
    score += min(soft_km, 7.0) * 1.0
    if nearest_blue_km < 3.0:
        score -= 30.0
    if bad_km < 1.0:
        score -= 35.0
    if water_km < 1.0:
        score -= 45.0
    if point[0] > 19.62:
        score -= 15.0
    return Candidate(
        coord=point,
        score=score,
        nearest_blue_uid=nearest_blue_uid,
        nearest_blue_km=nearest_blue_km,
        bad_class=bad_class,
        bad_name=bad_name,
        bad_km=bad_km,
        water_class=water_class,
        water_name=water_name,
        water_km=water_km,
        soft_class=soft_class,
        soft_name=soft_name,
        soft_km=soft_km,
        inside=inside,
    )


def choose_bls() -> tuple[list[BLS], list[Candidate]]:
    candidate_records, shoreline_validated = satellite_shoreline_candidates()
    candidates = [record[0] for record in candidate_records]
    sectors = [
        ("BLS-1", (19.22, 19.29), "West fixing landing", "Limited", 0.72),
        ("BLS-2", (19.31, 19.37), "Supporting landing", "Medium", 0.66),
        ("BLS-3", (19.43, 19.47), "Main effort", "High", 1.00),
        ("BLS-4", (19.60, 19.65), "Eastern fixing / envelopment", "Limited", 0.35),
    ]
    chosen: list[BLS] = []
    for name, (lo, hi), role, capacity, throughput in sectors:
        pool = [record for record in candidate_records if lo <= record[0].coord[0] <= hi]
        if not pool:
            pool = candidate_records
        best_record = max(pool, key=lambda record: record[0].score)
        best, sat_xy, sat_rgb = best_record
        friction = 1.0
        if best.water_km < 3:
            friction -= 0.17
        elif best.water_km < 6:
            friction -= 0.08
        if best.bad_km < 2:
            friction -= 0.20
        elif best.bad_km < 5:
            friction -= 0.08
        if best.nearest_blue_km < 4:
            friction -= 0.12
        friction = max(0.45, round(friction, 2))
        if name == "BLS-3":
            rationale = "Best main-effort score inside the central frontage; dry/open belt and broadest exit potential."
            mobility = "Good beach exit; defender proximity makes suppression and tempo critical."
        elif name == "BLS-4":
            rationale = "Selected for frontage and eastern pressure despite low terrain score; treated as limited, not a clean throughput site."
            mobility = "Urban/industrial/water friction; suitable for fixing/envelopment, not heavy follow-on throughput."
        elif name == "BLS-2":
            rationale = "Useful supporting site with acceptable spacing, but inland wetland proximity constrains expansion."
            mobility = "Moderate mobility; wetland/sabkha proximity channels vehicles."
        else:
            rationale = "Western fixing site with better water separation than nearby alternatives."
            mobility = "Limited but usable mobility; supports dispersion and deception."
        chosen.append(
            BLS(
                name=name,
                coord=best.coord,
                role=role,
                capacity=capacity,
                throughput=throughput,
                candidate_score=round(best.score, 1),
                terrain_friction=friction,
                nearest_blue_uid=best.nearest_blue_uid,
                nearest_blue_km=round(best.nearest_blue_km, 1),
                mobility_summary=mobility,
                selection_rationale=rationale,
                satellite_xy=sat_xy,
                satellite_rgb=sat_rgb,
                shoreline_validated=shoreline_validated and sat_xy is not None and sat_rgb is not None,
            )
        )
    return chosen, candidates


BLS_LIST, BLS_CANDIDATES = choose_bls()
BLS_BY_NAME = {b.name: b for b in BLS_LIST}


RED_UNITS = [
    {"uid": "RED_401RECON", "label": "401 Recon", "echelon": "battalion", "bls": "BLS-3", "appear": 1, "role": "Recon"},
    {"uid": "RED_41MECH", "label": "41 Mech", "echelon": "brigade", "bls": "BLS-1", "appear": 3, "role": "Fixing"},
    {"uid": "RED_42MECH", "label": "42 Mech", "echelon": "brigade", "bls": "BLS-2", "appear": 3, "role": "Support"},
    {"uid": "RED_43MECH", "label": "43 Mech", "echelon": "brigade", "bls": "BLS-3", "appear": 3, "role": "Main effort"},
    {"uid": "RED_44ARMD", "label": "44 Armd", "echelon": "brigade", "bls": "BLS-4", "appear": 3, "role": "Eastern fixing"},
    {"uid": "RED_9MID", "label": "9 MID", "echelon": "division", "bls": "BLS-3", "appear": 6, "role": "Follow-on"},
    {"uid": "RED_1AD", "label": "1 AD", "echelon": "division", "bls": "BLS-3", "appear": 8, "role": "Exploitation"},
    {"uid": "RED_45ARTY", "label": "45 Arty", "echelon": "support", "bls": "BLS-2", "appear": 3, "role": "Fire support"},
    {"uid": "RED_405EW", "label": "405 EW", "echelon": "support", "bls": "BLS-2", "appear": 1, "role": "EW"},
    {"uid": "RED_406CHEM", "label": "406 CBRN", "echelon": "support", "bls": "BLS-2", "appear": 6, "role": "CBRN defense"},
    {"uid": "RED_USV", "label": "USV x24", "echelon": "support", "bls": "BLS-3", "appear": 1, "role": "Explosive USVs"},
]


def cumulative(groups: list[list[str]], idx: int) -> list[str]:
    out: list[str] = []
    for group in groups[: idx + 1]:
        for item in group:
            if item not in out:
                out.append(item)
    return out


def make_steps() -> list[Step]:
    # Red achieves a viable lodgement, but terrain and early Blue reserve action
    # keep the armored exploitation short of OBJ NASSER by H+144.
    blue_loss_groups = [
        [],
        [],
        [],
        ["c112", "c113"],
        ["c121", "c122", "c123"],
        ["c211", "c212"],
        ["c131", "c132"],
        ["c221", "c222", "c231"],
        ["c232", "c311", "c312"],
        ["c321", "c322"],
        ["p31c", "c323"],
        ["p32c", "c333"],
    ]
    templates = [
        (0, "D-3h", -3, "PRE-H", 0, "DORMANT", "Initial disposition", "Blue coastal defense is set; Red amphibious force stages offshore outside direct observation.", "Idle", "Routine", "Not engaged", "Red staging"),
        (1, "H-Hour", 0, "PHASE 1", 1, "DORMANT", "Recon and USV screen", "401 Recon probes the main beach while explosive USVs and EW disrupt the coastal picture.", "Active", "Good", "1:1 reconnaissance contact", "Recon lodgement"),
        (2, "H+2", 2, "PHASE 1", 2, "DORMANT", "Beach exits confirmed", "Recon confirms BLS-3 as the best exit; BLS-2 is slower because of wetland/sabkha proximity.", "Heavy", "Good", "1:1 contested security fight", "Beach contested"),
        (3, "H+6", 6, "PHASE 2A", 5, "DORMANT", "4th MID ashore", "4th MID begins landing across the four validated beach sites; BLS-4 is physically usable but remains a limited external exit.", "Heavy", "Moderate", "2.5:1 at selected beach sectors", "4th MID landing"),
        (4, "H+12", 12, "PHASE 2A", 8, "DORMANT", "Shallow lodgement", "BLS-1 and BLS-3 become usable, while BLS-2 remains channelized and BLS-4 stays limited as a heavy exit.", "Heavy", "Constrained", "2:1, below decisive in the east", "Beachhead expansion"),
        (5, "H+24", 24, "PHASE 2A", 10, "DORMANT", "Blue local counterattack", "Blue counterattacks before Red converts the beachhead into a clean combat-service support area.", "Heavy", "Constrained", "1.4:1 Blue local counterstroke", "Local counterattack"),
        (6, "H+36", 36, "PHASE 2B", 16, "DORMANT", "9th MID delayed", "9th MID starts moving through BLS-3, but BLS-2 throughput and BLS-4's limited external capacity slow the handover.", "Moderate", "Constrained", "2:1 Red but logistics-limited", "Follow-on commitment"),
        (7, "H+48", 48, "PHASE 2B", 34, "THREATENED", "Drive to desert line", "Red reaches the open desert line, short of the 40-50 km objective because the beachhead is still sorting traffic.", "Moderate", "Improving", "2.4:1 after local consolidation", "Deep push begins"),
        (8, "H+72", 72, "PHASE 3", 52, "THREATENED", "1st AD committed", "1st Armored Division begins exploitation from BLS-3, but the armored column is tied to a single reliable exit corridor.", "Moderate", "Stretched", "2.2:1 operational, mobility penalty", "Armored exploitation"),
        (9, "H+96", 96, "PHASE 3", 66, "THREATENED", "Blue reserve counterstroke", "Blue reserve strikes the exploitation corridor before Red reaches the 80-100 km decisive band.", "Low", "Stretched", "1.5:1 contested corridor", "Reserve counterstroke"),
        (10, "H+120", 120, "PHASE 3", 78, "THREATENED", "Red culmination", "Red enters the lower edge of the doctrinal depth band but cannot mass combat power around the objective.", "Low", "Culminating", "Below 3:1 at OBJ approach", "Culmination short of OBJ"),
        (11, "H+144", 144, "RESOLUTION", 84, "DENIED", "OBJ NASSER denied", "Red holds a lodgement and threatens the pipeline axis, but Blue prevents seizure of OBJ NASSER inside the six-day window.", "Low", "Culminated", "Below decisive at objective", "Blue denies objective"),
    ]
    bls_states = [
        {"BLS-1": "STAGED", "BLS-2": "STAGED", "BLS-3": "STAGED", "BLS-4": "STAGED"},
        {"BLS-1": "CONTESTED", "BLS-2": "CONTESTED", "BLS-3": "CONTESTED", "BLS-4": "CONTESTED"},
        {"BLS-1": "CONTESTED", "BLS-2": "CONTESTED", "BLS-3": "CONTESTED", "BLS-4": "CONTESTED"},
        {"BLS-1": "CONTESTED", "BLS-2": "CONTESTED", "BLS-3": "CONTESTED", "BLS-4": "CONTESTED"},
        {"BLS-1": "SECURE", "BLS-2": "CONTESTED", "BLS-3": "SECURE", "BLS-4": "LIMITED"},
        {"BLS-1": "SECURE", "BLS-2": "CONTESTED", "BLS-3": "SECURE", "BLS-4": "LIMITED"},
        {"BLS-1": "SECURE", "BLS-2": "LIMITED", "BLS-3": "SECURE", "BLS-4": "LIMITED"},
        {"BLS-1": "SECURE", "BLS-2": "LIMITED", "BLS-3": "SECURE", "BLS-4": "LIMITED"},
        {"BLS-1": "SECURE", "BLS-2": "LIMITED", "BLS-3": "SECURE", "BLS-4": "LIMITED"},
        {"BLS-1": "SECURE", "BLS-2": "LIMITED", "BLS-3": "CONTESTED", "BLS-4": "LIMITED"},
        {"BLS-1": "SECURE", "BLS-2": "LIMITED", "BLS-3": "LIMITED", "BLS-4": "LIMITED"},
        {"BLS-1": "SECURE", "BLS-2": "LIMITED", "BLS-3": "LIMITED", "BLS-4": "LIMITED"},
    ]
    red_losses = [0, 0, 0, 0, 1, 2, 2, 3, 4, 5, 6, 6]
    red_degraded = [
        [],
        [],
        [],
        [],
        ["RED_44ARMD"],
        ["RED_44ARMD", "RED_42MECH"],
        ["RED_44ARMD", "RED_42MECH"],
        ["RED_44ARMD", "RED_42MECH", "RED_9MID"],
        ["RED_44ARMD", "RED_42MECH", "RED_9MID"],
        ["RED_43MECH", "RED_9MID", "RED_1AD"],
        ["RED_43MECH", "RED_9MID", "RED_1AD"],
        ["RED_43MECH", "RED_9MID", "RED_1AD"],
    ]
    steps: list[Step] = []
    for i, row in enumerate(templates):
        step = Step(
            index=row[0],
            time_label=row[1],
            hours=row[2],
            phase=row[3],
            phase_line_km=row[4],
            objective_status=row[5],
            headline=row[6],
            narrative_en=row[7],
            bls_status=bls_states[i],
            blue_destroyed=cumulative(blue_loss_groups, i),
            red_losses=red_losses[i],
            red_degraded=red_degraded[i],
            ew_effect=row[8],
            mobility_state=row[9],
            force_ratio=row[10],
            logistics_state="Beachhead support area forming" if i < 6 else "Single-corridor constrained" if i < 10 else "Culminating",
            decision_point=row[11],
        )
        steps.append(step)
    return steps


STEPS = make_steps()


def fetch_basemap() -> Image.Image:
    if SATELLITE_BASE.exists():
        return Image.open(SATELLITE_BASE).convert("RGBA")
    full_cache = Path("/private/tmp/brega_full_4326.jpg")
    if full_cache.exists():
        return Image.open(full_cache).convert("RGBA")
    cache = Path("/private/tmp/brega_wargame2_esri_base_4326.jpg")
    if cache.exists():
        return Image.open(cache).convert("RGBA")
    older_cache = Path("/private/tmp/brega_wargame_esri_base_v3_4326.jpg")
    if older_cache.exists():
        return Image.open(older_cache).convert("RGBA")
    w, s, e, n = MAP_BBOX
    url = (
        "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export"
        f"?bbox={w},{s},{e},{n}&bboxSR=4326&imageSR=4326&size={MAP_W},{MAP_H}&format=jpg&f=image"
    )
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as response:
            data = response.read()
        cache.write_bytes(data)
        return Image.open(BytesIO(data)).convert("RGBA")
    except Exception:
        img = Image.new("RGBA", (MAP_W, MAP_H), (220, 214, 192, 255))
        d = ImageDraw.Draw(img)
        d.rectangle([0, 0, MAP_W, 190], fill=(46, 86, 105, 255))
        for y in range(190, MAP_H, 18):
            shade = 218 - min(20, (y - 190) // 48)
            d.line([(0, y), (MAP_W, y)], fill=(shade, shade - 5, shade - 24, 255), width=18)
        return img


def text_bbox(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> tuple[int, int]:
    b = draw.textbbox((0, 0), text, font=font)
    return b[2] - b[0], b[3] - b[1]


def draw_text_halo(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    font: ImageFont.ImageFont,
    fill,
    halo=(255, 255, 255, 230),
    anchor: str | None = None,
) -> None:
    x, y = xy
    for dx, dy in [(-2, 0), (2, 0), (0, -2), (0, 2), (-1, -1), (1, 1), (-1, 1), (1, -1)]:
        draw.text((x + dx, y + dy), text, font=font, fill=halo, anchor=anchor)
    draw.text((x, y), text, font=font, fill=fill, anchor=anchor)


def draw_wrapped(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, font, fill, chars: int, line_h: int) -> int:
    x, y = xy
    for line in textwrap.wrap(text, chars):
        draw.text((x, y), line, font=font, fill=fill)
        y += line_h
    return y


def draw_dashed_line(draw: ImageDraw.ImageDraw, points: list[tuple[int, int]], fill, width=3, dash=18, gap=12) -> None:
    for a, b in zip(points, points[1:]):
        x1, y1 = a
        x2, y2 = b
        dist = math.hypot(x2 - x1, y2 - y1)
        if dist < 1:
            continue
        ux, uy = (x2 - x1) / dist, (y2 - y1) / dist
        n = 0.0
        while n < dist:
            m = min(n + dash, dist)
            draw.line([(x1 + ux * n, y1 + uy * n), (x1 + ux * m, y1 + uy * m)], fill=fill, width=width)
            n += dash + gap


def draw_arrow(draw: ImageDraw.ImageDraw, a: tuple[int, int], b: tuple[int, int], fill, width=12, head_len=36, head_w=30) -> None:
    x1, y1 = a
    x2, y2 = b
    dx, dy = x2 - x1, y2 - y1
    dist = math.hypot(dx, dy)
    if dist < 12:
        return
    ux, uy = dx / dist, dy / dist
    px, py = -uy, ux
    shaft_end = (x2 - ux * head_len, y2 - uy * head_len)
    draw.line([a, shaft_end], fill=fill, width=width)
    draw.polygon(
        [
            (x2, y2),
            (shaft_end[0] + px * head_w / 2, shaft_end[1] + py * head_w / 2),
            (shaft_end[0] - px * head_w / 2, shaft_end[1] - py * head_w / 2),
        ],
        fill=fill,
    )


def draw_polygon_geom(draw: ImageDraw.ImageDraw, geom: dict, fill, outline=None, width=1) -> None:
    if geom["type"] == "MultiPolygon":
        polys = geom["coordinates"]
    elif geom["type"] == "Polygon":
        polys = [geom["coordinates"]]
    else:
        return
    for poly in polys:
        ring = [P(*pt[:2]) for pt in poly[0]]
        if len(ring) >= 3:
            draw.polygon(ring, fill=fill)
            if outline:
                draw.line(ring + [ring[0]], fill=outline, width=width)


def draw_terrain(draw: ImageDraw.ImageDraw) -> None:
    for feat in TERRAIN:
        if feat.fclass not in TERRAIN_DRAW:
            continue
        fill, outline = TERRAIN_DRAW[feat.fclass]
        draw_polygon_geom(draw, feat.geometry, fill, outline, width=2 if feat.fclass in HARD_WATER else 1)


def draw_aor(draw: ImageDraw.ImageDraw) -> None:
    for feat in AO_FEATURES:
        geom = feat["geometry"]
        for poly in geom.get("coordinates", []):
            ring = [P(*coord) for coord in poly[0]]
            draw.polygon(ring, fill=(54, 121, 210, 12), outline=(38, 104, 220, 190))
            draw.line(ring + [ring[0]], fill=(38, 104, 220, 220), width=3)


def draw_pipeline_and_obj(draw: ImageDraw.ImageDraw, step: Step) -> None:
    pts = [P(*p) for p in PIPELINE_ROUTE if MAP_BBOX[0] <= p[0] <= MAP_BBOX[2] and MAP_BBOX[1] <= p[1] <= MAP_BBOX[3]]
    if len(pts) > 1:
        draw_dashed_line(draw, pts, (82, 28, 105, 230), width=5, dash=25, gap=14)
        draw_dashed_line(draw, pts, (255, 255, 255, 190), width=2, dash=25, gap=14)
    x, y = P(*OBJ_NASSER["coord"])
    colors = {
        "DORMANT": ((120, 120, 120, 230), (120, 120, 120, 50)),
        "THREATENED": ((228, 156, 38, 255), (228, 156, 38, 90)),
        "CONTESTED": ((232, 90, 32, 255), (232, 90, 32, 110)),
        "CAPTURED": ((180, 0, 0, 255), (180, 0, 0, 125)),
        "DENIED": ((23, 95, 180, 255), (23, 95, 180, 115)),
    }
    line, fill = colors.get(step.objective_status, colors["DORMANT"])
    r = 50
    draw.ellipse([x - r, y - r, x + r, y + r], fill=fill, outline=line, width=5)
    draw.line([(x - 18, y), (x + 18, y)], fill=(255, 255, 255, 245), width=4)
    draw.line([(x, y - 18), (x, y + 18)], fill=(255, 255, 255, 245), width=4)
    draw_text_halo(draw, (x + r + 10, y - 10), f"{OBJ_NASSER['name']} ({step.objective_status})", FONT["map_label"], line)


def draw_phase_and_axis(draw: ImageDraw.ImageDraw, step: Step) -> None:
    if step.phase_line_km > 0:
        lat = 30.42 - step.phase_line_km / 111.0
        a = P(MAP_BBOX[0] + 0.04, lat)
        b = P(MAP_BBOX[2] - 0.04, lat)
        draw_dashed_line(draw, [a, b], (38, 38, 28, 220), width=7, dash=28, gap=18)
        draw_dashed_line(draw, [a, b], (246, 220, 64, 255), width=4, dash=28, gap=18)
        draw_text_halo(draw, (b[0] - 154, b[1] - 25), f"PL {step.phase_line_km} km", FONT["map_label"], (246, 220, 64, 255), halo=(35, 35, 25, 255))
    if step.progress <= 0:
        return
    bls_pts = [b.coord for b in BLS_LIST]
    deep_pts = [lerp(pt, OBJ_NASSER["coord"], min(step.progress, 0.92)) for pt in bls_pts]
    poly = [P(*pt) for pt in bls_pts + list(reversed(deep_pts))]
    if len(poly) >= 4:
        draw.polygon(poly, fill=(196, 30, 30, 22), outline=(178, 20, 20, 100))
    main_start = P(*BLS_BY_NAME["BLS-3"].coord)
    main_end = P(*lerp(BLS_BY_NAME["BLS-3"].coord, OBJ_NASSER["coord"], min(step.progress, 1.0)))
    draw_arrow(draw, main_start, main_end, (190, 20, 20, 210), width=19, head_len=52, head_w=54)
    if step.index >= 3:
        east_start = P(*BLS_BY_NAME["BLS-4"].coord)
        east_end = P(*lerp(BLS_BY_NAME["BLS-4"].coord, OBJ_NASSER["coord"], min(step.progress, 0.45)))
        draw_arrow(draw, east_start, east_end, (190, 20, 20, 125), width=10, head_len=34, head_w=34)


def draw_bls(draw: ImageDraw.ImageDraw, bls: BLS, status: str) -> None:
    x, y = P(*bls.coord)
    status_color = {
        "STAGED": (120, 120, 120, 255),
        "CONTESTED": (238, 160, 35, 255),
        "SECURE": (145, 42, 190, 255),
        "LIMITED": (185, 95, 210, 255),
        "DENIED": (215, 35, 35, 255),
    }.get(status, (145, 42, 190, 255))
    # Keep the actual beach coordinate visible while placing the larger symbol
    # just inland, so validated shore points do not look like offshore markers.
    anchor = (x, y)
    x, y = x, y + 26
    r = 31
    draw.line([anchor, (x, y - r + 4)], fill=status_color, width=3)
    draw.ellipse([anchor[0] - 5, anchor[1] - 5, anchor[0] + 5, anchor[1] + 5], fill=(255, 255, 255, 245), outline=status_color, width=3)
    draw.pieslice([x - r, y - r, x + r, y + r], 180, 360, fill=(155, 45, 205, 82), outline=status_color, width=4)
    draw.line([(x - r, y), (x + r, y)], fill=status_color, width=4)
    draw.line([(x, y), (x, y - 38)], fill=status_color, width=3)
    label = f"{bls.name} {status}"
    tw, th = text_bbox(draw, label, FONT["tiny_bold"])
    draw.rounded_rectangle([x - tw // 2 - 7, y + 8, x + tw // 2 + 7, y + th + 17], radius=5, fill=(35, 20, 45, 226))
    draw.text((x, y + 11), label, font=FONT["tiny_bold"], fill=(255, 255, 255, 255), anchor="ma")


def draw_unit_box(draw: ImageDraw.ImageDraw, xy: tuple[int, int], label: str, side: str, echelon: str, status="ACTIVE", action="", label_it=True) -> None:
    x, y = xy
    sizes = {"company": (28, 17), "battalion": (36, 21), "brigade": (48, 28), "division": (58, 32), "support": (42, 24)}
    w, h = sizes.get(echelon, (34, 20))
    if side == "BLUE":
        outline = (25, 77, 170, 255)
        fill = (224, 236, 255, 238)
        txt = (10, 42, 120, 255)
        if action == "COUNTERATTACK":
            fill = (194, 236, 214, 248)
            outline = (12, 120, 70, 255)
    else:
        outline = (172, 30, 30, 255)
        fill = (255, 210, 210, 244)
        txt = (132, 20, 20, 255)
        if status == "DEGRADED":
            fill = (255, 224, 177, 244)
            outline = (180, 95, 20, 255)
    if status in {"DESTROYED", "NEUTRALIZED"}:
        fill = (156, 156, 156, 210)
        outline = (85, 85, 85, 255)
        txt = (80, 80, 80, 255)
    rect = [x - w // 2, y - h // 2, x + w // 2, y + h // 2]
    draw.rounded_rectangle(rect, radius=3, fill=fill, outline=outline, width=3)
    if side == "BLUE":
        draw.line([(rect[0] + 4, rect[1] + 4), (rect[2] - 4, rect[3] - 4)], fill=outline, width=2)
        draw.line([(rect[0] + 4, rect[3] - 4), (rect[2] - 4, rect[1] + 4)], fill=outline, width=2)
    else:
        draw.line([(rect[0] + 7, y), (rect[2] - 7, y)], fill=outline, width=2)
        draw.line([(x, rect[1] + 5), (x, rect[3] - 5)], fill=outline, width=2)
    if echelon in {"battalion", "brigade", "division"}:
        marks = {"battalion": "II", "brigade": "X", "division": "XX"}[echelon]
        draw_text_halo(draw, (x, rect[1] - 15), marks, FONT["tiny_bold"], outline, anchor="mm")
    if status in {"DESTROYED", "NEUTRALIZED"}:
        draw.line([(rect[0] - 5, rect[1] - 5), (rect[2] + 5, rect[3] + 5)], fill=(215, 28, 28, 255), width=4)
        draw.line([(rect[0] - 5, rect[3] + 5), (rect[2] + 5, rect[1] - 5)], fill=(215, 28, 28, 255), width=4)
    if label_it:
        draw_text_halo(draw, (x + w // 2 + 6, y - 9), label, FONT["unit"], txt)


def blue_action(label: str, step: Step) -> str:
    if step.index in {5, 6} and label in {"p21c", "p22c", "p23c", "c211", "c212", "c213"}:
        return "COUNTERATTACK"
    if step.index >= 9 and label in {"lc", "p31c", "p32c", "p33c", "b3c"}:
        return "COUNTERATTACK"
    return "DEFEND"


def blue_raw_position(unit: dict, step: Step) -> tuple[float, float]:
    lon, lat = unit["coord"]
    if blue_action(unit["label"], step) == "COUNTERATTACK":
        return offset_lonlat((lon, lat), north_km=4.8)
    return lon, lat


def blue_position(unit: dict, step: Step) -> tuple[float, float]:
    return snap_ground_coord(blue_raw_position(unit, step))[0]


def red_position(unit: dict, step: Step) -> tuple[float, float]:
    bls = BLS_BY_NAME[unit["bls"]].coord
    sea_offsets = {"BLS-1": (-2, 12), "BLS-2": (0, 11), "BLS-3": (2, 9), "BLS-4": (3, 6)}
    sea = offset_lonlat(bls, *sea_offsets[unit["bls"]])
    if step.index < unit["appear"]:
        return sea
    if unit["role"] in {"EW", "Fire support", "CBRN defense"}:
        pos = offset_lonlat(bls, east_km=3.5 if unit["role"] == "EW" else -4.5, north_km=-2.8)
        return snap_ground_coord(pos)[0]
    if unit["role"] == "Explosive USVs":
        return offset_lonlat(bls, east_km=0.0, north_km=4.0)
    if step.index <= 2:
        return snap_ground_coord(offset_lonlat(bls, north_km=-1.2))[0]
    unit_progress = step.progress
    if unit["role"] == "Fixing":
        unit_progress = min(unit_progress, 0.30)
    elif unit["role"] == "Support":
        unit_progress = min(unit_progress, 0.45)
    elif unit["role"] == "Eastern fixing":
        unit_progress = min(unit_progress, 0.24)
    elif unit["role"] == "Recon":
        unit_progress = min(1.0, unit_progress + 0.08)
    elif unit["role"] == "Follow-on" and step.index < 6:
        unit_progress = 0.0
    elif unit["role"] == "Exploitation" and step.index < 8:
        unit_progress = 0.0
    pos = lerp(bls, OBJ_NASSER["coord"], unit_progress)
    spread = {
        "RED_401RECON": (5.0, -4.5),
        "RED_41MECH": (-6.0, 1.0),
        "RED_42MECH": (-2.5, -1.7),
        "RED_43MECH": (2.2, 1.0),
        "RED_44ARMD": (6.5, 6.5),
        "RED_9MID": (-7.5, -6.0),
        "RED_1AD": (-7.5, 2.0),
    }
    if step.index >= 3 and unit["uid"] in spread:
        return snap_ground_coord(offset_lonlat(pos, *spread[unit["uid"]]))[0]
    return snap_ground_coord(pos)[0]


def draw_units(draw: ImageDraw.ImageDraw, step: Step) -> None:
    destroyed = set(step.blue_destroyed)
    for unit in BLUE_UNITS:
        x, y = P(*blue_position(unit, step))
        if not (0 <= x <= MAP_W and 0 <= y <= MAP_H):
            continue
        status = "DESTROYED" if unit["label"] in destroyed else "ACTIVE"
        action = blue_action(unit["label"], step)
        label_it = unit["echelon"] in {"battalion", "brigade", "division"} or action == "COUNTERATTACK"
        draw_unit_box(draw, (x, y), unit["label"], "BLUE", unit["echelon"], status, action, label_it)
        if action == "COUNTERATTACK" and status == "ACTIVE":
            draw_arrow(draw, (x, y + 36), (x, y - 34), (20, 150, 80, 220), width=6, head_len=20, head_w=22)
    for unit in RED_UNITS:
        if step.index < unit["appear"]:
            continue
        if unit["role"] == "Explosive USVs" and step.index > 4:
            continue
        x, y = P(*red_position(unit, step))
        if not (0 <= x <= MAP_W and 0 <= y <= MAP_H):
            continue
        status = "STAGED" if step.index < unit["appear"] else "ACTIVE"
        if unit["uid"] in step.red_degraded:
            status = "DEGRADED"
        if unit["role"] in {"EW", "Explosive USVs"} and step.index >= 7:
            status = "DISPLACED"
        label_it = status != "STAGED" or unit["echelon"] in {"division", "brigade"}
        if step.index >= 10 and unit["role"] not in {"Follow-on", "Exploitation"}:
            label_it = False
        draw_unit_box(draw, (x, y), unit["label"], "RED", unit["echelon"], status, unit["role"].upper(), label_it)


def draw_scale_and_north(draw: ImageDraw.ImageDraw) -> None:
    lon0, lat0 = 19.18, 29.56
    p0 = P(lon0, lat0)
    lon1 = lon0 + 20.0 / km_per_lon(lat0)
    p1 = P(lon1, lat0)
    y = p0[1]
    draw.line([p0, (p1[0], y)], fill=(255, 255, 255, 240), width=7)
    draw.line([p0, (p1[0], y)], fill=(30, 30, 30, 255), width=3)
    draw.text((p0[0], y - 26), "20 km", font=FONT["small_bold"], fill=(255, 255, 255, 255))
    nx, ny = P(19.93, 30.47)
    draw.polygon([(nx, ny - 34), (nx - 12, ny + 6), (nx + 12, ny + 6)], fill=(255, 255, 255, 245), outline=(20, 20, 20, 255))
    draw.text((nx, ny + 12), "N", font=FONT["small_bold"], fill=(255, 255, 255, 255), anchor="ma")


def draw_panel(draw: ImageDraw.ImageDraw, step: Step) -> None:
    x0 = MAP_W
    draw.rectangle([x0, 0, IMAGE_SIZE[0], IMAGE_SIZE[1]], fill=(14, 22, 32, 255))
    draw.rectangle([x0, 0, IMAGE_SIZE[0], 122], fill=(21, 45, 75, 255))
    draw.text((x0 + 28, 22), f"WARGAME2  STEP {step.index:02d}", font=FONT["title"], fill=(255, 255, 255, 255))
    draw.text((x0 + 30, 74), "GIS-INFORMED BLS / MOBILITY RUN", font=FONT["subtitle"], fill=(194, 215, 245, 255))
    y = 148
    draw.text((x0 + 30, y), step.headline.upper(), font=FONT["subtitle"], fill=(255, 218, 106, 255))
    y += 40
    draw.text((x0 + 30, y), f"Time: {step.time_label}    Phase: {step.phase}", font=FONT["body_bold"], fill=(238, 242, 247, 255))
    y += 32
    draw.text((x0 + 30, y), f"PL: {step.phase_line_km} km    OBJ: {step.objective_status}", font=FONT["body_bold"], fill=(238, 242, 247, 255))
    y += 32
    draw.text((x0 + 30, y), f"EW: {step.ew_effect}    Mobility: {step.mobility_state}", font=FONT["body"], fill=(198, 207, 220, 255))
    y += 38
    draw.line([(x0 + 28, y), (IMAGE_SIZE[0] - 28, y)], fill=(70, 91, 112, 255), width=2)
    y += 24
    y = draw_wrapped(draw, (x0 + 30, y), step.narrative_en, FONT["body"], (238, 242, 247, 255), 43, 26)
    y += 24
    draw.rounded_rectangle([x0 + 28, y, IMAGE_SIZE[0] - 28, y + 102], radius=10, fill=(24, 34, 48, 255), outline=(78, 102, 128, 255), width=2)
    draw.text((x0 + 48, y + 15), "ADJUDICATION", font=FONT["small_bold"], fill=(190, 204, 222, 255))
    draw.text((x0 + 48, y + 45), f"Ratio: {step.force_ratio}", font=FONT["body"], fill=(238, 242, 247, 255))
    draw.text((x0 + 48, y + 72), f"Logistics: {step.logistics_state}", font=FONT["body"], fill=(238, 242, 247, 255))
    y += 126
    draw.rounded_rectangle([x0 + 28, y, IMAGE_SIZE[0] - 28, y + 92], radius=10, fill=(24, 34, 48, 255), outline=(78, 102, 128, 255), width=2)
    draw.text((x0 + 48, y + 15), "CUMULATIVE LOSSES", font=FONT["small_bold"], fill=(190, 204, 222, 255))
    draw.text((x0 + 48, y + 47), f"BLUE: {len(step.blue_destroyed)}/39 destroyed", font=FONT["body_bold"], fill=(138, 185, 255, 255))
    draw.text((x0 + 328, y + 47), f"RED: {step.red_losses} coy-eq", font=FONT["body_bold"], fill=(255, 148, 148, 255))
    y += 116
    draw.text((x0 + 30, y), "SELECTED BEACHES", font=FONT["small_bold"], fill=(190, 204, 222, 255))
    y += 28
    for bls in BLS_LIST:
        status = step.bls_status.get(bls.name, "STAGED")
        color = {"STAGED": (170, 170, 170), "CONTESTED": (238, 160, 35), "SECURE": (189, 111, 224), "LIMITED": (220, 170, 245), "DENIED": (242, 84, 84)}.get(status, (210, 210, 210))
        draw.ellipse([x0 + 34, y + 4, x0 + 52, y + 22], fill=color)
        draw.text((x0 + 64, y), f"{bls.name}: {status} | score {bls.candidate_score}", font=FONT["small"], fill=(235, 238, 244, 255))
        y += 26
    y += 10
    draw.text((x0 + 30, y), "TERRAIN LEGEND", font=FONT["small_bold"], fill=(190, 204, 222, 255))
    y += 30
    legend = [
        ("Wetland / saltmarsh / water", (68, 200, 165, 190)),
        ("Urban / industrial friction", (238, 174, 55, 185)),
        ("Farmland / scrub", (88, 160, 86, 145)),
        ("Pipeline axis", (82, 28, 105, 230)),
        ("Blue counterattack", (20, 150, 80, 220)),
    ]
    for label, color in legend:
        draw.rounded_rectangle([x0 + 34, y + 6, x0 + 72, y + 20], radius=3, fill=color)
        draw.text((x0 + 88, y), label, font=FONT["small"], fill=(235, 238, 244, 255))
        y += 28
    y = IMAGE_SIZE[1] - 104
    draw.text((x0 + 30, y - 34), "OPERATION CLOCK", font=FONT["small_bold"], fill=(190, 204, 222, 255))
    bar_x0, bar_x1 = x0 + 30, IMAGE_SIZE[0] - 35
    draw.line([(bar_x0, y), (bar_x1, y)], fill=(82, 103, 127, 255), width=8)
    for i in range(12):
        tx = int(bar_x0 + (bar_x1 - bar_x0) * i / 11)
        r = 10 if i == step.index else 6
        fill = (255, 218, 106, 255) if i == step.index else (150, 164, 184, 255)
        draw.ellipse([tx - r, y - r, tx + r, y + r], fill=fill)
    draw.text((bar_x0, y + 22), "H", font=FONT["tiny"], fill=(190, 204, 222, 255))
    draw.text((bar_x1 - 50, y + 22), "H+144", font=FONT["tiny"], fill=(190, 204, 222, 255))


def render_step(step: Step, base: Image.Image) -> None:
    map_img = base.copy().resize((MAP_W, MAP_H))
    map_img = ImageEnhance.Contrast(map_img).enhance(1.08)
    map_img = ImageEnhance.Brightness(map_img).enhance(1.03)
    map_img = ImageEnhance.Color(map_img).enhance(1.04)
    map_img = ImageEnhance.Sharpness(map_img).enhance(1.20)
    canvas = Image.new("RGBA", IMAGE_SIZE, (0, 0, 0, 255))
    canvas.alpha_composite(map_img, (0, 0))
    overlay = Image.new("RGBA", IMAGE_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw_terrain(draw)
    draw_aor(draw)
    draw_pipeline_and_obj(draw, step)
    draw_phase_and_axis(draw, step)
    for bls in BLS_LIST:
        draw_bls(draw, bls, step.bls_status.get(bls.name, "STAGED"))
    draw_units(draw, step)
    draw_scale_and_north(draw)
    draw.rounded_rectangle([24, 20, MAP_W - 24, 84], radius=12, fill=(10, 18, 28, 218), outline=(255, 255, 255, 70), width=1)
    draw.text((46, 34), "Brega-Ajdabiya Amphibious Wargame 2", font=FONT["subtitle"], fill=(255, 255, 255, 255))
    draw.text((560, 38), "Terrain-informed beach selection and mobility adjudication", font=FONT["small"], fill=(210, 222, 238, 255))
    draw_panel(draw, step)
    final = Image.alpha_composite(canvas, overlay).convert("RGB")
    final.save(OUT_DIR / f"step{step.index:02d}.png", "PNG")
    final.save(OUT_DIR / f"step{step.index:02d}.jpeg", "JPEG", quality=94, subsampling=0)


def terrain_features_geojson() -> list[dict]:
    out: list[dict] = []
    for feat in TERRAIN:
        if feat.fclass not in TERRAIN_DRAW:
            continue
        effect = "mobility_obstacle" if feat.fclass in HARD_WATER else "cover_and_mobility_friction" if feat.fclass in BAD_LAND else "minor_mobility_friction"
        out.append(
            {
                "type": "Feature",
                "geometry": copy.deepcopy(feat.geometry),
                "properties": {
                    "source": feat.source_path,
                    "fclass": feat.fclass,
                    "name": feat.name,
                    "terrain_effect": effect,
                },
            }
        )
    return out


def base_operational_features(step: Step) -> list[dict]:
    feats = [copy.deepcopy(f) for f in AO_FEATURES]
    for bls in BLS_LIST:
        feats.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": list(bls.coord)},
                "properties": {
                    "source": "wargame2-gis-selection",
                    "name": bls.name,
                    "role": bls.role,
                    "capacity": bls.capacity,
                    "throughput_factor": bls.throughput,
                    "candidate_score": bls.candidate_score,
                    "terrain_friction": bls.terrain_friction,
                    "nearest_blue_uid": bls.nearest_blue_uid,
                    "nearest_blue_km": bls.nearest_blue_km,
                    "mobility_summary": bls.mobility_summary,
                    "selection_rationale": bls.selection_rationale,
                    "satellite_xy": list(bls.satellite_xy) if bls.satellite_xy else None,
                    "satellite_rgb": list(bls.satellite_rgb) if bls.satellite_rgb else None,
                    "shoreline_validated": bls.shoreline_validated,
                    "status": step.bls_status.get(bls.name, "STAGED"),
                },
            }
        )
    feats.append(
        {
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": [list(p) for p in PIPELINE_ROUTE]},
            "properties": {"source": "public-route-approximation", "name": "Nasser-Brega pipeline route", "terrain_role": "phase-3 exploitation axis"},
        }
    )
    feats.append(
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": list(OBJ_NASSER["coord"])},
            "properties": {
                "source": "wargame2-objective",
                "name": OBJ_NASSER["name"],
                "target_type": "Pipeline control / interdiction sector",
                "objective_status": step.objective_status,
                "depth_from_coast_km": OBJ_NASSER["target_depth_km"],
                "carver_assessment": {
                    "criticality": 7,
                    "accessibility": 6,
                    "recuperability": 7,
                    "vulnerability": 6,
                    "effect": 6,
                    "recognizability": 5,
                    "total": 37,
                    "scale": "1-10 per factor, total /60",
                },
            },
        }
    )
    return feats


def red_features(step: Step) -> list[dict]:
    features: list[dict] = []
    for unit in RED_UNITS:
        coord = red_position(unit, step)
        status = "STAGED" if step.index < unit["appear"] else "ACTIVE"
        if unit["uid"] in step.red_degraded:
            status = "DEGRADED"
        if unit["role"] == "Explosive USVs" and step.index > 4:
            status = "EXPENDED"
        elif unit["role"] == "EW" and step.index >= 7:
            status = "DISPLACED"
        xy, rgb, sea = satellite_info(coord)
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": list(coord)},
                "properties": {
                    "unit_uid": unit["uid"],
                    "id": unit["label"],
                    "side": "RED",
                    "echelon": unit["echelon"],
                    "role": unit["role"],
                    "assigned_bls": unit["bls"],
                    "status": status,
                    "action": "ADVANCE" if status in {"ACTIVE", "DEGRADED"} and unit["role"] not in {"EW", "Fire support", "Explosive USVs", "CBRN defense"} else unit["role"].upper(),
                    "strength_current": 0.70 if status == "DEGRADED" else 1.0,
                    "adjudication_note": "Aggregate formation marker; losses are company-equivalent at scenario level.",
                    "satellite_xy": list(xy) if xy else None,
                    "satellite_rgb": list(rgb) if rgb else None,
                    "satellite_sea_pixel": sea,
                    "offshore_expected": bool(step.index < unit["appear"] or unit["role"] == "Explosive USVs"),
                },
            }
        )
    return features


def blue_features(step: Step) -> list[dict]:
    destroyed = set(step.blue_destroyed)
    features: list[dict] = []
    for unit in BLUE_UNITS:
        label = unit["label"]
        status = "DESTROYED" if label in destroyed else "ACTIVE"
        raw = blue_raw_position(unit, step)
        coord, snapped, xy, rgb = snap_ground_coord(raw)
        _, _, sea = satellite_info(coord)
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": list(coord)},
                "properties": {
                    "unit_uid": unit["uid"],
                    "id": label,
                    "side": "BLUE",
                    "echelon": unit["echelon"],
                    "status": status,
                    "action": blue_action(label, step),
                    "posture": "MOBILE_RESERVE" if blue_action(label, step) == "COUNTERATTACK" else "AREA_DEFENSE",
                    "source_index": unit["source_index"],
                    "sidc": unit["sidc"],
                    "strength_current": 0.0 if status == "DESTROYED" else 1.0,
                    "source_coord": list(raw),
                    "satellite_land_snap_applied": snapped,
                    "satellite_xy": list(xy) if xy else None,
                    "satellite_rgb": list(rgb) if rgb else None,
                    "satellite_sea_pixel": sea,
                },
            }
        )
    return features


def write_step_geojson(step: Step) -> None:
    features = terrain_features_geojson() + base_operational_features(step) + red_features(step) + blue_features(step)
    data = {
        "type": "FeatureCollection",
        "metadata": {
            "run_id": "Wargame2",
            "scenario_name": "Brega-Ajdabiya GIS-informed amphibious assault",
            "model_version": MODEL_VERSION,
            "source_files": [
                str(SOURCE_GEOJSON.relative_to(ROOT)),
                str(ENEMY_DOCX.relative_to(ROOT)),
                str(LANDUSE.relative_to(ROOT)),
                str(INLAND_WATER.relative_to(ROOT)),
                str(WATER_WAY.relative_to(ROOT)),
            ],
            "step_index": step.index,
            "time_label": step.time_label,
            "elapsed_hours": step.hours,
            "phase": step.phase,
            "phase_line_km": step.phase_line_km,
            "objective_status": step.objective_status,
            "decision_point": step.decision_point,
            "narrative_en": step.narrative_en,
            "adjudication_method": "Deterministic operational matrix using BLS terrain score, throughput, EW, artillery/USV shock, mobility friction, Blue reserve timing, and phase-line progress.",
            "terrain_effects": {
                "hard_water": sorted(HARD_WATER),
                "urban_industrial": sorted(BAD_LAND),
                "soft_ground": sorted(SOFT_LAND),
                "limitations": "No local bathymetry, beach gradient, surf, road network, or elevation layer was available.",
            },
            "selected_bls": [
                {
                    "name": b.name,
                    "coord": list(b.coord),
                    "score": b.candidate_score,
                    "terrain_friction": b.terrain_friction,
                    "role": b.role,
                    "nearest_blue": b.nearest_blue_uid,
                    "nearest_blue_km": b.nearest_blue_km,
                    "satellite_xy": list(b.satellite_xy) if b.satellite_xy else None,
                    "satellite_rgb": list(b.satellite_rgb) if b.satellite_rgb else None,
                    "shoreline_validated": b.shoreline_validated,
                }
                for b in BLS_LIST
            ],
            "force_ratio": step.force_ratio,
            "mobility_state": step.mobility_state,
            "ew_effect": step.ew_effect,
            "logistics_state": step.logistics_state,
            "bls_status": step.bls_status,
            "losses_cumulative": {
                "blue_destroyed": len(step.blue_destroyed),
                "blue_total": len(BLUE_UNITS),
                "red_company_equivalent": step.red_losses,
            },
        },
        "features": features,
    }
    (OUT_DIR / f"step{step.index:02d}.geojson").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def write_selection_files() -> None:
    cand_features = []
    for cand in BLS_CANDIDATES:
        cand_features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": list(cand.coord)},
                "properties": {
                    "source": "coastline-sample",
                    "score": round(cand.score, 1),
                    "nearest_blue_uid": cand.nearest_blue_uid,
                    "nearest_blue_km": round(cand.nearest_blue_km, 2),
                    "nearest_bad_land": cand.bad_class,
                    "nearest_bad_land_name": cand.bad_name,
                    "nearest_bad_land_km": round(cand.bad_km, 2),
                    "nearest_water": cand.water_class,
                    "nearest_water_name": cand.water_name,
                    "nearest_water_km": round(cand.water_km, 2),
                    "selected": False,
                },
            }
        )
    for bls in BLS_LIST:
        cand_features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": list(bls.coord)},
                "properties": {
                    "source": "wargame2-gis-selection",
                    "name": bls.name,
                    "role": bls.role,
                    "capacity": bls.capacity,
                    "throughput_factor": bls.throughput,
                    "score": bls.candidate_score,
                    "terrain_friction": bls.terrain_friction,
                    "nearest_blue_uid": bls.nearest_blue_uid,
                    "nearest_blue_km": bls.nearest_blue_km,
                    "mobility_summary": bls.mobility_summary,
                    "selection_rationale": bls.selection_rationale,
                    "satellite_xy": list(bls.satellite_xy) if bls.satellite_xy else None,
                    "satellite_rgb": list(bls.satellite_rgb) if bls.satellite_rgb else None,
                    "shoreline_validated": bls.shoreline_validated,
                    "selected": True,
                },
            }
        )
    selection = {
        "type": "FeatureCollection",
        "metadata": {
            "model_version": MODEL_VERSION,
            "source_files": [str(LANDUSE.relative_to(ROOT)), str(INLAND_WATER.relative_to(ROOT)), str(SOURCE_GEOJSON.relative_to(ROOT))],
            "score_terms": "defender distance + water/saltmarsh separation + urban/industrial separation + soft-ground separation; with penalties for proximity to defenders, hard water, and Brega urban/industrial terrain.",
            "selected_bls_count": 4,
        },
        "features": cand_features,
    }
    (OUT_DIR / "bls_selection.geojson").write_text(json.dumps(selection, ensure_ascii=False, indent=2), encoding="utf-8")
    terrain_ref = {
        "type": "FeatureCollection",
        "metadata": {
            "model_version": MODEL_VERSION,
            "source_files": [str(LANDUSE.relative_to(ROOT)), str(INLAND_WATER.relative_to(ROOT)), str(WATER_WAY.relative_to(ROOT))],
            "feature_count": len(terrain_features_geojson()),
            "note": "Terrain features clipped by bounding-box intersection, not geometrically clipped.",
        },
        "features": terrain_features_geojson(),
    }
    (OUT_DIR / "terrain_reference.geojson").write_text(json.dumps(terrain_ref, ensure_ascii=False, indent=2), encoding="utf-8")


def render_all() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    write_selection_files()
    base = fetch_basemap()
    for step in STEPS:
        write_step_geojson(step)
        render_step(step, base)
        print(
            f"Wargame2 step {step.index:02d}: {step.time_label:>6} "
            f"{step.phase:<10} PL={step.phase_line_km:>3} OBJ={step.objective_status:<10} "
            f"B={len(step.blue_destroyed):02d}/39 R={step.red_losses}"
        )
    print("Selected BLS:")
    for bls in BLS_LIST:
        lon, lat = bls.coord
        print(f"  {bls.name}: {lon:.6f}, {lat:.6f} | score {bls.candidate_score} | {bls.role}")


if __name__ == "__main__":
    render_all()
