#!/usr/bin/env node
/**
 * test-scc-runtime-events-panel-1.js — Batch C Slice C6
 *
 * Runtime events / decision-points status panel: the SCC previously only
 * showed a single "next due" runtime-event hint (nextRuntimeEventLabel) and
 * a "Pending decision" panel that deliberately only lists OPEN decision
 * points (audit-confirmed gap). This slice adds:
 *   - free-fight-demo.js::_runtimeEventStatusBoard() — a per-event
 *     fired/pending/blocked/waiting + reason board, reusing Slice C5's real
 *     effect status (blocked/requires_approval/pending_effect_execution/
 *     proposed) rather than re-deriving a new classification
 *   - free-fight-demo.js::_runtimeDecisionHistoryView() — the complementary
 *     read-only view of CLOSED/RESOLVED decision points (what was chosen)
 *   - scenario-control-center.js::runtimeEventStatusBoardHtml/
 *     runtimeDecisionHistoryHtml, wired into panel5Run
 *
 * Since free-fight-demo.js/scenario-control-center.js are big window-attached
 * IIFEs (not requirable pure modules), this follows the established
 * source-scan + block-extraction pattern (test-runtime-movement-tasking-ui-1.js
 * T-13/T-16/T-17, test-mission-task-runtime-status-1.js) rather than executing
 * the engine in a sandbox.
 *
 * Proves:
 *   - both view functions exist, are exposed on the engine facade, and are
 *     wired into panel5Run
 *   - the event status board's classification reuses the REAL effect status
 *     values from Slice C5 (blocked/requires_approval/pending_effect_execution/
 *     proposed), not a re-derived/duplicated vocabulary
 *   - the decision history view only surfaces NON-open points (open ones stay
 *     in the existing Pending-decision panel — no double-listing)
 *   - both panel functions reuse the existing color-keyed status+reason idiom
 *   - neither view mutates st.open_decision_points/st.last_effects (read-only)
 *
 * Sibling to test-mission-task-runtime-status-1.js. Run:
 *   node test-scc-runtime-events-panel-1.js
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

console.log('\n=== Batch C Slice C6: runtime events / decision-points status panel ===\n');

// ── 1. Both view functions exist and are exposed on the engine facade ─────
console.log('\n[1] View functions exist and are exposed');
{
    ok(/function _runtimeEventStatusBoard\(\)/.test(ffSrc), '_runtimeEventStatusBoard() defined');
    ok(/function _runtimeEventStatusOne\(/.test(ffSrc), '_runtimeEventStatusOne() defined');
    ok(/function _runtimeDecisionHistoryView\(\)/.test(ffSrc), '_runtimeDecisionHistoryView() defined');
    ok(/runtimeEventStatusBoard:\s*function\s*\(\)\s*\{\s*try\s*\{\s*return _runtimeEventStatusBoard\(\)/.test(ffSrc),
        'engine facade exposes runtimeEventStatusBoard()');
    ok(/runtimeDecisionHistory:\s*function\s*\(\)\s*\{\s*try\s*\{\s*return _runtimeDecisionHistoryView\(\)/.test(ffSrc),
        'engine facade exposes runtimeDecisionHistory()');
}

// ── 2. Event status board reuses the REAL Slice C5 effect-status vocabulary ─
console.log('\n[2] Event status classification reuses Slice C5\'s real effect statuses (no re-derived vocabulary)');
{
    const fn = block(ffSrc, 'function _runtimeEventStatusOne', 'function _runtimeEventStatusBoard() {');
    ok(/e\.status === 'blocked'/.test(fn), 'blocked classification reads the real "blocked" effect status');
    ok(/e\.status === 'requires_approval' \|\| e\.status === 'pending_effect_execution' \|\| e\.status === 'proposed'/.test(fn),
        'pending classification reads the real requires_approval/pending_effect_execution/proposed statuses (the exact vocabulary Slice C5 produces)');
    ok(/st\.fired_ids/.test(fn), 'waiting-vs-fired is read from the real fired_ids session state, not re-derived');
}

// ── 3. Decision history only surfaces non-open points ──────────────────────
console.log('\n[3] Decision history excludes still-open points (no double-listing with the Pending-decision panel)');
{
    const fn = block(ffSrc, 'function _runtimeDecisionHistoryView', 'function _runtimeEventStatusOne(');
    ok(/if \(!point \|\| point\.status === 'open'\) return;/.test(fn), 'skips points whose status is still "open"');
    ok(/selected_option_label: point\.selected_option_label \|\| null/.test(fn), 'surfaces the real chosen option label set by _resolveRuntimeDecisionPoint');
}

// ── 4. Both views are read-only ────────────────────────────────────────────
console.log('\n[4] Both views are read-only (no state mutation)');
{
    const evFn = block(ffSrc, 'function _runtimeEventStatusOne', 'function _runtimeEventStatusBoard() {') +
                 block(ffSrc, 'function _runtimeEventStatusBoard() {', 'function _applySafeRuntimeDecisionEffects');
    const dhFn = block(ffSrc, 'function _runtimeDecisionHistoryView', 'function _runtimeEventStatusOne(');
    ok(!/st\.open_decision_points\[.*\]\s*=/.test(dhFn), 'decision history never assigns into open_decision_points');
    ok(!/st\.fired_ids\[.*\]\s*=/.test(evFn), 'event status board never assigns into fired_ids');
    ok(/read_only:\s*true/.test(evFn) && /read_only:\s*true/.test(dhFn), 'both outputs are explicitly marked read_only');
}

// ── 5. SCC panel: wired, uses the existing status+reason idiom ────────────
console.log('\n[5] SCC panel sections exist and are wired into panel5Run');
{
    ok(/function runtimeEventStatusBoardHtml\(eng\)/.test(sccSrc), 'runtimeEventStatusBoardHtml(eng) is defined');
    ok(/function runtimeDecisionHistoryHtml\(eng\)/.test(sccSrc), 'runtimeDecisionHistoryHtml(eng) is defined');
    ok(/data-scc="runtime-event-status-board"/.test(sccSrc), 'event status board renders under a real data-scc hook');
    ok(/data-scc="runtime-decision-history"/.test(sccSrc), 'decision history renders under a real data-scc hook');
    const panelBlock = block(sccSrc, 'function panel5Run', 'function panel6');
    ok(/runtimeEventStatusBoardHtml\(eng\)/.test(panelBlock), 'panel5Run calls runtimeEventStatusBoardHtml(eng)');
    ok(/runtimeDecisionHistoryHtml\(eng\)/.test(panelBlock), 'panel5Run calls runtimeDecisionHistoryHtml(eng)');
    const eventBoardFn = block(sccSrc, 'function runtimeEventStatusBoardHtml', 'function runSnapshot');
    ok(/statusColor\s*=\s*\{\s*fired:\s*C\.good,\s*pending:\s*C\.warn,\s*blocked:\s*C\.bad,\s*waiting:\s*C\.dim\s*\}/.test(eventBoardFn),
        'event board uses the existing color-keyed status idiom (not a new vocabulary)');
}

console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
