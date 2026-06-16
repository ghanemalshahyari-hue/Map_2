/**
 * Operational shell — global AI model selector (RMOOZ-LOCAL-MODEL-SELECTOR-A).
 *
 * Always-visible header control so the operator can pick the LOCAL model the
 * whole app uses WITHOUT opening the Free Fight card or editing env vars.
 * Renders into `<div id="ai-model-hud-mount">` in the app header (beside the
 * clock + side picker). Mirrors the Free Fight card's model block; both talk to
 * the same server endpoints and the same single source of truth
 * (server/ai/model-selection.js):
 *
 *   GET  /api/ai/models          → { ok, provider, selected_model,
 *                                    models:[{name,available}],
 *                                    available_models_count, model_available,
 *                                    allow_sim_run }
 *   POST /api/ai/model/select    → { model } → persists + same payload shape
 *
 * On a successful selection it fires `rmooz:ai-model-changed` on document so the
 * Free Fight card (and any other listener) re-syncs. It also listens for that
 * event so a change made elsewhere updates this control. RMOOZ_ALLOW_SIM_RUN is
 * the only execution gate — this widget only SELECTS; it never runs AI.
 *
 * NOTE (anti-duplication): the adjudicator HUD's #wg-adj-provider / #wg-adj-model
 * is the adjudication backbone's per-call override and is intentionally separate
 * from this global selection — do not merge them.
 *
 * Bridge name: window.AppShellAiModelHud
 */
