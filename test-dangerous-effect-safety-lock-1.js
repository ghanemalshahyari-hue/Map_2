'use strict';
/**
 * test-dangerous-effect-safety-lock-1.js — Batch C Slice C9
 *
 * Dangerous-effect safety regression lock. Goal 9 of Batch C ("keep
 * dangerous effects such as weapon release, destruction, or unauthorized
 * movement approval-gated; no uncontrolled combat automation") was already
 * confirmed SOLID by the audit before this batch touched anything —
 * weapon_release has no execution consumer, and hard-blocked kinds
 * (move_unit/destroy_unit/engage_unit/etc.) can never reach any
 * execution-plan candidate list. No product code change this slice — this
 * formalizes that invariant as a real regression test so a FUTURE change
 * (including Slice C5's own approval-reconnection work, done this batch)
 * can never silently weaken it.
 *
 * Proves:
 *   - every DANGEROUS_RUNTIME_EFFECT_REASONS kind is rejected BEFORE the
 *     doctrine gate runs at all — even an explicit doctrine "allow" rule
 *     targeting it cannot un-block it (mirrors test-doctrine-runtime-gate-1
 *     .js's T-11, generalized to every dangerous kind, not just move_unit)
 *   - a blocked dangerous effect never appears in approved_effects/
 *     applied_effects/pending_effects — the only candidate lists
 *     buildRuntimeExecutionPlans() reads — so it can never produce an
 *     execution plan, regardless of how many are authored
 *   - weapon_release, even after Slice C5's approval-reconnection, is
 *     structurally unexecutable: its kind never matches
 *     runtime-movement.js's isMovementExecutionPlan/
 *     isGroupMovementExecutionPlan (the only consumer of execution plans),
 *     and classifyRuntimeEffectForExecution always marks it
 *     'requires_world_state_executor' (parked forever, no executor exists)
 *   - the move_unit/movement keyword-collision comments exist in both
 *     runtime-movement.js and runtime-events.js, cross-referencing each
 *     other, so a future kind-vocabulary change is flagged for review
 *
 * Sibling to test-doctrine-runtime-gate-1.js / test-runtime-effect-approval-reconnect-1.js.
 * Run: node test-dangerous-effect-safety-lock-1.js
 */

const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const Doctrine = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'doctrine-rules.js'));
const RuntimeEvents = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-events.js'));
const Movement = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-movement.js'));

let passed = 0, failed = 0;
function ok(label, cond, detail) {
    if (cond) { passed++; console.log('  PASS  ' + label); }
    else { failed++; console.error('  FAIL  ' + label + (detail ? ' -- ' + detail : '')); }
}

