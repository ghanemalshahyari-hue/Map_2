/* ============================================================================
 * test-scenario-evidence-handoff-acceptance-batch-1.js - RMOOZ-SCENARIO-QA-BATCH-9
 * ----------------------------------------------------------------------------
 * Headless gate for QA-83..91 handoff package diff + acceptance decision +
 * receipt export + audit/brief/report integration + drawer docs update.
 * ========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var SHELL = path.join(ROOT, 'UI_MOdified', 'client', 'shell');
var OFF = path.join(ROOT, 'UI_MOdified', 'Offline_Deployment', 'offline_app', 'client', 'shell');
var APP = path.join(ROOT, 'UI_MOdified', 'client', 'app.html');
var OFF_APP = path.join(ROOT, 'UI_MOdified', 'Offline_Deployment', 'offline_app', 'client', 'app.html');
var DOCS = path.join(ROOT, 'UI_MOdified', 'docs');

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
    value: { clipboard: { writeText: function () { return Promise.resolve(true); } } },
    configurable: true
});
global.document = {
    createElement: function () { return { click: function () {}, set href(v) { this._href = v; }, set download(v) { this._download = v; } }; },
    body: { appendChild: function () {}, removeChild: function () {} }
};
global.Blob = function () {};
global.URL = { createObjectURL: function () { return 'blob:rmooz'; }, revokeObjectURL: function () {} };

function ws(id) {
    return {
        id: id || 'acceptance-scenario',
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

console.log('\n=== RMOOZ-SCENARIO-QA-BATCH-9 Handoff Acceptance Gate ===\n');

var RS = requireFresh('scenario-evidence-review-session.js');
var AU = requireFresh('scenario-evidence-review-audit-trail.js');
var FS = requireFresh('scenario-evidence-fix-status.js');
var CO = requireFresh('scenario-evidence-review-closeout.js');
var FR = requireFresh('cmo-force-evidence-report.js');
var CB = requireFresh('cmo-commander-brief.js');
var HP = requireFresh('scenario-evidence-handoff-package.js');
var HA = requireFresh('scenario-evidence-handoff-acceptance.js');

console.log('--- QA-83: package diff against the local review session ---');
(function () {
    var world = ws('accept-diff-a');
    var fp = RS.computeFingerprint(world);
    FS.setScenarioContext(world);
    AU.clearTrail(fp);
    HA.clearDecision(fp);
    FS.setStatus({ uid: 'BLUE-IFV-02', reason: 'no_contact_evidence' }, 'reviewed', 'Contact reviewed by source.', { timestamp: '2026-07-02T01:00:00.000Z' });
    FS.setStatus({ uid: 'RED-ARMOR-01', reason: 'missing_range' }, 'deferred', 'Range pending.', { timestamp: '2026-07-02T01:01:00.000Z' });
    var closeout = CO.buildCloseout(queue(), { world_state: world, generated_at: '2026-07-02T01:02:00.000Z' });
    var pkg = HP.buildPackage(world, {
        review_queue: queue(),
        closeout: closeout,
        generated_at: '2026-07-02T01:03:00.000Z'
    });
    // Receiving operator diverges locally: overwrite one status, add a local-only one.
    FS.setStatus({ uid: 'BLUE-IFV-02', reason: 'no_contact_evidence' }, 'fixed_externally', 'Fixed on receiving side.', { timestamp: '2026-07-02T01:04:00.000Z' });
    FS.setStatus({ uid: 'BLUE-IFV-02', reason: 'missing_range' }, 'reviewed', 'Local-only record.', { timestamp: '2026-07-02T01:05:00.000Z' });
    var diff = HA.buildPackageDiff(JSON.stringify(pkg), world, {
        local_closeout: closeout,
        generated_at: '2026-07-02T01:06:00.000Z'
    });
    assert('T-1  acceptance module loads', !!HA && typeof HA.buildPackageDiff === 'function');
    assert('T-2  diff is valid for a real package', diff.valid === true);
    assert('T-3  diff confirms same scenario', diff.same_scenario === true && diff.fingerprint_match === true);
    assert('T-4  diff exposes both fingerprints', diff.package_fingerprint === fp && diff.current_scenario_fingerprint === fp);
    assert('T-5  diff counts changed status', diff.counts.changed === 1 && diff.changed_statuses[0].uid === 'BLUE-IFV-02');
    assert('T-6  diff shows local vs package status', diff.changed_statuses[0].local_status === 'fixed_externally' && diff.changed_statuses[0].package_status === 'reviewed');
    assert('T-7  diff counts unchanged status', diff.counts.unchanged === 1);
    assert('T-8  diff counts local-only status', diff.counts.local_only === 1);
    assert('T-9  diff warns about overwrites', diff.warnings.some(function (w) { return w.indexOf('overwrite') !== -1; }));
    assert('T-10 diff compares closeout statuses', diff.closeout.package_status === closeout.status && diff.closeout.changed === false);
    assert('T-11 diff is read-only', diff.read_only === true);
})();

console.log('\n--- QA-83/84: fingerprint mismatch and recommendations ---');
(function () {
    var world = ws('accept-rec-a');
    var other = ws('accept-rec-other');
    var fp = RS.computeFingerprint(world);
    FS.setScenarioContext(world);
    AU.clearTrail(fp);
    HA.clearDecision(fp);
    FS.setStatus({ uid: 'BLUE-IFV-02', reason: 'no_contact_evidence' }, 'reviewed', 'Reviewed.', { timestamp: '2026-07-02T01:10:00.000Z' });
    var closeout = CO.buildCloseout(queue(), { world_state: world, generated_at: '2026-07-02T01:11:00.000Z' });
    var pkg = HP.buildPackage(world, { review_queue: queue(), closeout: closeout, generated_at: '2026-07-02T01:12:00.000Z' });

    var clean = HA.buildPackageDiff(JSON.stringify(pkg), world, { local_closeout: closeout, generated_at: '2026-07-02T01:13:00.000Z' });
    var mismatch = HA.buildPackageDiff(JSON.stringify(pkg), other, { generated_at: '2026-07-02T01:14:00.000Z' });
    var invalid = HA.buildPackageDiff('{not valid json', world, { generated_at: '2026-07-02T01:15:00.000Z' });

    assert('T-1  clean diff carries no warnings', clean.warnings.length === 0 && clean.counts.changed === 0 && clean.counts.added === 0);
    assert('T-2  clean diff recommends acceptance', HA.recommendDecision(clean).decision === 'accepted');
    assert('T-3  mismatch diff flags different scenario', mismatch.same_scenario === false && mismatch.fingerprint_match === false);
    assert('T-4  mismatch diff recommends rejection', HA.recommendDecision(mismatch).decision === 'rejected');
    assert('T-5  invalid payload is invalid diff', invalid.valid === false);
    assert('T-6  invalid payload recommends rejection', HA.recommendDecision(invalid).decision === 'rejected');
    FS.setStatus({ uid: 'BLUE-IFV-02', reason: 'no_contact_evidence' }, 'deferred', 'Local divergence.', { timestamp: '2026-07-02T01:16:00.000Z' });
    var warned = HA.buildPackageDiff(JSON.stringify(pkg), world, { local_closeout: closeout, generated_at: '2026-07-02T01:17:00.000Z' });
    assert('T-7  warning diff recommends accept-with-warnings', HA.recommendDecision(warned).decision === 'accepted_with_warnings');
})();

console.log('\n--- QA-84/85: accept / reject / forced rejection decisions ---');
(function () {
    var world = ws('accept-decide-a');
    var fp = RS.computeFingerprint(world);
    FS.setScenarioContext(world);
    AU.clearTrail(fp);
    HA.clearDecision(fp);
    FS.setStatus({ uid: 'BLUE-IFV-02', reason: 'no_contact_evidence' }, 'fixed_externally', 'Verified by source.', { timestamp: '2026-07-02T01:20:00.000Z' });
    var pkg = HP.buildPackage(world, { review_queue: queue(), generated_at: '2026-07-02T01:21:00.000Z' });
    RS.clearSession(fp);
    FS.setScenarioContext(fp);
    var before = JSON.stringify(world);
    var accepted = HA.decide(JSON.stringify(pkg), world, 'accepted', { generated_at: '2026-07-02T01:22:00.000Z' });
    var after = JSON.stringify(world);
    var session = RS.loadSession(fp);
    assert('T-1  accept decision applies', accepted.applied === true && accepted.decision === 'accepted');
    assert('T-2  accept imports review-session UI state', accepted.imported === true && session.records.some(function (r) { return r.status === 'fixed_externally'; }));
    assert('T-3  accept persists the decision', HA.getDecision(fp).decision === 'accepted');
    assert('T-4  accept did not mutate world-state object', before === after);
    assert('T-5  decision statuses carry EN + AR labels', accepted.decision_label_en === 'Accepted' && !!accepted.decision_label_ar);

    var worldR = ws('accept-decide-reject');
    var fpR = RS.computeFingerprint(worldR);
    FS.setScenarioContext(worldR);
    AU.clearTrail(fpR);
    HA.clearDecision(fpR);
    RS.clearSession(fpR);
    var rejected = HA.decide(JSON.stringify(pkg), worldR, 'rejected', { generated_at: '2026-07-02T01:23:00.000Z' });
    assert('T-6  reject decision applies', rejected.applied === true && rejected.decision === 'rejected');
    assert('T-7  reject does not import review state', rejected.imported === false && RS.loadSession(fpR).records.length === 0);
    assert('T-8  reject persists the decision', HA.getDecision(fpR).decision === 'rejected');

    var worldW = ws('accept-decide-warn');
    var fpW = RS.computeFingerprint(worldW);
    FS.setScenarioContext(worldW);
    HA.clearDecision(fpW);
    var withWarnings = HA.decide(JSON.stringify(pkg), worldW, 'accepted_with_warnings', { generated_at: '2026-07-02T01:24:00.000Z' });
    assert('T-9  accept-with-warnings applies and imports', withWarnings.applied === true && withWarnings.decision === 'accepted_with_warnings' && withWarnings.imported === true);

    var worldF = ws('accept-decide-forced');
    HA.clearDecision(RS.computeFingerprint(worldF));
    var forced = HA.decide('{broken json', worldF, 'accepted', { generated_at: '2026-07-02T01:25:00.000Z' });
    assert('T-10 invalid package forces rejection', forced.applied === true && forced.decision === 'rejected' && forced.forced_rejection === true && forced.imported === false);
    var unknown = HA.decide(JSON.stringify(pkg), world, 'maybe-later', { generated_at: '2026-07-02T01:26:00.000Z' });
    assert('T-11 unknown decision code is refused', unknown.applied === false && !!unknown.error);

    // Regression: the live panel passes a world-state PROVIDER that can return
    // null (no scenario loaded). Storage and lookup must agree on the same
    // hashed empty-scenario fingerprint — not the literal 'unknown'.
    var nullProvider = function () { return null; };
    var emptyFp = RS.computeFingerprint(null);
    HA.clearDecision(emptyFp);
    var providerDecision = HA.decide(JSON.stringify(pkg), nullProvider, 'rejected', { generated_at: '2026-07-02T01:27:00.000Z' });
    var providerAcceptance = HA.buildAcceptance(nullProvider, { generated_at: '2026-07-02T01:28:00.000Z' });
    assert('T-12 provider-null decision stores under hashed fingerprint', providerDecision.record.current_scenario_fingerprint === emptyFp);
    assert('T-13 provider-null lookup sees the stored decision', providerAcceptance.decision === 'rejected' && providerAcceptance.current_scenario_fingerprint === emptyFp);
    HA.clearDecision(emptyFp);
})();

console.log('\n--- QA-86: acceptance receipt export ---');
(function () {
    var world = ws('accept-receipt-a');
    var fp = RS.computeFingerprint(world);
    FS.setScenarioContext(world);
    AU.clearTrail(fp);
    HA.clearDecision(fp);
    FS.setStatus({ uid: 'BLUE-IFV-02', reason: 'no_contact_evidence' }, 'reviewed', 'Reviewed.', { timestamp: '2026-07-02T01:30:00.000Z' });
    var pkg = HP.buildPackage(world, { review_queue: queue(), generated_at: '2026-07-02T01:31:00.000Z' });
    var result = HA.decide(JSON.stringify(pkg), world, 'accepted', { generated_at: '2026-07-02T01:32:00.000Z', operator_note: 'Receiving shift lead.' });
    var receipt = result.receipt;
    assert('T-1  decision returns a receipt', !!receipt && receipt.receipt_type === HA.RECEIPT_TYPE);
    assert('T-2  receipt records the decision', receipt.decision === 'accepted' && receipt.decision_label_en === 'Accepted');
    assert('T-3  receipt carries both fingerprints', receipt.package_fingerprint === fp && receipt.current_scenario_fingerprint === fp && receipt.fingerprint_match === true);
    assert('T-4  receipt carries diff counts', receipt.counts && receipt.counts.package_records >= 1);
    assert('T-5  receipt carries operator note', receipt.operator_note === 'Receiving shift lead.');
    assert('T-6  receipt is read-only', receipt.read_only === true);
    var summary = HA.receiptSummary(receipt);
    assert('T-7  receipt summary is exportable text', summary.indexOf('Evidence Handoff Acceptance Receipt') !== -1 && summary.indexOf('Accepted') !== -1);
    assert('T-8  receipt JSON round-trips', JSON.parse(HA.toJson(receipt)).receipt_type === HA.RECEIPT_TYPE);
    assert('T-9  receipt download uses local blob only', HA.downloadReceipt(receipt) === true);
    var rebuilt = HA.buildReceipt(HA.getDecision(fp), { generated_at: '2026-07-02T01:33:00.000Z' });
    assert('T-10 receipt rebuilds from the stored decision', rebuilt.decision === 'accepted' && rebuilt.package_fingerprint === fp);
})();

console.log('\n--- QA-87: audit trail integration ---');
(function () {
    var world = ws('accept-audit-a');
    var fp = RS.computeFingerprint(world);
    FS.setScenarioContext(world);
    AU.clearTrail(fp);
    HA.clearDecision(fp);
    var pkg = HP.buildPackage(world, { review_queue: queue(), generated_at: '2026-07-02T01:40:00.000Z' });
    HA.decide(JSON.stringify(pkg), world, 'accepted', { generated_at: '2026-07-02T01:41:00.000Z' });
    var events = AU.getTrail(fp).events;
    assert('T-1  acceptance decision is audited', events.some(function (e) { return e.type === 'handoff_acceptance_accepted'; }));
    assert('T-2  accepted package import is audited', events.some(function (e) { return e.type === 'handoff_package_imported'; }));
    var acceptEvent = events.filter(function (e) { return e.type === 'handoff_acceptance_accepted'; })[0];
    assert('T-3  audit event carries package fingerprint', acceptEvent.package_fingerprint === fp && acceptEvent.fingerprint_match === true);
    assert('T-4  audit event carries readable summary', String(acceptEvent.summary).indexOf('accepted') !== -1);

    var worldR = ws('accept-audit-reject');
    var fpR = RS.computeFingerprint(worldR);
    FS.setScenarioContext(worldR);
    AU.clearTrail(fpR);
    HA.clearDecision(fpR);
    HA.decide(JSON.stringify(pkg), worldR, 'rejected', { generated_at: '2026-07-02T01:42:00.000Z' });
    var eventsR = AU.getTrail(fpR).events;
    assert('T-5  rejection is audited', eventsR.some(function (e) { return e.type === 'handoff_acceptance_rejected'; }));
    assert('T-6  rejection does not audit an import', !eventsR.some(function (e) { return e.type === 'handoff_package_imported'; }));
})();

console.log('\n--- QA-88/89: commander brief and force report integration ---');
(function () {
    var world = ws('accept-report-a');
    var fp = RS.computeFingerprint(world);
    FS.setScenarioContext(world);
    AU.clearTrail(fp);
    HA.clearDecision(fp);
    var pkg = HP.buildPackage(world, { review_queue: queue(), generated_at: '2026-07-02T01:50:00.000Z' });
    var result = HA.decide(JSON.stringify(pkg), world, 'accepted_with_warnings', { generated_at: '2026-07-02T01:51:00.000Z' });

    var brief = CB.buildBrief(world, null, { handoff_acceptance: result.record });
    assert('T-1  commander brief carries acceptance status', brief.scenario_qa.handoff_acceptance_status === 'Accepted with Warnings');
    assert('T-2  commander brief carries acceptance detail', brief.scenario_qa.handoff_acceptance.decision === 'accepted_with_warnings' && brief.scenario_qa.handoff_acceptance.imported === true);
    assert('T-3  commander brief renders Handoff Acceptance row', CB.renderBriefHtml(brief).indexOf('Handoff Acceptance') !== -1);
    var briefAuto = CB.buildBrief(world, null, {});
    assert('T-4  commander brief auto-reads the stored decision', briefAuto.scenario_qa.handoff_acceptance_status === 'Accepted with Warnings');

    var report = FR.buildReport(world, {
        matrix: { counts: { Ready: 0, Blocked: 0, Unknown: 0 }, rows: [], top_blockers: [] },
        review_queue: queue(),
        handoff_acceptance: result.record,
        generated_at: '2026-07-02T01:52:00.000Z'
    });
    assert('T-5  force report carries acceptance section', report.handoff_acceptance && report.handoff_acceptance.decision === 'accepted_with_warnings');
    var summary = FR.buildSummary(report);
    assert('T-6  force report summary includes acceptance', summary.indexOf('Evidence Handoff Acceptance:') !== -1 && summary.indexOf('Accepted with Warnings') !== -1);
    assert('T-7  force report summary includes match + import lines', summary.indexOf('Fingerprint match: yes') !== -1 && summary.indexOf('Review state imported: yes') !== -1);
})();

console.log('\n--- QA-83..85: UI rendering and controls ---');
(function () {
    var world = ws('accept-ui-a');
    var fp = RS.computeFingerprint(world);
    FS.setScenarioContext(world);
    HA.clearDecision(fp);
    var pkg = HP.buildPackage(world, { review_queue: queue(), generated_at: '2026-07-02T02:00:00.000Z' });
    var pending = HA.buildAcceptance(world, { generated_at: '2026-07-02T02:01:00.000Z' });
    var pendingHtml = HA.renderAcceptanceHtml(pending);
    assert('T-1  panel renders English title', pendingHtml.indexOf('Handoff Acceptance') !== -1);
    assert('T-2  panel renders Arabic title', pendingHtml.indexOf('&#1602;&#1576;&#1608;&#1604;') !== -1);
    assert('T-3  panel starts as pending decision', pendingHtml.indexOf('Pending Decision') !== -1);
    assert('T-4  panel renders diff + decision + receipt controls', ['data-acceptance-action="diff"', 'data-acceptance-action="accept"', 'data-acceptance-action="accept-warnings"', 'data-acceptance-action="reject"', 'data-acceptance-action="copy-receipt"', 'data-acceptance-action="download-receipt"'].every(function (needle) { return pendingHtml.indexOf(needle) !== -1; }));

    var diff = HA.buildPackageDiff(pkg, ws('accept-ui-other'), { generated_at: '2026-07-02T02:02:00.000Z' });
    var diffHtml = HA.renderAcceptanceHtml(pending, { diff: diff });
    assert('T-5  panel renders diff details', diffHtml.indexOf('Package diff') !== -1 && diffHtml.indexOf('Same scenario') !== -1);

    var diffCalled = null, decideCalled = null;
    function fakeBtn(action) { return { getAttribute: function () { return action; }, addEventListener: function (ev, fn) { this.fn = fn; } }; }
    var diffBtn = fakeBtn('diff');
    var acceptBtn = fakeBtn('accept');
    var textBox = { value: JSON.stringify(pkg) };
    var container = {
        querySelectorAll: function (sel) { return sel === '[data-acceptance-action]' ? [diffBtn, acceptBtn] : []; },
        querySelector: function (sel) { return sel === '[data-acceptance-input]' ? textBox : null; }
    };
    HA.bindAcceptanceActions(container, pending, {
        world_state: world,
        generated_at: '2026-07-02T02:03:00.000Z',
        onDiff: function (d) { diffCalled = d; },
        onDecide: function (r) { decideCalled = r; }
    });
    diffBtn.fn();
    assert('T-6  diff callback is dispatched', !!diffCalled && diffCalled.fingerprint_match === true);
    acceptBtn.fn();
    assert('T-7  decide callback is dispatched', !!decideCalled && decideCalled.decision === 'accepted');
    var decidedHtml = HA.renderAcceptanceHtml(HA.buildAcceptance(world, { generated_at: '2026-07-02T02:04:00.000Z' }));
    assert('T-8  panel shows the stored decision', decidedHtml.indexOf('Accepted') !== -1 && decidedHtml.indexOf('Decided: ') !== -1);
})();

console.log('\n--- QA-90/91: static parity, drawer wiring, docs, and boundaries ---');
(function () {
    var panel = src(path.join(SHELL, 'unit-status-panel.js'));
    assert('T-1  panel defines populateScenarioHandoffAcceptance', panel.indexOf('function populateScenarioHandoffAcceptance') !== -1);
    assert('T-2  acceptance populates after handoff package', panel.indexOf('populateScenarioHandoffPackage(unit)') < panel.indexOf('populateScenarioHandoffAcceptance(unit)'));
    assert('T-3  acceptance populates before quality gate', panel.indexOf('populateScenarioHandoffAcceptance(unit)') < panel.indexOf('populateEvidenceQualityGate(unit)'));
    assert('T-4  drawer block list places acceptance after package', panel.indexOf("'usp-handoff-package-block'") < panel.indexOf("'usp-handoff-acceptance-block'") && panel.indexOf("'usp-handoff-acceptance-block'") < panel.indexOf("'usp-evidence-quality-block'"));
    [src(APP), src(OFF_APP)].forEach(function (htmlText) {
        assert('T-5  app shell has acceptance panel block', htmlText.indexOf('usp-handoff-acceptance-block') !== -1);
        assert('T-6  app shell loads acceptance script', htmlText.indexOf('scenario-evidence-handoff-acceptance.js') !== -1);
        assert('T-7  app shell has acceptance CSS', htmlText.indexOf('.usp-acceptance-card') !== -1);
    });
    [
        'scenario-evidence-handoff-acceptance.js',
        'scenario-evidence-handoff-package.js',
        'unit-status-panel.js',
        'cmo-force-evidence-report.js',
        'cmo-commander-brief.js'
    ].forEach(function (name) {
        assert('offline/' + name + ' matches main', src(path.join(SHELL, name)) === src(path.join(OFF, name)));
    });

    // QA-91: runbook/handoff docs must describe the Scenario Evidence drawer.
    var handoffDoc = src(path.join(DOCS, 'cmo-evidence-demo-handoff.md'));
    var runbookDoc = src(path.join(DOCS, 'cmo-evidence-demo-runbook.md'));
    [['handoff doc', handoffDoc], ['runbook doc', runbookDoc]].forEach(function (pair) {
        assert('T-8  ' + pair[0] + ' names the Scenario Evidence drawer', pair[1].indexOf('Scenario Evidence drawer') !== -1);
        assert('T-9  ' + pair[0] + ' scopes Unit Status to the selected unit', pair[1].indexOf('selected-unit') !== -1);
        assert('T-10 ' + pair[0] + ' covers Handoff Acceptance', pair[1].indexOf('Handoff Acceptance') !== -1);
    });

    var sources = [
        'scenario-evidence-handoff-acceptance.js',
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
