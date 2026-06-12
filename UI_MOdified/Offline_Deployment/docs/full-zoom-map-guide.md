# Full-zoom offline map — guide

## The situation

| | Source | Zoom | Notes |
|---|---|---|---|
| **Online** | OpenStreetMap (`tile.openstreetmap.org`) | z0–**17** | street detail, needs internet |
| **Offline (today)** | `satellite-2017-11-02_asia_gcc-states.mbtiles` | z0–**13** | satellite, GCC extract, 2.3 GB |

So online you can keep zooming to street level; offline the satellite tiles stop at **z13** and zooming further used to show **blank/grey** tiles. Two things fix this:

1. **Overzoom (already in the code)** — the client now reads each tileset's real
   `maxzoom` from the tile-server (`GET /services/<name>.json`) and sets Leaflet
   `maxNativeZoom`. Past the data ceiling it **upscales** the deepest tiles instead
   of going blank. This makes "zoom in" usable with the *current* tiles, but it's
   stretched, not new detail. **Lands on the next image rebuild.**

2. **Real full-zoom tiles (this guide)** — acquire higher-zoom tiles for your
   Area of Interest and serve them. This is the only way to get *crisp* deep zoom.

> **Why not just download the whole online map?** The public OSM servers
> **forbid bulk downloading** (the IP gets banned), and the whole Gulf region at
> z17 is **~1 TB+**. Both make a full-region scrape a non-starter. The workable
> path is: **a bounded AO + a source you're licensed for.**

---

## Step 1 — pick the Area of Interest and a tile source

- **AO bbox** — `minlon,minlat,maxlon,maxlat` around the operation, *not* the whole
  region. A city/corridor to z16 is hundreds of MB–a few GB; the whole Gulf is not.
- **Source (you own its ToS)** — one of:
  - **A licensed provider key** — e.g. MapTiler (the same vendor as today's
    satellite). Streets: `https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=YOUR_KEY`.
    Satellite: `…/maps/satellite/{z}/{x}/{y}.jpg?key=YOUR_KEY`.
  - **Self-hosted** — render a regional OpenStreetMap extract (`.osm.pbf` from
    geofabrik) to MBTiles with [`tilemaker`](https://github.com/systemed/tilemaker)
    or the OpenMapTiles toolchain, fully offline-legal and unlimited. Heavier
    one-time setup; then point `--url` at your local renderer or skip the download
    step and use the rendered `.mbtiles` directly.

The public `tile.openstreetmap.org` URL is **not** an acceptable `--url` for bulk
download.

## Step 2 — build the MBTiles (on an internet-connected prep machine)

```bash
cd UI_MOdified
python Offline_Deployment/scripts/build-tiles-mbtiles.py \
  --bbox 19.5,30.0,20.6,31.2 \
  --minzoom 0 --maxzoom 16 \
  --url "https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=YOUR_KEY" \
  --name benghazi_streets --format png \
  --attribution "© MapTiler © OpenStreetMap contributors" \
  --out Offline_Deployment/map_data/base/benghazi_streets.mbtiles
```

It is polite (`--rate`, default 5 req/s), **resumable** (re-run to continue), has a
`--max-tiles` safety cap, and writes a standards-compliant TMS MBTiles with proper
`minzoom/maxzoom/bounds` metadata — the same shape the tile-server already serves.

## Step 3 — register it

Add the new tileset to `Offline_Deployment/map_data/base/maps.json`:

```json
{ "mbtiles": ["satellite-2017-11-02_asia_gcc-states.mbtiles", "benghazi_streets.mbtiles"],
  "tileServer": "http://localhost:8080" }
```

The tile-server auto-discovers every `*.mbtiles` in the folder; `maps.json` controls
which ones the **client** shows as layers. To make the new map the **default**
offline tile source, also set `RMOOZ_TILE_DATASET_NAME=benghazi_streets` in
`.env.offline`.

## Step 4 — get it onto the offline machine

`map_data/` is a **bind mount** (`./map_data → /app/maps`, `/app/offline_map_data`),
so for **new tiles you do NOT need to rebuild the image**:

1. Copy the new `.mbtiles` + updated `maps.json` into the offline host's
   `Offline_Deployment/map_data/base/`.
2. `docker compose -f Offline_Deployment/docker-compose.offline.yml restart` (the
   tile-server re-scans `maps/` on start).

A full **image rebuild** is only needed once, to ship the **overzoom code** (the
`maxNativeZoom` + `/services/<name>.json` changes). After that, maps are pure data.

> Transfer-package option (what you asked for): `Offline_Deployment/dist/rmooz-map-package.tar`
> is `tar` of the whole `map_data/` dir. Today it contains only the **z0–13**
> satellite — rebuild it after Step 2/3 so it carries the new full-zoom tileset.

## Step 5 — verify on the offline machine

```bash
# real maxzoom the server reports for the new set (should be your --maxzoom):
curl -s http://localhost:8080/services/benghazi_streets.json
```
Open the app, switch to the new layer, and zoom past z13 — you should now see crisp
detail up to your `--maxzoom` (and clean upscaling beyond it, not blank tiles).
