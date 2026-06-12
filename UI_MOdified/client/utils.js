/**
 * FILE: utils.js
 *
 * A grab-bag of trustworthy math and string helpers that do not care whether Leaflet exists: distances,
 * bearings, unit conversion, map-scale arithmetic, SIDC parsing, and a few keyboard/template utilities.
 * If you need something testable in isolation, it probably belongs here rather than in app.js. Load order
 * matters only because graphics.js reuses one Bézier helper for CATK curves; otherwise this file is a
 * shallow dependency-free layer.
 *
 * Core responsibilities:
 *   - Geo: haversine, perimeter, bearing, km/nm, scale denominator at zoom, DMS parts
 *   - SIDC: normalise input, extract from text, get/set status digit helpers
 *   - General: deep clone via JSON, hotkey target checks, layer template date/stats, catkCubicBezierScalar
 *
 * Dependencies:
 *   - None at runtime beyond standard JavaScript (no L, no document in the core helpers)
 *   - Assigned to window.AppUtils for use by app.js, popups.js, graphics.js, and other modules
 *
 * Bridge name: window.AppUtils
 */
(function () {
    'use strict';

    // --- Constants ---

    /** 1 international nautical mile = 1.852 km */
    const KM_PER_NAUTICAL_MILE = 1.852;

    // --- Geo & Distance Math ---

    /** Haversine distance between two WGS-84 coordinates. Returns metres. */
    function haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /** Sum haversine across an array of {lat, lng} points. Returns km (2 d.p.). */
    function totalDistanceKm(points) {
        if (!points || points.length < 2) return 0;
        let totalM = 0;
        for (let i = 0; i < points.length - 1; i++) {
            totalM += haversineDistance(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
        }
        return parseFloat((totalM / 1000).toFixed(2));
    }

    /** Perimeter of a closed polygon ring in km (wraps last point back to first). */
    function closedRingPerimeterKm(pts) {
        if (!pts || pts.length < 3) return 0;
        let sum = 0;
        const n = pts.length;
        for (let i = 0; i < n; i++) {
            const a = pts[i];
            const b = pts[(i + 1) % n];
            if (!a || !b) continue;
            sum += haversineDistance(a.lat, a.lng, b.lat, b.lng);
        }
        return sum / 1000;
    }

    /** Forward azimuth (0–360°) from point A to point B. Pure trig — no Leaflet. */
    function bearingDegrees(from, to) {
        const φ1 = from.lat * Math.PI / 180;
        const φ2 = to.lat * Math.PI / 180;
        const dL = (to.lng - from.lng) * Math.PI / 180;
        const y = Math.sin(dL) * Math.cos(φ2);
        const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dL);
        let θ = Math.atan2(y, x) * 180 / Math.PI;
        return (θ + 360) % 360;
    }

    /** Clamp any bearing value into the [0, 360) range. */
    function normalizeBearingDeg(deg) {
        let x = deg % 360;
        if (x < 0) x += 360;
        return x;
    }

    /**
     * Normalise a rotation delta in radians to the (−π, +π] range.
     * Used by the selection-area rotate handle to avoid jumps at ±π.
     */
    function normalizeAngleDeltaRad(rad) {
        let x = rad;
        while (x > Math.PI) x -= Math.PI * 2;
        while (x < -Math.PI) x += Math.PI * 2;
        return x;
    }

    /** Convert kilometres to nautical miles. Returns NaN for non-finite input. */
    function kmToNauticalMiles(km) {
        const k = Number(km);
        if (!isFinite(k)) return NaN;
        return k / KM_PER_NAUTICAL_MILE;
    }

    /** Convert nautical miles to kilometres. Returns NaN for non-finite input. */
    function nauticalMilesToKm(nm) {
        const n = Number(nm);
        if (!isFinite(n)) return NaN;
        return n * KM_PER_NAUTICAL_MILE;
    }

    /**
     * Map scale denominator (e.g. 50000 for "1:50 000") at a given Leaflet zoom level
     * and latitude. Matches the on-map scale readout logic — no live map object needed.
     */
    function getMapScaleDenominatorAtZoom(zoom, latDeg) {
        const lat = (latDeg ?? 0) * Math.PI / 180;
        const metersPerPixel = 156543.03392 * Math.cos(lat) / Math.pow(2, zoom);
        return Math.max(1, Math.round(metersPerPixel * 96 / 0.0254));
    }

    // --- Coordinate Formatting ---

    /** Convert decimal degrees to { deg, min, sec, hem }. Pure arithmetic. */
    function decimalToDmsParts(value, isLat) {
        const abs = Math.abs(Number(value) || 0);
        const deg = Math.floor(abs);
        const minFloat = (abs - deg) * 60;
        const min = Math.floor(minFloat);
        const secRaw = (minFloat - min) * 60;
        const sec = Math.round(secRaw * 10) / 10;
        const hem = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W');
        return { deg, min, sec, hem };
    }

    // --- SIDC & String Helpers ---

    /** Strip all non-digit characters and return the trailing 20 digits, or '' if too short. */
    function normalizeSidcInput(value) {
        const digitsOnly = String(value || '').replace(/\D+/g, '');
        if (digitsOnly.length < 20) return '';
        return digitsOnly.slice(-20);
    }

    /** Regex-extract a 20-digit SIDC from a freeform string. Returns '' if not found. */
    function extractSidcFromText(text) {
        if (!text) return '';
        const m =
            text.match(/SIDC[\s:]*([0-9][0-9-\s]{18,40})/i) ||
            text.match(/[0-9][0-9-\s]{18,40}/);
        if (!m) return '';
        return normalizeSidcInput(m[1] || m[0]);
    }

    /** Read the status digit (character index 6) from a SIDC string. */
    function getSidcStatus(sidc) {
        const s = String(sidc || '');
        return s.length > 6 ? s[6] : '0';
    }

    /** Return a new SIDC string with character 6 replaced by statusDigit. */
    function setSidcStatus(sidc, statusDigit) {
        const s = String(sidc || '10031000001200000000');
        if (s.length < 7) return sidc;
        return s.slice(0, 6) + String(statusDigit) + s.slice(7);
    }

    /** Trim whitespace and enforce a 120-character maximum on a display name string. */
    function trimmedDisplayNameFrom(v) {
        if (v == null) return '';
        const s = String(v).trim();
        return s.length > 120 ? s.slice(0, 120) : s;
    }

    // --- Hotkey Helpers ---

    /**
     * Returns true if the DOM target element should receive map keyboard shortcuts.
     * Blocks shortcuts when focus is inside inputs, textareas, or modal/popup content.
     */
    function mapHotkeyTargetAllowsShortcut(target) {
        const tag = target && target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target && target.isContentEditable)) return false;
        if (target && typeof target.closest === 'function' && (target.closest('.leaflet-popup-content') || target.closest('#sidc-picker') || target.closest('.modal'))) return false;
        return true;
    }

    /**
     * Cross-keyboard-layout letter key check.
     * Matches by e.code (physical key) AND e.key (printed character) so QWERTY shortcuts
     * work correctly on AZERTY, Dvorak, and other layouts.
     */
    function physicalLetterKey(e, codeName, latinLower) {
        return e.code === codeName || e.key === latinLower || e.key === latinLower.toUpperCase();
    }

    // --- Layer Template Helpers ---

    /** Format a timestamp for display in layer template UI (locale-aware, no deps). */
    function formatLayerTemplateDate(ts) {
        const d = new Date(ts);
        if (!isFinite(d.getTime())) return '';
        try {
            return d.toLocaleString();
        } catch (_) {
            return '';
        }
    }

    /** Count layers and total elements in a layer template payload object. */
    function getLayerTemplateStats(payload) {
        const layersCount = Array.isArray(payload?.layers) ? payload.layers.length : 0;
        const elementsCount = (payload?.layers || []).reduce((acc, l) => acc + (Array.isArray(l?.elements) ? l.elements.length : 0), 0);
        return { layersCount, elementsCount };
    }

    // --- General Pure Utilities ---

    /** JSON round-trip deep clone. Safe for plain serialisable objects. */
    function deepCloneJsonSafe(v) {
        return JSON.parse(JSON.stringify(v));
    }

    /**
     * Cubic Bézier scalar interpolation at parameter t (0–1).
     * Referenced directly by graphics.js / catkSampleCatmullRomSpine via window.AppUtils.
     */
    function catkCubicBezierScalar(a, b, c, d, t) {
        const mt = 1 - t;
        return mt * mt * mt * a + 3 * mt * mt * t * b + 3 * mt * t * t * c + t * t * t * d;
    }

    // --- Export ---

    window.AppUtils = {
        KM_PER_NAUTICAL_MILE,
        haversineDistance,
        totalDistanceKm,
        closedRingPerimeterKm,
        bearingDegrees,
        normalizeBearingDeg,
        normalizeAngleDeltaRad,
        kmToNauticalMiles,
        nauticalMilesToKm,
        getMapScaleDenominatorAtZoom,
        decimalToDmsParts,
        normalizeSidcInput,
        extractSidcFromText,
        getSidcStatus,
        setSidcStatus,
        trimmedDisplayNameFrom,
        mapHotkeyTargetAllowsShortcut,
        physicalLetterKey,
        formatLayerTemplateDate,
        getLayerTemplateStats,
        deepCloneJsonSafe,
        catkCubicBezierScalar,
    };
})();
