#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = path.join(__dirname, 'docs/scenario-pack-audit/external_scenario_source_manifest.json');
const PROJECT_ROOT = __dirname;

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}: ${e.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assertion failed');
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ============================================================
// Section 1: Manifest file exists and loads
// ============================================================
console.log('\n--- Section 1: Manifest file and structure ---');

let manifest;
test('manifest file exists', () => {
  assert(fs.existsSync(MANIFEST_PATH), `Missing: ${MANIFEST_PATH}`);
  manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  assert(typeof manifest === 'object', 'Manifest must be an object');
});

// From here, manifest is loaded — all subsequent tests assume it
// We use a helper that skips if manifest is not loaded
function requireManifest(name, fn) {
  test(name, () => {
    assert(manifest, 'Manifest not loaded');
    fn();
  });
}

// ============================================================
// Section 2: Top-level manifest type fields (rules 1–6)
// ============================================================
console.log('\n--- Section 2: Top-level manifest type fields ---');

requireManifest('rule-01: manifestType is external_scenario_source_manifest', () => {
  assertEqual(manifest.manifestType, 'external_scenario_source_manifest', 'manifestType');
});

requireManifest('rule-02: sourceKind is command_modern_operations_pack', () => {
  assertEqual(manifest.sourceKind, 'command_modern_operations_pack', 'sourceKind');
});

requireManifest('rule-03: sourceName is CommunityScenarioPack51', () => {
  assertEqual(manifest.sourceName, 'CommunityScenarioPack51', 'sourceName');
});

requireManifest('rule-04: liveMutationAllowed is false', () => {
  assertEqual(manifest.liveMutationAllowed, false, 'liveMutationAllowed');
});

requireManifest('rule-05: backendCommitAllowed is false', () => {
  assertEqual(manifest.backendCommitAllowed, false, 'backendCommitAllowed');
});

requireManifest('rule-06: dryRunOnly is true', () => {
  assertEqual(manifest.dryRunOnly, true, 'dryRunOnly');
});

requireManifest('rule-07: readOnly is true', () => {
  assertEqual(manifest.readOnly, true, 'readOnly');
});

requireManifest('rule-08: catalogOnly is true', () => {
  assertEqual(manifest.catalogOnly, true, 'catalogOnly');
});

// ============================================================
// Section 3: metadataPolicy (rules 9–15)
// ============================================================
console.log('\n--- Section 3: Metadata policy ---');

requireManifest('rule-09: metadataPolicy.scenBinaryParsed is false', () => {
  assertEqual(manifest.metadataPolicy.scenBinaryParsed, false, 'scenBinaryParsed');
});

requireManifest('rule-10: metadataPolicy.iniTreatedAsMetadata is false', () => {
  assertEqual(manifest.metadataPolicy.iniTreatedAsMetadata, false, 'iniTreatedAsMetadata');
});

requireManifest('rule-11: metadataPolicy.iniPurpose is scenario_units_weapon_patch', () => {
  assertEqual(manifest.metadataPolicy.iniPurpose, 'scenario_units_weapon_patch', 'iniPurpose');
});

requireManifest('rule-12: metadataPolicy.xlsxTreatedAsMetadata is true', () => {
  assertEqual(manifest.metadataPolicy.xlsxTreatedAsMetadata, true, 'xlsxTreatedAsMetadata');
});

requireManifest('rule-13: metadataPolicy.luaExecuted is false', () => {
  assertEqual(manifest.metadataPolicy.luaExecuted, false, 'luaExecuted');
});

requireManifest('rule-14: metadataPolicy.requiresHumanReview is true', () => {
  assertEqual(manifest.metadataPolicy.requiresHumanReview, true, 'requiresHumanReview');
});

// ============================================================
// Section 4: auditSummary counts (rules 15–20)
// ============================================================
console.log('\n--- Section 4: auditSummary counts ---');

requireManifest('rule-15: auditSummary.scenarioFileCount is 630', () => {
  assertEqual(manifest.auditSummary.scenarioFileCount, 630, 'scenarioFileCount');
});

requireManifest('rule-16: auditSummary.iniFileCount is 632', () => {
  assertEqual(manifest.auditSummary.iniFileCount, 632, 'iniFileCount');
});

requireManifest('rule-17: auditSummary.luaFileCount is 8', () => {
  assertEqual(manifest.auditSummary.luaFileCount, 8, 'luaFileCount');
});

requireManifest('rule-18: auditSummary.htmlFileCount is 16', () => {
  assertEqual(manifest.auditSummary.htmlFileCount, 16, 'htmlFileCount');
});

requireManifest('rule-19: auditSummary.xlsxMatchedCount >= 500', () => {
  assert(manifest.auditSummary.xlsxMatchedCount >= 500, `xlsxMatchedCount should be >=500, got ${manifest.auditSummary.xlsxMatchedCount}`);
});

requireManifest('rule-20: xlsxMatchedCount + filenameFallbackCount === 630', () => {
  const total = manifest.auditSummary.xlsxMatchedCount + manifest.auditSummary.filenameFallbackCount;
  assertEqual(total, 630, 'xlsxMatchedCount + filenameFallbackCount');
});

// ============================================================
// Section 5: scenarios array — count and every-item invariants (rules 21–29)
// ============================================================
console.log('\n--- Section 5: Scenarios array invariants ---');

requireManifest('rule-21: scenarios array exists', () => {
  assert(Array.isArray(manifest.scenarios), 'scenarios must be an array');
});

requireManifest('rule-22: scenarios.length === 630', () => {
  assertEqual(manifest.scenarios.length, 630, 'scenarios.length');
});

requireManifest('rule-23: every scenario has luaExecutionBlocked === true', () => {
  const bad = manifest.scenarios.filter(s => s.luaExecutionBlocked !== true);
  assert(bad.length === 0, `${bad.length} scenarios have luaExecutionBlocked !== true`);
});

requireManifest('rule-24: every scenario has scenBinaryParsed === false', () => {
  const bad = manifest.scenarios.filter(s => s.scenBinaryParsed !== false);
  assert(bad.length === 0, `${bad.length} scenarios have scenBinaryParsed !== false`);
});

requireManifest('rule-25: every scenario has importStatus === manifest_only', () => {
  const bad = manifest.scenarios.filter(s => s.importStatus !== 'manifest_only');
  assert(bad.length === 0, `${bad.length} scenarios have importStatus !== manifest_only`);
});

requireManifest('rule-26: every scenario has conversionReady === false', () => {
  const bad = manifest.scenarios.filter(s => s.conversionReady !== false);
  assert(bad.length === 0, `${bad.length} scenarios have conversionReady !== false`);
});

requireManifest('rule-27: every scenario has requiresHumanReview === true', () => {
  const bad = manifest.scenarios.filter(s => s.requiresHumanReview !== true);
  assert(bad.length === 0, `${bad.length} scenarios have requiresHumanReview !== true`);
});

requireManifest('rule-28: every scenario has a non-empty title', () => {
  const bad = manifest.scenarios.filter(s => !s.title || s.title.trim() === '');
  assert(bad.length === 0, `${bad.length} scenarios have empty title`);
});

requireManifest('rule-29: every scenario has a non-empty scenarioId', () => {
  const bad = manifest.scenarios.filter(s => !s.scenarioId || s.scenarioId.trim() === '');
  assert(bad.length === 0, `${bad.length} scenarios have empty scenarioId`);
});

requireManifest('rule-30: scenarioId format is scenario_NNNN', () => {
  const bad = manifest.scenarios.filter(s => !/^scenario_\d{4}$/.test(s.scenarioId));
  assert(bad.length === 0, `${bad.length} scenarios have malformed scenarioId (e.g. ${bad[0] && bad[0].scenarioId})`);
});

requireManifest('rule-31: all scenarioIds are unique', () => {
  const ids = manifest.scenarios.map(s => s.scenarioId);
  const unique = new Set(ids);
  assertEqual(unique.size, ids.length, 'unique scenarioIds');
});

requireManifest('rule-32: every scenario has a path ending in .scen', () => {
  const bad = manifest.scenarios.filter(s => !s.path || !s.path.endsWith('.scen'));
  assert(bad.length === 0, `${bad.length} scenarios have path not ending in .scen`);
});

requireManifest('rule-33: every scenario with hasIniWeaponPatch has iniWeaponPatchPath', () => {
  const bad = manifest.scenarios.filter(s => s.hasIniWeaponPatch && !s.iniWeaponPatchPath);
  assert(bad.length === 0, `${bad.length} scenarios have hasIniWeaponPatch but no iniWeaponPatchPath`);
});

requireManifest('rule-34: every scenario iniWeaponPatchPath ends in .ini (when present)', () => {
  const bad = manifest.scenarios.filter(s => s.iniWeaponPatchPath && !s.iniWeaponPatchPath.endsWith('.ini'));
  assert(bad.length === 0, `${bad.length} scenarios have iniWeaponPatchPath not ending in .ini`);
});

requireManifest('rule-35: every scenario has sourceTrace with titleFrom field', () => {
  const bad = manifest.scenarios.filter(s => !s.sourceTrace || !s.sourceTrace.titleFrom);
  assert(bad.length === 0, `${bad.length} scenarios missing sourceTrace.titleFrom`);
});

requireManifest('rule-36: sourceTrace.titleFrom is "xlsx" or "filename"', () => {
  const bad = manifest.scenarios.filter(s => s.sourceTrace && !['xlsx', 'filename'].includes(s.sourceTrace.titleFrom));
  assert(bad.length === 0, `${bad.length} scenarios have invalid sourceTrace.titleFrom`);
});

requireManifest('rule-37: sourceTrace.relationshipFrom is "filename_match" for all scenarios', () => {
  const bad = manifest.scenarios.filter(s => s.sourceTrace && s.sourceTrace.relationshipFrom !== 'filename_match');
  assert(bad.length === 0, `${bad.length} scenarios have relationshipFrom !== filename_match`);
});

requireManifest('rule-38: confidence is "high", "medium", or "low" for all scenarios', () => {
  const bad = manifest.scenarios.filter(s => !['high', 'medium', 'low'].includes(s.confidence));
  assert(bad.length === 0, `${bad.length} scenarios have invalid confidence value`);
});

requireManifest('rule-39: exactly 1 scenario has hasLua === true (Gulf of Sidra Incident, 1981)', () => {
  const withLua = manifest.scenarios.filter(s => s.hasLua === true);
  assertEqual(withLua.length, 1, 'scenarios with hasLua=true');
  assert(withLua[0].title.includes('Gulf of Sidra Incident'), `Expected Gulf of Sidra Incident, got: ${withLua[0].title}`);
});

requireManifest('rule-40: the Gulf of Sidra scenario has 8 lua script paths', () => {
  const sidra = manifest.scenarios.find(s => s.hasLua === true);
  assert(sidra, 'No scenario with hasLua=true');
  assertEqual(sidra.luaScriptPaths.length, 8, 'luaScriptPaths.length for Gulf of Sidra');
});

requireManifest('rule-41: exactly 3 scenarios have hasHtmlBriefing === true', () => {
  const withHtml = manifest.scenarios.filter(s => s.hasHtmlBriefing === true);
  assertEqual(withHtml.length, 3, 'scenarios with hasHtmlBriefing=true');
});

requireManifest('rule-42: Iran Strike 2025 has 4 HTML briefing paths', () => {
  const s = manifest.scenarios.find(s => s.title.includes('Iran Strike') && s.title.includes('2025'));
  assert(s, 'Iran Strike, 2025 not found');
  assertEqual(s.htmlBriefingPaths.length, 4, 'htmlBriefingPaths for Iran Strike 2025');
});

requireManifest('rule-43: Operation Ghost Rider 1985 has 4 HTML briefing paths', () => {
  const s = manifest.scenarios.find(s => s.title.includes('Ghost Rider') && s.title.includes('1985'));
  assert(s, 'Operation Ghost Rider, 1985 not found');
  assertEqual(s.htmlBriefingPaths.length, 4, 'htmlBriefingPaths for Ghost Rider 1985');
});

requireManifest('rule-44: Gulf of Sidra Incident 1981 has 1 HTML briefing path', () => {
  const s = manifest.scenarios.find(s => s.title === 'Gulf of Sidra Incident, 1981');
  assert(s, 'Gulf of Sidra Incident, 1981 not found');
  assertEqual(s.htmlBriefingPaths.length, 1, 'htmlBriefingPaths for Gulf of Sidra');
});

requireManifest('rule-45: no scenario has a sizeBytes of 0 (null is ok)', () => {
  const bad = manifest.scenarios.filter(s => s.sizeBytes === 0);
  assert(bad.length === 0, `${bad.length} scenarios have sizeBytes === 0`);
});

// ============================================================
// Section 6: files array (rules 46–50)
// ============================================================
console.log('\n--- Section 6: Files array ---');

requireManifest('rule-46: files array exists', () => {
  assert(Array.isArray(manifest.files), 'files must be an array');
});

requireManifest('rule-47: files array has at least 1300 entries', () => {
  assert(manifest.files.length >= 1300, `files.length = ${manifest.files.length}, expected >= 1300`);
});

requireManifest('rule-48: all .ini file entries have category "ini_weapon_patch"', () => {
  const bad = manifest.files.filter(f => f.extension === '.ini' && f.category !== 'ini_weapon_patch');
  assert(bad.length === 0, `${bad.length} .ini files have category !== ini_weapon_patch`);
});

requireManifest('rule-49: all .scen file entries have readPolicy "blocked_binary"', () => {
  const bad = manifest.files.filter(f => f.extension === '.scen' && f.readPolicy !== 'blocked_binary');
  assert(bad.length === 0, `${bad.length} .scen files have readPolicy !== blocked_binary`);
});

requireManifest('rule-50: all .lua file entries have readPolicy "blocked_script"', () => {
  const bad = manifest.files.filter(f => f.extension === '.lua' && f.readPolicy !== 'blocked_script');
  assert(bad.length === 0, `${bad.length} .lua files have readPolicy !== blocked_script`);
});

// ============================================================
// Section 7: warnings (rules 51–55)
// ============================================================
console.log('\n--- Section 7: Warnings array ---');

requireManifest('rule-51: warnings array exists', () => {
  assert(Array.isArray(manifest.warnings), 'warnings must be an array');
});

requireManifest('rule-52: warnings contains LUA_EXECUTION_BLOCKED', () => {
  const w = manifest.warnings.find(w => w.code === 'LUA_EXECUTION_BLOCKED');
  assert(w, 'No LUA_EXECUTION_BLOCKED warning found');
});

requireManifest('rule-53: warnings contains INI_NOT_METADATA', () => {
  const w = manifest.warnings.find(w => w.code === 'INI_NOT_METADATA');
  assert(w, 'No INI_NOT_METADATA warning found');
});

requireManifest('rule-54: warnings contains at least one NO_XLSX_MATCH', () => {
  const matches = manifest.warnings.filter(w => w.code === 'NO_XLSX_MATCH');
  assert(matches.length > 0, 'No NO_XLSX_MATCH warnings found');
});

requireManifest('rule-55: INI_NOT_METADATA warning message mentions 632', () => {
  const w = manifest.warnings.find(w => w.code === 'INI_NOT_METADATA');
  assert(w && w.message.includes('632'), 'INI_NOT_METADATA message should mention 632');
});

// ============================================================
// Section 8: Gate 7 / AI boundary — no forbidden keys (rules 56–61)
// ============================================================
console.log('\n--- Section 8: AI/sim boundary checks ---');

requireManifest('rule-56: manifest JSON does not contain "expectedResult"', () => {
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  assert(!raw.includes('"expectedResult"'), 'Manifest contains forbidden key: "expectedResult"');
});

requireManifest('rule-57: manifest JSON does not contain "selectedDecision"', () => {
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  assert(!raw.includes('"selectedDecision"'), 'Manifest contains forbidden key: "selectedDecision"');
});

requireManifest('rule-58: manifest JSON does not contain "previewComplete"', () => {
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  assert(!raw.includes('"previewComplete"'), 'Manifest contains forbidden key: "previewComplete"');
});

requireManifest('rule-59: manifest JSON does not contain "/api/sim/commit"', () => {
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  assert(!raw.includes('"/api/sim/commit"'), 'Manifest contains forbidden key: "/api/sim/commit"');
});

requireManifest('rule-60: manifest JSON does not contain "applyDecision"', () => {
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  assert(!raw.includes('"applyDecision"'), 'Manifest contains forbidden key: "applyDecision"');
});

requireManifest('rule-61: manifest JSON does not contain "executeSimulation"', () => {
  const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
  assert(!raw.includes('"executeSimulation"'), 'Manifest contains forbidden key: "executeSimulation"');
});

// ============================================================
// Section 9: Production RMOOZ files not modified (rules 62–70)
// ============================================================
console.log('\n--- Section 9: Production file protection checks ---');

const PROTECTED_FILES = [
  { path: 'UI_MOdified/client/app.html', marker: '<!DOCTYPE' },
  { path: 'UI_MOdified/client/i18n.js', marker: 'function' },
  { path: 'UI_MOdified/client/style.css', marker: '{' },
  { path: 'UI_MOdified/client/tool-rail.js', marker: 'function' },
  { path: 'UI_MOdified/client/wargame/adjudicator-hud.js', marker: 'function' },
  { path: 'UI_MOdified/client/wargame/adjudicator-map.js', marker: 'function' },
  { path: 'UI_MOdified/data/scenarios/wargame3.json', marker: '{' },
];

for (const pf of PROTECTED_FILES) {
  const fullPath = path.join(PROJECT_ROOT, pf.path);
  test(`rule-protected: ${pf.path} exists and is readable`, () => {
    assert(fs.existsSync(fullPath), `Protected file missing: ${pf.path}`);
    const content = fs.readFileSync(fullPath, 'utf8');
    assert(content.includes(pf.marker), `Protected file looks corrupted (missing marker "${pf.marker}"): ${pf.path}`);
  });
}

// ============================================================
// Section 10: Manifest markdown file exists (rule 71)
// ============================================================
console.log('\n--- Section 10: Markdown summary file ---');

test('rule-71: external_scenario_source_manifest.md exists', () => {
  const mdPath = path.join(PROJECT_ROOT, 'docs/scenario-pack-audit/external_scenario_source_manifest.md');
  assert(fs.existsSync(mdPath), `Missing markdown: ${mdPath}`);
  const content = fs.readFileSync(mdPath, 'utf8');
  assert(content.includes('PR-280A'), 'MD file should mention PR-280A');
  assert(content.includes('CommunityScenarioPack51'), 'MD file should mention CommunityScenarioPack51');
});

// ============================================================
// Section 11: Additional scenario property checks (rules 72–80)
// ============================================================
console.log('\n--- Section 11: Additional scenario checks ---');

requireManifest('rule-72: every scenario has folderGroup === "root"', () => {
  const bad = manifest.scenarios.filter(s => s.folderGroup !== 'root');
  assert(bad.length === 0, `${bad.length} scenarios have folderGroup !== "root"`);
});

requireManifest('rule-73: scenarios with hasLua have non-empty luaScriptPaths', () => {
  const bad = manifest.scenarios.filter(s => s.hasLua && (!Array.isArray(s.luaScriptPaths) || s.luaScriptPaths.length === 0));
  assert(bad.length === 0, `${bad.length} scenarios have hasLua but empty luaScriptPaths`);
});

requireManifest('rule-74: scenarios without hasLua have empty luaScriptPaths array', () => {
  const bad = manifest.scenarios.filter(s => !s.hasLua && s.luaScriptPaths && s.luaScriptPaths.length > 0);
  assert(bad.length === 0, `${bad.length} scenarios without hasLua have non-empty luaScriptPaths`);
});

requireManifest('rule-75: htmlBriefingPaths is always an array', () => {
  const bad = manifest.scenarios.filter(s => !Array.isArray(s.htmlBriefingPaths));
  assert(bad.length === 0, `${bad.length} scenarios have htmlBriefingPaths that is not an array`);
});

requireManifest('rule-76: documentBriefingPaths is always an array', () => {
  const bad = manifest.scenarios.filter(s => !Array.isArray(s.documentBriefingPaths));
  assert(bad.length === 0, `${bad.length} scenarios have documentBriefingPaths that is not an array`);
});

requireManifest('rule-77: scenarios with hasHtmlBriefing have at least 1 htmlBriefingPath', () => {
  const bad = manifest.scenarios.filter(s => s.hasHtmlBriefing && s.htmlBriefingPaths.length === 0);
  assert(bad.length === 0, `${bad.length} scenarios have hasHtmlBriefing but empty htmlBriefingPaths`);
});

requireManifest('rule-78: no scenario has year less than 1900 or greater than 2035 (when set)', () => {
  const bad = manifest.scenarios.filter(s => s.year !== null && (s.year < 1900 || s.year > 2035));
  assert(bad.length === 0, `${bad.length} scenarios have year out of range: ${bad.slice(0,3).map(s=>s.year).join(',')}`);
});

requireManifest('rule-79: xlsxMatchedCount is 512', () => {
  assertEqual(manifest.auditSummary.xlsxMatchedCount, 512, 'xlsxMatchedCount');
});

requireManifest('rule-80: filenameFallbackCount is 118', () => {
  assertEqual(manifest.auditSummary.filenameFallbackCount, 118, 'filenameFallbackCount');
});

// ============================================================
// Final results
// ============================================================
console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\nFAILED: ${failed} test(s) did not pass.`);
  process.exit(1);
} else {
  console.log('\nAll tests passed. PR-280A manifest is valid.');
}
