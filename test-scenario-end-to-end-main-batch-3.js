/* ============================================================================
 * test-scenario-end-to-end-main-batch-3.js
 * RMOOZ-SCENARIO-TEST-BATCH-3 - Adversarial Evidence Regression Gate
 * ----------------------------------------------------------------------------
 * Main-app-only headless adversarial pack. Validates invalid payload handling,
 * duplicate release-audit suppression, closeout blocker edge cases, normalizer
 * non-mutation, command empty states, control fallback behavior, and strict
 * runtime boundary checks. It does not sync, rebuild, test, or reference the
 * offline deployment tree; offline sync/testing is pending by user instruction.
 * ========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = __dirname;
var APP = path.join(ROOT, 'UI_MOdified', 'client', 'app.html');
var SHELL = path.join(ROOT, 'UI_MOdified', 'client', 'shell');

var passed = 0, failed = 0;
function assert(label, cond) {
    if (cond) { console.log('  PASS  ' + label); passed++; }
    else { console.error('  FAIL  ' + label); failed++; }
}
function src(file) { return fs.readFileSync(file, 'utf8'); }
function shell(name) { return require(path.join(SHELL, name)); }
function arr(v) { return Array.isArray(v) ? v : []; }
function obj(v) { return v && typeof v === 'object' ? v : {}; }
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function stripComments(text) {
    return String(text || '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
}
function hasAll(text, needles) {
    return needles.every(function (needle) { return String(text).indexOf(needle) !== -1; });
}
function extractStatusScript(html) {
    var marker = 'RMOOZ-SCENARIO-QA-BATCH-14';
    var idx = html.indexOf(marker);
    if (idx < 0) return '';
    var start = html.lastIndexOf('<script>', idx);
    var end = html.indexOf('</script>', idx);
    if (start < 0 || end < 0 || end <= start) return '';
    return html.slice(start + '<script>'.length, end);
}
function fakeStatusApi(script, hudApi) {
    var fakeWindow = {};
    fakeWindow.window = fakeWindow;
    fakeWindow.console = console;
    fakeWindow.navigator = { clipboard: { writeText: function () { return { then: function (ok) { if (ok) ok(); } }; } } };
    fakeWindow.setTimeout = function (fn) { if (typeof fn === 'function') fn(); return 1; };
    fakeWindow.clearTimeout = function () {};
    fakeWindow.document = {
        readyState: 'complete',
        body: { appendChild: function () {}, setAttribute: function () {}, removeAttribute: function () {} },
        createElement: function () { return { setAttribute: function () {}, removeAttribute: function () {}, appendChild: function () {}, addEventListener: function () {}, querySelector: function () { return null; }, querySelectorAll: function () { return []; } }; },
        addEventListener: function () {},
        getElementById: function () { return null; },
        querySelector: function () { return null; },
        querySelectorAll: function () { return []; }
    };
    fakeWindow.RmoozScenarioEvidenceReleaseHud = hudApi;
    fakeWindow.AppUnitStatusPanel = { openScenarioEvidenceTarget: function () {} };
    vm.runInNewContext(script, { window: fakeWindow, console: console });
    return fakeWindow.RmoozScenarioStatusHudDetails;
}
function unitButton(uid, reason) {
    var handlers = {};
    return {
        getAttribute: function (name) {
            if (name === 'data-cmo-queue-uid') return uid;
            if (name === 'data-cmo-queue-reason') return reason;
            return null;
        },
        addEventListener: function (event, fn) { handlers[event] = fn; },
        click: function () { if (handlers.click) handlers.click(); }
    };
}
function containerWith(buttons) { return { querySelectorAll: function () { return buttons || []; }, querySelector: function () { return null; } }; }

var FIXED_AT = '2026-07-02T22:00:00.000Z';
function world() {
    return {
        scenario_id: 'RMOOZ-ST-BATCH-3',
        objective: { id: 'OBJ-X', name: 'Objective X', lat: 24.2, lng: 54.2 },
        units: [
            { uid: 'B3-RED-1', side: 'RED', role: 'SAM', lat: 24.21, lng: 54.21, label: 'B3 Red SAM', weapon: 'SAM', sensor: 'Radar', doctrine: 'defensive' },
            { uid: 'B3-BLU-1', side: 'BLUE', role: 'Fighter', lat: 24.28, lng: 54.28, label: 'B3 Blue CAP', weapon: 'AAM', sensor: 'Radar', doctrine: 'cap' },
            { uid: 'B3-GHOST', label: 'B3 Ghost' }
        ],
        red_units: [{ uid: 'B3-RED-1', side: 'RED', lat: 24.21, lng: 54.21 }],
        blue_units: [{ uid: 'B3-BLU-1', side: 'BLUE', lat: 24.28, lng: 54.28 }]
    };
}
function healthyWorld() {
    return {
        scenario_id: 'RMOOZ-ST-BATCH-3-HEALTHY',
        objective: { id: 'OBJ-X', name: 'Objective X' },
        units: [
            { uid: 'H-RED', side: 'RED', role: 'infantry', lat: 24, lng: 54, label: 'H Red', weapon: 'Rifle', sensor: 'Observer', doctrine: 'standard' },
            { uid: 'H-BLU', side: 'BLUE', role: 'infantry', lat: 24.1, lng: 54.1, label: 'H Blue', weapon: 'Rifle', sensor: 'Observer', doctrine: 'standard' }
        ]
    };
}
function matrix() {
    return {
        counts: { Ready: 1, Blocked: 1, Unknown: 1 },
        top_blockers: [{ code: 'no_contact_evidence', count: 1, label_ar: 'لا يوجد دليل اتصال' }],
        rows: [
            { uid: 'B3-RED-1', unit_label: 'B3 Red SAM', side: 'RED', contact_status: 'Detected', engagement_status: 'Ready', final_status: 'Ready', reason_code: null, weapon: 'SAM' },
            { uid: 'B3-BLU-1', unit_label: 'B3 Blue CAP', side: 'BLUE', contact_status: 'Detected', engagement_status: 'Blocked', final_status: 'Blocked', reason_code: 'out_of_range', weapon: 'AAM' },
            { uid: 'B3-GHOST', unit_label: 'B3 Ghost', side: 'RED', contact_status: 'Unknown', engagement_status: 'Unknown', final_status: 'Unknown', reason_code: 'no_contact_evidence', weapon: null }
        ],
        total_units: 3,
        active_filter: { status: 'All', reason_code: null }
    };
}
function closeoutReady(fp) {
    return { status: 'ready_for_handoff', status_label_en: 'Ready for Handoff', counts: { total: 1, needs_review: 0, reviewed: 1, deferred: 0, fixed_externally: 0 }, blockers: [], unresolved: [], deferred_without_note: [], fixed_externally_without_note: [], session: { scenario_fingerprint: fp, records: [] }, read_only: true };
}
function closeoutIncomplete(fp) {
    return { status: 'incomplete', status_label_en: 'Incomplete', counts: { total: 0, needs_review: 0, reviewed: 0, deferred: 0, fixed_externally: 0 }, blockers: [{ code: 'no_review_state', label: 'No review issue state available' }], session: { scenario_fingerprint: fp, records: [] }, read_only: true };
}

console.log('\n=== RMOOZ-SCENARIO-TEST-BATCH-3 Adversarial Evidence Regression Gate ===\n');

var app = src(APP);
var unitPanelSrc = src(path.join(SHELL, 'unit-status-panel.js'));
var statusScript = extractStatusScript(app);
var NORM = shell('scenario-evidence-normalizer.js');
var RS = shell('scenario-evidence-review-session.js');
var RQ = shell('scenario-evidence-review-queue.js');
var FS = shell('scenario-evidence-fix-status.js');
var AU = shell('scenario-evidence-review-audit-trail.js');
var CO = shell('scenario-evidence-review-closeout.js');
var HP = shell('scenario-evidence-handoff-package.js');
var HA = shell('scenario-evidence-handoff-acceptance.js');
var RG = shell('scenario-evidence-release-gate.js');
var RA = shell('scenario-evidence-release-audit.js');
var FR = shell('cmo-force-evidence-report.js');
var HUD = shell('scenario-evidence-release-hud.js');
var STATUS = fakeStatusApi(statusScript, HUD);
var ws = world();
var fp = RS.computeFingerprint(ws, { generated_at: FIXED_AT });
var q = RQ.buildReviewQueue(ws, { matrix: matrix(), generated_at: FIXED_AT });

console.log('--- ST3-1: normalization and no-mutation edge cases ---');
(function () {
    var original = world();
    var before = JSON.stringify(original);
    var result = NORM.normalizeWorldState(original);
    assert('T-1  normalizer reports applied safe defaults', result.fields_normalized > 0 && result.units_affected > 0);
    var ghost = result.normalized_ws.units.filter(function (u) { return u.uid === 'B3-GHOST'; })[0];
    assert('T-2  missing unit fields normalize visibly', ghost.side === NORM.DEFAULTS.side && ghost.role === NORM.DEFAULTS.role && ghost.weapon === NORM.DEFAULTS.weapon && ghost.needs_placement === true);
    assert('T-3  source world state is not mutated', JSON.stringify(original) === before);
    var html = NORM.renderNormalizerHtml(result);
    assert('T-4  normalizer render shows count and affected units', html.indexOf('normalization(s)') !== -1 && html.indexOf('unit(s) affected') !== -1);
    var clean = NORM.normalizeWorldState(healthyWorld());
    assert('T-5  complete evidence world has no normalizations', clean.fields_normalized === 0 && NORM.renderNormalizerHtml(clean).indexOf('No normalizations required') !== -1);
})();

console.log('\n--- ST3-2: review queue, drilldown, and empty-state resilience ---');
(function () {
    assert('T-1  broken fixture creates review queue issues', q.total_issues > 0 && arr(q.groups).length > 0);
    var called = [];
    var btn = unitButton('B3-GHOST', 'no_contact_evidence');
    RQ.bindQueueInteractions(containerWith([btn]), q, { onSelectIssue: function (issue, intent) { called.push({ issue: issue, intent: intent }); } });
    btn.click();
    assert('T-2  queue click emits issue and matrix filter', called.length === 1 && called[0].issue.uid === 'B3-GHOST' && called[0].intent.matrix_filter.reason_code === 'no_contact_evidence');
    var healthyMatrix = { counts: { Ready: 2, Blocked: 0, Unknown: 0 }, top_blockers: [], rows: [
        { uid: 'H-RED', unit_label: 'H Red', side: 'RED', contact_status: 'Detected', final_status: 'Ready', reason_code: null, weapon: 'Rifle' },
        { uid: 'H-BLU', unit_label: 'H Blue', side: 'BLUE', contact_status: 'Detected', final_status: 'Ready', reason_code: null, weapon: 'Rifle' }
    ], total_units: 2 };
    var emptyQueue = RQ.buildReviewQueue(healthyWorld(), { matrix: healthyMatrix, generated_at: FIXED_AT });
    assert('T-3  healthy scenario has zero review issues', emptyQueue.total_issues === 0);
    assert('T-4  empty review queue renders friendly empty state', RQ.renderQueueHtml(emptyQueue).indexOf('usp-queue-empty') !== -1);
})();

console.log('\n--- ST3-3: closeout blockers and manual-review ledger safety ---');
(function () {
    FS.reset();
    FS.setScenarioContext(ws, { generated_at: FIXED_AT });
    var recordQueue = { records: [
        { issue_id: 'defer-no-note', uid: 'B3-GHOST', code: 'no_contact_evidence', status: 'deferred', note: '' },
        { issue_id: 'fixed-no-note', uid: 'B3-BLU-1', code: 'out_of_range', status: 'fixed_externally', note: '' },
        { issue_id: 'reviewed-ok', uid: 'B3-RED-1', code: 'reviewed', status: 'reviewed', note: 'Verified.' }
    ] };
    FS.importRecords(recordQueue.records, { replace: true });
    var close = CO.buildCloseout(recordQueue, { world_state: ws, session: { scenario_fingerprint: fp, records: recordQueue.records }, generated_at: FIXED_AT });
    assert('T-1  closeout blocks deferred without justification', arr(close.blockers).some(function (b) { return b.code === 'deferred_missing_justification'; }));
    assert('T-2  closeout blocks fixed-externally without verification', arr(close.blockers).some(function (b) { return b.code === 'fixed_externally_missing_verification'; }));
    assert('T-3  closeout summary calls out required notes', CO.buildSummary(close).indexOf('JUSTIFICATION REQUIRED') !== -1 && CO.buildSummary(close).indexOf('VERIFICATION NOTE REQUIRED') !== -1);
    assert('T-4  missing container binders fail safely', CO.copySummary(close) && typeof CO.toJson(close) === 'string');
})();

console.log('\n--- ST3-4: invalid handoff payload and acceptance defenses ---');
(function () {
    var invalid = HP.validatePackage('{ not valid json', fp, { fingerprint: fp, generated_at: FIXED_AT });
    assert('T-1  invalid handoff package is rejected safely', invalid.valid === false && invalid.status === 'invalid_package' && arr(invalid.warnings).length > 0);
    assert('T-2  invalid handoff preview remains read-only', HP.previewImport('{ not valid json', fp, { fingerprint: fp }).read_only === true);
    var badDecision = HA.decide('{}', fp, 'launch-anyway', { fingerprint: fp, generated_at: FIXED_AT });
    assert('T-3  unknown acceptance decision is rejected', badDecision.applied === false && /Unknown acceptance decision/.test(badDecision.error));
    var recommendation = HA.recommendDecision({ valid: true, fingerprint_match: false, warnings: [] });
    assert('T-4  mismatch recommendation is reject', recommendation.decision === 'rejected' && /fingerprint/.test(recommendation.reason));
    var acceptanceEmpty = HA.renderAcceptanceHtml(HA.buildAcceptance(fp, { fingerprint: fp, generated_at: FIXED_AT }));
    assert('T-5  acceptance panel keeps decision controls visible', hasAll(acceptanceEmpty, ['Preview Diff', 'Accept', 'Accept with Warnings', 'Reject']));
    assert('T-6  package/acceptance binders fail safely without containers', HP.bindPackageActions(null, {}, {}) === false && HA.bindAcceptanceActions(null, null, {}) === false);
})();

console.log('\n--- ST3-5: release gate and release-audit duplicate suppression ---');
(function () {
    RA.clear(fp, { fingerprint: fp });
    AU.clearTrail(fp);
    var incompleteGate = RG.buildReleaseGate(ws, { fingerprint: fp, closeout: closeoutIncomplete(fp), acceptance: null, generated_at: FIXED_AT });
    assert('T-1  incomplete closeout yields incomplete release gate', incompleteGate.status === 'incomplete' && incompleteGate.releasable === false);
    var notReady = RG.buildReleaseGate(ws, { fingerprint: fp, closeout: closeoutReady(fp), acceptance: { decision: 'accepted', decision_label_en: 'Accepted', fingerprint_match: false, current_scenario_fingerprint: fp, package_fingerprint: 'other' }, generated_at: FIXED_AT });
    assert('T-2  fingerprint mismatch blocks release', notReady.status === 'not_ready' && arr(notReady.blockers).some(function (b) { return b.code === 'fingerprint_match'; }));
    RA.observeRelease(notReady, { fingerprint: fp, timestamp: FIXED_AT });
    RA.observeRelease(notReady, { fingerprint: fp, timestamp: FIXED_AT });
    var history = RA.exportState(fp, { fingerprint: fp, generated_at: FIXED_AT });
    assert('T-3  repeated identical release observation does not duplicate history', arr(history.history).length === 1);
    RA.recordExport('json', notReady, { fingerprint: fp, timestamp: FIXED_AT });
    var exported = RA.exportState(fp, { fingerprint: fp, generated_at: FIXED_AT });
    assert('T-4  explicit export marks latest receipt exported', exported.latest && exported.latest.exported === true && exported.latest.export_kind === 'json');
    assert('T-5  release controls fail safely without DOM print/download support', RG.downloadJson(RG.buildCertificate(notReady)) === false && RG.printCertificate(RG.buildCertificate(notReady)) === false);
})();

console.log('\n--- ST3-6: command palette empty states and operator context coverage ---');
(function () {
    assert('T-1  no-match command search renders empty item', STATUS.renderCommandPaletteHtml(STATUS.filterCommands(STATUS.commandPaletteActions(), 'zz-no-match', 'all'), 0).indexOf('No matching scenario actions') !== -1);
    assert('T-2  unknown filter falls back to no target matches', STATUS.filterCommands(STATUS.commandPaletteActions(), '', 'unknown-filter').length === 0);
    var decorated = STATUS.decorateCommands(STATUS.filterCommands(STATUS.commandPaletteActions(), '', 'release'), { release_gate: { status_label_en: 'Incomplete', checks: [{ key: 'handoff_acceptance', actual: 'No decision yet', status: 'fail' }] } }, { release: { label_en: 'Incomplete', cls: 'incomplete' } });
    var html = STATUS.renderCommandPaletteHtml(decorated, 0);
    assert('T-3  command context explains handoff blocker', html.indexOf('Handoff package not accepted') !== -1);
    assert('T-4  filter toolbar exposes all six filters', ['all', 'release', 'closeout', 'coverage', 'handoff', 'copy'].every(function (key) { return STATUS.renderCommandFiltersHtml(key).indexOf('data-scenario-command-filter="' + key + '"') !== -1; }));
})();

console.log('\n--- ST3-7: force report resilience and strict boundary scan ---');
(function () {
    var ready = RG.buildReleaseGate(ws, { fingerprint: fp, closeout: closeoutReady(fp), acceptance: { decision: 'accepted', decision_label_en: 'Accepted', fingerprint_match: true, current_scenario_fingerprint: fp, package_fingerprint: fp }, generated_at: FIXED_AT });
    var report = FR.buildReport(ws, { matrix: matrix(), review_queue: q, review_closeout: closeoutReady(fp), release_gate: ready, release_certificate: RG.buildCertificate(ready), selected_unit: ws.units[0], generated_at: FIXED_AT });
    assert('T-1  force report summary remains printable text', FR.buildSummary(report).indexOf('Force Evidence Report') === 0);
    assert('T-2  force printable report carries read-only disclaimer', FR.buildPrintableReportHtml(report).indexOf('does not authorize fire') !== -1);
    assert('T-3  app loads Batch 1 and Batch 2 gates from main root only by convention', fs.existsSync(path.join(ROOT, 'test-scenario-end-to-end-main-batch-1.js')) && fs.existsSync(path.join(ROOT, 'test-scenario-end-to-end-main-batch-2.js')));
    var sources = [
        statusScript,
        unitPanelSrc,
        src(path.join(SHELL, 'scenario-evidence-normalizer.js')),
        src(path.join(SHELL, 'scenario-evidence-review-session.js')),
        src(path.join(SHELL, 'scenario-evidence-review-queue.js')),
        src(path.join(SHELL, 'scenario-evidence-review-closeout.js')),
        src(path.join(SHELL, 'scenario-evidence-handoff-package.js')),
        src(path.join(SHELL, 'scenario-evidence-handoff-acceptance.js')),
        src(path.join(SHELL, 'scenario-evidence-release-gate.js')),
        src(path.join(SHELL, 'scenario-evidence-release-audit.js')),
        src(path.join(SHELL, 'cmo-force-evidence-report.js'))
    ].map(stripComments).join('\n');
    [
        ['no DOCX/stage-doc/SLOT_FILE path', /stage-doc|SLOT_FILE|docs\.red|docs\.blue|DOCX/i],
        ['no backend route or network mutation', /fetch\s*\(|XMLHttpRequest|\/api\//],
        ['no combat or doctrine mutation', /applyAction|commitAction|executeAction|autoFire|auto-fire|applyDoctrine|commitDoctrine|setDoctrine|\/doctrine/i],
        ['no protected runtime files referenced', /legacy-shim-attack_objective_draft-15\.jsonl|scenario_overrides\.json/]
    ].forEach(function (pair) { assert('T-boundary  ' + pair[0], !pair[1].test(sources)); });
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
