/* ============================================================================
 * wargame-sim-bridge.js — FAST-DOC-1 / FAST-DOC-2: DOCX → WarGamingGEN → import
 * ----------------------------------------------------------------------------
 * Lets RMOOZ:
 *   1. accept red_team.docx / blue_team.docx uploads and place them where
 *      WarGamingGEN consumes them (inputs/forces, with .bak backup),
 *   2. RUN the real WarGamingGEN simulation on those DOCX (the full LLM run),
 *      forcing a working local config (LLM_LOCAL_FORCE_FALLBACK=0 + a capable
 *      local model) so it actually generates — only when explicitly enabled,
 *   3. PUBLISH each generation into its own DATED folder under
 *      export_to_rmooz/<run-id>/ (mirrors WarGamingGEN's runs/<ts> versioning,
 *      so every export is traceable to the run that produced it), and
 *   4. IMPORT the latest dated export's all_phases.geojson via the EXISTING
 *      porter (scripts/port-wargame.js), stamping DOCX provenance.
 *
 * Safety / guardrails:
 *   - DOCX only (ext + ZIP magic), fixed slots red|blue.
 *   - The ONLY runnable command is the WarGamingGEN run (test_full_run.py),
 *     and ONLY when RMOOZ_ALLOW_SIM_RUN=1. No arbitrary execution.
 *   - Import reuses port-wargame.js (no second parser, no rebuild).
 *   - No DOCX parsing in RMOOZ.
 *
 * Env config (all optional):
 *   RMOOZ_TESTINGAI_DIR   default C:/Users/ADMIN/Desktop/TestingAI
 *   RMOOZ_WARGAMEGEN_DIR  default <TESTINGAI>/WarGamingGEN
 *   RMOOZ_ALLOW_SIM_RUN   "1" to enable the real run trigger
 *   RMOOZ_SIM_MODEL       local model for the run (default qwen2.5:7b)
 *   RMOOZ_PYTHON          python executable (default "python")
 * ========================================================================== */
'use strict';

const fs   = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');                 // UI_MOdified/
const PORTER = require(path.join(ROOT, 'scripts', 'port-wargame.js'));

function cfg() {
    const testingAi = process.env.RMOOZ_TESTINGAI_DIR || 'C:/Users/ADMIN/Desktop/TestingAI';
    const wgen      = process.env.RMOOZ_WARGAMEGEN_DIR || path.join(testingAi, 'WarGamingGEN');
    return {
        testingAi, wgen,
        importFromRmooz: path.join(testingAi, 'import_from_rmooz'),
        exportToRmooz:   path.join(testingAi, 'export_to_rmooz'),
        forcesDir:       path.join(wgen, 'inputs', 'forces'),
        runsDir:         path.join(wgen, 'runs'),
        allowRun:        process.env.RMOOZ_ALLOW_SIM_RUN === '1',
        python:          process.env.RMOOZ_PYTHON || 'python',
        simModel:        process.env.RMOOZ_SIM_MODEL || 'qwen2.5:7b',
    };
}

const SLOT_FILE = { red: 'red_team.docx', blue: 'blue_team.docx' };

// Module-level state for the (long-running) simulation process.
var simState = { running: false, runName: null, startedAt: null, finishedAt: null, exitCode: null, error: null, published: null };

function mkdirp(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }
function exists(p) { try { return fs.existsSync(p); } catch (_) { return false; } }
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } }

// Windows can't create the runs/latest symlink, so pick the newest run dir by
// its timestamped name (YYYY-MM-DD_HH-MM-SS sorts lexically == chronologically).
function latestRunDir(c) {
    if (!exists(c.runsDir)) return null;
    var dirs = fs.readdirSync(c.runsDir).filter(function (n) {
        return /^\d{4}-\d{2}-\d{2}_/.test(n) && (function () { try { return fs.statSync(path.join(c.runsDir, n)).isDirectory(); } catch (_) { return false; } })();
    }).sort();
    return dirs.length ? path.join(c.runsDir, dirs[dirs.length - 1]) : null;
}

