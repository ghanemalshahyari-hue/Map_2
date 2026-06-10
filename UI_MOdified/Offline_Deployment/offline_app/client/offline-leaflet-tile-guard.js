/**
 * offline-leaflet-tile-guard.js — Global Leaflet tile-source enforcer
 *
 * OFFLINE_APP ONLY — not in the main app.
 * OFFLINE-RUNTIME-FIX-4 / OFFLINE-MAP-GUARD-SYNC-1:
 *
 *   Prevents any Leaflet tile layer from calling public internet tile servers
 *   (OSM, Mapbox, etc.) or internal-only URLs (localhost:8080) from a remote
 *   browser. Replaces banned URLs with the resolved offline tile URL.
 *
 * SYNC INSTALL (OFFLINE-MAP-GUARD-SYNC-1):
 *   Previous version waited for an async fetch before patching L.tileLayer,
 *   so app.js could fire a few OSM requests at startup before the guard
 *   activated. This version installs the factory/class override SYNCHRONOUSLY
 *   as soon as Leaflet is available — using a placeholder URL initially, then
 *   repointing all layers once the real offline URL resolves.
 *
 * Load order: AFTER ../lib/leaflet.js, BEFORE app.js and any module
 * that creates a tileLayer.
 *
 * Intercepted URL patterns:
 *   - openstreetmap.org  (all subdomains)
 *   - mapbox.com
 *   - localhost:8080/services/...  (internal tile server — not reachable
 *                                   from a remote browser)
 *   - tiles/{z}/{x}/{y}.png and /tiles/{z}/{x}/{y}.png  (relative/absolute
 *     paths that resolve against the web-server port instead of the
 *     tile-server port — app.js creates this as its local-directory fallback;
 *     in the Docker deployment it must be replaced with the real offline tile
 *     URL from /api/offline/map-config)
 */
