/* ============================================================================
 * wargame-local-bridge.js — LOCAL-IMPORT-2: local Wargame output folder import
 * ----------------------------------------------------------------------------
 * Imports WarGamingGEN / Wargame GeoJSON outputs that the operator has COPIED
 * into RMOOZ's own data tree — with NO dependency on the external TestingAI
 * tree, WarGamingGEN/runs/latest, or the stale flat export_to_rmooz/geojson/
 * bundle (per LOCAL-IMPORT-DISCOVERY-1).
 *
 * Drop contract (one run per <run_id>/ subfolder):
 *   data/imports/wargame_outputs/<run_id>/
 *     all_phases.geojson          REQUIRED (porter's primary input)
 *     manifest.json               optional
 *     geojson/stepNN.geojson      optional
 *     wargame_report.md           optional (display-only)
 *     wargameschedule.csv         optional (display-only)
 *     checkpoints/                optional (display-only)
 *     source_docs/*.docx          optional (display-only, NOT parsed)
 *   data/imports/wargame_outputs/latest.json   optional → { "latest": "<run_id>" }
 *
 * Routes:
 *   GET  /api/wargame-local/status            list runs + freshness, no mutation
 *   GET  /api/wargame-local/file?run=<id>     serve a run's all_phases.geojson (read-only)
 *   POST /api/wargame-local/import?run=<id>   import via the EXISTING porter
 *        &name=<n>&confirm=1                  confirm overrides the stale guard
 *
 * Guardrails:
 *   - Each run MUST be a <run_id>/ subfolder with all_phases.geojson; a flat
 *     dump (all_phases.geojson directly in wargame_outputs/) is IGNORED.
 *   - run_id is validated against a strict pattern (no slashes / no `..`) and
 *     resolved STRICTLY inside the imports dir (no path traversal).
 *   - Importing a run older than the newest local run → 409 unless ?confirm=1.
 *   - Never auto-imports; status/file never mutate the active scenario.
 *   - Reuses scripts/port-wargame.js (single source of import logic). No second
 *     parser. No DOCX parsing. No WarGamingGEN run. No LLM. No SmartSearch.
 *
 * Env (optional):
 *   RMOOZ_DATA_DIR            data root (default <UI_MOdified>/data)
 *   RMOOZ_LOCAL_WARGAME_DIR   override the imports dir outright
 * ========================================================================== */
'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const ROOT   = path.join(__dirname, '..');                 // UI_MOdified/
const PORTER = require(path.join(ROOT, 'scripts', 'port-wargame.js'));

// run_id: filenames we accept as a run folder. No slashes, no leading dot,
// no `..`. Mirrors the porter's filename sanitisation alphabet.
const RUN_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

function cfg() {
    const dataDir = process.env.RMOOZ_DATA_DIR || path.join(ROOT, 'data');
    const localDir = process.env.RMOOZ_LOCAL_WARGAME_DIR
        || path.join(dataDir, 'imports', 'wargame_outputs');
    return { dataDir, localDir };
}

function exists(p) { try { return fs.existsSync(p); } catch (_) { return false; } }
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; } }
function mkdirp(d) { try { fs.mkdirSync(d, { recursive: true }); } catch (_) {} }
function relFromRoot(p) { try { return path.relative(ROOT, p).split(path.sep).join('/'); } catch (_) { return p; } }

function statInfo(p) {
    try {
        const st = fs.statSync(p);
        return { present: true, size: st.size, mtime_ms: st.mtimeMs, mtime: new Date(st.mtimeMs).toISOString() };
    } catch (_) { return { present: false }; }
}
function sha256File(p) {
    try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch (_) { return null; }
}

// Resolve a run_id to its absolute folder, STRICTLY inside localDir. Returns
// null on an invalid id or any attempt to escape the imports dir.
function runDirFor(c, runId) {
    if (!runId || !RUN_ID_RE.test(runId) || runId === '.' || runId === '..') return null;
    const dir = path.join(c.localDir, runId);
    const rel = path.relative(c.localDir, dir);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null;   // traversal guard
    return dir;
}

// all_phases.geojson lives at the run root (contract) but tolerate geojson/.
function allPhasesPathIn(runDir) {
    const a = path.join(runDir, 'all_phases.geojson');
    if (exists(a)) return a;
    const b = path.join(runDir, 'geojson', 'all_phases.geojson');
    if (exists(b)) return b;
    return null;
}

