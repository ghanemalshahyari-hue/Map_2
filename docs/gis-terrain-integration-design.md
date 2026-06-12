# GIS / Terrain Integration — Research + Design Slice

**Status: DESIGN ONLY (owner-directed slice, 2026-06-12). No implementation, no heavy 3D
engine, no offline-image rebuild until the owner approves the roadmap in §12.**

Goal: terrain becomes ONE global RMOOZ layer consumed by every planning surface — manual
scenario builder, uploaded-document analysis, location intelligence, COA review, unit
tasking, route planning, the RED/BLUE/WHITE timeline, and (later) animation — instead of
each feature inventing its own ad-hoc terrain handling.

Related contracts: `docs/coa-wargame-design.md` (D1–D10; G-4 tasking, G-5 timeline, G-7
animation), Planning Model G-3A (`server/ai/planning-model.js`), Location Intelligence
G-3B (`server/ai/location-intelligence.js`), COA panel G-3C.

---

## 0. Ground truth — what already exists (do not rebuild)

| Asset / module | State | Notes |
|---|---|---|
| `server/dem-service.js` | **EXISTS but ORPHANED (drift)** | Reads an uncompressed Float32 GeoTIFF directly (hand-coded offsets), `getElevation(lon,lat)`, `renderTile(z,x,y)` → hillshade+colormap PNG with disk cache (`data/dem-tiles/`), `getMeta()`. **No endpoint or client references it.** Limitations: single hardcoded Libya dataset (`libya_demx5.tif`, machine-local default path, ×5 elevation scale hack, no compression support). |
| `TestingAI/WarGamingGEN/inputs/gis/` (~960 MB, gitignored) | EXISTS | `elevation/libya_dem.tif` (GeoTIFF DEM), `terrain/{roads, landuse, inland_water, water_way, aerodromes, populated_places}.geojson`, `boundaries/nato-map-layers.geojson`, `imagery/satellite_base.jpeg+bbox`. Python `gis_loader` treats elevation/terrain as optional. |
| `server/tile-server.js` + OFFLINE-TILE-PROXY-1 | EXISTS, production | Serves **any `.mbtiles` dropped into `maps/`** (better-sqlite3, 25 GB+ tested); web-server proxies `/services/` so one public port suffices offline. → **new raster terrain layers = new .mbtiles files, zero server code.** |
| Client stack | EXISTS | Leaflet + milsymbol + **Turf** + MGRS, vanilla JS, no build step. Turf enables client-side vector checks (point-in-polygon, nearest-line) on small AO extracts. |
| Planning Model taxonomy | EXISTS | `SOURCE_TYPES` (11) + `TRUST_RANK` L15: operator-declared(4) > reviewed(3) > derived(2) > AI(1); `makeSource{type,file,key,origin,confidence}` validation throws on unknown types. |
| Location Intelligence candidates | EXISTS | `{kind, lat, lon, confidence, needs_review:true, source, evidence[], warnings[]}` + AO checks + incident matching. Terrain checks extend this shape additively. |
| Scenario schema terrain stubs | EXISTS | `terrain_note` (free text), `bls_template[].terrain_friction` — the only terrain the adjudicator sees today. |

**Drift flag (per CLAUDE.md):** `dem-service.js` is functional but unwired — the inventory's
"3D/DEM wired" claim no longer holds on this branch. T-1 (§12) wires it rather than
rebuilding it.

## 1. Terrain data formats

| Format | Use in RMOOZ | Verdict |
|---|---|---|
| **GeoTIFF DEM (source of truth)** | Per-AO elevation source; input to all derivatives. Store as **COG (Cloud-Optimized GeoTIFF), EPSG:4326, Float32 metres, internal tiling 512, overviews** — kills dem-service's hand-parsed-offsets fragility (COG = standard layout readable by range requests; GDAL emits it deterministically). | **Adopt (canonical store)** |
| **Raster DEM tiles (Terrain-RGB / Mapbox encoding)** | `(R*65536+G*256+B)*0.1-10000` metres in ordinary PNG tiles → works in any raster pipeline today (Leaflet shows them; MapLibre decodes them for hillshade/3D later). Packaged as `.mbtiles` → existing tile-server serves them untouched. | **Adopt (interchange format)** |
| **Hillshade + slope/aspect rasters** | Pre-computed by GDAL (not at runtime — dem-service currently shades per tile request; pre-computation is cheaper and deterministic). Hillshade as display `.mbtiles`; slope (degrees) and aspect as Terrain-RGB-style data tiles or small COGs for analysis reads. | **Adopt (derived products)** |
| **Contours / vector terrain** | `gdal_contour` → GeoJSON (small AOs) for display; existing roads/landuse/water/aerodromes GeoJSONs are the mobility/LZ inputs. Large vectors later as PMTiles/vector-mbtiles if size demands. | **Adopt (already half-present)** |
| **Cesium quantized-mesh** | True 3D terrain meshes. Requires Cesium runtime + mesh generation tooling. | **Defer (T-6 option; revisit with the 3D decision)** |

