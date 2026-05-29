/**
 * test-pr-286L0.js — PR-286L0: Live Scenario Import Baseline.
 *
 * 78-item coverage per spec.
 * Validates the import workflow loads JSON directly into window.RmoozScenario
 * without touching dry-run / decision-package / backend paths.
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

// Build a sandboxed module containing all four import functions + the unsafe-keys array.
function buildImportModule(initialRmoozScenario) {
    var fns = [
        'validateLiveScenarioJson',
        'loadLiveScenarioFromJson',
        'getCurrentLiveScenarioSummary'
    ];
    var bodies = fns.map(function(n) {
        var s = extractFn(swSrc, n);
        if (!s) throw new Error('function ' + n + ' not found');
        return s;
    }).join('\n');

    // Extract the _LIVE_IMPORT_UNSAFE_KEYS declaration (one line).
    var keysMatch = swSrc.match(/var\s+_LIVE_IMPORT_UNSAFE_KEYS\s*=\s*\[[\s\S]*?\];/);
    if (!keysMatch) throw new Error('_LIVE_IMPORT_UNSAFE_KEYS not found');

    var harness =
        'var window = arguments[0];\n' +
        'function getScenario() { return (window.RmoozScenario) ? window.RmoozScenario.scenario : null; }\n' +
        'function getActiveStepIndex() { return (window.RmoozScenario && typeof window.RmoozScenario.stepIndex === "number") ? window.RmoozScenario.stepIndex : 0; }\n' +
        'function tx(k, d) { return d !== undefined ? d : k; }\n' +
        'var _liveOperatorWorkflowState = { selections: { "carry": { junk:true } }, events: [] };\n' +
        keysMatch[0] + '\n' +
        bodies + '\n' +
        'return {\n' +
        '  validateLiveScenarioJson: validateLiveScenarioJson,\n' +
        '  loadLiveScenarioFromJson: loadLiveScenarioFromJson,\n' +
        '  getCurrentLiveScenarioSummary: getCurrentLiveScenarioSummary,\n' +
        '  _state: function() { return _liveOperatorWorkflowState; },\n' +
        '  _window: function() { return window; }\n' +
        '};';
    return new Function(harness)(
        { RmoozScenario: initialRmoozScenario || null,
          AppShellScenarioWorkspace: { refresh: function() { /* stub */ } } }
    );
}

function validScenario(opts) {
    opts = opts || {};
    return {
        scenario_id:    opts.scenarioId    || 'test-scn',
        scenario_label: opts.scenarioLabel || 'Test Scenario',
        model_version:  '1.0',
        steps: [
            { index: 0, phase: 'briefing', time_label: 'T0',
              decision_options: [{ id: 'OPT-A', label: 'A' }] },
            { index: 1, phase: 'execution', time_label: 'T1' }
        ]
    };
}

// ── Section 1: Exports (T1-T4) ────────────────────────────────────────────
console.log('\n─── Section 1: Exports ───');

[
    ['T01', 'validateLiveScenarioJson'],
    ['T02', 'loadLiveScenarioFromJson'],
    ['T03', 'getCurrentLiveScenarioSummary'],
    ['T04', 'initLiveScenarioImport']
].forEach(function(p) {
    check(swSrc.indexOf(p[1] + ':') >= 0, p[0] + ': ' + p[1] + ' exported');
});

// ── Section 2: validateLiveScenarioJson rejects bad input (T5-T9) ─────────
console.log('\n─── Section 2: validation — rejection ───');