function countStepGeojson(runDir) {
    const dirs = [runDir, path.join(runDir, 'geojson')];
    let n = 0;
    for (const d of dirs) {
        try {
            for (const f of fs.readdirSync(d)) {
                if (/^step\d{2,3}\.geojson$/i.test(f) && !f.startsWith('._')) n++;
            }
        } catch (_) {}
    }
    return n;
}

// Inspect one run folder → metadata (no parsing of the geojson body here).
function inspectRun(runDir) {
    const runId = path.basename(runDir);
    const all   = allPhasesPathIn(runDir);
    const allInfo = all ? statInfo(all) : { present: false };
    return {
        run_id: runId,
        all_phases: all ? {
            present: true,
            path: relFromRoot(all),
            size: allInfo.size,
            mtime: allInfo.mtime,
            mtime_ms: allInfo.mtime_ms,
            sha256: sha256File(all),
        } : { present: false },
        manifest: exists(path.join(runDir, 'manifest.json')),
        report:   exists(path.join(runDir, 'wargame_report.md')),
        schedule: exists(path.join(runDir, 'wargameschedule.csv')),
        step_count: countStepGeojson(runDir),
    };
}

// List every <run_id>/ subfolder that has an all_phases.geojson. Flat files
// (e.g. a bare all_phases.geojson sitting directly in the imports dir) are
// reported separately as ignored — NEVER treated as a run.
function listRuns(c) {
    mkdirp(c.localDir);
    const runs = [];
    const ignoredFlat = [];
    let entries = [];
    try { entries = fs.readdirSync(c.localDir, { withFileTypes: true }); } catch (_) {}
    for (const e of entries) {
        if (e.name.startsWith('.') || e.name.startsWith('._')) continue;
        if (e.isDirectory()) {
            if (!RUN_ID_RE.test(e.name)) continue;
            const info = inspectRun(path.join(c.localDir, e.name));
            if (info.all_phases.present) runs.push(info);
            else ignoredFlat.push({ name: e.name, reason: 'subfolder has no all_phases.geojson' });
        } else if (e.isFile() && /\.(geo)?json$/i.test(e.name) && e.name !== 'latest.json') {
            // A flat geojson with no <run_id>/ wrapper — the discovery's §5.1
            // stale-flat failure mode. Ignored on purpose.
            ignoredFlat.push({ name: e.name, reason: 'flat file with no <run_id>/ subfolder — ignored' });
        }
    }
    // Newest by all_phases mtime (used for the stale guard + mtime fallback).
    runs.sort((a, b) => (b.all_phases.mtime_ms || 0) - (a.all_phases.mtime_ms || 0));
    return { runs, ignoredFlat };
}

// Resolve which run is the default import target: latest.json pointer first,
// else the newest run by mtime. Returns { runId, source } or nulls.
function resolveLatest(c, runs) {
    const ptr = readJson(path.join(c.localDir, 'latest.json'));
    const ptrId = ptr && typeof ptr.latest === 'string' ? ptr.latest.trim() : null;
    if (ptrId && runs.some(r => r.run_id === ptrId)) return { runId: ptrId, source: 'pointer' };
    if (runs.length) return { runId: runs[0].run_id, source: 'mtime' };
    return { runId: null, source: null };
}

// WARGAME-LOCAL-LATEST-1: resolve a requested ?run= token to a real run id.
// The literal sentinel "latest" (any case) and an empty/missing value both mean
// "the resolved latest run" — NOT a directory literally named "latest" (which
// caused `?run=latest` → 400 "invalid run id: latest" / 404). Any other value is
// returned verbatim for the normal RUN_ID_RE + traversal validation in
// runDirFor(). Safe by construction: a resolved id comes from listRuns() (each
// basename already RUN_ID_RE-checked) and is re-validated by runDirFor() at the
// call site, so "latest" can never point outside the imports dir.
function resolveRunToken(c, raw, runs) {
    const req = (raw == null ? '' : String(raw)).trim();
    if (!req || req.toLowerCase() === 'latest') {
        return resolveLatest(c, runs).runId;   // real run_id, or null when none exist
    }
    return req;
}

