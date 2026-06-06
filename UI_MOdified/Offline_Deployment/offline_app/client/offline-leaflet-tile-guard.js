/**
 * offline-leaflet-tile-guard.js — Global Leaflet tile-source enforcer
 *
 * OFFLINE_APP ONLY — not in the main app.
 * OFFLINE-RUNTIME-FIX-4: Prevents any Leaflet tile layer from calling
 * public internet tile servers (OSM, Mapbox, etc.) or localhost:8080 from
 * a remote browser. Replaces those URLs with the resolved offline tile URL.
 *
 * Load order: AFTER ../lib/leaflet.js, BEFORE app.js and any module
 * that creates a tileLayer.
 *
 * Intercepted URL patterns:
 *   - openstreetmap.org  (all subdomains)
 *   - tile.openstreetmap.org
 *   - a/b/c.tile.openstreetmap.org
 *   - mapbox.com
 *   - localhost:8080/services/...  (internal tile server — not reachable
 *                                   from a remote browser)
 *
 * The guard reads the resolved tile URL from:
 *   window.__RMOOZ_OFFLINE_MAP__.activeTileUrl  (set by offline-map-source.js)
 * If not yet available, polls every 200 ms until it is or times out (10 s).
 */
(function () {
    'use strict';

    var MAX_WAIT_MS = 10000;

    /** Returns true if the URL should be replaced with the offline tile URL. */
    function isBannedUrl(url) {
        if (!url || typeof url !== 'string') return false;
        var u = url.toLowerCase();
        return (
            u.includes('openstreetmap.org')  ||
            u.includes('openstreetmap.org')  ||
            u.includes('tile.openstreetmap') ||
            u.includes('mapbox.com')         ||
            // Intercept localhost:8080 tile service — accessible from same machine
            // only; browsers on another machine get ERR_CONNECTION_REFUSED.
            // After the guard runs, the correct public IP URL will be used instead.
            (u.includes('localhost:8080')    && u.includes('/services/'))
        );
    }

    /** Wait up to maxMs for a condition to be truthy, polling every 200 ms. */
    function waitFor(condition, maxMs, cb) {
        var elapsed = 0;
        var iv = setInterval(function () {
            elapsed += 200;
            var val = condition();
            if (val) { clearInterval(iv); cb(val); }
            else if (elapsed >= maxMs) { clearInterval(iv); cb(null); }
        }, 200);
    }

    /** Patch L.TileLayer so every instance created with a banned URL gets replaced. */
    function installGuard(L, offlineUrl) {
        if (!L || !L.TileLayer || L._offlineGuardInstalled) return;
        L._offlineGuardInstalled = true;

        var OrigTileLayer = L.TileLayer;

        // Override the TileLayer factory method used by L.tileLayer(url, opts)
        var origFactory = L.tileLayer;
        L.tileLayer = function (url, options) {
            if (isBannedUrl(url)) {
                console.info('[offline-guard] Blocked:', url.slice(0, 80), '→ offline');
                url = offlineUrl;
            }
            return origFactory.call(this, url, options);
        };

        // Also patch the class constructor so new L.TileLayer() is guarded
        L.TileLayer = OrigTileLayer.extend({
            initialize: function (url, options) {
                if (isBannedUrl(url)) {
                    console.info('[offline-guard] Blocked (class):', url.slice(0, 80));
                    url = offlineUrl;
                }
                OrigTileLayer.prototype.initialize.call(this, url, options);
            }
        });

        console.info('[offline-guard] Installed. Offline tile URL:', offlineUrl.slice(0, 80));
    }

    /** Replace the URL on any already-existing tile layers on a Leaflet map. */
    function patchExistingLayers(map, offlineUrl) {
        if (!map || !map.eachLayer) return;
        map.eachLayer(function (layer) {
            if (layer._url && isBannedUrl(layer._url)) {
                var wasActive = map.hasLayer(layer);
                map.removeLayer(layer);
                var replacement = window.L.tileLayer(offlineUrl, {
                    maxZoom:      layer.options.maxZoom      || 17,
                    minZoom:      layer.options.minZoom      || 0,
                    attribution:  'Offline Tiles',
                    errorTileUrl: layer.options.errorTileUrl || ''
                });
                if (wasActive) replacement.addTo(map);
                console.info('[offline-guard] Replaced existing layer:', layer._url.slice(0, 60));
            }
        });
    }

    function run() {
        // Step 1: Wait for Leaflet to be available
        waitFor(function () { return window.L; }, MAX_WAIT_MS, function (L) {
            if (!L) { console.warn('[offline-guard] Leaflet not available — guard not installed'); return; }

            // Step 2: Wait for offline map source to resolve
            waitFor(
                function () {
                    var om = window.__RMOOZ_OFFLINE_MAP__;
                    return om && om.activeTileUrl ? om.activeTileUrl : null;
                },
                MAX_WAIT_MS,
                function (offlineUrl) {
                    if (!offlineUrl) {
                        console.warn('[offline-guard] No offline tile URL — guard not installed');
                        return;
                    }
                    // Install the factory/class guard for future tile layers
                    installGuard(L, offlineUrl);

                    // Patch any tile layers already on the main map
                    if (window.map) patchExistingLayers(window.map, offlineUrl);

                    // Listen for the main map being created later
                    var mapCheckInterval = setInterval(function () {
                        if (window.map && !window._offlineGuardMainMapPatched) {
                            window._offlineGuardMainMapPatched = true;
                            patchExistingLayers(window.map, offlineUrl);
                        }
                    }, 500);
                    // Stop polling after 30 s
                    setTimeout(function () { clearInterval(mapCheckInterval); }, 30000);
                }
            );
        });
    }

    // Run after DOM is ready so Leaflet has had time to load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }

    // Export for use by other offline scripts
    window.OfflineLeafletGuard = {
        isBannedUrl: isBannedUrl,
        patchExistingLayers: patchExistingLayers
    };
})();
