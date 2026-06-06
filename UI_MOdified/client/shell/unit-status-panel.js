/**
 * unit-status-panel.js — Commander Unit Status Panel
 *
 * Static read-only right-slide panel showing:
 * - Unit identity (label, uid, side, domain, role, echelon)
 * - Readiness/supply (baseline + applied state overlay)
 * - Sensors, weapons, magazines
 * - Recent STATE_DELTA events
 *
 * Data sources:
 *   - window.RmoozScenario (scenario baseline units)
 *   - window.AppAppliedState (readiness/supply overlay)
 *   - window.AppEventLog (STATE_DELTA event history)
 *   - milsymbol (unit symbols if available)
 *
 * DESIGN: Read-only display only. No edit controls, no mutations,
 * no fake data. Empty-state labels for unavailable fields.
 */
(function (root) {
    'use strict';

    // ── Element lookups ────────────────────────────────────────────
    const $ = (id) => document.getElementById(id);
    const panel = () => $('unit-status-panel');

    let currentUnit = null;

    function tr(key, fallback) {
        if (typeof root.t === 'function') {
            const v = root.t(key);
            if (typeof v === 'string' && v && v !== key) return v;
        }
        return fallback;
    }

    /**
     * Render unit milsymbol in the preview area
     */
    function renderUnitSymbol(unit) {
        const container = $('unit-symbol');
        if (!container) return;
        container.innerHTML = '';

        if (!unit) {
            container.innerHTML = `
                <svg class="symbol-placeholder" viewBox="0 0 100 100" width="80" height="80">
                    <circle cx="50" cy="50" r="40" fill="#f0f0f0" stroke="#ccc" stroke-width="2"/>
                    <text x="50" y="60" font-size="36" font-weight="bold" text-anchor="middle" fill="#999">?</text>
                </svg>
            `;
            return;
        }

        try {
            // If milsymbol and SIDC are available, render symbol
            if (root.ms && typeof root.ms.Symbol === 'function' && unit.sidc) {
                const symbol = new root.ms.Symbol(unit.sidc, { size: 35 });
                const canvas = symbol.getCanvas();
                if (canvas) {
                    container.appendChild(canvas);
                    return;
                }
            }
        } catch (_) { /* fall through */ }

        // Fallback: SVG placeholder with unit label
        const label = (unit.label || '?').charAt(0).toUpperCase();
        container.innerHTML = `
            <svg class="symbol-placeholder" viewBox="0 0 100 100" width="80" height="80">
                <circle cx="50" cy="50" r="40" fill="#f0f0f0" stroke="#ccc" stroke-width="2"/>
                <text x="50" y="60" font-size="36" font-weight="bold" text-anchor="middle" fill="#999">${label}</text>
            </svg>
        `;
    }

    /**
     * Format readiness value with color coding
     */
    function formatReadiness(readiness) {
        const val = (readiness || 'ready').toLowerCase();
        const labels = {
            'ready': tr('readiness-ready', 'Ready'),
            'limited': tr('readiness-limited', 'Limited'),
            'not_ready': tr('readiness-not-ready', 'Not Ready'),
        };
        return labels[val] || val;
    }

    /**
     * Populate panel with unit data
     */
    function populatePanel(unit) {
        if (!unit) {
            // Empty state
            const body = panel()?.querySelector('.panel-body');
            if (body) {
                body.querySelectorAll('.panel-section').forEach(s => s.setAttribute('hidden', ''));
                const empty = $('empty-state');
                if (empty) empty.removeAttribute('hidden');
            }
            return;
        }

        currentUnit = unit;

        // Remove empty state
        const empty = $('empty-state');
        if (empty) empty.setAttribute('hidden', '');

        // 1. Unit identity
        renderUnitSymbol(unit);
        setText('unit-label', unit.label || '—');
        setText('unit-uid', unit.uid || '—');
        setText('unit-side', unit.side || '—');
        setText('unit-domain', unit.domain || '—');
        setText('unit-role', unit.role || '—');

        if (unit.echelon) {
            setText('unit-echelon', unit.echelon);
            $('unit-echelon')?.removeAttribute('hidden');
        } else {
            $('unit-echelon')?.setAttribute('hidden', '');
        }

        // 2. Readiness & Supply
        populateReadinessSupply(unit);

        // 3. Sensors
        populateSensors(unit);

        // 4. Weapons & Magazines
        populateWeapons(unit);

        // 5. Recent STATE_DELTA events
        populateDeltas(unit);
    }

    /**
     * Populate readiness and supply section
     */
    function populateReadinessSupply(unit) {
        const eventLog = getEventLog();
        const appliedState = getAppliedState(unit, eventLog);

        // Readiness
        const baselineReadiness = unit.readiness || 'ready';
        const appliedReadiness = appliedState.readiness;
        const hasReadinessDelta = baselineReadiness !== appliedReadiness;

        const readinessElem = $('readiness-value');
        if (readinessElem) {
            readinessElem.textContent = formatReadiness(appliedReadiness);
            readinessElem.className = `readiness-value ${appliedReadiness}`;
        }

        // Readiness source (applied delta or baseline)
        setText('readiness-source',
            hasReadinessDelta
                ? tr('source-applied', 'Applied (baseline: ' + formatReadiness(baselineReadiness) + ')')
                : tr('source-baseline', 'Baseline')
        );

        // Readiness data source (where the baseline value came from)
        if (!hasReadinessDelta) {
            setText('readiness-data-source', getDataSource(unit, 'readiness'));
        } else {
            setText('readiness-data-source', '');
        }

        // Supply
        const baselineSupply = unit.supply || 0.8;
        const appliedSupply = appliedState.supply;
        const hasSupplyDelta = Math.abs(baselineSupply - appliedSupply) > 0.01;

        const fillElem = $('supply-fill');
        if (fillElem) {
            const pct = Math.round(appliedSupply * 100);
            fillElem.style.width = pct + '%';
            fillElem.textContent = pct + '%';
        }

        setText('supply-pct', Math.round(appliedSupply * 100) + '%');

        // Supply source (applied delta or baseline)
        setText('supply-source',
            hasSupplyDelta
                ? tr('source-applied', 'Applied (baseline: ' + Math.round(baselineSupply * 100) + '%)')
                : tr('source-baseline', 'Baseline')
        );

        // Supply data source (where the baseline value came from)
        if (!hasSupplyDelta) {
            setText('supply-data-source', getDataSource(unit, 'supply'));
        } else {
            setText('supply-data-source', '');
        }
    }

    /**
     * Populate sensors section
     */
    function populateSensors(unit) {
        const sensors = unit.sensors || [];
        const section = $('sensors-section');
        const list = $('sensor-list');
        const emptyState = $('sensors-empty');
        const count = $('sensor-count');

        if (!sensors.length) {
            section?.setAttribute('hidden', '');
            return;
        }

        section?.removeAttribute('hidden');
        if (count) count.textContent = sensors.length;

        if (list) {
            list.innerHTML = '';
            sensors.forEach(sensor => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <strong>${sensor.label || sensor.id || '—'}</strong>
                    ${sensor.type ? `<br><span style="color:#888;font-size:0.85rem">${sensor.type}</span>` : ''}
                `;
                list.appendChild(li);
            });
        }

        if (emptyState) emptyState.setAttribute('hidden', '');
    }

    /**
     * Populate weapons and magazines section
     */
    function populateWeapons(unit) {
        const weapons = unit.weapons || [];
        const magazines = unit.magazines || [];
        const section = $('weapons-section');
        const wlist = $('weapon-list');
        const mlist = $('magazine-list');
        const mtitle = $('magazines-title');
        const emptyState = $('weapons-empty');
        const wcount = $('weapon-count');

        if (!weapons.length && !magazines.length) {
            section?.setAttribute('hidden', '');
            return;
        }

        section?.removeAttribute('hidden');
        if (wcount) wcount.textContent = weapons.length;

        // Weapons
        if (wlist) {
            wlist.innerHTML = '';
            weapons.forEach(weapon => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <strong>${weapon.label || weapon.id || '—'}</strong>
                    ${weapon.class ? `<br><span style="color:#888;font-size:0.85rem">${weapon.class}</span>` : ''}
                `;
                wlist.appendChild(li);
            });
        }

        // Magazines
        if (magazines.length) {
            mtitle?.removeAttribute('hidden');
            if (mlist) {
                mlist.innerHTML = '';
                magazines.forEach(mag => {
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <strong>${mag.mount || 'Magazine'}</strong>
                        ${mag.stock ? `<br><span style="color:#888;font-size:0.85rem">Stock: ${mag.stock}</span>` : ''}
                    `;
                    mlist.appendChild(li);
                });
            }
        } else {
            mtitle?.setAttribute('hidden', '');
        }

        if (emptyState) emptyState.setAttribute('hidden', '');
    }

    /**
     * Populate recent STATE_DELTA events
     */
    function populateDeltas(unit) {
        const eventLog = getEventLog();
        const deltas = extractDeltasForUnit(eventLog, unit.uid);
        const section = $('deltas-section');
        const list = $('delta-list');
        const emptyState = $('deltas-empty');
        const count = $('delta-count');

        // Show only last 5 deltas
        const recent = deltas.slice(-5).reverse();

        if (!recent.length) {
            section?.setAttribute('hidden', '');
            return;
        }

        section?.removeAttribute('hidden');
        if (count) count.textContent = recent.length;

        if (list) {
            list.innerHTML = '';
            recent.forEach(delta => {
                const li = document.createElement('li');
                const deltaType = delta.delta_type || '?';
                const before = delta.value_before !== undefined ? String(delta.value_before) : '?';
                const after = delta.value_after !== undefined ? String(delta.value_after) : '?';
                const timestamp = delta.timestamp || delta.time || '';

                li.innerHTML = `
                    <strong>${deltaType}:</strong> ${before} → ${after}
                    ${timestamp ? `<span class="delta-timestamp">${timestamp}</span>` : ''}
                `;
                list.appendChild(li);
            });
        }

        if (emptyState) emptyState.setAttribute('hidden', '');
    }

    /**
     * Close the panel
     */
    function closePanel() {
        const p = panel();
        if (p) {
            p.setAttribute('hidden', '');
            currentUnit = null;
        }
    }

    function isOperationalScenarioSelection(unit) {
        if (unit && unit._scenario) return true;
        try {
            return !!(root.AppAdjudicatorMap
                && typeof root.AppAdjudicatorMap.isScenarioDrawn === 'function'
                && root.AppAdjudicatorMap.isScenarioDrawn());
        } catch (_) {
            return false;
        }
    }

    /**
     * Open the panel (show it)
     */
    function openPanel() {
        const p = panel();
        if (p) p.removeAttribute('hidden');
    }

    /**
     * Helper: set text content safely
     */
    function setText(id, text) {
        const elem = $(id);
        if (elem) elem.textContent = text;
    }

    /**
     * Get event log (fallback if not available)
     */
    function getEventLog() {
        if (root.AppEventLog && typeof root.AppEventLog.getRows === 'function') {
            return root.AppEventLog.getRows();
        }
        return [];
    }

    /**
     * Get applied state (readiness + supply overlay from event log)
     */
    function getAppliedState(unit, eventLog) {
        if (root.AppAppliedState && typeof root.AppAppliedState.getAppliedState === 'function') {
            return root.AppAppliedState.getAppliedState(unit, eventLog);
        }
        // Fallback: return baseline
        return {
            readiness: unit.readiness || 'ready',
            supply: unit.supply || 0.8
        };
    }

    /**
     * Extract deltas for a unit from event log
     */
    function extractDeltasForUnit(eventLog, unitUid) {
        if (root.AppAppliedState && typeof root.AppAppliedState.extractDeltasForUnit === 'function') {
            return root.AppAppliedState.extractDeltasForUnit(eventLog, unitUid);
        }

        // Fallback: manually filter
        return eventLog
            .filter(e => e && e.payload && e.payload.event_type === 'STATE_DELTA' && e.payload.unit_uid === unitUid)
            .map(e => e.payload);
    }

    /**
     * Setup section collapse/expand toggles
     */
    function setupSectionToggles() {
        document.querySelectorAll('.section-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const controls = btn.getAttribute('aria-controls');
                const list = document.getElementById(controls);

                if (!list) return;

                const isExpanded = btn.getAttribute('aria-expanded') === 'true';
                btn.setAttribute('aria-expanded', !isExpanded);
                list.setAttribute('data-collapsed', isExpanded);
            });
        });
    }

    /**
     * Get data source for readiness/supply values
     */
    function getDataSource(unit, field) {
        if (!unit) return '';

        // Check if value is from scenario baseline
        if (unit[field] !== undefined && unit[field] !== null) {
            return 'Source: Scenario Baseline';
        }

        // Check if platform catalog provides it
        if (unit.platform_id && root.AppMiddleEastPlatform) {
            try {
                const platform = root.AppMiddleEastPlatform.getPlatform(unit.platform_id);
                if (platform && platform[field + '_default'] !== undefined) {
                    return 'Source: Middle East Catalog';
                }
            } catch (_) { /* fall through */ }
        }

        // Default to DB-Lite
        return 'Source: DB-Lite Default';
    }

    /**
     * Setup event listeners
     */
    function setupListeners() {
        // Close button
        const closeBtn = $('panel-close');
        if (closeBtn) closeBtn.addEventListener('click', closePanel);

        // Unit selected event
        document.addEventListener('rmooz:unit-selected', (e) => {
            const unit = e.detail && e.detail.unit;
            if (isOperationalScenarioSelection(unit)) {
                closePanel();
                return;
            }
            if (unit) {
                populatePanel(unit);
                openPanel();
                setupSectionToggles();
            }
        });
    }

    /**
     * Initialize on DOM ready
     */
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupListeners);
        } else {
            setupListeners();
        }
    }

    /**
     * Public API
     */
    const api = {
        openPanel,
        closePanel,
        populatePanel,
    };

    root.AppUnitStatusPanel = api;

    // Auto-initialize
    init();
})(window);
