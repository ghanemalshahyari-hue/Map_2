/**
 * Adjudicator client.
 *
 * Thin HTTP wrapper around /api/ai/adjudicate + /api/ai/mc/*. Window-mounted
 * as AppAdjudicator. Mirrors the style of red-team-controller.js's jsonFetch
 * (kept local; 10 lines isn't worth a shared module yet).
 *
 * SSE subscription returns a `close()` function — call it from the UI when
 * the run finishes or the user cancels.
 *
 * Public surface:
 *   window.AppAdjudicator = {
 *     scenarios()              → { ok, scenarios, default }
 *     adjudicateStep(opts)     → { ok, stepIndex, state, validation, meta }
 *     mcStart(opts)            → { ok, runId, dir }
 *     mcSubscribe(runId, onEvt)→ { close() }
 *     mcCancel(runId)          → { ok }
 *     mcAggregate(runId)       → { ok, summary }
 *   }
 */
(function () {
    'use strict';

    async function jsonFetch(path, init) {
        const res = await fetch(path, init);
        let body;
        try { body = await res.json(); }
        catch { body = { ok: false, error: `HTTP ${res.status} (non-JSON response)` }; }
        if (!res.ok && typeof body === 'object' && body) body.ok = false;
        return body;
    }

    function postJson(path, body) {
        return jsonFetch(path, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(body || {}),
        });
    }

    function scenarios() {
        return jsonFetch('/api/ai/scenarios');
    }

    function scenario(name) {
        return jsonFetch('/api/ai/scenario/' + encodeURIComponent(name));
    }

    function adjudicateStep(opts) {
        return postJson('/api/ai/adjudicate', opts);
    }

    // Provider status — returns { available: [...], defaultResolved, providers: {...} }.
    // Used by the HUD to populate the AI-provider dropdown and show health
    // dots for Ollama / Claude / Zen.
    function providerStatus() {
        return jsonFetch('/api/ai/provider/status');
    }

    // COA generator — POST /api/ai/coa. Returns { ok, plans:[...], meta }.
    // Iterative fallback on the server backfills weak-model 1-plan responses
    // to the requested 3-5 plan minimum.
    function coa(opts) {
        return postJson('/api/ai/coa', opts);
    }

    function mcStart(opts) {
        return postJson('/api/ai/mc/start', opts);
    }

    function mcCancel(runId) {
        return postJson('/api/ai/mc/' + encodeURIComponent(runId) + '/cancel', {});
    }

    function mcAggregate(runId) {
        return jsonFetch('/api/ai/mc/' + encodeURIComponent(runId) + '/aggregate');
    }

    function mcSubscribe(runId, onEvt) {
        const url = '/api/ai/mc/' + encodeURIComponent(runId) + '/events';
        const src = new EventSource(url);
        const handler = (evt) => {
            try { onEvt(evt.type, JSON.parse(evt.data)); }
            catch (e) { onEvt('parse-error', { msg: e.message, raw: evt.data }); }
        };
        ['open', 'progress', 'trial-done', 'done', 'error'].forEach(name => {
            src.addEventListener(name, handler);
        });
        src.onerror = () => { onEvt('error', { msg: 'SSE connection lost' }); };
        return { close: () => src.close() };
    }

    let mcRunning = false;
    function setMcRunning(v) { mcRunning = !!v; }
    function isMcRunning() { return mcRunning; }

    window.AppAdjudicator = {
        scenarios,
        scenario,
        adjudicateStep,
        providerStatus,
        coa,
        mcStart,
        mcSubscribe,
        mcCancel,
        mcAggregate,
        setMcRunning,
        isMcRunning,
    };
})();
