/* ============================================================================
 * test-scenario-evidence-command-palette-batch-1.js
 * RMOOZ-SCENARIO-QA-BATCH-16 - Status Header Command Palette
 * ----------------------------------------------------------------------------
 * Main-app-only gate for the scenario evidence command palette. This
 * intentionally does not inspect offline files: offline sync/testing is pending
 * by user instruction for this batch.
 * ========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = __dirname;
var APP = path.join(ROOT, 'UI_MOdified', 'client', 'app.html');
var INVENTORY = path.join(ROOT, 'APP_INVENTORY.md');
var RUNBOOK = path.join(ROOT, 'UI_MOdified', 'docs', 'cmo-evidence-demo-runbook.md');

var passed = 0, failed = 0;
function assert(label, cond) {
    if (cond) { console.log('  PASS  ' + label); passed++; }
    else { console.error('  FAIL  ' + label); failed++; }
}
function src(file) { return fs.readFileSync(file, 'utf8'); }

function extractStatusScript(html) {
    var marker = 'RMOOZ-SCENARIO-QA-BATCH-14';
    var idx = html.indexOf(marker);
    if (idx < 0) return '';
    var start = html.lastIndexOf('<script>', idx);
    var end = html.indexOf('</script>', idx);
    if (start < 0 || end < 0 || end <= start) return '';
    return html.slice(start + '<script>'.length, end);
}

function makeBlock(id, group) {
    return {
        id: id,
        focused: false,
        scrolled: false,
        attrs: {},
        hasAttribute: function (name) { return Object.prototype.hasOwnProperty.call(this.attrs, name); },
        setAttribute: function (name, value) { this.attrs[name] = String(value == null ? '' : value); },
        focus: function () { this.focused = true; },
        scrollIntoView: function () { this.scrolled = true; },
        closest: function (sel) { return sel === '.se-group' ? group : null; }
    };
}

function makeNode() {
    return {
        id: '',
        className: '',
        innerHTML: '',
        attrs: {},
        hidden: false,
        value: '',
        textContent: '',
        children: [],
        setAttribute: function (name, value) { this.attrs[name] = String(value == null ? '' : value); if (name === 'hidden') this.hidden = true; },
        removeAttribute: function (name) { delete this.attrs[name]; if (name === 'hidden') this.hidden = false; },
        appendChild: function (node) { this.children.push(node); return node; },
        addEventListener: function () {},
        focus: function () { this.focused = true; },
        querySelector: function () { return null; },
        querySelectorAll: function () { return []; }
    };
}

function loadHarness(script) {
    var copied = [];
    var opened = [];
    var group = {
        attrs: {},
        setAttribute: function (name, value) { this.attrs[name] = String(value == null ? '' : value); },
        querySelector: function (sel) {
            if (sel !== '.se-group-hdr') return null;
            return { setAttribute: function () {} };
        }
    };
    var blocks = {
        'usp-release-gate-block': makeBlock('usp-release-gate-block', group),
        'usp-review-closeout-block': makeBlock('usp-review-closeout-block', group),
        'usp-review-queue-block': makeBlock('usp-review-queue-block', group),
        'usp-evidence-coverage-block': makeBlock('usp-evidence-coverage-block', group),
        'usp-handoff-acceptance-block': makeBlock('usp-handoff-acceptance-block', group),
        'usp-handoff-package-block': makeBlock('usp-handoff-package-block', group)
    };
    var trigger = makeNode();
    var fakeWindow = {};
    fakeWindow.window = fakeWindow;
    fakeWindow.console = console;
    fakeWindow.navigator = {
        clipboard: {
            writeText: function (text) {
                copied.push(text);
                return { then: function (ok) { ok(); } };
            }
        }
    };
    fakeWindow.setTimeout = function (fn) { fn(); return 1; };
    fakeWindow.clearTimeout = function () {};
    fakeWindow.document = {
        readyState: 'complete',
        body: makeNode(),
        createElement: function () { return makeNode(); },
        addEventListener: function () {},
        getElementById: function (id) {
            if (id === 'scenario-command-palette-btn') return trigger;
            return blocks[id] || null;
        }
    };
    fakeWindow.RmoozScenarioEvidenceReleaseHud = {
        buildCluster: function () {
            return {
                release: { label_en: 'Not Ready', cls: 'not-ready' },
                closeout: { label_en: 'Ready with Exceptions', cls: 'warnings' },
                coverage: { label_en: '78%', cls: 'warnings' },
                handoff: { label_en: 'Accepted with Warnings', cls: 'warnings' },
                chips: []
            };
        },
        update: function () {}
    };
    fakeWindow.AppUnitStatusPanel = {
        openScenarioEvidenceTarget: function (target) { opened.push(target); }
    };
    vm.runInNewContext(script, { window: fakeWindow, console: console });
    return {
        api: fakeWindow.RmoozScenarioStatusHudDetails,
        copied: copied,
        opened: opened,
        blocks: blocks,
        group: group,
        trigger: trigger
    };
}

function labels(commands) {
    return commands.map(function (command) { return command.label; });
}

console.log('\n=== RMOOZ-SCENARIO-QA-BATCH-16 Status Header Command Palette ===\n');

var app = src(APP);
var script = extractStatusScript(app);
var harness = loadHarness(script);
var API = harness.api;

console.log('--- QA-126: header trigger and command catalog ---');
(function () {
    assert('T-1  Batch 16 command palette version exposed', !!API && API.COMMAND_PALETTE_VERSION === '1.0.0-rmooz-scenario-qa-batch-16');
    assert('T-2  command helpers exposed', ['commandPaletteActions', 'filterCommands', 'renderCommandPaletteHtml', 'executeCommand', 'openCommandPalette'].every(function (name) {
        return typeof API[name] === 'function';
    }));
    assert('T-3  header trigger is present', app.indexOf('id="scenario-command-palette-btn"') !== -1 && app.indexOf('Scenario Actions') !== -1);
    assert('T-4  Arabic command label is present', app.indexOf('&#1571;&#1608;&#1575;&#1605;&#1585; &#1575;&#1604;&#1587;&#1610;&#1606;&#1575;&#1585;&#1610;&#1608;') !== -1);
    assert('T-5  Ctrl+K shortcut is visible and bound', app.indexOf('Ctrl+K') !== -1 && script.indexOf("key === 'k'") !== -1 && script.indexOf('ctrlKey') !== -1);

    var expected = [
        'Open Release Gate',
        'View Release Blockers',
        'Open Closeout',
        'View Unresolved Issues',
        'Open Coverage',
        'Open Review Queue',
        'Open Handoff Package',
        'Open Handoff Acceptance',
        'Open CMO Readiness',
        'Open CMO Test Card',
        'Copy Release Summary',
        'Copy Coverage Summary',
        'Copy CMO Readiness Brief',
        'Copy CMO Test Card'
    ];
    var actual = labels(API.commandPaletteActions());
    assert('T-6  fourteen command labels are available including CMO actions', expected.length === actual.length && expected.every(function (label) { return actual.indexOf(label) !== -1; }));
})();

console.log('\n--- QA-127: search and render behavior ---');
(function () {
    var all = API.commandPaletteActions();
    var release = labels(API.filterCommands(all, 'release'));
    assert('T-1  release search finds release commands', ['Open Release Gate', 'View Release Blockers', 'Copy Release Summary'].every(function (label) { return release.indexOf(label) !== -1; }));
    assert('T-2  release search excludes coverage command', release.indexOf('Open Coverage') === -1);
    var review = labels(API.filterCommands(all, 'review queue'));
    assert('T-3  review queue search finds review commands', review.indexOf('Open Review Queue') !== -1 && review.indexOf('View Unresolved Issues') !== -1);
    var html = API.renderCommandPaletteHtml(API.filterCommands(all, 'handoff'), 1);
    assert('T-4  render includes selectable command buttons', html.indexOf('data-scenario-command-key="open-handoff-package"') !== -1 && html.indexOf('role="option"') !== -1);
    assert('T-5  active command receives selected class', html.indexOf('scenario-command-item--active') !== -1 && html.indexOf('aria-selected="true"') !== -1);
    assert('T-6  empty search renders empty row', API.renderCommandPaletteHtml([], 0).indexOf('No matching scenario actions') !== -1);
})();

console.log('\n--- QA-128: commands reuse drawer jumps and copy summaries ---');
(function () {
    var mount = {
        pop: null,
        appendChild: function (node) { this.pop = node; return node; },
        querySelector: function (sel) { return sel === '#release-hud-detail' ? this.pop : null; },
        querySelectorAll: function () { return []; }
    };
    API.enhance(mount, {
        release_gate: {
            status_label_en: 'Not Ready',
            checks: [
                { key: 'unresolved_issues', actual: '2', status: 'fail' },
                { key: 'fingerprint_match', actual: 'mismatch', status: 'fail' }
            ]
        },
        coverage: {
            coverage_pct: 78,
            hud_details: {
                total: 10,
                contact_evidence: { present: 8 },
                engagement_evidence: { present: 9 },
                decision_chain: { present: 9 },
                needs_review: 2
            }
        },
        acceptance: {
            decision_label_en: 'Accepted with Warnings',
            receipt: { package_fingerprint: 'pkg-a', fingerprint_match: false }
        }
    });

    var commands = API.commandPaletteActions();
    function byKey(key) { return commands.filter(function (command) { return command.key === key; })[0]; }

    API.executeCommand(byKey('open-release-gate'), null, null);
    assert('T-1  open release gate opens release target', harness.opened.indexOf('release') !== -1);

    API.executeCommand(byKey('open-review-queue'), null, null);
    assert('T-2  open review queue opens coverage target first', harness.opened.indexOf('coverage') !== -1);
    assert('T-3  open review queue focuses review queue block', harness.blocks['usp-review-queue-block'].focused && harness.blocks['usp-review-queue-block'].scrolled);

    API.executeCommand(byKey('open-handoff-package'), null, null);
    assert('T-4  open handoff package opens handoff target', harness.opened.indexOf('handoff') !== -1);
    assert('T-5  open handoff package focuses package block', harness.blocks['usp-handoff-package-block'].focused);

    API.executeCommand(byKey('copy-release-summary'), { querySelector: function () { return null; } }, null);
    API.executeCommand(byKey('copy-coverage-summary'), { querySelector: function () { return null; } }, null);
    assert('T-6  copy release writes release summary', harness.copied.some(function (text) { return text.indexOf('Release: Not Ready') !== -1 && text.indexOf('- 2 unresolved issues') !== -1; }));
    assert('T-7  copy coverage writes coverage summary', harness.copied.some(function (text) { return text.indexOf('Coverage: 78%') !== -1 && text.indexOf('Contact evidence: 8/10') !== -1; }));
})();

console.log('\n--- QA-129: CSS, docs, main-only scope, and boundaries ---');
(function () {
    assert('T-1  app defines command palette styling', app.indexOf('.scenario-command-palette') !== -1 && app.indexOf('.scenario-command-search') !== -1 && app.indexOf('.scenario-command-item') !== -1);
    assert('T-2  app defines accessible dialog semantics', script.indexOf("setAttribute('role', 'dialog')") !== -1 && script.indexOf("aria-modal") !== -1 && script.indexOf("role=\"listbox\"") !== -1);
    assert('T-3  keyboard controls are present', ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].every(function (needle) { return script.indexOf(needle) !== -1; }));

    var inventory = src(INVENTORY);
    var runbook = src(RUNBOOK);
    assert('T-4  inventory documents v16 and offline pending', inventory.indexOf('scenario-evidence v16') !== -1 && inventory.indexOf('Offline sync/testing: pending by user instruction') !== -1);
    assert('T-5  runbook documents command palette flow', runbook.indexOf('Status Header Command Palette (Batch 16)') !== -1 && runbook.indexOf('Ctrl+K or Scenario Actions') !== -1);
    assert('T-6  runbook documents searchable commands', ['Open Release Gate', 'Open Review Queue', 'Copy Coverage Summary'].every(function (needle) { return runbook.indexOf(needle) !== -1; }));

    var boundarySource = script
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
    [
        ['no fetch(', /fetch\s*\(/],
        ['no XMLHttpRequest', /XMLHttpRequest/],
        ['no backend /api/ call', /\/api\//],
        ['no IndexedDB/database API', /indexedDB|openDatabase/i],
        ['no DOCX staging', /stage-doc|SLOT_FILE|docs\.red|docs\.blue|DOCX/i],
        ['no combat/action/doctrine mutation', /applyAction|commitAction|executeAction|autoFire|auto-fire|applyDoctrine|commitDoctrine|setDoctrine|\/doctrine/]
    ].forEach(function (pair) {
        assert(pair[0], !pair[1].test(boundarySource));
    });
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
