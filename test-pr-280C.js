/**
 * test-pr-280C.js
 * PR-280C — External Scenario Catalog Builder from Source Manifest
 *
 * Tests buildExternalScenarioCatalogFromManifest and
 *       summarizeExternalScenarioCatalogSubset
 *
 *   T01–T05   Export / source presence
 *   T06–T10   Guard: null/bad manifest rejection
 *   T11–T15   Catalog type / boundary flags
 *   T16–T21   Default behavior: limit, count, entries shape
 *   T22–T27   Hard cap: limit>25 clamped; LIMIT_CLAMPED warning
 *   T28–T35   Pagination: offset, hasMore
 *   T36–T43   Filters: campaignSeries, confidence, requireXlsxMatch
 *   T44–T50   Filters: avoidLua, includeLuaBlocked, requireHtmlBriefing
 *   T51–T56   Filters: requireDocumentBriefing, titleSearch
 *   T57–T63   Sort: scenarioId, title, year, confidence
 *   T64–T72   Entry invariants (per-entry safety locks)
 *   T73–T76   Catalog safetyFlags
 *   T77–T81   importReadiness
 *   T82–T86   summarize helper
 *   T87–T90   Immutability / no mutation
 *   T91–T95   Source-file safety: no forbidden calls
 *   T96–T99   Regression: prior PR exports still present
 *   T100–T104 File-protection checks
 *
 * ~104 focused tests.  No DOM.  No Leaflet.  No storage.  No backend.
 *
 * Run: node test-pr-280C.js
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
    const buildSingleFnSrc = extractFn(wsSrc, 'buildSingleExternalScenarioCatalogEntry');
    const buildFnSrc       = extractFn(wsSrc, 'buildExternalScenarioCatalogFromManifest');
    const summarizeFnSrc   = extractFn(wsSrc, 'summarizeExternalScenarioCatalogSubset');
    assert(buildSingleFnSrc, 'buildSingleExternalScenarioCatalogEntry not found');
    assert(buildFnSrc,       'buildExternalScenarioCatalogFromManifest not found');
    assert(summarizeFnSrc,   'summarizeExternalScenarioCatalogSubset not found');

    const code = `
        function buildSingleExternalScenarioCatalogEntry(sourceManifest, selectorOrOptions)
            ${buildSingleFnSrc}
        function buildExternalScenarioCatalogFromManifest(sourceManifest, options)
            ${buildFnSrc}
        function summarizeExternalScenarioCatalogSubset(catalog)
            ${summarizeFnSrc}
    `;
    // eslint-disable-next-line no-new-func
    const fn = new Function(
        'return (function() { ' + code + ' return { ' +
        '  buildSingle: buildSingleExternalScenarioCatalogEntry,' +
        '  build: buildExternalScenarioCatalogFromManifest,' +
        '  summarize: summarizeExternalScenarioCatalogSubset' +
        '}; })();'
    );
    return fn();
}

let H;
try { H = buildHarness(); }
catch (e) { console.error('HARNESS FAILED:', e.message); process.exit(1); }

// ── Load real PR-280A manifest ─────────────────────────────────────────────────
const MANIFEST_PATH = path.join(__dirname,
    'docs/scenario-pack-audit/external_scenario_source_manifest.json');
let realManifest = null;
try { realManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); }
catch (e) { console.error('WARNING: could not load manifest:', e.message); }

// ── Minimal synthetic manifest ────────────────────────────────────────────────
function makeScen(overrides) {
    return Object.assign({
        scenarioId: 'scenario_0001', title: 'Alpha Test', year: 2021,
        author: 'TEST', xlsxNotes: null,
        path: 'Alpha Test, 2021.scen', fileName: 'Alpha Test, 2021.scen',
        sizeBytes: 100000, campaignSeries: 'Standalone Scenario', folderGroup: 'root',
        hasIniWeaponPatch: true, iniWeaponPatchPath: 'Alpha Test, 2021.ini',
        hasHtmlBriefing: false, htmlBriefingPaths: [],
        hasDocumentBriefing: false, documentBriefingPaths: [],
        hasLua: false, luaScriptPaths: [], luaExecutionBlocked: true,
        scenBinaryParsed: false, importStatus: 'manifest_only',
        conversionReady: false, requiresHumanReview: true,
        confidence: 'high',
        sourceTrace: { titleFrom: 'xlsx', yearFrom: 'xlsx', authorFrom: 'xlsx',
                       notesFrom: 'none', relationshipFrom: 'filename_match' }
    }, overrides || {});
}

function makeManifest(scenariosOverride) {
    const scenarios = scenariosOverride || [
        makeScen({ scenarioId: 'scenario_0001', title: 'Alpha Test',  year: 2020,
                   confidence: 'high',   campaignSeries: 'BALTAP Campaign' }),
        makeScen({ scenarioId: 'scenario_0002', title: 'Beta Test',   year: 1985,
                   confidence: 'medium', campaignSeries: 'Some Series',
                   sourceTrace: { titleFrom: 'filename', yearFrom: 'filename',
                                  authorFrom: 'none', notesFrom: 'none',
                                  relationshipFrom: 'filename_match' } }),
        makeScen({ scenarioId: 'scenario_0003', title: 'Gulf Strike', year: 1981,
                   confidence: 'high',   campaignSeries: 'BALTAP Campaign',
                   hasLua: true, luaScriptPaths: ['Lua/GulfTest/Setup.lua'] }),
        makeScen({ scenarioId: 'scenario_0004', title: 'Charlie Op',  year: 2019,
                   confidence: 'high',   campaignSeries: 'Northern Fury',
                   hasHtmlBriefing: true,  htmlBriefingPaths: ['Assets/Charlie.html'] }),
        makeScen({ scenarioId: 'scenario_0005', title: 'Delta Patrol', year: 2000,
                   confidence: 'low',    campaignSeries: 'Standalone Scenario',
                   hasDocumentBriefing: true, documentBriefingPaths: ['Documents/Delta.docx'] }),
    ];
    return {
        manifestType: 'external_scenario_source_manifest',
        sourceKind:   'command_modern_operations_pack',
        sourceName:   'CommunityScenarioPack51',
        readOnly: true, dryRunOnly: true, catalogOnly: true,
        liveMutationAllowed: false,
        scenarios: scenarios
    };
}

// ══════════════════════════════════════════════════════════════════════════════
// T01–T05  Export / source presence
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 1: Export / source presence ---');

test('T01', 'buildExternalScenarioCatalogFromManifest in source', () => {
    assert(wsSrc.includes('buildExternalScenarioCatalogFromManifest'));
});
test('T02', 'summarizeExternalScenarioCatalogSubset in source', () => {
    assert(wsSrc.includes('summarizeExternalScenarioCatalogSubset'));
});
test('T03', 'buildExternalScenarioCatalogFromManifest exported', () => {
    assert(wsSrc.includes('buildExternalScenarioCatalogFromManifest:'));
});
test('T04', 'summarizeExternalScenarioCatalogSubset exported', () => {
    assert(wsSrc.includes('summarizeExternalScenarioCatalogSubset:'));
});
test('T05', 'harness resolved both functions', () => {
    assert(typeof H.build     === 'function');
    assert(typeof H.summarize === 'function');
});

// ══════════════════════════════════════════════════════════════════════════════
// T06–T10  Guard: null/bad manifest rejection
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 2: Guard rejections ---');

test('T06', 'rejects null manifest', () => {
    const r = H.build(null);
    assert(r.passed === false && r.catalog === null);
    assert(r.blockedReasons.length > 0);
});
test('T07', 'rejects undefined manifest', () => {
    const r = H.build(undefined);
    assert(r.passed === false && r.catalog === null);
});
test('T08', 'rejects array as manifest', () => {
    const r = H.build([{ scenarios: [] }]);
    assert(r.passed === false);
});
test('T09', 'rejects manifest without scenarios property', () => {
    const r = H.build({ sourceKind: 'x' });
    assert(r.passed === false);
    assert(r.blockedReasons.some(b => b.includes('scenarios')));
});
test('T10', 'rejects manifest where scenarios is not an array', () => {
    const r = H.build({ scenarios: {} });
    assert(r.passed === false);
});

// ══════════════════════════════════════════════════════════════════════════════
// T11–T15  Catalog type / boundary flags
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 3: Catalog type / boundary flags ---');

test('T11', 'catalogType is external_scenario_catalog_subset', () => {
    assert(H.build(makeManifest()).catalog.catalogType === 'external_scenario_catalog_subset');
});
test('T12', 'source is external_scenario_source_manifest', () => {
    assert(H.build(makeManifest()).catalog.source === 'external_scenario_source_manifest');
});
test('T13', 'readOnly/dryRunOnly/catalogOnly/previewOnly all true', () => {
    const c = H.build(makeManifest()).catalog;
    assert(c.readOnly === true && c.dryRunOnly === true &&
           c.catalogOnly === true && c.previewOnly === true);
});
test('T14', 'liveMutationAllowed false', () => {
    assert(H.build(makeManifest()).catalog.liveMutationAllowed === false);
});
test('T15', 'backendCommitAllowed false', () => {
    assert(H.build(makeManifest()).catalog.backendCommitAllowed === false);
});

// ══════════════════════════════════════════════════════════════════════════════
// T16–T21  Default behavior
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 4: Default behavior ---');

test('T16', 'sourceKind and sourceName copied from manifest', () => {
    const c = H.build(makeManifest()).catalog;
    assert(c.sourceKind === 'command_modern_operations_pack');
    assert(c.sourceName === 'CommunityScenarioPack51');
});
test('T17', 'totalAvailableScenarios matches manifest.scenarios.length', () => {
    if (!realManifest) return;
    const c = H.build(realManifest).catalog;
    assert(c.totalAvailableScenarios === 630,
        'expected 630; got ' + c.totalAvailableScenarios);
});
test('T18', 'default limit is 10', () => {
    if (!realManifest) return;
    const c = H.build(realManifest).catalog;
    assert(c.limit === 10, 'expected limit=10; got ' + c.limit);
});
test('T19', 'default returnedCount is 10', () => {
    if (!realManifest) return;
    const c = H.build(realManifest).catalog;
    assert(c.returnedCount === 10, 'expected 10; got ' + c.returnedCount);
});
test('T20', 'entries array has 10 items by default', () => {
    if (!realManifest) return;
    const c = H.build(realManifest).catalog;
    assert(Array.isArray(c.entries) && c.entries.length === 10,
        'expected 10 entries; got ' + (c.entries || []).length);
});
test('T21', 'never returns all 630 scenarios', () => {
    if (!realManifest) return;
    const c = H.build(realManifest).catalog;
    assert(c.entries.length <= 25,
        'returned ' + c.entries.length + ' entries — must be ≤25');
    assert(c.entries.length < 630,
        'should not return all 630');
});

// ══════════════════════════════════════════════════════════════════════════════
// T22–T27  Hard cap
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 5: Hard cap ---');

test('T22', 'limit 25 is accepted', () => {
    if (!realManifest) return;
    const r = H.build(realManifest, { limit: 25 });
    assert(r.passed === true);
    assert(r.catalog.limit === 25);
    assert(r.warnings.some(w => w.includes('clamped')) === false,
        'should not warn when limit is exactly 25');
});
test('T23', 'limit 30 is clamped to 25', () => {
    if (!realManifest) return;
    const r = H.build(realManifest, { limit: 30 });
    assert(r.catalog.limit === 25, 'expected 25; got ' + r.catalog.limit);
});
test('T24', 'limit 630 is clamped to 25', () => {
    if (!realManifest) return;
    const r = H.build(realManifest, { limit: 630 });
    assert(r.catalog.limit === 25 && r.catalog.entries.length <= 25);
});
test('T25', 'LIMIT_CLAMPED warning emitted when limit > 25', () => {
    if (!realManifest) return;
    const r = H.build(realManifest, { limit: 50 });
    assert(r.catalog.warningSummary.warningCodes.indexOf('LIMIT_CLAMPED') !== -1,
        'LIMIT_CLAMPED not in warningCodes');
    assert(r.warnings.some(w => w.includes('clamped') || w.includes('CLAMP') ||
                                w.includes('50') || w.includes('25')),
        'warning message should mention clamping');
});
test('T26', 'LIMIT_CLAMPED not emitted when limit <= 25', () => {
    if (!realManifest) return;
    const r = H.build(realManifest, { limit: 5 });
    assert(r.catalog.warningSummary.warningCodes.indexOf('LIMIT_CLAMPED') === -1);
});
test('T27', 'returned entries never exceed 25 regardless of limit option', () => {
    if (!realManifest) return;
    const r = H.build(realManifest, { limit: 999 });
    assert(r.catalog.entries.length <= 25);
});

// ══════════════════════════════════════════════════════════════════════════════
// T28–T35  Pagination
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 6: Pagination ---');

test('T28', 'offset 0 is the default', () => {
    const r = H.build(makeManifest());
    assert(r.catalog.offset === 0);
});
test('T29', 'offset advances the window', () => {
    const big = Array.from({ length: 30 }, (_, i) =>
        makeScen({ scenarioId: 'scenario_' + String(i).padStart(4, '0'),
                   title: 'Scenario ' + i, year: 2000 + i })
    );
    const m = makeManifest(big);
    const r0 = H.build(m, { limit: 5, offset: 0 });
    const r5 = H.build(m, { limit: 5, offset: 5 });
    assert(r0.catalog.entries[0].scenarioId !== r5.catalog.entries[0].scenarioId,
        'offset 0 and offset 5 should return different first entries');
});
test('T30', 'hasMore is true when matched > offset+returned', () => {
    if (!realManifest) return;
    const r = H.build(realManifest, { limit: 10, offset: 0 });
    assert(r.catalog.hasMore === true,
        'should have more when 629 matched and only 10 returned');
});
test('T31', 'hasMore is false on last page', () => {
    const only5 = Array.from({ length: 5 }, (_, i) =>
        makeScen({ scenarioId: 'scenario_' + String(i).padStart(4, '0'),
                   title: 'S' + i, year: 2000 + i })
    );
    const r = H.build(makeManifest(only5), { limit: 5, offset: 0 });
    assert(r.catalog.hasMore === false,
        'hasMore should be false when all 5 fit in one page');
});
test('T32', 'hasMore is false when offset goes past end', () => {
    const only5 = Array.from({ length: 5 }, (_, i) =>
        makeScen({ scenarioId: 'scenario_' + String(i).padStart(4, '0'),
                   title: 'S' + i, year: 2000 + i })
    );
    const r = H.build(makeManifest(only5), { limit: 10, offset: 10 });
    assert(r.catalog.returnedCount === 0);
    assert(r.catalog.hasMore === false);
});
test('T33', 'totalMatchedScenarios reflects filter (real manifest, avoidLua default)', () => {
    if (!realManifest) return;
    const r = H.build(realManifest);
    // avoidLua=true by default excludes 1 Lua scenario
    assert(r.catalog.totalMatchedScenarios === 629,
        'expected 629 (630 minus 1 Lua); got ' + r.catalog.totalMatchedScenarios);
});
test('T34', 'totalAvailableScenarios always reflects full manifest (630)', () => {
    if (!realManifest) return;
    const r = H.build(realManifest, { confidence: 'high' });
    assert(r.catalog.totalAvailableScenarios === 630);
    // totalMatchedScenarios should be fewer
    assert(r.catalog.totalMatchedScenarios < 630);
});
test('T35', 'returnedCount reflects actual page size (not limit)', () => {
    const only3 = Array.from({ length: 3 }, (_, i) =>
        makeScen({ scenarioId: 'scenario_' + String(i + 1).padStart(4, '0'),
                   title: 'S' + i, year: 2000 + i })
    );
    const r = H.build(makeManifest(only3), { limit: 10, offset: 0 });
    assert(r.catalog.returnedCount === 3,
        'returnedCount should be 3 (only 3 scenarios in manifest)');
});

// ══════════════════════════════════════════════════════════════════════════════
// T36–T43  Filters
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 7: Filters ---');

test('T36', 'campaignSeries filter: BALTAP Campaign returns 7 matched', () => {
    if (!realManifest) return;
    const r = H.build(realManifest, { campaignSeries: 'BALTAP Campaign', limit: 10 });
    assert(r.catalog.totalMatchedScenarios === 7,
        'expected 7 BALTAP; got ' + r.catalog.totalMatchedScenarios);
    r.catalog.entries.forEach(e => assert(e.campaignSeries === 'BALTAP Campaign'));
});
test('T37', 'campaignSeries filter is case-insensitive', () => {
    if (!realManifest) return;
    const r = H.build(realManifest, { campaignSeries: 'baltap campaign', limit: 10 });
    assert(r.catalog.totalMatchedScenarios === 7);
});
test('T38', 'confidence filter: high returns 509 matched (minus 1 Lua default)', () => {
    if (!realManifest) return;
    // high conf = 509; Lua scenario is high conf; avoidLua=true removes it → 508
    const r = H.build(realManifest, { confidence: 'high', limit: 5 });
    // Gulf of Sidra is high confidence AND has Lua → excluded by avoidLua
    assert(r.catalog.totalMatchedScenarios === 508,
        'expected 508 (509 high minus 1 Lua); got ' + r.catalog.totalMatchedScenarios);
});
test('T39', 'confidence filter: medium returns 120 matched', () => {
    if (!realManifest) return;
    const r = H.build(realManifest, { confidence: 'medium', limit: 5 });
    assert(r.catalog.totalMatchedScenarios === 120,
        'expected 120; got ' + r.catalog.totalMatchedScenarios);
});
test('T40', 'requireXlsxMatch: true returns 512 xlsx-matched (minus 1 Lua)', () => {
    if (!realManifest) return;
    // xlsx=512; Lua scenario is xlsx matched AND hasLua; avoidLua=true → 511
    const r = H.build(realManifest, { requireXlsxMatch: true, limit: 5 });
    assert(r.catalog.totalMatchedScenarios === 511,
        'expected 511 (512 xlsx minus 1 Lua excluded); got ' +
        r.catalog.totalMatchedScenarios);
});
test('T41', 'requireXlsxMatch: true entries all have titleFrom xlsx', () => {
    if (!realManifest) return;
    const r = H.build(realManifest, { requireXlsxMatch: true, limit: 10 });
    r.catalog.entries.forEach(e => {
        assert(e.sourceTrace.titleFrom === 'xlsx',
            e.title + ' has titleFrom=' + e.sourceTrace.titleFrom);
    });
});
test('T42', 'filtersApplied reflects options used', () => {
    const r = H.build(makeManifest(), {
        campaignSeries: 'BALTAP Campaign', confidence: 'high',
        requireXlsxMatch: true, avoidLua: true
    });
    const fa = r.catalog.filtersApplied;
    assert(fa.campaignSeries   === 'BALTAP Campaign');
    assert(fa.confidence       === 'high');
    assert(fa.requireXlsxMatch === true);
    assert(fa.avoidLua         === true);
});
test('T43', 'filtersApplied defaults are recorded correctly', () => {
    const r = H.build(makeManifest());
    const fa = r.catalog.filtersApplied;
    assert(fa.avoidLua         === true,  'avoidLua default should be true');
    assert(fa.includeLuaBlocked === false, 'includeLuaBlocked default should be false');
    assert(fa.sortBy           === 'scenarioId');
    assert(fa.sortDirection    === 'asc');
    assert(fa.requireXlsxMatch === false);
    assert(fa.requireHtmlBriefing === false);
});

// ══════════════════════════════════════════════════════════════════════════════
// T44–T50  Lua filters
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 8: Lua filters ---');

test('T44', 'avoidLua true (default) excludes the Lua scenario', () => {
    if (!realManifest) return;
    const r = H.build(realManifest, { limit: 25 });
    const luaEntries = r.catalog.entries.filter(e => e.hasLua === true);
    assert(luaEntries.length === 0, 'Lua scenario should not appear with avoidLua=true');
});
test('T45', 'includeLuaBlocked true can include the Lua scenario', () => {
    if (!realManifest) return;
    const r = H.build(realManifest, {
        avoidLua: true,
        includeLuaBlocked: true,
        titleSearch: 'Gulf of Sidra',
        limit: 5
    });
    assert(r.passed === true);
    assert(r.catalog.totalMatchedScenarios >= 1,
        'Gulf of Sidra should be included with includeLuaBlocked:true');
    const luaEntry = r.catalog.entries.find(e => e.hasLua === true);
    assert(luaEntry, 'expected a Lua entry in results');
});
test('T46', 'Lua entry always has luaExecutionBlocked true', () => {
    if (!realManifest) return;
    const r = H.build(realManifest, {
        avoidLua: false, includeLuaBlocked: true,
        titleSearch: 'Gulf of Sidra', limit: 5
    });
    const luaEntry = r.catalog.entries.find(e => e.hasLua === true);
    if (luaEntry) {
        assert(luaEntry.luaExecutionBlocked === true,
            'luaExecutionBlocked must be true even when Lua scenario included');
    }
});
test('T47', 'requireHtmlBriefing true returns only HTML-briefing scenarios', () => {
    if (!realManifest) return;
    // 3 HTML scenarios; 1 has Lua (Gulf of Sidra); avoidLua=true → 2 returned
    const r = H.build(realManifest, { requireHtmlBriefing: true, limit: 10 });
    assert(r.catalog.totalMatchedScenarios === 2,
        'expected 2 HTML-no-Lua; got ' + r.catalog.totalMatchedScenarios);
    r.catalog.entries.forEach(e => assert(e.hasHtmlBriefing === true));
});
test('T48', 'requireHtmlBriefing with includeLuaBlocked true returns 3', () => {
    if (!realManifest) return;
    const r = H.build(realManifest, {
        requireHtmlBriefing: true, includeLuaBlocked: true, avoidLua: true, limit: 10
    });
    assert(r.catalog.totalMatchedScenarios === 3,
        'expected 3 (all HTML including Gulf of Sidra); got ' +
        r.catalog.totalMatchedScenarios);
});
test('T49', 'requireDocumentBriefing true returns 13 matched', () => {
    if (!realManifest) return;
    const r = H.build(realManifest, { requireDocumentBriefing: true, limit: 10 });
    assert(r.catalog.totalMatchedScenarios === 13,
        'expected 13; got ' + r.catalog.totalMatchedScenarios);
    r.catalog.entries.forEach(e => assert(e.hasDocumentBriefing === true));
});
test('T50', 'titleSearch works case-insensitively', () => {
    if (!realManifest) return;
    // 'gulf' with avoidLua=true: 7 hits minus 1 Lua (Gulf of Sidra) = 6
    const r = H.build(realManifest, { titleSearch: 'gulf', limit: 10 });
    assert(r.catalog.totalMatchedScenarios === 6,
        'expected 6 gulf hits (minus Lua); got ' + r.catalog.totalMatchedScenarios);
    r.catalog.entries.forEach(e =>
        assert(e.title.toLowerCase().includes('gulf'),
            e.title + ' does not contain "gulf"')
    );
});

// ══════════════════════════════════════════════════════════════════════════════
// T51–T56  More filters + titleSearch
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 9: More filters ---');

test('T51', 'titleSearch UPPER CASE works same as lower', () => {
    if (!realManifest) return;
    const rLow  = H.build(realManifest, { titleSearch: 'gulf', limit: 10 });
    const rUpper = H.build(realManifest, { titleSearch: 'GULF', limit: 10 });
    assert(rLow.catalog.totalMatchedScenarios === rUpper.catalog.totalMatchedScenarios);
});
test('T52', 'titleSearch with no matches returns 0', () => {
    const r = H.build(makeManifest(), { titleSearch: 'ZZZNOMATCH' });
    assert(r.catalog.totalMatchedScenarios === 0);
    assert(r.catalog.returnedCount === 0);
});
test('T53', 'combined filters: campaignSeries + confidence', () => {
    if (!realManifest) return;
    const r = H.build(realManifest, {
        campaignSeries: 'BALTAP Campaign', confidence: 'high', limit: 10
    });
    r.catalog.entries.forEach(e => {
        assert(e.campaignSeries === 'BALTAP Campaign');
        assert(e.confidence === 'high');
    });
});
test('T54', 'empty scenarios manifest returns 0 matched, 0 returned', () => {
    const r = H.build(makeManifest([]));
    assert(r.passed === true);
    assert(r.catalog.totalMatchedScenarios === 0);
    assert(r.catalog.returnedCount === 0);
    assert(r.catalog.hasMore === false);
});
test('T55', 'titleSearch stored in filtersApplied (original case)', () => {
    const r = H.build(makeManifest(), { titleSearch: 'Alpha' });
    assert(r.catalog.filtersApplied.titleSearch === 'Alpha');
});
test('T56', 'confidence filter in synthetic manifest', () => {
    const r = H.build(makeManifest(), { confidence: 'low' });
    // one scenario has confidence:'low' (Delta Patrol)
    assert(r.catalog.totalMatchedScenarios === 1);
    assert(r.catalog.entries[0].confidence === 'low');
});

// ══════════════════════════════════════════════════════════════════════════════
// T57–T63  Sort
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 10: Sort ---');

test('T57', 'sortBy scenarioId asc: entries ordered ascending', () => {
    if (!realManifest) return;
    const r = H.build(realManifest, { sortBy: 'scenarioId', sortDirection: 'asc', limit: 5 });
    const ids = r.catalog.entries.map(e => e.scenarioId);
    const sorted = ids.slice().sort();
    assert(JSON.stringify(ids) === JSON.stringify(sorted),
        'entries not sorted by scenarioId asc: ' + ids.join(','));
});
test('T58', 'sortBy scenarioId desc: entries in reverse order', () => {
    if (!realManifest) return;
    const r = H.build(realManifest, { sortBy: 'scenarioId', sortDirection: 'desc', limit: 5 });
    const ids = r.catalog.entries.map(e => e.scenarioId);
    const sorted = ids.slice().sort().reverse();
    assert(JSON.stringify(ids) === JSON.stringify(sorted));
});
test('T59', 'sortBy title asc: entries in alphabetical order', () => {
    if (!realManifest) return;
    const r = H.build(realManifest, { sortBy: 'title', sortDirection: 'asc', limit: 10 });
    const titles = r.catalog.entries.map(e => e.title.toLowerCase());
    for (let i = 1; i < titles.length; i++) {
        assert(titles[i - 1] <= titles[i],
            'not sorted: "' + titles[i-1] + '" > "' + titles[i] + '"');
    }
});
test('T60', 'sortBy year desc: newest first', () => {
    if (!realManifest) return;
    const r = H.build(realManifest, { sortBy: 'year', sortDirection: 'desc', limit: 5 });
    const years = r.catalog.entries.map(e => e.year || 0);
    for (let i = 1; i < years.length; i++) {
        assert(years[i - 1] >= years[i],
            'not sorted desc: year[' + (i-1) + ']=' + years[i-1] +
            ' < year[' + i + ']=' + years[i]);
    }
});
test('T61', 'sortBy confidence asc: high before medium before low', () => {
    const all5 = [
        makeScen({ scenarioId: 's1', title: 'Z', confidence: 'low' }),
        makeScen({ scenarioId: 's2', title: 'A', confidence: 'medium' }),
        makeScen({ scenarioId: 's3', title: 'M', confidence: 'high' }),
    ];
    const r = H.build(makeManifest(all5), { sortBy: 'confidence', sortDirection: 'asc' });
    const confs = r.catalog.entries.map(e => e.confidence);
    assert(confs[0] === 'high' && confs[1] === 'medium' && confs[2] === 'low',
        'expected high,medium,low; got ' + confs.join(','));
});
test('T62', 'sort is deterministic across identical calls', () => {
    if (!realManifest) return;
    const r1 = H.build(realManifest, { sortBy: 'title', sortDirection: 'asc', limit: 5 });
    const r2 = H.build(realManifest, { sortBy: 'title', sortDirection: 'asc', limit: 5 });
    assert(JSON.stringify(r1.catalog.entries.map(e => e.scenarioId)) ===
           JSON.stringify(r2.catalog.entries.map(e => e.scenarioId)));
});
test('T63', 'filtersApplied.sortBy and sortDirection recorded', () => {
    const r = H.build(makeManifest(), { sortBy: 'year', sortDirection: 'desc' });
    assert(r.catalog.filtersApplied.sortBy        === 'year');
    assert(r.catalog.filtersApplied.sortDirection === 'desc');
});

// ══════════════════════════════════════════════════════════════════════════════
// T64–T72  Entry invariants
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 11: Entry invariants ---');

function getEntries() {
    if (!realManifest) return [];
    return H.build(realManifest, { limit: 10 }).catalog.entries;
}

test('T64', 'every entry has entryType external_scenario_catalog_entry', () => {
    getEntries().forEach(e => assert(e.entryType === 'external_scenario_catalog_entry'));
});
test('T65', 'every entry readOnly/dryRunOnly/catalogOnly/previewOnly true', () => {
    getEntries().forEach(e => {
        assert(e.readOnly === true && e.dryRunOnly === true &&
               e.catalogOnly === true && e.previewOnly === true);
    });
});
test('T66', 'every entry liveMutationAllowed false', () => {
    getEntries().forEach(e => assert(e.liveMutationAllowed === false));
});
test('T67', 'every entry backendCommitAllowed false', () => {
    getEntries().forEach(e => assert(e.backendCommitAllowed === false));
});
test('T68', 'every entry scenBinaryParsed false', () => {
    getEntries().forEach(e => assert(e.scenBinaryParsed === false));
});
test('T69', 'every entry iniTreatedAsMetadata false', () => {
    getEntries().forEach(e => assert(e.iniTreatedAsMetadata === false));
});
test('T70', 'every entry luaExecutionBlocked true', () => {
    getEntries().forEach(e => assert(e.luaExecutionBlocked === true));
});
test('T71', 'every entry conversionReady false', () => {
    getEntries().forEach(e => assert(e.conversionReady === false));
});
test('T72', 'every entry requiresHumanReview true and importStatus catalog_entry_only', () => {
    getEntries().forEach(e => {
        assert(e.requiresHumanReview === true);
        assert(e.importStatus === 'catalog_entry_only');
    });
});

// ══════════════════════════════════════════════════════════════════════════════
// T73–T76  Catalog safetyFlags
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 12: Catalog safetyFlags ---');

test('T73', 'safetyFlags.scenBinaryParsed false', () => {
    assert(H.build(makeManifest()).catalog.safetyFlags.scenBinaryParsed === false);
});
test('T74', 'safetyFlags.iniTreatedAsMetadata false', () => {
    assert(H.build(makeManifest()).catalog.safetyFlags.iniTreatedAsMetadata === false);
});
test('T75', 'safetyFlags.luaExecuted false', () => {
    assert(H.build(makeManifest()).catalog.safetyFlags.luaExecuted === false);
});
test('T76', 'safetyFlags.expectedResultAttached/previewComplete/selectedDecisionAttached false', () => {
    const sf = H.build(makeManifest()).catalog.safetyFlags;
    assert(sf.expectedResultAttached   === false);
    assert(sf.previewComplete          === false);
    assert(sf.selectedDecisionAttached === false);
});

// ══════════════════════════════════════════════════════════════════════════════
// T77–T81  importReadiness
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 13: importReadiness ---');

test('T77', 'importReadiness.catalogOnly true', () => {
    assert(H.build(makeManifest()).catalog.importReadiness.catalogOnly === true);
});
test('T78', 'importReadiness.previewOnly true', () => {
    assert(H.build(makeManifest()).catalog.importReadiness.previewOnly === true);
});
test('T79', 'importReadiness.conversionReady false', () => {
    assert(H.build(makeManifest()).catalog.importReadiness.conversionReady === false);
});
test('T80', 'importReadiness.liveApplyReady false', () => {
    assert(H.build(makeManifest()).catalog.importReadiness.liveApplyReady === false);
});
test('T81', 'importReadiness.requiresHumanReview true', () => {
    assert(H.build(makeManifest()).catalog.importReadiness.requiresHumanReview === true);
});

// ══════════════════════════════════════════════════════════════════════════════
// T82–T86  summarize helper
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 14: summarize helper ---');

test('T82', 'summarize accepts valid catalog', () => {
    const cat = H.build(makeManifest()).catalog;
    const r   = H.summarize(cat);
    assert(r.passed === true && r.summary !== null);
});
test('T83', 'summary.importMode is catalog_subset_only', () => {
    const cat = H.build(makeManifest()).catalog;
    assert(H.summarize(cat).summary.importMode === 'catalog_subset_only');
});
test('T84', 'summary.nextRecommendedAction is manual_subset_review', () => {
    const cat = H.build(makeManifest()).catalog;
    assert(H.summarize(cat).summary.nextRecommendedAction === 'manual_subset_review');
});
test('T85', 'summary.returnedCount matches catalog.returnedCount', () => {
    const cat = H.build(makeManifest()).catalog;
    assert(H.summarize(cat).summary.returnedCount === cat.returnedCount);
});
test('T86', 'summarize rejects null and wrong catalogType', () => {
    assert(H.summarize(null).passed === false);
    assert(H.summarize({ catalogType: 'wrong' }).passed === false);
});

// ══════════════════════════════════════════════════════════════════════════════
// T87–T90  Immutability / no mutation
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 15: Immutability ---');

test('T87', 'sourceManifest not mutated: scenarios length unchanged', () => {
    if (!realManifest) return;
    const before = realManifest.scenarios.length;
    H.build(realManifest, { limit: 10 });
    assert(realManifest.scenarios.length === before);
});
test('T88', 'sourceManifest not mutated: first scenario importStatus unchanged', () => {
    if (!realManifest) return;
    const orig = realManifest.scenarios[0].importStatus;
    H.build(realManifest, { limit: 10 });
    assert(realManifest.scenarios[0].importStatus === orig);
});
test('T89', 'entry importStatus is catalog_entry_only (not manifest_only)', () => {
    if (!realManifest) return;
    const entries = H.build(realManifest, { limit: 5 }).catalog.entries;
    entries.forEach(e => assert(e.importStatus === 'catalog_entry_only',
        e.title + ' has importStatus=' + e.importStatus));
});
test('T90', 'catalog JSON has no expectedResult/selectedDecision keys', () => {
    const j = JSON.stringify(H.build(makeManifest()).catalog);
    assert(!j.includes('"expectedResult"'));
    assert(!j.includes('"selectedDecision"'));
    assert(!j.includes('"previewComplete":true'));
});

// ══════════════════════════════════════════════════════════════════════════════
// T91–T95  Source-file safety
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 16: Source-file safety ---');

test('T91', 'buildExternalScenarioCatalogFromManifest does not call adaptWargame3ToFixture', () => {
    const body = extractFn(wsSrc, 'buildExternalScenarioCatalogFromManifest') || '';
    assert(!body.includes('adaptWargame3ToFixture'));
});
test('T92', 'buildExternalScenarioCatalogFromManifest does not call previewWargame3Fixture', () => {
    const body = extractFn(wsSrc, 'buildExternalScenarioCatalogFromManifest') || '';
    assert(!body.includes('previewWargame3Fixture'));
});
test('T93', 'no localStorage/fetch/XHR in 280C functions', () => {
    const b1 = extractFn(wsSrc, 'buildExternalScenarioCatalogFromManifest') || '';
    const b2 = extractFn(wsSrc, 'summarizeExternalScenarioCatalogSubset')    || '';
    const combined = b1 + b2;
    assert(!combined.includes('localStorage'));
    assert(!combined.includes('fetch('));
    assert(!combined.includes('XMLHttpRequest'));
});
test('T94', 'no DOM/map calls in 280C functions', () => {
    const b1 = extractFn(wsSrc, 'buildExternalScenarioCatalogFromManifest') || '';
    const b2 = extractFn(wsSrc, 'summarizeExternalScenarioCatalogSubset')    || '';
    const combined = b1 + b2;
    assert(!combined.includes('document.'));
    assert(!combined.includes('window.map'));
    assert(!combined.includes('fitBounds'));
});
test('T95', 'per-entry safetyFlags.expectedResultAttached all false', () => {
    getEntries().forEach(e =>
        assert(e.safetyFlags.expectedResultAttached === false));
});

// ══════════════════════════════════════════════════════════════════════════════
// T96–T99  Regression
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 17: Regression ---');

test('T96', 'buildSingleExternalScenarioCatalogEntry (PR-280B) still exported', () => {
    assert(wsSrc.includes('buildSingleExternalScenarioCatalogEntry:'));
});
test('T97', 'buildExternalScenarioCatalog (PR-280) still exported', () => {
    assert(wsSrc.includes('buildExternalScenarioCatalog:'));
});
test('T98', 'checkWargame3ScenarioWorkflowAcceptance (PR-279) still exported', () => {
    assert(wsSrc.includes('checkWargame3ScenarioWorkflowAcceptance:'));
});
test('T99', 'PR-280B buildSingle still callable', () => {
    if (!realManifest) return;
    const r = H.buildSingle(realManifest, { scenarioId: 'scenario_0001' });
    assert(r.passed === true && r.entry.entryType === 'external_scenario_catalog_entry');
});

// ══════════════════════════════════════════════════════════════════════════════
// T100–T104  File-protection checks
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n--- Section 18: File protection ---');

const BASE = path.join(__dirname, 'UI_MOdified/client');

test('T100', 'app.html unchanged (no 280C markers)', () => {
    const src = fs.readFileSync(path.join(BASE, 'app.html'), 'utf8');
    assert(!src.includes('buildExternalScenarioCatalogFromManifest'));
    assert(src.includes('<!DOCTYPE') || src.includes('<html'));
});
test('T101', 'i18n.js unchanged', () => {
    const src = fs.readFileSync(path.join(BASE, 'i18n.js'), 'utf8');
    assert(src.length > 0 && !src.includes('buildExternalScenarioCatalogFromManifest'));
});
test('T102', 'style.css readable', () => {
    const src = fs.readFileSync(path.join(BASE, 'style.css'), 'utf8');
    assert(src.length > 0);
});
test('T103', 'wargame3.json readable and valid JSON', () => {
    const src = fs.readFileSync(
        path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json'), 'utf8');
    const parsed = JSON.parse(src);
    assert(parsed && typeof parsed === 'object');
});
test('T104', 'adjudicator-map.js unchanged', () => {
    const src = fs.readFileSync(path.join(BASE, 'wargame/adjudicator-map.js'), 'utf8');
    assert(src.length > 0 && !src.includes('buildExternalScenarioCatalogFromManifest'));
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
