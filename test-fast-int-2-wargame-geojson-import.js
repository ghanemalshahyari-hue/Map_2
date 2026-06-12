#!/usr/bin/env node
/**
 * test-fast-int-2-wargame-geojson-import.js
 *
 * FAST-INT-2 verifier — the WarGamingGEN GeoJSON Import UI Bridge.
 *
 * Proves the EXISTING importer (scripts/port-wargame.js) + POST /api/scenario/import
 * faithfully turn a WarGamingGEN-shaped GeoJSON into a RMOOZ scenario with:
 *   - matching unit/phase counts (no invented units)
 *   - coordinates that all trace back to the source (no invented coords)
 *   - objective imported
 *   - SIDC/symbol data present (porter-generated from domain/type)
 *   - external-pipeline provenance stamped server-side
 *   - a result that passes the same validator the loader runs (display works)
 *   - NO hardcoded Wargame 1/2 data
 *
 * Part A: direct porter call (no server, no disk write).
 * Part B: HTTP route — spawns web-server.js on a temp data dir + random port.
 *
 * Self-contained: uses a SYNTHETIC fixture (not Wargame 1/2 data). The one
 * scenario file the route writes (fixed path UI_MOdified/data/scenarios/) is
 * uniquely named and deleted in teardown.
 *
 *   node test-fast-int-2-wargame-geojson-import.js
 */
'use strict';

const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const http  = require('http');
const { spawn } = require('child_process');

const ROOT          = __dirname;
const SERVER_SCRIPT = path.join(ROOT, 'UI_MOdified/server/web-server.js');
const PORTER        = require(path.join(ROOT, 'UI_MOdified/scripts/port-wargame.js'));
const VALIDATOR     = require(path.join(ROOT, 'UI_MOdified/server/ai/scenario-validator.js'));
const SCENARIOS_DIR = path.join(ROOT, 'UI_MOdified/data/scenarios');

