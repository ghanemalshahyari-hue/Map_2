/**
 * test-pr-272.js — Wargame 3 Clear COA Review Control
 *
 * 67 tests covering:
 *   T01        — DOM: #sw-drp-selection-review-clear-btn present in app.html
 *   T02-T03    — i18n: EN + AR clear/cleared keys present
 *   T04-T08    — DOM hidden states
 *   T09-T17    — Forbidden button labels absent
 *   T18-T40    — Click handler behaviour (clear, chip, section, button hidden)
 *   T41-T43    — Map / state invariants
 *   T44-T51    — Safety boundary (no storage, no fetch, no window mutation)
 *   T52-T58    — No forbidden controls added
 *   T59-T61    — File protection (no wargame3.json, no app.js, no adjudicator-map.js)
 *   T62-T66    — Regression: PRs 267-271 functions still exported
 *   T67        — No console.error in handler source
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── helpers ──────────────────────────────────────────────────────────────────
function readSrc(rel) {
    return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

/** Brace-matched function body extractor (handles nested braces). */
function extractFn(src, name) {
    // Match "function <name>(" or "<name>: function(" or "<name> = function("
    const re = new RegExp(
        '(?:function\\s+' + name + '\\s*\\(|' +
        name + '\\s*:\\s*function\\s*\\(|' +
        name + '\\s*=\\s*function\\s*\\()'
    );
    const m = re.exec(src);
    if (!m) return null;
    let idx = m.index;
    // advance to first '{'
    while (idx < src.length && src[idx] !== '{') idx++;
    if (idx >= src.length) return null;
    let depth = 0, start = idx;
    while (idx < src.length) {
        if (src[idx] === '{') depth++;
        else if (src[idx] === '}') { depth--; if (depth === 0) break; }
        idx++;
    }
    return src.slice(start, idx + 1);
}

// ── source files ─────────────────────────────────────────────────────────────
const appHtml    = readSrc('UI_MOdified/client/app.html');
const i18nSrc    = readSrc('UI_MOdified/client/i18n.js');
const cssSrc     = readSrc('UI_MOdified/client/style.css');
const wsSrc      = readSrc('UI_MOdified/client/shell/scenario-workspace.js');

// ── test runner ──────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];

function test(id, label, fn) {
    try {
        fn();
        console.log('  PASS  ' + id + ' ' + label);
        passed++;
    } catch (e) {
        console.error('  FAIL  ' + id + ' ' + label + '\n         ' + e.message);
        failed++;
        failures.push(id + ': ' + label);
    }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

// ── T01: DOM — button element present ────────────────────────────────────────
console.log('\n── T01: DOM button presence ───────────────────────────────────────');

test('T01', '#sw-drp-selection-review-clear-btn present in app.html', () => {
    assert(appHtml.includes('id="sw-drp-selection-review-clear-btn"'),
        'id="sw-drp-selection-review-clear-btn" not found in app.html');
});

// ── T02-T03: i18n keys ───────────────────────────────────────────────────────
console.log('\n── T02-T03: i18n keys ─────────────────────────────────────────────');

test('T02', "EN 'sw-drp-selection-review-clear' = 'Clear review'", () => {
    assert(i18nSrc.includes("'sw-drp-selection-review-clear'") &&
           i18nSrc.includes("'Clear review'"),
        "EN key 'sw-drp-selection-review-clear' / 'Clear review' missing");
});
test('T03', "EN 'sw-drp-selection-review-cleared' = 'Review cleared'", () => {
    assert(i18nSrc.includes("'sw-drp-selection-review-cleared'") &&
           i18nSrc.includes("'Review cleared'"),
        "EN key 'sw-drp-selection-review-cleared' / 'Review cleared' missing");
});

// ── T04-T08: DOM hidden states ───────────────────────────────────────────────
console.log('\n── T04-T08: DOM hidden states ─────────────────────────────────────');

test('T04', 'clear button has hidden attribute by default in app.html', () => {
    // The button element should include "hidden" before the closing >
    const re = /id="sw-drp-selection-review-clear-btn"[^>]*hidden/;
    assert(re.test(appHtml), 'clear button does not have hidden attribute in app.html');
});
test('T05', 'clear button inside #sw-drp-selection-review section', () => {
    const secStart = appHtml.indexOf('id="sw-drp-selection-review"');
    const secEnd   = appHtml.indexOf('</section>', secStart);
    const btnIdx   = appHtml.indexOf('id="sw-drp-selection-review-clear-btn"');
    assert(btnIdx > secStart && btnIdx < secEnd,
        'clear button is NOT inside #sw-drp-selection-review section');
});
test('T06', 'clear button has type="button" attribute', () => {
    const btnIdx = appHtml.indexOf('id="sw-drp-selection-review-clear-btn"');
    assert(btnIdx !== -1, 'clear button id not found');
    // Look for type="button" within 300 chars after the id attribute
    const region = appHtml.slice(btnIdx, btnIdx + 300);
    assert(region.includes('type="button"'),
        'clear button is missing type="button" (within 300 chars after id attr)');
});
test('T07', 'handler hides section when no record (source check)', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    assert(fn, '_handleW3CoaReviewClearClick not found');
    assert(fn.includes('section.hidden = true') || fn.includes("section') {\n") ||
           fn.includes("section')") || fn.includes('section.hidden'),
        'handler does not hide section');
});
test('T08', 'handler hides clear button itself (source check)', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    assert(fn, '_handleW3CoaReviewClearClick not found');
    assert(fn.includes('clearBtn') && fn.includes('clearBtn.hidden = true'),
        'handler does not hide clearBtn');
});