(function () {
    'use strict';

    var PLACEHOLDER_TILE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
    var MAX_WAIT_MS = 10000;

    /** Returns true if the URL should be replaced with the offline tile URL. */
    function isBannedUrl(url) {
        if (!url || typeof url !== 'string') return false;
        var u = url.toLowerCase();
        return (
            u.includes('openstreetmap.org')  ||
            u.includes('tile.openstreetmap') ||
            u.includes('mapbox.com')         ||
            // Intercept localhost:8080 tile service — accessible from same machine
            // only; browsers on another machine get ERR_CONNECTION_REFUSED.
            (u.includes('localhost:8080') && u.includes('/services/')) ||
            // Intercept relative and absolute /tiles/ template URLs (e.g. app.js
            // creates L.tileLayer('tiles/{z}/{x}/{y}.png') as a local-dir fallback).
            // These resolve against the web-server port and return 404 in Docker.
            ((u.includes('/tiles/') || u.startsWith('tiles/')) && u.includes('{z}'))
        );
    }

    // Shared reference — updated once the real URL resolves.
    var _offlineUrl = PLACEHOLDER_TILE;

    /** Patch L.TileLayer synchronously so every future L.tileLayer() call
     *  with a banned URL gets replaced immediately — no async wait. */
    function installGuardSync(L) {
        if (!L || !L.TileLayer || L._offlineGuardInstalled) return;
        L._offlineGuardInstalled = true;

        var OrigTileLayer = L.TileLayer;
        var origFactory   = L.tileLayer;

        L.tileLayer = function (url, options) {
            if (isBannedUrl(url)) {
                console.info('[offline-guard] Blocked (sync):', url.slice(0, 80), '→ offline');
                url = _offlineUrl;
            }
            return origFactory.call(this, url, options);
        };

        // Also patch the class constructor so `new L.TileLayer()` is guarded.
        L.TileLayer = OrigTileLayer.extend({
            initialize: function (url, options) {
                if (isBannedUrl(url)) {
                    console.info('[offline-guard] Blocked (class):', url.slice(0, 80));
                    url = _offlineUrl;
                }
                OrigTileLayer.prototype.initialize.call(this, url, options);
            }
        });

        console.info('[offline-guard] Installed synchronously (placeholder until real URL resolves).');
    }

    /** Replace the URL on any already-existing tile layers on a Leaflet map.
     *
     *  Catches two classes of layers:
     *   1. Layers whose _url still contains a banned pattern (e.g. if the guard
     *      was not yet installed when the layer was created).
     *   2. Layers whose _url was already set to PLACEHOLDER_TILE by the
     *      synchronous guard interception — those need to be repointed to the
     *      real offline URL once it resolves.
     *
     *  Uses setUrl() in preference to remove+add so that the original JS layer
     *  reference is preserved — app.js's removeFallbackBases() can still find
     *  and remove the layer by reference after the URL has been updated.
     */
    function patchExistingLayers(map, offlineUrl) {
        if (!map || !map.eachLayer) return;
        map.eachLayer(function (layer) {
            var u = layer._url || '';
            if (!isBannedUrl(u) && u !== PLACEHOLDER_TILE) return;
            if (typeof layer.setUrl === 'function') {
                layer.setUrl(offlineUrl);
                console.info('[offline-guard] Repointed layer:', u.slice(0, 60), '→ offline');
            } else {
                var wasActive = map.hasLayer(layer);
                map.removeLayer(layer);
                var replacement = window.L.tileLayer(offlineUrl, {
                    maxZoom:      layer.options.maxZoom      || 17,
                    minZoom:      layer.options.minZoom      || 0,
                    attribution:  'Offline Tiles',
                    errorTileUrl: layer.options.errorTileUrl || ''
                });
                if (wasActive) replacement.addTo(map);
                console.info('[offline-guard] Replaced layer:', u.slice(0, 60));
            }
        });
    }

    /** Once the real offline URL resolves, update the shared reference and
     *  repoint any layers that were created with the placeholder. */
    function repointToRealUrl(offlineUrl) {
        _offlineUrl = offlineUrl;
        console.info('[offline-guard] Real offline URL set:', offlineUrl.slice(0, 80));
        // Repoint the map immediately if it exists.
        if (window.map) patchExistingLayers(window.map, offlineUrl);
        // Also watch for the map appearing later.
        var mapCheckInterval = setInterval(function () {
            if (window.map && !window._offlineGuardMainMapPatched) {
                window._offlineGuardMainMapPatched = true;
                patchExistingLayers(window.map, offlineUrl);
            }
        }, 500);
        setTimeout(function () { clearInterval(mapCheckInterval); }, 30000);
    }

    /** Wait up to maxMs for a condition to be truthy, polling every 100 ms. */
    function waitFor(condition, maxMs, cb) {
        var elapsed = 0;
        var iv = setInterval(function () {
            elapsed += 100;
            var val = condition();
            if (val) { clearInterval(iv); cb(val); }
            else if (elapsed >= maxMs) { clearInterval(iv); cb(null); }
        }, 100);
    }

    function run() {
        var L = window.L;

        // ── Phase 1: Install guard synchronously if Leaflet is already loaded. ──
        // The script tag is placed AFTER leaflet.js so L should be available now.
        if (L) {
            installGuardSync(L);
        } else {
            // Fallback: Leaflet not yet loaded — wait (should not normally happen
            // since our script tag comes after leaflet.js in app.html).
            waitFor(function () { return window.L; }, MAX_WAIT_MS, function (LLate) {
                if (!LLate) { console.warn('[offline-guard] Leaflet not available — guard not installed'); return; }
                installGuardSync(LLate);
                resolveRealUrl();
            });
            return;
        }

        resolveRealUrl();
    }

    function resolveRealUrl() {
        // ── Phase 2: Resolve the real offline tile URL asynchronously. ──────────
        // Guard is ALREADY active with the placeholder; these layers will be
        // repointed to the real URL once it resolves.
        waitFor(
            function () {
                var om = window.__RMOOZ_OFFLINE_MAP__;
                return om && om.activeTileUrl ? om.activeTileUrl : null;
            },
            MAX_WAIT_MS,
            function (offlineUrl) {
                if (!offlineUrl) {
                    // Fallback: fetch directly from the server API.
                    fetch('/api/offline/map-config', { credentials: 'same-origin' })
                        .then(function (r) { return r.json(); })
                        .then(function (cfg) {
                            var url = cfg && (cfg.localTileUrl || cfg.tileUrl);
                            if (url) { repointToRealUrl(url); }
                            else { console.warn('[offline-guard] No offline tile URL in map-config — using placeholder'); }
                        })
                        .catch(function (e) {
                            console.warn('[offline-guard] Could not fetch map-config:', e.message || e);
                        });
                    return;
                }
                repointToRealUrl(offlineUrl);
            }
        );
    }

    // Install immediately — the script tag is at DOMContentLoaded-safe position
    // (after Leaflet, before app.js) so we run synchronously.
    run();

    // Export for use by other offline scripts and tests.
    window.OfflineLeafletGuard = {
        isBannedUrl:          isBannedUrl,
        patchExistingLayers:  patchExistingLayers,
        repointToRealUrl:     repointToRealUrl,
        getOfflineUrl:        function () { return _offlineUrl; },
    };
})();
