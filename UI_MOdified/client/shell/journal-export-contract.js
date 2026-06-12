/**
 * Operational shell — Journal Export Contract (validator only).
 *
 * PR-17. Defines the shape of a future "journal export preview"
 * package and validates it through PR-14's per-entry contract. THIS
 * PR DOES NOT EXPORT OR DOWNLOAD ANYTHING. No Blob, no <a download>,
 * no URL.createObjectURL, no fetch, no localStorage, no IndexedDB.
 *
 * Strict invariants:
 *   1. NEVER produces a file or download. The module has no
 *      `Blob`, `URL.createObjectURL`, `<a download>`, `link.click()`,
 *      `saveAs`, `execCommand`, `fetch`, `XMLHttpRequest`,
 *      `sendBeacon`, `localStorage`, `sessionStorage`, `IndexedDB`
 *      references — only the docstring mentions them as forbidden.
 *   2. Closed-set `type`, `mode`, `app`, `schemaVersion` — only one
 *      legal value each in PR-17. A future PR opening real export
 *      will need an explicit, auditable change to expand the gates.
 *   3. Five hard-locked safety flags: realJournalEnabled,
 *      fileWritten, downloadCreated, backendCalled, stateMutation.
 *      Each must be exactly `false`. The validator does NOT patch
 *      these — a `true` value rejects the whole package.
 *   4. Every entry must pass PR-14 `validateJournalEntry()` —
 *      ensures only DRY_RUN / committed:false entries can enter
 *      the export package shape.
 *   5. counts.committed is hard-locked to 0; counts.entries +
 *      counts.dryRun must match entries.length.
 *
 * Bridge: window.AppShellJournalExportContract
 *   validateExportPackage(input)           – { valid, errors, normalized }
 *   normalizeExportPackage(input)          – normalized | null
 *   createPreviewExportPackage(entries)    – build + validate + return | null
 *   SCHEMA_VERSION                         – 'journal-export-preview-v1'
 *   TYPE, MODE                             – frozen enum constants
 */
