/**
 * Operational shell — Journal Export Package Preview (read-only).
 *
 * PR-18. Renders the PR-17 JOURNAL_EXPORT_PREVIEW package built from
 * the current PR-13 decision records (each mapped to a PR-14 draft).
 * Read-only by design — no file write, no download, no export, no
 * fetch, no persistence. The `<pre>` body is the only render target.
 *
 * Strict invariants:
 *   1. NEVER writes a file. The module has no `Blob`,
 *      `URL.createObjectURL`, `<a download>`, `link.click()`,
 *      `saveAs`, or any save-as path.
 *   2. NEVER persists. No `localStorage`, no `sessionStorage`, no
 *      `IndexedDB`, no fetch / XHR / sendBeacon.
 *   3. NEVER mutates Decision Records. Reads `list()` (already a
 *      defensive copy in PR-13). Never touches the records back.
 *   4. JSON output uses `<pre>.textContent` only — NEVER innerHTML.
 *   5. NEVER changes PR-14 ALLOWED_MODES or PR-17 TYPE/MODE gates.
 *      This module is a passive consumer of both contracts.
 *
 * Bridge: window.AppShellJournalExportPreview
 *   previewPackage()   – build + render package from current records
 *   clearPreview()     – wipe DOM + local state pointer
 *   getState()         – { hasPreview, lastPackageId, lastPreviewAt }
 */
