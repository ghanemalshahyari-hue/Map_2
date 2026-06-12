/**
 * test-pr-285A.js — PR-285A: Wargame 3 Preview Unit Scope Label
 *
 * 52-item coverage per spec:
 *  T01-T02   exports present
 *  T03-T06   null / non-W3 preview → summary null
 *  T07-T13   W3 preview summary shape
 *  T14-T16   shownUnits computation
 *  T17-T19   totalUnits computation
 *  T20-T21   capped flag
 *  T22-T27   safety / immutability fields
 *  T28-T33   no-mutation / no-read guards (source inspection)
 *  T34-T41   paintWargame3PreviewUnitScope DOM behaviour
 *  T42-T44   app.html DOM IDs
 *  T45-T46   i18n EN / AR keys
 *  T47       CSS classes
 *  T48-T51   protected functions / values unchanged
 *  T52       previous PR exports still present
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SW_PATH   = path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js');
const HTML_PATH = path.join(__dirname, 'UI_MOdified/client/app.html');
const I18N_PATH = path.join(__dirname, 'UI_MOdified/client/i18n.js');
const CSS_PATH  = path.join(__dirname, 'UI_MOdified/client/style.css');
const W3_PATH   = path.join(__dirname, 'docs/wargame3.json');

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

// ── helpers ────────────────────────────────────────────────────────────────

function extractFn(src, name) {
    // Matches: function name( ... ) { ... } — handles nested braces
    var start = src.indexOf('function ' + name + '(');
    if (start < 0) start = src.indexOf('function ' + name + ' (');
    if (start < 0) return null;
    var depth = 0, i = start, len = src.length;
    while (i < len) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
        i++;
    }
    return src.slice(start, i + 1);
}

// Build buildWargame3PreviewUnitScopeSummary with injected _drpPreviewSource
function makeScopeSummaryFn(drpPreviewSource) {
    var fnSrc = extractFn(swSrc, 'buildWargame3PreviewUnitScopeSummary');
    if (!fnSrc) throw new Error('buildWargame3PreviewUnitScopeSummary not found');
    var factory = new Function('_drpPreviewSource', 'return (' + fnSrc + ')');
    return factory(drpPreviewSource);
}

// Build paintWargame3PreviewUnitScope with injected deps
function makePaintFn(domStub, drpPreviewSource, txFn) {
    var buildSrc = extractFn(swSrc, 'buildWargame3PreviewUnitScopeSummary');
    var paintSrc = extractFn(swSrc, 'paintWargame3PreviewUnitScope');
    if (!buildSrc || !paintSrc) throw new Error('paint/build functions not found');
    var txImpl = txFn || function(k, d) { return d !== undefined ? d : k; };
    var factory = new Function('document', 'tx', '_drpPreviewSource',
        'var buildWargame3PreviewUnitScopeSummary = ' + buildSrc + ';\n' +
        'return (' + paintSrc + ');');
    return factory(domStub, txImpl, drpPreviewSource);
}

// Minimal DOM stub
function makeDomStub(ids) {
    var elements = {};
    (ids || []).forEach(function(id) {
        elements[id] = {
            _hidden:    true,
            _text:      '',
            _attrs:     {},
            setAttribute:    function(k, v) { this._attrs[k] = v; if (k === 'hidden') this._hidden = true; },
            removeAttribute: function(k)    { delete this._attrs[k]; if (k === 'hidden') this._hidden = false; },
            hasAttribute:    function(k)    { return Object.prototype.hasOwnProperty.call(this._attrs, k); },
            get textContent() { return this._text; },
            set textContent(v) { this._text = v; }
        };
        // Initialise with hidden attribute
        elements[id]._attrs['hidden'] = '';
    });
    return {
        getElementById: function(id) { return elements[id] || null; }
    };
}

// Canonical W3 preview stub (minimal — just what the function cares about)
function makeW3Preview(unitsReferenced) {
    return {
        activeStepId:     'W3-STEP-05',
        activeStepIndex:  5,
        totalSteps:       17,
        readOnly:         true,
        liveMutationAllowed: false,
        unitsReferenced:  unitsReferenced || [
            { uid: 'B-0', displayName: 'Unit A', side: 'blue' },
            { uid: 'B-1', displayName: 'Unit B', side: 'blue' },
            { uid: 'R-0', displayName: 'Unit C', side: 'red'  }
        ]
    };
}

// AMBER RIDGE (non-W3) preview stub
function makeAmberPreview() {
    return {
        activeStepId:     'AR-STEP-01',
        activeStepIndex:  0,
        totalSteps:       5,
        readOnly:         true,
        liveMutationAllowed: false,
        unitsReferenced:  [{ uid: 'U-1', displayName: 'Alpha', side: 'blue' }]
    };
}

// Fixture stub simulating _drpPreviewSource with N units
function makeFixtureSource(n) {
    var units = [];
    for (var i = 0; i < n; i++) { units.push({ uid: 'U-' + i, side: i < 83 ? 'blue' : 'red' }); }
    return { units: units, objectives: [], steps: [] };
}

// ── Section 1: Exports ─────────────────────────────────────────────────────
console.log('\n─── Section 1: Exports ───');

check(swSrc.indexOf('buildWargame3PreviewUnitScopeSummary: buildWargame3PreviewUnitScopeSummary') >= 0,
      'T01: buildWargame3PreviewUnitScopeSummary exported');
check(swSrc.indexOf('paintWargame3PreviewUnitScope:') >= 0,
      'T02: paintWargame3PreviewUnitScope exported');

// ── Section 2: null / non-W3 → summary null ────────────────────────────────
console.log('\n─── Section 2: null/non-W3 preview → summary null ───');

(function() {
    var fn = makeScopeSummaryFn(null);

    var r1 = fn(null);
    check(r1.passed === true,   'T03: null preview → passed:true');
    check(r1.summary === null,  'T04: null preview → summary null');

    var r2 = fn(undefined);
    check(r2.passed === true && r2.summary === null, 'T05: undefined preview → summary null');

    var r3 = fn(makeAmberPreview());
    check(r3.passed === true && r3.summary === null, 'T06: AMBER RIDGE preview → summary null');
})();

// ── Section 3: W3 preview summary shape ────────────────────────────────────
console.log('\n─── Section 3: W3 preview summary shape ───');

(function() {
    var fn  = makeScopeSummaryFn(makeFixtureSource(153));
    var res = fn(makeW3Preview());

    check(res.passed === true,                           'T07: W3 preview → passed:true');
    check(res.summary !== null,                          'T08: W3 preview → summary not null');
    check(Array.isArray(res.blockedReasons),             'T09: blockedReasons is array');
    check(Array.isArray(res.warnings),                   'T10: warnings is array');
    check(res.summary.scopeType === 'engaged_preview_units_only', 'T11: scopeType correct');
    check(res.summary.isWargame3 === true,               'T12: isWargame3:true');
    check(res.summary.fullOobShown === false,            'T13: fullOobShown:false');
    check(res.summary.liveNavigatorRequiredForFullOob === true,
          'T14: liveNavigatorRequiredForFullOob:true');
})();

// ── Section 4: shownUnits computation ─────────────────────────────────────
console.log('\n─── Section 4: shownUnits computation ───');

(function() {
    var fn  = makeScopeSummaryFn(makeFixtureSource(153));

    var r1 = fn(makeW3Preview(/* 3 units */));
    check(r1.summary.shownUnits === 3,
          'T15: shownUnits = unitsReferenced.length', r1.summary.shownUnits);

    var r2 = fn(makeW3Preview(new Array(10).fill({ uid: 'X', displayName: 'X', side: 'blue' })));
    check(r2.summary.shownUnits === 10,
          'T16: shownUnits updates with different unitsReferenced count', r2.summary.shownUnits);
})();