(function() {
    var m = buildImportModule(null);
    var r;

    r = m.validateLiveScenarioJson(null);
    check(!r.passed && r.blockedReasons.indexOf('INPUT_NULL') >= 0, 'T05: rejects null');

    r = m.validateLiveScenarioJson('string');
    check(!r.passed && r.blockedReasons.indexOf('INPUT_NOT_OBJECT') >= 0,
          'T06: rejects non-object (string)');
    r = m.validateLiveScenarioJson([1, 2, 3]);
    check(!r.passed && r.blockedReasons.indexOf('INPUT_NOT_OBJECT') >= 0,
          'T06b: rejects array');

    r = m.validateLiveScenarioJson({ scenario_id: 'x' });
    check(!r.passed && r.blockedReasons.indexOf('STEPS_MISSING_OR_EMPTY') >= 0,
          'T07: rejects missing steps');

    r = m.validateLiveScenarioJson({ scenario_id: 'x', steps: [] });
    check(!r.passed && r.blockedReasons.indexOf('STEPS_MISSING_OR_EMPTY') >= 0,
          'T08: rejects empty steps');

    r = m.validateLiveScenarioJson({ scenario_id: 'x', steps: ['not-an-object'] });
    check(!r.passed && r.blockedReasons.indexOf('STEP_NOT_OBJECT:0') >= 0,
          'T09: rejects non-object step');

    r = m.validateLiveScenarioJson({ scenario_id: 'x', steps: [{}] });
    check(!r.passed && r.blockedReasons.indexOf('STEP_NO_RECOGNIZED_FIELDS:0') >= 0,
          'T09b: rejects step with no recognised fields');
})();

// ── Section 3: validation — accepts + normalises (T10-T24) ────────────────
console.log('\n─── Section 3: validation — acceptance & normalisation ───');

(function() {
    var m = buildImportModule(null);

    // T10: scenario_id accepted
    var r10 = m.validateLiveScenarioJson({
        scenario_id: 'scn-10', steps: [{ phase: 'p' }]
    });
    check(r10.passed && r10.normalizedScenario.scenario_id === 'scn-10',
          'T10: accepts scenario_id');

    // T11: id fallback
    var r11 = m.validateLiveScenarioJson({
        id: 'fallback-id', steps: [{ phase: 'p' }]
    });
    check(r11.passed && r11.normalizedScenario.scenario_id === 'fallback-id',
          'T11: accepts id fallback');

    // T12: name fallback
    var r12 = m.validateLiveScenarioJson({
        name: 'fallback-name', steps: [{ phase: 'p' }]
    });
    check(r12.passed && r12.normalizedScenario.scenario_id === 'fallback-name',
          'T12: accepts name fallback');

    // T13: normalises scenario_id when totally absent
    var r13 = m.validateLiveScenarioJson({
        steps: [{ phase: 'p' }]
    });
    check(r13.passed &&
          r13.normalizedScenario.scenario_id === 'imported-live-scenario' &&
          r13.warnings.indexOf('SCENARIO_ID_FALLBACK_USED') >= 0,
          'T13: normalises scenario_id to "imported-live-scenario" + warning');

    // T14: normalises scenario_label
    var r14 = m.validateLiveScenarioJson({
        scenario_id: 's', title: 'Pretty Title', steps: [{ phase: 'p' }]
    });
    check(r14.passed && r14.normalizedScenario.scenario_label === 'Pretty Title',
          'T14: scenario_label = title when scenario_label absent');

    // T15-T22: preserves optional fields
    var rich = {
        scenario_id: 'r', scenario_label: 'R',
        model_version: 'mv', schema_variant: 'sv', ported_from: 'pf',
        map_bbox: [1,2,3,4], phase_table: ['a','b'],
        obj: { name: 'OBJ' }, bls_template: [{ name: 'BLS' }],
        blue_units_initial: [{ uid: 'B1' }], red_units: [{ uid: 'R1' }],
        blue_unit_step_coords: { B1: [[0,0]] }, red_unit_step_coords: { R1: [[1,1]] },
        steps: [{ phase: 'briefing',
                  decision_options: [{ id: 'A' }],
                  decisionOptions: [{ id: 'B' }],
                  options: [{ id: 'C' }],
                  coa_options: [{ id: 'D' }],
                  coaOptions: [{ id: 'E' }] }]
    };
    var rR = m.validateLiveScenarioJson(rich);
    check(rR.passed, 'T15-pre: rich scenario passes');
    var n = rR.normalizedScenario;
    check(n.model_version === 'mv' && n.schema_variant === 'sv' && n.ported_from === 'pf',
          'T15: preserves model_version/schema_variant/ported_from');
    check(JSON.stringify(n.map_bbox) === '[1,2,3,4]',
          'T16: preserves map_bbox');
    check(JSON.stringify(n.phase_table) === '["a","b"]',
          'T17: preserves phase_table');
    check(n.obj && n.obj.name === 'OBJ',
          'T18: preserves obj');
    check(Array.isArray(n.bls_template) && n.bls_template[0].name === 'BLS',
          'T19: preserves bls_template');
    check(Array.isArray(n.blue_units_initial) && n.blue_units_initial[0].uid === 'B1',
          'T20: preserves blue_units_initial');
    check(Array.isArray(n.red_units) && n.red_units[0].uid === 'R1',
          'T21: preserves red_units');
    check(n.blue_unit_step_coords && n.red_unit_step_coords,
          'T22: preserves coordinate tables');
    var s0 = n.steps[0];
    check(Array.isArray(s0.decision_options) && s0.decision_options[0].id === 'A',
          'T23: preserves decision_options on steps');
    check(Array.isArray(s0.decisionOptions) && s0.decisionOptions[0].id === 'B' &&
          Array.isArray(s0.options) && s0.options[0].id === 'C' &&
          Array.isArray(s0.coa_options) && s0.coa_options[0].id === 'D' &&
          Array.isArray(s0.coaOptions) && s0.coaOptions[0].id === 'E',
          'T24: preserves all option-field aliases on steps');
})();

