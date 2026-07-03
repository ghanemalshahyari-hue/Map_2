/* ============================================================================
 * test-cmo-wargame-test-card-main-batch-1.js
 * CMO-WARGAME-LIVE-WIRING-1 - CMO War-Game Operator Test Card
 * ----------------------------------------------------------------------------
 * Main-app-only gate for the read-only operator test card. It validates test
 * steps, observation focus, abort criteria, after-action checks, and copy.
 * ========================================================================== */
'use strict';

var path = require('path');

var ROOT = __dirname;
var BRIEF = path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'cmo-wargame-readiness-brief.js');
var CARD = path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'cmo-wargame-test-card.js');

var passed = 0, failed = 0;
function assert(label, cond) {
    if (cond) { console.log('  PASS  ' + label); passed++; }
    else { console.error('  FAIL  ' + label); failed++; }
}
function arr(v) { return Array.isArray(v) ? v : []; }

delete require.cache[require.resolve(BRIEF)];
delete require.cache[require.resolve(CARD)];
var RB = require(BRIEF);
var TC = require(CARD);

function snapshot() {
    return {
        version: 'snapshot-test',
        generated_at: '2026-07-03T00:00:00.000Z',
        scenario: { name: 'Operator Card Test', fingerprint: 'fp-card' },
        counts: { units: 4, ready: 3, blocked: 1, unknown: 0, review_issues: 1 },
        coverage: { coverage_pct: 76 },
        release_gate: { status: 'ready_with_warnings', releasable: false },
        closeout: { status: 'ready_with_exceptions' },
        handoff_acceptance: { decision: 'accepted_with_warnings' },
        blockers: ['fingerprint mismatch', 'review queue: 1'],
        warnings: ['accepted with warnings']
    };
}

console.log('\n=== CMO-WARGAME-LIVE-WIRING-1 Operator Test Card ===\n');

console.log('--- CMO-LW-5: card content ---');
(function () {
    assert('T-1  module version exposed', TC.CMO_WARGAME_TEST_CARD_VERSION === '1.0.0-cmo-wargame-live-wiring-1');
    var snap = snapshot();
    var brief = RB.buildBrief(snap);
    var beforeBrief = JSON.stringify(brief);
    var beforeSnapshot = JSON.stringify(snap);
    var card = TC.buildTestCard(brief, snap, { generated_at: '2026-07-03T00:00:00.000Z' });

    assert('T-2  card inherits readiness decision and run mode', card.readiness_decision === brief.decision && card.run_mode === brief.run_mode);
    assert('T-3  operator steps are actionable but read-only', arr(card.operator_steps).length >= 4 && card.operator_steps.join('|').indexOf('Start the run only in the displayed run mode') !== -1);
    assert('T-4  observation focus includes evidence and blockers', card.observation_focus.join('|').indexOf('Evidence coverage') !== -1 && card.observation_focus.join('|').indexOf('Blocker: fingerprint mismatch') !== -1);
    assert('T-5  abort criteria guard mutation and fingerprint mismatch', card.abort_criteria.join('|').indexOf('Release fingerprint changes') !== -1 && card.abort_criteria.join('|').indexOf('Doctrine or source-truth fields') !== -1);
    assert('T-6  after-action checklist covers release/audit/export', card.after_action_checklist.join('|').indexOf('release gate') !== -1 && card.after_action_checklist.join('|').indexOf('audit trail') !== -1);
    assert('T-7  build does not mutate brief or snapshot', JSON.stringify(brief) === beforeBrief && JSON.stringify(snap) === beforeSnapshot);
})();

console.log('\n--- CMO-LW-6: no-go, render, and copy ---');
(function () {
    var snap = snapshot();
    snap.counts = { units: 0, ready: 0, blocked: 0, unknown: 0, review_issues: 0 };
    snap.coverage = { coverage_pct: 0 };
    snap.release_gate = { status: 'incomplete', releasable: false };
    snap.handoff_acceptance = { decision: 'pending' };
    var noGoBrief = RB.buildBrief(snap);
    var card = TC.buildTestCard(noGoBrief, snap);
    var summary = TC.buildSummary(card);
    var html = TC.renderTestCardHtml(card);
    assert('T-1  no-go card blocks scenario start', card.operator_steps[0] === 'Do not start the scenario run.');
    assert('T-2  summary includes all operator sections', ['Operator steps:', 'Observation focus:', 'Abort / pause criteria:', 'After-action checklist:'].every(function (needle) { return summary.indexOf(needle) !== -1; }));
    assert('T-3  render emits focusable test-card sections', html.indexOf('id="usp-cmo-wargame-test-card"') !== -1 && html.indexOf('Operator test steps') !== -1 && html.indexOf('Abort / pause criteria') !== -1);

    var copied = [];
    Object.defineProperty(global, 'navigator', {
        value: { clipboard: { writeText: function (text) { copied.push(text); return true; } } },
        configurable: true
    });
    TC.copyTestCard(card);
    assert('T-4  copy uses browser clipboard when available', copied.length === 1 && copied[0].indexOf('CMO War-Game Operator Test Card') === 0);
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);

