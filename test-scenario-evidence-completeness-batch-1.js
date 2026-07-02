/* ============================================================================
 * test-scenario-evidence-completeness-batch-1.js — RMOOZ-SCENARIO-QA-BATCH-1
 * ----------------------------------------------------------------------------
 * Static headless gate (no server). Verifies:
 *   CMO-25  scenario-evidence-completeness.js  buildCompleteness / renderCompletenessHtml
 *   CMO-26  scenario-evidence-normalizer.js    normalizeWorldState / describeNormalizations
 *   CMO-27  objective-x-evidence-health.js     buildObjectiveHealth / renderObjectiveHealthHtml
 *   CMO-28  cmo-force-evidence-report.js       buildReport includes completeness field
 *   CMO-29  unit-status-panel.js               2 new populate functions present + call order
 * Boundary: no prohibited patterns in new modules
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

console.log('\n=== RMOOZ-SCENARIO-QA-BATCH-1 Gate Test ===\n');

/* ─── CMO-25: scenario evidence completeness ────────────────────────────── */
console.log('--- CMO-25: scenario-evidence-completeness ---');
(function () {
    var SEV = requireModule('scenario-evidence-completeness.js');
    assert('T-1  module loads', !!SEV);
    assert('T-2  buildCompleteness is a function', typeof SEV.buildCompleteness === 'function');
    assert('T-3  renderCompletenessHtml is a function', typeof SEV.renderCompletenessHtml === 'function');

    var r = SEV.buildCompleteness(null);
    assert('T-4  buildCompleteness(null) returns object with version', r && typeof r.version === 'string' && r.version.indexOf('cmo-25') !== -1);
    assert('T-5  total_checked is a number', r && typeof r.total_checked === 'number');
    assert('T-6  complete + needs_review = total_checked', r && (r.complete + r.needs_review) === r.total_checked);
    assert('T-7  verdict is a string', r && typeof r.verdict === 'string');

    // Full unit — should be complete
    var wsComplete = {
        units: [{
            uid: 'U1', side: 'RED', role: 'SAM', lat: 24.0, lng: 46.0, label: 'Striker-1'
        }]
    };
    var fakeMatrix = {
        rows: [{
            uid: 'U1', unit_label: 'Striker-1', side: 'RED',
            contact_status: 'Detected', final_status: 'Ready',
            reason_code: null, weapon: 'Missile'
        }]
    };
    var r2 = SEV.buildCompleteness(wsComplete, { matrix: fakeMatrix });
    assert('T-8  complete unit counts as complete', r2.total_checked === 1 && r2.complete === 1);
    assert('T-9  complete unit → verdict complete', r2.verdict === 'complete');

    // Unit missing side and coords
    var wsMissing = {
        units: [{ uid: 'U2', label: 'Ghost' }]
    };
    var fakeMatrix2 = {
        rows: [{
            uid: 'U2', unit_label: 'Ghost',
            contact_status: 'Unknown', final_status: 'Unknown',
            reason_code: 'no_contact_evidence', weapon: null
        }]
    };
    var r3 = SEV.buildCompleteness(wsMissing, { matrix: fakeMatrix2 });
    assert('T-10 incomplete unit counts as needs_review', r3.needs_review >= 1);
    assert('T-11 no_contact tracked', r3.no_contact >= 1);
    assert('T-12 missing_weapon tracked', r3.missing_weapon >= 1);

    // 12 complete + 2 missing → mostly_complete (≥75%)
    var wsLarge = { units: [] };
    var fakeMatrixLarge = { rows: [] };
    for (var i = 0; i < 12; i++) {
        wsLarge.units.push({ uid: 'C' + i, side: 'RED', role: 'inf', lat: 24, lng: 46, label: 'C' + i });
        fakeMatrixLarge.rows.push({ uid: 'C' + i, contact_status: 'Detected', final_status: 'Ready', reason_code: null, weapon: 'Rifle' });
    }
    for (var j = 0; j < 2; j++) {
        wsLarge.units.push({ uid: 'M' + j, label: 'M' + j });
        fakeMatrixLarge.rows.push({ uid: 'M' + j, contact_status: 'Unknown', final_status: 'Unknown', reason_code: 'no_contact_evidence', weapon: null });
    }
    var r4 = SEV.buildCompleteness(wsLarge, { matrix: fakeMatrixLarge });
    assert('T-13 12/14 complete → mostly_complete', r4.verdict === 'mostly_complete');

    var html = SEV.renderCompletenessHtml(r2);
    assert('T-14 renderCompletenessHtml returns non-empty string', typeof html === 'string' && html.length > 20);
    assert('T-15 renderCompletenessHtml has no raw <script>', html.indexOf('<script') === -1);
})();