(function () {
    'use strict';

    let state = {
        hasPreview:    false,
        lastPackageId: null,
        lastPreviewAt: null,
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

    function getJournal()        { return window.AppShellDecisionJournal; }
    function getEntryContract()  { return window.AppShellJournalContract; }
    function getExportContract() { return window.AppShellJournalExportContract; }
    function getEventLog()       { return window.AppShellEventLog; }

    function logRow(severity, messageKey, fallback, payload) {
        const log = getEventLog();
        if (!log || typeof log.append !== 'function') return;
        try {
            log.append({
                severity,
                category:    'UI',                                  // PR-6 closed-set; never AI/SIM/SCENARIO
                source:      'journal-export-preview',
                messageKey,
                message:     fallback,
                payload:     (payload && typeof payload === 'object') ? payload : undefined,
            });
        } catch (_) { /* never throw */ }
    }

    // ── DOM helpers ───────────────────────────────────────────────
    function setEmpty(textKey, textFallback) {
        const empty = $('dr-export-empty');
        const body  = $('dr-export-body');
        if (body) {
            body.setAttribute('hidden', '');
            body.textContent = '';                                  // textContent only
        }
        if (empty) {
            empty.removeAttribute('hidden');
            empty.setAttribute('data-i18n', textKey);
            empty.textContent = tr(textKey, textFallback);
        }
    }
    function setBodyJson(pkg) {
        const empty = $('dr-export-empty');
        const body  = $('dr-export-body');
        if (empty) empty.setAttribute('hidden', '');
        if (body) {
            body.removeAttribute('hidden');
            // textContent — NEVER innerHTML. The browser treats every
            // character literally; no HTML parsing, no script eval.
            body.textContent = JSON.stringify(pkg, null, 2);
        }
    }
    function updatePreviewButtonState() {
        const btn = $('dr-export-preview-btn');
        if (!btn) return;
        const journal = getJournal();
        const hasRecords = !!(journal && typeof journal.list === 'function' && journal.list().length > 0);
        btn.disabled = !hasRecords;
        btn.setAttribute('aria-disabled', hasRecords ? 'false' : 'true');
    }

    // PR-19: Copy button is enabled iff a package preview is rendered
    // (state.hasPreview === true). The copy operation reads the exact
    // <pre>.textContent — nothing else.
    function updateCopyButtonState() {
        const btn = $('dr-export-copy-btn');
        if (!btn) return;
        const on = !!state.hasPreview;
        btn.disabled = !on;
        btn.setAttribute('aria-disabled', on ? 'false' : 'true');
    }

    // PR-21: Download button is enabled iff:
    //   1. a package preview exists (state.hasPreview === true), AND
    //   2. AppShellJournalDownloadGuard.isAllowed() === true.
    // Since PR-20 ships the guard locked-by-design, the second
    // condition is always false in PR-21. The button stays disabled.
    // We do NOT add any actual download code here — the future PR
    // opening real download will add the code path AND lift the
    // guard lock in the same auditable diff.
    function downloadGuardAllowed() {
        try {
            if (window.AppShellJournalDownloadGuard && typeof window.AppShellJournalDownloadGuard.isAllowed === 'function') {
                return !!window.AppShellJournalDownloadGuard.isAllowed();
            }
        } catch (_) { /* ignore */ }
        return false;
    }
    function updateDownloadButtonState() {
        const btn = $('dr-export-download-btn');
        if (!btn) return;
        const hasPreview = !!state.hasPreview;
        const allowed    = downloadGuardAllowed();
        const enabled    = hasPreview && allowed;
        btn.disabled = !enabled;
        btn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
        // Mark the lock visually via a data-state attribute (CSS
        // colors the button red-tinted when guard-locked).
        btn.setAttribute('data-state', allowed ? 'ready' : 'locked');
    }

    // PR-19: transient inline status chip — same pattern as PR-16's
    // draft-copy status. Auto-clears after ~1.6 s; the Event Log row
    // is the authoritative record.
    let copyStatusTimer = null;
    function setCopyStatus(kind, textKey, textFallback) {
        const el = $('dr-export-copy-status');
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
    function previewPackage() {
        const journal = getJournal();
        if (!journal || typeof journal.list !== 'function') {
            setEmpty('dr-export-empty-text', 'No package preview available');
            setState({ hasPreview: false, lastPackageId: null });
            return null;
        }
        const records = journal.list();
        if (!records.length) {
            setEmpty('dr-export-empty-text', 'No package preview available');
            setState({ hasPreview: false, lastPackageId: null });
            return null;
        }

        // PR-14 chain — convert each record to a draft entry.
        const entryContract = getEntryContract();
        if (!entryContract || typeof entryContract.createDraftFromDecisionRecord !== 'function') {
            logRow('WARNING', 'elog-evt-journal-export-preview-failed', 'Journal export preview package failed', {
                reason: 'PR-14 contract module missing',
            });
            setEmpty('dr-export-failed-text', 'Journal export preview package failed');
            setState({ hasPreview: false });
            return null;
        }
        const drafts = [];
        for (let i = 0; i < records.length; i++) {
            const d = entryContract.createDraftFromDecisionRecord(records[i]);
            if (!d) {
                logRow('WARNING', 'elog-evt-journal-export-preview-failed', 'Journal export preview package failed', {
                    reason: 'PR-14 rejected record',
                    recordIndex: i,
                    recordId:    records[i] && records[i].id || null,
                });
                setEmpty('dr-export-failed-text', 'Journal export preview package failed');
                setState({ hasPreview: false });
                return null;
            }
            drafts.push(d);
        }

        // PR-17 chain — build + validate the package.
        const exportContract = getExportContract();
        if (!exportContract || typeof exportContract.createPreviewExportPackage !== 'function') {
            logRow('WARNING', 'elog-evt-journal-export-preview-failed', 'Journal export preview package failed', {
                reason: 'PR-17 contract module missing',
            });
            setEmpty('dr-export-failed-text', 'Journal export preview package failed');
            setState({ hasPreview: false });
            return null;
        }
        const pkg = exportContract.createPreviewExportPackage(drafts);
        if (!pkg) {
            logRow('WARNING', 'elog-evt-journal-export-preview-failed', 'Journal export preview package failed', {
                reason: 'PR-17 rejected package',
                entryCount: drafts.length,
            });
            setEmpty('dr-export-failed-text', 'Journal export preview package failed');
            setState({ hasPreview: false });
            return null;
        }

        setBodyJson(pkg);
        setState({
            hasPreview:    true,
            lastPackageId: pkg.id || null,
            lastPreviewAt: Date.now(),
        });
        logRow('NOTICE', 'elog-evt-journal-export-preview-generated', 'Journal export preview package generated', {
            packageId:   pkg.id || null,
            entryCount:  pkg.entries.length,
        });
        updateCopyButtonState();                                    // PR-19
        setCopyStatus(null);                                        // PR-19: clear stale chip from a prior cycle
        updateDownloadButtonState();                                // PR-21
        return pkg;
    }

    function clearPreview() {
        setEmpty('dr-export-empty-text', 'No package preview available');
        setState({ hasPreview: false, lastPackageId: null });
        // We do NOT touch AppShellDecisionJournal.
        updateCopyButtonState();                                    // PR-19
        setCopyStatus(null);                                        // PR-19
        updateDownloadButtonState();                                // PR-21
    }

    // ── PR-21: Download package (UI scaffold only) ────────────────
    // The Download button is the future mounting point for real
    // export download. PR-21 only wires the button + a defensive
    // bridge method. No actual download function is implemented.
    // The bridge consults the PR-20 guard; if not allowed, logs a
    // single UI/WARNING row and returns null. The PR-20 lock means
    // this is the only branch reachable in PR-21.
    //
    // NO Blob. NO URL.createObjectURL. NO <a download>. NO
    // link.click(). NO file API. NO localStorage write. NO fetch.
    function downloadPackage() {
        if (!downloadGuardAllowed()) {
            // Log via the PR-20 guard source (the brief specifies
            // source: 'journal-download-guard' so audit filters by
            // guard catch both the rejection and the click attempt).
            const log = getEventLog();
            if (log && typeof log.append === 'function') {
                try {
                    log.append({
                        severity:    'WARNING',
                        category:    'UI',                          // PR-6 closed-set; never AI/SIM/SCENARIO
                        source:      'journal-download-guard',
                        messageKey:  'elog-evt-download-blocked',
                        message:     'Download blocked by guard',
                        payload: {
                            hasPreview:   !!state.hasPreview,
                            packageId:    state.lastPackageId || null,
                            isAllowed:    false,
                        },
                    });
                } catch (_) { /* never throw */ }
            }
            return null;
        }
        // Guard says allowed — PR-21 STILL refuses to perform a
        // real download because there is no implementation. A
        // future PR will replace this branch with the actual
        // download path AND lift the PR-20 lock in the same diff.
        try { console.warn('[journal-export-preview] downloadPackage: guard allowed but no implementation in PR-21'); } catch (_) {}
        return null;
    }

    // ── PR-19: Copy package JSON to clipboard ─────────────────────
    // Reads exactly `<pre>.textContent` (what the operator can see)
    // and calls navigator.clipboard.writeText. NO file fallback. NO
    // Blob. NO URL.createObjectURL. NO <a download>. NO localStorage
    // write. NO execCommand fallback. If clipboard is missing or
    // denied, logs a single UI/WARNING row and shows a transient
    // "Package copy failed" chip.
    function copyPackagePreview() {
        const body = $('dr-export-body');
        if (!body || body.hasAttribute('hidden') || !state.hasPreview) {
            // Defensive — the button is disabled in this case, but
            // a programmatic caller could still reach here. Benign
            // failure path.
            logRow('WARNING', 'elog-evt-journal-export-preview-copy-failed', 'Journal export package preview copy failed', {
                reason: 'no package preview available',
            });
            setCopyStatus('err', 'dr-export-copy-failed', 'Package copy failed');
            return Promise.resolve(null);
        }

        const text = body.textContent || '';

        if (!navigator || !navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
            // Clipboard API unavailable (insecure context, blocked
            // permissions policy, etc.). The brief forbids any file
            // or download fallback — surface the warning and stop.
            logRow('WARNING', 'elog-evt-journal-export-preview-copy-failed', 'Journal export package preview copy failed', {
                reason: 'clipboard API unavailable',
            });
            setCopyStatus('err', 'dr-export-copy-failed', 'Package copy failed');
            return Promise.resolve(null);
        }

        return navigator.clipboard.writeText(text).then(() => {
            logRow('NOTICE', 'elog-evt-journal-export-preview-copied', 'Journal export package preview copied', {
                packageId:  state.lastPackageId || null,
                byteLength: text.length,                            // length only — never the content
            });
            setCopyStatus('ok', 'dr-export-copied', 'Package copied');
            return true;
        }).catch((e) => {
            logRow('WARNING', 'elog-evt-journal-export-preview-copy-failed', 'Journal export package preview copy failed', {
                reason: String((e && e.message) || e).slice(0, 120),
            });
            setCopyStatus('err', 'dr-export-copy-failed', 'Package copy failed');
            return null;
        });
    }

    function getState() { return Object.assign({}, state); }

    // ── Wiring ────────────────────────────────────────────────────
    function bindButtons() {
        const previewBtn  = $('dr-export-preview-btn');
        const clearBtn    = $('dr-export-clear-btn');
        const copyBtn     = $('dr-export-copy-btn');                // PR-19
        const downloadBtn = $('dr-export-download-btn');            // PR-21
        if (previewBtn)  previewBtn.addEventListener('click', () => previewPackage());
        if (clearBtn)    clearBtn.addEventListener('click',   () => clearPreview());
        if (copyBtn)     copyBtn.addEventListener('click',    () => copyPackagePreview());
        if (downloadBtn) downloadBtn.addEventListener('click',() => downloadPackage());
    }
    function bindRecordListener() {
        // Enable/disable the Preview button when the PR-13 record
        // count changes. We do NOT auto-regenerate — the operator
        // must click to refresh.
        document.addEventListener('rmooz:ai-proposal-decision-journal-changed', () => {
            try { updatePreviewButtonState(); } catch (_) { /* never throw */ }
        });
    }
    function bindGuardListener() {
        // PR-21: re-render the Download button state when the PR-20
        // guard state changes. In PR-21 the guard is locked-by-design
        // so this only fires for the initial broadcast — but the
        // listener is in place for the future PR that lifts the lock.
        document.addEventListener('rmooz:download-guard-state-changed', () => {
            try { updateDownloadButtonState(); } catch (_) { /* never throw */ }
        });
    }
    function bindLanguageChain() {
        const prev = window.onLanguageChange;
        window.onLanguageChange = function (lang) {
            try {
                const empty = $('dr-export-empty');
                if (empty && !empty.hasAttribute('hidden')) {
                    const k = empty.getAttribute('data-i18n') || 'dr-export-empty-text';
                    empty.textContent = tr(k, k);
                }
                // PR-19: re-render the transient copy chip if visible.
                const cs = $('dr-export-copy-status');
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
        if (!$('dr-export-preview')) return;
        bindButtons();
        bindRecordListener();
        bindGuardListener();                                        // PR-21
        bindLanguageChain();
        clearPreview();
        updatePreviewButtonState();
        updateCopyButtonState();                                    // PR-19
        updateDownloadButtonState();                                // PR-21
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    window.AppShellJournalExportPreview = {
        previewPackage,
        clearPreview,
        copyPackagePreview,                                         // PR-19
        downloadPackage,                                            // PR-21 — guarded, returns null
        getState,
    };
})();
