'use strict';
/**
 * scenario-revisions-store.js — Batch D Slice 1: immutable scenario revisions.
 *
 * `scenario_revisions` (app-data.js schema) is append-only — a row is never
 * updated or deleted. Every real content change to a scenario gets a new
 * monotonically-increasing `revision_number`; resaving byte-identical content
 * (by canonical hash) is a no-op — no new row, no wasted history. The live
 * `data/scenarios/<name>.json` file stays a mirror of the latest revision so
 * every existing reader (engine, other endpoints, tests) is unaffected.
 *
 * Content hashing reuses server/sim/journal.js's stableStringify/hashState
 * (deterministic key-order hashing) rather than re-implementing it — the same
 * scenario object hashes identically regardless of how its keys were built.
 *
 * ISOLATION: DB access via an injectable `getDb` (defaults to app-data.getDb),
 * matching scenario-approval-store.js's pattern.
 */

const fs = require('fs');
const path = require('path');

function defaultGetDb() {
    return require('./app-data').getDb();
}
function journalHash() {
    return require('./sim/journal');
}
function genId() {
    const crypto = require('crypto');
    if (crypto.randomUUID) return 'rev-' + crypto.randomUUID();
    return 'rev-' + Date.now().toString(36) + '-' + crypto.randomBytes(8).toString('hex');
}
function nowIso() { return new Date().toISOString(); }

const VALID_SOURCES = ['manual', 'ai', 'template', 'import', 'clone', 'restore', 'legacy'];

function contentHash(scenario) {
    const { hashState } = journalHash();
    return hashState(scenario);
}

function getLatestRevision(scenarioName, getDb) {
    const db = (getDb || defaultGetDb)();
    return db.prepare(
        'SELECT * FROM scenario_revisions WHERE scenario_name = ? ORDER BY revision_number DESC LIMIT 1'
    ).get(scenarioName) || null;
}

function getRevision(scenarioName, revisionNumber, getDb) {
    const db = (getDb || defaultGetDb)();
    return db.prepare(
        'SELECT * FROM scenario_revisions WHERE scenario_name = ? AND revision_number = ?'
    ).get(scenarioName, revisionNumber) || null;
}

function listRevisions(scenarioName, getDb) {
    const db = (getDb || defaultGetDb)();
    return db.prepare(
        'SELECT id, scenario_name, revision_number, content_hash, created_by, created_at, source FROM scenario_revisions WHERE scenario_name = ? ORDER BY revision_number ASC'
    ).all(scenarioName);
}

/**
 * Append a new revision if `scenario`'s content hash differs from the current
 * head revision (or none exists yet); a byte-identical resave is a no-op.
 * `sourceRef` is a generic "what this was based on" pointer — a restored-from
 * revision number (restore) or a source scenario name (clone) — stored as-is.
 * Returns { created: bool, revision_number, content_hash, revision } — always
 * the HEAD revision info after the call, whether or not a new row was written.
 */
