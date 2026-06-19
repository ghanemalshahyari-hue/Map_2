/**
 * test-free-fight-control-window-rebuild-w.js — RMOOZ-FREE-FIGHT-CONTROL-WINDOW-REBUILD-W
 *
 * UI-only rebuild: the Free Fight control window is now tabbed (Operator / COA Plans / Green / White /
 * Diagnostics) + a System-layers summary. No logic change. The Operator tab shows only the simple flow;
 * all technical items live under Diagnostics. The runtime guarantees (Run/green-refresh no /plan-coas,
 * no-LLM normal tick) are preserved.
 *
 * Acceptance:
 *  1 default Operator tab renders only the simple flow controls (≤3 primary actions) + tab bar
 *  2 Operator tab has no raw/Green JSON, no benchmark controls, no scheduler log
 *  3 COA Plans tab renders the score breakdown + recommendation reason
 *  4 Green tab renders Green World + the map overlay toggle + refresh
 *  5 White tab renders validation/advisory + "advisory only — not a block"
 *  6 Diagnostics tab renders warmup/benchmark + the scheduler decision log
 *  + System-layers summary present (Blue/Red/Green/White/Unit Controller)
 *  7 Run/committed tick makes no /plan-coas and stays llm_called_this_tick=false
 *  8 Green refresh makes no /plan-coas
 */
'use strict';
var assert = require('assert');
var path = require('path');

var elById = {};
function makeEl(t) { return { tagName: t, id: '', innerHTML: '', textContent: '', children: [], attrs: {}, style: {},
    appendChild: function (e) { this.children.push(e); if (e && e.id) elById[e.id] = e; return e; }, removeChild: function () {},
    setAttribute: function (k, v) { this.attrs[k] = v; }, removeAttribute: function () {}, addEventListener: function () {},
    querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getAttribute: function (k) { return this.attrs[k]; } }; }
global.document = { body: makeEl('body'), head: makeEl('head'), createElement: makeEl, getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; }, dispatchEvent: function () {} };
global.CustomEvent = function (n, o) { this.type = n; this.detail = o && o.detail; };

var fetchCalls = [];
function mkGreen() { return { ok: true, collateral_risk: { band: 'high', score: 83, drivers: ['x'] }, road_status: { status: 'constrained' }, infra_status: { note: 'urban' }, host_nation: 'Atropia', neutral_reaction_score: 85, notes: ['n'], provenance: { engine: 'deterministic', population: 'inferred_terrain_class', collateral: 'inferred', roads: 'inferred_terrain_class', reaction: 'inferred' }, deterministic: true, llm_used: false }; }
global.window = { document: global.document, AppShellEventLog: { append: function () {} },
    sessionStorage: (function () { var d = {}; return { getItem: function (k) { return d[k] || null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; })(),
    setTimeout: function (fn) { return setTimeout(fn, 0); }, clearTimeout: function (id) { clearTimeout(id); }, setInterval: function () { return 0; }, clearInterval: function () {},
    fetch: function (url, opts) { fetchCalls.push({ url: String(url), opts: opts }); var s = JSON.stringify(/neutral-world/.test(String(url)) ? mkGreen() : { ok: false }); return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve(s); }, json: function () { return Promise.resolve(JSON.parse(s)); } }); } };
global.window.window = global.window;

var CL = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
require(path.join(CL, 'world-state-db.js')); require(path.join(CL, 'symbol-db.js')); require(path.join(CL, 'symbol-registry.js')); require(path.join(CL, 'free-fight-demo.js'));
var DEMO = global.window.RmoozFreeFightDemo;

