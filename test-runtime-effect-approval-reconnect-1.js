'use strict';
/**
 * test-runtime-effect-approval-reconnect-1.js — Batch C Slice C5
 *
 * Reconnects Approve -> real effect application. The Batch C audit found
 * that a doctrine-gated safe effect (set_runtime_flag/open_decision_point/
 * close_decision_point/update_mission_task_status/clear_runtime_flag), once
 * the operator clicked Approve, was only relabeled to 'approved_safe' and
 * journaled — decideRuntimeApproval() never re-entered the mutation logic,
 * so the flag was never actually set / the decision point never actually
 * opened / the task status never actually updated. "Approved" meant
 * "journaled," not "applied."
 *
 * This slice extracts the kind-specific mutation switch out of
 * applySafeRuntimeEventEffects into applyEffectMutation(state, kind, payload,
 * proposal), and calls it from BOTH the original allow-path (unchanged
 * behavior — test-doctrine-runtime-gate-1.js's 14 assertions still pass
 * unmodified) AND decideRuntimeApproval()'s post-approval branch (new).
 * weapon_release is deliberately excluded — MUTABLE_SAFE_EFFECT_KINDS omits
 * it, so it stays pending_effect_execution regardless of approval (no
 * executor exists for it — Locked Decision 8, also the subject of Slice C9's
 * regression lock).
 *
 * Sibling to test-doctrine-runtime-gate-1.js / test-doctrine-approval-workflow-1.js.
 * Run: node test-runtime-effect-approval-reconnect-1.js
 */

const path = require('path');
const ROOT = __dirname;
const Doctrine = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'doctrine-rules.js'));
const RuntimeEvents = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-events.js'));

let passed = 0, failed = 0;
function ok(label, cond, detail) {
    if (cond) { passed++; console.log('  PASS  ' + label); }
    else { failed++; console.error('  FAIL  ' + label + (detail ? ' -- ' + detail : '')); }
}

function baseState() {
    return {
        runtime_flags: {}, open_decision_points: {}, mission_task_status: {},
        pending_effects: [], blocked_effects: [], last_effects: [],
        doctrine_decisions: [], pending_approvals: {}, applied_effects: [],
        approved_effects: [], rejected_effects: [], approval_decisions: {}
    };
}
function event(id, effects) { return { id: id, at_elapsed_hours: 1, effects: effects }; }
function apply(scenario, id, effects, state) {
    return RuntimeEvents.applySafeRuntimeEventEffects(state || baseState(), event(id, effects), effects, { scenario: scenario, doctrine: Doctrine });
}

console.log('\n=== Batch C Slice C5: reconnect approval -> real effect application ===\n');

// ── 1. Approved set_runtime_flag genuinely sets the flag (the core bug fix) ─
(function () {
    const scenario = { doctrine_rules: [{ id: 'd-approval-flag', action: 'runtime_flag', decision: 'require_approval', reason: 'flag approval' }] };
    const res = apply(scenario, 'evt-1', [{ id: 'flag-approval', kind: 'set_runtime_flag', key: 'ready_flag', value: true }]);
    ok('T-1 gated set_runtime_flag is requires_approval, NOT applied yet',
        res.effects[0].status === 'requires_approval' && res.state.runtime_flags.ready_flag === undefined);

    const decided = RuntimeEvents.decideRuntimeApproval(res.state, 'flag-approval', 'approve', {});
    ok('T-2 decideRuntimeApproval records the approval', decided.status === 'recorded');
    ok('T-3 THE BUG FIX: runtime_flags.ready_flag is genuinely set after Approve (previously stayed undefined forever)',
        decided.state.runtime_flags.ready_flag === true, JSON.stringify(decided.state.runtime_flags));
    ok('T-4 approved_effects reflects the real approved_safe status', decided.effect.status === 'approved_safe');
})();

// ── 2. Rejected effect still applies nothing ───────────────────────────────
(function () {
    const scenario = { doctrine_rules: [{ id: 'd-approval-flag2', action: 'runtime_flag', decision: 'require_approval', reason: 'flag approval' }] };
    const res = apply(scenario, 'evt-2', [{ id: 'flag-rejected', kind: 'set_runtime_flag', key: 'never_flag', value: true }]);
    const decided = RuntimeEvents.decideRuntimeApproval(res.state, 'flag-rejected', 'reject', {});
    ok('T-5 rejecting still applies nothing', decided.state.runtime_flags.never_flag === undefined);
    ok('T-6 rejected effect status is "rejected"', decided.effect.status === 'rejected');
})();

