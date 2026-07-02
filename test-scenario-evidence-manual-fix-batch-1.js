/* ============================================================================
 * test-scenario-evidence-manual-fix-batch-1.js - RMOOZ-SCENARIO-QA-BATCH-4
 * ----------------------------------------------------------------------------
 * Headless gate for QA-44..50 manual evidence fix workflow.
 * Verifies local status tracking, queue/repair/brief/report integration,
 * app/offline parity, and read-only boundaries.
 * ========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var SHELL = path.join(ROOT, 'UI_MOdified', 'client', 'shell');
var OFF = path.join(ROOT, 'UI_MOdified', 'Offline_Deployment', 'offline_app', 'client', 'shell');
var APP = path.join(ROOT, 'UI_MOdified', 'client', 'app.html');
var OFF_APP = path.join(ROOT, 'UI_MOdified', 'Offline_Deployment', 'offline_app', 'client', 'app.html');

var passed = 0, failed = 0;
function assert(label, cond) {
    if (cond) { console.log('  PASS  ' + label); passed++; }
    else { console.error('  FAIL  ' + label); failed++; }
}
function src(file) { return fs.readFileSync(file, 'utf8'); }
function requireModule(name) { return require(path.join(SHELL, name)); }

var fakeMatrix = {
    counts: { Ready: 1, Blocked: 1, Unknown: 1 },
    top_blockers: [{ code: 'no_contact_evidence', count: 1, label_ar: 'no contact' }],
    rows: [
        { uid: 'BLUE-IFV-02', unit_label: 'BLUE-IFV-02', side: 'BLUE', contact_status: 'Unknown', final_status: 'Unknown', reason_code: 'no_contact_evidence', weapon: '30mm' },
        { uid: 'BLUE-IFV-04', unit_label: 'BLUE-IFV-04', side: 'BLUE', contact_status: 'Detected', final_status: 'Blocked', reason_code: 'out_of_range', weapon: null },
        { uid: 'RED-ARMOR-01', unit_label: 'RED-ARMOR-01', side: 'RED', contact_status: 'Detected', final_status: 'Ready', reason_code: null, weapon: 'Cannon' }
    ],
    total_units: 3
};
function freshWs() {
    return {
        objective: { name: 'Objective X', id: 'OBJ-X' },
        red_units: [{ uid: 'RED-ARMOR-01', side: 'RED', role: 'armor', lat: 24.1, lng: 46.2, weapon: 'Cannon', doctrine: 'std' }],
        units: [
            { uid: 'BLUE-IFV-02', side: 'BLUE', role: 'ifv', lat: 24.2, lng: 46.3, label: 'BLUE-IFV-02', weapon: '30mm' },
            { uid: 'BLUE-IFV-04', side: 'BLUE', role: 'ifv', lat: 24.3, lng: 46.4, label: 'BLUE-IFV-04' },
            { uid: 'RED-ARMOR-01', side: 'RED', role: 'armor', lat: 24.1, lng: 46.2, label: 'RED-ARMOR-01', weapon: 'Cannon', doctrine: 'std' }
        ]
    };
}

console.log('\n=== RMOOZ-SCENARIO-QA-BATCH-4 Manual Fix Gate ===\n');

var FS = requireModule('scenario-evidence-fix-status.js');
var MF = requireModule('scenario-evidence-manual-fix.js');
var RQ = requireModule('scenario-evidence-review-queue.js');
var RP = requireModule('scenario-evidence-repair-planner.js');
var CB = requireModule('cmo-commander-brief.js');
var FR = requireModule('cmo-force-evidence-report.js');

console.log('--- QA-44/45: manual workspace + local status tracker ---');
(function () {
    FS.reset();
    assert('T-1  fix-status module loads', !!FS && typeof FS.setStatus === 'function');
    assert('T-2  manual-fix module loads', !!MF && typeof MF.buildWorkspace === 'function');
    var issue = { uid: 'BLUE-IFV-02', label: 'BLUE-IFV-02', reason: 'no_contact_evidence', priority: 2, priority_label_en: 'High' };
    var rec0 = FS.getStatus(issue);
    assert('T-3  default status is needs_review', rec0.status === 'needs_review');
    var rec1 = FS.setStatus(issue, 'reviewed', 'Checked sensor coverage', { timestamp: '2026-07-02T00:00:00.000Z' });
    assert('T-4  status changes are tracked locally', rec1.status === 'reviewed' && rec1.note === 'Checked sensor coverage');
    var workspace = MF.buildWorkspace(issue, { repair_plan: { plans: [{ uid: 'BLUE-IFV-02', reason: 'no_contact_evidence', steps: [{ en: 'Check sensor coverage', ar: 'sensor' }] }] } });
    assert('T-5  workspace is active for selected issue', workspace.active === true);
    assert('T-6  workspace lists required fields', workspace.required_fields.indexOf('contact source') !== -1);
    var html = MF.renderWorkspaceHtml(workspace);
    assert('T-7  workspace renders Manual Evidence Fix title', html.indexOf('Manual Evidence Fix') !== -1);
    assert('T-8  workspace renders status controls', html.indexOf('data-manual-status="fixed_externally"') !== -1);
})();

console.log('\n--- QA-46/47: queue badges and repair planner status integration ---');
(function () {
    var ws = freshWs();
    var queue = RQ.buildReviewQueue(ws, { matrix: fakeMatrix, generated_at: '2026-07-02T00:00:00.000Z' });
    var contactIssue = null;
    queue.groups.forEach(function (g) {
        g.issues.forEach(function (i) {
            if (i.uid === 'BLUE-IFV-02' && i.reason === 'no_contact_evidence') contactIssue = i;
        });
    });
    assert('T-1  queue contains BLUE-IFV-02 no_contact issue', !!contactIssue);
    assert('T-2  queue issue carries reviewed status', contactIssue.manual_status === 'reviewed');
    var queueHtml = RQ.renderQueueHtml(queue);
    assert('T-3  review queue renders status badge', queueHtml.indexOf('usp-queue-status--reviewed') !== -1 && queueHtml.indexOf('Reviewed') !== -1);

    FS.setStatus({ uid: 'BLUE-IFV-04', reason: 'no_weapon_evidence' }, 'deferred', '', { timestamp: '2026-07-02T00:01:00.000Z' });
    var plan = RP.buildRepairPlan(ws, { matrix: fakeMatrix, review_queue: queue, generated_at: '2026-07-02T00:00:00.000Z' });
    var planHtml = RP.renderRepairHtml(plan);
    assert('T-4  repair plan exposes manual review summary', plan.manual_review && plan.manual_review.counts.reviewed >= 1);
    assert('T-5  repair cards render manual status', planHtml.indexOf('usp-repair-status--reviewed') !== -1);
    assert('T-6  repair cards provide Manual button', planHtml.indexOf('data-cmo-repair-issue') !== -1);
})();

console.log('\n--- QA-44 click binding opens manual workspace intent ---');
(function () {
    var queue = RQ.buildReviewQueue(freshWs(), { matrix: fakeMatrix });
    var clicked = null;
    var btn = {
        getAttribute: function (name) {
            return {
                'data-cmo-queue-uid': 'BLUE-IFV-02',
                'data-cmo-queue-reason': 'no_contact_evidence'
            }[name] || '';
        },
        addEventListener: function (event, fn) { this._fn = fn; }
    };
    var container = { querySelectorAll: function () { return [btn]; } };
    RQ.bindQueueInteractions(container, queue, {
        onOpenManualFix: function (issue) { clicked = issue; }
    });
    btn._fn();
    assert('T-1  issue click opens manual fix callback', clicked && clicked.uid === 'BLUE-IFV-02' && clicked.reason === 'no_contact_evidence');

    var changed = null;
    var statusBtn = {
        getAttribute: function () { return 'fixed_externally'; },
        addEventListener: function (event, fn) { this._fn = fn; }
    };
    var note = { value: 'Fixed in source data' };
    var manualContainer = {
        querySelectorAll: function () { return [statusBtn]; },
        querySelector: function () { return note; }
    };
    var workspace = MF.buildWorkspace(clicked);
    MF.bindWorkspaceInteractions(manualContainer, workspace, { onStatusChange: function (rec) { changed = rec; } });
    statusBtn._fn();
    assert('T-2  status button updates local status', changed && changed.status === 'fixed_externally');
    assert('T-3  stored status remains local record', FS.getStatus(clicked).status === 'fixed_externally');
})();

console.log('\n--- QA-48/49: commander brief and force report export manual status ---');
(function () {
    var ws = freshWs();
    var queue = RQ.buildReviewQueue(ws, { matrix: fakeMatrix });
    var brief = CB.buildBrief(ws, null, { matrix: fakeMatrix, review_queue: queue });
    assert('T-1  commander brief has manual review counts', brief.scenario_qa.manual_review && brief.scenario_qa.manual_review.counts.fixed_externally >= 1);
    var briefHtml = CB.renderBriefHtml(brief);
    assert('T-2  commander brief renders Manual Review row', briefHtml.indexOf('Manual Review') !== -1 && briefHtml.indexOf('Fixed externally') !== -1);
    var report = FR.buildReport(ws, { matrix: fakeMatrix, review_queue: queue, generated_at: '2026-07-02T00:00:00.000Z' });
    assert('T-3  force report has manual_review field', report.manual_review && report.manual_review.counts);
    var summary = FR.buildSummary(report);
    assert('T-4  force report summary exports manual review status', summary.indexOf('Evidence Manual Review') !== -1 && summary.indexOf('Fixed Externally') !== -1);
    var json = FR.toJson(report);
    assert('T-5  force report JSON exports manual status', json.indexOf('"manual_review"') !== -1 && json.indexOf('fixed_externally') !== -1);
})();

console.log('\n--- Non-mutation and static wiring ---');
(function () {
    var ws = freshWs();
    var before = JSON.stringify(ws);
    var queue = RQ.buildReviewQueue(ws, { matrix: fakeMatrix });
    var plan = RP.buildRepairPlan(ws, { matrix: fakeMatrix, review_queue: queue });
    MF.buildWorkspace(queue.groups[0].issues[0], { repair_plan: plan });
    FS.setStatus(queue.groups[0].issues[0], 'reviewed');
    assert('T-1  status tracking does not mutate world state', JSON.stringify(ws) === before);

    var panel = src(path.join(SHELL, 'unit-status-panel.js'));
    assert('T-2  unit panel populates manual fix after repair plan', panel.indexOf('populateScenarioRepairPlan(unit)') < panel.indexOf('populateScenarioManualFix(unit)'));
    assert('T-3  unit panel populates manual fix before quality gate', panel.indexOf('populateScenarioManualFix(unit)') < panel.indexOf('populateEvidenceQualityGate(unit)'));
    assert('T-4  unit panel has populateScenarioManualFix', panel.indexOf('function populateScenarioManualFix') !== -1);

    [src(APP), src(OFF_APP)].forEach(function (html) {
        assert('T-5  app shell has manual fix block', html.indexOf('usp-manual-fix-block') !== -1);
        assert('T-6  app shell loads fix-status script', html.indexOf('scenario-evidence-fix-status.js') !== -1);
        assert('T-7  app shell loads manual-fix script', html.indexOf('scenario-evidence-manual-fix.js') !== -1);
    });
})();

console.log('\n--- Boundary and offline parity ---');
(function () {
    var modules = [
        'scenario-evidence-fix-status.js',
        'scenario-evidence-manual-fix.js',
        'scenario-evidence-review-queue.js',
        'scenario-evidence-repair-planner.js',
        'cmo-commander-brief.js',
        'cmo-force-evidence-report.js'
    ];
    modules.forEach(function (name) {
        var main = src(path.join(SHELL, name));
        var off = src(path.join(OFF, name));
        assert('offline/' + name + ' exists and matches main', main === off);
    });
    var source = modules.map(function (name) { return src(path.join(SHELL, name)); }).join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    [
        ['no fetch(', /fetch\s*\(/],
        ['no XMLHttpRequest', /XMLHttpRequest/],
        ['no backend /api/ call', /\/api\//],
        ['no database/storage write', /localStorage|sessionStorage|indexedDB|\.writeFile|writeFileSync/],
        ['no DOCX staging', /stage-doc|SLOT_FILE|docs\.red|docs\.blue|DOCX/i],
        ['no combat/action/doctrine mutation', /applyAction|commitAction|executeAction|autoFire|auto-fire|applyDoctrine|commitDoctrine|setDoctrine|\/doctrine/]
    ].forEach(function (pair) {
        assert(pair[0], !pair[1].test(source));
    });
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
