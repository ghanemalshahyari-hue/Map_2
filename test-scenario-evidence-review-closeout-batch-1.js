/* ============================================================================
 * test-scenario-evidence-review-closeout-batch-1.js - RMOOZ-SCENARIO-QA-BATCH-6
 * ----------------------------------------------------------------------------
 * Headless gate for QA-59..66 review closeout + handoff summary.
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

function queue() {
    return {
        total_issues: 4,
        groups: [{
            key: 'contact',
            issues: [
                { issue_id: 'U1|no_contact_evidence', uid: 'U1', label: 'U1', reason: 'no_contact_evidence', group: 'contact' },
                { issue_id: 'U2|missing_range', uid: 'U2', label: 'U2', reason: 'missing_range', group: 'range' },
                { issue_id: 'U3|missing_weapon', uid: 'U3', label: 'U3', reason: 'missing_weapon', group: 'weapon' },
                { issue_id: 'force|objective_contacts_derived', uid: null, label: 'Objective X', reason: 'objective_contacts_derived', group: 'objective_x_health' }
            ]
        }]
    };
}
function ws(id) {
    return {
        id: id || 'closeout-scenario',
        objective: { id: 'OBJ-X' },
        units: [
            { uid: 'U1', side: 'BLUE', role: 'ifv', lat: 24, lng: 46, weapon: 'Gun' },
            { uid: 'U2', side: 'BLUE', role: 'ifv', lat: 24.1, lng: 46.1, weapon: 'Gun' },
            { uid: 'U3', side: 'RED', role: 'armor', lat: 24.2, lng: 46.2 }
        ]
    };
}

console.log('\n=== RMOOZ-SCENARIO-QA-BATCH-6 Closeout Gate ===\n');

var RS = requireFresh('scenario-evidence-review-session.js');
var FS = requireFresh('scenario-evidence-fix-status.js');
var CO = requireFresh('scenario-evidence-review-closeout.js');
var CB = requireFresh('cmo-commander-brief.js');
var FR = requireFresh('cmo-force-evidence-report.js');

console.log('--- QA-59/60: review closeout status and unresolved summary ---');
(function () {
    FS.setScenarioContext(ws('closeout-a'));
    var emptyCloseout = CO.buildCloseout(queue(), { generated_at: '2026-07-02T00:00:00.000Z' });
    assert('T-1  no persisted review session is incomplete', emptyCloseout.status === 'incomplete');
    assert('T-2  unresolved issue summary includes needs_review defaults', emptyCloseout.counts.needs_review === 4);

    FS.setStatus({ uid: 'U1', reason: 'no_contact_evidence' }, 'reviewed', 'Sensor source checked', { timestamp: '2026-07-02T00:01:00.000Z' });
    var needs = CO.buildCloseout(queue(), { generated_at: '2026-07-02T00:02:00.000Z' });
    assert('T-3  any remaining needs_review blocks handoff', needs.status === 'needs_review');
    assert('T-4  blocker lists remaining needs_review issues', needs.blockers.some(function (b) { return b.code === 'needs_review_remaining'; }));
})();

console.log('\n--- QA-61/62: deferred justification and fixed-externally verification ---');
(function () {
    FS.setStatus({ uid: 'U2', reason: 'missing_range' }, 'deferred', '', { timestamp: '2026-07-02T00:03:00.000Z' });
    FS.setStatus({ uid: 'U3', reason: 'missing_weapon' }, 'fixed_externally', '', { timestamp: '2026-07-02T00:04:00.000Z' });
    FS.setStatus({ uid: null, label: 'Objective X', reason: 'objective_contacts_derived' }, 'reviewed', 'Objective check reviewed', { timestamp: '2026-07-02T00:05:00.000Z' });
    var blocked = CO.buildCloseout(queue(), { generated_at: '2026-07-02T00:06:00.000Z' });
    assert('T-1  deferred issue without note needs justification', blocked.blockers.some(function (b) { return b.code === 'deferred_missing_justification'; }));
    assert('T-2  fixed externally without note needs verification', blocked.blockers.some(function (b) { return b.code === 'fixed_externally_missing_verification'; }));
    var html = CO.renderCloseoutHtml(blocked);
    assert('T-3  UI renders Deferred Issue Justification Prompt', html.indexOf('Deferred Issue Justification Prompt') !== -1);
    assert('T-4  UI renders Fixed-Externally Verification Checklist', html.indexOf('Fixed-Externally Verification Checklist') !== -1);

    FS.setStatus({ uid: 'U2', reason: 'missing_range' }, 'deferred', 'Accepted for handoff: range will be resolved by map owner.', { timestamp: '2026-07-02T00:07:00.000Z' });
    FS.setStatus({ uid: 'U3', reason: 'missing_weapon' }, 'fixed_externally', 'Verified against source sheet by operator.', { timestamp: '2026-07-02T00:08:00.000Z' });
    var exceptions = CO.buildCloseout(queue(), { generated_at: '2026-07-02T00:09:00.000Z' });
    assert('T-5  only justified deferred issues => ready with exceptions', exceptions.status === 'ready_with_exceptions');

    FS.setStatus({ uid: 'U2', reason: 'missing_range' }, 'reviewed', 'Range checked', { timestamp: '2026-07-02T00:10:00.000Z' });
    var ready = CO.buildCloseout(queue(), { generated_at: '2026-07-02T00:11:00.000Z' });
    assert('T-6  no blockers and no deferred => ready for handoff', ready.status === 'ready_for_handoff');
})();

console.log('\n--- QA-63/64/65: handoff summary, force report, commander brief ---');
(function () {
    var closeout = CO.buildCloseout(queue(), { generated_at: '2026-07-02T00:12:00.000Z' });
    var summary = CO.buildSummary(closeout);
    assert('T-1  closeout summary is commander-readable', summary.indexOf('Evidence Review Closeout') !== -1 && summary.indexOf('Status: Ready for Handoff') !== -1);
    assert('T-2  closeout JSON is valid and read-only', JSON.parse(CO.toJson(closeout)).read_only === true);
    assert('T-3  render exposes closeout export controls', CO.renderCloseoutHtml(closeout).indexOf('data-closeout-action="download"') !== -1);

    var brief = CB.buildBrief(ws('closeout-a'), null, { review_queue: queue(), closeout: closeout });
    assert('T-4  commander brief carries closeout status', brief.scenario_qa.closeout.status === 'ready_for_handoff');
    assert('T-5  commander brief renders Review Closeout row', CB.renderBriefHtml(brief).indexOf('Review Closeout') !== -1);

    var report = FR.buildReport(ws('closeout-a'), {
        matrix: { counts: { Ready: 0, Blocked: 0, Unknown: 0 }, rows: [], top_blockers: [] },
        review_queue: queue(),
        review_closeout: closeout,
        generated_at: '2026-07-02T00:13:00.000Z'
    });
    assert('T-6  force report includes review_closeout section', report.review_closeout && report.review_closeout.status === 'ready_for_handoff');
    assert('T-7  force report summary includes closeout section', FR.buildSummary(report).indexOf('Evidence Review Closeout') !== -1);
})();

console.log('\n--- Static wiring, panel order, parity, and boundaries ---');
(function () {
    var panel = src(path.join(SHELL, 'unit-status-panel.js'));
    assert('T-1  panel defines populateScenarioReviewCloseout', panel.indexOf('function populateScenarioReviewCloseout') !== -1);
    assert('T-2  closeout is after manual fix', panel.indexOf('populateScenarioManualFix(unit)') < panel.indexOf('populateScenarioReviewCloseout(unit)'));
    assert('T-3  closeout is before quality gate', panel.indexOf('populateScenarioReviewCloseout(unit)') < panel.indexOf('populateEvidenceQualityGate(unit)'));
    [src(APP), src(OFF_APP)].forEach(function (html) {
        assert('T-4  app shell has closeout panel block', html.indexOf('usp-review-closeout-block') !== -1);
        assert('T-5  app shell loads closeout script', html.indexOf('scenario-evidence-review-closeout.js') !== -1);
        assert('T-6  app shell has closeout CSS', html.indexOf('.usp-closeout-card') !== -1);
    });
    [
        'scenario-evidence-review-closeout.js',
        'unit-status-panel.js',
        'cmo-commander-brief.js',
        'cmo-force-evidence-report.js'
    ].forEach(function (name) {
        assert('offline/' + name + ' matches main', src(path.join(SHELL, name)) === src(path.join(OFF, name)));
    });
    var sources = [
        'scenario-evidence-review-closeout.js',
        'cmo-commander-brief.js',
        'cmo-force-evidence-report.js'
    ].map(function (name) { return src(path.join(SHELL, name)); }).join('\n')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    [
        ['no fetch(', /fetch\s*\(/],
        ['no XMLHttpRequest', /XMLHttpRequest/],
        ['no backend /api/ call', /\/api\//],
        ['no database API', /indexedDB|openDatabase/i],
        ['no DOCX staging', /stage-doc|SLOT_FILE|docs\.red|docs\.blue|DOCX/i],
        ['no combat/action/doctrine mutation', /applyAction|commitAction|executeAction|autoFire|auto-fire|applyDoctrine|commitDoctrine|setDoctrine|\/doctrine/]
    ].forEach(function (pair) {
        assert(pair[0], !pair[1].test(sources));
    });
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
