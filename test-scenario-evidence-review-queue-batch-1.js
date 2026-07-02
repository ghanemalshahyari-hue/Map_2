/* ============================================================================
 * test-scenario-evidence-review-queue-batch-1.js — RMOOZ-SCENARIO-QA-BATCH-2
 * ----------------------------------------------------------------------------
 * Static headless gate (no server). Verifies:
 *   QA-30  scenario-evidence-review-queue.js  buildReviewQueue / grouping / render
 *   QA-31  resolveDrilldownIntent + bindQueueInteractions (click dispatch, no-crash)
 *   QA-32  cmo-commander-brief.js  buildBrief includes scenario_qa
 *   QA-33  cmo-force-evidence-report.js  buildReport includes review_queue
 *   QA-34  unit-status-panel.js  populateScenarioReviewQueue wired in order
 *   Boundary: read-only, no backend/combat/doctrine mutation, no DOCX staging
 *   Non-mutation: original world state untouched; normalized copy is safe
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

/* ── Shared representative data (mix across every issue group) ──────────── */
var fakeMatrix = {
    version: 'x',
    counts: { Ready: 2, Blocked: 2, Unknown: 1 },
    top_blockers: [
        { code: 'out_of_range', count: 1, label_ar: 'خارج المدى' },
        { code: 'winchester', count: 1, label_ar: 'نفاد الذخيرة' },
        { code: 'no_contact_evidence', count: 1, label_ar: 'لا يوجد دليل اتصال' }
    ],
    rows: [
        { uid: 'U1', unit_label: 'Striker-1', side: 'RED', contact_status: 'Detected', final_status: 'Ready',   reason_code: null,                 weapon: 'SAM' },
        { uid: 'U2', unit_label: 'Striker-2', side: 'RED', contact_status: 'Detected', final_status: 'Blocked', reason_code: 'out_of_range',       weapon: 'Missile' },
        { uid: 'U3', unit_label: 'Recon-3',   side: 'RED', contact_status: 'Detected', final_status: 'Blocked', reason_code: 'winchester',         weapon: null },
        { uid: 'U4', unit_label: 'Sentry-4',  side: 'RED', contact_status: 'Unknown',  final_status: 'Unknown', reason_code: 'no_contact_evidence',weapon: 'Rifle' },
        { uid: 'U5', unit_label: 'Ghost-5',   side: 'RED', contact_status: 'Detected', final_status: 'Ready',   reason_code: null,                 weapon: 'Gun' }
    ],
    total_units: 5, source: 'Contact + engagement derived evidence', active_filter: { status: 'All', reason_code: null }
};
function freshWs() {
    return {
        objective: { name: 'Objective X', id: 'OBJ-X' },
        red_units: [{ uid: 'U1', side: 'RED', lat: 24.1, lng: 46.2 }],
        // no blue_units → objective health BLUE check fails
        units: [
            { uid: 'U1', side: 'RED', role: 'SAM battery', lat: 24.1, lng: 46.2, label: 'Striker-1', weapon: 'SAM' },
            { uid: 'U2', side: 'RED', role: 'Fighter',     lat: 24.2, lng: 46.3, label: 'Striker-2', weapon: 'Missile' },
            { uid: 'U3', side: 'RED', role: 'Recon',       lat: 24.3, lng: 46.4, label: 'Recon-3',   weapon: 'Rifle' },
            { uid: 'U4', side: 'RED', role: 'Infantry',    lat: 24.4, lng: 46.5, label: 'Sentry-4',  weapon: 'Rifle' },
            { uid: 'U5', label: 'Ghost-5' }  // missing side / coord / role
        ]
    };
}

console.log('\n=== RMOOZ-SCENARIO-QA-BATCH-2 Gate Test ===\n');

