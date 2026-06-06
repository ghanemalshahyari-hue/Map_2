#!/usr/bin/env node
/**
 * test-unified-import-2-wizard.js
 *
 * UNIFIED-IMPORT-2 verifier — the one "Import Scenario" wizard + its bridge support.
 *
 * Drives wargame-sim-bridge.handle() directly with a fake req/res and a temp
 * TestingAI fixture (RMOOZ_TESTINGAI_DIR), plus static scans of the bridge +
 * wizard sources and app.html. No python is spawned (run/regenerate are exercised
 * in their disabled/manual mode), and the only scenario files the porter writes
 * (fixed data/scenarios path) are uniquely named and deleted in teardown.
 *
 *   node test-unified-import-2-wizard.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execSync } = require('child_process');

const ROOT     = __dirname;
const BRIDGE   = require(path.join(ROOT, 'UI_MOdified/server/wargame-sim-bridge.js'));
const I        = BRIDGE._internals;
const BRIDGE_SRC = fs.readFileSync(path.join(ROOT, 'UI_MOdified/server/wargame-sim-bridge.js'), 'utf8');
const WIZ_SRC    = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/scenario-import-wizard.js'), 'utf8');
const APP_HTML   = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/app.html'), 'utf8');

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  ok   ' + label); pass++; }
    else      { console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); fail++; }
}

const tmpDirs = [];
const writtenScenarios = [];

// ── W3-shaped all_phases fixture (N phases) ──
function unitF(uid, side, domain, type, phase, lon, lat) {
    return { type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: { kind: 'unit', uid, side, domain, type, name_ar: 'وحدة ' + uid, echelon: 'unit',
            phase, current_strength: 1, initial_strength: 1, destroyed: false } };
}
function objF(phase) {
    return { type: 'Feature', geometry: { type: 'Point', coordinates: [19.55, 29.74] },
        properties: { kind: 'objective', id: 'OBJ-X', name_en: 'Objective X', name_ar: 'الهدف', phase, depth_km_from_coast: 90 } };
}
function plF(phase, km) {
    return { type: 'Feature', geometry: { type: 'LineString', coordinates: [[19.12, 30.5], [20.02, 30.5]] },
        properties: { kind: 'phase_line', phase, phase_line_km: km, time_label: 'D+' + phase } };
}
function allPhases(nPhases, op) {
    const feats = [];
    const U = [['R-1','RED','ground','mech_brigade',18,32],['R-2','RED','naval','destroyer',18.3,32.5],
               ['B-1','BLUE','ground','inf_brigade',19.9,30.5],['B-2','BLUE','air','fighter_ad',20,29.1]];
    for (let ph = 0; ph < nPhases; ph++) {
        feats.push(objF(ph), plF(ph, ph * 5));
        for (const u of U) feats.push(unitF(u[0], u[1], u[2], u[3], ph, u[4], u[5]));
    }
    return { type: 'FeatureCollection', properties: { operation_name: op || 'UNI2 OP' }, features: feats };
}

// Build a temp TestingAI tree. nCk checkpoints; nExport-phase published export (0 = none).
function makeFixture(opts) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-uni2-'));
    tmpDirs.push(dir);
    const runId = opts.runId || '2026-01-02_03-04-05_uni2';
    // scenario config → phasesTotal
    const inputs = path.join(dir, 'WarGamingGEN', 'inputs');
    fs.mkdirSync(inputs, { recursive: true });
    const phases = [];
    for (let i = 0; i < (opts.total || 17); i++) phases.push({ step: i, time_label: 'D+' + i, kind: 'k' + i });
    fs.writeFileSync(path.join(inputs, 'scenario.json'), JSON.stringify({ operation_name: 'UNI2', phases }), 'utf8');
    // checkpoints
    const ck = path.join(dir, 'WarGamingGEN', 'runs', runId, 'checkpoints');
    fs.mkdirSync(ck, { recursive: true });
    for (let i = 0; i < (opts.nCk || 0); i++) {
        fs.writeFileSync(path.join(ck, 'phase' + String(i).padStart(2, '0') + '.json'), JSON.stringify({ phase: i }), 'utf8');
    }
    // optional full run outputs (complete case)
    if (opts.runOutputs) {
        const go = path.join(dir, 'WarGamingGEN', 'runs', runId, 'outputs', 'geojson');
        fs.mkdirSync(go, { recursive: true });
        fs.writeFileSync(path.join(go, 'all_phases.geojson'), JSON.stringify(allPhases(opts.runOutputs)), 'utf8');
    }
    // published export
    if (opts.nExport) {
        const ge = path.join(dir, 'export_to_rmooz', runId, 'geojson');
        fs.mkdirSync(ge, { recursive: true });
        fs.writeFileSync(path.join(ge, 'all_phases.geojson'), JSON.stringify(allPhases(opts.nExport, opts.op)), 'utf8');
        fs.writeFileSync(path.join(dir, 'export_to_rmooz', 'latest.json'),
            JSON.stringify({ latest: runId, all_phases: runId + '/geojson/all_phases.geojson' }), 'utf8');
    }
    return { dir, runId };
}

function scenariosStub() {
    return { setActiveCount: 0, lastActive: null, clearCache() {}, setActiveName(n) { this.setActiveCount++; this.lastActive = n; } };
}
function call(method, urlPath, search, stub) {
    const url = new URL('http://x' + urlPath + (search || ''));
    const cap = { status: null, body: null };
    const res = { writeHead(s) { cap.status = s; }, end() {} };
    const sendJson = (r, status, payload) => { cap.status = status; cap.body = payload; };
    const handled = BRIDGE.handle({ on() {} }, res, { url, pathname: url.pathname, method, sendJson, scenarios: stub || scenariosStub() });
    return Object.assign({ handled }, cap);
}

function teardown() {
    for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
    for (const f of writtenScenarios) { try { fs.unlinkSync(f); } catch (_) {} }
}

(function run() {
    console.log('UNIFIED-IMPORT-2 — wizard + bridge\n');
    delete process.env.RMOOZ_ALLOW_SIM_RUN;   // ensure run/regenerate stay in manual mode (no spawn)

    // ── 2) resume=1 appends --resume; full run keeps --all ──
    ok(JSON.stringify(I.runArgs(false)) === '["tests/test_full_run.py","--all"]', '2a. runArgs(false) = full --all');
    ok(JSON.stringify(I.runArgs(true)) === '["tests/test_full_run.py","--all","--resume"]', '2b. runArgs(true) appends --resume');
    ok(/spawn\(c\.python,\s*runArgs\(resume\)/.test(BRIDGE_SRC), '2c. /run spawns runArgs(resume)');

    // ── 7) regenerate route uses regenerate_outputs, NO LLM ──
    ok(/regenerate_outputs/.test(I.regenArgs('R1').join(' ')) && !/test_full_run/.test(I.regenArgs('R1').join(' ')),
        '7a. regenArgs invokes regenerate_outputs (not test_full_run)');
    {
        const block = BRIDGE_SRC.slice(BRIDGE_SRC.indexOf('/api/wargame-sim/regenerate'),
                                       BRIDGE_SRC.indexOf('/api/wargame-sim/publish'));
        ok(block.length > 50 && !/LLM_/.test(block) && /env:\s*process\.env/.test(block),
            '7b. regenerate handler sets no LLM_* env (no LLM)');
    }

    // ── 1)/3) status exposes real progress counted from checkpoints ──
    {
        const fx = makeFixture({ nCk: 4, nExport: 0, total: 17 });
        process.env.RMOOZ_TESTINGAI_DIR = fx.dir;
        const r = call('GET', '/api/wargame-sim/status');
        const sim = r.body && r.body.sim;
        ok(r.status === 200 && sim && sim.phases_done === 4 && sim.phases_total === 17,
            '1/3. status: phases_done counted from 4 checkpoints, phases_total=17',
            JSON.stringify(sim && { d: sim.phases_done, t: sim.phases_total }));
        ok(sim.partial_available === true && sim.partial_import_allowed === true && sim.can_resume === true
           && sim.last_run_id === fx.runId && sim.status === 'stopped_partial',
            '1b. status: partial_available/allowed/can_resume/last_run_id/status correct',
            JSON.stringify({ pa: sim.partial_available, pia: sim.partial_import_allowed, st: sim.status }));
    }

    // ── 4) progress percentage maps correctly (client formula) ──
    {
        const map = (d, t) => Math.min(80, 20 + Math.round(60 * (d / t)));
        ok(map(0, 17) === 20 && map(17, 17) === 80 && Math.round((map(8, 16))) === 50,
            '4a. progress maps 0→20, half→50, full→80');
        ok(/20 \+ Math\.round\(60 \* \(done \/ total\)\)/.test(WIZ_SRC), '4b. wizard uses the documented 20+60*(done/total) formula');
    }

    // ── 5) N<4 partial import is blocked (no write) ──
    {
        const fx = makeFixture({ nCk: 3, nExport: 3, runId: '2026-01-03_00-00-00_uni2', op: 'SMALL OP' });
        process.env.RMOOZ_TESTINGAI_DIR = fx.dir;
        const stub = scenariosStub();
        const r = call('POST', '/api/wargame-sim/import', '?partial=1', stub);
        ok(r.status === 400 && r.body && /at least 4/.test(r.body.error || '') && stub.setActiveCount === 0,
            '5. partial import with 3 phases → 400, nothing written',
            'status=' + r.status + ' err=' + (r.body && r.body.error));
    }

    // ── 6)/8) N>=4 partial import allowed + metadata stamped + versioned name ──
    {
        const fx = makeFixture({ nCk: 4, nExport: 4, runId: '2026-01-04_00-00-00_uni2', op: 'BIG OP' });
        process.env.RMOOZ_TESTINGAI_DIR = fx.dir;
        const stub = scenariosStub();
        const r = call('POST', '/api/wargame-sim/import', '?partial=1', stub);
        if (r.body && r.body.file) writtenScenarios.push(r.body.file);
        let onDisk = null; try { onDisk = JSON.parse(fs.readFileSync(r.body.file, 'utf8')); } catch (_) {}
        ok(r.status === 200 && r.body.ok && r.body.partial_import === true
           && r.body.generation_status === 'partial' && r.body.generated_phase_count === 4
           && r.body.expected_phase_count === 17 && /__partial-04$/.test(r.body.name)
           && r.body.can_resume_generation === true && stub.setActiveCount === 1,
            '6/8a. partial import (4 phases) → 200, metadata + versioned name + active set',
            'status=' + r.status + ' name=' + (r.body && r.body.name));
        ok(onDisk && onDisk.generation_status === 'partial' && onDisk.generated_phase_count === 4
           && onDisk.expected_phase_count === 17 && onDisk.partial_import === true
           && onDisk.source === 'WarGamingGEN' && onDisk.source_run === fx.runId,
            '8b. partial metadata persisted on disk', onDisk && JSON.stringify({ gs: onDisk.generation_status, n: onDisk.generated_phase_count }));
    }

    // ── 9) anti-clobber: cannot overwrite a different generation unless replace=1 ──
    {
        const fx = makeFixture({ nCk: 4, nExport: 4, runId: '2026-01-05_00-00-00_uni2', op: 'CLOBBER OP' });
        process.env.RMOOZ_TESTINGAI_DIR = fx.dir;
        const fixedName = 'uni2-clobber-' + (8000 + Math.floor(os.uptime() % 900));
        const target = I.scenarioFilePath(fixedName);
        // Pre-existing COMPLETE scenario from a DIFFERENT run.
        fs.writeFileSync(target, JSON.stringify({ name: fixedName, generation_status: 'complete', source_run: 'OTHER_RUN' }), 'utf8');
        writtenScenarios.push(target);
        const r1 = call('POST', '/api/wargame-sim/import', '?partial=1&name=' + fixedName);
        ok(r1.status === 409 && r1.body && r1.body.clobber === true,
            '9a. partial import over a different generation → 409 clobber', 'status=' + r1.status);
        const r2 = call('POST', '/api/wargame-sim/import', '?partial=1&name=' + fixedName + '&replace=1');
        ok(r2.status === 200 && r2.body && r2.body.ok && r2.body.generation_status === 'partial',
            '9b. ?replace=1 overrides the clobber guard', 'status=' + r2.status);
    }

    // ── 10) full success route sequence preserved (publish→import→open) ──
    {
        ok(/POST',\s*'\/api\/wargame-sim\/publish'/.test(WIZ_SRC)
           && /POST',\s*'\/api\/wargame-sim\/import'\)/.test(WIZ_SRC)
           && WIZ_SRC.indexOf("'/api/wargame-sim/publish'") < WIZ_SRC.indexOf("'/api/wargame-sim/import'")
           && /loadLiveScenarioFromJson/.test(WIZ_SRC),
            '10a. wizard finish: publish → import → loadLiveScenarioFromJson');
        // full import still works end-to-end through the porter
        const fx = makeFixture({ nCk: 17, nExport: 17, runOutputs: 17, runId: '2026-01-06_00-00-00_uni2', op: 'FULL OP' });
        process.env.RMOOZ_TESTINGAI_DIR = fx.dir;
        const stub = scenariosStub();
        const r = call('POST', '/api/wargame-sim/import', '?name=uni2-full-test', stub);
        if (r.body && r.body.file) writtenScenarios.push(r.body.file);
        ok(r.status === 200 && r.body.ok && r.body.source === 'WarGamingGEN'
           && r.body.steps === 17 && r.body.partial_import === false && r.body.generation_status === 'complete',
            '10b. full import unchanged (source=WarGamingGEN, 17 steps, complete)', 'status=' + r.status);
    }

    // ── 11) old import cards kept + relocated under Advanced ──
    {
        ok(/shell\/wargame-geojson-import\.js/.test(APP_HTML) && /shell\/wargame-sim-import\.js/.test(APP_HTML)
           && /shell\/wargame-local-import\.js/.test(APP_HTML) && /shell\/scenario-import-wizard\.js/.test(APP_HTML),
            '11a. app.html keeps all 3 legacy import scripts + the wizard');
        ok(/wg-geojson-import-card/.test(WIZ_SRC) && /wg-sim-import-card/.test(WIZ_SRC) && /wg-local-import-card/.test(WIZ_SRC)
           && /Advanced Import Tools/.test(WIZ_SRC),
            '11b. wizard relocates the 3 cards into an "Advanced Import Tools" details');
    }

    // ── 12) no DOCX parsing in RMOOZ (bridge + wizard) ──
    {
        const docx = /mammoth|adm-zip|jszip|unzipper|extractRawText|parseDocx|docx4js/i;
        ok(!docx.test(BRIDGE_SRC) && !docx.test(WIZ_SRC), '12. no DOCX-parsing libs in bridge or wizard');
    }

    // ── 13) no SmartSearch modification referenced ──
    ok(!/SmartSearch/i.test(BRIDGE_SRC) && !/SmartSearch/i.test(WIZ_SRC), '13. no SmartSearch reference in bridge or wizard');

    // ── 14) no import before explicit Start / partial click ──
    {
        // Everything from the on-load status call to EOF (the load path + window API).
        const loadBlock = WIZ_SRC.slice(WIZ_SRC.indexOf('Initial read-only status'));
        ok(loadBlock.length > 30 && !/wargame-sim\/import/.test(loadBlock),
            '14a. wizard load path performs no import');
        ok(/el\.start\.addEventListener\('click'/.test(WIZ_SRC) && /el\.partial\.addEventListener\('click', importPartial\)/.test(WIZ_SRC),
            '14b. import is reachable only via Start→success or the partial button');
    }

    // ── status check itself does not import (extra guard) ──
    {
        const fx = makeFixture({ nCk: 5, nExport: 0, runId: '2026-01-07_00-00-00_uni2' });
        process.env.RMOOZ_TESTINGAI_DIR = fx.dir;
        const stub = scenariosStub();
        call('GET', '/api/wargame-sim/status', '', stub);
        ok(stub.setActiveCount === 0, '14c. GET status sets no active scenario (no auto-import)');
    }

    teardown();

    // ── 15) existing tests still pass ──
    function runExisting(file) {
        try { execSync('node ' + file, { cwd: ROOT, stdio: 'pipe' }); return true; }
        catch (e) { console.log('    (' + file + ' output tail) ' + String(e.stdout || e.message).slice(-300)); return false; }
    }
    ok(runExisting('test-local-import-2-wargame-output-folder.js'), '15a. test-local-import-2 still passes');
    ok(runExisting('test-fast-doc-2-publish-before-import.js'), '15b. test-fast-doc-2 still passes');

    console.log('\n' + (fail ? 'FAIL' : 'PASS') + ' — ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
