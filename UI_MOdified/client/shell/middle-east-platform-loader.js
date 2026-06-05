/**
 * middle-east-platform-loader.js — Load Middle East platform catalog
 *
 * Optional enrichment source for world-state-db.js DB-Lite.
 * Loads regional platform definitions from JSON and caches them.
 *
 * DESIGN:
 * - Fallback to DB-Lite if catalog missing or load fails
 * - Authored scenario fields ALWAYS take precedence
 * - Regional platforms enhance (not replace) generic DB-Lite defaults
 *
 * PUBLIC API:
 *   AppMiddleEastPlatformLoader.getCatalog() → { platforms: {...} } or null
 *   AppMiddleEastPlatformLoader.getPlatform(id) → platform object or null
 *   AppMiddleEastPlatformLoader.isLoaded() → boolean
 *   AppMiddleEastPlatformLoader.getLoadError() → error string or null
 */
(function (root) {
    'use strict';

    let catalog = null;
    let loadError = null;
    let isLoaded = false;

    /**
     * Load the Middle East platform catalog from JSON
     * @returns {Promise<object|null>}
     */
    function loadCatalog() {
        return fetch('/data/db/middle-east/platforms.json')
            .then(r => {
                if (!r.ok) {
                    loadError = 'HTTP ' + r.status;
                    return null;
                }
                return r.json();
            })
            .then(data => {
                if (!data || typeof data !== 'object') {
                    loadError = 'Invalid JSON';
                    return null;
                }
                catalog = data;
                isLoaded = true;
                return data;
            })
            .catch(err => {
                loadError = err.message || String(err);
                isLoaded = true;
                return null;
            });
    }

    /**
     * Get the entire catalog
     * @returns {object|null}
     */
    function getCatalog() {
        return catalog;
    }

    /**
     * Get a platform by ID
     * @param {string} platformId
     * @returns {object|null}
     */
    function getPlatform(platformId) {
        if (!catalog || !catalog.platforms) return null;
        return catalog.platforms[platformId] || null;
    }

    /**
     * Check if catalog is loaded
     * @returns {boolean}
     */
    function isLoadedFlag() {
        return isLoaded;
    }

    /**
     * Get load error if any
     * @returns {string|null}
     */
    function getLoadError() {
        return loadError;
    }

    /**
     * Enrich a unit with platform catalog defaults
     * Uses: authored unit fields > ME catalog > DB-Lite fallback
     *
     * @param {object} unit - Unit object (may have readiness, supply, etc.)
     * @param {string} platformId - Platform ID (if known)
     * @param {function} dbLiteFallback - DB-Lite enrichment function
     * @returns {object} Enriched unit (new object, never mutates input)
     */
    function enrichUnitWithPlatform(unit, platformId, dbLiteFallback) {
        if (!unit || typeof unit !== 'object') return unit;

        const platform = platformId ? getPlatform(platformId) : null;
        const enriched = Object.assign({}, unit);

        if (platform) {
            // Apply platform defaults only if not authored
            if (!enriched.readiness && platform.readiness_default) {
                enriched.readiness = platform.readiness_default;
            }
            if (typeof enriched.supply !== 'number' && typeof platform.supply_default === 'number') {
                enriched.supply = platform.supply_default;
            }
            if (!enriched.rcs_class && platform.rcs_class) {
                enriched.rcs_class = platform.rcs_class;
            }
            // Could add more fields here: sensors, weapons, magazine capacity, etc.
        }

        // DB-Lite fallback for any remaining missing fields
        if (typeof dbLiteFallback === 'function') {
            return dbLiteFallback(enriched);
        }

        return enriched;
    }

    // ── Wiring ─────────────────────────────────────────────────────
    // Attempt to load catalog on module load (async, non-blocking)
    try {
        loadCatalog();
    } catch (_) { /* Never throw on load */ }

    // Export public API
    root.AppMiddleEastPlatformLoader = {
        getCatalog,
        getPlatform,
        isLoaded: isLoadedFlag,
        getLoadError,
        enrichUnitWithPlatform,
        loadCatalog,
    };
})(window);
