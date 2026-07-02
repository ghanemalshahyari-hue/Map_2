/* ============================================================================
 * test-scenario-evidence-release-gate-batch-1.js - RMOOZ-SCENARIO-QA-BATCH-10
 * ----------------------------------------------------------------------------
 * Headless gate for QA-92..100 evidence release gate: deterministic release
 * verdict (closeout + acceptance + fingerprint), blockers, certificate export,
 * commander-brief + force-report integration, drawer wiring, docs, boundaries.
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
        id: id || 'release-scenario',
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

console.log('\n=== RMOOZ-SCENARIO-QA-BATCH-10 Evidence Release Gate ===\n');

var RS = requireFresh('scenario-evidence-review-session.js');
var AU = requireFresh('scenario-evidence-review-audit-trail.js');
var FS = requireFresh('scenario-evidence-fix-status.js');
var CO = requireFresh('scenario-evidence-review-closeout.js');
var FR = requireFresh('cmo-force-evidence-report.js');
var CB = requireFresh('cmo-commander-brief.js');
var HP = requireFresh('scenario-evidence-handoff-package.js');
var HA = requireFresh('scenario-evidence-handoff-acceptance.js');
var RG = requireFresh('scenario-evidence-release-gate.js');

// Bring a scenario to "ready" review state: both issues reviewed, package built,
// accepted for this scenario. Returns { world, fp }.
function readyScenario(id, acceptDecision) {
    var world = ws(id);
    var fp = RS.computeFingerprint(world);
    FS.setScenarioContext(world);
    AU.clearTrail(fp);
    HA.clearDecision(fp);
    RS.clearSession(fp);
    FS.setScenarioContext(world);
    FS.setStatus({ uid: 'BLUE-IFV-02', reason: 'no_contact_evidence' }, 'reviewed', 'Contact reviewed.', { timestamp: '2026-07-02T03:00:00.000Z' });
    FS.setStatus({ uid: 'RED-ARMOR-01', reason: 'missing_range' }, 'reviewed', 'Range reviewed.', { timestamp: '2026-07-02T03:01:00.000Z' });
    var pkg = HP.buildPackage(world, { review_queue: queue(), generated_at: '2026-07-02T03:02:00.000Z' });
    if (acceptDecision) {
        HA.decide(JSON.stringify(pkg), world, acceptDecision, { generated_at: '2026-07-02T03:03:00.000Z' });
    }
    return { world: world, fp: fp };
}

console.log('--- QA-92: module loads + deterministic statuses ---');
(function () {
    assert('T-1  release-gate module loads', !!RG && typeof RG.buildReleaseGate === 'function');
    assert('T-2  exposes the 4 release statuses', ['ready_for_release', 'ready_with_warnings', 'not_ready', 'incomplete'].every(function (k) { return !!RG.STATUS_META[k]; }));
    assert('T-3  statuses carry EN + AR labels', RG.STATUS_META.ready_for_release.label_en === 'Ready for Release' && !!RG.STATUS_META.ready_for_release.label_ar && !!RG.STATUS_META.not_ready.label_ar);
})();

console.log('\n--- QA-92: Ready for Release (all checks pass) ---');
(function () {
    var s = readyScenario('release-ready', 'accepted');
    var gate = RG.buildReleaseGate(s.world, { review_queue: queue(), generated_at: '2026-07-02T03:10:00.000Z' });
    assert('T-1  status is ready_for_release', gate.status === 'ready_for_release');
    assert('T-2  releasable is true', gate.releasable === true);
    assert('T-3  no blockers', gate.blockers.length === 0);
    assert('T-4  all 6 checks present', gate.checks.length === 6);
    assert('T-5  no failing checks', gate.checks.every(function (c) { return c.status !== 'fail'; }));
    assert('T-6  carries scenario fingerprint', gate.scenario_fingerprint === s.fp);
    assert('T-7  read-only', gate.read_only === true);
})();

console.log('\n--- QA-93/94: Not Ready with blockers ---');
(function () {
    // Unresolved issue + no acceptance decision.
    var world = ws('release-notready');
    var fp = RS.computeFingerprint(world);
    FS.setScenarioContext(world);
    AU.clearTrail(fp); HA.clearDecision(fp); RS.clearSession(fp);
    FS.setScenarioContext(world);
    FS.setStatus({ uid: 'BLUE-IFV-02', reason: 'no_contact_evidence' }, 'reviewed', 'Reviewed.', { timestamp: '2026-07-02T03:20:00.000Z' });
    // RED-ARMOR-01 left as needs_review -> unresolved blocker
    var gate = RG.buildReleaseGate(world, { review_queue: queue(), generated_at: '2026-07-02T03:21:00.000Z' });
    assert('T-1  status is not_ready', gate.status === 'not_ready');
    assert('T-2  releasable is false', gate.releasable === false);
    assert('T-3  unresolved-issue blocker present', gate.blockers.some(function (b) { return b.code === 'unresolved_issues'; }));
    assert('T-4  acceptance blocker present', gate.blockers.some(function (b) { return b.code === 'handoff_acceptance'; }));
    assert('T-5  unresolved check failed', gate.checks.filter(function (c) { return c.key === 'unresolved_issues'; })[0].status === 'fail');
    assert('T-6  acceptance check failed (no decision)', gate.checks.filter(function (c) { return c.key === 'handoff_acceptance'; })[0].status === 'fail');
})();

console.log('\n--- QA-92: Incomplete (no review work started) ---');
(function () {
    var world = ws('release-incomplete');
    var fp = RS.computeFingerprint(world);
    FS.setScenarioContext(world);
    AU.clearTrail(fp); HA.clearDecision(fp); RS.clearSession(fp);
    FS.setScenarioContext(world);
    var gate = RG.buildReleaseGate(world, { review_queue: queue(), generated_at: '2026-07-02T03:30:00.000Z' });
    assert('T-1  status is incomplete', gate.status === 'incomplete');
    assert('T-2  not releasable', gate.releasable === false);
    assert('T-3  incomplete blocker present', gate.blockers.some(function (b) { return b.code === 'review_incomplete' || b.code === 'closeout_status'; }));
})();

console.log('\n--- QA-92/94: Ready with Warnings (accepted with warnings) ---');
(function () {
    var s = readyScenario('release-warn', 'accepted_with_warnings');
    var gate = RG.buildReleaseGate(s.world, { review_queue: queue(), generated_at: '2026-07-02T03:40:00.000Z' });
    assert('T-1  status is ready_with_warnings', gate.status === 'ready_with_warnings');
    assert('T-2  releasable is true', gate.releasable === true);
    assert('T-3  no hard blockers', gate.blockers.length === 0);
    assert('T-4  acceptance warning surfaced', gate.warnings.some(function (w) { return w.code === 'handoff_acceptance'; }));
})();

console.log('\n--- QA-95: fingerprint / scenario-change validation ---');
(function () {
    // Isolate the gate's fingerprint logic with explicit closeout + acceptance
    // overrides (a passing closeout so only the fingerprint check can fail).
    var world = ws('release-fp');
    var fp = RS.computeFingerprint(world);
    var readyCloseout = {
        status: 'ready_for_handoff', status_label_en: 'Ready for Handoff',
        counts: { total: 2, needs_review: 0, reviewed: 2, deferred: 0, fixed_externally: 0 },
        deferred_without_note: [], fixed_externally_without_note: []
    };

    // (a) package accepted but fingerprint never matched.
    var mismatchGate = RG.buildReleaseGate(world, {
        closeout: readyCloseout,
        acceptance: { decision: 'accepted', decision_label_en: 'Accepted', fingerprint_match: false, current_scenario_fingerprint: fp },
        generated_at: '2026-07-02T03:52:00.000Z'
    });
    var fpCheck = mismatchGate.checks.filter(function (c) { return c.key === 'fingerprint_match'; })[0];
    assert('T-1  fingerprint check failed on mismatch', fpCheck.status === 'fail');
    assert('T-2  status not_ready on fingerprint mismatch', mismatchGate.status === 'not_ready');
    assert('T-3  fingerprint blocker present', mismatchGate.blockers.some(function (b) { return b.code === 'fingerprint_match'; }));

    // (b) package matched at acceptance, but the scenario changed since.
    var changedGate = RG.buildReleaseGate(world, {
        closeout: readyCloseout,
        acceptance: { decision: 'accepted', decision_label_en: 'Accepted', fingerprint_match: true, current_scenario_fingerprint: 'scenario-STALE' },
        generated_at: '2026-07-02T03:53:00.000Z'
    });
    var changedCheck = changedGate.checks.filter(function (c) { return c.key === 'fingerprint_match'; })[0];
    assert('T-4  scenario-change fails the fingerprint check', changedCheck.status === 'fail' && changedCheck.actual.indexOf('changed') !== -1);
    assert('T-5  status not_ready when scenario changed since acceptance', changedGate.status === 'not_ready');

    // (c) matched + unchanged -> passes.
    var okGate = RG.buildReleaseGate(world, {
        closeout: readyCloseout,
        acceptance: { decision: 'accepted', decision_label_en: 'Accepted', fingerprint_match: true, current_scenario_fingerprint: fp },
        generated_at: '2026-07-02T03:54:00.000Z'
    });
    assert('T-6  fingerprint passes when matched + unchanged', okGate.checks.filter(function (c) { return c.key === 'fingerprint_match'; })[0].status === 'pass' && okGate.status === 'ready_for_release');
})();

console.log('\n--- QA-94: deferred-without-justification blocks release ---');
(function () {
    var world = ws('release-deferred');
    var fp = RS.computeFingerprint(world);
    FS.setScenarioContext(world);
    AU.clearTrail(fp); HA.clearDecision(fp); RS.clearSession(fp);
    FS.setScenarioContext(world);
    FS.setStatus({ uid: 'BLUE-IFV-02', reason: 'no_contact_evidence' }, 'reviewed', 'Reviewed.', {});
    FS.setStatus({ uid: 'RED-ARMOR-01', reason: 'missing_range' }, 'deferred', '', {}); // no justification note
    var pkg = HP.buildPackage(world, { review_queue: queue(), generated_at: '2026-07-02T03:60:00.000Z' });
    HA.decide(JSON.stringify(pkg), world, 'accepted', { generated_at: '2026-07-02T04:01:00.000Z' });
    var gate = RG.buildReleaseGate(world, { review_queue: queue(), generated_at: '2026-07-02T04:02:00.000Z' });
    assert('T-1  deferred-justified check failed', gate.checks.filter(function (c) { return c.key === 'deferred_justified'; })[0].status === 'fail');
    assert('T-2  status not_ready', gate.status === 'not_ready');
})();

console.log('\n--- QA-96: release certificate export ---');
(function () {
    var s = readyScenario('release-cert', 'accepted');
    var gate = RG.buildReleaseGate(s.world, { review_queue: queue(), generated_at: '2026-07-02T04:10:00.000Z' });
    var cert = RG.buildCertificate(gate, { generated_at: '2026-07-02T04:11:00.000Z', operator_note: 'Cleared for demo.' });
    assert('T-1  certificate has type', cert.certificate_type === RG.CERTIFICATE_TYPE);
    assert('T-2  certificate carries release status', cert.release_status === 'ready_for_release' && cert.releasable === true);
    assert('T-3  certificate carries scenario fingerprint', cert.scenario_fingerprint === s.fp);
    assert('T-4  certificate lists all checks', cert.checks.length === 6);
    assert('T-5  certificate carries operator note', cert.operator_note === 'Cleared for demo.');
    assert('T-6  certificate is read-only', cert.read_only === true);
    var summary = RG.certificateSummary(cert);
    assert('T-7  summary text is exportable', summary.indexOf('Evidence Release Certificate') !== -1 && summary.indexOf('Ready for Release') !== -1);
    assert('T-8  summary lists required checks', summary.indexOf('Required checks:') !== -1 && summary.indexOf('[PASS]') !== -1);
    assert('T-9  certificate JSON round-trips', JSON.parse(RG.toJson(cert)).certificate_type === RG.CERTIFICATE_TYPE);
    assert('T-10 certificate download uses local blob only', RG.downloadJson(cert) === true);
})();

console.log('\n--- QA-97: commander brief release status ---');
(function () {
    var s = readyScenario('release-brief', 'accepted');
    var brief = CB.buildBrief(s.world, null, { review_queue: queue(), generated_at: '2026-07-02T04:20:00.000Z' });
    assert('T-1  brief carries release status', brief.scenario_qa.release_status === 'Ready for Release');
    assert('T-2  brief carries release detail', brief.scenario_qa.release_gate && brief.scenario_qa.release_gate.releasable === true);
    assert('T-3  brief renders Evidence Release row', CB.renderBriefHtml(brief).indexOf('Evidence Release') !== -1);
    // explicit override path
    var briefOverride = CB.buildBrief(s.world, null, { release_gate: { status: 'not_ready', status_label_en: 'Not Ready', status_label_ar: 'x', releasable: false, blockers: [{ code: 'x', label: 'y' }] } });
    assert('T-4  brief honors release_gate override', briefOverride.scenario_qa.release_status === 'Not Ready' && briefOverride.scenario_qa.release_gate.blocker_count === 1);
})();

console.log('\n--- QA-98: force report release section ---');
(function () {
    var s = readyScenario('release-report', 'accepted');
    var report = FR.buildReport(s.world, {
        matrix: { counts: { Ready: 1, Blocked: 0, Unknown: 0 }, rows: [], top_blockers: [] },
        review_queue: queue(),
        generated_at: '2026-07-02T04:30:00.000Z'
    });
    assert('T-1  report carries release_gate', report.release_gate && report.release_gate.status === 'ready_for_release');
    var summary = FR.buildSummary(report);
    assert('T-2  summary includes release section', summary.indexOf('Evidence Release Gate:') !== -1);
    assert('T-3  summary shows release status + releasable', summary.indexOf('Release status: Ready for Release') !== -1 && summary.indexOf('Releasable: yes') !== -1);
    assert('T-4  summary lists release checks', summary.indexOf('[PASS]') !== -1);
})();

console.log('\n--- QA-92: UI rendering + controls ---');
(function () {
    var s = readyScenario('release-ui', 'accepted');
    var gate = RG.buildReleaseGate(s.world, { review_queue: queue(), generated_at: '2026-07-02T04:40:00.000Z' });
    var html = RG.renderReleaseGateHtml(gate);
    assert('T-1  panel renders English title', html.indexOf('Evidence Release Gate') !== -1);
    assert('T-2  panel renders Arabic title', html.indexOf('&#1576;&#1608;&#1575;&#1576;&#1577;') !== -1);
    assert('T-3  panel renders the Required checklist', html.indexOf('Required') !== -1 && html.indexOf('Closeout status') !== -1);
    assert('T-4  panel renders certificate + json + download controls', ['data-release-action="certificate"', 'data-release-action="json"', 'data-release-action="download"'].every(function (n) { return html.indexOf(n) !== -1; }));
    var notReady = RG.buildReleaseGate(ws('release-ui-empty'), { review_queue: queue(), generated_at: '2026-07-02T04:41:00.000Z' });
    assert('T-5  panel shows Blockers section', RG.renderReleaseGateHtml(notReady).indexOf('Blockers') !== -1);

    var called = null;
    var certBtn = { getAttribute: function () { return 'certificate'; }, addEventListener: function (ev, fn) { this.fn = fn; } };
    var container = { querySelectorAll: function (sel) { return sel === '[data-release-action]' ? [certBtn] : []; } };
    RG.bindReleaseGateActions(container, gate, {});
    certBtn.fn();
    assert('T-6  certificate action is bound (no throw)', true);
})();

console.log('\n--- QA-99/100: static parity, drawer wiring, docs, boundaries ---');
(function () {
    var panel = src(path.join(SHELL, 'unit-status-panel.js'));
    assert('T-1  panel defines populateScenarioReleaseGate', panel.indexOf('function populateScenarioReleaseGate') !== -1);
    assert('T-2  release gate populates after handoff acceptance', panel.indexOf('populateScenarioHandoffAcceptance(unit)') < panel.indexOf('populateScenarioReleaseGate(unit)'));
    assert('T-3  release gate before quality gate', panel.indexOf('populateScenarioReleaseGate(unit)') < panel.indexOf('populateEvidenceQualityGate(unit)'));
    assert('T-4  drawer block list places release gate after acceptance', panel.indexOf("'usp-handoff-acceptance-block'") < panel.indexOf("'usp-release-gate-block'") && panel.indexOf("'usp-release-gate-block'") < panel.indexOf("'usp-evidence-quality-block'"));
    [src(APP), src(OFF_APP)].forEach(function (htmlText) {
        assert('T-5  app shell has release-gate block', htmlText.indexOf('usp-release-gate-block') !== -1);
        assert('T-6  app shell loads release-gate script', htmlText.indexOf('scenario-evidence-release-gate.js') !== -1);
        assert('T-7  app shell has release-gate CSS', htmlText.indexOf('.usp-release-card') !== -1);
    });
    [
        'scenario-evidence-release-gate.js',
        'scenario-evidence-handoff-acceptance.js',
        'unit-status-panel.js',
        'cmo-commander-brief.js',
        'cmo-force-evidence-report.js'
    ].forEach(function (name) {
        assert('offline/' + name + ' matches main', src(path.join(SHELL, name)) === src(path.join(OFF, name)));
    });

    var runbook = src(path.join(DOCS, 'cmo-evidence-demo-runbook.md'));
    assert('T-8  runbook documents the release gate', runbook.indexOf('Evidence Release Gate') !== -1);
    assert('T-9  runbook documents release certificate', runbook.indexOf('Release Certificate') !== -1 || runbook.indexOf('release certificate') !== -1);

    var sources = [
        'scenario-evidence-release-gate.js',
        'scenario-evidence-handoff-acceptance.js',
        'scenario-evidence-review-closeout.js',
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
