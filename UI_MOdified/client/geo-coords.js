/**
 * FILE: geo-coords.js
 *
 * Single chokepoint for the [lat, lng] <-> [lng, lat] flip between Leaflet
 * (which speaks lat/lng) and GeoJSON / RFC 7946 (which speaks lng/lat).
 *
 * Rule: every coordinate that lives inside a GeoJSON Feature (including
 * properties.app.*) goes through this module. [lat, lng] arrays are only
 * allowed in Leaflet-facing code paths.
 *
 * Bridge name: window.AppGeoCoords
 */
(function () {
    'use strict';

    // Leaflet LatLng or {lat,lng} -> GeoJSON [lng, lat]
    function latLngToGeoCoord(ll) {
        if (!ll) return null;
        if (typeof ll.lat === 'number' && typeof ll.lng === 'number') return [ll.lng, ll.lat];
        return null;
    }

    // GeoJSON [lng, lat] -> Leaflet LatLng
    function geoCoordToLatLng(coord) {
        if (!coord || coord.length < 2) return null;
        const lng = Number(coord[0]);
        const lat = Number(coord[1]);
        if (!isFinite(lat) || !isFinite(lng)) return null;
        return L.latLng(lat, lng);
    }

    // Legacy [lat, lng] array -> GeoJSON [lng, lat] (used by the v2->v3 migrator)
    function latLngArrToGeoCoord(arr) {
        if (!arr || arr.length < 2) return null;
        return [arr[1], arr[0]];
    }

    // GeoJSON [lng, lat] -> legacy [lat, lng] array (symmetric)
    function geoCoordToLatLngArr(coord) {
        if (!coord || coord.length < 2) return null;
        return [coord[1], coord[0]];
    }

    // Convert a ring of Leaflet LatLngs to GeoJSON coordinates, auto-closing the ring
    // (GeoJSON Polygon rings require first == last).
    function ringLatLngsToGeoCoords(ring) {
        if (!Array.isArray(ring)) return [];
        const out = ring.map(latLngToGeoCoord).filter(Boolean);
        if (out.length >= 3) {
            const first = out[0];
            const last = out[out.length - 1];
            if (first[0] !== last[0] || first[1] !== last[1]) out.push([first[0], first[1]]);
        }
        return out;
    }

    // Convert a GeoJSON Polygon ring back to Leaflet LatLngs, dropping the closing duplicate.
    function ringGeoCoordsToLatLngs(ring) {
        if (!Array.isArray(ring)) return [];
        const out = ring.map(geoCoordToLatLng).filter(Boolean);
        if (out.length >= 2) {
            const first = out[0];
            const last = out[out.length - 1];
            if (first.lat === last.lat && first.lng === last.lng) out.pop();
        }
        return out;
    }

    window.AppGeoCoords = {
        latLngToGeoCoord,
        geoCoordToLatLng,
        latLngArrToGeoCoord,
        geoCoordToLatLngArr,
        ringLatLngsToGeoCoords,
        ringGeoCoordsToLatLngs,
    };
})();
