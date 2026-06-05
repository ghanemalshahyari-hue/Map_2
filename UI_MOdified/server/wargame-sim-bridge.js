/* ============================================================================
 * wargame-sim-bridge.js — FAST-DOC-1: DOCX → WarGamingGEN → GeoJSON import bridge
 * ----------------------------------------------------------------------------
 * The smallest safe bridge that lets RMOOZ:
 *   1. accept red_team.docx / blue_team.docx uploads (staging),
 *   2. stage them where WarGamingGEN consumes them,
 *   3. either show the exact manual command to (re)generate, OR — only when
 *      explicitly enabled — run an ALLOWLISTED, no-LLM regenerate command,
 *   4. import the generated all_phases.geojson via the EXISTING porter
 *      (scripts/port-wargame.js), stamping DOCX provenance.
 *
 * Safety / guardrails:
 *   - DOCX only (extension + ZIP magic check), fixed slot names (red|blue).
 *   - NO arbitrary command execution. The only runnable command is the
 *     allowlisted, no-LLM `regenerate_outputs`, and ONLY when
 *     RMOOZ_ALLOW_SIM_RUN=1. Otherwise the manual command is returned, not run.
 *   - Does NOT parse DOCX in RMOOZ, does NOT call any LLM, does NOT touch
 *     SmartSearch or the doctrine corpus, does NOT invent units/coords.
 *   - Import reuses scripts/port-wargame.js (no second parser, no rebuild).
 *
 * All paths are env-configurable (so tests can point at a temp dir):
 *   RMOOZ_TESTINGAI_DIR   default C:/Users/ADMIN/Desktop/TestingAI
 *   RMOOZ_WARGAMEGEN_DIR  default <TESTINGAI>/WarGamingGEN
 *   RMOOZ_ALLOW_SIM_RUN   "1" to enable the allowlisted regenerate runner
 * ========================================================================== */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');                 // UI_MOdified/
const PORTER = require(path.join(ROOT, 'scripts', 'port-wargame.js'));

function cfg() {
    const testingAi = process.env.RMOOZ_TESTINGAI_DIR || 'C:/Users/ADMIN/Desktop/TestingAI';
    const wgen      = process.env.RMOOZ_WARGAMEGEN_DIR || path.join(testingAi, 'WarGamingGEN');
    return {
        testingAi,
        wgen,
        importFromRmooz: path.join(testingAi, 'import_from_rmooz'),
        exportToRmooz:   path.join(testingAi, 'export_to_rmooz'),
        forcesDir:       path.join(wgen, 'inputs', 'forces'),
        latestOutputs:   path.join(wgen, 'runs', 'latest', 'outputs'),
        allowRun:        process.env.RMOOZ_ALLOW_SIM_RUN === '1',
    };
}

const SLOT_FILE = { red: 'red_team.docx', blue: 'blue_team.docx' };

function mkdirp(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }
function exists(p) { try { return fs.existsSync(p); } catch (_) { return false; } }

// The documented manual commands (also shown in the UI when the runner is off).
function manualCommands(c) {
    return {
        // Full run reflects NEW docx (re-parses DOCX + LLM). RMOOZ never runs this.
        full_run: `cd "${c.wgen}" && python tests/test_full_run.py --all`,
        // $0 regenerate from existing checkpoints (no LLM, does NOT re-read DOCX).
        regenerate: `cd "${c.wgen}" && python -m src.tools.regenerate_outputs`,
        // Copy the freshest outputs into the export folder RMOOZ reads.
        publish: `mkdir -p "${c.exportToRmooz}/geojson" && cp -r "${c.latestOutputs}/geojson/." "${c.exportToRmooz}/geojson/" && cp "${c.latestOutputs}/wargame_report.md" "${c.exportToRmooz}/" 2>/dev/null; cp "${c.latestOutputs}/wargameschedule.csv" "${c.exportToRmooz}/" 2>/dev/null`,
    };
}

