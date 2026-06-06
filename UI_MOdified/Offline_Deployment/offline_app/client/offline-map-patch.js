/**
 * offline-map-patch.js — Offline tile layer hot-swap
 *
 * OFFLINE_APP ONLY — this file is NOT in the main app.
 *
 * Runs after app.js has initialised the Leaflet map and (if present) the
 * Cesium 3D viewer. Reads the URL resolved by offline-map-source.js
 * (window.__RMOOZ_OFFLINE_MAP__.activeTileUrl) and replaces the hardcoded
 * OSM tile layer with the operator-configured offline source.
 *
 * Priority order (same as offline-map-source.js resolver):
 *   1. Local tile package  → served from /offline-tiles/{z}/{x}/{y}.png
 *   2. Fallback URL        → FALLBACK_TILE_URL in .env.offline
 *   3. No patch            → original OSM layers stay (app functions, no tiles)
 *
 * No internet calls. No credentials. Falls back silently if resolver is not ready.
 */
(function () {
    'use strict';

    const MAX_WAIT_MS  = 10000;  // wait up to 10 s for the resolver
    const POLL_INTERVAL = 150;   // check every 150 ms

    // ── Utility: wait for a condition ────────────────────────────────────────
    function waitFor(condition, maxMs) {
        return new Promise(resolve => {
            const deadline = Date.now() + maxMs;
            const interval = setInterval(() => {
                const val = condition();
                if (val !== null && val !== undefined) {
                    clearInterval(interval);
                    resolve(val);
                } else if (Date.now() > deadline) {
                    clearInterval(interval);
                    resolve(null);
                }
            }, POLL_INTERVAL);
        });
    }

    // ── Patch Leaflet 2D map ──────────────────────────────────────────────────
    function patch2DMap(tileUrl, attribution) {
        const map = window.map;
        if (!map || typeof map.eachLayer !== 'function') return;

        // Find the OSM layer (the one with openstreetmap in its URL or known class)
        let osmLayer = null;
        map.eachLayer(layer => {
            if (layer._url && (
                layer._url.includes('openstreetmap.org') ||
                layer._url.includes('{s}.tile')
            )) {
                osmLayer = layer;
            }
        });

        if (osmLayer) {
            // Remove the OSM layer and add the offline one in its place
            const wasActive = map.hasLayer(osmLayer);
            map.removeLayer(osmLayer);

            const offlineLayer = L.tileLayer(tileUrl, {
                maxZoom:     17,
                attribution: attribution || 'Offline Tiles',
                errorTileUrl: osmLayer.options && osmLayer.options.errorTileUrl
                    ? osmLayer.options.errorTileUrl
                    : ''
            });

            if (wasActive) offlineLayer.addTo(map);

            console.info('[offline-map-patch] 2D tile layer replaced →', tileUrl);
        } else {
            // OSM wasn't active — just add the offline layer as default base
            L.tileLayer(tileUrl, {
                maxZoom:     17,
                attribution: attribution || 'Offline Tiles'
            }).addTo(map);
            console.info('[offline-map-patch] 2D offline layer added →', tileUrl);
        }
    }

    // ── Patch Cesium 3D viewer ────────────────────────────────────────────────
    function patch3DViewer(tileUrl, attribution) {
        // Cesium viewer is opened lazily by cesium-view.js; poll for it.
        const viewer = window.__cesiumViewer ||
            (window.AppMapEngine && window.AppMapEngine.getCesiumViewer
                ? window.AppMapEngine.getCesiumViewer()
                : null);

        if (!viewer) return; // 3D not open — will be patched when opened

        try {
            // Remove all existing imagery layers
            viewer.imageryLayers.removeAll();

            // Add the offline tile source
            viewer.imageryLayers.addImageryProvider(
                new Cesium.UrlTemplateImageryProvider({
                    url:          tileUrl,
                    credit:       attribution || 'Offline Tiles',
                    minimumLevel: 0,
                    maximumLevel: 19
                })
            );

            // Re-apply the dark tint that cesium-view.js normally sets
            const base = viewer.imageryLayers.get(0);
            if (base) {
                base.brightness = 0.6;
                base.saturation = 0.5;
                base.hue        = 0.02;
            }

            console.info('[offline-map-patch] Cesium imagery replaced →', tileUrl);
        } catch (e) {
            console.warn('[offline-map-patch] Could not patch Cesium imagery:', e.message);
        }
    }

    // ── Main entry point ──────────────────────────────────────────────────────
    async function run() {
        // 1. Wait for the offline resolver to complete
        const offlineMap = await waitFor(
            () => window.__RMOOZ_OFFLINE_MAP__ || null,
            MAX_WAIT_MS
        );

        if (!offlineMap) {
            console.info('[offline-map-patch] Offline resolver not ready — no patch applied');
            return;
        }

        const tileUrl     = offlineMap.activeTileUrl;
        const status      = offlineMap.state && offlineMap.state.status;
        const attribution = tileUrl && tileUrl.includes('offline-tiles')
            ? 'Local Offline Tiles'
            : 'Offline Tile Server';

        if (!tileUrl) {
            // Resolver completed but no tile source available
            console.info('[offline-map-patch] No offline tile URL resolved (status:', status, ')');
            // Show a status bar if the element exists
            const bar = document.getElementById('offline-map-status-bar');
            if (bar) {
                bar.style.display = 'block';
                bar.textContent   = '🔴 Map tiles unavailable — configure FALLBACK_TILE_URL in .env.offline';
            }
            return;
        }

        // 2. Wait for the Leaflet map to be initialised (window.map is set in app.js)
        const map = await waitFor(() => window.map || null, 8000);
        if (map) patch2DMap(tileUrl, attribution);

        // 3. Patch Cesium if the 3D viewer is already open
        patch3DViewer(tileUrl, attribution);

        // 4. Also patch Cesium when it opens later (event-driven)
        // cesium-view.js fires 'cesium:ready' on window when the viewer is created
        window.addEventListener('cesium:ready', () => {
            patch3DViewer(tileUrl, attribution);
        }, { once: false });
    }

    // Run after DOMContentLoaded so app.js has started loading modules
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();
