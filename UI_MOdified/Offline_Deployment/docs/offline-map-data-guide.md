# Offline Map Data Guide

This guide explains how to configure map tile sources for the RMOOZ offline deployment.
The app supports local tile packages, configurable fallback URLs, and graceful
"map unavailable" states — without requiring public internet access.

---

## Quick decision guide

| Your situation | What to do |
|----------------|-----------|
| You have local MBTiles or tile package | Put files in `map_data/`, set `MAP_SOURCE_MODE=local` |
| You have an internal site tile server | Set `FALLBACK_TILE_URL=http://<internal-server>/...`, `MAP_SOURCE_MODE=auto` |
| You have BOTH local files + a server | Set `MAP_SOURCE_MODE=auto` (local preferred, server as backup) |
| You have only a public internet map link | Set `FALLBACK_TILE_URL=<link>` but note: this is NOT true offline |
| You have no map source yet | Leave blank — app starts, shows "map unavailable" message |

---

## Configuration variables

All set in `Offline_Deployment/.env.offline` (copy from `.env.offline.example`).

```dotenv
# How to pick tile source:
# auto     = try local first, fall through to fallback if missing
# local    = local only (error if missing, no fallback)
# fallback = use FALLBACK_TILE_URL only (skip local check)
MAP_SOURCE_MODE=auto

# URL pattern for local tiles served from the container.
# Default points to the offline_map_data volume mount.
LOCAL_TILE_URL=/offline-tiles/{z}/{x}/{y}.png

# Internal fallback tile server.
# MUST be an internal network server — do NOT use public OSM or Google.
FALLBACK_TILE_URL=http://<internal-tile-server>:8080/tiles/{z}/{x}/{y}.png

# Optional URL to check if the fallback server is alive.
# If blank, the resolver probes a tile fetch as health check.
MAP_HEALTHCHECK_URL=http://<internal-tile-server>:8080/health

# 0 = never use fallback URL.  1 = allow fallback (default).
MAP_FALLBACK_ENABLED=1

# Container path for offline tile data.
# Should match the :ro bind-mount in docker-compose.offline.yml.
OFFLINE_MAP_DATA_DIR=/app/offline_map_data
```

---

## Scenario 1: Local tile package only

**Use case:** You received a GIS-exported tile package for the AOI (area of interest).

1. Copy tiles into `Offline_Deployment/map_data/base/`:
   ```
   map_data/base/0/0/0.png
   map_data/base/1/...
   ...
   map_data/base/16/...
   map_data/attribution/attribution.txt
   ```

2. Set in `.env.offline`:
   ```dotenv
   MAP_SOURCE_MODE=local
   FALLBACK_TILE_URL=
   ```

3. Start the container:
   ```bash
   docker compose -f docker-compose.offline.yml --env-file .env.offline up -d
   ```

The map will show local tiles. If a tile is missing at a zoom level, the browser
shows a blank tile (no crash, no network request).

---

## Scenario 2: Internal network tile server

**Use case:** The offline site has an internal tile server (e.g. GeoServer, MapProxy,
or another RMOOZ instance with tiles).

1. Leave `map_data/` empty (or keep for backup).

2. Set in `.env.offline`:
   ```dotenv
   MAP_SOURCE_MODE=fallback
   FALLBACK_TILE_URL=http://10.10.10.20:8080/tiles/{z}/{x}/{y}.png
   MAP_FALLBACK_ENABLED=1
   ```

3. The container must be able to reach `10.10.10.20:8080` (same network or routing).

The map will use the internal tile server. If it's unreachable, the app shows
"map unavailable" — it will not fall through to any public internet source.

---

## Scenario 3: Local tiles + internal server backup

**Use case:** Primary = local package, secondary = internal server when local is unavailable.

```dotenv
MAP_SOURCE_MODE=auto
LOCAL_TILE_URL=/offline-tiles/{z}/{x}/{y}.png
FALLBACK_TILE_URL=http://10.10.10.20:8080/tiles/{z}/{x}/{y}.png
MAP_FALLBACK_ENABLED=1
```

The resolver will:
1. Probe the local tile path first.
2. If reachable → use local tiles.
3. If local misses → use the fallback server.
4. If both fail → show "map unavailable" (no public internet).

---

## What NOT to do

| Action | Why |
|--------|-----|
| Set `FALLBACK_TILE_URL=https://tile.openstreetmap.org/...` | Violates OSM tile policy; not offline |
| Bulk-download OSM tiles into `map_data/` | Violates OSM usage policy |
| Set `FALLBACK_TILE_URL` to a public CDN | Not an offline deployment |
| Leave FALLBACK_TILE_URL empty AND expect map to work without local tiles | App shows "map unavailable" — expected behavior |

---

## Cesium / 3D view

The Cesium 3D view uses the same map source resolver where possible:

- If local Cesium imagery package is present in `map_data/terrain/` → use it.
- If only `FALLBACK_TILE_URL` is configured → use it for 2D; 3D shows "unavailable".
- If neither → 3D button is visible but shows "no offline imagery configured".

The 3D view does **not** call Cesium Ion by default (`Cesium.Ion.defaultAccessToken = ''`).
It does use OSM tiles for its imagery layer — this is an open bug to fix in OFFLINE-IMAGE-1
(replace OSM URL with the configured `FALLBACK_TILE_URL`).

---

## Tile server inside the container

The main app includes a tile server (`server/tile-server.js`) on port 8080 that reads
`.mbtiles` SQLite files from the `maps/` volume. This is separate from the `offline_map_data`
volume used by the offline map resolver.

- **Legacy path:** `maps/<name>.mbtiles` → served at `localhost:8080/services/<name>/{z}/{x}/{y}.png`
- **Offline resolver path:** `map_data/base/{z}/{x}/{y}.png` → served as static files at `/offline-tiles/`

Both can be active at the same time. The offline resolver takes priority when `MAP_SOURCE_MODE=auto`.

---

## Future: OFFLINE-MAP-PACKAGE-0

A future tool will automate creating a licensed tile package for a specific AOI
and zoom range, from internal data sources only.

Until then, use one of the scenarios above.
