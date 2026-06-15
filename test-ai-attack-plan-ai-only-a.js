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
var FF = global.window.RmoozFreeFightDemo;

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

    // 1 / 3 / 8 — LLM off (deterministic) → no cards, no scores, "LLM not used".
    try {
        var html = FF._renderCoaPlanHtmlForTest(detPlan());
        assert(gated(html), 'shows "No AI result generated / LLM was not used"');
        assert(!hasCards(html), 'NO COA cards rendered');
        assert(!hasScores(html), 'NO score numbers rendered');
        assert(/Reason: /.test(html), 'shows a Reason');
        ok('deterministic fallback is HIDDEN on the AI Attack Plan page (no cards / no scores)');
    } catch (e) { bad('deterministic fallback is HIDDEN on the AI Attack Plan page', e); }

    // 2 — LLM timeout → no cards.
    try {
        var html2 = FF._renderCoaPlanHtmlForTest(detPlan({ llm_called: true, llm_status: 'timeout', fallback_reason: 'local_llm_unavailable: timeout' }));
        assert(!hasCards(html2), 'timeout → no cards');
        assert(gated(html2), 'timeout → gated message');
        assert(/timeout|unavailable/i.test(html2), 'timeout reason surfaced');
        ok('LLM timeout → no AI plan cards shown');
    } catch (e) { bad('LLM timeout → no AI plan cards shown', e); }

    // fast mode → no cards + fast reason.
    try {
        var htmlF = FF._renderCoaPlanHtmlForTest(detPlan({ ai_depth: 'fast' }));
        assert(!hasCards(htmlF) && gated(htmlF), 'fast → gated, no cards');
        assert(/fast mode/i.test(htmlF), 'fast reason surfaced');
        ok('fast mode (LLM skipped) → no AI plan cards shown');
    } catch (e) { bad('fast mode (LLM skipped) → no AI plan cards shown', e); }

    // 5 — the gate shows the required diagnostic fields.
    try {
        var htmlD = FF._renderCoaPlanHtmlForTest(detPlan({ llm_called: true, llm_status: 'unavailable', fallback_reason: 'llm_failed' }));
        ['plan_source', 'llm_called', 'llm_status', 'provider_used', 'model_used', 'ai_depth', 'commander_mode'].forEach(function (k) {
            assert(htmlD.indexOf(k) !== -1, 'gate shows ' + k);
        });
        ok('gate shows provider_used / model_used / llm_status / plan_source / ai_depth / commander_mode');
    } catch (e) { bad('gate shows the required diagnostic fields', e); }

    // 4 / 9 — real LLM plan → cards render normally, no gate message.
    try {
        var htmlL = FF._renderCoaPlanHtmlForTest(llmPlan());
        assert(hasCards(htmlL), 'real LLM → COA cards rendered');
        assert(!gated(htmlL), 'real LLM → no "No AI result generated" message');
        assert(/Units:/.test(htmlL), 'real LLM → score numbers rendered');
        ok('real LLM response (plan_source=llm, llm_called=true) renders the AI Attack Plan normally');
    } catch (e) { bad('real LLM response renders the AI Attack Plan normally', e); }

    // 6 — numbers come from the LLM plan only: change a count, see it ONLY in the LLM render.
    try {
        var p = llmPlan(); p.coas[0].units_selected_count = 7; p.coas[0].units_total_considered = 9;
        var htmlN = FF._renderCoaPlanHtmlForTest(p);
        assert(/7\/9/.test(htmlN), 'LLM render shows the LLM plan numbers (7/9)');
        var pd = detPlan(); pd.coas[0].units_selected_count = 7; pd.coas[0].units_total_considered = 9;
        var htmlNd = FF._renderCoaPlanHtmlForTest(pd);
        assert(!/7\/9/.test(htmlNd), 'deterministic render shows NO numbers (gated)');
        ok('visible numbers come from the LLM plan only, never from fallback');
    } catch (e) { bad('visible numbers come from the LLM plan only', e); }

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

    // loop plans are NOT gated (separate flow): a deterministic plan WITHOUT the manual tag renders cards.
    try {
        var loopPlan = detPlan(); delete loopPlan._requestedVia;
        var htmlLoop = FF._renderCoaPlanHtmlForTest(loopPlan);
        assert(hasCards(htmlLoop) && !gated(htmlLoop), 'loop/non-manual deterministic plan still renders (gate is manual-only)');
        ok('the gate is scoped to the manual button — loop/Generate-5 deterministic plans still render');
    } catch (e) { bad('the gate is scoped to the manual button', e); }

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

    // 13 — the COA-card assessment banner is honest too (loop/Generate-5 deterministic plans).
    try {
        var detLoop = detPlan(); delete detLoop._requestedVia; detLoop.commander_assessment = 'force pool: 64 units';
        var loopHtml = FF._renderCoaPlanHtmlForTest(detLoop);
        assert(/Tactical Planner Assessment/.test(loopHtml) && !/Commander AI Assessment/.test(loopHtml), 'deterministic plan → "Tactical Planner Assessment (LLM not used)"');
        var llmLoop = llmPlan(); delete llmLoop._requestedVia; llmLoop.commander_assessment = 'llm assessment';
        var llmLoopHtml = FF._renderCoaPlanHtmlForTest(llmLoop);
        assert(/Commander AI Assessment/.test(llmLoopHtml), 'LLM plan → "Commander AI Assessment"');
        ok('COA-card assessment banner labels deterministic plans honestly (not "AI")');
    } catch (e) { bad('COA-card assessment banner honest labeling', e); }

    console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-ai-attack-plan-ai-only-a.js)');
    process.exit(fail === 0 ? 0 : 1);
}
main();
