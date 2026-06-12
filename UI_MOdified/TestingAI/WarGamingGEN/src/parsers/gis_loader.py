"""
gis_loader.py — load + clip the GIS layers for the AO.

Reads inputs/gis/ structure:
  terrain/inland_water.geojson  ← OSM inland_water (blockers: sabkha, water, reservoir)
  terrain/water_way.geojson      ← OSM waterways (wadis, streams — channelization)
  terrain/landuse.geojson        ← OSM landuse (industrial/residential = bypass zones)
  terrain/roads.geojson          ← OSM roads (mobility corridors)
  terrain/populated_places.geojson ← OSM cities/towns/villages (named landmarks)
  terrain/aerodromes.geojson     ← OSM airports/runways/helipads
  imagery/satellite_base.jpeg + .bbox.json
  elevation/libya_dem.tif        ← optional
  boundaries/nato-map-layers.geojson ← original positions + 3 AO polygons

All vectors are clipped to scenario.bbox_wgs84 at load time. Raster
masks (sea, inland water) are computed from the satellite image and cached.
"""
from __future__ import annotations
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
import numpy as np


# ============================================================================
# Helper geometry
# ============================================================================

def _bbox_intersect_any(geom: dict, bbox: tuple[float, float, float, float]) -> bool:
    """Return True if any vertex of geom is inside bbox."""
    lon_min, lat_min, lon_max, lat_max = bbox
    coords = _flatten_coords(geom)
    return any(lon_min <= x <= lon_max and lat_min <= y <= lat_max for x, y in coords)


def _flatten_coords(geom: dict) -> list[tuple[float, float]]:
    """Pull all (lon, lat) tuples out of any GeoJSON geometry."""
    t = geom.get("type", "")
    c = geom.get("coordinates", [])
    out: list[tuple[float, float]] = []
    if t == "Point":
        out.append((c[0], c[1]))
    elif t == "LineString" or t == "MultiPoint":
        out.extend((p[0], p[1]) for p in c)
    elif t == "MultiLineString" or t == "Polygon":
        for ring in c:
            out.extend((p[0], p[1]) for p in ring)
    elif t == "MultiPolygon":
        for poly in c:
            for ring in poly:
                out.extend((p[0], p[1]) for p in ring)
    return out


def _clip_features(features: list[dict], bbox: tuple[float, float, float, float]) -> list[dict]:
    return [f for f in features if _bbox_intersect_any(f.get("geometry", {}), bbox)]


def _point_in_ring(x: float, y: float, ring: list) -> bool:
    """Ray-cast point-in-polygon."""
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def _point_in_geom(lon: float, lat: float, geom: dict) -> bool:
    """Point-in-polygon for Polygon or MultiPolygon (outer ring only)."""
    t = geom.get("type", "")
    if t == "Polygon":
        return _point_in_ring(lon, lat, geom["coordinates"][0])
    if t == "MultiPolygon":
        return any(_point_in_ring(lon, lat, poly[0]) for poly in geom["coordinates"])
    return False


# ============================================================================
# Container
# ============================================================================