// Stale = the selected run is older (by all_phases mtime) than the newest run
// AND is not itself the newest. Mirrors FAST-DOC-2's export_behind semantics.
function stalenessFor(runs, selectedId) {
    if (!runs.length) return { stale: false };
    const newest = runs[0];                       // sorted newest-first
    if (!selectedId || selectedId === newest.run_id) return { stale: false, newest_run_id: newest.run_id };
    const sel = runs.find(r => r.run_id === selectedId);
    if (!sel) return { stale: false, newest_run_id: newest.run_id };
    const older = (sel.all_phases.mtime_ms || 0) + 1000 < (newest.all_phases.mtime_ms || 0);
    return {
        stale: older,
        newest_run_id: newest.run_id,
        reason: older
            ? `Selected run "${selectedId}" is older than the newest local run "${newest.run_id}". `
              + `Import the newest run, or re-POST with ?confirm=1 to import the older one anyway.`
            : null,
    };
}

// Lightweight server-side summary mirroring the client's
// AppWargameGeoJsonImport.summarizeGeoJson (counts distinct unit uids per
// side, distinct phases, objective presence). Used only when a single run is
// requested (?run=…&summary=1) so we never parse every bundle on a plain list.
function summarizeGeoJson(fc) {
    const out = { phases: 0, red_units: 0, blue_units: 0, objective: false };
    if (!fc || !Array.isArray(fc.features)) return out;
    const phases = {}, red = {}, blue = {};
    let hasObj = false;
    for (const f of fc.features) {
        const p = (f && f.properties) || {};
        if (Number.isInteger(p.phase)) phases[p.phase] = true;
        if (p.kind === 'objective') hasObj = true;
        if (p.kind === 'unit') {
            const uid = p.uid || p.unit_uid;
            if (uid && p.side === 'RED')  red[uid]  = true;
            if (uid && p.side === 'BLUE') blue[uid] = true;
        }
    }
    if (!Object.keys(phases).length && fc.properties && Number.isInteger(fc.properties.phase)) {
        phases[fc.properties.phase] = true;
    }
    out.phases = Object.keys(phases).length;
    out.red_units = Object.keys(red).length;
    out.blue_units = Object.keys(blue).length;
    out.objective = hasObj;
    return out;
}