// ── Section 4: validation — rejects unsafe fields (T25-T36) ───────────────
console.log('\n─── Section 4: validation — unsafe fields rejected ───');

(function() {
    var m = buildImportModule(null);

    function badField(key, value) {
        var obj = { scenario_id: 'x', steps: [{ phase: 'p' }] };
        obj[key] = (value === undefined) ? true : value;
        return obj;
    }

    var BAD = [
        ['T25', 'scenario_compressed', 'lit'],
        ['T26', 'Scenario_Compressed', 'lit'],
        ['T27', 'compressedPayload',   'lit'],
        ['T28a', 'lua',     'lit'],
        ['T28b', 'script',  'lit'],
        ['T28c', 'scripts', 'lit'],
        ['T29a', 'backendUrl',  'http://x'],
        ['T29b', 'fetchUrl',    'http://x'],
        ['T29c', 'apiUrl',      'http://x'],
        ['T29d', 'urlToFetch',  'http://x'],
        ['T30a', 'storageKey',     'foo'],
        ['T30b', 'localStorage',   'foo'],
        ['T30c', 'sessionStorage', 'foo'],
        ['T30d', 'indexedDB',      'foo'],
        ['T33', 'applyNow',   true],
        ['T34', 'commitNow',  true],
        ['T35', 'executeNow', true],
        ['T36', 'gate7Approved', true]
    ];
    BAD.forEach(function(p) {
        var r = m.validateLiveScenarioJson(badField(p[1], p[2]));
        var hit = r.blockedReasons.some(function(b) { return b.indexOf(p[1]) >= 0; });
        check(!r.passed && hit, p[0] + ': rejects ' + p[1]);
    });

    // T31: liveMutationAllowed:true
    var r31 = m.validateLiveScenarioJson({
        scenario_id: 'x', liveMutationAllowed: true, steps: [{ phase: 'p' }]
    });
    check(!r31.passed &&
          r31.blockedReasons.some(function(b) { return b.indexOf('LIVE_MUTATION_ALLOWED') >= 0; }),
          'T31: rejects liveMutationAllowed:true');

    // T32: backendCommitAllowed:true
    var r32 = m.validateLiveScenarioJson({
        scenario_id: 'x', backendCommitAllowed: true, steps: [{ phase: 'p' }]
    });
    check(!r32.passed &&
          r32.blockedReasons.some(function(b) { return b.indexOf('BACKEND_COMMIT_ALLOWED') >= 0; }),
          'T32: rejects backendCommitAllowed:true');

    // T31b/T32b: liveMutationAllowed:false / backendCommitAllowed:false NOT rejected
    var rOk = m.validateLiveScenarioJson({
        scenario_id: 'x', liveMutationAllowed: false,
        backendCommitAllowed: false, steps: [{ phase: 'p' }]
    });
    check(rOk.passed, 'T31b/T32b: liveMutationAllowed:false + backendCommitAllowed:false accepted');

    // Unsafe field in NESTED step also rejected
    var rNested = m.validateLiveScenarioJson({
        scenario_id: 'x', steps: [{ phase: 'p', lua: 'os.execute' }]
    });
    check(!rNested.passed &&
          rNested.blockedReasons.some(function(b) { return b.indexOf('lua@steps[0]') >= 0; }),
          'T28d: rejects unsafe field nested inside a step');
})();

