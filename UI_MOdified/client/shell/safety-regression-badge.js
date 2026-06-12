/**
 * Operational shell — Safety Regression Badge (read-only mirror)
 * + PR-27 Safety Details Popover.
 *
 * PR-26 paints a tiny indicator in the AI Proposal Review section
 * header that mirrors PR-25's overall safety summary. PR-27 adds
 * a read-only popover that opens from the badge and explains the
 * current state. Both PRs are pure paint / visibility flips:
 *
 *   - NEVER runs a test. The badge / popover do not call
 *     runSelfTest() or runViolationTests().
 *   - NEVER persists. Text is derived from a read of the in-memory
 *     summary on every render. Popover open/closed state lives in
 *     a single closure variable + DOM [hidden]; reload erases both.
 *   - NEVER calls backend. No `fetch`, `XMLHttpRequest`, `sendBeacon`.
 *     No `/api/sim/propose`, no `/api/sim/commit`.
 *   - NEVER writes files. No `Blob`, `URL.createObjectURL`,
 *     `<a download>`, `link.click()`.
 *   - NEVER mutates scenario state. No setter is called on any
 *     bridge; the module only reads.
 *   - textContent-only DOM updates. No `innerHTML`.
 *
 * Bridge: window.AppShellSafetyRegressionBadge
 *   render()          – idempotent paint; reads getRegressionSummary()
 *                       and updates the badge + popover content.
 *   openDetails()     – flip popover visible. UI-only.
 *   closeDetails()    – flip popover hidden. UI-only.
 *   toggleDetails()   – flip popover visibility. UI-only.
 *   getState()        – defensive copy of { isOpen }.
 *
 * Deliberately NOT exposed: setState, triggerTest, runSelfTest,
 *                            runViolationTests, save, export,
 *                            setEnabled, setLocked.
 */