const PORT      = 8060 + Math.floor(Math.random() * 900);
const DATA_DIR  = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-fi2-'));
const TEST_NAME = 'fast-int-2-test-' + (8000 + Math.floor(Math.random() * 999));

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  ok   ' + label); pass++; }
    else      { console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

// ── Synthetic WarGamingGEN-shaped fixture (mirrors real v2 feature schema) ──
function unitF(uid, side, domain, type, phase, lon, lat) {
    return { type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: { kind: 'unit', uid, side, domain, type, name_ar: 'وحدة ' + uid, echelon: 'unit',
            phase, current_strength: 1, initial_strength: 1, destroyed: false,
            is_actor: false, is_affected: false, prev_lon: lon, prev_lat: lat } };
}
function objF(phase) {
    return { type: 'Feature', geometry: { type: 'Point', coordinates: [19.55, 29.74] },
        properties: { kind: 'objective', id: 'OBJ-X', name_en: 'Objective X', name_ar: 'الهدف',
            phase, depth_km_from_coast: 90.1 } };
}
function plF(phase, km, tl) {
    return { type: 'Feature', geometry: { type: 'LineString', coordinates: [[19.12, 30.5], [20.02, 30.5]] },
        properties: { kind: 'phase_line', phase, phase_line_km: km, time_label: tl } };
}
function buildFixture() {
    const feats = [];
    const UNITS = [
        ['R-1', 'RED',  'ground', 'mech_brigade', 18.0, 32.0],
        ['R-2', 'RED',  'naval',  'destroyer',    18.3, 32.5],
        ['B-1', 'BLUE', 'ground', 'inf_brigade',  19.9, 30.5],
        ['B-2', 'BLUE', 'air',    'fighter_ad',   20.0, 29.1],
    ];
    // 5 phases — real WarGamingGEN runs 17; the loader validator requires [4..20].
    const PHASES = [[0, 0, 'D-7'], [1, 5, 'D-5'], [2, 10, 'D-3'], [3, 15, 'D-2'], [4, 20, 'D-1']];
    for (const [ph, km, tl] of PHASES) {
        feats.push(objF(ph), plF(ph, km, tl));
        for (const u of UNITS) feats.push(unitF(u[0], u[1], u[2], u[3], ph, u[4], u[5]));
    }
    return { type: 'FeatureCollection', name: 'fixture', properties: { operation_name: 'FIXTURE OP' }, features: feats };
}

// Expected truths computed FROM the fixture (so assertions can't drift).
function expectedFrom(fc) {
    const phases = new Set(), red = new Set(), blue = new Set(), coords = new Set();
    let hasObj = false;
    for (const f of fc.features) {
        const p = f.properties || {};
        if (Number.isInteger(p.phase)) phases.add(p.phase);
        if (p.kind === 'objective') hasObj = true;
        if (p.kind === 'unit') {
            if (p.side === 'RED') red.add(p.uid);
            if (p.side === 'BLUE') blue.add(p.uid);
        }
        if (f.geometry && f.geometry.type === 'Point') coords.add(JSON.stringify(f.geometry.coordinates));
    }
    return { phases: phases.size, red: red.size, blue: blue.size, objective: hasObj, coordSet: coords };
}

function request(method, urlPath, body) {
    return new Promise((resolve, reject) => {
        const data = body == null ? null : (typeof body === 'string' ? body : JSON.stringify(body));
        const req = http.request({ method, host: '127.0.0.1', port: PORT, path: urlPath,
            headers: data == null ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
        }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => { let j = null; try { j = JSON.parse(Buffer.concat(chunks)); } catch (_) {} resolve({ status: res.statusCode, body: j }); });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}
function waitForServer(tries) {
    return request('GET', '/api/ai/scenarios').catch(() => {
        if (tries <= 0) throw new Error('server did not start');
        return new Promise(r => setTimeout(r, 200)).then(() => waitForServer(tries - 1));
    });
}

(async function main() {
    const fc = buildFixture();
    const exp = expectedFrom(fc);

    // ── Part A — porter, no server, no disk write ───────────────────────────
    console.log('\n── Part A: porter mapping fidelity (no I/O) ──');
    const s = PORTER.buildScenarioFromGeoJson(fc, { name: 'fixture-probe' });
    eq((s.steps || []).length, exp.phases, 'phase count matches source');
    eq((s.red_units || []).length, exp.red, 'Red unit count matches source (deduped by uid)');
    eq((s.blue_units_initial || []).length, exp.blue, 'Blue unit count matches source (deduped by uid)');
    ok(!!(s.obj && Array.isArray(s.obj.coord) && s.obj.coord.length === 2), 'objective imported');

    const allUnits = (s.red_units || []).concat(s.blue_units_initial || []);
    ok(allUnits.length > 0 && allUnits.every(u => u.sidc && String(u.sidc).length > 0), 'SIDC present on every imported unit (porter-generated)');
    ok(allUnits.every(u => Array.isArray(u.coord) && exp.coordSet.has(JSON.stringify(u.coord))),
       'no invented coordinates — every unit coord traces to a source feature');

    // Red units carry `uid`; blue units carry `unit_uid` — both preserve the source id.
    const srcUids = new Set(fc.features.filter(f => f.properties.kind === 'unit').map(f => f.properties.uid));
    ok(allUnits.every(u => srcUids.has(u.uid || u.unit_uid)), 'no invented units — every output id exists in the source');

    // No hardcoded Wargame 1/2 data leaking in.
    const blob = JSON.stringify(s);
    ok(!/wargame1|wargame2|Coastal Picket|coastal-shield/i.test(blob), 'no hardcoded Wargame 1/2 data in output');

    // ── Part B — HTTP route + provenance + validator (display-readiness) ─────
    console.log('\n── Part B: POST /api/scenario/import route ──');
    const child = spawn(process.execPath, [SERVER_SCRIPT], {
        env: Object.assign({}, process.env, { PORT: String(PORT), RMOOZ_DATA_DIR: DATA_DIR }),
        stdio: ['ignore', 'ignore', 'inherit'],
    });
    const writtenFile = path.join(SCENARIOS_DIR, TEST_NAME + '.json');
    try {
        await waitForServer(25);
        const resp = await request('POST',
            '/api/scenario/import?name=' + TEST_NAME + '&source_file=all_phases.geojson', fc);
        eq(resp.status, 200, 'importer route returns 200');
        ok(resp.body && resp.body.ok === true, 'response ok:true');
        eq(resp.body && resp.body.steps, exp.phases, 'route: phase count matches source');
        eq(resp.body && resp.body.red_units, exp.red, 'route: Red count matches source');
        eq(resp.body && resp.body.blue_units, exp.blue, 'route: Blue count matches source');
        eq(resp.body && resp.body.objective, true, 'route: objective imported');
        // Provenance (FAST-INT-2 §7)
        eq(resp.body && resp.body.source, 'WarGamingGEN', 'provenance source=WarGamingGEN');
        eq(resp.body && resp.body.source_file, 'all_phases.geojson', 'provenance source_file preserved');
        eq(resp.body && resp.body.generated_from_external_pipeline, true, 'provenance generated_from_external_pipeline=true');

        // Read the written scenario back and prove it would LOAD/DISPLAY.
        ok(fs.existsSync(writtenFile), 'scenario file written to disk');
        const onDisk = JSON.parse(fs.readFileSync(writtenFile, 'utf8'));
        eq(onDisk.source, 'WarGamingGEN', 'on-disk provenance source');
        eq(onDisk.generated_from_external_pipeline, true, 'on-disk provenance flag');
        const v = VALIDATOR.validateScenario(onDisk);
        ok(v.ok, 'imported scenario passes the loader validator (display works after import)',
           v.ok ? '' : VALIDATOR.formatErrors(v.errors).split('\n').slice(0, 4).join(' | '));
    } catch (e) {
        ok(false, 'route test threw', e.message);
    } finally {
        child.kill();
        try { if (fs.existsSync(writtenFile)) fs.unlinkSync(writtenFile); } catch (_) {}
        try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (_) {}
    }

    console.log('\n══════════════════════════════════════════');
    console.log('  FAST-INT-2 — Passed: ' + pass + '  |  Failed: ' + fail);
    console.log('══════════════════════════════════════════');
    console.log('  Verdict: ' + (fail === 0 ? 'PASS' : 'FAIL'));
    process.exit(fail === 0 ? 0 : 1);
})();
