'use strict';

const path = require('path');

const ROOT = __dirname;
const Doctrine = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'doctrine-rules.js'));
const RuntimeEvents = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-events.js'));

let passed = 0;
let failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  PASS  ' + label); }
    else { failed++; console.error('  FAIL  ' + label); }
}
function clone(v) { return JSON.parse(JSON.stringify(v)); }

function baseState() {
    return {
        runtime_flags: {},
        open_decision_points: {},
        mission_task_status: {},
        pending_effects: [],
        blocked_effects: [],
        last_effects: [],
        doctrine_decisions: [],
        pending_approvals: {},
        applied_effects: []
    };
}
function event(effects) {
    return { id: 'evt-doc2', at_elapsed_hours: 1, effects };
}
function apply(scenario, effects, state) {
    return RuntimeEvents.applySafeRuntimeEventEffects(state || baseState(), event(effects), effects, { scenario, doctrine: Doctrine });
}

console.log('\n=== DOC2 doctrine runtime effect gate ===\n');

(function () {
    const res = apply({}, [{ id: 'note-1', kind: 'add_notification', message: 'hello' }]);
    ok('T-1 safe add_notification is allowed when no doctrine blocks it',
        res.effects[0].status === 'applied_safe' && res.state.applied_effects.length === 1);
})();

(function () {
    const scenario = { doctrine_rules: [{ id: 'd-block', action: 'notification', decision: 'block', reason: 'notifications blocked' }] };
    const res = apply(scenario, [{ id: 'note-block', kind: 'add_notification', message: 'hello' }]);
    ok('T-2 doctrine block rule blocks matching runtime effect',
        res.effects[0].status === 'blocked' && /notifications blocked/.test(res.effects[0].reason || ''));
})();

(function () {
    const scenario = { doctrine_rules: [{ id: 'd-auth', action: 'runtime_flag', decision: 'require_approval', requires_authority: 'J3', reason: 'flag needs approval' }] };
    const res = apply(scenario, [{ id: 'flag-auth', kind: 'set_runtime_flag', key: 'x', value: true }]);
    ok('T-3 doctrine require_authority turns matching effect into pending approval',
        res.effects[0].status === 'requires_approval' &&
        res.state.pending_approvals['flag-auth'] &&
        res.state.pending_approvals['flag-auth'].doctrine_decision.required_authority === 'J3');
})();

(function () {
    const scenario = { roe_rules: [{ id: 'roe-ra', restricted_area_ids: ['RA-1'], decision: 'require_approval', requires_authority: 'ROE Cell', reason: 'restricted area' }] };
    const res = apply(scenario, [{ id: 'dp-ra', kind: 'request_operator_decision', decision_point_id: 'dp1', area_id: 'RA-1' }]);
    ok('T-4 ROE restricted-area rule approval-gates matching engagement-like effect',
        res.effects[0].status === 'requires_approval' && res.state.pending_approvals['dp-ra']);
})();

(function () {
    const res = apply({}, [{ id: 'wra-none', kind: 'weapon_release', weapon_class: 'SAM', confidence: 1, range_nm: 10 }]);
    ok('T-5 WRA no-rules default requires approval for weapon_release-like effect',
        res.effects[0].status === 'requires_approval' && /no WRA rule/.test(res.effects[0].reason || ''));
})();

(function () {
    const scenario = { wra_rules: [{ id: 'wra-conf', weapon_class: 'SAM', min_confidence: 0.8, decision: 'block', reason: 'low confidence' }] };
    const res = apply(scenario, [{ id: 'wra-low', kind: 'weapon_release', weapon_class: 'SAM', confidence: 0.4, range_nm: 10 }]);
    ok('T-6 WRA rule can block low-confidence weapon release',
        res.effects[0].status === 'blocked' && /low confidence/.test(res.effects[0].reason || ''));
})();

