'use strict';
/* ============================================================================
 * free-fight-action-engine.js — FREEFIGHT-DEMO-AI-MOVE-PROOF-A
 * ----------------------------------------------------------------------------
 * Unit-level action engine for the Free Fight demo.  Works on individual
 * proposed_units (not the group-level RmoozFreeFightAI planner).
 *
 * Exports:
 *   decideAction(units, objectives, opts?)   → action | null
 *   validateAction(action, units, objectives?) → { ok, reason? }
 *   applyAction(action, units)               → { ok, unit, old_pos, new_pos, reason? }
 *   makeEventLogEntry(action, applyResult)   → string
 *
 * Safety contract (same as the rest of Free Fight):
 *   • No new units are ever created.
 *   • Objectives are never moved.
 *   • Units with no valid coordinate are blocked, not silently placed.
 *   • step size is capped at MAX_STEP_DEG (no teleporting).
 *   • source_type stays 'deterministic_demo_ai' (or 'llm' if caller overrides).
 *   • Every action carries demo_only:true, review_only:true, needs_review:true.
 *
 * Pure + synchronous + Node-requireable + no DOM.
 * ========================================================================== */

var STEP_DEG   = 0.05;   // ≈ 5-6 km per tick — visibly moves on map
var MAX_STEP_DEG = 0.15; // teleport guard
var PATROL_RADIUS = 0.08; // patrol arc radius in degrees

var ALLOWED_ACTION_TYPES = ['MOVE_TOWARD_OBJECTIVE', 'DEFEND_BASE', 'HOLD_POSITION', 'PATROL_NEAR_BASE'];
var ALLOWED_SIDES = ['RED', 'BLUE'];
var ALLOWED_RISK = ['low', 'medium', 'high'];
var ALLOWED_CONFIDENCE = ['low', 'medium', 'high'];

function arr(v) { return Array.isArray(v) ? v : []; }
function finiteN(v) { var n = Number(v); return Number.isFinite(n) ? n : null; }
function finiteLL(o) { return !!(o && Number.isFinite(finiteN(o.lat)) && Number.isFinite(finiteN(o.lon))); }
function dist(a, b) {
    var dx = a.lat - b.lat, dy = a.lon - b.lon;
    return Math.sqrt(dx * dx + dy * dy);
}
function stepToward(from, to, step) {
    var d = dist(from, to);
    if (d <= step) return { lat: to.lat, lon: to.lon };
    var t = step / d;
    return { lat: from.lat + (to.lat - from.lat) * t, lon: from.lon + (to.lon - from.lon) * t };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getUnitById(units, uid) {
    return arr(units).find(function (u) { return u && u.id === uid; }) || null;
}

function unitHasCoord(u) {
    // Explicit null/undefined check first — Number(null) === 0 which is finite
    return !!(u && u.lat != null && u.lon != null &&
              Number.isFinite(Number(u.lat)) && Number.isFinite(Number(u.lon)));
}

function bestObjective(objectives) {
    var list = arr(objectives);
    for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (!o) continue;
        if (finiteLL(o)) return { lat: Number(o.lat), lon: Number(o.lon) };
        if (Array.isArray(o.coord) && o.coord.length >= 2 && Number.isFinite(+o.coord[0]) && Number.isFinite(+o.coord[1])) {
            return { lat: +o.coord[1], lon: +o.coord[0] };  // GeoJSON [lon, lat]
        }
        if (o.lat != null && o.lon != null && Number.isFinite(finiteN(o.lat)) && Number.isFinite(finiteN(o.lon))) {
            return { lat: Number(o.lat), lon: Number(o.lon) };
        }
    }
    return null;
}

// ── Brain ─────────────────────────────────────────────────────────────────────
/**
 * decideAction(units, objectives, opts)
 *   units:       array of proposed_unit objects (must have id, side, lat, lon)
 *   objectives:  array of {lat,lon} or {coord:[lon,lat]} or a single {lat,lon}
 *   opts:        { preferSide:'RED'|'BLUE', source:'deterministic_demo_ai'|'llm' }
 *
 * Returns an action object (see schema at top of file) or null when no
 * movable unit exists.
 */
