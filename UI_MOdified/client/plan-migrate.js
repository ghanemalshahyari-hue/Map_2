/**
 * FILE: plan-migrate.js
 *
 * Pure, dependency-free transform from v2 plan format to v3 extended GeoJSON.
 * Shared between the Node server (app-data.js GET handler auto-migrates old
 * files on read) and the browser (io.js importLayersData pipes v2 inputs
 * through here before the normal v3 load path).
 *
 * v2 shape: { version: 2, folders, layers: [{ id, name, visible, active, elements: [...] }] }
 * v3 shape: valid FeatureCollection with foreign members __layers/__folders and
 *           every element's parametric/tactical detail preserved in properties.app.
 *
 * Coordinate flip: v2 stores [lat, lng] everywhere. v3 stores [lng, lat]
 * inside the Feature (geometry + properties.app coordinate fields).
 *
 * Geometry approximation: this migrator produces *placeholder* geometries
 * sufficient for GeoJSON validity. The client's geo-convert.js replaces
 * placeholders with proper 64-step polygon approximations on the first
 * dirty save after load, because Turf.js is not a server dependency.
 *
 * Dual export: browser sets window.AppPlanMigrate; Node picks up module.exports.
 */
(function (global) {
    'use strict';

    // Flip a legacy [lat, lng] to GeoJSON [lng, lat]. Returns null for invalid input.
    function flip(arr) {
        if (!arr || arr.length < 2) return null;
        const lat = Number(arr[0]);
        const lng = Number(arr[1]);
        if (!isFinite(lat) || !isFinite(lng)) return null;
        return [lng, lat];
    }

    function flipRing(ring) {
        if (!Array.isArray(ring)) return [];
        const out = [];
        for (const p of ring) {
            const c = flip(p);
            if (c) out.push(c);
        }
        // Close ring for Polygon geometry
        if (out.length >= 3) {
            const first = out[0];
            const last = out[out.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) out.push([first[0], first[1]]);
        }
        return out;
    }

    // Shallow-clone the v2 element and swap its coordinate fields to GeoJSON order.
    // Fields that are coordinate pairs get flipped; coordinate arrays get mapped.
    function elementToAppProps(el) {
        const app = { ...el };
        // Rename v2 `type` to v3 `kind` so app code can use the same dispatcher.
        app.kind = el.type;
        delete app.type;

        // Per-field coordinate flips for every v2 element type.
        if (el.latlng) app.latlng = flip(el.latlng);
        if (el.latlng1) app.latlng1 = flip(el.latlng1);
        if (el.latlng2) app.latlng2 = flip(el.latlng2);
        if (el.center) app.center = flip(el.center);
        if (Array.isArray(el.latlngs)) app.latlngs = el.latlngs.map(flip).filter(Boolean);
        if (Array.isArray(el.points)) app.points = el.points.map(flip).filter(Boolean);
        if (Array.isArray(el.corners)) app.corners = el.corners.map(flip).filter(Boolean);
        if (Array.isArray(el.rings)) {
            app.rings = el.rings.map(r => Array.isArray(r) ? r.map(flip).filter(Boolean) : []);
        }
        // Nested arrow params have a tip that is a coordinate pair.
        if (el.arrowParams && el.arrowParams.tip) {
            app.arrowParams = { ...el.arrowParams, tip: flip(el.arrowParams.tip) };
        }
        if (el.lockedArrowParams && el.lockedArrowParams.tip) {
            app.lockedArrowParams = { ...el.lockedArrowParams, tip: flip(el.lockedArrowParams.tip) };
        }
        // rangeCircles/rangeSectors are nested adornments on symbol elements; they
        // carry no coordinate fields of their own (center is the parent symbol),
        // so shallow-clone is fine.
        if (Array.isArray(el.rangeCircles)) app.rangeCircles = el.rangeCircles.map(c => ({ ...c }));
        if (Array.isArray(el.rangeSectors)) app.rangeSectors = el.rangeSectors.map(s => ({ ...s }));
        return app;
    }

    // Build a placeholder GeoJSON geometry for a v2 element. Good enough for
    // RFC 7946 validity; the client replaces it with proper geometry on save.
    function buildPlaceholderGeometry(el) {
        switch (el.type) {
            case 'text':
            case 'symbol': {
                const c = flip(el.latlng);
                return c ? { type: 'Point', coordinates: c } : null;
            }
            case 'tmg-single': {
                const a = flip(el.latlng1);
                const b = flip(el.latlng2);
                if (!a || !b) return null;
                return { type: 'LineString', coordinates: [a, b] };
            }
            case 'tmg-group':
            case 'geo-distance':
            case 'geo-freehand': {
                const coords = (el.points || []).map(flip).filter(Boolean);
                if (coords.length < 2) return null;
                return { type: 'LineString', coordinates: coords };
            }
            case 'polyline': {
                const coords = (el.latlngs || []).map(flip).filter(Boolean);
                if (coords.length < 2) return null;
                return { type: 'LineString', coordinates: coords };
            }
            case 'polygon': {
                const rings = (el.rings || []).map(flipRing).filter(r => r.length >= 4);
                if (rings.length === 0) return null;
                return { type: 'Polygon', coordinates: rings };
            }
            case 'geo-rectangle':
            case 'geo-oval':
            case 'geo-minefield': {
                const ring = flipRing(el.corners || []);
                return ring.length >= 4 ? { type: 'Polygon', coordinates: [ring] } : null;
            }
            case 'geo-freeform': {
                const ring = flipRing(el.points || []);
                return ring.length >= 4 ? { type: 'Polygon', coordinates: [ring] } : null;
            }
            case 'geo-range-circle':
            case 'geo-range-sector':
            case 'geo-circle-2pt':
            case 'geo-semi-circle':
            case 'geo-polygon': {
                // Parametric shapes: placeholder is the center point. The client
                // will rewrite with a proper 64-step polygon on first save.
                const c = flip(el.center);
                return c ? { type: 'Point', coordinates: c } : null;
            }
            default:
                return null;
        }
    }

    function elementToFeature(el, layerId) {
        const geometry = buildPlaceholderGeometry(el);
        if (!geometry) return null;
        const props = { layerId, app: elementToAppProps(el) };
        if (el.displayName) props.displayName = el.displayName;
        return { type: 'Feature', geometry, properties: props };
    }

    // v2 -> v3 transform. Returns a new object; does not mutate input.
    function migrateV2PlanToV3(v2) {
        if (!v2 || v2.version !== 2 || !Array.isArray(v2.layers)) {
            throw new Error('Input is not a v2 plan');
        }
        const __layers = [];
        const features = [];
        for (const layer of v2.layers) {
            const layerId = layer.id || ('layer-' + (__layers.length + 1));
            __layers.push({
                id: layerId,
                name: layer.name || 'Layer',
                visible: layer.visible !== false,
                active: !!layer.active,
            });
            for (const el of (layer.elements || [])) {
                const feat = elementToFeature(el, layerId);
                if (feat) features.push(feat);
            }
        }
        const __folders = Array.isArray(v2.folders) ? v2.folders.map(f => ({
            id: f.id,
            name: f.name,
            layerIds: Array.isArray(f.layerIds) ? [...f.layerIds] : [],
            collapsed: !!f.collapsed,
        })) : [];

        return {
            type: 'FeatureCollection',
            app: { version: 3, appName: 'tactical-map' },
            __layers,
            __folders,
            features,
        };
    }

    function isV3FeatureCollection(parsed) {
        return !!(parsed
            && parsed.type === 'FeatureCollection'
            && parsed.app && parsed.app.version === 3
            && Array.isArray(parsed.features)
            && Array.isArray(parsed.__layers));
    }

    function isV2Plan(parsed) {
        return !!(parsed && parsed.version === 2 && Array.isArray(parsed.layers));
    }

    const api = { migrateV2PlanToV3, isV3FeatureCollection, isV2Plan };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    } else {
        global.AppPlanMigrate = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
