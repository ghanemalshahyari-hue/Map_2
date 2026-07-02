/* ============================================================================
 * test-cmo-actionability-batch-gate-1.js — RMOOZ-CMO-BATCH-17-24 gate test
 * ----------------------------------------------------------------------------
 * Static headless gate (no server). Verifies:
 *   CMO-17  cmo-recommendation-drilldown.js  buildDrilldown / renderDrilldownHtml
 *   CMO-18  cmo-alternative-shooters.js      buildAlternatives / renderAlternativesHtml
 *   CMO-19  cmo-blocker-remediation.js        buildRemediation / renderRemediationHtml
 *   CMO-20  cmo-evidence-coverage.js          buildCoverage / renderCoverageHtml
 *   CMO-21  cmo-commander-brief.js            buildBrief / renderBriefHtml
 *   CMO-22  cmo-evidence-export.js            buildSnapshot includes drilldown field
 *   CMO-23  cmo-force-evidence-report.js      buildReport includes coverage field
 *   CMO-24  unit-status-panel.js              4 new populate functions present
 * ========================================================================== */
'use strict';

var path = require('path');
var fs   = require('fs');

var SHELL = path.join(__dirname, 'UI_MOdified', 'client', 'shell');

var passed = 0;
var failed = 0;

function assert(label, cond) {
    if (cond) {
        console.log('  PASS  ' + label);
        passed++;
    } else {
        console.error('  FAIL  ' + label);
        failed++;
    }
}

function requireModule(name) {
    return require(path.join(SHELL, name));
}

console.log('\n=== CMO Actionability Batch Gate 1 ===\n');

/* ─── CMO-17: recommendation drilldown ─────────────────────────────────── */
console.log('--- CMO-17: cmo-recommendation-drilldown ---');
(function () {
    var DRILL = requireModule('cmo-recommendation-drilldown.js');
    assert('T-1  module loads', !!DRILL);
    assert('T-2  buildDrilldown is a function', typeof DRILL.buildDrilldown === 'function');
    assert('T-3  renderDrilldownHtml is a function', typeof DRILL.renderDrilldownHtml === 'function');
    var d = DRILL.buildDrilldown({});
    assert('T-4  buildDrilldown({}) returns object with version', d && typeof d.version === 'string' && d.version.indexOf('cmo-17') !== -1);
    assert('T-5  buildDrilldown has checks array', d && Array.isArray(d.checks));
    assert('T-6  buildDrilldown has title_en', d && typeof d.title_en === 'string' && d.title_en.length > 0);
    var html = DRILL.renderDrilldownHtml(d);
    assert('T-7  renderDrilldownHtml returns non-empty string', typeof html === 'string' && html.length > 10);
    assert('T-8  renderDrilldownHtml has no raw <script>', html.indexOf('<script') === -1);
    var dOor = DRILL.buildDrilldown({ blocking_reason_code: 'out_of_range' });
    assert('T-9  out_of_range reason resolves correct drilldown', dOor && dOor.title_en === 'Target Out of Weapon Range');
    assert('T-10 DRILLDOWN_CONTEXT object is exported', DRILL.DRILLDOWN_CONTEXT && typeof DRILL.DRILLDOWN_CONTEXT === 'object');
})();

