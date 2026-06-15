'use strict';
/* ============================================================================
 * roe-escalation-engine.js — shared AI-intelligence module
 * ----------------------------------------------------------------------------
 * Maps a zone state + contact picture onto an alert/ROE escalation ladder and
 * the actions allowed/blocked at that level.
 *
 * DEMO / REVIEW-ONLY HEURISTIC. There is NO kill logic anywhere: 'engage',
 * 'destroy' and 'open_fire' are ALWAYS blocked at every level — even
 * ENGAGEMENT_READY is a posture only, never an engagement resolution. No unit
 * removal. No classified data.
 *
 * Scenario-generic: no hardcoded scenario/draft names, no hardcoded unit IDs.
 * Pure module — no DOM, no network, requireable in isolation (CommonJS).
 *
 * Exports:
 *   escalate(zoneState, contactPicture, context) → escalation decision
 * ========================================================================== */

// Kill-type actions are blocked at every level by design (review-only system).
var ALWAYS_BLOCKED = ['engage', 'destroy', 'open_fire'];

// severity → ladder rung.
var LADDER = {
    watch: { alert_state: 'WATCH', roe_state: 'HOLD' },
    warning: { alert_state: 'WARNING', roe_state: 'WARN' },
    alert: { alert_state: 'ALERT', roe_state: 'INTERCEPT' },
    engagement_ready: { alert_state: 'ENGAGEMENT_READY', roe_state: 'ENGAGE_IF_HOSTILE' },
};

// Cumulative allowed actions by rung.
var ALLOWED = {
    WATCH: ['observe', 'screen'],
    WARNING: ['observe', 'screen', 'issue_warning', 'reposition_intercept'],
    ALERT: ['observe', 'screen', 'issue_warning', 'reposition_intercept', 'intercept', 'block_axis'],
    ENGAGEMENT_READY: ['observe', 'screen', 'issue_warning', 'reposition_intercept', 'intercept', 'block_axis', 'engagement_ready_posture'],
};

function arr(v) { return Array.isArray(v) ? v : []; }

/**
 * escalate(zoneState, contactPicture, context) → escalation decision.
 */
function escalate(zoneState, contactPicture, context) {
    var ctx = context || {};
    var z = zoneState || {};
    var cp = contactPicture || {};
    var defending = String(ctx.defending_side || cp.defending_side || 'BLUE').toUpperCase();

    var severity = String(z.severity || 'watch').toLowerCase();
    var rung = LADDER[severity] || LADDER.watch;
    var alert_state = rung.alert_state;
    var roe_state = rung.roe_state;

    var allowed_actions = (ALLOWED[alert_state] || ALLOWED.WATCH).slice();
    var blocked_actions = ALWAYS_BLOCKED.slice();

    var event_log_entries = [];
    var commander_warning;

    if (alert_state === 'WATCH') {
        commander_warning = defending + ': no zone violation — maintain watch and screen.';
        event_log_entries.push('ROE: ' + defending + ' holding at WATCH (HOLD).');
    } else if (alert_state === 'WARNING') {
        commander_warning = defending + ': intruder in inferred warning zone — issue warning, reposition intercept.';
        event_log_entries.push('ROE: ' + defending + ' raised alert to WARNING (WARN).');
    } else if (alert_state === 'ALERT') {
        commander_warning = defending + ': intruder in inferred defended zone — intercept and block the axis.';
        event_log_entries.push('ROE: ' + defending + ' raised alert to INTERCEPT.');
    } else if (alert_state === 'ENGAGEMENT_READY') {
        commander_warning = defending + ': intruder in inferred engagement-ready zone — engagement-ready posture only (review-only, no engagement authority).';
        event_log_entries.push('ROE: ' + defending + ' raised alert to ENGAGEMENT_READY (posture only — engage/destroy remain blocked).');
    }

    // Note any detected contacts that drove the picture (informational only).
    var detectedCount = arr(cp.detected_contacts).length;
    if (detectedCount && alert_state !== 'WATCH') {
        event_log_entries.push('ROE: ' + defending + ' tracking ' + detectedCount + ' detected contact(s).');
    }

    return {
        alert_state: alert_state,
        roe_state: roe_state,
        allowed_actions: allowed_actions,
        blocked_actions: blocked_actions,
        commander_warning: commander_warning,
        event_log_entries: event_log_entries,
        defending_side: defending,
        demo_only: true, review_only: true,
    };
}

module.exports = {
    escalate: escalate,
    ALWAYS_BLOCKED: ALWAYS_BLOCKED,
};
