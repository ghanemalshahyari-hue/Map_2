'use strict';
/* ============================================================================
 * test-free-fight-ux-proof-a.js — RMOOZ-AI-FREE-FIGHT-UX-PROOF-A
 * ----------------------------------------------------------------------------
 * The Free Fight card must let an operator understand what the AI did WITHOUT
 * reading server logs. Proves the four consolidated proof blocks render the
 * existing data (no planner-logic change):
 *
 *   1) Candidate count appears (X / Y + excluded + top reasons)
 *   2) Selected model appears (AI Readiness)
 *   3) plan_source=llm proof appears ONLY for a real LLM result
 *   4) deterministic/fallback is NOT labelled as AI
 *   5) non_selected_units render COLLAPSED (<details>, no `open`)
 *   6) candidate filter shows a "before generation" explainer when no plan
 *
 * (The per-unit "AI Selected Units (N)" roster was removed at owner request —
 *  RMOOZ-SELECTED-UNITS-REMOVE — so that block is no longer asserted.)
 *
 * Run: node scripts/test-free-fight-ux-proof-a.js   (exit 0 = green)
 * ========================================================================== */
const assert = require('assert');
const path = require('path');

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }

// ── DOM harness ───────────────────────────────────────────────────────────────
const elById = {};
function mk(t) { const e = { tagName: t, id: '', innerHTML: '', textContent: '', children: [], style: {}, appendChild: function (x) { this.children.push(x); if (x && x.id) elById[x.id] = x; return x; }, removeChild: function (x) { return x; }, setAttribute: function () {}, removeAttribute: function () {}, addEventListener: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getAttribute: function () { return null; } }; Object.defineProperty(e, 'parentNode', { value: null, writable: true }); return e; }
global.document = { body: mk('b'), head: mk('h'), createElement: mk, getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; }, addEventListener: function () {} };
global.window = { document: global.document, AppShellEventLog: { append: function () {} }, sessionStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} }, setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {}, fetch: function () { return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve('{}'); } }); } };
global.window.window = global.window;
// Scenario so _findRealUnit / _aiUnitLabel resolve a display name + country + location.
global.window.RmoozScenario = { scenario: { red_units: [
    { id: 'R-1', side: 'RED', name: 'Qatari F-16 Squadron', country: 'Qatar', lat: 25.30, lon: 51.20, coord: [51.20, 25.30] },
    { id: 'R-2', side: 'RED', name: 'Coastal Frigate', country: 'Qatar', lat: 25.55, lon: 51.55, coord: [51.55, 25.55] },
], blue_units_initial: [] } };
const C = path.join(__dirname, '..', 'client', 'shell');
require(path.join(C, 'world-state-db.js')); require(path.join(C, 'symbol-db.js')); require(path.join(C, 'symbol-registry.js')); require(path.join(C, 'free-fight-demo.js'));
const DEMO = global.window.RmoozFreeFightDemo;
function S(x) { return String(x); }

const RH_READY = { ok: true, allow_sim_run: true, provider_blocked: false, configured_provider: 'ollama', model_available: true, model: 'qwen2.5:7b' };
const LLM_PLAN = { ok: true, plan_source: 'llm', llm_called: true, llm_status: 'ok', provider_used: 'ollama', model_used: 'qwen2.5:7b',
    planning_trace: { input_understood: { candidates: { applied: true, sent: 18, total: 340, excluded: 322, top_exclusions: [{ count: 200, label: 'out of reach' }, { count: 80, label: 'different country' }] } } },
    coas: [{ plan_id: 'COA-1', title: 'Flank', phases: [{ name: 'Move', actions: [{ unit_uid: 'R-1', action_type: 'flank', execution_mode: 'flank_offaxis_target', why_unit: 'covers the open flank', target: { lat: 25.31, lon: 51.22 } }] }], non_selected_units: [{ unit_uid: 'R-2', reason: 'too far from the objective' }] }] };
