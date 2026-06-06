# map_data — Offline Map Tile Package Directory

This directory is mounted read-only into the Docker container at `/app/offline_map_data`.

The RMOOZ offline map resolver checks this directory for local tile data before
falling back to the configured `FALLBACK_TILE_URL`.

---

## What goes here

Place your licensed/internal map tile package in one of the supported formats:

| Format | Directory | Notes |
|--------|-----------|-------|
| XYZ/PNG tiles | `base/{z}/{x}/{y}.png` | Standard tile pyramid |
| MBTiles package | `base/<name>.mbtiles` | SQLite-based, single file |
| Terrain tiles | `terrain/{z}/{x}/{y}.terrain` | Cesium quantized mesh |
| Style JSON | `styles/<style>.json` | Mapbox/MapLibre style spec |
| Attribution | `attribution/attribution.txt` | Required by tile license |

---

## If you do NOT have local tiles yet

Leave this directory empty. The app will start and show a "map unavailable" message.

Configure a fallback tile server in `.env.offline`:
```dotenv
MAP_SOURCE_MODE=auto
FALLBACK_TILE_URL=http://<internal-tile-server>:8080/tiles/{z}/{x}/{y}.png
MAP_FALLBACK_ENABLED=1
```

The app will use the fallback URL automatically.

---

## How the resolver works

```
MAP_SOURCE_MODE=auto (default):
  1. Check local tile health (probe /offline-tiles/0/0/0.png)
  2. If local tiles OK → use local tiles
  3. If local tiles missing:
     a. If FALLBACK_TILE_URL set and MAP_FALLBACK_ENABLED=1 → use fallback
     b. Otherwise → show "map unavailable" message
  4. Never silently fall back to public internet tile servers

MAP_SOURCE_MODE=local:
  Use local tiles only. Clear error if missing — no fallback.

MAP_SOURCE_MODE=fallback:
  Use FALLBACK_TILE_URL only. Skip local health check.
```

---

## Important licensing note

**Do NOT bulk-download tiles from public sources** (OSM, Google Maps, Bing, etc.)
Their terms of service prohibit bulk tile harvesting.

Acceptable tile sources for this directory:
- Internal organization tile server export (check with GIS team)
- Purchased offline map data from a licensed provider
- Government or military map data for which you have an offline use license
- Self-hosted tiles from OpenStreetMap data (requires OSM license compliance)

A future OFFLINE-MAP-PACKAGE-0 tool will help export a licensed AOI tile set.

---

## Subdirectory structure

```
map_data/
  base/        ← Base layer tiles (street/satellite/hybrid)
  terrain/     ← Elevation/terrain tiles for 3D view
  styles/      ← Map style definitions (optional)
  attribution/ ← License attribution text (required)
```

---

## Docker mount

This directory is mounted as:
```yaml
volumes:
  - ./map_data:/app/offline_map_data:ro   # read-only inside container
```

Changes to files in `map_data/` take effect after container restart.
