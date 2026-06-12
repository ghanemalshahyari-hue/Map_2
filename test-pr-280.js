/**
 * test-pr-280.js
 * PR-280 — External Scenario Catalog Builder
 *
 * Tests buildExternalScenarioCatalog and summarizeExternalScenarioCatalog:
 *   T01–T03   Export / source presence
 *   T04–T06   Rejection cases — invalid sourceManifest
 *   T07–T12   Catalog shape — type / boundary flags
 *   T13–T14   sourceKind / sourceName copied
 *   T15–T16   totalFiles / totalFolders counted
 *   T17–T21   File counts by category (.scen/.ini/docs/assets/lua)
 *   T22–T24   Unsupported file detection
 *   T25–T28   scenarioEntries — presence / shape
 *   T29–T31   scenarioEntries — title / path / extension
 *   T32–T34   Companion .ini linking
 *   T35–T37   importReadiness flags (all locked)
 *   T38–T42   Safety invariants — no expectedResult/previewComplete/selectedDecision
 *   T43–T46   summarizeExternalScenarioCatalog — valid catalog
 *   T47–T49   summarizeExternalScenarioCatalog — rejection cases
 *   T50–T53   Immutability — no manifest mutation, independent results
 *   T54–T59   Static file guards (app.html / i18n / style / w3json / app.js / map.js)
 *   T60–T64   Regression — prior PR exports intact (PR-277/278/279)
 *
 * ~64 focused tests.  No DOM.  No Leaflet.  No storage.  No backend.
 *
 * Run: node test-pr-280.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Source extraction helpers ─────────────────────────────────────────────────
function readSrc(rel) {
    return fs.readFileSync(path.join(__dirname, rel), 'utf8');
}

const wsSrc    = readSrc('UI_MOdified/client/shell/scenario-workspace.js');
const appHtml  = readSrc('UI_MOdified/client/app.html');
const i18nSrc  = readSrc('UI_MOdified/client/i18n.js');
const cssSrc   = readSrc('UI_MOdified/client/style.css');
const w3Src    = readSrc('UI_MOdified/data/scenarios/wargame3.json');
const appJsSrc = (() => {
    try { return readSrc('UI_MOdified/client/app.js'); } catch(e) { return ''; }
})();
const mapJsSrc = (() => {
    try { return readSrc('UI_MOdified/client/wargame/adjudicator-map.js'); } catch(e) { return ''; }
})();

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

// ── Test runner ───────────────────────────────────────────────────────────────
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

// ── Harness ───────────────────────────────────────────────────────────────────
function buildHarness() {
    const buildFn    = extractFn(wsSrc, 'buildExternalScenarioCatalog');
    const summarizeFn = extractFn(wsSrc, 'summarizeExternalScenarioCatalog');

    assert(buildFn,     'buildExternalScenarioCatalog not found in source');
    assert(summarizeFn, 'summarizeExternalScenarioCatalog not found in source');

    const code = `
        function buildExternalScenarioCatalog(sourceManifest, options)  ${buildFn}
        function summarizeExternalScenarioCatalog(catalog)               ${summarizeFn}

        return {
            build:     buildExternalScenarioCatalog,
            summarize: summarizeExternalScenarioCatalog
        };
    `;
    return new Function(code)();
}

// ── Fixture factories ─────────────────────────────────────────────────────────

/** Sample Command: Modern Operations style manifest (11 files, 5 folders) */
function makeSampleManifest() {
    return {
        sourceKind: 'command_modern_operations_pack',
        sourceName: 'Sample CMO Pack',
        files: [
            { path: 'Iran Strike.scen',                    name: 'Iran Strike.scen',                extension: '.scen', folder: null },
            { path: 'Iran Strike.ini',                     name: 'Iran Strike.ini',                 extension: '.ini',  folder: null },
            { path: 'Northern Fury/1994 Baltic Fury.scen', name: '1994 Baltic Fury.scen',           extension: '.scen', folder: 'Northern Fury' },
            { path: 'Northern Fury/1994 Baltic Fury.ini',  name: '1994 Baltic Fury.ini',            extension: '.ini',  folder: 'Northern Fury' },
            { path: 'Docs/Iran Strike Briefing.pdf',       name: 'Iran Strike Briefing.pdf',        extension: '.pdf',  folder: 'Docs' },
            { path: 'Docs/Load Table.xlsx',                name: 'Load Table.xlsx',                 extension: '.xlsx', folder: 'Docs' },
            { path: 'Assets/Gulf_of_Sidra_1981.jpg',       name: 'Gulf_of_Sidra_1981.jpg',          extension: '.jpg',  folder: 'Assets' },
            { path: 'Assets/briefing.html',                name: 'briefing.html',                   extension: '.html', folder: 'Assets' },
            { path: 'Lua/GulfofSidra1981/setup.lua',       name: 'setup.lua',                       extension: '.lua',  folder: 'Lua/GulfofSidra1981' },
            { path: 'README.txt',                          name: 'README.txt',                      extension: '.txt',  folder: null },
            { path: 'unknown.bin',                         name: 'unknown.bin',                     extension: '.bin',  folder: null }
        ],
        folders: [
            { path: 'Northern Fury',       name: 'Northern Fury' },
            { path: 'Docs',                name: 'Docs' },
            { path: 'Assets',              name: 'Assets' },
            { path: 'Lua',                 name: 'Lua' },
            { path: 'Lua/GulfofSidra1981', name: 'GulfofSidra1981' }
        ]
    };
}

