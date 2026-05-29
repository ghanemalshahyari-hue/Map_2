/**
 * Operational shell — Real Journal Contract Draft (validator only).
 *
 * PR-14. Pure validator + normalizer + draft-factory for what a real
 * journal entry will look like in a future PR. THIS PR DOES NOT
 * WRITE A REAL JOURNAL. The module is a contract surface only.
 *
 * Strict invariants:
 *   1. NEVER writes a file. The module has no `fs`, no `Blob`, no
 *      `URL.createObjectURL`, no `download` link, no localStorage,
 *      no IndexedDB, no fetch / XHR.
 *   2. NEVER mutates scenario state. Reads only the closed enums
 *      defined in this file + AppShellEventLog (for logging).
 *   3. PR-14 accepts ONLY `mode: 'DRY_RUN'`. Anything else fails
 *      validation. A future PR that opens real journaling must
 *      expand `ALLOWED_MODES` (an explicit, auditable change).
 *   4. `committed`, `dryRun`, `result.stateMutation`,
 *      `result.journalPersisted`, `result.backendCommitCalled` are
 *      hard-locked: any non-conforming value rejects the entry.
 *   5. `metadata` is shallow primitives only. Anything else is
 *      dropped at normalization.
 *
 * Bridge: window.AppShellJournalContract
 *   validateJournalEntry(input)        – { valid, errors, normalized }
 *   normalizeJournalEntry(input)       – normalized | null
 *   createDraftFromDecisionRecord(rec) – build + validate + return draft | null
 *   SCHEMA_VERSION                     – 'journal-draft-v1'
 *   TYPE, MODE, DECISION, RISK, ACTOR  – frozen enum constants
 */