## 2. Client options

| Option | Assessment | Decision |
|---|---|---|
| **Leaflet (current)** | Already carries the whole app (RTL, milsymbol, drawing, panels). Displays hillshade/DEM-colormap `.mbtiles` as plain `L.tileLayer` overlays today; Turf covers vector checks. Cannot do GPU hillshading or 3D — display-only of pre-rendered rasters. | **Keep now (T-1..T-4). All analysis server-side or Turf.** |
| **MapLibre GL JS** | Open-source, offline-friendly, decodes Terrain-RGB natively (`raster-dem` source → live hillshade + `setTerrain` 2.5D). Migration cost: the entire Leaflet plugin surface (draw tools, milsymbol markers, panes) would need porting — NOT a slice. | **Phase-2 candidate (T-5): side-by-side "terrain view" panel first, not a migration.** |
| **CesiumJS** | Full 3D globe, quantized-mesh, best for later FPV/animation ambitions. Heaviest runtime; offline asset pipeline (terrain tiles) required; overkill for 2D regional planning today. | **Defer (T-6, explicit owner decision).** |
| **deck.gl** | GPU overlays (arcs, heatmaps, LOS volumes) interoperating with MapLibre. Only meaningful after MapLibre. | **Defer (with T-5/T-6).** |

The deciding facts: the data formats in §1 are **client-agnostic** (COG + Terrain-RGB +
GeoJSON feed Leaflet, MapLibre, and Cesium equally), so adopting them now preserves every
future client option while shipping value on Leaflet immediately.

## 3. Server / offline pipeline

**Preprocessing (operator/dev machine, GDAL — already the de-facto GIS toolchain):**
```
# 1. normalize source DEM → COG (canonical)
gdal_translate -of COG -co COMPRESS=DEFLATE -co BLOCKSIZE=512 \
    -a_srs EPSG:4326 libya_dem.tif ao_libya_dem.cog.tif
# 2. derivatives
gdaldem hillshade  -compute_edges ao_libya_dem.cog.tif hillshade.tif
gdaldem slope      -compute_edges ao_libya_dem.cog.tif slope.tif      # degrees
gdaldem aspect     -compute_edges ao_libya_dem.cog.tif aspect.tif
gdal_contour -a elev -i 50 ao_libya_dem.cog.tif contours_50m.geojson
# 3. display/interchange tiles → mbtiles (rio rgbify or gdal2tiles+mb-util)
#    hillshade.mbtiles (display), terrain_rgb.mbtiles (data)
```
Outputs land in two places, both already supported offline:
- **`maps/*.mbtiles`** → served by tile-server via the existing single-port `/services/`
  proxy (no new ports, honoring OFFLINE-TILE-PROXY-1).
- **`data/terrain/<ao_id>/`** → COGs + `terrain.meta.json` (dataset registry: bbox, pixel
  size, vertical datum/scale, source, license, checksum) + derived GeoJSONs.

**Runtime terrain service (`server/terrain-service.js`, T-2 — generalizes dem-service.js):**
- Registry-driven (reads `terrain.meta.json` per AO) instead of hardcoded constants; keeps
  dem-service's proven lazy-fd + tile-cache patterns; reads COG block layout (or, simplest
  v1: GDAL pre-exports uncompressed striped Float32 exactly like today, with constants in
  the meta file instead of the source code).
