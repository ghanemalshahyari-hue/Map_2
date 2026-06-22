/**
 * RMOOZ-REAL-AI-BEHAVIOR-CONTRACT-A — server-side contract test suite
 * Tests that _coaToDecision preserves behavior fields, validateCommanderCoaTool
 * rejects missing behavior, and _spreadCenterClusteredCoas skips behavior-based COAs.
 * Run: node test-free-fight-real-ai-behavior-contract-a.js
 */
'use strict';

var path = require('path');
var CONTRACT = require(path.join(__dirname, 'UI_MOdified/server/ai/rmooz-ai-tool-contract.js'));
var PLANNER  = require(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-coa-planner.js'));

// ── Test harness ──────────────────────────────────────────────────────────────

var PASS = 0, FAIL = 0, ERRORS = [];

function test(name, fn) {
    try {
        fn();
        console.log('  PASS  ' + name);
        PASS++;
    } catch (e) {
        console.error('  FAIL  ' + name + '\n         ' + e.message);
        ERRORS.push({ name: name, msg: e.message });
        FAIL++;
    }
}

function eq(a, b, msg) {
    if (a !== b) throw new Error(msg || ('expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)));
}

function ok(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
}

// ── Fixtures ─────────────────────────────────────────────────────────────────

// Units placed within SAFE_STEP_DEG (0.15°) of OBJ so the teleport guard never fires.
// This isolates behavior-intent violations from physics violations in the tests.
var OBJ = { id: 'OBJ-1', name: 'Objective X', lat: 28.2, lon: 45.2 };
var GROUND_UNIT = { id: 'G1', unit_uid: 'G1', lat: 28.19, lon: 45.19, side: 'RED',
    name: 'Tank Btn', type: 'armor', sidc: 'SFGPUCA----' };
var AIR_UNIT    = { id: 'A1', unit_uid: 'A1', lat: 28.21, lon: 45.21, side: 'RED',
    name: 'F-16', type: 'fighter', sidc: 'SFAPCA-----' };
var NAVAL_UNIT  = { id: 'N1', unit_uid: 'N1', lat: 28.18, lon: 45.19, side: 'RED',
    name: 'Destroyer', type: 'frigate', sidc: 'SFSPCLSS---' };

// Build a minimal decision with behavior-complete actions
function makeDecision(actions) {
    return { selected_coa_family: 'direct_action', unit_assignments: actions };
}

// Build a full behavior-complete MOVE action
function moveAct(uid, behavior, domain, mm, wp) {
    return { unit_uid: uid, role: 'assault', action_type: 'MOVE_TOWARD_OBJECTIVE',
        behavior: behavior || 'approach', domain: domain || 'ground',
        movement_mode: mm || 'ground', waypoint_policy: wp || 'direct_step',
        target: { lat: 28.2, lon: 45.2, type: 'objective' }, reason: 'attack' };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\nRMOOZ-REAL-AI-BEHAVIOR-CONTRACT-A\n');

// T-1: validateCommanderCoaTool accepts action with complete behavior intent
test('T-1: complete behavior-intent MOVE action is accepted', function () {
    var result = CONTRACT.validateCommanderCoaTool({
        decision: makeDecision([moveAct('G1', 'approach', 'ground', 'ground', 'direct_step')]),
        units: [GROUND_UNIT], objectives: [OBJ],
    });
    ok(result.data.accepted, 'accepted:true');
    eq(result.data.violations.length, 0, 'no violations');
});

// T-2: validateCommanderCoaTool rejects MOVE action missing behavior field
test('T-2: target-only MOVE (missing behavior) is rejected', function () {
    var act = { unit_uid: 'G1', role: 'assault', action_type: 'MOVE_TOWARD_OBJECTIVE',
        target: { lat: 28.2, lon: 45.2 }, reason: 'attack' };
    var result = CONTRACT.validateCommanderCoaTool({
        decision: makeDecision([act]),
        units: [GROUND_UNIT], objectives: [OBJ],
    });
    ok(!result.data.accepted, 'rejected');
    var codes = result.data.violations.map(function (v) { return v.code; });
    ok(codes.indexOf('missing_behavior_intent') >= 0, 'missing_behavior_intent violation present');
});

// T-3: validateCommanderCoaTool rejects MOVE action missing domain field
test('T-3: MOVE missing domain is rejected', function () {
    var act = { unit_uid: 'G1', role: 'assault', action_type: 'MOVE_TOWARD_OBJECTIVE',
        behavior: 'approach', movement_mode: 'ground', waypoint_policy: 'direct_step', reason: 'attack' };
    var result = CONTRACT.validateCommanderCoaTool({
        decision: makeDecision([act]),
        units: [GROUND_UNIT], objectives: [OBJ],
    });
    ok(!result.data.accepted, 'rejected');
    var codes = result.data.violations.map(function (v) { return v.code; });
    ok(codes.indexOf('missing_domain') >= 0, 'missing_domain violation present');
});

// T-4: validateCommanderCoaTool rejects aircraft with direct_step
test('T-4: aircraft with waypoint_policy=direct_step is rejected', function () {
    var act = moveAct('A1', 'approach', 'air', 'air', 'direct_step');
    var result = CONTRACT.validateCommanderCoaTool({
        decision: makeDecision([act]),
        units: [AIR_UNIT], objectives: [OBJ],
    });
    ok(!result.data.accepted, 'rejected');
    var codes = result.data.violations.map(function (v) { return v.code; });
    ok(codes.indexOf('aircraft_direct_step_blocked') >= 0, 'aircraft_direct_step_blocked violation present');
});

// T-5: validateCommanderCoaTool rejects ground unit with movement_mode=naval
test('T-5: ground domain + movement_mode=naval is rejected', function () {
    var act = moveAct('G1', 'approach', 'ground', 'naval', 'direct_step');
    var result = CONTRACT.validateCommanderCoaTool({
        decision: makeDecision([act]),
        units: [GROUND_UNIT], objectives: [OBJ],
    });
    ok(!result.data.accepted, 'rejected');
    var codes = result.data.violations.map(function (v) { return v.code; });
    ok(codes.indexOf('domain_mm_mismatch') >= 0, 'domain_mm_mismatch violation present');
});

// T-6: validateCommanderCoaTool rejects naval unit with movement_mode=ground
test('T-6: naval domain + movement_mode=ground is rejected', function () {
    var act = moveAct('N1', 'patrol', 'naval', 'ground', 'patrol_loop');
    var result = CONTRACT.validateCommanderCoaTool({
        decision: makeDecision([act]),
        units: [NAVAL_UNIT], objectives: [OBJ],
    });
    ok(!result.data.accepted, 'rejected');
    var codes = result.data.violations.map(function (v) { return v.code; });
    ok(codes.indexOf('domain_mm_mismatch') >= 0, 'domain_mm_mismatch violation present');
});

// T-7: HOLD_POSITION action passes even without behavior fields (not required)
test('T-7: HOLD_POSITION without behavior fields is accepted', function () {
    var act = { unit_uid: 'G1', role: 'reserve', action_type: 'HOLD_POSITION', reason: 'hold' };
    var result = CONTRACT.validateCommanderCoaTool({
        decision: makeDecision([act]),
        units: [GROUND_UNIT], objectives: [OBJ],
    });
    ok(result.data.accepted, 'HOLD_POSITION accepted');
});

// T-8: _spreadCenterClusteredCoas does NOT ring-spread behavior-based COAs
test('T-8: _spreadCenterClusteredCoas skips COAs with behavior fields', function () {
    var origTarget = { lat: 28.2, lon: 45.2, type: 'objective' };
    var coa = {
        plan_id: 'COA-1',
        phases: [{ actions: [
            // All actions converge on obj center — normally would trigger ring-spread
            { unit_uid: 'G1', role: 'assault', action_type: 'MOVE_TOWARD_OBJECTIVE',
              behavior: 'approach', domain: 'ground', movement_mode: 'ground', waypoint_policy: 'direct_step',
              target: Object.assign({}, origTarget) },
            { unit_uid: 'G2', role: 'support',  action_type: 'SUPPORT_BY_FIRE',
              behavior: 'support',  domain: 'ground', movement_mode: 'ground', waypoint_policy: 'support_position',
              target: Object.assign({}, origTarget) },
            { unit_uid: 'G3', role: 'screen',   action_type: 'SCREEN_FLANK',
              behavior: 'screen',   domain: 'ground', movement_mode: 'ground', waypoint_policy: 'screen_line',
              target: Object.assign({}, origTarget) },
        ]}],
    };
    PLANNER._spreadCenterClusteredCoasForTest([coa], OBJ);
    // Target must NOT have been ring-spread
    var act = coa.phases[0].actions[0];
    ok(!coa._server_respread_to_rings, 'COA not marked as respread');
    eq(act.target.lat, origTarget.lat, 'target lat unchanged');
    eq(act.target.lon, origTarget.lon, 'target lon unchanged');
});

// T-9: _spreadCenterClusteredCoas DOES ring-spread target-only (no behavior) COAs
test('T-9: _spreadCenterClusteredCoas still spreads target-only COAs', function () {
    var obj = { lat: 28.2, lon: 45.2 };
    var coa = {
        plan_id: 'COA-2',
        phases: [{ actions: [
            // No behavior fields — old-style target-only actions
            { unit_uid: 'G1', role: 'assault', action_type: 'MOVE', target: { lat: 28.2, lon: 45.2 } },
            { unit_uid: 'G2', role: 'support', action_type: 'MOVE', target: { lat: 28.2, lon: 45.2 } },
            { unit_uid: 'G3', role: 'screen',  action_type: 'MOVE', target: { lat: 28.2, lon: 45.2 } },
        ]}],
    };
    PLANNER._spreadCenterClusteredCoasForTest([coa], obj);
    // Should be spread
    ok(coa._server_respread_to_rings === true, 'COA marked as respread');
});

// T-10: validateCommanderCoaTool accepts aircraft with patrol_loop
test('T-10: aircraft + patrol_loop waypoint_policy is accepted', function () {
    var act = moveAct('A1', 'patrol', 'air', 'air', 'patrol_loop');
    var result = CONTRACT.validateCommanderCoaTool({
        decision: makeDecision([act]),
        units: [AIR_UNIT], objectives: [OBJ],
    });
    ok(result.data.accepted, 'accepted');
    eq(result.data.violations.length, 0, 'no violations');
});

// T-11: validateCommanderCoaTool accepts aircraft with orbit
test('T-11: aircraft + orbit waypoint_policy is accepted', function () {
    var act = moveAct('A1', 'orbit', 'air', 'air', 'orbit');
    var result = CONTRACT.validateCommanderCoaTool({
        decision: makeDecision([act]),
        units: [AIR_UNIT], objectives: [OBJ],
    });
    ok(result.data.accepted, 'accepted');
});

// T-12: repaired_decision excludes actions with behavior violations
test('T-12: repaired_decision drops behavior-violation actions, keeps valid ones', function () {
    var goodAct = moveAct('G1', 'approach', 'ground', 'ground', 'direct_step');
    var badAct  = { unit_uid: 'A1', role: 'assault', action_type: 'MOVE', reason: 'fly',
        target: { lat: 28.2, lon: 45.2 } };  // no behavior fields
    var result = CONTRACT.validateCommanderCoaTool({
        decision: makeDecision([goodAct, badAct]),
        units: [GROUND_UNIT, AIR_UNIT], objectives: [OBJ],
    });
    ok(!result.data.accepted, 'rejected (has violation)');
    ok(result.data.repaired_decision, 'repaired_decision produced');
    var kept = result.data.repaired_decision.unit_assignments;
    eq(kept.length, 1, 'only 1 valid action kept');
    eq(kept[0].unit_uid, 'G1', 'valid action preserved');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n─────────────────────────────────────────────────────');
console.log('RMOOZ-REAL-AI-BEHAVIOR-CONTRACT-A: ' + PASS + '/' + (PASS + FAIL) + ' passed');
if (ERRORS.length) {
    console.log('\nFailed tests:');
    ERRORS.forEach(function (e) { console.log('  ✗ ' + e.name + ': ' + e.msg); });
    process.exit(1);
} else {
    console.log('All tests PASS.');
    process.exit(0);
}
