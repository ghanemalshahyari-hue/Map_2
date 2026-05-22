/**
 * Cesium 3D globe view — Wargame adjudicator.
 *
 * Renders the active scenario on a 3D globe alongside the Leaflet map.
 * The two views are mutually exclusive: toggling 3D hides Leaflet and vice-versa.
 *
 * Features:
 *   - milsymbol/SIDC billboards — same icons as the 2D map
 *   - Altitude by domain: air 4 500 m, helicopter 800 m, naval 0 m,
 *     ground CLAMP_TO_GROUND
 *   - Step-by-step animated position updates (entity.position ← Cartesian3)
 *   - Parabolic 3D engagement arcs (PolylineGlow material, 24-point bezier)
 *   - Click-to-place mode: operator clicks terrain → callback({lon, lat, alt})
 *
 * Requires:
 *   window.Cesium  (loaded from CDN or local copy in /lib/cesium/)
 *   window.ms      (milsymbol — already loaded by app.html)
 */
(function () {
    'use strict';

    // ── CDN lazy-load config ─────────────────────────────────────────────
    // Cesium is NOT loaded at page start (it's ~10 MB and its widgets.css
    // injects global html/body resets that break the existing layout).
    // Both assets are injected on first "🌐 3D" click instead.
    const CESIUM_VERSION = '1.116';
    const CESIUM_BASE    = `https://cesium.com/downloads/cesiumjs/releases/${CESIUM_VERSION}/Build/Cesium`;
    let _cesiumLoadPromise = null;

    function loadCesiumAssets() {
        if (window.Cesium) return Promise.resolve(true);
        if (_cesiumLoadPromise) return _cesiumLoadPromise;
        _cesiumLoadPromise = new Promise((resolve) => {
            // CSS — injected once; scoped after map is hidden so global resets don't bite
            if (!document.querySelector('link[data-cesium]')) {
                const link = document.createElement('link');
                link.rel  = 'stylesheet';
                link.href = `${CESIUM_BASE}/Widgets/widgets.css`;
                link.setAttribute('data-cesium', '1');
                document.head.appendChild(link);
            }
            const script  = document.createElement('script');
            script.src    = `${CESIUM_BASE}/Cesium.js`;
            script.onload = () => resolve(true);
            script.onerror = () => { _cesiumLoadPromise = null; resolve(false); };
            document.head.appendChild(script);
        });
        return _cesiumLoadPromise;
    }

    // ── Module state ────────────────────────────────────────────────────
    let viewer      = null;   // Cesium.Viewer
    let isVisible   = false;
    let inPlaceMode = false;
    let placeCb     = null;   // function({lon,lat,alt})
    let scenarioRef = null;

    // uid → Cesium.Entity for scenario units (both sides + BLS/OBJ)
    const unitEntities = {};
    // Engagement-arc entities — removed on every applyState call
    const arcEntities  = [];

    // Billboard image cache: sidc_size → dataURL
    const _imgCache = {};

    // ── Altitude model ──────────────────────────────────────────────────
    const ROLE_ALT = {
        // Air (metres AGL)
        strike: 5000, fighter: 5000, fighter_ad: 5000, bomber: 8000,
        helicopter: 800, attack_helo: 600, transport_helo: 500,
        kamikaze_uav: 1200, uav: 1500, isr: 2000, aew: 6000,
        // Naval (at sea surface = 0)
        destroyer: 0, frigate: 0, landing_ship: 0, amphib: 0,
        submarine: 0, usv: 0,
        // Ground / fires — clamped to terrain
        default: 0,
    };
    const AIR_ROLES   = new Set(['strike','fighter','fighter_ad','bomber',
        'helicopter','attack_helo','transport_helo','kamikaze_uav','uav','isr','aew']);
    const NAVAL_ROLES = new Set(['destroyer','frigate','landing_ship','amphib',
        'submarine','usv']);

    function altFor(unit) {
        const r = (unit && unit.role) || '';
        return ROLE_ALT[r] !== undefined ? ROLE_ALT[r] : ROLE_ALT.default;
    }
    function heightRefFor(unit) {
        if (!window.Cesium) return 0;
        const r = (unit && unit.role) || '';
        if (AIR_ROLES.has(r) || NAVAL_ROLES.has(r)) return Cesium.HeightReference.NONE;
        return Cesium.HeightReference.CLAMP_TO_GROUND;
    }

    // ── Billboard helpers ────────────────────────────────────────────────
    function billboardFor(sidc, size) {
        const key = sidc + '_' + (size || 40);
        if (_imgCache[key]) return _imgCache[key];
        let url = null;
        try {
            if (window.ms) {
                const sym = new window.ms.Symbol(sidc, { size: size || 40, strokeWidth: 2 });
                const svg = sym.asSVG();
                url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
            }
        } catch (_) {}
        if (!url) url = fallbackIcon(sidc);
        _imgCache[key] = url;
        return url;
    }

    function fallbackIcon(sidc) {
        // Determine side from SIDC position 2 (S=unknown,H=hostile,F=friendly,N=neutral)
        const affil = sidc ? sidc[1] : '';
        const color = (affil === 'H' || affil === 'h') ? '#d23a3a'
                    : (affil === 'F' || affil === 'f') ? '#3a96d2' : '#888';
        const letter = (affil === 'H' || affil === 'h') ? 'R' : 'B';
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
            <rect x="1" y="1" width="30" height="30" rx="3"
                  fill="${color}" stroke="#fff" stroke-width="1.5"/>
            <text x="16" y="22" font-size="16" font-weight="bold" fill="#fff"
                  text-anchor="middle" font-family="sans-serif">${letter}</text>
        </svg>`;
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    function pinIcon(color) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">
            <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24S24 21 24 12C24 5.4 18.6 0 12 0z"
                  fill="${color}" stroke="#fff" stroke-width="1.5"/>
            <circle cx="12" cy="12" r="5" fill="#fff" fill-opacity="0.9"/>
        </svg>`;
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    }

    // ── Cesium init ──────────────────────────────────────────────────────
    function ensureInit() {
        if (viewer) return true;
        if (typeof Cesium === 'undefined') return false;
        const el = document.getElementById('cesium-container');
        if (!el) return false;

        // No Ion token — uses basic ellipsoid terrain (offline-safe).
        // To enable photorealistic terrain: set Cesium.Ion.defaultAccessToken
        // to your token and replace EllipsoidTerrainProvider with
        // Cesium.createWorldTerrain().
        Cesium.Ion.defaultAccessToken = '';

        viewer = new Cesium.Viewer('cesium-container', {
            terrainProvider:       new Cesium.EllipsoidTerrainProvider(),
            baseLayerPicker:       false,
            navigationHelpButton:  false,
            sceneModePicker:       false,
            homeButton:            false,
            geocoder:              false,
            fullscreenButton:      false,
            timeline:              false,
            animation:             false,
            infoBox:               false,
            selectionIndicator:    false,
            creditContainer:       document.createElement('div'),
        });

        // Add NaturalEarthII imagery — bundled with Cesium.js, works offline.
        // baseLayerPicker:false removes the default Bing layer so we must
        // add one explicitly or the globe renders as black space.
        try {
            viewer.imageryLayers.addImageryProvider(
                new Cesium.TileMapServiceImageryProvider({
                    url: Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII'),
                })
            );
        } catch (_) {
            viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#1b3a5c');
        }

        // Dark military tint
        viewer.scene.globe.enableLighting = false;
        viewer.scene.backgroundColor      = Cesium.Color.fromCssColorString('#0a0e1a');
        viewer.scene.globe.baseColor       = Cesium.Color.fromCssColorString('#1b2535');
        const baseLayer = viewer.imageryLayers.get(0);
        if (baseLayer) baseLayer.brightness = 0.72;

        // Click-to-place handler
        viewer.screenSpaceEventHandler.setInputAction((evt) => {
            if (!inPlaceMode || !placeCb) return;
            try {
                const cart = viewer.scene.pickPosition(evt.position);
                if (cart) {
                    const c = Cesium.Cartographic.fromCartesian(cart);
                    inPlaceMode = false;
                    el.style.cursor = '';
                    placeCb({
                        lon: Cesium.Math.toDegrees(c.longitude),
                        lat: Cesium.Math.toDegrees(c.latitude),
                        alt: c.height,
                    });
                }
            } catch (_) {}
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        return true;
    }

    // ── Draw scenario ────────────────────────────────────────────────────
    function drawScenario(scenario) {
        if (!ensureInit()) return false;
        clearScenario();
        if (!scenario) return false;
        scenarioRef = scenario;

        // OBJ
        if (scenario.obj && Array.isArray(scenario.obj.coord)) {
            const [lon, lat] = scenario.obj.coord;
            _addEntity('OBJ', Cesium.Cartesian3.fromDegrees(lon, lat, 0), {
                billboard: {
                    image:           pinIcon('#d23a3a'),
                    width:  32, height: 32,
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                    verticalOrigin:  Cesium.VerticalOrigin.BOTTOM,
                },
                label: _label(scenario.obj.id || 'OBJ NASSER', '#d23a3a', -38),
            });
        }

        // BLS markers
        for (const bls of (scenario.bls_template || [])) {
            if (!Array.isArray(bls.coord)) continue;
            const [lon, lat] = bls.coord;
            _addEntity('BLS_' + bls.id, Cesium.Cartesian3.fromDegrees(lon, lat, 0), {
                billboard: {
                    image:           pinIcon('#e8a23a'),
                    width:  26, height: 26,
                    heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                    verticalOrigin:  Cesium.VerticalOrigin.BOTTOM,
                },
                label: _label(bls.id, '#e8a23a', -30),
            });
        }

        // Units
        function placeUnit(unit, side) {
            if (!unit || !unit.uid) return;
            const sidc = unit.sidc || (side === 'RED' ? 'SHG---------' : 'SFG---------');
            const img  = billboardFor(sidc, 42);
            const coord = unit.coord || unit.appear_coord || [0, 0];
            const [lon, lat] = coord;
            const alt  = altFor(unit);
            const key  = side + '_' + unit.uid;
            _addEntity(key, Cesium.Cartesian3.fromDegrees(lon, lat, alt), {
                billboard: {
                    image:           img,
                    width:  40, height: 40,
                    heightReference: heightRefFor(unit),
                    verticalOrigin:  Cesium.VerticalOrigin.BOTTOM,
                    color:           Cesium.Color.WHITE,
                },
                label: {
                    text:            unit.label || unit.uid,
                    font:            '10px sans-serif',
                    fillColor:       side === 'RED'
                                     ? Cesium.Color.fromCssColorString('#ff8a8a')
                                     : Cesium.Color.fromCssColorString('#8ac8ff'),
                    outlineColor:    Cesium.Color.BLACK,
                    outlineWidth:    2,
                    style:           Cesium.LabelStyle.FILL_AND_OUTLINE,
                    pixelOffset:     new Cesium.Cartesian2(0, -46),
                    heightReference: heightRefFor(unit),
                    show:            false,
                },
                _wgUnit: unit,
                _wgSide: side,
            });
        }

        for (const u of (scenario.red_units           || [])) placeUnit(u, 'RED');
        for (const u of (scenario.blue_units_initial  || [])) placeUnit(u, 'BLUE');

        // Fly camera to scenario bounds
        if (scenario.map_bbox) {
            const [w, s, e, n] = scenario.map_bbox;
            viewer.camera.flyTo({
                destination: Cesium.Rectangle.fromDegrees(w, s, e, n),
                duration:    2.0,
            });
        }

        return true;
    }

    // ── Apply per-step state ─────────────────────────────────────────────
    function applyState(state, scenario) {
        if (!viewer || !isVisible || !state) return;
        const sc = scenario || scenarioRef;
        if (!sc) return;

        clearArcs();
        const stepIndex = Number.isFinite(state.step_index) ? state.step_index : 0;

        // ── Move units ──────────────────────────────────────────────────
        // Prefer reading positions from the 2D map's markers (already computed
        // by the movement model) so both views stay perfectly in sync.
        function syncUnit(uid, side, unit) {
            const entity = unitEntities[side + '_' + uid];
            if (!entity) return;

            let lon = null, lat = null;

            // 1. Try to read from the 2D Leaflet marker
            try {
                const map2d = window.AppAdjudicatorMap;
                if (map2d && map2d.getScenarioMarkers) {
                    const markers = map2d.getScenarioMarkers();
                    const m = markers && (markers[uid] || markers[side + '_' + uid]);
                    if (m && m.getLatLng) { const ll = m.getLatLng(); lon = ll.lng; lat = ll.lat; }
                }
            } catch (_) {}

            // 2. Fall back to scenario step-coord arrays
            if (lon === null) {
                const table = side === 'RED' ? sc.red_unit_step_coords : sc.blue_unit_step_coords;
                const steps = table && table[uid];
                if (steps) {
                    const coord = steps[Math.min(stepIndex, steps.length - 1)];
                    if (coord && coord.length >= 2) { lon = coord[0]; lat = coord[1]; }
                }
            }

            if (lon === null) return;
            const alt = altFor(unit);
            entity.position = new Cesium.ConstantPositionProperty(
                Cesium.Cartesian3.fromDegrees(lon, lat, alt)
            );

            // Destroyed → grayscale + semi-transparent
            const destroyedSet = state.blue_destroyed_cumulative ||
                (state.per_unit_deltas && state.per_unit_deltas.blue_destroyed) || [];
            const redDegradedSet = state.per_unit_deltas && state.per_unit_deltas.red_degraded || [];
            const isDead = destroyedSet.includes(uid) || redDegradedSet.includes(uid);
            entity.billboard.color = new Cesium.ConstantProperty(
                isDead ? Cesium.Color.GRAY.withAlpha(0.35) : Cesium.Color.WHITE
            );
        }

        for (const u of (sc.red_units          || [])) syncUnit(u.uid, 'RED',  u);
        for (const u of (sc.blue_units_initial || [])) syncUnit(u.uid, 'BLUE', u);

        // ── Engagement arcs ──────────────────────────────────────────────
        const stepRow = Array.isArray(sc.steps) ? sc.steps[stepIndex] : null;
        const arcs    = (stepRow && Array.isArray(stepRow.engagement_arcs))
                        ? stepRow.engagement_arcs : [];

        const ARC_COLORS = {
            destroyed:       '#ef4444', damaged_partial: '#f97316',
            suppressed:      '#eab308', delayed:         '#a855f7',
            expended:        '#3b82f6', unchanged:       '#6b7280',
        };

        for (let i = 0; i < arcs.length; i++) {
            const arc = arcs[i];
            if (!arc || !Array.isArray(arc.coordinates) || arc.coordinates.length < 2) continue;
            const [src, dst] = arc.coordinates;
            if (!src || !dst) continue;
            const color  = ARC_COLORS[arc.status_change] || ARC_COLORS.unchanged;
            const dmg    = Number.isFinite(arc.damage_pct) ? arc.damage_pct : 0.3;
            const peakAlt = 6000 + dmg * 14000;

            // Build parabolic path: 24 segments between [lon,lat]
            const pts = parabolaPoints([src[0], src[1]], [dst[0], dst[1]], peakAlt, 24);

            const e = viewer.entities.add({
                polyline: {
                    positions:     Cesium.Cartesian3.fromDegreesArrayHeights(pts),
                    width:         2 + Math.round(dmg * 3),
                    material:      new Cesium.PolylineGlowMaterialProperty({
                        glowPower: 0.3,
                        color:     Cesium.Color.fromCssColorString(color),
                    }),
                    clampToGround: false,
                },
            });
            arcEntities.push(e);

            // Fade-out after 2 s (staggered like the 2D arcs)
            setTimeout(() => {
                try { if (viewer) viewer.entities.remove(e); } catch (_) {}
                const idx = arcEntities.indexOf(e);
                if (idx >= 0) arcEntities.splice(idx, 1);
            }, 2000 + i * 150);
        }
    }

    // ── Parabola point generator ─────────────────────────────────────────
    // Returns a flat [lon,lat,alt, lon,lat,alt, …] array suitable for
    // Cesium.Cartesian3.fromDegreesArrayHeights().
    function parabolaPoints(srcLonLat, dstLonLat, peakAltM, n) {
        const flat = [];
        for (let i = 0; i <= n; i++) {
            const t   = i / n;
            const lon = srcLonLat[0] + (dstLonLat[0] - srcLonLat[0]) * t;
            const lat = srcLonLat[1] + (dstLonLat[1] - srcLonLat[1]) * t;
            const alt = 4 * peakAltM * t * (1 - t);
            flat.push(lon, lat, alt);
        }
        return flat;
    }

    // ── Cleanup ──────────────────────────────────────────────────────────
    function clearArcs() {
        for (const e of arcEntities) {
            try { if (viewer) viewer.entities.remove(e); } catch (_) {}
        }
        arcEntities.length = 0;
    }

    function clearScenario() {
        if (!viewer) return;
        viewer.entities.removeAll();
        Object.keys(unitEntities).forEach(k => delete unitEntities[k]);
        clearArcs();
        scenarioRef = null;
    }

    // ── Visibility ───────────────────────────────────────────────────────
    // Returns true when the view is ready (Cesium initialised), false on error.
    async function setVisible(show) {
        const cEl   = document.getElementById('cesium-container');
        const mapEl = document.getElementById('map');
        if (!cEl) return false;

        if (!show) {
            isVisible = false;
            cEl.style.cssText = 'display:none;position:absolute;inset:0;z-index:2;';
            if (mapEl) mapEl.style.display = '';
            return true;
        }

        // Hide map immediately; show loading state
        if (mapEl) mapEl.style.display = 'none';
        cEl.style.cssText = 'display:flex;align-items:center;justify-content:center;position:absolute;inset:0;z-index:2;background:#0a0e1a;';
        cEl.innerHTML = `<div style="color:#7aaecc;font-size:13px;text-align:center;">
            <div style="font-size:32px;margin-bottom:12px;">🌐</div>
            Loading 3D globe…
        </div>`;
        isVisible = true;

        const loaded = await loadCesiumAssets();
        if (!loaded) {
            cEl.style.cssText = 'display:flex;align-items:center;justify-content:center;position:absolute;inset:0;z-index:2;background:#0a0e1a;';
            cEl.innerHTML = `<div style="color:#9ab;font-size:13px;text-align:center;padding:24px;max-width:360px;">
                <div style="font-size:24px;margin-bottom:10px;">🌐</div>
                <strong>Cesium not loaded</strong><br><br>
                Requires an internet connection on first use (CDN).<br><br>
                <button onclick="window.AppCesiumView.setVisible(false)"
                    style="padding:4px 14px;cursor:pointer;border:1px solid #7aaecc;background:transparent;color:#7aaecc;border-radius:4px;">
                    Back to 2D</button>
            </div>`;
            return false;
        }

        // ── Clear spinner FIRST, then create the Cesium viewer ──
        // ensureInit() calls new Cesium.Viewer(el) which appends its own
        // canvas. If we clear innerHTML after, we destroy that canvas.
        cEl.innerHTML = '';
        cEl.style.cssText = 'display:block;position:absolute;inset:0;z-index:2;';

        if (!ensureInit()) {
            cEl.style.cssText = 'display:flex;align-items:center;justify-content:center;position:absolute;inset:0;z-index:2;background:#0a0e1a;';
            cEl.innerHTML = `<div style="color:#f87;font-size:13px;padding:24px;">Cesium viewer failed to initialise.</div>`;
            return false;
        }

        return true;
    }

    async function toggle() { return await setVisible(!isVisible); }

    // ── Click-to-place ───────────────────────────────────────────────────
    function enterPlaceMode(callback) {
        if (!ensureInit()) return;
        inPlaceMode = true;
        placeCb     = callback;
        const cEl = document.getElementById('cesium-container');
        if (cEl) cEl.style.cursor = 'crosshair';
    }

    // ── Internal helpers ─────────────────────────────────────────────────
    function _addEntity(id, position, extras) {
        const e = viewer.entities.add(Object.assign({ id, position }, extras));
        unitEntities[id] = e;
        return e;
    }

    function _label(text, color, yOffset) {
        return {
            text,
            font:            '11px monospace',
            fillColor:       Cesium.Color.fromCssColorString(color),
            outlineColor:    Cesium.Color.BLACK,
            outlineWidth:    2,
            style:           Cesium.LabelStyle.FILL_AND_OUTLINE,
            pixelOffset:     new Cesium.Cartesian2(0, yOffset || -30),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        };
    }

    // ── Public API ───────────────────────────────────────────────────────
    window.AppCesiumView = {
        drawScenario,
        applyState,
        clearScenario,
        setVisible,
        toggle,
        enterPlaceMode,
        loadCesiumAssets,
        get isVisible() { return isVisible; },
    };
})();