(function () {
    const scenario = {
        doctrine_rules: [{ id: 'd-approval', action: 'weapon_release', decision: 'require_approval', reason: 'doctrine approval' }],
        wra_rules: [{ id: 'wra-block', weapon_class: 'SAM', min_confidence: 0.8, decision: 'block', reason: 'WRA block' }]
    };
    const res = apply(scenario, [{ id: 'most-restrictive', kind: 'weapon_release', weapon_class: 'SAM', confidence: 0.2 }]);
    ok('T-7 most restrictive wins across doctrine/ROE/WRA',
        res.effects[0].status === 'blocked' && res.state.doctrine_decisions[0].doctrine_decision === 'block');
})();

(function () {
    const scenario = { doctrine_rules: [{ id: 'd-block-flag', action: 'runtime_flag', decision: 'block', reason: 'flag blocked' }] };
    const res = apply(scenario, [{ id: 'flag-block', kind: 'set_runtime_flag', key: 'blocked_flag', value: true }]);
    ok('T-8 blocked doctrine effect does not mutate runtime_flags/mission_task_status',
        res.effects[0].status === 'blocked' &&
        res.state.runtime_flags.blocked_flag === undefined &&
        Object.keys(res.state.mission_task_status).length === 0);
})();

(function () {
    const scenario = { doctrine_rules: [{ id: 'd-approval-flag', action: 'runtime_flag', decision: 'require_approval', reason: 'flag approval' }] };
    const res = apply(scenario, [{ id: 'flag-approval', kind: 'set_runtime_flag', key: 'pending_flag', value: true }]);
    ok('T-9 require_approval effect is not applied_safe yet',
        res.effects[0].status === 'requires_approval' &&
        res.state.runtime_flags.pending_flag === undefined &&
        res.state.applied_effects.length === 0);
})();

(function () {
    const res = apply({}, [{ id: 'flag-allow', kind: 'set_runtime_flag', key: 'allowed_flag', value: true }]);
    ok('T-10 allow effect applies existing C4e safe behavior',
        res.effects[0].status === 'applied_safe' &&
        res.state.runtime_flags.allowed_flag === true &&
        res.state.applied_effects.length === 1);
})();

(function () {
    const scenario = { doctrine_rules: [{ id: 'allow-move', action: 'move_unit', decision: 'allow', reason: 'allow move' }] };
    const res = apply(scenario, [{ id: 'move-danger', kind: 'move_unit', unit_id: 'U1', to: [47, 25] }]);
    ok('T-11 dangerous move_unit/destroy_unit remains blocked regardless of doctrine allow',
        res.effects[0].status === 'blocked' && /direct_unit_mutation_blocked/.test(res.effects[0].reason || ''));
})();

(function () {
    const scenario = { doctrine_rules: [{ id: 'd-auth', action: 'notification', decision: 'require_approval', reason: 'approval' }] };
    const res = apply(scenario, [{ id: 'note-auth', kind: 'add_notification', message: 'hello' }]);
    ok('T-12 doctrine decision records are stored in runtime session state',
        res.state.doctrine_decisions.length === 1 &&
        res.state.doctrine_decisions[0].effect_id === 'note-auth' &&
        res.state.doctrine_decisions[0].status === 'require_approval');
})();

(function () {
    const scenario = { doctrine_rules: [{ id: 'd-block', action: 'notification', decision: 'block', reason: 'block' }] };
    const scenarioBefore = JSON.stringify(scenario);
    const unitsBefore = [{ uid: 'U1' }];
    global.window = global.window || {};
    global.window.units = clone(unitsBefore);
    const mapCalls = { applyState: 0 };
    global.window.AppAdjudicatorMap = { applyState() { mapCalls.applyState++; } };
    apply(scenario, [{ id: 'note-block', kind: 'add_notification', message: 'hello' }]);
    ok('T-13 scenario is not mutated', JSON.stringify(scenario) === scenarioBefore);
    ok('T-14 window.units/map are not touched',
        JSON.stringify(global.window.units) === JSON.stringify(unitsBefore) && mapCalls.applyState === 0);
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