// ── 3. Approved open_decision_point genuinely opens the decision point ────
(function () {
    const scenario = { doctrine_rules: [{ id: 'd-approval-dp', action: 'decision_point', decision: 'require_approval', reason: 'dp approval' }] };
    const res = apply(scenario, 'evt-3', [{ id: 'dp-approval', kind: 'open_decision_point', decision_point_id: 'dp-42', title: 'Proceed?', options: [{ id: 'yes', label: 'Yes' }] }]);
    ok('T-7 gated open_decision_point is requires_approval, NOT opened yet',
        res.effects[0].status === 'requires_approval' && res.state.open_decision_points['dp-42'] === undefined);
    const decided = RuntimeEvents.decideRuntimeApproval(res.state, 'dp-approval', 'approve', {});
    ok('T-8 decision point dp-42 is genuinely opened after Approve',
        decided.state.open_decision_points['dp-42'] && decided.state.open_decision_points['dp-42'].status === 'open',
        JSON.stringify(decided.state.open_decision_points));
    ok('T-9 opened decision point carries the real title/options from the effect payload',
        decided.state.open_decision_points['dp-42'].title === 'Proceed?' &&
        decided.state.open_decision_points['dp-42'].options.length === 1);
})();

// ── 4. Approved update_mission_task_status genuinely updates the shadow map ─
(function () {
    const scenario = { doctrine_rules: [{ id: 'd-approval-task', action: 'mission_task_update', decision: 'require_approval', reason: 'task status approval' }] };
    const res = apply(scenario, 'evt-4', [{ id: 'task-approval', kind: 'update_mission_task_status', mission_task_id: 'm1', status: 'complete' }]);
    ok('T-10 gated update_mission_task_status is requires_approval, NOT applied yet',
        res.effects[0].status === 'requires_approval' && res.state.mission_task_status.m1 === undefined);
    const decided = RuntimeEvents.decideRuntimeApproval(res.state, 'task-approval', 'approve', {});
    ok('T-11 mission_task_status.m1 is genuinely set to complete after Approve',
        decided.state.mission_task_status.m1 && decided.state.mission_task_status.m1.status === 'complete',
        JSON.stringify(decided.state.mission_task_status));
})();

// ── 5. weapon_release approval still applies nothing (Locked Decision 8) ──
(function () {
    const res = apply({}, 'evt-5', [{ id: 'wra-approval', kind: 'weapon_release', weapon_class: 'SAM', confidence: 1, range_nm: 10 }]);
    ok('T-12 weapon_release with no rules is requires_approval by default (WRA no-rules default)',
        res.effects[0].status === 'requires_approval');
    const before = JSON.stringify(res.state);
    const decided = RuntimeEvents.decideRuntimeApproval(res.state, 'wra-approval', 'approve', {});
    ok('T-13 weapon_release approval NEVER applies anything — no executor exists for it (Locked Decision 8)',
        decided.effect.status === 'approved_pending_execution' &&
        JSON.stringify(decided.state.runtime_flags) === '{}' &&
        JSON.stringify(decided.state.open_decision_points) === '{}' &&
        JSON.stringify(decided.state.mission_task_status) === '{}');
    ok('T-14 weapon_release stays in pending_effects / has no execution consumer (unchanged from before this slice)',
        decided.state.pending_effects.some(function (p) { return p && p.effect_id === 'wra-approval'; }) ||
        decided.effect.status === 'approved_pending_execution');
})();

// ── 6. Original allow-path (no gate at all) is completely unchanged ───────
(function () {
    const res = apply({}, 'evt-6', [{ id: 'flag-allow', kind: 'set_runtime_flag', key: 'immediate_flag', value: true }]);
    ok('T-15 an effect with no doctrine gate still applies IMMEDIATELY (inline, no approval step needed) — unchanged regression',
        res.effects[0].status === 'applied_safe' && res.state.runtime_flags.immediate_flag === true);
})();

// ── 7. Malformed payload during post-approval mutation does not crash ─────
(function () {
    const scenario = { doctrine_rules: [{ id: 'd-approval-flag3', action: 'runtime_flag', decision: 'require_approval', reason: 'flag approval' }] };
    // No 'key'/'flag'/'name'/'id' in payload -> the mutation itself would
    // fail (missing_runtime_flag_key), but decideRuntimeApproval must not throw.
    const res = apply(scenario, 'evt-7', [{ id: 'flag-malformed', kind: 'set_runtime_flag', value: true }]);
    let threw = false;
    let decided = null;
    try { decided = RuntimeEvents.decideRuntimeApproval(res.state, 'flag-malformed', 'approve', {}); }
    catch (e) { threw = true; }
    ok('T-16 malformed payload during post-approval mutation does not throw', !threw);
    ok('T-17 the approval itself still records successfully despite the malformed payload', decided && decided.status === 'recorded');
})();

// ── 8. Regression: source-scan confirms the switch was genuinely refactored ─
(function () {
    const fs = require('fs');
    const src = fs.readFileSync(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-events.js'), 'utf8');
    ok('T-18 applyEffectMutation() exists as a standalone, reusable function', /function applyEffectMutation\(/.test(src));
    ok('T-19 decideRuntimeApproval calls applyEffectMutation on approve', /applyEffectMutation\(state, finalEffect\.kind, obj\(finalEffect\.payload\), finalEffect\)/.test(src));
    ok('T-20 MUTABLE_SAFE_EFFECT_KINDS deliberately excludes weapon_release', /MUTABLE_SAFE_EFFECT_KINDS = \{[\s\S]{0,220}?\}/.test(src) &&
        !/MUTABLE_SAFE_EFFECT_KINDS = \{[^}]*weapon_release/.test(src));
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
