"""
Operational wargame renderer for the Brega-Ajdabiya amphibious scenario.

Outputs:
  Wargame1/step00.geojson ... step11.geojson
  Wargame1/step00.png     ... step11.png
  Wargame1/step00.jpeg    ... step11.jpeg
  Wargame2/step00.geojson ... step11.geojson
  Wargame2/step00.png     ... step11.png
  Wargame2/step00.jpeg    ... step11.jpeg

Wargame1 is the baseline enemy COA #1 run.
Wargame2 is the same enemy COA with an earlier, more concentrated Blue reserve
response branch. The Arabic operation report is generated separately for
Wargame1 only.
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


ROOT = Path("/Users/hextechkraken/Desktop/TestingAI")
SOURCE_GEOJSON = ROOT / "nato-map-layers.geojson"
CURRENT_GEOJSON = ROOT / "Current.geojson"
OUT_DIRS = {
    "Wargame1": ROOT / "Wargame1",
    "Wargame2": ROOT / "Wargame2",
}

MODEL_VERSION = "brega-amphib-v2.0"

# Corrected operational graphics. The BLS names are retained for continuity, but
# the main-effort BLS is moved west to the broader dry beach belt, while BLS-4 is
# explicitly treated as an external envelopment landing rather than an internal
# gap inside the source Blue AO.
BLS = [
    {
        "name": "BLS-1",
        "coord": (19.28230656738281, 30.283595505672256),
        "role": "West fixing landing",
        "capacity": "Limited",
        "note": "Dry beach and exit track; useful as a fixing lodgement.",
    },
    {
        "name": "BLS-2",
        "coord": (19.364838720703126, 30.308385780073603),
        "role": "Supporting landing",
        "capacity": "Medium",
        "note": "Usable beach but inland wet/sabkha ground constrains expansion.",
    },
    {
        "name": "BLS-3",
        "coord": (19.45000000000000, 30.35000000000000),
        "role": "Main effort",
        "capacity": "Medium",
        "note": "Broader dry beach belt west of Brega; chosen as corrected main effort.",
    },
    {
        "name": "BLS-4",
        "coord": (19.678221679687503, 30.45648006968434),
        "role": "External envelopment",
        "capacity": "Limited",
        "note": "Outside source Blue AO; used as an external flank landing and not as an internal gap.",
    },
]
BLS_BY_NAME = {b["name"]: b for b in BLS}

# Approximate GEM-published pipeline route, coast-to-field. Coordinates are
# lon, lat. OBJ NASSER is placed on the route near the 95 km operational depth
# band rather than as a straight-line midpoint.
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
    "radius_km": 5.0,
    "description": "Operational objective on the Nasser-Brega pipeline near the 95 km depth band.",
}

MAP_BBOX = (19.12, 29.50, 20.02, 30.56)  # lon W, lat S, lon E, lat N
IMAGE_SIZE = (2400, 1350)
PANEL_W = 610
MAP_W = IMAGE_SIZE[0] - PANEL_W
MAP_H = IMAGE_SIZE[1]
R_EARTH = 6378137.0


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Supplemental/Helvetica Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Helvetica.ttf",
        "/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except Exception:
            pass
    return ImageFont.load_default()


FONT = {
    "title": load_font(32, True),
    "subtitle": load_font(22, True),
    "body": load_font(20, False),
    "body_bold": load_font(20, True),
    "small": load_font(16, False),
    "small_bold": load_font(16, True),
    "tiny": load_font(13, False),
    "tiny_bold": load_font(13, True),
    "map_label": load_font(18, True),
    "unit": load_font(15, True),
}


def lonlat_to_merc(lon: float, lat: float) -> tuple[float, float]:
    return (
        math.radians(lon) * R_EARTH,
        math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)) * R_EARTH,
    )


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


def lerp(a: tuple[float, float], b: tuple[float, float], t: float) -> tuple[float, float]:
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def offset_lonlat(coord: tuple[float, float], east_km: float = 0.0, north_km: float = 0.0) -> tuple[float, float]:
    lon, lat = coord
    return (
        lon + east_km / (111.32 * math.cos(math.radians(lat))),
        lat + north_km / 110.57,
    )


def route_point(route: list[tuple[float, float]], distance_km: float) -> tuple[float, float]:
    acc = 0.0
    for i in range(len(route) - 1):
        seg = haversine_km(route[i], route[i + 1])
        if acc + seg >= distance_km:
            return lerp(route[i], route[i + 1], (distance_km - acc) / seg)
        acc += seg
    return route[-1]


def fetch_basemap() -> Image.Image:
    cache = Path("/private/tmp/brega_wargame_esri_base_v3_4326.jpg")
    if cache.exists():
        return Image.open(cache).convert("RGBA")

    w, s, e, n = MAP_BBOX
    url = (
        "https://services.arcgisonline.com/arcgis/rest/services/"
        f"World_Imagery/MapServer/export?bbox={w},{s},{e},{n}"
        f"&bboxSR=4326&imageSR=4326&size={MAP_W},{MAP_H}&format=jpg&f=image"
    )
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=90) as response:
            data = response.read()
        cache.write_bytes(data)
        return Image.open(BytesIO(data)).convert("RGBA")
    except Exception:
        # Fallback: a restrained military-map style background if imagery is unavailable.
        img = Image.new("RGBA", (MAP_W, MAP_H), (222, 217, 194, 255))
        d = ImageDraw.Draw(img)
        for y in range(0, MAP_H, 12):
            col = int(215 + 18 * (y / MAP_H))
            d.line([(0, y), (MAP_W, y)], fill=(col, col - 5, col - 22, 255), width=12)
        d.rectangle([0, 0, MAP_W, int(MAP_H * 0.22)], fill=(46, 86, 102, 255))
        return img


class Projector:
    def __init__(self, bbox: tuple[float, float, float, float]):
        self.w, self.s, self.e, self.n = bbox

    def __call__(self, lon: float, lat: float) -> tuple[int, int]:
        # The Esri export is requested in EPSG:4326 so the visual projection is
        # simple lon/lat. The distortion over this tactical extent is minor and
        # the symbols align cleanly with the imagery.
        x = (lon - self.w) / (self.e - self.w) * MAP_W
        y = (self.n - lat) / (self.n - self.s) * MAP_H
        return int(round(x)), int(round(y))


P = Projector(MAP_BBOX)


def text_bbox(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, font: ImageFont.ImageFont) -> tuple[int, int, int, int]:
    return draw.textbbox(xy, text, font=font)


def draw_text_halo(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    font: ImageFont.ImageFont,
    fill: tuple[int, int, int, int] | str,
    halo: tuple[int, int, int, int] | str = (255, 255, 255, 230),
    anchor: str | None = None,
) -> None:
    x, y = xy
    for dx, dy in [(-2, 0), (2, 0), (0, -2), (0, 2), (-1, -1), (1, 1), (-1, 1), (1, -1)]:
        draw.text((x + dx, y + dy), text, font=font, fill=halo, anchor=anchor)
    draw.text((x, y), text, font=font, fill=fill, anchor=anchor)


def draw_wrapped(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    font: ImageFont.ImageFont,
    fill: tuple[int, int, int, int] | str,
    width_chars: int,
    line_h: int,
) -> int:
    x, y = xy
    for line in textwrap.wrap(text, width_chars):
        draw.text((x, y), line, font=font, fill=fill)
        y += line_h
    return y


def draw_dashed_line(
    draw: ImageDraw.ImageDraw,
    points: list[tuple[int, int]],
    fill: tuple[int, int, int, int],
    width: int = 3,
    dash: int = 18,
    gap: int = 12,
) -> None:
    for a, b in zip(points, points[1:]):
        x1, y1 = a
        x2, y2 = b
        dist = math.hypot(x2 - x1, y2 - y1)
        if dist == 0:
            continue
        ux, uy = (x2 - x1) / dist, (y2 - y1) / dist
        n = 0.0
        while n < dist:
            m = min(n + dash, dist)
            draw.line(
                [(x1 + ux * n, y1 + uy * n), (x1 + ux * m, y1 + uy * m)],
                fill=fill,
                width=width,
            )
            n += dash + gap


def draw_arrow(
    draw: ImageDraw.ImageDraw,
    a: tuple[int, int],
    b: tuple[int, int],
    fill: tuple[int, int, int, int],
    width: int = 14,
    head_len: int = 38,
    head_w: int = 32,
) -> None:
    x1, y1 = a
    x2, y2 = b
    dx, dy = x2 - x1, y2 - y1
    dist = math.hypot(dx, dy)
    if dist < 10:
        return
    ux, uy = dx / dist, dy / dist
    px, py = -uy, ux
    shaft_end = (x2 - ux * head_len, y2 - uy * head_len)
    draw.line([a, shaft_end], fill=fill, width=width)
    head = [
        (x2, y2),
        (shaft_end[0] + px * head_w / 2, shaft_end[1] + py * head_w / 2),
        (shaft_end[0] - px * head_w / 2, shaft_end[1] - py * head_w / 2),
    ]
    draw.polygon(head, fill=fill)


def draw_unit_box(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    label: str,
    side: str,
    echelon: str,
    status: str = "ACTIVE",
    action: str = "",
    label_it: bool = True,
) -> None:
    x, y = xy
    sizes = {
        "company": (30, 18),
        "battalion": (38, 22),
        "brigade": (48, 28),
        "division": (58, 32),
        "support": (42, 24),
    }
    w, h = sizes.get(echelon, (34, 20))
    if side == "BLUE":
        outline = (25, 77, 170, 255)
        fill = (223, 235, 255, 240)
        label_fill = (10, 42, 120, 255)
        if action == "COUNTERATTACK":
            fill = (192, 236, 214, 250)
            outline = (12, 120, 70, 255)
    else:
        outline = (172, 30, 30, 255)
        fill = (255, 210, 210, 245)
        label_fill = (132, 20, 20, 255)
        if status == "DEGRADED":
            fill = (255, 224, 177, 245)
            outline = (180, 95, 20, 255)

    if status in ("DESTROYED", "NEUTRALIZED"):
        fill = (156, 156, 156, 210)
        outline = (85, 85, 85, 255)
        label_fill = (80, 80, 80, 255)

    rect = [x - w // 2, y - h // 2, x + w // 2, y + h // 2]
    draw.rounded_rectangle(rect, radius=3, fill=fill, outline=outline, width=3)
    if side == "BLUE":
        draw.line([(rect[0] + 4, rect[1] + 4), (rect[2] - 4, rect[3] - 4)], fill=outline, width=2)
        draw.line([(rect[0] + 4, rect[3] - 4), (rect[2] - 4, rect[1] + 4)], fill=outline, width=2)
    else:
        draw.line([(rect[0] + 7, y), (rect[2] - 7, y)], fill=outline, width=2)
        draw.line([(x, rect[1] + 5), (x, rect[3] - 5)], fill=outline, width=2)
    if echelon in ("battalion", "brigade", "division"):
        marks = {"battalion": "II", "brigade": "X", "division": "XX"}[echelon]
        draw_text_halo(draw, (x, rect[1] - 15), marks, FONT["tiny_bold"], outline, anchor="mm")
    if status in ("DESTROYED", "NEUTRALIZED"):
        draw.line([(rect[0] - 5, rect[1] - 5), (rect[2] + 5, rect[3] + 5)], fill=(215, 28, 28, 255), width=4)
        draw.line([(rect[0] - 5, rect[3] + 5), (rect[2] + 5, rect[1] - 5)], fill=(215, 28, 28, 255), width=4)
    if action == "WITHDRAW":
        draw.arc([x - 26, y - 26, x + 26, y + 26], 30, 140, fill=(70, 70, 120, 255), width=3)
    if label_it:
        draw_text_halo(draw, (x + w // 2 + 6, y - 9), label, FONT["unit"], label_fill)


def draw_bls(draw: ImageDraw.ImageDraw, name: str, coord: tuple[float, float], status: str) -> None:
    x, y = P(*coord)
    status_color = {
        "STAGED": (110, 110, 110, 255),
        "CONTESTED": (238, 160, 35, 255),
        "SECURE": (145, 42, 190, 255),
        "DENIED": (210, 30, 30, 255),
        "LIMITED": (185, 95, 210, 255),
    }.get(status, (145, 42, 190, 255))
    r = 31
    draw.pieslice([x - r, y - r, x + r, y + r], 180, 360, fill=(155, 45, 205, 96), outline=status_color, width=4)
    draw.line([(x - r, y), (x + r, y)], fill=status_color, width=4)
    draw.line([(x, y), (x, y - 38)], fill=status_color, width=3)
    label = f"{name} {status}"
    bb = text_bbox(draw, (0, 0), label, FONT["tiny_bold"])
    tw, th = bb[2] - bb[0], bb[3] - bb[1]
    draw.rounded_rectangle([x - tw // 2 - 7, y + 8, x + tw // 2 + 7, y + 8 + th + 8], radius=5, fill=(35, 20, 45, 220))
    draw.text((x, y + 11), label, font=FONT["tiny_bold"], fill=(255, 255, 255, 255), anchor="ma")


def draw_scale_and_north(draw: ImageDraw.ImageDraw) -> None:
    # 20 km scale, local approximation at bottom-left.
    lon0, lat0 = 19.18, 29.56
    p0 = P(lon0, lat0)
    lon1 = lon0 + 20.0 / (111.32 * math.cos(math.radians(lat0)))
    p1 = P(lon1, lat0)
    y = p0[1]
    draw.line([p0, (p1[0], y)], fill=(255, 255, 255, 240), width=7)
    draw.line([p0, (p1[0], y)], fill=(30, 30, 30, 255), width=3)
    draw.text((p0[0], y - 26), "20 km", font=FONT["small_bold"], fill=(255, 255, 255, 255))
    nx, ny = P(19.93, 30.47)
    draw.polygon([(nx, ny - 34), (nx - 12, ny + 6), (nx + 12, ny + 6)], fill=(255, 255, 255, 245), outline=(20, 20, 20, 255))
    draw.text((nx, ny + 12), "N", font=FONT["small_bold"], fill=(255, 255, 255, 255), anchor="ma")


@dataclass
class Step:
    step_index: int
    time_label: str
    elapsed_hours: int
    phase: str
    phase_line_km: int
    objective_status: str
    progress: float
    ew_effect: str
    decision_point: str
    headline: str
    narrative_ar: str
    narrative_en: str
    blue_destroyed: list[str] = field(default_factory=list)
    blue_actions: dict[str, str] = field(default_factory=dict)
    red_strength_losses: int = 0
    red_degraded: list[str] = field(default_factory=list)
    force_ratio: str = "Not decisive"
    confidence: str = "Medium"
    bls_status: dict[str, str] = field(default_factory=dict)
    logistics_state: str = "Sustained with friction"


def cumulative(items: list[list[str]], idx: int) -> list[str]:
    seen: list[str] = []
    for group in items[: idx + 1]:
        for item in group:
            if item and item not in seen:
                seen.append(item)
    return seen


def make_steps(run_id: str) -> list[Step]:
    if run_id == "Wargame1":
        losses_by_step = [
            [],
            [],
            [],
            ["c112", "c113", "c121"],
            ["c122", "c123", "c111", "c131"],
            ["c213"],
            ["c211", "c212", "c132", "c133"],
            ["c221", "c222", "c231", "c232", "c233"],
            ["c311", "c312", "c313"],
            ["c321", "c322", "c331", "c332"],
            ["c323", "c333", "p31c", "p32c"],
            ["p33c", "lc"],
        ]
        template = [
            (0, "D-3h", -3, "PRE-H", 0, "DORMANT", 0.00, "Idle", "Red staging", "Initial disposition", "Blue routine readiness; Red amphibious force staged offshore."),
            (1, "H-Hour", 0, "PHASE 1", 1, "DORMANT", 0.01, "Active", "Recon lodgement", "Recon and security elements land", "401 Recon and advance teams form shallow lodgements."),
            (2, "H+2", 2, "PHASE 1", 2, "DORMANT", 0.02, "Heavy", "Beach contested", "Electronic attack peaks", "Blue forward companies engage under degraded C2."),
            (3, "H+6", 6, "PHASE 2A", 5, "DORMANT", 0.05, "Heavy", "4th MID ashore", "Main landing wave", "4th Mechanized Infantry Division assault groups land through four BLS."),
            (4, "H+12", 12, "PHASE 2A", 8, "DORMANT", 0.08, "Heavy", "Beachhead expanding", "Lodgement expansion", "Red expands the lodgement and prepares the 9th MID follow-on."),
            (5, "H+24", 24, "PHASE 2A", 8, "DORMANT", 0.08, "Heavy", "Blue local counterattack", "Local counterattack", "Blue local counterattack damages the eastern envelopment but does not seal the beachhead."),
            (6, "H+36", 36, "PHASE 2B", 12, "DORMANT", 0.12, "Heavy", "9th MID committed", "Beachhead secure", "9th MID begins landing; Red consolidates a 10-12 km lodgement."),
            (7, "H+48", 48, "PHASE 2B", 45, "THREATENED", 0.45, "Heavy", "Deep push", "Follow-on drive south", "9th MID drives toward the 40-50 km phase line; Blue reserve is preparing."),
            (8, "H+72", 72, "PHASE 3", 65, "THREATENED", 0.65, "Moderate", "1st AD landing", "Armored exploitation begins", "1st Armored Division lands through secured BLS-3/BLS-4 and pushes south."),
            (9, "H+96", 96, "PHASE 3", 75, "THREATENED", 0.75, "Moderate", "Blue reserve counterattack", "Operational reserve committed", "Blue division reserve counterattacks; Red pauses and absorbs losses."),
            (10, "H+120", 120, "PHASE 3", 92, "CONTESTED", 0.92, "Low", "Breakthrough", "Objective ring contested", "Red armored exploitation resumes and reaches the OBJ NASSER security ring."),
            (11, "H+144", 144, "RESOLUTION", 100, "CAPTURED", 1.00, "Low", "Red victory", "Objective captured", "Red captures OBJ NASSER after Blue reserve culminates."),
        ]
        red_losses = [0, 0, 0, 0, 0, 1, 1, 1, 1, 3, 3, 3]
        degraded = [[], [], [], [], [], ["RED_44ARMD"], ["RED_44ARMD"], ["RED_44ARMD"], ["RED_44ARMD"], ["RED_43MECH", "RED_44ARMD"], ["RED_43MECH", "RED_44ARMD"], ["RED_43MECH", "RED_44ARMD"]]
        ratios = ["N/A", "1:1", "1:1", "3.2:1 local", "2.5:1", "2:1 contested", "3.4:1", "4:1 operational", "5:1 operational", "2.2:1 contested", "3.5:1 at OBJ", "Decisive at OBJ"]
        bls_states = [
            {"BLS-1": "STAGED", "BLS-2": "STAGED", "BLS-3": "STAGED", "BLS-4": "STAGED"},
            {"BLS-1": "CONTESTED", "BLS-2": "CONTESTED", "BLS-3": "CONTESTED", "BLS-4": "CONTESTED"},
            {"BLS-1": "CONTESTED", "BLS-2": "CONTESTED", "BLS-3": "CONTESTED", "BLS-4": "CONTESTED"},
            {"BLS-1": "CONTESTED", "BLS-2": "CONTESTED", "BLS-3": "CONTESTED", "BLS-4": "CONTESTED"},
            {"BLS-1": "SECURE", "BLS-2": "CONTESTED", "BLS-3": "SECURE", "BLS-4": "LIMITED"},
            {"BLS-1": "SECURE", "BLS-2": "CONTESTED", "BLS-3": "SECURE", "BLS-4": "CONTESTED"},
            {"BLS-1": "SECURE", "BLS-2": "SECURE", "BLS-3": "SECURE", "BLS-4": "LIMITED"},
            {"BLS-1": "SECURE", "BLS-2": "SECURE", "BLS-3": "SECURE", "BLS-4": "LIMITED"},
            {"BLS-1": "SECURE", "BLS-2": "SECURE", "BLS-3": "SECURE", "BLS-4": "SECURE"},
            {"BLS-1": "SECURE", "BLS-2": "SECURE", "BLS-3": "SECURE", "BLS-4": "LIMITED"},
            {"BLS-1": "SECURE", "BLS-2": "SECURE", "BLS-3": "SECURE", "BLS-4": "SECURE"},
            {"BLS-1": "SECURE", "BLS-2": "SECURE", "BLS-3": "SECURE", "BLS-4": "SECURE"},
        ]
        arabic = [
            "الفريق الأحمر في وضع تجميع بحري، والفريق الأزرق في جاهزية دفاعية اعتيادية داخل منطقة العمليات.",
            "تنزل عناصر الاستطلاع والتأمين لتأسيس موطئ قدم محدود على الشاطئ مع بدء تأثير الحرب الإلكترونية.",
            "تبلغ الإعاقة الإلكترونية ذروتها، وتشتبك سرايا المقدمة الزرقاء مع مواضع الإبرار قبل وصول الموجة الثقيلة.",
            "تصل موجة فرقة المشاة الآلية الرابعة بدعم المدفعية والزوارق المسيّرة، وتبدأ خسائر الخط الساحلي الأزرق.",
            "يتسع رأس الشاطئ وتصبح BLS-3 محور الجهد الرئيسي، بينما يجري تثبيت الجناحين غرباً وشرقاً.",
            "ينفذ الأزرق هجوماً مضاداً محلياً يضر باللواء المدرع 44، لكنه لا يغلق ممرات الإنزال.",
            "تبدأ فرقة المشاة الآلية التاسعة بالعبور عبر الشواطئ المؤمنة، ويتحول القتال إلى عمق 10-12 كم.",
            "يندفع الأحمر إلى خط 40-50 كم، وتصبح منطقة الهدف ناصر مهددة؛ الاحتياط الأزرق لا يزال في مرحلة التحضير.",
            "تنزل الفرقة المدرعة الأولى وتبدأ مرحلة الاستثمار باتجاه الجنوب الشرقي على محور خط الأنابيب.",
            "يلتزم الاحتياط العملياتي الأزرق بهجوم مضاد يؤخر الاندفاع الأحمر ويوقع خسائر، لكنه يأتي بعد تشكل رأس الجسر.",
            "يعيد الأحمر تنظيم قواته ويدخل حلقة الهدف، وتصبح السيطرة على OBJ NASSER متنازعاً عليها.",
            "ينهار الدفاع المباشر حول الهدف بعد استنزاف الاحتياط، ويثبت الأحمر السيطرة على OBJ NASSER.",
        ]
    else:
        losses_by_step = [
            [],
            [],
            [],
            ["c112", "c113"],
            ["c121", "c122"],
            ["c211", "c123"],
            ["c212", "c131"],
            ["c221", "c222", "c231"],
            ["c232", "c311"],
            ["c312", "c321"],
            ["c322", "p31c"],
            ["c323", "p32c"],
        ]
        template = [
            (0, "D-3h", -3, "PRE-H", 0, "DORMANT", 0.00, "Idle", "Red staging", "Initial disposition", "Blue routine readiness; Red amphibious force staged offshore."),
            (1, "H-Hour", 0, "PHASE 1", 1, "DORMANT", 0.01, "Active", "Recon lodgement", "Recon and security elements land", "401 Recon and advance teams form shallow lodgements."),
            (2, "H+2", 2, "PHASE 1", 2, "DORMANT", 0.02, "Heavy", "Beach contested", "Electronic attack peaks", "Blue forward companies engage under degraded C2."),
            (3, "H+6", 6, "PHASE 2A", 5, "DORMANT", 0.05, "Heavy", "4th MID ashore", "Main landing wave", "4th MID lands but Blue retains a coherent second line."),
            (4, "H+12", 12, "PHASE 2A", 7, "DORMANT", 0.07, "Heavy", "Early reserve release", "Blue commits reserve earlier", "Blue reserve is released while the beachhead is still shallow."),
            (5, "H+24", 24, "PHASE 2A", 9, "DORMANT", 0.09, "Heavy", "Counterattack at beachhead", "Coordinated counterattack", "Blue coordinated counterattack slows the eastern and main-effort lanes."),
            (6, "H+36", 36, "PHASE 2B", 12, "DORMANT", 0.12, "Heavy", "BLS still contested", "Follow-on delayed", "9th MID begins landing but beach throughput remains constrained."),
            (7, "H+48", 48, "PHASE 2B", 28, "THREATENED", 0.28, "Moderate", "Red delayed", "Slow advance", "Red advance reaches only the forward desert line; Blue keeps reserve mass intact."),
            (8, "H+72", 72, "PHASE 3", 40, "THREATENED", 0.40, "Moderate", "1st AD constrained", "Armored exploitation constrained", "1st AD cannot fully clear the beach maintenance area."),
            (9, "H+96", 96, "PHASE 3", 52, "THREATENED", 0.52, "Low", "Blue main counterstroke", "Counterstroke against exploitation", "Blue attacks the exploitation corridor before Red reaches OBJ depth."),
            (10, "H+120", 120, "PHASE 3", 68, "THREATENED", 0.68, "Low", "Red culmination", "Culmination before OBJ", "Red reaches the outer desert approach but cannot generate decisive combat power at OBJ."),
            (11, "H+144", 144, "RESOLUTION", 78, "DENIED", 0.78, "Low", "Blue holds OBJ", "Objective denied", "Blue holds OBJ NASSER outside direct assault range; Red lodgement remains but culminates."),
        ]
        red_losses = [0, 0, 0, 0, 1, 2, 2, 3, 4, 5, 5, 5]
        degraded = [[], [], [], [], ["RED_44ARMD"], ["RED_43MECH", "RED_44ARMD"], ["RED_43MECH", "RED_44ARMD"], ["RED_43MECH", "RED_44ARMD", "RED_9MID"], ["RED_43MECH", "RED_44ARMD", "RED_9MID", "RED_1AD"], ["RED_9MID", "RED_1AD"], ["RED_9MID", "RED_1AD"], ["RED_9MID", "RED_1AD"]]
        ratios = ["N/A", "1:1", "1:1", "2.4:1 contested", "1.8:1 contested", "1.3:1 Blue local", "2:1 contested", "2.2:1", "2:1", "1.5:1 contested", "Below decisive", "Below decisive"]
        bls_states = [
            {"BLS-1": "STAGED", "BLS-2": "STAGED", "BLS-3": "STAGED", "BLS-4": "STAGED"},
            {"BLS-1": "CONTESTED", "BLS-2": "CONTESTED", "BLS-3": "CONTESTED", "BLS-4": "CONTESTED"},
            {"BLS-1": "CONTESTED", "BLS-2": "CONTESTED", "BLS-3": "CONTESTED", "BLS-4": "CONTESTED"},
            {"BLS-1": "CONTESTED", "BLS-2": "CONTESTED", "BLS-3": "CONTESTED", "BLS-4": "CONTESTED"},
            {"BLS-1": "CONTESTED", "BLS-2": "CONTESTED", "BLS-3": "CONTESTED", "BLS-4": "DENIED"},
            {"BLS-1": "SECURE", "BLS-2": "CONTESTED", "BLS-3": "CONTESTED", "BLS-4": "DENIED"},
            {"BLS-1": "SECURE", "BLS-2": "CONTESTED", "BLS-3": "CONTESTED", "BLS-4": "DENIED"},
            {"BLS-1": "SECURE", "BLS-2": "SECURE", "BLS-3": "CONTESTED", "BLS-4": "DENIED"},
            {"BLS-1": "SECURE", "BLS-2": "SECURE", "BLS-3": "LIMITED", "BLS-4": "DENIED"},
            {"BLS-1": "SECURE", "BLS-2": "SECURE", "BLS-3": "LIMITED", "BLS-4": "DENIED"},
            {"BLS-1": "SECURE", "BLS-2": "SECURE", "BLS-3": "LIMITED", "BLS-4": "DENIED"},
            {"BLS-1": "SECURE", "BLS-2": "SECURE", "BLS-3": "LIMITED", "BLS-4": "DENIED"},
        ]
        arabic = [
            "الفريق الأحمر في وضع تجميع بحري، والفريق الأزرق في جاهزية دفاعية اعتيادية داخل منطقة العمليات.",
            "تنزل عناصر الاستطلاع والتأمين لتأسيس موطئ قدم محدود على الشاطئ مع بدء تأثير الحرب الإلكترونية.",
            "تبلغ الإعاقة الإلكترونية ذروتها، وتشتبك سرايا المقدمة الزرقاء مع مواضع الإبرار قبل وصول الموجة الثقيلة.",
            "تصل موجة فرقة المشاة الآلية الرابعة، لكن الخط الأزرق الثاني يحافظ على تماسكه حول ممرات الخروج.",
            "يطلق الأزرق الاحتياط مبكراً قبل أن يكتمل رأس الشاطئ، فيتراجع ضغط الأحمر على الجناح الشرقي.",
            "ينفذ الأزرق ضربة منسقة على رأس الشاطئ؛ تتباطأ الموجة الرئيسية ويخسر الأحمر جزءاً من قوة الدفع.",
            "يحاول الأحمر إدخال فرقة المشاة التاسعة، لكن throughput الشاطئ لا يزال محدوداً بسبب استمرار الاشتباك.",
            "يصل الأحمر إلى عمق أقل من المخطط، ويظل الاحتياط الأزرق قادراً على المناورة في العمق.",
            "تبدأ الفرقة المدرعة الأولى الاستثمار، لكنها مقيدة بممرات صيانة الشاطئ وبقاء BLS-4 محرومة.",
            "يضرب الأزرق ممر الاستثمار قبل بلوغ عمق الهدف، فينخفض الزخم الأحمر إلى مستوى غير حاسم.",
            "يبلغ الأحمر نقطة ذروة العمليات قبل الوصول إلى الهدف، ويبقى OBJ NASSER خارج مدى السيطرة المباشرة.",
            "ينتهي التشغيل ببقاء الهدف ناصر محمياً، مع احتفاظ الأحمر برأس شاطئ غير كاف لتحقيق الهدف النهائي.",
        ]

    steps: list[Step] = []
    for i, row in enumerate(template):
        destroyed = cumulative(losses_by_step, i)
        step = Step(
            step_index=row[0],
            time_label=row[1],
            elapsed_hours=row[2],
            phase=row[3],
            phase_line_km=row[4],
            objective_status=row[5],
            progress=row[6],
            ew_effect=row[7],
            decision_point=row[8],
            headline=row[9],
            narrative_ar=arabic[i],
            narrative_en=row[10],
            blue_destroyed=destroyed,
            red_strength_losses=red_losses[i],
            red_degraded=degraded[i],
            force_ratio=ratios[i],
            bls_status=bls_states[i],
            logistics_state="Secure but stretched" if run_id == "Wargame1" and i >= 8 else "Constrained" if run_id == "Wargame2" and i >= 6 else "Building",
            confidence="Medium",
        )
        if run_id == "Wargame1":
            if i in (5, 9):
                step.blue_actions.update({"lc": "COUNTERATTACK", "p31c": "COUNTERATTACK", "p32c": "COUNTERATTACK"})
            if i in (4, 5):
                step.blue_actions.update({"c211": "COUNTERATTACK", "c212": "COUNTERATTACK", "c213": "COUNTERATTACK"})
        else:
            if i >= 4:
                step.blue_actions.update({"lc": "COUNTERATTACK", "p21c": "COUNTERATTACK", "p22c": "COUNTERATTACK", "p23c": "COUNTERATTACK"})
            if i >= 9:
                step.blue_actions.update({"p31c": "COUNTERATTACK", "p32c": "COUNTERATTACK", "p33c": "COUNTERATTACK"})
        steps.append(step)
    return steps


RED_UNITS = [
    {"uid": "RED_401RECON", "label": "401 Recon", "echelon": "battalion", "bls": "BLS-3", "appear": 1, "role": "Recon"},
    {"uid": "RED_41MECH", "label": "41 Mech", "echelon": "brigade", "bls": "BLS-1", "appear": 3, "role": "Fixing"},
    {"uid": "RED_42MECH", "label": "42 Mech", "echelon": "brigade", "bls": "BLS-2", "appear": 3, "role": "Support"},
    {"uid": "RED_43MECH", "label": "43 Mech", "echelon": "brigade", "bls": "BLS-3", "appear": 3, "role": "Main effort"},
    {"uid": "RED_44ARMD", "label": "44 Armd", "echelon": "brigade", "bls": "BLS-4", "appear": 3, "role": "External envelopment"},
    {"uid": "RED_9MID", "label": "9 MID", "echelon": "division", "bls": "BLS-3", "appear": 6, "role": "Follow-on"},
    {"uid": "RED_1AD", "label": "1 AD", "echelon": "division", "bls": "BLS-4", "appear": 8, "role": "Exploitation"},
    {"uid": "RED_45ARTY", "label": "45 Arty", "echelon": "support", "bls": "BLS-2", "appear": 3, "role": "Fire support"},
    {"uid": "RED_405EW", "label": "405 EW", "echelon": "support", "bls": "BLS-2", "appear": 1, "role": "EW"},
    {"uid": "RED_USV", "label": "USV x24", "echelon": "support", "bls": "BLS-3", "appear": 1, "role": "Explosive USVs"},
]


def load_source():
    with SOURCE_GEOJSON.open() as f:
        source = json.load(f)
    blue_units = []
    ao_features = []
    for idx, feat in enumerate(source["features"]):
        app = feat.get("properties", {}).get("app", {})
        sidc = app.get("sidc", "")
        if app.get("kind") == "multipolygon":
            ao_features.append(feat)
        elif app.get("kind") == "symbol" and len(sidc) >= 10 and sidc[3] == "3":
            echelon = {"15": "company", "16": "battalion", "18": "brigade", "21": "division"}.get(sidc[8:10], "unit")
            label = app.get("textModifiers", {}).get("uniqueDesignation", f"blue-{idx}")
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
    return source, ao_features, blue_units


SOURCE, AO_FEATURES, BLUE_UNITS = load_source()


def red_position(unit: dict, step: Step) -> tuple[float, float]:
    bls = BLS_BY_NAME[unit["bls"]]["coord"]
    sea_offsets = {
        "BLS-1": (-2, 12),
        "BLS-2": (0, 11),
        "BLS-3": (2, 9),
        "BLS-4": (3, 6),
    }
    sea = offset_lonlat(bls, *sea_offsets[unit["bls"]])
    if step.step_index < unit["appear"]:
        return sea

    if unit["role"] in ("EW", "Fire support"):
        return offset_lonlat(bls, east_km=4 if unit["role"] == "EW" else -5, north_km=3)
    if unit["role"] == "Explosive USVs":
        return offset_lonlat(bls, east_km=0, north_km=4)

    if step.step_index <= 2:
        t = min(1.0, step.progress / 0.02)
        return lerp(sea, offset_lonlat(bls, north_km=-1.2), t)

    unit_progress = step.progress
    if unit["role"] == "Fixing":
        unit_progress = min(step.progress, 0.35)
    elif unit["role"] == "Support":
        unit_progress = min(step.progress, 0.55)
    elif unit["role"] == "Recon":
        unit_progress = min(1.0, step.progress + 0.08)
    elif unit["role"] == "Follow-on" and step.step_index < 6:
        unit_progress = 0.0
    elif unit["role"] == "Exploitation" and step.step_index < 8:
        unit_progress = 0.0

    pos = lerp(bls, OBJ_NASSER["coord"], unit_progress)
    spread = {
        "RED_401RECON": (5.0, -4.5),
        "RED_41MECH": (-6.0, 1.0),
        "RED_42MECH": (-2.2, -1.8),
        "RED_43MECH": (2.2, 1.0),
        "RED_44ARMD": (9.0, 8.0),
        "RED_9MID": (-8.0, -6.0),
        "RED_1AD": (-8.0, 2.0),
    }
    if step.step_index >= 3 and unit["uid"] in spread:
        return offset_lonlat(pos, *spread[unit["uid"]])
    return pos


def blue_position(unit: dict, step: Step) -> tuple[float, float]:
    lon, lat = unit["coord"]
    action = step.blue_actions.get(unit["label"], "")
    if action == "COUNTERATTACK":
        return offset_lonlat((lon, lat), north_km=5.0)
    if action == "WITHDRAW":
        return offset_lonlat((lon, lat), north_km=-5.0)
    return lon, lat


def red_features(step: Step) -> list[dict]:
    features = []
    for unit in RED_UNITS:
        coord = red_position(unit, step)
        status = "STAGED" if step.step_index < unit["appear"] else "ACTIVE"
        if unit["uid"] in step.red_degraded:
            status = "DEGRADED"
        if unit["role"] in ("EW", "Explosive USVs") and step.step_index >= 7:
            status = "DISPLACED"
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": list(coord)},
                "properties": {
                    "unit_uid": unit["uid"],
                    "id": unit["label"],
                    "side": "RED",
                    "parent": "Enemy COA #1",
                    "echelon": unit["echelon"],
                    "role": unit["role"],
                    "assigned_bls": unit["bls"],
                    "status": status,
                    "action": "ADVANCE" if status in ("ACTIVE", "DEGRADED") and unit["role"] not in ("EW", "Fire support", "Explosive USVs") else unit["role"].upper(),
                    "strength_initial": 1.0,
                    "strength_current": 0.72 if unit["uid"] in step.red_degraded else 1.0,
                    "adjudication_note": "Aggregate formation marker; strength is scenario-level combat power, not a single company.",
                },
            }
        )
    return features


def blue_features(step: Step) -> list[dict]:
    features = []
    destroyed = set(step.blue_destroyed)
    for unit in BLUE_UNITS:
        coord = blue_position(unit, step)
        label = unit["label"]
        status = "DESTROYED" if label in destroyed else "ACTIVE"
        action = step.blue_actions.get(label, "DEFEND")
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": list(coord)},
                "properties": {
                    "unit_uid": unit["uid"],
                    "id": label,
                    "side": "BLUE",
                    "parent": "Blue coastal defense force",
                    "echelon": unit["echelon"],
                    "status": status,
                    "action": action,
                    "posture": "MOBILE_RESERVE" if action == "COUNTERATTACK" else "AREA_DEFENSE",
                    "strength_initial": 1.0,
                    "strength_current": 0.0 if status == "DESTROYED" else 1.0,
                    "sidc": unit["sidc"],
                    "source_index": unit["source_index"],
                    "adjudication_note": "Original Blue source unit preserved as a modeled unit marker.",
                },
            }
        )
    return features


def base_operational_features(step: Step) -> list[dict]:
    feats = [copy.deepcopy(f) for f in AO_FEATURES]
    for bls in BLS:
        feats.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": list(bls["coord"])},
                "properties": {
                    "source": "wargame-corrected",
                    "name": bls["name"],
                    "role": bls["role"],
                    "capacity": bls["capacity"],
                    "status": step.bls_status.get(bls["name"], "STAGED"),
                    "note": bls["note"],
                },
            }
        )
    feats.append(
        {
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": [list(p) for p in PIPELINE_ROUTE]},
            "properties": {
                "source": "wargame-corrected",
                "name": "Nasser-Brega pipeline route",
                "note": "Approximate route from public pipeline mapping; used for operational objective placement.",
            },
        }
    )
    feats.append(
        {
            "type": "Feature",
            "geometry": {
                "type": "Point",
                "coordinates": list(OBJ_NASSER["coord"]),
            },
            "properties": {
                "source": "wargame-corrected",
                "name": OBJ_NASSER["name"],
                "target_type": "Pipeline control / interdiction sector",
                "objective_status": step.objective_status,
                "depth_from_coast_km": 95,
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


def write_step_geojson(run_id: str, step: Step, out_dir: Path) -> None:
    red = red_features(step)
    blue = blue_features(step)
    features = base_operational_features(step) + red + blue
    red_active = sum(1 for f in red if f["properties"]["status"] in ("ACTIVE", "DEGRADED"))
    blue_destroyed = len(step.blue_destroyed)
    data = {
        "type": "FeatureCollection",
        "metadata": {
            "run_id": run_id,
            "run_number": 1 if run_id == "Wargame1" else 2,
            "scenario_name": "Brega-Ajdabiya amphibious assault",
            "branch_name": "Baseline enemy COA #1" if run_id == "Wargame1" else "Early Blue reserve response branch",
            "source_files": ["nato-map-layers.geojson", "enemy.docx", "Current.geojson"],
            "model_version": MODEL_VERSION,
            "step_index": step.step_index,
            "time_label": step.time_label,
            "elapsed_hours": step.elapsed_hours,
            "phase": step.phase,
            "phase_line_km": step.phase_line_km,
            "objective_status": step.objective_status,
            "enemy_coa_id": "COA #1",
            "blue_coa_id": "Blue baseline" if run_id == "Wargame1" else "Blue early reserve",
            "decision_point": step.decision_point,
            "narrative_ar": step.narrative_ar,
            "narrative_en": step.narrative_en,
            "adjudication_method": "Structured deterministic matrix: phase progress, local force ratio, terrain friction, EW, beach throughput, and reserve timing.",
            "force_ratio": step.force_ratio,
            "terrain_effects": "Coastal beach exits, sabkha/lagoon constraints, desert maneuver corridors, and pipeline-axis objective.",
            "ew_effect": step.ew_effect,
            "logistics_state": step.logistics_state,
            "confidence": step.confidence,
            "losses_step": {
                "blue": len([x for x in step.blue_destroyed if x in set(step.blue_destroyed)]),
                "red_company_equivalent_cumulative": step.red_strength_losses,
            },
            "losses_cumulative": {
                "blue_destroyed": blue_destroyed,
                "blue_total": len(BLUE_UNITS),
                "red_company_equivalent": step.red_strength_losses,
                "red_aggregate_markers": len(RED_UNITS),
            },
            "bls_status": step.bls_status,
            "red_active_markers": red_active,
        },
        "features": features,
    }
    with (out_dir / f"step{step.step_index:02d}.geojson").open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def draw_aor(draw: ImageDraw.ImageDraw) -> None:
    for feat in AO_FEATURES:
        geom = feat["geometry"]
        for poly in geom.get("coordinates", []):
            ring = poly[0]
            pts = [P(*coord) for coord in ring]
            draw.polygon(pts, fill=(54, 121, 210, 28), outline=(38, 104, 220, 210))
            draw.line(pts + [pts[0]], fill=(38, 104, 220, 235), width=3)


def draw_pipeline_and_obj(draw: ImageDraw.ImageDraw, step: Step) -> None:
    pipe_pts = [P(*p) for p in PIPELINE_ROUTE if MAP_BBOX[0] <= p[0] <= MAP_BBOX[2] and MAP_BBOX[1] <= p[1] <= MAP_BBOX[3]]
    if len(pipe_pts) > 1:
        draw_dashed_line(draw, pipe_pts, (80, 30, 98, 230), width=5, dash=24, gap=14)
        draw_dashed_line(draw, pipe_pts, (255, 255, 255, 190), width=2, dash=24, gap=14)

    x, y = P(*OBJ_NASSER["coord"])
    colors = {
        "DORMANT": ((120, 120, 120, 230), (120, 120, 120, 55)),
        "THREATENED": ((228, 156, 38, 255), (228, 156, 38, 90)),
        "CONTESTED": ((232, 90, 32, 255), (232, 90, 32, 110)),
        "CAPTURED": ((180, 0, 0, 255), (180, 0, 0, 125)),
        "DENIED": ((23, 95, 180, 255), (23, 95, 180, 110)),
    }
    line, fill = colors.get(step.objective_status, colors["DORMANT"])
    rr = 48
    draw.ellipse([x - rr, y - rr, x + rr, y + rr], fill=fill, outline=line, width=5)
    draw.line([(x - 18, y), (x + 18, y)], fill=(255, 255, 255, 245), width=4)
    draw.line([(x, y - 18), (x, y + 18)], fill=(255, 255, 255, 245), width=4)
    draw_text_halo(draw, (x + rr + 10, y - 10), f"{OBJ_NASSER['name']} ({step.objective_status})", FONT["map_label"], line)


def draw_phase_and_red_area(draw: ImageDraw.ImageDraw, step: Step) -> None:
    if step.phase_line_km <= 0:
        return
    # Phase line as approximate east-west operational depth line.
    lat = 30.42 - step.phase_line_km / 111.0
    a = P(MAP_BBOX[0] + 0.04, lat)
    b = P(MAP_BBOX[2] - 0.04, lat)
    draw_dashed_line(draw, [a, b], (50, 50, 35, 220), width=7, dash=28, gap=18)
    draw_dashed_line(draw, [a, b], (246, 220, 64, 255), width=4, dash=28, gap=18)
    draw_text_halo(draw, (b[0] - 160, b[1] - 24), f"PL {step.phase_line_km} km", FONT["map_label"], (246, 220, 64, 255), halo=(35, 35, 25, 255))

    if step.progress <= 0:
        return
    bls_pts = [BLS_BY_NAME[name]["coord"] for name in ["BLS-1", "BLS-2", "BLS-3", "BLS-4"]]
    deep_pts = [lerp(pt, OBJ_NASSER["coord"], min(step.progress, 0.92)) for pt in bls_pts]
    poly = [P(*pt) for pt in bls_pts + list(reversed(deep_pts))]
    if len(poly) >= 4:
        draw.polygon(poly, fill=(196, 30, 30, 42), outline=(178, 20, 20, 120))

    main_start = P(*BLS_BY_NAME["BLS-3"]["coord"])
    main_end = P(*lerp(BLS_BY_NAME["BLS-3"]["coord"], OBJ_NASSER["coord"], min(step.progress, 1.0)))
    draw_arrow(draw, main_start, main_end, (190, 20, 20, 205), width=20, head_len=52, head_w=54)
    if step.progress > 0.15:
        east_start = P(*BLS_BY_NAME["BLS-4"]["coord"])
        east_end = P(*lerp(BLS_BY_NAME["BLS-4"]["coord"], OBJ_NASSER["coord"], min(step.progress, 0.92)))
        draw_arrow(draw, east_start, east_end, (190, 20, 20, 145), width=13, head_len=42, head_w=42)


def label_blue_unit(unit: dict, step: Step) -> bool:
    label = unit["label"]
    if unit["echelon"] in ("battalion", "brigade", "division"):
        return True
    if step.blue_actions.get(label) == "COUNTERATTACK":
        return True
    if label in step.blue_destroyed and step.step_index <= 6:
        return label in {"c111", "c112", "c113", "c121", "c122", "c123", "c131", "c132", "c133", "c211", "c212", "c213"}
    return False


def draw_units(draw: ImageDraw.ImageDraw, step: Step) -> None:
    # Blue first, then Red on top.
    destroyed = set(step.blue_destroyed)
    for unit in BLUE_UNITS:
        coord = blue_position(unit, step)
        x, y = P(*coord)
        if not (0 <= x <= MAP_W and 0 <= y <= MAP_H):
            continue
        status = "DESTROYED" if unit["label"] in destroyed else "ACTIVE"
        action = step.blue_actions.get(unit["label"], "DEFEND")
        draw_unit_box(draw, (x, y), unit["label"], "BLUE", unit["echelon"], status, action, label_blue_unit(unit, step))
        if action == "COUNTERATTACK" and status == "ACTIVE":
            draw_arrow(draw, (x, y + 38), (x, y - 34), (20, 150, 80, 220), width=6, head_len=20, head_w=22)

    for unit in RED_UNITS:
        coord = red_position(unit, step)
        x, y = P(*coord)
        if not (0 <= x <= MAP_W and 0 <= y <= MAP_H):
            continue
        status = "STAGED" if step.step_index < unit["appear"] else "ACTIVE"
        if unit["uid"] in step.red_degraded:
            status = "DEGRADED"
        if unit["role"] in ("EW", "Explosive USVs") and step.step_index >= 7:
            status = "DISPLACED"
        label_it = status != "STAGED" or unit["echelon"] in ("division", "brigade")
        if step.step_index >= 10 and unit["role"] not in ("Follow-on", "Exploitation"):
            label_it = False
        if step.step_index >= 11 and unit["role"] == "Exploitation":
            label_it = False
        draw_unit_box(draw, (x, y), unit["label"], "RED", unit["echelon"], status, unit["role"].upper(), label_it)


def draw_panel(draw: ImageDraw.ImageDraw, run_id: str, step: Step) -> None:
    x0 = MAP_W
    draw.rectangle([x0, 0, IMAGE_SIZE[0], IMAGE_SIZE[1]], fill=(14, 22, 32, 255))
    draw.rectangle([x0, 0, IMAGE_SIZE[0], 118], fill=(21, 45, 75, 255))
    branch = "BASELINE COA #1" if run_id == "Wargame1" else "BLUE EARLY RESERVE BRANCH"
    draw.text((x0 + 28, 22), f"{run_id}  STEP {step.step_index:02d}", font=FONT["title"], fill=(255, 255, 255, 255))
    draw.text((x0 + 30, 72), branch, font=FONT["subtitle"], fill=(194, 215, 245, 255))
    y = 145
    draw.text((x0 + 30, y), step.headline.upper(), font=FONT["subtitle"], fill=(255, 218, 106, 255))
    y += 42
    draw.text((x0 + 30, y), f"Time: {step.time_label}    Phase: {step.phase}", font=FONT["body_bold"], fill=(238, 242, 247, 255))
    y += 34
    draw.text((x0 + 30, y), f"PL: {step.phase_line_km} km    OBJ: {step.objective_status}", font=FONT["body_bold"], fill=(238, 242, 247, 255))
    y += 34
    draw.text((x0 + 30, y), f"EW: {step.ew_effect}    Ratio: {step.force_ratio}", font=FONT["body"], fill=(198, 207, 220, 255))
    y += 42
    draw.line([(x0 + 28, y), (IMAGE_SIZE[0] - 28, y)], fill=(70, 91, 112, 255), width=2)
    y += 26
    y = draw_wrapped(draw, (x0 + 30, y), step.narrative_en, FONT["body"], (238, 242, 247, 255), 43, 27)
    y += 28

    blue_loss = len(step.blue_destroyed)
    red_loss = step.red_strength_losses
    draw.rounded_rectangle([x0 + 28, y, IMAGE_SIZE[0] - 28, y + 98], radius=10, fill=(24, 34, 48, 255), outline=(78, 102, 128, 255), width=2)
    draw.text((x0 + 48, y + 16), "CUMULATIVE LOSSES", font=FONT["small_bold"], fill=(190, 204, 222, 255))
    draw.text((x0 + 48, y + 48), f"BLUE: {blue_loss}/39 destroyed", font=FONT["body_bold"], fill=(138, 185, 255, 255))
    draw.text((x0 + 310, y + 48), f"RED: {red_loss} coy-eq", font=FONT["body_bold"], fill=(255, 148, 148, 255))
    y += 122

    draw.text((x0 + 30, y), "BLS STATUS", font=FONT["small_bold"], fill=(190, 204, 222, 255))
    y += 30
    for bls in BLS:
        status = step.bls_status.get(bls["name"], "STAGED")
        color = {
            "STAGED": (170, 170, 170, 255),
            "CONTESTED": (238, 160, 35, 255),
            "SECURE": (189, 111, 224, 255),
            "DENIED": (242, 84, 84, 255),
            "LIMITED": (220, 170, 245, 255),
        }.get(status, (200, 200, 200, 255))
        draw.ellipse([x0 + 34, y + 4, x0 + 52, y + 22], fill=color)
        draw.text((x0 + 64, y), f"{bls['name']}: {status}", font=FONT["small"], fill=(235, 238, 244, 255))
        y += 27
    y += 12

    draw.text((x0 + 30, y), "LEGEND", font=FONT["small_bold"], fill=(190, 204, 222, 255))
    y += 32
    draw_unit_box(draw, (x0 + 52, y + 8), "", "BLUE", "company", "ACTIVE", label_it=False)
    draw.text((x0 + 90, y), "Blue unit", font=FONT["small"], fill=(235, 238, 244, 255))
    y += 34
    draw_unit_box(draw, (x0 + 52, y + 8), "", "RED", "brigade", "ACTIVE", label_it=False)
    draw.text((x0 + 90, y), "Red aggregate force", font=FONT["small"], fill=(235, 238, 244, 255))
    y += 40
    draw.line([(x0 + 35, y + 10), (x0 + 72, y + 10)], fill=(246, 220, 64, 255), width=4)
    draw.text((x0 + 90, y), "Phase line", font=FONT["small"], fill=(235, 238, 244, 255))
    y += 34
    draw.line([(x0 + 35, y + 10), (x0 + 72, y + 10)], fill=(20, 150, 80, 255), width=5)
    draw.polygon([(x0 + 72, y + 10), (x0 + 58, y + 2), (x0 + 58, y + 18)], fill=(20, 150, 80, 255))
    draw.text((x0 + 90, y), "Blue counterattack", font=FONT["small"], fill=(235, 238, 244, 255))

    # Step timeline
    y = IMAGE_SIZE[1] - 105
    draw.text((x0 + 30, y - 34), "OPERATION CLOCK", font=FONT["small_bold"], fill=(190, 204, 222, 255))
    bar_x0, bar_x1 = x0 + 30, IMAGE_SIZE[0] - 35
    draw.line([(bar_x0, y), (bar_x1, y)], fill=(82, 103, 127, 255), width=8)
    for i in range(12):
        tx = int(bar_x0 + (bar_x1 - bar_x0) * i / 11)
        r = 10 if i == step.step_index else 6
        fill = (255, 218, 106, 255) if i == step.step_index else (150, 164, 184, 255)
        draw.ellipse([tx - r, y - r, tx + r, y + r], fill=fill)
    draw.text((bar_x0, y + 22), "H", font=FONT["tiny"], fill=(190, 204, 222, 255))
    draw.text((bar_x1 - 50, y + 22), "H+144", font=FONT["tiny"], fill=(190, 204, 222, 255))


def render_step(run_id: str, step: Step, out_dir: Path, base: Image.Image) -> None:
    map_img = base.copy()
    map_img = ImageEnhance.Contrast(map_img).enhance(1.08)
    map_img = ImageEnhance.Brightness(map_img).enhance(0.86)
    map_img = ImageEnhance.Color(map_img).enhance(0.86)

    canvas = Image.new("RGBA", IMAGE_SIZE, (0, 0, 0, 255))
    canvas.alpha_composite(map_img, (0, 0))
    overlay = Image.new("RGBA", IMAGE_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    draw_aor(draw)
    draw_pipeline_and_obj(draw, step)
    draw_phase_and_red_area(draw, step)
    for bls in BLS:
        draw_bls(draw, bls["name"], bls["coord"], step.bls_status.get(bls["name"], "STAGED"))
    draw_units(draw, step)
    draw_scale_and_north(draw)

    # Map title band, light enough to keep imagery visible.
    draw.rounded_rectangle([24, 20, MAP_W - 24, 82], radius=12, fill=(10, 18, 28, 218), outline=(255, 255, 255, 70), width=1)
    draw.text((46, 34), "Brega-Ajdabiya Amphibious Wargame", font=FONT["subtitle"], fill=(255, 255, 255, 255))
    draw.text((560, 38), "Corrected BLS / OBJ NASSER-95 operational graphics", font=FONT["small"], fill=(210, 222, 238, 255))

    draw_panel(draw, run_id, step)
    final = Image.alpha_composite(canvas, overlay).convert("RGB")
    png_path = out_dir / f"step{step.step_index:02d}.png"
    jpg_path = out_dir / f"step{step.step_index:02d}.jpeg"
    final.save(png_path, "PNG")
    final.save(jpg_path, "JPEG", quality=94, subsampling=0)


def render_run(run_id: str) -> None:
    out_dir = OUT_DIRS[run_id]
    out_dir.mkdir(parents=True, exist_ok=True)
    steps = make_steps(run_id)
    base = fetch_basemap()
    for step in steps:
        write_step_geojson(run_id, step, out_dir)
        render_step(run_id, step, out_dir, base)
        print(
            f"{run_id} step {step.step_index:02d}: {step.time_label:>6} "
            f"{step.phase:<10} PL={step.phase_line_km:>3} OBJ={step.objective_status:<10} "
            f"B={len(step.blue_destroyed):02d}/39 R={step.red_strength_losses}"
        )


def main() -> None:
    render_run("Wargame1")
    render_run("Wargame2")


if __name__ == "__main__":
    main()