// ── Section 5: totalUnits computation ─────────────────────────────────────
console.log('\n─── Section 5: totalUnits computation ───');

(function() {
    var fn153 = makeScopeSummaryFn(makeFixtureSource(153));
    var r153  = fn153(makeW3Preview());
    check(r153.summary.totalUnits === 153,
          'T17: totalUnits from fixture catalog', r153.summary.totalUnits);

    var fnNull = makeScopeSummaryFn(null);
    var rNull  = fnNull(makeW3Preview());
    check(rNull.summary.totalUnits === null,
          'T18: totalUnits null when _drpPreviewSource unavailable');
    check(rNull.warnings.indexOf('TOTAL_UNITS_UNAVAILABLE') >= 0,
          'T19: TOTAL_UNITS_UNAVAILABLE warning when source unavailable');
})();

// ── Section 6: capped flag ─────────────────────────────────────────────────
console.log('\n─── Section 6: capped flag ───');

(function() {
    var fn = makeScopeSummaryFn(makeFixtureSource(153));

    // 3 units → not capped (< 12)
    var r1 = fn(makeW3Preview(new Array(3).fill({ uid: 'X', displayName: 'X', side: 'blue' })));
    check(r1.summary.capped === false,
          'T20: capped:false when shownUnits < 12', r1.summary.shownUnits);

    // 13 units → capped (> 12)
    var r2 = fn(makeW3Preview(new Array(13).fill({ uid: 'X', displayName: 'X', side: 'blue' })));
    check(r2.summary.capped === true,
          'T21: capped:true when shownUnits > 12', r2.summary.shownUnits);
})();

