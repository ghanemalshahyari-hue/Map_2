/* ============================================================================
 * base-status-panel.js - BASE-STATUS-A / Step 1 Base Status Panel
 * ----------------------------------------------------------------------------
 * Detailed read-only panel for Step 1 base/placement anchors. It uses only
 * review payload data already produced by DOC-UNDERSTANDING-1. It does not
 * create scenario units, tasking, COAs, movement, or execution state.
 *
 *   window.RmoozBaseStatusPanel = { open(anchor, payload), close(), normalizePlatform(unit) }
 * ========================================================================== */
(function () {
    'use strict';

    var CATALOG_REQUIRED = 'يحتاج ربط بقاعدة البيانات / Catalog required';
    var PANEL_ID = 'step1-base-status-panel';

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch];
        });
    }
    function arr(v) { return Array.isArray(v) ? v : []; }
    function lower(s) { return String(s == null ? '' : s).toLowerCase(); }
    function text(v, fallback) {
        if (v == null || v === '') return fallback == null ? '' : fallback;
        return String(v);
    }
    function opBrief(payload) {
        return (payload && payload.brief && payload.brief.operational_brief) ||
            (payload && payload.operational_brief) || {};
    }
    function allCandidates(payload) {
        var p = payload || {};
        var src = p.placement || p;
        var list = src.placement_candidates || src.candidates || p.placement_candidates || opBrief(payload).placement_candidates;
        return arr(list);
    }
    function allProposedUnits(payload) {
        var ob = opBrief(payload);
        return arr(ob.proposed_units).concat(arr(payload && payload.understanding && payload.understanding.proposed_units));
    }
    function allBases(payload) {
        var ob = opBrief(payload);
        return arr(ob.enemy_bases).concat(arr(ob.friendly_trial_bases));
    }
    function sourceFile(payload, anchor) {
        return (anchor && anchor.source && anchor.source.file) ||
            (payload && payload.documents && payload.documents[0] && payload.documents[0].filename) ||
            (payload && payload.document && payload.document.filename) || '';
    }
    function normalizeName(s) {
        return lower(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    }
    function nameTokens(o) {
        return [
            o && o.base_name_ar, o && o.base_name_en, o && o.assigned_base,
            o && o.base_id, o && o.mention, o && o.normalized_name,
            o && o.location_id, o && o.id
        ].map(normalizeName).filter(Boolean);
    }
    function nameMatches(a, b) {
        var aa = nameTokens(a), bb = nameTokens(b);
        if (!aa.length || !bb.length) return false;
        return aa.some(function (x) {
            return bb.some(function (y) { return x === y || (x.length > 4 && y.indexOf(x) !== -1) || (y.length > 4 && x.indexOf(y) !== -1); });
        });
    }
    function coordMatches(a, b) {
        if (!a || !b || a.lat == null || a.lon == null || b.lat == null || b.lon == null) return false;
        var latA = Number(a.lat), lonA = Number(a.lon), latB = Number(b.lat), lonB = Number(b.lon);
        if (![latA, lonA, latB, lonB].every(Number.isFinite)) return false;
        return Math.abs(latA - latB) < 0.02 && Math.abs(lonA - lonB) < 0.02;
    }
    function unitBelongsToAnchor(unit, anchor, base) {
        if (!unit || !anchor) return false;
        var sideU = String(unit.side || '').toUpperCase();
        var sideA = String(anchor.side || (base && base.side) || '').toUpperCase();
        if (sideU && sideA && sideU !== sideA) return false;
        if (nameMatches(unit, anchor) || (base && nameMatches(unit, base))) return true;
        return coordMatches(unit, anchor) || (base && coordMatches(unit, base));
    }
    function findBase(anchor, payload) {
        var bases = allBases(payload);
        for (var i = 0; i < bases.length; i++) {
            if (nameMatches(anchor, bases[i]) || coordMatches(anchor, bases[i])) return bases[i];
        }
        return anchor || {};
    }
    function baseType(anchor, base) {
        var raw = lower((base && base.site_type) || (anchor && anchor.site_type) || (anchor && anchor.base_type) || '');
        if (raw.indexOf('friendly_trial') !== -1 || raw.indexOf('trial') !== -1) return 'friendly_trial_anchor';
        if (raw.indexOf('naval') !== -1) return 'naval_base';
        if (raw.indexOf('land') !== -1 || raw.indexOf('ground') !== -1) return 'land_base';
        if (raw.indexOf('air') !== -1) return 'air_base';
        return 'base_facility';
    }
    function sideOf(anchor, base) {
        return String((anchor && anchor.side) || (base && base.side) || (baseType(anchor, base) === 'friendly_trial_anchor' ? 'BLUE' : 'RED')).toUpperCase();
    }

    function normalizePlatform(unit) {
        var platform = text(unit && (unit.platform || unit.platform_name || unit.name || unit.type || unit.type_ar), '');
        var p = lower(platform).replace(/[–—]/g, '-');
        var cat = 'unknown';
        var status = 'unknown';
        var confidence = 0;
        var candidates = null;
        if (/f\s*-\s*14|tomcat/.test(p)) { cat = 'air_fighter'; status = 'category_only'; confidence = 0.82; }
        else if (/f\s*-\s*4|phantom/.test(p)) { cat = 'air_fighter'; status = 'ambiguous'; confidence = 0.72; candidates = ['air_fighter', 'air_attack']; }
        else if (/su\s*-\s*24|su24|strike|attack|bomber/.test(p)) { cat = 'air_attack'; status = 'category_only'; confidence = 0.8; }
        else if (/p\s*-\s*3|orion|maritime patrol|mpa/.test(p)) { cat = 'maritime_patrol'; status = 'category_only'; confidence = 0.84; }
        else if (/c\s*-\s*130|hercules|transport/.test(p)) { cat = 'air_transport'; status = 'category_only'; confidence = 0.82; }
        else if (/bell\s*214|ab\s*-\s*212|helicopter|helo|rotary/.test(p)) { cat = 'helicopter'; status = 'category_only'; confidence = 0.78; }
        else if (/shahed|mohajer|uav|drone/.test(p)) { cat = 'uav'; status = 'category_only'; confidence = 0.8; }
        else if (/f\s*-\s*7|f\s*-\s*5|fighter/.test(p)) { cat = 'air_fighter'; status = 'category_only'; confidence = 0.76; }
        else if (/su\s*-\s*25|frogfoot|cas/.test(p)) { cat = 'air_attack'; status = 'category_only'; confidence = 0.8; }
        else if (/ship|frigate|corvette|naval|boat|vessel/.test(p)) { cat = 'naval_surface'; status = 'category_only'; confidence = 0.68; }
        else if (/submarine|sub\b/.test(p)) { cat = 'submarine'; status = 'category_only'; confidence = 0.68; }
        else if (/sam|air.?def|aaa|shorad|missile defense/.test(p)) { cat = 'air_defense'; status = 'category_only'; confidence = 0.68; }
        else if (/radar|ewr|sensor/.test(p)) { cat = 'radar'; status = 'category_only'; confidence = 0.68; }
        else if (/hq|command/.test(p)) { cat = 'hq'; status = 'category_only'; confidence = 0.64; }
        else if (/logistic|supply|depot/.test(p)) { cat = 'logistics'; status = 'category_only'; confidence = 0.64; }
        else if (/ground|armor|tank|infantry|brigade|battalion/.test(p)) { cat = 'ground_unit'; status = 'category_only'; confidence = 0.62; }

        var result = {
            symbol_category: cat,
            symbol_category_candidates: candidates,
            platform_class: cat === 'unknown' ? null : cat,
            platform_name: platform || null,
            catalog_match_status: status,
            catalog_confidence: confidence,
            capability_summary: cat === 'unknown' ? 'Unknown review-only platform; no capabilities inferred.' : categoryCapability(cat).join(', '),
            sensors: [],
            weapons: [],
            magazines: [],
            unknown_fields: cat === 'unknown' ? ['platform'] : [],
            needs_review: true
        };
        // SYMBOL-DB-B: merge catalog-sourced systems (sensors/weapons/magazines) when the
        // canonical categorizer is loaded. Systems come ONLY from the DB1 catalog — never
        // invented. We override status/summary only on a real catalog hit (matched/
        // role_class/declared); category-only and unknown platforms render exactly as before.
        var SDB = (typeof window !== 'undefined' && window.RmoozSymbolDB) || null;
        if (SDB && typeof SDB.categorize === 'function') {
            var enriched = SDB.categorize(unit);
            result.sensors = enriched.sensors;
            result.weapons = enriched.weapons;
            result.magazines = enriched.magazines;
            result.unknown_fields = enriched.unknown_fields;
            if (enriched.catalog_match_status === 'matched' ||
                enriched.catalog_match_status === 'role_class' ||
                enriched.catalog_match_status === 'declared') {
                result.catalog_match_status = enriched.catalog_match_status;
                result.catalog_confidence = enriched.catalog_confidence;
                if (enriched.capability_summary) result.capability_summary = enriched.capability_summary;
                if (enriched.platform_class) result.platform_class = enriched.platform_class;
            }
        }
        return result;
    }
    function categoryCapability(cat) {
        var map = {
            air_fighter: ['Air operations'],
            air_attack: ['Air operations'],
            air_transport: ['Transport'],
            maritime_patrol: ['Maritime patrol'],
            helicopter: ['Helicopter'],
            uav: ['UAV/recon'],
            naval_surface: ['Maritime patrol'],
            submarine: ['Maritime patrol'],
            ground_unit: ['Ground/HQ/logistics'],
            air_defense: ['Ground/HQ/logistics'],
            radar: ['Ground/HQ/logistics'],
            base_facility: ['Ground/HQ/logistics'],
            hq: ['Ground/HQ/logistics'],
            logistics: ['Ground/HQ/logistics'],
            unknown: []
        };
        return map[cat] || [];
    }
    function categoryCounts(units) {
        var counts = {
            fighters: 0, attack_aircraft: 0, transport: 0, maritime_patrol: 0,
            helicopters: 0, uav: 0, naval: 0, ground: 0, unknown: 0
        };
        units.forEach(function (u) {
            var n = normalizePlatform(u);
            var amount = Number(u && u.estimated_count);
            if (!Number.isFinite(amount) || amount < 1) amount = 1;
            switch (n.symbol_category) {
                case 'air_fighter': counts.fighters += amount; break;
                case 'air_attack': counts.attack_aircraft += amount; break;
                case 'air_transport': counts.transport += amount; break;
                case 'maritime_patrol': counts.maritime_patrol += amount; break;
                case 'helicopter': counts.helicopters += amount; break;
                case 'uav': counts.uav += amount; break;
                case 'naval_surface': case 'submarine': counts.naval += amount; break;
                case 'ground_unit': case 'air_defense': case 'radar': case 'hq': case 'logistics': counts.ground += amount; break;
                default: counts.unknown += amount;
            }
        });
        return counts;
    }
    function capabilitySummary(units) {
        var seen = {};
        units.forEach(function (u) {
            categoryCapability(normalizePlatform(u).symbol_category).forEach(function (v) { seen[v] = true; });
        });
        var list = ['Air operations', 'Maritime patrol', 'UAV/recon', 'Transport', 'Helicopter', 'Ground/HQ/logistics'].filter(function (v) { return seen[v]; });
        return list.length ? list : ['No category-derived capability yet'];
    }
    function row(label, value) {
        return '<div class="bsp-row"><span>' + esc(label) + '</span><b>' + esc(value == null || value === '' ? '-' : value) + '</b></div>';
    }
    function chip(textValue, cls) {
        return '<span class="bsp-chip ' + esc(cls || '') + '">' + esc(textValue) + '</span>';
    }
    function renderUnitTable(units) {
        if (!units.length) return '<div class="bsp-empty">No proposed units linked to this base.</div>';
        var rows = units.map(function (u) {
            var n = normalizePlatform(u);
            var warnings = arr(u && u.warnings).concat(u && u.warning ? [u.warning] : []);
            return '<tr>' +
                '<td>' + esc(u.platform || u.platform_name || u.name || '-') + '</td>' +
                '<td>' + esc(u.type_ar || u.type || '-') + '</td>' +
                '<td>' + esc(u.estimated_count == null ? '-' : u.estimated_count) + '</td>' +
                '<td>' + esc(n.symbol_category) + (n.symbol_category_candidates ? '<br><small>' + esc(n.symbol_category_candidates.join(' / ')) + '</small>' : '') + '</td>' +
                '<td>' + esc(n.catalog_match_status) + '</td>' +
                '<td>' + esc(u.needs_review === false ? 'false' : 'true') + '</td>' +
                '<td>' + esc(warnings.join(', ') || '-') + '</td>' +
                '</tr>';
        }).join('');
        return '<div class="bsp-table-wrap"><table class="bsp-table"><thead><tr>' +
            '<th>Platform</th><th>Arabic type</th><th>Count</th><th>Symbol category</th><th>Catalog</th><th>Review</th><th>Warnings</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    }
    function missingForBase(payload, anchor, base) {
        var ob = opBrief(payload);
        var missing = arr(ob.missing_information).concat(arr(ob.staff_brief_2 && ob.staff_brief_2.missing_information));
        var names = nameTokens(anchor).concat(nameTokens(base));
        return missing.filter(function (m) {
            var mm = normalizeName(m);
            return !names.length || names.some(function (n) { return mm.indexOf(n) !== -1 || n.indexOf(mm) !== -1; });
        });
    }
    function ensurePanel() {
        if (!document || !document.body) return null;
        var panel = document.getElementById(PANEL_ID);
        if (panel) return panel;
        panel = document.createElement('aside');
        panel.id = PANEL_ID;
        panel.className = 'step1-base-status-panel';
        document.body.appendChild(panel);
        ensureStyles();
        return panel;
    }
    function ensureStyles() {
        if (document.getElementById('step1-base-status-style')) return;
        var style = document.createElement('style');
        style.id = 'step1-base-status-style';
        style.textContent = [
            '.step1-base-status-panel{position:fixed;right:0;top:0;width:430px;max-width:100vw;height:100vh;z-index:940;background:#0d1119;color:#cdd8e4;border-left:3px solid #2a4060;box-shadow:-6px 0 24px rgba(0,0,0,.75);font-family:Consolas,monospace;font-size:12px;overflow:auto;box-sizing:border-box;}',
            '.step1-base-status-panel[hidden]{display:none!important}.bsp-header{padding:12px 14px;background:#101820;border-bottom:1px solid #1e2b3a;display:flex;justify-content:space-between;gap:12px}.bsp-title{font-size:16px;color:#e8f0f8;font-weight:700}.bsp-subtitle{color:#8fb8e0;margin-top:2px}.bsp-close{border:1px solid #33475f;background:#111a24;color:#cfe6ff;border-radius:4px;cursor:pointer;width:28px;height:28px}.bsp-section{border-bottom:1px solid #172434;padding:10px 14px}.bsp-section h3{margin:0 0 8px;color:#8fb8e0;font-size:12px;text-transform:uppercase;letter-spacing:0}.bsp-row{display:grid;grid-template-columns:142px 1fr;gap:8px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.035)}.bsp-row span{color:#7f93a6}.bsp-row b{color:#e8eaed;font-weight:500;text-align:right;word-break:break-word}.bsp-chip{display:inline-block;margin:2px 4px 2px 0;padding:2px 7px;border-radius:8px;border:1px solid #2e5d7d;background:#16222e;color:#cfe6ff}.bsp-chip.red{border-color:#6e3333;color:#f0a0a0}.bsp-chip.blue{border-color:#2c6542;color:#7fd6a0}.bsp-chip.warn{border-color:#8a6a20;color:#e0c060;background:#2a2412}.bsp-chip.review{border-color:#8a6a20;color:#e0c060;background:#2a2412}.bsp-summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px}.bsp-table-wrap{overflow:auto;border:1px solid #1e2b3a}.bsp-table{width:100%;border-collapse:collapse;min-width:680px}.bsp-table th,.bsp-table td{padding:5px 6px;border-bottom:1px solid #182536;text-align:left;vertical-align:top}.bsp-table th{color:#8fb8e0;background:#101820;font-size:11px}.bsp-table td{color:#d8e0e8}.bsp-table small{color:#9ab}.bsp-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}.bsp-tab{border:1px solid #26384a;background:#101820;color:#9fbad0;padding:6px;text-align:center}.bsp-tab-body{margin-top:8px;padding:8px;border:1px dashed #30455c;color:#e0c060;background:#121711;direction:rtl;text-align:right}.bsp-empty{color:#8fa5b8;font-style:italic}.bsp-log{margin:0;padding-left:18px;color:#d8e0e8}.bsp-log li{margin:3px 0}.bsp-cap-list{margin:0;padding-left:18px;color:#d8e0e8}.bsp-cap-list li{margin:3px 0}',
            '@media(max-width:768px){.step1-base-status-panel{width:100%;}.bsp-row{grid-template-columns:118px 1fr}}'
        ].join('');
        document.head.appendChild(style);
    }
    function close() {
        var panel = document && document.getElementById(PANEL_ID);
        if (panel) panel.setAttribute('hidden', '');
    }
    function render(anchor, payload) {
        var panel = ensurePanel();
        if (!panel) return;
        anchor = anchor || {};
        payload = payload || {};
        var base = findBase(anchor, payload);
        var units = allProposedUnits(payload).filter(function (u) { return unitBelongsToAnchor(u, anchor, base); });
        var side = sideOf(anchor, base);
        var type = baseType(anchor, base);
        var counts = categoryCounts(units);
        var caps = capabilitySummary(units);
        var missing = missingForBase(payload, anchor, base);
        var source = anchor.source || base.source || {};
        var doctrine = !!((opBrief(payload).task_assembly || {}).doctrine_upload_required);
        var file = sourceFile(payload, anchor);
        var titleEn = base.base_name_en || anchor.base_name_en || anchor.normalized_name || anchor.mention || 'Step 1 base anchor';
        var titleAr = base.base_name_ar || anchor.base_name_ar || '';
        var lat = anchor.lat != null ? anchor.lat : base.lat;
        var lon = anchor.lon != null ? anchor.lon : base.lon;
        var html = '<header class="bsp-header"><div><div class="bsp-title">' + esc(titleEn) + '</div>' +
            '<div class="bsp-subtitle" dir="rtl">' + esc(titleAr || '-') + '</div><div>' +
            chip(side, side === 'BLUE' ? 'blue' : 'red') + chip(type) + chip('Review only', 'review') +
            chip('needs_review:true', 'review') + chip('exact_unit_position:false', 'review') +
            '</div></div><button class="bsp-close" type="button" title="Close">x</button></header>';
        html += '<section class="bsp-section"><h3>Location</h3>' +
            row('Lat / Lon', (lat != null && lon != null) ? (lat + ', ' + lon) : '-') +
            row('Coordinate format', anchor.coordinate_format || base.coordinate_format || 'base_anchor') +
            row('AO check', anchor.ao_check || base.ao_check || '-') +
            row('Terrain', anchor.terrain ? (anchor.terrain.terrain_available === true ? 'available' : 'unavailable') : '-') +
            row('Source type', anchor.source_type || base.source_type || source.type || '-') +
            '</section>';
        html += '<section class="bsp-section"><h3>Base Summary</h3>' +
            row('Assigned base / ID', base.assigned_base || base.base_id || anchor.assigned_base || anchor.base_id || base.id || anchor.location_id || '-') +
            row('Proposed units count', units.length) +
            '<div class="bsp-summary-grid">' +
            row('fighters', counts.fighters) + row('attack aircraft', counts.attack_aircraft) +
            row('transport', counts.transport) + row('maritime patrol', counts.maritime_patrol) +
            row('helicopters', counts.helicopters) + row('UAV', counts.uav) +
            row('naval', counts.naval) + row('ground', counts.ground) + row('unknown', counts.unknown) +
            '</div></section>';
        html += '<section class="bsp-section"><h3>Proposed Units</h3>' + renderUnitTable(units) + '</section>';
        html += '<section class="bsp-section"><h3>Capability Summary</h3><ul class="bsp-cap-list">' +
            caps.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') +
            '</ul><div class="bsp-tab-body">' + CATALOG_REQUIRED + '</div></section>';
        html += '<section class="bsp-section"><h3>Systems</h3><div class="bsp-tabs">' +
            ['Sensors', 'Comms', 'Weapons', 'Doctrine', 'Logistics', 'Message Log'].map(function (t) {
                return '<div class="bsp-tab">' + esc(t) + '</div>';
            }).join('') + '</div><div class="bsp-tab-body">' + CATALOG_REQUIRED + '</div></section>';
        html += '<section class="bsp-section"><h3>Message Log / Evidence</h3><ul class="bsp-log">' +
            '<li>source file: ' + esc(file || '-') + '</li>' +
            '<li>source_type: ' + esc(anchor.source_type || base.source_type || source.type || '-') + '</li>' +
            '<li>data_reliability: ' + esc(anchor.data_reliability || base.data_reliability || source.confidence || anchor.confidence || '-') + '</li>' +
            '<li>' + esc('AI candidate warning: ' + (arr(anchor.warnings).concat(anchor.warning ? [anchor.warning] : []).join(', ') || 'ai_information_requires_review')) + '</li>' +
            (doctrine ? '<li>Doctrine required warning: true</li>' : '<li>Doctrine required warning: false</li>') +
            (missing.length ? missing.map(function (m) { return '<li>missing_information: ' + esc(m) + '</li>'; }).join('') : '<li>missing_information: none linked to this base</li>') +
            '</ul></section>';
        panel.innerHTML = html;
        panel.removeAttribute('hidden');
        var closeBtn = panel.querySelector('.bsp-close');
        if (closeBtn) closeBtn.addEventListener('click', close);
    }

    window.RmoozBaseStatusPanel = {
        open: render,
        close: close,
        normalizePlatform: normalizePlatform
    };
})();
