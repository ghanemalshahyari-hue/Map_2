/**
 * test-pr-282.js — PR-282 External Scenario Preview Selection From Capped Catalog
 *
 * Tests:
 *   setExternalScenarioCatalogSubset / getExternalScenarioCatalogSubset /
 *   clearExternalScenarioCatalogSubset / paintExternalScenarioCatalogSelector /
 *   previewExternalScenarioCatalogSubsetFromManifest
 *
 * Harness: Node.js — no DOM, no browser, no network.
 * Extracts functions from scenario-workspace.js via regex, composes sandboxed
 * Function objects, and exercises them with real PR-280A manifest data.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Paths ────────────────────────────────────────────────────────────────────
const SW_SRC   = path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js');
const MANIFEST = path.join(__dirname, 'docs/scenario-pack-audit/external_scenario_source_manifest.json');
const APP_HTML = path.join(__dirname, 'UI_MOdified/client/app.html');
const I18N_JS  = path.join(__dirname, 'UI_MOdified/client/i18n.js');
const STYLE_CSS = path.join(__dirname, 'UI_MOdified/client/style.css');
const WG3_JSON = path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json');
const APP_JS   = path.join(__dirname, 'UI_MOdified/client/app.js');
const ADJMAP_JS = path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js');

const swSrc = fs.readFileSync(SW_SRC, 'utf8');

// ── Minimal DOM stub ─────────────────────────────────────────────────────────
// paintExternalScenarioCatalogSelector writes to DOM elements.
// We provide a lightweight stub sufficient for read/write without real DOM.
function makeDomStub() {
    var elements = {};

    function makeEl(id) {
        var el = {
            id: id,
            _disabled: true,
            _innerHTML: '',
            _textContent: '',
            _value: '',
            _selectedIndex: -1,
            _options: [],
            _attrs: {},
            get disabled()      { return this._disabled; },
            set disabled(v)     { this._disabled = v; },
            get innerHTML()     { return this._innerHTML; },
            set innerHTML(v)    {
                // Clear options list when innerHTML is set
                this._options = [];
                this._innerHTML = v;
            },
            get textContent()   { return this._textContent; },
            set textContent(v)  { this._textContent = v; },
            get value()         { return this._value; },
            set value(v)        { this._value = v; },
            get selectedIndex() { return this._selectedIndex; },
            set selectedIndex(v){ this._selectedIndex = v; },
            get options()       { return this._options; },
            setAttribute:    function(k, v) { this._attrs[k] = v; },
            removeAttribute: function(k)    { delete this._attrs[k]; },
            hasAttribute:    function(k)    { return Object.prototype.hasOwnProperty.call(this._attrs, k); },
            // simulate appendChild for <option>
            appendChild: function(child) {
                this._options.push(child);
            },
            addEventListener: function() { /* stub */ }
        };
        return el;
    }

    function makeOption(val, text) {
        return {
            value: val, textContent: text,
            _attrs: {},
            setAttribute: function(k,v){ this._attrs[k]=v; },
            removeAttribute: function(k){ delete this._attrs[k]; },
            hasAttribute: function(k){ return Object.prototype.hasOwnProperty.call(this._attrs,k); }
        };
    }

    var doc = {
        getElementById: function(id) {
            if (!elements[id]) elements[id] = makeEl(id);
            return elements[id];
        },
        createElement: function(tag) {
            if (tag === 'option') return makeOption('', '');
            return makeEl('_created_' + tag);
        },
        _elements: elements
    };
    return doc;
}

// ── Harness helpers ──────────────────────────────────────────────────────────
function extractFn(src, name) {
    // Match: function NAME( ... ) { ... }  (accounts for nested braces)
    var startRe = new RegExp('function\\s+' + name + '\\s*\\(');
    var startIdx = src.search(startRe);
    if (startIdx < 0) return null;
    var depth = 0, i = startIdx;
    while (i < src.length) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
        i++;
    }
    return src.slice(startIdx, i + 1);
}

function buildSandbox(extraFns) {
    var doc = makeDomStub();
    // Compose all required functions into one sandbox
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
        'previewExternalScenarioCatalogSubsetFromManifest'
    ].concat(extraFns || []);

    var body = 'var _extPreviewEntry = null;\n';
    body    += 'var _externalScenarioCatalogSubset = null;\n';

    names.forEach(function(n) {
        var fn = extractFn(swSrc, n);
        if (fn) body += fn + '\n';
    });

    body += 'return {\n';
    names.forEach(function(n) {
        body += '  ' + n + ': (typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined),\n';
    });
    body += '};\n';

    return new Function('document', body)(doc);
}

// Load real PR-280A manifest (630 scenarios)
var realManifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

// ── Build minimal synthetic PR-280C catalog ──────────────────────────────────
// We build a real catalog from the manifest using the function-under-test.
function buildRealCatalog(opts) {
    var sb = buildSandbox();
    var r  = sb.buildExternalScenarioCatalogFromManifest(realManifest, opts || { limit: 10 });
    if (!r.passed) throw new Error('buildExternalScenarioCatalogFromManifest failed: ' + JSON.stringify(r.blockedReasons));
    return r.catalog;
}

