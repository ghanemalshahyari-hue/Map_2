/* ============================================================================
 * test-scenario-end-to-end-main-batch-2.js
 * RMOOZ-SCENARIO-TEST-BATCH-2 - Regression + Operator Journey Gate
 * ----------------------------------------------------------------------------
 * Main-app-only headless regression pack. Extends the first E2E gate with
 * session import/export, stale fingerprint handling, release-audit history,
 * target-map invariants, command palette coverage, and strict runtime boundary
 * checks. It never syncs, rebuilds, tests, or references offline deployment
 * paths; offline sync/testing is pending by user instruction.
 * ========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = __dirname;
var APP = path.join(ROOT, 'UI_MOdified', 'client', 'app.html');
var SHELL = path.join(ROOT, 'UI_MOdified', 'client', 'shell');
var E2E1 = path.join(ROOT, 'test-scenario-end-to-end-main-batch-1.js');

var passed = 0, failed = 0;
function assert(label, cond) {
    if (cond) { console.log('  PASS  ' + label); passed++; }
    else { console.error('  FAIL  ' + label); failed++; }
}
function src(file) { return fs.readFileSync(file, 'utf8'); }
function shell(name) { return require(path.join(SHELL, name)); }
function arr(v) { return Array.isArray(v) ? v : []; }
function obj(v) { return v && typeof v === 'object' ? v : {}; }
function keys(o) { return Object.keys(o || {}).sort(); }
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
    var opened = [];
    var copied = [];
    var fakeWindow = {};
    fakeWindow.window = fakeWindow;
    fakeWindow.console = console;
    fakeWindow.navigator = { clipboard: { writeText: function (text) { copied.push(String(text)); return { then: function (ok) { if (ok) ok(); } }; } } };
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
    fakeWindow.AppUnitStatusPanel = { openScenarioEvidenceTarget: function (target) { opened.push(target); } };
    vm.runInNewContext(script, { window: fakeWindow, console: console });
    return { api: fakeWindow.RmoozScenarioStatusHudDetails, opened: opened, copied: copied };
}
function makeBtn(action) {
    var handlers = {};
    return {
        getAttribute: function (name) { return name === 'data-release-action' ? action : null; },
        addEventListener: function (ev, fn) { handlers[ev] = fn; },
        click: function () { if (handlers.click) handlers.click(); }
    };
}
function makeReleaseContainer(actions) {
    var buttons = actions.map(makeBtn);
    return { querySelectorAll: function () { return buttons; } };
}

var FIXED_AT = '2026-07-02T21:00:00.000Z';
function worldA() {
    return {
        scenario_id: 'RMOOZ-ST-BATCH-2-A',
        objective: { id: 'OBJ-X', name: 'Objective X', lat: 24.4, lng: 54.5 },
        units: [
            { uid: 'A-RED-1', side: 'RED', role: 'SAM', lat: 24.41, lng: 54.51, label: 'A Red SAM', weapon: 'SAM', sensor: 'Radar', doctrine: 'defensive' },
            { uid: 'A-BLU-1', side: 'BLUE', role: 'Fighter', lat: 24.45, lng: 54.58, label: 'A Blue CAP', weapon: 'AAM', sensor: 'Radar', doctrine: 'cap' },
            { uid: 'A-RED-2', side: 'RED', role: 'Recon', lat: 24.39, lng: 54.49, label: 'A Red Recon' }
        ],
        red_units: [{ uid: 'A-RED-1', side: 'RED', lat: 24.41, lng: 54.51 }],
        blue_units: [{ uid: 'A-BLU-1', side: 'BLUE', lat: 24.45, lng: 54.58 }]
    };
}
function worldB() {
    var ws = worldA();
    ws.scenario_id = 'RMOOZ-ST-BATCH-2-B';
    ws.objective = { id: 'OBJ-Y', name: 'Objective Y', lat: 25.0, lng: 55.0 };
    ws.units[2] = Object.assign({}, ws.units[2], { uid: 'B-RED-2', lat: 25.05, lng: 55.05 });
    return ws;
}
function matrix() {
    return {
        counts: { Ready: 1, Blocked: 1, Unknown: 1 },
        top_blockers: [{ code: 'no_contact_evidence', count: 1, label_ar: 'لا يوجد دليل اتصال' }],
        rows: [
            { uid: 'A-RED-1', unit_label: 'A Red SAM', side: 'RED', contact_status: 'Detected', engagement_status: 'Ready', final_status: 'Ready', reason_code: null, weapon: 'SAM' },
            { uid: 'A-BLU-1', unit_label: 'A Blue CAP', side: 'BLUE', contact_status: 'Detected', engagement_status: 'Blocked', final_status: 'Blocked', reason_code: 'out_of_range', weapon: 'AAM' },
            { uid: 'A-RED-2', unit_label: 'A Red Recon', side: 'RED', contact_status: 'Unknown', engagement_status: 'Unknown', final_status: 'Unknown', reason_code: 'no_contact_evidence', weapon: null }
        ],
        total_units: 3,
        active_filter: { status: 'All', reason_code: null }
    };
}
function flattenIssues(queue) {
    var out = [];
    arr(obj(queue).groups).forEach(function (group) { arr(group.issues).forEach(function (issue) { out.push(issue); }); });
    return out;
}
function closeoutReady(fp) {
    return {
        status: 'ready_for_handoff',
        status_label_en: 'Ready for Handoff',
        counts: { total: 3, needs_review: 0, reviewed: 3, deferred: 0, fixed_externally: 0 },
        blockers: [], unresolved: [], deferred_without_note: [], fixed_externally_without_note: [], deferred: [], fixed_externally: [], reviewed: [],
        session: { scenario_fingerprint: fp, records: [] },
        read_only: true
    };
}
function closeoutBlocked(fp) {
    return {
        status: 'needs_review',
        status_label_en: 'Needs Review',
        counts: { total: 3, needs_review: 2, reviewed: 1, deferred: 0, fixed_externally: 0 },
        blockers: [{ code: 'needs_review_remaining', label: '2 issue(s) still need review' }],
        unresolved: [{ uid: 'A-RED-2', code: 'no_contact_evidence', status: 'needs_review' }],
        deferred_without_note: [], fixed_externally_without_note: [], session: { scenario_fingerprint: fp, records: [] }, read_only: true
    };
}

console.log('\n=== RMOOZ-SCENARIO-TEST-BATCH-2 Regression + Operator Journey Gate ===\n');

var app = src(APP);
var unitPanelSrc = src(path.join(SHELL, 'unit-status-panel.js'));
var statusScript = extractStatusScript(app);
var RS = shell('scenario-evidence-review-session.js');
var RQ = shell('scenario-evidence-review-queue.js');
var FS = shell('scenario-evidence-fix-status.js');
var AU = shell('scenario-evidence-review-audit-trail.js');
var HP = shell('scenario-evidence-handoff-package.js');
var HA = shell('scenario-evidence-handoff-acceptance.js');
var RG = shell('scenario-evidence-release-gate.js');
var RA = shell('scenario-evidence-release-audit.js');
var FR = shell('cmo-force-evidence-report.js');
var HUD = shell('scenario-evidence-release-hud.js');
var STATUS = fakeStatusApi(statusScript, HUD).api;
var wsA = worldA();
var wsB = worldB();
var fpA = RS.computeFingerprint(wsA, { generated_at: FIXED_AT });
var fpB = RS.computeFingerprint(wsB, { generated_at: FIXED_AT });
var queueA = RQ.buildReviewQueue(wsA, { matrix: matrix(), generated_at: FIXED_AT });
var issuesA = flattenIssues(queueA);

console.log('--- ST2-1: baseline continuity and main-only wiring invariants ---');
(function () {
    assert('T-1  first E2E main gate exists', fs.existsSync(E2E1));
    assert('T-2  second gate is anchored after scenario-test-v1 baseline commit', app.indexOf('RMOOZ-SCENARIO-QA-BATCH-14') !== -1 && fs.existsSync(E2E1));
    assert('T-3  release HUD loads before inline status details wrapper', app.indexOf('scenario-evidence-release-hud.js') !== -1 && app.indexOf('scenario-evidence-release-hud.js') < app.indexOf('RMOOZ-SCENARIO-QA-BATCH-14'));
    assert('T-4  command palette remains in the app header', app.indexOf('id="scenario-command-palette-btn"') !== -1 && app.indexOf('id="release-hud-mount"') < app.indexOf('id="scenario-command-palette-btn"'));
    assert('T-5  no offline deployment path is referenced by this gate', src(__filename).indexOf('Offline' + '_Deployment') === -1);
})();

console.log('\n--- ST2-2: drawer target-map and block-order regression ---');
(function () {
    var targetBlock = unitPanelSrc.match(/var SCENARIO_EVIDENCE_STATUS_TARGETS = \{([\s\S]*?)\n\s*\};/);
    assert('T-1  status target map exists', !!targetBlock);
    var body = targetBlock ? targetBlock[1] : '';
    assert('T-2  release target maps to overview/release block', /release:\s*\{\s*group:\s*'overview',\s*block:\s*'usp-release-gate-block'/.test(body));
    assert('T-3  closeout target maps to QA closeout block', /closeout:\s*\{\s*group:\s*'qa',\s*block:\s*'usp-review-closeout-block'/.test(body));
    assert('T-4  coverage target maps to overview coverage block', /coverage:\s*\{\s*group:\s*'overview',\s*block:\s*'usp-evidence-coverage-block'/.test(body));
    assert('T-5  handoff target maps to handoff acceptance block', /handoff:\s*\{\s*group:\s*'handoff',\s*block:\s*'usp-handoff-acceptance-block'/.test(body));
    assert('T-6  populate order keeps review→handoff→release→coverage chain',
        unitPanelSrc.indexOf('populateScenarioReviewQueue(unit)') < unitPanelSrc.indexOf('populateScenarioHandoffPackage(unit)') &&
        unitPanelSrc.indexOf('populateScenarioHandoffAcceptance(unit)') < unitPanelSrc.indexOf('populateScenarioReleaseGate(unit)') &&
        unitPanelSrc.indexOf('populateScenarioReleaseGate(unit)') < unitPanelSrc.indexOf('populateEvidenceQualityGate(unit)'));
    assert('T-7  drawer group setup stays idempotent', hasAll(unitPanelSrc, ['ensureScenarioEvidencePanel()', 'SCENARIO_EVIDENCE_GROUPS.forEach', 'block.parentNode !== groupBody']));
})();

console.log('\n--- ST2-3: review session export/import and stale fingerprint guard ---');
(function () {
    assert('T-1  different scenarios produce different fingerprints', fpA !== fpB);
    RS.clearSession(fpA);
    RS.clearSession(fpB);
    AU.clearTrail(fpA);
    FS.reset();
    FS.setScenarioContext(wsA, { generated_at: FIXED_AT });
    FS.setStatus(issuesA[0], 'reviewed', 'Reviewed in scenario A.', { timestamp: FIXED_AT, fingerprint: fpA });
    FS.setStatus(issuesA[1] || issuesA[0], 'fixed_externally', 'Verified outside RMOOZ.', { timestamp: FIXED_AT, fingerprint: fpA });
    var exported = RS.exportSession(fpA, { generated_at: FIXED_AT });
    assert('T-2  exported session carries records and fingerprint', exported.scenario_fingerprint === fpA && arr(exported.records).length >= 2);
    var importedFresh = RS.importSession(exported, { current_fingerprint: fpA, generated_at: FIXED_AT });
    assert('T-3  same-scenario import is not stale', importedFresh.scenario_fingerprint === fpA && importedFresh.stale === false);
    var importedStale = RS.importSession(exported, { current_fingerprint: fpB, generated_at: FIXED_AT });
    assert('T-4  cross-scenario import is marked stale', importedStale.scenario_fingerprint === fpB && importedStale.original_scenario_fingerprint === fpA && importedStale.stale === true);
    var trail = AU.exportTrail(fpA, { generated_at: FIXED_AT });
    assert('T-5  local status changes created audit rows', arr(trail.events).some(function (e) { return e.type === 'status_changed'; }));
})();

console.log('\n--- ST2-4: handoff mismatch, acceptance rejection, and local-only import semantics ---');
(function () {
    var closeout = closeoutBlocked(fpA);
    var pkg = HP.buildPackage(wsA, { fingerprint: fpA, review_queue: queueA, review_session: RS.loadSession(fpA), closeout: closeout, audit_trail: AU.exportTrail(fpA), selected_unit: wsA.units[0], generated_at: FIXED_AT });
    var json = HP.toJson(pkg);
    var previewMatch = HP.previewImport(json, fpA, { fingerprint: fpA, generated_at: FIXED_AT });
    var previewMismatch = HP.previewImport(json, fpB, { fingerprint: fpB, generated_at: FIXED_AT });
    assert('T-1  matching handoff preview allows UI-state import only', previewMatch.valid && previewMatch.fingerprint_match && /UI state only/.test(previewMatch.action));
    assert('T-2  mismatch handoff preview warns before applying status', previewMismatch.valid && previewMismatch.fingerprint_match === false && previewMismatch.action === 'Review before applying imported review status.');
    var reject = HA.decide(json, fpB, 'accepted', { fingerprint: fpB, generated_at: FIXED_AT });
    assert('T-3  invalid acceptance for mismatched fingerprint is forced safe by release gate later', reject.applied && reject.record.fingerprint_match === false);
    var receipt = HA.buildReceipt(reject.record, { generated_at: FIXED_AT });
    assert('T-4  mismatch receipt records fingerprint mismatch', receipt.fingerprint_match === false && receipt.package_fingerprint === fpA && receipt.current_scenario_fingerprint === fpB);
    var gate = RG.buildReleaseGate(wsB, { fingerprint: fpB, closeout: closeoutReady(fpB), acceptance: reject.record, generated_at: FIXED_AT });
    assert('T-5  release gate blocks mismatched accepted package', gate.status === 'not_ready' && arr(gate.blockers).some(function (b) { return b.code === 'fingerprint_match'; }));
})();

console.log('\n--- ST2-5: release audit history, export receipts, and report stitching ---');
(function () {
    RA.clear(fpA, { fingerprint: fpA });
    AU.clearTrail(fpA);
    var blocked = RG.buildReleaseGate(wsA, { fingerprint: fpA, closeout: closeoutBlocked(fpA), acceptance: { decision: 'pending', decision_label_en: 'Pending Decision', fingerprint_match: false }, generated_at: FIXED_AT });
    var blockedReceipt = RA.observeRelease(blocked, { fingerprint: fpA, timestamp: FIXED_AT });
    assert('T-1  release audit records not-ready transition', blockedReceipt.decision === 'not_ready' && blockedReceipt.blocker_count > 0);
    var ready = RG.buildReleaseGate(wsA, { fingerprint: fpA, closeout: closeoutReady(fpA), acceptance: { decision: 'accepted', decision_label_en: 'Accepted', fingerprint_match: true, current_scenario_fingerprint: fpA, package_fingerprint: fpA }, generated_at: FIXED_AT });
    var readyReceipt = RA.observeRelease(ready, { fingerprint: fpA, timestamp: FIXED_AT });
    assert('T-2  release audit records ready transition', readyReceipt.decision === 'ready_for_release' && readyReceipt.releasable === true);
    var exportEvents = [];
    var container = makeReleaseContainer(['certificate', 'json', 'download', 'print']);
    RG.bindReleaseGateActions(container, ready, { generated_at: FIXED_AT, onExport: function (kind) { exportEvents.push(kind); RA.recordExport(kind, ready, { fingerprint: fpA, timestamp: FIXED_AT }); } });
    container.querySelectorAll().forEach(function (btn) { btn.click(); });
    assert('T-3  release gate export controls report certificate/json exports', exportEvents.join('|') === 'certificate|json|json|certificate');
    var history = RA.exportState(fpA, { fingerprint: fpA, generated_at: FIXED_AT });
    assert('T-4  release audit history keeps latest exported receipt', history.latest && history.latest.exported === true && arr(history.history).length >= 2);
    assert('T-5  release audit summary is copyable content', RA.historySummary(fpA, { fingerprint: fpA }).indexOf('Release Decision History') === 0);
    var report = FR.buildReport(wsA, { matrix: matrix(), review_queue: queueA, review_closeout: closeoutReady(fpA), release_gate: ready, release_history: history, release_certificate: RG.buildCertificate(ready, { latest_timestamp: FIXED_AT, generated_at: FIXED_AT }), selected_unit: wsA.units[0], generated_at: FIXED_AT });
    var summary = FR.buildSummary(report);
    assert('T-6  force report includes release decision history and certificate', hasAll(summary, ['Release Decision History', 'Release Certificate', 'Evidence Release Gate']));
})();

console.log('\n--- ST2-6: command palette coverage and strict non-mutation boundaries ---');
(function () {
    assert('T-1  command palette has fourteen operator actions', arr(STATUS.commandPaletteActions()).length === 14);
    var grouped = arr(STATUS.commandPaletteActions()).reduce(function (acc, command) { acc[command.target] = (acc[command.target] || 0) + 1; return acc; }, {});
    assert('T-2  command actions cover scenario status plus CMO readiness targets', keys(grouped).join('|') === 'closeout|cmo|coverage|handoff|release');
    assert('T-3  copy filter remains browser-local only', STATUS.filterCommands(STATUS.commandPaletteActions(), '', 'copy').every(function (command) { return command.kind === 'copy'; }));
    assert('T-4  status context render preserves detail line', STATUS.renderCommandPaletteHtml(STATUS.decorateCommands(STATUS.filterCommands(STATUS.commandPaletteActions(), 'release', 'release'), { release_gate: { status_label_en: 'Not Ready', checks: [{ key: 'unresolved_issues', actual: '2', status: 'fail' }] } }, { release: { label_en: 'Not Ready', cls: 'not-ready' } }), 0).indexOf('2 unresolved issues') !== -1);
    var sources = [
        statusScript,
        unitPanelSrc,
        src(path.join(SHELL, 'scenario-evidence-review-session.js')),
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
