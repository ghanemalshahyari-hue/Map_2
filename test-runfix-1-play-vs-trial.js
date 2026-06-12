'use strict';
// test-runfix-1-play-vs-trial.js — RUNFIX-1: ▶ Play (workspace/transport) and
// "Run trial" (Wargame HUD) must run the SAME canonical scenario.
//
// Root cause fixed: three scenario-identity stores with no sync —
//   (1) HUD dropdown (#wg-adj-scenario, seeded from the server's active once),
//   (2) window.RmoozScenario.scenario (what ▶ Play animates),
//   (3) localStorage 'rmooz.last-loaded' pointer (refresh restore — and it WON
//       over the server active, so a stale pointer overrode the operator pick).
// Fix: server-active is canonical; loaders announce rmooz:active-scenario-changed;
// the HUD syncs its dropdown + SCENARIO_DEFAULT + cache from the announcement.
//
// The two modules are browser IIFEs (DOM + Leaflet + server) → static source
// checks + a data oracle here; live equality is browser-verified (real server).
const fs = require('fs');
const path = require('path');
const LOADER = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/shell/native-scenario-loader.js'), 'utf8');
const HUD = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-hud.js'), 'utf8');
const WSP = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/shell/scenario-workspace.js'), 'utf8');
const MAP = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8');
const w3 = require('./UI_MOdified/data/scenarios/wargame3.json');

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (extra != null ? '  — ' + extra : '')); } }

