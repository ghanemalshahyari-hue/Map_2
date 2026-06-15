'use strict';
/* ============================================================================
 * free-fight-situation-triggers.js — FREEFIGHT-BLUE-WARNING-ROE-A
 * ----------------------------------------------------------------------------
 * A lightweight situation + ROE trigger layer evaluated BEFORE COA selection,
 * so BLUE reacts to a RED intrusion (warn / alert / intercept / escalate)
 * instead of silently moving like a plain planner.
 *
 * DEMO / REVIEW-ONLY HEURISTIC — no kill logic, no engagement resolution, no
 * unit removal. Only zones, alert state, ROE state, triggers and a recommended
 * BLUE posture. Distances are approximate coordinate degrees for the demo.
 *
 * Exports:
 *   evaluateFreeFightSituation(units, objectives, context) → situation
 *   buildBlueReactionIntent(situation)                     → { posture, warning_actions[], event_log[], recommended_coa_hint }
 *   WARNING_ZONE_DEG, DEFENDED_ZONE_DEG, ENGAGEMENT_ZONE_DEG
 * ========================================================================== */

// Demo heuristic thresholds (degrees from the defended objective). Review-only.
var WARNING_ZONE_DEG    = 0.35; // RED within this of the BLUE objective → warning
var DEFENDED_ZONE_DEG   = 0.20; // → defended zone
var ENGAGEMENT_ZONE_DEG = 0.10; // → engagement-ready zone
var DEG_TO_KM = 111;            // ≈ km per degree (equator approximation)

function arr(v) { return Array.isArray(v) ? v : []; }
function finiteN(v) { var n = Number(v); return Number.isFinite(n) ? n : null; }
function unitHasCoord(u) {
    if (!u) return false;
    var la = u.lat, lo = u.lon;
    if ((la == null || lo == null) && Array.isArray(u.coord) && u.coord.length >= 2) { lo = u.coord[0]; la = u.coord[1]; }
    return Number.isFinite(Number(la)) && Number.isFinite(Number(lo));
}
function unitLL(u) {
    var la = u.lat, lo = u.lon;
    if ((la == null || lo == null) && Array.isArray(u.coord) && u.coord.length >= 2) { lo = u.coord[0]; la = u.coord[1]; }
    return { lat: Number(la), lon: Number(lo) };
}
function unitSide(u) { return String((u && u.side) || 'RED').toUpperCase(); }
function unitUid(u) { return (u && (u.id || u.uid || u.unit_uid)) || null; }
function dist(a, b) { var dx = a.lat - b.lat, dy = a.lon - b.lon; return Math.sqrt(dx * dx + dy * dy); }

function bestObjective(objectives, context) {
    var list = arr(objectives);
    for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (!o) continue;
        if (Number.isFinite(finiteN(o.lat)) && Number.isFinite(finiteN(o.lon))) return { lat: Number(o.lat), lon: Number(o.lon), name: o.name || o.label || 'Objective X' };
        if (Array.isArray(o.coord) && o.coord.length >= 2 && Number.isFinite(+o.coord[0]) && Number.isFinite(+o.coord[1])) return { lat: +o.coord[1], lon: +o.coord[0], name: o.name || o.label || 'Objective X' };
    }
    if (context && context.objective && Number.isFinite(+context.objective.lat)) return { lat: +context.objective.lat, lon: +context.objective.lon, name: context.objective.name || 'Objective X' };
    return null;
}

/**
 * evaluateFreeFightSituation(units, objectives, context) → situation
 * Looks at where RED is relative to the BLUE-defended objective and derives an
 * alert state, ROE state, triggers and a recommended BLUE posture.
 */
