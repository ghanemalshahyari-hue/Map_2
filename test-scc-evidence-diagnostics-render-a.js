/**
 * RMOOZ-FF-EVIDENCE-BUILD-MARKER-A — SCC Evidence-panel render test
 *
 * Proves the "Runtime build & map-layer diagnostics" block renders inside the SCC
 * Debug/Evidence panel, surfaces the required fields, and — crucially — detects a
 * STALE BROWSER CACHE by comparing each loaded <script> ?v= against the expected
 * version. This is the artifact an operator screenshots to know whether the browser
 * is running the new code.
 *
 * Run: node test-scc-evidence-diagnostics-render-a.js  (no server needed)
 */
'use strict';
var assert = require('assert');
var path = require('path');
var pass = 0, fail = 0;
function ok(n) { pass++; console.log('  ✓ ' + n); }
function bad(n, e) { fail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }

// ── DOM/window stub (mirrors test-scenario-control-center-af) + document.scripts ──
var elById = {};
function makeEl(t) { var el = { tagName: t, innerHTML: '', textContent: '', children: [], attrs: {}, style: {}, appendChild: function (e) { this.children.push(e); if (e && e.id) elById[e.id] = e; return e; }, removeChild: function (e) { var i = this.children.indexOf(e); if (i >= 0) this.children.splice(i, 1); return e; }, setAttribute: function (k, v) { this.attrs[k] = v; }, removeAttribute: function (k) { delete this.attrs[k]; }, addEventListener: function () {}, removeEventListener: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getAttribute: function (k) { return this.attrs[k]; } }; Object.defineProperty(el, 'parentNode', { value: null, writable: true }); return el; }
var bodyEl = makeEl('body');

// The four FF scripts the page loads, at their CURRENT (correct) versions.
var GOOD_SCRIPTS = [
    { src: 'http://localhost/shell/free-fight-ai.js?v=dual-layer-conflict-a' },
    { src: 'http://localhost/shell/free-fight-movement-engine.js?v=movement-intelligence-b' },
    { src: 'http://localhost/shell/free-fight-demo.js?v=behavior-path-required-a' },
    { src: 'http://localhost/shell/scenario-control-center.js?v=dual-layer-conflict-a' },
];
var docScripts = GOOD_SCRIPTS.slice();
global.document = { body: bodyEl, head: makeEl('head'), createElement: makeEl,
    getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; },
    get scripts() { return docScripts; } };
var GREEN = { ok: true, collateral_risk: { band: 'low', score: 10 }, provenance: { engine: 'deterministic' }, deterministic: true };
global.window = { document: global.document, AppShellEventLog: { append: function () {} },
    sessionStorage: (function () { var d = {}; return { getItem: function (k) { return d[k] || null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; })(),
    setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {},
    fetch: function () { return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve(JSON.stringify(GREEN)); }, json: function () { return Promise.resolve(GREEN); } }); } };
global.window.window = global.window;
global.window.RmoozScenario = { scenario: { id: 'af', name: 'AF', obj: { name: 'Objective X', coord: [54.40, 24.45] },
    red_units: [{ id: 'R-1', side: 'RED', lat: 24.50, lon: 54.50, coord: [54.50, 24.50] }],
    blue_units_initial: [{ id: 'B-1', side: 'BLUE', lat: 24.30, lon: 54.20, coord: [54.20, 24.30] }] } };
var Cl = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
global.window.RmoozTaskability = require(path.join(Cl, 'unit-taskability.js'));
require(path.join(Cl, 'world-state-db.js')); require(path.join(Cl, 'symbol-db.js')); require(path.join(Cl, 'symbol-registry.js'));
require(path.join(Cl, 'free-fight-demo.js'));
require(path.join(Cl, 'scenario-control-center.js'));
var DEMO = global.window.RmoozFreeFightDemo;
var SCC = global.window.RmoozScenarioControlCenter;
DEMO.mount({ brief: { operational_brief: { proposed_units: global.window.RmoozScenario.scenario.blue_units_initial, objectives: [{ label: 'Objective X', lat: 24.45, lon: 54.40 }] } } });

console.log('\nRMOOZ-FF-EVIDENCE-BUILD-MARKER-A (SCC render)\n');

