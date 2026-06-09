/**
 * test-offline-scenario-autogen-1.js — SCENARIO-AUTOGEN-1
 *
 * RMOOZ must auto-create WarGamingGEN's inputs/scenario.json (with a valid
 * objective) so the operator never has to hand-inject it. Covers:
 *   A. Missing scenario.json        → created, valid objective, phases >= 1
 *   B. scenario.json w/o objective  → objective injected, other data preserved
 *   C. scenario.json with objective → preserved untouched (no overwrite)
 *   D. singular scenario_override.json → mirrored to plural; both readable
 *   E. env/model: oss-120b-fast (never oss-20b-fast), CA path documented
 *
 * Behaviour is unit-tested via the requireable main-app bridge; the OFFLINE
 * bridge (deployed artifact) is asserted to carry byte-identical helpers +
 * route wiring. Python-schema validity + the full Python-canonical path are
 * covered by the in-container run (test G) — this file is static/no-server.
 *
 * Run from UI_MOdified/:  node test-offline-scenario-autogen-1.js
 */
'use strict';
const assert = require('assert');
const fs     = require('fs');
const os     = require('os');
const path   = require('path');

const MAIN_BRIDGE    = path.join(__dirname, 'server', 'wargame-sim-bridge.js');
const OFFLINE_BRIDGE = path.join(__dirname, 'Offline_Deployment', 'offline_app', 'server', 'wargame-sim-bridge.js');
const ENV_EXAMPLE    = path.join(__dirname, 'Offline_Deployment', '.env.offline.example');
const COMPOSE        = path.join(__dirname, 'Offline_Deployment', 'docker-compose.offline.yml');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('  [PASS] ' + name); passed++; }
    catch (e) { console.log('  [FAIL] ' + name + ': ' + e.message); failed++; }
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log('  SCENARIO-AUTOGEN-1 — scenario.json auto-creation + objective');
console.log('══════════════════════════════════════════════════════════════════\n');

const bridge   = require(MAIN_BRIDGE)._internals;
const offline  = fs.readFileSync(OFFLINE_BRIDGE, 'utf8');
const mainSrc  = fs.readFileSync(MAIN_BRIDGE, 'utf8');

function tmpCtx() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wg-autogen-'));
    fs.mkdirSync(path.join(tmp, 'inputs'), { recursive: true });
    // python is intentionally bogus → forces the Node-fallback path (no Python dep in CI)
    return { wgen: tmp, python: 'definitely-no-python-xyz', cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}
function readScenario(c) { return JSON.parse(fs.readFileSync(path.join(c.wgen, 'inputs', 'scenario.json'), 'utf8')); }

// ── §A  Missing scenario.json → created ───────────────────────────────────────
console.log('── §A  Missing scenario.json ─────────────────────────────────────');
test('A1: missing → created with valid objective + phases', () => {
    const c = tmpCtx();
    try {
        const r = bridge.ensureScenarioJson(c, {});
        assert.ok(r.created, 'should report created');
        assert.ok(bridge.isValidScenarioObjective(r.scenario.objective), 'objective must be valid');
        assert.ok(Array.isArray(r.scenario.phases) && r.scenario.phases.length >= 1, 'phases >= 1');
        assert.ok(fs.existsSync(path.join(c.wgen, 'inputs', 'scenario.json')), 'file written to disk');
    } finally { c.cleanup(); }
});
test('A2: created objective has id + finite lon/lat + bbox length 4', () => {
    const c = tmpCtx();
    try {
        const s = bridge.ensureScenarioJson(c, {}).scenario;
        assert.ok(s.objective.id && isFinite(s.objective.lon) && isFinite(s.objective.lat));
        assert.strictEqual(s.bbox_wgs84.length, 4);
        assert.ok(s.bbox_wgs84[0] < s.bbox_wgs84[2] && s.bbox_wgs84[1] < s.bbox_wgs84[3], 'bbox min<max');
    } finally { c.cleanup(); }
});