// Copy runs/latest/outputs/* into export_to_rmooz/ and write a manifest.
// Pure file copy — no simulation, no LLM.
function publishOutputsToExport(c, inputDocs) {
    if (!exists(c.latestOutputs)) return { ok: false, error: 'no runs/latest/outputs to publish' };
    mkdirp(c.exportToRmooz);
    mkdirp(path.join(c.exportToRmooz, 'geojson'));
    const srcGeo = path.join(c.latestOutputs, 'geojson');
    const steps = [];
    if (exists(srcGeo)) {
        for (const f of fs.readdirSync(srcGeo)) {
            if (!/\.geojson$/i.test(f) || f.startsWith('._')) continue;
            fs.copyFileSync(path.join(srcGeo, f), path.join(c.exportToRmooz, 'geojson', f));
            if (/^step\d+\.geojson$/i.test(f)) steps.push('geojson/' + f);
        }
    }
    let report = false, schedule = false;
    const rpt = path.join(c.latestOutputs, 'wargame_report.md');
    const sch = path.join(c.latestOutputs, 'wargameschedule.csv');
    if (exists(rpt)) { fs.copyFileSync(rpt, path.join(c.exportToRmooz, 'wargame_report.md')); report = true; }
    if (exists(sch)) { fs.copyFileSync(sch, path.join(c.exportToRmooz, 'wargameschedule.csv')); schedule = true; }
    const manifest = {
        schema: 'testingai-export', version: 1,
        generated_at: new Date().toISOString(),
        input_docs: inputDocs || ['red_team.docx', 'blue_team.docx'],
        files: {
            geojson_all: exists(path.join(c.exportToRmooz, 'geojson', 'all_phases.geojson')) ? 'geojson/all_phases.geojson' : null,
            geojson_steps: steps.sort(),
            report: report ? 'wargame_report.md' : null,
            schedule: schedule ? 'wargameschedule.csv' : null,
        },
    };
    fs.writeFileSync(path.join(c.exportToRmooz, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    return { ok: true, manifest };
}

function exportStatus(c) {
    const man = path.join(c.exportToRmooz, 'manifest.json');
    const all = path.join(c.exportToRmooz, 'geojson', 'all_phases.geojson');
    return {
        manifest:   exists(man),
        all_phases: exists(all),
        report:     exists(path.join(c.exportToRmooz, 'wargame_report.md')),
        schedule:   exists(path.join(c.exportToRmooz, 'wargameschedule.csv')),
    };
}

// ── main router ─────────────────────────────────────────────────────────────
// Returns true if it handled the request. ctx = { url, pathname, method, sendJson, scenarios }
function handle(req, res, ctx) {
    const { url, pathname, method, sendJson } = ctx;
    if (!pathname.startsWith('/api/wargame-sim/')) return false;
    const c = cfg();

    // ── status ──
    if (pathname === '/api/wargame-sim/status' && method === 'GET') {
        sendJson(res, 200, {
            ok: true,
            docs: { red: exists(path.join(c.importFromRmooz, SLOT_FILE.red)),
                    blue: exists(path.join(c.importFromRmooz, SLOT_FILE.blue)) },
            export: exportStatus(c),
            runEnabled: c.allowRun,
            paths: { import_from_rmooz: c.importFromRmooz, export_to_rmooz: c.exportToRmooz, forces: c.forcesDir },
            commands: manualCommands(c),
        });
        return true;
    }

    // ── stage a docx (raw body) ──  POST /api/wargame-sim/stage-doc?slot=red|blue
    if (pathname === '/api/wargame-sim/stage-doc' && method === 'POST') {
        const slot = (url.searchParams.get('slot') || '').toLowerCase();
        if (!SLOT_FILE[slot]) { sendJson(res, 400, { ok: false, error: 'slot must be red|blue' }); return true; }
        const chunks = [];
        let size = 0; const MAX = 20_000_000;
        req.on('data', (d) => { size += d.length; if (size <= MAX) chunks.push(d); });
        req.on('error', () => sendJson(res, 400, { ok: false, error: 'upload error' }));
        req.on('end', () => {
            if (size > MAX) { sendJson(res, 413, { ok: false, error: 'file too large' }); return; }
            const buf = Buffer.concat(chunks);
            // .docx is a ZIP — verify the PK magic so we never stage a non-docx.
            if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4B) {
                sendJson(res, 400, { ok: false, error: 'not a .docx (ZIP/PK signature missing)' }); return;
            }
            try {
                mkdirp(c.importFromRmooz);
                const staged = path.join(c.importFromRmooz, SLOT_FILE[slot]);
                fs.writeFileSync(staged, buf);
                // Also place into WarGamingGEN's expected input location, backing
                // up the existing force doc first (reversible, no code change).
                let placed = false;
                if (exists(c.forcesDir)) {
                    const dest = path.join(c.forcesDir, SLOT_FILE[slot]);
                    try {
                        if (exists(dest)) fs.copyFileSync(dest, dest + '.bak');
                        fs.writeFileSync(dest, buf);
                        placed = true;
                    } catch (_) { /* staging still succeeded */ }
                }
                sendJson(res, 200, { ok: true, slot, file: SLOT_FILE[slot], bytes: buf.length, staged: staged, placed_in_forces: placed });
            } catch (e) { sendJson(res, 500, { ok: false, error: e.message }); }
        });
        return true;
    }

    // ── run (allowlisted, no-LLM regenerate) — only if explicitly enabled ──
    if (pathname === '/api/wargame-sim/run' && method === 'POST') {
        const cmds = manualCommands(c);
        if (!c.allowRun) {
            sendJson(res, 200, {
                ok: false, manual: true,
                reason: 'Local simulation run is disabled (set RMOOZ_ALLOW_SIM_RUN=1 to enable the allowlisted no-LLM regenerate).',
                commands: cmds,
                note: 'To reflect NEW docx content you must run the full simulation manually (full_run) — RMOOZ never triggers the LLM.',
            });
            return true;
        }
        // Enabled: run ONLY the allowlisted, no-LLM regenerate, then publish to export.
        const { spawn } = require('child_process');
        const child = spawn('python', ['-m', 'src.tools.regenerate_outputs'], { cwd: c.wgen });
        let errBuf = '';
        child.stderr && child.stderr.on('data', (d) => { errBuf += d.toString(); });
        child.on('error', (e) => sendJson(res, 500, { ok: false, error: 'spawn failed: ' + e.message, commands: cmds }));
        child.on('close', (code) => {
            if (code !== 0) { sendJson(res, 500, { ok: false, error: 'regenerate exited ' + code, stderr: errBuf.slice(-500) }); return; }
            const pub = publishOutputsToExport(c, ['red_team.docx', 'blue_team.docx']);
            sendJson(res, pub.ok ? 200 : 500, Object.assign({ ok: pub.ok, ran: 'regenerate_outputs' }, pub));
        });
        return true;
    }

    // ── publish (copy latest outputs → export_to_rmooz; no sim, no LLM) ──
    if (pathname === '/api/wargame-sim/publish' && method === 'POST') {
        const pub = publishOutputsToExport(c, ['red_team.docx', 'blue_team.docx']);
        sendJson(res, pub.ok ? 200 : 400, Object.assign({ ok: pub.ok }, pub));
        return true;
    }

    // ── import the generated all_phases.geojson via the EXISTING porter ──
    if (pathname === '/api/wargame-sim/import' && method === 'POST') {
        const allPhases = path.join(c.exportToRmooz, 'geojson', 'all_phases.geojson');
        if (!exists(allPhases)) {
            sendJson(res, 404, { ok: false, error: 'export_to_rmooz/geojson/all_phases.geojson not found — run/publish first', commands: manualCommands(c) });
            return true;
        }
        let fc;
        try { fc = JSON.parse(fs.readFileSync(allPhases, 'utf8')); }
        catch (e) { sendJson(res, 400, { ok: false, error: 'invalid geojson: ' + e.message }); return true; }

        const rawName = (url.searchParams.get('name') || (fc.properties && fc.properties.operation_name) || 'wargame-docx-import');
        const safeName = String(rawName).toLowerCase().replace(/[^a-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'wargame-docx-import';
        try {
            const scenario = PORTER.buildScenarioFromGeoJson(fc, { name: safeName });
            scenario.name = safeName;
            // FAST-DOC-1 provenance (additive metadata only — porter logic untouched).
            scenario.source = 'WarGamingGEN';
            scenario.input_docs = ['red_team.docx', 'blue_team.docx'];
            scenario.generated_from_docs = true;
            scenario.imported_from_geojson = true;
            scenario.source_file = 'all_phases.geojson';
            const outFile = PORTER.writeScenario(scenario);
            if (ctx.scenarios) {
                try { ctx.scenarios.clearCache(); } catch (_) {}
                try { ctx.scenarios.setActiveName(safeName); } catch (_) {}
            }
            const es = exportStatus(c);
            sendJson(res, 200, {
                ok: true, name: safeName, file: outFile,
                source: scenario.source, input_docs: scenario.input_docs,
                generated_from_docs: true, imported_from_geojson: true,
                source_file: 'all_phases.geojson',
                red_units: (scenario.red_units || []).length,
                blue_units: (scenario.blue_units_initial || []).length,
                steps: (scenario.steps || []).length,
                objective: !!(scenario.obj && Array.isArray(scenario.obj.coord) && scenario.obj.coord.length === 2),
                report_present: es.report,
                schedule_present: es.schedule,
            });
        } catch (e) { sendJson(res, 400, { ok: false, error: 'import failed: ' + e.message }); }
        return true;
    }

    return false;
}

module.exports = { handle, _internals: { cfg, publishOutputsToExport, exportStatus, manualCommands } };
