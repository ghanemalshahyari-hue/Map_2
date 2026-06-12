/**
 * Operational shell — AI Proposal Commit Bridge (LIVE COMMIT).
 *
 * PR-12, UNLOCKED 2026-06-01 by owner ruling (full unlock — the
 * operator UI mutates). `commitDecision(decision, proposal)` now
 * performs a REAL commit against the server instead of a dry run:
 *
 *   ACCEPT → POST /api/sim/commit { accepted_action_ids: 'ALL' }
 *            → server applies the proposal's projected_state and
 *              writes the durable journal row (data/journal/<run>.jsonl).
 *   REJECT → POST /api/sim/commit { accepted_action_ids: [] }
 *            → server consumes the proposal and journals the reject.
 *   HOLD   → deferred; no server call, no mutation.
 *
 * Invariants that REMAIN (defense in depth):
 *   1. Closed decision set ACCEPT / REJECT / HOLD — anything else is
 *      rejected SYNCHRONOUSLY (UI/WARNING + null return) before any
 *      network call.
 *   2. Proposal must pass the PR-8 contract; the bridge re-validates
 *      so a malformed proposal never reaches the server.
 *   3. R2 (no commit without intent): every commit carries an
 *      operator_id resolved from the signed-in identity.
 *
 * commitDecision returns SYNCHRONOUSLY (callers — e.g. the panel —
 * fire-and-forget; the real outcome lands in getState() + the Local
 * Decision Records once the server responds):
 *   null                                                           — rejected decision/proposal
 *   { ok:true, decision:'HOLD',  committed:false, deferred:true,  proposalId }   — HOLD
 *   { ok:true, decision, committed:false, pending:true, proposalId }             — ACCEPT/REJECT in flight
 *
 * Bridge: window.AppShellAIProposalCommitBridge
 *   commitDecision(decision, proposal)
 *   getState() → { lastDecision, lastProposalId, lastResult, lastError,
 *                  lastAt, mode, lastCommitted, lastJournalSeq }
 */
