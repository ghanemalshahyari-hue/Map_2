'use strict';
/**
 * roadmap-store.js — ROADMAP-4: Safe Roadmap Status Persistence
 *
 * Implements docs/roadmap-persistence-contract.md (§2–§6). Stores the roadmap's
 * status OVERRIDES in a single JSON file + an append-only audit log, both under
 * data/. The roadmap STRUCTURE stays owned by the client (PHASES); this store
 * only records `itemId -> status` overrides and who/when changed them.
 *
 * HARD LIMITS (locked by owner, ROADMAP-4):
 *   - No scenario mutation. No unit/map mutation. No simulation calls.
 *   - No /api/sim/*. No Event Log writes. No localStorage/sessionStorage.
 *   - No external backend. No WebSocket. No AI execution.
 *   - No apply/commit/go-live controls.
 *
 * ISOLATION: this module imports ONLY `fs` and `path`. It NEVER requires
 * anything from server/ai/ or server/sim/. The session user is resolved through
 * an injectable resolver (default: app-data.getSessionUser) — looked up lazily
 * and ONLY inside the HTTP handler, so the core logic has no other dependency
 * and is testable in isolation.
 */
const fs   = require('fs');
const path = require('path');

const SCHEMA       = 'rmooz.roadmap.status/1';
const VALID_STATUS = ['completed', 'in_progress', 'next', 'pending'];
const ITEM_ID_RE   = /^[a-z0-9-]{1,64}$/;

// ── Admin gate (configurable; defaults to the bootstrap `admin` account) ──────
function adminUsernames() {
    return String(process.env.RMOOZ_ROADMAP_ADMINS || 'admin')
        .split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}
function isRoadmapAdmin(user) {
    return !!user && (user.role === 'admin' || adminUsernames().indexOf(user.username) !== -1);
}

// ── Paths (read env per-call so tests can point RMOOZ_DATA_DIR at a temp dir) ──
function dataDir()    { return process.env.RMOOZ_DATA_DIR || path.join(__dirname, '..', 'data'); }
function statusFile() { return path.join(dataDir(), 'roadmap-status.json'); }
function auditFile()  { return path.join(dataDir(), 'roadmap-status-audit.jsonl'); }

function emptyState() {
    return { schema: SCHEMA, updated_at: null, updated_by: null, statuses: {} };
}

// Read current override state. Missing file -> empty. Corrupt -> back up once
// to `.bak` and return empty (never silently extend a corrupt file).
function readState() {
    var file = statusFile();
    var raw;
    try { raw = fs.readFileSync(file, 'utf8'); }
    catch (e) { return emptyState(); }                 // ENOENT etc.
    try {
        var obj = JSON.parse(raw);
        if (!obj || typeof obj !== 'object' || typeof obj.statuses !== 'object' || obj.statuses === null) {
            throw new Error('bad shape');
        }
        return {
            schema:     obj.schema || SCHEMA,
            updated_at: obj.updated_at || null,
            updated_by: obj.updated_by || null,
            statuses:   obj.statuses
        };
    } catch (e) {
        try { fs.copyFileSync(file, file + '.bak'); } catch (e2) {}
        return emptyState();
    }
}

// Atomic write: temp file + rename (same pattern as app-data.atomicWriteFile).
function atomicWrite(file, contents) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    var tmp = file + '.tmp.' + process.pid + '.' + Date.now();
    fs.writeFileSync(tmp, contents, 'utf8');
    fs.renameSync(tmp, file);
}

function appendAudit(row) {
    var file = auditFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(row) + '\n', 'utf8');
}

/**
 * Core mutation. Validates (auth → admin → status → item_id) BEFORE touching the
 * filesystem, so a rejected request never creates/changes any file. A no-op
 * (same status) writes nothing and appends no audit row.
 * Throws Error with `.code` in {UNAUTHENTICATED, FORBIDDEN, INVALID_STATUS, INVALID_ITEM_ID}.
 */