var pass = 0, fail = 0;
function ok(n) { pass++; console.log('  ✓ ' + n); }
function bad(n, e) { fail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }
function flush() { return new Promise(function (r) { setTimeout(r, 5); }); }
function scenario() { global.window.RmoozScenario = { scenario: { id: 'scen-w', red_units: [{ id: 'R-1', side: 'RED', lat: 24.451, lon: 54.401 }], blue_units_initial: [{ id: 'B-1', side: 'BLUE', lat: 24.6, lon: 54.6 }], obj: { name: 'Objective X', coord: [54.40, 24.45] } } }; }
function flipPlan() { return { ok: true, plan_source: 'llm', llm_called: true, llm_status: 'ok', provider_used: 'ollama', model_used: 'm', ai_depth: 'normal', validation: { ok: true, errors: [] }, recommended_plan_id: 'COA-A',
    coas: [ { plan_id: 'COA-A', recommended: true, risk: 'high', confidence: 'high', base_score: 50, tactical_score: 20, title: 'Assault', phases: [{ actions: [{ unit_uid: 'R-1', action_type: 'MOVE', target: { lat: 24.451, lon: 54.401 } }] }] },
            { plan_id: 'COA-B', risk: 'low', confidence: 'medium', base_score: 50, tactical_score: 16, title: 'Standoff', phases: [{ actions: [{ unit_uid: 'R-1', action_type: 'MOVE', target: { lat: 30.0, lon: 60.0 } }] }] } ] }; }
function fullRender() { return DEMO._renderAiDecisionHtmlForTest(); }
var PANELS = ['operator', 'coa_plans', 'green', 'white', 'diagnostics'];
// All panels live in the DOM (standard tabbed UI); slice out one panel's content to assert on it.
function panelOf(html, name) { var s = html.indexOf('data-ff-tabpanel="' + name + '"'); if (s < 0) return ''; var e = html.length, i = PANELS.indexOf(name); for (var j = i + 1; j < PANELS.length; j++) { var k = html.indexOf('data-ff-tabpanel="' + PANELS[j] + '"', s); if (k >= 0) { e = k; break; } } return html.slice(s, e); }
function tab(t) { return panelOf(fullRender(), t); }
function setupFull() { DEMO._resetCoaExecForTest(); scenario(); DEMO._setCoaPlanForTest(flipPlan()); DEMO._setGreenWorldForTest(mkGreen()); DEMO._applyGreenAdvisoryScoringForTest('plan_review'); DEMO._applyCoaRankingForTest(); }

DEMO.mount({ brief: { operational_brief: { proposed_units: [], objectives: [{ label: 'Objective X', lat: 24.45, lon: 54.40 }] } } });
DEMO.setObjective({ lat: 24.45, lon: 54.40 });

