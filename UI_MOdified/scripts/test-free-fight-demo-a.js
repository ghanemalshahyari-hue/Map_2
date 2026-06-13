#!/usr/bin/env node
/*
 * FREE-FIGHT-DEMO-A — symbolic RED-attacks-Objective-X / BLUE-reacts demo.
 * Demo only: no final tasking/COA/weapons/damage/adjudication/world-state.
 */
'use strict';

var path = require('path'), fs = require('fs');

// ── DOM stub ─────────────────────────────────────────────────────────────
var elements = {};
function makeEl(t) {
    return { tagName: t, id: '', className: '', innerHTML: '', textContent: '', children: [], attrs: {}, style: {},
        appendChild: function (e) { this.children.push(e); if (e.id) elements[e.id] = e; return e; },
        setAttribute: function (k, v) { this.attrs[k] = v; }, removeAttribute: function (k) { delete this.attrs[k]; },
        addEventListener: function () {}, querySelector: function () { return null; } };
}
global.document = { body: makeEl('body'), head: makeEl('head'), createElement: makeEl, getElementById: function (id) { return elements[id] || null; } };
global.window = {}; global.window.document = global.document;

var CLIENT = path.join(__dirname, '..', 'client', 'shell'), AI = path.join(__dirname, '..', 'server', 'ai');
require(path.join(CLIENT, 'world-state-db.js'));
require(path.join(CLIENT, 'symbol-db.js'));
require(path.join(CLIENT, 'symbol-registry.js'));
require(path.join(CLIENT, 'base-status-panel.js'));
require(path.join(CLIENT, 'placement-candidates-panel.js'));
require(path.join(CLIENT, 'demo-units.js'));
require(path.join(CLIENT, 'free-fight-demo.js'));
require(path.join(CLIENT, 'doc-understanding-review.js'));

var MC = require(path.join(AI, 'multi-country-orbat.js'));
var BRIEF = require(path.join(AI, 'operational-brief.js'));
var FF = global.window.RmoozFreeFightDemo;
function renderReview(payload) {
    var c = { innerHTML: '', style: {}, querySelector: function () { return null; } };
    global.window.RmoozDocReview.render(c, payload, {});
    return c.innerHTML;
}
function hasFreeFightButton(payload) { return /data-act="free-fight"/.test(renderReview(payload)); }

var passed = 0, failed = 0;
function test(n, fn) { try { fn(); console.log('  [PASS] ' + n); passed++; } catch (e) { console.log('  [FAIL] ' + n + ': ' + e.message); failed++; } }
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function d2(a, b) { var dx = a.lat - b.lat, dy = a.lon - b.lon; return dx * dx + dy * dy; }

function brief(input) { return { brief: MC.buildBriefFromMultiCountry(input, { file: 'ff-test' }).brief }; }

// RED 1 / BLUE 6 — the committed multi-country LITE fixture
var LITE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'devtools', 'fixtures', 'multi-country', 'GCC_vs_Iran_step1_multicountry_freefight_trial_LITE.json'), 'utf8'));

// Synthetic single-BLUE vs RED inputs (different country counts)
function ctry(name, n) {
    function bases(type, base) { var a = []; for (var i = 0; i < n; i++) a.push({ name_en: name + ' ' + type + ' ' + i, name_ar: name, lat: base.lat + i * 0.2, lon: base.lon + i * 0.2, units: [{ platform: 'F-16', estimated_count: 6, type_ar: 'مقاتلة' }] }); return a; }
    return { name: name, air_bases: bases('air', { lat: 25, lon: 54 }), naval_bases: bases('naval', { lat: 25.5, lon: 54.5 }), land_bases: bases('land', { lat: 24.5, lon: 53.5 }) };
}
var UAE_IRAN = { countries: [{ name: 'Iran', air_bases: [{ name_en: 'Bandar Abbas', lat: 27.2, lon: 56.3, units: [{ platform: 'F-14', estimated_count: 8 }] }], naval_bases: [{ name_en: 'Bandar Naval', lat: 27.1, lon: 56.2, units: [{ platform: 'Kilo', estimated_count: 2 }] }], land_bases: [{ name_en: 'Shiraz', lat: 29.6, lon: 52.5, units: [{ platform: 'S-300', estimated_count: 4 }] }] }, ctry('UAE', 1)] };
var QATAR_IRAN = { countries: [{ name: 'Iran', air_bases: [{ name_en: 'Bandar Abbas', lat: 27.2, lon: 56.3, units: [{ platform: 'F-14', estimated_count: 8 }] }], naval_bases: [{ name_en: 'Bandar Naval', lat: 27.1, lon: 56.2, units: [{ platform: 'Kilo', estimated_count: 2 }] }], land_bases: [{ name_en: 'Shiraz', lat: 29.6, lon: 52.5, units: [{ platform: 'S-300', estimated_count: 4 }] }] }, ctry('Qatar', 1)] };

