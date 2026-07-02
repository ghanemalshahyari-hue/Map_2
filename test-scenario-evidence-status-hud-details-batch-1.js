/* ============================================================================
 * test-scenario-evidence-status-hud-details-batch-1.js
 * RMOOZ-SCENARIO-QA-BATCH-14 - Header Status Details + Accessibility Polish
 * ----------------------------------------------------------------------------
 * Main-app-only gate for the status-header detail popover. This intentionally
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

function extractBatch14Script(html) {
    var marker = 'RMOOZ-SCENARIO-QA-BATCH-14';
    var idx = html.indexOf(marker);
    if (idx < 0) return '';
    var start = html.lastIndexOf('<script>', idx);
    var end = html.indexOf('</script>', idx);
    if (start < 0 || end < 0 || end <= start) return '';
    return html.slice(start + '<script>'.length, end);
}

function loadApi(script) {
    var fakeWindow = {};
    fakeWindow.window = fakeWindow;
    fakeWindow.console = console;
    fakeWindow.document = {
        createElement: function () {
            return {
                id: '',
                className: '',
                innerHTML: '',
                _attrs: {},
                setAttribute: function (name, value) { this._attrs[name] = String(value == null ? '' : value); },
                removeAttribute: function (name) { delete this._attrs[name]; }
            };
        }
    };
    vm.runInNewContext(script, { window: fakeWindow, console: console });
    return fakeWindow.RmoozScenarioStatusHudDetails;
}

console.log('\n=== RMOOZ-SCENARIO-QA-BATCH-14 Header Status Details ===\n');

var app = src(APP);
var script = extractBatch14Script(app);
var API = loadApi(script);

console.log('--- QA-120: main app exposes status details layer ---');
(function () {
    assert('T-1  Batch 14 script present in main app only', script.indexOf('Header Status Details') !== -1 || script.indexOf('header status details') !== -1);
    assert('T-2  details API exposed', !!API && API.VERSION === '1.0.0-rmooz-scenario-qa-batch-14');
    assert('T-3  CSS defines compact popover', app.indexOf('.release-hud-detail') !== -1 && script.indexOf("setAttribute('role', 'tooltip')") !== -1);
    assert('T-4  focus styling is present', app.indexOf('.release-hud-chip:focus-visible') !== -1);
    assert('T-5  hover/focus hooks are present', ['mouseenter', 'mouseleave', 'focus', 'blur'].every(function (needle) { return script.indexOf(needle) !== -1; }));
    assert('T-6  keyboard Escape support is present', script.indexOf('keydown') !== -1 && script.indexOf('Escape') !== -1);
    assert('T-7  ARIA details linkage is present', script.indexOf('aria-describedby') !== -1 && script.indexOf('aria-keyshortcuts') !== -1);
})();

console.log('\n--- QA-121: detail summaries explain status causes ---');
(function () {
    var release = API.buildDetail('release', {
        release_gate: {
            status_label_en: 'Not Ready',
            checks: [
                { key: 'unresolved_issues', actual: '2', status: 'fail' },
                { key: 'handoff_acceptance', actual: 'No decision yet', status: 'fail' },
                { key: 'fingerprint_match', actual: 'Package fingerprint mismatch', status: 'fail' }
            ]
        }
    }, { label_en: 'Not Ready', cls: 'not-ready' });
    assert('T-1  release title includes status', release.title === 'Release: Not Ready');
    assert('T-2  release reasons include unresolved issues', release.lines.indexOf('2 unresolved issues') !== -1);
    assert('T-3  release reasons include handoff acceptance', release.lines.indexOf('Handoff package not accepted') !== -1);
    assert('T-4  release reasons include fingerprint mismatch', release.lines.indexOf('Fingerprint mismatch') !== -1);

    var coverage = API.buildDetail('coverage', {
        coverage: {
            coverage_pct: 78,
            hud_details: {
                total: 10,
                contact_evidence: { present: 8 },
                engagement_evidence: { present: 9 },
                decision_chain: { present: 9 },
                needs_review: 2
            }
        }
    }, { label_en: '78%', cls: 'warnings' });
    assert('T-5  coverage title includes percent', coverage.title === 'Coverage: 78%');
    ['Contact evidence: 8/10', 'Engagement evidence: 9/10', 'Decision chain: 9/10', 'Needs review: 2'].forEach(function (line) {
        assert('T-6  coverage line present: ' + line, coverage.lines.indexOf(line) !== -1);
    });

    var handoff = API.buildDetail('handoff', {
        acceptance: {
            decision: 'accepted_with_warnings',
            decision_label_en: 'Accepted with Warnings',
            receipt: { package_fingerprint: 'pkg-a', fingerprint_match: false }
        }
    }, { label_en: 'Accepted with Warnings', cls: 'warnings' });
    assert('T-7  handoff title includes decision label', handoff.title === 'Handoff: Accepted with Warnings');
    assert('T-8  handoff fingerprint mismatch shown', handoff.lines.indexOf('Package fingerprint: mismatch') !== -1);
    assert('T-9  handoff latest receipt shown', handoff.lines.indexOf('Latest receipt available') !== -1);

    var closeout = API.buildDetail('closeout', {
        closeout: {
            status_label_en: 'Ready with Exceptions',
            counts: { deferred: 2, fixed_externally: 1, needs_review: 0 },
            fixed_externally_without_note: []
        }
    }, { label_en: 'Ready with Exceptions', cls: 'warnings' });
    assert('T-10 closeout title includes status', closeout.title === 'Closeout: Ready with Exceptions');
    assert('T-11 closeout deferred count shown', closeout.lines.indexOf('Deferred issues: 2') !== -1);
    assert('T-12 closeout fixed externally count shown', closeout.lines.indexOf('Fixed externally: 1') !== -1);
    assert('T-13 closeout verification notes shown', closeout.lines.indexOf('Verification notes: present') !== -1);
})();

console.log('\n--- QA-122: rendering, severity metadata, docs, and boundaries ---');
(function () {
    var html = API.renderDetailHtml({
        title: 'Release: Not Ready',
        kicker: 'Reason:',
        cls: 'not-ready',
        lines: ['2 unresolved issues', 'Fingerprint mismatch']
    });
    assert('T-1  render includes compact title and list', html.indexOf('release-hud-detail-title') !== -1 && html.indexOf('<li>2 unresolved issues</li>') !== -1);
    assert('T-2  severity metadata written by enhancer', script.indexOf('data-scenario-status-severity') !== -1 && script.indexOf('data-scenario-status-rank') !== -1);

    var inventory = src(INVENTORY);
    var runbook = src(RUNBOOK);
    assert('T-3  inventory documents v14', inventory.indexOf('scenario-evidence v14') !== -1 && inventory.indexOf('Offline sync/testing: pending by user instruction') !== -1);
    assert('T-4  runbook documents hover/focus details', runbook.indexOf('Header Status Details (Batch 14)') !== -1 && runbook.indexOf('Tab / Shift+Tab') !== -1);

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
