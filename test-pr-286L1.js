/**
 * test-pr-286L1.js — PR-286L1: Scenario Folder Import Intake.
 *
 * 71-item coverage per spec.
 * Verifies folder scan classification + selected JSON import routed through
 * PR-286L0's loadLiveScenarioFromJson — no dry-run / no decision-package
 * pipeline reuse / no backend / no Lua execution / no .scen or .ini parsing.
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

// Build a sandboxed module that includes PR-286L0 + PR-286L1 helpers.
function buildModule(initialRmoozScenario) {
    var fns = [
        'validateLiveScenarioJson',
        'loadLiveScenarioFromJson',
        'getCurrentLiveScenarioSummary',
        'classifyScenarioFolderFile',
        'scanScenarioFolderFiles',
        'getLiveScenarioFolderScanState',
        '_resolveFolderCandidate',
        'importSelectedFolderScenarioJson'
    ];
    var bodies = fns.map(function(n) {
        var s = extractFn(swSrc, n);
        if (!s) throw new Error('function ' + n + ' not found');
        return s;
    }).join('\n');

    var keysMatch = swSrc.match(/var\s+_LIVE_IMPORT_UNSAFE_KEYS\s*=\s*\[[\s\S]*?\];/);
    var stateMatch = swSrc.match(/var\s+_liveScenarioFolderScanState\s*=\s*\{[\s\S]*?\};/);

    var harness =
        'var window = arguments[0];\n' +
        'function getScenario() { return (window.RmoozScenario) ? window.RmoozScenario.scenario : null; }\n' +
        'function getActiveStepIndex() { return (window.RmoozScenario && typeof window.RmoozScenario.stepIndex === "number") ? window.RmoozScenario.stepIndex : 0; }\n' +
        'function tx(k, d) { return d !== undefined ? d : k; }\n' +
        'var _liveOperatorWorkflowState = { selections: {}, events: [] };\n' +
        keysMatch[0] + '\n' +
        stateMatch[0] + '\n' +
        bodies + '\n' +
        'return {\n' +
        '  classify:  classifyScenarioFolderFile,\n' +
        '  scan:      scanScenarioFolderFiles,\n' +
        '  getState:  getLiveScenarioFolderScanState,\n' +
        '  importSel: importSelectedFolderScenarioJson,\n' +
        '  _state:    function() { return _liveScenarioFolderScanState; },\n' +
        '  _window:   function() { return window; },\n' +
        '  _setState: function(s) {\n' +
        '    _liveScenarioFolderScanState.files = s.files || [];\n' +
        '    _liveScenarioFolderScanState.candidates = s.candidates || [];\n' +
        '    _liveScenarioFolderScanState.selectedRelativePath = s.selectedRelativePath || null;\n' +
        '    _liveScenarioFolderScanState.summary = s.summary || null;\n' +
        '  }\n' +
        '};';
    return new Function(harness)(
        { RmoozScenario: initialRmoozScenario || null,
          AppShellScenarioWorkspace: { refresh: function() {} } }
    );
}

function fakeFile(name, relativePath) {
    return {
        name: name,
        webkitRelativePath: relativePath || ('folder/' + name)
    };
}

// ── Section 1: Exports (T1-T5) ────────────────────────────────────────────
console.log('\n─── Section 1: Exports ───');

[
    ['T01', 'classifyScenarioFolderFile'],
    ['T02', 'scanScenarioFolderFiles'],
    ['T03', 'getLiveScenarioFolderScanState'],
    ['T04', 'importSelectedFolderScenarioJson'],
    ['T05', 'initLiveScenarioFolderImport']
].forEach(function(p) {
    check(swSrc.indexOf(p[1] + ':') >= 0, p[0] + ': ' + p[1] + ' exported');
});

// ── Section 2: classify single file (T6-T21) ──────────────────────────────
console.log('\n─── Section 2: classifyScenarioFolderFile ───');

(function() {
    var m = buildModule(null);
    var c;

    c = m.classify(fakeFile('scenario.json'));
    check(c.fileType === 'json' && c.importable === true,
          'T06: .json classified as importable candidate');

    c = m.classify(fakeFile('SCENARIO.JSON'));
    check(c.fileType === 'json' && c.importable === true,
          'T07: .JSON uppercase classified correctly');

    c = m.classify(fakeFile('battle.scen'));
    check(c.fileType === 'command_scen_binary' && !c.importable,
          'T08: .scen classified unsupported (Command binary)');

    c = m.classify(fakeFile('weapons.ini'));
    check(c.fileType === 'command_ini_weapon_patch' && !c.importable,
          'T09: .ini classified unsupported (weapon patch)');

    c = m.classify(fakeFile('script.lua'));
    check(c.fileType === 'lua_script' && c.blocked === true && !c.importable,
          'T10: .lua classified blocked');

    c = m.classify(fakeFile('brief.pdf'));
    check(c.fileType === 'briefing_document' && !c.importable,
          'T11: .pdf classified briefing document');
    c = m.classify(fakeFile('brief.docx'));
    check(c.fileType === 'briefing_document', 'T12: .docx classified briefing document');
    c = m.classify(fakeFile('brief.html'));
    check(c.fileType === 'briefing_document', 'T13: .html classified briefing document');
    c = m.classify(fakeFile('brief.rtf'));
    check(c.fileType === 'briefing_document', 'T14: .rtf classified briefing document');
    c = m.classify(fakeFile('brief.txt'));
    check(c.fileType === 'briefing_document', 'T15: .txt classified briefing document');

    c = m.classify(fakeFile('map.png'));
    check(c.fileType === 'asset' && !c.importable, 'T16: .png classified asset');
    c = m.classify(fakeFile('icon.jpg'));
    check(c.fileType === 'asset', 'T17: .jpg classified asset');
    c = m.classify(fakeFile('art.webp'));
    check(c.fileType === 'asset', 'T18: .webp classified asset');

    c = m.classify(fakeFile('foo.xyz'));
    check(c.fileType === 'unsupported_unknown', 'T19: unknown extension classified unsupported');

    c = m.classify({ name: 'scenario.json',
                     webkitRelativePath: 'my/folder/scenario.json' });
    check(c.relativePath === 'my/folder/scenario.json',
          'T20: relativePath preserved from webkitRelativePath');

    c = m.classify({ name: 'lone.json' });
    check(c.relativePath === 'lone.json',
          'T21: relativePath falls back to file.name');
})();

// ── Section 3: scan (T22-T38) ─────────────────────────────────────────────
console.log('\n─── Section 3: scanScenarioFolderFiles ───');

(function() {
    var m = buildModule(null);
    var files = [
        fakeFile('a.json'),
        fakeFile('b.json'),
        fakeFile('c.scen'),
        fakeFile('d.ini'),
        fakeFile('e.lua'),
        fakeFile('f.pdf'),
        fakeFile('g.docx'),
        fakeFile('h.png'),
        fakeFile('i.unknownext')
    ];
    // T22: scan accepts array-like FileList
    var r = m.scan(files);
    check(r.passed && Array.isArray(r.candidates) && Array.isArray(r.unsupported),
          'T22: scan accepts array-like FileList');

    var s = r.summary;
    check(s.totalFiles      === 9, 'T23: scan counts totalFiles',      s.totalFiles);
    check(s.jsonCandidates  === 2, 'T24: scan counts jsonCandidates',  s.jsonCandidates);
    check(s.unsupportedScen === 1, 'T25: scan counts unsupportedScen', s.unsupportedScen);
    check(s.unsupportedIni  === 1, 'T26: scan counts unsupportedIni',  s.unsupportedIni);
    check(s.blockedLua      === 1, 'T27: scan counts blockedLua',      s.blockedLua);
    check(s.briefingDocs    === 2, 'T28: scan counts briefingDocs (pdf+docx)', s.briefingDocs);
    check(s.assets          === 1, 'T29: scan counts assets (png)',    s.assets);
    check(s.other           === 1, 'T30: scan counts other (.unknownext)', s.other);

    check(r.candidates.length === 2 &&
          r.candidates.every(function(c) { return c.fileType === 'json'; }),
          'T31: scan candidates contain only JSON entries');

    check(r.unsupported.length === 7 &&
          r.unsupported.every(function(u) { return u.fileType !== 'json'; }),
          'T32: scan unsupported contains all non-JSON entries');

    // T36: warns when no JSON candidates
    var rNoJson = m.scan([fakeFile('a.scen'), fakeFile('b.ini')]);
    check(rNoJson.warnings.indexOf('NO_JSON_CANDIDATES') >= 0,
          'T36: warns NO_JSON_CANDIDATES when no JSON');

    // T37: warns when .scen detected
    check(r.warnings.indexOf('SCEN_FILES_DETECTED_BUT_NOT_IMPORTABLE') >= 0,
          'T37: warns SCEN_FILES_DETECTED_BUT_NOT_IMPORTABLE');

    // T38: warns when .ini detected
    check(r.warnings.indexOf('INI_FILES_ARE_WEAPON_PATCHES_NOT_METADATA') >= 0,
          'T38: warns INI_FILES_ARE_WEAPON_PATCHES_NOT_METADATA');
})();

// T33-T35: scan reads NO file content — verified at source level (no FileReader use)
var scanFnSrc     = extractFn(swSrc, 'scanScenarioFolderFiles')    || '';
var classifyFnSrc = extractFn(swSrc, 'classifyScenarioFolderFile') || '';
check(scanFnSrc.indexOf('FileReader')      < 0 &&
      classifyFnSrc.indexOf('FileReader')  < 0,
      'T33-T35: scan/classify do NOT use FileReader (no .scen/.ini/Lua content reads)');

// ── Section 4: app.html DOM IDs (T39-T44) ─────────────────────────────────
console.log('\n─── Section 4: app.html DOM IDs ───');

check(htmlSrc.indexOf('id="sw-live-scenario-folder-input"') >= 0,
      'T39: folder input DOM exists');
check(htmlSrc.indexOf('id="sw-live-scenario-folder-scan-btn"') >= 0,
      'T40: scan button DOM exists');
check(htmlSrc.indexOf('id="sw-live-scenario-folder-summary"') >= 0,
      'T41: summary DOM exists');
check(htmlSrc.indexOf('id="sw-live-scenario-folder-candidates"') >= 0,
      'T42: candidates DOM exists');
check(htmlSrc.indexOf('id="sw-live-scenario-folder-unsupported"') >= 0,
      'T43: unsupported DOM exists');
check(htmlSrc.indexOf('id="sw-live-scenario-folder-import-btn"') >= 0,
      'T44: selected import button DOM exists');
check(/webkitdirectory/.test(htmlSrc),
      'T44b: folder input has webkitdirectory attribute');

// ── Section 5: importSelected routes through PR-286L0 (T45-T47) ───────────
console.log('\n─── Section 5: importSelectedFolderScenarioJson ───');

(function() {
    var initial = { scenario: { scenario_id: 'pre-existing' }, stepIndex: 7 };
    var m = buildModule(initial);

    // Prime state with one candidate (file index 0).
    var fakeFiles = [{ name: 'live-test.json',
                       webkitRelativePath: 'folder/live-test.json' }];
    m._setState({
        files:      fakeFiles,
        candidates: [{ fileName: 'live-test.json',
                        relativePath: 'folder/live-test.json',
                        extension: 'json', fileType: 'json',
                        importable: true, _fileIndex: 0 }],
        summary:    { totalFiles: 1, jsonCandidates: 1, unsupportedScen: 0,
                       unsupportedIni: 0, blockedLua: 0, briefingDocs: 0,
                       assets: 0, other: 0 }
    });

    // T45: importSelected uses loadLiveScenarioFromJson — sync test path via options.text
    var validText = JSON.stringify({
        scenario_id: 'folder-imported',
        scenario_label: 'Folder Imported',
        steps: [{ phase: 'briefing' }, { phase: 'execution' }]
    });
    var r = m.importSel('folder/live-test.json', { text: validText });
    check(r.passed && r.scenarioId === 'folder-imported' && r.stepCount === 2,
          'T45+T47: importSelected routes valid JSON through loadLiveScenarioFromJson',
          JSON.stringify(r));

    // T46: invalid selected JSON does NOT touch window.RmoozScenario
    // Reset live state by re-priming and reset window
    var m2 = buildModule({ scenario: { scenario_id: 'must-not-change' }, stepIndex: 3 });
    m2._setState({
        files:      fakeFiles,
        candidates: [{ fileName: 'bad.json', relativePath: 'folder/bad.json',
                        extension: 'json', fileType: 'json',
                        importable: true, _fileIndex: 0 }]
    });
    var rBad = m2.importSel('folder/bad.json', { text: 'not-json{{{' });
    var w2 = m2._window();
    check(!rBad.passed &&
          rBad.blockedReasons.indexOf('JSON_PARSE_ERROR') >= 0 &&
          w2.RmoozScenario.scenario.scenario_id === 'must-not-change' &&
          w2.RmoozScenario.stepIndex === 3,
          'T46: invalid JSON does NOT touch window.RmoozScenario',
          'still:' + w2.RmoozScenario.scenario.scenario_id +
          ' idx:' + w2.RmoozScenario.stepIndex);

    // T46b: NO_CANDIDATES_AVAILABLE when state is empty
    var m3 = buildModule(null);
    var rEmpty = m3.importSel(0, { text: '{}' });
    check(!rEmpty.passed &&
          rEmpty.blockedReasons.indexOf('NO_CANDIDATES_AVAILABLE') >= 0,
          'T46b: NO_CANDIDATES_AVAILABLE when state has no candidates');

    // T46c: SELECTION_NOT_FOUND for unknown relativePath
    var m4 = buildModule(null);
    m4._setState({ files: fakeFiles, candidates: [
        { fileName: 'x.json', relativePath: 'x.json',
          extension: 'json', fileType: 'json',
          importable: true, _fileIndex: 0 }
    ] });
    var rNF = m4.importSel('not-in-list.json', { text: '{}' });
    check(!rNF.passed && rNF.blockedReasons.indexOf('SELECTION_NOT_FOUND') >= 0,
          'T46c: SELECTION_NOT_FOUND for unknown relativePath');
})();

// ── Section 6: source-level safety audits (T48-T57) ───────────────────────
console.log('\n─── Section 6: source-level safety audits ───');

var importFnSrc = extractFn(swSrc, 'importSelectedFolderScenarioJson') || '';
var initFnSrc   = extractFn(swSrc, 'initLiveScenarioFolderImport')     || '';
var allNew      = scanFnSrc + classifyFnSrc + importFnSrc + initFnSrc +
                  (extractFn(swSrc, 'getLiveScenarioFolderScanState') || '') +
                  (extractFn(swSrc, '_resolveFolderCandidate') || '');

check(!/paintDryRunPreview\s*\(|paintWargame3Preview\s*\(/.test(allNew),
      'T48: import flow makes NO dry-run / W3-preview paint calls');
check(allNew.indexOf('_drpPreviewSource')  < 0,
      'T49: import flow does NOT reference _drpPreviewSource');
check(allNew.indexOf('_drpPreviewStepRef') < 0,
      'T50: import flow does NOT reference _drpPreviewStepRef');
check(allNew.indexOf('_swDecisionPackage') < 0 &&
      allNew.indexOf('loadDecisionPackage') < 0 &&
      allNew.indexOf('loadParsedDecisionPackageFixture') < 0,
      'T51: import flow does NOT reuse decision-package pipeline');
// T52/T53: ensure NO file-content parsing for .scen/.ini happens.
// The actual mechanism for parsing would be readAsText / readAsBinaryString /
// readAsArrayBuffer / endsWith routing — we verify NONE of those appear with
// a .scen/.ini target. Display labels like ".scen: 3" in the summary are OK.
var importPathOnly = importFnSrc +
                     (extractFn(swSrc, '_resolveFolderCandidate') || '');
function hasParsingPatternFor(src, ext) {
    // Look for read*(...) calls whose context mentions the extension,
    // OR endsWith('.ext') / .test('.ext') style routing.
    if (new RegExp('endsWith\\s*\\(\\s*[\'"]\\.' + ext + '[\'"]').test(src)) return true;
    if (new RegExp('readAs(?:Text|BinaryString|ArrayBuffer|DataURL)[\\s\\S]{0,300}\\.' + ext + '\\b').test(src)) return true;
    if (new RegExp('\\.' + ext + '[\'"]\\s*\\)\\s*\\.test').test(src)) return true;
    return false;
}
check(!hasParsingPatternFor(importPathOnly, 'scen'),
      'T52: import flow does NOT route .scen files for parsing');
check(!hasParsingPatternFor(importPathOnly, 'ini'),
      'T53: import flow does NOT route .ini files for parsing');
// Also verify scan + classify (which DO mention .scen/.ini) don't actually
// read content from those file types either:
check(!hasParsingPatternFor(scanFnSrc + classifyFnSrc, 'scen') &&
      !hasParsingPatternFor(scanFnSrc + classifyFnSrc, 'ini'),
      'T52b/T53b: scan/classify do NOT read .scen/.ini content (name-only matching)');
// "lua" only appears as ext-match string literal — never as code execution
check(!/\beval\s*\(|\bnew\s+Function\s*\(/.test(allNew),
      'T54: import flow does NOT execute Lua (no eval / new Function in body)');
check(!/fetch\s*\(|XMLHttpRequest|\$\.ajax/.test(allNew),
      'T55: import flow does NOT call fetch / XHR / backend');
check(!/localStorage\s*\.|sessionStorage\s*\.|indexedDB\s*\.|IndexedDB\s*\./.test(allNew),
      'T56: import flow does NOT use storage (read/write)');
check(!/\/api\/sim\/commit|applyDecision|executeSimulation|Gate\s*7|go[\s_-]?live/i.test(allNew),
      'T57: import flow does NOT add Gate 7 / apply / execute / commit / go-live');

// ── Section 7: existing layout intact (T58-T64) ───────────────────────────
console.log('\n─── Section 7: existing layout intact ───');

function elementHasHiddenAttr(html, attrFragment) {
    var idx = html.indexOf(attrFragment);
    if (idx < 0) return false;
    var start = html.lastIndexOf('<', idx);
    var end   = html.indexOf('>', idx);
    if (start < 0 || end < 0) return false;
    return /\shidden(\s|>|=)/.test(html.slice(start, end + 1));
}

check(elementHasHiddenAttr(htmlSrc, 'id="sw-drp-section"'),
      'T58: #sw-drp-section remains hidden');
check(elementHasHiddenAttr(htmlSrc, 'id="sw-w3-load-bar"'),
      'T59: #sw-w3-load-bar remains hidden');
var initBlockStart = swSrc.indexOf('_initDrpNavButtons();');
var initBlockEnd   = swSrc.indexOf("logSystem('elog-evt-sw-rendered'");
var initBlock      = swSrc.slice(initBlockStart, initBlockEnd);
check(!/(?:^|\n)\s*paintDryRunPreview\s*\(\s*\)\s*;/.test(initBlock),
      'T60: AMBER RIDGE not auto-rendered in init');
check(htmlSrc.indexOf('id="sw-live-workspace"') >= 0,
      'T61: #sw-live-workspace remains intact');
check(htmlSrc.indexOf('id="sw-live-scenario-import-card"') >= 0,
      'T62: #sw-live-scenario-import-card remains intact');
check(htmlSrc.indexOf('id="sw-live-scenario-import-btn"') >= 0,
      'T63: existing single-file live import button remains intact');
check(htmlSrc.indexOf('id="sw-local-json-source-card"') >= 0 &&
      htmlSrc.indexOf('id="sw-dpkg-import-json"') >= 0,
      'T64: decision package import card + button remain intact');

// ── Section 8: protected files unchanged (T65-T67) ────────────────────────
console.log('\n─── Section 8: protected files unchanged ───');

if (fs.existsSync(W3_PATH)) {
    var w3 = JSON.parse(fs.readFileSync(W3_PATH, 'utf8'));
    check(Array.isArray(w3.red_units) && w3.red_units.length === 70 &&
          Array.isArray(w3.blue_units_initial) && w3.blue_units_initial.length === 83,
          'T65: wargame3.json unchanged (70 red + 83 blue)');
}
if (fs.existsSync(APP_JS)) {
    check(fs.readFileSync(APP_JS, 'utf8').indexOf('PR-286L1') < 0,
          'T66: app.js not modified by PR-286L1');
}
if (fs.existsSync(ADJ_MAP)) {
    check(fs.readFileSync(ADJ_MAP, 'utf8').indexOf('PR-286L1') < 0,
          'T67: adjudicator-map.js not modified by PR-286L1');
}

// ── Section 9: i18n EN + AR (T68-T69) ─────────────────────────────────────
console.log('\n─── Section 9: i18n EN + AR ───');

var KEYS = [
    'sw-live-scenario-folder-title', 'sw-live-scenario-folder-sub',
    'sw-live-scenario-folder-scan-btn', 'sw-live-scenario-folder-import-btn',
    'sw-live-scenario-folder-candidates-hdr', 'sw-live-scenario-folder-unsupported-hdr',
    'sw-live-scenario-folder-no-candidates', 'sw-live-scenario-folder-scen-detected',
    'sw-live-scenario-folder-ini-detected', 'sw-live-scenario-folder-lua-blocked',
    'sw-live-scenario-folder-doc-info', 'sw-live-scenario-folder-asset-info',
    'sw-live-scenario-folder-scan-complete'
];
var enStart = i18nSrc.indexOf('en:');
var arStart = i18nSrc.indexOf('ar:');
var enBlock = i18nSrc.slice(enStart, arStart);
var arBlock = i18nSrc.slice(arStart);

var missEn = KEYS.filter(function(k) { return enBlock.indexOf("'" + k + "'") < 0; });
check(missEn.length === 0, 'T68: all PR-286L1 EN keys present',
      missEn.length ? 'MISSING: ' + missEn.join(', ') : 'all present');

var missAr = KEYS.filter(function(k) { return arBlock.indexOf("'" + k + "'") < 0; });
check(missAr.length === 0, 'T69: all PR-286L1 AR keys present',
      missAr.length ? 'MISSING: ' + missAr.join(', ') : 'all present');
check(arBlock.indexOf('فحص مجلد السيناريو') >= 0,
      'T69b: AR scan button text contains Arabic');

// ── Section 10: CSS (T70) ─────────────────────────────────────────────────
console.log('\n─── Section 10: CSS ───');

[
    '.sw-live-scenario-folder-intake',
    '.sw-live-scenario-folder-candidates',
    '.sw-live-scenario-folder-unsupported',
    '.sw-live-scenario-folder-cand-row',
    '.sw-live-scenario-folder-unsup-row',
    '.sw-live-scenario-folder-scan-btn',
    '.sw-live-scenario-folder-import-btn'
].forEach(function(sel, i) {
    check(cssSrc.indexOf(sel) >= 0, 'T70.' + (i + 1) + ': CSS ' + sel + ' defined');
});

// ── Section 11: Source syntax (T71) ───────────────────────────────────────
console.log('\n─── Section 11: source syntax ───');

try {
    new Function(swSrc);
    check(true, 'T71: scenario-workspace.js parses without syntax error');
} catch (err) {
    check(false, 'T71: scenario-workspace.js parses without syntax error', err.message);
}

// ── Extras ────────────────────────────────────────────────────────────────

check(initBlock.indexOf('initLiveScenarioFolderImport()') >= 0,
      'Extra-01: initLiveScenarioFolderImport() wired into init() block');

// getLiveScenarioFolderScanState returns deep copy
(function() {
    var m = buildModule(null);
    m._setState({
        files: [],
        candidates: [{ fileName: 'x.json', relativePath: 'x.json',
                       extension: 'json', fileType: 'json',
                       importable: true, _fileIndex: 0 }],
        summary: { totalFiles: 1, jsonCandidates: 1 }
    });
    var copy = m.getState();
    copy.candidates.push({ junk: true });
    var st = m._state();
    check(st.candidates.length === 1,
          'Extra-02: getLiveScenarioFolderScanState returns deep copy (mutation isolated)');
})();

// All previous PR-280–286L0 exports still present
var prevExports = [
    'validateLiveScenarioJson', 'loadLiveScenarioFromJson',
    'getCurrentLiveScenarioSummary', 'initLiveScenarioImport',
    'getLiveScenarioIdentity', 'paintLiveScenarioHeader',
    'paintLiveDecisionActionCard', 'recordLiveOperatorSelection'
];
var missingPrev = prevExports.filter(function(n) { return swSrc.indexOf(n + ':') < 0; });
check(missingPrev.length === 0,
      'Extra-03: all previous PR exports still present',
      missingPrev.length ? 'MISSING: ' + missingPrev.join(', ') : 'all present');

// ── Final ─────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(65));
console.log('  PR-286L1 Test Results');
console.log('═'.repeat(65));
console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
console.log('═'.repeat(65));
console.log('\n  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));

process.exit(failed === 0 ? 0 : 1);
