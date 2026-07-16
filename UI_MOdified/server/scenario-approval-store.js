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
function scenarioRevisions() {
    return require('./scenario-revisions-store');
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
    if (action === 'approve') {
        fields.approved_by = actorId; fields.approved_at = nIso;
        // Batch D Slice 2: bind approval to the EXACT revision reviewed, not
        // just "whatever's on disk" — the commander approval UI can then show
        // precisely which revision was approved, and activation (below) can
        // refuse to proceed if the content has moved on since.
        const latest = scenarioRevisions().getLatestRevision(scenario_name, () => db);
        fields.approved_revision = latest ? latest.revision_number : null;
    }
    if (action === 'reject')  { fields.rejected_by = actorId; fields.rejected_at = nIso; fields.reject_reason = reason; }
    if (action === 'reopen')  { fields.approved_by = null; fields.approved_at = null; fields.approved_revision = null;
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

// Batch B Slice 12: closes a stale-revision bypass found during E2E testing
// — a re-save of an already-approved/activated scenario previously left its
// status untouched (see the comment at the ensureLifecycleRow call site in
// web-server.js), so an operator could edit content AFTER approval and still
// launch it under the old approval, with no reviewer ever having seen the
// new content. Called on every re-save (not the first save) of a scenario
// that already has a lifecycle row; demotes approved/activated back to
// draft, clearing approval/activation fields, and journals why. Deliberately
// blunt (no content diff) — ANY re-save after approval requires a fresh
// submit+approve cycle, which is simpler to audit than partial invalidation.
function invalidateApprovalOnRevision(scenario_name, user, getDb) {
    const db = (getDb || defaultGetDb)();
    const row = getLifecycle(scenario_name, () => db);
    if (!row || (row.status !== 'approved' && row.status !== 'activated')) return null;
    const nIso = nowIso();
    const actorId = (user && (user.username || user.id)) || null;
    db.prepare(
        `UPDATE scenario_lifecycle SET status='draft', approved_by=NULL, approved_at=NULL, approved_revision=NULL,
         activated_by=NULL, activated_at=NULL, activated_revision=NULL, updated_at=? WHERE scenario_name=?`
    ).run(nIso, scenario_name);
    appendLifecycleEvent({
        scenario_name, event: 'revision_invalidated_approval', actor_id: actorId,
        actor_role: user && user.role, actor_display: user && user.displayName,
        from_status: row.status, to_status: 'draft',
        reason: 'scenario content re-saved after approval — approval invalidated, resubmission required',
    });
    return { ok: true, scenario_name, status: 'draft', from: row.status, to: 'draft' };
}

// Called by the activation route (POST /api/scenario/active) once it has
// confirmed status is 'approved' — records the transition to 'activated'.
// NOT reachable via applyTransition/VALID_ACTIONS; activation is a distinct
// concern owned by the scenario/active route, this just persists+journals it.
function markActivated(scenario_name, user, getDb) {
    const db = (getDb || defaultGetDb)();
    const nIso = nowIso();
    const actorId = user.username || user.id;
    // Batch D Slice 2: record the revision that is actually being activated,
    // for the same audit reason approval records approved_revision.
    const latest = scenarioRevisions().getLatestRevision(scenario_name, () => db);
    const activatedRevision = latest ? latest.revision_number : null;
    db.prepare(
        `UPDATE scenario_lifecycle SET status='activated', activated_by=?, activated_at=?, activated_revision=?, updated_at=? WHERE scenario_name=?`
    ).run(actorId, nIso, activatedRevision, nIso, scenario_name);
    appendLifecycleEvent({
        scenario_name, event: 'activated', actor_id: actorId, actor_role: user.role,
        actor_display: user.displayName, from_status: 'approved', to_status: 'activated',
    });
    return activatedRevision;
}

// Batch D Slice 5: archive/restore-from-archive. Archiving is reversible
// bookkeeping only — it never touches scenario_revisions (no content change)
// and is reachable from ANY status (unlike applyTransition's fixed from/to
// map), so it lives as its own pair of functions rather than forcing it into
// VALID_ACTIONS/TRANSITIONS. "Avoid destructive deletion" per the batch's
// scope — there is no delete endpoint anywhere; archive is the only way to
// get a scenario out of active rotation, and it always round-trips.
function archiveScenario(scenario_name, user, getDb) {
    const db = (getDb || defaultGetDb)();
    if (!user) throw withCode('Authentication required', 'UNAUTHENTICATED');
    if (!commandAuthority().canAuthor(user)) throw withCode('Not permitted to archive this scenario', 'FORBIDDEN');
    const row = getLifecycle(scenario_name, () => db);
    if (!row) throw withCode('Scenario has no lifecycle record — save it first', 'NOT_FOUND');
    if (row.status === 'archived') throw withCode('Scenario is already archived', 'INVALID_TRANSITION');
    const nIso = nowIso();
    const actorId = user.username || user.id;
    db.prepare(
        `UPDATE scenario_lifecycle SET status='archived', archived_by=?, archived_at=?, pre_archive_status=?, updated_at=? WHERE scenario_name=?`
    ).run(actorId, nIso, row.status, nIso, scenario_name);
    appendLifecycleEvent({
        scenario_name, event: 'archived', actor_id: actorId, actor_role: user.role,
        actor_display: user.displayName, from_status: row.status, to_status: 'archived',
    });
    return { ok: true, scenario_name, status: 'archived', from: row.status, to: 'archived' };
}

function restoreFromArchive(scenario_name, user, getDb) {
    const db = (getDb || defaultGetDb)();
    if (!user) throw withCode('Authentication required', 'UNAUTHENTICATED');
    if (!commandAuthority().canAuthor(user)) throw withCode('Not permitted to restore this scenario from archive', 'FORBIDDEN');
    const row = getLifecycle(scenario_name, () => db);
    if (!row) throw withCode('Scenario has no lifecycle record — save it first', 'NOT_FOUND');
    if (row.status !== 'archived') throw withCode('Scenario is not archived', 'INVALID_TRANSITION');
    const restoredStatus = row.pre_archive_status || 'draft';
    const nIso = nowIso();
    const actorId = user.username || user.id;
    db.prepare(
        `UPDATE scenario_lifecycle SET status=?, archived_by=NULL, archived_at=NULL, pre_archive_status=NULL, updated_at=? WHERE scenario_name=?`
    ).run(restoredStatus, nIso, scenario_name);
    appendLifecycleEvent({
        scenario_name, event: 'restored_from_archive', actor_id: actorId, actor_role: user.role,
        actor_display: user.displayName, from_status: 'archived', to_status: restoredStatus,
    });
    return { ok: true, scenario_name, status: restoredStatus, from: 'archived', to: restoredStatus };
}

function getApprovalPayload(scenario_name, user, getDb) {
    const db = (getDb || defaultGetDb)();
    const CA = commandAuthority();
    const row = getLifecycle(scenario_name, () => db);
    if (!row) return null;
    const status = row.status;
    const latest = scenarioRevisions().getLatestRevision(scenario_name, () => db);
    return {
        ok: true,
        scenario_name,
        status,
        author_id: row.author_id,
        submitted_by: row.submitted_by, submitted_at: row.submitted_at,
        reviewed_by: row.reviewed_by, reviewed_at: row.reviewed_at,
        approved_by: row.approved_by, approved_at: row.approved_at, approved_revision: row.approved_revision,
        rejected_by: row.rejected_by, rejected_at: row.rejected_at, reject_reason: row.reject_reason,
        activated_by: row.activated_by, activated_at: row.activated_at, activated_revision: row.activated_revision,
        archived_by: row.archived_by, archived_at: row.archived_at, pre_archive_status: row.pre_archive_status,
        // Batch D Slice 2: the current HEAD revision, so a UI can show the
        // operator whether approved_revision is still current (===latest) or
        // stale (a re-save has moved on — invalidateApprovalOnRevision
        // already demotes status on any resave, this is for display/audit).
        latest_revision: latest ? latest.revision_number : null,
        can_submit:  CA.canAuthor(user) && ['draft', 'rejected'].includes(status),
        can_review:  CA.canAuthor(user) && status === 'in_review',
        can_approve: CA.canApprove(user, scenario_name, () => db) && status === 'in_review',
        can_activate: CA.canActivate(user) && (status === 'approved' || status === 'activated'),
        can_archive: CA.canAuthor(user) && status !== 'archived',
        can_restore_from_archive: CA.canAuthor(user) && status === 'archived',
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
    // Batch D Slice 5: archive/restore-from-archive bypass applyTransition
    // entirely (reachable from any status) — routed to their own functions.
    const STANDALONE_ACTIONS = { 'archive': archiveScenario, 'restore-from-archive': restoreFromArchive };

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

    if (STANDALONE_ACTIONS[action] && method === 'POST') {
        const user = resolveUser(req);
        if (!user) { sendJson(res, 401, { ok: false, error: 'Authentication required' }); return true; }
        readJsonBody(req, { maxBytes: 4096 }).then(() => {
            try {
                const r = STANDALONE_ACTIONS[action](scenarioName, user);
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
    invalidateApprovalOnRevision,
    getLifecycle,
    getApprovalPayload,
    markActivated,
    archiveScenario,
    restoreFromArchive,
    appendLifecycleEvent,
    readLifecycleEvents,
    handleScenarioApprovalApi,
    VALID_ACTIONS: VALID_ACTIONS.slice(),
    _paths: { dataDir, journalDir, lifecycleJournalFile },
};
