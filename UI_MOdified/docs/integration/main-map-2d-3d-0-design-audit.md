# MAIN-MAP-2D-3D-0 — 2D/3D Map Mode Design Audit

**Status:** AUDIT / DESIGN ONLY — no implementation in this task.
**Scope:** MAIN app map feature (`UI_MOdified/`). Does **not** touch `Offline_Deployment/`, LDAP, Docker, or WarGamingGEN generation.
**Deliverable:** this document. **Next build:** MAIN-MAP-2D-3D-1 (implementation), gated on the decision in §3.
**Audited at:** 2026-06-06 (commit context: post `9a5fb77`). All file:line citations are from `UI_MOdified/`.

---

## 0. ⚠️ Headline finding — a 3D view ALREADY EXISTS (read this first)

Per the GROUND-TRUTH rule, before designing a new 3D map I checked for an existing one. **There is one.**

- `client/wargame/cesium-view.js` exposes **`window.AppCesiumView`** — a full **Cesium 3D globe** view that already renders the active scenario in 3D with **2D parity**: same milsymbol/SIDC icons, altitude-by-domain (air 4500 m, helo 800 m, naval 0 m, ground clamp-to-ground), step-animated positions, parabolic engagement arcs, and coverage-ring / detection / engagement overlays mirrored from the 2D map.
- It is **toggled today** via `toggle3DGlobe()` in `client/wargame/adjudicator-hud.js:858` (button id **`#wg-adj-3d-btn`**), is **mutually exclusive** with Leaflet (hides `#map`, shows `#cesium-container`), and is wired into `adjudicator-map.js` (`_lastState`/`_lastScenario`, `setCoverageRings`/`setDetectionContacts` keep it in lock-step — `adjudicator-map.js:6100-6101, 6536, 6542`).
- **Why it doesn't satisfy this task as-is:** Cesium is **lazy-loaded from a public CDN** — `https://cesium.com/downloads/cesiumjs/releases/1.116/Build/Cesium` (`cesium-view.js:26-47`), ~10 MB, and its base imagery falls back to `tile.openstreetmap.org` (`cesium-view.js:204`). **Both break the offline requirement.** It is also heavyweight (full globe/terrain engine) versus the user's "start simple, flat/pitched first."