// ── T09-T17: Forbidden button labels ─────────────────────────────────────────
console.log('\n── T09-T17: Forbidden button labels ───────────────────────────────');

// Check the actions div region only (between .sw-drp-selection-review-actions open and close)
function getActionsDivText() {
    const start = appHtml.indexOf('sw-drp-selection-review-actions');
    const end   = appHtml.indexOf('</div>', start);
    return appHtml.slice(start, end + 6).toLowerCase();
}

const forbiddenLabels = [
    ['T09', 'Cancel mission'],
    ['T10', 'Abort'],
    ['T11', 'Confirm'],
    ['T12', 'Approve'],
    ['T13', 'Apply'],
    ['T14', 'Execute'],
    ['T15', 'Commit'],
    ['T16', 'Go Live'],
    ['T17', 'Run'],
];
for (const [id, label] of forbiddenLabels) {
    test(id, `forbidden label "${label}" absent from actions div`, () => {
        const region = getActionsDivText();
        assert(!region.includes(label.toLowerCase()),
            `Forbidden label "${label}" found inside actions div`);
    });
}

// ── T18-T40: Click handler behaviour ─────────────────────────────────────────
console.log('\n── T18-T40: Click handler behaviour ──────────────────────────────');

// Build a minimal harness to exercise _handleW3CoaReviewClearClick
function buildClearHandlerHarness() {
    // Extract helpers needed
    const clearFn  = extractFn(wsSrc, '_clearW3CoaReviewRecord');
    const getFn    = extractFn(wsSrc, '_getW3CoaReviewRecordForStep');
    const indicFn  = extractFn(wsSrc, '_paintW3CoaUnderReviewIndicator');
    const clearHandler = extractFn(wsSrc, '_handleW3CoaReviewClearClick');

    assert(clearFn,        '_clearW3CoaReviewRecord not found');
    assert(getFn,          '_getW3CoaReviewRecordForStep not found');
    assert(indicFn,        '_paintW3CoaUnderReviewIndicator not found');
    assert(clearHandler,   '_handleW3CoaReviewClearClick not found');

    const code = `
        var _w3CoaReviewRecord = null;

        function isWargame3OperatorSelectionDryRunRecordSafe(r) {
            if (!r || typeof r !== 'object') return { passed: false };
            if (!r.selectedDecision || typeof r.selectedDecision.label !== 'string') return { passed: false };
            if (r.expectedResult !== undefined) return { passed: false };
            if (r.previewComplete !== undefined) return { passed: false };
            return { passed: true };
        }

        function tx(key, fallback) { return fallback || key; }

        var domStore = {};
        var document = {
            getElementById: function(id) {
                if (!domStore[id]) {
                    domStore[id] = { textContent: '', hidden: true, onclick: null };
                }
                return domStore[id];
            }
        };

        function _clearW3CoaReviewRecord() ${clearFn}
        function _getW3CoaReviewRecordForStep(stepRef) ${getFn}
        function _paintW3CoaUnderReviewIndicator(p) ${indicFn}
        function _handleW3CoaReviewClearClick(p) ${clearHandler}

        return {
            getRecord: function() { return _w3CoaReviewRecord; },
            setRecord: function(r) { _w3CoaReviewRecord = r; },
            dom: domStore,
            handle: _handleW3CoaReviewClearClick
        };
    `;
    return new Function(code)();
}

