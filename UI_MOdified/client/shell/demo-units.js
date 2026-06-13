/* ============================================================================
 * demo-units.js — DOC-UNDERSTANDING-1 / MULTI-COUNTRY-DEMO-A
 * ----------------------------------------------------------------------------
 * DEMO-ONLY conversion layer: proposed_units → demo_units. Temporary VISUAL
 * units for the demo-movement overlay. They are NOT scenario units:
 *   - never written to RmoozScenario / window.units / world-state
 *   - never "approved"
 *   - every demo_unit: demo_only:true, review_only:true, movement_status:'demo',
 *     source_proposed_unit_id, exact_unit_position:false, needs_review:true
 *
 * Also groups demo units per base anchor and tallies platform categories into
 * the 9 demo buckets (air_fighter / air_attack / air_transport / maritime_patrol
 * / helicopter / uav / naval_surface / ground_unit / unknown), reusing the
 * SYMBOL-DB category ladder (RmoozSymbolDB / base-status normalizePlatform).
 *
 *   window.RmoozDemoUnits = { buildDemoUnits(payload), categoryOf(unit), BUCKETS }
 *   (also module.exports for Node tests)
 * ========================================================================== */
(function (root) {
    'use strict';

    var BUCKETS = ['air_fighter', 'air_attack', 'air_transport', 'maritime_patrol', 'helicopter', 'uav', 'naval_surface', 'ground_unit', 'unknown'];

    function arr(v) { return Array.isArray(v) ? v : []; }
    function num(v) { var n = Number(v); return Number.isFinite(n) ? n : null; }
    function opBrief(p) {
        return (p && p.brief && p.brief.operational_brief) || (p && p.operational_brief) ||
            (p && typeof p === 'object' && !Array.isArray(p) ? p : {});
    }
    function W() { return (typeof window !== 'undefined') ? window : root; }

    // Category: prefer the canonical SYMBOL-DB ladder when loaded; else a small
    // built-in fallback so the module also works standalone.
    function rawCategory(unit) {
        var w = W();
        try { if (w && w.RmoozSymbolDB && typeof w.RmoozSymbolDB.categorize === 'function') return w.RmoozSymbolDB.categorize(unit).symbol_category; } catch (_) {}
        try { if (w && w.RmoozBaseStatusPanel && typeof w.RmoozBaseStatusPanel.normalizePlatform === 'function') return w.RmoozBaseStatusPanel.normalizePlatform(unit).symbol_category; } catch (_) {}
        return localCategory(unit);
    }
    function localCategory(unit) {
        var p = String((unit && (unit.platform || unit.platform_name || unit.type_ar || unit.type)) || '').toLowerCase();
        if (/uav|drone|shahed|mohajer|مسير/.test(p)) return 'uav';
        if (/apache|chinook|helicopter|helo|rotary|مروحي/.test(p)) return 'helicopter';
        if (/c-?130|hercules|transport|نقل/.test(p)) return 'air_transport';
        if (/p-?3|orion|maritime|\bmpa\b/.test(p)) return 'maritime_patrol';
        if (/su-?24|tornado|bomber|strike|قاذف|هجوم/.test(p)) return 'air_attack';
        if (/f-?1[4568]|f-?5|f-?7|rafale|mirage|typhoon|eurofighter|gripen|tomcat|fighter|مقاتل/.test(p)) return 'air_fighter';
        if (/frigate|corvette|\bfac\b|ship|naval|submarine|\bmcm\b|boat|vessel|فرقاط|كورفيت|زورق|غواص|كاسح/.test(p)) return 'naval_surface';
        if (/sam|patriot|nasams|s-?300|rapier|aaa|shorad|radar|armor|tank|infantry|battalion|brigade|دفاع|مدرع|رادار/.test(p)) return 'ground_unit';
        return 'unknown';
    }
    // Map the full SYMBOL-DB ladder onto the 9 demo buckets.
    function toBucket(cat) {
        switch (cat) {
            case 'air_fighter': case 'air_attack': case 'air_transport':
            case 'maritime_patrol': case 'helicopter': case 'uav': case 'naval_surface':
                return cat;
            case 'submarine': return 'naval_surface';
            case 'air_defense': case 'radar': case 'hq': case 'logistics': case 'base_facility': case 'ground_unit':
                return 'ground_unit';
            default: return 'unknown';
        }
    }
    function categoryOf(unit) { return toBucket(rawCategory(unit)); }

    function zeroCounts() { var o = {}; BUCKETS.forEach(function (b) { o[b] = 0; }); return o; }
    function baseKey(u) {
        return [String(u.side || '').toUpperCase(), u.country || '', u.base_name_en || u.base_name_ar || '',
            u.lat == null ? '' : u.lat, u.lon == null ? '' : u.lon].join('|');
    }

    function buildDemoUnits(payload) {
        var ob = opBrief(payload);
        var pus = arr(ob.proposed_units);
        var demo_units = [];
        var groupMap = {};
        var order = [];
        pus.forEach(function (pu, i) {
            var cat = categoryOf(pu);
            var lat = num(pu.lat), lon = num(pu.lon);
            var du = {
                id: 'DEMO-' + (pu.id || ('PU' + i)),
                source_proposed_unit_id: pu.id || null,
                demo_only: true, review_only: true, movement_status: 'demo',
                side: String(pu.side || '').toUpperCase(), country: pu.country || null, country_key: pu.country_key || null,
                base_name_ar: pu.base_name_ar || '', base_name_en: pu.base_name_en || '', site_type: pu.site_type || null,
                platform: pu.platform || null, estimated_count: pu.estimated_count == null ? null : pu.estimated_count,
                symbol_category: cat,
                anchor: { lat: lat, lon: lon },
                exact_unit_position: false, needs_review: true,
                source_type: pu.source_type || 'external_excel_orbat_candidate',
            };
            demo_units.push(du);

            var k = baseKey(pu);
            if (!groupMap[k]) {
                groupMap[k] = {
                    id: 'DEMOGRP-' + du.side + '-' + (du.country_key || 'ctry') + '-' + order.length,
                    side: du.side, country: du.country, country_key: du.country_key,
                    base_name_ar: du.base_name_ar, base_name_en: du.base_name_en, site_type: du.site_type,
                    anchor: { lat: lat, lon: lon },
                    member_ids: [], category_counts: zeroCounts(), total: 0,
                    demo_only: true, review_only: true, movement_status: 'demo',
                };
                order.push(k);
            }
            var g = groupMap[k];
            g.member_ids.push(du.id);
            var amt = Number(du.estimated_count);
            if (!Number.isFinite(amt) || amt < 1) amt = 1;
            g.category_counts[cat] += amt;
            g.total += amt;
        });
        return { demo_units: demo_units, groups: order.map(function (k) { return groupMap[k]; }) };
    }

    var API = { buildDemoUnits: buildDemoUnits, categoryOf: categoryOf, BUCKETS: BUCKETS };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined') window.RmoozDemoUnits = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