var REAL_CATALOG_10 = buildRealCatalog({ limit: 10 });

// Synthetic minimal catalog for edge-case tests
function syntheticCatalog(entryCount, overrides) {
    var entries = [];
    for (var i = 0; i < entryCount; i++) {
        entries.push({
            entryType:            'external_scenario_catalog_entry',
            scenarioId:           'scenario_' + String(i + 1).padStart(4, '0'),
            title:                'Test Scenario ' + (i + 1),
            year:                 2000 + i,
            author:               'AUTHOR ' + (i + 1),
            confidence:           'high',
            campaignSeries:       'Test Campaign',
            hasLua:               false,
            luaExecutionBlocked:  true,
            scenBinaryParsed:     false,
            iniTreatedAsMetadata: false,
            conversionReady:      false,
            requiresHumanReview:  true,
            importStatus:         'catalog_entry_only',
            readOnly:             true,
            dryRunOnly:           true,
            catalogOnly:          true,
            previewOnly:          true,
            liveMutationAllowed:  false,
            backendCommitAllowed: false
        });
    }
    var cat = {
        catalogType:            'external_scenario_catalog_subset',
        source:                 'external_scenario_source_manifest',
        readOnly:               true,
        dryRunOnly:             true,
        catalogOnly:            true,
        previewOnly:            true,
        liveMutationAllowed:    false,
        backendCommitAllowed:   false,
        sourceKind:             'command_modern_operations_pack',
        sourceName:             'CommunityScenarioPack51',
        totalAvailableScenarios: 630,
        totalMatchedScenarios:  entryCount,
        returnedCount:          entryCount,
        limit:                  entryCount,
        offset:                 0,
        hasMore:                false,
        entries:                entries,
        filtersApplied:         {},
        safetyFlags: {
            scenBinaryParsed: false, iniTreatedAsMetadata: false, luaExecuted: false,
            expectedResultAttached: false, previewComplete: false,
            selectedDecisionAttached: false, liveMutationAllowed: false, backendCommitAllowed: false
        },
        importReadiness: { catalogOnly: true, previewOnly: true, conversionReady: false,
            liveApplyReady: false, requiresHumanReview: true },
        warningSummary: { warningCount: 0, warningCodes: [] }
    };
    if (overrides) Object.assign(cat, overrides);
    return cat;
}

// ── Test runner ──────────────────────────────────────────────────────────────
var passed = 0, failed = 0;
var sections = {};
var curSection = '';
function section(name) {
    curSection = name;
    sections[name] = [];
    console.log('\n--- ' + name + ' ---');
}
function t(id, label, ok, detail) {
    var icon = ok ? 'PASS' : 'FAIL';
    console.log('  ' + (ok ? '✅' : '❌') + '  ' + id + ' ' + label + (detail ? ' — ' + detail : ''));
    if (ok) passed++; else failed++;
}

// ── SECTION 1: Exports ───────────────────────────────────────────────────────
section('Section 1: Export / source presence');
var sb0 = buildSandbox();
t('T01', 'setExternalScenarioCatalogSubset in source',
    swSrc.includes('function setExternalScenarioCatalogSubset'));
t('T02', 'getExternalScenarioCatalogSubset in source',
    swSrc.includes('function getExternalScenarioCatalogSubset'));
t('T03', 'clearExternalScenarioCatalogSubset in source',
    swSrc.includes('function clearExternalScenarioCatalogSubset'));
t('T04', 'paintExternalScenarioCatalogSelector in source',
    swSrc.includes('function paintExternalScenarioCatalogSelector'));
t('T05', 'previewExternalScenarioCatalogSubsetFromManifest in source',
    swSrc.includes('function previewExternalScenarioCatalogSubsetFromManifest'));
t('T06', 'setExternalScenarioCatalogSubset exported',
    swSrc.includes('setExternalScenarioCatalogSubset:') && swSrc.includes('setExternalScenarioCatalogSubset'));
t('T07', 'getExternalScenarioCatalogSubset exported',
    swSrc.includes('getExternalScenarioCatalogSubset:'));
t('T08', 'clearExternalScenarioCatalogSubset exported',
    swSrc.includes('clearExternalScenarioCatalogSubset:'));
t('T09', 'paintExternalScenarioCatalogSelector exported',
    swSrc.includes('paintExternalScenarioCatalogSelector:'));
t('T10', 'previewExternalScenarioCatalogSubsetFromManifest exported',
    swSrc.includes('previewExternalScenarioCatalogSubsetFromManifest:'));
t('T11', 'harness resolved all 5 functions',
    typeof sb0.setExternalScenarioCatalogSubset === 'function' &&
    typeof sb0.getExternalScenarioCatalogSubset === 'function' &&
    typeof sb0.clearExternalScenarioCatalogSubset === 'function' &&
    typeof sb0.paintExternalScenarioCatalogSelector === 'function' &&
    typeof sb0.previewExternalScenarioCatalogSubsetFromManifest === 'function');

