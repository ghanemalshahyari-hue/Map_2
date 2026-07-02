/* ============================================================================
 * test-scenario-evidence-repair-plan-batch-1.js — RMOOZ-SCENARIO-QA-BATCH-3
 * ----------------------------------------------------------------------------
 * Static headless gate (no server). Verifies:
 *   QA-36  scenario-evidence-repair-planner.js  buildRepairPlan + steps
 *   QA-37  renderRepairHtml preview cards
 *   QA-38  priority ranking (structural > advisory)
 *   QA-39  export JSON / text
 *   QA-40  Objective X repair readiness
 *   QA-41  cmo-force-evidence-report.js includes repair_plan
 *   QA-42  unit-status-panel.js wiring + order + both app.html
 *   Boundary: read-only, no backend/mutation/auto-fix/DOCX; WS untouched
 *   Offline mirror parity
 * ========================================================================== */
'use strict';

var path = require('path');
var fs   = require('fs');

var SHELL = path.join(__dirname, 'UI_MOdified', 'client', 'shell');
var OFF   = path.join(__dirname, 'UI_MOdified', 'Offline_Deployment', 'offline_app', 'client', 'shell');

var passed = 0, failed = 0;
function assert(label, cond) {
    if (cond) { console.log('  PASS  ' + label); passed++; }
    else { console.error('  FAIL  ' + label); failed++; }
}
function requireModule(name) { return require(path.join(SHELL, name)); }

var fakeMatrix = {
    version: 'x',
    counts: { Ready: 2, Blocked: 2, Unknown: 1 },
    top_blockers: [{ code: 'out_of_range', count: 1, label_ar: 'خارج المدى' }],
    rows: [
        { uid: 'U1', unit_label: 'Striker-1', side: 'RED', contact_status: 'Detected', final_status: 'Ready',   reason_code: null,                  weapon: 'SAM' },
        { uid: 'U2', unit_label: 'Striker-2', side: 'RED', contact_status: 'Detected', final_status: 'Blocked', reason_code: 'out_of_range',        weapon: 'Missile' },
        { uid: 'U3', unit_label: 'Recon-3',   side: 'RED', contact_status: 'Detected', final_status: 'Blocked', reason_code: 'winchester',          weapon: null },
        { uid: 'U4', unit_label: 'Sentry-4',  side: 'RED', contact_status: 'Unknown',  final_status: 'Unknown', reason_code: 'no_contact_evidence', weapon: 'Rifle' },
        { uid: 'U5', unit_label: 'Ghost-5',   side: 'RED', contact_status: 'Detected', final_status: 'Ready',   reason_code: null,                  weapon: 'Gun' }
    ],
    total_units: 5, source: 'x', active_filter: { status: 'All', reason_code: null }
};
function freshWs() {
    return {
        objective: { name: 'Objective X', id: 'OBJ-X' },
        red_units: [{ uid: 'U1', side: 'RED', lat: 24.1, lng: 46.2 }],
        // no blue_units → objective health BLUE check fails (critical objective repair)
        units: [
            { uid: 'U1', side: 'RED', role: 'SAM battery', lat: 24.1, lng: 46.2, label: 'Striker-1', weapon: 'SAM' },
            { uid: 'U2', side: 'RED', role: 'Fighter',     lat: 24.2, lng: 46.3, label: 'Striker-2', weapon: 'Missile' },
            { uid: 'U3', side: 'RED', role: 'Recon',       lat: 24.3, lng: 46.4, label: 'Recon-3',   weapon: 'Rifle' },
            { uid: 'U4', side: 'RED', role: 'Infantry',    lat: 24.4, lng: 46.5, label: 'Sentry-4',  weapon: 'Rifle' },
            { uid: 'U5', label: 'Ghost-5' }  // missing side / coordinates / role
        ]
    };
}

console.log('\n=== RMOOZ-SCENARIO-QA-BATCH-3 Gate Test ===\n');

