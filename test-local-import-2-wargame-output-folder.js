#!/usr/bin/env node
/**
 * test-local-import-2-wargame-output-folder.js
 *
 * LOCAL-IMPORT-2 verifier — local Wargame output folder import.
 *
 * Proves wargame-local-bridge.js can list + import WarGamingGEN run folders the
 * operator copied into data/imports/wargame_outputs/<run_id>/ — through the
 * EXISTING porter — with the discovery's guardrails:
 *   - <run_id>/ with all_phases.geojson is detected; a flat dump is ignored
 *   - latest.json pointer respected; newest-by-mtime fallback when absent
 *   - stale (older-than-newest) import → 409 unless ?confirm=1
 *   - status/file never mutate the active scenario; no auto-import
 *   - import uses port-wargame.js; no DOCX parsing; no WarGamingGEN/SmartSearch
 *   - generated run folders git-ignored, but README/.gitkeep stay tracked
 *
 * No server spawn — drives bridge.handle() directly with a fake req/res and a
 * temp imports dir (RMOOZ_LOCAL_WARGAME_DIR). The porter writes one scenario to
 * the fixed data/scenarios dir under a unique name; it is deleted in teardown.
 *
 *   node test-local-import-2-wargame-output-folder.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { execSync } = require('child_process');

const ROOT          = __dirname;
const BRIDGE        = require(path.join(ROOT, 'UI_MOdified/server/wargame-local-bridge.js'));
const SCENARIOS_DIR = path.join(ROOT, 'UI_MOdified/data/scenarios');
const IMPORTS_REAL  = path.join(ROOT, 'UI_MOdified/data/imports/wargame_outputs');

const TMP       = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-li2-'));
const TEST_NAME = 'local-import-2-test-' + (8000 + Math.floor(Math.random() * 999));
const writtenScenarios = [];

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  ok   ' + label); pass++; }
    else      { console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); fail++; }
}

// ── W3-shaped all_phases fixture (mirrors FAST-INT-2; NOT Wargame 1/2 data) ──
function unitF(uid, side, domain, type, phase, lon, lat) {
    return { type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: { kind: 'unit', uid, side, domain, type, name_ar: 'وحدة ' + uid, echelon: 'unit',
            phase, current_strength: 1, initial_strength: 1, destroyed: false } };
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
function buildFixture(opName) {
    const feats = [];
    const UNITS = [
        ['R-1', 'RED',  'ground', 'mech_brigade', 18.0, 32.0],
        ['R-2', 'RED',  'naval',  'destroyer',    18.3, 32.5],
        ['B-1', 'BLUE', 'ground', 'inf_brigade',  19.9, 30.5],
        ['B-2', 'BLUE', 'air',    'fighter_ad',   20.0, 29.1],
    ];
    const PHASES = [[0, 0, 'D-7'], [1, 5, 'D-5'], [2, 10, 'D-3'], [3, 15, 'D-2'], [4, 20, 'D-1']];
    for (const [ph, km, tl] of PHASES) {
        feats.push(objF(ph), plF(ph, km, tl));
        for (const u of UNITS) feats.push(unitF(u[0], u[1], u[2], u[3], ph, u[4], u[5]));
    }
    return { type: 'FeatureCollection', name: 'fixture',
        properties: { operation_name: opName || 'FIXTURE OP' }, features: feats };
}

// Create a run folder with all_phases.geojson; optionally stamp an mtime.
function makeRun(runId, mtimeMs) {
    const dir = path.join(TMP, runId);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'all_phases.geojson');
    fs.writeFileSync(file, JSON.stringify(buildFixture('OP ' + runId)), 'utf8');
    if (mtimeMs) { const t = mtimeMs / 1000; fs.utimesSync(file, t, t); }
    return dir;
}

// ── fake req/res harness: drives bridge.handle directly ──
function makeScenariosStub() {
    return { setActiveCount: 0, clearCount: 0, lastActive: null,
        clearCache() { this.clearCount++; }, setActiveName(n) { this.setActiveCount++; this.lastActive = n; } };
}
function call(method, urlPath, search, scenariosStub) {
    const url = new URL('http://x' + urlPath + (search || ''));
    const captured = { status: null, body: null, raw: null };
    const res = {
        writeHead(s) { captured.status = s; },
        end(buf) { captured.raw = buf; },
    };
    const sendJson = (r, status, payload) => { captured.status = status; captured.body = payload; };
    const handled = BRIDGE.handle({}, res, {
        url, pathname: url.pathname, method, sendJson,
        scenarios: scenariosStub || makeScenariosStub(),
    });
    return Object.assign({ handled }, captured);
}

function teardown() {
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (_) {}
    for (const f of writtenScenarios) { try { fs.unlinkSync(f); } catch (_) {} }
}

(function run() {
    console.log('LOCAL-IMPORT-2 — local Wargame output folder import\n');
    process.env.RMOOZ_LOCAL_WARGAME_DIR = TMP;

    // ── 1) missing imports folder handled safely (TMP has no run yet) ──
    {
        const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-li2-empty-'));
        const gone = path.join(empty, 'does-not-exist-yet');
        process.env.RMOOZ_LOCAL_WARGAME_DIR = gone;
        const r = call('GET', '/api/wargame-local/status');
        ok(r.handled && r.status === 200 && r.body && r.body.ok && r.body.run_count === 0,
            '1. missing imports folder → status ok, 0 runs (no throw)',
            'status=' + r.status + ' body=' + JSON.stringify(r.body && r.body.run_count));
        process.env.RMOOZ_LOCAL_WARGAME_DIR = TMP;
        try { fs.rmSync(empty, { recursive: true, force: true }); } catch (_) {}
    }

    // Build two runs: runA (older) and runB (newer).
    const T = 1_700_000_000_000;
    makeRun('run_a_old', T);
    makeRun('run_b_new', T + 60_000);

    // ── 2) valid <run_id>/all_phases.geojson detected ──
    {
        const r = call('GET', '/api/wargame-local/status');
        const ids = (r.body.runs || []).map(x => x.run_id).sort();
        const a = (r.body.runs || []).find(x => x.run_id === 'run_a_old');
        ok(r.body.run_count === 2 && ids.join(',') === 'run_a_old,run_b_new' && a && a.all_phases.present && a.all_phases.sha256,
            '2. valid run folders detected with all_phases + sha256',
            'ids=' + ids.join(',') );
    }

    // ── 3) flat dump (no <run_id>/) is ignored ──
    {
        fs.writeFileSync(path.join(TMP, 'all_phases.geojson'), JSON.stringify(buildFixture('FLAT')), 'utf8');
        const r = call('GET', '/api/wargame-local/status');
        const runIds = (r.body.runs || []).map(x => x.run_id);
        const ignoredFlat = (r.body.ignored || []).some(x => x.name === 'all_phases.geojson');
        ok(!runIds.includes('all_phases.geojson') && r.body.run_count === 2 && ignoredFlat,
            '3. flat all_phases.geojson (no run_id) ignored, not a run',
            'runs=' + runIds.join(',') + ' ignored=' + JSON.stringify(r.body.ignored));
        fs.unlinkSync(path.join(TMP, 'all_phases.geojson'));
    }

    // ── 4) latest.json pointer respected ──
    {
        fs.writeFileSync(path.join(TMP, 'latest.json'), JSON.stringify({ latest: 'run_a_old' }), 'utf8');
        const r = call('GET', '/api/wargame-local/status');
        ok(r.body.latest_run_id === 'run_a_old' && r.body.latest_source === 'pointer',
            '4. latest.json pointer respected (selects run_a_old)',
            'latest=' + r.body.latest_run_id + ' src=' + r.body.latest_source);
    }

    // ── 5) newest-by-mtime fallback when latest.json absent ──
    {
        fs.unlinkSync(path.join(TMP, 'latest.json'));
        const r = call('GET', '/api/wargame-local/status');
        ok(r.body.latest_run_id === 'run_b_new' && r.body.latest_source === 'mtime',
            '5. no latest.json → newest-by-mtime fallback (run_b_new)',
            'latest=' + r.body.latest_run_id + ' src=' + r.body.latest_source);
    }

    // ── 8) status check performs NO import (assert before any import) ──
    {
        const stub = makeScenariosStub();
        call('GET', '/api/wargame-local/status', '?run=run_a_old&summary=1', stub);
        ok(stub.setActiveCount === 0,
            '8. status (even with summary) never sets active scenario',
            'setActiveCount=' + stub.setActiveCount);
    }

    // ── 6) stale import (older run, no confirm) → 409 ──
    {
        const stub = makeScenariosStub();
        const r = call('POST', '/api/wargame-local/import', '?run=run_a_old&name=' + TEST_NAME, stub);
        ok(r.status === 409 && r.body && r.body.stale === true && stub.setActiveCount === 0,
            '6. stale import (run_a_old < run_b_new) → 409, no mutation',
            'status=' + r.status + ' setActive=' + stub.setActiveCount);
    }

    // ── 7) ?confirm=1 permits stale import + provenance flag ──
    {
        const stub = makeScenariosStub();
        const r = call('POST', '/api/wargame-local/import', '?run=run_a_old&confirm=1&name=' + TEST_NAME, stub);
        if (r.body && r.body.file) writtenScenarios.push(r.body.file);
        ok(r.status === 200 && r.body.ok && r.body.imported_stale === true
           && r.body.source === 'WarGamingGEN-local' && r.body.source_run === 'run_a_old'
           && r.body.imported_from_geojson === true && stub.setActiveCount === 1
           && r.body.local_import_path === 'run_a_old/all_phases.geojson'
           && !path.isAbsolute(r.body.local_import_path || 'x'),
            '7. ?confirm=1 imports stale run; provenance + relative path stamped; active set',
            'status=' + r.status + ' body=' + JSON.stringify({ src: r.body.source, stale: r.body.imported_stale, p: r.body.local_import_path }));
    }

    // ── 9) import uses port-wargame.js (scenario has porter-derived structure) ──
    {
        const stub = makeScenariosStub();
        const r = call('POST', '/api/wargame-local/import', '?run=run_b_new&name=' + TEST_NAME + '-b', stub);
        if (r.body && r.body.file) writtenScenarios.push(r.body.file);
        let onDisk = null;
        try { onDisk = JSON.parse(fs.readFileSync(r.body.file, 'utf8')); } catch (_) {}
        const porterShaped = onDisk && Array.isArray(onDisk.steps) && Array.isArray(onDisk.bls_template)
            && Array.isArray(onDisk.phase_table) && typeof onDisk.ported_at === 'string';
        ok(r.status === 200 && r.body.ok && r.body.steps === 5 && r.body.red_units === 2
           && r.body.blue_units === 2 && r.body.objective === true && porterShaped
           && onDisk.source === 'WarGamingGEN-local' && onDisk.source_run === 'run_b_new',
            '9. import routed through porter (5 phases, 2R/2B, OBJ, porter fields)',
            'status=' + r.status + ' steps=' + (r.body && r.body.steps) + ' porterShaped=' + porterShaped);
    }

    // ── 10) bridge never parses DOCX ──
    {
        const src = fs.readFileSync(path.join(ROOT, 'UI_MOdified/server/wargame-local-bridge.js'), 'utf8');
        const parsesDocx = /mammoth|unzip|adm-zip|jszip|\.docx['"`]\s*\)|extractRawText|parseDocx/i.test(src);
        ok(!parsesDocx, '10. bridge contains no DOCX parsing', parsesDocx ? 'found docx-parse token' : '');
    }

    // ── 11) no WarGamingGEN run / SmartSearch / external-path coupling ──
    // Strip comments first — the header DOCUMENTS what the bridge does NOT
    // couple to, so the scan must look at executable code only.
    {
        const raw = fs.readFileSync(path.join(ROOT, 'UI_MOdified/server/wargame-local-bridge.js'), 'utf8');
        const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
        const couples = /SmartSearch|runs\/latest|export_to_rmooz|child_process|spawn\(|TestingAI|WarGamingGEN\/|ollama|http:\/\//i.test(code);
        ok(!couples, '11. bridge code does not run WarGamingGEN/SmartSearch or read external paths',
            couples ? 'found coupling token in code' : '');
    }

    // ── 12) no scenario mutation before an explicit import (file + status read-only) ──
    {
        const stub = makeScenariosStub();
        call('GET', '/api/wargame-local/status', '', stub);
        call('GET', '/api/wargame-local/file', '?run=run_b_new', stub);
        ok(stub.setActiveCount === 0 && stub.clearCount === 0,
            '12. status + file are read-only (no clearCache / setActive before import)',
            'setActive=' + stub.setActiveCount + ' clear=' + stub.clearCount);
    }

    // ── 13) git: run folders ignored, README/.gitkeep tracked ──
    {
        let runIgnored = false, readmeTracked = false, gitkeepTracked = false;
        // Probe a sample run-folder file under the REAL imports dir.
        const probe = path.join(IMPORTS_REAL, '__li2_probe__', 'all_phases.geojson');
        try {
            fs.mkdirSync(path.dirname(probe), { recursive: true });
            fs.writeFileSync(probe, '{}', 'utf8');
            try { execSync('git check-ignore -q "' + probe + '"', { cwd: ROOT }); runIgnored = true; }
            catch (_) { runIgnored = false; }
        } catch (_) {}
        finally { try { fs.rmSync(path.join(IMPORTS_REAL, '__li2_probe__'), { recursive: true, force: true }); } catch (_) {} }
        // README + .gitkeep must NOT be ignored.
        const notIgnored = (p) => {
            try { execSync('git check-ignore -q "' + p + '"', { cwd: ROOT }); return false; }
            catch (_) { return true; }   // non-zero exit = not ignored
        };
        readmeTracked  = notIgnored(path.join(IMPORTS_REAL, 'README.md'));
        gitkeepTracked = notIgnored(path.join(IMPORTS_REAL, '.gitkeep'));
        ok(runIgnored && readmeTracked && gitkeepTracked,
            '13. run folders git-ignored; README + .gitkeep tracked',
            'runIgnored=' + runIgnored + ' readme=' + readmeTracked + ' gitkeep=' + gitkeepTracked);
    }

    teardown();
    console.log('\n' + (fail ? 'FAIL' : 'PASS') + ' — ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
})();
