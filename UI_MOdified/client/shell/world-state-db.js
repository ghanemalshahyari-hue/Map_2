/* ============================================================================
 * world-state-db.js — RMOOZ PR-DB1: DB-Lite (role → capability catalog)
 * ----------------------------------------------------------------------------
 * Direction (authoritative, [[project_rmooz_direction_reset]]): RMOOZ DB-Lite is
 * LIGHTWEIGHT operational data only — role, domain, readiness, supply, sensor
 * class, weapon class, doctrine tags. NOT a CMO database, NOT proprietary, NOT
 * size-first. Data-driven + easy to extend (add a row to CAPABILITY_CATALOG).
 *
 * What it does: given a unit's role/domain, attach a CMO-style component profile
 * (sensors[]/weapons[]/magazines[] + rcs_class + readiness/supply + doctrine_tags)
 * so the engines (DET1 detection, ENG1 engagement, WS3 transition) light up on a
 * REAL scenario — instead of W3 units carrying no capabilities. No hardcoded
 * per-scenario logic: classification is generic (role keywords + domain), the
 * catalog is the data. Authored components are NEVER overwritten.
 *
 * SAFETY: pure (clones), framework-free (browser + Node). All values are OURS.
 * ========================================================================== */
(function (root) {
    'use strict';

    var DB_VERSION = '1.0.0-db1';

    /* ---- the catalog (DATA — extend by adding/editing rows) --------------- */
    // mount ids + class names align with detection.js / engagement.js DB-Lite.
    var CAPABILITY_CATALOG = {
        air_defense: {
            rcs_class: 'medium', readiness: 'ready', supply: 0.8, doctrine_tags: ['IADS', 'air_defense'],
            sensors: [{ id: 'ewr', type: 'radar', class: 'long_range_3d', emcon: 'active' },
                      { id: 'fc',  type: 'radar', subtype: 'fire_control', class: 'fire_control', emcon: 'active', channels: 4 }],
            weapons: [{ id: 'sam', class: 'long_range_sam', mount: 'm1', wra: { mode: '75pct', salvo: 2 } }],
            magazines: [{ mount: 'm1', stock: { long_range_sam: 32 } }]
        },
        naval_combatant: {
            rcs_class: 'very_large', readiness: 'ready', supply: 0.8, doctrine_tags: ['sea_control'],
            sensors: [{ id: 'as', type: 'radar', class: 'air_search', emcon: 'active' },
                      { id: 'fc', type: 'radar', subtype: 'fire_control', class: 'fire_control', emcon: 'active', channels: 4 },
                      { id: 'esm', type: 'esm', class: 'esm_intercept', emcon: 'active' }],
            weapons: [{ id: 'msam', class: 'medium_sam', mount: 'm1', wra: { mode: 'max', salvo: 2 } },
                      { id: 'ciws', class: 'point_defense', mount: 'm2' }],
            magazines: [{ mount: 'm1', stock: { medium_sam: 16 } }, { mount: 'm2', stock: { point_defense: 2000 } }]
        },
        ground_maneuver: {
            rcs_class: 'small', readiness: 'ready', supply: 0.7, doctrine_tags: ['maneuver'],
            sensors: [{ id: 'ss', type: 'radar', class: 'surface_search', emcon: 'active' }],
            weapons: [{ id: 'gun', class: 'gun', mount: 'm1' }],
            magazines: [{ mount: 'm1', stock: { gun: 600 } }]
        },
        air_unit: {
            rcs_class: 'medium', readiness: 'ready', supply: 0.8, doctrine_tags: ['air'],
            sensors: [{ id: 'ar', type: 'radar', class: 'multifunction', emcon: 'active' }],
            weapons: [], magazines: []
        },
        ew_site: {
            rcs_class: 'large', readiness: 'ready', supply: 0.9, doctrine_tags: ['EW', 'early_warning'],
            sensors: [{ id: 'ewr', type: 'radar', class: 'long_range_3d', emcon: 'active' }],
            weapons: [], magazines: []
        },
        generic: {
            rcs_class: 'medium', readiness: 'ready', supply: 0.8, doctrine_tags: [],
            sensors: [], weapons: [], magazines: []
        },
        // Phase 5D-1: Soviet air-defense platform variants
        sam_s300: {
            rcs_class: 'large', readiness: 'ready', supply: 0.9, doctrine_tags: ['IADS', 'SAM', 'strategic', 'standoff'],
            sensors: [{ id: 'sr', type: 'radar', class: 'S300_SEARCH_RADAR', emcon: 'active' },
                      { id: 'fc', type: 'radar', subtype: 'fire_control', class: 'fire_control', emcon: 'active', channels: 2 }],
            weapons: [{ id: 'sam', class: 'S300_MISSILE', mount: 'm1', wra: { mode: 'max', salvo: 2 } }],
            magazines: [{ mount: 'm1', stock: { S300_MISSILE: 48 } }]
        },
        sam_s75: {
            rcs_class: 'medium', readiness: 'ready', supply: 0.8, doctrine_tags: ['IADS', 'SAM', 'tactical', 'standoff'],
            sensors: [{ id: 'sr', type: 'radar', class: 'S75_RADAR', emcon: 'active' },
                      { id: 'fc', type: 'radar', subtype: 'fire_control', class: 'fire_control', emcon: 'active', channels: 1 }],
            weapons: [{ id: 'sam', class: 'S75_MISSILE', mount: 'm1', wra: { mode: 'max', salvo: 2 } }],
            magazines: [{ mount: 'm1', stock: { S75_MISSILE: 32 } }]
        },
        aaa_zsu: {
            rcs_class: 'small', readiness: 'ready', supply: 0.7, doctrine_tags: ['AAA', 'point_defense', 'autonomous'],
            sensors: [{ id: 'sr', type: 'radar', class: 'ZSU_RADAR', emcon: 'active' }],
            weapons: [{ id: 'gun', class: 'ZSU_GUN', mount: 'm1', wra: { mode: 'max', salvo: 1 } }],
            magazines: [{ mount: 'm1', stock: { ZSU_GUN: 4000 } }]
        },
        aaa_23mm: {
            rcs_class: 'small', readiness: 'ready', supply: 0.7, doctrine_tags: ['AAA', 'point_defense', 'optical'],
            sensors: [{ id: 'opt', type: 'optical', class: 'visual', emcon: 'always' }],
            weapons: [{ id: 'gun', class: 'AAA_GUN', mount: 'm1', wra: { mode: 'max', salvo: 1 } }],
            magazines: [{ mount: 'm1', stock: { AAA_GUN: 2000 } }]
        },
        radar_p37: {
            rcs_class: 'large', readiness: 'ready', supply: 0.95, doctrine_tags: ['radar', 'early_warning', 'strategic', 'no_weapons'],
            sensors: [{ id: 'ewr', type: 'radar', class: 'P37_RADAR', emcon: 'active' }],
            weapons: [], magazines: []
        }
    };

    /* ---- generic classification (role keywords + domain; NOT scenario-specific) */
    function classifyKind(u) {
        var role = (u && u.role || '').toLowerCase();
        var dom = (u && u.domain) || '';
        // Phase 5D-1: Soviet SAM/AAA variants (more specific than generic air_defense)
        if (/s-?300|s300|s-300/i.test(role)) return 'sam_s300';
        if (/s-?75|s75|dvina|volkhov/i.test(role)) return 'sam_s75';
        if (/zsu|shilka/i.test(role)) return 'aaa_zsu';
        if (/23\s*mm|gun.*aaa|aaa.*gun/i.test(role)) return 'aaa_23mm';
        if (/p-?37|flatface|barlock/i.test(role)) return 'radar_p37';
        // Fallback to generic air-defense for unknown AD systems
        if (/air.?def|sam|\bad\b|s-?\d{3}|missile.?def/.test(role)) return 'air_defense';
        // strategic / fixed installations first, so "naval_base" isn't caught by the naval keyword.
        if (dom === 'strategic' || /base|airfield|depot|\bhq\b|command|radar|ewr|sigint/.test(role)) return 'ew_site';
        if (dom === 'air' || /fighter|bomber|aircraft|squadron|air_/.test(role)) return 'air_unit';
        if (dom === 'sea' || /naval|ship|frigate|destroyer|corvette|cruiser|patrol_boat/.test(role)) return 'naval_combatant';
        if (dom === 'ground' || /inf|armor|mech|brigade|division|regiment|battalion|arty|artillery|tank/.test(role)) return 'ground_maneuver';
        return 'generic';
    }

    function clone(o) { try { return JSON.parse(JSON.stringify(o)); } catch (_) { return o; } }
    function capabilityFor(unit) { return CAPABILITY_CATALOG[classifyKind(unit)] || CAPABILITY_CATALOG.generic; }

    /* ---- enrich: fill components from the catalog (never overwrite authored) */
    function enrichUnit(unit, opts) {
        opts = opts || {};
        var u = clone(unit || {});
        var cap = clone(capabilityFor(u));
        u.kind = u.kind || classifyKind(u);
        if (u.rcs_class == null) u.rcs_class = cap.rcs_class;
        if (u.readiness == null) u.readiness = cap.readiness;
        if (u.supply == null) u.supply = cap.supply;
        if (u.doctrine_tags == null) u.doctrine_tags = cap.doctrine_tags;
        if (!Array.isArray(u.sensors) || !u.sensors.length) u.sensors = cap.sensors;
        if (!Array.isArray(u.weapons) || !u.weapons.length) u.weapons = cap.weapons;
        if (!Array.isArray(u.magazines) || !u.magazines.length) u.magazines = cap.magazines;
        return u;
    }

    function enrichWorldState(ws, opts) {
        var out = clone(ws || {});
        out.units = (out.units || []).map(function (u) { return enrichUnit(u, opts); });
        out.db_enriched = true;
        return out;
    }

    var api = {
        DB_VERSION: DB_VERSION,
        CAPABILITY_CATALOG: CAPABILITY_CATALOG,
        classifyKind: classifyKind,
        capabilityFor: capabilityFor,
        enrichUnit: enrichUnit,
        enrichWorldState: enrichWorldState
    };
    root.AppWorldStateDB = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
