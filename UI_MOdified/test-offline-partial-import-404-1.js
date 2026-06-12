#!/usr/bin/env node
/**
 * test-offline-partial-import-404-1.js
 *
 * Root cause of "Partial import failed: fetch generated scenario 404":
 * the scenario WRITER (scripts/port-wargame.js) + the bridge collision checks
 * hardcoded ROOT/data/scenarios, while the READER (server/ai/scenario-loader.js)
 * honors RMOOZ_DATA_DIR. If RMOOZ_DATA_DIR was set (as on the offline server),
 * the import wrote to /app/data/scenarios but GET /api/ai/scenario read
 * $RMOOZ_DATA_DIR/scenarios → "scenario not found" → 404 right after a
 * "successful" import.
 *
 * Sections:
 *   A — writer/bridge/loader ALL honor RMOOZ_DATA_DIR (source-level)
 *   B — round-trip: write via porter, read via loader, with RMOOZ_DATA_DIR set
 *       to a temp dir (the divergence scenario) — must NOT 404
 *   C — client surfaces the server's real error + guards a missing name
 */
'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;
let passed = 0, failed = 0;
const failures = [];
function check(name, cond, note) {
    if (cond) { console.log('  PASS  ' + name); passed++; }
    else { console.error('  FAIL  ' + name + (note ? '  →  ' + note : '')); failed++; failures.push(name); }
}
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch (e) { return ''; } }

console.log('\n═══ PARTIAL-IMPORT-404-1 ═══\n');

// ──────────────────────────────────────────────────────────────────────────────
console.log('A) Writer + bridge + loader all honor RMOOZ_DATA_DIR');
const porter = read(path.join(ROOT, 'scripts', 'port-wargame.js'));
const loader = read(path.join(ROOT, 'server', 'ai', 'scenario-loader.js'));
const obridge = read(path.join(ROOT, 'Offline_Deployment', 'offline_app', 'server', 'wargame-sim-bridge.js'));
const mbridge = read(path.join(ROOT, 'server', 'wargame-sim-bridge.js'));
check('A1  porter honors RMOOZ_DATA_DIR',        /RMOOZ_DATA_DIR\s*\|\|\s*path\.join\(ROOT,\s*'data'\)/.test(porter));
check('A2  porter no longer hardcodes ROOT/data/scenarios directly', !/SCENARIOS\s*=\s*path\.join\(ROOT,\s*'data',\s*'scenarios'\)/.test(porter));
check('A3  loader honors RMOOZ_DATA_DIR',        loader.includes("process.env.RMOOZ_DATA_DIR"));
check('A4  offline bridge SCENARIOS_DIR honors RMOOZ_DATA_DIR', obridge.includes("process.env.RMOOZ_DATA_DIR || path.join(ROOT, 'data')"));
check('A5  main bridge SCENARIOS_DIR honors RMOOZ_DATA_DIR',    mbridge.includes("process.env.RMOOZ_DATA_DIR || path.join(ROOT, 'data')"));

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nB) Round-trip with RMOOZ_DATA_DIR set (the divergence scenario)');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rm404-'));
// Child process so RMOOZ_DATA_DIR is read at module-load time by BOTH modules.
const script = `
const path = require('path');
const fs = require('fs');
const porter = require(${JSON.stringify(path.join(ROOT, 'scripts', 'port-wargame.js'))});
const loader = require(${JSON.stringify(path.join(ROOT, 'server', 'ai', 'scenario-loader.js'))});
// Minimal valid scenario (loader requires steps in [4..20] + shape).
const base = JSON.parse(fs.readFileSync(${JSON.stringify(path.join(ROOT, 'data', 'scenarios', 'gulf_of_sidra_2026_amphibious_assault__partial-06.json'))}, 'utf8'));
base.name = 'rt_partial_07';
const out = porter.writeScenario(base);
const writtenDir = path.dirname(out);
const expectedDir = path.join(process.env.RMOOZ_DATA_DIR, 'scenarios');
let loadedOk = false, loadErr = null;
try { const d = loader.loadScenario('rt_partial_07'); loadedOk = !!(d && (d.steps||[]).length>=4); }
catch(e){ loadErr = e.message.split('\\n')[0]; }
console.log(JSON.stringify({ writtenDir, expectedDir, sameDir: writtenDir===expectedDir, loadedOk, loadErr }));
`;
let rt = null;
try {
    const outp = execFileSync(process.execPath, ['-e', script], {
        env: Object.assign({}, process.env, { RMOOZ_DATA_DIR: tmp }),
        encoding: 'utf8',
    });
    rt = JSON.parse(outp.trim().split('\n').pop());
} catch (e) { rt = { error: (e.stdout || '') + (e.stderr || e.message) }; }
check('B1  porter wrote under RMOOZ_DATA_DIR/scenarios', rt && rt.sameDir === true, rt && (rt.writtenDir + ' vs ' + rt.expectedDir));
check('B2  loader LOADED the written scenario (no 404)', rt && rt.loadedOk === true, rt && (rt.loadErr || rt.error || 'unknown'));
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}

// ──────────────────────────────────────────────────────────────────────────────
console.log('\nC) Client surfaces the real error + guards missing name');
const wiz = read(path.join(ROOT, 'Offline_Deployment', 'offline_app', 'client', 'shell', 'scenario-import-wizard.js'));
check('C1  no opaque "fetch generated scenario " message', !wiz.includes("'fetch generated scenario '"));
check('C2  guards a missing body.name',          wiz.includes('body.name missing'));
check('C3  reads + includes the server error body', wiz.includes('errBody && errBody.error') && wiz.includes('could not load the saved scenario'));

console.log('\n═══ RESULTS ═══');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
if (failures.length) { console.log('\n  Failed:'); failures.forEach(function (f) { console.log('    - ' + f); }); }
console.log('');
process.exit(failed > 0 ? 1 : 0);