/* ─── CMO-18: alternative shooters ─────────────────────────────────────── */
console.log('\n--- CMO-18: cmo-alternative-shooters ---');
(function () {
    var ALT = requireModule('cmo-alternative-shooters.js');
    assert('T-1  module loads', !!ALT);
    assert('T-2  buildAlternatives is a function', typeof ALT.buildAlternatives === 'function');
    assert('T-3  renderAlternativesHtml is a function', typeof ALT.renderAlternativesHtml === 'function');
    var r = ALT.buildAlternatives(null, null);
    assert('T-4  buildAlternatives(null,null) returns object with version', r && typeof r.version === 'string' && r.version.indexOf('cmo-18') !== -1);
    assert('T-5  alternatives is an array', r && Array.isArray(r.alternatives));
    assert('T-6  total_ready is a number', r && typeof r.total_ready === 'number');
    assert('T-7  total_checked is a number', r && typeof r.total_checked === 'number');
    var fakeMatrix = {
        rows: [
            { uid: 'U1', unit_label: 'Striker-1', side: 'RED', final_status: 'Ready', contact_status: 'Detected', weapon: 'SAM' },
            { uid: 'U2', unit_label: 'Striker-2', side: 'RED', final_status: 'Blocked', contact_status: 'Unknown', reason_code: 'out_of_range' },
            { uid: 'U3', unit_label: 'Striker-3', side: 'BLUE', final_status: 'Ready', contact_status: 'Detected', weapon: 'Missile' }
        ]
    };
    var r2 = ALT.buildAlternatives(null, 'U2', { matrix: fakeMatrix, side: 'RED' });
    assert('T-8  finds same-side ready unit only', r2.alternatives.length === 1 && r2.alternatives[0].uid === 'U1');
    var html = ALT.renderAlternativesHtml(r2);
    assert('T-9  renderAlternativesHtml returns string', typeof html === 'string' && html.length > 10);
    assert('T-10 renderAlternativesHtml has no raw <script>', html.indexOf('<script') === -1);
})();

/* ─── CMO-19: blocker remediation ──────────────────────────────────────── */
console.log('\n--- CMO-19: cmo-blocker-remediation ---');
(function () {
    var REM = requireModule('cmo-blocker-remediation.js');
    assert('T-1  module loads', !!REM);
    assert('T-2  buildRemediation is a function', typeof REM.buildRemediation === 'function');
    assert('T-3  renderRemediationHtml is a function', typeof REM.renderRemediationHtml === 'function');
    var r = REM.buildRemediation(null);
    assert('T-4  buildRemediation(null) returns object with version', r && typeof r.version === 'string' && r.version.indexOf('cmo-19') !== -1);
    assert('T-5  groups is an array', r && Array.isArray(r.groups));
    assert('T-6  total_blocked is a number', r && typeof r.total_blocked === 'number');
    var fakeMatrix = {
        rows: [
            { uid: 'U1', unit_label: 'A', final_status: 'Blocked', reason_code: 'out_of_range' },
            { uid: 'U2', unit_label: 'B', final_status: 'Blocked', reason_code: 'out_of_range' },
            { uid: 'U3', unit_label: 'C', final_status: 'Blocked', reason_code: 'winchester' },
            { uid: 'U4', unit_label: 'D', final_status: 'Ready' }
        ]
    };
    var r2 = REM.buildRemediation(null, { matrix: fakeMatrix });
    assert('T-7  groups two distinct reason codes', r2.groups.length === 2);
    assert('T-8  top_blocker is out_of_range (most blocked)', r2.top_blocker === 'out_of_range');
    assert('T-9  total_blocked = 3', r2.total_blocked === 3);
    var html = REM.renderRemediationHtml(r2);
    assert('T-10 renderRemediationHtml returns string with no <script>', typeof html === 'string' && html.indexOf('<script') === -1);
    assert('T-11 REMEDIATION_STEPS exported', REM.REMEDIATION_STEPS && typeof REM.REMEDIATION_STEPS === 'object');
})();

