/**
 * Operational shell — AI Proposal Inbox (frontend-only, in-memory).
 *
 * PR-9. A safe local store that mediates between any future proposal
 * source (sim module, journal replay, manual injection during dev) and
 * the PR-7 AI Proposal Review panel. The contract layer (PR-8) is the
 * input gate: nothing reaches the panel without passing
 * `AppShellAIProposalContract.validateProposal()` first.
 *
 * Strict invariants:
 *   1. PURE in-memory store — no localStorage, no IndexedDB, no fetch,
 *      no XHR, no journal file write. State lives only in the closure
 *      below and dies when the page reloads.
 *   2. The bridge exposes ONLY producers and readers:
 *          addProposal, listProposals, getActiveProposal, clearInbox
 *      It does NOT expose accept / reject / hold or any mutation
 *      setter. Operator decisions remain at the PR-7 panel button.
 *   3. No simulation events dispatched. The single broadcast event
 *      `rmooz:ai-proposal-inbox-changed` is explicitly a UI-state
 *      signal (count for the inbox-count display) — same posture as
 *      PR-5's `rmooz:timeline-ui-action`.
 *   4. Event Log writes use only PR-6's safe `UI` category. The
 *      closed-set gate in event-log.js will reject anything else.
 *
 * Bridge: window.AppShellAIProposalInbox
 *   addProposal(input)      – validate via contract, store, push to panel
 *   listProposals()         – defensive-copy list, newest first
 *   getActiveProposal()     – defensive copy of the current head, or null
 *   clearInbox()            – wipe memory + reset panel to empty
 *   MAX_SIZE                – 50 (oldest drops at the tail when capped)
 */
(function () {
    'use strict';

    const MAX_SIZE = 50;

    // ── Local state — the ONLY mutable surface in this module ─────
    // `proposals` is newest-first; index 0 is the active proposal.
    let proposals = [];

    // ── Dependency lookups (deferred so load order is forgiving) ──
    const getContract = () => window.AppShellAIProposalContract;
    const getPanel    = () => window.AppShellAIProposal;
    const getEventLog = () => window.AppShellEventLog;

    // ── Defensive copy helpers ────────────────────────────────────
    function defensiveCopy(p) {
        // Per PR-8 contract, a normalized proposal has only schema
        // fields with primitive values + metadata (shallow primitives)
        // + affectedUnits (string[]). A shallow Object.assign plus
        // copies of the two collection fields is sufficient — there
        // are no nested object references inside a normalized proposal.
        if (!p) return null;
        return Object.assign({}, p, {
            affectedUnits: Array.isArray(p.affectedUnits) ? p.affectedUnits.slice() : [],
            metadata:      (p.metadata && typeof p.metadata === 'object') ? Object.assign({}, p.metadata) : {},
        });
    }

    // ── Event Log logging ─────────────────────────────────────────
    function logReceived(proposalId) {
        const log = getEventLog();
        if (!log || typeof log.append !== 'function') return;
        try {
            log.append({
                severity:    'NOTICE',
                category:    'UI',                              // closed-set; never AI/SIM/SCENARIO
                source:      'ai-proposal-inbox',
                messageKey:  'elog-evt-ap-inbox-received',
                message:     'Proposal received in inbox',
                payload:     { proposalId: proposalId || null },
            });
        } catch (_) { /* never throw out of the bridge */ }
    }

    function logRejected(errors) {
        const log = getEventLog();
        if (!log || typeof log.append !== 'function') return;
        try {
            log.append({
                severity:    'WARNING',
                category:    'UI',
                source:      'ai-proposal-inbox',
                messageKey:  'elog-evt-ap-inbox-rejected',
                message:     'Proposal rejected by inbox',
                payload: {
                    errorCount: Array.isArray(errors) ? errors.length : 0,
                    firstError: (Array.isArray(errors) && errors.length) ? String(errors[0]).slice(0, 120) : null,
                },
            });
        } catch (_) { /* never throw */ }
    }

    // ── State change broadcast ────────────────────────────────────
    // UI-only event. The PR-7 panel listens for this to update the
    // inbox-count cell. No simulation / AI / scenario semantics.
    function broadcast() {
        try {
            document.dispatchEvent(new CustomEvent('rmooz:ai-proposal-inbox-changed', {
                detail: {
                    count:    proposals.length,
                    activeId: proposals.length ? proposals[0].id : null,
                },
            }));
        } catch (_) { /* never throw */ }
    }

    // ── Public bridge methods ─────────────────────────────────────
    function addProposal(input) {
        const C = getContract();
        if (!C || typeof C.validateProposal !== 'function') {
            // Defensive — contract module hasn't loaded yet. Without
            // it we cannot guarantee safety, so we refuse the input.
            try { console.warn('[ai-proposal-inbox] contract module missing'); } catch (_) {}
            return null;
        }

        const result = C.validateProposal(input);
        if (!result.valid) {
            logRejected(result.errors);
            // Active proposal is left intact — the panel's setProposal
            // would have preserved it anyway, but we don't even call
            // setProposal for rejected input.
            return null;
        }

        const normalized = result.normalized;

        // Prepend (newest first) + cap. Oldest drops at the tail
        // when over MAX_SIZE — consistent with PR-6 Event Log capping.
        proposals.unshift(normalized);
        if (proposals.length > MAX_SIZE) proposals.length = MAX_SIZE;

        // Push to the PR-7 panel as the active proposal. Note: the
        // panel's setProposal will RE-VALIDATE through the contract
        // (idempotent on already-normalized input) — that's deliberate
        // belt-and-braces against a future bypass.
        const panel = getPanel();
        if (panel && typeof panel.setProposal === 'function') {
            try { panel.setProposal(normalized); } catch (_) { /* keep state on render error */ }
        }

        logReceived(normalized.id);
        broadcast();
        return defensiveCopy(normalized);
    }

    function listProposals() {
        // Defensive copy — caller cannot mutate inbox state by
        // tampering with the returned array or its entries.
        return proposals.map(defensiveCopy);
    }

    function getActiveProposal() {
        if (!proposals.length) return null;
        return defensiveCopy(proposals[0]);
    }

    function clearInbox() {
        proposals = [];
        const panel = getPanel();
        if (panel && typeof panel.clearProposal === 'function') {
            try { panel.clearProposal(); } catch (_) { /* ignore */ }
        }
        broadcast();
    }

    // Initial broadcast so any subscriber that loaded after us still
    // gets a count update on the first event loop tick. Wrapped in a
    // microtask via Promise.resolve so the inbox is fully published
    // before the event fires.
    Promise.resolve().then(broadcast);

    window.AppShellAIProposalInbox = {
        addProposal,
        listProposals,
        getActiveProposal,
        clearInbox,
        MAX_SIZE,
        // Surfaced for tests / inspectors only; not a public API for
        // production callers.
        _internal: { defensiveCopy },
    };
})();
