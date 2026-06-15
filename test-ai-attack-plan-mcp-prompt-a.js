/**
 * test-ai-attack-plan-mcp-prompt-a.js — RMOOZ-AI-ATTACK-PLAN-MCP-PROMPT-A
 *
 * The manual "Generate AI Attack Plan" button must route through the MCP/tool-contract commander
 * prompt as the single source of truth, force the AI/MCP path (useLlm true, never fast), and either
 * run a real LLM commander plan or clearly say the local LLM is disabled — never silent fallback.
 *
 * Acceptance:
 *  S1 composeCommanderPrompt is the single source: system + prompt carry ALL commander realism rules
 *  S2 the prompt includes objective / objective-country-zone / terrain-zone / force-pool(+country) /
 *     allowed_unit_ids / output schema with why_unit + non_selected_units (unit-selection reasoning)
 *  S3 planCoas attaches mcp_prompt + mcp_prompt_version + llm_enabled to the plan
 *  S4 _callLlm sends the MCP prompt VERBATIM (system + prompt) when one is threaded
 *  S5 normalizeCoa preserves non_selected_units (why other units were not moved)
 *  C1 manual Generate forces opts.useLlm=true and ai_depth normal (never fast)
 *  C2 AI execution disabled (allow_sim_run=false) → no cards + "AI execution is disabled. Enable RMOOZ_ALLOW_SIM_RUN=1."
 *  C3 gate diagnostics include LLM enabled + MCP prompt pack version (+ provider/model/status/source)
 *  C4 "View MCP Prompt" renders the system + prompt + commander instructions (proof of MCP routing)
 *  C5 a real LLM plan renders cards (no gate) and exposes View MCP Prompt + diagnostics
 */
'use strict';
var assert = require('assert');
var path = require('path');

var elements = {};
function makeEl(t) {
    return { tagName: t, id: '', className: '', innerHTML: '', textContent: '', children: [], attrs: {}, style: {},
        appendChild: function (e) { this.children.push(e); if (e.id) elements[e.id] = e; return e; },
        setAttribute: function () {}, removeAttribute: function () {}, addEventListener: function () {},
        querySelector: function () { return null; }, querySelectorAll: function () { return []; } };
}
global.document = { body: makeEl('body'), head: makeEl('head'), createElement: makeEl, getElementById: function (id) { return elements[id] || null; } };
global.window = {}; global.window.document = global.document;

var UI = path.join(__dirname, 'UI_MOdified');
var CLIENT = path.join(UI, 'client', 'shell'), AI = path.join(UI, 'server', 'ai');
require(path.join(CLIENT, 'world-state-db.js'));
require(path.join(CLIENT, 'symbol-db.js'));
require(path.join(CLIENT, 'symbol-registry.js'));
require(path.join(CLIENT, 'free-fight-demo.js'));
var FF = global.window.RmoozFreeFightDemo;

var P = require(path.join(AI, 'free-fight-coa-planner.js'));
var C = require(path.join(AI, 'rmooz-ai-tool-contract.js'));

var pass = 0, fail = 0;
function ok(n) { pass++; console.log('  ✓ ' + n); }
function bad(n, e) { fail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }

// Multi-country force vs a Qatar objective (the unrealistic-movement case).
var UNITS = [
    { id: 'R-1', side: 'RED', country: 'Saudi Arabia', lat: 24.80, lon: 54.90, platform: 'armor' },
    { id: 'R-2', side: 'RED', country: 'Qatar', lat: 25.20, lon: 51.20, platform: 'infantry' },
    { id: 'R-3', side: 'RED', country: 'Iran', lat: 26.50, lon: 53.50, platform: 'strike_aircraft' },
    { id: 'B-1', side: 'BLUE', country: 'Qatar', lat: 25.30, lon: 51.55, platform: 'fighter' },
];
var OBJ = [{ lat: 25.28, lon: 51.53, name: 'Doha Approach' }];