var OBJ = { lat: 26.0, lon: 54.0 };
console.log('\nFREE-FIGHT-DEMO-A action-reaction demo\n');

test('before Objective X: no sample selected, prompt to place', function () {
    var p = brief(LITE);
    var st = FF.init(p);            // multi-country brief has no objective
    assert(st.objective_set === false, 'objective not set');
    assert(st.red_groups === 0 && st.blue_groups === 0, 'no groups until objective placed');
    assert(st.all_groups > 0, 'groups exist to choose from');
});
test('Objective X can be placed → 1-3 RED attack + 1-3 BLUE react selected (AI-lite planner)', function () {
    var p = brief(LITE);
    FF.init(p);
    var st = FF.setObjective(OBJ);
    assert(st.objective_set === true, 'objective set');
    assert(st.red_groups >= 1 && st.red_groups <= 3, 'RED attack groups 1..3, got ' + st.red_groups);
    assert(st.blue_groups >= 1 && st.blue_groups <= 3, 'BLUE react groups 1..3, got ' + st.blue_groups);
    assert(FF.getRed().every(function (g) { return g.role === 'RED'; }) && FF.getBlue().every(function (g) { return g.role === 'BLUE'; }), 'roles assigned');
});
test('selected RED groups attack Objective X (target = X)', function () {
    var p = brief(LITE); FF.init(p); FF.setObjective(OBJ);
    var red = FF.getRed();
    assert(red.length >= 1 && red.length <= 3, '1..3 red');
    assert(red.every(function (g) { return d2(g.target, OBJ) === 0; }), 'RED target = Objective X');
});
test('RED groups MOVE toward Objective X (distance to X decreases)', function () {
    var p = brief(LITE); FF.init(p); FF.setObjective(OBJ);
    var before = FF.getRed().map(function (g) { return d2(g.anchor, OBJ); });
    FF.start(); FF.step(); FF.step();
    var after = FF.getRed();
    after.forEach(function (g, i) { assert(d2(g.current, OBJ) < before[i], 'RED group ' + i + ' moved toward Objective X'); });
    assert(FF.getState().progress > 0, 'progress advanced');
});
test('BLUE groups REACT toward Objective X (move from anchor toward intercept near X)', function () {
    var p = brief(LITE); FF.init(p); FF.setObjective(OBJ);
    var beforeAnchorDist = FF.getBlue().map(function (g) { return d2(g.anchor, OBJ); });
    FF.start(); FF.step(); FF.step();
    var after = FF.getBlue();
    after.forEach(function (g, i) {
        assert(d2(g.current, g.anchor) > 0, 'BLUE group ' + i + ' moved from its anchor');
        assert(d2(g.current, OBJ) < beforeAnchorDist[i], 'BLUE group ' + i + ' moved toward Objective X');
    });
});
test('phases progress staged → moving → approaching/reacting → holding', function () {
    var p = brief(LITE); FF.init(p); FF.setObjective(OBJ);
    assert(FF.getRed()[0].phase === 'staged', 'starts staged');
    FF.start(); FF.step();                 // progress 0.1 → moving
    assert(FF.getGroups().every(function (g) { return g.phase === 'moving'; }), 'moving after first step');
    for (var i = 0; i < 12; i++) FF.step(); // drive to completion
    assert(FF.getRed()[0].phase === 'holding', 'RED holding at end');
    assert(FF.getBlue()[0].phase === 'holding', 'BLUE holding at end');
});
test('Reset returns all demo groups to their anchors', function () {
    var p = brief(LITE); FF.init(p); FF.setObjective(OBJ);
    FF.start(); FF.step(); FF.step(); FF.step();
    FF.reset();
    var st = FF.getState();
    assert(st.progress === 0 && st.running === false, 'reset state');
    assert(FF.getGroups().every(function (g) { return g.current.lat === g.anchor.lat && g.current.lon === g.anchor.lon; }), 'current == anchor after reset');
});
test('Clear Objective X removes the objective + sample', function () {
    var p = brief(LITE); FF.init(p); FF.setObjective(OBJ);
    var st = FF.clearObjective();
    assert(st.objective_set === false && st.red_groups === 0 && st.blue_groups === 0, 'objective + groups cleared');
});
test('works with UAE/Iran and Qatar/Iran (different country counts)', function () {
    [['UAE/Iran', UAE_IRAN], ['Qatar/Iran', QATAR_IRAN]].forEach(function (pair) {
        var p = brief(pair[1]); FF.init(p); var st = FF.setObjective({ lat: 26, lon: 55 });
        assert(st.objective_set, pair[0] + ' objective set');
        assert(st.red_groups >= 1 && st.red_groups <= 3, pair[0] + ' RED groups 1..3, got ' + st.red_groups);
        assert(st.blue_groups >= 1 && st.blue_groups <= 3, pair[0] + ' BLUE groups 1..3, got ' + st.blue_groups);
        FF.start(); FF.step();
        assert(FF.getRed().concat(FF.getBlue()).some(function (g) { return d2(g.current, g.anchor) > 0; }), pair[0] + ' groups move');
        FF.clear();
    });
});
test('exact_unit_position stays false; demo group carries card fields; no final units', function () {
    var p = brief(LITE); FF.init(p); FF.setObjective(OBJ); FF.start(); FF.step();
    var ob = p.brief.operational_brief;
    assert(FF.getGroups().every(function (g) { return g.exact_unit_position === false && g.demo_only === true && g.review_only === true; }), 'groups demo_only/review_only/exact false');
    // demo unit card fields available
    assert(FF.getGroups().every(function (g) { return ('country' in g) && ('side' in g) && ('base_name_en' in g) && ('category_counts' in g); }), 'card fields present');
    assert(ob.enemy.units.length === 0 && ob.friendly.units.length === 0, 'no final units');
    assert(p.brief.red_units === undefined, 'no scenario red_units');
    assert(ob.courses_of_action.length === 0, 'no COA');
    assert(typeof global.window.units === 'undefined', 'no window.units');
    FF.clear();
});

