/**
 * test-scc-coa-commander-quality-ai.js — RMOOZ-SCC-COA-COMMANDER-QUALITY-AI
 *
 * Make the AI commander output reliable, structured, and honest inside the SCC Prepare COA flow:
 *  - hardened LLM-output extraction (fences / commentary / multiple / truncated)
 *  - strict JSON-only + commander-structure prompt (single source)
 *  - schema/validation rejects invented units / missing reason; honest *_fallback status
 *  - SCC Evidence shows parse/schema/repair/fallback + raw output; a fallback is NEVER dressed as AI
 *
 * (Real-server LLM behaviour is proven separately against qwen3-coder; here we test the deterministic
 * structure: extraction, validation, honesty evidence, prompt rules.)
 */
'use strict';
var assert = require('assert');
var path = require('path');
var pass = 0, fail = 0;
function ok(n) { pass++; console.log('  ✓ ' + n); }
function bad(n, e) { fail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }

// ── SERVER: hardened extraction + prompt rules + validation ──
var AIDIR = path.join(__dirname, 'UI_MOdified', 'server', 'ai');
var PLAN = require(path.join(AIDIR, 'free-fight-coa-planner.js'));
var CONTRACT = require(path.join(AIDIR, 'rmooz-ai-tool-contract.js'));
var X = PLAN._extractCoaJsonForTest;

console.log('SERVER — extraction:');
try {
    assert(X('{"coas":[{"plan_id":"COA-1"}]}').obj, 'clean JSON parses');
    var f = X('```json\n{"coas":[{"plan_id":"COA-1"}]}\n```'); assert(f.obj && f.status === null, 'markdown-fenced JSON is extracted');
    var c = X('Here is the plan:\n{"coas":[{"plan_id":"COA-1"}]}\nHope it helps.'); assert(c.obj && Array.isArray(c.obj.coas), 'commentary-wrapped JSON is extracted');
    var m = X('{"coas":[{"plan_id":"A"}]}\n{"coas":[{"plan_id":"B"}]}'); assert(!m.obj && m.status === 'json_extraction_failed', 'multiple coas-objects → json_extraction_failed (ambiguous, rejected)');
    var t = X('{"coas":[{"plan_id":"COA-1","phases":['); assert(!t.obj && t.status === 'invalid_json', 'truncated JSON → invalid_json');
    var e = X(''); assert(!e.obj && e.status === 'invalid_json', 'empty output → invalid_json');
    ok('extraction: clean / fenced / commentary parse; multiple→ambiguous; truncated/empty→invalid_json');
} catch (e) { bad('extraction', e); }

