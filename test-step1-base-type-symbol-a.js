#!/usr/bin/env node
/*
 * STEP1-BASE-TYPE-SYMBOL-RESTORE-A
 *
 * 1 (server) coalition builder stamps base_type (air/naval/land) on candidates.
 * 2 (server) brief-to-scenario persists base_type in review_placement_candidates
 *   (top-level + generation mirror); missing type → base_facility; never null.
 * 3 (client) review anchors render DISTINCT typed classes (air/naval/land/facility),
 *   keep review-only marker flags, and never become unit markers; baseTypeOf fallback.
 * 4 (client) reload path (drawSavedReviewAnchors) redraws typed anchors from a
 *   PERSISTED scenario — closing persist → refresh → typed-symbol loop.
 */
'use strict';

var path = require('path');
var passed = 0, failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  [PASS] ' + label); }
    else { failed++; console.log('  [FAIL] ' + label); }
}
function find(list, name) { return (list || []).filter(function (c) { return c.base_name_en === name; })[0]; }

console.log('STEP1-BASE-TYPE-SYMBOL-RESTORE-A');

// ── Section 2 (server): coalition builder stamps base_type (req #1) ──
(function () {
    var mco = require(path.join(__dirname, 'UI_MOdified/server/ai/multi-country-orbat.js'));
    var res = mco.buildMultiCountryStep1({ countries: [{
        name: 'Iran',
        air_bases: [{ name_en: 'AB1', lat: 35.0, lon: 51.0 }],
        naval_bases: [{ name_en: 'NB1', lat: 27.0, lon: 56.0 }],
        land_bases: [{ name_en: 'LB1', lat: 29.0, lon: 52.0 }],
    }] }, {});
    // locate placement_candidates wherever the builder returns them
    var pcs = (res && res.placement_candidates) ||
        (res && res.brief && res.brief.operational_brief && res.brief.operational_brief.placement_candidates) ||
        (res && res.operational_brief && res.operational_brief.placement_candidates) || [];
    ok('coalition builder produced placement candidates', pcs.length >= 3);
    ok('air base candidate carries base_type:air_base', !!(find(pcs, 'AB1') && find(pcs, 'AB1').base_type === 'air_base'));
    ok('naval base candidate carries base_type:naval_base', !!(find(pcs, 'NB1') && find(pcs, 'NB1').base_type === 'naval_base'));
    ok('land base candidate carries base_type:land_base', !!(find(pcs, 'LB1') && find(pcs, 'LB1').base_type === 'land_base'));
    ok('candidates stay review-only base anchors (not units)',
        pcs.every(function (c) { return c.exact_unit_position === false && c.placement_type === 'base_location_anchor'; }));
})();

// ── Section 1 (server): brief-to-scenario persists base_type (req #6) ──
var persistedScenario = null;
(function () {
    var gen = require(path.join(__dirname, 'UI_MOdified/server/ai/brief-to-scenario.js'));
    var brief = {
        understanding: { proposed_unit_counts: { red: 2, blue: 1 } },
        operational_brief: {
            mission: 'x',
            placement_candidates: [
                { side: 'RED', base_name_en: 'AirX', site_type: 'air_base', lat: 33.4, lon: 44.1 },
                { side: 'RED', base_name_en: 'NavalX', site_type: 'naval_base', lat: 33.3, lon: 44.3 },
                { side: 'RED', base_name_en: 'LandX', site_type: 'land_base', lat: 33.2, lon: 44.5 },
                // NO type field at all → must fall back to base_facility (never null)
                { side: 'RED', base_name_en: 'MysteryX', placement_type: 'base_location_anchor', lat: 33.1, lon: 44.7 },
            ],
            proposed_units: [],
        },
    };
    var out = gen.generateScenarioFromBrief(brief, { objective: { lon: 50, lat: 20 }, name: 'bt_persist' });
    var s = out && out.scenario;
    persistedScenario = s;
    var top = (s && s.review_placement_candidates) || [];
    var genMirror = (s && s.generation && s.generation.review_placement_candidates) || [];
    ok('scenario.review_placement_candidates persisted (4)', top.length === 4);
    ok('air → base_type:air_base', find(top, 'AirX') && find(top, 'AirX').base_type === 'air_base');
    ok('naval → base_type:naval_base', find(top, 'NavalX') && find(top, 'NavalX').base_type === 'naval_base');
    ok('land → base_type:land_base', find(top, 'LandX') && find(top, 'LandX').base_type === 'land_base');
    ok('missing type → base_facility (never null)', find(top, 'MysteryX') && find(top, 'MysteryX').base_type === 'base_facility');
    ok('every persisted candidate has a non-null base_type', top.every(function (c) { return !!c.base_type; }));
    ok('generation.review_placement_candidates mirror also carries base_type',
        genMirror.length === 4 && genMirror.every(function (c) { return !!c.base_type; }));
})();

