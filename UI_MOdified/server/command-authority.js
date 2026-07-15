'use strict';
/**
 * command-authority.js — Batch B: Team/Cell/Operator/Units command-authority
 * backbone. Un-parks project_team_operator_assignment_parked and
 * project_command_actions_bar_parked on explicit 2026-07-14 owner ruling,
 * scoped to what the Unified Scenario Builder needs (gating scenario
 * activation on real commander approval) — not open-ended command-toolbar
 * scope.
 *
 * Capability model: `users.role` stays the single capability carrier (no
 * separate capabilities table — the capability set is small and fixed).
 * Accepted values widen to {'observer','planner','commander','admin'}.
 * 'commander' already existed in web-server.js's SIM_MUTATION_ROLES; this
 * module is the one place that gives it a DISTINCT permission from
 * 'planner' (until now the two were treated identically everywhere).
 *
 * Team→Cell→Operator→Units assignment: `command_cells` (a team + named
 * cell) and `command_assignments` (operator -> cell, optionally scoped to
 * one scenario and/or one unit) — see the schema in app-data.js.
 *
 * ISOLATION: DB access goes through an injectable `getDb` (defaults to
 * app-data.getDb, required lazily only inside functions that need it) so
 * this module stays testable against a temp DB without booting the server.
 */

const SIM_MUTATION_ROLES = new Set(['planner', 'commander', 'admin']);

function defaultGetDb() {
    return require('./app-data').getDb();
}

function genId() {
    const crypto = require('crypto');
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'ca-' + Date.now().toString(36) + '-' + crypto.randomBytes(8).toString('hex');
}

function nowIso() { return new Date().toISOString(); }

// A user is a commander for a scenario if their role is commander/admin
// OUTRIGHT, or if a command_assignments row gives them cell_role='commander'
// for that scenario (or an unscoped, scenario_name IS NULL row).
function isCommander(user, scenarioName, getDb) {
    if (!user) return false;
    if (user.role === 'commander' || user.role === 'admin') return true;
    const db = (getDb || defaultGetDb)();
    if (!db) return false;
    const row = db.prepare(
        `SELECT 1 FROM command_assignments
         WHERE operator_id = ? AND cell_role = 'commander'
           AND (scenario_name IS NULL OR scenario_name = ?)
         LIMIT 1`
    ).get(user.id, scenarioName || null);
    return !!row;
}

// Any role that may author/mutate scenario/sim state at all — mirrors
// web-server.js's SIM_MUTATION_ROLES (kept as a separate constant here
// rather than importing from web-server.js, since web-server.js is the
// HTTP entry point and should not be a dependency of this pure module).
function canAuthor(user) {
    return !!user && SIM_MUTATION_ROLES.has(user.role);
}

function canApprove(user, scenarioName, getDb) {
    return isCommander(user, scenarioName, getDb);
}

// Activation is permitted to anyone who can author, PROVIDED the scenario
// has already been approved (that gate lives in scenario-approval-store.js,
// not here — this just answers "is this role class allowed to activate at
// all," the same way canAuthor answers "is this role class allowed to save").
function canActivate(user) {
    return canAuthor(user);
}

function commandedUnits(user, scenarioName, getDb) {
    if (!user) return [];
    const db = (getDb || defaultGetDb)();
    if (!db) return [];
    const rows = db.prepare(
        `SELECT unit_id FROM command_assignments
         WHERE operator_id = ? AND unit_id IS NOT NULL
           AND (scenario_name IS NULL OR scenario_name = ?)`
    ).all(user.id, scenarioName || null);
    return rows.map(r => r.unit_id);
}

function createCell({ team, name, createdBy }, getDb) {
    const db = (getDb || defaultGetDb)();
    const id = genId();
    const t = nowIso();
    db.prepare(
        'INSERT INTO command_cells (id, team, name, created_at, created_by) VALUES (?,?,?,?,?)'
    ).run(id, String(team || '').trim(), String(name || '').trim(), t, createdBy);
    return { id, team, name, created_at: t, created_by: createdBy };
}

function assignOperator({ cellId, operatorId, scenarioName, unitId, cellRole, createdBy }, getDb) {
    const db = (getDb || defaultGetDb)();
    const role = ['commander', 'operator', 'observer'].includes(cellRole) ? cellRole : 'operator';
    const id = genId();
    const t = nowIso();
    db.prepare(
        `INSERT INTO command_assignments
            (id, cell_id, operator_id, scenario_name, unit_id, cell_role, created_at, created_by)
         VALUES (?,?,?,?,?,?,?,?)`
    ).run(id, cellId, operatorId, scenarioName || null, unitId || null, role, t, createdBy);
    return { id, cell_id: cellId, operator_id: operatorId, scenario_name: scenarioName || null,
             unit_id: unitId || null, cell_role: role, created_at: t, created_by: createdBy };
}

module.exports = {
    SIM_MUTATION_ROLES,
    isCommander,
    canAuthor,
    canApprove,
    canActivate,
    commandedUnits,
    createCell,
    assignOperator,
};
