/* ============================================================================
 * test-cmo-wargame-after-action-debrief-main-batch-1.js
 * CMO-WARGAME-AAR-1 - Main After-Action Debrief Gate
 * ----------------------------------------------------------------------------
 * Main-app-only gate. It verifies the CMO war-game after-action debrief is
 * read-only, derives outcome and release meaning from live run instrumentation,
 * renders automatically from the Unit Status / Scenario Evidence CMO panel for
 * completed or blocked runs, and keeps offline sync/testing pending.
 * ========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var APP = path.join(ROOT, 'UI_MOdified', 'client', 'app.html');
var UNIT = path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'unit-status-panel.js');
var AAR_PATH = path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'cmo-wargame-after-action-debrief.js');
var INVENTORY = path.join(ROOT, 'APP_INVENTORY.md');
var RUNBOOK = path.join(ROOT, 'UI_MOdified', 'docs', 'cmo-evidence-demo-runbook.md');

var passed = 0, failed = 0;
function assert(label, cond) {
    if (cond) { console.log('  PASS  ' + label); passed++; }
    else { console.error('  FAIL  ' + label); failed++; }
}
function src(file) { return fs.readFileSync(file, 'utf8'); }
function arr(v) { return Array.isArray(v) ? v : []; }
function freshRequire(file) {
    delete require.cache[require.resolve(file)];
    return require(file);
}
function stripComments(text) {
    return String(text || '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
}
function baseInstrumentation(overrides) {
    overrides = overrides || {};
    var base = {
        version: 'test-run-instrumentation',
        generated_at: '2026-07-03T00:00:00Z',
        scenario_fingerprint: 'fp-aar-1',
        read_only: true,
        run_mode: { key: 'release_grade', label: 'Release-grade CMO run', allowed: true },
        control_center: {
            available: true,
            state: 'scenario_complete',
            state_label: 'Complete',
            scenario_status: 'complete',
            scenario_turn: 5,
            current_actor: 'BLUE',
            current_phase_name: 'Phase C',
            objective_control: 'BLUE holds Objective X',
            movement_summary: { moved: 2 }
        },
        current_operator_step: { key: 'after_action', title: 'After-action review', status: 'pending' },
        observe_checklist: [
            { key: 'release_gate', label: 'Evidence release gate', detail: 'Ready / blockers 0', status: 'pass' },
            { key: 'review_queue', label: 'Review queue', detail: '0 issue(s) still visible', status: 'pass' }
        ],
        pause_abort_warning: { key: 'no_active_warning', status: 'pass', label: 'No active pause / abort warning', detail: 'Continue review.' },
        after_action_checklist: [
            { key: 'review_report', label: 'Review force report and release certificate.' },
            { key: 'capture_notes', label: 'Capture operator notes.' }
        ],
        evidence_state: {
            scenario_fingerprint: 'fp-aar-1',
            scc_state: 'scenario_complete',
            scenario_status: 'complete',
            scenario_turn: 5,
            current_actor: 'BLUE',
            current_phase_name: 'Phase C',
            objective_control: 'BLUE holds Objective X',
            movement_trace_count: 2,
            decision_log_count: 3,
            release_status: 'ready',
            blocker_count: 0,
            closeout_status: 'ready',
            handoff_decision: 'accepted',
            review_issues: 0
        },
        evidence_changes: [
            { key: 'release_status', label: 'Release status', previous: 'not_ready', current: 'ready' },
            { key: 'blocker_count', label: 'Release blocker count', previous: 2, current: 0 }
        ],
        source: 'test'
    };
    Object.keys(overrides).forEach(function (key) {
        if (base[key] && typeof base[key] === 'object' && !Array.isArray(base[key]) && overrides[key] && typeof overrides[key] === 'object' && !Array.isArray(overrides[key])) {
            base[key] = Object.assign({}, base[key], overrides[key]);
        } else {
            base[key] = overrides[key];
        }
    });
    return base;
}
function containsItem(list, rx) {
    return arr(list).some(function (item) { return rx.test(String(item.label || item.detail || '')); });
}

console.log('\n=== CMO-WARGAME-AAR-1 Main Gate ===\n');

console.log('--- AAR-1: debrief module API and release-grade interpretation ---');
(function () {
    var AAR = freshRequire(AAR_PATH);
    assert('T-1  module exports debrief API', !!AAR && typeof AAR.buildDebrief === 'function' && typeof AAR.renderDebriefHtml === 'function');
    var debrief = AAR.buildDebrief(baseInstrumentation());
    assert('T-2  completed release-grade run classifies as completed', debrief.outcome.key === 'completed' && debrief.outcome.status === 'pass');
    assert('T-3  completed clean run becomes release-grade evidence candidate', debrief.release_interpretation.key === 'release_grade_candidate' && debrief.release_interpretation.status === 'pass');
    assert('T-4  debrief captures timeline, evidence changes, recommendations, and checklist', debrief.run_timeline.length >= 6 && debrief.evidence_changes.length === 2 && debrief.recommendations.length > 0 && debrief.after_action_checklist.length === 2);
    assert('T-5  completed debrief is visible for automatic panel rendering', debrief.visible === true && AAR.shouldRenderDebrief(debrief) === true);
    assert('T-6  countByStatus compatibility helper remains deterministic', AAR.countByStatus([{ status: 'pass' }, { status: 'warn' }, { status: 'fail' }]).total === 3);
    var summary = AAR.summaryText(debrief);
    var html = AAR.renderDebriefHtml(debrief);
    assert('T-7  summary explains outcome, release meaning, blockers, and read-only boundary', /Outcome: Completed/.test(summary) && /Release interpretation: Release-grade evidence candidate/.test(summary) && /Unresolved blockers: 0/.test(summary) && /Read-only debrief/.test(summary));
    assert('T-8  HTML renderer exposes after-action debrief sections', html.indexOf('data-cmo-after-action-debrief="true"') !== -1 && html.indexOf('Run timeline') !== -1 && html.indexOf('Evidence changes') !== -1 && html.indexOf('After-action checklist') !== -1);
})();

console.log('\n--- AAR-2: training, blocked, and not-authorized outcomes stay distinct ---');
(function () {
    var AAR = freshRequire(AAR_PATH);
    var training = AAR.buildDebrief(baseInstrumentation({
        run_mode: { key: 'training_preview', label: 'Training preview', allowed: true },
        evidence_state: { release_status: 'not_ready', blocker_count: 1, review_issues: 1, handoff_decision: 'accepted_with_warnings' },
        observe_checklist: [
            { key: 'release_gate', label: 'Evidence release gate', detail: 'Not Ready / blockers 1', status: 'fail' },
            { key: 'review_queue', label: 'Review queue', detail: '1 issue still visible', status: 'warn' }
        ]
    }));
    assert('T-1  completed training run classifies as training completed', training.outcome.key === 'training_completed' && training.release_interpretation.key === 'training_only_evidence');
    assert('T-2  training debrief keeps blockers and review warnings visible', containsItem(training.unresolved_blockers, /Release blockers/) && containsItem(training.unresolved_blockers, /Review queue/));

    var blocked = AAR.buildDebrief(baseInstrumentation({
        run_mode: { key: 'cautious_test', label: 'Cautious CMO test', allowed: true },
        control_center: { state: 'scenario_blocked', state_label: 'Blocked', scenario_status: 'blocked', pending_replan_reason: 'RED reaction requires replan' },
        evidence_state: { scc_state: 'scenario_blocked', scenario_status: 'blocked', blocker_count: 2, review_issues: 1 },
        pause_abort_warning: { key: 'scenario_blocked', status: 'fail', label: 'Pause / abort warning', detail: 'RED reaction requires replan' }
    }));
    assert('T-3  blocked SCC run classifies as blocked / paused', blocked.outcome.key === 'blocked_paused' && blocked.visible === true);
    assert('T-4  blocked debrief recommends pause/replan review', containsItem(blocked.recommendations, /Pause the operator journey|replan/i));

    var denied = AAR.buildDebrief(baseInstrumentation({
        run_mode: { key: 'blocked', label: 'Blocked until evidence fixes', allowed: false },
        control_center: { state: 'committed', state_label: 'Committed', scenario_status: 'committed' },
        evidence_state: { scc_state: 'committed', scenario_status: 'committed', release_status: 'not_ready', blocker_count: 3, review_issues: 2 },
        pause_abort_warning: { key: 'run_mode_blocked', status: 'fail', label: 'Do not run', detail: 'CMO readiness is blocked.' }
    }));
    assert('T-5  pre-run readiness denial classifies as not authorized', denied.outcome.key === 'not_authorized' && denied.release_interpretation.key === 'not_release_grade');
    assert('T-6  not-authorized debrief is not auto-rendered as post-run AAR', denied.visible === false && AAR.shouldRenderDebrief(denied) === false);
})();

console.log('\n--- AAR-3: main panel wiring, docs, and strict boundary ---');
(function () {
    var app = src(APP);
    var unit = src(UNIT);
    var aar = src(AAR_PATH);
    var inventory = src(INVENTORY);
    var runbook = src(RUNBOOK);
    var order = [
        'shell/cmo-wargame-run-instrumentation.js?v=cmo-wargame-run-1',
        'shell/cmo-wargame-after-action-debrief.js?v=cmo-wargame-aar-1',
        'shell/unit-status-panel.js'
    ].map(function (needle) { return app.indexOf(needle); });
    assert('T-1  AAR module loads after run instrumentation and before Unit Status', order.every(function (idx) { return idx !== -1; }) && order[0] < order[1] && order[1] < order[2]);
    assert('T-2  app styles after-action debrief and responsive meta grid', app.indexOf('.cmo-wargame-after-action-debrief') !== -1 && app.indexOf('data-cmo-after-action-debrief') === -1 && app.indexOf('.cmo-wargame-after-action-debrief-meta { grid-template-columns:repeat(2') !== -1);
    assert('T-3  Unit Status builds, stores, and renders AAR output inside CMO panel', unit.indexOf('RmoozCmoWarGameAfterActionDebrief') !== -1 && unit.indexOf('_cmoWarGameAfterActionDebrief') !== -1 && unit.indexOf('renderDebriefHtml') !== -1 && unit.indexOf('shouldRenderDebrief') !== -1);
    assert('T-4  docs describe automatic After-Action Debrief testing value', runbook.indexOf('CMO War-Game After-Action Debrief appears automatically') !== -1 && runbook.indexOf('release-grade evidence') !== -1);
    assert('T-5  inventory records CMO-WARGAME-AAR-1 with offline pending', inventory.indexOf('CMO-WARGAME-AAR-1') !== -1 && inventory.indexOf('cmo-wargame-after-action-debrief.js') !== -1 && inventory.indexOf('Offline sync/testing: pending by user instruction') !== -1);

    var unitSnippet = unit.slice(unit.indexOf('function buildCmoWarGameState'), unit.indexOf('function copyCmoWarGameReadinessBrief'));
    [
        ['AAR module has no fetch/network route', /fetch\s*\(|XMLHttpRequest|\/api\//],
        ['AAR module has no storage/database write', /localStorage\s*\.|sessionStorage\s*\.|indexedDB|openDatabase/i],
        ['AAR module has no combat/action/doctrine mutation API', /applyAction|commitAction|executeAction|autoFire|auto-fire|applyDoctrine|commitDoctrine|setDoctrine|\/doctrine/i],
        ['AAR module has no DOCX staging revival', /stage-doc|SLOT_FILE|docs\.red|docs\.blue|\.docx/i],
        ['AAR module has no protected runtime references', /scenario_overrides\.json|legacy-shim-attack_objective_draft-15\.jsonl|data\/users\/.*plans/i],
        ['Unit wiring snippet has no backend or mutation call', /fetch\s*\(|XMLHttpRequest|\/api\/|applyAction|commitAction|executeAction|applyDoctrine|commitDoctrine|setDoctrine/i]
    ].forEach(function (pair) {
        var haystack = pair[0].indexOf('Unit wiring') === 0 ? stripComments(unitSnippet) : stripComments(aar);
        assert('T-boundary  ' + pair[0], !pair[1].test(haystack));
    });
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
