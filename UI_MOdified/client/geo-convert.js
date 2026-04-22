/**
 * FILE: geo-convert.js
 *
 * Parametric-shape approximation (circles, sectors) plus Turf-backed clip
 * operations (intersect / difference). All coordinates are [lng, lat]
 * (GeoJSON) — callers that start in Leaflet latlng space flip via
 * window.AppGeoCoords first.
 *
 * Step count: 64 matches the existing ellipse approximation in app.js
 * (createEllipseRingFromBoundingCorners ... , 64) — same visual fidelity.
 *
 * External GIS tools (QGIS, ArcGIS) see these approximations as proper
 * polygons. The app itself rebuilds exact parametric shapes from
 * properties.app.* on reload and ignores the approximation, so step
 * count is purely an external-rendering concern.
 *
 * Bridge name: window.AppGeoConvert
 */
(function () {
    'use strict';

    const DEFAULT_STEPS = 64;

    function hasTurf() {
        return typeof turf !== 'undefined' && turf && typeof turf.circle === 'function';
    }

    // Approximate a geodesic circle as a closed polygon ring (GeoJSON coords).
    // center: [lng, lat], radiusKm: number, steps: optional
    function circleToPolygon(center, radiusKm, steps) {
        if (!center || !radiusKm) return null;
        const n = steps || DEFAULT_STEPS;
        if (hasTurf()) {
            const feat = turf.circle(center, radiusKm, { steps: n, units: 'kilometers' });
            if (feat && feat.geometry && feat.geometry.coordinates) return feat.geometry.coordinates[0];
        }
        return fallbackCircleRing(center, radiusKm, n);
    }

    // Sector from bearing - aperture/2 to bearing + aperture/2 (degrees, clockwise from north).
    function sectorToPolygon(center, radiusKm, bearingDeg, apertureDeg, steps) {
        if (!center || !radiusKm) return null;
        const n = steps || DEFAULT_STEPS;
        const b1 = (bearingDeg || 0) - (apertureDeg || 0) / 2;
        const b2 = (bearingDeg || 0) + (apertureDeg || 0) / 2;
        if (hasTurf() && typeof turf.sector === 'function') {
            const feat = turf.sector(center, radiusKm, b1, b2, { steps: n, units: 'kilometers' });
            if (feat && feat.geometry && feat.geometry.coordinates) return feat.geometry.coordinates[0];
        }
        return fallbackSectorRing(center, radiusKm, b1, b2, n);
    }

    // Regular N-sided polygon inscribed in a circle of radiusKm, first vertex at rotationDeg.
    function regularPolygonToPolygon(center, radiusKm, sides, rotationDeg) {
        if (!center || !radiusKm || !sides || sides < 3) return null;
        const pts = [];
        const step = 360 / sides;
        for (let i = 0; i < sides; i++) {
            const bearing = (rotationDeg || 0) + i * step;
            pts.push(pointAtBearingGeoCoord(center, radiusKm, bearing));
        }
        pts.push([pts[0][0], pts[0][1]]); // close ring
        return pts;
    }

    // Fallback circle approximation without Turf: geodesic points every 360/steps degrees.
    function fallbackCircleRing(center, radiusKm, steps) {
        const pts = [];
        for (let i = 0; i < steps; i++) {
            pts.push(pointAtBearingGeoCoord(center, radiusKm, (360 * i) / steps));
        }
        pts.push([pts[0][0], pts[0][1]]);
        return pts;
    }

    function fallbackSectorRing(center, radiusKm, startBearing, endBearing, steps) {
        const pts = [[center[0], center[1]]];
        const span = endBearing - startBearing;
        for (let i = 0; i <= steps; i++) {
            const b = startBearing + (span * i) / steps;
            pts.push(pointAtBearingGeoCoord(center, radiusKm, b));
        }
        pts.push([center[0], center[1]]); // close back to center
        return pts;
    }

    // Great-circle destination point from [lng,lat] center, given bearing (deg) and distance (km).
    function pointAtBearingGeoCoord(center, radiusKm, bearingDeg) {
        const R = 6371.0088;
        const br = (bearingDeg * Math.PI) / 180;
        const lat1 = (center[1] * Math.PI) / 180;
        const lng1 = (center[0] * Math.PI) / 180;
        const d = radiusKm / R;
        const lat2 = Math.asin(
            Math.sin(lat1) * Math.cos(d) +
            Math.cos(lat1) * Math.sin(d) * Math.cos(br)
        );
        const lng2 = lng1 + Math.atan2(
            Math.sin(br) * Math.sin(d) * Math.cos(lat1),
            Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
        );
        return [(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI];
    }

    // ------------------------------------------------------------------
    // Clipping (Turf-backed)
    // ------------------------------------------------------------------

    // Both args: GeoJSON Polygon or MultiPolygon Feature (or plain geometry).
    // Returns a Feature (Polygon/MultiPolygon) or null if the clip is empty.
    function intersect(a, b) {
        if (!hasTurf() || typeof turf.intersect !== 'function') return null;
        const fa = toPolygonFeature(a);
        const fb = toPolygonFeature(b);
        if (!fa || !fb) return null;
        try {
            const fc = turf.featureCollection([fa, fb]);
            return turf.intersect(fc);
        } catch { return null; }
    }

    function difference(a, b) {
        if (!hasTurf() || typeof turf.difference !== 'function') return null;
        const fa = toPolygonFeature(a);
        const fb = toPolygonFeature(b);
        if (!fa || !fb) return null;
        try {
            const fc = turf.featureCollection([fa, fb]);
            return turf.difference(fc);
        } catch { return null; }
    }

    function toPolygonFeature(x) {
        if (!x) return null;
        if (x.type === 'Feature') {
            if (x.geometry && (x.geometry.type === 'Polygon' || x.geometry.type === 'MultiPolygon')) return x;
            return null;
        }
        if (x.type === 'Polygon' || x.type === 'MultiPolygon') {
            return { type: 'Feature', geometry: x, properties: {} };
        }
        return null;
    }

    window.AppGeoConvert = {
        circleToPolygon,
        sectorToPolygon,
        regularPolygonToPolygon,
        intersect,
        difference,
        toPolygonFeature,
    };
})();
