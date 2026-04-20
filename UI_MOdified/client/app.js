
    // Must be defined after pointInObstaclePolygons
    /**
     * If a point is inside any obstacle, project it to the nearest point outside the obstacle along the segment from the center.
     * If already outside, returns the point unchanged.
     */
    function projectPointOutsideObstacles(center, pt) {
        if (!pointInObstaclePolygons(pt.lng, pt.lat)) return pt;
        // Step from center toward pt in small increments until outside
        const steps = 100;
        let best = pt;
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const testPt = latLngAlongSegment(center, pt, t);
            if (!pointInObstaclePolygons(testPt.lng, testPt.lat)) {
                best = testPt;
                break;
            }
        }
        return best;
    }
/**
 * FILE: app.js
 *
 * This is the heart of the tactical map workspace: once the DOM is ready, it stands up the Leaflet map,
 * basemaps, layers, drawing tools, selection, undo/redo, and every sidebar control you see in the UI.
 * Think of it as the conductor — it owns the live state (layers, folders, modes) while smaller modules
 * handle focused jobs like serialisation, popups, or line snapping. It is long on purpose: most user-facing
 * behaviour threads through here so you can follow one file from click to map update.
 *
 * Core responsibilities:
 *   - Initialise map, controls, tile layers (offline MBTiles + online fallbacks), and layer/folder UI
 *   - Own authoritative state: layers, elements, drawing modes, selection, history, symbology placement
 *   - Wire event handlers, popups, keyboard shortcuts, import/export triggers, and persistence scheduling
 *   - Call init() on bridge modules (IO, popups, map engine, chat) with a rich context object
 *
 * Dependencies:
 *   - Leaflet (global L), milsymbol, lib/* scripts, vendor/sidc-picker; DOM from app.html
 *   - window.AppConfig, window.AppIdentity, window.AppSymbology, window.AppUtils, window.AppGraphics
 *   - window.AppIO, window.AppPopups, window.AppMapEngine (after their init() runs), window.AppChat.init()
 *
 * Bridge name: (none — composition root). Reads from App* bridges above; invokes AppPopups.init,
 *   AppMapEngine.init, AppIO.init, and AppChat.init() with closures from this file.
 */
document.addEventListener('DOMContentLoaded', () => {

    // --- HEADER BUTTON HIGHLIGHT LOGIC ---
    // List of header button IDs to manage
    const headerButtonIds = [
        'theme-toggle-btn',
        'distance-unit-toggle-btn',
        'pan-inspect-m-btn',
        'text-tool-t-btn',
        'freehand-f-btn',
        'free-draw-signature-btn',
        'select-area-header-btn',
        'eraser-e-btn',
        'lang-toggle-btn',
        'chat-toggle-btn',
        'top-favorites-btn'
    ];

    function clearHeaderButtonActive() {
        headerButtonIds.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.classList.remove('active');
        });
    }

    headerButtonIds.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', function (e) {
                // If button is disabled, do nothing
                if (btn.disabled) return;
                clearHeaderButtonActive();
                btn.classList.add('active');
            });
        }
    });

    // Config — from config.js
    const CHAT_CONFIG = window.AppConfig.CHAT_CONFIG;
    const { MAP_DEFAULTS } = window.AppConfig;

    // Identity helpers — from identity.js
    const { getCurrentUserRole, isChatGloballyEnabled, isChatOnline } = window.AppIdentity;

    // Symbology data — from symbology.js
    const { TACTICAL_GRAPHICS, TMG_COLOR_PRESETS, STATUS_OPTIONS, FALLBACK_SIDC_FAVORITES } = window.AppSymbology;

    // Map data serialisation — from io.js (AppIO.init() called later after constants are defined)
    const { toLatLngArr, fromLatLngArr, exportSingleElement, exportLayerData, exportLayersData, exportLayersDataFromSelection, importLayersData } = window.AppIO;

    // Popup HTML builders — from popups.js (AppPopups.init() called later after helper functions are defined)
    const { buildGeoPopupContent, buildSymbolPopupContent, buildGroupTmgPopupContent, bindGroupTmgPopupHandlers } = window.AppPopups;

    // Line snap, eraser, scalloped merge, freehand wiring — from map-engine.js (AppMapEngine.init() after wireTacticalLinePolyline)
    const {
        distanceAndTToSegment,
        snapLatLngForLinePlacement,
        snapTmgEndpointHandleLatLng,
        snapLatLngForTmgPlacement,
        tryMergeScallopedFromPoints,
        eraseSegmentAtPoint,
        wireFreehandPolyline,
        restorePlainPolylineFromEraseState,
    } = window.AppMapEngine;

    // Graphic math & SVG builders — from graphics.js
    const {
        getMinefieldLabelText, buildScallopedPath,
        isCounterattackStyleMultiPointType, counterattackStyleInnerLabel, instPlaceTmgKeyForTypeId,
        catkSampleCatmullRomSpine, catkOffsetOpenPolyline, catkPolylineToPathD, catkSteppedArrowHeadCornersAbs,
        buildParametricArrowGeometry, buildParametricArrowOverlayRect,
    } = window.AppGraphics;

    // Pure utilities — from utils.js
    const {
        haversineDistance, totalDistanceKm, closedRingPerimeterKm,
        bearingDegrees, normalizeBearingDeg,
        kmToNauticalMiles, nauticalMilesToKm,
        getMapScaleDenominatorAtZoom,
        decimalToDmsParts,
        normalizeSidcInput, extractSidcFromText,
        getSidcStatus, setSidcStatus,
        trimmedDisplayNameFrom, deepCloneJsonSafe, catkCubicBezierScalar,
        normalizeAngleDeltaRad,
    } = window.AppUtils;

    // Prevent zoom +/- buttons from scrolling/jumping the page (Leaflet focuses map container, browser scrolls to it)
    L.Control.prototype._refocusOnMap = function () { /* no-op: prevents focus() from scrolling page into view */ };

    // --- MAP INITIALIZATION ---
    // Make sure we define the marker images path so it works perfectly offline
    L.Icon.Default.imagePath = 'lib/images/';

    // Max zoom corresponds to scale 1:5000 (zoom level ~17 at typical latitudes)
    const map = L.map('map', {
        zoomControl: false, // Move to bottom right
        doubleClickZoom: false,
        maxZoom: MAP_DEFAULTS.maxZoom
    }).setView([MAP_DEFAULTS.initialLat, MAP_DEFAULTS.initialLng], MAP_DEFAULTS.initialZoom);

    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);

    L.Popup.prototype.options.offset = [0, 0];

    // Increase drag threshold so small mouse movements don't trigger accidental drags
    if (L.Draggable && L.Draggable.prototype && L.Draggable.prototype.options) {
        L.Draggable.prototype.options.clickTolerance = 12;
    }

    // Block mousedown on empty space inside TMG icon bounding boxes.
    // Only allow interaction when clicking on the actual shape (SVG path/line/circle/etc.)
    // or an image. This prevents moving objects by clicking empty space in their bounding box.
    var _tmgShapeTags = { path:1, line:1, circle:1, rect:1, polyline:1, polygon:1, text:1, img:1, tspan:1 };
    map.getContainer().addEventListener('pointerdown', function(e) {
        var el = e.target;
        var tag = el.tagName && el.tagName.toLowerCase();
        // If click is on an SVG shape element, allow it (drag/click the shape)
        if (_tmgShapeTags[tag]) return;
        // Check if click landed on a tmg-icon or catk-unified-tmg container's empty space
        var icon = el.closest && el.closest('.tmg-icon, .catk-unified-tmg');
        if (icon) {
            // Clicked empty area inside icon bounding box — block so it doesn't start drag
            e.stopImmediatePropagation();
            e.preventDefault();
        }
    }, true);
    L.Popup.prototype.options.autoPan = false;

    const popupAnchor = document.getElementById('popup-anchor');
    map.on('popupopen', function (e) {
        const container = e.popup._container;
        if (!container || !popupAnchor) return;
        container._origParent = container.parentNode;
        popupAnchor.appendChild(container);
    });
    map.on('popupclose', function (e) {
        const container = e.popup._container;
        if (!container) return;
        if (container._origParent && container.parentNode === popupAnchor) {
            container._origParent.appendChild(container);
        }
        container._origParent = null;
    });

    // Prevent zoom control from causing page scroll
    const mapContainer = map.getContainer();
    const blockZoomFocus = () => {
        mapContainer.querySelectorAll('.leaflet-control-zoom a').forEach(el => {
            el.setAttribute('tabindex', '-1');
        });
    };
    blockZoomFocus();
    new MutationObserver(blockZoomFocus).observe(mapContainer, { childList: true, subtree: true });

    mapContainer.addEventListener('click', (e) => {
        const target = e.target?.closest?.('a');
        if (target && target.closest?.('.leaflet-control-zoom')) {
            e.preventDefault();
            const sidebar = document.querySelector('.sidebar');
            const savedScroll = sidebar ? sidebar.scrollTop : 0;
            requestAnimationFrame(() => {
                target.blur();
                if (sidebar) sidebar.scrollTop = savedScroll;
                window.scrollTo(0, 0);
            });
        }
    }, true);

    function getMapScale(map) {
        const center = map.getCenter();
        const zoom = map.getZoom();
        const lat = center.lat * Math.PI / 180;
        const metersPerPixel = 156543.03392 * Math.cos(lat) / Math.pow(2, zoom);
        const scaleDenom = Math.round(metersPerPixel * 96 / 0.0254);
        const niceScales = [500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000, 2500000, 5000000, 10000000];
        let nearest = niceScales[0];
        for (const s of niceScales) {
            if (Math.abs(s - scaleDenom) < Math.abs(nearest - scaleDenom)) nearest = s;
        }
        return nearest;
    }

    /** Map scale denominator (e.g. 50000 → “1/50000”) at a given Leaflet zoom and latitude — matches the logic behind the on-map scale readout. */
    /**
     * Baseline: MAP_VIEW_BASELINE_PIXEL_SCALE (>1) for “tactical” scales.
     * Denom ≤ 1M (1/1000000 and closer-in, including 1/500000): same full baseline — 1/1M matches 1/500k on screen.
     * Past 1/1000000: same shrink curve as before (from MAP_VIEW_SCALE_FACTOR_AT_1M down to MAP_VIEW_PIXEL_SCALE_MIN).
     */
    const MAP_VIEW_BASELINE_PIXEL_SCALE = 1.32;
    const MAP_VIEW_FLAT_THROUGH_DENOM = 1000000;
    const MAP_VIEW_SCALE_TAIL_START_DENOM = 1000000;
    const MAP_VIEW_SCALE_FACTOR_AT_1M = 0.48;
    const MAP_VIEW_SCALE_WIDE_END_DENOM = 32000000;
    const MAP_VIEW_PIXEL_SCALE_MIN = 0.11;
    /** When the scale control reads 1/500000, tactical overlays are this fraction of the usual size (smaller by 1/3). */
    const MAP_VIEW_500K_PIXEL_SCALE_FACTOR = 2 / 3;

    function getMapViewPixelScale() {
        if (!map || typeof map.getZoom !== 'function') return MAP_VIEW_BASELINE_PIXEL_SCALE;
        const d = getMapScaleDenominatorAtZoom(map.getZoom(), map.getCenter().lat);
        const S0 = MAP_VIEW_BASELINE_PIXEL_SCALE;
        const S1 = MAP_VIEW_SCALE_FACTOR_AT_1M;
        const Smin = MAP_VIEW_PIXEL_SCALE_MIN;
        const Dflat = MAP_VIEW_FLAT_THROUGH_DENOM;
        const D1 = MAP_VIEW_SCALE_TAIL_START_DENOM;
        const D2 = MAP_VIEW_SCALE_WIDE_END_DENOM;
        let s;
        if (d <= Dflat) s = S0;
        else if (d >= D2) s = Smin;
        else {
            const t2 = (Math.log(d) - Math.log(D1)) / (Math.log(D2) - Math.log(D1));
            s = S1 + Math.max(0, Math.min(1, t2)) * (Smin - S1);
        }
        if (getMapScale(map) === 500000) s *= MAP_VIEW_500K_PIXEL_SCALE_FACTOR;
        return s;
    }

    function applyZoomScaledStrokeToPolyline(polyline) {
        if (!polyline?.setStyle || polyline._baseLineWeight == null) return;
        const s = getMapViewPixelScale();
        polyline.setStyle({ weight: Math.max(0.5, Math.min(24, polyline._baseLineWeight * s)) });
    }

    const ZoomDisplay = L.Control.extend({
        onAdd: function (map) {
            const div = L.DomUtil.create('div', 'leaflet-control leaflet-control-zoom-display');
            this._update = () => { div.textContent = '1/' + getMapScale(map); };
            map.on('zoomend moveend', this._update);
            this._update();
            return div;
        },
        onRemove: function (map) {
            map.off('zoomend moveend', this._update);
        }
    });
    L.control.zoomDisplay = function (opts) { return new ZoomDisplay(opts); };
    L.control.zoomDisplay({ position: 'bottomright' }).addTo(map);

    // Base layers: OpenStreetMap (online) + Satellite MBTiles (offline) + XYZ tiles
    const localLocalLayer = L.tileLayer('tiles/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution: 'Offline Map Data',
        errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
    });

    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution: '© OpenStreetMap'
    });

    const baseMaps = {
        "Offline Local Directory": localLocalLayer,
        "OpenStreetMap (Requires Internet)": osmLayer
    };

    const layerControl = L.control.layers(baseMaps, null, { position: 'bottomright' }).addTo(map);

    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
    if (isOnline) {
        osmLayer.addTo(map);
    } else {
        localLocalLayer.addTo(map);
    }

    // Load MBTiles: use tile server (for large files) or in-browser loading
    fetch('maps/maps.json').then(r => r.ok ? r.json() : null).catch(() => null).then(config => {
        if (!config) return;
        const files = Array.isArray(config) ? config : (config.mbtiles) || [];
        const tileServer = config && config.tileServer ? config.tileServer.replace(/\/$/, '') : null;

        if (files.length === 0) return;

        if (tileServer) {
            // Scale-based layer switch (utpc/topo_100): utpc until 1:100,000, then topo_100
            const SCALE_THRESHOLD = 100000;
            let utpcLayer = null, topoLayer = null, firstLayer = null;

            files.forEach(filename => {
                if (!filename || !String(filename).endsWith('.mbtiles')) return;
                const tileset = filename.replace(/\.mbtiles$/i, '');
                const label = tileset.replace(/_/g, ' ');
                const tileUrl = tileServer + '/services/' + encodeURIComponent(tileset) + '/{z}/{x}/{y}.png';
                const layer = L.tileLayer(tileUrl, { attribution: 'Offline MBTiles', maxZoom: 17 });
                if (!firstLayer) firstLayer = layer;
                if (tileset.toLowerCase().includes('utpc')) utpcLayer = layer;
                if (tileset.toLowerCase().includes('topo_100')) topoLayer = layer;
                layerControl.addBaseLayer(layer, 'MBTiles: ' + label);
            });

            if (utpcLayer && topoLayer) {
                function updateScaleLayer() {
                    const scale = getMapScale(map);
                    const useTopo = scale < SCALE_THRESHOLD;
                    if (useTopo) {
                        if (map.hasLayer(utpcLayer)) map.removeLayer(utpcLayer);
                        if (!map.hasLayer(topoLayer)) map.addLayer(topoLayer);
                    } else {
                        if (map.hasLayer(topoLayer)) map.removeLayer(topoLayer);
                        if (!map.hasLayer(utpcLayer)) map.addLayer(utpcLayer);
                    }
                }
                map.removeLayer(localLocalLayer);
                map.on('zoomend moveend', updateScaleLayer);
                updateScaleLayer();
            } else if (firstLayer) {
                map.removeLayer(localLocalLayer);
                firstLayer.addTo(map);
            }
        } else if (typeof L.tileLayer !== 'undefined' && typeof L.tileLayer.mbTiles === 'function') {
            // In-browser loading (limited to ~500MB files)
            let firstMbAdded = false;
            files.forEach(filename => {
                if (!filename || !String(filename).endsWith('.mbtiles')) return;
                const url = 'maps/' + encodeURIComponent(filename);
                const label = filename.replace(/\.mbtiles$/i, '').replace(/_/g, ' ');
                const mbLayer = L.tileLayer.mbTiles(url, { attribution: 'Offline MBTiles' });
                mbLayer.on('databaseerror', (e) => {
                    console.warn('MBTiles failed to load:', filename, e.error || e);
                });
                mbLayer.on('databaseloaded', function () {
                    layerControl.addBaseLayer(mbLayer, 'MBTiles: ' + label);
                    if (!firstMbAdded) {
                        firstMbAdded = true;
                        map.removeLayer(localLocalLayer);
                        mbLayer.addTo(map);
                    }
                });
            });
        }
    });

    // SVG patterns for geo shape line fills (vertical, horizontal, cross-hatch)
    const geoPatternsContainer = document.createElement('div');
    geoPatternsContainer.id = 'geo-patterns-container';
    geoPatternsContainer.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
    document.getElementById('map').appendChild(geoPatternsContainer);

    function ensureGeoPattern(patternType, color) {
        const hex = (color || '#3b82f6').replace('#', '');
        const id = `geo-pattern-${patternType}-${hex}`;
        if (document.getElementById(id)) return id;
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '0');
        svg.setAttribute('height', '0');
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        const pattern = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
        pattern.setAttribute('id', id);
        pattern.setAttribute('patternUnits', 'userSpaceOnUse');
        pattern.setAttribute('width', '8');
        pattern.setAttribute('height', '8');
        if (patternType === 'vertical') {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', '4');
            line.setAttribute('y1', '0');
            line.setAttribute('x2', '4');
            line.setAttribute('y2', '8');
            line.setAttribute('stroke', color || '#3b82f6');
            line.setAttribute('stroke-width', '1');
            pattern.appendChild(line);
        } else if (patternType === 'horizontal') {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', '0');
            line.setAttribute('y1', '4');
            line.setAttribute('x2', '8');
            line.setAttribute('y2', '4');
            line.setAttribute('stroke', color || '#3b82f6');
            line.setAttribute('stroke-width', '1');
            pattern.appendChild(line);
        } else if (patternType === 'both') {
            const v = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            v.setAttribute('x1', '4');
            v.setAttribute('y1', '0');
            v.setAttribute('x2', '4');
            v.setAttribute('y2', '8');
            v.setAttribute('stroke', color || '#3b82f6');
            v.setAttribute('stroke-width', '1');
            pattern.appendChild(v);
            const h = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            h.setAttribute('x1', '0');
            h.setAttribute('y1', '4');
            h.setAttribute('x2', '8');
            h.setAttribute('y2', '4');
            h.setAttribute('stroke', color || '#3b82f6');
            h.setAttribute('stroke-width', '1');
            pattern.appendChild(h);
        }
        defs.appendChild(pattern);
        svg.appendChild(defs);
        geoPatternsContainer.appendChild(svg);
        return id;
    }

    function createMineSvgElements(pattern, cx, cy, color, type) {
        const NS = 'http://www.w3.org/2000/svg';
        const c = color || '#3b82f6';
        const circle = document.createElementNS(NS, 'circle');
        circle.setAttribute('cx', cx); circle.setAttribute('cy', cy);
        circle.setAttribute('fill', c); circle.setAttribute('opacity', '0.6');
        if (type === 'at') {
            circle.setAttribute('r', '2.5');
            const h1 = document.createElementNS(NS, 'line');
            h1.setAttribute('x1', cx - 2.5); h1.setAttribute('y1', cy - 3.5);
            h1.setAttribute('x2', cx - 2.5); h1.setAttribute('y2', cy + 3.5);
            h1.setAttribute('stroke', c); h1.setAttribute('stroke-width', '0.8'); h1.setAttribute('opacity', '0.6');
            const h2 = document.createElementNS(NS, 'line');
            h2.setAttribute('x1', cx + 2.5); h2.setAttribute('y1', cy - 3.5);
            h2.setAttribute('x2', cx + 2.5); h2.setAttribute('y2', cy + 3.5);
            h2.setAttribute('stroke', c); h2.setAttribute('stroke-width', '0.8'); h2.setAttribute('opacity', '0.6');
            pattern.appendChild(h1);
            pattern.appendChild(h2);
        } else {
            circle.setAttribute('r', '1.8');
        }
        pattern.appendChild(circle);
    }

    function ensureMinefieldPattern(color, mineType) {
        const mt = mineType || 'ap';
        const hex = (color || '#3b82f6').replace('#', '');
        const id = `geo-pattern-minefield-${mt}-${hex}`;
        if (document.getElementById(id)) return id;
        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('width', '0');
        svg.setAttribute('height', '0');
        const defs = document.createElementNS(NS, 'defs');
        const pattern = document.createElementNS(NS, 'pattern');
        pattern.setAttribute('id', id);
        pattern.setAttribute('patternUnits', 'userSpaceOnUse');
        if (mt === 'mixed') {
            pattern.setAttribute('width', '36');
            pattern.setAttribute('height', '36');
            createMineSvgElements(pattern, 5, 5, color, 'ap');
            createMineSvgElements(pattern, 23, 5, color, 'at');
            createMineSvgElements(pattern, 14, 23, color, 'at');
            createMineSvgElements(pattern, 32, 23, color, 'ap');
        } else {
            pattern.setAttribute('width', '18');
            pattern.setAttribute('height', '18');
            createMineSvgElements(pattern, 5, 5, color, mt);
            createMineSvgElements(pattern, 14, 14, color, mt);
        }
        defs.appendChild(pattern);
        svg.appendChild(defs);
        geoPatternsContainer.appendChild(svg);
        return id;
    }

    function getMinefieldStyle(color, mineType) {
        const pid = ensureMinefieldPattern(color, mineType);
    // Leaflet SVG uses fillColor for the path's fill attribute (not the `fill` option value).
    // Using fill: 'url(#…)' alone leaves fillColor unset, so Leaflet fills with solid `color`.
        return {
            weight: 3,
            color: color,
            fill: true,
            fillColor: `url(#${pid})`,
            fillOpacity: 1,
        };
    }

    function getSelectedMineType() {
        return document.getElementById('geo-mine-type-select')?.value || 'ap';
    }

    function createMinefieldTeeth(corners, color) {
        const centroid = L.latLng(
            corners.reduce((s, c) => s + c.lat, 0) / corners.length,
            corners.reduce((s, c) => s + c.lng, 0) / corners.length
        );
        const allTeethPts = [];
        for (let i = 0; i < corners.length; i++) {
            const A = corners[i];
            const B = corners[(i + 1) % corners.length];
            const edgeDx = B.lng - A.lng;
            const edgeDy = B.lat - A.lat;
            const edgeLen = Math.sqrt(edgeDx * edgeDx + edgeDy * edgeDy);
            if (edgeLen < 1e-10) continue;
            const midLng = (A.lng + B.lng) / 2;
            const midLat = (A.lat + B.lat) / 2;
            const n1x = -edgeDy / edgeLen;
            const n1y = edgeDx / edgeLen;
            const toCx = centroid.lng - midLng;
            const toCy = centroid.lat - midLat;
            const dot = n1x * toCx + n1y * toCy;
            const nx = dot > 0 ? -n1x : n1x;
            const ny = dot > 0 ? -n1y : n1y;
            const numTeeth = Math.max(3, Math.min(30, Math.round(edgeLen * 500)));
            const toothH = edgeLen / numTeeth * 0.6;
            const edgePts = [];
            for (let t = 0; t < numTeeth; t++) {
                const f1 = t / numTeeth;
                const f2 = (t + 0.5) / numTeeth;
                const f3 = (t + 1) / numTeeth;
                edgePts.push(L.latLng(A.lat + edgeDy * f1, A.lng + edgeDx * f1));
                edgePts.push(L.latLng(A.lat + edgeDy * f2 + ny * toothH, A.lng + edgeDx * f2 + nx * toothH));
                edgePts.push(L.latLng(A.lat + edgeDy * f3, A.lng + edgeDx * f3));
            }
            allTeethPts.push(edgePts);
        }
        return allTeethPts;
    }

    function addMinefieldDecorations(polygon, corners, color, layerId) {
        const layer = layers.find(l => l.id === layerId);
        if (!layer) return;
        const d = polygon._geoData || {};
        const teethArrays = createMinefieldTeeth(corners, color);
        const teethLayers = teethArrays.map(pts =>
            L.polyline(pts, { color: color, weight: 2, fill: false, interactive: false })
        );
        teethLayers.forEach(t => layer.group.addLayer(t));
        const centroid = L.latLng(
            corners.reduce((s, c) => s + c.lat, 0) / corners.length,
            corners.reduce((s, c) => s + c.lng, 0) / corners.length
        );
        const labelText = getMinefieldLabelText(d.mineType);
        const label = L.marker(centroid, {
            icon: L.divIcon({
                className: 'minefield-label',
                html: `<div style="font-weight:900;font-size:20px;color:${color};text-shadow:-1px -1px 0 #fff,1px -1px 0 #fff,-1px 1px 0 #fff,1px 1px 0 #fff,0 0 6px rgba(255,255,255,0.8);pointer-events:none;text-align:center;">${labelText}</div>`,
                iconSize: [40, 30],
                iconAnchor: [20, 15]
            }),
            interactive: false
        });
        layer.group.addLayer(label);
        polygon._minefieldTeeth = teethLayers;
        polygon._minefieldLabel = label;
    }

    function removeMinefieldDecorations(el) {
        const layer = layers.find(l => l.id === el._layerId) || layers.find(l => l.elements.includes(el));
        if (!layer) return;
        if (el._minefieldTeeth) {
            el._minefieldTeeth.forEach(t => layer.group.removeLayer(t));
            el._minefieldTeeth = null;
        }
        if (el._minefieldLabel) {
            layer.group.removeLayer(el._minefieldLabel);
            el._minefieldLabel = null;
        }
    }

    function updateMinefieldDecorations(polygon) {
        removeMinefieldDecorations(polygon);
        const d = polygon._geoData;
        if (!d) return;
        const lls = polygon.getLatLngs();
        const ring = (lls[0] && Array.isArray(lls[0])) ? lls[0] : lls;
        addMinefieldDecorations(polygon, ring, d.color, polygon._layerId);
    }

    function bindMinefieldResizeHandles(mf) {
        removeGeoResizeHandles();
        const lls = mf.getLatLngs();
        const ring = (lls[0] && Array.isArray(lls[0])) ? lls[0] : lls;
        if (ring.length < 4) return;
        for (let i = 0; i < 4; i++) {
            const oppositeIdx = (i + 2) % 4;
            createGeoResizeHandle(ring[i], (newLatLng, isFinal) => {
                const currRing = ((r) => (r[0] && Array.isArray(r[0])) ? r[0] : r)(mf.getLatLngs());
                const anchor = currRing[oppositeIdx];
                const newCorners = createRectangleCorners(anchor, newLatLng);
                mf.setLatLngs(newCorners);
                mf._geoData.corners = newCorners;
                for (let h = 0; h < 4; h++) {
                    if (h !== i && activeGeoResizeHandles[h]) {
                        activeGeoResizeHandles[h].setLatLng(newCorners[h]);
                    }
                }
                syncGeoShapeHandlesToGeometry(mf, 'minefield');
                if (isFinal) {
                    updateMinefieldDecorations(mf);
                    applyMinefieldFill(mf);
                    mf.setPopupContent(buildGeoPopupContent(mf, 'minefield', mf._geoData));
                    bindGeoPopupHandlers(mf, 'minefield');
                    scheduleSaveToStorage();
                }
            }, mf._layerId);
        }
    }

    function applyMinefieldFill(el) {
        if (!el._path) {
            setTimeout(() => applyMinefieldFill(el), 50);
            return;
        }
        const d = el._geoData;
        const pid = ensureMinefieldPattern(d?.color || '#3b82f6', d?.mineType || 'ap');
        el._path.setAttribute('fill', `url(#${pid})`);
        el._path.setAttribute('fill-opacity', '1');
    }

    /** Default fill for new geographical shapes, range overlays, and missing `fillStyle` on import. */
    const DEFAULT_GEO_FILL_STYLE = 'outline';

    function getGeoFillStyleOptions(fillStyle, color) {
        const c = color || '#3b82f6';
        if (fillStyle === 'outline') {
            return { fillColor: c, fillOpacity: 0, color: c };
        }
        if (fillStyle === 'vertical' || fillStyle === 'horizontal' || fillStyle === 'both') {
            const pid = ensureGeoPattern(fillStyle, c);
            return { fill: `url(#${pid})`, fillOpacity: 1, color: c };
        }
        return { fillColor: c, fillOpacity: 0.15, color: c };
    }

    function getGeoShapeStyle(color, fillStyle) {
        return { weight: 2, ...getGeoFillStyleOptions(fillStyle || DEFAULT_GEO_FILL_STYLE, color) };
    }

    function applyGeoPathFill(el) {
        const d = el._geoData;
        if (!d || !el._path) return;
        const fs = d.fillStyle || DEFAULT_GEO_FILL_STYLE;
        if (fs === 'vertical' || fs === 'horizontal' || fs === 'both') {
            applyGeoObstacleAwareLineHatch(el);
            return;
        }
        clearGeoObstacleHatchLines(el);
        const opts = getGeoFillStyleOptions(fs, d.color);
        if (opts.fill && opts.fill.startsWith('url(')) {
            el._path.setAttribute('fill', opts.fill);
            el._path.setAttribute('fill-opacity', opts.fillOpacity ?? 1);
        } else if (opts.fillColor != null) {
            el._path.setAttribute('fill', opts.fillColor);
            el._path.setAttribute('fill-opacity', String(opts.fillOpacity ?? 1));
        }
    }

    function scheduleGeoPathFill(el) {
        if (!el._path) {
            setTimeout(() => applyGeoPathFill(el), 50);
        } else {
            applyGeoPathFill(el);
        }
    }

    // Pane for TMG selection border + handles (above default markerPane 600 so handles are visible)
    map.createPane('tmgSelectionPane');
    map.getPane('tmgSelectionPane').style.zIndex = 900;

    // Preview layer for placement shadow (symbol/line/TMG)
    map.createPane('placementPreviewPane');
    map.getPane('placementPreviewPane').style.zIndex = 650;
    map.getPane('placementPreviewPane').style.pointerEvents = 'none';
    map.createPane('selectionHighlightPane');
    map.getPane('selectionHighlightPane').style.zIndex = 820;
    map.getPane('selectionHighlightPane').style.pointerEvents = 'none';
    map.createPane('geoObstacleHatchPane');
    map.getPane('geoObstacleHatchPane').style.zIndex = 415;
    map.getPane('geoObstacleHatchPane').style.pointerEvents = 'none';
    map.createPane('autoFlankAreaPane');
    map.getPane('autoFlankAreaPane').style.zIndex = 395;
    map.getPane('autoFlankAreaPane').style.pointerEvents = 'none';
    const previewLayer = L.layerGroup().addTo(map);
    let previewMarker = null;
    let previewPolyline = null;
    let previewTmgSegments = [];  // completed TMG segments (stay visible)
    let previewTmgLive = null;    // live segment from last point to mouse
    let previewTmgTailPolyline = null;
    let previewTmgTailLive = null;
    let previewTmgOverlayRect = null;
    let previewTmgGuideLine = null;
    let previewTmgHandles = [];
    const CATK_PREVIEW_GUIDE_COLOR = '#64748b';
    const CATK_PREVIEW_GUIDE_DASH = '6,4';
    const CATK_PREVIEW_BOX_DASH = '7,5';
    /** Light polyline for TMG "add point" mode (full TMG preview each mousemove was too heavy for scalloped). */
    let previewAddPointPolyline = null;

    function clearPlacementPreview() {
        if (previewMarker) {
            previewLayer.removeLayer(previewMarker);
            previewMarker = null;
        }
        if (previewPolyline) {
            previewLayer.removeLayer(previewPolyline);
            previewPolyline = null;
        }
        previewTmgSegments.forEach(seg => previewLayer.removeLayer(seg));
        previewTmgSegments = [];
        if (previewTmgLive) {
            previewLayer.removeLayer(previewTmgLive);
            previewTmgLive = null;
        }
        if (previewTmgTailPolyline) {
            previewLayer.removeLayer(previewTmgTailPolyline);
            previewTmgTailPolyline = null;
        }
        if (previewTmgTailLive) {
            previewLayer.removeLayer(previewTmgTailLive);
            previewTmgTailLive = null;
        }
        if (previewTmgOverlayRect) {
            previewLayer.removeLayer(previewTmgOverlayRect);
            previewTmgOverlayRect = null;
        }
        if (previewTmgGuideLine) {
            previewLayer.removeLayer(previewTmgGuideLine);
            previewTmgGuideLine = null;
        }
        previewTmgHandles.forEach(h => previewLayer.removeLayer(h));
        previewTmgHandles = [];
        if (previewAddPointPolyline) {
            previewLayer.removeLayer(previewAddPointPolyline);
            previewAddPointPolyline = null;
        }
        if (circleXSnapRing) {
            previewLayer.removeLayer(circleXSnapRing);
            circleXSnapRing = null;
        }
    }

    function catkPreviewHandleIcon(extraClass) {
        return L.divIcon({
            className: `tmg-preview-handle ${extraClass}`,
            html: '<div class="tmg-preview-handle-inner"></div>',
            iconSize: [18, 18],
            iconAnchor: [9, 9]
        });
    }

    function syncCatkPreviewHandle(index, latlng, className) {
        if (!latlng) return;
        if (!previewTmgHandles[index]) {
            previewTmgHandles[index] = L.marker(latlng, {
                icon: catkPreviewHandleIcon(className),
                interactive: false,
                pane: 'placementPreviewPane'
            });
            previewLayer.addLayer(previewTmgHandles[index]);
        } else {
            previewTmgHandles[index].setLatLng(latlng);
            previewTmgHandles[index].setIcon(catkPreviewHandleIcon(className));
        }
    }

    function trimCatkPreviewHandles(count) {
        while (previewTmgHandles.length > count) {
            const handle = previewTmgHandles.pop();
            if (handle) previewLayer.removeLayer(handle);
        }
    }

    function clearCatkPreviewAdornments() {
        if (previewTmgOverlayRect) {
            previewLayer.removeLayer(previewTmgOverlayRect);
            previewTmgOverlayRect = null;
        }
        if (previewTmgGuideLine) {
            previewLayer.removeLayer(previewTmgGuideLine);
            previewTmgGuideLine = null;
        }
        trimCatkPreviewHandles(0);
    }

    function renderCatkPlacementPreview(typeId, arrowParams, phase, color, strokeWidth, liveControlLatLng = null) {
        const params = normalizeCatkArrowParams(arrowParams);
        if (!params) return;
        const pts = catkArrowPointsFromParams(params);
        if (previewTmgLive) {
            previewLayer.removeLayer(previewTmgLive);
            previewTmgLive = null;
        }
        // Skip expensive obstacle routing during live preview to avoid lag
        _skipObstacleRouting = true;
        const uni = getCatkUnifiedDivIcon(pts, color, strokeWidth, typeId, {
            railsDashed: resolveCatkMultiPointDashed(typeId, null),
            arrowHeadScale: getTmgArrowHeadScale(),
            arrowGeometry: params
        });
        _skipObstacleRouting = false;
        if (uni) {
            previewTmgLive = L.marker(uni.centerLatLng, {
                icon: L.divIcon({
                    className: 'leaflet-div-icon catk-unified-tmg placement-preview',
                    html: uni.html,
                    iconSize: uni.iconSize,
                    iconAnchor: uni.iconAnchor
                }),
                interactive: false,
                pane: 'placementPreviewPane'
            });
            previewLayer.addLayer(previewTmgLive);
        }
        const overlay = catkArrowOverlayLatLngs(params);
        if (overlay?.length === 4) {
            if (!previewTmgOverlayRect) {
                previewTmgOverlayRect = L.polygon(overlay, {
                    color: CATK_PREVIEW_GUIDE_COLOR,
                    weight: 2,
                    dashArray: CATK_PREVIEW_BOX_DASH,
                    fill: false,
                    interactive: false,
                    pane: 'placementPreviewPane'
                });
                previewLayer.addLayer(previewTmgOverlayRect);
            } else {
                previewTmgOverlayRect.setLatLngs(overlay);
            }
        } else if (previewTmgOverlayRect) {
            previewLayer.removeLayer(previewTmgOverlayRect);
            previewTmgOverlayRect = null;
        }
        const handles = catkArrowEditHandleLatLngs(params);
        if (phase === 'tipPlaced' && handles) {
            syncCatkPreviewHandle(0, handles.tip, 'tmg-arrow-tip-handle');
            // Provisional endpoint dot: this is the next click the user is aiming for
            // while choosing arrow direction and initial head/body size.
            if (liveControlLatLng) {
                syncCatkPreviewHandle(1, liveControlLatLng, 'tmg-endpoint-handle');
                // Yellow neck handle preview: shows the body/head transition that the
                // provisional endpoint is currently driving.
                syncCatkPreviewHandle(2, handles.neck, 'tmg-arrow-neck-handle');
                trimCatkPreviewHandles(3);
                const guidePoints = [handles.tip, handles.neckCenter, liveControlLatLng];
                if (!previewTmgGuideLine) {
                    previewTmgGuideLine = L.polyline(guidePoints, {
                        color: CATK_PREVIEW_GUIDE_COLOR,
                        weight: 2,
                        dashArray: CATK_PREVIEW_GUIDE_DASH,
                        interactive: false,
                        pane: 'placementPreviewPane'
                    });
                    previewLayer.addLayer(previewTmgGuideLine);
                } else {
                    previewTmgGuideLine.setLatLngs(guidePoints);
                }
            } else {
                trimCatkPreviewHandles(1);
                if (previewTmgGuideLine) {
                    previewLayer.removeLayer(previewTmgGuideLine);
                    previewTmgGuideLine = null;
                }
            }
            return;
        }
        if (phase === 'tailLengthChoosing' && handles) {
            syncCatkPreviewHandle(0, handles.tip, 'tmg-arrow-tip-handle');
            syncCatkPreviewHandle(1, handles.neck, 'tmg-arrow-neck-handle');
            syncCatkPreviewHandle(2, handles.tail, 'tmg-arrow-tail-handle');
            trimCatkPreviewHandles(3);
            if (!previewTmgGuideLine) {
                previewTmgGuideLine = L.polyline([handles.neckCenter, handles.tailCenter], {
                    color: CATK_PREVIEW_GUIDE_COLOR,
                    weight: 2,
                    dashArray: CATK_PREVIEW_GUIDE_DASH,
                    interactive: false,
                    pane: 'placementPreviewPane'
                });
                previewLayer.addLayer(previewTmgGuideLine);
            } else {
                previewTmgGuideLine.setLatLngs([handles.neckCenter, handles.tailCenter]);
            }
            return;
        }
        trimCatkPreviewHandles(0);
        if (previewTmgGuideLine) {
            previewLayer.removeLayer(previewTmgGuideLine);
            previewTmgGuideLine = null;
        }
    }

    function renderCatkTailDotPlacementPreview(typeId, tipLatLng, committedTailPoints, liveTailLatLng, color, strokeWidth, lockedArrowParams = null) {
        const tip = tipLatLng ? L.latLng(tipLatLng.lat, tipLatLng.lng) : null;
        if (!tip) return;
        const committed = (committedTailPoints || []).filter(Boolean).map((p) => L.latLng(p.lat, p.lng));
        const pts = [tip, ...committed];
        if (liveTailLatLng) pts.push(L.latLng(liveTailLatLng.lat, liveTailLatLng.lng));
        const lockedParams = normalizeCatkArrowParams(lockedArrowParams);
        // Before first tail dot, keep parametric rectangle lock.
        // After first dot, draw multi-vertex tail path but keep locked head/body
        // parameters so width/head do not fall back.
        const useLockedArrowGeometry = !!lockedParams && committed.length === 0;
        if (previewTmgLive) {
            previewLayer.removeLayer(previewTmgLive);
            previewTmgLive = null;
        }
        if ((useLockedArrowGeometry || pts.length >= 2) && map) {
            const iconPoints = useLockedArrowGeometry ? catkArrowPointsFromParams(lockedParams) : pts;
            // Skip expensive obstacle routing during live preview to avoid lag
            _skipObstacleRouting = true;
            const uni = getCatkUnifiedDivIcon(iconPoints, color, strokeWidth, typeId, {
                railsDashed: resolveCatkMultiPointDashed(typeId, null),
                arrowHeadScale: getTmgArrowHeadScale(),
                arrowGeometry: useLockedArrowGeometry ? lockedParams : null,
                lockedArrowParams: !useLockedArrowGeometry ? lockedParams : null,
                legacyBodyWidthKm: lockedParams?.bodyWidthKm ?? null
            });
            _skipObstacleRouting = false;
            if (uni) {
                previewTmgLive = L.marker(uni.centerLatLng, {
                    icon: L.divIcon({
                        className: 'leaflet-div-icon catk-unified-tmg placement-preview',
                        html: uni.html,
                        iconSize: uni.iconSize,
                        iconAnchor: uni.iconAnchor
                    }),
                    interactive: false,
                    pane: 'placementPreviewPane'
                });
                previewLayer.addLayer(previewTmgLive);
            }
        }
        if (useLockedArrowGeometry) {
            const overlay = catkArrowOverlayLatLngs(lockedParams);
            if (overlay?.length === 4) {
                if (!previewTmgOverlayRect) {
                    previewTmgOverlayRect = L.polygon(overlay, {
                        color: CATK_PREVIEW_GUIDE_COLOR,
                        weight: 2,
                        dashArray: CATK_PREVIEW_BOX_DASH,
                        fill: false,
                        interactive: false,
                        pane: 'placementPreviewPane'
                    });
                    previewLayer.addLayer(previewTmgOverlayRect);
                } else {
                    previewTmgOverlayRect.setLatLngs(overlay);
                }
            } else if (previewTmgOverlayRect) {
                previewLayer.removeLayer(previewTmgOverlayRect);
                previewTmgOverlayRect = null;
            }
        } else if (previewTmgOverlayRect) {
            previewLayer.removeLayer(previewTmgOverlayRect);
            previewTmgOverlayRect = null;
        }
        let handleCount = 0;
        syncCatkPreviewHandle(handleCount++, tip, 'tmg-arrow-tip-handle');
        committed.forEach((pt) => syncCatkPreviewHandle(handleCount++, pt, 'tmg-endpoint-handle'));
        if (liveTailLatLng) syncCatkPreviewHandle(handleCount++, liveTailLatLng, 'tmg-arrow-tail-handle');
        trimCatkPreviewHandles(handleCount);

        const guidePoints = [tip, ...committed];
        if (liveTailLatLng) guidePoints.push(L.latLng(liveTailLatLng.lat, liveTailLatLng.lng));
        if (guidePoints.length >= 2) {
            if (!previewTmgGuideLine) {
                previewTmgGuideLine = L.polyline(guidePoints, {
                    color: CATK_PREVIEW_GUIDE_COLOR,
                    weight: 2,
                    dashArray: CATK_PREVIEW_GUIDE_DASH,
                    interactive: false,
                    pane: 'placementPreviewPane'
                });
                previewLayer.addLayer(previewTmgGuideLine);
            } else {
                previewTmgGuideLine.setLatLngs(guidePoints);
            }
        } else if (previewTmgGuideLine) {
            previewLayer.removeLayer(previewTmgGuideLine);
            previewTmgGuideLine = null;
        }
    }

    function updatePlacementPreview(latlng) {
        if (!latlng) return;
        // Must run before symbol/line branches so add-point works in any mode and is not cleared by symbol preview.
        if (addingPointTmgGroup) {
            const group = addingPointTmgGroup;
            const data = group._tmgData;
            if (data?.segments?.length) {
                const lastSeg = data.segments[data.segments.length - 1];
                const fromLatlng = lastSeg._tmgData.latlng2;
                const color = data.color || '#3b82f6';
                const w = Math.max(2, data.strokeWidth ?? 4);
                const dashArray = data.dashed ? '6,6' : null;
                if (!previewAddPointPolyline) {
                    previewAddPointPolyline = L.polyline([fromLatlng, latlng], {
                        color,
                        weight: w,
                        opacity: 0.45,
                        dashArray,
                        pane: 'placementPreviewPane',
                        interactive: false,
                    });
                    previewLayer.addLayer(previewAddPointPolyline);
                } else {
                    previewAddPointPolyline.setLatLngs([fromLatlng, latlng]);
                    previewAddPointPolyline.setStyle({ color, weight: w, dashArray });
                }
            } else if (previewAddPointPolyline) {
                previewLayer.removeLayer(previewAddPointPolyline);
                previewAddPointPolyline = null;
            }
            return;
        }
        if (currentMode === 'symbol') {
            clearPlacementPreview();
            const sidc = generateSIDC();
            const opts = { ...getTextModifiers() };
            const baseSz = opts.size != null ? Number(opts.size) : 25;
            opts.size = Math.max(6, Math.round(baseSz * getMapViewPixelScale()));
            const sym = new ms.Symbol(sidc, opts);
            const anchorPoint = sym.getAnchor();
            const myIcon = L.divIcon({
                className: 'custom-nato-marker placement-preview',
                html: sym.asSVG(),
                iconAnchor: [anchorPoint.x, anchorPoint.y],
                iconSize: [sym.getSize().width, sym.getSize().height]
            });
            previewMarker = L.marker(latlng, { icon: myIcon, interactive: false, pane: 'placementPreviewPane' });
            previewMarker.addTo(previewLayer);
        } else if (currentMode === 'line') {
            if (reorientingTmgMarker) {
                clearPlacementPreview();
            } else if (selectedTmgType && isParametricCatkPlacementType(selectedTmgType)) {
                const color = getLineColor();
                const strokeWidth = getTmgStrokeWidth();
                previewTmgSegments.forEach(seg => previewLayer.removeLayer(seg));
                previewTmgSegments = [];
                if (previewPolyline) {
                    previewLayer.removeLayer(previewPolyline);
                    previewPolyline = null;
                }
                if (previewAddPointPolyline) {
                    previewLayer.removeLayer(previewAddPointPolyline);
                    previewAddPointPolyline = null;
                }
                if (catkPlacementState?.phase === 'bodyDrawing' && catkPlacementState.tail) {
                    // Live arrow preview: cursor = temporary tip.
                    // Derive params from current points so positions stay correct,
                    // but lock body width from the 2nd click.
                    catkPlacementState.liveCursor = latlng;
                    const reversedBody = [...(catkPlacementState.bodyPoints || [])].reverse();
                    const previewTailPts = [...reversedBody, catkPlacementState.tail];
                    const allPts = [latlng, ...previewTailPts];
                    const derived = catkDeriveArrowParamsFromLegacyPoints(allPts, strokeWidth, getTmgArrowHeadScale());
                    if (derived && catkPlacementState.lockedParams) {
                        derived.bodyWidthKm = catkPlacementState.lockedParams.bodyWidthKm;
                        derived.headWidthKm = catkPlacementState.lockedParams.headWidthKm;
                        derived.headLengthKm = catkPlacementState.lockedParams.headLengthKm;
                        derived.neckOffsetKm = catkPlacementState.lockedParams.neckOffsetKm;
                    }
                    renderCatkTailDotPlacementPreview(
                        selectedTmgType,
                        latlng,           // cursor = temporary tip
                        previewTailPts,   // body + tail in renderer order
                        null,
                        color,
                        strokeWidth,
                        derived
                    );
                    return;
                } else if (catkPlacementState?.phase === 'tailPlaced' && catkPlacementState.tail) {
                    // Tail placed — arrow preview with tip following cursor.
                    // When cursor is too close to the tail, push the tip out
                    // to a minimum distance so the head never overlaps the dot.
                    const minTipDistPx = CATK_ARROW_MIN_PLACEMENT_SCALE_PX;
                    const tailPx = map.latLngToLayerPoint(catkPlacementState.tail);
                    const curPx = map.latLngToLayerPoint(latlng);
                    let dx = curPx.x - tailPx.x;
                    let dy = curPx.y - tailPx.y;
                    const distPx = Math.hypot(dx, dy);
                    let tipLatLng = latlng;
                    if (distPx < minTipDistPx) {
                        // Push tip outward in cursor direction (or default east if on top)
                        if (distPx < 1) { dx = 1; dy = 0; }
                        const scale = minTipDistPx / distPx;
                        const pushPx = L.point(tailPx.x + dx * scale, tailPx.y + dy * scale);
                        tipLatLng = map.layerPointToLatLng(pushPx);
                    }
                    const previewPts = [tipLatLng, catkPlacementState.tail];
                    const derivedParams = catkDeriveArrowParamsFromLegacyPoints(
                        previewPts, strokeWidth, getTmgArrowHeadScale());
                    renderCatkTailDotPlacementPreview(
                        selectedTmgType,
                        tipLatLng,                     // tip pushed away from tail
                        [catkPlacementState.tail],      // tail at first click
                        null,
                        color,
                        strokeWidth,
                        derivedParams
                    );
                    return;
                } else {
                    // Idle: no placement yet — no preview until the user clicks
                    // to place the tail.
                    clearPlacementPreview();
                }
            } else if (selectedTmgType && tmgPoints.length >= 1) {
                clearCatkPreviewAdornments();
                const color = getLineColor();
                const def = TACTICAL_GRAPHICS.find(d => d.id === selectedTmgType);
                const filled = def?.filled ?? true;
                const dashed = def?.dashed ?? false;
                const strokeWidth = getTmgStrokeWidth();
                const opts = { filled, dashed, strokeWidth, pane: 'placementPreviewPane' };
                const neededCompleted = Math.max(0, tmgPoints.length - 1);
                while (previewTmgSegments.length > neededCompleted) {
                    previewLayer.removeLayer(previewTmgSegments.pop());
                }
                while (previewTmgSegments.length < neededCompleted) {
                    const i = previewTmgSegments.length;
                    const seg = createTmgLayer(tmgPoints[i], tmgPoints[i + 1], selectedTmgType, color, false, true, opts);
                    if (seg) {
                        const el = seg.getElement();
                        if (el) el.style.opacity = '0.5';
                        previewTmgSegments.push(seg);
                        previewLayer.addLayer(seg);
                    }
                }
                const lastPt = tmgPoints[tmgPoints.length - 1];
                if (previewTmgLive) previewLayer.removeLayer(previewTmgLive);
                previewTmgLive = createTmgLayer(lastPt, latlng, selectedTmgType, color, false, true, opts);
                if (previewTmgLive) {
                    const el = previewTmgLive.getElement();
                    if (el) el.style.opacity = '0.5';
                    previewLayer.addLayer(previewTmgLive);
                }
            } else if (!selectedTmgType && drawLineCoords.length >= 1) {
                clearCatkPreviewAdornments();
                previewTmgSegments.forEach(seg => previewLayer.removeLayer(seg));
                previewTmgSegments = [];
                if (previewTmgLive) {
                    previewLayer.removeLayer(previewTmgLive);
                    previewTmgLive = null;
                }
                if (!previewPolyline) {
                    const color = getLineColor();
                    const dashArray = lineStyleSelect.value === 'dotted' ? '10, 10' : null;
                    previewPolyline = L.polyline([], {
                        color: color,
                        weight: 4,
                        dashArray: dashArray,
                        opacity: 0.5,
                        pane: 'placementPreviewPane'
                    }).addTo(previewLayer);
                }
                const lastPt = drawLineCoords[drawLineCoords.length - 1];
                previewPolyline.setLatLngs([lastPt, latlng]);
            } else {
                clearPlacementPreview();
            }
        } else {
            clearPlacementPreview();
        }
    }

    // --- APPLICATION STATE ---
    let currentMode = 'pan'; // pan, symbol, line, select
    let drawLinePolyline = null;
    let drawLineCoords = [];
    let selectedTmgType = null;
    let tmgPoints = [];
    let catkPlacementState = null;
    let lastParametricCatkPlacementClick = null;
    let tmgClickPendingTimeout = null;
    let reorientingTmgMarker = null;
    let pendingGeoMove = null;
    let addingPointTmgGroup = null;
    let layerIdCounter = 1;
    let folderIdCounter = 1;
    const layers = [];
    const folders = [];
    const actionHistory = [];
    const redoHistory = [];
    let polylineEraseRedoIdCounter = 0;
    let polylineEraseGroupIdCounter = 0;

    /** Remove every polyline from this erase op (by live refs + shared _polylineEraseGroupId). */
    function removePolylinesForEraseUndo(layer, eraseEntry) {
        const gid = eraseEntry.eraseGroupId;
        const toRemove = new Set(eraseEntry.fragmentElements || []);
        if (gid != null) {
            layer.elements.forEach((el) => {
                if (L.Polyline && el instanceof L.Polyline && el._polylineEraseGroupId === gid) {
                    toRemove.add(el);
                }
            });
        }
        toRemove.forEach((el) => {
            if (!el) return;
            if (activePlainLineEndpointHandles && activePlainLineEndpointHandles.polyline === el) {
                removePlainLineEndpointHandles();
            }
            const i = layer.elements.indexOf(el);
            if (i >= 0) layer.elements.splice(i, 1);
            try {
                layer.group.removeLayer(el);
            } catch (_) { /* already removed */ }
        });
    }

    function resolveHistoryLayerRef(layerRef) {
        if (!layerRef) return null;
        return layers.find((l) => l.id === layerRef.id) || layerRef;
    }

    function isLayerOpenPolyline(el) {
        return el && typeof el.getLatLngs === 'function' && (el instanceof L.Polyline) && !(el instanceof L.Polygon);
    }

    /**
     * Compare captured erase geometry to a live polyline (for redo after stack top is no longer the synthetic add).
     * @param {number} [tolDeg] — default ~1e-5° (~1 m); Leaflet often differs slightly from serialized latlngs.
     */
    function plainPolylineMatchesBeforeState(beforeState, polyline, tolDeg) {
        if (!beforeState?.latlngs || !polyline?.getLatLngs) return false;
        const lls = polyline.getLatLngs();
        const flat = (lls.length && lls[0] && Array.isArray(lls[0])) ? lls.flat() : lls;
        const pts = beforeState.latlngs;
        if (!flat || pts.length !== flat.length) return false;
        const tol = tolDeg != null ? tolDeg : 1e-5;
        for (let i = 0; i < pts.length; i++) {
            if (Math.abs(pts[i].lat - flat[i].lat) > tol || Math.abs(pts[i].lng - flat[i].lng) > tol) return false;
        }
        return true;
    }

    /**
     * When redo walks forward through older erases, the map can hold several open polylines whose shared
     * endpoints form one logical line matching beforeState. Single-polyline match then fails (e.g. 3rd redo).
     */
    function findOpenPolylineChainMatchingBeforeState(targetLayer, beforeState, tolDeg) {
        const target = beforeState.latlngs;
        const n = target.length;
        if (n < 2 || !targetLayer?.elements?.length) return null;
        const tol = tolDeg != null ? tolDeg : 1e-5;
        const polys = targetLayer.elements.filter(isLayerOpenPolyline).filter((el) => {
            const lls = el.getLatLngs();
            const flat = (lls.length && lls[0] && Array.isArray(lls[0])) ? lls.flat() : lls;
            return flat && flat.length >= 2;
        });
        if (!polys.length) return null;

        function llEq(a, b) {
            return Math.abs(a.lat - b.lat) <= tol && Math.abs(a.lng - b.lng) <= tol;
        }
        function getPts(el) {
            const lls = el.getLatLngs();
            return ((lls.length && lls[0] && Array.isArray(lls[0])) ? lls.flat() : lls).map((ll) => ({ lat: ll.lat, lng: ll.lng }));
        }
        function prefixMatch(pts, startIdx) {
            if (startIdx + pts.length > n) return false;
            for (let i = 0; i < pts.length; i++) {
                if (!llEq(pts[i], target[startIdx + i])) return false;
            }
            return true;
        }

        const used = new Set();
        function dfs(startIdx) {
            if (startIdx >= n) return null;
            for (const el of polys) {
                if (used.has(el)) continue;
                const flat = getPts(el);
                const orientations = [flat, flat.slice().reverse()];
                for (const pts of orientations) {
                    if (!prefixMatch(pts, startIdx)) continue;
                    const end = startIdx + pts.length;
                    if (end > n) continue;
                    used.add(el);
                    if (end === n) {
                        used.delete(el);
                        return [el];
                    }
                    const tail = dfs(startIdx + pts.length - 1);
                    if (tail !== null) {
                        used.delete(el);
                        return [el, ...tail];
                    }
                    used.delete(el);
                }
            }
            return null;
        }

        return dfs(0);
    }

    /** Polylines to remove when redoing one polylineErase (one feature or a chain of fragments). */
    function findPolylinesForEraseRedo(targetLayer, beforeState, restoredElement) {
        if (!targetLayer?.elements?.length || !beforeState?.latlngs) return [];
        if (restoredElement && targetLayer.elements.includes(restoredElement)) return [restoredElement];
        const polys = targetLayer.elements.filter(isLayerOpenPolyline);
        const tolerances = [1e-7, 1e-6, 1e-5, 5e-5, 1e-4, 2e-4, 5e-4];
        for (const t of tolerances) {
            const hit = polys.find((el) => plainPolylineMatchesBeforeState(beforeState, el, t));
            if (hit) return [hit];
        }
        const pts = beforeState.latlngs;
        if (pts.length >= 2) {
            const n = pts.length;
            const r = (x) => Math.round(Number(x) * 1e5) / 1e5;
            const mid = Math.floor(n / 2);
            const sig = `${n}|${r(pts[0].lat)},${r(pts[0].lng)}|${r(pts[n - 1].lat)},${r(pts[n - 1].lng)}|${n > 2 ? r(pts[mid].lat) + ',' + r(pts[mid].lng) : ''}`;
            for (const el of polys) {
                const lls = el.getLatLngs();
                const flat = (lls.length && lls[0] && Array.isArray(lls[0])) ? lls.flat() : lls;
                if (flat.length !== n) continue;
                const sig2 = `${n}|${r(flat[0].lat)},${r(flat[0].lng)}|${r(flat[n - 1].lat)},${r(flat[n - 1].lng)}|${n > 2 ? r(flat[mid].lat) + ',' + r(flat[mid].lng) : ''}`;
                if (sig === sig2) return [el];
            }
        }
        for (const t of tolerances) {
            const chain = findOpenPolylineChainMatchingBeforeState(targetLayer, beforeState, t);
            if (chain && chain.length) return chain;
        }
        return [];
    }

    function getActiveLayer() {
        return layers.find(l => l.active) || layers[0];
    }

    function getActiveLayerGroup() {
        const layer = getActiveLayer();
        return layer ? layer.group : null;
    }

    function getAllElements() {
        return layers.flatMap(l => l.elements);
    }

    function addToActiveLayer(el) {
        const layer = getActiveLayer();
        if (!layer) return;
        el._layerId = layer.id;
        layer.elements.push(el);
        layer.group.addLayer(el);
        if (el._geoData && ['vertical', 'horizontal', 'both'].includes(el._geoData.fillStyle)) {
            el.once('add', () => scheduleGeoPathFill(el));
        }
        actionHistory.push({ type: 'add', element: el, layer });
        redoHistory.length = 0;
        if (layersListEl) renderLayersList();
        syncPlacementLayerInteractivity();
    }

    function removeFromLayer(el, historyOpts) {
        let layer = layers.find(l => l.id === el._layerId);
        if (!layer) layer = layers.find(l => l.elements.includes(el));
        if (!layer) return;
        if (el.closePopup) el.closePopup();
        if (el._rangeCircles && el._rangeCircles.length) {
            el._rangeCircles.forEach((c) => {
                clearGeoObstacleHatchLines(c);
                layer.group.removeLayer(c);
            });
            el._rangeCircles = [];
        }
        if (el._rangeSectors && el._rangeSectors.length) {
            el._rangeSectors.forEach((p) => {
                clearGeoObstacleHatchLines(p);
                layer.group.removeLayer(p);
            });
            el._rangeSectors = [];
        }
        if (el._rangeOverlaySyncBound) {
            el.off('dragend', syncMarkerRangeOverlays);
            el._rangeOverlaySyncBound = false;
        }
        if (el._geoType === 'distance' && el._waypointMarkers) {
            removeDistanceWaypointMarkers(el);
        }
        if (el._geoType === 'minefield') {
            removeMinefieldDecorations(el);
        }
        clearGeoObstacleHatchLines(el);
        const idx = layer.elements.indexOf(el);
        if (idx >= 0) layer.elements.splice(idx, 1);
        layer.group.removeLayer(el);
        if (!historyOpts || !historyOpts.skipHistorySplice) {
            const histIdx = actionHistory.findIndex(a => a.type === 'add' && a.element === el);
            if (histIdx >= 0) actionHistory.splice(histIdx, 1);
        }
        if (layersListEl) renderLayersList();
        scheduleSaveToStorage();
    }

    function createLayer(name) {
        const id = 'layer-' + (layerIdCounter++);
        const group = L.layerGroup();
        const layer = { id, name, group, elements: [], visible: true, active: layers.length === 0 };
        layers.forEach(l => { l.active = false; });
        layers.push(layer);
        if (layer.visible) group.addTo(map);
        return layer;
    }

    function cleanupElementDecorations(el, layer) {
        if (activePlainLineEndpointHandles && activePlainLineEndpointHandles.polyline === el) {
            removePlainLineEndpointHandles();
        }
        if (el._geoType === 'minefield') removeMinefieldDecorations(el);
        if (el._geoType === 'distance' && el._waypointMarkers) removeDistanceWaypointMarkers(el);
        if (el._rangeCircles && el._rangeCircles.length) {
            el._rangeCircles.forEach((c) => {
                clearGeoObstacleHatchLines(c);
                layer.group.removeLayer(c);
            });
            el._rangeCircles = [];
        }
        if (el._rangeSectors && el._rangeSectors.length) {
            el._rangeSectors.forEach((p) => {
                clearGeoObstacleHatchLines(p);
                layer.group.removeLayer(p);
            });
            el._rangeSectors = [];
        }
    }

    function removeLayer(layer) {
        layer.elements.forEach(el => {
            cleanupElementDecorations(el, layer);
            layer.group.removeLayer(el);
        });
        layer.elements.length = 0;
        if (layer.visible) map.removeLayer(layer.group);
        const idx = layers.indexOf(layer);
        if (idx >= 0) layers.splice(idx, 1);
        if (layer.active && layers.length > 0) {
            layers[0].active = true;
        }
        folders.forEach(f => {
            const li = f.layerIds.indexOf(layer.id);
            if (li >= 0) f.layerIds.splice(li, 1);
        });
    }

    function createFolder(name) {
        const id = 'folder-' + (folderIdCounter++);
        const folder = { id, name, layerIds: [], collapsed: false };
        folders.push(folder);
        return folder;
    }

    function removeFolder(folder, deleteLayers) {
        if (deleteLayers) {
            const layersToRemove = folder.layerIds.map(lid => layers.find(l => l.id === lid)).filter(Boolean);
            layersToRemove.forEach(l => removeLayer(l));
        }
        const idx = folders.indexOf(folder);
        if (idx >= 0) folders.splice(idx, 1);
    }

    function getFolderForLayer(layer) {
        return folders.find(f => f.layerIds.includes(layer.id)) || null;
    }

    function getUnfolderedLayers() {
        const folderedIds = new Set(folders.flatMap(f => f.layerIds));
        return layers.filter(l => !folderedIds.has(l.id));
    }

    function moveLayerToFolder(layer, folder) {
        folders.forEach(f => {
            const idx = f.layerIds.indexOf(layer.id);
            if (idx >= 0) f.layerIds.splice(idx, 1);
        });
        if (folder) folder.layerIds.push(layer.id);
    }

    function getFolderElementCount(folder) {
        return folder.layerIds.reduce((sum, lid) => {
            const l = layers.find(la => la.id === lid);
            return sum + (l ? l.elements.length : 0);
        }, 0);
    }

    function previousPolylineEraseGroupIdOnStack(layer) {
        for (let i = actionHistory.length - 1; i >= 0; i--) {
            const a = actionHistory[i];
            if (a.type === 'polylineErase' && a.layer && a.layer.id === layer.id && a.eraseGroupId != null) {
                return a.eraseGroupId;
            }
        }
        return null;
    }

    function undoPolylineEraseEntry(eraseAction) {
        const { layer, beforeState, fragmentSpecs } = eraseAction;
        removePolylinesForEraseUndo(layer, eraseAction);
        const restored = restorePlainPolylineFromEraseState(layer, beforeState);
        const polylineEraseRedoMatchId = ++polylineEraseRedoIdCounter;
        restored._polylineEraseRedoMatchId = polylineEraseRedoMatchId;
        let tagGid = null;
        if ('inheritedEraseGroupIdForUndo' in eraseAction) {
            tagGid = eraseAction.inheritedEraseGroupIdForUndo;
        } else {
            tagGid = previousPolylineEraseGroupIdOnStack(layer);
        }
        if (tagGid != null) {
            restored._polylineEraseGroupId = tagGid;
        }
        const stackHasOlderPolylineErase = actionHistory.some(
            (a) => a.type === 'polylineErase' && a.layer && a.layer.id === layer.id
        );
        actionHistory.push({
            type: 'add',
            element: restored,
            layer,
            polylineEraseRedoMatchId,
            fromPolylineEraseUndo: true,
            skipUndoRemovalForPolylineErase: stackHasOlderPolylineErase
        });
        const redoPe = {
            type: 'polylineErase',
            layer,
            beforeState,
            fragmentSpecs,
            restoredElement: restored,
            polylineEraseRedoMatchId
        };
        if ('inheritedEraseGroupIdForUndo' in eraseAction) {
            redoPe.inheritedEraseGroupIdForUndo = eraseAction.inheritedEraseGroupIdForUndo;
        }
        redoHistory.push(redoPe);
        if (layersListEl) renderLayersList();
        scheduleSaveToStorage();
        syncPlacementLayerInteractivity();
        return true;
    }

    function undoLastAction() {
        const action = actionHistory.pop();
        if (!action) return false;
        if (action.type === 'polylineErase') {
            return undoPolylineEraseEntry(action);
        }
        if (action.type === 'add' && action.skipUndoRemovalForPolylineErase) {
            const next = actionHistory.pop();
            if (!next || next.type !== 'polylineErase' || !next.layer || next.layer.id !== action.layer.id) {
                if (next) actionHistory.push(next);
                actionHistory.push(action);
                return false;
            }
            return undoPolylineEraseEntry(next);
        }
        if (action.type !== 'add') {
            actionHistory.push(action);
            return false;
        }
        const { element, layer } = action;
        if (element._geoType === 'minefield') removeMinefieldDecorations(element);
        if (element._geoType === 'distance' && element._waypointMarkers) removeDistanceWaypointMarkers(element);
        if (element._rangeCircles && element._rangeCircles.length) {
            element._rangeCircles.forEach(c => layer.group.removeLayer(c));
        }
        if (element._rangeSectors && element._rangeSectors.length) {
            element._rangeSectors.forEach(p => layer.group.removeLayer(p));
        }
        const idx = layer.elements.indexOf(element);
        if (idx >= 0) layer.elements.splice(idx, 1);
        layer.group.removeLayer(element);
        redoHistory.push(action);
        return true;
    }

    function redoLastAction() {
        const action = redoHistory.pop();
        if (!action) return false;
        if (action.type === 'polylineErase') {
            const { layer: layerRef, fragmentSpecs, beforeState, restoredElement, polylineEraseRedoMatchId } = action;
            const layer = resolveHistoryLayerRef(layerRef);
            if (!layer) {
                redoHistory.push(action);
                return false;
            }
            let polylinesToRemove = [];
            const top = actionHistory.length ? actionHistory[actionHistory.length - 1] : null;
            const topSameLayer = top && top.layer && top.layer.id === layer.id;
            if (top && top.type === 'add' && topSameLayer) {
                const refOk = restoredElement && top.element === restoredElement;
                const idOk = polylineEraseRedoMatchId != null && top.polylineEraseRedoMatchId === polylineEraseRedoMatchId;
                const geomOnAdd = plainPolylineMatchesBeforeState(beforeState, top.element);
                if (refOk || idOk || geomOnAdd) {
                    actionHistory.pop();
                    polylinesToRemove = [top.element];
                }
            }
            if (polylinesToRemove.length === 0) {
                polylinesToRemove = findPolylinesForEraseRedo(layer, beforeState, restoredElement);
            }
            if (polylinesToRemove.length === 0) {
                redoHistory.push(action);
                return false;
            }
            for (const elToRemove of polylinesToRemove) {
                if (activePlainLineEndpointHandles && activePlainLineEndpointHandles.polyline === elToRemove) {
                    removePlainLineEndpointHandles();
                }
                delete elToRemove._polylineEraseRedoMatchId;
            }
            const sortRemove = polylinesToRemove
                .map((el) => ({ el, ri: layer.elements.indexOf(el) }))
                .sort((a, b) => (b.ri >= 0 ? b.ri : -1) - (a.ri >= 0 ? a.ri : -1));
            for (const { el: elToRemove, ri } of sortRemove) {
                if (ri >= 0) layer.elements.splice(ri, 1);
                try {
                    layer.group.removeLayer(elToRemove);
                } catch (_) { /* already removed */ }
            }
            const opts = {
                color: beforeState.color,
                weight: beforeState.weight != null ? beforeState.weight : (beforeState.isFreehand ? 3 : 4),
                dashArray: beforeState.dashArray,
                opacity: beforeState.opacity != null ? beforeState.opacity : 1
            };
            const fragmentElements = [];
            const eraseGroupId = ++polylineEraseGroupIdCounter;
            fragmentSpecs.forEach((spec) => {
                const latlngs = spec.latlngs.map((ll) => L.latLng(ll.lat, ll.lng));
                const p = L.polyline(latlngs, opts);
                p._layerId = layer.id;
                p._polylineEraseGroupId = eraseGroupId;
                if (beforeState.isFreehand) {
                    p._geoType = 'freehand';
                    p._geoData = { points: latlngs, color: beforeState.geoColor || beforeState.color };
                    wireFreehandPolyline(p);
                } else {
                    if (beforeState.displayName) p._lineDisplayName = beforeState.displayName;
                    if (beforeState.baseLineWeight != null) p._baseLineWeight = beforeState.baseLineWeight;
                    wireTacticalLinePolyline(p);
                }
                layer.elements.push(p);
                layer.group.addLayer(p);
                fragmentElements.push(p);
            });
            const polyEraseReplay = {
                type: 'polylineErase',
                layer,
                beforeState,
                fragmentSpecs,
                fragmentElements,
                eraserGestureId: null,
                eraseGroupId
            };
            if ('inheritedEraseGroupIdForUndo' in action) {
                polyEraseReplay.inheritedEraseGroupIdForUndo = action.inheritedEraseGroupIdForUndo;
            }
            actionHistory.push(polyEraseReplay);
            syncPlacementLayerInteractivity();
            if (layersListEl) renderLayersList();
            scheduleSaveToStorage();
            return true;
        }
        if (action.type !== 'add') {
            redoHistory.push(action);
            return false;
        }
        const { element, layer } = action;
        layer.elements.push(element);
        layer.group.addLayer(element);
        if (element._geoType === 'minefield') {
            const d = element._geoData;
            const lls = element.getLatLngs();
            const ring = (lls[0] && Array.isArray(lls[0])) ? lls[0] : lls;
            setTimeout(() => {
                applyMinefieldFill(element);
                addMinefieldDecorations(element, ring, d.color, element._layerId);
            }, 50);
        }
        if (element._rangeCircles && element._rangeCircles.length) {
            element._rangeCircles.forEach(c => layer.group.addLayer(c));
        }
        if (element._rangeSectors && element._rangeSectors.length) {
            element._rangeSectors.forEach(p => layer.group.addLayer(p));
        }
        actionHistory.push(action);
        syncPlacementLayerInteractivity();
        return true;
    }

    createLayer('Layer 1');

    // UI Elements
    const coordSystemSelect = document.getElementById('coord-system-select');
    const modeSelect = document.getElementById('tool-mode');
    const instructionText = document.getElementById('instruction-text');
    const symbolManager = document.getElementById('symbol-manager');
    const lineManager = document.getElementById('line-manager');
    const lineStyleSelect = document.getElementById('line-style');
    const layersListEl = document.getElementById('layers-list');
    const tmgGrid = document.getElementById('tmg-grid');
    const missionAssistPanel = document.getElementById('mission-graphic-assist');
    const missionAssistTitle = document.getElementById('mission-assist-title');
    const missionAssistHint = document.getElementById('mission-assist-hint');
    const missionAssistStepEls = missionAssistPanel ? Array.from(missionAssistPanel.querySelectorAll('.mission-assist-step')) : [];
    const missionAssistStep1 = document.getElementById('mission-assist-step1');
    const missionAssistStep2 = document.getElementById('mission-assist-step2');
    const missionAssistStep3 = document.getElementById('mission-assist-step3');
    const MISSION_ASSIST_TYPES = new Set(['attack', 'main-attack', 'counterattack', 'counterattack-by-fire']);

    function isMissionAssistType(typeId) {
        return MISSION_ASSIST_TYPES.has(typeId);
    }

    function syncMissionPickerFocus() {
        if (!tmgGrid) return;
        const focused = currentMode === 'line' && isMissionAssistType(selectedTmgType);
        tmgGrid.classList.toggle('mission-focus', focused);
        tmgGrid.querySelectorAll('.tmg-btn').forEach((btn) => {
            const isRelated = isMissionAssistType(btn.dataset.tmgId);
            btn.classList.toggle('mission-related', isRelated);
            btn.classList.toggle('deemphasized', focused && !isRelated);
        });
    }

    function updateMissionGraphicAssist() {
        if (!missionAssistPanel) return;
        const active = currentMode === 'line' && isMissionAssistType(selectedTmgType);
        missionAssistPanel.classList.toggle('hidden', !active);
        if (!active) return;
        const selectedDef = TACTICAL_GRAPHICS.find((d) => d.id === selectedTmgType);
        if (missionAssistTitle) missionAssistTitle.textContent = t('mission-assist-title', getTmgLabel(selectedDef));
        if (missionAssistStep1) missionAssistStep1.textContent = t('mission-assist-step1');
        if (missionAssistStep2) missionAssistStep2.textContent = t('mission-assist-step2');
        if (missionAssistStep3) missionAssistStep3.textContent = t('mission-assist-step3');

        let activeStep = 1;
        let hintKey = 'mission-assist-hint-step1';
        if (catkPlacementState?.phase === 'tailPlaced') {
            activeStep = 2;
            hintKey = 'mission-assist-hint-step2';
        } else if (catkPlacementState?.phase === 'bodyDrawing') {
            activeStep = 3;
            hintKey = (catkPlacementState?.bodyPoints?.length || 0) > 0
                ? 'mission-assist-hint-step3b'
                : 'mission-assist-hint-step3a';
        }
        missionAssistStepEls.forEach((el, idx) => {
            const stepNum = idx + 1;
            el.classList.toggle('active', stepNum === activeStep);
            el.classList.toggle('done', stepNum < activeStep);
        });
        if (missionAssistHint) missionAssistHint.textContent = t(hintKey);
    }

    // Geographical Tools
    const drawingPanel = document.getElementById('drawing-panel');
    const geoPanel = document.getElementById('geo-panel');
    const geoToolSelect = document.getElementById('geo-tool-select');
    const geoDistanceOptions = document.getElementById('geo-distance-options');
    const geoRangeCircleOptions = document.getElementById('geo-range-circle-options');
    const geoRangeSectorOptions = document.getElementById('geo-range-sector-options');
    const geoRadiusInput = document.getElementById('geo-radius-input');
    const geoSectorRadiusInput = document.getElementById('geo-sector-radius-input');
    const geoBearingInput = document.getElementById('geo-bearing-input');
    const geoApertureInput = document.getElementById('geo-aperture-input');
    const geoSemiRadiusInput = document.getElementById('geo-semi-radius-input');
    const geoSemiBearingInput = document.getElementById('geo-semi-bearing-input');
    const geoPolygonSidesInput = document.getElementById('geo-polygon-sides-input');
    const geoPolygonRadiusInput = document.getElementById('geo-polygon-radius-input');
    const geoPolygonRotationInput = document.getElementById('geo-polygon-rotation-input');
    const geoCircle2ptOptions = document.getElementById('geo-circle-2pt-options');
    const geoSemiCircleOptions = document.getElementById('geo-semi-circle-options');
    const geoRectangleOptions = document.getElementById('geo-rectangle-options');
    const geoOvalOptions = document.getElementById('geo-oval-options');
    const geoPolygonOptions = document.getElementById('geo-polygon-options');
    const geoFreeformOptions = document.getElementById('geo-freeform-options');
    const geoFreehandOptions = document.getElementById('geo-freehand-options');
    const geoMinefieldOptions = document.getElementById('geo-minefield-options');
    const geoDrawingControls = document.getElementById('geo-drawing-controls');
    const finishGeoPolygonBtn = document.getElementById('finish-geo-polygon-btn');
    const cancelGeoPolygonBtn = document.getElementById('cancel-geo-polygon-btn');

    let geoDistancePoints = [];
    let geoDistancePolyline = null;
    let geoFreehandPoints = [];
    let geoFreehandPreview = null;
    let isFreehandDrawing = false;
    let freehandEraserMode = false;
    let freehandTrimmerMode = false;
    let isTrimmerDragging = false;
    let lastTrimmerScreenPos = null;
    const TRIMMER_MIN_PX = 6;
    let isEraserDragging = false;
    let lastEraserScreenPos = null;
    const ERASER_DRAG_MIN_PX = 4;
    let eraserGestureSequence = 0;
    /** Non-zero while pointer is down in eraser mode; same id for mousedown + moves until mouseup. */
    let eraserActiveGestureId = 0;
    let geoFreehandLastScreenPos = null;
    let mapDrawActivePointerId = null;
    const GEO_FREEHAND_MIN_PX = 3;
    let geoCircle2ptPoints = [];
    let geoCircle2ptPreview = null;
    let geoRectanglePoints = [];
    let geoRectanglePreview = null;
    let geoOvalPoints = [];
    let geoOvalPreview = null;
    let geoMinefieldPoints = [];
    let geoMinefieldPreview = null;
    let geoFreeformPoints = [];
    let geoFreeformPreview = null;

    function isGeoPanelActive() {
        return geoPanel && !geoPanel.classList.contains('hidden');
    }

    function getGeoSelectedTool() {
        return geoToolSelect?.value || 'none';
    }

    function updateMapTouchDrawClass() {
        const el = map?.getContainer?.();
        if (!el) return;
        const freehandGeo = isGeoPanelActive() && getGeoSelectedTool() === 'freehand';
        const need = freehandGeo || currentMode === 'eraser' || currentMode === 'select';
        el.classList.toggle('map-touch-draw', need);
    }

    function getCoordSystem() {
        return coordSystemSelect?.value || 'wgs84';
    }

    function formatCoordForDisplay(lat, lng) {
        if (lat == null || lng == null || isNaN(lat) || isNaN(lng)) return '—';
        const system = getCoordSystem();
        return typeof CoordUtils !== 'undefined' ? CoordUtils.format(lat, lng, system) : (lat.toFixed(6) + '\u00B0, ' + lng.toFixed(6) + '\u00B0');
    }

    function parseCoordInput(str) {
        if (!str || typeof str !== 'string') return null;
        const system = getCoordSystem();
        if (typeof CoordUtils !== 'undefined') {
            const p = CoordUtils.parse(str.trim(), system);
            if (p && p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180) return p;
            return null;
        }
        const parts = str.split(/[\s,;]+/).map(x => parseFloat(String(x).replace(/[^\d.-]/g, '')));
        if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            const lat = parts[0], lng = parts[1];
            if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
        }
        return null;
    }

    function coordInputHtml(className, lat, lng, attrs, inputStyle) {
        const extraAttrs = attrs || '';
        const style = inputStyle || 'width:100%;max-width:200px;padding:4px 6px;font-size:0.75rem;border:1px solid #cbd5e1;border-radius:4px;';
        if (getCoordSystem() !== 'dms') {
            const val = formatCoordForDisplay(lat, lng);
            return `<input type="text" class="${className}" ${extraAttrs} value="${escapeHtml(val)}" style="${style}">`;
        }
        const latP = decimalToDmsParts(lat, true);
        const lngP = decimalToDmsParts(lng, false);
        const dmsInputStyle = 'width:56px;padding:3px 4px;font-size:0.72rem;border:1px solid #cbd5e1;border-radius:4px;';
        const secInputStyle = 'width:64px;padding:3px 4px;font-size:0.72rem;border:1px solid #cbd5e1;border-radius:4px;';
        const hemStyle = 'width:52px;padding:3px 4px;font-size:0.72rem;border:1px solid #cbd5e1;border-radius:4px;';
        return `<div class="${className} coord-dms-editor" ${extraAttrs} style="display:flex;flex-direction:column;gap:6px;max-width:280px;">
            <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
                <input type="number" class="coord-dms-deg" data-axis="lat" value="${latP.deg}" min="0" max="90" step="1" style="${dmsInputStyle}">
                <input type="number" class="coord-dms-min" data-axis="lat" value="${latP.min}" min="0" max="59" step="1" style="${dmsInputStyle}">
                <input type="number" class="coord-dms-sec" data-axis="lat" value="${latP.sec}" min="0" max="59.9" step="0.1" style="${secInputStyle}">
                <select class="coord-dms-hem" data-axis="lat" style="${hemStyle}">
                    <option value="N"${latP.hem === 'N' ? ' selected' : ''}>N</option>
                    <option value="S"${latP.hem === 'S' ? ' selected' : ''}>S</option>
                </select>
            </div>
            <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;">
                <input type="number" class="coord-dms-deg" data-axis="lng" value="${lngP.deg}" min="0" max="180" step="1" style="${dmsInputStyle}">
                <input type="number" class="coord-dms-min" data-axis="lng" value="${lngP.min}" min="0" max="59" step="1" style="${dmsInputStyle}">
                <input type="number" class="coord-dms-sec" data-axis="lng" value="${lngP.sec}" min="0" max="59.9" step="0.1" style="${secInputStyle}">
                <select class="coord-dms-hem" data-axis="lng" style="${hemStyle}">
                    <option value="E"${lngP.hem === 'E' ? ' selected' : ''}>E</option>
                    <option value="W"${lngP.hem === 'W' ? ' selected' : ''}>W</option>
                </select>
            </div>
        </div>`;
    }

    function parseDmsEditorElement(el) {
        if (!el) return null;
        const pickNum = (axis, cls) => {
            const v = parseFloat(el.querySelector(`.${cls}[data-axis="${axis}"]`)?.value);
            return isFinite(v) ? v : NaN;
        };
        const pickHem = (axis) => String(el.querySelector(`.coord-dms-hem[data-axis="${axis}"]`)?.value || '').toUpperCase();
        const latDeg = pickNum('lat', 'coord-dms-deg');
        const latMin = pickNum('lat', 'coord-dms-min');
        const latSec = pickNum('lat', 'coord-dms-sec');
        const lngDeg = pickNum('lng', 'coord-dms-deg');
        const lngMin = pickNum('lng', 'coord-dms-min');
        const lngSec = pickNum('lng', 'coord-dms-sec');
        const latHem = pickHem('lat');
        const lngHem = pickHem('lng');
        if (![latDeg, latMin, latSec, lngDeg, lngMin, lngSec].every((n) => isFinite(n))) return null;
        if (!(latHem === 'N' || latHem === 'S') || !(lngHem === 'E' || lngHem === 'W')) return null;
        if (latDeg < 0 || latDeg > 90 || lngDeg < 0 || lngDeg > 180) return null;
        if (latMin < 0 || latMin >= 60 || lngMin < 0 || lngMin >= 60) return null;
        if (latSec < 0 || latSec >= 60 || lngSec < 0 || lngSec >= 60) return null;
        let lat = latDeg + (latMin / 60) + (latSec / 3600);
        let lng = lngDeg + (lngMin / 60) + (lngSec / 3600);
        if (latHem === 'S') lat = -lat;
        if (lngHem === 'W') lng = -lng;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
        return { lat, lng };
    }

    function parseCoordInputElement(el) {
        if (!el) return null;
        if (el.classList?.contains('coord-dms-editor')) return parseDmsEditorElement(el);
        if (el.querySelector?.('.coord-dms-deg')) return parseDmsEditorElement(el);
        return parseCoordInput(el.value);
    }

    function bindCoordEditorEvents(el, applyCoord) {
        if (!el || typeof applyCoord !== 'function') return;
        if (el.classList?.contains('coord-dms-editor')) {
            el.querySelectorAll('input, select').forEach((field) => {
                field.addEventListener('blur', applyCoord);
                field.addEventListener('change', applyCoord);
                field.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        applyCoord();
                    }
                });
            });
            return;
        }
        el.addEventListener('blur', applyCoord);
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                el.blur();
            }
        });
    }

    function getGeoColor() {
        const btn = geoPanel?.querySelector('.geo-color-btn.active');
        return btn?.dataset.color || '#3b82f6';
    }

    function getGeoFillStyle() {
        return geoPanel?.querySelector('#geo-fill-style-select')?.value || DEFAULT_GEO_FILL_STYLE;
    }

    function latLngAtBearing(center, radiusKm, bearingDeg) {
        const radiusM = radiusKm * 1000;
        const b = bearingDeg * Math.PI / 180;
        const lat = center.lat + (radiusM / 111320) * Math.cos(b);
        const lng = center.lng + (radiusM / (111320 * Math.cos(center.lat * Math.PI / 180))) * Math.sin(b);
        return L.latLng(lat, lng);
    }

    /** Double-click to finish fires two click events at ~the same place; treat as one vertex (not two). */
    const GEO_DISTANCE_DUPLICATE_VERTEX_METERS = 0.35;

    /** Remove consecutive duplicates from a LatLng array (mutates). */
    function dedupeConsecutiveDistancePointsMutate(arr) {
        if (!arr || arr.length < 2) return;
        let i = 1;
        while (i < arr.length) {
            const a = arr[i - 1];
            const b = arr[i];
            const m = haversineDistance(a.lat, a.lng, b.lat, b.lng);
            if (m < GEO_DISTANCE_DUPLICATE_VERTEX_METERS) arr.splice(i, 1);
            else i++;
        }
    }

    /** Geo/line popup inputs show primary unit; geometry stays in km. */
    function parseDistancePopupInputToKm(valueStr) {
        const v = parseFloat(String(valueStr).replace(',', '.'));
        if (!isFinite(v)) return NaN;
        return getDistanceUnitPrimary() === 'nm' ? nauticalMilesToKm(v) : v;
    }

    const DISTANCE_UNIT_STORAGE_KEY = 'rmooz-distance-unit-primary';

    function getDistanceUnitPrimary() {
        try {
            return localStorage.getItem(DISTANCE_UNIT_STORAGE_KEY) === 'nm' ? 'nm' : 'km';
        } catch (e) {
            return 'km';
        }
    }

    function setDistanceUnitPrimary(unit) {
        try {
            localStorage.setItem(DISTANCE_UNIT_STORAGE_KEY, unit === 'nm' ? 'nm' : 'km');
        } catch (e) { /* quota / disabled */ }
    }

    /**
     * Primary unit first, alternate in parentheses. LTR isolates for RTL UI.
     * Preference: top-bar “km / NM” toggle (localStorage).
     */
    function formatKmAndNm(km, decimals = 2) {
        const k = Number(km);
        if (!isFinite(k)) return '—';
        const nm = kmToNauticalMiles(k);
        const kmStr = k.toFixed(decimals);
        const nmStr = isFinite(nm) ? nm.toFixed(decimals) : '—';
        const inner = getDistanceUnitPrimary() === 'nm'
            ? `${nmStr} NM (${kmStr} km)`
            : `${kmStr} km (${nmStr} NM)`;
        return '\u2066' + inner + '\u2069';
    }

    /** Parenthetical hint when the numeric input stays in km (line/geo path & radius rows). */
    function formatDistanceSecondaryHintFromKm(km, decimals = 2) {
        const k = Number(km);
        if (!isFinite(k)) return '';
        if (getDistanceUnitPrimary() === 'nm') {
            return '(\u2066' + k.toFixed(decimals) + ' km\u2069)';
        }
        const nm = kmToNauticalMiles(k);
        return isFinite(nm) ? '(\u2066' + nm.toFixed(decimals) + ' NM\u2069)' : '';
    }

    function formatDistanceSecondaryHintSpanFromKm(km, decimals, className, styleStr) {
        const inner = formatDistanceSecondaryHintFromKm(km, decimals);
        if (!inner) return '';
        const st = styleStr || 'font-size:0.7rem;color:#64748b;unicode-bidi:isolate;';
        return `<span class="${className}" dir="ltr" style="${st}">${inner}</span>`;
    }

    /** Shown after “≈” under length/radius inputs (alternate unit). */
    function formatApproxAlternateDistanceFromKm(km, decimals = 2) {
        const k = Number(km);
        if (!isFinite(k)) return '—';
        if (getDistanceUnitPrimary() === 'nm') {
            return k.toFixed(decimals) + ' km';
        }
        const nm = kmToNauticalMiles(k);
        return isFinite(nm) ? nm.toFixed(decimals) + ' NM' : '—';
    }

    function scaleLatLngsAboutPivot(pts, pivot, factor) {
        if (!pivot || !pts?.length || !isFinite(factor) || factor <= 0) return null;
        return pts.map((p) => {
            const ll = L.latLng(p.lat ?? p[0], p.lng ?? p[1]);
            const distM = haversineDistance(pivot.lat, pivot.lng, ll.lat, ll.lng);
            if (distM < 0.05) return L.latLng(ll.lat, ll.lng);
            const brg = bearingDegrees(pivot, ll);
            return latLngAtBearing(pivot, (distM * factor) / 1000, brg);
        });
    }

    function maxCornerSpanKmFromPivot(pivot, corners) {
        if (!pivot || !corners?.length) return 0;
        let m = 0;
        corners.forEach((p) => {
            if (!p) return;
            const ll = L.latLng(p.lat ?? p[0], p.lng ?? p[1]);
            m = Math.max(m, haversineDistance(pivot.lat, pivot.lng, ll.lat, ll.lng));
        });
        return m / 1000;
    }

    function getFreeformVerticesForKm(el, d) {
        let pts = [];
        if (d?.points?.length >= 3) {
            pts = d.points.map(p => L.latLng(p.lat ?? p[0], p.lng ?? p[1]));
        } else if (el?.getLatLngs) {
            const rings = el.getLatLngs();
            const raw = (Array.isArray(rings[0]) && rings[0][0] && (rings[0][0].lat != null || rings[0][0][0] != null))
                ? rings[0]
                : (Array.isArray(rings[0]) ? rings : rings);
            pts = raw.map(p => L.latLng(p.lat ?? p[0], p.lng ?? p[1]));
        }
        if (pts.length > 3) {
            const a = pts[0];
            const z = pts[pts.length - 1];
            if (Math.abs(a.lat - z.lat) < 1e-9 && Math.abs(a.lng - z.lng) < 1e-9) pts = pts.slice(0, -1);
        }
        return pts;
    }

    function createSectorPolygon(center, radiusKm, bearingDeg, apertureDeg) {
        const radiusM = radiusKm * 1000;
        const bearing = (bearingDeg - apertureDeg / 2) * Math.PI / 180;
        const endBearing = (bearingDeg + apertureDeg / 2) * Math.PI / 180;
        const steps = Math.max(8, Math.ceil(apertureDeg / 5));
        const points = [center];
        for (let i = 0; i <= steps; i++) {
            const b = bearing + (endBearing - bearing) * i / steps;
            const lat = center.lat + (radiusM / 111320) * Math.cos(b);
            const lng = center.lng + (radiusM / (111320 * Math.cos(center.lat * Math.PI / 180))) * Math.sin(b);
            points.push(L.latLng(lat, lng));
        }
        points.push(center);
        return points;
    }

    function createRegularPolygon(center, radiusKm, sides, rotationDeg) {
        const radiusM = radiusKm * 1000;
        const points = [];
        for (let i = 0; i < sides; i++) {
            const angle = (rotationDeg + (360 * i) / sides) * Math.PI / 180;
            const lat = center.lat + (radiusM / 111320) * Math.cos(angle);
            const lng = center.lng + (radiusM / (111320 * Math.cos(center.lat * Math.PI / 180))) * Math.sin(angle);
            points.push(L.latLng(lat, lng));
        }
        return points;
    }

    function createRectangleCorners(corner1, corner2) {
        return [
            corner1,
            L.latLng(corner1.lat, corner2.lng),
            corner2,
            L.latLng(corner2.lat, corner1.lng)
        ];
    }

    /** Axis-aligned ellipse in map layer space, inside the bounding box of the four geographic corners. */
    function createEllipseRingFromBoundingCorners(corners, mapRef, steps = 64) {
        if (!mapRef || !corners || corners.length < 2) return [];
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        corners.forEach((ll) => {
            if (!ll || ll.lat == null || ll.lng == null) return;
            const p = mapRef.latLngToLayerPoint(ll);
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
        });
        const minPx = 4;
        if (!(maxX > minX)) {
            const c = (minX + maxX) / 2;
            minX = c - minPx;
            maxX = c + minPx;
        }
        if (!(maxY > minY)) {
            const c = (minY + maxY) / 2;
            minY = c - minPx;
            maxY = c + minPx;
        }
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const rx = (maxX - minX) / 2;
        const ry = (maxY - minY) / 2;
        const n = Math.max(32, Math.min(96, steps));
        const out = [];
        for (let i = 0; i <= n; i++) {
            const t = (i / n) * 2 * Math.PI;
            out.push(mapRef.layerPointToLatLng(L.point(cx + rx * Math.cos(t), cy + ry * Math.sin(t))));
        }
        return out;
    }

    function syncOvalPolygonFromCorners(polygon) {
        const d = polygon?._geoData;
        if (!d?.corners || d.corners.length !== 4) return;
        const ring = createEllipseRingFromBoundingCorners(d.corners, map, 64);
        polygon.setLatLngs([ring]);
    }

    function getLineColor() {
        const active = lineManager.querySelector('.line-color-btn.active');
        return active ? active.dataset.color : '#ef4444';
    }

    function getTmgStrokeWidth() {
        const el = document.getElementById('tmg-width-input');
        if (!el) return 4;
        const v = parseFloat(el.value);
        return (v >= 1 && v <= 30) ? v : 4;
    }

    function getTmgDefaultLengthKm() {
        const el = document.getElementById('tmg-length-input');
        if (!el) return 0.5;
        const km = parseDistancePopupInputToKm(el.value);
        return (isFinite(km) && km >= 0.1 && km <= 50) ? km : 0.5;
    }

    function getTmgArrowHeadScale() {
        const el = document.getElementById('tmg-arrow-tip-input');
        if (!el) return 1.0;
        const v = parseFloat(el.value);
        return (v >= 0.3 && v <= 4.0) ? v : 1.0;
    }

    function refreshTmgSidebarLengthForUnit() {
        const el = document.getElementById('tmg-length-input');
        const lab = document.getElementById('tmg-length-field-label');
        if (!el) return;
        let km = parseDistancePopupInputToKm(el.value);
        if (!isFinite(km) || km < 0.1) km = 0.5;
        if (km > 50) km = 50;
        const nmFirst = getDistanceUnitPrimary() === 'nm';
        if (nmFirst) {
            const nm = kmToNauticalMiles(km);
            el.value = isFinite(nm) ? String(Math.round(nm * 10000) / 10000) : '0.27';
            el.min = '0.00054';
            el.step = '0.0001';
            el.max = '27';
            if (lab) {
                lab.textContent = typeof t === 'function' ? t('tmg-length-label-nm') : 'Length (NM):';
            }
        } else {
            el.value = String(Math.round(km * 100) / 100);
            el.min = '0.1';
            el.step = '0.1';
            el.max = '50';
            if (lab) {
                lab.textContent = typeof t === 'function' ? t('tmg-length-label-km') : 'Length (km):';
            }
        }
    }

    function getTmgLabel(def) {
        return (typeof t === 'function' ? t('tmg-' + def.id) : null) || def.label;
    }
    //new line

    function distancePointToSegment(point, v, w) {
        const l2 = v.distanceTo(w) ** 2;
        if (l2 === 0) return point.distanceTo(v);
        let t = ((point.x - v.x) * (w.x - v.x) + (point.y - v.y) * (w.y - v.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        const proj = L.point(v.x + t * (w.x - v.x), v.y + t * (w.y - v.y));
        return point.distanceTo(proj);
    }

    function simplifyPolylinePoints(points, tolerancePx) {
        if (!points || points.length < 3 || !map) return points;

        const layerPoints = points.map((p) => map.latLngToLayerPoint(p));

        function rdp(start, end) {
            let maxDist = 0;
            let index = -1;
            for (let i = start + 1; i < end; i++) {
                const d = distancePointToSegment(layerPoints[i], layerPoints[start], layerPoints[end]);
                if (d > maxDist) {
                    maxDist = d;
                    index = i;
                }
            }
            if (maxDist > tolerancePx) {
                const left = rdp(start, index);
                const right = rdp(index, end);
                return left.slice(0, -1).concat(right);
            }
            return [points[start], points[end]];
        }

        return rdp(0, points.length - 1);
    }

    function convertPolylineToTmgScalloped(polyline) {
        if (!polyline || typeof polyline.getLatLngs !== 'function') return;
        const pts = polyline.getLatLngs() || [];
        const flatPts = Array.isArray(pts[0]) ? pts.flat() : pts;
        if (!flatPts || flatPts.length < 2) return;

        const snapRadius = getCircleXSnapPx();
        const magnetizedPts = flatPts.map(pt => {
            const center = findClosestCircleXCenter(pt, snapRadius);
            return center ? center : pt;
        });

        const freeDrawAffiliation = (typeof window.freeDrawSignatureAffiliation === 'string') ? window.freeDrawSignatureAffiliation : null;
        const colorOpt = (polyline.options?.color || '').toString().toLowerCase();

        let affiliation = 'friendly';
        if (freeDrawAffiliation === 'enemy' || freeDrawAffiliation === 'friendly') {
            affiliation = freeDrawAffiliation;
        } else if (colorOpt.includes('#ef4444') || colorOpt.includes('red')) {
            affiliation = 'enemy';
        }

        const color = (affiliation === 'enemy') ? '#ef4444' : '#3b82f6';
        const strokeWidth = getTmgStrokeWidth();

        // Snap endpoints directly to the nearest circle center (if within range)
        if (magnetizedPts.length >= 2) {
            const possibleFirst = findClosestCircleXCenter(magnetizedPts[0], snapRadius);
            if (possibleFirst) magnetizedPts[0] = possibleFirst;

            const possibleLast = findClosestCircleXCenter(magnetizedPts[magnetizedPts.length - 1], snapRadius);
            if (possibleLast) magnetizedPts[magnetizedPts.length - 1] = possibleLast;
        }

        // Simplify rough hand-made lines to clean straight run for front line edge.
        const simplifiedPts = simplifyPolylinePoints(magnetizedPts, 10);
        const finalPts = simplifiedPts.length >= 2 ? simplifiedPts : magnetizedPts;

        // Keep the control line hidden in the background and create scalloped segments on top.
        // Mark it so future findPlainLinePolylines calls won't pick it up and re-convert it.
        polyline._tmgData = { typeId: 'scalloped-source', sessionId: window.freeDrawSignatureSessionId };
        polyline.setStyle({ color: 'rgba(0,0,0,0)', opacity: 0, interactive: false });

        const chordPairs = expandScallopedControlPointsToChordPairs(finalPts);
        for (let pi = 0; pi < chordPairs.length; pi++) {
            const useBodyOnly = pi < chordPairs.length - 1;
            const seg = createTmgLayer(chordPairs[pi].a, chordPairs[pi].b, 'scalloped', color, useBodyOnly, false, { strokeWidth });
            if (seg) {
                seg._tmgData.sessionId = window.freeDrawSignatureSessionId || null;
                addToActiveLayer(seg);
            }
        }

        scheduleSaveToStorage();
    }

    window.convertPlainLineToTmgScalloped = convertPolylineToTmgScalloped;

    function getScallopedSegments() {
        const sessionId = window.freeDrawSignatureSessionId;
        const segments = [];
        getAllLayerElements().forEach(el => {
            if (el instanceof L.LayerGroup && el._tmgData?.typeId === 'scalloped' && Array.isArray(el._tmgData.segments)) {
                el._tmgData.segments.forEach(seg => {
                    if (seg?._tmgData?.typeId === 'scalloped') {
                        // When a session is active, only include segments from THIS session
                        if (sessionId) {
                            if (seg._tmgData.sessionId !== sessionId) return;
                        }
                        segments.push(seg);
                    }
                });
            } else if (el instanceof L.Marker && el._tmgData?.typeId === 'scalloped') {
                if (sessionId) {
                    if (el._tmgData.sessionId !== sessionId) return;
                }
                segments.push(el);
            }
        });
        return segments;
    }

    function getFrontLineAxisFromCircleCenters() {
        const centers = getCircleXCenters();
        if (!map || centers.length < 2) return null;

        const first = map.latLngToLayerPoint(centers[0]);
        const last = map.latLngToLayerPoint(centers[centers.length - 1]);
        const dx = last.x - first.x;
        const dy = last.y - first.y;
        const len = Math.hypot(dx, dy);
        if (len === 0) return null;

        const ax = dx / len;
        const ay = dy / len;
        return { origin: first, axis: { x: ax, y: ay } };
    }

    function getFrontLineAxis() {
        // Prefer the FRONT LINE (scalloped) draw direction — that determines CW/CCW.
        // Only fall back to circle centers if no scalloped segments exist.
        const segments = getScallopedSegments();
        if (segments.length > 0) {
            let sumDx = 0;
            let sumDy = 0;
            const points = [];
            segments.forEach(seg => {
                const data = seg._tmgData;
                if (data && data.latlng1 && data.latlng2) {
                    const p1 = map.latLngToLayerPoint(data.latlng1);
                    const p2 = map.latLngToLayerPoint(data.latlng2);
                    sumDx += (p2.x - p1.x);
                    sumDy += (p2.y - p1.y);
                    points.push(p1);
                }
            });
            if (points.length > 0 && (sumDx !== 0 || sumDy !== 0)) {
                const len = Math.hypot(sumDx, sumDy);
                const ax = sumDx / len;
                const ay = sumDy / len;
                return { origin: points[0], axis: { x: ax, y: ay } };
            }
        }

        const circleAxis = getFrontLineAxisFromCircleCenters();
        if (circleAxis) return circleAxis;

        return null;
    }

    /**
     * Which side of the front axis the scalloped segments bulge toward (+1 / −1).
     * @param {L.LatLng[]} [orderedAlongFront] – circle centres in **front-line order** (same as
     *    `orderCentersAlongAxis`). When omitted, falls back to `getCircleXCenters()` order, which
     *    can disagree with travel along the scallop and invert the offset side.
     */
    function getFrontSideFromScallops(orderedAlongFront) {
        const centers = (orderedAlongFront && orderedAlongFront.length >= 2)
            ? orderedAlongFront
            : getCircleXCenters();
        if (!map || centers.length < 2) return null;

        const start = map.latLngToLayerPoint(centers[0]);
        const end = map.latLngToLayerPoint(centers[centers.length - 1]);
        const lineLen = Math.hypot(end.x - start.x, end.y - start.y);
        if (lineLen === 0) return null;
        const ux = (end.x - start.x) / lineLen;
        const uy = (end.y - start.y) / lineLen;

        const scalloped = getScallopedSegments();
        if (!scalloped.length) return null;

        let signSum = 0;
        let count = 0;
        scalloped.forEach(seg => {
            const data = seg._tmgData;
            if (!data || !data.latlng1 || !data.latlng2) return;
            const p1 = map.latLngToLayerPoint(data.latlng1);
            const p2 = map.latLngToLayerPoint(data.latlng2);
            const mx = (p1.x + p2.x) / 2;
            const my = (p1.y + p2.y) / 2;
            const dot = (mx - start.x) * ux + (my - start.y) * uy;
            const proj = L.point(start.x + dot * ux, start.y + dot * uy);
            const offX = mx - proj.x;
            const offY = my - proj.y;
            const cross = ux * offY - uy * offX;
            if (cross !== 0) {
                signSum += Math.sign(cross);
                count += 1;
            }
        });
        if (count === 0) return null;
        if (signSum === 0) return null;
        return signSum > 0 ? 1 : -1;
    }

    function getFrontLineProjection(circle) {
        const segments = getScallopedSegments();
        let axisData = null;
        if (segments.length > 0) {
            axisData = getFrontLineAxis();
        } else {
            axisData = getFrontLineAxisFromCircleCenters();
        }
        if (!axisData || !circle || !map) return null;

        const circlePoint = map.latLngToLayerPoint(circle);
        const ox = axisData.origin.x;
        const oy = axisData.origin.y;
        const ax = axisData.axis.x;
        const ay = axisData.axis.y;

        // Project onto INFINITE line (no clamping) — t can be any value
        const t = (circlePoint.x - ox) * ax + (circlePoint.y - oy) * ay;
        const projPoint = L.point(ox + t * ax, oy + t * ay);
        const projLatLng = map.layerPointToLatLng(projPoint);

        // Forward bearing along the axis direction.
        // Use 1000px offset for numerical stability — 1px is too small and causes bearing jitter.
        const BEARING_SCALE_PX = 1000;
        const axisOriginLatLng = map.layerPointToLatLng(L.point(ox, oy));
        const axisEndPoint = map.layerPointToLatLng(L.point(ox + ax * BEARING_SCALE_PX, oy + ay * BEARING_SCALE_PX));
        const forwardBearing = bearingDegrees(axisOriginLatLng, axisEndPoint);

        // Side: cross product of axis with (circle - proj) gives perpendicular offset sign
        const dx = circlePoint.x - projPoint.x;
        const dy = circlePoint.y - projPoint.y;
        const cross = ax * dy - ay * dx;

        return {
            circle,
            projLatLng,
            forwardBearing,
            sideSign: cross === 0 ? 1 : Math.sign(cross)
        };
    }

    /** Obstacle polygons from maps/obstacle.geojson — used to clip auto flank lines. */
    let obstaclePolygons = [];
    let obstacleGeoLoadPromise = null;

    function parseObstacleGeoJSON(fc) {
        const polys = [];
        if (!fc) return polys;
        const feats = fc.type === 'FeatureCollection' ? fc.features : (fc.type === 'Feature' ? [fc] : []);
        for (let fi = 0; fi < feats.length; fi++) {
            const g = feats[fi].geometry;
            if (!g) continue;
            if (g.type === 'Polygon') {
                const rings = g.coordinates || [];
                if (rings[0] && rings[0].length >= 3) polys.push({ outer: rings[0], holes: rings.slice(1) });
            } else if (g.type === 'MultiPolygon') {
                const mp = g.coordinates || [];
                for (let pi = 0; pi < mp.length; pi++) {
                    const poly = mp[pi];
                    if (poly && poly[0] && poly[0].length >= 3) polys.push({ outer: poly[0], holes: poly.slice(1) });
                }
            }
        }
        return polys;
    }


    /** Try to synchronously load maps/obstacle.geojson as the default obstacle data. */
    const BUILTIN_OBSTACLE_GEOJSON = {
        type: 'FeatureCollection',
        features: [{
            type: 'Feature',
            properties: {},
            geometry: {
                type: 'MultiPolygon',
                coordinates: [[[[54.943117433429656, 24.716055498544719], [54.955842407907305, 24.739851684858721], [54.975304133579009, 24.734412957863665], [54.98129235686261, 24.74630986419735], [55.029572407086654, 24.725914470801634], [54.991771747608922, 24.697695331551824], [54.943117433429656, 24.716055498544719]]]]
            }
        }]
    };

    // Start with the small built-in obstacle data immediately (non-blocking),
    // then async-load the full maps/obstacle.geojson in the background.
    obstaclePolygons = parseObstacleGeoJSON(BUILTIN_OBSTACLE_GEOJSON);
    // Kick off background fetch so full data is ready before user draws
    ensureObstaclePolygonsLoaded();

    function ensureObstaclePolygonsLoaded() {
        if (obstacleGeoLoadPromise) return obstacleGeoLoadPromise;
        obstacleGeoLoadPromise = fetch('maps/obstacle.geojson')
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                const parsed = parseObstacleGeoJSON(data);
                if (parsed.length) obstaclePolygons = parsed;
            })
            .catch(() => { /* keep bundled obstaclePolygons */ });
        return obstacleGeoLoadPromise;
    }
    window.ensureObstaclePolygonsLoaded = ensureObstaclePolygonsLoaded;

    function pointInRingLngLat(lng, lat, ring) {
        let inside = false;
        const n = ring.length;
        if (n < 3) return false;
        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = ring[i][0];
            const yi = ring[i][1];
            const xj = ring[j][0];
            const yj = ring[j][1];
            const intersect = (yi > lat) !== (yj > lat) &&
                lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-20) + xi;
            if (intersect) inside = !inside;
        }
        return inside;
    }

    /** Convert Leaflet polygon latlngs to { outer, holes } in [lng,lat] (same as obstacle.geojson). */
    function polygonLatLngsToObstacleRecord(latlngsNested) {
        if (!latlngsNested || !latlngsNested.length) return null;
        const flatOuter = latlngsNested[0] && latlngsNested[0].lat != null;
        const outerLatLngs = flatOuter ? latlngsNested : (latlngsNested[0] || []);
        if (!outerLatLngs || outerLatLngs.length < 3) return null;
        const outer = outerLatLngs.map((ll) => [ll.lng, ll.lat]);
        const holes = [];
        if (!flatOuter) {
            for (let hi = 1; hi < latlngsNested.length; hi++) {
                const holeRing = latlngsNested[hi];
                if (holeRing && holeRing.length >= 3) holes.push(holeRing.map((ll) => [ll.lng, ll.lat]));
            }
        }
        return { outer, holes };
    }

    function circleElementToObstacleRecord(circle) {
        if (!circle || typeof circle.getLatLng !== 'function') return null;
        const c = circle.getLatLng();
        const rM = circle.getRadius();
        if (rM == null || rM < 1) return null;
        const rKm = rM / 1000;
        const n = 48;
        const outer = [];
        for (let i = 0; i < n; i++) {
            const p = latLngAtBearing(c, rKm, (i / n) * 360);
            outer.push([p.lng, p.lat]);
        }
        return { outer, holes: [] };
    }

    /** Geo shapes that should block routing (same regions that use obstacle-aware hatch). */
    function shouldTreatElementAsRoutingObstacle(el) {
        if (!el) return false;
        if (el instanceof L.Polygon) {
            if (el._geoType === 'minefield') return true;
            const d = el._geoData;
            return !!(d && ['vertical', 'horizontal', 'both'].includes(d.fillStyle));
        }
        if (el instanceof L.Circle) {
            const d = el._geoData;
            return !!(d && ['vertical', 'horizontal', 'both'].includes(d.fillStyle));
        }
        return false;
    }

    function collectMapGeoObstaclePolygons() {
        const out = [];
        function visit(el) {
            if (!shouldTreatElementAsRoutingObstacle(el)) return;
            if (el instanceof L.Polygon) {
                const rec = polygonLatLngsToObstacleRecord(el.getLatLngs());
                if (rec) out.push(rec);
            } else if (el instanceof L.Circle) {
                const rec = circleElementToObstacleRecord(el);
                if (rec) out.push(rec);
            }
        }
        for (const layer of layers) {
            if (!layer.visible) continue;
            for (const el of layer.elements) {
                visit(el);
                (el._rangeCircles || []).forEach(visit);
                (el._rangeSectors || []).forEach(visit);
            }
        }
        return out;
    }

    /** File-based obstacles plus visible map geo obstacles (hatched / minefield). */
    function getRoutingObstaclePolygons() {
        const geo = collectMapGeoObstaclePolygons();
        if (!geo.length) return obstaclePolygons;
        return obstaclePolygons.concat(geo);
    }

    function pointInObstaclePolygons(lng, lat, polysOpt) {
        const list = polysOpt || getRoutingObstaclePolygons();
        for (let pi = 0; pi < list.length; pi++) {
            const poly = list[pi];
            if (!pointInRingLngLat(lng, lat, poly.outer)) continue;
            let inHole = false;
            for (let hi = 0; hi < poly.holes.length; hi++) {
                if (pointInRingLngLat(lng, lat, poly.holes[hi])) {
                    inHole = true;
                    break;
                }
            }
            if (!inHole) return true;
        }
        return false;
    }

    /**
     * If a point is inside any obstacle, project it to the nearest point outside the obstacle along the segment from the center.
     * If already outside, returns the point unchanged.
     */
    function projectPointOutsideObstacles(center, pt) {
        if (!pointInObstaclePolygons(pt.lng, pt.lat)) return pt;
        // Step from center toward pt in small increments until outside
        const steps = 100;
        let best = pt;
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const testPt = latLngAlongSegment(center, pt, t);
            if (!pointInObstaclePolygons(testPt.lng, testPt.lat)) {
                best = testPt;
                break;
            }
        }
        return best;
    }

    /**
     * If a point is inside any obstacle polygon, snap it to the nearest
     * point on the obstacle boundary by casting rays in many directions.
     */
    function snapPointOutsideObstacles(pt) {
        const ll = L.latLng(pt.lat, pt.lng);
        if (!pointInObstaclePolygons(ll.lng, ll.lat)) return ll;
        let bestPt = ll;
        let bestDist = Infinity;
        for (let deg = 0; deg < 360; deg += 5) {
            for (let step = 1; step <= 60; step++) {
                const d = step * 0.05; // 50 m increments, up to 3 km
                const test = latLngAtBearing(ll, d, deg);
                if (!pointInObstaclePolygons(test.lng, test.lat)) {
                    const dist = ll.distanceTo(test);
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestPt = test;
                    }
                    break;
                }
            }
        }
        return bestPt;
    }

    const _obSegEps = 1e-10;
    function segmentCrossingParamT(x1, y1, x2, y2, x3, y3, x4, y4) {
        const dx1 = x2 - x1;
        const dy1 = y2 - y1;
        const dx2 = x4 - x3;
        const dy2 = y4 - y3;
        const denom = dx1 * dy2 - dy1 * dx2;
        if (Math.abs(denom) < 1e-18) return null;
        const t = ((x3 - x1) * dy2 - (y3 - y1) * dx2) / denom;
        const u = ((x3 - x1) * dy1 - (y3 - y1) * dx1) / denom;
        if (t > _obSegEps && t < 1 - _obSegEps && u > _obSegEps && u < 1 - _obSegEps) return t;
        return null;
    }

    function latLngAlongSegment(c, f, t) {
        return L.latLng(c.lat + t * (f.lat - c.lat), c.lng + t * (f.lng - c.lng));
    }

    function obstacleRingVertexCount(ring) {
        const n = ring.length;
        if (n >= 2 && ring[0][0] === ring[n - 1][0] && ring[0][1] === ring[n - 1][1]) return n - 1;
        return n;
    }

    function obstacleOuterRingToLatLngArray(outer) {
        const n = obstacleRingVertexCount(outer);
        const out = [];
        for (let i = 0; i < n; i++) out.push(L.latLng(outer[i][1], outer[i][0]));
        return out;
    }

    function collectOuterCrossingEvents(c, f, polysOpt) {
        const x1 = c.lng;
        const y1 = c.lat;
        const x2 = f.lng;
        const y2 = f.lat;
        const hits = [];
        const list = polysOpt || getRoutingObstaclePolygons();
        for (let pi = 0; pi < list.length; pi++) {
            const ring = list[pi].outer;
            const nv = obstacleRingVertexCount(ring);
            for (let ei = 0; ei < nv; ei++) {
                const a = ring[ei];
                const b = ring[(ei + 1) % nv];
                const tHit = segmentCrossingParamT(x1, y1, x2, y2, a[0], a[1], b[0], b[1]);
                if (tHit == null) continue;
                hits.push({
                    t: tHit,
                    polyIndex: pi,
                    edgeIndex: ei,
                    point: L.latLng(y1 + tHit * (y2 - y1), x1 + tHit * (x2 - x1))
                });
            }
        }
        hits.sort((a, b) => a.t - b.t || a.polyIndex - b.polyIndex);
        const merged = [];
        for (let hi = 0; hi < hits.length; hi++) {
            const h = hits[hi];
            const prev = merged[merged.length - 1];
            if (prev && Math.abs(prev.t - h.t) < 1e-7) continue;
            merged.push(h);
        }
        return merged;
    }

    function pointToSegmentMetricsLatLng(P, A, B) {
        const dx = B.lng - A.lng;
        const dy = B.lat - A.lat;
        const len2 = dx * dx + dy * dy;
        if (len2 < 1e-22) {
            const closest = A;
            return { dist: map.distance(P, closest), u: 0, closest };
        }
        let u = ((P.lng - A.lng) * dx + (P.lat - A.lat) * dy) / len2;
        u = Math.max(0, Math.min(1, u));
        const closest = L.latLng(A.lat + u * dy, A.lng + u * dx);
        return { dist: map.distance(P, closest), u, closest };
    }

    function locatePointOnRingLatLng(P, ring) {
        const n = ring.length;
        let best = null;
        for (let i = 0; i < n; i++) {
            const A = ring[i];
            const B = ring[(i + 1) % n];
            const m = pointToSegmentMetricsLatLng(P, A, B);
            if (!best || m.dist < best.dist) best = { dist: m.dist, edge: i, u: m.u, point: m.closest };
        }
        return best;
    }

    function pathLengthLatLngs(pts) {
        let s = 0;
        for (let i = 1; i < pts.length; i++) s += map.distance(pts[i - 1], pts[i]);
        return s;
    }

    /** Walk ring vertices from P (on edge edgeP) to Q (on edge edgeQ) in increasing vertex index. */
    function boundaryPathForward(P, edgeP, Q, edgeQ, ring) {
        const n = ring.length;
        const out = [P];
        if (edgeP === edgeQ) {
            out.push(Q);
            return out;
        }
        let v = (edgeP + 1) % n;
        const targetV = edgeQ;
        while (v !== targetV) {
            out.push(ring[v]);
            v = (v + 1) % n;
        }
        out.push(ring[targetV]);
        out.push(Q);
        return out;
    }

    function shortestBoundaryPathBetween(P, Q, ringLatLng, polysToAvoid) {
        const lp = locatePointOnRingLatLng(P, ringLatLng);
        const lq = locatePointOnRingLatLng(Q, ringLatLng);
        if (!lp || !lq || lp.dist > 25 || lq.dist > 25) return [P, Q];
        const fwd = boundaryPathForward(P, lp.edge, Q, lq.edge, ringLatLng);
        const alt = boundaryPathForward(Q, lq.edge, P, lp.edge, ringLatLng).slice().reverse();

        if (polysToAvoid && polysToAvoid.length) {
            // Sample the midpoint of each candidate arc to check obstacle penetration.
            function arcMidClear(arc) {
                if (arc.length < 2) return true;
                const mid = arc[Math.floor(arc.length / 2)];
                return !pointInObstaclePolygons(mid.lng, mid.lat, polysToAvoid);
            }
            const fwdClear = arcMidClear(fwd);
            const altClear = arcMidClear(alt);
            // Prefer an arc that stays outside obstacles; only fall back to
            // length-based choice when both candidates are equally clear/blocked.
            if (fwdClear && !altClear) return fwd;
            if (altClear && !fwdClear) return alt;
        }

        const lf = pathLengthLatLngs(fwd);
        const la = pathLengthLatLngs(alt);
        return lf <= la ? fwd : alt;
    }

    /**
     * Replace straight c→f with a polyline that detours along obstacle outer boundaries
     * (planar lng/lat). Straight sections stay outside; inside portions use the shorter ring arc.
     */
    function bendLatLngSegmentAroundObstacles(c, f, polysOpt, _retried) {
        const polys = polysOpt || getRoutingObstaclePolygons();
        if (!polys.length || !map) return [c, f];
        const hits = collectOuterCrossingEvents(c, f, polys);
        if (hits.length === 0) {
            // If no boundary crossings but either endpoint is inside an obstacle
            // (e.g. user clicked slightly in the water), snap them outside and retry.
            if (!_retried) {
                const cIn = pointInObstaclePolygons(c.lng, c.lat, polys);
                const fIn = pointInObstaclePolygons(f.lng, f.lat, polys);
                if (cIn || fIn) {
                    const cOut = cIn ? snapPointOutsideObstacles(c) : c;
                    const fOut = fIn ? snapPointOutsideObstacles(f) : f;
                    return bendLatLngSegmentAroundObstacles(cOut, fOut, polys, true);
                }
            }
            return [c, f];
        }
        const bp = [0];
        for (let hi = 0; hi < hits.length; hi++) bp.push(hits[hi].t);
        bp.push(1);
        const breakpoints = [];
        for (let bi = 0; bi < bp.length; bi++) {
            const t = bp[bi];
            if (!breakpoints.some((x) => Math.abs(x - t) < 1e-8)) breakpoints.push(t);
        }
        breakpoints.sort((a, b) => a - b);
        const insideMid = [];
        for (let k = 0; k < breakpoints.length - 1; k++) {
            const tm = (breakpoints[k] + breakpoints[k + 1]) / 2;
            const pm = latLngAlongSegment(c, f, tm);
            insideMid.push(pointInObstaclePolygons(pm.lng, pm.lat, polys));
        }
        const spans = [];
        for (let k = 0; k < insideMid.length; ) {
            if (!insideMid[k]) {
                k++;
                continue;
            }
            let j = k;
            while (j < insideMid.length && insideMid[j]) j++;
            const t0 = breakpoints[k];
            const t1 = breakpoints[j];
            let polyIndex = hits[0].polyIndex;
            let bd = Infinity;
            for (let hi = 0; hi < hits.length; hi++) {
                const d = Math.abs(hits[hi].t - t0);
                if (d < bd) {
                    bd = d;
                    polyIndex = hits[hi].polyIndex;
                }
            }
            spans.push({ t0, t1, polyIndex });
            k = j;
        }
        if (spans.length === 0) return [c, f];

        const out = [];
        function pushDistinct(p) {
            if (out.length === 0 || map.distance(out[out.length - 1], p) > 0.15) out.push(p);
        }

        let tCursor = 0;
        for (let si = 0; si < spans.length; si++) {
            const sp = spans[si];
            const Pentry = latLngAlongSegment(c, f, sp.t0);
            const Pexit = latLngAlongSegment(c, f, sp.t1);
            if (sp.t0 > tCursor + 1e-8) {
                pushDistinct(latLngAlongSegment(c, f, tCursor));
                pushDistinct(Pentry);
            } else if (out.length === 0) {
                pushDistinct(c);
            }
            const ringLL = obstacleOuterRingToLatLngArray(polys[sp.polyIndex].outer);
            const arc = shortestBoundaryPathBetween(Pentry, Pexit, ringLL, polys);
            for (let ai = 1; ai < arc.length; ai++) pushDistinct(arc[ai]);
            tCursor = sp.t1;
        }
        if (tCursor < 1 - 1e-8) {
            pushDistinct(latLngAlongSegment(c, f, tCursor));
        }
        pushDistinct(f);
        return out.length >= 2 ? out : [c, f];
    }

    /** Flank/baseline: bent path, or failure if too short. */
    function clipLatLngSegmentAvoidObstacles(c, f, polysOpt) {
        const bent = bendLatLngSegmentAroundObstacles(c, f, polysOpt);
        if (!bent || bent.length < 2) return { points: [c], ok: false };
        if (map && map.distance(bent[0], bent[bent.length - 1]) < 0.25) return { points: [c], ok: false };
        return { points: bent, ok: true };
    }

    // ═══════════════════════════════════════════════════════════════════
    // POLYGON BOOLEAN DIFFERENCE — clip tactical polygon by obstacles
    // ═══════════════════════════════════════════════════════════════════

    /**
     * Signed area of a ring in [x,y] coords. Positive = CCW.
     */
    function _signedRingArea(ring) {
        let a = 0;
        for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
            a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
        }
        return a / 2;
    }

    /**
     * Point-in-polygon (ray-cast) for [x,y] rings.
     */
    function _ptInRing(x, y, ring) {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const xi = ring[i][0], yi = ring[i][1];
            const xj = ring[j][0], yj = ring[j][1];
            if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
                inside = !inside;
            }
        }
        return inside;
    }

    /**
     * Segment–segment intersection. Returns { x, y, ta, tb } or null.
     * ta/tb are parametric [0..1] positions on segment A / B.
     */
    function _segSeg(a1, a2, b1, b2) {
        const dx1 = a2[0] - a1[0], dy1 = a2[1] - a1[1];
        const dx2 = b2[0] - b1[0], dy2 = b2[1] - b1[1];
        const den = dx1 * dy2 - dy1 * dx2;
        if (Math.abs(den) < 1e-15) return null;
        const dx3 = b1[0] - a1[0], dy3 = b1[1] - a1[1];
        const ta = (dx3 * dy2 - dy3 * dx2) / den;
        const tb = (dx3 * dy1 - dy3 * dx1) / den;
        const EPS = 1e-9;
        if (ta < EPS || ta > 1 - EPS || tb < EPS || tb > 1 - EPS) return null;
        return { x: a1[0] + ta * dx1, y: a1[1] + ta * dy1, ta, tb };
    }

    /**
     * Compute polygon difference: subject − clip.
     * Both are arrays of [lng, lat] (NOT closed — first ≠ last).
     * Returns array of result rings (each an array of [lng, lat]).
     * Each result may have a .holes property (array of hole rings).
     */
    function _polyDifference(subject, clip) {
        const sN = subject.length, cN = clip.length;
        if (!sN || !cN) return sN ? [subject.slice()] : [];

        // ── 1. Find all intersection points ──
        const ixList = [];
        for (let si = 0; si < sN; si++) {
            const s1 = subject[si], s2 = subject[(si + 1) % sN];
            for (let ci = 0; ci < cN; ci++) {
                const c1 = clip[ci], c2 = clip[(ci + 1) % cN];
                const ix = _segSeg(s1, s2, c1, c2);
                if (ix) {
                    ixList.push({
                        pt: [ix.x, ix.y],
                        sEdge: si, sT: ix.ta,
                        cEdge: ci, cT: ix.tb,
                        entering: false,
                        visited: false
                    });
                }
            }
        }

        // ── 2. Trivial cases (no crossing) ──
        if (ixList.length < 2) {
            if (_ptInRing(subject[0][0], subject[0][1], clip)) return []; // fully inside obstacle
            if (_ptInRing(clip[0][0], clip[0][1], subject)) {
                // Obstacle fully inside subject → subject with hole
                const r = subject.slice();
                r._holes = [clip.slice()];
                return [r];
            }
            return [subject.slice()]; // disjoint
        }

        // ── 3. Classify entering / exiting ──
        for (const ix of ixList) {
            const si = ix.sEdge;
            const dx = subject[(si + 1) % sN][0] - subject[si][0];
            const dy = subject[(si + 1) % sN][1] - subject[si][1];
            const len = Math.hypot(dx, dy) || 1;
            const test = [ix.pt[0] + 1e-7 * dx / len, ix.pt[1] + 1e-7 * dy / len];
            ix.entering = _ptInRing(test[0], test[1], clip);
        }

        // ── 4. Sort along subject boundary ──
        ixList.sort((a, b) => a.sEdge !== b.sEdge ? a.sEdge - b.sEdge : a.sT - b.sT);
        // Assign sequential ID for cross-lookup
        ixList.forEach((ix, i) => { ix.sIdx = i; });
        // Build clip-sorted index
        const clipOrder = ixList.slice().sort((a, b) =>
            a.cEdge !== b.cEdge ? a.cEdge - b.cEdge : a.cT - b.cT);
        clipOrder.forEach((ix, i) => { ix.cIdx = i; });

        // ── 5. Build augmented subject vertex list ──
        //    Each entry: { pt, isIx, ix? }
        const sAug = [];
        let ixPtr = 0;
        for (let si = 0; si < sN; si++) {
            sAug.push({ pt: subject[si].slice(), isIx: false });
            while (ixPtr < ixList.length && ixList[ixPtr].sEdge === si) {
                sAug.push({ pt: ixList[ixPtr].pt.slice(), isIx: true, ix: ixList[ixPtr] });
                ixPtr++;
            }
        }

        // ── 6. Build augmented clip vertex list ──
        const cAug = [];
        let cPtr = 0;
        for (let ci = 0; ci < cN; ci++) {
            cAug.push({ pt: clip[ci].slice(), isIx: false });
            while (cPtr < clipOrder.length && clipOrder[cPtr].cEdge === ci) {
                cAug.push({ pt: clipOrder[cPtr].pt.slice(), isIx: true, ix: clipOrder[cPtr] });
                cPtr++;
            }
        }

        // Cross-link: find index of each intersection in sAug and cAug
        for (const ix of ixList) {
            ix._sAugIdx = sAug.findIndex(n => n.isIx && n.ix === ix);
            ix._cAugIdx = cAug.findIndex(n => n.isIx && n.ix === ix);
        }

        // ── 7. Trace result polygons ──
        // For difference (subject − clip):
        //   • Walk subject forward while OUTSIDE clip
        //   • At "entering" intersection → switch to clip, walk BACKWARD (CW)
        //   • At next intersection on clip → switch back to subject, walk forward
        const results = [];
        const maxTotal = (sAug.length + cAug.length) * 2;

        for (const ix of ixList) {
            if (ix.visited || ix.entering) continue; // start at EXITING intersections
            const ring = [];
            let onSubject = true;
            let idx = ix._sAugIdx;
            let steps = 0;

            do {
                const list = onSubject ? sAug : cAug;
                const node = list[idx];
                ring.push(node.pt.slice());

                // Check for switching at intersection nodes
                if (node.isIx && node.ix) {
                    if (onSubject && node.ix.entering) {
                        // Entering clip → switch to clip boundary (walk backward for difference)
                        node.ix.visited = true;
                        onSubject = false;
                        idx = node.ix._cAugIdx;
                        idx = (idx - 1 + cAug.length) % cAug.length;
                    } else if (!onSubject && !node.ix.entering) {
                        // Back at an EXITING intersection while on clip → switch to subject
                        node.ix.visited = true;
                        onSubject = true;
                        idx = node.ix._sAugIdx;
                        idx = (idx + 1) % sAug.length;
                    } else {
                        idx = (idx + 1) % sAug.length;
                    }
                } else {
                    if (onSubject) {
                        idx = (idx + 1) % sAug.length;
                    } else {
                        idx = (idx - 1 + cAug.length) % cAug.length;
                    }
                }

                steps++;
            } while (steps < maxTotal &&
                     !(onSubject && idx === ix._sAugIdx));

            ix.visited = true;

            if (ring.length >= 3) results.push(ring);
        }

        // If tracing produced nothing (numerical edge-case), return subject
        return results.length > 0 ? results : [subject.slice()];
    }

    /**
     * Clip a polygon by ALL obstacle polygons, then filter fragments.
     * When anchorPoints are provided, keeps fragments containing anchors;
     * otherwise falls back to keeping only the largest fragment.
     *
     * @param {Array<L.LatLng>} ring           – closed polygon as LatLng array
     * @param {Array}           polys          – obstacle records { outer, holes }
     * @param {L.LatLng[]}      [anchorPoints] – optional anchor points for fragment retention
     * @returns {{ outer: L.LatLng[], holes: L.LatLng[][] }[]}  kept polygon(s)
     */
    function clipPolygonByObstacles(ring, polys, anchorPoints) {
        if (!ring || ring.length < 3 || !polys || !polys.length) {
            return [{ outer: ring, holes: [] }];
        }

        // Convert LatLng ring → [lng, lat] for clipping math
        let currentPolys = [{ ring: ring.map(p => [p.lng, p.lat]), holes: [] }];

        for (const obs of polys) {
            const obsOuter = obs.outer;
            // Ensure obstacle ring is not self-closed
            let clipRing = obsOuter.slice();
            if (clipRing.length > 1 &&
                clipRing[0][0] === clipRing[clipRing.length - 1][0] &&
                clipRing[0][1] === clipRing[clipRing.length - 1][1]) {
                clipRing = clipRing.slice(0, -1);
            }
            if (clipRing.length < 3) continue;

            const nextPolys = [];
            for (const poly of currentPolys) {
                const diffResults = _polyDifference(poly.ring, clipRing);
                for (const r of diffResults) {
                    const holes = (poly.holes || []).slice();
                    if (r._holes) holes.push(...r._holes);
                    nextPolys.push({ ring: r, holes });
                }
            }
            currentPolys = nextPolys;
            if (currentPolys.length === 0) break;
        }

        // ── Fragment filtering: preserve anchor-connected fragments ──
        if (currentPolys.length > 1) {
            let kept;
            if (anchorPoints && anchorPoints.length > 0) {
                // Keep fragments that contain at least one anchor point
                kept = currentPolys.filter(poly =>
                    anchorPoints.some(a => pointInRingLngLat(a.lng, a.lat, poly.ring))
                );
            }
            // Fallback: keep only the largest polygon
            if (!kept || kept.length === 0) {
                let bestIdx = 0, bestArea = 0;
                for (let i = 0; i < currentPolys.length; i++) {
                    const a = Math.abs(_signedRingArea(currentPolys[i].ring));
                    if (a > bestArea) { bestArea = a; bestIdx = i; }
                }
                kept = [currentPolys[bestIdx]];
            }
            currentPolys = kept;
        }

        // Convert back to LatLng
        return currentPolys.map(p => ({
            outer: p.ring.map(c => L.latLng(c[1], c[0])),
            holes: (p.holes || []).map(h => h.map(c => L.latLng(c[1], c[0])))
        }));
    }

    /** Rear geographic bearing: perpendicular to L–R chord, org on side opposite scallops. */
    function getAutoFlankRearBearingChord(leftPt, rightPt, orderedLCR) {
        const scallopSide = getFrontSideFromScallops(orderedLCR);
        // Use same sign as scallopSide so zones project toward the side the scallop teeth face.
        const perpMult = scallopSide ? scallopSide : 1;
        const chordBear = bearingDegrees(leftPt, rightPt);
        return ((chordBear + perpMult * 90) % 360 + 360) % 360;
    }

    function collectOrderedScallopedSegmentsForSession() {
        const sessionId = window.freeDrawSignatureSessionId;
        const matched = [];
        const anySession = [];
        getAllLayerElements().forEach(el => {
            if (el instanceof L.LayerGroup && el._tmgData?.typeId === 'scalloped' && Array.isArray(el._tmgData.segments)) {
                el._tmgData.segments.forEach(seg => {
                    if (seg?._tmgData?.typeId !== 'scalloped') return;
                    anySession.push(seg);
                    if (!sessionId || seg._tmgData.sessionId === sessionId) matched.push(seg);
                });
            } else if (el instanceof L.Marker && el._tmgData?.typeId === 'scalloped') {
                anySession.push(el);
                if (!sessionId || el._tmgData.sessionId === sessionId) matched.push(el);
            }
        });
        // If every segment missed sessionId (legacy / reroute edge), still build geometry from visible scallops.
        return matched.length ? matched : anySession;
    }

    function flattenScallopedVerticesFromSegments(segments) {
        const verts = [];
        const EPS = 0.5;
        for (let i = 0; i < segments.length; i++) {
            const d = segments[i]._tmgData;
            if (!d || !d.latlng1 || !d.latlng2) continue;
            const a = L.latLng(d.latlng1.lat, d.latlng1.lng);
            const b = L.latLng(d.latlng2.lat, d.latlng2.lng);
            if (!verts.length) {
                verts.push(a, b);
            } else {
                const lp = verts[verts.length - 1];
                const da = map.distance(lp, a);
                const db = map.distance(lp, b);
                if (da <= db) {
                    if (da > EPS) verts.push(a);
                    if (map.distance(verts[verts.length - 1], b) > EPS) verts.push(b);
                } else {
                    if (db > EPS) verts.push(b);
                    if (map.distance(verts[verts.length - 1], a) > EPS) verts.push(a);
                }
            }
        }
        return verts;
    }

    /** Walk a LatLng path and return the point exactly at 50% of its total arc length. */
    function frontPathMidByArcLength(path) {
        if (!path || path.length < 2) return { pt: path && path[0] || L.latLng(0, 0), idx: 0 };
        let total = 0;
        for (let i = 0; i < path.length - 1; i++) total += map.distance(path[i], path[i + 1]);
        let acc = 0;
        const half = total / 2;
        for (let i = 0; i < path.length - 1; i++) {
            const seg = map.distance(path[i], path[i + 1]);
            if (acc + seg >= half) {
                const t = seg > 0 ? (half - acc) / seg : 0;
                return {
                    pt: L.latLng(
                        path[i].lat + t * (path[i + 1].lat - path[i].lat),
                        path[i].lng + t * (path[i + 1].lng - path[i].lng)
                    ),
                    idx: i
                };
            }
            acc += seg;
        }
        const mid = Math.floor(path.length / 2);
        return { pt: path[mid], idx: mid };
    }

    function orientScallopedVertsFromLToR(verts, leftPt, rightPt) {
        if (!verts || verts.length < 2) return verts || [];
        let arr = verts.slice();
        const d0L = map.distance(arr[0], leftPt) + map.distance(arr[arr.length - 1], rightPt);
        const d0R = map.distance(arr[0], rightPt) + map.distance(arr[arr.length - 1], leftPt);
        if (d0R < d0L) arr.reverse();
        let iL = 0;
        let bestL = Infinity;
        for (let i = 0; i < arr.length; i++) {
            const d = map.distance(arr[i], leftPt);
            if (d < bestL) { bestL = d; iL = i; }
        }
        let iR = 0;
        let bestR = Infinity;
        for (let i = 0; i < arr.length; i++) {
            const d = map.distance(arr[i], rightPt);
            if (d < bestR) { bestR = d; iR = i; }
        }
        if (iL > iR) {
            const t = iL;
            iL = iR;
            iR = t;
        }
        return arr.slice(iL, iR + 1);
    }

    function buildFrontTopPath(leftPt, rightPt, orientedVerts) {
        const EPS = 0.05;
        const path = [leftPt];
        for (const p of orientedVerts) {
            if (map.distance(p, leftPt) > EPS && map.distance(p, rightPt) > EPS) {
                path.push(L.latLng(p.lat, p.lng));
            }
        }
        path.push(rightPt);
        const dedup = [path[0]];
        for (let i = 1; i < path.length; i++) {
            if (map.distance(path[i], dedup[dedup.length - 1]) > EPS) dedup.push(path[i]);
        }
        return dedup;
    }

    function layerPerpThroughC(leftPt, rightPt, centerPt) {
        const pL = map.latLngToLayerPoint(leftPt);
        const pR = map.latLngToLayerPoint(rightPt);
        let vx = pR.x - pL.x;
        let vy = pR.y - pL.y;
        const len = Math.hypot(vx, vy);
        if (len < 1e-6) return null;
        vx /= len;
        vy /= len;
        const dx = -vy;
        const dy = vx;
        const O = map.latLngToLayerPoint(centerPt);
        return { O, D: { x: dx, y: dy } };
    }

    function layerLineIntersectOpenSegment(O, D, A, B) {
        const ax = A.x, ay = A.y, bx = B.x, by = B.y;
        const wx = bx - ax, wy = by - ay;
        const denom = D.x * wy - D.y * wx;
        if (Math.abs(denom) < 1e-9) return null;
        const ox = O.x - ax, oy = O.y - ay;
        const u = (D.x * oy - D.y * ox) / denom;
        if (u < -1e-6 || u > 1 + 1e-6) return null;
        const t = (ox * wy - oy * wx) / denom;
        const pt = L.point(O.x + t * D.x, O.y + t * D.y);
        return { t, u, pt };
    }

    function bestIntersectionOnOpenPolyline(O, D, polylinePts, preferNear) {
        let best = null;
        let bestScore = Infinity;
        for (let i = 0; i < polylinePts.length - 1; i++) {
            const A = map.latLngToLayerPoint(polylinePts[i]);
            const B = map.latLngToLayerPoint(polylinePts[i + 1]);
            const hit = layerLineIntersectOpenSegment(O, D, A, B);
            if (!hit) continue;
            const ll = map.layerPointToLatLng(hit.pt);
            const score = map.distance(ll, preferNear);
            if (score < bestScore) {
                bestScore = score;
                best = ll;
            }
        }
        return best;
    }

    /** All intersections of infinite line (O,D) with open polyline; each entry has segment index. */
    function collectLinePolylineIntersections(O, D, polylinePts) {
        const out = [];
        for (let i = 0; i < polylinePts.length - 1; i++) {
            const A = map.latLngToLayerPoint(polylinePts[i]);
            const B = map.latLngToLayerPoint(polylinePts[i + 1]);
            const hit = layerLineIntersectOpenSegment(O, D, A, B);
            if (!hit) continue;
            out.push({ ll: map.layerPointToLatLng(hit.pt), segIndex: i });
        }
        return out;
    }

    /** When the perpendicular through C meets the scalloped front several times, prefer a central hit. */
    function pickFrontSplitPointOnScallops(frontPath, leftPt, rightPt, centerPt) {
        const perp = layerPerpThroughC(leftPt, rightPt, centerPt);
        if (!perp) return null;
        const hits = collectLinePolylineIntersections(perp.O, perp.D, frontPath);
        if (!hits.length) return null;
        if (hits.length === 1) return L.latLng(hits[0].ll.lat, hits[0].ll.lng);
        hits.sort((a, b) => a.segIndex - b.segIndex);
        const mid = hits[Math.floor((hits.length - 1) / 2)];
        return L.latLng(mid.ll.lat, mid.ll.lng);
    }

    function projectPointToSegmentLatLng(Q, A, B) {
        const pa = map.latLngToLayerPoint(A);
        const pb = map.latLngToLayerPoint(B);
        const pq = map.latLngToLayerPoint(Q);
        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const lenSq = dx * dx + dy * dy;
        let t = lenSq > 0 ? ((pq.x - pa.x) * dx + (pq.y - pa.y) * dy) / lenSq : 0;
        t = Math.max(0, Math.min(1, t));
        return {
            proj: map.layerPointToLatLng(L.point(pa.x + t * dx, pa.y + t * dy)),
            t
        };
    }

    function splitOpenPathAtPoint(frontPath, Q) {
        const SNAP = 2;
        for (let i = 0; i < frontPath.length - 1; i++) {
            const a = frontPath[i];
            const b = frontPath[i + 1];
            const { proj, t } = projectPointToSegmentLatLng(Q, a, b);
            if (t >= -1e-6 && t <= 1 + 1e-6 && map.distance(Q, proj) < SNAP) {
                const left = frontPath.slice(0, i + 1).map(p => L.latLng(p.lat, p.lng));
                if (map.distance(left[left.length - 1], proj) > 0.05) left.push(proj);
                const right = [];
                if (map.distance(proj, b) > 0.05) right.push(proj);
                for (let j = i + 1; j < frontPath.length; j++) {
                    right.push(L.latLng(frontPath[j].lat, frontPath[j].lng));
                }
                return { Qsnap: left[left.length - 1], leftPath: left, rightPath: right };
            }
        }
        let bestIdx = 0;
        let bd = Infinity;
        for (let i = 0; i < frontPath.length; i++) {
            const d = map.distance(frontPath[i], Q);
            if (d < bd) { bd = d; bestIdx = i; }
        }
        const Qsnap = L.latLng(frontPath[bestIdx].lat, frontPath[bestIdx].lng);
        const leftPath = frontPath.slice(0, bestIdx + 1).map(p => L.latLng(p.lat, p.lng));
        const rightPath = frontPath.slice(bestIdx).map(p => L.latLng(p.lat, p.lng));
        return { Qsnap, leftPath, rightPath };
    }

    /**
     * Rectangle auto-flank: front = full scalloped front line (endpoint to endpoint), split at arc
     * midpoint for the two battalion zones; rear is a straight rectangle.
     *
     * The three circle positions (leftPt/centerPt/rightPt) are only used to determine the rear
     * bearing (friendly side). Zone corners are derived entirely from the scalloped line so that
     * clustered circles never collapse the zones into degenerate triangles.
     *
     * @returns {{ ringsMeta: Array<{ring:L.LatLng[],lengthKm:number,clipAnchors:L.LatLng[]}> } | null}
     */
    function buildRectangleAutoFlankZoneRings(mode, leftPt, centerPt, rightPt, distBatKm, distBrigKm) {
        const orderedLCR = [leftPt, centerPt, rightPt];
        const segs = collectOrderedScallopedSegmentsForSession();
        if (!segs.length) return null;
        const flat = flattenScallopedVerticesFromSegments(segs);
        if (!flat || flat.length < 2) return null;
        const frontPath = flat.map(p => L.latLng(p.lat, p.lng));

        // Zone corners derived from scalloped front endpoints.
        const trueLeft  = frontPath[0];
        const trueRight = frontPath[frontPath.length - 1];

        // Rear bearing perpendicular to actual scallop chord, toward friendly side.
        // Use trueLeft/trueRight (not clustered circles) so the chord direction is stable.
        const rearBear = getAutoFlankRearBearingChord(trueLeft, trueRight, [trueLeft, trueRight]);
        const { pt: trueMid, idx: midIdx } = frontPathMidByArcLength(frontPath);

        const trueLeft8   = latLngAtBearing(trueLeft,  distBatKm,  rearBear);
        const trueRight8  = latLngAtBearing(trueRight, distBatKm,  rearBear);
        const trueMid8    = latLngAtBearing(trueMid,   distBatKm,  rearBear);
        const trueLeft20  = latLngAtBearing(trueLeft,  distBrigKm, rearBear);
        const trueRight20 = latLngAtBearing(trueRight, distBrigKm, rearBear);

        // Split scalloped front at arc midpoint.
        const leftFront  = frontPath.slice(0, midIdx + 1).concat([trueMid]);
        const rightFront = [trueMid].concat(frontPath.slice(midIdx + 1));

        const ringsMeta = [];

        if (mode === '20') {
            ringsMeta.push({
                ring: [trueLeft, trueRight, trueRight20, trueLeft20],
                lengthKm: distBrigKm,
                clipAnchors: [trueLeft, trueRight]
            });
            return { ringsMeta };
        }

        if (mode === '8') {
            ringsMeta.push({
                ring: [...frontPath, trueRight8, trueLeft8],
                lengthKm: distBatKm,
                clipAnchors: [trueLeft, trueRight]
            });
            return { ringsMeta, dividers: [[trueMid, trueMid8]] };
        }

        if (mode === '8&20') {
            ringsMeta.push({
                ring: [...frontPath, trueRight8, trueLeft8],
                lengthKm: distBatKm,
                clipAnchors: [trueLeft, trueRight]
            });
            ringsMeta.push({
                ring: [trueLeft8, trueRight8, trueRight20, trueLeft20],
                lengthKm: distBrigKm,
                clipAnchors: [trueLeft8, trueRight8]
            });
            return { ringsMeta, dividers: [[trueMid, trueMid8]] };
        }

        return null;
    }

    function renderClippedAutoFlankRings(ringsMeta, lineOpts, sessionId, tag) {
        const obstacles = getRoutingObstaclePolygons();
        const result = [];
        for (const { ring: rawRing, lengthKm, clipAnchors } of ringsMeta) {
            if (!rawRing || rawRing.length < 3) continue;
            const anchors = clipAnchors && clipAnchors.length ? clipAnchors : rawRing.slice(0, 2);
            const clipped = clipPolygonByObstacles(rawRing, obstacles, anchors);
            for (const poly of clipped) {
                const ring = poly.outer;
                if (!ring || ring.length < 3) continue;

                const areaRings = poly.holes && poly.holes.length > 0
                    ? [ring, ...poly.holes] : [ring];
                const w = lineOpts.weight != null ? lineOpts.weight : 3;
                const areaPoly = L.polygon(areaRings, {
                    color: lineOpts.color || '#3b82f6',
                    weight: w,
                    fillColor: lineOpts.color || '#3b82f6',
                    fillOpacity: 0.08,
                    interactive: false,
                    pane: 'autoFlankAreaPane',
                    className: 'auto-flank-area'
                });
                areaPoly._autoFlankLine = true;
                areaPoly._autoFlankArea = true;
                areaPoly._tmgData = {
                    typeId: 'auto-flank-area',
                    sessionId, tag, lengthKm
                };
                addToActiveLayer(areaPoly);
                result.push(areaPoly);
            }
        }
        return result;
    }

    function getOrderedLCRCircleCentersForAutoFlank(axisData) {
        if (!axisData) return null;
        let centers = null;
        const fn = window.freeDrawSignature && typeof window.freeDrawSignature.getOrderedCircleCenters === 'function'
            ? window.freeDrawSignature.getOrderedCircleCenters
            : null;
        if (fn) {
            const arr = fn();
            if (arr && arr.length >= 3) centers = arr.slice(0, 3);
        }
        if (!centers || centers.length < 3) centers = getCircleXCenters();
        if (!centers || centers.length < 3) return null;
        // Always sort by front-line axis so L/C/R match geometry. Placement order (1st/2nd/3rd click)
        // can disagree with left→right along the scalloped front and produces self-crossing rings.
        const sorted = [...centers].sort((a, b) => {
            const pa = map.latLngToLayerPoint(a);
            const pb = map.latLngToLayerPoint(b);
            const sa = (pa.x - axisData.origin.x) * axisData.axis.x
                     + (pa.y - axisData.origin.y) * axisData.axis.y;
            const sb = (pb.x - axisData.origin.x) * axisData.axis.x
                     + (pb.y - axisData.origin.y) * axisData.axis.y;
            return sa - sb;
        });
        return { L: sorted[0], C: sorted[1], R: sorted[2] };
    }

    /**
     * Expand a control polyline into obstacle-aware chord endpoints (same clipping as auto-flank).
     * Falls back to the uncut edge when clip fails so graphics do not vanish.
     */
    function expandScallopedControlPointsToChordPairs(controlPts) {
        const pairs = [];
        if (!controlPts || controlPts.length < 2) return pairs;
        const polys = getRoutingObstaclePolygons();
        let chain = [];
        for (let i = 0; i < controlPts.length - 1; i++) {
            const c = L.latLng(controlPts[i].lat, controlPts[i].lng);
            const f = L.latLng(controlPts[i + 1].lat, controlPts[i + 1].lng);
            const clipped = clipLatLngSegmentAvoidObstacles(c, f, polys);
            const points = (clipped.ok && Array.isArray(clipped.points) && clipped.points.length >= 2)
                ? clipped.points
                : [c, f];
            if (chain.length === 0) {
                chain = points.slice();
            } else {
                chain.push(...points.slice(1));
            }
        }
        // Merge closely-spaced chain points (from obstacle boundary routing)
        // so each pair has enough pixel length for consistent scallop sizing.
        // One scallop wave ≈ 28px, minimum 3 waves → ~84px minimum per segment.
        const minPxDist = 84;
        if (map && chain.length > 2) {
            const merged = [chain[0]];
            for (let j = 1; j < chain.length - 1; j++) {
                const lastPx = map.latLngToLayerPoint(merged[merged.length - 1]);
                const curPx = map.latLngToLayerPoint(chain[j]);
                if (Math.hypot(curPx.x - lastPx.x, curPx.y - lastPx.y) >= minPxDist) {
                    merged.push(chain[j]);
                } else if (polys.length > 0) {
                    // Even if too close, keep the point when skipping it would
                    // cause the chord to cut through an obstacle (e.g. water).
                    const prev = merged[merged.length - 1];
                    const next = j + 1 < chain.length ? chain[j + 1] : chain[chain.length - 1];
                    const midLat = (prev.lat + next.lat) / 2;
                    const midLng = (prev.lng + next.lng) / 2;
                    if (pointInObstaclePolygons(midLng, midLat, polys)) {
                        merged.push(chain[j]);
                    }
                }
            }
            merged.push(chain[chain.length - 1]);
            for (let j = 0; j < merged.length - 1; j++) {
                pairs.push({ a: merged[j], b: merged[j + 1] });
            }
        } else {
            for (let j = 0; j < chain.length - 1; j++) {
                pairs.push({ a: chain[j], b: chain[j + 1] });
            }
        }
        return pairs;
    }

    function clearGeoObstacleHatchLines(el) {
        const arr = el._geoObstacleHatchLines;
        if (!arr || !arr.length) return;
        const layer = layers.find((l) => l.id === el._layerId);
        arr.forEach((pl) => {
            if (layer?.group) layer.group.removeLayer(pl);
            else if (pl && map?.hasLayer(pl)) map.removeLayer(pl);
        });
        el._geoObstacleHatchLines = [];
    }

    function approximateCircleOutlineLayerPoints(circle) {
        const c = circle.getLatLng();
        const rKm = (circle.getRadius() || 0) / 1000;
        const n = 72;
        const pts = [];
        for (let i = 0; i < n; i++) {
            const b = (i / n) * 360;
            pts.push(map.latLngToLayerPoint(latLngAtBearing(c, rKm, b)));
        }
        return pts;
    }

    function getGeoShapeOutlineRingPx(el) {
        if (!map) return [];
        if (el instanceof L.Circle) return approximateCircleOutlineLayerPoints(el);
        const lls = el.getLatLngs?.();
        if (!lls || !lls.length) return [];
        let ring = lls;
        if (lls[0] && lls[0].lat == null && Array.isArray(lls[0])) ring = lls[0];
        if (!ring.length) return [];
        return ring.map((ll) => map.latLngToLayerPoint(L.latLng(ll.lat ?? ll[0], ll.lng ?? ll[1])));
    }

    function verticalLinePolygonYIntervals(x0, ringPx) {
        const ys = [];
        const n = ringPx.length;
        for (let i = 0; i < n; i++) {
            const p1 = ringPx[i];
            const p2 = ringPx[(i + 1) % n];
            const x1 = p1.x;
            const y1 = p1.y;
            const x2 = p2.x;
            const y2 = p2.y;
            const xmin = Math.min(x1, x2);
            const xmax = Math.max(x1, x2);
            if (x0 <= xmin || x0 >= xmax) continue;
            if (Math.abs(x2 - x1) < 1e-9) continue;
            const y = y1 + (x0 - x1) * (y2 - y1) / (x2 - x1);
            ys.push(y);
        }
        ys.sort((a, b) => a - b);
        const out = [];
        for (let i = 0; i + 1 < ys.length; i += 2) out.push([ys[i], ys[i + 1]]);
        return out;
    }

    function horizontalLinePolygonXIntervals(y0, ringPx) {
        const xs = [];
        const n = ringPx.length;
        for (let i = 0; i < n; i++) {
            const p1 = ringPx[i];
            const p2 = ringPx[(i + 1) % n];
            const x1 = p1.x;
            const y1 = p1.y;
            const x2 = p2.x;
            const y2 = p2.y;
            const ymin = Math.min(y1, y2);
            const ymax = Math.max(y1, y2);
            if (y0 <= ymin || y0 >= ymax) continue;
            if (Math.abs(y2 - y1) < 1e-9) continue;
            const x = x1 + (y0 - y1) * (x2 - x1) / (y2 - y1);
            xs.push(x);
        }
        xs.sort((a, b) => a - b);
        const out = [];
        for (let i = 0; i + 1 < xs.length; i += 2) out.push([xs[i], xs[i + 1]]);
        return out;
    }

    function applyGeoObstacleAwareLineHatch(el) {
        clearGeoObstacleHatchLines(el);
        if (!map || !el._path) return;
        const d = el._geoData;
        if (!d) return;
        const fs = d.fillStyle;
        if (fs !== 'vertical' && fs !== 'horizontal' && fs !== 'both') return;

        el._path.setAttribute('fill', 'none');
        el._path.setAttribute('fill-opacity', '0');

        const ringPx = getGeoShapeOutlineRingPx(el);
        if (ringPx.length < 3) return;

        let minx = Infinity;
        let maxx = -Infinity;
        let miny = Infinity;
        let maxy = -Infinity;
        for (let i = 0; i < ringPx.length; i++) {
            const p = ringPx[i];
            minx = Math.min(minx, p.x);
            maxx = Math.max(maxx, p.x);
            miny = Math.min(miny, p.y);
            maxy = Math.max(maxy, p.y);
        }
        const spacing = 12;
        const color = d.color || '#3b82f6';
        const hatchOpt = {
            color,
            weight: 1,
            opacity: 0.55,
            interactive: false,
            pane: 'geoObstacleHatchPane',
            className: 'geo-obstacle-hatch-line'
        };
        const layer = layers.find((l) => l.id === el._layerId);
        if (!layer) return;
        el._geoObstacleHatchLines = [];

        function emitChord(latlngA, latlngB) {
            const bent = bendLatLngSegmentAroundObstacles(latlngA, latlngB);
            if (bent.length < 2 || map.distance(bent[0], bent[bent.length - 1]) < 0.25) return;
            const pl = L.polyline(bent, hatchOpt);
            layer.group.addLayer(pl);
            el._geoObstacleHatchLines.push(pl);
        }

        if (fs === 'vertical' || fs === 'both') {
            const xStart = Math.floor(minx / spacing) * spacing;
            for (let x = xStart; x <= maxx + spacing; x += spacing) {
                const yints = verticalLinePolygonYIntervals(x, ringPx);
                for (let j = 0; j < yints.length; j++) {
                    const ya = yints[j][0];
                    const yb = yints[j][1];
                    if (yb - ya < 0.5) continue;
                    emitChord(map.layerPointToLatLng(L.point(x, ya)), map.layerPointToLatLng(L.point(x, yb)));
                }
            }
        }
        if (fs === 'horizontal' || fs === 'both') {
            const yStart = Math.floor(miny / spacing) * spacing;
            for (let y = yStart; y <= maxy + spacing; y += spacing) {
                const xints = horizontalLinePolygonXIntervals(y, ringPx);
                for (let j = 0; j < xints.length; j++) {
                    const xa = xints[j][0];
                    const xb = xints[j][1];
                    if (xb - xa < 0.5) continue;
                    emitChord(map.layerPointToLatLng(L.point(xa, y)), map.layerPointToLatLng(L.point(xb, y)));
                }
            }
        }
    }

    let geoObstacleHatchRefreshTimer = null;
    function scheduleRefreshAllGeoObstacleHatches() {
        if (geoObstacleHatchRefreshTimer) clearTimeout(geoObstacleHatchRefreshTimer);
        geoObstacleHatchRefreshTimer = setTimeout(() => {
            geoObstacleHatchRefreshTimer = null;
            layers.forEach((l) => {
                l.elements.forEach((el) => {
                    const hit = (x) => x && x._geoData && ['vertical', 'horizontal', 'both'].includes(x._geoData.fillStyle);
                    if (hit(el) && (el instanceof L.Polygon || el instanceof L.Circle)) scheduleGeoPathFill(el);
                    (el._rangeCircles || []).forEach((c) => { if (hit(c)) scheduleGeoPathFill(c); });
                    (el._rangeSectors || []).forEach((p) => { if (hit(p)) scheduleGeoPathFill(p); });
                });
            });
        }, 150);
    }

    async function autoDrawCircleXFlankLines(options = {}) {
        const crit = (typeof window.setCriticalMessage === 'function')
            ? window.setCriticalMessage.bind(window)
            : (text) => {
                const el = document.getElementById('free-draw-critical');
                if (el) el.textContent = text || '';
            };
        if (!map) return;
        if (autoFlankDrawInFlight) {
            crit('Auto-flank is still running. Wait for it to finish, then try again.');
            return;
        }
        autoFlankDrawInFlight = true;
        try {
            await ensureObstaclePolygonsLoaded();
            // Re-route the existing scalloped frontline around obstacles before
            // computing flank lines (flank axis depends on the frontline geometry).
            rerouteScallopedFrontlineAroundObstacles();
            let mode = options.mode != null ? String(options.mode).trim() : '8';
            if (mode === 'both' || mode === '8+20' || mode === '8-20' || mode.toLowerCase() === '8 and 20') {
                mode = '8&20';
            }
            const dist1 = parseFloat(options.dist1) || 8;
            const dist2 = parseFloat(options.dist2) || 20;
            // tag scopes battalion/brigade lines independently within the same session
            const tag = options.tag || 'default';

            const circleCenters = getCircleXCenters();
            if (!circleCenters.length) {
                crit('No Circle X obstacles found. Place Circle X first.');
                return;
            }
            if (circleCenters.length !== 3) {
                crit('Auto flank needs exactly three Circle X markers (left, center, right).');
                return;
            }

            const sessionId = window.freeDrawSignatureSessionId;
            const stateKey = sessionId + '|' + tag;
            // Only remove flank elements belonging to the CURRENT session AND tag — preserve other groups'.
            const existing = getAllLayerElements().filter(el =>
                (el instanceof L.Polyline || el instanceof L.Polygon) && el._autoFlankLine &&
                el._tmgData?.sessionId === sessionId && el._tmgData?.tag === tag
            );
            existing.forEach(el => removeFromLayer(el));

            const affiliation = (typeof window.freeDrawSignatureAffiliation === 'string') ? window.freeDrawSignatureAffiliation : 'friendly';
            const lineColor = (affiliation === 'enemy') ? '#ef4444' : '#3b82f6';
            const axisData = getFrontLineAxis();
            if (!axisData) {
                crit('Cannot determine front line direction. Draw a frontline first.');
                return;
            }

            let drawn = 0;

            const lcr = getOrderedLCRCircleCentersForAutoFlank(axisData);
            if (!lcr) {
                crit('Cannot resolve left / center / right Circle X order for auto flank.');
                lastAutoFlankModeBySession[stateKey] = null;
                return;
            }
            // Must not destructure { L, C, R } — `L` would be block-scoped and shadow Leaflet's global
            // `L` for this entire try, breaking `L.Polyline` / `L.Polygon` above (TDZ ReferenceError).
            const { L: flkL, C: flkC, R: flkR } = lcr;

            const borderOpt = {
                color: lineColor,
                weight: 3,
                opacity: 0.85,
                interactive: true,
                className: 'auto-flank-border',
                lineJoin: 'round',
                lineCap: 'round'
            };

            const zoneSpec = buildRectangleAutoFlankZoneRings(mode, flkL, flkC, flkR, dist1, dist2);
            if (!zoneSpec || !zoneSpec.ringsMeta || !zoneSpec.ringsMeta.length) {
                drawn = 0;
            } else {
                const polys = renderClippedAutoFlankRings(zoneSpec.ringsMeta, borderOpt, sessionId, tag);
                for (const [a, b] of (zoneSpec.dividers || [])) {
                    const divLine = L.polyline([a, b], {
                        color: borderOpt.color || '#3b82f6',
                        weight: borderOpt.weight != null ? borderOpt.weight : 3,
                        interactive: false,
                        pane: 'autoFlankAreaPane'
                    });
                    divLine._autoFlankLine = true;
                    divLine._tmgData = { typeId: 'auto-flank-area', sessionId, tag };
                    addToActiveLayer(divLine);
                }
                drawn = polys.length > 0 ? circleCenters.length : 0;
            }

            if (drawn === 0) {
                crit('No valid front line found for auto flank generation. Ensure a scalloped front line exists.');
                lastAutoFlankModeBySession[stateKey] = null;
            } else {
                crit(`Auto-drew flank area (${tag} / ${mode}).`);
                lastAutoFlankModeBySession[stateKey] = mode;
                if (window.freeDrawSignature) {
                    window.freeDrawSignatureStage = 'post-flank';
                    window.freeDrawSignatureActive = false;
                    if (typeof window.freeDrawSignature.syncPostFlankStage === 'function') {
                        window.freeDrawSignature.syncPostFlankStage();
                    }
                }
            }
        } catch (err) {
            console.error('autoDrawCircleXFlankLines', err);
            crit('Auto-flank error: ' + (err && err.message ? err.message : String(err)));
        } finally {
            autoFlankDrawInFlight = false;
        }
    }

    /**
     * Re-route the existing scalloped frontline segments around obstacles.
     * Finds all scalloped groups/markers for the current session, extracts
     * their control-point chain, removes the old segments, and re-creates
     * them through expandScallopedControlPointsToChordPairs (obstacle-aware).
     */
    function rerouteScallopedFrontlineAroundObstacles() {
        const sessionId = window.freeDrawSignatureSessionId;
        const scallopedGroups = [];
        const scallopedSingles = [];
        getAllLayerElements().forEach(el => {
            if (el instanceof L.LayerGroup && el._tmgData?.typeId === 'scalloped' && Array.isArray(el._tmgData.segments)) {
                if (sessionId && el._tmgData.segments.length > 0) {
                    const seg0 = el._tmgData.segments[0];
                    if (seg0?._tmgData?.sessionId && seg0._tmgData.sessionId !== sessionId) return;
                }
                scallopedGroups.push(el);
            } else if (el instanceof L.Marker && el._tmgData?.typeId === 'scalloped') {
                if (sessionId && el._tmgData.sessionId && el._tmgData.sessionId !== sessionId) return;
                scallopedSingles.push(el);
            }
        });
        if (!scallopedGroups.length && !scallopedSingles.length) return;

        // Collect control points from groups (ordered segment chain)
        scallopedGroups.forEach(group => {
            const segs = group._tmgData.segments;
            if (!segs || !segs.length) return;
            const controlPts = [];
            segs.forEach((seg, i) => {
                const d = seg._tmgData;
                if (!d || !d.latlng1 || !d.latlng2) return;
                if (i === 0) controlPts.push(L.latLng(d.latlng1.lat, d.latlng1.lng));
                controlPts.push(L.latLng(d.latlng2.lat, d.latlng2.lng));
            });
            if (controlPts.length < 2) return;
            const color = group._tmgData.color || '#3b82f6';
            const strokeWidth = group._tmgData.strokeWidth ?? 4;
            removeFromLayer(group);
            const pairs = expandScallopedControlPointsToChordPairs(controlPts);
            addScallopedFrontLineFromChordPairs(pairs, color, strokeWidth);
        });

        // Handle single-segment scalloped markers
        scallopedSingles.forEach(marker => {
            const d = marker._tmgData;
            if (!d || !d.latlng1 || !d.latlng2) return;
            const controlPts = [
                L.latLng(d.latlng1.lat, d.latlng1.lng),
                L.latLng(d.latlng2.lat, d.latlng2.lng)
            ];
            const color = d.color || '#3b82f6';
            const strokeWidth = d.strokeWidth ?? 4;
            removeFromLayer(marker);
            const pairs = expandScallopedControlPointsToChordPairs(controlPts);
            addScallopedFrontLineFromChordPairs(pairs, color, strokeWidth);
        });
    }

    window.autoDrawCircleXFlankLines = autoDrawCircleXFlankLines;

    // Clear auto-flank elements (lines and polygons) that belong to a specific tag
    window.clearAutoFlankLinesByTag = function (tag) {
        const sessionId = window.freeDrawSignatureSessionId;
        getAllElements().filter(el =>
            (el instanceof L.Polyline || el instanceof L.Polygon) && el._autoFlankLine &&
            el._tmgData?.sessionId === sessionId && el._tmgData?.tag === tag
        ).forEach(el => removeFromLayer(el));
        const stateKey = sessionId + '|' + tag;
        lastAutoFlankModeBySession[stateKey] = null;
    };

    // Find an orphaned circle-X session (circles placed but no scalloped front line drawn)
    window.findOrphanedCircleXSession = function () {
        const sessionCircles = {};
        const sessionHasFrontline = {};
        const NO_SESSION_KEY = '__no-session__';
        for (const layer of layers) {
            if (!layer.visible) continue;
            for (const el of layer.elements) {
                const d = el._tmgData;
                if (!d) continue;
                // Check LayerGroup segments for scalloped sessionIds
                if (el instanceof L.LayerGroup && d.segments) {
                    d.segments.forEach(seg => {
                        if (seg?._tmgData?.typeId === 'scalloped' && seg._tmgData.sessionId) {
                            sessionHasFrontline[seg._tmgData.sessionId] = true;
                        }
                    });
                }
                const sid = d.sessionId || (d.typeId === 'circle-x' ? NO_SESSION_KEY : null);
                if (!sid) continue;
                if (d.typeId === 'circle-x') {
                    if (!sessionCircles[sid]) sessionCircles[sid] = { centers: [], affiliation: 'friendly' };
                    if (el instanceof L.Marker) sessionCircles[sid].centers.push(el.getLatLng());
                    if (d.color === '#ef4444') sessionCircles[sid].affiliation = 'enemy';
                }
                if (d.typeId === 'scalloped') {
                    sessionHasFrontline[sid] = true;
                }
            }
        }
        let best = null;
        for (const sid in sessionCircles) {
            if (sessionHasFrontline[sid]) continue;
            if (sessionCircles[sid].centers.length < 2) continue;
            if (!best || sid > best.sessionId) {
                best = { sessionId: sid === NO_SESSION_KEY ? null : sid, centers: sessionCircles[sid].centers, affiliation: sessionCircles[sid].affiliation };
            }
        }
        return best;
    };

    // Remove all circle-X markers that belong to a specific session (null = no sessionId)
    window.removeCircleXBySession = function (sessionId) {
        const toRemove = getAllElements().filter(el => {
            if (!(el instanceof L.Marker) || el._tmgData?.typeId !== 'circle-x') return false;
            if (sessionId === null) return !el._tmgData.sessionId;
            return el._tmgData?.sessionId === sessionId;
        });
        toRemove.forEach(el => removeFromLayer(el));
    };


    function buildLinePopupContent(polyline) {
        const color = (polyline.options?.color || '#3b82f6').toString().toLowerCase();
        const isDotted = !!polyline.options?.dashArray;
        const isFriendly = color.includes('3b82f6') || color === '#3b82f6';
        const friendlyActive = isFriendly ? ' active' : '';
        const enemyActive = !isFriendly ? ' active' : '';
        const solidActive = !isDotted ? ' active' : '';
        const dottedActive = isDotted ? ' active' : '';
        const pts = polyline.getLatLngs?.() || [];
        const flatPts = Array.isArray(pts[0]) ? pts.flat() : pts;
        const coordLines = flatPts.map((p, i) => {
            const lat = p?.lat ?? p?.[0];
            const lng = p?.lng ?? p?.[1];
            if (lat == null || lng == null) return '';
            const lab = flatPts.length > 2 ? ` ${i + 1}` : (i === 0 ? ' Start' : ' End');
            return `<label style="display:block;margin:4px 0;font-size:0.7rem;color:#6b7280;text-align:left;">${lab}: ${coordInputHtml('line-coord-input', lat, lng, `data-index="${i}"`, 'width:100%;max-width:200px;padding:4px 6px;font-size:0.75rem;border:1px solid #cbd5e1;border-radius:4px;')}</label>`;
        }).filter(Boolean).join('');
        const coordBlock = coordLines ? `<div style="margin:6px 0;padding:6px;background:#f8fafc;border-radius:4px;text-align:left;">${coordLines}</div>` : '';
        const pathPts = flatPts.filter(p => p != null).map(p => L.latLng(p.lat ?? p[0], p.lng ?? p[1]));
        const pathKm = pathPts.length >= 2 ? totalDistanceKm(pathPts) : 0;
        const pathNmHtml = pathPts.length >= 2 && isFinite(pathKm)
            ? formatDistanceSecondaryHintSpanFromKm(pathKm, 2, 'line-popup-path-nm-hint')
            : '';
        const lineDistPrimaryNm = getDistanceUnitPrimary() === 'nm';
        const lineDistInputMin = lineDistPrimaryNm ? '0.00054' : '0.001';
        const lineDistInputStep = lineDistPrimaryNm ? '0.0001' : '0.001';
        let pathDistVal = '';
        if (pathPts.length >= 2 && isFinite(pathKm)) {
            if (lineDistPrimaryNm) {
                const nm = kmToNauticalMiles(pathKm);
                pathDistVal = isFinite(nm) ? escapeHtml(String(Math.round(nm * 10000) / 10000)) : '';
            } else {
                pathDistVal = escapeHtml(String(Math.round(pathKm * 10000) / 10000));
            }
        }
        const linePathUnitSuffix = `<span style="font-size:0.75rem;">${lineDistPrimaryNm ? 'NM' : 'km'}</span>`;
        const lineKmLabel = typeof t === 'function'
            ? (lineDistPrimaryNm ? t('geo-popup-nm-path') : t('geo-popup-km-path'))
            : (lineDistPrimaryNm ? 'Path length (NM)' : 'Path length (km)');
        const lengthRow = pathPts.length >= 2 ? `<div dir="ltr" class="line-popup-path-km-row" style="margin:6px 0;text-align:left;unicode-bidi:isolate;">
                <label style="font-size:0.7rem;color:#6b7280;display:block;">${escapeHtml(lineKmLabel)}</label>
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px;">
                    <input type="number" step="${lineDistInputStep}" min="${lineDistInputMin}" class="line-popup-path-km-input" value="${pathDistVal}" style="width:7rem;padding:4px 6px;font-size:0.8rem;border:1px solid #cbd5e1;border-radius:4px;">
                    ${linePathUnitSuffix}
                    ${pathNmHtml}
                </div>
            </div>` : '';
        const lineDefaultName = typeof t === 'function' ? t('tactical-line') : 'Tactical Line';
        return `
            <div class="line-popup-content" style="text-align:center;">
                <div class="map-popup-header-bar">${mapPopupCloseButtonHtml()}</div>
                ${getFeatureDisplayNameInputHtml('line-display-name-input', polyline._lineDisplayName, lineDefaultName)}
                ${coordBlock}
                ${lengthRow}
                <div style="margin:8px 0;">
                    <span style="font-size:0.75rem;color:#6b7280;">${typeof t === 'function' ? t('affiliation') : 'Affiliation'}:</span>
                    <div style="display:flex;gap:6px;margin-top:4px;justify-content:center;">
                        <button type="button" class="line-popup-color-btn${friendlyActive}" data-color="#3b82f6" style="padding:4px 10px;border-radius:4px;cursor:pointer;border:1px solid #cbd5e1;">${typeof t === 'function' ? t('friendly') : 'Friendly'}</button>
                        <button type="button" class="line-popup-color-btn${enemyActive}" data-color="#ef4444" style="padding:4px 10px;border-radius:4px;cursor:pointer;border:1px solid #cbd5e1;">${typeof t === 'function' ? t('enemy') : 'Enemy'}</button>
                    </div>
                </div>
                <div style="margin:8px 0;">
                    <span style="font-size:0.75rem;color:#6b7280;">${typeof t === 'function' ? t('line-style') : 'Line Style'}:</span>
                    <div style="display:flex;gap:6px;margin-top:4px;justify-content:center;">
                        <button type="button" class="line-popup-style-btn${solidActive}" data-style="solid" style="padding:4px 10px;border-radius:4px;cursor:pointer;border:1px solid #cbd5e1;">${typeof t === 'function' ? t('solid') : 'Solid'}</button>
                        <button type="button" class="line-popup-style-btn${dottedActive}" data-style="dotted" style="padding:4px 10px;border-radius:4px;cursor:pointer;border:1px solid #cbd5e1;">${typeof t === 'function' ? t('dotted') : 'Dotted'}</button>
                    </div>
                </div>
                ${getDrawingRotateControlsHtml()}
                <button class="duplicate-line-btn" style="margin-right:4px;cursor:pointer;">${typeof t === 'function' ? t('duplicate') : 'Duplicate'}</button>
                <button class="remove-line-btn" style="margin-top:8px;color:red;cursor:pointer;">${typeof t === 'function' ? t('remove-line') : 'Remove Line'}</button>
            </div>
        `;
    }

    function bindLinePopupHandlers(polyline) {
        const popup = polyline.getPopup();
        const content = popup?.getElement();
        if (!content) return;
        bindMapPopupCloseButton(content, polyline);
        bindFeatureDisplayNameInput(content, '.line-display-name-input', (v) => {
            if (v) polyline._lineDisplayName = v;
            else delete polyline._lineDisplayName;
        });
        const lineKmInput = content.querySelector('.line-popup-path-km-input');
        if (lineKmInput) {
            const updateLinePathNmHint = () => {
                const km = parseDistancePopupInputToKm(lineKmInput.value);
                if (!isFinite(km)) return;
                const nmEl = content.querySelector('.line-popup-path-nm-hint');
                if (nmEl) nmEl.textContent = formatDistanceSecondaryHintFromKm(km, 2) || '';
            };
            lineKmInput.addEventListener('input', updateLinePathNmHint);
            const applyLinePathKm = () => {
                const kmFromField = parseDistancePopupInputToKm(lineKmInput.value);
                if (!scaleOpenPolylinePathKm(polyline, kmFromField)) return;
                polyline.setPopupContent(buildLinePopupContent(polyline));
                bindLinePopupHandlers(polyline);
                scheduleSaveToStorage();
            };
            lineKmInput.addEventListener('blur', applyLinePathKm);
            lineKmInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); lineKmInput.blur(); }
            });
        }
        content.querySelector('.remove-line-btn')?.addEventListener('click', () => removeFromLayer(polyline));
        content.querySelector('.duplicate-line-btn')?.addEventListener('click', () => duplicatePolyline(polyline));
        content.querySelectorAll('.line-coord-input').forEach(inp => {
            const applyCoord = () => {
                const idx = parseInt(inp.dataset.index, 10);
                if (isNaN(idx)) return;
                const p = parseCoordInputElement(inp);
                if (!p) return;
                const pts = polyline.getLatLngs?.() || [];
                const flatPts = Array.isArray(pts[0]) ? pts.flat() : pts;
                if (idx < 0 || idx >= flatPts.length) return;
                flatPts[idx] = L.latLng(p.lat, p.lng);
                polyline.setLatLngs(flatPts);
                syncPlainLineEndpointHandlePositions(polyline);
                polyline.setPopupContent(buildLinePopupContent(polyline));
                bindLinePopupHandlers(polyline);
                scheduleSaveToStorage();
            };
            bindCoordEditorEvents(inp, applyCoord);
        });
        content.querySelectorAll('.line-popup-color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const c = btn.dataset.color;
                if (!c) return;
                polyline.setStyle({ color: c });
                polyline.setPopupContent(buildLinePopupContent(polyline));
                bindLinePopupHandlers(polyline);
                scheduleSaveToStorage();
            });
        });
        content.querySelectorAll('.line-popup-style-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const style = btn.dataset.style;
                const dashArray = style === 'dotted' ? '10, 10' : null;
                polyline.setStyle({ dashArray });
                polyline.setPopupContent(buildLinePopupContent(polyline));
                bindLinePopupHandlers(polyline);
                scheduleSaveToStorage();
            });
        });
        bindDrawingRotateControls(content, (delta) => {
            const lls = polyline.getLatLngs?.() || [];
            const flat = (lls.length && lls[0] && Array.isArray(lls[0])) ? lls.flat() : lls;
            const arr = flat.map(p => L.latLng(p.lat, p.lng));
            if (arr.length < 2) return;
            const c = centroidOfLatLngs(arr);
            if (!c) return;
            const newPts = rotateLatLngsAroundPivotClockwise(arr, c, delta);
            polyline.setLatLngs(newPts);
            syncPlainLineEndpointHandlePositions(polyline);
            polyline.setPopupContent(buildLinePopupContent(polyline));
            bindLinePopupHandlers(polyline);
            scheduleSaveToStorage();
        });

        const sidcManualInput = document.getElementById('sidc-manual');
        const pickedSidcDisplay = document.getElementById('picked-sidc-display');
        const openSidcPickerBtn = document.getElementById('open-sidc-picker');
        const syncSidcBtn = document.getElementById('sync-sidc-from-picker');
        const pickerModal = document.getElementById('sidc-picker-modal');
        const pickerCloseBackdrop = document.getElementById('sidc-picker-close');
        const pickerCloseBtn = document.getElementById('sidc-picker-close-btn');
        const pickerFrame = document.getElementById('sidc-picker-frame');
        function buildSidcPickerIframeSrc() {
            // ...
        }
        function syncSidcPickerLocaleToFrame() {
            // ...
        }
        if (pickerFrame) {
            pickerFrame.src = buildSidcPickerIframeSrc();
            pickerFrame.addEventListener('load', () => syncSidcPickerLocaleToFrame());
        }



    }

    // SIDC UI Elements (picker-only, no dropdowns)
    const sidcManualInput = document.getElementById('sidc-manual');
    const pickedSidcDisplay = document.getElementById('picked-sidc-display');
    const openSidcPickerBtn = document.getElementById('open-sidc-picker');
    const syncSidcBtn = document.getElementById('sync-sidc-from-picker');
    const pickerModal = document.getElementById('sidc-picker-modal');
    const pickerCloseBackdrop = document.getElementById('sidc-picker-close');
    const pickerCloseBtn = document.getElementById('sidc-picker-close-btn');
    const pickerFrame = document.getElementById('sidc-picker-frame');
    const sidcDisplay = document.getElementById('sidc-code-display');
    const previewBox = document.getElementById('symbol-preview');

    const textUniqueDesignation = document.getElementById('text-unique-designation');
    const textAdditionalInfo = document.getElementById('text-additional-info');
    const textAltitudeDepth = document.getElementById('text-altitude-depth');
    const textQuantity = document.getElementById('text-quantity');
    const textHigherFormation = document.getElementById('text-higher-formation');
    function buildSidcPickerIframeSrc() {
        let lang = 'en';
        try {
            if (typeof window.getCurrentLang === 'function') {
                const l = window.getCurrentLang();
                if (l === 'ar' || l === 'en') lang = l;
            }
        } catch (e) {
            console.warn('buildSidcPickerIframeSrc: lang read failed', e);
        }
        return `../vendor/sidc-picker/index.html?lang=${lang}#/APP6`;
    }
    function syncSidcPickerLocaleToFrame() {
        if (!pickerFrame || !pickerFrame.contentWindow) return;
        try {
            const lang = typeof window.getCurrentLang === 'function' ? window.getCurrentLang() : 'en';
            pickerFrame.contentWindow.postMessage({ type: 'sidc-picker:setLocale', locale: lang }, '*');
        } catch (e) {
            console.warn('syncSidcPickerLocaleToFrame failed', e);
        }
    }
    if (pickerFrame) {
        pickerFrame.src = buildSidcPickerIframeSrc();
        pickerFrame.addEventListener('load', () => syncSidcPickerLocaleToFrame());
    }
    

    function getTextModifiers() {
        const opts = { size: 30 };
        const v = (el) => (el && el.value ? String(el.value).trim() : '');
        if (v(textUniqueDesignation)) opts.uniqueDesignation = v(textUniqueDesignation);
        if (v(textAdditionalInfo)) opts.additionalInformation = v(textAdditionalInfo);
        if (v(textAltitudeDepth)) opts.altitudeDepth = v(textAltitudeDepth);
        if (v(textQuantity)) opts.quantity = v(textQuantity);
        if (v(textHigherFormation)) opts.higherFormation = v(textHigherFormation);
        return opts;
    }

    // --- MILSMBOL LOGIC ---
    let sidcOverride = '';
    let editingSymbolMarker = null;

    function setSidcOverride(sidc) {
        sidcOverride = sidc;
        if (sidcManualInput) sidcManualInput.value = sidc;

        if (pickedSidcDisplay) {
            if (sidc) {
                pickedSidcDisplay.textContent = `SIDC: ${sidc}`;
                pickedSidcDisplay.classList.add('active');
            } else {
                pickedSidcDisplay.textContent = 'Apply a symbol from the picker';
                pickedSidcDisplay.classList.remove('active');
            }
        }

        if (editingSymbolMarker && sidc) {
            const sidcField = document.querySelector('.symbol-edit-sidc');
            if (sidcField) sidcField.value = sidc;
        }

        updateSymbolPreview();
    }

        window.__APP_SIDC_PICKER_SET = function (sidc) {
        const normalized = normalizeSidcInput(sidc);
        if (!normalized) return;
        setSidcOverride(normalized);
    };




    // Expose a global hook so the embedded picker can call us directly.
    window.__APP_SIDC_PICKER_SET = function (sidc) {
        const normalized = normalizeSidcInput(sidc);
        if (!normalized) return;
        setSidcOverride(normalized);
    };

    function pullSidcFromManualInput() {
        if (!sidcManualInput) return;
        const sidc = normalizeSidcInput(sidcManualInput.value);
        if (!sidc) {
            if (pickedSidcDisplay) {
                pickedSidcDisplay.textContent = 'SIDC not recognized';
                pickedSidcDisplay.classList.remove('active');
            }
            return;
        }
        setSidcOverride(sidc);
    }

    function generateSIDC() {
        const sidc = normalizeSidcInput(sidcOverride) || normalizeSidcInput(sidcManualInput?.value);
        if (sidc) return sidc;
        // Default: Friend infantry (until user applies from picker)
        return '10031000001200000000';
    }

    function updateSymbolPreview() {
        const sidc = generateSIDC();
        sidcDisplay.innerText = `SIDC: ${sidc}`;

        const opts = getTextModifiers();
        const sym = new ms.Symbol(sidc, opts);

        previewBox.innerHTML = '';
        if (sym.isValid()) {
            previewBox.appendChild(sym.asDOM());
        } else {
            previewBox.innerHTML = '<span style="color:var(--danger)">Invalid SIDC Code</span>';
        }
    }

    // Bind text modifiers to preview
    [textUniqueDesignation, textAdditionalInfo, textAltitudeDepth, textQuantity, textHigherFormation].forEach(el => {
        if (el) el.addEventListener('input', updateSymbolPreview);
    });

    // Initial Render
    setSidcOverride('');
    updateSymbolPreview();

    // --- SIDC Favorites (top bar: replaces status pills) ---
    const SIDC_FAVORITES_KEY = 'nato-sidc-favorites';
    const SIDC_FAVORITES_MAX = 16;
    const topFavoritesWrap = document.getElementById('top-favorites-wrap');
    const topFavoritesBtn = document.getElementById('top-favorites-btn');
    const topFavoritesPanel = document.getElementById('top-favorites-panel');
    const topFavoritesList = document.getElementById('top-favorites-list');
    const topFavoritesAddBtn = document.getElementById('top-favorites-add-current');

    function loadSidcFavorites() {
        try {
            const raw = localStorage.getItem(SIDC_FAVORITES_KEY);
            if (raw == null) {
                const copy = FALLBACK_SIDC_FAVORITES.map((f) => ({ ...f }));
                localStorage.setItem(SIDC_FAVORITES_KEY, JSON.stringify(copy));
                return copy;
            }
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) return FALLBACK_SIDC_FAVORITES.map((f) => ({ ...f }));
            return arr
                .map((f) => {
                    let label = String(f.label || '').trim().slice(0, 48);
                    if (label === 'Symbol') label = '';
                    return { sidc: normalizeSidcInput(f.sidc), label };
                })
                .filter((f) => f.sidc);
        } catch {
            return FALLBACK_SIDC_FAVORITES.map((f) => ({ ...f }));
        }
    }

    function saveSidcFavorites(list) {
        try {
            localStorage.setItem(SIDC_FAVORITES_KEY, JSON.stringify(list.slice(0, SIDC_FAVORITES_MAX)));
        } catch { /* ignore quota */ }
    }

    /** Human-ish line from milsymbol metadata (affiliation · dimension · echelon). Not full APP-6 names (e.g. “Infantry”) without a separate icon lookup. */
    function getSidcMetadataLabel(sidc, textMods) {
        try {
            const sym = new ms.Symbol(sidc, { ...(textMods || {}), size: 25, simpleStatusModifier: true });
            if (!sym.isValid()) return '';
            const meta = sym.metadata || {};
            const parts = [];
            // Translate affiliation
            if (meta.affiliation && meta.affiliation !== 'undefined') {
                const affKey = 'sidc-meta-affiliation-' + String(meta.affiliation).toLowerCase();
                if (typeof t === 'function' && t(affKey) !== affKey) {
                    parts.push(t(affKey));
                } else {
                    parts.push(meta.affiliation);
                }
            }
            // Translate dimension
            if (meta.dimension && meta.dimension !== 'undefined' && String(meta.dimension).trim()) {
                const dimKey = 'sidc-meta-dimension-' + String(meta.dimension).toLowerCase();
                if (typeof t === 'function' && t(dimKey) !== dimKey) {
                    parts.push(t(dimKey));
                } else {
                    parts.push(meta.dimension);
                }
            }
            // Echelon (leave untranslated for now)
            if (meta.echelon) parts.push(meta.echelon);
            if (parts.length) return parts.join(' · ');
        } catch (_) { /* ignore */ }
        return '';
    }

    function favoriteSymbolThumbnail(sidc) {
        const wrap = document.createElement('span');
        wrap.className = 'top-favorites-thumb';
        try {
            const sym = new ms.Symbol(sidc, { size: 36, simpleStatusModifier: true });
            if (sym.isValid()) wrap.appendChild(sym.asDOM());
        } catch { /* ignore */ }
        return wrap;
    }

    function setTopFavoritesOpen(isOpen) {
        if (!topFavoritesPanel || !topFavoritesBtn) return;
        if (isOpen) {
            topFavoritesPanel.classList.remove('hidden');
            topFavoritesPanel.setAttribute('aria-hidden', 'false');
            topFavoritesBtn.setAttribute('aria-expanded', 'true');
            if (typeof t === 'function') topFavoritesPanel.setAttribute('aria-label', t('favorites-panel-aria'));
            renderTopFavoritesPanel();
        } else {
            topFavoritesPanel.classList.add('hidden');
            topFavoritesPanel.setAttribute('aria-hidden', 'true');
            topFavoritesBtn.setAttribute('aria-expanded', 'false');
        }
    }

    function renderTopFavoritesPanel() {
        if (!topFavoritesList) return;
        topFavoritesList.innerHTML = '';
        const list = loadSidcFavorites();
        if (list.length === 0) {
            const p = document.createElement('div');
            p.className = 'top-favorites-empty';
            p.textContent = typeof t === 'function' ? t('favorites-empty') : 'No favorites yet.';
            topFavoritesList.appendChild(p);
            return;
        }
        list.forEach((fav, index) => {
            const sidc = fav.sidc;
            const row = document.createElement('div');
            row.className = 'top-favorites-item';
            row.setAttribute('role', 'button');
            row.tabIndex = 0;
            row.addEventListener('click', (e) => {
                if (e.target.closest('.top-favorites-remove')) return;
                applyFavoriteSidc(sidc);
            });
            row.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    if (!e.target.closest('.top-favorites-remove')) applyFavoriteSidc(sidc);
                }
            });

            const rm = document.createElement('button');
            rm.type = 'button';
            rm.className = 'top-favorites-remove';
            rm.setAttribute('aria-label', typeof t === 'function' ? t('favorites-remove') : 'Remove');
            rm.textContent = '×';
            rm.addEventListener('click', (ev) => {
                ev.stopPropagation();
                const cur = loadSidcFavorites();
                cur.splice(index, 1);
                saveSidcFavorites(cur);
                renderTopFavoritesPanel();
            });

            row.appendChild(favoriteSymbolThumbnail(sidc));

            // Resolve human-readable entity name from SIDC via extracted picker data
            let mainIconLabel = '';
            {
                const s = String(sidc || '').replace(/[^0-9]/g, '');
                if (s.length >= 20) {
                    const symbolSet = s.substr(4, 2);
                    const code = s.substr(10, 2) + s.substr(12, 2) + s.substr(14, 2);
                    const std = window.SIDC_PICKER_STANDARD && window.SIDC_PICKER_STANDARD['APP6'];
                    const icons = std && std[symbolSet] && std[symbolSet]['main icon'];
                    if (icons) {
                        let found = icons.find(i => i.code === code);
                        if (!found) found = icons.find(i => i.code === code.substr(0, 4) + '00');
                        if (!found) found = icons.find(i => i.code === code.substr(0, 2) + '0000');
                        if (found) {
                            let label = found.entity || '';
                            if (found['entity type']) label += ' - ' + found['entity type'];
                            if (found['entity subtype']) label += ' - ' + found['entity subtype'];
                            const locale = document.documentElement.getAttribute('lang') || 'en';
                            if (locale === 'ar' && window.sidcPickerArTrans && label) {
                                const parts = label.split(/\s*-\s*/).map(p => p.trim()).filter(Boolean);
                                mainIconLabel = parts.map(p => window.sidcPickerArTrans[p] || p).join(' — ');
                            } else {
                                mainIconLabel = label;
                            }
                        }
                    }
                }
            }
            if (!mainIconLabel) {
                mainIconLabel = typeof t === 'function' ? t('main-icon-unknown') : 'غير معروف';
            }

            // فقط اسم الفئة الرئيسية
            const meta = document.createElement('div');
            meta.className = 'top-favorites-meta';
            const iconEl = document.createElement('span');
            iconEl.className = 'top-favorites-mainicon';
            iconEl.style.display = 'block';
            iconEl.style.fontSize = '0.95em';
            iconEl.style.color = '#666';
            iconEl.textContent = mainIconLabel;
            meta.appendChild(iconEl);
            row.appendChild(meta);
            row.appendChild(rm);
            topFavoritesList.appendChild(row);
        });
    }

    function applyFavoriteSidc(sidc) {
        const n = normalizeSidcInput(sidc);
        if (!n) return;
        setSidcOverride(n);
        if (modeSelect) {
            modeSelect.value = 'symbol';
            modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        setTopFavoritesOpen(false);
    }

    function addCurrentSidcToFavorites() {
        const sidc = normalizeSidcInput(generateSIDC());
        if (!sidc) return;
        const list = loadSidcFavorites();
        if (list.some((x) => x.sidc === sidc)) return;
        list.unshift({ sidc, label: '' });
        saveSidcFavorites(list.slice(0, SIDC_FAVORITES_MAX));
        renderTopFavoritesPanel();
    }

    topFavoritesBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        setTopFavoritesOpen(topFavoritesPanel.classList.contains('hidden'));
    });
    topFavoritesAddBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        addCurrentSidcToFavorites();
    });
    document.addEventListener('click', (e) => {
        if (!topFavoritesWrap || !topFavoritesPanel || topFavoritesPanel.classList.contains('hidden')) return;
        if (!topFavoritesWrap.contains(e.target)) setTopFavoritesOpen(false);
    });
    document.addEventListener('keydown', (e) => {
        if ((e.code === 'Escape' || e.key === 'Escape') && topFavoritesPanel && !topFavoritesPanel.classList.contains('hidden')) {
            setTopFavoritesOpen(false);
        }
    });

    // --- Layer Template Favorites ---
    const LAYER_TEMPLATE_FAVORITES_KEY = 'nato-layer-template-favorites';
    const LAYER_TEMPLATE_FAVORITES_MAX = 30;
    const LAYER_TEMPLATE_MAX_NAME_LEN = 80;
    const LAYER_TEMPLATE_MAX_PAYLOAD_CHARS = 900000;

    function createLayerTemplateId() {
        return `ltpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function normalizeLayerTemplateName(name, fallback) {
        const s = String(name || '').trim().slice(0, LAYER_TEMPLATE_MAX_NAME_LEN);
        if (s) return s;
        const fb = String(fallback || '').trim().slice(0, LAYER_TEMPLATE_MAX_NAME_LEN);
        return fb || `Template ${new Date().toLocaleString()}`;
    }

    function normalizeLayerTemplatePayload(payload) {
        let p = payload;
        if (typeof p === 'string') {
            try { p = JSON.parse(p); } catch (_) { return null; }
        }
        if (!p || typeof p !== 'object') return null;
        if (!Array.isArray(p.layers)) return null;
        const out = {
            version: Number(p.version) || 2,
            folders: Array.isArray(p.folders) ? [] : [],
            layers: []
        };
        const layerIdSet = new Set();
        p.layers.forEach((layer) => {
            if (!layer || typeof layer !== 'object' || !Array.isArray(layer.elements)) return;
            const next = {
                name: normalizeLayerTemplateName(layer.name, 'Layer'),
                visible: layer.visible !== false,
                active: !!layer.active,
                elements: deepCloneJsonSafe(layer.elements)
            };
            if (typeof layer.id === 'string' && layer.id.trim()) {
                next.id = layer.id.trim();
                layerIdSet.add(next.id);
            }
            out.layers.push(next);
        });
        if (out.layers.length === 0) return null;
        if (Array.isArray(p.folders)) {
            p.folders.forEach((folder) => {
                if (!folder || typeof folder !== 'object') return;
                const name = String(folder.name || '').trim();
                const folderLayerIds = Array.isArray(folder.layerIds)
                    ? folder.layerIds.filter((lid) => typeof lid === 'string' && layerIdSet.has(lid))
                    : [];
                if (!name || folderLayerIds.length === 0) return;
                out.folders.push({
                    id: (typeof folder.id === 'string' && folder.id.trim()) ? folder.id.trim() : undefined,
                    name: name.slice(0, LAYER_TEMPLATE_MAX_NAME_LEN),
                    collapsed: !!folder.collapsed,
                    layerIds: folderLayerIds
                });
            });
        }
        try {
            if (JSON.stringify(out).length > LAYER_TEMPLATE_MAX_PAYLOAD_CHARS) return null;
        } catch (_) {
            return null;
        }
        return out;
    }

    function sanitizeLayerTemplateEntry(raw) {
        if (!raw || typeof raw !== 'object') return null;
        const payload = normalizeLayerTemplatePayload(raw.payload);
        if (!payload) return null;
        const sourceType = ['layer', 'selection', 'folder'].includes(raw.sourceType) ? raw.sourceType : 'layer';
        const createdAt = Number(raw.createdAt);
        const validCreatedAt = Number.isFinite(createdAt) ? createdAt : Date.now();
        return {
            id: (typeof raw.id === 'string' && raw.id.trim()) ? raw.id.trim() : createLayerTemplateId(),
            name: normalizeLayerTemplateName(raw.name, payload.layers[0]?.name || 'Template'),
            createdAt: validCreatedAt,
            sourceType,
            payload
        };
    }

    function loadLayerTemplateFavorites() {
        try {
            const raw = localStorage.getItem(LAYER_TEMPLATE_FAVORITES_KEY);
            if (!raw) return [];
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) return [];
            const normalized = [];
            arr.forEach((item) => {
                const x = sanitizeLayerTemplateEntry(item);
                if (x) normalized.push(x);
            });
            return normalized.slice(0, LAYER_TEMPLATE_FAVORITES_MAX);
        } catch (_) {
            return [];
        }
    }

    function saveLayerTemplateFavorites(list) {
        const cleaned = [];
        (Array.isArray(list) ? list : []).forEach((item) => {
            const x = sanitizeLayerTemplateEntry(item);
            if (x) cleaned.push(x);
        });
        try {
            localStorage.setItem(LAYER_TEMPLATE_FAVORITES_KEY, JSON.stringify(cleaned.slice(0, LAYER_TEMPLATE_FAVORITES_MAX)));
            return true;
        } catch (_) {
            return false;
        }
    }

    function captureTemplateFromSelection(layerIds, opts) {
        const ids = Array.isArray(layerIds) ? layerIds.filter((id) => layers.some((l) => l.id === id)) : [];
        if (ids.length === 0) return null;
        const payloadStr = exportLayersDataFromSelection(ids);
        let payload;
        try {
            payload = JSON.parse(payloadStr);
        } catch (_) {
            return null;
        }
        const normalizedPayload = normalizeLayerTemplatePayload(payload);
        if (!normalizedPayload) return null;
        const defaultName = ids.length === 1
            ? `${getLayerDisplayName(layers.find((l) => l.id === ids[0]) || { name: 'Layer' })} Template`
            : `Selection Template (${ids.length})`;
        return sanitizeLayerTemplateEntry({
            id: createLayerTemplateId(),
            name: opts?.name || defaultName,
            createdAt: Date.now(),
            sourceType: opts?.sourceType || (ids.length === 1 ? 'layer' : 'selection'),
            payload: normalizedPayload
        });
    }

    function captureTemplateFromLayer(layerId, opts) {
        if (!layerId) return null;
        return captureTemplateFromSelection([layerId], { ...opts, sourceType: 'layer' });
    }

    function applyLayerTemplate(templateLike) {
        const tpl = sanitizeLayerTemplateEntry(templateLike);
        if (!tpl) return false;
        const beforeIds = new Set(layers.map((l) => l.id));
        importLayersData(JSON.stringify(tpl.payload), true, true);
        const imported = layers.filter((l) => !beforeIds.has(l.id));
        if (imported.length > 0) {
            layers.forEach((l) => { l.active = false; });
            imported[0].active = true;
            renderLayersList();
        }
        if (instructionText) instructionText.innerText = t('layer-template-applied', tpl.name);
        return true;
    }

    // --- MAP INTERACTIONS ---

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function mapPopupCloseButtonHtml() {
        const label = typeof t === 'function' ? t('popup-close') : 'Close';
        return `<button type="button" class="map-popup-close-btn" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">×</button>`;
    }

    function bindMapPopupCloseButton(container, layer) {
        if (!container || !layer || typeof layer.closePopup !== 'function') return;
        const btn = container.querySelector('.map-popup-close-btn');
        if (!btn) return;
        L.DomEvent.on(btn, 'click', (e) => {
            L.DomEvent.stopPropagation(e);
            if (e.preventDefault) e.preventDefault();
            layer.closePopup();
        });
    }

    function applyImportedDisplayNameProps(elData) {
        const s = trimmedDisplayNameFrom(elData?.displayName);
        return s ? { displayName: s } : {};
    }
    function assignDisplayNameOnExport(obj, displayNameSource) {
        const s = trimmedDisplayNameFrom(displayNameSource);
        if (s) obj.displayName = s;
        return obj;
    }
    function getFeatureDisplayNameInputHtml(className, currentValue, defaultPlaceholder) {
        const label = typeof t === 'function' ? t('feature-display-name') : 'Display name';
        const v = escapeHtml(trimmedDisplayNameFrom(currentValue));
        const ph = escapeHtml(defaultPlaceholder);
        return `<div class="feature-display-name-row" style="margin:0 0 8px;text-align:left;direction:ltr;unicode-bidi:isolate;"><label style="font-size:0.65rem;color:#6b7280;display:block;margin-bottom:2px;">${label}</label><input type="text" class="${className}" value="${v}" placeholder="${ph}" maxlength="120" style="width:100%;max-width:240px;padding:6px 8px;font-size:0.9rem;font-weight:600;border:1px solid #cbd5e1;border-radius:4px;box-sizing:border-box;"></div>`;
    }
    function bindFeatureDisplayNameInput(content, selector, applyValue) {
        const inp = content.querySelector(selector);
        if (!inp) return;
        const save = () => {
            applyValue(trimmedDisplayNameFrom(inp.value));
            scheduleSaveToStorage();
        };
        inp.addEventListener('blur', save);
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } });
    }

    const TEXT_LABEL_COLORS = [
        { id: 'black', color: '#000000', label: 'Black' },
        { id: 'red', color: '#ef4444', label: 'Red' },
        { id: 'blue', color: '#3b82f6', label: 'Blue' }
    ];
    const TEXT_LABEL_FONT_SIZE_MIN = 10;
    const TEXT_LABEL_FONT_SIZE_MAX = 32;
    const TEXT_LABEL_FONT_SIZE_DEFAULT = 22;
    const TEXT_LABEL_COLOR_DEFAULT = '#3b82f6';
    const TEXT_LABEL_ICON_MAX_W = 200;

    /** Box that fits the label; AABB for rotation so iconAnchor can stay at center (avoids drift when zoom changes font size). */
    function textLabelIconBoxPx(text, fontSizePx, rotationDeg) {
        const len = String(text || '').length || 1;
        const tw = Math.min(TEXT_LABEL_ICON_MAX_W, Math.max(Math.ceil(fontSizePx * 1.5), Math.ceil(len * fontSizePx * 0.55 + 12)));
        const th = Math.ceil(fontSizePx * 1.32 + 10);
        const r = ((rotationDeg || 0) % 360) * Math.PI / 180;
        if (Math.abs(r) < 1e-6) return { w: tw, h: th };
        const cr = Math.abs(Math.cos(r));
        const sr = Math.abs(Math.sin(r));
        return {
            w: Math.ceil(cr * tw + sr * th),
            h: Math.ceil(sr * tw + cr * th)
        };
    }

    function buildTextLabelIcon(marker) {
        const text = marker._textContent || '';
        const color = marker._textColor || TEXT_LABEL_COLOR_DEFAULT;
        const fontBase = marker._textFontSize ?? TEXT_LABEL_FONT_SIZE_DEFAULT;
        const fontSize = Math.max(8, Math.round(fontBase * getMapViewPixelScale()));
        const rot = marker._textRotationDeg || 0;
        const { w: boxW, h: boxH } = textLabelIconBoxPx(text, fontSize, rot);
        const ax = boxW / 2;
        const ay = boxH / 2;
        return L.divIcon({
            className: 'map-text-label',
            html: `<div class="map-text-label-frame" style="width:${boxW}px;height:${boxH}px;display:flex;align-items:center;justify-content:center;box-sizing:border-box;transform:rotate(${rot}deg);transform-origin:center center;">
                <span class="map-text-label-inner" dir="auto" style="color:${color} !important;font-size:${fontSize}px;">${escapeHtml(text)}</span>
            </div>`,
            iconSize: [boxW, boxH],
            iconAnchor: [ax, ay]
        });
    }

    function buildTextLabelPopupContent(marker) {
        const color = marker._textColor || TEXT_LABEL_COLOR_DEFAULT;
        const fontSize = marker._textFontSize ?? TEXT_LABEL_FONT_SIZE_DEFAULT;
        const colorBtns = TEXT_LABEL_COLORS.map(c => {
            const isActive = (c.color || '').toLowerCase() === (color || '').toLowerCase();
            return `<button type="button" class="text-label-color-btn ${isActive ? 'active' : ''}" data-color="${c.color}" title="${c.label}" style="background:${c.color};border:2px solid ${isActive ? '#fff' : 'transparent'};width:24px;height:24px;border-radius:4px;cursor:pointer;"></button>`;
        }).join('');
        const latlng = marker.getLatLng?.();
        const coordBlock = latlng ? `<div style="margin:6px 0;padding:6px;background:#f8fafc;border-radius:4px;text-align:left;"><label style="font-size:0.7rem;color:#6b7280;">Location: ${coordInputHtml('text-label-coord-input', latlng.lat, latlng.lng, '', 'width:100%;max-width:200px;padding:4px 6px;font-size:0.75rem;border:1px solid #cbd5e1;border-radius:4px;')}</label></div>` : '';
        return `
            <div class="text-label-popup">
                <div class="map-popup-header-bar">${mapPopupCloseButtonHtml()}</div>
                <b>${typeof t === 'function' ? t('text-label') : 'Text Label'}</b>
                ${coordBlock}
                <div class="text-label-controls">
                    <div style="margin:8px 0;">
                        <span style="font-size:0.75rem;color:#6b7280;">${typeof t === 'function' ? t('color') : 'Color'}:</span>
                        <div style="display:flex;gap:6px;margin-top:4px;">${colorBtns}</div>
                    </div>
                    <div style="margin:8px 0;">
                        <span style="font-size:0.75rem;color:#6b7280;">${typeof t === 'function' ? t('size') : 'Size'}:</span>
                        <div style="display:flex;align-items:center;gap:6px;margin-top:4px;">
                            <button type="button" class="text-label-size-btn" data-dir="-1" ${fontSize <= TEXT_LABEL_FONT_SIZE_MIN ? 'disabled' : ''} style="cursor:pointer;width:28px;height:28px;font-size:18px;line-height:1;">−</button>
                            <input type="number" class="text-label-size-input" value="${fontSize}" min="${TEXT_LABEL_FONT_SIZE_MIN}" max="${TEXT_LABEL_FONT_SIZE_MAX}" style="width:52px;padding:4px;text-align:center;font-size:0.85rem;">
                            <button type="button" class="text-label-size-btn" data-dir="1" ${fontSize >= TEXT_LABEL_FONT_SIZE_MAX ? 'disabled' : ''} style="cursor:pointer;width:28px;height:28px;font-size:18px;line-height:1;">+</button>
                        </div>
                    </div>
                </div>
                ${getDrawingRotateControlsHtml()}
                <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;">
                    <button class="edit-text-btn" style="margin-right:6px;cursor:pointer;">${typeof t === 'function' ? t('edit') : 'Edit'}</button>
                    <button type="button" class="duplicate-text-label-btn" style="margin-right:6px;cursor:pointer;">${typeof t === 'function' ? t('duplicate') : 'Duplicate'}</button>
                    <button class="remove-btn" style="color:red;cursor:pointer;">${typeof t === 'function' ? t('remove') : 'Remove'}</button>
                </div>
            </div>
        `;
    }

    function bindTextLabelPopupHandlers(marker) {
        marker.setPopupContent(buildTextLabelPopupContent(marker));
        const popup = marker.getPopup();
        const content = popup.getElement();
        if (!content) return;
        bindMapPopupCloseButton(content, marker);
        content.querySelector('.remove-btn')?.addEventListener('click', () => removeFromLayer(marker));
        content.querySelector('.duplicate-text-label-btn')?.addEventListener('click', () => duplicateTextLabelMarker(marker));
        const textCoordInput = content.querySelector('.text-label-coord-input');
        bindCoordEditorEvents(textCoordInput, () => {
            const p = parseCoordInputElement(textCoordInput);
            if (p) {
                marker.setLatLng(L.latLng(p.lat, p.lng));
                bindTextLabelPopupHandlers(marker);
                scheduleSaveToStorage();
            }
        });
        content.querySelector('.edit-text-btn')?.addEventListener('click', async () => {
            const newText = await customPrompt('Edit text:', marker._textContent);
                    if (newText != null && newText.trim() !== '') {
                        marker._textContent = newText.trim();
                        marker.setIcon(buildTextLabelIcon(marker));
                        bindTextLabelPopupHandlers(marker);
                        scheduleSaveToStorage();
                    }
                });
        content.querySelectorAll('.text-label-color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                marker._textColor = btn.dataset.color;
                marker.setIcon(buildTextLabelIcon(marker));
                bindTextLabelPopupHandlers(marker);
                scheduleSaveToStorage();
            });
        });
        content.querySelectorAll('.text-label-size-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                const dir = parseInt(btn.dataset.dir, 10);
                let sz = (marker._textFontSize ?? TEXT_LABEL_FONT_SIZE_DEFAULT) + dir;
                sz = Math.max(TEXT_LABEL_FONT_SIZE_MIN, Math.min(TEXT_LABEL_FONT_SIZE_MAX, sz));
                marker._textFontSize = sz;
                marker.setIcon(buildTextLabelIcon(marker));
                bindTextLabelPopupHandlers(marker);
                scheduleSaveToStorage();
            });
        });
        const sizeInput = content.querySelector('.text-label-size-input');
        if (sizeInput) {
            sizeInput.addEventListener('change', () => {
                let sz = parseInt(sizeInput.value, 10);
                if (!isNaN(sz)) {
                    sz = Math.max(TEXT_LABEL_FONT_SIZE_MIN, Math.min(TEXT_LABEL_FONT_SIZE_MAX, sz));
                    marker._textFontSize = sz;
                    marker.setIcon(buildTextLabelIcon(marker));
                    bindTextLabelPopupHandlers(marker);
                    scheduleSaveToStorage();
                }
            });
            sizeInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') sizeInput.dispatchEvent(new Event('change'));
            });
        }
        bindDrawingRotateControls(content, (delta) => {
            marker._textRotationDeg = normalizeBearingDeg((marker._textRotationDeg || 0) + delta);
            marker.setIcon(buildTextLabelIcon(marker));
            marker.setPopupContent(buildTextLabelPopupContent(marker));
            bindTextLabelPopupHandlers(marker);
            scheduleSaveToStorage();
        });
    }

    const textManager = document.getElementById('text-manager');

    function switchSidebarForMode(mode) {
        if (mode === 'line') {
            symbolManager.style.display = 'none';
            lineManager.style.display = 'block';
            if (textManager) textManager.style.display = 'none';
        } else if (mode === 'eraser') {
            symbolManager.style.display = 'none';
            lineManager.style.display = 'none';
            if (textManager) textManager.style.display = 'none';
        } else if (mode === 'text') {
            symbolManager.style.display = 'none';
            lineManager.style.display = 'none';
            if (textManager) textManager.style.display = 'block';
        } else {
            symbolManager.style.display = 'block';
            lineManager.style.display = 'none';
            if (textManager) textManager.style.display = 'none';
        }
    }

    function getTextColor() {
        const active = textManager?.querySelector('.text-color-btn.active');
        return active ? active.dataset.color : TEXT_LABEL_COLOR_DEFAULT;
    }

    function getTextFontSize() {
        const inp = document.getElementById('text-label-default-size');
        if (!inp) return TEXT_LABEL_FONT_SIZE_DEFAULT;
        let sz = parseInt(inp.value, 10);
        if (isNaN(sz)) return TEXT_LABEL_FONT_SIZE_DEFAULT;
        return Math.max(TEXT_LABEL_FONT_SIZE_MIN, Math.min(TEXT_LABEL_FONT_SIZE_MAX, sz));
    }

    const textLabelModal = document.getElementById('text-label-modal');
    const textLabelInput = document.getElementById('text-label-input');
    const textLabelOkBtn = document.getElementById('text-label-ok-btn');
    const textLabelCancelBtn = document.getElementById('text-label-cancel-btn');

    function placeTextLabelAt(latlng, text) {
        if (!text || !text.trim()) return;
        const color = getTextColor();
        const marker = L.marker(latlng, { icon: null, draggable: true });
        marker._isTextLabel = true;
        marker._textContent = text.trim();
        marker._textColor = color;
        marker._textFontSize = getTextFontSize();
        marker.setIcon(buildTextLabelIcon(marker));
        marker.bindPopup(buildTextLabelPopupContent(marker));
        marker.on('popupopen', () => bindTextLabelPopupHandlers(marker));
        addToActiveLayer(marker);
        if (instructionText) instructionText.innerText = t('inst-text-placed');
    }

    function duplicateTextLabelMarker(sourceMarker) {
        if (!sourceMarker || !sourceMarker._isTextLabel) return;
        const off = 0.015;
        const ll = sourceMarker.getLatLng();
        const newLl = L.latLng(ll.lat + off, ll.lng + off);
        const m = L.marker(newLl, { draggable: true });
        m._isTextLabel = true;
        m._textContent = sourceMarker._textContent;
        m._textColor = sourceMarker._textColor || TEXT_LABEL_COLOR_DEFAULT;
        m._textFontSize = sourceMarker._textFontSize ?? TEXT_LABEL_FONT_SIZE_DEFAULT;
        m._textRotationDeg = sourceMarker._textRotationDeg || 0;
        m.setIcon(buildTextLabelIcon(m));
        m.bindPopup(buildTextLabelPopupContent(m));
        m.on('popupopen', () => bindTextLabelPopupHandlers(m));
        addToActiveLayer(m);
        try { sourceMarker.closePopup(); } catch (e) { /* ignore */ }
        m.openPopup();
        scheduleSaveToStorage();
        if (layersListEl) renderLayersList();
    }

    function showTextLabelModal(latlng) {
        if (!textLabelModal || !textLabelInput) return;
        textLabelInput.value = '';
        textLabelModal.classList.remove('hidden');
        textLabelModal.setAttribute('aria-hidden', 'false');
        textLabelInput.focus();

        const confirm = (text) => {
            textLabelModal.classList.add('hidden');
            textLabelModal.setAttribute('aria-hidden', 'true');
            if (text && text.trim()) placeTextLabelAt(latlng, text);
        };

        const cancel = () => {
            textLabelModal.classList.add('hidden');
            textLabelModal.setAttribute('aria-hidden', 'true');
        };

        textLabelModal.querySelectorAll('.text-label-preset-btn').forEach(btn => {
            btn.onclick = () => {
                const val = String(btn.dataset.value || '');
                textLabelInput.value = `${textLabelInput.value || ''}${val}`;
                textLabelInput.focus();
            };
        });

        textLabelOkBtn.onclick = () => confirm(textLabelInput.value);
        textLabelCancelBtn.onclick = cancel;
        textLabelModal.querySelector('.text-label-modal-cancel').onclick = cancel;

        textLabelInput.onkeydown = (e) => {
            if (e.key === 'Enter') confirm(textLabelInput.value);
            if (e.key === 'Escape') cancel();
        };
    }
    const CIRCLE_X_SNAP_PX = 20;

    function getCircleXSnapPx() {
        const pxScale = getMapViewPixelScale();
        return Math.max(CIRCLE_X_SNAP_PX, (32 * pxScale) / 2 + 6);
    }

    function frontlineCoversAllCircles() {
        const centers = getCircleXCenters();
        if (centers.length === 0) return false;
        const segments = getScallopedSegments();
        if (segments.length === 0) return false;

        // Collect all segment endpoints
        const endpoints = [];
        segments.forEach(seg => {
            const d = seg._tmgData;
            if (d?.latlng1) endpoints.push(d.latlng1);
            if (d?.latlng2) endpoints.push(d.latlng2);
        });
        if (endpoints.length === 0) return false;

        const snapPx = getCircleXSnapPx() * 1.5; // generous threshold
        for (const center of centers) {
            const cp = map.latLngToLayerPoint(center);
            let covered = false;
            for (const ep of endpoints) {
                const epp = map.latLngToLayerPoint(ep);
                if (Math.hypot(epp.x - cp.x, epp.y - cp.y) <= snapPx) {
                    covered = true;
                    break;
                }
            }
            if (!covered) return false;
        }
        return true;
    }

    function onScallopedFrontlineCreated() {
        // Only auto-show flank panel when line passes through ALL circles.
        // Otherwise keep drawing mode active so user can extend the line.
        if (!frontlineCoversAllCircles()) {
            return;
        }
        // Restore circle-X interactivity now that frontline drawing is done
        setScallopedDrawingIntercept(false);
        if (typeof window.showAutoFlankControls === 'function') {
            window.showAutoFlankControls();
        }
    }

    function getCircleXCenters() {
        const centers = [];
        const sessionId = window.freeDrawSignatureSessionId;
        for (const layer of layers) {
            if (!layer.visible) continue;
            for (const el of layer.elements) {
                const isCircleX = (el instanceof L.Marker && el._tmgData?.typeId === 'circle-x') ||
                    (el instanceof L.LayerGroup && el._tmgData?.typeId === 'circle-x');
                if (!isCircleX) continue;

                const elSession = el._tmgData?.sessionId;
                if (sessionId && elSession && elSession !== sessionId) continue;

                if (el instanceof L.Marker && el._tmgData?.typeId === 'circle-x') {
                    // Obstacle snap is handled at placement/drag time (see dragend handler).
                    // Avoid expensive pointInObstaclePolygons calls on every query.
                    centers.push(el.getLatLng());
                } else if (el instanceof L.LayerGroup && el._tmgData?.typeId === 'circle-x') {
                    if (el._tmgData?.points?.length) {
                        el._tmgData.points.forEach(p => centers.push(L.latLng(p)));
                    }
                }
            }
        }
        return centers;
    }

    const CIRCLE_EDGE_OFFSET_KM = 0.05;
    // Keyed by sessionId so each drawing session tracks its own last-drawn mode independently.
    const lastAutoFlankModeBySession = {};
    let autoFlankDrawInFlight = false;

    function nudgePointAtCircleEdge(point, nextPoint) {
        if (!point || !nextPoint) return point;
        const bear = bearingDegrees(point, nextPoint);
        return latLngAtBearing(point, CIRCLE_EDGE_OFFSET_KM, bear);
    }

    function findClosestCircleXCenter(latlng, maxPx = CIRCLE_X_SNAP_PX) {
        if (!latlng || !map) return null;
        const centers = getCircleXCenters();
        if (centers.length === 0) return null;
        let best = { dist: Infinity, center: null };
        const p = map.latLngToLayerPoint(latlng);
        for (const c of centers) {
            const cp = map.latLngToLayerPoint(c);
            const d = Math.hypot(cp.x - p.x, cp.y - p.y);
            if (d < best.dist) {
                best = { dist: d, center: c };
            }
        }
        return (best.center && best.dist <= maxPx) ? best.center : null;
    }

    /** Hollow dashed arrowhead + CATK (right of viewBox); left open so map polyline shows through shaft. */
    function buildCatkVectorHeadIconHtml(color, strokeWidth, length, h, angleDeg) {
        const sw = Math.max(1.2, Math.min(4.5, strokeWidth * 0.42));
        const dash = '5,5';
        const svg = `<svg viewBox="0 0 100 40" preserveAspectRatio="none" style="width:100%;height:100%;display:block;overflow:visible;">
            <text x="30" y="21" text-anchor="middle" style="fill:${color};font-size:10px;font-weight:700;font-family:Arial,sans-serif;paint-order:stroke;stroke:#fff;stroke-width:0.4px;">CATK</text>
            <path d="M52,9 L76,9 L76,3 L100,20 L76,37 L76,31 L52,31" fill="none" stroke="${color}" stroke-width="${sw}" stroke-dasharray="${dash}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
            <path d="M52,13 L72,13 L72,8 L94,20 L72,32 L72,27 L52,27" fill="none" stroke="${color}" stroke-width="${sw}" stroke-dasharray="${dash}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
        </svg>`;
        return `<div style="width:${length}px;height:${h}px;transform:rotate(${angleDeg}deg);">${svg}</div>`;
    }

    function getTmgIconOptions(latlng1, latlng2, typeId, color, useBodyOnly, styleOverrides) {
        const def = TACTICAL_GRAPHICS.find(d => d.id === typeId);
        if (!def) return null;
        const pxScale = getMapViewPixelScale();
        const filled = styleOverrides?.filled !== undefined ? styleOverrides.filled : def.filled;
        const dashed = styleOverrides?.dashed !== undefined ? styleOverrides.dashed : (def.dashed || false);
        const baseStroke = styleOverrides?.strokeWidth ?? def.strokeWidth ?? 4;
        const strokeWidth = Math.max(0.5, Math.min(24, baseStroke * pxScale));
        let pathToUse = (useBodyOnly && def.bodyPath) ? def.bodyPath : def.path;
        const p1 = map.latLngToLayerPoint(latlng1);
        const p2 = map.latLngToLayerPoint(latlng2);
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        let length = Math.sqrt(dx * dx + dy * dy) || 1;
        // Minimum footprint scales with zoom so graphics don’t dominate the map when zoomed out
        if (!def.pointSymbol && !useBodyOnly && typeId !== 'scalloped') length = Math.max(length, 48 * pxScale);
        // Front line border: wave count must follow segment length (path rebuilt here, not stretched)
        if (typeId === 'scalloped') {
            const numWaves = Math.max(3, Math.round(length / 28));
            pathToUse = buildScallopedPath(numWaves);
        }
        const pathsToUse = Array.isArray(pathToUse) ? pathToUse : [pathToUse];
        const normPaths = pathsToUse.map(p => (typeof p === 'string' ? { d: p } : p)).filter(p => p && p.d);
        // Only hide stroke when filled AND the graphic was designed for filling (has closed/fillable path).
        // Line-only graphics (axis-support, delay, etc.) have open paths - setting stroke to 0 makes them disappear.
        const strokeW = (filled && def.filled) ? 0 : strokeWidth;
        const textSizePx = (def.textSize ?? 12) * pxScale;
        const textSvg = def.text
            ? `<text x="${def.textX ?? 50}" y="${def.textY ?? 20}" text-anchor="middle" dominant-baseline="middle" style="fill:${color};font-size:${textSizePx}px;font-weight:${def.textWeight ?? 600};font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;paint-order:stroke fill;stroke:#fff;stroke-width:${Math.max(0.5, 1.5 * pxScale)};stroke-linejoin:round;">${def.text}</text>`
            : '';
        if (def.pointSymbol) {
            const size = Math.max((def.pointBaseSize ?? 48) * pxScale, length);
            if (def.svgFile) {
                return {
                    className: 'tmg-icon',
                    html: `<div style="width:${size}px;height:${size}px;"><img src="${def.svgFile}" alt="" style="width:100%;height:100%;object-fit:contain;image-rendering:crisp-edges;image-rendering:-webkit-optimize-contrast;"></div>`,
                    iconSize: [size, size],
                    iconAnchor: [size / 2, size / 2],
                };
            }
            const vb = '0 0 40 40';
            const defaultStrokeDash = dashed ? 'stroke-dasharray: 3,4;stroke-linecap:round;stroke-linejoin:round;' : '';
            const pathSvgs = normPaths.map(p => {
                const pDashed = p.dashed ?? dashed;
                const pStrokeDash = pDashed ? 'stroke-dasharray: 3,4;stroke-linecap:round;stroke-linejoin:round;' : 'stroke-linecap:round;stroke-linejoin:round;';
                const pStrokeW = (filled && def.filled) ? 0 : (p.strokeWidth ?? strokeWidth);
                return `<path d="${p.d}" style="fill:${filled ? color : 'none'};stroke:${color};stroke-width:${pStrokeW};vector-effect:non-scaling-stroke;${pStrokeDash}"/>`;
            }).join('');
            const svg = `<svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block;">
                ${pathSvgs}
                ${textSvg}
            </svg>`;
            return {
                className: 'tmg-icon',
                html: `<div style="width:${size}px;height:${size}px;">${svg}</div>`,
                iconSize: [size, size],
                iconAnchor: [size / 2, size / 2],
            };
        }
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        if (def.catkVectorHead && styleOverrides?.catkHeadSolo) {
            const h = Math.max(32 * pxScale, Math.round(20 + strokeWidth * 5));
            return {
                className: 'tmg-icon',
                html: buildCatkVectorHeadIconHtml(color, strokeWidth, length, h, angle),
                iconSize: [length, h],
                iconAnchor: [length / 2, h / 2],
            };
        }
        if (def.svgFile) {
            const h = Math.max(32 * pxScale, Math.round(20 + strokeWidth * 5));
            return {
                className: 'tmg-icon',
                html: `<div style="width:${length}px;height:${h}px;transform:rotate(${angle}deg);"><img src="${def.svgFile}" alt="" style="width:100%;height:100%;object-fit:contain;image-rendering:crisp-edges;image-rendering:-webkit-optimize-contrast;"></div>`,
                iconSize: [length, h],
                iconAnchor: [length / 2, h / 2],
            };
        }
        // Use rounded, shorter dashes to match MIL-STD "CATK" look
        const pathSvgs = normPaths.map(p => {
            const pDashed = p.dashed ?? dashed;
            const pStrokeDash = pDashed ? 'stroke-dasharray: 3,4;stroke-linecap:round;stroke-linejoin:round;' : 'stroke-linecap:round;stroke-linejoin:round;';
            const pStrokeW = (filled && def.filled) ? 0 : (p.strokeWidth ?? strokeWidth);
            // Invisible fat hit-area path for easier clicking (only the shape, not bounding box)
            return `<path d="${p.d}" style="fill:${filled ? color : 'none'};stroke:${color};stroke-width:${pStrokeW};vector-effect:non-scaling-stroke;${pStrokeDash}"/>`;
        }).join('');
        const svg = `<svg viewBox="0 0 100 40" preserveAspectRatio="none" style="width:100%;height:100%;display:block;">
            ${pathSvgs}
            ${textSvg}
        </svg>`;
        const h = Math.max(32 * pxScale, Math.round(20 + strokeWidth * 5));
        return {
            className: 'tmg-icon',
            html: `<div style="width:${length}px;height:${h}px;transform:rotate(${angle}deg);">${svg}</div>`,
            iconSize: [length, h],
            iconAnchor: [length / 2, h / 2],
        };
    }

    /** Popup is reparented to #popup-anchor on map `popupopen`; wait for DOM before querying/binding (see CATK tail popups). */
    function getTmgPopupDomRoot(layer) {
        const pu = layer.getPopup?.();
        if (!pu) return null;
        const outer = pu.getElement?.() || pu._container;
        if (!outer) return null;
        return outer.querySelector('.leaflet-popup-content') || outer;
    }

    function scheduleTmgPopupBind(fn) {
        requestAnimationFrame(() => { requestAnimationFrame(fn); });
    }

    function bindSingleTmgPopupHandlers(marker, buildSingleTmgPopupContent, def) {
        const content = getTmgPopupDomRoot(marker);
        if (!content) return;
        L.DomEvent.disableClickPropagation(content);
        bindMapPopupCloseButton(content, marker);
        bindFeatureDisplayNameInput(content, '.tmg-display-name-input', (v) => {
            const d = marker._tmgData;
            if (!d) return;
            if (v) d.displayName = v;
            else delete d.displayName;
        });
        const removeBtn = content.querySelector('.remove-tmg-btn');
        if (removeBtn) {
            L.DomEvent.on(removeBtn, 'click', (e) => {
                L.DomEvent.stopPropagation(e);
                e.preventDefault();
                removeFromLayer(marker);
            });
        }
        const dupBtn = content.querySelector('.duplicate-tmg-btn');
        if (dupBtn) {
            L.DomEvent.on(dupBtn, 'click', (e) => {
                L.DomEvent.stopPropagation(e);
                e.preventDefault();
                duplicateTmgSingle(marker);
            });
        }
        content.querySelector('.turn-tmg-btn')?.addEventListener('click', () => {
            reorientingTmgMarker = marker;
            marker.closePopup();
            if (instructionText) instructionText.innerText = t('inst-turn-graphic');
        });
        content.querySelector('.single-tmg-add-point-btn')?.addEventListener('click', (e) => {
            L.DomEvent.stopPropagation(e);
            e.preventDefault();
            if (marker._tmgData?.typeId !== 'scalloped') return;
            const group = replaceSingleTmgWithSegmentGroup(marker);
            if (!group) return;
            addingPointTmgGroup = group;
            group.closePopup();
            if (instructionText) instructionText.innerText = t('inst-add-point-done');
            updateLineDrawingControls?.();
        });
        content.querySelectorAll('.tmg-coord-input').forEach(inp => {
            const applyCoord = () => {
                const pt = inp.dataset.pt;
                const p = parseCoordInputElement(inp);
                if (!p || !pt) return;
                const d = marker._tmgData;
                if (!d) return;
                const newLl = L.latLng(p.lat, p.lng);
                if (pt === '1') d.latlng1 = newLl;
                else if (pt === '2') d.latlng2 = newLl;
                marker.setLatLng(tmgMidpoint(d.latlng1, d.latlng2));
                updateTmgLayer(marker);
                refreshTmgSelectionBox(marker, marker._layerId);
                marker.setPopupContent(buildSingleTmgPopupContent());
                bindSingleTmgPopupHandlers(marker, buildSingleTmgPopupContent, def);
                scheduleSaveToStorage();
            };
            bindCoordEditorEvents(inp, applyCoord);
        });
        content.querySelectorAll('.tmg-size-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const d = marker._tmgData;
                if (!d) return;
                const factor = btn.dataset.size === 'bigger' ? TMG_SCALE_FACTOR : 1 / TMG_SCALE_FACTOR;
                d.latlng2 = L.latLng(
                    d.latlng1.lat + (d.latlng2.lat - d.latlng1.lat) * factor,
                    d.latlng1.lng + (d.latlng2.lng - d.latlng1.lng) * factor
                );
                marker.setLatLng(tmgMidpoint(d.latlng1, d.latlng2));
                updateTmgLayer(marker);
                refreshTmgSelectionBox(marker, marker._layerId);
            });
        });
        content.querySelectorAll('.tmg-style-btn').forEach(btn => {
            L.DomEvent.on(btn, 'click', (e) => {
                L.DomEvent.stopPropagation(e);
                e.preventDefault();
                const dashed = btn.dataset.dashed === 'true';
                applyTmgStyle(marker, { dashed });
                content.querySelectorAll('.tmg-style-btn').forEach(b => b.classList.toggle('active', b.dataset.dashed === String(dashed)));
                scheduleSaveToStorage();
            });
        });
        content.querySelectorAll('.tmg-fill-btn').forEach(btn => {
            L.DomEvent.on(btn, 'click', (e) => {
                L.DomEvent.stopPropagation(e);
                e.preventDefault();
                const filled = btn.dataset.filled === 'true';
                applyTmgStyle(marker, { filled });
                content.querySelectorAll('.tmg-fill-btn').forEach(b => b.classList.toggle('active', b.dataset.filled === String(filled)));
                scheduleSaveToStorage();
            });
        });
        content.querySelectorAll('.tmg-color-btn').forEach(btn => {
            L.DomEvent.on(btn, 'click', (e) => {
                L.DomEvent.stopPropagation(e);
                e.preventDefault();
                const color = btn.dataset.color;
                applyTmgStyle(marker, { color });
                content.querySelectorAll('.tmg-color-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.color === color);
                    b.style.borderColor = b.dataset.color === color ? '#fff' : 'transparent';
                });
                scheduleSaveToStorage();
            });
        });
        const syncSingleWidth = () => {
            const inp = content.querySelector('.tmg-width-input');
            const slider = content.querySelector('.tmg-width-slider');
            if (!inp) return;
            const v = parseFloat(inp.value);
            const w = (v >= 1 && v <= 30) ? v : 4;
            inp.value = w;
            if (slider) slider.value = w;
            applyTmgStyle(marker, { strokeWidth: w });
        };
        content.querySelector('.tmg-width-input')?.addEventListener('input', syncSingleWidth);
        content.querySelector('.tmg-width-slider')?.addEventListener('input', () => {
            const inp = content.querySelector('.tmg-width-input');
            const sl = content.querySelector('.tmg-width-slider');
            if (sl && inp) { inp.value = sl.value; syncSingleWidth(); }
        });
        content.querySelector('.tmg-length-input')?.addEventListener('input', () => {
            const d = marker._tmgData;
            if (!d || !d.latlng1 || !d.latlng2) return;
            const lenInp = content.querySelector('.tmg-length-input');
            const lenKm = parseFloat(lenInp?.value || 0.5);
            if (lenKm < 0.1 || lenKm > 50) return;
            const p1 = map.latLngToLayerPoint(d.latlng1);
            const p2 = map.latLngToLayerPoint(d.latlng2);
            const bearing = (Math.atan2(p2.x - p1.x, p1.y - p2.y) * 180 / Math.PI + 360) % 360;
            d.latlng2 = latLngAtBearing(d.latlng1, lenKm, bearing);
            marker.setLatLng(tmgMidpoint(d.latlng1, d.latlng2));
            updateTmgLayer(marker);
            refreshTmgSelectionBox(marker, marker._layerId);
        });
        bindDrawingRotateControls(content, (delta) => {
            rotateSingleTmgMarkerByDegrees(marker, delta);
            marker.setPopupContent(buildSingleTmgPopupContent());
            bindSingleTmgPopupHandlers(marker, buildSingleTmgPopupContent, def);
        });
    }

    const CATK_ARROW_DEFAULT_DIRECTION_DEG = 90;
    const CATK_ARROW_DEFAULT_SCALE_KM = 0.35;
    const CATK_ARROW_MIN_BODY_WIDTH_KM = 0.04;
    const CATK_ARROW_MIN_HEAD_WIDTH_KM = 0.06;
    const CATK_ARROW_MIN_HEAD_LENGTH_KM = 0.06;
    const CATK_ARROW_MIN_TAIL_LENGTH_KM = 0.06;
    const CATK_ARROW_BODY_WIDTH_FACTOR = 0.22;
    const CATK_ARROW_HEAD_WIDTH_FACTOR = 0.4;
    const CATK_ARROW_HEAD_LENGTH_FACTOR = 0.28;
    const CATK_ARROW_DEFAULT_TAIL_FACTOR = 0.6;
    const CATK_ARROW_IDLE_SCALE_PX = 96;
    const CATK_ARROW_MIN_PLACEMENT_SCALE_PX = 8;
    const CATK_ARROW_MIN_BODY_WIDTH_PX = 12;
    const CATK_ARROW_MIN_HEAD_WIDTH_PX = 20;
    const CATK_ARROW_MIN_HEAD_LENGTH_PX = 22;
    const CATK_ARROW_MIN_TAIL_LENGTH_PX = 28;
    const CATK_NECK_HANDLE_STABILITY_DRAG_PX = 1.5;
    const CATK_TIP_DIRECTION_DEADZONE_PX = 12;
    const CATK_TIP_PHASE_MIN_SCALE_PX = 26;

    function isParametricCatkPlacementType(typeId) {
        return isCounterattackStyleMultiPointType(typeId);
    }

    function catkClampPositiveKm(value, minValue, fallbackValue) {
        const raw = Number(value);
        if (isFinite(raw) && raw >= minValue) return raw;
        return Math.max(minValue, Number(fallbackValue) || minValue);
    }

    function normalizeCatkArrowParams(params) {
        const tip = params?.tip ? L.latLng(params.tip.lat, params.tip.lng) : null;
        if (!tip) return null;
        const bodyWidthKm = catkClampPositiveKm(params?.bodyWidthKm, CATK_ARROW_MIN_BODY_WIDTH_KM, CATK_ARROW_DEFAULT_SCALE_KM * CATK_ARROW_BODY_WIDTH_FACTOR);
        const neckBaseKm = Math.max(CATK_ARROW_MIN_HEAD_LENGTH_KM, Number(params?.neckOffsetKm ?? params?.headLengthKm) || 0);
        const headLengthKm = catkClampPositiveKm(params?.headLengthKm, CATK_ARROW_MIN_HEAD_LENGTH_KM, neckBaseKm);
        const neckOffsetKm = catkClampPositiveKm(params?.neckOffsetKm, CATK_ARROW_MIN_HEAD_LENGTH_KM, Math.max(neckBaseKm, headLengthKm));
        const headWidthKm = catkClampPositiveKm(params?.headWidthKm, Math.max(CATK_ARROW_MIN_HEAD_WIDTH_KM, bodyWidthKm), Math.max(bodyWidthKm * 1.7, CATK_ARROW_DEFAULT_SCALE_KM * CATK_ARROW_HEAD_WIDTH_FACTOR));
        const tailLengthKm = catkClampPositiveKm(params?.tailLengthKm, CATK_ARROW_MIN_TAIL_LENGTH_KM, CATK_ARROW_DEFAULT_SCALE_KM * CATK_ARROW_DEFAULT_TAIL_FACTOR);
        const directionDeg = normalizeBearingDeg(Number.isFinite(Number(params?.directionDeg)) ? Number(params.directionDeg) : CATK_ARROW_DEFAULT_DIRECTION_DEG);
        return {
            tip,
            directionDeg,
            bodyWidthKm,
            headWidthKm,
            headLengthKm,
            neckOffsetKm,
            tailLengthKm
        };
    }

    /**
     * The existing CATK/attack group still stores canonical centerline points for
     * hit testing and serialization, but those points are derived from the control
     * parameters below instead of being edited as arbitrary bends.
     */
    function catkArrowPointsFromParams(params) {
        const p = normalizeCatkArrowParams(params);
        if (!p) return [];
        const neckCenter = latLngAtBearing(p.tip, p.neckOffsetKm, normalizeBearingDeg(p.directionDeg + 180));
        const tailCenter = latLngAtBearing(neckCenter, p.tailLengthKm, normalizeBearingDeg(p.directionDeg + 180));
        return [p.tip, neckCenter, tailCenter];
    }

    function catkApplyArrowParamsToData(data) {
        if (!data) return [];
        const params = normalizeCatkArrowParams(data.arrowParams);
        if (!params) {
            data.points = [];
            return data.points;
        }
        data.arrowParams = params;
        data.points = catkArrowPointsFromParams(params);
        data.isParametricArrow = true;
        data.catkAutoJunction = false;
        return data.points;
    }

    function catkScaleKmFromTipCursor(tip, cursor) {
        if (!tip || !cursor) return CATK_ARROW_DEFAULT_SCALE_KM;
        return Math.max(CATK_ARROW_DEFAULT_SCALE_KM, haversineDistance(tip.lat, tip.lng, cursor.lat, cursor.lng) / 1000);
    }

    function catkPixelsToKm(origin, bearingDeg, pixels, fallbackKm) {
        if (!origin || !map) return Math.max(0.0001, fallbackKm || CATK_ARROW_DEFAULT_SCALE_KM);
        return Math.max(0.0001, pixels / catkPxPerKmAtLatLng(origin, bearingDeg));
    }

    function catkTipCursorPixelDistance(tip, cursor) {
        if (!tip || !cursor || !map) return 0;
        const tipPx = map.latLngToLayerPoint(tip);
        const cursorPx = map.latLngToLayerPoint(cursor);
        return Math.hypot(cursorPx.x - tipPx.x, cursorPx.y - tipPx.y);
    }

    function catkScalePxFromTipCursor(tip, cursor) {
        if (!tip || !cursor || !map) return CATK_ARROW_IDLE_SCALE_PX;
        return Math.max(CATK_ARROW_MIN_PLACEMENT_SCALE_PX, catkTipCursorPixelDistance(tip, cursor));
    }

    /**
     * First control phase after the tip click:
     * cursor direction sets the arrow bearing, and cursor distance sets the
     * initial head/body proportions shown inside the dashed oriented rectangle.
     * Before the first click, the same helper returns a fixed screen-size preview
     * so the symbol stays visible even at wide-area zoom levels.
     */
    function catkArrowParamsFromTipCursor(tip, cursor, existingParams, minScalePxOverride = null) {
        if (!tip) return null;
        const cursorDistPx = cursor ? catkTipCursorPixelDistance(tip, cursor) : 0;
        const directionDeg = cursor && cursorDistPx > CATK_TIP_DIRECTION_DEADZONE_PX
            ? bearingDegrees(cursor, tip)
            : (existingParams?.directionDeg ?? CATK_ARROW_DEFAULT_DIRECTION_DEG);
        if (!map) {
            const scaleKm = catkScaleKmFromTipCursor(tip, cursor);
            const bodyWidthKm = Math.max(CATK_ARROW_MIN_BODY_WIDTH_KM, scaleKm * CATK_ARROW_BODY_WIDTH_FACTOR);
            const headWidthKm = Math.max(bodyWidthKm * 1.6, scaleKm * CATK_ARROW_HEAD_WIDTH_FACTOR);
            const headLengthKm = Math.max(CATK_ARROW_MIN_HEAD_LENGTH_KM, scaleKm * CATK_ARROW_HEAD_LENGTH_FACTOR);
            return normalizeCatkArrowParams({
                tip,
                directionDeg,
                bodyWidthKm,
                headWidthKm,
                headLengthKm,
                neckOffsetKm: headLengthKm,
                tailLengthKm: Math.max(CATK_ARROW_MIN_TAIL_LENGTH_KM, scaleKm * CATK_ARROW_DEFAULT_TAIL_FACTOR)
            });
        }
        const minScalePx = Math.max(
            CATK_ARROW_MIN_PLACEMENT_SCALE_PX,
            Number.isFinite(Number(minScalePxOverride)) ? Number(minScalePxOverride) : CATK_ARROW_MIN_PLACEMENT_SCALE_PX
        );
        const scalePx = cursor
            ? Math.max(minScalePx, catkScalePxFromTipCursor(tip, cursor))
            : Math.max(CATK_ARROW_IDLE_SCALE_PX, minScalePx);
        const bodyWidthPx = Math.max(CATK_ARROW_MIN_BODY_WIDTH_PX, scalePx * CATK_ARROW_BODY_WIDTH_FACTOR);
        const headWidthPx = Math.max(bodyWidthPx * 1.6, CATK_ARROW_MIN_HEAD_WIDTH_PX, scalePx * CATK_ARROW_HEAD_WIDTH_FACTOR);
        const headLengthPx = Math.max(CATK_ARROW_MIN_HEAD_LENGTH_PX, scalePx * CATK_ARROW_HEAD_LENGTH_FACTOR);
        const tailLengthPx = Math.max(CATK_ARROW_MIN_TAIL_LENGTH_PX, scalePx * CATK_ARROW_DEFAULT_TAIL_FACTOR);
        const lateralBearing = normalizeBearingDeg(directionDeg + 90);
        const reverseBearing = normalizeBearingDeg(directionDeg + 180);
        return normalizeCatkArrowParams({
            tip,
            directionDeg,
            bodyWidthKm: Math.max(CATK_ARROW_MIN_BODY_WIDTH_KM, catkPixelsToKm(tip, lateralBearing, bodyWidthPx, CATK_ARROW_DEFAULT_SCALE_KM * CATK_ARROW_BODY_WIDTH_FACTOR)),
            headWidthKm: Math.max(CATK_ARROW_MIN_HEAD_WIDTH_KM, catkPixelsToKm(tip, lateralBearing, headWidthPx, CATK_ARROW_DEFAULT_SCALE_KM * CATK_ARROW_HEAD_WIDTH_FACTOR)),
            headLengthKm: Math.max(CATK_ARROW_MIN_HEAD_LENGTH_KM, catkPixelsToKm(tip, reverseBearing, headLengthPx, CATK_ARROW_DEFAULT_SCALE_KM * CATK_ARROW_HEAD_LENGTH_FACTOR)),
            neckOffsetKm: Math.max(CATK_ARROW_MIN_HEAD_LENGTH_KM, catkPixelsToKm(tip, reverseBearing, headLengthPx, CATK_ARROW_DEFAULT_SCALE_KM * CATK_ARROW_HEAD_LENGTH_FACTOR)),
            tailLengthKm: Math.max(CATK_ARROW_MIN_TAIL_LENGTH_KM, catkPixelsToKm(tip, reverseBearing, tailLengthPx, CATK_ARROW_DEFAULT_SCALE_KM * CATK_ARROW_DEFAULT_TAIL_FACTOR))
        });
    }

    /**
     * Second click in the placement flow:
     * lock the arrow direction/head/body from the provisional rectangle and
     * lock an initial tail length from the clicked cursor position.
     */
    function catkArrowParamsFromTipAndTailCursor(tip, cursor, existingParams, minScalePxOverride = null) {
        const baseParams = catkArrowParamsFromTipCursor(tip, cursor, existingParams, minScalePxOverride);
        if (!baseParams || !cursor) return baseParams;
        return catkArrowParamsWithTailFromCursor(baseParams, cursor);
    }

    function catkDeriveArrowParamsFromLegacyPoints(points, strokeWidth, arrowHeadScale) {
        const pts = (points || []).filter(Boolean);
        if (!pts.length) return null;
        const tip = L.latLng(pts[0].lat, pts[0].lng);
        const hasExplicitNeck = pts.length >= 3;
        const neck = hasExplicitNeck && pts[1] ? L.latLng(pts[1].lat, pts[1].lng) : null;
        const tail = pts[pts.length - 1] ? L.latLng(pts[pts.length - 1].lat, pts[pts.length - 1].lng) : tip;
        const overallKm = Math.max(CATK_ARROW_DEFAULT_SCALE_KM, haversineDistance(tip.lat, tip.lng, tail.lat, tail.lng) / 1000);
        const legacyScale = (typeof arrowHeadScale === 'number' && isFinite(arrowHeadScale)) ? Math.max(0.5, Math.min(2.5, arrowHeadScale)) : 1.0;
        const tipToNeckKm = neck && (neck.lat !== tip.lat || neck.lng !== tip.lng)
            ? haversineDistance(tip.lat, tip.lng, neck.lat, neck.lng) / 1000
            : Math.max(CATK_ARROW_MIN_HEAD_LENGTH_KM, overallKm * CATK_ARROW_HEAD_LENGTH_FACTOR * legacyScale);
        const neckToTailKm = neck && tail && (neck.lat !== tail.lat || neck.lng !== tail.lng)
            ? haversineDistance(neck.lat, neck.lng, tail.lat, tail.lng) / 1000
            : Math.max(CATK_ARROW_MIN_TAIL_LENGTH_KM, overallKm - tipToNeckKm);
        const directionDeg = (neck && (neck.lat !== tip.lat || neck.lng !== tip.lng))
            ? bearingDegrees(neck, tip)
            : ((tail && (tail.lat !== tip.lat || tail.lng !== tip.lng)) ? bearingDegrees(tail, tip) : CATK_ARROW_DEFAULT_DIRECTION_DEG);
        const lengthScaleKm = Math.max(overallKm, tipToNeckKm + neckToTailKm, (strokeWidth || 4) * 0.05);
        return normalizeCatkArrowParams({
            tip,
            directionDeg,
            bodyWidthKm: Math.max(CATK_ARROW_MIN_BODY_WIDTH_KM, lengthScaleKm * CATK_ARROW_BODY_WIDTH_FACTOR),
            headWidthKm: Math.max(CATK_ARROW_MIN_HEAD_WIDTH_KM, lengthScaleKm * CATK_ARROW_HEAD_WIDTH_FACTOR * legacyScale),
            headLengthKm: tipToNeckKm,
            neckOffsetKm: tipToNeckKm,
            tailLengthKm: neckToTailKm
        });
    }

    function catkShiftLockedArrowParamsByOffset(params, dLat, dLng) {
        const p = normalizeCatkArrowParams(params);
        if (!p) return null;
        if (!isFinite(dLat) || !isFinite(dLng)) return p;
        if (Math.abs(dLat) < 1e-14 && Math.abs(dLng) < 1e-14) return p;
        return normalizeCatkArrowParams({
            ...p,
            tip: L.latLng(p.tip.lat + dLat, p.tip.lng + dLng)
        });
    }

    function catkRotateLockedArrowParamsAroundPivot(params, pivot, deltaDeg) {
        const p = normalizeCatkArrowParams(params);
        if (!p || !pivot || !isFinite(deltaDeg) || deltaDeg === 0) return p;
        const rotatedTip = rotateLatLngsAroundPivotClockwise([p.tip], pivot, deltaDeg)[0] || p.tip;
        return normalizeCatkArrowParams({
            ...p,
            tip: rotatedTip,
            directionDeg: normalizeBearingDeg(p.directionDeg + deltaDeg)
        });
    }

    /**
     * Legacy CATK groups keep explicit tail bends in `data.points`, while
     * `lockedArrowParams` keeps the parametric head/body controls.
     * Keep those controls populated and synchronized with tip + first tail anchor.
     */
    function catkEnsureLockedArrowParams(data, opts = {}) {
        if (!data || data.arrowParams) return null;
        const syncTipToPoints = opts.syncTipToPoints !== false;
        const syncTailAnchor = opts.syncTailAnchor !== false;
        let locked = normalizeCatkArrowParams(data.lockedArrowParams);
        if (!locked) {
            locked = catkDeriveArrowParamsFromLegacyPoints(data.points, data.strokeWidth, data.arrowHeadScale);
        }
        if (!locked) return null;
        if (syncTipToPoints && data.points?.[0]) {
            locked = normalizeCatkArrowParams({
                ...locked,
                tip: L.latLng(data.points[0].lat, data.points[0].lng)
            });
        }
        if (syncTailAnchor && data.points?.[1] && map) {
            locked = catkArrowParamsWithTailFromCursor(locked, L.latLng(data.points[1].lat, data.points[1].lng));
        }
        data.lockedArrowParams = locked;
        data.legacyBodyWidthKm = locked.bodyWidthKm;
        return locked;
    }

    function catkPxPerKmAtLatLng(origin, bearingDeg) {
        if (!map || !origin) return 1;
        const a = map.latLngToLayerPoint(origin);
        const b = map.latLngToLayerPoint(latLngAtBearing(origin, 1, bearingDeg));
        return Math.max(0.0001, Math.hypot(b.x - a.x, b.y - a.y));
    }

    function catkArrowGeometryPx(params) {
        const p = normalizeCatkArrowParams(params);
        if (!p || !map) return null;
        const pts = catkArrowPointsFromParams(p);
        if (pts.length < 3) return null;
        const tipPx = map.latLngToLayerPoint(pts[0]);
        const neckPx = map.latLngToLayerPoint(pts[1]);
        return buildParametricArrowGeometry({
            tip: { x: tipPx.x, y: tipPx.y },
            direction: { x: tipPx.x - neckPx.x, y: tipPx.y - neckPx.y },
            bodyWidth: p.bodyWidthKm * catkPxPerKmAtLatLng(pts[1], normalizeBearingDeg(p.directionDeg + 90)),
            headWidth: p.headWidthKm * catkPxPerKmAtLatLng(pts[1], normalizeBearingDeg(p.directionDeg + 90)),
            headLength: p.headLengthKm * catkPxPerKmAtLatLng(pts[0], normalizeBearingDeg(p.directionDeg + 180)),
            neckOffset: p.neckOffsetKm * catkPxPerKmAtLatLng(pts[0], normalizeBearingDeg(p.directionDeg + 180)),
            tailLength: p.tailLengthKm * catkPxPerKmAtLatLng(pts[1], normalizeBearingDeg(p.directionDeg + 180))
        });
    }

    function catkArrowOverlayLatLngs(params) {
        const p = normalizeCatkArrowParams(params);
        const g = catkArrowGeometryPx(p);
        if (!p || !g || !map) return null;
        const rect = buildParametricArrowOverlayRect({
            tip: g.tip,
            direction: g.dir,
            bodyWidth: g.bodyHalf * 2,
            headWidth: g.headHalf * 2,
            headLength: Math.hypot(g.tip.x - g.headBaseCenter.x, g.tip.y - g.headBaseCenter.y),
            neckOffset: Math.hypot(g.tip.x - g.neckCenter.x, g.tip.y - g.neckCenter.y),
            tailLength: Math.hypot(g.neckCenter.x - g.tailCenter.x, g.neckCenter.y - g.tailCenter.y)
        }, 14, 10);
        return rect.map(pt => map.layerPointToLatLng(L.point(pt.x, pt.y)));
    }

    function catkArrowEditHandleLatLngs(params) {
        const p = normalizeCatkArrowParams(params);
        const g = catkArrowGeometryPx(p);
        if (!p || !g || !map) return null;
        return {
            tip: p.tip,
            // Yellow handle sits on one neck edge so dragging it edits neckOffset and body width together.
            neck: map.layerPointToLatLng(L.point(g.bodyLeftNeck.x, g.bodyLeftNeck.y)),
            tail: map.layerPointToLatLng(L.point(g.tailCenter.x, g.tailCenter.y)),
            neckCenter: map.layerPointToLatLng(L.point(g.neckCenter.x, g.neckCenter.y)),
            tailCenter: map.layerPointToLatLng(L.point(g.tailCenter.x, g.tailCenter.y))
        };
    }

    function catkBeginNeckHandleDragSession(params, handleLatLng) {
        const p = normalizeCatkArrowParams(params);
        if (!p || !map) return null;
        const currentHandles = catkArrowEditHandleLatLngs(p);
        if (!currentHandles) return null;
        const tipPx = map.latLngToLayerPoint(p.tip);
        const neckCenterPx = map.latLngToLayerPoint(currentHandles.neckCenter);
        const handlePx = map.latLngToLayerPoint(handleLatLng || currentHandles.neck);
        let dirX = tipPx.x - neckCenterPx.x;
        let dirY = tipPx.y - neckCenterPx.y;
        const dirLen = Math.hypot(dirX, dirY) || 1;
        dirX /= dirLen;
        dirY /= dirLen;
        const normalX = -dirY;
        const normalY = dirX;
        const startVectorX = handlePx.x - tipPx.x;
        const startVectorY = handlePx.y - tipPx.y;
        const handleRayLen = Math.hypot(startVectorX, startVectorY) || 1;
        const frozenTailPx = map.latLngToLayerPoint(currentHandles.tailCenter);
        const frozenSpanPx = Math.max(0, (frozenTailPx.x - tipPx.x) * (-dirX) + (frozenTailPx.y - tipPx.y) * (-dirY));
        const minTailPx = CATK_ARROW_MIN_TAIL_LENGTH_KM * catkPxPerKmAtLatLng(currentHandles.neckCenter, normalizeBearingDeg(p.directionDeg + 180));
        return {
            params: p,
            tipPx,
            handlePx,
            dirX,
            dirY,
            normalX,
            normalY,
            tailDirX: -dirX,
            tailDirY: -dirY,
            handleRayX: startVectorX / handleRayLen,
            handleRayY: startVectorY / handleRayLen,
            startNeckOffsetPx: Math.max(0, -(startVectorX * dirX + startVectorY * dirY)),
            startHalfWidthSignedPx: startVectorX * normalX + startVectorY * normalY,
            neckAxisBearing: normalizeBearingDeg(p.directionDeg + 180),
            widthAxisBearing: normalizeBearingDeg(p.directionDeg + 90),
            neckCenter: currentHandles.neckCenter,
            frozenTailCenter: currentHandles.tailCenter,
            frozenSpanPx,
            minTailPx
        };
    }

    function catkArrowParamsFromNeckDragSession(session, handleLatLng) {
        if (!session || !handleLatLng || !map) return session?.params || null;
        const nextPx = map.latLngToLayerPoint(handleLatLng);
        const fromTipX = nextPx.x - session.tipPx.x;
        const fromTipY = nextPx.y - session.tipPx.y;
        // Absolute projections from tip make one drag update neck depth and width
        // together, which matches map.army-style shoulder control.
        let neckOffsetPx = Math.max(0, -(fromTipX * session.dirX + fromTipY * session.dirY));
        let halfWidthPx = Math.max(0, Math.abs(fromTipX * session.normalX + fromTipY * session.normalY));
        // Keep tiny drags stable so the handle does not twitch when pointer noise is low.
        if (Math.hypot(nextPx.x - session.handlePx.x, nextPx.y - session.handlePx.y) < CATK_NECK_HANDLE_STABILITY_DRAG_PX) {
            neckOffsetPx = session.startNeckOffsetPx;
            halfWidthPx = Math.abs(session.startHalfWidthSignedPx);
        }
        if (Number.isFinite(session.frozenSpanPx) && Number.isFinite(session.minTailPx)) {
            const maxNeckPx = Math.max(CATK_ARROW_MIN_HEAD_LENGTH_PX, session.frozenSpanPx - session.minTailPx);
            neckOffsetPx = Math.max(CATK_ARROW_MIN_HEAD_LENGTH_PX, Math.min(neckOffsetPx, maxNeckPx));
        }
        const params = session.params;
        const neckOffsetKm = Math.max(
            CATK_ARROW_MIN_HEAD_LENGTH_KM,
            neckOffsetPx / catkPxPerKmAtLatLng(params.tip, session.neckAxisBearing)
        );
        const bodyWidthKm = Math.max(
            CATK_ARROW_MIN_BODY_WIDTH_KM,
            (halfWidthPx / catkPxPerKmAtLatLng(session.neckCenter, session.widthAxisBearing)) * 2
        );
        // The neck handle controls the shoulder, so head base depth follows neck offset.
        // Keep the previous tail endpoint anchored while shoulder slides.
        const nextNeckCenter = latLngAtBearing(params.tip, neckOffsetKm, session.neckAxisBearing);
        let tailLengthKm = params.tailLengthKm;
        if (Number.isFinite(session.frozenSpanPx) && Number.isFinite(session.minTailPx)) {
            const tailPx = Math.max(session.minTailPx, session.frozenSpanPx - neckOffsetPx);
            tailLengthKm = Math.max(
                CATK_ARROW_MIN_TAIL_LENGTH_KM,
                tailPx / catkPxPerKmAtLatLng(nextNeckCenter, session.neckAxisBearing)
            );
        } else if (session.frozenTailCenter) {
            const nextNeckPx = map.latLngToLayerPoint(nextNeckCenter);
            const frozenTailPx = map.latLngToLayerPoint(session.frozenTailCenter);
            const projectedTailPx = Math.max(
                0,
                (frozenTailPx.x - nextNeckPx.x) * session.tailDirX +
                (frozenTailPx.y - nextNeckPx.y) * session.tailDirY
            );
            tailLengthKm = Math.max(
                CATK_ARROW_MIN_TAIL_LENGTH_KM,
                projectedTailPx / catkPxPerKmAtLatLng(nextNeckCenter, session.neckAxisBearing)
            );
        }
        const headWidthRatio = params.headWidthKm / Math.max(params.bodyWidthKm, CATK_ARROW_MIN_BODY_WIDTH_KM);
        return normalizeCatkArrowParams({
            ...params,
            headLengthKm: neckOffsetKm,
            neckOffsetKm,
            tailLengthKm,
            bodyWidthKm,
            headWidthKm: Math.max(bodyWidthKm, bodyWidthKm * headWidthRatio)
        });
    }

    function catkArrowParamsWithTailFromCursor(params, cursor) {
        const p = normalizeCatkArrowParams(params);
        if (!p || !cursor || !map) return p;
        const handles = catkArrowEditHandleLatLngs(p);
        if (!handles) return p;
        const neckPx = map.latLngToLayerPoint(handles.neckCenter);
        const cursorPx = map.latLngToLayerPoint(cursor);
        const tailDirBearing = normalizeBearingDeg(p.directionDeg + 180);
        const tailDirPx = map.latLngToLayerPoint(latLngAtBearing(handles.neckCenter, 1, tailDirBearing));
        let dx = tailDirPx.x - neckPx.x;
        let dy = tailDirPx.y - neckPx.y;
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        const projPx = Math.max(0, (cursorPx.x - neckPx.x) * dx + (cursorPx.y - neckPx.y) * dy);
        const tailLengthKm = Math.max(CATK_ARROW_MIN_TAIL_LENGTH_KM, projPx / catkPxPerKmAtLatLng(handles.neckCenter, tailDirBearing));
        return normalizeCatkArrowParams({ ...p, tailLengthKm });
    }

    function catkArrowGroupStylePayload(typeId, source) {
        return {
            typeId,
            color: source?.color || '#3b82f6',
            strokeWidth: source?.strokeWidth ?? 4,
            arrowHeadScale: source?.arrowHeadScale ?? 1.0,
            dashed: resolveCatkMultiPointDashed(typeId, source)
        };
    }

    function attachCatkGroupEvents(group) {
        group.bindPopup(buildCatkTailPopupContent(group));
        group.on('popupclose', () => removeTmgResizeHandle());
        group.on('popupopen', () => onCatkGroupPopupOpen(group));
        const data = group._tmgData;
        if (data?.tailPolyline) {
            data.tailPolyline.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                group.openPopup(e.latlng);
            });
        }
        if (data?.headMarker) {
            data.headMarker.on('click', () => group.openPopup(data.headMarker.getLatLng()));
            data.headMarker._catkGroup = group;
        }
        return group;
    }

    function createParametricCatkGroup(typeId, arrowParams, style = {}) {
        const params = normalizeCatkArrowParams(arrowParams);
        if (!params) return null;
        const opts = catkArrowGroupStylePayload(typeId, style);
        const group = L.layerGroup();
        const data = {
            typeId,
            color: opts.color,
            strokeWidth: opts.strokeWidth,
            arrowHeadScale: opts.arrowHeadScale,
            dashed: opts.dashed,
            isCatkMultiPoint: true,
            isParametricArrow: true,
            arrowParams: params,
            ...applyImportedDisplayNameProps(style)
        };
        catkApplyArrowParamsToData(data);
        const tailPolyline = L.polyline(catkBuildTailPathFromPoints(data.points), catkHitPolylineOptions(data.color, data.strokeWidth));
        const headMarker = createCatkUnifiedMarker(data.points, typeId, data.color, data.strokeWidth, undefined, data, data.arrowHeadScale ?? 1.0, data.arrowParams);
        data.tailPolyline = tailPolyline;
        data.headMarker = headMarker;
        group.addLayer(tailPolyline);
        if (headMarker) group.addLayer(headMarker);
        group._tmgData = data;
        return attachCatkGroupEvents(group);
    }

    function createLegacyCatkGroup(typeId, points, style = {}) {
        const pts = (points || []).filter(Boolean).map((p) => L.latLng(p.lat, p.lng));
        if (pts.length < 2) return null;
        const opts = catkArrowGroupStylePayload(typeId, style);
        const group = L.layerGroup();
        const data = {
            typeId,
            points: pts.slice(),
            color: opts.color,
            strokeWidth: opts.strokeWidth,
            arrowHeadScale: opts.arrowHeadScale,
            dashed: opts.dashed,
            isCatkMultiPoint: true,
            isParametricArrow: false,
            catkAutoJunction: false,
            legacyBodyWidthKm: isFinite(Number(style.legacyBodyWidthKm)) ? Number(style.legacyBodyWidthKm) : null,
            lockedArrowParams: normalizeCatkArrowParams(style.lockedArrowParams),
            // Keep legacy explicit tail vertices (no auto-collapse to parametric points).
            preserveLegacyPoints: !!style.preserveLegacyPoints,
            ...applyImportedDisplayNameProps(style)
        };
        catkEnsureLockedArrowParams(data);
        const tailPolyline = L.polyline(catkBuildTailPathFromPoints(data.points), catkHitPolylineOptions(data.color, data.strokeWidth));
        const headMarker = createCatkUnifiedMarker(data.points, typeId, data.color, data.strokeWidth, undefined, data, data.arrowHeadScale ?? 1.0, null);
        data.tailPolyline = tailPolyline;
        data.headMarker = headMarker;
        group.addLayer(tailPolyline);
        if (headMarker) group.addLayer(headMarker);
        group._tmgData = data;
        return attachCatkGroupEvents(group);
    }

    /** 2-click CATK: junction lies this far along the segment from tail end toward arrow (straight dashed tail). */
    const CATK_AUTO_JUNCTION_T = 0.72;

    function catkInterpOnTailAxis(tailEnd, arrow, t) {
        return L.latLng(
            tailEnd.lat + t * (arrow.lat - tailEnd.lat),
            tailEnd.lng + t * (arrow.lng - tailEnd.lng)
        );
    }

    function catkBuildTailPathFromPoints(points) {
        if (!points || points.length < 2) return [];
        const out = [];
        for (let i = points.length - 1; i >= 0; i--) out.push(points[i]);
        return out;
    }

    function catkTailPolylineOptions(color, strokeWidth, extra = {}) {
        return {
            color,
            weight: Math.max(2, strokeWidth - 1),
            dashArray: '12, 12',
            opacity: 1,
            lineCap: 'round',
            lineJoin: 'round',
            ...extra
        };
    }

    /** Invisible wide polyline for clicks only (no visible “second line” on the map). */
    function catkHitPolylineOptions(color, strokeWidth, extra = {}) {
        return {
            color: color || '#3b82f6',
            opacity: 0,
            weight: Math.max(14, (strokeWidth || 4) * 3),
            lineCap: 'round',
            lineJoin: 'round',
            interactive: true,
            className: 'catk-hit-polyline',
            ...extra
        };
    }

    /** Dashed CATK-style map graphic vs solid Attack; honors export `dashed: false` on import. */
    function resolveCatkMultiPointDashed(typeId, elData) {
        if (elData && Object.prototype.hasOwnProperty.call(elData, 'dashed')) return !!elData.dashed;
        const def = TACTICAL_GRAPHICS.find(d => d.id === typeId);
        return !!(def && def.dashed);
    }

    function catkPopupStylePayload(data) {
        if (!data) return { filled: false, dashed: false, strokeWidth: 4, color: '#3b82f6' };
        return {
            filled: false,
            dashed: resolveCatkMultiPointDashed(data.typeId, data),
            strokeWidth: data.strokeWidth ?? 4,
            color: data.color || '#3b82f6'
        };
    }

    function applyCatkMultiPointStyle(group, style) {
        const data = group?._tmgData;
        if (!data?.isCatkMultiPoint) return;
        if (style.dashed !== undefined) data.dashed = !!style.dashed;
        if (style.color !== undefined) data.color = style.color;
        if (style.strokeWidth !== undefined) data.strokeWidth = style.strokeWidth;
        if (style.arrowHeadScale !== undefined) data.arrowHeadScale = style.arrowHeadScale;
        if (data.tailPolyline?.setStyle) {
            data.tailPolyline.setStyle(catkHitPolylineOptions(data.color, data.strokeWidth));
        }
        if (data.headMarker) syncCatkHeadMarkerToPoints(data.headMarker, data);
        if (data.headMarker && group._layerId) {
            requestAnimationFrame(() => refreshTmgSelectionBox(data.headMarker, group._layerId));
        }
        scheduleSaveToStorage();
    }

    /**
     * Route a polyline of absolute pixel-space points around obstacle areas.
     * Converts each segment to lat/lng, applies obstacle routing, converts back.
     */
    let _skipObstacleRouting = false;
    function routePixelPolylineAroundObstacles(absPixelPts) {
        if (_skipObstacleRouting) return absPixelPts;
        if (!absPixelPts || absPixelPts.length < 2 || !map) return absPixelPts;
        const polys = getRoutingObstaclePolygons();
        if (!polys.length) return absPixelPts;

        const result = [];
        for (let i = 0; i < absPixelPts.length - 1; i++) {
            const c = map.layerPointToLatLng(L.point(absPixelPts[i].x, absPixelPts[i].y));
            const f = map.layerPointToLatLng(L.point(absPixelPts[i + 1].x, absPixelPts[i + 1].y));
            const bent = bendLatLngSegmentAroundObstacles(c, f, polys);

            const startIdx = (i === 0) ? 0 : 1;
            for (let j = startIdx; j < bent.length; j++) {
                const px = map.latLngToLayerPoint(bent[j]);
                result.push({ x: px.x, y: px.y });
            }
        }
        return result;
    }

    /**
     * Hollow double-rail tail + stepped head (90° / 45°). CounterAttack / by-fire: dashed; Attack: solid, no label.
     * By-fire: narrow dashed twin stem + open V at tip.
     */
    function getCatkUnifiedDivIcon(points, color, strokeWidth, typeId = 'counterattack-by-fire', iconOpts = {}) {
        if (!points || points.length < 2 || !map) return null;
        const sw = Math.max(2.5, (strokeWidth || 4));
        let ribbonHalf = Math.max(3, sw * 1.9);
        const escColor = String(color || 'rgb(66,160,255)').replace(/"/g, '');
        const innerLabel = counterattackStyleInnerLabel(typeId);
        const isCatkByFire = typeId === 'counterattack-by-fire';
        const isMainAttack = typeId === 'main-attack';
        const railsDashed = iconOpts.railsDashed !== undefined ? !!iconOpts.railsDashed : (typeId !== 'attack' && typeId !== 'main-attack');
        const useSolidRails = !railsDashed;
        const arrowHeadScale = typeof iconOpts.arrowHeadScale === 'number' ? Math.max(0.3, Math.min(4.0, iconOpts.arrowHeadScale)) : 1.0;
        const arrowGeometry = iconOpts.arrowGeometry ? normalizeCatkArrowParams(iconOpts.arrowGeometry) : null;
        const lockedArrowParams = iconOpts.lockedArrowParams ? normalizeCatkArrowParams(iconOpts.lockedArrowParams) : null;
        // Legacy multi-point tails used a fixed visual width. When we have a
        // locked body width from placement, reuse it so width stays consistent.
        const legacyBodyWidthKm = Number(iconOpts.legacyBodyWidthKm);
        if (!arrowGeometry && isFinite(legacyBodyWidthKm) && legacyBodyWidthKm > 0 && points.length >= 2) {
            const tipLL = L.latLng(points[0].lat, points[0].lng);
            const neckLL = L.latLng(points[1].lat, points[1].lng);
            const lateralBearing = normalizeBearingDeg(bearingDegrees(neckLL, tipLL) + 90);
            const halfFromKm = (legacyBodyWidthKm * catkPxPerKmAtLatLng(neckLL, lateralBearing)) / 2;
            if (isFinite(halfFromKm) && halfFromKm > 0) {
                ribbonHalf = Math.max(sw * 0.9, halfFromKm);
            }
        }
        if (arrowGeometry) {
            const g = catkArrowGeometryPx(arrowGeometry);
            if (!g) return null;
            const tipWorld = g.tip;
            const neckWorld = g.neckCenter;
            const tailWorld = g.tailCenter;
            const ux = g.dir.x;
            const uy = g.dir.y;
            const perpX = g.normal.x;
            const perpY = g.normal.y;
            // Minimum visual rail half — prevents both body rails from collapsing to
            // a single line at wide/small-scale zoom levels where km→px is near zero.
            const minVisualHalf = Math.max(3, sw * 1.9);
            const vizBodyHalf = Math.max(g.bodyHalf, minVisualHalf);
            const vizHeadHalf = Math.max(g.headHalf, vizBodyHalf);
            const vizBodyLeftTail  = { x: g.tailCenter.x      + perpX * vizBodyHalf, y: g.tailCenter.y      + perpY * vizBodyHalf };
            const vizBodyRightTail = { x: g.tailCenter.x      - perpX * vizBodyHalf, y: g.tailCenter.y      - perpY * vizBodyHalf };
            const vizBodyLeftNeck  = { x: g.neckCenter.x      + perpX * vizBodyHalf, y: g.neckCenter.y      + perpY * vizBodyHalf };
            const vizBodyRightNeck = { x: g.neckCenter.x      - perpX * vizBodyHalf, y: g.neckCenter.y      - perpY * vizBodyHalf };
            const vizHeadLeftBase  = { x: g.headBaseCenter.x  + perpX * vizHeadHalf, y: g.headBaseCenter.y  + perpY * vizHeadHalf };
            const vizHeadRightBase = { x: g.headBaseCenter.x  - perpX * vizHeadHalf, y: g.headBaseCenter.y  - perpY * vizHeadHalf };
            const minHeadLeg = Math.max(4, sw * 1.2);
            const minHeadLegIcon = isCatkByFire ? Math.max(minHeadLeg, sw * 1.65) : minHeadLeg;
            const headDepthPx = Math.hypot(tipWorld.x - neckWorld.x, tipWorld.y - neckWorld.y) || 1;
            const miniDepthWant = sw * 1.75;
            const stemLenWant = isCatkByFire ? Math.max(sw * 3.05, vizBodyHalf * 0.95) : 0;
            const extensionWant = isCatkByFire ? stemLenWant + miniDepthWant : 0;
            const minNeckToMainApex = sw * 6.2;
            const extensionTotal = isCatkByFire ? Math.max(0, Math.min(extensionWant, headDepthPx - minNeckToMainApex)) : 0;
            const stemFrac = extensionWant > 0 ? stemLenWant / extensionWant : 0;
            const miniDepth = isCatkByFire ? extensionTotal * (1 - stemFrac) : 0;
            const mainHeadTipWorld = isCatkByFire && extensionTotal > 0
                ? { x: tipWorld.x - extensionTotal * ux, y: tipWorld.y - extensionTotal * uy }
                : { x: tipWorld.x, y: tipWorld.y };
            const stemBaseWorld = isCatkByFire && extensionTotal > 0
                ? { x: tipWorld.x - miniDepth * ux, y: tipWorld.y - miniDepth * uy }
                : null;
            const byFireNarrow = Math.max(1.65, sw * 0.42);
            const byFirePinch = 0.52;
            let byFireStemTop0 = null;
            let byFireStemBot0 = null;
            let byFireStemTop1 = null;
            let byFireStemBot1 = null;
            if (isCatkByFire && stemBaseWorld && extensionTotal > 0) {
                byFireStemTop0 = { x: mainHeadTipWorld.x + perpX * byFireNarrow, y: mainHeadTipWorld.y + perpY * byFireNarrow };
                byFireStemBot0 = { x: mainHeadTipWorld.x - perpX * byFireNarrow, y: mainHeadTipWorld.y - perpY * byFireNarrow };
                byFireStemTop1 = { x: stemBaseWorld.x + perpX * byFireNarrow * byFirePinch, y: stemBaseWorld.y + perpY * byFireNarrow * byFirePinch };
                byFireStemBot1 = { x: stemBaseWorld.x - perpX * byFireNarrow * byFirePinch, y: stemBaseWorld.y - perpY * byFireNarrow * byFirePinch };
            }
            const headCorners = catkSteppedArrowHeadCornersAbs(mainHeadTipWorld, vizHeadLeftBase, vizHeadRightBase, minHeadLegIcon, 1);
            // Route left and right rails around obstacle areas
            const routedLeftAbs = routePixelPolylineAroundObstacles([vizBodyLeftTail, vizBodyLeftNeck, vizHeadLeftBase, headCorners.A, mainHeadTipWorld]);
            const routedRightAbs = routePixelPolylineAroundObstacles([vizBodyRightTail, vizBodyRightNeck, vizHeadRightBase, headCorners.B, mainHeadTipWorld]);
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            const bump = (pt) => {
                if (!pt) return;
                minX = Math.min(minX, pt.x);
                minY = Math.min(minY, pt.y);
                maxX = Math.max(maxX, pt.x);
                maxY = Math.max(maxY, pt.y);
            };
            [
                tipWorld,
                neckWorld,
                tailWorld,
                vizBodyLeftTail,
                vizBodyRightTail,
                vizBodyLeftNeck,
                vizBodyRightNeck,
                vizHeadLeftBase,
                vizHeadRightBase,
                headCorners.A,
                headCorners.B,
                byFireStemTop0,
                byFireStemBot0,
                byFireStemTop1,
                byFireStemBot1
            ].forEach(bump);
            routedLeftAbs.forEach(bump);
            routedRightAbs.forEach(bump);
            const tLabel = 0.62;
            const textWorld = {
                x: tailWorld.x + tLabel * (tipWorld.x - tailWorld.x),
                y: tailWorld.y + tLabel * (tipWorld.y - tailWorld.y)
            };
            if (innerLabel) bump(textWorld);
            const fontPx = Math.max(11, Math.min(24, headDepthPx * 0.15 + sw * 1.35));
            const bboxPad = Math.max(sw * 3, vizHeadHalf + sw * 2, vizBodyHalf + sw * 2, 18);
            minX -= bboxPad;
            minY -= bboxPad;
            maxX += bboxPad;
            maxY += bboxPad;
            const pad = 20 + sw * 2;
            const dashUnit = sw * 2;
            const dashArr = `${dashUnit},${dashUnit}`;
            const tailRailAttrs = useSolidRails
                ? `fill="none" stroke="${escColor}" stroke-width="${sw}" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="6"`
                : `fill="none" stroke="${escColor}" stroke-width="${sw}" stroke-dasharray="${dashArr}" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="6"`;
            const ox = minX - pad;
            const oy = minY - pad;
            const toRel = (pt) => ({ x: pt.x - ox, y: pt.y - oy });
            const fmt = (pt) => `${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`;
            const tipRel = toRel(tipWorld);
            const routedLeftRel = routedLeftAbs.map(toRel);
            const routedRightRel = routedRightAbs.map(toRel);
            const bodySvg = `<path d="${catkPolylineToPathD(routedLeftRel)}" ${tailRailAttrs}/>
        <path d="${catkPolylineToPathD(routedRightRel)}" ${tailRailAttrs}/>`;
            let byFireSvg = '';
            if (isCatkByFire && byFireStemTop0 && byFireStemBot0 && byFireStemTop1 && byFireStemBot1) {
                const t0a = toRel(byFireStemTop0);
                const b0a = toRel(byFireStemBot0);
                const t1a = toRel(byFireStemTop1);
                const b1a = toRel(byFireStemBot1);
                byFireSvg = `\n        <path d="M ${fmt(t0a)} L ${fmt(t1a)}" ${tailRailAttrs}/>
        <path d="M ${fmt(b0a)} L ${fmt(b1a)}" ${tailRailAttrs}/>
        <path d="M ${fmt(t1a)} L ${fmt(tipRel)}" ${tailRailAttrs}/>
        <path d="M ${fmt(b1a)} L ${fmt(tipRel)}" ${tailRailAttrs}/>`;
            }
            // Main Attack: open arrow chevron above the body (left side facing direction of advance).
            let mainAttackSvg = '';
            if (isMainAttack) {
                // V chevron: copy of arrowhead shape (A → tip → B), shifted forward past the tip
                const headDepth = Math.hypot(mainHeadTipWorld.x - g.neckCenter.x, mainHeadTipWorld.y - g.neckCenter.y);
                const shift = headDepth * 0.12 + sw;
                const chevA = { x: headCorners.A.x + shift * ux, y: headCorners.A.y + shift * uy };
                const chevB = { x: headCorners.B.x + shift * ux, y: headCorners.B.y + shift * uy };
                const chevTip = { x: mainHeadTipWorld.x + shift * ux, y: mainHeadTipWorld.y + shift * uy };
                // Don't bump — SVG has overflow:visible, and bumping enlarges the marker div
                // which would cover the control handles and prevent them from being dragged.
                const cAr = toRel(chevA);
                const cBr = toRel(chevB);
                const cTr = toRel(chevTip);
                mainAttackSvg = `\n        <path d="M ${fmt(cAr)} L ${fmt(cTr)} L ${fmt(cBr)}" fill="none" stroke="${escColor}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
            }
            const W = Math.max(48, Math.ceil(maxX - minX + pad * 2));
            const H = Math.max(48, Math.ceil(maxY - minY + pad * 2));
            const tr = toRel(textWorld);
            const labelSvg = innerLabel
                ? `<text x="${tr.x.toFixed(1)}" y="${tr.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="${escColor}" font-size="${fontPx.toFixed(1)}" font-weight="600" font-family="system-ui,Segoe UI,Arial,sans-serif" stroke="none">${innerLabel}</text>`
                : '';
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block;overflow:visible;">
        ${bodySvg}${byFireSvg}${mainAttackSvg}
        ${labelSvg}
    </svg>`;
            const centerLL = map.layerPointToLatLng(L.point((minX + maxX) / 2, (minY + maxY) / 2));
            return {
                html: svg,
                iconSize: [W, H],
                iconAnchor: [Math.round(W / 2), Math.round(H / 2)],
                centerLatLng: centerLL
            };
        }
        const abs = (i) => map.latLngToLayerPoint(L.latLng(points[i].lat, points[i].lng));
        const absPts = points.map((_, i) => abs(i));
        const p0a = absPts[0];
        const p1a = absPts[1];
        let tipWorld = { x: p0a.x, y: p0a.y };
        let neckWorld = null;
        let ang = Math.atan2(p0a.y - p1a.y, p0a.x - p1a.x);
        let d01 = Math.hypot(p0a.x - p1a.x, p0a.y - p1a.y) || 1;
        /** Unit forward (neck → placement tip), layer px */
        let ux = Math.cos(ang);
        let uy = Math.sin(ang);
        // Deeper head => pointier stepped (90°/45°) head; by-fire needs extra room for stem + mini arrow in front.
        const ahTarget = sw * 5.35 * arrowHeadScale;
        const miniDepthWant = sw * 1.75;
        const stemLenWant = isCatkByFire ? Math.max(sw * 3.05, ribbonHalf * 1.05) : 0;
        const extensionWant = isCatkByFire ? stemLenWant + miniDepthWant : 0;
        /** Minimum layer px from neck to main stepped apex so 90°/45° head + by-fire barb fit */
        const minNeckToMainApex = sw * 6.2;
        let ahClamped = Math.min(ahTarget, Math.max(0, d01 - sw * 0.35));
        if (lockedArrowParams) {
            const lg = catkArrowGeometryPx(lockedArrowParams);
            if (lg) {
                tipWorld = { x: lg.tip.x, y: lg.tip.y };
                neckWorld = { x: lg.neckCenter.x, y: lg.neckCenter.y };
                d01 = Math.hypot(tipWorld.x - neckWorld.x, tipWorld.y - neckWorld.y) || 1;
                ang = Math.atan2(tipWorld.y - neckWorld.y, tipWorld.x - neckWorld.x);
                ux = Math.cos(ang);
                uy = Math.sin(ang);
                ahClamped = d01;
                ribbonHalf = Math.max(ribbonHalf, lg.bodyHalf);
            }
        }
        if (isCatkByFire) {
            ahClamped = Math.max(ahClamped, Math.min(extensionWant + minNeckToMainApex, d01 - sw * 0.35));
        }
        if (!neckWorld) {
            neckWorld = { x: tipWorld.x - ahClamped * Math.cos(ang), y: tipWorld.y - ahClamped * Math.sin(ang) };
        }
        const maxExtension = Math.max(0, ahClamped - minNeckToMainApex);
        const extensionTotal = isCatkByFire ? Math.min(extensionWant, maxExtension) : 0;
        const stemFrac = extensionWant > 0 ? stemLenWant / extensionWant : 0;
        const stemLen = isCatkByFire ? extensionTotal * stemFrac : 0;
        const miniDepth = isCatkByFire ? extensionTotal * (1 - stemFrac) : 0;
        /** Main stepped head (90° + 45°) closes here; by-fire: stem + small V continue to tipWorld */
        const mainHeadTipWorld = isCatkByFire && extensionTotal > 0
            ? { x: tipWorld.x - extensionTotal * ux, y: tipWorld.y - extensionTotal * uy }
            : { x: tipWorld.x, y: tipWorld.y };
        const stemBaseWorld = isCatkByFire && extensionTotal > 0
            ? { x: tipWorld.x - miniDepth * ux, y: tipWorld.y - miniDepth * uy }
            : null;
        const perpX = -uy;
        const perpY = ux;
        /** Narrow double-rail “by fire” stem + chevron; solid stroke reads clearly vs dashed main head */
        const byFireNarrow = Math.max(1.65, sw * 0.42);
        const byFirePinch = 0.52;
        let byFireStemTop0 = null;
        let byFireStemBot0 = null;
        let byFireStemTop1 = null;
        let byFireStemBot1 = null;
        if (isCatkByFire && stemBaseWorld && extensionTotal > 0) {
            byFireStemTop0 = { x: mainHeadTipWorld.x + perpX * byFireNarrow, y: mainHeadTipWorld.y + perpY * byFireNarrow };
            byFireStemBot0 = { x: mainHeadTipWorld.x - perpX * byFireNarrow, y: mainHeadTipWorld.y - perpY * byFireNarrow };
            byFireStemTop1 = { x: stemBaseWorld.x + perpX * byFireNarrow * byFirePinch, y: stemBaseWorld.y + perpY * byFireNarrow * byFirePinch };
            byFireStemBot1 = { x: stemBaseWorld.x - perpX * byFireNarrow * byFirePinch, y: stemBaseWorld.y - perpY * byFireNarrow * byFirePinch };
        }

        const bump = (x, y) => {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        };
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        absPts.forEach((p) => bump(p.x, p.y));
        bump(neckWorld.x, neckWorld.y);
        bump(tipWorld.x, tipWorld.y);
        bump(mainHeadTipWorld.x, mainHeadTipWorld.y);
        if (stemBaseWorld) bump(stemBaseWorld.x, stemBaseWorld.y);
        if (byFireStemTop0) bump(byFireStemTop0.x, byFireStemTop0.y);
        if (byFireStemBot0) bump(byFireStemBot0.x, byFireStemBot0.y);
        if (byFireStemTop1) bump(byFireStemTop1.x, byFireStemTop1.y);
        if (byFireStemBot1) bump(byFireStemBot1.x, byFireStemBot1.y);
        minX -= ribbonHalf;
        maxX += ribbonHalf;
        minY -= ribbonHalf;
        maxY += ribbonHalf;

        const tailEndA = absPts[absPts.length - 1];
        const tLabel = 0.62;
        const textWorld = {
            x: tailEndA.x + tLabel * (tipWorld.x - tailEndA.x),
            y: tailEndA.y + tLabel * (tipWorld.y - tailEndA.y)
        };
        if (innerLabel) {
            bump(textWorld.x, textWorld.y);
        }
        const fontPx = Math.max(11, Math.min(24, ahClamped * 0.15 + sw * 1.35));

        const spineAbs = [];
        for (let i = points.length - 1; i >= 1; i--) spineAbs.push({ x: absPts[i].x, y: absPts[i].y });
        if (Math.hypot(p1a.x - neckWorld.x, p1a.y - neckWorld.y) > 0.8) spineAbs.push({ x: neckWorld.x, y: neckWorld.y });

        const pad = 20 + sw * 2;
        const dashUnit = sw * 2;
        const dashArr = `${dashUnit},${dashUnit}`;
        const tailRailAttrs = useSolidRails
            ? `fill="none" stroke="${escColor}" stroke-width="${sw}" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="6"`
            : `fill="none" stroke="${escColor}" stroke-width="${sw}" stroke-dasharray="${dashArr}" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="6"`;
        const minHeadLeg = Math.max(4, sw * 1.2);
        const minHeadLegIcon = isCatkByFire ? Math.max(minHeadLeg, sw * 1.65) : minHeadLeg;
        // Always smooth the spine with Catmull-Rom so body bends produce
        // round, semicircular corners instead of sharp angles.
        const useLegacyTailSmoothing = true;

        let ox = minX - pad;
        let oy = minY - pad;
        let toRel = (xa, ya) => ({ x: xa - ox, y: ya - oy });

        function buildSpineAndRails() {
            const spine = [];
            for (let i = 0; i < spineAbs.length; i++) {
                const q = toRel(spineAbs[i].x, spineAbs[i].y);
                const prev = spine[spine.length - 1];
                if (!prev || Math.hypot(q.x - prev.x, q.y - prev.y) > 0.3) spine.push(q);
            }
            let lr = [];
            let rr = [];
            if (spine.length >= 2) {
                const dense = useLegacyTailSmoothing ? catkSampleCatmullRomSpine(spine, 12) : spine;
                lr = catkOffsetOpenPolyline(dense, ribbonHalf);
                rr = catkOffsetOpenPolyline(dense, -ribbonHalf);
            } else if (spine.length === 1) {
                const nr = toRel(neckWorld.x, neckWorld.y);
                const seg = [spine[0], nr];
                lr = catkOffsetOpenPolyline(seg, ribbonHalf);
                rr = catkOffsetOpenPolyline(seg, -ribbonHalf);
            }
            return { spine, lr, rr };
        }

        for (let iter = 0; iter < 3; iter++) {
            ox = minX - pad;
            oy = minY - pad;
            toRel = (xa, ya) => ({ x: xa - ox, y: ya - oy });
            const { lr, rr } = buildSpineAndRails();
            if (!lr.length || !rr.length) break;
            const Ll0 = lr[lr.length - 1];
            const Rr0 = rr[rr.length - 1];
            const Ll_abs = { x: Ll0.x + ox, y: Ll0.y + oy };
            const Rr_abs = { x: Rr0.x + ox, y: Rr0.y + oy };
            const corners = catkSteppedArrowHeadCornersAbs(mainHeadTipWorld, Ll_abs, Rr_abs, minHeadLegIcon);
            bump(corners.A.x, corners.A.y);
            bump(corners.B.x, corners.B.y);
        }

        ox = minX - pad;
        oy = minY - pad;
        toRel = (xa, ya) => ({ x: xa - ox, y: ya - oy });
        const { lr: leftRail, rr: rightRail } = buildSpineAndRails();
        let A_abs = { x: mainHeadTipWorld.x, y: mainHeadTipWorld.y };
        let B_abs = { x: mainHeadTipWorld.x, y: mainHeadTipWorld.y };
        if (leftRail.length && rightRail.length) {
            const Ll0 = leftRail[leftRail.length - 1];
            const Rr0 = rightRail[rightRail.length - 1];
            const Ll_abs = { x: Ll0.x + ox, y: Ll0.y + oy };
            const Rr_abs = { x: Rr0.x + ox, y: Rr0.y + oy };
            const corners = catkSteppedArrowHeadCornersAbs(mainHeadTipWorld, Ll_abs, Rr_abs, minHeadLegIcon);
            A_abs = corners.A;
            B_abs = corners.B;
        }

        const tipR = toRel(tipWorld.x, tipWorld.y);
        let tailSvg = '';
        if (leftRail.length && rightRail.length) {
            // Convert relative rails to absolute, append head corners + tip, route around obstacles.
            // Downsample the dense Catmull-Rom rail to at most ~8 key points before
            // obstacle routing — routing all 25+ dense samples causes a UI freeze
            // (each segment does O(2500) intersection checks against the coastline).
            const simplifyRailForRouting = (rail) => {
                if (rail.length <= 8) return rail.slice();
                const step = Math.max(1, Math.floor((rail.length - 1) / 6));
                const out = [rail[0]];
                for (let si = step; si < rail.length - 1; si += step) out.push(rail[si]);
                out.push(rail[rail.length - 1]);
                return out;
            };
            const leftSparse = simplifyRailForRouting(leftRail);
            const rightSparse = simplifyRailForRouting(rightRail);
            const leftAbsPts = leftSparse.map(p => ({ x: p.x + ox, y: p.y + oy }));
            leftAbsPts.push({ x: A_abs.x, y: A_abs.y });
            leftAbsPts.push({ x: mainHeadTipWorld.x, y: mainHeadTipWorld.y });
            const rightAbsPts = rightSparse.map(p => ({ x: p.x + ox, y: p.y + oy }));
            rightAbsPts.push({ x: B_abs.x, y: B_abs.y });
            rightAbsPts.push({ x: mainHeadTipWorld.x, y: mainHeadTipWorld.y });
            const routedLeftLeg = routePixelPolylineAroundObstacles(leftAbsPts);
            const routedRightLeg = routePixelPolylineAroundObstacles(rightAbsPts);
            // Merge routed sparse points back with original dense rail for smooth rendering.
            // If routing didn't add extra points (no obstacle crossings), use the original dense rail.
            const mergeRoutedWithDense = (routed, denseRail, sparseCount) => {
                if (routed.length <= sparseCount + 2) {
                    // No obstacle detour was added — use original dense rail + head
                    const merged = denseRail.map(p => ({ x: p.x + ox, y: p.y + oy }));
                    // Append the last 2 entries (head corner + tip) from routed
                    for (let ri = routed.length - 2; ri < routed.length; ri++) {
                        if (ri >= 0) merged.push(routed[ri]);
                    }
                    return merged.map(p => ({ x: p.x - ox, y: p.y - oy }));
                }
                return routed.map(p => ({ x: p.x - ox, y: p.y - oy }));
            };
            const routedLeftRel = mergeRoutedWithDense(routedLeftLeg, leftRail, leftSparse.length);
            const routedRightRel = mergeRoutedWithDense(routedRightLeg, rightRail, rightSparse.length);
            const dLeft = catkPolylineToPathD(routedLeftRel);
            const dRight = catkPolylineToPathD(routedRightRel);
            tailSvg = `<path d="${dLeft}" ${tailRailAttrs}/>\n        <path d="${dRight}" ${tailRailAttrs}/>`;
        }

        /** By-fire barb: same dashed schematic stroke as corridor/head (no solid fill, no heavier weight). */
        let byFireSvg = '';
        if (isCatkByFire && byFireStemTop0 && byFireStemBot0 && byFireStemTop1 && byFireStemBot1) {
            const t0a = toRel(byFireStemTop0.x, byFireStemTop0.y);
            const b0a = toRel(byFireStemBot0.x, byFireStemBot0.y);
            const t1a = toRel(byFireStemTop1.x, byFireStemTop1.y);
            const b1a = toRel(byFireStemBot1.x, byFireStemBot1.y);
            const fmt = (p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
            byFireSvg = `\n        <path d="M ${fmt(t0a)} L ${fmt(t1a)}" ${tailRailAttrs}/>
        <path d="M ${fmt(b0a)} L ${fmt(b1a)}" ${tailRailAttrs}/>
        <path d="M ${fmt(t1a)} L ${fmt(tipR)}" ${tailRailAttrs}/>
        <path d="M ${fmt(b1a)} L ${fmt(tipR)}" ${tailRailAttrs}/>`;
        }

        // Main Attack: open arrow chevron above the body (left side facing direction of advance).
        let mainAttackSvg = '';
        if (isMainAttack) {
            // V chevron: copy of arrowhead shape (A → tip → B), shifted forward past the tip
            const headDepth = Math.hypot(mainHeadTipWorld.x - neckWorld.x, mainHeadTipWorld.y - neckWorld.y);
            const shift = headDepth * 0.12 + sw;
            const chevAx = A_abs.x + shift * ux;
            const chevAy = A_abs.y + shift * uy;
            const chevBx = B_abs.x + shift * ux;
            const chevBy = B_abs.y + shift * uy;
            const chevTipX = mainHeadTipWorld.x + shift * ux;
            const chevTipY = mainHeadTipWorld.y + shift * uy;
            bump(chevAx, chevAy); bump(chevBx, chevBy); bump(chevTipX, chevTipY);
            const cAr = toRel(chevAx, chevAy);
            const cBr = toRel(chevBx, chevBy);
            const cTr = toRel(chevTipX, chevTipY);
            const fmt = (p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
            mainAttackSvg = `\n        <path d="M ${fmt(cAr)} L ${fmt(cTr)} L ${fmt(cBr)}" fill="none" stroke="${escColor}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
        }

        const W = Math.max(48, Math.ceil(maxX - minX + pad * 2));
        const H = Math.max(48, Math.ceil(maxY - minY + pad * 2));
        const tr = toRel(textWorld.x, textWorld.y);

        const paintOrder = `${tailSvg}${byFireSvg}${mainAttackSvg}`;

        const labelSvg = innerLabel
            ? `<text x="${tr.x.toFixed(1)}" y="${tr.y.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="${escColor}" font-size="${fontPx.toFixed(1)}" font-weight="600" font-family="system-ui,Segoe UI,Arial,sans-serif" stroke="none">${innerLabel}</text>`
            : '';

        const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block;overflow:visible;">
        ${paintOrder}
        ${labelSvg}
    </svg>`;
        const centerLL = map.layerPointToLatLng(L.point((minX + maxX) / 2, (minY + maxY) / 2));
        return {
            html: svg,
            iconSize: [W, H],
            iconAnchor: [Math.round(W / 2), Math.round(H / 2)],
            centerLatLng: centerLL
        };
    }

    function getCatkMultiPointBoundingLatLngs(points, strokeWidth) {
        if (!points?.length) return null;
        const sw = strokeWidth || 4;
        const pad = 16 + Math.max(8, sw * 2) + Math.max(3, sw * 1.9);
        const layerPts = points.map(p => map.latLngToLayerPoint(L.latLng(p.lat, p.lng)));
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        layerPts.forEach((pt) => {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
        });
        minX -= pad;
        minY -= pad;
        maxX += pad;
        maxY += pad;
        return [
            map.layerPointToLatLng(L.point(minX, minY)),
            map.layerPointToLatLng(L.point(maxX, minY)),
            map.layerPointToLatLng(L.point(maxX, maxY)),
            map.layerPointToLatLng(L.point(minX, maxY))
        ];
    }

    function createCatkUnifiedMarker(pts, typeId, color, strokeWidth, pane, dashedSource, arrowHeadScale, arrowGeometry) {
        const railsDashed = resolveCatkMultiPointDashed(typeId, dashedSource);
        const swRender = Math.max(0.8, Math.min(22, (strokeWidth || 4) * getMapViewPixelScale()));
        const resolvedArrowGeometry = normalizeCatkArrowParams(arrowGeometry || dashedSource?.arrowParams);
        const uni = getCatkUnifiedDivIcon(pts, color, swRender, typeId, {
            railsDashed,
            arrowHeadScale: arrowHeadScale ?? 1.0,
            arrowGeometry: resolvedArrowGeometry,
            lockedArrowParams: dashedSource?.lockedArrowParams || null,
            legacyBodyWidthKm: isFinite(Number(dashedSource?.legacyBodyWidthKm)) ? Number(dashedSource.legacyBodyWidthKm) : null
        });
        if (!uni) return null;
        const mo = {
            icon: L.divIcon({
                className: 'leaflet-div-icon catk-unified-tmg',
                html: uni.html,
                iconSize: uni.iconSize,
                iconAnchor: uni.iconAnchor
            }),
            interactive: true,
            draggable: true
        };
        if (pane) mo.pane = pane;
        const marker = L.marker(uni.centerLatLng, mo);
        marker._tmgData = {
            latlng1: L.latLng(pts[1].lat, pts[1].lng),
            latlng2: L.latLng(pts[0].lat, pts[0].lng),
            typeId,
            color,
            strokeWidth,
            useBodyOnly: false,
            filled: false,
            dashed: railsDashed,
            catkHeadSolo: false,
            catkUnified: true,
            arrowParams: resolvedArrowGeometry
        };
        marker.on('dragstart', () => {
            marker._catkUnifiedDragStart = marker.getLatLng();
        });
        marker.on('dragend', () => {
            const cg = marker._catkGroup?._tmgData;
            const start = marker._catkUnifiedDragStart;
            marker._catkUnifiedDragStart = null;
            if (!cg?.points || !start) return;
            const end = marker.getLatLng();
            const dLat = end.lat - start.lat;
            const dLng = end.lng - start.lng;
            if (Math.abs(dLat) < 1e-14 && Math.abs(dLng) < 1e-14) return;
            if (cg.arrowParams) {
                cg.arrowParams = normalizeCatkArrowParams({
                    ...cg.arrowParams,
                    tip: L.latLng(cg.arrowParams.tip.lat + dLat, cg.arrowParams.tip.lng + dLng)
                });
                catkApplyArrowParamsToData(cg);
            } else {
                cg.points = cg.points.map(p => L.latLng(p.lat + dLat, p.lng + dLng));
                if (cg.lockedArrowParams) {
                    cg.lockedArrowParams = catkShiftLockedArrowParamsByOffset(cg.lockedArrowParams, dLat, dLng);
                }
            }
            if (cg.catkAutoJunction && cg.points.length === 3 && !cg.arrowParams) {
                cg.points[1] = catkInterpOnTailAxis(cg.points[2], cg.points[0], CATK_AUTO_JUNCTION_T);
            }
            syncCatkHeadMarkerToPoints(marker, cg);
            scheduleSaveToStorage();
        });
        return marker;
    }

    function syncCatkHeadMarkerToPoints(headMarker, data) {
        if (data.arrowParams) catkApplyArrowParamsToData(data);
        else catkEnsureLockedArrowParams(data);
        const pts = data.points;
        if (!pts || pts.length < 2 || !headMarker?._tmgData) return;
        const color = data.color || headMarker._tmgData.color;
        const swBase = data.strokeWidth ?? headMarker._tmgData.strokeWidth ?? 4;
        const sw = Math.max(0.8, Math.min(22, swBase * getMapViewPixelScale()));
        const railsDashed = resolveCatkMultiPointDashed(data.typeId, data);
        const uni = getCatkUnifiedDivIcon(pts, color, sw, data.typeId, {
            railsDashed,
            arrowHeadScale: data.arrowHeadScale ?? 1.0,
            arrowGeometry: data.arrowParams || null,
            lockedArrowParams: data.lockedArrowParams || null,
            legacyBodyWidthKm: isFinite(Number(data.legacyBodyWidthKm)) ? Number(data.legacyBodyWidthKm) : null
        });
        if (!uni) return;
        headMarker._tmgData.latlng1 = L.latLng(pts[1].lat, pts[1].lng);
        headMarker._tmgData.latlng2 = L.latLng(pts[0].lat, pts[0].lng);
        headMarker._tmgData.dashed = railsDashed;
        headMarker._tmgData.arrowParams = data.arrowParams ? normalizeCatkArrowParams(data.arrowParams) : null;
        headMarker.setLatLng(uni.centerLatLng);
        headMarker.setIcon(L.divIcon({
            className: 'leaflet-div-icon catk-unified-tmg',
            html: uni.html,
            iconSize: uni.iconSize,
            iconAnchor: uni.iconAnchor
        }));
        if (data.tailPolyline) data.tailPolyline.setLatLngs(catkBuildTailPathFromPoints(pts));
    }

    function getTmgBoundingBoxCorners(latlng1, latlng2, typeId, strokeWidth) {
        const def = TACTICAL_GRAPHICS.find(d => d.id === typeId);
        if (!def) return null;
        const pxScale = getMapViewPixelScale();
        const swPx = (strokeWidth || 4) * pxScale;
        const p1 = map.latLngToLayerPoint(latlng1);
        const p2 = map.latLngToLayerPoint(latlng2);
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        let length = Math.sqrt(dx * dx + dy * dy) || 1;
        if (!def.pointSymbol) length = Math.max(length, 48 * pxScale);
        const h = def.pointSymbol ? Math.max(36 * pxScale, length) : Math.max(32 * pxScale, Math.round(20 + swPx * 5));
        const pad = 8;
        const boxLen = length + pad * 2;
        const H = h + pad * 2;
        const angle = Math.atan2(dy, dx);
        const cx = (p1.x + p2.x) / 2;
        const cy = (p1.y + p2.y) / 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const rotate = (x, y) => ({ x: cx + x * cos - y * sin, y: cy + x * sin + y * cos });
        const corners = [
            rotate(-boxLen / 2, -H / 2),
            rotate(boxLen / 2, -H / 2),
            rotate(boxLen / 2, H / 2),
            rotate(-boxLen / 2, H / 2)
        ];
        return corners.map(p => map.layerPointToLatLng(L.point(p.x, p.y)));
    }

    const TMG_SCALE_FACTOR = 1.25;
    function createTmgLayer(latlng1, latlng2, typeId, color, useBodyOnly, skipPopup, styleOverrides) {
        const def = TACTICAL_GRAPHICS.find(d => d.id === typeId);
        if (!def) return null;
        const filled = styleOverrides?.filled !== undefined ? styleOverrides.filled : def.filled;
        const dashed = styleOverrides?.dashed !== undefined ? styleOverrides.dashed : (def.dashed || false);
        const p1 = map.latLngToLayerPoint(latlng1);
        const p2 = map.latLngToLayerPoint(latlng2);
        const mid = def.pointSymbol ? latlng1 : map.layerPointToLatLng(L.point((p1.x + p2.x) / 2, (p1.y + p2.y) / 2));
        const strokeWidth = styleOverrides?.strokeWidth ?? def.strokeWidth ?? 4;
        const icon = L.divIcon(getTmgIconOptions(latlng1, latlng2, typeId, color, useBodyOnly, { filled, dashed, strokeWidth }));
        const markerOpts = { icon, interactive: true, draggable: true };
        if (styleOverrides?.pane) markerOpts.pane = styleOverrides.pane;
        const marker = L.marker(mid, markerOpts);
        if (!skipPopup) { /* caller adds via addToActiveLayer */ }
        marker._tmgData = { latlng1, latlng2, typeId, color, useBodyOnly: !!useBodyOnly, filled, dashed, strokeWidth, catkHeadSolo: !!styleOverrides?.catkHeadSolo };
        marker.on('dragend', () => {
            const d = marker._tmgData;
            if (!d) return;
            const oldMid = tmgMidpoint(d.latlng1, d.latlng2);
            let newMid = marker.getLatLng();
            // Snap circle-X markers outside obstacles after drag
            if (d.typeId === 'circle-x' && pointInObstaclePolygons(newMid.lng, newMid.lat)) {
                newMid = snapPointOutsideObstacles(newMid);
                marker.setLatLng(newMid);
            }
            const dLat = newMid.lat - oldMid.lat;
            const dLng = newMid.lng - oldMid.lng;
            d.latlng1 = L.latLng(d.latlng1.lat + dLat, d.latlng1.lng + dLng);
            d.latlng2 = L.latLng(d.latlng2.lat + dLat, d.latlng2.lng + dLng);
            updateTmgLayer(marker);
        });
        if (!skipPopup) {
                const buildSingleTmgPopupContent = () => {
                const d = marker._tmgData;
                const lengthKm = d.latlng1 && d.latlng2 ? parseFloat((haversineDistance(d.latlng1.lat, d.latlng1.lng, d.latlng2.lat, d.latlng2.lng) / 1000).toFixed(2)) : 0.5;
                const coordBlock = (d.latlng1 || d.latlng2) ? `<div style="margin:6px 0;padding:6px;background:#f8fafc;border-radius:4px;text-align:left;font-size:0.7rem;color:#6b7280;"><label style="display:block;margin:4px 0;">Start: ${coordInputHtml('tmg-coord-input', d.latlng1?.lat, d.latlng1?.lng, 'data-pt="1"', 'width:100%;max-width:200px;padding:4px 6px;font-size:0.75rem;border:1px solid #cbd5e1;border-radius:4px;')}</label><label style="display:block;margin:4px 0;">End: ${coordInputHtml('tmg-coord-input', d.latlng2?.lat, d.latlng2?.lng, 'data-pt="2"', 'width:100%;max-width:200px;padding:4px 6px;font-size:0.75rem;border:1px solid #cbd5e1;border-radius:4px;')}</label></div>` : '';
                const addPointFrontlineBtn = def.id === 'scalloped'
                    ? `<button type="button" class="single-tmg-add-point-btn" style="margin:4px 4px 0 0;cursor:pointer;padding:4px 10px;font-size:0.75rem;border-radius:6px;border:1px solid #cbd5e1;background:#e0f2fe;">${typeof t === 'function' ? t('tmg-frontline-add-point') : 'Add point'}</button><br>`
                    : '';
                const defaultTmgTitle = getTmgLabel(def);
                return `
                <div style="text-align:center;">
                    <div class="map-popup-header-bar">${mapPopupCloseButtonHtml()}</div>
                    ${getFeatureDisplayNameInputHtml('tmg-display-name-input', d.displayName, defaultTmgTitle)}
                    ${coordBlock}
                    ${addPointFrontlineBtn}
                    ${getTmgSelectTypeHtml(d)}
                    <div style="margin:6px 0;font-size:0.75rem;color:#6b7280;">Length (km): <input type="number" class="tmg-length-input" min="0.1" max="50" value="${lengthKm}" step="0.1" style="width:48px;padding:2px 4px;font-size:0.8rem;"></div>
                    <div dir="ltr" style="font-size:0.7rem;color:#94a3b8;unicode-bidi:isolate;">≈ ${formatApproxAlternateDistanceFromKm(lengthKm)}</div>
                    <button class="turn-tmg-btn" style="margin-top: 5px; margin-right: 4px; cursor: pointer;">Turn to here</button>
                    <span style="margin: 0 4px;"></span>
                    ${getDrawingRotateControlsHtml()}
                    <button class="tmg-size-btn" data-size="smaller" style="cursor: pointer;" title="Smaller">−</button>
                    <button class="tmg-size-btn" data-size="bigger" style="cursor: pointer; margin-left: 2px;" title="Bigger">+</button>
                    <br>
                    <button class="duplicate-tmg-btn" style="margin-right: 4px; cursor: pointer;">${typeof t === 'function' ? t('duplicate') : 'Duplicate'}</button>
                    <button class="remove-tmg-btn" style="margin-top: 5px; color: red; cursor: pointer;">${typeof t === 'function' ? t('remove-graphic') : 'Remove Graphic'}</button>
                </div>
            `;
            };
            marker._buildTmgPopupContent = buildSingleTmgPopupContent;
            marker.bindPopup(buildSingleTmgPopupContent());
            marker.on('popupclose', () => removeTmgResizeHandle());
            marker.on('popupopen', () => {
                marker.setPopupContent(buildSingleTmgPopupContent());
                scheduleTmgPopupBind(() => {
                    if (!def.pointSymbol) {
                        createTmgSelectionBox(marker, marker._layerId);
                    }
                    bindSingleTmgPopupHandlers(marker, buildSingleTmgPopupContent, def);
                });
            });
            /* caller adds via addToActiveLayer */
        }
        return marker;
    }
    // Expose helpers needed by free_draw_signature.js
    window.getActiveLayer = getActiveLayer;
    window.createLayer = createLayer;
    window.getAllLayerElements = getAllElements;
    window.getCurrentDrawLinePolyline = function () { return drawLinePolyline; };
    window.removeFromLayer = (el) => removeFromLayer(el);

    // Inject CSS once so .scalloped-drawing-active disables pointer events on circle markers
    (function () {
        const s = document.createElement('style');
        s.textContent = '.scalloped-drawing-active .leaflet-marker-icon, .scalloped-drawing-active .leaflet-marker-shadow { pointer-events: none !important; }';
        document.head.appendChild(s);
    })();

    function setScallopedDrawingIntercept(active) {
        map.getContainer().classList.toggle('scalloped-drawing-active', !!active);
    }

    // Programmatically switch to line mode with a specific TMG type and color
    window.selectTmgType = function (typeId, color) {
        if (!tmgGrid) return;
        const btn = tmgGrid.querySelector('.tmg-btn[data-tmg-id="' + typeId + '"]');
        if (!btn) return;
        tmgGrid.querySelectorAll('.tmg-btn').forEach(b => b.classList.remove('active'));
        selectedTmgType = typeId;
        tmgPoints = [];
        btn.classList.add('active');

        // Set line color if provided
        if (color) {
            const colorBtn = lineManager.querySelector('.line-color-btn[data-color="' + color + '"]');
            if (colorBtn) {
                lineManager.querySelectorAll('.line-color-btn').forEach(b => b.classList.remove('active'));
                colorBtn.classList.add('active');
            }
            syncTmgPreviewColor();
        }

        // Switch to line mode if not already (handler calls setScallopedDrawingIntercept(false))
        if (currentMode !== 'line') {
            modeSelect.value = 'line';
            modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }

        // Enable intercept AFTER mode change so handler doesn't cancel it
        if (typeId === 'scalloped') setScallopedDrawingIntercept(true);

        if (instructionText) {
            const def = TACTICAL_GRAPHICS.find(d => d.id === typeId);
            instructionText.innerText = def ? t(instPlaceTmgKeyForTypeId(def.id), getTmgLabel(def)) : t('inst-line-draw');
        }
    };

    // Helper used by free_draw_sig workflow to place recognized tactical symbol on each map click
    window.placeFreeDrawSignatureTmg = function (latlng, typeId, affiliation) {
        if (!latlng || !typeId) return;
        const def = TACTICAL_GRAPHICS.find(d => d.id === typeId);
        if (!def) return;

        // Snap circle-X markers outside obstacles so they sit on the boundary
        if (typeId === 'circle-x') {
            latlng = snapPointOutsideObstacles(latlng);
        }

        const color = (affiliation === 'enemy' || window.freeDrawSignatureAffiliation === 'enemy') ? '#ef4444' : '#3b82f6';
        const strokeWidth = getTmgStrokeWidth();

        // for a point symbol we can use start/end at same location (createTmgLayer handles pointSymbol)
        const symbolMarker = createTmgLayer(latlng, latlng, typeId, color, false, false, { strokeWidth });
        if (symbolMarker) {
            const sessionId = window.freeDrawSignatureSessionId;
            if (sessionId) {
                symbolMarker._tmgData = symbolMarker._tmgData || {};
                symbolMarker._tmgData.sessionId = sessionId;
            }
            addToActiveLayer(symbolMarker);
        }
    };
    function updateTmgLayer(marker) {
        const d = marker._tmgData;
        if (!d) return;
        if (d.catkUnified && marker._catkGroup?._tmgData) {
            syncCatkHeadMarkerToPoints(marker, marker._catkGroup._tmgData);
            return;
        }
        const opts = getTmgIconOptions(d.latlng1, d.latlng2, d.typeId, d.color, d.useBodyOnly, { filled: d.filled, dashed: d.dashed, strokeWidth: d.strokeWidth, catkHeadSolo: d.catkHeadSolo });
        if (opts) marker.setIcon(L.divIcon(opts));
    }

    function tmgMidpoint(latlng1, latlng2) {
        return L.latLng(
            (latlng1.lat + latlng2.lat) / 2,
            (latlng1.lng + latlng2.lng) / 2
        );
    }

    let activeResizeHandle = null;
    let activeTmgSelectionBox = null;
    let activePlainLineEndpointHandles = null;
    /** After dragging a map overlay handle, mouseup often lands on the map/tiles (not the icon), so Leaflet fires map click — swallow the next one (e.g. Line mode was adding drawLinePolyline). */
    let suppressNextMapClickAfterOverlayHandleDrag = false;
    const OVERLAY_HANDLE_SUPPRESS_FALLBACK_MS = 550;
    function armSuppressMapClickFromOverlayHandle() {
        suppressNextMapClickAfterOverlayHandleDrag = true;
    }
    /** If the stray click never fired (e.g. released on the icon), clear so the next real map click works. */
    function scheduleClearSuppressIfOverlayHandleClickMissed() {
        window.setTimeout(() => {
            if (suppressNextMapClickAfterOverlayHandleDrag) suppressNextMapClickAfterOverlayHandleDrag = false;
        }, OVERLAY_HANDLE_SUPPRESS_FALLBACK_MS);
    }

    function createTmgResizeHandle(latlng, onDragEnd, layerId) {
        if (activeResizeHandle) {
            const layer = layers.find(l => l.id === activeResizeHandle._layerId);
            if (layer) layer.group.removeLayer(activeResizeHandle);
            activeResizeHandle = null;
        }
        const handleIcon = L.divIcon({
            className: 'tmg-resize-handle',
            html: '<div class="tmg-resize-handle-inner"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });
        const handle = L.marker(latlng, { icon: handleIcon, draggable: true });
        handle._layerId = layerId;
        handle.on('dragstart', () => armSuppressMapClickFromOverlayHandle());
        handle.on('dragend', () => {
            armSuppressMapClickFromOverlayHandle();
            onDragEnd(handle.getLatLng());
            scheduleClearSuppressIfOverlayHandleClickMissed();
        });
        const layer = layers.find(l => l.id === layerId);
        if (layer) layer.group.addLayer(handle);
        activeResizeHandle = handle;
        return handle;
    }

    /** TMG handles are often on layer.group, not map — map.hasLayer is false; remove from map or any user layer group. */
    function removeOverlayFromMapOrGroups(ly) {
        if (!ly) return;
        if (map.hasLayer(ly)) {
            map.removeLayer(ly);
            return;
        }
        for (let i = 0; i < layers.length; i++) {
            const lg = layers[i].group;
            if (lg && lg.hasLayer(ly)) {
                lg.removeLayer(ly);
                return;
            }
        }
    }

    function removePlainLineEndpointHandles() {
        if (activePlainLineEndpointHandles) {
            (activePlainLineEndpointHandles.handles || []).forEach(h => removeOverlayFromMapOrGroups(h));
            activePlainLineEndpointHandles = null;
        }
    }

    function removeTmgResizeHandle() {
        removePlainLineEndpointHandles();
        if (activeResizeHandle) {
            const layer = layers.find(l => l.id === activeResizeHandle._layerId);
            if (layer) layer.group.removeLayer(activeResizeHandle);
            activeResizeHandle = null;
        }
        if (activeTmgSelectionBox) {
            if (activeTmgSelectionBox.polygon) removeOverlayFromMapOrGroups(activeTmgSelectionBox.polygon);
            if (activeTmgSelectionBox.guideLine) removeOverlayFromMapOrGroups(activeTmgSelectionBox.guideLine);
            (activeTmgSelectionBox.handles || []).forEach(h => removeOverlayFromMapOrGroups(h));
            activeTmgSelectionBox = null;
        }
    }

    function toLatLngPoint(p) {
        if (p == null) return null;
        if (typeof p.lat === 'number' && typeof p.lng === 'number') return L.latLng(p.lat, p.lng);
        if (Array.isArray(p) && p.length >= 2) return L.latLng(p[0], p[1]);
        return L.latLng(p);
    }

    /** First continuous ring + setter that preserves Leaflet flat vs nested (multi) polyline shape. */
    function getPolylineFlatRingAndSetter(polyline) {
        const raw = polyline.getLatLngs?.() || [];
        if (!raw.length) return { flat: [], apply: () => {} };
        const first = raw[0];
        if (first && typeof first.lat === 'number') {
            const flat = raw.map(toLatLngPoint).filter(Boolean);
            return {
                flat,
                apply: (nextFlat) => polyline.setLatLngs(nextFlat.map((p) => L.latLng(p.lat, p.lng)))
            };
        }
        if (Array.isArray(first) && first.length) {
            const flat = first.map(toLatLngPoint).filter(Boolean);
            const rest = raw.slice(1);
            return {
                flat,
                apply: (nextFlat) => {
                    const ring = nextFlat.map((p) => L.latLng(p.lat, p.lng));
                    polyline.setLatLngs(rest.length ? [ring, ...rest] : [ring]);
                }
            };
        }
        const flat = raw.map(toLatLngPoint).filter(Boolean);
        return {
            flat,
            apply: (nextFlat) => polyline.setLatLngs(nextFlat.map((p) => L.latLng(p.lat, p.lng)))
        };
    }

    function getPolylineFlatLatLngs(polyline) {
        return getPolylineFlatRingAndSetter(polyline).flat;
    }

    function syncPlainLineEndpointHandlePositions(polyline) {
        if (!activePlainLineEndpointHandles || activePlainLineEndpointHandles.polyline !== polyline) return;
        const flat = getPolylineFlatLatLngs(polyline);
        if (flat.length < 2) return;
        const [h0, h1] = activePlainLineEndpointHandles.handles;
        if (h0) h0.setLatLng(flat[0]);
        if (h1) h1.setLatLng(flat[flat.length - 1]);
    }

    function createPlainLineEndpointHandles(polyline) {
        removePlainLineEndpointHandles();
        const { flat } = getPolylineFlatRingAndSetter(polyline);
        if (flat.length < 2 || !map) return;
        const endpointHandleIcon = L.divIcon({
            className: 'tmg-resize-handle tmg-endpoint-handle',
            html: '<div class="tmg-resize-handle-inner"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        const updateEnd = (which, newLatlng, isFinal) => {
            const { flat: pts, apply: setRing } = getPolylineFlatRingAndSetter(polyline);
            if (pts.length < 2) return;
            const next = pts.map((p) => L.latLng(p.lat, p.lng));
            const idx = which === 0 ? 0 : next.length - 1;
            next[idx] = L.latLng(newLatlng.lat, newLatlng.lng);
            setRing(next);
            if (polyline._geoType === 'freehand' && polyline._geoData) {
                polyline._geoData.points = [...next];
                syncGeoShapeHandlesToGeometry(polyline, 'freehand');
            }
            syncPlainLineEndpointHandlePositions(polyline);
            if (isFinal) {
                suppressNextMapClickAfterOverlayHandleDrag = true;
                if (polyline.isPopupOpen && polyline.isPopupOpen()) {
                    if (polyline._geoType === 'freehand' && polyline._geoData) {
                        polyline.setPopupContent(buildGeoPopupContent(polyline, 'freehand', polyline._geoData));
                        bindGeoPopupHandlers(polyline, 'freehand');
                    } else {
                        polyline.setPopupContent(buildLinePopupContent(polyline));
                        bindLinePopupHandlers(polyline);
                    }
                }
                scheduleSaveToStorage();
            }
        };
        const handleMarkerOpts = { icon: endpointHandleIcon, draggable: true, pane: 'tmgSelectionPane', zIndexOffset: 1000, bubblingMouseEvents: false };
        const h0 = L.marker(flat[0], handleMarkerOpts);
        const h1 = L.marker(flat[flat.length - 1], handleMarkerOpts);
        h0.on('dragstart', () => armSuppressMapClickFromOverlayHandle());
        h1.on('dragstart', () => armSuppressMapClickFromOverlayHandle());
        h0.on('drag', () => updateEnd(0, h0.getLatLng(), false));
        h0.on('dragend', () => {
            updateEnd(0, h0.getLatLng(), true);
            scheduleClearSuppressIfOverlayHandleClickMissed();
        });
        h1.on('drag', () => updateEnd(1, h1.getLatLng(), false));
        h1.on('dragend', () => {
            updateEnd(1, h1.getLatLng(), true);
            scheduleClearSuppressIfOverlayHandleClickMissed();
        });
        h0.addTo(map);
        h1.addTo(map);
        activePlainLineEndpointHandles = { polyline, handles: [h0, h1] };
    }

    function refreshCatkMultiPointSelectionBox(headMarker, catkGroup) {
        if (!activeTmgSelectionBox?.isCatk || activeTmgSelectionBox._marker !== headMarker) return;
        const data = catkGroup._tmgData;
        const d = headMarker._tmgData;
        if (!data?.points || !d) return;
        const dragLockHandleIndex = Number.isInteger(activeTmgSelectionBox.dragLockHandleIndex)
            ? activeTmgSelectionBox.dragLockHandleIndex
            : -1;
        const editParams = normalizeCatkArrowParams(data.arrowParams) || catkEnsureLockedArrowParams(data);
        const isLockedLegacy = !data.arrowParams && !!editParams;
        // Use parametric refresh only for simple arrows without legacy bends.
        const useParametricHandles = editParams && !data.preserveLegacyPoints;
        if (useParametricHandles) {
            const overlay = catkArrowOverlayLatLngs(editParams);
            if (overlay?.length && activeTmgSelectionBox.polygon) activeTmgSelectionBox.polygon.setLatLngs(overlay);
            const handles = catkArrowEditHandleLatLngs(editParams);
            if (!handles) return;
            const markers = activeTmgSelectionBox.handles || [];
            if (markers[0] && dragLockHandleIndex !== 0) markers[0].setLatLng(handles.tip);
            if (markers[1] && dragLockHandleIndex !== 1) markers[1].setLatLng(handles.neck);
            const firstTailPoint = (isLockedLegacy && data.points?.[1]) ? L.latLng(data.points[1].lat, data.points[1].lng) : null;
            const tailHandleLatLng = firstTailPoint || handles.tail;
            if (markers[2] && dragLockHandleIndex !== 2) markers[2].setLatLng(tailHandleLatLng);
            const guideTailLatLng = firstTailPoint || handles.tailCenter;
            if (activeTmgSelectionBox.guideLine) activeTmgSelectionBox.guideLine.setLatLngs([handles.neckCenter, guideTailLatLng]);
            return;
        }
        const corners = getCatkMultiPointBoundingLatLngs(data.points, d.strokeWidth);
        if (corners) activeTmgSelectionBox.polygon.setLatLngs(corners);
        const pts = data.points;
        const idxList = activeTmgSelectionBox.catkPointIndices || [];
        // Update point handles (skip the last one if it's the neck handle)
        const pointHandleCount = idxList.length;
        (activeTmgSelectionBox.handles || []).slice(0, pointHandleCount).forEach((h, j) => {
            const pi = idxList[j];
            if (h && pi != null && pts[pi]) h.setLatLng(pts[pi]);
        });
        // Update neck handle position for legacy arrows
        if (activeTmgSelectionBox.neckHandle && data.lockedArrowParams) {
            const lockedParams = normalizeCatkArrowParams(data.lockedArrowParams);
            if (lockedParams) {
                const neckHandleLatLngs = catkArrowEditHandleLatLngs(lockedParams);
                if (neckHandleLatLngs?.neck && !activeTmgSelectionBox.dragLockLegacyNeck) {
                    activeTmgSelectionBox.neckHandle.setLatLng(neckHandleLatLngs.neck);
                }
            }
        }
    }

    function catkSelectionHandleIcon(extraClass, size = 22) {
        return L.divIcon({
            className: `tmg-resize-handle ${extraClass}`,
            html: '<div class="tmg-resize-handle-inner"></div>',
            iconSize: [size, size],
            iconAnchor: [Math.round(size / 2), Math.round(size / 2)]
        });
    }

    function createCatkMultiPointSelectionBox(headMarker, catkGroup, layerId) {
        removeTmgResizeHandle();
        const data = catkGroup._tmgData;
        const d = headMarker._tmgData;
        if (!data?.points || data.points.length < 3 || !d) return;

        const def = TACTICAL_GRAPHICS.find(x => x.id === d.typeId);
        if (!def || def.pointSymbol) return;

        if (!data.arrowParams && !data.preserveLegacyPoints && (data.points?.length ?? 0) <= 3) {
            const derived = catkDeriveArrowParamsFromLegacyPoints(data.points, data.strokeWidth ?? d.strokeWidth, data.arrowHeadScale);
            if (derived) {
                data.arrowParams = derived;
                catkApplyArrowParamsToData(data);
                syncCatkHeadMarkerToPoints(headMarker, data);
            }
        }
        const editParams = normalizeCatkArrowParams(data.arrowParams) || catkEnsureLockedArrowParams(data);
        const isLockedLegacy = !data.arrowParams && !!editParams;
        // Use parametric handles only for simple arrows without legacy bends.
        // When preserveLegacyPoints is set, the user clicked multiple tail points
        // that should all be editable, so fall through to show handles for each point.
        const useParametricHandles = editParams && !data.preserveLegacyPoints;
        if (useParametricHandles) {
            const overlay = catkArrowOverlayLatLngs(editParams);
            const handleLatLngs = catkArrowEditHandleLatLngs(editParams);
            if (!overlay || !handleLatLngs) return;

            const polygon = L.polygon(overlay, {
                color: '#ef4444',
                weight: 2,
                dashArray: '7,5',
                fill: false,
                interactive: false,
                className: 'tmg-selection-border',
                pane: 'tmgSelectionPane'
            });
            polygon.addTo(map);

            const initialTailGuide = (isLockedLegacy && data.points?.[1])
                ? L.latLng(data.points[1].lat, data.points[1].lng)
                : handleLatLngs.tailCenter;
            const guideLine = L.polyline([handleLatLngs.neckCenter, initialTailGuide], {
                color: '#ef4444',
                weight: 2,
                dashArray: '6,4',
                interactive: false,
                pane: 'tmgSelectionPane'
            });
            guideLine.addTo(map);

            let _paramDragRafPending = false;
            let _paramDragLatest = null;
            const applyArrowParamUpdate = (nextParams, isFinal) => {
                const normalized = normalizeCatkArrowParams(nextParams);
                if (!normalized) return;
                const doUpdate = () => {
                    if (data.arrowParams) {
                        data.arrowParams = normalized;
                        catkApplyArrowParamsToData(data);
                    } else {
                        data.lockedArrowParams = normalized;
                        data.legacyBodyWidthKm = normalized.bodyWidthKm;
                        // Only update tip (points[0]) - points[1] stays fixed as the turning point
                        if (data.points?.length) {
                            data.points[0] = L.latLng(normalized.tip.lat, normalized.tip.lng);
                        }
                    }
                    _skipObstacleRouting = !isFinal;
                    syncCatkHeadMarkerToPoints(headMarker, data);
                    _skipObstacleRouting = false;
                    refreshCatkMultiPointSelectionBox(headMarker, catkGroup);
                    if (isFinal) scheduleSaveToStorage();
                };
                if (isFinal) {
                    _paramDragRafPending = false;
                    doUpdate();
                    return;
                }
                _paramDragLatest = doUpdate;
                if (!_paramDragRafPending) {
                    _paramDragRafPending = true;
                    requestAnimationFrame(() => {
                        _paramDragRafPending = false;
                        if (_paramDragLatest) { _paramDragLatest(); _paramDragLatest = null; }
                    });
                }
            };

            // Red tip handle: freely move the arrow tip position.
            // Dragging changes direction and length, but arrowhead SIZE stays the same.
            const tipHandle = L.marker(handleLatLngs.tip, {
                icon: catkSelectionHandleIcon('tmg-arrow-tip-handle', 24),
                draggable: true,
                pane: 'tmgSelectionPane',
                zIndexOffset: 1000,
                bubblingMouseEvents: false
            });
            const applyTipDragMove = (isFinal) => {
                const params = normalizeCatkArrowParams(data.arrowParams || data.lockedArrowParams);
                if (!params || !map) return;
                const requestedTip = tipHandle.getLatLng();
                
                // For multi-point arrows, points[1] is the turning point (where head meets body)
                const turningPoint = (data.points && data.points.length >= 2)
                    ? L.latLng(data.points[1].lat, data.points[1].lng)
                    : null;
                
                if (!turningPoint) {
                    // Simple arrow without multi-bend - use parametric neck
                    const handles = catkArrowEditHandleLatLngs(params);
                    if (!handles) return;
                    const newDirection = bearingDegrees(handles.neckCenter, requestedTip);
                    
                    // Keep arrowhead SIZE the same, only position changes
                    applyArrowParamUpdate({
                        ...params,
                        tip: requestedTip,
                        directionDeg: newDirection
                        // headLengthKm, neckOffsetKm, bodyWidthKm, headWidthKm all stay unchanged
                    }, isFinal);
                    return;
                }
                
                // Multi-bend arrow: tip moves freely, arrowhead SIZE stays constant
                const newDirection = bearingDegrees(turningPoint, requestedTip);
                
                // Only update tip position and direction - arrowhead proportions stay the same
                applyArrowParamUpdate({
                    ...params,
                    tip: requestedTip,
                    directionDeg: newDirection
                    // headLengthKm, neckOffsetKm, bodyWidthKm, headWidthKm all stay unchanged
                }, isFinal);
            };
            tipHandle.on('dragstart', () => {
                armSuppressMapClickFromOverlayHandle();
            });
            tipHandle.on('drag', () => applyTipDragMove(false));
            tipHandle.on('dragend', () => {
                armSuppressMapClickFromOverlayHandle();
                scheduleClearSuppressIfOverlayHandleClickMissed();
                applyTipDragMove(true);
            });

            // Yellow neck handle: one drag can update both neckOffset and bodyWidth.
            const neckHandle = L.marker(handleLatLngs.neck, {
                icon: catkSelectionHandleIcon('tmg-arrow-neck-handle', 22),
                draggable: true,
                pane: 'tmgSelectionPane',
                zIndexOffset: 1000,
                bubblingMouseEvents: false
            });
            let neckDragSession = null;
            const applyNeckDrag = (isFinal) => {
                if (!neckDragSession) {
                    neckDragSession = catkBeginNeckHandleDragSession(data.arrowParams || data.lockedArrowParams, neckHandle.getLatLng());
                }
                const nextParams = catkArrowParamsFromNeckDragSession(neckDragSession, neckHandle.getLatLng());
                if (!nextParams) return;
                applyArrowParamUpdate(nextParams, isFinal);
            };
            neckHandle.on('dragstart', () => {
                armSuppressMapClickFromOverlayHandle();
                if (activeTmgSelectionBox?.isCatk && activeTmgSelectionBox._marker === headMarker) {
                    activeTmgSelectionBox.dragLockHandleIndex = 1;
                }
                neckDragSession = catkBeginNeckHandleDragSession(data.arrowParams || data.lockedArrowParams, neckHandle.getLatLng());
            });
            neckHandle.on('drag', () => applyNeckDrag(false));
            neckHandle.on('dragend', () => {
                armSuppressMapClickFromOverlayHandle();
                scheduleClearSuppressIfOverlayHandleClickMissed();
                applyNeckDrag(true);
                neckDragSession = null;
                if (activeTmgSelectionBox?.isCatk && activeTmgSelectionBox._marker === headMarker) {
                    activeTmgSelectionBox.dragLockHandleIndex = -1;
                }
            });

            // Tail handle: drag on the axis to change only the body length behind the neck.
            const initialTailHandle = (isLockedLegacy && data.points?.[1])
                ? L.latLng(data.points[1].lat, data.points[1].lng)
                : handleLatLngs.tail;
            const tailHandle = L.marker(initialTailHandle, {
                icon: catkSelectionHandleIcon('tmg-arrow-tail-handle', 22),
                draggable: true,
                pane: 'tmgSelectionPane',
                zIndexOffset: 1000,
                bubblingMouseEvents: false
            });
            tailHandle.on('dragstart', () => armSuppressMapClickFromOverlayHandle());
            tailHandle.on('drag', () => {
                if (data.arrowParams) {
                    applyArrowParamUpdate(catkArrowParamsWithTailFromCursor(data.arrowParams, tailHandle.getLatLng()), false);
                    return;
                }
                const params = normalizeCatkArrowParams(data.lockedArrowParams);
                const handles = catkArrowEditHandleLatLngs(params);
                if (!params || !handles) return;
                const nextTail = tailHandle.getLatLng();
                if (data.points?.length >= 2) data.points[1] = L.latLng(nextTail.lat, nextTail.lng);
                const tailLengthKm = Math.max(CATK_ARROW_MIN_TAIL_LENGTH_KM, haversineDistance(handles.neckCenter.lat, handles.neckCenter.lng, nextTail.lat, nextTail.lng) / 1000);
                applyArrowParamUpdate({ ...params, tailLengthKm }, false);
            });
            tailHandle.on('dragend', () => {
                armSuppressMapClickFromOverlayHandle();
                scheduleClearSuppressIfOverlayHandleClickMissed();
                if (data.arrowParams) {
                    applyArrowParamUpdate(catkArrowParamsWithTailFromCursor(data.arrowParams, tailHandle.getLatLng()), true);
                    return;
                }
                const params = normalizeCatkArrowParams(data.lockedArrowParams);
                const handles = catkArrowEditHandleLatLngs(params);
                if (!params || !handles) return;
                const nextTail = tailHandle.getLatLng();
                if (data.points?.length >= 2) data.points[1] = L.latLng(nextTail.lat, nextTail.lng);
                const tailLengthKm = Math.max(CATK_ARROW_MIN_TAIL_LENGTH_KM, haversineDistance(handles.neckCenter.lat, handles.neckCenter.lng, nextTail.lat, nextTail.lng) / 1000);
                applyArrowParamUpdate({ ...params, tailLengthKm }, true);
            });

            tipHandle.addTo(map);
            neckHandle.addTo(map);
            tailHandle.addTo(map);
            activeTmgSelectionBox = {
                polygon,
                guideLine,
                handles: [tipHandle, neckHandle, tailHandle],
                _layerId: layerId,
                _marker: headMarker,
                _useEndpointHandles: false,
                _target: map,
                isCatk: true,
                catkGroup
            };
            return;
        }

        const corners = getCatkMultiPointBoundingLatLngs(data.points, d.strokeWidth);
        if (!corners || corners.length < 4) return;

        const polygon = L.polygon(corners, {
            color: '#2563eb',
            weight: 3,
            dashArray: '8, 6',
            fill: false,
            interactive: false,
            className: 'tmg-selection-border',
            pane: 'tmgSelectionPane'
        });
        polygon.addTo(map);

        // Use different handle icons based on position:
        // - Tip (index 0): red handle
        // - Tail end (last index): orange handle
        // - Intermediate bend points: yellow/endpoint handle
        const tipHandleIcon = L.divIcon({
            className: 'tmg-resize-handle tmg-arrow-tip-handle',
            html: '<div class="tmg-resize-handle-inner"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        const tailHandleIcon = L.divIcon({
            className: 'tmg-resize-handle tmg-arrow-tail-handle',
            html: '<div class="tmg-resize-handle-inner"></div>',
            iconSize: [22, 22],
            iconAnchor: [11, 11]
        });
        const bendHandleIcon = L.divIcon({
            className: 'tmg-resize-handle tmg-endpoint-handle',
            html: '<div class="tmg-resize-handle-inner"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        const pts = data.points;
        const autoJ = data.catkAutoJunction && pts.length === 3;
        const pointIndices = autoJ ? [0, 2] : pts.map((_, i) => i);

        // Helper to pick the right icon for each point
        const getHandleIconForIndex = (idx) => {
            if (idx === 0) return tipHandleIcon;
            if (idx === pts.length - 1) return tailHandleIcon;
            return bendHandleIcon;
        };

        let _pointDragRafPending = false;
        let _pointDragLatest = null;
        const applyCatkPointDrag = (pointIndex, newLatlng, isFinal) => {
            // Update point positions (lightweight — always immediate)
            if (pointIndex === 0 && data.lockedArrowParams) {
                const lockedParams = normalizeCatkArrowParams(data.lockedArrowParams);
                if (lockedParams && pts.length >= 2) {
                    const anchorPoint = L.latLng(pts[1].lat, pts[1].lng);
                    const newDirection = bearingDegrees(anchorPoint, newLatlng);
                    pts[0] = L.latLng(newLatlng.lat, newLatlng.lng);
                    data.lockedArrowParams = normalizeCatkArrowParams({
                        ...lockedParams,
                        tip: newLatlng,
                        directionDeg: newDirection
                    });
                } else {
                    pts[pointIndex] = L.latLng(newLatlng.lat, newLatlng.lng);
                }
            } else {
                pts[pointIndex] = L.latLng(newLatlng.lat, newLatlng.lng);
            }

            if (data.catkAutoJunction && pts.length === 3 && (pointIndex === 0 || pointIndex === 2)) {
                pts[1] = catkInterpOnTailAxis(pts[2], pts[0], CATK_AUTO_JUNCTION_T);
            }

            const doSync = () => {
                _skipObstacleRouting = !isFinal;
                syncCatkHeadMarkerToPoints(headMarker, data);
                _skipObstacleRouting = false;
                refreshCatkMultiPointSelectionBox(headMarker, catkGroup);
                if (isFinal) scheduleSaveToStorage();
            };
            if (isFinal) {
                _pointDragRafPending = false;
                doSync();
                return;
            }
            _pointDragLatest = doSync;
            if (!_pointDragRafPending) {
                _pointDragRafPending = true;
                requestAnimationFrame(() => {
                    _pointDragRafPending = false;
                    if (_pointDragLatest) { _pointDragLatest(); _pointDragLatest = null; }
                });
            }
        };

        const handles = pointIndices.map((pointIndex) => {
            const handle = L.marker(pts[pointIndex], { icon: getHandleIconForIndex(pointIndex), draggable: true, pane: 'tmgSelectionPane', zIndexOffset: 1000 });
            handle._catkPointIndex = pointIndex;
            handle.on('dragstart', () => {
                handle._startLatlng = handle.getLatLng();
                armSuppressMapClickFromOverlayHandle();
            });
            handle.on('drag', () => applyCatkPointDrag(pointIndex, handle.getLatLng(), false));
            handle.on('dragend', () => {
                armSuppressMapClickFromOverlayHandle();
                applyCatkPointDrag(pointIndex, handle.getLatLng(), true);
                scheduleClearSuppressIfOverlayHandleClickMissed();
            });
            handle.addTo(map);
            return handle;
        });

        // Add yellow neck handle for legacy arrows to control head/body width
        let neckHandle = null;
        const lockedParams = normalizeCatkArrowParams(data.lockedArrowParams);
        if (lockedParams && pts.length >= 2) {
            const neckHandleIcon = L.divIcon({
                className: 'tmg-resize-handle tmg-arrow-neck-handle',
                html: '<div class="tmg-resize-handle-inner"></div>',
                iconSize: [22, 22],
                iconAnchor: [11, 11]
            });
            // Position neck handle at the body/head transition point
            const neckHandleLatLngs = catkArrowEditHandleLatLngs(lockedParams);
            if (neckHandleLatLngs?.neck) {
                neckHandle = L.marker(neckHandleLatLngs.neck, {
                    icon: neckHandleIcon,
                    draggable: true,
                    pane: 'tmgSelectionPane',
                    zIndexOffset: 1000,
                    bubblingMouseEvents: false
                });
                let legacyNeckDragSession = null;
                let _legacyNeckRafPending = false;
                let _legacyNeckLatest = null;
                const applyLegacyNeckDrag = (isFinal) => {
                    if (!legacyNeckDragSession) {
                        legacyNeckDragSession = catkBeginNeckHandleDragSession(data.lockedArrowParams, neckHandle.getLatLng());
                    }
                    const nextParams = catkArrowParamsFromNeckDragSession(legacyNeckDragSession, neckHandle.getLatLng());
                    if (!nextParams) return;
                    const doSync = () => {
                        data.lockedArrowParams = nextParams;
                        data.legacyBodyWidthKm = nextParams.bodyWidthKm;
                        _skipObstacleRouting = !isFinal;
                        syncCatkHeadMarkerToPoints(headMarker, data);
                        _skipObstacleRouting = false;
                        refreshCatkMultiPointSelectionBox(headMarker, catkGroup);
                        if (isFinal) scheduleSaveToStorage();
                    };
                    if (isFinal) {
                        _legacyNeckRafPending = false;
                        doSync();
                        return;
                    }
                    _legacyNeckLatest = doSync;
                    if (!_legacyNeckRafPending) {
                        _legacyNeckRafPending = true;
                        requestAnimationFrame(() => {
                            _legacyNeckRafPending = false;
                            if (_legacyNeckLatest) { _legacyNeckLatest(); _legacyNeckLatest = null; }
                        });
                    }
                };
                neckHandle.on('dragstart', () => {
                    armSuppressMapClickFromOverlayHandle();
                    if (activeTmgSelectionBox?.isCatk && activeTmgSelectionBox._marker === headMarker) {
                        activeTmgSelectionBox.dragLockLegacyNeck = true;
                    }
                    legacyNeckDragSession = catkBeginNeckHandleDragSession(data.lockedArrowParams, neckHandle.getLatLng());
                });
                neckHandle.on('drag', () => applyLegacyNeckDrag(false));
                neckHandle.on('dragend', () => {
                    armSuppressMapClickFromOverlayHandle();
                    scheduleClearSuppressIfOverlayHandleClickMissed();
                    applyLegacyNeckDrag(true);
                    legacyNeckDragSession = null;
                    if (activeTmgSelectionBox?.isCatk && activeTmgSelectionBox._marker === headMarker) {
                        activeTmgSelectionBox.dragLockLegacyNeck = false;
                    }
                });
                neckHandle.addTo(map);
                handles.push(neckHandle);
            }
        }

        activeTmgSelectionBox = {
            polygon,
            handles,
            neckHandle,
            _layerId: layerId,
            _marker: headMarker,
            _useEndpointHandles: false,
            _target: map,
            isCatk: true,
            catkGroup,
            catkPointIndices: pointIndices.slice()
        };
    }

    function createTmgSelectionBox(marker, layerId, parentGroupForSnap) {
        if (marker._catkGroup && marker._catkGroup._tmgData?.isCatkMultiPoint) {
            createCatkMultiPointSelectionBox(marker, marker._catkGroup, layerId);
            return;
        }
        removeTmgResizeHandle();
        const snapExclude = new Set([marker]);
        if (parentGroupForSnap) snapExclude.add(parentGroupForSnap);
        const d = marker._tmgData;
        if (!d || !d.latlng1 || !d.latlng2) return;
        const def = TACTICAL_GRAPHICS.find(x => x.id === d.typeId);
        if (!def || def.pointSymbol) return;

        const corners = getTmgBoundingBoxCorners(d.latlng1, d.latlng2, d.typeId, d.strokeWidth);
        if (!corners || corners.length < 4) return;

        const polygon = L.polygon(corners, {
            color: '#2563eb',
            weight: 3,
            dashArray: '8, 6',
            fill: false,
            interactive: false,
            className: 'tmg-selection-border',
            pane: 'tmgSelectionPane'
        });
        polygon.addTo(map);

        const handleIcon = L.divIcon({
            className: 'tmg-resize-handle',
            html: '<div class="tmg-resize-handle-inner"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });

        // Line graphics: endpoint handles (tail + arrow) so user can drag either end to change length/direction
        const useEndpointHandles = !def.pointSymbol;
        const handlePositions = useEndpointHandles ? [d.latlng1, d.latlng2] : corners;
        const endpointHandleIcon = L.divIcon({
            className: 'tmg-resize-handle tmg-endpoint-handle',
            html: '<div class="tmg-resize-handle-inner"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });
        const handleIconToUse = useEndpointHandles ? endpointHandleIcon : handleIcon;

        const updateFromHandle = (handleIdx, newLatlng, oldLatlng, _isFinal) => {
            if (useEndpointHandles) {
                if (handleIdx === 0) {
                    d.latlng1 = L.latLng(newLatlng.lat, newLatlng.lng);
                } else {
                    d.latlng2 = L.latLng(newLatlng.lat, newLatlng.lng);
                }
            } else {
                const center = tmgMidpoint(d.latlng1, d.latlng2);
                const pCenter = map.latLngToLayerPoint(center);
                const pOld = map.latLngToLayerPoint(oldLatlng || handlePositions[handleIdx]);
                const pNew = map.latLngToLayerPoint(newLatlng);
                const oldDist = Math.hypot(pOld.x - pCenter.x, pOld.y - pCenter.y) || 1;
                const newDist = Math.hypot(pNew.x - pCenter.x, pNew.y - pCenter.y);
                const scale = Math.max(0.2, newDist / oldDist);
                d.latlng1 = L.latLng(center.lat + (d.latlng1.lat - center.lat) * scale, center.lng + (d.latlng1.lng - center.lng) * scale);
                d.latlng2 = L.latLng(center.lat + (d.latlng2.lat - center.lat) * scale, center.lng + (d.latlng2.lng - center.lng) * scale);
            }
            marker.setLatLng(tmgMidpoint(d.latlng1, d.latlng2));
            updateTmgLayer(marker);
            refreshTmgSelectionBox(marker, layerId);
        };

        const handles = handlePositions.map((latlng, i) => {
            const handle = L.marker(latlng, {
                icon: handleIconToUse,
                draggable: true,
                pane: 'tmgSelectionPane',
                zIndexOffset: 1000,
                bubblingMouseEvents: false
            });
            handle._handleIdx = i;
            handle._startLatlng = null;
            handle.on('dragstart', () => {
                handle._startLatlng = handle.getLatLng();
                armSuppressMapClickFromOverlayHandle();
            });
            handle.on('drag', () => {
                let ll = handle.getLatLng();
                if (useEndpointHandles) {
                    ll = snapTmgEndpointHandleLatLng(ll, snapExclude);
                    handle.setLatLng(ll);
                }
                updateFromHandle(i, ll, handle._startLatlng, false);
            });
            handle.on('dragend', () => {
                armSuppressMapClickFromOverlayHandle();
                let ll = handle.getLatLng();
                if (useEndpointHandles) {
                    ll = snapTmgEndpointHandleLatLng(ll, snapExclude);
                    handle.setLatLng(ll);
                }
                updateFromHandle(i, ll, handle._startLatlng, true);
                scheduleSaveToStorage();
                scheduleClearSuppressIfOverlayHandleClickMissed();
            });
            handle.addTo(map);
            return handle;
        });

        activeTmgSelectionBox = { polygon, handles, _layerId: layerId, _marker: marker, _useEndpointHandles: useEndpointHandles, _target: map };
    }

    /** Axis-aligned (screen-space) bounds around all TMG segments in a group — for L-shaped multi-segment lines. */
    function getMultiSegmentTmgGroupAabbLatLngs(group) {
        const data = group._tmgData;
        const segs = data?.segments;
        if (!segs?.length || !map) return null;
        const typeId = data.typeId;
        const defaultSw = data.strokeWidth ?? 4;
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const seg of segs) {
            const d = seg._tmgData;
            if (!d?.latlng1 || !d?.latlng2) continue;
            const sw = d.strokeWidth ?? defaultSw;
            const corners = getTmgBoundingBoxCorners(d.latlng1, d.latlng2, d.typeId || typeId, sw);
            if (!corners) continue;
            corners.forEach((ll) => {
                const p = map.latLngToLayerPoint(ll);
                minX = Math.min(minX, p.x);
                maxX = Math.max(maxX, p.x);
                minY = Math.min(minY, p.y);
                maxY = Math.max(maxY, p.y);
            });
        }
        if (!isFinite(minX)) return null;
        const pad = 6;
        return [
            map.layerPointToLatLng(L.point(minX - pad, minY - pad)),
            map.layerPointToLatLng(L.point(maxX + pad, minY - pad)),
            map.layerPointToLatLng(L.point(maxX + pad, maxY + pad)),
            map.layerPointToLatLng(L.point(minX - pad, maxY + pad))
        ];
    }

    function refreshMultiSegmentTmgGroupSelectionBox(group) {
        if (!activeTmgSelectionBox?.isSegmentGroup || activeTmgSelectionBox._group !== group) return;
        const corners = getMultiSegmentTmgGroupAabbLatLngs(group);
        if (corners?.length && activeTmgSelectionBox.polygon) {
            activeTmgSelectionBox.polygon.setLatLngs(corners);
        }
        const segs = group._tmgData?.segments;
        if (!segs?.length) return;
        const fd = segs[0]._tmgData;
        const ld = segs[segs.length - 1]._tmgData;
        const handles = activeTmgSelectionBox.handles || [];
        if (handles[0] && fd?.latlng1) handles[0].setLatLng(L.latLng(fd.latlng1.lat, fd.latlng1.lng));
        if (handles[1] && ld?.latlng2) handles[1].setLatLng(L.latLng(ld.latlng2.lat, ld.latlng2.lng));
    }

    /** Multi-segment line graphics: dashed box + **two** endpoint handles (chain head & tail). Single-segment group uses per-marker box. */
    function createMultiSegmentTmgGroupSelectionBox(group, layerId) {
        removeTmgResizeHandle();
        const data = group._tmgData;
        const segs = data?.segments;
        if (!segs?.length) return;
        const def = TACTICAL_GRAPHICS.find(x => x.id === data.typeId);
        if (def?.pointSymbol) return;
        if (segs.length === 1) {
            createTmgSelectionBox(segs[0], layerId, group);
            return;
        }
        const corners = getMultiSegmentTmgGroupAabbLatLngs(group);
        if (!corners || corners.length < 4) return;

        const polygon = L.polygon(corners, {
            color: '#2563eb',
            weight: 3,
            dashArray: '8, 6',
            fill: false,
            interactive: false,
            className: 'tmg-selection-border',
            pane: 'tmgSelectionPane'
        });
        polygon.addTo(map);

        const endpointHandleIcon = L.divIcon({
            className: 'tmg-resize-handle tmg-endpoint-handle',
            html: '<div class="tmg-resize-handle-inner"></div>',
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        const applyEndpointDrag = (which, newLatlng, isFinal) => {
            const segList = group._tmgData?.segments;
            if (!segList?.length) return;
            if (which === 0) {
                const fd = segList[0]._tmgData;
                fd.latlng1 = L.latLng(newLatlng.lat, newLatlng.lng);
                segList[0].setLatLng(tmgMidpoint(fd.latlng1, fd.latlng2));
                updateTmgLayer(segList[0]);
            } else {
                const lastSeg = segList[segList.length - 1];
                const ld = lastSeg._tmgData;
                ld.latlng2 = L.latLng(newLatlng.lat, newLatlng.lng);
                lastSeg.setLatLng(tmgMidpoint(ld.latlng1, ld.latlng2));
                updateTmgLayer(lastSeg);
            }
            refreshMultiSegmentTmgGroupSelectionBox(group);
            if (isFinal) scheduleSaveToStorage();
        };

        const h0ll = segs[0]._tmgData.latlng1;
        const h1ll = segs[segs.length - 1]._tmgData.latlng2;
        const handleMarkerOpts = { icon: endpointHandleIcon, draggable: true, pane: 'tmgSelectionPane', zIndexOffset: 1000, bubblingMouseEvents: false };
        const groupSnapExclude = new Set([group]);
        const handles = [h0ll, h1ll].map((latlng, i) => {
            const handle = L.marker(latlng, handleMarkerOpts);
            handle.on('dragstart', () => armSuppressMapClickFromOverlayHandle());
            handle.on('drag', () => {
                let ll = handle.getLatLng();
                ll = snapTmgEndpointHandleLatLng(ll, groupSnapExclude);
                handle.setLatLng(ll);
                applyEndpointDrag(i, ll, false);
            });
            handle.on('dragend', () => {
                armSuppressMapClickFromOverlayHandle();
                let ll = handle.getLatLng();
                ll = snapTmgEndpointHandleLatLng(ll, groupSnapExclude);
                handle.setLatLng(ll);
                applyEndpointDrag(i, ll, true);
                scheduleClearSuppressIfOverlayHandleClickMissed();
            });
            handle.addTo(map);
            return handle;
        });

        activeTmgSelectionBox = {
            polygon,
            handles,
            _layerId: layerId,
            _marker: null,
            _group: group,
            isSegmentGroup: true,
            _useEndpointHandles: true,
            _target: map
        };
    }

    function showTmgGroupPopupSelectionUi(group, layerId) {
        const data = group._tmgData;
        const segs = data?.segments;
        if (!segs?.length) return;
        const def = TACTICAL_GRAPHICS.find(x => x.id === data.typeId);
        if (def?.pointSymbol) return;
        if (segs.length === 1) {
            createTmgSelectionBox(segs[0], layerId, group);
        } else {
            createMultiSegmentTmgGroupSelectionBox(group, layerId);
        }
    }

    function refreshTmgSelectionBox(marker, layerId) {
        if (!activeTmgSelectionBox || activeTmgSelectionBox._marker !== marker) return;
        if (activeTmgSelectionBox.isCatk && activeTmgSelectionBox.catkGroup) {
            refreshCatkMultiPointSelectionBox(marker, activeTmgSelectionBox.catkGroup);
            return;
        }
        const d = marker._tmgData;
        if (!d) return;
        const corners = getTmgBoundingBoxCorners(d.latlng1, d.latlng2, d.typeId, d.strokeWidth);
        if (!corners) return;
        activeTmgSelectionBox.polygon.setLatLngs(corners);
        const handlePositions = activeTmgSelectionBox._useEndpointHandles ? [d.latlng1, d.latlng2] : corners;
        (activeTmgSelectionBox.handles || []).forEach((h, i) => { if (h && handlePositions[i]) h.setLatLng(handlePositions[i]); });
    }

    function centroidOfLatLngs(pts) {
        if (!pts || !pts.length) return null;
        let lat = 0, lng = 0, n = 0;
        pts.forEach((p) => {
            if (!p || p.lat == null || p.lng == null) return;
            lat += p.lat;
            lng += p.lng;
            n++;
        });
        return n ? L.latLng(lat / n, lng / n) : null;
    }

    /** Rotate each LatLng around pivot using map layer pixels (+deg = clockwise on screen). */
    function rotateLatLngsAroundPivotClockwise(latlngs, pivot, deltaDeg) {
        if (!map || !pivot || !latlngs?.length) return latlngs;
        const pv = map.latLngToLayerPoint(pivot);
        const rad = deltaDeg * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        return latlngs.map((ll) => {
            if (!ll || ll.lat == null || ll.lng == null) return ll;
            const p = map.latLngToLayerPoint(ll);
            const dx = p.x - pv.x;
            const dy = p.y - pv.y;
            const rdx = dx * cos - dy * sin;
            const rdy = dx * sin + dy * cos;
            return map.layerPointToLatLng(L.point(pv.x + rdx, pv.y + rdy));
        });
    }

    function getDrawingRotateControlsHtml(options) {
        if (options && options.hide) return '';
        const rotLabel = typeof t === 'function' ? t('drawing-rotate') : 'Rotate';
        const applyLabel = typeof t === 'function' ? t('apply') : 'Apply';
        return `
            <div class="drawing-rotate-row" style="margin:8px 0;padding:6px 0;border-top:1px solid #e5e7eb;">
                <div style="font-size:0.72rem;color:#6b7280;margin-bottom:4px;">${rotLabel} (°)</div>
                <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap;justify-content:center;">
                    <button type="button" class="drawing-rotate-btn" data-deg="-90" style="padding:3px 6px;font-size:0.7rem;cursor:pointer;border:1px solid #cbd5e1;border-radius:4px;">−90</button>
                    <button type="button" class="drawing-rotate-btn" data-deg="-15" style="padding:3px 6px;font-size:0.7rem;cursor:pointer;border:1px solid #cbd5e1;border-radius:4px;">−15</button>
                    <input type="number" class="drawing-rotate-input" value="15" step="1" style="width:42px;padding:2px 4px;font-size:0.75rem;">
                    <button type="button" class="drawing-rotate-apply-btn" style="padding:3px 8px;font-size:0.7rem;cursor:pointer;border:1px solid #cbd5e1;border-radius:4px;">${applyLabel}</button>
                    <button type="button" class="drawing-rotate-btn" data-deg="15" style="padding:3px 6px;font-size:0.7rem;cursor:pointer;border:1px solid #cbd5e1;border-radius:4px;">+15</button>
                    <button type="button" class="drawing-rotate-btn" data-deg="90" style="padding:3px 6px;font-size:0.7rem;cursor:pointer;border:1px solid #cbd5e1;border-radius:4px;">+90</button>
                </div>
            </div>`;
    }

    function bindDrawingRotateControls(content, applyDelta) {
        if (!content || typeof applyDelta !== 'function') return;
        const run = (deg) => {
            const n = parseFloat(deg);
            if (!isFinite(n) || n === 0) return;
            applyDelta(n);
        };
        content.querySelectorAll('.drawing-rotate-btn').forEach((btn) => {
            btn.addEventListener('click', () => run(parseFloat(btn.dataset.deg)));
        });
        const inp = content.querySelector('.drawing-rotate-input');
        content.querySelector('.drawing-rotate-apply-btn')?.addEventListener('click', () => {
            const v = parseFloat(inp?.value);
            if (isFinite(v) && v !== 0) run(v);
        });
    }

    function rotateSingleTmgMarkerByDegrees(marker, deltaDeg) {
        const d = marker._tmgData;
        if (!d || !isFinite(deltaDeg) || deltaDeg === 0) return;
        if (d.catkUnified && marker._catkGroup?._tmgData?.points?.length) {
            const cg = marker._catkGroup._tmgData;
            const c = centroidOfLatLngs(cg.points);
            if (!c) return;
            if (cg.arrowParams) {
                cg.arrowParams = normalizeCatkArrowParams({
                    ...cg.arrowParams,
                    tip: rotateLatLngsAroundPivotClockwise([cg.arrowParams.tip], c, deltaDeg)[0],
                    directionDeg: normalizeBearingDeg(cg.arrowParams.directionDeg + deltaDeg)
                });
                catkApplyArrowParamsToData(cg);
            } else {
                const pts = cg.points;
                const newPts = rotateLatLngsAroundPivotClockwise(pts, c, deltaDeg);
                for (let i = 0; i < pts.length; i++) pts[i] = newPts[i];
                if (cg.lockedArrowParams) {
                    cg.lockedArrowParams = catkRotateLockedArrowParamsAroundPivot(cg.lockedArrowParams, c, deltaDeg);
                }
                if (cg.catkAutoJunction && pts.length === 3) {
                    pts[1] = catkInterpOnTailAxis(pts[2], pts[0], CATK_AUTO_JUNCTION_T);
                }
            }
            syncCatkHeadMarkerToPoints(marker, cg);
            refreshCatkMultiPointSelectionBox(marker, marker._catkGroup);
        } else if (d.latlng1 && d.latlng2) {
            const mid = tmgMidpoint(d.latlng1, d.latlng2);
            d.latlng1 = rotateLatLngsAroundPivotClockwise([d.latlng1], mid, deltaDeg)[0];
            d.latlng2 = rotateLatLngsAroundPivotClockwise([d.latlng2], mid, deltaDeg)[0];
            marker.setLatLng(tmgMidpoint(d.latlng1, d.latlng2));
            updateTmgLayer(marker);
            refreshTmgSelectionBox(marker, marker._layerId);
        }
        scheduleSaveToStorage();
    }

    function rotateTmgSegmentGroupByDegrees(group, deltaDeg) {
        const data = group._tmgData;
        if (!data?.segments?.length || !isFinite(deltaDeg) || deltaDeg === 0) return;
        const segs = data.segments;
        const pts = [];
        segs.forEach((seg, i) => {
            const s = seg._tmgData;
            if (s?.latlng1 && i === 0) pts.push(L.latLng(s.latlng1.lat, s.latlng1.lng));
            if (s?.latlng2) pts.push(L.latLng(s.latlng2.lat, s.latlng2.lng));
        });
        const c = centroidOfLatLngs(pts);
        if (!c) return;
        const rotated = rotateLatLngsAroundPivotClockwise(pts, c, deltaDeg);
        rotated.forEach((ll, idx) => {
            if (idx === 0) segs[0]._tmgData.latlng1 = ll;
            else segs[idx - 1]._tmgData.latlng2 = ll;
            if (idx < segs.length) segs[idx]._tmgData.latlng1 = ll;
        });
        segs.forEach((seg) => {
            seg.setLatLng(tmgMidpoint(seg._tmgData.latlng1, seg._tmgData.latlng2));
            updateTmgLayer(seg);
        });
        refreshMultiSegmentTmgGroupSelectionBox(group);
        const lastData = segs[segs.length - 1]._tmgData;
        if (activeResizeHandle && activeResizeHandle._layerId === group._layerId) {
            activeResizeHandle.setLatLng(lastData.latlng2);
        }
        scheduleSaveToStorage();
    }

    function rotateCatkMultiPointGroupByDegrees(group, deltaDeg) {
        const data = group._tmgData;
        if (!data?.points?.length || !isFinite(deltaDeg) || deltaDeg === 0) return;
        const c = centroidOfLatLngs(data.points);
        if (!c) return;
        if (data.arrowParams) {
            data.arrowParams = normalizeCatkArrowParams({
                ...data.arrowParams,
                tip: rotateLatLngsAroundPivotClockwise([data.arrowParams.tip], c, deltaDeg)[0],
                directionDeg: normalizeBearingDeg(data.arrowParams.directionDeg + deltaDeg)
            });
            catkApplyArrowParamsToData(data);
        } else {
            const pts = data.points;
            const newPts = rotateLatLngsAroundPivotClockwise(pts, c, deltaDeg);
            for (let i = 0; i < pts.length; i++) pts[i] = newPts[i];
            if (data.lockedArrowParams) {
                data.lockedArrowParams = catkRotateLockedArrowParamsAroundPivot(data.lockedArrowParams, c, deltaDeg);
            }
            if (data.catkAutoJunction && pts.length === 3) {
                pts[1] = catkInterpOnTailAxis(pts[2], pts[0], CATK_AUTO_JUNCTION_T);
            }
        }
        if (data.tailPolyline) data.tailPolyline.setLatLngs(catkBuildTailPathFromPoints(data.points));
        if (data.headMarker) syncCatkHeadMarkerToPoints(data.headMarker, data);
        refreshCatkMultiPointSelectionBox(data.headMarker, group);
        scheduleSaveToStorage();
    }

    function rotateGeoShapeByDegrees(el, geoType, deltaDeg) {
        const d = el._geoData;
        if (!d || !isFinite(deltaDeg) || deltaDeg === 0) return;
        if (geoType === 'range-circle' || geoType === 'circle-2pt') return;
        if (geoType === 'range-sector' || geoType === 'semi-circle') {
            d.bearing = normalizeBearingDeg((d.bearing ?? 0) + deltaDeg);
            const pts = createSectorPolygon(d.center, d.radiusKm ?? 5, d.bearing, geoType === 'range-sector' ? (d.aperture ?? 90) : 180);
            el.setLatLngs(pts);
        } else if (geoType === 'polygon') {
            d.rotation = normalizeBearingDeg((d.rotation ?? 0) + deltaDeg);
            const ring = createRegularPolygon(d.center, d.radiusKm ?? 5, d.sides ?? 6, d.rotation);
            el.setLatLngs([ring]);
        } else if (geoType === 'rectangle' || geoType === 'oval' || geoType === 'minefield') {
            const lls = el.getLatLngs?.();
            let corners = (d.corners && d.corners.length) ? d.corners.slice() : ((lls && lls[0]) ? (Array.isArray(lls[0]) ? lls[0].slice() : lls.slice()) : []);
            if (corners.length < 2) return;
            const c = centroidOfLatLngs(corners);
            if (!c) return;
            corners = rotateLatLngsAroundPivotClockwise(corners, c, deltaDeg);
            d.corners = corners;
            if (geoType === 'oval') syncOvalPolygonFromCorners(el);
            else el.setLatLngs(corners);
            if (geoType === 'minefield') {
                updateMinefieldDecorations(el);
            }
        } else if (geoType === 'freeform') {
            const rings = el.getLatLngs();
            let pts = [];
            if (d.points && d.points.length >= 2) {
                pts = d.points.map(p => L.latLng(p.lat, p.lng));
            } else if (rings && rings[0]) {
                const r0 = rings[0];
                if (Array.isArray(r0) && r0[0] && typeof r0[0].lat === 'number') {
                    pts = r0.map(p => L.latLng(p.lat, p.lng));
                } else if (!Array.isArray(r0) && typeof r0.lat === 'number') {
                    pts = rings.map(p => L.latLng(p.lat, p.lng));
                }
            }
            if (pts.length < 2) return;
            const c = centroidOfLatLngs(pts);
            if (!c) return;
            const newPts = rotateLatLngsAroundPivotClockwise(pts, c, deltaDeg);
            d.points = newPts;
            el.setLatLngs([newPts]);
        } else if (geoType === 'freehand') {
            const pts = (el.getLatLngs?.() || d.points || []).map(p => L.latLng(p.lat, p.lng));
            if (pts.length < 2) return;
            const c = centroidOfLatLngs(pts);
            if (!c) return;
            const newPts = rotateLatLngsAroundPivotClockwise(pts, c, deltaDeg);
            el.setLatLngs(newPts);
            d.points = newPts;
        } else if (geoType === 'distance') {
            let pts = d.points || el.getLatLngs?.() || [];
            const flat = (Array.isArray(pts[0]) && pts[0].lat === undefined) ? pts.flat() : pts;
            const arr = flat.map(p => L.latLng(p.lat, p.lng));
            if (arr.length < 2) return;
            const c = centroidOfLatLngs(arr);
            if (!c) return;
            const newFlat = rotateLatLngsAroundPivotClockwise(arr, c, deltaDeg);
            d.points = newFlat;
            el.setLatLngs(newFlat);
            d.distanceKm = totalDistanceKm(newFlat);
            createDistanceWaypointMarkers(el);
        }
        if (['vertical', 'horizontal', 'both'].includes(d.fillStyle) && geoType !== 'minefield') {
            scheduleGeoPathFill(el);
        } else if (['vertical', 'horizontal', 'both'].includes(d.fillStyle) && geoType === 'minefield') {
            applyMinefieldFill(el);
        }
        scheduleSaveToStorage();
    }

    let activeGeoResizeHandles = [];
    let activeGeoCenterMoveHandle = null;

    function createGeoResizeHandle(latlng, onUpdate, layerId) {
        const handleIcon = L.divIcon({
            className: 'geo-resize-handle',
            html: '<div class="geo-resize-handle-inner"></div>',
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        });
        const handle = L.marker(latlng, { icon: handleIcon, draggable: true });
        handle._layerId = layerId;
        const doUpdate = (isFinal) => onUpdate(handle.getLatLng(), isFinal);
        handle.on('dragstart', () => armSuppressMapClickFromOverlayHandle());
        handle.on('drag', () => doUpdate(false));
        handle.on('dragend', () => {
            armSuppressMapClickFromOverlayHandle();
            doUpdate(true);
            scheduleClearSuppressIfOverlayHandleClickMissed();
        });
        const layer = layers.find(l => l.id === layerId);
        if (layer) layer.group.addLayer(handle);
        activeGeoResizeHandles.push(handle);
        return handle;
    }

    function removeGeoResizeHandles() {
        activeGeoResizeHandles.forEach(handle => {
            const layer = layers.find(l => l.id === handle._layerId);
            if (layer) layer.group.removeLayer(handle);
        });
        activeGeoResizeHandles = [];
        if (activeGeoCenterMoveHandle) {
            const cl = layers.find(l => l.id === activeGeoCenterMoveHandle._layerId);
            if (cl) cl.group.removeLayer(activeGeoCenterMoveHandle);
            activeGeoCenterMoveHandle = null;
        }
    }

    function getGeoShapeCentroid(el, geoType) {
        const d = el._geoData;
        if (!d) return null;
        if (geoType === 'range-circle' || geoType === 'circle-2pt' || geoType === 'range-sector' || geoType === 'semi-circle' || geoType === 'polygon') {
            return d.center ? L.latLng(d.center.lat, d.center.lng) : null;
        }
        if (geoType === 'rectangle' || geoType === 'oval' || geoType === 'minefield') {
            const cc = d.corners;
            if (!cc || !cc.length) return null;
            return centroidOfLatLngs(cc.map(p => L.latLng(p.lat, p.lng)));
        }
        if (geoType === 'freeform') {
            const pts = d.points;
            if (!pts || !pts.length) return null;
            return centroidOfLatLngs(pts.map(p => L.latLng(p.lat, p.lng)));
        }
        if (geoType === 'freehand') {
            const raw = el.getLatLngs?.() || d.points;
            if (!raw || !raw.length) return null;
            return centroidOfLatLngs(raw.map(p => L.latLng(p.lat, p.lng)));
        }
        if (geoType === 'distance') {
            let pts = d.points || el.getLatLngs() || [];
            const flat = Array.isArray(pts[0]) && pts[0].lat === undefined ? pts.flat() : pts;
            return centroidOfLatLngs(flat.map(p => L.latLng(p.lat, p.lng)));
        }
        return null;
    }

    function translateGeoShapeByDelta(el, geoType, dLat, dLng, opts = {}) {
        const d = el._geoData;
        if (!d) return;
        const { final = false, skipDistanceMarkers = false } = opts;
        const move = (ll) => L.latLng(ll.lat + dLat, ll.lng + dLng);
        if (geoType === 'range-circle' || geoType === 'circle-2pt') {
            d.center = move(L.latLng(d.center.lat, d.center.lng));
            if (el.setLatLng) el.setLatLng(d.center);
        } else if (geoType === 'range-sector' || geoType === 'semi-circle') {
            d.center = move(L.latLng(d.center.lat, d.center.lng));
            const pts = createSectorPolygon(d.center, d.radiusKm, d.bearing, geoType === 'range-sector' ? (d.aperture ?? 90) : 180);
            el.setLatLngs(pts);
        } else if (geoType === 'polygon') {
            d.center = move(L.latLng(d.center.lat, d.center.lng));
            const ring = createRegularPolygon(d.center, d.radiusKm ?? 5, d.sides ?? 6, d.rotation ?? 0);
            el.setLatLngs([ring]);
        } else if (geoType === 'rectangle' || geoType === 'minefield') {
            d.corners = (d.corners || []).map(c => move(L.latLng(c.lat, c.lng)));
            el.setLatLngs(d.corners);
            if (geoType === 'minefield') updateMinefieldDecorations(el);
        } else if (geoType === 'oval') {
            d.corners = (d.corners || []).map(c => move(L.latLng(c.lat, c.lng)));
            syncOvalPolygonFromCorners(el);
        } else if (geoType === 'freeform') {
            const pts = (d.points || []).map(p => move(L.latLng(p.lat, p.lng)));
            d.points = pts;
            el.setLatLngs([pts]);
        } else if (geoType === 'freehand') {
            const raw = el.getLatLngs?.() || d.points || [];
            const pts = raw.map(p => move(L.latLng(p.lat, p.lng)));
            el.setLatLngs(pts);
            d.points = pts;
            syncPlainLineEndpointHandlePositions(el);
        } else if (geoType === 'distance') {
            let pts = d.points || el.getLatLngs() || [];
            const flat = Array.isArray(pts[0]) && pts[0].lat === undefined ? pts.flat() : pts;
            const next = flat.map(p => move(L.latLng(p.lat, p.lng)));
            d.points = next;
            el.setLatLngs(next);
            d.distanceKm = totalDistanceKm(next);
            if (!skipDistanceMarkers) createDistanceWaypointMarkers(el);
        }
        if (['vertical', 'horizontal', 'both'].includes(d.fillStyle) && geoType !== 'minefield') {
            scheduleGeoPathFill(el);
        } else if (['vertical', 'horizontal', 'both'].includes(d.fillStyle) && geoType === 'minefield') {
            applyMinefieldFill(el);
        }
        if (final) scheduleSaveToStorage();
    }

    function getGeoPopupKmLabel(geoType) {
        const nmFirst = getDistanceUnitPrimary() === 'nm';
        if (typeof t === 'function') {
            if (geoType === 'distance' || geoType === 'freehand') return nmFirst ? t('geo-popup-nm-path') : t('geo-popup-km-path');
            if (geoType === 'freeform') return nmFirst ? t('geo-popup-nm-perimeter') : t('geo-popup-km-perimeter');
            if (geoType === 'rectangle' || geoType === 'oval' || geoType === 'minefield') return nmFirst ? t('geo-popup-nm-span') : t('geo-popup-km-span');
            return nmFirst ? t('geo-popup-nm-radius') : t('geo-popup-km-radius');
        }
        if (geoType === 'distance' || geoType === 'freehand') return nmFirst ? 'Path length (NM)' : 'Path length (km)';
        if (geoType === 'freeform') return nmFirst ? 'Perimeter (NM)' : 'Perimeter (km)';
        if (geoType === 'rectangle' || geoType === 'oval' || geoType === 'minefield') return nmFirst ? 'Size from center (NM)' : 'Size from center (km)';
        return nmFirst ? 'Radius (NM)' : 'Radius (km)';
    }

    function getGeoPrimaryKmValue(el, geoType, d) {
        if (!d && geoType !== 'distance') return NaN;
        switch (geoType) {
            case 'distance': {
                let pts = (d && d.points) ? d.points : (el?.getLatLngs?.() || []);
                const flat = (Array.isArray(pts[0]) && pts[0].lat === undefined) ? pts.flat() : pts;
                const arr = flat.filter(Boolean).map(p => L.latLng(p.lat ?? p[0], p.lng ?? p[1]));
                return arr.length >= 2 ? totalDistanceKm(arr) : NaN;
            }
            case 'range-circle':
            case 'circle-2pt':
            case 'range-sector':
            case 'semi-circle':
            case 'polygon':
                return Number(d.radiusKm);
            case 'rectangle':
            case 'oval':
            case 'minefield': {
                const corners = d.corners;
                if (!corners?.length) return NaN;
                const pivot = centroidOfLatLngs(corners.map(p => L.latLng(p.lat ?? p[0], p.lng ?? p[1])));
                return pivot ? maxCornerSpanKmFromPivot(pivot, corners) : NaN;
            }
            case 'freeform': {
                const verts = getFreeformVerticesForKm(el, d);
                return verts.length >= 3 ? closedRingPerimeterKm(verts) : NaN;
            }
            case 'freehand': {
                const raw = el?.getLatLngs?.() || d.points || [];
                const arr = raw.map(p => L.latLng(p.lat ?? p[0], p.lng ?? p[1]));
                return arr.length >= 2 ? totalDistanceKm(arr) : NaN;
            }
            default:
                return NaN;
        }
    }

    function applyGeoPrimaryKmFromPopup(el, geoType, d, newKm) {
        const km = parseFloat(String(newKm).replace(',', '.'));
        if (!isFinite(km) || km < 0.001) return false;
        switch (geoType) {
            case 'distance': {
                let pts = d.points || el.getLatLngs?.() || [];
                const flat = (Array.isArray(pts[0]) && pts[0].lat === undefined) ? pts.flat() : pts;
                const arr = flat.filter(Boolean).map(p => L.latLng(p.lat ?? p[0], p.lng ?? p[1]));
                if (arr.length < 2) return false;
                const cur = totalDistanceKm(arr);
                if (cur < 1e-6) return false;
                const c = centroidOfLatLngs(arr);
                if (!c) return false;
                const scaled = scaleLatLngsAboutPivot(arr, c, km / cur);
                if (!scaled) return false;
                d.points = scaled;
                el.setLatLngs(scaled);
                d.distanceKm = totalDistanceKm(scaled);
                return true;
            }
            case 'range-circle':
            case 'circle-2pt':
                d.radiusKm = parseFloat(km.toFixed(4));
                if (el.setRadius) el.setRadius(d.radiusKm * 1000);
                return true;
            case 'range-sector': {
                d.radiusKm = parseFloat(km.toFixed(4));
                const pts = createSectorPolygon(d.center, d.radiusKm, d.bearing ?? 0, d.aperture ?? 90);
                el.setLatLngs(pts);
                return true;
            }
            case 'semi-circle': {
                d.radiusKm = parseFloat(km.toFixed(4));
                const pts = createSectorPolygon(d.center, d.radiusKm, d.bearing ?? 0, 180);
                el.setLatLngs(pts);
                return true;
            }
            case 'polygon': {
                d.radiusKm = parseFloat(km.toFixed(4));
                const ring = createRegularPolygon(d.center, d.radiusKm, d.sides ?? 6, d.rotation ?? 0);
                el.setLatLngs([ring]);
                return true;
            }
            case 'rectangle':
            case 'oval':
            case 'minefield': {
                const corners = (d.corners || []).map(p => L.latLng(p.lat ?? p[0], p.lng ?? p[1]));
                if (corners.length < 2) return false;
                const pivot = centroidOfLatLngs(corners);
                if (!pivot) return false;
                const cur = maxCornerSpanKmFromPivot(pivot, corners);
                if (cur < 1e-6) return false;
                const scaled = scaleLatLngsAboutPivot(corners, pivot, km / cur);
                if (!scaled) return false;
                d.corners = scaled;
                if (geoType === 'oval') syncOvalPolygonFromCorners(el);
                else el.setLatLngs(scaled);
                return true;
            }
            case 'freeform': {
                const verts = getFreeformVerticesForKm(el, d);
                if (verts.length < 3) return false;
                const c = centroidOfLatLngs(verts);
                if (!c) return false;
                const cur = closedRingPerimeterKm(verts);
                if (cur < 1e-6) return false;
                const scaledOpen = scaleLatLngsAboutPivot(verts, c, km / cur);
                if (!scaledOpen) return false;
                d.points = scaledOpen;
                el.setLatLngs([scaledOpen]);
                return true;
            }
            case 'freehand': {
                const raw = el.getLatLngs?.() || d.points || [];
                const arr = raw.map(p => L.latLng(p.lat ?? p[0], p.lng ?? p[1]));
                if (arr.length < 2) return false;
                const cur = totalDistanceKm(arr);
                if (cur < 1e-6) return false;
                const c = centroidOfLatLngs(arr);
                if (!c) return false;
                const scaled = scaleLatLngsAboutPivot(arr, c, km / cur);
                if (!scaled) return false;
                el.setLatLngs(scaled);
                d.points = scaled;
                return true;
            }
            default:
                return false;
        }
    }

    function afterGeoPrimaryKmEdit(el, geoType) {
        const d = el._geoData;
        if (!d) return;
        if (['vertical', 'horizontal', 'both'].includes(d.fillStyle) && geoType !== 'minefield') {
            scheduleGeoPathFill(el);
        } else if (['vertical', 'horizontal', 'both'].includes(d.fillStyle) && geoType === 'minefield') {
            applyMinefieldFill(el);
        }
        syncGeoShapeHandlesToGeometry(el, geoType);
        if (geoType === 'distance') createDistanceWaypointMarkers(el);
        if (geoType === 'freehand') syncPlainLineEndpointHandlePositions(el);
        if (geoType === 'minefield') updateMinefieldDecorations(el);
    }

    function scaleOpenPolylinePathKm(polyline, newKm) {
        const km = parseFloat(String(newKm).replace(',', '.'));
        if (!isFinite(km) || km < 0.001) return false;
        const lls = polyline.getLatLngs?.() || [];
        const flat = (lls.length && lls[0] && Array.isArray(lls[0])) ? lls.flat() : lls;
        const arr = flat.map(p => L.latLng(p.lat, p.lng));
        if (arr.length < 2) return false;
        const cur = totalDistanceKm(arr);
        if (cur < 1e-6) return false;
        const c = centroidOfLatLngs(arr);
        if (!c) return false;
        const scaled = scaleLatLngsAboutPivot(arr, c, km / cur);
        if (!scaled) return false;
        polyline.setLatLngs(scaled);
        syncPlainLineEndpointHandlePositions(polyline);
        return true;
    }

    function syncGeoShapeHandlesToGeometry(el, geoType) {
        const d = el._geoData;
        if (activeGeoCenterMoveHandle && activeGeoCenterMoveHandle._parentGeoEl === el) {
            const c = getGeoShapeCentroid(el, geoType);
            if (c) activeGeoCenterMoveHandle.setLatLng(c);
        }
        if (!d) return;
        if (geoType === 'range-circle' || geoType === 'circle-2pt') {
            if (activeGeoResizeHandles[0]) activeGeoResizeHandles[0].setLatLng(latLngAtBearing(d.center, d.radiusKm, 0));
        } else if (geoType === 'range-sector' || geoType === 'semi-circle') {
            if (activeGeoResizeHandles[0]) activeGeoResizeHandles[0].setLatLng(latLngAtBearing(d.center, d.radiusKm, d.bearing));
        } else if (geoType === 'polygon') {
            if (activeGeoResizeHandles[0]) activeGeoResizeHandles[0].setLatLng(latLngAtBearing(d.center, d.radiusKm, d.rotation ?? 0));
        } else if (geoType === 'minefield' || geoType === 'rectangle' || geoType === 'oval') {
            const lls = el.getLatLngs();
            const ring = (lls[0] && Array.isArray(lls[0])) ? lls[0] : lls;
            activeGeoResizeHandles.forEach((h, i) => {
                if (ring[i]) h.setLatLng(ring[i]);
            });
        }
    }

    function bindGeoCenterMoveHandle(el, geoType) {
        const layerId = el._layerId;
        const layer = layers.find(l => l.id === layerId);
        if (!layer || !map) return;
        const c = getGeoShapeCentroid(el, geoType);
        if (!c) return;
        const moveTitle = typeof t === 'function' ? t('geo-center-move-title') : 'Drag to move entire shape';
        const icon = L.divIcon({
            className: 'geo-center-move-handle',
            html: '<div class="geo-center-move-handle-inner"></div>',
            iconSize: [18, 18],
            iconAnchor: [9, 9]
        });
        const handle = L.marker(c, {
            icon,
            draggable: true,
            pane: 'tmgSelectionPane',
            zIndexOffset: 950,
            title: moveTitle
        });
        handle._layerId = layerId;
        handle._parentGeoEl = el;
        handle._parentGeoType = geoType;
        handle.on('dragstart', () => armSuppressMapClickFromOverlayHandle());
        handle.on('drag', () => {
            const c0 = getGeoShapeCentroid(el, geoType);
            const tpos = handle.getLatLng();
            if (!c0) return;
            const dLa = tpos.lat - c0.lat;
            const dLo = tpos.lng - c0.lng;
            if (Math.abs(dLa) < 1e-14 && Math.abs(dLo) < 1e-14) return;
            translateGeoShapeByDelta(el, geoType, dLa, dLo, { final: false, skipDistanceMarkers: geoType === 'distance' });
            syncGeoShapeHandlesToGeometry(el, geoType);
        });
        handle.on('dragend', () => {
            armSuppressMapClickFromOverlayHandle();
            syncGeoShapeHandlesToGeometry(el, geoType);
            if (geoType === 'distance') createDistanceWaypointMarkers(el);
            scheduleSaveToStorage();
            scheduleClearSuppressIfOverlayHandleClickMissed();
        });
        handle.on('click', () => {
            if (el.openPopup) el.openPopup(c);
        });
        layer.group.addLayer(handle);
        activeGeoCenterMoveHandle = handle;
    }

    function removeDistanceSegmentLabelMarkers(polyline) {
        const segMarkers = polyline._segmentDistanceMarkers;
        if (!segMarkers?.length) return;
        const layer = layers.find(l => l.id === polyline._layerId);
        if (layer) {
            segMarkers.forEach(m => {
                m.unbindTooltip?.();
                layer.group.removeLayer(m);
            });
        }
        polyline._segmentDistanceMarkers = [];
    }

    function createDistanceSegmentLabelMarkers(polyline) {
        removeDistanceSegmentLabelMarkers(polyline);
        const d = polyline._geoData;
        if (!d) return;
        let pts = d.points || polyline.getLatLngs?.() || [];
        if (pts.length && Array.isArray(pts[0])) pts = pts.flat();
        if (pts.length < 2) return;
        const layer = layers.find(l => l.id === polyline._layerId);
        if (!layer) return;
        const segMarkers = [];
        const emptyIcon = L.divIcon({
            className: 'geo-distance-segment-label-marker',
            html: '',
            iconSize: [1, 1],
            iconAnchor: [0, 0]
        });
        for (let i = 0; i < pts.length - 1; i++) {
            const a = L.latLng(pts[i].lat ?? pts[i][0], pts[i].lng ?? pts[i][1]);
            const b = L.latLng(pts[i + 1].lat ?? pts[i + 1][0], pts[i + 1].lng ?? pts[i + 1][1]);
            const mid = L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
            const segKm = haversineDistance(a.lat, a.lng, b.lat, b.lng) / 1000;
            const dec = segKm >= 100 ? 1 : 2;
            const tipHtml = `<span dir="ltr" style="unicode-bidi:isolate;font-size:10px;line-height:1.25;font-weight:600;">${formatKmAndNm(segKm, dec)}</span>`;
            const m = L.marker(mid, { icon: emptyIcon, interactive: false, keyboard: false });
            m.bindTooltip(tipHtml, {
                permanent: true,
                direction: 'center',
                className: 'geo-distance-segment-label-tooltip',
                opacity: 1,
                interactive: false
            });
            layer.group.addLayer(m);
            segMarkers.push(m);
        }
        polyline._segmentDistanceMarkers = segMarkers;
    }

    function removeDistanceWaypointMarkers(polyline) {
        removeDistanceSegmentLabelMarkers(polyline);
        const markers = polyline._waypointMarkers;
        if (!markers || !Array.isArray(markers)) return;
        const layer = layers.find(l => l.id === polyline._layerId);
        if (layer) markers.forEach(m => {
            if (m.getTooltip) m.unbindTooltip();
            layer.group.removeLayer(m);
        });
        polyline._waypointMarkers = [];
    }

    /** HTML for permanent map label (escaped). Empty stored name → “Waypoint n”. */
    function distanceWaypointLabelTooltipHtml(polyline, index) {
        const d = polyline._geoData;
        const labels = d?.pointLabels || [];
        const raw = labels[index];
        const fallback = `${typeof t === 'function' ? t('geo-waypoint') : 'Waypoint'} ${index + 1}`;
        const display = (raw != null && String(raw).trim() !== '') ? String(raw).trim() : fallback;
        return `<span dir="auto">${escapeHtml(display)}</span>`;
    }

    function bindDistanceWaypointLabelTooltip(marker, polyline, index) {
        const html = distanceWaypointLabelTooltipHtml(polyline, index);
        const tip = marker.getTooltip?.();
        if (tip) {
            tip.setContent(html);
        } else {
            marker.bindTooltip(html, {
                permanent: true,
                direction: 'top',
                offset: [0, -10],
                className: 'geo-distance-waypoint-label-tooltip',
                opacity: 1,
                interactive: false
            });
        }
    }

    function syncDistanceWaypointMarkerLabelTooltips(polyline) {
        const markers = polyline._waypointMarkers;
        if (!markers?.length) return;
        markers.forEach((m, i) => bindDistanceWaypointLabelTooltip(m, polyline, i));
    }

    function createDistanceWaypointMarkers(polyline) {
        removeDistanceWaypointMarkers(polyline);
        const d = polyline._geoData;
        if (!d) return;
        let pts = d.points || polyline.getLatLngs?.() || [];
        if (pts.length && Array.isArray(pts[0])) pts = pts.flat();
        if (pts.length < 2) return;
        const layer = layers.find(l => l.id === polyline._layerId);
        if (!layer) return;
        createDistanceSegmentLabelMarkers(polyline);
        const markers = [];
        const handleIcon = L.divIcon({
            className: 'geo-resize-handle geo-waypoint-marker',
            html: '<div class="geo-resize-handle-inner"></div>',
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        });
        pts.forEach((pt, i) => {
            const m = L.marker(pt, { icon: handleIcon, draggable: true });
            m._pointIndex = i;
            m._polyline = polyline;
            bindDistanceWaypointLabelTooltip(m, polyline, i);
            m.on('dragstart', () => armSuppressMapClickFromOverlayHandle());
            m.on('drag', () => {
                const idx = m._pointIndex;
                const ptsArr = d.points || polyline.getLatLngs();
                ptsArr[idx] = m.getLatLng();
                polyline.setLatLngs(ptsArr);
                d.distanceKm = totalDistanceKm(ptsArr);
                createDistanceSegmentLabelMarkers(polyline);
                polyline._waypointMarkers?.forEach(wm => wm.bringToFront?.());
                polyline.setPopupContent(buildGeoPopupContent(polyline, 'distance', d));
                bindGeoPopupHandlers(polyline, 'distance');
            });
            m.on('dragend', () => {
                armSuppressMapClickFromOverlayHandle();
                scheduleSaveToStorage();
                scheduleClearSuppressIfOverlayHandleClickMissed();
            });
            m.on('click', () => polyline.openPopup());
            layer.group.addLayer(m);
            markers.push(m);
        });
        polyline._waypointMarkers = markers;
    }

    function applyGeoShapeStyle(el) {
        const d = el._geoData;
        if (!d) return;
        if (el._geoType === 'freehand') {
            if (el.setStyle) el.setStyle({ color: d.color, weight: 3 });
            return;
        }
        if (el._geoType === 'minefield') {
            if (el.setStyle) el.setStyle(getMinefieldStyle(d.color, d.mineType || 'ap'));
            applyMinefieldFill(el);
            updateMinefieldDecorations(el);
            return;
        }
        const style = getGeoShapeStyle(d.color, d.fillStyle);
        if (el.setStyle) el.setStyle(style);
        if (['vertical', 'horizontal', 'both'].includes(d.fillStyle)) {
            scheduleGeoPathFill(el);
        }
    }

    const GEO_POPUP_OPTIONS = { bubblingMouseEvents: false, className: 'geo-popup-draggable', offset: [0, -15] };

    function syncMarkerRangeOverlays() {
        const marker = this;
        (marker._rangeCircles || []).forEach((c) => {
            c.setLatLng(marker.getLatLng());
            const rd = c._rangeData;
            if (rd && ['vertical', 'horizontal', 'both'].includes(rd.fillStyle)) scheduleGeoPathFill(c);
        });
        (marker._rangeSectors || []).forEach(poly => {
            const d = poly._rangeSectorData;
            if (!d) return;
            const pts = createSectorPolygon(marker.getLatLng(), d.radiusKm ?? 5, d.bearing ?? 0, d.aperture ?? 90);
            poly.setLatLngs(pts);
            if (['vertical', 'horizontal', 'both'].includes(d.fillStyle)) scheduleGeoPathFill(poly);
        });
    }

    function attachMarkerRangeOverlayDragSync(marker) {
        if (!marker._rangeOverlaySyncBound) {
            marker._rangeOverlaySyncBound = true;
            marker.on('dragend', syncMarkerRangeOverlays);
        }
    }

    function detachMarkerRangeOverlayDragSyncIfEmpty(marker) {
        const hasC = (marker._rangeCircles || []).length > 0;
        const hasS = (marker._rangeSectors || []).length > 0;
        if (!hasC && !hasS && marker._rangeOverlaySyncBound) {
            marker.off('dragend', syncMarkerRangeOverlays);
            marker._rangeOverlaySyncBound = false;
        }
    }

    function addRangeCircleToMarker(marker, radiusKm, color, fillStyle) {
        const layer = layers.find(l => l.id === marker._layerId);
        if (!layer) return;
        if (!marker._rangeCircles) marker._rangeCircles = [];
        const circle = L.circle(marker.getLatLng(), {
            radius: (radiusKm || 5) * 1000,
            ...getGeoShapeStyle(color || '#3b82f6', fillStyle || DEFAULT_GEO_FILL_STYLE)
        });
        circle._attachedToMarker = marker;
        circle._rangeData = { radiusKm: radiusKm || 5, color: color || '#3b82f6', fillStyle: fillStyle || DEFAULT_GEO_FILL_STYLE };
        circle._rangeIndex = marker._rangeCircles.length;
        circle._layerId = marker._layerId;
        marker._rangeCircles.push(circle);
        layer.group.addLayer(circle);
        attachMarkerRangeOverlayDragSync(marker);
    }

    function removeRangeCircleFromMarker(marker, index) {
        const circles = marker._rangeCircles || [];
        const circle = circles[index];
        if (!circle) return;
        const layer = layers.find(l => l.id === marker._layerId);
        if (layer) layer.group.removeLayer(circle);
        circles.splice(index, 1);
        circles.forEach((c, i) => { c._rangeIndex = i; });
        detachMarkerRangeOverlayDragSyncIfEmpty(marker);
    }

    function addRangeSectorToMarker(marker, radiusKm, bearingDeg, apertureDeg, color, fillStyle) {
        const layer = layers.find(l => l.id === marker._layerId);
        if (!layer) return;
        if (!marker._rangeSectors) marker._rangeSectors = [];
        const r = radiusKm || 5;
        const b = bearingDeg ?? 0;
        const a = apertureDeg ?? 90;
        const c = color || '#3b82f6';
        const fs = fillStyle || DEFAULT_GEO_FILL_STYLE;
        const center = marker.getLatLng();
        const pts = createSectorPolygon(center, r, b, a);
        const poly = L.polygon(pts, getGeoShapeStyle(c, fs));
        poly._attachedToMarker = marker;
        poly._rangeSectorData = { radiusKm: r, bearing: b, aperture: a, color: c, fillStyle: fs };
        if (['vertical', 'horizontal', 'both'].includes(fs)) {
            poly._geoData = { fillStyle: fs, color: c };
            poly.once('add', () => scheduleGeoPathFill(poly));
        }
        poly._rangeSectorIndex = marker._rangeSectors.length;
        poly._layerId = marker._layerId;
        marker._rangeSectors.push(poly);
        layer.group.addLayer(poly);
        attachMarkerRangeOverlayDragSync(marker);
    }

    function removeRangeSectorFromMarker(marker, index) {
        const list = marker._rangeSectors || [];
        const poly = list[index];
        if (!poly) return;
        const layer = layers.find(l => l.id === marker._layerId);
        if (layer) layer.group.removeLayer(poly);
        list.splice(index, 1);
        list.forEach((p, i) => { p._rangeSectorIndex = i; });
        detachMarkerRangeOverlayDragSyncIfEmpty(marker);
    }

    function updateRangeSectorStyle(marker, index, radiusKm, bearingDeg, apertureDeg, color, fillStyle) {
        const list = marker._rangeSectors || [];
        const poly = list[index];
        if (!poly) return;
        const d = poly._rangeSectorData || {};
        const r = radiusKm ?? d.radiusKm ?? 5;
        const b = bearingDeg ?? d.bearing ?? 0;
        const ap = apertureDeg ?? d.aperture ?? 90;
        const c = color ?? d.color ?? '#3b82f6';
        const fs = fillStyle ?? d.fillStyle ?? DEFAULT_GEO_FILL_STYLE;
        const pts = createSectorPolygon(marker.getLatLng(), r, b, ap);
        poly.setLatLngs(pts);
        poly.setStyle(getGeoShapeStyle(c, fs));
        poly._rangeSectorData = { radiusKm: r, bearing: b, aperture: ap, color: c, fillStyle: fs };
        if (['vertical', 'horizontal', 'both'].includes(fs)) {
            poly._geoData = { fillStyle: fs, color: c };
            scheduleGeoPathFill(poly);
        } else {
            delete poly._geoData;
            clearGeoObstacleHatchLines(poly);
        }
    }

    function updateRangeCircleStyle(marker, index, radiusKm, color, fillStyle) {
        const circles = marker._rangeCircles || [];
        const circle = circles[index];
        if (!circle) return;
        circle.setRadius((radiusKm || 5) * 1000);
        const fsu = fillStyle || DEFAULT_GEO_FILL_STYLE;
        const col = color || '#3b82f6';
        circle.setStyle(getGeoShapeStyle(col, fsu));
        circle._rangeData = { radiusKm: radiusKm || 5, color: col, fillStyle: fsu };
        if (['vertical', 'horizontal', 'both'].includes(fsu)) {
            circle._geoData = { fillStyle: fsu, color: col };
            scheduleGeoPathFill(circle);
        } else {
            delete circle._geoData;
            clearGeoObstacleHatchLines(circle);
        }
    }

    const DUPLICATE_OFFSET = 0.015;
    const SELECTION_DUPLICATE_OFFSET = 0.0035;

    function duplicateSymbol(marker) {
        const latlng = marker.getLatLng();
        const newLat = L.latLng(latlng.lat + DUPLICATE_OFFSET, latlng.lng + DUPLICATE_OFFSET);
        const sidc = marker._sidc || '10031000001200000000';
        const copy = L.marker(newLat, { icon: L.divIcon({ className: 'custom-nato-marker', html: '<div></div>', iconSize: [1, 1], iconAnchor: [0, 0] }), draggable: true });
        copy._sidc = sidc;
        copy._textModifiers = { ...(marker._textModifiers || {}), size: 25, simpleStatusModifier: true };
        copy._statusKey = marker._statusKey || 'status-operational';
        copy._symbolRotationDeg = marker._symbolRotationDeg || 0;
        refreshSymbolIcon(copy);
        copy.bindPopup(buildSymbolPopupContent(copy), { bubblingMouseEvents: false });
        copy.on('popupopen', () => {
            copy.setPopupContent(buildSymbolPopupContent(copy));
            bindSymbolPopupHandlers(copy);
        });
        addToActiveLayer(copy);
        (marker._rangeCircles || []).forEach(c => {
            const rd = c._rangeData || {};
            addRangeCircleToMarker(copy, rd.radiusKm ?? 5, rd.color ?? '#3b82f6', rd.fillStyle ?? DEFAULT_GEO_FILL_STYLE);
        });
        (marker._rangeSectors || []).forEach(p => {
            const sd = p._rangeSectorData || {};
            addRangeSectorToMarker(copy, sd.radiusKm ?? 5, sd.bearing ?? 0, sd.aperture ?? 90, sd.color ?? '#3b82f6', sd.fillStyle ?? DEFAULT_GEO_FILL_STYLE);
        });
        if (layersListEl) renderLayersList();
    }

    function duplicatePolyline(polyline) {
        const lls = polyline.getLatLngs?.() || [];
        const flat = (lls.length && lls[0] && Array.isArray(lls[0])) ? lls.flat() : lls;
        const offsetPts = flat.map(p => L.latLng((p?.lat ?? p?.[0]) + DUPLICATE_OFFSET, (p?.lng ?? p?.[1]) + DUPLICATE_OFFSET));
        const opts = { color: polyline.options?.color || '#3b82f6', weight: polyline.options?.weight || 4, dashArray: polyline.options?.dashArray };
        const copy = L.polyline(offsetPts, opts);
        copy._baseLineWeight = polyline._baseLineWeight != null ? polyline._baseLineWeight : (polyline.options?.weight ?? 4);
        if (polyline._geoType === 'freehand') {
            copy._geoType = 'freehand';
            const srcD = polyline._geoData || {};
            copy._geoData = { points: offsetPts, color: opts.color, ...applyImportedDisplayNameProps({ displayName: srcD.displayName }) };
            wireFreehandPolyline(copy);
        } else {
            wireTacticalLinePolyline(copy);
            const dn = trimmedDisplayNameFrom(polyline._lineDisplayName);
            if (dn) copy._lineDisplayName = dn;
        }
        addToActiveLayer(copy);
        if (layersListEl) renderLayersList();
    }

    function duplicateGeoPolygon(el) {
        const d = el._geoData || {};
        const color = d.color || '#3b82f6';
        const fillStyle = d.fillStyle || DEFAULT_GEO_FILL_STYLE;
        const geoType = el._geoType;
        const isMinefield = geoType === 'minefield';
        let offsetPts;
        let newData;
        if (geoType === 'oval' && d.corners?.length === 4) {
            const nc = d.corners.map(p => L.latLng(p.lat + DUPLICATE_OFFSET, p.lng + DUPLICATE_OFFSET));
            offsetPts = createEllipseRingFromBoundingCorners(nc, map, 64);
            newData = { ...d, corners: nc, color };
        } else {
            const lls = el.getLatLngs?.() || [];
            const ring = (lls[0] && Array.isArray(lls[0])) ? lls[0] : lls;
            offsetPts = ring.map(p => L.latLng((p?.lat ?? p?.[0]) + DUPLICATE_OFFSET, (p?.lng ?? p?.[1]) + DUPLICATE_OFFSET));
            newData = { ...d, corners: offsetPts, points: offsetPts, color };
        }
        const poly = L.polygon(offsetPts, isMinefield ? getMinefieldStyle(color, d.mineType || 'ap') : { ...getGeoShapeStyle(color, fillStyle) });
        poly._geoType = geoType;
        poly._geoData = newData;
        poly.bindPopup(buildGeoPopupContent(poly, geoType, poly._geoData), GEO_POPUP_OPTIONS);
        if (isMinefield) {
            poly.on('popupopen', () => {
                bindMinefieldResizeHandles(poly);
                bindGeoCenterMoveHandle(poly, geoType);
                bindGeoPopupHandlers(poly, geoType);
            });
            poly.on('popupclose', removeGeoResizeHandles);
        } else {
            poly.on('popupopen', () => {
                removeGeoResizeHandles();
                bindGeoCenterMoveHandle(poly, geoType);
                bindGeoPopupHandlers(poly, geoType);
            });
            poly.on('popupclose', removeGeoResizeHandles);
        }
        addToActiveLayer(poly);
        if (isMinefield) {
            poly.once('add', () => {
                applyMinefieldFill(poly);
                addMinefieldDecorations(poly, offsetPts, color, poly._layerId);
            });
        } else if (['vertical', 'horizontal', 'both'].includes(fillStyle)) {
            poly.once('add', () => scheduleGeoPathFill(poly));
        }
         addToActiveLayer(poly);
    }

    function duplicateTmgGroup(group) {
        const data = group._tmgData;
        if (!data?.segments?.length) return;
        const pts = [];
        data.segments.forEach((seg, i) => {
            const s = seg._tmgData;
            if (s?.latlng1 && i === 0) pts.push(L.latLng(s.latlng1.lat + DUPLICATE_OFFSET, s.latlng1.lng + DUPLICATE_OFFSET));
            if (s?.latlng2) pts.push(L.latLng(s.latlng2.lat + DUPLICATE_OFFSET, s.latlng2.lng + DUPLICATE_OFFSET));
        });
        const typeId = data.typeId || 'attack';
        const color = data.color || '#3b82f6';
        const filled = data.filled !== false;
        const dashed = data.dashed || false;
        const strokeWidth = data.strokeWidth ?? 4;
        const def = TACTICAL_GRAPHICS.find(d => d.id === typeId);
        if (pts.length < 2) return;
        if (pts.length === 2) {
            const seg = createTmgLayer(pts[0], pts[1], typeId, color, false, false, { filled, dashed, strokeWidth });
            if (seg) {
                Object.assign(seg._tmgData, applyImportedDisplayNameProps({ displayName: data.displayName }));
                addToActiveLayer(seg);
            }
        } else if (def && !def.pointSymbol) {
            const newGroup = L.layerGroup();
            const segments = [];
            for (let i = 0; i < pts.length - 1; i++) {
                const useBodyOnly = i < pts.length - 2;
                const seg = createTmgLayer(pts[i], pts[i + 1], typeId, color, useBodyOnly, true, { filled, dashed, strokeWidth });
                if (seg) {
                    newGroup.addLayer(seg);
                    segments.push(seg);
                    seg.on('click', () => newGroup.openPopup(seg.getLatLng()));
                }
            }
            newGroup._tmgData = { segments, typeId, color, filled, dashed, strokeWidth, ...applyImportedDisplayNameProps({ displayName: data.displayName }) };
            newGroup.bindPopup(buildGroupTmgPopupContent(newGroup));
            newGroup.on('popupclose', () => removeTmgResizeHandle());
            newGroup.on('popupopen', () => {
                newGroup.setPopupContent(buildGroupTmgPopupContent(newGroup));
                scheduleTmgPopupBind(() => {
                    bindGroupTmgPopupHandlers(newGroup);
                    showTmgGroupPopupSelectionUi(newGroup, newGroup._layerId);
                });
            });
            addToActiveLayer(newGroup);
        }
        if (layersListEl) renderLayersList();
    }

    function duplicateTmgSingle(marker) {
        const d = marker._tmgData;
        if (!d?.latlng1 || !d?.latlng2) return;
        const p1 = L.latLng(d.latlng1.lat + DUPLICATE_OFFSET, d.latlng1.lng + DUPLICATE_OFFSET);
        const p2 = L.latLng(d.latlng2.lat + DUPLICATE_OFFSET, d.latlng2.lng + DUPLICATE_OFFSET);
        const copy = createTmgLayer(p1, p2, d.typeId, d.color, false, false, { filled: d.filled, dashed: d.dashed, strokeWidth: d.strokeWidth ?? 4 });
        if (copy) {
            Object.assign(copy._tmgData, applyImportedDisplayNameProps({ displayName: d.displayName }));
            addToActiveLayer(copy);
        }
        if (layersListEl) renderLayersList();
    }

    /** Replace a 2-point TMG marker with a 1-segment group so multi-point tools (add vertex) apply — used for Front Line Border. */
    function replaceSingleTmgWithSegmentGroup(marker) {
        const d = marker._tmgData;
        if (!d?.latlng1 || !d?.latlng2) return null;
        const layer = layers.find(l => l.id === marker._layerId) || layers.find(l => l.elements.includes(marker));
        if (!layer) return null;
        const idx = layer.elements.indexOf(marker);
        if (marker.closePopup) marker.closePopup();
        removeTmgResizeHandle();
        layer.group.removeLayer(marker);
        if (idx >= 0) layer.elements.splice(idx, 1);

        const opts = { filled: d.filled, dashed: d.dashed, strokeWidth: d.strokeWidth ?? 4 };
        const seg = createTmgLayer(d.latlng1, d.latlng2, d.typeId, d.color, false, true, opts);
        if (!seg) return null;

        const group = L.layerGroup();
        seg.on('click', () => group.openPopup(seg.getLatLng()));
        group.addLayer(seg);
        group._tmgData = {
            segments: [seg],
            typeId: d.typeId,
            color: d.color,
            filled: d.filled !== false,
            dashed: !!d.dashed,
            strokeWidth: d.strokeWidth ?? 4,
            ...applyImportedDisplayNameProps({ displayName: d.displayName }),
        };
        group._layerId = layer.id;
        group.bindPopup(buildGroupTmgPopupContent(group));
        group.on('popupclose', () => removeTmgResizeHandle());
        group.on('popupopen', () => {
            group.setPopupContent(buildGroupTmgPopupContent(group));
            scheduleTmgPopupBind(() => {
                bindGroupTmgPopupHandlers(group);
                showTmgGroupPopupSelectionUi(group, group._layerId);
            });
        });
        layer.group.addLayer(group);
        layer.elements.splice(idx >= 0 ? idx : layer.elements.length, 0, group);

        const hist = actionHistory.find(a => a.type === 'add' && a.element === marker);
        if (hist) hist.element = group;

        if (layersListEl) renderLayersList();
        scheduleSaveToStorage();
        return group;
    }

    function getSymbolPopupDisplayName(sidc, mods) {
        const m = mods || {};
        const des = m.uniqueDesignation && String(m.uniqueDesignation).trim();
        if (des) return des;
        try {
            const norm = normalizeSidcInput(sidc);
            const fav = loadSidcFavorites().find(f => f.sidc === norm);
            if (fav && fav.label) return fav.label;
        } catch (_) { /* ignore */ }
        const metaLabel = getSidcMetadataLabel(sidc, m);
        if (metaLabel) return metaLabel;
        return typeof t === 'function' ? t('symbol-popup-default-name') : 'NATO unit symbol';
    }

    function getSymbolPopupEmblemHtml(marker) {
        const sidc = marker._sidc || '10031000001200000000';
        const mods = marker._textModifiers || {};
        const fallback = `<span class="symbol-popup-emblem-fallback" style="font-size:0.75rem;color:#94a3b8;">${typeof t === 'function' ? t('symbol-emblem-unavailable') : '—'}</span>`;
        try {
            const sym = new ms.Symbol(sidc, { ...mods, size: 38, simpleStatusModifier: true });
            if (!sym.isValid()) return fallback;
            const anchorPoint = sym.getAnchor();
            const w = sym.getSize().width;
            const h = sym.getSize().height;
            const rot = marker._symbolRotationDeg || 0;
            const svg = sym.asSVG();
            const inner = rot
                ? `<div class="symbol-popup-emblem-rot" style="width:${w}px;height:${h}px;transform:rotate(${rot}deg);transform-origin:${anchorPoint.x}px ${anchorPoint.y}px;">${svg}</div>`
                : svg;
            return inner;
        } catch (_) {
            return fallback;
        }
    }

    function refreshSymbolIcon(marker) {
        const sidc = marker._sidc || '10031000001200000000';
        const mods = marker._textModifiers || {};
        const baseSize = mods.size != null ? Number(mods.size) : 25;
        const scaledSize = Math.max(6, Math.round(baseSize * getMapViewPixelScale()));
        const opts = { ...mods, size: scaledSize, simpleStatusModifier: true };
        const sym = new ms.Symbol(sidc, opts);
        const anchorPoint = sym.getAnchor();
        const w = sym.getSize().width;
        const h = sym.getSize().height;
        const rot = marker._symbolRotationDeg || 0;
        const svg = sym.asSVG();
        const html = rot
            ? `<div style="width:${w}px;height:${h}px;transform:rotate(${rot}deg);transform-origin:${anchorPoint.x}px ${anchorPoint.y}px;">${svg}</div>`
            : svg;
        marker.setIcon(L.divIcon({
            className: 'custom-nato-marker',
            html,
            iconAnchor: [anchorPoint.x, anchorPoint.y],
            iconSize: [w, h]
        }));
    }

    // Initialise popup HTML builders — pass all closure-scoped helper deps
    // bind-handlers (bindGeoPopupHandlers, bindSymbolPopupHandlers) remain in app.js
    window.AppPopups.init({
        DEFAULT_GEO_FILL_STYLE,
        getGeoPrimaryKmValue,
        formatDistanceSecondaryHintSpanFromKm,
        escapeHtml,
        getGeoPopupKmLabel,
        coordInputHtml,
        formatKmAndNm,
        getFeatureDisplayNameInputHtml,
        getDrawingRotateControlsHtml,
        mapPopupCloseButtonHtml,
        getDistanceUnitPrimary,
        getCoordSystem,
        getSymbolPopupDisplayName,
        getSymbolPopupEmblemHtml,
        formatApproxAlternateDistanceFromKm,
        // For buildGroupTmgPopupContent
        getTmgLabel,
        getTmgSelectTypeHtml,
        // For bindGroupTmgPopupHandlers
        getTmgPopupDomRoot,
        bindMapPopupCloseButton,
        bindFeatureDisplayNameInput,
        removeFromLayer,
        duplicateTmgGroup,
        getInstructionText: () => instructionText,
        updateLineDrawingControls: (...args) => updateLineDrawingControls?.(...args),
        setReorientingTmgMarker: (v) => { reorientingTmgMarker = v; },
        setAddingPointTmgGroup: (v) => { addingPointTmgGroup = v; },
        TMG_SCALE_FACTOR,
        tmgMidpoint,
        updateTmgLayer,
        refreshMultiSegmentTmgGroupSelectionBox,
        getActiveResizeHandle: () => activeResizeHandle,
        applyTmgStyle,
        scheduleSaveToStorage,
        parseCoordInputElement,
        bindCoordEditorEvents,
        bindDrawingRotateControls,
        rotateTmgSegmentGroupByDegrees,
    });

    function bindSymbolPopupHandlers(marker) {
        const popup = marker.getPopup();
        const content = popup?.getElement();
        if (!content) return;
        L.DomEvent.disableClickPropagation(content);
        bindMapPopupCloseButton(content, marker);
        content.querySelector('.remove-btn')?.addEventListener('click', () => removeFromLayer(marker));
        content.querySelector('.duplicate-symbol-btn')?.addEventListener('click', () => duplicateSymbol(marker));
        content.querySelector('.symbol-edit-picker-btn')?.addEventListener('click', () => {
            editingSymbolMarker = marker;
            openPicker();
        });
        content.querySelector('.symbol-popup-status')?.addEventListener('change', (e) => {
            const opt = e.target.selectedOptions[0];
            const statusDigit = opt?.value;
            const statusKey = opt?.dataset?.key;
            if (statusDigit != null) {
                marker._sidc = setSidcStatus(marker._sidc, statusDigit);
                if (statusKey) marker._statusKey = statusKey;
                refreshSymbolIcon(marker);
                marker.setPopupContent(buildSymbolPopupContent(marker));
                bindSymbolPopupHandlers(marker);
                scheduleSaveToStorage();
            }
        });
        content.querySelector('.symbol-add-range-btn')?.addEventListener('click', () => {
            addRangeCircleToMarker(marker, 5, '#3b82f6', DEFAULT_GEO_FILL_STYLE);
            marker.setPopupContent(buildSymbolPopupContent(marker));
            bindSymbolPopupHandlers(marker);
            scheduleSaveToStorage();
        });
        content.querySelector('.symbol-add-range-sector-btn')?.addEventListener('click', () => {
            addRangeSectorToMarker(marker, 5, 0, 90, '#3b82f6', DEFAULT_GEO_FILL_STYLE);
            marker.setPopupContent(buildSymbolPopupContent(marker));
            bindSymbolPopupHandlers(marker);
            scheduleSaveToStorage();
        });
        content.querySelectorAll('.symbol-remove-range-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index, 10);
                if (isNaN(idx)) return;
                removeRangeCircleFromMarker(marker, idx);
                marker.setPopupContent(buildSymbolPopupContent(marker));
                bindSymbolPopupHandlers(marker);
                scheduleSaveToStorage();
            });
        });
        content.querySelectorAll('.symbol-range-radius').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.index, 10);
                if (isNaN(idx)) return;
                const r = parseFloat(e.target.value) || 5;
                const circle = (marker._rangeCircles || [])[idx];
                const rc = circle?._rangeData;
                updateRangeCircleStyle(marker, idx, r, rc?.color, rc?.fillStyle);
                if (rc) rc.radiusKm = r;
                marker.setPopupContent(buildSymbolPopupContent(marker));
                bindSymbolPopupHandlers(marker);
                scheduleSaveToStorage();
            });
        });
        content.querySelectorAll('.symbol-range-color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index, 10);
                const c = btn.dataset.color;
                if (isNaN(idx) || !c) return;
                const circle = (marker._rangeCircles || [])[idx];
                const rc = circle?._rangeData;
                updateRangeCircleStyle(marker, idx, rc?.radiusKm, c, rc?.fillStyle);
                if (rc) rc.color = c;
                marker.setPopupContent(buildSymbolPopupContent(marker));
                bindSymbolPopupHandlers(marker);
                scheduleSaveToStorage();
            });
        });
        content.querySelectorAll('.symbol-range-fill-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index, 10);
                const fs = btn.dataset.fill;
                if (isNaN(idx) || !fs) return;
                const circle = (marker._rangeCircles || [])[idx];
                const rc = circle?._rangeData;
                updateRangeCircleStyle(marker, idx, rc?.radiusKm, rc?.color, fs);
                if (rc) rc.fillStyle = fs;
                marker.setPopupContent(buildSymbolPopupContent(marker));
                bindSymbolPopupHandlers(marker);
                scheduleSaveToStorage();
            });
        });
        content.querySelectorAll('.symbol-remove-sector-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index, 10);
                if (isNaN(idx)) return;
                removeRangeSectorFromMarker(marker, idx);
                marker.setPopupContent(buildSymbolPopupContent(marker));
                bindSymbolPopupHandlers(marker);
                scheduleSaveToStorage();
            });
        });
        const bindSectorNumeric = (sel, key) => {
            content.querySelectorAll(sel).forEach(input => {
                input.addEventListener('change', (e) => {
                    const idx = parseInt(e.target.dataset.index, 10);
                    if (isNaN(idx)) return;
                    const poly = (marker._rangeSectors || [])[idx];
                    const sd = poly?._rangeSectorData;
                    if (!sd) return;
                    let v = parseFloat(e.target.value);
                    if (key === 'aperture') {
                        if (isNaN(v) || v < 1) v = 1;
                        if (v > 360) v = 360;
                    } else if (key === 'bearing') {
                        if (isNaN(v)) v = 0;
                        v = ((v % 360) + 360) % 360;
                    } else {
                        v = isNaN(v) || v < 0.1 ? 0.1 : v;
                        if (v > 500) v = 500;
                    }
                    updateRangeSectorStyle(marker, idx,
                        key === 'radiusKm' ? v : sd.radiusKm,
                        key === 'bearing' ? v : sd.bearing,
                        key === 'aperture' ? v : sd.aperture,
                        sd.color, sd.fillStyle);
                    marker.setPopupContent(buildSymbolPopupContent(marker));
                    bindSymbolPopupHandlers(marker);
                    scheduleSaveToStorage();
                });
            });
        };
        bindSectorNumeric('.symbol-sector-radius', 'radiusKm');
        bindSectorNumeric('.symbol-sector-bearing', 'bearing');
        bindSectorNumeric('.symbol-sector-aperture', 'aperture');
        content.querySelectorAll('.symbol-sector-color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index, 10);
                const c = btn.dataset.color;
                if (isNaN(idx) || !c) return;
                const poly = (marker._rangeSectors || [])[idx];
                const sd = poly?._rangeSectorData;
                updateRangeSectorStyle(marker, idx, sd?.radiusKm, sd?.bearing, sd?.aperture, c, sd?.fillStyle);
                marker.setPopupContent(buildSymbolPopupContent(marker));
                bindSymbolPopupHandlers(marker);
                scheduleSaveToStorage();
            });
        });
        content.querySelectorAll('.symbol-sector-fill-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index, 10);
                const fs = btn.dataset.fill;
                if (isNaN(idx) || !fs) return;
                const poly = (marker._rangeSectors || [])[idx];
                const sd = poly?._rangeSectorData;
                updateRangeSectorStyle(marker, idx, sd?.radiusKm, sd?.bearing, sd?.aperture, sd?.color, fs);
                marker.setPopupContent(buildSymbolPopupContent(marker));
                bindSymbolPopupHandlers(marker);
                scheduleSaveToStorage();
            });
        });
        content.querySelector('.symbol-popup-move-btn')?.addEventListener('click', () => {
            const system = getCoordSystem();
            let lat, lng;
            if (system === 'wgs84') {
                const latInput = content.querySelector('.symbol-popup-lat');
                const lngInput = content.querySelector('.symbol-popup-lng');
                lat = parseFloat(latInput?.value);
                lng = parseFloat(lngInput?.value);
            } else if (typeof CoordUtils !== 'undefined') {
                const coordInput = content.querySelector('.symbol-popup-coord');
                if (system === 'dms') {
                    const parsed = parseCoordInputElement(coordInput);
                    if (parsed) { lat = parsed.lat; lng = parsed.lng; }
                } else {
                    const parsed = CoordUtils.parse(coordInput?.value || '', system);
                    if (parsed) { lat = parsed.lat; lng = parsed.lng; }
                }
            }
            if (lat != null && lng != null && !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                marker.setLatLng([lat, lng]);
                syncMarkerRangeOverlays.call(marker);
                marker.setPopupContent(buildSymbolPopupContent(marker));
                bindSymbolPopupHandlers(marker);
                scheduleSaveToStorage();
            } else {
                alert(typeof t === 'function' ? t('invalid-coords') : 'Invalid coordinates. Lat: -90 to 90, Lng: -180 to 180.');
            }
        });
        content.querySelector('.symbol-popup-lat, .symbol-popup-coord')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') content.querySelector('.symbol-popup-move-btn')?.click();
        });
        content.querySelectorAll('.symbol-popup-coord input, .symbol-popup-coord select').forEach((el) => {
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    content.querySelector('.symbol-popup-move-btn')?.click();
                }
            });
        });
        content.querySelector('.symbol-popup-lng')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') content.querySelector('.symbol-popup-move-btn')?.click();
        });

        const editToggle = content.querySelector('.symbol-edit-toggle-btn');
        const editSection = content.querySelector('.symbol-edit-section');
        if (editToggle && editSection) {
            editToggle.addEventListener('click', () => {
                const visible = editSection.style.display !== 'none';
                editSection.style.display = visible ? 'none' : 'block';
            });
        }
        content.querySelector('.symbol-edit-picker-btn')?.addEventListener('click', () => {
            editingSymbolMarker = marker;
            openPicker();
        });
        content.querySelector('.symbol-edit-apply-btn')?.addEventListener('click', () => {
            const sidcInput = content.querySelector('.symbol-edit-sidc');
            const newSidc = normalizeSidcInput(sidcInput?.value);
            if (newSidc) marker._sidc = newSidc;

            const mods = { ...(marker._textModifiers || {}), size: 25 };
            const desig = content.querySelector('.symbol-edit-designation')?.value?.trim();
            const addtl = content.querySelector('.symbol-edit-additional')?.value?.trim();
            const alt = content.querySelector('.symbol-edit-altitude')?.value?.trim();
            const higher = content.querySelector('.symbol-edit-higher')?.value?.trim();
            if (desig) mods.uniqueDesignation = desig; else delete mods.uniqueDesignation;
            if (addtl) mods.additionalInformation = addtl; else delete mods.additionalInformation;
            if (alt) mods.altitudeDepth = alt; else delete mods.altitudeDepth;
            if (higher) mods.higherFormation = higher; else delete mods.higherFormation;
            marker._textModifiers = mods;

            refreshSymbolIcon(marker);
            marker.setPopupContent(buildSymbolPopupContent(marker));
            bindSymbolPopupHandlers(marker);
            scheduleSaveToStorage();
        });
        bindDrawingRotateControls(content, (delta) => {
            marker._symbolRotationDeg = normalizeBearingDeg((marker._symbolRotationDeg || 0) + delta);
            refreshSymbolIcon(marker);
            marker.setPopupContent(buildSymbolPopupContent(marker));
            bindSymbolPopupHandlers(marker);
            scheduleSaveToStorage();
        });
    }

    function bindGeoPopupHandlers(el, geoType) {
        const popup = el.getPopup();
        const content = popup?.getElement();
        if (!content) return;
        L.DomEvent.disableClickPropagation(content);
        bindMapPopupCloseButton(content, el);
        bindFeatureDisplayNameInput(content, '.geo-display-name-input', (v) => {
            if (!el._geoData) return;
            if (v) el._geoData.displayName = v;
            else delete el._geoData.displayName;
        });
        const geoKmInput = content.querySelector('.geo-popup-km-input');
        if (geoKmInput) {
            const updateGeoKmNmHint = () => {
                const km = parseDistancePopupInputToKm(geoKmInput.value);
                if (!isFinite(km)) return;
                const nmEl = content.querySelector('.geo-popup-km-nm-hint');
                if (nmEl) nmEl.textContent = formatDistanceSecondaryHintFromKm(km, 2) || '';
            };
            geoKmInput.addEventListener('input', updateGeoKmNmHint);
            const applyGeoKm = () => {
                const d = el._geoData;
                if (!d) return;
                const kmFromField = parseDistancePopupInputToKm(geoKmInput.value);
                if (!applyGeoPrimaryKmFromPopup(el, geoType, d, kmFromField)) return;
                afterGeoPrimaryKmEdit(el, geoType);
                el.setPopupContent(buildGeoPopupContent(el, geoType, d));
                bindGeoPopupHandlers(el, geoType);
                scheduleSaveToStorage();
            };
            geoKmInput.addEventListener('blur', applyGeoKm);
            geoKmInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); geoKmInput.blur(); }
            });
        }
        content.querySelectorAll('.geo-coord-input').forEach(inp => {
            const applyCoord = () => {
                const p = parseCoordInputElement(inp);
                if (!p) return;
                const newLl = L.latLng(p.lat, p.lng);
                const d = el._geoData;
                if (!d) return;
                if (inp.classList.contains('geo-coord-center')) {
                    d.center = newLl;
                    if (geoType === 'range-circle' || geoType === 'circle-2pt') {
                        if (el.setLatLng) el.setLatLng(newLl);
                    } else if (geoType === 'range-sector' || geoType === 'semi-circle') {
                        const pts = createSectorPolygon(newLl, d.radiusKm ?? 5, d.bearing ?? 0, geoType === 'range-sector' ? (d.aperture ?? 90) : 180);
                        el.setLatLngs(pts);
                    } else if (geoType === 'polygon') {
                        const pts = createRegularPolygon(newLl, d.radiusKm ?? 5, d.sides ?? 6, d.rotation ?? 0);
                        el.setLatLngs([pts]);
                    }
                } else {
                    const idx = parseInt(inp.dataset.index, 10);
                    if (isNaN(idx)) return;
                    if (geoType === 'distance') {
                        const pts = d.points || el.getLatLngs?.() || [];
                        const flatPts = Array.isArray(pts[0]) ? pts.flat() : pts;
                        if (idx >= 0 && idx < flatPts.length) {
                            flatPts[idx] = newLl;
                            d.points = flatPts;
                            el.setLatLngs(flatPts);
                            d.distanceKm = totalDistanceKm(flatPts);
                        }
                    } else if ((geoType === 'rectangle' || geoType === 'oval') && d.corners) {
                        if (idx >= 0 && idx < d.corners.length) {
                            d.corners[idx] = newLl;
                            if (geoType === 'oval') syncOvalPolygonFromCorners(el);
                            else el.setLatLngs(d.corners);
                        }
                    } else if (geoType === 'freeform' && el.getLatLngs) {
                        const rings = el.getLatLngs();
                        const pts = (Array.isArray(rings[0]) && Array.isArray(rings[0][0])) ? rings[0] : rings;
                        if (idx >= 0 && idx < pts.length) {
                            pts[idx] = newLl;
                            el.setLatLngs([pts]);
                        }
                    } else if (geoType === 'freehand' && el.getLatLngs) {
                        const pts = el.getLatLngs();
                        if (idx >= 0 && idx < pts.length) {
                            pts[idx] = newLl;
                            el.setLatLngs(pts);
                            if (el._geoData) el._geoData.points = pts;
                            syncPlainLineEndpointHandlePositions(el);
                        }
                    }
                }
                el.setPopupContent(buildGeoPopupContent(el, geoType, el._geoData));
                bindGeoPopupHandlers(el, geoType);
                if (geoType === 'distance') createDistanceWaypointMarkers(el);
                scheduleSaveToStorage();
            };
            bindCoordEditorEvents(inp, applyCoord);
        });
        const handle = content.querySelector('.geo-popup-drag-handle');
        if (handle) {
            let startLatLng, startMouse;
            const onMove = (e) => {
                const map = el._map || (typeof popup.getMap === 'function' ? popup.getMap() : null);
                if (!map) return;
                const delta = L.point(e.clientX - startMouse.x, e.clientY - startMouse.y);
                const startPoint = map.latLngToContainerPoint(startLatLng);
                const newPoint = startPoint.add(delta);
                const newLatLng = map.containerPointToLatLng(newPoint);
                popup.setLatLng(newLatLng);
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                handle.style.cursor = 'grab';
            };
            handle.addEventListener('mousedown', (e) => {
                L.DomEvent.stopPropagation(e);
                e.preventDefault();
                const map = el._map || (typeof popup.getMap === 'function' ? popup.getMap() : null);
                if (!map) return;
                startLatLng = popup.getLatLng();
                startMouse = { x: e.clientX, y: e.clientY };
                handle.style.cursor = 'grabbing';
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
        }
        content.querySelector('.remove-btn')?.addEventListener('click', () => removeFromLayer(el));
        content.querySelector('.minefield-type-select')?.addEventListener('change', (e) => {
            el._geoData.mineType = e.target.value;
            applyGeoShapeStyle(el);
            el.setPopupContent(buildGeoPopupContent(el, geoType, el._geoData));
            bindGeoPopupHandlers(el, geoType);
            scheduleSaveToStorage();
        });
        content.querySelector('.move-geo-btn')?.addEventListener('click', () => {
            el.closePopup();
            pendingGeoMove = { el, geoType };
            map.getContainer().style.cursor = 'crosshair';
            if (instructionText) instructionText.innerText = typeof t === 'function' ? t('inst-select-place') : 'Click on the map to place.';
            syncPlacementLayerInteractivity();
        });
        content.querySelector('.duplicate-geo-btn')?.addEventListener('click', () => {
            if (el._geoType === 'freehand') duplicatePolyline(el);
            else if (el instanceof L.Polygon) duplicateGeoPolygon(el);
            else if (el instanceof L.Circle) {
                const c = el.getLatLng();
                const d = el._geoData || {};
                const newC = L.latLng(c.lat + DUPLICATE_OFFSET, c.lng + DUPLICATE_OFFSET);
                const circle = L.circle(newC, { radius: el.getRadius(), ...getGeoShapeStyle(d.color, d.fillStyle) });
                const dupGeoType = el._geoType;
                circle._geoType = dupGeoType;
                circle._geoData = { ...d, center: newC };
                circle.bindPopup(buildGeoPopupContent(circle, dupGeoType, circle._geoData), GEO_POPUP_OPTIONS);
                circle.on('popupopen', () => {
                    removeGeoResizeHandles();
                    const cd = circle._geoData;
                    const handleLat = latLngAtBearing(cd.center, cd.radiusKm, 0);
                    createGeoResizeHandle(handleLat, (newLat, isFinal) => {
                        const distM = haversineDistance(cd.center.lat, cd.center.lng, newLat.lat, newLat.lng);
                        cd.radiusKm = parseFloat((distM / 1000).toFixed(2));
                        circle.setRadius(cd.radiusKm * 1000);
                        circle.setPopupContent(buildGeoPopupContent(circle, dupGeoType, cd));
                        bindGeoPopupHandlers(circle, dupGeoType);
                        syncGeoShapeHandlesToGeometry(circle, dupGeoType);
                        if (isFinal && activeGeoResizeHandles.length >= 1) {
                            activeGeoResizeHandles[0].setLatLng(latLngAtBearing(cd.center, cd.radiusKm, 0));
                        }
                        if (isFinal) scheduleSaveToStorage();
                    }, circle._layerId);
                    bindGeoCenterMoveHandle(circle, dupGeoType);
                    bindGeoPopupHandlers(circle, dupGeoType);
                });
                circle.on('popupclose', removeGeoResizeHandles);
                addToActiveLayer(circle);
            }
        });
        content.querySelectorAll('.geo-popup-color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const c = btn.dataset.color;
                if (!c) return;
                el._geoData.color = c;
                applyGeoShapeStyle(el);
                el.setPopupContent(buildGeoPopupContent(el, geoType, el._geoData));
                bindGeoPopupHandlers(el, geoType);
                scheduleSaveToStorage();
            });
        });
        content.querySelectorAll('.geo-popup-fill-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const fs = btn.dataset.fill;
                if (!fs) return;
                el._geoData.fillStyle = fs;
                applyGeoShapeStyle(el);
                el.setPopupContent(buildGeoPopupContent(el, geoType, el._geoData));
                bindGeoPopupHandlers(el, geoType);
                scheduleSaveToStorage();
            });
        });
        if (geoType === 'distance') {
            content.querySelector('.geo-add-waypoint-btn')?.addEventListener('click', () => {
                const d = el._geoData;
                const pts = d.points || el.getLatLngs?.() || [];
                if (pts.length < 2) return;
                const last = pts[pts.length - 1];
                const prev = pts[pts.length - 2];
                const mid = L.latLng((last.lat + prev.lat) / 2, (last.lng + prev.lng) / 2);
                pts.push(mid);
                d.pointLabels = d.pointLabels || [];
                d.pointLabels.push('');
                d.distanceKm = totalDistanceKm(pts);
                el.setLatLngs(pts);
                el.setPopupContent(buildGeoPopupContent(el, 'distance', d));
                bindGeoPopupHandlers(el, 'distance');
                createDistanceWaypointMarkers(el);
                scheduleSaveToStorage();
            });
            content.querySelectorAll('.geo-remove-waypoint-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.dataset.index, 10);
                    if (isNaN(idx)) return;
                    const d = el._geoData;
                    const pts = d.points || el.getLatLngs?.() || [];
                    if (pts.length <= 2) return;
                    pts.splice(idx, 1);
                    if (d.pointLabels) d.pointLabels.splice(idx, 1);
                    d.distanceKm = totalDistanceKm(pts);
                    el.setLatLngs(pts);
                    el.setPopupContent(buildGeoPopupContent(el, 'distance', d));
                    bindGeoPopupHandlers(el, 'distance');
                    createDistanceWaypointMarkers(el);
                    scheduleSaveToStorage();
                });
            });
            content.querySelectorAll('.geo-waypoint-name').forEach(input => {
                input.addEventListener('input', () => {
                    const idx = parseInt(input.dataset.index, 10);
                    if (isNaN(idx)) return;
                    const d = el._geoData;
                    d.pointLabels = d.pointLabels || [];
                    d.pointLabels[idx] = input.value;
                    syncDistanceWaypointMarkerLabelTooltips(el);
                });
                input.addEventListener('change', () => {
                    const idx = parseInt(input.dataset.index, 10);
                    if (isNaN(idx)) return;
                    const d = el._geoData;
                    d.pointLabels = d.pointLabels || [];
                    d.pointLabels[idx] = input.value.trim();
                    syncDistanceWaypointMarkerLabelTooltips(el);
                    scheduleSaveToStorage();
                });
            });
        }
        if (geoType !== 'range-circle' && geoType !== 'circle-2pt') {
            bindDrawingRotateControls(content, (delta) => {
                rotateGeoShapeByDegrees(el, geoType, delta);
                el.setPopupContent(buildGeoPopupContent(el, geoType, el._geoData));
                bindGeoPopupHandlers(el, geoType);
                if (geoType === 'distance') createDistanceWaypointMarkers(el);
                if (geoType === 'freehand') syncPlainLineEndpointHandlePositions(el);
            });
        }
    }

    function wireTacticalLinePolyline(polyline) {
        if (polyline._baseLineWeight == null) polyline._baseLineWeight = polyline.options?.weight ?? 4;
        applyZoomScaledStrokeToPolyline(polyline);
        polyline.bindPopup(buildLinePopupContent(polyline));
        polyline.on('popupopen', () => {
            removeTmgResizeHandle();
            polyline.setPopupContent(buildLinePopupContent(polyline));
            bindLinePopupHandlers(polyline);
            createPlainLineEndpointHandles(polyline);
        });
        polyline.on('popupclose', () => {
            if (activePlainLineEndpointHandles && activePlainLineEndpointHandles.polyline === polyline) {
                removePlainLineEndpointHandles();
            }
        });
    }

    window.AppMapEngine.init({
        getMap: () => map,
        getLayers: () => layers,
        getDrawLinePolyline: () => drawLinePolyline,
        getCircleXSnapLatLng: (rawLatLng) => findClosestCircleXCenter(rawLatLng),
        getAllElements,
        getSelectedTmgType: () => selectedTmgType,
        getAddingPointTmgGroup: () => addingPointTmgGroup,
        getLayersListEl: () => layersListEl,
        replaceSingleTmgWithSegmentGroup,
        createTmgLayer,
        updateTmgLayer,
        tmgMidpoint,
        renderLayersList,
        scheduleSaveToStorage,
        removeFromLayer,
        addToActiveLayer,
        wireTacticalLinePolyline,
        getActionHistory: () => actionHistory,
        getRedoHistory: () => redoHistory,
        allocatePolylineEraseGroupId: () => ++polylineEraseGroupIdCounter,
        syncPlacementLayerInteractivity,
        applyZoomScaledStrokeToPolyline,
        removeTmgResizeHandle,
        removeGeoResizeHandles,
        bindGeoCenterMoveHandle,
        bindGeoPopupHandlers,
        createPlainLineEndpointHandles,
        getActivePlainLineEndpointHandles: () => activePlainLineEndpointHandles,
        removePlainLineEndpointHandles,
        GEO_POPUP_OPTIONS,
        clipLatLngSegmentAvoidObstacles,
    });

    function buildCatkTailPopupContent(group) {
        const data = group._tmgData;
        if (!data || !data.isCatkMultiPoint) return '';
        const def = TACTICAL_GRAPHICS.find(d => d.id === data.typeId);
        const ptCount = data.points?.length || 0;
        const isParametricArrow = !!data.isParametricArrow;
        const catkPtRole = (i) => {
            if (isParametricArrow) {
                if (i === 0) return '1 — arrow tip';
                if (i === 1) return '2 — neck control';
                return '3 — tail base';
            }
            if (typeof t !== 'function') {
                if (i === 0) return '1 — arrow tip (fire direction)';
                if (i === 1) return '2 — toward tail (bend arrow path here)';
                return `${i + 1} — tail`;
            }
            if (i === 0) return t('catk-pt-arrow-tip');
            if (i === 1) return t('catk-pt-toward-tail');
            return t('catk-pt-tail-vertex', String(i + 1));
        };
        const coordLines = (data.points || []).map((p, i) => {
            return `<label style="display:block;margin:4px 0;font-size:0.7rem;color:#6b7280;text-align:left;">${escapeHtml(catkPtRole(i))}: ${coordInputHtml('catk-tgm-coord-input', p.lat, p.lng, `data-index="${i}"`, 'width:100%;max-width:200px;padding:4px 6px;font-size:0.75rem;border:1px solid #cbd5e1;border-radius:4px;')}</label>`;
        }).join('');
        const coordBlock = coordLines ? `<div style="margin:6px 0;padding:6px;background:#f8fafc;border-radius:4px;text-align:left;max-height:80px;overflow-y:auto;">${coordLines}</div>` : '';
        const catkDefaultTitle = `${def ? getTmgLabel(def) : 'Counterattack By Fire'} (${ptCount} points)`;
        const legacyBendButtons = data.isParametricArrow ? '' : `
                <button type="button" class="catk-add-shaft-bend-btn" style="margin:6px 4px 0 0;cursor:pointer;padding:4px 10px;font-size:0.75rem;border-radius:6px;border:1px solid #cbd5e1;background:#e0f2fe;">${typeof t === 'function' ? t('catk-add-shaft-bend') : 'Add bend (arrow / shaft)'}</button>
                <button type="button" class="catk-add-tail-bend-btn" style="margin:6px 4px 0 0;cursor:pointer;padding:4px 10px;font-size:0.75rem;border-radius:6px;border:1px solid #cbd5e1;background:#f1f5f9;">${typeof t === 'function' ? t('catk-add-tail-bend') : 'Add bend on tail'}</button>`;
        return `
            <div style="text-align:center;">
                <div class="map-popup-header-bar">${mapPopupCloseButtonHtml()}</div>
                ${getFeatureDisplayNameInputHtml('catk-display-name-input', data.displayName, catkDefaultTitle)}
                <span style="font-size:0.7rem;color:#6b7280;">${typeof t === 'function' ? t('catk-popup-hint') : 'All dashed, same stroke weight. By fire: dashed stem + open V (no fill). Tail—drag handles. Coordinates below.'}</span>
                ${coordBlock}
                ${getTmgSelectTypeHtml(catkPopupStylePayload(data), { showFillToggles: false })}
                ${getDrawingRotateControlsHtml()}
                ${legacyBendButtons}
                <button class="duplicate-tmg-btn" style="margin:5px 4px 0 0; cursor: pointer;">${typeof t === 'function' ? t('duplicate') : 'Duplicate'}</button>
                <button class="remove-tmg-btn" style="margin-top: 5px; color: red; cursor: pointer;">${typeof t === 'function' ? t('remove-graphic') : 'Remove Graphic'}</button>
            </div>
        `;
    }

    /** After popup DOM is ready (moved to #popup-anchor on map popupopen), bind + show handles. */
    function onCatkGroupPopupOpen(group) {
        group.setPopupContent(buildCatkTailPopupContent(group));
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                bindCatkTailPopupHandlers(group);
                const d = group._tmgData;
                if (d?.headMarker?._tmgData) {
                    d.headMarker._catkGroup = group;
                    createTmgSelectionBox(d.headMarker, group._layerId);
                }
            });
        });
    }

    function bindCatkTailPopupHandlers(group) {
        const data = group._tmgData;
        if (!data) return;
        const content = getTmgPopupDomRoot(group);
        if (!content) return;
        L.DomEvent.disableClickPropagation(content);
        bindMapPopupCloseButton(content, group);
        bindFeatureDisplayNameInput(content, '.catk-display-name-input', (v) => {
            if (!data) return;
            if (v) data.displayName = v;
            else delete data.displayName;
        });
        content.querySelectorAll('.tmg-style-btn').forEach(btn => {
            L.DomEvent.on(btn, 'click', (e) => {
                L.DomEvent.stopPropagation(e);
                e.preventDefault();
                const dashed = btn.dataset.dashed === 'true';
                applyCatkMultiPointStyle(group, { dashed });
                content.querySelectorAll('.tmg-style-btn').forEach(b => b.classList.toggle('active', b.dataset.dashed === String(dashed)));
            });
        });
        content.querySelectorAll('.tmg-color-btn').forEach(btn => {
            L.DomEvent.on(btn, 'click', (e) => {
                L.DomEvent.stopPropagation(e);
                e.preventDefault();
                const color = btn.dataset.color;
                applyCatkMultiPointStyle(group, { color });
                content.querySelectorAll('.tmg-color-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.color === color);
                    b.style.borderColor = b.dataset.color === color ? '#fff' : 'transparent';
                });
            });
        });
        const syncCatkPopupWidth = () => {
            const inp = content.querySelector('.tmg-width-input');
            const slider = content.querySelector('.tmg-width-slider');
            if (!inp) return;
            const v = parseFloat(inp.value);
            const w = (v >= 1 && v <= 30) ? v : 4;
            inp.value = w;
            if (slider) slider.value = w;
            applyCatkMultiPointStyle(group, { strokeWidth: w });
        };
        content.querySelector('.tmg-width-input')?.addEventListener('input', syncCatkPopupWidth);
        content.querySelector('.tmg-width-slider')?.addEventListener('input', () => {
            const inp = content.querySelector('.tmg-width-input');
            const sl = content.querySelector('.tmg-width-slider');
            if (sl && inp) { inp.value = sl.value; syncCatkPopupWidth(); }
        });
        content.querySelector('.remove-tmg-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFromLayer(group);
        });
        content.querySelector('.catk-add-shaft-bend-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const pts = data.points;
            if (!pts || pts.length < 2 || !data.tailPolyline || !data.headMarker) return;
            data.catkAutoJunction = false;
            const a = pts[0];
            const b = pts[1];
            const mid = L.latLng((a.lat + b.lat) / 2, (a.lng + b.lng) / 2);
            pts.splice(1, 0, mid);
            if (!data.arrowParams && data.lockedArrowParams && pts.length >= 3) {
                // Keep index 1 as the primary tail anchor used by locked parametric controls.
                const anchor = pts[2];
                const bend = pts[1];
                pts[1] = anchor;
                pts[2] = bend;
                catkEnsureLockedArrowParams(data);
            }
            data.tailPolyline.setLatLngs(catkBuildTailPathFromPoints(pts));
            syncCatkHeadMarkerToPoints(data.headMarker, data);
            group.setPopupContent(buildCatkTailPopupContent(group));
            bindCatkTailPopupHandlers(group);
            removeTmgResizeHandle();
            requestAnimationFrame(() => {
                data.headMarker._catkGroup = group;
                createTmgSelectionBox(data.headMarker, group._layerId);
            });
            scheduleSaveToStorage();
        });
        content.querySelector('.catk-add-tail-bend-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const pts = data.points;
            if (!pts || pts.length < 3 || !data.tailPolyline || !data.headMarker) return;
            if (data.catkAutoJunction && pts.length === 3) data.catkAutoJunction = false;
            const n = pts.length;
            const tailA = pts[n - 1];
            const tailB = pts[n - 2];
            const mid = L.latLng((tailA.lat + tailB.lat) / 2, (tailA.lng + tailB.lng) / 2);
            pts.splice(n - 1, 0, mid);
            if (!data.arrowParams && data.lockedArrowParams) catkEnsureLockedArrowParams(data);
            data.tailPolyline.setLatLngs(catkBuildTailPathFromPoints(pts));
            syncCatkHeadMarkerToPoints(data.headMarker, data);
            group.setPopupContent(buildCatkTailPopupContent(group));
            bindCatkTailPopupHandlers(group);
            removeTmgResizeHandle();
            requestAnimationFrame(() => {
                data.headMarker._catkGroup = group;
                createTmgSelectionBox(data.headMarker, group._layerId);
            });
            scheduleSaveToStorage();
        });
        content.querySelector('.duplicate-tmg-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const color = data.color || getLineColor();
            const strokeWidth = data.strokeWidth ?? getTmgStrokeWidth();
            if (data.arrowParams) {
                const params = normalizeCatkArrowParams({
                    ...data.arrowParams,
                    tip: L.latLng(data.arrowParams.tip.lat + 0.001, data.arrowParams.tip.lng + 0.001)
                });
                const newGroup = createParametricCatkGroup(data.typeId, params, {
                    color,
                    strokeWidth,
                    arrowHeadScale: data.arrowHeadScale ?? 1.0,
                    dashed: resolveCatkMultiPointDashed(data.typeId, data),
                    displayName: data.displayName
                });
                if (newGroup) addToActiveLayer(newGroup);
                return;
            }
            const pts = (data.points || []).map(p => L.latLng(p.lat + 0.001, p.lng + 0.001));
            if (pts.length < 2) return;
            const newGroup = L.layerGroup();
            const tailPolyline = L.polyline(catkBuildTailPathFromPoints(pts), catkHitPolylineOptions(color, strokeWidth));
            const shiftedLocked = catkShiftLockedArrowParamsByOffset(data.lockedArrowParams, 0.001, 0.001);
            const headMarker = createCatkUnifiedMarker(pts, data.typeId, color, strokeWidth, undefined, {
                ...data,
                arrowParams: null,
                lockedArrowParams: shiftedLocked,
                legacyBodyWidthKm: isFinite(Number(data.legacyBodyWidthKm)) ? Number(data.legacyBodyWidthKm) : (shiftedLocked?.bodyWidthKm ?? null)
            });
            if (headMarker?._tmgData) {
                headMarker._tmgData.arrowParams = null;
            }
            newGroup.addLayer(tailPolyline);
            if (headMarker) newGroup.addLayer(headMarker);
            newGroup._tmgData = {
                typeId: data.typeId,
                points: pts.slice(),
                color,
                strokeWidth,
                arrowHeadScale: data.arrowHeadScale ?? 1.0,
                arrowHeadWidth: data.arrowHeadWidth ?? 1.0,
                legacyBodyWidthKm: isFinite(Number(data.legacyBodyWidthKm)) ? Number(data.legacyBodyWidthKm) : (shiftedLocked?.bodyWidthKm ?? null),
                lockedArrowParams: shiftedLocked,
                tailPolyline,
                headMarker,
                isCatkMultiPoint: true,
                isParametricArrow: false,
                catkAutoJunction: !!data.catkAutoJunction,
                preserveLegacyPoints: !!data.preserveLegacyPoints,
                dashed: resolveCatkMultiPointDashed(data.typeId, data),
                ...applyImportedDisplayNameProps({ displayName: data.displayName })
            };
            if (headMarker) headMarker._catkGroup = newGroup;
            newGroup.bindPopup(buildCatkTailPopupContent(newGroup));
            newGroup.on('popupclose', () => removeTmgResizeHandle());
            newGroup.on('popupopen', () => onCatkGroupPopupOpen(newGroup));
            tailPolyline.on('click', (e) => { L.DomEvent.stopPropagation(e); newGroup.openPopup(e.latlng); });
            if (headMarker) headMarker.on('click', () => newGroup.openPopup(headMarker.getLatLng()));
            addToActiveLayer(newGroup);
        });
        content.querySelectorAll('.catk-tgm-coord-input').forEach(inp => {
            const applyCoord = () => {
                const idx = parseInt(inp.dataset.index, 10);
                if (isNaN(idx) || !data.points || idx >= data.points.length) return;
                const p = parseCoordInputElement(inp);
                if (!p) return;
                if (data.arrowParams) {
                    const params = normalizeCatkArrowParams(data.arrowParams);
                    if (!params) return;
                    const nextLatLng = L.latLng(p.lat, p.lng);
                    if (idx === 0) {
                        const handles = catkArrowEditHandleLatLngs(params);
                        if (!handles) return;
                        const neckCenter = handles.neckCenter;
                        const neckOffsetKm = Math.max(CATK_ARROW_MIN_HEAD_LENGTH_KM, haversineDistance(neckCenter.lat, neckCenter.lng, nextLatLng.lat, nextLatLng.lng) / 1000);
                        data.arrowParams = normalizeCatkArrowParams({
                            ...params,
                            tip: nextLatLng,
                            directionDeg: bearingDegrees(neckCenter, nextLatLng),
                            neckOffsetKm
                        });
                    } else if (idx === 1) {
                        const tip = params.tip;
                        const neckOffsetKm = Math.max(CATK_ARROW_MIN_HEAD_LENGTH_KM, haversineDistance(tip.lat, tip.lng, nextLatLng.lat, nextLatLng.lng) / 1000);
                        data.arrowParams = normalizeCatkArrowParams({
                            ...params,
                            directionDeg: bearingDegrees(nextLatLng, tip),
                            neckOffsetKm
                        });
                    } else if (idx === 2) {
                        const currentPts = catkArrowPointsFromParams(params);
                        const neckCenter = currentPts[1];
                        const tailLengthKm = Math.max(CATK_ARROW_MIN_TAIL_LENGTH_KM, haversineDistance(neckCenter.lat, neckCenter.lng, nextLatLng.lat, nextLatLng.lng) / 1000);
                        data.arrowParams = normalizeCatkArrowParams({ ...params, tailLengthKm });
                    }
                    catkApplyArrowParamsToData(data);
                    if (data.headMarker) syncCatkHeadMarkerToPoints(data.headMarker, data);
                    refreshTmgSelectionBox(data.headMarker, group._layerId);
                    scheduleSaveToStorage();
                    return;
                }
                const hadAutoJunction = data.catkAutoJunction;
                data.points[idx] = L.latLng(p.lat, p.lng);
                if (idx === 1 && data.catkAutoJunction) data.catkAutoJunction = false;
                if (data.catkAutoJunction && data.points.length === 3 && (idx === 0 || idx === 2)) {
                    data.points[1] = catkInterpOnTailAxis(data.points[2], data.points[0], CATK_AUTO_JUNCTION_T);
                }
                if (data.lockedArrowParams) {
                    // Keep locked parametric head/body synced when legacy tail vertices move.
                    catkEnsureLockedArrowParams(data);
                }
                if (data.headMarker) syncCatkHeadMarkerToPoints(data.headMarker, data);
                if (hadAutoJunction && !data.catkAutoJunction && data.points.length === 3) {
                    removeTmgResizeHandle();
                    requestAnimationFrame(() => createTmgSelectionBox(data.headMarker, group._layerId));
                } else {
                    refreshTmgSelectionBox(data.headMarker, group._layerId);
                }
                scheduleSaveToStorage();
            };
            bindCoordEditorEvents(inp, applyCoord);
        });
        bindDrawingRotateControls(content, (delta) => {
            rotateCatkMultiPointGroupByDegrees(group, delta);
            group.setPopupContent(buildCatkTailPopupContent(group));
            bindCatkTailPopupHandlers(group);
        });
    }

    function refreshDistanceUnitDisplays() {
        if (!map) return;
        getAllElements().forEach(el => {
            if (el._geoType === 'distance') {
                try { createDistanceSegmentLabelMarkers(el); } catch (e) { /* ignore */ }
            }
        });
        try { refreshZoomScaledMapOverlays(); } catch (e) { /* ignore */ }
        layers.forEach(lay => {
            lay.elements.forEach(el => {
                let pop;
                try {
                    pop = el.getPopup?.();
                } catch (e2) { return; }
                if (!pop || typeof pop.isOpen !== 'function' || !pop.isOpen()) return;
                try {
                    if (el._geoType) {
                        el.setPopupContent(buildGeoPopupContent(el, el._geoType, el._geoData));
                        bindGeoPopupHandlers(el, el._geoType);
                    } else if (el instanceof L.Polyline && el._baseLineWeight != null && !el._geoType && !el._tmgData) {
                        el.setPopupContent(buildLinePopupContent(el));
                        bindLinePopupHandlers(el);
                    } else if (el instanceof L.Marker && el._sidc) {
                        el.setPopupContent(buildSymbolPopupContent(el));
                        bindSymbolPopupHandlers(el);
                    } else if (el instanceof L.Marker && typeof el._buildTmgPopupContent === 'function' && el._tmgData) {
                        el.setPopupContent(el._buildTmgPopupContent());
                        const def = TACTICAL_GRAPHICS.find(d => d.id === el._tmgData.typeId);
                        if (def) bindSingleTmgPopupHandlers(el, el._buildTmgPopupContent, def);
                    } else if (el instanceof L.LayerGroup && el._tmgData?.isCatkMultiPoint) {
                        el.setPopupContent(buildCatkTailPopupContent(el));
                        bindCatkTailPopupHandlers(el);
                    }
                } catch (e3) { /* ignore */ }
            });
        });
        refreshTmgSidebarLengthForUnit();
    }

    function syncDistanceUnitToggleButton() {
        const btn = document.getElementById('distance-unit-toggle-btn');
        if (!btn) return;
        const nmFirst = getDistanceUnitPrimary() === 'nm';
        btn.textContent = typeof t === 'function'
            ? (nmFirst ? t('distance-unit-btn-nm') : t('distance-unit-btn-km'))
            : (nmFirst ? 'NM' : 'km');
        btn.title = typeof t === 'function'
            ? (nmFirst ? t('distance-unit-title-nm') : t('distance-unit-title-km'))
            : (nmFirst ? 'Nautical miles first — click for km first' : 'Kilometers first — click for NM first');
    }

    function syncDistanceUnitSelect() {
        const sel = document.getElementById('distance-unit-select');
        if (!sel) return;
        const v = getDistanceUnitPrimary();
        sel.value = v === 'nm' ? 'nm' : 'km';
    }

    function getTmgSelectTypeHtml(data, htmlOpts = {}) {
        const showFillToggles = htmlOpts.showFillToggles !== false;
        const filled = data.filled !== false;
        const dashed = data.dashed || false;
        const strokeWidth = data.strokeWidth ?? 4;
        const color = data.color || '#3b82f6';
        const colorBtns = TMG_COLOR_PRESETS.map(p => {
            const isActive = (p.color || '').toLowerCase() === (color || '').toLowerCase();
            return `<button type="button" class="tmg-color-btn ${isActive ? 'active' : ''}" data-color="${p.color}" title="${p.label}" style="background:${p.color};border:2px solid ${isActive ? '#fff' : 'transparent'}"></button>`;
        }).join('');
        const fillRow = showFillToggles
            ? `<div style="display:flex;gap:4px;">
                        <button type="button" class="tmg-fill-btn ${filled ? 'active' : ''}" data-filled="true">Filled</button>
                        <button type="button" class="tmg-fill-btn ${!filled ? 'active' : ''}" data-filled="false">Hollow</button>
                    </div>`
            : '';
        return `
            <div class="tmg-select-type" style="margin:8px 0;padding:8px 0;border-top:1px solid #e5e7eb;">
                <b style="font-size:0.75rem;color:#6b7280;">Select type</b>
                <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;">
                    <div style="display:flex;gap:4px;">
                        <button type="button" class="tmg-style-btn ${!dashed ? 'active' : ''}" data-dashed="false">Solid</button>
                        <button type="button" class="tmg-style-btn ${dashed ? 'active' : ''}" data-dashed="true">Dotted</button>
                    </div>
                    ${fillRow}
                </div>
                <div style="margin-top:6px;">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="font-size:0.75rem;color:#6b7280;">Width:</span>
                        <input type="number" class="tmg-width-input" min="1" max="30" value="${strokeWidth}" step="0.5" style="width:48px;padding:2px 4px;font-size:0.8rem;">
                    </div>
                    <input type="range" class="tmg-width-slider" min="1" max="30" value="${strokeWidth}" step="0.5" style="width:100%;margin-top:4px;">
                </div>
                <div style="margin-top:6px;display:flex;align-items:center;gap:6px;">
                    <span style="font-size:0.75rem;color:#6b7280;">Color:</span>
                    <div style="display:flex;gap:4px;">${colorBtns}</div>
                </div>
            </div>
        `;
    }

    function applyTmgStyle(target, style) {
        if (target._tmgData?.isCatkMultiPoint) {
            applyCatkMultiPointStyle(target, style);
            return;
        }
        const updateOne = (seg) => {
            if (style.filled !== undefined) seg._tmgData.filled = style.filled;
            if (style.dashed !== undefined) seg._tmgData.dashed = style.dashed;
            if (style.color !== undefined) seg._tmgData.color = style.color;
            if (style.strokeWidth !== undefined) seg._tmgData.strokeWidth = style.strokeWidth;
            updateTmgLayer(seg);
        };
        if (target._tmgData?.segments) {
            const data = target._tmgData;
            if (style.filled !== undefined) data.filled = style.filled;
            if (style.dashed !== undefined) data.dashed = style.dashed;
            if (style.color !== undefined) data.color = style.color;
            if (style.strokeWidth !== undefined) data.strokeWidth = style.strokeWidth;
            data.segments.forEach(updateOne);
        } else {
            updateOne(target);
        }
    }

    /** Scale NATO symbols, text labels, line/polygon strokes, TMG icons, and CATK arrows
     *  with zoom (stored sizes stay logical; screen px follows map zoom).
     *  Combines all per-element zoom updates into a single pass over elements.
     *  Obstacle routing is skipped during bulk refresh — the visual difference is
     *  negligible and it avoids heavy 2500-point polygon intersection per CATK arrow. */
    function refreshZoomScaledMapOverlays() {
        if (!map) return;
        _skipObstacleRouting = true;
        getAllElements().forEach((el) => {
            if (el._tmgData?.isCatkMultiPoint && el._tmgData?.headMarker) {
                syncCatkHeadMarkerToPoints(el._tmgData.headMarker, el._tmgData);
            } else if (el._tmgData?.segments) {
                el._tmgData.segments.forEach(seg => updateTmgLayer(seg));
            } else if (el._tmgData) {
                updateTmgLayer(el);
            } else if (el instanceof L.Marker && el._sidc && !el._isTextLabel) {
                refreshSymbolIcon(el);
            } else if (el instanceof L.Marker && el._isTextLabel) {
                el.setIcon(buildTextLabelIcon(el));
            } else if ((el instanceof L.Polyline || el instanceof L.Polygon)) {
                const o = el.options || {};
                if (Number(o.opacity) === 0 && String(o.className || '').includes('catk-hit')) return;
                if (el._baseLineWeight == null) el._baseLineWeight = (o.weight != null ? o.weight : (el instanceof L.Polygon ? 2 : 3));
                applyZoomScaledStrokeToPolyline(el);
            }
        });
        _skipObstacleRouting = false;
    }

    function syncScallopedSegmentPositions(group) {
        if (!group || !group._tmgData?.segments) return;
        group._tmgData.segments.forEach((seg) => {
            if (seg?._tmgData) {
                const d = seg._tmgData;
                const mid = tmgMidpoint(d.latlng1, d.latlng2);
                seg.setLatLng(mid);
            }
        });
    }

    // Only refresh overlays AFTER zoom completes (zoomend), not during the
    // animation (zoom). Leaflet's CSS transforms keep markers visually scaled
    // during the animation; regenerating all SVGs on every frame was causing
    // severe lag with many map elements + 2500-point obstacle routing.
    map.on('zoomend', refreshZoomScaledMapOverlays);
    map.whenReady(() => { refreshZoomScaledMapOverlays(); });

    // Hatch patterns and selection boxes need refreshing on both zoom and pan.
    // TMG/symbol/stroke updates are handled by refreshZoomScaledMapOverlays on zoomend.
    map.on('zoomend moveend', () => {
        scheduleRefreshAllGeoObstacleHatches();
        if (activeTmgSelectionBox?.isSegmentGroup && activeTmgSelectionBox._group) {
            refreshMultiSegmentTmgGroupSelectionBox(activeTmgSelectionBox._group);
        }
    });

    const tmgWidthInput = document.getElementById('tmg-width-input');
    const tmgWidthSlider = document.getElementById('tmg-width-slider');
    if (tmgWidthInput && tmgWidthSlider) {
        const syncWidth = () => {
            const v = parseFloat(tmgWidthInput.value);
            const w = (v >= 1 && v <= 30) ? v : 4;
            tmgWidthInput.value = w;
            tmgWidthSlider.value = w;
        };
        tmgWidthInput.addEventListener('input', () => { tmgWidthSlider.value = tmgWidthInput.value; });
        tmgWidthSlider.addEventListener('input', () => { tmgWidthInput.value = tmgWidthSlider.value; });
    }

    if (tmgGrid) {
        TACTICAL_GRAPHICS.forEach(def => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'tmg-picker-item tmg-btn';
            btn.setAttribute('role', 'listitem');
            btn.dataset.tmgId = def.id;
            btn.title = getTmgLabel(def);
            let btnContent;
            if (def.svgFile) {
                btnContent = `<div class="tmg-picker-thumb" aria-hidden="true"><img src="${def.svgFile}" alt="" class="tmg-btn-img"/></div><span class="tmg-picker-label">${getTmgLabel(def)}</span>`;
            } else {
                const pathForBtn = def.previewPath || def.path;
                const paths = Array.isArray(pathForBtn) ? pathForBtn : [pathForBtn];
                const pathEls = paths.map(p => {
                    const d = typeof p === 'string' ? p : (p?.d || '');
                    const dashed = typeof p === 'object' && p?.dashed;
                    const style = dashed ? 'stroke-dasharray:3,4;stroke-linecap:round;stroke-linejoin:round;' : '';
                    return d ? `<path d="${d}" style="${style}"/>` : '';
                }).filter(Boolean).join('');
                const btnText = def.text
                    ? `<text x="${def.textX ?? 50}" y="${def.textY ?? 20}" text-anchor="middle" dominant-baseline="middle" style="fill:var(--tmg-preview-color);font-size:${def.textSize ?? 12}px;font-weight:${def.textWeight ?? 600};font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;">${def.text}</text>`
                    : '';
                btnContent = `<div class="tmg-picker-thumb" aria-hidden="true"><svg class="${def.filled ? 'filled' : ''}" viewBox="0 0 100 40" preserveAspectRatio="xMidYMid meet">${pathEls}${btnText}</svg></div><span class="tmg-picker-label">${getTmgLabel(def)}</span>`;
            }
            btn.innerHTML = btnContent;
            btn.addEventListener('click', () => {
                tmgGrid.querySelectorAll('.tmg-btn').forEach(b => b.classList.remove('active'));
                const arrowShapeTypes = new Set(['attack', 'main-attack', 'counterattack', 'counterattack-by-fire']);
                const arrowShapeControls = document.getElementById('arrow-shape-controls');
                if (selectedTmgType === def.id) {
                    selectedTmgType = null;
                    tmgPoints = [];
                    catkPlacementState = null;
                    lastParametricCatkPlacementClick = null;
                    clearPlacementPreview();
                    if (arrowShapeControls) arrowShapeControls.style.display = 'none';
                    if (currentMode === 'line') instructionText.innerText = t('inst-line-draw-change');
                } else {
                    selectedTmgType = def.id;
                    tmgPoints = [];
                    catkPlacementState = null;
                    lastParametricCatkPlacementClick = null;
                    clearPlacementPreview();
                    btn.classList.add('active');
                    if (arrowShapeControls) arrowShapeControls.style.display = arrowShapeTypes.has(def.id) ? '' : 'none';
                    if (currentMode === 'line') instructionText.innerText = t(instPlaceTmgKeyForTypeId(def.id), getTmgLabel(def));
                }
                updateLineDrawingControls();
            });
            tmgGrid.appendChild(btn);
        });

        syncMissionPickerFocus();
        updateMissionGraphicAssist();

        // Wire the arrow tip length slider/input to stay in sync
        const arrowTipInput = document.getElementById('tmg-arrow-tip-input');
        const arrowTipSlider = document.getElementById('tmg-arrow-tip-slider');
        if (arrowTipInput && arrowTipSlider) {
            arrowTipInput.addEventListener('input', () => {
                arrowTipSlider.value = arrowTipInput.value;
            });
            arrowTipSlider.addEventListener('input', () => {
                arrowTipInput.value = arrowTipSlider.value;
            });
        }
    }

    modeSelect.addEventListener('change', (e) => {
        currentMode = e.target.value;
        // Restore circle-X interactivity when leaving scalloped drawing mode
        setScallopedDrawingIntercept(false);

        if (currentMode === 'pan') {
            map.getContainer().style.cursor = '';
            map.dragging.enable();
            instructionText.innerText = t('inst-pan');
            clearPlacementPreview();
            cancelLineDrawing();
            clearSelection();
            switchSidebarForMode('pan');
            updateLineDrawingControls();
        } else if (currentMode === 'symbol') {
            map.getContainer().style.cursor = 'crosshair';
            map.dragging.enable();
            instructionText.innerText = t('inst-symbol');
            cancelLineDrawing();
            clearSelection();
            switchSidebarForMode('symbol');
            updateLineDrawingControls();
        } else if (currentMode === 'line') {
            map.getContainer().style.cursor = 'crosshair';
            map.dragging.enable();
            cancelLineDrawing();
            clearSelection();
            syncTmgPreviewColor();
            const def = selectedTmgType ? TACTICAL_GRAPHICS.find(d => d.id === selectedTmgType) : null;
            instructionText.innerText = def ? t(instPlaceTmgKeyForTypeId(def.id), getTmgLabel(def)) : t('inst-line-draw');
            switchSidebarForMode('line');
            updateLineDrawingControls();
        } else if (currentMode === 'eraser') {
            map.getContainer().style.cursor = 'cell';
            map.dragging.disable();
            clearPlacementPreview();
            cancelLineDrawing();
            clearSelection();
            instructionText.innerText = t('inst-eraser');
            switchSidebarForMode('eraser');
            updateLineDrawingControls();
        } else if (currentMode === 'select') {
            map.getContainer().style.cursor = 'crosshair';
            map.dragging.enable();
            clearPlacementPreview();
            cancelLineDrawing();
            clearSelection();
            instructionText.innerText = t('inst-select');
            switchSidebarForMode('pan');
            updateLineDrawingControls();
        } else if (currentMode === 'text') {
            map.getContainer().style.cursor = 'crosshair';
            map.dragging.enable();
            clearPlacementPreview();
            cancelLineDrawing();
            clearSelection();
            instructionText.innerText = t('inst-text');
            switchSidebarForMode('text');
            updateLineDrawingControls();
        }
        updateMapTouchDrawClass();
        syncPlacementLayerInteractivity();
        updateTopBarQuickToolButtons();
    });

    /** Pan & Inspect from any drawing mode or geo tool (hotkey: M). */
    function activatePanInspectMode() {
        pendingGeoMove = null;
        map.getContainer().style.cursor = '';
        if (geoPanel && !geoPanel.classList.contains('hidden')) {
            document.querySelector('.sidebar-tab[data-tab="drawing"]')?.click();
        }
        if (geoToolSelect && geoToolSelect.value !== 'none') {
            geoToolSelect.value = 'none';
            geoToolSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (modeSelect) {
            modeSelect.value = 'pan';
            modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        syncPlacementLayerInteractivity();
        updateTopBarQuickToolButtons();
    }

    /** Geographical Tools → Freehand Draw from any mode (hotkey: F). */
    function activateFreehandDrawMode() {
        pendingGeoMove = null;
        map.getContainer().style.cursor = '';
        if (modeSelect) {
            modeSelect.value = 'pan';
            modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (geoPanel && geoPanel.classList.contains('hidden')) {
            document.querySelector('.sidebar-tab[data-tab="geo"]')?.click();
        }
        if (geoToolSelect) {
            geoToolSelect.value = 'freehand';
            geoToolSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        syncPlacementLayerInteractivity();
        updateTopBarQuickToolButtons();
    }

    function isFreehandGeoActive() {
        return isGeoPanelActive() && getGeoSelectedTool() === 'freehand';
    }

    function toggleFreehandDrawMode() {
        if (isFreehandGeoActive()) activatePanInspectMode();
        else activateFreehandDrawMode();
    }

    /** Drawing tab + clear geo tool + set mode (text, eraser, etc.). */
    function activateDrawingModeFromTopBar(modeValue) {
        pendingGeoMove = null;
        map.getContainer().style.cursor = '';
        if (geoPanel && !geoPanel.classList.contains('hidden')) {
            document.querySelector('.sidebar-tab[data-tab="drawing"]')?.click();
        }
        if (geoToolSelect && geoToolSelect.value !== 'none') {
            geoToolSelect.value = 'none';
            geoToolSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (modeSelect) {
            modeSelect.value = modeValue;
            modeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        syncPlacementLayerInteractivity();
        updateTopBarQuickToolButtons();
    }

    function activateTextBoxMode() {
        activateDrawingModeFromTopBar('text');
    }

    function activateEraserMode() {
        activateDrawingModeFromTopBar('eraser');
    }

    function updateTopBarQuickToolButtons() {
        const drawingVisible = !!(drawingPanel && !drawingPanel.classList.contains('hidden'));
        document.getElementById('freehand-f-btn')?.classList.toggle('active', isFreehandGeoActive());
        document.getElementById('text-tool-t-btn')?.classList.toggle('active', drawingVisible && currentMode === 'text');
        document.getElementById('eraser-e-btn')?.classList.toggle('active', drawingVisible && currentMode === 'eraser');
    }

    // Sidebar tab switching (Drawing | Geographical Tools)
    document.querySelectorAll('.sidebar-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.sidebar-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (tab === 'drawing') {
                drawingPanel?.classList.remove('hidden');
                geoPanel?.classList.add('hidden');
                if (instructionText) instructionText.innerText = t('instruction-default');
                geoDistancePoints = [];
                if (geoDistancePolyline) {
                    previewLayer.removeLayer(geoDistancePolyline);
                    geoDistancePolyline = null;
                }
                cancelGeoDrawing();
                clearGeoPlacementPreview();
                map.getContainer().style.cursor = '';
                updateMapTouchDrawClass();
                syncPlacementLayerInteractivity();
                updateTopBarQuickToolButtons();
            } else {
                drawingPanel?.classList.add('hidden');
                geoPanel?.classList.remove('hidden');
                if (geoDistanceOptions) geoDistanceOptions.style.display = getGeoSelectedTool() === 'distance' ? 'block' : 'none';
                if (geoRangeCircleOptions) geoRangeCircleOptions.style.display = getGeoSelectedTool() === 'range-circle' ? 'block' : 'none';
                if (geoRangeSectorOptions) geoRangeSectorOptions.style.display = getGeoSelectedTool() === 'range-sector' ? 'block' : 'none';
                if (geoCircle2ptOptions) geoCircle2ptOptions.style.display = getGeoSelectedTool() === 'circle-2pt' ? 'block' : 'none';
                if (geoSemiCircleOptions) geoSemiCircleOptions.style.display = getGeoSelectedTool() === 'semi-circle' ? 'block' : 'none';
                if (geoRectangleOptions) geoRectangleOptions.style.display = getGeoSelectedTool() === 'rectangle' ? 'block' : 'none';
                if (geoOvalOptions) geoOvalOptions.style.display = getGeoSelectedTool() === 'oval' ? 'block' : 'none';
                if (geoPolygonOptions) geoPolygonOptions.style.display = getGeoSelectedTool() === 'polygon' ? 'block' : 'none';
                if (geoFreeformOptions) geoFreeformOptions.style.display = getGeoSelectedTool() === 'freeform' ? 'block' : 'none';
                if (geoFreehandOptions) geoFreehandOptions.style.display = getGeoSelectedTool() === 'freehand' ? 'block' : 'none';
                if (geoMinefieldOptions) geoMinefieldOptions.style.display = getGeoSelectedTool() === 'minefield' ? 'block' : 'none';
                updateGeoInstruction();
                map.getContainer().style.cursor = getGeoSelectedTool() !== 'none' ? 'crosshair' : '';
                updateMapTouchDrawClass();
                syncPlacementLayerInteractivity();
                updateTopBarQuickToolButtons();
            }
        });
    });

    function updateGeoInstruction() {
        if (!instructionText) return;
        const tool = getGeoSelectedTool();
        if (tool === 'distance') instructionText.innerText = t('geo-distance-hint');
        else if (tool === 'range-circle') instructionText.innerText = t('geo-range-circle-hint');
        else if (tool === 'range-sector') instructionText.innerText = t('geo-range-sector-hint');
        else if (tool === 'circle-2pt') instructionText.innerText = t('geo-circle-2pt-hint');
        else if (tool === 'semi-circle') instructionText.innerText = t('geo-semi-circle-hint');
        else if (tool === 'rectangle') instructionText.innerText = t('geo-rectangle-hint');
        else if (tool === 'oval') instructionText.innerText = t('geo-oval-hint');
        else if (tool === 'polygon') instructionText.innerText = t('geo-polygon-hint');
        else if (tool === 'freeform') instructionText.innerText = t('geo-freeform-hint');
        else if (tool === 'freehand') instructionText.innerText = t('geo-freehand-hint');
        else if (tool === 'minefield') instructionText.innerText = t('geo-minefield-hint');
        else instructionText.innerText = t('instruction-default');
    }

    function cancelGeoDrawing() {
        geoCircle2ptPoints = [];
        geoRectanglePoints = [];
        geoOvalPoints = [];
        geoMinefieldPoints = [];
        geoFreeformPoints = [];
        geoDistancePoints = [];
        geoFreehandPoints = [];
        isFreehandDrawing = false;
        if (geoCircle2ptPreview) { previewLayer.removeLayer(geoCircle2ptPreview); geoCircle2ptPreview = null; }
        if (geoRectanglePreview) { previewLayer.removeLayer(geoRectanglePreview); geoRectanglePreview = null; }
        if (geoOvalPreview) { previewLayer.removeLayer(geoOvalPreview); geoOvalPreview = null; }
        if (geoMinefieldPreview) { previewLayer.removeLayer(geoMinefieldPreview); geoMinefieldPreview = null; }
        if (geoFreeformPreview) { previewLayer.removeLayer(geoFreeformPreview); geoFreeformPreview = null; }
        if (geoDistancePolyline) { previewLayer.removeLayer(geoDistancePolyline); geoDistancePolyline = null; }
        if (geoFreehandPreview) { previewLayer.removeLayer(geoFreehandPreview); geoFreehandPreview = null; }
        if (geoDrawingControls) geoDrawingControls.classList.add('hidden');
    }

    geoToolSelect?.addEventListener('change', () => {
        if (geoDistanceOptions) geoDistanceOptions.style.display = getGeoSelectedTool() === 'distance' ? 'block' : 'none';
        if (geoRangeCircleOptions) geoRangeCircleOptions.style.display = getGeoSelectedTool() === 'range-circle' ? 'block' : 'none';
        if (geoRangeSectorOptions) geoRangeSectorOptions.style.display = getGeoSelectedTool() === 'range-sector' ? 'block' : 'none';
        if (geoCircle2ptOptions) geoCircle2ptOptions.style.display = getGeoSelectedTool() === 'circle-2pt' ? 'block' : 'none';
        if (geoSemiCircleOptions) geoSemiCircleOptions.style.display = getGeoSelectedTool() === 'semi-circle' ? 'block' : 'none';
        if (geoRectangleOptions) geoRectangleOptions.style.display = getGeoSelectedTool() === 'rectangle' ? 'block' : 'none';
        if (geoOvalOptions) geoOvalOptions.style.display = getGeoSelectedTool() === 'oval' ? 'block' : 'none';
        if (geoPolygonOptions) geoPolygonOptions.style.display = getGeoSelectedTool() === 'polygon' ? 'block' : 'none';
        if (geoFreeformOptions) geoFreeformOptions.style.display = getGeoSelectedTool() === 'freeform' ? 'block' : 'none';
        if (geoFreehandOptions) geoFreehandOptions.style.display = getGeoSelectedTool() === 'freehand' ? 'block' : 'none';
        if (geoMinefieldOptions) geoMinefieldOptions.style.display = getGeoSelectedTool() === 'minefield' ? 'block' : 'none';
        if (getGeoSelectedTool() === 'minefield') {
            const mts = document.getElementById('geo-mine-type-select');
            if (mts) mts.value = 'mixed';
            geoPanel?.querySelectorAll('.geo-color-btn').forEach(b => b.classList.remove('active'));
            geoPanel?.querySelector('.geo-color-btn[data-color="#22c55e"]')?.classList.add('active');
        }
        if (getGeoSelectedTool() !== 'freehand') { freehandEraserMode = false; freehandTrimmerMode = false; isTrimmerDragging = false; }
        const fhEraserBtn = document.getElementById('geo-freehand-eraser-btn');
        if (fhEraserBtn) {
            fhEraserBtn.classList.toggle('active', freehandEraserMode);
            fhEraserBtn.textContent = freehandEraserMode ? t('geo-freehand-eraser-on') : t('geo-freehand-eraser');
        }
        const fhTrimmerBtn = document.getElementById('geo-freehand-trimmer-btn');
        if (fhTrimmerBtn) {
            fhTrimmerBtn.classList.toggle('active', freehandTrimmerMode);
            fhTrimmerBtn.textContent = freehandTrimmerMode ? t('geo-freehand-trimmer-on') : t('geo-freehand-trimmer');
        }
        geoDistancePoints = [];
        cancelGeoDrawing();
        if (geoDistancePolyline) {
            previewLayer.removeLayer(geoDistancePolyline);
            geoDistancePolyline = null;
        }
        clearGeoPlacementPreview();
        updateGeoInstruction();
        if (isGeoPanelActive()) {
            map.getContainer().style.cursor = getGeoSelectedTool() !== 'none' ? 'crosshair' : '';
        }
        updateMapTouchDrawClass();
        syncPlacementLayerInteractivity();
        updateTopBarQuickToolButtons();
    });

    document.getElementById('geo-freehand-eraser-btn')?.addEventListener('click', () => {
        freehandEraserMode = !freehandEraserMode;
        if (freehandEraserMode) freehandTrimmerMode = false;
        const btn = document.getElementById('geo-freehand-eraser-btn');
        if (btn) {
            btn.classList.toggle('active', freehandEraserMode);
            btn.textContent = freehandEraserMode ? t('geo-freehand-eraser-on') : t('geo-freehand-eraser');
        }
        const trimmerBtn = document.getElementById('geo-freehand-trimmer-btn');
        if (trimmerBtn) trimmerBtn.classList.remove('active');
        if (instructionText) instructionText.innerText = freehandEraserMode ? t('geo-freehand-eraser-hint') : t('geo-freehand-hint');
        updateMapTouchDrawClass();
    });

    document.getElementById('geo-freehand-trimmer-btn')?.addEventListener('click', () => {
        freehandTrimmerMode = !freehandTrimmerMode;
        if (freehandTrimmerMode) freehandEraserMode = false;
        const btn = document.getElementById('geo-freehand-trimmer-btn');
        if (btn) {
            btn.classList.toggle('active', freehandTrimmerMode);
            btn.textContent = freehandTrimmerMode ? t('geo-freehand-trimmer-on') : t('geo-freehand-trimmer');
        }
        const eraserBtn = document.getElementById('geo-freehand-eraser-btn');
        if (eraserBtn) eraserBtn.classList.remove('active');
        if (instructionText) instructionText.innerText = freehandTrimmerMode ? t('geo-freehand-trimmer-hint') : t('geo-freehand-hint');
        updateMapTouchDrawClass();
    });

    geoPanel?.querySelectorAll('.geo-color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            geoPanel.querySelectorAll('.geo-color-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    function openPicker() {
        if (!pickerModal) return;
        pickerModal.classList.remove('hidden');
        pickerModal.setAttribute('aria-hidden', 'false');
    }

    function closePicker() {
        if (!pickerModal) return;
        pickerModal.classList.add('hidden');
        pickerModal.setAttribute('aria-hidden', 'true');
        editingSymbolMarker = null;
    }

    openSidcPickerBtn?.addEventListener('click', openPicker);
    pickerCloseBackdrop?.addEventListener('click', closePicker);
    pickerCloseBtn?.addEventListener('click', closePicker);

    window.addEventListener('message', (event) => {
        const data = event?.data;
        if (!data || data.type !== 'sidc-picker:sidc') return;
        const sidc = normalizeSidcInput(data.sidc);
        if (!sidc) return;
        setSidcOverride(sidc);
        updateSymbolPreview();
    });

    syncSidcBtn?.addEventListener('click', pullSidcFromManualInput);

    // openPicker / closePicker
    // Click: open button, backdrop, close button
    // window.addEventListener('message', ...) for sidc-picker:sidc
    // syncSidcBtn -> pullSidcFromManualInput (only if #sync-sidc-from-picker exists)

    function openPicker() {
        if (!pickerModal) return;
        pickerModal.classList.remove('hidden');
        pickerModal.setAttribute('aria-hidden', 'false');
    }

    function closePicker() {
        if (!pickerModal) return;
        pickerModal.classList.add('hidden');
        pickerModal.setAttribute('aria-hidden', 'true');
        editingSymbolMarker = null;
    }

    openSidcPickerBtn?.addEventListener('click', openPicker);
    pickerCloseBackdrop?.addEventListener('click', closePicker);
    pickerCloseBtn?.addEventListener('click', closePicker);

    window.addEventListener('message', (event) => {
        const data = event?.data;
        if (!data || data.type !== 'sidc-picker:sidc') return;
        const sidc = normalizeSidcInput(data.sidc);
        if (!sidc) return;
        setSidcOverride(sidc);
        updateSymbolPreview();
    });

    syncSidcBtn?.addEventListener('click', pullSidcFromManualInput);




    function syncTmgPreviewColor() {
        if (tmgGrid) tmgGrid.style.setProperty('--tmg-preview-color', getLineColor());
    }
    lineManager.querySelectorAll('.line-color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            lineManager.querySelectorAll('.line-color-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            syncTmgPreviewColor();
            if (drawLinePolyline) {
                drawLinePolyline.setStyle({ color: btn.dataset.color });
            }
        });
    });

    textManager?.querySelectorAll('.text-color-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            textManager.querySelectorAll('.text-color-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    const textDefaultSizeInput = document.getElementById('text-label-default-size');
    textManager?.querySelectorAll('.text-default-size-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!textDefaultSizeInput) return;
            const dir = parseInt(btn.dataset.dir, 10);
            let sz = parseInt(textDefaultSizeInput.value, 10);
            if (isNaN(sz)) sz = TEXT_LABEL_FONT_SIZE_DEFAULT;
            sz = Math.max(TEXT_LABEL_FONT_SIZE_MIN, Math.min(TEXT_LABEL_FONT_SIZE_MAX, sz + dir));
            textDefaultSizeInput.value = String(sz);
        });
    });
    textDefaultSizeInput?.addEventListener('change', () => {
        let sz = parseInt(textDefaultSizeInput.value, 10);
        if (isNaN(sz)) sz = TEXT_LABEL_FONT_SIZE_DEFAULT;
        sz = Math.max(TEXT_LABEL_FONT_SIZE_MIN, Math.min(TEXT_LABEL_FONT_SIZE_MAX, sz));
        textDefaultSizeInput.value = String(sz);
    });

    lineStyleSelect.addEventListener('change', () => {
        const dashArray = lineStyleSelect.value === 'dotted' ? '10, 10' : null;
        if (drawLinePolyline) {
            drawLinePolyline.setStyle({ dashArray: dashArray });
        }
    });

    const lineDrawingControls = document.getElementById('line-drawing-controls');
    const finishLineBtn = document.getElementById('finish-line-btn');
    const cancelLineBtn = document.getElementById('cancel-line-btn');

    function cancelLineDrawing() {
        if (drawLinePolyline) {
            let removed = false;
            for (const l of layers) {
                if (l.group.hasLayer(drawLinePolyline)) {
                    l.group.removeLayer(drawLinePolyline);
                    removed = true;
                    break;
                }
            }
            if (!removed) map.removeLayer(drawLinePolyline);
            drawLinePolyline = null;
        }
        drawLineCoords = [];
        tmgPoints = [];
        catkPlacementState = null;
        lastParametricCatkPlacementClick = null;
        if (tmgClickPendingTimeout) { clearTimeout(tmgClickPendingTimeout); tmgClickPendingTimeout = null; }
        addingPointTmgGroup = null;
        reorientingTmgMarker = null;
        removeTmgResizeHandle();
        clearPlacementPreview();
        updateLineDrawingControls();
        if (instructionText) {
            const def = selectedTmgType ? TACTICAL_GRAPHICS.find(d => d.id === selectedTmgType) : null;
            instructionText.innerText = def ? t(instPlaceTmgKeyForTypeId(def.id), getTmgLabel(def)) : t('inst-line-draw');
        }
    }

    function updateLineDrawingControls() {
        const active = (drawLineCoords.length >= 2) || (tmgPoints.length >= 2) || !!catkPlacementState || addingPointTmgGroup || reorientingTmgMarker;
        if (lineDrawingControls) {
            lineDrawingControls.classList.toggle('hidden', !active);
        }
        if (finishLineBtn) {
            finishLineBtn.style.display = reorientingTmgMarker ? 'none' : '';
        }
        syncMissionPickerFocus();
        updateMissionGraphicAssist();
    }

    function finalizeParametricCatkPlacement() {
        if (!selectedTmgType || !isParametricCatkPlacementType(selectedTmgType)) return false;
        const state = catkPlacementState;
        if (!state || state.phase !== 'bodyDrawing' || !state.tail) return false;

        // Determine the tip position: the double-click location (liveCursor).
        const tipLatLng = state.liveCursor ? L.latLng(state.liveCursor.lat, state.liveCursor.lng) : null;
        if (!tipLatLng) return false;
        const tailLatLng = L.latLng(state.tail.lat, state.tail.lng);

        // Build body bends, filtering out any point that coincides with the tip
        // (the first click of a double-click may have added a spurious bend).
        const bodyBends = (state.bodyPoints || []).filter(Boolean)
            .map((p) => L.latLng(p.lat, p.lng))
            .filter((p) => !catkPlacementPointsAreNear(p, tipLatLng));

        // Assemble renderer-order points: [tip, ...reversed_body, tail]
        const reversedBody = [...bodyBends].reverse();
        const allPoints = [tipLatLng, ...reversedBody, tailLatLng];

        // Derive params from actual final points so positions are correct.
        // Override width/head from the 2nd-click lock so proportions match the preview.
        const finalParams = catkDeriveArrowParamsFromLegacyPoints(allPoints, getTmgStrokeWidth(), getTmgArrowHeadScale());
        if (finalParams && state.lockedParams) {
            finalParams.bodyWidthKm = state.lockedParams.bodyWidthKm;
            finalParams.headWidthKm = state.lockedParams.headWidthKm;
            finalParams.headLengthKm = state.lockedParams.headLengthKm;
            finalParams.neckOffsetKm = state.lockedParams.neckOffsetKm;
        }
        const style = {
            color: getLineColor(),
            strokeWidth: getTmgStrokeWidth(),
            arrowHeadScale: getTmgArrowHeadScale(),
            legacyBodyWidthKm: finalParams?.bodyWidthKm ?? null,
            lockedArrowParams: finalParams
        };

        let group;
        if (allPoints.length >= 3) {
            // Multi-point arrow with body bends.
            group = createLegacyCatkGroup(selectedTmgType, allPoints, {
                ...style,
                preserveLegacyPoints: true
            });
        } else {
            // Simple 2-point arrow (tip + tail) — use parametric path.
            if (finalParams) {
                group = createParametricCatkGroup(selectedTmgType, finalParams, style);
            } else {
                group = createLegacyCatkGroup(selectedTmgType, allPoints, style);
            }
        }
        if (!group) return false;
        addToActiveLayer(group);
        catkPlacementState = null;
        lastParametricCatkPlacementClick = null;
        clearPlacementPreview();

        // Auto-select the newly placed arrow so edit handles remain visible.
        const headMarker = group._tmgData?.headMarker;
        if (headMarker && group._layerId) {
            requestAnimationFrame(() => {
                createCatkMultiPointSelectionBox(headMarker, group, group._layerId);
            });
        }

        return true;
    }

    function updateParametricCatkPlacementInstruction() {
        if (!instructionText) return;
        const def = selectedTmgType ? TACTICAL_GRAPHICS.find(d => d.id === selectedTmgType) : null;
        if (catkPlacementState?.phase === 'bodyDrawing') {
            instructionText.innerText = t('inst-place-tmg-finish', getTmgLabel(def));
        } else if (catkPlacementState?.phase === 'tailPlaced') {
            instructionText.innerText = def ? t(instPlaceTmgKeyForTypeId(def.id), getTmgLabel(def)) : t('inst-line-draw');
        } else {
            instructionText.innerText = def ? t(instPlaceTmgKeyForTypeId(def.id), getTmgLabel(def)) : t('inst-line-draw');
        }
    }

    function catkPlacementPointsAreNear(a, b, minPx = 6) {
        if (!a || !b || !map) return false;
        const ap = map.latLngToLayerPoint(a);
        const bp = map.latLngToLayerPoint(b);
        return Math.hypot(ap.x - bp.x, ap.y - bp.y) < minPx;
    }

    function shouldIgnoreDuplicateParametricCatkPlacementClick(latlng) {
        if (!latlng || !map || !lastParametricCatkPlacementClick) return false;
        const prev = lastParametricCatkPlacementClick;
        const elapsedMs = Date.now() - prev.at;
        // Duplicate map/dom click paths happen within a few milliseconds.
        // Keep this window tight so real user second/third clicks are accepted.
        if (elapsedMs > 95) return false;
        const p = map.latLngToLayerPoint(latlng);
        const q = map.latLngToLayerPoint(prev.latlng);
        if (Math.hypot(p.x - q.x, p.y - q.y) > 6) return false;

        const phaseNow = catkPlacementState?.phase || 'none';
        // First click duplicate: avoid accidentally promoting tail placement into
        // direction-confirm because multiple event paths fired for one physical click.
        if (phaseNow === 'tailPlaced' && prev.phaseAfter === 'tailPlaced') return true;
        // Second click duplicate: we already entered body-drawing mode and stored
        // the first body point, so do not add another at the same position.
        if (phaseNow === 'bodyDrawing'
            && (catkPlacementState?.bodyPoints?.length || 0) <= 1
            && prev.phaseBefore === 'tailPlaced'
            && prev.phaseAfter === 'bodyDrawing') return true;
        return false;
    }

    function handleParametricCatkPlacementClick(latlng) {
        if (!latlng || !selectedTmgType || !isParametricCatkPlacementType(selectedTmgType)) return false;
        if (shouldIgnoreDuplicateParametricCatkPlacementClick(latlng)) return true;
        const phaseBefore = catkPlacementState?.phase || 'none';
        if (!catkPlacementState) {
            // 1st click: place the tail (arrow body start).
            catkPlacementState = {
                phase: 'tailPlaced',
                tail: latlng,
                bodyPoints: [],
                liveCursor: null
            };
        } else if (catkPlacementState.phase === 'tailPlaced') {
            // 2nd click: lock direction + size AND store as first body point.
            const lockPts = [latlng, catkPlacementState.tail];
            catkPlacementState.lockedParams = catkDeriveArrowParamsFromLegacyPoints(
                lockPts, getTmgStrokeWidth(), getTmgArrowHeadScale());
            catkPlacementState.phase = 'bodyDrawing';
            catkPlacementState.bodyPoints = [latlng];
            catkPlacementState.liveCursor = latlng;
        } else if (catkPlacementState.phase === 'bodyDrawing') {
            // Subsequent single clicks: add body bend points.
            const bodyPoints = catkPlacementState.bodyPoints || [];
            const lastPoint = bodyPoints.length ? bodyPoints[bodyPoints.length - 1] : null;
            if (!lastPoint || !catkPlacementPointsAreNear(lastPoint, latlng)) {
                bodyPoints.push(latlng);
            }
            catkPlacementState.bodyPoints = bodyPoints;
            catkPlacementState.liveCursor = latlng;
        }
        // --- preview ---
        if ((catkPlacementState?.phase === 'bodyDrawing' || catkPlacementState?.phase === 'tailPlaced')
            && catkPlacementState.tail) {
            const previewTip = catkPlacementState.liveCursor || latlng;
            const reversedBody = [...(catkPlacementState.bodyPoints || [])].reverse();
            const previewTailPts = [...reversedBody, catkPlacementState.tail];
            // Always derive from current points so positions are correct.
            // In bodyDrawing, override width/head from the locked 2nd-click params.
            const derived = catkDeriveArrowParamsFromLegacyPoints(
                [previewTip, ...previewTailPts], getTmgStrokeWidth(), getTmgArrowHeadScale());
            if (derived && catkPlacementState.lockedParams) {
                derived.bodyWidthKm = catkPlacementState.lockedParams.bodyWidthKm;
                derived.headWidthKm = catkPlacementState.lockedParams.headWidthKm;
                derived.headLengthKm = catkPlacementState.lockedParams.headLengthKm;
                derived.neckOffsetKm = catkPlacementState.lockedParams.neckOffsetKm;
            }
            renderCatkTailDotPlacementPreview(
                selectedTmgType,
                previewTip,
                previewTailPts,
                null,
                getLineColor(),
                getTmgStrokeWidth(),
                derived
            );
        }
        lastParametricCatkPlacementClick = {
            at: Date.now(),
            latlng: L.latLng(latlng.lat, latlng.lng),
            phaseBefore,
            phaseAfter: catkPlacementState?.phase || 'none'
        };
        updateLineDrawingControls();
        updateParametricCatkPlacementInstruction();
        return true;
    }

    function finishLineDrawing() {
        if (drawLineCoords.length >= 2) {
            endLineDraw();
        } else if (finalizeParametricCatkPlacement()) {
            // handled above
        } else if (tmgPoints.length >= 2 && selectedTmgType) {
            if (tmgClickPendingTimeout) { clearTimeout(tmgClickPendingTimeout); tmgClickPendingTimeout = null; }
            while (tmgPoints.length > 2) {
                const last = tmgPoints[tmgPoints.length - 1];
                const prev = tmgPoints[tmgPoints.length - 2];
                const p1 = map.latLngToLayerPoint(last);
                const p2 = map.latLngToLayerPoint(prev);
                if (Math.hypot(p1.x - p2.x, p1.y - p2.y) < 8) tmgPoints.pop();
                else break;
            }
            createTmgFromPoints(tmgPoints);
            tmgPoints = [];
            clearPlacementPreview();
        } else if (addingPointTmgGroup) {
            addingPointTmgGroup = null;
            clearPlacementPreview();
        }
        updateLineDrawingControls();
        if (instructionText) {
            const def = selectedTmgType ? TACTICAL_GRAPHICS.find(d => d.id === selectedTmgType) : null;
            instructionText.innerText = def ? t(instPlaceTmgKeyForTypeId(def.id), getTmgLabel(def)) : t('inst-line-draw');
        }
    }

    function endLineDraw() {
        if (drawLinePolyline) {
            const polyline = drawLinePolyline;
            wireTacticalLinePolyline(polyline);
            addToActiveLayer(polyline);
            drawLinePolyline = null;
            drawLineCoords = [];
        }
        updateLineDrawingControls();
    }

    /** Add scalloped TMG from obstacle-clipped chord pairs (single marker or group). */
    function addScallopedFrontLineFromChordPairs(pairs, color, strokeWidth) {
        if (!pairs || !pairs.length) return;
        const sessionId = window.freeDrawSignatureSessionId;
        if (pairs.length === 1) {
            const layer = createTmgLayer(pairs[0].a, pairs[0].b, 'scalloped', color, false, false, { strokeWidth });
            if (layer) {
                if (sessionId && layer._tmgData) layer._tmgData.sessionId = sessionId;
                addToActiveLayer(layer);
                if (sessionId) onScallopedFrontlineCreated();
            }
            return;
        }
        const group = L.layerGroup();
        const segments = [];
        for (let pi = 0; pi < pairs.length; pi++) {
            const useBodyOnly = pi < pairs.length - 1;
            const seg = createTmgLayer(pairs[pi].a, pairs[pi].b, 'scalloped', color, useBodyOnly, true, { strokeWidth });
            if (seg) {
                group.addLayer(seg);
                segments.push(seg);
                seg.on('click', () => group.openPopup(seg.getLatLng()));
                if (sessionId && seg._tmgData) seg._tmgData.sessionId = sessionId;
            }
        }
        if (!segments.length) return;
        const defForStyle = TACTICAL_GRAPHICS.find(d => d.id === 'scalloped');
        group._tmgData = {
            segments,
            typeId: 'scalloped',
            color,
            filled: defForStyle?.filled ?? true,
            dashed: defForStyle?.dashed ?? false,
            strokeWidth
        };
        group.bindPopup(buildGroupTmgPopupContent(group));
        group.on('popupclose', () => removeTmgResizeHandle());
        group.on('popupopen', () => {
            group.setPopupContent(buildGroupTmgPopupContent(group));
            scheduleTmgPopupBind(() => {
                bindGroupTmgPopupHandlers(group);
                showTmgGroupPopupSelectionUi(group, group._layerId);
            });
        });
        addToActiveLayer(group);
        if (sessionId) onScallopedFrontlineCreated();
    }

    function createTmgFromPoints(pts) {
        if (!selectedTmgType || pts.length < 2) return;
        const color = getLineColor();
        const strokeWidth = getTmgStrokeWidth();
        const def = TACTICAL_GRAPHICS.find(d => d.id === selectedTmgType);
        if (def && def.pointSymbol && pts.length > 2) pts = pts.slice(0, 2);
        if (selectedTmgType === 'scalloped' && tryMergeScallopedFromPoints(pts)) {
            if (window.freeDrawSignatureSessionId) onScallopedFrontlineCreated();
            return;
        }
        if (def && isCounterattackStyleMultiPointType(selectedTmgType)) {
            let canonicalPts = pts.slice();
            if (canonicalPts.length === 2) canonicalPts = [canonicalPts[1], canonicalPts[0]];
            else if (canonicalPts.length >= 3) canonicalPts = canonicalPts.slice().reverse();
            const arrowParams = catkDeriveArrowParamsFromLegacyPoints(canonicalPts, strokeWidth, getTmgArrowHeadScale());
            const group = createParametricCatkGroup(selectedTmgType, arrowParams, {
                color,
                strokeWidth,
                arrowHeadScale: getTmgArrowHeadScale()
            });
            if (group) addToActiveLayer(group);
            return;
        }
        if (pts.length === 2) {
            if (selectedTmgType === 'scalloped') {
                const pairs = expandScallopedControlPointsToChordPairs(pts);
                addScallopedFrontLineFromChordPairs(pairs, color, strokeWidth);
                return;
            }
            const layer = createTmgLayer(pts[0], pts[1], selectedTmgType, color, false, false, { strokeWidth });
            if (layer) {
                addToActiveLayer(layer);
            }
            return;
        }
        if (pts.length > 2 && !def.pointSymbol) {
            if (selectedTmgType === 'scalloped') {
                const pairs = expandScallopedControlPointsToChordPairs(pts);
                addScallopedFrontLineFromChordPairs(pairs, color, strokeWidth);
                return;
            }
            const group = L.layerGroup();
            const segments = [];
            for (let i = 0; i < pts.length - 1; i++) {
                const useBodyOnly = i < pts.length - 2;
                const seg = createTmgLayer(pts[i], pts[i + 1], selectedTmgType, color, useBodyOnly, true, { strokeWidth });
                if (seg) {
                    group.addLayer(seg);
                    segments.push(seg);
                    seg.on('click', () => group.openPopup(seg.getLatLng()));
                }
            }
            const defForStyle = TACTICAL_GRAPHICS.find(d => d.id === selectedTmgType);
            group._tmgData = { segments, typeId: selectedTmgType, color, filled: defForStyle?.filled ?? true, dashed: defForStyle?.dashed ?? false, strokeWidth };
            group.bindPopup(buildGroupTmgPopupContent(group));
            group.on('popupclose', () => removeTmgResizeHandle());
            group.on('popupopen', () => {
                group.setPopupContent(buildGroupTmgPopupContent(group));
                scheduleTmgPopupBind(() => {
                    bindGroupTmgPopupHandlers(group);
                    showTmgGroupPopupSelectionUi(group, group._layerId);
                });
            });
            addToActiveLayer(group);
        }
    }

    map.on('dblclick', (e) => {
        const target = e.originalEvent?.target;
        if (!target || !map.getContainer().contains(target) || target.closest?.('.sidebar') || target.closest?.('.top-bar') || target.closest?.('.modal')) return;
        if (currentMode === 'line' && selectedTmgType && isParametricCatkPlacementType(selectedTmgType) && catkPlacementState?.phase === 'bodyDrawing') {
            e.originalEvent.preventDefault();
            const finishAt = snapLatLngForTmgPlacement(e.latlng);
            if (finishAt && catkPlacementState) {
                // Double-click position becomes the arrow tip.
                catkPlacementState.liveCursor = finishAt;
            }
            finalizeParametricCatkPlacement();
            updateLineDrawingControls();
            if (instructionText) {
                const d = TACTICAL_GRAPHICS.find(x => x.id === selectedTmgType);
                instructionText.innerText = d ? t(instPlaceTmgKeyForTypeId(d.id), getTmgLabel(d)) : t('inst-line-draw');
            }
        } else if (currentMode === 'line' && selectedTmgType && tmgPoints.length >= 1) {
            e.originalEvent.preventDefault();
            if (tmgClickPendingTimeout) { clearTimeout(tmgClickPendingTimeout); tmgClickPendingTimeout = null; }
            const dll = snapLatLngForTmgPlacement(e.latlng);
            if (tmgPoints.length === 1) tmgPoints.push(dll);
            if (tmgPoints.length === 2) tmgPoints.push(dll);  // capture 3rd point from dblclick (click that added it was cancelled by timeout clear)
            while (tmgPoints.length > 2) {
                const last = tmgPoints[tmgPoints.length - 1];
                const prev = tmgPoints[tmgPoints.length - 2];
                const p1 = map.latLngToLayerPoint(last);
                const p2 = map.latLngToLayerPoint(prev);
                if (Math.hypot(p1.x - p2.x, p1.y - p2.y) < 8) tmgPoints.pop();
                else break;
            }
            createTmgFromPoints(tmgPoints);
            tmgPoints = [];
            clearPlacementPreview();
            updateLineDrawingControls();
            if (instructionText) {
                const d = TACTICAL_GRAPHICS.find(x => x.id === selectedTmgType);
                instructionText.innerText = d ? t(instPlaceTmgKeyForTypeId(d.id), getTmgLabel(d)) : t('inst-line-draw');
            }
        } else if (currentMode === 'line' && !selectedTmgType && drawLineCoords.length >= 2) {
            e.originalEvent.preventDefault();
            endLineDraw();
        } else if (isGeoPanelActive() && getGeoSelectedTool() === 'freeform' && geoFreeformPoints.length >= 3) {
            e.originalEvent.preventDefault();
            finishGeoFreeformPolygon();
        } else if (isGeoPanelActive() && getGeoSelectedTool() === 'distance' && geoDistancePoints.length >= 2) {
            e.originalEvent.preventDefault();
            finishGeoDistancePolyline();
        }
    });

    let currentPopupSource = null;
    map.on('popupopen', (e) => {
        currentPopupSource = e?.popup?._source ?? null;
        const wrapper = document.querySelector('.leaflet-popup-content-wrapper');
        if (wrapper) L.DomEvent.disableClickPropagation(wrapper);
    });
    map.on('popupclose', () => { currentPopupSource = null; });
    document.addEventListener('click', (e) => {
        const btn = e.target.closest?.('.remove-tmg-btn');
        if (!btn || !currentPopupSource) return;
        const popupEl = currentPopupSource.getPopup?.()?.getElement?.();
        if (!popupEl || !popupEl.contains(btn)) return;
        e.preventDefault();
        e.stopPropagation();
        removeFromLayer(currentPopupSource);
    }, true);

    // Capture phase: stray click after handle drag often fires before/alongside Leaflet; block it here.
    document.addEventListener('click', (e) => {
        if (!suppressNextMapClickAfterOverlayHandleDrag) return;
        const t = e.target;
        if (t.closest?.('#auto-flank-controls')) return;
        if (!map.getContainer().contains(t)) return;
        if (t.closest?.('.leaflet-popup')) return;
        if (t.closest?.('.sidebar') || t.closest?.('.top-bar') || t.closest?.('.modal')) return;
        if (t.closest?.('.tmg-resize-handle') || t.closest?.('.geo-resize-handle') || t.closest?.('.selection-area-anchor') || t.closest?.('.selection-area-rotate-handle')) return;
        if (t.closest?.('.leaflet-control')) return;
        suppressNextMapClickAfterOverlayHandleDrag = false;
        e.stopImmediatePropagation();
        e.stopPropagation();
        e.preventDefault();
    }, true);

    function polylinePopupIsOpen(layer) {
        const pu = layer.getPopup?.();
        if (!pu) return false;
        if (typeof pu.isOpen === 'function') return pu.isOpen();
        return !!(pu._map && map && pu._map === map);
    }

    /** Plain/freehand/distance line popup open: Line-tool map clicks must not add drawLineCoords (was forking the line). */
    function shouldBlockTacticalLinePlacementClick() {
        if (activePlainLineEndpointHandles) return true;
        const src = currentPopupSource;
        if (!(src instanceof L.Polyline) || src === drawLinePolyline) return false;
        if (!polylinePopupIsOpen(src)) return false;
        if (src._geoType === 'freehand' || src._geoType === 'distance') return true;
        if (!src._geoType) return true;
        return false;
    }

    map.on('click', (e) => {

        if (window.freeDrawSignatureRecentClick) {
            // Don't consume — just clear the flag. The placement click was already
            // handled by the free-draw module; this flag only exists so we don't
            // double-fire on that same event.  Any NEW click is intentional.
            window.freeDrawSignatureRecentClick = false;
            return;
        }
        if (window.freeDrawSignature && typeof window.freeDrawSignature.isActive === 'function' && window.freeDrawSignature.isActive()) {
            e.originalEvent?.stopImmediatePropagation?.();
            e.originalEvent?.stopPropagation?.();
            return;
        }

        const target = e.originalEvent?.target;
        if (!target) return;
        if (!map.getContainer().contains(target)) return;
        if (target.closest?.('.leaflet-popup')) return;
        if (target.closest?.('.sidebar') || target.closest?.('.top-bar') || target.closest?.('.modal')) return;
        // Line/endpoint/geo resize handles sit on the map; a click after drag would otherwise
        // start a new tactical line (drawLinePolyline) or trigger other map click actions.
        if (target.closest?.('.tmg-resize-handle') || target.closest?.('.geo-resize-handle') || target.closest?.('.geo-center-move-handle') || target.closest?.('.selection-area-anchor') || target.closest?.('.selection-area-rotate-handle')) return;
        if (suppressNextMapClickAfterOverlayHandleDrag) {
            suppressNextMapClickAfterOverlayHandleDrag = false;
            return;
        }

        if (pendingGeoMove && e.latlng) {
            const { el, geoType } = pendingGeoMove;
            pendingGeoMove = null;
            syncPlacementLayerInteractivity();
            map.getContainer().style.cursor = '';
            const d = el._geoData;
            if (el instanceof L.Circle && el.getLatLng) {
                el.setLatLng(e.latlng);
                d.center = e.latlng;
            } else if (el.getLatLngs) {
                const lls = el.getLatLngs();
                const ring = (lls[0] && Array.isArray(lls[0])) ? lls[0] : lls;
                const bounds = L.latLngBounds(ring);
                const oldCenter = bounds.getCenter();
                const dLat = e.latlng.lat - oldCenter.lat;
                const dLng = e.latlng.lng - oldCenter.lng;
                if (geoType === 'oval' && d.corners?.length === 4) {
                    d.corners = d.corners.map(p => L.latLng(p.lat + dLat, p.lng + dLng));
                    syncOvalPolygonFromCorners(el);
                } else {
                    const newRing = ring.map(p => L.latLng(p.lat + dLat, p.lng + dLng));
                    el.setLatLngs(newRing);
                    if (d.corners) d.corners = newRing;
                    if (d.points) d.points = newRing;
                    if (d.center) d.center = L.latLng(d.center.lat + dLat, d.center.lng + dLng);
                }
                if (geoType === 'minefield') updateMinefieldDecorations(el);
            }
            el.setPopupContent(buildGeoPopupContent(el, geoType, d));
            if (instructionText) instructionText.innerText = typeof t === 'function' ? t('instruction-default') : '';
            scheduleSaveToStorage();
            return;
        }

        // Selection mode: place copied/moved elements
        if (selectionPendingAction && selectedElements.length > 0 && e.latlng) {
            const selCenter = selectedElements.reduce((acc, { element }) => {
                const b = getElementBounds(element);
                if (b) {
                    const c = b.getCenter();
                    acc.lat += c.lat;
                    acc.lng += c.lng;
                    acc.n += 1;
                }
                return acc;
            }, { lat: 0, lng: 0, n: 0 });
            const n = selCenter.n || 1;
            const origCenter = L.latLng(selCenter.lat / n, selCenter.lng / n);
            const dLat = e.latlng.lat - origCenter.lat;
            const dLng = e.latlng.lng - origCenter.lng;
            if (selectionPendingAction === 'copy') {
                selectedElements.forEach(({ element, layer }) => copyElementWithOffset(element, layer, dLat, dLng));
                if (instructionText) instructionText.innerText = t('inst-select-copied');
            } else {
                selectedElements.forEach(({ element }) => moveElementWithOffset(element, dLat, dLng));
                if (instructionText) instructionText.innerText = t('inst-select-moved');
            }
            clearSelection();
            scheduleSaveToStorage();
            if (layersListEl) renderLayersList();
            return;
        }

        // Geographical Tools (when geo tab is active)
        if (isGeoPanelActive()) {
            const tool = getGeoSelectedTool();
            if (tool === 'freehand') {
                if (freehandEraserMode) {
                    if (eraseSegmentAtPoint(e.latlng, { onlyFreehand: true })) {
                        if (instructionText) instructionText.innerText = t('inst-part-erased');
                        if (layersListEl) renderLayersList();
                    }
                }
                return; // freehand uses mousedown/mouseup, not click
            }
            if (shouldBlockTacticalLinePlacementClick()) return;
            if (tool === 'distance') {
                const geoColor = getGeoColor();
                geoDistancePoints.push(e.latlng);
                dedupeConsecutiveDistancePointsMutate(geoDistancePoints);
                if (geoDistancePoints.length === 1) {
                    geoDistancePolyline = L.polyline(geoDistancePoints, { color: geoColor, weight: 3, dashArray: '5,10', className: 'geo-preview-shadow' });
                    geoDistancePolyline.addTo(previewLayer);
                } else {
                    geoDistancePolyline.setLatLngs(geoDistancePoints);
                    geoDistancePolyline.setStyle({ color: geoColor, dashArray: null });
                    if (geoDistancePoints.length >= 2) geoDrawingControls?.classList.remove('hidden');
                }
                if (instructionText) instructionText.innerText = geoDistancePoints.length < 2
                    ? t('geo-distance-hint')
                    : t('geo-distance-add-point', String(geoDistancePoints.length));
                return;
            }
            if (tool === 'range-circle') {
                clearGeoPlacementPreview();
                const geoColor = getGeoColor();
                const fillStyle = getGeoFillStyle();
                const radiusKm = parseFloat(geoRadiusInput?.value || 5) || 5;
                const circle = L.circle(e.latlng, { radius: radiusKm * 1000, ...getGeoShapeStyle(geoColor, fillStyle) });
                circle._geoType = 'range-circle';
                circle._geoData = { center: e.latlng, radiusKm, color: geoColor, fillStyle };
                circle.bindPopup(buildGeoPopupContent(circle, 'range-circle', circle._geoData), GEO_POPUP_OPTIONS);
                circle.on('popupopen', () => {
                    removeGeoResizeHandles();
                    const d = circle._geoData;
                    const handleLat = latLngAtBearing(d.center, d.radiusKm, 0);
                    createGeoResizeHandle(handleLat, (newLat, isFinal) => {
                        const distM = haversineDistance(d.center.lat, d.center.lng, newLat.lat, newLat.lng);
                        d.radiusKm = parseFloat((distM / 1000).toFixed(2));
                        circle.setRadius(d.radiusKm * 1000);
                        circle.setPopupContent(buildGeoPopupContent(circle, 'range-circle', d));
                        bindGeoPopupHandlers(circle, 'range-circle');
                        syncGeoShapeHandlesToGeometry(circle, 'range-circle');
                        if (isFinal && activeGeoResizeHandles.length >= 1) {
                            activeGeoResizeHandles[0].setLatLng(latLngAtBearing(d.center, d.radiusKm, 0));
                        }
                        if (isFinal) scheduleSaveToStorage();
                    }, circle._layerId);
                    bindGeoCenterMoveHandle(circle, 'range-circle');
                    bindGeoPopupHandlers(circle, 'range-circle');
                });
                circle.on('popupclose', removeGeoResizeHandles);
                addToActiveLayer(circle);
                return;
            }
            if (tool === 'range-sector') {
                clearGeoPlacementPreview();
                const geoColor = getGeoColor();
                const fillStyle = getGeoFillStyle();
                const radiusKm = parseFloat(geoSectorRadiusInput?.value || 5) || 5;
                const bearing = parseFloat(geoBearingInput?.value || 0) || 0;
                const aperture = parseFloat(geoApertureInput?.value || 90) || 90;
                const points = createSectorPolygon(e.latlng, radiusKm, bearing, aperture);
                const sector = L.polygon(points, { ...getGeoShapeStyle(geoColor, fillStyle) });
                sector._geoType = 'range-sector';
                sector._geoData = { center: e.latlng, radiusKm, bearing, aperture, color: geoColor, fillStyle };
                sector.bindPopup(buildGeoPopupContent(sector, 'range-sector', sector._geoData), GEO_POPUP_OPTIONS);
                sector.on('popupopen', () => {
                    removeGeoResizeHandles();
                    const d = sector._geoData;
                    const handleLat = latLngAtBearing(d.center, d.radiusKm, d.bearing);
                    createGeoResizeHandle(handleLat, (newLat, isFinal) => {
                        const distM = haversineDistance(d.center.lat, d.center.lng, newLat.lat, newLat.lng);
                        d.radiusKm = parseFloat((distM / 1000).toFixed(2));
                        const pts = createSectorPolygon(d.center, d.radiusKm, d.bearing, d.aperture);
                        sector.setLatLngs(pts);
                        sector.setPopupContent(buildGeoPopupContent(sector, 'range-sector', d));
                        bindGeoPopupHandlers(sector, 'range-sector');
                        syncGeoShapeHandlesToGeometry(sector, 'range-sector');
                        if (isFinal && activeGeoResizeHandles.length >= 1) {
                            activeGeoResizeHandles[0].setLatLng(latLngAtBearing(d.center, d.radiusKm, d.bearing));
                        }
                        if (isFinal) scheduleSaveToStorage();
                    }, sector._layerId);
                    bindGeoCenterMoveHandle(sector, 'range-sector');
                    bindGeoPopupHandlers(sector, 'range-sector');
                });
                sector.on('popupclose', removeGeoResizeHandles);
                addToActiveLayer(sector);
                return;
            }
            if (tool === 'circle-2pt') {
                clearGeoPlacementPreview();
                geoCircle2ptPoints.push(e.latlng);
                if (geoCircle2ptPoints.length === 1) {
                    geoCircle2ptPreview = L.circle(geoCircle2ptPoints[0], { radius: 1, color: getGeoColor(), weight: 2, fillColor: getGeoColor(), fillOpacity: 0.15, dashArray: '5,5', className: 'geo-preview-shadow' });
                    geoCircle2ptPreview.addTo(previewLayer);
                } else if (geoCircle2ptPoints.length === 2) {
                    const distM = haversineDistance(geoCircle2ptPoints[0].lat, geoCircle2ptPoints[0].lng, geoCircle2ptPoints[1].lat, geoCircle2ptPoints[1].lng);
                    const radiusKm = distM / 1000;
                    const geoColor = getGeoColor();
                    previewLayer.removeLayer(geoCircle2ptPreview);
                    geoCircle2ptPreview = null;
                    const fillStyle = getGeoFillStyle();
                    const circle = L.circle(geoCircle2ptPoints[0], { radius: distM, ...getGeoShapeStyle(geoColor, fillStyle) });
                    circle._geoType = 'circle-2pt';
                    circle._geoData = { center: geoCircle2ptPoints[0], radiusKm, color: geoColor, fillStyle };
                    circle.bindPopup(buildGeoPopupContent(circle, 'circle-2pt', circle._geoData), GEO_POPUP_OPTIONS);
                    circle.on('popupopen', () => {
                        removeGeoResizeHandles();
                        const d = circle._geoData;
                        const handleLat = latLngAtBearing(d.center, d.radiusKm, 0);
                        createGeoResizeHandle(handleLat, (newLat, isFinal) => {
                            const distM = haversineDistance(d.center.lat, d.center.lng, newLat.lat, newLat.lng);
                            d.radiusKm = parseFloat((distM / 1000).toFixed(2));
                            circle.setRadius(d.radiusKm * 1000);
                            circle.setPopupContent(buildGeoPopupContent(circle, 'circle-2pt', d));
                            bindGeoPopupHandlers(circle, 'circle-2pt');
                            syncGeoShapeHandlesToGeometry(circle, 'circle-2pt');
                            if (isFinal && activeGeoResizeHandles.length >= 1) activeGeoResizeHandles[0].setLatLng(latLngAtBearing(d.center, d.radiusKm, 0));
                            if (isFinal) scheduleSaveToStorage();
                        }, circle._layerId);
                        bindGeoCenterMoveHandle(circle, 'circle-2pt');
                        bindGeoPopupHandlers(circle, 'circle-2pt');
                    });
                    circle.on('popupclose', removeGeoResizeHandles);
                    addToActiveLayer(circle);
                    geoCircle2ptPoints = [];
                }
                return;
            }
            if (tool === 'semi-circle') {
                clearGeoPlacementPreview();
                const geoColor = getGeoColor();
                const fillStyle = getGeoFillStyle();
                const radiusKm = parseFloat(geoSemiRadiusInput?.value || 5) || 5;
                const bearing = parseFloat(geoSemiBearingInput?.value || 0) || 0;
                const points = createSectorPolygon(e.latlng, radiusKm, bearing, 180);
                const sector = L.polygon(points, { ...getGeoShapeStyle(geoColor, fillStyle) });
                sector._geoType = 'semi-circle';
                sector._geoData = { center: e.latlng, radiusKm, bearing, aperture: 180, color: geoColor, fillStyle };
                sector.bindPopup(buildGeoPopupContent(sector, 'semi-circle', sector._geoData), GEO_POPUP_OPTIONS);
                sector.on('popupopen', () => {
                    removeGeoResizeHandles();
                    const d = sector._geoData;
                    const handleLat = latLngAtBearing(d.center, d.radiusKm, d.bearing);
                    createGeoResizeHandle(handleLat, (newLat, isFinal) => {
                        const distM = haversineDistance(d.center.lat, d.center.lng, newLat.lat, newLat.lng);
                        d.radiusKm = parseFloat((distM / 1000).toFixed(2));
                        const pts = createSectorPolygon(d.center, d.radiusKm, d.bearing, 180);
                        sector.setLatLngs(pts);
                        sector.setPopupContent(buildGeoPopupContent(sector, 'semi-circle', d));
                        bindGeoPopupHandlers(sector, 'semi-circle');
                        syncGeoShapeHandlesToGeometry(sector, 'semi-circle');
                        if (isFinal && activeGeoResizeHandles.length >= 1) activeGeoResizeHandles[0].setLatLng(latLngAtBearing(d.center, d.radiusKm, d.bearing));
                        if (isFinal) scheduleSaveToStorage();
                    }, sector._layerId);
                    bindGeoCenterMoveHandle(sector, 'semi-circle');
                    bindGeoPopupHandlers(sector, 'semi-circle');
                });
                sector.on('popupclose', removeGeoResizeHandles);
                addToActiveLayer(sector);
                return;
            }
            if (tool === 'rectangle') {
                clearGeoPlacementPreview();
                geoRectanglePoints.push(e.latlng);
                if (geoRectanglePoints.length === 1) {
                    const corners = createRectangleCorners(e.latlng, e.latlng);
                    geoRectanglePreview = L.polygon(corners, { color: getGeoColor(), weight: 2, fillColor: getGeoColor(), fillOpacity: 0.15, dashArray: '5,5', className: 'geo-preview-shadow' });
                    geoRectanglePreview.addTo(previewLayer);
                } else if (geoRectanglePoints.length === 2) {
                    const corners = createRectangleCorners(geoRectanglePoints[0], geoRectanglePoints[1]);
                    const geoColor = getGeoColor();
                    const fillStyle = getGeoFillStyle();
                    previewLayer.removeLayer(geoRectanglePreview);
                    geoRectanglePreview = null;
                    const rect = L.polygon(corners, { ...getGeoShapeStyle(geoColor, fillStyle) });
                    rect._geoType = 'rectangle';
                    rect._geoData = { corners, color: geoColor, fillStyle };
                    rect.bindPopup(buildGeoPopupContent(rect, 'rectangle', rect._geoData), GEO_POPUP_OPTIONS);
                    rect.on('popupopen', () => {
                        removeGeoResizeHandles();
                        bindGeoCenterMoveHandle(rect, 'rectangle');
                        bindGeoPopupHandlers(rect, 'rectangle');
                    });
                    rect.on('popupclose', removeGeoResizeHandles);
                    addToActiveLayer(rect);
                    geoRectanglePoints = [];
                }
                return;
            }
            if (tool === 'oval') {
                clearGeoPlacementPreview();
                geoOvalPoints.push(e.latlng);
                if (geoOvalPoints.length === 1) {
                    const corners = createRectangleCorners(e.latlng, e.latlng);
                    const ring = createEllipseRingFromBoundingCorners(corners, map, 64);
                    geoOvalPreview = L.polygon(ring, { color: getGeoColor(), weight: 2, fillColor: getGeoColor(), fillOpacity: 0.15, dashArray: '5,5', className: 'geo-preview-shadow' });
                    geoOvalPreview.addTo(previewLayer);
                } else if (geoOvalPoints.length === 2) {
                    const corners = createRectangleCorners(geoOvalPoints[0], geoOvalPoints[1]);
                    const geoColor = getGeoColor();
                    const fillStyle = getGeoFillStyle();
                    previewLayer.removeLayer(geoOvalPreview);
                    geoOvalPreview = null;
                    const ring = createEllipseRingFromBoundingCorners(corners, map, 64);
                    const oval = L.polygon(ring, { ...getGeoShapeStyle(geoColor, fillStyle) });
                    oval._geoType = 'oval';
                    oval._geoData = { corners, color: geoColor, fillStyle };
                    oval.bindPopup(buildGeoPopupContent(oval, 'oval', oval._geoData), GEO_POPUP_OPTIONS);
                    oval.on('popupopen', () => {
                        removeGeoResizeHandles();
                        bindGeoCenterMoveHandle(oval, 'oval');
                        bindGeoPopupHandlers(oval, 'oval');
                    });
                    oval.on('popupclose', removeGeoResizeHandles);
                    if (['vertical', 'horizontal', 'both'].includes(fillStyle)) oval.once('add', () => scheduleGeoPathFill(oval));
                    addToActiveLayer(oval);
                    geoOvalPoints = [];
                }
                return;
            }
            if (tool === 'minefield') {
                clearGeoPlacementPreview();
                geoMinefieldPoints.push(e.latlng);
                if (geoMinefieldPoints.length === 1) {
                    const corners = createRectangleCorners(e.latlng, e.latlng);
                    geoMinefieldPreview = L.polygon(corners, { color: getGeoColor(), weight: 3, fillColor: getGeoColor(), fillOpacity: 0.1, dashArray: '5,5', className: 'geo-preview-shadow' });
                    geoMinefieldPreview.addTo(previewLayer);
                } else if (geoMinefieldPoints.length === 2) {
                    const corners = createRectangleCorners(geoMinefieldPoints[0], geoMinefieldPoints[1]);
                    const geoColor = getGeoColor();
                    const mineType = getSelectedMineType() || 'ap';
                    previewLayer.removeLayer(geoMinefieldPreview);
                    geoMinefieldPreview = null;
                    const mf = L.polygon(corners, getMinefieldStyle(geoColor, mineType));
                    mf._geoType = 'minefield';
                    mf._geoData = { corners, color: geoColor, mineType };
                    mf.bindPopup(buildGeoPopupContent(mf, 'minefield', mf._geoData), GEO_POPUP_OPTIONS);
                    mf.on('popupopen', () => {
                        bindMinefieldResizeHandles(mf);
                        bindGeoCenterMoveHandle(mf, 'minefield');
                        bindGeoPopupHandlers(mf, 'minefield');
                    });
                    mf.on('popupclose', removeGeoResizeHandles);
                    addToActiveLayer(mf);
                    mf.once('add', () => {
                        applyMinefieldFill(mf);
                        addMinefieldDecorations(mf, corners, geoColor, mf._layerId);
                    });
                    geoMinefieldPoints = [];
                }
                return;
            }
            if (tool === 'polygon') {
                clearGeoPlacementPreview();
                const geoColor = getGeoColor();
                const fillStyle = getGeoFillStyle();
                const sides = parseInt(geoPolygonSidesInput?.value || 6, 10) || 6;
                const radiusKm = parseFloat(geoPolygonRadiusInput?.value || 5) || 5;
                const rotation = parseFloat(geoPolygonRotationInput?.value || 0) || 0;
                const points = createRegularPolygon(e.latlng, radiusKm, Math.max(3, Math.min(20, sides)), rotation);
                const poly = L.polygon(points, { ...getGeoShapeStyle(geoColor, fillStyle) });
                poly._geoType = 'polygon';
                poly._geoData = { center: e.latlng, radiusKm, sides: Math.max(3, Math.min(20, sides)), rotation, color: geoColor, fillStyle };
                poly.bindPopup(buildGeoPopupContent(poly, 'polygon', poly._geoData), GEO_POPUP_OPTIONS);
                poly.on('popupopen', () => {
                    removeGeoResizeHandles();
                    const d = poly._geoData;
                    const handleLat = latLngAtBearing(d.center, d.radiusKm, d.rotation);
                    createGeoResizeHandle(handleLat, (newLat, isFinal) => {
                        const distM = haversineDistance(d.center.lat, d.center.lng, newLat.lat, newLat.lng);
                        d.radiusKm = parseFloat((distM / 1000).toFixed(2));
                        const pts = createRegularPolygon(d.center, d.radiusKm, d.sides, d.rotation);
                        poly.setLatLngs(pts);
                        poly.setPopupContent(buildGeoPopupContent(poly, 'polygon', d));
                        bindGeoPopupHandlers(poly, 'polygon');
                        syncGeoShapeHandlesToGeometry(poly, 'polygon');
                        if (isFinal && activeGeoResizeHandles.length >= 1) activeGeoResizeHandles[0].setLatLng(latLngAtBearing(d.center, d.radiusKm, d.rotation));
                        if (isFinal) scheduleSaveToStorage();
                    }, poly._layerId);
                    bindGeoCenterMoveHandle(poly, 'polygon');
                    bindGeoPopupHandlers(poly, 'polygon');
                });
                poly.on('popupclose', removeGeoResizeHandles);
                addToActiveLayer(poly);
                return;
            }
            if (tool === 'freeform') {
                clearGeoPlacementPreview();
                geoFreeformPoints.push(e.latlng);
                if (geoFreeformPoints.length === 1) {
                    geoDrawingControls?.classList.remove('hidden');
                }
                const geoColor = getGeoColor();
                if (!geoFreeformPreview) {
                    geoFreeformPreview = L.polygon(geoFreeformPoints, { color: geoColor, weight: 2, fillColor: geoColor, fillOpacity: 0.15, dashArray: '5,5', className: 'geo-preview-shadow' });
                    geoFreeformPreview.addTo(previewLayer);
                } else {
                    geoFreeformPreview.setLatLngs(geoFreeformPoints);
                    geoFreeformPreview.setStyle({ color: geoColor, fillColor: geoColor });
                }
                if (instructionText) instructionText.innerText = geoFreeformPoints.length < 3 ? t('inst-add-point-n', String(geoFreeformPoints.length + 1), '3') : t('inst-point-added', String(geoFreeformPoints.length));
                return;
            }
        }

        if (currentMode === 'eraser') {
            return;
        }
        if (currentMode === 'text') {
            showTextLabelModal(e.latlng);
            return;
        }
        if (addingPointTmgGroup) {
            const group = addingPointTmgGroup;
            const data = group._tmgData;
            if (!data || !data.segments.length) {
                addingPointTmgGroup = null;
                clearPlacementPreview();
                updateLineDrawingControls?.();
                return;
            }
            const lastSeg = data.segments[data.segments.length - 1];
            const fromLatlng = lastSeg._tmgData.latlng2;
            lastSeg._tmgData.useBodyOnly = true;
            updateTmgLayer(lastSeg);
            const toLatlng = snapLatLngForTmgPlacement(e.latlng);
            const newSeg = createTmgLayer(fromLatlng, toLatlng, data.typeId, data.color, false, true, { filled: data.filled, dashed: data.dashed, strokeWidth: data.strokeWidth ?? 4 });
            if (newSeg) {
                newSeg.on('click', () => group.openPopup(newSeg.getLatLng()));
                group.addLayer(newSeg);
                data.segments.push(newSeg);
                group.setPopupContent(buildGroupTmgPopupContent(group));
            }
            if (instructionText) instructionText.innerText = t('inst-add-point');
            updateLineDrawingControls();
            return;
        }
        if (reorientingTmgMarker) {
            const m = reorientingTmgMarker;
            const d = m._tmgData;
            const snapped = snapLatLngForLinePlacement(e.latlng);
            if (d?.catkUnified && m._catkGroup?._tmgData?.points?.length) {
                const cg = m._catkGroup._tmgData;
                const pts = cg.points;
                const ll = L.latLng(snapped.lat, snapped.lng);
                pts[0] = ll;
                if (cg.catkAutoJunction && pts.length === 3) {
                    pts[1] = catkInterpOnTailAxis(pts[2], pts[0], CATK_AUTO_JUNCTION_T);
                }
                syncCatkHeadMarkerToPoints(m, cg);
                refreshCatkMultiPointSelectionBox(m, m._catkGroup);
                scheduleSaveToStorage();
            } else {
                m._tmgData.latlng2 = snapped;
                updateTmgLayer(m);
            }
            reorientingTmgMarker = null;
            if (instructionText) {
                const def = selectedTmgType ? TACTICAL_GRAPHICS.find(d => d.id === selectedTmgType) : null;
                instructionText.innerText = def ? t('inst-place-tmg-2pt', getTmgLabel(def)) : t('inst-line-draw-change');
            }
            updateLineDrawingControls();
            return;
        }
        if (currentMode === 'symbol') {
            const sidc = generateSIDC();
            const opts = { ...getTextModifiers(), size: 25, simpleStatusModifier: true };

            const marker = L.marker(e.latlng, { icon: L.divIcon({ className: 'custom-nato-marker', html: '<div></div>', iconSize: [1, 1], iconAnchor: [0, 0] }), draggable: true });
            marker._sidc = sidc;
            marker._textModifiers = { ...opts };
            marker._statusKey = 'status-operational';
            marker._symbolRotationDeg = 0;
            refreshSymbolIcon(marker);

            // Add a popup for deletion/info
            marker.bindPopup(buildSymbolPopupContent(marker), { bubblingMouseEvents: false });

            marker.on('popupopen', () => {
                marker.setPopupContent(buildSymbolPopupContent(marker));
                bindSymbolPopupHandlers(marker);
            });

            addToActiveLayer(marker);

        } else if (currentMode === 'line') {
            if (selectedTmgType) {
                const latlng = snapLatLngForTmgPlacement(e.latlng);
                if (isParametricCatkPlacementType(selectedTmgType)) {
                    if (isRecentlyHandledParametricCatkDomClick(e.originalEvent)) return;
                    rememberHandledParametricCatkDomClick(e.originalEvent);
                    if (handleParametricCatkPlacementClick(latlng)) return;
                }
                // 2-point and 3-point placement: click to add points, double-click or Finish to complete
                // Delay add so double-click can cancel it (avoids extra point from 2nd click of dblclick)
                if (tmgClickPendingTimeout) clearTimeout(tmgClickPendingTimeout);

                // For scalloped near a circle-X, place the point instantly (no 250ms delay)
                const isCircleSnap = selectedTmgType === 'scalloped' && findClosestCircleXCenter(latlng, getCircleXSnapPx());
                const addPoint = () => {
                    tmgClickPendingTimeout = null;
                    tmgPoints.push(latlng);

                    // Auto-finish scalloped when ending at a different circle-X than the start
                    if (selectedTmgType === 'scalloped' && tmgPoints.length >= 2) {
                        const endCircle = findClosestCircleXCenter(latlng, getCircleXSnapPx());
                        const startCircle = findClosestCircleXCenter(tmgPoints[0], getCircleXSnapPx());
                        if (endCircle && (!startCircle || !startCircle.equals(endCircle))) {
                            const allCenters = getCircleXCenters();
                            const visited = new Set();
                            for (const pt of tmgPoints) {
                                const c = findClosestCircleXCenter(pt, getCircleXSnapPx());
                                if (c) visited.add(c.lat + ',' + c.lng);
                            }
                            if (visited.size >= allCenters.length) {
                                createTmgFromPoints(tmgPoints);
                                tmgPoints = [];
                                clearPlacementPreview();
                                updateLineDrawingControls();
                                if (instructionText) instructionText.innerText = 'Front line complete. Choose flank distance.';
                                return;
                            }
                        }
                    }

                    updateLineDrawingControls();
                    if (instructionText) {
                        const def = TACTICAL_GRAPHICS.find(d => d.id === selectedTmgType);
                        const ptCount = tmgPoints.length;
                        instructionText.innerText = ptCount >= 2
                            ? t('inst-place-tmg-finish', getTmgLabel(def))
                            : t(instPlaceTmgKeyForTypeId(def.id), getTmgLabel(def));
                    }
                };
                if (isCircleSnap) {
                    addPoint();
                } else {
                    tmgClickPendingTimeout = setTimeout(addPoint, 250);
                }
                return;
            }
            if (shouldBlockTacticalLinePlacementClick()) return;
            drawLineCoords.push(snapLatLngForLinePlacement(e.latlng));
            updateLineDrawingControls();

            const color = getLineColor();
            const dashArray = lineStyleSelect.value === 'dotted' ? '10, 10' : null;

            if (!drawLinePolyline) {
                const target = getActiveLayerGroup();
                drawLinePolyline = L.polyline(drawLineCoords, {
                    color: color,
                    weight: 4,
                    dashArray: dashArray
                }).addTo(target || map);
            } else {
                drawLinePolyline.setLatLngs(drawLineCoords);
            }
        }
    });

    let geoPreviewCircle = null;
    let geoPreviewSector = null;
    let geoPreviewSemiCircle = null;
    let geoPreviewPolygon = null;
    let geoPreviewPolyline = null;

    const GEO_PREVIEW_STYLE = { fillOpacity: 0.2, dashArray: '6,6', weight: 2, className: 'geo-preview-shadow' };

    function updateGeoPlacementPreview(latlng) {
        if (!isGeoPanelActive() || !latlng) return;
        const tool = getGeoSelectedTool();
        if (tool === 'none') {
            clearGeoPlacementPreview();
        } else if (tool === 'distance' && geoDistancePoints.length >= 1 && geoDistancePolyline) {
            if (geoPreviewPolyline) { previewLayer.removeLayer(geoPreviewPolyline); geoPreviewPolyline = null; }
            const pts = [...geoDistancePoints, latlng];
            geoDistancePolyline.setLatLngs(pts);
        } else if (tool === 'circle-2pt' && geoCircle2ptPoints.length === 1 && geoCircle2ptPreview) {
            if (geoPreviewCircle) { previewLayer.removeLayer(geoPreviewCircle); geoPreviewCircle = null; }
            const distM = haversineDistance(geoCircle2ptPoints[0].lat, geoCircle2ptPoints[0].lng, latlng.lat, latlng.lng);
            geoCircle2ptPreview.setLatLng(geoCircle2ptPoints[0]);
            geoCircle2ptPreview.setRadius(Math.max(100, distM));
            geoCircle2ptPreview.setStyle({ color: getGeoColor(), fillColor: getGeoColor() });
        } else if (tool === 'rectangle' && geoRectanglePoints.length === 1 && geoRectanglePreview) {
            if (geoPreviewPolygon) { previewLayer.removeLayer(geoPreviewPolygon); geoPreviewPolygon = null; }
            const corners = createRectangleCorners(geoRectanglePoints[0], latlng);
            geoRectanglePreview.setLatLngs(corners);
            geoRectanglePreview.setStyle({ color: getGeoColor(), fillColor: getGeoColor() });
        } else if (tool === 'oval' && geoOvalPoints.length === 1 && geoOvalPreview) {
            if (geoPreviewPolygon) { previewLayer.removeLayer(geoPreviewPolygon); geoPreviewPolygon = null; }
            const corners = createRectangleCorners(geoOvalPoints[0], latlng);
            const ring = createEllipseRingFromBoundingCorners(corners, map, 64);
            geoOvalPreview.setLatLngs(ring);
            geoOvalPreview.setStyle({ color: getGeoColor(), fillColor: getGeoColor() });
        } else if (tool === 'minefield' && geoMinefieldPoints.length === 1 && geoMinefieldPreview) {
            if (geoPreviewPolygon) { previewLayer.removeLayer(geoPreviewPolygon); geoPreviewPolygon = null; }
            const corners = createRectangleCorners(geoMinefieldPoints[0], latlng);
            geoMinefieldPreview.setLatLngs(corners);
            geoMinefieldPreview.setStyle({ color: getGeoColor(), fillColor: getGeoColor() });
        } else if (tool === 'freeform' && geoFreeformPoints.length >= 1 && geoFreeformPreview) {
            if (geoPreviewPolygon) { previewLayer.removeLayer(geoPreviewPolygon); geoPreviewPolygon = null; }
            const pts = [...geoFreeformPoints, latlng];
            geoFreeformPreview.setLatLngs(pts);
            geoFreeformPreview.setStyle({ color: getGeoColor(), fillColor: getGeoColor() });
        } else if (tool === 'freeform' && geoFreeformPoints.length === 0) {
            const geoColor = getGeoColor();
            const size = 0.01;
            const pts = [latlng, L.latLng(latlng.lat + size, latlng.lng), L.latLng(latlng.lat + size * 0.5, latlng.lng + size)];
            if (!geoPreviewPolygon) {
                geoPreviewPolygon = L.polygon(pts, { color: geoColor, fillColor: geoColor, ...GEO_PREVIEW_STYLE });
                geoPreviewPolygon.addTo(previewLayer);
            } else {
                geoPreviewPolygon.setLatLngs(pts);
                geoPreviewPolygon.setStyle({ color: geoColor, fillColor: geoColor });
            }
        } else if (tool === 'range-circle') {
            const radiusKm = parseFloat(geoRadiusInput?.value || 5) || 5;
            const geoColor = getGeoColor();
            if (!geoPreviewCircle) {
                geoPreviewCircle = L.circle(latlng, { radius: radiusKm * 1000, color: geoColor, fillColor: geoColor, ...GEO_PREVIEW_STYLE });
                geoPreviewCircle.addTo(previewLayer);
            } else {
                geoPreviewCircle.setLatLng(latlng);
                geoPreviewCircle.setRadius(radiusKm * 1000);
                geoPreviewCircle.setStyle({ color: geoColor, fillColor: geoColor });
            }
        } else if (tool === 'range-sector') {
            const radiusKm = parseFloat(geoSectorRadiusInput?.value || 5) || 5;
            const bearing = parseFloat(geoBearingInput?.value || 0) || 0;
            const aperture = parseFloat(geoApertureInput?.value || 90) || 90;
            const geoColor = getGeoColor();
            const points = createSectorPolygon(latlng, radiusKm, bearing, aperture);
            if (!geoPreviewSector) {
                geoPreviewSector = L.polygon(points, { color: geoColor, fillColor: geoColor, ...GEO_PREVIEW_STYLE });
                geoPreviewSector.addTo(previewLayer);
            } else {
                geoPreviewSector.setLatLngs(points);
                geoPreviewSector.setStyle({ color: geoColor, fillColor: geoColor });
            }
        } else if (tool === 'semi-circle') {
            const radiusKm = parseFloat(geoSemiRadiusInput?.value || 5) || 5;
            const bearing = parseFloat(geoSemiBearingInput?.value || 0) || 0;
            const geoColor = getGeoColor();
            const points = createSectorPolygon(latlng, radiusKm, bearing, 180);
            if (!geoPreviewSemiCircle) {
                geoPreviewSemiCircle = L.polygon(points, { color: geoColor, fillColor: geoColor, ...GEO_PREVIEW_STYLE });
                geoPreviewSemiCircle.addTo(previewLayer);
            } else {
                geoPreviewSemiCircle.setLatLngs(points);
                geoPreviewSemiCircle.setStyle({ color: geoColor, fillColor: geoColor });
            }
        } else if (tool === 'rectangle' && geoRectanglePoints.length === 0) {
            const geoColor = getGeoColor();
            const size = 0.015;
            const corners = createRectangleCorners(latlng, L.latLng(latlng.lat + size, latlng.lng + size));
            if (!geoPreviewPolygon) {
                geoPreviewPolygon = L.polygon(corners, { color: geoColor, fillColor: geoColor, ...GEO_PREVIEW_STYLE });
                geoPreviewPolygon.addTo(previewLayer);
            } else {
                geoPreviewPolygon.setLatLngs(corners);
                geoPreviewPolygon.setStyle({ color: geoColor, fillColor: geoColor });
            }
        } else if (tool === 'oval' && geoOvalPoints.length === 0) {
            const geoColor = getGeoColor();
            const size = 0.015;
            const corners = createRectangleCorners(latlng, L.latLng(latlng.lat + size, latlng.lng + size));
            const ring = createEllipseRingFromBoundingCorners(corners, map, 64);
            if (!geoPreviewPolygon) {
                geoPreviewPolygon = L.polygon(ring, { color: geoColor, fillColor: geoColor, ...GEO_PREVIEW_STYLE });
                geoPreviewPolygon.addTo(previewLayer);
            } else {
                geoPreviewPolygon.setLatLngs(ring);
                geoPreviewPolygon.setStyle({ color: geoColor, fillColor: geoColor });
            }
        } else if (tool === 'minefield' && geoMinefieldPoints.length === 0) {
            const geoColor = getGeoColor();
            const size = 0.015;
            const corners = createRectangleCorners(latlng, L.latLng(latlng.lat + size, latlng.lng + size));
            if (!geoPreviewPolygon) {
                geoPreviewPolygon = L.polygon(corners, { color: geoColor, fillColor: geoColor, ...GEO_PREVIEW_STYLE });
                geoPreviewPolygon.addTo(previewLayer);
            } else {
                geoPreviewPolygon.setLatLngs(corners);
                geoPreviewPolygon.setStyle({ color: geoColor, fillColor: geoColor });
            }
        } else if (tool === 'polygon') {
            const sides = parseInt(geoPolygonSidesInput?.value || 6, 10) || 6;
            const radiusKm = parseFloat(geoPolygonRadiusInput?.value || 5) || 5;
            const rotation = parseFloat(geoPolygonRotationInput?.value || 0) || 0;
            const geoColor = getGeoColor();
            const points = createRegularPolygon(latlng, radiusKm, Math.max(3, Math.min(20, sides)), rotation);
            if (!geoPreviewPolygon) {
                geoPreviewPolygon = L.polygon(points, { color: geoColor, fillColor: geoColor, ...GEO_PREVIEW_STYLE });
                geoPreviewPolygon.addTo(previewLayer);
            } else {
                geoPreviewPolygon.setLatLngs(points);
                geoPreviewPolygon.setStyle({ color: geoColor, fillColor: geoColor });
            }
        } else if (tool === 'distance' && geoDistancePoints.length === 0) {
            const geoColor = getGeoColor();
            const size = 0.008;
            const pts = [latlng, L.latLng(latlng.lat + size, latlng.lng + size)];
            if (!geoPreviewPolyline) {
                geoPreviewPolyline = L.polyline(pts, { color: geoColor, weight: 3, dashArray: '6,6', className: 'geo-preview-shadow' });
                geoPreviewPolyline.addTo(previewLayer);
            } else {
                geoPreviewPolyline.setLatLngs(pts);
                geoPreviewPolyline.setStyle({ color: geoColor });
            }
        } else if (tool === 'circle-2pt' && geoCircle2ptPoints.length === 0) {
            const geoColor = getGeoColor();
            const radiusM = 50000;
            if (!geoPreviewCircle) {
                geoPreviewCircle = L.circle(latlng, { radius: radiusM, color: geoColor, fillColor: geoColor, ...GEO_PREVIEW_STYLE });
                geoPreviewCircle.addTo(previewLayer);
            } else {
                geoPreviewCircle.setLatLng(latlng);
                geoPreviewCircle.setRadius(radiusM);
                geoPreviewCircle.setStyle({ color: geoColor, fillColor: geoColor });
            }
        }
    }

    function clearGeoPlacementPreview() {
        if (geoPreviewCircle) {
            previewLayer.removeLayer(geoPreviewCircle);
            geoPreviewCircle = null;
        }
        if (geoPreviewSector) {
            previewLayer.removeLayer(geoPreviewSector);
            geoPreviewSector = null;
        }
        if (geoPreviewSemiCircle) {
            previewLayer.removeLayer(geoPreviewSemiCircle);
            geoPreviewSemiCircle = null;
        }
        if (geoPreviewPolygon) {
            previewLayer.removeLayer(geoPreviewPolygon);
            geoPreviewPolygon = null;
        }
        if (geoPreviewPolyline) {
            previewLayer.removeLayer(geoPreviewPolyline);
            geoPreviewPolyline = null;
        }
    }

    let circleXSnapRing = null;
    const coordTooltip = document.getElementById('coord-tooltip');
    let coordTooltipLayoutRaf = null;
    function layoutCoordTooltipBelowZoom() {
        if (!coordTooltip || coordTooltip.style.display === 'none') return;
        const zoomEl = map.getContainer().querySelector('.leaflet-control-zoom');
        if (!zoomEl) return;
        const zr = zoomEl.getBoundingClientRect();
        let cx = zr.left + zr.width / 2;
        const top = zr.bottom + 6;
        coordTooltip.style.position = 'fixed';
        coordTooltip.style.top = Math.round(top) + 'px';
        coordTooltip.style.right = 'auto';
        coordTooltip.style.bottom = 'auto';
        coordTooltip.style.left = Math.round(cx) + 'px';
        // After translateX(-50%), keep full label inside the viewport (long strings + distance suffix)
        const pad = 6;
        const half = coordTooltip.getBoundingClientRect().width / 2;
        cx = Math.max(pad + half, Math.min(cx, window.innerWidth - pad - half));
        coordTooltip.style.left = Math.round(cx) + 'px';
    }
    function scheduleCoordTooltipLayout() {
        if (!coordTooltip || coordTooltip.style.display === 'none') return;
        if (coordTooltipLayoutRaf != null) cancelAnimationFrame(coordTooltipLayoutRaf);
        coordTooltipLayoutRaf = requestAnimationFrame(() => {
            coordTooltipLayoutRaf = null;
            layoutCoordTooltipBelowZoom();
        });
    }
    window.addEventListener('resize', scheduleCoordTooltipLayout);
    map.on('resize zoomend', scheduleCoordTooltipLayout);
    let _mousemoveRafPending = false;
    map.on('mousemove', (e) => {
        // Clear the recent-click guard once the mouse moves — any future click is intentional.
        if (window.freeDrawSignatureRecentClick) {
            window.freeDrawSignatureRecentClick = false;
        }
        // Throttle heavy preview work to one call per animation frame.
        // Lightweight coord tooltip updates run immediately below.
        if (!_mousemoveRafPending) {
            _mousemoveRafPending = true;
            const latlng = e.latlng;
            requestAnimationFrame(() => {
                _mousemoveRafPending = false;
                // Transfer scalloped start point: when only 1 point placed and the cursor
                // is directly on top of a different circle-X, move the start to that circle.
                if (currentMode === 'line' && selectedTmgType === 'scalloped' && tmgPoints.length === 1) {
                    const nearCircle = findClosestCircleXCenter(latlng, getCircleXSnapPx());
                    if (nearCircle) {
                        const startCircle = findClosestCircleXCenter(tmgPoints[0], getCircleXSnapPx());
                        if (!startCircle || !nearCircle.equals(startCircle)) {
                            tmgPoints[0] = nearCircle;
                        }
                    }
                }
                if (currentMode === 'symbol' || currentMode === 'line' || addingPointTmgGroup) {
                    const ll = (currentMode === 'line' || addingPointTmgGroup) ? snapLatLngForTmgPlacement(latlng) : latlng;
                    updatePlacementPreview(ll);
                }
                // Circle-X snap ring indicator for frontline drawing
                if (currentMode === 'line') {
                    const nearCircle = findClosestCircleXCenter(latlng, getCircleXSnapPx());
                    if (nearCircle) {
                        const ringRadius = Math.max(20, (48 * getMapViewPixelScale()) / 2 + 4);
                        if (!circleXSnapRing) {
                            circleXSnapRing = L.circleMarker(nearCircle, { radius: ringRadius, color: '#22c55e', weight: 2, fill: false, dashArray: '6,4', interactive: false, pane: 'placementPreviewPane' });
                            previewLayer.addLayer(circleXSnapRing);
                        } else {
                            circleXSnapRing.setLatLng(nearCircle);
                            circleXSnapRing.setRadius(ringRadius);
                        }
                    } else if (circleXSnapRing) {
                        previewLayer.removeLayer(circleXSnapRing);
                        circleXSnapRing = null;
                    }
                } else if (circleXSnapRing) {
                    previewLayer.removeLayer(circleXSnapRing);
                    circleXSnapRing = null;
                }
                if (isGeoPanelActive()) {
                    updateGeoPlacementPreview(latlng);
                }
            });
        }
        if (coordTooltip) {
            let tipText = formatCoordForDisplay(e.latlng.lat, e.latlng.lng);
            if (isGeoPanelActive() && getGeoSelectedTool() === 'distance' && geoDistancePoints.length >= 1) {
                const pts = [...geoDistancePoints, e.latlng];
                const dkm = totalDistanceKm(pts);
                if (dkm > 0) tipText += ' · ' + formatKmAndNm(dkm);
            } else if (currentMode === 'line' && !selectedTmgType && drawLineCoords.length >= 1) {
                const pts = [...drawLineCoords, snapLatLngForLinePlacement(e.latlng)];
                const dkm = totalDistanceKm(pts);
                if (dkm > 0) tipText += ' · ' + formatKmAndNm(dkm);
            } else if (currentMode === 'line' && selectedTmgType === 'scalloped' && tmgPoints.length >= 1) {
                const pts = [...tmgPoints, e.latlng];
                const dkm = totalDistanceKm(pts);
                if (dkm > 0) tipText += ' · ' + formatKmAndNm(dkm);
            }
            coordTooltip.textContent = tipText;
            coordTooltip.style.display = 'block';
            scheduleCoordTooltipLayout();
        }
    });

    map.on('mouseout', () => {
        clearPlacementPreview();
        clearGeoPlacementPreview();
        if (coordTooltip) coordTooltip.style.display = 'none';
    });

    // Freehand / eraser drag / selection rect: mouse + pointer (touch, pen)
    const mapContainerEl = map.getContainer();
    const usePointerDraw = typeof window.PointerEvent === 'function';
    let lastHandledParametricCatkDomClick = null;

    function getClientXY(e) {
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        if (e.changedTouches && e.changedTouches.length > 0) {
            return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
        }
        if (typeof e.clientX === 'number' && typeof e.clientY === 'number') {
            return { x: e.clientX, y: e.clientY };
        }
        return null;
    }

    function beginMapDrawPointerCapture(e) {
        if (!usePointerDraw || typeof e.pointerId !== 'number') return;
        mapDrawActivePointerId = e.pointerId;
        try {
            mapContainerEl.setPointerCapture(e.pointerId);
        } catch (err) { /* ignore */ }
    }

    function endMapDrawPointerCapture() {
        if (mapDrawActivePointerId === null) return;
        try {
            mapContainerEl.releasePointerCapture(mapDrawActivePointerId);
        } catch (err) { /* ignore */ }
        mapDrawActivePointerId = null;
    }

    function mapDrawPointerMatches(e) {
        if (!usePointerDraw || mapDrawActivePointerId === null) return true;
        if (typeof e.pointerId !== 'number') return true;
        return e.pointerId === mapDrawActivePointerId;
    }

    function screenToLatLng(e) {
        const pt = getClientXY(e);
        if (!pt) return null;
        const rect = mapContainerEl.getBoundingClientRect();
        const x = pt.x - rect.left;
        const y = pt.y - rect.top;
        if (x < 0 || x > rect.width || y < 0 || y > rect.height) return null;
        return map.containerPointToLatLng(L.point(x, y));
    }

    function rememberHandledParametricCatkDomClick(e) {
        const pt = getClientXY(e);
        if (!pt) return;
        lastHandledParametricCatkDomClick = { x: pt.x, y: pt.y, at: Date.now() };
    }

    function isRecentlyHandledParametricCatkDomClick(e) {
        const pt = getClientXY(e);
        if (!pt || !lastHandledParametricCatkDomClick) return false;
        // Only suppress same-gesture duplicate paths (mousedown/click bubbling),
        // not legitimate user second/third clicks.
        return Math.abs(lastHandledParametricCatkDomClick.x - pt.x) <= 6
            && Math.abs(lastHandledParametricCatkDomClick.y - pt.y) <= 6
            && (Date.now() - lastHandledParametricCatkDomClick.at) <= 95;
    }

    function shouldIgnoreRawParametricCatkClickTarget(target) {
        if (!target || !map.getContainer().contains(target)) return true;
        if (target.closest?.('.leaflet-popup')) return true;
        if (target.closest?.('.sidebar') || target.closest?.('.top-bar') || target.closest?.('.modal')) return true;
        if (target.closest?.('.tmg-resize-handle') || target.closest?.('.geo-resize-handle') || target.closest?.('.geo-center-move-handle') || target.closest?.('.selection-area-anchor') || target.closest?.('.selection-area-rotate-handle')) return true;
        return false;
    }

    function queueRawParametricCatkPlacementFromDomEvent(e) {
        if (typeof e.button === 'number' && e.button !== 0) return;
        if (currentMode !== 'line' || !selectedTmgType || !isParametricCatkPlacementType(selectedTmgType)) return;
        if (e.type === 'mousedown' && !catkPlacementState) return;
        if (!(catkPlacementState === null || catkPlacementState?.phase === 'tailPlaced' || catkPlacementState?.phase === 'bodyDrawing')) return;
        if (shouldIgnoreRawParametricCatkClickTarget(e.target)) return;
        const latlng = screenToLatLng(e);
        if (!latlng) return;
        if (e.type === 'mousedown') {
            e.preventDefault?.();
        }
        setTimeout(() => {
            if (isRecentlyHandledParametricCatkDomClick(e)) return;
            if (currentMode !== 'line' || !selectedTmgType || !isParametricCatkPlacementType(selectedTmgType)) return;
            rememberHandledParametricCatkDomClick(e);
            handleParametricCatkPlacementClick(snapLatLngForTmgPlacement(latlng));
        }, 0);
    }

    // Capture-phase fallback for cases where Leaflet's synthetic map click is
    // swallowed before the normal map click handler runs.
    mapContainerEl.addEventListener('mousedown', queueRawParametricCatkPlacementFromDomEvent, true);
    mapContainerEl.addEventListener('click', queueRawParametricCatkPlacementFromDomEvent, true);

    /** True if event target is a draggable line/geo handle (avoid starting freehand / selection / eraser on same gesture). */
    function mapDrawPointerDownOnOverlayHandle(target) {
        if (!target || typeof target.closest !== 'function') return false;
        return !!(
            target.closest('.tmg-resize-handle') ||
            target.closest('.geo-resize-handle') ||
            target.closest('.geo-center-move-handle') ||
            target.closest('.selection-area-anchor') ||
            target.closest('.selection-area-rotate-handle')
        );
    }

    function mapDrawPointerDown(e) {
        if (usePointerDraw && e.type === 'mousedown') return;
        if (typeof e.button === 'number' && e.button !== 0) return;

        if (currentMode === 'line' && selectedTmgType && isParametricCatkPlacementType(selectedTmgType)) {
            if (mapDrawPointerDownOnOverlayHandle(e.target)) return;
            if (shouldIgnoreRawParametricCatkClickTarget(e.target)) return;
            const latlng = screenToLatLng(e);
            if (latlng) {
                rememberHandledParametricCatkDomClick(e);
                handleParametricCatkPlacementClick(snapLatLngForTmgPlacement(latlng));
                e.preventDefault();
                return;
            }
        }

        if (e.button === 0 && currentMode === 'select' && !selectionPendingAction) {
            if (mapDrawPointerDownOnOverlayHandle(e.target)) return;
            if (e.target.closest?.('.leaflet-popup') || e.target.closest?.('.sidebar') || e.target.closest?.('.top-bar')) return;
            const latlng = screenToLatLng(e);
            if (latlng) {
                selectionRectStart = latlng;
                map.dragging.disable();
                if (selectionRectLayer) previewLayer.removeLayer(selectionRectLayer);
                selectionRectLayer = L.rectangle(L.latLngBounds(latlng, latlng), { color: '#3b82f6', weight: 2, fillColor: '#3b82f6', fillOpacity: 0.15, dashArray: '5,5' });
                selectionRectLayer.addTo(previewLayer);
                if (instructionText) instructionText.innerText = t('inst-select-drag');
                beginMapDrawPointerCapture(e);
                e.preventDefault();
                return;
            }
        }
        if (e.button === 0 && currentMode === 'eraser') {
            if (mapDrawPointerDownOnOverlayHandle(e.target)) return;
            if (e.target.closest?.('.leaflet-popup') || e.target.closest?.('.sidebar') || e.target.closest?.('.top-bar')) return;
            const pt = getClientXY(e);
            if (!pt) return;
            isEraserDragging = true;
            eraserActiveGestureId = ++eraserGestureSequence;
            lastEraserScreenPos = { x: pt.x, y: pt.y };
            const latlng = screenToLatLng(e);
            if (latlng && eraseSegmentAtPoint(latlng, { gestureId: eraserActiveGestureId })) {
                if (instructionText) instructionText.innerText = t('inst-part-erased');
                if (layersListEl) renderLayersList();
            }
            beginMapDrawPointerCapture(e);
            e.preventDefault();
            return;
        }
        if (e.button !== 0 || !isGeoPanelActive() || getGeoSelectedTool() !== 'freehand') return;
        if (freehandEraserMode) return;
        if (activePlainLineEndpointHandles) return;
        if (mapDrawPointerDownOnOverlayHandle(e.target)) return;
        if (freehandTrimmerMode) {
            if (e.target.closest?.('.leaflet-popup') || e.target.closest?.('.sidebar') || e.target.closest?.('.top-bar')) return;
            const pt = getClientXY(e);
            if (!pt) return;
            isTrimmerDragging = true;
            lastTrimmerScreenPos = { x: pt.x, y: pt.y };
            map.dragging.disable();
            beginMapDrawPointerCapture(e);
            e.preventDefault();
            return;
        }
        if (e.target.closest?.('.leaflet-popup') || e.target.closest?.('.sidebar') || e.target.closest?.('.top-bar')) return;
        const latlng = screenToLatLng(e);
        if (!latlng) return;
        if (isFreehandDrawing) return;
        isFreehandDrawing = true;
        map.dragging.disable();
        geoFreehandPoints = [latlng];
        const pt0 = getClientXY(e);
        geoFreehandLastScreenPos = pt0 ? { x: pt0.x, y: pt0.y } : null;
        const geoColor = getGeoColor();
        geoFreehandPreview = L.polyline(geoFreehandPoints, { color: geoColor, weight: 3, className: 'geo-preview-shadow' });
        geoFreehandPreview.addTo(previewLayer);
        if (instructionText) instructionText.innerText = t('geo-freehand-hint');
        beginMapDrawPointerCapture(e);
        e.preventDefault();
    }

    mapContainerEl.addEventListener('mousedown', mapDrawPointerDown);
    if (usePointerDraw) {
        mapContainerEl.addEventListener('pointerdown', mapDrawPointerDown, { passive: false });
    }


    const freehandMouseMove = (e) => {
        if (!mapDrawPointerMatches(e)) return;
        const cur = getClientXY(e);
        if (!cur) return;
        if (isEraserDragging) {
            const latlng = screenToLatLng(e);
            if (latlng && lastEraserScreenPos) {
                const dx = cur.x - lastEraserScreenPos.x;
                const dy = cur.y - lastEraserScreenPos.y;
                if (Math.sqrt(dx * dx + dy * dy) >= ERASER_DRAG_MIN_PX) {
                    if (eraseSegmentAtPoint(latlng, { gestureId: eraserActiveGestureId })) {
                        if (instructionText) instructionText.innerText = t('inst-part-erased');
                        if (layersListEl) renderLayersList();
                    }
                    lastEraserScreenPos = { x: cur.x, y: cur.y };
                }
            }
            return;
        }
        if (selectionRectStart && selectionRectLayer) {
            const latlng = screenToLatLng(e);
            if (latlng) {
                selectionRectLayer.setBounds(L.latLngBounds(selectionRectStart, latlng));
            }
            return;
        }
        if (isTrimmerDragging && freehandTrimmerMode) {
            const latlng = screenToLatLng(e);
            if (latlng && lastTrimmerScreenPos) {
                const dx = cur.x - lastTrimmerScreenPos.x;
                const dy = cur.y - lastTrimmerScreenPos.y;
                if (Math.sqrt(dx * dx + dy * dy) >= TRIMMER_MIN_PX) {
                    if (eraseSegmentAtPoint(latlng, { onlyFreehand: true })) {
                        if (layersListEl) renderLayersList();
                    }
                    lastTrimmerScreenPos = { x: cur.x, y: cur.y };
                }
            }
            return;
        }
        if (!isFreehandDrawing || !geoFreehandPreview) return;
        const latlng = screenToLatLng(e);
        if (!latlng) return;
        const dx = cur.x - (geoFreehandLastScreenPos?.x ?? 0);
        const dy = cur.y - (geoFreehandLastScreenPos?.y ?? 0);
        if (geoFreehandLastScreenPos && Math.sqrt(dx * dx + dy * dy) < GEO_FREEHAND_MIN_PX) return;
        geoFreehandLastScreenPos = { x: cur.x, y: cur.y };
        geoFreehandPoints.push(latlng);
        geoFreehandPreview.setLatLngs(geoFreehandPoints);
    };

    const freehandMouseUp = (e) => {
        if (!mapDrawPointerMatches(e)) return;
        if (typeof e.button === 'number' && e.button > 0) return;
        if (isEraserDragging) {
            isEraserDragging = false;
            lastEraserScreenPos = null;
            eraserActiveGestureId = 0;
            endMapDrawPointerCapture();
            return;
        }
        if (selectionRectStart && selectionRectLayer) {
            map.dragging.enable();
            const bounds = selectionRectLayer.getBounds();
            const sw = map.latLngToLayerPoint(bounds.getSouthWest());
            const ne = map.latLngToLayerPoint(bounds.getNorthEast());
            const dragPx = Math.hypot(ne.x - sw.x, ne.y - sw.y);
            if (dragPx < 10) {
                const center = bounds.getCenter();
                const hit = findTopSelectableElementAt(center);
                selectedElements = hit ? [{ element: hit.element, layer: hit.layer }] : [];
            } else {
                selectedElements = findElementsInBounds(bounds);
            }
            previewLayer.removeLayer(selectionRectLayer);
            selectionRectLayer = null;
            selectionRectStart = null;
            updateSelectionUI();
            if (instructionText) instructionText.innerText = selectedElements.length > 0 ? t('inst-select-done', String(selectedElements.length)) : t('inst-select-empty');
            selectionControls?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            endMapDrawPointerCapture();
            return;
        }
        if (isTrimmerDragging) {
            isTrimmerDragging = false;
            lastTrimmerScreenPos = null;
            map.dragging.enable();
            if (instructionText) instructionText.innerText = freehandTrimmerMode ? t('geo-freehand-trimmer-hint') : t('geo-freehand-hint');
            endMapDrawPointerCapture();
            return;
        }
        if (!isFreehandDrawing) return;
        isFreehandDrawing = false;
        map.dragging.enable();
        geoFreehandLastScreenPos = null;
        if (geoFreehandPoints.length >= 2 && geoFreehandPreview) {
            const geoColor = getGeoColor();
            const pts = [...geoFreehandPoints];
            previewLayer.removeLayer(geoFreehandPreview);
            geoFreehandPreview = null;
            const polyline = L.polyline(pts, { color: geoColor, weight: 3 });
            polyline._geoType = 'freehand';
            polyline._geoData = { points: pts, color: geoColor };
            wireFreehandPolyline(polyline);
            addToActiveLayer(polyline);
        } else if (geoFreehandPreview) {
            previewLayer.removeLayer(geoFreehandPreview);
            geoFreehandPreview = null;
        }
        geoFreehandPoints = [];
        if (instructionText) instructionText.innerText = t('geo-freehand-hint');
        endMapDrawPointerCapture();
    };

    if (usePointerDraw) {
        document.addEventListener('pointermove', freehandMouseMove, { passive: false });
        document.addEventListener('pointerup', freehandMouseUp);
        document.addEventListener('pointercancel', freehandMouseUp);
    } else {
        document.addEventListener('mousemove', freehandMouseMove);
        document.addEventListener('mouseup', freehandMouseUp);
    }
    updateMapTouchDrawClass();

    // Selection mode: drag to select area, then Copy or Move
    let selectionRectStart = null;
    let selectionRectLayer = null;
    let selectedElements = [];
    let selectionHighlightGroup = null;
    let selectionAreaAnchorHandle = null;
    let selectionAreaAnchorDragLast = null;
    let selectionAreaAnchorDragged = false;
    let selectionAreaRotateHandle = null;
    let selectionAreaRotateDragging = false;
    let selectionAreaRotatePivot = null;
    let selectionAreaRotateLastAngleRad = null;
    let selectionPendingAction = null; // 'copy' | 'move' | null
    const selectionControls = document.getElementById('selection-controls');
    const selectionCountEl = document.getElementById('selection-count');
    const selectionToolbarFloating = document.getElementById('selection-toolbar-floating');
    const selectionControlsOriginalParent = selectionControls?.parentNode;
    const selectionControlsOriginalNext = selectionControls?.nextElementSibling;
    const selectionCopyBtn = document.getElementById('selection-copy-btn');
    const selectionDuplicateBtn = document.getElementById('selection-duplicate-btn');
    const selectionMoveBtn = document.getElementById('selection-move-btn');
    const selectionClearBtn = document.getElementById('selection-clear-btn');

    const placementInteractiveSnapshot = new Map();
    let placementPassthroughActive = false;

    function forEachDescendantLayer(root, fn) {
        if (!root || typeof root.eachLayer !== 'function') return;
        root.eachLayer((child) => {
            if (child instanceof L.LayerGroup) {
                forEachDescendantLayer(child, fn);
            } else {
                fn(child);
            }
        });
    }

    function layerWasInteractive(layer) {
        return !!(layer && layer.options && layer.options.interactive !== false);
    }

    function setSingleLayerInteractive(layer, interactive) {
        if (!layer || !layer.options) return;
        if (layer instanceof L.LayerGroup) return;
        if (layer instanceof L.Path) {
            layer.setStyle({ interactive });
            return;
        }
        if (layer instanceof L.Marker) {
            layer.options.interactive = interactive;
            if (typeof layer._updateInteractive === 'function') layer._updateInteractive();
            return;
        }
        if (Object.prototype.hasOwnProperty.call(layer.options, 'interactive')) {
            layer.options.interactive = interactive;
            if (typeof layer._updateInteractive === 'function') layer._updateInteractive();
        }
    }

    function needsPlacementPassthrough() {
        if (currentMode === 'line' || currentMode === 'symbol' || currentMode === 'text') return true;
        if (pendingGeoMove) return true;
        if (selectionPendingAction) return true;
        if (isGeoPanelActive()) {
            const tool = getGeoSelectedTool();
            if (tool && tool !== 'none' && tool !== 'freehand') return true;
        }
        return false;
    }

    function syncPlacementLayerInteractivity() {
        const need = needsPlacementPassthrough();
        if (!need) {
            if (placementPassthroughActive) {
                placementInteractiveSnapshot.forEach(({ layer, wasInteractive }) => {
                    if (layer && layer._map) setSingleLayerInteractive(layer, wasInteractive);
                });
                placementInteractiveSnapshot.clear();
                placementPassthroughActive = false;
            }
            return;
        }
        placementPassthroughActive = true;
        layers.forEach((layerEntry) => {
            if (!layerEntry.group) return;
            forEachDescendantLayer(layerEntry.group, (l) => {
                if (l instanceof L.LayerGroup) return;
                if (!(l instanceof L.Path) && !(l instanceof L.Marker)) return;
                const id = L.Util.stamp(l);
                if (!placementInteractiveSnapshot.has(id)) {
                    placementInteractiveSnapshot.set(id, { layer: l, wasInteractive: layerWasInteractive(l) });
                }
                setSingleLayerInteractive(l, false);
            });
        });
    }

    function getElementBounds(el) {
        if (el.getBounds) return el.getBounds();
        if (el.getLatLng) return L.latLngBounds(el.getLatLng(), el.getLatLng());
        if (el.getLatLngs) {
            const lls = el.getLatLngs();
            const flat = (lls.length && lls[0] && Array.isArray(lls[0])) ? lls.flat() : lls;
            if (flat.length === 0) return null;
            return L.latLngBounds(flat);
        }
        // L.LayerGroup — collect bounds from all descendant layers
        if (el instanceof L.LayerGroup) {
            const pts = [];
            const collectFromLayer = (layer) => {
                if (!layer) return;
                if (layer.getBounds) {
                    try { const b = layer.getBounds(); if (b && b.isValid()) { pts.push(b.getSouthWest(), b.getNorthEast()); } } catch (_) {}
                } else if (layer.getLatLng) {
                    pts.push(layer.getLatLng());
                } else if (layer.getLatLngs) {
                    try {
                        const lls = layer.getLatLngs();
                        const flat = (lls.length && lls[0] && Array.isArray(lls[0])) ? lls.flat() : lls;
                        pts.push(...flat);
                    } catch (_) {}
                } else if (layer instanceof L.LayerGroup) {
                    layer.eachLayer(collectFromLayer);
                }
            };
            // Also extract from known _tmgData fields
            const d = el._tmgData;
            if (d) {
                if (d.latlng1) pts.push(L.latLng(d.latlng1));
                if (d.latlng2) pts.push(L.latLng(d.latlng2));
                if (Array.isArray(d.points)) d.points.forEach(p => pts.push(L.latLng(p)));
                if (d.headMarker) pts.push(d.headMarker.getLatLng());
                if (d.tailPolyline) {
                    try {
                        const lls = d.tailPolyline.getLatLngs();
                        const flat = (lls.length && lls[0] && Array.isArray(lls[0])) ? lls.flat() : lls;
                        pts.push(...flat);
                    } catch (_) {}
                }
                if (Array.isArray(d.segments)) {
                    d.segments.forEach(seg => {
                        if (seg?._tmgData?.latlng1) pts.push(L.latLng(seg._tmgData.latlng1));
                        if (seg?._tmgData?.latlng2) pts.push(L.latLng(seg._tmgData.latlng2));
                    });
                }
            }
            el.eachLayer(collectFromLayer);
            if (pts.length === 0) return null;
            return L.latLngBounds(pts);
        }
        return null;
    }

    function findElementsInBounds(bounds) {
        const found = [];
        layers.forEach(layer => {
            if (!layer.visible) return;
            layer.elements.forEach(el => {
                const elBounds = getElementBounds(el);
                if (elBounds && bounds.intersects(elBounds)) found.push({ element: el, layer });
            });
        });
        return found;
    }

    /** Ctrl/Cmd+click multi-select: line hit (px), marker icon hit (px). */
    const CTRL_SELECT_LINE_PX = 24;
    const CTRL_SELECT_MARKER_PX = 38;

    function flattenLineLatLngs(lls) {
        if (!lls || !lls.length) return [];
        if (lls[0] && lls[0].lat !== undefined) return lls;
        const out = [];
        for (const part of lls) {
            if (part && part.length && part[0] && part[0].lat !== undefined) out.push(...part);
        }
        return out;
    }

    function minDistLayerPointToPolyline(lp, flat) {
        if (!flat || flat.length < 2) return Infinity;
        let minD = Infinity;
        for (let i = 0; i < flat.length - 1; i++) {
            const p1 = map.latLngToLayerPoint(flat[i]);
            const p2 = map.latLngToLayerPoint(flat[i + 1]);
            const { dist } = distanceAndTToSegment(lp, p1, p2);
            if (dist < minD) minD = dist;
        }
        return minD;
    }

    function getPolygonOuterRing(poly) {
        const lls = poly.getLatLngs();
        if (!lls || !lls.length) return [];
        const r0 = lls[0];
        if (r0 && r0.lat !== undefined) return r0;
        return Array.isArray(r0) ? r0 : [];
    }

    function pointInPolygonRing(latlng, ring) {
        if (!ring || ring.length < 3) return false;
        let r = ring;
        const a = ring[0];
        const b = ring[ring.length - 1];
        if (a.lat === b.lat && a.lng === b.lng) r = ring.slice(0, -1);
        if (r.length < 3) return false;
        const x = latlng.lng;
        const y = latlng.lat;
        let inside = false;
        const n = r.length;
        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = r[i].lng;
            const yi = r[i].lat;
            const xj = r[j].lng;
            const yj = r[j].lat;
            const denom = (yj - yi) || 1e-18;
            if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / denom + xi)) inside = !inside;
        }
        return inside;
    }

    function distLayerPointToPolygonRing(lp, ring) {
        if (!ring || ring.length < 2) return Infinity;
        let minD = Infinity;
        for (let i = 0; i < ring.length - 1; i++) {
            const p1 = map.latLngToLayerPoint(ring[i]);
            const p2 = map.latLngToLayerPoint(ring[i + 1]);
            const { dist } = distanceAndTToSegment(lp, p1, p2);
            if (dist < minD) minD = dist;
        }
        const a = ring[0];
        const z = ring[ring.length - 1];
        if (a.lat !== z.lat || a.lng !== z.lng) {
            const p1 = map.latLngToLayerPoint(z);
            const p2 = map.latLngToLayerPoint(a);
            const { dist } = distanceAndTToSegment(lp, p1, p2);
            if (dist < minD) minD = dist;
        }
        return minD;
    }

    function hitTestSelectableElement(el, latlng, lp) {
        if (el === drawLinePolyline) return false;

        if (el instanceof L.Marker) {
            if (el._tmgData) {
                const s = el._tmgData;
                const p1 = map.latLngToLayerPoint(s.latlng1);
                const p2 = map.latLngToLayerPoint(s.latlng2);
                const { dist } = distanceAndTToSegment(lp, p1, p2);
                return dist <= CTRL_SELECT_LINE_PX;
            }
            const mp = map.latLngToLayerPoint(el.getLatLng());
            return Math.hypot(mp.x - lp.x, mp.y - lp.y) <= CTRL_SELECT_MARKER_PX;
        }

        if (el instanceof L.Circle) {
            const center = el.getLatLng();
            const rM = el.getRadius();
            const c = map.latLngToLayerPoint(center);
            const dPx = Math.hypot(c.x - lp.x, c.y - lp.y);
            const rim = latLngAtBearing(center, rM / 1000, 90);
            const rPx = Math.max(6, Math.abs(map.latLngToLayerPoint(rim).x - c.x));
            return dPx <= rPx + CTRL_SELECT_LINE_PX;
        }

        if (el instanceof L.Polygon) {
            const ring = getPolygonOuterRing(el);
            if (ring.length < 3) return false;
            const bDist = distLayerPointToPolygonRing(lp, ring);
            if (bDist <= CTRL_SELECT_LINE_PX) return true;
            return pointInPolygonRing(latlng, ring);
        }

        if (el instanceof L.Polyline) {
            const flat = flattenLineLatLngs(el.getLatLngs());
            return minDistLayerPointToPolyline(lp, flat) <= CTRL_SELECT_LINE_PX;
        }

        if (el instanceof L.LayerGroup && el._tmgData?.isCatkMultiPoint) {
            const d = el._tmgData;
            if (d.headMarker) {
                const mp = map.latLngToLayerPoint(d.headMarker.getLatLng());
                if (Math.hypot(mp.x - lp.x, mp.y - lp.y) <= CTRL_SELECT_MARKER_PX) return true;
            }
            if (d.tailPolyline) {
                const flat = flattenLineLatLngs(d.tailPolyline.getLatLngs());
                if (minDistLayerPointToPolyline(lp, flat) <= CTRL_SELECT_LINE_PX) return true;
            }
            return false;
        }

        if (el instanceof L.LayerGroup && el._tmgData?.segments) {
            for (const seg of el._tmgData.segments) {
                if (seg._tmgData) {
                    const s = seg._tmgData;
                    const p1 = map.latLngToLayerPoint(s.latlng1);
                    const p2 = map.latLngToLayerPoint(s.latlng2);
                    const { dist } = distanceAndTToSegment(lp, p1, p2);
                    if (dist <= CTRL_SELECT_LINE_PX) return true;
                }
            }
            return false;
        }

        return false;
    }

    /** Top-most drawable under latlng (later elements in stack win). */
    function findTopSelectableElementAt(latlng) {
        if (!latlng) return null;
        const lp = map.latLngToLayerPoint(latlng);
        for (let li = layers.length - 1; li >= 0; li--) {
            const mapLayer = layers[li];
            if (!mapLayer.visible) continue;
            const els = mapLayer.elements;
            for (let ei = els.length - 1; ei >= 0; ei--) {
                const el = els[ei];
                if (hitTestSelectableElement(el, latlng, lp)) return { element: el, layer: mapLayer };
            }
        }
        return null;
    }

    function getSelectionHighlightPathOptions() {
        return {
            color: '#dc2626',
            weight: 3,
            opacity: 1,
            fill: false,
            fillOpacity: 0,
            dashArray: '10,6',
            interactive: false,
            bubblingMouseEvents: false,
            pane: 'selectionHighlightPane',
            className: 'map-selection-highlight'
        };
    }

    function ensureSelectionHighlightGroup() {
        if (!map) return null;
        if (!selectionHighlightGroup) {
            selectionHighlightGroup = L.layerGroup({ pane: 'selectionHighlightPane' });
            selectionHighlightGroup.addTo(map);
        }
        return selectionHighlightGroup;
    }

    function clearSelectionHighlights() {
        if (selectionHighlightGroup) selectionHighlightGroup.clearLayers();
    }

    function removeSelectionAreaAnchorHandle() {
        if (!selectionAreaAnchorHandle) return;
        try { map.removeLayer(selectionAreaAnchorHandle); } catch (_) { /* ignore */ }
        selectionAreaAnchorHandle = null;
        selectionAreaAnchorDragLast = null;
        selectionAreaAnchorDragged = false;
    }

    function removeSelectionAreaRotateHandle() {
        if (!selectionAreaRotateHandle) return;
        try { map.removeLayer(selectionAreaRotateHandle); } catch (_) { /* ignore */ }
        selectionAreaRotateHandle = null;
        selectionAreaRotateDragging = false;
        selectionAreaRotatePivot = null;
        selectionAreaRotateLastAngleRad = null;
    }

    function selectionRotateAngleRad(pivot, latlng) {
        if (!pivot || !latlng) return null;
        const pv = map.latLngToLayerPoint(pivot);
        const pt = map.latLngToLayerPoint(latlng);
        return Math.atan2(pt.y - pv.y, pt.x - pv.x);
    }

    function getSelectionRotateHandleLatLng(bounds) {
        if (!bounds) return null;
        const nw = map.latLngToLayerPoint(bounds.getNorthWest());
        const ne = map.latLngToLayerPoint(bounds.getNorthEast());
        const topMid = L.point((nw.x + ne.x) / 2, Math.min(nw.y, ne.y) - 26);
        return map.layerPointToLatLng(topMid);
    }

    function syncSelectionAreaAnchorHandle() {
        if (!map) return;
        if (!selectedElements.length) {
            removeSelectionAreaAnchorHandle();
            return;
        }
        const bounds = getSelectionBounds();
        if (!bounds) {
            removeSelectionAreaAnchorHandle();
            return;
        }
        const center = bounds.getCenter();
        if (!selectionAreaAnchorHandle) {
            const icon = L.divIcon({
                className: 'selection-area-anchor',
                html: '<div class="selection-area-anchor-inner"></div>',
                iconSize: [18, 18],
                iconAnchor: [9, 9]
            });
            selectionAreaAnchorHandle = L.marker(center, { icon, draggable: true, keyboard: false, zIndexOffset: 1200 });
            selectionAreaAnchorHandle.on('dragstart', () => {
                armSuppressMapClickFromOverlayHandle();
                selectionAreaAnchorDragLast = selectionAreaAnchorHandle.getLatLng();
                selectionAreaAnchorDragged = false;
                if (selectionPendingAction) {
                    selectionPendingAction = null;
                    syncPlacementLayerInteractivity();
                }
            });
            let _anchorDragRaf = false;
            let _anchorDragAccLat = 0, _anchorDragAccLng = 0;
            selectionAreaAnchorHandle.on('drag', () => {
                const cur = selectionAreaAnchorHandle.getLatLng();
                if (!selectionAreaAnchorDragLast || !cur) return;
                const dLat = cur.lat - selectionAreaAnchorDragLast.lat;
                const dLng = cur.lng - selectionAreaAnchorDragLast.lng;
                if (dLat === 0 && dLng === 0) return;
                _anchorDragAccLat += dLat;
                _anchorDragAccLng += dLng;
                selectionAreaAnchorDragLast = cur;
                selectionAreaAnchorDragged = true;
                if (!_anchorDragRaf) {
                    _anchorDragRaf = true;
                    requestAnimationFrame(() => {
                        _anchorDragRaf = false;
                        const aLat = _anchorDragAccLat, aLng = _anchorDragAccLng;
                        _anchorDragAccLat = 0; _anchorDragAccLng = 0;
                        if (aLat === 0 && aLng === 0) return;
                        _skipObstacleRouting = true;
                        selectedElements.forEach(({ element }) => moveElementWithOffset(element, aLat, aLng));
                        _skipObstacleRouting = false;
                        syncSelectionHighlights();
                    });
                }
            });
            selectionAreaAnchorHandle.on('dragend', () => {
                armSuppressMapClickFromOverlayHandle();
                scheduleClearSuppressIfOverlayHandleClickMissed();
                selectionAreaAnchorDragLast = null;
                syncSelectionAreaAnchorHandle();
                if (selectionAreaAnchorDragged) {
                    selectionAreaAnchorDragged = false;
                    if (instructionText) instructionText.innerText = t('inst-select-moved');
                    scheduleSaveToStorage();
                    if (layersListEl) renderLayersList();
                }
            });
            selectionAreaAnchorHandle.addTo(map);
        } else {
            selectionAreaAnchorHandle.setLatLng(center);
        }
    }

    function syncSelectionAreaRotateHandle() {
        if (!map) return;
        if (!selectedElements.length) {
            removeSelectionAreaRotateHandle();
            return;
        }
        const bounds = getSelectionBounds();
        if (!bounds) {
            removeSelectionAreaRotateHandle();
            return;
        }
        const handleLatLng = getSelectionRotateHandleLatLng(bounds);
        if (!handleLatLng) {
            removeSelectionAreaRotateHandle();
            return;
        }
        if (!selectionAreaRotateHandle) {
            const icon = L.divIcon({
                className: 'selection-area-rotate-handle',
                html: '<div class="selection-area-rotate-handle-inner"></div>',
                iconSize: [18, 18],
                iconAnchor: [9, 9]
            });
            selectionAreaRotateHandle = L.marker(handleLatLng, { icon, draggable: true, keyboard: false, zIndexOffset: 1200 });
            selectionAreaRotateHandle.on('dragstart', () => {
                armSuppressMapClickFromOverlayHandle();
                selectionAreaRotateDragging = true;
                const b = getSelectionBounds();
                selectionAreaRotatePivot = b ? b.getCenter() : null;
                selectionAreaRotateLastAngleRad = selectionRotateAngleRad(selectionAreaRotatePivot, selectionAreaRotateHandle.getLatLng());
                if (selectionPendingAction) {
                    selectionPendingAction = null;
                    syncPlacementLayerInteractivity();
                }
            });
            let _rotateDragRaf = false;
            let _rotateDragAccDeg = 0;
            selectionAreaRotateHandle.on('drag', () => {
                if (!selectionAreaRotateDragging || !selectionAreaRotatePivot) return;
                const curAngle = selectionRotateAngleRad(selectionAreaRotatePivot, selectionAreaRotateHandle.getLatLng());
                if (curAngle == null || selectionAreaRotateLastAngleRad == null) return;
                const deltaRad = normalizeAngleDeltaRad(curAngle - selectionAreaRotateLastAngleRad);
                const deltaDeg = deltaRad * 180 / Math.PI;
                if (!isFinite(deltaDeg) || Math.abs(deltaDeg) < 0.01) return;
                _rotateDragAccDeg += deltaDeg;
                selectionAreaRotateLastAngleRad = curAngle;
                if (!_rotateDragRaf) {
                    _rotateDragRaf = true;
                    requestAnimationFrame(() => {
                        _rotateDragRaf = false;
                        const accDeg = _rotateDragAccDeg;
                        _rotateDragAccDeg = 0;
                        if (Math.abs(accDeg) < 0.001) return;
                        _skipObstacleRouting = true;
                        selectedElements.forEach(({ element }) => rotateSelectionElementAroundPivot(element, selectionAreaRotatePivot, accDeg));
                        _skipObstacleRouting = false;
                        syncSelectionHighlights();
                        syncSelectionAreaAnchorHandle();
                    });
                }
            });
            selectionAreaRotateHandle.on('dragend', () => {
                armSuppressMapClickFromOverlayHandle();
                scheduleClearSuppressIfOverlayHandleClickMissed();
                const wasDragging = selectionAreaRotateDragging;
                selectionAreaRotateDragging = false;
                selectionAreaRotatePivot = null;
                selectionAreaRotateLastAngleRad = null;
                syncSelectionAreaRotateHandle();
                if (wasDragging) {
                    if (instructionText) instructionText.innerText = t('inst-select-rotated');
                    scheduleSaveToStorage();
                    if (layersListEl) renderLayersList();
                }
            });
            selectionAreaRotateHandle.addTo(map);
        } else if (!selectionAreaRotateDragging) {
            selectionAreaRotateHandle.setLatLng(handleLatLng);
        }
    }

    /** NATO / div-icon emblem: tight dashed box around the rendered icon (matches CSS rotation). */
    function addEmblemMarkerEdgeHighlight(marker, pathOpts, g) {
        const iconEl = marker._icon;
        const mapEl = map.getContainer();
        if (iconEl && mapEl) {
            const mrect = mapEl.getBoundingClientRect();
            const r = iconEl.getBoundingClientRect();
            if (r.width >= 2 && r.height >= 2) {
                const corners = [
                    [r.left, r.top],
                    [r.right, r.top],
                    [r.right, r.bottom],
                    [r.left, r.bottom]
                ];
                const ring = corners.map(([cx, cy]) =>
                    map.containerPointToLatLng(L.point(cx - mrect.left, cy - mrect.top))
                );
                ring.push(ring[0]);
                g.addLayer(L.polygon(ring, { ...pathOpts, fill: false, fillOpacity: 0 }));
                return;
            }
        }
        const iopt = marker.options && marker.options.icon && marker.options.icon.options;
        const size = iopt && iopt.iconSize;
        const anchor = iopt && iopt.iconAnchor;
        if (!size || !anchor || size[0] < 3 || size[1] < 3 || typeof marker.getLatLng !== 'function') return;
        const ll = marker.getLatLng();
        const P = map.latLngToLayerPoint(ll);
        const w = size[0];
        const h = size[1];
        const ax = anchor[0];
        const ay = anchor[1];
        const deg = typeof marker._symbolRotationDeg === 'number' ? marker._symbolRotationDeg : 0;
        const rad = (deg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const localCorners = [
            [-ax, -ay],
            [w - ax, -ay],
            [w - ax, h - ay],
            [-ax, h - ay]
        ];
        const ring = localCorners.map(([lx, ly]) => {
            const rx = lx * cos + ly * sin;
            const ry = lx * sin - ly * cos;
            return map.layerPointToLatLng(L.point(P.x + rx, P.y + ry));
        });
        ring.push(ring[0]);
        g.addLayer(L.polygon(ring, { ...pathOpts, fill: false, fillOpacity: 0 }));
    }

    function addSelectionHighlightsForElement(el, pathOpts) {
        const g = ensureSelectionHighlightGroup();
        if (!g || !el) return;

        if (el instanceof L.Marker) {
            if (el._tmgData?.latlng1 && el._tmgData?.latlng2) {
                g.addLayer(L.polyline([L.latLng(el._tmgData.latlng1.lat, el._tmgData.latlng1.lng), L.latLng(el._tmgData.latlng2.lat, el._tmgData.latlng2.lng)], {
                    ...pathOpts,
                    weight: Math.max(pathOpts.weight || 3, 4)
                }));
            } else if (typeof el.getLatLng === 'function') {
                const cls = (el.options && el.options.icon && el.options.icon.options && el.options.icon.options.className) || '';
                const isEmblem = !!(el._sidc || (typeof cls === 'string' && cls.includes('custom-nato-marker')));
                if (isEmblem) {
                    if (el._tmgData?.typeId === 'circle-x') {
                        createCircleXHighlight(el, pathOpts);
                    } else {
                        addEmblemMarkerEdgeHighlight(el, pathOpts, g);
                    }
                } else {
                    const ll = el.getLatLng();
                    g.addLayer(L.circle(ll, {
                        radius: 28,
                        color: pathOpts.color,
                        weight: pathOpts.weight,
                        fill: false,
                        dashArray: pathOpts.dashArray,
                        opacity: pathOpts.opacity,
                        interactive: false,
                        bubblingMouseEvents: false,
                        pane: pathOpts.pane,
                        className: pathOpts.className
                    }));
                }
            }
            return;
        }

        if (el instanceof L.Circle) {
            g.addLayer(L.circle(el.getLatLng(), {
                radius: el.getRadius(),
                color: pathOpts.color,
                weight: pathOpts.weight,
                fill: false,
                dashArray: pathOpts.dashArray,
                opacity: pathOpts.opacity,
                interactive: false,
                bubblingMouseEvents: false,
                pane: pathOpts.pane,
                className: pathOpts.className
            }));
            return;
        }

        if (el instanceof L.Polygon) {
            const ring = getPolygonOuterRing(el);
            if (ring.length >= 3) {
                const copy = ring.map(p => L.latLng(p.lat, p.lng));
                g.addLayer(L.polygon(copy, { ...pathOpts, fill: false, fillOpacity: 0 }));
            }
            return;
        }

        if (el instanceof L.Polyline) {
            const flat = flattenLineLatLngs(el.getLatLngs());
            if (flat.length >= 2) {
                g.addLayer(L.polyline(flat.map(p => L.latLng(p.lat, p.lng)), pathOpts));
            }
            return;
        }

        if (el instanceof L.LayerGroup && el._tmgData?.segments) {
            el._tmgData.segments.forEach((seg) => {
                const s = seg?._tmgData;
                if (s?.latlng1 && s?.latlng2) {
                    g.addLayer(L.polyline([L.latLng(s.latlng1.lat, s.latlng1.lng), L.latLng(s.latlng2.lat, s.latlng2.lng)], {
                        ...pathOpts,
                        weight: Math.max(pathOpts.weight || 3, 4)
                    }));
                }
            });
            return;
        }

        if (el instanceof L.LayerGroup && el._tmgData?.isCatkMultiPoint) {
            const d = el._tmgData;
            if (d.tailPolyline) {
                const flat = flattenLineLatLngs(d.tailPolyline.getLatLngs());
                if (flat.length >= 2) {
                    g.addLayer(L.polyline(flat.map(p => L.latLng(p.lat, p.lng)), pathOpts));
                }
            }
            if (d.headMarker && typeof d.headMarker.getLatLng === 'function') {
                g.addLayer(L.circle(d.headMarker.getLatLng(), {
                    radius: 32,
                    color: pathOpts.color,
                    weight: pathOpts.weight,
                    fill: false,
                    dashArray: pathOpts.dashArray,
                    opacity: pathOpts.opacity,
                    interactive: false,
                    bubblingMouseEvents: false,
                    pane: pathOpts.pane,
                    className: pathOpts.className
                }));
            }
        }
    }

    function syncSelectionHighlights() {
        clearSelectionHighlights();
        if (!selectedElements.length) return;
        const pathOpts = getSelectionHighlightPathOptions();
        selectedElements.forEach(({ element }) => {
            try {
                addSelectionHighlightsForElement(element, pathOpts);
            } catch (_) { /* ignore */ }
        });
    }

    function copyElementWithOffset(el, layer, dLat, dLng) {
        if (el._isTextLabel) {
            const ll = el.getLatLng();
            const newLl = L.latLng(ll.lat + dLat, ll.lng + dLng);
            const textEl = L.marker(newLl, { draggable: true });
            textEl._isTextLabel = true;
            textEl._textContent = el._textContent;
            textEl._textColor = el._textColor || TEXT_LABEL_COLOR_DEFAULT;
            textEl._textFontSize = el._textFontSize ?? TEXT_LABEL_FONT_SIZE_DEFAULT;
            textEl._textRotationDeg = el._textRotationDeg || 0;
            textEl.setIcon(buildTextLabelIcon(textEl));
            textEl.bindPopup(buildTextLabelPopupContent(textEl));
            textEl.on('popupopen', () => { textEl.setPopupContent(buildTextLabelPopupContent(textEl)); bindTextLabelPopupHandlers(textEl); });
            addToActiveLayer(textEl);
        } else if (el instanceof L.Marker && !el._tmgData) {
            const ll = el.getLatLng();
            const newLl = L.latLng(ll.lat + dLat, ll.lng + dLng);
            const sidc = el._sidc || '10031000001200000000';
            const copy = L.marker(newLl, { icon: L.divIcon({ className: 'custom-nato-marker', html: '<div></div>', iconSize: [1, 1], iconAnchor: [0, 0] }), draggable: true });
            copy._sidc = sidc;
            copy._textModifiers = { ...(el._textModifiers || {}), size: 25, simpleStatusModifier: true };
            copy._statusKey = el._statusKey || 'status-operational';
            copy._symbolRotationDeg = el._symbolRotationDeg || 0;
            refreshSymbolIcon(copy);
            copy.bindPopup(buildSymbolPopupContent(copy), { bubblingMouseEvents: false });
            copy.on('popupopen', () => { copy.setPopupContent(buildSymbolPopupContent(copy)); bindSymbolPopupHandlers(copy); });
            addToActiveLayer(copy);
            (el._rangeCircles || []).forEach(c => {
                const rd = c._rangeData || {};
                addRangeCircleToMarker(copy, rd.radiusKm ?? 5, rd.color ?? '#3b82f6', rd.fillStyle ?? DEFAULT_GEO_FILL_STYLE);
            });
            (el._rangeSectors || []).forEach(p => {
                const sd = p._rangeSectorData || {};
                addRangeSectorToMarker(copy, sd.radiusKm ?? 5, sd.bearing ?? 0, sd.aperture ?? 90, sd.color ?? '#3b82f6', sd.fillStyle ?? DEFAULT_GEO_FILL_STYLE);
            });
        } else if (el instanceof L.Marker && el._tmgData) {
            const d = el._tmgData;
            const p1 = L.latLng(d.latlng1.lat + dLat, d.latlng1.lng + dLng);
            const p2 = L.latLng(d.latlng2.lat + dLat, d.latlng2.lng + dLng);
            const copy = createTmgLayer(p1, p2, d.typeId, d.color, false, false, { filled: d.filled, dashed: d.dashed, strokeWidth: d.strokeWidth ?? 4 });
            if (copy) addToActiveLayer(copy);
        } else if (el instanceof L.LayerGroup && el._tmgData?.isCatkMultiPoint) {
            const data = el._tmgData;
            if (!data.arrowParams && data.preserveLegacyPoints) {
                const pts = (data.points || []).map(p => L.latLng(p.lat + dLat, p.lng + dLng));
                const shiftedLocked = catkShiftLockedArrowParamsByOffset(data.lockedArrowParams, dLat, dLng);
                const newGroup = createLegacyCatkGroup(data.typeId, pts, {
                    color: data.color,
                    strokeWidth: data.strokeWidth ?? 4,
                    arrowHeadScale: data.arrowHeadScale ?? 1.0,
                    legacyBodyWidthKm: isFinite(Number(data.legacyBodyWidthKm)) ? Number(data.legacyBodyWidthKm) : (shiftedLocked?.bodyWidthKm ?? null),
                    lockedArrowParams: shiftedLocked,
                    dashed: data.dashed,
                    displayName: data.displayName,
                    preserveLegacyPoints: true
                });
                if (newGroup) addToActiveLayer(newGroup);
            } else {
                const params = data.arrowParams
                    ? normalizeCatkArrowParams({
                        ...data.arrowParams,
                        tip: L.latLng(data.arrowParams.tip.lat + dLat, data.arrowParams.tip.lng + dLng)
                    })
                    : catkDeriveArrowParamsFromLegacyPoints((data.points || []).map(p => L.latLng(p.lat + dLat, p.lng + dLng)), data.strokeWidth, data.arrowHeadScale);
                const newGroup = createParametricCatkGroup(data.typeId, params, {
                    color: data.color,
                    strokeWidth: data.strokeWidth ?? 4,
                    arrowHeadScale: data.arrowHeadScale ?? 1.0,
                    dashed: data.dashed,
                    displayName: data.displayName
                });
                if (newGroup) addToActiveLayer(newGroup);
            }
        } else if (el instanceof L.LayerGroup && el._tmgData?.segments) {
            const data = el._tmgData;
            const pts = [];
            data.segments.forEach((seg, i) => {
                const s = seg._tmgData;
                if (s?.latlng1 && i === 0) pts.push(L.latLng(s.latlng1.lat + dLat, s.latlng1.lng + dLng));
                if (s?.latlng2) pts.push(L.latLng(s.latlng2.lat + dLat, s.latlng2.lng + dLng));
            });
            const typeId = data.typeId || 'attack';
            const color = data.color || '#3b82f6';
            const filled = data.filled !== false;
            const dashed = data.dashed || false;
            const strokeWidth = data.strokeWidth ?? 4;
            const def = TACTICAL_GRAPHICS.find(d => d.id === typeId);
            if (pts.length >= 2 && def && !def.pointSymbol && pts.length > 2) {
                const newGroup = L.layerGroup();
                const segments = [];
                for (let i = 0; i < pts.length - 1; i++) {
                    const useBodyOnly = i < pts.length - 2;
                    const seg = createTmgLayer(pts[i], pts[i + 1], typeId, color, useBodyOnly, true, { filled, dashed, strokeWidth });
                    if (seg) { newGroup.addLayer(seg); segments.push(seg); seg.on('click', () => newGroup.openPopup(seg.getLatLng())); }
                }
                newGroup._tmgData = { segments, typeId, color, filled, dashed, strokeWidth };
                newGroup.bindPopup(buildGroupTmgPopupContent(newGroup));
                newGroup.on('popupclose', () => removeTmgResizeHandle());
                newGroup.on('popupopen', () => {
                    newGroup.setPopupContent(buildGroupTmgPopupContent(newGroup));
                    scheduleTmgPopupBind(() => {
                        bindGroupTmgPopupHandlers(newGroup);
                        showTmgGroupPopupSelectionUi(newGroup, newGroup._layerId);
                    });
                });
                addToActiveLayer(newGroup);
            } else if (pts.length === 2) {
                const seg = createTmgLayer(pts[0], pts[1], typeId, color, false, false, { filled, dashed, strokeWidth });
                if (seg) addToActiveLayer(seg);
            }
        } else if (el instanceof L.Polyline) {
            const lls = el.getLatLngs?.() || [];
            const flat = (lls.length && lls[0] && Array.isArray(lls[0])) ? lls.flat() : lls;
            const offsetPts = flat.map(p => L.latLng((p?.lat ?? p?.[0]) + dLat, (p?.lng ?? p?.[1]) + dLng));
            const opts = { color: el.options?.color || '#3b82f6', weight: el.options?.weight || 4, dashArray: el.options?.dashArray };
            const copy = L.polyline(offsetPts, opts);
            if (el._geoType === 'freehand') {
                copy._geoType = 'freehand';
                copy._geoData = { points: offsetPts, color: opts.color };
                wireFreehandPolyline(copy);
            } else {
                wireTacticalLinePolyline(copy);
            }
            addToActiveLayer(copy);
        } else if (el instanceof L.Polygon || (el instanceof L.Circle && el.getLatLng)) {
            if (el._geoType) {
                const d = el._geoData || {};
                if (el.getLatLngs) {
                    const color = d.color || '#3b82f6';
                    const fillStyle = d.fillStyle || DEFAULT_GEO_FILL_STYLE;
                    const isMinefield = el._geoType === 'minefield';
                    let offsetPts;
                    let polyData;
                    if (el._geoType === 'oval' && d.corners?.length === 4) {
                        const nc = d.corners.map(p => L.latLng(p.lat + dLat, p.lng + dLng));
                        offsetPts = createEllipseRingFromBoundingCorners(nc, map, 64);
                        polyData = { ...d, corners: nc, color };
                    } else {
                        const lls = el.getLatLngs();
                        const ring = (lls[0] && Array.isArray(lls[0])) ? lls[0] : lls;
                        offsetPts = ring.map(p => L.latLng((p?.lat ?? p?.[0]) + dLat, (p?.lng ?? p?.[1]) + dLng));
                        polyData = { ...d, points: offsetPts, corners: d.corners?.map(c => L.latLng(c.lat + dLat, c.lng + dLng)) };
                        if (el._geoType === 'rectangle' && polyData.corners) polyData.corners = offsetPts;
                        if (isMinefield) polyData.corners = offsetPts;
                    }
                    const poly = L.polygon(offsetPts, isMinefield ? getMinefieldStyle(color, d.mineType || 'ap') : { ...getGeoShapeStyle(color, fillStyle) });
                    poly._geoType = el._geoType;
                    poly._geoData = polyData;
                    poly.bindPopup(buildGeoPopupContent(poly, el._geoType, poly._geoData), GEO_POPUP_OPTIONS);
                    if (isMinefield) {
                        poly.on('popupopen', () => {
                            bindMinefieldResizeHandles(poly);
                            bindGeoCenterMoveHandle(poly, el._geoType);
                            bindGeoPopupHandlers(poly, el._geoType);
                        });
                        poly.on('popupclose', removeGeoResizeHandles);
                    } else {
                        poly.on('popupopen', () => {
                            removeGeoResizeHandles();
                            bindGeoCenterMoveHandle(poly, el._geoType);
                            bindGeoPopupHandlers(poly, el._geoType);
                        });
                        poly.on('popupclose', removeGeoResizeHandles);
                    }
                    addToActiveLayer(poly);
                    if (isMinefield) {
                        poly.once('add', () => {
                            applyMinefieldFill(poly);
                            addMinefieldDecorations(poly, offsetPts, color, poly._layerId);
                        });
                    }
                    addToActiveLayer(poly);
                } else if (el.getLatLng && el.getRadius) {
                    const c = el.getLatLng();
                    const newC = L.latLng(c.lat + dLat, c.lng + dLng);
                    const circle = L.circle(newC, { radius: el.getRadius(), ...getGeoShapeStyle(d.color, d.fillStyle) });
                    const mvGeoType = el._geoType;
                    circle._geoType = mvGeoType;
                    circle._geoData = { ...d, center: newC };
                    circle.bindPopup(buildGeoPopupContent(circle, mvGeoType, circle._geoData), GEO_POPUP_OPTIONS);
                    circle.on('popupopen', () => {
                        removeGeoResizeHandles();
                        const cd = circle._geoData;
                        const handleLat = latLngAtBearing(cd.center, cd.radiusKm, 0);
                        createGeoResizeHandle(handleLat, (newLat, isFinal) => {
                            const distM = haversineDistance(cd.center.lat, cd.center.lng, newLat.lat, newLat.lng);
                            cd.radiusKm = parseFloat((distM / 1000).toFixed(2));
                            circle.setRadius(cd.radiusKm * 1000);
                            circle.setPopupContent(buildGeoPopupContent(circle, mvGeoType, cd));
                            bindGeoPopupHandlers(circle, mvGeoType);
                            syncGeoShapeHandlesToGeometry(circle, mvGeoType);
                            if (isFinal && activeGeoResizeHandles.length >= 1) {
                                activeGeoResizeHandles[0].setLatLng(latLngAtBearing(cd.center, cd.radiusKm, 0));
                            }
                            if (isFinal) scheduleSaveToStorage();
                        }, circle._layerId);
                        bindGeoCenterMoveHandle(circle, mvGeoType);
                        bindGeoPopupHandlers(circle, mvGeoType);
                    });
                    circle.on('popupclose', removeGeoResizeHandles);
                    addToActiveLayer(circle);
                }
            }
        } else if (el instanceof L.Circle) {
            const c = el.getLatLng();
            const newC = L.latLng(c.lat + dLat, c.lng + dLng);
            const circle = L.circle(newC, { radius: el.getRadius(), ...(el.options || {}) });
            if (el._geoType) {
                const mvGeoType = el._geoType;
                circle._geoType = mvGeoType;
                circle._geoData = { ...(el._geoData || {}), center: newC };
                circle.bindPopup(buildGeoPopupContent(circle, mvGeoType, circle._geoData), GEO_POPUP_OPTIONS);
                circle.on('popupopen', () => {
                    removeGeoResizeHandles();
                    const cd = circle._geoData;
                    const handleLat = latLngAtBearing(cd.center, cd.radiusKm, 0);
                    createGeoResizeHandle(handleLat, (newLat, isFinal) => {
                        const distM = haversineDistance(cd.center.lat, cd.center.lng, newLat.lat, newLat.lng);
                        cd.radiusKm = parseFloat((distM / 1000).toFixed(2));
                        circle.setRadius(cd.radiusKm * 1000);
                        circle.setPopupContent(buildGeoPopupContent(circle, mvGeoType, cd));
                        bindGeoPopupHandlers(circle, mvGeoType);
                        syncGeoShapeHandlesToGeometry(circle, mvGeoType);
                        if (isFinal && activeGeoResizeHandles.length >= 1) {
                            activeGeoResizeHandles[0].setLatLng(latLngAtBearing(cd.center, cd.radiusKm, 0));
                        }
                        if (isFinal) scheduleSaveToStorage();
                    }, circle._layerId);
                    bindGeoCenterMoveHandle(circle, mvGeoType);
                    bindGeoPopupHandlers(circle, mvGeoType);
                });
                circle.on('popupclose', removeGeoResizeHandles);
            }
            addToActiveLayer(circle);
        }
    }

    function moveElementWithOffset(el, dLat, dLng) {
        if (el._isTextLabel) {
            const ll = el.getLatLng();
            el.setLatLng(L.latLng(ll.lat + dLat, ll.lng + dLng));
        } else if (el instanceof L.Marker && !el._tmgData) {
            const ll = el.getLatLng();
            el.setLatLng(L.latLng(ll.lat + dLat, ll.lng + dLng));
            syncMarkerRangeOverlays.call(el);
        } else if (el instanceof L.Marker && el._tmgData) {
            const d = el._tmgData;
            d.latlng1 = L.latLng(d.latlng1.lat + dLat, d.latlng1.lng + dLng);
            d.latlng2 = L.latLng(d.latlng2.lat + dLat, d.latlng2.lng + dLng);
            el.setLatLng(tmgMidpoint(d.latlng1, d.latlng2));
            updateTmgLayer(el);
        } else if (el instanceof L.LayerGroup && el._tmgData?.isCatkMultiPoint) {
            const d = el._tmgData;
            if (d.arrowParams) {
                d.arrowParams = normalizeCatkArrowParams({
                    ...d.arrowParams,
                    tip: L.latLng(d.arrowParams.tip.lat + dLat, d.arrowParams.tip.lng + dLng)
                });
                catkApplyArrowParamsToData(d);
            } else {
                d.points = (d.points || []).map(p => L.latLng(p.lat + dLat, p.lng + dLng));
                if (d.lockedArrowParams) {
                    d.lockedArrowParams = catkShiftLockedArrowParamsByOffset(d.lockedArrowParams, dLat, dLng);
                }
            }
            if (d.tailPolyline) d.tailPolyline.setLatLngs(catkBuildTailPathFromPoints(d.points));
            if (d.headMarker) syncCatkHeadMarkerToPoints(d.headMarker, d);
        } else if (el instanceof L.LayerGroup && el._tmgData?.segments) {
            el._tmgData.segments.forEach(seg => {
                const s = seg._tmgData;
                s.latlng1 = L.latLng(s.latlng1.lat + dLat, s.latlng1.lng + dLng);
                s.latlng2 = L.latLng(s.latlng2.lat + dLat, s.latlng2.lng + dLng);
                seg.setLatLng(tmgMidpoint(s.latlng1, s.latlng2));
                updateTmgLayer(seg);
            });
        } else if (el instanceof L.Polyline) {
            const lls = el.getLatLngs?.() || [];
            const flat = (lls.length && lls[0] && Array.isArray(lls[0])) ? lls.flat() : lls;
            const offsetPts = flat.map(p => L.latLng((p?.lat ?? p?.[0]) + dLat, (p?.lng ?? p?.[1]) + dLng));
            el.setLatLngs(offsetPts);
            if (el._geoData?.points) el._geoData.points = offsetPts;
        } else if (el instanceof L.Polygon) {
            if (el._geoType === 'oval' && el._geoData?.corners?.length === 4) {
                el._geoData.corners = el._geoData.corners.map(p => L.latLng(p.lat + dLat, p.lng + dLng));
                syncOvalPolygonFromCorners(el);
            } else {
                const lls = el.getLatLngs?.() || [];
                const rings = (lls[0] && Array.isArray(lls[0][0])) ? lls : [lls];
                const newRings = rings.map(ring => {
                    const r = (Array.isArray(ring[0]) && typeof ring[0][0] === 'number') ? ring : ring;
                    return (Array.isArray(r[0]) ? r : r).map(p => L.latLng((p?.lat ?? p?.[0]) + dLat, (p?.lng ?? p?.[1]) + dLng));
                });
                el.setLatLngs(newRings);
                if (el._geoData?.points) el._geoData.points = newRings[0];
                if (el._geoData?.corners) el._geoData.corners = newRings[0];
            }
        } else if (el instanceof L.Circle) {
            const c = el.getLatLng();
            el.setLatLng(L.latLng(c.lat + dLat, c.lng + dLng));
            if (el._geoData?.center) el._geoData.center = el.getLatLng();
        }
    }

    function rotateSelectionElementAroundPivot(el, pivot, deltaDeg) {
        if (!el || !pivot || !isFinite(deltaDeg) || deltaDeg === 0) return;
        if (el._isTextLabel) {
            const ll = el.getLatLng();
            const next = rotateLatLngsAroundPivotClockwise([ll], pivot, deltaDeg)[0];
            if (next) el.setLatLng(next);
            return;
        }
        if (el instanceof L.Marker && !el._tmgData) {
            const ll = el.getLatLng();
            const next = rotateLatLngsAroundPivotClockwise([ll], pivot, deltaDeg)[0];
            if (next) el.setLatLng(next);
            syncMarkerRangeOverlays.call(el);
            (el._rangeSectors || []).forEach((poly, idx) => {
                const sd = poly?._rangeSectorData;
                if (!sd) return;
                updateRangeSectorStyle(el, idx, sd.radiusKm, normalizeBearingDeg((sd.bearing ?? 0) + deltaDeg), sd.aperture, sd.color, sd.fillStyle);
            });
            return;
        }
        if (el instanceof L.Marker && el._tmgData) {
            const d = el._tmgData;
            if (!d?.latlng1 || !d?.latlng2) return;
            const rotated = rotateLatLngsAroundPivotClockwise([d.latlng1, d.latlng2], pivot, deltaDeg);
            if (!rotated || rotated.length < 2) return;
            d.latlng1 = rotated[0];
            d.latlng2 = rotated[1];
            el.setLatLng(tmgMidpoint(d.latlng1, d.latlng2));
            updateTmgLayer(el);
            return;
        }
        if (el instanceof L.LayerGroup && el._tmgData?.segments) {
            const segs = el._tmgData.segments;
            const pts = [];
            segs.forEach((seg, i) => {
                const s = seg._tmgData;
                if (s?.latlng1 && i === 0) pts.push(L.latLng(s.latlng1.lat, s.latlng1.lng));
                if (s?.latlng2) pts.push(L.latLng(s.latlng2.lat, s.latlng2.lng));
            });
            if (pts.length < 2) return;
            const rotated = rotateLatLngsAroundPivotClockwise(pts, pivot, deltaDeg);
            rotated.forEach((ll, idx) => {
                if (idx === 0) segs[0]._tmgData.latlng1 = ll;
                else segs[idx - 1]._tmgData.latlng2 = ll;
                if (idx < segs.length) segs[idx]._tmgData.latlng1 = ll;
            });
            segs.forEach((seg) => {
                seg.setLatLng(tmgMidpoint(seg._tmgData.latlng1, seg._tmgData.latlng2));
                updateTmgLayer(seg);
            });
            return;
        }
        if (el instanceof L.LayerGroup && el._tmgData?.isCatkMultiPoint) {
            const d = el._tmgData;
            if (!d.points?.length) return;
            if (d.arrowParams) {
                d.arrowParams = normalizeCatkArrowParams({
                    ...d.arrowParams,
                    tip: rotateLatLngsAroundPivotClockwise([d.arrowParams.tip], pivot, deltaDeg)[0],
                    directionDeg: normalizeBearingDeg(d.arrowParams.directionDeg + deltaDeg)
                });
                catkApplyArrowParamsToData(d);
            } else {
                const newPts = rotateLatLngsAroundPivotClockwise(d.points, pivot, deltaDeg);
                for (let i = 0; i < d.points.length; i++) d.points[i] = newPts[i];
                if (d.lockedArrowParams) {
                    d.lockedArrowParams = catkRotateLockedArrowParamsAroundPivot(d.lockedArrowParams, pivot, deltaDeg);
                }
                if (d.catkAutoJunction && d.points.length === 3) {
                    d.points[1] = catkInterpOnTailAxis(d.points[2], d.points[0], CATK_AUTO_JUNCTION_T);
                }
            }
            if (d.tailPolyline) d.tailPolyline.setLatLngs(catkBuildTailPathFromPoints(d.points));
            if (d.headMarker) syncCatkHeadMarkerToPoints(d.headMarker, d);
            return;
        }
        if (el instanceof L.Polyline && !(el instanceof L.Polygon)) {
            const pts = flattenLineLatLngs(el.getLatLngs());
            if (!pts.length) return;
            const rotated = rotateLatLngsAroundPivotClockwise(pts, pivot, deltaDeg);
            el.setLatLngs(rotated);
            if (el._geoData?.points) el._geoData.points = rotated;
            if (el._geoType === 'distance' && el._geoData) {
                el._geoData.distanceKm = totalDistanceKm(rotated);
                createDistanceWaypointMarkers(el);
            }
            return;
        }
        if (el instanceof L.Polygon) {
            const geoType = el._geoType;
            const d = el._geoData;
            if (geoType && d) {
                if (geoType === 'range-sector' || geoType === 'semi-circle') {
                    const lls = el.getLatLngs?.() || [];
                    const ring = (lls[0] && Array.isArray(lls[0])) ? lls[0] : lls;
                    if (ring.length >= 3) {
                        const rotated = rotateLatLngsAroundPivotClockwise(ring, pivot, deltaDeg);
                        el.setLatLngs(rotated);
                    }
                    d.center = rotateLatLngsAroundPivotClockwise([d.center], pivot, deltaDeg)[0];
                    d.bearing = normalizeBearingDeg((d.bearing ?? 0) + deltaDeg);
                    return;
                }
                if (geoType === 'polygon') {
                    const lls = el.getLatLngs?.() || [];
                    const ring = (lls[0] && Array.isArray(lls[0])) ? lls[0] : lls;
                    if (ring.length >= 3) {
                        const rotated = rotateLatLngsAroundPivotClockwise(ring, pivot, deltaDeg);
                        el.setLatLngs([rotated]);
                    }
                    d.center = rotateLatLngsAroundPivotClockwise([d.center], pivot, deltaDeg)[0];
                    d.rotation = normalizeBearingDeg((d.rotation ?? 0) + deltaDeg);
                    return;
                }
                if (geoType === 'oval' && d.corners?.length === 4) {
                    d.corners = rotateLatLngsAroundPivotClockwise(d.corners, pivot, deltaDeg);
                    syncOvalPolygonFromCorners(el);
                    return;
                }
                if (geoType === 'rectangle' || geoType === 'minefield' || geoType === 'freeform') {
                    const lls = el.getLatLngs?.() || [];
                    const ring = (lls[0] && Array.isArray(lls[0])) ? lls[0] : lls;
                    const rotated = rotateLatLngsAroundPivotClockwise(ring, pivot, deltaDeg);
                    el.setLatLngs([rotated]);
                    if (d.points) d.points = rotated;
                    if (d.corners) d.corners = rotated;
                    if (geoType === 'minefield') updateMinefieldDecorations(el);
                    return;
                }
            }
            const lls = el.getLatLngs?.() || [];
            const ring = (lls[0] && Array.isArray(lls[0])) ? lls[0] : lls;
            if (!ring.length) return;
            el.setLatLngs([rotateLatLngsAroundPivotClockwise(ring, pivot, deltaDeg)]);
            return;
        }
        if (el instanceof L.Circle) {
            const c = el.getLatLng();
            const next = rotateLatLngsAroundPivotClockwise([c], pivot, deltaDeg)[0];
            if (next) el.setLatLng(next);
            if (el._geoData?.center) el._geoData.center = el.getLatLng();
        }
    }

    function clearSelection() {
        clearSelectionHighlights();
        removeSelectionAreaAnchorHandle();
        removeSelectionAreaRotateHandle();
        selectedElements = [];
        selectionPendingAction = null;
        selectionControls?.classList.add('hidden');
        if (selectionToolbarFloating) {
            selectionToolbarFloating.classList.add('hidden');
            if (selectionControls && selectionControlsOriginalParent) {
                selectionControlsOriginalParent.insertBefore(selectionControls, selectionControlsOriginalNext);
            }
        }
        if (instructionText) {
            if (currentMode === 'select') instructionText.innerText = t('inst-select');
            else if (currentMode === 'pan') instructionText.innerText = t('inst-pan');
            else instructionText.innerText = t('instruction-default');
        }
        syncPlacementLayerInteractivity();
    }

    function getSelectionBounds() {
        let bounds = null;
        selectedElements.forEach(({ element }) => {
            const b = getElementBounds(element);
            if (b) bounds = bounds ? bounds.extend(b) : b;
        });
        return bounds;
    }

    function positionSelectionToolbar() {
        if (!selectionToolbarFloating || !selectionControls || selectedElements.length === 0) return;
        const inset = 12;
        selectionToolbarFloating.style.left = inset + 'px';
        selectionToolbarFloating.style.top = inset + 'px';
    }

    function updateSelectionUI() {
        if (!selectionControls) return;
        selectionCountEl.textContent = t('selection-count', String(selectedElements.length));
        lineDrawingControls?.classList.add('hidden');
        geoDrawingControls?.classList.add('hidden');
        selectionControls.classList.remove('hidden');
        if (selectionToolbarFloating && selectedElements.length > 0) {
            if (selectionControls.parentNode !== selectionToolbarFloating) {
                selectionToolbarFloating.appendChild(selectionControls);
            }
            selectionToolbarFloating.classList.remove('hidden');
            positionSelectionToolbar();
        }
        syncSelectionHighlights();
        syncSelectionAreaAnchorHandle();
        syncSelectionAreaRotateHandle();
    }

    selectionCopyBtn?.addEventListener('click', () => {
        if (selectedElements.length === 0) return;
        selectionPendingAction = 'copy';
        if (instructionText) instructionText.innerText = t('inst-select-place');
        syncPlacementLayerInteractivity();
    });
    selectionDuplicateBtn?.addEventListener('click', () => {
        if (selectedElements.length === 0) return;
        const activeLayer = getActiveLayer();
        const beforeCount = activeLayer?.elements?.length || 0;
        selectedElements.forEach(({ element, layer }) => copyElementWithOffset(element, layer, SELECTION_DUPLICATE_OFFSET, SELECTION_DUPLICATE_OFFSET));
        const duplicated = activeLayer?.elements?.slice(beforeCount) || [];
        if (duplicated.length > 0 && activeLayer) {
            selectedElements = duplicated.map((element) => ({ element, layer: activeLayer }));
            updateSelectionUI();
        }
        if (instructionText) instructionText.innerText = t('inst-select-duplicated');
        scheduleSaveToStorage();
        if (layersListEl) renderLayersList();
        syncSelectionHighlights();
    });
    selectionMoveBtn?.addEventListener('click', () => {
        if (selectedElements.length === 0) return;
        selectionPendingAction = 'move';
        if (instructionText) instructionText.innerText = t('inst-select-place');
        syncPlacementLayerInteractivity();
    });
    const selectionDeleteBtn = document.getElementById('selection-delete-btn');
    selectionDeleteBtn?.addEventListener('click', () => {
        if (selectedElements.length === 0) return;
        removeGeoResizeHandles();
        selectedElements.forEach(({ element, layer }) => {
            cleanupElementDecorations(element, layer);
            const idx = layer.elements.indexOf(element);
            if (idx >= 0) layer.elements.splice(idx, 1);
            layer.group.removeLayer(element);
            const histIdx = actionHistory.findIndex(a => a.type === 'add' && a.element === element);
            if (histIdx >= 0) actionHistory.splice(histIdx, 1);
        });
        clearSelection();
        renderLayersList();
        scheduleSaveToStorage();
    });
    selectionClearBtn?.addEventListener('click', () => {
        clearSelection();
    });

    function toggleElementInCtrlSelection(element, layerEntry) {
        const i = selectedElements.findIndex(s => s.element === element);
        if (i >= 0) selectedElements.splice(i, 1);
        else selectedElements.push({ element, layer: layerEntry });
        if (selectedElements.length === 0) {
            clearSelection();
            return;
        }
        selectionPendingAction = null;
        updateSelectionUI();
        if (instructionText) instructionText.innerText = t('inst-select-ctrl-count', String(selectedElements.length));
    }

    map.getContainer().addEventListener('click', (domEv) => {
        if (!domEv.ctrlKey && !domEv.metaKey) return;
        if (currentMode !== 'select' && currentMode !== 'pan') return;
        if (selectionPendingAction) return;
        if (domEv.target.closest?.('.leaflet-popup') || domEv.target.closest?.('.sidebar') || domEv.target.closest?.('.top-bar') || domEv.target.closest?.('.modal') || domEv.target.closest?.('.chat-sidebar')) return;
        const rect = map.getContainer().getBoundingClientRect();
        const x = domEv.clientX - rect.left;
        const y = domEv.clientY - rect.top;
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
        const latlng = map.containerPointToLatLng(L.point(x, y));
        const hit = findTopSelectableElementAt(latlng);
        if (!hit) return;
        L.DomEvent.stop(domEv);
        toggleElementInCtrlSelection(hit.element, hit.layer);
    }, true);

    map.on('moveend zoomend', () => {
        if (selectedElements.length > 0) {
            syncSelectionHighlights();
            syncSelectionAreaAnchorHandle();
            syncSelectionAreaRotateHandle();
        }
    });

    const addLayerBtn = document.getElementById('add-layer-btn');

    function getLayerDisplayName(layer) {
        const m = layer.name.match(/^(?:Layer|شفاف) (\d+)$/);
        return m ? t('layer-name-default', m[1]) : layer.name;
    }

    function buildFolderMoveOptions(layer) {
        const currentFolder = getFolderForLayer(layer);
        let html = `<option value=""${!currentFolder ? ' selected' : ''}>${t('folder-none')}</option>`;
        folders.forEach(f => {
            html += `<option value="${f.id}"${currentFolder && currentFolder.id === f.id ? ' selected' : ''}>${f.name}</option>`;
        });
        return html;
    }

    function upsertLayerTemplateFavorite(templateEntry, opts) {
        const tpl = sanitizeLayerTemplateEntry(templateEntry);
        if (!tpl) return { ok: false, reason: 'invalid' };
        const list = loadLayerTemplateFavorites();
        const nameKey = tpl.name.toLowerCase();
        let existingIndex = list.findIndex((x) => x.id === tpl.id);
        if (existingIndex < 0) {
            existingIndex = list.findIndex((x) => x.name.toLowerCase() === nameKey);
        }
        if (existingIndex >= 0) {
            if (!opts?.overwrite) return { ok: false, reason: 'exists', existing: list[existingIndex] };
            tpl.id = list[existingIndex].id;
            tpl.createdAt = list[existingIndex].createdAt;
            list.splice(existingIndex, 1);
        }
        list.unshift(tpl);
        const ok = saveLayerTemplateFavorites(list);
        return { ok, reason: ok ? 'saved' : 'quota', template: tpl, replaced: existingIndex >= 0 };
    }

    function formatLayerTemplateDate(ts) {
        const d = new Date(ts);
        if (!isFinite(d.getTime())) return '';
        try {
            return d.toLocaleString();
        } catch (_) {
            return '';
        }
    }

    function getLayerTemplateStats(payload) {
        const layersCount = Array.isArray(payload?.layers) ? payload.layers.length : 0;
        const elementsCount = (payload?.layers || []).reduce((acc, l) => acc + (Array.isArray(l?.elements) ? l.elements.length : 0), 0);
        return { layersCount, elementsCount };
    }

    function saveLayerAsTemplate(layer, opts) {
        if (!layer) return false;
        const customName = opts?.name ? String(opts.name).trim() : '';
        const defaultName = `${getLayerDisplayName(layer)} Template`;
        const finalName = normalizeLayerTemplateName(customName || defaultName, defaultName);
        const entry = captureTemplateFromLayer(layer.id, { name: finalName });
        if (!entry) return false;
        if (opts?.existingId) entry.id = opts.existingId;
        const out = upsertLayerTemplateFavorite(entry, { overwrite: !!opts?.overwrite });
        if (!out.ok && out.reason === 'exists') {
            const overwrite = confirm(t('layer-template-overwrite-confirm', finalName));
            if (!overwrite) return false;
            const out2 = upsertLayerTemplateFavorite(entry, { overwrite: true });
            if (!out2.ok) {
                alert(t('layer-template-save-error'));
                return false;
            }
        } else if (!out.ok) {
            alert(t('layer-template-save-error'));
            return false;
        }
        if (instructionText) instructionText.innerText = t('layer-template-saved', finalName);
        return true;
    }

    function createLayerRowElement(layer) {
        const displayName = getLayerDisplayName(layer);
        const row = document.createElement('div');
        row.className = 'layer-row' + (layer.active ? ' active' : '');
        row.dataset.layerId = layer.id;
        const hasFolders = folders.length > 0;
        row.innerHTML = `
            <div class="layer-info">
                <input type="radio" name="active-layer" id="layer-${layer.id}" ${layer.active ? 'checked' : ''}>
                <label for="layer-${layer.id}" class="layer-name" title="${typeof t === 'function' ? t('layer-rename-hint') : 'Double-click to rename'}">${displayName}</label>
                <span class="layer-count">(${layer.elements.length})</span>
            </div>
            <div class="layer-actions">
                ${hasFolders ? `<select class="layer-folder-select" title="${t('folder-move-to')}">${buildFolderMoveOptions(layer)}</select>` : ''}
                <button type="button" class="layer-visibility-btn" title="${layer.visible ? 'Hide' : 'Show'}">${layer.visible ? '👁' : '⊘'}</button>
                <button type="button" class="layer-template-btn" title="${t('layer-template-save-layer')}">★</button>
                <button type="button" class="layer-delete-btn" title="Delete layer">✕</button>
            </div>
        `;
        row.querySelector('input[type="radio"]').addEventListener('change', () => {
            layers.forEach(l => { l.active = false; });
            layer.active = true;
            renderLayersList();
        });
        const layerNameEl = row.querySelector('.layer-name');
        layerNameEl.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'layer-name-input glass-input';
            input.value = layer.name;
            input.style.cssText = 'width:100%;min-width:60px;padding:2px 6px;font-size:inherit;';
            layerNameEl.replaceWith(input);
            input.focus();
            input.select();
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                const val = input.value.trim();
                if (val) layer.name = val;
                input.replaceWith(layerNameEl);
                layerNameEl.textContent = getLayerDisplayName(layer);
                scheduleSaveToStorage();
            };
            const cancel = () => {
                if (done) return;
                done = true;
                input.replaceWith(layerNameEl);
                layerNameEl.textContent = getLayerDisplayName(layer);
            };
            input.addEventListener('blur', finish);
            input.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') { ev.preventDefault(); finish(); }
                if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
            });
        });
        row.querySelector('.layer-visibility-btn').addEventListener('click', () => {
            layer.visible = !layer.visible;
            if (layer.visible) layer.group.addTo(map);
            else map.removeLayer(layer.group);
            renderLayersList();
        });
        row.querySelector('.layer-delete-btn').addEventListener('click', () => {
            if (layer.elements.length > 0 && !confirm(`Delete "${displayName}" and all ${layer.elements.length} elements?`)) return;
            removeLayer(layer);
            renderLayersList();
        });
        row.querySelector('.layer-template-btn')?.addEventListener('click', async () => {
            const suggested = `${getLayerDisplayName(layer)} Template`;
            const name = await customPrompt(t('layer-template-name-prompt'), suggested);
            if (name == null) return;
            saveLayerAsTemplate(layer, { name });
            if (layerTemplatesModal && !layerTemplatesModal.classList.contains('hidden')) renderLayerTemplatesModal();
        });
        const folderSelect = row.querySelector('.layer-folder-select');
        if (folderSelect) {
            folderSelect.addEventListener('change', () => {
                const folderId = folderSelect.value;
                const targetFolder = folderId ? folders.find(f => f.id === folderId) : null;
                moveLayerToFolder(layer, targetFolder);
                renderLayersList();
                scheduleSaveToStorage();
            });
        }
        return row;
    }

    function isFolderAllVisible(folder) {
        const folderLayers = folder.layerIds.map(lid => layers.find(l => l.id === lid)).filter(Boolean);
        return folderLayers.length > 0 && folderLayers.every(l => l.visible);
    }

    function toggleFolderVisibility(folder) {
        const folderLayers = folder.layerIds.map(lid => layers.find(l => l.id === lid)).filter(Boolean);
        const allVisible = isFolderAllVisible(folder);
        folderLayers.forEach(l => {
            l.visible = !allVisible;
            if (l.visible) l.group.addTo(map);
            else map.removeLayer(l.group);
        });
    }

    async function addLayerToFolder(folder) {
        const num = folder.layerIds.length + 1;
        const defaultName = folder.name + ' - ' + t('layer-name-default', String(num));
        const name = await customPrompt(t('layer-name-prompt'), defaultName);
        if (!name) return;
        const layer = createLayer(name.trim() || defaultName);
        moveLayerToFolder(layer, folder);
        renderLayersList();
        scheduleSaveToStorage();
    }

    function createFolderElement(folder) {
        const elCount = getFolderElementCount(folder);
        const folderLayers = folder.layerIds.map(lid => layers.find(l => l.id === lid)).filter(Boolean);
        const allVisible = isFolderAllVisible(folder);
        const wrapper = document.createElement('div');
        wrapper.className = 'folder-group';
        wrapper.dataset.folderId = folder.id;

        const header = document.createElement('div');
        header.className = 'folder-header';
        header.innerHTML = `
            <div class="folder-info">
                <span class="folder-toggle">${folder.collapsed ? '▶' : '▼'}</span>
                <span class="folder-icon">📁</span>
                <span class="folder-name" title="${t('folder-rename-hint')}">${folder.name}</span>
                <span class="folder-count">(${folderLayers.length} ${t('folder-layers')}, ${elCount})</span>
            </div>
            <div class="folder-actions">
                <button type="button" class="folder-visibility-btn" title="${allVisible ? 'Hide all' : 'Show all'}">${allVisible ? '👁' : '⊘'}</button>
                <button type="button" class="folder-export-btn" title="${t('folder-export')}">${t('export')}</button>
                <button type="button" class="folder-delete-btn" title="${t('folder-delete')}">✕</button>
            </div>
        `;

        header.querySelector('.folder-toggle').addEventListener('click', () => {
            folder.collapsed = !folder.collapsed;
            renderLayersList();
        });

        header.querySelector('.folder-visibility-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFolderVisibility(folder);
            renderLayersList();
        });

        const folderNameEl = header.querySelector('.folder-name');
        folderNameEl.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'layer-name-input glass-input';
            input.value = folder.name;
            input.style.cssText = 'width:100%;min-width:60px;padding:2px 6px;font-size:inherit;';
            folderNameEl.replaceWith(input);
            input.focus();
            input.select();
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                const val = input.value.trim();
                if (val) folder.name = val;
                input.replaceWith(folderNameEl);
                folderNameEl.textContent = folder.name;
                scheduleSaveToStorage();
            };
            const cancel = () => {
                if (done) return;
                done = true;
                input.replaceWith(folderNameEl);
            };
            input.addEventListener('blur', finish);
            input.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') { ev.preventDefault(); finish(); }
                if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
            });
        });

        header.querySelector('.folder-export-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            exportFolder(folder);
        });

        header.querySelector('.folder-delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (folderLayers.length > 0) {
                const deleteLayers = confirm(t('folder-delete-with-layers'));
                removeFolder(folder, deleteLayers);
            } else {
                removeFolder(folder, false);
            }
            renderLayersList();
            scheduleSaveToStorage();
        });

        wrapper.appendChild(header);

        if (!folder.collapsed) {
            const body = document.createElement('div');
            body.className = 'folder-body';
            const scroll = document.createElement('div');
            scroll.className = 'folder-body-scroll';
            scroll.setAttribute('role', 'region');
            scroll.setAttribute('aria-label', t('folder-layers-list'));
            folderLayers.forEach(layer => {
                scroll.appendChild(createLayerRowElement(layer));
            });
            body.appendChild(scroll);

            const addBtn = document.createElement('button');
            addBtn.className = 'folder-add-layer-btn';
            addBtn.type = 'button';
            addBtn.textContent = '+ ' + t('folder-add-layer');
            addBtn.addEventListener('click', () => addLayerToFolder(folder));
            body.appendChild(addBtn);

            wrapper.appendChild(body);
        }

        return wrapper;
    }

    function exportFolder(folder) {
        const folderLayers = folder.layerIds.map(lid => layers.find(l => l.id === lid)).filter(Boolean);
        const data = {
            version: 1,
            folderName: folder.name,
            layers: folderLayers.map(layer => ({
                name: layer.name,
                visible: layer.visible,
                active: layer.active,
                elements: layer.elements.map(el => exportSingleElement(el)).filter(Boolean)
            }))
        };
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${folder.name.replace(/[^a-zA-Z0-9_\-\u0600-\u06FF ]/g, '_')}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function renderLayersList() {
        if (!layersListEl) return;
        layersListEl.innerHTML = '';

        folders.forEach(folder => {
            layersListEl.appendChild(createFolderElement(folder));
        });

        const unfolderedLayers = getUnfolderedLayers();
        unfolderedLayers.forEach(layer => {
            layersListEl.appendChild(createLayerRowElement(layer));
        });

        scheduleSaveToStorage();
    }

    // Initialise map data serialiser — export constants plus all importLayersData deps
    window.AppIO.init({
        // Export helpers (existing)
        TEXT_LABEL_COLOR_DEFAULT,
        TEXT_LABEL_FONT_SIZE_DEFAULT,
        DEFAULT_GEO_FILL_STYLE,
        assignDisplayNameOnExport,
        // State getters — return live array/object references
        getLayers: () => layers,
        getFolders: () => folders,
        getActionHistory: () => actionHistory,
        getRedoHistory: () => redoHistory,
        getMap: () => map,
        getInstructionText: () => instructionText,
        getActiveGeoResizeHandles: () => activeGeoResizeHandles,
        resetIdCounters: () => { layerIdCounter = 1; folderIdCounter = 1; },
        // Import constants
        CATK_AUTO_JUNCTION_T,
        GEO_POPUP_OPTIONS,
        // Core layer/element management
        cleanupElementDecorations,
        createLayer,
        createFolder,
        moveLayerToFolder,
        // Text labels
        buildTextLabelIcon,
        buildTextLabelPopupContent,
        bindTextLabelPopupHandlers,
        // Layer operations
        addToActiveLayer,
        removeFromLayer,
        wireTacticalLinePolyline,
        // Counterattack / multi-point tactical graphics
        catkInterpOnTailAxis,
        catkBuildTailPathFromPoints,
        catkHitPolylineOptions,
        createCatkUnifiedMarker,
        createParametricCatkGroup,
        createLegacyCatkGroup,
        catkDeriveArrowParamsFromLegacyPoints,
        resolveCatkMultiPointDashed,
        applyImportedDisplayNameProps,
        buildCatkTailPopupContent,
        onCatkGroupPopupOpen,
        removeTmgResizeHandle,
        // Tactical map graphics
        createTmgLayer,
        showTmgGroupPopupSelectionUi,
        scheduleTmgPopupBind,
        // Symbols
        createSymbolFromData,
        addRangeCircleToMarker,
        addRangeSectorToMarker,
        // Geo distance / shapes
        dedupeConsecutiveDistancePointsMutate,
        createDistanceWaypointMarkers,
        removeGeoResizeHandles,
        bindGeoCenterMoveHandle,
        bindGeoPopupHandlers,
        createGeoResizeHandle,
        syncGeoShapeHandlesToGeometry,
        getGeoShapeStyle,
        scheduleGeoPathFill,
        latLngAtBearing,
        createSectorPolygon,
        createRegularPolygon,
        createEllipseRingFromBoundingCorners,
        // Minefield
        getMinefieldStyle,
        applyMinefieldFill,
        addMinefieldDecorations,
        bindMinefieldResizeHandles,
        // Freehand
        wireFreehandPolyline,
        // Post-import cleanup and rendering
        cancelGeoDrawing,
        cancelLineDrawing,
        renderLayersList,
        refreshZoomScaledMapOverlays,
        syncPlacementLayerInteractivity,
        scheduleSaveToStorage,
    });

    const STORAGE_KEY = 'nato-map-planner-data';
    let saveToStorageTimeout = null;
    function scheduleSaveToStorage() {
        clearTimeout(saveToStorageTimeout);
        saveToStorageTimeout = setTimeout(() => {
            try {
                localStorage.setItem(STORAGE_KEY, exportLayersData());
            } catch (e) { /* quota or disabled */ }
        }, 400);
    }

    function createSymbolFromData(d) {
        const latlng = fromLatLngArr(d.latlng);
        if (!latlng) return null;
        const sidc = d.sidc || '10031000001200000000';
        const opts = { size: 25, simpleStatusModifier: true, ...(d.textModifiers || {}) };
        const marker = L.marker(latlng, { icon: L.divIcon({ className: 'custom-nato-marker', html: '<div></div>', iconSize: [1, 1], iconAnchor: [0, 0] }), draggable: true });
        marker._sidc = sidc;
        marker._textModifiers = opts;
        marker._statusKey = d.statusKey || STATUS_OPTIONS.find(o => o.value === getSidcStatus(sidc))?.key || 'status-operational';
        marker._symbolRotationDeg = d.symbolRotationDeg || 0;
        refreshSymbolIcon(marker);
        const rcs = d.rangeCircles && Array.isArray(d.rangeCircles) ? d.rangeCircles : (d.rangeCircle ? [d.rangeCircle] : []);
        if (rcs.length) marker._pendingRangeCircles = rcs;
        const rss = d.rangeSectors && Array.isArray(d.rangeSectors) ? d.rangeSectors : [];
        if (rss.length) marker._pendingRangeSectors = rss;
        marker.bindPopup(buildSymbolPopupContent(marker), { bubblingMouseEvents: false });
        marker.on('popupopen', () => {
            marker.setPopupContent(buildSymbolPopupContent(marker));
            bindSymbolPopupHandlers(marker);
        });
        return marker;
    }


    addLayerBtn?.addEventListener('click', async () => {
        const defaultName = t('layer-name-default', String(layers.length + 1));
        const name = await customPrompt(t('layer-name-prompt'), defaultName);
        if (!name) return;
        createLayer(name.trim() || defaultName);
        renderLayersList();
    });

    const addFolderBtn = document.getElementById('add-folder-btn');
    addFolderBtn?.addEventListener('click', async () => {
        const defaultName = t('folder-name-default', String(folders.length + 1));
        const name = await customPrompt(t('folder-name-prompt'), defaultName);
        if (!name) return;
        createFolder(name.trim() || defaultName);
        renderLayersList();
        scheduleSaveToStorage();
    });

    const layerTemplatesBtn = document.getElementById('layer-templates-btn');
    const layerTemplatesModal = document.getElementById('layer-templates-modal');
    const layerTemplatesListEl = document.getElementById('layer-templates-list');
    const layerTemplateNameInput = document.getElementById('layer-template-name-input');
    const layerTemplateSaveActiveBtn = document.getElementById('layer-template-save-active-btn');

    function renderLayerTemplatesModal() {
        if (!layerTemplatesListEl) return;
        layerTemplatesListEl.innerHTML = '';
        const list = loadLayerTemplateFavorites();
        if (list.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'layer-templates-empty';
            empty.textContent = t('layer-template-empty');
            layerTemplatesListEl.appendChild(empty);
            return;
        }
        list.forEach((tpl) => {
            const stats = getLayerTemplateStats(tpl.payload);
            const row = document.createElement('div');
            row.className = 'layer-template-item';
            row.setAttribute('role', 'listitem');

            const head = document.createElement('div');
            head.className = 'layer-template-item-head';
            const nameEl = document.createElement('div');
            nameEl.className = 'layer-template-item-name';
            nameEl.textContent = tpl.name;
            const metaEl = document.createElement('div');
            metaEl.className = 'layer-template-item-meta';
            metaEl.textContent = t('layer-template-meta', String(stats.layersCount), String(stats.elementsCount), formatLayerTemplateDate(tpl.createdAt));
            head.appendChild(nameEl);
            head.appendChild(metaEl);

            const actions = document.createElement('div');
            actions.className = 'layer-template-item-actions';
            actions.innerHTML = `
                <button type="button" class="glass-btn secondary layer-template-apply-btn">${t('layer-template-apply')}</button>
                <button type="button" class="glass-btn secondary layer-template-rename-btn">${t('layer-template-rename')}</button>
                <button type="button" class="glass-btn secondary layer-template-overwrite-btn">${t('layer-template-overwrite')}</button>
                <button type="button" class="glass-btn danger layer-template-delete-btn">${t('layer-template-delete')}</button>
            `;
            actions.querySelector('.layer-template-apply-btn')?.addEventListener('click', () => {
                if (applyLayerTemplate(tpl)) {
                    renderLayerTemplatesModal();
                } else {
                    alert(t('layer-template-apply-error'));
                }
            });
            actions.querySelector('.layer-template-rename-btn')?.addEventListener('click', async () => {
                const next = await customPrompt(t('layer-template-rename-prompt'), tpl.name);
                if (next == null) return;
                tpl.name = normalizeLayerTemplateName(next, tpl.name);
                if (!saveLayerTemplateFavorites(list)) {
                    alert(t('layer-template-save-error'));
                    return;
                }
                renderLayerTemplatesModal();
            });
            actions.querySelector('.layer-template-overwrite-btn')?.addEventListener('click', () => {
                const active = getActiveLayer();
                if (!active) return;
                const ok = confirm(t('layer-template-overwrite-confirm', tpl.name));
                if (!ok) return;
                if (!saveLayerAsTemplate(active, { name: tpl.name, overwrite: true, existingId: tpl.id })) {
                    alert(t('layer-template-save-error'));
                    return;
                }
                renderLayerTemplatesModal();
            });
            actions.querySelector('.layer-template-delete-btn')?.addEventListener('click', () => {
                const ok = confirm(t('layer-template-delete-confirm', tpl.name));
                if (!ok) return;
                const next = loadLayerTemplateFavorites().filter((x) => x.id !== tpl.id);
                if (!saveLayerTemplateFavorites(next)) {
                    alert(t('layer-template-save-error'));
                    return;
                }
                renderLayerTemplatesModal();
                if (instructionText) instructionText.innerText = t('layer-template-deleted', tpl.name);
            });

            row.appendChild(head);
            row.appendChild(actions);
            layerTemplatesListEl.appendChild(row);
        });
    }

    function openLayerTemplatesModal() {
        if (!layerTemplatesModal) return;
        layerTemplatesModal.classList.remove('hidden');
        layerTemplatesModal.setAttribute('aria-hidden', 'false');
        renderLayerTemplatesModal();
        if (layerTemplateNameInput) {
            layerTemplateNameInput.value = '';
            layerTemplateNameInput.focus();
        }
    }

    function closeLayerTemplatesModal() {
        if (!layerTemplatesModal) return;
        layerTemplatesModal.classList.add('hidden');
        layerTemplatesModal.setAttribute('aria-hidden', 'true');
    }

    layerTemplatesBtn?.addEventListener('click', openLayerTemplatesModal);
    document.getElementById('layer-templates-modal-backdrop')?.addEventListener('click', closeLayerTemplatesModal);
    document.getElementById('layer-templates-modal-close')?.addEventListener('click', closeLayerTemplatesModal);
    document.getElementById('layer-templates-footer-close-btn')?.addEventListener('click', closeLayerTemplatesModal);
    layerTemplateSaveActiveBtn?.addEventListener('click', () => {
        const active = getActiveLayer();
        if (!active) return;
        const defaultName = `${getLayerDisplayName(active)} Template`;
        const customName = layerTemplateNameInput?.value;
        const ok = saveLayerAsTemplate(active, { name: customName || defaultName });
        if (ok) {
            if (layerTemplateNameInput) layerTemplateNameInput.value = '';
            renderLayerTemplatesModal();
        }
    });
    layerTemplateNameInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            layerTemplateSaveActiveBtn?.click();
        }
    });

    const exportLayersBtn = document.getElementById('export-layers-btn');
    const importLayersBtn = document.getElementById('import-layers-btn');
    const importLayersInput = document.getElementById('import-layers-input');
    const exportLayersModal = document.getElementById('export-layers-modal');
    const exportSelectTree = document.getElementById('export-select-tree');

    function syncExportFolderMaster(folderBlock) {
        const master = folderBlock.querySelector('.export-select-folder-master');
        const cbs = [...folderBlock.querySelectorAll('.export-select-layer-cb')];
        if (!master || !cbs.length) return;
        const n = cbs.filter(c => c.checked).length;
        master.checked = n === cbs.length;
        master.indeterminate = n > 0 && n < cbs.length;
    }

    function populateExportLayersModal() {
        if (!exportSelectTree) return;
        exportSelectTree.innerHTML = '';
        if (layers.length === 0) {
            const p = document.createElement('p');
            p.className = 'export-select-hint';
            p.textContent = t('export-select-empty');
            exportSelectTree.appendChild(p);
            return;
        }
        folders.forEach(folder => {
            const folderLayers = folder.layerIds.map(lid => layers.find(l => l.id === lid)).filter(Boolean);
            if (folderLayers.length === 0) return;
            const block = document.createElement('div');
            block.className = 'export-select-folder-block';

            const masterLabel = document.createElement('label');
            masterLabel.className = 'export-select-folder-master-label';
            const master = document.createElement('input');
            master.type = 'checkbox';
            master.className = 'export-select-folder-master';
            master.checked = true;
            const masterText = document.createElement('span');
            masterText.textContent = folder.name;
            masterLabel.appendChild(master);
            masterLabel.appendChild(masterText);
            block.appendChild(masterLabel);

            const layersWrap = document.createElement('div');
            layersWrap.className = 'export-select-folder-layers';
            folderLayers.forEach(layer => {
                const lab = document.createElement('label');
                lab.className = 'export-select-layer-label';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'export-select-layer-cb';
                cb.dataset.layerId = layer.id;
                cb.checked = true;
                const span = document.createElement('span');
                span.textContent = `${getLayerDisplayName(layer)} (${layer.elements.length})`;
                lab.appendChild(cb);
                lab.appendChild(span);
                cb.addEventListener('change', () => syncExportFolderMaster(block));
                layersWrap.appendChild(lab);
            });
            block.appendChild(layersWrap);

            master.addEventListener('change', () => {
                const on = master.checked;
                block.querySelectorAll('.export-select-layer-cb').forEach(c => { c.checked = on; });
                master.indeterminate = false;
            });
            syncExportFolderMaster(block);
            exportSelectTree.appendChild(block);
        });

        const unfoldered = getUnfolderedLayers();
        if (unfoldered.length > 0) {
            const title = document.createElement('p');
            title.className = 'export-select-unfoldered-title';
            title.textContent = t('export-select-unfoldered');
            exportSelectTree.appendChild(title);
            unfoldered.forEach(layer => {
                const lab = document.createElement('label');
                lab.className = 'export-select-layer-label';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'export-select-layer-cb';
                cb.dataset.layerId = layer.id;
                cb.checked = true;
                const span = document.createElement('span');
                span.textContent = `${getLayerDisplayName(layer)} (${layer.elements.length})`;
                lab.appendChild(cb);
                lab.appendChild(span);
                exportSelectTree.appendChild(lab);
            });
        }
    }

    function openExportLayersModal() {
        if (!exportLayersModal) return;
        populateExportLayersModal();
        exportLayersModal.classList.remove('hidden');
        exportLayersModal.setAttribute('aria-hidden', 'false');
    }

    function closeExportLayersModal() {
        if (!exportLayersModal) return;
        exportLayersModal.classList.add('hidden');
        exportLayersModal.setAttribute('aria-hidden', 'true');
    }

    exportLayersBtn?.addEventListener('click', () => openExportLayersModal());

    document.getElementById('export-layers-modal-backdrop')?.addEventListener('click', closeExportLayersModal);
    document.getElementById('export-layers-modal-close')?.addEventListener('click', closeExportLayersModal);
    document.getElementById('export-select-cancel-btn')?.addEventListener('click', closeExportLayersModal);

    document.getElementById('export-select-all-btn')?.addEventListener('click', () => {
        exportSelectTree?.querySelectorAll('.export-select-layer-cb').forEach(c => { c.checked = true; });
        exportSelectTree?.querySelectorAll('.export-select-folder-block').forEach(syncExportFolderMaster);
    });
    document.getElementById('export-select-none-btn')?.addEventListener('click', () => {
        exportSelectTree?.querySelectorAll('.export-select-layer-cb').forEach(c => { c.checked = false; });
        exportSelectTree?.querySelectorAll('.export-select-folder-master').forEach(m => {
            m.checked = false;
            m.indeterminate = false;
        });
    });

    document.getElementById('export-select-download-btn')?.addEventListener('click', () => {
        const ids = [];
        exportSelectTree?.querySelectorAll('.export-select-layer-cb:checked').forEach(cb => {
            if (cb.dataset.layerId) ids.push(cb.dataset.layerId);
        });
        if (ids.length === 0) {
            alert(t('export-select-none-checked'));
            return;
        }
        const json = exportLayersDataFromSelection(ids);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'nato-map-layers.json';
        a.click();
        URL.revokeObjectURL(url);
        closeExportLayersModal();
    });

    importLayersBtn?.addEventListener('click', () => importLayersInput?.click());
    importLayersInput?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            importLayersData(reader.result, false, true);
        };
        reader.readAsText(file);
        e.target.value = '';
    });

    finishLineBtn?.addEventListener('click', finishLineDrawing);
    cancelLineBtn?.addEventListener('click', cancelLineDrawing);

    function finishGeoFreeformPolygon() {
        if (geoFreeformPoints.length >= 3 && geoFreeformPreview) {
            const geoColor = getGeoColor();
            const pts = [...geoFreeformPoints];
            previewLayer.removeLayer(geoFreeformPreview);
            geoFreeformPreview = null;
            const fillStyle = getGeoFillStyle();
            const poly = L.polygon(pts, { ...getGeoShapeStyle(geoColor, fillStyle) });
            poly._geoType = 'freeform';
            poly._geoData = { points: pts, color: geoColor, fillStyle };
            poly.bindPopup(buildGeoPopupContent(poly, 'freeform', poly._geoData), GEO_POPUP_OPTIONS);
            poly.on('popupopen', () => {
                removeGeoResizeHandles();
                bindGeoCenterMoveHandle(poly, 'freeform');
                bindGeoPopupHandlers(poly, 'freeform');
            });
            poly.on('popupclose', removeGeoResizeHandles);
            addToActiveLayer(poly);
            geoFreeformPoints = [];
            geoDrawingControls?.classList.add('hidden');
            if (instructionText) instructionText.innerText = t('geo-freeform-hint');
        }
    }

    function finishGeoDistancePolyline() {
        if (geoDistancePoints.length >= 2 && geoDistancePolyline) {
            const polyline = geoDistancePolyline;
            const geoColor = getGeoColor();
            const pts = [...geoDistancePoints];
            dedupeConsecutiveDistancePointsMutate(pts);
            if (pts.length < 2) return;
            const distKm = totalDistanceKm(pts);
            previewLayer.removeLayer(polyline);
            polyline.setLatLngs(pts);
            polyline.setStyle({ color: geoColor, dashArray: null });
            polyline._geoType = 'distance';
            polyline._geoData = { points: pts, distanceKm: distKm, color: geoColor, pointLabels: [] };
            polyline.bindPopup(buildGeoPopupContent(polyline, 'distance', polyline._geoData), GEO_POPUP_OPTIONS);
            polyline.on('popupopen', () => {
                removeGeoResizeHandles();
                const d = polyline._geoData;
                if (d) {
                    d.points = d.points?.length ? d.points : (polyline.getLatLngs?.() || []);
                    polyline.setPopupContent(buildGeoPopupContent(polyline, 'distance', d));
                }
                bindGeoCenterMoveHandle(polyline, 'distance');
                if (!polyline._waypointMarkers?.length) createDistanceWaypointMarkers(polyline);
                bindGeoPopupHandlers(polyline, 'distance');
            });
            polyline.on('popupclose', removeGeoResizeHandles);
            if (polyline._baseLineWeight == null) polyline._baseLineWeight = polyline.options?.weight ?? 3;
            applyZoomScaledStrokeToPolyline(polyline);
            addToActiveLayer(polyline);
            setTimeout(() => createDistanceWaypointMarkers(polyline), 0);
            geoDistancePolyline = null;
            geoDistancePoints = [];
            geoDrawingControls?.classList.add('hidden');
            if (instructionText) instructionText.innerText = t('geo-distance-hint');
        }
    }

    finishGeoPolygonBtn?.addEventListener('click', () => {
        if (getGeoSelectedTool() === 'distance' && geoDistancePoints.length >= 2) finishGeoDistancePolyline();
        else if (getGeoSelectedTool() === 'freeform' && geoFreeformPoints.length >= 3) finishGeoFreeformPolygon();
    });
    cancelGeoPolygonBtn?.addEventListener('click', () => {
        cancelGeoDrawing();
        updateGeoInstruction();
    });

    /** Physical key (e.code) works with Arabic/non-Latin layouts; e.key fallback for very old browsers. */
    function mapHotkeyTargetAllowsShortcut(target) {
        const tag = target && target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target && target.isContentEditable)) return false;
        if (target && typeof target.closest === 'function' && (target.closest('.leaflet-popup-content') || target.closest('#sidc-picker') || target.closest('.modal'))) return false;
        return true;
    }

    function physicalLetterKey(e, codeName, latinLower) {
        return e.code === codeName || e.key === latinLower || e.key === latinLower.toUpperCase();
    }

    document.addEventListener('keydown', (e) => {
        if (!e.ctrlKey && !e.metaKey && !e.altKey && mapHotkeyTargetAllowsShortcut(e.target)) {
            if (physicalLetterKey(e, 'KeyM', 'm')) {
                e.preventDefault();
                activatePanInspectMode();
                return;
            }
            if (physicalLetterKey(e, 'KeyF', 'f')) {
                e.preventDefault();
                toggleFreehandDrawMode();
                return;
            }
            if (physicalLetterKey(e, 'KeyT', 't')) {
                e.preventDefault();
                activateTextBoxMode();
                return;
            }
            if (physicalLetterKey(e, 'KeyE', 'e')) {
                e.preventDefault();
                activateEraserMode();
                return;
            }
        }
        if (e.code === 'Escape' || e.key === 'Escape') {
            if (pendingGeoMove) {
                e.preventDefault();
                pendingGeoMove = null;
                syncPlacementLayerInteractivity();
                map.getContainer().style.cursor = '';
                if (instructionText) instructionText.innerText = typeof t === 'function' ? t('instruction-default') : '';
            } else if (addingPointTmgGroup || reorientingTmgMarker || !!catkPlacementState || drawLineCoords.length >= 2 || tmgPoints.length >= 2) {
                e.preventDefault();
                cancelLineDrawing();
            } else if (isGeoPanelActive() && (geoDistancePoints.length >= 1 || geoFreeformPoints.length >= 1 || geoFreehandPoints.length >= 1 || isFreehandDrawing || isTrimmerDragging)) {
                e.preventDefault();
                if (isTrimmerDragging) {
                    isTrimmerDragging = false;
                    map.dragging.enable();
                    lastTrimmerScreenPos = null;
                }
                if (isFreehandDrawing) {
                    isFreehandDrawing = false;
                    map.dragging.enable();
                    geoFreehandLastScreenPos = null;
                    if (geoFreehandPreview) { previewLayer.removeLayer(geoFreehandPreview); geoFreehandPreview = null; }
                    geoFreehandPoints = [];
                }
                cancelGeoDrawing();
                updateGeoInstruction();
            }
        }
    });

    document.getElementById('clear-map-btn').addEventListener('click', () => {
        const layer = getActiveLayer();
        if (!layer) return;
        if (layer.elements.length === 0) return;
        removeGeoResizeHandles();
        layer.elements.forEach(el => {
            cleanupElementDecorations(el, layer);
            layer.group.removeLayer(el);
            const histIdx = actionHistory.findIndex(a => a.type === 'add' && a.element === el);
            if (histIdx >= 0) actionHistory.splice(histIdx, 1);
        });
        layer.elements.length = 0;
        for (let i = actionHistory.length - 1; i >= 0; i--) {
            const a = actionHistory[i];
            if (a.type === 'polylineErase' && a.layer && a.layer.id === layer.id) actionHistory.splice(i, 1);
        }
        redoHistory.length = 0;
        cancelLineDrawing();
        clearSelection();
        renderLayersList();
    });

    const undoBtn = document.getElementById('undo-btn');
    undoBtn?.addEventListener('click', () => {
        if (undoLastAction()) {
            if (instructionText) instructionText.innerText = t('inst-undo');
            renderLayersList();
            scheduleSaveToStorage();
        }
    });
    const redoBtn = document.getElementById('redo-btn');
    redoBtn?.addEventListener('click', () => {
        if (redoLastAction()) {
            if (instructionText) instructionText.innerText = t('inst-redo');
            renderLayersList();
            scheduleSaveToStorage();
        }
    });
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            if (e.code === 'KeyY' || e.key === 'y' || e.key === 'Y') {
                e.preventDefault();
                if (redoLastAction()) {
                    if (instructionText) instructionText.innerText = t('inst-redo');
                    renderLayersList();
                    scheduleSaveToStorage();
                }
            }
            if (e.code === 'KeyZ' || e.key === 'z' || e.key === 'Z') {
                e.preventDefault();
                if (undoLastAction()) {
                    if (instructionText) instructionText.innerText = t('inst-undo');
                    renderLayersList();
                    scheduleSaveToStorage();
                }
            }
        }
        if ((e.code === 'Delete' || e.code === 'Backspace' || e.key === 'Delete' || e.key === 'Backspace') && selectedElements.length > 0 && (currentMode === 'select' || currentMode === 'pan')) {
            if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
            e.preventDefault();
            selectionDeleteBtn?.click();
        }
    });

    // Initialize instructions text based on default mode
    modeSelect.dispatchEvent(new Event('change'));
    updateTopBarQuickToolButtons();
    renderLayersList();
    updateLineDrawingControls();

    // Load saved state from localStorage (persists across refresh/restart)
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
        try {
            importLayersData(savedData, true);
        } catch (e) {
            /* keep default Layer 1 */
        }
    }

    /** RTL flex layout and late font/layout can leave Leaflet with a stale size; re-sync so vectors match tiles after refresh. */
    function syncMapSizeAndOverlays() {
        try {
            map.invalidateSize({ animate: false });
            refreshZoomScaledMapOverlays();
        } catch (e) { /* ignore */ }
    }
    requestAnimationFrame(() => {
        requestAnimationFrame(syncMapSizeAndOverlays);
    });
    window.addEventListener('load', syncMapSizeAndOverlays);

    function updateTmgGridLabels() {
        if (!tmgGrid) return;
        tmgGrid.querySelectorAll('.tmg-btn').forEach(btn => {
            const id = btn.dataset.tmgId;
            const def = TACTICAL_GRAPHICS.find(d => d.id === id);
            if (def) {
                const label = getTmgLabel(def);
                btn.title = label;
                const span = btn.querySelector('.tmg-picker-label');
                if (span) span.textContent = label;
            }
        });
    }

    // Refresh instructions and layer names when language changes
    window.onLanguageChange = () => {
        modeSelect.dispatchEvent(new Event('change'));
        updateTopBarQuickToolButtons();
        if (layersListEl) renderLayersList();
        updateTmgGridLabels();
        syncDistanceUnitToggleButton();
        syncDistanceUnitSelect();
        refreshDistanceUnitDisplays();
        if (typeof renderTopFavoritesPanel === 'function' && topFavoritesPanel && !topFavoritesPanel.classList.contains('hidden')) {
            renderTopFavoritesPanel();
        }
        if (typeof renderLayerTemplatesModal === 'function' && layerTemplatesModal && !layerTemplatesModal.classList.contains('hidden')) {
            renderLayerTemplatesModal();
        }
        syncSidcPickerLocaleToFrame();
    };

    // Light/Dark theme toggle
    const THEME_KEY = 'nato-map-planner-theme';
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    function getTheme() {
        return localStorage.getItem(THEME_KEY) || 'dark';
    }
    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(THEME_KEY, theme);
        if (themeToggleBtn) {
            themeToggleBtn.textContent = theme === 'dark' ? '☀' : '☾';
            themeToggleBtn.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
        }
    }
    setTheme(getTheme());
    themeToggleBtn?.addEventListener('click', () => {
        setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    });

    syncDistanceUnitToggleButton();
    syncDistanceUnitSelect();
    refreshTmgSidebarLengthForUnit();
    document.getElementById('distance-unit-toggle-btn')?.addEventListener('click', () => {
        setDistanceUnitPrimary(getDistanceUnitPrimary() === 'nm' ? 'km' : 'nm');
        syncDistanceUnitToggleButton();
        syncDistanceUnitSelect();
        refreshDistanceUnitDisplays();
    });
    document.getElementById('distance-unit-select')?.addEventListener('change', (e) => {
        const v = e.target?.value;
        setDistanceUnitPrimary(v === 'nm' ? 'nm' : 'km');
        syncDistanceUnitToggleButton();
        refreshDistanceUnitDisplays();
    });

    const panInspectMBtn = document.getElementById('pan-inspect-m-btn');
    panInspectMBtn?.addEventListener('click', () => activatePanInspectMode());
    document.getElementById('text-tool-t-btn')?.addEventListener('click', () => activateTextBoxMode());
    document.getElementById('freehand-f-btn')?.addEventListener('click', () => toggleFreehandDrawMode());
    document.getElementById('eraser-e-btn')?.addEventListener('click', () => activateEraserMode());

    document.getElementById('select-area-header-btn')?.addEventListener('click', () => {
        // Deactivate any active geo tool first
        if (geoToolSelect && geoToolSelect.value !== 'none') {
            geoToolSelect.value = 'none';
            geoToolSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const modeSelectEl = document.getElementById('tool-mode');
        if (modeSelectEl) {
            modeSelectEl.value = 'select';
            modeSelectEl.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });

    if (window.freeDrawSignature && typeof window.freeDrawSignature.init === 'function') {
        window.freeDrawSignature.init({ map });
    }
    document.getElementById('free-draw-signature-btn')?.addEventListener('click', () => {
        window.freeDrawSignature?.activate?.();
    });

    // Coordinate system preference
    const COORD_SYSTEM_KEY = 'nato-map-planner-coord-system';
    const savedCoordSystem = localStorage.getItem(COORD_SYSTEM_KEY);
    if (savedCoordSystem && coordSystemSelect && ['wgs84', 'dms', 'utm', 'mgrs'].includes(savedCoordSystem)) {
        coordSystemSelect.value = savedCoordSystem;
    }
    coordSystemSelect?.addEventListener('change', () => {
        localStorage.setItem(COORD_SYSTEM_KEY, coordSystemSelect.value);
    });

    window.AppChat.init();
    window.AppUnits?.init?.();
});
