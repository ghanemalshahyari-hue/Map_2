#!/usr/bin/env node
/*
 * FREE-FIGHT-AI-LITE-A — deterministic (no-LLM) AI-assisted action/reaction planner.
 * Demo/review-only: no final tasking/COA/weapons/damage/adjudication/world-state.
 */
'use strict';

var path = require('path');

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

var CLIENT = path.join(__dirname, '..', 'client', 'shell'), AI_DIR = path.join(__dirname, '..', 'server', 'ai');
require(path.join(CLIENT, 'world-state-db.js'));
require(path.join(CLIENT, 'symbol-db.js'));
require(path.join(CLIENT, 'symbol-registry.js'));
require(path.join(CLIENT, 'base-status-panel.js'));
require(path.join(CLIENT, 'placement-candidates-panel.js'));
require(path.join(CLIENT, 'demo-units.js'));
require(path.join(CLIENT, 'free-fight-ai.js'));
require(path.join(CLIENT, 'free-fight-demo.js'));

var MC = require(path.join(AI_DIR, 'multi-country-orbat.js'));
var AI = global.window.RmoozFreeFightAI;
var DU = global.window.RmoozDemoUnits;
var FF = global.window.RmoozFreeFightDemo;

var passed = 0, failed = 0;
function test(n, fn) { try { fn(); console.log('  [PASS] ' + n); passed++; } catch (e) { console.log('  [FAIL] ' + n + ': ' + e.message); failed++; } }
function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function d2(a, b) { var dx = a.lat - b.lat, dy = a.lon - b.lon; return dx * dx + dy * dy; }
function briefOf(input) { return MC.buildBriefFromMultiCountry(input, { file: 'ai-test' }).brief; }
function groupsOf(input) { return DU.buildGroupsFromAnchors({ brief: briefOf(input) }); }

var fs = require('fs');
var LITE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'devtools', 'fixtures', 'multi-country', 'GCC_vs_Iran_step1_multicountry_freefight_trial_LITE.json'), 'utf8'));
function gulf(name, side, n) { var a = []; for (var i = 0; i < n; i++) a.push({ name_en: name + ' AB ' + i, lat: 25 + i * 0.3, lon: 53 + i * 0.3, units: [{ platform: side === 'RED' ? 'F-14' : 'F-16', estimated_count: 8 }] }); return { name: name, air_bases: a }; }
var UAE_IRAN = { countries: [gulf('Iran', 'RED', 2), gulf('UAE', 'BLUE', 2)] };
var QATAR_IRAN = { countries: [gulf('Iran', 'RED', 2), gulf('Qatar', 'BLUE', 2)] };
var RED_ONLY = { countries: [gulf('Iran', 'RED', 3)] };
var BLUE_ONLY = { countries: [gulf('UAE', 'BLUE', 3)] };
var OBJ = { lat: 26, lon: 54 };

console.log('\nFREE-FIGHT-AI-LITE-A planner\n');

// ── Planner (pure) ────────────────────────────────────────────────────────
test('produces red_attack_plan + blue_reaction_plan for GCC / UAE_Iran / Iran_Qatar', function () {
    [['GCC', LITE], ['UAE_Iran', UAE_IRAN], ['Iran_Qatar', QATAR_IRAN]].forEach(function (pair) {
        var plan = AI.buildPlan(groupsOf(pair[1]), OBJ, {});
        assert(plan.red_attack_plan.length >= 1, pair[0] + ' RED plan ≥1, got ' + plan.red_attack_plan.length);
        assert(plan.blue_reaction_plan.length >= 1, pair[0] + ' BLUE plan ≥1, got ' + plan.blue_reaction_plan.length);
        assert(plan.red_attack_plan.length <= 3 && plan.blue_reaction_plan.length <= 3, pair[0] + ' ≤3 each');
    });
});
test('plan entries carry all required fields', function () {
    var plan = AI.buildPlan(groupsOf(LITE), OBJ, {});
    plan.red_attack_plan.forEach(function (e) {
        ['demo_group_id', 'country', 'source_base', 'reason', 'route_summary', 'terrain_summary', 'confidence', 'warnings'].forEach(function (k) {
            assert(k in e, 'RED entry has ' + k);
        });
        assert(e.exact_unit_position === false && e.demo_only === true && e.review_only === true && e.requires_commander_approval === true, 'RED entry review-only flags');
    });
    plan.blue_reaction_plan.forEach(function (e) {
        ['demo_group_id', 'country', 'source_base', 'reaction_type', 'reason', 'intercept_or_defend_location', 'route_summary', 'terrain_summary', 'confidence', 'warnings'].forEach(function (k) {
            assert(k in e, 'BLUE entry has ' + k);
        });
        assert(['intercept', 'defend_objective', 'screen', 'hold'].indexOf(e.reaction_type) !== -1, 'reaction_type valid: ' + e.reaction_type);
        assert(Number.isFinite(e.intercept_or_defend_location.lat) && Number.isFinite(e.intercept_or_defend_location.lon), 'intercept/defend location set');
    });
});
test('terrain unavailable → terrain_used false + warning, no crash', function () {
    var plan = AI.buildPlan(groupsOf(LITE), OBJ, {});   // no opts.terrain
    assert(plan.terrain_used === false, 'terrain_used false');
    assert(plan.warnings.some(function (w) { return /Terrain unavailable/.test(w); }), 'terrain-unavailable warning');
    assert(plan.red_attack_plan.every(function (e) { return e.warnings.indexOf('terrain_unavailable_geometric_only') !== -1; }), 'entry terrain warning');
});
test('terrain available → terrain-profiled summary + medium confidence', function () {
    var groups = groupsOf(LITE);
    var routes = {}; groups.forEach(function (g) { routes[g.id] = { available: true, max_slope_deg: 8, elevation_gain_m: 120, mobility: 'go' }; });
    var plan = AI.buildPlan(groups, OBJ, { terrain: { available: true, routes: routes } });
    assert(plan.terrain_used === true, 'terrain_used true');
    assert(plan.red_attack_plan[0].terrain_summary.indexOf('mobility') !== -1, 'terrain summary mentions mobility');
    assert(plan.red_attack_plan[0].route_summary.indexOf('terrain-profiled') !== -1, 'route summary terrain-profiled');
});
test('degradation: RED-only and BLUE-only produce one side + a warning (no crash)', function () {
    var redOnly = AI.buildPlan(groupsOf(RED_ONLY), OBJ, {});
    assert(redOnly.red_attack_plan.length >= 1 && redOnly.blue_reaction_plan.length === 0, 'RED-only: RED plan, no BLUE');
    assert(redOnly.warnings.some(function (w) { return /No BLUE reaction groups/.test(w); }), 'No BLUE warning');
    var blueOnly = AI.buildPlan(groupsOf(BLUE_ONLY), OBJ, {});
    assert(blueOnly.blue_reaction_plan.length >= 1 && blueOnly.red_attack_plan.length === 0, 'BLUE-only: BLUE plan, no RED');
    assert(blueOnly.warnings.some(function (w) { return /No RED attack groups/.test(w); }), 'No RED warning');
});
test('degradation: no objective / no anchors → warnings, empty plans, no crash', function () {
    var noObj = AI.buildPlan(groupsOf(LITE), null, {});
    assert(noObj.red_attack_plan.length === 0 && noObj.warnings.some(function (w) { return /Place Objective X/.test(w); }), 'no objective warns');
    var noAnchors = AI.buildPlan([], OBJ, {});
    assert(noAnchors.red_attack_plan.length === 0 && noAnchors.warnings.some(function (w) { return /No map anchors/.test(w); }), 'no anchors warns');
});

