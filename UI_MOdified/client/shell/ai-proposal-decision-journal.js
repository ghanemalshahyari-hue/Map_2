/**
 * Operational shell — Local Decision Records (in-memory only).
 *
 * PR-13, UNLOCKED 2026-06-01. Captures the operator's Accept / Reject
 * / Hold decisions as structured records *after* they pass through
 * the PR-12 commit bridge. Pure frontend, in-memory, dies on reload.
 * It MIRRORS the real commit (committed:true on Accept) but is itself
 * non-durable — the DURABLE record is the server journal
 * (data/journal/<run>.jsonl). Named "Decision Records" in the UI so
 * the operator distinguishes this in-memory mirror from that journal.
 *
 * Strict invariants:
 *   1. NEVER persists. No localStorage, no IndexedDB, no fetch, no
 *      file API. The closure variable `records` is the only place
 *      data lives and it dies on page reload.
 *   2. NEVER calls /api/sim/commit. The string does not appear in
 *      this module at all.
 *   3. NEVER mutates scenario / units / map / journal-file state.
 *      The module reads only the PR-6 Event Log + PR-8 contract
 *      enums (closed sets).
 *   4. Closed-set validation: decision ∈ {ACCEPT, REJECT, HOLD},
 *      risk ∈ {LOW, MEDIUM, HIGH, UNKNOWN}, source must be the
 *      literal 'ai-proposal-commit-bridge'. `dryRun !== true` or
 *      `committed !== false` → rejected before storage.
 *   5. The dispatched broadcast `rmooz:ai-proposal-decision-journal-changed`
 *      carries only summary stats (count + latest id), never the
 *      full record list. Subscribers must call list() to read.
 *
 * Bridge: window.AppShellDecisionJournal
 *   record(record)   – validate + store + render; returns stored copy or null
 *   list()           – defensive-copy array, newest first
 *   getState()       – { count, capacity, latestId, latestAt }
 *   clear()          – wipe memory + re-render empty state
 */