// Open the Evidence panel so the diagnostics block is in the rendered HTML.
SCC._setEvidenceOpenForTest(true);

// T-1: diagnostics block present with heading
try {
    var h = SCC.render();
    assert(/data-scc="ff-diagnostics"/.test(h), 'ff-diagnostics block missing');
    assert(/Runtime build &amp; map-layer diagnostics/.test(h), 'heading missing');
    ok('T-1 diagnostics block renders with heading');
} catch (e) { bad('T-1 diagnostics block renders with heading', e); }

// T-2: required field labels are present
try {
    var h2 = SCC.render();
    ['free_fight_demo_version', 'map_layer_mode', 'ai_lite_layer_visible', 'movement_engine_loaded',
     'plan_source', 'llm_status', 'selected_coa_id', 'movement_source_summary',
     'ai_behavior', 'degraded_behavior_repaired', 'staff_safe_movement_engine', 'legacy_target'].forEach(function (k) {
        assert(h2.indexOf(k) !== -1, 'missing field: ' + k);
    });
    ok('T-2 all required diagnostic field labels present');
} catch (e) { bad('T-2 all required diagnostic field labels present', e); }

// T-3: with correct script versions, the block reports "running THIS build"
try {
    docScripts = GOOD_SCRIPTS.slice();
    var h3 = SCC.render();
    assert(/Browser is running THIS build/.test(h3), 'expected THIS-build confirmation');
    assert(!/STALE CACHE or version mismatch/.test(h3), 'should not warn stale when versions match');
    ok('T-3 correct versions → "running THIS build" (no stale warning)');
} catch (e) { bad('T-3 correct versions → "running THIS build"', e); }

// T-4: a stale ?v= on any script flips the verdict to a stale-cache warning
try {
    docScripts = [
        { src: 'http://localhost/shell/free-fight-ai.js?v=OLD-CACHED' },        // stale
        { src: 'http://localhost/shell/free-fight-movement-engine.js?v=movement-intelligence-b' },
        { src: 'http://localhost/shell/free-fight-demo.js?v=behavior-path-required-a' },
        { src: 'http://localhost/shell/scenario-control-center.js?v=dual-layer-conflict-a' },
    ];
    var h4 = SCC.render();
    assert(/STALE CACHE or version mismatch/.test(h4), 'expected stale-cache warning on mismatch');
    assert(/OLD-CACHED/.test(h4), 'expected the stale loaded version to be shown');
    ok('T-4 stale ?v= → "STALE CACHE" warning surfaced');
} catch (e) { bad('T-4 stale ?v= → "STALE CACHE" warning', e); }
docScripts = GOOD_SCRIPTS.slice();

// T-5: movement-debug table shows the behavior-truth columns (domain/behavior/mode/source)
// — requires a COA loaded so movementDebug() returns rows and the table renders.
function execCoa() { return { plan_id: 'COA-1', title: 'Supported assault', side: 'BLUE', recommended: true,
    phases: [{ name: 'P1', actions: [{ unit_uid: 'B-1', action_type: 'MOVE', role: 'assault', behavior: 'assault', domain: 'ground', movement_mode: 'ground', target: { lat: 24.43, lon: 54.385 } }] }] }; }
function llmPlan(coas) { return { ok: true, plan_source: 'llm', llm_called: true, llm_status: 'ok', recommended_plan_id: coas[0].plan_id, validation: { ok: true }, coas: coas }; }
try {
    DEMO._setCoaPlanForTest(llmPlan([execCoa()]));
    DEMO.engine.selectCoa(0);
    var h5 = SCC.render();
    ['domain', 'behavior', 'mode', 'source', 'moved km', 'rem km'].forEach(function (col) {
        assert(h5.indexOf('>' + col + '<') !== -1, 'movement table missing column header: ' + col);
    });
    ok('T-5 movement-debug table exposes behavior-truth columns');
} catch (e) { bad('T-5 movement-debug table exposes behavior-truth columns', e); }

console.log('\n' + (fail ? ('FAIL — ' + pass + ' passed, ' + fail + ' failed') : ('✅ ' + pass + ' passed, 0 failed (test-scc-evidence-diagnostics-render-a.js)')));
process.exit(fail ? 1 : 0);
