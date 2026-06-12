/**
 * Operational shell — cursor coordinate + bearing/range readout.
 *
 * PR-1 (Operational Shell Foundation). Footer status-bar elements:
 *   #coord-cursor          → "MGRS 38R PG 12345 67890  ·  34.2341°N 47.1234°E"
 *                            (MGRS falls back gracefully if lib is absent)
 *   #coord-bearing-range   → "287° / 6.43 km"     (from last anchor click)
 *                            or the localized "click map to set anchor"
 *                            hint until the operator left-clicks the map.
 *
 * Anchor behaviour: a single left-click on the map records the latlng
 * as the anchor without consuming the event. This means the anchor is
 * also set when the operator places a symbol, draws a point, etc.,
 * which is the desired behaviour — bearing/range typically wants to
 * read from "the last thing I placed".
 *
 * Map handshake: window.map is created in app.js after Leaflet boots.
 * We poll briefly (250 ms × 40 = 10 s) for it; if it never appears,
 * the readout simply stays at '---' and silently gives up.
 *
 * MGRS: uses window.mgrs (lib/mgrs.min.js, already in the page).
 * Falls back to DD-only if the lib failed to load.
 *
 * Bridge name: window.AppShellCoordReadout
 */
(function () {
    'use strict';

    const EARTH_R_KM = 6371.0088;

    let anchor = null;   // { lat, lng } | null
    let bound = false;

    // Throttle DOM writes — Leaflet emits mousemove ~60×/s on drag.
    // Display only needs ~15 fps for human reading.
    const THROTTLE_MS = 60;
    let lastWriteTs = 0;
    let pendingLatLng = null;
    let scheduled = false;

    function fmtLat(lat) {
        const hemi = lat >= 0 ? 'N' : 'S';
        return `${Math.abs(lat).toFixed(4)}°${hemi}`;
    }
    function fmtLng(lng) {
        const hemi = lng >= 0 ? 'E' : 'W';
        return `${Math.abs(lng).toFixed(4)}°${hemi}`;
    }
    // Hardening: every defensive bail-out below ends with `return null` so
    // fmtCoord falls back to DD-only display. Failure modes covered:
    //   - mgrs lib missing or no forward()
    //   - latlng polar / outside MGRS valid range (lib throws)
    //   - lib returns something we can't pretty-print
    function fmtMgrs(latlng) {
        if (!latlng || !Number.isFinite(latlng.lat) || !Number.isFinite(latlng.lng)) return null;
        try {
            if (!window.mgrs || typeof window.mgrs.forward !== 'function') return null;
            const s = window.mgrs.forward([latlng.lng, latlng.lat], 5);
            if (typeof s !== 'string' || s.length < 7) return null;
            // Pretty-print "38RPG1234567890" → "38R PG 12345 67890"
            const m = s.match(/^(\d{1,2}[A-Z])([A-Z]{2})(\d+)$/);
            if (m) {
                const half = m[3].length / 2;
                return `${m[1]} ${m[2]} ${m[3].slice(0, half)} ${m[3].slice(half)}`;
            }
            return s;
        } catch (_) {
            return null;
        }
    }
    function fmtCoord(latlng) {
        const dd = `${fmtLat(latlng.lat)} ${fmtLng(latlng.lng)}`;
        const mgrs = fmtMgrs(latlng);
        return mgrs ? `MGRS ${mgrs}  ·  ${dd}` : dd;
    }

    // Great-circle initial bearing (true north, degrees) from a to b.
    function bearingDeg(a, b) {
        const φ1 = a.lat * Math.PI / 180;
        const φ2 = b.lat * Math.PI / 180;
        const Δλ = (b.lng - a.lng) * Math.PI / 180;
        const y = Math.sin(Δλ) * Math.cos(φ2);
        const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
        const θ = Math.atan2(y, x);
        return (θ * 180 / Math.PI + 360) % 360;
    }

    // Great-circle distance (km, haversine).
    function distanceKm(a, b) {
        const φ1 = a.lat * Math.PI / 180;
        const φ2 = b.lat * Math.PI / 180;
        const Δφ = (b.lat - a.lat) * Math.PI / 180;
        const Δλ = (b.lng - a.lng) * Math.PI / 180;
        const s = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
        return EARTH_R_KM * c;
    }

    function anchorHintText() {
        if (typeof window.t === 'function') {
            const t = window.t('coord-anchor-hint');
            if (typeof t === 'string' && t && t !== 'coord-anchor-hint') return t;
        }
        return 'click map to set anchor';
    }

    function writeReadout(latlng) {
        const cursorEl = document.getElementById('coord-cursor');
        const brEl     = document.getElementById('coord-bearing-range');
        if (cursorEl) cursorEl.textContent = fmtCoord(latlng);
        if (brEl) {
            if (anchor) {
                const brg = bearingDeg(anchor, latlng);
                const rng = distanceKm(anchor, latlng);
                brEl.textContent = `${Math.round(brg).toString().padStart(3, '0')}° / ${rng.toFixed(2)} km`;
            } else {
                brEl.textContent = anchorHintText();
            }
        }
    }

    function scheduleWrite() {
        if (scheduled) return;
        const now = Date.now();
        const wait = Math.max(0, THROTTLE_MS - (now - lastWriteTs));
        scheduled = true;
        setTimeout(() => {
            scheduled = false;
            lastWriteTs = Date.now();
            if (pendingLatLng) writeReadout(pendingLatLng);
        }, wait);
    }

    // Hardening: validate event payloads before mutating state. Leaflet
    // normally fires well-formed events, but a malformed plugin event or
    // a programmatic fire() with the wrong payload should be ignored
    // rather than show "NaN°N NaN°E" in the readout.
    function isValidLatLng(ll) {
        return !!ll
            && typeof ll.lat === 'number' && typeof ll.lng === 'number'
            && Number.isFinite(ll.lat) && Number.isFinite(ll.lng);
    }

    function onMove(e) {
        if (!e || !isValidLatLng(e.latlng)) return;
        pendingLatLng = e.latlng;
        scheduleWrite();
    }

    function onClick(e) {
        // Record the anchor but DO NOT stopPropagation — existing tool
        // handlers (place symbol, draw, etc.) must still receive the click.
        if (!e || !isValidLatLng(e.latlng)) return;
        anchor = { lat: e.latlng.lat, lng: e.latlng.lng };
        // Update immediately on click so the operator sees the anchor
        // hint flip to "000° / 0.00 km" without waiting for next move.
        writeReadout(e.latlng);
    }

    function bind(map) {
        if (bound) return;
        if (!map || typeof map.on !== 'function') return;
        try {
            map.on('mousemove', onMove);
            map.on('click',     onClick);
            bound = true;
        } catch (_) {
            // If listener registration fails (extremely unlikely with
            // Leaflet, but possible with a stubbed map in tests) we leave
            // bound=false so a future init() retry can rebind.
            return;
        }
        // The map area may have just resized because the footer + bars
        // took 72 px of new chrome. Re-invalidate so Leaflet recomputes
        // its visible rect.
        try { map.invalidateSize(); } catch (_) { /* ignore */ }
    }

    // Hardening: refresh the anchor-hint text when the language changes
    // (otherwise the hint stays in the boot language even after the
    // operator toggles AR/EN). Follows the codebase's window.onLanguageChange
    // chain convention.
    function bindLanguageChanges() {
        const prev = window.onLanguageChange;
        window.onLanguageChange = function (lang) {
            try {
                // Only re-render the hint if no anchor is set — once the
                // operator clicked, the B/R text shows numbers and doesn't
                // need translating.
                if (!anchor) {
                    const brEl = document.getElementById('coord-bearing-range');
                    if (brEl) brEl.textContent = anchorHintText();
                }
            } catch (_) { /* never throw inside the chain */ }
            if (typeof prev === 'function') {
                try { prev(lang); } catch (_) { /* don't break other listeners */ }
            }
        };
    }

    function init() {
        // Hide the B/R hint until we either set an anchor or move the cursor.
        const brEl = document.getElementById('coord-bearing-range');
        if (brEl) brEl.textContent = anchorHintText();

        bindLanguageChanges();

        // Poll for window.map — created in app.js after L.map() runs.
        let tries = 0;
        const MAX_TRIES = 40;
        const t = setInterval(() => {
            tries++;
            if (window.map && typeof window.map.on === 'function') {
                clearInterval(t);
                bind(window.map);
            } else if (tries >= MAX_TRIES) {
                clearInterval(t);
                // Map never came online; readout stays blank. Not an
                // error worth surfacing — happens during landing-auth.
            }
        }, 250);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    window.AppShellCoordReadout = {
        getAnchor: () => anchor ? { ...anchor } : null,
        setAnchor: (latlng) => { if (latlng) anchor = { lat: latlng.lat, lng: latlng.lng }; },
        clearAnchor: () => { anchor = null; writeReadout({ lat: 0, lng: 0 }); },
        bearingDeg,
        distanceKm,
    };
})();