// ── main router ─────────────────────────────────────────────────────────────
function handle(req, res, ctx) {
    const { url, pathname, method, sendJson } = ctx;
    if (!pathname.startsWith('/api/wargame-local/')) return false;
    const c = cfg();

    // ── status: list runs, latest pointer, freshness (read-only) ──
    if (pathname === '/api/wargame-local/status' && method === 'GET') {
        const { runs, ignoredFlat } = listRuns(c);
        const latest = resolveLatest(c, runs);
        const rawRun = (url.searchParams.get('run') || '').trim() || null;
        // WARGAME-LOCAL-LATEST-1: "latest"/empty → the resolved newest run.
        const selectedId = resolveRunToken(c, rawRun, runs);

        // Optional server-side summary for a single requested run.
        let summary = null, summaryError = null;
        if (rawRun && url.searchParams.get('summary') === '1') {
            const runDir = runDirFor(c, selectedId);
            const all = runDir && allPhasesPathIn(runDir);
            if (!all) summaryError = 'all_phases.geojson not found for run ' + selectedId;
            else {
                const fc = readJson(all);
                if (!fc) summaryError = 'all_phases.geojson is not valid JSON';
                else summary = summarizeGeoJson(fc);
            }
        }

        sendJson(res, 200, {
            ok: true,
            dir: relFromRoot(c.localDir),
            run_count: runs.length,
            latest_run_id: latest.runId,
            latest_source: latest.source,          // 'pointer' | 'mtime' | null
            selected_run_id: selectedId,
            runs,
            ignored: ignoredFlat,                  // flat dumps / runs missing all_phases
            freshness: stalenessFor(runs, selectedId),
            summary, summary_error: summaryError,
        });
        return true;
    }

    // ── file: serve a run's all_phases.geojson (read-only; for client summary) ──
    if (pathname === '/api/wargame-local/file' && method === 'GET') {
        const rawRun = (url.searchParams.get('run') || '').trim();
        // WARGAME-LOCAL-LATEST-1: resolve "latest"/empty to the newest real run.
        const { runs } = listRuns(c);
        const reqRun = resolveRunToken(c, rawRun, runs);
        if (!reqRun) { sendJson(res, 404, { ok: false, error: 'no local run found' }); return true; }
        const runDir = runDirFor(c, reqRun);
        if (!runDir) { sendJson(res, 400, { ok: false, error: 'invalid run id: ' + (rawRun || '(empty)') }); return true; }
        const all = allPhasesPathIn(runDir);
        if (!all) { sendJson(res, 404, { ok: false, error: 'all_phases.geojson not found for run ' + reqRun }); return true; }
        try {
            const buf = fs.readFileSync(all);
            res.writeHead(200, { 'Content-Type': 'application/geo+json; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(buf);
        } catch (e) { sendJson(res, 500, { ok: false, error: e.message }); }
        return true;
    }

    // ── import: porter → data/scenarios/<name>.json, set active on success ──
    if (pathname === '/api/wargame-local/import' && method === 'POST') {
        const { runs } = listRuns(c);
        const rawRun = (url.searchParams.get('run') || '').trim() || null;
        // WARGAME-LOCAL-LATEST-1: accept ?run=latest (and empty) and resolve it to
        // the real newest run id, instead of rejecting "latest" as a literal id.
        const runId  = resolveRunToken(c, rawRun, runs);
        if (!runId) {
            sendJson(res, 404, { ok: false, error: 'no local run found — copy a folder into ' + relFromRoot(c.localDir) + '/<run_id>/ first' });
            return true;
        }
        const runDir = runDirFor(c, runId);
        if (!runDir || !exists(runDir)) { sendJson(res, 400, { ok: false, error: 'invalid run id: ' + (rawRun || runId) }); return true; }
        const all = allPhasesPathIn(runDir);
        if (!all) {
            sendJson(res, 404, { ok: false, error: 'run "' + runId + '" has no all_phases.geojson' });
            return true;
        }

        // Stale guard (FAST-DOC-2 parity): refuse an older-than-newest run
        // unless the operator explicitly confirms. Never auto-imports.
        const fresh = stalenessFor(runs, runId);
        const confirmed = url.searchParams.get('confirm') === '1' || url.searchParams.get('force') === '1';
        if (fresh.stale && !confirmed) {
            sendJson(res, 409, {
                ok: false, stale: true, warning: fresh.reason, freshness: fresh,
                hint: 'A newer local run exists. Import the newest run, or re-POST with ?confirm=1 to import this older one anyway.',
            });
            return true;
        }

        let fc;
        try { fc = JSON.parse(fs.readFileSync(all, 'utf8')); }
        catch (e) { sendJson(res, 400, { ok: false, error: 'invalid geojson: ' + e.message }); return true; }

        const rawName = (url.searchParams.get('name')
            || (fc.properties && fc.properties.operation_name)
            || ('wargame-local-' + runId));
        const safeName = String(rawName).toLowerCase()
            .replace(/[^a-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64) || 'wargame-local-import';

        try {
            const scenario = PORTER.buildScenarioFromGeoJson(fc, { name: safeName });
            scenario.name = safeName;
            scenario.source = 'WarGamingGEN-local';
            scenario.source_run = runId;
            scenario.imported_from_geojson = true;
            scenario.source_file = path.basename(all);
            // Relative to the imports root → e.g. "run_a_old/all_phases.geojson".
            // Always relative, never absolute, never escapes the drop folder.
            scenario.local_import_path = path.relative(c.localDir, all).split(path.sep).join('/');
            const outFile = PORTER.writeScenario(scenario);

            // Mutate the active scenario ONLY after a successful explicit import.
            if (ctx.scenarios) {
                try { ctx.scenarios.clearCache(); } catch (_) {}
                try { ctx.scenarios.setActiveName(safeName); } catch (_) {}
            }
            sendJson(res, 200, {
                ok: true,
                name: safeName,
                file: outFile,
                source: 'WarGamingGEN-local',
                source_run: runId,
                imported_from_geojson: true,
                source_file: scenario.source_file,
                local_import_path: scenario.local_import_path,
                red_units: (scenario.red_units || []).length,
                blue_units: (scenario.blue_units_initial || []).length,
                steps: (scenario.steps || []).length,
                objective: !!(scenario.obj && Array.isArray(scenario.obj.coord) && scenario.obj.coord.length === 2),
                imported_stale: !!(fresh.stale && confirmed),
            });
        } catch (e) { sendJson(res, 400, { ok: false, error: 'import failed: ' + e.message }); }
        return true;
    }

    return false;
}

module.exports = {
    handle,
    _internals: { cfg, runDirFor, allPhasesPathIn, listRuns, resolveLatest, stalenessFor, summarizeGeoJson, inspectRun },
};
