/* ============================================================================
 * test-cmo-wargame-live-wiring-main-batch-1.js
 * CMO-WARGAME-LIVE-WIRING-1 - Live Wiring Gate
 * ----------------------------------------------------------------------------
 * Main-app-only integration gate. It verifies the CMO readiness snapshot/brief/
 * test-card modules are loaded, wired into Scenario Evidence, reachable through
 * the command palette, documented, and boundary-safe.
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
var INVENTORY = path.join(ROOT, 'APP_INVENTORY.md');
var RUNBOOK = path.join(ROOT, 'UI_MOdified', 'docs', 'cmo-evidence-demo-runbook.md');

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
function labels(commands) {
    return arr(commands).map(function (command) { return command.label; });
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
    group.querySelector = function (sel) {
        return sel === '.se-group-hdr' ? { setAttribute: function () {} } : null;
    };
    var body = makeNode('usp-cmo-wargame-readiness-body', group);
    body._cmoWarGameReadinessBrief = {
        decision: 'go_with_warnings',
        decision_label_en: 'GO with warnings',
        confidence: 82,
        run_mode: 'controlled war-game with CMO watch',
        next_actions: [
            'Run with CMO monitoring and keep the release blockers visible.',
            'Pause if any warning becomes a blocking issue.'
        ]
    };
    body._cmoWarGameTestCard = {
        operator_steps: [
            'Open Scenario Control Center and confirm the committed COA is current.',
            'Open Scenario Evidence and keep CMO War-Game Readiness visible.'
        ],
        abort_criteria: [
            'Warning becomes a blocking release gate failure.',
            'Release fingerprint changes during handoff acceptance.'
        ]
    };
    body._scenarioEvidenceFlowSnapshot = { scenario: { fingerprint: 'fp-live-wiring' } };
    var nodes = {
        'scenario-command-palette-btn': makeNode('scenario-command-palette-btn'),
        'usp-cmo-wargame-readiness-body': body,
        'usp-cmo-wargame-readiness-block': makeNode('usp-cmo-wargame-readiness-block', group),
        'usp-cmo-wargame-test-card': makeNode('usp-cmo-wargame-test-card', group)
    };
    var fakeWindow = {};
    fakeWindow.window = fakeWindow;
    fakeWindow.console = console;
    fakeWindow.navigator = { clipboard: { writeText: function (text) { copied.push(String(text)); return { then: function (ok) { if (ok) ok(); } }; } } };
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
        getCurrentUnit: function () { return { uid: 'RED-1' }; },
        buildCmoWarGameState: function () {
            return {
                brief: body._cmoWarGameReadinessBrief,
                test_card: body._cmoWarGameTestCard,
                snapshot: body._scenarioEvidenceFlowSnapshot
            };
        },
        openScenarioEvidenceTarget: function (target) { opened.push(target); },
        copyCmoWarGameReadinessBrief: function () { copied.push('CMO War-Game Readiness Brief'); return true; },
        copyCmoWarGameTestCard: function () { copied.push('CMO War-Game Operator Test Card'); return true; }
    };
    vm.runInNewContext(script, { window: fakeWindow, console: console });
    return { api: fakeWindow.RmoozScenarioStatusHudDetails, opened: opened, copied: copied, nodes: nodes };
}

console.log('\n=== CMO-WARGAME-LIVE-WIRING-1 Main Live Wiring Gate ===\n');

var app = src(APP);
var unit = src(UNIT);
var script = extractStatusScript(app);
var harness = loadStatusApi(script);
var API = harness.api;

console.log('--- CMO-LW-7: script loading and drawer wiring ---');
(function () {
    var order = [
        'shell/scenario-evidence-flow-snapshot.js?v=cmo-wargame-live-1',
        'shell/cmo-wargame-readiness-brief.js?v=cmo-wargame-live-1',
        'shell/cmo-wargame-test-card.js?v=cmo-wargame-live-1',
        'shell/unit-status-panel.js'
    ].map(function (needle) { return app.indexOf(needle); });
    assert('T-1  CMO live modules load before Unit Status panel', order.every(function (idx) { return idx !== -1; }) && order[0] < order[1] && order[1] < order[2] && order[2] < order[3]);
    assert('T-2  Scenario Evidence drawer contains CMO readiness block', app.indexOf('id="usp-cmo-wargame-readiness-block"') !== -1 && app.indexOf('id="usp-cmo-wargame-readiness-body"') !== -1);
    assert('T-3  Unit Status groups CMO readiness under Commander Overview', unit.indexOf("blocks: ['usp-commander-brief-block', 'usp-cmo-wargame-readiness-block', 'usp-release-gate-block'") !== -1);
    assert('T-4  CMO target opens drawer at readiness block', unit.indexOf("cmo:      { group: 'overview', block: 'usp-cmo-wargame-readiness-block' }") !== -1 && unit.indexOf("else if (target === 'cmo') populateCmoWarGameReadiness(currentUnit)") !== -1);
    assert('T-5  CMO state is rebuilt during normal scenario evidence refreshes', unit.indexOf('populateCommanderBrief(unit)') < unit.indexOf('populateCmoWarGameReadiness(unit)') && unit.indexOf('buildCmoWarGameState') !== -1);
})();

console.log('\n--- CMO-LW-8: command palette actions and context ---');
(function () {
    assert('T-1  status HUD details API is available', !!API && typeof API.commandPaletteActions === 'function' && typeof API.executeCommand === 'function');
    var commandLabels = labels(API.commandPaletteActions());
    assert('T-2  CMO command labels are searchable', ['Open CMO Readiness', 'Open CMO Test Card', 'Copy CMO Readiness Brief', 'Copy CMO Test Card'].every(function (needle) { return commandLabels.indexOf(needle) !== -1; }));
    assert('T-3  CMO search returns readiness/test-card actions', labels(API.filterCommands(API.commandPaletteActions(), 'cmo')).join('|').indexOf('Open CMO Readiness') !== -1);
    var readinessCtx = API.commandContext({ key: 'open-cmo-readiness', target: 'cmo' }, {}, { cmo: { label_en: 'GO with warnings', cls: 'warnings' } });
    var cardCtx = API.commandContext({ key: 'open-cmo-test-card', target: 'cmo' }, {}, { cmo: { label_en: 'GO with warnings', cls: 'warnings' } });
    assert('T-4  readiness context explains current run decision', readinessCtx.title === 'CMO Readiness: GO with warnings' && readinessCtx.detail === 'Confidence: 82%');
    assert('T-5  test-card context explains operator steps', cardCtx.detail === 'Open Scenario Control Center and confirm the committed COA is current.');

    function byKey(key) {
        return API.commandPaletteActions().filter(function (command) { return command.key === key; })[0];
    }
    API.executeCommand(byKey('open-cmo-readiness'), null, null);
    API.executeCommand(byKey('open-cmo-test-card'), null, null);
    API.executeCommand(byKey('copy-cmo-readiness-brief'), { querySelector: function () { return null; } }, null);
    API.executeCommand(byKey('copy-cmo-test-card'), { querySelector: function () { return null; } }, null);
    assert('T-6  open actions reuse drawer jump API', harness.opened.filter(function (target) { return target === 'cmo'; }).length >= 2);
    assert('T-7  open test-card action focuses test-card block', harness.nodes['usp-cmo-wargame-test-card'].focused && harness.nodes['usp-cmo-wargame-test-card'].scrolled);
    assert('T-8  copy actions delegate to Unit Status CMO copy helpers', harness.copied.indexOf('CMO War-Game Readiness Brief') !== -1 && harness.copied.indexOf('CMO War-Game Operator Test Card') !== -1);
})();

console.log('\n--- CMO-LW-9: docs, main-only scope, and boundaries ---');
(function () {
    var inventory = src(INVENTORY);
    var runbook = src(RUNBOOK);
    assert('T-1  inventory documents live wiring and pending offline sync', inventory.indexOf('CMO-WARGAME-LIVE-WIRING-1') !== -1 && inventory.indexOf('Offline sync/testing: pending by user instruction') !== -1);
    assert('T-2  runbook documents CMO readiness and test-card workflow', runbook.indexOf('CMO War-Game Live Wiring') !== -1 && runbook.indexOf('Open CMO Test Card') !== -1);

    var changed = '';
    try { changed = childProcess.execSync('git diff --name-only', { cwd: ROOT, encoding: 'utf8' }); } catch (_) {}
    assert('T-3  working diff does not touch offline deployment paths', changed.indexOf('Offline' + '_Deployment') === -1);

    var sources = [
        script,
        unit,
        src(path.join(SHELL, 'scenario-evidence-flow-snapshot.js')),
        src(path.join(SHELL, 'cmo-wargame-readiness-brief.js')),
        src(path.join(SHELL, 'cmo-wargame-test-card.js'))
    ].map(stripComments).join('\n');
    [
        ['no fetch/network route', /fetch\s*\(|XMLHttpRequest|\/api\//],
        ['no browser database/storage writes', /indexedDB|openDatabase|localStorage\s*\./i],
        ['no DOCX staging revival', /stage-doc|SLOT_FILE|docs\.red|docs\.blue|\.docx/i],
        ['no combat/action/doctrine mutation API', /applyAction|commitAction|executeAction|autoFire|auto-fire|applyDoctrine|commitDoctrine|setDoctrine|\/doctrine/i],
        ['no protected runtime file references', /legacy-shim-attack_objective_draft-15\.jsonl|scenario_overrides\.json/]
    ].forEach(function (pair) { assert('T-boundary  ' + pair[0], !pair[1].test(sources)); });
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);