/* ── QA-30: review queue build + grouping + render ─────────────────────── */
console.log('--- QA-30: scenario-evidence-review-queue ---');
var RQ = requireModule('scenario-evidence-review-queue.js');
var queue;
(function () {
    assert('T-1  module loads', !!RQ);
    assert('T-2  buildReviewQueue is a function', typeof RQ.buildReviewQueue === 'function');
    assert('T-3  renderQueueHtml is a function', typeof RQ.renderQueueHtml === 'function');
    assert('T-4  bindQueueInteractions is a function', typeof RQ.bindQueueInteractions === 'function');
    assert('T-5  resolveDrilldownIntent is a function', typeof RQ.resolveDrilldownIntent === 'function');

    var empty = RQ.buildReviewQueue(null);
    assert('T-6  buildReviewQueue(null) returns object with version', empty && typeof empty.version === 'string' && empty.version.indexOf('qa-30') !== -1);
    assert('T-7  groups is an array', empty && Array.isArray(empty.groups));

    queue = RQ.buildReviewQueue(freshWs(), { matrix: fakeMatrix });
    assert('T-8  missing evidence creates queue items (total_issues > 0)', queue.total_issues > 0);
    function hasGroup(k) { return queue.groups.some(function (g) { return g.key === k && g.count > 0; }); }
    assert('T-9  grouped: contact issues present',          hasGroup('contact'));
    assert('T-10 grouped: weapon issues present',           hasGroup('weapon'));
    assert('T-11 grouped: range issues present',            hasGroup('range'));
    assert('T-12 grouped: doctrine issues present',         hasGroup('doctrine'));
    assert('T-13 grouped: coordinate/role issues present',  hasGroup('coordinate_role'));
    assert('T-14 grouped: objective X health issues present', hasGroup('objective_x_health'));
    // range issue is the out_of_range unit U2
    var rangeGroup = queue.groups.filter(function (g) { return g.key === 'range'; })[0];
    assert('T-15 range group references U2', rangeGroup && rangeGroup.issues.some(function (i) { return i.uid === 'U2' && i.reason === 'missing_range'; }));
    // coordinate_role includes U5 missing_side/coord/role
    var coordGroup = queue.groups.filter(function (g) { return g.key === 'coordinate_role'; })[0];
    assert('T-16 coordinate_role group references U5', coordGroup && coordGroup.issues.some(function (i) { return i.uid === 'U5'; }));
    assert('T-17 units_flagged is a number', typeof queue.units_flagged === 'number' && queue.units_flagged > 0);
    assert('T-18 objective_health_pct is a number', typeof queue.objective_health_pct === 'number');

    var html = RQ.renderQueueHtml(queue, { lang: 'ar' });
    assert('T-19 renderQueueHtml returns non-empty string', typeof html === 'string' && html.length > 40);
    assert('T-20 render has no raw <script>', html.indexOf('<script') === -1);
    assert('T-21 render has clickable issue buttons', html.indexOf('data-cmo-queue-issue') !== -1);
    // A genuinely complete + healthy scenario yields an empty queue (all fields
    // present incl. doctrine/sensor, objective health all-pass).
    // Side is carried on units[] (objective-health scans units[] by side), so no
    // separate minimal red_units/blue_units arrays that would look incomplete.
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
        ],
        total_units: 2, active_filter: { status: 'All', reason_code: null }
    };
    var emptyQueue = RQ.buildReviewQueue(healthyWs, { matrix: healthyMatrix });
    assert('T-22 complete scenario → zero issues', emptyQueue.total_issues === 0);
    var emptyHtml = RQ.renderQueueHtml(emptyQueue);
    assert('T-23 empty queue renders a friendly empty state', typeof emptyHtml === 'string' && emptyHtml.indexOf('usp-queue-empty') !== -1);
})();