console.log('\nSERVER — prompt hardening (single source):');
try {
    var mcp = CONTRACT.MCP_COMMANDER_INSTRUCTIONS.join(' | ');
    var sys = String(CONTRACT.SYSTEM_CONTRACT);
    assert(/EXACTLY ONE JSON object/.test(mcp) && /no .*code fences|``` code fences/.test(mcp), 'MCP demands exactly one JSON object, no fences');
    ['commander_intent', 'main_effort', 'supporting_effort', 'reserve_or_follow_on', 'security_or_screen', 'red_assumption', 'risk_mitigation', 'success_criteria'].forEach(function (k) {
        assert(mcp.indexOf(k) !== -1, 'MCP demands COA field ' + k);
    });
    assert(/roe_status/.test(mcp) && /taskable/.test(mcp) && /reason/.test(mcp), 'MCP demands per-action reason + roe_status + taskable');
    assert(/do NOT send all units to the objective center/i.test(mcp) && /role-separated targets/i.test(mcp), 'MCP demands role-separated, no all-to-center');
    assert(/HOLD/.test(mcp) && /restricted/i.test(mcp), 'MCP demands HOLD for ROE/taskability-restricted units');
    assert(/EXACTLY ONE JSON object/.test(sys) && /no code fences/.test(sys), 'SYSTEM_CONTRACT demands one JSON object, no fences');
    var rep = CONTRACT.composeRepairPrompt({ violations: [{ code: 'invalid_json', text: 'not parseable' }], allowed_unit_ids: ['R-1'] });
    assert(/REJECTED/.test(rep.system) && /EXACTLY ONE JSON object/.test(rep.system), 'repair prompt: states rejection + demands one JSON object');
    assert(rep.prompt && JSON.stringify(rep.prompt).indexOf('validator_rejections') !== -1, 'repair prompt feeds the exact validator rejections');
    ok('prompt: JSON-only + commander fields + per-action reason/roe/taskable + no-all-center + HOLD-restricted; repair feeds exact errors');
} catch (e) { bad('prompt hardening', e); }

console.log('\nSERVER — schema/validation (invented unit / missing reason):');
try {
    var allowed = ['R-1', 'R-2', 'R-3'];
    var coa = { plan_id: 'COA-1', title: 'x', phases: [{ name: 'P', actions: [
        { unit_uid: 'R-1', action_type: 'recon', role: 'recon', target: { lat: 24.7, lon: 54.8 }, reason: 'scout' },
        { unit_uid: 'GHOST-9', action_type: 'attack', role: 'assault', target: { lat: 24.5, lon: 54.5 }, reason: 'x' } ] }] };
    var norm = PLAN.normalizeCoa(coa, allowed);
    var acts = (norm.phases || []).reduce(function (m, p) { return m.concat(p.actions || []); }, []);
    var uids = acts.map(function (a) { return a.unit_uid; });
    assert(uids.indexOf('GHOST-9') === -1, 'invented unit_uid (GHOST-9) is dropped by normalization');
    assert(uids.indexOf('R-1') !== -1, 'valid unit_uid (R-1) is kept');
    ok('normalization drops invented unit_uids, keeps allowed units');
} catch (e) { bad('schema/validation', e); }

try {
    // RMOOZ-SCC-COA-COMMANDER-QUALITY-AI: the grammar-constrained model now produces commander fields;
    // normalizeCoa MUST carry them through (previously stripped → SCC saw 0/8).
    var rich = PLAN.normalizeCoa({ plan_id: 'COA-1', title: 'Supported assault',
        commander_intent: 'Seize and hold the objective.', main_effort: 'R-1 assault', supporting_effort: 'R-2 support',
        reserve_or_follow_on: 'R-3 reserve', security_or_screen: 'screen the flank', red_assumption: 'Red defends',
        risk_mitigation: 'overwatch + screen', success_criteria: 'hold the objective radius',
        phases: [{ title: 'Phase 1', purpose: 'establish support', actions: [{ unit_uid: 'R-1', role: 'recon', action_type: 'recon', target: { lat: 24.43, lon: 54.39 }, reason: 'seize' }] }] }, ['R-1', 'R-2', 'R-3']);
    assert(rich, 'normalizeCoa returned a COA');
    ['commander_intent', 'main_effort', 'supporting_effort', 'reserve_or_follow_on', 'security_or_screen', 'red_assumption', 'risk_mitigation', 'success_criteria'].forEach(function (k) {
        assert(rich[k] && rich[k].length > 0, 'normalizeCoa carries ' + k);
    });
    assert(rich.phases[0].purpose === 'establish support' && rich.phases[0].title === 'Phase 1', 'normalizeCoa carries phase title + purpose');
    ok('normalizeCoa carries ALL 8 commander fields + phase title/purpose through to the COA (the SCC sees them)');
} catch (e) { bad('commander-field passthrough', e); }

// ── CLIENT: SCC honesty evidence ──
var elById = {};
function makeEl(t) { var el = { tagName: t, innerHTML: '', textContent: '', children: [], attrs: {}, style: {}, appendChild: function (e) { this.children.push(e); if (e && e.id) elById[e.id] = e; return e; }, removeChild: function (e) { var i = this.children.indexOf(e); if (i >= 0) this.children.splice(i, 1); return e; }, setAttribute: function (k, v) { this.attrs[k] = v; }, removeAttribute: function (k) { delete this.attrs[k]; }, addEventListener: function () {}, removeEventListener: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; }, getAttribute: function (k) { return this.attrs[k]; } }; Object.defineProperty(el, 'parentNode', { value: null, writable: true }); return el; }
var bodyEl = makeEl('body');
global.document = { body: bodyEl, head: makeEl('head'), createElement: makeEl, getElementById: function (id) { return elById[id] || null; }, querySelector: function () { return null; } };
global.window = { document: global.document, AppShellEventLog: { append: function () {} }, sessionStorage: (function () { var d = {}; return { getItem: function (k) { return d[k] || null; }, setItem: function (k, v) { d[k] = String(v); }, removeItem: function (k) { delete d[k]; } }; })(), setTimeout: function () { return 0; }, clearTimeout: function () {}, setInterval: function () { return 0; }, clearInterval: function () {}, fetch: function () { return Promise.resolve({ ok: true, status: 200, text: function () { return Promise.resolve('{}'); }, json: function () { return Promise.resolve({}); } }); } };
global.window.window = global.window;
global.window.RmoozScenario = { scenario: { id: 'ai', name: 'AI', obj: { name: 'Objective X', coord: [54.40, 24.45] }, red_units: [], blue_units_initial: [{ id: 'B-1', side: 'BLUE', lat: 24.30, lon: 54.20, coord: [54.20, 24.30] }, { id: 'B-2', side: 'BLUE', lat: 24.31, lon: 54.22, coord: [54.22, 24.31] }, { id: 'B-3', side: 'BLUE', lat: 24.29, lon: 54.21, coord: [54.21, 24.29] }] } };
var Cl = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
global.window.RmoozTaskability = require(path.join(Cl, 'unit-taskability.js'));
require(path.join(Cl, 'world-state-db.js')); require(path.join(Cl, 'symbol-db.js')); require(path.join(Cl, 'symbol-registry.js'));
require(path.join(Cl, 'free-fight-demo.js'));
require(path.join(Cl, 'scenario-control-center.js'));
var DEMO = global.window.RmoozFreeFightDemo, E = DEMO.engine, SCC = global.window.RmoozScenarioControlCenter;
DEMO.mount({ brief: { operational_brief: { proposed_units: global.window.RmoozScenario.scenario.blue_units_initial } } });
DEMO.setObjective({ lat: 24.45, lon: 54.40 });
function reset() { DEMO._resetScenarioForTest(); DEMO._resetCoaExecForTest(); }
function llmCoa() { return { plan_id: 'COA-1', title: 'Supported assault', side: 'BLUE', recommended: true, commander_intent: 'x', main_effort: 'x', supporting_effort: 'x', red_assumption: 'x', risk_mitigation: 'x', phases: [{ name: 'P1', actions: [{ unit_uid: 'B-2', action_type: 'MOVE', role: 'support', target: { lat: 24.40, lon: 54.44 }, reason: 'overwatch' }, { unit_uid: 'B-3', action_type: 'MOVE', role: 'screen', target: { lat: 24.47, lon: 54.36 }, reason: 'screen' }] }, { name: 'P2', actions: [{ unit_uid: 'B-1', action_type: 'MOVE', role: 'assault', target: { lat: 24.43, lon: 54.385 }, reason: 'seize' }] }] }; }

console.log('\nCLIENT — SCC honesty evidence:');
try {
    reset(); DEMO._setCoaPlanForTest({ ok: true, plan_source: 'llm', llm_called: true, llm_status: 'ok', provider_used: 'ollama', model_used: 'qwen3-coder:latest', _requestedVia: 'manual_generate', recommended_plan_id: 'COA-1', coas: [llmCoa()] });
    var le = E.llmEvidence();
    assert(le.plan_source === 'llm' && le.llm_called === true && le.llm_status === 'ok', 'real LLM evidence: source=llm, called, status=ok');
    assert(le.is_real_llm === true && le.fallback_used === false, 'real LLM is_real_llm=true, fallback_used=false');
    ok('a valid LLM plan reports as a real AI commander COA (is_real_llm=true)');
} catch (e) { bad('real LLM evidence', e); }

try {
    reset(); DEMO._setCoaPlanForTest({ ok: true, plan_source: 'deterministic_diverse_coa', llm_called: true, llm_status: 'invalid_json_fallback', fallback_reason: 'llm_invalid_json_or_no_coas_array', fallback_message: 'Local AI returned an unusable plan after repair — used Staff-Safe planner.', llm_raw_response: 'I think the best plan is to recon first... {oops not json', _requestedVia: 'manual_generate', recommended_plan_id: 'COA-1', coas: [llmCoa()] });
    var le2 = E.llmEvidence();
    assert(le2.llm_status === 'invalid_json_fallback' && le2.llm_called === true, 'invalid_json_fallback: AI called, honest *_fallback status');
    assert(le2.fallback_used === true && le2.is_real_llm === false, 'fallback_used=true, is_real_llm=false (NOT dressed as AI)');
    SCC._setEvidenceOpenForTest(true); var ev = SCC.render(); SCC._setEvidenceOpenForTest(false);
    assert(/data-scc="ai-honesty"/.test(ev) && /data-scc="ai-fallback"/.test(ev), 'Evidence shows the AI honesty + fallback block');
    assert(/AI was called, but a fallback plan was used because the JSON\/schema failed/.test(ev), 'Evidence states "AI was called, but a fallback plan was used…"');
    assert(/Raw LLM output \(preview\)/.test(ev) && /oops not json/.test(ev), 'Evidence shows the raw LLM output preview (incl. the failing output)');
    ok('invalid_json_fallback: honest *_fallback status + Evidence "AI called, fallback used" + raw output preview');
} catch (e) { bad('invalid_json_fallback evidence', e); }

try {
    reset(); DEMO._setCoaPlanForTest({ ok: true, plan_source: 'staff_safe_commander_template', llm_called: true, llm_status: 'schema_invalid_fallback', fallback_reason: 'llm_returned_fewer_than_2_valid_coas', _requestedVia: 'manual_generate', coas: [llmCoa()] });
    var le3 = E.llmEvidence();
    assert(le3.llm_status === 'schema_invalid_fallback' && le3.fallback_used === true && le3.is_real_llm === false, 'schema_invalid_fallback: honest, fallback_used, not real-llm');
    ok('schema_invalid_fallback reported honestly (AI called, schema failed, fallback used)');
} catch (e) { bad('schema_invalid_fallback evidence', e); }

// all-center AI COA rejected + uncommittable (reuse the AD/AE hard-block surfaced in SCC Review)
try {
    reset(); DEMO._setCoaPlanForTest({ ok: true, plan_source: 'llm', llm_called: true, llm_status: 'ok', _requestedVia: 'manual_generate', coas: [{ plan_id: 'COA-CTR', title: 'center', side: 'BLUE', recommended: true, phases: [{ name: 'M', actions: ['B-1', 'B-2', 'B-3'].map(function (id) { return { unit_uid: id, action_type: 'MOVE', role: 'assault', target: { lat: 24.45, lon: 54.40 }, reason: 'rush' }; }) }] }] });
    E.selectCoa(0);
    var h = SCC.render();
    assert(/Rejected: not commander-quality\. All units are moving to the objective center\./.test(h), 'all-center AI COA rejected in Review');
    assert(/scc-commit" disabled/.test(h), 'all-center AI COA cannot be committed');
    ok('an all-center AI COA is rejected in Review and cannot be committed');
} catch (e) { bad('all-center AI COA rejected', e); }

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
