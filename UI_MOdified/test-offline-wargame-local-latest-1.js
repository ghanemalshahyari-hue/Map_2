#!/usr/bin/env node
/**
 * test-offline-wargame-local-latest-1.js
 *
 * WARGAME-LOCAL-LATEST-1 — /api/wargame-local/{file,import} must accept ?run=latest
 * (and empty) by resolving it to the real newest run, instead of treating "latest"
 * as a literal run-folder name (which gave 400 "invalid run id: latest" / 404).
 *
 * Drives the bridge's handle() directly (no live server) against a temp imports
 * dir with two real run folders, and a temp RMOOZ_DATA_DIR so the porter writes
 * + the loader reads the same place.
 *
 * Cases (run in a child process so RMOOZ_* are set at module-load time):
 *   1. run=<real-id>           → import 200 + scenario loads
 *   2. run=latest              → resolves to the newest run → import 200 + loads
 *   3. invalid run id (../x)   → 400 rejected (traversal-safe)
 *   4. all_phases.geojson missing → clear 404
 *   5. after import, loadScenario(name) succeeds (Import Partial loads the scenario)
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

console.log('\n═══ WARGAME-LOCAL-LATEST-1 ═══\n');

// ── pick a real fixture geojson that ports to a loader-valid scenario ──────────
const fixtures = [
    'TestingAI/export_to_rmooz/2026-06-06_14-09-14/geojson/all_phases.geojson',
    'TestingAI/export_to_rmooz/2026-06-06_13-51-45/geojson/all_phases.geojson',
    'TestingAI/export_to_rmooz/2026-06-06_13-42-36/geojson/all_phases.geojson',
].map(f => path.join(ROOT, f)).filter(f => { try { return fs.existsSync(f); } catch (_) { return false; } });

if (!fixtures.length) {
    console.error('  FAIL  fixture all_phases.geojson not found — cannot run import cases');
    process.exit(1);
}
const FIXTURE = fixtures[0];

// ── temp layout ────────────────────────────────────────────────────────────────
const tmp     = fs.mkdtempSync(path.join(os.tmpdir(), 'wll-'));
const dataDir = path.join(tmp, 'data');
const localDir = path.join(dataDir, 'imports', 'wargame_outputs');
const OLD_ID = '2026-06-09_13-22-00';   // older
const NEW_ID = '2026-06-09_13-23-12';   // newer → the "latest"
const NOFILE_ID = '2026-06-09_13-24-00'; // run dir with NO all_phases.geojson
fs.mkdirSync(path.join(localDir, OLD_ID), { recursive: true });
fs.mkdirSync(path.join(localDir, NEW_ID), { recursive: true });
fs.mkdirSync(path.join(localDir, NOFILE_ID), { recursive: true });
fs.copyFileSync(FIXTURE, path.join(localDir, OLD_ID, 'all_phases.geojson'));
fs.copyFileSync(FIXTURE, path.join(localDir, NEW_ID, 'all_phases.geojson'));
// Make NEW_ID newer by mtime so resolveLatest picks it.
const now = Date.now();
fs.utimesSync(path.join(localDir, OLD_ID, 'all_phases.geojson'), new Date(now - 60000), new Date(now - 60000));
fs.utimesSync(path.join(localDir, NEW_ID, 'all_phases.geojson'), new Date(now), new Date(now));

// ── child harness: drives handle() with stub req/res/ctx ────────────────────────
const child = `
'use strict';
const path = require('path');
const bridge = require(${JSON.stringify(path.join(ROOT, 'server', 'wargame-local-bridge.js'))});
const loader = require(${JSON.stringify(path.join(ROOT, 'server', 'ai', 'scenario-loader.js'))});
function call(method, urlPath) {
  const u = new URL('http://x' + urlPath);
  const res = { _status:null, _json:null, _raw:null,
    setHeader(){}, writeHead(s){ this._status=s; }, end(b){ this._raw=b; } };
  const sendJson = (r, status, body) => { r._status = status; r._json = body; };
  const handled = bridge.handle({ method, on(){}, }, res, { url:u, pathname:u.pathname, method, sendJson, scenarios: loader });
  return { handled, status: res._status, json: res._json, hasRaw: res._raw != null };
}
const out = {};
// 2. import run=latest → must resolve to NEW_ID, 200, and return a name
out.latest = call('POST', '/api/wargame-local/import?run=latest');
// 1. import explicit newest id
out.explicit = call('POST', '/api/wargame-local/import?run=${NEW_ID}&name=wll_explicit');
// 5. after import, loadScenario must find the saved scenario
let loadOk = false, loadName = (out.latest.json && out.latest.json.name) || null;
try { if (loadName) { const d = loader.loadScenario(loadName); loadOk = !!(d && (d.steps||[]).length >= 4); } } catch(e) { out.loadErr = e.message.split('\\n')[0]; }
out.loadOk = loadOk; out.loadName = loadName;
out.latestRunReported = out.latest.json && out.latest.json.source_run;
// 3. invalid run id (traversal) → 400
out.invalid = call('POST', '/api/wargame-local/import?run=' + encodeURIComponent('../escape'));
// 4. file with a run dir that has no all_phases → 404
out.missing = call('GET', '/api/wargame-local/file?run=${NOFILE_ID}');
// also: file?run=latest must serve (200 raw), not 404
out.fileLatest = call('GET', '/api/wargame-local/file?run=latest');
console.log('___RESULT___' + JSON.stringify(out));
`;

let R = null;
try {
    const outp = execFileSync(process.execPath, ['-e', child], {
        env: Object.assign({}, process.env, { RMOOZ_DATA_DIR: dataDir, RMOOZ_LOCAL_WARGAME_DIR: localDir }),
        encoding: 'utf8',
    });
    const line = outp.split('\n').find(l => l.startsWith('___RESULT___'));
    R = JSON.parse(line.slice('___RESULT___'.length));
} catch (e) { R = { error: (e.stdout || '') + '\n' + (e.stderr || e.message) }; }

if (R.error) {
    console.error('  child harness failed:\n' + R.error);
    process.exit(1);
}

// ── assertions ───────────────────────────────────────────────────────────────
check('1  explicit run=<id> imports (200, ok)',        R.explicit && R.explicit.status === 200 && R.explicit.json && R.explicit.json.ok === true,
      R.explicit && JSON.stringify(R.explicit.json));
check('2  run=latest imports (200, ok) — NOT 400 "invalid run id: latest"', R.latest && R.latest.status === 200 && R.latest.json && R.latest.json.ok === true,
      R.latest && JSON.stringify(R.latest.json));
check('2b run=latest resolved to the NEWEST run id',   R.latestRunReported === NEW_ID, 'source_run=' + R.latestRunReported + ' expected=' + NEW_ID);
check('3  invalid/traversal run id rejected (400)',    R.invalid && R.invalid.status === 400, R.invalid && JSON.stringify(R.invalid.json));
check('4  missing all_phases.geojson → clear 404',     R.missing && R.missing.status === 404 && /all_phases\.geojson not found/.test((R.missing.json && R.missing.json.error) || ''),
      R.missing && JSON.stringify(R.missing.json));
check('5  loadScenario(name) succeeds after import',   R.loadOk === true, R.loadErr || ('name=' + R.loadName));
check('6  file?run=latest serves the geojson (200)',   R.fileLatest && R.fileLatest.status === 200 && R.fileLatest.hasRaw === true,
      R.fileLatest && JSON.stringify({ status: R.fileLatest.status, json: R.fileLatest.json }));

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}

console.log('\n═══ RESULTS ═══');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
if (failures.length) { console.log('\n  Failed:'); failures.forEach(f => console.log('    - ' + f)); }
console.log('');
process.exit(failed > 0 ? 1 : 0);