(async function () {
    setupFull();

    // 1 + 2 — Operator tab: simple flow only, ≤3 primary actions, no technical items + System layers.
    try {
        DEMO._setFfTabForTest('operator');
        var full = fullRender();
        assert(/data-act="ff-tab-coa_plans"/.test(full) && /data-act="ff-tab-diagnostics"/.test(full), 'tab bar present');
        assert(/System layers/.test(full) && /Blue AI/.test(full) && /Unit Controller/.test(full), 'System-layers summary present');
        // default visibility: Operator panel shown, others (e.g. Diagnostics) hidden.
        assert(/data-ff-tabpanel="operator" style="margin-top:8px;"/.test(full), 'Operator panel visible by default');
        assert(/data-ff-tabpanel="diagnostics" style="margin-top:8px;display:none;"/.test(full), 'Diagnostics panel hidden by default');
        var op = panelOf(full, 'operator');
        assert(/data-ff-op="strip"/.test(op), 'operator strip present in the Operator panel');
        var primaries = (op.match(/data-ff-primary="1"/g) || []).length;
        assert(primaries <= 3, '≤3 primary actions (got ' + primaries + ')');
        assert(!/Green JSON/.test(op) && !/data-act="bench-warmup"/.test(op) && !/data-act="bench-run"/.test(op) && !/data-ff-sched="panel"/.test(op), 'Operator panel has NO Green JSON / benchmark / scheduler log');
        ok('Operator tab: simple flow only (≤3 primary), tab bar + System layers, no technical items');
    } catch (e) { bad('Operator tab', e); }

    // 3 — COA Plans tab: score breakdown + recommendation reason.
    try {
        var cp = tab('coa_plans');
        assert(/data-ff-coa="ranking"/.test(cp) && /Score: /.test(cp) && /base /.test(cp), 'score breakdown renders');
        assert(/Recommended because:/.test(cp), 'recommendation reason renders');
        ok('COA Plans tab renders score breakdown + recommendation reason');
    } catch (e) { bad('COA Plans tab', e); }

    // 4 — Green tab: Green World + overlay toggle + refresh.
    try {
        var g = tab('green');
        assert(/data-ff-green="panel"/.test(g) && /data-act="green-overlay-toggle"/.test(g) && /data-act="green-refresh"/.test(g), 'Green World + overlay toggle + refresh render');
        ok('Green tab renders Green World + map overlay toggle + refresh');
    } catch (e) { bad('Green tab', e); }

    // 5 — White tab: validation/advisory + "advisory only — not a block".
    try {
        var w = tab('white');
        assert(/data-ff-w="white"/.test(w) && /Validation/.test(w), 'White validation panel renders');
        assert(/White advisory:/.test(w) && /Green\/White advisory score/.test(w), 'White advisory + scoring render');
        assert(/Advisory only — not a block/.test(w), '"advisory only — not a block" present');
        ok('White tab renders validation/advisory + "not a block"');
    } catch (e) { bad('White tab', e); }

    // 6 — Diagnostics tab: warmup/benchmark + scheduler decision log.
    try {
        var d = tab('diagnostics');
        assert(/data-act="bench-warmup"/.test(d) && /data-act="bench-run"/.test(d), 'warmup + benchmark controls render');
        assert(/data-ff-sched="panel"/.test(d), 'scheduler decision log renders');
        assert(/Reset AI Selection/.test(d) && /data-act="coa-commit"/.test(d), 'model reset + commit-exec controls under Diagnostics');
        // selecting the Diagnostics tab shows it (others hidden)
        DEMO._setFfTabForTest('diagnostics');
        var fd = fullRender();
        assert(/data-ff-tabpanel="diagnostics" style="margin-top:8px;"/.test(fd), 'Diagnostics panel visible when selected');
        assert(/data-ff-tabpanel="operator" style="margin-top:8px;display:none;"/.test(fd), 'Operator panel hidden when Diagnostics active');
        DEMO._setFfTabForTest('operator');
        ok('Diagnostics tab renders warmup/benchmark + decision log + advanced controls; tab switching toggles visibility');
    } catch (e) { bad('Diagnostics tab', e); }

    DEMO._setFfTabForTest('operator');

    // 7 + 9 — Run/committed tick: no /plan-coas, no LLM.
    try {
        DEMO._resetCoaExecForTest(); scenario();
        DEMO._setCoaPlanForTest({ ok: true, plan_source: 'llm', coas: [{ plan_id: 'COA-1', side: 'RED', phases: [{ actions: [{ unit_uid: 'R-1', action_type: 'MOVE', target: { lat: 30, lon: 60 } }] }] }] });
        DEMO._commitCoaForTest(0); await flush();
        fetchCalls.length = 0;
        var t = DEMO._coaExecTickForTest(); await flush();
        assert(t.llm_called_this_tick === false, 'committed tick llm_called_this_tick=false');
        assert(!fetchCalls.some(function (c) { return /plan-coas|chat\/completions|api\/ai\/(generate|model)/.test(c.url); }), 'no /plan-coas or LLM on a committed tick');
        ok('committed tick remains no-LLM and makes no /plan-coas (guarantee preserved)');
    } catch (e) { bad('tick guarantee', e); }

    // 8 — Green refresh: no /plan-coas.
    try {
        scenario(); fetchCalls.length = 0;
        await DEMO._refreshGreenWorldForTest('manual'); await flush();
        assert(fetchCalls.some(function (c) { return /neutral-world/.test(c.url); }), 'green refresh hit /neutral-world');
        assert(!fetchCalls.some(function (c) { return /plan-coas/.test(c.url); }), 'green refresh made no /plan-coas');
        ok('Green refresh makes no /plan-coas (guarantee preserved)');
    } catch (e) { bad('green refresh guarantee', e); }

    console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-free-fight-control-window-rebuild-w.js)');
    process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('FATAL', e); process.exit(1); });