- API surface (all read-only): `GET /api/terrain/meta` · `GET /api/terrain/elevation?lon&lat`
  · `GET /api/terrain/profile?path=lon,lat;lon,lat…` (sampled line) ·
  `GET /api/terrain/analyze?kind=slope|lz|los&…` (§4 products) · tile endpoints stay on the
  tile-server/mbtiles path.
- **AO-keyed analysis cache**: `data/terrain/<ao_id>/cache/<analysis_hash>.json` —
  deterministic inputs (AO bbox + layer checksums + parameters) → cache key; mirrors the
  graphify/stat-index caching convention already in the repo.

**Offline rule compliance:** all preprocessing happens before bundling; the image/runtime
never needs internet, GDAL is NOT shipped in the image (outputs only), no real endpoints or
machine paths in tracked files (`DEM_PATH`-style envs move to `.env.offline`).

## 4. RMOOZ schema additions (all additive; validator ignores unknown keys — `neutral_units` precedent)

```
scenario.terrain_layers[] = {            // registry of layers available for this scenario/AO
  id, kind: 'dem'|'hillshade'|'slope'|'aspect'|'contours'|'landuse'|'roads'|'water'|
            'coastline'|'aerodromes'|'populated'|'imagery',
  format: 'cog'|'mbtiles'|'geojson'|'image+bbox',
  uri,                                   // /services/… or data/terrain/<ao>/…
  bbox, resolution_m?, vertical?: {datum, scale},
  source: {provider, file, license?, checksum}, confidence: 'high'|'medium'|'low'
}
scenario.terrain_analysis[] = {          // cached analysis products (AO-keyed)
  id, kind: 'slope_class'|'mobility'|'observation'|'los'|'lz_suitability'|'choke_points',
  ao_id, params, result_uri|result,      // inline GeoJSON when small
  computed_at, inputs: [layer_id…], cache_key,
  source: makeSource({type:'gis_analysis', …}), needs_review: true
}
scenario.route_constraints[] = {         // per route/axis (tasking + COA routes)
  route_ref, distance_km, max_slope_deg, avg_slope_deg, steep_segments[],
  mobility_class: 'go'|'slow-go'|'no-go', crossings[: water/road], confidence, source
}
scenario.mobility_zones[]      = { id, class: 'go'|'slow-go'|'no-go', geometry, basis[: slope|landuse|water], confidence, source }
scenario.observation_zones[]   = { id, kind: 'dominating_ground'|'dead_ground', geometry, observer_ref?, confidence, source }
scenario.line_of_sight[]       = { id, from{lon,lat,h_m}, to{lon,lat,h_m}, visible: bool, obstruction?, samples?, confidence, source }
scenario.landing_zone_suitability[] = {  // amphibious (D6 pairs with operator confirmation)
  id, geometry|coord, score: 0..1, factors{slope, exits, surf_zone?, obstacles?},
  verdict: 'suitable'|'marginal'|'unsuitable', confidence, source, needs_review: true
}
```
Every record carries `source` (§5) + `confidence`; nothing terrain-derived is ever
presented as operator truth (L6 applies unchanged).

## 5. Planning Model integration (G-3A)

Two new entries in the frozen `SOURCE_TYPES` taxonomy + trust ranks:

| type | TRUST_RANK | Rationale |
|---|---|---|
| `terrain_layer` | **3** (reviewed/authoritative data) | A direct reading of curated data (elevation at a point, landuse polygon membership) — same trust class as `location_db`. |
| `gis_analysis` | **2** (derived) | Computed products (slope class, LOS, LZ score) inherit processing assumptions — same class as `world_state` derivations. |

`makeSource` reuse: `{type:'terrain_layer', file:'ao_libya_dem.cog.tif', key:'elevation',
origin:'27.05,31.20', confidence:'high'}`. The L15 precedence rule then automatically makes
operator declarations override terrain, and terrain override AI guesses — no new conflict
logic needed.

## 6. Location Intelligence integration (G-3B)

