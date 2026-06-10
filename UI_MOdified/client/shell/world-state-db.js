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
 *
 * D5 (2026-06-09): 18 Middle East platform entries folded from the parallel
 * middle-east-platform-loader.js + platforms.json into this file. Those files
 * are now deleted — DB1 is the single source of truth for all capability data.
 * Source on all D5 entries: SIPRI / Jane's public summaries / open-source specs.
 * Note: s300-sam is already represented by sam_s300 (Phase 5D-1); not duplicated.
 * Units may set platform_id/platform to get the named profile; role-keyword
 * shortcuts cover common scenario role strings without requiring platform_id.
 * ========================================================================== */
(function (root) {
    'use strict';

    var DB_VERSION = '1.2.0-img';  // D5 + Real-Unit-Images-1 (2026-06-10)
    // image_asset  — local path served by the verify/web server; offline-safe
    // image_credit — attribution string shown in panel hero overlay
    // image_source — canonical public-domain URL for provenance
    // These fields are optional; absent = SVG silhouette fallback in panel

    /* ---- the catalog (DATA — extend by adding/editing rows) --------------- */
    // mount ids + class names align with detection.js / engagement.js DB-Lite.
    var CAPABILITY_CATALOG = {
        // ── Generic role classes (fallback when no named platform matched) ──
        air_defense: {
            // Real-Unit-Images SAM: Patriot battery Poland 2010 · U.S. Army · Public Domain
            image_asset:  '/client/assets/units/patriot-sam-battery.jpg',
            image_credit: 'U.S. Army Patriot SAM · Public Domain',
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

        // ── Phase 5D-1: Soviet air-defense platform variants ─────────────────
        sam_s300: {
            image_asset:  '/client/assets/units/patriot-sam-battery.jpg',
            image_credit: 'U.S. Army Patriot SAM · Public Domain',
            rcs_class: 'large', readiness: 'ready', supply: 0.9, doctrine_tags: ['IADS', 'SAM', 'strategic', 'standoff'],
            sensors: [{ id: 'sr', type: 'radar', class: 'S300_SEARCH_RADAR', emcon: 'active' },
                      { id: 'fc', type: 'radar', subtype: 'fire_control', class: 'fire_control', emcon: 'active', channels: 2 }],
            weapons: [{ id: 'sam', class: 'S300_MISSILE', mount: 'm1', wra: { mode: 'max', salvo: 2 } }],
            magazines: [{ mount: 'm1', stock: { S300_MISSILE: 48 } }]
        },
        sam_s75: {
            image_asset:  '/client/assets/units/patriot-sam-battery.jpg',
            image_credit: 'U.S. Army Patriot SAM · Public Domain',
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
        },

        // ── D5: Air platforms (folded from ME catalog 2026-06-09) ────────────
        // source: SIPRI + Jane's Fighting Aircraft public summaries
        f16c: {
            label: 'F-16C Fighting Falcon', source: "SIPRI; Jane's Fighting Aircraft",
            rcs_class: 'medium', readiness: 'ready', supply: 0.8,
            doctrine_tags: ['air_superiority', 'cas', 'strike', 'interdict'],
            sensors: [
                { id: 'apg68', label: 'AN/APG-68 multifunction radar', type: 'radar', class: 'multifunction', emcon: 'active' },
                { id: 'irst',  label: 'IRST',                          type: 'ir',    class: 'passive_tracking', emcon: 'active' }
            ],
            weapons: [
                { id: 'aim120', label: 'AIM-120C AMRAAM',  class: 'medium_aa_missile', mount: 'm1', wra: { mode: 'max', salvo: 2 } },
                { id: 'aim9',   label: 'AIM-9 Sidewinder', class: 'short_aa_missile',  mount: 'm2' },
                { id: 'agm65',  label: 'AGM-65 Maverick',  class: 'ag_missile',         mount: 'm3' }
            ],
            magazines: [
                { mount: 'm1', stock: { medium_aa_missile: 6 } },
                { mount: 'm2', stock: { short_aa_missile: 2 } },
                { mount: 'm3', stock: { ag_missile: 2 } }
            ]
        },
        mig29: {
            label: 'MiG-29', source: "SIPRI; Jane's Fighting Aircraft",
            rcs_class: 'small', readiness: 'ready', supply: 0.75,
            doctrine_tags: ['air_superiority', 'fighter_sweep', 'cas', 'air_defense'],
            sensors: [
                { id: 'slot_back', label: 'Slot-back radar', type: 'radar', class: 'fire_control',  emcon: 'active' },
                { id: 'irst_mig',  label: 'IRST (MiG-29)',   type: 'ir',    class: 'passive_tracking', emcon: 'active' }
            ],
            weapons: [
                { id: 'r27',     label: 'R-27 AAM',       class: 'medium_aa_missile', mount: 'm1', wra: { mode: 'max', salvo: 2 } },
                { id: 'r73',     label: 'R-73 AAM',       class: 'short_aa_missile',  mount: 'm2' },
                { id: 'kh29',    label: 'Kh-29 AGM',      class: 'ag_missile',         mount: 'm3' },
                { id: 'gun_30',  label: '30mm GSh-301',   class: 'gun',                mount: 'm4' }
            ],
            magazines: [
                { mount: 'm1', stock: { medium_aa_missile: 4 } },
                { mount: 'm2', stock: { short_aa_missile: 2 } },
                { mount: 'm3', stock: { ag_missile: 2 } },
                { mount: 'm4', stock: { gun: 150 } }
            ]
        },
        f15e: {
            label: 'F-15E Strike Eagle', source: "Jane's Fighting Aircraft; public specifications",
            rcs_class: 'medium', readiness: 'ready', supply: 0.8,
            doctrine_tags: ['strike', 'interdict', 'cas', 'escort'],
            sensors: [
                { id: 'apg70',   label: 'AN/APG-70 radar',      type: 'radar', class: 'multifunction', emcon: 'active' },
                { id: 'lantirn', label: 'LANTIRN targeting pod', type: 'ir',    class: 'fire_control',  emcon: 'always' }
            ],
            weapons: [
                { id: 'aim120', label: 'AIM-120 AMRAAM',  class: 'medium_aa_missile', mount: 'm1', wra: { mode: 'max', salvo: 2 } },
                { id: 'aim9',   label: 'AIM-9 Sidewinder', class: 'short_aa_missile', mount: 'm2' },
                { id: 'jdam',   label: 'JDAM / HARM',      class: 'ag_missile',        mount: 'm3' },
                { id: 'mav',    label: 'AGM-65 Maverick',  class: 'ag_missile',        mount: 'm4' },
                { id: 'gun',    label: 'M61A1 20mm Vulcan', class: 'gun',              mount: 'm5' }
            ],
            magazines: [
                { mount: 'm1', stock: { medium_aa_missile: 4 } },
                { mount: 'm2', stock: { short_aa_missile: 2 } },
                { mount: 'm3', stock: { ag_missile: 4 } },
                { mount: 'm4', stock: { ag_missile: 2 } },
                { mount: 'm5', stock: { gun: 511 } }
            ]
        },
        mirage2000: {
            label: 'Mirage 2000', source: "Jane's Fighting Aircraft; SIPRI",
            rcs_class: 'small', readiness: 'ready', supply: 0.8,
            doctrine_tags: ['air_superiority', 'strike', 'interdict', 'regional_standard'],
            sensors: [
                { id: 'rbe2', label: 'RBE2 AESA radar',    type: 'radar', class: 'multifunction',  emcon: 'active' },
                { id: 'irst', label: 'IRST (Mirage 2000)', type: 'ir',    class: 'passive_tracking', emcon: 'active' }
            ],
            weapons: [
                { id: 'mica',  label: 'MICA AAM',           class: 'medium_aa_missile', mount: 'm1', wra: { mode: 'max', salvo: 2 } },
                { id: 'scalp', label: 'SCALP / Storm Shadow', class: 'cruise_missile',  mount: 'm2' },
                { id: 'gun',   label: '30mm DEFA gun',       class: 'gun',              mount: 'm3' }
            ],
            magazines: [
                { mount: 'm1', stock: { medium_aa_missile: 4 } },
                { mount: 'm2', stock: { cruise_missile: 1 } },
                { mount: 'm3', stock: { gun: 250 } }
            ]
        },
        gripen: {
            label: 'JF-17 / Gripen', source: "Jane's Fighting Aircraft; open-source specifications",
            rcs_class: 'small', readiness: 'ready', supply: 0.8,
            doctrine_tags: ['air_superiority', 'cas', 'light_fighter', 'cost_effective'],
            sensors: [
                { id: 'aesa', label: 'AESA radar',  type: 'radar', class: 'multifunction',  emcon: 'active' },
                { id: 'irst', label: 'IRST system', type: 'ir',    class: 'passive_tracking', emcon: 'active' }
            ],
            weapons: [
                { id: 'meteor', label: 'Meteor / medium AAM', class: 'medium_aa_missile', mount: 'm1', wra: { mode: 'max', salvo: 1 } },
                { id: 'agm',    label: 'Air-to-ground missile', class: 'ag_missile',       mount: 'm2' },
                { id: 'gun',    label: '27mm internal gun',     class: 'gun',               mount: 'm3' }
            ],
            magazines: [
                { mount: 'm1', stock: { medium_aa_missile: 4 } },
                { mount: 'm2', stock: { ag_missile: 2 } },
                { mount: 'm3', stock: { gun: 150 } }
            ]
        },
        tornado: {
            label: 'Panavia Tornado', source: "Jane's Fighting Aircraft; SIPRI",
            rcs_class: 'medium', readiness: 'ready', supply: 0.8,
            doctrine_tags: ['strike', 'interdict', 'anti_ship', 'reconnaissance'],
            sensors: [
                { id: 'tfr', label: 'Terrain-following radar', type: 'radar', class: 'fire_control',  emcon: 'active' },
                { id: 'ews', label: 'EW suite',                type: 'esm',   class: 'esm_intercept', emcon: 'active' }
            ],
            weapons: [
                { id: 'storm_shadow', label: 'Storm Shadow cruise missile', class: 'cruise_missile', mount: 'm1' },
                { id: 'lgb',          label: 'Paveway LGB',                 class: 'ag_missile',     mount: 'm2' },
                { id: 'gun',          label: '27mm Mauser cannon',          class: 'gun',             mount: 'm3' }
            ],
            magazines: [
                { mount: 'm1', stock: { cruise_missile: 2 } },
                { mount: 'm2', stock: { ag_missile: 4 } },
                { mount: 'm3', stock: { gun: 180 } }
            ]
        },
        awacs: {
            label: 'E-3 Sentry AWACS / AEW&C', source: "Jane's All the World's Aircraft; published specifications",
            rcs_class: 'very_large', readiness: 'ready', supply: 0.85,
            doctrine_tags: ['c2', 'air_battle_management', 'surveillance', 'strategic'],
            sensors: [
                { id: 'ppa', label: 'Rotating phased-array radar', type: 'radar', class: 'long_range_3d',  emcon: 'active', channels: 8 },
                { id: 'gsr', label: 'Ground search mode',          type: 'radar', class: 'surface_search', emcon: 'active' },
                { id: 'iff', label: 'IFF / identification system', type: 'iff',   class: 'identification',  emcon: 'always' }
            ],
            weapons: [], magazines: []
        },

        // ── D5: Air-defense — Western / SHORAD / MANPADS ─────────────────────
        // (Soviet S-300 covered by sam_s300 above; not duplicated)
        patriot: {
            label: 'Patriot SAM System (MIM-104)', source: "SIPRI; Jane's Weapons Systems",
            image_asset:  '/client/assets/units/patriot-sam-battery.jpg',
            image_credit: 'U.S. Army Patriot SAM (Poland 2010) · Public Domain',
            rcs_class: 'medium', readiness: 'ready', supply: 0.8,
            doctrine_tags: ['air_defense', 'medium_range', 'layered_defense'],
            sensors: [
                { id: 'search', label: 'AN/MPQ-53 phased-array search', type: 'radar', class: 'long_range_3d', emcon: 'active' },
                { id: 'fc',     label: 'Engagement radar',               type: 'radar', subtype: 'fire_control', class: 'fire_control', emcon: 'active', channels: 6 }
            ],
            weapons: [{ id: 'mim104', label: 'MIM-104 Patriot SAM', class: 'long_range_sam', mount: 'm1', wra: { mode: '75pct', salvo: 2 } }],
            magazines: [{ mount: 'm1', stock: { long_range_sam: 16 } }]
        },
        tor_aads: {
            label: 'TOR M1 (SHORAD SAM + AAA)', source: "SIPRI; open-source military publications",
            rcs_class: 'small', readiness: 'ready', supply: 0.75,
            doctrine_tags: ['air_defense', 'short_range', 'shorad', 'mobile'],
            sensors: [
                { id: 'search', label: 'TOR search radar',    type: 'radar', class: 'surface_search', emcon: 'active' },
                { id: 'fc',     label: 'Fire-control radar',  type: 'radar', subtype: 'fire_control', class: 'fire_control', emcon: 'active', channels: 2 }
            ],
            weapons: [
                { id: 'tor_m', label: 'TOR SAM',        class: 'medium_sam',   mount: 'm1', wra: { mode: 'max', salvo: 2 } },
                { id: 'aaa',   label: '30mm autocannon', class: 'point_defense', mount: 'm2' }
            ],
            magazines: [
                { mount: 'm1', stock: { medium_sam: 8 } },
                { mount: 'm2', stock: { point_defense: 400 } }
            ]
        },
        mistral: {
            label: 'Mistral MANPADS', source: "Jane's Weapons Systems; open-source specifications",
            rcs_class: 'very_small', readiness: 'ready', supply: 0.8,
            doctrine_tags: ['air_defense', 'short_range', 'portable', 'shorad'],
            sensors: [{ id: 'ir_seeker', label: 'IR CCD seeker', type: 'ir', class: 'passive_tracking', emcon: 'active' }],
            weapons: [{ id: 'mistral_m', label: 'Mistral IR missile', class: 'short_range_sam', mount: 'm1', wra: { mode: 'max', salvo: 1 } }],
            magazines: [{ mount: 'm1', stock: { short_range_sam: 4 } }]
        },
        s1_aaa: {
            label: 'Skyshield 35mm AAA (S-1)', source: "Open-source military specifications; SIPRI",
            rcs_class: 'small', readiness: 'ready', supply: 0.75,
            doctrine_tags: ['air_defense', 'short_range', 'rapid_fire', 'point_defense'],
            sensors: [{ id: 'fc_radar', label: 'Fire-control radar', type: 'radar', class: 'fire_control', emcon: 'active', channels: 1 }],
            weapons: [{ id: 'twin_35', label: 'Twin 35mm Oerlikon autocannon', class: 'point_defense', mount: 'm1', wra: { mode: 'max', salvo: 1 } }],
            magazines: [{ mount: 'm1', stock: { point_defense: 600 } }]
        },

        // ── D5: Naval platforms ───────────────────────────────────────────────
        meko: {
            label: 'MEKO Frigate', source: "Jane's Fighting Ships; SIPRI Naval Database",
            // Real-Unit-Images-1: USS Lake Champlain CVS-39 used as representative
            // Essex-class/ASW carrier photo (closest available cached asset).
            // image_asset is a locally cached path — works offline.
            image_asset:  '/client/assets/units/uss-lake-champlain-cvs39.jpg',
            image_credit: 'USS Lake Champlain CVS-39 · U.S. Navy / NHHC · Public Domain',
            image_source: 'https://commons.wikimedia.org/wiki/File:USS_Lake_Champlain_(CVS-39)_underway_in_February_1965_(USN_1114106).jpg',
            rcs_class: 'medium', readiness: 'ready', supply: 0.8,
            doctrine_tags: ['sea_control', 'anti_air', 'anti_ship', 'helicopter_ops'],
            sensors: [
                { id: 'air_s',  label: 'Air search radar',    type: 'radar', class: 'air_search',     emcon: 'active' },
                { id: 'surf_s', label: 'Surface search radar', type: 'radar', class: 'surface_search', emcon: 'active' },
                { id: 'sonar_a', label: 'Active sonar',        type: 'sonar', class: 'sonar_active',   emcon: 'always' },
                { id: 'sonar_p', label: 'Passive sonar',       type: 'sonar', class: 'sonar_passive',  emcon: 'active' },
                { id: 'fc',     label: 'Fire-control radar',   type: 'radar', subtype: 'fire_control', class: 'fire_control', emcon: 'active', channels: 4 }
            ],
            weapons: [
                { id: 'sam',     label: 'Medium SAM',         class: 'medium_sam',   mount: 'm1', wra: { mode: 'max', salvo: 2 } },
                { id: 'asuw',    label: 'Anti-ship missile',  class: 'asuw_missile', mount: 'm2' },
                { id: 'gun_76',  label: '76mm main gun',      class: 'gun',          mount: 'm3' },
                { id: 'torpedo', label: 'Torpedo tubes',      class: 'torpedo',      mount: 'm4' },
                { id: 'ciws',    label: 'CIWS',               class: 'point_defense', mount: 'm5' }
            ],
            magazines: [
                { mount: 'm1', stock: { medium_sam: 8 } },
                { mount: 'm2', stock: { asuw_missile: 4 } },
                { mount: 'm3', stock: { gun: 800 } },
                { mount: 'm4', stock: { torpedo: 6 } },
                { mount: 'm5', stock: { point_defense: 1500 } }
            ]
        },
        corvette: {
            label: 'Type F2000S Corvette', source: "Jane's Fighting Ships; open-source specifications",
            rcs_class: 'small', readiness: 'ready', supply: 0.8,
            doctrine_tags: ['coastal_defense', 'sea_control', 'anti_air', 'anti_ship'],
            sensors: [
                { id: 'phased', label: 'Phased-array radar', type: 'radar', class: 'long_range_3d',  emcon: 'active' },
                { id: 'sonar',  label: 'Sonar suite',        type: 'sonar', class: 'sonar_passive',  emcon: 'active' },
                { id: 'fc',     label: 'Fire-control radar', type: 'radar', subtype: 'fire_control', class: 'fire_control', emcon: 'active', channels: 2 }
            ],
            weapons: [
                { id: 'sam',     label: 'Medium SAM',        class: 'medium_sam',   mount: 'm1', wra: { mode: 'max', salvo: 2 } },
                { id: 'asuw',    label: 'Anti-ship missile', class: 'asuw_missile', mount: 'm2' },
                { id: 'gun',     label: 'Main gun',          class: 'gun',          mount: 'm3' },
                { id: 'torpedo', label: 'Torpedo tubes',     class: 'torpedo',      mount: 'm4' }
            ],
            magazines: [
                { mount: 'm1', stock: { medium_sam: 8 } },
                { mount: 'm2', stock: { asuw_missile: 2 } },
                { mount: 'm3', stock: { gun: 400 } },
                { mount: 'm4', stock: { torpedo: 4 } }
            ]
        },
        patrol_boat: {
            label: 'Damen Stan Patrol Boat', source: "Open-source marine specifications; Jane's Fighting Ships",
            rcs_class: 'very_small', readiness: 'ready', supply: 0.8,
            doctrine_tags: ['coastal_patrol', 'harbor_defense', 'interdiction'],
            sensors: [
                { id: 'nav', label: 'Navigation radar', type: 'radar', class: 'surface_search', emcon: 'active' }
            ],
            weapons: [
                { id: 'mg', label: 'Machine gun mounts', class: 'gun', mount: 'm1' }
            ],
            magazines: [{ mount: 'm1', stock: { gun: 200 } }]
        },

        // ── D5: Ground platforms — named types ───────────────────────────────
        infantry_bn: {
            label: 'Infantry Battalion', source: "Military organizational standards; SIPRI",
            rcs_class: 'small', readiness: 'ready', supply: 0.7,
            doctrine_tags: ['maneuver', 'infantry', 'primary_assault'],
            sensors: [{ id: 'obs', label: 'Forward observer optics', type: 'optical', class: 'visual', emcon: 'always' }],
            weapons: [
                { id: 'rifle',  label: 'Assault rifles',  class: 'gun', mount: 'm1' },
                { id: 'mg',     label: 'Machine guns',    class: 'gun', mount: 'm2' },
                { id: 'mortar', label: '60mm mortars',    class: 'gun', mount: 'm3' }
            ],
            magazines: [
                { mount: 'm1', stock: { gun: 5000 } },
                { mount: 'm2', stock: { gun: 500 } },
                { mount: 'm3', stock: { gun: 60 } }
            ]
        },
        armor_company: {
            label: 'Main Battle Tank Company', source: "Military organizational standards; published tank specifications",
            rcs_class: 'medium', readiness: 'ready', supply: 0.75,
            doctrine_tags: ['maneuver', 'armor', 'counter_armor', 'breakthrough'],
            sensors: [
                { id: 'thermal', label: "Gunner's thermal sight", type: 'ir',    class: 'fire_control', emcon: 'always' },
                { id: 'laser',   label: 'Laser rangefinder',      type: 'laser', class: 'fire_control', emcon: 'active' }
            ],
            weapons: [
                { id: 'main_gun', label: '125mm smoothbore gun',      class: 'gun',       mount: 'm1' },
                { id: 'atgm',     label: 'Anti-tank guided missile',   class: 'ag_missile', mount: 'm2', wra: { mode: 'max', salvo: 1 } }
            ],
            magazines: [
                { mount: 'm1', stock: { gun: 40 } },
                { mount: 'm2', stock: { ag_missile: 4 } }
            ]
        },
        mlrs: {
            label: 'MLRS Battery', source: "SIPRI; published system specifications",
            rcs_class: 'medium', readiness: 'ready', supply: 0.75,
            doctrine_tags: ['fire_support', 'rocket_artillery', 'deep_strike'],
            sensors: [
                { id: 'fc_comp', label: 'Fire-control computer + GPS/INS', type: 'radar', class: 'surface_search', emcon: 'active' }
            ],
            weapons: [
                { id: 'rocket', label: 'MLRS unguided rocket', class: 'gun',        mount: 'm1' },
                { id: 'gmlrs',  label: 'GMLRS guided missile', class: 'ag_missile', mount: 'm2', wra: { mode: 'max', salvo: 1 } }
            ],
            magazines: [
                { mount: 'm1', stock: { gun: 36 } },
                { mount: 'm2', stock: { ag_missile: 12 } }
            ]
        },
        logistics: {
            label: 'Logistics Support Element', source: "Military organizational standards",
            rcs_class: 'medium', readiness: 'ready', supply: 0.8,
            doctrine_tags: ['support', 'logistics', 'supply'],
            sensors: [],
            weapons: [{ id: 'def_mg', label: 'Defensive MG', class: 'gun', mount: 'm1' }],
            magazines: [{ mount: 'm1', stock: { gun: 200 } }]
        }
    };

    /* ---- generic classification (role keywords + domain; NOT scenario-specific) */
    function classifyKind(u) {
        // D5: named platform lookup — unit may set platform_id or platform field
        var pid = u && (u.platform_id || u.platform || '');
        if (pid) {
            var normPid = String(pid).toLowerCase().replace(/-/g, '_');
            if (CAPABILITY_CATALOG[normPid]) return normPid;
            if (CAPABILITY_CATALOG[pid]) return pid;
        }

        var role = (u && u.role || '').toLowerCase();
        var dom = (u && u.domain) || '';

        // Phase 5D-1: Soviet SAM/AAA variants (more specific than generic air_defense)
        if (/s-?300|s300|s-300/i.test(role)) return 'sam_s300';
        if (/s-?75|s75|dvina|volkhov/i.test(role)) return 'sam_s75';
        if (/zsu|shilka/i.test(role)) return 'aaa_zsu';
        if (/23\s*mm|gun.*aaa|aaa.*gun/i.test(role)) return 'aaa_23mm';
        if (/p-?37|flatface|barlock/i.test(role)) return 'radar_p37';

        // D5: named platform keyword shortcuts (unambiguous platform names only)
        if (/\bf-?16\b/i.test(role)) return 'f16c';
        if (/\bf-?15e\b|strike.eagle/i.test(role)) return 'f15e';
        if (/mirage.?2000/i.test(role)) return 'mirage2000';
        if (/\bmig.?29\b/i.test(role)) return 'mig29';
        if (/panavia.*tornado|tornado.*strike/i.test(role)) return 'tornado';
        if (/gripen|jf.?17/i.test(role)) return 'gripen';
        if (/\bawacs\b|\be-?3\b.*sentry|aew.?c/i.test(role)) return 'awacs';
        if (/\bpatriot\b|mim.?104/i.test(role)) return 'patriot';
        if (/\btor.?m\d\b|tor.?aads/i.test(role)) return 'tor_aads';
        if (/\bmistral\b|manpads/i.test(role)) return 'mistral';
        if (/skyshield/i.test(role)) return 's1_aaa';
        if (/\bmlrs\b|multiple.launch.rocket/i.test(role)) return 'mlrs';
        if (/\bmeko\b|type.f2000|f2000s/i.test(role)) return 'meko';

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
        // Real-Unit-Images-1: propagate image metadata from catalog to enriched unit
        // (unit-level image_url / image_credit always wins — only fill if absent)
        if (u.image_asset == null && cap.image_asset) u.image_asset = cap.image_asset;
        if (u.image_credit == null && cap.image_credit) u.image_credit = cap.image_credit;
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
