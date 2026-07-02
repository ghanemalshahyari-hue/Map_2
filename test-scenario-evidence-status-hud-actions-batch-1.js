/* ============================================================================
 * test-scenario-evidence-status-hud-actions-batch-1.js
 * RMOOZ-SCENARIO-QA-BATCH-15 - Header Status Actions + Operator Shortcuts
 * ----------------------------------------------------------------------------
 * Main-app-only gate for actionable status-header details. This intentionally
 * does not inspect offline files: offline sync/testing is pending by user
 * instruction for this batch.
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

function loadApi(script) {
    var copied = [];
    var opened = [];
    var group = {
        attrs: {},
        setAttribute: function (name, value) { this.attrs[name] = String(value == null ? '' : value); },
        querySelector: function (sel) {
            if (sel !== '.se-group-hdr') return null;
            return {
                attrs: {},
                setAttribute: function (name, value) { this.attrs[name] = String(value == null ? '' : value); }
            };
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
        createElement: function () {
            return {
                id: '',
                className: '',
                innerHTML: '',
                attrs: {},
                setAttribute: function (name, value) { this.attrs[name] = String(value == null ? '' : value); },
                removeAttribute: function (name) { delete this.attrs[name]; },
                appendChild: function () {},
                querySelector: function () { return null; },
                querySelectorAll: function () { return []; },
                addEventListener: function () {}
            };
        },
        getElementById: function (id) { return blocks[id] || null; }
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
        group: group
    };
}

function actionLabels(actions) {
    return actions.map(function (action) { return action.label; }).join('|');
}

console.log('\n=== RMOOZ-SCENARIO-QA-BATCH-15 Header Status Actions ===\n');

var app = src(APP);
var script = extractStatusScript(app);
var harness = loadApi(script);
var API = harness.api;

console.log('--- QA-123: action model and compact rendering ---');
(function () {
    assert('T-1  Batch 15 action version exposed', !!API && API.ACTIONS_VERSION === '1.0.0-rmooz-scenario-qa-batch-15');
    assert('T-2  action helpers exposed', typeof API.actionsForTarget === 'function' && typeof API.summaryText === 'function' && typeof API.handleAction === 'function');
    assert('T-3  release actions match target behavior',
        actionLabels(API.actionsForTarget('release')) === 'Open Release Gate|View Release Blockers|Copy Release Summary');
    assert('T-4  closeout actions match target behavior',
        actionLabels(API.actionsForTarget('closeout')) === 'Open Closeout|View Unresolved Issues|Copy Closeout Summary');
    assert('T-5  coverage actions match target behavior',
        actionLabels(API.actionsForTarget('coverage')) === 'Open Coverage|View Review Queue|Copy Coverage Summary');
    assert('T-6  handoff actions match target behavior',
        actionLabels(API.actionsForTarget('handoff')) === 'Open Handoff Acceptance|Open Handoff Package|Copy Handoff Summary');

    var info = API.buildDetail('release', {
        release_gate: {
            status_label_en: 'Not Ready',
            checks: [
                { key: 'unresolved_issues', actual: '2', status: 'fail' },
                { key: 'fingerprint_match', actual: 'mismatch', status: 'fail' }
            ]
        }
    }, { label_en: 'Not Ready', cls: 'not-ready' });
    var html = API.renderDetailHtml(info);
    assert('T-7  popover renders native action buttons', html.indexOf('<button type="button" class="release-hud-detail-action"') !== -1);
    assert('T-8  rendered actions carry action attributes', html.indexOf('data-scenario-status-action-key="view-release-blockers"') !== -1 && html.indexOf('data-scenario-status-action-block="usp-release-gate-block"') !== -1);
    assert('T-9  rendered actions carry copy live state', html.indexOf('data-scenario-status-copy-state') !== -1 && html.indexOf('aria-live="polite"') !== -1);
    assert('T-10 summary text explains why status', API.summaryText(info).indexOf('Release: Not Ready') === 0 && API.summaryText(info).indexOf('- 2 unresolved issues') !== -1);
})();

console.log('\n--- QA-124: drawer jumps, review/package focus, and copy shortcut ---');
(function () {
    var state = { textContent: '' };
    var pop = { querySelector: function (sel) { return sel === '[data-scenario-status-copy-state]' ? state : null; } };
    var ev = {
        preventDefaultCalled: false,
        stopPropagationCalled: false,
        preventDefault: function () { this.preventDefaultCalled = true; },
        stopPropagation: function () { this.stopPropagationCalled = true; }
    };
    var closeout = API.buildDetail('closeout', {
        closeout: { status_label_en: 'Ready with Exceptions', counts: { deferred: 2, fixed_externally: 1, needs_review: 2 } }
    }, { label_en: 'Ready with Exceptions', cls: 'warnings' });
    var unresolved = closeout.actions.filter(function (action) { return action.key === 'view-unresolved-issues'; })[0];
    API.handleAction(unresolved, closeout, pop, ev);
    assert('T-1  view unresolved opens closeout drawer target', harness.opened.indexOf('closeout') !== -1);
    assert('T-2  view unresolved focuses review queue block', harness.blocks['usp-review-queue-block'].focused && harness.blocks['usp-review-queue-block'].scrolled);
    assert('T-3  focus opens containing scenario-evidence group', harness.group.attrs['data-collapsed'] === 'false');
    assert('T-4  action click is contained', ev.preventDefaultCalled && ev.stopPropagationCalled);

    var handoff = API.buildDetail('handoff', {
        acceptance: { decision_label_en: 'Accepted with Warnings', receipt: { package_fingerprint: 'pkg-a', fingerprint_match: false } }
    }, { label_en: 'Accepted with Warnings', cls: 'warnings' });
    var pkg = handoff.actions.filter(function (action) { return action.key === 'open-handoff-package'; })[0];
    API.handleAction(pkg, handoff, pop, null);
    assert('T-5  handoff package opens handoff drawer target', harness.opened.indexOf('handoff') !== -1);
    assert('T-6  handoff package focuses package block', harness.blocks['usp-handoff-package-block'].focused);

    var copy = handoff.actions.filter(function (action) { return action.key === 'copy-handoff-summary'; })[0];
    API.handleAction(copy, handoff, pop, null);
    assert('T-7  copy summary writes clipboard text', harness.copied.length === 1 && harness.copied[0].indexOf('Handoff: Accepted with Warnings') !== -1);
    assert('T-8  copy action reports copied state', state.textContent === 'Copied');
})();

console.log('\n--- QA-125: CSS, docs, main-only scope, and boundaries ---');
(function () {
    assert('T-1  app defines compact action styling', app.indexOf('.release-hud-detail-actions') !== -1 && app.indexOf('.release-hud-detail-action:focus-visible') !== -1);
    assert('T-2  keyboard-safe hover/focus retention present', ['focusin', 'focusout', 'mouseenter', 'mouseleave'].every(function (needle) { return script.indexOf(needle) !== -1; }));
    assert('T-3  existing drawer API is reused', script.indexOf('openScenarioEvidenceTarget') !== -1 && script.indexOf('AppUnitStatusPanel') !== -1);
    assert('T-4  clipboard copy is browser-local', script.indexOf('navigator') !== -1 && script.indexOf('clipboard.writeText') !== -1);
    assert('T-5  severity metadata remains available', script.indexOf('SEVERITY_RANK') !== -1 && script.indexOf('data-scenario-status-rank') !== -1);

    var inventory = src(INVENTORY);
    var runbook = src(RUNBOOK);
    assert('T-6  inventory documents v15 and offline pending', inventory.indexOf('scenario-evidence v15') !== -1 && inventory.indexOf('Offline sync/testing: pending by user instruction') !== -1);
    assert('T-7  runbook documents all shortcut labels', [
        'Open Release Gate',
        'View Unresolved Issues',
        'View Review Queue',
        'Open Handoff Package',
        'Copy Handoff Summary'
    ].every(function (needle) { return runbook.indexOf(needle) !== -1; }));

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