(function () {
    'use strict';

    const MAX_RECORDS = 100;

    // Closed-set enums — mirror PR-8 / PR-12. Decision restricted to
    // the three operator paths; risk pulled from PR-8 contract.
    const DECISION_SET = new Set(['ACCEPT', 'REJECT', 'HOLD']);
    const RISK_SET     = new Set(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN']);
    const EXPECTED_SOURCE = 'ai-proposal-commit-bridge';

    // ── Local state — the ONLY mutable surface in this module ─────
    let records = [];
    let nextSeq = 1;                  // monotonic counter for record id

    // ── Dependency lookups (deferred so load order is forgiving) ──
    const getEventLog = () => window.AppShellEventLog;
    const $ = (id) => document.getElementById(id);

    function tr(key, fallback) {
        if (typeof window.t === 'function' && key) {
            const v = window.t(key);
            if (typeof v === 'string' && v && v !== key) return v;
        }
        return fallback;
    }

    function formatDtg(d) {
        if (window.AppShellClock && typeof window.AppShellClock.formatZuluDtg === 'function') {
            try { return window.AppShellClock.formatZuluDtg(d); } catch (_) { /* fall through */ }
        }
        return d.toISOString();
    }

    function generateId() {
        return 'DR-' + Date.now().toString(36) + '-' + (nextSeq++).toString(36);
    }

    // ── Defensive copy (records are flat primitives only) ─────────
    function defensiveCopy(r) {
        if (!r) return null;
        return Object.assign({}, r);
    }

    // ── Logging ───────────────────────────────────────────────────
    function logStored(rec) {
        const log = getEventLog();
        if (!log || typeof log.append !== 'function') return;
        try {
            log.append({
                severity:    'NOTICE',
                category:    'UI',                                 // closed-set; PR-6 gate
                source:      'ai-proposal-decision-journal',
                messageKey:  'elog-evt-dr-stored',
                message:     'Local decision record stored',
                payload:     { id: rec.id, decision: rec.decision, proposalId: rec.proposalId },
            });
        } catch (_) { /* never throw */ }
    }
    function logRejected(reason) {
        const log = getEventLog();
        if (!log || typeof log.append !== 'function') return;
        try {
            log.append({
                severity:    'WARNING',
                category:    'UI',
                source:      'ai-proposal-decision-journal',
                messageKey:  'elog-evt-dr-rejected',
                message:     'Local decision record rejected',
                payload:     { reason: String(reason || 'invalid').slice(0, 120) },
            });
        } catch (_) { /* never throw */ }
    }

    // ── Broadcast ─────────────────────────────────────────────────
    // Carries summary stats only — never the full record array. A
    // subscriber that wants the records must call list().
    function broadcast() {
        try {
            document.dispatchEvent(new CustomEvent('rmooz:ai-proposal-decision-journal-changed', {
                detail: {
                    count:    records.length,
                    latestId: records.length ? records[0].id : null,
                },
            }));
        } catch (_) { /* never throw */ }
    }

    // ── Validation ────────────────────────────────────────────────
    function validate(input) {
        if (!input || typeof input !== 'object' || Array.isArray(input)) return 'record must be a plain object';
        if (typeof input.proposalId !== 'string' || !input.proposalId.trim()) return 'proposalId required';
        const decision = String(input.decision || '').toUpperCase();
        if (!DECISION_SET.has(decision)) return 'decision must be ACCEPT | REJECT | HOLD';
        // UNLOCKED 2026-06-01: dryRun/committed must be booleans, but
        // committed:true is now allowed — the store mirrors real
        // commits. (Was: dryRun MUST be true, committed MUST be false.)
        if (typeof input.dryRun !== 'boolean')    return 'dryRun must be a boolean';
        if (typeof input.committed !== 'boolean') return 'committed must be a boolean';
        if (typeof input.summary !== 'string') return 'summary required (string)';
        const risk = String(input.risk || '').toUpperCase();
        if (!RISK_SET.has(risk)) return 'risk must be LOW | MEDIUM | HIGH | UNKNOWN';
        if (typeof input.source !== 'string' || input.source !== EXPECTED_SOURCE) {
            return 'source must be "' + EXPECTED_SOURCE + '"';
        }
        return null;
    }

    // ── Public API ────────────────────────────────────────────────
    function record(input) {
        const err = validate(input);
        if (err) {
            logRejected(err);
            return null;
        }
        const rec = {
            id:         generateId(),
            proposalId: String(input.proposalId).slice(0, 80),
            decision:   String(input.decision).toUpperCase(),
            dryRun:     input.dryRun === true,
            committed:  input.committed === true,
            journalSeq: (typeof input.journalSeq === 'number' && isFinite(input.journalSeq)) ? input.journalSeq : null,
            timestamp:  (typeof input.timestamp === 'string' && input.timestamp) ? input.timestamp : formatDtg(new Date()),
            source:     EXPECTED_SOURCE,
            summary:    String(input.summary).slice(0, 240),
            risk:       String(input.risk).toUpperCase(),
        };
        records.unshift(rec);
        if (records.length > MAX_RECORDS) records.length = MAX_RECORDS;
        renderRecords();
        logStored(rec);
        broadcast();
        return defensiveCopy(rec);
    }

    function list() {
        return records.map(defensiveCopy);
    }

    function getState() {
        return {
            count:    records.length,
            capacity: MAX_RECORDS,
            latestId: records.length ? records[0].id : null,
            latestAt: records.length ? records[0].timestamp : null,
        };
    }

    function clear() {
        records = [];
        renderRecords();
        broadcast();
    }

    // ── Render ────────────────────────────────────────────────────
    function renderRecords() {
        const listEl = $('dr-list');
        const emptyEl = $('dr-empty');
        if (!listEl) return;
        // Wipe existing record rows (but keep the empty-state node).
        const stale = listEl.querySelectorAll('.dr-row');
        stale.forEach(n => n.remove());

        if (!records.length) {
            if (emptyEl) emptyEl.removeAttribute('hidden');
            return;
        }
        if (emptyEl) emptyEl.setAttribute('hidden', '');

        const frag = document.createDocumentFragment();
        for (const r of records) {
            const row = document.createElement('div');
            row.className = 'dr-row';
            row.setAttribute('data-decision', r.decision);

            // Time (monospace, LTR for DTG)
            const t = document.createElement('span');
            t.className = 'dr-time';
            t.setAttribute('dir', 'ltr');
            t.textContent = r.timestamp;
            row.appendChild(t);

            // Decision chip
            const d = document.createElement('span');
            d.className = 'dr-decision-chip dr-decision-chip--' + r.decision.toLowerCase();
            d.textContent = r.decision;
            row.appendChild(d);

            // Proposal id (mono, LTR)
            const p = document.createElement('span');
            p.className = 'dr-proposal-id';
            p.setAttribute('dir', 'ltr');
            p.textContent = r.proposalId;
            row.appendChild(p);

            // Mode badge — Live (real commit) vs Dry-run (held/legacy)
            const dr = document.createElement('span');
            dr.className = r.dryRun ? 'dr-dryrun-badge' : 'dr-live-badge';
            dr.setAttribute('data-i18n', r.dryRun ? 'dr-dryrun' : 'dr-live');
            dr.textContent = r.dryRun ? tr('dr-dryrun', 'Dry-run') : tr('dr-live', 'Live');
            row.appendChild(dr);

            // Committed pill — reflects the real commit outcome
            const c = document.createElement('span');
            c.className = 'dr-committed' + (r.committed ? ' dr-committed--yes' : '');
            c.setAttribute('data-i18n', r.committed ? 'dr-committed-yes' : 'dr-committed-no');
            c.textContent = r.committed ? tr('dr-committed-yes', 'Committed: Yes') : tr('dr-committed-no', 'Committed: No');
            row.appendChild(c);

            // Journal sequence (mono, LTR) when the server assigned one
            if (r.journalSeq != null) {
                const seq = document.createElement('span');
                seq.className = 'dr-journal-seq';
                seq.setAttribute('dir', 'ltr');
                seq.textContent = '#' + r.journalSeq;
                row.appendChild(seq);
            }

            frag.appendChild(row);
        }
        listEl.appendChild(frag);
    }

    // ── Wiring ────────────────────────────────────────────────────
    function bindClear() {
        const btn = $('dr-clear-btn');
        if (!btn) return;
        btn.addEventListener('click', () => clear());
    }

    function bindLanguageChain() {
        const prev = window.onLanguageChange;
        window.onLanguageChange = function (lang) {
            try { renderRecords(); } catch (_) { /* don't break chain */ }
            if (typeof prev === 'function') {
                try { prev(lang); } catch (_) { /* don't break other listeners */ }
            }
        };
    }

    function init() {
        if (!$('ap-decision-records')) return;
        bindClear();
        bindLanguageChain();
        renderRecords();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    window.AppShellDecisionJournal = {
        record,
        list,
        getState,
        clear,
        MAX_RECORDS,
    };
})();