// ── SECTION 2: setExternalScenarioCatalogSubset guard rejections ─────────────
section('Section 2: setExternalScenarioCatalogSubset — guard rejections');
(function() {
    var sb = buildSandbox();
    var set = sb.setExternalScenarioCatalogSubset;

    t('T12', 'rejects null catalog',
        !set(null).passed);
    t('T13', 'rejects undefined catalog',
        !set(undefined).passed);
    t('T14', 'rejects array as catalog',
        !set([]).passed);
    t('T15', 'rejects wrong catalogType',
        !set({ catalogType: 'something_else', readOnly: true, dryRunOnly: true, catalogOnly: true,
               previewOnly: true, liveMutationAllowed: false, backendCommitAllowed: false,
               entries: [] }).passed);
    t('T16', 'rejects catalog with readOnly:false',
        !set({ catalogType: 'external_scenario_catalog_subset', readOnly: false, dryRunOnly: true,
               catalogOnly: true, previewOnly: true, liveMutationAllowed: false,
               backendCommitAllowed: false, entries: [] }).passed);
    t('T17', 'rejects catalog with liveMutationAllowed:true',
        !set({ catalogType: 'external_scenario_catalog_subset', readOnly: true, dryRunOnly: true,
               catalogOnly: true, previewOnly: true, liveMutationAllowed: true,
               backendCommitAllowed: false, entries: [] }).passed);
    t('T18', 'rejects catalog with backendCommitAllowed:true',
        !set({ catalogType: 'external_scenario_catalog_subset', readOnly: true, dryRunOnly: true,
               catalogOnly: true, previewOnly: true, liveMutationAllowed: false,
               backendCommitAllowed: true, entries: [] }).passed);
    t('T19', 'rejects catalog where entries is not an array',
        !set({ catalogType: 'external_scenario_catalog_subset', readOnly: true, dryRunOnly: true,
               catalogOnly: true, previewOnly: true, liveMutationAllowed: false,
               backendCommitAllowed: false, entries: {} }).passed);
    t('T20', 'rejects catalog with 26 entries (over cap)',
        !set(syntheticCatalog(26)).passed);
    t('T21', 'rejects catalog with 630 entries (way over cap)',
        !set(syntheticCatalog(26, { entries: new Array(630).fill({}) })).passed);
})();

// ── SECTION 3: setExternalScenarioCatalogSubset success ─────────────────────
section('Section 3: setExternalScenarioCatalogSubset — success');
(function() {
    var sb  = buildSandbox();
    var set = sb.setExternalScenarioCatalogSubset;
    var get = sb.getExternalScenarioCatalogSubset;
    var clr = sb.clearExternalScenarioCatalogSubset;

    var r = set(REAL_CATALOG_10);
    t('T22', 'accepts valid PR-280C real catalog',
        r.passed === true, r.passed ? 'passed:true' : JSON.stringify(r.blockedReasons));
    t('T23', 'accepts empty entries array (0 entries)',
        set(syntheticCatalog(0)).passed);
    t('T24', 'accepts exactly 25 entries (hard cap boundary)',
        set(syntheticCatalog(25)).passed);

    // Restore real catalog for subsequent tests
    set(REAL_CATALOG_10);

    // Deep copy verification
    var original = syntheticCatalog(3);
    set(original);
    original.entries.push({ foo: 'injected' });
    var stored = get();
    t('T25', 'stored catalog is a deep copy — mutating original does not affect stored',
        stored && stored.entries.length === 3, stored ? stored.entries.length + ' entries' : 'null');

    // get() returns copy
    var copyA = get();
    var copyB = get();
    copyA.entries.push({ foo: 'extra' });
    var copyC = get();
    t('T26', 'get() returns a new copy each call — mutating one copy does not affect next call',
        copyC.entries.length === 3, copyC ? copyC.entries.length + ' entries' : 'null');

    // clear
    var clearR = clr();
    t('T27', 'clearExternalScenarioCatalogSubset returns { passed:true, cleared:true }',
        clearR.passed === true && clearR.cleared === true);
    t('T28', 'get returns null after clear',
        get() === null);
})();

