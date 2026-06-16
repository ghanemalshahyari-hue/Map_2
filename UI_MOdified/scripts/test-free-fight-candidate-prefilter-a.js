'use strict';
/* ============================================================================
 * test-free-fight-candidate-prefilter-a.js — RMOOZ-AI-FREE-FIGHT-CANDIDATE-PREFILTER-A
 * ----------------------------------------------------------------------------
 * Proves the app REDUCES the LLM problem size before the MCP prompt (no real LLM
 * — a stub provider is injected). A real commander would not inspect/move all
 * units across all countries for one objective; neither should the AI.
 *   A) selectCandidates: hundreds of units → 10–25 most relevant; near/relevant
 *      ranked first; grouped non_candidate_summary; selection_reason per candidate.
 *   B) send_all_units bypass + small force → no pre-filter (all sent).
 *   C) GUARDRAIL: a COA referencing a non-candidate is rejected (normalizeCoa
 *      drops it); an all-non-candidate LLM plan never becomes plan_source='llm'.
 *   D) planCoas with 300+ units: prompt force_pool/allowed = candidates only (no
 *      far units), "choose ONLY from selected_candidates" rule present, terrain
 *      context compacted (no full contact dump), plan_source='llm'.
 *   E) result.candidate_prefilter + planning_trace.input_understood.candidates.
 *   F) UI renders "Candidate units sent to AI: X / Y" + excluded + reasons.
 *
 * Run: node scripts/test-free-fight-candidate-prefilter-a.js   (exit 0 = green)
 * ========================================================================== */
const assert = require('assert');
const path = require('path');

const SRV = path.join(__dirname, '..', 'server', 'ai');
const PF = require(path.join(SRV, 'candidate-prefilter.js'));
const COA = require(path.join(SRV, 'free-fight-coa-planner.js'));
const AIP = require(path.join(SRV, 'ai-provider.js'));

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }
async function atest(name, fn) { try { await fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + ' — ' + (e && e.message)); fail++; } }
function arr(v) { return Array.isArray(v) ? v : []; }

// ── shared fixtures ──────────────────────────────────────────────────────────
const OBJ = { lat: 25.30, lon: 51.20, name: 'Objective X' }; // Qatar-ish
// 30 RED near Qatar (relevant) + 300 RED far (other theaters) + some BLUE.
function bigForce() {
    const u = [];
    for (let i = 0; i < 30; i++) u.push({ id: 'NEAR-' + i, side: 'RED', lat: 25.30 + i * 0.02, lon: 51.20 + (i % 6) * 0.02, platform: 'fighter jet', country: 'Qatar' });
    for (let i = 0; i < 300; i++) u.push({ id: 'FAR-' + i, side: 'RED', lat: 18 + (i % 18) * 0.4, lon: 40 + (i % 25) * 0.4, platform: 'tank', country: 'FarLand' });
    for (let i = 0; i < 8; i++) u.push({ id: 'BLUE-' + i, side: 'BLUE', lat: 25.0 + i * 0.05, lon: 51.0 + i * 0.05, platform: 'SAM battery', country: 'Bahrain' });
    return u;
}
function capsFor(units) { const c = {}; units.forEach(function (u) { c[u.id] = { unit_uid: u.id, domain: /fighter/.test(u.platform) ? 'air' : 'ground', capability_scores: { air_superiority: /fighter/.test(u.platform) ? 80 : 10, ground_attack: 40 } }; }); return c; }

