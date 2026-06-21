/**
 * unit-taskability.js — RMOOZ-STEP1-COA-PREPARATION-GATE-AE
 *
 * Unit Taskability Resolver + Step-1 COA Preparation Report.
 *
 * WHY: a Step-1 ORBAT (the "خطوات صنع القرار" GCC BLUE template and similar uploads) is NOT an approved
 * operational order. Its units carry review-only markers — source_required, needs_review:true,
 * exact_unit_position:false, lat/lon:null, doctrine_upload_required, commander_review_required. Such a
 * unit MUST NOT receive a movement/combat task; it can only HOLD / be flagged REVIEW_REQUIRED /
 * SOURCE_REQUIRED / DOCTRINE_REQUIRED until source, coordinates, doctrine and commander approval exist.
 *
 * This is a PURE, deterministic engine layer — no DOM, no scenario mutation, no network, no LLM. It is the
 * single source of truth for "is this unit taskable", reused by the Free Fight cockpit today and by the
 * Scenario Control Center rebuild (RMOOZ-SCENARIO-CONTROL-CENTER-REBUILD-AF) as its Step-1 Readiness gate.
 *
 * It stays INSIDE the locked AI/sim boundary: it classifies and reports only — it never moves a unit,
 * never writes the journal, never calls the planner. The actual movement suppression / commit refusal /
 * run refusal is enforced by the consumer (free-fight-demo.js) using these verdicts.
 */