(function () {
    'use strict';

    // ── Closed enums ───────────────────────────────────────────────
    const SCHEMA_VERSION = 'journal-draft-v1';

    const TYPE = Object.freeze({ PROPOSAL_DECISION: 'PROPOSAL_DECISION' });
    const TYPE_SET = new Set(Object.values(TYPE));

    const MODE = Object.freeze({ DRY_RUN: 'DRY_RUN', REAL: 'REAL' });
    // PR-14: REAL is in the enum so future PRs can flip the gate by
    // changing this Set. The validator uses ALLOWED_MODES, not MODE.
    const ALLOWED_MODES = new Set([MODE.DRY_RUN]);

    const DECISION = Object.freeze({ ACCEPT: 'ACCEPT', REJECT: 'REJECT', HOLD: 'HOLD' });
    const DECISION_SET = new Set(Object.values(DECISION));

    const RISK = Object.freeze({ LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', UNKNOWN: 'UNKNOWN' });
    const RISK_SET = new Set(Object.values(RISK));

    const ACTOR_TYPE = Object.freeze({ OPERATOR: 'OPERATOR', SYSTEM: 'SYSTEM' });
    const ACTOR_TYPE_SET = new Set(Object.values(ACTOR_TYPE));

    // Length caps — defensive. Strings clipped at normalization.
    const MAX_ID_LEN      = 80;
    const MAX_NAME_LEN    = 120;
    const MAX_SOURCE_LEN  = 80;
    const MAX_SUMMARY_LEN = 500;
    const MAX_TS_LEN      = 40;

    // ── Helpers ────────────────────────────────────────────────────
    function isString(x)         { return typeof x === 'string'; }
    function isNonEmptyString(x) { return isString(x) && x.trim().length > 0; }
    function isPlainObject(x)    { return x != null && typeof x === 'object' && !Array.isArray(x); }
    function isPrimitive(x) {
        return x === null
            || typeof x === 'string'
            || typeof x === 'number'
            || typeof x === 'boolean';
    }
    function clip(s, max) { return String(s).trim().slice(0, max); }

    function formatDtg(d) {
        if (window.AppShellClock && typeof window.AppShellClock.formatZuluDtg === 'function') {
            try { return window.AppShellClock.formatZuluDtg(d); } catch (_) { /* fall through */ }
        }
        return d.toISOString();
    }

    function sanitizeMetadata(m) {
        // Shallow primitives only — same rule as PR-8 contract. We
        // always seed `app` and `schemaVersion` so the resulting
        // entry carries the spec identifier even when the caller's
        // metadata was missing or partial.
        const out = { app: 'RMOOZ', schemaVersion: SCHEMA_VERSION };
        if (!isPlainObject(m)) return out;
        for (const k of Object.keys(m)) {
            // Don't let caller override the spec identifiers.
            if (k === 'app' || k === 'schemaVersion') continue;
            const v = m[k];
            if (!isPrimitive(v)) continue;
            out[k] = isString(v) ? v.slice(0, MAX_SUMMARY_LEN) : v;
        }
        return out;
    }

    // Monotonic local counter for synthesized ids. Lives only for
    // the page lifetime; the contract does not persist anything.
    let nextSeq = 1;
    function synthesizeId() { return 'JD-' + Date.now().toString(36) + '-' + (nextSeq++).toString(36); }

    // ── Logging (UI/NOTICE on validate, UI/WARNING on reject) ─────
    function logValidated(id) {
        try {
            if (window.AppShellEventLog && typeof window.AppShellEventLog.append === 'function') {
                window.AppShellEventLog.append({
                    severity:    'NOTICE',
                    category:    'UI',                                  // closed-set — never AI/SIM/SCENARIO
                    source:      'journal-contract',
                    messageKey:  'elog-evt-journal-draft-validated',
                    message:     'Journal draft contract validated',
                    payload:     { id: id || null },
                });
            }
        } catch (_) { /* never throw */ }
    }
    function logRejected(errors) {
        try {
            if (window.AppShellEventLog && typeof window.AppShellEventLog.append === 'function') {
                window.AppShellEventLog.append({
                    severity:    'WARNING',
                    category:    'UI',
                    source:      'journal-contract',
                    messageKey:  'elog-evt-journal-draft-rejected',
                    message:     'Journal draft contract rejected',
                    payload: {
                        errorCount: Array.isArray(errors) ? errors.length : 0,
                        firstError: (Array.isArray(errors) && errors.length) ? String(errors[0]).slice(0, 120) : null,
                    },
                });
            }
        } catch (_) { /* never throw */ }
    }

    // ── Validation ────────────────────────────────────────────────
    function validateJournalEntry(input) {
        const errors = [];
        if (!isPlainObject(input)) {
            return { valid: false, errors: ['entry must be a plain object'], normalized: null };
        }

        // type
        if (!TYPE_SET.has(input.type)) errors.push('type must be PROPOSAL_DECISION');

        // mode — closed set + ALLOWED_MODES gate (PR-14: DRY_RUN only)
        if (!ALLOWED_MODES.has(input.mode)) {
            errors.push('mode must be DRY_RUN (REAL not allowed in this PR)');
        }

        // committed / dryRun — hard-locked
        if (input.committed !== false) errors.push('committed must be exactly false');
        if (input.dryRun    !== true)  errors.push('dryRun must be exactly true');

        // decision + risk — closed sets
        if (!DECISION_SET.has(input.decision)) errors.push('decision must be ACCEPT | REJECT | HOLD');
        if (!RISK_SET.has(input.risk))         errors.push('risk must be LOW | MEDIUM | HIGH | UNKNOWN');

        // Required strings
        if (input.id != null && !isString(input.id))             errors.push('id must be string if provided');
        if (input.timestamp != null && !isString(input.timestamp)) errors.push('timestamp must be string if provided');
        if (!isNonEmptyString(input.summary))                    errors.push('summary required (non-empty string)');

        // actor — closed type + nullable id/name strings
        const actor = input.actor;
        if (!isPlainObject(actor))                       errors.push('actor required (object)');
        else {
            if (!ACTOR_TYPE_SET.has(actor.type))         errors.push('actor.type must be OPERATOR | SYSTEM');
            if (actor.id   != null && !isString(actor.id))   errors.push('actor.id must be null or string');
            if (actor.name != null && !isString(actor.name)) errors.push('actor.name must be null or string');
        }

        // proposal — id required string, source nullable string
        const proposal = input.proposal;
        if (!isPlainObject(proposal))                            errors.push('proposal required (object)');
        else {
            if (!isNonEmptyString(proposal.id))                  errors.push('proposal.id required (non-empty string)');
            if (proposal.source != null && !isString(proposal.source)) errors.push('proposal.source must be null or string');
        }

        // result — all three flags hard-locked to false
        const result = input.result;
        if (!isPlainObject(result)) {
            errors.push('result required (object)');
        } else {
            if (result.stateMutation       !== false) errors.push('result.stateMutation must be exactly false');
            if (result.journalPersisted    !== false) errors.push('result.journalPersisted must be exactly false');
            if (result.backendCommitCalled !== false) errors.push('result.backendCommitCalled must be exactly false');
        }

        // metadata — plain object if provided
        if (input.metadata != null && !isPlainObject(input.metadata)) {
            errors.push('metadata must be a plain object if provided');
        }

        // Circular / non-serializable check — same defensive pass as PR-8.
        try { JSON.stringify(input); } catch (_) {
            errors.push('entry contains circular reference or non-serializable content');
        }

        if (errors.length) {
            logRejected(errors);
            return { valid: false, errors, normalized: null };
        }

        const normalized = doNormalize(input);
        logValidated(normalized.id);
        return { valid: true, errors: [], normalized };
    }

    function doNormalize(input) {
        const actor    = input.actor    || {};
        const proposal = input.proposal || {};
        return {
            id:         isString(input.id) && input.id ? clip(input.id, MAX_ID_LEN) : synthesizeId(),
            type:       input.type,
            timestamp:  isString(input.timestamp) && input.timestamp ? clip(input.timestamp, MAX_TS_LEN) : formatDtg(new Date()),
            actor: {
                type: actor.type,
                id:   isString(actor.id)   ? clip(actor.id,   MAX_ID_LEN)   : null,
                name: isString(actor.name) ? clip(actor.name, MAX_NAME_LEN) : null,
            },
            proposal: {
                id:     clip(proposal.id, MAX_ID_LEN),
                source: isString(proposal.source) ? clip(proposal.source, MAX_SOURCE_LEN) : null,
            },
            decision:  input.decision,
            mode:      input.mode,
            committed: false,
            dryRun:    true,
            summary:   clip(input.summary, MAX_SUMMARY_LEN),
            risk:      input.risk,
            result: {
                stateMutation:       false,
                journalPersisted:    false,
                backendCommitCalled: false,
            },
            metadata: sanitizeMetadata(input.metadata),
        };
    }

    function normalizeJournalEntry(input) {
        const r = validateJournalEntry(input);
        return r.valid ? r.normalized : null;
    }

    // ── createDraftFromDecisionRecord — convenience factory ───────
    // Takes a PR-13 Decision Record and produces a PR-14 draft.
    // The draft is returned as an in-memory object; the contract
    // module never stores or persists it. Callers in PR-14 MUST
    // discard the result (or use it for in-process validation only).
    function createDraftFromDecisionRecord(record) {
        if (!isPlainObject(record)) {
            logRejected(['record must be a plain object']);
            return null;
        }
        const draft = {
            id:         isString(record.id) && record.id ? record.id : synthesizeId(),
            type:       TYPE.PROPOSAL_DECISION,
            timestamp:  isString(record.timestamp) ? record.timestamp : formatDtg(new Date()),
            actor: {
                type: ACTOR_TYPE.OPERATOR,                       // PR-7 buttons are the only path to a decision
                id:   null,                                       // operator identity not tracked yet
                name: null,
            },
            proposal: {
                id:     isString(record.proposalId) ? record.proposalId : '',
                source: isString(record.source)     ? record.source     : null,
            },
            decision:  isString(record.decision) ? record.decision.toUpperCase() : '',
            mode:      MODE.DRY_RUN,
            committed: false,
            dryRun:    true,
            summary:   isString(record.summary) ? record.summary : '',
            risk:      isString(record.risk) ? record.risk.toUpperCase() : 'UNKNOWN',
            result: {
                stateMutation:       false,
                journalPersisted:    false,
                backendCommitCalled: false,
            },
            metadata: { app: 'RMOOZ', schemaVersion: SCHEMA_VERSION, derivedFromRecord: true },
        };
        return normalizeJournalEntry(draft);
    }

    window.AppShellJournalContract = {
        validateJournalEntry,
        normalizeJournalEntry,
        createDraftFromDecisionRecord,
        SCHEMA_VERSION,
        TYPE,
        MODE,
        ALLOWED_MODES: new Set(ALLOWED_MODES),       // defensive copy
        DECISION,
        RISK,
        ACTOR_TYPE,
        _internal: { sanitizeMetadata, doNormalize },
    };
})();