(async function () {
console.log('\n═══ RMOOZ-AI-FREE-FIGHT-CANDIDATE-PREFILTER-A ═══\n');

console.log('A) selectCandidates — hundreds → 10–25 relevant');
test('300+ units → sent in [10,25], near units chosen, summary grouped', function () {
    const units = bigForce().filter(function (u) { return u.side === 'RED'; });
    const r = PF.selectCandidates(units, OBJ, { capByUid: capsFor(units), objCountry: 'Qatar', maxCandidates: 20 });
    assert.strictEqual(r.applied, true);
    assert.ok(r.total >= 300, 'total reflects the full pool (' + r.total + ')');
    assert.ok(r.sent >= 10 && r.sent <= 25, 'sent in [10,25] (got ' + r.sent + ')');
    assert.strictEqual(r.sent + r.excluded, r.total, 'sent + excluded == total');
    assert.ok(r.candidate_ids.every(function (id) { return /^NEAR-/.test(id); }), 'all candidates are the NEAR units');
    assert.ok(r.non_candidate_summary.length >= 1 && r.non_candidate_summary[0].count > 0, 'grouped exclusion summary');
    assert.ok(r.candidate_units[0] && r.candidate_units[0].selection_reason, 'candidates carry a selection_reason');
});
test('send_all_units bypass + small force → no pre-filter', function () {
    const units = bigForce().filter(function (u) { return u.side === 'RED'; });
    const all = PF.selectCandidates(units, OBJ, { capByUid: capsFor(units), send_all_units: true });
    assert.strictEqual(all.applied, false);
    assert.strictEqual(all.sent, all.total);
    const small = PF.selectCandidates(units.slice(0, 8), OBJ, { capByUid: capsFor(units) });
    assert.strictEqual(small.applied, false, 'below target → not applied');
    assert.strictEqual(small.sent, 8);
});

console.log('\nB) GUARDRAIL — non-candidate units are rejected');
test('normalizeCoa drops actions whose unit_uid is not a candidate', function () {
    const coa = { plan_id: 'X', recommended: true, phases: [{ name: 'Move', actions: [{ unit_uid: 'FAR-7', side: 'RED', action_type: 'hold', target: { lat: 20, lon: 45 } }] }] };
    const norm = COA.normalizeCoa(coa, ['NEAR-1', 'NEAR-2']); // FAR-7 not allowed → action dropped → empty COA → null
    assert.strictEqual(norm, null, 'a COA that only uses a non-candidate is rejected');
    const ok = COA.normalizeCoa({ plan_id: 'Y', phases: [{ actions: [{ unit_uid: 'NEAR-1', side: 'RED', action_type: 'hold', target: { lat: 25.3, lon: 51.2 } }] }] }, ['NEAR-1', 'NEAR-2']);
    assert.ok(ok && arr(ok.phases[0].actions).length === 1, 'a candidate action is kept');
});

// ── stub provider for the planCoas integration tests ──
process.env.RMOOZ_ALLOW_SIM_RUN = '1';
process.env.RMOOZ_FREE_FIGHT_ATTEMPTS = '1';
let capturedCoaPrompt = null, stubMode = 'valid';
AIP.generate = function (args) {
    const p = String(args.prompt || '');
    if (/coa_requirement/.test(p)) {
        capturedCoaPrompt = p;
        const idA = stubMode === 'noncandidate' ? 'FAR-1' : 'NEAR-0';
        const idB = stubMode === 'noncandidate' ? 'FAR-2' : 'NEAR-1';
        const coas = [
            { plan_id: 'COA-1', title: 'Recon', recommended: true, risk: 'low', confidence: 'low', phases: [{ name: 'Move', actions: [{ unit_uid: idA, side: 'RED', role: 'recon', action_type: 'hold', target: { lat: 25.30, lon: 51.20, type: 'coord' }, reason: 'hold', why_unit: 'near' }] }], non_selected_units: [], risks: ['r'], assumptions: ['a'] },
            { plan_id: 'COA-2', title: 'Screen', recommended: false, risk: 'medium', confidence: 'low', phases: [{ name: 'Move', actions: [{ unit_uid: idB, side: 'RED', role: 'screen', action_type: 'hold', target: { lat: 25.33, lon: 51.23, type: 'coord' }, reason: 'screen', why_unit: 'flank' }] }], non_selected_units: [], risks: ['r'], assumptions: ['a'] },
        ];
        return Promise.resolve({ ok: true, providerUsed: 'ollama', response: JSON.stringify({ coas: coas }) });
    }
    return Promise.resolve({ ok: false, error: 'stub-no-capability-llm' });
};
const planOpts = { useLlm: true, ai_depth: 'normal', preferSide: 'RED', commander_mode: 'free' };

console.log('\nC/D) planCoas with 300+ units — prompt restricted to candidates');
let prefilterResult = null;
await atest('prompt force_pool = candidates only (no far units), rule present, plan_source=llm', async function () {
    stubMode = 'valid'; capturedCoaPrompt = null;
    const r = await COA.planCoas(bigForce(), [OBJ], {}, planOpts);
    prefilterResult = r;
    assert.strictEqual(r.plan_source, 'llm', 'plan_source=llm (got ' + r.plan_source + ')');
    const po = JSON.parse(capturedCoaPrompt);
    const fpFar = (JSON.stringify(po.force_pool).match(/FAR-/g) || []).length;
    assert.strictEqual(fpFar, 0, 'force_pool contains NO far units (got ' + fpFar + ')');
    assert.ok(arr(po.force_pool).length >= 10 && arr(po.force_pool).length <= 25, 'force_pool is 10–25 (got ' + arr(po.force_pool).length + ')');
    assert.ok(arr(po.allowed_unit_ids).every(function (id) { return /^NEAR-/.test(id); }), 'allowed_unit_ids are all candidates');
    assert.ok(/ONLY from selected_candidates/i.test(capturedCoaPrompt), 'instruction: choose ONLY from selected_candidates');
    assert.ok(po.selected_candidates && po.non_candidate_summary, 'selected_candidates + non_candidate_summary in the prompt');
    // terrain context must be compacted (no full contact unit dump → no far refs there)
    const tzcFar = (JSON.stringify(po.terrain_zone_context || {}).match(/FAR-/g) || []).length;
    assert.strictEqual(tzcFar, 0, 'terrain_zone_context carries no far-unit dump (got ' + tzcFar + ')');
});
await atest('non-candidate LLM plan is rejected (never plan_source=llm)', async function () {
    stubMode = 'noncandidate';
    const r = await COA.planCoas(bigForce(), [OBJ], {}, planOpts);
    assert.notStrictEqual(r.plan_source, 'llm', 'an all-non-candidate plan must NOT pass as llm (got ' + r.plan_source + ')');
    // and no FAR unit ends up in an LLM-sourced action
    const usedFar = arr(r.coas).some(function (c) { return arr(c.phases).some(function (ph) { return arr(ph.actions).some(function (a) { return /^FAR-/.test(String(a.unit_uid)); }); }); }) && r.plan_source === 'llm';
    assert.ok(!usedFar, 'no far unit moved via the LLM path');
});

console.log('\nE) result + planning_trace expose the candidate counts');
test('candidate_prefilter + planning_trace.input_understood.candidates', function () {
    const r = prefilterResult || {};
    assert.ok(r.candidate_prefilter && r.candidate_prefilter.applied, 'candidate_prefilter.applied');
    assert.ok(r.candidate_prefilter.sent >= 10 && r.candidate_prefilter.sent <= 25, 'sent 10–25');
    assert.ok(r.candidate_prefilter.total >= 300, 'total reflects the full pool');
    const cand = r.planning_trace && r.planning_trace.input_understood && r.planning_trace.input_understood.candidates;
    assert.ok(cand && cand.applied && cand.sent === r.candidate_prefilter.sent, 'trace mirrors the counts');
    assert.ok(arr(cand.top_exclusions).length >= 1, 'top exclusion reasons present');
});

console.log('\nF) UI — candidate counts render in the planning trace (DOM harness)');
test('renderPlanningTraceHtml shows "Candidate units sent to AI: X / Y" + exclusions', function () {
    const elById = {};
    function mk(t) { const e = { tagName: t, id: '', innerHTML: '', textContent: '', children: [], style: {}, appendChild: function (x) { this.children.push(x); if (x && x.id) elById[x.id] = x; return x; }, removeChild: function (x) { return x; }, setAttribute: function () {}, removeAttribute: function () {}, addEventListener: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getAttribute: function () { return null; } }; Object.defineProperty(e, 'parentNode', { value: null, writable: true }); return e; }
    global.document = { body: mk('b'), head: mk('h'), createElement: mk, getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; }, addEventListener: function () {} };
    global.window = { document: global.document, AppShellEventLog: { append: function () {} }, sessionStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} }, setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {}, fetch: function () { return Promise.reject(new Error('no')); } };
    global.window.window = global.window;
    const C = path.join(__dirname, '..', 'client', 'shell');
    require(path.join(C, 'world-state-db.js'));
    require(path.join(C, 'symbol-db.js'));
    require(path.join(C, 'symbol-registry.js'));
    require(path.join(C, 'free-fight-demo.js'));
    const DEMO = global.window.RmoozFreeFightDemo;
    const html = DEMO._renderPlanningTraceHtmlForTest(prefilterResult);
    assert.ok(/Candidate units sent to AI:\s*\d+\s*\/\s*\d+/.test(html), 'shows "Candidate units sent to AI: X / Y"');
    assert.ok(/excluded far\/not-relevant:\s*\d+/.test(html), 'shows excluded count');
    assert.ok(/excluded \d+:/.test(html), 'shows a top exclusion reason');
});

console.log('\n' + (fail === 0 ? '✅ PASS' : '❌ FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail === 0 ? 0 : 1);
})().catch(function (e) { console.error('FATAL', e && e.stack || e); process.exit(1); });
