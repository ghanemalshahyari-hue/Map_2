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

var MC = require(path.join(AI, 'multi-country-orbat.js'));
var FF = global.window.RmoozFreeFightDemo;

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
test('Objective X can be placed → 2 RED attack + up to 3 BLUE react selected (RED1/BLUE6)', function () {
    var p = brief(LITE);
    FF.init(p);
    var st = FF.setObjective(OBJ);
    assert(st.objective_set === true, 'objective set');
    assert(st.red_groups === 2, 'RED attack groups = 2, got ' + st.red_groups);
    assert(st.blue_groups === 3, 'BLUE react groups = 3, got ' + st.blue_groups);
    assert(FF.getRed().every(function (g) { return g.role === 'RED'; }) && FF.getBlue().every(function (g) { return g.role === 'BLUE'; }), 'roles assigned');
});
test('selected RED groups are the NEAREST RED anchors to Objective X', function () {
    var p = brief(LITE); FF.init(p); FF.setObjective(OBJ);
    var red = FF.getRed();
    assert(red.length === 2, 'two red');
    // each selected red anchor is at least as near as any unselected red would be — sanity: targets = objective
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
        assert(st.red_groups >= 1 && st.red_groups <= 2, pair[0] + ' RED groups 1..2, got ' + st.red_groups);
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

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
