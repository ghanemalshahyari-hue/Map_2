/**
 * RMOOZ-BEHAVIOR-E2E-A — end-to-end behavior contract integration test
 *
 * Injects a mock LLM provider returning target-only COA actions (no behavior fields)
 * through _providerOverride, then verifies:
 *   1. planCoas returns plan_source='llm' (server normalizer lets it pass)
 *   2. All MOVE actions have behavior / domain / movement_mode / waypoint_policy
 *   3. Aircraft action has domain=air, waypoint_policy≠direct_step
 *   4. HOLD actions are tolerated without behavior fields
 *
 * Run: node test-free-fight-behavior-e2e-a.js  (no server needed)
 */
'use strict';

var path = require('path');
var PLANNER = require(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-coa-planner.js'));

// ── Test harness ──────────────────────────────────────────────────────────────
var PASS = 0, FAIL = 0, ERRORS = [];
function test(name, fn) {
    try { fn(); console.log('  PASS  ' + name); PASS++; }
    catch (e) { console.error('  FAIL  ' + name + '\n         ' + e.message); ERRORS.push({ name, msg: e.message }); FAIL++; }
}
function ok(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { if (a !== b) throw new Error(msg || ('expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a))); }

// ── Fixtures ──────────────────────────────────────────────────────────────────

var OBJ_LAT = 28.2, OBJ_LON = 45.2;
// Units within 0.10° of obj (below SAFE_STEP_DEG=0.15 and CAP=0.10 in _clampLlmTargets)
var UNITS = [
    { id: 'G1', unit_uid: 'G1', name: 'Tank Btn',  sidc: 'SFGPUCA----', lat: 28.21, lon: 45.21, side: 'RED', role: 'armor'   },
    { id: 'G2', unit_uid: 'G2', name: 'Mech Inf',  sidc: 'SFGPUCI----', lat: 28.19, lon: 45.19, side: 'RED', role: 'infantry' },
    { id: 'A1', unit_uid: 'A1', name: 'F-16 Sqn',  sidc: 'SFAPCA-----', lat: 28.22, lon: 45.20, side: 'RED', role: 'fighter' },
    { id: 'G3', unit_uid: 'G3', name: 'Reserve',   sidc: 'SFGPUCI----', lat: 28.18, lon: 45.22, side: 'RED', role: 'infantry' },
];
var OBJECTIVES = [{ id: 'OBJ-1', name: 'Objective X', lat: OBJ_LAT, lon: OBJ_LON }];

// Target-only (legacy) LLM JSON — NO behavior fields on MOVE actions
var MOCK_LLM_RESPONSE = JSON.stringify({
    coas: [
        {
            plan_id: 'COA-1', title: 'Direct Assault', coa_family: 'direct_action',
            objective_id: 'OBJ-1', summary: 'All assault', recommended: true,
            risk: 'high', confidence: 'medium',
            units_total_considered: 4, units_selected_count: 3,
            phases: [{
                phase_id: 'phase-1', name: 'Move',
                actions: [
                    // No behavior/domain/movement_mode/waypoint_policy — target-only legacy format
                    { unit_uid: 'G1', side: 'RED', role: 'assault', action_type: 'MOVE_TOWARD_OBJECTIVE',
                      target: { lat: 28.2, lon: 45.2, type: 'objective' }, reason: 'attack', why_unit: 'closest', deciding_factor: 'proximity', roe_status: 'allowed', taskable: true },
                    { unit_uid: 'A1', side: 'RED', role: 'assault', action_type: 'MOVE_TOWARD_OBJECTIVE',
                      target: { lat: 28.2, lon: 45.2, type: 'objective' }, reason: 'air support', why_unit: 'air asset', deciding_factor: 'air cover', roe_status: 'allowed', taskable: true },
                    { unit_uid: 'G3', side: 'RED', role: 'reserve', action_type: 'HOLD_POSITION',
                      reason: 'hold', roe_status: 'restricted', taskable: false },
                ],
            }],
            non_selected_units: [{ unit_uid: 'G2', reason: 'reserve' }],
            risks: ['exposure'], assumptions: ['enemy weak'],
        },
        {
            plan_id: 'COA-2', title: 'Flank', coa_family: 'maneuver_deception',
            objective_id: 'OBJ-1', summary: 'Flank', recommended: false,
            risk: 'medium', confidence: 'medium',
            units_total_considered: 4, units_selected_count: 2,
            phases: [{
                phase_id: 'phase-1', name: 'Move',
                actions: [
                    { unit_uid: 'G2', side: 'RED', role: 'assault', action_type: 'MOVE_TOWARD_OBJECTIVE',
                      target: { lat: 28.21, lon: 45.21, type: 'objective' }, reason: 'flank', why_unit: 'mobile', deciding_factor: 'terrain', roe_status: 'allowed', taskable: true },
                    { unit_uid: 'G1', side: 'RED', role: 'support',  action_type: 'SUPPORT_BY_FIRE',
                      target: { lat: 28.19, lon: 45.19, type: 'coord' }, reason: 'support', why_unit: 'firepower', deciding_factor: 'line of sight', roe_status: 'allowed', taskable: true },
                ],
            }],
            non_selected_units: [],
            risks: ['coordination'], assumptions: [],
        },
    ],
});

// Mock provider: immediately returns the pre-baked JSON
var mockProvider = {
    generate: function () {
        return Promise.resolve({ ok: true, response: MOCK_LLM_RESPONSE });
    },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\nRMOOZ-BEHAVIOR-E2E-A\n');

(async function () {
    var result = await PLANNER.planCoas(UNITS, OBJECTIVES, {
        active_side: 'RED',
        ai_depth: 'normal',
        commander_mode: 'controlled',
        repair: true,
    }, {
        useLlm: true,
        preferSide: 'RED',
        ai_depth: 'normal',
        allowed_unit_ids: UNITS.map(function (u) { return u.id; }),
        _providerOverride: mockProvider,
    });

    // T-1: LLM path was taken (server normalizer let it pass validator)
    test('T-1: plan_source=llm (normalizer + validator accepted the plan)', function () {
        eq(result.plan_source, 'llm', 'plan_source should be llm, got: ' + result.plan_source + (result._error ? ' | error: ' + result._error : ''));
    });

    test('T-2: ok=true', function () {
        ok(result.ok === true, 'ok should be true; got: ' + JSON.stringify(result.ok) + (result._error ? ' | ' + result._error : ''));
    });

    // T-3: Returned COAs have behavior fields on MOVE actions
    test('T-3: COA-1 ground MOVE action has behavior field', function () {
        var coa = (result.coas || []).find(function (c) { return c.plan_id === 'COA-1'; });
        ok(coa, 'COA-1 present');
        var act = (coa.phases[0].actions || []).find(function (a) { return a.unit_uid === 'G1'; });
        ok(act, 'G1 action found');
        ok(act.behavior, 'behavior set on G1 action; got: ' + act.behavior);
        ok(act.domain, 'domain set; got: ' + act.domain);
        ok(act.movement_mode, 'movement_mode set; got: ' + act.movement_mode);
        ok(act.waypoint_policy, 'waypoint_policy set; got: ' + act.waypoint_policy);
    });

    // T-4: Aircraft action got air domain + correct waypoint_policy
    test('T-4: aircraft (A1) has domain=air and waypoint_policy≠direct_step', function () {
        var coa = (result.coas || []).find(function (c) { return c.plan_id === 'COA-1'; });
        ok(coa, 'COA-1 present');
        var act = (coa.phases[0].actions || []).find(function (a) { return a.unit_uid === 'A1'; });
        ok(act, 'A1 action found');
        eq(act.domain, 'air', 'aircraft domain=air; got: ' + act.domain);
        eq(act.movement_mode, 'air', 'aircraft movement_mode=air; got: ' + act.movement_mode);
        ok(act.waypoint_policy !== 'direct_step', 'aircraft waypoint_policy≠direct_step; got: ' + act.waypoint_policy);
        ok(act.waypoint_policy === 'patrol_loop' || act.waypoint_policy === 'orbit',
            'aircraft policy should be patrol_loop or orbit; got: ' + act.waypoint_policy);
    });

    // T-5: HOLD action is preserved without behavior check blocking it
    test('T-5: HOLD_POSITION action (G3) is kept in plan', function () {
        var coa = (result.coas || []).find(function (c) { return c.plan_id === 'COA-1'; });
        ok(coa, 'COA-1 present');
        var act = (coa.phases[0].actions || []).find(function (a) { return a.unit_uid === 'G3'; });
        ok(act, 'G3 HOLD action preserved');
    });

    // T-6: COA-2 ground support action has behavior fields
    test('T-6: COA-2 support action (G1) has behavior fields after normalization', function () {
        var coa = (result.coas || []).find(function (c) { return c.plan_id === 'COA-2'; });
        ok(coa, 'COA-2 present');
        var act = (coa.phases[0].actions || []).find(function (a) { return a.unit_uid === 'G1'; });
        ok(act, 'G1 support action found');
        ok(act.behavior, 'behavior set; got: ' + act.behavior);
        ok(act.domain, 'domain set; got: ' + act.domain);
    });

    // T-7: _source or _behavior_repaired set on repaired actions
    test('T-7: repaired actions carry _source=degraded_behavior_repaired', function () {
        var coa = (result.coas || []).find(function (c) { return c.plan_id === 'COA-1'; });
        ok(coa, 'COA-1 present');
        var movActs = (coa.phases[0].actions || []).filter(function (a) { return a.action_type !== 'HOLD_POSITION'; });
        var repaired = movActs.filter(function (a) { return a._behavior_repaired === true; });
        ok(repaired.length >= 1, 'at least one action marked _behavior_repaired; movActs=' + JSON.stringify(movActs.map(function(a){return {uid:a.unit_uid,repaired:a._behavior_repaired,source:a._source};})));
    });

    // T-8: No _ai_coa_honest_fail flag (LLM succeeded, not blocked)
    test('T-8: no _ai_coa_honest_fail (plan is a genuine LLM result)', function () {
        ok(!result._ai_coa_honest_fail, '_ai_coa_honest_fail should not be set');
    });

    // Summary
    console.log('\n─────────────────────────────────────────────────────');
    console.log('RMOOZ-BEHAVIOR-E2E-A: ' + PASS + '/' + (PASS + FAIL) + ' passed');
    if (ERRORS.length) {
        console.log('\nFailed tests:');
        ERRORS.forEach(function (e) { console.log('  ✗ ' + e.name + ': ' + e.msg); });
        process.exit(1);
    } else {
        console.log('All tests PASS.');
        process.exit(0);
    }
})();
