#!/usr/bin/env node
/**
 * test-fast-doc-1-docx-sim-bridge.js
 *
 * FAST-DOC-1 verifier — the DOCX → WarGamingGEN → GeoJSON import bridge.
 *
 * Spawns web-server.js with RMOOZ_TESTINGAI_DIR + RMOOZ_DATA_DIR pointed at a
 * temp dir, then exercises:
 *   - GET  /api/wargame-sim/status      (waiting_for_docs)
 *   - POST /api/wargame-sim/stage-doc   (valid .docx accepted; non-docx + bad slot rejected)
 *   - POST /api/wargame-sim/run         (manual mode when runner disabled — no LLM, no exec)
 *   - POST /api/wargame-sim/import      (porter import of a synthetic export + provenance)
 *
 * Self-contained: synthetic .docx (ZIP/PK header) + synthetic all_phases.geojson
 * (5 phases — NOT Wargame 1/2 data). The one scenario file the importer writes
 * (fixed repo path) is uniquely named + deleted in teardown.
 *
 *   node test-fast-doc-1-docx-sim-bridge.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const http = require('http');
const { spawn } = require('child_process');

const ROOT          = __dirname;
const SERVER_SCRIPT = path.join(ROOT, 'UI_MOdified/server/web-server.js');
const VALIDATOR     = require(path.join(ROOT, 'UI_MOdified/server/ai/scenario-validator.js'));
const SCENARIOS_DIR = path.join(ROOT, 'UI_MOdified/data/scenarios');

const PORT       = 8070 + Math.floor(Math.random() * 800);
const TESTINGAI  = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-fd1-tai-'));
const DATA_DIR   = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-fd1-data-'));
const EXPORT_DIR = path.join(TESTINGAI, 'export_to_rmooz');
const IMPORT_DIR = path.join(TESTINGAI, 'import_from_rmooz');

let pass = 0, fail = 0;
function ok(c, label, detail) { if (c) { console.log('  ok   ' + label); pass++; } else { console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); fail++; } }
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

// minimal fake .docx (just needs the ZIP/PK signature the bridge checks)
function fakeDocx() { return Buffer.concat([Buffer.from([0x50, 0x4B, 0x03, 0x04]), Buffer.from('fake docx payload')]); }

// synthetic WarGamingGEN-shaped all_phases.geojson (5 phases → passes validator)
function buildAllPhases() {
    const U = [['R-1','RED','ground','mech_brigade',18,32],['R-2','RED','naval','destroyer',18.3,32.5],
               ['B-1','BLUE','ground','inf_brigade',19.9,30.5],['B-2','BLUE','air','fighter_ad',20,29.1]];
    const feats = [];
    [[0,0,'D-7'],[1,5,'D-5'],[2,10,'D-3'],[3,15,'D-2'],[4,20,'D-1']].forEach(function (ph) {
        feats.push({ type:'Feature', geometry:{type:'Point',coordinates:[19.55,29.74]},
            properties:{kind:'objective',id:'OBJ-X',name_en:'Objective X',name_ar:'الهدف',phase:ph[0],depth_km_from_coast:90.1}});
        feats.push({ type:'Feature', geometry:{type:'LineString',coordinates:[[19.12,30.5],[20.02,30.5]]},
            properties:{kind:'phase_line',phase:ph[0],phase_line_km:ph[1],time_label:ph[2]}});
        U.forEach(function (u) { feats.push({ type:'Feature', geometry:{type:'Point',coordinates:[u[4],u[5]]},
            properties:{kind:'unit',uid:u[0],side:u[1],domain:u[2],type:u[3],name_ar:'وحدة '+u[0],echelon:'unit',
                phase:ph[0],current_strength:1,initial_strength:1,destroyed:false,is_actor:false,is_affected:false,prev_lon:u[4],prev_lat:u[5]}}); });
    });
    return { type:'FeatureCollection', name:'fixture', properties:{operation_name:'FD1 OP'}, features:feats };
}

function request(method, urlPath, body, raw) {
    return new Promise(function (resolve, reject) {
        var data = body == null ? null : (raw ? body : Buffer.from(JSON.stringify(body)));
        var req = http.request({ method:method, host:'127.0.0.1', port:PORT, path:urlPath,
            headers: data == null ? {} : { 'Content-Type': raw ? 'application/octet-stream' : 'application/json', 'Content-Length': data.length }
        }, function (res) { var ch=[]; res.on('data',c=>ch.push(c)); res.on('end',function(){ var j=null; try{j=JSON.parse(Buffer.concat(ch));}catch(_){} resolve({status:res.statusCode,body:j}); }); });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}
function waitFor(n){ return request('GET','/api/wargame-sim/status').catch(function(){ if(n<=0) throw new Error('no server'); return new Promise(r=>setTimeout(r,200)).then(()=>waitFor(n-1)); }); }

(async function main() {
    const child = spawn(process.execPath, [SERVER_SCRIPT], {
        env: Object.assign({}, process.env, { PORT:String(PORT), RMOOZ_DATA_DIR:DATA_DIR, RMOOZ_TESTINGAI_DIR:TESTINGAI }),
        stdio: ['ignore','ignore','inherit'],
    });
    const writtenFiles = [];
    try {
        await waitFor(25);

        console.log('\n── status: waiting for docs ──');
        let r = await request('GET', '/api/wargame-sim/status');
        eq(r.status, 200, 'status route 200');
        ok(r.body && r.body.docs && r.body.docs.red === false && r.body.docs.blue === false, 'no docs staged yet');
        ok(r.body && r.body.export && r.body.export.all_phases === false, 'no export yet');
        eq(r.body && r.body.runEnabled, false, 'local runner disabled by default');
        ok(r.body && r.body.commands && r.body.commands.full_run && r.body.commands.regenerate, 'manual commands provided');

        console.log('\n── stage-doc validation ──');
        r = await request('POST', '/api/wargame-sim/stage-doc?slot=bogus', fakeDocx(), true);
        eq(r.status, 400, 'bad slot rejected');
        r = await request('POST', '/api/wargame-sim/stage-doc?slot=red', Buffer.from('not a zip'), true);
        eq(r.status, 400, 'non-docx (no PK signature) rejected');

        console.log('\n── stage red + blue ──');
        r = await request('POST', '/api/wargame-sim/stage-doc?slot=red', fakeDocx(), true);
        ok(r.status === 200 && r.body && r.body.ok, 'red_team.docx staged');
        r = await request('POST', '/api/wargame-sim/stage-doc?slot=blue', fakeDocx(), true);
        ok(r.status === 200 && r.body && r.body.ok, 'blue_team.docx staged');
        ok(fs.existsSync(path.join(IMPORT_DIR, 'red_team.docx')) && fs.existsSync(path.join(IMPORT_DIR, 'blue_team.docx')),
           'both docx written to import_from_rmooz/');
        r = await request('GET', '/api/wargame-sim/status');
        ok(r.body.docs.red && r.body.docs.blue, 'status now reports both docs uploaded');

        console.log('\n── run (manual mode, no LLM, no exec) ──');
        r = await request('POST', '/api/wargame-sim/run', {}, false);
        ok(r.body && r.body.ok === false && r.body.manual === true, 'run returns manual mode (runner disabled)');
        ok(r.body && r.body.commands && r.body.commands.full_run, 'manual run exposes the documented command');

        console.log('\n── import before export exists ──');
        r = await request('POST', '/api/wargame-sim/import', {}, false);
        eq(r.status, 404, 'import 404 when no export present');

        console.log('\n── publish a synthetic DATED export, then import via porter ──');
        const RUN_ID = '2026-06-05_99-99-99';
        const DATED = path.join(EXPORT_DIR, RUN_ID);
        fs.mkdirSync(path.join(DATED, 'geojson'), { recursive: true });
        const fc = buildAllPhases();
        fs.writeFileSync(path.join(DATED, 'geojson', 'all_phases.geojson'), JSON.stringify(fc), 'utf8');
        fs.writeFileSync(path.join(DATED, 'wargame_report.md'), '# report', 'utf8');
        fs.writeFileSync(path.join(DATED, 'wargameschedule.csv'), 'phase\n0', 'utf8');
        fs.writeFileSync(path.join(EXPORT_DIR, 'latest.json'),
            JSON.stringify({ latest: RUN_ID, all_phases: RUN_ID + '/geojson/all_phases.geojson' }), 'utf8');

        r = await request('POST', '/api/wargame-sim/import?name=fast-doc-1-test', {}, false);
        eq(r.status, 200, 'import route 200');
        ok(r.body && r.body.ok, 'import ok');
        eq(r.body && r.body.steps, 5, 'phase count matches generated output');
        eq(r.body && r.body.red_units, 2, 'Red count from geojson (not hardcoded)');
        eq(r.body && r.body.blue_units, 2, 'Blue count from geojson (not hardcoded)');
        eq(r.body && r.body.objective, true, 'objective imported');
        eq(r.body && r.body.report_present, true, 'report present flag');
        eq(r.body && r.body.schedule_present, true, 'schedule present flag');
        // provenance (FAST-DOC-1 safety)
        eq(r.body && r.body.source, 'WarGamingGEN', 'provenance source');
        eq(r.body && r.body.generated_from_docs, true, 'provenance generated_from_docs');
        eq(r.body && r.body.imported_from_geojson, true, 'provenance imported_from_geojson');
        ok(r.body && Array.isArray(r.body.input_docs) && r.body.input_docs.length === 2, 'provenance input_docs');
        eq(r.body && r.body.source_run, RUN_ID, 'provenance source_run = dated export folder');

        if (r.body && r.body.file) writtenFiles.push(r.body.file);
        const onDisk = JSON.parse(fs.readFileSync(r.body.file, 'utf8'));
        const v = VALIDATOR.validateScenario(onDisk);
        ok(v.ok, 'imported scenario passes loader validator (map will load)', v.ok ? '' : VALIDATOR.formatErrors(v.errors).split('\n').slice(0,3).join(' | '));
        eq(onDisk.generated_from_docs, true, 'on-disk provenance persisted');
        ok(!/wargame1|wargame2|Coastal Picket/i.test(JSON.stringify(onDisk)), 'no hardcoded Wargame 1/2 data');
    } catch (e) {
        ok(false, 'test threw', e.message);
    } finally {
        child.kill();
        for (const f of writtenFiles) { try { fs.unlinkSync(f); } catch (_) {} }
        try { fs.rmSync(TESTINGAI, { recursive: true, force: true }); } catch (_) {}
        try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (_) {}
    }

    console.log('\n══════════════════════════════════════════');
    console.log('  FAST-DOC-1 — Passed: ' + pass + '  |  Failed: ' + fail);
    console.log('══════════════════════════════════════════');
    console.log('  Verdict: ' + (fail === 0 ? 'PASS' : 'FAIL'));
    process.exit(fail === 0 ? 0 : 1);
})();
