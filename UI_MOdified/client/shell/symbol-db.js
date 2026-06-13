/*
 * symbol-db.js — RMOOZ SYMBOL-DB-B: proposed-unit platform categorizer.
 *
 * Enriches REVIEW-ONLY proposed_units with a symbol/platform classification and a
 * capability profile. The classification (symbol_category / platform_class) is the
 * SYMBOL-DB-A category ladder; the capability profile (sensors[] / weapons[] /
 * magazines[]) is sourced ONLY from the DB1 capability catalog (world-state-db.js).
 *
 *   NO INVENTION. If the catalog has no entry for the unit, sensors/weapons/magazines
 *   stay [] and the unit is flagged: catalog_match_status + "Catalog required" +
 *   needs_review. We never synthesise systems we cannot trace to the catalog.
 *
 * Fusion precedence (L15 declared > derived): if the unit already carries
 * operator-declared sensors/weapons/magazines, those win (status 'declared').
 *
 * Pure + deterministic: no Date.now / Math.random, no network, no LLM, no DOM.
 * Read-only: the input unit and scenario state are never mutated.
 *
 * API (window.RmoozSymbolDB / module.exports):
 *   categorize(unit)            -> the SYMBOL-DB-B enrichment object (fields below)
 *   enrichProposedUnits(units)  -> units.map(categorize)
 *   classify(platformName)      -> { symbol_category, candidates, confidence, status }
 *   lookupSystems(unit)         -> { key, sensors, weapons, magazines } (from DB1 only)
 *   CATALOG_REQUIRED            -> the AR/EN sentinel string
 *   ROLE_CLASS_KEYS, version
 *
 * Enrichment fields: symbol_category, symbol_category_candidates, platform_class,
 *   platform_name, catalog_match_status, catalog_confidence, catalog_key,
 *   capability_summary, sensors, weapons, magazines, unknown_fields, needs_review.
 */
