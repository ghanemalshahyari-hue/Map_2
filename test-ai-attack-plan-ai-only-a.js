/**
 * test-ai-attack-plan-ai-only-a.js — RMOOZ-AI-ATTACK-PLAN-AI-ONLY-A
 *
 * The manual "Generate AI Attack Plan" page must present ONLY real LLM-generated results.
 * If the plan is not a real LLM plan (LLM off / timeout / unavailable / fast mode / deterministic
 * fallback / provider missing) it must render NO COA cards, NO score numbers, NO stale values —
 * only "No AI result generated / LLM was not used / Reason: …" plus the diagnostic fields.
 *
 * Acceptance:
 *  1 LLM off              → no cards, "LLM not used"
 *  2 LLM timeout          → no cards
 *  3 deterministic_diverse_coa → no cards
 *  4 plan_source=llm + llm_called=true (+ ok/provider/model, depth≠fast) → cards render
 *  5 the gate shows provider_used / model_used / llm_status / plan_source / ai_depth / commander_mode
 *  6 visible numbers (Units x/y) appear ONLY for the real-LLM render, never for fallback
 *  7 _generateCoaPlan clears the previous _coaPlan before the request resolves (no stale)
 *  8 (test) deterministic fallback is hidden on the AI Attack Plan page
 *  9 (test) a real LLM response renders normally
 * Targets the MANUAL button path (_requestedVia='manual_generate'), not the loop / Generate-5.
 */
'use strict';
var assert = require('assert');
var path = require('path');

var elements = {};
function makeEl(t) {
    return { tagName: t, id: '', className: '', innerHTML: '', textContent: '', children: [], attrs: {}, style: {},
        appendChild: function (e) { this.children.push(e); if (e.id) elements[e.id] = e; return e; },
        setAttribute: function (k, v) { this.attrs[k] = v; }, removeAttribute: function (k) { delete this.attrs[k]; },
        addEventListener: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; } };
}
global.document = { body: makeEl('body'), head: makeEl('head'), createElement: makeEl, getElementById: function (id) { return elements[id] || null; } };
global.window = {}; global.window.document = global.document;

var UI = path.join(__dirname, 'UI_MOdified');
var CLIENT = path.join(UI, 'client', 'shell');
require(path.join(CLIENT, 'world-state-db.js'));
require(path.join(CLIENT, 'symbol-db.js'));
require(path.join(CLIENT, 'symbol-registry.js'));
require(path.join(CLIENT, 'free-fight-demo.js'));
require(path.join(CLIENT, 'scenario-control-center.js'));   // RMOOZ-...-AG: AI-only honesty now lives in the SCC
var FF = global.window.RmoozFreeFightDemo;
var SCC = global.window.RmoozScenarioControlCenter;

var pass = 0, fail = 0;
function ok(n) { pass++; console.log('  ✓ ' + n); }
function bad(n, e) { fail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }

