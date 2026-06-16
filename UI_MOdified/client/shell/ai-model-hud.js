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
    var pending = null;                // model dropdown's current (uncommitted) value
    var pendingProvider = null;        // provider dropdown's current value — RMOOZ-OPENROUTER-QWEN35-CLOUD-MODE-A
    var busy = false;

    function W() { return window; }
    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // GET the model list + current selection. Best-effort; never throws.
    // RMOOZ-OPENROUTER-QWEN35-CLOUD-MODE-A: optional providerOverride lists that provider's
    // catalog (e.g. 'openrouter') so the dropdown previews before a selection is committed.
    function fetchModels(providerOverride) {
        var w = W();
        if (!w || typeof w.fetch !== 'function') return Promise.resolve(null);
        var prov = providerOverride || pendingProvider || '';
        var url = '/api/ai/models' + (prov ? ('?provider=' + encodeURIComponent(prov)) : '');
        return w.fetch(url, { method: 'GET' })
            .then(function (r) { return r.text(); })
            .then(function (txt) {
                var parsed = null;
                try { parsed = txt ? JSON.parse(txt) : null; } catch (_) {}
                info = (parsed && typeof parsed === 'object') ? parsed : { ok: false, error: 'non_json_response' };
                if (pendingProvider == null && info && info.provider) pendingProvider = info.provider;
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
    function selectModel(model, provider) {
        var w = W();
        if (!model || busy || !w || typeof w.fetch !== 'function') return;
        busy = true;
        render();
        var reqBody = { model: model };
        if (provider) reqBody.provider = provider;   // 'ollama' | 'openrouter'
        w.fetch('/api/ai/model/select', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqBody),
        })
            .then(function (r) { return r.text().then(function (t) { return { status: r.status, ok: r.ok, text: t }; }); })
            .then(function (res) {
                busy = false;
                var parsed = null;
                try { parsed = res.text ? JSON.parse(res.text) : null; } catch (_) {}
                if (res.ok && parsed && parsed.ok) {
                    info = parsed;
                    pending = parsed.selected_model || model;
                    pendingProvider = parsed.provider || pendingProvider;
                    render();
                    // Tell the rest of the app (Free Fight card, etc.). source guards the echo.
                    try {
                        document.dispatchEvent(new CustomEvent('rmooz:ai-model-changed',
                            { detail: { model: pending, provider: pendingProvider, source: 'global_hud', model_available: !!parsed.model_available } }));
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
               : (info.provider_blocked === true) ? ' · FF blocked (' + (info.configured_provider === 'openrouter' ? 'cloud disabled' : 'remote provider') + ')'
               : '';
        var cloud = info.is_cloud ? ' · ☁ cloud' : '';
        return sel + ' · ' + avail + ' · ' + gate + ff + cloud;
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

    // RMOOZ-OPENROUTER-QWEN35-CLOUD-MODE-A: provider dropdown (Ollama / OpenRouter). OpenRouter is
    // DISABLED in the list until cloud is allowed (RMOOZ_ALLOW_CLOUD_AI=1) so it can't be picked.
    function providerOptionsHtml() {
        var cur = pendingProvider || (info && info.provider) || 'ollama';
        var cloudAllowed = !!(info && info.cloud_allowed === true);
        var orAttrs = (cur === 'openrouter' ? ' selected' : '') + (cloudAllowed ? '' : ' disabled');
        return '<option value="ollama"' + (cur !== 'openrouter' ? ' selected' : '') + '>Ollama (local)</option>' +
               '<option value="openrouter"' + orAttrs + '>OpenRouter (cloud)' + (cloudAllowed ? '' : ' — disabled') + '</option>';
    }
    // Cloud egress note — shown ONLY when the OpenRouter provider is selected.
    function cloudNoteHtml() {
        var cur = pendingProvider || (info && info.provider) || 'ollama';
        if (cur !== 'openrouter') return '';
        if (!(info && info.cloud_allowed)) {
            return '<span class="ai-model-hud-cloud" style="font-size:10px;color:#e0a93a;margin-left:6px;" title="Set RMOOZ_ALLOW_CLOUD_AI=1 and restart the server">⚠ Cloud AI disabled. Enable RMOOZ_ALLOW_CLOUD_AI=1 to use OpenRouter.</span>';
        }
        var enabled = !!(info && info.cloud_enabled);
        return '<span class="ai-model-hud-cloud" style="font-size:10px;color:' + (enabled ? '#e0a060' : '#e0a93a') + ';margin-left:6px;" title="Cloud egress — requests leave this machine">☁ Cloud provider — data leaves local machine' + (enabled ? '' : ' · set OPENROUTER_API_KEY') + '</span>';
    }

    function render() {
        if (!mountEl) return;
        var disabled = busy ? ' disabled' : '';
        mountEl.innerHTML =
            '<select id="ai-model-hud-provider" class="ai-model-hud-select" dir="ltr" aria-label="AI provider — المزود"' + disabled + '>' +
                providerOptionsHtml() +
            '</select>' +
            '<select id="ai-model-hud-select" class="ai-model-hud-select" dir="ltr" aria-label="AI model — النموذج"' + disabled + '>' +
                optionsHtml() +
            '</select>' +
            '<button type="button" data-act="refresh" class="ai-model-hud-btn" title="Refresh models — تحديث القائمة"' + disabled + '>↻</button>' +
            '<button type="button" data-act="use" class="ai-model-hud-btn ai-model-hud-btn--use" title="Use this model app-wide — استخدم هذا النموذج"' + disabled + '>' +
                (busy ? '…' : 'Use — استخدم') +
            '</button>' +
            '<span class="wargame-state-pill ai-model-hud-status ' + statusClass() + '" title="' + esc(statusTitle()) + '">' +
                esc(statusText()) +
            '</span>' +
            cloudNoteHtml();

        var provEl = mountEl.querySelector('#ai-model-hud-provider');
        var selEl = mountEl.querySelector('#ai-model-hud-select');
        if (provEl) provEl.addEventListener('change', function () {
            pendingProvider = provEl.value;
            pending = null;                 // reset the model so the new provider's list/default applies
            fetchModels(pendingProvider);   // re-list the chosen provider's catalog
        });
        if (selEl) selEl.addEventListener('change', function () { pending = selEl.value; });
        var refreshBtn = mountEl.querySelector('[data-act="refresh"]');
        if (refreshBtn) refreshBtn.addEventListener('click', function () { fetchModels(pendingProvider); });
        var useBtn = mountEl.querySelector('[data-act="use"]');
        if (useBtn) useBtn.addEventListener('click', function () {
            var val = selEl ? selEl.value : pending;
            var prov = provEl ? provEl.value : pendingProvider;
            if (val) selectModel(val, prov);
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
