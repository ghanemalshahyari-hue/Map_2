/**
 * test-pr-287L2.js — PR-287L2: Live Scenario Workspace Consolidation.
 *
 * 66-item coverage per spec.
 * Verifies DOM restructure, paintLiveScenarioHeader, secondary toggle, and goToStep wiring.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SW_PATH   = path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js');
const HTML_PATH = path.join(__dirname, 'UI_MOdified/client/app.html');
const I18N_PATH = path.join(__dirname, 'UI_MOdified/client/i18n.js');
const CSS_PATH  = path.join(__dirname, 'UI_MOdified/client/style.css');
const W3_PATH   = path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json');
const APP_JS    = path.join(__dirname, 'UI_MOdified/client/app.js');
const ADJ_MAP   = path.join(__dirname, 'UI_MOdified/client/adjudicator-map.js');

const swSrc   = fs.readFileSync(SW_PATH,   'utf8');
const htmlSrc = fs.readFileSync(HTML_PATH, 'utf8');
const i18nSrc = fs.readFileSync(I18N_PATH, 'utf8');
const cssSrc  = fs.readFileSync(CSS_PATH,  'utf8');

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

// Returns true if `innerId` element sits inside `outerId` element in app.html.
// Implementation: find the open tag of outerId, then find the matching close
// by counting <section / <div opens vs </section / </div> closes from there.
// We simplify by checking if innerId appears before the next sibling marker.
function isInsideSection(html, innerId, outerId) {
    var openIdx = html.indexOf('id="' + outerId + '"');
    if (openIdx < 0) return false;
    var innerIdx = html.indexOf('id="' + innerId + '"');
    if (innerIdx < 0) return false;
    if (innerIdx < openIdx) return false;

    // Walk forward from outer-open finding the matching </section> close.
    // We assume outer is a <section>. Track depth of <section> only since
    // <div> nesting is independent for our purposes.
    var i = html.indexOf('>', openIdx);
    if (i < 0) return false;
    var depth = 1;
    while (i < html.length && depth > 0) {
        var nextOpen  = html.indexOf('<section', i + 1);
        var nextClose = html.indexOf('</section>', i + 1);
        if (nextClose < 0) return false;
        if (nextOpen > 0 && nextOpen < nextClose) {
            depth++;
            i = nextOpen;
        } else {
            depth--;
            i = nextClose;
        }
    }
    var closeIdx = i;  // points at the matching </section>
    return innerIdx > openIdx && innerIdx < closeIdx;
}

// ── Section 1: New IDs exist (T1-T7) ──────────────────────────────────────
console.log('\n─── Section 1: New IDs exist ───');

[
    ['T01', 'sw-live-workspace'],
    ['T02', 'sw-live-scenario-header'],
    ['T03', 'sw-live-scenario-title'],
    ['T04', 'sw-live-scenario-id'],
    ['T05', 'sw-live-scenario-step'],
    ['T06', 'sw-live-scenario-phase'],
    ['T07', 'sw-live-scenario-source'],
    ['T08', 'sw-live-map-status']
].forEach(function(p) {
    check(htmlSrc.indexOf('id="' + p[1] + '"') >= 0,
          p[0] + ': #' + p[1] + ' present');
});

// ── Section 2: Live cards inside #sw-live-workspace (T8-T21) ──────────────
console.log('\n─── Section 2: Live cards inside #sw-live-workspace ───');

[
    ['T08', 'sw-nav-card'],
    ['T09', 'sw-live-decision-card'],
    ['T10', 'sw-meta-card'],
    ['T11', 'sw-brfg-card'],
    ['T12', 'sw-wt-card'],
    ['T13', 'sw-sps-card'],
    ['T14', 'sw-sn-card'],
    ['T15', 'sw-dp-card'],
    ['T16', 'sw-fr-card'],
    ['T17', 'sw-obj-card'],
    ['T18', 'sw-bls-card'],
    ['T19', 'sw-fs-card'],
    ['T20', 'sw-bf-card'],
    ['T21', 'sw-rf-card']
].forEach(function(p) {
    check(isInsideSection(htmlSrc, p[1], 'sw-live-workspace'),
          p[0] + ': #' + p[1] + ' is inside #sw-live-workspace');
});

// ── Section 3: DOM order (T22-T24) ────────────────────────────────────────
console.log('\n─── Section 3: DOM order ───');

var hdrIdx  = htmlSrc.indexOf('id="sw-live-scenario-header"');
var navIdx  = htmlSrc.indexOf('id="sw-nav-card"');
var decIdx  = htmlSrc.indexOf('id="sw-live-decision-card"');
var metaIdx = htmlSrc.indexOf('id="sw-meta-card"');

check(hdrIdx >= 0 && navIdx > hdrIdx,
      'T22: DOM order: header (#sw-live-scenario-header) BEFORE nav (#sw-nav-card)',
      'hdr@' + hdrIdx + ' nav@' + navIdx);
check(navIdx >= 0 && decIdx > navIdx,
      'T23: DOM order: nav BEFORE live decision (#sw-live-decision-card)',
      'nav@' + navIdx + ' dec@' + decIdx);
check(decIdx >= 0 && metaIdx > decIdx,
      'T24: DOM order: live decision BEFORE meta (#sw-meta-card)',
      'dec@' + decIdx + ' meta@' + metaIdx);

// ── Section 4: #sw-secondary-cards exists + holds mock cards (T25-T31) ────
console.log('\n─── Section 4: #sw-secondary-cards + mock cards ───');

check(htmlSrc.indexOf('id="sw-secondary-cards"') >= 0,
      'T25: #sw-secondary-cards present');

[
    ['T26', 'spt-card'],
    ['T27', 'oid-card'],
    ['T28', 'apc-card'],
    ['T29', 'pra-card'],
    ['T30', 'dps-card'],
    ['T31', 'uild-card']
].forEach(function(p) {
    check(isInsideSection(htmlSrc, p[1], 'sw-secondary-cards'),
          p[0] + ': #' + p[1] + ' is inside #sw-secondary-cards');
});

// ── Section 5: Secondary body collapsed by default (T32) ──────────────────
console.log('\n─── Section 5: Secondary collapsed by default ───');

// #sw-secondary-cards-body should have `hidden` attribute on its opening tag.
function elementHasHiddenAttr(html, attrFragment) {
    var idx = html.indexOf(attrFragment);
    if (idx < 0) return false;
    var start = html.lastIndexOf('<', idx);
    var end   = html.indexOf('>', idx);
    if (start < 0 || end < 0) return false;
    return /\shidden(\s|>|=)/.test(html.slice(start, end + 1));
}
check(elementHasHiddenAttr(htmlSrc, 'id="sw-secondary-cards-body"'),
      'T32: #sw-secondary-cards-body has hidden attribute (collapsed by default)');

// ── Section 6: #sw-dp-loader-row hidden by default (T33) ──────────────────
console.log('\n─── Section 6: #sw-dp-loader-row hidden ───');

check(elementHasHiddenAttr(htmlSrc, 'id="sw-dp-loader-row"'),
      'T33: #sw-dp-loader-row has hidden attribute');

// ── Section 7: paintLiveScenarioHeader (T34-T40) ──────────────────────────
console.log('\n─── Section 7: paintLiveScenarioHeader ───');

check(swSrc.indexOf('paintLiveScenarioHeader:        paintLiveScenarioHeader') >= 0,
      'T34: paintLiveScenarioHeader exported');

var headerFn = extractFn(swSrc, 'paintLiveScenarioHeader');
check(headerFn !== null && /scenario_label/.test(headerFn),
      'T35: paintLiveScenarioHeader reads scenario_label');
check(headerFn !== null && /scenario_id/.test(headerFn),
      'T36: paintLiveScenarioHeader reads scenario_id');
check(headerFn !== null && /getActiveStepIndex/.test(headerFn),
      'T37: paintLiveScenarioHeader reads current step index');
check(headerFn !== null && /step\.phase/.test(headerFn) &&
      /step\.time_label/.test(headerFn) && /step\.title/.test(headerFn),
      'T38: paintLiveScenarioHeader reads phase/time_label/title safely');

// T39: handles missing scenario (function checks getScenario() may be null)
check(headerFn !== null && /if\s*\(\s*!\s*sc/.test(headerFn) ||
      /sc\s*\?/.test(headerFn || ''),
      'T39: paintLiveScenarioHeader handles missing scenario safely');

// T40: does not mutate window.RmoozScenario
check(headerFn !== null &&
      !/window\.RmoozScenario\.scenario\s*=/.test(headerFn) &&
      !/RmoozScenario\.stepIndex\s*=/.test(headerFn),
      'T40: paintLiveScenarioHeader does NOT mutate window.RmoozScenario');

// ── Section 8: refresh() + goToStep() wire (T41-T46) ──────────────────────
console.log('\n─── Section 8: refresh() + goToStep() wiring ───');

// T41: refresh() calls paintLiveScenarioHeader
var refreshArea = swSrc.slice(swSrc.indexOf('refresh: function'),
                              swSrc.indexOf('refresh: function') + 4500);
check(refreshArea.indexOf('paintLiveScenarioHeader()') >= 0,
      'T41: refresh() calls paintLiveScenarioHeader()');

// T42 + T43: goToStep() calls paintLiveScenarioHeader + paintLiveDecisionActionCard
var goToStepFn = extractFn(swSrc, 'goToStep');
check(goToStepFn !== null && goToStepFn.indexOf('paintLiveScenarioHeader') >= 0,
      'T42: goToStep() calls paintLiveScenarioHeader');
check(goToStepFn !== null && goToStepFn.indexOf('paintLiveDecisionActionCard') >= 0,
      'T43: goToStep() calls paintLiveDecisionActionCard');

// T44: goToStep() still writes window.RmoozScenario.stepIndex
check(goToStepFn !== null && /window\.RmoozScenario\.stepIndex\s*=\s*newIdx/.test(goToStepFn),
      'T44: goToStep() still updates window.RmoozScenario.stepIndex');

// T45: Step Navigator behavior unchanged — paintStepNavigator still called
check(goToStepFn !== null && goToStepFn.indexOf('paintStepNavigator()') >= 0,
      'T45: goToStep() still calls paintStepNavigator()');

// T46: live map overlay path still called by goToStep
check(goToStepFn !== null && goToStepFn.indexOf('paintScenarioOverlay()') >= 0,
      'T46: goToStep() still calls paintScenarioOverlay()');

// T47: paintScenarioOverlay reads window.RmoozScenario.stepIndex (via getActiveStepIndex)
var overlayFn = extractFn(swSrc, 'paintScenarioOverlay');
var buildOverlayFn = extractFn(swSrc, 'buildScenarioOverlay');
check(overlayFn !== null &&
      (overlayFn.indexOf('getActiveStepIndex') >= 0 ||
       (buildOverlayFn || '').indexOf('getActiveStepIndex') >= 0),
      'T47: live map overlay reads stepIndex via getActiveStepIndex');

// T48: paintScenarioOverlay only paints when _swOverlayEnabled is true
check(overlayFn !== null && /_swOverlayEnabled/.test(overlayFn),
      'T48: paintScenarioOverlay respects _swOverlayEnabled toggle');

// T49 + T50: paintScenarioOverlay does NOT read _drpPreviewStepRef / _drpPreviewSource
check(overlayFn !== null && overlayFn.indexOf('_drpPreviewStepRef') < 0,
      'T49: live map overlay does not read _drpPreviewStepRef');
check(overlayFn !== null && overlayFn.indexOf('_drpPreviewSource') < 0,
      'T50: live map overlay does not read _drpPreviewSource');

// T51: workspace init clears W3 preview overlay (PR-287L0 cleanup still in place)
var initBlockSlice = swSrc.slice(
    swSrc.indexOf('_initDrpNavButtons();'),
    swSrc.indexOf("logSystem('elog-evt-sw-rendered'"));
check(initBlockSlice.indexOf('clearWargame3ReadOnlyMapOverlay') >= 0,
      'T51: workspace init clears any old W3 preview overlay');

// T58 (advanced): Load Wargame 3 Preview button remains hidden
function elementHasHiddenAttrLocal(html, attrFragment) {
    var idx = html.indexOf(attrFragment);
    if (idx < 0) return false;
    var start = html.lastIndexOf('<', idx);
    var end   = html.indexOf('>', idx);
    if (start < 0 || end < 0) return false;
    return /\shidden(\s|>|=)/.test(html.slice(start, end + 1));
}
check(elementHasHiddenAttrLocal(htmlSrc, 'id="sw-w3-load-bar"'),
      'T58: Load Wargame 3 Preview load bar remains hidden');

// T58b: button rename — i18n now says "Live Unit Overlay"
check(i18nSrc.indexOf("'sw-nav-overlay-show':       'Show Live Unit Overlay'") >= 0,
      'T58b: overlay button copy renamed to "Show Live Unit Overlay"');
check(i18nSrc.indexOf("'sw-nav-overlay-hide':       'Hide Live Unit Overlay'") >= 0,
      'T58c: overlay button hide copy renamed to "Hide Live Unit Overlay"');

// T58d: paintLiveScenarioHeader reads _swOverlayEnabled and paints into #sw-live-map-status
var headerFnExpanded = extractFn(swSrc, 'paintLiveScenarioHeader');
check(headerFnExpanded !== null && /_swOverlayEnabled/.test(headerFnExpanded) &&
      headerFnExpanded.indexOf('sw-live-map-status') >= 0,
      'T58d: paintLiveScenarioHeader paints overlay status into #sw-live-map-status');

// T58e: paintOverlayToggleButton re-paints the header on toggle (keeps map status in sync)
var togglePaintFn = extractFn(swSrc, 'paintOverlayToggleButton');
check(togglePaintFn !== null && togglePaintFn.indexOf('paintLiveScenarioHeader') >= 0,
      'T58e: paintOverlayToggleButton triggers paintLiveScenarioHeader (state sync)');

// ── Section 9: PR-286L preservation + live decision step-coherence (T47-T49)
console.log('\n─── Section 9: PR-286L preservation ───');

var pr286 = [
    'getLiveScenarioIdentity', 'getActiveLiveStepContext',
    'extractLiveDecisionOptions', 'recordLiveOperatorSelection',
    'clearLiveOperatorSelection', 'getLiveOperatorWorkflowState',
    'paintLiveDecisionActionCard'
];
var missing286 = pr286.filter(function(n) { return swSrc.indexOf(n + ':') < 0; });
check(missing286.length === 0,
      'T47: PR-286L exports still present',
      missing286.length ? 'MISSING: ' + missing286.join(', ') : 'all present');

// T48: recordLiveOperatorSelection still records (function body intact)
var recFn = extractFn(swSrc, 'recordLiveOperatorSelection');
check(recFn !== null &&
      recFn.indexOf('_liveOperatorWorkflowState.selections[key]') >= 0,
      'T48: recordLiveOperatorSelection still stores selection');

// T49: goToStep now repaints live decision card (regression target)
check(goToStepFn !== null && goToStepFn.indexOf('paintLiveDecisionActionCard') >= 0,
      'T49: Live Decision Action now updates when goToStep changes step');

// ── Section 10: No dry-run / no mutation / no backend (T50-T62) ───────────
console.log('\n─── Section 10: no dry-run / no mutation / no backend in new code ───');

var newCode = (extractFn(swSrc, 'paintLiveScenarioHeader')  || '') +
              (extractFn(swSrc, 'initSecondaryCardsToggle') || '');

check(newCode.indexOf('_drpPreviewSource')  < 0, 'T50: no _drpPreviewSource in new code');
check(newCode.indexOf('_drpPreviewStepRef') < 0, 'T51: no _drpPreviewStepRef in new code');

// T52: W3 dry-run remains hidden
check(elementHasHiddenAttr(htmlSrc, 'id="sw-w3-load-bar"') &&
      elementHasHiddenAttr(htmlSrc, 'id="sw-drp-section"'),
      'T52: W3 dry-run section + load bar remain hidden');

// T53: AMBER RIDGE not auto-rendered (no paintDryRunPreview() no-arg call in init)
var initBlockStart = swSrc.indexOf('_initDrpNavButtons();');
var initBlockEnd   = swSrc.indexOf('logSystem(\'elog-evt-sw-rendered\'');
var initBlock      = swSrc.slice(initBlockStart, initBlockEnd);
var hasAutoPaint = /(?:^|\n)\s*paintDryRunPreview\s*\(\s*\)\s*;/.test(initBlock);
check(!hasAutoPaint, 'T53: AMBER RIDGE not auto-painted in init');

// T54: no scenario object mutation except stepIndex
check(!/window\.RmoozScenario\.scenario\s*=/.test(newCode) &&
      !/window\.RmoozScenario\.stepIndex\s*=/.test(newCode),
      'T54: no scenario object mutation in new code (stepIndex untouched)');

// T55: no unit mutation
check(!/window\.units\s*=|window\.units\.push|window\.units\.splice/.test(newCode),
      'T55: no unit mutation in new code');

// T56: no map logic mutation
check(!/_w3PreviewLayer\s*=|_swScenarioOverlay\s*=\s*null/.test(newCode),
      'T56: no map / overlay mutation in new code');

// T57: no fetch / XHR / backend
check(!/fetch\(|XMLHttpRequest|\$\.ajax/.test(newCode),
      'T57: no fetch / XHR / backend in new code');

// T58: no localStorage / sessionStorage / IndexedDB
check(!/localStorage|sessionStorage|IndexedDB|indexedDB/.test(newCode),
      'T58: no storage in new code');

// T59: no Gate 7 / apply / execute / commit / go-live controls
check(!/\/api\/sim\/commit|applyDecision|executeSimulation|Gate\s*7|go[\s_-]?live/i.test(newCode),
      'T59: no Gate 7 / apply / execute / commit / go-live in new code');

// ── Section 11: Protected files unchanged (T60-T62) ───────────────────────
console.log('\n─── Section 11: Protected files unchanged ───');

if (fs.existsSync(W3_PATH)) {
    var w3 = JSON.parse(fs.readFileSync(W3_PATH, 'utf8'));
    check(Array.isArray(w3.red_units) && w3.red_units.length === 70 &&
          Array.isArray(w3.blue_units_initial) && w3.blue_units_initial.length === 83,
          'T60: wargame3.json unchanged (70 red + 83 blue)');
}
if (fs.existsSync(APP_JS)) {
    check(fs.readFileSync(APP_JS, 'utf8').indexOf('PR-287L2') < 0,
          'T61: app.js not modified by PR-287L2');
}
if (fs.existsSync(ADJ_MAP)) {
    check(fs.readFileSync(ADJ_MAP, 'utf8').indexOf('PR-287L2') < 0,
          'T62: adjudicator-map.js not modified by PR-287L2');
}

// ── Section 12: i18n EN + AR (T63-T64) ────────────────────────────────────
console.log('\n─── Section 12: i18n EN + AR ───');

var KEYS = [
    'sw-live-workspace-kicker', 'sw-live-scenario-active-fallback',
    'sw-live-scenario-id-unknown', 'sw-live-scenario-source-fallback',
    'sw-live-map-overlay-label', 'sw-live-map-full-posture',
    'sw-live-overlay-available', 'sw-live-overlay-on', 'sw-live-overlay-off',
    'sw-secondary-cards-title', 'sw-secondary-cards-subtitle',
    'sw-secondary-cards-toggle-show', 'sw-secondary-cards-toggle-hide'
];
var enStart = i18nSrc.indexOf('en:');
var arStart = i18nSrc.indexOf('ar:');
var enBlock = i18nSrc.slice(enStart, arStart);
var arBlock = i18nSrc.slice(arStart);

var missingEn = KEYS.filter(function(k) { return enBlock.indexOf("'" + k + "'") < 0; });
check(missingEn.length === 0, 'T63: all PR-287L2 EN keys present',
      missingEn.length ? 'MISSING: ' + missingEn.join(', ') : 'all present');

var missingAr = KEYS.filter(function(k) { return arBlock.indexOf("'" + k + "'") < 0; });
check(missingAr.length === 0, 'T64: all PR-287L2 AR keys present',
      missingAr.length ? 'MISSING: ' + missingAr.join(', ') : 'all present');
check(arBlock.indexOf('مساحة السيناريو الحي') >= 0,
      'T64b: AR kicker text contains Arabic characters');

// ── Section 13: CSS (T65) ─────────────────────────────────────────────────
console.log('\n─── Section 13: CSS ───');

[
    '.sw-live-workspace', '.sw-live-scenario-header', '.sw-live-scenario-title',
    '.sw-secondary-cards', '.sw-secondary-cards-toggle', '.sw-secondary-cards-body'
].forEach(function(sel, i) {
    check(cssSrc.indexOf(sel) >= 0, 'T65.' + (i + 1) + ': CSS ' + sel + ' defined');
});

// ── Section 14: Source loads without syntax error (T66) ───────────────────
console.log('\n─── Section 14: Source syntax ───');

try {
    new Function(swSrc);
    check(true, 'T66: scenario-workspace.js parses without syntax error');
} catch (err) {
    check(false, 'T66: scenario-workspace.js parses without syntax error', err.message);
}

// ── Extra sanity ──────────────────────────────────────────────────────────

// New exports listed
check(swSrc.indexOf('initSecondaryCardsToggle:') >= 0,
      'Extra-01: initSecondaryCardsToggle exported');

// Card duplication check — each ID exists exactly once
var DUPES = [
    'sw-nav-card', 'sw-live-decision-card', 'sw-meta-card', 'sw-brfg-card',
    'spt-card', 'oid-card', 'apc-card', 'pra-card', 'dps-card'
];
var dupes = DUPES.filter(function(id) {
    var c = htmlSrc.split('id="' + id + '"').length - 1;
    return c !== 1;
});
check(dupes.length === 0,
      'Extra-02: each restructured ID appears exactly once',
      dupes.length ? 'DUPES: ' + dupes.join(', ') : 'all unique');

// ── Final ─────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(65));
console.log('  PR-287L2 Test Results');
console.log('═'.repeat(65));
console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
console.log('═'.repeat(65));
console.log('\n  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));

process.exit(failed === 0 ? 0 : 1);