// ── Integration with the controller ────────────────────────────────────────
test('controller: setObjective runs the planner; getPlan + plan-driven groups', function () {
    var p = { brief: briefOf(LITE) };
    FF.init(p); var st = FF.setObjective(OBJ);
    var plan = FF.getPlan();
    assert(plan && plan.red_attack_plan.length >= 1 && plan.blue_reaction_plan.length >= 1, 'plan produced');
    assert(st.planner_mode === 'deterministic' && st.requires_commander_approval === true, 'state deterministic planner mode + requires_commander_approval');
    assert(st.red_attack_plan === plan.red_attack_plan.length && st.blue_reaction_plan === plan.blue_reaction_plan.length, 'state plan counts match');
    assert(FF.getRed().every(function (g) { return g.reason && g.confidence; }), 'RED groups carry AI reason/confidence');
    assert(FF.getBlue().every(function (g) { return g.reaction_type && g.reason; }), 'BLUE groups carry reaction_type + reason');
    FF.clear();
});
test('controller: RED attacks Objective X, BLUE reacts toward defend/intercept; reset→anchors', function () {
    var p = { brief: briefOf(LITE) };
    FF.init(p); FF.setObjective(OBJ);
    var redBefore = FF.getRed().map(function (g) { return d2(g.anchor, OBJ); });
    FF.start(); FF.step(); FF.step();
    // DOMAIN-AWARE-MOVEMENT-A: groups move toward their DOMAIN target (air/ground → X,
    // naval → coastal approach, support → hold), not necessarily straight to X.
    FF.getRed().forEach(function (g, i) { assert(d2(g.current, g.target) <= d2(g.anchor, g.target), 'RED ' + i + ' moves toward its domain target (or holds)'); });
    assert(FF.getBlue().every(function (g) { return d2(g.current, g.target) <= d2(g.anchor, g.target); }), 'BLUE moves toward its domain reaction target (support holds)');
    FF.reset();
    assert(FF.getGroups().every(function (g) { return g.current.lat === g.anchor.lat && g.current.lon === g.anchor.lon; }), 'reset → anchors');
    FF.clear();
});
test('safety: objective stored as user_marked_demo_objective; no final units; review-only', function () {
    var p = { brief: briefOf(LITE) };
    FF.init(p); FF.setObjective(OBJ); FF.start(); FF.step();
    var obj = FF.getObjective();
    assert(obj.object_type === 'objective' && obj.name === 'Objective X' && obj.source_type === 'user_marked_demo_objective' && obj.needs_review === true, 'objective metadata');
    assert(FF.getGroups().every(function (g) { return g.exact_unit_position === false && g.demo_only === true && g.review_only === true && g.requires_commander_approval === true; }), 'groups review-only');
    var ob = p.brief.operational_brief;
    assert(ob.enemy.units.length === 0 && ob.friendly.units.length === 0, 'no final units');
    assert(p.brief.red_units === undefined && ob.courses_of_action.length === 0, 'no scenario units / no COA');
    assert(typeof global.window.units === 'undefined', 'no world-state write (window.units)');
    FF.clear();
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