(function () {
    'use strict';

    const COMMIT_ENDPOINT = '/api/sim/commit';

    // ── Closed set of allowed decisions ───────────────────────────
    const DECISION = Object.freeze({ ACCEPT: 'ACCEPT', REJECT: 'REJECT', HOLD: 'HOLD' });
    const DECISION_SET = new Set(Object.values(DECISION));

    // ── Local state (for getState / debug inspection only) ────────
    let state = {
        lastDecision:   null,
        lastProposalId: null,
        lastResult:     null,   // 'commit-ok' | 'reject-ok' | 'held' | 'commit-pending' | 'commit-failed' | 'rejected-decision' | 'rejected-proposal' | null
        lastError:      null,
        lastAt:         null,
        mode:           'live', // UNLOCKED: was 'dry-run' before the 2026-06-01 owner ruling
        lastCommitted:  false,
        lastJournalSeq: null,
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

    // Resolve the operator identity for the audit trail (R2). Falls
    // back to a generic 'operator' label when identity.js hasn't
    // populated CHAT_CONFIG yet — the commit still carries intent.
    function operatorId() {
        try {
            const u = window.AppConfig && window.AppConfig.CHAT_CONFIG && window.AppConfig.CHAT_CONFIG.currentUser;
            if (u && u.id) return String(u.id).slice(0, 80);
        } catch (_) { /* fall through */ }
        return 'operator';
    }

    // Record the (real) decision into the Local Decision Records
    // mirror. The DURABLE record is the server journal row; this is
    // the in-memory UI mirror, now allowed to carry committed:true.
    function recordLocal(proposalId, decisionUpper, committed, normalized, journalSeq) {
        try {
            if (window.AppShellDecisionJournal && typeof window.AppShellDecisionJournal.record === 'function') {
                window.AppShellDecisionJournal.record({
                    proposalId,
                    decision:   decisionUpper,
                    dryRun:     false,                              // UNLOCKED: real commit, not a dry run
                    committed:  committed,
                    journalSeq: (journalSeq != null) ? journalSeq : undefined,
                    timestamp:  undefined,                          // journal auto-fills with Zulu DTG
                    source:     'ai-proposal-commit-bridge',
                    summary:    ((normalized && normalized.summary) || '').slice(0, 240),
                    risk:       (normalized && normalized.risk) || 'UNKNOWN',
                });
            }
        } catch (_) { /* never throw out of the bridge */ }
    }

    // Real server commit. ACCEPT → accept all actions; REJECT →
    // accept none (the server still journals a reject row). Async;
    // updates state + the Local Decision Records on completion.
    function postCommit(decisionUpper, proposalId, normalized) {
        const accepted_action_ids = (decisionUpper === DECISION.ACCEPT) ? 'ALL' : [];
        fetch(COMMIT_ENDPOINT, {
            method:      'POST',
            credentials: 'include',
            headers:     { 'Content-Type': 'application/json' },
            body:        JSON.stringify({
                proposal_id:         proposalId,
                accepted_action_ids: accepted_action_ids,
                operator_id:         operatorId(),
            }),
        }).then(async (resp) => {
            if (!resp.ok) {
                let detail = 'HTTP ' + resp.status;
                try { const e = await resp.json(); if (e && e.error) detail = String(e.error).slice(0, 200); } catch (_) {}
                throw new Error(detail);
            }
            return resp.json();
        }).then((r) => {
            const committed = (decisionUpper === DECISION.ACCEPT);
            const seq = (r && r.journal_seq != null) ? r.journal_seq : null;
            setState({
                lastResult:     committed ? 'commit-ok' : 'reject-ok',
                lastError:      null,
                lastCommitted:  committed,
                lastJournalSeq: seq,
            });
            logRow('NOTICE',
                committed ? 'elog-evt-commit-applied' : 'elog-evt-commit-rejected',
                committed ? 'Decision committed to journal' : 'Rejection committed to journal',
                { decision: decisionUpper, proposalId, journalSeq: seq });
            recordLocal(proposalId, decisionUpper, committed, normalized, seq);
        }).catch((e) => {
            setState({
                lastResult:    'commit-failed',
                lastError:     String((e && e.message) || e).slice(0, 200),
                lastCommitted: false,
            });
            logRow('WARNING', 'elog-evt-commit-failed', 'Commit request failed', {
                decision:   decisionUpper,
                proposalId: proposalId,
                error:      String((e && e.message) || e).slice(0, 200),
            });
        });
    }

    // ── Public API ────────────────────────────────────────────────
    function commitDecision(decision, proposal) {
        // 1) Decision must be in the closed set — rejected SYNCHRONOUSLY
        //    (null return) before any network work. Accept 'accept' /
        //    'ACCEPT' style inputs by normalizing case.
        const decisionUpper = (typeof decision === 'string') ? decision.toUpperCase() : '';
        if (!DECISION_SET.has(decisionUpper)) {
            logRow('WARNING', 'elog-evt-commit-bad-decision', 'Commit bridge rejected invalid decision', {
                attempted: String(decision).slice(0, 40),
            });
            setState({ lastDecision: null, lastResult: 'rejected-decision', lastError: 'invalid decision', lastCommitted: false });
            return null;
        }

        // 2) Proposal must pass the PR-8 contract — defense in depth so
        //    a malformed proposal can never reach /api/sim/commit.
        const C = getContract();
        if (!C || typeof C.validateProposal !== 'function') {
            logRow('WARNING', 'elog-evt-commit-bad-proposal', 'Commit bridge rejected invalid proposal', {
                reason: 'contract module missing',
            });
            setState({ lastResult: 'rejected-proposal', lastError: 'contract module missing', lastCommitted: false });
            return null;
        }
        const result = C.validateProposal(proposal);
        if (!result.valid) {
            logRow('WARNING', 'elog-evt-commit-bad-proposal', 'Commit bridge rejected invalid proposal', {
                errorCount: result.errors.length,
                firstError: result.errors[0] ? String(result.errors[0]).slice(0, 120) : null,
            });
            setState({ lastResult: 'rejected-proposal', lastError: 'contract validation failed', lastCommitted: false });
            return null;
        }

        const proposalId = result.normalized.id;

        // 3) HOLD — operator defers. No server call, no mutation.
        if (decisionUpper === DECISION.HOLD) {
            setState({ lastDecision: decisionUpper, lastProposalId: proposalId, lastResult: 'held', lastError: null, lastCommitted: false, lastJournalSeq: null });
            logRow('NOTICE', 'elog-evt-commit-held', 'Decision held — no commit', { proposalId });
            recordLocal(proposalId, decisionUpper, false, result.normalized, null);
            return { ok: true, decision: decisionUpper, committed: false, deferred: true, proposalId };
        }

        // 4) ACCEPT / REJECT — fire the real commit (async). State +
        //    the Local Decision Records update on the server response.
        setState({ lastDecision: decisionUpper, lastProposalId: proposalId, lastResult: 'commit-pending', lastError: null, lastCommitted: false });
        logRow('NOTICE', 'elog-evt-commit-sent', 'Commit request sent', { decision: decisionUpper, proposalId });
        postCommit(decisionUpper, proposalId, result.normalized);
        return { ok: true, decision: decisionUpper, committed: false, pending: true, proposalId };
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
