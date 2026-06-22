/**
 * RMOOZ-AI-COA-BEHAVIOR-PATH-REQUIRED-A — test suite
 * Tests that AI COA behavior normalization, blocking, and domain validation work correctly.
 * Run: node test-free-fight-ai-coa-behavior-required-a.js
 */
'use strict';

// ── Minimal stubs ────────────────────────────────────────────────────────────

function arr(x) { return Array.isArray(x) ? x : (x ? [x] : []); }

// Minimal RmoozMovementEngine stub: classifyUnitDomain by sidc prefix
var ME_STUB = {
    classifyUnitDomain: function (u) {
        var s = String((u && u.sidc) || '').toUpperCase();
        if (s.indexOf('SFAP') === 0 || s.indexOf('SHAP') === 0 || s.indexOf('SUAP') === 0) return 'air';
        if (s.indexOf('SFSP') === 0 || s.indexOf('SHSP') === 0) return 'naval';
        return 'ground';
    },
    buildWaypointsForAssignment: function () { return [{ lat: 30, lon: 45 }]; },
};

// Fake window: units keyed by unit_uid
function makeWindow(unitMap) {
    return { RmoozMovementEngine: ME_STUB, _unitMap: unitMap || {} };
}

// ── Inline _validateAndFixDomain and _normalizeBehaviorIntentForPlan ─────────
// Extracted from the module logic to test in isolation.

function _validateAndFixDomain(act) {
    if (!act || !act.domain) return;
    if (act.domain === 'air') {
        if (act.movement_mode !== 'air') { act.movement_mode = 'air'; act._domain_validated = true; }
        if (act.waypoint_policy === 'direct_step' || act.waypoint_policy === 'intercept_axis') {
            act.waypoint_policy = (act.behavior === 'intercept') ? 'orbit' : 'patrol_loop';
            act._domain_validated = true;
        }
    } else if (act.domain === 'naval') {
        if (act.movement_mode === 'ground') { act.movement_mode = 'naval'; act._domain_validated = true; }
    } else if (act.domain === 'ground') {
        if (act.movement_mode === 'naval' || act.movement_mode === 'air') { act.movement_mode = 'ground'; act._domain_validated = true; }
    }
    if ((act.domain === 'static' || act.domain === 'sensor' || act.domain === 'air_defense') &&
        (act.behavior === 'approach' || act.behavior === 'intercept')) {
        act.behavior = (act.domain === 'air_defense') ? 'defend' : 'support';
        act.waypoint_policy = 'hold_area';
        act._domain_validated = true;
    }
}

