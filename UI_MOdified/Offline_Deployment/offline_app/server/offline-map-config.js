/**
 * offline-map-config.js — Backend handler for GET /api/offline/map-config
 *
 * OFFLINE-IMAGE-1 / offline_app only — NOT in the main app.
 *
 * Reads map source configuration from environment variables and returns a
 * safe public config object. Never exposes LDAP settings, credentials,
 * or any server-internal paths.
 *
 * Wiring (required in OFFLINE-IMAGE-1):
 *   In Offline_Deployment/offline_app/server/web-server.js (when created),
 *   add before the static-file fallback:
 *
 *     const offlineMapConfig = require('./offline-map-config');
 *     // In the request handler:
 *     if (offlineMapConfig.handleOfflineMapConfigApi(req, res)) return;
 *
 *   OR: wire it inside offline_app/server/app-data.js as handleOfflineApi()
 *   (see the export at the bottom of this file).
 *
 * Response shape (GET /api/offline/map-config):
 *   {
 *     mapSourceMode:           "auto" | "local" | "fallback",
 *     localTileUrl:            "/offline-tiles/{z}/{x}/{y}.png",
 *     fallbackTileUrl:         "<operator-configured>",
 *     fallbackEnabled:         true | false,
 *     offlineMapDataDirConfigured: true | false
 *   }
 *
 * Environment variables read (all optional — safe defaults provided):
 *   MAP_SOURCE_MODE         auto | local | fallback (default: auto)
 *   LOCAL_TILE_URL          internal tile URL path (default: /offline-tiles/{z}/{x}/{y}.png)
 *   FALLBACK_TILE_URL       operator-provided fallback URL (default: empty)
 *   MAP_HEALTHCHECK_URL     optional external health URL (default: empty)
 *   MAP_FALLBACK_ENABLED    1 | 0 (default: 1)
 *   OFFLINE_MAP_DATA_DIR    path to local tile data (default: /app/offline_map_data)
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const VALID_MODES = new Set(['auto', 'local', 'fallback']);

function getMapConfig() {
    const mode = (process.env.MAP_SOURCE_MODE || 'auto').toLowerCase().trim();

    return {
        mapSourceMode:    VALID_MODES.has(mode) ? mode : 'auto',
        localTileUrl:     (process.env.LOCAL_TILE_URL || '/offline-tiles/{z}/{x}/{y}.png').trim(),
        fallbackTileUrl:  (process.env.FALLBACK_TILE_URL || '').trim(),
        fallbackEnabled:  (process.env.MAP_FALLBACK_ENABLED || '1') !== '0',
        offlineMapDataDirConfigured: isMapDataDirConfigured()
        // healthcheckUrl is intentionally NOT returned — it may be an internal URL
        // that the client should not call directly; health checks happen server-side
    };
}

function isMapDataDirConfigured() {
    const dir = (process.env.OFFLINE_MAP_DATA_DIR || '/app/offline_map_data').trim();
    try {
        return fs.existsSync(dir);
    } catch {
        return false;
    }
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
        'Cache-Control': 'no-store'           // always fresh — operator may change env
    });
    res.end(JSON.stringify(config));
    return true;
}

module.exports = { getMapConfig, handleOfflineMapConfigApi };