function appendRevisionIfChanged(scenarioName, scenario, user, source, sourceRef, getDb) {
    const db = (getDb || defaultGetDb)();
    const src = VALID_SOURCES.indexOf(source) !== -1 ? source : 'manual';
    const hash = contentHash(scenario);
    const latest = getLatestRevision(scenarioName, () => db);
    if (latest && latest.content_hash === hash) {
        return { created: false, revision_number: latest.revision_number, content_hash: hash, revision: latest };
    }
    const nextNumber = latest ? latest.revision_number + 1 : 1;
    const id = genId();
    const t = nowIso();
    const actorId = (user && (user.username || user.id)) || null;
    db.prepare(
        `INSERT INTO scenario_revisions (id, scenario_name, revision_number, content_hash, content_json, created_by, created_at, source, source_ref)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, scenarioName, nextNumber, hash, JSON.stringify(scenario), actorId, t, src, sourceRef == null ? null : String(sourceRef));
    const revision = getRevision(scenarioName, nextNumber, () => db);
    return { created: true, revision_number: nextNumber, content_hash: hash, revision };
}

/**
 * Batch D checkpoint retrofit: "existing scenarios become revision 1 without
 * breaking current files or callers." Scans `scenariosDir` (data/scenarios/)
 * and, for every `*.json` file that has NO scenario_revisions row yet,
 * creates one from that file's CURRENT on-disk content — `source:'legacy'`
 * (never mislabeled as 'manual'/'ai'/etc — the true original provenance is
 * unknown), `created_at` taken from the file's own mtime (a truthful proxy
 * for "when this became known," not the migration run time), `created_by`
 * left null (no author is knowable). Idempotent — a file that already has a
 * revision (including one just backfilled) is left untouched; running this
 * twice creates no duplicate rows. Does NOT create a scenario_lifecycle row —
 * a legacy scenario stays "Unmanaged" in the Library until it's actually
 * touched through the real save/approval flow; backfilling only gives it real
 * revision HISTORY to restore/compare against from this point forward.
 * Called once at server startup (see web-server.js), never on a hot path.
 */
function backfillLegacyRevisions(scenariosDir, getDb) {
    const db = (getDb || defaultGetDb)();
    let files;
    try { files = fs.readdirSync(scenariosDir); } catch (_) { return { scanned: 0, backfilled: 0 }; }
    let backfilled = 0;
    const jsonFiles = files.filter((f) => f.endsWith('.json') && !f.startsWith('_'));
    for (const file of jsonFiles) {
        const name = file.replace(/\.json$/, '');
        if (getLatestRevision(name, () => db)) continue; // already has real history
        const fullPath = path.join(scenariosDir, file);
        let content;
        try { content = JSON.parse(fs.readFileSync(fullPath, 'utf8')); } catch (_) { continue; }
        let mtimeIso;
        try { mtimeIso = fs.statSync(fullPath).mtime.toISOString(); } catch (_) { mtimeIso = nowIso(); }
        const hash = contentHash(content);
        const id = genId();
        db.prepare(
            `INSERT INTO scenario_revisions (id, scenario_name, revision_number, content_hash, content_json, created_by, created_at, source, source_ref)
             VALUES (?, ?, 1, ?, ?, NULL, ?, 'legacy', NULL)`
        ).run(id, name, hash, JSON.stringify(content), mtimeIso);
        backfilled += 1;
    }
    return { scanned: jsonFiles.length, backfilled };
}

function defaultGetUser(req) {
    try { return require('./app-data').getSessionUser(req); }
    catch (_) { return null; }
}

/**
 * HTTP handler for:
 *   GET /api/scenarios/:name/revisions                       -> list (metadata only, no content_json)
 *   GET /api/scenarios/:name/revisions/:a/compare/:b          -> structured field-level diff
 * Read-only — any authenticated user may view revision history/diffs (same
 * gate as GET .../approval), matching this being a Library/audit surface,
 * not a mutation. Returns true if it handled the request.
 */
function handleScenarioRevisionsApi(req, res, pathname, method, sendJson, getUser) {
    if (!pathname.startsWith('/api/scenarios/')) return false;
    const parts = pathname.split('/').filter(Boolean); // api, scenarios, :name, revisions, [:a, compare, :b]
    if (parts.length !== 4 && parts.length !== 7) return false;
    if (parts[3] !== 'revisions') return false;
    const resolveUser = getUser || defaultGetUser;
    const scenarioName = decodeURIComponent(parts[2]);

    if (parts.length === 4 && method === 'GET') {
        const user = resolveUser(req);
        if (!user) { sendJson(res, 401, { ok: false, error: 'Authentication required' }); return true; }
        sendJson(res, 200, { ok: true, scenario_name: scenarioName, revisions: listRevisions(scenarioName) });
        return true;
    }

    if (parts.length === 7 && parts[5] === 'compare' && method === 'GET') {
        const user = resolveUser(req);
        if (!user) { sendJson(res, 401, { ok: false, error: 'Authentication required' }); return true; }
        const aNum = parseInt(parts[4], 10);
        const bNum = parseInt(parts[6], 10);
        if (!Number.isFinite(aNum) || !Number.isFinite(bNum)) {
            sendJson(res, 400, { ok: false, error: 'revision numbers must be integers' }); return true;
        }
        const revA = getRevision(scenarioName, aNum);
        const revB = getRevision(scenarioName, bNum);
        if (!revA || !revB) {
            sendJson(res, 404, { ok: false, error: 'one or both revisions not found', revision_a_found: !!revA, revision_b_found: !!revB });
            return true;
        }
        const { compareScenarios } = require('./scenario-revision-compare');
        const diff = compareScenarios(JSON.parse(revA.content_json), JSON.parse(revB.content_json));
        sendJson(res, 200, {
            ok: true, scenario_name: scenarioName,
            revision_a: aNum, revision_b: bNum,
            ...diff,
        });
        return true;
    }

    return false;
}

module.exports = {
    contentHash,
    getLatestRevision,
    getRevision,
    listRevisions,
    appendRevisionIfChanged,
    backfillLegacyRevisions,
    handleScenarioRevisionsApi,
    VALID_SOURCES: VALID_SOURCES.slice(),
};