**Implication for the design:** this is NOT a greenfield "add 3D" task. The real choices (see §3) are: (A) make the existing Cesium view offline, (B) add a **new lightweight MapLibre GL viewer** alongside it (user's recommendation), or (C) replace Cesium with MapLibre. Critically, **`AppCesiumView`'s method surface already IS the contract** the user proposed (`init/draw/clear/setVisible/sync`), so a new MapLibre module should mirror it and **reuse the existing HUD toggle plumbing** rather than invent a parallel one.

> APP_INVENTORY note: `cesium-view.js` / `AppCesiumView` (existing CDN-based 3D) should be a tracked row; flagged here for MAIN-MAP-2D-3D-1.

---

## 1. Exact current 2D map flow

**Library load (all LOCAL, no build step):** `client/app.html`
- `../lib/leaflet.css` (:11), `../lib/leaflet.js` (:4919), `../lib/turf.min.js` (:4910), `../lib/mgrs.min.js` (:4920), `../lib/milsymbol.js` (:4925), `../lib/Leaflet.TileLayer.MBTiles.js` (:4923), `../lib/sql.js` (:4922).
- 3D today: `wargame/cesium-view.js` (:4954).
- ❌ Online deps in the main app: Google Fonts (`app.html:8-10`); OSM raster fallback (`app.js:297`); Cesium CDN + OSM (`cesium-view.js:27,204`); OSM in the import wizard's objective mini-map (`scenario-import-wizard.js:527`).

**Map creation:** `client/app.js:140`
```js
const map = L.map('map', { zoomControl:false, doubleClickZoom:false, maxZoom: MAP_DEFAULTS.maxZoom })
              .setView([MAP_DEFAULTS.initialLat, MAP_DEFAULTS.initialLng], MAP_DEFAULTS.initialZoom);
```
- Binds to DOM id **`map`**; exported as **`window.map`** (`app.js:148`). The adjudicator module reads `window.map`.

**Base tile layers:** `client/app.js`
- Local pre-baked dir: `L.tileLayer('tiles/{z}/{x}/{y}.png', …)` (:291).
- OSM CDN fallback: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png` (:297).
- MBTiles via tile-server: `{tileServer}/services/{tileset}/{z}/{x}/{y}.png` from `maps/maps.json` (`tileServer: http://localhost:8080`) (:357+).

**DOM containers:** `client/app.html:3300` inside `.map-canvas-wrap` —
```
.map-canvas-wrap
 ├─ #map                  (Leaflet; CSS style.css:480 → width/height 100%)
 ├─ #cesium-container     (3D overlay; display:none; position:absolute; inset:0; z-index:2 — app.html:3301)
 ├─ #mission-graphic-assist, #coord-tooltip, #popup-anchor, #selection-toolbar-floating
```
- `.map-canvas-wrap { flex:1; position:relative; overflow:hidden }` (`style.css:472`).

**Scenario → map data flow:**
1. Single load choke point: `AppShellScenarioWorkspace.loadLiveScenarioFromJson(json)` (`shell/scenario-workspace.js:15573`) validates, deep-copies, and sets **`window.RmoozScenario = { scenario, stepIndex:0 }`** (:15597).
2. Draw: `window.AppAdjudicatorMap.drawScenario(scenario)` (called from `scenario-workspace.js:15547`).
3. Step change: `goToStep(idx)` updates `window.RmoozScenario.stepIndex` (`scenario-workspace.js:992`) → `AppAdjudicatorMap.applyState(state, scenario, opts)` moves markers, renders attrition, pins, trails.
4. Cinematic scrub: `applyStepProgress(stepIndex, progress)` (`scenario-workspace.js:1002`).
5. Fit/center: `fitScenarioAO()` (`adjudicator-map.js:771`) — bounds from objective + BLS + Blue markers, fallback `scenario.map_bbox`.

---

## 2. Public map API (the contract a 3D module must mirror)

### 2a. `window.AppAdjudicatorMap` (2D) — `adjudicator-map.js:6504`
Core lifecycle (the minimum a 3D peer must match):
| Method | Line | Purpose |
|---|---|---|
| `drawScenario(scenario)` | 1847 | Build BLS/OBJ/AO/unit markers from a scenario. |
| `clearScenario()` | 5457 | Remove all graphics/markers/state. |
| `applyState(state, scenario, opts)` | 5576 | Apply step-resolved state: move units, attrition, arcs. Returns `{found, missed}`. |
| `resetMap()` | 6107 | Return to step 0. |
| `applyStepProgress(stepIndex, progress)` | 6249 | Fractional in-step scrub (no server state). |
| `fitScenarioAO()` | 771 | fitBounds on objective+BLS+Blue. |
| `isScenarioDrawn()` | 6235 | Drawn? |
| `getScenarioMarkers()` | 6239 | `{red:[…], blue:[…]}`. |

Pure position helpers (no Leaflet dependency — **directly reusable by 3D**):
`computeRedPosition(meta, stepIndex, progress)` (:6616), `computeBluePosition(meta, stepIndex, state)` (:6617), `resolveCurrentObjectiveCoord()` (:6524), `resolveUnitSymbolProfile(unit)` (:6522).
Cross-view hooks already present: `_lastState`/`_lastScenario` getters (:6632), `getDetectionContacts`/`getEngagements` (built "for Cesium 3D parity").
Overlay toggles (coverage rings / detection / engagements / legend / echelon roll-up) all have `set*/toggle*/is*Visible` — they already drive Cesium parity.

### 2b. `window.AppCesiumView` (existing 3D) — `cesium-view.js:734`
`drawScenario(scenario)` (:249), `applyState(state, scenario)` (:348), `clearScenario()`, `setVisible(show)→bool` (:649), `toggle()` (:702), `isVisible`, plus `renderCoverageRings/renderDetectionContacts/renderEngagements` parity. **This is already the exact "init/draw/clear/setVisible/sync" shape the task requests.**

---

## 3. Data shape available to the map (same for 2D and 3D)

`window.RmoozScenario = { scenario, stepIndex }` (only sanctioned writer: the workspace; only `stepIndex` mutates per step).

`scenario` top-level (verbatim from `client/samples/rmooz-native-01.json`):
- **`red_units[]`**: `{ uid, label, role, domain, echelon, coord:[lon,lat], strength, readiness, supply, posture, sidc }`
- **`blue_units_initial[]`**: `{ unit_uid, base_id, label, role, domain, echelon, coord:[lon,lat], …, sidc }`
- **`obj`** (singular): `{ name, coord:[lon,lat], target_depth_km, radius_km, id? }`
- **`bls_template[]`** (point markers, not polygons): `{ name, coord:[lon,lat], role, throughput, terrain_friction, side? }`
- **`steps[]`**: `{ index, time_label, elapsed_hours, phase, *_baseline… }`
- Optional per-step coordinate tables: `scenario.red_unit_step_coords[uid][stepIndex]`, `scenario.blue_unit_step_coords[uid][stepIndex]` (`world-state.js:72-74`); fall back to `unit.coord`.

**Coordinate order is `[lon, lat]` everywhere** (GeoJSON). Leaflet swaps to `[lat,lng]` at render (`adjudicator-map.js:2144`). **MapLibre uses `[lon,lat]` natively → no swap needed** (a small ergonomic win).

Marker icon path (reuse target): `resolveUnitSymbolProfile(unit)` → `sidcIcon(sidc, size)` (milsymbol `window.ms.Symbol(...).asSVG()`), fallback diamond/square. Fields consumed: `sidc, role, domain, echelon, side, label, coord`.

---

## 4. Simplest safe 3D approach (recommendation)

**Recommended: Option B — add a new lightweight, offline MapLibre GL viewer alongside the untouched 2D map, mirroring the `AppCesiumView`/`AppAdjudicatorMap` contract, and reuse the existing HUD toggle.** Leave the Cesium view in place (optional, online-only) but make MapLibre the default 3D for offline.

Rationale vs. alternatives:
- **(A) Make Cesium offline:** vendoring Cesium (~10 MB + Workers + assets) and an offline imagery/terrain provider is heavy and contradicts "start simple." Keep as an optional online "full globe" mode; don't block on it.
- **(C) Replace Cesium:** unnecessary teardown of working, fully-parity code; violates "minimal coherent" change posture. Not now.
- **(B) MapLibre GL JS:** ~250 KB, vendable locally, **pitch + bearing flat 3D** out of the box, consumes the **existing raster tile-server (`:8080`)** as a `raster` source with **zero new tile work**, native `[lon,lat]`. Matches every stated goal (keep 2D, easy 3D, looks like 2D but pitched, offline, terrain later).

**First-phase 3D = a pitched/rotatable raster map** (no DEM), same center/bounds as 2D, with unit + objective + BLS markers; arrows/paths deferred.

---

## 5. Proposed module: `client/wargame/adjudicator-map-3d.js`

Expose `window.AppAdjudicatorMap3D` mirroring the existing contract (names per the task):
```
init3DMap(containerId='maplibre-container', options) → Promise<bool>   // lazy: inject local maplibre, create map
drawScenario3D(scenario)                                               // markers from scenario (reuse §3 fields)
clearScenario3D()                                                      // remove markers/sources
set3DVisible(show:boolean) → Promise<bool>                            // show/hide; hides #map when true (mutually exclusive)
sync3DToCurrentStep(scenario, stepIndex)                               // move markers using computeRed/BluePosition
```
Internals reuse, do **not** rebuild: `AppAdjudicatorMap.computeRedPosition/computeBluePosition/resolveCurrentObjectiveCoord/resolveUnitSymbolProfile`; milsymbol SVG → MapLibre HTML marker (`new maplibregl.Marker({element})`) — see §9.

**Container:** add a sibling to `#cesium-container` in `.map-canvas-wrap` (`app.html:3300`):
```html
<div id="maplibre-container" style="display:none; position:absolute; inset:0; z-index:2;"></div>
```
(Same layering/CSS as the Cesium container; mutually exclusive with `#map`.)

---

## 6. UI toggle design (reuse existing plumbing)

The HUD already owns `toggle3DGlobe()` + `#wg-adj-3d-btn` (`adjudicator-hud.js:858`). Two safe options:
- **Minimal:** repoint the existing 3D button to a backend selector: prefer `AppAdjudicatorMap3D` (offline MapLibre) when available; fall back to `AppCesiumView` only if explicitly chosen/online.
- **Explicit (matches the ask):** a small **2D / 3D** segmented control near the map. Default **2D** (Leaflet shown). **3D** → `set3DVisible(true)` (MapLibre). Switching **back to 2D must not reset scenario state** — `#map` stays drawn; only visibility toggles. **If 3D init fails, fall back to 2D + a status message** (mirror the Cesium `setVisible→false` failure path at `adjudicator-hud.js:875`).

Behavior contract: default 2D; 2D↔3D toggles visibility only (no re-draw/reset); 3D failure is non-fatal and returns to 2D.

---

## 7. Offline compatibility (hard requirement)

**Can we do MapLibre fully offline with what's here? YES.** Evidence:
- **Tile server present & offline:** `server/tile-server.js` (port **8080**, loopback) serves raster PNG/JPEG from `maps/*.mbtiles`; `maps/satellite-2017-11-02_asia_gcc-states.mbtiles` (**2.47 GB**) is already bundled. URL: `http://localhost:8080/services/<tileset>/{z}/{x}/{y}.png`.
- **No build step:** libs are hand-vendored in `lib/` — MapLibre drops in the same way.

**Required for offline (must add — none of these may use a CDN):**
1. Vendor `lib/maplibre-gl.js` + `lib/maplibre-gl.css` locally (no unpkg/jsdelivr). Add `<link>`/`<script>` to `app.html` next to Leaflet.
2. Author `lib/rmooz-map-style.json` — a MapLibre style with a single **`raster`** source pointing at the local tile server:
   ```json
   { "version": 8, "sources": { "sat": { "type":"raster", "tiles":["http://localhost:8080/services/satellite-2017-11-02_asia_gcc-states/{z}/{x}/{y}.png"], "tileSize":256 } },
     "layers": [{ "id":"sat","type":"raster","source":"sat" }] }
   ```
   (No `glyphs`/`sprite` URLs unless vendored — markers are HTML, so glyphs aren't required for v1.)
3. **No Mapbox token, no Google/Bing, no internet.**

**Pre-existing offline blockers (track separately — not introduced by 3D, but relevant):** Google Fonts (`app.html:8-10`; design exists: `docs/integration/offline-fonts-0-local-fonts.md`), OSM fallback (`app.js:297`), Cesium CDN (`cesium-view.js:27,204`). MAIN-MAP-2D-3D-1 must not add to this list.

---

## 8. Tiles (phase-1 reuse) and 9. terrain/DEM (later)

**Phase 1 (now):** reuse the existing raster MBTiles via the tile server as a MapLibre `raster` source (§7). Same imagery as 2D → "looks like the 2D map but pitched." Pitch/bearing via `map.setPitch(60)`, `map.dragRotate.enable()`.

**Later (MAIN-MAP-2D-3D-2+), do NOT implement now:** true elevation needs a MapLibre **`raster-dem`** source + `map.setTerrain({ source, exaggeration })`. Requirements to solve first:
- Local **DEM tiles** in Terrarium/Mapbox-RGB encoding served by the tile server (today only `TestingAI/.../inputs/gis/elevation/libya_dem.tif` exists — a single GeoTIFF, **not** web-tiled, and out of scope to convert here).
- Offline terrain style + exaggeration tuning; performance limits on low-end/offline hardware; bounds clamping to the DEM coverage.

---

## 9. Marker rendering (phase 1)

- Use **HTML markers** (`new maplibregl.Marker({ element })`) positioned at `[lon,lat]` (no swap). Element = the existing milsymbol SVG via `resolveUnitSymbolProfile(unit)` + `sidcIcon`. **Do not rebuild the symbol system**; SIDC fidelity parity comes free by reusing the 2D path.
- Reuse side/role/domain/echelon/color from §3; objective + BLS as distinct markers. Selection/click and arrows/paths deferred to a later phase.

---

## 10. What to reuse vs. what must wait

**Reuse from 2D (no rebuild):** scenario data shape & load choke point; `computeRedPosition`/`computeBluePosition`/`resolveCurrentObjectiveCoord`; milsymbol icon path (`resolveUnitSymbolProfile`/`sidcIcon`); the existing raster tile server; the HUD toggle pattern; the `#cesium-container` sibling/CSS layering as the model for `#maplibre-container`; the `AppCesiumView` method surface as the API template.

**Must wait:** DEM/terrain (§9-later); arrows/paths/engagement arcs in 3D (phase 2 — Cesium already shows how); offline fonts + OSM/Cesium CDN removal (separate offline tasks); any vector/MBTiles base map beyond the bundled raster.

---

## 11. Safe implementation plan for MAIN-MAP-2D-3D-1

1. **Decision gate:** confirm Option B (MapLibre default, keep Cesium as optional online). Add an `APP_INVENTORY.md` row for `cesium-view.js` and the new `adjudicator-map-3d.js`.
2. **Vendor** `lib/maplibre-gl.{js,css}` locally; add tags to `app.html` (no CDN). Add `#maplibre-container` sibling.
3. **Author** `lib/rmooz-map-style.json` (local raster source → tile server).
4. **Implement** `client/wargame/adjudicator-map-3d.js` → `window.AppAdjudicatorMap3D` (§5), reusing 2D position/symbol helpers; lazy-init on first 3D toggle.
5. **Wire** the 2D/3D toggle (§6) — default 2D, mutually exclusive visibility, 2D state preserved, graceful fallback on 3D failure.
6. **Guardrails:** no logic/loader/import/playback changes; no scenario mutation; no generator changes; `Offline_Deployment`/LDAP/Docker/WarGamingGEN untouched; no new CDN references.

**Proposed tests (next phase):**
1. 2D remains the default view on load. 2. 2D/3D toggle exists and is wired. 3. 2D→3D does not throw; `set3DVisible(true)` resolves. 4. 3D unit count == count of coordinate-bearing units in the scenario. 5. `clearScenario3D()` removes all 3D markers. 6. `AppAdjudicatorMap.drawScenario` behavior unchanged (existing 2D suites still pass). 7. **No external CDN strings** in any file the task adds (grep unpkg/jsdelivr/cdnjs/mapbox/cesium.com/openstreetmap/googleapis). 8. `Offline_Deployment/` untouched (git scope). 9. 3D→2D preserves scenario state (still `isScenarioDrawn()`). 10. Style JSON references only `localhost:8080` (no internet host).

---

## Acceptance self-check
1. Exact current 2D flow — §1. 2. Exact files/functions to touch later — §2, §5, §6, §11 (with line numbers). 3. Simplest 3D approach — §4 (MapLibre raster, pitched). 4. Reuse from 2D — §3, §10. 5. What must wait (terrain/offline tiles) — §8-later, §10. 6. Safe plan for -1 — §11. Plus the §0 ground-truth that a Cesium 3D path already exists and shapes the decision.