function manualCommands(c) {
    return {
        full_run:  `cd "${c.wgen}" && LLM_LOCAL_FORCE_FALLBACK=0 LLM_MODEL=${c.simModel} ${c.python} tests/test_full_run.py --all`,
        regenerate:`cd "${c.wgen}" && ${c.python} -m src.tools.regenerate_outputs`,
        note: 'RMOOZ runs the full sim only when RMOOZ_ALLOW_SIM_RUN=1; otherwise run the above manually, then Import.',
    };
}

// Copy one run's outputs into a DATED folder under export_to_rmooz and update
// the latest.json pointer. Pure file copy — no sim, no LLM.
function publishRunToExport(c, runDir, inputDocs) {
    runDir = runDir || latestRunDir(c);
    if (!runDir || !exists(runDir)) return { ok: false, error: 'no run to publish' };
    var runName = path.basename(runDir);
    var srcOut  = path.join(runDir, 'outputs');
    var srcGeo  = path.join(srcOut, 'geojson');
    if (!exists(path.join(srcGeo, 'all_phases.geojson'))) {
        return { ok: false, error: 'run ' + runName + ' has no outputs/geojson/all_phases.geojson yet' };
    }
    var destDir = path.join(c.exportToRmooz, runName);          // DATED folder
    mkdirp(path.join(destDir, 'geojson'));
    var steps = [];
    for (var f of fs.readdirSync(srcGeo)) {
        if (!/\.geojson$/i.test(f) || f.startsWith('._')) continue;
        fs.copyFileSync(path.join(srcGeo, f), path.join(destDir, 'geojson', f));
        if (/^step\d+\.geojson$/i.test(f)) steps.push('geojson/' + f);
    }
    var report = false, schedule = false;
    if (exists(path.join(srcOut, 'wargame_report.md')))   { fs.copyFileSync(path.join(srcOut, 'wargame_report.md'),   path.join(destDir, 'wargame_report.md'));   report = true; }
    if (exists(path.join(srcOut, 'wargameschedule.csv'))) { fs.copyFileSync(path.join(srcOut, 'wargameschedule.csv'), path.join(destDir, 'wargameschedule.csv')); schedule = true; }
    var manifest = {
        schema: 'testingai-export', version: 2,
        run_id: runName,
        generated_at: new Date().toISOString(),
        input_docs: inputDocs || ['red_team.docx', 'blue_team.docx'],
        files: {
            geojson_all: 'geojson/all_phases.geojson',
            geojson_steps: steps.sort(),
            report: report ? 'wargame_report.md' : null,
            schedule: schedule ? 'wargameschedule.csv' : null,
        },
    };
    fs.writeFileSync(path.join(destDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    // latest.json pointer (Windows symlink-free "runs/latest" equivalent).
    mkdirp(c.exportToRmooz);
    fs.writeFileSync(path.join(c.exportToRmooz, 'latest.json'),
        JSON.stringify({ latest: runName, all_phases: runName + '/geojson/all_phases.geojson', updated: new Date().toISOString() }, null, 2), 'utf8');
    return { ok: true, run_id: runName, dir: destDir, manifest: manifest };
}

// Resolve the latest dated export folder (via latest.json, else newest subdir).
function latestExport(c) {
    var ptr = readJson(path.join(c.exportToRmooz, 'latest.json'));
    var runName = ptr && ptr.latest;
    if (!runName && exists(c.exportToRmooz)) {
        var dirs = fs.readdirSync(c.exportToRmooz).filter(function (n) {
            return /^\d{4}-\d{2}-\d{2}_/.test(n);
        }).sort();
        runName = dirs.length ? dirs[dirs.length - 1] : null;
    }
    if (!runName) return null;
    var dir = path.join(c.exportToRmooz, runName);
    var all = path.join(dir, 'geojson', 'all_phases.geojson');
    return {
        run_id: runName, dir: dir, all_phases: all,
        all_phases_present: exists(all),
        report: exists(path.join(dir, 'wargame_report.md')),
        schedule: exists(path.join(dir, 'wargameschedule.csv')),
    };
}

// ── main router ─────────────────────────────────────────────────────────────
function handle(req, res, ctx) {
    const { url, pathname, method, sendJson } = ctx;
    if (!pathname.startsWith('/api/wargame-sim/')) return false;
    const c = cfg();

    // ── status ──
    if (pathname === '/api/wargame-sim/status' && method === 'GET') {
        var ex = latestExport(c);
        sendJson(res, 200, {
            ok: true,
            docs: { red: exists(path.join(c.importFromRmooz, SLOT_FILE.red)),
                    blue: exists(path.join(c.importFromRmooz, SLOT_FILE.blue)) },
            export: ex ? { run_id: ex.run_id, all_phases: ex.all_phases_present, report: ex.report, schedule: ex.schedule }
                       : { run_id: null, all_phases: false, report: false, schedule: false },
            sim: { running: simState.running, run_name: simState.runName, started_at: simState.startedAt,
                   finished_at: simState.finishedAt, exit_code: simState.exitCode, error: simState.error },
            runEnabled: c.allowRun,
            paths: { import_from_rmooz: c.importFromRmooz, export_to_rmooz: c.exportToRmooz, forces: c.forcesDir },
            commands: manualCommands(c),
        });
        return true;
    }

    // ── stage a docx (raw body) ──
    if (pathname === '/api/wargame-sim/stage-doc' && method === 'POST') {
        const slot = (url.searchParams.get('slot') || '').toLowerCase();
        if (!SLOT_FILE[slot]) { sendJson(res, 400, { ok: false, error: 'slot must be red|blue' }); return true; }
        const chunks = []; let size = 0; const MAX = 20_000_000;
        req.on('data', (d) => { size += d.length; if (size <= MAX) chunks.push(d); });
        req.on('error', () => sendJson(res, 400, { ok: false, error: 'upload error' }));
        req.on('end', () => {
            if (size > MAX) { sendJson(res, 413, { ok: false, error: 'file too large' }); return; }
            const buf = Buffer.concat(chunks);
            if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4B) {
                sendJson(res, 400, { ok: false, error: 'not a .docx (ZIP/PK signature missing)' }); return;
            }
            try {
                mkdirp(c.importFromRmooz);
                fs.writeFileSync(path.join(c.importFromRmooz, SLOT_FILE[slot]), buf);
                let placed = false;
                if (exists(c.forcesDir)) {
                    const dest = path.join(c.forcesDir, SLOT_FILE[slot]);
                    try { if (exists(dest)) fs.copyFileSync(dest, dest + '.bak'); fs.writeFileSync(dest, buf); placed = true; } catch (_) {}
                }
                sendJson(res, 200, { ok: true, slot, file: SLOT_FILE[slot], bytes: buf.length, placed_in_forces: placed });
            } catch (e) { sendJson(res, 500, { ok: false, error: e.message }); }
        });
        return true;
    }

    // ── run the REAL WarGamingGEN simulation on the staged DOCX ──
    if (pathname === '/api/wargame-sim/run' && method === 'POST') {
        if (!c.allowRun) {
            sendJson(res, 200, { ok: false, manual: true,
                reason: 'Local simulation run is disabled (set RMOOZ_ALLOW_SIM_RUN=1 to enable).',
                commands: manualCommands(c) });
            return true;
        }
        if (simState.running) { sendJson(res, 200, { ok: true, already_running: true, sim: simState }); return true; }
        // Force a working local config (overrides .env): kill-switch off + capable model.
        const env = Object.assign({}, process.env, { LLM_LOCAL_FORCE_FALLBACK: '0', LLM_MODEL: c.simModel });
        let child;
        try {
            child = spawn(c.python, ['tests/test_full_run.py', '--all'], { cwd: c.wgen, env: env });
        } catch (e) { sendJson(res, 500, { ok: false, error: 'spawn failed: ' + e.message }); return true; }
        simState = { running: true, runName: null, startedAt: new Date().toISOString(), finishedAt: null, exitCode: null, error: null, published: null };
        let errTail = '';
        if (child.stderr) child.stderr.on('data', (d) => { errTail = (errTail + d.toString()).slice(-1000); });
        child.on('error', (e) => { simState.running = false; simState.error = 'spawn error: ' + e.message; simState.finishedAt = new Date().toISOString(); });
        child.on('close', (code) => {
            simState.running = false; simState.exitCode = code; simState.finishedAt = new Date().toISOString();
            if (code === 0) {
                const pub = publishRunToExport(c, latestRunDir(c), ['red_team.docx', 'blue_team.docx']);
                simState.published = pub.ok ? pub.run_id : null;
                simState.runName = pub.ok ? pub.run_id : simState.runName;
                if (!pub.ok) simState.error = 'publish: ' + pub.error;
            } else {
                simState.error = 'sim exited ' + code + (errTail ? ' — ' + errTail.slice(-300) : '');
            }
        });
        sendJson(res, 200, { ok: true, started: true,
            note: 'Full WarGamingGEN run started on the staged DOCX (model ' + c.simModel + '). This takes a while; poll /status, then Import when sim.running is false and export.all_phases is true.',
            sim: simState });
        return true;
    }

    // ── publish newest run → dated export folder (no sim) ──
    if (pathname === '/api/wargame-sim/publish' && method === 'POST') {
        const pub = publishRunToExport(c, latestRunDir(c), ['red_team.docx', 'blue_team.docx']);
        sendJson(res, pub.ok ? 200 : 400, pub);
        return true;
    }

    // ── import the latest dated export via the EXISTING porter ──
    if (pathname === '/api/wargame-sim/import' && method === 'POST') {
        const ex = latestExport(c);
        if (!ex || !ex.all_phases_present) {
            sendJson(res, 404, { ok: false, error: 'no published export found — run/publish first', commands: manualCommands(c) });
            return true;
        }
        let fc;
        try { fc = JSON.parse(fs.readFileSync(ex.all_phases, 'utf8')); }
        catch (e) { sendJson(res, 400, { ok: false, error: 'invalid geojson: ' + e.message }); return true; }

        const rawName = (url.searchParams.get('name') || (fc.properties && fc.properties.operation_name) || ('wargame-' + ex.run_id));
        const safeName = String(rawName).toLowerCase().replace(/[^a-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'wargame-import';
        try {
            const scenario = PORTER.buildScenarioFromGeoJson(fc, { name: safeName });
            scenario.name = safeName;
            scenario.source = 'WarGamingGEN';
            scenario.input_docs = ['red_team.docx', 'blue_team.docx'];
            scenario.generated_from_docs = true;
            scenario.imported_from_geojson = true;
            scenario.source_file = 'all_phases.geojson';
            scenario.source_run = ex.run_id;                 // which dated generation this came from
            const outFile = PORTER.writeScenario(scenario);
            if (ctx.scenarios) { try { ctx.scenarios.clearCache(); } catch (_) {} try { ctx.scenarios.setActiveName(safeName); } catch (_) {} }
            sendJson(res, 200, {
                ok: true, name: safeName, file: outFile,
                source: 'WarGamingGEN', input_docs: scenario.input_docs,
                generated_from_docs: true, imported_from_geojson: true,
                source_file: 'all_phases.geojson', source_run: ex.run_id,
                red_units: (scenario.red_units || []).length,
                blue_units: (scenario.blue_units_initial || []).length,
                steps: (scenario.steps || []).length,
                objective: !!(scenario.obj && Array.isArray(scenario.obj.coord) && scenario.obj.coord.length === 2),
                report_present: ex.report, schedule_present: ex.schedule,
            });
        } catch (e) { sendJson(res, 400, { ok: false, error: 'import failed: ' + e.message }); }
        return true;
    }

    return false;
}

module.exports = { handle, _internals: { cfg, publishRunToExport, latestExport, latestRunDir, manualCommands } };