// Build harness
let H;
try {
    H = buildHarness();
} catch(e) {
    console.error('HARNESS BUILD FAILED:', e.message);
    process.exit(1);
}

// ═════════════════════════════════════════════════════════════════════════════
// T01–T03: Export / source presence
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T01–T03: Export / source presence ───────────────────────────────');

test('T01', 'buildExternalScenarioCatalog exported in source', () => {
    assert(wsSrc.includes('buildExternalScenarioCatalog:'),
        'export entry not found');
});
test('T02', 'summarizeExternalScenarioCatalog exported in source', () => {
    assert(wsSrc.includes('summarizeExternalScenarioCatalog:'),
        'export entry not found');
});
test('T03', 'both functions are callable in harness', () => {
    assert(typeof H.build === 'function', 'H.build is not a function');
    assert(typeof H.summarize === 'function', 'H.summarize is not a function');
});

// ═════════════════════════════════════════════════════════════════════════════
// T04–T06: Rejection cases
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T04–T06: Rejection cases ─────────────────────────────────────────');

test('T04', 'rejects null sourceManifest', () => {
    const r = H.build(null);
    assert(r.passed === false && r.catalog === null && r.blockedReasons.length > 0);
});
test('T05', 'rejects array sourceManifest', () => {
    const r = H.build([]);
    assert(r.passed === false && r.catalog === null);
});
test('T06', 'rejects manifest without files array', () => {
    const r = H.build({ sourceKind: 'x', sourceName: 'y' });
    assert(r.passed === false && r.catalog === null);
    assert(r.blockedReasons.some(m => m.includes('files')),
        'expected files message; got: ' + JSON.stringify(r.blockedReasons));
});

// ═════════════════════════════════════════════════════════════════════════════
// T07–T12: Catalog shape — type / boundary flags
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T07–T12: Catalog shape ───────────────────────────────────────────');

test('T07', 'catalogType === external_scenario_catalog', () => {
    const r = H.build(makeSampleManifest());
    assert(r.catalog.catalogType === 'external_scenario_catalog');
});
test('T08', 'source === external_manifest', () => {
    const r = H.build(makeSampleManifest());
    assert(r.catalog.source === 'external_manifest');
});
test('T09', 'readOnly === true', () => {
    const r = H.build(makeSampleManifest());
    assert(r.catalog.readOnly === true);
});
test('T10', 'dryRunOnly === true', () => {
    const r = H.build(makeSampleManifest());
    assert(r.catalog.dryRunOnly === true);
});
test('T11', 'liveMutationAllowed === false', () => {
    const r = H.build(makeSampleManifest());
    assert(r.catalog.liveMutationAllowed === false);
});
test('T12', 'backendCommitAllowed === false', () => {
    const r = H.build(makeSampleManifest());
    assert(r.catalog.backendCommitAllowed === false);
});

// ═════════════════════════════════════════════════════════════════════════════
// T13–T14: sourceKind / sourceName
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T13–T14: sourceKind / sourceName ────────────────────────────────');

