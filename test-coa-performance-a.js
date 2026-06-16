/**
 * test-coa-performance-a.js — RMOOZ-AI-COA-PERFORMANCE-A
 *
 * Performance/optimization acceptance tests for the Free Fight COA planner:
 *  1  planCoas returns plan.debug_timing with total_ms + the named stage spans
 *  2  NO duplicate capability analyst call — analyzeUnitCapabilities runs exactly once
 *     per planCoas (the tool pack reuses the precomputed profiles)
 *  3  getCapabilityIntelTool reuses _precomputed_profiles (profile_reused=true, no analyst run)
 *  4  fast depth: heuristic capability, NO LLM, still produces valid diverse COAs
 *  5  Generate-5 (planCoaVariations) builds ONE shared context — analyst runs ONCE for 5 seeds
 *  6  Generate-5 non-deep produces genuine variation and calls NO LLM per seed
 *  7  timeout/fallback: a slow/unavailable LLM falls back + sets the honest fallback_message
 *  8  no tactical freedom / terrain behavior removed — archetypes + terrain reasoning intact
 *  9  ai_depth is echoed on the plan; controlled mode still uses the doctrine builder
 */
'use strict';
var assert = require('assert');
var path = require('path');
var PLANNER_PATH = path.join(__dirname, 'UI_MOdified/server/ai/free-fight-coa-planner.js');
var CONTRACT_PATH = path.join(__dirname, 'UI_MOdified/server/ai/rmooz-ai-tool-contract.js');
var ANALYST_PATH = path.join(__dirname, 'UI_MOdified/server/ai/free-fight-llm-capability-analyst.js');
var P = require(PLANNER_PATH);
var TC = require(CONTRACT_PATH);
var ANALYST = require(ANALYST_PATH);

var pass = 0, fail = 0;
function ok(n) { pass++; console.log('  ✓ ' + n); }
function bad(n, e) { fail++; console.log('  ✗ ' + n + (e ? (' — ' + (e && e.message || e)) : '')); }

// Spy on the SHARED analyst module — both the planner (ANALYST.analyzeUnitCapabilities)
// and the tool contract (analyst.analyzeUnitCapabilities) read this property at call time,
// so one count covers every path in a request.
var _origAnalyze = ANALYST.analyzeUnitCapabilities;
var _analyzeCalls = 0;
// RMOOZ-AI-SPEED-ARCHITECTURE-J: clear the new cross-turn capability cache so call-count assertions
// see a COLD cache (otherwise a warm cache correctly makes the analyst run 0× — a separate behavior).
function spyOn() { _analyzeCalls = 0; if (P._clearPerfCacheForTest) P._clearPerfCacheForTest(); ANALYST.analyzeUnitCapabilities = function () { _analyzeCalls++; return _origAnalyze.apply(this, arguments); }; }
function spyOff() { ANALYST.analyzeUnitCapabilities = _origAnalyze; }

var UNITS = [
    { uid: 'R-1', side: 'RED', role: 'armor', lat: 24.50, lon: 54.58, coord: [54.58, 24.50] },
    { uid: 'R-2', side: 'RED', role: 'infantry', lat: 24.46, lon: 54.52, coord: [54.52, 24.46] },
    { uid: 'R-3', side: 'RED', role: 'strike_aircraft', lat: 24.55, lon: 54.62, coord: [54.62, 24.55] },
    { uid: 'B-1', side: 'BLUE', role: 'fighter', lat: 24.30, lon: 54.30, coord: [54.30, 24.30] },
    { uid: 'B-2', side: 'BLUE', role: 'sam', lat: 24.34, lon: 54.40, coord: [54.40, 24.34] },
];
var OBJ = [{ lat: 24.50, lon: 54.30, name: 'Abu Dhabi' }];

function planOpts(extra) {
    return Object.assign({ preferSide: 'RED', useLlm: false, commander_mode: 'high_variation' }, extra || {});
}
function planCtx(extra) {
    return Object.assign({ active_side: 'RED', commander_mode: 'high_variation' }, extra || {});
}