const DET_PLAN = { ok: true, plan_source: 'deterministic_coa_fallback', llm_called: true, llm_status: 'invalid_json', fallback_reason: 'llm_invalid_json_or_no_coas_array', model_used: 'llama3.2:1b', coas: [{ plan_id: 'COA-1', title: 'Defense', phases: [] , non_selected_units: [] }] };

(function () {
console.log('\n═══ RMOOZ-AI-FREE-FIGHT-UX-PROOF-A ═══\n');

console.log('1) AI Candidate Filter — candidate count appears');
test('shows "X / total Y" + excluded + top reasons', function () {
    const h = S(DEMO._aiCandidateFilterHtmlForTest(LLM_PLAN));
    assert.ok(/Candidate units sent to AI:/.test(h), 'has the candidate label');
    assert.ok(/18/.test(h) && /340/.test(h), 'shows 18 / 340');
    assert.ok(/Excluded units:\s*<b[^>]*>322/.test(h) || /Excluded units:.*322/.test(h), 'shows excluded 322');
    assert.ok(/out of reach/.test(h) && /different country/.test(h), 'shows top exclusion reasons');
    assert.ok(/reasoned over only 18 of 340/.test(h), 'proof line: AI saw only X of Y');
});

console.log('\n2) AI Readiness — selected model appears');
test('readiness shows the selected model', function () {
    const h = S(DEMO._aiReadinessHtmlForTest(RH_READY, LLM_PLAN));
    assert.ok(/Selected model/.test(h), 'has Selected model row');
    assert.ok(/qwen2\.5:7b/.test(h), 'shows the model name');
    assert.ok(/AI Readiness/.test(h), 'titled AI Readiness');
});

console.log('\n3) plan_source=llm proof appears ONLY for a real LLM result');
test('LLM plan → "came from the local LLM (plan_source=llm)"', function () {
    const h = S(DEMO._aiReadinessHtmlForTest(RH_READY, LLM_PLAN));
    assert.ok(/Movement came from the local LLM \(plan_source=llm\)/.test(h), 'positive LLM verdict');
    assert.ok(/Plan source \(after generation\):<\/span>\s*<span[^>]*>llm/.test(h) || /plan_source/.test(h.toLowerCase()) , 'plan source shown');
});

console.log('\n4) deterministic/fallback is NOT labelled as AI');
test('deterministic plan → "not AI" verdict, no LLM-proof line', function () {
    const h = S(DEMO._aiReadinessHtmlForTest(RH_READY, DET_PLAN));
    assert.ok(/the LLM did not produce this \(not "AI"\)/.test(h), 'explicitly not-AI');
    assert.ok(!/Movement came from the local LLM/.test(h), 'no false LLM-proof for a deterministic plan');
    assert.ok(/invalid_json/.test(h), 'shows the honest llm_status/fallback');
});

console.log('\n5) AI Non-Selected Units — collapsed <details>');
test('non_selected_units render in a collapsed <details> with reasons', function () {
    const h = S(DEMO._aiNonSelectedUnitsHtmlForTest(LLM_PLAN));
    assert.ok(/^<details/.test(h.trim()), 'is a <details> element');
    assert.ok(!/<details[^>]*\bopen\b/.test(h), 'collapsed by default (no open attribute)');
    assert.ok(/<summary/.test(h) && /Non-Selected Units \(1\)/.test(h), 'summary with count');
    assert.ok(/Coastal Frigate/.test(h) && /\(R-2\)/.test(h), 'names the held-back unit');
    assert.ok(/too far from the objective/.test(h), 'shows why it was not moved');
});

console.log('\n6) Candidate Filter — "before generation" explainer (no plan)');
test('no plan → explainer preview is shown', function () {
    const h = S(DEMO._aiCandidateFilterHtmlForTest(null));
    assert.ok(/AI Candidate Filter/.test(h), 'block present before generation');
    assert.ok(/Before generation/.test(h) && /top ~10–25/.test(h), 'explains the filter applies + appears after generation');
});

console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail === 0 ? 0 : 1);
})();
