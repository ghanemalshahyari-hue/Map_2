/**
 * unit-status-panel.js — Commander Unit Status Panel (UI-Unit-1-C visual redesign)
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

    var $ = function(id) { return document.getElementById(id); };
    var currentUnit = null;

    // ── i18n helper ───────────────────────────────────────────────────
    function tr(key, fallback) {
        if (typeof root.t === 'function') {
            var v = root.t(key);
            if (typeof v === 'string' && v && v !== key) return v;
        }
        return fallback;
    }

    function setText(id, text) {
        var el = $(id);
        if (el) el.textContent = text;
    }

    // ── Magazine stock formatter ──────────────────────────────────────
    function formatMagStock(stock) {
        if (stock == null) return '';
        if (typeof stock === 'number') return String(Math.round(stock));
        if (typeof stock === 'object') {
            return Object.keys(stock).map(function(k) {
                return k.replace(/_/g, ' ') + ': ' + stock[k];
            }).join(', ');
        }
        return String(stock);
    }

    // ── DB1 enrichment ────────────────────────────────────────────────
    function enrichUnitForDisplay(unit) {
        if (!unit) return unit;
        if (root.AppWorldStateDB && typeof root.AppWorldStateDB.enrichUnit === 'function') {
            try { return root.AppWorldStateDB.enrichUnit(unit); } catch (_) {}
        }
        return Object.assign({}, unit);
    }

    function getPlatformLabel(enrichedUnit) {
        if (!root.AppWorldStateDB || !enrichedUnit) return null;
        try {
            var cap = root.AppWorldStateDB.capabilityFor(enrichedUnit);
            return (cap && cap.label) ? cap.label : null;
        } catch (_) { return null; }
    }

    function getCapabilitySourceLabel(rawUnit, enrichedUnit, field) {
        var rawArr = rawUnit && rawUnit[field];
        if (Array.isArray(rawArr) && rawArr.length) return 'Scenario Baseline';
        var enrichedArr = enrichedUnit && enrichedUnit[field];
        if (!Array.isArray(enrichedArr) || !enrichedArr.length) return null;
        if (root.AppWorldStateDB) {
            try {
                var cap = root.AppWorldStateDB.capabilityFor(enrichedUnit);
                if (cap && cap.label) return 'DB-Lite — ' + cap.label;
                var kind = enrichedUnit.kind || root.AppWorldStateDB.classifyKind(enrichedUnit);
                return 'DB-Lite — ' + kind + ' (default)';
            } catch (_) {}
        }
        return 'DB-Lite';
    }

    function getDataSource(unit, field) {
        if (!unit) return '';
        if (unit[field] !== undefined && unit[field] !== null) return 'Scenario Baseline';
        if (root.AppWorldStateDB) {
            try {
                var cap = root.AppWorldStateDB.capabilityFor(unit);
                if (cap && cap[field] !== undefined) {
                    if (cap.label) return 'DB-Lite — ' + cap.label;
                    var kind = root.AppWorldStateDB.classifyKind(unit);
                    return 'DB-Lite — ' + kind + ' (default)';
                }
            } catch (_) {}
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
            .filter(function(e) {
                return e && e.payload && e.payload.event_type === 'STATE_DELTA'
                    && e.payload.unit_uid === unitUid;
            })
            .map(function(e) { return e.payload; });
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
        var p = $('unit-status-panel');
        if (p) p.removeAttribute('hidden');
    }

    function closePanel() {
        var p = $('unit-status-panel');
        if (p) { p.setAttribute('hidden', ''); currentUnit = null; }
    }

    function _showEmpty() {
        var e = $('empty-state'), b = $('usp-body');
        if (e) e.removeAttribute('hidden');
        if (b) b.setAttribute('hidden', '');
    }

    function _showBody() {
        var e = $('empty-state'), b = $('usp-body');
        if (e) e.setAttribute('hidden', '');
        if (b) b.removeAttribute('hidden');
    }

    function _formatReadiness(val) {
        var map = { ready: 'Ready', limited: 'Limited', not_ready: 'Not Ready' };
        return map[(val || 'ready').toLowerCase()] || val;
    }

    function _capitalise(s) {
        return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';
    }

    // ── Main populate ─────────────────────────────────────────────────
    function populatePanel(unit) {
        if (!unit) { _showEmpty(); return; }
        currentUnit = unit;
        var enriched = enrichUnitForDisplay(unit);
        var eventLog = getEventLog();
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

    // ── Hero ──────────────────────────────────────────────────────────
    function populateHero(unit, enriched) {
        setText('unit-label', unit.label || '—');
        var badge = $('usp-status-badge');
        if (badge) {
            var txt = unit.veteran ? 'VETERAN'
                : unit.elite   ? 'ELITE'
                : unit.status  ? String(unit.status).toUpperCase().slice(0, 12)
                : '';
            badge.textContent = txt;
            badge.style.display = txt ? 'inline-block' : 'none';
        }
        _renderSymbol(unit, $('unit-symbol'));
    }

    function _renderSymbol(unit, container) {
        if (!container) return;
        container.innerHTML = '';
        if (root.ms && typeof root.ms.Symbol === 'function' && unit.sidc) {
            try {
                var sym = new root.ms.Symbol(unit.sidc, { size: 42 });
                var canvas = sym.getCanvas();
                if (canvas) { container.appendChild(canvas); return; }
            } catch (_) {}
        }
        var initial = (unit.label || '?').charAt(0).toUpperCase();
        var domColors = { air: '#1a4a8a', sea: '#1a5a5a', ground: '#3a4a20', strategic: '#4a3a10' };
        var fill = domColors[unit.domain] || '#1a2535';
        container.innerHTML =
            '<svg viewBox="0 0 120 80" width="120" height="80" xmlns="http://www.w3.org/2000/svg">'
          + '<rect x="0" y="0" width="120" height="80" fill="#080c14"/>'
          + '<rect x="1" y="1" width="118" height="78" fill="none" stroke="#1a2a3a" stroke-width="1"/>'
          + '<rect x="45" y="15" width="30" height="30" fill="' + fill + '" stroke="#2a3a4a" stroke-width="1"/>'
          + '<text x="60" y="35" font-size="14" font-weight="bold" text-anchor="middle" fill="#8aaac0"'
          + ' font-family="Consolas,monospace">' + initial + '</text>'
          + '<text x="60" y="60" font-size="8" text-anchor="middle" fill="#3a5060"'
          + ' font-family="Consolas,monospace">' + (unit.domain || '').toUpperCase() + '</text>'
          + '</svg>';
    }

    // ── Identity ──────────────────────────────────────────────────────
    function populateIdentity(unit, enriched) {
        var platformLabel = getPlatformLabel(enriched);
        var pidEl = $('usp-platform-id');
        if (pidEl) {
            var parts = [unit.uid, unit.echelon].filter(Boolean).join(' · ');
            pidEl.textContent = parts || unit.uid || '—';
        }
        var ptEl = $('usp-platform-type');
        if (ptEl) {
            var domain = unit.domain ? unit.domain.toUpperCase() : '';
            var role   = unit.role   ? unit.role.replace(/_/g, ' ') : '';
            ptEl.textContent = platformLabel
                ? (domain ? domain + ' – ' : '') + platformLabel
                : [domain, role].filter(Boolean).join(' – ') || '—';
        }
        setText('unit-uid', unit.uid || '—');
    }

    // ── Core stats ────────────────────────────────────────────────────
    function populateCoreStats(unit, enriched, eventLog) {
        setText('unit-side', unit.side || '—');
        setText('usp-course', unit.course != null ? unit.course + '°' : '—');
        setText('usp-speed',
            (unit.speed != null ? unit.speed + ' kts' : '—')
            + (unit.throttle ? ' (' + _capitalise(unit.throttle) + ')' : ''));

        var appliedState = getAppliedState(unit, eventLog);
        var baselineRead = unit.readiness || 'ready';
        var appliedRead  = appliedState.readiness;
        var hasReadDelta = baselineRead !== appliedRead;

        var chip = $('readiness-value');
        if (chip) {
            chip.textContent = _formatReadiness(appliedRead);
            chip.className   = 'usp-readiness-chip ' + appliedRead;
        }
        setText('readiness-source',
            hasReadDelta ? 'Applied (was: ' + _formatReadiness(baselineRead) + ')' : 'Baseline');
        setText('readiness-data-source', hasReadDelta ? '' : getDataSource(unit, 'readiness'));

        var fillEl = $('usp-readiness-fill');
        if (fillEl) {
            var pctMap = { ready: 100, limited: 50, not_ready: 10 };
            var pct = pctMap[appliedRead] != null ? pctMap[appliedRead] : 0;
            fillEl.style.width = pct + '%';
            fillEl.className = 'usp-bar-fill usp-readiness-fill ' + appliedRead;
        }
    }

    // ── Systems / supply ──────────────────────────────────────────────
    function populateSystems(unit, enriched, eventLog) {
        var appliedState   = getAppliedState(unit, eventLog);
        var baselineSupply = unit.supply != null ? unit.supply : 0.8;
        var appliedSupply  = appliedState.supply;
        var hasSupplyDelta = Math.abs(baselineSupply - appliedSupply) > 0.01;
        var pct = Math.round(appliedSupply * 100);

        var fillEl = $('supply-fill');
        if (fillEl) {
            fillEl.style.width = pct + '%';
            fillEl.textContent = '';
            fillEl.classList.remove('supply-amber', 'supply-red');
            if (pct < 40)      fillEl.classList.add('supply-red');
            else if (pct < 70) fillEl.classList.add('supply-amber');
        }
        setText('supply-pct', pct + '%');
        setText('supply-source',
            hasSupplyDelta ? 'Applied (was: ' + Math.round(baselineSupply * 100) + '%)' : 'Baseline');
        setText('supply-data-source', hasSupplyDelta ? '' : getDataSource(unit, 'supply'));
    }

    // ── Magazines ─────────────────────────────────────────────────────
    function populateMagazines(enriched) {
        var magazines = enriched.magazines || [];
        var list  = $('magazine-list');
        var block = $('usp-magazines-block');
        if (!list) return;
        list.innerHTML = '';
        if (!magazines.length) { if (block) block.style.display = 'none'; return; }
        if (block) block.style.display = '';
        magazines.forEach(function(mag) {
            var li = document.createElement('li');
            var stockStr = formatMagStock(mag.stock);
            var mount = mag.mount || 'Magazine';
            li.innerHTML = '<strong>' + mount + '</strong>'
                + (stockStr ? ' <span style="color:#3a6080;font-size:0.65rem">' + stockStr + '</span>' : '');
            list.appendChild(li);
        });
    }

    // ── Fuel and Ammo ─────────────────────────────────────────────────
    function populateFuelAmmo(unit, enriched) {
        var supplyPct = Math.round((unit.supply != null ? unit.supply : 0.8) * 100);
        var nameEl = $('usp-fuelammo-name');
        if (nameEl) nameEl.textContent = unit.label || '—';
        var fuelFill = $('usp-fuel-fill');
        if (fuelFill) fuelFill.style.width = supplyPct + '%';
        var detail = $('usp-fuelammo-detail');
        if (detail) {
            var tags = enriched.doctrine_tags ? enriched.doctrine_tags.slice(0, 3).join(', ') : '';
            detail.textContent = tags ? '(' + tags + ')' : '';
        }
    }

    // ── Assignment ────────────────────────────────────────────────────
    function populateAssignment(unit) {
        setText('unit-domain',       unit.domain   || '—');
        setText('unit-role',         unit.role     ? unit.role.replace(/_/g, ' ') : '—');
        setText('unit-echelon',      unit.echelon  || '—');
        setText('usp-assigned-base', unit.assigned_base || unit.base || 'None');
        setText('usp-unit-status',   unit.status   || unit.posture || '—');
        var mission = unit.mission || unit.objective || '—';
        var mEl = $('usp-mission');
        if (mEl) {
            mEl.textContent = mission;
            mEl.className = 'usp-arow-val' + (mission !== '—' ? ' usp-link' : '');
        }
    }

    // ── Sensors tab ───────────────────────────────────────────────────
    function populateSensors(unit, sourceLabel) {
        var sensors    = unit.sensors || [];
        var list       = $('sensor-list');
        var emptyState = $('sensors-empty');
        var countEl    = $('sensor-count');
        if (countEl) countEl.textContent = sensors.length ? '[' + sensors.length + ']' : '';
        if (!list) return;
        list.innerHTML = '';
        if (!sensors.length) {
            if (emptyState) emptyState.removeAttribute('hidden');
            return;
        }
        if (emptyState) emptyState.setAttribute('hidden', '');
        sensors.forEach(function(sensor) {
            var li = document.createElement('li');
            var emconPart = sensor.emcon ? ' · emcon: ' + sensor.emcon : '';
            var detailParts = sensor.label
                ? [sensor.class].filter(Boolean)
                : [sensor.type, sensor.class].filter(Boolean);
            var detail = detailParts.join(' · ') + emconPart;
            li.innerHTML = '<strong>' + (sensor.label || sensor.id || '—') + '</strong>'
                + (detail ? '<br><span>' + detail + '</span>' : '');
            list.appendChild(li);
        });
        if (sourceLabel) {
            var src = document.createElement('li');
            src.className = 'capability-source';
            src.textContent = 'Source: ' + sourceLabel;
            list.appendChild(src);
        }
    }

    // ── Weapons tab ───────────────────────────────────────────────────
    function populateWeapons(unit, sourceLabel) {
        var weapons    = unit.weapons || [];
        var list       = $('weapon-list');
        var emptyState = $('weapons-empty');
        var countEl    = $('weapon-count');
        if (countEl) countEl.textContent = weapons.length ? '[' + weapons.length + ']' : '';
        if (!list) return;
        list.innerHTML = '';
        if (!weapons.length) {
            if (emptyState) emptyState.removeAttribute('hidden');
            return;
        }
        if (emptyState) emptyState.setAttribute('hidden', '');
        weapons.forEach(function(weapon) {
            var li = document.createElement('li');
            var mountPart = weapon.mount ? ' · ' + weapon.mount : '';
            li.innerHTML = '<strong>' + (weapon.label || weapon.id || '—') + '</strong>'
                + (weapon.class ? '<br><span>' + weapon.class + mountPart + '</span>' : '');
            list.appendChild(li);
        });
        if (sourceLabel) {
            var src = document.createElement('li');
            src.className = 'capability-source';
            src.textContent = 'Source: ' + sourceLabel;
            list.appendChild(src);
        }
    }

    // ── Speed / Throttle ─────────────────────────────────────────────
    function populateSpeed(unit) {
        var alt = unit.altitude != null
            ? unit.altitude + (unit.altitude_unit || ' ft')
            : (unit.domain === 'air' ? 'Airborne' : '—');
        setText('usp-altitude', alt);
        setText('usp-speed-val', unit.speed != null ? unit.speed + ' kts' : '—');
        var throttleState = (unit.throttle || '').toLowerCase();
        var btns = document.querySelectorAll('#usp-throttle-btns .usp-throttle-btn');
        btns.forEach(function(btn) {
            var t = btn.getAttribute('data-throttle');
            btn.classList.toggle('usp-throttle-btn--active',
                throttleState ? t === throttleState : t === 'cruise');
        });
    }

    // ── Fuel section ─────────────────────────────────────────────────
    function populateFuelSection(unit, enriched) {
        var nameEl = $('usp-fuel-unit-name');
        if (nameEl) nameEl.textContent = unit.label || '—';
        var fuelPct = unit.fuel != null
            ? Math.round(Math.min(1, Math.max(0, unit.fuel)) * 100)
            : Math.round((unit.supply != null ? unit.supply : 0.8) * 100);
        var fuelBar = $('usp-fuel-bar');
        if (fuelBar) fuelBar.style.width = fuelPct + '%';
        var fuelTextEl = $('usp-fuel-text');
        if (fuelTextEl) {
            var remaining = unit.fuel_remaining
                ? unit.fuel_remaining + ' fuel units remaining'
                : fuelPct + '% fuel remaining';
            var fuelType = unit.fuel_type || (unit.domain === 'air' ? 'AvGas' : 'DieselFuel');
            fuelTextEl.innerHTML = remaining
                + '<br><span style="color:#253848">' + fuelType + '</span>';
        }
    }

    // ── EMCON ─────────────────────────────────────────────────────────
    function populateEMCON(enriched) {
        var stateEl = $('usp-emcon-state');
        if (!stateEl) return;
        var sensors = enriched.sensors || [];
        var active  = sensors.filter(function(s) {
            return s.emcon === 'active' || s.emcon === 'always';
        });
        stateEl.textContent = !sensors.length ? '' :
            active.length === sensors.length
                ? 'All sensors ACTIVE (' + sensors.length + ')'
                : active.length + ' / ' + sensors.length + ' sensors active';
    }

    // ── State deltas ──────────────────────────────────────────────────
    function populateDeltas(unit, eventLog) {
        var deltas  = extractDeltasForUnit(eventLog, unit.uid);
        var section = $('deltas-section');
        var list    = $('delta-list');
        var empty   = $('deltas-empty');
        var countEl = $('delta-count');
        var recent  = deltas.slice(-5).reverse();
        if (!recent.length) { if (section) section.setAttribute('hidden', ''); return; }
        if (section) section.removeAttribute('hidden');
        if (countEl) countEl.textContent = '[' + recent.length + ']';
        if (!list) return;
        list.innerHTML = '';
        recent.forEach(function(delta) {
            var li = document.createElement('li');
            var before = delta.value_before !== undefined ? String(delta.value_before) : '?';
            var after  = delta.value_after  !== undefined ? String(delta.value_after)  : '?';
            var ts     = delta.timestamp || delta.time || '';
            li.innerHTML = '<strong>' + (delta.delta_type || '?') + ':</strong> '
                + before + ' → ' + after
                + (ts ? '<span class="delta-timestamp">' + ts + '</span>' : '');
            list.appendChild(li);
        });
        if (empty) empty.setAttribute('hidden', '');
    }

    // ── Tabs ──────────────────────────────────────────────────────────
    function setupTabs() {
        var panel = $('unit-status-panel');
        if (!panel) return;
        panel.querySelectorAll('.usp-tab').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                var tabId = btn.getAttribute('data-tab');
                if (!tabId) return;
                panel.querySelectorAll('.usp-tab').forEach(function(b) {
                    b.classList.remove('usp-tab--active');
                });
                panel.querySelectorAll('.usp-tab-pane').forEach(function(p) {
                    p.classList.remove('usp-tab-pane--active');
                });
                btn.classList.add('usp-tab--active');
                var pane = document.getElementById(tabId);
                if (pane) pane.classList.add('usp-tab-pane--active');
            });
        });
    }

    // ── Collapsible toggles ───────────────────────────────────────────
    function setupSectionToggles() {
        document.querySelectorAll('.usp-collapse-btn').forEach(function(btn) {
            var fresh = btn.cloneNode(true);
            if (btn.parentNode) btn.parentNode.replaceChild(fresh, btn);
            fresh.addEventListener('click', function(e) {
                e.preventDefault();
                var cid = fresh.getAttribute('aria-controls');
                var target = cid ? document.getElementById(cid) : null;
                if (!target) return;
                var expanded = fresh.getAttribute('aria-expanded') === 'true';
                fresh.setAttribute('aria-expanded', !expanded);
                target.setAttribute('data-collapsed', expanded ? 'true' : 'false');
            });
        });
    }

    // ── Event listeners ───────────────────────────────────────────────
    function setupListeners() {
        var closeBtn = $('panel-close');
        if (closeBtn) closeBtn.addEventListener('click', closePanel);
        document.addEventListener('rmooz:unit-selected', function(e) {
            var unit = e.detail && e.detail.unit;
            if (isOperationalScenarioSelection(unit)) { closePanel(); return; }
            if (unit) { populatePanel(unit); openPanel(); }
        });
    }

    // ── Init ──────────────────────────────────────────────────────────
    function init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function() {
                setupListeners(); setupTabs();
            });
        } else {
            setupListeners(); setupTabs();
        }
    }

    root.AppUnitStatusPanel = {
        openPanel: openPanel,
        closePanel: closePanel,
        populatePanel: populatePanel
    };
    init();

})(window);