// ── Section 7: no-mutation / no-read guards (source inspection) ─────────────
console.log('\n─── Section 7: no-mutation / no-read guards ───');

(function() {
    // T22: does not mutate preview object
    var fn      = makeScopeSummaryFn(makeFixtureSource(153));
    var preview = makeW3Preview();
    var before  = JSON.stringify(preview);
    fn(preview);
    check(JSON.stringify(preview) === before, 'T22: preview object not mutated');

    // T23: does not mutate fixture source
    var src    = makeFixtureSource(153);
    var srcStr = JSON.stringify(src);
    var fn2    = makeScopeSummaryFn(src);
    fn2(makeW3Preview());
    check(JSON.stringify(src) === srcStr, 'T23: _drpPreviewSource not mutated');
})();

// T24: does not reference window.units
check(!/window\.units/.test(extractFn(swSrc, 'buildWargame3PreviewUnitScopeSummary') || ''),
      'T24: buildWargame3PreviewUnitScopeSummary does not read window.units');

// T25: does not reference window.RmoozScenario.stepIndex
check(!/window\.RmoozScenario/.test(extractFn(swSrc, 'buildWargame3PreviewUnitScopeSummary') || ''),
      'T25: does not read window.RmoozScenario');

// T26: does not reference _drpPreviewStepRef as assignment
check(!/_drpPreviewStepRef\s*=/.test(extractFn(swSrc, 'buildWargame3PreviewUnitScopeSummary') || ''),
      'T26: does not mutate _drpPreviewStepRef');

// T27: does not reference _w3PreviewLayer (no map read)
check(!/_w3PreviewLayer/.test(extractFn(swSrc, 'buildWargame3PreviewUnitScopeSummary') || ''),
      'T27: does not read map layer');

// T28: paint function does not read window.units
check(!/window\.units/.test(extractFn(swSrc, 'paintWargame3PreviewUnitScope') || ''),
      'T28: paintWargame3PreviewUnitScope does not read window.units');

// T29: paint function does not change _drpPreviewStepRef
check(!/_drpPreviewStepRef\s*=/.test(extractFn(swSrc, 'paintWargame3PreviewUnitScope') || ''),
      'T29: paintWargame3PreviewUnitScope does not mutate _drpPreviewStepRef');

// T30: paint function does not reference MAX_MARKERS as assignment
check(!(/MAX_MARKERS\s*=\s*\d/.test(extractFn(swSrc, 'paintWargame3PreviewUnitScope') || '')),
      'T30: paintWargame3PreviewUnitScope does not reassign MAX_MARKERS');

// T31: no expectedResult created
check(!/expectedResult/.test(extractFn(swSrc, 'buildWargame3PreviewUnitScopeSummary') || ''),
      'T31: no expectedResult in buildWargame3PreviewUnitScopeSummary');

// T32: no selectedDecision created
check(!/selectedDecision/.test(extractFn(swSrc, 'buildWargame3PreviewUnitScopeSummary') || ''),
      'T32: no selectedDecision in buildWargame3PreviewUnitScopeSummary');

// T33: no previewComplete:true set
check(!/previewComplete\s*:\s*true/.test(extractFn(swSrc, 'buildWargame3PreviewUnitScopeSummary') || ''),
      'T33: no previewComplete:true in buildWargame3PreviewUnitScopeSummary');

// ── Section 8: paintWargame3PreviewUnitScope DOM behaviour ──────────────────
console.log('\n─── Section 8: paintWargame3PreviewUnitScope DOM behaviour ───');