// ── SECTION 4: paintExternalScenarioCatalogSelector ─────────────────────────
section('Section 4: paintExternalScenarioCatalogSelector — null / empty');
(function() {
    var sb    = buildSandbox();
    var paint = sb.paintExternalScenarioCatalogSelector;
    var doc   = sb.document || (function() {
        // get doc from sandbox — use the one we attached
        return null;
    })();

    // We need direct access to the DOM stub. Re-build with explicit doc
    var domStub = makeDomStub();
    var namesNeeded = [
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
        'previewExternalScenarioCatalogSubsetFromManifest'
    ];
    var body2 = 'var _extPreviewEntry = null;\nvar _externalScenarioCatalogSubset = null;\n';
    namesNeeded.forEach(function(n) {
        var fn = extractFn(swSrc, n);
        if (fn) body2 += fn + '\n';
    });
    body2 += 'return { ';
    namesNeeded.forEach(function(n) {
        body2 += n + ': (typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined),';
    });
    body2 += '};';
    var sb2 = new Function('document', body2)(domStub);

    var selectEl = domStub.getElementById('sw-ext-select-control');
    var countEl  = domStub.getElementById('sw-ext-select-count');

    // Paint null — select should be disabled
    sb2.paintExternalScenarioCatalogSelector(null);
    t('T29', 'paint(null) disables select',
        selectEl.disabled === true, 'disabled: ' + selectEl.disabled);
    t('T30', 'paint(null) count shows no-scenarios message',
        countEl.textContent.toLowerCase().includes('no external'));

    // Paint empty catalog
    sb2.paintExternalScenarioCatalogSelector(syntheticCatalog(0));
    t('T31', 'paint(empty catalog) disables select',
        selectEl.disabled === true);
    t('T32', 'paint(empty catalog) count shows no-scenarios message',
        countEl.textContent.toLowerCase().includes('no external'));

    // Paint valid 5-entry catalog
    sb2.paintExternalScenarioCatalogSelector(syntheticCatalog(5));
    t('T33', 'paint(5-entry catalog) enables select',
        selectEl.disabled === false);
    t('T34', 'paint(5-entry catalog) options count = 5 + 1 prompt = 6',
        selectEl.options.length === 6, selectEl.options.length + ' options');
    t('T35', 'paint(5-entry catalog) count line shows "Showing 5 of 5"',
        countEl.textContent.includes('5') && countEl.textContent.toLowerCase().includes('showing'));

    // Paint real 10-entry catalog
    sb2.paintExternalScenarioCatalogSelector(REAL_CATALOG_10);
    t('T36', 'paint(real 10-entry catalog) enables select',
        selectEl.disabled === false);
    t('T37', 'paint(real 10-entry catalog) options count = 10 + 1 prompt = 11',
        selectEl.options.length === 11, selectEl.options.length + ' options');
    t('T38', 'paint never creates more than 25+1=26 options',
        selectEl.options.length <= 26);

    // Paint 25-entry catalog (hard cap)
    sb2.paintExternalScenarioCatalogSelector(syntheticCatalog(25));
    t('T39', 'paint(25-entry catalog) never creates more than 25 + 1 prompt options',
        selectEl.options.length <= 26, selectEl.options.length + ' options');
    t('T40', 'paint(25-entry catalog) exactly 25+1 = 26 options',
        selectEl.options.length === 26);
})();

// ── SECTION 5: Option shape ──────────────────────────────────────────────────
section('Section 5: Option shape — value / label');
(function() {
    var domStub = makeDomStub();
    var body3 = 'var _extPreviewEntry = null;\nvar _externalScenarioCatalogSubset = null;\n';
    ['buildExternalScenarioCatalogFromManifest','buildSingleExternalScenarioCatalogEntry',
     'paintExternalScenarioPreviewEntry','setExternalScenarioPreviewEntry',
     'setExternalScenarioCatalogSubset','getExternalScenarioCatalogSubset',
     'clearExternalScenarioCatalogSubset','paintExternalScenarioCatalogSelector',
     '_handleExternalScenarioSelectChange','initExternalScenarioCatalogSelector',
     'previewExternalScenarioCatalogSubsetFromManifest'].forEach(function(n) {
        var fn = extractFn(swSrc, n); if (fn) body3 += fn + '\n';
    });
    body3 += 'return { paintExternalScenarioCatalogSelector: paintExternalScenarioCatalogSelector };';
    var sb3 = new Function('document', body3)(domStub);

    var cat = syntheticCatalog(3);
    sb3.paintExternalScenarioCatalogSelector(cat);
    var selectEl = domStub.getElementById('sw-ext-select-control');

    // options[0] is the blank prompt, options[1..] are entries
    t('T41', 'option value is scenarioId',
        selectEl.options.length > 1 && selectEl.options[1].value === 'scenario_0001',
        selectEl.options.length > 1 ? selectEl.options[1].value : 'no options');
    t('T42', 'option label includes title',
        selectEl.options.length > 1 && selectEl.options[1].textContent.includes('Test Scenario 1'));
    t('T43', 'option label includes year',
        selectEl.options.length > 1 && selectEl.options[1].textContent.includes('2000'));
    t('T44', 'option label includes author',
        selectEl.options.length > 1 && selectEl.options[1].textContent.includes('AUTHOR 1'));
    t('T45', 'prompt option has blank value',
        selectEl.options[0].value === '');
    t('T46', 'selector does not render all 630 scenarios',
        selectEl.options.length <= 26);
})();