/* ── QA-36: repair planner build + steps ───────────────────────────────── */
console.log('--- QA-36: scenario-evidence-repair-planner ---');
var RPP = requireModule('scenario-evidence-repair-planner.js');
var plan;
(function () {
    assert('T-1  module loads', !!RPP);
    assert('T-2  buildRepairPlan is a function', typeof RPP.buildRepairPlan === 'function');
    assert('T-3  renderRepairHtml is a function', typeof RPP.renderRepairHtml === 'function');
    assert('T-4  buildText is a function', typeof RPP.buildText === 'function');
    assert('T-5  REPAIR_STEPS exported', RPP.REPAIR_STEPS && typeof RPP.REPAIR_STEPS === 'object');
    assert('T-6  PRIORITY exported', RPP.PRIORITY && typeof RPP.PRIORITY === 'object');

    var empty = RPP.buildRepairPlan(null);
    assert('T-7  buildRepairPlan(null) returns object with version', empty && typeof empty.version === 'string' && empty.version.indexOf('qa-36') !== -1);
    assert('T-8  plans is an array', empty && Array.isArray(empty.plans));

    plan = RPP.buildRepairPlan(freshWs(), { matrix: fakeMatrix });
    assert('T-9  missing evidence produces repair plans', plan.total_repairs > 0);
    assert('T-10 every plan has non-empty steps with {en,ar}', plan.plans.every(function (p) {
        return Array.isArray(p.steps) && p.steps.length > 0 && p.steps.every(function (s) { return s && typeof s.en === 'string' && typeof s.ar === 'string'; });
    }));
    assert('T-11 no_contact_evidence plan carries contact repair steps', plan.plans.some(function (p) {
        return p.reason === 'no_contact_evidence' && p.steps.some(function (s) { return /contact/i.test(s.en); });
    }));
    assert('T-12 total_repairs equals plans length', plan.total_repairs === plan.plans.length);
})();

/* ── QA-38: priority ranking ───────────────────────────────────────────── */
console.log('\n--- QA-38: priority ranking ---');
(function () {
    assert('T-1  by_priority summary present', plan.by_priority && typeof plan.by_priority.critical === 'number');
    // plans sorted by priority ascending (critical first)
    var sorted = plan.plans.every(function (p, i) { return i === 0 || plan.plans[i - 1].priority <= p.priority; });
    assert('T-2  plans sorted critical-first', sorted);
    assert('T-3  first plan is priority 1 (critical)', plan.plans[0].priority === 1);
    var missingSide = plan.plans.filter(function (p) { return p.reason === 'missing_side'; })[0];
    assert('T-4  missing_side ranked critical (priority 1)', missingSide && missingSide.priority === 1);
    var doctrine = plan.plans.filter(function (p) { return p.reason === 'doctrine_unknown'; })[0];
    assert('T-5  doctrine_unknown ranked low (priority 4)', doctrine && doctrine.priority === 4);
    assert('T-6  structural ranks strictly above advisory', missingSide.priority < doctrine.priority);
    assert('T-7  by_priority.critical > 0', plan.by_priority.critical > 0);
    assert('T-8  by_priority.low > 0 (doctrine)', plan.by_priority.low > 0);
    assert('T-9  priority labels present', plan.plans[0].priority_label_en && plan.plans[0].priority_label_ar);
})();

/* ── QA-40: Objective X repair readiness ───────────────────────────────── */
console.log('\n--- QA-40: objective X repair readiness ---');
(function () {
    var orr = plan.objective_readiness;
    assert('T-1  objective_readiness present', orr && typeof orr === 'object');
    assert('T-2  health_pct is a number', typeof orr.health_pct === 'number');
    assert('T-3  ready is false (BLUE units missing)', orr.ready === false);
    assert('T-4  failing includes blue_units check', Array.isArray(orr.failing) && orr.failing.some(function (f) { return f.key === 'blue_units_exist'; }));
    assert('T-5  failing checks carry repair steps', orr.failing.every(function (f) { return Array.isArray(f.steps) && f.steps.length > 0; }));
    // Consistency: the readiness banner and the objective_* repair cards derive
    // from ONE shared health object, so their counts must never diverge.
    var objectivePlans = plan.plans.filter(function (p) { return p.group === 'objective_x_health'; }).length;
    assert('T-6  objective_readiness.failing_count matches objective_x_health plans', orr.failing_count === objectivePlans);
})();

