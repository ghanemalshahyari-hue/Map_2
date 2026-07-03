/* ============================================================================
 * test-cmo-wargame-review-board-main-batch-1.js
 * RMOOZ-CMO-WARGAME-REVIEW-BOARD-1 - Main Review Board Gate
 * ----------------------------------------------------------------------------
 * Main-app-only gate for the read-only CMO war-game evidence package review
 * board. This test does not touch, inspect, sync, rebuild, or run offline files.
 * Offline sync/testing is pending by user instruction.
 * ========================================================================== */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = __dirname;
var SHELL = path.join(ROOT, 'UI_MOdified', 'client', 'shell');
var REVIEW_FILE = path.join(SHELL, 'cmo-wargame-review-board.js');
var PKG_FILE = path.join(SHELL, 'cmo-wargame-evidence-package.js');

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
function pkg(kind) {
    var training = kind === 'training';
    var blocked = kind === 'blocked';
    var warn = kind === 'warn';
    return {
        version: '1.0.0-rmooz-cmo-wargame-evidence-package-1',
        manifest: { package_type: 'cmo_wargame_evidence_package', package_id: 'pkg-' + kind, scenario_fingerprint: 'fp-' + kind },
        scenario_fingerprint: 'fp-' + kind,
        debrief: { outcome: { key: kind, label: kind }, read_only: true },
        readiness: { release_grade_candidate: kind === 'ready', training_only: training, needs_review: warn || blocked, blocked: blocked },
        summary: {
            package_id: 'pkg-' + kind,
            scenario_fingerprint: 'fp-' + kind,
            outcome: kind,
            release_interpretation: training ? 'training-only evidence; do not claim release-grade result' : (blocked ? 'not release-grade evidence' : 'release-grade evidence candidate'),
            release_grade_candidate: kind === 'ready',
            training_only: training,
            needs_review: warn || blocked,
            blocked: blocked,
            evidence_changes: warn ? 2 : 0,
            unresolved_items: blocked ? 2 : 0,
            recommendations: 1,
            read_only: true
        },
        sections: [{ key: 'outcome', label: 'Outcome', items: [kind], read_only: true }],
        handoff_checklist: [{ key: 'read_only', label: 'Read-only package', status: 'pass' }],
        read_only: true
    };
}

console.log('\n=== RMOOZ-CMO-WARGAME-REVIEW-BOARD-1 Main Gate ===\n');

var REVIEW = shell('cmo-wargame-review-board.js');

console.log('--- CMO-RB-1: module API and main-only foundation ---');
(function () {
    assert('T-1  review board module exists', fs.existsSync(REVIEW_FILE));
    assert('T-2  evidence package foundation exists', fs.existsSync(PKG_FILE));
    assert('T-3  API version exposed', REVIEW.CMO_WARGAME_REVIEW_BOARD_VERSION === '1.0.0-rmooz-cmo-wargame-review-board-1');
    assert('T-4  public API methods exposed', ['buildReview', 'reviewDecision', 'summaryText', 'renderReviewHtml'].every(function (name) { return typeof REVIEW[name] === 'function'; }));
})();

console.log('\n--- CMO-RB-2: review outcomes ---');
(function () {
    var ready = REVIEW.buildReview(pkg('ready'));
    var warn = REVIEW.buildReview(pkg('warn'));
    var training = REVIEW.buildReview(pkg('training'));
    var blocked = REVIEW.buildReview(pkg('blocked'));
    assert('T-1  release-grade candidate is accepted', ready.decision === 'accepted' && ready.severity === 'pass');
    assert('T-2  warning package accepted with warnings', warn.decision === 'accepted_with_warnings' && warn.severity === 'warn');
    assert('T-3  training package accepted as training-only', training.decision === 'accepted_training_only' && training.severity === 'warn');
    assert('T-4  blocked package is rejected', blocked.decision === 'rejected' && blocked.severity === 'fail');
})();

console.log('\n--- CMO-RB-3: validation, reasons, signoff, and next actions ---');
(function () {
    var ready = REVIEW.buildReview(pkg('ready'), { fingerprint: 'fp-ready' });
    var mismatch = REVIEW.buildReview(pkg('ready'), { fingerprint: 'different-fp' });
    var blocked = REVIEW.buildReview(pkg('blocked'));
    assert('T-1  matching package validates cleanly', ready.validation.valid === true && ready.validation.fingerprint_match === true);
    assert('T-2  fingerprint mismatch forces review', mismatch.decision === 'needs_review' && mismatch.validation.warnings.indexOf('Scenario fingerprint mismatch.') !== -1);
    assert('T-3  blocked review includes unresolved reason', arr(blocked.reasons).some(function (r) { return r.key === 'unresolved' && r.status === 'fail'; }));
    assert('T-4  signoff checklist includes decision and training guard', arr(blocked.signoff_checklist).some(function (i) { return i.key === 'decision'; }) && arr(blocked.signoff_checklist).some(function (i) { return i.key === 'training_guard'; }));
    assert('T-5  next actions guide rejection and evidence fixes', hasAll(arr(blocked.next_actions).map(function (a) { return a.label; }).join('\n'), ['Reject package', 'unresolved section']));
})();

console.log('\n--- CMO-RB-4: text, HTML, and fallback output ---');
(function () {
    var review = REVIEW.buildReview(pkg('training'));
    var text = REVIEW.summaryText(review);
    var html = REVIEW.renderReviewHtml(review);
    assert('T-1  summary text is operator-readable', hasAll(text, ['CMO War-Game Evidence Review Board', 'Decision:', 'Reasons:', 'Next actions:', 'Read-only review']));
    assert('T-2  render includes bilingual heading and sections', hasAll(html, ['CMO War-Game Evidence Review Board', 'مراجعة حزمة أدلة المناورة', 'Sign-off checklist', 'Next actions']));
    assert('T-3  fallback from null input is safe/read-only', REVIEW.buildReview(null).read_only === true && REVIEW.renderReviewHtml(null).indexOf('CMO War-Game Evidence Review Board') !== -1);
})();

console.log('\n--- CMO-RB-5: strict boundaries ---');
(function () {
    var source = cleanSource(src(REVIEW_FILE));
    [
        ['no fetch/network/backend route', /fetch\s*\(|XMLHttpRequest|\/api\//],
        ['no browser database/storage writes', /indexedDB|openDatabase|localStorage\s*\./i],
        ['no DOCX/stage-doc/SLOT_FILE path', /stage-doc|SLOT_FILE|docs\.red|docs\.blue|DOCX/i],
        ['no combat/action/doctrine mutation', /applyAction|commitAction|executeAction|autoFire|auto-fire|applyDoctrine|commitDoctrine|setDoctrine|\/doctrine/i],
        ['no protected runtime files referenced', /legacy-shim-attack_objective_draft-15\.jsonl|scenario_overrides\.json/]
    ].forEach(function (pair) { assert('T-boundary  ' + pair[0], !pair[1].test(source)); });
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
