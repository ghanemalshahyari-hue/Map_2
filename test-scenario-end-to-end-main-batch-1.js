/* ============================================================================
 * test-scenario-end-to-end-main-batch-1.js
 * RMOOZ-SCENARIO-TEST-BATCH-1 - End-to-End Scenario Test Pack
 * ----------------------------------------------------------------------------
 * Main-app-only headless gate. Exercises deterministic Objective X scenario
 * evidence flow from setup/review through drawer/header navigation, manual
 * local review status, audit trail, handoff package/acceptance, release gate,
 * and force-report summaries. This test intentionally does not inspect, sync,
 * rebuild, or run offline files: offline sync/testing is pending by user
 * instruction.
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
function labels(list) { return arr(list).map(function (item) { return item.label || item.label_en || item.key || item.target || ''; }); }
function flattenIssues(queue) {
    var out = [];
    arr(obj(queue).groups).forEach(function (group) {
        arr(group.issues).forEach(function (issue) { out.push(Object.assign({ group: group.key }, issue)); });
    });
    return out;
}
function sourceWithoutComments(text) {
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

function makeBlock(id, group) {
    return {
        id: id,
        focused: false,
        scrolled: false,
        attrs: {},
        getAttribute: function (name) { return this.attrs[name]; },
        hasAttribute: function (name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); },
        setAttribute: function (name, value) { this.attrs[name] = String(value == null ? '' : value); },
        removeAttribute: function (name) { delete this.attrs[name]; },
        focus: function () { this.focused = true; },
        scrollIntoView: function () { this.scrolled = true; },
        closest: function (sel) { return sel === '.se-group' ? group : null; },
        querySelector: function () { return null; },
        querySelectorAll: function () { return []; }
    };
}
function makeNode() {
    return {
        id: '',
        className: '',
        innerHTML: '',
        textContent: '',
        value: '',
        attrs: {},
        style: {},
        parentNode: null,
        children: [],
        setAttribute: function (name, value) { this.attrs[name] = String(value == null ? '' : value); },
        getAttribute: function (name) { return this.attrs[name]; },
        removeAttribute: function (name) { delete this.attrs[name]; },
        hasAttribute: function (name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); },
        appendChild: function (child) { this.children.push(child); child.parentNode = this; return child; },
        removeChild: function (child) { this.children = this.children.filter(function (c) { return c !== child; }); return child; },
        addEventListener: function () {},
        focus: function () {},
        click: function () {},
        querySelector: function () { return null; },
        querySelectorAll: function () { return []; }
    };
}
function loadStatusApi(script, hudApi) {
    var opened = [];
    var copied = [];
    var group = {
        attrs: {},
        getAttribute: function (name) { return this.attrs[name]; },
        setAttribute: function (name, value) { this.attrs[name] = String(value == null ? '' : value); },
        querySelector: function (sel) {
            if (sel !== '.se-group-hdr') return null;
            return { attrs: {}, setAttribute: function (name, value) { this.attrs[name] = String(value == null ? '' : value); } };
        }
    };
    var blockIds = [
        'usp-release-gate-block', 'usp-review-closeout-block', 'usp-review-queue-block',
        'usp-evidence-coverage-block', 'usp-handoff-acceptance-block', 'usp-handoff-package-block'
    ];
    var blocks = {};
    blockIds.forEach(function (id) { blocks[id] = makeBlock(id, group); });
    var fakeWindow = {};
    fakeWindow.window = fakeWindow;
    fakeWindow.console = console;
    fakeWindow.navigator = {
        clipboard: {
            writeText: function (text) {
                copied.push(String(text == null ? '' : text));
                return { then: function (ok) { if (typeof ok === 'function') ok(); } };
            }
        }
    };
    fakeWindow.setTimeout = function (fn) { if (typeof fn === 'function') fn(); return 1; };
    fakeWindow.clearTimeout = function () {};
    fakeWindow.document = {
        readyState: 'complete',
        body: makeNode(),
        createElement: function () { return makeNode(); },
        addEventListener: function () {},
        getElementById: function (id) { return blocks[id] || null; },
        querySelector: function () { return null; },
        querySelectorAll: function () { return []; }
    };
    fakeWindow.RmoozScenarioEvidenceReleaseHud = hudApi;
    fakeWindow.AppUnitStatusPanel = {
        openScenarioEvidenceTarget: function (target) { opened.push(target); }
    };
    vm.runInNewContext(script, { window: fakeWindow, console: console });
    return { api: fakeWindow.RmoozScenarioStatusHudDetails, opened: opened, copied: copied, blocks: blocks, group: group };
}

function fakeIssueButton(uid, reason) {
    var handlers = {};
    return {
        _a: { 'data-cmo-queue-uid': uid, 'data-cmo-queue-reason': reason },
        getAttribute: function (name) { return this._a[name]; },
        addEventListener: function (ev, fn) { handlers[ev] = fn; },
        click: function () { if (handlers.click) handlers.click(); }
    };
}
function fakeContainer(buttons) {
    return { querySelectorAll: function () { return buttons || []; }, querySelector: function () { return null; } };
}

var FIXED_AT = '2026-07-02T20:00:00.000Z';
function sampleWorldState() {
    return {
        scenario_id: 'RMOOZ-ST-BATCH-1',
        name: 'Objective X E2E Main Scenario',
        objective: { id: 'OBJ-X', name: 'Objective X', lat: 24.62, lng: 54.41 },
        units: [
            { uid: 'RED-SAM-1', side: 'RED', role: 'SAM battery', lat: 24.61, lng: 54.39, label: 'Red SAM-1', weapon: 'SAM', sensor: 'Search radar', doctrine: 'defensive' },
            { uid: 'BLUE-CAP-1', side: 'BLUE', role: 'Fighter CAP', lat: 24.72, lng: 54.49, label: 'Blue CAP-1', weapon: 'AAM', sensor: 'Radar', doctrine: 'cap' },
            { uid: 'RED-RECON-2', side: 'RED', role: 'Recon', lat: 24.67, lng: 54.44, label: 'Red Recon-2' }
        ],
        red_units: [{ uid: 'RED-SAM-1', side: 'RED', lat: 24.61, lng: 54.39 }],
        blue_units: [{ uid: 'BLUE-CAP-1', side: 'BLUE', lat: 24.72, lng: 54.49 }]
    };
}
function sampleMatrix() {
    return {
        version: 'st-batch-1',
        counts: { Ready: 1, Blocked: 1, Unknown: 1 },
        top_blockers: [
            { code: 'no_contact_evidence', count: 1, label_ar: 'لا يوجد دليل اتصال' },
            { code: 'out_of_range', count: 1, label_ar: 'خارج المدى' }
        ],
        rows: [
            { uid: 'RED-SAM-1', unit_label: 'Red SAM-1', side: 'RED', contact_status: 'Detected', engagement_status: 'Ready', final_status: 'Ready', reason_code: null, weapon: 'SAM', target_uid: 'BLUE-CAP-1' },
            { uid: 'BLUE-CAP-1', unit_label: 'Blue CAP-1', side: 'BLUE', contact_status: 'Detected', engagement_status: 'Blocked', final_status: 'Blocked', reason_code: 'out_of_range', weapon: 'AAM', target_uid: 'RED-SAM-1' },
            { uid: 'RED-RECON-2', unit_label: 'Red Recon-2', side: 'RED', contact_status: 'Unknown', engagement_status: 'Unknown', final_status: 'Unknown', reason_code: 'no_contact_evidence', weapon: null, target_uid: null }
        ],
        total_units: 3,
        source: 'Deterministic ST-1 fixture',
        active_filter: { status: 'All', reason_code: null }
    };
}
function readyCloseout(fp) {
    return {
        version: 'st-ready-closeout',
        generated_at: FIXED_AT,
        status: 'ready_for_handoff',
        status_label_en: 'Ready for Handoff',
        status_label_ar: 'جاهز للتسليم',
        counts: { total: 3, needs_review: 0, reviewed: 2, deferred: 0, fixed_externally: 1 },
        blockers: [],
        unresolved: [],
        deferred_without_note: [],
        fixed_externally_without_note: [],
        deferred: [],
        fixed_externally: [{ issue_id: 'RED-RECON-2|missing_weapon', uid: 'RED-RECON-2', code: 'missing_weapon', status: 'fixed_externally', note: 'External evidence owner verified weapon field.' }],
        reviewed: [{ issue_id: 'RED-SAM-1|reviewed', uid: 'RED-SAM-1', code: 'reviewed', status: 'reviewed' }],
        issues: [],
        session: { scenario_fingerprint: fp, records: [] },
        source: 'ST deterministic ready closeout',
        read_only: true
    };
}

console.log('\n=== RMOOZ-SCENARIO-TEST-BATCH-1 End-to-End Main Scenario Gate ===\n');

var app = src(APP);
var unitPanelSrc = src(path.join(SHELL, 'unit-status-panel.js'));
var hudSrc = src(path.join(SHELL, 'scenario-evidence-release-hud.js'));
var statusScript = extractStatusScript(app);

var RS = shell('scenario-evidence-review-session.js');
var AU = shell('scenario-evidence-review-audit-trail.js');
var FS = shell('scenario-evidence-fix-status.js');
var RQ = shell('scenario-evidence-review-queue.js');
var CO = shell('scenario-evidence-review-closeout.js');
var HP = shell('scenario-evidence-handoff-package.js');
var HA = shell('scenario-evidence-handoff-acceptance.js');
var RG = shell('scenario-evidence-release-gate.js');
var FR = shell('cmo-force-evidence-report.js');
var HUD = shell('scenario-evidence-release-hud.js');
var statusHarness = loadStatusApi(statusScript, HUD);
var STATUS = statusHarness.api;

console.log('--- ST-1/ST-2: scenario launch readiness and Objective X setup path ---');
var ws = sampleWorldState();
var matrix = sampleMatrix();
var fp = RS.computeFingerprint(ws, { generated_at: FIXED_AT });
var queue = RQ.buildReviewQueue(ws, { matrix: matrix, generated_at: FIXED_AT });
var issues = flattenIssues(queue);
(function () {
    assert('T-1  main app shell has scenario export control', app.indexOf('id="rmooz-export-scenario"') !== -1);
    assert('T-2  main app header has Scenario Evidence HUD mount', app.indexOf('id="release-hud-mount"') !== -1);
    assert('T-3  main app header has command palette button', app.indexOf('id="scenario-command-palette-btn"') !== -1);
    assert('T-4  deterministic Objective X fixture is valid', ws.objective.name === 'Objective X' && ws.units.length === 3 && ws.red_units.length && ws.blue_units.length);
    assert('T-5  review queue builds issues for E2E flow', queue && queue.total_issues > 0 && issues.length > 0);
    assert('T-6  scenario fingerprint is deterministic', /^scenario-[0-9a-f]{8}$/.test(fp));
})();

console.log('\n--- ST-3: Scenario Evidence drawer grouped end-to-end path ---');
(function () {
    assert('T-1  drawer block registry covers commander/review/handoff/force evidence', hasAll(unitPanelSrc, [
        'usp-commander-brief-block', 'usp-review-queue-block', 'usp-handoff-package-block', 'usp-force-report-block'
    ]));
    assert('T-2  drawer exposes four consolidated groups', hasAll(unitPanelSrc, [
        'Commander Overview', 'Scenario QA Review', 'Handoff Workflow', 'Force Evidence'
    ]));
    assert('T-3  drawer quick-jump and group toggles are wired', hasAll(unitPanelSrc, [
        'scenario-evidence-jumpbar', 'data-se-jump', 'data-se-toggle', 'jumpToScenarioEvidenceGroup'
    ]));
    assert('T-4  drawer opens before target focus', unitPanelSrc.indexOf('openScenarioEvidencePanel()') < unitPanelSrc.indexOf('focusScenarioEvidenceBlock(cfg.block)'));
    assert('T-5  Unit Status remains selected-unit scoped', hasAll(unitPanelSrc, [
        'var currentUnit = null', 'currentUnit = unit', 'currentUnit = null', 'populatePanel(unit'
    ]));
})();

console.log('\n--- ST-4/ST-6: header status cluster, chips, and command palette navigation ---');
(function () {
    var ready = readyCloseout(fp);
    var accepted = { decision: 'accepted', decision_label_en: 'Accepted', fingerprint_match: true, current_scenario_fingerprint: fp, package_fingerprint: fp };
    var gate = RG.buildReleaseGate(ws, { fingerprint: fp, closeout: ready, acceptance: accepted, generated_at: FIXED_AT });
    var cluster = HUD.buildCluster({
        release_gate: gate,
        closeout: ready,
        coverage: { coverage_pct: 67, total: 3, verdict: { label_en: 'Needs Review' }, hud_details: { total: 3, contact_evidence: { present: 2 }, engagement_evidence: { present: 2 }, decision_chain: { present: 1 }, needs_review: 1 } },
        acceptance: accepted
    });
    var hudHtml = HUD.renderClusterHtml(cluster);
    assert('T-1  HUD renders Release/Closeout/Coverage/Handoff chips', hasAll(hudHtml, ['>Release<', '>Closeout<', '>Coverage<', '>Handoff<']));
    assert('T-2  each chip carries target open data', ['release', 'closeout', 'coverage', 'handoff'].every(function (target) {
        return hudHtml.indexOf('data-scenario-status-open="' + target + '"') !== -1;
    }));
    assert('T-3  command context API is exposed', STATUS && STATUS.COMMAND_CONTEXT_VERSION === '1.0.0-rmooz-scenario-qa-batch-17');
    assert('T-4  command palette filter catalog is complete', labels(STATUS.commandPaletteFilters()).join('|') === 'All|Release|Closeout|Coverage|Handoff|Copy');
    var coverageCommands = STATUS.filterCommands(STATUS.commandPaletteActions(), 'review', 'coverage');
    assert('T-5  command search combines with coverage filter', labels(coverageCommands).join('|') === 'Open Review Queue');
    var decorated = STATUS.decorateCommands(coverageCommands, {
        release_gate: gate,
        closeout: ready,
        coverage: { coverage_pct: 67, hud_details: { total: 3, contact_evidence: { present: 2 }, engagement_evidence: { present: 2 }, decision_chain: { present: 1 }, needs_review: 1 } },
        acceptance: accepted
    }, cluster);
    var paletteHtml = STATUS.renderCommandPaletteHtml(decorated, 0);
    assert('T-6  command palette renders current status context', paletteHtml.indexOf('scenario-command-item-context') !== -1 && paletteHtml.indexOf('Coverage: 67%') !== -1);
    assert('T-7  filter toolbar renders active state', STATUS.renderCommandFiltersHtml('handoff').indexOf('aria-pressed="true"') !== -1);
    ['release', 'closeout', 'coverage', 'handoff'].forEach(function (target) {
        var action = STATUS.actionsForTarget(target)[0];
        var before = statusHarness.opened.length;
        STATUS.handleAction(action, { target: target, lines: [], title: target }, { querySelector: function () { return { textContent: '' }; } }, null);
        assert('T-chip  ' + target + ' action opens target drawer section', statusHarness.opened.length === before + 1 && statusHarness.opened[statusHarness.opened.length - 1] === target);
    });
})();

console.log('\n--- ST-5/ST-9: review queue drilldown and deterministic local review state ---');
(function () {
    var before = JSON.stringify(ws);
    RS.clearSession(fp);
    AU.clearTrail(fp);
    HA.clearDecision(fp, { fingerprint: fp });
    FS.reset();
    FS.setScenarioContext(ws, { generated_at: FIXED_AT });
    assert('T-1  issue click can select/focus affected unit', RQ.resolveDrilldownIntent('missing_weapon').select_unit === true && RQ.resolveDrilldownIntent('missing_weapon').scroll_to === 'usp-engagement-evidence-block');
    var clicked = [];
    var btn = fakeIssueButton('RED-RECON-2', 'missing_weapon');
    RQ.bindQueueInteractions(fakeContainer([btn]), queue, { onSelectIssue: function (issue, intent) { clicked.push({ issue: issue, intent: intent }); } });
    btn.click();
    assert('T-2  review queue click dispatches issue + intent', clicked.length === 1 && clicked[0].issue.uid === 'RED-RECON-2' && clicked[0].intent.select_unit === true);
    assert('T-3  unit-status panel reuses selectEvidenceUnit for drilldown', unitPanelSrc.indexOf('selectEvidenceUnit({ uid: issue.uid') !== -1);
    assert('T-4  manual status starts local only', FS.getStatus(issues[0]).status === 'needs_review');
    FS.setStatus(issues[0], 'reviewed', 'Operator verified evidence.', { timestamp: FIXED_AT, fingerprint: fp });
    FS.setStatus(issues[1] || issues[0], 'deferred', 'Deferred for commander review.', { timestamp: FIXED_AT, fingerprint: fp });
    FS.setStatus(issues[2] || issues[0], 'fixed_externally', 'External evidence owner confirmed fix.', { timestamp: FIXED_AT, fingerprint: fp });
    var summary = FS.summarize(queue);
    assert('T-5  manual fix status updates local review ledger', summary.counts.reviewed >= 1 && summary.counts.deferred >= 1 && summary.counts.fixed_externally >= 1);
    assert('T-6  world state is not mutated by manual review', JSON.stringify(ws) === before);
    var trail = AU.exportTrail(fp, { generated_at: FIXED_AT });
    assert('T-7  audit trail records local review events', arr(trail.events).some(function (event) { return event.type === 'status_changed'; }));
})();

console.log('\n--- ST-7/ST-8: handoff package, acceptance receipt, release gate, and controls ---');
var closeout = CO.buildCloseout(queue, { world_state: ws, generated_at: FIXED_AT });
var auditTrail = AU.exportTrail(fp, { generated_at: FIXED_AT });
var reportSeed = FR.buildReport(ws, { matrix: matrix, review_queue: queue, review_closeout: closeout, audit_trail: auditTrail, selected_unit: ws.units[0], generated_at: FIXED_AT });
var handoffPkg = HP.buildPackage(ws, {
    fingerprint: fp,
    review_queue: queue,
    review_session: RS.loadSession(fp),
    closeout: closeout,
    audit_trail: auditTrail,
    force_report: reportSeed,
    selected_unit: ws.units[0],
    generated_at: FIXED_AT
});
var handoffJson = HP.toJson(handoffPkg);
(function () {
    var closeHtml = CO.renderCloseoutHtml(closeout);
    assert('T-1  closeout gate renders readiness state', closeHtml.indexOf('Evidence Review Closeout') !== -1 && closeHtml.indexOf(closeout.status_label_en || closeout.status) !== -1);
    var pkgHtml = HP.renderPackageHtml(handoffPkg);
    assert('T-2  handoff package preview controls exist', hasAll(pkgHtml, ['Copy Package JSON', 'Download Package JSON', 'Preview Import', 'Import Package JSON']));
    var match = HP.validatePackage(handoffJson, fp, { fingerprint: fp });
    var mismatch = HP.validatePackage(handoffJson, 'scenario-mismatch', { fingerprint: 'scenario-mismatch' });
    assert('T-3  handoff package validates fingerprint match', match.valid && match.fingerprint_match === true);
    assert('T-4  handoff package validates fingerprint mismatch', mismatch.valid && mismatch.fingerprint_match === false && arr(mismatch.warnings).length > 0);
    var diff = HA.buildPackageDiff(handoffJson, fp, { fingerprint: fp, local_closeout: closeout, generated_at: FIXED_AT });
    assert('T-5  acceptance diff is valid for matching package', diff.valid && diff.fingerprint_match && diff.counts.package_records >= 1);
    var decision = HA.decide(handoffJson, fp, 'accepted_with_warnings', { fingerprint: fp, diff: diff, generated_at: FIXED_AT, operator_note: 'ST batch accepted with warnings.' });
    assert('T-6  acceptance decision renders receipt', decision.applied && decision.receipt && decision.receipt.receipt_type === HA.RECEIPT_TYPE && decision.record.decision === 'accepted_with_warnings');
    var acceptanceHtml = HA.renderAcceptanceHtml(HA.buildAcceptance(fp, { fingerprint: fp, generated_at: FIXED_AT }));
    assert('T-7  acceptance copy/download controls exist', hasAll(acceptanceHtml, ['Copy Receipt', 'Download Receipt', 'Accept with Warnings']));
    var trailAfterAcceptance = AU.exportTrail(fp, { generated_at: FIXED_AT });
    assert('T-8  audit trail records handoff acceptance event', arr(trailAfterAcceptance.events).some(function (event) { return event.type === 'handoff_acceptance_accepted_with_warnings'; }));

    var notReadyGate = RG.buildReleaseGate(ws, { fingerprint: fp, closeout: closeout, acceptance: decision.record, generated_at: FIXED_AT });
    assert('T-9  release gate renders blockers when closeout is not ready', notReadyGate.status === 'not_ready' && arr(notReadyGate.blockers).length > 0);
    var ready = readyCloseout(fp);
    var accepted = { decision: 'accepted', decision_label_en: 'Accepted', fingerprint_match: true, current_scenario_fingerprint: fp, package_fingerprint: fp };
    var readyGate = RG.buildReleaseGate(ws, { fingerprint: fp, closeout: ready, acceptance: accepted, generated_at: FIXED_AT });
    assert('T-10 release gate can become releasable with ready closeout + accepted handoff', readyGate.releasable && readyGate.status === 'ready_for_release');
    var releaseHtml = RG.renderReleaseGateHtml(readyGate);
    assert('T-11 release certificate controls exist', hasAll(releaseHtml, ['Copy Release Certificate', 'Copy Release JSON', 'Download Release JSON', 'Print Release Certificate']));
    var certificate = RG.buildCertificate(readyGate, { latest_timestamp: FIXED_AT, generated_at: FIXED_AT });
    assert('T-12 release certificate summary includes closeout/handoff/fingerprint', hasAll(RG.certificateSummary(certificate), ['Closeout status:', 'Handoff acceptance:', 'Fingerprint validation:', 'Required checks:', 'Read-only release certificate']));
})();

console.log('\n--- ST-10: force report integration and strict boundary checks ---');
(function () {
    var ready = readyCloseout(fp);
    var accepted = { decision: 'accepted', decision_label_en: 'Accepted', fingerprint_match: true, current_scenario_fingerprint: fp, package_fingerprint: fp, imported: true, counts: { added: 1, changed: 0 } };
    var readyGate = RG.buildReleaseGate(ws, { fingerprint: fp, closeout: ready, acceptance: accepted, generated_at: FIXED_AT });
    var certificate = RG.buildCertificate(readyGate, { latest_timestamp: FIXED_AT, generated_at: FIXED_AT });
    var finalReport = FR.buildReport(ws, {
        matrix: matrix,
        review_queue: queue,
        review_closeout: ready,
        audit_trail: AU.exportTrail(fp, { generated_at: FIXED_AT }),
        handoff_package: handoffPkg,
        handoff_acceptance: accepted,
        release_gate: readyGate,
        release_certificate: certificate,
        selected_unit: ws.units[0],
        generated_at: FIXED_AT
    });
    var summary = FR.buildSummary(finalReport);
    assert('T-1  force report carries closeout/handoff/release summaries', hasAll(summary, [
        'Evidence Review Closeout', 'Evidence Handoff Package', 'Evidence Handoff Acceptance', 'Evidence Release Gate', 'Release Certificate'
    ]));
    assert('T-2  force report object exposes integrated evidence fields', finalReport.review_closeout && finalReport.handoff_acceptance && finalReport.release_gate && finalReport.release_certificate);

    var mainOnlySources = [
        statusScript,
        hudSrc,
        unitPanelSrc,
        src(path.join(SHELL, 'scenario-evidence-review-queue.js')),
        src(path.join(SHELL, 'scenario-evidence-fix-status.js')),
        src(path.join(SHELL, 'scenario-evidence-handoff-package.js')),
        src(path.join(SHELL, 'scenario-evidence-handoff-acceptance.js')),
        src(path.join(SHELL, 'scenario-evidence-release-gate.js')),
        src(path.join(SHELL, 'cmo-force-evidence-report.js'))
    ].map(sourceWithoutComments).join('\n');
    [
        ['no stage-doc / SLOT_FILE / Red-Blue DOCX staging returned', /stage-doc|SLOT_FILE|docs\.red|docs\.blue|Red-Blue|DOCX/i],
        ['no backend route is introduced by evidence path', /fetch\s*\(|XMLHttpRequest|\/api\//],
        ['no combat/action/doctrine mutation path is introduced', /applyAction|commitAction|executeAction|autoFire|auto-fire|applyDoctrine|commitDoctrine|setDoctrine|\/doctrine/i],
        ['runtime journal draft is not referenced', /legacy-shim-attack_objective_draft-15\.jsonl|scenario_overrides\.json/]
    ].forEach(function (pair) {
        assert('T-boundary  ' + pair[0], !pair[1].test(mainOnlySources));
    });
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