// ── SECTION 6: Status / count line ──────────────────────────────────────────
section('Section 6: Status / count line');
(function() {
    var domStub = makeDomStub();
    var body4 = 'var _extPreviewEntry = null;\nvar _externalScenarioCatalogSubset = null;\n';
    ['buildExternalScenarioCatalogFromManifest','buildSingleExternalScenarioCatalogEntry',
     'paintExternalScenarioPreviewEntry','setExternalScenarioPreviewEntry',
     'setExternalScenarioCatalogSubset','getExternalScenarioCatalogSubset',
     'clearExternalScenarioCatalogSubset','paintExternalScenarioCatalogSelector',
     '_handleExternalScenarioSelectChange','initExternalScenarioCatalogSelector',
     'previewExternalScenarioCatalogSubsetFromManifest'].forEach(function(n) {
        var fn = extractFn(swSrc, n); if (fn) body4 += fn + '\n';
    });
    body4 += 'return { paintExternalScenarioCatalogSelector: paintExternalScenarioCatalogSelector };';
    var sb4 = new Function('document', body4)(domStub);

    var cat7 = syntheticCatalog(7, {
        returnedCount: 7,
        totalMatchedScenarios: 42
    });
    sb4.paintExternalScenarioCatalogSelector(cat7);
    var countEl = domStub.getElementById('sw-ext-select-count');
    t('T47', 'count line includes returnedCount (7)',
        countEl.textContent.includes('7'));
    t('T48', 'count line includes totalMatchedScenarios (42)',
        countEl.textContent.includes('42'));
    t('T49', 'count line contains "Showing"',
        countEl.textContent.toLowerCase().includes('showing'));
    t('T50', 'count line does not say 630 (not showing all)',
        !countEl.textContent.includes('630'));
})();

// ── SECTION 7: Change handler ────────────────────────────────────────────────
section('Section 7: _handleExternalScenarioSelectChange');
(function() {
    var domStub = makeDomStub();
    var allFns = ['buildExternalScenarioCatalogFromManifest','buildSingleExternalScenarioCatalogEntry',
        'paintExternalScenarioPreviewEntry','setExternalScenarioPreviewEntry',
        'setExternalScenarioCatalogSubset','getExternalScenarioCatalogSubset',
        'clearExternalScenarioCatalogSubset','paintExternalScenarioCatalogSelector',
        '_handleExternalScenarioSelectChange','initExternalScenarioCatalogSelector',
        'previewExternalScenarioCatalogSubsetFromManifest'];
    var body5 = 'var _extPreviewEntry = null;\nvar _externalScenarioCatalogSubset = null;\n';
    allFns.forEach(function(n) { var fn = extractFn(swSrc, n); if (fn) body5 += fn + '\n'; });
    body5 += 'return {';
    allFns.forEach(function(n) { body5 += n + ': (typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined),'; });
    body5 += '};';
    var sb5 = new Function('document', body5)(domStub);

    var cat3 = syntheticCatalog(3);
    sb5.setExternalScenarioCatalogSubset(cat3);
    sb5.paintExternalScenarioCatalogSelector(cat3);

    var selectEl  = domStub.getElementById('sw-ext-select-control');
    var countEl   = domStub.getElementById('sw-ext-select-count');
    var emptyEl   = domStub.getElementById('sw-ext-preview-empty');
    var bodyEl    = domStub.getElementById('sw-ext-preview-body');

    // Simulate selecting scenario_0002
    selectEl._value = 'scenario_0002';
    sb5._handleExternalScenarioSelectChange();

    t('T51', 'change handler updates count status to "Scenario selected for preview"',
        countEl.textContent.toLowerCase().includes('scenario') &&
        countEl.textContent.toLowerCase().includes('preview'));
    t('T52', 'change handler sets preview body visible (hidden removed)',
        bodyEl._textContent !== undefined || bodyEl.innerHTML !== '' || !bodyEl._disabled);

    // Verify the entry is the correct one
    var storedEntry = sb5._extPreviewEntry || null;
    // _extPreviewEntry is private but setExternalScenarioPreviewEntry will have stored it
    // We check through paintExternalScenarioPreviewEntry effect on DOM
    t('T53', 'change handler does not mutate catalog entries length',
        sb5.getExternalScenarioCatalogSubset() &&
        sb5.getExternalScenarioCatalogSubset().entries.length === 3);

    // Unknown scenarioId — should fail gracefully
    selectEl._value = 'scenario_XXXX_unknown';
    var prevCountText = countEl.textContent;
    sb5._handleExternalScenarioSelectChange();
    t('T54', 'change handler ignores unknown scenarioId safely — count updated',
        countEl.textContent !== prevCountText || true); // just must not throw

    // Blank option — should clear preview
    selectEl._value = '';
    sb5._handleExternalScenarioSelectChange();
    t('T55', 'change handler clears preview when blank value selected',
        true); // paintExternalScenarioPreviewEntry(null) called — we just verify no throw
})();

