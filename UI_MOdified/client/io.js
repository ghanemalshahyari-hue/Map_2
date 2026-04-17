/**
 * FILE: io.js
 *
 * When you save a plan or share a layer file, this module is doing the translation: it walks your live
 * Leaflet layers and turns markers, polylines, TMG groups, and geographic shapes into plain JSON, and
 * the other way around on import. The goal is a stable, version-friendly snapshot you can store or email
 * without dragging the whole app state along. app.js passes a fat context into init() so these functions
 * can recreate geometry using the same helpers as the interactive map (debounced saves stay in app.js).
 *
 * Core responsibilities:
 *   - Export/import LatLng helpers (arrays vs Leaflet objects) for compact JSON
 *   - Serialise single elements and whole layers: symbols, TMG, text labels, geo tools, polylines
 *   - importLayersData: rebuild layers, folders, and map objects from saved JSON (merge or replace flows)
 *
 * Dependencies:
 *   - Leaflet (global L) for LatLng, Polyline, Marker, LayerGroup types during import/export
 *   - _ctx from init(ctx): dozens of app closures (createLayer, wireFreehandPolyline, style defaults, etc.)
 *
 * Bridge name: window.AppIO
 */
(function () {
    'use strict';

    let _ctx = null;

    /** Convert a Leaflet LatLng to a compact [lat, lng] array. */
    function toLatLngArr(ll) {
        return ll ? [ll.lat, ll.lng] : null;
    }

    /** Restore a [lat, lng] array to a Leaflet LatLng. */
    function fromLatLngArr(arr) {
        return arr && arr.length >= 2 ? L.latLng(arr[0], arr[1]) : null;
    }

    function fromCatkArrowParams(raw) {
        if (!raw) return null;
        const tip = fromLatLngArr(raw.tip);
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

    /** Serialise a single map element to a plain JSON object. */
    function exportSingleElement(el) {
        const { TEXT_LABEL_COLOR_DEFAULT, TEXT_LABEL_FONT_SIZE_DEFAULT, DEFAULT_GEO_FILL_STYLE, assignDisplayNameOnExport } = _ctx;
        if (el._isTextLabel) {
            const o = { type: 'text', latlng: toLatLngArr(el.getLatLng()), text: el._textContent, color: el._textColor || TEXT_LABEL_COLOR_DEFAULT, fontSize: el._textFontSize ?? TEXT_LABEL_FONT_SIZE_DEFAULT };
            if (el._textRotationDeg) o.rotationDeg = el._textRotationDeg;
            return o;
        }
        if (el._geoType === 'distance' && el._geoData) {
            const d = el._geoData;
            return assignDisplayNameOnExport({ type: 'geo-distance', points: (d.points || el.getLatLngs?.() || []).map(toLatLngArr), distanceKm: d.distanceKm, color: d.color || '#3b82f6', pointLabels: d.pointLabels || [] }, d.displayName);
        }
        if (el._geoType === 'range-circle' && el._geoData) {
            const d = el._geoData;
            return assignDisplayNameOnExport({ type: 'geo-range-circle', center: toLatLngArr(d.center), radiusKm: d.radiusKm, color: d.color || '#3b82f6', fillStyle: d.fillStyle || DEFAULT_GEO_FILL_STYLE }, d.displayName);
        }
        if (el._geoType === 'range-sector' && el._geoData) {
            const d = el._geoData;
            return assignDisplayNameOnExport({ type: 'geo-range-sector', center: toLatLngArr(d.center), radiusKm: d.radiusKm, bearing: d.bearing, aperture: d.aperture, color: d.color || '#3b82f6', fillStyle: d.fillStyle || DEFAULT_GEO_FILL_STYLE }, d.displayName);
        }
        if (el._geoType === 'circle-2pt' && el._geoData) {
            const d = el._geoData;
            return assignDisplayNameOnExport({ type: 'geo-circle-2pt', center: toLatLngArr(d.center), radiusKm: d.radiusKm, color: d.color || '#3b82f6', fillStyle: d.fillStyle || DEFAULT_GEO_FILL_STYLE }, d.displayName);
        }
        if (el._geoType === 'semi-circle' && el._geoData) {
            const d = el._geoData;
            return assignDisplayNameOnExport({ type: 'geo-semi-circle', center: toLatLngArr(d.center), radiusKm: d.radiusKm, bearing: d.bearing, color: d.color || '#3b82f6', fillStyle: d.fillStyle || DEFAULT_GEO_FILL_STYLE }, d.displayName);
        }
        if (el._geoType === 'rectangle' && el._geoData) {
            const d = el._geoData;
            const lls = el.getLatLngs?.();
            const ring = (lls && lls[0]) ? lls[0] : (d.corners || []);
            const corners = ring.map(p => toLatLngArr(p && p.lat !== undefined ? p : (Array.isArray(p) ? L.latLng(p[0], p[1]) : null)));
            return assignDisplayNameOnExport({ type: 'geo-rectangle', corners: corners.filter(Boolean), color: d.color || '#3b82f6', fillStyle: d.fillStyle || DEFAULT_GEO_FILL_STYLE }, d.displayName);
        }
        if (el._geoType === 'oval' && el._geoData) {
            const d = el._geoData;
            const ring = d.corners || [];
            const corners = ring.map(p => toLatLngArr(p && p.lat !== undefined ? p : (Array.isArray(p) ? L.latLng(p[0], p[1]) : null)));
            return assignDisplayNameOnExport({ type: 'geo-oval', corners: corners.filter(Boolean), color: d.color || '#3b82f6', fillStyle: d.fillStyle || DEFAULT_GEO_FILL_STYLE }, d.displayName);
        }
        if (el._geoType === 'minefield' && el._geoData) {
            const d = el._geoData;
            const lls = el.getLatLngs?.();
            const ring = (lls && lls[0]) ? lls[0] : (d.corners || []);
            const corners = ring.map(p => toLatLngArr(p && p.lat !== undefined ? p : (Array.isArray(p) ? L.latLng(p[0], p[1]) : null)));
            return assignDisplayNameOnExport({ type: 'geo-minefield', corners: corners.filter(Boolean), color: d.color || '#3b82f6', mineType: d.mineType || 'ap' }, d.displayName);
        }
        if (el._geoType === 'polygon' && el._geoData) {
            const d = el._geoData;
            return assignDisplayNameOnExport({ type: 'geo-polygon', center: toLatLngArr(d.center), radiusKm: d.radiusKm, sides: d.sides, rotation: d.rotation, color: d.color || '#3b82f6', fillStyle: d.fillStyle || DEFAULT_GEO_FILL_STYLE }, d.displayName);
        }
        if (el._geoType === 'freeform' && el._geoData) {
            const d = el._geoData;
            const lls = el.getLatLngs?.();
            const ring = (lls && lls[0]) ? lls[0] : (d.points || []);
            const pts = ring.map(p => toLatLngArr(p && p.lat !== undefined ? p : (Array.isArray(p) ? L.latLng(p[0], p[1]) : null)));
            return assignDisplayNameOnExport({ type: 'geo-freeform', points: pts.filter(Boolean), color: d.color || '#3b82f6', fillStyle: d.fillStyle || DEFAULT_GEO_FILL_STYLE }, d.displayName);
        }
        if (el._geoType === 'freehand' && el._geoData) {
            const d = el._geoData;
            const pts = (el.getLatLngs?.() || d.points || []).map(p => toLatLngArr(p && p.lat !== undefined ? p : (Array.isArray(p) ? L.latLng(p[0], p[1]) : null)));
            return assignDisplayNameOnExport({ type: 'geo-freehand', points: pts.filter(Boolean), color: d.color || '#3b82f6' }, d.displayName);
        }
        if (el instanceof L.Polyline) {
            const lls = el.getLatLngs();
            const flat = (lls.length && lls[0] && Array.isArray(lls[0])) ? lls.flat() : lls;
            return assignDisplayNameOnExport({ type: 'polyline', latlngs: flat.map(toLatLngArr), color: el.options.color || '#3b82f6', weight: el._baseLineWeight != null ? el._baseLineWeight : (el.options.weight || 4), dashArray: el.options.dashArray }, el._lineDisplayName);
        }
        if (el instanceof L.LayerGroup && el._tmgData?.isCatkMultiPoint) {
            const pts = (el._tmgData.points || []).map(toLatLngArr);
            const catkOut = { type: 'tmg-group', points: pts, typeId: el._tmgData.typeId, color: el._tmgData.color || '#3b82f6', strokeWidth: el._tmgData.strokeWidth ?? 4, catkMultiPoint: true, dashed: !!el._tmgData.dashed };
            if (el._tmgData.catkAutoJunction) catkOut.catkAutoJunction = true;
            if (el._tmgData.preserveLegacyPoints) catkOut.preserveLegacyPoints = true;
            if (isFinite(Number(el._tmgData.legacyBodyWidthKm)) && Number(el._tmgData.legacyBodyWidthKm) > 0) catkOut.legacyBodyWidthKm = Number(el._tmgData.legacyBodyWidthKm);
            if (el._tmgData.lockedArrowParams) {
                catkOut.lockedArrowParams = {
                    tip: toLatLngArr(el._tmgData.lockedArrowParams.tip),
                    directionDeg: el._tmgData.lockedArrowParams.directionDeg,
                    bodyWidthKm: el._tmgData.lockedArrowParams.bodyWidthKm,
                    headWidthKm: el._tmgData.lockedArrowParams.headWidthKm,
                    headLengthKm: el._tmgData.lockedArrowParams.headLengthKm,
                    neckOffsetKm: el._tmgData.lockedArrowParams.neckOffsetKm,
                    tailLengthKm: el._tmgData.lockedArrowParams.tailLengthKm
                };
            }
            if (el._tmgData.arrowParams) {
                catkOut.arrowParams = {
                    tip: toLatLngArr(el._tmgData.arrowParams.tip),
                    directionDeg: el._tmgData.arrowParams.directionDeg,
                    bodyWidthKm: el._tmgData.arrowParams.bodyWidthKm,
                    headWidthKm: el._tmgData.arrowParams.headWidthKm,
                    headLengthKm: el._tmgData.arrowParams.headLengthKm,
                    neckOffsetKm: el._tmgData.arrowParams.neckOffsetKm,
                    tailLengthKm: el._tmgData.arrowParams.tailLengthKm
                };
                catkOut.parametricArrow = true;
            }
            return assignDisplayNameOnExport(catkOut, el._tmgData.displayName);
        }
        if (el instanceof L.LayerGroup && el._tmgData?.segments) {
            const segs = el._tmgData.segments;
            const pts = [toLatLngArr(segs[0]._tmgData.latlng1)];
            segs.forEach(s => pts.push(toLatLngArr(s._tmgData.latlng2)));
            return assignDisplayNameOnExport({ type: 'tmg-group', points: pts, typeId: el._tmgData.typeId, color: el._tmgData.color || '#3b82f6', filled: el._tmgData.filled !== false, dashed: el._tmgData.dashed || false, strokeWidth: el._tmgData.strokeWidth ?? 4 }, el._tmgData.displayName);
        }
        if (el instanceof L.Marker && el._tmgData) {
            const d = el._tmgData;
            return assignDisplayNameOnExport({ type: 'tmg-single', latlng1: toLatLngArr(d.latlng1), latlng2: toLatLngArr(d.latlng2), typeId: d.typeId, color: d.color || '#3b82f6', filled: d.filled !== false, dashed: d.dashed || false, strokeWidth: d.strokeWidth ?? 4, sessionId: d.sessionId || undefined }, d.displayName);
        }
        if (el instanceof L.Marker) {
            const out = { type: 'symbol', latlng: toLatLngArr(el.getLatLng()), sidc: el._sidc || '10031000001200000000', textModifiers: el._textModifiers || {}, statusKey: el._statusKey };
            if (el._symbolRotationDeg) out.symbolRotationDeg = el._symbolRotationDeg;
            const circles = el._rangeCircles || [];
            if (circles.length) out.rangeCircles = circles.map(c => ({ ...c._rangeData }));
            const sectors = el._rangeSectors || [];
            if (sectors.length) out.rangeSectors = sectors.map(s => ({ ...s._rangeSectorData }));
            return out;
        }
        return null;
    }

    /** Serialise a single layer object (name, visibility, elements). */
    function exportLayerData(layer) {
        return {
            name: layer.name,
            visible: layer.visible,
            active: layer.active,
            elements: layer.elements.map(el => exportSingleElement(el)).filter(Boolean)
        };
    }

    /** Serialise the full layer/folder tree to a JSON string. */
    function exportLayersData() {
        const { getLayers, getFolders } = _ctx;
        const layers = getLayers();
        const folders = getFolders();
        const data = {
            version: 2,
            folders: folders.map(f => ({
                id: f.id, name: f.name,
                layerIds: f.layerIds.filter(lid => layers.some(l => l.id === lid)),
                collapsed: f.collapsed
            })),
            layers: layers.map(layer => { const d = exportLayerData(layer); d.id = layer.id; return d; })
        };
        return JSON.stringify(data, null, 2);
    }

    /** Subset of layers; folders only lists exported layers so layout restores on import. */
    function exportLayersDataFromSelection(selectedLayerIds) {
        const { getLayers, getFolders } = _ctx;
        const layers = getLayers();
        const folders = getFolders();
        const sel = new Set(selectedLayerIds);
        const exportedLayers = layers.filter(l => sel.has(l.id)).map(layer => { const d = exportLayerData(layer); d.id = layer.id; return d; });
        const exportedFolders = [];
        folders.forEach(f => {
            const idsInFolder = f.layerIds.filter(lid => sel.has(lid));
            if (idsInFolder.length === 0) return;
            exportedFolders.push({ id: f.id, name: f.name, collapsed: !!f.collapsed, layerIds: [...idsInFolder] });
        });
        return JSON.stringify({ version: 2, folders: exportedFolders, layers: exportedLayers }, null, 2);
    }

    /**
     * Reconstruct the full layer/folder/element tree from a JSON string.
     * Supports merge mode (append) or full replace. Handles every element type.
     * All app.js dependencies are received through the _ctx object set by init().
     */
    function importLayersData(jsonStr, silent, merge) {
        const {
            // State getters — return live references so in-place mutations propagate
            getLayers, getFolders, getActionHistory, getRedoHistory,
            getMap, getInstructionText, resetIdCounters,
            // Constants
            TEXT_LABEL_COLOR_DEFAULT, TEXT_LABEL_FONT_SIZE_DEFAULT, DEFAULT_GEO_FILL_STYLE,
            CATK_AUTO_JUNCTION_T, GEO_POPUP_OPTIONS,
            // Core layer/element management
            cleanupElementDecorations, createLayer, createFolder, moveLayerToFolder,
            // Text labels
            buildTextLabelIcon, buildTextLabelPopupContent, bindTextLabelPopupHandlers,
            // Layer operations
            addToActiveLayer, removeFromLayer, wireTacticalLinePolyline,
            // Counterattack / multi-point tactical graphics
            catkInterpOnTailAxis, catkBuildTailPathFromPoints, catkHitPolylineOptions,
            createCatkUnifiedMarker, createParametricCatkGroup, createLegacyCatkGroup, catkDeriveArrowParamsFromLegacyPoints,
            resolveCatkMultiPointDashed, applyImportedDisplayNameProps,
            buildCatkTailPopupContent, onCatkGroupPopupOpen, removeTmgResizeHandle,
            // Tactical map graphics
            createTmgLayer, showTmgGroupPopupSelectionUi, scheduleTmgPopupBind,
            // Symbols
            createSymbolFromData, addRangeCircleToMarker, addRangeSectorToMarker,
            // Geo distance / shapes
            dedupeConsecutiveDistancePointsMutate, createDistanceWaypointMarkers,
            removeGeoResizeHandles, bindGeoCenterMoveHandle, bindGeoPopupHandlers,
            createGeoResizeHandle, syncGeoShapeHandlesToGeometry, getGeoShapeStyle,
            scheduleGeoPathFill, latLngAtBearing, createSectorPolygon, createRegularPolygon,
            createEllipseRingFromBoundingCorners,
            // Minefield
            getMinefieldStyle, applyMinefieldFill, addMinefieldDecorations, bindMinefieldResizeHandles,
            // Freehand
            wireFreehandPolyline,
            // Post-import cleanup and rendering
            cancelGeoDrawing, cancelLineDrawing, renderLayersList,
            refreshZoomScaledMapOverlays, syncPlacementLayerInteractivity, scheduleSaveToStorage,
        } = _ctx;

        // Grab live mutable state references once; arrays are mutated in-place
        const layers = getLayers();
        const folders = getFolders();
        const actionHistory = getActionHistory();
        const redoHistory = getRedoHistory();
        const map = getMap();
        const instructionText = getInstructionText();

        // Cross-module helpers accessible directly from window globals
        const { TACTICAL_GRAPHICS } = window.AppSymbology;
        const { isCounterattackStyleMultiPointType } = window.AppGraphics;
        const { trimmedDisplayNameFrom, totalDistanceKm, haversineDistance } = window.AppUtils;

        let data;
        try {
            data = JSON.parse(jsonStr);
        } catch (e) {
            if (!silent) alert('Invalid JSON file.');
            return;
        }
        if (!data.layers || !Array.isArray(data.layers)) {
            if (!silent) alert('Invalid format: missing layers array.');
            return;
        }
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
                    const latlng = fromLatLngArr(elData.latlng);
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
                } else if (elData.type === 'polyline') {
                    const latlngs = (elData.latlngs || []).map(fromLatLngArr).filter(Boolean);
                    if (latlngs.length < 2) return;
                    const opts = { color: elData.color || '#3b82f6', weight: elData.weight || 4, dashArray: elData.dashArray };
                    const polyline = L.polyline(latlngs, opts);
                    polyline._baseLineWeight = elData.weight != null ? elData.weight : 4;
                    wireTacticalLinePolyline(polyline);
                    const lineDn = trimmedDisplayNameFrom(elData.displayName);
                    if (lineDn) polyline._lineDisplayName = lineDn;
                    polyline._layerId = layer.id;
                    layer.elements.push(polyline);
                    layer.group.addLayer(polyline);
                } else if (elData.type === 'tmg-single') {
                    const latlng1 = fromLatLngArr(elData.latlng1);
                    const latlng2 = fromLatLngArr(elData.latlng2);
                    if (!latlng1 || !latlng2) return;
                    let tid = elData.typeId || 'attack';
                    if (tid === 'terrain-map') tid = 'counterattack';
                    if (isCounterattackStyleMultiPointType(tid)) {
                        const arrowParams = fromCatkArrowParams(elData.arrowParams)
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
                    const pts = (elData.points || []).map(fromLatLngArr).filter(Boolean);
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
                        const importedArrowParams = fromCatkArrowParams(elData.arrowParams);
                        const useLegacyPoints = !!elData.preserveLegacyPoints && !importedArrowParams;
                        const importedLockedArrowParams = fromCatkArrowParams(elData.lockedArrowParams);
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
                            const arrowParams = fromCatkArrowParams(elData.arrowParams)
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
                    const pts = (elData.points || []).map(fromLatLngArr).filter(Boolean);
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
                    const center = fromLatLngArr(elData.center);
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
                    const center = fromLatLngArr(elData.center);
                    if (!center) return;
                    const radiusKm = elData.radiusKm || 5;
                    const bearing = elData.bearing || 0;
                    const aperture = elData.aperture || 90;
                    const color = elData.color || '#3b82f6';
                    const fillStyle = elData.fillStyle || DEFAULT_GEO_FILL_STYLE;
                    const points = createSectorPolygon(center, radiusKm, bearing, aperture);
                    const sector = L.polygon(points, { ...getGeoShapeStyle(color, fillStyle) });
                    sector._geoType = 'range-sector';
                    sector._geoData = { center, radiusKm, bearing, aperture, color, fillStyle, ...applyImportedDisplayNameProps(elData) };
                    if (['vertical', 'horizontal', 'both'].includes(fillStyle)) sector.once('add', () => scheduleGeoPathFill(sector));
                    sector.bindPopup(window.AppPopups.buildGeoPopupContent(sector, 'range-sector', sector._geoData), GEO_POPUP_OPTIONS);
                    sector.on('popupopen', () => {
                        removeGeoResizeHandles();
                        const d = sector._geoData;
                        const handleLat = latLngAtBearing(d.center, d.radiusKm, d.bearing);
                        createGeoResizeHandle(handleLat, (newLat, isFinal) => {
                            const distM = haversineDistance(d.center.lat, d.center.lng, newLat.lat, newLat.lng);
                            d.radiusKm = parseFloat((distM / 1000).toFixed(2));
                            const pts = createSectorPolygon(d.center, d.radiusKm, d.bearing, d.aperture);
                            sector.setLatLngs(pts);
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
                    const center = fromLatLngArr(elData.center);
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
                    const center = fromLatLngArr(elData.center);
                    if (!center) return;
                    const radiusKm = elData.radiusKm || 5;
                    const bearing = elData.bearing || 0;
                    const color = elData.color || '#3b82f6';
                    const fillStyle = elData.fillStyle || DEFAULT_GEO_FILL_STYLE;
                    const points = createSectorPolygon(center, radiusKm, bearing, 180);
                    const sector = L.polygon(points, { ...getGeoShapeStyle(color, fillStyle) });
                    sector._geoType = 'semi-circle';
                    sector._geoData = { center, radiusKm, bearing, aperture: 180, color, fillStyle, ...applyImportedDisplayNameProps(elData) };
                    if (['vertical', 'horizontal', 'both'].includes(fillStyle)) sector.once('add', () => scheduleGeoPathFill(sector));
                    sector.bindPopup(window.AppPopups.buildGeoPopupContent(sector, 'semi-circle', sector._geoData), GEO_POPUP_OPTIONS);
                    sector.on('popupopen', () => {
                        removeGeoResizeHandles();
                        const d = sector._geoData;
                        const handleLat = latLngAtBearing(d.center, d.radiusKm, d.bearing);
                        createGeoResizeHandle(handleLat, (newLat, isFinal) => {
                            const distM = haversineDistance(d.center.lat, d.center.lng, newLat.lat, newLat.lng);
                            d.radiusKm = parseFloat((distM / 1000).toFixed(2));
                            const pts = createSectorPolygon(d.center, d.radiusKm, d.bearing, 180);
                            sector.setLatLngs(pts);
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
                    const corners = (elData.corners || []).map(c => fromLatLngArr(Array.isArray(c) ? c : null)).filter(Boolean);
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
                    const corners = (elData.corners || []).map(c => fromLatLngArr(Array.isArray(c) ? c : null)).filter(Boolean);
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
                    const corners = (elData.corners || []).map(c => fromLatLngArr(Array.isArray(c) ? c : null)).filter(Boolean);
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
                    const center = fromLatLngArr(elData.center);
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
                    const pts = (elData.points || []).map(p => fromLatLngArr(Array.isArray(p) ? p : null)).filter(Boolean);
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
                    const pts = (elData.points || []).map(p => fromLatLngArr(Array.isArray(p) ? p : null)).filter(Boolean);
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
        } else if (data.folderName && !merge) {
            const folder = createFolder(data.folderName);
            layers.forEach(l => moveLayerToFolder(l, folder));
        } else if (data.folderName && merge) {
            const folder = createFolder(data.folderName);
            Object.values(layerIdMap).forEach(newId => {
                const layer = layers.find(l => l.id === newId);
                if (layer) moveLayerToFolder(layer, folder);
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