test('T13', 'sourceKind copied from manifest', () => {
    const r = H.build(makeSampleManifest());
    assert(r.catalog.sourceKind === 'command_modern_operations_pack');
});
test('T14', 'sourceName copied from manifest', () => {
    const r = H.build(makeSampleManifest());
    assert(r.catalog.sourceName === 'Sample CMO Pack');
});

// ═════════════════════════════════════════════════════════════════════════════
// T15–T16: totalFiles / totalFolders
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T15–T16: totalFiles / totalFolders ───────────────────────────────');

test('T15', 'totalFiles === 11 for sample manifest', () => {
    const r = H.build(makeSampleManifest());
    assert(r.catalog.totalFiles === 11, 'got: ' + r.catalog.totalFiles);
});
test('T16', 'totalFolders === 5 for sample manifest', () => {
    const r = H.build(makeSampleManifest());
    assert(r.catalog.totalFolders === 5, 'got: ' + r.catalog.totalFolders);
});

// ═════════════════════════════════════════════════════════════════════════════
// T17–T21: File counts by category
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T17–T21: File counts by category ────────────────────────────────');

test('T17', 'scenarioFileCount === 2 (.scen files)', () => {
    const r = H.build(makeSampleManifest());
    assert(r.catalog.scenarioFileCount === 2, 'got: ' + r.catalog.scenarioFileCount);
});
test('T18', 'companionFileCount === 2 (.ini files)', () => {
    const r = H.build(makeSampleManifest());
    assert(r.catalog.companionFileCount === 2, 'got: ' + r.catalog.companionFileCount);
});
test('T19', 'documentFileCount === 3 (.pdf + .xlsx + .txt)', () => {
    const r = H.build(makeSampleManifest());
    assert(r.catalog.documentFileCount === 3, 'got: ' + r.catalog.documentFileCount);
});
test('T20', 'assetFileCount === 2 (.jpg + .html)', () => {
    const r = H.build(makeSampleManifest());
    assert(r.catalog.assetFileCount === 2, 'got: ' + r.catalog.assetFileCount);
});
test('T21', 'scriptFileCount === 1 (.lua)', () => {
    const r = H.build(makeSampleManifest());
    assert(r.catalog.scriptFileCount === 1, 'got: ' + r.catalog.scriptFileCount);
});

// ═════════════════════════════════════════════════════════════════════════════
// T22–T24: Unsupported file detection
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T22–T24: Unsupported file detection ──────────────────────────────');

test('T22', 'unknown.bin counted as unsupported', () => {
    const r = H.build(makeSampleManifest());
    assert(r.catalog.unsupportedItems.length === 1,
        'got: ' + r.catalog.unsupportedItems.length);
});
test('T23', 'unsupportedItems[0].extension === .bin', () => {
    const r = H.build(makeSampleManifest());
    assert(r.catalog.unsupportedItems[0].extension === '.bin');
});
test('T24', 'warningSummary.warningCodes includes unsupported_file_extensions', () => {
    const r = H.build(makeSampleManifest());
    assert(r.catalog.warningSummary.warningCodes.indexOf('unsupported_file_extensions') !== -1);
});

// ═════════════════════════════════════════════════════════════════════════════
// T25–T28: scenarioEntries — presence / shape
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T25–T28: scenarioEntries presence / shape ────────────────────────');

test('T25', 'scenarioEntries has 2 entries for 2 .scen files', () => {
    const r = H.build(makeSampleManifest());
    assert(Array.isArray(r.catalog.scenarioEntries) && r.catalog.scenarioEntries.length === 2,
        'got: ' + r.catalog.scenarioEntries.length);
});
test('T26', 'each entry has required fields', () => {
    const r = H.build(makeSampleManifest());
    for (const e of r.catalog.scenarioEntries) {
        assert(typeof e.id === 'string' && e.id.length > 0, 'missing id');
        assert(typeof e.title === 'string', 'missing title');
        assert(typeof e.path === 'string',  'missing path');
        assert(e.extension === '.scen',     'wrong extension');
        assert(Array.isArray(e.documentRefs), 'missing documentRefs');
        assert(Array.isArray(e.scriptRefs),   'missing scriptRefs');
    }
});
test('T27', 'importStatus is cataloged_only for every entry', () => {
    const r = H.build(makeSampleManifest());
    for (const e of r.catalog.scenarioEntries) {
        assert(e.importStatus === 'cataloged_only', 'importStatus: ' + e.importStatus);
    }
});
test('T28', 'conversionReady false / requiresHumanReview true for every entry', () => {
    const r = H.build(makeSampleManifest());
    for (const e of r.catalog.scenarioEntries) {
        assert(e.conversionReady === false,     'conversionReady should be false');
        assert(e.requiresHumanReview === true,  'requiresHumanReview should be true');
    }
});