(function (root) {
    'use strict';

    function safeRequire(p) { try { return require(p); } catch (_) { return null; } }
    // DB1 (capability catalog) — browser: loaded before this script; Node: required.
    var DB = (root && root.AppWorldStateDB) ||
        (typeof require !== 'undefined' ? safeRequire('./world-state-db.js') : null);

    var VERSION = 'symbol-db-b';
    var CATALOG_REQUIRED = 'يحتاج ربط بقاعدة البيانات / Catalog required';

    // DB1 keys that are GENERIC ROLE classes (not a specific platform). A hit here is
    // a class-typical profile to be verified, never a confirmed platform.
    var ROLE_CLASS_KEYS = {
        air_defense: 1, naval_combatant: 1, ground_maneuver: 1,
        air_unit: 1, ew_site: 1, generic: 1
    };

    function text(v, d) { var s = (v == null ? '' : String(v)); return s || (d == null ? '' : d); }
    function lower(v) { return text(v, '').toLowerCase(); }
    function arr(v) { return Array.isArray(v) ? v : []; }
    function clone(o) { try { return JSON.parse(JSON.stringify(o)); } catch (_) { return o; } }

    /* ── SYMBOL-DB-A category ladder (canonical copy; mirrored by base-status-panel) ── */
    function classify(platformName) {
        var p = lower(platformName).replace(/[–—]/g, '-');
        var cat = 'unknown', status = 'unknown', confidence = 0, candidates = null;
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
        return { symbol_category: cat, candidates: candidates, confidence: confidence, status: status };
    }

    var CAP_MAP = {
        air_fighter: ['Air operations'], air_attack: ['Air operations'], air_transport: ['Transport'],
        maritime_patrol: ['Maritime patrol'], helicopter: ['Helicopter'], uav: ['UAV/recon'],
        naval_surface: ['Maritime patrol'], submarine: ['Maritime patrol'],
        ground_unit: ['Ground/HQ/logistics'], air_defense: ['Ground/HQ/logistics'], radar: ['Ground/HQ/logistics'],
        base_facility: ['Ground/HQ/logistics'], hq: ['Ground/HQ/logistics'], logistics: ['Ground/HQ/logistics'],
        unknown: []
    };
    function categoryCapability(cat) { return CAP_MAP[cat] || []; }

    /* ── systems lookup — STRICTLY from the DB1 catalog; never fabricated ── */
    function lookupSystems(unit) {
        if (!DB || typeof DB.classifyKind !== 'function') {
            return { key: null, sensors: [], weapons: [], magazines: [] };
        }
        var key = DB.classifyKind(unit) || 'generic';
        var cap = (DB.CAPABILITY_CATALOG && DB.CAPABILITY_CATALOG[key]) ||
            (typeof DB.capabilityFor === 'function' ? DB.capabilityFor(unit) : null) || {};
        return {
            key: key,
            sensors: clone(arr(cap.sensors)),
            weapons: clone(arr(cap.weapons)),
            magazines: clone(arr(cap.magazines))
        };
    }

    function categorize(unit) {
        unit = unit || {};
        var platform = text(unit.platform || unit.platform_name || unit.name || unit.type || unit.type_ar, '');
        var c = classify(platform);
        var sys = lookupSystems(unit);
        var key = sys.key;

        // Highest precedence: operator-declared systems already on the unit.
        var declared = arr(unit.sensors).length || arr(unit.weapons).length || arr(unit.magazines).length;

        var sensors, weapons, magazines, status, confidence;
        if (declared) {
            sensors = clone(arr(unit.sensors));
            weapons = clone(arr(unit.weapons));
            magazines = clone(arr(unit.magazines));
            status = 'declared';
            confidence = 0.95;
        } else {
            var named = !!(key && !ROLE_CLASS_KEYS[key]);
            var roleClass = !!(key && ROLE_CLASS_KEYS[key] && key !== 'generic');
            var hasSystems = !!(sys.sensors.length || sys.weapons.length || sys.magazines.length);
            if (named && hasSystems) {
                sensors = sys.sensors; weapons = sys.weapons; magazines = sys.magazines;
                status = 'matched'; confidence = Math.max(c.confidence, 0.9);
            } else if (roleClass && hasSystems) {
                sensors = sys.sensors; weapons = sys.weapons; magazines = sys.magazines;
                status = 'role_class'; confidence = Math.max(c.confidence, 0.55);
            } else {
                // No catalog systems → DO NOT INVENT.
                sensors = []; weapons = []; magazines = [];
                status = c.status; confidence = c.confidence;
            }
        }

        var hasCatalog = (status === 'matched' || status === 'role_class' || status === 'declared');

        // platform_class: prefer the symbol category; for a catalog hit on an
        // unrecognised symbol, fall back to the DB1 key so the class is still useful.
        var platformClass = c.symbol_category !== 'unknown' ? c.symbol_category
            : (hasCatalog && key && key !== 'generic' ? key : null);

        // unknown_fields: flag exactly what the catalog could not supply.
        var unknownFields = [];
        if (c.symbol_category === 'unknown' && !hasCatalog) unknownFields.push('platform');
        if (!sensors.length) unknownFields.push('sensors');
        if (!weapons.length) unknownFields.push('weapons');
        if (!magazines.length) unknownFields.push('magazines');

        var summary;
        if (hasCatalog) {
            var parts = categoryCapability(c.symbol_category).slice();
            if (status === 'role_class') parts.push('role-class profile — verify');
            if (sensors.length) parts.push(sensors.length + (sensors.length > 1 ? ' sensors' : ' sensor'));
            if (weapons.length) parts.push(weapons.length + (weapons.length > 1 ? ' weapons' : ' weapon'));
            summary = parts.join(', ') || CATALOG_REQUIRED;
        } else if (c.symbol_category === 'unknown') {
            summary = CATALOG_REQUIRED;
        } else {
            var capTxt = categoryCapability(c.symbol_category).join(', ');
            summary = (capTxt ? capTxt + ' — ' : '') + CATALOG_REQUIRED;
        }

        return {
            symbol_category: c.symbol_category,
            symbol_category_candidates: c.candidates,
            platform_class: platformClass,
            platform_name: platform || null,
            catalog_match_status: status,
            catalog_confidence: confidence,
            catalog_key: key || null,
            capability_summary: summary,
            sensors: sensors,
            weapons: weapons,
            magazines: magazines,
            unknown_fields: unknownFields,
            needs_review: true
        };
    }

    function enrichProposedUnits(units) { return arr(units).map(categorize); }

    var api = {
        version: VERSION,
        CATALOG_REQUIRED: CATALOG_REQUIRED,
        ROLE_CLASS_KEYS: ROLE_CLASS_KEYS,
        classify: classify,
        lookupSystems: lookupSystems,
        categorize: categorize,
        enrichProposedUnits: enrichProposedUnits
    };
    root.RmoozSymbolDB = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