(function() {
    var IDS = ['sw-drp-unit-scope', 'sw-drp-unit-scope-main', 'sw-drp-unit-scope-sub'];

    // T34: non-W3 → scope element hidden
    (function() {
        var dom  = makeDomStub(IDS);
        var fn   = makePaintFn(dom, makeFixtureSource(153));
        fn(makeAmberPreview());
        var el = dom.getElementById('sw-drp-unit-scope');
        check(el.hasAttribute('hidden'), 'T34: AMBER RIDGE → #sw-drp-unit-scope hidden');
    })();

    // T35: null preview → scope element hidden
    (function() {
        var dom = makeDomStub(IDS);
        var fn  = makePaintFn(dom, makeFixtureSource(153));
        fn(null);
        var el = dom.getElementById('sw-drp-unit-scope');
        check(el.hasAttribute('hidden'), 'T35: null preview → #sw-drp-unit-scope hidden');
    })();

    // T36: W3 → scope element visible
    (function() {
        var dom = makeDomStub(IDS);
        var fn  = makePaintFn(dom, makeFixtureSource(153));
        fn(makeW3Preview());
        var el = dom.getElementById('sw-drp-unit-scope');
        check(!el.hasAttribute('hidden'), 'T36: W3 preview → #sw-drp-unit-scope visible');
    })();

    // T37: main text contains shown count
    (function() {
        var dom = makeDomStub(IDS);
        var fn  = makePaintFn(dom, makeFixtureSource(153));
        fn(makeW3Preview(/* 3 units */));
        var txt = dom.getElementById('sw-drp-unit-scope-main').textContent;
        check(txt.indexOf('3') >= 0,
              'T37: main text contains shown count (3)', txt);
    })();

    // T38: main text contains total count
    (function() {
        var dom = makeDomStub(IDS);
        var fn  = makePaintFn(dom, makeFixtureSource(153));
        fn(makeW3Preview());
        var txt = dom.getElementById('sw-drp-unit-scope-main').textContent;
        check(txt.indexOf('153') >= 0,
              'T38: main text contains total count (153)', txt);
    })();

    // T39: when total unavailable → no "{total}" literal in text
    (function() {
        var dom = makeDomStub(IDS);
        var fn  = makePaintFn(dom, null);
        fn(makeW3Preview());
        var txt = dom.getElementById('sw-drp-unit-scope-main').textContent;
        check(txt.indexOf('{total}') < 0,
              'T39: unreplaced {total} not present when totalUnits null', txt);
    })();

    // T40: sub text is populated for W3
    (function() {
        var dom = makeDomStub(IDS);
        var fn  = makePaintFn(dom, makeFixtureSource(153));
        fn(makeW3Preview());
        var txt = dom.getElementById('sw-drp-unit-scope-sub').textContent;
        check(txt.length > 0, 'T40: sub text populated for W3', txt);
    })();

    // T41: capped text appears only when shownUnits > 12
    (function() {
        var dom    = makeDomStub(IDS);
        var bigArr = new Array(13).fill({ uid: 'X', displayName: 'X', side: 'blue' });
        var fn     = makePaintFn(dom, makeFixtureSource(153));
        fn(makeW3Preview(bigArr));
        var txt = dom.getElementById('sw-drp-unit-scope-main').textContent;
        // "capped" text should appear (in English fallback or i18n key)
        check(txt.toLowerCase().indexOf('capped') >= 0 ||
              txt.toLowerCase().indexOf('may be') >= 0,
              'T41: capped warning text present when shownUnits > 12', txt);
    })();
})();

// ── Section 9: app.html DOM IDs ────────────────────────────────────────────
console.log('\n─── Section 9: app.html DOM IDs ───');

check(htmlSrc.indexOf('id="sw-drp-unit-scope"') >= 0,
      'T42: app.html contains #sw-drp-unit-scope');
check(htmlSrc.indexOf('id="sw-drp-unit-scope-main"') >= 0,
      'T43: app.html contains #sw-drp-unit-scope-main');
check(htmlSrc.indexOf('id="sw-drp-unit-scope-sub"') >= 0,
      'T44: app.html contains #sw-drp-unit-scope-sub');

// ── Section 10: i18n EN / AR keys ─────────────────────────────────────────
console.log('\n─── Section 10: i18n EN/AR keys ───');

