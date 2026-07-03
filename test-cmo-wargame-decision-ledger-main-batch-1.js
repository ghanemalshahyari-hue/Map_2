/* ============================================================================
 * test-cmo-wargame-decision-ledger-main-batch-1.js
 * RMOOZ-CMO-WARGAME-DECISION-LEDGER-1 - Main Decision Ledger Gate
 * ----------------------------------------------------------------------------
 * Main-app-only gate for the read-only CMO war-game decision ledger. This test
 * does not touch, inspect, sync, rebuild, or run offline files. Offline
 * sync/testing is pending by user instruction.
 * ========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var SHELL = path.join(ROOT, 'UI_MOdified', 'client', 'shell');
var LEDGER_FILE = path.join(SHELL, 'cmo-wargame-decision-ledger.js');
var PKG_FILE = path.join(SHELL, 'cmo-wargame-evidence-package.js');

var passed = 0, failed = 0;
function assert(label, cond) {
    if (cond) { console.log('  PASS  ' + label); passed++; }
    else { console.error('  FAIL  ' + label); failed++; }
}
function src(file) { return fs.readFileSync(file, 'utf8'); }
function shell(name) { return require(path.join(SHELL, name)); }
function arr(v) { return Array.isArray(v) ? v : []; }
function hasAll(text, needles) { return needles.every(function (needle) { return String(text).indexOf(needle) !== -1; }); }
function cleanSource(text) {
    return String(text || '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
}
function bundle(kind) {
    var fail = kind === 'blocked';
    var training = kind === 'training';
    var warn = kind === 'warning';
    return {
        readiness: {
            decision: fail ? 'no_go' : (warn ? 'go_with_warnings' : 'go'),
            decision_label_en: fail ? 'NO-GO for release-grade test' : (warn ? 'GO with warnings' : 'GO for CMO war-game test'),
            confidence: { label: fail ? 'Low' : (warn ? 'Medium' : 'High'), score: fail ? 30 : (warn ? 70 : 95) },
            gates: fail ? [{ key: 'release_gate', label: 'Evidence Release Gate', status: 'fail', detail: '2 blockers' }] : (warn ? [{ key: 'review_queue', label: 'Review Queue', status: 'warn', detail: '2 issues' }] : [])
        },
        test_card: {
            run_mode: training ? { key: 'training_preview', label: 'Training preview only', allowed: true } : (fail ? { key: 'blocked', label: 'Blocked', allowed: false } : { key: 'release_grade', label: 'Release-grade CMO test', allowed: true }),
            abort_criteria: [{ label: 'Pause if scenario becomes blocked.' }]
        },
        run: {
            control_center: { state: fail ? 'scenario_blocked' : 'scenario_complete', state_label: fail ? 'Blocked' : 'Complete' },
            pause_abort_warning: fail ? { key: 'scenario_blocked', label: 'Pause / abort warning', status: 'fail', detail: 'pending replan' } : { key: 'no_warning', label: 'No active warning', status: 'pass' },
            evidence_changes: warn ? [{ key: 'release_status', label: 'Release status', previous: 'ready', current: 'ready_with_warnings' }] : []
        },
        aar: {
            scenario_fingerprint: 'scenario-ledger-' + kind,
            outcome: training ? { key: 'training_complete', label: 'Training preview completed', severity: 'warn' } : (fail ? { key: 'blocked', label: 'Run blocked / paused', severity: 'fail' } : { key: 'completed', label: 'CMO war-game run completed', severity: warn ? 'warn' : 'pass' }),
            release_interpretation: training ? 'training-only evidence; do not claim release-grade result' : (fail ? 'not release-grade evidence' : 'release-grade evidence candidate'),
            unresolved_items: fail ? [{ key: 'release_gate', label: 'Evidence Release Gate', status: 'fail', detail: '2 blockers' }] : [],
            recommendations: [{ label: fail ? 'Open Evidence Release Gate and clear blockers.' : 'Preserve evidence package.' }]
        },
        evidence_package: {
            scenario_fingerprint: 'scenario-ledger-' + kind,
            summary: {
                package_id: 'pkg-' + kind,
                scenario_fingerprint: 'scenario-ledger-' + kind,
                outcome: fail ? 'Run blocked / paused' : (training ? 'Training preview completed' : 'CMO war-game run completed'),
                release_interpretation: training ? 'training-only evidence; do not claim release-grade result' : (fail ? 'not release-grade evidence' : 'release-grade evidence candidate'),
                release_grade_candidate: !fail && !training,
                training_only: training,
                needs_review: fail || warn || training,
                blocked: fail,
                evidence_changes: warn ? 1 : 0,
                unresolved_items: fail ? 1 : 0,
                recommendations: 1
            },
            readiness: { release_grade_candidate: !fail && !training, training_only: training, needs_review: fail || warn || training, blocked: fail },
            handoff_checklist: fail ? [{ key: 'unresolved', label: '1 unresolved item', status: 'fail' }] : []
        },
        review_board: kind === 'review_reject' ? { decision: 'rejected', decision_label_en: 'Review Board Rejected' } : null
    };
}

console.log('\n=== RMOOZ-CMO-WARGAME-DECISION-LEDGER-1 Main Gate ===\n');

var LEDGER = shell('cmo-wargame-decision-ledger.js');

console.log('--- CMO-DL-1: module API and main-only foundation ---');
(function () {
    assert('T-1  decision ledger module exists', fs.existsSync(LEDGER_FILE));
    assert('T-2  evidence package foundation exists', fs.existsSync(PKG_FILE));
    assert('T-3  API version exposed', LEDGER.CMO_WARGAME_DECISION_LEDGER_VERSION === '1.0.0-rmooz-cmo-wargame-decision-ledger-1');
    assert('T-4  public API methods exposed', ['buildLedger', 'collectEvents', 'summaryText', 'toJson', 'renderLedgerHtml'].every(function (name) { return typeof LEDGER[name] === 'function'; }));
})();

console.log('\n--- CMO-DL-2: accepted / warning / training / blocked decisions ---');
(function () {
    var accepted = LEDGER.buildLedger(null, bundle('accepted'));
    var warning = LEDGER.buildLedger(null, bundle('warning'));
    var training = LEDGER.buildLedger(null, bundle('training'));
    var blocked = LEDGER.buildLedger(null, bundle('blocked'));
    assert('T-1  clean release-grade package is accepted', accepted.final_decision.key === 'accepted' && accepted.event_counts.fail === 0 && accepted.next_actions[0].key === 'preserve_package');
    assert('T-2  warning package is accepted with warnings', warning.final_decision.key === 'accepted_with_warnings' && warning.event_counts.warn >= 1 && warning.next_actions.length >= 1);
    assert('T-3  training package is training-only', training.final_decision.key === 'training_only' && training.final_decision.severity === 'warn');
    assert('T-4  blocked package is blocked', blocked.final_decision.key === 'blocked' && blocked.event_counts.fail >= 1 && blocked.next_actions[0].status === 'fail');
})();

console.log('\n--- CMO-DL-3: source events, review board, and JSON/text/html output ---');
(function () {
    var rejected = LEDGER.buildLedger(null, bundle('review_reject'));
    var blocked = LEDGER.buildLedger(null, bundle('blocked'));
    var text = LEDGER.summaryText(blocked);
    var json = LEDGER.toJson(blocked);
    var html = LEDGER.renderLedgerHtml(blocked);
    assert('T-1  ledger collects all available source categories', ['readiness_brief', 'test_card', 'run_instrumentation', 'after_action_debrief', 'evidence_package'].every(function (srcName) { return arr(blocked.events).some(function (e) { return e.source === srcName; }); }));
    assert('T-2  optional review board decision contributes event', rejected.sources.review_board === true && arr(rejected.events).some(function (e) { return e.source === 'review_board'; }));
    assert('T-3  text summary is operator-readable', hasAll(text, ['CMO War-Game Decision Ledger', 'Final decision:', 'Decision trail:', 'Next actions:', 'Read-only ledger']));
    assert('T-4  JSON export preserves final decision', JSON.parse(json).final_decision.key === 'blocked');
    assert('T-5  HTML render includes bilingual heading and event/action sections', hasAll(html, ['CMO War-Game Decision Ledger', 'سجل قرار اختبار المناورة', 'cmo-wargame-decision-ledger-events', 'Next actions']));
})();

console.log('\n--- CMO-DL-4: fallback and strict boundaries ---');
(function () {
    assert('T-1  null input builds safe read-only ledger', LEDGER.buildLedger(null).read_only === true && LEDGER.renderLedgerHtml(null).indexOf('CMO War-Game Decision Ledger') !== -1);
    var source = cleanSource(src(LEDGER_FILE));
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
