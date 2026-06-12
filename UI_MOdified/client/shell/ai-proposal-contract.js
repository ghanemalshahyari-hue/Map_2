/**
 * Operational shell — AI Proposal data contract.
 *
 * PR-8 (AI Proposal Data Contract). Pure frontend validation +
 * normalization for proposals fed into the PR-7 AI Proposal Review
 * panel. Future AI / simulation modules will hand objects to
 * `AppShellAIProposal.setProposal()`, which routes through
 * `normalizeProposal()` here. Anything that does not match the
 * closed schema is rejected before it can touch the UI — and even
 * normalized output cannot carry references to scenario / units /
 * map state because the contract strips nested objects.
 *
 * Strict invariants:
 *   1. PURE module — no DOM access, no fetch / XHR, no event
 *      listeners, no event dispatch. The bridge exposes only
 *      pure functions.
 *   2. Closed field set — only the fields below survive
 *      normalization. A proposer cannot smuggle in `casualties`,
 *      `detections`, `weapons`, etc. — they would simply be
 *      dropped at the top level.
 *   3. Closed enums — `risk` is one of LOW / MEDIUM / HIGH /
 *      UNKNOWN; `status` is one of PENDING / ACCEPTED / REJECTED /
 *      ON_HOLD. Any other value is replaced with the safe default.
 *   4. Shallow-primitive metadata — `metadata` is walked one level
 *      and only string / number / boolean / null entries are
 *      retained. Nested objects, arrays, functions, DOM nodes,
 *      class instances, Maps, Sets are all dropped during the
 *      sanitization pass.
 *   5. Strings are trimmed + clipped to safe lengths so a
 *      proposal cannot blow up panel layout or trigger renderer
 *      pathological behavior.
 *
 * Bridge: window.AppShellAIProposalContract
 *   normalizeProposal(input)   – returns normalized object or null
 *   validateProposal(input)    – returns { valid, errors, normalized }
 *   createSampleProposal()     – returns a clearly-marked sample
 *   RISK    – enum constants
 *   STATUS  – enum constants
 */
