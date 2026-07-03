/* ============================================================================
 * test-cmo-wargame-readiness-brief-main-batch-1.js
 * RMOOZ-CMO-WARGAME-READINESS-1 - Main CMO War-Game Readiness Gate
 * ----------------------------------------------------------------------------
 * Main-app-only gate for the read-only CMO war-game readiness brief. This test
 * does not touch, inspect, sync, rebuild, or run offline files. Offline
 * sync/testing is pending by user instruction.
 * ========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var SHELL = path.join(ROOT, 'UI_MOdified', 'client', 'shell');
var BRIEF_FILE = path.join(SHELL, 'cmo-wargame-readiness-brief.js');
var SNAPSHOT_FILE = path.join(SHELL, 'scenario-evidence-flow-snapshot.js');

var passed = 0, failed = 0;
function assert(label, cond) {
    if (cond) { console.log('  PASS  ' + label); passed++; }
    else { console.error('  FAIL  ' + label); failed++; }
}
function src(file) { return fs.readFileSync(file, 'utf8'); }
function shell(name) { return require(path.join(SHELL, name)); }
function arr(v) { return Array.isArray(v) ? v : []; }
function hasAll(text, needles) { return needles.every(function (needle) { return String(text).indexOf(needle) !== -1; }); }
function cleanSource(text) {
    return String(text || '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
}

function snapshotReady() {
    return {
        scenario_fingerprint: 'scenario-ready',
        summary: {
            scenario_fingerprint: 'scenario-ready',
            normalized_fields: 0,
            units_affected: 0,
            review_issues: 0,
            closeout_status: 'ready_for_handoff',
            closeout_label_en: 'Ready for Handoff',
            handoff_decision: 'accepted',
            handoff_label_en: 'Accepted',
            release_status: 'ready_for_release',
            release_label_en: 'Ready for Release',
            releasable: true,
            blocker_count: 0
        },
        checklist: [
            { key: 'normalize', label: 'Normalize Evidence Inputs', status: 'pass', detail: '0 field(s)' },
            { key: 'review', label: 'Review Queue', status: 'pass', detail: '0 issue(s)' },
            { key: 'closeout', label: 'Review Closeout', status: 'pass', detail: 'Ready for Handoff' },
            { key: 'handoff', label: 'Handoff Acceptance', status: 'pass', detail: 'Accepted' },
            { key: 'release', label: 'Evidence Release Gate', status: 'pass', detail: 'Ready for Release' }
        ],
        release_gate: { status: 'ready_for_release', releasable: true, blockers: [], warnings: [] },
        read_only: true
    };
}
function snapshotWarn() {
    return {
        scenario_fingerprint: 'scenario-warn',
        summary: {
            scenario_fingerprint: 'scenario-warn',
            normalized_fields: 3,
            units_affected: 1,
            review_issues: 2,
            closeout_status: 'ready_with_exceptions',
            closeout_label_en: 'Ready with Exceptions',
            handoff_decision: 'accepted_with_warnings',
            handoff_label_en: 'Accepted with Warnings',
            release_status: 'ready_with_warnings',
            release_label_en: 'Ready with Warnings',
            releasable: true,
            blocker_count: 0
        },
        checklist: [
            { key: 'normalize', label: 'Normalize Evidence Inputs', status: 'warn', detail: '3 field(s)' },
            { key: 'review', label: 'Review Queue', status: 'warn', detail: '2 issue(s)' },
            { key: 'closeout', label: 'Review Closeout', status: 'warn', detail: 'Ready with Exceptions' },
            { key: 'handoff', label: 'Handoff Acceptance', status: 'warn', detail: 'Accepted with Warnings' },
            { key: 'release', label: 'Evidence Release Gate', status: 'pass', detail: 'Ready with Warnings' }
        ],
        release_gate: { status: 'ready_with_warnings', releasable: true, blockers: [], warnings: [{ code: 'exceptions', label: 'Release with exceptions' }] },
        read_only: true
    };
}
function snapshotBlocked() {
    return {
        scenario_fingerprint: 'scenario-blocked',
        summary: {
            scenario_fingerprint: 'scenario-blocked',
            normalized_fields: 4,
            units_affected: 2,
            review_issues: 5,
            closeout_status: 'needs_review',
            closeout_label_en: 'Needs Review',
            handoff_decision: 'pending',
            handoff_label_en: 'Pending Decision',
            release_status: 'not_ready',
            release_label_en: 'Not Ready',
            releasable: false,
            blocker_count: 2
        },
        checklist: [
            { key: 'normalize', label: 'Normalize Evidence Inputs', status: 'warn', detail: '4 field(s)' },
            { key: 'review', label: 'Review Queue', status: 'warn', detail: '5 issue(s)' },
            { key: 'closeout', label: 'Review Closeout', status: 'fail', detail: 'Needs Review' },
            { key: 'handoff', label: 'Handoff Acceptance', status: 'fail', detail: 'Pending Decision' },
            { key: 'release', label: 'Evidence Release Gate', status: 'fail', detail: 'Not Ready' }
        ],
        release_gate: {
            status: 'not_ready',
            releasable: false,
            blockers: [
                { code: 'unresolved_issues', label: '5 issue(s) still need review' },
                { code: 'handoff_acceptance', label: 'Handoff package not accepted' }
            ],
            warnings: []
        },
        read_only: true
    };
}

console.log('\n=== RMOOZ-CMO-WARGAME-READINESS-1 Main Gate ===\n');

var BRIEF = shell('cmo-wargame-readiness-brief.js');

console.log('--- CMO-WR-1: module API and main-only presence ---');
(function () {
    assert('T-1  brief module exists', fs.existsSync(BRIEF_FILE));
    assert('T-2  snapshot module exists', fs.existsSync(SNAPSHOT_FILE));
    assert('T-3  API version exposed', BRIEF.CMO_WARGAME_READINESS_BRIEF_VERSION === '1.0.0-rmooz-cmo-wargame-readiness-1');
    assert('T-4  public API methods exposed', ['buildBrief', 'buildGates', 'nextActionsFromGates', 'summaryText', 'renderBriefHtml'].every(function (name) { return typeof BRIEF[name] === 'function'; }));
})();

console.log('\n--- CMO-WR-2: GO / warning / NO-GO decisions ---');
(function () {
    var ready = BRIEF.buildBrief(snapshotReady());
    var warn = BRIEF.buildBrief(snapshotWarn());
    var blocked = BRIEF.buildBrief(snapshotBlocked());
    assert('T-1  clean snapshot is GO', ready.decision === 'go' && ready.confidence.score >= 85 && ready.next_actions.length === 0);
    assert('T-2  warning snapshot is GO with warnings', warn.decision === 'go_with_warnings' && warn.confidence.warn >= 1 && warn.next_actions.length >= 1);
    assert('T-3  blocked snapshot is NO-GO by default', blocked.decision === 'no_go' && blocked.confidence.fail >= 1 && blocked.next_actions.length >= 1);
    var training = BRIEF.buildBrief(snapshotBlocked(), { allow_training_preview: true });
    assert('T-4  blocked snapshot can be labelled training preview only', training.decision === 'training_preview_only' && /Training preview/.test(training.decision_label_en));
})();

console.log('\n--- CMO-WR-3: gates, blockers, and next actions ---');
(function () {
    var brief = BRIEF.buildBrief(snapshotBlocked());
    assert('T-1  six readiness gates are generated', arr(brief.gates).length === 6);
    assert('T-2  release blockers are digested', arr(brief.release_blockers).length === 2 && brief.release_blockers[0].source === 'release_gate');
    assert('T-3  next actions prioritize failed gates', brief.next_actions[0].status === 'fail' && /Closeout|Release|Handoff/.test(brief.next_actions[0].label));
    assert('T-4  checklist digest is preserved', arr(brief.checklist).length === arr(snapshotBlocked().checklist).length && brief.checklist[0].source === 'flow_checklist');
})();

console.log('\n--- CMO-WR-4: operator text and render output ---');
(function () {
    var brief = BRIEF.buildBrief(snapshotBlocked());
    var text = BRIEF.summaryText(brief);
    var html = BRIEF.renderBriefHtml(brief);
    assert('T-1  summary text is operator-readable', hasAll(text, ['CMO War-Game Readiness Brief', 'Decision:', 'Gates:', 'Next actions:', 'Read-only brief']));
    assert('T-2  render includes bilingual heading and gate list', hasAll(html, ['CMO War-Game Readiness', 'جاهزية اختبار المناورة', 'cmo-wargame-readiness-gates']));
    assert('T-3  render includes next action list for blockers', html.indexOf('cmo-wargame-readiness-next') !== -1 && html.indexOf('Open Release Gate') !== -1 || html.indexOf('Open Closeout') !== -1);
    assert('T-4  module can build safe fallback from null input', BRIEF.buildBrief(null).read_only === true && BRIEF.renderBriefHtml(null).indexOf('CMO War-Game Readiness') !== -1);
})();

console.log('\n--- CMO-WR-5: strict boundaries ---');
(function () {
    var source = cleanSource(src(BRIEF_FILE));
    [
        ['no fetch/network/backend route', /fetch\s*\(|XMLHttpRequest|\/api\//],
        ['no DOCX/stage-doc/SLOT_FILE path', /stage-doc|SLOT_FILE|docs\.red|docs\.blue|DOCX/i],
        ['no combat/action/doctrine mutation', /applyAction|commitAction|executeAction|autoFire|auto-fire|applyDoctrine|commitDoctrine|setDoctrine|\/doctrine/i],
        ['no protected runtime files referenced', /legacy-shim-attack_objective_draft-15\.jsonl|scenario_overrides\.json/]
    ].forEach(function (pair) { assert('T-boundary  ' + pair[0], !pair[1].test(source)); });
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