/* ── QA-39: export JSON / text ─────────────────────────────────────────── */
console.log('\n--- QA-39: export ---');
(function () {
    var txt = RPP.buildText(plan);
    assert('T-1  buildText returns a plan document', typeof txt === 'string' && txt.indexOf('Scenario Evidence Repair Plan') !== -1);
    assert('T-2  text lists priority + reason', /\[(Critical|High|Medium|Low)\]/.test(txt));
    assert('T-3  text carries the read-only disclaimer', /read-only/i.test(txt));
    var json = RPP.toJson(plan);
    var parsed = null; try { parsed = JSON.parse(json); } catch (_) {}
    assert('T-4  toJson emits valid JSON', parsed && parsed.total_repairs === plan.total_repairs);
    assert('T-5  copy/download helpers exist', typeof RPP.copyPlanText === 'function' && typeof RPP.copyPlanJson === 'function' && typeof RPP.downloadJson === 'function');
})();

/* ── QA-37: repair preview cards ───────────────────────────────────────── */
console.log('\n--- QA-37: repair preview cards ---');
(function () {
    var html = RPP.renderRepairHtml(plan, { lang: 'ar' });
    assert('T-1  renderRepairHtml returns non-empty string', typeof html === 'string' && html.length > 60);
    assert('T-2  render has no raw <script>', html.indexOf('<script') === -1);
    assert('T-3  render has repair cards', html.indexOf('usp-repair-card') !== -1);
    assert('T-4  render has export buttons', html.indexOf('data-cmo-repair-action') !== -1);
    assert('T-5  render shows objective readiness', html.indexOf('usp-repair-objective') !== -1);
    // healthy scenario → no repairs, friendly empty state, objective ready
    var healthyWs = {
        objective: { name: 'X', id: 'X' },
        units: [
            { uid: 'H1', side: 'RED',  role: 'inf', lat: 24,   lng: 46,   label: 'H1', weapon: 'Gun', sensor: 'Radar', doctrine: 'std' },
            { uid: 'H2', side: 'BLUE', role: 'inf', lat: 24.1, lng: 46.1, label: 'H2', weapon: 'Gun', sensor: 'Radar', doctrine: 'std' }
        ]
    };
    var healthyMatrix = {
        counts: { Ready: 2, Blocked: 0, Unknown: 0 }, top_blockers: [],
        rows: [
            { uid: 'H1', unit_label: 'H1', side: 'RED',  contact_status: 'Detected', final_status: 'Ready', reason_code: null, weapon: 'Gun' },
            { uid: 'H2', unit_label: 'H2', side: 'BLUE', contact_status: 'Detected', final_status: 'Ready', reason_code: null, weapon: 'Gun' }
        ], total_units: 2, active_filter: { status: 'All', reason_code: null }
    };
    var healthyPlan = RPP.buildRepairPlan(healthyWs, { matrix: healthyMatrix });
    assert('T-6  complete scenario → zero repairs', healthyPlan.total_repairs === 0);
    assert('T-7  complete scenario → objective ready', healthyPlan.objective_readiness.ready === true);
    assert('T-8  empty plan renders friendly empty state', RPP.renderRepairHtml(healthyPlan).indexOf('usp-repair-empty') !== -1);
})();

/* ── QA-41: force report includes repair plan ──────────────────────────── */
console.log('\n--- QA-41: force report repair plan ---');
(function () {
    var RP = requireModule('cmo-force-evidence-report.js');
    var report = RP.buildReport(freshWs(), { matrix: fakeMatrix });
    assert('T-1  report has repair_plan field', 'repair_plan' in report);
    assert('T-2  repair_plan has plans', report.repair_plan && Array.isArray(report.repair_plan.plans) && report.repair_plan.plans.length > 0);
    var summary = RP.buildSummary(report);
    assert('T-3  buildSummary includes repair plan section', summary.indexOf('Scenario Evidence Repair Plan') !== -1);
    assert('T-4  report retains review_queue + completeness + coverage', 'review_queue' in report && 'completeness' in report && 'coverage' in report);
})();