(function () {
    'use strict';

    // ── Closed enums ───────────────────────────────────────────────
    const RISK = Object.freeze({
        LOW:     'LOW',
        MEDIUM:  'MEDIUM',
        HIGH:    'HIGH',
        UNKNOWN: 'UNKNOWN',
    });
    const RISK_SET = new Set(Object.values(RISK));

    const STATUS = Object.freeze({
        PENDING:  'PENDING',
        ACCEPTED: 'ACCEPTED',
        REJECTED: 'REJECTED',
        ON_HOLD:  'ON_HOLD',
    });
    const STATUS_SET = new Set(Object.values(STATUS));

    // String length caps — prevents pathological inputs from breaking
    // panel layout or stalling rendering. Generous enough for realistic
    // operational text, strict enough that nothing pasted from elsewhere
    // (a wall of text, a JSON blob, etc.) can land on the panel.
    const MAX_ID_LEN     = 80;
    const MAX_SOURCE_LEN = 80;
    const MAX_TEXT_LEN   = 500;
    const MAX_AFFECTED   = 100;

    // ── Type guards ────────────────────────────────────────────────
    function isString(x)         { return typeof x === 'string'; }
    function isNonEmptyString(x) { return isString(x) && x.trim().length > 0; }
    function isPlainObject(x)    { return x != null && typeof x === 'object' && !Array.isArray(x); }
    function isFiniteNumber(x)   { return typeof x === 'number' && Number.isFinite(x); }
    function isPrimitive(x) {
        return x === null
            || typeof x === 'string'
            || typeof x === 'number'
            || typeof x === 'boolean';
    }

    function clipString(s, max) {
        const t = String(s).trim();
        return t.length <= max ? t : t.slice(0, max);
    }

    function formatDtg(d) {
        // Same fallback chain as the rest of the shell modules — prefer
        // the standard Zulu DTG, ISO string is the universal fallback.
        if (window.AppShellClock && typeof window.AppShellClock.formatZuluDtg === 'function') {
            try { return window.AppShellClock.formatZuluDtg(d); } catch (_) { /* fall through */ }
        }
        return d.toISOString();
    }

    // ── Sanitizers ─────────────────────────────────────────────────
    function sanitizeAffectedUnits(au) {
        if (!Array.isArray(au)) return [];
        // String entries only. Each entry trimmed + clipped. Final array
        // capped at MAX_AFFECTED to keep the panel render bounded.
        const out = [];
        for (const v of au) {
            if (!isString(v)) continue;
            const t = v.trim();
            if (!t) continue;
            out.push(t.slice(0, MAX_TEXT_LEN));
            if (out.length >= MAX_AFFECTED) break;
        }
        return out;
    }

    function sanitizeMetadata(m) {
        // Shallow primitives only. Reject:
        //   - nested objects (no recursion — no way to smuggle deep refs)
        //   - arrays (caller should put list semantics in affectedUnits)
        //   - functions (would be a script-injection vector)
        //   - DOM nodes (would retain references to map / panels)
        //   - class instances / Maps / Sets / typed arrays
        //   - circular references (cannot reach here — primitives don't have them)
        //   - symbol keys
        if (!isPlainObject(m)) return {};
        const out = {};
        for (const k of Object.keys(m)) {
            const v = m[k];
            if (!isPrimitive(v)) continue;                              // drop anything non-primitive
            if (isString(v))     out[k] = v.slice(0, MAX_TEXT_LEN);     // clip strings same as other text fields
            else                 out[k] = v;
        }
        return out;
    }

    // ── Validation ─────────────────────────────────────────────────
    function validateProposal(input) {
        const errors = [];

        if (!isPlainObject(input)) {
            return { valid: false, errors: ['proposal must be a plain object'], normalized: null };
        }

        // Required strings
        if (!isNonEmptyString(input.id))             errors.push('id required (non-empty string)');
        if (!isNonEmptyString(input.source))         errors.push('source required (non-empty string)');
        if (!isNonEmptyString(input.summary))        errors.push('summary required (non-empty string)');
        if (!isNonEmptyString(input.expectedEffect)) errors.push('expectedEffect required (non-empty string)');

        // Optional createdAt — accept only string if provided
        if (input.createdAt != null && !isString(input.createdAt)) {
            errors.push('createdAt must be string if provided');
        }

        // Confidence — null or finite number in [0, 1]
        if (input.confidence != null) {
            if (!isFiniteNumber(input.confidence)) {
                errors.push('confidence must be null or a finite number in [0, 1]');
            } else if (input.confidence < 0 || input.confidence > 1) {
                errors.push('confidence out of range [0, 1]');
            }
        }

        // affectedUnits — array of strings if provided
        if (input.affectedUnits != null) {
            if (!Array.isArray(input.affectedUnits)) {
                errors.push('affectedUnits must be an array of strings');
            } else if (!input.affectedUnits.every(v => isString(v))) {
                errors.push('affectedUnits must contain only strings');
            }
        }

        // Risk + status — must be in their closed sets if provided
        if (input.risk != null && !RISK_SET.has(input.risk)) {
            errors.push('risk must be LOW | MEDIUM | HIGH | UNKNOWN');
        }
        if (input.status != null && !STATUS_SET.has(input.status)) {
            errors.push('status must be PENDING | ACCEPTED | REJECTED | ON_HOLD');
        }

        // Metadata — plain object only (sanitization happens later)
        if (input.metadata != null && !isPlainObject(input.metadata)) {
            errors.push('metadata must be a plain object');
        }

        // Circular reference / non-serializable check. We do this last
        // because the earlier checks already reject most pathological
        // shapes. A circular ref would also fail JSON.stringify, so this
        // is the catch-all for anything that slipped through.
        try {
            JSON.stringify(input);
        } catch (_) {
            errors.push('proposal contains circular reference or non-serializable content');
        }

        if (errors.length) {
            return { valid: false, errors, normalized: null };
        }
        return { valid: true, errors: [], normalized: doNormalize(input) };
    }

    // ── Normalization (defensive copy) ─────────────────────────────
    function doNormalize(input) {
        // Closed field set — anything not listed here is dropped, which
        // is the primary defense against forbidden fields like
        // `casualties`, `detections`, `weapons`, `engagement`, etc.
        return {
            id:             clipString(input.id,             MAX_ID_LEN),
            source:         clipString(input.source,         MAX_SOURCE_LEN),
            createdAt:      (isString(input.createdAt) && input.createdAt) ? input.createdAt : formatDtg(new Date()),
            confidence:     isFiniteNumber(input.confidence) ? input.confidence : null,
            summary:        clipString(input.summary,        MAX_TEXT_LEN),
            affectedUnits:  sanitizeAffectedUnits(input.affectedUnits),
            expectedEffect: clipString(input.expectedEffect, MAX_TEXT_LEN),
            risk:           RISK_SET.has(input.risk)     ? input.risk     : RISK.UNKNOWN,
            status:         STATUS_SET.has(input.status) ? input.status   : STATUS.PENDING,
            isSample:       input.isSample === true,
            metadata:       sanitizeMetadata(input.metadata),
        };
    }

    function normalizeProposal(input) {
        const r = validateProposal(input);
        return r.valid ? r.normalized : null;
    }

    // ── Sample factory ─────────────────────────────────────────────
    // Replaces the previous in-panel sample. Every dynamic field is
    // explicitly tagged "(sample, not connected)" so it cannot be
    // mistaken for a real recommendation. No combat content.
    function createSampleProposal() {
        // PR-121: Richer mock content for offline operator workflow rehearsal.
        // All fields are clearly tagged [SAMPLE]. No combat data. No real
        // recommendation. isSample:true and metadata.note are preserved so
        // the panel, bridge, and journal all treat this as a training object.
        return doNormalize({
            id:             'PROP-SAMPLE-001',
            source:         'sample-advisor',
            createdAt:      formatDtg(new Date()),
            confidence:     0.72,
            summary:        '[SAMPLE] Reposition B-SSM to improve coverage of the northern axis during the rehearsal.',
            affectedUnits:  ['B-SSM'],
            expectedEffect: '[SAMPLE] Improves readability of the decision workflow only. No scenario state is changed.',
            risk:           RISK.MEDIUM,
            status:         STATUS.PENDING,
            isSample:       true,
            metadata:       { note: 'sample, not connected', mock: true, offline: true, dryRunOnly: true },
        });
    }

    window.AppShellAIProposalContract = {
        normalizeProposal,
        validateProposal,
        createSampleProposal,
        RISK,
        STATUS,
        // Surfaced for tests / future inspectors. NOT a public API for
        // callers — they should always go through normalizeProposal.
        _internal: { sanitizeMetadata, sanitizeAffectedUnits, clipString },
    };
})();
