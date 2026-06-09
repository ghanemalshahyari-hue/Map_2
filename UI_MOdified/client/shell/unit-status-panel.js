/**
 * unit-status-panel.js — Commander Unit Status Panel
 *
 * Static read-only right-slide panel showing:
 * - Unit identity (label, uid, side, domain, role, echelon, DB1 platform label)
 * - Readiness/supply (baseline + applied state overlay, source attribution)
 * - Sensors, weapons, magazines (DB1-enriched when absent from scenario)
 * - Recent STATE_DELTA events
 *
 * Data sources (in precedence order):
 *   1. window.RmoozScenario — scenario baseline units (authored values always win)
 *   2. window.AppAppliedState — readiness/supply overlay from accepted STATE_DELTA events
 *   3. window.AppWorldStateDB — DB-Lite platform/sensor/weapon defaults (DB1, single source)
 *   4. window.AppEventLog — STATE_DELTA event history for delta display section
 *   5. milsymbol — unit symbol rendering if SIDC present
 *
 * UI-Unit-1-C (2026-06-09):
 *   - DB1 enrichment wired: sensors/weapons/magazines filled from catalog when absent
 *     from scenario (AppWorldStateDB.enrichUnit — read-only, never mutates input)
 *   - Source attribution labels show data origin per field (Scenario Baseline /
 *     DB-Lite — {label} / DB-Lite — {kind} (default))
 *   - Platform label appended to role field for DB1 named-platform entries
 *   - Sensor rows now include emcon field
 *   - Magazine stock handles DB1 object format ({ weapon_class: count })
 *   - Source footnote added at bottom of sensor/weapon lists
 *   D5 note: middle-east-platform-loader.js and platforms.json deleted 2026-06-09.
 *   DB1 (AppWorldStateDB) is the single source of truth for capability data.
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

        // Enrich unit with DB1 capability data for display.
        // Read-only — never mutates input; authored fields always take precedence.
        const enriched = enrichUnitForDisplay(unit);

        // 1. Unit identity (always from the raw scenario unit)
        renderUnitSymbol(unit);
        setText('unit-label', unit.label || '—');
        setText('unit-uid', unit.uid || '—');
        setText('unit-side', unit.side || '—');
        setText('unit-domain', unit.domain || '—');

        // Append DB1 platform label to role row when a named catalog entry matched
        const platformLabel = getPlatformLabel(enriched);
        setText('unit-role', platformLabel
            ? (unit.role || '—') + ' · ' + platformLabel
            : (unit.role || '—'));

        if (unit.echelon) {
            setText('unit-echelon', unit.echelon);
            $('unit-echelon')?.removeAttribute('hidden');
        } else {
            $('unit-echelon')?.setAttribute('hidden', '');
        }

        // 2. Readiness & Supply (raw unit for baseline; enriched for DB1 source context)
        populateReadinessSupply(unit, enriched);

        // 3. Sensors — DB1-enriched unit; source label passed for footnote
        populateSensors(enriched, getCapabilitySourceLabel(unit, enriched, 'sensors'));

        // 4. Weapons & Magazines — DB1-enriched unit; source label passed for footnote
        populateWeapons(enriched, getCapabilitySourceLabel(unit, enriched, 'weapons'));

        // 5. Recent STATE_DELTA events (always from raw unit uid)
        populateDeltas(unit);
    }

    /**
     * Populate readiness and supply section.
     * @param {object} unit - Raw scenario unit (baseline readiness/supply values)
     * @param {object} enriched - DB1-enriched unit (provides kind/label for source labels)
     */
    function populateReadinessSupply(unit, enriched) {  // eslint-disable-line no-unused-vars
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
     * Populate sensors section.
     * @param {object} unit - DB1-enriched unit (sensors may come from catalog)
     * @param {string|null} sourceLabel - Data origin label for footnote attribution
     */
    function populateSensors(unit, sourceLabel) {
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
                const emconPart = sensor.emcon ? ' · emcon: ' + sensor.emcon : '';
                const detail = [sensor.type, sensor.class].filter(Boolean).join(' · ') + emconPart;
                li.innerHTML = `
                    <strong>${sensor.label || sensor.id || '—'}</strong>
                    ${detail ? `<br><span style="color:#888;font-size:0.85rem">${detail}</span>` : ''}
                `;
                list.appendChild(li);
            });
            // Source attribution footnote at bottom of list
            if (sourceLabel) {
                const srcLi = document.createElement('li');
                srcLi.style.cssText = 'color:#aaa;font-size:0.78rem;list-style:none;' +
                    'padding-top:0.35rem;border-top:1px solid #f0f0f0;margin-top:0.35rem';
                srcLi.textContent = 'Source: ' + sourceLabel;
                list.appendChild(srcLi);
            }
        }

        if (emptyState) emptyState.setAttribute('hidden', '');
    }

    /**
     * Populate weapons and magazines section.
     * @param {object} unit - DB1-enriched unit (weapons/magazines may come from catalog)
     * @param {string|null} sourceLabel - Data origin label for footnote attribution
     */
    function populateWeapons(unit, sourceLabel) {
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

        // Weapons list
        if (wlist) {
            wlist.innerHTML = '';
            weapons.forEach(weapon => {
                const li = document.createElement('li');
                const mountPart = weapon.mount ? ' · ' + weapon.mount : '';
                li.innerHTML = `
                    <strong>${weapon.label || weapon.id || '—'}</strong>
                    ${weapon.class ? `<br><span style="color:#888;font-size:0.85rem">${weapon.class}${mountPart}</span>` : ''}
                `;
                wlist.appendChild(li);
            });
            // Source attribution footnote at bottom of weapons list
            if (sourceLabel) {
                const srcLi = document.createElement('li');
                srcLi.style.cssText = 'color:#aaa;font-size:0.78rem;list-style:none;' +
                    'padding-top:0.35rem;border-top:1px solid #f0f0f0;margin-top:0.35rem';
                srcLi.textContent = 'Source: ' + sourceLabel;
                wlist.appendChild(srcLi);
            }
        }

        // Magazines list — formatMagStock handles DB1 object format and legacy numbers
        if (magazines.length) {
            mtitle?.removeAttribute('hidden');
            if (mlist) {
                mlist.innerHTML = '';
                magazines.forEach(mag => {
                    const li = document.createElement('li');
                    const stockStr = formatMagStock(mag.stock);
                    li.innerHTML = `
                        <strong>${mag.mount || 'Magazine'}</strong>
                        ${stockStr ? `<br><span style="color:#888;font-size:0.85rem">Stock: ${stockStr}</span>` : ''}
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
     * Get data source label for a readiness/supply field.
     * Priority: Scenario Baseline → DB-Lite named platform → DB-Lite generic role.
     * Returns a human-readable string for display in the panel source row.
     *
     * @param {object} unit - Raw scenario unit (not enriched; authored values only)
     * @param {string} field - 'readiness' | 'supply'
     * @returns {string}
     */
    function getDataSource(unit, field) {
        if (!unit) return '';

        // 1. Scenario baseline: field was explicitly authored in the scenario
        if (unit[field] !== undefined && unit[field] !== null) {
            return 'Scenario Baseline';
        }

        // 2. DB-Lite catalog — named platform or generic role class (DB1, single source)
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

    // ── UI-Unit-1-C: DB1 enrichment helpers (read-only) ────────────

    /**
     * Enrich a unit's sensors/weapons/magazines from DB1 catalog.
     * Returns a new object — NEVER mutates the input unit.
     * Falls back to a shallow clone if AppWorldStateDB is unavailable.
     *
     * @param {object} unit - Raw scenario unit
     * @returns {object} Enriched copy (sensors/weapons/magazines filled from catalog)
     */
    function enrichUnitForDisplay(unit) {
        if (!unit) return unit;
        if (root.AppWorldStateDB && typeof root.AppWorldStateDB.enrichUnit === 'function') {
            try { return root.AppWorldStateDB.enrichUnit(unit); } catch (_) { /* fall through */ }
        }
        return Object.assign({}, unit);
    }

    /**
     * Get the DB1 catalog label for this unit (named platform only).
     * Returns null for generic role classes.
     *
     * @param {object} enrichedUnit - DB1-enriched unit (has .kind set)
     * @returns {string|null}
     */
    function getPlatformLabel(enrichedUnit) {
        if (!root.AppWorldStateDB || !enrichedUnit) return null;
        try {
            const cap = root.AppWorldStateDB.capabilityFor(enrichedUnit);
            return (cap && cap.label) ? cap.label : null;
        } catch (_) { return null; }
    }

    /**
     * Get display-ready source label for a capability section (sensors/weapons).
     * Returns null when the section has no data at all.
     *
     * @param {object} rawUnit - Original scenario unit (before enrichment)
     * @param {object} enrichedUnit - DB1-enriched unit
     * @param {string} field - 'sensors' | 'weapons'
     * @returns {string|null}
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
                const kind = (enrichedUnit.kind) || root.AppWorldStateDB.classifyKind(enrichedUnit);
                return 'DB-Lite — ' + kind + ' (default)';
            } catch (_) { /* fall through */ }
        }
        return 'DB-Lite';
    }

    /**
     * Format a magazine stock value for display.
     * DB1 format: { weapon_class: count }  |  legacy: number
     *
     * @param {number|object|null} stock
     * @returns {string}
     */
    function formatMagStock(stock) {
        if (stock == null) return '';
        if (typeof stock === 'number') return String(Math.round(stock));
        if (typeof stock === 'object') {
            return Object.entries(stock)
                .map(function (kv) { return kv[0].replace(/_/g, ' ') + ': ' + kv[1]; })
                .join(', ');
        }
        return String(stock);
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
