/* ============================================================================
 * test-scenario-evidence-handoff-package-batch-1.js - RMOOZ-SCENARIO-QA-BATCH-8
 * ----------------------------------------------------------------------------
 * Headless gate for QA-75..82 evidence handoff package + import validation.
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
global.navigator = { clipboard: { writeText: function () { return Promise.resolve(true); } } };
global.document = {
    createElement: function () { return { click: function () {}, set href(v) { this._href = v; }, set download(v) { this._download = v; } }; },
    body: { appendChild: function () {}, removeChild: function () {} }
};
global.Blob = function () {};
global.URL = { createObjectURL: function () { return 'blob:rmooz'; }, revokeObjectURL: function () {} };

function ws(id) {
    return {
        id: id || 'handoff-scenario',
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
function forceReport(fp) {
    return {
        version: 'test-force-report',
        generated_at: '2026-07-02T00:05:00.000Z',
        scenario_fingerprint: fp,
        counts: { Ready: 1, Blocked: 1, Unknown: 0 },
        readiness_rows: [{ uid: 'BLUE-IFV-02', final_status: 'Blocked', reason_code: 'no_contact_evidence' }],
        force_events: [{ type: 'unit_blocked', uid: 'BLUE-IFV-02', reason_code: 'no_contact_evidence' }],
        read_only: true
    };
}

console.log('\n=== RMOOZ-SCENARIO-QA-BATCH-8 Handoff Package Gate ===\n');

var RS = requireFresh('scenario-evidence-review-session.js');
var AU = requireFresh('scenario-evidence-review-audit-trail.js');
var FS = requireFresh('scenario-evidence-fix-status.js');
var CO = requireFresh('scenario-evidence-review-closeout.js');
var FR = requireFresh('cmo-force-evidence-report.js');
var CB = requireFresh('cmo-commander-brief.js');
var HP = requireFresh('scenario-evidence-handoff-package.js');

console.log('--- QA-75/78/79/80/81: package builder and manifest ---');
(function () {
    var world = ws('handoff-a');
    var fp = RS.computeFingerprint(world);
    FS.setScenarioContext(world);
    AU.clearTrail(fp);
    FS.setStatus({ uid: 'BLUE-IFV-02', reason: 'no_contact_evidence' }, 'reviewed', 'Contact evidence reviewed', { timestamp: '2026-07-02T00:00:00.000Z' });
    FS.setStatus({ uid: 'RED-ARMOR-01', reason: 'missing_range' }, 'deferred', 'Range source pending external owner.', { timestamp: '2026-07-02T00:01:00.000Z' });
    var closeout = CO.buildCloseout(queue(), { world_state: world, generated_at: '2026-07-02T00:02:00.000Z' });
    var trail = AU.exportTrail(fp, { generated_at: '2026-07-02T00:03:00.000Z' });
    var pkg = HP.buildPackage(world, {
        review_queue: queue(),
        closeout: closeout,
        audit_trail: trail,
        force_report: forceReport(fp),
        generated_at: '2026-07-02T00:04:00.000Z'
    });
    assert('T-1  handoff module loads', !!HP && typeof HP.buildPackage === 'function');
    assert('T-2  package has manifest type/version', pkg.manifest.package_type === HP.PACKAGE_TYPE && !!pkg.manifest.version);
    assert('T-3  package carries scenario fingerprint', pkg.scenario_fingerprint === fp);
    assert('T-4  package includes review session', pkg.review_session && pkg.review_session.scenario_fingerprint === fp);
    assert('T-5  package includes manual statuses', pkg.manual_statuses.length === 2);
    assert('T-6  package includes closeout summary', pkg.closeout && pkg.closeout.status === 'ready_with_exceptions');
    assert('T-7  package includes audit trail', pkg.audit_trail && pkg.audit_trail.events.length >= 2);
    assert('T-8  package includes force report', pkg.force_report && pkg.force_report.readiness_rows.length === 1);
    assert('T-9  manifest counts package contents', pkg.manifest.record_counts.manual_statuses === 2 && pkg.manifest.record_counts.audit_events >= 2);
    assert('T-10 package is read-only', pkg.read_only === true && pkg.manifest.read_only === true);
})();

console.log('\n--- QA-76/77: import preview and fingerprint validation ---');
(function () {
    var world = ws('handoff-b');
    var other = ws('handoff-other');
    var fp = RS.computeFingerprint(world);
    FS.setScenarioContext(world);
    var pkg = HP.buildPackage(world, {
        review_queue: queue(),
        force_report: forceReport(fp),
        generated_at: '2026-07-02T00:05:00.000Z'
    });
    var match = HP.previewImport(JSON.stringify(pkg), world);
    var mismatch = HP.previewImport(JSON.stringify(pkg), other);
    assert('T-1  matching preview is valid', match.valid === true && match.fingerprint_match === true);
    assert('T-2  mismatch preview flags fingerprint mismatch', mismatch.status === 'fingerprint_mismatch' && mismatch.fingerprint_match === false);
    assert('T-3  preview exposes imported and current fingerprints', !!mismatch.package_fingerprint && !!mismatch.current_scenario_fingerprint);
    assert('T-4  mismatch preview asks operator to review', mismatch.action.indexOf('Review before applying') !== -1);
})();

console.log('\n--- QA-80: import restores review-session UI state only ---');
(function () {
    var sourceWorld = ws('handoff-import-source');
    var targetWorld = ws('handoff-import-target');
    var sourceFp = RS.computeFingerprint(sourceWorld);
    FS.setScenarioContext(sourceWorld);
    FS.setStatus({ uid: 'BLUE-IFV-02', reason: 'no_contact_evidence' }, 'fixed_externally', 'Verified by source owner.', { timestamp: '2026-07-02T00:06:00.000Z' });
    var pkg = HP.buildPackage(sourceWorld, {
        review_queue: queue(),
        force_report: forceReport(sourceFp),
        generated_at: '2026-07-02T00:07:00.000Z'
    });
    var before = JSON.stringify(targetWorld);
    var result = HP.importPackage(pkg, targetWorld, { generated_at: '2026-07-02T00:08:00.000Z' });
    var after = JSON.stringify(targetWorld);
    var targetFp = RS.computeFingerprint(targetWorld);
    var importedSession = RS.loadSession(targetFp);
    assert('T-1  import reports success', result.imported === true);
    assert('T-2  import marks stale/mismatch when fingerprints differ', importedSession.stale === true && importedSession.original_scenario_fingerprint === sourceFp);
    assert('T-3  import restored review records under current fingerprint', importedSession.records.some(function (r) { return r.status === 'fixed_externally'; }));
    assert('T-4  import did not mutate world-state object', before === after);
})();

console.log('\n--- QA-76: UI rendering and controls ---');
(function () {
    var world = ws('handoff-ui');
    var pkg = HP.buildPackage(world, {
        review_queue: queue(),
        force_report: forceReport(RS.computeFingerprint(world)),
        generated_at: '2026-07-02T00:09:00.000Z'
    });
    var preview = HP.previewImport(pkg, ws('handoff-ui-other'));
    var html = HP.renderPackageHtml(pkg, { preview: preview });
    assert('T-1  panel renders English title', html.indexOf('Evidence Handoff Package') !== -1);
    assert('T-2  panel renders Arabic title', html.indexOf('&#1581;&#1586;&#1605;&#1577;') !== -1);
    assert('T-3  panel renders copy/download/import/preview controls', ['data-handoff-action="copy"', 'data-handoff-action="download"', 'data-handoff-action="preview"', 'data-handoff-action="import"'].every(function (needle) { return html.indexOf(needle) !== -1; }));
    assert('T-4  panel renders import preview mismatch', html.indexOf('Fingerprint mismatch') !== -1);

    var previewCalled = false;
    var importCalled = false;
    var previewBtn = { getAttribute: function () { return 'preview'; }, addEventListener: function (ev, fn) { this.fn = fn; } };
    var importBtn = { getAttribute: function () { return 'import'; }, addEventListener: function (ev, fn) { this.fn = fn; } };
    var textBox = { value: JSON.stringify(pkg) };
    var container = {
        querySelectorAll: function (sel) { return sel === '[data-handoff-action]' ? [previewBtn, importBtn] : []; },
        querySelector: function (sel) { return sel === '[data-handoff-import]' ? textBox : null; }
    };
    HP.bindPackageActions(container, pkg, {
        world_state: world,
        onPreview: function () { previewCalled = true; },
        onImport: function () { importCalled = true; }
    });
    previewBtn.fn();
    importBtn.fn();
    assert('T-5  preview callback is dispatched', previewCalled === true);
    assert('T-6  import callback is dispatched', importCalled === true);
})();

console.log('\n--- Force report, commander brief, static parity, and boundaries ---');
(function () {
    var world = ws('handoff-report');
    var fp = RS.computeFingerprint(world);
    var pkg = HP.buildPackage(world, {
        review_queue: queue(),
        force_report: forceReport(fp),
        generated_at: '2026-07-02T00:10:00.000Z'
    });
    var report = FR.buildReport(world, {
        matrix: { counts: { Ready: 0, Blocked: 0, Unknown: 0 }, rows: [], top_blockers: [] },
        review_queue: queue(),
        handoff_package: pkg,
        generated_at: '2026-07-02T00:11:00.000Z'
    });
    assert('T-1  force report accepts handoff package manifest', report.handoff_package_manifest && report.handoff_package_manifest.package_type === HP.PACKAGE_TYPE);
    assert('T-2  force report summary includes handoff section', FR.buildSummary(report).indexOf('Evidence Handoff Package') !== -1);
    var brief = CB.buildBrief(world, null, { handoff_package: pkg });
    assert('T-3  commander brief carries handoff package status', brief.scenario_qa.handoff_package_status === pkg.status_label_en);
    assert('T-4  commander brief renders Handoff Package row', CB.renderBriefHtml(brief).indexOf('Handoff Package') !== -1);

    var panel = src(path.join(SHELL, 'unit-status-panel.js'));
    assert('T-5  panel defines populateScenarioHandoffPackage', panel.indexOf('function populateScenarioHandoffPackage') !== -1);
    assert('T-6  handoff package after audit trail', panel.indexOf('populateScenarioReviewAuditTrail(unit)') < panel.indexOf('populateScenarioHandoffPackage(unit)'));
    assert('T-7  handoff package before quality gate', panel.indexOf('populateScenarioHandoffPackage(unit)') < panel.indexOf('populateEvidenceQualityGate(unit)'));
    [src(APP), src(OFF_APP)].forEach(function (htmlText) {
        assert('T-8  app shell has handoff panel block', htmlText.indexOf('usp-handoff-package-block') !== -1);
        assert('T-9  app shell loads handoff script', htmlText.indexOf('scenario-evidence-handoff-package.js') !== -1);
        assert('T-10 app shell has handoff CSS', htmlText.indexOf('.usp-handoff-card') !== -1);
    });
    [
        'scenario-evidence-handoff-package.js',
        'unit-status-panel.js',
        'cmo-force-evidence-report.js',
        'cmo-commander-brief.js'
    ].forEach(function (name) {
        assert('offline/' + name + ' matches main', src(path.join(SHELL, name)) === src(path.join(OFF, name)));
    });
    var sources = [
        'scenario-evidence-handoff-package.js',
        'scenario-evidence-review-session.js',
        'scenario-evidence-review-audit-trail.js',
        'cmo-force-evidence-report.js',
        'cmo-commander-brief.js'
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
