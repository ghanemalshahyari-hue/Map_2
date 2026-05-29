/**
 * Operational shell — AI Proposal Bridge to /api/sim/propose.
 *
 * PR-10. The first network-level integration in this stack. Sends a
 * tightly-controlled safe context to the server's existing
 * `/api/sim/propose` endpoint, validates the response through the
 * PR-8 contract, and hands the result to the PR-9 inbox.
 *
 * Strict invariants:
 *   1. NEVER calls /api/sim/commit. No commit code path exists in
 *      this module — search for the string and you will not find it.
 *   2. NEVER auto-accepts a proposal. The PR-7 visual buttons remain
 *      the only path to a recorded decision.
 *   3. NEVER posts full unit objects, full scenario state, DOM nodes,
 *      or closures. The outbound body is a strict whitelist (see
 *      buildSafeContext) — additional fields cannot leak.
 *   4. NEVER mutates `window.units`, `window.map`, `window.lines`, or
 *      any scenario-state structure. The response is funneled through
 *      PR-8's normalizer, which strips everything except 11 schema
 *      fields with primitive metadata.
 *   5. Sends `mockMode: true` so the server skips its live AI provider
 *      (Ollama / Anthropic). The propose endpoint is documented as
 *      read-only on the server side; combined with mockMode, no
 *      external AI call is made.
 *
 * Bridge: window.AppShellAIProposalBridge
 *   requestProposal(context = {})   – kick off the request
 *   getState()                      – { loading, lastError, lastSuccessAt, lastFailureAt }
 */