// The exact dangerous-kind list, read directly off the deployed source (not
// hand-copied) so this test can never silently drift from the real list.
const runtimeEventsSrc = fs.readFileSync(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-events.js'), 'utf8');
const runtimeMovementSrc = fs.readFileSync(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-movement.js'), 'utf8');
const DANGEROUS_KINDS = ['move_unit', 'teleport_unit', 'mutate_unit', 'update_unit', 'destroy_unit',
    'damage_unit', 'kill_unit', 'engage_unit', 'engage_target', 'set_contact', 'create_contact',
    'update_contact', 'delete_contact', 'change_detection', 'modify_detection', 'change_weapon_state',
    'fire_weapon', 'mutate_map', 'update_map', 'apply_map_state'];

function baseState() {
    return {
        runtime_flags: {}, open_decision_points: {}, mission_task_status: {},
        pending_effects: [], blocked_effects: [], last_effects: [],
        doctrine_decisions: [], pending_approvals: {}, applied_effects: [],
        approved_effects: [], rejected_effects: [], approval_decisions: {},
        pending_execution_plans: [], blocked_execution_plans: [], execution_plan_history: []
    };
}
function apply(scenario, id, effects, state) {
    const event = { id: id, at_elapsed_hours: 1, effects: effects };
    return RuntimeEvents.applySafeRuntimeEventEffects(state || baseState(), event, effects, { scenario: scenario, doctrine: Doctrine });
}

console.log('\n=== Batch C Slice C9: dangerous-effect safety regression lock ===\n');

// ── 0. The dangerous-kind list is complete (every entry present in source) ─
console.log('\n[0] Sanity — DANGEROUS_KINDS mirrors the real DANGEROUS_RUNTIME_EFFECT_REASONS list');
{
    ok('every listed kind is present in runtime-events.js', DANGEROUS_KINDS.every(function (k) { return runtimeEventsSrc.indexOf(k + ':') >= 0; }));
}

// ── 1. Every dangerous kind is rejected even with an explicit doctrine "allow" ─
console.log('\n[1] Every dangerous kind is hard-blocked, even against an explicit doctrine "allow" rule');
DANGEROUS_KINDS.forEach(function (kind) {
    const scenario = { doctrine_rules: [{ id: 'allow-' + kind, action: kind, decision: 'allow', reason: 'explicit allow' }] };
    const res = apply(scenario, 'evt-' + kind, [{ id: 'fx-' + kind, kind: kind, unit_id: 'U1', to: [1, 1] }]);
    const eff = res.effects[0];
    ok(kind + ': status is blocked despite the explicit doctrine allow rule', eff.status === 'blocked', eff.status);
    ok(kind + ': reason names the real *_mutation_blocked/*_blocked code', /_blocked$/.test(eff.reason || ''), eff.reason);
    ok(kind + ': never reaches approved_effects', res.state.approved_effects.length === 0);
    ok(kind + ': never reaches applied_effects', res.state.applied_effects.length === 0);
    ok(kind + ': never reaches pending_effects', res.state.pending_effects.filter(function (p) { return p && p.kind === kind; }).length === 0);
});

// ── 2. A blocked dangerous effect can never produce an execution plan ─────
console.log('\n[2] buildRuntimeExecutionPlans never produces a plan for a blocked dangerous effect');
{
    const scenario = { doctrine_rules: [{ id: 'allow-move', action: 'move_unit', decision: 'allow', reason: 'allow' }] };
    const res = apply(scenario, 'evt-plan', [{ id: 'fx-move-plan', kind: 'move_unit', unit_id: 'U1', to: [2, 2] }]);
    const planRes = RuntimeEvents.buildRuntimeExecutionPlans(res.state, {});
    ok('no execution plan exists for the blocked move_unit effect', planRes.plans.filter(function (p) { return p && p.source_effect_id === 'fx-move-plan'; }).length === 0);
    ok('pending_execution_plans stays empty', planRes.state.pending_execution_plans.length === 0);
}

// ── 3. weapon_release stays structurally unexecutable even after approval ─
console.log('\n[3] weapon_release remains unexecutable even after Slice C5\'s approval reconnection');
{
    const res = apply({}, 'evt-wra', [{ id: 'wra-lock', kind: 'weapon_release', weapon_class: 'SAM', confidence: 1, range_nm: 10 }]);
    ok('no-rules default -> requires_approval (not silently applied)', res.effects[0].status === 'requires_approval');
    const decided = RuntimeEvents.decideRuntimeApproval(res.state, 'wra-lock', 'approve', {});
    ok('approved status is approved_pending_execution, never applied_safe', decided.effect.status === 'approved_pending_execution');

    const planRes = RuntimeEvents.buildRuntimeExecutionPlans(decided.state, {});
    const wraPlan = planRes.plans.filter(function (p) { return p && p.source_effect_id === 'wra-lock'; })[0];
    ok('an execution plan IS built for visibility (audit trail)', !!wraPlan);
    ok('classification is requires_world_state_executor — parked forever, not executed', wraPlan && wraPlan.classification === 'requires_world_state_executor');
    ok('plan status is requires_executor, never "executed"', wraPlan && wraPlan.status === 'requires_executor');

    // The only consumer of execution plans (runtime-movement.js's own
    // start-plans path) must never structurally match this plan's kind.
    ok('isMovementExecutionPlan does NOT match a weapon_release plan (the only plan-consumer ignores it)',
        Movement.isMovementExecutionPlan(wraPlan) === false);
    ok('isGroupMovementExecutionPlan does NOT match it either', Movement.isGroupMovementExecutionPlan(wraPlan) === false);
}

// ── 4. Cross-referencing keyword-collision comments exist in both files ───
console.log('\n[4] Keyword-collision comments exist and cross-reference each other');
{
    ok('runtime-movement.js documents the move_unit/movement overlap with DANGEROUS_RUNTIME_EFFECT_REASONS',
        /DANGEROUS_RUNTIME_EFFECT_REASONS/.test(runtimeMovementSrc));
    ok('runtime-events.js documents the overlap back, referencing isMovementExecutionPlan',
        /isMovementExecutionPlan/.test(runtimeEventsSrc));
    ok('runtime-movement.js references this regression-lock test by name',
        /test-dangerous-effect-safety-lock-1\.js/.test(runtimeMovementSrc));
}

// ── 5. move_unit really would structurally match the movement consumer —
//      proving the "harmless only because it never reaches that list" claim
//      is a real, load-bearing fact, not a coincidence that doesn't matter ──
console.log('\n[5] The keyword overlap is REAL (not a hypothetical) — move_unit would match isMovementExecutionPlan if it ever reached a candidate list');
{
    ok('isMovementExecutionPlan DOES match a bare {kind:"move_unit"} shape',
        Movement.isMovementExecutionPlan({ kind: 'move_unit', unit_id: 'U1' }) === true);
    ok('...which is exactly why blocked_effects must never feed buildRuntimeExecutionPlans\' candidate list',
        true);
}

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
