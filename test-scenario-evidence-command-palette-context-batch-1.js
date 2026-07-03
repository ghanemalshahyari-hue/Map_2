/* ============================================================================
 * test-scenario-evidence-command-palette-context-batch-1.js
 * RMOOZ-SCENARIO-QA-BATCH-17 - Command Palette Context + Quick Filters
 * ----------------------------------------------------------------------------
 * Main-app-only gate for status context and quick filters in the scenario
 * evidence command palette. This intentionally does not inspect offline files:
 * offline sync/testing is pending by user instruction for this batch.
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

function makeNode() {
    return {
        id: '',
        className: '',
        innerHTML: '',
        attrs: {},
        value: '',
        setAttribute: function (name, value) { this.attrs[name] = String(value == null ? '' : value); },
        removeAttribute: function (name) { delete this.attrs[name]; },
        appendChild: function () {},
        addEventListener: function () {},
        focus: function () {},
        querySelector: function () { return null; },
        querySelectorAll: function () { return []; }
    };
}

function loadApi(script) {
    var fakeWindow = {};
    fakeWindow.window = fakeWindow;
    fakeWindow.console = console;
    fakeWindow.navigator = { clipboard: { writeText: function () { return { then: function (ok) { ok(); } }; } } };
    fakeWindow.setTimeout = function (fn) { fn(); return 1; };
    fakeWindow.clearTimeout = function () {};
    fakeWindow.document = {
        readyState: 'complete',
        body: makeNode(),
        createElement: function () { return makeNode(); },
        addEventListener: function () {},
        getElementById: function () { return null; }
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
    vm.runInNewContext(script, { window: fakeWindow, console: console });
    return fakeWindow.RmoozScenarioStatusHudDetails;
}

function sampleStatus() {
    return {
        release_gate: {
            status_label_en: 'Not Ready',
            checks: [
                { key: 'unresolved_issues', actual: '2', status: 'fail' },
                { key: 'fingerprint_match', actual: 'mismatch', status: 'fail' }
            ]
        },
        closeout: {
            status_label_en: 'Ready with Exceptions',
            counts: { deferred: 2, fixed_externally: 1, needs_review: 2 }
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
    };
}

function sampleCluster() {
    return {
        release: { label_en: 'Not Ready', cls: 'not-ready' },
        closeout: { label_en: 'Ready with Exceptions', cls: 'warnings' },
        coverage: { label_en: '78%', cls: 'warnings' },
        handoff: { label_en: 'Accepted with Warnings', cls: 'warnings' }
    };
}

function labels(commands) {
    return commands.map(function (command) { return command.label; });
}

console.log('\n=== RMOOZ-SCENARIO-QA-BATCH-17 Command Palette Context ===\n');

var app = src(APP);
var script = extractStatusScript(app);
var API = loadApi(script);

console.log('--- QA-130: context API and filter catalog ---');
(function () {
    assert('T-1  Batch 17 context version exposed', !!API && API.COMMAND_CONTEXT_VERSION === '1.0.0-rmooz-scenario-qa-batch-17');
    assert('T-2  context helpers exposed', ['commandPaletteFilters', 'commandContext', 'decorateCommand', 'decorateCommands', 'renderCommandFiltersHtml'].every(function (name) {
        return typeof API[name] === 'function';
    }));
    assert('T-3  filter catalog includes expected scopes', labels(API.commandPaletteFilters()).join('|') === 'All|Release|Closeout|Coverage|Handoff|Copy');
    var filterHtml = API.renderCommandFiltersHtml('coverage');
    assert('T-4  filter render marks active scope', filterHtml.indexOf('data-scenario-command-filter="coverage"') !== -1 && filterHtml.indexOf('scenario-command-filter--active') !== -1 && filterHtml.indexOf('aria-pressed="true"') !== -1);
})();

console.log('\n--- QA-131: quick filters and status context ---');
(function () {
    var all = API.commandPaletteActions();
    var releaseOnly = labels(API.filterCommands(all, '', 'release'));
    assert('T-1  release filter keeps release commands only', releaseOnly.length === 3 && releaseOnly.indexOf('Open Release Gate') !== -1 && releaseOnly.indexOf('Open Coverage') === -1);
    var copyOnly = labels(API.filterCommands(all, '', 'copy'));
    assert('T-2  copy filter keeps browser-local copy commands only', copyOnly.join('|') === 'Copy Release Summary|Copy Coverage Summary|Copy CMO Readiness Brief|Copy CMO Test Card|Copy CMO Evidence Package Summary|Copy CMO Evidence Package JSON');
    var reviewCoverage = labels(API.filterCommands(all, 'review', 'coverage'));
    assert('T-3  search combines with filter', reviewCoverage.join('|') === 'Open Review Queue');

    var releaseCtx = API.commandContext({ target: 'release' }, sampleStatus(), sampleCluster());
    assert('T-4  release context includes current status', releaseCtx.title === 'Release: Not Ready');
    assert('T-5  release context includes leading blocker', releaseCtx.detail === '2 unresolved issues');
    var coverageCtx = API.commandContext({ target: 'coverage' }, sampleStatus(), sampleCluster());
    assert('T-6  coverage context includes percent', coverageCtx.title === 'Coverage: 78%');
    assert('T-7  coverage context includes leading evidence count', coverageCtx.detail === 'Contact evidence: 8/10');
    var cmo = labels(API.filterCommands(all, 'cmo'));
    assert('T-8  CMO search finds readiness and test-card commands', cmo.indexOf('Open CMO Readiness') !== -1 && cmo.indexOf('Open CMO Test Card') !== -1);
})();

console.log('\n--- QA-132: decorated rendering and docs/boundaries ---');
(function () {
    var decorated = API.decorateCommands(API.filterCommands(API.commandPaletteActions(), '', 'coverage'), sampleStatus(), sampleCluster());
    var html = API.renderCommandPaletteHtml(decorated, 0);
    assert('T-1  decorated render includes status context', html.indexOf('scenario-command-item-context') !== -1 && html.indexOf('Coverage: 78%') !== -1);
    assert('T-2  decorated render includes context detail', html.indexOf('scenario-command-item-detail') !== -1 && html.indexOf('Contact evidence: 8/10') !== -1);
    assert('T-3  app defines filter and context styling', app.indexOf('.scenario-command-filters') !== -1 && app.indexOf('.scenario-command-item-context') !== -1 && app.indexOf('.scenario-command-item-detail') !== -1);
    assert('T-4  palette state tracks active filter', script.indexOf('activeFilter') !== -1 && script.indexOf('renderCommandFiltersHtml') !== -1 && script.indexOf('bindCommandFilters') !== -1);

    var inventory = src(INVENTORY);
    var runbook = src(RUNBOOK);
    assert('T-5  inventory documents v17 and offline pending', inventory.indexOf('scenario-evidence v17') !== -1 && inventory.indexOf('Offline sync/testing: pending by user instruction') !== -1);
    assert('T-6  runbook documents quick filters and context', runbook.indexOf('Command Palette Context + Quick Filters (Batch 17)') !== -1 && runbook.indexOf('All / Release / Closeout / Coverage / Handoff / Copy') !== -1);

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
