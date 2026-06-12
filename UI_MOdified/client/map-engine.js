/**
 * FILE: map-engine.js
 *
 * Drawing on a map sounds simple until you need lines that snap together, segments you can erase without
 * ruining the whole polyline, and scalloped fronts that merge when you meet an existing end. This module
 * holds that spatial glue: pixel-space distances, hit-testing along segments, and the hooks that attach
 * behaviour to freehand polylines after they exist. It stays aware of layers through getters supplied by
 * app.js so it never becomes a second source of truth for your data model.
 *
 * Core responsibilities:
 *   - Snap new line/TMG points to nearby vertices or edges; stronger magnet for scalloped endpoints
 *   - Eraser: find segment under cursor, split polylines, handle TMG groups and minimum fragment lengths
 *   - tryMergeScallopedFromPoints, wireFreehandPolyline, restorePlainPolylineFromEraseState
 *   - Export tuning constants (thresholds in px) used by the main app for consistent feel
 *
 * Dependencies:
 *   - Leaflet (global L) for map coordinates, layers, polylines, markers
 *   - window.AppPopups.buildGeoPopupContent (and similar) when wiring freehand popups
 *   - _ctx from init(ctx): getMap, getLayers, draw polylines, TMG updaters, style helpers, popup options
 *
 * Bridge name: window.AppMapEngine
 */