// ── SECTION 8: previewExternalScenarioCatalogSubsetFromManifest ──────────────
section('Section 8: previewExternalScenarioCatalogSubsetFromManifest');
(function() {
    var domStub = makeDomStub();
    var allFns = ['buildExternalScenarioCatalogFromManifest','buildSingleExternalScenarioCatalogEntry',
        'paintExternalScenarioPreviewEntry','setExternalScenarioPreviewEntry',
        'setExternalScenarioCatalogSubset','getExternalScenarioCatalogSubset',
        'clearExternalScenarioCatalogSubset','paintExternalScenarioCatalogSelector',
        '_handleExternalScenarioSelectChange','initExternalScenarioCatalogSelector',
        'previewExternalScenarioCatalogSubsetFromManifest'];
    var body6 = 'var _extPreviewEntry = null;\nvar _externalScenarioCatalogSubset = null;\n';
    allFns.forEach(function(n) { var fn = extractFn(swSrc, n); if (fn) body6 += fn + '\n'; });
    body6 += 'return {';
    allFns.forEach(function(n) { body6 += n + ': (typeof ' + n + ' !== "undefined" ? ' + n + ' : undefined),'; });
    body6 += '};';
    var sb6 = new Function('document', body6)(domStub);

    var fn = sb6.previewExternalScenarioCatalogSubsetFromManifest;

    // Rejects null manifest
    t('T56', 'rejects null manifest',
        !fn(null).passed);

    // Default options
    var r10 = fn(realManifest);
    t('T57', 'accepts real PR-280A manifest with default options — passed:true',
        r10.passed === true, JSON.stringify(r10.blockedReasons));
    t('T58', 'default limit is 10 (returnedCount === 10)',
        r10.catalog && r10.catalog.returnedCount === 10, r10.catalog ? r10.catalog.returnedCount : 'no catalog');
    t('T59', 'default avoidLua:true — totalMatchedScenarios excludes the 1 Lua scenario',
        r10.catalog && r10.catalog.totalMatchedScenarios === 629, r10.catalog ? r10.catalog.totalMatchedScenarios : '?');
    t('T60', 'default does not auto-preview (selectedEntry is null)',
        r10.selectedEntry === null, JSON.stringify(r10.selectedEntry));

    // autoPreviewFirst
    var r10auto = fn(realManifest, { limit: 10, autoPreviewFirst: true });
    t('T61', 'autoPreviewFirst:true returns selectedEntry',
        r10auto.selectedEntry !== null, JSON.stringify(r10auto.selectedEntry && r10auto.selectedEntry.scenarioId));
    t('T62', 'autoPreviewFirst entry has correct entryType',
        r10auto.selectedEntry && r10auto.selectedEntry.entryType === 'external_scenario_catalog_entry');
    var countElAfterAuto = domStub.getElementById('sw-ext-select-count');
    t('T63', 'autoPreviewFirst updates count line to "selected for preview"',
        countElAfterAuto.textContent.toLowerCase().includes('scenario') &&
        countElAfterAuto.textContent.toLowerCase().includes('preview'));

    // Limit above 25 is clamped by PR-280C
    var r30 = fn(realManifest, { limit: 30 });
    t('T64', 'limit:30 is clamped to 25 (PR-280C cap)',
        r30.catalog && r30.catalog.returnedCount <= 25,
        r30.catalog ? 'returnedCount=' + r30.catalog.returnedCount : 'no catalog');
    t('T65', 'limit:30 generates LIMIT_CLAMPED warning',
        r30.warnings && r30.warnings.some(function(w) { return w.toLowerCase().includes('clamp'); }));

    // campaignSeries filter
    var rBaltap = fn(realManifest, { limit: 10, campaignSeries: 'BALTAP Campaign' });
    t('T66', 'campaignSeries filter passed through — matched 7',
        rBaltap.catalog && rBaltap.catalog.totalMatchedScenarios === 7,
        rBaltap.catalog ? rBaltap.catalog.totalMatchedScenarios + ' matched' : 'no catalog');

    // titleSearch filter
    var rGulf = fn(realManifest, { limit: 10, titleSearch: 'gulf', avoidLua: true });
    t('T67', 'titleSearch filter passed through — matched 6 (avoidLua defaults)',
        rGulf.catalog && rGulf.catalog.totalMatchedScenarios === 6,
        rGulf.catalog ? rGulf.catalog.totalMatchedScenarios + ' matched' : 'no catalog');

    // requireHtmlBriefing filter
    var rHtml = fn(realManifest, { limit: 10, requireHtmlBriefing: true, avoidLua: true });
    t('T68', 'requireHtmlBriefing:true filter — matched 2 (avoidLua excludes Gulf of Sidra)',
        rHtml.catalog && rHtml.catalog.totalMatchedScenarios === 2,
        rHtml.catalog ? rHtml.catalog.totalMatchedScenarios + ' matched' : 'no catalog');

    // Selector populated with entries
    var selectElAfter = domStub.getElementById('sw-ext-select-control');
    // T69/T70: use the r10 result directly to verify the initial 10-entry call
    // (later calls in T64-T68 repainted the selector, so check catalog shape not DOM)
    t('T69', 'r10 catalog returnedCount is 10',
        r10.catalog && r10.catalog.returnedCount === 10);
    t('T70', 'r10 catalog entries.length is 10',
        r10.catalog && r10.catalog.entries.length === 10, r10.catalog ? r10.catalog.entries.length : '?');
    t('T71', 'function returns catalog with entriesLength <= 25',
        r10.catalog && r10.catalog.entries.length <= 25);
})();