/* ── QA-31: drilldown intent + click dispatch ──────────────────────────── */
console.log('\n--- QA-31: drilldown intent + interaction ---');
(function () {
    var iContact = RQ.resolveDrilldownIntent('no_contact_evidence');
    assert('T-1  no_contact → matrix Unknown + no_contact_evidence', iContact.matrix_filter && iContact.matrix_filter.status === 'Unknown' && iContact.matrix_filter.reason_code === 'no_contact_evidence');
    assert('T-2  no_contact → scrolls to contact block', iContact.scroll_to === 'usp-contact-evidence-block');
    var iWeapon = RQ.resolveDrilldownIntent('no_weapon_evidence');
    assert('T-3  weapon → selects unit + engagement block', iWeapon.select_unit === true && iWeapon.scroll_to === 'usp-engagement-evidence-block');
    var iRange = RQ.resolveDrilldownIntent('missing_range');
    assert('T-4  range → decision chain block', iRange.scroll_to === 'usp-chain-evidence-block');
    var iDoc = RQ.resolveDrilldownIntent('doctrine_unknown');
    assert('T-5  doctrine → selects unit + chain block', iDoc.select_unit === true && iDoc.scroll_to === 'usp-chain-evidence-block');
    var iObj = RQ.resolveDrilldownIntent('objective_blue_units_exist');
    assert('T-6  objective_* → objective health block, no unit select', iObj.scroll_to === 'usp-objective-health-block' && !iObj.select_unit);

    // Minimal fake DOM for click dispatch
    function fakeButton(uid, reason) {
        var handlers = {};
        return {
            _a: { 'data-cmo-queue-uid': uid, 'data-cmo-queue-reason': reason },
            getAttribute: function (n) { return this._a[n]; },
            addEventListener: function (ev, fn) { handlers[ev] = fn; },
            click: function () { if (handlers.click) handlers.click(); }
        };
    }
    function fakeContainer(buttons) { return { querySelectorAll: function () { return buttons; } }; }

    var called = [];
    var buttons = [fakeButton('U4', 'no_contact_evidence')];
    RQ.bindQueueInteractions(fakeContainer(buttons), queue, {
        onSelectIssue: function (issue, intent) { called.push({ issue: issue, intent: intent }); }
    });
    buttons[0].click();
    assert('T-7  clicking issue invokes onSelectIssue', called.length === 1);
    assert('T-8  dispatched issue carries reason', called[0] && called[0].issue && called[0].issue.reason === 'no_contact_evidence');
    assert('T-9  dispatched intent carries matrix filter', called[0] && called[0].intent && called[0].intent.matrix_filter && called[0].intent.matrix_filter.reason_code === 'no_contact_evidence');

    var threw = false;
    try {
        var b2 = [fakeButton('U2', 'missing_range')];
        RQ.bindQueueInteractions(fakeContainer(b2), queue, {}); // no callback
        b2[0].click();
    } catch (e) { threw = true; }
    assert('T-10 missing callback does not crash', threw === false);
})();

/* ── QA-32: commander brief includes scenario QA ───────────────────────── */
console.log('\n--- QA-32: commander brief scenario QA ---');
(function () {
    var CB = requireModule('cmo-commander-brief.js');
    assert('T-1  module loads', !!CB);
    assert('T-2  version retains cmo-21 lineage', CB.CMO_COMMANDER_BRIEF_VERSION.indexOf('cmo-21') !== -1);
    var brief = CB.buildBrief(freshWs(), null, { matrix: fakeMatrix });
    assert('T-3  brief has scenario_qa', brief && brief.scenario_qa && typeof brief.scenario_qa === 'object');
    assert('T-4  scenario_qa.evidence_issues is a number > 0', typeof brief.scenario_qa.evidence_issues === 'number' && brief.scenario_qa.evidence_issues > 0);
    assert('T-5  scenario_qa.needs_review is true when issues exist', brief.scenario_qa.needs_review === true);
    assert('T-6  scenario_qa.objective_health_pct is a number', typeof brief.scenario_qa.objective_health_pct === 'number');
    var html = CB.renderBriefHtml(brief);
    assert('T-7  renderBriefHtml surfaces Scenario QA', html.indexOf('Scenario QA') !== -1);
    assert('T-8  renderBriefHtml surfaces Objective X Health', html.indexOf('Objective X Health') !== -1);
    assert('T-9  brief still exposes headline/coverage/quality', brief.headline_status && brief.coverage && brief.quality);
})();