// ── Sections 3 & 4 (client): typed marker classes + flags + reload redraw ──
(function () {
    var captured = null;
    function makeLayerGroup() {
        var layers = [];
        return { addTo: function () { return this; }, clearLayers: function () { layers.length = 0; },
            addLayer: function (m) { layers.push(m); }, getLayers: function () { return layers; } };
    }
    global.window = {};
    global.document = { addEventListener: function () {}, getElementById: function () { return null; } };
    global.window.document = global.document;
    global.window.L = {
        layerGroup: makeLayerGroup,
        marker: function (latlng, opts) { return { _ll: latlng, options: opts, on: function () { return this; }, bindPopup: function () { return this; } }; },
        divIcon: function (opts) { return { __divIcon: true, className: opts.className, options: opts }; },
    };
    global.window.map = { addLayer: function () {}, hasLayer: function () { return true; }, removeLayer: function () {} };

    require(path.join(__dirname, 'UI_MOdified/client/shell/placement-candidates-panel.js'));
    var P = global.window.RmoozPlacementPanel;
    ok('placement panel exposes baseTypeOf + drawSavedReviewAnchors',
        P && typeof P.baseTypeOf === 'function' && typeof P.drawSavedReviewAnchors === 'function');

    // baseTypeOf normalization + fallback (req #1)
    ok('baseTypeOf air_base', P.baseTypeOf({ site_type: 'air_base' }) === 'air_base');
    ok('baseTypeOf naval (port/harbour synonym)', P.baseTypeOf({ site_type: 'port' }) === 'naval_base');
    ok('baseTypeOf land (ground/army synonym)', P.baseTypeOf({ site_type: 'army base' }) === 'land_base');
    ok('baseTypeOf airfield synonym → air_base', P.baseTypeOf({ site_type: 'airfield' }) === 'air_base');
    ok('baseTypeOf missing type → base_facility', P.baseTypeOf({}) === 'base_facility');

    function classesFor(cands) {
        P.drawSavedReviewAnchors({ review_placement_candidates: cands });
        var layer = global.window.__rmoozStep1PlacementAnchorLayer;
        return (layer && layer.getLayers ? layer.getLayers() : []);
    }
    // Section 3: distinct typed classes + review-only flags + not-a-unit
    var markers = classesFor([
        { side: 'RED', base_type: 'air_base', site_type: 'air_base', base_name_en: 'A', lat: 35, lon: 51 },
        { side: 'BLUE', base_type: 'naval_base', site_type: 'naval_base', base_name_en: 'N', lat: 27, lon: 56 },
        { side: 'BLUE', base_type: 'land_base', site_type: 'land_base', base_name_en: 'L', lat: 29, lon: 52 },
        { side: 'RED', base_name_en: 'U', lat: 31, lon: 50 }, // no type → base_facility
    ]);
    var cls = markers.map(function (m) { return m.options.icon.className; });
    ok('air anchor class = step1-anchor-air_base', /step1-anchor-air_base/.test(cls[0]));
    ok('naval anchor class = step1-anchor-naval_base', /step1-anchor-naval_base/.test(cls[1]));
    ok('land anchor class = step1-anchor-land_base', /step1-anchor-land_base/.test(cls[2]));
    ok('unknown anchor class = step1-anchor-base_facility', /step1-anchor-base_facility/.test(cls[3]));
    ok('the four base types render DISTINCT classes', new Set(cls).size === 4);
    ok('every marker is a review-only base anchor (flags set, not a unit)',
        markers.length === 4 && markers.every(function (m) {
            return m._rmoozStep1PlacementAnchor === true && m._rmoozReviewOnly === true && m._rmoozExactUnitPosition === false;
        }));

    // Section 4: reload redraws typed anchors from the PERSISTED scenario (Section 1)
    P.drawSavedReviewAnchors(persistedScenario);
    var reloadLayer = global.window.__rmoozStep1PlacementAnchorLayer;
    var reloadCls = (reloadLayer.getLayers() || []).map(function (m) { return m.options.icon.className; });
    ok('reload of persisted scenario redraws 4 typed anchors', reloadLayer.getLayers().length === 4);
    ok('reload preserves air/naval/land/facility classes',
        reloadCls.some(function (c) { return /air_base/.test(c); }) &&
        reloadCls.some(function (c) { return /naval_base/.test(c); }) &&
        reloadCls.some(function (c) { return /land_base/.test(c); }) &&
        reloadCls.some(function (c) { return /base_facility/.test(c); }));
})();

