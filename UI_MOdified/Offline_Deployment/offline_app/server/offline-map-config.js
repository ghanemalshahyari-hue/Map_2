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

    // ── Derive browser-reachable tile URL ────────────────────────────────────
    // TILE_PUBLIC_BASE_URL takes priority — it is the public IP:port that
    // browsers can reach even when running on a remote server.
    // Without it, localTileUrl defaults to the explicit LOCAL_TILE_URL env var.
    const tilePublicBase = (process.env.TILE_PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
    let localTileUrl;

    if (tilePublicBase) {
        // Build from TILE_PUBLIC_BASE_URL + tileset name
        const dataset = (process.env.RMOOZ_TILE_DATASET_NAME || DEFAULT_DATASET).trim();
        localTileUrl = `${tilePublicBase}/services/${encodeURIComponent(dataset)}/{z}/{x}/{y}.png`;
    } else {
        // Fall back to explicit LOCAL_TILE_URL (may be localhost — only works when
        // the browser is on the same machine as the Docker host)
        localTileUrl = (process.env.LOCAL_TILE_URL ||
            `http://localhost:8080/services/${DEFAULT_DATASET}/{z}/{x}/{y}.png`).trim();
    }

    // ── Health-check URL ──────────────────────────────────────────────────────
    // MAP_HEALTHCHECK_URL lets the operator specify a known-good tile URL to
    // probe. If not set, the client probes z=7/x=79/y=53 of the tileset.
    const dataset = (process.env.RMOOZ_TILE_DATASET_NAME || DEFAULT_DATASET).trim();
    const tileBase = tilePublicBase || 'http://localhost:8080';
    const defaultHealthcheck = `${tileBase}/services/${encodeURIComponent(dataset)}/7/79/53.png`;
    const healthcheckUrl = (process.env.MAP_HEALTHCHECK_URL || defaultHealthcheck).trim();

    return {
        mapSourceMode:    VALID_MODES.has(mode) ? mode : 'auto',
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