console.log('\n─── A. canonical restore order (stale localStorage can no longer win) ───');
const restoreFn = LOADER.slice(LOADER.indexOf('function restoreLastLoadedScenario'), LOADER.indexOf('/* APP-FLOW-2'));
ok('A1 restore queries the SERVER active first', /fetch\('\/api\/ai\/scenarios'/.test(restoreFn) &&
   restoreFn.indexOf("fetch('/api/ai/scenarios'") < restoreFn.indexOf('_restoreByName(ws, pointer'));
ok('A2 local pointer is only the OFFLINE FALLBACK (inside catch)', /\.catch\(function \(\) \{[\s\S]{0,200}if \(!pointer\) return;[\s\S]{0,120}_restoreByName\(ws, pointer/.test(restoreFn));
ok('A3 pointer self-heals when it fails (clearRememberedScenario)', /clearRememberedScenario\(\)/.test(restoreFn));
ok('A4 restoring the server active does NOT re-persist it', /_restoreByName\(ws, active, false\)/.test(restoreFn));

console.log('\n─── B. loaders announce the canonical scenario ───');
ok('B1 announceActiveScenario defined: POST /api/scenario/active + CustomEvent',
   /function announceActiveScenario\(name, persist\)/.test(LOADER) &&
   /fetch\('\/api\/scenario\/active'/.test(LOADER) &&
   /rmooz:active-scenario-changed/.test(LOADER));
ok('B2 picker load (loadScenarioByName) announces AND persists', /announceActiveScenario\(name, true\)/.test(LOADER));
ok('B3 _restoreByName announces (restore keeps surfaces synced)', /announceActiveScenario\(name, persistActive !== false\)/.test(LOADER));
ok('B4 launcher file-load announces event-only (file may not exist server-side)',
   /announceActiveScenario\(json\.name \|\| res\.scenarioId, false\)/.test(LOADER));
ok('B5 announcement validates the name (safe charset, no traversal)', /if \(!isSafeScenarioName\(name\)\) return;/.test(LOADER));

console.log('\n─── C. HUD syncs from the announcement (Run trial follows the same scenario) ───');
const hudSync = HUD.slice(HUD.indexOf("document.addEventListener('rmooz:active-scenario-changed'"), HUD.indexOf('// ── Import zone'));
ok('C1 HUD listens for rmooz:active-scenario-changed', hudSync.length > 0);
ok('C2 updates SCENARIO_DEFAULT (works before the dropdown exists)', /SCENARIO_DEFAULT = name;/.test(hudSync));
ok('C3 clears scenarioCache (next trial re-fetches the right scenario)', /scenarioCache = null;/.test(hudSync));
ok('C4 selects the option WITHOUT a synthetic change event (no re-POST loop)',
   /sel\.value = name;/.test(hudSync) && !/dispatchEvent\(new Event\('change'\)\)/.test(hudSync));
ok('C5 stale list → refreshes via loadScenarios() (server active re-selects)', /loadScenarios\(\)\.catch/.test(hudSync));
ok('C6 no hardcoded scenario name in the sync (no wargame3 forcing)', !/wargame3/.test(hudSync));

console.log('\n─── D. one canonical slot per surface (convergence) ───');
ok('D1 HUD mirrors every trial step into window.RmoozScenario (publishRmoozScenario)',
   /function publishRmoozScenario/.test(HUD) && /publishRmoozScenario\(\)/.test(HUD));
ok('D2 ▶ Play reads window.RmoozScenario.scenario (getScenario accessor)',
   /window\.RmoozScenario\s*&&\s*window\.RmoozScenario\.scenario/.test(WSP) || /RmoozScenario\.scenario/.test(WSP));
ok('D3 goToStep is the workspace stepIndex writer (single cursor)', /window\.RmoozScenario\.stepIndex = newIdx;/.test(WSP));

console.log('\n─── E. diagnostics (required instrumentation) ───');
const REQ = ['scenario_id', 'scenario_name', 'step_index', 'step_count', 'unit_count', 'sample_units', 'world_state_projection', 'preview_or_live', 'scenario_source'];
const hudDiag = HUD.slice(HUD.indexOf('function publishRunDiag'), HUD.indexOf('function escapeHtml'));
const wspDiag = WSP.slice(WSP.indexOf('// RUNFIX-1 diagnostics: publish this run path'), WSP.indexOf("if (window.__rmoozRunDiagVerbose) console.debug('[run-diag]', 'playAnimation'"));
ok('E1 Run-trial publisher exists (window.__rmoozRunDiag.runTrial via renderStep)',
   /publishRunDiag\('runTrial', state\)/.test(HUD));
ok('E2 Play publisher exists (window.__rmoozRunDiag.playAnimation via goToStep)', wspDiag.length > 0);
ok('E3 Run-trial diag carries all required fields', REQ.every(k => hudDiag.indexOf(k) !== -1),
   'missing: ' + REQ.filter(k => hudDiag.indexOf(k) === -1).join(','));
ok('E4 Play diag carries all required fields', REQ.every(k => wspDiag.indexOf(k) !== -1),
   'missing: ' + REQ.filter(k => wspDiag.indexOf(k) === -1).join(','));
ok('E5 Play diag reports the localStorage-pointer relationship (stale-source visibility)',
   /rmooz\.last-loaded/.test(wspDiag));
ok('E6 diagnostics are fail-safe (wrapped in try/catch, never break the run)',
   /diagnostics never break the run/.test(HUD) && /diagnostics never break the run/.test(WSP));

console.log('\n─── F. position parity oracle (same step ⇒ same coordinate source) ───');
// Both render paths position units through updateUnitPositions; for W3-rich the
// red position is keyed on INTEGER step from red_unit_step_coords — identical
// inputs for applyState (trial) and applyStepProgress (play) at the same step.
ok('F1 single position model: updateUnitPositions used by both render paths',
   /function updateUnitPositions/.test(MAP) && /updateUnitPositions\(state\)/.test(MAP) && /updateUnitPositions\(syntheticState\)/.test(MAP));
ok('F2 W3 red position keyed on integer step (progress-independent)',
   /redPositionW3LonLat/.test(MAP) && /red_unit_step_coords\[/.test(MAP));
let allSteps = true;
const rc = w3.red_unit_step_coords || {};
Object.keys(rc).forEach(uid => { if (!Array.isArray(rc[uid]) || rc[uid].length !== w3.steps.length) allSteps = false; });
ok('F3 W3 oracle: every red unit has one authored coord per step (' + w3.steps.length + ')', allSteps);
ok('F4 scenario identity fields exist for the diag comparison (name + steps + units)',
   typeof w3.name === 'string' && Array.isArray(w3.steps) && Array.isArray(w3.red_units));

console.log('\n─── H. active-scenario feedback loop is dead (POST storm fix) ───');
const SRV = fs.readFileSync(path.join(__dirname, 'UI_MOdified/server/web-server.js'), 'utf8');
const watcher = SRV.slice(SRV.indexOf('function initScenarioWatcher'), SRV.indexOf('[scenario-watcher] watching'));
ok('H1 server watcher ignores underscore bookkeeping files (_active.json)',
   /if \(\/\^_\/\.test\(String\(fname\)\)\) return;/.test(watcher));
const sse = HUD.slice(HUD.indexOf("es.addEventListener('scenario-changed'"), HUD.indexOf('es.onerror'));
ok('H2 HUD SSE handler NEVER dispatches a synthetic change (no re-POST loop)',
   sse.length > 0 && !/dispatchEvent\(new Event\('change'\)\)/.test(sse));
ok('H3 SSE handler converges to the server active (loadScenarios selects it)', /await loadScenarios\(\)/.test(sse));

console.log('\n─── G. safety ───');
const newLoaderBlock = LOADER.slice(LOADER.indexOf('function announceActiveScenario'), LOADER.indexOf('// Load a data/scenarios scenario by (validated) name'));
ok('G1 announcement never mutates scenario data (event + active-name POST only)',
   !/loadLiveScenarioFromJson|setLatLng|RmoozScenario\s*=/.test(newLoaderBlock));
ok('G2 no simulation/adjudication calls added to the loader', !/adjudicateStep|\/api\/sim\//.test(LOADER));
ok('G3 fix code forces no scenario name (no hardcoded wargame3 in new loader logic)',
   !/wargame3/.test(newLoaderBlock) && !/wargame3/.test(restoreFn));

console.log('\n═══════════════════════════════════════════════');
console.log('  RUNFIX-1 Play-vs-Trial consistency — ' + (fail === 0 ? 'PASS' : 'FAIL') + '  (' + pass + ' passed, ' + fail + ' failed)');
console.log('═══════════════════════════════════════════════');
process.exit(fail === 0 ? 0 : 1);