/* ─── CMO-26: scenario evidence normalizer ──────────────────────────────── */
console.log('\n--- CMO-26: scenario-evidence-normalizer ---');
(function () {
    var NORM = requireModule('scenario-evidence-normalizer.js');
    assert('T-1  module loads', !!NORM);
    assert('T-2  normalizeWorldState is a function', typeof NORM.normalizeWorldState === 'function');
    assert('T-3  describeNormalizations is a function', typeof NORM.describeNormalizations === 'function');
    assert('T-4  DEFAULTS exported', NORM.DEFAULTS && typeof NORM.DEFAULTS === 'object');
    assert('T-5  DEFAULTS.side is a string', typeof NORM.DEFAULTS.side === 'string');

    var r = NORM.normalizeWorldState(null);
    assert('T-6  normalizeWorldState(null) returns object with version', r && typeof r.version === 'string' && r.version.indexOf('cmo-26') !== -1);
    assert('T-7  result has normalized_ws', r && r.normalized_ws && typeof r.normalized_ws === 'object');
    assert('T-8  result has actions array', r && Array.isArray(r.actions));
    assert('T-9  fields_normalized is a number', r && typeof r.fields_normalized === 'number');

    // Unit missing side → normalized gets side = DEFAULTS.side
    var wsOrig = { units: [{ uid: 'U1', lat: 24, lng: 46, role: 'inf', label: 'U1' }] };
    var result = NORM.normalizeWorldState(wsOrig);
    assert('T-10 missing side → normalized unit gets side default',
        result.normalized_ws.units[0].side === NORM.DEFAULTS.side);
    assert('T-11 original WS not mutated — original unit has no side',
        !wsOrig.units[0].side);
    assert('T-12 action logged for side normalization',
        result.actions.some(function (a) { return a.field === 'side' && a.uid === 'U1'; }));

    // Unit missing coord → needs_placement = true
    var wsNoCoord = { units: [{ uid: 'U2', side: 'BLUE', role: 'inf', label: 'U2' }] };
    var r2 = NORM.normalizeWorldState(wsNoCoord);
    assert('T-13 missing coord → needs_placement = true in normalized copy',
        r2.normalized_ws.units[0].needs_placement === true);
    assert('T-14 original WS not mutated — no needs_placement on original',
        !wsNoCoord.units[0].needs_placement);

    var descs = NORM.describeNormalizations(result);
    assert('T-15 describeNormalizations returns array', Array.isArray(descs));
    assert('T-16 description entries have field + count', descs.length > 0 && typeof descs[0].field === 'string' && typeof descs[0].count === 'number');
})();

