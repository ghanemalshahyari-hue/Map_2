#!/usr/bin/env node
/**
 * test-fast-doc-2-publish-before-import.js
 *
 * FAST-DOC-2 verifier — Publish/Latest path clarity + stale-before-import guard.
 *
 * Three parts:
 *   A. Unit (no server): call bridge._internals.computeFreshness against a crafted
 *      fixture tree → assert stale runs/latest is DETECTED but NOT deleted, latest.txt
 *      is the preferred target, and an export older than the newest run is flagged stale.
 *   B. Integration (spawns web-server with a temp RMOOZ_TESTINGAI_DIR):
 *      /status exposes freshness; /import is BLOCKED (409) when stale and only proceeds
 *      with ?confirm=1; no scenario is written until the explicit confirmed import.
 *   C. Source guards: no DOCX parsing in RMOOZ, import still goes through port-wargame.js,
 *      runs/latest is never deleted in code, no SmartSearch/WarGamingGEN-core writes,
 *      no auto-import in the UI.
 *
 *   node test-fast-doc-2-publish-before-import.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const http = require('http');
const { spawn } = require('child_process');

const ROOT          = __dirname;
const SERVER_SCRIPT = path.join(ROOT, 'UI_MOdified/server/web-server.js');
const BRIDGE        = require(path.join(ROOT, 'UI_MOdified/server/wargame-sim-bridge.js'));
const BRIDGE_SRC    = fs.readFileSync(path.join(ROOT, 'UI_MOdified/server/wargame-sim-bridge.js'), 'utf8');
const UI_SRC        = fs.readFileSync(path.join(ROOT, 'UI_MOdified/client/shell/wargame-sim-import.js'), 'utf8');

let pass = 0, fail = 0;
function ok(c, label, detail) { if (c) { console.log('  ok   ' + label); pass++; } else { console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); fail++; } }
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

const OLD_RUN = '2026-06-05_20-00-00_oldrun';
const NEW_RUN = '2026-06-05_21-00-00_newrun';

function fakeDocx() { return Buffer.concat([Buffer.from([0x50, 0x4B, 0x03, 0x04]), Buffer.from('fake docx payload')]); }
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
    return { type:'FeatureCollection', name:'fixture', properties:{operation_name:'FD2 OP'}, features:feats };
}

// Build a fixture TestingAI tree with: a stale runs/latest real dir, latest.txt → NEW_RUN,
// a newer run dir, and a published export for the OLDER run (so export is "behind").
function buildFixture() {
    const TAI = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-fd2-tai-'));
    const runs = path.join(TAI, 'WarGamingGEN', 'runs');
    const exp  = path.join(TAI, 'export_to_rmooz');
    const mk = (p) => fs.mkdirSync(p, { recursive: true });

    // runs/latest = STALE real directory (the RC-1 trap)
    mk(path.join(runs, 'latest', 'outputs', 'geojson'));
    fs.writeFileSync(path.join(runs, 'latest', 'outputs', 'geojson', 'all_phases.geojson'), JSON.stringify(buildAllPhases()), 'utf8');
    // older + newer real run dirs
    mk(path.join(runs, OLD_RUN, 'outputs', 'geojson'));
    fs.writeFileSync(path.join(runs, OLD_RUN, 'outputs', 'geojson', 'all_phases.geojson'), JSON.stringify(buildAllPhases()), 'utf8');
    mk(path.join(runs, NEW_RUN, 'outputs', 'geojson'));
    fs.writeFileSync(path.join(runs, NEW_RUN, 'outputs', 'geojson', 'all_phases.geojson'), JSON.stringify(buildAllPhases()), 'utf8');
    // latest.txt points at the NEW run (preferred pointer)
    fs.writeFileSync(path.join(runs, 'latest.txt'), NEW_RUN + '\n', 'utf8');
    // make runs/latest + OLD run OLDER than NEW run (deterministic mtimes)
    const told = new Date('2026-06-05T16:00:00Z'), tnew = new Date('2026-06-05T17:00:00Z');
    fs.utimesSync(path.join(runs, 'latest', 'outputs', 'geojson', 'all_phases.geojson'), told, told);
    fs.utimesSync(path.join(runs, OLD_RUN, 'outputs', 'geojson', 'all_phases.geojson'), told, told);
    fs.utimesSync(path.join(runs, NEW_RUN, 'outputs', 'geojson', 'all_phases.geojson'), tnew, tnew);

    // published export = the OLDER run (so export is BEHIND the newest run)
    mk(path.join(exp, OLD_RUN, 'geojson'));
    fs.writeFileSync(path.join(exp, OLD_RUN, 'geojson', 'all_phases.geojson'), JSON.stringify(buildAllPhases()), 'utf8');
    fs.writeFileSync(path.join(exp, OLD_RUN, 'wargame_report.md'), '# r', 'utf8');
    fs.writeFileSync(path.join(exp, OLD_RUN, 'wargameschedule.csv'), 'phase\n0', 'utf8');
    fs.writeFileSync(path.join(exp, 'latest.json'), JSON.stringify({ latest: OLD_RUN, all_phases: OLD_RUN + '/geojson/all_phases.geojson' }), 'utf8');
    return { TAI, runs, exp };
}

function request(PORT, method, urlPath, body, raw) {
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
function waitFor(PORT, n){ return request(PORT,'GET','/api/wargame-sim/status').catch(function(){ if(n<=0) throw new Error('no server'); return new Promise(r=>setTimeout(r,200)).then(()=>waitFor(PORT,n-1)); }); }

(async function main() {
    // ───────────────────────────── Part A — unit: computeFreshness ─────────────
    console.log('\n── A. freshness detection (no server, no delete) ──');
    const fx = buildFixture();
    const c = { runsDir: fx.runs, exportToRmooz: fx.exp };
    const fr = BRIDGE._internals.computeFreshness(c);

    eq(fr.latest_txt && fr.latest_txt.target, NEW_RUN, 'latest.txt preferred as the current-run pointer');
    eq(fr.newest_run && fr.newest_run.name, NEW_RUN, 'newest run resolved by timestamp name');
    eq(fr.export && fr.export.run_id, OLD_RUN, 'published export points at the OLDER run');
    ok(fr.export_behind === true, 'export older than newest run is flagged export_behind');
    ok(fr.stale === true, 'overall verdict = stale');
    ok(fr.runs_latest && fr.runs_latest.exists && fr.runs_latest.is_real_dir, 'runs/latest detected as a REAL directory (RC-1)');
    ok(fr.runs_latest && fr.runs_latest.is_symlink === false, 'runs/latest correctly not a symlink');
    ok(fr.runs_latest && fr.runs_latest.stale_dir_warning === true, 'runs/latest flagged STALE (older than newest run)');
    ok(fr.export && typeof fr.export.sha256 === 'string' && fr.export.sha256.length === 64, 'export all_phases sha256 provided');
    ok(fr.export && fr.export.all_phases && fr.export.all_phases.present && fr.export.all_phases.size > 0, 'export all_phases mtime+size provided');
    // NO DELETE: runs/latest must still exist after the freshness audit
    ok(fs.existsSync(path.join(fx.runs, 'latest', 'outputs', 'geojson', 'all_phases.geojson')), 'runs/latest NOT deleted by freshness audit');

    // current-export (not behind) → not stale. A real export is copied AFTER its run,
    // so its mtime is >= the run's; reflect that (else the mtime guard correctly fires).
    fs.writeFileSync(path.join(fx.exp, 'latest.json'), JSON.stringify({ latest: NEW_RUN, all_phases: NEW_RUN + '/geojson/all_phases.geojson' }), 'utf8');
    fs.mkdirSync(path.join(fx.exp, NEW_RUN, 'geojson'), { recursive: true });
    const exNewFile = path.join(fx.exp, NEW_RUN, 'geojson', 'all_phases.geojson');
    fs.writeFileSync(exNewFile, JSON.stringify(buildAllPhases()), 'utf8');
    const tafter = new Date('2026-06-05T18:00:00Z');   // published after the 17:00 run
    fs.utimesSync(exNewFile, tafter, tafter);
    const fr2 = BRIDGE._internals.computeFreshness(c);
    ok(fr2.export_behind === false && fr2.stale === false, 'export pointing at the newest run is NOT stale');

    try { fs.rmSync(fx.TAI, { recursive: true, force: true }); } catch (_) {}

    // ───────────────────────────── Part B — integration: /status + /import guard ─
    console.log('\n── B. status freshness + stale import guard (server) ──');
    const fx2 = buildFixture();
    const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-fd2-data-'));
    const PORT = 8090 + Math.floor(Math.random() * 700);
    const TEST_NAME = 'fast-doc-2-test';
    const writtenFiles = [];
    const child = spawn(process.execPath, [SERVER_SCRIPT], {
        env: Object.assign({}, process.env, { PORT:String(PORT), RMOOZ_DATA_DIR:DATA_DIR, RMOOZ_TESTINGAI_DIR:fx2.TAI }),
        stdio: ['ignore','ignore','inherit'],
    });
    try {
        await waitFor(PORT, 25);

        let r = await request(PORT, 'GET', '/api/wargame-sim/status');
        eq(r.status, 200, 'status route 200');
        ok(r.body && r.body.freshness, 'status payload includes freshness block');
        eq(r.body.freshness.latest_txt.target, NEW_RUN, 'status: latest.txt preferred for display');
        ok(r.body.freshness.stale === true && r.body.freshness.export_behind === true, 'status: stale export detected');
        ok(r.body.paths && r.body.paths.runs, 'status: runs dir path exposed');

        // count scenario files that match our unique name BEFORE any import attempt
        const scDir = path.join(ROOT, 'UI_MOdified/data/scenarios');
        const target = path.join(scDir, TEST_NAME + '.json');
        ok(!fs.existsSync(target), 'no scenario written from status call (no auto-import)');

        // import while stale + no confirm → blocked 409, still no scenario written
        r = await request(PORT, 'POST', '/api/wargame-sim/import?name=' + TEST_NAME, {}, false);
        eq(r.status, 409, 'stale import blocked with 409');
        ok(r.body && r.body.stale === true && r.body.warning, 'stale import returns warning, not data');
        ok(!fs.existsSync(target), 'no scenario written by the blocked import (no mutation before explicit confirm)');

        // runs/latest must still be intact after server-side freshness/guard ran
        ok(fs.existsSync(path.join(fx2.runs, 'latest', 'outputs', 'geojson', 'all_phases.geojson')),
           'runs/latest NOT deleted by the server');

        // explicit override → import proceeds via porter, marks imported_stale
        r = await request(PORT, 'POST', '/api/wargame-sim/import?name=' + TEST_NAME + '&confirm=1', {}, false);
        eq(r.status, 200, 'confirmed import proceeds (operator override)');
        ok(r.body && r.body.ok && r.body.imported_stale === true, 'import flagged imported_stale=true');
        eq(r.body && r.body.source, 'WarGamingGEN', 'provenance preserved through porter');
        if (r.body && r.body.file) writtenFiles.push(r.body.file);
        ok(fs.existsSync(target), 'scenario written ONLY after explicit confirmed import');
    } catch (e) {
        ok(false, 'integration part threw', e.message);
    } finally {
        child.kill();
        for (const f of writtenFiles) { try { fs.unlinkSync(f); } catch (_) {} }
        try { fs.rmSync(fx2.TAI, { recursive: true, force: true }); } catch (_) {}
        try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (_) {}
    }

    // ───────────────────────────── Part C — source guards ──────────────────────
    console.log('\n── C. source guards (no parser / no delete / no bypass) ──');
    // no DOCX parsing in RMOOZ (bridge + UI)
    ok(!/mammoth|adm-zip|adm_zip|docx4js|extractRawText|parse_docx|parseDocx/i.test(BRIDGE_SRC), 'bridge does NOT parse DOCX');
    ok(!/mammoth|adm-zip|docx4js|extractRawText|parse_docx|parseDocx/i.test(UI_SRC), 'UI does NOT parse DOCX');
    // import still goes through port-wargame.js
    ok(/require\([^)]*port-wargame/.test(BRIDGE_SRC) && /PORTER\.(buildScenarioFromGeoJson|writeScenario)/.test(BRIDGE_SRC),
       'import uses the existing port-wargame.js porter (not a rebuilt importer)');
    // runs/latest is NEVER deleted in code (no rm/unlink/rmdir touching a "latest" path)
    ok(!/(rmSync|unlinkSync|rmdirSync|rimraf)\s*\([^)]*latest/i.test(BRIDGE_SRC), 'no code path deletes runs/latest');
    ok(!/(rmSync|unlinkSync|rmdirSync)\s*\([^)]*runs/i.test(BRIDGE_SRC), 'no code path deletes anything under runs/');
    // no SmartSearch / WarGamingGEN-core writes (freshness reads runsDir only; staging writes inputs/forces by design)
    ok(!/SmartSearch/i.test(BRIDGE_SRC), 'bridge does not touch SmartSearch');
    ok(!/writeFileSync\s*\([^)]*runs/i.test(BRIDGE_SRC), 'bridge never writes into WarGamingGEN/runs');
    // freshness is read-only: uses stat/lstat/read only
    ok(/lstatSync/.test(BRIDGE_SRC) && /statSync/.test(BRIDGE_SRC), 'freshness uses read-only stat/lstat');
    // UI: no auto-import — doImport is only invoked from the Import button click handler
    ok(/importBtn\.addEventListener\('click'[^]*doImport/.test(UI_SRC), 'UI: import bound to explicit button click');
    const autoImport = /(DOMContentLoaded|mount\(\)|setInterval|setTimeout)[^]{0,400}doImport\(/.test(UI_SRC);
    ok(!autoImport, 'UI: doImport not called automatically on load/timer');
    // UI exposes the explicit publish + stale flow
    ok(/Publish latest run/.test(UI_SRC) && /Import anyway \(stale\)/.test(UI_SRC), 'UI: explicit Publish + stale-override affordances present');

    console.log('\n══════════════════════════════════════════');
    console.log('  FAST-DOC-2 — Passed: ' + pass + '  |  Failed: ' + fail);
    console.log('══════════════════════════════════════════');
    console.log('  Verdict: ' + (fail === 0 ? 'PASS' : 'FAIL'));
    process.exit(fail === 0 ? 0 : 1);
})();
