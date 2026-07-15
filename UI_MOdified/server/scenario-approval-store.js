'use strict';
/**
 * scenario-approval-store.js — Batch B command-authority: scenario lifecycle
 * (draft -> in_review -> approved/rejected -> activated) and its tamper-evident
 * audit trail.
 *
 *   draft ──submit──▶ in_review ──approve──▶ approved ──(activate elsewhere)──▶ activated
 *                          │                     │
 *                          └──reject──▶ rejected ─┘   (reopen ──▶ draft)
 *
 * `scenario_lifecycle` (app-data.js schema) holds CURRENT state only — one row
 * per scenario, queryable for gating. The journal below is the append-only,
 * hash-chained history of every transition; identity on every row is always
 * SERVER-DERIVED from the `user` object the caller passes in (resolved from
 * the session), never from request-body fields — matching the Batch A
 * operator_id pattern (web-server.js's requireAuthenticatedUser + the
 * commit/decide routes' server-side identity override).
 *
 * ISOLATION: DB access via an injectable `getDb` (defaults to app-data.getDb),
 * journal hashing reuses server/sim/journal.js's stableStringify/hashState
 * rather than re-implementing them.
 */

const fs   = require('fs');
const path = require('path');

const VALID_ACTIONS = ['submit', 'review', 'approve', 'reject', 'reopen'];

function defaultGetDb() {
    return require('./app-data').getDb();
}
function commandAuthority() {
    return require('./command-authority');
}
function journalHash() {
    return require('./sim/journal');
}

function dataDir() { return process.env.RMOOZ_DATA_DIR || path.join(__dirname, '..', 'data'); }
function journalDir() { return path.join(dataDir(), 'journal'); }
function lifecycleJournalFile() { return path.join(journalDir(), 'scenario-lifecycle.jsonl'); }

function nowIso() { return new Date().toISOString(); }
function withCode(message, code) { const e = new Error(message); e.code = code; return e; }

// ── Journal (append-only, hash-chained) ─────────────────────────────────────
let _lastEventHash = null;
let _lastEventHashPrimedFor = null;

function primeLastHash() {
    const file = lifecycleJournalFile();
    if (_lastEventHashPrimedFor === file) return;
    _lastEventHashPrimedFor = file;
    _lastEventHash = null;
    try {
        const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
        if (lines.length) {
            const last = JSON.parse(lines[lines.length - 1]);
            _lastEventHash = last.event_hash || null;
        }
    } catch (_) { /* no file yet — starts the chain at null */ }
}

function appendLifecycleEvent(row) {
    primeLastHash();
    const { hashState } = journalHash();
    const prevHash = _lastEventHash;
    const base = {
        ts: row.ts || nowIso(),
        scenario_name: row.scenario_name,
        event: row.event,
        actor_id: row.actor_id,
        actor_role: row.actor_role,
        actor_display: row.actor_display || null,
        from_status: row.from_status,
        to_status: row.to_status,
        reason: row.reason || null,
        prev_event_hash: prevHash,
    };
    const eventHash = hashState(base);
    const out = Object.assign({}, base, { event_hash: eventHash });
    fs.mkdirSync(journalDir(), { recursive: true });
    fs.appendFileSync(lifecycleJournalFile(), JSON.stringify(out) + '\n', 'utf8');
    _lastEventHash = eventHash;
    return out;
}

function readLifecycleEvents(scenarioName) {
    let lines;
    try { lines = fs.readFileSync(lifecycleJournalFile(), 'utf8').trim().split('\n').filter(Boolean); }
    catch (_) { return []; }
    return lines.map(l => { try { return JSON.parse(l); } catch (_) { return null; } })
        .filter(Boolean)
        .filter(e => !scenarioName || e.scenario_name === scenarioName);
}

// ── Lifecycle table ──────────────────────────────────────────────────────────
function getLifecycle(scenarioName, getDb) {
    const db = (getDb || defaultGetDb)();
    return db.prepare('SELECT * FROM scenario_lifecycle WHERE scenario_name = ?').get(scenarioName) || null;
}

// Called on scenario save (POST /api/scenarios) — creates the draft row on
// first save; leaves status untouched on a re-save of an already-authored
// scenario (saving again does not reset review/approval progress).
function ensureLifecycleRow(scenarioName, user, getDb) {
    const db = (getDb || defaultGetDb)();
    const existing = getLifecycle(scenarioName, () => db);
    const t = nowIso();
    const actorId = (user && (user.username || user.id)) || null;
    if (existing) return existing;
    db.prepare(
        `INSERT INTO scenario_lifecycle (scenario_name, status, author_id, updated_at)
         VALUES (?, 'draft', ?, ?)`
    ).run(scenarioName, actorId, t);
    appendLifecycleEvent({
        scenario_name: scenarioName, event: 'authored', actor_id: actorId,
        actor_role: user && user.role, actor_display: user && user.displayName,
        from_status: null, to_status: 'draft',
    });
    return getLifecycle(scenarioName, () => db);
}