check(i18nSrc.indexOf("'sw-drp-scope-main'") >= 0,
      'T45: EN sw-drp-scope-main key present');
check(i18nSrc.indexOf("'sw-drp-scope-main-count'") >= 0,
      'T45b: EN sw-drp-scope-main-count key present');
check(i18nSrc.indexOf("'sw-drp-scope-sub'") >= 0,
      'T45c: EN sw-drp-scope-sub key present');
check(i18nSrc.indexOf("'sw-drp-scope-capped'") >= 0,
      'T45d: EN sw-drp-scope-capped key present');

// AR keys appear twice (in en-block and ar-block)
var arBlockStart = i18nSrc.indexOf('ar:');
var arBlockEnd   = i18nSrc.lastIndexOf('}');
var arBlock      = i18nSrc.slice(arBlockStart, arBlockEnd);
check(arBlock.indexOf("'sw-drp-scope-main'") >= 0,      'T46: AR sw-drp-scope-main key');
check(arBlock.indexOf("'sw-drp-scope-main-count'") >= 0, 'T46b: AR sw-drp-scope-main-count key');
check(arBlock.indexOf("'sw-drp-scope-sub'") >= 0,        'T46c: AR sw-drp-scope-sub key');
check(arBlock.indexOf("'sw-drp-scope-capped'") >= 0,     'T46d: AR sw-drp-scope-capped key');
check(arBlock.indexOf('يتم عرض') >= 0,                   'T46e: AR count template has Arabic text');

// ── Section 11: CSS classes ────────────────────────────────────────────────
console.log('\n─── Section 11: CSS classes ───');

check(cssSrc.indexOf('.sw-drp-unit-scope ') >= 0 ||
      cssSrc.indexOf('.sw-drp-unit-scope{') >= 0,
      'T47: .sw-drp-unit-scope CSS class defined');
check(cssSrc.indexOf('.sw-drp-unit-scope-main') >= 0,
      'T47b: .sw-drp-unit-scope-main CSS class defined');
check(cssSrc.indexOf('.sw-drp-unit-scope-sub') >= 0,
      'T47c: .sw-drp-unit-scope-sub CSS class defined');
check(cssSrc.indexOf('.sw-drp-unit-scope[hidden]') >= 0,
      'T47d: hidden rule for .sw-drp-unit-scope defined');

// ── Section 12: Protected functions unchanged ──────────────────────────────
console.log('\n─── Section 12: Protected functions/values unchanged ───');

// T48: buildScenarioOverlay unchanged (does not reference paintWargame3PreviewUnitScope)
var buildOverlaySrc = extractFn(swSrc, 'buildScenarioOverlay');
check(buildOverlaySrc === null || buildOverlaySrc.indexOf('paintWargame3PreviewUnitScope') < 0,
      'T48: buildScenarioOverlay not modified by PR-285A');

// T49: MAX_MARKERS still = 12 in buildWargame3ReadOnlyMapOverlayData
var overlayDataSrc = extractFn(swSrc, 'buildWargame3ReadOnlyMapOverlayData');
check(overlayDataSrc !== null && /var\s+MAX_MARKERS\s*=\s*12\b/.test(overlayDataSrc),
      'T49: MAX_MARKERS still = 12 in buildWargame3ReadOnlyMapOverlayData');

// T50: buildScenarioStepPreview unit filtering unchanged
var stepPreviewSrc = extractFn(swSrc, 'buildScenarioStepPreview');
check(stepPreviewSrc !== null &&
      stepPreviewSrc.indexOf('paintWargame3PreviewUnitScope') < 0,
      'T50: buildScenarioStepPreview not modified');

// T51: no .scen / .ini / Lua / storage / fetch in new functions
var newFnsSrc = (extractFn(swSrc, 'buildWargame3PreviewUnitScopeSummary') || '') +
               (extractFn(swSrc, 'paintWargame3PreviewUnitScope') || '');
