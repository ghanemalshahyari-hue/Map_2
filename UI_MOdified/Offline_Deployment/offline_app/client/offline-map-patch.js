/**
 * offline-map-patch.js — Offline tile layer hot-swap (post-load patcher)
 *
 * OFFLINE_APP ONLY — not in the main app.
 * OFFLINE-RUNTIME-FIX-4: Expanded to also patch:
 *   - localhost:8080 tile layers (not reachable from remote browser)
 *   - Scenario import wizard objective map (#wg-wz-obj-map)
 *   - All Leaflet maps found in the DOM (not just window.map)
 *
 * Runs at end of <body>. Works together with offline-leaflet-tile-guard.js
 * (which patches future tile layer CREATIONS) — this script patches layers
 * that were already created before the guard could intercept them.
 */
(function () {
    'use strict';

    var MAX_WAIT_MS  = 12000;
    var POLL_INTERVAL = 300;

    /** URL patterns that must be replaced with the offline tile URL. */
    function isBannedUrl(url) {
        if (!url || typeof url !== 'string') return false;
        var u = url.toLowerCase();
        return (
            u.includes('openstreetmap.org')  ||
            u.includes('tile.openstreetmap') ||
            u.includes('mapbox.com')         ||
            (u.includes('localhost:8080') && u.includes('/services/'))
        );
    }

    function waitFor(condition, maxMs) {
        return new Promise(function (resolve) {
            var elapsed = 0;
            var iv = setInterval(function () {
                elapsed += POLL_INTERVAL;
                var val = condition();
                if (val !== null && val !== undefined) { clearInterval(iv); resolve(val); }
                else if (elapsed >= maxMs) { clearInterval(iv); resolve(null); }
            }, POLL_INTERVAL);
        });
    }

    // ── Patch a single Leaflet map ────────────────────────────────────────────
    function patchMap(map, tileUrl, label) {
        if (!map || typeof map.eachLayer !== 'function') return;
        map.eachLayer(function (layer) {
            if (layer._url && isBannedUrl(layer._url)) {
                var wasActive = map.hasLayer(layer);
                map.removeLayer(layer);
                var replacement = window.L.tileLayer(tileUrl, {
                    maxZoom:      layer.options.maxZoom      || 17,
                    minZoom:      layer.options.minZoom      || 0,
                    attribution:  'Offline Tiles',
                    errorTileUrl: layer.options.errorTileUrl || ''
                });
                if (wasActive) replacement.addTo(map);
                console.info('[offline-patch] ' + label + ': Replaced', layer._url.slice(0, 60));
            }
        });
    }

    // ── Find all Leaflet maps in the DOM ──────────────────────────────────────
    function findAllLeafletMaps() {
        var maps = [];
        // Main map
        if (window.map) maps.push({ map: window.map, label: 'main' });
        // Any Leaflet maps stored on DOM elements with class 'leaflet-container'
        var containers = document.querySelectorAll('.leaflet-container');
        for (var i = 0; i < containers.length; i++) {
            var m = containers[i]._leaflet_map;
            if (m && m !== window.map) {
                maps.push({ map: m, label: 'dom-' + i });
            }
        }
        return maps;
    }

    // ── Patch Cesium 3D viewer ────────────────────────────────────────────────
    function patchCesium(tileUrl, attribution) {
        var viewer = window.__cesiumViewer ||
            (window.AppMapEngine && window.AppMapEngine.getCesiumViewer
                ? window.AppMapEngine.getCesiumViewer()
                : null);
        if (!viewer) return false;

        try {
            viewer.imageryLayers.removeAll();
            viewer.imageryLayers.addImageryProvider(
                new window.Cesium.UrlTemplateImageryProvider({
                    url:          tileUrl,
                    credit:       attribution || 'Offline Tiles',
                    minimumLevel: 0,
                    maximumLevel: 19
                })
            );
            var base = viewer.imageryLayers.get(0);
            if (base) { base.brightness = 0.6; base.saturation = 0.5; base.hue = 0.02; }
            console.info('[offline-patch] Cesium imagery replaced');
            return true;
        } catch (e) {
            console.warn('[offline-patch] Cesium patch failed:', e.message);
            return false;
        }
    }

    // ── Main entry point ──────────────────────────────────────────────────────
    async function run() {
        // 1. Wait for offline resolver
        var offlineMap = await waitFor(
            function () { return window.__RMOOZ_OFFLINE_MAP__ || null; },
            MAX_WAIT_MS
        );
        if (!offlineMap) {
            console.info('[offline-patch] Resolver not ready — skipping');
            return;
        }

        var tileUrl = offlineMap.activeTileUrl;
        var status  = offlineMap.state && offlineMap.state.status;

        if (!tileUrl) {
            console.info('[offline-patch] No tile URL resolved (status:', status, ')');
            // Show status bar if element exists
            var bar = document.getElementById('offline-map-status-bar');
            if (bar) {
                bar.style.display = 'block';
                bar.textContent = '🔴 Map tiles unavailable — set FALLBACK_TILE_URL in .env.offline';
            }
            return;
        }

        // 2. Wait for Leaflet + main map
        await waitFor(function () { return window.L && window.map ? true : null; }, 8000);

        // 3. Patch all Leaflet maps found now
        findAllLeafletMaps().forEach(function (entry) {
            patchMap(entry.map, tileUrl, entry.label);
        });

        // 4. Keep polling for late-created maps (e.g. scenario import wizard)
        //    The wizard map (#wg-wz-obj-map) is created when the user opens the
        //    Import panel — it may not exist yet at page load time.
        var pollCount = 0;
        var pollIv = setInterval(function () {
            pollCount++;
            findAllLeafletMaps().forEach(function (entry) {
                patchMap(entry.map, tileUrl, 'late-' + entry.label);
            });
            // Also check for wizard map specifically
            var wizardContainer = document.getElementById('wg-wz-obj-map');
            if (wizardContainer && wizardContainer._leaflet_map) {
                patchMap(wizardContainer._leaflet_map, tileUrl, 'wizard-obj-map');
            }
            if (pollCount >= 60) clearInterval(pollIv); // stop after ~30s
        }, 500);

        // 5. Patch Cesium if open
        patchCesium(tileUrl);

        // 6. Patch Cesium when it opens later
        window.addEventListener('cesium:ready', function () {
            patchCesium(tileUrl);
        }, { once: false });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();