// ── §B  scenario.json without objective → injected ────────────────────────────
console.log('\n── §B  scenario.json without objective ───────────────────────────');
test('B1: objective injected, other scenario data preserved', () => {
    const c = tmpCtx();
    try {
        const noObj = { operation_name: 'PRESERVE_ME', bbox_wgs84: [10,10,11,11], coast_lat_approx: 11,
                        d_day_iso: '2026-01-01T00:00:00Z', phases: [{ step:0, time_label:'D', phase_name_ar:'a' }] };
        fs.writeFileSync(path.join(c.wgen,'inputs','scenario.json'), JSON.stringify(noObj));
        const r = bridge.ensureScenarioJson(c, { lon: 50.1, lat: 25.2 });
        assert.ok(r.created, 'created/modified');
        assert.strictEqual(r.source, 'objective_injected');
        assert.ok(bridge.isValidScenarioObjective(r.scenario.objective));
        assert.strictEqual(r.scenario.objective.lon, 50.1, 'uses provided lon');
        assert.strictEqual(r.scenario.objective.lat, 25.2, 'uses provided lat');
        assert.strictEqual(readScenario(c).operation_name, 'PRESERVE_ME', 'existing data preserved');
    } finally { c.cleanup(); }
});
test('B2: no UI coords → safe fallback 32.89 / 34.76', () => {
    const c = tmpCtx();
    try {
        const noObj = { operation_name: 'X', bbox_wgs84: [10,10,11,11], coast_lat_approx: 11,
                        d_day_iso: '2026-01-01T00:00:00Z', phases: [{ step:0, time_label:'D', phase_name_ar:'a' }] };
        fs.writeFileSync(path.join(c.wgen,'inputs','scenario.json'), JSON.stringify(noObj));
        const s = bridge.ensureScenarioJson(c, {}).scenario;
        assert.strictEqual(s.objective.lon, 32.89);
        assert.strictEqual(s.objective.lat, 34.76);
    } finally { c.cleanup(); }
});

// ── §C  scenario.json with objective → preserved ──────────────────────────────
console.log('\n── §C  scenario.json with existing objective ─────────────────────');
test('C1: existing objective preserved untouched (no overwrite)', () => {
    const c = tmpCtx();
    try {
        const withObj = { operation_name:'KEEP', bbox_wgs84:[10,10,11,11], coast_lat_approx:11,
                          d_day_iso:'2026-01-01T00:00:00Z', phases:[{ step:0, time_label:'D', phase_name_ar:'a' }],
                          objective:{ id:'OBJ-9', name_ar:'x', lon:1.5, lat:2.5 } };
        fs.writeFileSync(path.join(c.wgen,'inputs','scenario.json'), JSON.stringify(withObj));
        const r = bridge.ensureScenarioJson(c, { lon: 99, lat: 9 });
        assert.strictEqual(r.created, false, 'must NOT modify');
        assert.strictEqual(r.source, 'existing');
        assert.strictEqual(r.scenario.objective.id, 'OBJ-9');
        assert.strictEqual(r.scenario.objective.lon, 1.5, 'existing lon kept, not overwritten by 99');
    } finally { c.cleanup(); }
});

// ── §D  singular override mirrored to plural ──────────────────────────────────
console.log('\n── §D  scenario_override.json (singular) handling ────────────────');
test('D1: singular mirrored to plural; both names readable', () => {
    const c = tmpCtx();
    try {
        fs.writeFileSync(path.join(c.wgen,'inputs','scenario_override.json'),
                         JSON.stringify({ objective: { id:'OBJ-X', lon:5, lat:6 } }));
        const m = bridge.normalizeOverrideFile(c);
        assert.strictEqual(m, 'mirrored_singular_to_plural');
        assert.ok(fs.existsSync(path.join(c.wgen,'inputs','scenario_overrides.json')), 'plural created');
        const ov = bridge.readObjectiveOverride(c);
        assert.ok(ov && ov.id === 'OBJ-X' && ov.lon === 5 && ov.lat === 6, 'readback ok');
    } finally { c.cleanup(); }
});
test('D2: plural is never overwritten when it already exists', () => {
    const c = tmpCtx();
    try {
        fs.writeFileSync(path.join(c.wgen,'inputs','scenario_overrides.json'),
                         JSON.stringify({ objective: { id:'OBJ-PLURAL', lon:1, lat:2 } }));
        fs.writeFileSync(path.join(c.wgen,'inputs','scenario_override.json'),
                         JSON.stringify({ objective: { id:'OBJ-SINGULAR', lon:9, lat:8 } }));
        bridge.normalizeOverrideFile(c);
        assert.strictEqual(bridge.readObjectiveOverride(c).id, 'OBJ-PLURAL', 'plural wins, not overwritten');
    } finally { c.cleanup(); }
});

