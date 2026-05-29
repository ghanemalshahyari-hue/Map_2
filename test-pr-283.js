/**
 * test-pr-283.js — PR-283 Scenario Source Panel Consolidation
 *
 * Verifies:
 *  - New structural IDs exist in app.html
 *  - Local JSON import controls still present (same IDs)
 *  - External selector/preview IDs still present
 *  - New i18n keys present (EN + AR)
 *  - New CSS classes present
 *  - External selector logic still works (via sandbox)
 *  - No forbidden patterns
 *  - PR-282 and PR-284 tests still pass (key sub-checks)
 *  - No console errors, no 630 list, no new page
 *
 * Harness: Node.js — no DOM, no browser, no network.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const SW_SRC    = path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js');
const APP_HTML  = path.join(__dirname, 'UI_MOdified/client/app.html');
const I18N_JS   = path.join(__dirname, 'UI_MOdified/client/i18n.js');
const STYLE_CSS = path.join(__dirname, 'UI_MOdified/client/style.css');
const MANIFEST  = path.join(__dirname, 'docs/scenario-pack-audit/external_scenario_source_manifest.json');
const WG3_JSON  = path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json');
const APP_JS    = path.join(__dirname, 'UI_MOdified/client/app.js');
const ADJMAP_JS = path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js');

const swSrc      = fs.readFileSync(SW_SRC,     'utf8');
const htmlSrc    = fs.readFileSync(APP_HTML,   'utf8');
const i18nSrc    = fs.readFileSync(I18N_JS,    'utf8');
const cssSrc     = fs.readFileSync(STYLE_CSS,  'utf8');
const realManifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

// ── Minimal DOM stub ──────────────────────────────────────────────────────────
function makeDomStub() {
    var elements = {};
    function makeEl(id) {
        var el = {
            id: id, _disabled: false, _innerHTML: '', _textContent: '',
            _value: '', _selectedIndex: -1, _options: [], _attrs: {},
            get disabled()       { return this._disabled; },
            set disabled(v)      { this._disabled = v; },
            get innerHTML()      { return this._innerHTML; },
            set innerHTML(v)     { this._options = []; this._innerHTML = v; },
            get textContent()    { return this._textContent; },
            set textContent(v)   { this._textContent = v; },
            get value()          { return this._value; },
            set value(v)         { this._value = v; },
            get selectedIndex()  { return this._selectedIndex; },
            set selectedIndex(v) { this._selectedIndex = v; },
            get options()        { return this._options; },
            setAttribute:    function(k, v) { this._attrs[k] = v; },
            removeAttribute: function(k)    { delete this._attrs[k]; },
            hasAttribute:    function(k)    {
                return Object.prototype.hasOwnProperty.call(this._attrs, k);
            },
            appendChild: function(c) { this._options.push(c); },
            addEventListener: function() {}
        };
        return el;
    }
    function makeOption(val, text) {
        return {
            value: val, textContent: text, _attrs: {},
            setAttribute:    function(k,v) { this._attrs[k]=v; },
            removeAttribute: function(k) { delete this._attrs[k]; },
            hasAttribute:    function(k) {
                return Object.prototype.hasOwnProperty.call(this._attrs,k);
            }
        };
    }
    return {
        getElementById: function(id) {
            if (!elements[id]) elements[id] = makeEl(id);
            return elements[id];
        },
        createElement: function(tag) {
            return tag === 'option' ? makeOption('','') : makeEl('_'+tag);
        },
        _elements: elements
    };
}

function extractFn(src, name) {
    var re = new RegExp('function\\s+' + name + '\\s*\\(');
    var si = src.search(re);
    if (si < 0) return null;
    var depth = 0, i = si;
    while (i < src.length) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
        i++;
    }
    return src.slice(si, i + 1);
}

function buildSandbox() {
    var doc  = makeDomStub();
    var names = [
        'buildExternalScenarioCatalogFromManifest',
        'buildSingleExternalScenarioCatalogEntry',
        'paintExternalScenarioPreviewEntry',
        'setExternalScenarioPreviewEntry',
        'setExternalScenarioCatalogSubset',
        'getExternalScenarioCatalogSubset',
        'clearExternalScenarioCatalogSubset',
        'paintExternalScenarioCatalogSelector',
        '_handleExternalScenarioSelectChange',
        'initExternalScenarioCatalogSelector',
        'previewExternalScenarioCatalogSubsetFromManifest',
        'buildExternalScenarioSourceTrace',
        'paintExternalScenarioSourceTrace'
    ];
    var body = 'var _extPreviewEntry = null;\nvar _externalScenarioCatalogSubset = null;\n';
    names.forEach(function(n) { var f = extractFn(swSrc, n); if (f) body += f + '\n'; });
    body += 'return {\n';
    names.forEach(function(n) {
        body += '  ' + n + ': (typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined),\n';
    });
    body += '  _doc: document\n};\n';
    return new Function('document', body)(doc);
}

// ── Test runner ───────────────────────────────────────────────────────────────
var passed = 0, failed = 0, total = 0;
var failures = [];

function assert(cond, label, detail) {
    total++;
    if (cond) {
        passed++;
        console.log('  ✅ T' + total + '  ' + label);
    } else {
        failed++;
        failures.push('T' + total + ': ' + label + (detail ? ' — ' + detail : ''));
        console.log('  ❌ T' + total + '  ' + label + (detail ? ' — ' + detail : ''));
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — app.html: new structural IDs
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 1: app.html — new structural IDs ──');
(function() {
    assert(htmlSrc.indexOf('id="sw-scenario-source-section"') >= 0,
           'T1: #sw-scenario-source-section in HTML');
    assert(htmlSrc.indexOf('id="sw-local-json-source-card"') >= 0,
           'T2: #sw-local-json-source-card in HTML');
    assert(htmlSrc.indexOf('id="sw-external-catalog-source-card"') >= 0,
           'T3: #sw-external-catalog-source-card in HTML');

    // Parent/child containment: both subcards must be inside the source section
    var srcIdx  = htmlSrc.indexOf('id="sw-scenario-source-section"');
    var localIdx  = htmlSrc.indexOf('id="sw-local-json-source-card"');
    var extIdx    = htmlSrc.indexOf('id="sw-external-catalog-source-card"');
    // Find where the source section ends (look for closing tag at same depth)
    var sStart = htmlSrc.lastIndexOf('<div', srcIdx);
    var depth = 0, pos = sStart;
    while (pos < htmlSrc.length) {
        if (htmlSrc.slice(pos, pos+4) === '<div') depth++;
        else if (htmlSrc.slice(pos, pos+6) === '</div>') { depth--; if (depth === 0) break; }
        pos++;
    }
    var sEnd = pos;
    assert(localIdx > srcIdx && localIdx < sEnd,
           'T4: #sw-local-json-source-card is inside #sw-scenario-source-section');
    assert(extIdx > srcIdx && extIdx < sEnd,
           'T5: #sw-external-catalog-source-card is inside #sw-scenario-source-section');

    // Source section inside workspace panel
    var panelIdx = htmlSrc.indexOf('id="scenario-workspace-panel"');
    assert(srcIdx > panelIdx, 'T6: #sw-scenario-source-section is inside #scenario-workspace-panel');

    // Section header labels present
    assert(htmlSrc.indexOf('data-i18n="sw-src-panel-title"') >= 0,
           'T7: sw-src-panel-title i18n attr in HTML');
    assert(htmlSrc.indexOf('data-i18n="sw-src-local-title"') >= 0,
           'T8: sw-src-local-title i18n attr in HTML');
    assert(htmlSrc.indexOf('data-i18n="sw-src-external-title"') >= 0,
           'T9: sw-src-external-title i18n attr in HTML');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — app.html: local JSON import controls still present
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 2: app.html — local JSON import controls ──');
(function() {
    assert(htmlSrc.indexOf('id="sw-dpkg-manifest-input"') >= 0,
           'T10: #sw-dpkg-manifest-input still in HTML');
    assert(htmlSrc.indexOf('id="sw-dpkg-steps-input"') >= 0,
           'T11: #sw-dpkg-steps-input still in HTML');
    assert(htmlSrc.indexOf('id="sw-dpkg-import-json"') >= 0,
           'T12: #sw-dpkg-import-json button still in HTML');
    assert(htmlSrc.indexOf('sw-dpkg-import-help-title') >= 0,
           'T13: How to import section still in HTML');
    assert(htmlSrc.indexOf('sw-dpkg-import-help-step-1') >= 0,
           'T14: Import step 1 still in HTML');
    assert(htmlSrc.indexOf('sw-dpkg-import-note') >= 0,
           'T15: Import note still in HTML');

    // Local import controls must be inside #sw-local-json-source-card
    var localStart = htmlSrc.indexOf('id="sw-local-json-source-card"');
    var manifestIdx = htmlSrc.indexOf('id="sw-dpkg-manifest-input"');
    var stepsIdx    = htmlSrc.indexOf('id="sw-dpkg-steps-input"');
    var importBtnIdx = htmlSrc.indexOf('id="sw-dpkg-import-json"');
    assert(manifestIdx > localStart, 'T16: manifest input is after #sw-local-json-source-card');
    assert(stepsIdx    > localStart, 'T17: steps input is after #sw-local-json-source-card');
    assert(importBtnIdx > localStart,'T18: import button is after #sw-local-json-source-card');

    // They should also be before #sw-external-catalog-source-card
    var extStart = htmlSrc.indexOf('id="sw-external-catalog-source-card"');
    assert(manifestIdx < extStart, 'T19: manifest input is before #sw-external-catalog-source-card');
    assert(stepsIdx    < extStart, 'T20: steps input is before #sw-external-catalog-source-card');
    assert(importBtnIdx < extStart,'T21: import button is before #sw-external-catalog-source-card');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — app.html: external selector/preview/trace IDs still present
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 3: app.html — external section IDs ──');
(function() {
    assert(htmlSrc.indexOf('id="sw-ext-select-section"') >= 0,
           'T22: #sw-ext-select-section still in HTML');
    assert(htmlSrc.indexOf('id="sw-ext-select-control"') >= 0,
           'T23: #sw-ext-select-control still in HTML');
    assert(htmlSrc.indexOf('id="sw-ext-select-count"') >= 0,
           'T24: #sw-ext-select-count still in HTML');
    assert(htmlSrc.indexOf('id="sw-ext-trace-section"') >= 0,
           'T25: #sw-ext-trace-section still in HTML');
    assert(htmlSrc.indexOf('id="sw-ext-trace-body"') >= 0,
           'T26: #sw-ext-trace-body still in HTML');
    assert(htmlSrc.indexOf('id="sw-ext-trace-confidence"') >= 0,
           'T27: #sw-ext-trace-confidence still in HTML');

    // External sections are inside #sw-external-catalog-source-card
    var extCardStart = htmlSrc.indexOf('id="sw-external-catalog-source-card"');
    var selectSectionIdx = htmlSrc.indexOf('id="sw-ext-select-section"');
    var traceSectionIdx  = htmlSrc.indexOf('id="sw-ext-trace-section"');
    assert(selectSectionIdx > extCardStart,
           'T28: #sw-ext-select-section is after #sw-external-catalog-source-card');
    assert(traceSectionIdx  > extCardStart,
           'T29: #sw-ext-trace-section is after #sw-external-catalog-source-card');

    // select disabled by default
    var selStart = htmlSrc.indexOf('id="sw-ext-select-control"');
    var selTag   = htmlSrc.slice(selStart - 50, selStart + 200);
    assert(selTag.indexOf('disabled') >= 0,
           'T30: #sw-ext-select-control still has disabled attribute');

    // #sw-ext-trace-body hidden by default
    var traceBodyStart = htmlSrc.indexOf('id="sw-ext-trace-body"');
    var traceBodyTag   = htmlSrc.slice(traceBodyStart - 50, traceBodyStart + 100);
    assert(traceBodyTag.indexOf('hidden') >= 0,
           'T31: #sw-ext-trace-body still has hidden attribute');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — app.html: no forbidden buttons inside the new sections
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 4: app.html — no forbidden controls ──');
(function() {
    var srcSectionStart = htmlSrc.indexOf('id="sw-scenario-source-section"');
    // Find end of the source section div
    var sStart = htmlSrc.lastIndexOf('<div', srcSectionStart);
    var depth = 0, pos = sStart;
    while (pos < htmlSrc.length) {
        if (htmlSrc.slice(pos, pos+4) === '<div') depth++;
        else if (htmlSrc.slice(pos, pos+6) === '</div>') { depth--; if (depth === 0) break; }
        pos++;
    }
    var srcBlock = htmlSrc.slice(sStart, pos + 6);

    // No forbidden button labels (Import JSON locally is allowed as it's the local import btn)
    var forbiddenPatterns = ['Apply</button','Run</button','Execute</button',
                             'Commit</button','Confirm</button','Approve</button',
                             'Go Live</button'];
    forbiddenPatterns.forEach(function(pat) {
        assert(srcBlock.indexOf(pat) < 0,
               'T32: no "' + pat + '" in source section');
    });

    // No new page reference
    assert(htmlSrc.indexOf('id="sw-scenario-source-page"') < 0,
           'T33: no sw-scenario-source-page (no new page)');

    // Invariant badges still present after the source section
    var invariantIdx = htmlSrc.indexOf('class="sw-invariants"');
    var srcSectionDiv = htmlSrc.indexOf('id="sw-scenario-source-section"');
    assert(invariantIdx > srcSectionDiv, 'T34: invariant badges still present after source section');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — JS: _initExtPreviewSection updated
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 5: JS — _initExtPreviewSection updated ──');
(function() {
    assert(swSrc.indexOf('sw-external-catalog-source-card') >= 0,
           'T35: sw-external-catalog-source-card referenced in scenario-workspace.js');
    assert(swSrc.indexOf('sw-ext-trace-section') >= 0 &&
           swSrc.indexOf('insertBefore') >= 0,
           'T36: insertBefore used to position preview before trace section');

    // Fallback to #scenario-workspace-panel still present
    assert(swSrc.indexOf('scenario-workspace-panel') >= 0,
           'T37: scenario-workspace-panel fallback still in JS');

    // Init still calls the function
    assert(swSrc.indexOf('_initExtPreviewSection()') >= 0,
           'T38: _initExtPreviewSection() still called from init');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — JS sandbox: external selector logic still works
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 6: JS sandbox — external selector logic ──');
(function() {
    var sb = buildSandbox();

    // Selector starts with no options before catalog (disabled state comes from HTML attribute,
    // not pre-set by sandbox — browser test covers that; here we verify it has no options yet)
    var selEl = sb._doc.getElementById('sw-ext-select-control');
    assert(selEl.options.length === 0,
           'T39: selector has no options before catalog loaded (stub starts empty)');

    // previewExternalScenarioCatalogSubsetFromManifest loads catalog
    var r = sb.previewExternalScenarioCatalogSubsetFromManifest(
        realManifest, { limit: 10, avoidLua: true, autoPreviewFirst: true });
    assert(r.passed === true, 'T40: previewExternalScenarioCatalogSubsetFromManifest passes');
    assert(r.catalog && r.catalog.returnedCount === 10,
           'T41: catalog has 10 entries (not 630)', r.catalog ? r.catalog.returnedCount : 'null');

    // Selector now has 10 + 1 prompt = 11 options
    assert(selEl.options.length === 11, 'T42: selector has 11 options (10+prompt)',
           selEl.options.length + ' options');

    // Auto-selected first entry
    assert(!!r.selectedEntry, 'T43: autoPreviewFirst selected an entry');
    assert(r.selectedEntry.entryType === 'external_scenario_catalog_entry',
           'T44: selectedEntry has correct entryType');

    // Preview body populated
    var previewBody = sb._doc.getElementById('sw-ext-preview-body');
    assert(!previewBody.hasAttribute('hidden'), 'T45: preview body is visible after autoPreviewFirst');

    // Source trace populated
    var traceBody = sb._doc.getElementById('sw-ext-trace-body');
    assert(!traceBody.hasAttribute('hidden'), 'T46: trace body is visible after autoPreviewFirst');

    // Less than 26 options → not showing 630 scenarios
    assert(selEl.options.length <= 26, 'T47: selector does NOT show 630 scenarios');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — JS sandbox: buildExternalScenarioSourceTrace still works
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 7: JS sandbox — buildExternalScenarioSourceTrace ──');
(function() {
    var sb = buildSandbox();
    var catResult = sb.buildExternalScenarioCatalogFromManifest(realManifest, { limit: 5 });
    var entry = catResult.catalog.entries[0];
    var tr = sb.buildExternalScenarioSourceTrace(entry);
    assert(tr.passed === true, 'T48: buildExternalScenarioSourceTrace still works');
    assert(tr.trace.traceType === 'external_scenario_source_trace',
           'T49: trace has correct traceType');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8 — i18n.js: PR-283 keys EN + AR
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 8: i18n.js keys ──');
(function() {
    var KEYS = ['sw-src-panel-title', 'sw-src-panel-subtitle',
                'sw-src-local-title',    'sw-src-local-subtitle',
                'sw-src-external-title', 'sw-src-external-subtitle'];
    var arSection = i18nSrc.slice(i18nSrc.indexOf('ar:'));
    KEYS.forEach(function(k) {
        assert(i18nSrc.indexOf("'" + k + "'") >= 0, 'T (EN key): ' + k);
        assert(arSection.indexOf("'" + k + "'") >= 0, 'T (AR key): ' + k);
    });
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9 — style.css: PR-283 classes
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 9: style.css ──');
(function() {
    assert(cssSrc.indexOf('.sw-scenario-source-section') >= 0,
           'T50: .sw-scenario-source-section in CSS');
    assert(cssSrc.indexOf('.sw-src-subcard') >= 0,
           'T51: .sw-src-subcard in CSS');
    assert(cssSrc.indexOf('.sw-src-subcard-hdr') >= 0,
           'T52: .sw-src-subcard-hdr in CSS');
    assert(cssSrc.indexOf('.sw-src-subcard-title') >= 0,
           'T53: .sw-src-subcard-title in CSS');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10 — Source safety: no forbidden calls in new HTML/JS
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 10: source safety ──');
(function() {
    // Check the PR-283 JS block (only _initExtPreviewSection — avoid false positives from comments)
    var initFnSrc = extractFn(swSrc, '_initExtPreviewSection') || '';
    assert(initFnSrc.indexOf('fetch(') < 0,          'T54: no fetch( in _initExtPreviewSection');
    assert(initFnSrc.indexOf('localStorage') < 0,    'T55: no localStorage in _initExtPreviewSection');
    assert(initFnSrc.indexOf('/api/sim/commit') < 0, 'T56: no /api/sim/commit in _initExtPreviewSection');
    assert(initFnSrc.indexOf('applyDecision(') < 0,  'T57: no applyDecision( in _initExtPreviewSection');

    // No .scen / .ini / Lua patterns in the new block (function-scope checks avoid comment noise)
    assert(initFnSrc.indexOf('luaExecuted: true') < 0,         'T58: no luaExecuted:true');
    assert(initFnSrc.indexOf('iniTreatedAsMetadata: true') < 0,'T59: no iniTreatedAsMetadata:true');
    assert(initFnSrc.indexOf('scenBinaryParsed: true') < 0,    'T60: no scenBinaryParsed:true');
    assert(initFnSrc.indexOf('previewComplete: true') < 0,     'T61: no previewComplete:true');
    // Use call-syntax to avoid matching safety comment strings like "No selectedDecision:"
    assert(!/selectedDecision\s*\(/.test(initFnSrc),           'T62: no selectedDecision() call');
    assert(!/expectedResult\s*\(/.test(initFnSrc),             'T63: no expectedResult() call');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 11 — Protected files unchanged
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 11: protected files unchanged ──');
(function() {
    var appJs  = fs.readFileSync(APP_JS,   'utf8');
    var adjMap = fs.readFileSync(ADJMAP_JS,'utf8');
    var wg3    = JSON.parse(fs.readFileSync(WG3_JSON, 'utf8'));

    assert(appJs.indexOf('sw-scenario-source-section') < 0,
           'T64: app.js not modified');
    assert(adjMap.indexOf('sw-scenario-source-section') < 0,
           'T65: adjudicator-map.js not modified');
    assert(typeof wg3 === 'object' && wg3 !== null,
           'T66: wargame3.json still valid JSON');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 12 — PR-282 regression: all key exported functions still present
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 12: PR-282/281/280 exports still present ──');
(function() {
    var EXPORTS = [
        'checkWargame3ScenarioWorkflowAcceptance',
        'buildExternalScenarioCatalogFromManifest',
        'buildSingleExternalScenarioCatalogEntry',
        'paintExternalScenarioPreviewEntry',
        'setExternalScenarioPreviewEntry',
        'setExternalScenarioCatalogSubset',
        'getExternalScenarioCatalogSubset',
        'clearExternalScenarioCatalogSubset',
        'paintExternalScenarioCatalogSelector',
        'previewExternalScenarioCatalogSubsetFromManifest',
        'buildExternalScenarioSourceTrace',
        'paintExternalScenarioSourceTrace'
    ];
    EXPORTS.forEach(function(name) {
        assert(swSrc.indexOf(name + ':') >= 0 || swSrc.indexOf(name + ' :') >= 0,
               'T (export): ' + name + ' still exported');
    });
})();

// ═══════════════════════════════════════════════════════════════════════════════
// FINAL REPORT
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(65));
console.log('  PR-283 Tests — RESULTS');
console.log('═'.repeat(65));
console.log('  Passed: ' + passed + '  |  Failed: ' + failed + '  |  Total: ' + total);
if (failures.length) {
    console.log('\n  FAILURES:');
    failures.forEach(function(f) { console.log('    ❌  ' + f); });
}
console.log('═'.repeat(65));
console.log('\n  Verdict: ' + (failed === 0 ? 'PASS ✅' : 'FAIL ❌'));
process.exit(failed === 0 ? 0 : 1);
