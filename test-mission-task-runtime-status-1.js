#!/usr/bin/env node
/**
 * test-mission-task-runtime-status-1.js — Batch C Slice C3
 *
 * Mission-task runtime status overlay: a read-only view over authored
 * mission_tasks[] (free-fight-demo.js::_missionTaskRuntimeStatus, exposed as
 * engine.missionTaskRuntimeStatus()), surfaced in the SCC as a new
 * `data-scc="mission-task-status"` panel section
 * (scenario-control-center.js::missionTaskStatusHtml). Mirrors the existing
 * runtime_positions/runtime_world_state.positions convention: authored
 * scenario.mission_tasks[] is never mutated, this is a parallel computed
 * view, same as Locked Decision 2 in the plan.
 *
 * Since free-fight-demo.js is a big window-attached IIFE (not a requirable
 * pure module), this is a source-scan + block-extraction test in the same
 * style as test-runtime-movement-tasking-ui-1.js's T-13/T-16/T-17 — it
 * verifies the real function bodies, not a reimplementation.
 *
 * Proves:
 *   - _missionTaskRuntimeStatus/_missionTaskRuntimeStatusOne exist and are
 *     exposed on the engine facade as missionTaskRuntimeStatus()
 *   - status classification order: disabled -> not_yet_due -> window_closed
 *     -> no_route_authored -> no_unit_assigned -> (started ? active/complete
 *     : probed taskability) -- source-scan of the real decision tree
 *   - the "why not started yet" reason reuses the SAME
 *     createRuntimeMovementTaskPlan probe Slices C1/C2 use to actually start
 *     movement, not a re-derived/duplicated reason string
 *   - the overlay never writes back onto task/scenario objects (read-only)
 *   - the SCC panel section exists, is wired into panel5Run alongside the
 *     existing movement summary, and uses the same status+reason idiom
 *     (color-keyed status, not a new vocabulary)
 *
 * Sibling to test-mission-task-movement-1.js / test-mission-task-group-movement-1.js.
 * Run: node test-mission-task-runtime-status-1.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const ffSrc = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/free-fight-demo.js'), 'utf8');
const sccSrc = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/scenario-control-center.js'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  ok   ' + label); pass++; }
    else      { console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function block(src, from, to) {
    const a = src.indexOf(from);
    if (a < 0) return '';
    const b = to ? src.indexOf(to, a + from.length) : -1;
    return src.slice(a, b < 0 ? a + 4000 : b);
}

console.log('\n=== Batch C Slice C3: mission-task runtime status overlay + SCC display ===\n');

// ── 1. Functions exist and are exposed on the engine facade ───────────────
console.log('\n[1] Overlay functions exist and are exposed');
{
    ok(/function _missionTaskRuntimeStatus\(\)/.test(ffSrc), '_missionTaskRuntimeStatus() defined');
    ok(/function _missionTaskRuntimeStatusOne\(/.test(ffSrc), '_missionTaskRuntimeStatusOne() defined');
    ok(/missionTaskRuntimeStatus:\s*function\s*\(\)\s*\{\s*try\s*\{\s*return _missionTaskRuntimeStatus\(\)/.test(ffSrc),
        'engine facade exposes missionTaskRuntimeStatus()');
}

// ── 2. Status classification order (source-scan of the real decision tree) ─
console.log('\n[2] Status classification order matches the design (disabled -> due -> window -> route -> unit -> movement -> probe)');
{
    const fn = block(ffSrc, 'function _missionTaskRuntimeStatusOne', 'function _missionTaskRuntimeStatus() {');
    const disabledIdx = fn.indexOf("out.reason = 'disabled'");
    const dueIdx = fn.indexOf("out.reason = 'not_yet_due'");
    const windowIdx = fn.indexOf("out.reason = 'window_closed'");
    const routeIdx = fn.indexOf("out.reason = 'no_route_authored'");
    const unitIdx = fn.indexOf("out.reason = 'no_unit_assigned'");
    const movementLookupIdx = fn.indexOf('_missionTaskMovementLookup(');
    const probeIdx = fn.indexOf('createRuntimeMovementTaskPlan(probeInput');
    ok([disabledIdx, dueIdx, windowIdx, routeIdx, unitIdx, movementLookupIdx, probeIdx].every(function (i) { return i >= 0; }),
        'all classification branches are present');
    ok(disabledIdx < dueIdx && dueIdx < windowIdx && windowIdx < routeIdx && routeIdx < unitIdx && unitIdx < movementLookupIdx && movementLookupIdx < probeIdx,
        'branches are checked in the documented precedence order');
}

// ── 3. The "why not started" probe reuses the real Slice C1/C2 input shape ─
// Uses the same whole-function block as section 2 rather than a literal
// multi-line substring search — this file has a history of CRLF/LF drift
// (see [[project_mixed_line_endings_unit_status_panel]]), and a hardcoded
// "\n        " sequence is fragile against exactly that.
console.log('\n[3] Not-yet-started reason reuses the SAME plan-building call Slices C1/C2 use to actually start movement');
{
    const fn = block(ffSrc, 'function _missionTaskRuntimeStatusOne', 'function _missionTaskRuntimeStatus() {');
    ok(/probeInput\.unit_ids = groupUnitIds; probeInput\.leader_unit_id = task\.unit_id \|\| groupUnitIds\[0\];/.test(fn),
        'group probe input mirrors the real start-movement input shape');
    ok(/probeInput\.unit_id = task\.unit_id;/.test(fn),
        'single-unit probe input mirrors the real start-movement input shape');
    ok(/out\.reason = \(probe && probe\.message\) \|\| 'not_taskable';/.test(fn),
        'blocked reason is the REAL message createRuntimeMovementTaskPlan produced, not a re-derived guess');
}

// ── 4. Read-only — never writes back onto scenario.mission_tasks[] ────────
console.log('\n[4] Overlay is read-only (mirrors the runtime_positions convention, not a mutation)');
{
    const fn = block(ffSrc, 'function _missionTaskRuntimeStatusOne', 'function _missionTaskRuntimeStatus() {');
    ok(!/task\.status\s*=/.test(fn), 'never assigns task.status (authored data stays as-authored)');
    ok(!/sc\.mission_tasks/.test(fn), 'never touches scenario.mission_tasks directly');
    ok(/read_only:\s*true/.test(fn), 'output is explicitly marked read_only, matching the rest of the codebase\'s overlay idiom');
}

// ── 5. SCC panel: wired, uses the existing status+reason idiom ────────────
console.log('\n[5] SCC panel section exists and is wired into panel5Run');
{
    ok(/function missionTaskStatusHtml\(eng\)/.test(sccSrc), 'missionTaskStatusHtml(eng) is defined');
    ok(/data-scc="mission-task-status"/.test(sccSrc), 'renders under a real data-scc hook');
    const panelBlock = block(sccSrc, 'function panel5Run', 'function panel6');
    ok(/missionTaskStatusHtml\(eng\)/.test(panelBlock), 'panel5Run calls missionTaskStatusHtml(eng)');
    const htmlFn = block(sccSrc, 'function missionTaskStatusHtml', 'function movementTaskingHtml');
    ok(/eng\.missionTaskRuntimeStatus/.test(htmlFn), 'reads eng.missionTaskRuntimeStatus() via the engine facade');
    ok(/statusColor\s*=\s*\{\s*active:\s*C\.good,\s*complete:\s*C\.ink,\s*blocked:\s*C\.bad,\s*waiting:\s*C\.dim\s*\}/.test(htmlFn),
        'uses the existing color-keyed status idiom (not a new vocabulary)');
    ok(/t\.reason \? \(' \(' \+ esc\(t\.reason\) \+ '\)'\) : ''/.test(htmlFn), 'reason is rendered alongside status, same as approvalSummaryHtml/doctrine gate');
}

console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