/* ── QA-33: force report includes review queue ─────────────────────────── */
console.log('\n--- QA-33: force report review queue ---');
(function () {
    var RP = requireModule('cmo-force-evidence-report.js');
    assert('T-1  module loads', !!RP);
    var report = RP.buildReport(freshWs(), { matrix: fakeMatrix });
    assert('T-2  report has review_queue field', 'review_queue' in report);
    assert('T-3  review_queue has groups', report.review_queue && Array.isArray(report.review_queue.groups) && report.review_queue.groups.length > 0);
    var summary = RP.buildSummary(report);
    assert('T-4  buildSummary includes review queue section', summary.indexOf('Scenario Evidence Review Queue') !== -1);
    assert('T-5  report still has completeness + coverage', 'completeness' in report && 'coverage' in report);
})();

/* ── QA-34: unit-status-panel wiring + order ───────────────────────────── */
console.log('\n--- QA-34: unit-status-panel wiring ---');
(function () {
    var src = fs.readFileSync(path.join(SHELL, 'unit-status-panel.js'), 'utf8');
    assert('T-1  populateScenarioReviewQueue defined', src.indexOf('function populateScenarioReviewQueue') !== -1);
    assert('T-2  populateScenarioReviewQueue called in populatePanel', src.indexOf('populateScenarioReviewQueue(unit)') !== -1);
    assert('T-3  review queue after objective health',
        src.indexOf('populateObjectiveHealth(unit)') < src.indexOf('populateScenarioReviewQueue(unit)'));
    assert('T-4  review queue before quality gate',
        src.indexOf('populateScenarioReviewQueue(unit)') < src.indexOf('populateEvidenceQualityGate(unit)'));
    assert('T-5  reuses selectEvidenceUnit for drilldown', src.indexOf("selectEvidenceUnit({ uid: issue.uid") !== -1);
    assert('T-6  primes currentMatrixFilter for drilldown', src.indexOf('currentMatrixFilter = intent.matrix_filter') !== -1);
    assert('T-7  RmoozScenarioEvidenceReviewQueue referenced', src.indexOf('RmoozScenarioEvidenceReviewQueue') !== -1);
    assert('T-8  usp-review-queue-block referenced', src.indexOf('usp-review-queue-block') !== -1);
})();

/* ── Review fixes (adversarial pass) ───────────────────────────────────── */
console.log('\n--- Review fixes: weapon filter / sensor noise / identity id ---');
(function () {
    // Weapon reasons must NOT prime a matrix filter the matrix can't emit (would blank it).
    assert('RF-1  missing_weapon → no matrix_filter', !RQ.resolveDrilldownIntent('missing_weapon').matrix_filter);
    assert('RF-2  no_weapon_evidence → no matrix_filter', !RQ.resolveDrilldownIntent('no_weapon_evidence').matrix_filter);
    // no_engagement_evidence IS a real matrix reason code → filter is kept.
    var ie = RQ.resolveDrilldownIntent('no_engagement_evidence');
    assert('RF-3  no_engagement_evidence keeps a valid matrix_filter', ie.matrix_filter && ie.matrix_filter.reason_code === 'no_engagement_evidence');
    // weapon reasons still focus the unit + engagement section.
    assert('RF-4  weapon reason still selects unit + engagement block',
        RQ.resolveDrilldownIntent('missing_weapon').select_unit === true && RQ.resolveDrilldownIntent('missing_weapon').scroll_to === 'usp-engagement-evidence-block');
    // Sensor is no longer a queue reason (was firing on nearly every unit).
    assert('RF-5  no_sensor_evidence removed from REASON_GROUP', !RQ.REASON_GROUP || !('no_sensor_evidence' in RQ.REASON_GROUP));
    var contactGroup = queue.groups.filter(function (g) { return g.key === 'contact'; })[0];
    assert('RF-6  contact group carries no sensor issues', !contactGroup || contactGroup.issues.every(function (i) { return i.reason !== 'no_sensor_evidence'; }));
    // Identity scroll target now has a matching id in BOTH builds.
    ['UI_MOdified/client/app.html', 'UI_MOdified/Offline_Deployment/offline_app/client/app.html'].forEach(function (rel) {
        var html = fs.readFileSync(path.join(__dirname, rel), 'utf8');
        assert(rel + ' has id="usp-identity-block"', html.indexOf('id="usp-identity-block"') !== -1);
    });
})();

