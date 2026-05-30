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
        DESTROYED: '#7a7a7a',     // gray applied via CSS grayscale filter on destroyed units
    };

    // ── Unit lifecycle ───────────────────────────────────────────────
    // Three explicit states. Drives rendering priority: DESTROYED beats side.
    const UNIT_STATUS = Object.freeze({
        ACTIVE:    'active',
        DEGRADED:  'degraded',
        DESTROYED: 'destroyed',
    });

    // Module-level registry of every unit the scenario placed. Keyed by uid
    // (e.g. "BLUE_p33c", "RED_43MECH"). The fields here are the public contract
    // promised in the bug report: every unit MUST have these. Built once in
    // drawScenario(), mutated per step by applyState().
    //   { id, parentId, rootId, side, status, strength, canMove, canFight }
    let unitRegistry = {};

    // Toggleable debug logging (per-unit color/status decisions). Disabled by
    // default; flip via window.AppAdjudicatorMap._setDebug(true).
    let debugEnabled = false;
    function dbg(msg, payload) {
        if (!debugEnabled) return;
        try {
            if (payload === undefined) console.log('[wg-adj] ' + msg);
            else                       console.log('[wg-adj] ' + msg, payload);
        } catch (_) { /* ignore */ }
    }

    let layerGroup = null;       // L.layerGroup of scenario overlays
    let blsMarkers = {};         // { 'BLS-1': L.marker }
    let objMarker  = null;
    let objSecurityRing = null;  // dashed ring around OBJ using obj.radius_km
    let pipelineLine = null;     // full planned route (purple dashed reference)
    let breachBadges = {};       // { 'BLS-1': L.marker } NATO breach indicators per BLS
    let pipelineAdvanced = null; // section Red has already reached (solid red)
    let advanceTip = null;       // arrow marker at current advance tip
    let redMarkers = {};         // { 'RED_xxx': L.marker }
    let blueMarkers = {};        // { 'BLUE_xxx': L.marker }
    let pipelineLatLngs = null;  // cached lat/lng array for split computation
    let pipelineSegmentKm = null;// cached cumulative km along pipeline per vertex
    let legendControl = null;    // Leaflet control (top-right legend panel)
    let sitrepControl = null;    // Leaflet control (top-left SITREP banner)
    let displayOffsetNotice = null; // Leaflet control (bottom-left display-offset info chip — PR-106)
    let ewHalo = null;           // circle around RED_405EW sized by EW band
    let contactHalo = null;      // circle around most recent destroyed Blue
    let aoLayers = [];           // dashed blue polygons for AO boundaries
    let advanceArrows = [];      // L.polylines with arrow tips, BLS → tip
    let attackArrows = [];       // per-step engagement arrows (red kill + blue counterattack pulse)
    let aorPhaseLine = null;     // dashed yellow line across AOR at current PL
    let aorPhaseLineLabel = null;// "PL XX km" pill marker at the line's left end
    let salientLayer = null;     // red-tinted penetration polygon
    let offMapMarkerLayers = []; // small dim icons for W3 off-map bases/SSMs

    // Running cumulative set of destroyed Blue uids. Source of truth is
    // state.blue_destroyed_cumulative when present; otherwise we accumulate
    // from per_unit_deltas. Cleared on clearScenario / resetMap.
    let runningDestroyedUids = new Set();

    // AN1: last step index whose per-unit attrition we rendered onto the unit
    // markers. applyStepProgress may be called repeatedly with fractional
    // progress WITHIN one step; we only recompute attrition when the step
    // index actually changes. Reset to -1 on clearScenario / resetMap.
    let playbackAttritionStep = -1;

    // Last step index that applyState processed. Drives the FORWARD-vs-REWIND
    // decision in applyState — forward (newIdx > last) plays the full
    // explosion-and-arrow choreography, backward/equal snaps silently.
    let lastAppliedStepIndex = -1;
    // Cached state + scenario from the last applyState call. The zoomend
    // hook below uses these to re-render the advance + counterattack arrows
    // at the new zoom level — tactical-graphic divIcons are sized in pixels
    // at creation time, so without a re-render they stay the same pixel size
    // while the underlying world scales (arrow looks tiny when zoomed in,
    // oversized when zoomed out). Re-running updateAdvanceArrows /
    // updateAttackArrows on zoomend wipes and rebuilds them at the right
    // px-per-km for the current view.
    let lastAppliedState    = null;
    let lastAppliedScenario = null;

    // setTimeout handles for the in-flight staggered-death scheduler so a
    // step change can cancel anything still queued from the previous step.
    let pendingDeathTimers = [];

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

    // ── Layout configuration ──────────────────────────────────────────
    // All placement / layout constants in one place.  Values are preserved
    // exactly from their previous standalone declarations — PR-95 is a
    // zero-behaviour refactor.  Unused entries (redW3SpreadKm,
    // stagingEchelonRowKm, sideNudgeKm, w3GroundRoleCap) are carried here
    // for completeness; activation belongs to a later display-layout PR.
    const LAYOUT_CONFIG = {

        // Sea offsets per BLS (from wargame.py red_position / sea_offsets).
        // Each value is [eastKm, northKm] from the BLS centroid; positive
        // north = further offshore. Units staged here before their appear-step.
        blsSeaOffsets: {
            'BLS-1': [-2, 12],
            'BLS-2': [ 0, 11],
            'BLS-3': [ 2,  9],
            'BLS-4': [ 3,  6],
        },

        // Per-unit spread offsets (in km) applied to the post-step-3 lerp
        // position so a stack of brigades at the same BLS fans out instead
        // of sitting on top of each other.  Mirrors wargame.py `spread`.
        redUnitSpread: {
            RED_401RECON: [ 5.0, -4.5],
            RED_41MECH:   [-6.0,  1.0],
            RED_42MECH:   [-2.2, -1.8],
            RED_43MECH:   [ 2.2,  1.0],
            RED_44ARMD:   [ 9.0,  8.0],
            RED_9MID:     [-8.0, -6.0],
            RED_1AD:      [-8.0,  2.0],
        },

        // W3-rich render-time role spread (unused in PR-95).
        // Offsets are [eastKm, northKm] from the source coord.
        redW3SpreadKm: {
            // recon / ISR / EW push forward (south, more negative northKm)
            recon:                [  6,  -3],
            isr:                  [  6,  -3],
            scout:                [  6,  -3],
            ew:                   [ -8,   3],
            signal:               [ -8,   3],
            // armor and mech bunch around the main axis with east/west splay
            armored_brigade:      [  3,   0.5],
            armored_division:     [ -3,   1],
            armor:                [  3,   0.5],
            tank:                 [  3,   0.5],
            mech_brigade:         [ -1.5, 0.5],
            mech_inf_div:         [ -3,  -0.5],
            // fires sit behind (north, positive northKm)
            artillery:            [ -5,   3],
            fire_support:         [ -5,   3],
            rocket_artillery:     [ -7,   4],
            // air assets sit further offshore north
            strike:               [  4,   6],
            fighter:              [ -4,   6],
            fighter_ad:           [ -4,   6],
            bomber:               [  0,   8],
            // naval offshore north + east
            destroyer:            [  6,   8],
            frigate:              [  4,   7],
            landing_ship:         [  0,   5],
            amphib:               [  0,   5],
            // SOF/UAV ahead of the line
            sof:                  [  2,  -5],
            kamikaze_uav:         [  4,  -4],
            usv:                  [  6,  -2],
            // defaults
            unknown:              [  0,   0],
        },

        // Echelon-based north-south offset (km) during the pre-D-H
        // offshore-staging phase (unused in PR-95).
        stagingEchelonRowKm: {
            division:  +2.0,
            brigade:   +0.5,
            battalion: -1.0,
            squadron:  -2.5,
            company:   -1.5,
            unit:       0,
        },

        // Side nudge applied AFTER landing (unused in PR-95).
        sideNudgeKm: { RED: { e: 0, n: 0 }, BLUE: { e: 0, n: -2.0 } },

        // +N km north push applied to Blue units during a COUNTERATTACK step.
        blueCounterattackKmNorth:  5.0,

        // −N km fallback (south) applied to Blue units during a WITHDRAW step.
        blueWithdrawKmNorth:      -5.0,

        // Display-only Blue cluster fan-out (PR-102).
        // Geographic bucket size (km): units whose raw step-coord falls in the
        // same ~10 km cell are treated as a co-located cluster and fanned out
        // on a regular polygon ring. Isolated units get fallback hash ring.
        blueClusterBucketKm: 8.0,

        // Target fan-out radius in pixels per echelon, scaled by the live
        // zoom's km-per-pixel. PR-104: increased for non-division echelons so
        // that co-located clusters (sz 2–4) produce ≥ 36 px separation at
        // zoom 7–9. Formula: r = min(targetPx × kmPerPixel, maxKm).
        // At zoom 7–9 the targetPx term drives the radius (26–30 px) which
        // keeps clusters readable without distorting the tactical picture.
        blueDisplayStaggerTargetPx: {
            division:  6,
            brigade:   20,
            battalion: 30,
            company:   30,
            squadron:  30,
            unit:      30,
        },

        // Hard cap (km) on the fan-out radius regardless of zoom level.
        // PR-104: zoom-adaptive radius uses targetPx × kmPerPixel; this cap
        // only binds when the zoom-derived radius would exceed the echelon max.
        // At zoom 7 (1.06 km/px): brigade r = min(20px×1.06, 20) = 20 km.
        // At zoom 8 (0.53 km/px): brigade r = min(20px×0.53, 20) = 10.6 km.
        // At zoom 9 (0.265 km/px): brigade r = min(20px×0.265, 20) = 5.3 km.
        // Battalion/company/squadron/unit targetPx=30 → z9 r=7.95 km (cap=28).
        blueDisplayStaggerMaxKm: {
            division:  3.0,
            brigade:   20.0,
            battalion: 28.0,
            company:   28.0,
            squadron:  28.0,
            unit:      28.0,
        },

        // Fallback ring radius (km) for isolated Blue units that have no
        // geo-bucket cluster neighbour. A small uid-hash ring prevents tight
        // raw-coord stacking at natural zoom levels (zoom 9, ~9.5 km threshold)
        // without distorting the unit's geographic position significantly.
        // Values match the PR-100 hash-ring radii so zoom-9 behaviour for
        // isolated units is preserved.
        blueDisplayStaggerFallbackKm: {
            division:  0.5,
            brigade:   1.5,
            battalion: 2.5,
            company:   3.5,
            squadron:  2.0,
            unit:      2.0,
        },

        // PR-104: outer-ring radius cap (km) for large cluster multi-ring
        // fan-out (clusterSize > 6). Inner rings use fractional proportions of
        // this value (35 %, 60 %, 80 %). Single-ring clusters (≤ 6) use
        // blueDisplayStaggerMaxKm above.
        blueDisplayStaggerMultiRingMaxKm: {
            division:  1.0,
            brigade:   3.0,
            battalion: 6.0,
            company:   8.0,
            squadron:  5.0,
            unit:      5.0,
        },

        // W3 ground-unit progress cap by role (unused in PR-95).
        // Maps W3-rich role strings to a 0–1+ progress cap along the
        // BLS → OBJ axis.  Values > 1.0 (recon_bn, sof_bn) push those
        // units ahead of the nominal objective line.
        w3GroundRoleCap: {
            // Maneuver
            armored_brigade:    1.00,
            mech_brigade:       1.00,
            mech_inf_div:       0.95,
            mech_bn:            0.90,
            inf_brigade:        0.85,
            // Recon ahead of front
            recon_bn:           1.08,
            // Combat support
            artillery_bn:       0.50,
            engineer_bn:        0.85,
            atgm_bn:            0.70,
            // Combat service support (way back)
            signal_bn:          0.25,
            ew_bn:              0.20,
            chem_bn:            0.35,
            logistics:          0.40,
            // Air defense (mobile but stays with formation, not at front)
            manpads:            0.60,
            // SOF ahead of regulars
            sof_bn:             1.10,
            // Armor / generic
            armored_unit:       1.00,
            unknown:            0.80,
        },

    }; // end LAYOUT_CONFIG

    // ── W3-rich render-time helpers ───────────────────────────────────
    // The W3 producer places every red unit on a single phase_line latitude
    // (only longitude varies per unit). Without a spread offset, 70 markers
    // collapse to a horizontal stripe at every phase. We deal the units into
    // role-keyed offsets so each echelon/role gets its own band relative to
    // the source coord; this matches the W1/W2 wargame.py spread idiom but
    // keys off role/echelon since W3 uids are opaque ("R-d3-12-008").

    // Hash a uid to a deterministic small jitter (so two units in the same
    // role don't perfectly overlap). Range ±1.5 km on each axis.
    function uidJitterKm(uid) {
        let h = 0;
        const s = String(uid || '');
        for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
        const e = ((h % 1000) / 1000) * 3 - 1.5;        // -1.5..+1.5
        const n = ((((h >> 10) % 1000) / 1000) * 3) - 1.5;
        return [e, n];
    }

    // Returns km per pixel at a given Leaflet integer zoom level and reference
    // latitude. Leaflet uses 256-px tiles; at zoom z, 2^z tiles span 360°.
    // Used by 'blue-display-stagger' to scale the fan-out ring in real-world
    // km proportionally to screen pixels at the current zoom level.
    function kmPerPixelAtZoom(zoom, refLat) {
        const lat        = (typeof refLat === 'number') ? refLat : 30;
        const degPerTile = 360 / Math.pow(2, zoom);       // degrees lng per tile
        const kmPerTile  = degPerTile * kmPerDegLng(lat); // km per 256-px tile
        return kmPerTile / 256;                            // km per pixel
    }

    // ── computeDisplayOffset — pure display-offset helper ────────────
    // Returns the {eastKm, northKm} display-only offset that should be
    // added to a unit's authoritative coordinate, or null when no offset
    // applies (caller uses the source coord as-is).
    //
    // This function is PURE: no side effects, no marker/map reads, no
    // scenario mutation, same inputs always produce the same output.
    //
    // Modes (PR-96 + PR-100 + PR-102):
    //   'w3-jitter'            — deterministic uid-hash jitter for W3-rich markers.
    //   'red-spread'           — per-uid W1/W2 fan-out spread from LAYOUT_CONFIG.
    //   'blue-action'          — tactical north shift for COUNTERATTACK / WITHDRAW.
    //   'blue-display-stagger' — geographic-index regular polygon fan-out (PR-102).
    //                            clusterIndex/clusterSize from geo-bucket map;
    //                            zoom for km-per-pixel scaling. Isolated units
    //                            get a small uid-hash ring fallback.
    //
    // @param  {{ mode: string, uid?: string, action?: string, echelon?: string,
    //            clusterIndex?: number, clusterSize?: number, zoom?: number }} opts
    // @returns {{ eastKm: number, northKm: number } | null}
    function computeDisplayOffset({ mode, uid, action, echelon, clusterIndex, clusterSize, zoom }) {
        switch (mode) {
            case 'w3-jitter': {
                const [e, n] = uidJitterKm(uid);
                return { eastKm: e, northKm: n };
            }
            case 'red-spread': {
                const spread = LAYOUT_CONFIG.redUnitSpread[uid];
                if (!spread) return null;
                return { eastKm: spread[0], northKm: spread[1] };
            }
            case 'blue-action': {
                if (action === 'COUNTERATTACK')
                    return { eastKm: 0, northKm: LAYOUT_CONFIG.blueCounterattackKmNorth };
                if (action === 'WITHDRAW')
                    return { eastKm: 0, northKm: LAYOUT_CONFIG.blueWithdrawKmNorth };
                return null;  // HOLD / null action → no offset; caller uses baseCoord as-is
            }
            case 'blue-display-stagger': {
                // PR-104: multi-ring fan-out for large Blue clusters; single ring
                // for small clusters (≤ 6 units, covers all actual wargame3
                // clusters); uid-hash ring fallback for isolated units.
                //
                // Pure function — same inputs always yield the same output.
                // Raw scenario coordinates are never read or written here.
                // Red markers, engagement logic, and damage paths are unaffected.
                const ech = String(echelon || '').toLowerCase();
                if (!clusterSize || clusterSize <= 1) {
                    // Isolated unit — uid-hash ring at small fallback radius.
                    // Behaviour preserved from PR-100/102 unchanged.
                    const fbkm = LAYOUT_CONFIG.blueDisplayStaggerFallbackKm;
                    const r = (fbkm && fbkm[ech] !== undefined) ? fbkm[ech] : 1.5;
                    let h = 0;
                    const s = String(uid || '');
                    for (let i = 0; i < s.length; i++)
                        h = ((h << 5) - h + s.charCodeAt(i)) | 0;
                    const angle = ((h >>> 0) % 10000) / 10000 * 2 * Math.PI;
                    return { eastKm: r * Math.cos(angle), northKm: r * Math.sin(angle) };
                }
                const tpx      = LAYOUT_CONFIG.blueDisplayStaggerTargetPx;
                const targetPx = (tpx && tpx[ech] !== undefined) ? tpx[ech] : 8;
                const kmPx     = kmPerPixelAtZoom(zoom || 7, 30);
                const idx      = clusterIndex || 0;
                const sz       = clusterSize;
                if (sz <= 6) {
                    // Small cluster — single polygon ring at full radius (PR-104).
                    // PR-104 increased targetPx/maxKm so pairs/triples/quads
                    // (the actual max in wargame3) achieve ≥ 36 px separation at
                    // zoom 7–9 and are clearly readable.
                    const mxkm  = LAYOUT_CONFIG.blueDisplayStaggerMaxKm;
                    const maxKm = (mxkm && mxkm[ech] !== undefined) ? mxkm[ech] : 4.0;
                    const r     = Math.min(targetPx * kmPx, maxKm);
                    const angle = (2 * Math.PI * idx) / sz;
                    return { eastKm: r * Math.cos(angle), northKm: r * Math.sin(angle) };
                }
                // Large cluster (sz > 6) — deterministic multi-ring layout (PR-104).
                //   Ring 0 (inner):  up to  6 units  at 35 % of outer radius
                //   Ring 1:          up to 12 units  at 60 %
                //   Ring 2:          up to 20 units  at 80 %
                //   Ring 3 (outer):  remaining units at 100 %
                // Units are sorted by uid inside the cluster (done in
                // buildBlueClusterMap), so clusterIndex is stable across redraws.
                const RING_CAP  = [6, 12, 20];               // capacity rings 0,1,2
                const RING_FRAC = [0.35, 0.60, 0.80, 1.00];  // radial fraction per ring
                const mxkm2     = LAYOUT_CONFIG.blueDisplayStaggerMultiRingMaxKm ||
                                  LAYOUT_CONFIG.blueDisplayStaggerMaxKm;
                const outerMaxKm = (mxkm2 && mxkm2[ech] !== undefined) ? mxkm2[ech] : 5.0;
                const outerR    = Math.min(targetPx * kmPx, outerMaxKm);
                // Walk rings to find which ring this unit belongs to
                let ring = RING_CAP.length;  // default: outermost ring (index 3)
                let cumBase = 0;
                for (let ri = 0; ri < RING_CAP.length; ri++) {
                    if (idx < cumBase + RING_CAP[ri]) { ring = ri; break; }
                    cumBase += RING_CAP[ri];
                }
                // cumBase is now the start index of this ring
                const slot        = idx - cumBase;
                const ringCap     = ring < RING_CAP.length ? RING_CAP[ring] : (sz - cumBase);
                const slotsInRing = Math.min(ringCap, sz - cumBase);
                const r           = RING_FRAC[Math.min(ring, RING_FRAC.length - 1)] * outerR;
                const angle       = (2 * Math.PI * slot) / slotsInRing;
                return { eastKm: r * Math.cos(angle), northKm: r * Math.sin(angle) };
            }
            default:
                return null;
        }
    }

    // Apply a SMALL visual jitter to a source coord. The W3 source already
    // encodes meaningful per-domain banding (air at lat 30.3, naval at
    // 30.9, ground at the phase_line, strategic at base). We don't
    // override those positions — we just nudge units a tiny bit so a
    // pile-up of 10 destroyers at the same source coord doesn't render
    // as one icon. Range: ±1.5 km on each axis, deterministic per uid.
    function applyW3Spread(meta, lonLat, stepIndex) {
        if (!lonLat) return lonLat;
        const { eastKm, northKm } = computeDisplayOffset({ mode: 'w3-jitter', uid: meta.uid });
        return offsetLonLat(lonLat, eastKm, northKm);
    }

    // Engagement-arc colors (per Wargame3/schema/README.md "Status → color recipe").
    const STATUS_COLORS = {
        destroyed:       '#b00020',  // red — full kill
        damaged_partial: '#d97706',  // orange — partial; intensity by damage_pct
        suppressed:      '#ca8a04',  // yellow — combat-effective but pinned
        delayed:         '#7c3aed',  // purple — arrival/movement slowed
        expended:        '#2563eb',  // blue — munitions consumed (SSMs, USVs)
        unchanged:       '#4b5563',  // gray — engagement happened, no effect
    };

    // Per-step engagement-arc layers (W3-rich). Cleared at the top of every
    // applyState call, mirroring the attackArrows lifecycle. Each arc is a
    // dashed L.polyline per the W3 schema (Wargame3/schema/README.md §5).
    let engagementArcs = [];
    let engagementArcTimers = [];

    // Per-step Blue actions — fallback only. The server now emits
    // state.blue_actions per step (see adjudicator-schema.js
    // BLUE_ACTIONS_BY_STEP_BASELINE). This local table is consulted when
    // state.blue_actions is missing (older trial replays, partial LLM
    // responses, offline replay of a cached scenario). Mirror of wargame.py
    // make_steps second branch — the Wargame2 baseline.
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
    // Compute progress 0..1 from the per-step state. We use phase_line_km /
    // objDepthKm — same idiom as wargame.py (step.progress drives every
    // unit position). Falls back to step_index/(stepCount-1) when PL is missing,
    // using the scenario's actual step count (W1/W2: 12, W3: 17) instead of a
    // hardcoded /11 that would saturate early on 17-step scenarios.
    function progressFromState(state) {
        if (!state) return 0;
        if (Number.isFinite(state.progress)) return clamp01(state.progress);
        if (Number.isFinite(state.phase_line_km) && objDepthKm > 0) {
            return clamp01(state.phase_line_km / objDepthKm);
        }
        if (Number.isFinite(state.step_index)) {
            const total = (scenarioRef && Array.isArray(scenarioRef.steps) && scenarioRef.steps.length)
                ? scenarioRef.steps.length : 12;
            return clamp01(state.step_index / Math.max(1, total - 1));
        }
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

        const seaOffset = LAYOUT_CONFIG.blsSeaOffsets[meta.bls] || [0, 10];
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
        const redOff = computeDisplayOffset({ mode: 'red-spread', uid: meta.uid });
        if (stepIndex >= 3 && redOff) {
            pos = offsetLonLat(pos, redOff.eastKm, redOff.northKm);
        }
        return pos;
    }

    // W3-rich position function. Mirrors W1's redPositionLonLat — same
    // "sea staging → coastal foothold → BLS-anchored axis toward OBJ"
    // pattern — but uses the W3 role vocabulary (armored_brigade,
    // mech_inf_div, strike, fighter_ad, …) and three domain regimes:
    //
    //   • ground / SOF: lerp BLS-1 → OBJ with role-based progress cap.
    //     Armor/mech main-effort runs to 100%, infantry to 90%, arty
    //     stays at 50%, signal/EW way back at 20%, SOF runs ahead of
    //     the front by +8% (capped at 1.0).
    //
    //   • air: helicopter sqns hover ~5 km behind the advancing front
    //     (they're escorting ground); fixed-wing (fighters/strike/
    //     transport) sit at offshore staging — they're conceptually
    //     launching from the off-map air bases and only "appear" at
    //     strike points (which we don't model per-strike).
    //
    //   • naval / submarine: stay offshore at staging, slight inland
    //     creep at D-H to support the landing, then hold.
    //
    //   • strategic SSM / SAM / radar: stay at staging (these are
    //     fixed-site assets in the source).
    //
    // Per-unit jitter + role-keyed spread fans the cluster out so 70
    // units don't pile up on a single axis.
    // Roles that NEVER advance toward OBJ — they're fixed-site or
    // sea-based assets. Return positions are absolute (relative to
    // BLS-1 or a domain-specific anchor), not lerped progress.
    function w3StaticPosition(meta, blsCoord, stagingLat) {
        const role = String(meta.role || '').toLowerCase();
        const domain = String(meta.domain || '').toLowerCase();
        // Strategic SSM brigade / radar / SAM batteries: stay at staging.
        if (/ssm_brigade|radar|sam_|sam$/i.test(role)) {
            return [blsCoord[0], stagingLat];
        }
        // Naval / submarine: stay offshore. Naval units use a small
        // east-of-coast offset so they're visibly distinct from ground.
        if (domain === 'naval' || domain === 'subsurface' || /destroyer|frigate|corvette|landing_ship|missile_boat|hovercraft|mine_layer|mine_sweeper|submarine|naval_unit/i.test(role)) {
            // Spread naval units along the offshore staging line by uid.
            const [je] = uidJitterKm(meta.uid);
            return offsetLonLat([blsCoord[0], stagingLat], je * 3, 0);
        }
        return null;   // not a static-role unit
    }

    function redPositionW3LonLat(meta, stepIndex, progress) {
        // TRUST THE SOURCE. The W3 producer authored each unit's coord
        // per phase deliberately — air at the operating zone, naval
        // offshore, ground at the line of contact, SSM at base. Earlier
        // we tried to override these with a BLS→OBJ lerp; that made
        // every unit collapse onto a single axis and broke the natural
        // domain-banded layout. Use the raw per-step coord and apply
        // only a small visual spread to break up overlaps within the
        // same band.
        const arr  = scenarioRef && scenarioRef.red_unit_step_coords &&
                     scenarioRef.red_unit_step_coords[meta.uid];
        if (Array.isArray(arr) && arr.length) {
            const c = arr[Math.min(stepIndex, arr.length - 1)];
            if (c) return applyW3Spread(meta, c, stepIndex);
        }
        // No per-step array? Fall back to whatever baseCoord the porter
        // seeded the marker with (still in source-coord space).
        return meta.baseCoord || null;
    }

    // Resolve the per-step Blue action map. Prefer the server's
    // state.blue_actions (data-driven, may reflect live AI / posture varied
    // schedules); fall back to the local BLUE_ACTIONS_BY_STEP table for
    // back-compat with older trials and offline replays.
    function blueActionsFor(stepIndex, state) {
        if (state && state.blue_actions && typeof state.blue_actions === 'object') {
            return state.blue_actions;
        }
        return BLUE_ACTIONS_BY_STEP[stepIndex] || null;
    }

    // Port of wargame.py blue_position(). COUNTERATTACK shifts +5 km N for
    // the duration of the step, WITHDRAW shifts -5 km N. All other Blue
    // units hold their base coord (AREA_DEFENSE).
    function bluePositionLonLat(meta, stepIndex, state) {
        if (!meta || !meta.baseCoord) return meta && meta.baseCoord;
        const actions = blueActionsFor(stepIndex, state);
        const action = actions ? actions[meta.baseId] : null;
        const blueOff = computeDisplayOffset({ mode: 'blue-action', action });
        if (blueOff) return offsetLonLat(meta.baseCoord, blueOff.eastKm, blueOff.northKm);
        return meta.baseCoord;
    }

    // Map of "destroyed" effects on existing user-placed Blue markers,
    // keyed by their Leaflet marker._leaflet_id so we can restore on reset.
    const destroyedMarkers = new Map();

    function hasMap() { return typeof window !== 'undefined' && window.L && window.map; }

    // Fit the map to the friendly operational area (objective + landing sites +
    // Blue laydown), with map_bbox as fallback. Extracted so the clean-view
    // "present scenario" path (P3) can re-frame after side panels collapse and
    // the map viewport width changes. Read-only: no scenario/marker mutation.
    function fitScenarioAO() {
        if (!hasMap()) return false;
        try {
            const aoPts = [];
            if (Array.isArray(objCoord) && objCoord.length === 2) aoPts.push([objCoord[1], objCoord[0]]);
            Object.keys(blsCoordByName).forEach((k) => {
                const c = blsCoordByName[k];
                if (Array.isArray(c) && c.length === 2) aoPts.push([c[1], c[0]]);
            });
            Object.keys(blueMarkers).forEach((uid) => {
                const m = blueMarkers[uid];
                if (m && typeof m.getLatLng === 'function') { const ll = m.getLatLng(); aoPts.push([ll.lat, ll.lng]); }
            });
            const bb = scenarioRef && scenarioRef.map_bbox;
            if (aoPts.length >= 2) {
                window.map.fitBounds(aoPts, { padding: [44, 44], maxZoom: 11, animate: true });
                return true;
            }
            if (Array.isArray(bb) && bb.length === 4) {
                window.map.fitBounds([[bb[1], bb[0]], [bb[3], bb[2]]], { padding: [30, 30], maxZoom: 10, animate: true });
                return true;
            }
        } catch (_) { /* ignore */ }
        return false;
    }

     // Inject a single <style> tag so destroyed-marker fades animate smoothly
     // instead of jumping. Runs once per page load.
     (function injectStyles() {
         if (typeof document === 'undefined' || document.getElementById('wg-adj-styles')) return;
         const style = document.createElement('style');
         style.id = 'wg-adj-styles';
         style.textContent = `
             /* PR-102C: transform transition removed so markers snap to their
              * Leaflet-assigned position immediately on load, refresh, and
              * zoom, preventing the cinematic "entering the frame" effect.
              * opacity/filter transitions are kept so destroyed/damaged state
              * changes still crossfade visually. */
             .wg-adj-sidc,
             .wg-adj-diamond,
             .wg-adj-square,
             .wg-adj-dot,
             .wg-adj-bls,
             .wg-adj-obj,
             .wg-adj-offmap,
             .wg-adj-breach {
                 transition: opacity 400ms ease-in-out,
                             filter  400ms ease-in-out;
             }
             /* W3 scenarios: opacity/filter extended to 600ms for longer
              * phase pacing (schema README "2-3s per phase"). Transform
              * animation removed — PR-102C. */
             body.wg-w3 .wg-adj-sidc,
             body.wg-w3 .wg-adj-diamond,
             body.wg-w3 .wg-adj-square,
             body.wg-w3 .wg-adj-dot {
                 transition: opacity 600ms ease-in-out,
                             filter  600ms ease-in-out;
             }
             /* Destroyed treatment — mirrors wargame.py draw_unit_box():
              * the icon (NATO/SIDC SVG or div) is desaturated to gray, but
              * the black X overlay stays at full opacity over the top. */
             .wg-destroyed > *:not(.wg-adj-x) {
                 filter: grayscale(1) brightness(0.85);
                 opacity: 0.85;
             }
             /* Damaged friendly is rendered via NATO SIDC status digit ('3').
              * The .wg-adj-damage rule below stays for the fallback overlay. */
             .wg-adj-damage {
                 opacity: 1 !important;
                 pointer-events: none;
             }
             /* Destroyed X: boom-pop appearance when the X is first added so
              * the kill is visible as an event, not just static state. The
              * 'forwards' fill-mode keeps the final scale + opacity 1 after
              * the animation completes, so the X stays put across redraws. */
             .wg-adj-x {
                 pointer-events: none;
                 animation: wg-adj-x-pop 600ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
             }
             @keyframes wg-adj-x-pop {
                 0%   { opacity: 0; transform: scale(2.2); }
                 60%  { opacity: 1; transform: scale(0.92); }
                 100% { opacity: 1; transform: scale(1); }
             }
             /* Explosion burst spawned at a blue's position right before the
              * destroyed X pops in. Orange/yellow radial ring scales out and
              * fades — reads as a "small action" / impact event. */
             .wg-adj-explosion {
                 pointer-events: none;
                 animation: wg-adj-explosion 300ms cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
             }
             @keyframes wg-adj-explosion {
                 0%   { opacity: 0;   transform: scale(0.2); }
                 30%  { opacity: 1;   transform: scale(1.2); }
                 100% { opacity: 0;   transform: scale(2.4); }
             }
             /* Continuous pulse for counterattack arrows — gives a clear
              * "this unit is firing back" feel without any text label. */
             .wg-attack-pulse {
                 animation: wg-attack-pulse-anim 1.4s ease-in-out infinite;
             }
             @keyframes wg-attack-pulse-anim {
                 0%, 100% { opacity: 0.85; }
                 50%      { opacity: 0.35; }
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
    // Multi-line tooltip for a BLS — full role text + site assessment
    // (score, throughput, terrain, nearest blue defender). Surfaces the
    // JSON fields that otherwise sit unused (`score`, `terrain_friction`,
    // `nearest_blue_km`, `throughput`, `capacity`) so the operator can read
    // why a beach was picked.
    function buildBlsTooltip(bls, status) {
        if (!bls) return '';
        const parts = [
            `<strong>${esc(bls.name)} — ${esc(status || 'STAGED')}</strong>`,
            `<em>${esc(bls.role || '')}</em>`,
        ];
        if (Number.isFinite(bls.score))            parts.push(`Score: ${bls.score}`);
        if (bls.terrain_friction)                  parts.push(`Terrain: ${esc(bls.terrain_friction)}`);
        if (Number.isFinite(bls.throughput))       parts.push(`Throughput: ${bls.throughput}`);
        if (Number.isFinite(bls.capacity))         parts.push(`Capacity: ${bls.capacity}`);
        if (bls.nearest_blue_uid)                  parts.push(`Nearest Blue: ${esc(bls.nearest_blue_uid)}${Number.isFinite(bls.nearest_blue_km) ? ` (${bls.nearest_blue_km.toFixed(1)} km)` : ''}`);
        if (bls.permanently_limited)               parts.push(`<span style="color:#f3a">limited capacity</span>`);
        return parts.join('<br>');
    }

    function buildObjTooltip(obj, displayStatus) {
        if (!obj) return '';
        const parts = [`<strong>${esc(obj.name || 'OBJ')} — ${esc(displayStatus || 'DORMANT')}</strong>`];
        if (Number.isFinite(obj.target_depth_km)) parts.push(`Depth from coast: ${obj.target_depth_km} km`);
        if (Number.isFinite(obj.radius_km))       parts.push(`Security ring: ${obj.radius_km} km`);
        if (obj.carver != null)                   parts.push(`CARVER: ${esc(String(obj.carver))}/60`);
        return parts.join('<br>');
    }

    // Short, glanceable role tag for the BLS — the JSON's `role` is too
    // long ("Eastern fixing or envelopment") for an on-map label.
    function shortBlsRole(role) {
        if (!role) return '';
        const r = String(role).toLowerCase();
        if (r.indexOf('main effort') >= 0)        return 'MAIN';
        if (r.indexOf('envelopment') >= 0)        return 'ENVL';
        if (r.indexOf('fixing') >= 0)             return 'FIX';
        if (r.indexOf('supporting') >= 0)         return 'SUP';
        if (r.indexOf('reserve') >= 0)            return 'RSV';
        return role.slice(0, 4).toUpperCase();
    }

    function blsIcon(color, label, role) {
        const w = 32, h = 18;
        const roleTag = shortBlsRole(role);
        const roleHtml = roleTag
            ? `<div style="
                position:absolute;top:${h + 2}px;left:-12px;width:${w + 24}px;
                text-align:center;font-size:9px;color:#fff;font-weight:700;
                letter-spacing:0.05em;
                text-shadow:0 0 3px #000, 0 0 2px #000;
              ">${roleTag}</div>`
            : '';
        const totalH = h + 8 + (roleTag ? 14 : 0);
        return window.L.divIcon({
            html: `<div style="position:relative;width:${w}px;height:${totalH}px;">
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
                ${roleHtml}
            </div>`,
            className: 'wg-adj-bls',
            iconSize:   [w, totalH],
            iconAnchor: [w / 2, h],  // anchor at the bottom-center (beach line)
        });
    }

    // Off-map marker icon. Uses milsymbol's APP-6D installation icon
    // (symbol set 20) so the operator sees the doctrinal symbol — naval
    // ports, airfields, SSM sites, and logistics installations each get
    // their proper NATO shape — colored by side affiliation. We wrap the
    // milsymbol SVG in a div so we can add a small id label below it and
    // dim the whole thing (off-map markers are context, not contestants).
    // Falls back to a Unicode-glyph div when milsymbol isn't loaded or
    // the SIDC isn't a recognized installation code.
    function offMapMarkerIcon(om) {
        const id   = om.id || '';
        const sidc = om.sidc || null;
        const size = 22;       // smaller than on-map unit icons (typ. 30-44)
        if (sidc && window.ms && typeof window.ms.Symbol === 'function') {
            try {
                const sym = new window.ms.Symbol(sidc, {
                    size,
                    standardIdentity: String(om.side || '').toUpperCase() === 'RED' ? 'Hostile' : 'Friend',
                    simpleStatusModifier: true,
                });
                const w = Math.max(size, sym.getSize().width);
                const h = Math.max(size, sym.getSize().height);
                const svg = sym.asSVG();
                return window.L.divIcon({
                    html: `<div style="
                        position:relative;width:${w}px;height:${h + 14}px;
                        opacity:0.78;pointer-events:auto;
                      ">
                        <div style="width:${w}px;height:${h}px;">${svg}</div>
                        <div style="
                            position:absolute;top:${h - 2}px;left:-10px;width:${w + 20}px;
                            text-align:center;font-size:9px;color:#eee;font-weight:700;
                            text-shadow:0 0 3px #000, 0 0 2px #000;letter-spacing:0.04em;
                        ">${id}</div>
                      </div>`,
                    className: 'wg-adj-offmap',
                    iconSize:   [w, h + 14],
                    iconAnchor: [w / 2, h / 2],
                });
            } catch (_) { /* fall through to glyph */ }
        }
        // Fallback: side-colored glyph + id (no milsymbol available).
        const isRed = String(om.side).toUpperCase() === 'RED';
        const color = isRed ? '#a02020' : '#1f4d80';
        const glyph = ({
            naval_base:     '⚓',
            air_base:       '✈',
            ssm_brigade:    '⇪',
            logistics_node: '◫',
        })[om.type] || '◇';
        const w = 26, h = 26;
        return window.L.divIcon({
            html: `<div style="
                position:relative;width:${w}px;height:${h}px;
                opacity:0.78;pointer-events:auto;
              ">
                <div style="
                    width:${w}px;height:${h}px;border-radius:50%;
                    background:${color};
                    border:1.5px dashed rgba(255,255,255,0.65);
                    box-shadow:0 0 3px rgba(0,0,0,.5);
                    display:flex;align-items:center;justify-content:center;
                    color:#fff;font-size:14px;line-height:1;
                ">${glyph}</div>
                <div style="
                    position:absolute;top:${h - 2}px;left:-10px;width:${w + 20}px;
                    text-align:center;font-size:9px;color:#eee;font-weight:700;
                    text-shadow:0 0 3px #000, 0 0 2px #000;letter-spacing:0.04em;
                ">${id}</div>
              </div>`,
            className: 'wg-adj-offmap',
            iconSize:   [w, h + 12],
            iconAnchor: [w / 2, h / 2],
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

    // Derive a NATO APP-6 SIDC from unit role/echelon when a scenario does
    // not ship a literal SIDC. This is especially important for Wargame 3,
    // whose raw GeoJSON carries type/echelon metadata but no sidc field.
    function derivedSidcFor(unit, affiliationPrefix) {
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

        // Positions 1-6: version + affiliation + land
        // Positions 7-10: hqEch     (HQ flag + echelon, e.g. '0218')
        // Positions 11-20: iconMod  (main icon + mods, e.g. '1211020000')
        return affiliationPrefix + hqEch + iconMod;
    }

    // Derive a hostile (APP-6 affiliation digit 6) SIDC for a Red unit. We
    // mirror the Blue template patterns the operator's app uses, so the
    // renderer produces matching military-symbology rectangles with the
    // correct size modifier (`I`/`II`/`X`/`XX`).
    function redSidcFor(unit) {
        return derivedSidcFor(unit, '100610');
    }

    // Friendly equivalent for imported Blue units that have role/echelon but
    // no literal SIDC on disk.
    function blueSidcFor(unit) {
        return derivedSidcFor(unit, '100310');
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
    // Re-render the tactical-graphic arrows (advance + counterattack + kill)
    // at the current zoom level. The graphics are built as L.marker divIcons
    // whose SVGs are sized in pixels at creation; on a zoom change the world
    // around them rescales while they stay the same px size, making them look
    // tiny when zoomed in and oversized when zoomed out. Wiping and rebuilding
    // on zoomend gives the operator a consistently-proportioned arrow.
    function rerenderTacticalArrowsForZoom() {
        if (!lastAppliedState || !lastAppliedScenario) return;
        if (!layerGroup) return;
        // Pass {instant: true} so we don't replay the snake-in draw-on animation
        // on every wheel-tick — only the geometry needs to refresh.
        try { updateAdvanceArrows(lastAppliedState, lastAppliedScenario, { instant: true }); } catch (_) {}
        try { updateAttackArrows(lastAppliedState, lastAppliedScenario); } catch (_) {}
    }
    let _zoomHookBound = false;
    function bindZoomHookOnce() {
        if (_zoomHookBound || !hasMap()) return;
        window.map.on('zoomend', rerenderTacticalArrowsForZoom);
        _zoomHookBound = true;
    }

    // ── Scenario graphics pane ───────────────────────────────────────
    // Creates a named Leaflet pane for all scenario tactical overlays
    // (advance/kill/counterattack arrows, engagement arcs, AO polygons,
    // pipeline, phase line). z-index 520 places scenario graphics above
    // the user ManeuverArrow pane (410) but below unit marker icons (600).
    // Idempotent — safe to call from both drawScenario and applyState.
    const SCENARIO_GRAPHICS_PANE = 'rmoozScenarioGraphicsPane';
    function ensureScenarioGraphicsPane() {
        const m = window.map;
        if (!m || typeof m.createPane !== 'function') return;
        if (!m.getPane(SCENARIO_GRAPHICS_PANE)) {
            m.createPane(SCENARIO_GRAPHICS_PANE).style.zIndex = '520';
        }
    }

    function drawScenario(scenario) {
        if (!hasMap() || !scenario) return false;
        ensureScenarioGraphicsPane();
        clearScenario();
        bindZoomHookOnce();

        // Tag body with the schema variant so CSS can lengthen the marker
        // transition on W3 (where the D-H staging→coast sweep is ~55 km
        // and a 500ms transition reads as a teleport; 1500ms reads as
        // motion). No-op on legacy W1/W2 scenarios.
        try {
            const cls = document.body.classList;
            cls.remove('wg-w3', 'wg-w4');
            if (scenario.schema_variant === 'w3-rich')  cls.add('wg-w3');
            if (scenario.schema_variant === 'w4-strike') cls.add('wg-w4');
        } catch (_) { /* ignore */ }

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
            const roleLabel = ao.role ? displayRole(ao.role) : '';
            const lengthTxt = Number.isFinite(ao.lengthKm) ? `${ao.lengthKm} km` : '';
            const pillHtml = (roleLabel || lengthTxt)
                ? `${esc(roleLabel)}${lengthTxt ? ' · ' + lengthTxt : ''}`
                : '';
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
                        pane: SCENARIO_GRAPHICS_PANE,
                    }).bindTooltip(`AO: ${esc(displayRole(ao.role || ''))}${lengthTxt ? ' (' + lengthTxt + ')' : ''}`, { sticky: true });
                    line.addTo(layerGroup);
                    aoLayers.push(line);

                    // Centered label pill at the polygon centroid so the
                    // operator can read which AO is whose without hovering.
                    if (pillHtml) {
                        let sumLat = 0, sumLng = 0;
                        for (const [lng, lat] of ring) { sumLat += lat; sumLng += lng; }
                        const n = ring.length || 1;
                        const center = [sumLat / n, sumLng / n];
                        const label = window.L.marker(center, {
                            interactive: false,
                            pane: SCENARIO_GRAPHICS_PANE,
                            icon: window.L.divIcon({
                                className: 'wg-adj-ao-label',
                                html: `<div style="
                                    background:rgba(58,150,210,0.85);
                                    color:#fff;font-size:10px;font-weight:700;
                                    letter-spacing:0.04em;
                                    padding:2px 6px;border-radius:3px;
                                    border:1px solid rgba(255,255,255,0.4);
                                    white-space:nowrap;
                                    text-shadow:0 0 2px #000;
                                    box-shadow:0 0 3px rgba(0,0,0,.4);
                                ">${pillHtml}</div>`,
                                iconSize:   null,
                                iconAnchor: [0, 0],
                            }),
                        });
                        label.addTo(layerGroup);
                        aoLayers.push(label);
                    }
                }
            }
        }

        // BLS markers — NATO doctrinal amphibious-landing semicircles.
        // Role + score + terrain are stashed on the marker so subsequent
        // setIcon calls (status updates) can re-render the role tag and
        // tooltip rebuilds can pull the full site assessment.
        for (const bls of scenario.bls_template || []) {
            const m = window.L.marker(
                [bls.coord[1], bls.coord[0]],
                {
                    icon: blsIcon(COLORS.BLS.STAGED, bls.name.replace('BLS-', ''), bls.role),
                    title: `${bls.name} — ${bls.role}`,
                },
            ).bindTooltip(buildBlsTooltip(bls, 'STAGED'), { permanent: false, sticky: true });
            m._wgBls = {
                name:             bls.name,
                role:             bls.role,
                score:            bls.score,
                terrain_friction: bls.terrain_friction,
                nearest_blue_uid: bls.nearest_blue_uid,
                nearest_blue_km:  bls.nearest_blue_km,
                throughput:       bls.throughput,
                capacity:         bls.capacity,
            };
            m.addTo(layerGroup);
            blsMarkers[bls.name] = m;
        }

        // Off-map markers (W3-only). Naval bases, air bases, SSM brigades,
        // logistics nodes that exist outside the AO but matter operationally.
        // Phase-independent: same coords across all 17 steps so we draw them
        // once in drawScenario, not on every applyState. Rendered smaller
        // and dimmer than on-map units to read as context. Uses real APP-6D
        // installation SIDCs (symbol set 20) baked in by the porter.
        for (const om of (scenario.off_map_markers || [])) {
            if (!om || !Array.isArray(om.coord) || om.coord.length !== 2) continue;
            const m = window.L.marker(
                [om.coord[1], om.coord[0]],
                {
                    icon:  offMapMarkerIcon(om),
                    title: `${om.id} — ${om.side} ${om.type}`,
                },
            ).bindTooltip(
                `<strong>${om.id}</strong> · ${om.side} ${om.type}` +
                (om.name_ar ? `<br>${om.name_ar}` : '') +
                (om.name_en ? `<br>${om.name_en}` : ''),
                { sticky: true },
            );
            m._sidc    = om.sidc || null;
            m._wgOffMap = om;
            m.addTo(layerGroup);
            offMapMarkerLayers.push(m);
        }

        // OBJ NASSER + security ring. The ring uses obj.radius_km (a JSON
        // field that wasn't being drawn) so the operator can see at a
        // glance how big the objective area is relative to the red
        // advance.
        const obj = scenario.obj;
        if (obj && obj.coord) {
            objMarker = window.L.marker(
                [obj.coord[1], obj.coord[0]],
                { icon: targetIcon(COLORS.OBJ.DORMANT, obj.name), title: obj.name },
            ).bindTooltip(buildObjTooltip(obj, 'DORMANT'), { permanent: false, sticky: true });
            objMarker.addTo(layerGroup);

            if (Number.isFinite(obj.radius_km) && obj.radius_km > 0) {
                objSecurityRing = window.L.circle([obj.coord[1], obj.coord[0]], {
                    radius:      obj.radius_km * 1000,
                    color:       COLORS.OBJ.DORMANT,
                    weight:      1.5,
                    opacity:     0.6,
                    fillColor:   COLORS.OBJ.DORMANT,
                    fillOpacity: 0.05,
                    dashArray:   '6 5',
                    interactive: false,
                }).bindTooltip(`${obj.name} security ring (${obj.radius_km} km)`, { sticky: true });
                objSecurityRing.addTo(layerGroup);
            }
        }

        // Pipeline route. We keep the dashed purple polyline as the literal
        // map reference (it follows the actual pipeline bends through the
        // terrain), but ALSO overlay a NATO 'main-attack' tactical graphic
        // straight from coast to OBJ so the operator reads the route as a
        // doctrinal axis of advance, not just a geographic line. The
        // pipelineLatLngs / pipelineSegmentKm caches still drive the
        // per-step advance-along-pipeline fill below.
        if (Array.isArray(scenario.pipeline) && scenario.pipeline.length > 1) {
            const latlngs = scenario.pipeline.map(p => [p[1], p[0]]);
            pipelineLatLngs = latlngs;
            pipelineSegmentKm = [0];
            for (let i = 1; i < latlngs.length; i++) {
                const km = haversineKm(latlngs[i - 1], latlngs[i]);
                pipelineSegmentKm.push(pipelineSegmentKm[i - 1] + km);
            }
            // Subtle dashed reference line (still useful for orientation).
            pipelineLine = window.L.polyline(latlngs, {
                color: COLORS.PIPELINE,
                weight: 1.5,
                opacity: 0.55,
                dashArray: '4 6',
                interactive: false,
                pane: SCENARIO_GRAPHICS_PANE,
            }).bindTooltip('Nasser–Brega pipeline route', { sticky: true });
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
                side:      'RED',
                role:      unit.role,
                bls:       unit.bls,
                appear:    Number.isFinite(unit.appear) ? unit.appear : 0,
                label:     unit.label,
                echelon:   unit.echelon,
                baseCoord,
            };

            // Initial placement.
            // W3-rich: use the per-unit coordinate extracted directly from the
            // source GeoJSON step data (authentic positions for each of 84 units).
            // Other schemas: compute from the BLS→OBJ axis via redPositionLonLat.
            let initialLonLat;
            if (scenario.schema_variant === 'w3-rich' && baseCoord) {
                initialLonLat = baseCoord;
            } else {
                initialLonLat = redPositionLonLat(meta, 0, 0);
                if (!initialLonLat) {
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
            }

            // Prefer the porter-baked SIDC (W3-rich scenarios) since it
            // encodes name_ar → APP-6 main icon properly (helicopter,
            // submarine, destroyer, AEW, etc.). Fall back to the legacy
            // derived SIDC from role+echelon for W1/W2 where unit.sidc is
            // absent. Same pattern as the blue marker creation below.
            const sidc = unit.sidc || redSidcFor(unit);
            const size = redIconSize(unit.echelon);
            const icon = sidcIcon(sidc, size) || diamondIcon(COLORS.RED_UNIT, unit.label);
            const m = window.L.marker(
                [initialLonLat[1], initialLonLat[0]],
                { icon, title: (unit.label || displayRedId(unit.uid)) + ' — ' + displayRole(unit.role) },
            ).bindTooltip(
                `${unit.label || displayRedId(unit.uid)} — ${displayRole(unit.role)} — STAGED` +
                // PR-109: Red staging-cluster transparency note.
                // Informs the operator that co-located Red markers are intentional
                // staging-area groupings, not a display error.
                // No raw coords exposed, no Event Log entries, no storage writes.
                `<div style="margin-top:4px;padding-top:3px;border-top:1px solid #3a2a2a;font-size:9px;color:#8a6a6a;font-style:italic;">${esc((window.t && window.t('tooltip-red-staging-note')) || 'Multiple Red units may be intentionally staged at this assembly area.')}</div>`,
                { permanent: false }
            );
            m._wgRedMeta = meta;
            // Expose the same hooks the Units feature attaches to drag-placed
            // markers, so red-team-controller.scanMapForUnits() can discover
            // these scenario markers and the headless propose+execute loop
            // gets a real unit list to plan against. Without these the COA
            // loop sees an empty battlefield (counts.hostile = 0) and the
            // adjudicator falls straight through to the scripted baseline.
            m._sidc     = sidc;
            m._iconSize = size;
            m._unitId   = unit.uid;
            m._unitData = {
                id:    unit.uid,
                name:  unit.label || unit.name_ar || unit.uid,
                code:  unit.uid,
                sidc:  sidc,
                side:  'hostile',
                level: unit.echelon || null,
                role:  unit.role || null,
                domain: unit.domain || null,
                bls:   unit.bls || null,
                _scenario: true,
            };
            // P5 (Wargame3 live): clicking a scenario unit selects it and feeds the
            // read-only Selected Unit panel. Uses the marker's live displayed
            // position (Red's raw coord is a stacked staging point).
            m.on('click', () => {
                try {
                    const ll = m.getLatLng && m.getLatLng();
                    const detailUnit = ll ? Object.assign({}, m._unitData, { lat: ll.lat, lng: ll.lng }) : m._unitData;
                    document.dispatchEvent(new CustomEvent('rmooz:unit-selected', {
                        detail: { unit: detailUnit, selectedAt: Date.now() },
                    }));
                } catch (_) { /* never throw on selection */ }
            });
            // Register in the unit lifecycle (active/degraded/destroyed) and
            // expose the registry entry on the marker so the renderer can
            // walk parent/root without re-deriving each frame.
            registerRedUnit(unit);
            m._wgUnit = unitRegistry[unit.uid];
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
            const sidc = unit.sidc || blueSidcFor(unit);
            const icon = sidcIcon(sidc, size) || squareIcon(COLORS.BLUE_UNIT, unit.base_id, Math.max(10, Math.round(size / 2)));
            const m = window.L.marker(
                [unit.coord[1], unit.coord[0]],
                { icon, title: displayBlueId(unit.base_id) + (unit.role ? ' · ' + displayRole(unit.role) : '') + (unit.echelon ? ' (' + unit.echelon + ')' : '') },
            ).bindTooltip(
                `${displayBlueId(unit.base_id)}${unit.echelon ? ' (' + unit.echelon + ')' : ''} — ACTIVE` +
                // PR-107: display-offset transparency footer (Blue units only).
                // textContent-equivalent: esc() encodes the i18n string before
                // inserting into the template. No raw coords, no event log, no storage.
                `<div style="margin-top:4px;padding-top:3px;border-top:1px solid #2a3a4a;font-size:9px;color:#6a7a8a;font-style:italic;">${esc((window.t && window.t('tooltip-display-offset-notice')) || 'Displayed position is offset for readability.')}</div>`,
                { permanent: false }
            );
            m._wgBlueMeta = {
                uid:       unit.unit_uid,
                side:      'BLUE',
                baseId:    unit.base_id,
                baseCoord: unit.coord.slice(),
                echelon:   unit.echelon,
                role:      unit.role || null,
                appear:    Number.isFinite(unit.appear) ? unit.appear : 0,
            };
            // Same Units-feature hooks as the Red side — see comment above.
            // unit.unit_uid is e.g. "BLUE_lc"; SIDC's affiliation digit is
            // '3' (friendly), which scanMapForUnits classifies as friendly.
            m._sidc     = sidc || null;
            m._iconSize = size; // needed so the damaged/active SIDC rebuild keeps the same scale
            m._unitId   = unit.unit_uid;
            m._unitData = {
                id:    unit.unit_uid,
                name:  unit.label || unit.name_ar || unit.base_id || unit.unit_uid,
                code:  unit.base_id || unit.unit_uid,
                sidc:  sidc || null,
                side:  'friendly',
                level: unit.echelon || null,
                role:  unit.role || null,
                domain: unit.domain || null,
                lat:   unit.coord[1],
                lng:   unit.coord[0],
                _scenario: true,
            };
            // P5 (Wargame3 live): clicking a scenario unit selects it and feeds the
            // read-only Selected Unit panel. Same event the placed-units layer uses
            // (unit-panel.js renders detail.unit); additive — does not block tooltip.
            m.on('click', () => {
                try {
                    document.dispatchEvent(new CustomEvent('rmooz:unit-selected', {
                        detail: { unit: m._unitData, selectedAt: Date.now() },
                    }));
                } catch (_) { /* never throw on selection */ }
            });
            // Register in the unit lifecycle and expose the registry entry
            // so the renderer can walk parent/root (lc → b<X>c → p<X><Y>c
            // → c<X><Y><Z>) without re-deriving the chain each step.
            registerBlueUnit(unit);
            m._wgUnit = unitRegistry[unit.unit_uid];
            m.addTo(layerGroup);
            blueMarkers[unit.unit_uid] = m;
        }

        // Fit the map view to the friendly operational area the first time, so the
        // amphibious AO fills the view instead of the whole region. Red staging
        // advances into view as the operation steps forward. (Reusable for P3.)
        fitScenarioAO();

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

        // PR-106: bottom-left display-offset info chip — visual-only notice.
        // Informs the operator that unit icon positions may be display-offset
        // for readability; raw tactical coordinates and adjudication logic are
        // always authoritative and never altered by the fan-out.
        // Purely static markup: textContent only, no innerHTML, no event log
        // entries, no storage, no backend calls. Auto-updates on lang switch
        // via data-i18n (processed by applyLanguage() in i18n.js).
        if (!displayOffsetNotice && window.L) {
            displayOffsetNotice = window.L.control({ position: 'bottomleft' });
            displayOffsetNotice.onAdd = function () {
                const div = window.L.DomUtil.create('div', 'wg-adj-display-offset-notice');
                div.style.cssText = [
                    'background:rgba(15,22,35,.78)',
                    'color:#8a9ab0',
                    'font-family:sans-serif',
                    'font-size:10px',
                    'line-height:1.45',
                    'padding:4px 9px',
                    'border-radius:3px',
                    'border:1px solid rgba(60,80,110,.38)',
                    'max-width:290px',
                    'margin-bottom:6px',
                    'pointer-events:none',
                    'user-select:none',
                ].join(';');
                const span = document.createElement('span');
                span.setAttribute('data-i18n', 'map-display-offset-notice');
                span.textContent = (window.t && window.t('map-display-offset-notice')) ||
                    'Display offsets are visual only. Raw coordinates and adjudication logic remain unchanged.';
                div.appendChild(span);
                window.L.DomEvent.disableClickPropagation(div);
                return div;
            };
            displayOffsetNotice.addTo(window.map);
        }
    }

    function removeSitrep() {
        if (sitrepControl && window.map) {
            try { window.map.removeControl(sitrepControl); } catch (_) {}
        }
        sitrepControl = null;
        if (displayOffsetNotice && window.map) {
            try { window.map.removeControl(displayOffsetNotice); } catch (_) {}
        }
        displayOffsetNotice = null;
    }

    function updateSitrep(state) {
        if (!sitrepControl) return;
        const div = sitrepControl.getContainer();
        if (!div || !state) return;
        // Derive the display outcome from the full evidence (FR + losses
        // + objective_status). If the LLM said CAPTURED but evidence
        // says Blue won, this returns DENIED — the SITREP shows what's
        // actually happening even before the server validator clamps.
        const displayStatus = deriveDisplayOutcome(state);
        const objColor = COLORS.OBJ[displayStatus] || '#888';
        const blueDead = state.losses_cumulative && state.losses_cumulative.blue_destroyed || 0;
        const blueTotal = (state.losses_cumulative && state.losses_cumulative.blue_total) || 39;
        const redCoy = state.losses_cumulative && state.losses_cumulative.red_company_equivalent || 0;
        const phasePill = `<span style="background:#22293a;color:#cdd;padding:1px 6px;border-radius:8px;font-size:10px;">${esc(state.phase)}</span>`;
        // Show the derived status and, if it differs from what the LLM
        // emitted, flag the override so the operator sees the call:
        const overrideMark = (displayStatus !== state.objective_status)
            ? `<span style="font-size:9px;opacity:0.75;margin-right:4px;" title="LLM said ${esc(state.objective_status)} but evidence overrules">⚠</span>`
            : '';
        const objPill   = `<span style="background:${objColor};color:#fff;padding:1px 8px;border-radius:8px;font-size:10px;font-weight:700;float:right;">${overrideMark}${esc(displayStatus)}</span>`;
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

    // ── Display-only name helpers ─────────────────────────────────────
    // Pure functions: map raw scenario codes to operator-readable strings.
    // Do NOT change scenario data, registry keys, SIDC logic, or placement.
    const _ROLE_DISPLAY = {
        main_effort:          'Main Effort',
        main_attack:          'Main Attack',
        fixing:               'Fixing Force',
        support:              'Support',
        support_by_fire:      'Support by Fire',
        recon:                'Reconnaissance',
        reserve:              'Reserve',
        hq:                   'Headquarters',
        armored_brigade:      'Armored Brigade',
        mechanized_brigade:   'Mechanized Brigade',
        infantry_brigade:     'Infantry Brigade',
        armored_battalion:    'Armored Battalion',
        mechanized_battalion: 'Mechanized Battalion',
        infantry_battalion:   'Infantry Battalion',
        fighter_ad:           'Fighter / Air Defense',
        strike:               'Strike',
        logistics:            'Logistics',
        artillery:            'Artillery',
        engineering:          'Engineering',
    };
    function displayRole(role) {
        if (!role) return '';
        return _ROLE_DISPLAY[String(role).toLowerCase()] ||
            String(role).replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }
    function displayBlueId(id) {
        if (!id) return '';
        const s = String(id).replace(/^BLUE_/, '');
        if (s === 'lc') return 'Div HQ';
        const b = s.match(/^b([1-9])c$/);             if (b) return `Bde ${b[1]}`;
        const p = s.match(/^p([1-9])([1-9])c$/);      if (p) return `Bn ${p[1]}-${p[2]}`;
        const c = s.match(/^c([1-9])([1-9])([1-9])$/);if (c) return `Coy ${c[1]}-${c[2]}-${c[3]}`;
        return s;
    }
    function displayRedId(uid) {
        if (!uid) return '';
        return String(uid).replace(/^RED_/, '').replace(/[-_]/g, ' ');
    }
    // ─────────────────────────────────────────────────────────────────

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

    // Operator follow-up: even with color + reach-factor fixes, the map
    // still trusted state.objective_status verbatim. If the LLM emitted
    // CAPTURED while everything else (FR, blue intact, red attrited)
    // said Blue won, the map dutifully drew the bold-red treatment.
    // The system has to "walk with the AI decision" — meaning consult
    // the FULL evidence and downgrade an incoherent verdict on the
    // client side too, not just on the server validator. This is
    // belt-and-braces with the server's clamp from ff692b7: the
    // validator catches it at the data layer; this catches it at the
    // visual layer even if the server hasn't restarted yet.
    function parseFrNumber(s) {
        if (typeof s !== 'string') return null;
        const m = s.match(/^(\d{1,2}(?:\.\d)?):1/);
        return m ? Number(m[1]) : null;
    }
    function deriveDisplayOutcome(state) {
        if (!state) return 'DORMANT';
        const status = state.objective_status || 'DORMANT';
        // Only re-litigate CAPTURED — the others (DENIED, THREATENED,
        // CONTESTED, DORMANT) describe Red NOT dominating, and the
        // server validator already blocks regressions.
        if (status !== 'CAPTURED') return status;

        const fr = String(state.force_ratio || '');
        const lc = state.losses_cumulative || {};
        const blueLost  = Number(lc.blue_destroyed) || 0;
        const blueTotal = Number(lc.blue_total) || 39;
        const redCoyEq  = Number(lc.red_company_equivalent) || 0;

        const frBlocks    = /\b(below\s+decisive|not\s+engaged|N\/A)\b/i.test(fr);
        const frNum       = parseFrNumber(fr);
        const frNumBlocks = (frNum !== null && frNum < 2);
        const blueIntact  = (blueLost / blueTotal) < 0.25;
        const redSpent    = redCoyEq > 6;

        // Any single strong contradiction → display as DENIED. The
        // OBJ marker, salient, arrows, and PL line all read off this
        // derived value, so the WHOLE map flips at once.
        if (frBlocks || frNumBlocks || blueIntact || redSpent) {
            return 'DENIED';
        }
        return status;
    }

    // Map objective_status → visual treatment for the salient + advance
    // arrows. CAPTURED-bold, DENIED-faded-dashed, with reachFactor that
    // retracts the salient + arrow tips for non-CAPTURED outcomes so
    // they visually stop short of OBJ NASSER. Reads from
    // deriveDisplayOutcome so the visual layer is honest even when the
    // server hasn't clamped an incoherent CAPTURED yet.
    function outcomeAccent(state) {
        const status = deriveDisplayOutcome(state);
        switch (status) {
            case 'CAPTURED':
                return { color: '#b21414', fillColor: '#c41e1e', fillOpacity: 0.22, opacity: 0.90, mainWeight: 10, secWeight: 6, dashArray: null,    reachFactor: 1.00, label: 'Red holds' };
            case 'CONTESTED':
                return { color: '#c44e1e', fillColor: '#d2682a', fillOpacity: 0.15, opacity: 0.75, mainWeight: 9,  secWeight: 6, dashArray: null,    reachFactor: 0.85, label: 'Contested at OBJ' };
            case 'THREATENED':
                return { color: '#c98a2a', fillColor: '#e8a23a', fillOpacity: 0.12, opacity: 0.65, mainWeight: 7,  secWeight: 5, dashArray: null,    reachFactor: 0.75, label: 'OBJ threatened' };
            case 'DENIED':
                // Faded, dashed, AND retracted — Red was pushed back well
                // short of OBJ. reachFactor 0.55 keeps the arrow tip ~45%
                // short of where geographic PL would otherwise put it.
                return { color: '#7d6a6a', fillColor: '#a08a8a', fillOpacity: 0.08, opacity: 0.55, mainWeight: 5,  secWeight: 3, dashArray: '8 6',   reachFactor: 0.55, label: 'Red denied' };
            case 'DORMANT':
            default:
                return { color: '#88555f', fillColor: '#a07070', fillOpacity: 0.10, opacity: 0.40, mainWeight: 6,  secWeight: 4, dashArray: null,    reachFactor: 0.25, label: 'pre-decision' };
        }
    }

    // ── Red advance arrow (single, tracking the main effort unit) ────────
    // Operator feedback: in reality the map shows ONE arrow tracking the
    // main red unit as it attacks, not three arrows fanning out from BLS
    // centres. Tail = the main unit's landing BLS coord. Head = the main
    // unit's CURRENT position from redPositionLonLat (same function the
    // marker uses, so the arrow tip sits on top of the moving symbol and
    // visibly tracks it step by step). The arrow is always red regardless
    // of objective_status — the salient polygon below still dims/dashes
    // for DENIED so the "Red was denied" cue stays at the area level.
    function updateAdvanceArrows(state, scenario, opts) {
        opts = opts || {};
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

        const accent = outcomeAccent(state);
        const reach = Math.min(progress, 1.0) * (accent.reachFactor != null ? accent.reachFactor : 1.0);
        const salientReach = Math.min(reach, 0.92);

        // Salient polygon: still driven by outcomeAccent so a DENIED outcome
        // tints/dashes the area band (area-level "Red was denied" cue).
        const bls = (scenario.bls_template || []).filter(b => b && Array.isArray(b.coord));
        if (bls.length >= 2) {
            const deep = bls.map(b => lerpLonLat(b.coord, objLL, salientReach));
            const ring = bls.map(b => [b.coord[1], b.coord[0]])
                .concat(deep.slice().reverse().map(p => [p[1], p[0]]));
            salientLayer = window.L.polygon(ring, {
                color:       accent.color,
                weight:      1.5,
                opacity:     accent.opacity * 0.6,
                fillColor:   accent.fillColor,
                fillOpacity: accent.fillOpacity,
                dashArray:   accent.dashArray,
                interactive: false,
            }).bindTooltip(
                `Salient — ${accent.label}  (PL ${(progress * 100).toFixed(0)}% · control ${(reach * 100).toFixed(0)}%)`,
                { sticky: true },
            );
            salientLayer.addTo(layerGroup);
        }

        // W3-rich scenarios: per-role attack graphics don't translate. W3
        // uses role names like "armored_brigade" / "strike" / "mech_inf_div"
        // that don't match ROLE_ATTACK_STYLE, and per-unit `red_unit_step_coords`
        // already shows every unit's authentic position. The phase line
        // (updateAorPhaseLine) shows the frontline and engagement_arcs show
        // cause-effect, so the per-unit chevrons would just clutter.
        // Bail out after the salient polygon is rendered.
        if (scenario && scenario.schema_variant === 'w3-rich') return;

        // ── Per-red-unit NATO attack arrows ──
        // One axis-of-attack graphic for EACH attacking red unit, drawn
        // from the unit's landing BLS to its current step position.
        // Doctrinally: the main effort gets a bold 'main-attack' arrow,
        // every other maneuver role (Fixing / Support / Envelopment /
        // Follow-on / Exploitation / Recon) gets a thinner 'attack'
        // graphic, and pure-support roles (EW, Fire support, CBRN
        // defense, Explosive USVs) get NO arrow — they don't have an
        // attack axis. The BLS-anchored tail prevents the NATO graphic
        // geometry from collapsing at step-to-step deltas of 1-3 km
        // (the auto-derived rails + chevron have minimum widths in km
        // that would fold into a blob at that scale).
        const ROLE_ATTACK_STYLE = {
            'Main effort':            { typeId: 'main-attack', weight: 6, color: '#b21414', label: 'Main effort'         },
            'Fixing':                 { typeId: 'attack',      weight: 4, color: '#c41e1e', label: 'Fixing attack'       },
            'Support':                { typeId: 'attack',      weight: 4, color: '#c41e1e', label: 'Supporting attack'   },
            'External envelopment':   { typeId: 'attack',      weight: 5, color: '#c41e1e', label: 'External envelopment'},
            'Eastern fixing':         { typeId: 'attack',      weight: 4, color: '#c41e1e', label: 'Eastern fixing'      },
            'Follow-on':              { typeId: 'attack',      weight: 5, color: '#b21414', label: 'Follow-on attack'    },
            'Exploitation':           { typeId: 'attack',      weight: 5, color: '#b21414', label: 'Exploitation attack' },
            'Recon':                  { typeId: 'attack',      weight: 3, color: '#d23a3a', label: 'Reconnaissance'      },
        };
        const stepIndex = Number.isFinite(state && state.step_index) ? state.step_index : 0;
        const redUnits = (scenario.red_units || []);

        // Suppress all advance arrows at H-Hour and earlier (steps 0-1).
        // At step 1 the only red units on the map are the advance forces
        // (Recon / EW / USV) doing the offshore→coast lerp — they haven't
        // started an inland advance yet, so drawing chunky NATO attack
        // graphics for them reads as funny rather than informative. Real
        // advance starts at step 2+ when the main brigades are ashore.
        if (stepIndex < 2) return;

        // Helper: extend the chevron tip past the unit symbol so the
        // arrowhead leads the unit instead of stacking on top of it.
        function leadOffset(tailLat, tailLng, headLat, headLng, leadKm) {
            const dirKmE = (headLng - tailLng) * kmPerDegLng((headLat + tailLat) / 2);
            const dirKmN = (headLat - tailLat) * KM_PER_DEG_LAT;
            const dirLen = Math.hypot(dirKmE, dirKmN) || 1;
            return {
                lat: headLat + (dirKmN / dirLen) * (leadKm / KM_PER_DEG_LAT),
                lng: headLng + (dirKmE / dirLen) * (leadKm / kmPerDegLng(headLat)),
            };
        }

        // ── Group attacking red units by BLS, render ONE arrow per BLS ──
        // In wargame2-brega BLS-3 hosts Main effort + Recon + Follow-on +
        // Exploitation — drawing one arrow per unit produces 4 stacked
        // near-parallel arrows by step 8. Doctrine for amphibious ops is
        // ONE axis of advance per landing site; multiple units sharing
        // that BLS advance as one consolidated wedge. So we bucket by
        // BLS and emit a single merged arrow per bucket. Pure-support
        // roles are still filtered out via ROLE_ATTACK_STYLE.
        const groups = new Map();
        for (const unit of redUnits) {
            if (!unit || !unit.role) continue;
            const style = ROLE_ATTACK_STYLE[unit.role];
            if (!style) continue;
            if (stepIndex < (unit.appear || 0)) continue;
            const reg = unitRegistry[unit.uid];
            if (reg && reg.status === UNIT_STATUS.DESTROYED) continue;
            if (!groups.has(unit.bls)) groups.set(unit.bls, []);
            groups.get(unit.bls).push({ unit, style });
        }

        // Helper: snake-in draw-on for every <path> inside a tactical
        // arrow's divIcon. Used for trunks, branches, and single-unit
        // arrows so all NATO graphics animate in the same way.
        function snakeInTactical(tactical) {
            if (!tactical) return;
            requestAnimationFrame(() => {
                const el = tactical.getElement && tactical.getElement();
                if (!el) return;
                el.querySelectorAll('path').forEach(p => {
                    let len = 0;
                    try { len = p.getTotalLength(); } catch (_) {}
                    if (!len) return;
                    p.style.transition = 'none';
                    p.style.strokeDasharray  = len + ' ' + len;
                    p.style.strokeDashoffset = String(len);
                    void p.getBoundingClientRect();
                    p.style.transition = 'stroke-dashoffset 220ms cubic-bezier(0.2, 0.8, 0.2, 1)';
                    requestAnimationFrame(() => { p.style.strokeDashoffset = '0'; });
                });
            });
        }

        // Nearby assault lanes should read as ONE main attack, not a stack
        // of near-parallel filled arrows. So we first collect per-unit lanes
        // from every BLS bucket, then cluster lanes whose heads and approach
        // directions are close enough to be the same corridor. Each cluster
        // renders as one merged maneuver arrow.
        const assaultLanes = [];
        for (const [blsName, group] of groups) {
            if (!group.length) continue;
            const blsLonLat = blsCoordByName[blsName];
            if (!blsLonLat) continue;
            const blsLat = blsLonLat[1];
            const blsLng = blsLonLat[0];

            // Compute every unit's head position.
            const heads = [];
            for (const g of group) {
                const head = redPositionLonLat({
                    uid:       g.unit.uid,
                    role:      g.unit.role,
                    bls:       g.unit.bls,
                    appear:    g.unit.appear,
                    label:     g.unit.label,
                    echelon:   g.unit.echelon,
                    baseCoord: g.unit.coord,
                }, stepIndex, progress);
                if (!head) continue;
                const km = haversineKm([blsLat, blsLng], [head[1], head[0]]);
                heads.push({ unit: g.unit, style: g.style, headLat: head[1], headLng: head[0], km });
            }
            if (!heads.length) continue;

            const groupSize = heads.length;

            // Control point for the Bezier (quadratic, p1 = control).
            // Multi-unit: shared centroid-bias point near the beach so
            // curves visually converge into a corridor.
            // Single-unit: midpoint of BLS→tip with a small perpendicular
            // offset so the arrow sweeps instead of going dead-straight.
            let sumLat = 0, sumLng = 0;
            for (const h of heads) { sumLat += h.headLat; sumLng += h.headLng; }
            const centLat = sumLat / heads.length;
            const centLng = sumLng / heads.length;
            const branchLat = blsLat + (centLat - blsLat) * 0.55;
            const branchLng = blsLng + (centLng - blsLng) * 0.55;

            for (const h of heads) {
                if (Math.abs(h.headLat - blsLat) < 1e-5 && Math.abs(h.headLng - blsLng) < 1e-5) continue;
                const isMain = h.style.typeId === 'main-attack';
                const leadKm = isMain ? 6 : 4;
                const tipPos = leadOffset(blsLat, blsLng, h.headLat, h.headLng, leadKm);

                // Choose curve control point.
                let ctrlLat, ctrlLng;
                if (heads.length > 1) {
                    ctrlLat = branchLat;
                    ctrlLng = branchLng;
                } else {
                    // Single-unit: slight perpendicular offset for a gentle sweep.
                    const midLat = (blsLat + tipPos.lat) / 2;
                    const midLng = (blsLng + tipPos.lng) / 2;
                    const dLat = tipPos.lat - blsLat;
                    const dLng = tipPos.lng - blsLng;
                    ctrlLat = midLat - dLng * 0.05;
                    ctrlLng = midLng + dLat * 0.05;
                }

                const centerline = [
                    { lat: blsLat,     lng: blsLng     },
                    { lat: ctrlLat,    lng: ctrlLng    },
                    { lat: tipPos.lat, lng: tipPos.lng },
                ];
                const ctrlKmE = (ctrlLng - blsLng) * kmPerDegLng((ctrlLat + blsLat) / 2);
                const ctrlKmN = (ctrlLat - blsLat) * KM_PER_DEG_LAT;
                const ctrlLen = Math.hypot(ctrlKmE, ctrlKmN) || 1;
                assaultLanes.push({
                    blsName,
                    unit: h.unit,
                    style: h.style,
                    centerline,
                    tipPos,
                    ctrlLat,
                    ctrlLng,
                    dirE: ctrlKmE / ctrlLen,
                    dirN: ctrlKmN / ctrlLen,
                    groupSize,
                    isMain,
                });
            }
        }

        const laneClusters = [];
        const TIP_CLUSTER_KM = Number.isFinite(window.WARGAME_MAIN_ATTACK_CLUSTER_KM)
            ? Number(window.WARGAME_MAIN_ATTACK_CLUSTER_KM) : 8;
        const DIR_CLUSTER_MIN_DOT = Number.isFinite(window.WARGAME_MAIN_ATTACK_DIR_DOT)
            ? Number(window.WARGAME_MAIN_ATTACK_DIR_DOT) : 0.92;

        function addLaneToCluster(lane) {
            let best = null;
            let bestKm = Infinity;
            for (const cluster of laneClusters) {
                const km = haversineKm(
                    [lane.tipPos.lat, lane.tipPos.lng],
                    [cluster.tipLat / cluster.count, cluster.tipLng / cluster.count],
                );
                const dot = lane.dirE * (cluster.dirE / cluster.count) + lane.dirN * (cluster.dirN / cluster.count);
                if (km <= TIP_CLUSTER_KM && dot >= DIR_CLUSTER_MIN_DOT && km < bestKm) {
                    best = cluster;
                    bestKm = km;
                }
            }
            if (!best) {
                laneClusters.push({
                    lanes: [lane],
                    count: 1,
                    tipLat: lane.tipPos.lat,
                    tipLng: lane.tipPos.lng,
                    ctrlLat: lane.ctrlLat,
                    ctrlLng: lane.ctrlLng,
                    dirE: lane.dirE,
                    dirN: lane.dirN,
                    hasMain: lane.isMain,
                    color: lane.isMain ? '#b21414' : lane.style.color,
                });
                return;
            }
            best.lanes.push(lane);
            best.count += 1;
            best.tipLat += lane.tipPos.lat;
            best.tipLng += lane.tipPos.lng;
            best.ctrlLat += lane.ctrlLat;
            best.ctrlLng += lane.ctrlLng;
            best.dirE += lane.dirE;
            best.dirN += lane.dirN;
            best.hasMain = best.hasMain || lane.isMain;
            if (lane.isMain) best.color = '#b21414';
        }

        assaultLanes.forEach(addLaneToCluster);

        for (const cluster of laneClusters) {
            if (!cluster.lanes.length) continue;
            const tailLat = cluster.lanes.reduce((sum, lane) => sum + lane.centerline[0].lat, 0) / cluster.lanes.length;
            const tailLng = cluster.lanes.reduce((sum, lane) => sum + lane.centerline[0].lng, 0) / cluster.lanes.length;
            const ctrlLat = cluster.ctrlLat / cluster.count;
            const ctrlLng = cluster.ctrlLng / cluster.count;
            const tipLat = cluster.tipLat / cluster.count;
            const tipLng = cluster.tipLng / cluster.count;
            const bodyHalfPx = cluster.hasMain
                ? Math.min(24, 14 + cluster.count * 2)
                : Math.min(18, 10 + Math.max(0, cluster.count - 1) * 2);
            const headHalfPx = Math.round(bodyHalfPx * 2.2);
            const headLenPx = Math.round(bodyHalfPx * 2.9);
            const label = cluster.count > 1 ? 'Main attack' : (cluster.hasMain ? 'Main effort' : cluster.lanes[0].style.label);
            const members = cluster.lanes.map(l => `${l.unit.label} (${displayRedId(l.unit.uid)})`).join(', ');
            const centerline = [
                { lat: tailLat, lng: tailLng },
                { lat: ctrlLat, lng: ctrlLng },
                { lat: tipLat, lng: tipLng },
            ];
            const arrow = createManeuverArrowPolygon(centerline, cluster.color, {
                bodyHalfPx,
                headHalfPx,
                headLenPx,
                outline: '#5b0c0c',
                outlineWidthPx: 2,
                opacity: cluster.count > 1 ? 0.58 : 0.5,
                pane: SCENARIO_GRAPHICS_PANE,
            });
            if (arrow) {
                arrow.addTo(layerGroup);
                advanceArrows.push(arrow);
                arrow.bindTooltip(`${label}: ${members} — step ${stepIndex}`, { sticky: true });
                if (!opts.instant) animateLineDraw(arrow, 240);
            } else {
                const start = [tailLat, tailLng];
                const end = [tipLat, tipLng];
                const line = window.L.polyline([start, end], {
                    color: cluster.color,
                    weight: bodyHalfPx,
                    opacity: cluster.count > 1 ? 0.58 : 0.5,
                    lineCap: 'round',
                    interactive: false,
                    pane: SCENARIO_GRAPHICS_PANE,
                }).bindTooltip(`${label}: ${members}`, { sticky: true });
                line.addTo(layerGroup);
                advanceArrows.push(line);
                const ah = makeArrowhead(start, end, cluster.color, 14, SCENARIO_GRAPHICS_PANE);
                if (ah) { ah.addTo(layerGroup); advanceArrows.push(ah); }
                if (!opts.instant) animateLineDraw(line, 200);
            }
        }
    }

    // ── Attack symbols between units (kill + counterattack) ───────────
    // For each blue uid in state.per_unit_deltas.blue_destroyed (newly
    // killed this step) we draw a bold red arrow from the nearest active
    // red unit to the blue's position — that's the kill. For each blue
    // whose blue_actions[base_id] === 'COUNTERATTACK' we draw a thinner
    // dashed BLUE arrow back toward the nearest red — that's the response.
    // The two visual idioms (red bold straight vs blue thin dashed) give
    // the operator a quick read of who attacked and who's firing back,
    // without text labels.
    //
    // No explicit attacker attribution exists in per_unit_deltas (we
    // checked the schema), so we pair by nearest-neighbour. That's a
    // heuristic, but the closest red unit is the most defensible choice
    // for "who killed this blue".
    function findNearestRedMarker(targetLatLng, stepIndex) {
        if (!targetLatLng) return null;
        let best = null, bestKm = Infinity;
        for (const m of Object.values(redMarkers)) {
            if (!m || !m._wgRedMeta) continue;
            // Skip units that haven't appeared (still offshore at sea-offset).
            if (stepIndex < (m._wgRedMeta.appear || 0)) continue;
            let ll; try { ll = m.getLatLng(); } catch (_) { continue; }
            if (!ll) continue;
            const km = haversineKm([targetLatLng.lat, targetLatLng.lng], [ll.lat, ll.lng]);
            if (km < bestKm) { bestKm = km; best = m; }
        }
        return best;
    }

    // Animate a freshly-added Leaflet polyline as if it's being drawn from
    // tail → head. Uses SVG stroke-dasharray + dashoffset, kicked off in the
    // next rAF tick so the path is in the DOM when we measure its length.
    // Visually: the kill line "shoots" out from the red unit toward the
    // blue victim instead of appearing all at once.
    function animateLineDraw(polyline, durationMs) {
        if (!polyline) return;
        requestAnimationFrame(() => {
            const path = polyline._path;
            if (!path || typeof path.getTotalLength !== 'function') return;
            let len = 0;
            try { len = path.getTotalLength(); } catch (_) { return; }
            if (!len) return;
            path.style.transition  = 'none';
            path.style.strokeDasharray = len + ' ' + len;
            path.style.strokeDashoffset = String(len);
            // Force reflow so the initial offset is committed before transitioning.
            void path.getBoundingClientRect();
            path.style.transition  = `stroke-dashoffset ${durationMs}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
            requestAnimationFrame(() => { path.style.strokeDashoffset = '0'; });
        });
    }

    // Build a NATO tactical-graphic arrow as a Leaflet marker (or null if
    // the unified renderer isn't available — e.g. running before app.js has
    // exposed AppTacticalGraphics). points[0] is the TIP, points[1] is the
    // tail. typeId controls the body style:
    //   'attack'                — solid rails + filled arrowhead
    //   'main-attack'           — solid rails + open chevron on body
    //   'counterattack'         — dashed rails + 'CAT' label
    //   'counterattack-by-fire' — dashed rails + double stems + 'CATK' label
    function createTacticalArrow(tipLatLng, tailLatLng, color, typeId, strokeWidth, opts) {
        const tg = window.AppTacticalGraphics;
        if (!tg || typeof tg.getCatkUnifiedDivIcon !== 'function') return null;
        if (!tipLatLng || !tailLatLng) return null;
        const points = [
            { lat: tipLatLng.lat,  lng: tipLatLng.lng },
            { lat: tailLatLng.lat, lng: tailLatLng.lng },
        ];
        const uni = tg.getCatkUnifiedDivIcon(points, color, strokeWidth || 4, typeId, opts || {});
        if (!uni || !uni.html) return null;
        const className = (opts && opts.className)
            ? `wg-adj-tactical-arrow ${opts.className}`
            : 'wg-adj-tactical-arrow';
        const icon = window.L.divIcon({
            className,
            html:       uni.html,
            iconSize:   uni.iconSize,
            iconAnchor: uni.iconAnchor,
        });
        const mOpts = { icon, interactive: false };
        if (opts && opts.pane) mOpts.pane = opts.pane;
        return window.L.marker(uni.centerLatLng, mOpts);
    }

    // ── Filled tactical maneuver-arrow renderer (L.polygon based) ─────
    // A real military operational arrow: a wide filled corridor that
    // curves through control points and ends in a large integrated head.
    // Produces ONE L.polygon (overlayPane → renders BELOW markers, so
    // unit symbols always stay on top, never hidden under the arrow).
    //
    // Centerline contract:
    //   2 points → straight body
    //   3 points → quadratic Bezier through [start, CONTROL, end]
    //              (CONTROL biases the curve; arrow does not pass through it)
    //   4 points → cubic Bezier through [start, ctrl1, ctrl2, end]
    //   5+ points → Catmull-Rom spline (passes through every point)
    //
    // The body width (bodyHalfPx) and head dimensions are screen-pixel
    // sized at draw time; we project lat/lng → pixels, build the corridor,
    // then project the corners back to lat/lng so L.polygon stays
    // geographically anchored. On step / scrub the arrow is redrawn so
    // the shape stays accurate at the current zoom.
    function sampleQuadBezier(p0, p1, p2, steps) {
        steps = Math.max(8, steps || 32);
        const out = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps, omt = 1 - t;
            out.push({
                x: omt * omt * p0.x + 2 * omt * t * p1.x + t * t * p2.x,
                y: omt * omt * p0.y + 2 * omt * t * p1.y + t * t * p2.y,
            });
        }
        return out;
    }
    function sampleCubicBezier(p0, p1, p2, p3, steps) {
        steps = Math.max(8, steps || 32);
        const out = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps, omt = 1 - t;
            const a = omt * omt * omt;
            const b = 3 * omt * omt * t;
            const c = 3 * omt * t * t;
            const d = t * t * t;
            out.push({
                x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
                y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
            });
        }
        return out;
    }

    function buildManeuverArrowPolygonLatLngs(centerlineLatLngs, opts) {
        if (!hasMap() || !Array.isArray(centerlineLatLngs) || centerlineLatLngs.length < 2) return null;
        opts = opts || {};
        const bodyHalf = Math.max(2, opts.bodyHalfPx || 12);
        const headHalf = Math.max(bodyHalf + 2, opts.headHalfPx || bodyHalf * 2.2);
        const headLen  = Math.max(10, opts.headLenPx || bodyHalf * 3.0);
        const noHead   = !!opts.noHead;
        const samples  = Math.max(16, opts.samples || 40);

        const map = window.map;
        const pts = centerlineLatLngs.map(ll => {
            const p = map.latLngToLayerPoint(window.L.latLng(ll.lat, ll.lng));
            return { x: p.x, y: p.y };
        });

        // Densify the centerline via the appropriate curve type.
        let centerline;
        if (pts.length === 2) {
            centerline = pts;
        } else if (pts.length === 3) {
            centerline = sampleQuadBezier(pts[0], pts[1], pts[2], samples);
        } else if (pts.length === 4) {
            centerline = sampleCubicBezier(pts[0], pts[1], pts[2], pts[3], samples);
        } else if (window.AppGraphics && typeof window.AppGraphics.catkSampleCatmullRomSpine === 'function') {
            try { centerline = window.AppGraphics.catkSampleCatmullRomSpine(pts, 12) || pts; }
            catch (_) { centerline = pts; }
        } else {
            centerline = pts;
        }
        if (!centerline || centerline.length < 2) return null;

        // Trim head length off the end so the body stops at the neck and
        // the head triangle covers the last `headLen` pixels.
        let neck = centerline[centerline.length - 1];
        let tipDir = { x: 1, y: 0 };
        if (!noHead) {
            const a = centerline[centerline.length - 2];
            const b = centerline[centerline.length - 1];
            const dx = b.x - a.x, dy = b.y - a.y;
            const dl = Math.hypot(dx, dy) || 1;
            tipDir = { x: dx / dl, y: dy / dl };
            // Total length, then cut at (total - headLen).
            const lens = [];
            let total = 0;
            for (let i = 1; i < centerline.length; i++) {
                const sl = Math.hypot(centerline[i].x - centerline[i - 1].x, centerline[i].y - centerline[i - 1].y);
                lens.push(sl);
                total += sl;
            }
            if (total <= headLen * 1.05) {
                // Curve is shorter than the head — fall back to a straight
                // segment with a head and no body.
                return null;
            }
            const stopAt = total - headLen;
            const trimmed = [centerline[0]];
            let accum = 0;
            for (let i = 1; i < centerline.length; i++) {
                const sl = lens[i - 1];
                if (accum + sl < stopAt) {
                    trimmed.push(centerline[i]);
                    accum += sl;
                    continue;
                }
                const cutT = (stopAt - accum) / Math.max(1e-9, sl);
                neck = {
                    x: centerline[i - 1].x + (centerline[i].x - centerline[i - 1].x) * cutT,
                    y: centerline[i - 1].y + (centerline[i].y - centerline[i - 1].y) * cutT,
                };
                trimmed.push(neck);
                break;
            }
            centerline = trimmed.length >= 2 ? trimmed : [centerline[0], neck];
        }

        // Per-vertex offset rails at ±bodyHalfPx. Use the local tangent
        // (averaged from prev→next) so corners curve smoothly.
        const left = [], right = [];
        for (let i = 0; i < centerline.length; i++) {
            const a = centerline[Math.max(0, i - 1)];
            const b = centerline[Math.min(centerline.length - 1, i + 1)];
            const tx = b.x - a.x, ty = b.y - a.y;
            const tl = Math.hypot(tx, ty) || 1;
            const nx = -ty / tl, ny = tx / tl;
            left.push({  x: centerline[i].x + nx * bodyHalf, y: centerline[i].y + ny * bodyHalf });
            right.push({ x: centerline[i].x - nx * bodyHalf, y: centerline[i].y - ny * bodyHalf });
        }

        // Assemble closed corridor polygon:
        //   left rail tail→neck → head-left → tip → head-right → right rail neck→tail → close
        const polyPx = left.slice();
        if (!noHead) {
            const tip       = { x: neck.x + tipDir.x * headLen,           y: neck.y + tipDir.y * headLen };
            const headLeft  = { x: neck.x + (-tipDir.y) * headHalf,       y: neck.y + ( tipDir.x) * headHalf };
            const headRight = { x: neck.x - (-tipDir.y) * headHalf,       y: neck.y - ( tipDir.x) * headHalf };
            polyPx.push(headLeft, tip, headRight);
        }
        for (let i = right.length - 1; i >= 0; i--) polyPx.push(right[i]);

        // Back to lat/lng so L.polygon stays geographically anchored.
        return polyPx.map(p => {
            const ll = map.layerPointToLatLng(window.L.point(p.x, p.y));
            return [ll.lat, ll.lng];
        });
    }

    // Wrap the polygon points into an L.polygon styled like an
    // operational maneuver corridor. Polygons live in overlayPane (zIndex
    // 400) while marker icons live in markerPane (zIndex 600), so the
    // unit symbols are GUARANTEED to render above the arrows — no
    // matter how thick the arrow gets, the symbols stay visible.
    function createManeuverArrowPolygon(centerlineLatLngs, color, opts) {
        const ring = buildManeuverArrowPolygonLatLngs(centerlineLatLngs, opts);
        if (!ring || ring.length < 3) return null;
        opts = opts || {};
        const outlineColor = opts.outline || '#5b0c0c';
        const outlineWidth = Number.isFinite(opts.outlineWidthPx) ? opts.outlineWidthPx : 2;
        const fillOpacity  = Number.isFinite(opts.opacity) ? opts.opacity : 0.85;
        const polyOpts = {
            color:       outlineColor,
            weight:      outlineWidth,
            opacity:     1.0,
            fillColor:   color,
            fillOpacity: fillOpacity,
            lineJoin:    'miter',
            lineCap:     'butt',
            interactive: false,
        };
        if (opts && opts.pane) polyOpts.pane = opts.pane;
        return window.L.polygon(ring, polyOpts);
    }

    function updateAttackArrows(state, scenario) {
        for (const a of attackArrows) {
            if (a && layerGroup) layerGroup.removeLayer(a);
        }
        attackArrows = [];
        if (!layerGroup || !state) return;
        const stepIndex = Number.isFinite(state && state.step_index) ? state.step_index : 0;

        // W3-rich scenarios carry explicit `engagement_arc` features per
        // phase, with the authentic attacker uid in `cause_actor`. We render
        // those via renderEngagementArcs() instead of the heuristic
        // "nearest-red" counterattack arrows below — the W3 data is the
        // authority, not a Leaflet distance query.
        const isW3 = (scenario || scenarioRef) &&
                     (scenario || scenarioRef).schema_variant === 'w3-rich';
        if (isW3) return;

        // Kill arrows (red → blue, NATO 'attack' graphic) are scheduled
        // alongside the explosion in scheduleStaggeredDeaths so each one
        // appears just before its blue dies, then fades out with the X.
        // That sequence avoids the "red retreats" backward-looking issue —
        // the arrow is short-lived enough that direction is read as
        // "this kill" rather than "red is moving toward the coast".

        // ── Counterattack arrows (NATO 'counterattack' graphic) ──
        // Dashed rails + CAT label rendered via the app's unified
        // tactical-graphic renderer. Falls back to a thin dashed
        // polyline if AppTacticalGraphics isn't loaded yet.
        const actions = blueActionsFor(stepIndex, state);
        if (actions) {
            for (const m of Object.values(blueMarkers)) {
                const meta = m && m._wgBlueMeta;
                if (!meta) continue;
                if (actions[meta.baseId] !== 'COUNTERATTACK') continue;
                // Suppress counterattack arrows only when the unit is
                // effectively destroyed (self OR any ancestor in the
                // parent/root chain — getEffectiveUnitStatus walks the
                // cascade). DEGRADED HQs still get drawn — propagateHqDamage's
                // 50%-children threshold is too eager when proximity overrun
                // is killing companies aggressively, and silencing every
                // degraded HQ wiped out almost all counterattacks by mid-game.
                if (getEffectiveUnitStatus(meta.uid) === UNIT_STATUS.DESTROYED) continue;
                let blueLL; try { blueLL = m.getLatLng(); } catch (_) { continue; }
                if (!blueLL) continue;
                const redMarker = findNearestRedMarker(blueLL, stepIndex);
                if (!redMarker) continue;
                let redLL; try { redLL = redMarker.getLatLng(); } catch (_) { continue; }
                if (!redLL) continue;
                // Realism range cap: counterattacks are direct-fire / close-
                // combat engagements. A blue unit 20+ km from the nearest red
                // isn't counterattacking — at that range it would be indirect
                // fire at best, not the maneuver the arrow connotes. Skip if
                // the responder is beyond COUNTERATTACK_MAX_KM. Tunable via
                // window.WARGAME_COUNTERATTACK_MAX_KM (default 12 km).
                const maxKm = Number.isFinite(window.WARGAME_COUNTERATTACK_MAX_KM)
                    ? Number(window.WARGAME_COUNTERATTACK_MAX_KM) : 12.0;
                if (maxKm > 0 && haversineKm([blueLL.lat, blueLL.lng], [redLL.lat, redLL.lng]) > maxKm) continue;
                // Tactical graphic: tip at the red (the target of the
                // counterattack), tail at the blue (the responder).
                const tactical = createTacticalArrow(
                    redLL, blueLL, '#3a96d2', 'counterattack', 3,
                    { className: 'wg-attack-pulse', pane: SCENARIO_GRAPHICS_PANE },
                );
                if (tactical) {
                    tactical.addTo(layerGroup);
                    attackArrows.push(tactical);
                    if (tactical.bindTooltip) {
                        tactical.bindTooltip(
                            `Counterattack: ${displayBlueId(meta.baseId)} → ${(redMarker._wgRedMeta && (redMarker._wgRedMeta.label || displayRedId(redMarker._wgRedMeta.uid))) || ''}`,
                            { sticky: true },
                        );
                    }
                } else {
                    // Fallback: original thin dashed polyline.
                    const start = [blueLL.lat, blueLL.lng];
                    const end   = [redLL.lat, redLL.lng];
                    const line = window.L.polyline([start, end], {
                        color:     '#3a96d2',
                        weight:    1.5,
                        opacity:   0.7,
                        dashArray: '4 4',
                        lineCap:   'round',
                        interactive: false,
                        className: 'wg-attack-pulse',
                        pane: SCENARIO_GRAPHICS_PANE,
                    }).bindTooltip(`Counterattack: ${displayBlueId(meta.baseId)} → ${(redMarker._wgRedMeta && (redMarker._wgRedMeta.label || displayRedId(redMarker._wgRedMeta.uid))) || ''}`, { sticky: true });
                    line.addTo(layerGroup);
                    attackArrows.push(line);
                    const head = makeArrowhead(start, end, '#3a96d2', 9, SCENARIO_GRAPHICS_PANE);
                    if (head) {
                        head.addTo(layerGroup);
                        attackArrows.push(head);
                        try { if (head._path) head._path.classList.add('wg-attack-pulse'); } catch (_) {}
                    }
                }
            }
        }
    }

    // ── W3-rich: per-phase unit narrative tooltips ────────────────────
    // Rebuild every unit marker's tooltip on each applyState so the
    // operator can hover and read the phase-specific story:
    //   • identity: uid, Arabic name, echelon + role, side
    //   • live state: current/initial strength %, magazine / airframes /
    //     hulls counters when populated
    //   • actor: action_what, action_intended_effect, doctrine cited
    //   • affected: status_change, damage_pct, cause_actor uid, cause_what
    // Reads the full W3 step baseline (state.actors, state.affected,
    // state.unit_state) which is already piped through by the porter +
    // adjudicator. No-op on legacy W1/W2 scenarios.
    function applyW3UnitNarrative(state) {
        const sc = scenarioRef;
        if (!sc || sc.schema_variant !== 'w3-rich' || !state) return;

        const actorsByUid   = new Map();
        for (const a of (Array.isArray(state.actors)   ? state.actors   : [])) {
            if (a && a.uid) actorsByUid.set(a.uid, a);
        }
        const affectedByUid = new Map();
        for (const a of (Array.isArray(state.affected) ? state.affected : [])) {
            if (a && a.uid) affectedByUid.set(a.uid, a);
        }
        const unitState = (state.unit_state && typeof state.unit_state === 'object')
            ? state.unit_state : {};

        // Look up the static identity record (name_ar, role, echelon, side)
        // from the scenario OOB so we don't have to re-derive it per call.
        const redById  = new Map();
        const blueById = new Map();
        for (const u of (sc.red_units || []))         if (u && u.uid)      redById.set(u.uid, u);
        for (const u of (sc.blue_units_initial || [])) if (u && u.unit_uid) blueById.set(u.unit_uid, u);

        function tooltipFor(uid, side) {
            const ident = side === 'BLUE' ? blueById.get(uid) : redById.get(uid);
            if (!ident) return null;
            const us = unitState[uid] || {};
            const actor    = actorsByUid.get(uid);
            const affected = affectedByUid.get(uid);
            const lines = [];

            // Identity header
            const _dName = side === 'BLUE'
                ? displayBlueId(ident.base_id || uid)
                : (ident.label || displayRedId(uid));
            lines.push(`<strong>${esc(_dName)}</strong> · ${side}`);
            if (ident.name_ar) lines.push(`<div dir="rtl" style="font-size:11px;color:#cce;">${esc(ident.name_ar)}</div>`);
            const idLine2 = [ident.echelon || 'unit', displayRole(ident.role || ident.domain || '')].filter(Boolean).join(' · ');
            if (idLine2) lines.push(`<div style="font-size:10px;color:#9ab;">${esc(idLine2)}</div>`);

            // Live state — show strength %, suppressed/delayed when active,
            // and any domain-specific counter that's populated.
            const stateBits = [];
            if (Number.isFinite(us.current_strength) && Number.isFinite(us.initial_strength) && us.initial_strength > 0) {
                const pct = Math.round((us.current_strength / us.initial_strength) * 100);
                stateBits.push(`<span style="color:${pct >= 80 ? '#7fdc7f' : pct >= 50 ? '#e8c84c' : '#e87a4c'};">${pct}%</span>`);
            }
            if (us.suppressed_pct > 0) stateBits.push(`<span style="color:#ca8a04;">supp ${Math.round(us.suppressed_pct * 100)}%</span>`);
            if (us.delayed_pct    > 0) stateBits.push(`<span style="color:#7c3aed;">delay ${Math.round(us.delayed_pct    * 100)}%</span>`);
            if (Number.isFinite(us.magazine))        stateBits.push(`mag ${us.magazine}`);
            if (Number.isFinite(us.airframes))       stateBits.push(`air ${us.airframes}`);
            if (Number.isFinite(us.hulls_remaining)) stateBits.push(`hulls ${us.hulls_remaining}`);
            if (us.destroyed)                        stateBits.push(`<span style="color:#b00020;font-weight:700;">DESTROYED</span>`);
            if (stateBits.length) {
                lines.push(`<div style="margin-top:3px;font-size:10px;">${stateBits.join(' · ')}</div>`);
            }

            // Actor narrative (what this unit DID this phase)
            if (actor && actor.action_what) {
                lines.push(`<div style="margin-top:6px;padding-top:4px;border-top:1px solid #345;font-size:11px;">
                    <strong style="color:#9bd6a3;">▶ ${esc(actor.action_component || 'action')}:</strong> ${esc(actor.action_what)}
                </div>`);
                if (actor.action_intended_effect) {
                    lines.push(`<div style="font-size:10px;color:#bcd;font-style:italic;">→ ${esc(actor.action_intended_effect)}</div>`);
                }
                if (Array.isArray(actor.action_doctrine_cited) && actor.action_doctrine_cited.length) {
                    lines.push(`<div style="font-size:9px;color:#789;">[${esc(actor.action_doctrine_cited.join(', '))}]</div>`);
                }
            }

            // Affected detail (what HIT this unit this phase)
            if (affected && affected.status_change && affected.status_change !== 'unchanged') {
                const sc = affected.status_change;
                const color = ({
                    destroyed: '#b00020', damaged_partial: '#d97706',
                    suppressed: '#ca8a04', delayed: '#7c3aed',
                    expended: '#2563eb',
                })[sc] || '#888';
                const dmg = Number.isFinite(affected.damage_pct) ? ` (${Math.round(affected.damage_pct * 100)}%)` : '';
                lines.push(`<div style="margin-top:6px;padding-top:4px;border-top:1px solid #543;font-size:11px;">
                    <strong style="color:${color};">◆ ${esc(sc)}${dmg}</strong>
                </div>`);
                if (affected.cause_what) {
                    lines.push(`<div style="font-size:10px;color:#dcb;">${esc(affected.cause_what)}</div>`);
                }
                if (affected.cause_actor) {
                    lines.push(`<div style="font-size:9px;color:#a98;">by ${esc(affected.cause_actor)}</div>`);
                }
                if (affected.cause_doctrine) {
                    lines.push(`<div style="font-size:9px;color:#789;font-style:italic;">${esc(affected.cause_doctrine)}</div>`);
                }
            }

            // PR-107: display-offset transparency footer — Blue units only.
            // Appended after all live-state and narrative content so it
            // sits as a compact note at the bottom of the tooltip.
            // Red markers are unaffected (no display stagger applied to Red).
            // No raw coordinates exposed, no Event Log entries, no storage.
            if (side === 'BLUE') {
                const _offsetNote = esc(
                    (window.t && window.t('tooltip-display-offset-notice')) ||
                    'Displayed position is offset for readability.'
                );
                lines.push(
                    `<div style="margin-top:6px;padding-top:4px;border-top:1px solid #2a3a4a;font-size:9px;color:#6a7a8a;font-style:italic;">${_offsetNote}</div>`
                );
            }

            // PR-109: Red staging-cluster transparency note — Red units only.
            // Informs the operator that co-located Red markers are intentional
            // staging-area groupings (PR-108 audit: step-0 land/air/naval clusters).
            // Blue markers are unaffected. No raw coordinates, no Event Log, no storage.
            if (side === 'RED') {
                const _stagingNote = esc(
                    (window.t && window.t('tooltip-red-staging-note')) ||
                    'Multiple Red units may be intentionally staged at this assembly area.'
                );
                lines.push(
                    `<div style="margin-top:6px;padding-top:4px;border-top:1px solid #3a2a2a;font-size:9px;color:#8a6a6a;font-style:italic;">${_stagingNote}</div>`
                );
            }
            return lines.join('');
        }

        for (const [uid, m] of Object.entries(redMarkers)) {
            const html = tooltipFor(uid, 'RED');
            if (html) try { m.setTooltipContent(html); } catch (_) {}
        }
        for (const [uid, m] of Object.entries(blueMarkers)) {
            const html = tooltipFor(uid, 'BLUE');
            if (html) try { m.setTooltipContent(html); } catch (_) {}
        }
    }

    // ── W3-rich: per-step damage tinting ──────────────────────────────
    // For each affected unit listed in state.affected[], apply the NATO
    // "damaged" SIDC status modifier (a single horizontal bar through the
    // symbol). Cleared at the start of every step so non-destroyed damage
    // is ephemeral, mirroring W3's per-phase status_change semantics.
    // Destroyed units skip this layer entirely — their X overlay (via the
    // blue_destroyed / red_degraded pipelines) is sticky and authoritative.
    function applyW3PerStepDamage(state) {
        const sc = scenarioRef;
        if (!sc || sc.schema_variant !== 'w3-rich') return;
        const affected = Array.isArray(state && state.affected) ? state.affected : [];
        const affectedUids = new Set(affected.map(a => a && a.uid).filter(Boolean));

        // Pass 1: clear damage tint from any marker NOT in this step's
        // affected list. Destroyed markers are skipped — their X overlay
        // is the authoritative visual and we don't want to fight it.
        const all = [...Object.values(redMarkers), ...Object.values(blueMarkers)];
        for (const m of all) {
            const meta = (m && (m._wgRedMeta || m._wgBlueMeta));
            const uid  = meta && meta.uid;
            if (!uid) continue;
            const reg = unitRegistry[uid];
            if (reg && reg.status === UNIT_STATUS.DESTROYED) continue;
            if (!affectedUids.has(uid)) {
                try { unmarkUnitAsDamaged(m); } catch (_) {}
            }
        }
        // Pass 2: apply the damaged modifier for every affected uid whose
        // status_change is NOT 'destroyed' (destroyed gets the X via the
        // cumulative pipeline; we'd double-mark otherwise).
        for (const a of affected) {
            if (!a || !a.uid) continue;
            if (a.status_change === 'destroyed') continue;
            const m = redMarkers[a.uid] || blueMarkers[a.uid];
            if (!m) continue;
            try { markUnitAsDamaged(m); } catch (_) {}
        }
    }

    // ── W3-rich: explicit engagement arcs ─────────────────────────────
    // Draw the per-step engagement_arc LineStrings the W3 producer emits.
    // Each arc connects the attacker's coord to the target's coord and is
    // color-coded by `status_change` (see STATUS_COLORS). Arcs fade out
    // after a short lifetime so they read as "this engagement just
    // happened" rather than persisting across phases.
    function clearEngagementArcs() {
        for (const t of engagementArcTimers) { try { clearTimeout(t); } catch (_) {} }
        engagementArcTimers = [];
        for (const a of engagementArcs) {
            if (a && layerGroup) try { layerGroup.removeLayer(a); } catch (_) {}
        }
        engagementArcs = [];
    }

    // Render every engagement_arc this phase exactly as the W3 schema
    // README specifies (Wargame3/schema/README.md §5):
    //   "Render as: animated dashed line from source to target,
    //    color-coded by status_change. Fade in/out over ~1.5s."
    //
    // That's the whole spec. No NATO tactical-graphic chevrons, no
    // per-component visual signatures, no extra layers. The schema
    // intentionally caps complexity at 8–14 arcs per phase; anything
    // more becomes visual noise.
    function renderEngagementArcs(state, scenario) {
        clearEngagementArcs();
        if (!layerGroup || !state || !window.L) return;
        const sc = scenario || scenarioRef;
        if (!sc || sc.schema_variant !== 'w3-rich') return;
        const stepIndex = Number.isFinite(state && state.step_index) ? state.step_index : 0;
        const stepRow = Array.isArray(sc.steps) ? sc.steps[stepIndex] : null;
        const arcs = stepRow && Array.isArray(stepRow.engagement_arcs)
                     ? stepRow.engagement_arcs : [];
        if (!arcs.length) return;

        // Declutter dense phases: if more than 3 arcs, the first arc from
        // each shooter is "primary" (full opacity/weight); additional arcs
        // from the same shooter become secondary (thinner + dimmer). Phases
        // with ≤3 arcs are left fully prominent — behavior is unchanged.
        const dense = arcs.length > 3;
        const seenActors = new Set();

        arcs.forEach((arc, idx) => {
            const coords = arc && Array.isArray(arc.coordinates) ? arc.coordinates : null;
            if (!coords || coords.length < 2) return;
            const [src, dst] = coords;
            if (!Array.isArray(src) || !Array.isArray(dst)) return;

            const color = STATUS_COLORS[arc.status_change] || STATUS_COLORS.unchanged;
            // Base weight scales mildly with damage_pct so heavy strikes read
            // as more decisive than glancing engagements (3–5 px).
            const dmg        = Number.isFinite(arc.damage_pct) ? arc.damage_pct : 0.3;
            const baseWeight = Math.max(2, 2 + Math.round(dmg * 3));
            const start      = [src[1], src[0]];
            const end        = [dst[1], dst[0]];

            // First arc per shooter = primary; additional arcs from the same
            // shooter = secondary. Falls back to index < 3 when actor_uid absent.
            const actor     = arc.actor_uid || null;
            const isPrimary = dense ? (actor ? !seenActors.has(actor) : idx < 3) : true;
            if (actor) seenActors.add(actor);

            const weight  = dense && !isPrimary ? Math.max(1, Math.floor(baseWeight * 0.6)) : baseWeight;
            const opacity = dense && !isPrimary ? 0.30 : 0.85;

            const line = window.L.polyline([start, end], {
                color,
                weight,
                opacity,
                dashArray: '6 4',
                lineCap:   'round',
                interactive: false,
                className: 'wg-w3-engagement-arc wg-attack-pulse',
                pane: SCENARIO_GRAPHICS_PANE,
            });

            // Tooltip: actor → target · status + damage% · cause_what
            const tooltip = [
                arc.actor_uid && arc.target_uid ? `${arc.actor_uid} → ${arc.target_uid}` : null,
                `${arc.status_change || '?'}${Number.isFinite(arc.damage_pct) ? ` ${Math.round(arc.damage_pct * 100)}%` : ''}`,
                arc.cause_what,
            ].filter(Boolean).join(' · ');
            if (tooltip) line.bindTooltip(tooltip, { sticky: true });

            line.addTo(layerGroup);
            engagementArcs.push(line);

            // Arrowhead at the target end so direction is unambiguous.
            const head = makeArrowhead(start, end, color, weight * 4, SCENARIO_GRAPHICS_PANE);
            if (head) {
                head.addTo(layerGroup);
                engagementArcs.push(head);
            }

            // Per-schema fade after ~1.5s. The next applyState wipes
            // everything anyway; the timer prevents stale arcs from
            // piling up if the operator scrubs rapidly.
            const captured = [line, head].filter(Boolean);
            engagementArcTimers.push(setTimeout(() => {
                for (const layer of captured) {
                    try { if (layerGroup) layerGroup.removeLayer(layer); } catch (_) {}
                    const i = engagementArcs.indexOf(layer);
                    if (i >= 0) engagementArcs.splice(i, 1);
                }
            }, 1500));
        });
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
        const isW3      = scenarioRef && scenarioRef.schema_variant === 'w3-rich';

        // Sub-step interpolation factor (0..1). When the harness drives the
        // step animation it may pass state.substep_t for cinematic playback;
        // applyState normally calls with no substep (effectively t=1 → "snap
        // to end", CSS transition handles the smoothing). When prev_* is
        // available we honor a partial t so a future scrubber can drive
        // mid-phase positions.
        const t = (Number.isFinite(state && state.substep_t))
                  ? clamp01(state.substep_t) : 1;

        function lookupStep(table, uid, idx) {
            const arr = scenarioRef && scenarioRef[table] && scenarioRef[table][uid];
            return arr ? (arr[Math.min(idx, arr.length - 1)] || null) : null;
        }

        for (const m of Object.values(redMarkers)) {
            const meta = m && m._wgRedMeta;
            if (!meta) continue;
            let lonLat;
            if (isW3) {
                // W3-rich: use the W1-style BLS→OBJ lerp adapted to W3 role
                // vocabulary. This produces the same visual story as W1/W2
                // (armored brigades push to OBJ, arty hangs back, naval
                // stays offshore, SOF runs ahead) instead of the raw source
                // coords that put every unit on the same phase-line lat.
                // The raw red_unit_step_coords arrays remain available on
                // scenarioRef for analytics / replay, but the renderer uses
                // the computed lerp for positioning.
                lonLat = redPositionW3LonLat(meta, stepIndex, progress);
            } else {
                // W1/W2: original BLS→OBJ lerp keyed on W1 role vocabulary
                // (Main effort, Fixing, Recon, Follow-on, Exploitation, …).
                lonLat = redPositionLonLat(meta, stepIndex, progress);
            }
            if (!lonLat) continue;
            try {
                // Snapshot the marker's current LatLng BEFORE moving it — the
                // advance-arrow renderer reads this as the arrow's tail so it
                // shows "where the unit was → where the unit is going" instead
                // of a static landing-zone-to-current trail.
                m._wgLastLatLng = m.getLatLng();
                m.setLatLng([lonLat[1], lonLat[0]]);
            } catch (_) { /* ignore */ }
        }
        // PR-102: build a geo-bucket cluster map for all Blue units once per
        // applyState call. Units whose raw step-coord (or baseCoord) falls in
        // the same ~8 km geographic grid cell form a cluster; each gets a
        // deterministic { clusterIndex, clusterSize } entry used by
        // computeDisplayOffset to place it at a regular-polygon vertex.
        // Units alone in their cell receive no entry → zero displacement.
        // Only raw authoritative coords are read here — marker LatLng is
        // never consulted, so red markers and engagement logic are untouched.
        const _blueClusterMap = (function buildBlueClusterMap() {
            const result  = new Map();
            const cellKm  = LAYOUT_CONFIG.blueClusterBucketKm || 8.0;
            const cells   = Object.create(null);
            for (const m of Object.values(blueMarkers)) {
                const meta = m && m._wgBlueMeta;
                if (!meta) continue;
                const uid = meta.uid;
                const arr = scenarioRef && scenarioRef.blue_unit_step_coords &&
                            scenarioRef.blue_unit_step_coords[uid];
                const raw = (Array.isArray(arr) && arr.length)
                            ? arr[Math.min(stepIndex, arr.length - 1)]
                            : meta.baseCoord;
                if (!raw) continue;
                const lon = raw[0], lat = raw[1];
                const gx  = Math.round(lon * kmPerDegLng(lat) / cellKm);
                const gy  = Math.round(lat * KM_PER_DEG_LAT  / cellKm);
                const key = gx + '_' + gy;
                if (!cells[key]) cells[key] = [];
                cells[key].push(uid);
            }
            for (const uids of Object.values(cells)) {
                if (uids.length < 2) continue;   // isolated → no entry
                uids.sort();                       // deterministic, uid-stable order
                const sz = uids.length;
                uids.forEach((uid, idx) =>
                    result.set(uid, { clusterIndex: idx, clusterSize: sz }));
            }
            return result;
        })();
        const _blueZoom = (() => {
            try { return (window.map && window.map.getZoom) ? window.map.getZoom() : 7; }
            catch (_) { return 7; }
        })();

        for (const m of Object.values(blueMarkers)) {
            const meta = m && m._wgBlueMeta;
            if (!meta) continue;
            let lonLat;
            // W3-rich: blue also gets per-step coords. W1/W2 keeps the
            // COUNTERATTACK/WITHDRAW base-offset logic.
            const w3curr = lookupStep('blue_unit_step_coords', meta.uid, stepIndex);
            if (w3curr) {
                const w3prev = lookupStep('blue_unit_step_prev', meta.uid, stepIndex) || w3curr;
                lonLat = (t >= 1) ? w3curr : lerpLonLat(w3prev, w3curr, t);
            } else {
                lonLat = bluePositionLonLat(meta, stepIndex, state);
            }
            // PR-102: display-only Blue cluster fan-out. Co-located units are
            // spread on a regular polygon ring (geographic-index angle, zoom-
            // adaptive radius). Isolated units get zero displacement (null stagger).
            // Raw scenario coords (meta.baseCoord, blue_unit_step_coords) are
            // never mutated. Red markers, engagement logic, damage/kill paths,
            // arrows, BLS/OBJ, and phase line are completely unaffected.
            if (lonLat) {
                const cluster = _blueClusterMap.get(meta.uid);
                const stagger = computeDisplayOffset({
                    mode:         'blue-display-stagger',
                    uid:          meta.uid,
                    echelon:      meta.echelon,
                    clusterIndex: cluster ? cluster.clusterIndex : 0,
                    clusterSize:  cluster ? cluster.clusterSize  : 1,
                    zoom:         _blueZoom,
                });
                if (stagger) lonLat = offsetLonLat(lonLat, stagger.eastKm, stagger.northKm);
            }
            if (!lonLat) continue;
            try {
                m._wgLastLatLng = m.getLatLng();
                m.setLatLng([lonLat[1], lonLat[0]]);
            } catch (_) { /* ignore */ }
        }
    }

    // Build a small triangle polygon at `end` pointing in the direction of
    // motion from `start`. Returns an L.polygon.
    function makeArrowhead(start, end, color, size, pane) {
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
        const polyOpts = {
            color,
            weight: 1,
            opacity: 0.9,
            fillColor: color,
            fillOpacity: 0.9,
            interactive: false,
        };
        if (pane) polyOpts.pane = pane;
        return window.L.polygon([[tipLat, tipLng], left, right], polyOpts);
    }

    // ── AOR phase line ────────────────────────────────────────────────
    // Dashed yellow horizontal-ish line across the AOR at the current PL
    // depth. Complements the pipeline-fill — that follows the axis, this
    // shows the across-front frontier.
    function updateAorPhaseLine(state, scenario) {
        if (aorPhaseLine && layerGroup) layerGroup.removeLayer(aorPhaseLine);
        if (aorPhaseLineLabel && layerGroup) layerGroup.removeLayer(aorPhaseLineLabel);
        aorPhaseLine = null;
        aorPhaseLineLabel = null;
        if (!layerGroup || !scenario || !scenario.map_bbox) return;
        if (!state || state.phase_line_km == null || state.phase_line_km < 1) return;
        const [, , , latN] = scenario.map_bbox;
        const coastLat = latN - 0.06;
        const lat = coastLat - (state.phase_line_km / 110);
        if (lat <= scenario.map_bbox[1]) return; // off the southern edge
        const displayStatus = deriveDisplayOutcome(state);
        const dashColor = COLORS.OBJ[displayStatus] || '#e8a23a';
        const isAr    = document.documentElement.lang === 'ar';
        const plLabel = isAr
            ? `خط المرحلة — ${state.phase_line_km} كم`
            : `Phase Line — ${state.phase_line_km} km`;
        aorPhaseLine = window.L.polyline(
            [[lat, scenario.map_bbox[0]], [lat, scenario.map_bbox[2]]],
            { color: dashColor, weight: 1.5, opacity: 0.55, dashArray: '8 6', interactive: false,
              pane: SCENARIO_GRAPHICS_PANE },
        );
        aorPhaseLine.addTo(layerGroup);

        // Full-text pill at the line's western end — always-visible label;
        // permanent Leaflet tooltips on non-interactive layers cannot be cleaned
        // up reliably across step changes (Leaflet skips removal for permanent
        // tooltips), so the pill marker is the sole label for this line.
        aorPhaseLineLabel = window.L.marker([lat, scenario.map_bbox[0]], {
            interactive: false,
            pane: SCENARIO_GRAPHICS_PANE,
            icon: window.L.divIcon({
                className: 'wg-adj-pl-label',
                html: `<div dir="auto" style="
                    background:${dashColor};
                    color:#fff;font-size:10px;font-weight:700;
                    letter-spacing:0.04em;
                    padding:2px 7px;border-radius:8px;
                    border:1px solid rgba(255,255,255,0.5);
                    white-space:nowrap;
                    text-shadow:0 0 2px #000;
                    box-shadow:0 0 3px rgba(0,0,0,.5);
                    transform:translate(4px, -50%);
                ">${plLabel}</div>`,
                iconSize:   null,
                iconAnchor: [0, 0],
            }),
        });
        aorPhaseLineLabel.addTo(layerGroup);
    }

    // ── Unit hierarchy inference + lifecycle ─────────────────────────
    // Blue units use a naming convention that encodes the chain of command:
    //   lc                — division/force root
    //   b<X>c             — brigade under lc        (b1c, b2c, b3c)
    //   p<X><Y>c          — battalion under b<X>c   (p11c..p33c)
    //   c<X><Y><Z>        — company   under p<X><Y>c (c111..c333)
    // We derive parent/root from the base_id so a destroyed parent can cascade
    // to its subordinates without the scenario file having to list them.
    function inferBlueParent(baseId) {
        const id = String(baseId || '');
        if (!id) return { parent: null, root: null };
        let m;
        if (id === 'lc')                              return { parent: null,                root: 'lc'  };
        if ((m = id.match(/^b([1-9])c$/)))            return { parent: 'lc',                root: 'lc'  };
        if ((m = id.match(/^p([1-9])([1-9])c$/)))     return { parent: 'b' + m[1] + 'c',    root: 'lc'  };
        if ((m = id.match(/^c([1-9])([1-9])([1-9])$/))) return { parent: 'p' + m[1] + m[2] + 'c', root: 'lc'  };
        return { parent: null, root: null };
    }

    // Registry helpers. UIDs in deltas come in as "BLUE_lc" / "RED_43MECH" —
    // but parent inference works off the base_id portion. registerUnit takes
    // the marker's source data and normalises both.
    function registerBlueUnit(unit) {
        const uid    = unit.unit_uid;
        const baseId = unit.base_id;
        const { parent, root } = inferBlueParent(baseId);
        const parentId = parent ? ('BLUE_' + parent) : null;
        const rootId   = root   ? ('BLUE_' + root)   : null;
        unitRegistry[uid] = {
            id:       uid,
            parentId,
            rootId,
            side:     'friendly',
            status:   UNIT_STATUS.ACTIVE,
            strength: 1.0,
            canMove:  true,
            canFight: true,
        };
    }
    function registerRedUnit(unit) {
        // Red OOB doesn't carry parent info in the scenario — they're
        // independent of each other for cascade purposes (each its own root).
        // If a future scenario emits unit.parent_uid / unit.formation_uid we
        // honour it; otherwise the unit is its own root and only its own
        // status/strength decides effectiveness.
        const uid = unit.uid;
        unitRegistry[uid] = {
            id:       uid,
            parentId: unit.parent_uid || null,
            rootId:   unit.formation_uid || unit.parent_uid || uid,
            side:     'hostile',
            status:   UNIT_STATUS.ACTIVE,
            strength: Number.isFinite(unit.strength) ? unit.strength : 1.0,
            canMove:  true,
            canFight: true,
        };
    }

    // Effective status walks the chain: if the unit itself, its parent, or
    // its root formation is destroyed, the unit reads as destroyed regardless
    // of what its own .status field says. This is the function the renderer
    // consults before drawing every symbol.
    //
    // Accepts either a registry entry, a uid string, or a marker (we read
    // marker._wgUnit.id if present). Returns one of UNIT_STATUS.*.
    function getEffectiveUnitStatus(unit) {
        let entry;
        if (typeof unit === 'string')                   entry = unitRegistry[unit];
        else if (unit && unit._wgUnit && unit._wgUnit.id) entry = unitRegistry[unit._wgUnit.id];
        else if (unit && unit.id && unitRegistry[unit.id]) entry = unitRegistry[unit.id];
        else                                            entry = unit;
        if (!entry) return UNIT_STATUS.ACTIVE;

        // Cap recursion at the actual hierarchy depth (~5: company → bn →
        // bde → div → root). The guard is belt-and-braces against a cycle
        // in malformed scenario data.
        const seen = new Set();
        let cur = entry;
        let depth = 0;
        while (cur && depth < 10 && !seen.has(cur.id)) {
            seen.add(cur.id);
            if (cur.status === UNIT_STATUS.DESTROYED) return UNIT_STATUS.DESTROYED;
            if (Number.isFinite(cur.strength) && cur.strength <= 0) return UNIT_STATUS.DESTROYED;
            const nextId = cur.parentId || (cur.rootId !== cur.id ? cur.rootId : null);
            cur = nextId ? unitRegistry[nextId] : null;
            depth++;
        }
        // No destroyed link found — return the unit's own status (could still
        // be degraded).
        return entry.status || UNIT_STATUS.ACTIVE;
    }

    // Cascade: when a parent or root unit is marked destroyed, every descendant
    // in the registry transitively reads as destroyed via getEffectiveUnitStatus.
    // We don't need to *mutate* the children's own status (the cascade is
    // implicit in the walk), but we DO need to make sure their markers re-render.
    // collectAffectedMarkers returns the marker list that needs a redraw.
    function collectAllMarkers() {
        const out = [];
        for (const m of Object.values(blueMarkers || {})) if (m) out.push(m);
        for (const m of Object.values(redMarkers  || {})) if (m) out.push(m);
        return out;
    }

    // Apply the visual treatment for an effective status to ONE marker.
    // Rendering priority (matches the bug-report spec):
    //   1. effective === 'destroyed' → gray + 0.35 opacity + X overlay
    //   2. effective === 'degraded'  → side color, ~0.65 opacity (attrited)
    //   3. else                      → restore (side color, full opacity)
    // Side color is NEVER allowed to override destroyed status — the
    // grayscale CSS filter desaturates the SIDC icon and the X overlay
    // makes the destroyed state visually unambiguous.
    function renderMarkerByStatus(marker, effStatus) {
        if (!marker) return;
        let el;
        try { el = marker.getElement(); } catch (_) { el = null; }
        if (!el) return;
        const entry = marker._wgUnit && unitRegistry[marker._wgUnit.id];
        const sideColor = entry && entry.side === 'hostile' ? COLORS.RED_UNIT : COLORS.BLUE_UNIT;

        // Helper: refresh the el reference after any setIcon() that
        // mark/unmarkUnitAsDamaged may have done (Leaflet replaces the
        // marker's DOM node when the icon changes).
        const refreshEl = () => {
            try { return marker.getElement(); } catch (_) { return null; }
        };

        if (effStatus === UNIT_STATUS.DESTROYED) {
            // Restore the active SIDC first (so we don't render the damaged
            // bar AND the destroyed X stacked), then apply the destroyed
            // treatment to the resulting fresh element.
            unmarkUnitAsDamaged(marker);
            const el2 = refreshEl();
            if (el2) {
                el2.style.opacity = '';
                el2.style.filter  = '';
                el2.classList.add('wg-destroyed');
            }
            markUnitAsDestroyed(marker);
            destroyedMarkers.set(marker._leaflet_id, marker);
            dbg('render destroyed', {
                id:       marker._wgUnit && marker._wgUnit.id,
                parentId: entry && entry.parentId,
                rootId:   entry && entry.rootId,
                own:      entry && entry.status,
                eff:      effStatus,
                color:    COLORS.DESTROYED,
            });
        } else if (effStatus === UNIT_STATUS.DEGRADED) {
            // Friendly: NATO damaged modifier (single horizontal bar in
            // the symbol) via SIDC position 7 = '3'. Compact and doctrinal.
            // Hostile: opacity-based fade only — red icon stays unambiguous.
            const isFriendly = entry && entry.side === 'friendly';
            unmarkUnitAsDestroyed(marker);
            if (isFriendly) {
                markUnitAsDamaged(marker);
                const el2 = refreshEl();
                if (el2) {
                    el2.style.opacity = '';
                    el2.style.filter  = '';
                    el2.classList.remove('wg-destroyed');
                }
            } else {
                unmarkUnitAsDamaged(marker);
                const el2 = refreshEl();
                if (el2) {
                    const strength = (entry && Number.isFinite(entry.strength)) ? entry.strength : 0.7;
                    el2.style.opacity = String(Math.max(0.5, 0.4 + strength * 0.5));
                    el2.style.filter  = '';
                    el2.classList.remove('wg-destroyed');
                }
            }
            dbg('render degraded', {
                id:       marker._wgUnit && marker._wgUnit.id,
                side:     entry && entry.side,
                parentId: entry && entry.parentId,
                rootId:   entry && entry.rootId,
                own:      entry && entry.status,
                eff:      effStatus,
                strength: entry && entry.strength,
                color:    sideColor,
            });
        } else {
            unmarkUnitAsDestroyed(marker);
            unmarkUnitAsDamaged(marker);
            const el2 = refreshEl();
            if (el2) {
                el2.style.opacity = '';
                el2.style.filter  = '';
                el2.classList.remove('wg-destroyed');
            }
            dbg('render active', {
                id:       marker._wgUnit && marker._wgUnit.id,
                parentId: entry && entry.parentId,
                rootId:   entry && entry.rootId,
                own:      entry && entry.status,
                eff:      effStatus,
                color:    sideColor,
            });
        }
    }

    // ── AN1: per-step per-unit attrition visuals ─────────────────────
    // Wire the scenario's OWN per-step engagement record (step.affected[] +
    // step.engagement_arcs[]) onto the unit markers so the viewer sees WHICH
    // units were degraded or destroyed at the current step. Rendering/wiring
    // only: reads scenario data, mutates NO scenario object, invents NO damage.
    //
    // Honest status mapping — the scenario's real status_change vocabulary is
    // {destroyed, damaged_partial, suppressed, expended, delayed, unchanged}.
    // The marker renderer (renderMarkerByStatus) has exactly two affected
    // treatments plus reset, so we map to those and DO NOT fabricate finer
    // states the data/renderer don't support. The granular status_change is
    // preserved verbatim on marker._attrition for tooltips/panels (no loss).
    //   destroyed / killed / sunk            → DESTROYED (gray + X overlay)
    //   anything else explicitly flagged     → DEGRADED  (conservative "affected")
    //   unchanged / missing                  → no change (active)
    function attritionStatusOf(statusChange) {
        if (!statusChange || typeof statusChange !== 'string') return null;
        const s = statusChange.toLowerCase();
        if (s === 'unchanged') return null;
        if (s.indexOf('destroy') !== -1 || s === 'killed' || s === 'sunk') {
            return UNIT_STATUS.DESTROYED;
        }
        // Explicitly flagged but not a kill → conservative "affected"/degraded.
        return UNIT_STATUS.DEGRADED;
    }

    // Does this scenario carry per-step engagement data we can render? Non-W3
    // scenarios without affected[]/engagement_arcs[] are left completely
    // untouched (applyStepAttrition becomes a no-op for them).
    function scenarioHasAttritionData(scenario) {
        const steps = scenario && Array.isArray(scenario.steps) ? scenario.steps : [];
        return steps.some(s => s && (
            (Array.isArray(s.affected) && s.affected.length) ||
            (Array.isArray(s.engagement_arcs) && s.engagement_arcs.length)
        ));
    }

    // Build CUMULATIVE attrition up to and including stepIndex from scenario
    // data. Cumulative by design: a unit that took damage or was destroyed
    // stays in that state on later steps — units don't un-take damage. Because
    // we recompute from step 0 every time, stepping BACKWARD correctly restores
    // the earlier picture (nothing gets stuck). DESTROYED is terminal and wins
    // over DEGRADED. affected[] is authoritative for a unit's own status;
    // engagement_arcs[] supplements via the TARGET that took the effect.
    // Returns { status: Map<uid, UNIT_STATUS>, info: Map<uid, {...}> }.
    function computeStepAttrition(scenario, stepIndex) {
        const status = new Map();
        const info   = new Map();
        const steps = scenario && Array.isArray(scenario.steps) ? scenario.steps : [];
        const upTo = Math.min(Number.isFinite(stepIndex) ? stepIndex : 0, steps.length - 1);
        const consume = (uid, statusChange, stepNo, rec) => {
            if (!uid) return;
            const mapped = attritionStatusOf(statusChange);
            if (!mapped) return;
            const prev = status.get(uid);
            if (prev === UNIT_STATUS.DESTROYED) {
                // terminal — never downgrade a destroyed unit
            } else if (mapped === UNIT_STATUS.DESTROYED) {
                status.set(uid, UNIT_STATUS.DESTROYED);
            } else {
                status.set(uid, UNIT_STATUS.DEGRADED);
            }
            info.set(uid, Object.assign({ step: stepNo, status_change: statusChange }, rec || {}));
        };
        for (let i = 0; i <= upTo; i++) {
            const row = steps[i] || {};
            (Array.isArray(row.affected) ? row.affected : []).forEach(a => {
                if (!a) return;
                consume(a.uid, a.status_change, i, {
                    damage_pct:    Number.isFinite(a.damage_pct) ? a.damage_pct : null,
                    cause_actor:   a.cause_actor || null,
                    cause_what:    a.cause_what || null,
                    cause_doctrine: a.cause_doctrine || null,
                });
            });
            (Array.isArray(row.engagement_arcs) ? row.engagement_arcs : []).forEach(arc => {
                if (!arc) return;
                consume(arc.target_uid, arc.status_change, i, {
                    damage_pct:    Number.isFinite(arc.damage_pct) ? arc.damage_pct : null,
                    cause_actor:   arc.actor_uid || null,
                    cause_what:    arc.cause_what || null,
                    cause_doctrine: arc.cause_doctrine || null,
                });
            });
        }
        return { status, info };
    }

    // Apply per-step attrition visuals to ALL unit markers. Idempotent:
    // recomputes the full cumulative picture for stepIndex and restyles every
    // unit (affected → degraded/destroyed, everyone else → active/reset), so
    // forward AND backward stepping both land correctly and units no longer in
    // the cumulative set are reset. Restyling unaffected units is cheap — the
    // mark/unmark helpers early-return when a marker isn't currently marked.
    // No-op for scenarios without engagement data. Reuses renderMarkerByStatus
    // (the same treatment the live HUD uses) so playback and HUD look identical.
    function applyStepAttrition(stepIndex) {
        const sc = scenarioRef;
        if (!sc || !scenarioHasAttritionData(sc)) { playbackAttritionStep = -1; return false; }
        const idx = Number.isFinite(stepIndex) ? stepIndex : 0;
        const { status, info } = computeStepAttrition(sc, idx);
        const restyle = (dict) => {
            for (const uid of Object.keys(dict || {})) {
                const m = dict[uid];
                if (!m) continue;
                const st = status.get(uid) || UNIT_STATUS.ACTIVE;
                // Render-state ONLY (not scenario data): the latest engagement
                // record for this unit at/under the current step, for future
                // tooltip/panel surfacing. Cleared when the unit is unaffected.
                m._attrition = (st === UNIT_STATUS.ACTIVE)
                    ? null
                    : Object.assign({ effective: st }, info.get(uid) || { status_change: 'affected', step: idx });
                try { renderMarkerByStatus(m, st); } catch (_) { /* ignore */ }
            }
        };
        restyle(redMarkers);
        restyle(blueMarkers);
        playbackAttritionStep = idx;
        return true;
    }

    // ── HQ-damage propagation ─────────────────────────────────────────
    // Operator feedback: a battalion/brigade sitting alive on the map while
    // half its companies are gray-X around it doesn't reflect reality —
    // "the blue will not just be standing as the enemy approaches". When
    // an HQ-level unit (battalion / brigade / division) is not explicitly
    // destroyed but its subordinates and physical neighbours have been
    // attrited, the HQ should read as DAMAGED (degraded), not full-strength.
    //
    // Two passes feed the same degradation decision:
    //   - Hierarchy: count destroyed direct children of the HQ.
    //   - Proximity: count destroyed lower-echelon units within ~8 km.
    // The higher of the two ratios wins. ≥50 % → degraded; the parent
    // does NOT auto-destroy (that's beyond what the operator asked for —
    // damaged ≠ destroyed). Strength scales with the destruction ratio so
    // a half-attrited HQ looks more attrited than a third-attrited one.
    const HQ_ECHELONS = new Set(['battalion', 'brigade', 'division']);
    const ECHELON_RANK = { company: 1, battalion: 2, brigade: 3, division: 4, support: 1 };
    const PROXIMITY_DAMAGE_KM = 8;

    function echelonOf(uid) {
        const m = blueMarkers[uid];
        return m && m._wgBlueMeta && m._wgBlueMeta.echelon;
    }
    function markerLatLng(uid) {
        const m = blueMarkers[uid];
        if (!m) return null;
        try { return m.getLatLng(); } catch (_) { return null; }
    }

    function propagateHqDamage() {
        // Build parent → [direct children] for the hierarchy pass.
        const childrenByParent = {};
        for (const reg of Object.values(unitRegistry)) {
            if (!reg.parentId) continue;
            (childrenByParent[reg.parentId] = childrenByParent[reg.parentId] || []).push(reg);
        }

        for (const reg of Object.values(unitRegistry)) {
            if (reg.side !== 'friendly') continue;
            if (reg.status === UNIT_STATUS.DESTROYED) continue; // explicit kill wins

            const ech = echelonOf(reg.id);
            if (!ech || !HQ_ECHELONS.has(ech)) continue;
            const myRank = ECHELON_RANK[ech] || 0;

            // ── Hierarchy ratio ──
            const kids = childrenByParent[reg.id] || [];
            let kidDestroyed = 0;
            for (const c of kids) {
                if (getEffectiveUnitStatus(c.id) === UNIT_STATUS.DESTROYED) kidDestroyed++;
            }
            const hierRatio = kids.length > 0 ? kidDestroyed / kids.length : 0;

            // ── Proximity ratio ──
            let nearTotal = 0, nearDestroyed = 0;
            const myLL = markerLatLng(reg.id);
            if (myLL) {
                for (const other of Object.values(unitRegistry)) {
                    if (other.id === reg.id) continue;
                    if (other.side !== 'friendly') continue;
                    const otherEch = echelonOf(other.id);
                    if (!otherEch) continue;
                    if ((ECHELON_RANK[otherEch] || 0) >= myRank) continue; // only lower echelons
                    const otherLL = markerLatLng(other.id);
                    if (!otherLL) continue;
                    const km = haversineKm([myLL.lat, myLL.lng], [otherLL.lat, otherLL.lng]);
                    if (km > PROXIMITY_DAMAGE_KM) continue;
                    nearTotal++;
                    if (getEffectiveUnitStatus(other.id) === UNIT_STATUS.DESTROYED) nearDestroyed++;
                }
            }
            const proxRatio = nearTotal > 0 ? nearDestroyed / nearTotal : 0;

            const ratio = Math.max(hierRatio, proxRatio);
            if (ratio >= 0.5) {
                reg.status   = UNIT_STATUS.DEGRADED;
                reg.strength = Math.max(0.2, 1.0 - ratio * 0.8);
                reg.canMove  = true;
                reg.canFight = true;
                dbg('hq damaged', {
                    id:        reg.id,
                    echelon:   ech,
                    hierRatio: +hierRatio.toFixed(2),
                    proxRatio: +proxRatio.toFixed(2),
                    chosen:    +ratio.toFixed(2),
                    kids:      kids.length,
                    kidDestroyed,
                    nearTotal,
                    nearDestroyed,
                });
            }
        }
    }

    // Walk every placed marker and apply its effective status. Called from
    // applyState() after the deltas for the step have been folded into the
    // registry. Destroyed parents reach their children through the chain
    // walk in getEffectiveUnitStatus — no extra plumbing needed.
    function refreshAllMarkerStatuses() {
        for (const m of collectAllMarkers()) {
            const uid = m._wgUnit && m._wgUnit.id;
            if (!uid) continue;
            const eff = getEffectiveUnitStatus(uid);
            renderMarkerByStatus(m, eff);
        }
    }


    // Public guard for "can this unit still act?" — used by callers that
    // want to gate movement / fire / selection on the lifecycle state.
    // A destroyed unit cannot move, fight, or be counted in combat strength.
    function canUnitAct(uid) {
        const eff = getEffectiveUnitStatus(uid);
        return eff !== UNIT_STATUS.DESTROYED;
    }

    // ── Damaged indicator (NATO APP-6 status digit) ───────────────────
    // Per APP-6D, position 7 of the SIDC encodes operational condition:
    //   '0' = present (operational), '3' = damaged, '4' = destroyed.
    // milsymbol's simpleStatusModifier renders status '3' as a single
    // horizontal bar across the unit symbol — compact, doctrinally
    // correct, and consistent with the rest of the app's NATO rendering.
    // We rebuild the icon in-place; the original SIDC stays on
    // marker._sidc so unmarkUnitAsDamaged can restore active state.
    //
    // Fallback (no valid SIDC, e.g. diamondIcon/squareIcon markers): a
    // smaller orange diagonal overlay so non-SIDC markers still read as
    // attrited at a glance.
    function setSidcStatusDigit(sidc, statusChar) {
        if (typeof sidc !== 'string' || sidc.length < 7) return sidc;
        return sidc.slice(0, 6) + statusChar + sidc.slice(7);
    }
    function markUnitAsDamaged(marker) {
        if (!marker || marker._sidcDamaged) return;
        try {
            const sidc = marker._sidc;
            const size = marker._iconSize;
            if (sidc && sidc.length >= 7 && window.ms && typeof window.ms.Symbol === 'function') {
                const newIcon = sidcIcon(setSidcStatusDigit(sidc, '3'), size);
                if (newIcon) {
                    marker.setIcon(newIcon);
                    marker._sidcDamaged = true;
                    return;
                }
            }
            // Fallback overlay for non-SIDC markers.
            const el = marker.getElement();
            if (!el || el.querySelector('.wg-adj-x') || el.querySelector('.wg-adj-damage')) return;
            const d = document.createElement('div');
            d.className = 'wg-adj-damage';
            d.style.cssText = `
                position:absolute;
                top:-5%;left:-5%;
                width:110%;height:110%;
                pointer-events:none;
                z-index:9;
            `;
            d.innerHTML = `
                <svg width="100%" height="100%" viewBox="0 0 100 100"
                     preserveAspectRatio="none"
                     style="position:absolute;top:0;left:0;display:block;overflow:visible;">
                    <line x1="0"   y1="100" x2="100" y2="0"
                          stroke="#ffffff" stroke-width="9" stroke-linecap="round" opacity="0.85"/>
                    <line x1="0"   y1="100" x2="100" y2="0"
                          stroke="#e8a23a" stroke-width="6" stroke-linecap="round"/>
                </svg>
            `;
            el.appendChild(d);
        } catch (_) { /* ignore */ }
    }
    function unmarkUnitAsDamaged(marker) {
        if (!marker) return;
        try {
            // NATO path: restore the original SIDC via setIcon.
            if (marker._sidcDamaged && marker._sidc && window.ms && typeof window.ms.Symbol === 'function') {
                const newIcon = sidcIcon(marker._sidc, marker._iconSize);
                if (newIcon) {
                    marker.setIcon(newIcon);
                }
                marker._sidcDamaged = false;
                return;
            }
            // Fallback overlay path.
            const el = marker.getElement();
            if (!el) return;
            const d = el.querySelector('.wg-adj-damage');
            if (d) d.remove();
        } catch (_) { /* ignore */ }
    }

    // ── Explosion burst (transient marker) ───────────────────────────
    // Spawn a short-lived divIcon at latLng that plays the wg-adj-explosion
    // CSS animation and removes itself when done. Used to mark each blue
    // death as a visible "small action" before the X overlay settles.
    // Kept compact (32×32) and short (~300ms) so multiple bursts inside a
    // single step don't crowd the map or feel laggy.
    function spawnExplosion(latLng, durationMs) {
        if (!hasMap() || !layerGroup || !latLng) return;
        const dur = Number.isFinite(durationMs) ? durationMs : 300;
        const icon = window.L.divIcon({
            className: 'wg-adj-explosion',
            html: `<svg viewBox="0 0 100 100" width="32" height="32"
                        style="overflow:visible;display:block;">
                      <circle cx="50" cy="50" r="28"
                              fill="#ffb13a" opacity="0.85"/>
                      <circle cx="50" cy="50" r="40"
                              fill="none" stroke="#ff5c1a" stroke-width="6"
                              opacity="0.9"/>
                      <circle cx="50" cy="50" r="12"
                              fill="#fff7d6" opacity="0.95"/>
                   </svg>`,
            iconSize:   [32, 32],
            iconAnchor: [16, 16],
        });
        const m = window.L.marker(latLng, { icon, interactive: false });
        m.addTo(layerGroup);
        setTimeout(() => {
            try { layerGroup.removeLayer(m); } catch (_) {}
        }, dur + 50);
    }

    // ── Breach badge (NATO-style coastal-defense breach marker) ──────
    // Stamped at a BLS the FIRST step it transitions out of STAGED — i.e.
    // when red force first contacted/breached the coastal defense at that
    // landing site. Doctrinally a breach graphic is a wedge with hash
    // marks; we approximate with a chevron + 'B' badge so it's instantly
    // readable at this map scale. Persists until clearScenario / resetMap.
    function spawnBreachBadge(latLng, blsName) {
        if (!hasMap() || !layerGroup || !latLng) return null;
        const icon = window.L.divIcon({
            className: 'wg-adj-breach',
            html: `<div style="
                position:relative;width:36px;height:24px;
                pointer-events:none;
            ">
                <svg viewBox="0 0 36 24" width="36" height="24"
                     style="position:absolute;top:0;left:0;display:block;overflow:visible;">
                    <!-- wedge / chevron pointing inland -->
                    <path d="M2 22 L18 4 L34 22" fill="none"
                          stroke="#ffd33a" stroke-width="3"
                          stroke-linecap="round" stroke-linejoin="round"/>
                    <!-- two hash marks across the chevron (the 'breach' bars) -->
                    <line x1="10" y1="13" x2="14" y2="9"
                          stroke="#ffd33a" stroke-width="2.5" stroke-linecap="round"/>
                    <line x1="22" y1="9"  x2="26" y2="13"
                          stroke="#ffd33a" stroke-width="2.5" stroke-linecap="round"/>
                </svg>
                <div style="
                    position:absolute;top:7px;left:0;width:36px;
                    text-align:center;font-size:9px;color:#ffd33a;
                    font-weight:900;letter-spacing:0.06em;
                    text-shadow:0 0 3px #000, 0 0 2px #000;
                ">B</div>
            </div>`,
            iconSize:   [36, 24],
            iconAnchor: [18, 28],   // sit just above the BLS half-circle
        });
        const m = window.L.marker(latLng, { icon, interactive: false });
        m.bindTooltip(`Breach at ${blsName}`, { sticky: true });
        m.addTo(layerGroup);
        return m;
    }

    // ── Staggered death scheduler ────────────────────────────────────
    // For each blue uid in this step's per_unit_deltas.blue_destroyed: fire
    // an explosion at the blue's position, then (after the burst peaks)
    // mark the registry entry destroyed so the renderer applies the gray
    // icon + black X. Deaths are ordered by distance from the main-effort
    // red's start-of-step position so they fall in the order red sweeps
    // past them — closest first, farthest last. Skipped on rewind so a
    // backward scrub doesn't re-explode old kills.
    function scheduleStaggeredDeaths(state, opts) {
        opts = opts || {};
        // Cancel anything still queued from the previous step.
        for (const t of pendingDeathTimers) { try { clearTimeout(t); } catch (_) {} }
        pendingDeathTimers = [];

        if (opts.instant) return;
        const deaths = (state && state.per_unit_deltas && Array.isArray(state.per_unit_deltas.blue_destroyed))
            ? state.per_unit_deltas.blue_destroyed
            : [];
        if (!deaths.length) return;

        const mainRedMarker = Object.values(redMarkers).find(m =>
            m && m._wgRedMeta && m._wgRedMeta.role === 'Main effort');
        let fromLL = null;
        if (mainRedMarker) {
            fromLL = mainRedMarker._wgLastLatLng || null;
            if (!fromLL) { try { fromLL = mainRedMarker.getLatLng(); } catch (_) {} }
        }

        const ordered = deaths
            .map(uid => ({ uid, marker: blueMarkers[uid] }))
            .filter(d => d.marker)
            .map(d => {
                let ll = null; try { ll = d.marker.getLatLng(); } catch (_) {}
                const km = (ll && fromLL)
                    ? haversineKm([fromLL.lat, fromLL.lng], [ll.lat, ll.lng])
                    : 0;
                return { uid: d.uid, ll, km };
            })
            .filter(d => d.ll)
            .sort((a, b) => a.km - b.km);

        // Total step animation is ~500ms (marker CSS transform); we want all
        // explosions + X reveals to FINISH inside that window so the operator
        // never sees "destruction happens after advance settles". Stagger
        // window 250ms, X reveal 100ms after each explosion → last X lands at
        // ~startDelay+250+100 = 450ms.
        const STEP_WINDOW_MS = 250;
        const startDelay     = 100;
        const xDelay         = 100;
        const arrowLifeMs    = 600;  // attack arrow lingers after the kill
        const stepIndex      = Number.isFinite(state && state.step_index) ? state.step_index : 0;
        // W3-rich scenarios get their kill arrows from renderEngagementArcs
        // (authoritative cause_actor → target_uid). Suppress the inferred
        // nearest-red arrow here to avoid drawing both — the explosion + X
        // reveal below still fire so the kill is still visible.
        const skipInferredArrows = scenarioRef && scenarioRef.schema_variant === 'w3-rich';
        const n = ordered.length;
        ordered.forEach((d, idx) => {
            const t = startDelay + (n > 1 ? (idx / (n - 1)) * STEP_WINDOW_MS : 0);
            // 1. Spawn the NATO 'attack' tactical graphic from nearest red
            //    to the dying blue, just slightly BEFORE the explosion so
            //    it reads as "shot fired → impact → wreckage".
            if (skipInferredArrows) { /* W3: explicit arcs already drawn */ } else
            pendingDeathTimers.push(setTimeout(() => {
                const blueLL = d.ll;
                const redMarker = findNearestRedMarker(blueLL, stepIndex);
                if (!redMarker) return;
                let redLL = null; try { redLL = redMarker.getLatLng(); } catch (_) {}
                if (!redLL) return;
                const arrow = createTacticalArrow(blueLL, redLL, '#c41e1e', 'attack', idx < 3 ? 4 : 2, { pane: SCENARIO_GRAPHICS_PANE });
                if (!arrow) return;
                arrow.addTo(layerGroup);
                if (idx >= 3) arrow.setOpacity(0.38);
                attackArrows.push(arrow);
                // Auto-remove after the lifespan; if the next applyState
                // runs first, the start-of-call attackArrows wipe will
                // remove it earlier.
                pendingDeathTimers.push(setTimeout(() => {
                    try { layerGroup.removeLayer(arrow); } catch (_) {}
                    const i = attackArrows.indexOf(arrow);
                    if (i >= 0) attackArrows.splice(i, 1);
                }, arrowLifeMs));
            }, t));
            // 2. Explosion at the blue's position.
            pendingDeathTimers.push(setTimeout(() => {
                spawnExplosion(d.ll, 300);
            }, t + 50));
            // 3. X reveal — destroyed status + renderer refresh.
            pendingDeathTimers.push(setTimeout(() => {
                const reg = unitRegistry[d.uid];
                if (reg) {
                    reg.status   = UNIT_STATUS.DESTROYED;
                    reg.strength = 0;
                    reg.canFight = false;
                    reg.canMove  = false;
                }
                refreshAllMarkerStatuses();
            }, t + xDelay + 50));
        });
    }

    // ── X-overlay on destroyed units ──────────────────────────────────
    // Mirrors wargame.py draw_unit_box(): two diagonal lines from corner
    // to corner, extending 5 % past the unit box, drawn in bright red
    // (215,28,28) at full opacity. We use an SVG overlay rather than a
    // Unicode '✕' so the strokes scale with the marker, stay sharp at
    // any zoom, and read unambiguously as a destruction mark.
    function markUnitAsDestroyed(marker) {
        if (!marker) return;
        try {
            const el = marker.getElement();
            if (!el || el.querySelector('.wg-adj-x')) return; // already marked
            const x = document.createElement('div');
            x.className = 'wg-adj-x';
            x.style.cssText = `
                position:absolute;
                top:-10%;left:-10%;
                width:120%;height:120%;
                pointer-events:none;
                z-index:10;
            `;
            // Two diagonal strokes, full-opacity red, with a slightly thicker
            // white halo underneath so the X stays visible against any
            // background (matches the Python halo via overdraw).
            x.innerHTML = `
                <svg width="100%" height="100%" viewBox="0 0 100 100"
                     preserveAspectRatio="none"
                     style="position:absolute;top:0;left:0;display:block;overflow:visible;">
                    <line x1="0"   y1="0"   x2="100" y2="100"
                          stroke="#ffffff" stroke-width="12" stroke-linecap="round" opacity="0.85"/>
                    <line x1="100" y1="0"   x2="0"   y2="100"
                          stroke="#ffffff" stroke-width="12" stroke-linecap="round" opacity="0.85"/>
                    <line x1="0"   y1="0"   x2="100" y2="100"
                          stroke="#1a1a1a" stroke-width="8"  stroke-linecap="round"/>
                    <line x1="100" y1="0"   x2="0"   y2="100"
                          stroke="#1a1a1a" stroke-width="8"  stroke-linecap="round"/>
                </svg>
            `;
            el.appendChild(x);
        } catch (_) { /* ignore */ }
    }

    function unmarkUnitAsDestroyed(marker) {
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
        objSecurityRing = null;
        pipelineLine = null;
        pipelineAdvanced = null;
        advanceTip = null;
        pipelineLatLngs = null;
        pipelineSegmentKm = null;
        breachBadges = {};
        redMarkers = {};
        blueMarkers = {};
        ewHalo = null;
        contactHalo = null;
        aoLayers = [];
        advanceArrows = [];
        attackArrows = [];
        // W3-rich engagement arcs: wipe list and timers.
        for (const t of engagementArcTimers) { try { clearTimeout(t); } catch (_) {} }
        engagementArcTimers = [];
        engagementArcs = [];
        offMapMarkerLayers = [];
        aorPhaseLine = null;
        aorPhaseLineLabel = null;
        salientLayer = null;
        scenarioRef = null;
        blsCoordByName = {};
        objCoord = null;
        unitRegistry = {};
        runningDestroyedUids = new Set();
        lastAppliedStepIndex = -1;
        playbackAttritionStep = -1; // AN1: clear per-step attrition tracking
        for (const t of pendingDeathTimers) { try { clearTimeout(t); } catch (_) {} }
        pendingDeathTimers = [];
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
                // The .wg-destroyed CSS rule grayscales non-X children only,
                // so we don't fade the element itself — that would dim the
                // red X overlay too. Mirrors wargame.py: gray icon + bright
                // red diagonals on top.
                el.style.opacity = '';
                el.style.filter  = '';
                el.classList.add('wg-destroyed');
            }
            markUnitAsDestroyed(marker);
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
                el.classList.remove('wg-damaged');
            }
            unmarkUnitAsDestroyed(marker);
            unmarkUnitAsDamaged(marker);
        } catch (_) { /* ignore */ }
    }

    // ── Apply a per-step state to the map ────────────────────────────
    function applyState(state, scenario, opts) {
        if (!hasMap() || !state) return { found: 0, missed: [] };
        ensureScenarioGraphicsPane();
        opts = opts || {};

        // Forward step vs rewind/jump. Forward (newIdx > last) plays the
        // full advance-arrow draw-on + staggered explosion + delayed X
        // choreography. Backward or equal step index snaps to the new
        // cumulative state silently — no replay of past kills.
        const stepIdx = Number.isFinite(state.step_index) ? state.step_index : 0;
        const isForward = stepIdx > lastAppliedStepIndex;
        const instant = !isForward;
        lastAppliedStepIndex = stepIdx;
        lastAppliedState     = state;
        lastAppliedScenario  = scenario || scenarioRef || null;

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
        //
        // When `opts.skipUnitPositioning` is true the caller is using the
        // COA-driven dynamic execution loop: the per-unit AI has already
        // moved the markers to its chosen destinations, and re-running the
        // deterministic lerp here would snap them back to the scripted
        // positions (causing the "move forward then jump back" jitter the
        // operator reported when both systems were fighting). Skipping this
        // call hands position authority to the AI for this step.
        if (!opts.skipUnitPositioning) {
            updateUnitPositions(state);
        }

        // -0.5: Optional proximity overrun. Disabled by default: scenario /
        // adjudicator state is the source of truth for destroyed Blue units,
        // so the client must not invent extra kills unless an operator
        // explicitly opts into that behavior via window.WARGAME_OVERRUN_KM.
        //
        // Tunable: window.WARGAME_OVERRUN_KM (>0 enables it; default 0 keeps
        // the scenario authoritative). The mutated state flows through the
        // section-4 pipeline so SITREP counts, the staggered explosion
        // choreography, and the cumulative destroyed set all stay consistent.
        //
        // PR-100 safety guard: Blue markers now carry a small display-only
        // stagger (blue-display-stagger mode). This function MUST use the
        // authoritative raw scenario coordinates — NOT blueMarker.getLatLng()
        // — so that a display offset never inflates or deflates kill counts.
        // Red markers are unaffected by PR-100; their getLatLng() positions
        // already encode the tactical spread (applyW3Spread / red-spread).
        //
        // INVARIANT: When WARGAME_OVERRUN_KM=0 (the default) the early
        // return at line "if (OVERRUN_KM <= 0) return" fires before any
        // coordinate read, so no behavior difference exists at runtime.
        (function applyProximityOverrun() {
            if (!state || !state.per_unit_deltas) return;
            const OVERRUN_KM = Number.isFinite(window.WARGAME_OVERRUN_KM)
                ? Number(window.WARGAME_OVERRUN_KM) : 0;
            if (OVERRUN_KM <= 0) return;  // ← disabled by default; guard above holds

            const known = new Set(runningDestroyedUids);
            for (const u of (state.per_unit_deltas.blue_destroyed || [])) known.add(u);
            for (const u of (state.blue_destroyed_cumulative || [])) known.add(u);

            const newOverruns = [];
            for (const [redUid, redMarker] of Object.entries(redMarkers)) {
                const meta = redMarker && redMarker._wgRedMeta;
                if (!meta) continue;
                if (stepIdx < (meta.appear || 0)) continue;
                const redReg = unitRegistry[redUid];
                if (redReg && redReg.status === UNIT_STATUS.DESTROYED) continue;
                let redLL; try { redLL = redMarker.getLatLng(); } catch (_) { continue; }
                if (!redLL) continue;
                for (const [blueUid, blueMarker] of Object.entries(blueMarkers)) {
                    if (!blueMarker || known.has(blueUid)) continue;
                    // PR-100: use raw authoritative Blue coordinates, not the
                    // display-staggered marker position. The blue-display-stagger
                    // offset (0.5–3.5 km) is visual-only and must not bias the
                    // tactical proximity calculation when OVERRUN_KM is active.
                    let blueLL = null;
                    const blueMeta = blueMarker._wgBlueMeta;
                    if (blueMeta) {
                        // W3-rich: per-step raw coord is the authoritative position.
                        const w3Arr = scenarioRef && scenarioRef.blue_unit_step_coords &&
                                      scenarioRef.blue_unit_step_coords[blueUid];
                        if (Array.isArray(w3Arr) && w3Arr.length) {
                            const c = w3Arr[Math.min(stepIdx, w3Arr.length - 1)];
                            if (c) blueLL = { lat: c[1], lng: c[0] };
                        }
                        // W1/W2 fallback: use the scenario baseCoord (no stagger in base).
                        if (!blueLL && blueMeta.baseCoord) {
                            blueLL = { lat: blueMeta.baseCoord[1], lng: blueMeta.baseCoord[0] };
                        }
                    }
                    // Ultimate fallback: read display position (legacy — only reached
                    // if neither W3 coords nor baseCoord are available, which should
                    // never occur for a properly initialised scenario).
                    if (!blueLL) { try { blueLL = blueMarker.getLatLng(); } catch (_) { continue; } }
                    if (!blueLL) continue;
                    const km = haversineKm([redLL.lat, redLL.lng], [blueLL.lat, blueLL.lng]);
                    if (km < OVERRUN_KM) {
                        known.add(blueUid);
                        newOverruns.push(blueUid);
                    }
                }
            }
            if (!newOverruns.length) return;

            const arr = Array.isArray(state.per_unit_deltas.blue_destroyed)
                ? state.per_unit_deltas.blue_destroyed.slice() : [];
            for (const uid of newOverruns) if (!arr.includes(uid)) arr.push(uid);
            state.per_unit_deltas.blue_destroyed = arr;

            if (Array.isArray(state.blue_destroyed_cumulative)) {
                for (const uid of newOverruns) {
                    if (!state.blue_destroyed_cumulative.includes(uid)) {
                        state.blue_destroyed_cumulative.push(uid);
                    }
                }
            }
            if (state.losses_step && Number.isFinite(state.losses_step.blue)) {
                state.losses_step.blue = (state.losses_step.blue || 0) + newOverruns.length;
            }
            if (state.losses_cumulative && Number.isFinite(state.losses_cumulative.blue_destroyed)) {
                state.losses_cumulative.blue_destroyed =
                    (state.losses_cumulative.blue_destroyed || 0) + newOverruns.length;
            }
        })();

        // 0. SITREP banner + EW halo + contact halo + advance arrows + AOR PL
        // + per-step engagement arrows (kill + counterattack pulse).
        updateSitrep(state);
        updateEwHalo(state);
        updateContactHalo(state);
        updateAdvanceArrows(state, scenario || scenarioRef, { instant });
        updateAttackArrows(state, scenario || scenarioRef);
        // W3-rich: explicit engagement arcs replace the nearest-red heuristics.
        // updateAttackArrows() bails out early for W3, this fills the same slot
        // with authoritative arcs keyed off cause_actor → target_uid.
        renderEngagementArcs(state, scenario || scenarioRef);
        // Note: we DO NOT draw separate "axis of advance" trails. The
        // schema (Wargame3/schema/README.md) only specifies engagement_arc
        // visuals. Unit movement is shown by the marker itself sliding
        // smoothly between phases via the CSS transform transition; an
        // extra arrow per moving unit would add 30+ extra layers and
        // clutter the operator's read of the engagements.
        updateAorPhaseLine(state, scenario || scenarioRef);

        // 1. Update BLS semicircle colors + drop a NATO breach badge the
        // FIRST step a BLS goes from STAGED to anything contested/secure.
        // The badge represents the red force breaching the coastal defense
        // at that landing site; it's stamped once and persists.
        if (state.bls_status) {
            for (const [name, status] of Object.entries(state.bls_status)) {
                const m = blsMarkers[name];
                if (!m) continue;
                const blsMeta = m._wgBls || {};
                m.setIcon(blsIcon(COLORS.BLS[status] || '#888', name.replace('BLS-', ''), blsMeta.role));
                m.setTooltipContent(buildBlsTooltip({ name, ...blsMeta }, status));
                // Breach badge: when this BLS first leaves STAGED, stamp a
                // small NATO-style breach marker just offshore of it.
                if (status !== 'STAGED' && !breachBadges[name] && !instant) {
                    const blsLL = m.getLatLng();
                    if (blsLL) breachBadges[name] = spawnBreachBadge(blsLL, name);
                }
            }
        }

        // 2. Update OBJ color by DERIVED status — same evidence check
        // the salient/arrows use, so the whole map flips together if the
        // LLM's CAPTURED is contradicted by FR + losses.
        if (objMarker && state.objective_status) {
            const displayStatus = deriveDisplayOutcome(state);
            const c = COLORS.OBJ[displayStatus] || '#888';
            const objLive = (scenario && scenario.obj) || (scenarioRef && scenarioRef.obj) || null;
            const objName = (objLive && objLive.name) || 'OBJ NASSER';
            objMarker.setIcon(targetIcon(c, objName));
            const overrideTag = (displayStatus !== state.objective_status)
                ? `<br><span style="color:#f3a">LLM said ${esc(state.objective_status)}; evidence overrules</span>`
                : '';
            objMarker.setTooltipContent(buildObjTooltip(objLive, displayStatus) + overrideTag);
            // Re-color the security ring with the same outcome accent so it
            // tracks objective state (green when DENIED → red when CAPTURED).
            if (objSecurityRing) {
                try {
                    objSecurityRing.setStyle({ color: c, fillColor: c });
                } catch (_) { /* ignore */ }
            }
        }

        // 3. Fold Red degraded entries into the lifecycle registry. Status
        // mapping: STAGED/ACTIVE → active, DEGRADED/DISPLACED → degraded,
        // strength<=0 → destroyed. The wargame schema emits red_degraded
        // as a CUMULATIVE list each step, so we reset red statuses first
        // and rebuild — that way a rewind from step 11 to step 3 doesn't
        // leave stale degraded markers from later steps. Final visual is
        // applied by the renderer pass below (refreshAllMarkerStatuses) so
        // the rules — including destroyed > side — are enforced uniformly.
        if (state.per_unit_deltas && Array.isArray(state.per_unit_deltas.red_degraded)) {
            for (const reg of Object.values(unitRegistry)) {
                if (reg.side !== 'hostile') continue;
                reg.status   = UNIT_STATUS.ACTIVE;
                reg.strength = 1.0;
                reg.canMove  = true;
                reg.canFight = true;
            }
            for (const entry of state.per_unit_deltas.red_degraded) {
                const reg = unitRegistry[entry.unit_uid];
                if (!reg) continue;
                const strength = Number.isFinite(entry.strength_current) ? entry.strength_current : reg.strength;
                let status = reg.status;
                const raw = String(entry.status || '').toUpperCase();
                if (raw === 'DESTROYED' || strength <= 0)                       status = UNIT_STATUS.DESTROYED;
                else if (raw === 'DEGRADED' || raw === 'DISPLACED')             status = UNIT_STATUS.DEGRADED;
                else if (raw === 'ACTIVE'   || raw === 'STAGED')                status = UNIT_STATUS.ACTIVE;
                reg.status   = status;
                reg.strength = strength;
                reg.canFight = status !== UNIT_STATUS.DESTROYED;
                reg.canMove  = status !== UNIT_STATUS.DESTROYED;
                const m = redMarkers[entry.unit_uid];
                if (m) {
                    const _dn = (m._wgRedMeta && m._wgRedMeta.label) || displayRedId(entry.unit_uid);
                    try { m.setTooltipContent(`${_dn} — ${entry.status} (${Math.round((strength || 0) * 100)}%)`); } catch (_) {}
                }
            }
        }

        // 4. Fold Blue destroyed uids into the running cumulative set.
        // Every uid that EVER appears in a per-step delta gets remembered
        // — this is the c133-safety-net: if a state arrives without
        // blue_destroyed_cumulative (older trial JSONL, malformed LLM
        // response) we still know what's dead.
        const found = [];
        const missed = [];
        if (state.per_unit_deltas && Array.isArray(state.per_unit_deltas.blue_destroyed)) {
            for (const uid of state.per_unit_deltas.blue_destroyed) {
                runningDestroyedUids.add(uid);
                const baseId = uid.replace(/^BLUE_/, '');
                const scenarioMarker = blueMarkers[uid];
                if (scenarioMarker) found.push(baseId);
                // Operator-placed marker on the planning map — fade it via the
                // legacy path; it's not part of the registry (no parent chain
                // to walk) so the unified renderer pass below won't see it.
                const userMarker = findBlueMarkerByBaseId(baseId);
                if (userMarker && userMarker !== scenarioMarker) fadeMarker(userMarker);
                if (!scenarioMarker && !userMarker) missed.push(baseId);
            }
        }

        // 4a. When the server emits state.blue_destroyed_cumulative we use it
        // as the step snapshot, but only REPLACE the running set on rewind /
        // scrub. On forward steps the client may have already added local
        // overrun kills in section 0.5, and those are monotonic: a Blue that
        // died earlier this run must not briefly revive just because the next
        // server state didn't include that local kill yet. Forward motion
        // therefore merges, rewind / jump-back still replaces exactly.
        if (Array.isArray(state.blue_destroyed_cumulative)) {
            runningDestroyedUids = isForward
                ? new Set([...runningDestroyedUids, ...state.blue_destroyed_cumulative])
                : new Set(state.blue_destroyed_cumulative);
        }

        // Apply the running cumulative set to the registry. Every blue unit
        // is reset to active first; then any uid in the set is marked
        // destroyed. The downstream cascade (getEffectiveUnitStatus) walks
        // parent/root so destroying lc cascades to every descendant.
        for (const reg of Object.values(unitRegistry)) {
            if (reg.side !== 'friendly') continue;
            if (runningDestroyedUids.has(reg.id)) {
                reg.status   = UNIT_STATUS.DESTROYED;
                reg.strength = 0;
                reg.canFight = false;
                reg.canMove  = false;
            } else {
                // Restore to active. Forward cascade below will still mark
                // this unit destroyed via getEffectiveUnitStatus if its
                // parent/root is in the set.
                reg.status   = UNIT_STATUS.ACTIVE;
                reg.strength = 1.0;
                reg.canFight = true;
                reg.canMove  = true;
            }
        }
        dbg('cumulative destroyed', { count: runningDestroyedUids.size, fromCumulative: Array.isArray(state.blue_destroyed_cumulative) });

        // Sweep operator-placed markers for the full cumulative set — the
        // registry pass above handled scenario markers; this catches the
        // operator's own drag-placed pieces.
        for (const uid of runningDestroyedUids) {
            const baseId = uid.replace(/^BLUE_/, '');
            const scenarioMarker = blueMarkers[uid];
            const userMarker = findBlueMarkerByBaseId(baseId);
            if (userMarker && userMarker !== scenarioMarker) {
                fadeMarker(userMarker);
            }
        }

        // 4b. HQ damage from surroundings — a battalion/brigade/division
        // whose subordinates or physical neighbours have been attrited reads
        // as DAMAGED (degraded) even when not explicitly killed. Without
        // this, the operator sees an unscathed blue HQ standing in a sea
        // of gray-X companies, which doesn't reflect the report.
        propagateHqDamage();

        // 4c. Choreographed kill reveal on FORWARD steps. The cumulative
        // sync in 4a/4b has already marked every blue in this step's
        // per_unit_deltas.blue_destroyed as destroyed in the registry. For
        // a forward advance we want each new kill to appear AS the red unit
        // sweeps past it — so we un-mark the new kills here, run the
        // renderer (drawing them as still alive), then let
        // scheduleStaggeredDeaths re-mark them one-by-one over ~900ms with
        // an explosion burst before each X reveal. On rewind / jumps we
        // skip the un-mark and just snap to the final state.
        const newDeadThisStep = (state.per_unit_deltas && Array.isArray(state.per_unit_deltas.blue_destroyed))
            ? state.per_unit_deltas.blue_destroyed
            : [];
        if (!instant && newDeadThisStep.length) {
            for (const uid of newDeadThisStep) {
                const reg = unitRegistry[uid];
                if (reg) {
                    reg.status   = UNIT_STATUS.ACTIVE;
                    reg.strength = 1.0;
                    reg.canFight = true;
                    reg.canMove  = true;
                }
            }
        }

        // 4d. Single rendering pass — walk every registered marker and apply
        // the visual treatment for its EFFECTIVE status. The forward cascade
        // (parent → children, e.g. Wargame1 step 11 destroys lc → all
        // descendants read as destroyed) is implicit in getEffectiveUnitStatus,
        // so one walk after the deltas + the HQ damage pass have settled
        // the registry is enough. HQ-damage tops out at DEGRADED — children
        // → parent never auto-promotes to destroyed.
        refreshAllMarkerStatuses();

        // 4d-W3. Apply per-step damage tinting from state.affected[]. This
        // is the W3 layer that shows "this unit was hit THIS phase" without
        // pretending the unit is destroyed. Sits after refreshAllMarkerStatuses
        // so it doesn't get clobbered by the registry pass. No-op on legacy
        // W1/W2 scenarios.
        applyW3PerStepDamage(state);

        // 4e-W3. Refresh every unit's tooltip with the phase's narrative —
        // action_what / cause_what / strength% / magazine counters. This
        // is purely a UX layer; data is already on state.actors /
        // state.affected / state.unit_state via the adjudicator.
        applyW3UnitNarrative(state);

        // 4e. Schedule the staggered explosion + delayed X re-mark for the
        // new kills (no-op on rewind / when there are no new kills).
        scheduleStaggeredDeaths(state, { instant });

        // 5. Pipeline fill: draw the section Red has already advanced over
        // as a solid colored line. Color uses the DERIVED outcome — when
        // the LLM's CAPTURED is contradicted, this turns blue (DENIED)
        // along with the rest of the map.
        const displayStatus5 = deriveDisplayOutcome(state);
        if (layerGroup && pipelineLatLngs && state.phase_line_km != null) {
            const advancedLatLngs = pipelineUpTo(state.phase_line_km);
            if (pipelineAdvanced) layerGroup.removeLayer(pipelineAdvanced);
            if (advancedLatLngs.length >= 2) {
                // Thin, semi-transparent trail along the pipeline route. The
                // pipeline bends a few times, so a bold line here reads as
                // "multiple red arrows" next to the bold advance arrow. We
                // keep it as a subtle reference trail instead — the bold
                // single arrow above is the unambiguous "main effort" cue.
                pipelineAdvanced = window.L.polyline(advancedLatLngs, {
                    color: COLORS.OBJ[displayStatus5] || '#d23a3a',
                    weight: 2,
                    opacity: 0.5,
                    dashArray: '5 4',
                    interactive: false,
                    pane: SCENARIO_GRAPHICS_PANE,
                }).bindTooltip(`Red advance along pipeline: ${state.phase_line_km} km — ${displayStatus5}`);
                pipelineAdvanced.addTo(layerGroup);
            } else {
                pipelineAdvanced = null;
            }

            if (advanceTip) layerGroup.removeLayer(advanceTip);
            const tip = pointAlongPipeline(state.phase_line_km);
            if (tip && state.phase_line_km > 0) {
                advanceTip = window.L.marker(tip, {
                    pane: SCENARIO_GRAPHICS_PANE,
                    icon: window.L.divIcon({
                        html: `<div style="
                            width:14px;height:14px;border-radius:50%;
                            background:${COLORS.OBJ[displayStatus5] || '#d23a3a'};
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
        // Reset every registered unit back to active so the lifecycle state
        // matches the visual restore below. Without this, getEffectiveUnitStatus
        // would still report destroyed for cascade descendants on the next
        // applyState() and instantly re-fade them. Also wipe the running
        // cumulative destroyed-uid set so a scrubber rewind starts clean.
        for (const reg of Object.values(unitRegistry)) {
            reg.status   = UNIT_STATUS.ACTIVE;
            reg.strength = 1.0;
            reg.canFight = true;
            reg.canMove  = true;
        }
        runningDestroyedUids = new Set();
        lastAppliedStepIndex = -1;
        playbackAttritionStep = -1; // AN1: clear per-step attrition tracking
        // Remove all breach badges — they're re-stamped from per-step deltas
        // on the next forward applyState.
        for (const b of Object.values(breachBadges)) {
            if (b && layerGroup) { try { layerGroup.removeLayer(b); } catch (_) {} }
        }
        breachBadges = {};
        for (const t of pendingDeathTimers) { try { clearTimeout(t); } catch (_) {} }
        pendingDeathTimers = [];
        // Restore any markers we faded
        destroyedMarkers.forEach((m) => restoreMarker(m));
        destroyedMarkers.clear();
        // Reset BLS dot colors and OBJ to initial. Re-render with the
        // stashed role + assessment so the role tag and rich tooltip
        // survive a resetMap.
        for (const [name, m] of Object.entries(blsMarkers)) {
            const blsMeta = m._wgBls || {};
            m.setIcon(blsIcon(COLORS.BLS.STAGED, name.replace('BLS-', ''), blsMeta.role));
            m.setTooltipContent(buildBlsTooltip({ name, ...blsMeta }, 'STAGED'));
        }
        if (objMarker) {
            const obj = (scenarioRef && scenarioRef.obj) || null;
            objMarker.setIcon(targetIcon(COLORS.OBJ.DORMANT, (obj && obj.name) || 'OBJ NASSER-95'));
            objMarker.setTooltipContent(buildObjTooltip(obj, 'DORMANT'));
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
            try {
                const el = m.getElement();
                if (el) {
                    el.style.opacity = '';
                    el.style.filter  = '';
                    el.classList.remove('wg-destroyed');
                    el.classList.remove('wg-damaged');
                }
                unmarkUnitAsDestroyed(m);
                unmarkUnitAsDamaged(m);
            } catch (_) {}
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
        for (const a of attackArrows) {
            if (a && layerGroup) layerGroup.removeLayer(a);
        }
        attackArrows = [];
        // Wipe W3-rich engagement arcs + cancel pending fade timers.
        clearEngagementArcs();
        if (aorPhaseLine && layerGroup) {
            layerGroup.removeLayer(aorPhaseLine);
            aorPhaseLine = null;
        }
        if (aorPhaseLineLabel && layerGroup) {
            layerGroup.removeLayer(aorPhaseLineLabel);
            aorPhaseLineLabel = null;
        }
        // Reset the SITREP banner contents
        if (sitrepControl) {
            const div = sitrepControl.getContainer();
            if (div) div.innerHTML = `<div style="color:#888;font-style:italic;">SITREP — awaiting first step…</div>`;
        }
    }

    // ── Scenario-mode helpers for external callers ───────────────────
    // turn-engine.js consumes these when a scenario is drawn but no
    // maneuver-arrow formation is present — pressing "Next Turn" in the
    // planner HUD then steps the scenario forward using the same role /
    // appear / spread model as the adjudicator HUD (todo item #20).
    function isScenarioDrawn() {
        return scenarioRef != null && layerGroup != null;
    }

    function getScenarioMarkers() {
        return {
            red:  Object.values(redMarkers),
            blue: Object.values(blueMarkers),
        };
    }

    // Slide every Red/Blue marker to the position it should occupy at
    // (stepIndex, progress) — same model applyState() uses, but driven by a
    // synthetic state so the planner HUD doesn't need a server response.
    function applyStepProgress(stepIndex, progress) {
        if (!isScenarioDrawn()) return false;
        const syntheticState = {
            step_index:    stepIndex,
            progress:      Math.max(0, Math.min(1, progress || 0)),
            phase_line_km: (objDepthKm || 95) * Math.max(0, Math.min(1, progress || 0)),
            blue_actions:  null,   // fall back to the local schedule
        };
        updateUnitPositions(syntheticState);
        // AN1: refresh per-unit attrition visuals, but only when the step
        // index actually changes (this is called repeatedly with fractional
        // progress within a single step). updateUnitPositions moves markers
        // via setLatLng only — it does not setIcon — so the attrition icon
        // treatment applied here survives subsequent intra-step progress calls.
        if (stepIndex !== playbackAttritionStep) {
            try { applyStepAttrition(stepIndex); } catch (_) { /* ignore */ }
        }
        return true;
    }

    // ── computeUnitLayoutDiagnostics ─────────────────────────────────
    // READ-ONLY diagnostic helper.  Reads current marker pixel positions
    // via map.latLngToLayerPoint(), measures pairwise distances, and
    // returns a plain serialisable clutter summary for the current step.
    //
    // Guarantees:
    //   • Never calls marker.setLatLng() or any mutating method.
    //   • Never writes to redMarkers, blueMarkers, unitRegistry, or map.
    //   • Never calls applyState() or updateUnitPositions().
    //   • Return value is JSON-serialisable (no Leaflet objects).
    //   • Safe to call at any time; returns { error } when map is unready.
    //
    // @param {{ minPixelGap?: number }} [opts]
    //   minPixelGap — overlap threshold in CSS pixels (default: 36).
    //                 36 px ≈ one medium NATO icon width at zoom 7.
    //
    // @returns {{
    //   totalUnits:    number,
    //   checkedPairs:  number,
    //   threshold:     number,
    //   overlapPairs:  number,
    //   closestPair:   { uidA: string, uidB: string, distPx: number } | null,
    //   clusters:      number,
    //   maxClusterSize: number,
    //   warnings:      string[],
    //   breakdown: {
    //     bySidePair:   { 'RED-RED': n, 'BLUE-BLUE': n, 'RED-BLUE': n },
    //     byStatusPair: { [key: string]: n },
    //     bySide: {
    //       RED:  { units: n, overlapPairs: n, maxClusterSize: n },
    //       BLUE: { units: n, overlapPairs: n, maxClusterSize: n },
    //     },
    //     topClusters: [{ size, sideMix, statusMix, sampleUids }]  // max 3
    //   }
    // }}
    function computeUnitLayoutDiagnostics(opts) {
        const m = window.map;
        if (!m || typeof m.latLngToLayerPoint !== 'function') {
            return { error: 'map not ready', totalUnits: 0, checkedPairs: 0,
                     threshold: 36, overlapPairs: 0, closestPair: null,
                     clusters: 0, maxClusterSize: 0, warnings: ['map not ready'],
                     breakdown: null };
        }

        const threshold = (opts && Number.isFinite(opts.minPixelGap))
            ? opts.minPixelGap : 36;

        // ── 1. Collect placed markers — read side + status, NO mutation ─
        const entries = [];
        const sides = [
            { dict: redMarkers,  side: 'red'  },
            { dict: blueMarkers, side: 'blue' },
        ];
        for (const { dict, side } of sides) {
            for (const uid of Object.keys(dict)) {
                const marker = dict[uid];
                if (!marker || typeof marker.getLatLng !== 'function') continue;
                try {
                    const ll     = marker.getLatLng();
                    const pt     = m.latLngToLayerPoint(ll);
                    // Read status from unitRegistry (read-only).
                    const reg    = unitRegistry[uid];
                    const status = reg ? (reg.status || UNIT_STATUS.ACTIVE)
                                       : UNIT_STATUS.ACTIVE;
                    entries.push({ uid, side, status, x: pt.x, y: pt.y });
                } catch (_) {
                    // marker not yet added to map — skip silently
                }
            }
        }

        const n            = entries.length;
        const checkedPairs = Math.floor(n * (n - 1) / 2);

        // ── 2. Union-find for cluster detection ────────────────────────
        const parent = Array.from({ length: n }, (_, i) => i);
        function find(i) {
            while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
            return i;
        }
        function unite(i, j) {
            const ri = find(i), rj = find(j);
            if (ri !== rj) parent[ri] = rj;
        }

        // ── 3. Pairwise distance scan (O n²) — tally breakdowns ───────
        // All tally variables are local; no external state is written.
        let overlapPairs = 0;
        let closestDist  = Infinity;
        let closestPair  = null;

        const bySidePair   = { 'RED-RED': 0, 'BLUE-BLUE': 0, 'RED-BLUE': 0 };
        const byStatusPair = {};

        // Pure helpers — no closures over mutable external state.
        function sidePairKey(a, b) {
            const u = a.toUpperCase(), v = b.toUpperCase();
            if (u === v) return u + '-' + u;
            return 'RED-BLUE'; // only possible mixed case
        }
        function statusPairKey(a, b) {
            const ORDER = { active: 0, degraded: 1, destroyed: 2 };
            const oa = ORDER[a] !== undefined ? ORDER[a] : 3;
            const ob = ORDER[b] !== undefined ? ORDER[b] : 3;
            const [lo, hi] = oa <= ob ? [a, b] : [b, a];
            return lo.toUpperCase() + '-' + hi.toUpperCase();
        }

        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const dx   = entries[i].x - entries[j].x;
                const dy   = entries[i].y - entries[j].y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < threshold) {
                    overlapPairs++;
                    unite(i, j);
                    bySidePair[sidePairKey(entries[i].side, entries[j].side)]++;
                    const stk = statusPairKey(entries[i].status, entries[j].status);
                    byStatusPair[stk] = (byStatusPair[stk] || 0) + 1;
                }
                if (dist < closestDist) {
                    closestDist = dist;
                    closestPair = {
                        uidA:   entries[i].uid,
                        uidB:   entries[j].uid,
                        distPx: +dist.toFixed(1),
                    };
                }
            }
        }

        // ── 4. Build cluster membership map ───────────────────────────
        const clusterMemberMap = {};
        for (let i = 0; i < n; i++) {
            const r = find(i);
            if (!clusterMemberMap[r]) clusterMemberMap[r] = [];
            clusterMemberMap[r].push(i);
        }
        const allClusters   = Object.values(clusterMemberMap);
        const sizes         = allClusters.map(a => a.length);
        const clusters      = sizes.filter(s => s > 1).length;
        const maxClusterSize = sizes.length ? Math.max(...sizes) : 0;

        // ── 5. topClusters — max 3, sampleUids max 5 ──────────────────
        const topClusters = allClusters
            .filter(idxArr => idxArr.length > 1)
            .sort((a, b) => b.length - a.length)
            .slice(0, 3)
            .map(idxArr => {
                const sideMix   = { RED: 0, BLUE: 0 };
                const statusMix = {};
                const sampleUids = [];
                for (const idx of idxArr) {
                    const e = entries[idx];
                    sideMix[e.side.toUpperCase()]++;
                    statusMix[e.status] = (statusMix[e.status] || 0) + 1;
                    if (sampleUids.length < 5) sampleUids.push(e.uid);
                }
                return { size: idxArr.length, sideMix, statusMix, sampleUids };
            });

        // ── 6. bySide stats ────────────────────────────────────────────
        let redUnits = 0, blueUnits = 0;
        for (const e of entries) {
            if (e.side === 'red') redUnits++; else blueUnits++;
        }
        let redMaxCluster = 0, blueMaxCluster = 0;
        for (const idxArr of allClusters) {
            let rc = 0, bc = 0;
            for (const idx of idxArr) {
                if (entries[idx].side === 'red') rc++; else bc++;
            }
            if (rc > redMaxCluster)  redMaxCluster  = rc;
            if (bc > blueMaxCluster) blueMaxCluster = bc;
        }

        const breakdown = {
            bySidePair,
            byStatusPair,
            bySide: {
                RED:  { units: redUnits,  overlapPairs: bySidePair['RED-RED'],
                        maxClusterSize: redMaxCluster  },
                BLUE: { units: blueUnits, overlapPairs: bySidePair['BLUE-BLUE'],
                        maxClusterSize: blueMaxCluster },
            },
            topClusters,
        };

        // ── 7. Human-readable warnings ─────────────────────────────────
        const warnings = [];
        if (overlapPairs > 0) {
            warnings.push(overlapPairs + ' pair(s) within ' + threshold + 'px');
        }
        if (maxClusterSize >= 5) {
            warnings.push('dense cluster: ' + maxClusterSize + ' units in one group');
        }
        if (overlapPairs === 0) {
            warnings.push('no overlaps detected at threshold=' + threshold + 'px');
        }

        return {
            totalUnits:     n,
            checkedPairs,
            threshold,
            overlapPairs,
            closestPair,
            clusters,
            maxClusterSize,
            warnings,
            breakdown,
        };
    }

    window.AppAdjudicatorMap = {
        drawScenario,
        clearScenario,
        applyState,
        resetMap,
        // Scenario-mode integration with the planner-mode War Game HUD
        isScenarioDrawn,
        getScenarioMarkers,
        applyStepProgress,
        applyStepAttrition,
        fitScenarioAO,
        // Position primitives (so external callers can build their own
        // step-resolved state without re-implementing the movement model)
        computeRedPosition:  (meta, stepIndex, progress) => redPositionLonLat(meta, stepIndex, progress),
        computeBluePosition: (meta, stepIndex, state)    => bluePositionLonLat(meta, stepIndex, state),
        // Unit lifecycle (active/degraded/destroyed) — callers that want to
        // gate movement, combat selection, or strength counting should read
        // through getEffectiveUnitStatus / canUnitAct so a destroyed parent
        // cascades to its subordinates without per-call boilerplate.
        UNIT_STATUS,
        getEffectiveUnitStatus,
        canUnitAct,
        getUnit: (uid) => unitRegistry[uid] || null,
        listUnits: () => Object.values(unitRegistry).slice(),
        // Diagnostics — read-only; never mutates markers, map, or scenario
        getUnitLayoutDiagnostics: (opts) => computeUnitLayoutDiagnostics(opts || {}),
        _findBlueMarkerByBaseId: findBlueMarkerByBaseId,
        _setDebug: (on) => { debugEnabled = !!on; },
    };
})();
