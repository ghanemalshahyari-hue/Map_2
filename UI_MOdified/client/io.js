/**
 * FILE: io.js
 *
 * Translates between live Leaflet layers and the on-disk plan format
 * (extended GeoJSON, schema v3). The v3 format is a valid RFC 7946
 * FeatureCollection with foreign members (__layers, __folders) and every
 * tactical/parametric detail preserved in each Feature's properties.app.
 *
 * Coordinate-order rule: all coordinates inside a Feature (geometry AND
 * properties.app.* coordinate fields) are [lng, lat] per GeoJSON spec.
 * [lat, lng] only exists in Leaflet-facing code. Every flip goes through
 * window.AppGeoCoords (see geo-coords.js).
 *
 * Back-compat: importLayersData also accepts legacy v2 plans and pipes
 * them through window.AppPlanMigrate before the v3 load path.
 *
 * Geometry vs properties.app: for parametric kinds (circles, sectors,
 * regular polygons, ellipses), geometry is a polygon approximation
 * intended for external GIS tools — the app rebuilds exact shapes from
 * properties.app.* and ignores geometry on reload. For free-shape kinds
 * (polyline, polygon, geo-freeform, geo-freehand, geo-distance) geometry
 * IS the source of truth and properties.app omits redundant coord arrays.
 *
 * Bridge name: window.AppIO
 */