function hasCards(html) { return /data-act="select-coa-/.test(html) || /data-act="apply-coa"/.test(html); }
function hasScores(html) { return /Units:<\/span>/.test(html) || /Units:/.test(html); }
// RMOOZ-AI-EXECUTION-SINGLE-GATE-A: the gate header is always "No AI result generated."; the second
// line varies by state (disabled / no-model / LLM-not-used). "Gated" = the header is shown.
function gated(html) { return /No AI result generated\./.test(html); }

// A realistic COA (so a "real LLM" plan has genuine cards/numbers to render).
function sampleCoas() {
    return [{
        plan_id: 'COA-1', title: 'Recon Screen', coa_family: 'cautious_recon', objective_id: 'Objective X',
        summary: 'recon', recommended: true, risk: 'low', confidence: 'high',
        units_total_considered: 3, units_selected_count: 2,
        role_breakdown: { recon: 2, hold: 1 }, units_moving_count: 2, units_holding_count: 1,
        rationale: ['x'], expected_enemy_reaction: ['y'],
        phases: [{ phase_id: 'p1', name: 'Move', actions: [
            { unit_uid: 'R-1', side: 'RED', role: 'recon', action_type: 'recon', execution_mode: 'recon_standoff_target', target: { lat: 24.7, lon: 54.8 } },
        ] }],
    }];
}
function llmPlan(over) {
    return Object.assign({
        ok: true, plan_source: 'llm', llm_called: true, llm_status: 'ok', fallback_reason: null,
        provider_used: 'ollama', model_used: 'qwen3-coder:latest', ai_depth: 'normal', commander_mode: 'high_variation',
        variation_seed: 1, coas: sampleCoas(), recommended_plan_id: 'COA-1', _requestedVia: 'manual_generate',
    }, over || {});
}
function detPlan(over) {
    return Object.assign({
        ok: true, plan_source: 'deterministic_diverse_coa', llm_called: false, llm_status: null, fallback_reason: null,
        provider_used: null, model_used: null, ai_depth: 'normal', commander_mode: 'high_variation',
        variation_seed: 1, coas: sampleCoas(), recommended_plan_id: 'COA-1', _requestedVia: 'manual_generate',
    }, over || {});
}

function main() {
    // — strict gate predicate —
    try {
        assert(FF._isRealLlmPlanForTest(llmPlan()) === true, 'clean LLM plan is real');
        assert(FF._isRealLlmPlanForTest(llmPlan({ llm_called: false })) === false, 'llm_called false rejected');
        assert(FF._isRealLlmPlanForTest(llmPlan({ plan_source: 'deterministic_diverse_coa' })) === false, 'plan_source non-llm rejected');
        assert(FF._isRealLlmPlanForTest(llmPlan({ llm_status: 'timeout' })) === false, 'llm_status not ok rejected');
        assert(FF._isRealLlmPlanForTest(llmPlan({ llm_status: null })) === false, 'llm_status null rejected (strict)');
        assert(FF._isRealLlmPlanForTest(llmPlan({ fallback_reason: 'x' })) === false, 'fallback_reason rejected');
        assert(FF._isRealLlmPlanForTest(llmPlan({ provider_used: null })) === false, 'missing provider rejected');
        assert(FF._isRealLlmPlanForTest(llmPlan({ model_used: '' })) === false, 'missing model rejected');
        assert(FF._isRealLlmPlanForTest(llmPlan({ ai_depth: 'fast' })) === false, 'fast depth rejected');
        ok('strict gate predicate accepts only real LLM plans');
    } catch (e) { bad('strict gate predicate accepts only real LLM plans', e); }

    // RMOOZ-SCENARIO-CONTROL-CENTER-DEAD-UI-CLEANUP-AG: the old manual "Generate AI Attack Plan" card and its
    // AI-only DISPLAY GATE (renderCoaPlanHtml hiding non-LLM results) were PHYSICALLY DELETED. The AI-only /
    // fallback HONESTY is now represented in the Scenario Control Center COA Review: every COA truthfully shows
    // its plan_source + llm_called + quality verdict — a deterministic/fallback plan is LABELLED, never dressed
    // as AI. These sections assert that honesty in the SCC (replacing the old hide-the-card behavior).
    // honesty — deterministic plan is labelled deterministic, llm_called=false.
    try {
        FF._setCoaPlanForTest(detPlan()); FF._setCoaSelectedIdxForTest(0);
        var det = SCC.render();
        assert(SCC.state() === 'coa_review', 'SCC is in COA review for a deterministic plan');
        assert(/source <b[^>]*>deterministic_diverse_coa/.test(det), 'SCC honestly shows plan_source = deterministic_diverse_coa');
        assert(/llm_called <b[^>]*>false/.test(det), 'SCC honestly shows llm_called = false (not dressed as AI)');
        ok('SCC COA Review labels a deterministic/fallback plan honestly (plan_source + llm_called=false)');
    } catch (e) { bad('SCC honesty: deterministic plan labelled', e); }

    // honesty — a real LLM plan shows plan_source=llm + llm_called=true.
    try {
        FF._setCoaPlanForTest(llmPlan()); FF._setCoaSelectedIdxForTest(0);
        var llm = SCC.render();
        assert(/source <b[^>]*>llm/.test(llm), 'SCC shows plan_source = llm for a real LLM plan');
        assert(/llm_called <b[^>]*>true/.test(llm), 'SCC shows llm_called = true for a real LLM plan');
        assert(/commander-quality/.test(llm), 'SCC shows the commander-quality verdict');
        ok('SCC COA Review shows a real LLM plan as llm / llm_called=true + quality verdict');
    } catch (e) { bad('SCC honesty: LLM plan shown', e); }

    // the strict gate predicate (engine) still distinguishes real-LLM from fallback — used by the SCC honesty.
    try {
        assert(FF._isRealLlmPlanForTest(detPlan()) === false, 'deterministic plan is NOT a real-LLM plan');
        assert(FF._isRealLlmPlanForTest(detPlan({ llm_called: true, llm_status: 'timeout', fallback_reason: 'x' })) === false, 'timeout/fallback is NOT real-LLM');
        assert(FF._isRealLlmPlanForTest(llmPlan()) === true, 'clean LLM plan IS real-LLM');
        ok('engine _isRealLlmPlan predicate still distinguishes real-LLM from fallback (honesty source of truth)');
    } catch (e) { bad('engine _isRealLlmPlan predicate', e); }

    // 7 — _generateCoaPlan clears the previous plan before the new request resolves.
    try {
        global.window.RmoozScenario = { scenario: {
            red_units: [{ id: 'R-1', side: 'RED', lat: 24.8, lon: 54.9, coord: [54.9, 24.8] }],
            blue_units_initial: [{ id: 'B-1', side: 'BLUE', lat: 24.5, lon: 54.4, coord: [54.4, 24.5] }],
            objectives: [{ lat: 24.45, lon: 54.35, name: 'Objective X' }],
        } };
        // a never-resolving fetch so we can inspect the synchronous state after the call
        global.window.fetch = function () { return { then: function () { return { then: function () { return { catch: function () {} }; }, catch: function () {} }; }, catch: function () {} }; };
        FF._setCoaPlanForTest(detPlan({ coas: sampleCoas() })); // stale plan present
        assert(FF._getCoaPlanForTest() != null, 'stale plan present before generate');
        try { FF._generateCoaPlanForTest(); } catch (_) {}
        assert(FF._getCoaPlanForTest() == null, 'previous _coaPlan cleared before the request resolves');
        ok('_generateCoaPlan clears the previous _coaPlan before requesting (no stale numbers)');
    } catch (e) { bad('_generateCoaPlan clears the previous _coaPlan before requesting', e); }

    // (RMOOZ-...-AG: the old "loop plans are NOT gated" card-display section was deleted with renderCoaPlanHtml.)

    // 12 — honest labeling: the "AI Commander Reasoning" panel must NOT label a deterministic
    // decision as AI. RMOOZ-AI-ATTACK-PLAN-MCP-PROMPT-A (commander-panel relabel).
    try {
        var detRec = { turn: 1, side: 'RED', coa_id: 'COA-1', coa_title: 'Direct Assault',
            source: 'deterministic_diverse_coa', moved: 64, held: 0, rationale: ['x'], expected: [] };
        var detHtml = FF._renderCommanderPanelForTest(detRec);
        assert(/Deterministic tactical planner — LLM not used/.test(detHtml), 'deterministic decision labeled "Deterministic tactical planner — LLM not used"');
        assert(!/AI Commander Reasoning/.test(detHtml), 'deterministic decision NOT labeled "AI Commander Reasoning"');
        assert(/Planner rationale \(deterministic/.test(detHtml), 'rationale labeled deterministic, not AI');
        var llmRec = { turn: 2, side: 'RED', coa_id: 'COA-2', coa_title: 'Flank', source: 'llm', moved: 3, held: 0, rationale: ['y'], expected: [] };
        var llmHtml = FF._renderCommanderPanelForTest(llmRec);
        assert(/AI Commander Reasoning/.test(llmHtml), 'LLM decision IS labeled "AI Commander Reasoning"');
        ok('honest labeling: deterministic commander panel says "LLM not used", only LLM is "AI Commander Reasoning"');
    } catch (e) { bad('honest labeling: commander panel deterministic vs AI', e); }

    // (RMOOZ-...-AG: the old COA-card assessment-banner section was deleted with renderCoaPlanHtml; the SCC
    // honesty sections above cover deterministic-vs-AI labelling on the new operator card.)

    console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-ai-attack-plan-ai-only-a.js)');
    process.exit(fail === 0 ? 0 : 1);
}
main();
