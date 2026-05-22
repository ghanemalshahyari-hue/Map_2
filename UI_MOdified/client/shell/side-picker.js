/**
 * Operational shell — side picker (BLUE / RED / GOD / Instructor).
 *
 * PR-1 (Operational Shell Foundation). Renders a three-button inline
 * group into the placeholder element `<div id="side-picker-mount">`
 * inside the app header. Persists the operator's choice to
 * localStorage under key 'rmooz_view_side'. Default: BLUE.
 *
 * Behaviour restriction (PR-1):
 *   The picker fires a 'rmooz:view-side-changed' CustomEvent on
 *   document with { detail: { side } }, but NOTHING in the codebase
 *   subscribes today. The map does NOT filter by side; fog of war is
 *   not implemented. This file plants the wire and the state; future
 *   PRs hook into the event.
 *
 * Bridge name: window.AppShellSidePicker
 */
(function () {
    'use strict';

    const STORAGE_KEY = 'rmooz_view_side';
    const VALID = new Set(['BLUE', 'RED', 'GOD']);
    const I18N_KEYS = {
        BLUE: 'side-picker-blue',
        RED:  'side-picker-red',
        GOD:  'side-picker-god',
    };
    const FALLBACK_LABELS = {
        BLUE: 'Blue View',
        RED:  'Red View',
        GOD:  'Instructor View',
    };

    // Hardening: a non-null but invalid value in localStorage (e.g. left
    // over from an older schema or hand-edited) is normalized to BLUE and
    // written back so the next read sees a clean default. Read errors
    // (private mode, storage disabled) fall through to the in-memory
    // default without throwing.
    function readStored() {
        let v = null;
        try { v = localStorage.getItem(STORAGE_KEY); }
        catch (_) { return 'BLUE'; }
        if (VALID.has(v)) return v;
        // null === first run, expected. Non-null and invalid === corruption
        // or schema change — overwrite so the storage is no longer dirty.
        if (v !== null) {
            try { localStorage.setItem(STORAGE_KEY, 'BLUE'); } catch (_) { /* ignore */ }
        }
        return 'BLUE';
    }

    function writeStored(side) {
        try { localStorage.setItem(STORAGE_KEY, side); }
        catch (_) { /* ignore */ }
    }

    function labelFor(side) {
        if (typeof window.t === 'function') {
            const t = window.t(I18N_KEYS[side]);
            if (typeof t === 'string' && t && t !== I18N_KEYS[side]) return t;
        }
        return FALLBACK_LABELS[side];
    }

    function titleText() {
        if (typeof window.t === 'function') {
            const t = window.t('side-picker-title');
            if (typeof t === 'string' && t && t !== 'side-picker-title') return t;
        }
        return 'Operational view';
    }

    let current = readStored();
    let mountEl = null;

    function setSide(side, opts) {
        if (!VALID.has(side) || side === current) return;
        current = side;
        writeStored(side);
        renderButtons();
        if (!opts || opts.silent !== true) {
            document.dispatchEvent(new CustomEvent('rmooz:view-side-changed', { detail: { side } }));
        }
    }

    function renderButtons() {
        if (!mountEl) return;
        const buttons = mountEl.querySelectorAll('button[data-side]');
        buttons.forEach(btn => {
            const s = btn.getAttribute('data-side');
            const active = s === current;
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
            btn.classList.toggle('side-picker-btn--active', active);
            btn.textContent = labelFor(s);
        });
        mountEl.setAttribute('title', titleText());
        mountEl.setAttribute('aria-label', titleText());
    }

    function build() {
        mountEl = document.getElementById('side-picker-mount');
        if (!mountEl) return;
        mountEl.classList.add('side-picker');
        mountEl.setAttribute('role', 'group');
        mountEl.setAttribute('data-current-side', current);
        // Inline-build the three buttons.
        mountEl.innerHTML = '';
        ['BLUE', 'RED', 'GOD'].forEach(s => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'side-picker-btn';
            b.setAttribute('data-side', s);
            b.setAttribute('data-side-color', s.toLowerCase());
            b.addEventListener('click', () => setSide(s));
            mountEl.appendChild(b);
        });
        renderButtons();
    }

    // i18n.js calls a single window.onLanguageChange(lang) callback (not a
    // DOM event). Codebase convention: capture the previous handler so we
    // chain instead of clobbering. Mirrors tool-rail.js / units.js / chat.js.
    function bindLanguageChanges() {
        const prev = window.onLanguageChange;
        window.onLanguageChange = function (lang) {
            try { renderButtons(); } catch (_) { /* never throw inside the chain */ }
            if (typeof prev === 'function') {
                try { prev(lang); } catch (_) { /* don't break other listeners */ }
            }
        };
    }

    function init() {
        build();
        bindLanguageChanges();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    window.AppShellSidePicker = {
        getSide:  () => current,
        setSide,
        isValid:  (s) => VALID.has(s),
        STORAGE_KEY,
    };
})();
