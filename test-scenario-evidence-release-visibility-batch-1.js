/* ============================================================================
 * test-scenario-evidence-release-visibility-batch-1.js - RMOOZ-SCENARIO-QA-BATCH-12
 * ----------------------------------------------------------------------------
 * Headless gate for QA-108..115: top-level release status HUD chip + open hook,
 * printable release certificate, certificate export refinement, Force Report
 * certificate metadata, drawer wiring, docs, parity, boundaries.
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
var printCalled = false;
global.document = {
    createElement: function () {
        return {
            _html: '', click: function () {}, appendChild: function () {},
            set href(v) { this._href = v; }, set download(v) { this._download = v; },
            set innerHTML(v) { this._html = v; }, get innerHTML() { return this._html; },
            setAttribute: function () {}, removeAttribute: function () {}
        };
    },
    getElementById: function () { return null; },
    body: { appendChild: function () {}, removeChild: function () {}, setAttribute: function () {}, removeAttribute: function () {} }
};
Object.defineProperty(global, 'print', { value: function () { printCalled = true; }, configurable: true, writable: true });
global.addEventListener = function () {};
global.Blob = function () {};
global.URL = { createObjectURL: function () { return 'blob:rmooz'; }, revokeObjectURL: function () {} };

console.log('\n=== RMOOZ-SCENARIO-QA-BATCH-12 Release Visibility + Certificate ===\n');

var RG = requireFresh('scenario-evidence-release-gate.js');
var RH = requireFresh('scenario-evidence-release-hud.js');
var FR = requireFresh('cmo-force-evidence-report.js');

function readyGate(fp) {
    return RG.buildReleaseGate(fp || 'scenario-vis', {
        closeout: {
            status: 'ready_for_handoff', status_label_en: 'Ready for Handoff',
            counts: { total: 3, needs_review: 0, reviewed: 1, deferred: 1, fixed_externally: 1 },
            deferred_without_note: [], fixed_externally_without_note: []
        },
        acceptance: { decision: 'accepted', decision_label_en: 'Accepted', fingerprint_match: true, current_scenario_fingerprint: fp || 'scenario-vis' },
        generated_at: '2026-07-02T06:00:00.000Z'
    });
}

console.log('--- QA-108/109: release status HUD chip ---');
(function () {
    assert('T-1  HUD module loads', !!RH && typeof RH.buildChip === 'function' && typeof RH.update === 'function');
    var STAT = [['ready_for_release', 'Ready for Release'], ['ready_with_warnings', 'Ready with Warnings'], ['not_ready', 'Not Ready'], ['incomplete', 'Incomplete']];
    STAT.forEach(function (pair) {
        var chip = RH.buildChip({ status: pair[0], status_label_en: pair[1], scenario_fingerprint: 'fp' });
        assert('T-2  chip built for ' + pair[0], chip.status === pair[0] && chip.label_en === pair[1] && !!chip.label_ar && !!chip.cls);
    });
    var html = RH.renderChipHtml(RH.buildChip({ status: 'not_ready', status_label_en: 'Not Ready', scenario_fingerprint: 'fp' }));
    assert('T-3  chip renders EN key + status', html.indexOf('Evidence Release') !== -1 && html.indexOf('Not Ready') !== -1);
    assert('T-4  chip renders Arabic', html.indexOf('بوابة الأدلة') !== -1 && html.indexOf('غير جاهز') !== -1);
    assert('T-5  chip is a click target', html.indexOf('data-release-hud-open') !== -1 && html.indexOf('release-hud-chip--not-ready') !== -1);
})();

console.log('\n--- QA-110: chip click opens the release gate (host callback) ---');
(function () {
    var opened = null;
    var btn = { addEventListener: function (ev, fn) { this._fn = fn; } };
    var mount = {
        innerHTML: '', _hidden: true,
        setAttribute: function (k) { if (k === 'hidden') this._hidden = true; },
        removeAttribute: function (k) { if (k === 'hidden') this._hidden = false; },
        querySelector: function (sel) { return sel === '[data-release-hud-open]' ? btn : null; }
    };
    var chip = RH.update(mount, readyGate('scenario-open'), { onOpen: function (c) { opened = c; } });
    assert('T-1  update renders into the mount', mount.innerHTML.indexOf('release-hud-chip') !== -1);
    assert('T-2  update reveals the mount', mount._hidden === false);
    assert('T-3  update returns the chip', chip && chip.status === 'ready_for_release');
    btn._fn({ preventDefault: function () {} });
    assert('T-4  clicking the chip fires onOpen', !!opened && opened.status === 'ready_for_release');
    // panel exposes the open bridge + wiring
    var panel = src(path.join(SHELL, 'unit-status-panel.js'));
    assert('T-5  panel defines openReleaseGate', panel.indexOf('function openReleaseGate') !== -1);
    assert('T-6  openReleaseGate exposed on API', panel.indexOf('openReleaseGate: openReleaseGate') !== -1);
    assert('T-7  openReleaseGate opens Commander Overview + scrolls release gate', panel.indexOf("jumpToScenarioEvidenceGroup('overview')") !== -1 && panel.indexOf("$('usp-release-gate-block')") !== -1);
    assert('T-8  panel updates the HUD from the release gate', panel.indexOf('function updateReleaseHud') !== -1 && panel.indexOf("$('release-hud-mount')") !== -1 && panel.indexOf('updateReleaseHud(gate)') !== -1);
})();

console.log('\n--- QA-111: printable release certificate ---');
(function () {
    var cert = RG.buildCertificate(readyGate('scenario-print'), { latest_timestamp: '2026-07-02T06:05:00.000Z', operator_note: 'Cleared for demo.' });
    assert('T-1  certificate carries counts', cert.counts && cert.counts.deferred === 1 && cert.counts.fixed_externally === 1);
    assert('T-2  certificate carries latest decision timestamp', cert.latest_decision_at === '2026-07-02T06:05:00.000Z');
    var html = RG.buildPrintableCertificateHtml(cert);
    assert('T-3  printable has English title', html.indexOf('Evidence Release Certificate') !== -1);
    assert('T-4  printable has Arabic title', html.indexOf('&#1588;&#1607;&#1575;&#1583;&#1577;') !== -1);
    ['Release status', 'Scenario fingerprint', 'Closeout status', 'Handoff acceptance', 'Fingerprint validation', 'Deferred issues', 'Fixed-externally verified', 'Latest release decision'].forEach(function (label) {
        assert('T-5  printable includes: ' + label, html.indexOf(label) !== -1);
    });
    assert('T-6  printable lists unresolved blockers section', html.indexOf('Unresolved Blockers') !== -1);
    assert('T-7  printable includes operator note', html.indexOf('Cleared for demo.') !== -1);
    assert('T-8  printable has read-only disclaimer', html.toLowerCase().indexOf('read-only release certificate') !== -1);
    assert('T-9  printable reuses cmo-print classes', html.indexOf('cmo-print-report--certificate') !== -1);
    printCalled = false;
    var ok = RG.printCertificate(cert);
    assert('T-10 printCertificate invokes print', ok === true && printCalled === true);
})();

console.log('\n--- QA-112: certificate export refinement ---');
(function () {
    var cert = RG.buildCertificate(readyGate('scenario-sum'), { latest_timestamp: '2026-07-02T06:10:00.000Z' });
    var summary = RG.certificateSummary(cert);
    assert('T-1  summary shows fingerprint validation', summary.indexOf('Fingerprint validation: Match') !== -1);
    assert('T-2  summary shows deferred count', summary.indexOf('Deferred issues: 1') !== -1);
    assert('T-3  summary shows fixed-externally count', summary.indexOf('Fixed-externally verified: 1') !== -1);
    assert('T-4  summary shows latest release decision timestamp', summary.indexOf('Latest release decision: 2026-07-02T06:10:00.000Z') !== -1);
    assert('T-5  certificate JSON still round-trips', JSON.parse(RG.toJson(cert)).certificate_type === RG.CERTIFICATE_TYPE);
})();

console.log('\n--- QA-113: Force Report links certificate metadata ---');
(function () {
    var world = { id: 'vis-report', objective: { id: 'OBJ-X' }, units: [{ uid: 'B1', side: 'BLUE', role: 'ifv', lat: 24, lng: 46 }] };
    var gate = readyGate('scenario-frcert');
    var report = FR.buildReport(world, {
        matrix: { counts: { Ready: 1, Blocked: 0, Unknown: 0 }, rows: [], top_blockers: [] },
        review_queue: { total_issues: 0, groups: [] },
        release_gate: gate,
        release_certificate: RG.buildCertificate(gate, { generated_at: '2026-07-02T06:15:00.000Z' }),
        generated_at: '2026-07-02T06:15:00.000Z'
    });
    assert('T-1  report carries release_certificate metadata', report.release_certificate && report.release_certificate.certificate_type === RG.CERTIFICATE_TYPE);
    assert('T-2  metadata carries release status + fingerprint', report.release_certificate.release_status === 'ready_for_release' && report.release_certificate.scenario_fingerprint === 'scenario-frcert');
    var summary = FR.buildSummary(report);
    assert('T-3  summary includes Release Certificate section', summary.indexOf('Release Certificate:') !== -1);
    assert('T-4  summary shows certificate type', summary.indexOf(RG.CERTIFICATE_TYPE) !== -1);
})();

console.log('\n--- QA-114/115: drawer wiring, docs, parity, boundaries ---');
(function () {
    [src(APP), src(OFF_APP)].forEach(function (h) {
        assert('T-1  app shell has release-hud mount', h.indexOf('id="release-hud-mount"') !== -1);
        assert('T-2  app shell loads release-hud script', h.indexOf('scenario-evidence-release-hud.js') !== -1);
        assert('T-3  app shell has release-hud chip CSS', h.indexOf('.release-hud-chip') !== -1);
        assert('T-4  app shell has print-certificate button CSS', h.indexOf('.usp-release-btn--print') !== -1);
    });
    var panel = src(path.join(SHELL, 'unit-status-panel.js'));
    assert('T-5  release gate renders Print Release Certificate control', src(path.join(SHELL, 'scenario-evidence-release-gate.js')).indexOf('data-release-action="print"') !== -1);
    assert('T-6  release gate build wires print', src(path.join(SHELL, 'scenario-evidence-release-gate.js')).indexOf('printCertificate') !== -1);

    [
        'scenario-evidence-release-hud.js',
        'scenario-evidence-release-gate.js',
        'scenario-evidence-release-audit.js',
        'unit-status-panel.js',
        'cmo-force-evidence-report.js'
    ].forEach(function (name) {
        assert('offline/' + name + ' matches main', src(path.join(SHELL, name)) === src(path.join(OFF, name)));
    });

    var runbook = src(path.join(DOCS, 'cmo-evidence-demo-runbook.md'));
    var handoff = src(path.join(DOCS, 'cmo-evidence-demo-handoff.md'));
    assert('T-7  runbook documents the release HUD chip', runbook.indexOf('Release Status') !== -1 || runbook.indexOf('release status chip') !== -1 || runbook.indexOf('Release HUD') !== -1);
    assert('T-8  runbook documents the printable certificate', runbook.indexOf('Print Release Certificate') !== -1 || runbook.indexOf('printable release certificate') !== -1);
    assert('T-9  handoff doc mentions release visibility', handoff.indexOf('Release') !== -1);

    var sources = [
        'scenario-evidence-release-hud.js',
        'scenario-evidence-release-gate.js',
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
