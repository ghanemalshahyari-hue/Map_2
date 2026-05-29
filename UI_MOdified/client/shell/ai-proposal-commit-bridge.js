/**
 * Operational shell — AI Proposal Commit Bridge (DRY-RUN).
 *
 * PR-12. Surface-only commit bridge. Provides a single entry point
 * `commitDecision(decision, proposal)` that future PRs will extend
 * to perform a real commit. In PR-12 this is purely a dry-run:
 * validation + Event Log row + literal return object. No network
 * call, no scenario mutation, no journal write.
 *
 * Strict invariants:
 *   1. NEVER calls /api/sim/commit. The string does not appear in
 *      this file. There is no `fetch`, `XMLHttpRequest`, or
 *      `sendBeacon` reference at all — the bridge has no network
 *      code path to enable.
 *   2. NEVER mutates scenario / units / map / journal state. The
 *      bridge reads only validator + Event Log globals.
 *   3. Closed decision set: ACCEPT / REJECT / HOLD. Anything else
 *      is rejected with a single UI/WARNING row.
 *   4. Proposal must pass PR-8 contract. Bridge re-validates even
 *      when the proposal came from the panel (which had its own
 *      validation pass) — defense in depth.
 *   5. NEVER dispatches `rmooz:*` events of any kind in PR-12.
 *
 * Bridge: window.AppShellAIProposalCommitBridge
 *   commitDecision(decision, proposal)
 *       → { ok: true, dryRun: true, decision, proposalId, committed: false }
 *         on success, or `null` on rejection.
 *   getState()
 *       → { lastDecision, lastProposalId, lastResult, lastError, lastAt }
 */
(function () {
    'use strict';

    // ── Closed set of allowed decisions ───────────────────────────
    const DECISION = Object.freeze({ ACCEPT: 'ACCEPT', REJECT: 'REJECT', HOLD: 'HOLD' });
    const DECISION_SET = new Set(Object.values(DECISION));

    // ── Local state (for getState / debug inspection only) ────────
    let state = {
        lastDecision:   null,
        lastProposalId: null,
        lastResult:     null,                                       // 'dryrun-ok' | 'rejected-decision' | 'rejected-proposal' | null
        lastError:      null,
        lastAt:         null,
    };

    function setState(patch) {
        state = Object.assign({}, state, patch, { lastAt: Date.now() });
    }

    // ── Helpers ────────────────────────────────────────────────────
    function getContract() { return window.AppShellAIProposalContract; }
    function getEventLog() { return window.AppShellEventLog; }

    function logRow(severity, messageKey, fallback, payload) {
        const log = getEventLog();
        if (!log || typeof log.append !== 'function') return;
        try {
            log.append({
                severity,
                category:    'UI',                                  // PR-6 closed-set; never AI/SIM/SCENARIO
                source:      'ai-proposal-commit-bridge',
                messageKey,
                message:     fallback,
                payload:     (payload && typeof payload === 'object') ? payload : undefined,
            });
        } catch (_) { /* never throw out of the bridge */ }
    }

    // ── Public API ────────────────────────────────────────────────
    function commitDecision(decision, proposal) {
        // 1) Decision must be in the closed set. Accept both
        //    'ACCEPT' and 'accept' style inputs by normalizing case;
        //    anything outside the set is rejected with a WARNING.
        const decisionUpper = (typeof decision === 'string') ? decision.toUpperCase() : '';
        if (!DECISION_SET.has(decisionUpper)) {
            logRow('WARNING', 'elog-evt-commit-bad-decision', 'Commit bridge rejected invalid decision', {
                attempted: String(decision).slice(0, 40),
            });
            setState({ lastDecision: null, lastResult: 'rejected-decision', lastError: 'invalid decision' });
            return null;
        }

        // 2) Proposal must pass the PR-8 contract. Defense in depth —
        //    even when the panel hands us a freshly-normalized
        //    proposal, the bridge re-validates so a future bypass
        //    cannot smuggle a malformed object in.
        const C = getContract();
        if (!C || typeof C.validateProposal !== 'function') {
            logRow('WARNING', 'elog-evt-commit-bad-proposal', 'Commit bridge rejected invalid proposal', {
                reason: 'contract module missing',
            });
            setState({ lastResult: 'rejected-proposal', lastError: 'contract module missing' });
            return null;
        }
        const result = C.validateProposal(proposal);
        if (!result.valid) {
            logRow('WARNING', 'elog-evt-commit-bad-proposal', 'Commit bridge rejected invalid proposal', {
                errorCount: result.errors.length,
                firstError: result.errors[0] ? String(result.errors[0]).slice(0, 120) : null,
            });
            setState({ lastResult: 'rejected-proposal', lastError: 'contract validation failed' });
            return null;
        }

        const proposalId = result.normalized.id;

        // 3) Dry-run result. Note: `committed: false` is the explicit
        //    contract — future PRs that enable real commit will flip
        //    this to true ONLY through a separate, guarded code path.
        const dryRunResult = {
            ok:         true,
            dryRun:     true,
            decision:   decisionUpper,
            proposalId,
            committed:  false,
        };

        logRow('NOTICE', 'elog-evt-commit-dryrun', 'Commit bridge dry-run decision prepared', {
            decision: decisionUpper,
            proposalId,
        });

        setState({
            lastDecision:   decisionUpper,
            lastProposalId: proposalId,
            lastResult:     'dryrun-ok',
            lastError:      null,
        });

        // PR-13: feed the in-memory Local Decision Journal. Only
        // reachable AFTER both decision + proposal validation pass
        // and the dry-run result is fully prepared. Lazy + guarded
        // — if the journal module hasn't loaded for any reason, the
        // commit bridge still returns the dry-run result cleanly.
        // The journal does its own validation; we pass the minimum
        // shape it requires.
        try {
            if (window.AppShellDecisionJournal && typeof window.AppShellDecisionJournal.record === 'function') {
                window.AppShellDecisionJournal.record({
                    proposalId,
                    decision:   decisionUpper,
                    dryRun:     true,                       // must be true; journal rejects otherwise
                    committed:  false,                      // must be false; journal rejects otherwise
                    timestamp:  undefined,                  // journal auto-fills with Zulu DTG
                    source:     'ai-proposal-commit-bridge',
                    summary:    (result.normalized.summary || '').slice(0, 240),
                    risk:       result.normalized.risk || 'UNKNOWN',
                });
            }
        } catch (_) { /* never throw out of the bridge */ }

        return dryRunResult;
    }

    function getState() {
        return Object.assign({}, state);
    }

    window.AppShellAIProposalCommitBridge = {
        commitDecision,
        getState,
        DECISION,                                                   // exported for callers that want the enum
    };
})();
