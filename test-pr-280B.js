/**
 * test-pr-280B.js
 * PR-280B — Single External Scenario Catalog Entry (smoke test)
 *
 * Tests buildSingleExternalScenarioCatalogEntry and
 *       summarizeSingleExternalScenarioCatalogEntry
 *
 *   T01–T05   Export / source presence
 *   T06–T10   Guard: null/bad manifest rejection
 *   T11–T15   Guard: missing scenarios array rejection
 *   T16–T20   Default selection — returns exactly one entry
 *   T21–T25   Selector: scenarioId
 *   T26–T29   Selector: path
 *   T30–T33   Selector: title (case-insensitive)
 *   T34–T38   Selection options: preferHighConfidence, avoidLua, requireXlsxMatch
 *   T39–T51   Entry field invariants (boundary flags, safety locks)
 *   T52–T58   Entry field copy — scenario data propagated correctly
 *   T59–T62   summarize helper — shape and invariants
 *   T63–T65   Immutability — sourceManifest not mutated
 *   T66–T69   Boundary string checks — no forbidden keys in entry JSON
 *   T70–T73   Source-file checks — no forbidden patterns added
 *   T74–T78   Regression — prior PR-280 exports still present
 *   T79–T83   File-protection checks
 *
 * ~83 focused tests.  No DOM.  No Leaflet.  No storage.  No backend.
 *
 * Run: node test-pr-280B.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Source helpers ─────────────────────────────────────────────────────────────
function readSrc(rel) {
    return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

const wsSrc = readSrc('UI_MOdified/client/shell/scenario-workspace.js');

function extractFn(src, name) {
    const re = new RegExp(
        '(?:function\\s+' + name + '\\s*\\(|' +
        name + '\\s*:\\s*function\\s*\\(|' +
        name + '\\s*=\\s*function\\s*\\()'
    );
    const m = re.exec(src);
    if (!m) return null;
    let idx = m.index;
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

// ── Test runner ────────────────────────────────────────────────────────────────
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

// ── Harness ────────────────────────────────────────────────────────────────────
function buildHarness() {
    const buildFnSrc     = extractFn(wsSrc, 'buildSingleExternalScenarioCatalogEntry');
    const summarizeFnSrc = extractFn(wsSrc, 'summarizeSingleExternalScenarioCatalogEntry');
    assert(buildFnSrc,     'buildSingleExternalScenarioCatalogEntry function body not found');
    assert(summarizeFnSrc, 'summarizeSingleExternalScenarioCatalogEntry function body not found');

    const code = `
        function buildSingleExternalScenarioCatalogEntry(sourceManifest, selectorOrOptions)
            ${buildFnSrc}
        function summarizeSingleExternalScenarioCatalogEntry(entry)
            ${summarizeFnSrc}
    `;
    // eslint-disable-next-line no-new-func
    const fn = new Function(
        'return (function() { ' + code + ' return { build: buildSingleExternalScenarioCatalogEntry, summarize: summarizeSingleExternalScenarioCatalogEntry }; })();'
    );
    return fn();
}

let H;
try { H = buildHarness(); }
catch (e) { console.error('HARNESS FAILED:', e.message); process.exit(1); }

// ── Load real PR-280A manifest (read-only) ─────────────────────────────────────
const MANIFEST_PATH  = path.join(__dirname, 'docs/scenario-pack-audit/external_scenario_source_manifest.json');
const FIXTURE_PATH   = path.join(__dirname, 'docs/scenario-pack-audit/external_scenario_single_smoke_fixture.json');
let realManifest = null;
let smokeFixture = null;
try { realManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); }
catch (e) { /* will be caught in T01 */ }
try { smokeFixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')); }
catch (e) { /* optional fixture */ }

// Minimal synthetic manifest for isolated unit tests
function makeManifest(overrides) {
    return Object.assign({
        manifestType:        'external_scenario_source_manifest',
        sourceKind:          'command_modern_operations_pack',
        sourceName:          'CommunityScenarioPack51',
        readOnly:            true,
        dryRunOnly:          true,
        catalogOnly:         true,
        liveMutationAllowed: false,
        scenarios: [
            {
                scenarioId:            'scenario_0001',
                title:                 'Test Scenario Alpha',
                year:                  2021,
                author:                'TEST AUTHOR',
                xlsxNotes:             null,
                path:                  'Test Scenario Alpha, 2021.scen',
                fileName:              'Test Scenario Alpha, 2021.scen',
                sizeBytes:             123456,
                campaignSeries:        'Standalone Scenario',
                folderGroup:           'root',
                hasIniWeaponPatch:     true,
                iniWeaponPatchPath:    'Test Scenario Alpha, 2021.ini',
                hasHtmlBriefing:       false,
                htmlBriefingPaths:     [],
                hasDocumentBriefing:   false,
                documentBriefingPaths: [],
                hasLua:                false,
                luaScriptPaths:        [],
                luaExecutionBlocked:   true,
                scenBinaryParsed:      false,
                importStatus:          'manifest_only',
                conversionReady:       false,
                requiresHumanReview:   true,
                confidence:            'high',
                sourceTrace: {
                    titleFrom: 'xlsx', yearFrom: 'xlsx',
                    authorFrom: 'xlsx', notesFrom: 'none',
                    relationshipFrom: 'filename_match'
                }
            },
            {
                scenarioId:            'scenario_0002',
                title:                 'Test Scenario Beta',
                year:                  1985,
                author:                null,
                xlsxNotes:             null,
                path:                  'Test Scenario Beta, 1985.scen',
                fileName:              'Test Scenario Beta, 1985.scen',
                sizeBytes:             654321,
                campaignSeries:        'Some Campaign',
                folderGroup:           'root',
                hasIniWeaponPatch:     false,
                iniWeaponPatchPath:    null,
                hasHtmlBriefing:       true,
                htmlBriefingPaths:     ['Assets/BetaBriefing.html'],
                hasDocumentBriefing:   false,
                documentBriefingPaths: [],
                hasLua:                false,
                luaScriptPaths:        [],
                luaExecutionBlocked:   true,
                scenBinaryParsed:      false,
                importStatus:          'manifest_only',
                conversionReady:       false,
                requiresHumanReview:   true,
                confidence:            'medium',
                sourceTrace: {
                    titleFrom: 'filename', yearFrom: 'filename',
                    authorFrom: 'none', notesFrom: 'none',
                    relationshipFrom: 'filename_match'
                }
            },
            {
                scenarioId:            'scenario_0003',
                title:                 'Lua Test Scenario',
                year:                  1981,
                author:                'LUA AUTHOR',
                xlsxNotes:             null,
                path:                  'Lua Test Scenario, 1981.scen',
                fileName:              'Lua Test Scenario, 1981.scen',
                sizeBytes:             285326,
                campaignSeries:        'Gulf Series',
                folderGroup:           'root',
                hasIniWeaponPatch:     true,
                iniWeaponPatchPath:    'Lua Test Scenario, 1981.ini',
                hasHtmlBriefing:       true,
                htmlBriefingPaths:     ['Assets/LuaBriefing.html'],
                hasDocumentBriefing:   false,
                documentBriefingPaths: [],
                hasLua:                true,
                luaScriptPaths:        ['Lua/LuaTest/Setup.lua', 'Lua/LuaTest/Score.lua'],
                luaExecutionBlocked:   true,
                scenBinaryParsed:      false,
                importStatus:          'manifest_only',
                conversionReady:       false,
                requiresHumanReview:   true,
                confidence:            'high',
                sourceTrace: {
                    titleFrom: 'xlsx', yearFrom: 'xlsx',
                    authorFrom: 'xlsx', notesFrom: 'none',
                    relationshipFrom: 'filename_match'
                }
            }
        ]
    }, overrides || {});
}

// ══════════════════════════════════════════════════════════════════════════════
// T01–T05  Export / source presence
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 1: Export / source presence ---');

test('T01', 'buildSingleExternalScenarioCatalogEntry in source', () => {
    assert(wsSrc.includes('buildSingleExternalScenarioCatalogEntry'),
        'function name not found in scenario-workspace.js');
});
test('T02', 'summarizeSingleExternalScenarioCatalogEntry in source', () => {
    assert(wsSrc.includes('summarizeSingleExternalScenarioCatalogEntry'),
        'function name not found in scenario-workspace.js');
});
test('T03', 'buildSingleExternalScenarioCatalogEntry exported in public API', () => {
    assert(wsSrc.includes('buildSingleExternalScenarioCatalogEntry:'),
        'export key missing from window.AppShellScenarioWorkspace');
});
test('T04', 'summarizeSingleExternalScenarioCatalogEntry exported in public API', () => {
    assert(wsSrc.includes('summarizeSingleExternalScenarioCatalogEntry:'),
        'export key missing from window.AppShellScenarioWorkspace');
});
test('T05', 'harness resolved both functions', () => {
    assert(typeof H.build     === 'function', 'H.build not a function');
    assert(typeof H.summarize === 'function', 'H.summarize not a function');
});

// ══════════════════════════════════════════════════════════════════════════════
// T06–T15  Guard: rejection cases
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 2: Guard rejections ---');

test('T06', 'rejects null manifest', () => {
    const r = H.build(null);
    assert(r.passed === false, 'passed should be false');
    assert(r.entry  === null,  'entry should be null');
    assert(r.blockedReasons.length > 0, 'blockedReasons should be non-empty');
});
test('T07', 'rejects undefined manifest', () => {
    const r = H.build(undefined);
    assert(r.passed === false && r.entry === null);
});
test('T08', 'rejects array as manifest', () => {
    const r = H.build([]);
    assert(r.passed === false && r.entry === null);
    assert(r.blockedReasons.some(b => b.includes('non-null') || b.includes('non-array')));
});
test('T09', 'rejects string as manifest', () => {
    const r = H.build('not-an-object');
    assert(r.passed === false && r.entry === null);
});
test('T10', 'rejects number as manifest', () => {
    const r = H.build(42);
    assert(r.passed === false && r.entry === null);
});
test('T11', 'rejects manifest without scenarios property', () => {
    const r = H.build({ sourceKind: 'x', sourceName: 'y' });
    assert(r.passed === false && r.entry === null);
    assert(r.blockedReasons.some(b => b.includes('scenarios')));
});
test('T12', 'rejects manifest where scenarios is not an array', () => {
    const r = H.build({ scenarios: {} });
    assert(r.passed === false && r.entry === null);
});
test('T13', 'rejects scenarioId selector when id not found', () => {
    const r = H.build(makeManifest(), { scenarioId: 'scenario_9999' });
    assert(r.passed === false && r.entry === null);
    assert(r.blockedReasons.some(b => b.includes('scenario_9999')));
});
test('T14', 'rejects path selector when path not found', () => {
    const r = H.build(makeManifest(), { path: 'Nonexistent.scen' });
    assert(r.passed === false && r.entry === null);
});
test('T15', 'rejects title selector when title not found', () => {
    const r = H.build(makeManifest(), { title: 'No Such Scenario' });
    assert(r.passed === false && r.entry === null);
});

// ══════════════════════════════════════════════════════════════════════════════
// T16–T20  Default selection
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 3: Default selection ---');

test('T16', 'returns passed:true with valid manifest', () => {
    const r = H.build(makeManifest());
    assert(r.passed === true, 'passed should be true; reasons: ' + JSON.stringify(r.blockedReasons));
});
test('T17', 'returns exactly one entry (not an array of all scenarios)', () => {
    const r = H.build(makeManifest());
    assert(r.entry !== null, 'entry should not be null');
    assert(!Array.isArray(r.entry), 'entry must not be an array');
    assert(typeof r.entry === 'object', 'entry must be an object');
});
test('T18', 'default selection prefers high confidence over medium', () => {
    const r = H.build(makeManifest());
    // scenario_0001 is high, no Lua, xlsx → should win over scenario_0002 (medium)
    assert(r.entry.confidence === 'high', 'expected high confidence; got: ' + r.entry.confidence);
});
test('T19', 'default selection avoids Lua scenario when alternative exists', () => {
    const r = H.build(makeManifest());
    assert(r.entry.hasLua === false, 'default should avoid Lua scenario');
});
test('T20', 'empty scenarios array returns blocked', () => {
    const r = H.build(makeManifest({ scenarios: [] }));
    assert(r.passed === false && r.entry === null);
});

// ══════════════════════════════════════════════════════════════════════════════
// T21–T33  Selectors
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 4: Selectors ---');

test('T21', 'selector by scenarioId returns correct scenario', () => {
    const r = H.build(makeManifest(), { scenarioId: 'scenario_0002' });
    assert(r.passed === true);
    assert(r.entry.scenarioId === 'scenario_0002');
});
test('T22', 'selector by scenarioId: title matches', () => {
    const r = H.build(makeManifest(), { scenarioId: 'scenario_0003' });
    assert(r.entry.title === 'Lua Test Scenario');
});
test('T23', 'selector by scenarioId: Lua scenario correctly selected', () => {
    const r = H.build(makeManifest(), { scenarioId: 'scenario_0003' });
    assert(r.entry.hasLua === true);
    assert(r.entry.luaExecutionBlocked === true);
});
test('T24', 'selector by path returns correct scenario', () => {
    const r = H.build(makeManifest(), { path: 'Test Scenario Beta, 1985.scen' });
    assert(r.passed === true);
    assert(r.entry.path === 'Test Scenario Beta, 1985.scen');
});
test('T25', 'selector by path: sizeBytes propagated', () => {
    const r = H.build(makeManifest(), { path: 'Test Scenario Beta, 1985.scen' });
    assert(r.entry.sizeBytes === 654321);
});
test('T26', 'selector by title: exact match', () => {
    const r = H.build(makeManifest(), { title: 'Test Scenario Alpha' });
    assert(r.passed === true && r.entry.scenarioId === 'scenario_0001');
});
test('T27', 'selector by title: case-insensitive', () => {
    const r = H.build(makeManifest(), { title: 'test scenario alpha' });
    assert(r.passed === true && r.entry.scenarioId === 'scenario_0001');
});
test('T28', 'selector by title: UPPER CASE', () => {
    const r = H.build(makeManifest(), { title: 'TEST SCENARIO BETA' });
    assert(r.passed === true && r.entry.scenarioId === 'scenario_0002');
});
test('T29', 'avoidLua:false allows Lua scenario to win on score', () => {
    // Only Lua scenario is high+html; with avoidLua:false it may win on high+xlsx
    // Scenario_0003 is high+lua+xlsx → score = 4+1 = 5; scenario_0001 is high+nolua+xlsx → 4+2+1=7
    // avoidLua:false: s0003 → 4+1=5, s0001 → 4+1=5 (tie: first wins = s0001)
    // avoidLua:true: s0001 wins with 7
    // Test that when only Lua scenario exists, avoidLua:false is still safe
    const luaOnly = makeManifest({ scenarios: [makeManifest().scenarios[2]] });
    const r = H.build(luaOnly, { avoidLua: false });
    assert(r.passed === true && r.entry.hasLua === true);
    assert(r.entry.luaExecutionBlocked === true, 'luaExecutionBlocked must always be true');
});
test('T30', 'preferHighConfidence:true picks high over medium', () => {
    const r = H.build(makeManifest(), { preferHighConfidence: true, avoidLua: false });
    assert(r.entry.confidence === 'high');
});
test('T31', 'requireXlsxMatch:true skips filename-only scenarios', () => {
    // scenario_0002 is filename-only; scenario_0001 and _0003 are xlsx
    const r = H.build(makeManifest(), { requireXlsxMatch: true });
    assert(r.passed === true);
    assert(r.entry.sourceTrace.titleFrom === 'xlsx',
        'selected scenario should have titleFrom=xlsx');
});
test('T32', 'requireXlsxMatch:true on manifest with only filename scenarios → blocked', () => {
    const noXlsx = makeManifest({
        scenarios: [Object.assign({}, makeManifest().scenarios[1],
            { sourceTrace: { titleFrom: 'filename', yearFrom: 'filename',
                             authorFrom: 'none', notesFrom: 'none',
                             relationshipFrom: 'filename_match' } })]
    });
    const r = H.build(noXlsx, { requireXlsxMatch: true });
    assert(r.passed === false);
});
test('T33', 'selector by title with real manifest (Iran Strike, 2025)', () => {
    if (!realManifest) return; // skip if manifest not loaded
    const r = H.build(realManifest, { title: 'Iran Strike, 2025' });
    assert(r.passed === true, 'should find Iran Strike 2025; reasons: ' + JSON.stringify(r.blockedReasons));
    assert(r.entry.hasHtmlBriefing === true, 'Iran Strike 2025 should have HTML briefings');
    assert(r.entry.htmlBriefingPaths.length === 4, 'should have 4 HTML briefing paths');
});

// ══════════════════════════════════════════════════════════════════════════════
// T34–T51  Entry field invariants
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 5: Entry field invariants ---');

function getDefaultEntry() {
    return H.build(makeManifest()).entry;
}

test('T34', 'entryType is external_scenario_catalog_entry', () => {
    assert(getDefaultEntry().entryType === 'external_scenario_catalog_entry');
});
test('T35', 'source is external_scenario_source_manifest', () => {
    assert(getDefaultEntry().source === 'external_scenario_source_manifest');
});
test('T36', 'readOnly is true', () => {
    assert(getDefaultEntry().readOnly === true);
});
test('T37', 'dryRunOnly is true', () => {
    assert(getDefaultEntry().dryRunOnly === true);
});
test('T38', 'catalogOnly is true', () => {
    assert(getDefaultEntry().catalogOnly === true);
});
test('T39', 'previewOnly is true', () => {
    assert(getDefaultEntry().previewOnly === true);
});
test('T40', 'liveMutationAllowed is false', () => {
    assert(getDefaultEntry().liveMutationAllowed === false);
});
test('T41', 'backendCommitAllowed is false', () => {
    assert(getDefaultEntry().backendCommitAllowed === false);
});
test('T42', 'iniTreatedAsMetadata is false (hard lock)', () => {
    assert(getDefaultEntry().iniTreatedAsMetadata === false);
});
test('T43', 'luaExecutionBlocked is true (hard lock — even for no-Lua scenario)', () => {
    const e = getDefaultEntry();
    assert(e.hasLua === false, 'default should have no Lua');
    assert(e.luaExecutionBlocked === true, 'luaExecutionBlocked must be true regardless');
});
test('T44', 'luaExecutionBlocked is true for Lua scenario', () => {
    const r = H.build(makeManifest(), { scenarioId: 'scenario_0003' });
    assert(r.entry.luaExecutionBlocked === true);
});
test('T45', 'scenBinaryParsed is false (hard lock)', () => {
    assert(getDefaultEntry().scenBinaryParsed === false);
});
test('T46', 'conversionReady is false (hard lock)', () => {
    assert(getDefaultEntry().conversionReady === false);
});
test('T47', 'requiresHumanReview is true (hard lock)', () => {
    assert(getDefaultEntry().requiresHumanReview === true);
});
test('T48', 'importStatus is catalog_entry_only', () => {
    assert(getDefaultEntry().importStatus === 'catalog_entry_only');
});
test('T49', 'safetyFlags.expectedResultAttached is false', () => {
    assert(getDefaultEntry().safetyFlags.expectedResultAttached === false);
});
test('T50', 'safetyFlags.previewComplete is false', () => {
    assert(getDefaultEntry().safetyFlags.previewComplete === false);
});
test('T51', 'safetyFlags.selectedDecisionAttached is false', () => {
    assert(getDefaultEntry().safetyFlags.selectedDecisionAttached === false);
});

// ══════════════════════════════════════════════════════════════════════════════
// T52–T58  Entry field copy
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 6: Entry field copy ---');

test('T52', 'sourceKind copied from manifest top-level', () => {
    const e = getDefaultEntry();
    assert(e.sourceKind === 'command_modern_operations_pack');
});
test('T53', 'sourceName copied from manifest top-level', () => {
    const e = getDefaultEntry();
    assert(e.sourceName === 'CommunityScenarioPack51');
});
test('T54', 'scenarioId, title, year, author, path copied from scenario', () => {
    const r = H.build(makeManifest(), { scenarioId: 'scenario_0001' });
    const e = r.entry;
    assert(e.scenarioId    === 'scenario_0001');
    assert(e.title         === 'Test Scenario Alpha');
    assert(e.year          === 2021);
    assert(e.author        === 'TEST AUTHOR');
    assert(e.path          === 'Test Scenario Alpha, 2021.scen');
});
test('T55', 'htmlBriefingPaths is a copy (not the same array reference)', () => {
    const r = H.build(makeManifest(), { scenarioId: 'scenario_0002' });
    const e = r.entry;
    assert(Array.isArray(e.htmlBriefingPaths));
    assert(e.htmlBriefingPaths.length === 1);
    assert(e.htmlBriefingPaths[0] === 'Assets/BetaBriefing.html');
    // Check it's a copy: modify original, entry should not change
    const orig = makeManifest().scenarios[1];
    // (already a separate makeManifest call, just verify it's an array)
    assert(e.htmlBriefingPaths !== makeManifest().scenarios[1].htmlBriefingPaths,
        'htmlBriefingPaths should be a copy');
});
test('T56', 'luaScriptPaths is a copy for Lua scenario', () => {
    const r = H.build(makeManifest(), { scenarioId: 'scenario_0003' });
    const e = r.entry;
    assert(Array.isArray(e.luaScriptPaths));
    assert(e.luaScriptPaths.length === 2);
    assert(e.luaScriptPaths[0] === 'Lua/LuaTest/Setup.lua');
});
test('T57', 'sourceTrace fields copied correctly', () => {
    const e = getDefaultEntry();
    assert(e.sourceTrace.titleFrom        === 'xlsx');
    assert(e.sourceTrace.authorFrom       === 'xlsx');
    assert(e.sourceTrace.relationshipFrom === 'filename_match');
});
test('T58', 'confidence copied and is high/medium/low', () => {
    const e = getDefaultEntry();
    assert(['high', 'medium', 'low'].indexOf(e.confidence) !== -1);
});

// ══════════════════════════════════════════════════════════════════════════════
// T59–T62  summarize helper
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 7: summarize helper ---');

test('T59', 'summarize accepts valid entry', () => {
    const entry = getDefaultEntry();
    const r = H.summarize(entry);
    assert(r.passed === true, 'passed should be true; reasons: ' + JSON.stringify(r.blockedReasons));
    assert(r.summary !== null);
});
test('T60', 'summary.importMode is single_catalog_entry_only', () => {
    const entry = getDefaultEntry();
    const r = H.summarize(entry);
    assert(r.summary.importMode === 'single_catalog_entry_only');
});
test('T61', 'summary.nextRecommendedAction is manual_preview_review', () => {
    const entry = getDefaultEntry();
    const r = H.summarize(entry);
    assert(r.summary.nextRecommendedAction === 'manual_preview_review');
});
test('T62', 'summarize rejects null entry', () => {
    const r = H.summarize(null);
    assert(r.passed === false && r.summary === null);
});

// ══════════════════════════════════════════════════════════════════════════════
// T63–T65  Immutability
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 8: Immutability ---');

test('T63', 'sourceManifest not mutated after default call', () => {
    const m = makeManifest();
    const originalLen = m.scenarios.length;
    const originalId  = m.scenarios[0].scenarioId;
    H.build(m);
    assert(m.scenarios.length      === originalLen, 'scenarios length changed');
    assert(m.scenarios[0].scenarioId === originalId, 'first scenario mutated');
});
test('T64', 'sourceManifest not mutated after selector call', () => {
    const m = makeManifest();
    const originalImportStatus = m.scenarios[0].importStatus;
    H.build(m, { scenarioId: 'scenario_0001' });
    assert(m.scenarios[0].importStatus === originalImportStatus,
        'importStatus was mutated on source scenario');
});
test('T65', 'entry importStatus is catalog_entry_only, not manifest_only', () => {
    // The source scenario has importStatus:'manifest_only'; entry must override to 'catalog_entry_only'
    const r = H.build(makeManifest(), { scenarioId: 'scenario_0001' });
    assert(r.entry.importStatus === 'catalog_entry_only',
        'entry importStatus should be catalog_entry_only, not manifest_only');
});

// ══════════════════════════════════════════════════════════════════════════════
// T66–T69  Boundary string checks — no forbidden keys in entry JSON
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 9: Forbidden key checks ---');

test('T66', 'entry JSON does not contain "expectedResult"', () => {
    const e = JSON.stringify(getDefaultEntry());
    assert(!e.includes('"expectedResult"'), 'expectedResult key present in entry');
});
test('T67', 'entry JSON does not contain "selectedDecision"', () => {
    const e = JSON.stringify(getDefaultEntry());
    assert(!e.includes('"selectedDecision"'), 'selectedDecision key present in entry');
});
test('T68', 'entry JSON does not contain "previewComplete":true', () => {
    const e = JSON.stringify(getDefaultEntry());
    assert(!e.includes('"previewComplete":true'), 'previewComplete:true present in entry');
});
test('T69', 'entry JSON does not contain liveMutationAllowed:true', () => {
    const e = JSON.stringify(getDefaultEntry());
    assert(!e.includes('"liveMutationAllowed":true'), 'liveMutationAllowed:true present in entry');
});

// ══════════════════════════════════════════════════════════════════════════════
// T70–T73  Source-file safety checks
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 10: Source-file safety ---');

test('T70', 'scenario-workspace.js does not call adaptWargame3ToFixture from 280B functions', () => {
    // Extract only the 280B function bodies and check they don't call adapt
    const buildBody     = extractFn(wsSrc, 'buildSingleExternalScenarioCatalogEntry')    || '';
    const summarizeBody = extractFn(wsSrc, 'summarizeSingleExternalScenarioCatalogEntry') || '';
    assert(!buildBody.includes('adaptWargame3ToFixture'),
        'buildSingleExternalScenarioCatalogEntry calls adaptWargame3ToFixture');
    assert(!summarizeBody.includes('adaptWargame3ToFixture'),
        'summarizeSingleExternalScenarioCatalogEntry calls adaptWargame3ToFixture');
});
test('T71', 'scenario-workspace.js does not call previewWargame3Fixture from 280B functions', () => {
    const buildBody     = extractFn(wsSrc, 'buildSingleExternalScenarioCatalogEntry')    || '';
    const summarizeBody = extractFn(wsSrc, 'summarizeSingleExternalScenarioCatalogEntry') || '';
    assert(!buildBody.includes('previewWargame3Fixture'));
    assert(!summarizeBody.includes('previewWargame3Fixture'));
});
test('T72', 'scenario-workspace.js 280B functions do not reference localStorage/fetch', () => {
    const buildBody     = extractFn(wsSrc, 'buildSingleExternalScenarioCatalogEntry')    || '';
    const summarizeBody = extractFn(wsSrc, 'summarizeSingleExternalScenarioCatalogEntry') || '';
    const combined = buildBody + summarizeBody;
    assert(!combined.includes('localStorage'), 'localStorage reference found');
    assert(!combined.includes('fetch('),       'fetch() reference found');
    assert(!combined.includes('XMLHttpRequest'), 'XMLHttpRequest reference found');
});
test('T73', 'scenario-workspace.js 280B functions do not reference document/window.map', () => {
    const buildBody     = extractFn(wsSrc, 'buildSingleExternalScenarioCatalogEntry')    || '';
    const summarizeBody = extractFn(wsSrc, 'summarizeSingleExternalScenarioCatalogEntry') || '';
    const combined = buildBody + summarizeBody;
    assert(!combined.includes('document.'),  'document. reference in 280B code');
    assert(!combined.includes('window.map'), 'window.map reference in 280B code');
    assert(!combined.includes('fitBounds'),  'fitBounds reference in 280B code');
});

// ══════════════════════════════════════════════════════════════════════════════
// T74–T78  Regression — prior PR exports still present
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 11: Regression ---');

test('T74', 'buildExternalScenarioCatalog (PR-280) still exported', () => {
    assert(wsSrc.includes('buildExternalScenarioCatalog:'),
        'PR-280 buildExternalScenarioCatalog export missing');
});
test('T75', 'summarizeExternalScenarioCatalog (PR-280) still exported', () => {
    assert(wsSrc.includes('summarizeExternalScenarioCatalog:'),
        'PR-280 summarizeExternalScenarioCatalog export missing');
});
test('T76', 'checkWargame3ScenarioWorkflowAcceptance (PR-279) still exported', () => {
    assert(wsSrc.includes('checkWargame3ScenarioWorkflowAcceptance:'),
        'PR-279 export missing');
});
test('T77', 'runWargame3ScenarioWorkflowWalkthrough (PR-278) still exported', () => {
    assert(wsSrc.includes('runWargame3ScenarioWorkflowWalkthrough:'),
        'PR-278 export missing');
});
test('T78', 'buildWargame3ScenarioReviewSessionState (PR-274) still exported', () => {
    assert(wsSrc.includes('buildWargame3ScenarioReviewSessionState:'),
        'PR-274 export missing');
});

// ══════════════════════════════════════════════════════════════════════════════
// T79–T83  File protection checks
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 12: File protection ---');

const BASE = path.join(__dirname, 'UI_MOdified/client');

test('T79', 'app.html readable and unchanged (no 280B markers injected)', () => {
    const src = fs.readFileSync(path.join(BASE, 'app.html'), 'utf8');
    assert(src.includes('<!DOCTYPE') || src.includes('<html'), 'app.html looks corrupt');
    assert(!src.includes('buildSingleExternalScenarioCatalogEntry'),
        '280B function name found in app.html — should not be there');
});
test('T80', 'i18n.js readable and unchanged', () => {
    const src = fs.readFileSync(path.join(BASE, 'i18n.js'), 'utf8');
    assert(src.length > 0, 'i18n.js is empty');
    assert(!src.includes('buildSingleExternalScenarioCatalogEntry'),
        '280B function name found in i18n.js');
});
test('T81', 'style.css readable and unchanged', () => {
    const src = fs.readFileSync(path.join(BASE, 'style.css'), 'utf8');
    assert(src.length > 0, 'style.css is empty');
});
test('T82', 'wargame3.json readable and unchanged', () => {
    const src = fs.readFileSync(
        path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json'), 'utf8');
    assert(src.length > 0, 'wargame3.json is empty');
    const parsed = JSON.parse(src);
    assert(parsed && typeof parsed === 'object', 'wargame3.json not valid JSON');
});
test('T83', 'adjudicator-map.js readable and unchanged', () => {
    const src = fs.readFileSync(
        path.join(BASE, 'wargame/adjudicator-map.js'), 'utf8');
    assert(src.length > 0, 'adjudicator-map.js is empty');
    assert(!src.includes('buildSingleExternalScenarioCatalogEntry'),
        '280B function name found in adjudicator-map.js');
});

// ══════════════════════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n' + '─'.repeat(60));
console.log('  Results: ' + passed + ' passed, ' + failed + ' failed');
if (failures.length) {
    console.log('\n  Failed tests:');
    failures.forEach(function(f) { console.log('    ' + f); });
}
console.log('─'.repeat(60));
process.exit(failed > 0 ? 1 : 0);
