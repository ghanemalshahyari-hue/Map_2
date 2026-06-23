/**
 * RMOOZ-DUAL-MAP-LAYER-CONFLICT-A — acceptance tests
 *
 * Verifies that the AI-lite staged preview layer is separated from the
 * Free Fight execution layer and that the cleanup gate fires correctly.
 *
 * Run: node test-free-fight-dual-map-layer-conflict-a.js  (no server needed)
 */
'use strict';

// ── Minimal window/DOM stub ───────────────────────────────────────────────────
// The module checks `typeof window` for RmoozFreeFightDemo + RmoozMapLayerMode.
// We stub only what the IIFE needs to not throw on require().

var _fakeMapReady = false;
global.window = {
    L: {
        layerGroup: function () {
            return { addTo: function () { return this; }, clearLayers: function () {} };
        },
        divIcon: function (o) { return o; },
        marker:  function () { return { addLayer: function () {}, on: function () {} }; },
        polyline: function () { return {}; },
        circleMarker: function () { return { bindPopup: function () {} }; },
    },
    map: {
        getCenter: function () { return { lat: 30, lng: 45 }; },
        getBounds: function () { return { contains: function () { return true; } }; },
    },
    addEventListener: function () {},
    removeEventListener: function () {},
    clearInterval: function () {},
    clearTimeout: function () {},
    setInterval: function () { return 1; },
    setTimeout: function (fn) { return 1; },
    fetch: function () { return Promise.resolve({ ok: true, json: function () { return Promise.resolve({}); } }); },
    sessionStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
    document: { getElementById: function () { return null; }, querySelector: function () { return null; } },
    location: { href: '' },
    RmoozScenario: null,
    RmoozCoaRealismGate: null,
    RmoozTaskability: null,
    RmoozMovementEngine: null,
    RmoozFreeFightAI: null,
    AppShellEventBus: null,
};
global.document = global.window.document;

// ── Load module ───────────────────────────────────────────────────────────────
var path = require('path');
var DEMO = require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'));

// ── Test harness ──────────────────────────────────────────────────────────────
var PASS = 0, FAIL = 0, ERRORS = [];
function test(name, fn) {
    try { fn(); console.log('  PASS  ' + name); PASS++; }
    catch (e) { console.error('  FAIL  ' + name + '\n         ' + e.message); ERRORS.push({ name: name, msg: e.message }); FAIL++; }
}
function ok(cond, msg)  { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg)  { if (a !== b) throw new Error(msg || ('expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a))); }

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\nRMOOZ-DUAL-MAP-LAYER-CONFLICT-A\n');

// T-1: module loads and exposes dual-layer test seams
test('T-1: module exposes dual-layer test seams', function () {
    ok(typeof DEMO._getAiLiteStagedVisibleForTest   === 'function', '_getAiLiteStagedVisibleForTest missing');
    ok(typeof DEMO._clearAiLiteStagedGroupsForTest  === 'function', '_clearAiLiteStagedGroupsForTest missing');
    ok(typeof DEMO._resetAiLiteStagedVisibleForTest === 'function', '_resetAiLiteStagedVisibleForTest missing');
});

// T-2: initial state — AI-lite staged overlay is visible
test('T-2: _aiLiteStagedVisible starts as true (AI-lite preview on by default)', function () {
    DEMO._resetAiLiteStagedVisibleForTest();
    ok(DEMO._getAiLiteStagedVisibleForTest() === true, 'expected true after reset');
});

// T-3: _clearAiLiteStagedGroups() sets _aiLiteStagedVisible to false
test('T-3: _clearAiLiteStagedGroupsForTest() sets _aiLiteStagedVisible=false', function () {
    DEMO._resetAiLiteStagedVisibleForTest();
    eq(DEMO._getAiLiteStagedVisibleForTest(), true, 'pre-condition: visible=true');
    DEMO._clearAiLiteStagedGroupsForTest();
    eq(DEMO._getAiLiteStagedVisibleForTest(), false, '_aiLiteStagedVisible should be false after clear');
});

// T-4: _clearAiLiteStagedGroups() is idempotent (safe to call multiple times)
test('T-4: _clearAiLiteStagedGroupsForTest() is idempotent', function () {
    DEMO._clearAiLiteStagedGroupsForTest();
    DEMO._clearAiLiteStagedGroupsForTest();
    eq(DEMO._getAiLiteStagedVisibleForTest(), false, 'still false after double clear');
});

// T-5: window.RmoozMapLayerMode is exposed and has the expected shape
test('T-5: window.RmoozMapLayerMode is exposed with mode/setMode/isAiLiteVisible', function () {
    var ctrl = global.window.RmoozMapLayerMode;
    ok(ctrl,                               'RmoozMapLayerMode not set on window');
    ok(typeof ctrl.mode        === 'function', 'mode() missing');
    ok(typeof ctrl.setMode     === 'function', 'setMode() missing');
    ok(typeof ctrl.isAiLiteVisible === 'function', 'isAiLiteVisible() missing');
});

// T-6: RmoozMapLayerMode.setMode('free_fight') triggers cleanup
test('T-6: RmoozMapLayerMode.setMode("free_fight") clears AI-lite staged overlay', function () {
    DEMO._resetAiLiteStagedVisibleForTest();
    eq(DEMO._getAiLiteStagedVisibleForTest(), true, 'pre-condition: visible=true');
    global.window.RmoozMapLayerMode.setMode('free_fight');
    eq(global.window.RmoozMapLayerMode.mode(), 'free_fight', 'mode set to free_fight');
    eq(DEMO._getAiLiteStagedVisibleForTest(), false, 'staged overlay cleared after free_fight mode');
    ok(global.window.RmoozMapLayerMode.isAiLiteVisible() === false, 'isAiLiteVisible() reflects false');
});

// T-7: RmoozMapLayerMode.setMode('ai_lite_preview') does not auto-restore visible
//      (restoration only via explicit reset seam — SCC never un-clears it)
test('T-7: setMode("ai_lite_preview") does not re-enable staged overlay', function () {
    DEMO._resetAiLiteStagedVisibleForTest();
    global.window.RmoozMapLayerMode.setMode('free_fight');
    eq(DEMO._getAiLiteStagedVisibleForTest(), false, 'cleared by free_fight');
    global.window.RmoozMapLayerMode.setMode('ai_lite_preview');
    eq(global.window.RmoozMapLayerMode.mode(), 'ai_lite_preview', 'mode flipped back');
    // staged visible must NOT be auto-restored (once cleared, stays cleared)
    eq(DEMO._getAiLiteStagedVisibleForTest(), false, 'staged overlay stays false');
});

// T-8: reset seam restores visibility (teardown only, not a production path)
test('T-8: _resetAiLiteStagedVisibleForTest() restores visibility for next test', function () {
    DEMO._clearAiLiteStagedGroupsForTest();
    eq(DEMO._getAiLiteStagedVisibleForTest(), false, 'cleared');
    DEMO._resetAiLiteStagedVisibleForTest();
    eq(DEMO._getAiLiteStagedVisibleForTest(), true, 'reset restores to true');
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n─────────────────────────────────────────────────────');
console.log('RMOOZ-DUAL-MAP-LAYER-CONFLICT-A: ' + PASS + '/' + (PASS + FAIL) + ' passed');
if (ERRORS.length) {
    console.log('\nFailed tests:');
    ERRORS.forEach(function (e) { console.log('  ✗ ' + e.name + ': ' + e.msg); });
    process.exit(1);
} else {
    console.log('All tests PASS.');
    process.exit(0);
}