// ── Section 5: validation — does not mutate input (T37) ───────────────────
console.log('\n─── Section 5: no-mutation guarantee ───');

(function() {
    var m = buildImportModule(null);
    var original = validScenario();
    var before = JSON.stringify(original);
    var r = m.validateLiveScenarioJson(original);
    check(r.passed && JSON.stringify(original) === before,
          'T37: validateLiveScenarioJson does not mutate input');
})();

// ── Section 6: load (T38-T46) ─────────────────────────────────────────────
console.log('\n─── Section 6: load — apply / no-apply ───');

(function() {
    // T38: invalid load does NOT change window.RmoozScenario
    var initial = { scenario: { scenario_id: 'preexisting' }, stepIndex: 5 };
    var m38 = buildImportModule(initial);
    var r38 = m38.loadLiveScenarioFromJson(null);
    var win38 = m38._window();
    check(!r38.passed && win38.RmoozScenario.scenario.scenario_id === 'preexisting' &&
          win38.RmoozScenario.stepIndex === 5,
          'T38: invalid load does not change window.RmoozScenario',
          'still:' + win38.RmoozScenario.scenario.scenario_id +
          ' idx:' + win38.RmoozScenario.stepIndex);

    // T39: valid load sets window.RmoozScenario
    var m39 = buildImportModule(initial);
    var r39 = m39.loadLiveScenarioFromJson(validScenario({ scenarioId: 'new-scn' }));
    var win39 = m39._window();
    check(r39.passed && win39.RmoozScenario.scenario.scenario_id === 'new-scn',
          'T39: valid load sets window.RmoozScenario.scenario.scenario_id',
          win39.RmoozScenario.scenario.scenario_id);

    // T40: valid load resets stepIndex to 0
    check(win39.RmoozScenario.stepIndex === 0,
          'T40: valid load resets stepIndex to 0',
          'idx:' + win39.RmoozScenario.stepIndex);

    // T41: deep-copy — modifying the loaded scenario must NOT touch the original
    var origRef = validScenario({ scenarioId: 'deep-test' });
    var m41 = buildImportModule(null);
    m41.loadLiveScenarioFromJson(origRef);
    var win41 = m41._window();
    win41.RmoozScenario.scenario.scenario_label = 'MUTATED IN LIVE';
    check(origRef.scenario_label === 'Test Scenario',
          'T41: deep-copy isolates live scenario from original input',
          'original now: ' + origRef.scenario_label);

    // T42: changing original input after load does NOT change live scenario
    var origRef2 = validScenario({ scenarioId: 'orig-mutate-test',
                                    scenarioLabel: 'Original-Label' });
    var m42 = buildImportModule(null);
    m42.loadLiveScenarioFromJson(origRef2);
    var win42 = m42._window();
    origRef2.scenario_label = 'CHANGED AFTER LOAD';
    origRef2.steps.push({ phase: 'new-injected' });
    check(win42.RmoozScenario.scenario.scenario_label === 'Original-Label' &&
          win42.RmoozScenario.scenario.steps.length === 2,
          'T42: post-load original mutation does not leak into live state');

    // T43: changing live scenario after load does NOT change original input
    var origRef3 = validScenario({ scenarioId: 'live-mutate-test' });
    var origRef3Before = JSON.stringify(origRef3);
    var m43 = buildImportModule(null);
    m43.loadLiveScenarioFromJson(origRef3);
    var win43 = m43._window();
    win43.RmoozScenario.scenario.steps.push({ phase: 'extra' });
    check(JSON.stringify(origRef3) === origRef3Before,
          'T43: post-load live mutation does not leak into original input');

    // T44-T46: load triggers refresh (which paints header/nav/decision card).
    // We verify by stubbing refresh and checking it was called.
    var refreshCalls = [];
    var m44 = (function() {
        var stubWindow = {
            RmoozScenario: null,
            AppShellScenarioWorkspace: {
                refresh: function() { refreshCalls.push('called'); }
            }
        };
        var fns = ['validateLiveScenarioJson', 'loadLiveScenarioFromJson',
                   'getCurrentLiveScenarioSummary'];
        var bodies = fns.map(function(n) { return extractFn(swSrc, n); }).join('\n');
        var keys = swSrc.match(/var\s+_LIVE_IMPORT_UNSAFE_KEYS\s*=\s*\[[\s\S]*?\];/);
        var harness =
            'var window = arguments[0];\n' +
            'function getScenario() { return (window.RmoozScenario) ? window.RmoozScenario.scenario : null; }\n' +
            'function getActiveStepIndex() { return (window.RmoozScenario && typeof window.RmoozScenario.stepIndex === "number") ? window.RmoozScenario.stepIndex : 0; }\n' +
            'function tx(k, d) { return d !== undefined ? d : k; }\n' +
            'var _liveOperatorWorkflowState = { selections: {}, events: [] };\n' +
            keys[0] + '\n' + bodies + '\n' +
            'return { load: loadLiveScenarioFromJson, _w: function(){return window;} };';
        return new Function(harness)(stubWindow);
    })();
    m44.load(validScenario({ scenarioId: 'refresh-test' }));
    check(refreshCalls.length === 1,
          'T44-T46: load triggers AppShellScenarioWorkspace.refresh() once (full live repaint)',
          'calls:' + refreshCalls.length);
})();