(function (global) {
    'use strict';

    // The combat / movement tasks a taskable unit may receive (and that a Step-1 placeholder may NOT).
    var COMBAT_ACTIONS = ['MOVE_TOWARD_OBJECTIVE', 'ATTACK', 'SUPPORT_BY_FIRE', 'SCREEN_FLANK', 'RECON_OBJECTIVE'];
    // The review-only statuses a non-taskable unit may hold instead.
    var REVIEW_ACTIONS = ['HOLD_POSITION', 'REVIEW_REQUIRED', 'SOURCE_REQUIRED', 'DOCTRINE_REQUIRED'];

    function fin(n) { return n != null && isFinite(Number(n)); }
    function coordsOf(u) {
        if (!u) return { lat: null, lon: null, ok: false };
        var lat = u.lat, lon = u.lon;
        if ((lat == null || lon == null) && Array.isArray(u.coord) && u.coord.length >= 2) { lon = u.coord[0]; lat = u.coord[1]; }
        var ok = fin(lat) && fin(lon);
        return { lat: ok ? Number(lat) : null, lon: ok ? Number(lon) : null, ok: ok };
    }
    function unitId(u) { return (u && (u.id || u.uid || u.unit_uid)) ? String(u.id || u.uid || u.unit_uid) : null; }

    /**
     * Classify ONE unit. ctx (optional, brief/scenario-level) carries the doctrine + commander-review
     * posture that applies to all units of the set:
     *   { doctrine_required, doctrine_ok, commander_review_required, commander_approved }
     * Per-unit flags (unit.doctrine_upload_required / unit.commander_review_required /
     * unit.requires_commander_approval) take precedence when present.
     *
     * Returns: { id, taskable, reason, review_status, allowed_actions, blocked_actions, blockers }
     */
    function classifyUnit(unit, ctx) {
        ctx = ctx || {};
        var id = unitId(unit);
        var c = coordsOf(unit);
        var blockers = { coords: false, source: false, doctrine: false, commander_review: false };
        var why = [];

        // (1) coordinates — a unit with null / non-finite lat/lon has no verified position to move from/to.
        if (!c.ok) { blockers.coords = true; why.push('no verified position (lat/lon null)'); }

        // (2) source / position verification — Step-1 placeholders are review-only.
        if (unit && (unit.source_required === true || unit.exact_unit_position === false ||
                     unit.needs_review === true || unit.review_only === true)) {
            blockers.source = true;
            why.push(unit.source_required === true ? 'source_required'
                : (unit.exact_unit_position === false ? 'exact_unit_position:false' : 'needs_review'));
        }

        // (3) doctrine — required (per-unit flag OR brief-level ctx) and not satisfied.
        var doctrineReq = (unit && unit.doctrine_upload_required === true) || ctx.doctrine_required === true;
        if (doctrineReq && ctx.doctrine_ok !== true) { blockers.doctrine = true; why.push('doctrine_upload_required'); }

        // (4) commander review — required (per-unit flag OR brief-level ctx) and not yet approved.
        var cmdrReq = (unit && (unit.commander_review_required === true || unit.requires_commander_approval === true)) ||
                      ctx.commander_review_required === true;
        if (cmdrReq && ctx.commander_approved !== true) { blockers.commander_review = true; why.push('commander_review_required'); }

        var taskable = !blockers.coords && !blockers.source && !blockers.doctrine && !blockers.commander_review;

        if (taskable) {
            return { id: id, taskable: true, simulation_only: false, source_verified: true, reason: 'taskable', review_status: 'OK',
                allowed_actions: COMBAT_ACTIONS.concat(['HOLD_POSITION']), blocked_actions: [], blockers: blockers };
        }
        // RMOOZ-SCC-STEP1-TRAINING-APPROVAL-AK: an explicit operator "Approve Draft for Training Simulation"
        // makes review-only units taskable ONLY in simulation mode. It overrides the source / doctrine /
        // commander-review blockers (the operator has reviewed and accepted them for TRAINING) but NEVER the
        // coords blocker — a unit with no verified position still cannot move. The unit's source flags are NOT
        // mutated (Evidence still shows them); this is a runtime override, and every such unit is flagged
        // simulation_only + source_verified:false so nothing is ever mistaken for a source-verified order.
        if (!taskable && !blockers.coords && ctx.training_approved === true) {
            return { id: id, taskable: true, simulation_only: true, source_verified: false,
                reason: 'training-approved (SIMULATION ONLY — overrides: ' + (why.join(', ') || 'review-only') + ')',
                review_status: 'TRAINING_APPROVED',
                allowed_actions: COMBAT_ACTIONS.concat(['HOLD_POSITION']), blocked_actions: [], blockers: blockers,
                overridden: { source: blockers.source, doctrine: blockers.doctrine, commander_review: blockers.commander_review } };
        }
        // Primary review status — coords/source first (most common Step-1 case), then doctrine, then commander.
        var review_status = (blockers.coords || blockers.source) ? 'SOURCE_REQUIRED'
            : blockers.doctrine ? 'DOCTRINE_REQUIRED'
            : blockers.commander_review ? 'COMMANDER_REVIEW_REQUIRED' : 'REVIEW_REQUIRED';
        var allowed = ['HOLD_POSITION', 'REVIEW_REQUIRED'];
        if (blockers.coords || blockers.source) allowed.push('SOURCE_REQUIRED');
        if (blockers.doctrine) allowed.push('DOCTRINE_REQUIRED');
        return { id: id, taskable: false, reason: why.join(', ') || 'review required', review_status: review_status,
            allowed_actions: allowed, blocked_actions: COMBAT_ACTIONS.concat(['MOVE']), blockers: blockers };
    }

    /**
     * COA Preparation Report over a set of units. Counts are NON-EXCLUSIVE (a unit blocked by both missing
     * source and missing coords increments both) so the operator sees every gap; `blocked` is the unique
     * count of blocked units. executable === at least one taskable unit exists.
     */
    function prepareReport(units, ctx) {
        ctx = ctx || {};
        units = Array.isArray(units) ? units : [];
        var taskable_units = [], blocked_units = [];
        var cnt = { source: 0, coords: 0, doctrine: 0, commander: 0 }, simCount = 0;
        // RMOOZ-SCC-STEP1-TRAINING-APPROVAL-AK: how many units are review-only but training-eligible (would
        // become taskable in simulation mode) — i.e. blocked ONLY by source/doctrine/commander, not coords.
        var training_eligible = 0;
        units.forEach(function (u) {
            var t = classifyUnit(u, ctx);
            if (t.taskable) { taskable_units.push({ id: t.id, side: (u && u.side) || null, simulation_only: !!t.simulation_only }); if (t.simulation_only) simCount++; return; }
            if (!t.blockers.coords) training_eligible++;
            blocked_units.push({ id: t.id, side: (u && u.side) || null, reason: t.reason,
                review_status: t.review_status, allowed_actions: t.allowed_actions });
            if (t.blockers.source) cnt.source++;
            if (t.blockers.coords) cnt.coords++;
            if (t.blockers.doctrine) cnt.doctrine++;
            if (t.blockers.commander_review) cnt.commander++;
        });
        var taskable = taskable_units.length, blocked = blocked_units.length, loaded = units.length;
        var executable = taskable >= 1;
        var trainingApproved = ctx.training_approved === true;
        var message = !loaded ? 'No units loaded.'
            : !executable ? (training_eligible > 0
                ? 'COA unavailable — Step 1 data is review-only. Approve for Training Simulation to task ' + training_eligible + ' review-only unit(s) (SIMULATION ONLY — not source-verified), or complete source/commander review.'
                : 'COA unavailable — Step 1 data requires source/doctrine/commander review.')
            : (simCount > 0 ? (taskable + ' taskable (' + simCount + ' SIMULATION-ONLY, not source-verified)' + (blocked ? ', ' + blocked + ' still blocked' : '') + '.')
                : (blocked > 0 ? (taskable + ' taskable, ' + blocked + ' blocked pending source/doctrine review.') : null));
        return {
            units_loaded: loaded, taskable: taskable, blocked: blocked,
            blocked_by_missing_source: cnt.source,
            blocked_by_missing_coordinates: cnt.coords,
            blocked_by_missing_doctrine: cnt.doctrine,
            blocked_by_commander_review: cnt.commander,
            taskable_units: taskable_units, blocked_units: blocked_units,
            executable: executable, message: message,
            // AK: training-simulation fields
            training_approved: trainingApproved, training_eligible: training_eligible, simulation_taskable: simCount,
            simulation_only: trainingApproved && simCount > 0,
        };
    }

    // True when the set carries Step-1 review-only markers (any blocked unit) or has no taskable units.
    function isStep1State(units, ctx) {
        var r = prepareReport(units, ctx);
        return r.blocked > 0 || !r.executable;
    }

    var API = {
        COMBAT_ACTIONS: COMBAT_ACTIONS.slice(),
        REVIEW_ACTIONS: REVIEW_ACTIONS.slice(),
        classifyUnit: classifyUnit,
        prepareReport: prepareReport,
        isStep1State: isStep1State,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined') window.RmoozTaskability = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