Each placement candidate gains an additive `terrain` block populated by the terrain service
when layers cover the AO (absent ⇒ behavior unchanged):
```
candidate.terrain = {
  elevation_m, slope_deg, slope_class: 'flat'|'moderate'|'steep',
  inside_ao: bool,                       // existing AO check, now geometry-accurate
  near: { road_km?, coast_km?, port_km?, aerodrome_km? },   // from existing GeoJSONs
  landing: { score, verdict }?,          // only when operation_type = amphibious_landing
  source: makeSource({type:'terrain_layer'|'gis_analysis', …}), confidence
}
```
Checks append to the existing `evidence[]`/`warnings[]` (e.g. `terrain_slope_check: hit`,
warning `steep_terrain_24deg`); scoring may down-rank but **never auto-rejects** a
candidate (commander review stays the gate, LI-1/LI-4 unchanged).

## 7. COA integration (G-3C panel + G-2 schema)

Additive `coa.terrain_warnings[]`, rendered as amber chips on the COA cards:
```
{ kind: 'exposed_route'|'steep_route'|'choke_point'|'high_ground_near_objective'|
        'poor_landing_zone'|'los_risk',
  where: geometry|route_ref|coord, severity: 'info'|'warn'|'high',
  basis: [analysis_id…], confidence, source, needs_review: true }
```
Produced by a deterministic pass over the COA's phases/routes/objective against
`terrain_analysis` products (observation zones near the objective → `high_ground_near_objective`;
route through `no-go`/narrow corridor → `choke_point`; LZ verdict marginal/unsuitable →
`poor_landing_zone`; LOS from known/assessed enemy positions → `los_risk`/`exposed_route`).
Warnings inform the commander and the WHITE rule engine (G-6 doctrine cards may cite them:
`rule_cards_fired` ∪ terrain basis) — they never auto-reject a COA.

## 8. Unit Tasking integration (G-4)

Tasking routes (per `docs/coa-wargame-design.md` §2) get a terrain annotation on submit:
```
tasking.route_terrain = {
  distance_km,                            // geodesic along route
  profile?: [ {d_km, elev_m} … ],         // for the panel's mini elevation strip
  max_slope_deg, slope_warning: bool,     // > slope threshold for unit class
  mobility_warning: 'go'|'slow-go'|'no-go',
  terrain_confidence: 'high'|'medium'|'low',
  needs_review: true                      // commander sees warnings before Run Turn
}
```
The G-4 tasking panel shows the warnings inline; WHITE's rule engine (G-5/G-6) may consume
the same record. Threshold defaults (e.g. slow-go > 15°, no-go > 30°, wheeled vs tracked)
ship as **doctrine rule cards**, not hardcoded constants (L7/L8 alignment).

## 9. Recommended architecture

```
            preprocessing (GDAL, dev machine)            runtime (offline image)
 source DEM ─┬─► ao_<id>_dem.cog.tif ───────────────► data/terrain/<ao>/  ◄─ terrain.meta.json
             ├─► hillshade.mbtiles / terrain_rgb.mbtiles ─► maps/  ─► tile-server ─► /services/ (existing proxy)
             └─► slope/aspect COG + contours/landuse GeoJSON ─► data/terrain/<ao>/

 server/terrain-service.js (T-2; generalizes dem-service.js, registry-driven)
   ├─ point/profile/region reads (COG)            ├─ analysis products + AO-keyed cache
   ├─ /api/terrain/* read-only endpoints          └─ source stamps: terrain_layer | gis_analysis
        ▲                ▲                ▲                ▲               ▲
 location-intel     brief-to-scenario   COA warnings   unit tasking    WHITE rule engine
 (candidates §6)    (LZ + AO checks)    (§7 chips)     (§8 routes)     (G-6 cards cite basis)

 client (Leaflet now): shell/terrain-layers.js — L.tileLayer overlays (hillshade/DEM/contours),
 layer toggles in the existing layer UI, candidate/COA/tasking chips render the warnings.
```
One service, one registry, one source taxonomy — every consumer reads the same products.

## 10. Offline deployment approach

- Terrain artifacts are **data, not image content**: `maps/` and `data/` are already
  volumes; bundles ship `maps/*.mbtiles` + `data/terrain/<ao>/` alongside the existing map
  bundle flow. Image rebuild NOT required for new AOs.
- `.dockerignore` already excludes `TestingAI/**/inputs/gis` (raw 960 MB stays out);
  prepared artifacts are orders smaller (hillshade mbtiles for one AO ≈ tens of MB).
- No internet at runtime; no GDAL in the image; `DEM_PATH`-class settings via `.env.offline`
  only (existing endpoint-hygiene rule applies verbatim).