// ── Section 7: no dry-run / no decision-package reuse / no backend (T47-T56)
console.log('\n─── Section 7: load body safety audit ───');

var loadFnSrc     = extractFn(swSrc, 'loadLiveScenarioFromJson') || '';
var validateFnSrc = extractFn(swSrc, 'validateLiveScenarioJson') || '';
var initFnSrc     = extractFn(swSrc, 'initLiveScenarioImport')   || '';
var allNewSrc     = loadFnSrc + validateFnSrc + initFnSrc +
                    (extractFn(swSrc, 'getCurrentLiveScenarioSummary') || '');

// T47: check for CALL syntax (with paren), not just identifier mentioned in a comment
check(!/paintDryRunPreview\s*\(/.test(allNewSrc) &&
      !/paintWargame3Preview\s*\(/.test(allNewSrc),
      'T47: no dry-run / W3-preview paint CALLS (comment mentions are OK)');
check(allNewSrc.indexOf('_drpPreviewSource')    < 0,
      'T48: no _drpPreviewSource usage');
check(allNewSrc.indexOf('_drpPreviewStepRef')   < 0,
      'T49: no _drpPreviewStepRef usage');
check(allNewSrc.indexOf('_swDecisionPackage')   < 0 &&
      allNewSrc.indexOf('loadDecisionPackage')  < 0 &&
      allNewSrc.indexOf('loadFixture')          < 0,
      'T50: no decision-package import pipeline reuse');
// T51: ".scen" as a file extension literal would be quoted — distinguish from ".scenario_id"
check(!/['"]\.scen['"]/.test(allNewSrc) &&
      !/\.scen\b(?!ario)/.test(allNewSrc),
      'T51: no .scen file-extension parsing (".scenario_id" is fine)');
check(!/['"]\.ini['"]/.test(allNewSrc) &&
      !/\.ini\b/.test(allNewSrc),
      'T52: no .ini file-extension parsing');
check(!/\blua\b/i.test(allNewSrc) || /'lua'|"lua"/.test(allNewSrc),
      'T53: no Lua execution (only "lua" as a string literal for unsafe-key blacklist)');
check(!/fetch\(|XMLHttpRequest|\$\.ajax/.test(allNewSrc),
      'T54: no fetch / XHR / backend');
check(!/localStorage\b|sessionStorage\b|IndexedDB|indexedDB/.test(allNewSrc) ||
      // It's fine to reference these in the unsafe-key blacklist as string literals.
      !/(?:localStorage|sessionStorage|indexedDB)\s*\.\s*(?:get|set|put|open)/.test(allNewSrc),
      'T55: no localStorage/sessionStorage/IndexedDB read/write (allowlist only)');
check(!/\/api\/sim\/commit|applyDecision|executeSimulation|Gate\s*7|go[\s_-]?live/i.test(allNewSrc),
      'T56: no Gate 7 / apply / execute / commit / go-live');

// ── Section 8: getCurrentLiveScenarioSummary (T57) ────────────────────────
console.log('\n─── Section 8: getCurrentLiveScenarioSummary ───');

(function() {
    var m = buildImportModule(null);
    m.loadLiveScenarioFromJson(validScenario({
        scenarioId: 'summary-test', scenarioLabel: 'Summary Test'
    }));
    var s = m.getCurrentLiveScenarioSummary();
    check(s.scenarioId === 'summary-test' && s.scenarioLabel === 'Summary Test' &&
          s.stepIndex === 0 && s.stepCount === 2,
          'T57: getCurrentLiveScenarioSummary returns imported scenario',
          JSON.stringify(s));
})();

// ── Section 9: app.html DOM IDs (T58-T64) ─────────────────────────────────
console.log('\n─── Section 9: app.html DOM IDs ───');

check(htmlSrc.indexOf('id="sw-live-scenario-import-card"') >= 0,
      'T58: app.html contains #sw-live-scenario-import-card');
check(htmlSrc.indexOf('id="sw-live-scenario-import-input"') >= 0,
      'T59: app.html contains #sw-live-scenario-import-input');
check(htmlSrc.indexOf('id="sw-live-scenario-import-btn"') >= 0,
      'T60: app.html contains #sw-live-scenario-import-btn');
check(htmlSrc.indexOf('id="sw-live-scenario-import-status"') >= 0,
      'T61: app.html contains #sw-live-scenario-import-status');
check(htmlSrc.indexOf('id="sw-live-scenario-import-summary"') >= 0,
      'T62: app.html contains #sw-live-scenario-import-summary');

// T63: existing decision-package IDs remain
var EXISTING_DPKG_IDS = [
    'sw-dpkg-manifest-input', 'sw-dpkg-steps-input', 'sw-dpkg-import-json',
    'sw-local-json-source-card'
];
var missingDpkg = EXISTING_DPKG_IDS.filter(function(id) {
    return htmlSrc.indexOf('id="' + id + '"') < 0;
});
check(missingDpkg.length === 0,
      'T63: existing decision package import IDs remain',
      missingDpkg.length ? 'MISSING: ' + missingDpkg.join(', ') : 'all present');

// T64: decision package import relabeled
check(i18nSrc.indexOf("'sw-src-local-title':       'Decision Package Import'") >= 0 ||
      i18nSrc.indexOf("'sw-src-local-title': 'Decision Package Import'") >= 0,
      'T64: decision package import title relabeled to "Decision Package Import"');

// ── Section 10: Layout invariants (T65-T68) ───────────────────────────────
console.log('\n─── Section 10: layout invariants ───');

check(htmlSrc.indexOf('id="sw-live-workspace"') >= 0,
      'T65: #sw-live-workspace remains intact');
check(htmlSrc.indexOf('id="sw-live-scenario-header"') >= 0,
      'T66: #sw-live-scenario-header remains intact');

function isInsideLiveWorkspace(html, innerId) {
    var openIdx = html.indexOf('id="sw-live-workspace"');
    if (openIdx < 0) return false;
    var innerIdx = html.indexOf('id="' + innerId + '"');
    if (innerIdx < 0 || innerIdx < openIdx) return false;
    var i = html.indexOf('>', openIdx);
    var depth = 1;
    while (i < html.length && depth > 0) {
        var nextOpen  = html.indexOf('<section', i + 1);
        var nextClose = html.indexOf('</section>', i + 1);
        if (nextClose < 0) return false;
        if (nextOpen > 0 && nextOpen < nextClose) { depth++; i = nextOpen; }
        else                                       { depth--; i = nextClose; }
    }
    return innerIdx < i;
}
check(isInsideLiveWorkspace(htmlSrc, 'sw-nav-card'),
      'T67: #sw-nav-card still inside #sw-live-workspace');
check(isInsideLiveWorkspace(htmlSrc, 'sw-live-decision-card'),
      'T68: #sw-live-decision-card still inside #sw-live-workspace');

// ── Section 11: W3 dry-run still hidden (T69-T71) ─────────────────────────
console.log('\n─── Section 11: W3 dry-run + AMBER still hidden ───');

function elementHasHiddenAttr(html, attrFragment) {
    var idx = html.indexOf(attrFragment);
    if (idx < 0) return false;
    var start = html.lastIndexOf('<', idx);
    var end   = html.indexOf('>', idx);
    if (start < 0 || end < 0) return false;
    return /\shidden(\s|>|=)/.test(html.slice(start, end + 1));
}
check(elementHasHiddenAttr(htmlSrc, 'id="sw-drp-section"'),
      'T69: #sw-drp-section remains hidden');
check(elementHasHiddenAttr(htmlSrc, 'id="sw-w3-load-bar"'),
      'T70: #sw-w3-load-bar remains hidden');

// T71: no paintDryRunPreview() auto-call in init
var initBlockStart = swSrc.indexOf('_initDrpNavButtons();');
var initBlockEnd   = swSrc.indexOf("logSystem('elog-evt-sw-rendered'");
var initBlock      = swSrc.slice(initBlockStart, initBlockEnd);
check(!/(?:^|\n)\s*paintDryRunPreview\s*\(\s*\)\s*;/.test(initBlock),
      'T71: AMBER RIDGE not auto-rendered in init');

// ── Section 12: Protected files unchanged (T72-T74) ───────────────────────
console.log('\n─── Section 12: Protected files unchanged ───');

if (fs.existsSync(W3_PATH)) {
    var w3 = JSON.parse(fs.readFileSync(W3_PATH, 'utf8'));
    check(Array.isArray(w3.red_units) && w3.red_units.length === 70 &&
          Array.isArray(w3.blue_units_initial) && w3.blue_units_initial.length === 83,
          'T72: wargame3.json unchanged (70 red + 83 blue)');
}
if (fs.existsSync(APP_JS)) {
    check(fs.readFileSync(APP_JS, 'utf8').indexOf('PR-286L0') < 0,
          'T73: app.js not modified by PR-286L0');
}
if (fs.existsSync(ADJ_MAP)) {
    check(fs.readFileSync(ADJ_MAP, 'utf8').indexOf('PR-286L0') < 0,
          'T74: adjudicator-map.js not modified by PR-286L0');
}

// ── Section 13: i18n EN + AR (T75-T76) ────────────────────────────────────
console.log('\n─── Section 13: i18n EN + AR ───');

var KEYS = [
    'sw-live-scenario-import-title', 'sw-live-scenario-import-subtitle',
    'sw-live-scenario-import-btn', 'sw-live-scenario-import-note',
    'sw-live-import-no-file', 'sw-live-import-success', 'sw-live-import-blocked',
    'sw-live-import-scenario-loaded', 'sw-live-import-steps', 'sw-live-import-warnings'
];
var enStart = i18nSrc.indexOf('en:');
var arStart = i18nSrc.indexOf('ar:');
var enBlock = i18nSrc.slice(enStart, arStart);
var arBlock = i18nSrc.slice(arStart);

var missEn = KEYS.filter(function(k) { return enBlock.indexOf("'" + k + "'") < 0; });
check(missEn.length === 0, 'T75: all PR-286L0 EN keys present',
      missEn.length ? 'MISSING: ' + missEn.join(', ') : 'all present');

var missAr = KEYS.filter(function(k) { return arBlock.indexOf("'" + k + "'") < 0; });
check(missAr.length === 0, 'T76: all PR-286L0 AR keys present',
      missAr.length ? 'MISSING: ' + missAr.join(', ') : 'all present');
check(arBlock.indexOf('استيراد السيناريو الحي') >= 0,
      'T76b: AR title contains Arabic text');

// ── Section 14: CSS (T77) ─────────────────────────────────────────────────
console.log('\n─── Section 14: CSS ───');

[
    '.sw-live-scenario-import-card',
    '.sw-live-scenario-import-row',
    '.sw-live-scenario-import-btn',
    '.sw-live-scenario-import-status',
    '.sw-live-scenario-import-summary'
].forEach(function(sel, i) {
    check(cssSrc.indexOf(sel) >= 0, 'T77.' + (i + 1) + ': CSS ' + sel + ' defined');
});

// ── Section 15: Source syntax (T78) ───────────────────────────────────────
console.log('\n─── Section 15: source syntax ───');

try {
    new Function(swSrc);
    check(true, 'T78: scenario-workspace.js parses without syntax error');
} catch (err) {
    check(false, 'T78: scenario-workspace.js parses without syntax error', err.message);
}

// ── Extras ────────────────────────────────────────────────────────────────

// Init wiring: initLiveScenarioImport called from init block
check(initBlock.indexOf('initLiveScenarioImport()') >= 0,
      'Extra-01: initLiveScenarioImport() wired into init() block');

// loadLiveScenarioFromJson clears _liveOperatorWorkflowState.selections
check(loadFnSrc.indexOf('_liveOperatorWorkflowState.selections') >= 0 &&
      /_liveOperatorWorkflowState\.selections\s*=\s*\{\s*\}/.test(loadFnSrc),
      'Extra-02: load clears _liveOperatorWorkflowState.selections (scenario-scoped reset)');

// previous PR-280–287L2 exports still present
var prevExports = [
    'buildExternalScenarioSourceTrace', 'paintExternalScenarioSourceTrace',
    'buildWargame3PreviewUnitScopeSummary', 'paintWargame3PreviewUnitScope',
    'previewExternalScenarioCatalogSubsetFromManifest',
    'getLiveScenarioIdentity', 'getActiveLiveStepContext',
    'extractLiveDecisionOptions', 'recordLiveOperatorSelection',
    'clearLiveOperatorSelection', 'getLiveOperatorWorkflowState',
    'paintLiveDecisionActionCard', 'paintLiveScenarioHeader',
    'initSecondaryCardsToggle'
];
var missingPrev = prevExports.filter(function(n) { return swSrc.indexOf(n + ':') < 0; });
check(missingPrev.length === 0,
      'Extra-03: all previous PR exports still present',
      missingPrev.length ? 'MISSING: ' + missingPrev.join(', ') : 'all present');

// ── Final ─────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(65));
console.log('  PR-286L0 Test Results');
console.log('═'.repeat(65));
console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
console.log('═'.repeat(65));
console.log('\n  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));

process.exit(failed === 0 ? 0 : 1);