/**
 * Core state-machine mutation. Validates (auth -> capability -> transition
 * legality -> input) BEFORE touching the DB/journal.
 * Throws Error with `.code` in
 *   {UNAUTHENTICATED, FORBIDDEN, NOT_FOUND, INVALID_ACTION, INVALID_TRANSITION, INVALID_INPUT}.
 */
function applyTransition({ user, scenario_name, action, reason }, getDb) {
    const db = (getDb || defaultGetDb)();
    const CA = commandAuthority();

    if (!user) throw withCode('Authentication required', 'UNAUTHENTICATED');
    if (typeof scenario_name !== 'string' || !scenario_name.trim())
        throw withCode('scenario_name is required', 'INVALID_INPUT');
    if (VALID_ACTIONS.indexOf(action) === -1)
        throw withCode('Unknown action', 'INVALID_ACTION');

    const row = getLifecycle(scenario_name, () => db);
    if (!row) throw withCode('Scenario has no lifecycle record — save it first', 'NOT_FOUND');

    const TRANSITIONS = {
        submit: { from: ['draft', 'rejected'], to: 'in_review', requires: 'author' },
        review: { from: ['in_review'],         to: 'in_review', requires: 'author' },
        approve:{ from: ['in_review'],         to: 'approved',  requires: 'commander' },
        reject: { from: ['in_review'],         to: 'rejected',  requires: 'commander' },
        reopen: { from: ['approved', 'rejected'], to: 'draft',  requires: 'author' },
    };
    const t = TRANSITIONS[action];

    const allowed = t.requires === 'commander'
        ? CA.canApprove(user, scenario_name, () => db)
        : CA.canAuthor(user);
    if (!allowed) throw withCode('Not permitted to ' + action + ' this scenario', 'FORBIDDEN');

    if (t.from.indexOf(row.status) === -1)
        throw withCode('Cannot ' + action + ' a scenario in status "' + row.status + '"', 'INVALID_TRANSITION');

    if (action === 'reject' && (typeof reason !== 'string' || !reason.trim()))
        throw withCode('reason is required to reject', 'INVALID_INPUT');

    const nIso = nowIso();
    const actorId = user.username || user.id;
    const fields = { status: t.to, updated_at: nIso };
    if (action === 'submit') { fields.submitted_by = actorId; fields.submitted_at = nIso; fields.reject_reason = null; }
    if (action === 'review')  { fields.reviewed_by = actorId; fields.reviewed_at = nIso; }
    if (action === 'approve') { fields.approved_by = actorId; fields.approved_at = nIso; }
    if (action === 'reject')  { fields.rejected_by = actorId; fields.rejected_at = nIso; fields.reject_reason = reason; }
    if (action === 'reopen')  { fields.approved_by = null; fields.approved_at = null;
                                 fields.rejected_by = null; fields.rejected_at = null; fields.reject_reason = null; }

    const setClause = Object.keys(fields).map(k => k + ' = ?').join(', ');
    db.prepare(`UPDATE scenario_lifecycle SET ${setClause} WHERE scenario_name = ?`)
      .run(...Object.keys(fields).map(k => fields[k]), scenario_name);

    const eventName = { submit: 'submitted_for_review', review: 'reviewed', approve: 'approved',
                        reject: 'rejected', reopen: 'reopened' }[action];
    appendLifecycleEvent({
        scenario_name, event: eventName, actor_id: actorId, actor_role: user.role,
        actor_display: user.displayName, from_status: row.status, to_status: t.to,
        reason: action === 'reject' ? reason : null,
    });

    return { ok: true, scenario_name, status: t.to, from: row.status, to: t.to };
}

// Called by the activation route (POST /api/scenario/active) once it has
// confirmed status is 'approved' — records the transition to 'activated'.
// NOT reachable via applyTransition/VALID_ACTIONS; activation is a distinct
// concern owned by the scenario/active route, this just persists+journals it.
function markActivated(scenario_name, user, getDb) {
    const db = (getDb || defaultGetDb)();
    const nIso = nowIso();
    const actorId = user.username || user.id;
    db.prepare(
        `UPDATE scenario_lifecycle SET status='activated', activated_by=?, activated_at=?, updated_at=? WHERE scenario_name=?`
    ).run(actorId, nIso, nIso, scenario_name);
    appendLifecycleEvent({
        scenario_name, event: 'activated', actor_id: actorId, actor_role: user.role,
        actor_display: user.displayName, from_status: 'approved', to_status: 'activated',
    });
}