(function () {
    'use strict';

    const ENDPOINT = '/api/sim/propose';

    // PR-10 hardening, PR-11: `serviceEnabled` lives inside the state
    // object so the existing `rmooz:ai-proposal-bridge-state` event
    // carries it to any subscriber (the PR-11 service-status pill).
    // Default is FALSE — the bridge is wired and ready, but it does
    // NOT touch the backend until something explicitly opts in via
    // `setServiceEnabled(true)`. Reason: even calling the existing
    // /api/sim/propose endpoint pulls in scenario-loader and the
    // proposalStore on the server side. The flag is in-memory only;
    // it is NEVER written to localStorage so a reload reverts to off.
    let state = {
        loading:         false,
        lastError:       null,
        lastSuccessAt:   null,
        lastFailureAt:   null,
        serviceEnabled:  false,
    };

    // ── Helpers ────────────────────────────────────────────────────
    function setState(patch) {
        state = Object.assign({}, state, patch);
        try {
            document.dispatchEvent(new CustomEvent('rmooz:ai-proposal-bridge-state', { detail: Object.assign({}, state) }));
        } catch (_) { /* never throw */ }
    }

    function getEventLog() { return window.AppShellEventLog; }
    function getContract() { return window.AppShellAIProposalContract; }
    function getInbox()    { return window.AppShellAIProposalInbox; }

    function logRow(severity, messageKey, fallback, payload) {
        const log = getEventLog();
        if (!log || typeof log.append !== 'function') return;
        try {
            log.append({
                severity,
                category:    'UI',                                  // closed-set; never AI/SIM/SCENARIO
                source:      'ai-proposal-bridge',
                messageKey,
                message:     fallback,
                payload:     (payload && typeof payload === 'object') ? payload : undefined,
            });
        } catch (_) { /* never throw */ }
    }

    // ── Safe context builder ──────────────────────────────────────
    // STRICT WHITELIST. Anything not enumerated here is not sent.
    function buildSafeContext(overrides) {
        // Optional caller context — accepted only as primitives.
        const o = (overrides && typeof overrides === 'object') ? overrides : {};

        // Selected unit identity, if any. Pull from the PR-3 unit-panel
        // bridge; fall back gracefully if the panel hasn't loaded a
        // unit yet. We deliberately do NOT read window.units / map /
        // scenario directly — that risks accidentally surfacing more
        // than the operator's current selection.
        let selUnit = null;
        try {
            if (window.AppShellUnitPanel && typeof window.AppShellUnitPanel.getCurrentUnit === 'function') {
                selUnit = window.AppShellUnitPanel.getCurrentUnit();
            }
        } catch (_) {}

        let side = null;
        try {
            if (window.AppShellSidePicker && typeof window.AppShellSidePicker.getSide === 'function') {
                side = window.AppShellSidePicker.getSide();
            }
        } catch (_) {}

        const scenarioName = (typeof window.scenarioName === 'string' && window.scenarioName) || null;

        return {
            // Identifiers only — no full unit, no map, no DOM, no closures.
            selectedUnitId:   selUnit && selUnit.id   ? String(selUnit.id).slice(0, 80)   : null,
            selectedUnitName: selUnit && selUnit.name ? String(selUnit.name).slice(0, 80) : null,
            selectedUnitSide: selUnit && selUnit.side ? String(selUnit.side).slice(0, 32) : null,
            side:             side ? String(side).slice(0, 16) : null,
            scenarioName:     scenarioName ? String(scenarioName).slice(0, 120) : null,
            // Server-required fields with safe defaults
            stepIndex:        Number.isInteger(o.stepIndex) ? o.stepIndex : 0,
            trialId:          (typeof o.trialId === 'string' && o.trialId) ? o.trialId.slice(0, 80) : 'manual-pr10',
            // The flag that matters most: keep the server off the live AI path.
            mockMode:         true,
        };
    }

    // ── Adapter: server shape → PR-8 contract shape ───────────────
    // The server's `/api/sim/propose` returns a richer object than
    // our frontend contract. We map only the fields the panel needs;
    // everything else is dropped at this layer (defense in depth).
    function adaptServerProposal(server) {
        if (!server || typeof server !== 'object') return null;

        const actions = Array.isArray(server.proposed_actions) ? server.proposed_actions : [];
        const firstAction = actions[0] || null;

        // Pull a single confidence score (action-level, since the server
        // attaches confidence per action). null if not a finite number.
        let confidence = null;
        if (firstAction && typeof firstAction.confidence === 'number' && Number.isFinite(firstAction.confidence)) {
            confidence = Math.max(0, Math.min(1, firstAction.confidence));
        }

        // Build affectedUnits from action unit_ids (strings only).
        const affectedUnits = [];
        for (const a of actions) {
            if (a && typeof a.unit_id === 'string' && a.unit_id.trim()) {
                affectedUnits.push(a.unit_id.trim());
                if (affectedUnits.length >= 50) break;
            }
        }

        // Summary preference: EN narrative > AR narrative > top-level rationale > "(no summary)"
        const summary = String(
            server.narrative_en
            || server.narrative_ar
            || server.rationale
            || firstAction?.rationale
            || '(no summary)'
        ).trim() || '(no summary)';

        // Expected effect: action count + first action's rationale snippet.
        const expectedEffect = actions.length
            ? `${actions.length} proposed action(s): ` + (firstAction.rationale ? String(firstAction.rationale).slice(0, 200) : 'no details').trim()
            : 'No proposed actions';

        const validation = server.projected_validation || {};
        const mocked = !!(validation && validation.mocked);

        // STRICT: required fields are passed through as-is when the
        // server provided them, otherwise left as missing/empty so the
        // PR-8 contract rejects the response. We do NOT fabricate
        // proposal_id or source — a malformed response from the server
        // is supposed to fail validation, not get patched into life.
        const id     = (typeof server.proposal_id === 'string' && server.proposal_id.trim()) ? server.proposal_id.trim().slice(0, 80) : '';
        const source = (typeof server.source      === 'string' && server.source.trim())      ? server.source.trim().slice(0, 80)      : '';

        return {
            id,
            source,
            createdAt:      undefined,                                                  // contract auto-fills if missing
            confidence,
            summary:        summary.slice(0, 500),
            affectedUnits,
            expectedEffect: expectedEffect.slice(0, 500),
            risk:           'UNKNOWN',                                                  // server doesn't currently expose a risk tier
            status:         'PENDING',
            isSample:       mocked,                                                     // mockMode/baseline → mark as sample so the UI shows the NOT CONNECTED badge
            metadata:       {                                                            // shallow primitives only — contract drops anything else
                runId:        (typeof server.run_id === 'string') ? server.run_id.slice(0, 80) : null,
                stepIndex:    (Number.isInteger(server.step_index)) ? server.step_index : null,
                mockedByServer: mocked,
                actionCount:  actions.length,
            },
        };
    }

    // ── Request flow ──────────────────────────────────────────────
    async function requestProposal(context) {
        if (state.loading) {
            // Prevent overlapping requests. Returning null keeps the
            // call-site contract simple — no race.
            return null;
        }

        // PR-10 hardening: when the service is not opted-in, log an
        // honest "not yet connected" warning instead of fetching. The
        // bridge contract is unchanged from the caller's perspective —
        // it still returns null on the no-go path, leaving the active
        // proposal and inbox untouched. No outbound network traffic.
        //
        // PR-11 note: we do NOT touch `lastFailureAt` here. The
        // service-status pill derives "Failed" from a real request
        // failure (network error / contract rejection of a server
        // response); a click while disabled isn't a request that
        // failed — no request was even sent. Stamping lastFailureAt
        // would make the pill jump to Failed the moment the operator
        // clicks Enable, even though nothing has actually failed.
        if (!state.serviceEnabled) {
            logRow('WARNING', 'elog-evt-ap-service-not-connected', 'Proposal service not yet connected', {
                hint: 'call AppShellAIProposalBridge.setServiceEnabled(true) to opt in',
            });
            setState({ loading: false, lastError: 'service not yet connected' });
            return null;
        }

        setState({ loading: true, lastError: null });

        const body = buildSafeContext(context);
        logRow('NOTICE', 'elog-evt-ap-request-sent', 'Proposal request sent', { side: body.side, scenarioName: body.scenarioName });

        let serverPayload = null;
        let httpStatus = 0;
        try {
            const resp = await fetch(ENDPOINT, {
                method:      'POST',
                credentials: 'include',
                headers:     { 'Content-Type': 'application/json' },
                body:        JSON.stringify(body),
            });
            httpStatus = resp.status;
            if (!resp.ok) {
                throw new Error('HTTP ' + resp.status);
            }
            serverPayload = await resp.json();
        } catch (e) {
            logRow('WARNING', 'elog-evt-ap-request-failed', 'Proposal request failed', {
                status: httpStatus || 0,
                error:  String((e && e.message) || e).slice(0, 200),
            });
            setState({ loading: false, lastError: String((e && e.message) || e).slice(0, 200), lastFailureAt: Date.now() });
            return null;
        }

        // Adapt + validate. The contract is the final integrity gate
        // before anything reaches the panel.
        const adapted = adaptServerProposal(serverPayload);
        const C = getContract();
        if (!C || typeof C.validateProposal !== 'function') {
            logRow('WARNING', 'elog-evt-ap-request-failed', 'Proposal request failed', { reason: 'contract module missing' });
            setState({ loading: false, lastError: 'contract module missing', lastFailureAt: Date.now() });
            return null;
        }
        const result = C.validateProposal(adapted);
        if (!result.valid) {
            logRow('WARNING', 'elog-evt-ap-request-rejected', 'Proposal response rejected by contract', {
                errorCount: result.errors.length,
                firstError: result.errors[0] ? String(result.errors[0]).slice(0, 120) : null,
            });
            setState({ loading: false, lastError: 'contract validation failed', lastFailureAt: Date.now() });
            return null;
        }

        // Hand off to the PR-9 inbox. The inbox will re-validate
        // (idempotent) + store + push to the PR-7 panel + log its own
        // "Proposal received in inbox" row.
        const inbox = getInbox();
        if (inbox && typeof inbox.addProposal === 'function') {
            try { inbox.addProposal(result.normalized); } catch (_) { /* inbox guards itself */ }
        }
        logRow('NOTICE', 'elog-evt-ap-request-accepted', 'Proposal response accepted into inbox', {
            proposalId: result.normalized.id,
        });
        setState({ loading: false, lastSuccessAt: Date.now() });
        return result.normalized;
    }

    function getState() {
        return Object.assign({}, state);
    }

    // PR-10 hardening, PR-11: explicit opt-in to backend connection.
    // Routes through setState() so the existing
    // `rmooz:ai-proposal-bridge-state` event fires — the PR-11 service
    // status pill listens for that. Default is OFF so the bridge ships
    // in "wired but inert" mode. NEVER persists (no localStorage); a
    // reload reverts to off.
    function setServiceEnabled(on) {
        const next = !!on;
        if (state.serviceEnabled !== next) {
            setState({ serviceEnabled: next });
        }
        return next;
    }

    window.AppShellAIProposalBridge = {
        requestProposal,
        getState,
        setServiceEnabled,
        // Exposed for tests/inspectors only.
        _internal: { buildSafeContext, adaptServerProposal },
    };
})();