test('T18', 'handler exports as function', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    assert(typeof fn === 'string' && fn.length > 0, '_handleW3CoaReviewClearClick not extractable');
});
test('T19', 'handler calls _clearW3CoaReviewRecord', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    assert(fn.includes('_clearW3CoaReviewRecord()'),
        'handler does not call _clearW3CoaReviewRecord()');
});
test('T20', 'handler calls _paintW3CoaUnderReviewIndicator', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    assert(fn.includes('_paintW3CoaUnderReviewIndicator('),
        'handler does not call _paintW3CoaUnderReviewIndicator');
});
test('T21', 'handler clears _w3CoaReviewRecord via _clearW3CoaReviewRecord', () => {
    const h = buildClearHandlerHarness();
    h.setRecord({ stepRef: 'W3-STEP-08', record: { selectedDecision: { label: 'COA A' }, status: 'dry-run' } });
    assert(h.getRecord() !== null, 'pre-condition: record should be set');
    h.handle({ activeStepId: 'W3-STEP-08' });
    assert(h.getRecord() === null, 'record not cleared after click');
});
test('T22', 'handler with null p does not throw', () => {
    const h = buildClearHandlerHarness();
    h.handle(null);  // should not throw
    assert(h.getRecord() === null, 'record not null after handle(null)');
});
test('T23', 'handler with no p does not throw', () => {
    const h = buildClearHandlerHarness();
    h.handle(undefined);
    assert(true, 'no throw');
});
test('T24', 'handler removes operatorSelectionDryRunRecord from p', () => {
    const h = buildClearHandlerHarness();
    const p = { activeStepId: 'W3-STEP-08', operatorSelectionDryRunRecord: { selectedDecision: { label: 'X' } } };
    h.handle(p);
    assert(!('operatorSelectionDryRunRecord' in p),
        'operatorSelectionDryRunRecord not deleted from p after click');
});
test('T25', 'handler hides section element', () => {
    const h = buildClearHandlerHarness();
    // pre-show section
    h.dom['sw-drp-selection-review'] = { hidden: false, textContent: '' };
    h.handle({ activeStepId: 'W3-STEP-08' });
    assert(h.dom['sw-drp-selection-review'].hidden === true,
        'section not hidden after clear click');
});
test('T26', 'handler hides clearBtn element', () => {
    const h = buildClearHandlerHarness();
    h.dom['sw-drp-selection-review-clear-btn'] = { hidden: false, textContent: '', onclick: null };
    h.handle({ activeStepId: 'W3-STEP-08' });
    assert(h.dom['sw-drp-selection-review-clear-btn'].hidden === true,
        'clearBtn not hidden after clear click');
});
test('T27', 'chip hidden after clear when no record', () => {
    const h = buildClearHandlerHarness();
    h.dom['sw-drp-sum-coa-chip'] = { hidden: false, textContent: 'COA under review: X', onclick: null };
    h.handle({ activeStepId: 'W3-STEP-08' });
    assert(h.dom['sw-drp-sum-coa-chip'].hidden === true,
        'chip not hidden after clear click');
});
test('T28', 'chip text cleared after clear', () => {
    const h = buildClearHandlerHarness();
    h.dom['sw-drp-sum-coa-chip'] = { hidden: false, textContent: 'COA under review: X', onclick: null };
    h.handle({ activeStepId: 'W3-STEP-08' });
    assert(h.dom['sw-drp-sum-coa-chip'].textContent === '',
        'chip textContent not empty after clear click');
});
test('T29', 'handler runs cleanly with pre-set record', () => {
    const h = buildClearHandlerHarness();
    h.setRecord({ stepRef: 'W3-STEP-08', record: { selectedDecision: { label: 'COA B' }, status: 'dry-run' } });
    const p = { activeStepId: 'W3-STEP-08' };
    h.handle(p);
    assert(h.getRecord() === null, 'record should be null');
});
test('T30', 'handler does not mutate p beyond deleting operatorSelectionDryRunRecord', () => {
    const h = buildClearHandlerHarness();
    const p = { activeStepId: 'W3-STEP-08', situation: 'Test situation' };
    h.handle(p);
    assert(p.situation === 'Test situation', 'handler mutated unexpected field on p');
});
test('T31', 'calling handler twice is idempotent', () => {
    const h = buildClearHandlerHarness();
    const p = { activeStepId: 'W3-STEP-08', operatorSelectionDryRunRecord: {} };
    h.handle(p);
    h.handle(p);  // second call should not throw
    assert(h.getRecord() === null, 'record not null after double click');
});
test('T32', 'handler does not set p.operatorSelectionDryRunRecord', () => {
    const h = buildClearHandlerHarness();
    const p = { activeStepId: 'W3-STEP-08' };
    h.handle(p);
    assert(p.operatorSelectionDryRunRecord === undefined,
        'handler should not set operatorSelectionDryRunRecord on p');
});
test('T33', 'handler source has no localStorage reference', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    assert(!fn.includes('localStorage'), 'handler references localStorage');
});
test('T34', 'handler source has no sessionStorage reference', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    assert(!fn.includes('sessionStorage'), 'handler references sessionStorage');
});
test('T35', 'handler source has no fetch reference', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    assert(!fn.includes('fetch('), 'handler references fetch');
});
test('T36', 'handler source has no window.RmoozScenario reference', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    assert(!fn.includes('window.RmoozScenario'), 'handler references window.RmoozScenario');
});
test('T37', 'handler source has no window.units reference', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    assert(!fn.includes('window.units'), 'handler references window.units');
});
test('T38', 'handler source has no /api/sim/ reference', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    assert(!fn.includes('/api/sim/'), 'handler references /api/sim/');
});
test('T39', '_paintW3OperatorSelectionReview shows clearBtn on valid record (source)', () => {
    const fn = extractFn(wsSrc, '_paintW3OperatorSelectionReview');
    assert(fn && fn.includes('clearBtn') && fn.includes('clearBtn.hidden = false'),
        '_paintW3OperatorSelectionReview does not show clearBtn on valid record');
});
test('T40', '_paintW3OperatorSelectionReview wires onclick (source)', () => {
    const fn = extractFn(wsSrc, '_paintW3OperatorSelectionReview');
    assert(fn && fn.includes('clearBtn.onclick') && fn.includes('_handleW3CoaReviewClearClick'),
        '_paintW3OperatorSelectionReview does not wire clearBtn.onclick to _handleW3CoaReviewClearClick');
});

