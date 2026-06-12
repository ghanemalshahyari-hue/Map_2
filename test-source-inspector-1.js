#!/usr/bin/env node
/**
 * test-source-inspector-1.js
 *
 * SOURCE-INSPECTOR-1 verifier — the read-only Scenario Source Inspector.
 *
 * Drives wargame-sim-bridge.handle() / computeSources() against a temp TestingAI
 * fixture (RMOOZ_TESTINGAI_DIR) with a DELIBERATELY non-17 phase count (12) to
 * prove the inspector reports phases dynamically. No python spawned, no DOCX
 * parsed, no scenario DB mutated.
 *
 *   node test-source-inspector-1.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execSync } = require('child_process');

const ROOT       = __dirname;
const BRIDGE     = require(path.join(ROOT, 'UI_MOdified/server/wargame-sim-bridge.js'));
const I          = BRIDGE._internals;
const BRIDGE_SRC = fs.readFileSync(path.join(ROOT, 'UI_MOdified/server/wargame-sim-bridge.js'), 'utf8');
const WIZ_SRC    = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/scenario-import-wizard.js'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  ok   ' + label); pass++; }
    else      { console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); fail++; }
}

const tmpDirs = [];
function geoFixture(nPhases) {
    const feats = [];
    for (let ph = 0; ph < nPhases; ph++) {
        feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [19.5, 29.7] },
            properties: { kind: 'objective', id: 'OBJ', phase: ph } });
        for (const u of [['R-1', 'RED'], ['R-2', 'RED'], ['B-1', 'BLUE'], ['B-2', 'BLUE']]) {
            feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [18, 32] },
                properties: { kind: 'unit', uid: u[0], side: u[1], phase: ph } });
        }
    }
    return { type: 'FeatureCollection', properties: { operation_name: 'SI1' }, features: feats };
}
function makeFixture(opts) {
    opts = opts || {};
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-si1-'));
    tmpDirs.push(dir);
    const total = opts.total || 12;                 // NON-17 on purpose
    const runId = opts.runId || '2026-02-02_02-02-02_si1';
    const inputs = path.join(dir, 'WarGamingGEN', 'inputs');
    const forces = path.join(inputs, 'forces');
    fs.mkdirSync(forces, { recursive: true });
    // scenario.json with `total` phases
    const phases = [];
    for (let i = 0; i < total; i++) phases.push({ step: i, time_label: 'D+' + i, kind: 'k' + i });
    fs.writeFileSync(path.join(inputs, 'scenario.json'), JSON.stringify({ operation_name: 'SI1', phases }), 'utf8');
    // staged DOCX (bytes only — never parsed)
    fs.writeFileSync(path.join(forces, 'red_team.docx'), Buffer.from('PK\x03\x04 red'));
    fs.writeFileSync(path.join(forces, 'blue_team.docx'), Buffer.from('PK\x03\x04 blue'));
    // OOB from docx (red 84 / blue 89)
    const red = Array.from({ length: 84 }, (_, i) => ({ uid: 'R' + i, side: 'RED' }));
    const blue = Array.from({ length: 89 }, (_, i) => ({ uid: 'B' + i, side: 'BLUE' }));
    fs.writeFileSync(path.join(forces, 'current_oob_from_docx.json'),
        JSON.stringify({ source_note: 'parse_docx_oob', red: { side: 'RED', units: red }, blue: { side: 'BLUE', units: blue } }));
    // Step 0 context
    const s0 = path.join(dir, 'Step 0'); fs.mkdirSync(s0, { recursive: true });
    fs.writeFileSync(path.join(s0, 'warning_order.json'), '{}');
    fs.writeFileSync(path.join(s0, 'Staff_Brief.json'), '{}');
    // checkpoints (K)
    const ck = path.join(dir, 'WarGamingGEN', 'runs', runId, 'checkpoints');
    fs.mkdirSync(ck, { recursive: true });
    const K = opts.checkpoints == null ? 5 : opts.checkpoints;
    for (let i = 0; i < K; i++) fs.writeFileSync(path.join(ck, 'phase' + String(i).padStart(2, '0') + '.json'), '{}');
    // run outputs all_phases.geojson
    if (opts.runOutputs !== false) {
        const go = path.join(dir, 'WarGamingGEN', 'runs', runId, 'outputs', 'geojson');
        fs.mkdirSync(go, { recursive: true });
        fs.writeFileSync(path.join(go, 'all_phases.geojson'), JSON.stringify(geoFixture(opts.geoPhases || 3)));
    }
    // published export
    const ge = path.join(dir, 'export_to_rmooz', runId, 'geojson'); fs.mkdirSync(ge, { recursive: true });
    fs.writeFileSync(path.join(ge, 'all_phases.geojson'), JSON.stringify(geoFixture(opts.geoPhases || 3)));
    fs.writeFileSync(path.join(dir, 'export_to_rmooz', 'latest.json'), JSON.stringify({ latest: runId }));
    return { dir, runId, total, K };
}

function scenariosStub() {
    return { setActiveCount: 0, clearCount: 0,
        getActiveName() { return null; },
        clearCache() { this.clearCount++; }, setActiveName(n) { this.setActiveCount++; } };
}
function callSources(stub) {
    const url = new URL('http://x/api/wargame-sim/sources');
    const cap = { status: null, body: null };
    const res = { writeHead(s) { cap.status = s; }, end() {} };
    const sendJson = (r, status, payload) => { cap.status = status; cap.body = payload; };
    const handled = BRIDGE.handle({ on() {} }, res,
        { url, pathname: url.pathname, method: 'GET', sendJson, scenarios: stub || scenariosStub() });
    return Object.assign({ handled }, cap);
}
function byKey(body) { const m = {}; (body.sources || []).forEach(s => m[s.key] = s); return m; }
function teardown() { for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} } }

(function run() {
    console.log('SOURCE-INSPECTOR-1 — scenario source chain\n');
    const fx = makeFixture({ total: 12, checkpoints: 5, geoPhases: 3 });
    process.env.RMOOZ_TESTINGAI_DIR = fx.dir;

    const stub = scenariosStub();
    const r = callSources(stub);
    ok(r.handled && r.status === 200 && r.body && r.body.ok, '0. /sources route returns 200', 'status=' + r.status);
    const k = byKey(r.body);

    // 1. red + blue docx rows
    ok(k.red_docx && k.blue_docx && /red_team\.docx/.test(k.red_docx.file) && /blue_team\.docx/.test(k.blue_docx.file),
        '1. endpoint returns red_team.docx + blue_team.docx source rows');

    // 2. scenario.json phases dynamic (12, NOT 17)
    ok(k.scenario_json && k.scenario_json.status.phases_total === 12,
        '2. scenario.json row reports phases dynamically (12, not hardcoded 17)',
        'got ' + (k.scenario_json && k.scenario_json.status.phases_total));

    // 3. Step0 = context, not phase source
    ok(k.step0 && k.step0.source_type === 'planning context' && /NOT the current phase source/i.test(k.step0.used_for) && k.step0.status.count === 2,
        '3. Step 0 rows listed as context (not phase source), 2 files found');

    // 4. oob red/blue counts
    ok(k.oob && k.oob.status.red_units === 84 && k.oob.status.blue_units === 89,
        '4. current_oob_from_docx row reports red/blue counts (84/89)',
        'got ' + (k.oob && (k.oob.status.red_units + '/' + k.oob.status.blue_units)));

    // 5. checkpoints phase count
    ok(k.checkpoints && k.checkpoints.status.phases_done === 5 && k.checkpoints.status.phases_total === 12,
        '5. checkpoints row reports phase count (5 / 12)');

    // 6. all_phases mtime/size/hash present
    ok(k.all_phases && k.all_phases.status.present === true && k.all_phases.status.size > 0
       && typeof k.all_phases.status.sha256 === 'string' && k.all_phases.status.features
       && k.all_phases.status.features.phases === 3,
        '6. all_phases row reports mtime/size/sha256 + feature counts when present');

    // 7. generated files editable:false
    ok([k.oob, k.checkpoints, k.all_phases, k.export].every(s => s && s.editable === false),
        '7. generated files (oob/checkpoints/all_phases/export) marked editable:false');

    // 8. DOCX + scenario.json editable:true
    ok(k.red_docx.editable === true && k.blue_docx.editable === true && k.scenario_json.editable === true,
        '8. DOCX + scenario.json marked editable:true');

    // 9. GeoJSON = output not source
    ok(k.all_phases.source_type === 'final output',
        '9. all_phases.geojson marked source_type=final output (output, not source)');

    // 10. no DOCX parsing in RMOOZ
    ok(!/mammoth|adm-zip|jszip|unzipper|extractRawText|parseDocx|docx4js/i.test(BRIDGE_SRC),
        '10. no DOCX-parsing libs in the bridge');

    // 11. /sources triggers no WarGamingGEN run (route + computeSources contain no spawn)
    {
        const routeIdx = BRIDGE_SRC.indexOf("'/api/wargame-sim/sources'");
        const routeBlock = BRIDGE_SRC.slice(routeIdx, routeIdx + 200);
        const csIdx = BRIDGE_SRC.indexOf('function computeSources');
        const csBlock = BRIDGE_SRC.slice(csIdx, BRIDGE_SRC.indexOf('// ── FAST-DOC-2', csIdx) > csIdx ? BRIDGE_SRC.indexOf('// ── FAST-DOC-2', csIdx) : csIdx + 4000);
        ok(!/spawn\(/.test(routeBlock) && !/spawn\(/.test(csBlock),
            '11. /sources route + computeSources never spawn the sim');
    }

    // 12. no SmartSearch
    ok(!/SmartSearch/i.test(BRIDGE_SRC), '12. no SmartSearch reference in the bridge');

    // 13. no scenario DB mutation from /sources
    ok(stub.setActiveCount === 0 && stub.clearCount === 0,
        '13. /sources mutates nothing (no setActiveName / clearCache)',
        'setActive=' + stub.setActiveCount + ' clear=' + stub.clearCount);

    // 14. wizard renders inspector collapsed by default
    ok(/wg-wz-sources/.test(WIZ_SRC) && /Scenario Source Inspector/.test(WIZ_SRC)
       && !/insp\.open\s*=\s*true/.test(WIZ_SRC),
        '14. wizard adds the Source Inspector <details>, collapsed by default (no insp.open=true)');

    teardown();

    // 15. existing tests still pass
    function runExisting(file) {
        try { execSync('node ' + file, { cwd: ROOT, stdio: 'pipe' }); return true; }
        catch (e) { console.log('    (' + file + ' tail) ' + String(e.stdout || e.message).slice(-200)); return false; }
    }
    ok(runExisting('test-unified-import-2-wizard.js'), '15a. test-unified-import-2 still passes');
    ok(runExisting('test-local-import-2-wargame-output-folder.js'), '15b. test-local-import-2 still passes');
    ok(runExisting('test-fast-doc-2-publish-before-import.js'), '15c. test-fast-doc-2 still passes');

    console.log('\n' + (fail ? 'FAIL' : 'PASS') + ' — ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