(function () {
    'use strict';

    // ── Closed-set badge state → (label key, tone) ───────────────
    // The "attention required, but nothing failed yet" sub-state
    // is mapped to "not-run" tone yellow per the brief.
    const STATE_MAP = Object.freeze({
        notRun:    { i18n: 'ap-safety-not-run',    tone: 'yellow', dataState: 'not-run'   },
        clean:     { i18n: 'ap-safety-clean',      tone: 'green',  dataState: 'clean'     },
        attention: { i18n: 'ap-safety-attention',  tone: 'red',    dataState: 'attention' },
        unknown:   { i18n: 'ap-safety-unknown',    tone: 'grey',   dataState: 'unknown'   },
    });

    function localized(key, fallback) {
        if (typeof window.t === 'function') {
            try {
                const v = window.t(key);
                if (typeof v === 'string' && v && v !== key) return v;
            } catch (_) { /* fall through */ }
        }
        return fallback;
    }

    function deriveBadgeState() {
        const bap = window.AppShellBoundaryAuditPanel;
        if (!bap || typeof bap.getRegressionSummary !== 'function') {
            return STATE_MAP.unknown;
        }
        let s;
        try { s = bap.getRegressionSummary(); } catch (_) { return STATE_MAP.unknown; }
        if (!s) return STATE_MAP.unknown;
        // Both tests passed → clean (green).
        if (s.overall === 'clean') return STATE_MAP.clean;
        // Any test failed → attention required (red).
        const selfState = s.selfTest      && s.selfTest.state;
        const vState    = s.violationTests && s.violationTests.state;
        if (selfState === 'failed' || vState === 'failed') return STATE_MAP.attention;
        // One/both not yet run → not-run (yellow).
        return STATE_MAP.notRun;
    }

    function render() {
        const el = document.getElementById('ap-safety-regression-badge');
        if (!el) return;
        const target = deriveBadgeState();
        el.setAttribute('data-tone',  target.tone);
        el.setAttribute('data-state', target.dataState);
        el.setAttribute('data-i18n',  target.i18n);
        const fallback = (target.i18n === 'ap-safety-clean')     ? 'Safety: Clean'
                       : (target.i18n === 'ap-safety-attention') ? 'Safety: Attention required'
                       : (target.i18n === 'ap-safety-unknown')   ? 'Safety: Unknown'
                       :                                            'Safety: Not run';
        el.textContent = localized(target.i18n, fallback);
        // PR-27: also repaint the popover contents in place so the
        // dialog stays in sync with the badge even while it's open.
        try { renderPopoverBody(); } catch (_) { /* never throw */ }
    }

    // ═════════════════════════════════════════════════════════════
    // PR-27 — Safety Details Popover (read-only)
    // -------------------------------------------------------------
    // The popover is a sibling of the badge inside .ap-header. It
    // explains the badge's current state by listing the same
    // PR-25 summary fields the badge reads. The popover is a pure
    // viewer: it cannot run a test, mutate any bridge, or persist
    // any state. Open/closed state is a single closure boolean +
    // DOM [hidden] attribute; reload resets both to false/hidden.
    // ═════════════════════════════════════════════════════════════

    let isOpen = false;

    // Closed-set per-row state keys mirror PR-25's getRegressionSummary().
    const PERROW_I18N = Object.freeze({
        notRun: 'ba-summary-perrow-not-run',
        passed: 'ba-summary-perrow-passed',
        failed: 'ba-summary-perrow-failed',
    });

    function perRowFallback(stateKey) {
        return (stateKey === 'passed') ? 'Passed'
             : (stateKey === 'failed') ? 'Failed'
             :                           'Not run';
    }

    function formatRanAt(ts) {
        if (!ts) return '—';
        try {
            const d = new Date(ts);
            const pad = (n) => (n < 10 ? '0' + n : '' + n);
            return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
        } catch (_) { return '—'; }
    }

    function setChip(el, state, i18nKey) {
        if (!el) return;
        el.setAttribute('data-state', state);
        el.setAttribute('data-i18n',  i18nKey);
        el.textContent = localized(i18nKey, perRowFallback(state));
    }

    function renderPopoverBody() {
        const pop = document.getElementById('ap-safety-popover');
        if (!pop) return;

        const target = deriveBadgeState();
        // Overall chip in the popover header — share tone with badge.
        const overallEl = document.getElementById('ap-safety-popover-overall');
        const overallFallback = (target.i18n === 'ap-safety-clean')     ? 'Safety: Clean'
                              : (target.i18n === 'ap-safety-attention') ? 'Safety: Attention required'
                              : (target.i18n === 'ap-safety-unknown')   ? 'Safety: Unknown'
                              :                                            'Safety: Not run';
        if (overallEl) {
            overallEl.setAttribute('data-tone',  target.tone);
            overallEl.setAttribute('data-state', target.dataState);
            overallEl.setAttribute('data-i18n',  target.i18n);
            overallEl.textContent = localized(target.i18n, overallFallback);
        }
        // Body "Overall" row mirror — same text, no chip styling.
        const mirrorEl = document.querySelector('.ap-safety-popover-overall-mirror');
        if (mirrorEl) {
            mirrorEl.setAttribute('data-i18n', target.i18n);
            mirrorEl.textContent = localized(target.i18n, overallFallback);
        }

        // Per-row chips (Self-test, Violation tests).
        const bap = window.AppShellBoundaryAuditPanel;
        let s = null;
        if (bap && typeof bap.getRegressionSummary === 'function') {
            try { s = bap.getRegressionSummary(); } catch (_) { s = null; }
        }
        const selfState = (s && s.selfTest      && s.selfTest.state)      || 'notRun';
        const vState    = (s && s.violationTests && s.violationTests.state) || 'notRun';
        setChip(document.getElementById('ap-safety-popover-selftest'),
                selfState, PERROW_I18N[selfState] || PERROW_I18N.notRun);
        setChip(document.getElementById('ap-safety-popover-vtests'),
                vState,    PERROW_I18N[vState]    || PERROW_I18N.notRun);

        // Last result time.
        const ranAtEl = document.getElementById('ap-safety-popover-ran-at');
        if (ranAtEl) ranAtEl.textContent = formatRanAt(s && s.lastResultAt);
    }

    function openDetails() {
        const pop = document.getElementById('ap-safety-popover');
        const trigger = document.getElementById('ap-safety-regression-badge');
        if (!pop) return;
        isOpen = true;
        pop.removeAttribute('hidden');
        pop.setAttribute('aria-hidden', 'false');
        if (trigger) trigger.setAttribute('aria-expanded', 'true');
        renderPopoverBody();
    }

    function closeDetails() {
        const pop = document.getElementById('ap-safety-popover');
        const trigger = document.getElementById('ap-safety-regression-badge');
        if (!pop) return;
        isOpen = false;
        pop.setAttribute('hidden', '');
        pop.setAttribute('aria-hidden', 'true');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }

    function toggleDetails() {
        if (isOpen) closeDetails();
        else        openDetails();
    }

    function getState() {
        return { isOpen: !!isOpen };
    }

    // ── Trigger + dismissal wiring ───────────────────────────────
    function bindBadgeAsTrigger() {
        const el = document.getElementById('ap-safety-regression-badge');
        if (!el) return;
        // Promote the <span> to an interactive trigger without
        // changing the markup — purely ARIA + tabindex.
        el.setAttribute('role',          'button');
        el.setAttribute('tabindex',      '0');
        el.setAttribute('aria-haspopup', 'dialog');
        el.setAttribute('aria-expanded', 'false');
        el.setAttribute('aria-controls', 'ap-safety-popover');

        el.addEventListener('click', (ev) => {
            ev.stopPropagation();                                  // prevent outside-click handler
            try { toggleDetails(); } catch (_) {}
        });
        el.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'Spacebar') {
                ev.preventDefault();
                try { toggleDetails(); } catch (_) {}
            }
        });
    }

    function bindOutsideClickAndEscape() {
        // Outside-click: close if the click lands outside the
        // badge AND outside the popover. We use capture phase so
        // we run before any in-popover handler can stop propagation.
        document.addEventListener('click', (ev) => {
            if (!isOpen) return;
            const pop = document.getElementById('ap-safety-popover');
            const trg = document.getElementById('ap-safety-regression-badge');
            const t   = ev.target;
            const insidePopover = pop && pop.contains(t);
            const insideTrigger = trg && trg.contains(t);
            if (!insidePopover && !insideTrigger) {
                try { closeDetails(); } catch (_) {}
            }
        }, true);

        // Escape: close from anywhere.
        document.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape' && isOpen) {
                try { closeDetails(); } catch (_) {}
            }
        });
    }

    // ── Subscriptions (UI-only event from PR-25) ─────────────────
    function subscribe() {
        document.addEventListener('rmooz:safety-regression-summary-changed', render);
    }

    // ── Init + language-switch chain ─────────────────────────────
    function init() {
        subscribe();
        bindBadgeAsTrigger();
        bindOutsideClickAndEscape();
        render();
        const prev = window.onLanguageChange;
        window.onLanguageChange = function (lang) {
            try { render(); } catch (_) {}
            try { renderPopoverBody(); } catch (_) {}
            if (typeof prev === 'function') { try { prev(lang); } catch (_) {} }
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        // One microtask defer so the PR-22 boundary-audit-panel
        // bridge is fully published before our first read.
        Promise.resolve().then(init);
    }

    window.AppShellSafetyRegressionBadge = {
        render,
        openDetails,
        closeDetails,
        toggleDetails,
        getState,
        // Deliberately omitted: setState, triggerTest, runSelfTest,
        //                       runViolationTests, save, export,
        //                       setEnabled, setLocked.
    };
})();