- Graceful degradation everywhere: missing terrain registry ⇒ all consumers behave exactly
  as today (candidates without `terrain` block, COAs without warnings, taskings without
  route_terrain) — terrain is an enhancer, never a dependency.

## 11. Test plan

| Layer | Tests (static, no GPU/browser except the marked ones) |
|---|---|
| terrain-service | meta registry load; `getElevation` known-point fixtures (±1 m); profile sampling determinism; out-of-coverage ⇒ null (never throws); cache key stability (same inputs ⇒ same key, param change ⇒ new key) |
| schema | additive keys pass the scenario validator (unknown-key precedent); every terrain record carries source+confidence; `makeSource('terrain_layer'/'gis_analysis')` accepted, trust ranks 3/2 asserted |
| location-intel | candidate WITH coverage gains terrain block + warnings; WITHOUT coverage unchanged (regression); steep/no-go down-ranks but never drops a candidate |
| COA | fixture COA over fixture analysis ⇒ expected warning kinds; no warnings without coverage; warnings render as chips (browser verify on the existing G-3 harness) |
| tasking | route_terrain distance/profile math against hand-computed fixture; slope/mobility thresholds read from rule cards not constants |
| offline | tile-server serves hillshade.mbtiles (existing suite pattern); single-port proxy regression; no machine paths/endpoints in tracked files (gate test) |
| regression | full existing suite stack stays green; adjudicator `terrain_note`/`terrain_friction` behavior unchanged |

## 12. Phased roadmap (each phase independently shippable; owner gates each)

| Phase | Scope | Size |
|---|---|---|
| **T-1 Wire what exists** — ✅ **DONE 2026-06-12 (GIS-TERRAIN-1)** | `server/terrain-api.js`: read-only `GET /api/terrain/health` + `GET /api/terrain/elevation` + `POST /api/terrain/profile` over the formerly-orphaned `dem-service.js`; graceful degradation without a DEM; interim slope thresholds flagged `needs_review` (G-6 owns them later). Scope note: owner narrowed T-1 to endpoints only — Leaflet overlay + hillshade-tile route move to T-4/T-5; DEM path stays env-overridable (`DEM_PATH`), `.env.offline` documentation with T-2 registry. | S |
| **T-2 Planning-Model integration** — ✅ **DONE 2026-06-12 (GIS-TERRAIN-1, owner-narrowed scope)** | `SOURCE_TYPES` += `terrain_layer`(trust 3) / `gis_analysis`(trust 2); `terrain_layers[]`/`terrain_analysis[]` on the model + `attachTerrainLayer`/`attachTerrainAnalysis` (clone, preserve provenance, `needs_review` forced on analyses); tally counts terrain. The registry/multi-AO `terrain-service.js` + GDAL recipes from the original T-2 remain **pending** (fold into T-3). | M |
| **T-3 Analysis products v1** | slope classes → mobility_zones; LZ suitability (slope+exits+coast from existing GeoJSONs); schema additions §4; Planning-Model source types §5; Location-Intelligence terrain block §6 | M |
| **T-4 Consumer wiring** | COA terrain_warnings + card chips §7; tasking route_terrain §8 (lands WITH G-4); brief-to-scenario LZ check feeding the D6 landing-area confirmation | M |
| **T-5 Client upgrade (optional)** | MapLibre side-panel "terrain view" using the same Terrain-RGB tiles (no Leaflet migration); deck.gl only if needed | M/L |
| **T-6 3D decision** | Cesium/quantized-mesh evaluation — separate owner decision with the animation phase (G-7) | L |

Recommended start: **T-1 + T-2** (small, reuses proven code, unlocks every consumer).

## 13. Decisions needed before coding

1. Approve taxonomy additions `terrain_layer`(3) / `gis_analysis`(2) — §5.
2. Approve the two-format canon (COG store + Terrain-RGB/mbtiles interchange) — §1.
3. T-1 scope confirmation: wire dem-service as-is (Libya AO) before the T-2 generalization?
4. Slope/mobility threshold defaults live in doctrine rule cards (G-6) — confirm sequencing
   (T-4 may ship with interim constants flagged `needs_review` until G-6 lands).
5. MapLibre side-panel (T-5): in or out of the next quarter's scope?
