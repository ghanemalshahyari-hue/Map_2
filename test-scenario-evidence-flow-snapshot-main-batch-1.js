/* ============================================================================
 * test-scenario-evidence-flow-snapshot-main-batch-1.js
 * RMOOZ-SCENARIO-FLOW-SNAPSHOT-1 - Main Evidence Flow Snapshot Gate
 * ----------------------------------------------------------------------------
 * Main-app-only gate for the read-only Scenario Evidence Flow Snapshot module.
 * This test does not touch, inspect, sync, rebuild, or run offline files.
 * Offline sync/testing is pending by user instruction.
 * ========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var SHELL = path.join(ROOT, 'UI_MOdified', 'client', 'shell');
var SNAPSHOT_FILE = path.join(SHELL, 'scenario-evidence-flow-snapshot.js');
var APP = path.join(ROOT, 'UI_MOdified', 'client', 'app.html');

var passed = 0, failed = 0;
function assert(label, cond) {
    if (cond) { console.log('  PASS  ' + label); passed++; }
    else { console.error('  FAIL  ' + label); failed++; }
}
function src(file) { return fs.readFileSync(file, 'utf8'); }
function shell(name) { return require(path.join(SHELL, name)); }
function arr(v) { return Array.isArray(v) ? v : []; }
function obj(v) { return v && typeof v === 'object' ? v : {}; }
function hasAll(text, needles) { return needles.every(function (needle) { return String(text).indexOf(needle) !== -1; }); }
function cleanSource(text) {
    return String(text || '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
}

var FIXED_AT = '2026-07-03T04:00:00.000Z';
function world() {
    return {
        scenario_id: 'RMOOZ-FLOW-SNAPSHOT-TEST',
        objective: { id: 'OBJ-X', name: 'Objective X', lat: 24.55, lng: 54.44 },
        units: [
            { uid: 'FLOW-RED-1', side: 'RED', role: 'SAM', lat: 24.56, lng: 54.45, label: 'Flow Red SAM', weapon: 'SAM', sensor: 'Radar', doctrine: 'defensive' },
            { uid: 'FLOW-BLU-1', side: 'BLUE', role: 'Fighter', lat: 24.61, lng: 54.52, label: 'Flow Blue CAP', weapon: 'AAM', sensor: 'Radar', doctrine: 'cap' },
            { uid: 'FLOW-GHOST-1', label: 'Flow Ghost' }
        ],
        red_units: [{ uid: 'FLOW-RED-1', side: 'RED', lat: 24.56, lng: 54.45 }],
        blue_units: [{ uid: 'FLOW-BLU-1', side: 'BLUE', lat: 24.61, lng: 54.52 }]
    };
}
function matrix() {
    return {
        counts: { Ready: 1, Blocked: 1, Unknown: 1 },
        top_blockers: [
            { code: 'no_contact_evidence', count: 1, label_ar: 'لا يوجد دليل اتصال' },
            { code: 'out_of_range', count: 1, label_ar: 'خارج المدى' }
        ],
        rows: [
            { uid: 'FLOW-RED-1', unit_label: 'Flow Red SAM', side: 'RED', contact_status: 'Detected', engagement_status: 'Ready', final_status: 'Ready', reason_code: null, weapon: 'SAM' },
            { uid: 'FLOW-BLU-1', unit_label: 'Flow Blue CAP', side: 'BLUE', contact_status: 'Detected', engagement_status: 'Blocked', final_status: 'Blocked', reason_code: 'out_of_range', weapon: 'AAM' },
            { uid: 'FLOW-GHOST-1', unit_label: 'Flow Ghost', side: 'RED', contact_status: 'Unknown', engagement_status: 'Unknown', final_status: 'Unknown', reason_code: 'no_contact_evidence', weapon: null }
        ],
        total_units: 3,
        active_filter: { status: 'All', reason_code: null }
    };
}
function readyCloseout(fp) {
    return {
        status: 'ready_for_handoff',
        status_label_en: 'Ready for Handoff',
        counts: { total: 3, needs_review: 0, reviewed: 3, deferred: 0, fixed_externally: 0 },
        blockers: [],
        unresolved: [],
        deferred_without_note: [],
        fixed_externally_without_note: [],
        deferred: [],
        fixed_externally: [],
        reviewed: [],
        session: { scenario_fingerprint: fp, records: [] },
        read_only: true
    };
}

console.log('\n=== RMOOZ-SCENARIO-FLOW-SNAPSHOT-1 Main Gate ===\n');

var SNAP = shell('scenario-evidence-flow-snapshot.js');
var RS = shell('scenario-evidence-review-session.js');
var FR = shell('cmo-force-evidence-report.js');
var ws = world();
var fp = RS.computeFingerprint(ws, { generated_at: FIXED_AT });

console.log('--- FS-1: module API and app-main placement ---');
(function () {
    assert('T-1  flow snapshot module file exists', fs.existsSync(SNAPSHOT_FILE));
    assert('T-2  API version is exposed', SNAP.SCENARIO_EVIDENCE_FLOW_SNAPSHOT_VERSION === '1.0.0-rmooz-scenario-flow-snapshot-1');
    assert('T-3  API methods are exposed', ['buildSnapshot', 'buildChecklist', 'buildSummary', 'summaryText', 'renderSnapshotHtml'].every(function (name) { return typeof SNAP[name] === 'function'; }));
    assert('T-4  main app evidence stack still has prerequisite modules', hasAll(src(APP), [
        'scenario-evidence-normalizer.js',
        'scenario-evidence-review-queue.js',
        'scenario-evidence-review-closeout.js',
        'scenario-evidence-release-gate.js',
        'cmo-force-evidence-report.js'
    ]));
})();

console.log('\n--- FS-2: dirty scenario snapshot, checklist, and non-mutation ---');
(function () {
    var before = JSON.stringify(ws);
    var snapshot = SNAP.buildSnapshot(ws, { matrix: matrix(), generated_at: FIXED_AT });
    assert('T-1  snapshot is read-only and fingerprinted', snapshot.read_only === true && snapshot.scenario_fingerprint === fp);
    assert('T-2  snapshot reports visible normalizations', obj(snapshot.normalization).fields_normalized > 0 && obj(snapshot.normalization).units_affected > 0);
    assert('T-3  snapshot carries review queue issues', obj(snapshot.review_queue).total_issues > 0 && arr(obj(snapshot.review_queue).groups).length > 0);
    assert('T-4  snapshot carries closeout/release state', obj(snapshot.closeout).status && obj(snapshot.release_gate).status && snapshot.summary.release_status === obj(snapshot.release_gate).status);
    assert('T-5  source world state is not mutated', JSON.stringify(ws) === before);
    assert('T-6  checklist preserves operator journey order', arr(snapshot.checklist).map(function (s) { return s.key; }).join('|') === 'normalize|review|repair|closeout|handoff|release|report');
    assert('T-7  dirty flow marks release not releasable', snapshot.summary.releasable === false && snapshot.summary.blocker_count >= 1);
})();

console.log('\n--- FS-3: ready override path and HUD/report integration ---');
(function () {
    var accepted = { decision: 'accepted', decision_label_en: 'Accepted', fingerprint_match: true, current_scenario_fingerprint: fp, package_fingerprint: fp, read_only: true };
    var snapshot = SNAP.buildSnapshot(ws, {
        matrix: matrix(),
        closeout: readyCloseout(fp),
        acceptance: accepted,
        coverage: { coverage_pct: 88, total: 3, hud_details: { total: 3, contact_evidence: { present: 3 }, engagement_evidence: { present: 3 }, decision_chain: { present: 3 }, needs_review: 0 } },
        generated_at: FIXED_AT
    });
    assert('T-1  ready override makes release gate releasable', snapshot.summary.releasable === true && snapshot.summary.release_status === 'ready_for_release');
    assert('T-2  status cluster has four chips', snapshot.status_cluster && arr(snapshot.status_cluster.chips).length === 4);
    assert('T-3  force report is built and summarized', snapshot.force_report && FR.buildSummary(snapshot.force_report).indexOf('Force Evidence Report') === 0);
    assert('T-4  handoff package is present and read-only', snapshot.handoff_package && snapshot.handoff_package.read_only === true && snapshot.handoff_package.scenario_fingerprint === fp);
    assert('T-5  checklist release step passes when releasable', arr(snapshot.checklist).filter(function (s) { return s.key === 'release'; })[0].status === 'pass');
})();

console.log('\n--- FS-4: summary and render output ---');
(function () {
    var snapshot = SNAP.buildSnapshot(ws, { matrix: matrix(), generated_at: FIXED_AT });
    var summary = SNAP.buildSummary(snapshot);
    var text = SNAP.summaryText(snapshot);
    var html = SNAP.renderSnapshotHtml(snapshot);
    assert('T-1  summary is compact and read-only', summary.read_only === true && summary.scenario_fingerprint === fp && typeof summary.review_issues === 'number');
    assert('T-2  summary text includes release and read-only disclaimer', hasAll(text, ['Scenario Evidence Flow Snapshot', 'Release:', 'Read-only snapshot']));
    assert('T-3  render HTML includes bilingual header and checklist', hasAll(html, ['Scenario Evidence Flow Snapshot', 'ملخص تدفق أدلة السيناريو', 'scenario-flow-snapshot-checklist']));
    assert('T-4  null snapshot render does not crash', SNAP.renderSnapshotHtml(null).indexOf('Scenario Evidence Flow Snapshot') !== -1);
})();

console.log('\n--- FS-5: null/empty inputs and strict boundaries ---');
(function () {
    var empty = SNAP.buildSnapshot(null, { generated_at: FIXED_AT });
    assert('T-1  null input returns safe snapshot', empty && empty.read_only === true && empty.scenario_fingerprint);
    assert('T-2  empty summary still carries status fields', empty.summary.closeout_status && empty.summary.release_status && empty.summary.handoff_decision);
    var source = cleanSource(src(SNAPSHOT_FILE));
    [
        ['no fetch/network route', /fetch\s*\(|XMLHttpRequest|\/api\//],
        ['no DOCX/stage-doc/SLOT_FILE path', /stage-doc|SLOT_FILE|docs\.red|docs\.blue|DOCX/i],
        ['no combat/action/doctrine mutation', /applyAction|commitAction|executeAction|autoFire|auto-fire|applyDoctrine|commitDoctrine|setDoctrine|\/doctrine/i],
        ['no protected runtime files referenced', /legacy-shim-attack_objective_draft-15\.jsonl|scenario_overrides\.json/]
    ].forEach(function (pair) { assert('T-boundary  ' + pair[0], !pair[1].test(source)); });
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