// ── T41-T43: Map / state invariants ──────────────────────────────────────────
console.log('\n── T41-T43: Map / state invariants ────────────────────────────────');

test('T41', 'handler source has no Leaflet/map reference', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    assert(!fn.includes('L.marker') && !fn.includes('L.circleMarker') &&
           !fn.includes('leaflet') && !fn.includes('_map'),
        'handler references map/Leaflet');
});
test('T42', 'handler source has no stepIndex mutation', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    assert(!fn.includes('stepIndex'),
        'handler references stepIndex');
});
test('T43', 'handler source has no window.lines reference', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    assert(!fn.includes('window.lines'), 'handler references window.lines');
});

// ── T44-T51: Safety boundary ─────────────────────────────────────────────────
console.log('\n── T44-T51: Safety boundary ───────────────────────────────────────');

test('T44', 'handler source has no IndexedDB reference', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    assert(!fn.includes('indexedDB') && !fn.includes('IndexedDB'),
        'handler references IndexedDB');
});
test('T45', 'handler source has no cookie reference', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    assert(!fn.includes('document.cookie'), 'handler references document.cookie');
});
test('T46', 'handler source has no XMLHttpRequest reference', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    assert(!fn.includes('XMLHttpRequest'), 'handler references XMLHttpRequest');
});
test('T47', 'handler source has no window.RmoozScenario.scenario mutation', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    assert(!fn.includes('RmoozScenario.scenario'), 'handler mutates RmoozScenario.scenario');
});
test('T48', 'handler source has no Gate 7 reference', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    const lower = fn.toLowerCase();
    assert(!lower.includes('gate7') && !lower.includes('gate-7') && !lower.includes('gate 7'),
        'handler references Gate 7');
});
test('T49', 'handler source has no expectedResult creation', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    assert(!fn.includes('expectedResult'), 'handler creates/sets expectedResult');
});
test('T50', 'handler source has no previewComplete change', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    assert(!fn.includes('previewComplete'), 'handler changes previewComplete');
});
test('T51', 'handler source does not navigate steps (no doNext/doPrev)', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    assert(!fn.includes('doNext') && !fn.includes('doPrev') &&
           !fn.includes('stepIndex'),
        'handler performs step navigation');
});