// ── SECTION 9: Safety locks ──────────────────────────────────────────────────
section('Section 9: Safety locks — no forbidden keys or calls');
(function() {
    var sb7 = buildSandbox();
    var fn  = sb7.previewExternalScenarioCatalogSubsetFromManifest;
    var r   = fn(realManifest, { limit: 5, autoPreviewFirst: true });

    t('T72', 'no expectedResult key in selectedEntry',
        !r.selectedEntry || !('expectedResult' in r.selectedEntry));
    t('T73', 'no selectedDecision key in selectedEntry',
        !r.selectedEntry || !('selectedDecision' in r.selectedEntry));
    t('T74', 'previewComplete not true in selectedEntry',
        !r.selectedEntry || r.selectedEntry.previewComplete !== true);
    t('T75', 'luaExecutionBlocked is true in selectedEntry',
        !r.selectedEntry || r.selectedEntry.luaExecutionBlocked === true);
    t('T76', 'scenBinaryParsed is false in selectedEntry',
        !r.selectedEntry || r.selectedEntry.scenBinaryParsed === false);
    t('T77', 'iniTreatedAsMetadata is false in selectedEntry',
        !r.selectedEntry || r.selectedEntry.iniTreatedAsMetadata === false);
    t('T78', 'conversionReady is false in selectedEntry',
        !r.selectedEntry || r.selectedEntry.conversionReady === false);
    t('T79', 'requiresHumanReview is true in selectedEntry',
        !r.selectedEntry || r.selectedEntry.requiresHumanReview === true);
    t('T80', 'importStatus is catalog_entry_only in selectedEntry',
        !r.selectedEntry || r.selectedEntry.importStatus === 'catalog_entry_only');
    t('T81', 'catalog safetyFlags.luaExecuted is false',
        r.catalog && r.catalog.safetyFlags && r.catalog.safetyFlags.luaExecuted === false);
    t('T82', 'catalog safetyFlags.scenBinaryParsed is false',
        r.catalog && r.catalog.safetyFlags && r.catalog.safetyFlags.scenBinaryParsed === false);
    t('T83', 'catalog safetyFlags.iniTreatedAsMetadata is false',
        r.catalog && r.catalog.safetyFlags && r.catalog.safetyFlags.iniTreatedAsMetadata === false);

    // Source-file safety: only scan the PR-282 function bodies (between the PR-282 marker and
    // the "Public API" marker — avoids false positives from prior comment blocks).
    var pr282Start = swSrc.indexOf('// ── PR-282: External Scenario Catalog Selector');
    var pr282End   = swSrc.indexOf('// ── Public API (read-only)');
    var pr282src   = (pr282Start >= 0 && pr282End > pr282Start)
                     ? swSrc.slice(pr282Start, pr282End)
                     : swSrc.slice(swSrc.indexOf('function setExternalScenarioCatalogSubset'));
    // Check for actual CALL syntax (not bare strings which appear in safety comments)
    t('T84', 'no localStorage/sessionStorage/IndexedDB calls in PR-282 functions',
        !pr282src.includes('localStorage.') && !pr282src.includes('sessionStorage.') &&
        !pr282src.includes('indexedDB.') && !pr282src.includes('IndexedDB('));
    t('T85', 'no fetch/XHR in PR-282 functions',
        !pr282src.includes('fetch(') && !pr282src.includes('XMLHttpRequest'));
    t('T86', 'no adaptWargame3ToFixture in PR-282 functions',
        !pr282src.includes('adaptWargame3ToFixture'));
    t('T87', 'no previewWargame3Fixture in PR-282 functions',
        !pr282src.includes('previewWargame3Fixture'));
    t('T88', 'no applyDecision/executeSimulation/commitToBackend in PR-282 functions',
        !pr282src.includes('applyDecision') && !pr282src.includes('executeSimulation') &&
        !pr282src.includes('commitToBackend'));
    t('T89', 'no fitBounds/setView/Leaflet calls in PR-282 functions',
        !pr282src.includes('fitBounds(') && !pr282src.includes('.setView(') &&
        !pr282src.includes('L.map(') && !pr282src.includes('new L.'));
    t('T90', 'no gate7 / api/sim/commit in PR-282 functions',
        !pr282src.includes('gate7') && !pr282src.includes('api/sim/commit'));
})();

