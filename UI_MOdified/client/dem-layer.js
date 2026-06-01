/**
 * DEM overlay layer — Libya elevation (hillshade + colormap).
 * Served from /api/dem/tile/{z}/{x}/{y}.png by the Express server.
 *
 * Usage:
 *   DemLayer.toggle()             toggle overlay on/off
 *   DemLayer.setOpacity(0–1)      adjust transparency
 *   DemLayer.queryElevation(lon, lat) → Promise<{elevation_m, inCoverage}>
 */
(function () {
    'use strict';

    let _layer   = null;
    let _visible = false;
    let _opacity = 0.6;
    let _meta    = null;

    function getLayer() {
        if (!_layer) {
            _layer = window.L.tileLayer('/api/dem/tile/{z}/{x}/{y}.png', {
                tms:         false,
                opacity:     _opacity,
                minZoom:     7,
                maxZoom:     14,
                attribution: 'Libya DEM ×5',
                crossOrigin: false,
            });
        }
        return _layer;
    }

    function show() {
        if (!window.map) return;
        getLayer().addTo(window.map);
        _visible = true;
        _updateBtn(true);
    }

    function hide() {
        if (!window.map || !_layer) return;
        window.map.removeLayer(_layer);
        _visible = false;
        _updateBtn(false);
    }

    function toggle() {
        _visible ? hide() : show();
    }

    function setOpacity(v) {
        _opacity = Math.max(0, Math.min(1, v));
        if (_layer) _layer.setOpacity(_opacity);
    }

    async function queryElevation(lon, lat) {
        const r = await fetch(`/api/dem/elevation?lon=${lon}&lat=${lat}`);
        return r.json();
    }

    async function fetchMeta() {
        if (_meta) return _meta;
        try {
            const r = await fetch('/api/dem/info');
            _meta = await r.json();
        } catch (_) { _meta = null; }
        return _meta;
    }

    // Wire up the elevation tooltip on the 2D Leaflet map:
    // Shift+click → shows elevation at clicked point
    function wireElevationClick() {
        if (!window.map) return;
        window.map.on('click', async (e) => {
            if (!e.originalEvent.shiftKey) return;
            const { lng, lat } = e.latlng;
            const result = await queryElevation(lng, lat);
            if (!result.inCoverage) return;
            window.L.popup()
                .setLatLng(e.latlng)
                .setContent(
                    `<div dir="ltr" style="font-family:monospace;font-size:12px;">` +
                    `<strong>Elevation</strong><br>` +
                    `${result.elevation_m !== null ? Math.round(result.elevation_m) + ' m' : 'No data'}<br>` +
                    `<small>${lat.toFixed(4)}°N ${lng.toFixed(4)}°E</small>` +
                    `</div>`
                )
                .openOn(window.map);
        });
    }

    function _updateBtn(on) {
        const btn = document.getElementById('dem-toggle-btn');
        if (btn) btn.classList.toggle('active', on);
    }

    // Boot: check availability and wire click handler
    window.addEventListener('DOMContentLoaded', () => {
        fetchMeta().then(meta => {
            if (!meta || !meta.available) return;
            wireElevationClick();
            console.log('[dem] Libya DEM available. Shift+click the map for elevation.');
        });
    });

    window.DemLayer = { toggle, show, hide, setOpacity, queryElevation, fetchMeta };
})();