/* ─── CMO-20: evidence coverage ────────────────────────────────────────── */
console.log('\n--- CMO-20: cmo-evidence-coverage ---');
(function () {
    var COV = requireModule('cmo-evidence-coverage.js');
    assert('T-1  module loads', !!COV);
    assert('T-2  buildCoverage is a function', typeof COV.buildCoverage === 'function');
    assert('T-3  renderCoverageHtml is a function', typeof COV.renderCoverageHtml === 'function');
    assert('T-4  coverageVerdict is a function', typeof COV.coverageVerdict === 'function');
    var r = COV.buildCoverage(null);
    assert('T-5  buildCoverage(null) returns object with version', r && typeof r.version === 'string' && r.version.indexOf('cmo-20') !== -1);
    assert('T-6  coverage_pct is a number', r && typeof r.coverage_pct === 'number');
    assert('T-7  verdict is an object with code', r && r.verdict && typeof r.verdict.code === 'string');
    var fakeMatrix = { counts: { Ready: 8, Blocked: 4, Unknown: 2 }, rows: [], top_blockers: [] };
    var fakeAlerts = { no_contact_count: 1 };
    var r2 = COV.buildCoverage(null, { matrix: fakeMatrix, alerts: fakeAlerts });
    assert('T-8  total = 14', r2.total === 14);
    assert('T-9  coverage_pct = 86 (12/14 have evidence)', r2.coverage_pct === 86);
    assert('T-10 coverageVerdict(86) = high', COV.coverageVerdict(86).code === 'high');
    assert('T-11 coverageVerdict(55) = medium', COV.coverageVerdict(55).code === 'medium');
    assert('T-12 coverageVerdict(30) = low', COV.coverageVerdict(30).code === 'low');
    var html = COV.renderCoverageHtml(r2);
    assert('T-13 renderCoverageHtml returns string with no <script>', typeof html === 'string' && html.indexOf('<script') === -1);
})();

/* ─── CMO-21: commander brief ──────────────────────────────────────────── */
console.log('\n--- CMO-21: cmo-commander-brief ---');
(function () {
    var CB = requireModule('cmo-commander-brief.js');
    assert('T-1  module loads', !!CB);
    assert('T-2  buildBrief is a function', typeof CB.buildBrief === 'function');
    assert('T-3  renderBriefHtml is a function', typeof CB.renderBriefHtml === 'function');
    assert('T-4  HEADLINE_STATUS exported', CB.HEADLINE_STATUS && typeof CB.HEADLINE_STATUS === 'object');
    var r = CB.buildBrief(null, null);
    assert('T-5  buildBrief(null,null) returns object with version', r && typeof r.version === 'string' && r.version.indexOf('cmo-21') !== -1);
    assert('T-6  headline_status has code', r && r.headline_status && typeof r.headline_status.code === 'string');
    assert('T-7  coverage object present', r && r.coverage && typeof r.coverage.pct === 'number');
    assert('T-8  quality object present', r && r.quality && typeof r.quality.status === 'string');
    assert('T-9  alerts object present', r && r.alerts && typeof r.alerts.count === 'number');
    var fakeMatrix = { counts: { Ready: 12, Blocked: 0, Unknown: 0 }, rows: [], top_blockers: [] };
    var fakeCoverage = { total: 12, ready: 12, blocked: 0, unknown: 0, coverage_pct: 100, verdict: { code: 'high', label_en: 'High Coverage', label_ar: '' } };
    var fakeAlerts = { no_contact_count: 0, alerts: [] };
    var fakeQuality = { status: 'Pass', pass: true };
    var r2 = CB.buildBrief(null, null, { matrix: fakeMatrix, coverage: fakeCoverage, alerts: fakeAlerts, quality: fakeQuality });
    assert('T-10 all-ready scenario → ready_for_review headline', r2.headline_status.code === 'ready_for_review');
    var html = CB.renderBriefHtml(r2);
    assert('T-11 renderBriefHtml returns string with no <script>', typeof html === 'string' && html.indexOf('<script') === -1);
})();

/* ─── CMO-22: export snapshot includes drilldown ───────────────────────── */
console.log('\n--- CMO-22: cmo-evidence-export drilldown field ---');
(function () {
    var EX = requireModule('cmo-evidence-export.js');
    assert('T-1  module loads', !!EX);
    assert('T-2  buildSnapshot is a function', typeof EX.buildSnapshot === 'function');
    var snap = EX.buildSnapshot(null, null, { uid: 'TEST-1' });
    assert('T-3  buildSnapshot returns object', snap && typeof snap === 'object');
    assert('T-4  snapshot has drilldown field (may be null without deps)', 'drilldown' in snap);
})();