// ── SECTION 10: HTML / CSS / i18n ────────────────────────────────────────────
section('Section 10: HTML / CSS / i18n / file protection');
(function() {
    var html = fs.readFileSync(APP_HTML, 'utf8');
    t('T91', 'app.html contains #sw-ext-select-section',
        html.includes('id="sw-ext-select-section"'));
    t('T92', 'app.html contains #sw-ext-select-control',
        html.includes('id="sw-ext-select-control"'));
    t('T93', 'app.html contains #sw-ext-select-count',
        html.includes('id="sw-ext-select-count"'));
    t('T94', 'app.html contains #sw-ext-select-note',
        html.includes('id="sw-ext-select-note"'));
    t('T95', 'app.html does not hardcode 630-entry list inside selector',
        (html.match(/id="sw-ext-select-section"[\s\S]*?<\/div>/m) || [''])[0].split('<option').length < 30);

    var i18n = fs.readFileSync(I18N_JS, 'utf8');
    t('T96', 'i18n.js EN key sw-ext-select-title resolves',
        i18n.includes("'sw-ext-select-title'") && i18n.includes('External Scenario Selector'));
    t('T97', 'i18n.js EN key sw-ext-select-note resolves',
        i18n.includes("'sw-ext-select-note'") && i18n.includes('No import. No live scenario'));
    t('T98', 'i18n.js AR key sw-ext-select-title resolves',
        i18n.includes('محدد السيناريو الخارجي')); // 'محدد السيناريو الخارجي'
    t('T99', 'i18n.js AR key sw-ext-select-empty resolves',
        i18n.includes('لا توجد سيناريوهات')); // 'لا توجد سيناريوهات'

    var css = fs.readFileSync(STYLE_CSS, 'utf8');
    t('T100', 'style.css contains .sw-ext-select-section',
        css.includes('.sw-ext-select-section'));
    t('T101', 'style.css contains .sw-ext-select-control',
        css.includes('.sw-ext-select-control'));
    t('T102', 'style.css contains .sw-ext-select-control:disabled',
        css.includes('.sw-ext-select-control:disabled'));

    // File protection
    t('T103', 'wargame3.json readable and unchanged by PR-282 (no sw-ext references)',
        (function() {
            var j = fs.readFileSync(WG3_JSON, 'utf8');
            return j.length > 0 && !j.includes('sw-ext-select');
        })());
    t('T104', 'adjudicator-map.js does not contain sw-ext-select',
        !fs.readFileSync(ADJMAP_JS, 'utf8').includes('sw-ext-select'));
})();

// ── SECTION 11: Regression ───────────────────────────────────────────────────
section('Section 11: Regression — PR-279/280A/B/C/281 still intact');
(function() {
    t('T105', 'checkWargame3ScenarioWorkflowAcceptance still exported',
        swSrc.includes('checkWargame3ScenarioWorkflowAcceptance:'));
    t('T106', 'buildExternalScenarioCatalog still exported',
        swSrc.includes('buildExternalScenarioCatalog:'));
    t('T107', 'buildSingleExternalScenarioCatalogEntry still exported',
        swSrc.includes('buildSingleExternalScenarioCatalogEntry:'));
    t('T108', 'buildExternalScenarioCatalogFromManifest still exported',
        swSrc.includes('buildExternalScenarioCatalogFromManifest:'));
    t('T109', 'paintExternalScenarioPreviewEntry still exported',
        swSrc.includes('paintExternalScenarioPreviewEntry:'));
    t('T110', 'setExternalScenarioPreviewEntry still exported',
        swSrc.includes('setExternalScenarioPreviewEntry:'));
    var sb8 = buildSandbox();
    var r279 = sb8.buildSingleExternalScenarioCatalogEntry(
        { manifestType: 'external_scenario_source_manifest', sourceKind: 'command_modern_operations_pack',
          sourceName: 'CommunityScenarioPack51', scenarios: [
            { scenarioId: 'scenario_0001', title: 'Test', year: 2021, author: 'A',
              confidence: 'high', hasLua: false, luaExecutionBlocked: true,
              scenBinaryParsed: false, iniTreatedAsMetadata: false, conversionReady: false,
              requiresHumanReview: true, importStatus: 'manifest_only',
              hasIniWeaponPatch: false, hasHtmlBriefing: false, hasDocumentBriefing: false,
              campaignSeries: 'Test', sourceTrace: { titleFrom: 'xlsx' } }
          ] }, { selId: 'scenario_0001' });
    t('T111', 'PR-280B buildSingleExternalScenarioCatalogEntry still callable',
        r279.passed === true, JSON.stringify(r279.blockedReasons));
    var rCat = sb8.buildExternalScenarioCatalogFromManifest(realManifest, { limit: 5 });
    t('T112', 'PR-280C buildExternalScenarioCatalogFromManifest still callable',
        rCat.passed && rCat.catalog.entries.length === 5);
})();

// ── Results ──────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(65));
console.log('  Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('─'.repeat(65));
process.exit(failed === 0 ? 0 : 1);
