'use strict';
/**
 * test-runtime-movement-taskability-gate-1.js — Batch B Slice 3
 *
 * Closes the confirmed gap: createRuntimeMovementTaskPlan had zero
 * taskability awareness, so a non-taskable (Step-1 review-only,
 * commander-review-pending) unit could be tasked to move. Proves:
 *   - an injected context.classifyUnit blocks a single non-taskable unit
 *   - a group task filters blocked units and reports them, rejecting only
 *     if fewer than 2 taskable units remain
 *   - a fully taskable request is unaffected
 *   - NO classifier injected -> unchanged (pure) behavior, backward compat
 *   - free-fight-demo.js's wiring actually injects the real classifier +
 *     merges the live server approval status (source-scan, matching this
 *     repo's established block()/clean() convention)
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const Movement = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'runtime-movement.js'));
const ff = fs.readFileSync(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'free-fight-demo.js'), 'utf8');

let passed = 0;
let failed = 0;
function ok(label, cond, detail) {
    if (cond) { passed += 1; console.log('  PASS  ' + label); }
    else { failed += 1; console.error('  FAIL  ' + label + (detail ? ' -- ' + detail : '')); }
}
function block(src, from, to) {
    const a = src.indexOf(from);
    if (a < 0) return '';
    const b = to ? src.indexOf(to, a + from.length) : -1;
    return src.slice(a, b < 0 ? a + 3000 : b);
}

function taskInput(overrides) {
    return Object.assign({
        movement_id: 'gate-single-1',
        unit_id: 'U1',
        destination_lon: 1,
        destination_lat: 0,
        speed_kph: 100,
        domain: 'ground'
    }, overrides || {});
}
function taskContext(classifyMap) {
    return {
        elapsed_hours: 1,
        runtime_positions: { U1: [0, 0], U2: [-0.01, 0], U3: [-0.02, 0], U4: [-0.03, 0] },
        units: [
            { unit_id: 'U1', position: [0, 0], domain: 'ground' },
            { unit_id: 'U2', position: [-0.01, 0], domain: 'ground' },
            { unit_id: 'U3', position: [-0.02, 0], domain: 'ground' },
            { unit_id: 'U4', position: [-0.03, 0], domain: 'ground' }
        ],
        classifyUnit: classifyMap ? function (id) { return classifyMap[id] || { taskable: true }; } : undefined
    };
}
const TASKABLE = { taskable: true };
const BLOCKED  = { taskable: false, reason: 'needs_review' };

console.log('\n=== Batch B Slice 3: taskability -> runtime-movement gate ===\n');

// ── 1. Single non-taskable unit rejects the whole plan ────────────────────
(function () {
    const ctx = taskContext({ U1: BLOCKED });
    const built = Movement.createRuntimeMovementTaskPlan(taskInput(), ctx);
    ok('single blocked unit -> ok:false', built.ok === false);
    ok('single blocked unit -> code unit_not_taskable', built.code === 'unit_not_taskable');
    ok('single blocked unit message names the unit + reason', /U1/.test(built.message) && /needs_review/.test(built.message));
})();

// ── 2. Single taskable unit is unaffected ──────────────────────────────────
(function () {
    const ctx = taskContext({ U1: TASKABLE });
    const built = Movement.createRuntimeMovementTaskPlan(taskInput(), ctx);
    ok('single taskable unit -> ok:true', built.ok === true);
    ok('single taskable unit -> plan present', !!built.plan);
})();

// ── 3. Group task: partial block filters + reports, keeps >=2 taskable ───
(function () {
    const ctx = taskContext({ U1: TASKABLE, U2: TASKABLE, U3: BLOCKED, U4: TASKABLE });
    const input = taskInput({ movement_id: 'gate-group-1', unit_id: undefined, unit_ids: ['U1', 'U2', 'U3', 'U4'] });
    const built = Movement.createRuntimeMovementTaskPlan(input, ctx);
    ok('group with one blocked unit still succeeds', built.ok === true);
    ok('group plan drops the blocked unit from unit_ids', built.plan && built.plan.unit_ids.indexOf('U3') === -1);
    ok('group plan keeps the 3 taskable units', built.plan && built.plan.unit_ids.length === 3);
    ok('blocked_units report present and names U3', Array.isArray(built.blocked_units) &&
        built.blocked_units.length === 1 && built.blocked_units[0].id === 'U3');
})();

// ── 4. Group task: leader reassigned if the explicit leader is blocked ───
(function () {
    const ctx = taskContext({ U1: BLOCKED, U2: TASKABLE, U3: TASKABLE });
    const input = taskInput({ movement_id: 'gate-group-leader-1', unit_id: undefined,
        unit_ids: ['U1', 'U2', 'U3'], leader_unit_id: 'U1' });
    const built = Movement.createRuntimeMovementTaskPlan(input, ctx);
    ok('group succeeds despite blocked explicit leader', built.ok === true);
    ok('leader reassigned away from the blocked unit', built.plan && built.plan.leader_unit_id !== 'U1');
})();

// ── 5. Group task: fewer than 2 taskable remain -> rejected ────────────────
(function () {
    const ctx = taskContext({ U1: BLOCKED, U2: BLOCKED, U3: TASKABLE });
    const input = taskInput({ movement_id: 'gate-group-2', unit_id: undefined, unit_ids: ['U1', 'U2', 'U3'] });
    const built = Movement.createRuntimeMovementTaskPlan(input, ctx);
    ok('group with only 1 taskable unit remaining -> ok:false', built.ok === false);
    ok('group with only 1 taskable unit remaining -> code group_not_taskable', built.code === 'group_not_taskable');
})();

// ── 6. No classifier injected at all -> unchanged (pure) behavior ─────────
(function () {
    const ctx = taskContext(null); // no classifyUnit function at all
    const built = Movement.createRuntimeMovementTaskPlan(taskInput({ movement_id: 'gate-nogate-1' }), ctx);
    ok('no classifier injected -> plan still succeeds (backward compatible)', built.ok === true);
})();

// ── 7. Source-scan: free-fight-demo.js actually wires the real gate ───────
(function () {
    const ctxFn = block(ff, 'function _runtimeMovementTaskContext', 'function _rememberMovementTaskingStatus');
    ok('_runtimeMovementTaskContext injects classifyUnit', /classifyUnit\s*:\s*function/.test(ctxFn));
    ok('_runtimeMovementTaskContext delegates to the real _classifyUnit + _rawUnitByUid', /_classifyUnit\(_rawUnitByUid\(/.test(ctxFn));

    const taskCtxFn = block(ff, 'function _taskabilityCtx', 'function _isSimulationOnly');
    ok('_taskabilityCtx merges a server-derived approval flag', /serverApproved/.test(taskCtxFn));
    ok('_taskabilityCtx ORs server approval into commander_approved (never replaces the authored flag)',
        /commander_approved:\s*cmdrOk\s*\|\|\s*serverApproved/.test(taskCtxFn));

    ok('a live approval fetch exists (GET /api/scenarios/.../approval)', /\/api\/scenarios\/'\s*\+\s*encodeURIComponent\(name\)\s*\+\s*'\/approval/.test(ff));
})();

console.log('\n' + (failed === 0 ? 'OK' : 'FAIL') + ' — ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed === 0 ? 0 : 1);
