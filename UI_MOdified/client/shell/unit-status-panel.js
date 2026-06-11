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
        var tab = $('usp-reopen-tab');
        if (tab) tab.setAttribute('hidden', '');
    }

    function closePanel() {
        var p = $('unit-status-panel');
        if (p) p.setAttribute('hidden', '');
        // Show reopen tab only if we had a unit (operator deliberately closed)
        var tab = $('usp-reopen-tab');
        if (tab && currentUnit) tab.removeAttribute('hidden');
        currentUnit = null;
    }

    function _showEmpty() {
        // When no unit is selected, close the panel entirely (no blank empty state)
        closePanel();
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
    function populatePanel(unit, selectedAt) {
        if (!unit) { _showEmpty(); return; }
        currentUnit = unit;
        var enriched = enrichUnitForDisplay(unit);
        var eventLog = getEventLog();
        _showBody();
        populateHero(unit, enriched);
        populateIdentity(unit, enriched, selectedAt);
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
            var txt = unit.veteran ? tr('usp-badge-veteran','VETERAN')
                : unit.elite   ? tr('usp-badge-elite','ELITE')
                : unit.status  ? String(unit.status).toUpperCase().slice(0, 12)
                : '';
            badge.textContent = txt;
            badge.style.display = txt ? 'inline-block' : 'none';
        }
        _renderSymbol(unit, enriched, $('unit-symbol'));
    }

    /* ── Unit silhouette SVGs (inline, no external files) ─────────────── */
    var _SVG = (function() {
        var BG  = '<rect width="280" height="100" fill="#080c14"/>';
        var GRD = '<g stroke="#14202e" stroke-width="0.5" opacity="0.5">'
                + '<line x1="0" y1="25" x2="280" y2="25"/>'
                + '<line x1="0" y1="50" x2="280" y2="50"/>'
                + '<line x1="0" y1="75" x2="280" y2="75"/>'
                + '<line x1="70" y1="0" x2="70" y2="100"/>'
                + '<line x1="140" y1="0" x2="140" y2="100"/>'
                + '<line x1="210" y1="0" x2="210" y2="100"/>'
                + '</g>';
        var OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 280 100" '
                 + 'style="width:100%;height:100%;display:block">';
        var CLOSE = '</svg>';

        function make(body) { return OPEN + BG + GRD + body + CLOSE; }

        // ── Fighter jet (top-down silhouette) ────────────────────────────
        var FIGHTER = make(
            '<g transform="translate(140,50)" fill="#2a5080" stroke="#4a80b8" stroke-width="0.8">'
          + '<ellipse cx="0" cy="0" rx="5" ry="36"/>'   // fuselage
          + '<path d="M0,-18 L-36,12 L-28,16 L0,2 L28,16 L36,12 Z"/>'  // main wings
          + '<path d="M0,27 L-15,38 L-11,40 L0,32 L11,40 L15,38 Z"/>'  // tail fins
          + '<ellipse cx="0" cy="-22" rx="3" ry="7" fill="#6aaae0" opacity="0.7"/>' // canopy
          + '<circle cx="0" cy="-36" r="2.5" fill="#6aaae0"/>'          // nose
          + '</g>'
          + '<text x="140" y="94" text-anchor="middle" fill="#3a6080" '
          + 'font-size="7" font-family="Consolas,monospace">FIGHTER / STRIKE</text>'
        );

        // ── AWACS (top-down + rotodome disc) ────────────────────────────
        var AWACS = make(
            '<g transform="translate(140,50)" fill="#2a5080" stroke="#4a80b8" stroke-width="0.8">'
          + '<ellipse cx="0" cy="0" rx="5" ry="40"/>'    // long fuselage
          + '<path d="M0,-10 L-32,18 L-25,22 L0,6 L25,22 L32,18 Z"/>'  // wings
          + '<ellipse cx="0" cy="-5" rx="22" ry="7" fill="#1a3060" stroke="#4a80b8"/>'  // rotodome
          + '<line x1="-22" y1="-5" x2="22" y2="-5" stroke="#4a80b8" stroke-width="1"/>'
          + '<circle cx="0" cy="-5" r="3" fill="#4a80b8"/>'
          + '<path d="M0,30 L-10,40 L-7,42 L0,36 L7,42 L10,40 Z" fill="#2a5080"/>'
          + '</g>'
          + '<text x="140" y="94" text-anchor="middle" fill="#3a6080" '
          + 'font-size="7" font-family="Consolas,monospace">AWACS / AEW</text>'
        );

        // ── Ship (side silhouette) ───────────────────────────────────────
        var SHIP = make(
            '<g transform="translate(140,50)" fill="#1a4a6a" stroke="#3a7aa0" stroke-width="0.8">'
          + '<path d="M-70,18 L-60,0 L-30,-5 L30,-5 L60,0 L70,18 L60,22 L-60,22 Z"/>'  // hull
          + '<rect x="-20" y="-24" width="40" height="22" rx="2"/>'  // superstructure
          + '<rect x="-8" y="-36" width="16" height="15"/>'           // bridge top
          + '<line x1="0" y1="-36" x2="0" y2="-50" stroke="#3a7aa0" stroke-width="1.5"/>'  // mast
          + '<rect x="-6" y="-28" width="12" height="8" fill="#12304a"/>'  // window
          + '<line x1="-60" y1="0" x2="-70" y2="0" stroke="#3a7aa0" stroke-width="1"/>'  // bow
          + '<rect x="20" y="-15" width="8" height="12" rx="1" fill="#12304a"/>'  // funnel
          + '</g>'
          + '<text x="140" y="94" text-anchor="middle" fill="#3a6080" '
          + 'font-size="7" font-family="Consolas,monospace">NAVAL COMBATANT</text>'
        );

        // ── Patrol boat (smaller than ship) ─────────────────────────────
        var PATROL = make(
            '<g transform="translate(140,55)" fill="#1a4a6a" stroke="#3a7aa0" stroke-width="0.8">'
          + '<path d="M-45,12 L-38,-2 L-10,-8 L10,-8 L38,-2 L45,12 L38,16 L-38,16 Z"/>'
          + '<rect x="-10" y="-20" width="20" height="14" rx="2"/>'
          + '<line x1="0" y1="-20" x2="0" y2="-34" stroke="#3a7aa0" stroke-width="1.5"/>'
          + '<line x1="-20" y1="-5" x2="-30" y2="-14" stroke="#3a7aa0" stroke-width="1.5"/>'
          + '</g>'
          + '<text x="140" y="94" text-anchor="middle" fill="#3a6080" '
          + 'font-size="7" font-family="Consolas,monospace">PATROL CRAFT</text>'
        );

        // ── Tank (side silhouette) ───────────────────────────────────────
        var TANK = make(
            '<g transform="translate(140,52)" fill="#2a4a18" stroke="#4a8030" stroke-width="0.8">'
          + '<rect x="-42" y="8" width="84" height="20" rx="4"/>'  // hull
          + '<rect x="-24" y="-12" width="40" height="22" rx="3"/>'  // turret
          + '<rect x="14" y="-5" width="34" height="5" rx="2"/>'    // barrel
          + '<ellipse cx="-38" cy="26" rx="10" ry="6" fill="#1a3010"/>'  // track L
          + '<ellipse cx="38" cy="26" rx="10" ry="6" fill="#1a3010"/>'   // track R
          + '<rect x="-42" y="20" width="84" height="12" rx="2" fill="#1a3010"/>'  // track body
          + '<circle cx="-28" cy="26" r="5" fill="#2a4a18" stroke="#3a6020"/>'  // wheel L
          + '<circle cx="28" cy="26" r="5" fill="#2a4a18" stroke="#3a6020"/>'   // wheel R
          + '</g>'
          + '<text x="140" y="94" text-anchor="middle" fill="#3a6030" '
          + 'font-size="7" font-family="Consolas,monospace">MAIN BATTLE TANK</text>'
        );

        // ── SAM launcher (side view, missiles upward) ────────────────────
        var SAM = make(
            '<g transform="translate(140,55)" fill="#1a3a6a" stroke="#3a6ab0" stroke-width="0.8">'
          + '<rect x="-50" y="10" width="100" height="14" rx="3"/>'    // vehicle hull
          + '<rect x="-44" y="16" width="90" height="10" rx="2" fill="#0e2448"/>  '  // tracks
          // Launcher arm elevated
          + '<rect x="-5" y="-30" width="10" height="44" rx="2" transform="rotate(-5,-5,-30)"/>'
          // Missiles
          + '<g fill="#2a5090" stroke="#4a80c0">'
          + '<rect x="-22" y="-38" width="7" height="28" rx="3"/>'   // missile 1
          + '<polygon points="-22,-38 -15,-38 -18.5,-46"/>'           // tip 1
          + '<rect x="-12" y="-42" width="7" height="30" rx="3"/>'   // missile 2
          + '<polygon points="-12,-42 -5,-42 -8.5,-50"/>'             // tip 2
          + '<rect x="5" y="-42" width="7" height="30" rx="3"/>'     // missile 3
          + '<polygon points="5,-42 12,-42 8.5,-50"/>'                // tip 3
          + '<rect x="15" y="-38" width="7" height="28" rx="3"/>'    // missile 4
          + '<polygon points="15,-38 22,-38 18.5,-46"/>'              // tip 4
          + '</g>'
          // Radar dish
          + '<ellipse cx="36" cy="-20" rx="16" ry="8" fill="none" stroke="#4a80c0" stroke-width="1.5"/>'
          + '<line x1="36" y1="-20" x2="36" y2="5" stroke="#4a80c0" stroke-width="1.5"/>'
          + '</g>'
          + '<text x="140" y="94" text-anchor="middle" fill="#2a4880" '
          + 'font-size="7" font-family="Consolas,monospace">SAM BATTERY</text>'
        );

        // ── SHORAD / AAA (short-range air defense) ───────────────────────
        var SHORAD = make(
            '<g transform="translate(140,55)" fill="#1a3a6a" stroke="#3a6ab0" stroke-width="0.8">'
          + '<rect x="-40" y="8" width="80" height="14" rx="3"/>'
          + '<rect x="-36" y="14" width="72" height="10" rx="2" fill="#0e2448"/>'
          + '<rect x="-5" y="-5" width="10" height="20" rx="2"/>'
          // Twin barrels
          + '<rect x="-10" y="-28" width="6" height="30" rx="2"/>'
          + '<rect x="4" y="-28" width="6" height="30" rx="2"/>'
          // Radar
          + '<ellipse cx="28" cy="-10" rx="12" ry="5" fill="none" stroke="#4a80c0" stroke-width="1.2"/>'
          + '<line x1="28" y1="-10" x2="28" y2="5" stroke="#4a80c0" stroke-width="1.2"/>'
          + '</g>'
          + '<text x="140" y="94" text-anchor="middle" fill="#2a4880" '
          + 'font-size="7" font-family="Consolas,monospace">SHORAD / AAA</text>'
        );

        // ── Radar / EW site ──────────────────────────────────────────────
        var RADAR = make(
            '<g transform="translate(140,55)" fill="#1a3060" stroke="#3a6090" stroke-width="0.8">'
          // Rotating dish
          + '<ellipse cx="0" cy="-28" rx="32" ry="14" fill="#0e2040" stroke="#3a6090" stroke-width="1.5"/>'
          + '<line x1="-32" y1="-28" x2="32" y2="-28" stroke="#4a80a0" stroke-width="0.8"/>'
          + '<line x1="0" y1="-42" x2="0" y2="-14" stroke="#4a80a0" stroke-width="0.8"/>'
          + '<ellipse cx="0" cy="-28" rx="10" ry="5" fill="none" stroke="#4a80a0" stroke-width="0.5"/>'
          // Support mast
          + '<line x1="0" y1="-14" x2="0" y2="12" stroke="#3a6090" stroke-width="2"/>'
          // Platform / bunker
          + '<rect x="-36" y="8" width="72" height="14" rx="2"/>'
          + '<rect x="-20" y="0" width="40" height="12" rx="2" fill="#0e2040"/>'
          + '</g>'
          + '<text x="140" y="94" text-anchor="middle" fill="#2a4060" '
          + 'font-size="7" font-family="Consolas,monospace">RADAR / EW SITE</text>'
        );

        // ── MLRS (rocket artillery) ──────────────────────────────────────
        var MLRS = make(
            '<g transform="translate(140,55)" fill="#2a4018" stroke="#4a7028" stroke-width="0.8">'
          // Vehicle
          + '<rect x="-44" y="8" width="88" height="16" rx="3"/>'
          + '<rect x="-40" y="16" width="80" height="10" rx="2" fill="#1a2c10"/>'
          // Rocket pod
          + '<rect x="-30" y="-20" width="60" height="32" rx="2" fill="#1e3414"/>'
          // Rocket tubes (12)
          + '<g fill="#0c1c08" stroke="#2a4018">'
          + '<rect x="-27" y="-17" width="10" height="26" rx="1"/>'
          + '<rect x="-15" y="-17" width="10" height="26" rx="1"/>'
          + '<rect x="-3" y="-17" width="10" height="26" rx="1"/>'
          + '<rect x="9" y="-17" width="10" height="26" rx="1"/>'
          + '<rect x="21" y="-17" width="8" height="26" rx="1"/>'
          + '</g>'
          // Elevation
          + '<rect x="-6" y="-24" width="12" height="10" fill="#2a4018"/>'
          + '</g>'
          + '<text x="140" y="94" text-anchor="middle" fill="#3a5020" '
          + 'font-size="7" font-family="Consolas,monospace">MLRS BATTERY</text>'
        );

        // ── Infantry ─────────────────────────────────────────────────────
        var INFANTRY = make(
            '<g transform="translate(140,50)" fill="#2a4018" stroke="#4a7028" stroke-width="0.8">'
          // Crossed rifles
          + '<line x1="-28" y1="-28" x2="28" y2="28" stroke="#5a8030" stroke-width="4" stroke-linecap="round"/>'
          + '<line x1="28" y1="-28" x2="-28" y2="28" stroke="#5a8030" stroke-width="4" stroke-linecap="round"/>'
          // Rifle stocks and barrels
          + '<rect x="-30" y="-32" width="8" height="16" rx="2" fill="#3a5820"/>'
          + '<rect x="22" y="-32" width="8" height="16" rx="2" fill="#3a5820"/>'
          + '<rect x="-8" y="20" width="8" height="16" rx="2" fill="#3a5820"/>'
          + '<rect x="0" y="20" width="8" height="16" rx="2" fill="#3a5820"/>'
          // Helmet silhouette
          + '<ellipse cx="0" cy="-8" rx="18" ry="14" fill="#2a4018" stroke="#4a7028"/>'
          + '<ellipse cx="0" cy="-10" rx="12" ry="10" fill="#1a3010"/>'
          + '</g>'
          + '<text x="140" y="94" text-anchor="middle" fill="#3a5020" '
          + 'font-size="7" font-family="Consolas,monospace">INFANTRY UNIT</text>'
        );

        // ── Logistics / supply truck ──────────────────────────────────────
        var LOGISTICS = make(
            '<g transform="translate(140,55)" fill="#3a3020" stroke="#6a5830" stroke-width="0.8">'
          // Cargo body
          + '<rect x="-40" y="-18" width="60" height="30" rx="2"/>'
          // Cab
          + '<rect x="20" y="-10" width="28" height="22" rx="3"/>'
          + '<rect x="22" y="-8" width="24" height="14" rx="2" fill="#0e0c08"/>'  // windshield
          // Chassis
          + '<rect x="-44" y="12" width="88" height="8" rx="2"/>'
          // Wheels
          + '<circle cx="-32" cy="22" r="9" fill="#1a1808" stroke="#4a4020"/>'
          + '<circle cx="-32" cy="22" r="5" fill="#2a2810"/>'
          + '<circle cx="16" cy="22" r="9" fill="#1a1808" stroke="#4a4020"/>'
          + '<circle cx="16" cy="22" r="5" fill="#2a2810"/>'
          + '<circle cx="36" cy="22" r="9" fill="#1a1808" stroke="#4a4020"/>'
          + '<circle cx="36" cy="22" r="5" fill="#2a2810"/>'
          // Supply boxes in cargo
          + '<rect x="-36" y="-14" width="18" height="12" rx="1" fill="#2a2010"/>'
          + '<rect x="-14" y="-14" width="18" height="12" rx="1" fill="#2a2010"/>'
          + '</g>'
          + '<text x="140" y="94" text-anchor="middle" fill="#504020" '
          + 'font-size="7" font-family="Consolas,monospace">LOGISTICS / SUPPORT</text>'
        );

        // ── Frigate (more detailed than generic ship) ─────────────────────
        var FRIGATE = make(
            '<g transform="translate(140,52)" fill="#1a4060" stroke="#3a7090" stroke-width="0.8">'
          + '<path d="M-68,16 L-58,-2 L-35,-8 L35,-8 L58,-2 L68,16 L56,20 L-56,20 Z"/>'  // hull
          + '<rect x="-18" y="-28" width="36" height="24" rx="2"/>'  // main superstructure
          + '<rect x="-10" y="-40" width="20" height="16"/>'          // bridge
          + '<rect x="10" y="-26" width="12" height="20" fill="#102030"/>'  // hangar
          + '<line x1="0" y1="-40" x2="0" y2="-55" stroke="#3a7090" stroke-width="1.5"/>'  // main mast
          + '<line x1="-4" y1="-48" x2="4" y2="-48" stroke="#3a7090" stroke-width="1"/>'  // yardarm
          // Gun
          + '<rect x="-28" y="-20" width="16" height="8" rx="2"/>'
          + '<rect x="-30" y="-17" width="20" height="5" rx="2"/>'
          // VLS
          + '<rect x="-48" y="-14" width="22" height="18" rx="1" fill="#0e2438"/>'
          // Sonar dome
          + '<ellipse cx="0" cy="24" rx="10" ry="5" fill="#102030"/>'
          + '</g>'
          + '<text x="140" y="94" text-anchor="middle" fill="#2a5070" '
          + 'font-size="7" font-family="Consolas,monospace">FRIGATE / CORVETTE</text>'
        );

        // ── Generic (domain-based) ────────────────────────────────────────
        function generic(unit) {
            var d = unit.domain || '';
            var colors = {
                air: { bg:'#0e1828', stroke:'#4a80b0', text:'#2a4860', label:'AIR UNIT' },
                sea: { bg:'#0a1820', stroke:'#3a7090', text:'#1a4060', label:'NAVAL UNIT' },
                ground: { bg:'#0e1408', stroke:'#4a7030', text:'#2a4018', label:'GROUND UNIT' },
                strategic: { bg:'#180e08', stroke:'#7050a0', text:'#402060', label:'STRATEGIC' }
            };
            var c = colors[d] || { bg:'#0e1220', stroke:'#405070', text:'#2a3848', label:'UNIT' };
            var initial = (unit.label || unit.name || '?').charAt(0).toUpperCase();
            return OPEN
                + '<rect width="280" height="100" fill="' + c.bg + '"/>'
                + GRD
                + '<circle cx="140" cy="46" r="28" fill="none" stroke="' + c.stroke + '" stroke-width="1.5" opacity="0.6"/>'
                + '<circle cx="140" cy="46" r="18" fill="none" stroke="' + c.stroke + '" stroke-width="1" opacity="0.4"/>'
                + '<text x="140" y="54" text-anchor="middle" fill="' + c.stroke + '" '
                + 'font-size="22" font-weight="bold" font-family="Consolas,monospace">' + initial + '</text>'
                + '<text x="140" y="82" text-anchor="middle" fill="' + c.text + '" '
                + 'font-size="7" font-family="Consolas,monospace">' + (d.toUpperCase() || c.label) + '</text>'
                + CLOSE;
        }

        return {
            FIGHTER:   FIGHTER,
            AWACS:     AWACS,
            SHIP:      SHIP,
            PATROL:    PATROL,
            TANK:      TANK,
            SAM:       SAM,
            SHORAD:    SHORAD,
            RADAR:     RADAR,
            MLRS:      MLRS,
            INFANTRY:  INFANTRY,
            LOGISTICS: LOGISTICS,
            FRIGATE:   FRIGATE,
            generic:   generic
        };
    })();

    /* Returns the appropriate SVG illustration for a unit */
    function _unitSvg(unit, enriched) {
        var kind = enriched && enriched.kind;
        if (!kind && root.AppWorldStateDB) {
            try { kind = root.AppWorldStateDB.classifyKind(unit); } catch (_) {}
        }
        switch (kind) {
            // ── Air ──
            case 'f16c': case 'f15e': case 'mirage2000':
            case 'mig29': case 'gripen': case 'tornado':
            case 'air_unit':
                return _SVG.FIGHTER;
            case 'awacs':
                return _SVG.AWACS;
            // ── Naval ──
            case 'meko': case 'corvette':
            case 'naval_combatant':
                return _SVG.FRIGATE;
            case 'patrol_boat':
                return _SVG.PATROL;
            // ── Ground maneuver ──
            case 'armor_company':
                return _SVG.TANK;
            case 'infantry_bn': case 'ground_maneuver':
                return _SVG.INFANTRY;
            case 'mlrs':
                return _SVG.MLRS;
            case 'logistics':
                return _SVG.LOGISTICS;
            // ── Air defense ──
            case 'patriot': case 'sam_s300': case 'sam_s75': case 'air_defense':
                return _SVG.SAM;
            case 'tor_aads': case 'mistral': case 's1_aaa':
            case 'aaa_zsu': case 'aaa_23mm':
                return _SVG.SHORAD;
            // ── EW / Radar ──
            case 'ew_site': case 'radar_p37':
                return _SVG.RADAR;
            // ── Fallback ──
            default:
                return _SVG.generic(unit);
        }
    }

    /**
     * Render the hero symbol area.
     *
     * Priority order (real images beat milsymbol):
     *   1. unit.image_url       — scenario/unit-level real image (explicit field)
     *   2. enriched.image_asset — DB1 catalog-level locally cached image
     *   3. milsymbol canvas     — when unit.sidc is valid (no real image available)
     *   4. SVG silhouette       — final fallback (no real image, no valid SIDC)
     *
     * All real images MUST be locally cached paths (offline-safe).
     * Image load errors fall back silently through the chain to SVG.
     */
    function _renderSymbol(unit, enriched, container) {
        if (!container) return;
        container.innerHTML = '';

        // 1 + 2. Real cached image — unit-level or DB1 catalog-level
        var imgSrc = (unit.image_url)
            || (enriched && enriched.image_asset)
            || null;
        if (imgSrc) {
            _renderRealImage(imgSrc, unit, enriched, container);
            return;
        }

        // 3. milsymbol — only when no real image is available
        if (root.ms && typeof root.ms.Symbol === 'function' && unit.sidc) {
            try {
                var sym = new root.ms.Symbol(unit.sidc, { size: 42 });
                var canvas = sym.getCanvas();
                if (canvas) {
                    container.style.background = '#0a1018';
                    container.appendChild(canvas);
                    return;
                }
            } catch (_) {}
        }

        // 4. SVG silhouette fallback
        container.innerHTML = _unitSvg(unit, enriched);
    }

    /**
     * Render a real (locally cached) image in the hero container.
     * Applies a subtle military filter (desaturate + slight darken).
     * On any load error, silently falls back to the SVG silhouette.
     * Shows a small attribution line from enriched.image_credit.
     *
     * @param {string}  src       - Local asset path e.g. /client/assets/units/xxx.jpg
     * @param {object}  unit      - Raw unit object
     * @param {object}  enriched  - DB1-enriched unit (may carry image_credit)
     * @param {Element} container - #unit-symbol element
     */
    function _renderRealImage(src, unit, enriched, container) {
        // Wrapper keeps position:relative for attribution overlay
        container.style.position = 'relative';
        container.style.overflow = 'hidden';

        var img = document.createElement('img');
        img.alt  = unit.label || unit.name || '';
        img.style.cssText = [
            'width:100%', 'height:100%',
            'object-fit:cover', 'object-position:center top',
            'filter:brightness(0.85) contrast(1.1) saturate(0.65)',
            'display:block'
        ].join(';');
        img.setAttribute('loading', 'lazy');
        img.setAttribute('decoding', 'async');

        // Graceful degradation — if image fails to load (offline, path wrong, etc.)
        // fall back to the SVG silhouette without any console noise
        img.onerror = function() {
            container.innerHTML = _unitSvg(unit, enriched);
            container.style.position = '';
            container.style.overflow = '';
        };

        img.src = src;
        container.appendChild(img);

        // Small attribution overlay (bottom-right, non-intrusive)
        var credit = (enriched && enriched.image_credit) || (unit.image_credit) || '';
        if (credit) {
            var attr = document.createElement('div');
            attr.style.cssText = [
                'position:absolute', 'bottom:3px', 'right:5px',
                'font-size:0.52rem', 'font-family:Consolas,monospace',
                'color:rgba(255,255,255,0.55)',
                'background:rgba(0,0,0,0.35)', 'padding:1px 4px',
                'pointer-events:none', 'line-height:1.4',
                'max-width:90%', 'text-align:right',
                'white-space:nowrap', 'overflow:hidden', 'text-overflow:ellipsis'
            ].join(';');
            attr.textContent = credit;
            container.appendChild(attr);
        }
    }

    // ── Identity ──────────────────────────────────────────────────────
    function populateIdentity(unit, enriched, selectedAt) {
        var platformLabel = getPlatformLabel(enriched);

        // Platform ID line: uid + echelon
        var pidEl = $('usp-platform-id');
        if (pidEl) {
            var parts = [unit.uid || unit.id || unit.code, unit.echelon].filter(Boolean).join(' · ');
            pidEl.textContent = parts || unit.uid || '—';
        }

        // Platform type: domain + DB1 label
        var ptEl = $('usp-platform-type');
        if (ptEl) {
            var domain = unit.domain ? unit.domain.toUpperCase() : '';
            var role   = unit.role   ? unit.role.replace(/_/g, ' ') : '';
            ptEl.textContent = platformLabel
                ? (domain ? domain + ' – ' : '') + platformLabel
                : [domain, role].filter(Boolean).join(' – ') || '—';
        }

        // UID / callsign
        setText('unit-uid', unit.uid || unit.name || unit.label || '—');

        // SIDC (monospace, shown when present)
        var sidcEl = $('usp-sidc');
        if (sidcEl) {
            sidcEl.textContent = (unit.sidc && String(unit.sidc).trim()) || '—';
            sidcEl.style.display = '';
        }

        // Unit code (like B1, B-d1-51-002)
        var codeEl = $('usp-code');
        if (codeEl) {
            var codeVal = unit.code || unit.id || '';
            codeEl.textContent = codeVal || '—';
            codeEl.style.display = codeVal ? '' : 'none';
        }

        // MGRS + Lat/Lng position
        var lat = parseFloat(unit.lat), lng = parseFloat(unit.lng);
        // Try marker for live position
        try {
            if (root.AppAdjudicatorMap && typeof root.AppAdjudicatorMap.getScenarioMarkers === 'function') {
                var ms = root.AppAdjudicatorMap.getScenarioMarkers();
                var want = String(unit.id || unit.code || '');
                var all = [].concat((ms && ms.red) || [], (ms && ms.blue) || []);
                for (var i = 0; i < all.length; i++) {
                    var m = all[i];
                    var uid = m && (m._unitId || (m._unitData && m._unitData.id));
                    if (uid && String(uid) === want && typeof m.getLatLng === 'function') {
                        var ll = m.getLatLng();
                        if (ll) { lat = ll.lat; lng = ll.lng; }
                        break;
                    }
                }
            }
        } catch (_) {}

        var mgrsEl = $('usp-mgrs');
        var latlngEl = $('usp-latlng');
        if (isFinite(lat) && isFinite(lng)) {
            // MGRS
            if (mgrsEl) {
                try {
                    if (root.mgrs && typeof root.mgrs.forward === 'function') {
                        var s = root.mgrs.forward([lng, lat], 5);
                        var mm = s && s.match(/^(\d{1,2}[A-Z])([A-Z]{2})(\d+)$/);
                        if (mm) {
                            var half = mm[3].length / 2;
                            mgrsEl.textContent = mm[1] + ' ' + mm[2] + ' ' + mm[3].slice(0, half) + ' ' + mm[3].slice(half);
                        } else {
                            mgrsEl.textContent = s || '—';
                        }
                    } else { mgrsEl.textContent = '—'; }
                } catch (_) { mgrsEl.textContent = '—'; }
            }
            // Lat/Lng
            if (latlngEl) {
                var latStr = Math.abs(lat).toFixed(4) + '°' + (lat >= 0 ? 'N' : 'S');
                var lngStr = Math.abs(lng).toFixed(4) + '°' + (lng >= 0 ? 'E' : 'W');
                latlngEl.textContent = latStr + '  ' + lngStr;
            }
        } else {
            if (mgrsEl)   mgrsEl.textContent = '—';
            if (latlngEl) latlngEl.textContent = '—';
        }

        // Selected at timestamp
        var selatEl = $('usp-selat');
        if (selatEl) {
            try {
                var _ts = (selectedAt != null && Number.isFinite(+selectedAt)) ? +selectedAt : null;
                var d   = _ts !== null ? new Date(_ts) : null;
                if (d && !isNaN(d.getTime())) {
                    selatEl.textContent = (root.AppShellClock && typeof root.AppShellClock.formatZuluDtg === 'function')
                        ? root.AppShellClock.formatZuluDtg(d) : d.toISOString();
                } else {
                    selatEl.textContent = '—';
                }
            } catch (_) { selatEl.textContent = '—'; }
        }
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

    // ── TASK1-B: unit tasking accessor ────────────────────────────────
    /**
     * Look up the current-step tasking record for a unit uid from the
     * world state derived by AppAdjudicatorMap.
     *
     * Priority chain (read-only, no side effects):
     *   AppAdjudicatorMap.getWorldState()
     *     → ws.derived.unit_tasking[uid]    (DERIVATIONS['unit_tasking'])
     *
     * Returns null when:
     *   - AppAdjudicatorMap is not loaded (e.g. no scenario on map)
     *   - No world state projected yet (getWorldState() returns null)
     *   - Unit has no actor record in the current step
     *
     * Callers must treat null as "no tasking available" and fall through
     * to scenario fields or '—'.
     *
     * @param {string} uid - unit.uid
     * @returns {{ action_what, action_component, component_label, ... }|null}
     */
    function _getUnitTasking(uid) {
        if (!uid) return null;
        try {
            var map = root.AppAdjudicatorMap;
            if (!map || typeof map.getWorldState !== 'function') return null;
            var ws = map.getWorldState();
            if (!ws || !ws.derived || !ws.derived.unit_tasking) return null;
            return ws.derived.unit_tasking[uid] || null;
        } catch (_) { return null; }
    }

    // ── Assignment ────────────────────────────────────────────────────
    function populateAssignment(unit) {
        // Read current-step tasking record (null = no actor for this unit this step)
        var tasking = _getUnitTasking(unit.uid || unit.id);

        setText('unit-domain',  unit.domain  || '—');
        setText('unit-role',    unit.role ? unit.role.replace(/_/g, ' ') : '—');
        setText('unit-echelon', unit.echelon || '—');

        // Assigned base: unit-level override → BLS reference → 'None'
        setText('usp-assigned-base',
            unit.assigned_base || unit.base || unit.bls || 'None');

        // Status row: component label from tasking → unit.status → unit.posture → '—'
        setText('usp-unit-status',
            (tasking && (tasking.component_label || tasking.action_component))
            || unit.status || unit.posture || '—');

        // Mission row: action_what from tasking → unit.mission → unit.objective → '—'
        var missionText = (tasking && tasking.action_what)
            || unit.mission || unit.objective || '—';
        var mEl = $('usp-mission');
        if (mEl) {
            mEl.textContent = missionText;
            mEl.className = 'usp-arow-val'
                + (missionText !== '—' ? ' usp-link' : '');
            if (tasking && tasking.action_what) {
                mEl.title = (tasking.phase ? '[' + tasking.phase + '] ' : '')
                           + 'Step ' + (tasking.step_index != null ? tasking.step_index + 1 : '?');
            } else {
                mEl.title = '';
            }
        }

        // ── TASK1-C: populate Current Orders detail block ────────────────
        _populateTaskingDetails(tasking);
    }

    /**
     * Populate the collapsible "CURRENT ORDERS" detail block.
     * Shows: step/phase label, action_why, action_intended_effect,
     *        action_doctrine_cited[] (joined with ' · ').
     * Hides the entire block when tasking is null.
     * Each row shown only when its value is a non-empty string.
     * Read-only; never mutates tasking or any scenario data.
     *
     * @param {{action_why, action_intended_effect, action_doctrine_cited[],
     *           step_index, phase}|null} tasking
     */
    function _populateTaskingDetails(tasking) {
        var block = $('usp-tasking-block');
        if (!block) return;

        if (!tasking) {
            block.setAttribute('hidden', '');
            return;
        }

        // Step / phase label in section header
        var stepLabel = '';
        if (tasking.phase) {
            stepLabel = tasking.phase;
            if (tasking.step_index != null) {
                stepLabel = 'Step ' + (tasking.step_index + 1) + ' \xb7 ' + stepLabel;
            }
        } else if (tasking.step_index != null) {
            stepLabel = 'Step ' + (tasking.step_index + 1);
        }
        setText('usp-tasking-step', stepLabel ? ' – ' + stepLabel : '');

        // Why row
        _setTaskingRow('usp-tasking-why-row', 'usp-tasking-why', tasking.action_why);

        // Intended Effect row
        _setTaskingRow('usp-tasking-effect-row', 'usp-tasking-effect', tasking.action_intended_effect);

        // Doctrine row — join array cleanly with ' · '
        var docArr = Array.isArray(tasking.action_doctrine_cited)
            ? tasking.action_doctrine_cited.filter(function(d) { return d && String(d).trim(); })
            : [];
        var docText = docArr.length ? docArr.join(' \xb7 ') : null;
        _setTaskingRow('usp-tasking-doctrine-row', 'usp-tasking-doctrine', docText);

        // Show block only if at least one row is visible
        var anyVisible = !!(
            (tasking.action_why && String(tasking.action_why).trim()) ||
            (tasking.action_intended_effect && String(tasking.action_intended_effect).trim()) ||
            docArr.length
        );
        if (anyVisible) {
            block.removeAttribute('hidden');
        } else {
            block.setAttribute('hidden', '');
        }
    }

    /**
     * Show/hide a single tasking detail row.
     * @param {string} rowId  - element id of the row div
     * @param {string} valId  - element id of the value span
     * @param {string|null} text - value to display (null/empty → hide row)
     */
    function _setTaskingRow(rowId, valId, text) {
        var row = $(rowId), val = $(valId);
        if (!row) return;
        var trimmed = text && String(text).trim();
        if (trimmed) {
            if (val) val.textContent = trimmed;
            row.removeAttribute('hidden');
        } else {
            row.setAttribute('hidden', '');
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
    // ── Collapse / reopen tab ─────────────────────────────────────────
    function _showReopenTab(show) {
        var tab = $('usp-reopen-tab');
        if (!tab) return;
        if (show) tab.removeAttribute('hidden');
        else      tab.setAttribute('hidden', '');
    }

    function collapsePanel() {
        var p = $('unit-status-panel');
        if (p) p.setAttribute('hidden', '');
        _showReopenTab(!!currentUnit);   // show reopen only when a unit was selected
    }

    function expandPanel() {
        var p = $('unit-status-panel');
        if (p) p.removeAttribute('hidden');
        _showReopenTab(false);
    }

    function setupListeners() {
        var closeBtn = $('panel-close');
        if (closeBtn) closeBtn.addEventListener('click', closePanel);

        var collapseTab = $('usp-collapse-tab');
        if (collapseTab) collapseTab.addEventListener('click', function() {
            var p = $('unit-status-panel');
            if (p && !p.hasAttribute('hidden')) {
                collapsePanel();
            } else {
                expandPanel();
                if (currentUnit) {
                    var b = $('usp-body'), e = $('empty-state');
                    if (b) b.removeAttribute('hidden');
                    if (e) e.setAttribute('hidden', '');
                }
            }
        });

        var reopenTab = $('usp-reopen-tab');
        if (reopenTab) reopenTab.addEventListener('click', function() {
            expandPanel();
            if (currentUnit) {
                var b = $('usp-body'), e = $('empty-state');
                if (b) b.removeAttribute('hidden');
                if (e) e.setAttribute('hidden', '');
            }
        });

        document.addEventListener('rmooz:unit-selected', function(e) {
            var unit = e.detail && e.detail.unit;
            var selectedAt = (e.detail && e.detail.selectedAt) || Date.now();
            if (unit) {
                populatePanel(unit, selectedAt);
                expandPanel();   // expand (show panel, hide reopen tab)
            }
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
        populatePanel: populatePanel,
        getCurrentUnit: function() { return currentUnit; }
    };
    init();

})(window);
