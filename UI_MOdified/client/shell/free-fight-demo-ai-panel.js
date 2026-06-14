'use strict';
/* ============================================================================
 * free-fight-demo-ai-panel.js — pure renderDecision helper
 * ----------------------------------------------------------------------------
 * FREEFIGHT-DEMO-AI-INTEGRATE-A: The separate floating card is gone.
 * AI decision controls (Preview / Apply / Reset) now live inside the existing
 * rmooz-free-fight-panel card (free-fight-demo.js).
 *
 * This file is kept only as a thin helper that exports renderDecision() for
 * Node unit-test compatibility (test-freefight-demo-ai-ui-wire-a.js §1-§6).
 * No DOM elements are created here; no event listeners are registered.
 *
 * Exposes window.RmoozFreeFightAiPanel:
 *   renderDecision(container, decision) — pure HTML render; testable in Node
 * ========================================================================== */
(function (win) {
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    /* ---------------------------------------------------------------------- */
    /* renderDecision(container, decision)                                     */
    /* Paints the AI Decision Preview card.  Pure — no fetch, no side-effects.*/
    /* ---------------------------------------------------------------------- */
    function renderDecision(container, decision) {
        if (!container) return;
        decision = decision || {};
        var ok  = !!decision.ok;
        var act = decision.action || {};
        var ar  = decision.apply_result || {};

        var body = ok && act.action_type ? [
            '<div style="margin-bottom:6px;"><span style="color:#8fa5b8;">Action:</span> <span style="color:#e0e8f0;">' + esc(act.action_type) + '</span></div>',
            '<div style="margin-bottom:6px;"><span style="color:#8fa5b8;">Unit:</span> <span style="color:#e0e8f0;">' + esc(act.unit_uid) + '</span></div>',
            '<div style="margin-bottom:6px;"><span style="color:#8fa5b8;">Side:</span> <span style="color:#e0e8f0;">' + esc(act.side) + '</span></div>',
            '<div style="margin-bottom:6px;"><span style="color:#8fa5b8;">Reason:</span> <span style="color:#d0e0d0;font-style:italic;">' + esc(act.reason) + '</span></div>',
            '<div style="margin-bottom:6px;"><span style="color:#8fa5b8;">Confidence:</span> <span style="color:#e0e8f0;">' + esc(act.confidence) + '</span></div>',
            ar.ok && ar.new_pos ? '<div style="margin-bottom:6px;"><span style="color:#8fa5b8;">New Position:</span> <span style="color:#a0e0a0;">' + esc(ar.new_pos.lat) + ', ' + esc(ar.new_pos.lon) + '</span></div>' : '',
        ].join('') : '<div style="color:#e0a93a;padding:4px 0;">No action — no movable unit found.</div>';

        var logHtml = decision.event_log_entry
            ? '<div style="margin-top:8px;padding:6px;background:#0e1218;border-radius:4px;color:#9ab0c0;font-size:11px;font-family:monospace;">' + esc(decision.event_log_entry) + '</div>'
            : '';

        var buttons = ok && act.action_type ? [
            '<button type="button" data-act="apply-ai" style="font:inherit;cursor:pointer;border:1px solid #3a7a3a;background:#182818;color:#90d090;border-radius:5px;padding:6px 12px;font-size:11px;">Apply AI Action — تطبيق</button>',
            '<button type="button" data-act="close-ai" style="font:inherit;cursor:pointer;border:1px solid #5a6270;background:#2a2f37;color:#e8eaed;border-radius:5px;padding:6px 12px;font-size:11px;">Dismiss — إغلاق</button>',
        ].join('') : '<button type="button" data-act="close-ai" style="font:inherit;cursor:pointer;border:1px solid #5a6270;background:#2a2f37;color:#e8eaed;border-radius:5px;padding:6px 12px;font-size:11px;">Dismiss — إغلاق</button>';

        container.innerHTML = [
            '<div style="background:#1a1e26;border:1px solid #3a4050;border-radius:6px;padding:12px;margin-top:8px;font-size:12px;direction:ltr;">',
            '<div style="font-weight:bold;color:#c8d8e8;margin-bottom:8px;">AI Decision Preview — معاينة قرار الذكاء الاصطناعي</div>',
            body,
            logHtml,
            '<div style="margin-top:10px;display:flex;gap:8px;">' + buttons + '</div>',
            '</div>',
        ].join('');
    }

    win.RmoozFreeFightAiPanel = { renderDecision: renderDecision };
}(typeof window !== 'undefined' ? window : global));
