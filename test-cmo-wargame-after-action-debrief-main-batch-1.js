/* ============================================================================
 * test-cmo-wargame-after-action-debrief-main-batch-1.js
 * RMOOZ-CMO-WARGAME-AAR-1 - Main After-Action Debrief Gate
 * ----------------------------------------------------------------------------
 * Main-app-only gate for the read-only CMO war-game after-action debrief.
 * This test does not touch, inspect, sync, rebuild, or run offline files.
 * Offline sync/testing is pending by user instruction.
 * ========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var SHELL = path.join(ROOT, 'UI_MOdified', 'client', 'shell');
var AAR_FILE = path.join(SHELL, 'cmo-wargame-after-action-debrief.js');
var RUN_FILE = path.join(SHELL, 'cmo-wargame-run-instrumentation.js');

var passed = 0, failed = 0;
function assert(label, cond) {
    if (cond) { console.log('  PASS  ' + label); passed++; }
    else { console.error('  FAIL  ' + label); failed++; }
}
function src(file) { return fs.readFileSync(file, 'utf8'); }
function shell(name) { return require(path.join(SHELL, name)); }
function arr(v) { return Array.isArray(v) ? v : []; }
function obj(v) { return v && typeof v === 'object' ? v : {}; }
function hasAll(text, needles) { return needles.every(function (needle) { return String(text).indexOf(needle) !== -1; }); }
function cleanSource(text) {
    return String(text || '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
}
function instrumentation(state, opts) {
    opts = opts || {};
    return {
        version: '1.0.0-cmo-wargame-run-instrumentation-1',
        scenario_fingerprint: opts.fingerprint || 'scenario-aar',
        run_mode: opts.run_mode || { key: 'release_grade', label: 'Release-grade CMO test', allowed: true },
        control_center: {
            state: state,
            state_label: opts.state_label || state,
            scenario_turn: opts.turn == null ? 2 : opts.turn,
            current_actor: opts.actor || 'BLUE-1',
            current_phase_name: opts.phase || 'Phase 1',
            scenario_status: opts.scenario_status || (state === 'scenario_complete' ? 'complete' : 'running')
        },
        current_operator_step: { key: opts.step_key || 'observe', title: opts.step_title || 'Observe evidence', status: state === 'scenario_blocked' ? 'blocked' : 'active' },
        observe_checklist: opts.observe || [
            { key: 'control_center', label: 'Scenario Control Center state', detail: state, status: 'pass' },
            { key: 'release_gate', label: 'Evidence release gate', detail: 'Ready / blockers 0', status: 'pass' },
            { key: 'handoff', label: 'Handoff acceptance', detail: 'Accepted', status: 'pass' }
        ],
        pause_abort_warning: opts.warning || { key: 'no_active_warning', status: 'pass', label: 'No active pause / abort warning', detail: 'Continue observing.' },
        after_action_checklist: opts.after || [
            { key: 'save_readiness', label: 'Save/read the readiness decision used for the run.', status: state === 'scenario_complete' ? 'pending' : 'locked' },
            { key: 'review_force_report', label: 'Review force evidence report and outcome explanations.', status: state === 'scenario_complete' ? 'pending' : 'locked' }
        ],
        evidence_state: opts.evidence_state || { release_status: 'ready_for_release', blocker_count: 0, review_issues: 0 },
        evidence_changes: opts.changes || [],
        read_only: true
    };
}

console.log('\n=== RMOOZ-CMO-WARGAME-AAR-1 Main Gate ===\n');

var AAR = shell('cmo-wargame-after-action-debrief.js');

console.log('--- CMO-AAR-1: module API and main-only foundation ---');
(function () {
    assert('T-1  AAR module exists', fs.existsSync(AAR_FILE));
    assert('T-2  run instrumentation foundation exists', fs.existsSync(RUN_FILE));
    assert('T-3  API version exposed', AAR.CMO_WARGAME_AFTER_ACTION_DEBRIEF_VERSION === '1.0.0-rmooz-cmo-wargame-aar-1');
    assert('T-4  public API methods exposed', ['buildDebrief', 'classifyOutcome', 'countByStatus', 'summaryText', 'renderDebriefHtml'].every(function (name) { return typeof AAR[name] === 'function'; }));
})();

console.log('\n--- CMO-AAR-2: outcome classification and release interpretation ---');
(function () {
    var complete = AAR.buildDebrief(instrumentation('scenario_complete'));
    var training = AAR.buildDebrief(instrumentation('scenario_complete', { run_mode: { key: 'training_preview', label: 'Training preview only', allowed: true } }));
    var blocked = AAR.buildDebrief(instrumentation('scenario_blocked', { warning: { key: 'scenario_blocked', status: 'fail', label: 'Pause / abort warning', detail: 'pending replan' } }));
    var notRun = AAR.buildDebrief(instrumentation('no_scenario', { run_mode: { key: 'blocked', label: 'Blocked until evidence fixes', allowed: false } }));
    assert('T-1  completed release-grade run is completed candidate', complete.outcome.key === 'completed' && /release-grade/.test(complete.release_interpretation));
    assert('T-2  training run is never release-grade', training.outcome.key === 'training_complete' && /training-only/.test(training.release_interpretation));
    assert('T-3  blocked run is blocked outcome', blocked.outcome.key === 'blocked' && blocked.outcome.severity === 'fail');
    assert('T-4  readiness-blocked run is not_run', notRun.outcome.key === 'not_run' && /not release-grade/.test(notRun.release_interpretation));
})();

console.log('\n--- CMO-AAR-3: unresolved items, recommendations, and timeline ---');
(function () {
    var debrief = AAR.buildDebrief(instrumentation('scenario_blocked', {
        warning: { key: 'scenario_blocked', status: 'fail', label: 'Pause / abort warning', detail: 'pending replan' },
        observe: [
            { key: 'release_gate', label: 'Evidence release gate', detail: 'Not Ready / blockers 2', status: 'fail' },
            { key: 'handoff', label: 'Handoff acceptance', detail: 'Pending Decision', status: 'warn' },
            { key: 'review_queue', label: 'Review queue', detail: '3 issue(s)', status: 'warn' }
        ],
        changes: [{ key: 'release_status', label: 'Release status', previous: 'ready_for_release', current: 'not_ready' }]
    }));
    assert('T-1  unresolved items include warning and failed checklist', arr(debrief.unresolved_items).length >= 3 && debrief.unresolved_items[0].source === 'pause_abort_warning');
    assert('T-2  recommendations include release/handoff/review fixes', hasAll(arr(debrief.recommendations).map(function (r) { return r.label; }).join('\n'), ['Release Gate', 'handoff', 'Review Queue']));
    assert('T-3  timeline captures SCC state, turn, phase, step, warning', arr(debrief.timeline).map(function (t) { return t.key; }).join('|') === 'state|turn|phase|operator_step|warning');
    assert('T-4  evidence changes are preserved', arr(debrief.evidence_changes).length === 1 && debrief.evidence_changes[0].current === 'not_ready');
})();

console.log('\n--- CMO-AAR-4: summaries, render output, and fallback ---');
(function () {
    var debrief = AAR.buildDebrief(instrumentation('scenario_complete', {
        changes: [{ key: 'decision_log_count', label: 'Decision log count', previous: 1, current: 4 }]
    }));
    var text = AAR.summaryText(debrief);
    var html = AAR.renderDebriefHtml(debrief);
    assert('T-1  summary text is operator-readable', hasAll(text, ['CMO War-Game After-Action Debrief', 'Outcome:', 'Release interpretation:', 'Recommendations:', 'Read-only debrief']));
    assert('T-2  render includes bilingual heading and AAR sections', hasAll(html, ['CMO War-Game After-Action Debrief', 'مراجعة ما بعد اختبار المناورة', 'Run timeline', 'Evidence changes', 'Recommendations']));
    assert('T-3  fallback from null input is safe/read-only', AAR.buildDebrief(null).read_only === true && AAR.renderDebriefHtml(null).indexOf('CMO War-Game After-Action Debrief') !== -1);
    assert('T-4  countByStatus is deterministic', AAR.countByStatus([{ status: 'pass' }, { status: 'warn' }, { status: 'fail' }]).total === 3);
})();

console.log('\n--- CMO-AAR-5: strict boundaries ---');
(function () {
    var source = cleanSource(src(AAR_FILE));
    [
        ['no fetch/network/backend route', /fetch\s*\(|XMLHttpRequest|\/api\//],
        ['no browser database/storage writes', /indexedDB|openDatabase|localStorage\s*\./i],
        ['no DOCX/stage-doc/SLOT_FILE path', /stage-doc|SLOT_FILE|docs\.red|docs\.blue|DOCX/i],
        ['no combat/action/doctrine mutation', /applyAction|commitAction|executeAction|autoFire|auto-fire|applyDoctrine|commitDoctrine|setDoctrine|\/doctrine/i],
        ['no protected runtime files referenced', /legacy-shim-attack_objective_draft-15\.jsonl|scenario_overrides\.json/]
    ].forEach(function (pair) { assert('T-boundary  ' + pair[0], !pair[1].test(source)); });
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
