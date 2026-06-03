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

    // Echelon label for either a numeric level (server units, 0–4) or an echelon
    // string (scenario ORBAT units: division/brigade/battalion/company/…).
    function echelonLabel(level) {
        if (typeof level === 'string' && level) {
            return tr('up-echelon-' + level.toLowerCase(), level.charAt(0).toUpperCase() + level.slice(1));
        }
        if (Number.isInteger(level)) return tr(ECHELON_LABEL_KEY[level], 'L' + level);
        return null;
    }

    let currentUnit = null;
    let currentSelectedAt = null;

    function tr(key, fallback) {
        if (typeof window.t === 'function') {
            const v = window.t(key);
            if (typeof v === 'string' && v && v !== key) return v;
        }
        return fallback;
    }

    function isScenarioVisible() {
        try {
            return !!(window.AppAdjudicatorMap
                && typeof window.AppAdjudicatorMap.isScenarioDrawn === 'function'
                && window.AppAdjudicatorMap.isScenarioDrawn());
        } catch (_) {
            return false;
        }
    }

    function syncScenarioVisibility() {
        const p = panel();
        if (!p) return;
        if (isScenarioVisible()) p.removeAttribute('hidden');
        else p.setAttribute('hidden', '');
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

    // ── P5b: scenario-unit enrichment (real data only — no fabricated sim values) ──
    // Scenario ORBAT units carry richer metadata than the base PR-3 panel shows.
    // Surface what we actually have (role / domain / composition / landing-site) in
    // a "Composition & Role" section injected after Identity, shown only for scenario
    // units (unit._scenario). textContent-only; no weapons/sensors/fuel are invented.
    const ROLE_WORDS = {
        mech: 'Mechanized', inf: 'Infantry', bn: 'Battalion', bde: 'Brigade',
        div: 'Division', coy: 'Company', recon: 'Reconnaissance', arty: 'Artillery',
        armor: 'Armored', armored: 'Armored', ada: 'Air Defense', sam: 'SAM',
        ssm: 'SSM', ew: 'EW', hq: 'HQ', cmd: 'Command', nav: 'Naval', air: 'Air',
        def: 'Defense', sup: 'Support', log: 'Logistics', amph: 'Amphibious', uav: 'UAV'
    };
    function formatRole(role) {
        if (!role || typeof role !== 'string') return null;
        return role.split(/[_\s-]+/).filter(Boolean)
            .map(w => ROLE_WORDS[w.toLowerCase()] || (w.charAt(0).toUpperCase() + w.slice(1)))
            .join(' ');
    }
    function parseComposition(name) {
        if (!name || typeof name !== 'string') return null;
        // First parenthetical group (Arabic or Latin parens), e.g. "(3 سرايا…)" / "(T-64 x 4)".
        const m = name.match(/[（(]\s*([^（）()]+?)\s*[）)]/);
        return (m && m[1] && m[1].trim()) ? m[1].trim() : null;
    }
    function renderScenarioDetails(unit) {
        const identity = $('up-section-identity');
        let sec = $('up-section-scn-details');
        if (!sec && identity && unit && unit._scenario) {
            sec = document.createElement('section');
            sec.className = 'up-section';
            sec.id = 'up-section-scn-details';
            const h = document.createElement('h4');
            h.className = 'up-section-title';
            h.textContent = tr('up-section-scn-details', 'Composition & Role');
            const dl = document.createElement('dl');
            dl.className = 'up-kv';
            const addRow = (ddId, label) => {
                const dt = document.createElement('dt'); dt.textContent = label;
                const dd = document.createElement('dd'); dd.id = ddId; dd.textContent = '-';
                dl.appendChild(dt); dl.appendChild(dd);
            };
            addRow('up-scn-role', tr('up-field-role', 'Role'));
            addRow('up-scn-domain', tr('up-field-domain', 'Domain'));
            addRow('up-scn-comp', tr('up-field-composition', 'Composition'));
            addRow('up-scn-bls', tr('up-field-bls', 'Landing site'));
            sec.appendChild(h); sec.appendChild(dl);
            identity.insertAdjacentElement('afterend', sec);
        }
        if (!sec) return;
        if (!unit || !unit._scenario) { sec.setAttribute('hidden', ''); return; }
        const setRow = (ddId, value) => {
            const dd = $(ddId); if (!dd) return;
            const dt = dd.previousElementSibling;
            const has = !(value == null || value === '');
            if (dt) { if (has) dt.removeAttribute('hidden'); else dt.setAttribute('hidden', ''); }
            if (has) { dd.textContent = value; dd.removeAttribute('hidden'); } else { dd.setAttribute('hidden', ''); }
        };
        const roleTxt = formatRole(unit.role);
        const domainTxt = unit.domain ? (String(unit.domain).charAt(0).toUpperCase() + String(unit.domain).slice(1)) : null;
        const compTxt = parseComposition(unit.name);
        const blsTxt = (unit.bls && String(unit.bls).trim()) || null;
        setRow('up-scn-role', roleTxt);
        setRow('up-scn-domain', domainTxt);
        setRow('up-scn-comp', compTxt);
        setRow('up-scn-bls', blsTxt);
        if (roleTxt || domainTxt || compTxt || blsTxt) sec.removeAttribute('hidden');
        else sec.setAttribute('hidden', '');
    }

    // ── P5b: marker-derived readouts (symbol profile, current-step status,
    // capability placeholders). REAL data only, read from the live unit marker's
    // debug fields via AppAdjudicatorMap.getScenarioMarkers(). Never fabricates
    // platform / weapons / sensors / fuel / ammo / readiness / combat power.
    function findSelectedMarker(unit) {
        if (!unit || !window.AppAdjudicatorMap || typeof window.AppAdjudicatorMap.getScenarioMarkers !== 'function') return null;
        let ms; try { ms = window.AppAdjudicatorMap.getScenarioMarkers(); } catch (_) { return null; }
        if (!ms) return null;
        const want = String(unit.id || unit.code || '');
        const all = [].concat(ms.red || [], ms.blue || []);
        for (const m of all) {
            const uid = m && (m._unitId || (m._unitData && m._unitData.id));
            if (uid && String(uid) === want) return m;
        }
        return null;
    }
    const SYM_SOURCE_LABEL = {
        scenario_sidc: 'Scenario SIDC (authoritative)', role_domain_template: 'Remapped to family symbol',
        symbol_set_frame: 'Family frame only', unknown: 'Unknown / fallback',
    };
    const SYM_FAMILY_LABEL = { naval: 'Naval', subsurface: 'Subsurface', air: 'Air', land: 'Land', unknown: 'Unknown' };

    // Ensure an injected section (h4 + dl) exists after `afterEl`; returns it.
    function ensureSection(id, title, afterEl) {
        let sec = $(id);
        if (!sec && afterEl) {
            sec = document.createElement('section');
            sec.className = 'up-section'; sec.id = id;
            const h = document.createElement('h4'); h.className = 'up-section-title'; h.textContent = title;
            const dl = document.createElement('dl'); dl.className = 'up-kv'; dl.id = id + '-dl';
            sec.appendChild(h); sec.appendChild(dl);
            afterEl.insertAdjacentElement('afterend', sec);
        }
        return sec;
    }
    // Rebuild a <dl> from [label, value|null, opts] rows (idempotent, textContent-only).
    function setKv(dl, rows) {
        if (!dl) return false;
        dl.textContent = '';
        rows.forEach((row) => {
            const label = row[0], value = row[1], opts = row[2] || {};
            const show = !(value == null || value === '');
            if (!show && opts.omitIfEmpty) return;
            const dt = document.createElement('dt'); dt.textContent = label;
            const dd = document.createElement('dd');
            let cls = '';
            if (opts.mono) { cls = 'up-mono'; dd.setAttribute('dir', 'ltr'); }
            if (opts.na) cls = (cls ? cls + ' ' : '') + 'up-na';
            if (cls) dd.className = cls;
            dd.textContent = show ? value : naText();
            dl.appendChild(dt); dl.appendChild(dd);
        });
        return true;
    }

    // Section: Symbol Profile (SYM2 resolver output — honest family/category, not platform).
    function renderSymbolProfile(unit, marker) {
        const after = $('up-section-scn-details') || $('up-section-identity');
        const sec = ensureSection('up-section-symprofile', tr('up-section-symprofile', 'Symbol Profile'), after);
        if (!sec) return;
        const prof = marker && marker._symbolProfile;
        if (!unit || !unit._scenario || !prof) { sec.setAttribute('hidden', ''); return; }
        const remapped = prof.source && prof.source !== 'scenario_sidc';
        const typeLabel = !remapped ? tr('up-sym-original', 'Original scenario symbol (unchanged)')
            : (prof.source === 'symbol_set_frame' ? tr('up-sym-frame', 'Family frame only (category)')
               : tr('up-sym-remapped', 'Family / category symbol (not exact platform)'));
        const rows = [
            ['Symbol', typeLabel],
            ['Family', SYM_FAMILY_LABEL[prof.symbol_family] || prof.symbol_family || null, { omitIfEmpty: true }],
            ['Original SIDC', prof.original_sidc || null, { mono: true, omitIfEmpty: true }],
        ];
        if (remapped && prof.resolved_sidc && prof.resolved_sidc !== prof.original_sidc) rows.push(['Rendered SIDC', prof.resolved_sidc, { mono: true }]);
        rows.push(['Resolver', SYM_SOURCE_LABEL[prof.source] || prof.source || null, { omitIfEmpty: true }]);
        rows.push(['Confidence', prof.confidence || null, { omitIfEmpty: true }]);
        if (prof.fallback_reason) rows.push(['Fallback reason', String(prof.fallback_reason).replace(/_/g, ' ')]);
        rows.push(['Operator editable', prof.operator_editable ? tr('up-yes', 'Yes') : tr('up-no', 'No')]);
        setKv($('up-section-symprofile-dl'), rows);
        sec.removeAttribute('hidden');
    }

    // Section: Current Step Status (AN1/AN2 per-step engagement record — real only).
    function renderStepStatus(unit, marker) {
        const after = $('up-section-symprofile') || $('up-section-scn-details') || $('up-section-identity');
        const sec = ensureSection('up-section-stepstatus', tr('up-section-stepstatus', 'Current Step Status'), after);
        if (!sec) return;
        if (!unit || !unit._scenario) { sec.setAttribute('hidden', ''); return; }
        const a = marker && marker._attrition;
        let rows;
        if (!a) {
            rows = [['Status this step', tr('up-step-nochange', 'No change this step')]];
        } else {
            rows = [['Status', a.status_change ? String(a.status_change).replace(/_/g, ' ') : tr('up-unknown', 'unknown')]];
            if (Number.isFinite(a.damage_pct)) rows.push(['Damage', Math.round(a.damage_pct * 100) + '%']);
            if (a.cause_what) rows.push(['Cause', a.cause_what]);
            if (a.cause_doctrine) rows.push(['Doctrine cited', a.cause_doctrine]);
            if (Number.isFinite(a.step)) rows.push(['Source', tr('up-step', 'Step') + ' ' + (a.step + 1)]);
        }
        setKv($('up-section-stepstatus-dl'), rows);
        sec.removeAttribute('hidden');
    }

    // Section: Capability Profile — only the honest placeholders not already shown
    // in Operational Status / Combat Readiness / C2 below. No fabricated values.
    function renderCapability(unit) {
        const after = $('up-section-stepstatus') || $('up-section-symprofile') || $('up-section-scn-details') || $('up-section-identity');
        const sec = ensureSection('up-section-capability', tr('up-section-capability', 'Capability Profile'), after);
        if (!sec) return;
        if (!unit || !unit._scenario) { sec.setAttribute('hidden', ''); return; }
        setKv($('up-section-capability-dl'), [
            ['Weapons', tr('up-not-assigned', 'Not assigned'), { na: true }],
            ['Sensors', tr('up-not-assigned', 'Not assigned'), { na: true }],
            ['Damage model', tr('up-cap-damage', 'Scenario step data only'), { na: true }],
        ]);
        sec.removeAttribute('hidden');
    }

    function renderEmpty() {
        const p = panel();
        if (!p) return;
        syncScenarioVisibility();
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
        for (const sid of ['up-section-identity','up-section-scn-details','up-section-symprofile','up-section-stepstatus','up-section-capability','up-section-position','up-section-opstatus','up-section-combat','up-section-c2','up-section-advisor']) {
            showSection(sid, false);
        }
    }

    function renderUnit(unit, selectedAt) {
        const p = panel();
        if (!p || !unit) { renderEmpty(); return; }
        syncScenarioVisibility();
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
            const label = echelonLabel(unit.level);
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
        setText('up-echelon', echelonLabel(unit.level));
        setText('up-code', (unit.code && String(unit.code).trim()) || null);
        // Parent: short tag from parent_id (full lookup is out of scope for PR-3).
        const parentRaw = unit.parent_id || unit.parentId || null;
        const parentShort = parentRaw ? '#' + String(parentRaw).slice(0, 8) : null;
        setText('up-parent', parentShort);

        // P5b — scenario unit enrichment (role / domain / composition / landing-site)
        renderScenarioDetails(unit);

        // P5b — marker-derived readouts (symbol profile, current-step status, capability)
        const _marker = findSelectedMarker(unit);
        renderSymbolProfile(unit, _marker);
        renderStepStatus(unit, _marker);
        renderCapability(unit);

        // Section 2 — Position (prefer the LIVE marker position so it tracks step changes)
        showSection('up-section-position', true);
        let lat = Number(unit.lat), lng = Number(unit.lng);
        if (_marker && typeof _marker.getLatLng === 'function') {
            try { const ll = _marker.getLatLng(); if (ll) { lat = ll.lat; lng = ll.lng; } } catch (_) { /* keep event coords */ }
        }
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
        document.addEventListener('rmooz:scenario-visibility-changed', () => {
            try {
                if (!isScenarioVisible()) {
                    currentUnit = null;
                    currentSelectedAt = null;
                    renderEmpty();
                    return;
                }
                syncScenarioVisibility();
            } catch (_) { /* ignore */ }
        });
        // P5b — when the scenario steps while a unit is selected, re-read the
        // unit's LIVE marker (current position + per-step status) so the panel
        // stays current. Covers BOTH the bottom timeline transport (fires
        // rmooz:timeline-ui-action) and the workspace step-nav buttons
        // (#sw-nav-*, which call goToStep directly). Debounced; small delay lets
        // the step's move / attrition settle before re-reading the marker.
        let _stepRerenderTimer = null;
        function scheduleSelectedRerender() {
            if (!currentUnit) return;
            if (_stepRerenderTimer) clearTimeout(_stepRerenderTimer);
            _stepRerenderTimer = setTimeout(() => {
                _stepRerenderTimer = null;
                try { if (currentUnit) renderUnit(currentUnit, currentSelectedAt); } catch (_) { /* ignore */ }
            }, 180);
        }
        document.addEventListener('rmooz:timeline-ui-action', scheduleSelectedRerender);
        document.addEventListener('click', (e) => {
            const t = e && e.target;
            if (t && typeof t.closest === 'function' && t.closest('[id^="sw-nav-"]')) scheduleSelectedRerender();
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
        syncScenarioVisibility();
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
