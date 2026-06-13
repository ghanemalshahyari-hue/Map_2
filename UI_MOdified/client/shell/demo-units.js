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

    var BUCKETS = [
        'air_fighter', 'air_attack', 'air_transport', 'maritime_patrol', 'helicopter', 'uav',
        'naval_surface', 'submarine', 'ground_unit', 'infantry', 'mechanized_infantry', 'armor',
        'reconnaissance', 'artillery', 'air_defense', 'radar', 'engineer', 'logistics', 'hq',
        'air_base', 'naval_base', 'land_base', 'unknown'
    ];

    function arr(v) { return Array.isArray(v) ? v : []; }
    function num(v) { if (v == null || v === '') return null; var n = Number(v); return Number.isFinite(n) ? n : null; }
    function opBrief(p) {
        return (p && p.brief && p.brief.operational_brief) || (p && p.operational_brief) ||
            (p && typeof p === 'object' && !Array.isArray(p) ? p : {});
    }
    function W() { return (typeof window !== 'undefined') ? window : root; }
    function normalizer() {
        var w = W();
        if (w && w.RmoozUnitIntelNormalizer) return w.RmoozUnitIntelNormalizer;
        try { return require('./unit-intel-normalizer.js'); } catch (_) { return null; }
    }
    function unitIntel(unit) {
        var N = normalizer();
        if (!N || typeof N.normalizeUnit !== 'function') return null;
        try { return N.normalizeUnit(unit); } catch (_) { return null; }
    }

    // Category: prefer the canonical SYMBOL-DB ladder when loaded; else a small
    // built-in fallback so the module also works standalone.
    function rawCategory(unit) {
        var w = W();
        var intel = unitIntel(unit);
        if (intel && intel.symbol_category && intel.symbol_category !== 'unknown') return intel.symbol_category;
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
            case 'submarine': case 'ground_unit': case 'infantry': case 'mechanized_infantry':
            case 'armor': case 'reconnaissance': case 'artillery': case 'air_defense':
            case 'radar': case 'engineer': case 'logistics': case 'hq':
            case 'air_base': case 'naval_base': case 'land_base':
                return cat;
            case 'base_facility': return 'land_base';
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
            var intel = unitIntel(pu);
            var lat = num(pu.lat), lon = num(pu.lon);
            var du = {
                id: 'DEMO-' + (pu.id || ('PU' + i)),
                source_proposed_unit_id: pu.id || null,
                demo_only: true, review_only: true, movement_status: 'demo',
                side: String(pu.side || '').toUpperCase(), country: pu.country || null, country_key: pu.country_key || null,
                base_name_ar: pu.base_name_ar || '', base_name_en: pu.base_name_en || '', site_type: pu.site_type || null,
                platform: pu.platform || null, estimated_count: pu.estimated_count == null ? null : pu.estimated_count,
                symbol_category: cat, unit_intel: intel,
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
        order.forEach(function (k) {
            var g = groupMap[k];
            var members = demo_units.filter(function (du) { return g.member_ids.indexOf(du.id) !== -1; });
            var summary = summarizeUnitIntel(members);
            g.unit_intel_summary = summary;
            g.unit_intel_warnings = summary.warnings;
        });
        return { demo_units: demo_units, groups: order.map(function (k) { return groupMap[k]; }) };
    }

    function nm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }

    // Build movement groups from the BASE ANCHORS (placement_candidates) — the
    // reliable source of coordinates — and attach each anchor's grouped units by
    // matching proposed_units via assigned_base_id / base name. This gives one
    // demo group per base (RED + BLUE), even when top-level proposed_units carry
    // no per-unit coordinates. Falls back to proposed-unit grouping (no anchors).
    function buildGroupsFromAnchors(payload) {
        var ob = opBrief(payload);
        var cands = arr(ob.placement_candidates).filter(function (c) {
            return c && num(c.lat) != null && num(c.lon) != null;   // null/'' → not an anchor (Number(null)===0 trap)
        });
        if (!cands.length) return [];
        var pus = arr(ob.proposed_units);
        var byBaseId = {}, byName = {};
        pus.forEach(function (u) {
            if (u.assigned_base_id) (byBaseId[u.assigned_base_id] = byBaseId[u.assigned_base_id] || []).push(u);
            var n = nm(u.base_name_en || u.base_name_ar);
            if (n) (byName[n] = byName[n] || []).push(u);
        });
        return cands.map(function (c, i) {
            var members = byBaseId[c.base_id] || byBaseId[c.id] || byName[nm(c.base_name_en || c.base_name_ar || c.mention)] || [];
            var counts = zeroCounts(), total = 0;
            members.forEach(function (u) {
                var cat = categoryOf(u), amt = Number(u.estimated_count);
                if (!Number.isFinite(amt) || amt < 1) amt = 1;
                counts[cat] += amt; total += amt;
            });
            if (!members.length) {
                var gc = c.grouped_units_count != null ? c.grouped_units_count : c.grouped_unit_count;
                total = Number(gc) || 0;
            }
            var summary = summarizeUnitIntel(members);
            return {
                id: 'DEMOGRP-' + String(c.side || '').toUpperCase() + '-' + (c.country_key || 'ctry') + '-' + i,
                side: String(c.side || '').toUpperCase(), country: c.country || null, country_key: c.country_key || null,
                base_name_ar: c.base_name_ar || '', base_name_en: c.base_name_en || c.mention || '', site_type: c.site_type || null,
                anchor: { lat: num(c.lat), lon: num(c.lon) },
                member_ids: members.map(function (m) { return m.id; }), category_counts: counts, total: total,
                unit_intel_summary: summary, unit_intel_warnings: summary.warnings,
                demo_only: true, review_only: true, movement_status: 'demo',
            };
        });
    }

    function summarizeUnitIntel(members) {
        var source = arr(members);
        var normalized = source.map(function (m) {
            var intel = m && m.unit_intel ? m.unit_intel : unitIntel(m);
            if (!intel) return null;
            return {
                original_text: intel.original_text,
                normalized_name_ar: intel.normalized_name_ar,
                normalized_name_en: intel.normalized_name_en,
                unit_number: intel.unit_number,
                echelon: intel.echelon,
                unit_family: intel.unit_family,
                unit_type: intel.unit_type,
                symbol_category: intel.symbol_category,
                platform_category: intel.platform_category,
                sidc_candidate: intel.sidc_candidate,
                sidc_confidence: intel.sidc_confidence,
                composition: intel.composition || [],
                confidence: intel.confidence,
                warnings: intel.warnings || [],
                missing_information: intel.missing_information || [],
                needs_review: true,
                exact_unit_position: false,
            };
        }).filter(Boolean);
        var tally = {}, warnings = [], missing = [];
        normalized.forEach(function (n, idx) {
            var cat = n.symbol_category || 'unknown';
            var amt = Number(source[idx] && source[idx].estimated_count);
            if (!Number.isFinite(amt) || amt < 1) amt = 1;
            tally[cat] = (tally[cat] || 0) + amt;
            arr(n.warnings).forEach(function (w) { if (warnings.indexOf(w) === -1) warnings.push(w); });
            arr(n.missing_information).forEach(function (m) { if (missing.indexOf(m) === -1) missing.push(m); });
        });
        var best = 'unknown', bestN = -1;
        Object.keys(tally).forEach(function (k) { if (tally[k] > bestN) { best = k; bestN = tally[k]; } });
        return {
            normalized_units: normalized,
            dominant_symbol_category: best,
            warnings: warnings,
            missing_information: missing,
            sidc_candidate: 'review_required',
            needs_review: true,
            exact_unit_position: false,
        };
    }

    var API = { buildDemoUnits: buildDemoUnits, buildGroupsFromAnchors: buildGroupsFromAnchors, categoryOf: categoryOf, BUCKETS: BUCKETS };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined') window.RmoozDemoUnits = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