// ── Section 5: drawSavedReviewAnchors restores lastPayload for BSP on reload ──
// STEP1-IMPORT-REVIEW-FINISH-A: after loading a saved scenario the Base Status
// Panel must be able to show per-base proposed units when an anchor is clicked.
// drawSavedReviewAnchors() now sets lastPayload from generation.review_proposed_units.
(function () {
    var vm = require('vm');
    var fs = require('fs');
    var panelSrc = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/shell/placement-candidates-panel.js'), 'utf8');

    function makeLayerGroup() {
        var layers = [];
        return { addTo: function () { return this; }, clearLayers: function () { layers.length = 0; },
            addLayer: function (m) { layers.push(m); }, getLayers: function () { return layers; } };
    }

    var bspCalls = [];
    var ctx = {
        console: console,
        setTimeout: setTimeout, clearTimeout: clearTimeout,
        document: { addEventListener: function () {}, getElementById: function () { return null; } }
    };
    ctx.window = {
        document: ctx.document,
        RmoozBaseStatusPanel: { open: function (c, p) { bspCalls.push({ anchor: c, payload: p }); } },
        map: { addLayer: function () {}, hasLayer: function () { return true; }, removeLayer: function () {} },
        L: {
            layerGroup: makeLayerGroup,
            marker: function (latlng, opts) {
                var handlers = {};
                var m = { _ll: latlng, options: opts, _handlers: handlers,
                    on: function (ev, fn) { handlers[ev] = fn; return this; },
                    bindPopup: function () { return this; } };
                return m;
            },
            divIcon: function (opts) { return { __divIcon: true, className: opts.className, options: opts }; }
        }
    };
    vm.runInNewContext(panelSrc, ctx);
    var P = ctx.window.RmoozPlacementPanel;

    var reviewUnits = [
        { side: 'RED', assigned_base_id: 'BASE-A', platform: 'Su-24', estimated_count: 3, needs_review: true, exact_unit_position: false, review_only: true },
        { side: 'RED', assigned_base_id: 'BASE-B', platform: 'P-3C', estimated_count: 2, needs_review: true, exact_unit_position: false, review_only: true }
    ];
    var reloadScenario = {
        review_placement_candidates: [
            { base_id: 'BASE-A', side: 'RED', base_type: 'air_base', lat: 35.0, lon: 48.0 },
            { base_id: 'BASE-B', side: 'RED', base_type: 'naval_base', lat: 27.0, lon: 56.0 }
        ],
        generation: { review_proposed_units: reviewUnits }
    };

    var drawCount = P.drawSavedReviewAnchors(reloadScenario);
    ok('drawSavedReviewAnchors draws 2 anchors from reload scenario', drawCount === 2);

    var layer = ctx.window.__rmoozStep1PlacementAnchorLayer;
    var markers = layer ? layer.getLayers() : [];
    ok('anchor layer has 2 markers after reload draw', markers.length === 2);

    // Simulate anchor click — BSP should receive the restored payload
    if (markers[0] && markers[0]._handlers && markers[0]._handlers.click) {
        markers[0]._handlers.click();
    }
    ok('BSP.open called when anchor clicked after reload', bspCalls.length === 1);
    var gotPayload = bspCalls[0] && bspCalls[0].payload;
    var gotUnits = gotPayload && gotPayload.brief && gotPayload.brief.operational_brief && gotPayload.brief.operational_brief.proposed_units;
    ok('BSP receives lastPayload with proposed_units restored from review_proposed_units',
        Array.isArray(gotUnits) && gotUnits.length === 2);
    ok('restored units include both platform names',
        Array.isArray(gotUnits) &&
        gotUnits.some(function (u) { return u.platform === 'Su-24'; }) &&
        gotUnits.some(function (u) { return u.platform === 'P-3C'; }));

    // Scenario with NO review_proposed_units must NOT overwrite a previously set lastPayload
    var calls2 = [];
    ctx.window.RmoozBaseStatusPanel = { open: function (c, p) { calls2.push(p); } };
    P.drawSavedReviewAnchors({
        review_placement_candidates: [{ base_id: 'X', side: 'RED', base_type: 'air_base', lat: 30, lon: 50 }]
        // deliberately omits review_proposed_units
    });
    var l2 = ctx.window.__rmoozStep1PlacementAnchorLayer;
    var m2 = l2 ? l2.getLayers() : [];
    if (m2[0] && m2[0]._handlers && m2[0]._handlers.click) m2[0]._handlers.click();
    ok('lastPayload unchanged when reload scenario has no review_proposed_units',
        calls2.length === 1 &&
        calls2[0] && calls2[0].brief &&
        Array.isArray(calls2[0].brief.operational_brief.proposed_units) &&
        calls2[0].brief.operational_brief.proposed_units.length === 2);
})();

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