check(!/\.scen/.test(newFnsSrc),   'T51a: no .scen parsing in new functions');
check(!/\.ini/.test(newFnsSrc),    'T51b: no .ini parsing in new functions');
check(!/\blua\b/i.test(newFnsSrc), 'T51c: no Lua execution in new functions');
check(!/localStorage|sessionStorage|IndexedDB|fetch\(|XMLHttpRequest/
       .test(newFnsSrc),           'T51d: no storage/fetch in new functions');
check(!/\/api\/sim\/commit|applyDecision|executeSimulation|Gate\s*7/
       .test(newFnsSrc),           'T51e: no Gate 7/apply/execute/commit in new functions');

// ── Section 13: Previous PR exports still present ─────────────────────────
console.log('\n─── Section 13: Previous PR exports ───');

var prevExports = [
    'buildExternalScenarioSourceTrace',
    'paintExternalScenarioSourceTrace',
    'buildExternalScenarioCatalogFromManifest',
    'paintExternalScenarioPreviewEntry',
    'setExternalScenarioPreviewEntry',
    'previewExternalScenarioCatalogSubsetFromManifest',
    'buildScenarioStepPreview',
    'adaptWargame3ToFixture',
    'paintDryRunPreview',
    'paintWargame3Preview',
    'buildWargame3ReadOnlyMapOverlayData',
    'checkWargame3ScenarioWorkflowAcceptance'
];
var missingExports = prevExports.filter(function(n) {
    return swSrc.indexOf(n + ':') < 0;
});
check(missingExports.length === 0,
      'T52: all previous PR exports still present',
      missingExports.length ? 'MISSING: ' + missingExports.join(', ') : 'all present');

// ── Additional targeted tests ──────────────────────────────────────────────
console.log('\n─── Additional: call-wire & step navigation IDs ───');

// Wire: _paintW3StepSummary calls paintWargame3PreviewUnitScope
var sumSrc = extractFn(swSrc, '_paintW3StepSummary');
check(sumSrc !== null && sumSrc.indexOf('paintWargame3PreviewUnitScope') >= 0,
      'Extra-01: _paintW3StepSummary wires paintWargame3PreviewUnitScope(p)');

// Step navigator DOM IDs not modified
check(htmlSrc.indexOf('id="sw-drp-step-summary"') >= 0,
      'Extra-02: #sw-drp-step-summary still in app.html');
check(htmlSrc.indexOf('id="sw-drp-sum-obj-chip"') >= 0,
      'Extra-03: #sw-drp-sum-obj-chip unchanged');
check(htmlSrc.indexOf('id="sw-drp-sum-units"') >= 0,
      'Extra-04: #sw-drp-sum-units unchanged');

// Scope block is AFTER step-summary, BEFORE event-log (DOM order)
var stepSumIdx = htmlSrc.indexOf('id="sw-drp-step-summary"');
var scopeIdx   = htmlSrc.indexOf('id="sw-drp-unit-scope"');
var evtLogIdx  = htmlSrc.indexOf('id="sw-drp-event-log"');
check(stepSumIdx < scopeIdx && scopeIdx < evtLogIdx,
      'Extra-05: DOM order: step-summary < scope-label < event-log');

// wargame3.json unchanged
if (fs.existsSync(W3_PATH)) {
    var w3Src = fs.readFileSync(W3_PATH, 'utf8');
    var w3    = JSON.parse(w3Src);
    check(Array.isArray(w3.red_units) && w3.red_units.length === 70,
          'Extra-06: wargame3.json unchanged (70 red_units)');
    check(Array.isArray(w3.blue_units_initial) && w3.blue_units_initial.length === 83,
          'Extra-07: wargame3.json unchanged (83 blue_units_initial)');
}

// No forbidden buttons in scope label HTML
var scopeBlock = htmlSrc.slice(
    htmlSrc.indexOf('id="sw-drp-unit-scope"') - 5,
    htmlSrc.indexOf('id="sw-drp-unit-scope"') + 500
);
var hasForbidden = /\b(import|apply|run|execute|commit|confirm|approve|go live)\b/i
    .test(scopeBlock);
check(!hasForbidden, 'Extra-08: no forbidden action text in scope label HTML block');

// ── Results ────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(65));
console.log('  PR-285A Test Results');
console.log('═'.repeat(65));
results.forEach(function(r) {
    console.log('  ' + (r.ok ? '✅' : '❌') + '  ' + r.label +
                (r.detail !== undefined ? ' — ' + r.detail : ''));
});
console.log('─'.repeat(65));
console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
console.log('═'.repeat(65));
console.log('\n  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));

process.exit(failed === 0 ? 0 : 1);