/* ── Non-mutation: original WS untouched; normalized copy safe ─────────── */
console.log('\n--- Non-mutation guarantees ---');
(function () {
    var ws = freshWs();
    var before = JSON.stringify(ws);
    RQ.buildReviewQueue(ws, { matrix: fakeMatrix });
    assert('T-1  original world state is NOT mutated by review queue', JSON.stringify(ws) === before);

    var NORM = requireModule('scenario-evidence-normalizer.js');
    var ws2 = freshWs();
    var before2 = JSON.stringify(ws2);
    var res = NORM.normalizeWorldState(ws2);
    assert('T-2  normalizer does not mutate original', JSON.stringify(ws2) === before2);
    // U5 was missing side/role → normalized copy has safe defaults
    var u5 = res.normalized_ws.units.filter(function (u) { return u.uid === 'U5'; })[0];
    assert('T-3  normalized copy fills safe side default', u5 && u5.side === NORM.DEFAULTS.side);
    assert('T-4  normalized copy fills safe weapon default', u5 && u5.weapon === NORM.DEFAULTS.weapon);
    assert('T-5  normalized copy fills safe doctrine default', u5 && u5.doctrine === NORM.DEFAULTS.doctrine);
})();

/* ── Boundary: no prohibited patterns; no DOCX staging revived ─────────── */
console.log('\n--- Boundary check ---');
(function () {
    var src = fs.readFileSync(path.join(SHELL, 'scenario-evidence-review-queue.js'), 'utf8');
    var lower = src.toLowerCase();
    var prohibited = [
        { label: 'fetch(',            pat: 'fetch(' },
        { label: 'XMLHttpRequest',    pat: 'XMLHttpRequest' },
        { label: 'backend /api/ call',pat: "'/api/" },
        { label: 'window.units mutation', pat: 'window.units =' },
        { label: 'scenario_contract', pat: 'scenario_contract' },
        { label: 'sim commit',        pat: '/api/sim/commit' },
        { label: 'journal write',     pat: 'journal' }
    ];
    prohibited.forEach(function (p) {
        assert('review-queue has no ' + p.label, src.indexOf(p.pat) === -1);
    });
    assert('review-queue does not revive DOCX staging', lower.indexOf('docx') === -1 && lower.indexOf('staging') === -1);
    // read-only: no auto-fire / combat trigger verbs
    assert('review-queue has no auto-fire / fire-control verbs', lower.indexOf('autofire') === -1 && lower.indexOf('auto_fire') === -1 && lower.indexOf('openfire') === -1);
})();

/* ── Offline mirror parity ─────────────────────────────────────────────── */
console.log('\n--- Offline mirror parity ---');
(function () {
    var files = ['scenario-evidence-review-queue.js', 'cmo-commander-brief.js', 'cmo-force-evidence-report.js', 'unit-status-panel.js'];
    files.forEach(function (f) {
        var mainSrc = fs.readFileSync(path.join(SHELL, f), 'utf8');
        var offPath = path.join(OFF, f);
        assert('offline/' + f + ' exists', fs.existsSync(offPath));
        if (fs.existsSync(offPath)) {
            assert('offline/' + f + ' matches main', fs.readFileSync(offPath, 'utf8') === mainSrc);
        }
    });
    // both app.html carry the review-queue block + script + css
    ['UI_MOdified/client/app.html', 'UI_MOdified/Offline_Deployment/offline_app/client/app.html'].forEach(function (rel) {
        var html = fs.readFileSync(path.join(__dirname, rel), 'utf8');
        assert(rel + ' has review-queue block', html.indexOf('id="usp-review-queue-block"') !== -1);
        assert(rel + ' loads review-queue script', html.indexOf('scenario-evidence-review-queue.js') !== -1);
        assert(rel + ' has review-queue css', html.indexOf('.usp-queue-issue') !== -1);
    });
})();

/* ── Result ────────────────────────────────────────────────────────────── */
console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===\n');
if (failed > 0) process.exit(1);
