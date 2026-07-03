/* ============================================================================
 * test-cmo-wargame-run-instrumentation-main-batch-1.js
 * CMO-WARGAME-RUN-INSTRUMENTATION-1 - Main Run Instrumentation Gate
 * ----------------------------------------------------------------------------
 * Main-app-only gate. It verifies the CMO war-game readiness/test-card layer is
 * connected to the Scenario Control Center run snapshot and can surface current
 * run mode, operator step, observe checklist, pause/abort warning, after-action
 * checklist, and evidence changes while staying display-only.
 * ========================================================================== */
'use strict';

var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var APP = path.join(ROOT, 'UI_MOdified', 'client', 'app.html');
var UNIT = path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'unit-status-panel.js');
var SCC_PATH = path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'scenario-control-center.js');
var RUN_PATH = path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'cmo-wargame-run-instrumentation.js');
var INVENTORY = path.join(ROOT, 'APP_INVENTORY.md');
var RUNBOOK = path.join(ROOT, 'UI_MOdified', 'docs', 'cmo-evidence-demo-runbook.md');

var passed = 0, failed = 0;
function assert(label, cond) {
    if (cond) { console.log('  PASS  ' + label); passed++; }
    else { console.error('  FAIL  ' + label); failed++; }
}
function src(file) { return fs.readFileSync(file, 'utf8'); }
function arr(v) { return Array.isArray(v) ? v : []; }
function stripComments(text) {
    return String(text || '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
}
function freshRequire(file) {
    delete require.cache[require.resolve(file)];
    return require(file);
}
function makeEngine(overrides) {
    overrides = overrides || {};
    var scn = Object.assign({
        scenario_active: true,
        scenario_status: 'running',
        scenario_turn: 3,
        current_actor: 'BLUE',
        objective_control: 'contested'
    }, overrides.scenarioRuntime || {});
    var ex = Object.assign({
        active: true,
        current_phase_index: 1,
        phase_status: 'running',
        selected_coa: {
            plan_id: 'COA-A',
            phases: [
                { name: 'Phase A' },
                { name: 'Phase B' }
            ]
        }
    }, overrides.committedExec || {});
    return {
        isLoading: function () { return !!overrides.loading; },
        scenarioRuntime: function () { return scn; },
        committedExec: function () { return ex; },
        committedIsStale: function () { return !!overrides.stale; },
        coaPlan: function () { return overrides.coaPlan || null; },
        readiness: function () {
            return Object.assign({
                units_loaded: true,
                objective_set: true,
                executable: true,
                taskable: 4,
                blocked: 0,
                scenario_name: 'Objective X',
                data_reliability: 'operational',
                source_status: 'sourced'
            }, overrides.readiness || {});
        },
        executedTrace: function () {
            return overrides.executedTrace || [
                { uid: 'BLUE-1', to: { lat: 24.1, lon: 54.2 } }
            ];
        },
        movementDebug: function () {
            return overrides.movementDebug || [
                { uid: 'BLUE-1', moved: true, source: 'ai_behavior' }
            ];
        },
        decisionLog: function () {
            return overrides.decisionLog || [
                { role: 'BLUE', action: 'advance', result_summary: 'moved toward objective' }
            ];
        },
        networkCalls: function () { return overrides.networkCalls || []; },
        runBlockedReason: function () { return overrides.runBlockedReason || null; },
        whiteOutcome: function () { return overrides.whiteOutcome || { summary: 'training outcome pending' }; },
        greenStatus: function () { return overrides.greenStatus || { status: 'observing' }; },
        autoContinueEnabled: function () { return true; }
    };
}
function loadSccWithEngine(engine) {
    global.window = { RmoozFreeFightDemo: { engine: engine } };
    global.RmoozFreeFightDemo = { engine: engine };
    return freshRequire(SCC_PATH);
}
function card() {
    return {
        version: 'test-card',
        scenario_fingerprint: 'fp-cmo-run',
        decision: 'go_with_warnings',
        run_mode: { key: 'cautious_test', label: 'Cautious CMO test', label_ar: '', allowed: true },
        operator_steps: [
            { key: 'preflight', title: 'Preflight readiness', detail: 'Confirm readiness.', status: 'warn', operator_action: 'Open CMO readiness.' },
            { key: 'prepare_coa', title: 'Prepare / review COA', detail: 'Review plan.', status: 'pending', operator_action: 'Prepare COA.' },
            { key: 'commit_order', title: 'Commit selected COA', detail: 'Commit current plan.', status: 'pending', operator_action: 'Commit order.' },
            { key: 'run_wargame', title: 'Run CMO war-game', detail: 'Run while observing evidence.', status: 'pending', operator_action: 'Start or continue run.' },
            { key: 'observe', title: 'Observe evidence', detail: 'Watch release and handoff deltas.', status: 'pending', operator_action: 'Pause on blockers.' },
            { key: 'after_action', title: 'After-action review', detail: 'Review final evidence.', status: 'pending', operator_action: 'Export/read report.' }
        ],
        observation_focus: [],
        abort_criteria: [],
        after_action_checklist: [
            { key: 'review_gates', label: 'Review pass/warn/fail gates after the run.' },
            { key: 'review_force_report', label: 'Review force evidence report and outcome explanations.' }
        ],
        read_only: true
    };
}
function flowSnapshot() {
    return {
        scenario_fingerprint: 'fp-cmo-run',
        summary: {
            scenario_fingerprint: 'fp-cmo-run',
            review_issues: 1,
            closeout_status: 'ready_with_exceptions',
            closeout_label_en: 'Ready with Exceptions',
            handoff_decision: 'accepted_with_warnings',
            handoff_label_en: 'Accepted with Warnings',
            release_status: 'not_ready',
            release_label_en: 'Not Ready',
            releasable: false,
            blocker_count: 2
        },
        release_gate: { status: 'not_ready', status_label_en: 'Not Ready', releasable: false, blockers: [{}, {}] },
        closeout: { status: 'ready_with_exceptions', status_label_en: 'Ready with Exceptions' },
        handoff_acceptance: { decision: 'accepted_with_warnings', decision_label_en: 'Accepted with Warnings' },
        review_queue: { total_issues: 1 },
        read_only: true
    };
}
function hasChange(changes, key) {
    return arr(changes).some(function (change) { return change.key === key; });
}

console.log('\n=== CMO-WARGAME-RUN-INSTRUMENTATION-1 Main Gate ===\n');

console.log('--- CMO-RUN-1: Scenario Control Center read-only run snapshot ---');
(function () {
    var SCC = loadSccWithEngine(makeEngine());
    assert('T-1  Scenario Control Center exports runSnapshot', !!SCC && typeof SCC.runSnapshot === 'function');
    var snap = SCC.runSnapshot();
    assert('T-2  snapshot reports current SCC running state', snap.state === 'scenario_running' && snap.state_label === 'Running');
    assert('T-3  snapshot includes current turn, actor, and phase', snap.scenario_turn === 3 && snap.current_actor === 'BLUE' && snap.current_phase_name === 'Phase B');
    assert('T-4  snapshot summarizes live movement and decisions', snap.movement_trace_count === 1 && snap.movement_summary.moved === 1 && snap.decision_log_count === 1);

    var blocked = loadSccWithEngine(makeEngine({
        scenarioRuntime: { pending_replan_reason: 'RED reaction requires replan' }
    })).runSnapshot();
    assert('T-5  pending replan maps to blocked run state', blocked.state === 'scenario_blocked' && blocked.pending_replan_reason === 'RED reaction requires replan');
})();

console.log('\n--- CMO-RUN-2: CMO instrumentation translates run state into operator cues ---');
(function () {
    var RI = freshRequire(RUN_PATH);
    RI._resetEvidenceMemoryForTest();
    var running = {
        available: true,
        state: 'scenario_running',
        state_label: 'Running',
        scenario_status: 'running',
        scenario_turn: 3,
        current_actor: 'BLUE',
        current_phase_name: 'Phase B',
        objective_control: 'contested',
        movement_trace_count: 1,
        movement_debug_count: 1,
        movement_summary: { total: 1, moved: 1, blocked: 0 },
        decision_log_count: 1
    };
    var previous = {
        scc_state: 'committed',
        scenario_status: '',
        scenario_turn: 2,
        current_actor: '',
        current_phase_name: 'Phase A',
        objective_control: '',
        movement_trace_count: 0,
        movement_debug_count: 0,
        decision_log_count: 0,
        release_status: 'incomplete',
        blocker_count: 3,
        closeout_status: 'incomplete',
        handoff_decision: 'pending',
        review_issues: 2
    };
    var inst = RI.buildRunInstrumentation(card(), {
        scc_snapshot: running,
        flow_snapshot: flowSnapshot(),
        previous_evidence_state: previous,
        track_evidence_changes: false,
        generated_at: '2026-07-03T00:00:00Z'
    });
    assert('T-1  running SCC maps to Run CMO war-game operator step', inst.current_operator_step.key === 'run_wargame' && inst.current_operator_step.title === 'Run CMO war-game');
    assert('T-2  observe checklist marks movement and decision evidence live', inst.observe_checklist.some(function (item) { return item.key === 'movement_evidence' && item.status === 'pass'; }) && inst.observe_checklist.some(function (item) { return item.key === 'decision_log' && item.status === 'pass'; }));
    assert('T-3  visible release blockers produce a caution warning during run', inst.pause_abort_warning.status === 'warn' && /release blocker/.test(inst.pause_abort_warning.detail));
    assert('T-4  evidence deltas include turn, movement, blockers, and handoff changes', hasChange(inst.evidence_changes, 'scenario_turn') && hasChange(inst.evidence_changes, 'movement_trace_count') && hasChange(inst.evidence_changes, 'blocker_count') && hasChange(inst.evidence_changes, 'handoff_decision'));

    var blocked = RI.buildRunInstrumentation(card(), {
        scc_snapshot: Object.assign({}, running, {
            state: 'scenario_blocked',
            state_label: 'Blocked',
            pending_replan_reason: 'RED reaction requires replan'
        }),
        flow_snapshot: flowSnapshot(),
        track_evidence_changes: false
    });
    assert('T-5  blocked SCC maps to observe step and fail warning', blocked.current_operator_step.key === 'observe' && blocked.pause_abort_warning.status === 'fail' && /replan/.test(blocked.pause_abort_warning.detail));

    var complete = RI.buildRunInstrumentation(card(), {
        scc_snapshot: Object.assign({}, running, {
            state: 'scenario_complete',
            state_label: 'Complete',
            scenario_status: 'complete'
        }),
        flow_snapshot: flowSnapshot(),
        track_evidence_changes: false
    });
    assert('T-6  complete SCC unlocks after-action checklist', complete.current_operator_step.key === 'after_action' && complete.after_action_checklist.every(function (item) { return item.available && item.status === 'pending'; }));

    var html = RI.renderRunInstrumentationHtml(inst);
    assert('T-7  renderer exposes live run, observe, after-action, and delta sections', html.indexOf('data-cmo-run-instrumentation="true"') !== -1 && html.indexOf('Live observe checklist') !== -1 && html.indexOf('After-action checklist') !== -1 && html.indexOf('Evidence changes during run') !== -1);
})();

console.log('\n--- CMO-RUN-3: Main app wiring, docs, and boundaries ---');
(function () {
    var app = src(APP);
    var unit = src(UNIT);
    var scc = src(SCC_PATH);
    var run = src(RUN_PATH);
    var inventory = src(INVENTORY);
    var runbook = src(RUNBOOK);
    var order = [
        'shell/cmo-wargame-test-card.js?v=cmo-wargame-live-1',
        'shell/cmo-wargame-run-instrumentation.js?v=cmo-wargame-run-1',
        'shell/unit-status-panel.js'
    ].map(function (needle) { return app.indexOf(needle); });
    assert('T-1  run instrumentation module loads before Unit Status panel', order.every(function (idx) { return idx !== -1; }) && order[0] < order[1] && order[1] < order[2]);
    assert('T-2  app styles the live run strip and responsive meta grid', app.indexOf('.cmo-wargame-run-instrumentation') !== -1 && app.indexOf('data-cmo-run-instrumentation') === -1 && app.indexOf('grid-template-columns:repeat(4') !== -1);
    assert('T-3  Unit Status builds and stores live CMO run instrumentation', unit.indexOf('RmoozCmoWarGameRunInstrumentation') !== -1 && unit.indexOf('_cmoWarGameRunInstrumentation') !== -1 && unit.indexOf('renderRunInstrumentationHtml') !== -1);
    assert('T-4  Unit Status polls the visible CMO block while testing', unit.indexOf('ensureCmoWarGameRunPolling') !== -1 && unit.indexOf('setInterval(function ()') !== -1 && unit.indexOf('populateCmoWarGameReadiness(currentUnit)') !== -1);
    assert('T-5  SCC source exposes runSnapshot API', scc.indexOf('runSnapshot: runSnapshot') !== -1 && scc.indexOf('movement_trace_count') !== -1 && scc.indexOf('pending_replan_reason') !== -1);
    assert('T-6  inventory and runbook document CMO war-game testing value', inventory.indexOf('CMO-WARGAME-RUN-INSTRUMENTATION-1') !== -1 && runbook.indexOf('CMO War-Game Run Instrumentation') !== -1 && runbook.indexOf('pause/abort warning if blocked or pending replan') !== -1);

    var changed = '';
    try { changed = childProcess.execSync('git diff --name-only', { cwd: ROOT, encoding: 'utf8' }); } catch (_) {}
    assert('T-7  working diff does not touch offline deployment paths', changed.indexOf('Offline' + '_Deployment') === -1);

    var sources = [run, unit].map(stripComments).join('\n');
    [
        ['no fetch/network route', /fetch\s*\(|XMLHttpRequest|\/api\//],
        ['no browser database/storage writes', /indexedDB|openDatabase|localStorage\s*\./i],
        ['no DOCX staging revival', /stage-doc|SLOT_FILE|docs\.red|docs\.blue|\.docx/i],
        ['no combat/action/doctrine mutation API', /applyAction|commitAction|executeAction|autoFire|auto-fire|applyDoctrine|commitDoctrine|setDoctrine|\/doctrine/i],
        ['no runtime override reference', /scenario_overrides\.json/]
    ].forEach(function (pair) { assert('T-boundary  ' + pair[0], !pair[1].test(sources)); });
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
