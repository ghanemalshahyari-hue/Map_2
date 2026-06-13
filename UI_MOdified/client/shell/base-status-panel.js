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
    function unitIntel(unit) {
        var N = (typeof window !== 'undefined' && window.RmoozUnitIntelNormalizer) || null;
        if (!N || typeof N.normalizeUnit !== 'function') return null;
        try { return N.normalizeUnit(unit); } catch (_) { return null; }
    }
    // GLOBAL-SYMBOL-IDENTITY-A: shared resolver (window-only; null → existing fallback).
    function bspIdentity(input) { var w = (typeof window !== 'undefined') ? window : null; return (w && w.RmoozSymbolIdentity && w.RmoozSymbolIdentity.resolve) ? w.RmoozSymbolIdentity.resolve(input) : null; }
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
        // MULTI-COUNTRY-A: country_bases holds every coalition base anchor
        // (both sides). Concat so BLUE coalition bases also resolve here.
        return arr(ob.enemy_bases).concat(arr(ob.friendly_trial_bases)).concat(arr(ob.country_bases));
    }
    function sourceFile(payload, anchor) {
        return (anchor && anchor.source && anchor.source.file) ||
            (payload && payload.documents && payload.documents[0] && payload.documents[0].filename) ||
            (payload && payload.document && payload.document.filename) || '';
    }
    function normalizeName(s) {
        return lower(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    }
    function idTokens(o) {
        return [
            o && o.assigned_base_id, o && o.base_id, o && o.anchor_id,
            o && o.placement_candidate_id, o && o.base_location_id,
            o && o.location_id, o && o.assigned_base, o && o.id
        ].map(normalizeName).filter(Boolean);
    }
    function nameTokens(o) {
        return [
            o && o.base_name, o && o.base_name_ar, o && o.base_name_en, o && o.assigned_base,
            o && o.base_id, o && o.mention, o && o.normalized_name,
            o && o.location_id, o && o.id
        ].map(normalizeName).filter(Boolean);
    }
    function sideCountryCompatible(unit, anchor, base) {
        var sideU = String(unit && unit.side || '').toUpperCase();
        var sideA = String(anchor && anchor.side || (base && base.side) || '').toUpperCase();
        if (sideU && sideA && sideU !== sideA) return false;
        var countryU = normalizeName((unit && (unit.country_key || unit.country)) || '');
        var countryA = normalizeName((anchor && (anchor.country_key || anchor.country)) || (base && (base.country_key || base.country)) || '');
        return !(countryU && countryA && countryU !== countryA);
    }
    function idMatches(unit, anchor, base) {
        var uu = idTokens(unit);
        if (!uu.length) return false;
        var aa = idTokens(anchor).concat(idTokens(base));
        return aa.some(function (id) { return uu.indexOf(id) !== -1; });
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
        if (!sideCountryCompatible(unit, anchor, base)) return false;
        if (idMatches(unit, anchor, base)) return true;
        if (nameMatches(unit, anchor) || (base && nameMatches(unit, base))) return true;
        return coordMatches(unit, anchor) || (base && coordMatches(unit, base));
    }
    function allAnchorsAndBases(payload) {
        return allCandidates(payload).concat(allBases(payload));
    }
    function unassignedUnits(payload) {
        var anchors = allAnchorsAndBases(payload);
        return allProposedUnits(payload).filter(function (u) {
            return !anchors.some(function (a) { return unitBelongsToAnchor(u, a, a); });
        });
    }
    function findBase(anchor, payload) {
        var bases = allBases(payload);
        for (var i = 0; i < bases.length; i++) {
            if (nameMatches(anchor, bases[i]) || coordMatches(anchor, bases[i])) return bases[i];
        }
        return anchor || {};
    }
    function baseType(anchor, base) {
        // MAP-ANCHOR-SANITY: read the type from whichever field the source used
        // (site_type / base_type / anchor_type, then placement_type as a last
        // resort). Unknown → base_facility (never infantry/unit).
        var raw = lower(
            (base && (base.site_type || base.base_type || base.anchor_type)) ||
            (anchor && (anchor.site_type || anchor.base_type || anchor.anchor_type)) || '');
        if (!raw) raw = lower((base && base.placement_type) || (anchor && anchor.placement_type) || '');
        if (/friendly_trial|trial/.test(raw)) return 'friendly_trial_anchor';
        if (/naval|harbou|\bport\b|بحر|مينا/.test(raw)) return 'naval_base';
        if (/land|ground|army|بري|برية/.test(raw)) return 'land_base';
        if (/air|airfield|airport|جو|مطار/.test(raw)) return 'air_base';
        return 'base_facility';
    }
    function sideOf(anchor, base) {
        return String((anchor && anchor.side) || (base && base.side) || (baseType(anchor, base) === 'friendly_trial_anchor' ? 'BLUE' : 'RED')).toUpperCase();
    }

    function normalizePlatform(unit) {
        var platform = text(unit && (unit.platform || unit.platform_name || unit.name || unit.type || unit.type_ar), '');
        var intel = unitIntel(unit);
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

        if (intel && intel.symbol_category && intel.symbol_category !== 'unknown') {
            cat = intel.symbol_category;
            status = 'unit_intel';
            confidence = intel.confidence === 'high' ? 0.86 : (intel.confidence === 'medium' ? 0.66 : 0.42);
        }

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
            needs_review: true,
            unit_intel: intel
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
            infantry: ['Ground/HQ/logistics'],
            mechanized_infantry: ['Ground/HQ/logistics'],
            armor: ['Ground/HQ/logistics'],
            reconnaissance: ['UAV/recon', 'Ground/HQ/logistics'],
            artillery: ['Ground/HQ/logistics'],
            engineer: ['Ground/HQ/logistics'],
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
                case 'ground_unit': case 'infantry': case 'mechanized_infantry': case 'armor':
                case 'reconnaissance': case 'artillery': case 'engineer':
                case 'air_defense': case 'radar': case 'hq': case 'logistics': counts.ground += amount; break;
                default: counts.unknown += amount;
            }
        });
        return counts;
    }
    // SYMBOL-DB-B: aggregate per-unit catalog status + dominant category for the
    // base-level Symbol section (units stay grouped — no per-aircraft markers).
    function catalogSummary(units) {
        var c = {};
        units.forEach(function (u) { var s = normalizePlatform(u).catalog_match_status || 'unknown'; c[s] = (c[s] || 0) + 1; });
        var parts = Object.keys(c).map(function (k) { return k + ' ' + c[k]; });
        return parts.length ? parts.join(' · ') : 'no units';
    }
    function dominantCategory(units) {
        var tally = {}, best = '-', n = 0;
        units.forEach(function (u) { var s = normalizePlatform(u).symbol_category || 'unknown'; tally[s] = (tally[s] || 0) + 1; });
        Object.keys(tally).forEach(function (k) { if (tally[k] > n) { n = tally[k]; best = k; } });
        return best;
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
    // ── SYMBOL-DB-C: render the full SYMBOL-DB-B enrichment (reused, never re-derived) ──
    function fmtConf(c) { var n = Number(c); return (isFinite(n) ? Math.round(n * 100) : 0) + '%'; }
    function fmtSensor(s) { return s && (s.label || s.class || s.type || s.id) || 'sensor'; }
    function fmtWeapon(w) { return (w && (w.class || w.id) || 'weapon') + (w && w.mount ? ' [' + w.mount + ']' : ''); }
    function fmtMag(m) {
        var stock = (m && m.stock) || {};
        var parts = Object.keys(stock).map(function (k) { return k + '×' + stock[k]; });
        return (m && m.mount || 'mag') + (parts.length ? ': ' + parts.join(', ') : '');
    }
    function sysChips(list, fmt) {
        var items = arr(list).map(fmt);
        if (!items.length) return '<span class="bsp-dim">—</span>';
        return items.map(function (t) { return '<span class="bsp-syschip">' + esc(t) + '</span>'; }).join('');
    }
    function sysCell(label, html) {
        return '<div class="bsp-sysrow"><span>' + esc(label) + '</span><div>' + html + '</div></div>';
    }
    function fmtComposition(list) {
        var items = arr(list).map(function (c) {
            return (c.count || 1) + 'x ' + (c.echelon || '-') + ' ' + (c.unit_type || c.symbol_category || 'unknown');
        });
        return items.length ? items.join(', ') : '-';
    }
    // SIDC-BRIDGE-A: review-only SIDC preview (app favorites only; never final).
    function sidcPreview() { var w = (typeof window !== 'undefined') ? window : null; if (w && w.RmoozSidcPreview) return w.RmoozSidcPreview; try { return require('./sidc-preview.js'); } catch (_) { return null; } }
    function sidcPreviewRows(intel, side) {
        var sp = sidcPreview();
        if (!sp || !intel) return '';
        var p = sp.previewFor({ symbol_category: intel.symbol_category, echelon: intel.echelon, side: side });
        var cand = p.sidc_preview_candidate;
        var svg = cand ? sp.previewSvg(cand.sidc, { size: 20 }) : null;
        var val = cand
            ? esc(cand.sidc) + ' <span class="bsp-dim">(' + esc(cand.source) + ' · ' + esc(cand.confidence) + ')</span>' + (svg ? ' ' + svg : '')
            : '<span class="bsp-dim">none — ' + esc(arr(p.warnings).join('; ') || 'No safe internal SIDC mapping found') + '</span>';
        return sysCell('SIDC preview', val) +
            sysCell('Final symbol', '<span class="bsp-dim">Review required before final symbol</span>');
    }
    function unitIntelRows(intel, side) {
        if (!intel) return sysCell('Unit intel', '<span class="bsp-dim">not available</span>');
        return sysCell('Original text', esc(intel.original_text || '-')) +
            sysCell('Normalized type', esc((intel.unit_type || '-') + ' / ' + (intel.echelon || '-'))) +
            sysCell('Composition', esc(fmtComposition(intel.composition))) +
            sysCell('Symbol category', esc(intel.symbol_category || 'unknown')) +
            sysCell('SIDC candidate', esc((intel.sidc_candidate || 'review_required') + ' / ' + (intel.sidc_confidence || 'review_required'))) +
            sidcPreviewRows(intel, side) +
            sysCell('Unit confidence', esc(intel.confidence || 'low')) +
            sysCell('Unit warnings', esc(arr(intel.warnings).join(', ') || '-'));
    }
    function renderUnitTable(units) {
        if (!units.length) return '<div class="bsp-empty">No proposed units linked to this base.</div>';
        var rows = units.map(function (u) {
            var n = normalizePlatform(u);
            var ident = bspIdentity({ original_text: u.platform || u.platform_name || u.name, name: u.platform || u.platform_name, type: u.type_ar || u.type, side: u.side, symbol_category: n.symbol_category, unit_intel: n.unit_intel });
            var glyphPrefix = (ident && ident.display_glyph && ident.display_glyph !== '?') ? esc(ident.display_glyph) + ' ' : '';
            var warnings = arr(u && u.warnings).concat(u && u.warning ? [u.warning] : []);
            // Systems come ONLY from DB1 (via symbol-db). Present => catalog known; absent => Catalog required.
            var hasSystems = !!(n.sensors.length || n.weapons.length || n.magazines.length);
            var catalogKnown = hasSystems &&
                (n.catalog_match_status === 'matched' || n.catalog_match_status === 'role_class' || n.catalog_match_status === 'declared');
            var catMissing = !catalogKnown;
            var classLine = (n.platform_class && n.platform_class !== n.symbol_category)
                ? '<br><small>' + esc(n.platform_class) + '</small>' : '';
            var candLine = n.symbol_category_candidates ? '<br><small>' + esc(n.symbol_category_candidates.join(' / ')) + '</small>' : '';
            var main = '<tr class="bsp-u-row' + (catMissing ? ' bsp-u-missing' : '') + '">' +
                '<td>' + esc(u.platform || u.platform_name || u.name || '-') + '</td>' +
                '<td>' + esc(u.type_ar || u.type || '-') + '</td>' +
                '<td>' + esc(u.estimated_count == null ? '-' : u.estimated_count) + '</td>' +
                '<td>' + glyphPrefix + esc(n.symbol_category) + classLine + candLine + '</td>' +
                '<td><span class="bsp-cat bsp-cat-' + esc(n.catalog_match_status) + '">' + esc(n.catalog_match_status) + '</span>' +
                    '<br><small>' + esc(fmtConf(n.catalog_confidence)) + '</small></td>' +
                '<td>' + esc(n.needs_review === false ? 'false' : 'true') + '</td>' +
                '<td>' + esc(warnings.join(', ') || '-') + '</td>' +
                '</tr>';
            var detail = '<tr class="bsp-u-detail"><td colspan="7"><details class="bsp-sysd">' +
                '<summary>' + esc(n.capability_summary || '-') + '</summary>' +
                '<div class="bsp-sysgrid">' +
                    sysCell('Platform class', n.platform_class ? esc(n.platform_class) : '<span class="bsp-dim">—</span>') +
                    sysCell('Catalog', esc(n.catalog_match_status) + ' · ' + esc(fmtConf(n.catalog_confidence))) +
                    unitIntelRows(n.unit_intel, u.side) +
                    sysCell('Sensors', sysChips(n.sensors, fmtSensor)) +
                    sysCell('Weapons', sysChips(n.weapons, fmtWeapon)) +
                    sysCell('Magazines', sysChips(n.magazines, fmtMag)) +
                    sysCell('Unknown fields', (n.unknown_fields && n.unknown_fields.length) ? esc(n.unknown_fields.join(', ')) : '<span class="bsp-dim">—</span>') +
                '</div>' +
                (catMissing ? '<div class="bsp-catreq">' + esc(CATALOG_REQUIRED) + ' · needs_review</div>' : '') +
                '</details></td></tr>';
            return main + detail;
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
        // Bound the card to the app-shell CONTENT BAND (shell-safe-area.js publishes the band as
        // --rmooz-shell-top-safe / --rmooz-shell-bottom-safe on <html>). The OUTER card is bounded
        // (top/bottom/max-height) with overflow:hidden so it can NEVER pass behind the top header or
        // the bottom chrome (timeline strip + 200px event log + status footer + classification bars);
        // the INNER .bsp-body scrolls (min-height:0 + overflow-y:auto) so the last rows / message log
        // stay reachable above the footer. Defaults are a safe fallback only — the live band wins.
        style.textContent = [
            '.step1-base-status-panel{position:fixed;right:0;top:var(--rmooz-shell-top-safe,74px);bottom:var(--rmooz-shell-bottom-safe,96px);width:460px;max-width:100vw;max-height:calc(100vh - var(--rmooz-shell-top-safe,74px) - var(--rmooz-shell-bottom-safe,96px));z-index:940;display:flex;flex-direction:column;background:#0d1119;color:#cdd8e4;border-left:3px solid #2a4060;box-shadow:-6px 0 24px rgba(0,0,0,.75);font-family:Consolas,monospace;font-size:12px;overflow:hidden;box-sizing:border-box;}',
            '.step1-base-status-panel[hidden]{display:none!important}.bsp-body{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;padding-bottom:10px}.bsp-header{flex:0 0 auto;padding:12px 14px;background:#101820;border-bottom:1px solid #1e2b3a;display:flex;justify-content:space-between;gap:12px}.bsp-title{font-size:16px;color:#e8f0f8;font-weight:700}.bsp-subtitle{color:#8fb8e0;margin-top:2px}.bsp-close{border:1px solid #33475f;background:#111a24;color:#cfe6ff;border-radius:4px;cursor:pointer;width:28px;height:28px}.bsp-section{border-bottom:1px solid #172434;padding:10px 14px}.bsp-section h3{margin:0 0 8px;color:#8fb8e0;font-size:12px;text-transform:uppercase;letter-spacing:0}.bsp-row{display:grid;grid-template-columns:142px 1fr;gap:8px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.035)}.bsp-row span{color:#7f93a6}.bsp-row b{color:#e8eaed;font-weight:500;text-align:right;word-break:break-word}.bsp-chip{display:inline-block;margin:2px 4px 2px 0;padding:2px 7px;border-radius:8px;border:1px solid #2e5d7d;background:#16222e;color:#cfe6ff}.bsp-chip.red{border-color:#6e3333;color:#f0a0a0}.bsp-chip.blue{border-color:#2c6542;color:#7fd6a0}.bsp-chip.warn{border-color:#8a6a20;color:#e0c060;background:#2a2412}.bsp-chip.review{border-color:#8a6a20;color:#e0c060;background:#2a2412}.bsp-summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px}.bsp-table-wrap{overflow-x:auto;overflow-y:visible;border:1px solid #1e2b3a;-webkit-overflow-scrolling:touch}.bsp-table{width:100%;border-collapse:collapse;min-width:600px}.bsp-table th,.bsp-table td{padding:5px 6px;border-bottom:1px solid #182536;text-align:left;vertical-align:top;word-break:break-word;overflow-wrap:anywhere}.bsp-table td:last-child{max-width:160px}.bsp-table th{color:#8fb8e0;background:#101820;font-size:11px}.bsp-table td{color:#d8e0e8}.bsp-table small{color:#9ab}.bsp-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}.bsp-tab{border:1px solid #26384a;background:#101820;color:#9fbad0;padding:6px;text-align:center}.bsp-tab-body{margin-top:8px;padding:8px;border:1px dashed #30455c;color:#e0c060;background:#121711;direction:rtl;text-align:right}.bsp-empty{color:#8fa5b8;font-style:italic}.bsp-log{margin:0;padding-left:18px;color:#d8e0e8}.bsp-log li{margin:3px 0}.bsp-cap-list{margin:0;padding-left:18px;color:#d8e0e8}.bsp-cap-list li{margin:3px 0}.bsp-u-missing>td{background:rgba(138,106,32,.10)}.bsp-u-detail>td{padding:0 6px 8px;border-bottom:1px solid #182536}.bsp-cat{padding:1px 5px;border-radius:4px;border:1px solid #335}.bsp-cat-matched{border-color:#2c6542;color:#7fd6a0}.bsp-cat-role_class{border-color:#5b6a8a;color:#aac0e0}.bsp-cat-declared{border-color:#2c6542;color:#9fe0a0}.bsp-cat-category_only,.bsp-cat-unknown,.bsp-cat-ambiguous{border-color:#8a6a20;color:#e0c060}.bsp-sysd{font-size:11px}.bsp-sysd>summary{cursor:pointer;color:#cfe6ff;padding:4px 0;list-style:none}.bsp-sysd>summary::-webkit-details-marker{display:none}.bsp-sysd>summary:before{content:"\\25B8 ";color:#5b7da0}.bsp-sysd[open]>summary:before{content:"\\25BE "}.bsp-sysgrid{display:grid;grid-template-columns:1fr;gap:3px;padding:4px 0 2px}.bsp-sysrow{display:grid;grid-template-columns:96px 1fr;gap:8px;align-items:start}.bsp-sysrow>span{color:#7f93a6}.bsp-syschip{display:inline-block;margin:1px 4px 1px 0;padding:1px 6px;border-radius:6px;border:1px solid #2e5d7d;background:#16222e;color:#cfe6ff;font-size:10px;word-break:break-word}.bsp-dim{color:#5f7388}.bsp-catreq{margin-top:6px;padding:5px 8px;border:1px solid #8a6a20;background:#2a2412;color:#e0c060;border-radius:4px;direction:rtl;text-align:right}',
            '@media(max-width:768px){.step1-base-status-panel{width:100%;}.bsp-row{grid-template-columns:118px 1fr}}'
        ].join('');
        document.head.appendChild(style);
    }
    function close() {
        var panel = document && document.getElementById(PANEL_ID);
        if (panel) panel.setAttribute('hidden', '');
    }
    // Refresh the shared shell safe-area vars so the card is bounded to the live content band
    // (handles layout changes since load). The card positions purely via the CSS vars; no inline
    // geometry on the panel. Guarded — a no-op if the measurer isn't loaded (CSS-var defaults apply).
    function refreshShellSafeArea() {
        try {
            var SSA = (typeof window !== 'undefined' && window.RmoozShellSafeArea) || null;
            if (SSA && typeof SSA.measure === 'function') SSA.measure();
        } catch (_) {}
    }
    function render(anchor, payload) {
        var panel = ensurePanel();
        if (!panel) return;
        refreshShellSafeArea();
        anchor = anchor || {};
        payload = payload || {};
        var base = findBase(anchor, payload);
        var units = allProposedUnits(payload).filter(function (u) { return unitBelongsToAnchor(u, anchor, base); });
        var orphaned = unassignedUnits(payload);
        var side = sideOf(anchor, base);
        var type = baseType(anchor, base);
        var country = text(anchor.country || base.country, '');
        var counts = categoryCounts(units);
        // SYMBOL-DB-B: resolve the base symbol from the shared registry (guarded).
        var REG = (typeof window !== 'undefined' && window.RmoozSymbolRegistry) || null;
        var sym = (REG && REG.resolveBaseSymbol) ? REG.resolveBaseSymbol({
            object_type: type, site_type: type,
            base_name_en: base.base_name_en || anchor.base_name_en,
            base_name_ar: base.base_name_ar || anchor.base_name_ar,
        }) : null;
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
            chip(side, side === 'BLUE' ? 'blue' : 'red') +
            (country ? chip(country, side === 'BLUE' ? 'blue' : (side === 'RED' ? 'red' : '')) : '') +
            chip(type) + chip('Review only', 'review') +
            chip('needs_review:true', 'review') + chip('exact_unit_position:false', 'review') +
            '</div></div><button class="bsp-close" type="button" title="Close">x</button></header>';
        // Everything below the header lives in the internally-scrolling body.
        html += '<div class="bsp-body">';
        html += '<section class="bsp-section"><h3>Location</h3>' +
            row('Lat / Lon', (lat != null && lon != null) ? (lat + ', ' + lon) : '-') +
            row('Coordinate format', anchor.coordinate_format || base.coordinate_format || 'base_anchor') +
            row('AO check', anchor.ao_check || base.ao_check || '-') +
            row('Terrain', anchor.terrain ? (anchor.terrain.terrain_available === true ? 'available' : 'unavailable') : '-') +
            row('Source type', anchor.source_type || base.source_type || source.type || '-') +
            '</section>';
        html += '<section class="bsp-section"><h3>Base Summary</h3>' +
            row('Country / الدولة', country || '-') +
            row('Side / الجهة', side) +
            row('Assigned base / ID', base.assigned_base || base.base_id || anchor.assigned_base || anchor.base_id || base.id || anchor.location_id || '-') +
            row('Proposed units count', units.length) +
            '<div class="bsp-summary-grid">' +
            row('fighters', counts.fighters) + row('attack aircraft', counts.attack_aircraft) +
            row('transport', counts.transport) + row('maritime patrol', counts.maritime_patrol) +
            row('helicopters', counts.helicopters) + row('UAV', counts.uav) +
            row('naval', counts.naval) + row('ground', counts.ground) + row('unknown', counts.unknown) +
            '</div></section>';
        // SYMBOL-DB-B: base symbol mapping metadata (registry-sourced; review-only).
        html += '<section class="bsp-section"><h3>Symbol / الرمز</h3>' +
            row('object_type', sym ? sym.object_type : type) +
            row('base_type', type) +
            row('symbol', sym ? (sym.glyph + '  ' + sym.label_en + ' / ' + sym.label_ar) : '-') +
            row('symbol_category', dominantCategory(units)) +
            row('symbol_source', sym ? sym.symbol_source : 'registry_not_loaded') +
            row('catalog_match_status', catalogSummary(units)) +
            ((sym && sym.fallback) ? '<div class="bsp-catreq">' + esc(sym.warning || 'symbol fallback used') + '</div>' : '') +
            '</section>';
        html += '<section class="bsp-section"><h3>Proposed Units</h3>' + renderUnitTable(units) + '</section>';
        if (orphaned.length) {
            html += '<section class="bsp-section"><h3>Unassigned / needs base review</h3>' +
                '<div class="bsp-catreq">These proposed units are present in the review payload but did not match a base anchor by id, name, country/side, or coordinates.</div>' +
                renderUnitTable(orphaned) + '</section>';
        }
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
        html += '</div>'; // close .bsp-body
        panel.innerHTML = html;
        panel.removeAttribute('hidden');
        var closeBtn = panel.querySelector('.bsp-close');
        if (closeBtn) closeBtn.addEventListener('click', close);
    }

    window.RmoozBaseStatusPanel = {
        open: render,
        close: close,
        normalizePlatform: normalizePlatform,
        _test: {
            unitBelongsToAnchor: unitBelongsToAnchor,
            unassignedUnits: unassignedUnits
        }
    };
})();
