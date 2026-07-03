/* ============================================================================
 * test-cmo-wargame-test-card-main-batch-1.js
 * RMOOZ-CMO-WARGAME-TEST-CARD-1 - Main CMO War-Game Test Card Gate
 * ----------------------------------------------------------------------------
 * Main-app-only gate for the read-only CMO war-game operator test card. This
 * test does not touch, inspect, sync, rebuild, or run offline files. Offline
 * sync/testing is pending by user instruction.
 * ========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var SHELL = path.join(ROOT, 'UI_MOdified', 'client', 'shell');
var CARD_FILE = path.join(SHELL, 'cmo-wargame-test-card.js');
var BRIEF_FILE = path.join(SHELL, 'cmo-wargame-readiness-brief.js');

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
function brief(decision, fail, warn) {
    var labels = {
        go: 'GO for CMO war-game test',
        go_with_warnings: 'GO with warnings',
        training_preview_only: 'Training preview only',
        no_go: 'NO-GO for release-grade test'
    };
    return {
        version: '1.0.0-rmooz-cmo-wargame-readiness-1',
        scenario_fingerprint: 'scenario-' + decision,
        decision: decision,
        decision_label_en: labels[decision],
        decision_label_ar: decision === 'training_preview_only' ? 'معاينة تدريبية فقط' : '',
        confidence: { score: fail ? 35 : (warn ? 70 : 95), label: fail ? 'Low' : (warn ? 'Medium' : 'High'), pass: 6 - fail - warn, warn: warn || 0, fail: fail || 0 },
        gates: [
            { key: 'scenario_identity', label: 'Scenario identity', status: 'pass', detail: 'Fingerprint ok' },
            { key: 'Review Queue', label: 'Review Queue', status: warn ? 'warn' : 'pass', detail: warn ? '2 evidence issue(s)' : '0 evidence issue(s)', action: warn ? 'Open Scenario Evidence Review Queue.' : 'Review queue clear.' },
            { key: 'Review Closeout', label: 'Review Closeout', status: fail ? 'fail' : 'pass', detail: fail ? 'Needs Review' : 'Ready for Handoff', action: 'Open Closeout and resolve blockers/deferred notes.' },
            { key: 'Handoff Acceptance', label: 'Handoff Acceptance', status: fail ? 'fail' : 'pass', detail: fail ? 'Pending Decision' : 'Accepted', action: 'Accept the handoff package or record why it is not accepted.' },
            { key: 'Evidence Release Gate', label: 'Evidence Release Gate', status: fail ? 'fail' : 'pass', detail: fail ? 'Not Ready — 2 blocker(s)' : 'Ready for Release', action: 'Open Release Gate and clear release blockers.' }
        ],
        release_blockers: fail ? [{ code: 'unresolved_issues', label: 'Issues still need review' }] : [],
        next_actions: fail ? [
            { key: 'closeout', label: 'Review Closeout', status: 'fail', action: 'Open Closeout and resolve blockers/deferred notes.' },
            { key: 'release_gate', label: 'Evidence Release Gate', status: 'fail', action: 'Open Release Gate and clear release blockers.' }
        ] : (warn ? [{ key: 'review_queue', label: 'Review Queue', status: 'warn', action: 'Open Scenario Evidence Review Queue.' }] : []),
        read_only: true
    };
}

console.log('\n=== RMOOZ-CMO-WARGAME-TEST-CARD-1 Main Gate ===\n');

var CARD = shell('cmo-wargame-test-card.js');

console.log('--- CMO-TC-1: module API and main-only presence ---');
(function () {
    assert('T-1  test-card module exists', fs.existsSync(CARD_FILE));
    assert('T-2  readiness brief foundation exists', fs.existsSync(BRIEF_FILE));
    assert('T-3  API version exposed', CARD.CMO_WARGAME_TEST_CARD_VERSION === '1.0.0-rmooz-cmo-wargame-test-card-1');
    assert('T-4  public API methods exposed', ['buildTestCard', 'buildRunSteps', 'buildObservationFocus', 'buildAbortCriteria', 'buildAfterActionChecklist', 'summaryText', 'renderCardHtml'].every(function (name) { return typeof CARD[name] === 'function'; }));
})();

console.log('\n--- CMO-TC-2: run modes from readiness decisions ---');
(function () {
    var go = CARD.buildTestCard(brief('go', 0, 0));
    var warn = CARD.buildTestCard(brief('go_with_warnings', 0, 2));
    var training = CARD.buildTestCard(brief('training_preview_only', 1, 2));
    var blocked = CARD.buildTestCard(brief('no_go', 2, 1));
    assert('T-1  GO brief creates release-grade card', go.run_mode.key === 'release_grade' && go.run_mode.allowed === true && arr(go.operator_steps).length === 6);
    assert('T-2  warning brief creates cautious card', warn.run_mode.key === 'cautious_test' && warn.operator_steps[0].status === 'warn');
    assert('T-3  training preview brief is not release-grade', training.run_mode.key === 'training_preview' && arr(training.abort_criteria).some(function (a) { return /training preview only/i.test(a.label); }));
    assert('T-4  NO-GO brief creates blocked card', blocked.run_mode.key === 'blocked' && blocked.run_mode.allowed === false && arr(blocked.operator_steps).length === 3);
})();

console.log('\n--- CMO-TC-3: operator steps, observation focus, and abort criteria ---');
(function () {
    var card = CARD.buildTestCard(brief('go_with_warnings', 0, 2));
    assert('T-1  operator journey includes control-center run path', arr(card.operator_steps).map(function (s) { return s.key; }).join('|') === 'preflight|prepare_coa|commit_order|run_wargame|observe|after_action');
    assert('T-2  observation focus includes core evidence areas', ['Release Gate', 'Closeout', 'Handoff', 'Force Report'].every(function (label) { return arr(card.observation_focus).some(function (f) { return f.label === label; }); }));
    assert('T-3  warning gates are added to observation focus', arr(card.observation_focus).some(function (f) { return /^gate_/.test(f.key); }));
    assert('T-4  abort criteria include blocked/replan/fingerprint/report safety', hasAll(arr(card.abort_criteria).map(function (a) { return a.label; }).join('\n'), ['scenario status becomes blocked', 'fingerprint/package mismatch', 'force report cannot explain']));
    assert('T-5  after-action checklist includes no-release-override guard', arr(card.after_action_checklist).some(function (a) { return /training-only/.test(a.label); }));
})();

console.log('\n--- CMO-TC-4: summary and render output ---');
(function () {
    var card = CARD.buildTestCard(brief('training_preview_only', 1, 2));
    var text = CARD.summaryText(card);
    var html = CARD.renderCardHtml(card);
    assert('T-1  summary text is operator-readable', hasAll(text, ['CMO War-Game Operator Test Card', 'Run mode:', 'Operator steps:', 'Abort / pause criteria:', 'Read-only test card']));
    assert('T-2  render includes bilingual heading and sections', hasAll(html, ['CMO War-Game Operator Test Card', 'بطاقة اختبار المناورة', 'cmo-wargame-test-card-steps', 'Observation focus', 'Abort / pause criteria']));
    assert('T-3  safe fallback from null input renders blocked card', CARD.buildTestCard(null).read_only === true && CARD.renderCardHtml(null).indexOf('CMO War-Game Operator Test Card') !== -1);
})();

console.log('\n--- CMO-TC-5: strict boundaries ---');
(function () {
    var source = cleanSource(src(CARD_FILE));
    [
        ['no fetch/network/backend route', /fetch\s*\(|XMLHttpRequest|\/api\//],
        ['no DOCX/stage-doc/SLOT_FILE path', /stage-doc|SLOT_FILE|docs\.red|docs\.blue|DOCX/i],
        ['no combat/action/doctrine mutation', /applyAction|commitAction|executeAction|autoFire|auto-fire|applyDoctrine|commitDoctrine|setDoctrine|\/doctrine/i],
        ['no protected runtime files referenced', /legacy-shim-attack_objective_draft-15\.jsonl|scenario_overrides\.json/]
    ].forEach(function (pair) { assert('T-boundary  ' + pair[0], !pair[1].test(source)); });
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