/* ── QA-42: unit-status-panel wiring ───────────────────────────────────── */
console.log('\n--- QA-42: unit-status-panel wiring ---');
(function () {
    var src = fs.readFileSync(path.join(SHELL, 'unit-status-panel.js'), 'utf8');
    assert('T-1  populateScenarioRepairPlan defined', src.indexOf('function populateScenarioRepairPlan') !== -1);
    assert('T-2  called in populatePanel', src.indexOf('populateScenarioRepairPlan(unit)') !== -1);
    assert('T-3  repair planner after review queue', src.indexOf('populateScenarioReviewQueue(unit)') < src.indexOf('populateScenarioRepairPlan(unit)'));
    assert('T-4  repair planner before quality gate', src.indexOf('populateScenarioRepairPlan(unit)') < src.indexOf('populateEvidenceQualityGate(unit)'));
    assert('T-5  RmoozScenarioEvidenceRepairPlanner referenced', src.indexOf('RmoozScenarioEvidenceRepairPlanner') !== -1);
    assert('T-6  usp-repair-plan-block referenced', src.indexOf('usp-repair-plan-block') !== -1);
})();

/* ── Non-mutation ──────────────────────────────────────────────────────── */
console.log('\n--- Non-mutation ---');
(function () {
    var ws = freshWs();
    var before = JSON.stringify(ws);
    RPP.buildRepairPlan(ws, { matrix: fakeMatrix });
    assert('T-1  original world state is NOT mutated by repair planner', JSON.stringify(ws) === before);
})();

/* ── Boundary ──────────────────────────────────────────────────────────── */
console.log('\n--- Boundary check ---');
(function () {
    var src = fs.readFileSync(path.join(SHELL, 'scenario-evidence-repair-planner.js'), 'utf8');
    var lower = src.toLowerCase();
    [
        { label: 'fetch(',            pat: 'fetch(' },
        { label: 'XMLHttpRequest',    pat: 'XMLHttpRequest' },
        { label: 'backend /api/ call',pat: "'/api/" },
        { label: 'window.units mutation', pat: 'window.units =' },
        { label: 'scenario_contract', pat: 'scenario_contract' },
        { label: 'sim commit',        pat: '/api/sim/' },
        { label: 'journal write',     pat: 'journal' }
    ].forEach(function (p) { assert('repair-planner has no ' + p.label, src.indexOf(p.pat) === -1); });
    assert('repair-planner does not revive DOCX staging', lower.indexOf('docx') === -1 && lower.indexOf('staging') === -1);
    assert('repair-planner has no auto-fire verbs', lower.indexOf('autofire') === -1 && lower.indexOf('auto_fire') === -1 && lower.indexOf('openfire') === -1);
    // "read-only guidance, not an auto-fix engine" — assert it never claims to apply fixes automatically
    assert('repair-planner does not auto-apply fixes', lower.indexOf('applyfix') === -1 && lower.indexOf('autofix') === -1 && lower.indexOf('auto_fix') === -1);
})();

/* ── Offline mirror parity ─────────────────────────────────────────────── */
console.log('\n--- Offline mirror parity ---');
(function () {
    ['scenario-evidence-repair-planner.js', 'cmo-force-evidence-report.js', 'unit-status-panel.js'].forEach(function (f) {
        var mainSrc = fs.readFileSync(path.join(SHELL, f), 'utf8');
        var offPath = path.join(OFF, f);
        assert('offline/' + f + ' exists', fs.existsSync(offPath));
        if (fs.existsSync(offPath)) assert('offline/' + f + ' matches main', fs.readFileSync(offPath, 'utf8') === mainSrc);
    });
    ['UI_MOdified/client/app.html', 'UI_MOdified/Offline_Deployment/offline_app/client/app.html'].forEach(function (rel) {
        var html = fs.readFileSync(path.join(__dirname, rel), 'utf8');
        assert(rel + ' has repair-plan block', html.indexOf('id="usp-repair-plan-block"') !== -1);
        assert(rel + ' loads repair-planner script', html.indexOf('scenario-evidence-repair-planner.js') !== -1);
        assert(rel + ' has repair css', html.indexOf('.usp-repair-card') !== -1);
    });
})();

/* ── Result ────────────────────────────────────────────────────────────── */
console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');
if (failed > 0) process.exit(1);
