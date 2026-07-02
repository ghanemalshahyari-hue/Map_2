/* ============================================================================
 * test-scenario-evidence-review-audit-trail-batch-1.js - RMOOZ-SCENARIO-QA-BATCH-7
 * ----------------------------------------------------------------------------
 * Headless gate for QA-67..74 evidence review audit trail + change history.
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
function requireFresh(name) {
    var p = path.join(SHELL, name);
    delete require.cache[require.resolve(p)];
    return require(p);
}

var storage = {};
global.localStorage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; },
    setItem: function (key, value) { storage[key] = String(value); },
    removeItem: function (key) { delete storage[key]; }
};
Object.defineProperty(global, 'navigator', {
    value: { clipboard: { writeText: function () { return Promise.resolve(); } } },
    configurable: true
});

function ws(id) {
    return {
        id: id || 'audit-scenario',
        objective: { id: 'OBJ-X' },
        units: [
            { uid: 'BLUE-IFV-02', side: 'BLUE', role: 'ifv', lat: 24.1, lng: 46.1, weapon: 'Gun' },
            { uid: 'RED-ARMOR-01', side: 'RED', role: 'armor', lat: 24.2, lng: 46.2, weapon: 'Cannon' }
        ]
    };
}
function queue() {
    return {
        total_issues: 2,
        groups: [{
            key: 'contact',
            issues: [
                { issue_id: 'BLUE-IFV-02|no_contact_evidence', uid: 'BLUE-IFV-02', label: 'BLUE-IFV-02', reason: 'no_contact_evidence', group: 'contact' },
                { issue_id: 'RED-ARMOR-01|missing_range', uid: 'RED-ARMOR-01', label: 'RED-ARMOR-01', reason: 'missing_range', group: 'range' }
            ]
        }]
    };
}

console.log('\n=== RMOOZ-SCENARIO-QA-BATCH-7 Audit Trail Gate ===\n');

var RS = requireFresh('scenario-evidence-review-session.js');
var AU = requireFresh('scenario-evidence-review-audit-trail.js');
var FS = requireFresh('scenario-evidence-fix-status.js');
var MF = requireFresh('scenario-evidence-manual-fix.js');
var CO = requireFresh('scenario-evidence-review-closeout.js');
var CB = requireFresh('cmo-commander-brief.js');
var FR = requireFresh('cmo-force-evidence-report.js');

console.log('--- QA-67/68: audit trail module + status/note history ---');
(function () {
    var world = ws('audit-a');
    var fp = RS.computeFingerprint(world);
    FS.setScenarioContext(world);
    AU.clearTrail(fp);
    FS.setStatus({ uid: 'BLUE-IFV-02', reason: 'no_contact_evidence' }, 'reviewed', 'Initial review', { timestamp: '2026-07-02T00:00:00.000Z' });
    FS.setStatus({ uid: 'BLUE-IFV-02', reason: 'no_contact_evidence' }, 'reviewed', 'Updated review note', { timestamp: '2026-07-02T00:01:00.000Z' });
    var trail = AU.getTrail(fp);
    assert('T-1  audit module loads', !!AU && typeof AU.recordStatusChange === 'function');
    assert('T-2  status change event recorded', trail.events.some(function (e) { return e.type === 'status_changed' && e.old_status === 'needs_review' && e.new_status === 'reviewed'; }));
    assert('T-3  note update event recorded', trail.events.some(function (e) { return e.type === 'note_updated' && e.new_note === 'Updated review note'; }));
    assert('T-4  audit event carries issue identity', trail.events.some(function (e) { return e.uid === 'BLUE-IFV-02' && e.code === 'no_contact_evidence'; }));
})();

console.log('\n--- QA-69: session import/export/reset events ---');
(function () {
    var fp = RS.computeFingerprint(ws('audit-a'));
    var exported = RS.exportSession(fp, { generated_at: '2026-07-02T00:02:00.000Z' });
    var exportBtn = { getAttribute: function () { return 'copy'; }, addEventListener: function (ev, fn) { this.fn = fn; } };
    var importBtn = { getAttribute: function () { return 'import'; }, addEventListener: function (ev, fn) { this.fn = fn; } };
    var clearBtn = { getAttribute: function () { return 'clear'; }, addEventListener: function (ev, fn) { this.fn = fn; } };
    var importBox = { value: JSON.stringify(exported) };
    var container = {
        querySelectorAll: function (sel) {
            if (sel === '[data-manual-session-action]') return [exportBtn, importBtn, clearBtn];
            return [];
        },
        querySelector: function (sel) {
            return sel === '[data-manual-session-import]' ? importBox : null;
        }
    };
    MF.bindWorkspaceInteractions(container, MF.buildWorkspace({ uid: 'BLUE-IFV-02', reason: 'no_contact_evidence' }), {});
    exportBtn.fn();
    importBtn.fn();
    clearBtn.fn();
    var trail = AU.getTrail(fp);
    assert('T-1  session export event recorded', trail.events.some(function (e) { return e.type === 'session_exported'; }));
    assert('T-2  session import event recorded', trail.events.some(function (e) { return e.type === 'session_imported'; }));
    assert('T-3  session reset event recorded', trail.events.some(function (e) { return e.type === 'session_reset'; }));
})();

console.log('\n--- QA-70: closeout status-change events ---');
(function () {
    var world = ws('audit-b');
    var fp = RS.computeFingerprint(world);
    FS.setScenarioContext(world);
    AU.clearTrail(fp);
    var first = CO.buildCloseout(queue(), { generated_at: '2026-07-02T00:03:00.000Z' });
    AU.observeCloseout(first, { timestamp: '2026-07-02T00:03:00.000Z' });
    FS.setStatus({ uid: 'BLUE-IFV-02', reason: 'no_contact_evidence' }, 'reviewed', 'Reviewed', { timestamp: '2026-07-02T00:04:00.000Z' });
    FS.setStatus({ uid: 'RED-ARMOR-01', reason: 'missing_range' }, 'deferred', 'Accepted exception', { timestamp: '2026-07-02T00:05:00.000Z' });
    var second = CO.buildCloseout(queue(), { generated_at: '2026-07-02T00:06:00.000Z' });
    AU.observeCloseout(second, { timestamp: '2026-07-02T00:06:00.000Z' });
    var trail = AU.getTrail(fp);
    assert('T-1  closeout status changed event recorded', trail.events.some(function (e) { return e.type === 'closeout_status_changed'; }));
    assert('T-2  closeout event captures old/new status', trail.events.some(function (e) { return e.old_status === 'incomplete' && e.new_status === 'ready_with_exceptions'; }));
})();

console.log('\n--- QA-71/72/73: panel, report, commander brief ---');
(function () {
    var world = ws('audit-b');
    var fp = RS.computeFingerprint(world);
    var trail = AU.exportTrail(fp, { generated_at: '2026-07-02T00:07:00.000Z' });
    var html = AU.renderAuditTrailHtml(trail);
    assert('T-1  audit trail panel renders title', html.indexOf('Evidence Review Audit Trail') !== -1);
    assert('T-2  audit trail panel renders latest activity', html.indexOf('Latest activity') !== -1);
    var brief = CB.buildBrief(world, null, { review_queue: queue(), audit_trail: trail });
    assert('T-3  commander brief includes last review activity', brief.scenario_qa.last_review_activity && brief.scenario_qa.last_review_activity.type);
    assert('T-4  commander brief renders Last Review Activity', CB.renderBriefHtml(brief).indexOf('Last Review Activity') !== -1);
    var report = FR.buildReport(world, {
        matrix: { counts: { Ready: 0, Blocked: 0, Unknown: 0 }, rows: [], top_blockers: [] },
        review_queue: queue(),
        audit_trail: trail,
        generated_at: '2026-07-02T00:08:00.000Z'
    });
    assert('T-5  force report includes audit trail', report.review_audit_trail && report.review_audit_trail.events.length > 0);
    assert('T-6  force report summary includes audit section', FR.buildSummary(report).indexOf('Evidence Review Audit Trail') !== -1);
})();

console.log('\n--- Static wiring, panel order, parity, and boundaries ---');
(function () {
    var panel = src(path.join(SHELL, 'unit-status-panel.js'));
    assert('T-1  panel defines populateScenarioReviewAuditTrail', panel.indexOf('function populateScenarioReviewAuditTrail') !== -1);
    assert('T-2  audit trail after closeout', panel.indexOf('populateScenarioReviewCloseout(unit)') < panel.indexOf('populateScenarioReviewAuditTrail(unit)'));
    assert('T-3  audit trail before quality gate', panel.indexOf('populateScenarioReviewAuditTrail(unit)') < panel.indexOf('populateEvidenceQualityGate(unit)'));
    [src(APP), src(OFF_APP)].forEach(function (htmlText) {
        assert('T-4  app shell has audit panel block', htmlText.indexOf('usp-review-audit-block') !== -1);
        assert('T-5  app shell loads audit script', htmlText.indexOf('scenario-evidence-review-audit-trail.js') !== -1);
        assert('T-6  app shell has audit CSS', htmlText.indexOf('.usp-audit-card') !== -1);
    });
    [
        'scenario-evidence-review-audit-trail.js',
        'scenario-evidence-fix-status.js',
        'scenario-evidence-manual-fix.js',
        'unit-status-panel.js',
        'cmo-commander-brief.js',
        'cmo-force-evidence-report.js'
    ].forEach(function (name) {
        assert('offline/' + name + ' matches main', src(path.join(SHELL, name)) === src(path.join(OFF, name)));
    });
    var sources = [
        'scenario-evidence-review-audit-trail.js',
        'scenario-evidence-fix-status.js',
        'scenario-evidence-manual-fix.js',
        'cmo-commander-brief.js',
        'cmo-force-evidence-report.js'
    ].map(function (name) { return src(path.join(SHELL, name)); }).join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    [
        ['no fetch(', /fetch\s*\(/],
        ['no XMLHttpRequest', /XMLHttpRequest/],
        ['no backend /api/ call', /\/api\//],
        ['no IndexedDB/database API', /indexedDB|openDatabase/i],
        ['no DOCX staging', /stage-doc|SLOT_FILE|docs\.red|docs\.blue|DOCX/i],
        ['no combat/action/doctrine mutation', /applyAction|commitAction|executeAction|autoFire|auto-fire|applyDoctrine|commitDoctrine|setDoctrine|\/doctrine/]
    ].forEach(function (pair) {
        assert(pair[0], !pair[1].test(sources));
    });
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
