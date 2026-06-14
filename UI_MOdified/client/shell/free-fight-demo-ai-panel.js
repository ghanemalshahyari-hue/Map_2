'use strict';
/* ============================================================================
 * free-fight-demo-ai-panel.js — FREEFIGHT-DEMO-AI-UI-WIRE-A
 * ----------------------------------------------------------------------------
 * Client-side panel for the unit-level Free Fight AI demo.
 *
 * Exposes window.RmoozFreeFightAiPanel:
 *   renderDecision(container, decision)  — pure HTML render; testable in Node
 *   openPanel(payload, anchorEl)         — fetches endpoint, mounts panel
 *
 * Safety: review-only; no unit is moved without commander Apply click.
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

    /* ---------------------------------------------------------------------- */
    /* openPanel(payload, anchorEl)                                            */
    /* Fetches /api/wargame-sim/free-fight/demo-ai-step and mounts the card.  */
    /* ---------------------------------------------------------------------- */
    function openPanel(payload, anchorEl) {
        var ob = (payload && payload.brief && payload.brief.operational_brief) || {};
        var units = Array.isArray(ob.proposed_units) ? ob.proposed_units : [];
        // Objectives: check placement_candidates[type=objective] first, then ob.objectives
        var objectives = Array.isArray(ob.placement_candidates)
            ? ob.placement_candidates.filter(function (c) { return c && String(c.type || '').toLowerCase() === 'objective'; })
            : [];
        if (!objectives.length && Array.isArray(ob.objectives)) objectives = ob.objectives;

        var panelId = 'rmooz-ff-ai-panel';
        var doc = win.document;
        var container = doc && doc.getElementById(panelId);
        if (!container) {
            container = doc && doc.createElement('div');
            if (!container) return;
            container.id = panelId;
            if (anchorEl && anchorEl.parentNode) {
                anchorEl.parentNode.insertBefore(container, anchorEl.nextSibling);
            } else if (doc && doc.body) {
                doc.body.appendChild(container);
            }
        }
        container.style.display = '';
        container.innerHTML = '<div style="color:#9ab0c0;font-size:12px;padding:8px;">Loading AI decision… جاري التحميل</div>';

        var fetchFn = (typeof win.fetch === 'function') ? win.fetch : (typeof fetch === 'function' ? fetch : null);
        if (!fetchFn) {
            container.innerHTML = '<div style="color:#e0a93a;font-size:12px;padding:8px;">fetch() not available.</div>';
            return;
        }

        fetchFn('/api/wargame-sim/free-fight/demo-ai-step', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ units: units, objectives: objectives, opts: { preferSide: 'RED' } }),
        })
        .then(function (r) { return r.json(); })
        .then(function (decision) {
            renderDecision(container, decision);
            var applyBtn = container.querySelector('[data-act="apply-ai"]');
            if (applyBtn) {
                applyBtn.addEventListener('click', function () {
                    _applyDecision(decision, container);
                });
            }
            var closeBtn = container.querySelector('[data-act="close-ai"]');
            if (closeBtn) {
                closeBtn.addEventListener('click', function () {
                    container.innerHTML = '';
                    container.style.display = 'none';
                });
            }
        })
        .catch(function (e) {
            container.innerHTML = '<div style="color:#e0a93a;font-size:12px;padding:8px;">Error: ' + esc(e && e.message) + '</div>';
        });
    }

    /* ---------------------------------------------------------------------- */
    /* _applyDecision — fires when commander clicks "Apply AI Action"         */
    /* ---------------------------------------------------------------------- */
    function _applyDecision(decision, container) {
        if (!decision || !decision.ok || !decision.scenario_patch) {
            container.innerHTML += '<div style="color:#e0a93a;font-size:11px;padding:4px;">Nothing to apply.</div>';
            return;
        }
        _appendToEventLog(decision.event_log_entry);

        var patch = decision.scenario_patch;
        if (win.dispatchEvent) {
            win.dispatchEvent(new CustomEvent('rmooz:ff-ai-unit-moved', {
                detail: {
                    unit_uid: patch.unit_uid,
                    lat: patch.lat,
                    lon: patch.lon,
                    event_log_entry: decision.event_log_entry,
                },
            }));
        }

        // Disable apply button after use
        var applyBtn = container.querySelector('[data-act="apply-ai"]');
        if (applyBtn) { applyBtn.disabled = true; applyBtn.style.opacity = '0.5'; }

        container.innerHTML += '<div style="color:#90d090;font-size:11px;padding:4px;margin-top:4px;">✔ Applied — unit moved on map — تم التطبيق</div>';
    }

    /* ---------------------------------------------------------------------- */
    /* _appendToEventLog                                                       */
    /* ---------------------------------------------------------------------- */
    function _appendToEventLog(entry) {
        if (!entry) return;
        try {
            if (win.AppShellEventLog && typeof win.AppShellEventLog.append === 'function') {
                // OPERATOR is the only allowed category for user-visible AI action events;
                // 'AI' is blocked by the closed category gate in event-log.js.
                win.AppShellEventLog.append({ category: 'OPERATOR', severity: 'info', source: 'FF-AI', message: entry });
                return;
            }
            var doc = win.document;
            var rows = doc && doc.getElementById('sw-live-event-log-rows');
            if (rows) {
                var row = doc.createElement('div');
                row.className = 'ev-row';
                row.style.cssText = 'padding:3px 6px;border-bottom:1px solid #1e2530;font-size:11px;';
                row.textContent = entry;
                rows.appendChild(row);
                var cnt = doc.getElementById('sw-live-event-log-count');
                if (cnt) cnt.textContent = String((parseInt(cnt.textContent, 10) || 0) + 1);
                var empty = doc.getElementById('sw-live-event-log-empty');
                if (empty) empty.style.display = 'none';
            }
        } catch (_) {}
    }

    /* ---------------------------------------------------------------------- */
    /* Map marker listener — moves a transient circleMarker on window.map    */
    /* when the commander clicks Apply.  Demo-only; removed on next Apply.   */
    /* ---------------------------------------------------------------------- */
    var _aiMarker = null;
    if (win.addEventListener) {
        win.addEventListener('rmooz:ff-ai-unit-moved', function (e) {
            try {
                var d = e && e.detail;
                if (!d || d.lat == null || d.lon == null) return;
                var map = win.map;
                var L   = win.L;
                if (!map || !L) return;
                if (_aiMarker) { try { map.removeLayer(_aiMarker); } catch (_) {} _aiMarker = null; }
                _aiMarker = L.circleMarker([Number(d.lat), Number(d.lon)], {
                    radius: 10, color: '#90d090', weight: 2,
                    fillColor: '#182818', fillOpacity: 0.85,
                });
                var popupHtml =
                    '<div style="font-size:11px;">' +
                    '<b style="color:#90d090;">[AI Demo]</b> ' + esc(d.unit_uid || '') + '<br>' +
                    '<span style="color:#a0b0a0;">' + esc((d.event_log_entry || '').slice(0, 140)) + '</span>' +
                    '</div>';
                _aiMarker.bindPopup(popupHtml, { maxWidth: 300 });
                _aiMarker.addTo(map);
                _aiMarker.openPopup();
            } catch (_) {}
        });
    }

    win.RmoozFreeFightAiPanel = { renderDecision: renderDecision, openPanel: openPanel };
}(typeof window !== 'undefined' ? window : global));
