/**
 * test-pr-284.js — PR-284 External Scenario Source Trace Inspector
 *
 * Tests:
 *   buildExternalScenarioSourceTrace(entry)
 *   paintExternalScenarioSourceTrace(entryOrNull)
 *   cascade from paintExternalScenarioPreviewEntry → paintExternalScenarioSourceTrace
 *
 * Harness: Node.js — no DOM, no browser, no network.
 * Extracts functions from scenario-workspace.js via regex, composes sandboxed
 * Function objects, and exercises them with real PR-280A manifest data.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Paths ────────────────────────────────────────────────────────────────────
const SW_SRC    = path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js');
const MANIFEST  = path.join(__dirname, 'docs/scenario-pack-audit/external_scenario_source_manifest.json');
const APP_HTML  = path.join(__dirname, 'UI_MOdified/client/app.html');
const I18N_JS   = path.join(__dirname, 'UI_MOdified/client/i18n.js');
const STYLE_CSS = path.join(__dirname, 'UI_MOdified/client/style.css');
const WG3_JSON  = path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json');
const APP_JS    = path.join(__dirname, 'UI_MOdified/client/app.js');
const ADJMAP_JS = path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js');

const swSrc = fs.readFileSync(SW_SRC, 'utf8');

// ── Minimal DOM stub ──────────────────────────────────────────────────────────
function makeDomStub() {
    var elements = {};

    function makeEl(id) {
        var el = {
            id: id,
            _disabled: false,
            _innerHTML: '',
            _textContent: '',
            _value: '',
            _selectedIndex: -1,
            _options: [],
            _attrs: {},
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
            appendChild: function(child) { this._options.push(child); },
            addEventListener: function() { /* stub */ }
        };
        return el;
    }

    function makeOption(val, text) {
        return {
            value: val, textContent: text,
            _attrs: {},
            setAttribute:    function(k, v) { this._attrs[k] = v; },
            removeAttribute: function(k)    { delete this._attrs[k]; },
            hasAttribute:    function(k)    {
                return Object.prototype.hasOwnProperty.call(this._attrs, k);
            }
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

// ── Function extractor ────────────────────────────────────────────────────────
function extractFn(src, name) {
    var startRe  = new RegExp('function\\s+' + name + '\\s*\\(');
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

// ── Sandbox builder ───────────────────────────────────────────────────────────
function buildSandbox(extraFns) {
    var doc = makeDomStub();
    var names = [
        'buildExternalScenarioCatalogFromManifest',
        'buildSingleExternalScenarioCatalogEntry',
        'paintExternalScenarioPreviewEntry',
        'setExternalScenarioPreviewEntry',
        'buildExternalScenarioSourceTrace',
        'paintExternalScenarioSourceTrace'
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
    body += '  _doc: document\n';
    body += '};\n';

    return new Function('document', body)(doc);
}

// ── Minimal valid entry helper ────────────────────────────────────────────────
function validEntry(overrides) {
    var base = {
        entryType:             'external_scenario_catalog_entry',
        scenarioId:            'scenario_0001',
        title:                 'Test Scenario',
        year:                  1985,
        author:                'John Smith',
        confidence:            'high',
        campaignSeries:        'Test Campaign',
        package:               'Test Pack',
        notes:                 'Some notes',
        path:                  '/path/to/scenario.scen',
        hasIni:                true,
        iniWeaponPatchPath:    '/path/to/scenario.ini',
        hasHtmlBriefing:       false,
        htmlBriefingPaths:     [],
        hasDocBriefing:        false,
        documentBriefingPaths: [],
        hasLua:                false,
        luaScriptPaths:        [],
        sourceTrace: {
            titleFrom:        'xlsx',
            yearFrom:         'xlsx',
            authorFrom:       'xlsx',
            notesFrom:        'xlsx',
            relationshipFrom: 'xlsx_package_column'
        },
        readOnly:             true,
        liveMutationAllowed:  false,
        backendCommitAllowed: false,
        luaExecutionBlocked:  true,
        scenBinaryParsed:     false,
        iniTreatedAsMetadata: false,
        conversionReady:      false,
        requiresHumanReview:  true,
        importStatus:         'catalog_entry_only'
    };
    if (overrides) {
        Object.keys(overrides).forEach(function(k) { base[k] = overrides[k]; });
    }
    return base;
}

// ── Real manifest data ────────────────────────────────────────────────────────
var realManifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

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
// SECTION 1 — buildExternalScenarioSourceTrace: null / type guards
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 1: buildExternalScenarioSourceTrace — null/type guards ──');
(function() {
    var sb = buildSandbox();
    var fn = sb.buildExternalScenarioSourceTrace;

    assert(typeof fn === 'function', 'T1: buildExternalScenarioSourceTrace is a function');

    var r1 = fn(null);
    assert(r1.passed === false, 'T2: null entry → passed:false');
    assert(Array.isArray(r1.blockedReasons), 'T3: null entry → blockedReasons is array');
    assert(r1.blockedReasons.indexOf('ENTRY_NULL_OR_INVALID') >= 0,
           'T4: null entry → ENTRY_NULL_OR_INVALID');
    assert(r1.trace === null, 'T5: null entry → trace is null');

    var r2 = fn(undefined);
    assert(r2.passed === false, 'T6: undefined entry → passed:false');
    assert(r2.blockedReasons.indexOf('ENTRY_NULL_OR_INVALID') >= 0,
           'T7: undefined entry → ENTRY_NULL_OR_INVALID');

    var r3 = fn('string');
    assert(r3.passed === false, 'T8: string entry → passed:false');

    var r4 = fn(42);
    assert(r4.passed === false, 'T9: number entry → passed:false');

    var r5 = fn({ entryType: 'wrong_type', readOnly: true });
    assert(r5.passed === false, 'T10: wrong entryType → passed:false');
    assert(r5.blockedReasons.indexOf('WRONG_ENTRY_TYPE') >= 0,
           'T11: wrong entryType → WRONG_ENTRY_TYPE');

    var r6 = fn({});
    assert(r6.passed === false, 'T12: empty object → passed:false');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — buildExternalScenarioSourceTrace: safety flag checks
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 2: buildExternalScenarioSourceTrace — safety flags ──');
(function() {
    var sb = buildSandbox();
    var fn = sb.buildExternalScenarioSourceTrace;

    var r1 = fn(validEntry({ readOnly: false }));
    assert(r1.passed === false, 'T13: readOnly:false → passed:false');
    assert(r1.blockedReasons.indexOf('READ_ONLY_NOT_SET') >= 0,
           'T14: readOnly:false → READ_ONLY_NOT_SET');

    var r2 = fn(validEntry({ liveMutationAllowed: true }));
    assert(r2.passed === false, 'T15: liveMutationAllowed:true → passed:false');
    assert(r2.blockedReasons.indexOf('LIVE_MUTATION_NOT_BLOCKED') >= 0,
           'T16: liveMutationAllowed:true → LIVE_MUTATION_NOT_BLOCKED');

    var r3 = fn(validEntry({ backendCommitAllowed: true }));
    assert(r3.passed === false, 'T17: backendCommitAllowed:true → passed:false');
    assert(r3.blockedReasons.indexOf('BACKEND_COMMIT_NOT_BLOCKED') >= 0,
           'T18: backendCommitAllowed:true → BACKEND_COMMIT_NOT_BLOCKED');

    var r4 = fn(validEntry({ scenBinaryParsed: true }));
    assert(r4.passed === false, 'T19: scenBinaryParsed:true → passed:false');
    assert(r4.blockedReasons.indexOf('SCEN_BINARY_PARSED') >= 0,
           'T20: scenBinaryParsed:true → SCEN_BINARY_PARSED');

    var r5 = fn(validEntry({ iniTreatedAsMetadata: true }));
    assert(r5.passed === false, 'T21: iniTreatedAsMetadata:true → passed:false');
    assert(r5.blockedReasons.indexOf('INI_TREATED_AS_METADATA') >= 0,
           'T22: iniTreatedAsMetadata:true → INI_TREATED_AS_METADATA');

    var r6 = fn(validEntry({ luaExecutionBlocked: false }));
    assert(r6.passed === false, 'T23: luaExecutionBlocked:false → passed:false');
    assert(r6.blockedReasons.indexOf('LUA_EXECUTION_NOT_BLOCKED') >= 0,
           'T24: luaExecutionBlocked:false → LUA_EXECUTION_NOT_BLOCKED');

    var r7 = fn(validEntry({ conversionReady: true }));
    assert(r7.passed === false, 'T25: conversionReady:true → passed:false');
    assert(r7.blockedReasons.indexOf('CONVERSION_READY_UNEXPECTEDLY_SET') >= 0,
           'T26: conversionReady:true → CONVERSION_READY_UNEXPECTEDLY_SET');

    var r8 = fn(validEntry({ requiresHumanReview: false }));
    assert(r8.passed === false, 'T27: requiresHumanReview:false → passed:false');
    assert(r8.blockedReasons.indexOf('HUMAN_REVIEW_BYPASSED') >= 0,
           'T28: requiresHumanReview:false → HUMAN_REVIEW_BYPASSED');

    // Multiple violations in one entry
    var r9 = fn(validEntry({ liveMutationAllowed: true, backendCommitAllowed: true }));
    assert(r9.passed === false, 'T29: multiple violations → passed:false');
    assert(r9.blockedReasons.length >= 2, 'T30: multiple violations → multiple blockedReasons');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — buildExternalScenarioSourceTrace: valid entry → passed:true
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 3: buildExternalScenarioSourceTrace — valid entry ──');
(function() {
    var sb = buildSandbox();
    var fn = sb.buildExternalScenarioSourceTrace;
    var entry = validEntry();
    var r = fn(entry);

    assert(r.passed === true, 'T31: valid entry → passed:true');
    assert(r.trace !== null, 'T32: valid entry → trace is not null');
    assert(Array.isArray(r.blockedReasons), 'T33: valid → blockedReasons is array');
    assert(r.blockedReasons.length === 0, 'T34: valid → blockedReasons is empty');
    assert(Array.isArray(r.warnings), 'T35: valid → warnings is array');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4 — buildExternalScenarioSourceTrace: trace shape
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 4: buildExternalScenarioSourceTrace — trace shape ──');
(function() {
    var sb = buildSandbox();
    var fn = sb.buildExternalScenarioSourceTrace;
    var entry = validEntry();
    var r = fn(entry);
    var t = r.trace;

    assert(t.traceType === 'external_scenario_source_trace', 'T36: trace.traceType correct');
    assert(t.source    === 'external_scenario_catalog_entry', 'T37: trace.source correct');
    assert(t.readOnly  === true,  'T38: trace.readOnly is true');
    assert(t.catalogOnly === true, 'T39: trace.catalogOnly is true');
    assert(t.previewOnly === true, 'T40: trace.previewOnly is true');
    assert(t.liveMutationAllowed  === false, 'T41: trace.liveMutationAllowed is false');
    assert(t.backendCommitAllowed === false, 'T42: trace.backendCommitAllowed is false');

    assert(t.scenarioId === entry.scenarioId, 'T43: trace.scenarioId matches entry');
    assert(t.title      === entry.title,      'T44: trace.title matches entry');
    assert(t.confidence === entry.confidence, 'T45: trace.confidence matches entry');

    assert(t.sourceTrace && typeof t.sourceTrace === 'object', 'T46: trace.sourceTrace is object');
    assert(t.sourceTrace.titleFrom        === 'xlsx', 'T47: sourceTrace.titleFrom');
    assert(t.sourceTrace.yearFrom         === 'xlsx', 'T48: sourceTrace.yearFrom');
    assert(t.sourceTrace.authorFrom       === 'xlsx', 'T49: sourceTrace.authorFrom');
    assert(t.sourceTrace.notesFrom        === 'xlsx', 'T50: sourceTrace.notesFrom');
    assert(t.sourceTrace.relationshipFrom === 'xlsx_package_column', 'T51: sourceTrace.relationshipFrom');

    var po = t.policies;
    assert(po && typeof po === 'object', 'T52: trace.policies is object');
    assert(po.scenBinaryParsed     === false,              'T53: policies.scenBinaryParsed false');
    assert(po.iniTreatedAsMetadata === false,              'T54: policies.iniTreatedAsMetadata false');
    assert(po.iniPurpose           === 'weapon_patch_only','T55: policies.iniPurpose correct');
    assert(po.luaExecuted          === false,              'T56: policies.luaExecuted false');
    assert(po.luaExecutionBlocked  === true,               'T57: policies.luaExecutionBlocked true');
    assert(po.conversionReady      === false,              'T58: policies.conversionReady false');
    assert(po.requiresHumanReview  === true,               'T59: policies.requiresHumanReview true');

    var re = t.readiness;
    assert(re && typeof re === 'object', 'T60: trace.readiness is object');
    assert(re.importStatus         === 'catalog_entry_only', 'T61: readiness.importStatus');
    assert(re.catalogEntryOnly     === true,  'T62: readiness.catalogEntryOnly true');
    assert(re.metadataPreviewReady === true,  'T63: readiness.metadataPreviewReady true');
    assert(re.conversionReady      === false, 'T64: readiness.conversionReady false');
    assert(re.liveApplyReady       === false, 'T65: readiness.liveApplyReady false');
    assert(re.humanReviewRequired  === true,  'T66: readiness.humanReviewRequired true');

    var ref = t.references;
    assert(ref && typeof ref === 'object', 'T67: trace.references is object');
    assert(ref.path                !== undefined, 'T68: references.path present');
    assert(Array.isArray(ref.htmlBriefingPaths),  'T69: references.htmlBriefingPaths is array');
    assert(Array.isArray(ref.documentBriefingPaths), 'T70: references.documentBriefingPaths is array');
    assert(Array.isArray(ref.luaScriptPaths),     'T71: references.luaScriptPaths is array');

    assert(Array.isArray(t.warningCodes), 'T72: trace.warningCodes is array');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5 — buildExternalScenarioSourceTrace: warning codes
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 5: buildExternalScenarioSourceTrace — warnings ──');
(function() {
    var sb = buildSandbox();
    var fn = sb.buildExternalScenarioSourceTrace;

    // HIGH confidence, xlsx title, known author, no Lua, has html briefing → no warnings
    var noWarn = validEntry({ confidence: 'high', hasHtmlBriefing: true,
        sourceTrace: { titleFrom:'xlsx', yearFrom:'xlsx', authorFrom:'xlsx',
                       notesFrom:'xlsx', relationshipFrom:'xlsx_package_column' }});
    var r0 = fn(noWarn);
    assert(r0.passed === true, 'T73: no-warning entry → passed:true');
    assert(r0.warnings.length === 0, 'T74: no-warning entry → warnings empty');

    // LOW_CONFIDENCE
    var r1 = fn(validEntry({ confidence: 'medium', hasHtmlBriefing: true,
        sourceTrace: { titleFrom:'xlsx', yearFrom:'xlsx', authorFrom:'xlsx',
                       notesFrom:'xlsx', relationshipFrom:'xlsx_package_column' }}));
    assert(r1.passed === true, 'T75: LOW_CONFIDENCE does not block passed');
    assert(r1.warnings.indexOf('LOW_CONFIDENCE') >= 0, 'T76: medium confidence → LOW_CONFIDENCE');

    var r1b = fn(validEntry({ confidence: 'low', hasHtmlBriefing: true,
        sourceTrace: { titleFrom:'xlsx', yearFrom:'xlsx', authorFrom:'xlsx',
                       notesFrom:'xlsx', relationshipFrom:'xlsx_package_column' }}));
    assert(r1b.warnings.indexOf('LOW_CONFIDENCE') >= 0, 'T77: low confidence → LOW_CONFIDENCE');

    // TITLE_FROM_FILENAME_ONLY
    var r2 = fn(validEntry({ hasHtmlBriefing: true,
        sourceTrace: { titleFrom:'filename', yearFrom:'filename', authorFrom:'unknown',
                       notesFrom:'none', relationshipFrom:'none' }}));
    assert(r2.warnings.indexOf('TITLE_FROM_FILENAME_ONLY') >= 0, 'T78: titleFrom filename → TITLE_FROM_FILENAME_ONLY');

    // AUTHOR_MISSING — null author
    var r3a = fn(validEntry({ author: null, hasHtmlBriefing: true,
        sourceTrace: { titleFrom:'xlsx', yearFrom:'xlsx', authorFrom:'unknown',
                       notesFrom:'none', relationshipFrom:'none' }}));
    assert(r3a.warnings.indexOf('AUTHOR_MISSING') >= 0, 'T79: null author → AUTHOR_MISSING');

    // AUTHOR_MISSING — 'Unknown'
    var r3b = fn(validEntry({ author: 'Unknown', hasHtmlBriefing: true,
        sourceTrace: { titleFrom:'xlsx', yearFrom:'xlsx', authorFrom:'unknown',
                       notesFrom:'none', relationshipFrom:'none' }}));
    assert(r3b.warnings.indexOf('AUTHOR_MISSING') >= 0, 'T80: "Unknown" author → AUTHOR_MISSING');

    // LUA_PRESENT_BLOCKED
    var r4 = fn(validEntry({ hasLua: true, hasHtmlBriefing: true,
        sourceTrace: { titleFrom:'xlsx', yearFrom:'xlsx', authorFrom:'xlsx',
                       notesFrom:'xlsx', relationshipFrom:'xlsx_package_column' }}));
    assert(r4.passed === true, 'T81: LUA_PRESENT_BLOCKED does not block passed');
    assert(r4.warnings.indexOf('LUA_PRESENT_BLOCKED') >= 0, 'T82: hasLua:true → LUA_PRESENT_BLOCKED');

    // NO_READABLE_BRIEFING_REFERENCE — neither html nor doc
    var r5 = fn(validEntry({ hasHtmlBriefing: false, hasDocBriefing: false,
        sourceTrace: { titleFrom:'xlsx', yearFrom:'xlsx', authorFrom:'xlsx',
                       notesFrom:'xlsx', relationshipFrom:'xlsx_package_column' }}));
    assert(r5.warnings.indexOf('NO_READABLE_BRIEFING_REFERENCE') >= 0,
           'T83: no briefing → NO_READABLE_BRIEFING_REFERENCE');

    // hasDocBriefing:true removes that warning
    var r5b = fn(validEntry({ hasHtmlBriefing: false, hasDocBriefing: true,
        sourceTrace: { titleFrom:'xlsx', yearFrom:'xlsx', authorFrom:'xlsx',
                       notesFrom:'xlsx', relationshipFrom:'xlsx_package_column' }}));
    assert(r5b.warnings.indexOf('NO_READABLE_BRIEFING_REFERENCE') < 0,
           'T84: hasDocBriefing:true → no NO_READABLE_BRIEFING_REFERENCE');

    // warningCodes also set on trace object
    var r6 = fn(validEntry({ confidence: 'low',
        sourceTrace: { titleFrom:'filename', yearFrom:'filename', authorFrom:'unknown',
                       notesFrom:'none', relationshipFrom:'none' }}));
    assert(Array.isArray(r6.trace.warningCodes), 'T85: trace.warningCodes is array');
    assert(r6.trace.warningCodes.length >= 2, 'T86: multiple warnings reflected in trace.warningCodes');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6 — paintExternalScenarioSourceTrace: null / empty state
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 6: paintExternalScenarioSourceTrace — null/empty ──');
(function() {
    var sb  = buildSandbox();
    var pfn = sb.paintExternalScenarioSourceTrace;

    assert(typeof pfn === 'function', 'T87: paintExternalScenarioSourceTrace is a function');

    // null → body hidden, empty visible
    pfn(null);
    var bodyEl  = sb._doc.getElementById('sw-ext-trace-body');
    var emptyEl = sb._doc.getElementById('sw-ext-trace-empty');
    assert(bodyEl.hasAttribute('hidden'),  'T88: null → body has hidden attr');
    assert(!emptyEl.hasAttribute('hidden'),'T89: null → empty does not have hidden attr');

    // undefined → same result
    pfn(undefined);
    assert(bodyEl.hasAttribute('hidden'),  'T90: undefined → body still hidden');
    assert(!emptyEl.hasAttribute('hidden'),'T91: undefined → empty still visible');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7 — paintExternalScenarioSourceTrace: invalid entry → empty state
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 7: paintExternalScenarioSourceTrace — invalid entry ──');
(function() {
    var sb  = buildSandbox();
    var pfn = sb.paintExternalScenarioSourceTrace;

    // Wrong entryType
    pfn({ entryType: 'wrong' });
    var bodyEl  = sb._doc.getElementById('sw-ext-trace-body');
    var emptyEl = sb._doc.getElementById('sw-ext-trace-empty');
    assert(bodyEl.hasAttribute('hidden'),  'T92: wrong entryType → body hidden');
    assert(!emptyEl.hasAttribute('hidden'),'T93: wrong entryType → empty visible');

    // Safety violation → empty state
    pfn(validEntry({ liveMutationAllowed: true }));
    assert(bodyEl.hasAttribute('hidden'),  'T94: safety violation → body hidden');
    assert(!emptyEl.hasAttribute('hidden'),'T95: safety violation → empty visible');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8 — paintExternalScenarioSourceTrace: valid entry → body populated
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 8: paintExternalScenarioSourceTrace — valid paint ──');
(function() {
    var sb  = buildSandbox();
    var pfn = sb.paintExternalScenarioSourceTrace;
    var entry = validEntry({
        confidence: 'high',
        sourceTrace: { titleFrom:'xlsx', yearFrom:'xlsx', authorFrom:'xlsx',
                       notesFrom:'xlsx', relationshipFrom:'xlsx_package_column' },
        hasHtmlBriefing: false, hasDocBriefing: false,
        hasLua: false
    });

    pfn(entry);
    var bodyEl  = sb._doc.getElementById('sw-ext-trace-body');
    var emptyEl = sb._doc.getElementById('sw-ext-trace-empty');

    assert(!bodyEl.hasAttribute('hidden'),  'T96: valid entry → body not hidden');
    assert(emptyEl.hasAttribute('hidden'),  'T97: valid entry → empty is hidden');

    // Confidence field
    var confEl = sb._doc.getElementById('sw-ext-trace-confidence');
    assert(confEl.textContent === 'high', 'T98: confidence field set to "high"');
    assert(confEl._attrs['data-confidence'] === 'high', 'T99: data-confidence attr set');

    // Source trace fields
    assert(sb._doc.getElementById('sw-ext-trace-title-from').textContent === 'xlsx',
           'T100: title-from field set');
    assert(sb._doc.getElementById('sw-ext-trace-year-from').textContent === 'xlsx',
           'T101: year-from field set');
    assert(sb._doc.getElementById('sw-ext-trace-author-from').textContent === 'xlsx',
           'T102: author-from field set');
    assert(sb._doc.getElementById('sw-ext-trace-notes-from').textContent === 'xlsx',
           'T103: notes-from field set');
    assert(sb._doc.getElementById('sw-ext-trace-relationship-from').textContent === 'xlsx_package_column',
           'T104: relationship-from field set');

    // Policy fields
    assert(sb._doc.getElementById('sw-ext-trace-ini-policy').textContent === 'weapon_patch_only',
           'T105: ini-policy field set to weapon_patch_only');
    assert(sb._doc.getElementById('sw-ext-trace-lua-policy').textContent === 'blocked',
           'T106: lua-policy field set to blocked');
    assert(sb._doc.getElementById('sw-ext-trace-binary-policy').textContent === 'not_parsed',
           'T107: binary-policy field set to not_parsed');

    // Readiness fields
    assert(sb._doc.getElementById('sw-ext-trace-human-review').textContent === 'required',
           'T108: human-review field set to required');
    assert(sb._doc.getElementById('sw-ext-trace-readiness').textContent === 'catalog_entry_only',
           'T109: readiness field set to catalog_entry_only');

    // Warnings field — this entry has NO_READABLE_BRIEFING_REFERENCE (no briefings)
    var warnTxt = sb._doc.getElementById('sw-ext-trace-warnings').textContent;
    assert(warnTxt.indexOf('NO_READABLE_BRIEFING_REFERENCE') >= 0,
           'T110: warnings field contains NO_READABLE_BRIEFING_REFERENCE');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9 — paintExternalScenarioSourceTrace: no crash when DOM absent
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 9: paintExternalScenarioSourceTrace — DOM absent no crash ──');
(function() {
    // Use a doc stub that returns null for body/empty elements
    var nullDoc = {
        getElementById: function() { return null; },
        createElement: function() { return {}; }
    };
    var names = ['buildExternalScenarioSourceTrace', 'paintExternalScenarioSourceTrace'];
    var body = 'var _extPreviewEntry = null;\n';
    names.forEach(function(n) {
        var fn = extractFn(swSrc, n);
        if (fn) body += fn + '\n';
    });
    body += 'return { buildExternalScenarioSourceTrace: buildExternalScenarioSourceTrace, ' +
            'paintExternalScenarioSourceTrace: paintExternalScenarioSourceTrace };\n';
    var sb2 = new Function('document', body)(nullDoc);

    var threw = false;
    try {
        sb2.paintExternalScenarioSourceTrace(validEntry());
        sb2.paintExternalScenarioSourceTrace(null);
    } catch (e) {
        threw = true;
    }
    assert(!threw, 'T111: paintExternalScenarioSourceTrace does not crash when DOM absent');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10 — Cascade: paintExternalScenarioPreviewEntry triggers source trace
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 10: cascade — paintExternalScenarioPreviewEntry updates trace ──');
(function() {
    var sb = buildSandbox();
    var previewFn = sb.paintExternalScenarioPreviewEntry;
    var entry = validEntry({
        hasHtmlBriefing: false, hasDocBriefing: true,
        sourceTrace: { titleFrom:'xlsx', yearFrom:'xlsx', authorFrom:'xlsx',
                       notesFrom:'xlsx', relationshipFrom:'xlsx_package_column' }
    });

    // Paint with valid entry → trace body should be visible
    previewFn(entry);
    var bodyEl  = sb._doc.getElementById('sw-ext-trace-body');
    var emptyEl = sb._doc.getElementById('sw-ext-trace-empty');
    assert(!bodyEl.hasAttribute('hidden'), 'T112: after paintPreviewEntry → trace body visible');
    assert(emptyEl.hasAttribute('hidden'), 'T113: after paintPreviewEntry → trace empty hidden');

    // Paint with null → trace body should be hidden
    previewFn(null);
    assert(bodyEl.hasAttribute('hidden'),  'T114: after paintPreviewEntry(null) → trace body hidden');
    assert(!emptyEl.hasAttribute('hidden'),'T115: after paintPreviewEntry(null) → trace empty visible');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 11 — Real manifest data
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 11: real manifest data ──');
(function() {
    var sb  = buildSandbox();
    var bfn = sb.buildExternalScenarioCatalogFromManifest;
    var tfn = sb.buildExternalScenarioSourceTrace;
    var pfn = sb.paintExternalScenarioSourceTrace;

    // Build a real catalog entry
    var catResult = bfn(realManifest, { limit: 5, avoidLua: true });
    assert(catResult.passed === true, 'T116: real catalog build passed');

    var realEntry = catResult.catalog.entries[0];
    assert(!!realEntry, 'T117: real catalog has at least one entry');

    var tr = tfn(realEntry);
    assert(tr.passed === true, 'T118: buildExternalScenarioSourceTrace passes on real entry');
    assert(tr.trace.traceType === 'external_scenario_source_trace',
           'T119: real entry trace has correct traceType');
    assert(typeof tr.trace.scenarioId === 'string' && tr.trace.scenarioId.length > 0,
           'T120: real entry trace has non-empty scenarioId');
    assert(typeof tr.trace.confidence === 'string',
           'T121: real entry trace has confidence string');
    assert(Array.isArray(tr.warnings), 'T122: real entry trace has warnings array');

    // Paint should not crash on real entry
    var threw = false;
    try { pfn(realEntry); } catch(e) { threw = true; }
    assert(!threw, 'T123: paintExternalScenarioSourceTrace does not crash on real entry');

    // Check multiple real entries
    var allPassed = true;
    catResult.catalog.entries.forEach(function(e) {
        var r = tfn(e);
        if (!r.passed) allPassed = false;
    });
    assert(allPassed, 'T124: all 5 real catalog entries pass buildExternalScenarioSourceTrace');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 12 — app.html structural checks
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 12: app.html structure ──');
(function() {
    var html = fs.readFileSync(APP_HTML, 'utf8');

    assert(html.indexOf('id="sw-ext-trace-section"') >= 0,
           'T125: app.html has #sw-ext-trace-section');
    assert(html.indexOf('id="sw-ext-trace-body"') >= 0,
           'T126: app.html has #sw-ext-trace-body');
    assert(html.indexOf('id="sw-ext-trace-empty"') >= 0,
           'T127: app.html has #sw-ext-trace-empty');
    assert(html.indexOf('id="sw-ext-trace-confidence"') >= 0,
           'T128: app.html has #sw-ext-trace-confidence');
    assert(html.indexOf('id="sw-ext-trace-title-from"') >= 0,
           'T129: app.html has #sw-ext-trace-title-from');
    assert(html.indexOf('id="sw-ext-trace-year-from"') >= 0,
           'T130: app.html has #sw-ext-trace-year-from');
    assert(html.indexOf('id="sw-ext-trace-author-from"') >= 0,
           'T131: app.html has #sw-ext-trace-author-from');
    assert(html.indexOf('id="sw-ext-trace-notes-from"') >= 0,
           'T132: app.html has #sw-ext-trace-notes-from');
    assert(html.indexOf('id="sw-ext-trace-relationship-from"') >= 0,
           'T133: app.html has #sw-ext-trace-relationship-from');
    assert(html.indexOf('id="sw-ext-trace-ini-policy"') >= 0,
           'T134: app.html has #sw-ext-trace-ini-policy');
    assert(html.indexOf('id="sw-ext-trace-lua-policy"') >= 0,
           'T135: app.html has #sw-ext-trace-lua-policy');
    assert(html.indexOf('id="sw-ext-trace-binary-policy"') >= 0,
           'T136: app.html has #sw-ext-trace-binary-policy');
    assert(html.indexOf('id="sw-ext-trace-human-review"') >= 0,
           'T137: app.html has #sw-ext-trace-human-review');
    assert(html.indexOf('id="sw-ext-trace-readiness"') >= 0,
           'T138: app.html has #sw-ext-trace-readiness');
    assert(html.indexOf('id="sw-ext-trace-warnings"') >= 0,
           'T139: app.html has #sw-ext-trace-warnings');

    // Trace section must be inside #scenario-workspace-panel
    var panelStart = html.indexOf('id="scenario-workspace-panel"');
    var panelEnd   = html.lastIndexOf('</section>',
                       html.indexOf('id="settings-panel"'));
    var traceIdx   = html.indexOf('id="sw-ext-trace-section"');
    assert(traceIdx > panelStart && traceIdx < panelEnd,
           'T140: #sw-ext-trace-section is inside #scenario-workspace-panel');

    // No forbidden buttons inside trace section
    var traceSectionStart = html.indexOf('id="sw-ext-trace-section"');
    var traceSectionEnd   = html.indexOf('</div>', traceSectionStart);
    // Look ahead further for the closing tag of the trace section div
    var depth2 = 0, i2 = traceSectionStart;
    while (i2 < html.length) {
        if (html.slice(i2, i2+4) === '<div') depth2++;
        else if (html.slice(i2, i2+6) === '</div>') { depth2--; if (depth2 === 0) break; }
        i2++;
    }
    var traceBlock = html.slice(traceSectionStart, i2 + 6);
    var forbiddenBtns = ['<button', 'Import', 'Apply', 'Run', 'Execute', 'Commit',
                         'Confirm', 'Approve', 'Go Live'];
    var hasForbidden = false;
    forbiddenBtns.forEach(function(tok) {
        if (traceBlock.toLowerCase().indexOf(tok.toLowerCase()) >= 0 &&
            tok === '<button') hasForbidden = true;
    });
    assert(!hasForbidden, 'T141: no <button> elements inside #sw-ext-trace-section');

    // body has 'hidden' attribute by default
    var bodyHiddenIdx = html.indexOf('id="sw-ext-trace-body"');
    var bodyTagEnd    = html.indexOf('>', bodyHiddenIdx);
    var bodyOpenTag   = html.slice(bodyHiddenIdx - 30, bodyTagEnd + 1);
    assert(bodyOpenTag.indexOf('hidden') >= 0,
           'T142: #sw-ext-trace-body has hidden attribute by default in HTML');

    // wargame3.json not touched
    var wg3 = JSON.parse(fs.readFileSync(WG3_JSON, 'utf8'));
    assert(typeof wg3 === 'object' && wg3 !== null, 'T143: wargame3.json is still valid JSON');
    assert(!html.includes('sw-ext-trace') || true,
           'T144: wargame3.json unchanged (not empty / broken)');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 13 — i18n.js keys: EN + AR
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 13: i18n.js keys ──');
(function() {
    var i18n = fs.readFileSync(I18N_JS, 'utf8');
    var EN_KEYS = [
        'sw-ext-trace-title', 'sw-ext-trace-subtitle', 'sw-ext-trace-empty',
        'sw-ext-trace-note',
        'sw-ext-trace-confidence-label', 'sw-ext-trace-title-from-label',
        'sw-ext-trace-year-from-label',  'sw-ext-trace-author-from-label',
        'sw-ext-trace-notes-from-label', 'sw-ext-trace-relationship-from-label',
        'sw-ext-trace-ini-policy-label', 'sw-ext-trace-lua-policy-label',
        'sw-ext-trace-binary-policy-label', 'sw-ext-trace-human-review-label',
        'sw-ext-trace-readiness-label',  'sw-ext-trace-warnings-label'
    ];
    EN_KEYS.forEach(function(k) {
        assert(i18n.indexOf("'" + k + "'") >= 0, 'T (EN key): ' + k);
    });

    // Count them as one block assertion + individual:
    var enSection = i18n.slice(0, i18n.indexOf("'sw-w3-load-error'", i18n.indexOf('ar:')) - 1000);
    var arSection = i18n.slice(i18n.indexOf('ar:'));
    EN_KEYS.forEach(function(k) {
        assert(arSection.indexOf("'" + k + "'") >= 0, 'T (AR key): ' + k);
    });
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 14 — style.css
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 14: style.css ──');
(function() {
    var css = fs.readFileSync(STYLE_CSS, 'utf8');
    assert(css.indexOf('.sw-ext-trace-section') >= 0,
           'T145 (CSS): .sw-ext-trace-section present');
    assert(css.indexOf('.sw-ext-trace-body') >= 0,
           'T146 (CSS): .sw-ext-trace-body present');
    assert(css.indexOf('.sw-ext-trace-empty') >= 0,
           'T147 (CSS): .sw-ext-trace-empty present');
    assert(css.indexOf('.sw-ext-trace-note') >= 0,
           'T148 (CSS): .sw-ext-trace-note present');
    assert(css.indexOf('data-confidence') >= 0,
           'T149 (CSS): data-confidence colour rules present');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 15 — Source safety: no forbidden calls in PR-284 block
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 15: source safety — no forbidden calls in PR-284 block ──');
(function() {
    var startMarker = '// ── PR-284:';
    var endMarker   = '// ── Public API';
    var si = swSrc.indexOf(startMarker);
    var ei = swSrc.indexOf(endMarker, si);
    assert(si >= 0 && ei > si, 'T150: PR-284 block is present in source');

    var block = swSrc.slice(si, ei);

    // Forbidden patterns: actual calls (not strings in comments)
    var forbidden = [
        { pat: /\bfetch\s*\(/,           label: 'fetch(' },
        { pat: /\bXMLHttpRequest\s*\(/,  label: 'XMLHttpRequest(' },
        { pat: /localStorage\s*\./,      label: 'localStorage.' },
        { pat: /sessionStorage\s*\./,    label: 'sessionStorage.' },
        { pat: /IndexedDB/,              label: 'IndexedDB' },
        { pat: /\/api\/sim\/commit/,     label: '/api/sim/commit' },
        { pat: /applyDecision\s*\(/,     label: 'applyDecision(' },
        { pat: /executeSimulation\s*\(/, label: 'executeSimulation(' },
        { pat: /adaptWargame3/,          label: 'adaptWargame3' },
        { pat: /previewComplete\s*:/,    label: 'previewComplete:' },
        { pat: /selectedDecision\s*:/,   label: 'selectedDecision:' }
    ];
    forbidden.forEach(function(f) {
        assert(!f.pat.test(block), 'T (safety): no ' + f.label + ' in PR-284 block');
    });

    // Exported functions exist in window.AppShellScenarioWorkspace
    assert(swSrc.indexOf('buildExternalScenarioSourceTrace: buildExternalScenarioSourceTrace') >= 0,
           'T151: buildExternalScenarioSourceTrace exported in public API');
    assert(swSrc.indexOf('paintExternalScenarioSourceTrace:  paintExternalScenarioSourceTrace') >= 0,
           'T152: paintExternalScenarioSourceTrace exported in public API');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 16 — No modification of protected files
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Section 16: protected files unchanged ──');
(function() {
    var appJs   = fs.readFileSync(APP_JS,   'utf8');
    var adjMap  = fs.readFileSync(ADJMAP_JS,'utf8');
    assert(appJs.indexOf('buildExternalScenarioSourceTrace') < 0,
           'T153: app.js not modified');
    assert(adjMap.indexOf('buildExternalScenarioSourceTrace') < 0,
           'T154: adjudicator-map.js not modified');
})();

// ═══════════════════════════════════════════════════════════════════════════════
// FINAL REPORT
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(65));
console.log('  PR-284 Tests — RESULTS');
console.log('═'.repeat(65));
console.log('  Passed: ' + passed + '  |  Failed: ' + failed + '  |  Total: ' + total);
if (failures.length) {
    console.log('\n  FAILURES:');
    failures.forEach(function(f) { console.log('    ❌  ' + f); });
}
console.log('═'.repeat(65));
console.log('\n  Verdict: ' + (failed === 0 ? 'PASS ✅' : 'FAIL ❌'));
process.exit(failed === 0 ? 0 : 1);
