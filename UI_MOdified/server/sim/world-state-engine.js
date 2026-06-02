/* ============================================================================
 * world-state-engine.js — server seam for the RMOOZ World State engine.
 * ----------------------------------------------------------------------------
 * Single server-side entry point that composes the framework-free engine
 * modules (WS1 projection · DB1 capability enrich · DET1 detection · ENG1
 * engagement · WS3 state transition). Those modules are explicitly designed to
 * "also run server-side" (see world-state.js header) and ship UMD exports, so
 * we require them in place rather than duplicating logic.
 *
 * This is the seam the unlocked operator commit path (POST /api/sim/commit) and
 * the headless sim can call to derive World State and apply WS3 decisions —
 * "World State → operator decision → new World State". Pure: no fs, no network,
 * no mutation of inputs (WS3 clones).
 *
 * Cross-layer note: server/ requires from client/shell/ here. That is deliberate
 * (shared, framework-free engine), not drift — flagged in APP_INVENTORY.
 * ========================================================================== */
'use strict';

var path = require('path');
var SHELL = path.join(__dirname, '..', '..', 'client', 'shell');

var WS1 = require(path.join(SHELL, 'world-state.js'));            // deriveWorldState
var DB1 = require(path.join(SHELL, 'world-state-db.js'));         // enrichWorldState
var DET = require(path.join(SHELL, 'detection.js'));              // computeContacts
var ENG = require(path.join(SHELL, 'engagement.js'));            // computeEngagements
var WS3 = require(path.join(SHELL, 'world-state-transition.js')); // applyDecision(s)

/**
 * project(scenario, stepIndex, opts?) → enriched World State with contacts.
 * Pure read of the scenario (WS1 never mutates it).
 */
function project(scenario, stepIndex, opts) {
    opts = opts || {};
    var ws = WS1.deriveWorldState(scenario, stepIndex);
    ws = DB1.enrichWorldState(ws, opts.db || {});
    try { ws.contacts = DET.computeContacts(ws, opts.det || {}) || []; }
    catch (_) { ws.contacts = ws.contacts || []; }
    return ws;
}

/**
 * transition(worldState, decisions, opts?) → { worldState, effects }.
 * Accepts a single decision or an array. WS3 clones the input — pure.
 */
function transition(worldState, decisions, opts) {
    var list = Array.isArray(decisions) ? decisions : [decisions];
    return WS3.applyDecisions(worldState, list, opts || {});
}

/**
 * run(scenario, stepIndex, decisions, opts?) → { worldState, effects }.
 * Convenience: project then transition in one call.
 */
function run(scenario, stepIndex, decisions, opts) {
    var ws = project(scenario, stepIndex, opts);
    return transition(ws, decisions, opts);
}

module.exports = {
    project: project,
    transition: transition,
    run: run,
    versions: {
        ws1: WS1.WS_VERSION, db1: DB1.DB_VERSION, det1: DET.DET_VERSION,
        eng1: ENG.ENG_VERSION, ws3: WS3.WS3_VERSION
    },
    _engines: { WS1: WS1, DB1: DB1, DET: DET, ENG: ENG, WS3: WS3 }
};
