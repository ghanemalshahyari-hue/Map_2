/* ============================================================================
 * why-not-panel.js — L3-B-1: read-only Why-Not display panel (Scenario Workspace)
 * ----------------------------------------------------------------------------
 * Exposes AppActionFeasibility.evaluateAction(ws, action) output as a read-only
 * operator explanation: action type · verdict · blockers · risks · evidence gaps.
 *
 * STRICTLY read-only display. NO decision logic, NO alternatives, NO scoring, NO
 * recommendation wording (it shows the evaluator's factual explanations verbatim),
 * NO simulation, NO mutation, NO apply/commit/execute controls, NO Team/Operator,
 * NO DB changes. It only READS via evaluateAction.
 *
 * Action context (safe derivation, never invented):
 *   - ENGAGE needs an explicit current engagement selection context (actor+target).
 *     That plumbing does not exist yet, so we do NOT fabricate an ENGAGE pair.
 *   - ATTACK_OBJECTIVE on the scenario's primary objective is a real standing
 *     question and is derivable whenever an objective + evidence ledger exist.
 *   - If nothing can be safely derived → neutral empty state:
 *       "No action selected for Why-Not review."
 * ========================================================================== */
(function () {
    'use strict';

    var POLL_MS = 800;
    var lastKey = null;

    function getScenario() { var s = window.RmoozScenario; return (s && s.scenario) || null; }
    function getStep()     { var s = window.RmoozScenario; return (s && typeof s.stepIndex === 'number') ? s.stepIndex : 0; }
    function body()        { return document.getElementById('wn-body'); }

    function esc(t) {
        var m = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
        return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return m[c]; });
    }
    function humanCode(c) {
        return String(c || '').replace(/_/g, ' ').replace(/^\w/, function (m) { return m.toUpperCase(); });
    }

    function setEmpty() {
        var b = body(); if (!b) return;
        b.innerHTML = '<p class="wn-empty" data-i18n="wn-empty">No action selected for Why-Not review.</p>';
    }

    // SAFE, non-invented action derivation (see header).
    function deriveAction(ws) {
        var objs = (ws && Array.isArray(ws.objectives)) ? ws.objectives : [];
        if (!objs.length) return null;
        var o = objs[0];
        if (!o || (!o.id && !o.name)) return null;
        return { type: 'attack_objective', objectiveId: o.id || o.name, _label: o.name || o.id };
    }

    function actionLabel(action) {
        if (!action) return '';
        if (String(action.type).toUpperCase() === 'ENGAGE') {
            return 'Engage: ' + (action.target_uid || action.targetUid || 'target');
        }
        return 'Attack objective: ' + (action._label || action.objectiveId || 'objective');
    }

    function renderList(title, items, cls) {
        if (!items || !items.length) return '';
        var h = '<div class="wn-group wn-' + cls + '">' +
                '<div class="wn-group-title">' + esc(title) + ' (' + items.length + ')</div><ul class="wn-list">';
        items.forEach(function (it) {
            h += '<li class="wn-item">' +
                 '<span class="wn-code">' + esc(humanCode(it.code)) + '</span>' +
                 '<span class="wn-exp">' + esc(it.explanation || '') + '</span>' +
                 '<span class="wn-src">' + esc(it.source || '') + '</span>' +
                 '</li>';
        });
        return h + '</ul></div>';
    }

    function paint() {
        var b = body(); if (!b) return;
        var scenario = getScenario();
        var WS = window.AppWorldState, AF = window.AppActionFeasibility;
        if (!scenario || !WS || !AF ||
            typeof WS.deriveWorldState !== 'function' || typeof AF.evaluateAction !== 'function') {
            setEmpty(); return;
        }

        var ws;
        try { ws = WS.deriveWorldState(scenario, getStep()); } catch (_e) { setEmpty(); return; }
        if (!ws || ws.degraded || !ws.derived ||
            !Array.isArray(ws.derived.objective_evidence) || !ws.derived.objective_evidence.length) {
            setEmpty(); return;  // cannot safely assess → neutral state (no invented action)
        }

        var action = deriveAction(ws);
        if (!action) { setEmpty(); return; }

        var f;
        try { f = AF.evaluateAction(ws, action); } catch (_e2) { setEmpty(); return; }
        if (!f) { setEmpty(); return; }

        var verdict = f.verdict || 'feasible';
        var blockers = f.blockers || [], risks = f.risks || [], gaps = f.evidence_gaps || [];
        var html = '';
        html += '<div class="wn-action">' + esc(actionLabel(action)) + '</div>';
        html += '<div class="wn-verdict wn-verdict-' + esc(verdict) + '">' + esc(humanCode(verdict)) + '</div>';
        html += renderList('Blockers', blockers, 'blockers');
        html += renderList('Risks', risks, 'risks');
        html += renderList('Evidence gaps', gaps, 'gaps');
        if (!blockers.length && !risks.length && !gaps.length) {
            html += '<p class="wn-clear" data-i18n="wn-clear">No blockers, risks, or evidence gaps in the current state.</p>';
        }
        b.innerHTML = html;
        if (typeof window.applyI18nToElement === 'function') window.applyI18nToElement(b);
    }

    function key() {
        var sc = getScenario();
        return (sc ? (sc.scenario_id || sc.scenario_label || 'scn') : 'none') + '@' + getStep();
    }
    function tick() { var k = key(); if (k !== lastKey) { lastKey = k; paint(); } }

    if (typeof window !== 'undefined' && window.document) {
        document.addEventListener('rmooz:playback-tick', paint);
        document.addEventListener('rmooz:scenario-visibility-changed', paint);
        if (document.readyState !== 'loading') paint();
        else document.addEventListener('DOMContentLoaded', paint);
        setInterval(tick, POLL_MS);
    }

    // Exposed for tests / console (read-only).
    window.AppShellWhyNotPanel = { paint: paint, _deriveAction: deriveAction };
})();