@dataclass
class GISContext:
    """Everything our engine needs from the GIS folder, clipped to the AO bbox."""
    bbox: tuple[float, float, float, float]
    inland_water: list[dict]       # mobility blockers (water, sabkha, reservoir)
    water_way: list[dict]          # wadis (channelization)
    landuse: list[dict]            # bypass zones (industrial/residential/etc.)
    roads: list[dict]              # mobility corridors
    populated_places: list[dict]   # named landmarks
    aerodromes: list[dict]         # airports/runways/helipads
    ao_polygons: list[dict]        # original NATO AOs (3 brigades)
    satellite_path: Optional[Path] = None
    satellite_bbox: Optional[tuple[float, float, float, float]] = None  # may differ from AO bbox
    sea_mask: Optional[np.ndarray] = None             # bool array, True=sea
    inland_water_mask: Optional[np.ndarray] = None    # bool array, interior water bodies

    def is_terrain_blocker(self, lon: float, lat: float) -> bool:
        """Returns True if (lon,lat) lies inside a real OSM mobility blocker."""
        for f in self.inland_water:
            fc = f["properties"].get("fclass", "")
            if fc in ("water", "wetland", "wetland_saltmarsh", "wetland_marsh", "reservoir"):
                if _point_in_geom(lon, lat, f["geometry"]):
                    return True
        return False

    def is_bypass_zone(self, lon: float, lat: float) -> bool:
        """Industrial/residential/commercial polygons = forced detour zones."""
        for f in self.landuse:
            fc = f["properties"].get("fclass", "")
            if fc in ("industrial", "residential", "commercial", "quarry", "cemetery", "landfill"):
                if _point_in_geom(lon, lat, f["geometry"]):
                    return True
        return False

    def is_in_sea(self, lon: float, lat: float) -> bool:
        """Sea-pixel lookup via the sat-derived mask."""
        if self.sea_mask is None or self.satellite_bbox is None: return False
        lon_min, lat_min, lon_max, lat_max = self.satellite_bbox
        if not (lon_min <= lon <= lon_max and lat_min <= lat <= lat_max): return False
        H, W = self.sea_mask.shape
        r = int(round((lat_max - lat) / (lat_max - lat_min) * (H - 1)))
        c = int(round((lon - lon_min) / (lon_max - lon_min) * (W - 1)))
        return bool(self.sea_mask[r, c])

    def summary(self) -> dict:
        return {
            "bbox": list(self.bbox),
            "inland_water_in_bbox": len(self.inland_water),
            "water_way_in_bbox": len(self.water_way),
            "landuse_in_bbox": len(self.landuse),
            "roads_in_bbox": len(self.roads),
            "populated_places_in_bbox": len(self.populated_places),
            "aerodromes_in_bbox": len(self.aerodromes),
            "ao_polygons": len(self.ao_polygons),
            "satellite_loaded": self.satellite_path is not None,
            "sea_mask_pixels": int(self.sea_mask.sum()) if self.sea_mask is not None else 0,
        }


# ============================================================================
# Loader
# ============================================================================

def _load_geojson_clipped(path: Path, bbox) -> list[dict]:
    if not path.exists(): return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return _clip_features(data.get("features", []), bbox)


def _build_sea_mask(satellite_path: Path, cache_dir: Path) -> tuple[Optional[np.ndarray], Optional[tuple]]:
    """Compute (and cache) a sea/inland-water mask from the satellite image."""
    if not satellite_path.exists(): return (None, None)
    sat_bbox_file = satellite_path.with_suffix(".bbox.json")
    if not sat_bbox_file.exists():
        # Try same-stem .bbox.json
        sat_bbox_file = satellite_path.parent / f"{satellite_path.stem}.bbox.json"
    if not sat_bbox_file.exists(): return (None, None)

    sat_bbox = tuple(json.loads(sat_bbox_file.read_text())["bbox_wgs84"])

    cache = cache_dir / "sea_mask.npy"
    if cache.exists():
        try:
            return (np.load(str(cache)), sat_bbox)
        except Exception:
            pass

    # Compute from scratch
    from PIL import Image
    from scipy.ndimage import binary_opening, binary_closing, label

    img = Image.open(satellite_path).convert("RGB")
    arr = np.array(img)
    R, G, Bl = arr[..., 0].astype(int), arr[..., 1].astype(int), arr[..., 2].astype(int)
    # Heuristic sea detection: high blue dominance, moderate brightness
    sea = (Bl > R + 15) & (Bl > G + 5) & (R < 90) & (G < 110) & (Bl > 40) & (Bl < 180)
    sea |= (R < 40) & (G < 60) & (Bl > 50) & (Bl < 150)
    sea = binary_opening(sea, iterations=2)
    sea = binary_closing(sea, iterations=3)
    # Keep only the largest connected component (the main gulf)
    lab, n = label(sea)
    if n >= 1:
        sizes = [(i, (lab == i).sum()) for i in range(1, n + 1)]
        sizes.sort(key=lambda x: -x[1])
        sea_main = (lab == sizes[0][0])
    else:
        sea_main = sea
    cache_dir.mkdir(parents=True, exist_ok=True)
    np.save(str(cache), sea_main)
    return (sea_main, sat_bbox)