// ── FREE-FIGHT-DEMO-B: button visibility for any Step 1 scenario + degradation ──
var ONE_RED_ONE_BLUE = { countries: [
    { name: 'Iran', air_bases: [{ name_en: 'Bandar Abbas', lat: 27.2, lon: 56.3, units: [{ platform: 'F-14', estimated_count: 8 }] }] },
    { name: 'UAE', air_bases: [{ name_en: 'Al Dhafra', lat: 24.2, lon: 54.5, units: [{ platform: 'F-16E', estimated_count: 12 }] }] },
] };
var RED_ONLY = { countries: [{ name: 'Iran',
    air_bases: [{ name_en: 'Bandar Abbas', lat: 27.2, lon: 56.3, units: [{ platform: 'F-14', estimated_count: 8 }] }],
    naval_bases: [{ name_en: 'Bandar Naval', lat: 27.1, lon: 56.2, units: [{ platform: 'Kilo', estimated_count: 2 }] }],
    land_bases: [{ name_en: 'Shiraz', lat: 29.6, lon: 52.5, units: [{ platform: 'S-300', estimated_count: 4 }] }] }] };
var BLUE_ONLY = { countries: [{ name: 'UAE',
    air_bases: [{ name_en: 'Al Dhafra', lat: 24.2, lon: 54.5, units: [{ platform: 'F-16E', estimated_count: 12 }] }],
    naval_bases: [{ name_en: 'Zayed', lat: 24.5, lon: 54.4, units: [{ platform: 'Baynunah', estimated_count: 6 }] }],
    land_bases: [{ name_en: 'As Sila', lat: 24.0, lon: 51.8, units: [{ platform: 'Patriot', estimated_count: 3 }] }] }] };
