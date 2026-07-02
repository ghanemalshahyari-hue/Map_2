/* ============================================================================
 * test-scenario-evidence-review-session-batch-1.js - RMOOZ-SCENARIO-QA-BATCH-5
 * ----------------------------------------------------------------------------
 * Headless gate for QA-51..58 review-session persistence + handoff pack.
 * Verifies browser-local persistence, export/import/reset, stale fingerprint
 * warning, report/brief integration, app/offline parity, and read-only bounds.
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
function modPath(name) { return path.join(SHELL, name); }
function requireFresh(name) {
    var p = modPath(name);
    delete require.cache[require.resolve(p)];
    return require(p);
}

var storage = {};
global.localStorage = {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null; },
    setItem: function (key, value) { storage[key] = String(value); },
    removeItem: function (key) { delete storage[key]; }
};

function freshWs(label) {
    return {
        id: label || 'scenario-a',
        objective: { id: 'OBJ-X', name: 'Objective X' },
        red_units: [{ uid: 'RED-ARMOR-01', side: 'RED', role: 'armor', lat: 24.1, lng: 46.2, weapon: 'Cannon', doctrine: 'std' }],
        units: [
            { uid: 'BLUE-IFV-02', side: 'BLUE', role: 'ifv', lat: 24.2, lng: 46.3, label: 'BLUE-IFV-02', weapon: '30mm' },
            { uid: 'BLUE-IFV-04', side: 'BLUE', role: 'ifv', lat: 24.3, lng: 46.4, label: 'BLUE-IFV-04' },
            { uid: 'RED-ARMOR-01', side: 'RED', role: 'armor', lat: 24.1, lng: 46.2, label: 'RED-ARMOR-01', weapon: 'Cannon', doctrine: 'std' }
        ]
    };
}

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

console.log('\n=== RMOOZ-SCENARIO-QA-BATCH-5 Review Session Gate ===\n');

var RS = requireFresh('scenario-evidence-review-session.js');
var FS = requireFresh('scenario-evidence-fix-status.js');
var MF = requireFresh('scenario-evidence-manual-fix.js');
var RQ = requireFresh('scenario-evidence-review-queue.js');
var RP = requireFresh('scenario-evidence-repair-planner.js');
var CB = requireFresh('cmo-commander-brief.js');
var FR = requireFresh('cmo-force-evidence-report.js');

console.log('--- QA-51: local review-session persistence ---');
(function () {
    var ws = freshWs('scenario-a');
    var fp = RS.computeFingerprint(ws);
    FS.setScenarioContext(ws);
    FS.setStatus({ uid: 'BLUE-IFV-02', reason: 'no_contact_evidence' }, 'reviewed', 'Checked by operator', { timestamp: '2026-07-02T00:00:00.000Z' });
    assert('T-1  review-session module loads', !!RS && typeof RS.loadSession === 'function');
    assert('T-2  scenario fingerprint is deterministic', fp === RS.computeFingerprint(ws));
    assert('T-3  status write creates browser-local session', !!storage[RS.storageKey(fp)]);

    delete global.RmoozScenarioEvidenceFixStatus;
    FS = requireFresh('scenario-evidence-fix-status.js');
    FS.setScenarioContext(ws);
    assert('T-4  status survives module reload/context restore', FS.getStatus({ uid: 'BLUE-IFV-02', reason: 'no_contact_evidence' }).status === 'reviewed');
})();

console.log('\n--- QA-52/53: export and import review-session JSON ---');
(function () {
    var ws = freshWs('scenario-a');
    var exported = RS.exportSession(ws, { generated_at: '2026-07-02T00:01:00.000Z' });
    assert('T-1  export includes records', Array.isArray(exported.records) && exported.records.length >= 1);
    assert('T-2  export includes counts', exported.counts && exported.counts.reviewed >= 1);
    assert('T-3  export is deterministic JSON enough for tests', JSON.stringify(exported).indexOf('"scenario_fingerprint"') !== -1);

    var otherWs = freshWs('scenario-b');
    var imported = RS.importSession(JSON.stringify(exported), { world_state: otherWs, generated_at: '2026-07-02T00:02:00.000Z' });
    assert('T-4  import stores under current scenario fingerprint', imported.scenario_fingerprint === RS.computeFingerprint(otherWs));
    assert('T-5  import marks stale if fingerprint changed', imported.stale === true);
    FS.setScenarioContext(otherWs);
    assert('T-6  imported records load into fix-status', FS.getStatus({ uid: 'BLUE-IFV-02', reason: 'no_contact_evidence' }).status === 'reviewed');
})();

console.log('\n--- QA-54/57: reset and stale-session UI warning ---');
(function () {
    var session = FS.getSessionMeta();
    var workspace = MF.buildWorkspace({ uid: 'BLUE-IFV-02', reason: 'no_contact_evidence' }, { session: session });
    var html = MF.renderWorkspaceHtml(workspace);
    assert('T-1  manual workspace renders review session controls', html.indexOf('data-manual-session-action="import"') !== -1 && html.indexOf('Copy Session JSON') !== -1);
    assert('T-2  stale imported session renders warning', html.indexOf('usp-manual-stale') !== -1);
    FS.reset();
    assert('T-3  reset clears current session records', FS.all().length === 0);
    assert('T-4  reset clears persisted current session', RS.loadSession(session.scenario_fingerprint).records.length === 0);
})();

console.log('\n--- QA-55/56: force report and commander brief metadata ---');
(function () {
    var ws = freshWs('scenario-a');
    FS.setScenarioContext(ws);
    FS.setStatus({ uid: 'BLUE-IFV-02', reason: 'no_contact_evidence' }, 'deferred', 'Awaiting source owner', { timestamp: '2026-07-02T00:03:00.000Z' });
    var queue = RQ.buildReviewQueue(ws, { matrix: fakeMatrix });
    var plan = RP.buildRepairPlan(ws, { matrix: fakeMatrix, review_queue: queue });
    assert('T-1  repair plan sees persisted deferred status', plan.manual_review && plan.manual_review.counts.deferred >= 1);
    var brief = CB.buildBrief(ws, null, { matrix: fakeMatrix, review_queue: queue });
    assert('T-2  commander brief shows persisted review progress', brief.scenario_qa.manual_review.counts.deferred >= 1);
    var report = FR.buildReport(ws, { matrix: fakeMatrix, review_queue: queue, generated_at: '2026-07-02T00:04:00.000Z' });
    assert('T-3  force report includes review_session metadata', report.review_session && report.review_session.scenario_fingerprint);
    assert('T-4  force report summary includes review session line', FR.buildSummary(report).indexOf('Session: scenario-') !== -1);
})();

console.log('\n--- Static wiring, parity, and boundaries ---');
(function () {
    [src(APP), src(OFF_APP)].forEach(function (html) {
        assert('T-1  app shell loads review-session before fix-status',
            html.indexOf('scenario-evidence-review-session.js') !== -1 &&
            html.indexOf('scenario-evidence-review-session.js') < html.indexOf('scenario-evidence-fix-status.js'));
        assert('T-2  app shell renders session controls CSS', html.indexOf('.usp-manual-session') !== -1);
    });
    [
        'scenario-evidence-review-session.js',
        'scenario-evidence-fix-status.js',
        'scenario-evidence-manual-fix.js',
        'unit-status-panel.js',
        'cmo-force-evidence-report.js'
    ].forEach(function (name) {
        assert('offline/' + name + ' matches main', src(path.join(SHELL, name)) === src(path.join(OFF, name)));
    });
    var sources = [
        'scenario-evidence-review-session.js',
        'scenario-evidence-fix-status.js',
        'scenario-evidence-manual-fix.js'
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