// ═════════════════════════════════════════════════════════════════════════════
// T29–T31: scenarioEntries — title / path / extension
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T29–T31: scenarioEntries — title / path ──────────────────────────');

test('T29', 'first entry title derived from filename without extension', () => {
    const r = H.build(makeSampleManifest());
    const e0 = r.catalog.scenarioEntries[0];
    assert(e0.title === 'Iran Strike', 'got: ' + e0.title);
});
test('T30', 'second entry title derived from filename', () => {
    const r = H.build(makeSampleManifest());
    const e1 = r.catalog.scenarioEntries[1];
    assert(e1.title === '1994 Baltic Fury', 'got: ' + e1.title);
});
test('T31', 'entry path matches original file path', () => {
    const r = H.build(makeSampleManifest());
    assert(r.catalog.scenarioEntries[0].path === 'Iran Strike.scen');
    assert(r.catalog.scenarioEntries[1].path === 'Northern Fury/1994 Baltic Fury.scen');
});

// ═════════════════════════════════════════════════════════════════════════════
// T32–T34: Companion .ini linking
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T32–T34: Companion .ini linking ──────────────────────────────────');

test('T32', 'Iran Strike entry has companionIniPath linked', () => {
    const r = H.build(makeSampleManifest());
    const e0 = r.catalog.scenarioEntries[0];
    assert(e0.companionIniPath === 'Iran Strike.ini',
        'got: ' + e0.companionIniPath);
});
test('T33', '1994 Baltic Fury entry has companionIniPath linked', () => {
    const r = H.build(makeSampleManifest());
    const e1 = r.catalog.scenarioEntries[1];
    assert(e1.companionIniPath === 'Northern Fury/1994 Baltic Fury.ini',
        'got: ' + e1.companionIniPath);
});
test('T34', 'scenario without matching .ini has companionIniPath === null', () => {
    const manifest = {
        sourceKind: 'external_app', sourceName: 'Test',
        files: [
            { path: 'Orphan.scen', name: 'Orphan.scen', extension: '.scen', folder: null }
        ]
    };
    const r = H.build(manifest);
    assert(r.catalog.scenarioEntries[0].companionIniPath === null,
        'expected null companionIniPath');
});

// ═════════════════════════════════════════════════════════════════════════════
// T35–T37: importReadiness flags
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T35–T37: importReadiness flags ───────────────────────────────────');

test('T35', 'importReadiness.catalogOnly:true, previewOnly:true', () => {
    const r = H.build(makeSampleManifest());
    const ir = r.catalog.importReadiness;
    assert(ir.catalogOnly === true && ir.previewOnly === true);
});
test('T36', 'importReadiness.conversionReady:false, liveApplyReady:false', () => {
    const r = H.build(makeSampleManifest());
    const ir = r.catalog.importReadiness;
    assert(ir.conversionReady === false && ir.liveApplyReady === false);
});
test('T37', 'importReadiness.requiresHumanReview:true', () => {
    const r = H.build(makeSampleManifest());
    assert(r.catalog.importReadiness.requiresHumanReview === true);
});

// ═════════════════════════════════════════════════════════════════════════════
// T38–T42: Safety invariants
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T38–T42: Safety invariants ───────────────────────────────────────');

