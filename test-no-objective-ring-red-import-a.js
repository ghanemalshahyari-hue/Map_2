#!/usr/bin/env node
/*
 * STEP1-NO-OBJECTIVE-RING-RED-BLUE-IMPORT-A — regression test
 *
 * When reviewed base anchors exist, RED/BLUE units generated from a Step 1
 * brief import must NOT be placed within an objective ring (≤ 0.15° of OBJ X).
 *
 * The display fix lives in adjudicator-map.js (client, browser — not directly
 * testable here). This test guards the SERVER CONTRACT that the client fix
 * depends on: the generated scenario must carry placement_source and unit.coord
 * at the reviewed bases so the client can honour them.
 *
 * Three invariants checked:
 *   1. Units with reviewed anchors carry placement_source = 'reviewed_base_anchor'
 *   2. Those units have unit.coord set to the reviewed base coord (far from OBJ)
 *   3. No reviewed-anchor unit coord is within 0.15° of OBJ X
 */
'use strict';

var path = require('path');
var passed = 0, failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  [PASS] ' + label); }
    else       { failed++; console.log('  [FAIL] ' + label); }
}

console.log('STEP1-NO-OBJECTIVE-RING-RED-IMPORT-A');

var gen = require(path.join(__dirname, 'UI_MOdified/server/ai/brief-to-scenario.js'));

// OBJ X coord (lon, lat) — same as attack_objective_draft scenarios
var OBJ_LON = 54.66, OBJ_LAT = 24.33;
var RING_THRESHOLD_DEG = 0.15;

function dist(lon1, lat1, lon2, lat2) {
    var dLon = lon1 - lon2, dLat = lat1 - lat2;
    return Math.sqrt(dLon * dLon + dLat * dLat);
}

// Build a brief that mimics a real Step 1 import: reviewed RED anchors at
// Iranian air/naval bases far from OBJ X, plus BLUE anchors on the friendly side.
var brief = {
    understanding: { proposed_unit_counts: { red: 4, blue: 2 } },
    operational_brief: {
        mission: 'Attack OBJ X',
        placement_candidates: [
            // RED — Iranian bases far from OBJ X (≥ 2° away)
            { side: 'RED', base_name_en: 'Bandar Abbas', site_type: 'naval_base', lat: 27.22, lon: 56.37 },
            { side: 'RED', base_name_en: 'Konarak',      site_type: 'air_base',   lat: 25.48, lon: 60.38 },
            { side: 'RED', base_name_en: 'Bushehr',      site_type: 'naval_base', lat: 28.92, lon: 50.83 },
            // BLUE — friendly base clearly far from OBJ X (Kuwait, ~3° away)
            { side: 'BLUE', base_name_en: 'Ahmed Al Jaber', site_type: 'air_base', lat: 28.93, lon: 47.79 },
        ],
        proposed_units: [],
    },
};

var opts = { objective: { lon: OBJ_LON, lat: OBJ_LAT }, name: 'regression-test' };
var out = gen.generateScenarioFromBrief(brief, opts);
var scenario = out && out.scenario;

ok('generateScenarioFromBrief returned a scenario', !!scenario);

var redUnits  = (scenario && scenario.red_units)  || [];
// brief-to-scenario stores BLUE draft units as blue_units_initial
var blueUnits = (scenario && scenario.blue_units_initial) || (scenario && scenario.blue_units) || [];

ok('scenario has RED units', redUnits.length > 0);
ok('scenario has BLUE units', blueUnits.length > 0);

// Invariant 1 — all RED units carry placement_source
var redWithSource = redUnits.filter(function (u) { return !!u.placement_source; });
ok('all RED units have placement_source', redWithSource.length === redUnits.length);

// Invariant 2 — units from reviewed anchors use reviewed_base_anchor
var redReviewed = redUnits.filter(function (u) { return u.placement_source === 'reviewed_base_anchor'; });
ok('RED units use reviewed_base_anchor placement', redReviewed.length > 0);

// Invariant 3 — no reviewed RED unit coord is within ring threshold of OBJ X
var ringOffenders = redReviewed.filter(function (u) {
    if (!Array.isArray(u.coord) || u.coord.length < 2) return false;
    return dist(u.coord[0], u.coord[1], OBJ_LON, OBJ_LAT) <= RING_THRESHOLD_DEG;
});
ok('no reviewed RED unit is within ' + RING_THRESHOLD_DEG + '° of OBJ X (objective ring)',
    ringOffenders.length === 0);
if (ringOffenders.length > 0) {
    ringOffenders.forEach(function (u) {
        console.log('    OFFENDER: uid=' + u.uid + ' coord=' + JSON.stringify(u.coord) +
            ' dist=' + dist(u.coord[0], u.coord[1], OBJ_LON, OBJ_LAT).toFixed(4) + '°');
    });
}

// Invariant 4 — reviewed units have unit.coord set (the base anchor coord used by client)
var missingCoord = redReviewed.filter(function (u) {
    return !Array.isArray(u.coord) || u.coord.length < 2;
});
ok('all reviewed RED units have unit.coord (used by client for initial placement)',
    missingCoord.length === 0);

// Invariant 5 — exact_unit_position is false for all generated units
var exactPos = redUnits.filter(function (u) { return u.exact_unit_position === true; });
ok('exact_unit_position is false for all RED units (draft positions only)',
    exactPos.length === 0);

// Invariant 6 — generation.placement_sources reflects reviewed anchors
var ps = scenario && scenario.generation && scenario.generation.placement_sources;
ok('generation.placement_sources.red = reviewed_base_anchor',
    ps && ps.red === 'reviewed_base_anchor');

// Invariant 7 — same check for BLUE if BLUE reviewed anchors present
var blueReviewed = blueUnits.filter(function (u) { return u.placement_source === 'reviewed_base_anchor'; });
if (blueReviewed.length > 0) {
    var blueRingOffenders = blueReviewed.filter(function (u) {
        if (!Array.isArray(u.coord) || u.coord.length < 2) return false;
        return dist(u.coord[0], u.coord[1], OBJ_LON, OBJ_LAT) <= RING_THRESHOLD_DEG;
    });
    ok('no reviewed BLUE unit is within ' + RING_THRESHOLD_DEG + '° of OBJ X',
        blueRingOffenders.length === 0);
}

// Invariant 8 — verify against the real active scenario file (snapshot check)
(function () {
    var fs = require('fs');
    var activePath = path.join(__dirname, 'UI_MOdified/data/scenarios/attack_objective_draft-27.json');
    if (!fs.existsSync(activePath)) {
        console.log('  [SKIP] active scenario not found, skipping snapshot check');
        return;
    }
    var active = JSON.parse(fs.readFileSync(activePath, 'utf8'));
    var activeRed = (active.red_units || []).filter(function (u) {
        return u.placement_source === 'reviewed_base_anchor';
    });
    var activeObjCoord = active.obj && active.obj.coord;
    if (!activeObjCoord || activeRed.length === 0) {
        console.log('  [SKIP] active scenario has no reviewed RED units, skipping snapshot check');
        return;
    }
    var activeOffenders = activeRed.filter(function (u) {
        if (!Array.isArray(u.coord) || u.coord.length < 2) return false;
        return dist(u.coord[0], u.coord[1], activeObjCoord[0], activeObjCoord[1]) <= RING_THRESHOLD_DEG;
    });
    ok('active scenario: no reviewed RED unit near OBJ X in stored data (' + activeRed.length + ' reviewed units)',
        activeOffenders.length === 0);
})();

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
