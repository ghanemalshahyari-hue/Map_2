/* ============================================================================
 * test-scenario-evidence-release-audit-ux-batch-1.js - RMOOZ-SCENARIO-QA-BATCH-11
 * ----------------------------------------------------------------------------
 * Headless gate for QA-101..107: release-decision audit events + receipt history,
 * Force Report release history, Scenario Evidence drawer groups + quick-jump,
 * Unit Status selected-unit-only, main/offline parity, and boundaries.
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

console.log('\n=== RMOOZ-SCENARIO-QA-BATCH-11 Release Audit + Drawer Consolidation ===\n');

var RS = requireFresh('scenario-evidence-review-session.js');
var AU = requireFresh('scenario-evidence-review-audit-trail.js');
var FR = requireFresh('cmo-force-evidence-report.js');
var RA = requireFresh('scenario-evidence-release-audit.js');

var STATUS_LABEL = {
    ready_for_release: 'Ready for Release',
    ready_with_warnings: 'Ready with Warnings',
    not_ready: 'Not Ready',
    incomplete: 'Incomplete'
};
function gateObj(fp, status, blockers) {
    return {
        status: status,
        status_label_en: STATUS_LABEL[status],
        status_label_ar: 'x',
        releasable: status === 'ready_for_release' || status === 'ready_with_warnings',
        scenario_fingerprint: fp,
        blockers: blockers || [],
        warnings: []
    };
}

console.log('--- QA-101: release decisions create audit trail events ---');
(function () {
    var fp = 'scenario-rel-audit-a';
    RA.clear(fp); AU.clearTrail(fp);
    var receipt = RA.observeRelease(gateObj(fp, 'not_ready', [{ code: 'unresolved_issues', label: '2 issues still need review' }]), {});
    var events = AU.getTrail(fp).events;
    assert('T-1  release-audit module loads', !!RA && typeof RA.observeRelease === 'function');
    assert('T-2  not-ready decision logs release_not_ready', events.some(function (e) { return e.type === 'release_not_ready'; }));
    assert('T-3  observe returns a receipt', receipt && receipt.decision === 'not_ready' && receipt.blocker_count === 1);
    // same status, different blockers -> release_blockers_changed
    RA.observeRelease(gateObj(fp, 'not_ready', [{ code: 'unresolved_issues', label: 'x' }, { code: 'handoff_acceptance', label: 'y' }]), {});
    assert('T-4  blocker set change logs release_blockers_changed', AU.getTrail(fp).events.some(function (e) { return e.type === 'release_blockers_changed'; }));
    // transition to ready
    RA.observeRelease(gateObj(fp, 'ready_for_release', []), {});
    assert('T-5  ready transition logs release_ready', AU.getTrail(fp).events.some(function (e) { return e.type === 'release_ready'; }));
    // ready_with_warnings
    var fp2 = 'scenario-rel-audit-warn';
    RA.clear(fp2); AU.clearTrail(fp2);
    RA.observeRelease(gateObj(fp2, 'ready_with_warnings', []), {});
    assert('T-6  warnings decision logs release_ready_with_warnings', AU.getTrail(fp2).events.some(function (e) { return e.type === 'release_ready_with_warnings'; }));
    // repeated identical observe does not double-log
    var before = AU.getTrail(fp2).events.length;
    RA.observeRelease(gateObj(fp2, 'ready_with_warnings', []), {});
    assert('T-7  identical re-observe does not re-log', AU.getTrail(fp2).events.length === before);
})();

console.log('\n--- QA-101: certificate/JSON export creates audit event ---');
(function () {
    var fp = 'scenario-rel-export-a';
    RA.clear(fp); AU.clearTrail(fp);
    var gate = gateObj(fp, 'ready_for_release', []);
    RA.observeRelease(gate, {});
    RA.recordExport('certificate', gate, {});
    RA.recordExport('json', gate, {});
    var events = AU.getTrail(fp).events;
    assert('T-1  certificate export logs release_certificate_exported', events.some(function (e) { return e.type === 'release_certificate_exported'; }));
    assert('T-2  json export logs release_json_exported', events.some(function (e) { return e.type === 'release_json_exported'; }));
    assert('T-3  export marks the latest receipt as exported', RA.getLatest(fp).exported === true);
    // audit trail renders release event summaries readably
    var html = AU.renderAuditTrailHtml(AU.getTrail(fp), { limit: 20 });
    assert('T-4  audit trail renders release event summary', html.indexOf('Release') !== -1);
})();

console.log('\n--- QA-102: latest release receipt renders + history ---');
(function () {
    var fp = 'scenario-rel-latest-a';
    RA.clear(fp); AU.clearTrail(fp);
    var empty = RA.renderLatestHtml(fp);
    assert('T-1  empty state renders', empty.indexOf('Latest Release Decision') !== -1 && empty.indexOf('No release decision') !== -1);
    RA.observeRelease(gateObj(fp, 'not_ready', [{ code: 'unresolved_issues', label: '2 issues still need review' }]), {});
    var latest = RA.getLatest(fp);
    var html = RA.renderLatestHtml(latest);
    assert('T-2  latest receipt renders decision', html.indexOf('Latest Release Decision') !== -1 && html.indexOf('Not Ready') !== -1);
    assert('T-3  latest receipt renders reason', html.indexOf('2 issues still need review') !== -1);
    assert('T-4  latest receipt renders fingerprint', html.indexOf(fp) !== -1);
    assert('T-5  latest receipt has copy-history control', html.indexOf('data-release-audit-action="copy-history"') !== -1);
    assert('T-6  history accumulates receipts', RA.getHistory(fp).length >= 1);
    var summary = RA.historySummary(fp);
    assert('T-7  history summary is exportable text', summary.indexOf('Release Decision History') !== -1);
    assert('T-8  history JSON round-trips', JSON.parse(RA.toJson(fp)).history.length >= 1);
})();

console.log('\n--- QA-105: Force Report includes release decision history ---');
(function () {
    var fp = 'scenario-rel-report-a';
    RA.clear(fp); AU.clearTrail(fp);
    RA.observeRelease(gateObj(fp, 'not_ready', [{ code: 'unresolved_issues', label: '2 issues still need review' }]), {});
    var world = { id: 'rel-report', objective: { id: 'OBJ-X' }, units: [{ uid: 'B1', side: 'BLUE', role: 'ifv', lat: 24, lng: 46 }] };
    var report = FR.buildReport(world, {
        matrix: { counts: { Ready: 0, Blocked: 0, Unknown: 0 }, rows: [], top_blockers: [] },
        review_queue: { total_issues: 0, groups: [] },
        release_history: RA.exportState(fp),
        generated_at: '2026-07-02T05:00:00.000Z'
    });
    assert('T-1  report carries release_history', report.release_history && report.release_history.latest);
    assert('T-2  report latest decision is present', report.release_history.latest.decision === 'not_ready');
    var summary = FR.buildSummary(report);
    assert('T-3  summary includes Release Decision History', summary.indexOf('Release Decision History:') !== -1);
    assert('T-4  summary shows latest release decision', summary.indexOf('Not Ready') !== -1);
})();

console.log('\n--- QA-103: Scenario Evidence drawer has 4 groups ---');
(function () {
    var panel = src(path.join(SHELL, 'unit-status-panel.js'));
    assert('T-1  panel defines SCENARIO_EVIDENCE_GROUPS', panel.indexOf('SCENARIO_EVIDENCE_GROUPS') !== -1);
    ['overview', 'qa', 'handoff', 'force'].forEach(function (k) {
        assert('T-2  group defined: ' + k, panel.indexOf("key: '" + k + "'") !== -1);
    });
    ['Commander Overview', 'Scenario QA Review', 'Handoff Workflow', 'Force Evidence'].forEach(function (label) {
        assert('T-3  group label present: ' + label, panel.indexOf(label) !== -1);
    });
    assert('T-4  overview group holds release gate + quality', panel.indexOf("'usp-commander-brief-block', 'usp-release-gate-block', 'usp-evidence-quality-block'") !== -1);
    assert('T-5  handoff group holds package + acceptance', panel.indexOf("'usp-handoff-package-block', 'usp-handoff-acceptance-block'") !== -1);
    assert('T-6  re-parents blocks into group bodies', panel.indexOf("$('se-group-body-' + g.key)") !== -1);
    assert('T-7  overview + qa default open, handoff + force default collapsed',
        panel.indexOf("jump_en: 'Overview', open: true") !== -1 &&
        panel.indexOf("jump_en: 'QA Review', open: true") !== -1 &&
        panel.indexOf("jump_en: 'Handoff', open: false") !== -1 &&
        panel.indexOf("jump_en: 'Force Evidence', open: false") !== -1);
})();

console.log('\n--- QA-104: quick-jump bar ---');
(function () {
    var panel = src(path.join(SHELL, 'unit-status-panel.js'));
    assert('T-1  jump handler defined', panel.indexOf('function jumpToScenarioEvidenceGroup') !== -1);
    assert('T-2  toggle handler defined', panel.indexOf('function toggleScenarioEvidenceGroup') !== -1);
    assert('T-3  jump bar rendered with data-se-jump', panel.indexOf('data-se-jump="') !== -1 && panel.indexOf('se-jumpbar') !== -1);
    assert('T-4  jump opens the group', panel.indexOf('toggleScenarioEvidenceGroup(section, true)') !== -1);
    [src(APP), src(OFF_APP)].forEach(function (h) {
        assert('T-5  app shell has jumpbar CSS', h.indexOf('.se-jumpbar') !== -1);
        assert('T-6  app shell has group CSS', h.indexOf('.se-group-hdr') !== -1 && h.indexOf('.se-group[data-collapsed="true"] .se-group-body') !== -1);
        assert('T-7  app shell has release-history CSS', h.indexOf('.usp-release-history') !== -1);
        assert('T-8  app shell loads release-audit script', h.indexOf('scenario-evidence-release-audit.js') !== -1);
    });
})();

console.log('\n--- QA-103: Unit Status remains selected-unit only ---');
(function () {
    var panel = src(path.join(SHELL, 'unit-status-panel.js'));
    // Selected-unit sections stay in the unit panel — the drawer group block lists
    // must NOT contain any of them.
    var groupsRegion = panel.slice(panel.indexOf('SCENARIO_EVIDENCE_GROUPS = ['), panel.indexOf('function toggleScenarioEvidenceGroup'));
    assert('T-1  groups region isolated', groupsRegion.length > 0 && groupsRegion.indexOf('se-group-body') === -1);
    assert('T-2  groups exclude contact evidence', groupsRegion.indexOf('usp-contact-evidence-block') === -1);
    assert('T-3  groups exclude engagement evidence', groupsRegion.indexOf('usp-engagement-evidence-block') === -1);
    assert('T-4  groups exclude decision chain evidence', groupsRegion.indexOf('usp-decision-chain-evidence-block') === -1);
    assert('T-5  selected-unit evidence still populated in unit panel', panel.indexOf('function populateContactEvidence') !== -1 && panel.indexOf('populateContactEvidence(unit)') !== -1);
})();

console.log('\n--- QA-107: parity + boundaries ---');
(function () {
    [
        'scenario-evidence-release-audit.js',
        'scenario-evidence-release-gate.js',
        'scenario-evidence-review-audit-trail.js',
        'unit-status-panel.js',
        'cmo-force-evidence-report.js',
        'cmo-commander-brief.js'
    ].forEach(function (name) {
        assert('offline/' + name + ' matches main', src(path.join(SHELL, name)) === src(path.join(OFF, name)));
    });

    var runbook = src(path.join(DOCS, 'cmo-evidence-demo-runbook.md'));
    var handoff = src(path.join(DOCS, 'cmo-evidence-demo-handoff.md'));
    assert('T-1  runbook documents drawer groups', runbook.indexOf('Commander Overview') !== -1 && runbook.indexOf('Scenario QA Review') !== -1);
    assert('T-2  runbook documents release decision audit', runbook.indexOf('Release Decision') !== -1 || runbook.indexOf('release decision audit') !== -1);
    assert('T-3  handoff doc documents drawer groups', handoff.indexOf('Commander Overview') !== -1);

    var sources = [
        'scenario-evidence-release-audit.js',
        'scenario-evidence-release-gate.js',
        'scenario-evidence-review-audit-trail.js',
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