(function () {
    'use strict';

    // ── Closed-set constants ──────────────────────────────────────
    const APP            = 'RMOOZ';
    const SCHEMA_VERSION = 'journal-export-preview-v1';

    const TYPE = Object.freeze({ JOURNAL_EXPORT_PREVIEW: 'JOURNAL_EXPORT_PREVIEW' });
    const TYPE_SET = new Set(Object.values(TYPE));

    const MODE = Object.freeze({ PREVIEW_ONLY: 'PREVIEW_ONLY' });
    const MODE_SET = new Set(Object.values(MODE));

    // Caps — defensive.
    const MAX_ID_LEN  = 80;
    const MAX_TS_LEN  = 40;
    const MAX_ENTRIES = 1000;                                       // bounded — a real export PR would set its own cap

    // ── Helpers ────────────────────────────────────────────────────
    function isString(x)         { return typeof x === 'string'; }
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

    // Monotonic id seed — lives only for the page lifetime.
    let nextSeq = 1;
    function synthesizeId() { return 'JE-' + Date.now().toString(36) + '-' + (nextSeq++).toString(36); }

    // ── Logging ───────────────────────────────────────────────────
    function logValidated(id, count) {
        try {
            if (window.AppShellEventLog && typeof window.AppShellEventLog.append === 'function') {
                window.AppShellEventLog.append({
                    severity:    'NOTICE',
                    category:    'UI',                              // PR-6 closed-set; never AI/SIM/SCENARIO
                    source:      'journal-export-contract',
                    messageKey:  'elog-evt-journal-export-validated',
                    message:     'Journal export preview package validated',
                    payload:     { id: id || null, entryCount: count == null ? 0 : count },
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
                    source:      'journal-export-contract',
                    messageKey:  'elog-evt-journal-export-rejected',
                    message:     'Journal export preview package rejected',
                    payload: {
                        errorCount: Array.isArray(errors) ? errors.length : 0,
                        firstError: (Array.isArray(errors) && errors.length) ? String(errors[0]).slice(0, 120) : null,
                    },
                });
            }
        } catch (_) { /* never throw */ }
    }

    // ── Per-entry validation (delegates to PR-14) ─────────────────
    function validateEachEntry(entries, errors) {
        const validated = [];
        if (!Array.isArray(entries)) {
            errors.push('entries must be an array');
            return null;
        }
        if (entries.length > MAX_ENTRIES) {
            errors.push('entries exceeds MAX_ENTRIES (' + MAX_ENTRIES + ')');
            return null;
        }
        const PR14 = window.AppShellJournalContract;
        if (!PR14 || typeof PR14.validateJournalEntry !== 'function') {
            errors.push('PR-14 contract module missing — cannot validate entries');
            return null;
        }
        for (let i = 0; i < entries.length; i++) {
            const r = PR14.validateJournalEntry(entries[i]);
            if (!r.valid) {
                errors.push('entry[' + i + ']: ' + (r.errors[0] || 'invalid'));
                continue;
            }
            // Additional belt-and-braces: PR-14 already enforces
            // mode:'DRY_RUN' and committed:false, but the export
            // contract spells the same rules out here so a future
            // PR-14 change can't silently widen this gate.
            if (r.normalized.mode !== 'DRY_RUN') {
                errors.push('entry[' + i + ']: only DRY_RUN entries allowed');
            }
            if (r.normalized.committed !== false) {
                errors.push('entry[' + i + ']: committed entries are not allowed');
            }
            validated.push(r.normalized);
        }
        if (errors.length) return null;
        return validated;
    }

    // ── Validation ────────────────────────────────────────────────
    function validateExportPackage(input) {
        const errors = [];

        if (!isPlainObject(input)) {
            return { valid: false, errors: ['package must be a plain object'], normalized: null };
        }

        // Closed-set identifiers
        if (!TYPE_SET.has(input.type))     errors.push('type must be JOURNAL_EXPORT_PREVIEW');
        if (!MODE_SET.has(input.mode))     errors.push('mode must be PREVIEW_ONLY');
        if (input.app !== APP)             errors.push('app must be "' + APP + '"');
        if (input.schemaVersion !== SCHEMA_VERSION) errors.push('schemaVersion must be "' + SCHEMA_VERSION + '"');

        // Optional id / createdAt — strings if provided
        if (input.id != null && !isString(input.id))               errors.push('id must be string if provided');
        if (input.createdAt != null && !isString(input.createdAt)) errors.push('createdAt must be string if provided');

        // Entries — PR-14 chain validation
        const validatedEntries = validateEachEntry(input.entries, errors);

        // Counts — must match entries length, committed locked to 0
        const counts = input.counts;
        if (!isPlainObject(counts)) {
            errors.push('counts required (object)');
        } else {
            const len = validatedEntries ? validatedEntries.length : (Array.isArray(input.entries) ? input.entries.length : 0);
            if (counts.entries   !== len) errors.push('counts.entries must equal entries.length (' + len + ')');
            if (counts.committed !== 0)   errors.push('counts.committed must be exactly 0');
            if (counts.dryRun    !== len) errors.push('counts.dryRun must equal entries.length (' + len + ')');
        }

        // Safety — five hard-locked flags
        const safety = input.safety;
        if (!isPlainObject(safety)) {
            errors.push('safety required (object)');
        } else {
            if (safety.realJournalEnabled !== false) errors.push('safety.realJournalEnabled must be exactly false');
            if (safety.fileWritten        !== false) errors.push('safety.fileWritten must be exactly false');
            if (safety.downloadCreated    !== false) errors.push('safety.downloadCreated must be exactly false');
            if (safety.backendCalled      !== false) errors.push('safety.backendCalled must be exactly false');
            if (safety.stateMutation      !== false) errors.push('safety.stateMutation must be exactly false');
        }

        // Optional top-level metadata (shallow primitives only).
        // Sanitization happens at normalization; here we only check
        // that it's a plain object if present.
        if (input.metadata != null && !isPlainObject(input.metadata)) {
            errors.push('metadata must be a plain object if provided');
        }

        // Circular / non-serializable check.
        try { JSON.stringify(input); } catch (_) {
            errors.push('package contains circular reference or non-serializable content');
        }

        if (errors.length) {
            logRejected(errors);
            return { valid: false, errors, normalized: null };
        }

        const normalized = doNormalize(input, validatedEntries);
        logValidated(normalized.id, normalized.entries.length);
        return { valid: true, errors: [], normalized };
    }

    // ── Normalization (defensive copy) ────────────────────────────
    function doNormalize(input, validatedEntries) {
        return {
            id:            isString(input.id) && input.id ? clip(input.id, MAX_ID_LEN) : synthesizeId(),
            type:          TYPE.JOURNAL_EXPORT_PREVIEW,
            mode:          MODE.PREVIEW_ONLY,
            createdAt:     isString(input.createdAt) && input.createdAt ? clip(input.createdAt, MAX_TS_LEN) : formatDtg(new Date()),
            app:           APP,
            schemaVersion: SCHEMA_VERSION,
            entries:       validatedEntries.slice(),                // defensive copy
            counts: {
                entries:   validatedEntries.length,
                committed: 0,
                dryRun:    validatedEntries.length,
            },
            safety: {
                realJournalEnabled: false,
                fileWritten:        false,
                downloadCreated:    false,
                backendCalled:      false,
                stateMutation:      false,
            },
            metadata: sanitizeMetadata(input.metadata),
        };
    }

    function sanitizeMetadata(m) {
        // Shallow primitives only. Always include the spec
        // identifiers; caller cannot override them.
        const out = { app: APP, schemaVersion: SCHEMA_VERSION };
        if (!isPlainObject(m)) return out;
        for (const k of Object.keys(m)) {
            if (k === 'app' || k === 'schemaVersion') continue;
            const v = m[k];
            if (!isPrimitive(v)) continue;
            out[k] = isString(v) ? v.slice(0, 240) : v;
        }
        return out;
    }

    function normalizeExportPackage(input) {
        const r = validateExportPackage(input);
        return r.valid ? r.normalized : null;
    }

    // ── createPreviewExportPackage — convenience factory ─────────
    // Build a package from an array of draft entries (PR-14 shape).
    // The factory validates each entry via PR-14, builds the
    // package, and validates the whole thing again at the export
    // level. Returns the normalized package or null.
    //
    // The returned object is NOT stored anywhere by this module.
    // The caller MUST treat it as a transient preview value. PR-17
    // has no UI that displays the package; it is contract surface
    // for a future PR.
    function createPreviewExportPackage(draftEntries) {
        const list = Array.isArray(draftEntries) ? draftEntries.slice(0, MAX_ENTRIES) : [];
        const pkg = {
            id:            synthesizeId(),
            type:          TYPE.JOURNAL_EXPORT_PREVIEW,
            mode:          MODE.PREVIEW_ONLY,
            createdAt:     formatDtg(new Date()),
            app:           APP,
            schemaVersion: SCHEMA_VERSION,
            entries:       list,
            counts: {
                entries:   list.length,
                committed: 0,
                dryRun:    list.length,
            },
            safety: {
                realJournalEnabled: false,
                fileWritten:        false,
                downloadCreated:    false,
                backendCalled:      false,
                stateMutation:      false,
            },
            metadata: { app: APP, schemaVersion: SCHEMA_VERSION, derivedFrom: 'preview-factory' },
        };
        return normalizeExportPackage(pkg);
    }

    window.AppShellJournalExportContract = {
        validateExportPackage,
        normalizeExportPackage,
        createPreviewExportPackage,
        SCHEMA_VERSION,
        TYPE,
        MODE,
        // Exposed for tests / inspectors only — not a public API.
        _internal: { sanitizeMetadata, doNormalize, MAX_ENTRIES },
    };
})();