async function main() {
    // ── server: compose the MCP commander prompt from a real tool pack ──
    var pack = await C.buildCommanderPromptPack({ units: UNITS, objectives: OBJ, context: { active_side: 'RED', defending_side: 'BLUE' }, opts: {} });
    var composed = C.composeCommanderPrompt(pack, {
        objective: OBJ[0], commander_mode: 'high_variation', active_side: 'RED',
        terrain_zone_context: { gis: { owner_country: 'Qatar', terrain_class: 'coastal' } },
        allowed_tactical_actions: ['recon', 'flank', 'attack', 'hold', 'withdraw'],
        previous_coa_families: [],
    });

    // S1 — all commander realism rules present (single source).
    try {
        assert(Array.isArray(C.MCP_COMMANDER_INSTRUCTIONS) && C.MCP_COMMANDER_INSTRUCTIONS.length >= 8, 'MCP_COMMANDER_INSTRUCTIONS exported');
        var blob = composed.system + ' ' + composed.prompt;
        [
            /think like a commander/i,
            /do not move all units/i,
            /select only the units relevant to the objective/i,
            /nearby.*ready.*supplied|ready.*supplied/i,
            /country.*sovereign zone|sovereign zone/i,
            /threat rings/i, /corridor/i, /choke/i,
            /do not force a full attack/i,
            /do not move units from all countries/i,
            /why_unit|why each selected unit/i,
            /non_selected_units|why the others are not moved|why .* not moved/i,
            /only.*json/i,
        ].forEach(function (re, i) { assert(re.test(blob), 'commander rule present #' + i + ' (' + re + ')'); });
        ok('S1 composeCommanderPrompt carries ALL commander realism rules (single source)');
    } catch (e) { bad('S1 composeCommanderPrompt carries ALL commander realism rules', e); }

    // S2 — objective / country-zone / terrain / force-pool(+country) / allowed ids / schema reasoning.
    try {
        var pj = JSON.parse(composed.prompt);
        assert(pj.objective && pj.objective.name === 'Doha Approach', 'objective present');
        assert(pj.objective_country_zone, 'objective_country_zone present');
        assert(pj.terrain_zone_context && pj.terrain_zone_context.gis, 'terrain_zone_context present');
        assert(Array.isArray(pj.force_pool) && pj.force_pool.length === 4, 'force_pool present (4 units)');
        assert(pj.force_pool.every(function (u) { return 'country' in u; }), 'force_pool units carry country');
        assert(Array.isArray(pj.allowed_unit_ids) && pj.allowed_unit_ids.length, 'allowed_unit_ids present');
        var act0 = pj.required_output_schema.coas[0].phases[0].actions[0];
        assert('why_unit' in act0, 'schema action has why_unit');
        assert(pj.required_output_schema.coas[0].non_selected_units, 'schema has non_selected_units');
        ok('S2 prompt includes objective / country-zone / terrain / force-pool(+country) / allowed ids / selection schema');
    } catch (e) { bad('S2 prompt includes objective / country-zone / terrain / force-pool / schema', e); }

    // S3 — planCoas attaches mcp_prompt + version + llm_enabled.
    try {
        var plan = await P.planCoas(UNITS, OBJ, { active_side: 'RED', commander_mode: 'high_variation' }, { commander_mode: 'high_variation', useLlm: true });
        assert(plan.mcp_prompt && plan.mcp_prompt.system && plan.mcp_prompt.prompt, 'plan.mcp_prompt attached');
        assert(plan.mcp_prompt_version === C.TOOL_CONTRACT_VERSION, 'mcp_prompt_version stamped');
        assert(typeof plan.llm_enabled === 'boolean', 'llm_enabled present (' + plan.llm_enabled + ')');
        assert(plan.mcp_prompt.force_pool_count === 4, 'force pool count carried');
        ok('S3 planCoas attaches mcp_prompt + mcp_prompt_version + llm_enabled');
    } catch (e) { bad('S3 planCoas attaches mcp_prompt + mcp_prompt_version + llm_enabled', e); }

    // S4 — _callLlm sends the MCP prompt VERBATIM when threaded.
    try {
        var captured = null;
        var fakeProvider = { generate: function (req) { captured = req; return Promise.resolve({ ok: false, error: 'capture-only' }); } };
        var mcp = { system: 'MCP-SYS-SENTINEL think like a commander', prompt: JSON.stringify({ sentinel: 'MCP-PROMPT-SENTINEL', allowed_unit_ids: ['R-1', 'R-2'] }), allowed_unit_ids: ['R-1', 'R-2'] };
        await P._callLlmForTest(UNITS, OBJ, { active_side: 'RED', commander_mode: 'high_variation', _mcp_prompt: mcp }, { allowed_unit_ids: ['R-1', 'R-2'] }, fakeProvider);
        assert(captured && captured.system === mcp.system, 'system sent verbatim from MCP');
        assert(captured.prompt === mcp.prompt, 'prompt sent verbatim from MCP');
        ok('S4 _callLlm sends the MCP prompt VERBATIM (system + prompt) when threaded');
    } catch (e) { bad('S4 _callLlm sends the MCP prompt VERBATIM when threaded', e); }

    // S5 — normalizeCoa preserves non_selected_units.
    try {
        var coa = P.normalizeCoa({
            plan_id: 'COA-1', title: 'x',
            phases: [{ phase_id: 'p', name: 'm', actions: [{ unit_uid: 'R-1', side: 'RED', action_type: 'recon', target: { lat: 25, lon: 51 } }] }],
            non_selected_units: [{ unit_uid: 'R-3', reason: 'too distant (Iran) — no military reason to commit' }, { bad: 1 }],
        }, ['R-1', 'R-3']);
        assert(coa && Array.isArray(coa.non_selected_units) && coa.non_selected_units.length === 1, 'non_selected_units preserved + cleaned');
        assert(coa.non_selected_units[0].unit_uid === 'R-3' && /distant/.test(coa.non_selected_units[0].reason), 'non_selected reason kept');
        ok('S5 normalizeCoa preserves non_selected_units (why other units were not moved)');
    } catch (e) { bad('S5 normalizeCoa preserves non_selected_units', e); }

    // ── client ──
    global.window.RmoozScenario = { scenario: {
        red_units: UNITS.filter(function (u) { return u.side === 'RED'; }).map(function (u) { return { id: u.id, side: u.side, country: u.country, lat: u.lat, lon: u.lon, coord: [u.lon, u.lat] }; }),
        blue_units_initial: UNITS.filter(function (u) { return u.side === 'BLUE'; }).map(function (u) { return { id: u.id, side: u.side, country: u.country, lat: u.lat, lon: u.lon, coord: [u.lon, u.lat] }; }),
        objectives: OBJ,
    } };

    // C1 — manual Generate forces useLlm=true + ai_depth normal (never fast).
    try {
        var capturedBody = null;
        global.window.fetch = function (url, opts) { capturedBody = opts && opts.body; return { then: function () { return { then: function () { return { catch: function () {} }; }, catch: function () {} }; }, catch: function () {} }; };
        FF._setAiDepthForTest('fast'); // even if the operator left depth on Fast…
        try { FF._generateCoaPlanForTest(); } catch (_) {}
        var body = JSON.parse(capturedBody);
        assert(body.opts.useLlm === true, 'manual button forces opts.useLlm=true');
        assert(body.opts.ai_depth === 'normal', 'manual button forces ai_depth off fast → normal (got ' + body.opts.ai_depth + ')');
        FF._setAiDepthForTest('normal');
        ok('C1 manual Generate forces opts.useLlm=true and ai_depth normal (never fast)');
    } catch (e) { bad('C1 manual Generate forces useLlm=true and not fast', e); }

    // C2 — AI execution disabled → no cards + the enable-instructions message (single gate).
    try {
        var disabledPlan = { ok: true, plan_source: 'deterministic_diverse_coa', llm_called: false, llm_status: null,
            fallback_reason: null, provider_used: null, model_used: null, ai_depth: 'normal', commander_mode: 'high_variation',
            allow_sim_run: false, llm_enabled: false, mcp_prompt_version: C.TOOL_CONTRACT_VERSION, coas: [{ plan_id: 'COA-1', title: 'x', phases: [{ actions: [{ unit_uid: 'R-1', action_type: 'recon' }] }] }],
            _requestedVia: 'manual_generate' };
        var html = FF._renderCoaPlanHtmlForTest(disabledPlan);
        assert(/AI execution is disabled\. Enable RMOOZ_ALLOW_SIM_RUN=1\./.test(html), 'shows the enable-RMOOZ_ALLOW_SIM_RUN instructions');
        assert(!/data-act="select-coa-/.test(html) && !/data-act="apply-coa"/.test(html), 'no COA cards');
        assert(/No AI result generated\./.test(html), 'shows "No AI result generated."');
        assert(html.indexOf('RMOOZ_FREE_FIGHT' + '_LLM') === -1, 'no mention of the old (deprecated) free-fight flag');
        ok('C2 AI execution disabled → no cards + "AI execution is disabled. Enable RMOOZ_ALLOW_SIM_RUN=1."');
    } catch (e) { bad('C2 AI execution disabled → no cards + enable instructions', e); }

    // C3 — gate diagnostics include the single gate (RMOOZ_ALLOW_SIM_RUN) + MCP prompt pack version.
    try {
        var diagPlan = { ok: true, plan_source: 'deterministic_diverse_coa', llm_called: true, llm_status: 'unavailable',
            fallback_reason: 'llm_failed', provider_used: null, model_used: null, ai_depth: 'normal', commander_mode: 'high_variation',
            allow_sim_run: true, llm_enabled: true, mcp_prompt_version: 'rmooz-ai-tool-contract/1.0', coas: [{ plan_id: 'COA-1', phases: [{ actions: [{ unit_uid: 'R-1', action_type: 'recon' }] }] }],
            _requestedVia: 'manual_generate' };
        var html3 = FF._renderCoaPlanHtmlForTest(diagPlan);
        ['AI execution (RMOOZ_ALLOW_SIM_RUN)', 'provider_used', 'model_used', 'plan_source', 'llm_called', 'llm_status', 'fallback_reason', 'MCP prompt pack', 'commander_mode', 'ai_depth'].forEach(function (k) {
            assert(html3.indexOf(k) !== -1, 'diagnostic present: ' + k);
        });
        assert(/rmooz-ai-tool-contract\/1\.0/.test(html3), 'MCP prompt pack version shown');
        ok('C3 gate diagnostics include AI execution (RMOOZ_ALLOW_SIM_RUN) + MCP prompt pack version');
    } catch (e) { bad('C3 gate diagnostics include AI execution + MCP prompt pack version', e); }

    // C4 — "View MCP Prompt" renders the system + prompt + commander instructions.
    try {
        var planWithPrompt = { ok: true, plan_source: 'deterministic_diverse_coa', llm_called: false, llm_enabled: false,
            ai_depth: 'normal', commander_mode: 'high_variation', mcp_prompt_version: C.TOOL_CONTRACT_VERSION,
            mcp_prompt: composed, coas: [{ plan_id: 'COA-1', phases: [{ actions: [{ unit_uid: 'R-1', action_type: 'recon' }] }] }],
            _requestedVia: 'manual_generate' };
        var collapsed = FF._renderCoaPlanHtmlForTest(planWithPrompt);
        assert(/data-act="view-mcp-prompt"/.test(collapsed), 'View MCP Prompt button present');
        FF._setMcpPromptExpandedForTest(true);
        var expanded = FF._renderCoaPlanHtmlForTest(planWithPrompt);
        assert(/data-ff-coa="mcp-prompt"/.test(expanded), 'expanded MCP prompt block present');
        assert(/commander instructions/i.test(expanded) && /Think like a commander/.test(expanded), 'shows commander instructions');
        assert(/system \(commander instruction\)/i.test(expanded) && /force_pool/.test(expanded), 'shows system + the user prompt');
        FF._setMcpPromptExpandedForTest(false);
        ok('C4 "View MCP Prompt" renders the system + prompt + commander instructions (proof of MCP routing)');
    } catch (e) { bad('C4 "View MCP Prompt" renders the MCP prompt', e); }

    // C5 — real LLM plan renders cards (no gate) + exposes View MCP Prompt.
    try {
        var realPlan = { ok: true, plan_source: 'llm', llm_called: true, llm_status: 'ok', fallback_reason: null,
            provider_used: 'ollama', model_used: 'qwen3-coder:latest', ai_depth: 'normal', commander_mode: 'high_variation',
            llm_enabled: true, variation_seed: 1, mcp_prompt_version: C.TOOL_CONTRACT_VERSION, mcp_prompt: composed,
            recommended_plan_id: 'COA-1', coas: [{ plan_id: 'COA-1', title: 'Recon', coa_family: 'cautious_recon', recommended: true,
                risk: 'low', confidence: 'high', units_total_considered: 4, units_selected_count: 2, role_breakdown: { recon: 2 },
                phases: [{ phase_id: 'p1', name: 'Move', actions: [{ unit_uid: 'R-2', side: 'RED', role: 'recon', action_type: 'recon', execution_mode: 'recon_standoff_target', target: { lat: 25.2, lon: 51.3 } }] }] }],
            _requestedVia: 'manual_generate' };
        var htmlR = FF._renderCoaPlanHtmlForTest(realPlan);
        assert(/data-act="select-coa-0"/.test(htmlR), 'real LLM → cards render');
        assert(!/No AI result generated/.test(htmlR), 'real LLM → no gate message');
        assert(/data-act="view-mcp-prompt"/.test(htmlR), 'real LLM → View MCP Prompt available');
        ok('C5 real LLM plan renders cards (no gate) + exposes View MCP Prompt + diagnostics');
    } catch (e) { bad('C5 real LLM plan renders cards + exposes View MCP Prompt', e); }

    console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-ai-attack-plan-mcp-prompt-a.js)');
    process.exit(fail === 0 ? 0 : 1);
}
main().catch(function (e) { console.error('FATAL', e); process.exit(1); });