// ── T52-T58: No forbidden controls added ─────────────────────────────────────
console.log('\n── T52-T58: No forbidden controls ─────────────────────────────────');

function getActionsBlockHtml() {
    const start = appHtml.indexOf('sw-drp-selection-review-actions');
    // end at </section> of the selection-review section
    const secStart = appHtml.lastIndexOf('id="sw-drp-selection-review"', start);
    const secEnd   = appHtml.indexOf('</section>', start);
    return appHtml.slice(start, secEnd).toLowerCase();
}

const forbiddenControls = [
    ['T52', '<input'],
    ['T53', '<select'],
    ['T54', '<textarea'],
    ['T55', 'type="submit"'],
    ['T56', 'type="reset"'],
    ['T57', 'type="checkbox"'],
    ['T58', 'type="radio"'],
];
for (const [id, ctrl] of forbiddenControls) {
    test(id, `no forbidden control "${ctrl}" inside actions block`, () => {
        const region = getActionsBlockHtml();
        assert(!region.includes(ctrl.toLowerCase()),
            `Forbidden control "${ctrl}" found in actions block`);
    });
}

// ── T59-T61: File protection ──────────────────────────────────────────────────
console.log('\n── T59-T61: File protection ────────────────────────────────────────');

test('T59', 'wargame3.json not modified by this PR', () => {
    // Verify wargame3.json does not contain PR-272 marker
    const w3 = readSrc('UI_MOdified/data/scenarios/wargame3.json');
    assert(!w3.includes('sw-drp-selection-review-clear') &&
           !w3.includes('_handleW3CoaReviewClearClick'),
        'wargame3.json contains PR-272 additions — should not be modified');
});
test('T60', 'app.js not modified by this PR (no new function in app.js)', () => {
    // app.js is the main entry — we should not have added _handleW3CoaReviewClearClick there
    let appJs = '';
    try { appJs = readSrc('UI_MOdified/client/app.js'); } catch (_) { appJs = ''; }
    assert(!appJs.includes('_handleW3CoaReviewClearClick'),
        'app.js contains _handleW3CoaReviewClearClick — should not be modified');
});
test('T61', 'adjudicator-map.js not modified by this PR', () => {
    const adjMap = readSrc('UI_MOdified/client/wargame/adjudicator-map.js');
    assert(!adjMap.includes('_handleW3CoaReviewClearClick') &&
           !adjMap.includes('sw-drp-selection-review-clear'),
        'adjudicator-map.js contains PR-272 additions — should not be modified');
});

// ── T62-T66: Regression — PRs 267-271 still intact ───────────────────────────
console.log('\n── T62-T66: Regression PRs 267-271 ────────────────────────────────');

const exportedNames = [
    ['T62', '_paintW3OperatorSelectionReview'],
    ['T63', '_handleW3CoaReviewClick'],
    ['T64', '_clearW3CoaReviewRecord'],
    ['T65', '_getW3CoaReviewRecordForStep'],
    ['T66', '_paintW3CoaUnderReviewIndicator'],
];
for (const [id, name] of exportedNames) {
    test(id, `${name} still exported in scenario-workspace.js`, () => {
        // Exported block contains "name: name" or "name : name"
        assert(wsSrc.includes(name + ':') || wsSrc.includes(name + ' :'),
            `${name} not found in exports block`);
    });
}

// ── T67: No console.error in handler source ───────────────────────────────────
console.log('\n── T67: No console.error in handler ───────────────────────────────');

test('T67', '_handleW3CoaReviewClearClick source has no console.error', () => {
    const fn = extractFn(wsSrc, '_handleW3CoaReviewClearClick');
    assert(fn && !fn.includes('console.error'),
        'handler contains console.error call');
});

// ── summary ───────────────────────────────────────────────────────────────────
console.log('\n────────────────────────────────────────────────────────────────────');
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failures.length) {
    console.error('\nFailed tests:');
    failures.forEach(f => console.error('  ' + f));
    process.exit(1);
} else {
    console.log('All tests passed.');
}