(function () {
    'use strict';

    let _ctx = null;

    const ERASER_PIXEL_THRESHOLD = 25;
    const ERASER_PIXEL_WIDTH = 40;
    const ERASER_MIN_FRAGMENT_PX = 12;
    /** Snap line/TMG placement to nearby vertices or edges (screen px) so segments meet cleanly. */
    const LINE_DRAW_SNAP_PX = 10;
    /** Stronger snap to Front Line Border (scalloped) open ends so new segments merge into one graphic. */
    const SCALLOPED_ENDPOINT_MAGNET_PX = 5;

    function distanceAndTToSegment(layerPoint, p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) return { dist: Math.hypot(layerPoint.x - p1.x, layerPoint.y - p1.y), t: 0 };
        let t = ((layerPoint.x - p1.x) * dx + (layerPoint.y - p1.y) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        const px = p1.x + t * dx;
        const py = p1.y + t * dy;
        return { dist: Math.hypot(layerPoint.x - px, layerPoint.y - py), t };
    }

    function latLngBetween(latlng1, latlng2, t) {
        return L.latLng(
            latlng1.lat + (latlng2.lat - latlng1.lat) * t,
            latlng1.lng + (latlng2.lng - latlng1.lng) * t
        );
    }

    function polylinePixelLength(coords) {
        const map = _ctx.getMap();
        let len = 0;
        for (let i = 0; i < coords.length - 1; i++) {
            const a = map.latLngToLayerPoint(coords[i]);
            const b = map.latLngToLayerPoint(coords[i + 1]);
            len += Math.hypot(b.x - a.x, b.y - a.y);
        }
        return len;
    }

    function findSegmentAtPoint(latlng, opts = {}) {
        const map = _ctx.getMap();
        const layers = _ctx.getLayers();
        const onlyFreehand = opts.onlyFreehand === true;
        const lp = map.latLngToLayerPoint(latlng);
        let best = { dist: Infinity, element: null, segmentIndex: -1, layer: null, isPolyline: false, t: 0.5, latlng1: null, latlng2: null };

        for (const layer of layers) {
            if (!layer.visible) continue;
            for (const el of layer.elements) {
                if (L.Polyline && el instanceof L.Polyline) {
                    if (onlyFreehand && el._geoType !== 'freehand') continue;
                    const lls = el.getLatLngs();
                    const flat = (lls.length && lls[0] && Array.isArray(lls[0])) ? lls.flat() : lls;
                    for (let i = 0; i < flat.length - 1; i++) {
                        const p1 = map.latLngToLayerPoint(flat[i]);
                        const p2 = map.latLngToLayerPoint(flat[i + 1]);
                        const { dist, t } = distanceAndTToSegment(lp, p1, p2);
                        if (dist < best.dist && dist < ERASER_PIXEL_THRESHOLD) {
                            best = { dist, element: el, segmentIndex: i, layer, isPolyline: true, t, latlng1: flat[i], latlng2: flat[i + 1] };
                        }
                    }
                } else if (!onlyFreehand && el instanceof L.LayerGroup && el._tmgData?.segments) {
                    const segs = el._tmgData.segments;
                    for (let i = 0; i < segs.length; i++) {
                        const s = segs[i]._tmgData;
                        if (!s) continue;
                        const p1 = map.latLngToLayerPoint(s.latlng1);
                        const p2 = map.latLngToLayerPoint(s.latlng2);
                        const { dist, t } = distanceAndTToSegment(lp, p1, p2);
                        if (dist < best.dist && dist < ERASER_PIXEL_THRESHOLD) {
                            best = { dist, element: el, segmentIndex: i, layer, isPolyline: false, t, latlng1: s.latlng1, latlng2: s.latlng2 };
                        }
                    }
                } else if (!onlyFreehand && el instanceof L.Marker && el._tmgData) {
                    const s = el._tmgData;
                    const p1 = map.latLngToLayerPoint(s.latlng1);
                    const p2 = map.latLngToLayerPoint(s.latlng2);
                    const { dist, t } = distanceAndTToSegment(lp, p1, p2);
                    if (dist < best.dist && dist < ERASER_PIXEL_THRESHOLD) {
                        best = { dist, element: el, segmentIndex: 0, layer, isPolyline: false, t, latlng1: s.latlng1, latlng2: s.latlng2 };
                    }
                }
            }
        }
        return best.dist < ERASER_PIXEL_THRESHOLD ? best : null;
    }

    /** Closest segment on an open polyline (same threshold as findSegmentAtPoint). */
    function findClosestSegmentOnFlatPolyline(latlng, flat) {
        const map = _ctx.getMap();
        if (!flat || flat.length < 2) return null;
        const lp = map.latLngToLayerPoint(latlng);
        let best = { dist: Infinity, segmentIndex: -1, t: 0, latlng1: null, latlng2: null };
        for (let i = 0; i < flat.length - 1; i++) {
            const p1 = map.latLngToLayerPoint(flat[i]);
            const p2 = map.latLngToLayerPoint(flat[i + 1]);
            const { dist, t } = distanceAndTToSegment(lp, p1, p2);
            if (dist < best.dist) {
                best = { dist, segmentIndex: i, t, latlng1: flat[i], latlng2: flat[i + 1] };
            }
        }
        if (best.dist >= ERASER_PIXEL_THRESHOLD) return null;
        return best;
    }

    function snapLatLngForLinePlacement(rawLatLng, excludeElements) {
        const map = _ctx.getMap();
        const layers = _ctx.getLayers();
        const drawLinePolyline = _ctx.getDrawLinePolyline();
        if (!map || !rawLatLng) return rawLatLng;
        // Optional: app supplies circle-X center snap for free-draw workflows (see AppMapEngine.init ctx).
        if (typeof _ctx.getCircleXSnapLatLng === 'function') {
            const circleSnap = _ctx.getCircleXSnapLatLng(rawLatLng);
            if (circleSnap) return circleSnap;
        }
        const lp = map.latLngToLayerPoint(rawLatLng);
        const snapPx = LINE_DRAW_SNAP_PX;
        let bestDist = snapPx + 1;
        let bestLatLng = null;
        const skipEl = excludeElements && typeof excludeElements.has === 'function'
            ? (el) => excludeElements.has(el)
            : () => false;

        function considerPoint(ll) {
            if (!ll || ll.lat == null) return;
            const p = map.latLngToLayerPoint(ll);
            const d = Math.hypot(p.x - lp.x, p.y - lp.y);
            if (d <= snapPx && d < bestDist) {
                bestDist = d;
                bestLatLng = L.latLng(ll.lat, ll.lng);
            }
        }

        function considerSegment(ll1, ll2) {
            if (!ll1 || !ll2) return;
            const p1 = map.latLngToLayerPoint(ll1);
            const p2 = map.latLngToLayerPoint(ll2);
            const { dist, t } = distanceAndTToSegment(lp, p1, p2);
            if (dist <= snapPx && dist < bestDist) {
                bestDist = dist;
                bestLatLng = latLngBetween(ll1, ll2, t);
            }
        }

        function walkOpenPolyline(flat) {
            if (!flat || flat.length < 1) return;
            for (let i = 0; i < flat.length; i++) considerPoint(flat[i]);
            for (let i = 0; i < flat.length - 1; i++) considerSegment(flat[i], flat[i + 1]);
        }

        for (const mapLayer of layers) {
            if (!mapLayer.visible) continue;
            for (const el of mapLayer.elements) {
                if (skipEl(el)) continue;
                if (el === drawLinePolyline) continue;

                if (el instanceof L.Circle) {
                    considerPoint(el.getLatLng());
                    continue;
                }
                if (el instanceof L.Marker && !el._tmgData) {
                    considerPoint(el.getLatLng());
                    continue;
                }
                if (el instanceof L.Marker && el._tmgData) {
                    const s = el._tmgData;
                    considerPoint(s.latlng1);
                    considerPoint(s.latlng2);
                    considerSegment(s.latlng1, s.latlng2);
                    continue;
                }
                if (el instanceof L.LayerGroup && el._tmgData?.isCatkMultiPoint) {
                    const d = el._tmgData;
                    if (d.tailPolyline) {
                        const lls = d.tailPolyline.getLatLngs();
                        const flat = (lls.length && lls[0] && !lls[0].lat) ? lls.flat() : lls;
                        walkOpenPolyline(flat);
                    }
                    if (d.headMarker) considerPoint(d.headMarker.getLatLng());
                    if (d.points?.length) d.points.forEach(considerPoint);
                    continue;
                }
                if (el instanceof L.LayerGroup && el._tmgData?.segments) {
                    for (const seg of el._tmgData.segments) {
                        if (seg instanceof L.Path) {
                            const lls = seg.getLatLngs();
                            const flat = (lls.length && lls[0] && !lls[0].lat) ? lls.flat() : lls;
                            walkOpenPolyline(flat);
                        } else if (seg._tmgData) {
                            const s = seg._tmgData;
                            considerPoint(s.latlng1);
                            considerPoint(s.latlng2);
                            considerSegment(s.latlng1, s.latlng2);
                        }
                    }
                    continue;
                }
                if (el instanceof L.Polygon) {
                    const rings = el.getLatLngs();
                    for (const ring of rings) {
                        if (!ring || !ring.length) continue;
                        for (const v of ring) considerPoint(v);
                        for (let i = 0; i < ring.length - 1; i++) considerSegment(ring[i], ring[i + 1]);
                        if (ring.length >= 2) considerSegment(ring[ring.length - 1], ring[0]);
                    }
                    continue;
                }
                if (el instanceof L.Polyline) {
                    const lls = el.getLatLngs();
                    if (!lls.length) continue;
                    if (lls[0] && lls[0].lat !== undefined) {
                        walkOpenPolyline(lls);
                    } else {
                        for (const part of lls) {
                            if (part && part.length && part[0]?.lat !== undefined) walkOpenPolyline(part);
                        }
                    }
                }
            }
        }

        return bestLatLng || rawLatLng;
    }

    function getScallopedEndpoints(el) {
        if (el instanceof L.Marker && el._tmgData?.typeId === 'scalloped') {
            const d = el._tmgData;
            if (!d.latlng1 || !d.latlng2) return null;
            return { head: d.latlng1, tail: d.latlng2 };
        }
        if (el instanceof L.LayerGroup && el._tmgData?.typeId === 'scalloped' && el._tmgData.segments?.length) {
            const segs = el._tmgData.segments;
            const fd = segs[0]._tmgData;
            const ld = segs[segs.length - 1]._tmgData;
            if (!fd?.latlng1 || !ld?.latlng2) return null;
            return { head: fd.latlng1, tail: ld.latlng2 };
        }
        return null;
    }

    /** Get the session ID of a scalloped element (marker or group). */
    function getScallopedSessionId(el) {
        if (el._tmgData?.sessionId) return el._tmgData.sessionId;
        // Groups store sessionId on child segments, not on the group itself
        if (el instanceof L.LayerGroup && el._tmgData?.segments?.length) {
            for (const seg of el._tmgData.segments) {
                if (seg._tmgData?.sessionId) return seg._tmgData.sessionId;
            }
        }
        return null;
    }

    function findScallopedMergeAt(latlng, px = SCALLOPED_ENDPOINT_MAGNET_PX) {
        const map = _ctx.getMap();
        const getAllElements = _ctx.getAllElements;
        if (!map || !latlng) return null;
        const sessionId = window.freeDrawSignatureSessionId;
        const lp = map.latLngToLayerPoint(latlng);
        let bestD = px + 1;
        let best = null;
        for (const el of getAllElements()) {
            const eps = getScallopedEndpoints(el);
            if (!eps) continue;
            // When a Free Draw session is active, only merge with same-session frontlines
            if (sessionId) {
                const elSid = getScallopedSessionId(el);
                if (elSid !== sessionId) continue;
            }
            for (const end of ['head', 'tail']) {
                const ll = eps[end];
                const p = map.latLngToLayerPoint(ll);
                const d = Math.hypot(p.x - lp.x, p.y - lp.y);
                if (d < bestD) {
                    bestD = d;
                    best = { el, end, latlng: L.latLng(ll.lat, ll.lng) };
                }
            }
        }
        return best;
    }


    function findScallopedMergeAtExcluding(latlng, px, excludeEls) {
        const map = _ctx.getMap();
        const getAllElements = _ctx.getAllElements;
        if (!map || !latlng) return null;
        const skip = (el) => {
            if (excludeEls == null) return false;
            if (excludeEls instanceof Set) return excludeEls.has(el);
            return el === excludeEls;
        };
        const lp = map.latLngToLayerPoint(latlng);
        let bestD = px + 1;
        let best = null;
        for (const el of getAllElements()) {
            if (skip(el)) continue;
            const eps = getScallopedEndpoints(el);
            if (!eps) continue;
            for (const end of ['head', 'tail']) {
                const ll = eps[end];
                const p = map.latLngToLayerPoint(ll);
                const d = Math.hypot(p.x - lp.x, p.y - lp.y);
                if (d < bestD) {
                    bestD = d;
                    best = { el, end, latlng: L.latLng(ll.lat, ll.lng) };
                }
            }
        }
        return best;
    }

    /** Snap while dragging TMG endpoint handles: circle-X centers (sticky) > scalloped ends (magnet) > general geometry snap; excludes the line/group being edited. */
    function snapTmgEndpointHandleLatLng(rawLatLng, excludeEls) {
        const map = _ctx.getMap();
        if (!map || !rawLatLng) return rawLatLng;
        // Circle-X snap wins first so front-line endpoints stay glued to the
        // obstacle center and don't get pulled off by a nearby line endpoint.
        if (typeof _ctx.getCircleXSnapLatLng === 'function') {
            const circleSnap = _ctx.getCircleXSnapLatLng(rawLatLng);
            if (circleSnap) return circleSnap;
        }
        const hit = findScallopedMergeAtExcluding(rawLatLng, SCALLOPED_ENDPOINT_MAGNET_PX, excludeEls);
        if (hit) return hit.latlng;
        const ex = excludeEls instanceof Set ? excludeEls : excludeEls ? new Set([excludeEls]) : null;
        return snapLatLngForLinePlacement(rawLatLng, ex);
    }

    /** Prefer Front Line Border open ends when placing that graphic (then general line snap). */
    function snapLatLngForTmgPlacement(rawLatLng) {
        const typeId = _ctx.getSelectedTmgType() || _ctx.getAddingPointTmgGroup()?._tmgData?.typeId;
        if (typeId === 'scalloped') {
            const hit = findScallopedMergeAt(rawLatLng, SCALLOPED_ENDPOINT_MAGNET_PX);
            if (hit) return hit.latlng;
        }
        return snapLatLngForLinePlacement(rawLatLng);
    }

    function reflagScallopedGroupSegments(segments) {
        const updateTmgLayer = _ctx.updateTmgLayer;
        if (!segments?.length) return;
        const n = segments.length;
        segments.forEach((seg, i) => {
            const d = seg?._tmgData;
            if (!d) return;
            d.useBodyOnly = i < n - 1;
            updateTmgLayer(seg);
        });
    }

    /** Append scalloped sub-segments along one logical edge, using obstacle clipping when available. */
    function pushClippedScallopedSubsegments(group, segmentsOut, latlngA, latlngB, color, opts) {
        const createTmgLayer = _ctx.createTmgLayer;
        const clip = _ctx.clipLatLngSegmentAvoidObstacles;
        let points;
        if (typeof clip === 'function') {
            const clipped = clip(latlngA, latlngB);
            points = (clipped.ok && clipped.points && clipped.points.length >= 2)
                ? clipped.points
                : [latlngA, latlngB];
        } else {
            points = [latlngA, latlngB];
        }
        const sessionId = window.freeDrawSignatureSessionId;
        for (let j = 0; j < points.length - 1; j++) {
            const seg = createTmgLayer(points[j], points[j + 1], 'scalloped', color, true, true, opts);
            if (!seg) continue;
            if (sessionId && seg._tmgData) seg._tmgData.sessionId = sessionId;
            seg.on('click', () => group.openPopup(seg.getLatLng()));
            group.addLayer(seg);
            segmentsOut.push(seg);
        }
    }

    function appendScallopedSegmentsToGroup(group, vertexChain, styleFromData) {
        const {
            renderLayersList, scheduleSaveToStorage,
        } = _ctx;
        const data = group._tmgData;
        const segs = data.segments;
        if (!data || !segs?.length || vertexChain.length < 2) return false;
        const color = styleFromData.color;
        const sw = styleFromData.strokeWidth ?? 4;
        const filled = styleFromData.filled !== false;
        const dashed = !!styleFromData.dashed;
        const opts = { filled, dashed, strokeWidth: sw };
        for (let i = 0; i < vertexChain.length - 1; i++) {
            pushClippedScallopedSubsegments(group, segs, vertexChain[i], vertexChain[i + 1], color, opts);
        }
        reflagScallopedGroupSegments(segs);
        group.setPopupContent(window.AppPopups.buildGroupTmgPopupContent(group));
        const layersListEl = _ctx.getLayersListEl();
        if (layersListEl) renderLayersList();
        scheduleSaveToStorage();
        return true;
    }

    function tryMergeScallopedFromPoints(pts) {
        const {
            replaceSingleTmgWithSegmentGroup, renderLayersList, scheduleSaveToStorage,
        } = _ctx;
        if (!pts || pts.length < 2) return false;
        const px = SCALLOPED_ENDPOINT_MAGNET_PX;
        const ms = findScallopedMergeAt(pts[0], px);
        const me = findScallopedMergeAt(pts[pts.length - 1], px);

        const pickGroup = (hit) => {
            if (!hit) return null;
            if (hit.el instanceof L.LayerGroup && hit.el._tmgData?.segments?.length) return hit.el;
            if (hit.el instanceof L.Marker) return replaceSingleTmgWithSegmentGroup(hit.el);
            return null;
        };

        if (ms) {
            const group = pickGroup(ms);
            if (!group?._tmgData?.segments?.length) return false;
            const data = group._tmgData;
            const segs = data.segments;
            if (ms.end === 'tail') {
                const tailLl = segs[segs.length - 1]._tmgData.latlng2;
                const chain = pts.map(p => L.latLng(p.lat, p.lng));
                chain[0] = L.latLng(tailLl.lat, tailLl.lng);
                return appendScallopedSegmentsToGroup(group, chain, data);
            }
            if (ms.end === 'head') {
                const headLl = segs[0]._tmgData.latlng1;
                const chain = pts.map(p => L.latLng(p.lat, p.lng));
                chain[0] = L.latLng(headLl.lat, headLl.lng);
                if (chain.length < 2) return false;
                const mergeOpts = {
                    filled: data.filled !== false,
                    dashed: !!data.dashed,
                    strokeWidth: data.strokeWidth ?? 4
                };
                const newSegs = [];
                for (let k = chain.length - 1; k >= 1; k--) {
                    pushClippedScallopedSubsegments(group, newSegs, chain[k], chain[k - 1], data.color, mergeOpts);
                }
                data.segments = newSegs.concat(segs);
                reflagScallopedGroupSegments(data.segments);
                group.setPopupContent(window.AppPopups.buildGroupTmgPopupContent(group));
                const layersListEl = _ctx.getLayersListEl();
                if (layersListEl) renderLayersList();
                scheduleSaveToStorage();
                return true;
            }
        }

        if (me) {
            const group = pickGroup(me);
            if (!group?._tmgData?.segments?.length) return false;
            const data = group._tmgData;
            const segs = data.segments;
            if (me.end === 'head') {
                const headLl = segs[0]._tmgData.latlng1;
                const chain = pts.map(p => L.latLng(p.lat, p.lng));
                chain[chain.length - 1] = L.latLng(headLl.lat, headLl.lng);
                const mergeOpts2 = {
                    filled: data.filled !== false,
                    dashed: !!data.dashed,
                    strokeWidth: data.strokeWidth ?? 4
                };
                const newSegs = [];
                for (let i = 0; i < chain.length - 1; i++) {
                    pushClippedScallopedSubsegments(group, newSegs, chain[i], chain[i + 1], data.color, mergeOpts2);
                }
                data.segments = newSegs.concat(segs);
                reflagScallopedGroupSegments(data.segments);
                group.setPopupContent(window.AppPopups.buildGroupTmgPopupContent(group));
                const layersListEl = _ctx.getLayersListEl();
                if (layersListEl) renderLayersList();
                scheduleSaveToStorage();
                return true;
            }
            if (me.end === 'tail') {
                const tailLl = segs[segs.length - 1]._tmgData.latlng2;
                const chain = pts.map(p => L.latLng(p.lat, p.lng));
                chain[chain.length - 1] = L.latLng(tailLl.lat, tailLl.lng);
                return appendScallopedSegmentsToGroup(group, chain, data);
            }
        }

        return false;
    }

    function capturePlainPolylineEraseState(element, isFreehand) {
        const lls = element.getLatLngs();
        const flat = (lls.length && lls[0] && Array.isArray(lls[0])) ? lls.flat() : lls;
        return {
            isFreehand,
            latlngs: flat.map((ll) => ({ lat: ll.lat, lng: ll.lng })),
            color: element.options.color,
            weight: element.options.weight != null ? element.options.weight : (isFreehand ? 3 : 4),
            dashArray: element.options.dashArray,
            opacity: element.options.opacity != null ? element.options.opacity : 1,
            displayName: element._lineDisplayName,
            baseLineWeight: element._baseLineWeight,
            geoColor: isFreehand ? (element._geoData?.color || element.options.color) : undefined
        };
    }

    function restorePlainPolylineFromEraseState(layer, state) {
        const wireTacticalLinePolyline = _ctx.wireTacticalLinePolyline;
        const opts = {
            color: state.color,
            weight: state.weight != null ? state.weight : (state.isFreehand ? 3 : 4),
            dashArray: state.dashArray,
            opacity: state.opacity != null ? state.opacity : 1
        };
        const latlngs = state.latlngs.map((ll) => L.latLng(ll.lat, ll.lng));
        const p = L.polyline(latlngs, opts);
        if (state.displayName) p._lineDisplayName = state.displayName;
        if (state.baseLineWeight != null) p._baseLineWeight = state.baseLineWeight;
        p._layerId = layer.id;
        if (state.isFreehand) {
            p._geoType = 'freehand';
            p._geoData = { points: latlngs, color: state.geoColor || state.color };
            wireFreehandPolyline(p);
        } else {
            wireTacticalLinePolyline(p);
        }
        layer.elements.push(p);
        layer.group.addLayer(p);
        return p;
    }

    function eraseSegmentAtPoint(latlng, opts = {}) {
        const map = _ctx.getMap();
        const layers = _ctx.getLayers();
        const actionHistory = _ctx.getActionHistory();
        const redoHistory = _ctx.getRedoHistory();
        const {
            removeFromLayer, createTmgLayer, addToActiveLayer, wireTacticalLinePolyline,
            renderLayersList, syncPlacementLayerInteractivity, scheduleSaveToStorage,
            tmgMidpoint, updateTmgLayer, allocatePolylineEraseGroupId,
        } = _ctx;

        const hit = findSegmentAtPoint(latlng, opts);
        if (!hit) return false;

        const { element, segmentIndex, t, latlng1, latlng2, isPolyline } = hit;

        if (isPolyline) {
            const layer = layers.find((l) => l.id === element._layerId) || layers.find((l) => l.elements.includes(element));
            if (!layer) return false;

            /** Parent erase group of the segment being cut (so undo restore re-tags correctly; do not use newest-on-stack). */
            const inheritedEraseGroupIdForUndo = element._polylineEraseGroupId != null ? element._polylineEraseGroupId : null;

            const top = actionHistory.length ? actionHistory[actionHistory.length - 1] : null;
            const gestureId = opts.gestureId > 0 ? opts.gestureId : 0;
            const mergeTop = gestureId > 0 && top?.type === 'polylineErase' && top.layer?.id === layer.id
                && top.eraserGestureId === gestureId;

            let flat;
            let segI = segmentIndex;
            let tCut = t;
            let ll1 = latlng1;
            let ll2 = latlng2;
            let beforeState;
            let isFreehand;
            let lineOpts;
            let geoColorForFragments;

            if (mergeTop) {
                beforeState = top.beforeState;
                isFreehand = beforeState.isFreehand === true;
                flat = beforeState.latlngs.map((ll) => L.latLng(ll.lat, ll.lng));
                const seg = findClosestSegmentOnFlatPolyline(latlng, flat);
                if (!seg) return false;
                segI = seg.segmentIndex;
                tCut = seg.t;
                ll1 = seg.latlng1;
                ll2 = seg.latlng2;
                lineOpts = {
                    color: beforeState.color,
                    weight: beforeState.weight != null ? beforeState.weight : (isFreehand ? 3 : 4),
                    dashArray: beforeState.dashArray,
                    opacity: beforeState.opacity != null ? beforeState.opacity : 1
                };
                geoColorForFragments = beforeState.geoColor || beforeState.color;
                top.fragmentElements.forEach((f) => {
                    const fi = layer.elements.indexOf(f);
                    if (fi >= 0) layer.elements.splice(fi, 1);
                    layer.group.removeLayer(f);
                });
                actionHistory.pop();
            } else {
                const lls = element.getLatLngs();
                flat = (lls.length && lls[0] && Array.isArray(lls[0])) ? lls.flat() : lls;
                isFreehand = element._geoType === 'freehand';
                lineOpts = { color: element.options.color, weight: element.options.weight || 4, dashArray: element.options.dashArray };
                if (isFreehand) lineOpts.weight = 3;
                geoColorForFragments = element._geoData?.color || element.options.color;
                beforeState = capturePlainPolylineEraseState(element, isFreehand);
                const hi = actionHistory.findIndex((a) => a.type === 'add' && a.element === element);
                if (hi >= 0) actionHistory.splice(hi, 1);
                removeFromLayer(element, { skipHistorySplice: true });
            }

            const p1 = map.latLngToLayerPoint(ll1);
            const p2 = map.latLngToLayerPoint(ll2);
            const segLenPx = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
            const halfWidth = Math.min(ERASER_PIXEL_WIDTH / 2, segLenPx / 2 - 2);
            const halfWidthT = halfWidth / segLenPx;
            let tMin = tCut - halfWidthT;
            let tMax = tCut + halfWidthT;
            if (tMin < 0 && tMax > 1) {
                tMin = 0;
                tMax = 1;
            } else {
                tMin = Math.max(0, tMin);
                tMax = Math.min(1, tMax);
            }
            const Pminus = latLngBetween(ll1, ll2, tMin);
            const Pplus = latLngBetween(ll1, ll2, tMax);

            const before = [...flat.slice(0, segI + 1), Pminus];
            const after = [Pplus, ...flat.slice(segI + 1)];

            function setupPolylinePopup(p) {
                if (isFreehand) {
                    p._geoType = 'freehand';
                    p._geoData = { points: p.getLatLngs(), color: geoColorForFragments };
                    wireFreehandPolyline(p);
                } else {
                    wireTacticalLinePolyline(p);
                }
            }
            const fragmentSpecs = [];
            if (before.length >= 2 && polylinePixelLength(before) >= ERASER_MIN_FRAGMENT_PX) {
                fragmentSpecs.push({ latlngs: before.map((ll) => ({ lat: ll.lat, lng: ll.lng })) });
            }
            if (after.length >= 2 && polylinePixelLength(after) >= ERASER_MIN_FRAGMENT_PX) {
                fragmentSpecs.push({ latlngs: after.map((ll) => ({ lat: ll.lat, lng: ll.lng })) });
            }
            const fragmentElements = [];
            const eraseGroupId = allocatePolylineEraseGroupId();
            fragmentSpecs.forEach((spec) => {
                const latlngs = spec.latlngs.map((ll) => L.latLng(ll.lat, ll.lng));
                const p = L.polyline(latlngs, lineOpts);
                p._layerId = layer.id;
                p._polylineEraseGroupId = eraseGroupId;
                if (isFreehand) {
                    p._geoData = { points: latlngs, color: geoColorForFragments };
                } else if (beforeState.displayName) {
                    p._lineDisplayName = beforeState.displayName;
                }
                if (!isFreehand && beforeState.baseLineWeight != null) {
                    p._baseLineWeight = beforeState.baseLineWeight;
                }
                setupPolylinePopup(p);
                layer.elements.push(p);
                layer.group.addLayer(p);
                fragmentElements.push(p);
            });
            actionHistory.push({
                type: 'polylineErase',
                layer,
                beforeState,
                fragmentSpecs,
                fragmentElements,
                eraserGestureId: gestureId > 0 ? gestureId : null,
                eraseGroupId,
                inheritedEraseGroupIdForUndo
            });
            redoHistory.length = 0;
            const layersListEl = _ctx.getLayersListEl();
            if (layersListEl) renderLayersList();
            syncPlacementLayerInteractivity();
            scheduleSaveToStorage();
            return true;
        }

        const p1 = map.latLngToLayerPoint(latlng1);
        const p2 = map.latLngToLayerPoint(latlng2);
        const segLenPx = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
        const halfWidth = Math.min(ERASER_PIXEL_WIDTH / 2, segLenPx / 2 - 2);
        const halfWidthT = halfWidth / segLenPx;
        let tMin = t - halfWidthT;
        let tMax = t + halfWidthT;
        if (tMin < 0 && tMax > 1) {
            tMin = 0;
            tMax = 1;
        } else {
            tMin = Math.max(0, tMin);
            tMax = Math.min(1, tMax);
        }

        const Pminus = latLngBetween(latlng1, latlng2, tMin);
        const Pplus = latLngBetween(latlng1, latlng2, tMax);

        if (element instanceof L.Marker && element._tmgData) {
            const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
            if (segLen < ERASER_PIXEL_WIDTH) {
                removeFromLayer(element);
                return true;
            }
            const d = element._tmgData;
            const newSeg1 = createTmgLayer(d.latlng1, Pminus, d.typeId, d.color, false, false, { filled: d.filled, dashed: d.dashed, strokeWidth: d.strokeWidth ?? 4 });
            const newSeg2 = createTmgLayer(Pplus, d.latlng2, d.typeId, d.color, false, false, { filled: d.filled, dashed: d.dashed, strokeWidth: d.strokeWidth ?? 4 });
            if (!newSeg1 || !newSeg2) return false;
            removeFromLayer(element);
            addToActiveLayer(newSeg1);
            addToActiveLayer(newSeg2);
            return true;
        }

        if (element instanceof L.LayerGroup && element._tmgData?.segments) {
            const segs = element._tmgData.segments;
            const seg = segs[segmentIndex];
            const d = seg._tmgData;
            const data = element._tmgData;
            if (tMax - tMin >= 0.99) {
                if (segs.length === 1) {
                    removeFromLayer(element);
                    return true;
                }
                if (segmentIndex === 0) {
                    segs[1]._tmgData.latlng1 = d.latlng1;
                } else {
                    segs[segmentIndex - 1]._tmgData.latlng2 = d.latlng2;
                }
                element.removeLayer(seg);
                segs.splice(segmentIndex, 1);
            } else {
                const newSeg1 = createTmgLayer(d.latlng1, Pminus, data.typeId, data.color, true, true, { filled: data.filled, dashed: data.dashed, strokeWidth: data.strokeWidth ?? 4 });
                const newSeg2 = createTmgLayer(Pplus, d.latlng2, data.typeId, data.color, segmentIndex < segs.length - 1, true, { filled: data.filled, dashed: data.dashed, strokeWidth: data.strokeWidth ?? 4 });
                if (!newSeg1 || !newSeg2) return false;
                newSeg1.on('click', () => element.openPopup(newSeg1.getLatLng()));
                newSeg2.on('click', () => element.openPopup(newSeg2.getLatLng()));
                segs[segmentIndex] = newSeg1;
                segs.splice(segmentIndex + 1, 0, newSeg2);
                element.removeLayer(seg);
                element.addLayer(newSeg1);
                element.addLayer(newSeg2);
            }
            segs.forEach((s) => {
                s.setLatLng(tmgMidpoint(s._tmgData.latlng1, s._tmgData.latlng2));
                updateTmgLayer(s);
            });
            element.setPopupContent(window.AppPopups.buildGroupTmgPopupContent(element));
            return true;
        }
        return false;
    }

    function wireFreehandPolyline(polyline) {
        const {
            applyZoomScaledStrokeToPolyline,
            removeTmgResizeHandle,
            removeGeoResizeHandles,
            bindGeoCenterMoveHandle,
            bindGeoPopupHandlers,
            createPlainLineEndpointHandles,
            getActivePlainLineEndpointHandles,
            removePlainLineEndpointHandles,
            GEO_POPUP_OPTIONS,
        } = _ctx;
        if (polyline._baseLineWeight == null) polyline._baseLineWeight = polyline.options?.weight ?? 3;
        applyZoomScaledStrokeToPolyline(polyline);
        polyline.bindPopup(window.AppPopups.buildGeoPopupContent(polyline, 'freehand', polyline._geoData), GEO_POPUP_OPTIONS);
        polyline.on('popupopen', () => {
            removeTmgResizeHandle();
            removeGeoResizeHandles();
            bindGeoCenterMoveHandle(polyline, 'freehand');
            bindGeoPopupHandlers(polyline, 'freehand');
            createPlainLineEndpointHandles(polyline);
        });
        polyline.on('popupclose', () => {
            removeGeoResizeHandles();
            const h = getActivePlainLineEndpointHandles();
            if (h && h.polyline === polyline) {
                removePlainLineEndpointHandles();
            }
        });
    }

    window.AppMapEngine = {
        init(ctx) { _ctx = ctx; },
        ERASER_PIXEL_THRESHOLD,
        ERASER_PIXEL_WIDTH,
        ERASER_MIN_FRAGMENT_PX,
        LINE_DRAW_SNAP_PX,
        SCALLOPED_ENDPOINT_MAGNET_PX,
        distanceAndTToSegment,
        latLngBetween,
        snapLatLngForLinePlacement,
        snapTmgEndpointHandleLatLng,
        snapLatLngForTmgPlacement,
        tryMergeScallopedFromPoints,
        eraseSegmentAtPoint,
        wireFreehandPolyline,
        restorePlainPolylineFromEraseState,
    };
})();
