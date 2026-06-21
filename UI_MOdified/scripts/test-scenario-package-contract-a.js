/* test-scenario-package-contract-a.js — RMOOZ-AI-FREE-FIGHT-OPERATING-1 (Slice 1)
 * Static, no-server checks for the canonical resolved-scenario contract
 * (client/shell/scenario-package-contract.js). Run: node scripts/test-scenario-package-contract-a.js
 */
'use strict';
var path = require('path');
var SP = require(path.join(__dirname, '..', 'client', 'shell', 'scenario-package-contract.js'));

var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + msg); } }
function eq(a, b, msg) { ok(a === b, msg + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }

// ── 1. live scenario: all coords exact + taskable ──────────────────────────
(function () {
    var scn = {
        scenario_id: 'sc1', name: 'sc1', scenario_label: 'Coastal Picket',
        obj: { name: 'OBJ ANCHOR', coord: [18.62, 30.58], radius_km: 5 },
        red_units: [{ uid: 'RED-1', label: 'Mech Coy', domain: 'ground', coord: [18.45, 30.3] }],
        blue_units_initial: [{ unit_uid: 'BLUE-HQ', base_id: 'HQ', label: 'Sector HQ', domain: 'ground', coord: [18.66, 30.66] }],
    };
    var r = SP.build(scn);
    eq(r._kind, 'scenario', 'live scenario detected');
    eq(r.units.length, 2, 'two units extracted');
    var red = r.units.find(function (u) { return u.side === 'RED'; });
    var blue = r.units.find(function (u) { return u.side === 'BLUE'; });
    eq(red.uid, 'RED-1', 'red uid from .uid');
    eq(blue.uid, 'BLUE-HQ', 'blue uid from .unit_uid');
    eq(blue.home_base, 'HQ', 'blue home_base from base_id');
    eq(red.coord_status, 'exact', 'red coord exact');
    eq(red.taskable, true, 'red taskable');
    eq(red.source, 'json', 'red source json');
    ok(Array.isArray(red.coord) && red.coord[0] === 18.45 && red.coord[1] === 30.3, 'red coord is [lon,lat]');
    eq(r.objectives.length, 1, 'one objective from .obj');
    eq(r.objectives[0].coord_status, 'exact', 'objective exact');
    var s = SP.summarize(r);
    eq(s.unresolved, 0, 'summary: nothing unresolved');
    eq(s.review_required, false, 'summary: no review required');
    eq(s.taskable_units, 2, 'summary: 2 taskable');
})();

// ── 2. review payload: named objective missing coords → gazetteer candidate ─
(function () {
    var review = {
        brief: { operational_brief: {
            operation_name: 'IRON SHIELD',
            proposed_units: [
                { unit_uid: 'R-034', side: 'RED', label: 'Bandar Abbas SAG', domain: 'naval' },     // no coord
                { uid: 'B-1', side: 'BLUE', label: 'CAP Flight', domain: 'air', coord: [55.1, 27.2] }, // has coord
            ],
            objectives: [{ name: 'Bandar Abbas Naval Base', type: 'port' }], // no coord, resolver finds it
        } },
        placement: {
            placement_candidates: [{ mention: 'Bandar Abbas Naval Base', lat: 27.15, lon: 56.21, confidence: 0.72, source: { origin: 'gazetteer' }, placement_type: 'known_base' }],
            missing_information: [{ mention: 'Bandar Abbas SAG', reason: 'no coordinate' }],
        },
    };
    var r = SP.build(review);
    eq(r._kind, 'review', 'review payload detected');
    eq(r.operation_name, 'IRON SHIELD', 'operation name from brief');
    var o = r.objectives[0];
    eq(o.coord_status, 'candidate', 'objective resolved to candidate');
    eq(o.source, 'gazetteer', 'objective source gazetteer (location_db→gazetteer)');
    eq(o.confidence, 0.72, 'objective candidate confidence preserved');
    eq(o.needs_review, true, 'candidate needs review');
    ok(o.coord[0] === 56.21 && o.coord[1] === 27.15, 'objective candidate coord is [lon,lat]');
    var red = r.units.find(function (u) { return u.uid === 'R-034'; });
    eq(red.coord_status, 'missing', 'red SAG stays missing (no candidate)');
    eq(red.taskable, false, 'missing unit not taskable');
    var blue = r.units.find(function (u) { return u.uid === 'B-1'; });
    eq(blue.coord_status, 'exact', 'blue with coord is exact');
    eq(blue.domain, 'air', 'blue domain preserved');
    ok(r.resolver_report.some(function (x) { return x.ref === 'R-034' && x.status === 'missing'; }), 'resolver_report lists missing RED unit');
    ok(r.resolver_report.some(function (x) { return x.name === 'Bandar Abbas Naval Base' && x.status === 'candidate'; }), 'resolver_report lists candidate objective');
    var s = SP.summarize(r);
    eq(s.review_required, true, 'summary: review required');
    eq(s.unresolved, 1, 'summary: one unresolved (RED SAG)');
    eq(s.candidates_proposed, 1, 'summary: one candidate proposed');
})();

// ── 3. purity: input never mutated ─────────────────────────────────────────
(function () {
    var scn = { red_units: [{ uid: 'RED-1', coord: [1, 2] }], blue_units_initial: [] };
    var snapshot = JSON.stringify(scn);
    SP.build(scn);
    eq(JSON.stringify(scn), snapshot, 'build() does not mutate its input');
})();

// ── 4. empty / garbage input does not throw ────────────────────────────────
(function () {
    ['', null, undefined, 42, [], {}, { foo: 'bar' }].forEach(function (bad) {
        var threw = false;
        try { var r = SP.build(bad); SP.summarize(r); } catch (e) { threw = true; }
        ok(!threw, 'build/summarize tolerant of ' + JSON.stringify(bad));
    });
})();

console.log('\ntest-scenario-package-contract-a: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
