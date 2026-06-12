/**
 * Operational shell — Journal Download Guard (design + contract + state).
 *
 * PR-20. Declares the rule "download is forbidden in this build",
 * visualizes it via a status pill, and exposes the future opt-in API
 * surface. THIS PR DOES NOT IMPLEMENT DOWNLOAD. No actual download
 * function exists in this module — `triggerDownload` is deliberately
 * NOT in the bridge.
 *
 * Strict invariants:
 *   1. NEVER triggers a download. The module has no `Blob`,
 *      `URL.createObjectURL`, `<a download>`, `link.click()`, `save`,
 *      `saveAs`, `export`, `executeDownload`, or `triggerDownload`
 *      references — only invariant-asserting docstrings.
 *   2. NEVER calls backend. No `fetch` / `XMLHttpRequest` /
 *      `sendBeacon`. No `/api/sim/commit` string.
 *   3. NEVER persists. No `localStorage`, no `sessionStorage`, no
 *      `IndexedDB`. The state lives only in the closure variable
 *      and dies on page reload — same reset behavior as PR-11.
 *   4. `state.locked = true` at init. PR-20 ships locked-by-design.
 *      The validator rejects every `setEnabled(true)` call while
 *      locked. There is no `setLocked(false)` method — a future PR
 *      opening real download will need an explicit source edit.
 *   5. `isAllowed()` returns `state.enabled && !state.locked` —
 *      always `false` in PR-20. This is the gate the future
 *      download caller MUST check first.
 *
 * Bridge: window.AppShellJournalDownloadGuard
 *   getState()    – defensive-copy of { enabled, locked, lastError,
 *                                       lastAttemptAt, lastFailureAt, lastSuccessAt }
 *   setEnabled(on) – returns the resulting state.enabled (always
 *                    false in PR-20 because state.locked is true)
 *   isAllowed()   – returns enabled && !locked (always false in PR-20)
 *   STATUS        – frozen enum { DISABLED, READY, LOCKED, FAILED }
 *
 * Deliberately NOT exposed: triggerDownload, executeDownload,
 *                            beginExport, save, export, setLocked.
 */
(function () {
    'use strict';

    // ── Closed-set STATUS ─────────────────────────────────────────
    const STATUS = Object.freeze({
        DISABLED: 'DISABLED',                                       // guard is off (default-most state)
        READY:    'READY',                                          // future state: enabled && !locked
        LOCKED:   'LOCKED',                                         // PR-20 ships here: locked at build level
        FAILED:   'FAILED',                                          // most recent setEnabled attempt was rejected
    });

    // ── Initial state ─────────────────────────────────────────────
    // `locked: true` is the PR-20 hard-lock. The module exposes no
    // method to flip it — a future PR opening real download will
    // need to edit this line in source, which makes the transition
    // explicit and auditable.
    let state = {
        enabled:        false,
        locked:         true,
        lastError:      null,
        lastAttemptAt:  null,
        lastSuccessAt:  null,
        lastFailureAt:  null,
    };

    function setState(patch) {
        state = Object.assign({}, state, patch);
        // Broadcast for the PR-20 status pill (and any future
        // subscriber). UI-only event — same posture as PR-11's
        // service-state event. No simulation / AI / scenario
        // semantics; the name explicitly says "guard-state".
        try {
            document.dispatchEvent(new CustomEvent('rmooz:download-guard-state-changed', {
                detail: Object.assign({}, state),
            }));
        } catch (_) { /* never throw */ }
    }

    function getEventLog() { return window.AppShellEventLog; }
    function logRow(severity, messageKey, fallback, payload) {
        const log = getEventLog();
        if (!log || typeof log.append !== 'function') return;
        try {
            log.append({
                severity,
                category:    'UI',                                  // closed-set; PR-6 gate
                source:      'journal-download-guard',
                messageKey,
                message:     fallback,
                payload:     (payload && typeof payload === 'object') ? payload : undefined,
            });
        } catch (_) { /* never throw */ }
    }

    // ── Public API ────────────────────────────────────────────────
    function getState() {
        // Defensive copy — caller cannot mutate the closure state.
        return Object.assign({}, state);
    }

    function setEnabled(on) {
        const requested = !!on;
        setState({ lastAttemptAt: Date.now() });

        // PR-20 hard-lock: while locked, ANY request to set enabled
        // to true is refused. Requests to set enabled to false pass
        // (allowing a future PR to safely reset state).
        if (requested && state.locked) {
            logRow('WARNING', 'elog-evt-download-guard-locked', 'Download guard refused attempt — locked by design', {
                requestedEnabled: true,
                locked:           true,
                hint:             'a future PR will lift the lock with an explicit source edit',
            });
            setState({
                enabled:       false,
                lastError:     'locked by design',
                lastFailureAt: Date.now(),
            });
            return false;
        }

        // Non-locked branch — unreachable in PR-20 because the lock
        // is set at module init and the bridge exposes no setter to
        // lift it. Kept here so the future PR has a clear extension
        // point.
        setState({
            enabled:       requested,
            lastError:     null,
            lastSuccessAt: Date.now(),
        });
        logRow('NOTICE', 'elog-evt-download-guard-state-changed', 'Download guard state changed', {
            enabled: requested,
            locked:  state.locked,
        });
        return requested;
    }

    function isAllowed() {
        // The single source of truth for "may download proceed?".
        // PR-20 always returns false. Future download callers MUST
        // check this before performing any file/Blob/download work.
        return !!state.enabled && !state.locked;
    }

    // Initial broadcast so the UI pill subscriber sees the state
    // even if it loaded after this module. Wrapped in a microtask
    // so the bridge is fully published before the event fires.
    Promise.resolve().then(() => {
        try {
            document.dispatchEvent(new CustomEvent('rmooz:download-guard-state-changed', {
                detail: Object.assign({}, state),
            }));
        } catch (_) { /* never throw */ }
    });

    window.AppShellJournalDownloadGuard = {
        getState,
        setEnabled,
        isAllowed,
        STATUS,
        // Deliberately omitted: triggerDownload, executeDownload,
        //                       beginExport, save, export, setLocked.
        // A future PR opening real download will add these in an
        // explicit, reviewable diff.
    };
})();