var NO_COORDS = { countries: [{ name: 'Iran', air_bases: [{ name_en: 'NoCoordBase', units: [{ platform: 'F-14', estimated_count: 2 }] }] }] };

test('Free Fight button shows for Iran/Qatar, UAE/Iran, GCC, and single-country briefs', function () {
    assert(hasFreeFightButton({ brief: brief(QATAR_IRAN).brief }), 'Qatar/Iran shows button');
    assert(hasFreeFightButton({ brief: brief(UAE_IRAN).brief }), 'UAE/Iran shows button');
    assert(hasFreeFightButton({ brief: brief(LITE).brief }), 'GCC (RED1/BLUE6) shows button');
    assert(hasFreeFightButton({ brief: brief(ONE_RED_ONE_BLUE).brief }), 'one RED / one BLUE shows button');
    assert(hasFreeFightButton({ brief: brief(RED_ONLY).brief }), 'RED-only shows button');
    assert(hasFreeFightButton({ brief: brief(NO_COORDS).brief }), 'proposed_units-only (no anchors) still shows button');
});
test('Free Fight button hidden only when there is no demo-able data', function () {
    var empty = { brief: { operational_brief: { proposed_units: [], placement_candidates: [], enemy_bases: [], friendly_trial_bases: [], country_bases: [], coalitions: [], countries: [] } }, understanding: {} };
    assert(!hasFreeFightButton(empty), 'empty brief hides button');
    assert(/data-el="free-fight-debug"/.test(renderReview({ brief: brief(LITE).brief })), 'temporary debug line present');
});
test('one RED / one BLUE: both move toward Objective X', function () {
    var p = brief(ONE_RED_ONE_BLUE); FF.init(p); var st = FF.setObjective({ lat: 26, lon: 55 });
    assert(st.red_groups === 1 && st.blue_groups === 1, 'one RED + one BLUE, got ' + st.red_groups + '/' + st.blue_groups);
    FF.start(); FF.step(); FF.step();
    assert(FF.getRed()[0] && d2(FF.getRed()[0].current, FF.getRed()[0].anchor) > 0, 'RED moved');
    assert(FF.getBlue()[0] && d2(FF.getBlue()[0].current, FF.getBlue()[0].anchor) > 0, 'BLUE moved');
    FF.clear();
});
test('missing BLUE: RED still attacks, warning shown, no crash', function () {
    var p = brief(RED_ONLY); FF.init(p); var st = FF.setObjective({ lat: 26, lon: 55 });
    assert(st.red_groups >= 1 && st.blue_groups === 0, 'RED present, BLUE absent');
    assert(st.warnings.some(function (w) { return /No BLUE/.test(w); }), 'warns No BLUE reaction units');
    FF.start(); FF.step();
    assert(FF.getRed().some(function (g) { return d2(g.current, g.anchor) > 0; }), 'RED moves with no BLUE');
    FF.clear();
});
test('missing RED: BLUE still moves protectively, warning shown, no crash', function () {
    var p = brief(BLUE_ONLY); FF.init(p); var st = FF.setObjective({ lat: 25, lon: 54 });
    assert(st.blue_groups >= 1 && st.red_groups === 0, 'BLUE present, RED absent');
    assert(st.warnings.some(function (w) { return /No RED/.test(w); }), 'warns No RED attack units');
    FF.start(); FF.step();
    assert(FF.getBlue().some(function (g) { return d2(g.current, g.anchor) > 0; }), 'BLUE moves with no RED');
    FF.clear();
});
test('no anchors: Start hidden state + warning, no crash', function () {
    var p = brief(NO_COORDS); FF.init(p); FF.setObjective({ lat: 27, lon: 56 });
    var st = FF.getState();
    assert(st.has_anchors === false, 'no anchors');
    assert(st.warnings.some(function (w) { return /No map anchors/.test(w); }), 'warns No map anchors available');
    FF.start();
    assert(FF.getState().progress === 0, 'start is a no-op without anchors (no crash)');
    FF.clear();
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
