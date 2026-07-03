/* ============================================================================
 * test-cmo-wargame-evidence-package-live-wiring-main-batch-1.js
 * CMO-WARGAME-EVIDENCE-PACKAGE-LIVE-WIRING-1 - Main Live Wiring Gate
 * ----------------------------------------------------------------------------
 * Main-app-only gate. It verifies the CMO war-game evidence package is loaded
 * after the AAR module, rendered in the existing CMO panel, reachable through
 * Scenario Actions, copyable through browser-local clipboard helpers, and still
 * read-only/display/export-only.
 * ========================================================================== */
'use strict';

var childProcess = require('child_process');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = __dirname;
var APP = path.join(ROOT, 'UI_MOdified', 'client', 'app.html');
var UNIT = path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'unit-status-panel.js');
var SHELL = path.join(ROOT, 'UI_MOdified', 'client', 'shell');
var PKG_FILE = path.join(SHELL, 'cmo-wargame-evidence-package.js');

var passed = 0, failed = 0;
function assert(label, cond) {
    if (cond) { console.log('  PASS  ' + label); passed++; }
    else { console.error('  FAIL  ' + label); failed++; }
}
function src(file) { return fs.readFileSync(file, 'utf8'); }
function arr(v) { return Array.isArray(v) ? v : []; }
function stripComments(text) {
    return String(text || '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
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
function labels(commands) {
    return arr(commands).map(function (command) { return command.label; });
}
function makeNode(id, group) {
    return {
        id: id || '',
        className: '',
        innerHTML: '',
        textContent: '',
        focused: false,
        scrolled: false,
        attrs: {},
        children: [],
        value: '',
        hasAttribute: function (name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); },
        setAttribute: function (name, value) { this.attrs[name] = String(value == null ? '' : value); },
        removeAttribute: function (name) { delete this.attrs[name]; },
        appendChild: function (node) { this.children.push(node); return node; },
        addEventListener: function () {},
        focus: function () { this.focused = true; },
        scrollIntoView: function () { this.scrolled = true; },
        closest: function (sel) { return sel === '.se-group' ? group : null; },
        querySelector: function () { return null; },
        querySelectorAll: function () { return []; }
    };
}
function loadStatusApi(script) {
    var opened = [];
    var copied = [];
    var group = makeNode('se-overview');
    group.querySelector = function (sel) { return sel === '.se-group-hdr' ? { setAttribute: function () {} } : null; };
    var body = makeNode('usp-cmo-wargame-readiness-body', group);
    body._cmoWarGameReadinessBrief = {
        decision_label_en: 'GO with warnings',
        confidence: 82,
        run_mode: 'controlled war-game with CMO watch',
        next_actions: ['Run with CMO monitoring.']
    };
    body._cmoWarGameTestCard = { operator_steps: ['Open SCC.'], abort_criteria: ['Pause on blocker.'] };
    body._cmoWarGameEvidencePackage = {
        version: '1.0.0-rmooz-cmo-wargame-evidence-package-1',
        summary: {
            package_id: 'cmo-aar-fp-live-completed-release_grade',
            scenario_fingerprint: 'fp-live',
            outcome: 'Completed',
            release_interpretation: 'Release-grade evidence candidate',
            release_grade_candidate: true,
            training_only: false,
            evidence_changes: 2,
            unresolved_items: 0,
            recommendations: 1
        },
        handoff_checklist: [{ key: 'read_only', label: 'Read-only package.', status: 'pass' }],
        read_only: true
    };
    var nodes = {
        'scenario-command-palette-btn': makeNode('scenario-command-palette-btn'),
        'usp-cmo-wargame-readiness-body': body,
        'usp-cmo-wargame-readiness-block': makeNode('usp-cmo-wargame-readiness-block', group),
        'usp-cmo-wargame-test-card': makeNode('usp-cmo-wargame-test-card', group),
        'usp-cmo-evidence-package': makeNode('usp-cmo-evidence-package', group)
    };
    var fakeWindow = {};
    fakeWindow.window = fakeWindow;
    fakeWindow.console = console;
    fakeWindow.navigator = {
        clipboard: {
            writeText: function (text) {
                copied.push(String(text));
                return { then: function (ok) { if (ok) ok(); } };
            }
        }
    };
    fakeWindow.setTimeout = function (fn) { if (typeof fn === 'function') fn(); return 1; };
    fakeWindow.clearTimeout = function () {};
    fakeWindow.document = {
        readyState: 'complete',
        body: makeNode('body'),
        createElement: function () { return makeNode('created'); },
        addEventListener: function () {},
        getElementById: function (id) { return nodes[id] || null; },
        querySelector: function () { return null; },
        querySelectorAll: function () { return []; }
    };
    fakeWindow.RmoozScenarioEvidenceReleaseHud = {
        buildCluster: function () { return { cmo: { label_en: 'GO with warnings', cls: 'warnings' }, chips: [] }; },
        update: function () {}
    };
    fakeWindow.AppUnitStatusPanel = {
        openScenarioEvidenceTarget: function (target) { opened.push(target); },
        copyCmoWarGameReadinessBrief: function () { copied.push('CMO War-Game Readiness Brief'); return true; },
        copyCmoWarGameTestCard: function () { copied.push('CMO War-Game Operator Test Card'); return true; },
        copyCmoWarGameEvidencePackageSummary: function () { copied.push('CMO War-Game Evidence Package\nPackage: cmo-aar-fp-live'); return true; },
        copyCmoWarGameEvidencePackageJson: function () { copied.push('{"package_type":"cmo_wargame_evidence_package"}'); return true; }
    };
    vm.runInNewContext(script, { window: fakeWindow, console: console });
    return { api: fakeWindow.RmoozScenarioStatusHudDetails, opened: opened, copied: copied, nodes: nodes };
}
function richDebrief() {
    return {
        version: '1.0.0-cmo-wargame-aar-1',
        generated_at: '2026-07-03T15:30:00.000Z',
        scenario_fingerprint: 'fp-live-rich',
        outcome: { key: 'completed', label: 'Completed', status: 'pass' },
        release_interpretation: { key: 'release_grade_candidate', label: 'Release-grade evidence candidate', status: 'pass' },
        run_mode: { key: 'release_grade', label: 'Release-grade CMO run', allowed: true },
        timeline: [{ key: 'turn', label: 'Turn observed', value: '5 / BLUE' }],
        evidence_changes: [{ key: 'release_status', label: 'Release status', previous: 'not_ready', current: 'ready' }],
        unresolved_items: [],
        recommendations: [{ key: 'r1', label: 'Review force report and release certificate.' }],
        after_action_checklist: [{ key: 'review', label: 'Review release package.' }],
        instrumentation_summary: { release_status: 'ready' },
        read_only: true
    };
}

console.log('\n=== CMO-WARGAME-EVIDENCE-PACKAGE-LIVE-WIRING-1 Main Gate ===\n');

var app = src(APP);
var unit = src(UNIT);
var pkgSource = src(PKG_FILE);
var script = extractStatusScript(app);
var harness = loadStatusApi(script);
var API = harness.api;
var PKG = require(PKG_FILE);

console.log('--- CMO-PKG-LIVE-1: app load order and package/AAR compatibility ---');
(function () {
    var order = [
        'shell/cmo-wargame-after-action-debrief.js?v=cmo-wargame-aar-1',
        'shell/cmo-wargame-evidence-package.js?v=cmo-wargame-package-live-1',
        'shell/unit-status-panel.js'
    ].map(function (needle) { return app.indexOf(needle); });
    assert('T-1  package module loads after AAR and before Unit Status', order.every(function (idx) { return idx !== -1; }) && order[0] < order[1] && order[1] < order[2]);
    var pkg = PKG.buildPackage(richDebrief(), { generated_at: '2026-07-03T15:30:00.000Z' });
    assert('T-2  package builder accepts rich AAR release interpretation object', pkg.summary.release_interpretation === 'Release-grade evidence candidate' && pkg.summary.release_grade_candidate === true);
    assert('T-3  package summary includes package id, fingerprint, counts, and readiness flags', !!pkg.summary.package_id && pkg.summary.scenario_fingerprint === 'fp-live-rich' && pkg.summary.evidence_changes === 1 && pkg.summary.recommendations === 1 && pkg.summary.training_only === false);
    assert('T-4  handoff checklist is generated from package validation fields', arr(pkg.handoff_checklist).some(function (item) { return item.key === 'read_only' && item.status === 'pass'; }));
})();

console.log('\n--- CMO-PKG-LIVE-2: Unit Status CMO panel wiring and copy buttons ---');
(function () {
    assert('T-1  Unit Status builds package from AAR/run instrumentation state', unit.indexOf('EP.buildPackage(afterActionDebrief') !== -1 && unit.indexOf('body._cmoWarGameEvidencePackage') !== -1);
    assert('T-2  Unit Status renders visible package section after debrief', unit.indexOf('id="usp-cmo-evidence-package"') !== -1 && unit.indexOf('data-cmo-evidence-package="true"') !== -1 && unit.indexOf('renderCmoWarGameEvidencePackageHtml') !== -1);
    assert('T-3  package summary fields render in the CMO panel', ['Release meaning', 'Release-grade candidate', 'Training-only', 'Evidence changes', 'Blockers / warnings', 'Recommendations', 'Package ID', 'Fingerprint'].every(function (needle) { return unit.indexOf(needle) !== -1; }));
    assert('T-4  copy buttons render for summary, JSON, and handoff checklist', ['data-cmo-evidence-package-copy="summary"', 'data-cmo-evidence-package-copy="json"', 'data-cmo-evidence-package-copy="handoff"'].every(function (needle) { return unit.indexOf(needle) !== -1; }));
    assert('T-5  Unit Status exposes browser-local copy helpers', ['copyCmoWarGameEvidencePackageSummary', 'copyCmoWarGameEvidencePackageJson', 'copyCmoWarGameEvidencePackageHandoffChecklist'].every(function (needle) { return unit.indexOf(needle) !== -1; }));
    assert('T-6  copy helpers use clipboard only with no file/export route fallback', unit.indexOf('copyTextToClipboard') !== -1 && unit.indexOf('clipboard.writeText') !== -1 && unit.indexOf('createObjectURL') === -1);
})();

console.log('\n--- CMO-PKG-LIVE-3: command palette package actions ---');
(function () {
    assert('T-1  status HUD details API is available', !!API && typeof API.commandPaletteActions === 'function' && typeof API.executeCommand === 'function');
    var commandLabels = labels(API.commandPaletteActions());
    ['Open CMO Evidence Package', 'Copy CMO Evidence Package Summary', 'Copy CMO Evidence Package JSON'].forEach(function (label) {
        assert('T-command  ' + label + ' exists', commandLabels.indexOf(label) !== -1);
    });
    var cmoResults = labels(API.filterCommands(API.commandPaletteActions(), 'evidence package'));
    assert('T-2  package search returns open and copy actions', cmoResults.indexOf('Open CMO Evidence Package') !== -1 && cmoResults.indexOf('Copy CMO Evidence Package JSON') !== -1);
    function byKey(key) {
        return API.commandPaletteActions().filter(function (command) { return command.key === key; })[0];
    }
    API.executeCommand(byKey('open-cmo-evidence-package'), null, null);
    assert('T-3  open package action opens CMO target', harness.opened.indexOf('cmo') !== -1);
    assert('T-4  open package action focuses package section', harness.nodes['usp-cmo-evidence-package'].focused && harness.nodes['usp-cmo-evidence-package'].scrolled);
    API.executeCommand(byKey('copy-cmo-evidence-package-summary'), { querySelector: function () { return null; } }, null);
    API.executeCommand(byKey('copy-cmo-evidence-package-json'), { querySelector: function () { return null; } }, null);
    assert('T-5  copy package summary delegates to Unit Status copy helper', harness.copied.some(function (text) { return text.indexOf('CMO War-Game Evidence Package') !== -1 && text.indexOf('Package:') !== -1; }));
    assert('T-6  copy package JSON delegates to Unit Status copy helper', harness.copied.some(function (text) { return text.indexOf('cmo_wargame_evidence_package') !== -1; }));
})();

console.log('\n--- CMO-PKG-LIVE-4: strict boundaries and main-only scope ---');
(function () {
    var changed = '';
    try { changed = childProcess.execSync('git diff --name-only', { cwd: ROOT, encoding: 'utf8' }); } catch (_) {}
    assert('T-1  working diff does not touch offline deployment paths', changed.indexOf('Offline' + '_Deployment') === -1);
    var source = [
        stripComments(script),
        stripComments(pkgSource),
        stripComments(unit.slice(unit.indexOf('function buildCmoWarGameState'), unit.indexOf('function populateEvidenceCoverage')))
    ].join('\n');
    [
        ['no fetch/network/backend route', /fetch\s*\(|XMLHttpRequest|\/api\//],
        ['no browser database/storage writes', /indexedDB|openDatabase|localStorage\s*\.|sessionStorage\s*\./i],
        ['no DOCX/stage-doc/SLOT_FILE path', /stage-doc|SLOT_FILE|docs\.red|docs\.blue|DOCX|\.docx/i],
        ['no combat/action/doctrine mutation', /applyAction|commitAction|executeAction|autoFire|auto-fire|applyDoctrine|commitDoctrine|setDoctrine|\/doctrine/i],
        ['no protected runtime/journal path references', /data[\\/]journal|scenario_overrides\.json|data[\\/]users[\\/].*plans/i]
    ].forEach(function (pair) { assert('T-boundary  ' + pair[0], !pair[1].test(source)); });
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
