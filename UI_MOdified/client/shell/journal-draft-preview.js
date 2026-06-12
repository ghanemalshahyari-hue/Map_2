/**
 * Operational shell — Journal Draft Preview (read-only).
 *
 * PR-15. Renders the journal-contract draft that *would* be written
 * if the future real journal were enabled. Read-only by design — no
 * file write, no export, no download, no fetch, no persistence.
 *
 * Strict invariants:
 *   1. NEVER writes a file. The module has no `Blob`,
 *      `URL.createObjectURL`, `download` link, no save-as path.
 *   2. NEVER persists. No `localStorage`, no `sessionStorage`, no
 *      `IndexedDB`, no fetch / XHR / sendBeacon.
 *   3. NEVER mutates the PR-13 Decision Record itself. The record
 *      is read via `AppShellDecisionJournal.list()[0]`, which is
 *      already a defensive copy.
 *   4. JSON output is set via `<pre>.textContent` only — never
 *      `innerHTML`. The browser cannot interpret it as markup.
 *   5. NEVER changes ALLOWED_MODES. The contract's gate is
 *      untouched; this module is a passive consumer.
 *
 * Bridge: window.AppShellJournalDraftPreview
 *   previewLatest()   – render preview of the newest decision record
 *   clearPreview()    – wipe DOM + local "last id" pointer
 *   getState()        – { hasPreview, lastSourceRecordId, lastPreviewAt }
 */