function getApprovalPayload(scenario_name, user, getDb) {
    const db = (getDb || defaultGetDb)();
    const CA = commandAuthority();
    const row = getLifecycle(scenario_name, () => db);
    if (!row) return null;
    const status = row.status;
    return {
        ok: true,
        scenario_name,
        status,
        author_id: row.author_id,
        submitted_by: row.submitted_by, submitted_at: row.submitted_at,
        reviewed_by: row.reviewed_by, reviewed_at: row.reviewed_at,
        approved_by: row.approved_by, approved_at: row.approved_at,
        rejected_by: row.rejected_by, rejected_at: row.rejected_at, reject_reason: row.reject_reason,
        activated_by: row.activated_by, activated_at: row.activated_at,
        can_submit:  CA.canAuthor(user) && ['draft', 'rejected'].includes(status),
        can_review:  CA.canAuthor(user) && status === 'in_review',
        can_approve: CA.canApprove(user, scenario_name, () => db) && status === 'in_review',
        can_activate: CA.canActivate(user) && (status === 'approved' || status === 'activated'),
        history: readLifecycleEvents(scenario_name),
    };
}

function codeToHttp(code) {
    if (code === 'UNAUTHENTICATED') return 401;
    if (code === 'FORBIDDEN') return 403;
    if (code === 'NOT_FOUND') return 404;
    if (code === 'INVALID_TRANSITION') return 409;
    return 400; // INVALID_ACTION, INVALID_INPUT
}

function defaultGetUser(req) {
    try { return require('./app-data').getSessionUser(req); }
    catch (_) { return null; }
}

/**
 * HTTP handler for /api/scenarios/:name/{submit-for-review,review,approve,
 * reject,reopen,approval}. Returns true if it handled the request.
 * `getUser` is injectable (tests pass a stub); production uses the session cookie.
 */
function handleScenarioApprovalApi(req, res, pathname, method, sendJson, readJsonBody, getUser) {
    if (!pathname.startsWith('/api/scenarios/')) return false;
    const parts = pathname.split('/').filter(Boolean); // api, scenarios, :name, :action
    if (parts.length !== 4) return false;
    const scenarioName = decodeURIComponent(parts[2]);
    const action = parts[3];
    const resolveUser = getUser || defaultGetUser;

    const ACTION_TO_TRANSITION = { 'submit-for-review': 'submit', 'review': 'review',
                                    'approve': 'approve', 'reject': 'reject', 'reopen': 'reopen' };

    if (action === 'approval' && method === 'GET') {
        const user = resolveUser(req);
        if (!user) { sendJson(res, 401, { ok: false, error: 'Authentication required' }); return true; }
        const payload = getApprovalPayload(scenarioName, user);
        if (!payload) { sendJson(res, 404, { ok: false, error: 'Scenario has no lifecycle record' }); return true; }
        sendJson(res, 200, payload);
        return true;
    }

    if (ACTION_TO_TRANSITION[action] && method === 'POST') {
        const user = resolveUser(req);
        if (!user) { sendJson(res, 401, { ok: false, error: 'Authentication required' }); return true; }
        readJsonBody(req, { maxBytes: 4096 }).then((body) => {
            body = body || {};
            try {
                // Identity/reason come from the server-resolved user + body.reason
                // ONLY — no client-suppliable actor field is ever read.
                const r = applyTransition({
                    user, scenario_name: scenarioName,
                    action: ACTION_TO_TRANSITION[action], reason: body.reason,
                });
                sendJson(res, 200, r);
            } catch (e) {
                sendJson(res, codeToHttp(e.code), { ok: false, error: e.message || 'Bad request', code: e.code || null });
            }
        }).catch((e) => sendJson(res, 400, { ok: false, error: (e && e.message) || 'Invalid JSON' }));
        return true;
    }

    return false; // known /api/scenarios/:name/* shape but not our action — let other routes/404 handle it
}

module.exports = {
    applyTransition,
    ensureLifecycleRow,
    getLifecycle,
    getApprovalPayload,
    markActivated,
    appendLifecycleEvent,
    readLifecycleEvents,
    handleScenarioApprovalApi,
    VALID_ACTIONS: VALID_ACTIONS.slice(),
    _paths: { dataDir, journalDir, lifecycleJournalFile },
};