// ── §E  env / model / CA ──────────────────────────────────────────────────────
console.log('\n── §E  env / model / CA ──────────────────────────────────────────');
const envEx   = fs.readFileSync(ENV_EXAMPLE, 'utf8');
const compose = fs.readFileSync(COMPOSE, 'utf8');
test('E1: env example documents oss-120b-fast', () => {
    assert.ok(envEx.includes('oss-120b-fast'), 'oss-120b-fast must be the documented model');
});
test('E2: NO oss-20b-fast assigned as RMOOZ_AI_MODEL anywhere in env example/compose', () => {
    assert.ok(!/RMOOZ_AI_MODEL\s*[:=].*oss-20b-fast/.test(envEx), 'env example must not set model=oss-20b-fast');
    assert.ok(!/RMOOZ_AI_MODEL\s*[:=].*oss-20b-fast/.test(compose), 'compose must not set model=oss-20b-fast');
});
test('E3: compose passes RMOOZ_AI_MODEL + CA env through to the container', () => {
    ['RMOOZ_AI_MODEL', 'RMOOZ_AI_CA_CERT_PATH', 'SSL_CERT_FILE', 'REQUESTS_CA_BUNDLE', 'NODE_EXTRA_CA_CERTS']
        .forEach(k => assert.ok(compose.includes(k), 'compose must wire ' + k));
});

// ── §F  OFFLINE bridge carries identical helpers + route wiring ───────────────
console.log('\n── §F  OFFLINE bridge parity (deployed artifact) ─────────────────');
['function ensureScenarioJson', 'function buildMinimalScenario', 'function writeCanonicalScenarioViaPython',
 'function normalizeOverrideFile', 'function isValidScenarioObjective'].forEach((sig, i) => {
    test('F' + (i+1) + ': offline bridge has ' + sig, () => {
        assert.ok(offline.includes(sig), sig + ' missing from offline bridge');
    });
});
test('F6: offline run route ensures scenario.json BEFORE spawn', () => {
    const runIdx = offline.indexOf("pathname === '/api/wargame-sim/run'");
    const spawnIdx = offline.indexOf('spawn(c.python, runArgs(resume)', runIdx);
    const ensIdx = offline.indexOf('ensureScenarioJson(c)', runIdx);
    assert.ok(runIdx >= 0 && ensIdx >= 0 && spawnIdx >= 0, 'anchors present');
    assert.ok(ensIdx < spawnIdx, 'ensureScenarioJson must run before spawn');
});
test('F7: offline objective-override route no longer hard-fails on missing scenario.json', () => {
    const ovIdx = offline.indexOf("pathname === '/api/wargame-sim/objective-override'");
    // Slice the whole route body: from the route guard to where it writes the override.
    const endIdx = offline.indexOf('writeObjectiveOverride(c, override)', ovIdx);
    assert.ok(ovIdx >= 0 && endIdx > ovIdx, 'objective-override route anchors present');
    const region = offline.slice(ovIdx, endIdx);
    assert.ok(region.includes('ensureScenarioJson(c, { lon: lon, lat: lat })'), 'must ensure scenario.json first');
    // The old hard-fail path must no longer be reachable as the route response.
    assert.ok(!/no default objective found in scenario\.json/.test(region), 'no hard-fail error in route');
});
test('F8: offline + main objective helper bodies are byte-identical (parity)', () => {
    function block(src) {
        const a = src.indexOf('function isValidScenarioObjective');
        const b = src.indexOf('function normalizeOverrideFile');
        const end = src.indexOf('\n}', b) + 2;
        return src.slice(a, end);
    }
    assert.strictEqual(block(offline), block(mainSrc), 'offline and main SCENARIO-AUTOGEN-1 helpers must match');
});

// ── Results ───────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(68));
console.log('  Results: ' + passed + ' passed, ' + failed + ' failed');
console.log('═'.repeat(68) + '\n');
process.exit(failed > 0 ? 1 : 0);
