/**
 * Operational shell — Selected Unit panel.
 *
 * PR-3 (Selected Unit Panel Foundation). UI-only — no simulation logic,
 * no AI calls, no fake fuel/ammo/damage values. Sections that depend on
 * simulation data show a localized "Not available" placeholder. The
 * advisor section shows the fixed inactive-message specified by the
 * product brief.
 *
 * Data sources (all read-only):
 *   - rmooz:unit-selected CustomEvent.detail.unit (emitted by units-map.js
 *     when an operator clicks a unit marker).
 *   - window.mgrs.forward — already loaded for the cursor readout.
 *   - window.AppShellClock.formatZuluDtg — already loaded.
 *
 * Bridge: window.AppShellUnitPanel  (idempotent on hot reload).
 */
(function () {
    'use strict';

    // ── Element lookups (cached on first paint) ─────────────────────
    const $ = (id) => document.getElementById(id);
    const panel = () => $('unit-panel');

    const SIDE_LABEL_KEY = {
        friendly: 'up-side-friendly',
        hostile:  'up-side-hostile',
        neutral:  'up-side-neutral',
        unknown:  'up-side-unknown',
    };
    const ECHELON_LABEL_KEY = {
        0: 'up-echelon-0',  // Army
        1: 'up-echelon-1',  // Force
        2: 'up-echelon-2',  // Brigade
        3: 'up-echelon-3',  // Battalion
        4: 'up-echelon-4',  // Company
    };

    let currentUnit = null;
    let currentSelectedAt = null;

    function tr(key, fallback) {
        if (typeof window.t === 'function') {
            const v = window.t(key);
            if (typeof v === 'string' && v && v !== key) return v;
        }
        return fallback;
    }

    function fmtLat(lat) {
        if (!Number.isFinite(lat)) return null;
        return `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}`;
    }
    function fmtLng(lng) {
        if (!Number.isFinite(lng)) return null;
        return `${Math.abs(lng).toFixed(4)}°${lng >= 0 ? 'E' : 'W'}`;
    }
    function fmtMgrs(lat, lng) {
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        try {
            if (!window.mgrs || typeof window.mgrs.forward !== 'function') return null;
            const s = window.mgrs.forward([lng, lat], 5);
            if (typeof s !== 'string' || s.length < 7) return null;
            const m = s.match(/^(\d{1,2}[A-Z])([A-Z]{2})(\d+)$/);
            if (m) {
                const half = m[3].length / 2;
                return `${m[1]} ${m[2]} ${m[3].slice(0, half)} ${m[3].slice(half)}`;
            }
            return s;
        } catch (_) { return null; }
    }
    function fmtDtg(ts) {
        const d = new Date(ts || Date.now());
        if (window.AppShellClock && typeof window.AppShellClock.formatZuluDtg === 'function') {
            try { return window.AppShellClock.formatZuluDtg(d); } catch (_) { /* fall through */ }
        }
        // Cheap fallback if the clock module hasn't loaded.
        return d.toISOString();
    }

    function naText() { return tr('up-na', 'Not available'); }

    // ── Render functions ───────────────────────────────────────────
    function setText(id, value) {
        const el = $(id);
        if (!el) return;
        if (value == null || value === '') {
            el.textContent = naText();
            el.classList.add('up-na');
        } else {
            el.textContent = value;
            el.classList.remove('up-na');
        }
    }

    function showSection(id, on) {
        const el = $(id);
        if (!el) return;
        if (on) el.removeAttribute('hidden');
        else el.setAttribute('hidden', '');
    }

    function renderEmpty() {
        const p = panel();
        if (!p) return;
        p.classList.add('unit-panel--empty');
        // Title back to "No unit selected"
        const titleEl = $('up-name');
        if (titleEl) titleEl.textContent = tr('up-empty-title', 'No unit selected');
        // Hide chips
        const sideChip = $('up-side-chip');
        if (sideChip) { sideChip.setAttribute('hidden', ''); sideChip.setAttribute('data-side', ''); sideChip.textContent = ''; }
        const echChip = $('up-echelon-chip');
        if (echChip) { echChip.setAttribute('hidden', ''); echChip.textContent = ''; }
        // Show empty hint, hide all sections
        const hint = $('up-empty-hint');
        if (hint) hint.removeAttribute('hidden');
        for (const sid of ['up-section-identity','up-section-position','up-section-opstatus','up-section-combat','up-section-c2','up-section-advisor']) {
            showSection(sid, false);
        }
    }

    function renderUnit(unit, selectedAt) {
        const p = panel();
        if (!p || !unit) { renderEmpty(); return; }
        currentUnit = unit;
        currentSelectedAt = selectedAt || Date.now();

        p.classList.remove('unit-panel--empty');

        // Header: name + chips
        const titleEl = $('up-name');
        if (titleEl) titleEl.textContent = (unit.name && String(unit.name).trim()) || tr('up-unknown-name', 'Unnamed unit');

        const sideChip = $('up-side-chip');
        if (sideChip) {
            const side = (unit.side || 'unknown').toLowerCase();
            sideChip.setAttribute('data-side', side);
            sideChip.textContent = tr(SIDE_LABEL_KEY[side] || 'up-side-unknown', side.toUpperCase());
            sideChip.removeAttribute('hidden');
        }

        const echChip = $('up-echelon-chip');
        if (echChip) {
            const lvl = Number.isInteger(unit.level) ? unit.level : null;
            const label = lvl != null ? tr(ECHELON_LABEL_KEY[lvl], 'L'+lvl) : null;
            if (label) {
                echChip.textContent = label;
                echChip.removeAttribute('hidden');
            } else {
                echChip.setAttribute('hidden', '');
            }
        }

        // Hide empty hint, show all sections
        const hint = $('up-empty-hint');
        if (hint) hint.setAttribute('hidden', '');

        // Section 1 — Identity
        showSection('up-section-identity', true);
        setText('up-callsign', (unit.name && String(unit.name).trim()) || null);
        const side = (unit.side || '').toLowerCase();
        setText('up-side', side ? tr(SIDE_LABEL_KEY[side] || 'up-side-unknown', side) : null);
        setText('up-sidc', (unit.sidc && String(unit.sidc).trim()) || null);
        const lvl = Number.isInteger(unit.level) ? unit.level : null;
        setText('up-echelon', lvl != null ? tr(ECHELON_LABEL_KEY[lvl], 'L'+lvl) : null);
        setText('up-code', (unit.code && String(unit.code).trim()) || null);
        // Parent: short tag from parent_id (full lookup is out of scope for PR-3).
        const parentRaw = unit.parent_id || unit.parentId || null;
        const parentShort = parentRaw ? '#' + String(parentRaw).slice(0, 8) : null;
        setText('up-parent', parentShort);

        // Section 2 — Position
        showSection('up-section-position', true);
        const lat = Number(unit.lat), lng = Number(unit.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            setText('up-latlng', `${fmtLat(lat)} ${fmtLng(lng)}`);
            setText('up-mgrs',   fmtMgrs(lat, lng));
        } else {
            setText('up-latlng', null);
            setText('up-mgrs',   null);
        }
        setText('up-selat', fmtDtg(currentSelectedAt));

        // Sections 3, 4, 5 — Operational / Combat / C2 (placeholders only — already filled in the HTML)
        showSection('up-section-opstatus', true);
        showSection('up-section-combat',   true);
        showSection('up-section-c2',       true);

        // Section 6 — Advisor (inactive placeholder)
        showSection('up-section-advisor', true);
    }

    // Re-render the current state with whatever the current language is.
    // Used by the onLanguageChange chain.
    function rerender() {
        if (currentUnit) renderUnit(currentUnit, currentSelectedAt);
        else             renderEmpty();
    }

    // ── Wiring ─────────────────────────────────────────────────────
    function bindEvents() {
        document.addEventListener('rmooz:unit-selected', (e) => {
            const u = e && e.detail && e.detail.unit;
            const at = e && e.detail && e.detail.selectedAt;
            if (!u) return;
            try { renderUnit(u, at); } catch (_) { /* never throw on selection */ }
        });
        document.addEventListener('rmooz:unit-deselected', () => {
            try { renderEmpty(); } catch (_) { /* ignore */ }
        });

        // Language chain — same pattern as the other shell modules.
        const prev = window.onLanguageChange;
        window.onLanguageChange = function (lang) {
            try { rerender(); } catch (_) { /* don't break the chain */ }
            if (typeof prev === 'function') {
                try { prev(lang); } catch (_) { /* don't break other listeners */ }
            }
        };
    }

    function init() {
        if (!panel()) return;
        bindEvents();
        renderEmpty();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    window.AppShellUnitPanel = {
        renderEmpty,
        renderUnit,
        getCurrentUnit: () => currentUnit,
    };
})();