/* ─── CMO-27: objective X evidence health ───────────────────────────────── */
console.log('\n--- CMO-27: objective-x-evidence-health ---');
(function () {
    var OH = requireModule('objective-x-evidence-health.js');
    assert('T-1  module loads', !!OH);
    assert('T-2  buildObjectiveHealth is a function', typeof OH.buildObjectiveHealth === 'function');
    assert('T-3  renderObjectiveHealthHtml is a function', typeof OH.renderObjectiveHealthHtml === 'function');
    assert('T-4  CHECKS exported', OH.CHECKS && Array.isArray(OH.CHECKS));
    assert('T-5  CHECKS has 6 items', OH.CHECKS.length === 6);

    var r = OH.buildObjectiveHealth(null, null);
    assert('T-6  buildObjectiveHealth(null,null) returns object with version',
        r && typeof r.version === 'string' && r.version.indexOf('cmo-27') !== -1);
    assert('T-7  checks is an array', r && Array.isArray(r.checks));
    assert('T-8  pass_count + (total - pass_count) = total_checks',
        r && typeof r.pass_count === 'number' && r.pass_count <= r.total_checks);
    assert('T-9  health_score is a number 0-100',
        r && typeof r.health_score === 'number' && r.health_score >= 0 && r.health_score <= 100);
    assert('T-10 health_status is a string', r && typeof r.health_status === 'string');

    // Healthy world state
    var wsHealthy = {
        objective: { name: 'Objective Alpha', id: 'OBJ-1' },
        red_units:  [{ uid: 'R1', side: 'RED', lat: 24, lng: 46 }],
        blue_units: [{ uid: 'B1', side: 'BLUE', lat: 24.1, lng: 46.1 }]
    };
    var fakeMatrix = {
        rows: [
            { uid: 'R1', contact_status: 'Detected', final_status: 'Ready', reason_code: null },
            { uid: 'B1', contact_status: 'Detected', final_status: 'Blocked', reason_code: 'out_of_range' }
        ]
    };
    var r2 = OH.buildObjectiveHealth(wsHealthy, { matrix: fakeMatrix });
    assert('T-11 objective_exists passes when ws.objective set',
        r2.checks.filter(function (c) { return c.key === 'objective_exists'; })[0].pass === true);
    assert('T-12 red_units_exist passes when red_units populated',
        r2.checks.filter(function (c) { return c.key === 'red_units_exist'; })[0].pass === true);
    assert('T-13 blue_units_exist passes when blue_units populated',
        r2.checks.filter(function (c) { return c.key === 'blue_units_exist'; })[0].pass === true);
    assert('T-14 engagement_candidates passes when Ready/Blocked rows exist',
        r2.checks.filter(function (c) { return c.key === 'engagement_candidates'; })[0].pass === true);
    assert('T-15 matrix_can_populate passes when rows exist',
        r2.checks.filter(function (c) { return c.key === 'matrix_can_populate'; })[0].pass === true);
    assert('T-16 all-healthy → health_status healthy or mostly_healthy',
        r2.health_status === 'healthy' || r2.health_status === 'mostly_healthy');

    var html = OH.renderObjectiveHealthHtml(r2);
    assert('T-17 renderObjectiveHealthHtml returns non-empty string', typeof html === 'string' && html.length > 20);
    assert('T-18 renderObjectiveHealthHtml has no raw <script>', html.indexOf('<script') === -1);
})();

/* ─── CMO-28: force report includes completeness field ──────────────────── */
console.log('\n--- CMO-28: cmo-force-evidence-report completeness field ---');
(function () {
    var RP = requireModule('cmo-force-evidence-report.js');
    assert('T-1  module loads', !!RP);
    assert('T-2  buildReport is a function', typeof RP.buildReport === 'function');
    var report = RP.buildReport(null, {});
    assert('T-3  buildReport returns object', report && typeof report === 'object');
    assert('T-4  report has completeness field (may be null without deps)', 'completeness' in report);
    assert('T-5  buildSummary includes Completeness section when completeness present',
        (function () {
            var fakeReport = {
                counts: { Ready: 3, Blocked: 1, Unknown: 0 },
                no_contact_count: 0,
                top_blockers: [],
                readiness_rows: [],
                force_events: [],
                completeness: {
                    total_checked: 4, complete: 3, needs_review: 1,
                    no_contact: 0, missing_weapon: 1, missing_range: 0,
                    missing_side: 0, missing_coordinates: 0, verdict: 'mostly_complete'
                }
            };
            var summary = RP.buildSummary(fakeReport);
            return summary.indexOf('Scenario Evidence Completeness') !== -1;
        }()));
})();