function decideAction(units, objectives, opts) {
    opts = opts || {};
    var source = opts.source || 'deterministic_demo_ai';
    var objList = Array.isArray(objectives) ? objectives : (objectives ? [objectives] : []);
    var obj = bestObjective(objList);
    var preferSide = String(opts.preferSide || 'RED').toUpperCase();
    var candidates = arr(units).filter(function (u) { return u && unitHasCoord(u); });

    // Prefer the requested side first; fall back to any side.
    var sideFirst = candidates.filter(function (u) { return String(u.side || '').toUpperCase() === preferSide; });
    var pool = sideFirst.length ? sideFirst : candidates;

    if (!pool.length) return null;  // no movable unit

    // Pick the unit closest to the objective (or first unit when no objective).
    var chosen = pool[0];
    if (obj) {
        pool.forEach(function (u) {
            if (dist({ lat: u.lat, lon: u.lon }, obj) < dist({ lat: chosen.lat, lon: chosen.lon }, obj)) {
                chosen = u;
            }
        });
    }

    var side = String(chosen.side || '').toUpperCase();
    if (ALLOWED_SIDES.indexOf(side) === -1) side = 'RED';

    // Choose action type:
    //   • RED + objective exists → MOVE_TOWARD_OBJECTIVE
    //   • BLUE + objective exists → DEFEND_BASE (reaction)
    //   • no objective → HOLD_POSITION
    var actionType, targetCoord, reason, risk, confidence;

    if (obj) {
        if (side === 'RED') {
            actionType = 'MOVE_TOWARD_OBJECTIVE';
            targetCoord = { type: 'objective', lat: obj.lat, lon: obj.lon };
            reason = 'Advance toward Objective X to improve strike positioning.';
            risk = 'medium';
            confidence = 'medium';
        } else {
            actionType = 'DEFEND_BASE';
            // BLUE defends: move toward a midpoint between home base and objective.
            var base = (chosen.lat != null && chosen.lon != null) ? { lat: chosen.lat, lon: chosen.lon } : null;
            var midLat = base ? (base.lat + obj.lat) / 2 : obj.lat;
            var midLon = base ? (base.lon + obj.lon) / 2 : obj.lon;
            targetCoord = { type: 'coord', lat: midLat, lon: midLon };
            reason = 'Advance to intercept position between base and Objective X.';
            risk = 'low';
            confidence = 'medium';
        }
    } else {
        actionType = 'HOLD_POSITION';
        targetCoord = { type: 'coord', lat: chosen.lat, lon: chosen.lon };
        reason = 'No objective defined; unit holds current position.';
        risk = 'low';
        confidence = 'high';
    }

    return {
        action_type: actionType,
        side: side,
        unit_uid: chosen.id,
        target: targetCoord,
        reason: reason,
        risk: risk,
        confidence: confidence,
        source: source,
        // Safety stamps (review-only — never mutate without validate+apply)
        demo_only: true,
        review_only: true,
        needs_review: true,
        requires_commander_approval: true,
        exact_unit_position: false,
    };
}

// ── Validator ─────────────────────────────────────────────────────────────────
/**
 * validateAction(action, units, objectives?)
 * Returns { ok: true } or { ok: false, reason: '...' }.
 */
function validateAction(action, units, objectives) {
    if (!action || typeof action !== 'object') return { ok: false, reason: 'action is null or not an object' };
    if (ALLOWED_ACTION_TYPES.indexOf(action.action_type) === -1) return { ok: false, reason: 'Unknown action_type: ' + action.action_type };
    if (ALLOWED_SIDES.indexOf(String(action.side || '').toUpperCase()) === -1) return { ok: false, reason: 'Unknown side: ' + action.side };
    if (!action.unit_uid) return { ok: false, reason: 'action.unit_uid is required' };

    var unit = getUnitById(units, action.unit_uid);
    if (!unit) return { ok: false, reason: 'Unit not found: ' + action.unit_uid };
    if (!unitHasCoord(unit)) return { ok: false, reason: 'Unit has no valid coordinate; assign base/position first.' };

    // Side must match
    if (String(unit.side || '').toUpperCase() !== String(action.side || '').toUpperCase()) {
        return { ok: false, reason: 'Unit side (' + unit.side + ') does not match action.side (' + action.side + ')' };
    }

    var target = action.target;
    if (!target) return { ok: false, reason: 'action.target is required' };
    if (!finiteLL(target)) return { ok: false, reason: 'action.target has no valid lat/lon' };

    // Teleport guard: step must be ≤ MAX_STEP_DEG
    if (action.action_type !== 'HOLD_POSITION') {
        var d = dist({ lat: unit.lat, lon: unit.lon }, { lat: target.lat, lon: target.lon });
        var step = Math.min(d, STEP_DEG);
        if (step > MAX_STEP_DEG) return { ok: false, reason: 'Computed step exceeds teleport guard (' + MAX_STEP_DEG + '°)' };
    }

    return { ok: true };
}