test('T38', 'catalog does not contain expectedResult field', () => {
    const fnSrc = extractFn(wsSrc, 'buildExternalScenarioCatalog') || '';
    assert(!fnSrc.includes('expectedResult:'), 'expectedResult field found in builder');
});
test('T39', 'catalog does not set previewComplete:true', () => {
    const fnSrc = extractFn(wsSrc, 'buildExternalScenarioCatalog') || '';
    assert(!fnSrc.includes('previewComplete: true') && !fnSrc.includes("previewComplete:true"),
        'previewComplete:true found in builder');
});
test('T40', 'catalog does not contain selectedDecision field', () => {
    const fnSrc = extractFn(wsSrc, 'buildExternalScenarioCatalog') || '';
    assert(!fnSrc.includes('selectedDecision'), 'selectedDecision found in builder');
});
test('T41', 'builder does not call adaptWargame3ToFixture', () => {
    const fnSrc = extractFn(wsSrc, 'buildExternalScenarioCatalog') || '';
    assert(!fnSrc.includes('adaptWargame3ToFixture'),
        'adaptWargame3ToFixture must not be called from catalog builder');
});
test('T42', 'builder does not call previewWargame3Fixture', () => {
    const fnSrc = extractFn(wsSrc, 'buildExternalScenarioCatalog') || '';
    assert(!fnSrc.includes('previewWargame3Fixture'),
        'previewWargame3Fixture must not be called from catalog builder');
});

// ═════════════════════════════════════════════════════════════════════════════
// T43–T46: summarizeExternalScenarioCatalog — valid catalog
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T43–T46: summarizeExternalScenarioCatalog ────────────────────────');

test('T43', 'summarize returns passed:true for valid catalog', () => {
    const cat = H.build(makeSampleManifest()).catalog;
    const r   = H.summarize(cat);
    assert(r.passed === true && r.summary !== null);
});
test('T44', 'summary.importMode === catalog_only', () => {
    const cat = H.build(makeSampleManifest()).catalog;
    assert(H.summarize(cat).summary.importMode === 'catalog_only');
});
test('T45', 'summary.nextRecommendedAction === human_review', () => {
    const cat = H.build(makeSampleManifest()).catalog;
    assert(H.summarize(cat).summary.nextRecommendedAction === 'human_review');
});
test('T46', 'summary.unsupportedCount === 1 for sample manifest', () => {
    const cat = H.build(makeSampleManifest()).catalog;
    assert(H.summarize(cat).summary.unsupportedCount === 1,
        'got: ' + H.summarize(cat).summary.unsupportedCount);
});

// ═════════════════════════════════════════════════════════════════════════════
// T47–T49: summarizeExternalScenarioCatalog — rejection cases
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T47–T49: summarize — rejection cases ─────────────────────────────');

test('T47', 'summarize rejects null catalog', () => {
    const r = H.summarize(null);
    assert(r.passed === false && r.summary === null);
});
test('T48', 'summarize rejects array catalog', () => {
    const r = H.summarize([]);
    assert(r.passed === false && r.summary === null);
});
test('T49', 'summarize rejects object with wrong catalogType', () => {
    const r = H.summarize({ catalogType: 'wrong_type' });
    assert(r.passed === false && r.summary === null);
    assert(r.blockedReasons.some(m => m.includes('catalogType')));
});

// ═════════════════════════════════════════════════════════════════════════════
// T50–T53: Immutability — no manifest mutation, independent results
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T50–T53: Immutability ────────────────────────────────────────────');

test('T50', 'sourceManifest is not mutated by builder', () => {
    const manifest = makeSampleManifest();
    const originalFileCount = manifest.files.length;
    const originalFolderCount = manifest.folders.length;
    H.build(manifest);
    assert(manifest.files.length === originalFileCount, 'files array was mutated');
    assert(manifest.folders.length === originalFolderCount, 'folders array was mutated');
    assert(manifest.sourceKind === 'command_modern_operations_pack', 'sourceKind mutated');
});
test('T51', 'scenarioEntries from two calls are independent', () => {
    const manifest = makeSampleManifest();
    const r1 = H.build(manifest);
    r1.catalog.scenarioEntries.push({ id: 'injected' });
    const r2 = H.build(manifest);
    assert(r2.catalog.scenarioEntries.length === 2,
        'second call scenarioEntries contaminated by first');
});
test('T52', 'mutating returned summary does not affect catalog', () => {
    const cat = H.build(makeSampleManifest()).catalog;
    const s   = H.summarize(cat).summary;
    s.importMode = 'HACKED';
    const s2 = H.summarize(cat).summary;
    assert(s2.importMode === 'catalog_only', 'summary mutation leaked into catalog');
});
test('T53', 'empty files array is accepted (zero scenario entries)', () => {
    const r = H.build({ sourceKind: 'external_app', sourceName: 'Empty', files: [] });
    assert(r.passed === true && r.catalog.totalFiles === 0);
    assert(r.catalog.scenarioEntries.length === 0);
});

