/**
 * offline-map-config.js — Backend handler for GET /api/offline/map-config
 *
 * OFFLINE_APP ONLY — NOT in the main app.
 *
 * OFFLINE-RUNTIME-FIX-4: Added TILE_PUBLIC_BASE_URL support so the returned
 * localTileUrl is browser-reachable when the app runs on a remote server
 * (e.g. http://<server-ip>:8640) and the browser is on a different machine.
 *
 * Key env vars:
 *   TILE_PUBLIC_BASE_URL     — browser-facing base URL of the tile server
 *                              e.g. http://<server-ip>:8080
 *                              If set, localTileUrl is derived from this.
 *   RMOOZ_TILE_DATASET_NAME  — MBTiles tileset name (filename without .mbtiles)
 *                              default: satellite-2017-11-02_asia_gcc-states
 *   MAP_SOURCE_MODE          — auto | local | fallback (default: auto)
 *   LOCAL_TILE_URL           — explicit tile URL (overridden by TILE_PUBLIC_BASE_URL)
 *   FALLBACK_TILE_URL        — operator fallback when local tiles unavailable
 *   MAP_FALLBACK_ENABLED     — 1 | 0 (default: 1)
 *   OFFLINE_MAP_DATA_DIR     — path to local tile data (default: /app/offline_map_data)
 *
 * Response is SAFE — no LDAP, session, or AI credentials are returned.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const VALID_MODES       = new Set(['auto', 'local', 'fallback']);
const DEFAULT_DATASET   = 'satellite-2017-11-02_asia_gcc-states';

function getMapConfig() {
    const mode = (process.env.MAP_SOURCE_MODE || 'auto').toLowerCase().trim();
    const dataset = (process.env.RMOOZ_TILE_DATASET_NAME || DEFAULT_DATASET).trim();

    // ── In-app tile proxy mode (RMOOZ_TILE_PROXY_MODE=web) ────────────────────
    // Serve tiles through the RMOOZ WEB port — the same origin the user opened —
    // which web-server.js proxies to the internal tile-server. Users then need
    // ONLY the web app port (e.g. :8640); the internal 8080 is never exposed.
    // localTileUrl is built from WEB_PUBLIC_BASE_URL; if that is blank we emit a
    // same-origin RELATIVE URL ("/services/...") that works no matter how the
    // browser reached the server.
    const proxyMode      = (process.env.RMOOZ_TILE_PROXY_MODE || '').toLowerCase().trim() === 'web';
    const webPublicBase  = (process.env.WEB_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');

    // TILE_PUBLIC_BASE_URL = the public IP:port of the (separate) tile server,
    // used only when proxy mode is OFF.
    const tilePublicBase = (process.env.TILE_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');

    let localTileUrl, tileBase;
    if (proxyMode) {
        localTileUrl = `${webPublicBase}/services/${encodeURIComponent(dataset)}/{z}/{x}/{y}.png`;
        tileBase     = webPublicBase;   // '' → same-origin relative probe
    } else if (tilePublicBase) {
        localTileUrl = `${tilePublicBase}/services/${encodeURIComponent(dataset)}/{z}/{x}/{y}.png`;
        tileBase     = tilePublicBase;
    } else {
        // Localhost-only — works when the browser is on the Docker host itself.
        localTileUrl = (process.env.LOCAL_TILE_URL ||
            `http://localhost:8080/services/${dataset}/{z}/{x}/{y}.png`).trim();
        tileBase     = 'http://localhost:8080';
    }

    // ── Health-check URL ──────────────────────────────────────────────────────
    // Probed with GET (not HEAD — some tile services reject HEAD). z=7/79/53 is a
    // known-present tile of the GCC satellite set. tileBase '' → relative probe.
    const defaultHealthcheck = `${tileBase}/services/${encodeURIComponent(dataset)}/7/79/53.png`;
    const healthcheckUrl = (process.env.MAP_HEALTHCHECK_URL || defaultHealthcheck).trim();

    return {
        mapSourceMode:    VALID_MODES.has(mode) ? mode : 'auto',
        tileProxyMode:    proxyMode ? 'web' : 'off',
        localTileUrl,
        fallbackTileUrl:  (process.env.FALLBACK_TILE_URL || '').trim(),
        fallbackEnabled:  (process.env.MAP_FALLBACK_ENABLED || '1') !== '0',
        healthcheckUrl,
        tileDatasetName:  dataset,
        offlineMapDataDirConfigured: isMapDataDirConfigured()
    };
}

function isMapDataDirConfigured() {
    const dir = (process.env.OFFLINE_MAP_DATA_DIR || '/app/offline_map_data').trim();
    try { return fs.existsSync(dir); } catch { return false; }
}

/**
 * HTTP handler for GET /api/offline/map-config
 * Returns false if the request does not match this route.
 */
function handleOfflineMapConfigApi(req, res) {
    if (req.method !== 'GET') return false;
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/api/offline/map-config') return false;

    const config = getMapConfig();
    res.writeHead(200, {
        'Content-Type':  'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify(config));
    return true;
}

module.exports = { getMapConfig, handleOfflineMapConfigApi };