// ── Apply ─────────────────────────────────────────────────────────────────────
/**
 * applyAction(action, units)
 * Mutates units array in-place: moves the unit one step toward target.
 * Returns { ok, unit, old_pos, new_pos, moved_km }.
 * Does NOT create new units. Does NOT move objectives.
 */
function applyAction(action, units) {
    var validation = validateAction(action, units);
    if (!validation.ok) return { ok: false, reason: validation.reason };

    var unit = getUnitById(units, action.unit_uid);
    var old_pos = { lat: unit.lat, lon: unit.lon };
    var new_pos;

    if (action.action_type === 'HOLD_POSITION') {
        new_pos = { lat: unit.lat, lon: unit.lon };
    } else if (action.action_type === 'PATROL_NEAR_BASE') {
        // Small arc: rotate ~15° around the unit's current position
        var angle = (Date.now() % 360) * Math.PI / 180;
        new_pos = {
            lat: old_pos.lat + PATROL_RADIUS * Math.sin(angle),
            lon: old_pos.lon + PATROL_RADIUS * Math.cos(angle),
        };
    } else {
        // MOVE_TOWARD_OBJECTIVE or DEFEND_BASE
        var target = { lat: action.target.lat, lon: action.target.lon };
        new_pos = stepToward(old_pos, target, STEP_DEG);
    }

    // Round to 5 decimal places (≈ 1 m precision) to avoid floating-point drift
    new_pos.lat = Math.round(new_pos.lat * 1e5) / 1e5;
    new_pos.lon = Math.round(new_pos.lon * 1e5) / 1e5;

    unit.lat = new_pos.lat;
    unit.lon = new_pos.lon;

    var moved_km = dist(old_pos, new_pos) * 111; // ≈ km (1° ≈ 111 km at equator)
    return {
        ok: true,
        unit: unit,
        old_pos: old_pos,
        new_pos: new_pos,
        moved_km: Math.round(moved_km * 10) / 10,
    };
}

// ── Event log ─────────────────────────────────────────────────────────────────
/**
 * makeEventLogEntry(action, applyResult?)
 * Returns a plain-text event log line suitable for the #event-log ledger.
 * Format: "AI Decision: <SIDE> <action> <platform> — reason: <reason> — confidence: <conf>"
 */
function makeEventLogEntry(action, applyResult) {
    if (!action) return '';
    var platform = '';
    // applyResult may carry the unit
    if (applyResult && applyResult.unit) {
        platform = String(applyResult.unit.platform || applyResult.unit.id || '');
    }

    var verb;
    switch (action.action_type) {
        case 'MOVE_TOWARD_OBJECTIVE': verb = 'moved toward Objective X'; break;
        case 'DEFEND_BASE':           verb = 'moved to intercept position'; break;
        case 'HOLD_POSITION':         verb = 'held position'; break;
        case 'PATROL_NEAR_BASE':      verb = 'patrolled near base'; break;
        default:                      verb = action.action_type;
    }

    var parts = [
        'AI Decision:',
        String(action.side || ''),
        platform ? platform : String(action.unit_uid || ''),
        verb,
    ];
    if (action.reason) parts.push('— reason: ' + action.reason);
    if (action.confidence) parts.push('— confidence: ' + action.confidence);
    if (applyResult && applyResult.ok === false) parts.push('— BLOCKED: ' + applyResult.reason);
    var source = action.source ? ' [' + action.source + ']' : '';
    return parts.join(' ') + source;
}

// ── Module exports ────────────────────────────────────────────────────────────
module.exports = {
    decideAction: decideAction,
    validateAction: validateAction,
    applyAction: applyAction,
    makeEventLogEntry: makeEventLogEntry,
    // constants exposed for tests
    STEP_DEG: STEP_DEG,
    MAX_STEP_DEG: MAX_STEP_DEG,
    ALLOWED_ACTION_TYPES: ALLOWED_ACTION_TYPES,
};