def load_gis(gis_dir: Path, bbox: tuple[float, float, float, float],
             cache_dir: Optional[Path] = None) -> GISContext:
    """Load + clip all GIS layers to the bbox; compute sea mask from imagery."""
    gis_dir = Path(gis_dir)
    cache_dir = cache_dir or (gis_dir.parent / "qa")

    print(f"[gis] loading from {gis_dir} ...")
    terrain = gis_dir / "terrain"
    boundaries = gis_dir / "boundaries"
    imagery = gis_dir / "imagery"

    inland_water = _load_geojson_clipped(terrain / "inland_water.geojson", bbox)
    water_way = _load_geojson_clipped(terrain / "water_way.geojson", bbox)
    landuse = _load_geojson_clipped(terrain / "landuse.geojson", bbox)
    roads = _load_geojson_clipped(terrain / "roads.geojson", bbox)
    populated_places = _load_geojson_clipped(terrain / "populated_places.geojson", bbox)
    aerodromes = _load_geojson_clipped(terrain / "aerodromes.geojson", bbox)

    # AO polygons from the NATO source file
    ao_polygons: list[dict] = []
    nato_file = boundaries / "nato-map-layers.geojson"
    if nato_file.exists():
        nato = json.loads(nato_file.read_text(encoding="utf-8"))
        for f in nato.get("features", []):
            if f.get("geometry", {}).get("type") == "MultiPolygon":
                ao_polygons.append(f)

    # Satellite imagery (path + bbox sidecar)
    sat_jpg = imagery / "satellite_base.jpeg"
    sat_path = sat_jpg if sat_jpg.exists() else None
    sea_mask, sat_bbox = _build_sea_mask(sat_jpg, cache_dir) if sat_path else (None, None)

    ctx = GISContext(
        bbox=bbox,
        inland_water=inland_water,
        water_way=water_way,
        landuse=landuse,
        roads=roads,
        populated_places=populated_places,
        aerodromes=aerodromes,
        ao_polygons=ao_polygons,
        satellite_path=sat_path,
        satellite_bbox=sat_bbox,
        sea_mask=sea_mask,
    )
    return ctx


# ============================================================================
# Smoke test
# ============================================================================
if __name__ == "__main__":
    import json
    from .scenario_parser import load_scenario

    project = Path(__file__).resolve().parent.parent.parent
    scenario = load_scenario(project / "inputs" / "scenario.json")
    bbox = tuple(scenario.bbox_wgs84)

    ctx = load_gis(project / "inputs" / "gis", bbox)
    print("\n" + "=" * 72)
    print("  GIS context summary")
    print("=" * 72)
    print(json.dumps(ctx.summary(), indent=2))

    # Sample a few interesting test points
    print("\n  Trafficability spot-checks:")
    test_points = [
        (19.55, 29.74, "OBJ X (Nasser-Brega pipeline)"),
        (19.5824, 30.3704, "Brega airport runway"),
        (19.20, 30.10, "Western saltmarsh interior"),
        (19.5, 30.50, "Coastal area near BLS-2"),
    ]
    for lon, lat, label in test_points:
        in_sea = ctx.is_in_sea(lon, lat)
        is_blocker = ctx.is_terrain_blocker(lon, lat)
        is_bypass = ctx.is_bypass_zone(lon, lat)
        print(f"    ({lon:.4f}, {lat:.4f})  {label}")
        print(f"        sea={in_sea}  blocker={is_blocker}  bypass={is_bypass}")

    # Named landmarks
    print("\n  Populated places found:")
    for f in ctx.populated_places:
        p = f["properties"]; c = f["geometry"]["coordinates"]
        print(f"    [{p.get('place','?'):8s}]  {p.get('name','(unnamed)'):20s}  @ ({c[0]:.3f}, {c[1]:.3f})")

    print("\n  Aerodromes/airports:")
    aerod_nodes = [f for f in ctx.aerodromes if f["geometry"]["type"] == "Polygon"]
    for f in aerod_nodes[:4]:
        p = f["properties"]
        print(f"    {p.get('name', p.get('aeroway','?'))} ({p.get('aeroway')})")
