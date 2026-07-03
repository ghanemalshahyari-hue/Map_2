/* ============================================================================
 * test-scenario-evidence-flow-snapshot-main-batch-1.js
 * CMO-WARGAME-LIVE-WIRING-1 - Scenario Evidence Flow Snapshot
 * ----------------------------------------------------------------------------
 * Main-app-only gate. It validates the read-only snapshot module that stitches
 * existing browser-local evidence surfaces into one CMO-ready state object.
 * It does not inspect, sync, rebuild, or test offline deployment paths.
 * ========================================================================== */
'use strict';

var path = require('path');

var ROOT = __dirname;
var SNAPSHOT = path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'scenario-evidence-flow-snapshot.js');

var passed = 0, failed = 0;
function assert(label, cond) {
    if (cond) { console.log('  PASS  ' + label); passed++; }
    else { console.error('  FAIL  ' + label); failed++; }
}
function obj(v) { return v && typeof v === 'object' ? v : {}; }

function installStubs() {
    global.RmoozCmoEvidenceReadinessMatrix = {
        buildMatrix: function () {
            return {
                counts: { Ready: 2, Blocked: 1, Unknown: 1 },
                rows: [
                    { uid: 'RED-1', contact_status: 'Detected', engagement_status: 'Ready', final_status: 'Ready' },
                    { uid: 'RED-2', contact_status: 'Detected', engagement_status: 'Blocked', final_status: 'Blocked' },
                    { uid: 'BLUE-1', contact_status: 'Unknown', engagement_status: 'Unknown', final_status: 'Unknown' }
                ],
                top_blockers: [{ code: 'no_contact_evidence', count: 1 }]
            };
        }
    };
    global.RmoozCmoEvidenceCoverage = {
        buildCoverage: function () {
            return {
                total: 4,
                ready: 2,
                blocked: 1,
                unknown: 1,
                coverage_pct: 78,
                hud_details: {
                    total: 4,
                    contact_evidence: { present: 3 },
                    engagement_evidence: { present: 3 },
                    decision_chain: { present: 3 },
                    needs_review: 2
                }
            };
        }
    };
    global.RmoozScenarioEvidenceReviewQueue = {
        buildReviewQueue: function () {
            return {
                total_issues: 2,
                units_flagged: 2,
                groups: [{ key: 'missing_contact', issues: [{ uid: 'BLUE-1' }, { uid: 'RED-2' }] }]
            };
        }
    };
    global.RmoozScenarioEvidenceReviewCloseout = {
        buildCloseout: function () {
            return {
                status: 'ready_with_exceptions',
                status_label_en: 'Ready with Exceptions',
                counts: { total: 2, needs_review: 0, deferred: 1, fixed_externally: 1 },
                blockers: []
            };
        }
    };
    global.RmoozScenarioEvidenceReviewSession = {
        computeFingerprint: function () { return 'fp-cmo-live-1'; }
    };
    global.RmoozScenarioEvidenceHandoffAcceptance = {
        getDecision: function () {
            return {
                decision: 'accepted_with_warnings',
                decision_label_en: 'Accepted with Warnings',
                fingerprint_match: true
            };
        }
    };
    global.RmoozScenarioEvidenceReleaseGate = {
        buildReleaseGate: function () {
            return {
                status: 'not_ready',
                status_label_en: 'Not Ready',
                releasable: false,
                blockers: [{ code: 'unresolved_issues', label: '2 unresolved issues' }],
                warnings: [{ code: 'handoff_warning', label: 'Handoff accepted with warnings' }],
                checks: [{ key: 'unresolved_issues', actual: '2', status: 'fail' }]
            };
        }
    };
}

function worldState() {
    return {
        id: 'CMO-LIVE-WIRING-WORLD',
        name: 'CMO Live Wiring Scenario',
        units: [
            { uid: 'RED-1', label: 'Red SAM', side: 'RED' },
            { uid: 'RED-2', label: 'Red Recon', side: 'RED' },
            { uid: 'BLUE-1', label: 'Blue CAP', side: 'BLUE' },
            { uid: 'BLUE-2', label: 'Blue AWACS', side: 'BLUE' }
        ]
    };
}

console.log('\n=== CMO-WARGAME-LIVE-WIRING-1 Scenario Evidence Flow Snapshot ===\n');

installStubs();
delete require.cache[require.resolve(SNAPSHOT)];
var API = require(SNAPSHOT);
var ws = worldState();
var before = JSON.stringify(ws);
var snapshot = API.buildSnapshot(function () { return ws; }, {
    selected_unit: ws.units[0],
    generated_at: '2026-07-03T00:00:00.000Z'
});

console.log('--- CMO-LW-1: snapshot composition ---');
(function () {
    assert('T-1  module version exposed', API.FLOW_SNAPSHOT_VERSION === '1.0.0-cmo-wargame-live-wiring-1');
    assert('T-2  snapshot carries scenario identity and fingerprint', obj(snapshot.scenario).name === 'CMO Live Wiring Scenario' && obj(snapshot.scenario).fingerprint === 'fp-cmo-live-1');
    assert('T-3  counts come from existing readiness/review surfaces', obj(snapshot.counts).units === 4 && obj(snapshot.counts).ready === 2 && obj(snapshot.counts).review_issues === 2);
    assert('T-4  coverage, closeout, handoff, and release surfaces are stitched', obj(snapshot.coverage).coverage_pct === 78 && obj(snapshot.closeout).status === 'ready_with_exceptions' && obj(snapshot.handoff_acceptance).decision === 'accepted_with_warnings' && obj(snapshot.release_gate).status === 'not_ready');
    assert('T-5  selected unit is compacted without source mutation', obj(snapshot.selected_unit).uid === 'RED-1' && JSON.stringify(ws) === before);
})();

console.log('\n--- CMO-LW-2: summary/render and safe defaults ---');
(function () {
    var summary = API.buildSummary(snapshot);
    var html = API.renderSnapshotHtml(snapshot);
    assert('T-1  summary includes release, closeout, handoff, and coverage', ['Coverage: 78%', 'Closeout: Ready with Exceptions', 'Handoff: Accepted with Warnings', 'Release: Not Ready'].every(function (needle) { return summary.indexOf(needle) !== -1; }));
    assert('T-2  render emits compact read-only snapshot stats', html.indexOf('data-cmo-flow-snapshot') !== -1 && html.indexOf('Units <b>4</b>') !== -1 && html.indexOf('Review <b>2</b>') !== -1);
    var fallback = API.buildSnapshot({ id: 'EMPTY' }, { matrix: null, coverage: null, review_queue: null, generated_at: '2026-07-03T00:01:00.000Z' });
    assert('T-3  empty scenario still returns a bounded snapshot', fallback && obj(fallback.counts).units === 0 && obj(fallback.scenario).name === 'EMPTY');
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);