/* ─── CMO-29: unit-status-panel new populate functions ──────────────────── */
console.log('\n--- CMO-29: unit-status-panel completeness + health populate ---');
(function () {
    var uspPath = path.join(SHELL, 'unit-status-panel.js');
    var src = fs.readFileSync(uspPath, 'utf8');
    assert('T-1  populateScenarioCompleteness is defined', src.indexOf('function populateScenarioCompleteness') !== -1);
    assert('T-2  populateObjectiveHealth is defined', src.indexOf('function populateObjectiveHealth') !== -1);
    assert('T-3  populateScenarioCompleteness called in populatePanel', src.indexOf('populateScenarioCompleteness(unit)') !== -1);
    assert('T-4  populateObjectiveHealth called in populatePanel', src.indexOf('populateObjectiveHealth(unit)') !== -1);
    assert('T-5  completeness called after commanderBrief',
        src.indexOf('populateCommanderBrief') < src.indexOf('populateScenarioCompleteness'));
    assert('T-6  objectiveHealth called after completeness',
        src.indexOf('populateScenarioCompleteness') < src.indexOf('populateObjectiveHealth'));
    assert('T-7  objectiveHealth called before qualityGate',
        src.indexOf('populateObjectiveHealth') < src.indexOf('populateEvidenceQualityGate'));
    assert('T-8  RmoozScenarioEvidenceCompleteness referenced', src.indexOf('RmoozScenarioEvidenceCompleteness') !== -1);
    assert('T-9  RmoozObjectiveXEvidenceHealth referenced', src.indexOf('RmoozObjectiveXEvidenceHealth') !== -1);
    assert('T-10 usp-scenario-completeness-block referenced', src.indexOf('usp-scenario-completeness-block') !== -1);
    assert('T-11 usp-objective-health-block referenced', src.indexOf('usp-objective-health-block') !== -1);
})();

/* ─── Boundary: no prohibited patterns in new modules ───────────────────── */
console.log('\n--- Boundary: no prohibited code in new modules ---');
(function () {
    var newModules = [
        'scenario-evidence-completeness.js',
        'scenario-evidence-normalizer.js',
        'objective-x-evidence-health.js'
    ];
    var prohibited = [
        { label: 'fetch(',             pat: 'fetch(' },
        { label: 'XMLHttpRequest',     pat: 'XMLHttpRequest' },
        { label: '/api/',              pat: "'/api/" },
        { label: 'window.units =',     pat: 'window.units =' },
        { label: 'scenario_contract',  pat: 'scenario_contract' }
    ];
    newModules.forEach(function (modName) {
        var src = fs.readFileSync(path.join(SHELL, modName), 'utf8');
        prohibited.forEach(function (p) {
            assert(modName + ' has no ' + p.label, src.indexOf(p.pat) === -1);
        });
    });
})();

/* ─── DOCX staging path not revived ─────────────────────────────────────── */
console.log('\n--- Docx staging path not revived ---');
(function () {
    var newModules = [
        'scenario-evidence-completeness.js',
        'scenario-evidence-normalizer.js',
        'objective-x-evidence-health.js'
    ];
    newModules.forEach(function (modName) {
        var src = fs.readFileSync(path.join(SHELL, modName), 'utf8');
        assert(modName + ' does not reference DOCX staging', src.indexOf('docx') === -1 && src.indexOf('staging') === -1);
    });
})();

/* ─── Offline mirror present ─────────────────────────────────────────────── */
console.log('\n--- Offline mirror check ---');
(function () {
    var OFF = path.join(__dirname, 'UI_MOdified', 'Offline_Deployment', 'offline_app', 'client', 'shell');
    var offModules = [
        'scenario-evidence-completeness.js',
        'scenario-evidence-normalizer.js',
        'objective-x-evidence-health.js',
        'cmo-force-evidence-report.js'
    ];
    offModules.forEach(function (modName) {
        assert('offline/' + modName + ' exists', fs.existsSync(path.join(OFF, modName)));
    });
    // Version strings match between main and offline
    offModules.forEach(function (modName) {
        var main = fs.readFileSync(path.join(SHELL, modName), 'utf8');
        var off  = fs.readFileSync(path.join(OFF, modName), 'utf8');
        assert('offline/' + modName + ' matches main version', main === off);
    });
})();

/* ─── Result ──────────────────────────────────────────────────────────────── */
console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');
if (failed > 0) process.exit(1);