function applyChange(opts) {
    opts = opts || {};
    var user    = opts.user;
    var item_id = opts.item_id;
    var status  = opts.status;
    var nowIso  = opts.nowIso || new Date().toISOString();

    if (!user)                 throw withCode('Authentication required', 'UNAUTHENTICATED');
    if (!isRoadmapAdmin(user)) throw withCode('Admin only',             'FORBIDDEN');
    if (typeof status !== 'string' || VALID_STATUS.indexOf(status) === -1)
        throw withCode('Invalid status', 'INVALID_STATUS');
    if (typeof item_id !== 'string' || !ITEM_ID_RE.test(item_id))
        throw withCode('Invalid item id', 'INVALID_ITEM_ID');

    var state = readState();
    var from  = Object.prototype.hasOwnProperty.call(state.statuses, item_id)
        ? state.statuses[item_id] : null;

    if (from === status) {                              // no-op: no write, no audit
        return { ok: true, noop: true, item_id: item_id, status: status, from: from,
                 updated_at: state.updated_at, updated_by: state.updated_by };
    }

    var actor = user.username || ('user-' + user.id);
    state.statuses[item_id] = status;
    state.schema     = SCHEMA;
    state.updated_at = nowIso;
    state.updated_by = actor;

    atomicWrite(statusFile(), JSON.stringify(state, null, 2));
    appendAudit({ ts: nowIso, actor: actor, item_id: item_id, from: from, to: status });

    return { ok: true, noop: false, item_id: item_id, status: status, from: from,
             updated_at: nowIso, updated_by: actor };
}

function withCode(message, code) {
    var e = new Error(message); e.code = code; return e;
}

// GET payload: the override map + this session's edit capability.
function getStatusPayload(user) {
    var state = readState();
    return {
        schema:     state.schema || SCHEMA,
        updated_at: state.updated_at,
        updated_by: state.updated_by,
        statuses:   state.statuses,
        can_edit:   isRoadmapAdmin(user)
    };
}

// Default user resolver — lazily require app-data ONLY here (never ai/sim).
function defaultGetUser(req) {
    try { return require('./app-data').getSessionUser(req); }
    catch (e) { return null; }
}

function codeToHttp(code) {
    if (code === 'UNAUTHENTICATED') return 401;
    if (code === 'FORBIDDEN')       return 403;
    if (code === 'INVALID_STATUS' || code === 'INVALID_ITEM_ID') return 400;
    return 400;
}

/**
 * HTTP handler for /api/roadmap/status. Returns true if it handled the request.
 * `getUser` is injectable (tests pass a stub); production uses the session cookie.
 */
function handleRoadmapApi(req, res, pathname, method, sendJson, readJsonBody, getUser) {
    if (pathname !== '/api/roadmap/status') return false;
    var resolveUser = getUser || defaultGetUser;

    if (method === 'GET') {
        var ru = resolveUser(req);
        if (!ru) { sendJson(res, 401, { ok: false, error: 'Authentication required' }); return true; }
        sendJson(res, 200, getStatusPayload(ru));
        return true;
    }

    if (method === 'POST') {
        var user = resolveUser(req);
        if (!user) { sendJson(res, 401, { ok: false, error: 'Authentication required' }); return true; }
        if (!isRoadmapAdmin(user)) { sendJson(res, 403, { ok: false, error: 'Admin only' }); return true; }
        readJsonBody(req, { maxBytes: 4096 }).then(function (body) {
            body = body || {};
            try {
                var r = applyChange({ user: user, item_id: body.item_id, status: body.status });
                sendJson(res, 200, {
                    ok: true, item_id: r.item_id, status: r.status,
                    updated_at: r.updated_at, updated_by: r.updated_by, noop: !!r.noop
                });
            } catch (e) {
                sendJson(res, codeToHttp(e.code), { ok: false, error: e.message || 'Bad request', code: e.code || null });
            }
        }).catch(function (e) {
            sendJson(res, 400, { ok: false, error: (e && e.message) || 'Bad request' });
        });
        return true;
    }

    sendJson(res, 405, { ok: false, error: 'Method not allowed' });   // known route, wrong method
    return true;
}

module.exports = {
    handleRoadmapApi,
    isRoadmapAdmin,
    applyChange,
    readState,
    getStatusPayload,
    adminUsernames,
    SCHEMA,
    VALID_STATUS: VALID_STATUS.slice(),
    ITEM_ID_RE,
    _paths: { dataDir: dataDir, statusFile: statusFile, auditFile: auditFile }
};