async function main() {
    // 1 — debug_timing present with total_ms + named spans.
    try {
        var p1 = await P.planCoas(UNITS, OBJ, planCtx(), planOpts());
        assert(p1 && p1.ok, 'plan ok');
        assert(p1.debug_timing && typeof p1.debug_timing === 'object', 'debug_timing present');
        assert(Number.isFinite(p1.debug_timing.total_ms), 'total_ms is a number');
        ['build_scenario_intel_ms', 'tactical_terrain_context_ms', 'analyze_unit_capabilities_ms',
         'build_commander_prompt_pack_ms', 'build_diverse_coas_ms'].forEach(function (k) {
            assert(Number.isFinite(p1.debug_timing[k]), 'timing span present: ' + k);
        });
        ok('planCoas returns debug_timing with total_ms + the named stage spans');
    } catch (e) { bad('planCoas returns debug_timing with total_ms + the named stage spans', e); }

    // 2 — no duplicate capability analyst call (exactly once per planCoas).
    try {
        spyOn();
        await P.planCoas(UNITS, OBJ, planCtx(), planOpts());
        spyOff();
        assert.strictEqual(_analyzeCalls, 1, 'analyzeUnitCapabilities called exactly once, got ' + _analyzeCalls);
        ok('NO duplicate capability analyst call — analyzeUnitCapabilities runs exactly once');
    } catch (e) { spyOff(); bad('NO duplicate capability analyst call — analyzeUnitCapabilities runs exactly once', e); }

    // 3 — getCapabilityIntelTool reuses precomputed profiles (no analyst run).
    try {
        var profiles = await ANALYST.analyzeUnitCapabilities(UNITS, { active_side: 'RED', defending_side: 'BLUE' }, { useLlm: false });
        spyOn();
        var capEnv = await TC.getCapabilityIntelTool({
            units: UNITS, objectives: OBJ, context: { defending_side: 'BLUE', active_side: 'RED' },
            opts: { _precomputed_profiles: profiles },
        });
        spyOff();
        assert(capEnv && capEnv.ok, 'capability envelope ok');
        assert(capEnv.data.profile_reused === true, 'profile_reused flagged true');
        assert.strictEqual(_analyzeCalls, 0, 'analyst NOT re-run when profiles are precomputed, got ' + _analyzeCalls);
        ok('getCapabilityIntelTool reuses _precomputed_profiles (no analyst run)');
    } catch (e) { spyOff(); bad('getCapabilityIntelTool reuses _precomputed_profiles (no analyst run)', e); }

    // 4 — fast depth: heuristic capability, NO LLM, still valid diverse COAs.
    try {
        var prevEnv = process.env.RMOOZ_ALLOW_SIM_RUN;
        process.env.RMOOZ_ALLOW_SIM_RUN = '1'; // even with the LLM "enabled", fast must skip it
        var pf = await P.planCoas(UNITS, OBJ, planCtx(), planOpts({ ai_depth: 'fast', useLlm: true }));
        process.env.RMOOZ_ALLOW_SIM_RUN = prevEnv;
        assert(pf.ok && pf.ai_depth === 'fast', 'fast depth echoed');
        assert(pf.llm_called === false, 'fast depth does NOT call the LLM');
        assert(Array.isArray(pf.coas) && pf.coas.length >= 3, 'fast still yields >=3 COAs');
        assert(pf.plan_source === 'deterministic_diverse_coa', 'fast uses the diverse deterministic builder');
        ok('fast depth: heuristic capability, NO LLM, still produces valid diverse COAs');
    } catch (e) { bad('fast depth: heuristic capability, NO LLM, still produces valid diverse COAs', e); }

    // 5 — Generate-5 builds ONE shared context: analyst runs ONCE for 5 seeds.
    try {
        spyOn();
        var v = await P.planCoaVariations(UNITS, OBJ, planCtx(), planOpts({ variation_seeds: [0, 1, 2, 3, 4] }));
        spyOff();
        assert(v && v.ok, 'variations ok');
        assert.strictEqual(v.variations.length, 5, 'returns 5 variations');
        assert.strictEqual(_analyzeCalls, 1, 'analyst runs ONCE for all 5 seeds (shared context), got ' + _analyzeCalls);
        assert(v.shared_context === true, 'shared_context flag set');
        assert(v.shared_debug_timing && Number.isFinite(v.shared_debug_timing.build_commander_prompt_pack_ms), 'shared tool-pack timing present');
        ok('Generate-5 builds ONE shared context — analyst runs ONCE for 5 seeds (not 5×)');
    } catch (e) { spyOff(); bad('Generate-5 builds ONE shared context — analyst runs ONCE for 5 seeds (not 5×)', e); }

    // 6 — Generate-5 non-deep: genuine variation + NO LLM per seed (even with LLM enabled).
    try {
        var prevEnv6 = process.env.RMOOZ_ALLOW_SIM_RUN;
        process.env.RMOOZ_ALLOW_SIM_RUN = '1';
        var v6 = await P.planCoaVariations(UNITS, OBJ, planCtx(), planOpts({ variation_seeds: [0, 1, 2, 3, 4], useLlm: true, ai_depth: 'normal' }));
        process.env.RMOOZ_ALLOW_SIM_RUN = prevEnv6;
        var noLlm = v6.variations.every(function (x) { return x.llm_called === false; });
        assert(noLlm, 'non-deep Generate-5 calls NO LLM per seed');
        var fams = {}, leads = {};
        v6.variations.forEach(function (x) {
            var rec = x.coas.filter(function (c) { return c.recommended; })[0] || x.coas[0] || {};
            fams[rec.coa_family || rec.title || '?'] = 1;
            var a = (rec.phases && rec.phases[0] && rec.phases[0].actions && rec.phases[0].actions[0]) || {};
            leads[(a.action_type || '?') + '/' + (a.unit_uid || '?')] = 1;
        });
        assert(Object.keys(fams).length > 1 || Object.keys(leads).length > 1, 'variation across seeds (family or lead changed)');
        ok('Generate-5 non-deep produces genuine variation and calls NO LLM per seed');
    } catch (e) { bad('Generate-5 non-deep produces genuine variation and calls NO LLM per seed', e); }

    // 7 — timeout/fallback: slow/unavailable LLM → deterministic fallback + honest message.
    try {
        var prevEnv7 = process.env.RMOOZ_ALLOW_SIM_RUN;
        var prevTo = process.env.RMOOZ_FREE_FIGHT_TIMEOUT_MS;
        process.env.RMOOZ_ALLOW_SIM_RUN = '1';
        process.env.RMOOZ_FREE_FIGHT_TIMEOUT_MS = '300'; // fail fast — no local provider in CI
        var p7 = await P.planCoas(UNITS, OBJ, planCtx(), planOpts({ useLlm: true, ai_depth: 'normal' }));
        process.env.RMOOZ_ALLOW_SIM_RUN = prevEnv7;
        process.env.RMOOZ_FREE_FIGHT_TIMEOUT_MS = prevTo;
        assert(p7.llm_called === true, 'LLM was attempted');
        // No real local LLM available → must fall back to the deterministic floor.
        assert(p7.plan_source !== 'llm', 'fell back off the LLM path');
        // RMOOZ-AI-SPEED-ARCHITECTURE-J: wording changed by RMOOZ-AI-COMMANDER-REPAIR-LOOP-A (commit
        // 4af0fdc) from "fast tactical planner" → "Staff-Safe planner"; accept either (drift fix).
        assert(typeof p7.fallback_message === 'string' && /fast tactical planner|staff-safe planner/i.test(p7.fallback_message),
            'honest fallback_message set: ' + p7.fallback_message);
        assert(Array.isArray(p7.coas) && p7.coas.length >= 3, 'fallback still produced COAs');
        ok('timeout/fallback: slow/unavailable LLM falls back + sets the honest fallback_message');
    } catch (e) { bad('timeout/fallback: slow/unavailable LLM falls back + sets the honest fallback_message', e); }

    // 8 — no tactical freedom / terrain behavior removed.
    try {
        var p8 = await P.planCoas(UNITS, OBJ, planCtx(), planOpts());
        var families = p8.coas.map(function (c) { return c.coa_family; });
        ['cautious_recon', 'maneuver_deception', 'direct_action'].forEach(function (f) {
            assert(families.indexOf(f) !== -1, 'archetype present: ' + f);
        });
        // terrain reasoning still attached to actions (terrain_basis / deciding_factor present).
        var anyTerrain = p8.coas.some(function (c) {
            return (c.phases[0].actions || []).some(function (a) {
                return Array.isArray(a.terrain_basis) || (typeof a.deciding_factor === 'string' && a.deciding_factor);
            });
        });
        assert(anyTerrain, 'terrain reasoning (terrain_basis/deciding_factor) preserved on actions');
        assert(p8.terrain_context && typeof p8.terrain_context === 'object', 'plan.terrain_context preserved');
        ok('no tactical freedom / terrain behavior removed — archetypes + terrain reasoning intact');
    } catch (e) { bad('no tactical freedom / terrain behavior removed — archetypes + terrain reasoning intact', e); }

    // 9 — ai_depth echoed; controlled mode still uses the doctrine builder.
    try {
        var p9a = await P.planCoas(UNITS, OBJ, planCtx(), planOpts({ ai_depth: 'deep' }));
        assert(p9a.ai_depth === 'deep', 'ai_depth echoed (deep)');
        var p9b = await P.planCoas(UNITS, OBJ, planCtx({ commander_mode: 'controlled' }), planOpts({ commander_mode: 'controlled' }));
        assert(p9b.commander_mode === 'controlled', 'controlled mode echoed');
        assert(p9b.plan_source === 'deterministic_coa_fallback', 'controlled uses the doctrine builder (not diverse)');
        ok('ai_depth echoed; controlled mode still uses the doctrine builder');
    } catch (e) { bad('ai_depth echoed; controlled mode still uses the doctrine builder', e); }

    console.log('\n' + (fail === 0 ? '✅ ' : '❌ ') + pass + ' passed, ' + fail + ' failed (test-coa-performance-a.js)');
    process.exit(fail === 0 ? 0 : 1);
}

main().catch(function (e) { console.error('FATAL', e); process.exit(1); });
