/**
 * Operational shell — AI Proposal Review.
 *
 * PR-7 (AI / Simulation Boundary UI). Establishes the command
 * principle in the UI: AI proposes · Operator decides · System
 * records. This module renders the right-side review section, owns
 * the local decision state, and exposes a tiny bridge for future
 * proposers to call `setProposal()`.
 *
 * Strict invariants (read carefully before extending this file):
 *   1. The Accept / Reject / Hold buttons NEVER mutate scenario
 *      state, NEVER call simulation, AI, or any backend API, and
 *      NEVER write a journal file. They flip local CSS state and
 *      append exactly one OPERATOR/NOTICE row to the PR-6 Event Log.
 *   2. The bridge exposes ONLY setters into this panel's local
 *      state (setProposal, clearProposal, setSampleProposal,
 *      getState). It does NOT expose accept()/reject()/hold() to
 *      external callers — those actions belong to the operator at
 *      the UI, not to a programmatic proposer.
 *   3. Default state is "no active proposal". A sample proposal is
 *      available via setSampleProposal() but is never auto-loaded;
 *      when loaded, the header carries a "SAMPLE / NOT CONNECTED"
 *      badge so it cannot be confused with a real recommendation.
 *   4. No combat/detection/engagement/casualty content is rendered.
 *      The sample uses generic strings only.
 *
 * Bridge: window.AppShellAIProposal
 */
