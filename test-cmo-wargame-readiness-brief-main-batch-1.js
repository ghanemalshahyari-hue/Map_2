/* ============================================================================
 * test-cmo-wargame-readiness-brief-main-batch-1.js
 * CMO-WARGAME-LIVE-WIRING-1 - CMO War-Game Readiness Brief
 * ----------------------------------------------------------------------------
 * Main-app-only gate. It validates the read-only CMO readiness decision built
 * from the scenario evidence flow snapshot. No offline runtime is inspected.
 * ========================================================================== */
'use strict';

var path = require('path');

var ROOT = __dirname;
var BRIEF = path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'cmo-wargame-readiness-brief.js');

var passed = 0, failed = 0;
function assert(label, cond) {
    if (cond) { console.log('  PASS  ' + label); passed++; }
    else { console.error('  FAIL  ' + label); failed++; }
}
function clone(v) { return JSON.parse(JSON.stringify(v)); }

delete require.cache[require.resolve(BRIEF)];
var API = require(BRIEF);

function snapshot(overrides) {
    var base = {
        version: 'snapshot-test',
        generated_at: '2026-07-03T00:00:00.000Z',
        scenario: { name: 'Readiness Test', fingerprint: 'fp-readiness' },
        counts: { units: 4, ready: 4, blocked: 0, unknown: 0, review_issues: 0 },
        coverage: { coverage_pct: 92 },
        release_gate: { status: 'ready_for_release', status_label_en: 'Ready for Release', releasable: true },
        closeout: { status: 'ready_for_handoff', status_label_en: 'Ready for Handoff' },
        handoff_acceptance: { decision: 'accepted', decision_label_en: 'Accepted', fingerprint_match: true },
        blockers: [],
        warnings: []
    };
    Object.keys(overrides || {}).forEach(function (key) { base[key] = overrides[key]; });
    return base;
}

console.log('\n=== CMO-WARGAME-LIVE-WIRING-1 Readiness Brief ===\n');

console.log('--- CMO-LW-3: readiness decisions ---');
(function () {
    assert('T-1  module version exposed', API.CMO_WARGAME_READINESS_BRIEF_VERSION === '1.0.0-cmo-wargame-live-wiring-1');

    var go = API.buildBrief(snapshot(), { generated_at: '2026-07-03T00:00:00.000Z' });
    assert('T-2  release-grade scenario produces GO', go.decision === 'go' && go.decision_label_en === 'GO' && go.confidence >= 90);

    var warn = API.buildBrief(snapshot({
        counts: { units: 4, ready: 3, blocked: 1, unknown: 0, review_issues: 1 },
        coverage: { coverage_pct: 76 },
        release_gate: { status: 'ready_with_warnings', status_label_en: 'Ready with Warnings', releasable: false },
        closeout: { status: 'ready_with_exceptions', status_label_en: 'Ready with Exceptions' },
        handoff_acceptance: { decision: 'accepted_with_warnings', decision_label_en: 'Accepted with Warnings', fingerprint_match: true },
        blockers: ['fingerprint warning']
    }));
    assert('T-3  accepted warnings produce GO with warnings', warn.decision === 'go_with_warnings' && warn.decision_label_en === 'GO with warnings' && warn.next_actions.join('|').indexOf('CMO monitoring') !== -1);

    var training = API.buildBrief(snapshot({
        counts: { units: 3, ready: 1, blocked: 1, unknown: 1, review_issues: 3 },
        coverage: { coverage_pct: 45 },
        release_gate: { status: 'not_ready', releasable: false },
        handoff_acceptance: { decision: 'pending' }
    }));
    assert('T-4  partial evidence produces training preview only', training.decision === 'training_preview_only' && training.confidence <= 68 && /training preview/i.test(training.run_mode));

    var noGo = API.buildBrief(snapshot({
        counts: { units: 0, ready: 0, blocked: 0, unknown: 0, review_issues: 0 },
        coverage: { coverage_pct: 0 },
        release_gate: { status: 'incomplete', releasable: false },
        handoff_acceptance: { decision: 'pending' }
    }));
    assert('T-5  no evidence produces NO-GO', noGo.decision === 'no_go' && noGo.decision_label_en === 'NO-GO' && noGo.confidence <= 35);
})();

console.log('\n--- CMO-LW-4: render/copy and non-mutation ---');
(function () {
    var srcSnapshot = snapshot({
        counts: { units: 4, ready: 3, blocked: 1, unknown: 0, review_issues: 1 },
        coverage: { coverage_pct: 76 },
        release_gate: { status: 'ready_with_warnings', releasable: false },
        handoff_acceptance: { decision: 'accepted_with_warnings' },
        blockers: ['handoff warning']
    });
    var before = JSON.stringify(srcSnapshot);
    var brief = API.buildBrief(srcSnapshot);
    var summary = API.buildSummary(brief);
    var html = API.renderBriefHtml(brief);
    assert('T-1  brief build does not mutate source snapshot', JSON.stringify(srcSnapshot) === before);
    assert('T-2  summary names decision, confidence, run mode, and disclaimer', ['CMO War-Game Readiness Brief', 'Decision:', 'Confidence:', 'Run mode:', 'Read-only CMO readiness brief'].every(function (needle) { return summary.indexOf(needle) !== -1; }));
    assert('T-3  render emits readiness card and next actions', html.indexOf('usp-cmo-readiness-card') !== -1 && html.indexOf('CMO War-Game Readiness') !== -1 && html.indexOf('Next actions') !== -1);

    var copied = [];
    Object.defineProperty(global, 'navigator', {
        value: { clipboard: { writeText: function (text) { copied.push(text); return true; } } },
        configurable: true
    });
    API.copyBrief(brief);
    assert('T-4  copy uses browser clipboard when available', copied.length === 1 && copied[0].indexOf('CMO War-Game Readiness Brief') === 0);
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);

