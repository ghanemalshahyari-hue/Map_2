/**
 * offline-map-source.js — Offline map tile source resolver
 *
 * OFFLINE-IMAGE-1 / offline_app only — this file is NOT in the main app.
 *
 * Resolves which tile URL to use in priority order:
 *   1. Local tile package (served from the Docker container)
 *   2. Configured fallback URL (internal network tile server)
 *   3. Clear "unavailable" state (never silently falls back to public internet)
 *
 * Reads config from GET /api/offline/map-config (offline_app backend endpoint).
 * Falls back gracefully if the endpoint is not yet wired up.
 *
 * Exposes window.__RMOOZ_OFFLINE_MAP__ so that app.js / cesium-view.js can
 * read the resolved tile URL instead of their hardcoded defaults.
 *
 * Usage (added to offline_app/client/app.html before app.js):
 *   <script src="wargame/offline-map-source.js"></script>
 *
 * Map source modes (from MAP_SOURCE_MODE env var via /api/offline/map-config):
 *   "local"    — use LOCAL_TILE_URL only; do not try fallback
 *   "fallback" — use FALLBACK_TILE_URL only; skip local check
 *   "auto"     — try local first; fall through to fallback if local is unhealthy
 */
(function () {
    'use strict';

    // ── Defaults (used when config endpoint is unreachable) ───────────────────
    const DEFAULTS = {
        mapSourceMode:           'local',
        localTileUrl:            '/offline-tiles/{z}/{x}/{y}.png',
        fallbackTileUrl:         '',
        fallbackEnabled:         true,
        offlineMapDataDirConfigured: false
    };

    // ── Status codes ──────────────────────────────────────────────────────────
    const STATUS = {
        UNKNOWN:          'unknown',
        LOCAL_OK:         'local_ok',
        LOCAL_MISS:       'local_miss',
        FALLBACK_OK:      'fallback_ok',
        FALLBACK_DISABLED:'fallback_disabled',
        UNAVAILABLE:      'unavailable'
    };

    let _config  = null;
    let _state   = {
        status:        STATUS.UNKNOWN,
        activeTileUrl: null,
        message:       'Map source not yet resolved'
    };

    // ── Config fetch ──────────────────────────────────────────────────────────

    async function fetchMapConfig() {
        try {
            const r = await fetch('/api/offline/map-config', { credentials: 'include' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const cfg = await r.json();
            return {
                mapSourceMode:           cfg.mapSourceMode           || DEFAULTS.mapSourceMode,
                localTileUrl:            cfg.localTileUrl            || DEFAULTS.localTileUrl,
                fallbackTileUrl:         cfg.fallbackTileUrl         || DEFAULTS.fallbackTileUrl,
                fallbackEnabled:         cfg.fallbackEnabled !== false,
                offlineMapDataDirConfigured: !!cfg.offlineMapDataDirConfigured
            };
        } catch (_) {
            // Endpoint not yet wired (OFFLINE-IMAGE-1 pending) — use defaults
            console.info('[offline-map] /api/offline/map-config not available — using defaults');
            return { ...DEFAULTS };
        }
    }

    // ── Tile source health checks ─────────────────────────────────────────────

    async function checkLocalTileHealth(localUrl) {
        // Probe a known tile coordinate to see if local tiles are served.
        // z=0, x=0, y=0 is the world-overview tile — a small sanity check.
        const probeUrl = localUrl
            .replace('{z}', '0')
            .replace('{x}', '0')
            .replace('{y}', '0');
        try {
            const r = await fetch(probeUrl, { method: 'HEAD', credentials: 'omit' });
            return r.ok;                          // 200 = local tiles present
        } catch (_) {
            return false;
        }
    }

    async function checkFallbackHealth(cfg) {
        if (!cfg.fallbackEnabled || !cfg.fallbackTileUrl) return false;
        // Probe a tile from the fallback source
        const probeUrl = cfg.fallbackTileUrl
            .replace('{z}', '0')
            .replace('{x}', '0')
            .replace('{y}', '0');
        try {
            const r = await fetch(probeUrl, { method: 'HEAD', credentials: 'omit' });
            return r.ok;
        } catch (_) {
            return false;
        }
    }

    // ── Source resolver ───────────────────────────────────────────────────────

    async function resolveOfflineTileSource() {
        _config = await fetchMapConfig();
        const mode = _config.mapSourceMode;

        // ── local-only mode ───────────────────────────────────────────────────
        if (mode === 'local') {
            const ok = await checkLocalTileHealth(_config.localTileUrl);
            if (ok) {
                _state = { status: STATUS.LOCAL_OK, activeTileUrl: _config.localTileUrl,
                           message: 'Local tiles active' };
            } else {
                _state = { status: STATUS.UNAVAILABLE, activeTileUrl: null,
                           message: 'Local tile source not available and fallback is disabled (MAP_SOURCE_MODE=local)' };
            }
            return _state;
        }

        // ── fallback-only mode ────────────────────────────────────────────────
        if (mode === 'fallback') {
            if (!_config.fallbackEnabled || !_config.fallbackTileUrl) {
                _state = { status: STATUS.FALLBACK_DISABLED, activeTileUrl: null,
                           message: 'Fallback tile source is not configured or disabled' };
            } else {
                const ok = await checkFallbackHealth(_config);
                _state = ok
                    ? { status: STATUS.FALLBACK_OK, activeTileUrl: _config.fallbackTileUrl,
                        message: 'Fallback tile source active' }
                    : { status: STATUS.UNAVAILABLE, activeTileUrl: null,
                        message: 'Fallback tile source is configured but not reachable' };
            }
            return _state;
        }

        // ── auto mode (default) ───────────────────────────────────────────────
        // Try local first; fall through to fallback; if neither works → unavailable.
        const localOk = await checkLocalTileHealth(_config.localTileUrl);
        if (localOk) {
            _state = { status: STATUS.LOCAL_OK, activeTileUrl: _config.localTileUrl,
                       message: 'Local tiles active' };
            return _state;
        }

        if (!_config.fallbackEnabled || !_config.fallbackTileUrl) {
            _state = { status: STATUS.LOCAL_MISS, activeTileUrl: null,
                       message: 'Local tiles unavailable. Fallback tile source is not configured.' };
            return _state;
        }

        const fallbackOk = await checkFallbackHealth(_config);
        if (fallbackOk) {
            _state = { status: STATUS.FALLBACK_OK, activeTileUrl: _config.fallbackTileUrl,
                       message: 'Local tiles unavailable. Using configured fallback tile source.' };
        } else {
            _state = { status: STATUS.UNAVAILABLE, activeTileUrl: null,
                       message: 'Local tiles unavailable. Fallback tile source is configured but not reachable.' };
        }
        return _state;
    }

    // ── UI status banner ──────────────────────────────────────────────────────

    function showMapSourceStatus(state) {
        const bar = document.getElementById('offline-map-status-bar');
        if (!bar) return;

        bar.style.display = 'block';
        bar.className = 'offline-map-status-bar offline-map-status--' + state.status;

        const icons = {
            [STATUS.LOCAL_OK]:          '🗺️',
            [STATUS.FALLBACK_OK]:       '🌐',
            [STATUS.LOCAL_MISS]:        '⚠️',
            [STATUS.FALLBACK_DISABLED]: '⚠️',
            [STATUS.UNAVAILABLE]:       '🔴',
            [STATUS.UNKNOWN]:           '⏳'
        };
        bar.textContent = (icons[state.status] || '?') + ' ' + state.message;

        // Auto-hide the banner for successful states after a short delay
        if (state.status === STATUS.LOCAL_OK || state.status === STATUS.FALLBACK_OK) {
            setTimeout(() => { bar.style.display = 'none'; }, 5000);
        }
    }

    // ── Public API ────────────────────────────────────────────────────────────

    function getActiveTileUrl() {
        return _state.activeTileUrl;
    }

    function checkTileSourceHealth() {
        return resolveOfflineTileSource();
    }

    // ── Main entry point ──────────────────────────────────────────────────────

    async function init() {
        const state = await resolveOfflineTileSource();
        showMapSourceStatus(state);

        // Expose resolved config globally so app.js can read it when it initialises
        window.__RMOOZ_OFFLINE_MAP__ = {
            config:        _config,
            state:         state,
            activeTileUrl: state.activeTileUrl,
            STATUS
        };
    }

    // Initialise as soon as DOM is ready (before app.js tile layer setup)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose module functions for external use (e.g. Cesium view)
    window.OfflineMapSource = {
        resolveOfflineTileSource,
        checkTileSourceHealth,
        getActiveTileUrl,
        showMapSourceStatus,
        STATUS
    };

})();
