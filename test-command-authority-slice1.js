#!/usr/bin/env node
/**
 * test-command-authority-slice1.js — Batch B Slice 1
 *
 * Pure logic gate (no HTTP): schema migration, role/capability checks,
 * lifecycle transitions, hash-chained journal integrity, and identity
 * server-derivation for the new command-authority backbone.
 *
 *   node test-command-authority-slice1.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const ROOT = __dirname;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'rmooz-cmdauth-slice1-'));
process.env.RMOOZ_DATA_DIR = DATA_DIR;
process.env.RMOOZ_APP_DB_FILE = path.join(DATA_DIR, 'app.db');
process.env.RMOOZ_BOOTSTRAP_PASSWORD = 'test-bootstrap-pw';

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  PASS  ' + label); pass++; }
    else      { console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }
function throws(fn, expectedCode, label) {
    try { fn(); ok(false, label, 'did not throw'); }
    catch (e) { eq(e.code, expectedCode, label); }
}

function teardown() { try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (_) {} }
process.on('exit', teardown);

(function run() {
    const Database = require(path.join(ROOT, 'UI_MOdified/node_modules/better-sqlite3'));
    const appData = require(path.join(ROOT, 'UI_MOdified/server/app-data.js'));
    const db = appData.initAppData({ Database, dataDir: DATA_DIR });
    const CA = require(path.join(ROOT, 'UI_MOdified/server/command-authority.js'));
    const APPROVAL = require(path.join(ROOT, 'UI_MOdified/server/scenario-approval-store.js'));

    // ── 1. Schema migration ──────────────────────────────────────────────
    console.log('\n[1] Schema migration creates the three new tables');
    for (const t of ['command_cells', 'command_assignments', 'scenario_lifecycle']) {
        const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(t);
        ok(!!row, 'table ' + t + ' exists');
    }

    // ── 2. Capability checks per role ────────────────────────────────────
    console.log('\n[2] Capability checks: role-distinct permissions');
    const planner   = { id: 'u-planner',   username: 'planner1',   displayName: 'Planner One',   role: 'planner' };
    const commander = { id: 'u-commander', username: 'commander1', displayName: 'Commander One', role: 'commander' };
    const observer  = { id: 'u-observer',  username: 'observer1',  displayName: 'Observer One',  role: 'observer' };
    const admin     = { id: 'u-admin',     username: 'admin1',     displayName: 'Admin One',     role: 'admin' };
    // Real rows so FK-constrained tables (command_cells/command_assignments) accept them.
    const insUser = db.prepare(
        'INSERT INTO users (id, username, password_hash, display_name, role, created_at, updated_at) VALUES (?,?,?,?,?,?,?)'
    );
    const t0 = new Date().toISOString();
    for (const u of [planner, commander, observer, admin]) {
        insUser.run(u.id, u.username, 'scrypt:test:test', u.displayName, u.role, t0, t0);
    }

    ok(CA.canAuthor(planner), 'planner canAuthor');
    ok(CA.canAuthor(commander), 'commander canAuthor');
    ok(CA.canAuthor(admin), 'admin canAuthor');
    ok(!CA.canAuthor(observer), 'observer CANNOT canAuthor');
    ok(!CA.canAuthor(null), 'null user CANNOT canAuthor');

    ok(!CA.isCommander(planner, 'scn-1', () => db), 'planner is NOT commander (role check)');
    ok(CA.isCommander(commander, 'scn-1', () => db), 'commander role IS commander');
    ok(CA.isCommander(admin, 'scn-1', () => db), 'admin role IS commander (admin supersedes)');

    // Assignment-based commander: a planner with a command_assignments row
    // cell_role='commander' for a specific scenario becomes a commander for
    // THAT scenario only.
    const cell = CA.createCell({ team: 'BLUE', name: 'Fires Cell', createdBy: admin.id }, () => db);
    CA.assignOperator({ cellId: cell.id, operatorId: planner.id, scenarioName: 'scn-assigned',
                         cellRole: 'commander', createdBy: admin.id }, () => db);
    ok(CA.isCommander(planner, 'scn-assigned', () => db), 'planner WITH a commander assignment IS commander for that scenario');
    ok(!CA.isCommander(planner, 'scn-other', () => db), 'same planner is NOT commander for an unrelated scenario');

    // ── 3. Lifecycle transitions: happy path ─────────────────────────────
    console.log('\n[3] Lifecycle transitions: draft -> in_review -> approved');
    APPROVAL.ensureLifecycleRow('scn-happy', planner, () => db);
    eq(APPROVAL.getLifecycle('scn-happy', () => db).status, 'draft', 'starts at draft');

    const r1 = APPROVAL.applyTransition({ user: planner, scenario_name: 'scn-happy', action: 'submit' }, () => db);
    eq(r1.status, 'in_review', 'submit -> in_review');

    const r2 = APPROVAL.applyTransition({ user: commander, scenario_name: 'scn-happy', action: 'approve' }, () => db);
    eq(r2.status, 'approved', 'approve -> approved');
    eq(APPROVAL.getLifecycle('scn-happy', () => db).approved_by, 'commander1', 'approved_by recorded');

    // ── 4. Invalid transitions rejected ──────────────────────────────────
    console.log('\n[4] Invalid transitions are rejected');
    APPROVAL.ensureLifecycleRow('scn-invalid', planner, () => db);
    throws(() => APPROVAL.applyTransition({ user: commander, scenario_name: 'scn-invalid', action: 'approve' }, () => db),
        'INVALID_TRANSITION', 'cannot approve a draft (must be in_review first)');
    throws(() => APPROVAL.applyTransition({ user: planner, scenario_name: 'scn-invalid', action: 'approve' }, () => db),
        'FORBIDDEN', 'planner cannot approve (not a commander) — checked before transition legality');
    throws(() => APPROVAL.applyTransition({ user: null, scenario_name: 'scn-invalid', action: 'submit' }, () => db),
        'UNAUTHENTICATED', 'no user -> UNAUTHENTICATED');
    throws(() => APPROVAL.applyTransition({ user: planner, scenario_name: 'does-not-exist', action: 'submit' }, () => db),
        'NOT_FOUND', 'unknown scenario -> NOT_FOUND');

    // ── 5. Reject requires a reason ──────────────────────────────────────
    console.log('\n[5] Reject requires a non-empty reason');
    APPROVAL.ensureLifecycleRow('scn-reject', planner, () => db);
    APPROVAL.applyTransition({ user: planner, scenario_name: 'scn-reject', action: 'submit' }, () => db);
    throws(() => APPROVAL.applyTransition({ user: commander, scenario_name: 'scn-reject', action: 'reject' }, () => db),
        'INVALID_INPUT', 'reject with no reason -> INVALID_INPUT');
    const r3 = APPROVAL.applyTransition({ user: commander, scenario_name: 'scn-reject', action: 'reject', reason: 'coords unverified' }, () => db);
    eq(r3.status, 'rejected', 'reject with reason succeeds');
    eq(APPROVAL.getLifecycle('scn-reject', () => db).reject_reason, 'coords unverified', 'reject_reason recorded');

    // Reopen from rejected -> draft
    const r4 = APPROVAL.applyTransition({ user: planner, scenario_name: 'scn-reject', action: 'reopen' }, () => db);
    eq(r4.status, 'draft', 'reopen (rejected -> draft)');
    eq(APPROVAL.getLifecycle('scn-reject', () => db).reject_reason, null, 'reject_reason cleared on reopen');

    // ── 6. Hash-chain integrity ───────────────────────────────────────────
    console.log('\n[6] Journal hash chain is valid and monotonic');
    const events = APPROVAL.readLifecycleEvents('scn-happy');
    ok(events.length >= 2, 'at least 2 events recorded for scn-happy (authored, submitted, approved)');
    let chainOk = true;
    for (let i = 1; i < events.length; i++) {
        if (events[i].prev_event_hash !== events[i - 1].event_hash) chainOk = false;
    }
    ok(chainOk, 'each event\'s prev_event_hash matches the prior event\'s event_hash');
    ok(events.every(e => !!e.event_hash), 'every event has a hash');

    // ── 7. Identity is server-derived, not client-suppliable ─────────────
    console.log('\n[7] Actor identity comes from the passed user object, not any body-like field');
    APPROVAL.ensureLifecycleRow('scn-identity', planner, () => db);
    // Simulate a "forged" attempt: applyTransition's signature only accepts
    // {user, scenario_name, action, reason} — there is no actor_id parameter
    // at all, so a caller cannot inject one even if it tried.
    const r5 = APPROVAL.applyTransition({ user: planner, scenario_name: 'scn-identity', action: 'submit',
                                           actor_id: 'FORGED-ACTOR' /* not a recognized field */ }, () => db);
    eq(r5.status, 'in_review', 'transition succeeds');
    eq(APPROVAL.getLifecycle('scn-identity', () => db).submitted_by, 'planner1', 'submitted_by is the REAL user, forged field ignored');
    const lastEvent = APPROVAL.readLifecycleEvents('scn-identity').slice(-1)[0];
    eq(lastEvent.actor_id, 'planner1', 'journal actor_id is the real user');
    ok(lastEvent.actor_id !== 'FORGED-ACTOR', 'journal actor_id is NOT the forged value');

    console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' pass, ' + fail + ' fail');
    process.exit(fail === 0 ? 0 : 1);
})();
