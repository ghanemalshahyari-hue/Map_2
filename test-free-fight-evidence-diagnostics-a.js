/**
 * RMOOZ-FF-EVIDENCE-BUILD-MARKER-A — acceptance tests
 *
 * Verifies the engine's diagnostics() object that backs the SCC Evidence/Debug
 * "Runtime build & map-layer diagnostics" block. The operator relies on this to
 * tell — from a screenshot alone — whether the browser ran THIS build, whether
 * AI-lite preview leaked into execution, and where movement came from.
 *
 * Run: node test-free-fight-evidence-diagnostics-a.js  (no server needed)
 */
'use strict';

// ── Minimal window/DOM stub (mirrors test-free-fight-dual-map-layer-conflict-a) ──
global.window = {
    L: {
        layerGroup: function () { return { addTo: function () { return this; }, clearLayers: function () {} }; },
        divIcon: function (o) { return o; },
        marker:  function () { return { addLayer: function () {}, on: function () {} }; },
        polyline: function () { return {}; },
        circleMarker: function () { return { bindPopup: function () {} }; },
    },
    map: {
        getCenter: function () { return { lat: 30, lng: 45 }; },
        getBounds: function () { return { contains: function () { return true; } }; },
    },
    addEventListener: function () {}, removeEventListener: function () {},
    clearInterval: function () {}, clearTimeout: function () {},
    setInterval: function () { return 1; }, setTimeout: function () { return 1; },
    fetch: function () { return Promise.resolve({ ok: true, json: function () { return Promise.resolve({}); } }); },
    sessionStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
    document: { getElementById: function () { return null; }, querySelector: function () { return null; } },
    location: { href: '' },
    RmoozScenario: null, RmoozCoaRealismGate: { stub: true }, RmoozTaskability: null,
    RmoozMovementEngine: { classifyUnitDomain: function () { return 'ground'; } },
    RmoozFreeFightAI: null, AppShellEventBus: null,
};
global.document = global.window.document;

var path = require('path');
var DEMO = require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'));

// ── Harness ──────────────────────────────────────────────────────────────────
var PASS = 0, FAIL = 0, ERRORS = [];
function test(name, fn) {
    try { fn(); console.log('  PASS  ' + name); PASS++; }
    catch (e) { console.error('  FAIL  ' + name + '\n         ' + e.message); ERRORS.push({ name: name, msg: e.message }); FAIL++; }
}
function ok(cond, msg)  { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg)  { if (a !== b) throw new Error(msg || ('expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a))); }
function has(obj, key)  { ok(Object.prototype.hasOwnProperty.call(obj, key), 'missing key: ' + key); }

console.log('\nRMOOZ-FF-EVIDENCE-BUILD-MARKER-A\n');

// T-1: facade exposes diagnostics()
test('T-1: engine.diagnostics is a function', function () {
    ok(DEMO.engine && typeof DEMO.engine.diagnostics === 'function', 'engine.diagnostics missing');
});

// T-2: diagnostics returns all required fields
test('T-2: diagnostics() returns the required evidence fields', function () {
    var d = DEMO.engine.diagnostics();
    ['free_fight_demo_version', 'movement_engine_loaded', 'map_layer_mode', 'ai_lite_layer_visible',
     'plan_source', 'llm_status', 'selected_coa_id', 'movement_source_summary',
     'moved_count', 'held_count', 'blocked_count', 'missing_unit_count'].forEach(function (k) { has(d, k); });
});

// T-3: build marker is the expected non-empty tag
test('T-3: free_fight_demo_version is a non-empty build tag', function () {
    var d = DEMO.engine.diagnostics();
    ok(typeof d.free_fight_demo_version === 'string' && d.free_fight_demo_version.length > 0, 'empty build marker');
    eq(d.free_fight_demo_version, 'behavior-path-required-a', 'build marker mismatch (bump must mirror app.html ?v=)');
});

// T-4: movement_engine_loaded reflects window.RmoozMovementEngine presence
test('T-4: movement_engine_loaded is true when RmoozMovementEngine present', function () {
    eq(DEMO.engine.diagnostics().movement_engine_loaded, true, 'should detect movement engine');
});

// T-5: movement_source_summary has the four canonical source buckets
test('T-5: movement_source_summary exposes the canonical source buckets', function () {
    var s = DEMO.engine.diagnostics().movement_source_summary;
    ['ai_behavior', 'degraded_behavior_repaired', 'staff_safe_movement_engine', 'legacy_target'].forEach(function (k) { has(s, k); });
    // with no COA loaded, all buckets are zero
    eq(s.ai_behavior, 0); eq(s.degraded_behavior_repaired, 0); eq(s.staff_safe_movement_engine, 0); eq(s.legacy_target, 0);
});

// T-6: ai_lite_layer_visible mirrors RmoozMapLayerMode (false once execution starts)
test('T-6: ai_lite_layer_visible is false after free_fight mode engages', function () {
    if (DEMO._resetAiLiteStagedVisibleForTest) DEMO._resetAiLiteStagedVisibleForTest();
    eq(DEMO.engine.diagnostics().ai_lite_layer_visible, true, 'visible before execution');
    global.window.RmoozMapLayerMode.setMode('free_fight');
    eq(DEMO.engine.diagnostics().ai_lite_layer_visible, false, 'cleared once FF execution active');
    eq(DEMO.engine.diagnostics().map_layer_mode, 'free_fight', 'map_layer_mode reflects FF');
});

// T-7: diagnostics() never throws even with no plan/COA loaded
test('T-7: diagnostics() is safe with no plan loaded', function () {
    var d = DEMO.engine.diagnostics();
    eq(d.moved_count, 0); eq(d.held_count, 0); eq(d.blocked_count, 0); eq(d.missing_unit_count, 0);
    eq(d.plan_source, null); eq(d.selected_coa_id, null);
});

// T-8: the PRODUCTION clear path (what COA Generate/Commit/Replan call) flips map_layer_mode to
//      'free_fight' — so the Evidence panel reports the true execution posture, not a stuck default.
test('T-8: _clearAiLiteStagedGroups() (production COA op) flips map_layer_mode to free_fight', function () {
    if (DEMO._resetAiLiteStagedVisibleForTest) DEMO._resetAiLiteStagedVisibleForTest();
    eq(DEMO.engine.diagnostics().map_layer_mode, 'ai_lite_preview', 'starts at default before any COA op');
    DEMO._clearAiLiteStagedGroupsForTest();   // == what _generateCoaPlan / commit / _resetCoaExec call
    eq(DEMO.engine.diagnostics().map_layer_mode, 'free_fight', 'real COA op takes map ownership');
    eq(DEMO.engine.diagnostics().ai_lite_layer_visible, false, 'AI-lite overlay cleared');
});

// ── Summary ──────────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────────────────────────────');
console.log('RMOOZ-FF-EVIDENCE-BUILD-MARKER-A: ' + PASS + '/' + (PASS + FAIL) + ' passed');
if (ERRORS.length) {
    console.log('\nFailed tests:');
    ERRORS.forEach(function (e) { console.log('  ✗ ' + e.name + ': ' + e.msg); });
    process.exit(1);
} else { console.log('All tests PASS.'); process.exit(0); }