(function () {
    'use strict';

    var MOUNT_ID = 'ai-model-hud-mount';
    var REFRESH_MS = 60000;            // slow safety refresh (also refreshes on the change event + manual button)

    var mountEl = null;
    var info = null;                   // last /api/ai/models payload
    var pending = null;                // dropdown's current (uncommitted) value
    var busy = false;

    function W() { return window; }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // GET the model list + current selection. Best-effort; never throws.
    function fetchModels() {
        var w = W();
        if (!w || typeof w.fetch !== 'function') return Promise.resolve(null);
        return w.fetch('/api/ai/models', { method: 'GET' })
            .then(function (r) { return r.text(); })
            .then(function (txt) {
                var parsed = null;
                try { parsed = txt ? JSON.parse(txt) : null; } catch (_) {}
                info = (parsed && typeof parsed === 'object') ? parsed : { ok: false, error: 'non_json_response' };
                if (pending == null && info && info.selected_model) pending = info.selected_model;
                render();
                return info;
            })
            .catch(function (e) {
                info = { ok: false, error: (e && e.message) || 'fetch failed' };
                render();
                return info;
            });
    }

    // POST the operator's choice. Persists app-wide; fires rmooz:ai-model-changed.
    function selectModel(model) {
        var w = W();
        if (!model || busy || !w || typeof w.fetch !== 'function') return;
        busy = true;
        render();
        w.fetch('/api/ai/model/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: model }),
        })
            .then(function (r) { return r.text().then(function (t) { return { status: r.status, ok: r.ok, text: t }; }); })
            .then(function (res) {
                busy = false;
                var parsed = null;
                try { parsed = res.text ? JSON.parse(res.text) : null; } catch (_) {}
                if (res.ok && parsed && parsed.ok) {
                    info = parsed;
                    pending = parsed.selected_model || model;
                    render();
                    // Tell the rest of the app (Free Fight card, etc.). source guards the echo.
                    try {
                        document.dispatchEvent(new CustomEvent('rmooz:ai-model-changed',
                            { detail: { model: pending, source: 'global_hud', model_available: !!parsed.model_available } }));
                    } catch (_) {}
                } else {
                    info = Object.assign({}, info, { ok: false, error: (parsed && parsed.error) || ('http_' + res.status) });
                    render();
                }
            })
            .catch(function (e) {
                busy = false;
                info = Object.assign({}, info || {}, { ok: false, error: (e && e.message) || 'select failed' });
                render();
            });
    }

    // ── rendering ──────────────────────────────────────────────────────────────
    // RMOOZ-FREE-FIGHT-AI-GATE-CARD-D: a selected/installed model does NOT mean Free Fight can run.
    // The execution gate (RMOOZ_ALLOW_SIM_RUN) or a remote raw provider (local-only policy) can still
    // block it — surface that here so this selector never implies Free Fight is ready when it isn't.
    function statusClass() {
        if (!info || info.ok === false) return 'is-error';
        if (info.allow_sim_run !== true) return 'is-idle';
        if (info.provider_blocked === true) return 'is-error';
        if (info.model_available === false) return 'is-error';
        return 'is-ok';
    }
    function statusText() {
        if (!info || info.ok === false) return 'AI offline — غير متصل';
        var sel = info.selected_model || '—';
        var avail = info.model_available === true ? '✓' : (info.model_available === false ? '✗ not installed' : '?');
        var gate = info.allow_sim_run === true ? 'gate on' : 'gate off';
        var ff = (info.allow_sim_run !== true) ? ' · FF blocked (gate)'
               : (info.provider_blocked === true) ? ' · FF blocked (remote provider)'
               : '';
        return sel + ' · ' + avail + ' · ' + gate + ff;
    }
    function statusTitle() {
        if (!info) return 'AI model — النموذج المحلي';
        var lines = [
            'Selected model — النموذج المختار: ' + (info.selected_model || '—'),
            'Source: ' + (info.selection_source || '—'),
            'Installed locally: ' + (info.model_available === true ? 'yes' : (info.model_available === false ? 'NO — run `ollama pull ' + (info.selected_model || '<model>') + '`' : 'unknown')),
            'Provider: ' + (info.provider || 'ollama') + (info.provider_reachable === false ? ' (unreachable)' : ''),
            'Installed models: ' + (info.available_models_count != null ? info.available_models_count : '?'),
            'AI execution gate (RMOOZ_ALLOW_SIM_RUN): ' + (info.allow_sim_run === true ? 'ON' : 'OFF'),
            // RMOOZ-FREE-FIGHT-AI-GATE-CARD-D: Free Fight readiness is separate from "a model is selected".
            (info.provider_blocked === true
                ? 'Free Fight: BLOCKED — configured provider "' + (info.configured_provider || '?') + '" is remote. Set RMOOZ_LLM_PROVIDER=ollama or remove the remote provider env.'
                : (info.allow_sim_run !== true
                    ? 'Free Fight: BLOCKED — set RMOOZ_ALLOW_SIM_RUN=1 and restart the server.'
                    : 'Free Fight: ready (local-only).')),
        ];
        return lines.join('\n');
    }

    function optionsHtml() {
        var models = (info && Array.isArray(info.models)) ? info.models : [];
        if (!models.length) {
            return '<option value="">' + esc(info && info.ok === false ? '(provider offline)' : '(no models)') + '</option>';
        }
        var sel = pending != null ? pending : (info && info.selected_model) || '';
        return models.map(function (m) {
            var name = m && m.name ? m.name : String(m);
            var label = name + (m && m.available === false ? '  (not installed)' : '');
            return '<option value="' + esc(name) + '"' + (name === sel ? ' selected' : '') + '>' + esc(label) + '</option>';
        }).join('');
    }

    function render() {
        if (!mountEl) return;
        var disabled = busy ? ' disabled' : '';
        mountEl.innerHTML =
            '<span class="ai-model-hud-label" title="' + esc(statusTitle()) + '">' +
                '<span class="ai-model-hud-provider">Ollama</span>' +
            '</span>' +
            '<select id="ai-model-hud-select" class="ai-model-hud-select" dir="ltr" aria-label="Local AI model — النموذج المحلي"' + disabled + '>' +
                optionsHtml() +
            '</select>' +
            '<button type="button" data-act="refresh" class="ai-model-hud-btn" title="Refresh models — تحديث القائمة"' + disabled + '>↻</button>' +
            '<button type="button" data-act="use" class="ai-model-hud-btn ai-model-hud-btn--use" title="Use this model app-wide — استخدم هذا النموذج"' + disabled + '>' +
                (busy ? '…' : 'Use — استخدم') +
            '</button>' +
            '<span class="wargame-state-pill ai-model-hud-status ' + statusClass() + '" title="' + esc(statusTitle()) + '">' +
                esc(statusText()) +
            '</span>';

        var selEl = mountEl.querySelector('#ai-model-hud-select');
        if (selEl) selEl.addEventListener('change', function () { pending = selEl.value; });
        var refreshBtn = mountEl.querySelector('[data-act="refresh"]');
        if (refreshBtn) refreshBtn.addEventListener('click', function () { fetchModels(); });
        var useBtn = mountEl.querySelector('[data-act="use"]');
        if (useBtn) useBtn.addEventListener('click', function () {
            var val = selEl ? selEl.value : pending;
            if (val) selectModel(val);
        });
    }

    // Re-sync when the model changes elsewhere (e.g. the Free Fight card). Skip
    // our own echo to avoid a redundant round-trip.
    function onModelChanged(e) {
        if (e && e.detail && e.detail.source === 'global_hud') return;
        fetchModels();
    }

    function init() {
        mountEl = document.getElementById(MOUNT_ID);
        if (!mountEl) return;
        mountEl.classList.add('ai-model-hud');
        render();                                  // immediate shell (shows "—" until the fetch lands)
        fetchModels();
        document.addEventListener('rmooz:ai-model-changed', onModelChanged);
        try { setInterval(fetchModels, REFRESH_MS); } catch (_) {}
        // Re-render labels on language toggle (chain, never clobber).
        var prev = window.onLanguageChange;
        window.onLanguageChange = function (lang) {
            try { render(); } catch (_) {}
            if (typeof prev === 'function') { try { prev(lang); } catch (_) {} }
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    window.AppShellAiModelHud = {
        refresh: fetchModels,
        select:  selectModel,
        getInfo: function () { return info ? JSON.parse(JSON.stringify(info)) : null; },
    };
})();
