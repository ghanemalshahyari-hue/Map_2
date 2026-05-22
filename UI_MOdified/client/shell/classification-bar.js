/**
 * Operational shell — classification banners.
 *
 * PR-1 (Operational Shell Foundation). Renders the text into the
 * already-present top and bottom .classification-bar elements:
 *   #classification-top
 *   #classification-bottom
 *
 * Reads from i18n key 'classification-text' so the text reflects the
 * current language; subscribes to 'rmooz:language-changed' to update.
 * If the i18n machinery is not yet ready, falls back to the static
 * 'UNCLASSIFIED // TRAINING USE ONLY' constant.
 *
 * Step 1: a single text value for both bars. Per-scenario / per-user
 * classification override is a Step-2+ enhancement (config.json key
 * `classification.text`); the markup is already in place.
 *
 * Bridge name: window.AppShellClassification
 */
(function () {
    'use strict';

    const FALLBACK_TEXT = 'UNCLASSIFIED // TRAINING USE ONLY';

    function resolveText() {
        if (typeof window.t === 'function') {
            const t = window.t('classification-text');
            if (typeof t === 'string' && t && t !== 'classification-text') return t;
        }
        return FALLBACK_TEXT;
    }

    function apply() {
        const text = resolveText();
        const top = document.getElementById('classification-top');
        const bot = document.getElementById('classification-bottom');
        if (top) top.textContent = text;
        if (bot) bot.textContent = text;
    }

    // i18n.js dispatches no DOM event — it calls a single
    // window.onLanguageChange(lang) callback if defined. Codebase
    // convention is a chain: capture the previous handler and call it
    // at the end so multiple modules can subscribe without clobbering.
    // (See tool-rail.js, units.js, chat.js for the same pattern.)
    //
    // Additionally, the classification bar markup carries data-i18n=
    // "classification-text", so i18n.js's existing DOM scan already
    // updates the text on language change. The hook below is kept for
    // future per-scenario / per-config overrides (Step 2+) that bypass
    // the data-i18n path.
    function bindLanguageChanges() {
        const prev = window.onLanguageChange;
        window.onLanguageChange = function (lang) {
            try { apply(); } catch (_) { /* never throw inside the chain */ }
            if (typeof prev === 'function') {
                try { prev(lang); } catch (_) { /* don't break other listeners */ }
            }
        };
    }

    function init() {
        bindLanguageChanges();
        apply();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    window.AppShellClassification = { apply, resolveText };
})();