function makeNormalizer(W, unitMap) {
    function findRealUnit(uid) {
        var u = (unitMap || {})[uid];
        return u ? { unit: u } : null;
    }
    return function _normalizeBehaviorIntentForPlan(plan) {
        if (!plan || !plan.ok) return;
        var ME = W && W.RmoozMovementEngine;
        var ROLE_BEH = {
            assault: 'approach', support: 'support', screen: 'screen', recon: 'observe',
            reserve: 'reserve', intercept: 'intercept', defend: 'defend', reinforce: 'support', hold: 'hold',
        };
        var ROLE_WP = {
            assault: 'direct_step', support: 'support_position', screen: 'screen_line',
            recon: 'direct_step', reserve: 'hold_area', intercept: 'intercept_axis',
            defend: 'hold_area', reinforce: 'support_position', hold: 'hold_area',
        };
        var BEH_WP = {
            approach: 'direct_step', support: 'support_position', screen: 'screen_line',
            observe: 'direct_step', reserve: 'hold_area', intercept: 'intercept_axis',
            defend: 'hold_area', patrol: 'patrol_loop', orbit: 'orbit', hold: 'hold_area',
        };
        var repairedCount = 0;
        arr(plan.coas).forEach(function (coa) {
            arr(coa && coa.phases).forEach(function (phase) {
                arr(phase && phase.actions).forEach(function (act) {
                    if (!act) return;
                    var isHold = (act.action_type === 'HOLD_POSITION' || act.behavior === 'hold');
                    if (isHold) {
                        if (!act.behavior)        act.behavior        = 'hold';
                        if (!act.domain)          act.domain          = 'ground';
                        if (!act.movement_mode)   act.movement_mode   = 'static';
                        if (!act.waypoint_policy) act.waypoint_policy = 'hold_area';
                        return;
                    }
                    var needsRepair = !act.behavior || !act.domain || !act.movement_mode || !act.waypoint_policy;
                    if (!needsRepair) { _validateAndFixDomain(act); return; }

                    var found = findRealUnit(act.unit_uid);
                    var unit = found ? found.unit : null;
                    var dom = (ME && unit) ? ME.classifyUnitDomain(unit) : 'ground';
                    var roleKey = String(act.role || '').toLowerCase();
                    var beh = ROLE_BEH[roleKey] || null;
                    if (!beh) {
                        var at = String(act.action_type || '').toLowerCase();
                        if (at.indexOf('recon') >= 0)         beh = 'observe';
                        else if (at.indexOf('screen') >= 0)   beh = 'screen';
                        else if (at.indexOf('support') >= 0)  beh = 'support';
                        else if (at.indexOf('hold') >= 0)     beh = 'hold';
                        else                                   beh = 'approach';
                    }
                    if (dom === 'air' && beh === 'approach') beh = 'orbit';
                    var wp = BEH_WP[beh] || ROLE_WP[roleKey] || 'direct_step';
                    if (dom === 'air' && (wp === 'direct_step' || wp === 'intercept_axis'))
                        wp = (beh === 'intercept') ? 'orbit' : 'patrol_loop';
                    var mm = (dom === 'air') ? 'air' : (dom === 'naval') ? 'naval' : 'ground';

                    if (!act.behavior)        act.behavior        = beh;
                    if (!act.domain)          act.domain          = dom;
                    if (!act.movement_mode)   act.movement_mode   = mm;
                    if (!act.waypoint_policy) act.waypoint_policy = wp;

                    _validateAndFixDomain(act);
                    act._behavior_repaired = true;
                    act._source = 'degraded_behavior_repaired';
                    repairedCount++;
                });
            });
        });
        if (repairedCount > 0) {
            plan._behavior_repaired = true;
            plan._behavior_repaired_count = repairedCount;
            if (!plan.llm_status || plan.llm_status === 'ok') plan.llm_status = 'behavior_intent_repaired';
        }
        return { repaired: repairedCount };
    };
}

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
    if (a !== b) throw new Error((msg || 'expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)));
}

function ok(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\nRMOOZ-AI-COA-BEHAVIOR-PATH-REQUIRED-A\n');

// T-1: LLM COA without behavior fields gets repaired and marked behavior_intent_repaired
test('T-1: LLM COA missing behavior fields → plan marked behavior_intent_repaired', function () {
    var plan = {
        ok: true, plan_source: 'llm',
        coas: [{ phases: [{ actions: [
            { unit_uid: 'U1', role: 'assault', action_type: 'MOVE_TOWARD_OBJECTIVE', reason: 'attack' },
        ]}]}],
    };
    var normalize = makeNormalizer(makeWindow({ U1: { id: 'U1', sidc: 'SFGPUCI----' } }), { U1: { id: 'U1', sidc: 'SFGPUCI----' } });
    var result = normalize(plan);
    ok(result.repaired >= 1, 'repaired count >= 1');
    eq(plan._behavior_repaired, true, 'plan._behavior_repaired');
    eq(plan.llm_status, 'behavior_intent_repaired', 'plan.llm_status');
});

// T-2: Repaired action has all four behavior intent fields filled
test('T-2: repaired action has behavior / domain / movement_mode / waypoint_policy', function () {
    var act = { unit_uid: 'U1', role: 'assault', action_type: 'MOVE_TOWARD_OBJECTIVE', reason: 'attack' };
    var plan = { ok: true, plan_source: 'llm', coas: [{ phases: [{ actions: [act] }] }] };
    var normalize = makeNormalizer(makeWindow({}), {});
    normalize(plan);
    ok(act.behavior,        'behavior set');
    ok(act.domain,          'domain set');
    ok(act.movement_mode,   'movement_mode set');
    ok(act.waypoint_policy, 'waypoint_policy set');
});

// T-3: Repaired action has _source = 'degraded_behavior_repaired'
test('T-3: repaired action carries _source = degraded_behavior_repaired', function () {
    var act = { unit_uid: 'U1', role: 'screen', action_type: 'SCREEN_FLANK', reason: 'flank' };
    var plan = { ok: true, plan_source: 'llm', coas: [{ phases: [{ actions: [act] }] }] };
    var normalize = makeNormalizer(makeWindow({}), {});
    normalize(plan);
    eq(act._source, 'degraded_behavior_repaired', '_source value');
    eq(act._behavior_repaired, true, '_behavior_repaired flag');
});

// T-4: AI aircraft action with direct_step → repaired to patrol_loop
test('T-4: aircraft + direct_step waypoint_policy → repaired to patrol_loop', function () {
    var act = { unit_uid: 'A1', role: 'assault', action_type: 'MOVE_TOWARD_OBJECTIVE',
        domain: 'air', behavior: 'approach', movement_mode: 'air', waypoint_policy: 'direct_step', reason: 'fly' };
    var plan = { ok: true, plan_source: 'llm', coas: [{ phases: [{ actions: [act] }] }] };
    var normalize = makeNormalizer(makeWindow({}), {});
    normalize(plan);
    eq(act.waypoint_policy, 'patrol_loop', 'aircraft waypoint_policy repaired');
    eq(act._domain_validated, true, '_domain_validated flag');
});

// T-5: AI aircraft action with domain=air + movement_mode=ground → repaired to air
test('T-5: aircraft domain=air + movement_mode=ground → movement_mode corrected to air', function () {
    var act = { unit_uid: 'A1', role: 'assault', action_type: 'MOVE_TOWARD_OBJECTIVE',
        domain: 'air', behavior: 'orbit', movement_mode: 'ground', waypoint_policy: 'patrol_loop', reason: 'fly' };
    var plan = { ok: true, plan_source: 'llm', coas: [{ phases: [{ actions: [act] }] }] };
    var normalize = makeNormalizer(makeWindow({}), {});
    normalize(plan);
    eq(act.movement_mode, 'air', 'movement_mode corrected');
    eq(act._domain_validated, true, '_domain_validated');
});

// T-6: Ground unit with movement_mode=naval → corrected to ground
test('T-6: ground domain + movement_mode=naval → corrected to ground', function () {
    var act = { unit_uid: 'G1', role: 'assault', action_type: 'MOVE_TOWARD_OBJECTIVE',
        domain: 'ground', behavior: 'approach', movement_mode: 'naval', waypoint_policy: 'direct_step', reason: 'march' };
    var plan = { ok: true, plan_source: 'llm', coas: [{ phases: [{ actions: [act] }] }] };
    var normalize = makeNormalizer(makeWindow({}), {});
    normalize(plan);
    eq(act.movement_mode, 'ground', 'movement_mode corrected');
});

// T-7: HOLD_POSITION action gets hold/ground/static/hold_area filled even if blank
test('T-7: HOLD_POSITION fills hold / ground / static / hold_area', function () {
    var act = { unit_uid: 'U2', role: 'reserve', action_type: 'HOLD_POSITION', reason: 'hold' };
    var plan = { ok: true, plan_source: 'llm', coas: [{ phases: [{ actions: [act] }] }] };
    var normalize = makeNormalizer(makeWindow({}), {});
    normalize(plan);
    eq(act.behavior, 'hold', 'behavior');
    eq(act.domain, 'ground', 'domain');
    eq(act.movement_mode, 'static', 'movement_mode');
    eq(act.waypoint_policy, 'hold_area', 'waypoint_policy');
});

// T-8: SCC evidence flag — plan._behavior_repaired set when any action was repaired
test('T-8: plan._behavior_repaired set when repairs occurred', function () {
    var plan = {
        ok: true, plan_source: 'llm',
        coas: [{ phases: [{ actions: [
            { unit_uid: 'U1', role: 'defend', action_type: 'HOLD_POSITION', reason: 'hold' },  // hold — not repaired
            { unit_uid: 'U2', role: 'assault', action_type: 'MOVE_TOWARD_OBJECTIVE', reason: 'move' },  // needs repair
        ]}]}],
    };
    var normalize = makeNormalizer(makeWindow({}), {});
    normalize(plan);
    eq(plan._behavior_repaired, true, 'plan._behavior_repaired');
    ok(plan._behavior_repaired_count >= 1, 'repaired_count >= 1');
});

// T-9: Staff-Safe plan (plan_source='staff_safe') — already has behavior fields, nothing repaired
test('T-9: staff_safe plan with behavior fields already set → repaired_count = 0', function () {
    var act = { unit_uid: 'U1', role: 'assault', action_type: 'MOVE_TOWARD_OBJECTIVE',
        behavior: 'approach', domain: 'ground', movement_mode: 'ground', waypoint_policy: 'direct_step',
        _source: 'staff_safe_movement_engine', reason: 'staff safe' };
    var plan = { ok: true, plan_source: 'staff_safe', coas: [{ phases: [{ actions: [act] }] }] };
    var normalize = makeNormalizer(makeWindow({}), {});
    var result = normalize(plan);
    eq(result.repaired, 0, 'nothing repaired');
    ok(!plan._behavior_repaired, 'plan._behavior_repaired not set');
    eq(act._source, 'staff_safe_movement_engine', 'original _source preserved');
});

// T-10: Static/sensor domain + aggressive behavior → corrected to defend/support + hold_area
test('T-10: air_defense domain + behavior=approach → corrected to defend + hold_area', function () {
    var act = { unit_uid: 'AD1', role: 'assault', action_type: 'MOVE_TOWARD_OBJECTIVE',
        domain: 'air_defense', behavior: 'approach', movement_mode: 'static', waypoint_policy: 'direct_step', reason: 'defend' };
    var plan = { ok: true, plan_source: 'llm', coas: [{ phases: [{ actions: [act] }] }] };
    var normalize = makeNormalizer(makeWindow({}), {});
    normalize(plan);
    eq(act.behavior, 'defend', 'behavior corrected');
    eq(act.waypoint_policy, 'hold_area', 'waypoint_policy corrected');
    eq(act._domain_validated, true, '_domain_validated');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n─────────────────────────────────────────────────────');
console.log('RMOOZ-AI-COA-BEHAVIOR-PATH-REQUIRED-A: ' + PASS + '/' + (PASS + FAIL) + ' passed');
if (ERRORS.length) {
    console.log('\nFailed tests:');
    ERRORS.forEach(function (e) { console.log('  ✗ ' + e.name + ': ' + e.msg); });
    process.exit(1);
} else {
    console.log('All tests PASS.');
    process.exit(0);
}
