/* ============================================================================
 * test-scenario-evidence-status-hud-batch-1.js - RMOOZ-SCENARIO-QA-BATCH-13
 * ----------------------------------------------------------------------------
 * Headless gate for the Scenario Status Header Cluster: release, closeout,
 * coverage, and handoff chips, chip-to-drawer navigation targets, selected-unit
 * boundary preservation, drawer grouping, docs, and no mutation surfaces.
 * Main app only: offline sync/testing is pending by user instruction.
 * ========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var SHELL = path.join(ROOT, 'UI_MOdified', 'client', 'shell');
var APP = path.join(ROOT, 'UI_MOdified', 'client', 'app.html');
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

console.log('\n=== RMOOZ-SCENARIO-QA-BATCH-13 Scenario Status Header Cluster ===\n');

var RH = requireFresh('scenario-evidence-release-hud.js');

function sampleCluster() {
    return RH.buildCluster({
        release_gate: {
            status: 'not_ready',
            status_label_en: 'Not Ready',
            status_label_ar: '&#1594;&#1610;&#1585; &#1580;&#1575;&#1607;&#1586;',
            scenario_fingerprint: 'scenario-status'
        },
        closeout: {
            status: 'needs_review',
            status_label_en: 'Needs Review',
            status_label_ar: '&#1610;&#1581;&#1578;&#1575;&#1580; &#1605;&#1585;&#1575;&#1580;&#1593;&#1577;'
        },
        coverage: {
            total: 9,
            coverage_pct: 78,
            verdict: { label_en: 'Partial Coverage', label_ar: '&#1578;&#1594;&#1591;&#1610;&#1577; &#1580;&#1586;&#1574;&#1610;&#1577;' }
        },
        acceptance: {
            decision: 'accepted_with_warnings',
            decision_label_en: 'Accepted with Warnings',
            decision_label_ar: '&#1605;&#1602;&#1576;&#1608;&#1604; &#1605;&#1593; &#1578;&#1581;&#1584;&#1610;&#1585;&#1575;&#1578;'
        }
    });
}

console.log('--- QA-116: cluster chips render ---');
(function () {
    assert('T-1  HUD module exposes cluster API', !!RH && typeof RH.buildCluster === 'function' && typeof RH.renderClusterHtml === 'function');
    var cluster = sampleCluster();
    assert('T-2  release chip renders status', cluster.release.label_en === 'Not Ready' && cluster.release.cls === 'not-ready');
    assert('T-3  closeout chip renders status', cluster.closeout.label_en === 'Needs Review' && cluster.closeout.cls === 'not-ready');
    assert('T-4  coverage chip renders percent', cluster.coverage.label_en === '78%' && cluster.coverage.cls === 'warnings');
    assert('T-5  handoff chip renders status', cluster.handoff.label_en === 'Accepted with Warnings' && cluster.handoff.cls === 'warnings');
    var html = RH.renderClusterHtml(cluster);
    ['Release', 'Closeout', 'Coverage', 'Handoff'].forEach(function (label) {
        assert('T-6  visible chip label: ' + label, html.indexOf('>' + label + '<') !== -1);
    });
    ['&#1575;&#1604;&#1575;&#1593;&#1578;&#1605;&#1575;&#1583;', '&#1575;&#1604;&#1573;&#1594;&#1604;&#1575;&#1602;', '&#1575;&#1604;&#1578;&#1594;&#1591;&#1610;&#1577;', '&#1575;&#1604;&#1578;&#1587;&#1604;&#1610;&#1605;'].forEach(function (label) {
        assert('T-7  Arabic chip label present: ' + label, html.indexOf(label) !== -1);
    });
    ['data-scenario-status-open="release"', 'data-scenario-status-open="closeout"', 'data-scenario-status-open="coverage"', 'data-scenario-status-open="handoff"'].forEach(function (attr) {
        assert('T-8  chip click target present: ' + attr, html.indexOf(attr) !== -1);
    });
})();

console.log('\n--- QA-117: chip clicks route to drawer targets ---');
(function () {
    var callbacks = [];
    var buttons = [];
    function button(target) {
        return {
            _target: target,
            getAttribute: function (name) { return name === 'data-scenario-status-open' ? target : null; },
            addEventListener: function (ev, fn) { this._fn = fn; }
        };
    }
    buttons = ['release', 'closeout', 'coverage', 'handoff'].map(button);
    var mount = {
        innerHTML: '',
        _hidden: true,
        removeAttribute: function (name) { if (name === 'hidden') this._hidden = false; },
        setAttribute: function (name) { if (name === 'hidden') this._hidden = true; },
        querySelectorAll: function (sel) { return sel === '[data-scenario-status-open]' ? buttons : []; }
    };
    var ret = RH.update(mount, sampleCluster(), {
        onOpenTarget: function (target, chip) { callbacks.push({ target: target, chip: chip }); }
    });
    assert('T-1  update renders cluster into mount', mount.innerHTML.indexOf('data-scenario-status-hud') !== -1);
    assert('T-2  update reveals mount', mount._hidden === false);
    assert('T-3  update preserves legacy return chip', ret && ret.target === 'release');
    buttons.forEach(function (btn) { btn._fn({ preventDefault: function () {} }); });
    assert('T-4  all four chip clicks reported', callbacks.map(function (c) { return c.target; }).join('|') === 'release|closeout|coverage|handoff');
    assert('T-5  coverage click carries coverage chip', callbacks[2].chip && callbacks[2].chip.label_en === '78%');
})();

console.log('\n--- QA-118: panel routing, grouping, selected-unit boundary ---');
(function () {
    var panel = src(path.join(SHELL, 'unit-status-panel.js'));
    assert('T-1  panel defines status target map', panel.indexOf('SCENARIO_EVIDENCE_STATUS_TARGETS') !== -1);
    [
        ["release:  { group: 'overview', block: 'usp-release-gate-block'"],
        ["closeout: { group: 'qa',       block: 'usp-review-closeout-block'"],
        ["coverage: { group: 'overview', block: 'usp-evidence-coverage-block'"],
        ["handoff:  { group: 'handoff',  block: 'usp-handoff-acceptance-block'"]
    ].forEach(function (needle) {
        assert('T-2  route target present: ' + needle[0], panel.indexOf(needle[0]) !== -1);
    });
    assert('T-3  generic opener exposed', panel.indexOf('openScenarioEvidenceTarget: openScenarioEvidenceTarget') !== -1);
    assert('T-4  opener opens drawer and focuses block', panel.indexOf('openScenarioEvidencePanel()') !== -1 && panel.indexOf('focusScenarioEvidenceBlock') !== -1);
    assert('T-5  HUD reads all four status surfaces', ['_scenarioEvidenceReleaseGate', '_scenarioReviewCloseout', '_cmoEvidenceCoverage', '_scenarioEvidenceHandoffAcceptance'].every(function (n) { return panel.indexOf(n) !== -1; }));
    assert('T-6  Unit Status selected-unit sections stay out of drawer groups',
        panel.slice(panel.indexOf('SCENARIO_EVIDENCE_GROUPS = ['), panel.indexOf('function toggleScenarioEvidenceGroup')).indexOf('usp-contact-evidence-block') === -1 &&
        panel.indexOf('function populateContactEvidence') !== -1);
    assert('T-7  Scenario Evidence drawer remains grouped', ['overview', 'qa', 'handoff', 'force'].every(function (k) { return panel.indexOf("key: '" + k + "'") !== -1; }));
})();

console.log('\n--- QA-119: app shell, docs, main-only scope, boundaries ---');
(function () {
    var html = src(APP);
    assert('T-1  app shell has scenario status mount', html.indexOf('id="release-hud-mount"') !== -1 && html.indexOf('Scenario evidence status') !== -1);
    assert('T-2  app shell has cluster CSS', html.indexOf('.release-hud-cluster') !== -1 && html.indexOf('RMOOZ-QA-BATCH-13') !== -1);
    assert('T-3  app shell loads existing HUD module', html.indexOf('scenario-evidence-release-hud.js') !== -1);
    var inventory = src(path.join(ROOT, 'APP_INVENTORY.md'));
    var runbook = src(path.join(DOCS, 'cmo-evidence-demo-runbook.md'));
    var handoff = src(path.join(DOCS, 'cmo-evidence-demo-handoff.md'));
    assert('T-4  inventory documents v13 cluster', inventory.indexOf('scenario-evidence v13') !== -1 && inventory.indexOf('Scenario Status Header Cluster') !== -1);
    assert('T-5  inventory records offline sync/testing pending', inventory.indexOf('Offline sync/testing: pending by user instruction') !== -1);
    assert('T-6  runbook documents all chip routes', ['Evidence Release Gate', 'Evidence Review Closeout', 'Evidence Coverage', 'Handoff Acceptance'].every(function (n) { return runbook.indexOf(n) !== -1; }));
    assert('T-7  handoff doc documents display/navigation boundary', handoff.indexOf('display/navigation only') !== -1);

    var sources = [
        'scenario-evidence-release-hud.js',
        'unit-status-panel.js'
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