// ═════════════════════════════════════════════════════════════════════════════
// T54–T59: Static file guards
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T54–T59: Static file guards ──────────────────────────────────────');

test('T54', 'app.html does not reference buildExternalScenarioCatalog', () => {
    assert(!appHtml.includes('buildExternalScenarioCatalog'),
        'buildExternalScenarioCatalog found in app.html');
});
test('T55', 'i18n.js does not reference buildExternalScenarioCatalog', () => {
    assert(!i18nSrc.includes('buildExternalScenarioCatalog'),
        'buildExternalScenarioCatalog found in i18n.js');
});
test('T56', 'style.css does not reference buildExternalScenarioCatalog', () => {
    assert(!cssSrc.includes('buildExternalScenarioCatalog'),
        'buildExternalScenarioCatalog found in style.css');
});
test('T57', 'wargame3.json does not reference buildExternalScenarioCatalog', () => {
    assert(!w3Src.includes('buildExternalScenarioCatalog'),
        'buildExternalScenarioCatalog found in wargame3.json');
});
test('T58', 'adjudicator-map.js does not reference buildExternalScenarioCatalog', () => {
    assert(!mapJsSrc.includes('buildExternalScenarioCatalog'),
        'buildExternalScenarioCatalog found in adjudicator-map.js');
});
test('T59', 'builder function body does not call Gate 7 / apply / execute / commit', () => {
    const fnSrc = extractFn(wsSrc, 'buildExternalScenarioCatalog') || '';
    // Check for callable/key patterns, not field-name substrings like 'liveApplyReady'
    assert(!fnSrc.includes('gate7Approved'),   'gate7Approved found in builder');
    assert(!fnSrc.includes('Gate7'),           'Gate7 found in builder');
    assert(!fnSrc.includes('commitNow'),       'commitNow found in builder');
    assert(!fnSrc.includes('executeNow'),      'executeNow found in builder');
    assert(!fnSrc.includes('applyNow'),        'applyNow found in builder');
    assert(!fnSrc.includes('backendCommit:'),  'backendCommit key found in builder');
});

// ═════════════════════════════════════════════════════════════════════════════
// T60–T64: Regression — prior PR exports intact
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n── T60–T64: Regression — prior PR exports intact ────────────────────');

test('T60', 'checkWargame3ScenarioWorkflowAcceptance still exported (PR-279)', () => {
    assert(wsSrc.includes('checkWargame3ScenarioWorkflowAcceptance:'),
        'PR-279 export missing');
});
test('T61', 'runWargame3ScenarioWorkflowWalkthrough still exported (PR-278)', () => {
    assert(wsSrc.includes('runWargame3ScenarioWorkflowWalkthrough:'),
        'PR-278 export missing');
});
test('T62', 'buildW3ScenarioWorkflowStateFromSession still exported (PR-277)', () => {
    assert(wsSrc.includes('buildW3ScenarioWorkflowStateFromSession:'),
        'PR-277 export missing');
});
test('T63', 'buildWargame3ScenarioReviewSessionState still exported (PR-274)', () => {
    assert(wsSrc.includes('buildWargame3ScenarioReviewSessionState:'),
        'PR-274 export missing');
});
test('T64', 'catalog builder works without any W3 workflow data', () => {
    // Verify no W3 references needed — pure standalone call
    const manifest = {
        sourceKind: 'wargame3',
        sourceName: 'Wargame 3 Export',
        files: [
            { path: 'wg3.scen', name: 'wg3.scen', extension: '.scen', folder: null },
            { path: 'wg3.ini',  name: 'wg3.ini',  extension: '.ini',  folder: null }
        ]
    };
    const r = H.build(manifest);
    assert(r.passed === true);
    assert(r.catalog.scenarioFileCount === 1);
    assert(r.catalog.scenarioEntries[0].companionIniPath === 'wg3.ini');
});

// ═════════════════════════════════════════════════════════════════════════════
// Summary
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n' + '─'.repeat(60));
console.log('  Results: ' + passed + ' passed, ' + failed + ' failed');
if (failures.length) {
    console.log('\n  Failed tests:');
    failures.forEach(f => console.log('    ' + f));
}
console.log('─'.repeat(60));
process.exit(failed > 0 ? 1 : 0);
