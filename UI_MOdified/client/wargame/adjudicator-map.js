/**
 * Adjudicator map overlay.
 *
 * Visualizes the scenario on the Leaflet map and applies per-step state to
 * existing markers:
 *   - Draws 4 BLS markers (semi-circles, colored by status)
 *   - Draws OBJ NASSER marker (colored by objective_status)
 *   - Draws the pipeline route (purple dashed polyline)
 *   - Drops the 11 Red unit markers near their assigned BLS
 *   - For each per_unit_deltas.blue_destroyed: finds the existing Blue marker
 *     on the map by code/name/textModifiers and fades it (opacity 0.25,
 *     adds CSS class wg-destroyed)
 *   - Updates BLS status colors
 *
 * Public surface: window.AppAdjudicatorMap = {
 *   drawScenario(scenario), clearScenario(), applyState(state), resetMap()
 * }
 *
 * The module is defensive about window.map availability — if Leaflet isn't
 * ready it falls back to no-ops so the HUD still works for text-only mode.
 */
(function () {
    'use strict';

    const COLORS = {
        BLS: {
            STAGED:    '#888',
            CONTESTED: '#e8a23a',
            SECURE:    '#4caf50',
            LIMITED:   '#c2a93a',
            DENIED:    '#d23a3a',
        },
        OBJ: {
            DORMANT:    '#888',
            THREATENED: '#e8a23a',
            CONTESTED:  '#d2a23a',
            CAPTURED:   '#d23a3a',
            DENIED:     '#3a96d2',
        },
        PIPELINE: '#a45ec8',
        RED_UNIT: '#d23a3a',
        BLUE_UNIT: '#3a96d2',
    };

    let layerGroup = null;       // L.layerGroup of scenario overlays
    let blsMarkers = {};         // { 'BLS-1': L.marker }
    let objMarker  = null;
    let pipelineLine = null;     // full planned route (purple dashed)
    let pipelineAdvanced = null; // section Red has already reached (solid red)
    let advanceTip = null;       // arrow marker at current advance tip
    let redMarkers = {};         // { 'RED_xxx': L.marker }
    let blueMarkers = {};        // { 'BLUE_xxx': L.marker }
    let pipelineLatLngs = null;  // cached lat/lng array for split computation
    let pipelineSegmentKm = null;// cached cumulative km along pipeline per vertex
    let legendControl = null;    // Leaflet control (top-right legend panel)
    let sitrepControl = null;    // Leaflet control (top-left SITREP banner)
    let ewHalo = null;           // circle around RED_405EW sized by EW band
    let contactHalo = null;      // circle around most recent destroyed Blue
    let aoLayers = [];           // dashed blue polygons for AO boundaries
    let advanceArrows = [];      // L.polylines with arrow tips, BLS → tip
    let aorPhaseLine = null;     // dashed yellow line across AOR at current PL
    let salientLayer = null;     // red-tinted penetration polygon

    // Scenario-derived context, populated in drawScenario so applyState can
    // recompute unit positions per step (mirrors wargame.py red_position()).
    let scenarioRef    = null;
    let blsCoordByName = {};     // { 'BLS-1': [lon,lat] }
    let objCoord       = null;   // [lon, lat]
    let objDepthKm     = 95;     // OBJ NASSER nominal depth from coast

    // ── km / lon-lat helpers (mirror wargame.py offset_lonlat / lerp) ─
    // We work in [lon, lat] inside this block so it ports 1:1 from the
    // Python reference. Final hand-off to Leaflet is [lat, lng].
    const KM_PER_DEG_LAT = 110.57;
    function kmPerDegLng(lat) { return 111.32 * Math.cos(lat * Math.PI / 180); }
    function offsetLonLat(coord, eastKm, northKm) {
        const lon = coord[0], lat = coord[1];
        return [
            lon + (eastKm  || 0) / kmPerDegLng(lat),
            lat + (northKm || 0) / KM_PER_DEG_LAT,
        ];
    }
    function lerpLonLat(a, b, t) {
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    function clamp01(x) { return Math.max(0, Math.min(1, x)); }

    // Sea offsets per BLS (from wargame.py red_position / sea_offsets).
    // Each value is [eastKm, northKm] from the BLS centroid; positive north
    // = further offshore. Units staged here before their appear-step.
    const BLS_SEA_OFFSETS = {
        'BLS-1': [-2, 12],
        'BLS-2': [ 0, 11],
        'BLS-3': [ 2,  9],
        'BLS-4': [ 3,  6],
    };

    // Per-unit spread offsets (in km) applied to the post-step-3 lerp
    // position so a stack of brigades at the same BLS fans out instead of
    // sitting on top of each other. Mirrors wargame.py `spread` dict.
    const RED_UNIT_SPREAD = {
        RED_401RECON: [ 5.0, -4.5],
        RED_41MECH:   [-6.0,  1.0],
        RED_42MECH:   [-2.2, -1.8],
        RED_43MECH:   [ 2.2,  1.0],
        RED_44ARMD:   [ 9.0,  8.0],
        RED_9MID:     [-8.0, -6.0],
        RED_1AD:      [-8.0,  2.0],
    };

    // Per-step Blue actions (deterministic mirror of wargame.py make_steps
    // second branch — the Wargame2 baseline). Keys are step_index → { base_id
    // → 'COUNTERATTACK' | 'WITHDRAW' }. The reservoir of counter-attacking
    // units widens as the operation deepens.
    const BLUE_ACTIONS_BY_STEP = {
        4:  { lc: 'COUNTERATTACK', p21c: 'COUNTERATTACK', p22c: 'COUNTERATTACK', p23c: 'COUNTERATTACK' },
        5:  { lc: 'COUNTERATTACK', p21c: 'COUNTERATTACK', p22c: 'COUNTERATTACK', p23c: 'COUNTERATTACK' },
        6:  { lc: 'COUNTERATTACK', p21c: 'COUNTERATTACK', p22c: 'COUNTERATTACK', p23c: 'COUNTERATTACK' },
        7:  { lc: 'COUNTERATTACK', p21c: 'COUNTERATTACK', p22c: 'COUNTERATTACK', p23c: 'COUNTERATTACK' },
        8:  { lc: 'COUNTERATTACK', p21c: 'COUNTERATTACK', p22c: 'COUNTERATTACK', p23c: 'COUNTERATTACK' },
        9:  { lc: 'COUNTERATTACK', p21c: 'COUNTERATTACK', p22c: 'COUNTERATTACK', p23c: 'COUNTERATTACK',
              p31c: 'COUNTERATTACK', p32c: 'COUNTERATTACK', p33c: 'COUNTERATTACK' },
        10: { lc: 'COUNTERATTACK', p21c: 'COUNTERATTACK', p22c: 'COUNTERATTACK', p23c: 'COUNTERATTACK',
              p31c: 'COUNTERATTACK', p32c: 'COUNTERATTACK', p33c: 'COUNTERATTACK' },
        11: { lc: 'COUNTERATTACK', p21c: 'COUNTERATTACK', p22c: 'COUNTERATTACK', p23c: 'COUNTERATTACK',
              p31c: 'COUNTERATTACK', p32c: 'COUNTERATTACK', p33c: 'COUNTERATTACK' },
    };
    const BLUE_COUNTERATTACK_KM_NORTH = 5.0;   // +N km push during the riposte
    const BLUE_WITHDRAW_KM_NORTH      = -5.0;  // -N km fallback (south)

    // Compute progress 0..1 from the per-step state. We use phase_line_km /
    // objDepthKm — same idiom as wargame.py (step.progress drives every
    // unit position). Falls back to step_index/11 when PL is missing.
    function progressFromState(state) {
        if (!state) return 0;
        if (Number.isFinite(state.progress)) return clamp01(state.progress);
        if (Number.isFinite(state.phase_line_km) && objDepthKm > 0) {
            return clamp01(state.phase_line_km / objDepthKm);
        }
        if (Number.isFinite(state.step_index)) return clamp01(state.step_index / 11);
        return 0;
    }

    // Port of wargame.py red_position(). Returns [lon, lat]. Roles drive
    // both the appear-time offshore staging and the per-step progress cap
    // (Fixing 0.35, Support 0.55, Follow-on idle until step 6, etc.).
    function redPositionLonLat(meta, stepIndex, progress) {
        const blsCoord = blsCoordByName[meta.bls];
        if (!blsCoord || !objCoord) return meta.baseCoord;
        const role = String(meta.role || '');

        // Static-role support: never advance toward OBJ.
        if (role === 'EW')              return offsetLonLat(blsCoord,  4, 3);
        if (role === 'Fire support')    return offsetLonLat(blsCoord, -5, 3);
        if (role === 'Explosive USVs')  return offsetLonLat(blsCoord,  0, 4);
        if (role === 'CBRN defense')    return offsetLonLat(blsCoord,  0, 3);

        const seaOffset = BLS_SEA_OFFSETS[meta.bls] || [0, 10];
        const sea = offsetLonLat(blsCoord, seaOffset[0], seaOffset[1]);

        // Pre-appear: unit still at offshore staging.
        if (stepIndex < (meta.appear || 0)) return sea;

        // Steps 0..2: lerp from sea to the coastal foothold (-1.2 km N of BLS).
        if (stepIndex <= 2) {
            const t = Math.min(1, progress / 0.02);
            return lerpLonLat(sea, offsetLonLat(blsCoord, 0, -1.2), t);
        }

        // Role-based progress cap.
        let unitProgress = progress;
        if (role === 'Fixing')                                 unitProgress = Math.min(progress, 0.35);
        else if (role === 'Support')                           unitProgress = Math.min(progress, 0.55);
        else if (role === 'Recon')                             unitProgress = Math.min(1.0, progress + 0.08);
        else if (role === 'Follow-on'    && stepIndex < 6)     unitProgress = 0;
        else if (role === 'Exploitation' && stepIndex < 8)     unitProgress = 0;

        let pos = lerpLonLat(blsCoord, objCoord, unitProgress);
        const spread = RED_UNIT_SPREAD[meta.uid];
        if (stepIndex >= 3 && spread) {
            pos = offsetLonLat(pos, spread[0], spread[1]);
        }
        return pos;
    }

    // Port of wargame.py blue_position(). COUNTERATTACK shifts +5 km N for
    // the duration of the step, WITHDRAW shifts -5 km N. All other Blue
    // units hold their base coord (AREA_DEFENSE).
    function bluePositionLonLat(meta, stepIndex) {
        if (!meta || !meta.baseCoord) return meta && meta.baseCoord;
        const actions = BLUE_ACTIONS_BY_STEP[stepIndex] || null;
        const action = actions ? actions[meta.baseId] : null;
        if (action === 'COUNTERATTACK') return offsetLonLat(meta.baseCoord, 0, BLUE_COUNTERATTACK_KM_NORTH);
        if (action === 'WITHDRAW')      return offsetLonLat(meta.baseCoord, 0, BLUE_WITHDRAW_KM_NORTH);
        return meta.baseCoord;
    }

    // Map of "destroyed" effects on existing user-placed Blue markers,
    // keyed by their Leaflet marker._leaflet_id so we can restore on reset.
    const destroyedMarkers = new Map();

    function hasMap() { return typeof window !== 'undefined' && window.L && window.map; }

    // Inject a single <style> tag so destroyed-marker fades animate smoothly
    // instead of jumping. Runs once per page load.
    (function injectStyles() {
        if (typeof document === 'undefined' || document.getElementById('wg-adj-styles')) return;
        const style = document.createElement('style');
        style.id = 'wg-adj-styles';
        style.textContent = `
            .wg-adj-sidc,
            .wg-adj-diamond,
            .wg-adj-square,
            .wg-adj-dot {
                transition: opacity 600ms ease-in-out, filter 600ms ease-in-out;
            }
            .wg-adj-advance-tip {
                animation: wg-adj-pulse 1.4s ease-in-out infinite;
            }
            @keyframes wg-adj-pulse {
                0%, 100% { transform: scale(1);   opacity: 1; }
                50%      { transform: scale(1.3); opacity: .7; }
            }
        `;
        document.head.appendChild(style);
    })();

    // Pure haversine — keep in this module so we don't depend on app.js helpers.
    function haversineKm(a, b) {
        const R = 6371;
        const toRad = d => d * Math.PI / 180;
        const dLat = toRad(b[0] - a[0]);
        const dLon = toRad(b[1] - a[1]);
        const la1  = toRad(a[0]);
        const la2  = toRad(b[0]);
        const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
    }

    // Interpolate a point along the cached pipeline at depthKm from the
    // coast (vertex 0). Returns null if pipeline isn't loaded or depth is
    // outside the route length.
    function pointAlongPipeline(depthKm) {
        if (!pipelineLatLngs || !pipelineSegmentKm) return null;
        if (depthKm <= 0) return pipelineLatLngs[0];
        const totalKm = pipelineSegmentKm[pipelineSegmentKm.length - 1];
        if (depthKm >= totalKm) return pipelineLatLngs[pipelineLatLngs.length - 1];
        for (let i = 1; i < pipelineSegmentKm.length; i++) {
            if (pipelineSegmentKm[i] >= depthKm) {
                const segStart = pipelineSegmentKm[i - 1];
                const segLen   = pipelineSegmentKm[i] - segStart;
                const t        = (depthKm - segStart) / Math.max(1e-9, segLen);
                const a = pipelineLatLngs[i - 1];
                const b = pipelineLatLngs[i];
                return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
            }
        }
        return null;
    }

    // Slice the cached pipeline lat/lng list into the segment from coast to
    // depthKm. Inserts an interpolated point at exactly depthKm so the
    // visual advance ends precisely there.
    function pipelineUpTo(depthKm) {
        if (!pipelineLatLngs || !pipelineSegmentKm) return [];
        const out = [pipelineLatLngs[0]];
        for (let i = 1; i < pipelineLatLngs.length; i++) {
            if (pipelineSegmentKm[i] < depthKm) {
                out.push(pipelineLatLngs[i]);
            } else {
                const tip = pointAlongPipeline(depthKm);
                if (tip) out.push(tip);
                break;
            }
        }
        return out;
    }

    // ── Marker icon helpers ──────────────────────────────────────────
    function dotIcon(color, label, size) {
        size = size || 20;
        return window.L.divIcon({
            html: `<div style="
                width:${size}px;height:${size}px;border-radius:50%;
                background:${color};border:2px solid #fff;
                color:#fff;font-size:9px;line-height:${size - 2}px;
                text-align:center;font-weight:700;
                box-shadow:0 0 4px rgba(0,0,0,.6);
            ">${label || ''}</div>`,
            className: 'wg-adj-dot',
            iconSize:   [size, size],
            iconAnchor: [size / 2, size / 2],
        });
    }

    // Doctrinal amphibious-landing-site graphic. A half-circle sitting on
    // the beach with the curved side facing the sea — flat bottom is the
    // shoreline, the unit advances inland from the top half. Color encodes
    // status (STAGED/CONTESTED/SECURE/LIMITED/DENIED).
    function blsIcon(color, label) {
        const w = 32, h = 18;
        return window.L.divIcon({
            html: `<div style="position:relative;width:${w}px;height:${h + 8}px;">
                <div style="
                    position:absolute;top:0;left:0;
                    width:${w}px;height:${h}px;
                    background:${color};
                    border:2px solid #fff;
                    border-bottom:none;
                    border-top-left-radius:${w}px;
                    border-top-right-radius:${w}px;
                    box-shadow:0 0 4px rgba(0,0,0,.5);
                "></div>
                <div style="
                    position:absolute;top:1px;left:0;width:${w}px;
                    text-align:center;font-size:10px;color:#fff;font-weight:700;
                    text-shadow:0 0 3px #000;line-height:${h - 2}px;
                ">${label || ''}</div>
            </div>`,
            className: 'wg-adj-bls',
            iconSize:   [w, h + 8],
            iconAnchor: [w / 2, h],  // anchor at the bottom-center (beach line)
        });
    }

    function diamondIcon(color, label) {
        return window.L.divIcon({
            html: `<div style="
                width:18px;height:18px;background:${color};
                transform:rotate(45deg);border:2px solid #fff;
                box-shadow:0 0 4px rgba(0,0,0,.6);
            "></div><div style="
                position:absolute;top:20px;left:-10px;width:40px;
                text-align:center;font-size:10px;color:#fff;
                text-shadow:0 0 3px #000;font-weight:700;
            ">${label || ''}</div>`,
            className: 'wg-adj-diamond',
            iconSize:   [18, 18],
            iconAnchor: [9, 9],
        });
    }

    function squareIcon(color, label, size) {
        size = size || 14;
        return window.L.divIcon({
            html: `<div style="
                width:${size}px;height:${size}px;background:${color};
                border:2px solid #fff;
                box-shadow:0 0 3px rgba(0,0,0,.5);
            "></div><div style="
                position:absolute;top:${size + 2}px;left:-12px;width:${size + 24}px;
                text-align:center;font-size:9px;color:#fff;
                text-shadow:0 0 3px #000;font-weight:600;
            ">${label || ''}</div>`,
            className: 'wg-adj-square',
            iconSize:   [size, size],
            iconAnchor: [size / 2, size / 2],
        });
    }

    // Render a real NATO APP-6 / SIDC icon via the milsymbol lib the app
    // already ships with. Used for Blue defender units so they look the
    // same as the operator's own placed markers. Returns null on failure
    // (caller falls back to squareIcon).
    function sidcIcon(sidc, size) {
        if (!sidc || !window.ms || typeof window.ms.Symbol !== 'function') return null;
        try {
            const sym = new window.ms.Symbol(sidc, { size: size || 30, simpleStatusModifier: true });
            if (!sym.isValid()) return null;
            const anchor = sym.getAnchor();
            const dim    = sym.getSize();
            return window.L.divIcon({
                className: 'units-map-marker wg-adj-sidc',
                html:      sym.asSVG(),
                iconAnchor:[anchor.x, anchor.y],
                iconSize:  [dim.width, dim.height],
            });
        } catch (_) { return null; }
    }

    // Icon size by Blue echelon — division biggest, company smallest.
    function blueIconSize(echelon) {
        switch (echelon) {
            case 'division':  return 38;
            case 'brigade':   return 34;
            case 'battalion': return 30;
            default:          return 26; // company
        }
    }

    // Derive a hostile (APP-6 affiliation digit 6) SIDC for a Red unit. We
    // mirror the Blue template patterns the operator's app uses, so the
    // renderer produces matching military-symbology rectangles with the
    // correct size modifier (`I`/`II`/`X`/`XX`).
    function redSidcFor(unit) {
        const role = String(unit.role || '').toLowerCase();
        const ech  = String(unit.echelon || '').toLowerCase();
        // Pick echelon code (positions 9-10) and HQ/TF flag (positions 7-8)
        // matching the Blue patterns:
        //   company   '00 15'  bn '02 16'  bde '02 18'  div '02 21'
        let hqEch;
        if (ech === 'division')      hqEch = '0221';
        else if (ech === 'brigade')  hqEch = '0218';
        else if (ech === 'battalion')hqEch = '0216';
        else                         hqEch = '0015'; // company / support

        // Main icon (positions 11-16) + modifiers (17-20). Defaults to
        // mechanized infantry like the Blue templates; overrides by role:
        let iconMod = '1211020000'; // mech infantry
        if (/recon/.test(role))                 iconMod = '1211050000'; // armored recon
        else if (/armored|exploit/.test(role))  iconMod = '1211030000'; // armor
        else if (/fire|arty|art/.test(role))    iconMod = '1303000000'; // field arty
        else if (/ew/.test(role))               iconMod = '1300000000'; // generic comm/ew
        else if (/cbrn|chem/.test(role))        iconMod = '1417000000'; // CBRN
        else if (/usv/.test(role))              iconMod = '1211000000'; // generic (USVs)

        // Positions 1-6: '10 06 10'  (version, hostile, land)
        // Positions 7-10: hqEch     (HQ flag + echelon, e.g. '0218')
        // Positions 11-20: iconMod  (main icon + mods, e.g. '1211020000')
        return '100610' + hqEch + iconMod;
    }

    // Red unit icon size matches APP-6 default — slightly larger for higher
    // echelons. Visually parity with Blue: division big, company small.
    function redIconSize(echelon) {
        switch (echelon) {
            case 'division':  return 38;
            case 'brigade':   return 34;
            case 'battalion': return 30;
            default:          return 26; // support / company
        }
    }

    function targetIcon(color, label) {
        return window.L.divIcon({
            html: `<div style="
                width:30px;height:30px;border-radius:50%;
                border:3px solid ${color};background:rgba(0,0,0,.35);
                position:relative;
            ">
                <div style="position:absolute;top:13px;left:-2px;width:34px;height:2px;background:${color};"></div>
                <div style="position:absolute;left:13px;top:-2px;width:2px;height:34px;background:${color};"></div>
            </div><div style="
                position:absolute;top:32px;left:-12px;width:54px;
                text-align:center;font-size:10px;color:#fff;
                text-shadow:0 0 3px #000;font-weight:700;
            ">${label || ''}</div>`,
            className: 'wg-adj-obj',
            iconSize:   [30, 30],
            iconAnchor: [15, 15],
        });
    }

    // ── Draw the scenario ────────────────────────────────────────────
    function drawScenario(scenario) {
        if (!hasMap() || !scenario) return false;
        clearScenario();

        // Capture scenario-level references the per-step movement model needs.
        scenarioRef    = scenario;
        blsCoordByName = {};
        for (const b of (scenario.bls_template || [])) {
            if (b && b.name && Array.isArray(b.coord)) blsCoordByName[b.name] = b.coord;
        }
        objCoord   = (scenario.obj && Array.isArray(scenario.obj.coord)) ? scenario.obj.coord : null;
        objDepthKm = (scenario.obj && Number.isFinite(scenario.obj.target_depth_km))
                     ? scenario.obj.target_depth_km : 95;

        layerGroup = window.L.layerGroup().addTo(window.map);

        // AO boundaries — dashed blue trapezoidal polygons showing the
        // Blue brigade rear and the two battalion flanks. Same source as
        // the Python renders (nato-map-layers.geojson, autoFlank metadata).
        for (const ao of (scenario.ao_boundaries || [])) {
            const polys = ao.type === 'MultiPolygon' ? ao.coordinates : [ao.coordinates];
            for (const poly of polys) {
                for (const ring of poly) {
                    const latlngs = ring.map(c => [c[1], c[0]]);
                    const line = window.L.polygon(latlngs, {
                        color: '#5da9e8',
                        weight: 1.5,
                        opacity: 0.7,
                        dashArray: '4 4',
                        fillColor: '#3a96d2',
                        fillOpacity: 0.05,
                        interactive: false,
                    }).bindTooltip(`AO: ${ao.role} (${ao.lengthKm || '?'} km)`, { sticky: true });
                    line.addTo(layerGroup);
                    aoLayers.push(line);
                }
            }
        }

        // BLS markers — NATO doctrinal amphibious-landing semicircles.
        for (const bls of scenario.bls_template || []) {
            const m = window.L.marker(
                [bls.coord[1], bls.coord[0]],
                { icon: blsIcon(COLORS.BLS.STAGED, bls.name.replace('BLS-', '')), title: `${bls.name} — ${bls.role}` },
            ).bindTooltip(`${bls.name} (${bls.role}) — STAGED`, { permanent: false });
            m.addTo(layerGroup);
            blsMarkers[bls.name] = m;
        }

        // OBJ NASSER
        const obj = scenario.obj;
        if (obj && obj.coord) {
            objMarker = window.L.marker(
                [obj.coord[1], obj.coord[0]],
                { icon: targetIcon(COLORS.OBJ.DORMANT, obj.name), title: obj.name },
            ).bindTooltip(`${obj.name} — DORMANT (CARVER ${obj.carver}/60)`, { permanent: false });
            objMarker.addTo(layerGroup);
        }

        // Pipeline route (purple dashed) — full planned Red advance axis.
        // We also pre-compute cumulative distance along the route so that
        // applyState() can split it into "advanced" and "remaining" segments.
        if (Array.isArray(scenario.pipeline) && scenario.pipeline.length > 1) {
            const latlngs = scenario.pipeline.map(p => [p[1], p[0]]);
            pipelineLatLngs = latlngs;
            pipelineSegmentKm = [0];
            for (let i = 1; i < latlngs.length; i++) {
                const km = haversineKm(latlngs[i - 1], latlngs[i]);
                pipelineSegmentKm.push(pipelineSegmentKm[i - 1] + km);
            }
            pipelineLine = window.L.polyline(latlngs, {
                color: COLORS.PIPELINE,
                weight: 2,
                opacity: 0.8,
                dashArray: '6 6',
            }).bindTooltip('Nasser–Brega pipeline (Red advance axis)', { permanent: false });
            pipelineLine.addTo(layerGroup);
        }

        // Red units — use scenario coords when available; otherwise spread
        // them in a fan south of their assigned BLS so multiple units at the
        // same BLS don't stack on top of each other. Icons use APP-6 hostile
        // SIDCs (red diamonds with correct echelon mods) when milsymbol is
        // available; fall back to a labeled red diamond divIcon otherwise.
        const unitsByBls = {};
        for (const unit of scenario.red_units || []) {
            if (!unitsByBls[unit.bls]) unitsByBls[unit.bls] = [];
            unitsByBls[unit.bls].push(unit);
        }
        for (const unit of scenario.red_units || []) {
            // Stash unit metadata so per-step applyState can recompute the
            // role-based position (lerp BLS → OBJ capped by role).
            const baseCoord = (Array.isArray(unit.coord) && unit.coord.length === 2) ? unit.coord.slice() : null;
            const meta = {
                uid:       unit.uid,
                role:      unit.role,
                bls:       unit.bls,
                appear:    Number.isFinite(unit.appear) ? unit.appear : 0,
                label:     unit.label,
                echelon:   unit.echelon,
                baseCoord,
            };

            // Initial placement = step-0 role-based position. For units with
            // appear > 0 this puts them at the offshore sea-offset; recon /
            // EW / fire-support already-ashore units land near their BLS.
            let initialLonLat = redPositionLonLat(meta, 0, 0);
            if (!initialLonLat) {
                // Fallback: scenario coord, or fan south of BLS for stacks.
                if (baseCoord) {
                    initialLonLat = baseCoord;
                } else {
                    const bls = (scenario.bls_template || []).find(b => b.name === unit.bls);
                    if (!bls || !bls.coord) continue;
                    const peers = unitsByBls[unit.bls] || [unit];
                    const idx = peers.indexOf(unit);
                    const n = peers.length;
                    initialLonLat = [
                        bls.coord[0] + (idx - (n - 1) / 2) * 0.014,
                        bls.coord[1] - 0.020 - 0.001 * idx,
                    ];
                }
            }

            const sidc = redSidcFor(unit);
            const size = redIconSize(unit.echelon);
            const icon = sidcIcon(sidc, size) || diamondIcon(COLORS.RED_UNIT, unit.label);
            const m = window.L.marker(
                [initialLonLat[1], initialLonLat[0]],
                { icon, title: unit.uid + ' — ' + unit.role + ' (' + unit.label + ')' },
            ).bindTooltip(`${unit.uid} (${unit.label}) — ${unit.role} — STAGED`, { permanent: false });
            m._wgRedMeta = meta;
            m.addTo(layerGroup);
            redMarkers[unit.uid] = m;
        }

        // Blue (friendly) units — drawn at the scenario's initial coords
        // using real APP-6 / SIDC icons via the milsymbol library (the same
        // renderer the rest of the app uses). Falls back to a colored
        // square if milsymbol isn't loaded or SIDC fails.
        for (const unit of scenario.blue_units_initial || []) {
            if (!unit.coord || unit.coord.length !== 2) continue;
            const size = blueIconSize(unit.echelon);
            const icon = sidcIcon(unit.sidc, size) || squareIcon(COLORS.BLUE_UNIT, unit.base_id, Math.max(10, Math.round(size / 2)));
            const m = window.L.marker(
                [unit.coord[1], unit.coord[0]],
                { icon, title: unit.unit_uid + ' — ' + (unit.echelon || 'unit') },
            ).bindTooltip(`${unit.unit_uid} (${unit.echelon || 'unit'}) — ACTIVE`, { permanent: false });
            m._wgBlueMeta = {
                uid:       unit.unit_uid,
                baseId:    unit.base_id,
                baseCoord: unit.coord.slice(),
                echelon:   unit.echelon,
            };
            m.addTo(layerGroup);
            blueMarkers[unit.unit_uid] = m;
        }

        // Fit the map view so the whole AOR is visible the first time.
        try {
            const bb = scenario.map_bbox;
            if (Array.isArray(bb) && bb.length === 4) {
                window.map.fitBounds([[bb[1], bb[0]], [bb[3], bb[2]]], { padding: [30, 30], maxZoom: 10, animate: true });
            }
        } catch (_) { /* ignore */ }

        // Add the legend control (top-right corner of the map).
        addLegend();
        // Add the SITREP banner (top-left corner of the map). Initial state
        // is a placeholder; applyState() fills it as the trial progresses.
        addSitrep();

        return true;
    }

    function addLegend() {
        if (legendControl || !window.L) return;
        legendControl = window.L.control({ position: 'topright' });
        legendControl.onAdd = function () {
            const div = window.L.DomUtil.create('div', 'wg-adj-legend');
            div.style.cssText = `
                background:rgba(15,22,35,.92);color:#cdd;font-size:11px;
                padding:8px 10px;border-radius:4px;border:1px solid #2a3140;
                box-shadow:0 0 6px rgba(0,0,0,.4);line-height:1.5;
                font-family:sans-serif;min-width:170px;max-width:200px;
            `;
            const blsRow = (color, label) =>
                `<span style="display:inline-block;width:14px;height:8px;
                  background:${color};border:1px solid #fff;border-bottom:none;
                  border-radius:14px 14px 0 0;vertical-align:middle;margin-right:6px;"></span>${label}`;
            div.innerHTML = `
                <div style="font-weight:700;margin-bottom:4px;color:#fff;">Wargame symbols</div>
                <div>${blsRow(COLORS.BLS.STAGED,    'BLS&nbsp;staged')}</div>
                <div>${blsRow(COLORS.BLS.CONTESTED, 'BLS&nbsp;contested')}</div>
                <div>${blsRow(COLORS.BLS.SECURE,    'BLS&nbsp;secure')}</div>
                <div>${blsRow(COLORS.BLS.LIMITED,   'BLS&nbsp;limited')}</div>
                <div>${blsRow(COLORS.BLS.DENIED,    'BLS&nbsp;denied')}</div>
                <hr style="border:none;border-top:1px solid #2a3140;margin:6px 0;">
                <div><span style="color:${COLORS.RED_UNIT};font-weight:700;">◆</span>&nbsp;Red unit (hostile, APP-6)</div>
                <div><span style="color:${COLORS.BLUE_UNIT};font-weight:700;">▮</span>&nbsp;Blue unit (friendly, APP-6)</div>
                <div><span style="color:#888;">⊕</span>&nbsp;OBJ&nbsp;NASSER</div>
                <hr style="border:none;border-top:1px solid #2a3140;margin:6px 0;">
                <div><span style="display:inline-block;width:18px;border-top:2px dashed ${COLORS.PIPELINE};vertical-align:middle;margin-right:6px;"></span>Pipeline (planned)</div>
                <div><span style="display:inline-block;width:18px;border-top:3px solid ${COLORS.RED_UNIT};vertical-align:middle;margin-right:6px;"></span>Red advance</div>
            `;
            window.L.DomEvent.disableClickPropagation(div);
            return div;
        };
        legendControl.addTo(window.map);
    }

    function removeLegend() {
        if (legendControl && window.map) {
            try { window.map.removeControl(legendControl); } catch (_) {}
        }
        legendControl = null;
    }

    // ── SITREP banner (top-left of the map) ───────────────────────────
    function addSitrep() {
        if (sitrepControl || !window.L) return;
        sitrepControl = window.L.control({ position: 'topleft' });
        sitrepControl.onAdd = function () {
            const div = window.L.DomUtil.create('div', 'wg-adj-sitrep');
            div.style.cssText = `
                background:rgba(15,22,35,.92);color:#e6e6e6;
                font-family:sans-serif;font-size:12px;line-height:1.5;
                padding:8px 12px;border-radius:4px;border:1px solid #2a3140;
                box-shadow:0 0 6px rgba(0,0,0,.4);
                min-width:280px;max-width:380px;margin-top:8px;
            `;
            div.innerHTML = `<div style="color:#888;font-style:italic;">SITREP — awaiting first step…</div>`;
            window.L.DomEvent.disableClickPropagation(div);
            return div;
        };
        sitrepControl.addTo(window.map);
    }

    function removeSitrep() {
        if (sitrepControl && window.map) {
            try { window.map.removeControl(sitrepControl); } catch (_) {}
        }
        sitrepControl = null;
    }

    function updateSitrep(state) {
        if (!sitrepControl) return;
        const div = sitrepControl.getContainer();
        if (!div || !state) return;
        const objColor = COLORS.OBJ[state.objective_status] || '#888';
        const blueDead = state.losses_cumulative && state.losses_cumulative.blue_destroyed || 0;
        const blueTotal = (state.losses_cumulative && state.losses_cumulative.blue_total) || 39;
        const redCoy = state.losses_cumulative && state.losses_cumulative.red_company_equivalent || 0;
        const phasePill = `<span style="background:#22293a;color:#cdd;padding:1px 6px;border-radius:8px;font-size:10px;">${esc(state.phase)}</span>`;
        const objPill   = `<span style="background:${objColor};color:#fff;padding:1px 8px;border-radius:8px;font-size:10px;font-weight:700;float:right;">${esc(state.objective_status)}</span>`;
        div.innerHTML = `
            <div style="margin-bottom:4px;">
                <strong style="color:#fff;letter-spacing:.05em;">STEP ${state.step_index} · ${esc(state.time_label)}</strong>
                ${objPill}
            </div>
            <div style="color:#9ab;font-size:11px;margin-bottom:6px;">${phasePill} &nbsp; ${esc(state.decision_point || '')}</div>
            <div>
                <span style="color:#9ab;">PL:</span> <strong>${state.phase_line_km} km</strong>
                &nbsp;·&nbsp;
                <span style="color:#9ab;">FR:</span> ${esc(state.force_ratio)}
            </div>
            <div>
                <span style="color:#9ab;">EW:</span> ${esc(state.ew_effect)}
                &nbsp;·&nbsp;
                <span style="color:#9ab;">Logistics:</span> ${esc(state.logistics_state)}
            </div>
            <div style="margin-top:4px;padding-top:4px;border-top:1px solid #2a3140;font-size:11px;">
                <span style="color:#3a96d2;">Blue ${blueDead}/${blueTotal}</span>
                &nbsp;&nbsp;
                <span style="color:#d23a3a;">Red ${redCoy} coy-eq</span>
            </div>
        `;
    }

    function esc(s) {
        if (s == null) return '';
        return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
    }

    // ── EW halo around RED_405EW ──────────────────────────────────────
    // Radius (km) and color reflect the current EW band.
    function updateEwHalo(state) {
        const ewUnit = redMarkers['RED_405EW'];
        if (!ewUnit || !layerGroup) return;
        if (ewHalo) { layerGroup.removeLayer(ewHalo); ewHalo = null; }

        const band = state.ew_effect;
        if (!band || band === 'Idle') return;

        const radiusKm = ({
            Active: 10, Heavy: 30, Moderate: 20, Low: 10,
        })[band] || 0;
        if (!radiusKm) return;

        const center = ewUnit.getLatLng();
        ewHalo = window.L.circle(center, {
            radius:    radiusKm * 1000,
            color:     '#c08aff',
            weight:    1,
            opacity:   0.7,
            fillColor: '#9b6fff',
            fillOpacity: band === 'Heavy' ? 0.18 : band === 'Moderate' ? 0.12 : 0.07,
            dashArray: '6 4',
            interactive: false,
        }).bindTooltip(`EW effect: ${band} (~${radiusKm} km)`, { sticky: false });
        ewHalo.addTo(layerGroup);
    }

    // ── Red advance arrows (BLS → lerp(BLS, OBJ, progress)) ───────────
    // Mirrors wargame.py draw_phase_and_red_area(): one chunky main arrow
    // from BLS-3 to lerp(BLS-3, OBJ, progress), plus a thinner secondary
    // from BLS-4 once progress > 0.15. The arrow lengthens each step as
    // the operation deepens, instead of tracing the pipeline curve.
    function updateAdvanceArrows(state, scenario) {
        for (const a of advanceArrows) {
            if (a && layerGroup) layerGroup.removeLayer(a);
        }
        advanceArrows = [];
        if (salientLayer && layerGroup) { layerGroup.removeLayer(salientLayer); salientLayer = null; }
        if (!layerGroup || !scenario) return;
        const progress = progressFromState(state);
        if (progress <= 0) return;

        const obj = scenario.obj;
        if (!obj || !Array.isArray(obj.coord)) return;
        const objLL = obj.coord;

        // Salient polygon: from every BLS in template back through the
        // current deep-front lerp points, tinted red. Same visual idea as
        // wargame.py's red AOR fill — shows the penetration shape.
        const bls = (scenario.bls_template || []).filter(b => b && Array.isArray(b.coord));
        if (bls.length >= 2) {
            const deep = bls.map(b => lerpLonLat(b.coord, objLL, Math.min(progress, 0.92)));
            const ring = bls.map(b => [b.coord[1], b.coord[0]])
                .concat(deep.slice().reverse().map(p => [p[1], p[0]]));
            salientLayer = window.L.polygon(ring, {
                color: '#b21414',
                weight: 1.5,
                opacity: 0.5,
                fillColor: '#c41e1e',
                fillOpacity: 0.18,
                interactive: false,
            });
            salientLayer.addTo(layerGroup);
        }

        // Main effort: BLS-3 → lerp(BLS-3, OBJ, progress). Chunky.
        const main = scenario.bls_template && scenario.bls_template.find(b => b && b.name === 'BLS-3');
        if (main && Array.isArray(main.coord)) {
            const start = [main.coord[1], main.coord[0]];
            const endLL = lerpLonLat(main.coord, objLL, Math.min(progress, 1.0));
            const end   = [endLL[1], endLL[0]];
            const color = '#b21414';
            const line = window.L.polyline([start, end], {
                color, weight: 10, opacity: 0.85, lineCap: 'round', interactive: false,
            }).bindTooltip(`Main effort: BLS-3 → OBJ (progress ${(progress * 100).toFixed(0)}%)`);
            line.addTo(layerGroup);
            advanceArrows.push(line);
            const head = makeArrowhead(start, end, color, 14);
            if (head) { head.addTo(layerGroup); advanceArrows.push(head); }
        }

        // Secondary envelopment: BLS-4 → lerp(BLS-4, OBJ, progress*0.92).
        // Only appears once the lodgement has any depth (progress > 0.15).
        const sec = scenario.bls_template && scenario.bls_template.find(b => b && b.name === 'BLS-4');
        if (progress > 0.15 && sec && Array.isArray(sec.coord)) {
            const start = [sec.coord[1], sec.coord[0]];
            const endLL = lerpLonLat(sec.coord, objLL, Math.min(progress, 0.92));
            const end   = [endLL[1], endLL[0]];
            const color = '#b21414';
            const line = window.L.polyline([start, end], {
                color, weight: 6, opacity: 0.6, lineCap: 'round', interactive: false,
            }).bindTooltip(`Envelopment: BLS-4 → OBJ (progress ${(Math.min(progress, 0.92) * 100).toFixed(0)}%)`);
            line.addTo(layerGroup);
            advanceArrows.push(line);
            const head = makeArrowhead(start, end, color, 10);
            if (head) { head.addTo(layerGroup); advanceArrows.push(head); }
        }
    }

    // ── Per-step unit movement ────────────────────────────────────────
    // Walks every Red and Blue marker the scenario placed, recomputes its
    // position from role + step index + progress (red) or per-step action
    // (blue), and slides the marker via setLatLng. Mirrors the wargame.py
    // red_position / blue_position behavior so the on-map view matches
    // the reference step PNGs.
    function updateUnitPositions(state) {
        const stepIndex = Number.isFinite(state && state.step_index) ? state.step_index : 0;
        const progress  = progressFromState(state);

        for (const m of Object.values(redMarkers)) {
            const meta = m && m._wgRedMeta;
            if (!meta) continue;
            const lonLat = redPositionLonLat(meta, stepIndex, progress);
            if (!lonLat) continue;
            try { m.setLatLng([lonLat[1], lonLat[0]]); } catch (_) { /* ignore */ }
        }
        for (const m of Object.values(blueMarkers)) {
            const meta = m && m._wgBlueMeta;
            if (!meta) continue;
            const lonLat = bluePositionLonLat(meta, stepIndex);
            if (!lonLat) continue;
            try { m.setLatLng([lonLat[1], lonLat[0]]); } catch (_) { /* ignore */ }
        }
    }

    // Build a small triangle polygon at `end` pointing in the direction of
    // motion from `start`. Returns an L.polygon.
    function makeArrowhead(start, end, color, size) {
        if (!window.L) return null;
        const dLat = end[0] - start[0];
        const dLng = end[1] - start[1];
        const len = Math.sqrt(dLat * dLat + dLng * dLng);
        if (len < 1e-7) return null;
        // size is in pixels-ish; convert to a small degree offset by scaling
        // against the segment length. 0.018° ≈ 2 km — visible at 1:500k zoom.
        const headLen = 0.018;
        const ux = dLat / len, uy = dLng / len;     // unit vector
        const px = -uy,        py = ux;             // perpendicular
        const tipLat = end[0];
        const tipLng = end[1];
        const baseCx = tipLat - ux * headLen;
        const baseCy = tipLng - uy * headLen;
        const halfBase = headLen * 0.6;
        const left  = [baseCx + px * halfBase, baseCy + py * halfBase];
        const right = [baseCx - px * halfBase, baseCy - py * halfBase];
        return window.L.polygon([[tipLat, tipLng], left, right], {
            color,
            weight: 1,
            opacity: 0.9,
            fillColor: color,
            fillOpacity: 0.9,
            interactive: false,
        });
    }

    // ── AOR phase line ────────────────────────────────────────────────
    // Dashed yellow horizontal-ish line across the AOR at the current PL
    // depth. Complements the pipeline-fill — that follows the axis, this
    // shows the across-front frontier.
    function updateAorPhaseLine(state, scenario) {
        if (aorPhaseLine && layerGroup) layerGroup.removeLayer(aorPhaseLine);
        aorPhaseLine = null;
        if (!layerGroup || !scenario || !scenario.map_bbox) return;
        if (!state || state.phase_line_km == null || state.phase_line_km < 1) return;
        const [, , , latN] = scenario.map_bbox;
        const coastLat = latN - 0.06;
        const lat = coastLat - (state.phase_line_km / 110);
        if (lat <= scenario.map_bbox[1]) return; // off the southern edge
        const dashColor = COLORS.OBJ[state.objective_status] || '#e8a23a';
        aorPhaseLine = window.L.polyline(
            [[lat, scenario.map_bbox[0]], [lat, scenario.map_bbox[2]]],
            { color: dashColor, weight: 1.5, opacity: 0.55, dashArray: '8 6', interactive: false },
        ).bindTooltip(`Phase line: ${state.phase_line_km} km — ${state.objective_status}`);
        aorPhaseLine.addTo(layerGroup);
    }

    // ── X-overlay on destroyed Blue units ─────────────────────────────
    // Adds a red X glyph over the SIDC icon so destruction is visible at a
    // glance, not just via fade. Used in addition to the opacity/grayscale
    // fade so the visual cue is unambiguous.
    function markBlueAsDestroyed(marker) {
        if (!marker) return;
        try {
            const el = marker.getElement();
            if (!el || el.querySelector('.wg-adj-x')) return; // already marked
            const x = document.createElement('div');
            x.className = 'wg-adj-x';
            x.style.cssText = `
                position:absolute;
                top:50%;left:50%;
                width:140%;height:140%;
                transform:translate(-50%, -50%);
                pointer-events:none;
                color:#d23a3a;
                font-weight:900;font-size:30px;line-height:1;
                text-align:center;
                text-shadow:0 0 4px #000, 0 0 2px #d23a3a;
            `;
            x.textContent = '✕';
            el.appendChild(x);
        } catch (_) { /* ignore */ }
    }

    function unmarkBlueAsDestroyed(marker) {
        try {
            const el = marker && marker.getElement();
            if (!el) return;
            const x = el.querySelector('.wg-adj-x');
            if (x) x.remove();
        } catch (_) { /* ignore */ }
    }

    // ── Contact halo (last destroyed Blue) ────────────────────────────
    // Places a small dashed yellow circle on the most recent destroyed Blue
    // unit so the operator can see WHERE the fighting just happened.
    function updateContactHalo(state) {
        if (contactHalo && layerGroup) {
            layerGroup.removeLayer(contactHalo);
            contactHalo = null;
        }
        if (!layerGroup || !state || !state.per_unit_deltas) return;
        const newlyDead = state.per_unit_deltas.blue_destroyed || [];
        if (!newlyDead.length) return;
        const lastUid = newlyDead[newlyDead.length - 1];
        const marker = blueMarkers[lastUid];
        if (!marker) return;
        contactHalo = window.L.circle(marker.getLatLng(), {
            radius:    3000,           // 3 km contact bubble
            color:     '#ffc94a',
            weight:    2,
            opacity:   0.9,
            fillColor: '#ffd97a',
            fillOpacity: 0.15,
            dashArray: '4 3',
            interactive: false,
        }).bindTooltip(`Contact: ${lastUid} destroyed`, { sticky: false });
        contactHalo.addTo(layerGroup);
    }

    function clearScenario() {
        if (layerGroup && window.map) {
            window.map.removeLayer(layerGroup);
        }
        removeLegend();
        removeSitrep();
        layerGroup = null;
        blsMarkers = {};
        objMarker  = null;
        pipelineLine = null;
        pipelineAdvanced = null;
        advanceTip = null;
        pipelineLatLngs = null;
        pipelineSegmentKm = null;
        redMarkers = {};
        blueMarkers = {};
        ewHalo = null;
        contactHalo = null;
        aoLayers = [];
        advanceArrows = [];
        aorPhaseLine = null;
        salientLayer = null;
        scenarioRef = null;
        blsCoordByName = {};
        objCoord = null;
    }

    // ── Find existing user-placed Blue marker by base id ─────────────
    function findBlueMarkerByBaseId(baseId) {
        if (!hasMap()) return null;
        const re = new RegExp('\\b' + baseId + '\\b', 'i');
        let match = null;
        window.map.eachLayer((layer) => {
            if (match || !(layer instanceof window.L.Marker)) return;
            // Try multiple property sources where a code might live
            const candidates = [
                layer._slotUnitCode,
                layer._unitData && layer._unitData.code,
                layer._unitData && layer._unitData.id,
                layer._unitData && layer._unitData.name,
                layer._tmgData && layer._tmgData.uniqueDesignation,
                layer.options && layer.options.title,
            ].filter(Boolean);
            for (const c of candidates) {
                if (typeof c === 'string' && re.test(c)) { match = layer; return; }
            }
        });
        return match;
    }

    function fadeMarker(marker) {
        if (!marker) return;
        try {
            const el = marker.getElement();
            if (el) {
                el.style.opacity   = '0.35';
                el.style.filter    = 'grayscale(1) blur(0.5px)';
                el.classList.add('wg-destroyed');
            }
            // Overlay a red X glyph so destruction reads at a glance.
            markBlueAsDestroyed(marker);
            destroyedMarkers.set(marker._leaflet_id, marker);
            marker.bindTooltip((marker.getTooltip() ? marker.getTooltip().getContent() : '') + ' [DESTROYED]', { permanent: false });
        } catch (_) { /* ignore */ }
    }

    function restoreMarker(marker) {
        try {
            const el = marker.getElement();
            if (el) {
                el.style.opacity = '';
                el.style.filter  = '';
                el.classList.remove('wg-destroyed');
            }
            unmarkBlueAsDestroyed(marker);
        } catch (_) { /* ignore */ }
    }

    // ── Apply a per-step state to the map ────────────────────────────
    function applyState(state, scenario) {
        if (!hasMap() || !state) return { found: 0, missed: [] };
        if (scenario && scenario !== scenarioRef) {
            // Defensive: keep the per-step movement model in sync with whatever
            // scenario the caller is replaying (matters when MC trials reuse
            // the same overlay but advance through different scenarios).
            scenarioRef = scenario;
            if (Array.isArray(scenario.bls_template)) {
                blsCoordByName = {};
                for (const b of scenario.bls_template) {
                    if (b && b.name && Array.isArray(b.coord)) blsCoordByName[b.name] = b.coord;
                }
            }
            if (scenario.obj && Array.isArray(scenario.obj.coord)) objCoord = scenario.obj.coord;
            if (scenario.obj && Number.isFinite(scenario.obj.target_depth_km)) objDepthKm = scenario.obj.target_depth_km;
        }

        // -1. Move every Red and Blue marker first — downstream halos (EW,
        // contact) re-center themselves off the unit's current position.
        updateUnitPositions(state);

        // 0. SITREP banner + EW halo + contact halo + advance arrows + AOR PL
        updateSitrep(state);
        updateEwHalo(state);
        updateContactHalo(state);
        updateAdvanceArrows(state, scenario || scenarioRef);
        updateAorPhaseLine(state, scenario || scenarioRef);

        // 1. Update BLS semicircle colors
        if (state.bls_status) {
            for (const [name, status] of Object.entries(state.bls_status)) {
                const m = blsMarkers[name];
                if (!m) continue;
                m.setIcon(blsIcon(COLORS.BLS[status] || '#888', name.replace('BLS-', '')));
                m.setTooltipContent(`${name} — ${status}`);
            }
        }

        // 2. Update OBJ color by status
        if (objMarker && state.objective_status) {
            const c = COLORS.OBJ[state.objective_status] || '#888';
            const objName = (scenario && scenario.obj && scenario.obj.name) || 'OBJ NASSER';
            objMarker.setIcon(targetIcon(c, objName));
            objMarker.setTooltipContent(`${objName} — ${state.objective_status}`);
        }

        // 3. Mark Red degraded units (opacity fade — they're not destroyed,
        // just attrited).
        if (state.per_unit_deltas && Array.isArray(state.per_unit_deltas.red_degraded)) {
            for (const entry of state.per_unit_deltas.red_degraded) {
                const m = redMarkers[entry.unit_uid];
                if (!m) continue;
                try {
                    const el = m.getElement();
                    if (el) el.style.opacity = String(0.4 + (entry.strength_current || 0.7) * 0.5);
                    m.setTooltipContent(`${entry.unit_uid} — ${entry.status} (${Math.round((entry.strength_current || 0) * 100)}%)`);
                } catch (_) { /* ignore */ }
            }
        }

        // 4. Apply Blue destroyed: fade the scenario-drawn Blue marker first
        // (always present when the scenario has been drawn), then also try to
        // fade any matching user-placed marker so both representations agree.
        const found = [];
        const missed = [];
        if (state.per_unit_deltas && Array.isArray(state.per_unit_deltas.blue_destroyed)) {
            for (const uid of state.per_unit_deltas.blue_destroyed) {
                const baseId = uid.replace(/^BLUE_/, '');
                const scenarioMarker = blueMarkers[uid];
                if (scenarioMarker) { fadeMarker(scenarioMarker); found.push(baseId); }
                const userMarker = findBlueMarkerByBaseId(baseId);
                if (userMarker && userMarker !== scenarioMarker) fadeMarker(userMarker);
                if (!scenarioMarker && !userMarker) missed.push(baseId);
            }
        }

        // 5. Pipeline fill: draw the section Red has already advanced over
        // as a solid red line (replaces the dashed purple in that range).
        // A small arrow marker sits at the tip showing the current advance.
        if (layerGroup && pipelineLatLngs && state.phase_line_km != null) {
            const advancedLatLngs = pipelineUpTo(state.phase_line_km);
            if (pipelineAdvanced) layerGroup.removeLayer(pipelineAdvanced);
            if (advancedLatLngs.length >= 2) {
                pipelineAdvanced = window.L.polyline(advancedLatLngs, {
                    color: COLORS.OBJ[state.objective_status] || '#d23a3a',
                    weight: 4,
                    opacity: 0.85,
                }).bindTooltip(`Red advance: ${state.phase_line_km} km — ${state.objective_status}`);
                pipelineAdvanced.addTo(layerGroup);
            } else {
                pipelineAdvanced = null;
            }

            if (advanceTip) layerGroup.removeLayer(advanceTip);
            const tip = pointAlongPipeline(state.phase_line_km);
            if (tip && state.phase_line_km > 0) {
                advanceTip = window.L.marker(tip, {
                    icon: window.L.divIcon({
                        html: `<div style="
                            width:14px;height:14px;border-radius:50%;
                            background:${COLORS.OBJ[state.objective_status] || '#d23a3a'};
                            border:2px solid #fff;
                            box-shadow:0 0 6px rgba(0,0,0,.5);
                        "></div><div style="
                            position:absolute;top:16px;left:-30px;width:74px;
                            text-align:center;font-size:10px;color:#fff;
                            text-shadow:0 0 3px #000;font-weight:700;
                        ">PL ${state.phase_line_km} km</div>`,
                        className: 'wg-adj-advance-tip',
                        iconSize:   [14, 14],
                        iconAnchor: [7, 7],
                    }),
                });
                advanceTip.addTo(layerGroup);
            } else {
                advanceTip = null;
            }
        }

        return { found, missed };
    }

    function resetMap() {
        // Restore any markers we faded
        destroyedMarkers.forEach((m) => restoreMarker(m));
        destroyedMarkers.clear();
        // Reset BLS dot colors and OBJ to initial
        for (const [name, m] of Object.entries(blsMarkers)) {
            m.setIcon(blsIcon(COLORS.BLS.STAGED, name.replace('BLS-', '')));
            m.setTooltipContent(`${name} — STAGED`);
        }
        if (objMarker) {
            objMarker.setIcon(targetIcon(COLORS.OBJ.DORMANT, 'OBJ NASSER-95'));
            objMarker.setTooltipContent('OBJ NASSER-95 — DORMANT');
        }
        for (const m of Object.values(redMarkers)) {
            try { const el = m.getElement(); if (el) el.style.opacity = ''; } catch (_) {}
            // Slide Red unit back to its step-0 offshore / role position.
            const meta = m && m._wgRedMeta;
            if (meta) {
                const ll = redPositionLonLat(meta, 0, 0);
                if (ll) { try { m.setLatLng([ll[1], ll[0]]); } catch (_) {} }
            }
        }
        for (const m of Object.values(blueMarkers)) {
            try { const el = m.getElement(); if (el) { el.style.opacity = ''; el.style.filter = ''; el.classList.remove('wg-destroyed'); } } catch (_) {}
            // Slide Blue unit back to its base coord (cancels any COUNTERATTACK shift).
            const meta = m && m._wgBlueMeta;
            if (meta && meta.baseCoord) {
                try { m.setLatLng([meta.baseCoord[1], meta.baseCoord[0]]); } catch (_) {}
            }
        }
        if (salientLayer && layerGroup) {
            layerGroup.removeLayer(salientLayer);
            salientLayer = null;
        }
        if (pipelineAdvanced && layerGroup) {
            layerGroup.removeLayer(pipelineAdvanced);
            pipelineAdvanced = null;
        }
        if (advanceTip && layerGroup) {
            layerGroup.removeLayer(advanceTip);
            advanceTip = null;
        }
        if (ewHalo && layerGroup) {
            layerGroup.removeLayer(ewHalo);
            ewHalo = null;
        }
        if (contactHalo && layerGroup) {
            layerGroup.removeLayer(contactHalo);
            contactHalo = null;
        }
        for (const a of advanceArrows) {
            if (a && layerGroup) layerGroup.removeLayer(a);
        }
        advanceArrows = [];
        if (aorPhaseLine && layerGroup) {
            layerGroup.removeLayer(aorPhaseLine);
            aorPhaseLine = null;
        }
        // Reset the SITREP banner contents
        if (sitrepControl) {
            const div = sitrepControl.getContainer();
            if (div) div.innerHTML = `<div style="color:#888;font-style:italic;">SITREP — awaiting first step…</div>`;
        }
    }

    window.AppAdjudicatorMap = {
        drawScenario,
        clearScenario,
        applyState,
        resetMap,
        // for diagnostics
        _findBlueMarkerByBaseId: findBlueMarkerByBaseId,
    };
})();
