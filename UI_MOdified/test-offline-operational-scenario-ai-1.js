#!/usr/bin/env node
/**
 * test-offline-operational-scenario-ai-1.js
 *
 * OPSCENARIO-AI-1 — the "Operational Scenario" (wargame) panel must use the SAME
 * offline AI generation path as Scenario Import: no separate integration, no
 * Ollama, no new endpoint, no hardcoded LiteLLM/IP/org/cert. It reuses the
 * existing WarGamingGEN wizard (AppNativeScenarioLoader.openImportScenario →
 * /api/wargame-sim/*), which the import-wizard + bridge already drive.
 *
 * Sections:
 *   A — Operational Scenario panel exposes the generate button (BOTH app.html)
 *   B — button is wired to the EXISTING wizard flow (reuse, not duplicate)
 *   C — i18n labels (EN + AR)
 *   D — reuse target exists in both builds (wizard anchor + openImportCardModal)
 *   E — the generation path is the shared WarGamingGEN/LiteLLM env path (no Ollama,
 *       no hardcoded endpoint/IP/org in the new wiring)
 *   F — required backend fixes still present (run=latest, RMOOZ_DATA_DIR, autogen,
 *       diag, final-load error surfaced)
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const OFF  = path.join(ROOT, 'Offline_Deployment');
let passed = 0, failed = 0;
const failures = [];
function check(name, cond, note) {
    if (cond) { console.log('  PASS  ' + name); passed++; }
    else { console.error('  FAIL  ' + name + (note ? '  →  ' + note : '')); failed++; failures.push(name); }
}
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } }

const mainHtml = read(path.join(ROOT, 'client', 'app.html'));
const offHtml  = read(path.join(OFF, 'offline_app', 'client', 'app.html'));
const loader   = read(path.join(ROOT, 'client', 'shell', 'native-scenario-loader.js'));
const i18n     = read(path.join(ROOT, 'client', 'i18n.js'));
const wizard   = read(path.join(ROOT, 'client', 'shell', 'scenario-import-wizard.js'));
const bridge   = read(path.join(OFF, 'offline_app', 'server', 'wargame-sim-bridge.js'));
const localBr  = read(path.join(ROOT, 'server', 'wargame-local-bridge.js'));

console.log('\n═══ OPSCENARIO-AI-1 ═══\n');

// ──────────────────────────────────────────────────────────────────────────────
console.log('A) Operational Scenario panel exposes the generate button');
check('A1  main app.html has #wg-generate-ai in wargame panel', /id="wg-generate-ai"/.test(mainHtml) && mainHtml.indexOf('id="wargame-panel"') < mainHtml.indexOf('id="wg-generate-ai"'));
check('A2  offline app.html has #wg-generate-ai in wargame panel', /id="wg-generate-ai"/.test(offHtml) && offHtml.indexOf('id="wargame-panel"') < offHtml.indexOf('id="wg-generate-ai"'));
check('A3  button uses i18n keys',                 mainHtml.includes('data-i18n="wg-ai-gen-btn"') && offHtml.includes('data-i18n="wg-ai-gen-btn"'));
check('A4  card labelled offline AI generation',   mainHtml.includes('data-i18n="wg-ai-gen-title"'));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nB) Wired to the EXISTING wizard flow (reuse, not duplicate)');
check('B1  loader binds #wg-generate-ai',          loader.includes("getElementById('wg-generate-ai')"));
check('B2  binding calls openImportScenario (reuse)', /bindOperationalScenarioGenerate[\s\S]*openImportScenario\(\)/.test(loader));
check('B3  bind runs on DOMContentLoaded',         loader.includes('bindOperationalScenarioGenerate()'));
check('B4  openImportScenario opens the existing wizard modal', loader.includes("openImportCardModal('wg-wizard-card'"));
check('B5  NO new /api/* endpoint invented in the wiring', !/fetch\(['"]\/api\/(?!wargame-sim|wargame-local|ai\/scenario)/.test(loader.match(/function bindOperationalScenarioGenerate[\s\S]{0,400}/)?.[0] || ''));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nC) i18n labels (EN + AR)');
check('C1  EN wg-ai-gen-btn',                      i18n.includes("'wg-ai-gen-btn': 'Generate / Continue'"));
check('C2  AR wg-ai-gen-btn',                      i18n.includes("'wg-ai-gen-btn': 'توليد / متابعة'"));
check('C3  EN+AR title/eyebrow',                   i18n.includes("'wg-ai-gen-title': 'Generate operational scenario'") && i18n.includes("'wg-ai-gen-title': 'توليد سيناريو عملياتي'"));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nD) Reuse target exists in both builds');
check('D1  wizard mount anchor in main',           mainHtml.includes('id="sw-live-scenario-import-card"'));
check('D2  wizard mount anchor in offline',        offHtml.includes('id="sw-live-scenario-import-card"'));
check('D3  openImportCardModal defined',           loader.includes('function openImportCardModal'));
check('D4  import wizard drives /api/wargame-sim/run', wizard.includes('/api/wargame-sim/run'));
check('D5  wizard supports Import Partial',         wizard.includes('importPartial'));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nE) Shared offline AI env path — no Ollama / no hardcoded endpoint in the wiring');
const bindBlock = (loader.match(/function bindOperationalScenarioGenerate[\s\S]{0,500}/) || [''])[0];
check('E1  wiring does not reference Ollama',      !/ollama/i.test(bindBlock));
check('E2  wiring has no hardcoded http(s) URL',   !/https?:\/\//.test(bindBlock));
check('E3  bridge resolves model from RMOOZ_AI_MODEL (shared env path)', bridge.includes('RMOOZ_AI_MODEL') && bridge.includes('LLM_MODEL'));
check('E4  bridge CA env passthrough present',     bridge.includes('RMOOZ_AI_CA_CERT_PATH') && bridge.includes('SSL_CERT_FILE') && bridge.includes('REQUESTS_CA_BUNDLE') && bridge.includes('NODE_EXTRA_CA_CERTS'));
check('E5  no hardcoded LiteLLM endpoint/IP/org in the new client wiring', !/litellm\.|tawasol|\d{1,3}(?:\.\d{1,3}){3}/.test(bindBlock + mainHtml.match(/id="wg-ai-gen-card"[\s\S]{0,400}/)?.[0]));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nF) Required backend fixes intact');
check('F1  wargame-local resolveRunToken (run=latest safe)', localBr.includes('resolveRunToken'));
check('F2  wargame-local keeps traversal guard',  localBr.includes('runDirFor') && localBr.includes('traversal'));
check('F3  bridge SCENARIOS_DIR honors RMOOZ_DATA_DIR', bridge.includes("process.env.RMOOZ_DATA_DIR || path.join(ROOT, 'data')"));
check('F4  scenario autogen present',              bridge.includes('ensureScenarioJson'));
check('F5  diag-litellm.py present',               fs.existsSync(path.join(OFF, 'offline_app', 'server', 'diag-litellm.py')));
check('F6  wizard surfaces real load error (not bare 404)', wizard.includes('could not load the saved scenario'));

console.log('\n═══ RESULTS ═══');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
if (failures.length) { console.log('\n  Failed:'); failures.forEach(f => console.log('    - ' + f)); }
console.log('');
process.exit(failed > 0 ? 1 : 0);