(function () {
    'use strict';

    let _ctx = null;

    // Build an app-shape mirror of the v2 element object, coordinate fields in [lng,lat].
    // The export path wraps this in a Feature. The import path converts back to a
    // legacy elData shape and feeds it to the existing per-kind reconstruction branches
    // so none of the tactical logic has to be rewritten.
    const { latLngToGeoCoord, geoCoordToLatLng, ringLatLngsToGeoCoords, ringGeoCoordsToLatLngs } = window.AppGeoCoords;

    function cornersLatLngsToGeoCoords(ring) {
        if (!Array.isArray(ring)) return [];
        return ring.map(latLngToGeoCoord).filter(Boolean);
    }

    function toAppArrowParams(raw) {
        if (!raw) return null;
        const tipCoord = latLngToGeoCoord(raw.tip);
        if (!tipCoord) return null;
        return {
            tip: tipCoord,
            directionDeg: raw.directionDeg,
            bodyWidthKm: raw.bodyWidthKm,
            headWidthKm: raw.headWidthKm,
            headLengthKm: raw.headLengthKm,
            neckOffsetKm: raw.neckOffsetKm,
            tailLengthKm: raw.tailLengthKm
        };
    }

    function fromAppArrowParams(raw) {
        if (!raw) return null;
        const tip = geoCoordToLatLng(raw.tip);
        if (!tip) return null;
        return {
            tip,
            directionDeg: raw.directionDeg,
            bodyWidthKm: raw.bodyWidthKm,
            headWidthKm: raw.headWidthKm,
            headLengthKm: raw.headLengthKm,
            neckOffsetKm: raw.neckOffsetKm,
            tailLengthKm: raw.tailLengthKm
        };
    }

    // Build a GeoJSON geometry for an element using the approximation helpers
    // in geo-convert.js where parametric, or directly from Leaflet coords for
    // free-shape kinds. Returns null if the element has insufficient data.
    function buildGeometry(el, app) {
        const G = window.AppGeoConvert;
        switch (app.kind) {
            case 'text':
            case 'symbol': {
                const coord = app.latlng;
                return coord ? { type: 'Point', coordinates: coord } : null;
            }
            case 'polyline': {
                const coords = (el.getLatLngs?.() || []).map(latLngToGeoCoord).filter(Boolean);
                if (coords.length < 2) return null;
                return { type: 'LineString', coordinates: coords };
            }
            case 'polygon': {
                const lls = el.getLatLngs?.() || [];
                const rings = (lls.length && Array.isArray(lls[0])) ? lls : [lls];
                const outRings = rings
                    .map(r => ringLatLngsToGeoCoords(r))
                    .filter(r => r.length >= 4);
                if (outRings.length === 0) return null;
                return { type: 'Polygon', coordinates: outRings };
            }
            case 'multipolygon': {
                // Prefer the app-side polygon list (already in [lng,lat] and
                // correctly closed) — falls back to reading Leaflet latlngs for
                // belt-and-braces.
                const polysApp = Array.isArray(app.polygons) ? app.polygons : null;
                if (polysApp && polysApp.length) {
                    const mp = polysApp.map(poly =>
                        (poly || []).map(ring => {
                            if (!Array.isArray(ring) || ring.length < 3) return null;
                            const closed = ring.slice();
                            const f = closed[0], l = closed[closed.length - 1];
                            if (f[0] !== l[0] || f[1] !== l[1]) closed.push([f[0], f[1]]);
                            return closed;
                        }).filter(Boolean)
                    ).filter(p => p.length >= 1);
                    if (mp.length) return { type: 'MultiPolygon', coordinates: mp };
                }
                return null;
            }
            case 'tmg-single': {
                const a = app.latlng1, b = app.latlng2;
                if (!a || !b) return null;
                return { type: 'LineString', coordinates: [a, b] };
            }
            case 'tmg-group':
            case 'geo-distance':
            case 'geo-freehand': {
                const coords = (app.points || []).slice();
                if (coords.length < 2) return null;
                return { type: 'LineString', coordinates: coords };
            }
            case 'geo-range-circle':
            case 'geo-circle-2pt': {
                if (G && typeof G.circleToPolygon === 'function' && app.center && app.radiusKm) {
                    const ring = G.circleToPolygon(app.center, app.radiusKm);
                    if (ring) return { type: 'Polygon', coordinates: [ring] };
                }
                return app.center ? { type: 'Point', coordinates: app.center } : null;
            }
            case 'geo-range-sector': {
                if (G && typeof G.sectorToPolygon === 'function' && app.center && app.radiusKm) {
                    const ring = G.sectorToPolygon(app.center, app.radiusKm, app.bearing || 0, app.aperture || 90);
                    if (ring) return { type: 'Polygon', coordinates: [ring] };
                }
                return app.center ? { type: 'Point', coordinates: app.center } : null;
            }
            case 'geo-semi-circle': {
                if (G && typeof G.sectorToPolygon === 'function' && app.center && app.radiusKm) {
                    const ring = G.sectorToPolygon(app.center, app.radiusKm, app.bearing || 0, 180);
                    if (ring) return { type: 'Polygon', coordinates: [ring] };
                }
                return app.center ? { type: 'Point', coordinates: app.center } : null;
            }
            case 'geo-polygon': {
                if (G && typeof G.regularPolygonToPolygon === 'function' && app.center && app.radiusKm) {
                    const ring = G.regularPolygonToPolygon(app.center, app.radiusKm, app.sides || 6, app.rotation || 0);
                    if (ring) return { type: 'Polygon', coordinates: [ring] };
                }
                return app.center ? { type: 'Point', coordinates: app.center } : null;
            }
            case 'geo-oval': {
                if (G && typeof G.ellipseFromCorners === 'function' && app.corners && app.corners.length >= 4) {
                    const ring = G.ellipseFromCorners(app.corners);
                    if (ring) return { type: 'Polygon', coordinates: [ring] };
                }
                // Fallback: use corners directly as a quadrilateral
                if (app.corners && app.corners.length >= 3) {
                    const closed = app.corners.slice();
                    const first = closed[0], last = closed[closed.length - 1];
                    if (first[0] !== last[0] || first[1] !== last[1]) closed.push(first);
                    return { type: 'Polygon', coordinates: [closed] };
                }
                return null;
            }
            case 'geo-rectangle':
            case 'geo-minefield': {
                if (app.corners && app.corners.length >= 3) {
                    const closed = app.corners.slice();
                    const first = closed[0], last = closed[closed.length - 1];
                    if (first[0] !== last[0] || first[1] !== last[1]) closed.push(first);
                    return { type: 'Polygon', coordinates: [closed] };
                }
                return null;
            }
            case 'geo-freeform': {
                if (app.points && app.points.length >= 3) {
                    const closed = app.points.slice();
                    const first = closed[0], last = closed[closed.length - 1];
                    if (first[0] !== last[0] || first[1] !== last[1]) closed.push(first);
                    return { type: 'Polygon', coordinates: [closed] };
                }
                return null;
            }
            default:
                return null;
        }
    }

    // Extract the v2-style app object for an element (coordinate fields in [lng,lat]).
    // This is the "properties.app" payload for a Feature. It's also the shape the
    // import code expects back on reload (after flipping coords to LatLng).
    function buildAppProps(el) {
        const { TEXT_LABEL_COLOR_DEFAULT, TEXT_LABEL_FONT_SIZE_DEFAULT, DEFAULT_GEO_FILL_STYLE } = _ctx;

        // Unit markers (placed from the ORBAT dock) are owned by the server-side
        // units store (/api/units/tree) — units-map.js rebuilds them on load with
        // their real SIDC. They were also being captured here by the generic
        // L.Marker branch below, which had no access to the unit's SIDC and so
        // wrote them out as a placeholder "frame-only" symbol; on the next load
        // io.js then resurrected those placeholders as separate empty-rectangle
        // markers stacked on top of the real symboled ones. Skip them entirely:
        // exportSingleElement() drops the feature when buildAppProps returns null.
        if (el && el._unitId) return null;

        if (el._isTextLabel) {
            const o = {
                kind: 'text',
                latlng: latLngToGeoCoord(el.getLatLng()),
                text: el._textContent,
                color: el._textColor || TEXT_LABEL_COLOR_DEFAULT,
                fontSize: el._textFontSize ?? TEXT_LABEL_FONT_SIZE_DEFAULT,
            };
            if (el._textRotationDeg) o.rotationDeg = el._textRotationDeg;
            return o;
        }
        if (el._geoType === 'distance' && el._geoData) {
            const d = el._geoData;
            const pts = (d.points || el.getLatLngs?.() || []).map(latLngToGeoCoord).filter(Boolean);
            return {
                kind: 'geo-distance', points: pts, distanceKm: d.distanceKm,
                color: d.color || '#3b82f6', pointLabels: d.pointLabels || []
            };
        }
        if (el._geoType === 'range-circle' && el._geoData) {
            const d = el._geoData;
            return {
                kind: 'geo-range-circle', center: latLngToGeoCoord(d.center),
                radiusKm: d.radiusKm, color: d.color || '#3b82f6',
                fillStyle: d.fillStyle || DEFAULT_GEO_FILL_STYLE
            };
        }
        if (el._geoType === 'range-sector' && el._geoData) {
            const d = el._geoData;
            const wedgesOut = (Array.isArray(d.wedges) && d.wedges.some(w => w && (w.color || (typeof w.label === 'string' && w.label.trim() !== '') || Number.isFinite(w.labelPosition))))
                ? d.wedges.map(w => ({
                    color: (w && w.color) || null,
                    label: (w && typeof w.label === 'string') ? w.label : '',
                    labelPosition: (w && Number.isFinite(w.labelPosition)) ? w.labelPosition : null
                  }))
                : null;
            return {
                kind: 'geo-range-sector', center: latLngToGeoCoord(d.center),
                radiusKm: d.radiusKm, bearing: d.bearing, aperture: d.aperture,
                color: d.color || '#3b82f6', fillStyle: d.fillStyle || DEFAULT_GEO_FILL_STYLE,
                weight: Number.isFinite(d.weight) ? d.weight : null,
                subdivisions: Number.isFinite(d.subdivisions) && d.subdivisions > 1 ? d.subdivisions : null,
                wedges: wedgesOut,
                labelSize: Number.isFinite(d.labelSize) ? d.labelSize : null,
                labelFont: typeof d.labelFont === 'string' && d.labelFont ? d.labelFont : null
            };
        }
        if (el._geoType === 'circle-2pt' && el._geoData) {
            const d = el._geoData;
            return {
                kind: 'geo-circle-2pt', center: latLngToGeoCoord(d.center),
                radiusKm: d.radiusKm, color: d.color || '#3b82f6',
                fillStyle: d.fillStyle || DEFAULT_GEO_FILL_STYLE
            };
        }
        if (el._geoType === 'semi-circle' && el._geoData) {
            const d = el._geoData;
            const wedgesOut = (Array.isArray(d.wedges) && d.wedges.some(w => w && (w.color || (typeof w.label === 'string' && w.label.trim() !== '') || Number.isFinite(w.labelPosition))))
                ? d.wedges.map(w => ({
                    color: (w && w.color) || null,
                    label: (w && typeof w.label === 'string') ? w.label : '',
                    labelPosition: (w && Number.isFinite(w.labelPosition)) ? w.labelPosition : null
                  }))
                : null;
            return {
                kind: 'geo-semi-circle', center: latLngToGeoCoord(d.center),
                radiusKm: d.radiusKm, bearing: d.bearing, color: d.color || '#3b82f6',
                fillStyle: d.fillStyle || DEFAULT_GEO_FILL_STYLE,
                weight: Number.isFinite(d.weight) ? d.weight : null,
                subdivisions: Number.isFinite(d.subdivisions) && d.subdivisions > 1 ? d.subdivisions : null,
                wedges: wedgesOut,
                labelSize: Number.isFinite(d.labelSize) ? d.labelSize : null,
                labelFont: typeof d.labelFont === 'string' && d.labelFont ? d.labelFont : null
            };
        }
        if (el._geoType === 'rectangle' && el._geoData) {
            const d = el._geoData;
            const lls = el.getLatLngs?.();
            const ring = (lls && lls[0]) ? lls[0] : (d.corners || []);
            const corners = ring
                .map(p => p && p.lat !== undefined ? p : (Array.isArray(p) ? L.latLng(p[0], p[1]) : null))
                .map(latLngToGeoCoord).filter(Boolean);
            return {
                kind: 'geo-rectangle', corners, color: d.color || '#3b82f6',
                fillStyle: d.fillStyle || DEFAULT_GEO_FILL_STYLE
            };
        }
        if (el._geoType === 'oval' && el._geoData) {
            const d = el._geoData;
            const ring = d.corners || [];
            const corners = ring
                .map(p => p && p.lat !== undefined ? p : (Array.isArray(p) ? L.latLng(p[0], p[1]) : null))
                .map(latLngToGeoCoord).filter(Boolean);
            return {
                kind: 'geo-oval', corners, color: d.color || '#3b82f6',
                fillStyle: d.fillStyle || DEFAULT_GEO_FILL_STYLE
            };
        }
        if (el._geoType === 'minefield' && el._geoData) {
            const d = el._geoData;
            const lls = el.getLatLngs?.();
            const ring = (lls && lls[0]) ? lls[0] : (d.corners || []);
            const corners = ring
                .map(p => p && p.lat !== undefined ? p : (Array.isArray(p) ? L.latLng(p[0], p[1]) : null))
                .map(latLngToGeoCoord).filter(Boolean);
            return { kind: 'geo-minefield', corners, color: d.color || '#3b82f6', mineType: d.mineType || 'ap' };
        }
        if (el._geoType === 'polygon' && el._geoData) {
            const d = el._geoData;
            return {
                kind: 'geo-polygon', center: latLngToGeoCoord(d.center),
                radiusKm: d.radiusKm, sides: d.sides, rotation: d.rotation,
                color: d.color || '#3b82f6', fillStyle: d.fillStyle || DEFAULT_GEO_FILL_STYLE
            };
        }
        if (el._geoType === 'freeform' && el._geoData) {
            const d = el._geoData;
            const lls = el.getLatLngs?.();
            const ring = (lls && lls[0]) ? lls[0] : (d.points || []);
            const pts = ring
                .map(p => p && p.lat !== undefined ? p : (Array.isArray(p) ? L.latLng(p[0], p[1]) : null))
                .map(latLngToGeoCoord).filter(Boolean);
            return {
                kind: 'geo-freeform', points: pts, color: d.color || '#3b82f6',
                fillStyle: d.fillStyle || DEFAULT_GEO_FILL_STYLE
            };
        }
        if (el._geoType === 'freehand' && el._geoData) {
            const d = el._geoData;
            const pts = (el.getLatLngs?.() || d.points || [])
                .map(p => p && p.lat !== undefined ? p : (Array.isArray(p) ? L.latLng(p[0], p[1]) : null))
                .map(latLngToGeoCoord).filter(Boolean);
            return { kind: 'geo-freehand', points: pts, color: d.color || '#3b82f6' };
        }
        if (el instanceof L.Polygon) {
            const lls = el.getLatLngs?.() || [];
            // Leaflet nesting: depth 1 = simple ring ([LatLng,...]), depth 2 =
            // polygon with holes ([[LatLng,...], ...]), depth 3 = multi-polygon
            // ([[[LatLng,...], ...], ...]). Auto-flank's brigade overlay uses
            // multi-polygon — fail to serialise that and the feature is lost.
            const depth = (lls.length === 0) ? 0
                : (Array.isArray(lls[0]) ? (Array.isArray(lls[0][0]) ? 3 : 2) : 1);
            const style = {
                color: el.options.color || '#3b82f6',
                weight: el._baseLineWeight != null ? el._baseLineWeight : (el.options.weight || 4),
                fillColor: el.options.fillColor || el.options.color || '#3b82f6',
                fillOpacity: el.options.fillOpacity != null ? el.options.fillOpacity : 0.08,
                dashArray: el.options.dashArray || null,
            };
            const extras = {};
            if (el._autoFlankLine || el._autoFlankArea) {
                extras.autoFlank = {
                    area: !!el._autoFlankArea,
                    typeId: el._tmgData?.typeId || null,
                    sessionId: el._tmgData?.sessionId || null,
                    tag: el._tmgData?.tag || null,
                    lengthKm: el._tmgData?.lengthKm || null,
                    parentUnitId: el._tmgData?.parentUnitId || null,
                    areaRole: el._tmgData?.areaRole || null,
                    className: (el.options && el.options.className) || null,
                    stroke: el.options ? (el.options.stroke !== false) : true,
                };
            }
            if (depth === 3) {
                const polygons = lls.map(p =>
                    (p || []).map(r => (r || []).map(latLngToGeoCoord).filter(Boolean))
                        .filter(r => r.length >= 3)
                ).filter(p => p.length >= 1);
                if (polygons.length === 0) return null;
                return { kind: 'multipolygon', polygons, ...style, ...extras };
            }
            const rings = (depth === 1) ? [lls] : lls;
            const outRings = rings
                .map(r => (r || []).map(latLngToGeoCoord).filter(Boolean))
                .filter(r => r.length >= 3);
            if (outRings.length === 0) return null;
            return { kind: 'polygon', rings: outRings, ...style, ...extras };
        }
        if (el instanceof L.Polyline) {
            const lls = el.getLatLngs();
            const flat = (lls.length && lls[0] && Array.isArray(lls[0])) ? lls.flat() : lls;
            const out = {
                kind: 'polyline', latlngs: flat.map(latLngToGeoCoord).filter(Boolean),
                color: el.options.color || '#3b82f6',
                weight: el._baseLineWeight != null ? el._baseLineWeight : (el.options.weight || 4),
                dashArray: el.options.dashArray || null,
            };
            if (el._autoFlankLine || el._autoFlankArea) {
                out.autoFlank = {
                    area: !!el._autoFlankArea,
                    typeId: el._tmgData?.typeId || null,
                    sessionId: el._tmgData?.sessionId || null,
                    tag: el._tmgData?.tag || null,
                    lengthKm: el._tmgData?.lengthKm || null,
                    parentUnitId: el._tmgData?.parentUnitId || null,
                    areaRole: el._tmgData?.areaRole || null,
                    className: (el.options && el.options.className) || null,
                };
            }
            return out;
        }
        if (el instanceof L.LayerGroup && el._tmgData?.isCatkMultiPoint) {
            const pts = (el._tmgData.points || []).map(latLngToGeoCoord).filter(Boolean);
            const catkOut = {
                kind: 'tmg-group', points: pts, typeId: el._tmgData.typeId,
                color: el._tmgData.color || '#3b82f6',
                strokeWidth: el._tmgData.strokeWidth ?? 4,
                catkMultiPoint: true,
                dashed: !!el._tmgData.dashed,
            };
            if (el._tmgData.catkAutoJunction) catkOut.catkAutoJunction = true;
            if (el._tmgData.preserveLegacyPoints) catkOut.preserveLegacyPoints = true;
            if (isFinite(Number(el._tmgData.legacyBodyWidthKm)) && Number(el._tmgData.legacyBodyWidthKm) > 0) {
                catkOut.legacyBodyWidthKm = Number(el._tmgData.legacyBodyWidthKm);
            }
            if (el._tmgData.lockedArrowParams) catkOut.lockedArrowParams = toAppArrowParams(el._tmgData.lockedArrowParams);
            if (el._tmgData.arrowParams) {
                catkOut.arrowParams = toAppArrowParams(el._tmgData.arrowParams);
                catkOut.parametricArrow = true;
            }
            return catkOut;
        }
        if (el instanceof L.LayerGroup && el._tmgData?.segments) {
            const segs = el._tmgData.segments;
            const pts = [latLngToGeoCoord(segs[0]._tmgData.latlng1)];
            segs.forEach(s => pts.push(latLngToGeoCoord(s._tmgData.latlng2)));
            return {
                kind: 'tmg-group', points: pts.filter(Boolean), typeId: el._tmgData.typeId,
                color: el._tmgData.color || '#3b82f6',
                filled: el._tmgData.filled !== false,
                dashed: el._tmgData.dashed || false,
                strokeWidth: el._tmgData.strokeWidth ?? 4,
            };
        }
        if (el instanceof L.Marker && el._tmgData) {
            const d = el._tmgData;
            return {
                kind: 'tmg-single',
                latlng1: latLngToGeoCoord(d.latlng1),
                latlng2: latLngToGeoCoord(d.latlng2),
                typeId: d.typeId, color: d.color || '#3b82f6',
                filled: d.filled !== false, dashed: d.dashed || false,
                strokeWidth: d.strokeWidth ?? 4,
                sessionId: d.sessionId || undefined,
            };
        }
        if (el instanceof L.Marker) {
            const out = {
                kind: 'symbol', latlng: latLngToGeoCoord(el.getLatLng()),
                sidc: el._sidc || '10031000001200000000',
                textModifiers: el._textModifiers || {},
                statusKey: el._statusKey,
            };
            if (el._symbolRotationDeg) out.symbolRotationDeg = el._symbolRotationDeg;
            const circles = el._rangeCircles || [];
            if (circles.length) out.rangeCircles = circles.map(c => ({ ...c._rangeData }));
            const sectors = el._rangeSectors || [];
            if (sectors.length) out.rangeSectors = sectors.map(s => ({ ...s._rangeSectorData }));
            return out;
        }
        return null;
    }

    function getDisplayName(el) {
        if (el._isTextLabel) return null;
        if (el._geoData && el._geoData.displayName) return el._geoData.displayName;
        if (el._tmgData && el._tmgData.displayName) return el._tmgData.displayName;
        if (el._lineDisplayName) return el._lineDisplayName;
        return null;
    }

    // Serialise one element as a GeoJSON Feature. Keeps AppIO surface compatible
    // with the legacy v2 signature (returns a plain JS object, null on failure).
    function exportSingleElement(el) {
        const app = buildAppProps(el);
        if (!app) return null;
        const geometry = buildGeometry(el, app);
        if (!geometry) return null;
        const properties = { app };
        const dn = getDisplayName(el);
        if (dn) properties.displayName = dn;
        // For free-shape kinds, drop redundant coordinate arrays from properties.app;
        // geometry is the source of truth on reload.
        if (app.kind === 'polyline') delete app.latlngs;
        if (app.kind === 'polygon') delete app.rings;
        if (app.kind === 'geo-freeform' || app.kind === 'geo-freehand' || app.kind === 'geo-distance') {
            delete app.points;
        }
        return { type: 'Feature', geometry, properties };
    }

    // Build the subset of Feature objects for a single layer.
    function exportLayerFeatures(layer) {
        const out = [];
        for (const el of layer.elements) {
            const feat = exportSingleElement(el);
            if (!feat) continue;
            feat.properties = feat.properties || {};
            feat.properties.layerId = layer.id;
            out.push(feat);
        }
        return out;
    }

    // Legacy name kept for AppIO surface compatibility. Returns a per-layer
    // descriptor that app.js can flatten into a FeatureCollection.
    function exportLayerData(layer) {
        return {
            id: layer.id,
            name: layer.name,
            visible: layer.visible,
            active: layer.active,
            features: exportLayerFeatures(layer),
        };
    }

    // Serialise the full layer/folder tree to a GeoJSON FeatureCollection string.
    function exportLayersData() {
        const { getLayers, getFolders } = _ctx;
        const layers = getLayers();
        const folders = getFolders();
        const features = [];
        const __layers = [];
        for (const layer of layers) {
            __layers.push({
                id: layer.id, name: layer.name,
                visible: layer.visible !== false, active: !!layer.active,
            });
            features.push(...exportLayerFeatures(layer));
        }
        const __folders = folders.map(f => ({
            id: f.id, name: f.name,
            layerIds: (f.layerIds || []).filter(lid => layers.some(l => l.id === lid)),
            collapsed: !!f.collapsed,
        }));
        const data = {
            type: 'FeatureCollection',
            app: { version: 3, appName: 'tactical-map' },
            __layers, __folders, features,
        };
        return JSON.stringify(data, null, 2);
    }

    // Subset export; folders only list exported layers so layout restores on import.
    function exportLayersDataFromSelection(selectedLayerIds) {
        const { getLayers, getFolders } = _ctx;
        const layers = getLayers();
        const folders = getFolders();
        const sel = new Set(selectedLayerIds);
        const __layers = [];
        const features = [];
        for (const layer of layers) {
            if (!sel.has(layer.id)) continue;
            __layers.push({
                id: layer.id, name: layer.name,
                visible: layer.visible !== false, active: !!layer.active,
            });
            features.push(...exportLayerFeatures(layer));
        }
        const __folders = [];
        folders.forEach(f => {
            const idsInFolder = (f.layerIds || []).filter(lid => sel.has(lid));
            if (idsInFolder.length === 0) return;
            __folders.push({ id: f.id, name: f.name, collapsed: !!f.collapsed, layerIds: [...idsInFolder] });
        });
        const data = {
            type: 'FeatureCollection',
            app: { version: 3, appName: 'tactical-map' },
            __layers, __folders, features,
        };
        return JSON.stringify(data, null, 2);
    }

    // ------------------------------------------------------------------
    // Import path
    // ------------------------------------------------------------------

    // Convert a v3 Feature's properties.app object (coords in [lng,lat]) back
    // into the legacy elData shape (coords in [lat,lng], `type` instead of `kind`)
    // that the existing per-kind reconstruction branches expect. This keeps the
    // tactical reconstruction logic untouched.
    function featureToLegacyElData(feature) {
        const app = (feature.properties && feature.properties.app) || {};
        const el = { ...app };
        el.type = app.kind;
        delete el.kind;

        // Restore displayName from the outer property slot if present.
        if (feature.properties && feature.properties.displayName) {
            el.displayName = feature.properties.displayName;
        }

        // Flip coordinate fields back to [lat, lng] for the legacy reconstruction code.
        const flipPair = (c) => (c && c.length >= 2) ? [c[1], c[0]] : null;
        if (app.latlng) el.latlng = flipPair(app.latlng);
        if (app.latlng1) el.latlng1 = flipPair(app.latlng1);
        if (app.latlng2) el.latlng2 = flipPair(app.latlng2);
        if (app.center) el.center = flipPair(app.center);
        if (Array.isArray(app.latlngs)) el.latlngs = app.latlngs.map(flipPair).filter(Boolean);
        if (Array.isArray(app.points)) el.points = app.points.map(flipPair).filter(Boolean);
        if (Array.isArray(app.corners)) el.corners = app.corners.map(flipPair).filter(Boolean);
        if (Array.isArray(app.rings)) {
            el.rings = app.rings.map(r => Array.isArray(r) ? r.map(flipPair).filter(Boolean) : []);
        }
        if (Array.isArray(app.polygons)) {
            el.polygons = app.polygons.map(poly =>
                Array.isArray(poly) ? poly.map(ring =>
                    Array.isArray(ring) ? ring.map(flipPair).filter(Boolean) : []
                ) : []
            );
        }
        if (app.arrowParams && app.arrowParams.tip) {
            el.arrowParams = { ...app.arrowParams, tip: flipPair(app.arrowParams.tip) };
        }
        if (app.lockedArrowParams && app.lockedArrowParams.tip) {
            el.lockedArrowParams = { ...app.lockedArrowParams, tip: flipPair(app.lockedArrowParams.tip) };
        }

        // For free-shape kinds, properties.app drops the coord array; rebuild it
        // from the feature's geometry (which is the source of truth for these).
        const geom = feature.geometry;
        if (el.type === 'polyline' && (!el.latlngs || el.latlngs.length < 2)) {
            if (geom && geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
                el.latlngs = geom.coordinates.map(flipPair).filter(Boolean);
            }
        } else if (el.type === 'polygon' && (!el.rings || el.rings.length === 0)) {
            if (geom && geom.type === 'Polygon' && Array.isArray(geom.coordinates)) {
                el.rings = geom.coordinates.map(r =>
                    Array.isArray(r) ? r.map(flipPair).filter(Boolean) : []);
                // Drop the GeoJSON closing duplicate per ring so downstream code
                // doesn't see a doubled vertex.
                el.rings = el.rings.map(r => {
                    if (r.length >= 2) {
                        const first = r[0], last = r[r.length - 1];
                        if (first[0] === last[0] && first[1] === last[1]) return r.slice(0, -1);
                    }
                    return r;
                });
            }
        } else if (el.type === 'multipolygon' && (!el.polygons || el.polygons.length === 0)) {
            if (geom && geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
                el.polygons = geom.coordinates.map(poly =>
                    (poly || []).map(ring => {
                        const flipped = ring.map(flipPair).filter(Boolean);
                        // Drop the GeoJSON closing duplicate — Leaflet auto-closes.
                        if (flipped.length >= 2) {
                            const f = flipped[0], l = flipped[flipped.length - 1];
                            if (f[0] === l[0] && f[1] === l[1]) return flipped.slice(0, -1);
                        }
                        return flipped;
                    })
                );
            }
        } else if ((el.type === 'geo-freeform' || el.type === 'geo-freehand' || el.type === 'geo-distance')
            && (!el.points || el.points.length < 2)) {
            if (geom && (geom.type === 'LineString' || geom.type === 'Polygon')) {
                const coords = geom.type === 'LineString' ? geom.coordinates : (geom.coordinates?.[0] || []);
                el.points = coords.map(flipPair).filter(Boolean);
                if (geom.type === 'Polygon' && el.points.length >= 2) {
                    const first = el.points[0], last = el.points[el.points.length - 1];
                    if (first[0] === last[0] && first[1] === last[1]) el.points = el.points.slice(0, -1);
                }
            }
        }
        return el;
    }

    /**
     * Reconstruct the full layer/folder/element tree from a JSON string.
     * Accepts either v3 (extended GeoJSON FeatureCollection) or legacy v2 plans;
     * v2 is migrated in-memory via window.AppPlanMigrate before the v3 load path.
     */
    function importLayersData(jsonStr, silent, merge) {
        const {
            getLayers, getFolders, getActionHistory, getRedoHistory,
            getMap, getInstructionText, resetIdCounters,
            TEXT_LABEL_COLOR_DEFAULT, TEXT_LABEL_FONT_SIZE_DEFAULT, DEFAULT_GEO_FILL_STYLE,
            CATK_AUTO_JUNCTION_T, GEO_POPUP_OPTIONS,
            cleanupElementDecorations, createLayer, createFolder, moveLayerToFolder,
            buildTextLabelIcon, buildTextLabelPopupContent, bindTextLabelPopupHandlers,
            addToActiveLayer, removeFromLayer, wireTacticalLinePolyline,
            catkInterpOnTailAxis, catkBuildTailPathFromPoints, catkHitPolylineOptions,
            createCatkUnifiedMarker, createParametricCatkGroup, createLegacyCatkGroup, catkDeriveArrowParamsFromLegacyPoints,
            resolveCatkMultiPointDashed, applyImportedDisplayNameProps,
            buildCatkTailPopupContent, onCatkGroupPopupOpen, removeTmgResizeHandle,
            createTmgLayer, showTmgGroupPopupSelectionUi, scheduleTmgPopupBind,
            createSymbolFromData, addRangeCircleToMarker, addRangeSectorToMarker,
            dedupeConsecutiveDistancePointsMutate, createDistanceWaypointMarkers,
            removeGeoResizeHandles, bindGeoCenterMoveHandle, bindGeoPopupHandlers,
            createGeoResizeHandle, syncGeoShapeHandlesToGeometry, getGeoShapeStyle,
            scheduleGeoPathFill, latLngAtBearing, createSectorPolygon, syncSectorWedgeOverlays, removeSectorWedgeOverlays, createRegularPolygon,
            createEllipseRingFromBoundingCorners,
            getMinefieldStyle, applyMinefieldFill, addMinefieldDecorations, bindMinefieldResizeHandles,
            wireFreehandPolyline,
            cancelGeoDrawing, cancelLineDrawing, renderLayersList,
            refreshZoomScaledMapOverlays, syncPlacementLayerInteractivity, scheduleSaveToStorage,
        } = _ctx;

        const layers = getLayers();
        const folders = getFolders();
        const actionHistory = getActionHistory();
        const redoHistory = getRedoHistory();
        const map = getMap();
        const instructionText = getInstructionText();

        const { TACTICAL_GRAPHICS } = window.AppSymbology;
        const { isCounterattackStyleMultiPointType } = window.AppGraphics;
        const { trimmedDisplayNameFrom, totalDistanceKm, haversineDistance } = window.AppUtils;

        let parsed;
        try {
            parsed = JSON.parse(jsonStr);
        } catch (e) {
            if (!silent) alert('Invalid JSON file.');
            return;
        }

        // Detect format and normalise to v3 FeatureCollection shape.
        const PM = window.AppPlanMigrate;
        let fc = null;
        if (PM && PM.isV3FeatureCollection(parsed)) {
            fc = parsed;
        } else if (PM && PM.isV2Plan(parsed)) {
            try { fc = PM.migrateV2PlanToV3(parsed); }
            catch { fc = null; }
        }
        if (!fc) {
            if (!silent) alert('Invalid format: not a recognised plan file.');
            return;
        }

        // Group features by layerId so we recreate layers in declaration order.
        const featuresByLayer = new Map();
        for (const feat of fc.features) {
            const lid = (feat.properties && feat.properties.layerId) || (fc.__layers[0] && fc.__layers[0].id) || 'layer-1';
            if (!featuresByLayer.has(lid)) featuresByLayer.set(lid, []);
            featuresByLayer.get(lid).push(feat);
        }

        // Back-compat adapter so the rest of this function can keep calling the
        // legacy per-kind reconstruction branches unchanged.
        const data = {
            version: 2, // internal adapter marker, not serialised
            folders: fc.__folders || [],
            layers: (fc.__layers || []).map(L => ({
                id: L.id, name: L.name,
                visible: L.visible !== false, active: !!L.active,
                elements: (featuresByLayer.get(L.id) || []).map(featureToLegacyElData),
            })),
        };

        if (!merge) {
            layers.forEach(l => {
                l.elements.forEach(el => {
                    cleanupElementDecorations(el, l);
                    l.group.removeLayer(el);
                });
                l.elements.length = 0;
                if (l.visible) map.removeLayer(l.group);
            });
            layers.length = 0;
            folders.length = 0;
            actionHistory.length = 0;
            redoHistory.length = 0;
            resetIdCounters();
        }

        const layerIdMap = {};
        data.layers.forEach((layerData, idx) => {
            const baseName = layerData.name || t('layer-name-default', String(idx + 1));
            const layer = createLayer(merge ? baseName + (typeof t === 'function' ? t('layer-imported-suffix') : ' (imported)') : baseName);
            if (layerData.id) layerIdMap[layerData.id] = layer.id;
            layer.visible = layerData.visible !== false;
            layer.active = !!layerData.active;
            if (!layer.visible) map.removeLayer(layer.group);

            (layerData.elements || []).forEach(elData => {
                if (elData.type === 'text') {
                    const latlng = elData.latlng ? L.latLng(elData.latlng[0], elData.latlng[1]) : null;
                    if (!latlng) return;
                    const marker = L.marker(latlng, { icon: null, draggable: true });
                    marker._isTextLabel = true;
                    marker._textContent = elData.text || '';
                    marker._textColor = elData.color || TEXT_LABEL_COLOR_DEFAULT;
                    marker._textFontSize = elData.fontSize ?? TEXT_LABEL_FONT_SIZE_DEFAULT;
                    marker._textRotationDeg = elData.rotationDeg || 0;
                    marker.setIcon(buildTextLabelIcon(marker));
                    marker.bindPopup(buildTextLabelPopupContent(marker));
                    marker.on('popupopen', () => bindTextLabelPopupHandlers(marker));
                    addToActiveLayer(marker);
                    const addedLayer = layers.find(l => l.elements.includes(marker));
                    if (addedLayer && addedLayer.id !== layer.id) {
                        removeFromLayer(marker);
                        marker._layerId = layer.id;
                        layer.elements.push(marker);
                        layer.group.addLayer(marker);
                    } else if (layer.elements[layer.elements.length - 1] !== marker) {
                        removeFromLayer(marker);
                        marker._layerId = layer.id;
                        layer.elements.push(marker);
                        layer.group.addLayer(marker);
                    }
                } else if (elData.type === 'polygon') {
                    const rings = (elData.rings || [])
                        .map(r => (r || []).map(p => p ? L.latLng(p[0], p[1]) : null).filter(Boolean))
                        .filter(r => r.length >= 3);
                    if (rings.length === 0) return;
                    const opts = {
                        color: elData.color || '#3b82f6',
                        weight: elData.weight || 4,
                        fillColor: elData.fillColor || elData.color || '#3b82f6',
                        fillOpacity: elData.fillOpacity != null ? elData.fillOpacity : 0.08,
                        dashArray: elData.dashArray
                    };
                    if (elData.autoFlank) {
                        if (elData.autoFlank.className) opts.className = elData.autoFlank.className;
                        if (elData.autoFlank.stroke === false) opts.stroke = false;
                    }
                    const poly = L.polygon(rings, opts);
                    poly._baseLineWeight = elData.weight != null ? elData.weight : 4;
                    const dn = trimmedDisplayNameFrom(elData.displayName);
                    if (dn) poly._lineDisplayName = dn;
                    if (elData.autoFlank) {
                        poly._autoFlankLine = true;
                        if (elData.autoFlank.area) poly._autoFlankArea = true;
                        poly._tmgData = {
                            typeId: elData.autoFlank.typeId || 'auto-flank-area',
                            sessionId: elData.autoFlank.sessionId || null,
                            tag: elData.autoFlank.tag || null,
                            lengthKm: elData.autoFlank.lengthKm || null,
                            parentUnitId: elData.autoFlank.parentUnitId || null,
                            areaRole: elData.autoFlank.areaRole || null,
                        };
                    }
                    poly._layerId = layer.id;
                    layer.elements.push(poly);
                    layer.group.addLayer(poly);
                } else if (elData.type === 'multipolygon') {
                    const polygons = (elData.polygons || [])
                        .map(poly => (poly || [])
                            .map(r => (r || []).map(p => p ? L.latLng(p[0], p[1]) : null).filter(Boolean))
                            .filter(r => r.length >= 3))
                        .filter(p => p.length >= 1);
                    if (polygons.length === 0) return;
                    const opts = {
                        color: elData.color || '#3b82f6',
                        weight: elData.weight || 4,
                        fillColor: elData.fillColor || elData.color || '#3b82f6',
                        fillOpacity: elData.fillOpacity != null ? elData.fillOpacity : 0.08,
                        dashArray: elData.dashArray
                    };
                    if (elData.autoFlank) {
                        if (elData.autoFlank.className) opts.className = elData.autoFlank.className;
                        if (elData.autoFlank.stroke === false) opts.stroke = false;
                    }
                    const mp = L.polygon(polygons, opts);
                    mp._baseLineWeight = elData.weight != null ? elData.weight : 4;
                    const dnMp = trimmedDisplayNameFrom(elData.displayName);
                    if (dnMp) mp._lineDisplayName = dnMp;
                    if (elData.autoFlank) {
                        mp._autoFlankLine = true;
                        if (elData.autoFlank.area) mp._autoFlankArea = true;
                        mp._tmgData = {
                            typeId: elData.autoFlank.typeId || 'auto-flank-area',
                            sessionId: elData.autoFlank.sessionId || null,
                            tag: elData.autoFlank.tag || null,
                            lengthKm: elData.autoFlank.lengthKm || null,
                            parentUnitId: elData.autoFlank.parentUnitId || null,
                            areaRole: elData.autoFlank.areaRole || null,
                        };
                    }
                    mp._layerId = layer.id;
                    layer.elements.push(mp);
                    layer.group.addLayer(mp);
                } else if (elData.type === 'polyline') {
                    const latlngs = (elData.latlngs || []).map(p => p ? L.latLng(p[0], p[1]) : null).filter(Boolean);
                    if (latlngs.length < 2) return;
                    const opts = { color: elData.color || '#3b82f6', weight: elData.weight || 4, dashArray: elData.dashArray };
                    if (elData.autoFlank && elData.autoFlank.className) opts.className = elData.autoFlank.className;
                    const polyline = L.polyline(latlngs, opts);
                    polyline._baseLineWeight = elData.weight != null ? elData.weight : 4;
                    if (!elData.autoFlank) wireTacticalLinePolyline(polyline);
                    const lineDn = trimmedDisplayNameFrom(elData.displayName);
                    if (lineDn) polyline._lineDisplayName = lineDn;
                    if (elData.autoFlank) {
                        polyline._autoFlankLine = true;
                        if (elData.autoFlank.area) polyline._autoFlankArea = true;
                        polyline._tmgData = {
                            typeId: elData.autoFlank.typeId || 'auto-flank-line',
                            sessionId: elData.autoFlank.sessionId || null,
                            tag: elData.autoFlank.tag || null,
                            lengthKm: elData.autoFlank.lengthKm || null,
                            parentUnitId: elData.autoFlank.parentUnitId || null,
                            areaRole: elData.autoFlank.areaRole || null,
                        };
                    }
                    polyline._layerId = layer.id;
                    layer.elements.push(polyline);
                    layer.group.addLayer(polyline);
                } else if (elData.type === 'tmg-single') {
                    const latlng1 = elData.latlng1 ? L.latLng(elData.latlng1[0], elData.latlng1[1]) : null;
                    const latlng2 = elData.latlng2 ? L.latLng(elData.latlng2[0], elData.latlng2[1]) : null;
                    if (!latlng1 || !latlng2) return;
                    let tid = elData.typeId || 'attack';
                    if (tid === 'terrain-map') tid = 'counterattack';
                    if (isCounterattackStyleMultiPointType(tid)) {
                        const arrowParams = fromAppArrowParams(elData.arrowParams)
                            || catkDeriveArrowParamsFromLegacyPoints([latlng2, latlng1], elData.strokeWidth ?? 4, elData.arrowHeadScale);
                        const group = createParametricCatkGroup(tid, arrowParams, elData);
                        if (group) {
                            group._layerId = layer.id;
                            layer.elements.push(group);
                            layer.group.addLayer(group);
                        }
                    } else {
                        const seg = createTmgLayer(latlng1, latlng2, tid, elData.color || '#3b82f6', false, false, { filled: elData.filled !== false, dashed: elData.dashed || false, strokeWidth: elData.strokeWidth ?? 4 });
                        if (seg) {
                            Object.assign(seg._tmgData, applyImportedDisplayNameProps(elData));
                            if (elData.sessionId) seg._tmgData.sessionId = elData.sessionId;
                            seg._layerId = layer.id;
                            layer.elements.push(seg);
                            layer.group.addLayer(seg);
                        }
                    }
                } else if (elData.type === 'tmg-group') {
                    const pts = (elData.points || []).map(p => p ? L.latLng(p[0], p[1]) : null).filter(Boolean);
                    if (pts.length < 2) return;
                    let typeId = elData.typeId || 'attack';
                    if (typeId === 'terrain-map') typeId = 'counterattack';
                    const color = elData.color || '#3b82f6';
                    const filled = elData.filled !== false;
                    const dashed = elData.dashed || false;
                    const strokeWidth = elData.strokeWidth ?? 4;
                    const def = TACTICAL_GRAPHICS.find(d => d.id === typeId);
                    if (def && def.pointSymbol && pts.length > 2 && !elData.catkMultiPoint) pts.length = 2;
                    if (elData.catkMultiPoint && isCounterattackStyleMultiPointType(typeId) && pts.length > 2) {
                        const importedArrowParams = fromAppArrowParams(elData.arrowParams);
                        const useLegacyPoints = !!elData.preserveLegacyPoints && !importedArrowParams;
                        const importedLockedArrowParams = fromAppArrowParams(elData.lockedArrowParams);
                        const group = useLegacyPoints
                            ? createLegacyCatkGroup(typeId, pts, { ...elData, lockedArrowParams: importedLockedArrowParams, preserveLegacyPoints: true })
                            : createParametricCatkGroup(
                                typeId,
                                importedArrowParams || catkDeriveArrowParamsFromLegacyPoints(pts, strokeWidth, elData.arrowHeadScale),
                                elData
                            );
                        if (group) {
                            group._layerId = layer.id;
                            layer.elements.push(group);
                            layer.group.addLayer(group);
                        }
                    } else if (pts.length === 2) {
                        if (isCounterattackStyleMultiPointType(typeId)) {
                            const arrowParams = fromAppArrowParams(elData.arrowParams)
                                || catkDeriveArrowParamsFromLegacyPoints(pts, strokeWidth, elData.arrowHeadScale);
                            const group = createParametricCatkGroup(typeId, arrowParams, elData);
                            if (group) {
                                group._layerId = layer.id;
                                layer.elements.push(group);
                                layer.group.addLayer(group);
                            }
                        } else {
                            const seg = createTmgLayer(pts[0], pts[1], typeId, color, false, false, { filled, dashed, strokeWidth });
                            if (seg) {
                                Object.assign(seg._tmgData, applyImportedDisplayNameProps(elData));
                                seg._layerId = layer.id;
                                layer.elements.push(seg);
                                layer.group.addLayer(seg);
                            }
                        }
                    } else if (pts.length > 2 && def && !def.pointSymbol) {
                        const group = L.layerGroup();
                        const segments = [];
                        for (let i = 0; i < pts.length - 1; i++) {
                            const useBodyOnly = i < pts.length - 2;
                            const seg = createTmgLayer(pts[i], pts[i + 1], typeId, color, useBodyOnly, true, { filled, dashed, strokeWidth });
                            if (seg) {
                                group.addLayer(seg);
                                segments.push(seg);
                                seg.on('click', () => group.openPopup(seg.getLatLng()));
                            }
                        }
                        group._tmgData = { segments, typeId, color, filled, dashed, strokeWidth, ...applyImportedDisplayNameProps(elData) };
                        group.bindPopup(window.AppPopups.buildGroupTmgPopupContent(group));
                        group.on('popupclose', () => removeTmgResizeHandle());
                        group.on('popupopen', () => {
                            group.setPopupContent(window.AppPopups.buildGroupTmgPopupContent(group));
                            scheduleTmgPopupBind(() => {
                                window.AppPopups.bindGroupTmgPopupHandlers(group);
                                showTmgGroupPopupSelectionUi(group, group._layerId);
                            });
                        });
                        group._layerId = layer.id;
                        layer.elements.push(group);
                        layer.group.addLayer(group);
                    }
                } else if (elData.type === 'symbol') {
                    // Legacy ghost-marker cleanup: older saves captured unit
                    // markers as generic symbols with the all-zeros entity SIDC
                    // (a frame with no branch — renders as just a blue
                    // rectangle). Those entries are now produced by units-map.js
                    // through /api/units/tree, so skip any imported symbol that
                    // is bare-frame to avoid resurrecting the duplicates.
                    const _sidcDigits = String(elData.sidc || '').replace(/\D/g, '');
                    const _isBareFrame = _sidcDigits.length < 20 || _sidcDigits.substr(10, 6) === '000000';
                    if (_isBareFrame) return;
                    const marker = createSymbolFromData(elData);
                    if (marker) {
                        marker._layerId = layer.id;
                        layer.elements.push(marker);
                        layer.group.addLayer(marker);
                        if (marker._pendingRangeCircles?.length) {
                            marker._pendingRangeCircles.forEach(rc => {
                                addRangeCircleToMarker(marker, rc.radiusKm ?? 5, rc.color ?? '#3b82f6', rc.fillStyle ?? DEFAULT_GEO_FILL_STYLE);
                            });
                            delete marker._pendingRangeCircles;
                        }
                        if (marker._pendingRangeSectors?.length) {
                            marker._pendingRangeSectors.forEach(rs => {
                                addRangeSectorToMarker(marker, rs.radiusKm ?? 5, rs.bearing ?? 0, rs.aperture ?? 90, rs.color ?? '#3b82f6', rs.fillStyle ?? DEFAULT_GEO_FILL_STYLE);
                            });
                            delete marker._pendingRangeSectors;
                        }
                    }
                } else if (elData.type === 'geo-distance') {
                    const pts = (elData.points || []).map(p => p ? L.latLng(p[0], p[1]) : null).filter(Boolean);
                    dedupeConsecutiveDistancePointsMutate(pts);
                    if (pts.length < 2) return;
                    const color = elData.color || '#3b82f6';
                    let pointLabels = [...(elData.pointLabels || [])].slice(0, pts.length);
                    while (pointLabels.length < pts.length) pointLabels.push('');
                    const polyline = L.polyline(pts, { color, weight: 3 });
                    polyline._geoType = 'distance';
                    polyline._geoData = { points: pts, distanceKm: totalDistanceKm(pts), color, pointLabels, ...applyImportedDisplayNameProps(elData) };
                    polyline.bindPopup(window.AppPopups.buildGeoPopupContent(polyline, 'distance', polyline._geoData), GEO_POPUP_OPTIONS);
                    polyline.on('popupopen', () => {
                        removeGeoResizeHandles();
                        const d = polyline._geoData;
                        if (d) {
                            d.points = d.points?.length ? d.points : (polyline.getLatLngs?.() || []);
                            polyline.setPopupContent(window.AppPopups.buildGeoPopupContent(polyline, 'distance', d));
                        }
                        bindGeoCenterMoveHandle(polyline, 'distance');
                        if (!polyline._waypointMarkers?.length) createDistanceWaypointMarkers(polyline);
                        bindGeoPopupHandlers(polyline, 'distance');
                    });
                    polyline.on('popupclose', removeGeoResizeHandles);
                    polyline._layerId = layer.id;
                    layer.elements.push(polyline);
                    layer.group.addLayer(polyline);
                    setTimeout(() => createDistanceWaypointMarkers(polyline), 0);
                } else if (elData.type === 'geo-range-circle') {
                    const center = elData.center ? L.latLng(elData.center[0], elData.center[1]) : null;
                    if (!center) return;
                    const radiusKm = elData.radiusKm || 5;
                    const color = elData.color || '#3b82f6';
                    const fillStyle = elData.fillStyle || DEFAULT_GEO_FILL_STYLE;
                    const circle = L.circle(center, { radius: radiusKm * 1000, ...getGeoShapeStyle(color, fillStyle) });
                    circle._geoType = 'range-circle';
                    circle._geoData = { center, radiusKm, color, fillStyle, ...applyImportedDisplayNameProps(elData) };
                    if (['vertical', 'horizontal', 'both'].includes(fillStyle)) circle.once('add', () => scheduleGeoPathFill(circle));
                    circle.bindPopup(window.AppPopups.buildGeoPopupContent(circle, 'range-circle', circle._geoData), GEO_POPUP_OPTIONS);
                    circle.on('popupopen', () => {
                        removeGeoResizeHandles();
                        const d = circle._geoData;
                        const handleLat = latLngAtBearing(d.center, d.radiusKm, 0);
                        createGeoResizeHandle(handleLat, (newLat, isFinal) => {
                            const distM = haversineDistance(d.center.lat, d.center.lng, newLat.lat, newLat.lng);
                            d.radiusKm = parseFloat((distM / 1000).toFixed(2));
                            circle.setRadius(d.radiusKm * 1000);
                            circle.setPopupContent(window.AppPopups.buildGeoPopupContent(circle, 'range-circle', d));
                            bindGeoPopupHandlers(circle, 'range-circle');
                            syncGeoShapeHandlesToGeometry(circle, 'range-circle');
                            const activeGeoResizeHandles = _ctx.getActiveGeoResizeHandles();
                            if (isFinal && activeGeoResizeHandles.length >= 1) activeGeoResizeHandles[0].setLatLng(latLngAtBearing(d.center, d.radiusKm, 0));
                            if (isFinal) scheduleSaveToStorage();
                        }, circle._layerId);
                        bindGeoCenterMoveHandle(circle, 'range-circle');
                        bindGeoPopupHandlers(circle, 'range-circle');
                    });
                    circle.on('popupclose', removeGeoResizeHandles);
                    circle._layerId = layer.id;
                    layer.elements.push(circle);
                    layer.group.addLayer(circle);
                } else if (elData.type === 'geo-range-sector') {
                    const center = elData.center ? L.latLng(elData.center[0], elData.center[1]) : null;
                    if (!center) return;
                    const radiusKm = elData.radiusKm || 5;
                    const bearing = elData.bearing || 0;
                    const aperture = elData.aperture || 90;
                    const color = elData.color || '#3b82f6';
                    const fillStyle = elData.fillStyle || DEFAULT_GEO_FILL_STYLE;
                    const weight = Number.isFinite(elData.weight) ? elData.weight : undefined;
                    const subdivisions = Number.isFinite(elData.subdivisions) && elData.subdivisions > 1 ? elData.subdivisions : undefined;
                    const wedges = Array.isArray(elData.wedges) ? elData.wedges.map(w => ({
                        color: (w && w.color) || null,
                        label: (w && typeof w.label === 'string') ? w.label : '',
                        ...(w && Number.isFinite(w.labelPosition) ? { labelPosition: w.labelPosition } : {})
                    })) : undefined;
                    const labelSize = Number.isFinite(elData.labelSize) ? elData.labelSize : undefined;
                    const labelFont = typeof elData.labelFont === 'string' && elData.labelFont ? elData.labelFont : undefined;
                    const points = createSectorPolygon(center, radiusKm, bearing, aperture, subdivisions);
                    const sector = L.polygon(points, { ...getGeoShapeStyle(color, fillStyle, weight) });
                    sector._geoType = 'range-sector';
                    sector._geoData = { center, radiusKm, bearing, aperture, color, fillStyle, ...(weight != null ? { weight } : {}), ...(subdivisions != null ? { subdivisions } : {}), ...(wedges ? { wedges } : {}), ...(labelSize != null ? { labelSize } : {}), ...(labelFont ? { labelFont } : {}), ...applyImportedDisplayNameProps(elData) };
                    sector.on('remove', () => { if (typeof _ctx.removeSectorWedgeOverlays === 'function') _ctx.removeSectorWedgeOverlays(sector); });
                    sector.once('add', () => { if (typeof _ctx.syncSectorWedgeOverlays === 'function') _ctx.syncSectorWedgeOverlays(sector); });
                    if (['vertical', 'horizontal', 'both'].includes(fillStyle)) sector.once('add', () => scheduleGeoPathFill(sector));
                    sector.bindPopup(window.AppPopups.buildGeoPopupContent(sector, 'range-sector', sector._geoData), GEO_POPUP_OPTIONS);
                    sector.on('popupopen', () => {
                        removeGeoResizeHandles();
                        const d = sector._geoData;
                        const handleLat = latLngAtBearing(d.center, d.radiusKm, d.bearing);
                        createGeoResizeHandle(handleLat, (newLat, isFinal) => {
                            const distM = haversineDistance(d.center.lat, d.center.lng, newLat.lat, newLat.lng);
                            d.radiusKm = parseFloat((distM / 1000).toFixed(2));
                            const pts = createSectorPolygon(d.center, d.radiusKm, d.bearing, d.aperture, d.subdivisions);
                            sector.setLatLngs(pts);
                            if (typeof _ctx.syncSectorWedgeOverlays === 'function') _ctx.syncSectorWedgeOverlays(sector);
                            sector.setPopupContent(window.AppPopups.buildGeoPopupContent(sector, 'range-sector', d));
                            bindGeoPopupHandlers(sector, 'range-sector');
                            syncGeoShapeHandlesToGeometry(sector, 'range-sector');
                            const activeGeoResizeHandles = _ctx.getActiveGeoResizeHandles();
                            if (isFinal && activeGeoResizeHandles.length >= 1) activeGeoResizeHandles[0].setLatLng(latLngAtBearing(d.center, d.radiusKm, d.bearing));
                            if (isFinal) scheduleSaveToStorage();
                        }, sector._layerId);
                        bindGeoCenterMoveHandle(sector, 'range-sector');
                        bindGeoPopupHandlers(sector, 'range-sector');
                    });
                    sector.on('popupclose', removeGeoResizeHandles);
                    sector._layerId = layer.id;
                    layer.elements.push(sector);
                    layer.group.addLayer(sector);
                } else if (elData.type === 'geo-circle-2pt') {
                    const center = elData.center ? L.latLng(elData.center[0], elData.center[1]) : null;
                    if (!center) return;
                    const radiusKm = elData.radiusKm || 5;
                    const color = elData.color || '#3b82f6';
                    const fillStyle = elData.fillStyle || DEFAULT_GEO_FILL_STYLE;
                    const circle = L.circle(center, { radius: radiusKm * 1000, ...getGeoShapeStyle(color, fillStyle) });
                    circle._geoType = 'circle-2pt';
                    circle._geoData = { center, radiusKm, color, fillStyle, ...applyImportedDisplayNameProps(elData) };
                    if (['vertical', 'horizontal', 'both'].includes(fillStyle)) circle.once('add', () => scheduleGeoPathFill(circle));
                    circle.bindPopup(window.AppPopups.buildGeoPopupContent(circle, 'circle-2pt', circle._geoData), GEO_POPUP_OPTIONS);
                    circle.on('popupopen', () => {
                        removeGeoResizeHandles();
                        const d = circle._geoData;
                        const handleLat = latLngAtBearing(d.center, d.radiusKm, 0);
                        createGeoResizeHandle(handleLat, (newLat, isFinal) => {
                            const distM = haversineDistance(d.center.lat, d.center.lng, newLat.lat, newLat.lng);
                            d.radiusKm = parseFloat((distM / 1000).toFixed(2));
                            circle.setRadius(d.radiusKm * 1000);
                            circle.setPopupContent(window.AppPopups.buildGeoPopupContent(circle, 'circle-2pt', d));
                            bindGeoPopupHandlers(circle, 'circle-2pt');
                            syncGeoShapeHandlesToGeometry(circle, 'circle-2pt');
                            const activeGeoResizeHandles = _ctx.getActiveGeoResizeHandles();
                            if (isFinal && activeGeoResizeHandles.length >= 1) activeGeoResizeHandles[0].setLatLng(latLngAtBearing(d.center, d.radiusKm, 0));
                            if (isFinal) scheduleSaveToStorage();
                        }, circle._layerId);
                        bindGeoCenterMoveHandle(circle, 'circle-2pt');
                        bindGeoPopupHandlers(circle, 'circle-2pt');
                    });
                    circle.on('popupclose', removeGeoResizeHandles);
                    circle._layerId = layer.id;
                    layer.elements.push(circle);
                    layer.group.addLayer(circle);
                } else if (elData.type === 'geo-semi-circle') {
                    const center = elData.center ? L.latLng(elData.center[0], elData.center[1]) : null;
                    if (!center) return;
                    const radiusKm = elData.radiusKm || 5;
                    const bearing = elData.bearing || 0;
                    const color = elData.color || '#3b82f6';
                    const fillStyle = elData.fillStyle || DEFAULT_GEO_FILL_STYLE;
                    const weight = Number.isFinite(elData.weight) ? elData.weight : undefined;
                    const subdivisions = Number.isFinite(elData.subdivisions) && elData.subdivisions > 1 ? elData.subdivisions : undefined;
                    const wedges = Array.isArray(elData.wedges) ? elData.wedges.map(w => ({
                        color: (w && w.color) || null,
                        label: (w && typeof w.label === 'string') ? w.label : '',
                        ...(w && Number.isFinite(w.labelPosition) ? { labelPosition: w.labelPosition } : {})
                    })) : undefined;
                    const labelSize = Number.isFinite(elData.labelSize) ? elData.labelSize : undefined;
                    const labelFont = typeof elData.labelFont === 'string' && elData.labelFont ? elData.labelFont : undefined;
                    const points = createSectorPolygon(center, radiusKm, bearing, 180, subdivisions);
                    const sector = L.polygon(points, { ...getGeoShapeStyle(color, fillStyle, weight) });
                    sector._geoType = 'semi-circle';
                    sector._geoData = { center, radiusKm, bearing, aperture: 180, color, fillStyle, ...(weight != null ? { weight } : {}), ...(subdivisions != null ? { subdivisions } : {}), ...(wedges ? { wedges } : {}), ...(labelSize != null ? { labelSize } : {}), ...(labelFont ? { labelFont } : {}), ...applyImportedDisplayNameProps(elData) };
                    sector.on('remove', () => { if (typeof _ctx.removeSectorWedgeOverlays === 'function') _ctx.removeSectorWedgeOverlays(sector); });
                    sector.once('add', () => { if (typeof _ctx.syncSectorWedgeOverlays === 'function') _ctx.syncSectorWedgeOverlays(sector); });
                    if (['vertical', 'horizontal', 'both'].includes(fillStyle)) sector.once('add', () => scheduleGeoPathFill(sector));
                    sector.bindPopup(window.AppPopups.buildGeoPopupContent(sector, 'semi-circle', sector._geoData), GEO_POPUP_OPTIONS);
                    sector.on('popupopen', () => {
                        removeGeoResizeHandles();
                        const d = sector._geoData;
                        const handleLat = latLngAtBearing(d.center, d.radiusKm, d.bearing);
                        createGeoResizeHandle(handleLat, (newLat, isFinal) => {
                            const distM = haversineDistance(d.center.lat, d.center.lng, newLat.lat, newLat.lng);
                            d.radiusKm = parseFloat((distM / 1000).toFixed(2));
                            const pts = createSectorPolygon(d.center, d.radiusKm, d.bearing, 180, d.subdivisions);
                            sector.setLatLngs(pts);
                            if (typeof _ctx.syncSectorWedgeOverlays === 'function') _ctx.syncSectorWedgeOverlays(sector);
                            sector.setPopupContent(window.AppPopups.buildGeoPopupContent(sector, 'semi-circle', d));
                            bindGeoPopupHandlers(sector, 'semi-circle');
                            syncGeoShapeHandlesToGeometry(sector, 'semi-circle');
                            const activeGeoResizeHandles = _ctx.getActiveGeoResizeHandles();
                            if (isFinal && activeGeoResizeHandles.length >= 1) activeGeoResizeHandles[0].setLatLng(latLngAtBearing(d.center, d.radiusKm, d.bearing));
                            if (isFinal) scheduleSaveToStorage();
                        }, sector._layerId);
                        bindGeoCenterMoveHandle(sector, 'semi-circle');
                        bindGeoPopupHandlers(sector, 'semi-circle');
                    });
                    sector.on('popupclose', removeGeoResizeHandles);
                    sector._layerId = layer.id;
                    layer.elements.push(sector);
                    layer.group.addLayer(sector);
                } else if (elData.type === 'geo-rectangle') {
                    const corners = (elData.corners || []).map(c => Array.isArray(c) ? L.latLng(c[0], c[1]) : null).filter(Boolean);
                    if (corners.length < 4) return;
                    const color = elData.color || '#3b82f6';
                    const fillStyle = elData.fillStyle || DEFAULT_GEO_FILL_STYLE;
                    const rect = L.polygon(corners, { ...getGeoShapeStyle(color, fillStyle) });
                    rect._geoType = 'rectangle';
                    rect._geoData = { corners, color, fillStyle, ...applyImportedDisplayNameProps(elData) };
                    if (['vertical', 'horizontal', 'both'].includes(fillStyle)) rect.once('add', () => scheduleGeoPathFill(rect));
                    rect.bindPopup(window.AppPopups.buildGeoPopupContent(rect, 'rectangle', rect._geoData), GEO_POPUP_OPTIONS);
                    rect.on('popupopen', () => {
                        removeGeoResizeHandles();
                        bindGeoCenterMoveHandle(rect, 'rectangle');
                        bindGeoPopupHandlers(rect, 'rectangle');
                    });
                    rect.on('popupclose', removeGeoResizeHandles);
                    rect._layerId = layer.id;
                    layer.elements.push(rect);
                    layer.group.addLayer(rect);
                } else if (elData.type === 'geo-oval') {
                    const corners = (elData.corners || []).map(c => Array.isArray(c) ? L.latLng(c[0], c[1]) : null).filter(Boolean);
                    if (corners.length < 4) return;
                    const color = elData.color || '#3b82f6';
                    const fillStyle = elData.fillStyle || DEFAULT_GEO_FILL_STYLE;
                    const ring = createEllipseRingFromBoundingCorners(corners, map, 64);
                    const oval = L.polygon(ring, { ...getGeoShapeStyle(color, fillStyle) });
                    oval._geoType = 'oval';
                    oval._geoData = { corners, color, fillStyle, ...applyImportedDisplayNameProps(elData) };
                    if (['vertical', 'horizontal', 'both'].includes(fillStyle)) oval.once('add', () => scheduleGeoPathFill(oval));
                    oval.bindPopup(window.AppPopups.buildGeoPopupContent(oval, 'oval', oval._geoData), GEO_POPUP_OPTIONS);
                    oval.on('popupopen', () => {
                        removeGeoResizeHandles();
                        bindGeoCenterMoveHandle(oval, 'oval');
                        bindGeoPopupHandlers(oval, 'oval');
                    });
                    oval.on('popupclose', removeGeoResizeHandles);
                    oval._layerId = layer.id;
                    layer.elements.push(oval);
                    layer.group.addLayer(oval);
                } else if (elData.type === 'geo-minefield') {
                    const corners = (elData.corners || []).map(c => Array.isArray(c) ? L.latLng(c[0], c[1]) : null).filter(Boolean);
                    if (corners.length < 4) return;
                    const color = elData.color || '#3b82f6';
                    const mineType = elData.mineType || 'ap';
                    const mf = L.polygon(corners, getMinefieldStyle(color, mineType));
                    mf._geoType = 'minefield';
                    mf._geoData = { corners, color, mineType, ...applyImportedDisplayNameProps(elData) };
                    mf.once('add', () => {
                        applyMinefieldFill(mf);
                        addMinefieldDecorations(mf, corners, color, mf._layerId);
                    });
                    mf.bindPopup(window.AppPopups.buildGeoPopupContent(mf, 'minefield', mf._geoData), GEO_POPUP_OPTIONS);
                    mf.on('popupopen', () => {
                        bindMinefieldResizeHandles(mf);
                        bindGeoCenterMoveHandle(mf, 'minefield');
                        bindGeoPopupHandlers(mf, 'minefield');
                    });
                    mf.on('popupclose', removeGeoResizeHandles);
                    mf._layerId = layer.id;
                    layer.elements.push(mf);
                    layer.group.addLayer(mf);
                } else if (elData.type === 'geo-polygon') {
                    const center = elData.center ? L.latLng(elData.center[0], elData.center[1]) : null;
                    if (!center) return;
                    const radiusKm = elData.radiusKm || 5;
                    const sides = Math.max(3, Math.min(20, elData.sides || 6));
                    const rotation = elData.rotation || 0;
                    const color = elData.color || '#3b82f6';
                    const fillStyle = elData.fillStyle || DEFAULT_GEO_FILL_STYLE;
                    const points = createRegularPolygon(center, radiusKm, sides, rotation);
                    const poly = L.polygon(points, { ...getGeoShapeStyle(color, fillStyle) });
                    poly._geoType = 'polygon';
                    poly._geoData = { center, radiusKm, sides, rotation, color, fillStyle, ...applyImportedDisplayNameProps(elData) };
                    if (['vertical', 'horizontal', 'both'].includes(fillStyle)) poly.once('add', () => scheduleGeoPathFill(poly));
                    poly.bindPopup(window.AppPopups.buildGeoPopupContent(poly, 'polygon', poly._geoData), GEO_POPUP_OPTIONS);
                    poly.on('popupopen', () => {
                        removeGeoResizeHandles();
                        const d = poly._geoData;
                        const handleLat = latLngAtBearing(d.center, d.radiusKm, d.rotation);
                        createGeoResizeHandle(handleLat, (newLat, isFinal) => {
                            const distM = haversineDistance(d.center.lat, d.center.lng, newLat.lat, newLat.lng);
                            d.radiusKm = parseFloat((distM / 1000).toFixed(2));
                            const pts = createRegularPolygon(d.center, d.radiusKm, d.sides, d.rotation);
                            poly.setLatLngs(pts);
                            poly.setPopupContent(window.AppPopups.buildGeoPopupContent(poly, 'polygon', d));
                            bindGeoPopupHandlers(poly, 'polygon');
                            syncGeoShapeHandlesToGeometry(poly, 'polygon');
                            const activeGeoResizeHandles = _ctx.getActiveGeoResizeHandles();
                            if (isFinal && activeGeoResizeHandles.length >= 1) activeGeoResizeHandles[0].setLatLng(latLngAtBearing(d.center, d.radiusKm, d.rotation));
                            if (isFinal) scheduleSaveToStorage();
                        }, poly._layerId);
                        bindGeoCenterMoveHandle(poly, 'polygon');
                        bindGeoPopupHandlers(poly, 'polygon');
                    });
                    poly.on('popupclose', removeGeoResizeHandles);
                    poly._layerId = layer.id;
                    layer.elements.push(poly);
                    layer.group.addLayer(poly);
                } else if (elData.type === 'geo-freeform') {
                    const pts = (elData.points || []).map(p => Array.isArray(p) ? L.latLng(p[0], p[1]) : null).filter(Boolean);
                    if (pts.length < 3) return;
                    const color = elData.color || '#3b82f6';
                    const fillStyle = elData.fillStyle || DEFAULT_GEO_FILL_STYLE;
                    const poly = L.polygon(pts, { ...getGeoShapeStyle(color, fillStyle) });
                    poly._geoType = 'freeform';
                    poly._geoData = { points: pts, color, fillStyle, ...applyImportedDisplayNameProps(elData) };
                    if (['vertical', 'horizontal', 'both'].includes(fillStyle)) poly.once('add', () => scheduleGeoPathFill(poly));
                    poly.bindPopup(window.AppPopups.buildGeoPopupContent(poly, 'freeform', poly._geoData), GEO_POPUP_OPTIONS);
                    poly.on('popupopen', () => {
                        removeGeoResizeHandles();
                        bindGeoCenterMoveHandle(poly, 'freeform');
                        bindGeoPopupHandlers(poly, 'freeform');
                    });
                    poly.on('popupclose', removeGeoResizeHandles);
                    poly._layerId = layer.id;
                    layer.elements.push(poly);
                    layer.group.addLayer(poly);
                } else if (elData.type === 'geo-freehand') {
                    const pts = (elData.points || []).map(p => Array.isArray(p) ? L.latLng(p[0], p[1]) : null).filter(Boolean);
                    if (pts.length < 2) return;
                    const color = elData.color || '#3b82f6';
                    const polyline = L.polyline(pts, { color, weight: 3 });
                    polyline._geoType = 'freehand';
                    polyline._geoData = { points: pts, color, ...applyImportedDisplayNameProps(elData) };
                    wireFreehandPolyline(polyline);
                    polyline._layerId = layer.id;
                    layer.elements.push(polyline);
                    layer.group.addLayer(polyline);
                }
            });
        });

        if (layers.length > 0 && !layers.some(l => l.active)) layers[0].active = true;
        const hasFolderArray = data.folders && Array.isArray(data.folders) && data.folders.length > 0;
        if (hasFolderArray) {
            data.folders.forEach(fd => {
                const folder = createFolder(fd.name || 'Folder');
                folder.collapsed = !!fd.collapsed;
                (fd.layerIds || []).forEach(oldId => {
                    const newId = layerIdMap[oldId] || oldId;
                    const layer = layers.find(l => l.id === newId);
                    if (layer) moveLayerToFolder(layer, folder);
                });
            });
        }

        removeGeoResizeHandles();
        cancelGeoDrawing();
        cancelLineDrawing();
        renderLayersList();
        if (!silent && instructionText) instructionText.innerText = t('inst-imported');
        refreshZoomScaledMapOverlays();
        syncPlacementLayerInteractivity();
    }

    // Legacy shims still used by app.js for internal [lat,lng]-array data
    // shapes (NOT for GeoJSON serialisation). Unchanged v2 semantics.
    function toLatLngArr(ll) { return ll ? [ll.lat, ll.lng] : null; }
    function fromLatLngArr(arr) { return arr && arr.length >= 2 ? L.latLng(arr[0], arr[1]) : null; }

    window.AppIO = {
        init(ctx) { _ctx = ctx; },
        toLatLngArr,
        fromLatLngArr,
        exportSingleElement,
        exportLayerData,
        exportLayersData,
        exportLayersDataFromSelection,
        importLayersData,
    };
})();