function evaluateFreeFightSituation(units, objectives, context) {
    context = context || {};
    var activeSide = String(context.active_side || 'RED').toUpperCase();
    var obj = bestObjective(objectives, context);
    var all = arr(units).filter(unitHasCoord);
    var red  = all.filter(function (u) { return unitSide(u) === 'RED'; });
    var blue = all.filter(function (u) { return unitSide(u) === 'BLUE'; });

    var base = {
        ok: true,
        demo_only: true, review_only: true,
        active_side: activeSide,
        objective: obj ? { lat: obj.lat, lon: obj.lon, name: obj.name } : null,
        thresholds_deg: { warning: WARNING_ZONE_DEG, defended: DEFENDED_ZONE_DEG, engagement: ENGAGEMENT_ZONE_DEG },
        red_near_objective_count: 0,
        blue_near_objective_count: 0,
        red_inside_blue_warning_zone: false,
        red_inside_blue_defended_zone: false,
        red_inside_engagement_zone: false,
        nearest_red_to_objective_km: null,
        nearest_red_to_objective_deg: null,
        nearest_red_uid: null,
        nearest_red: null,
        nearest_blue_uid: null,
        nearest_blue: null,
        alert_state: 'WATCH',
        roe_state: 'HOLD',
        triggers: [],
        recommended_blue_posture: 'hold',
        note: 'Demo heuristic / review-only — zones are approximate coordinate degrees, no engagement resolution.',
    };

    if (!obj) { base.ok = false; base.reason = 'no_objective'; return base; }
    if (!red.length) { return base; } // nothing to react to → WATCH/HOLD

    // Nearest RED + BLUE to the objective.
    var nearestRed = null, nearestRedD = Infinity;
    red.forEach(function (u) { var d = dist(unitLL(u), obj); if (d < nearestRedD) { nearestRedD = d; nearestRed = u; } });
    var nearestBlue = null, nearestBlueD = Infinity;
    blue.forEach(function (u) { var d = dist(unitLL(u), obj); if (d < nearestBlueD) { nearestBlueD = d; nearestBlue = u; } });

    base.red_near_objective_count  = red.filter(function (u) { return dist(unitLL(u), obj) <= WARNING_ZONE_DEG; }).length;
    base.blue_near_objective_count = blue.filter(function (u) { return dist(unitLL(u), obj) <= WARNING_ZONE_DEG; }).length;
    base.nearest_red_uid = unitUid(nearestRed);
    base.nearest_red = nearestRed ? unitLL(nearestRed) : null;
    base.nearest_red_to_objective_deg = Math.round(nearestRedD * 1e4) / 1e4;
    base.nearest_red_to_objective_km = Math.round(nearestRedD * DEG_TO_KM * 10) / 10;
    base.nearest_blue_uid = unitUid(nearestBlue);
    base.nearest_blue = nearestBlue ? unitLL(nearestBlue) : null;

    base.red_inside_blue_warning_zone  = nearestRedD <= WARNING_ZONE_DEG;
    base.red_inside_blue_defended_zone = nearestRedD <= DEFENDED_ZONE_DEG;
    base.red_inside_engagement_zone    = nearestRedD <= ENGAGEMENT_ZONE_DEG;

    var objName = obj.name || 'Objective X';
    var ru = base.nearest_red_uid || 'a RED unit';

    // Escalation ladder + cumulative triggers (outermost first).
    if (base.red_inside_blue_warning_zone) {
        base.alert_state = 'WARNING'; base.roe_state = 'WARN'; base.recommended_blue_posture = 'warn_and_intercept';
        base.triggers.push({ code: 'red_entered_warning_zone', severity: 'medium', text: 'RED unit ' + ru + ' entered BLUE warning zone near ' + objName + '.' });
    }
    if (base.red_inside_blue_defended_zone) {
        base.alert_state = 'ALERT'; base.roe_state = 'INTERCEPT'; base.recommended_blue_posture = 'warn_and_intercept';
        base.triggers.push({ code: 'red_entered_defended_zone', severity: 'high', text: 'RED unit ' + ru + ' entered BLUE defended zone near ' + objName + '.' });
    }
    if (base.red_inside_engagement_zone) {
        base.alert_state = 'ENGAGEMENT_READY'; base.roe_state = 'ENGAGE_IF_HOSTILE'; base.recommended_blue_posture = 'engagement_ready';
        base.triggers.push({ code: 'red_entered_engagement_zone', severity: 'critical', text: 'RED unit ' + ru + ' entered BLUE engagement-ready zone near ' + objName + '.' });
    }
    if (!base.triggers.length) {
        base.recommended_blue_posture = 'screen';
        base.triggers.push({ code: 'no_red_threat_near_objective', severity: 'info', text: 'No RED unit within BLUE warning zone of ' + objName + '; maintain watch.' });
    }
    return base;
}

/**
 * buildBlueReactionIntent(situation) → reaction intent for the acting BLUE side.
 * warning_actions / event_log are posture-graded. NO kill or engagement output.
 */
function buildBlueReactionIntent(situation) {
    var s = situation || {};
    var objName = (s.objective && s.objective.name) || 'Objective X';
    var ru = s.nearest_red_uid || 'a RED unit';
    var alert = s.alert_state || 'WATCH';
    var warning_actions = [], event_log = [], recommended_coa_hint = 'hold_screen';

    if (alert === 'WATCH') {
        recommended_coa_hint = 'hold_screen';
        warning_actions = ['Maintain screen and observation near ' + objName + '.', 'Hold current defensive posture (no RED threat in warning zone).'];
    } else if (alert === 'WARNING') {
        recommended_coa_hint = 'intercept';
        warning_actions = ['Issue warning to RED unit ' + ru + '.', 'Raise BLUE alert state to WARNING.', 'Move intercept group to observe / block the RED axis.'];
        event_log.push('BLUE WARNING: RED unit ' + ru + ' entered warning zone near ' + objName + '.');
    } else if (alert === 'ALERT') {
        recommended_coa_hint = 'intercept';
        warning_actions = ['Issue warning to RED unit ' + ru + '.', 'Raise BLUE alert state to ALERT.', 'Move intercept group to block the RED axis toward ' + objName + '.'];
        event_log.push('BLUE WARNING: RED unit ' + ru + ' entered defended zone near ' + objName + '.');
        event_log.push('BLUE ALERT: Intercept posture activated.');
    } else if (alert === 'ENGAGEMENT_READY') {
        recommended_coa_hint = 'intercept';
        warning_actions = ['Issue final warning to RED unit ' + ru + '.', 'Raise BLUE alert state to ENGAGEMENT_READY.', 'Move interceptors to engagement-ready posture (review-only — no engagement authority).'];
        event_log.push('BLUE WARNING: RED unit ' + ru + ' entered engagement-ready zone near ' + objName + '.');
        event_log.push('BLUE ALERT: Engagement-ready posture activated (review-only — no engagement resolution).');
    }
    return {
        posture: s.recommended_blue_posture || 'hold',
        alert_state: alert,
        roe_state: s.roe_state || 'HOLD',
        recommended_coa_hint: recommended_coa_hint,
        warning_actions: warning_actions,
        event_log: event_log,
        demo_only: true, review_only: true,
    };
}

module.exports = {
    evaluateFreeFightSituation: evaluateFreeFightSituation,
    buildBlueReactionIntent: buildBlueReactionIntent,
    WARNING_ZONE_DEG: WARNING_ZONE_DEG,
    DEFENDED_ZONE_DEG: DEFENDED_ZONE_DEG,
    ENGAGEMENT_ZONE_DEG: ENGAGEMENT_ZONE_DEG,
};
