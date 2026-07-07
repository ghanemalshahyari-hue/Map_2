/* ============================================================================
 * test-cmo-wargame-module-wiring-1.js
 * CMO War-Game Module Wiring Gate
 * ----------------------------------------------------------------------------
 * Main-app-only wiring for read-only CMO review-board and decision-ledger
 * modules. Does not touch offline or DB-Lite.
 * ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const shellPath = (name) => path.join(ROOT, 'UI_MOdified', 'client', 'shell', name);

const HTML = read('UI_MOdified/client/app.html');
const REVIEW_SRC = read('UI_MOdified/client/shell/cmo-wargame-review-board.js');
const LEDGER_SRC = read('UI_MOdified/client/shell/cmo-wargame-decision-ledger.js');

let passed = 0;
let failed = 0;
function ok(label, cond) {
    if (cond) { passed += 1; console.log('  PASS  ' + label); }
    else { failed += 1; console.error('  FAIL  ' + label); }
}

function scriptCount(scriptName) {
    const re = new RegExp('<script\\s+src="shell/' + scriptName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const m = HTML.match(re);
    return m ? m.length : 0;
}

function scriptIndex(scriptName) {
    return HTML.indexOf('<script src="shell/' + scriptName);
}

function cleanSource(text) {
    return String(text || '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
}

console.log('\n=== CMO war-game module wiring gate ===\n');

console.log('--- CMO-WIRE-1: app script order ---');
[
    'cmo-wargame-readiness-brief.js',
    'cmo-wargame-test-card.js',
    'cmo-wargame-run-instrumentation.js',
    'cmo-wargame-after-action-debrief.js',
    'cmo-wargame-evidence-package.js',
    'cmo-wargame-review-board.js',
    'cmo-wargame-decision-ledger.js'
].forEach((name) => ok('T-count  ' + name + ' loaded once', scriptCount(name) === 1));
ok('T-1 review-board loads after evidence-package',
    scriptIndex('cmo-wargame-evidence-package.js') < scriptIndex('cmo-wargame-review-board.js'));
ok('T-2 decision-ledger loads after review-board',
    scriptIndex('cmo-wargame-review-board.js') < scriptIndex('cmo-wargame-decision-ledger.js'));
ok('T-3 decision-ledger loads before unit-status-panel consumers',
    scriptIndex('cmo-wargame-decision-ledger.js') < scriptIndex('unit-status-panel.js'));

console.log('\n--- CMO-WIRE-2: module APIs and ledger/review-board handshake ---');
const REVIEW = require(shellPath('cmo-wargame-review-board.js'));
const LEDGER = require(shellPath('cmo-wargame-decision-ledger.js'));
ok('T-1 review-board API exports expected methods',
    REVIEW.CMO_WARGAME_REVIEW_BOARD_VERSION === '1.0.0-rmooz-cmo-wargame-review-board-1' &&
    typeof REVIEW.buildReview === 'function' &&
    typeof REVIEW.renderReviewHtml === 'function');
ok('T-2 decision-ledger API exports expected methods',
    LEDGER.CMO_WARGAME_DECISION_LEDGER_VERSION === '1.0.0-rmooz-cmo-wargame-decision-ledger-1' &&
    typeof LEDGER.buildLedger === 'function' &&
    typeof LEDGER.renderLedgerHtml === 'function');
ok('T-3 decision-ledger accepts the current review-board buildReview API',
    LEDGER_SRC.includes('RB.buildReview') && LEDGER_SRC.includes('buildReviewBoard'));

const reviewablePackage = {
    version: '1.0.0-rmooz-cmo-wargame-evidence-package-1',
    manifest: { package_type: 'cmo_wargame_evidence_package', package_id: 'pkg-wire', scenario_fingerprint: 'fp-wire' },
    scenario_fingerprint: 'fp-wire',
    debrief: { outcome: { key: 'completed', label: 'Completed' }, read_only: true },
    readiness: { release_grade_candidate: true, training_only: false, needs_review: false, blocked: false },
    summary: {
        package_id: 'pkg-wire',
        scenario_fingerprint: 'fp-wire',
        outcome: 'CMO war-game run completed',
        release_interpretation: 'release-grade evidence candidate',
        release_grade_candidate: true,
        training_only: false,
        needs_review: false,
        blocked: false,
        evidence_changes: 0,
        unresolved_items: 0,
        recommendations: 1,
        read_only: true
    },
    sections: [{ key: 'outcome', label: 'Outcome', items: ['Completed'], read_only: true }],
    handoff_checklist: [{ key: 'read_only', label: 'Read-only package', status: 'pass' }],
    read_only: true
};
const ledger = LEDGER.buildLedger(null, {
    generated_at: '2026-07-06T00:00:00.000Z',
    evidence_package: reviewablePackage
});
ok('T-4 reviewable package auto-includes review board source when module is loaded',
    ledger && ledger.sources && ledger.sources.review_board === true);
ok('T-5 reviewable package ledger includes review_board event',
    Array.isArray(ledger.events) && ledger.events.some((evt) => evt && evt.source === 'review_board'));

console.log('\n--- CMO-WIRE-3: read-only boundaries stay closed ---');
[
    ['review-board', REVIEW_SRC],
    ['decision-ledger', LEDGER_SRC]
].forEach(([name, source]) => {
    const clean = cleanSource(source);
    [
        ['no fetch/network/backend route', /fetch\s*\(|XMLHttpRequest|\/api\//],
        ['no browser database/storage writes', /indexedDB|openDatabase|localStorage\s*\./i],
        ['no DOCX/stage-doc/SLOT_FILE path', /stage-doc|SLOT_FILE|docs\.red|docs\.blue|DOCX/i],
        ['no combat/action/doctrine mutation', /applyAction|commitAction|executeAction|autoFire|auto-fire|applyDoctrine|commitDoctrine|setDoctrine|\/doctrine/i],
        ['no protected runtime files referenced', /legacy-shim-attack_objective_draft-15\.jsonl|scenario_overrides\.json/]
    ].forEach(([label, re]) => ok('T-boundary  ' + name + ' ' + label, !re.test(clean)));
});

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
if (failed) process.exit(1);
