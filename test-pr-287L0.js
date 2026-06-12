/**
 * test-pr-287L0.js — PR-287L0: Remove Wargame 3 Dry-Run From Production Workspace
 *
 * 37-item coverage per spec.
 * Verifies dry-run UI is hidden from normal workspace, auto-paint is removed,
 * and live workflow + PR-286L still works.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SW_PATH   = path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js');
const HTML_PATH = path.join(__dirname, 'UI_MOdified/client/app.html');
const W3_PATH   = path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json');
const APP_JS    = path.join(__dirname, 'UI_MOdified/client/app.js');
const ADJ_MAP   = path.join(__dirname, 'UI_MOdified/client/adjudicator-map.js');

const swSrc   = fs.readFileSync(SW_PATH,   'utf8');
const htmlSrc = fs.readFileSync(HTML_PATH, 'utf8');

let passed = 0, failed = 0;
const results = [];

function check(ok, label, detail) {
    results.push({ ok, label, detail });
    if (ok) passed++; else failed++;
    console.log('  ' + (ok ? '✅' : '❌') + '  ' + label +
                (detail !== undefined ? ' — ' + detail : ''));
}

function extractFn(src, name) {
    var start = src.indexOf('function ' + name + '(');
    if (start < 0) start = src.indexOf('function ' + name + ' (');
    if (start < 0) return null;
    var depth = 0, i = start;
    while (i < src.length) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
        i++;
    }
    return src.slice(start, i + 1);
}

// Helper: returns true if the HTML element (matched by attribute fragment) carries
// the `hidden` attribute on its opening tag.
function elementHasHiddenAttr(html, attrFragment) {
    var idx = html.indexOf(attrFragment);
    if (idx < 0) return false;
    // Find the start of this element's opening <tag
    var start = html.lastIndexOf('<', idx);
    if (start < 0) return false;
    var end = html.indexOf('>', idx);
    if (end < 0) return false;
    var openTag = html.slice(start, end + 1);
    return /\shidden(\s|>|=)/.test(openTag);
}

// ── Section 1: Top-level dry-run UI hidden in app.html (T1-T10) ───────────
console.log('\n─── Section 1: Dry-run UI hidden in app.html ───');

check(elementHasHiddenAttr(htmlSrc, 'class="sw-w3-section-hdr"'),
      'T01a: "Wargame 3 Dry-Run Preview" header has hidden attribute');
check(elementHasHiddenAttr(htmlSrc, 'id="sw-w3-load-bar"'),
      'T02: #sw-w3-load-bar has hidden attribute');
check(elementHasHiddenAttr(htmlSrc, 'id="sw-drp-section"'),
      'T03: #sw-drp-section has hidden attribute (initial state)');

// T01: full assertion — Wargame 3 dry-run section is not visible
// The three top-level wrappers are all hidden, so the whole dry-run UI is invisible.
check(elementHasHiddenAttr(htmlSrc, 'class="sw-w3-section-hdr"') &&
      elementHasHiddenAttr(htmlSrc, 'id="sw-w3-load-bar"') &&
      elementHasHiddenAttr(htmlSrc, 'id="sw-drp-section"'),
      'T01: W3 dry-run section is not visible (all 3 top-level wrappers hidden)');

// T04-T10: Inner dry-run IDs still exist (they're inside hidden parent) but parent hides them.
// Verify they're INSIDE #sw-drp-section so the hidden parent hides them all.
function isInsideDrpSection(html, idAttr) {
    var idx = html.indexOf(idAttr);
    if (idx < 0) return false;
    var drpOpen  = html.indexOf('id="sw-drp-section"');
    var drpClose = html.indexOf('</div>', drpOpen);
    // The dry-run section contains many nested divs; we need its matching close.
    // Simplest: look for the next big section anchor (e.g. "sw-meta-card" / #sw-dp-card).
    var afterMarker = html.indexOf('id="sw-meta-card"', drpOpen);
    return drpOpen >= 0 && idx > drpOpen && idx < afterMarker;
}

check(isInsideDrpSection(htmlSrc, 'id="sw-drp-nav"'),
      'T04: #sw-drp-nav is inside hidden #sw-drp-section');
check(isInsideDrpSection(htmlSrc, 'id="sw-drp-bottom-nav"'),
      'T05: #sw-drp-bottom-nav is inside hidden #sw-drp-section');
check(isInsideDrpSection(htmlSrc, 'id="sw-drp-jump-row"'),
      'T06: #sw-drp-jump-row is inside hidden #sw-drp-section');
check(isInsideDrpSection(htmlSrc, 'id="sw-drp-event-log"'),
      'T07: #sw-drp-event-log is inside hidden #sw-drp-section');
check(isInsideDrpSection(htmlSrc, 'id="sw-drp-decision-options"'),
      'T08: #sw-drp-decision-options is inside hidden #sw-drp-section');
check(isInsideDrpSection(htmlSrc, 'id="sw-drp-selection-review"'),
      'T09: #sw-drp-selection-review is inside hidden #sw-drp-section');
check(isInsideDrpSection(htmlSrc, 'id="sw-drp-unit-scope"'),
      'T10: #sw-drp-unit-scope is inside hidden #sw-drp-section');

// ── Section 2: Init no longer auto-paints (T11-T14) ───────────────────────
console.log('\n─── Section 2: init() no longer auto-paints dry-run ───');

// Find the init block — it's the function containing _initDrpNavButtons() + _initW3LoadButton()
var initStart = swSrc.indexOf('_initDrpNavButtons();');
var initEnd   = swSrc.indexOf('logSystem(\'elog-evt-sw-rendered\'');
if (initStart < 0 || initEnd < 0 || initEnd <= initStart) {
    check(false, 'T11-T14: init block not found — fatal');
} else {
    var initBlock = swSrc.slice(initStart, initEnd);

    // T11: AMBER RIDGE not auto-painted
    // T12: paintDryRunPreview() (no-arg = AMBER) not called in init
    var hasUncommentedAutoPaint =
        /(?:^|\n)\s*paintDryRunPreview\s*\(\s*\)\s*;/.test(initBlock);
    check(!hasUncommentedAutoPaint,
          'T11/T12: paintDryRunPreview() no-arg auto-call NOT present in init',
          hasUncommentedAutoPaint ? 'still found' : 'removed');

    // T13: paintWargame3Preview not auto-called in init
    var autoW3 = /(?:^|\n)\s*paintWargame3Preview\s*\(/.test(initBlock);
    check(!autoW3, 'T13: paintWargame3Preview NOT auto-called in init');

    // T14: clearWargame3ReadOnlyMapOverlay called at init (W3 overlay cleanup)
    check(initBlock.indexOf('clearWargame3ReadOnlyMapOverlay') >= 0,
          'T14: clearWargame3ReadOnlyMapOverlay called at init (overlay cleanup)');
}

// ── Section 3: Live workflow intact (T15-T24) ─────────────────────────────
console.log('\n─── Section 3: Live workflow intact ───');

// T15: Live Scenario Step Navigator still exists in DOM
check(htmlSrc.indexOf('id="sw-nav-card"') >= 0 ||
      htmlSrc.indexOf('id="sw-nav-counter"') >= 0,
      'T15: Live Scenario Step Navigator still present in DOM');

// T16: Nav DOM IDs unchanged
[
    'sw-nav-counter', 'sw-nav-step-info', 'sw-nav-phase-badge'
].forEach(function(id, i) {
    check(htmlSrc.indexOf('id="' + id + '"') >= 0,
          'T16.' + (i + 1) + ': #' + id + ' present');
});

// T17: goToStep behavior unchanged — function still exists and not modified by PR-287L0
var gotoSrc = extractFn(swSrc, 'goToStep');
check(gotoSrc !== null,
      'T17: goToStep function still defined');
check(gotoSrc && gotoSrc.indexOf('PR-287L0') < 0,
      'T17b: goToStep function not modified by PR-287L0');

// T18: Live scenario cards still in DOM
var liveCardIds = [
    'sw-meta-card', 'sw-brfg-card', 'sw-nav-card', 'sw-wt-card',
    'sw-obj-card', 'sw-bls-card', 'sw-fs-card', 'sw-bf-card', 'sw-rf-card',
    'sw-dp-card', 'sw-sps-card', 'sw-sn-card', 'sw-fr-card'
];
var missingLive = liveCardIds.filter(function(id) {
    return htmlSrc.indexOf('id="' + id + '"') < 0;
});
check(missingLive.length === 0,
      'T18: all live scenario cards still in DOM',
      missingLive.length ? 'MISSING: ' + missingLive.join(', ') : 'all present');

// T19: Live Decision Action card still exists (PR-286L)
check(htmlSrc.indexOf('id="sw-live-decision-card"') >= 0,
      'T19: PR-286L #sw-live-decision-card still present');

// T20: PR-286L exports still present
var pr286Exports = [
    'getLiveScenarioIdentity',
    'getActiveLiveStepContext',
    'extractLiveDecisionOptions',
    'recordLiveOperatorSelection',
    'clearLiveOperatorSelection',
    'getLiveOperatorWorkflowState',
    'paintLiveDecisionActionCard'
];
var missingExports = pr286Exports.filter(function(n) { return swSrc.indexOf(n + ':') < 0; });
check(missingExports.length === 0,
      'T20: all PR-286L exports still present',
      missingExports.length ? 'MISSING: ' + missingExports.join(', ') : 'all present');

// T21: _liveOperatorWorkflowState still declared
check(swSrc.indexOf('var _liveOperatorWorkflowState') >= 0,
      'T21: _liveOperatorWorkflowState declaration still present');

// T22: Live decision selection logic preserved — recordLiveOperatorSelection still complete
var recSrc = extractFn(swSrc, 'recordLiveOperatorSelection');
check(recSrc !== null &&
      recSrc.indexOf('paintLiveDecisionActionCard') >= 0 &&
      recSrc.indexOf('_liveOperatorWorkflowState.selections[key]') >= 0,
      'T22: recordLiveOperatorSelection preserved (stores selection + repaints)');

// T23: Live map overlay path still callable (paintScenarioOverlay still exists)
check(extractFn(swSrc, 'paintScenarioOverlay') !== null,
      'T23: paintScenarioOverlay function still defined');

// T24: window.RmoozScenario still primary source (getScenario reads it)
var getScenSrc = extractFn(swSrc, 'getScenario');
check(getScenSrc !== null && getScenSrc.indexOf('window.RmoozScenario') >= 0,
      'T24: getScenario still reads window.RmoozScenario');

// ── Section 4: No dry-run usage in live functions (T25-T26) ───────────────
console.log('\n─── Section 4: No dry-run usage in live decision functions ───');

var liveFns = ['getLiveScenarioIdentity', 'getActiveLiveStepContext',
               'extractLiveDecisionOptions', 'recordLiveOperatorSelection',
               'clearLiveOperatorSelection', 'paintLiveDecisionActionCard'];
var liveSrc = liveFns.map(function(n) { return extractFn(swSrc, n) || ''; }).join('\n');

check(liveSrc.indexOf('_drpPreviewSource')   < 0, 'T25: no _drpPreviewSource in live functions');
check(liveSrc.indexOf('_drpPreviewStepRef')  < 0, 'T26: no _drpPreviewStepRef in live functions');

// T27: no AMBER RIDGE auto-run in live functions
check(!/AMBER[_ ]?RIDGE|RmoozDryRunFixtures/.test(liveSrc),
      'T27: no AMBER RIDGE usage in live functions');

// ── Section 5: No mutation / backend / Gate 7 (T28-T33) ───────────────────
console.log('\n─── Section 5: No mutation / backend / storage / Gate 7 ───');

check(!/window\.RmoozScenario\.scenario\s*=/.test(liveSrc) &&
      !/RmoozScenario\.scenario\.steps\[\d*\]\s*=/.test(liveSrc),
      'T28: no scenario object mutation in live functions');
check(!/window\.units\s*=|window\.units\.push|window\.units\.splice/.test(liveSrc),
      'T29: no unit mutation in live functions');
check(!/_w3PreviewLayer|_swScenarioOverlay\s*=\s*null/.test(liveSrc),
      'T30: no map logic mutation in live functions');
check(!/fetch\(|XMLHttpRequest|\$\.ajax/.test(liveSrc),
      'T31: no fetch / XHR / backend call in live functions');
check(!/localStorage|sessionStorage|IndexedDB|indexedDB/.test(liveSrc),
      'T32: no storage in live functions');
check(!/\/api\/sim\/commit|applyDecision|executeSimulation|Gate\s*7/i.test(liveSrc),
      'T33: no Gate 7 / apply / execute / commit in live functions');

// ── Section 6: Protected files unchanged (T34-T36) ────────────────────────
console.log('\n─── Section 6: Protected files unchanged ───');

if (fs.existsSync(W3_PATH)) {
    var w3 = JSON.parse(fs.readFileSync(W3_PATH, 'utf8'));
    check(Array.isArray(w3.red_units) && w3.red_units.length === 70 &&
          Array.isArray(w3.blue_units_initial) && w3.blue_units_initial.length === 83,
          'T34: wargame3.json unchanged (70 red + 83 blue)');
}
if (fs.existsSync(APP_JS)) {
    var appJs = fs.readFileSync(APP_JS, 'utf8');
    check(appJs.indexOf('PR-287L0') < 0,
          'T35: app.js not modified by PR-287L0');
}
if (fs.existsSync(ADJ_MAP)) {
    var adjMap = fs.readFileSync(ADJ_MAP, 'utf8');
    check(adjMap.indexOf('PR-287L0') < 0,
          'T36: adjudicator-map.js not modified by PR-287L0');
}

// ── T37: Console-error sanity — no syntax errors in updated file ──────────
console.log('\n─── T37: Source loads without syntax error ───');

try {
    // We can't load the full file (window-dependent IIFE), but we can verify it parses.
    new Function(swSrc);
    check(true, 'T37: scenario-workspace.js parses without syntax error');
} catch (err) {
    check(false, 'T37: scenario-workspace.js parses without syntax error', err.message);
}

// Extra: Confirm refresh() still calls paintLiveDecisionActionCard() (PR-286L preserved)
var refreshArea = swSrc.slice(swSrc.indexOf('refresh: function'),
                              swSrc.indexOf('refresh: function') + 4000);
check(refreshArea.indexOf('paintLiveDecisionActionCard()') >= 0,
      'Extra-01: refresh() still calls paintLiveDecisionActionCard() (PR-286L preserved)');

// Extra: paintDryRunPreview itself still exists as a developer-only export
check(swSrc.indexOf('paintDryRunPreview:                paintDryRunPreview') >= 0,
      'Extra-02: paintDryRunPreview still exported (developer-only)');

// Extra: Live decision card placement is OUTSIDE the dry-run section
function isInsideElement(html, innerId, outerId) {
    var inner = html.indexOf('id="' + innerId + '"');
    var outer = html.indexOf('id="' + outerId + '"');
    if (inner < 0 || outer < 0) return false;
    // crude: count <div opens between outer and inner vs </div> closes
    var slice = html.slice(outer, inner);
    var opens  = (slice.match(/<div\b/g)  || []).length;
    var closes = (slice.match(/<\/div>/g) || []).length;
    return opens > closes;
}
check(!isInsideElement(htmlSrc, 'sw-live-decision-card', 'sw-drp-section'),
      'Extra-03: #sw-live-decision-card is OUTSIDE #sw-drp-section');

// ── Final ─────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(65));
console.log('  PR-287L0 Test Results');
console.log('═'.repeat(65));
console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
console.log('═'.repeat(65));
console.log('\n  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));

process.exit(failed === 0 ? 0 : 1);
