/**
 * unit-status-panel.js — Commander Unit Status Panel (UI-Unit-1-C)
 *
 * Military-tactical read-only right-slide panel.
 *
 * Data sources (precedence order):
 *   1. window.RmoozScenario   — scenario baseline (authored values always win)
 *   2. window.AppAppliedState — readiness/supply overlay (STATE_DELTA events)
 *   3. window.AppWorldStateDB — DB-Lite catalog / DB1 (single capability source)
 *   4. window.AppEventLog     — STATE_DELTA history for delta display
 *   5. milsymbol              — unit symbol rendering if SIDC present
 *
 * D5 (2026-06-09): middle-east-platform-loader.js + platforms.json DELETED.
 * DB1 (AppWorldStateDB) is the single source of truth for capability data.
 *
 * DESIGN: Read-only display only. No edit controls, no mutations,
 * no simulation calls. Empty-state labels for unavailable fields.
 */
(function (root) {
    'use strict';

    // ── DOM lookup ────────────────────────────────────────────────────
    const $ = id => document.getElementById(id);
    let currentUnit = null;

    // ── i18n helper ───────────────────────────────────────────────────
    function tr(key, fallback) {
        if (typeof root.t === 'function') {
            const v = root.t(key);
            if (typeof v === 'string' && v && v !== key) return v;
        }
        return fallback;
    }

    // ── Safe text setter ──────────────────────────────────────────────
    function setText(id, text) {
        const el = $(id);
        if (el) el.textContent = text;
    }

    // ── Magazine stock formatter ──────────────────────────────────────
    // Handles DB1 object format { weapon_class: count } and legacy numbers.
    function formatMagStock(stock) {
        if (stock == null) return '';
        if (typeof stock === 'number') return String(Math.round(stock));
        if (typeof stock === 'object') {
            return Object.entries(stock)
                .map(kv => kv[0].replace(/_/g, ' ') + ': ' + kv[1])
                .join(', ');
        }
        return String(stock);
    }

    // ── DB1 enrichment helpers ────────────────────────────────────────

    /** Enrich unit with DB1 sensor/weapon/magazine defaults. Never mutates input. */
    function enrichUnitForDisplay(unit) {
        if (!unit) return unit;
        if (root.AppWorldStateDB && typeof root.AppWorldStateDB.enrichUnit === 'function') {
            try { return root.AppWorldStateDB.enrichUnit(unit); } catch (_) { /* fall through */ }
        }
        return Object.assign({}, unit);
    }

    /** Return DB1 catalog label for this unit if it matches a named entry (e.g. "F-16C Fighting Falcon"). */
    function getPlatformLabel(enrichedUnit) {
        if (!root.AppWorldStateDB || !enrichedUnit) return null;
        try {
            const cap = root.AppWorldStateDB.capabilityFor(enrichedUnit);
            return (cap && cap.label) ? cap.label : null;
        } catch (_) { return null; }
    }

    /**
     * Source label for a capability section (sensors/weapons).
     * Returns "Scenario Baseline", "DB-Lite — {label}", "DB-Lite — {kind} (default)", or null.
     */
    function getCapabilitySourceLabel(rawUnit, enrichedUnit, field) {
        const rawArr = rawUnit && rawUnit[field];
        if (Array.isArray(rawArr) && rawArr.length) return 'Scenario Baseline';
        const enrichedArr = enrichedUnit && enrichedUnit[field];
        if (!Array.isArray(enrichedArr) || !enrichedArr.length) return null;
        if (root.AppWorldStateDB) {
            try {
                const cap = root.AppWorldStateDB.capabilityFor(enrichedUnit);
                if (cap && cap.label) return 'DB-Lite — ' + cap.label;
                const kind = enrichedUnit.kind || root.AppWorldStateDB.classifyKind(enrichedUnit);
                return 'DB-Lite — ' + kind + ' (default)';
            } catch (_) { /* fall through */ }
        }
        return 'DB-Lite';
    }

    /**
     * Source label for readiness/supply scalar fields.
     * Returns "Scenario Baseline", "DB-Lite — {label}", or "DB-Lite — {kind} (default)".
     */
    function getDataSource(unit, field) {
        if (!unit) return '';
        if (unit[field] !== undefined && unit[field] !== null) return 'Scenario Baseline';
        if (root.AppWorldStateDB) {
            try {
                const cap = root.AppWorldStateDB.capabilityFor(unit);
                if (cap && cap[field] !== undefined) {
                    if (cap.label) return 'DB-Lite — ' + cap.label;
                    const kind = root.AppWorldStateDB.classifyKind(unit);
                    return 'DB-Lite — ' + kind + ' (default)';
                }
            } catch (_) { /* fall through */ }
        }
        return 'DB-Lite Default';
    }

    // ── Event log / applied state ─────────────────────────────────────

    function getEventLog() {
        if (root.AppEventLog && typeof root.AppEventLog.getRows === 'function') {
            return root.AppEventLog.getRows();
        }
        return [];
    }

    function getAppliedState(unit, eventLog) {
        if (root.AppAppliedState && typeof root.AppAppliedState.getAppliedState === 'function') {
            return root.AppAppliedState.getAppliedState(unit, eventLog);
        }
        return { readiness: unit.readiness || 'ready', supply: unit.supply || 0.8 };
    }

    function extractDeltasForUnit(eventLog, unitUid) {
        if (root.AppAppliedState && typeof root.AppAppliedState.extractDeltasForUnit === 'function') {
            return root.AppAppliedState.extractDeltasForUnit(eventLog, unitUid);
        }
        return eventLog
            .filter(e => e && e.payload && e.payload.event_type === 'STATE_DELTA' && e.payload.unit_uid === unitUid)
            .map(e => e.payload);
    }

    // ── Scenario guard ────────────────────────────────────────────────

    function isOperationalScenarioSelection(unit) {
        if (unit && unit._scenario) return true;
        try {
            return !!(root.AppAdjudicatorMap
                && typeof root.AppAdjudicatorMap.isScenarioDrawn === 'function'
                && root.AppAdjudicatorMap.isScenarioDrawn());
        } catch (_) { return false; }
    }

    // ── Panel open/close ──────────────────────────────────────────────

    function openPanel() {
        const p = $('unit-status-panel');
        if (p) p.removeAttribute('hidden');
    }

    function closePanel() {
        const p = $('unit-status-panel');
        if (p) { p.setAttribute('hidden', ''); currentUnit = null; }
    }

    // ── Main populate ─────────────────────────────────────────────────

    function populatePanel(unit) {
        if (!unit) {
            _showEmpty();
            return;
        }
        currentUnit = unit;

        // DB1 enrichment — fills missing sensors/weapons/magazines from catalog
        const enriched = enrichUnitForDisplay(unit);
        const eventLog = getEventLog();

        _showBody();

        populateHero(unit, enriched);
        populateIdentity(unit, enriched);
        populateCoreStats(unit, enriched, eventLog);
        populateSystems(unit, enriched, eventLog);
        populateMagazines(enriched);
        populateFuelAmmo(unit, enriched);
        populateAssignment(unit);
        populateSensors(enriched, getCapabilitySourceLabel(unit, enriched, 'sensors'));
        populateWeapons(enriched, getCapabilitySourceLabel(unit, enriched, 'weapons'));
        populateSpeed(unit);
        populateFuelSection(unit, enriched);
        populateEMCON(enriched);
        populateDeltas(unit, eventLog);

        setupSectionToggles();
    }

    // ── Hero section ──────────────────────────────────────────────────

    function populateHero(unit, enriched) {
        // Unit name
        setText('unit-label', unit.label || '—');

        // Status badge: use unit.status, unit.readiness, or doctrine hint
        const badge = $('usp-status-badge');
        if (badge) {
            const statusText = unit.veteran ? 'VETERAN'
                : unit.elite   ? 'ELITE'
                : unit.status  ? String(unit.status).toUpperCase().slice(0, 12)
                : '';
            badge.textContent = statusText;
            badge.style.display = statusText ? 'inline-block' : 'none';
        }

        // Symbol — milsymbol if SIDC present, else placeholder
        _renderSymbol(unit, $('unit-symbol'));
    }

    function _renderSymbol(unit, container) {
        if (!container) return;
        container.innerHTML = '';
        // Try milsymbol
        if (root.ms && typeof root.ms.Symbol === 'function' && unit.sidc) {
            try {
                const sym = new root.ms.Symbol(unit.sidc, { size: 42 });
                const canvas = sym.getCanvas();
                if (canvas) { container.appendChild(canvas); return; }
            } catch (_) { /* fall through */ }
        }
        // SVG placeholder — show initial + domain icon
        const initial = (unit.label || '?').charAt(0).toUpperCase();
        const domainColors = { air: '#1a4a8a', sea: '#1a5a5a', ground: '#3a4a20', strategic: '#4a3a10' };
        const fill = domainColors[unit.domain] || '#1a2535';
        container.innerHTML = `
            <svg viewBox="0 0 120 80" width="120" height="80" xmlns="http://www.w3.org/2000/svg">
                <rect x="0" y="0" width="120" height="80" fill="#080c14"/>
                <rect x="1" y="1" width="118" height="78" fill="none" stroke="#1a2a3a" stroke-width="1"/>
                <rect x="45" y="15" width="30" height="30" fill="${fill}" stroke="#2a3a4a" stroke-width="1"/>
                <text x="60" y="35" font-size="14" font-weight="bold" text-anchor="middle" fill="#8aaac0"
                      font-family="Consolas,monospace">${initial}</text>
                <text x="60" y="60" font-size="8" text-anchor="middle" fill="#3a5060"
                      font-family="Consolas,monospace" text-transform="uppercase">
                    ${(unit.domain || '').toUpperCase()}
                </text>
            </svg>`;
    }

    // ── Identity block ────────────────────────────────────────────────

    function populateIdentity(unit, enriched) {
        const platformLabel = getPlatformLabel(enriched);

        // Platform ID line: uid + echelon (CMO-style "CVS 39 Lake Champlain")
        const pidEl = $('usp-platform-id');
        if (pidEl) {
            const parts = [unit.uid, unit.echelon].filter(Boolean).join(' · ');
            pidEl.textContent = parts || unit.uid || '—';
        }

        // Platform type line: DB1 label as type descriptor
        const ptEl = $('usp-platform-type');
        if (ptEl) {
            const domain = unit.domain ? unit.domain.toUpperCase() : '';
            const role   = unit.role   ? unit.role.replace(/_/g, ' ') : '';
            ptEl.textContent = platformLabel
                ? (domain ? domain + ' – ' : '') + platformLabel
                : [domain, role].filter(Boolean).join(' – ') || '—';
        }

        setText('unit-uid', unit.uid || '—');
    }

    // ── Core stats row ────────────────────────────────────────────────

    function populateCoreStats(unit, enriched, eventLog) {
        // Side
        setText('unit-side', unit.side || '—');

        // Course (degrees)
        const course = unit.course != null ? unit.course + '°' : '—';
        setText('usp-course', course);

        // Speed
        const speedVal = unit.speed != null ? unit.speed + ' kts' : '—';
        const throttle = unit.throttle ? ' (' + _capitalise(unit.throttle) + ')' : '';
        setText('usp-speed', speedVal + throttle);

        // Readiness chip + bar
        const appliedState = getAppliedState(unit, eventLog);
        const baselineReadiness = unit.readiness || 'ready';
        const appliedReadiness  = appliedState.readiness;
        const hasReadinessDelta = baselineReadiness !== appliedReadiness;

        const chip = $('readiness-value');
        if (chip) {
            chip.textContent = _formatReadiness(appliedReadiness);
            chip.className = 'usp-readiness-chip ' + appliedReadiness;
        }

        setText('readiness-source',
            hasReadinessDelta
                ? 'Applied (was: ' + _formatReadiness(baselineReadiness) + ')'
                : 'Baseline');

        if (!hasReadinessDelta) {
            setText('readiness-data-source', getDataSource(unit, 'readiness'));
        } else {
            setText('readiness-data-source', '');
        }

        // Readiness fill bar
        const fillEl = $('usp-readiness-fill');
        if (fillEl) {
            const pctMap = { ready: 100, limited: 50, not_ready: 10 };
            const pct = pctMap[appliedReadiness] != null ? pctMap[appliedReadiness] : 0;
            fillEl.style.width = pct + '%';
            fillEl.className = 'usp-bar-fill usp-readiness-fill ' + appliedReadiness;
        }
    }

    // ── Systems / supply block ────────────────────────────────────────

    function populateSystems(unit, enriched, eventLog) {
        const appliedState = getAppliedState(unit, eventLog);
        const baselineSupply = unit.supply || 0.8;
        const appliedSupply  = appliedState.supply;
        const hasSupplyDelta = Math.abs(baselineSupply - appliedSupply) > 0.01;
        const pct = Math.round(appliedSupply * 100);

        // Supply bar
        const fillEl = $('supply-fill');
        if (fillEl) {
            fillEl.style.width = pct + '%';
            fillEl.textContent = '';
            fillEl.classList.remove('supply-amber', 'supply-red');
            if (pct < 40)      fillEl.classList.add('supply-red');
            else if (pct < 70) fillEl.classList.add('supply-amber');
        }

        setText('supply-pct', pct + '%');
        setText('supply-source',
            hasSupplyDelta
                ? 'Applied (was: ' + Math.round(baselineSupply * 100) + '%)'
                : 'Baseline');

        if (!hasSupplyDelta) {
            setText('supply-data-source', getDataSource(unit, 'supply'));
        } else {
            setText('supply-data-source', '');
        }
    }

    // ── Magazines block ───────────────────────────────────────────────

    function populateMagazines(enriched) {
        const magazines = enriched.magazines || [];
        const list = $('magazine-list');
        const block = $('usp-magazines-block');

        if (!list) return;
        list.innerHTML = '';

        if (!magazines.length) {
            if (block) block.style.display = 'none';
            return;
        }
        if (block) block.style.display = '';

        magazines.forEach(mag => {
            const li = document.createElement('li');
            const stockStr = formatMagStock(mag.stock);
            const mount = mag.mount || 'Magazine';
            li.innerHTML = `<strong>${mount}</strong>`
                + (stockStr ? ` <span style="color:#3a6080;font-size:0.65rem">${stockStr}</span>` : '');
            list.appendChild(li);
        });
    }

    // ── Fuel and Ammo block ───────────────────────────────────────────

    function populateFuelAmmo(unit, enriched) {
        // Use supply as proxy for "fuel and ammo" level
        const supplyPct = Math.round((unit.supply != null ? unit.supply : 0.8) * 100);

        const nameEl = $('usp-fuelammo-name');
        if (nameEl) nameEl.textContent = unit.label || '—';

        const fuelFill = $('usp-fuel-fill');
        if (fuelFill) {
            fuelFill.style.width = supplyPct + '%';
        }

        const detail = $('usp-fuelammo-detail');
        if (detail) {
            const doctrine = enriched.doctrine_tags ? enriched.doctrine_tags.slice(0, 3).join(', ') : '';
            detail.textContent = doctrine ? '(' + doctrine + ')' : '';
        }
    }

    // ── Assignment block ──────────────────────────────────────────────

    function populateAssignment(unit) {
        setText('unit-domain',      unit.domain   || '—');
        setText('unit-role',        unit.role     ? unit.role.replace(/_/g, ' ') : '—');
        setText('unit-echelon',     unit.echelon  || '—');
        setText('usp-assigned-base', unit.assigned_base || unit.base || 'None');
        setText('usp-unit-status',   unit.status        || unit.posture || '—');

        const mission = unit.mission || unit.objective || '—';
        const mEl = $('usp-mission');
        if (mEl) {
            mEl.textContent = mission;
            mEl.className = 'usp-arow-val' + (mission !== '—' ? ' usp-link' : '');
        }
    }

    // ── Sensors tab ───────────────────────────────────────────────────

    function populateSensors(unit, sourceLabel) {
        const sensors = unit.sensors || [];
        const list      = $('sensor-list');
        const emptyState = $('sensors-empty');
        const countEl   = $('sensor-count');

        if (countEl) countEl.textContent = sensors.length ? '[' + sensors.length + ']' : '';

        if (!list) return;
        list.innerHTML = '';

        if (!sensors.length) {
            if (emptyState) emptyState.removeAttribute('hidden');
            return;
        }
        if (emptyState) emptyState.setAttribute('hidden', '');

        sensors.forEach(sensor => {
            const li = document.createElement('li');
            const emconPart = sensor.emcon ? ' · emcon: ' + sensor.emcon : '';
            // When a descriptive label is present, skip `type` (already in label text)
            const detailParts = sensor.label
                ? [sensor.class].filter(Boolean)
                : [sensor.type, sensor.class].filter(Boolean);
            const detail = detailParts.join(' · ') + emconPart;
            li.innerHTML = `<strong>${sensor.label || sensor.id || '—'}</strong>`
                + (detail ? `<br><span>${detail}</span>` : '');
            list.appendChild(li);
        });

        if (sourceLabel) {
            const src = document.createElement('li');
            src.className = 'capability-source';
            src.textContent = 'Source: ' + sourceLabel;
            list.appendChild(src);
        }
    }

    // ── Weapons tab ───────────────────────────────────────────────────

    function populateWeapons(unit, sourceLabel) {
        const weapons   = unit.weapons   || [];
        const list      = $('weapon-list');
        const emptyState = $('weapons-empty');
        const countEl   = $('weapon-count');

        if (countEl) countEl.textContent = weapons.length ? '[' + weapons.length + ']' : '';

        if (!list) return;
        list.innerHTML = '';

        if (!weapons.length) {
            if (emptyState) emptyState.removeAttribute('hidden');
            return;
        }
        if (emptyState) emptyState.setAttribute('hidden', '');

        weapons.forEach(weapon => {
            const li = document.createElement('li');
            const mountPart = weapon.mount ? ' · ' + weapon.mount : '';
            li.innerHTML = `<strong>${weapon.label || weapon.id || '—'}</strong>`
                + (weapon.class ? `<br><span>${weapon.class}${mountPart}</span>` : '');
            list.appendChild(li);
        });

        if (sourceLabel) {
            const src = document.createElement('li');
            src.className = 'capability-source';
            src.textContent = 'Source: ' + sourceLabel;
            list.appendChild(src);
        }
    }

    // ── Speed / Throttle section ──────────────────────────────────────

    function populateSpeed(unit) {
        // Altitude
        const alt = unit.altitude != null
            ? unit.altitude + (unit.altitude_unit || ' ft')
            : (unit.domain === 'air' ? 'Airborne' : '—');
        setText('usp-altitude', alt);

        // Speed
        const spd = unit.speed != null ? unit.speed + ' kts' : '—';
        setText('usp-speed-val', spd);

        // Throttle state display (read-only)
        const throttleState = (unit.throttle || '').toLowerCase();
        const btns = document.querySelectorAll('#usp-throttle-btns .usp-throttle-btn');
        btns.forEach(btn => {
            const t = btn.getAttribute('data-throttle');
            btn.classList.toggle('usp-throttle-btn--active',
                throttleState ? t === throttleState : t === 'cruise');
        });
    }

    // ── Fuel (detailed) section ───────────────────────────────────────

    function populateFuelSection(unit, enriched) {
        const fuelNameEl = $('usp-fuel-unit-name');
        if (fuelNameEl) fuelNameEl.textContent = unit.label || '—';

        const fuelPct = unit.fuel != null
            ? Math.round(Math.min(1, Math.max(0, unit.fuel)) * 100)
            : Math.round((unit.supply != null ? unit.supply : 0.8) * 100);

        const fuelBar = $('usp-fuel-bar');
        if (fuelBar) fuelBar.style.width = fuelPct + '%';

        const fuelTextEl = $('usp-fuel-text');
        if (fuelTextEl) {
            const remaining = unit.fuel_remaining
                ? unit.fuel_remaining + ' fuel units remaining'
                : fuelPct + '% fuel remaining';
            const fuelType = unit.fuel_type || (unit.domain === 'air' ? 'AvGas' : 'DieselFuel');
            fuelTextEl.innerHTML = remaining + '<br><span style="color:#253848">' + fuelType + '</span>';
        }
    }

    // ── EMCON section ─────────────────────────────────────────────────

    function populateEMCON(enriched) {
        const stateEl = $('usp-emcon-state');
        if (!stateEl) return;
        const sensors = enriched.sensors || [];
        const activeSensors = sensors.filter(s => s.emcon === 'active' || s.emcon === 'always');
        if (!sensors.length) {
            stateEl.textContent = '';
        } else {
            const emconSummary = activeSensors.length === sensors.length
                ? 'All sensors ACTIVE (' + sensors.length + ')'
                : activeSensors.length + ' / ' + sensors.length + ' sensors active';
            stateEl.textContent = emconSummary;
        }
    }

    // ── State deltas section ──────────────────────────────────────────

    function populateDeltas(unit, eventLog) {
        const deltas   = extractDeltasForUnit(eventLog, unit.uid);
        const section  = $('deltas-section');
        const list     = $('delta-list');
        const empty    = $('deltas-empty');
        const countEl  = $('delta-count');

        const recent = deltas.slice(-5).reverse();

        if (!recent.length) {
            if (section) section.setAttribute('hidden', '');
            return;
        }
        if (section) section.removeAttribute('hidden');
        if (countEl) countEl.textContent = '[' + recent.length + ']';

        if (!list) return;
        list.innerHTML = '';
        recent.forEach(delta => {
            const li = document.createElement('li');
            const before = delta.value_before !== undefined ? String(delta.value_before) : '?';
            const after  = delta.value_after  !== undefined ? String(delta.value_after)  : '?';
            const ts = delta.timestamp || delta.time || '';
            li.innerHTML = `<strong>${delta.delta_type || '?'}:</strong> ${before} → ${after}`
                + (ts ? `<span class="delta-timestamp">${ts}</span>` : '');
            list.appendChild(li);
        });
        if (empty) empty.setAttribute('hidden', '');
    }

    // ── Tab switching ─────────────────────────────────────────────────

    function setupTabs() {
        const panel = $('unit-status-panel');
        if (!panel) return;
        panel.querySelectorAll('.usp-tab').forEach(btn => {
            btn.addEventListener('click', e => {
                e.preventDefault();
                const tabId = btn.getAttribute('data-tab');
                if (!tabId) return;
                // Deactivate all tabs and panes
                panel.querySelectorAll('.usp-tab').forEach(b => b.classList.remove('usp-tab--active'));
                panel.querySelectorAll('.usp-tab-pane').forEach(p => p.classList.remove('usp-tab-pane--active'));
                // Activate selected
                btn.classList.add('usp-tab--active');
                const pane = document.getElementById(tabId);
                if (pane) pane.classList.add('usp-tab-pane--active');
            });
        });
    }

    // ── Collapsible section toggles ───────────────────────────────────

    function setupSectionToggles() {
        document.querySelectorAll('.section-toggle, .usp-collapse-btn').forEach(btn => {
            // Clone to remove existing listeners
            const fresh = btn.cloneNode(true);
            btn.parentNode.replaceChild(fresh, btn);
            fresh.addEventListener('click', e => {
                e.preventDefault();
                const controlsId = fresh.getAttribute('aria-controls');
                const target = controlsId ? document.getElementById(controlsId) : null;
                if (!target) return;
                const isExpanded = fresh.getAttribute('aria-expanded') === 'true';
                fresh.setAttribute('aria-expanded', !isExpanded);
                target.setAttribute('data-collapsed', isExpanded);
            });
        });
    }

    // ── Show/hide helpers ─────────────────────────────────────────────

    function _showEmpty() {
        const empty = $('empty-state');
        const body  = $('usp-body');
        if (empty) empty.removeAttribute('hidden');
        if (body)  body.setAttribute('hidden', '');
    }

    function _showBody() {
        const empty = $('empty-state');
        const body  = $('usp-body');
        if (empty) empty.setAttribute('hidden', '');
        if (body)  body.removeAttribute('hidden');
    }

    // ── Formatting helpers ────────────────────────────────────────────

    function _formatReadiness(val) {
        const map = { ready: 'Ready', limited: 'Limited', not_ready: 'Not Ready' };
        return map[(val || 'ready').toLowerCase()] || val;
    }

    function _capitalise(s) {
        return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
    }

    // ── Event listeners ───────────────────────────────────────────────

    function setupListeners() {
        const closeBtn = $('panel-close');
        if (closeBtn) closeBtn.addEventListener('click', closePanel);

        document.addEventListener('rmooz:unit-selected', e => {
            const unit = e.detail && e.detail.unit;
            if (isOperationalScenarioSelection(unit)) { closePanel(); return; }
            if (unit) { populatePanel(unit); openPanel(); }
        });
    }

    // ── Init ──────────────────────────────────────────────────────────

    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => { setupListeners(); setupTabs(); });
        } else {
            setupListeners();
            setupTabs();
        }
    }

    // ── Public API ────────────────────────────────────────────────────

    root.AppUnitStatusPanel = { openPanel, closePanel, populatePanel };
    init();

})(window);