(function () {
    'use strict';

    // ── Statuses (closed set) ──────────────────────────────────────
    const STATUS = {
        EMPTY:    'empty',
        PENDING:  'pending',
        ACCEPTED: 'accepted',
        REJECTED: 'rejected',
        ONHOLD:   'onhold',
    };
    const STATUS_I18N_KEY = {
        empty:    'ap-empty',
        pending:  'ap-status-pending',
        accepted: 'ap-status-accepted',
        rejected: 'ap-status-rejected',
        onhold:   'ap-status-onhold',
    };
    const STATUS_FALLBACK = {
        empty:    'No active proposal',
        pending:  'Pending',
        accepted: 'Accepted',
        rejected: 'Rejected',
        onhold:   'On Hold',
    };

    // ── Helpers ────────────────────────────────────────────────────
    const $ = (id) => document.getElementById(id);

    function tr(key, fallback, args) {
        // PR-9: optional `args` array — forwarded as variadic params to
        // window.t for `{0}` substitution (e.g. inbox-count cell). When
        // args is missing the call is identical to PR-7 behavior.
        if (typeof window.t === 'function' && key) {
            const v = (args && args.length)
                ? window.t(key, ...args)
                : window.t(key);
            if (typeof v === 'string' && v && v !== key) return v;
        }
        // Fallback substitution so the UI still reads correctly when
        // an i18n key is missing (e.g. during early boot).
        if (args && args.length && typeof fallback === 'string') {
            let s = fallback;
            for (let i = 0; i < args.length; i++) s = s.replace('{' + i + '}', String(args[i]));
            return s;
        }
        return fallback;
    }

    function setHidden(el, hidden) {
        if (!el) return;
        if (hidden) el.setAttribute('hidden', '');
        else        el.removeAttribute('hidden');
    }

    // ── Local state ────────────────────────────────────────────────
    // PR-7 invariant: this is the ONLY mutable state in this module.
    // It is never read by any sim/AI/scenario code in the project.
    let proposal = null;     // null = empty state
    let status   = STATUS.EMPTY;
    let isSample = false;

    // ── Render ─────────────────────────────────────────────────────
    function setStatusPill(s) {
        status = s;
        const pill = $('ap-status-pill');
        const txt  = $('ap-status-text');
        if (pill) pill.setAttribute('data-state', s);
        if (txt)  txt.textContent = tr(STATUS_I18N_KEY[s], STATUS_FALLBACK[s]);

        // Mirror in the decision cell — same i18n key for consistency.
        const dec = $('ap-decision-text');
        if (dec) {
            // The decision cell shows "Pending" when a proposal is loaded
            // but no decision has been made; once decided, it shows the
            // chosen status.
            const decKey = (s === STATUS.EMPTY) ? STATUS_I18N_KEY[STATUS.PENDING] : STATUS_I18N_KEY[s];
            const decFb  = (s === STATUS.EMPTY) ? STATUS_FALLBACK[STATUS.PENDING] : STATUS_FALLBACK[s];
            dec.textContent = tr(decKey, decFb);
            dec.setAttribute('data-i18n', decKey);   // keep i18n.applyLanguage in sync
        }
    }

    function setButtonActive(decision) {
        // decision ∈ { 'accept', 'reject', 'hold' } or null (no decision yet)
        const map = { accept: 'ap-accept', reject: 'ap-reject', hold: 'ap-hold' };
        for (const k of Object.keys(map)) {
            const b = $(map[k]);
            if (!b) continue;
            const on = (k === decision);
            b.classList.toggle('is-active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
    }

    function setButtonsDisabled(disabled) {
        ['ap-accept', 'ap-reject', 'ap-hold'].forEach(id => {
            const b = $(id);
            if (b) b.disabled = !!disabled;
        });
    }

    function renderEmpty() {
        proposal = null;
        isSample = false;
        setHidden($('ap-fields'),   true);
        setHidden($('ap-actions'),  true);
        setHidden($('ap-sample-badge'), true);
        setButtonActive(null);
        setButtonsDisabled(true);
        setStatusPill(STATUS.EMPTY);
    }

    // PR-8: localized risk label. Risk is one of the closed-set
    // contract enums (LOW / MEDIUM / HIGH / UNKNOWN); the label is
    // resolved through i18n at render time so a language switch
    // re-localizes correctly.
    const RISK_I18N_KEY = {
        LOW:     'ap-risk-low',
        MEDIUM:  'ap-risk-medium',
        HIGH:    'ap-risk-high',
        UNKNOWN: 'ap-risk-unknown',
    };
    const RISK_FALLBACK = {
        LOW:     'Low',
        MEDIUM:  'Medium',
        HIGH:    'High',
        UNKNOWN: 'Unknown',
    };
    function riskLabel(risk) {
        const r = (risk && RISK_I18N_KEY[risk]) ? risk : 'UNKNOWN';
        return tr(RISK_I18N_KEY[r], RISK_FALLBACK[r]);
    }
    function formatConfidence(c) {
        // Contract guarantees c is null or a finite number in [0, 1].
        // Display as percent. `—` for null so the field is never blank.
        if (typeof c !== 'number' || !Number.isFinite(c)) return '—';
        return Math.round(c * 100) + '%';
    }

    function renderProposal(p) {
        // Defensive — we only render primitive fields, never structured
        // payloads. No DOM is built from user-provided HTML. By the time
        // we reach this function, `p` has already been normalized by the
        // PR-8 contract, so every field is in its canonical shape.
        proposal = p;
        isSample = !!p.isSample;

        const set = (id, v) => { const el = $(id); if (el) el.textContent = (v == null || v === '') ? '—' : String(v); };
        set('ap-id',         p.id);
        set('ap-source',     p.source);
        set('ap-confidence', formatConfidence(p.confidence));
        set('ap-summary',    p.summary);
        set('ap-affected',   (Array.isArray(p.affectedUnits) && p.affectedUnits.length) ? p.affectedUnits.join(', ') : '—');
        set('ap-effect',     p.expectedEffect);
        // Risk cell gets a data-attr too so a language switch can
        // re-resolve the localized label without re-running the whole
        // renderer. See rerenderFields().
        const riskEl = $('ap-risk');
        if (riskEl) {
            riskEl.setAttribute('data-risk', p.risk || 'UNKNOWN');
            riskEl.textContent = riskLabel(p.risk);
        }

        setHidden($('ap-fields'),   false);
        setHidden($('ap-actions'),  false);
        setHidden($('ap-sample-badge'), !isSample);
        setButtonActive(null);
        setButtonsDisabled(false);
        setStatusPill(STATUS.PENDING);
    }

    // Re-resolve dynamic localized cells (risk) on language change.
    // Static labels (field titles, button text, safety note) are
    // handled by i18n.applyLanguage's data-i18n DOM scan.
    function rerenderFields() {
        const riskEl = $('ap-risk');
        if (riskEl && proposal) {
            riskEl.textContent = riskLabel(riskEl.getAttribute('data-risk') || proposal.risk);
        }
    }

    // ── Public bridge methods ──────────────────────────────────────
    function setProposal(input) {
        // PR-8: every external proposal goes through the contract.
        // Invalid input is rejected — the panel keeps whatever it
        // currently shows (empty stays empty, a loaded proposal is NOT
        // clobbered) and a single UI/WARNING row is appended to the
        // PR-6 Event Log so the operator sees the rejection.
        if (!window.AppShellAIProposalContract || typeof window.AppShellAIProposalContract.normalizeProposal !== 'function') {
            // Defensive fallback only used if the contract module
            // fails to load. We do NOT render the raw input — keep
            // the current state instead.
            try { console.warn('[ai-proposal-panel] contract module missing'); } catch (_) {}
            return null;
        }
        const result = window.AppShellAIProposalContract.validateProposal(input);
        if (!result.valid) {
            logRejection(result.errors);
            return null;
        }
        renderProposal(result.normalized);
        return result.normalized;
    }

    function logRejection(errors) {
        try {
            if (window.AppShellEventLog && typeof window.AppShellEventLog.append === 'function') {
                window.AppShellEventLog.append({
                    severity:   'WARNING',
                    category:   'UI',
                    source:     'ai-proposal-contract',
                    messageKey: 'elog-evt-ap-rejected-by-contract',
                    message:    'Proposal rejected by contract',
                    // Errors are kept as a single primitive string so the
                    // PR-6 safePayload copy preserves it. Capped to avoid
                    // ballooning the row.
                    payload: {
                        errorCount: Array.isArray(errors) ? errors.length : 0,
                        firstError: (Array.isArray(errors) && errors.length) ? String(errors[0]).slice(0, 120) : null,
                    },
                });
            }
        } catch (_) { /* never throw out of the bridge */ }
    }

    function clearProposal() {
        renderEmpty();
    }

    function setSampleProposal() {
        // Delegated to the contract factory so the sample stays in
        // sync with the schema. Every dynamic field is tagged
        // "(sample, not connected)" inside the contract module — no
        // combat/detection wording. Goes through the same renderer
        // as a real (validated) proposal.
        if (!window.AppShellAIProposalContract || typeof window.AppShellAIProposalContract.createSampleProposal !== 'function') {
            return null;
        }
        const sample = window.AppShellAIProposalContract.createSampleProposal();
        renderProposal(sample);
        return sample;
    }

    function getState() {
        // Return a copy — never the live state object.
        return {
            hasProposal: proposal != null,
            status,
            isSample,
            proposalId: proposal ? proposal.id : null,
        };
    }

    // ── Operator decision (UI-only) ────────────────────────────────
    function recordDecision(decision) {
        // The button is only enabled when a proposal exists; this
        // guard is defensive against programmatic clicks.
        if (!proposal) return;
        const STATE_BY_DECISION = {
            accept: STATUS.ACCEPTED,
            reject: STATUS.REJECTED,
            hold:   STATUS.ONHOLD,
        };
        const next = STATE_BY_DECISION[decision];
        if (!next) return;

        // Lock further decisions on this proposal — operator can clear
        // and a new proposal loads via setProposal().
        setStatusPill(next);
        setButtonActive(decision);
        setButtonsDisabled(true);

        // Log a single OPERATOR/NOTICE row to PR-6's Event Log.
        // Category is OPERATOR (the act is the operator's), source
        // identifies this panel. No SIM/SCENARIO/AI events emitted.
        try {
            if (window.AppShellEventLog && typeof window.AppShellEventLog.append === 'function') {
                window.AppShellEventLog.append({
                    severity:   'NOTICE',
                    category:   'OPERATOR',
                    source:     'ai-proposal-panel',
                    messageKey: 'elog-evt-ap-decision',
                    message:    'Proposal decision recorded locally only',
                    // payload is shallow + primitives-only via PR-6's
                    // safePayload (defensive copy). Never persisted.
                    payload: {
                        decision,                   // 'accept' | 'reject' | 'hold'
                        proposalId: proposal.id || null,
                        sample:     !!isSample,
                    },
                });
            }
        } catch (_) { /* never throw out of a click handler */ }

        // PR-12: route the decision through the dry-run commit bridge.
        // Bridge is surface-only — it validates + logs a UI/NOTICE row
        // but does NOT call /api/sim/commit. Result is discarded; the
        // panel's visual state (buttons locked, status pill set) was
        // already established above and is independent of the bridge.
        // Lazy lookup so the panel keeps working if the bridge module
        // failed to load for any reason.
        try {
            if (window.AppShellAIProposalCommitBridge && typeof window.AppShellAIProposalCommitBridge.commitDecision === 'function') {
                const UPPER = { accept: 'ACCEPT', reject: 'REJECT', hold: 'HOLD' }[decision];
                window.AppShellAIProposalCommitBridge.commitDecision(UPPER, proposal);
            }
        } catch (_) { /* never throw out of a click handler */ }
    }

    // ── Wiring ─────────────────────────────────────────────────────
    function bindButtons() {
        $('ap-accept')?.addEventListener('click', () => recordDecision('accept'));
        $('ap-reject')?.addEventListener('click', () => recordDecision('reject'));
        $('ap-hold')?.addEventListener('click',   () => recordDecision('hold'));
    }

    function bindLanguageChain() {
        // Re-render dynamic text on language switch. The i18n.applyLanguage
        // scan already updates all data-i18n nodes (title, field labels,
        // button labels, safety note). We refresh the status pill, the
        // decision cell, the PR-8 risk label, and the PR-9 inbox count.
        const prev = window.onLanguageChange;
        window.onLanguageChange = function (lang) {
            try { setStatusPill(status); }   catch (_) { /* don't break chain */ }
            try { rerenderFields(); }        catch (_) { /* don't break chain */ }
            try { renderInboxCount(); }      catch (_) { /* don't break chain */ }
            try { renderServicePill(); }     catch (_) { /* don't break chain */ }    // PR-11
            if (typeof prev === 'function') {
                try { prev(lang); } catch (_) { /* don't break other listeners */ }
            }
        };
    }

    // ── PR-9: inbox count cell ─────────────────────────────────────
    // The inbox owns its state; the panel only displays the count.
    // Subscribes to `rmooz:ai-proposal-inbox-changed` (UI-only event)
    // and re-renders on language change. Reads the live count from
    // the inbox bridge so a missed event doesn't desync the display.
    function inboxCount() {
        try {
            if (window.AppShellAIProposalInbox && typeof window.AppShellAIProposalInbox.listProposals === 'function') {
                return window.AppShellAIProposalInbox.listProposals().length;
            }
        } catch (_) { /* ignore */ }
        return 0;
    }
    function renderInboxCount() {
        const el = $('ap-inbox-count');
        if (!el) return;
        const n = inboxCount();
        // i18n key carries the `{0}` placeholder; pass the count as the
        // substitution argument. Fallback string mirrors the brief.
        el.textContent = tr('ap-inbox-count', `Inbox: ${n} proposals`, [String(n)]);
    }
    function bindInboxListener() {
        document.addEventListener('rmooz:ai-proposal-inbox-changed', () => {
            try { renderInboxCount(); } catch (_) { /* never throw */ }
        });
    }

    // ── PR-11: Proposal service status pill + Enable/Disable toggle ──
    // The pill reflects bridge.getState(); the toggle calls
    // setServiceEnabled(). Default state is "not-connected" and NEVER
    // persists (no localStorage write here, none in the bridge). A
    // reload reverts the bridge to off.
    const SERVICE_STATE_I18N = {
        'not-connected': 'ap-service-not-connected',
        'connected':     'ap-service-connected',
        'requesting':    'ap-service-requesting',
        'failed':        'ap-service-failed',
    };
    const SERVICE_STATE_FALLBACK = {
        'not-connected': 'Not connected',
        'connected':     'Connected',
        'requesting':    'Requesting',
        'failed':        'Failed',
    };
    function deriveServiceState(s) {
        if (!s || !s.serviceEnabled) return 'not-connected';
        if (s.loading)               return 'requesting';
        if ((s.lastFailureAt || 0) > (s.lastSuccessAt || 0)) return 'failed';
        return 'connected';
    }
    function readBridgeState() {
        try {
            if (window.AppShellAIProposalBridge && typeof window.AppShellAIProposalBridge.getState === 'function') {
                return window.AppShellAIProposalBridge.getState();
            }
        } catch (_) { /* ignore */ }
        return null;
    }
    function renderServicePill() {
        const pill = $('ap-service-status');
        const toggle = $('ap-service-toggle');
        const s = readBridgeState();
        const derived = deriveServiceState(s);
        if (pill) {
            pill.setAttribute('data-state', derived);
            pill.textContent = tr(SERVICE_STATE_I18N[derived], SERVICE_STATE_FALLBACK[derived]);
        }
        if (toggle) {
            const enabled = !!(s && s.serviceEnabled);
            // Flip label between Enable / Disable and add a class so
            // the CSS can color the disable variant differently.
            toggle.setAttribute('data-i18n', enabled ? 'ap-service-disable' : 'ap-service-enable');
            toggle.textContent = enabled ? tr('ap-service-disable', 'Disable service') : tr('ap-service-enable', 'Enable service');
            toggle.classList.toggle('is-enabled', enabled);
        }
    }
    function bindServiceListener() {
        document.addEventListener('rmooz:ai-proposal-bridge-state', () => {
            try { renderServicePill(); } catch (_) { /* never throw */ }
        });
    }
    function bindServiceToggle() {
        const btn = $('ap-service-toggle');
        if (!btn) return;
        btn.addEventListener('click', () => {
            if (!window.AppShellAIProposalBridge || typeof window.AppShellAIProposalBridge.setServiceEnabled !== 'function') return;
            const before = readBridgeState();
            const next = !(before && before.serviceEnabled);
            window.AppShellAIProposalBridge.setServiceEnabled(next);
            // Log a single UI/NOTICE row through PR-6's Event Log.
            // Closed-set category (UI). No persistence, no commit,
            // no scenario mutation — only the in-memory flag flipped.
            try {
                if (window.AppShellEventLog && typeof window.AppShellEventLog.append === 'function') {
                    window.AppShellEventLog.append({
                        severity:   'NOTICE',
                        category:   'UI',
                        source:     'ai-proposal-panel',
                        messageKey: next ? 'elog-evt-ap-service-enabled' : 'elog-evt-ap-service-disabled',
                        message:    next ? 'Proposal service enabled locally' : 'Proposal service disabled locally',
                    });
                }
            } catch (_) { /* never throw */ }
        });
    }

    // ── PR-10: Request Proposal button (local loading state only) ──
    function setRequestingState(loading) {
        const btn = $('ap-request-btn');
        if (!btn) return;
        btn.disabled = !!loading;
        btn.classList.toggle('is-loading', !!loading);
        // Swap visible label between data-i18n target and a loading
        // string; restore the data-i18n key on completion so a future
        // language switch still finds it.
        if (loading) {
            btn.setAttribute('data-i18n', 'ap-requesting');
            btn.textContent = tr('ap-requesting', 'Requesting…');
        } else {
            btn.setAttribute('data-i18n', 'ap-request');
            btn.textContent = tr('ap-request', 'Request Proposal');
        }
    }
    function bindRequestButton() {
        const btn = $('ap-request-btn');
        if (!btn) return;
        btn.addEventListener('click', async () => {
            if (!window.AppShellAIProposalBridge || typeof window.AppShellAIProposalBridge.requestProposal !== 'function') {
                // Bridge module missing — visually note it without
                // breaking the rest of the app.
                try { console.warn('[ai-proposal-panel] bridge missing'); } catch (_) {}
                return;
            }
            setRequestingState(true);
            try {
                await window.AppShellAIProposalBridge.requestProposal({});
            } catch (_) { /* bridge guards its own throws */ }
            finally   { setRequestingState(false); }
        });
    }

    // PR-116: Sample proposal loader. Calls the existing setSampleProposal()
    // path — in-memory only, no backend call, no /api/sim/propose, no
    // /api/sim/commit, no scenario mutation. The panel's own renderProposal()
    // handles showing #ap-sample-badge ("SAMPLE / NOT CONNECTED") whenever
    // isSample:true. Event Log category: UI (closed-set invariant).
    function bindLoadSampleButton() {
        const btn = $('ap-load-sample-btn');
        if (!btn) return;
        btn.addEventListener('click', () => {
            try {
                setSampleProposal();
            } catch (_) { /* setSampleProposal guards its own throws */ }
            try {
                if (window.AppShellEventLog && typeof window.AppShellEventLog.append === 'function') {
                    window.AppShellEventLog.append({
                        severity:   'NOTICE',
                        category:   'UI',
                        source:     'ai-proposal-panel',
                        messageKey: 'elog-evt-ap-sample-loaded',
                        message:    'Sample proposal loaded (offline, no backend)',
                    });
                }
            } catch (_) { /* never throw out of a click handler */ }
        });
    }

    function init() {
        if (!$('ai-proposal-section')) return;
        bindButtons();
        bindLanguageChain();
        bindInboxListener();
        bindRequestButton();      // PR-10
        bindServiceListener();    // PR-11 — bridge state events
        bindServiceToggle();      // PR-11 — Enable/Disable button
        bindLoadSampleButton();   // PR-116 — offline sample proposal loader
        renderEmpty();
        renderInboxCount();       // initial paint — covers the case where
                                  // the inbox already published a count via
                                  // its boot-time microtask before we
                                  // attached the listener.
        renderServicePill();      // PR-11 — initial pill state (Not connected)
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    window.AppShellAIProposal = {
        setProposal,
        clearProposal,
        setSampleProposal,
        getState,
        STATUS: Object.assign({}, STATUS),
        // Deliberately NOT exposed: accept(), reject(), hold(). Those
        // belong to the operator's click — exposing them would let an
        // external module bypass the visual confirmation.
    };
})();
