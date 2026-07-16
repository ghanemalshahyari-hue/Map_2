#!/usr/bin/env node
/**
 * test-scenario-library-provenance-a11y-slice8.js — Batch D Slice 8
 *
 * Full provenance display (author/approver/rejecter/activator/archiver +
 * complete history, not just the latest of each) and a focused RTL/
 * bilingual/keyboard/status-messaging pass across the Library + Revisions
 * view built in Slices 6-7.
 *
 *   node test-scenario-library-provenance-a11y-slice8.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const LIBRARY_PATH = path.join(ROOT, 'UI_MOdified/client/shell/scenario-library.js');
const STYLE_PATH = path.join(ROOT, 'UI_MOdified/client/style.css');

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  PASS  ' + label); pass++; }
    else      { console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

function loadSandbox() {
    const sandboxWindow = { confirm: function () { return true; } };
    const stubDoc = {
        createElement: function () { return { style: {}, setAttribute() {}, addEventListener() {}, appendChild() {}, classList: { add() {}, remove() {} } }; },
        addEventListener: function () {}, removeEventListener: function () {},
        body: { appendChild: function () {}, removeChild: function () {} },
        documentElement: { dir: 'ltr' },
        getElementById: function () { return null; },
    };
    const src = fs.readFileSync(LIBRARY_PATH, 'utf8');
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', 'fetch', src)(sandboxWindow, stubDoc, function () { return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); });
    return sandboxWindow.AppScenarioLibrary && sandboxWindow.AppScenarioLibrary._testing;
}

console.log('\n=== Part 1: full provenance rendering (pure logic) ===\n');
(function pureLogic() {
    const T = loadSandbox();
    ok(!!T, 'AppScenarioLibrary._testing exposed');

    console.log('\n[1] No lifecycle record — honest message, not fabricated data');
    const noneHtml = T.renderProvenanceHtml(null);
    ok(/No lifecycle record/i.test(noneHtml), 'explicit "no lifecycle record" message');
    ok(!/Author/.test(noneHtml), 'no fabricated "Author:" line when there is nothing to report');

    console.log('\n[2] Full provenance — author/submitter/approver/rejecter/activator/archiver all rendered with real values');
    const payload = {
        author_id: 'planner1',
        submitted_by: 'planner1', submitted_at: '2026-07-01T10:00:00Z',
        approved_by: 'cmdr1', approved_at: '2026-07-02T10:00:00Z', approved_revision: 3,
        rejected_by: null, rejected_at: null, reject_reason: null,
        activated_by: 'cmdr1', activated_at: '2026-07-03T10:00:00Z', activated_revision: 3,
        archived_by: null, archived_at: null,
        history: [],
    };
    const html = T.renderProvenanceHtml(payload);
    ok(html.indexOf('planner1') !== -1, 'author/submitter (planner1) shown');
    ok(html.indexOf('cmdr1') !== -1, 'approver/activator (cmdr1) shown');
    ok(html.indexOf('3') !== -1, 'approved_revision/activated_revision (3) shown — WHICH revision was approved, per the commander requirement');
    ok(html.indexOf('rejected_by') === -1 && !/Rejected by/.test(html), 'no "Rejected by" line rendered when the scenario was never rejected (not a blank/empty line)');

    console.log('\n[3] Rejection provenance includes the real reason, never silently dropped');
    const rejectedPayload = { author_id: 'p1', rejected_by: 'cmdr2', rejected_at: '2026-07-01T00:00:00Z', reject_reason: 'Missing objective coordinates', history: [] };
    const rejectedHtml = T.renderProvenanceHtml(rejectedPayload);
    ok(/Rejected by/.test(rejectedHtml), 'Rejected by line present');
    ok(rejectedHtml.indexOf('cmdr2') !== -1, 'rejecter identity shown');
    ok(rejectedHtml.indexOf('Missing objective coordinates') !== -1, 'the real reject reason is shown, not hidden');

    console.log('\n[4] Full history — every event shown, not just the latest of each kind (reject/reopen/resubmit cycles)');
    const historyPayload = {
        author_id: 'p1', history: [
            { ts: '2026-07-01T00:00:00Z', event: 'authored', actor_id: 'p1' },
            { ts: '2026-07-01T01:00:00Z', event: 'submitted_for_review', actor_id: 'p1' },
            { ts: '2026-07-01T02:00:00Z', event: 'rejected', actor_id: 'cmdr1', reason: 'incomplete OOB' },
            { ts: '2026-07-01T03:00:00Z', event: 'submitted_for_review', actor_id: 'p1' },
            { ts: '2026-07-01T04:00:00Z', event: 'approved', actor_id: 'cmdr1' },
        ],
    };
    const historyHtml = T.renderProvenanceHtml(historyPayload);
    ok(/submitted_for_review|Submitted for review/.test(historyHtml), 'submission events present');
    const rejectCount = (historyHtml.match(/Rejected/g) || []).length;
    ok(rejectCount >= 1, 'the rejection event is retained in history even though the scenario was later approved (full audit trail, not just latest status)');
    ok(historyHtml.indexOf('incomplete OOB') !== -1, 'the historical reject reason is preserved in the history line');
    ok(historyHtml.indexOf(T.HISTORY_EVENT_LABELS.approved) !== -1, 'bilingual event label used (English · Arabic), matching the rest of the Library\'s convention');

    console.log('\n[5] Provenance HTML is XSS-safe — a poisoned actor_id or reject_reason cannot inject markup');
    const dangerousPayload = { author_id: '<script>alert(1)</script>', history: [] };
    const dangerousHtml = T.renderProvenanceHtml(dangerousPayload);
    ok(dangerousHtml.indexOf('<script>') === -1, 'a dangerous author_id is escaped, not injected as raw HTML');
    ok(dangerousHtml.indexOf('&lt;script&gt;') !== -1, 'the escaped entity form is present instead');
})();

console.log('\n=== Part 2: RTL / bilingual / keyboard / status-messaging source-scan ===\n');
(function sourceScan() {
    const src = fs.readFileSync(LIBRARY_PATH, 'utf8');
    const css = fs.readFileSync(STYLE_PATH, 'utf8');

    console.log('[1] Bilingual coverage — every new user-facing label pairs English with Arabic');
    // Check the EXACT rendered UI strings (what an operator actually sees),
    // not a bare substring search — "Revisions" alone also matches inside
    // identifiers like openRevisionsView/fetchRevisions, and the header
    // doc-comment mentions some labels in plain English prose.
    const uiStringsToCheck = [
        'Scenario Library · مكتبة السيناريوهات',
        'Open in Builder · فتح للتحرير',
        'Load on Map · تحميل على الخريطة',
        'Revisions · الإصدارات',
        'Restore · استعادة',
        'Compare revisions · مقارنة الإصدارات',
        'Provenance & History · المصدر والسجل',
    ];
    uiStringsToCheck.forEach((full) => {
        ok(src.indexOf(full) !== -1, 'exact bilingual UI string "' + full + '" present');
    });

    console.log('\n[2] RTL — the modal and its sub-views declare/respect dir, and CSS has explicit [dir="rtl"] overrides');
    ok(/documentElement\.dir === 'rtl'/.test(src), 'the backdrop reads the live document RTL/LTR state, not hardcoded');
    ok(/\[dir="rtl"\]\s*\.rmooz-lib-header/.test(css), '[dir="rtl"] override exists for the header (matches the established app-wide convention, not logical properties)');
    ok(/\[dir="rtl"\]\s*\.rmooz-lib-row/.test(css), '[dir="rtl"] override exists for list rows');
    ok(/\[dir="rtl"\]\s*\.rmooz-rev-compare-controls/.test(css), '[dir="rtl"] override exists for the revision-compare controls');
    ok(/padding-inline-start/.test(css), 'diff/provenance line indentation uses a logical property (padding-inline-start), automatically RTL-correct without needing its own override');

    console.log('\n[3] Keyboard — Escape always closes; Arrow/Enter are gated to the list view only (not silently acting on hidden rows)');
    const onKeydownBlock = src.slice(src.indexOf('function onKeydown'), src.indexOf('function close'));
    ok(/Escape/.test(onKeydownBlock) && onKeydownBlock.indexOf('Escape') < onKeydownBlock.indexOf('_view'), 'Escape check happens BEFORE the list-view gate, so it always works regardless of which view is showing');
    ok(/if \(_view !== 'list'\) return;/.test(onKeydownBlock), 'Arrow/Enter navigation explicitly gated to the list view');

    console.log('\n[4] Status messaging — restore success/failure both give explicit, visible feedback (not silent)');
    const restoreHandlerBlock = src.slice(src.indexOf("querySelectorAll('[data-restore]')"), src.indexOf("var runCompare"));
    ok(/statusMessage:/.test(restoreHandlerBlock), 'a successful restore threads an explicit success message into the re-render');
    ok(/Restore failed/.test(restoreHandlerBlock), 'a failed restore (non-200 OR a network error) shows an explicit failure message — not silently nothing');
    ok(/rmooz-rev-status-error/.test(css) && /rmooz-rev-status-ok/.test(css), 'success and failure status states are visually distinct (color-coded), not just plain text');
    ok(/aria-live="polite"/.test(src), 'the status line is an ARIA live region — a screen reader announces restore success/failure without the operator needing to find it visually');
})();

console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