(function () {
    'use strict';

    // ── Local state — for getState() inspection only ──────────────
    let state = {
        hasPreview:          false,
        lastSourceRecordId:  null,
        lastPreviewAt:       null,
    };
    function setState(patch) { state = Object.assign({}, state, patch); }

    // ── Helpers ────────────────────────────────────────────────────
    const $ = (id) => document.getElementById(id);

    function tr(key, fallback) {
        if (typeof window.t === 'function' && key) {
            const v = window.t(key);
            if (typeof v === 'string' && v && v !== key) return v;
        }
        return fallback;
    }

    function getJournal()  { return window.AppShellDecisionJournal; }
    function getContract() { return window.AppShellJournalContract; }
    function getEventLog() { return window.AppShellEventLog; }

    function logRow(severity, messageKey, fallback, payload) {
        const log = getEventLog();
        if (!log || typeof log.append !== 'function') return;
        try {
            log.append({
                severity,
                category:    'UI',                                  // closed-set; PR-6 gate
                source:      'journal-draft-preview',
                messageKey,
                message:     fallback,
                payload:     (payload && typeof payload === 'object') ? payload : undefined,
            });
        } catch (_) { /* never throw */ }
    }

    // ── DOM helpers ───────────────────────────────────────────────
    function setEmpty(textKey, textFallback) {
        const empty = $('dr-preview-empty');
        const body  = $('dr-preview-body');
        if (body) {
            body.setAttribute('hidden', '');
            body.textContent = '';
        }
        if (empty) {
            empty.removeAttribute('hidden');
            empty.setAttribute('data-i18n', textKey);
            empty.textContent = tr(textKey, textFallback);
        }
    }
    function setBodyJson(draft) {
        const empty = $('dr-preview-empty');
        const body  = $('dr-preview-body');
        if (empty) empty.setAttribute('hidden', '');
        if (body) {
            body.removeAttribute('hidden');
            // textContent — NEVER innerHTML. The browser treats every
            // character literally; no markup, scripts, or event
            // handlers can be smuggled through this path.
            body.textContent = JSON.stringify(draft, null, 2);
        }
    }
    function updatePreviewButtonState() {
        const btn = $('dr-preview-latest-btn');
        if (!btn) return;
        const journal = getJournal();
        const hasRecords = !!(journal && typeof journal.list === 'function' && journal.list().length > 0);
        btn.disabled = !hasRecords;
        btn.setAttribute('aria-disabled', hasRecords ? 'false' : 'true');
    }

    // PR-16: the Copy button is enabled iff a preview has actually
    // been rendered (state.hasPreview === true). The Copy operation
    // copies the exact <pre>.textContent — nothing else.
    function updateCopyButtonState() {
        const btn = $('dr-preview-copy-btn');
        if (!btn) return;
        const on = !!state.hasPreview;
        btn.disabled = !on;
        btn.setAttribute('aria-disabled', on ? 'false' : 'true');
    }

    // PR-16: transient inline status next to the buttons. Auto-clears
    // after ~1.6 s so it doesn't linger. Pure visual feedback — the
    // authoritative record is the Event Log row this module appends.
    let copyStatusTimer = null;
    function setCopyStatus(kind, textKey, textFallback) {
        const el = $('dr-preview-copy-status');
        if (!el) return;
        if (copyStatusTimer) { clearTimeout(copyStatusTimer); copyStatusTimer = null; }
        if (!kind) {
            el.setAttribute('hidden', '');
            el.removeAttribute('data-state');
            el.textContent = '';
            return;
        }
        el.removeAttribute('hidden');
        el.setAttribute('data-state', kind);                        // 'ok' | 'err'
        el.setAttribute('data-i18n', textKey);
        el.textContent = tr(textKey, textFallback);
        copyStatusTimer = setTimeout(() => { try { setCopyStatus(null); } catch (_) {} }, 1600);
    }

    // ── Public bridge methods ─────────────────────────────────────
    function previewLatest() {
        const journal = getJournal();
        if (!journal || typeof journal.list !== 'function') {
            setEmpty('dr-preview-empty-text', 'No preview available');
            setState({ hasPreview: false });
            return null;
        }
        const list = journal.list();
        if (!list.length) {
            setEmpty('dr-preview-empty-text', 'No preview available');
            setState({ hasPreview: false });
            return null;
        }
        const record  = list[0];                                    // defensive copy (PR-13)
        const contract = getContract();
        if (!contract || typeof contract.createDraftFromDecisionRecord !== 'function') {
            // Contract module missing — log + safely show empty state.
            logRow('WARNING', 'elog-evt-journal-preview-failed', 'Journal draft preview failed', {
                reason: 'contract module missing',
            });
            setEmpty('dr-preview-failed-text', 'Draft validation failed');
            setState({ hasPreview: false });
            return null;
        }
        const draft = contract.createDraftFromDecisionRecord(record);
        if (!draft) {
            // Contract rejected the record. The contract's own
            // validator already logged a UI/WARNING from the
            // journal-contract source — we add our own from the
            // preview source so the operator sees both perspectives.
            logRow('WARNING', 'elog-evt-journal-preview-failed', 'Journal draft preview failed', {
                sourceRecordId: record.id || null,
                reason:         'contract rejected record',
            });
            setEmpty('dr-preview-failed-text', 'Draft validation failed');
            setState({ hasPreview: false, lastSourceRecordId: record.id || null });
            return null;
        }

        setBodyJson(draft);
        setState({
            hasPreview:         true,
            lastSourceRecordId: record.id || null,
            lastPreviewAt:      Date.now(),
        });
        logRow('NOTICE', 'elog-evt-journal-preview-generated', 'Journal draft preview generated', {
            sourceRecordId: record.id || null,
            draftId:        draft.id || null,
        });
        updateCopyButtonState();                                    // PR-16
        setCopyStatus(null);                                        // PR-16: clear any stale status from a prior cycle
        return draft;
    }

    function clearPreview() {
        // Wipe the visible JSON; restore the default empty hint.
        setEmpty('dr-preview-empty-text', 'No preview available');
        setState({ hasPreview: false, lastSourceRecordId: null });
        // Note: we do NOT touch AppShellDecisionJournal. Clearing the
        // preview is local to this module.
        updateCopyButtonState();                                    // PR-16
        setCopyStatus(null);                                        // PR-16
    }

    // ── PR-16: Copy preview JSON to clipboard ─────────────────────
    // Reads `<pre>.textContent` (exactly what the operator sees) and
    // calls navigator.clipboard.writeText. NO file fallback. NO Blob.
    // NO URL.createObjectURL. NO <a download>. NO localStorage write.
    // If the clipboard API is unavailable or denied, we log a single
    // UI/WARNING row and show a transient "Copy failed" chip.
    function copyPreview() {
        const body = $('dr-preview-body');
        if (!body || body.hasAttribute('hidden') || !state.hasPreview) {
            // Defensive — shouldn't happen because the button is
            // disabled, but a programmatic caller could still hit
            // this path. Treat as a benign failure.
            logRow('WARNING', 'elog-evt-journal-preview-copy-failed', 'Journal draft preview copy failed', {
                reason: 'no preview available',
            });
            setCopyStatus('err', 'dr-preview-copy-failed', 'Copy failed');
            return Promise.resolve(null);
        }

        const text = body.textContent || '';

        if (!navigator || !navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
            // Clipboard API not available (insecure context, missing
            // permission policy, etc.). The brief forbids a file/
            // download fallback — we just surface the warning.
            logRow('WARNING', 'elog-evt-journal-preview-copy-failed', 'Journal draft preview copy failed', {
                reason: 'clipboard API unavailable',
            });
            setCopyStatus('err', 'dr-preview-copy-failed', 'Copy failed');
            return Promise.resolve(null);
        }

        // Single async write. The Promise resolves on success or
        // rejects on permission denial / runtime failure.
        return navigator.clipboard.writeText(text).then(() => {
            logRow('NOTICE', 'elog-evt-journal-preview-copied', 'Journal draft preview copied', {
                sourceRecordId: state.lastSourceRecordId || null,
                byteLength:     text.length,                        // length only — never the content
            });
            setCopyStatus('ok', 'dr-preview-copied', 'Preview copied');
            return true;
        }).catch((e) => {
            logRow('WARNING', 'elog-evt-journal-preview-copy-failed', 'Journal draft preview copy failed', {
                reason: String((e && e.message) || e).slice(0, 120),
            });
            setCopyStatus('err', 'dr-preview-copy-failed', 'Copy failed');
            return null;
        });
    }

    function getState() { return Object.assign({}, state); }

    // ── Wiring ────────────────────────────────────────────────────
    function bindButtons() {
        const previewBtn = $('dr-preview-latest-btn');
        const clearBtn   = $('dr-preview-clear-btn');
        const copyBtn    = $('dr-preview-copy-btn');                // PR-16
        if (previewBtn) previewBtn.addEventListener('click', () => previewLatest());
        if (clearBtn)   clearBtn.addEventListener('click',   () => clearPreview());
        if (copyBtn)    copyBtn.addEventListener('click',    () => copyPreview());
    }
    function bindRecordListener() {
        // Enable/disable the Preview-latest button when the PR-13
        // record count changes. We do NOT auto-regenerate — the
        // operator must click to refresh.
        document.addEventListener('rmooz:ai-proposal-decision-journal-changed', () => {
            try { updatePreviewButtonState(); } catch (_) { /* never throw */ }
        });
    }
    function bindLanguageChain() {
        const prev = window.onLanguageChange;
        window.onLanguageChange = function (lang) {
            try {
                // Re-render the empty-state text under its current key.
                const empty = $('dr-preview-empty');
                if (empty && !empty.hasAttribute('hidden')) {
                    const k = empty.getAttribute('data-i18n') || 'dr-preview-empty-text';
                    empty.textContent = tr(k, k);
                }
                // PR-16: re-render the transient copy status if it's
                // currently visible.
                const cs = $('dr-preview-copy-status');
                if (cs && !cs.hasAttribute('hidden')) {
                    const ck = cs.getAttribute('data-i18n');
                    if (ck) cs.textContent = tr(ck, ck);
                }
            } catch (_) { /* never throw */ }
            if (typeof prev === 'function') {
                try { prev(lang); } catch (_) { /* never throw */ }
            }
        };
    }

    function init() {
        if (!$('dr-preview')) return;
        bindButtons();
        bindRecordListener();
        bindLanguageChain();
        // Initial state — empty until the operator clicks Preview.
        clearPreview();
        updatePreviewButtonState();
        updateCopyButtonState();                                    // PR-16
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    window.AppShellJournalDraftPreview = {
        previewLatest,
        clearPreview,
        copyPreview,                                                // PR-16
        getState,
    };
})();