/* ─── CMO-23: force report includes coverage field ─────────────────────── */
console.log('\n--- CMO-23: cmo-force-evidence-report coverage field ---');
(function () {
    var RP = requireModule('cmo-force-evidence-report.js');
    assert('T-1  module loads', !!RP);
    assert('T-2  buildReport is a function', typeof RP.buildReport === 'function');
    var report = RP.buildReport(null, {});
    assert('T-3  buildReport returns object', report && typeof report === 'object');
    assert('T-4  report has coverage field (may be null without deps)', 'coverage' in report);
})();

/* ─── CMO-24: unit-status-panel has 4 new populate functions ────────────── */
console.log('\n--- CMO-24: unit-status-panel new populate functions ---');
(function () {
    var uspPath = path.join(SHELL, 'unit-status-panel.js');
    var src = fs.readFileSync(uspPath, 'utf8');
    assert('T-1  populateCommanderBrief is defined', src.indexOf('function populateCommanderBrief') !== -1);
    assert('T-2  populateEvidenceCoverage is defined', src.indexOf('function populateEvidenceCoverage') !== -1);
    assert('T-3  populateBlockerRemediation is defined', src.indexOf('function populateBlockerRemediation') !== -1);
    assert('T-4  populateAlternativeShooters is defined', src.indexOf('function populateAlternativeShooters') !== -1);
    assert('T-5  populateCommanderBrief is called in populatePanel', src.indexOf('populateCommanderBrief(unit)') !== -1);
    assert('T-6  populateEvidenceCoverage is called before populateEvidenceReadinessMatrix',
        src.indexOf('populateEvidenceCoverage') < src.indexOf('populateEvidenceReadinessMatrix'));
    assert('T-7  populateBlockerRemediation is called before populateForceEvidenceFeed',
        src.indexOf('populateBlockerRemediation') < src.indexOf('populateForceEvidenceFeed'));
    assert('T-8  populateAlternativeShooters is called before populateEvidenceTimeline',
        src.indexOf('populateAlternativeShooters') < src.indexOf('populateEvidenceTimeline'));
    assert('T-9  RmoozCmoCommanderBrief referenced in populate', src.indexOf('RmoozCmoCommanderBrief') !== -1);
    assert('T-10 RmoozCmoEvidenceCoverage referenced in populate', src.indexOf('RmoozCmoEvidenceCoverage') !== -1);
    assert('T-11 RmoozCmoBlockerRemediation referenced in populate', src.indexOf('RmoozCmoBlockerRemediation') !== -1);
    assert('T-12 RmoozCmoAlternativeShooters referenced in populate', src.indexOf('RmoozCmoAlternativeShooters') !== -1);
})();

/* ─── Boundary check: no prohibited patterns ────────────────────────────── */
console.log('\n--- Boundary check: no prohibited code in new modules ---');
(function () {
    var newModules = [
        'cmo-recommendation-drilldown.js',
        'cmo-alternative-shooters.js',
        'cmo-blocker-remediation.js',
        'cmo-evidence-coverage.js',
        'cmo-commander-brief.js'
    ];
    var prohibited = [
        { label: 'fetch(', pat: 'fetch(' },
        { label: 'XMLHttpRequest', pat: 'XMLHttpRequest' },
        { label: '/api/', pat: "'/api/" },
        { label: 'window.units mutation', pat: 'window.units =' },
        { label: 'scenario contract mutation', pat: 'scenario_contract' }
    ];
    newModules.forEach(function (modName) {
        var src = fs.readFileSync(path.join(SHELL, modName), 'utf8');
        prohibited.forEach(function (p) {
            assert(modName + ' has no ' + p.label, src.indexOf(p.pat) === -1);
        });
    });
})();

/* ─── Result ──────────────────────────────────────────────────────────── */
console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');
if (failed > 0) process.exit(1);
