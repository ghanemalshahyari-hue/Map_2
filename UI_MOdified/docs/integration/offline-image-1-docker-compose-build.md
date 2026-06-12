# OFFLINE-IMAGE-1 — Docker Compose Build Plan

**Status:** Design complete — implementation pending  
**Date:** 2026-06-06  
**Depends on:** OFFLINE-ISOLATION-0/1 (offline_app isolation), OFFLINE-IMAGE-0 (inventory)

---

## What OFFLINE-IMAGE-1 delivers

A complete, buildable Docker Compose configuration for the RMOOZ offline deployment:

1. `Offline_Deployment/Dockerfile.offline` — finalized build (already drafted)
2. `Offline_Deployment/docker-compose.offline.yml` — finalized compose (already drafted)
3. `Offline_Deployment/offline_app/` — full LDAP + font + map-source overlay
4. `Offline_Deployment/map_data/` — mounted read-only for local tile data
5. Map source resolver wired to the server (`/api/offline/map-config` endpoint live)
6. Build/save/load scripts for transferring the image to an offline machine

---

## Map source requirement (updated OFFLINE-IMAGE-1 map requirement)

The offline deployment **does not require local map files to start**. The map source
resolver handles three states gracefully:

| State | Behavior |
|-------|---------|
| Local tiles present in `map_data/` | Map loads from local tiles |
| No local tiles + `FALLBACK_TILE_URL` configured | Map loads from internal fallback server |
| Neither | App starts fine; map area shows "map unavailable" message |

The app **never** silently falls back to public internet tile servers.

---

## Remaining work for OFFLINE-IMAGE-1

### 1. Wire `/api/offline/map-config` endpoint

The backend module `server/offline-map-config.js` is written but needs a route in
`server/web-server.js`. Since `web-server.js` is not yet in `offline_app/`, this requires
adding it or patching the main server.

**Option A (preferred):** Add `offline_app/server/web-server.js` — a thin wrapper that
requires the main web-server.js and adds the offline route before the main handler.

**Option B (simpler):** The offline app-data.js already exports `handleOfflineApi()`.
Copy main `web-server.js` to `offline_app/server/web-server.js` and add one line:

```javascript
// Near the top of the request handler, before other routes:
if (appData.handleOfflineApi(req, res)) return;
```

### 2. Fix Cesium 3D imagery to use offline source

`client/wargame/cesium-view.js` line 204 uses OSM imagery:
```javascript
url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
```

For offline, this should be replaced with `window.__RMOOZ_OFFLINE_MAP__.activeTileUrl`
or `FALLBACK_TILE_URL`. Add `offline_app/client/wargame/cesium-view.js` with this fix.

### 3. Build and transport scripts

```bash
# Build (on internet-connected machine):
docker build -f Offline_Deployment/Dockerfile.offline -t rmooz-offline:1.0 .

# Save image to tar:
docker save rmooz-offline:1.0 | gzip > rmooz-offline-1.0.tar.gz

# Load on offline machine:
docker load < rmooz-offline-1.0.tar.gz

# Start:
docker compose -f Offline_Deployment/docker-compose.offline.yml \
  --env-file Offline_Deployment/.env.offline up -d
```

### 4. Acceptance tests (OFFLINE-IMAGE-1)

Run `test-offline-isolation-0.js` — must still pass (47/47).

Additional tests for OFFLINE-IMAGE-1:
- App boots on port 5006 without internet
- `GET /api/offline/map-config` returns correct mode/URLs from env
- Map shows local tiles when `map_data/` is populated
- Map shows fallback tiles when `map_data/` is empty and `FALLBACK_TILE_URL` is set
- Map shows unavailable message when neither source is present
- No public OSM tile URL appears in network requests
- Cesium 3D uses offline tile URL (not OSM)

---

## Offline_Deployment directory state after OFFLINE-IMAGE-1

```
Offline_Deployment/
  Dockerfile.offline              ← Final overlay build
  docker-compose.offline.yml     ← Final compose with map_data mount
  .env.offline.example           ← Full template with LDAP + map config
  README.md                      ← Architecture overview
  map_data/
    README.md                    ← How to populate
    base/                        ← Tile pyramid (empty until operator adds)
    terrain/                     ← Cesium terrain (empty until operator adds)
    styles/                      ← Style JSON (optional)
    attribution/                 ← License attribution (required by tile source)
  offline_app/
    README.md
    package.json                 ← includes ldapjs
    server/
      app-data.js                ← LDAP + offline API exports
      auth/ldap-auth.js          ← LDAP bind module
      offline-map-config.js      ← Map config endpoint handler
      web-server.js              ← NEW: wires /api/offline/* routes
    client/
      app.html                   ← CDN-free + map resolver script tag
      index.html                 ← LDAP hint
      landing-auth.js            ← initAuthMode
      assets/fonts/rmooz-fonts.css
      wargame/
        offline-map-source.js    ← Map source resolver
        cesium-view.js           ← NEW: offline imagery fix
  docs/
    offline-map-data-guide.md    ← How to configure map sources
    offline-deployment-checklist.md
    ldap-configuration-guide.md
    troubleshooting.md
  scripts/
    test-ldap-connectivity.ps1
    test-ldap-connectivity.sh
    test-container-network.sh
    build-offline-image.ps1      ← NEW: docker build + save
    load-offline-image.ps1       ← NEW: docker load on offline machine
```
