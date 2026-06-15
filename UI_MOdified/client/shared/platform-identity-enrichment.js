/**
 * platform-identity-enrichment.js — RMOOZ-PLATFORM-IDENTITY-ENRICHMENT-A
 *
 * Turn a thin unit (only role/type like "fires", "fighter", "sam") into the best AVAILABLE
 * platform display label, with honest provenance. Precedence:
 *   1. explicit scenario platform/name fields   → provenance "authored"
 *   2. DB-Lite exact platform match             → provenance "db_lite_exact"
 *   3. imported document equipment names        → provenance "document_extracted"
 *   4. unit catalog mapping (caller-supplied)   → provenance "catalog"
 *   5. capability fallback (generic, REVIEW)    → provenance "generic_fallback"
 *
 * A free-text mention like "F-16", "Tomcat/F-14", or "S-300" is normalized to its public
 * display name ("F-16 Fighting Falcon", "F-14 Tomcat", "S-300 SAM Battery"). We NEVER invent
 * an exact platform when the data does not contain one — a bare role ("fires"/"fighter")
 * resolves to the generic capability label flagged for review.
 *
 * Pure + dual-mode (CommonJS require + window.RmoozPlatformIdentity). No DOM/network/mutation.
 * Public/general designations only — no exact or classified specifications.
 */
(function (root) {
    'use strict';

    // Human capability labels by role — the generic fallback (also used for typeLabel).
    var CAPABILITY_LABELS = {
        fires: 'Rocket Artillery Battery', artillery: 'Artillery Battery', mortar: 'Mortar Unit',
        rocket: 'Rocket Artillery', mlrs: 'Multiple Rocket Launcher',
        armor: 'Armored / Tank Unit', armour: 'Armored / Tank Unit', tank: 'Tank Unit',
        mechanized: 'Mechanized Infantry', mechanised: 'Mechanized Infantry', mech_infantry: 'Mechanized Infantry',
        infantry: 'Infantry Unit', marine: 'Marine Infantry',
        recon: 'Reconnaissance Element', reconnaissance: 'Reconnaissance Element', scout: 'Reconnaissance Element',
        aircraft: 'Combat Aircraft', fighter: 'Fighter Aircraft', bomber: 'Bomber Aircraft',
        uav: 'Unmanned Aerial Vehicle', drone: 'Unmanned Aerial Vehicle',
        cruise_missile: 'Cruise Missile', missile: 'Missile Unit',
        sam: 'Surface-to-Air Missile Battery', air_defense: 'Air-Defense Battery', air_defence: 'Air-Defense Battery',
        radar: 'Radar Site', sensor: 'Sensor Element', ew: 'Electronic-Warfare Unit',
        naval: 'Naval Combatant', frigate: 'Frigate', destroyer: 'Destroyer', corvette: 'Corvette',
        submarine: 'Submarine', patrol: 'Patrol Craft', transport: 'Transport Unit',
        tanker: 'Tanker', helicopter: 'Helicopter', helo: 'Helicopter', aviation: 'Aviation Unit',
        logistics: 'Logistics Unit', engineer: 'Engineer Unit', command: 'Command Element',
        c2: 'Command & Control', hq: 'Headquarters Element',
    };

    // Public platform catalog — display name + class/domain + recognition aliases. Aliases are
    // SPECIFIC designations (never bare role words), so "fighter"/"sam"/"fires" never match.
    var PLATFORM_CATALOG = [
        // ── Air: fighters / strike / multirole ──
        { display: 'F-16 Fighting Falcon', class: 'fighter', domain: 'air', aliases: ['f-16', 'f16', 'f-16c', 'f16c', 'fighting falcon', 'viper'] },
        { display: 'F-15 Eagle',           class: 'fighter', domain: 'air', aliases: ['f-15', 'f15', 'f-15e', 'f15e', 'strike eagle', 'eagle'] },
        { display: 'F-14 Tomcat',          class: 'fighter', domain: 'air', aliases: ['f-14', 'f14', 'tomcat'] },
        { display: 'F/A-18 Hornet',        class: 'fighter', domain: 'air', aliases: ['f-18', 'f18', 'fa-18', 'f/a-18', 'hornet', 'super hornet'] },
        { display: 'F-35 Lightning II',    class: 'fighter', domain: 'air', aliases: ['f-35', 'f35', 'lightning ii'] },
        { display: 'MiG-29 Fulcrum',       class: 'fighter', domain: 'air', aliases: ['mig-29', 'mig29', 'fulcrum'] },
        { display: 'Su-30 Flanker',        class: 'fighter', domain: 'air', aliases: ['su-27', 'su27', 'su-30', 'su30', 'su-35', 'flanker'] },
        { display: 'Mirage 2000',          class: 'fighter', domain: 'air', aliases: ['mirage 2000', 'mirage-2000', 'mirage2000', 'mirage'] },
        { display: 'Rafale',               class: 'fighter', domain: 'air', aliases: ['rafale'] },
        { display: 'Eurofighter Typhoon',  class: 'fighter', domain: 'air', aliases: ['typhoon', 'eurofighter'] },
        { display: 'E-3 Sentry AWACS',     class: 'aew',     domain: 'air', aliases: ['awacs', 'e-3', 'e3 sentry', 'sentry aew'] },
        // ── UAV ──
        { display: 'MQ-9 Reaper',          class: 'uav',     domain: 'air', aliases: ['mq-9', 'mq9', 'reaper', 'mq-1', 'predator'] },
        { display: 'Bayraktar TB2',        class: 'uav',     domain: 'air', aliases: ['tb2', 'bayraktar'] },
        // ── Air defense / SAM ──
        { display: 'S-300 SAM Battery',    class: 'sam', domain: 'air_defense', aliases: ['s-300', 's300', 'sa-10', 'sa-20'] },
        { display: 'S-400 SAM Battery',    class: 'sam', domain: 'air_defense', aliases: ['s-400', 's400', 'triumf', 'sa-21'] },
        { display: 'Patriot SAM Battery',  class: 'sam', domain: 'air_defense', aliases: ['patriot', 'pac-3', 'pac3', 'mim-104'] },
        { display: 'Buk SAM Battery',      class: 'sam', domain: 'air_defense', aliases: ['buk', 'sa-11', 'sa-17'] },
        { display: 'Pantsir Air-Defense System', class: 'sam', domain: 'air_defense', aliases: ['pantsir', 'sa-22'] },
        { display: 'THAAD Battery',        class: 'sam', domain: 'air_defense', aliases: ['thaad'] },
        // ── Rocket artillery / artillery (fires) ──
        { display: 'BM-21 Grad Rocket Artillery', class: 'rocket_artillery', domain: 'ground', aliases: ['bm-21', 'bm21', 'grad'] },
        { display: 'M142 HIMARS',          class: 'rocket_artillery', domain: 'ground', aliases: ['himars', 'm142'] },
        { display: 'M270 MLRS',            class: 'rocket_artillery', domain: 'ground', aliases: ['m270', 'mlrs'] },
        { display: 'M109 Paladin',         class: 'artillery', domain: 'ground', aliases: ['m109', 'paladin'] },
        { display: '2S19 Msta',            class: 'artillery', domain: 'ground', aliases: ['2s19', 'msta'] },
        // ── Armor / IFV ──
        { display: 'T-72 Main Battle Tank', class: 'armor', domain: 'ground', aliases: ['t-72', 't72'] },
        { display: 'T-90 Main Battle Tank', class: 'armor', domain: 'ground', aliases: ['t-90', 't90'] },
        { display: 'M1 Abrams',            class: 'armor', domain: 'ground', aliases: ['m1 abrams', 'abrams', 'm1a1', 'm1a2'] },
        { display: 'Leopard 2',            class: 'armor', domain: 'ground', aliases: ['leopard 2', 'leopard-2', 'leopard'] },
        { display: 'BMP IFV',              class: 'ifv', domain: 'ground', aliases: ['bmp', 'bmp-2', 'bmp-3'] },
        { display: 'M2 Bradley',           class: 'ifv', domain: 'ground', aliases: ['bradley', 'm2 bradley'] },
        // ── Naval ──
        { display: 'Arleigh Burke Destroyer', class: 'destroyer', domain: 'naval', aliases: ['arleigh burke', 'ddg-51', 'aegis destroyer'] },
        { display: 'Oliver Hazard Perry Frigate', class: 'frigate', domain: 'naval', aliases: ['oliver hazard perry', 'ffg-7'] },
    ];

    function norm(s) { return String(s == null ? '' : s).trim().toLowerCase(); }
    function isBlank(s) { return s == null || String(s).trim() === ''; }
    function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

    // Build a bounded, separator-tolerant regex for an alias.
    function aliasRegex(alias) {
        var pat = esc(alias).replace(/[-\s/]+/g, '[-\\s/]?');
        return new RegExp('(?:^|[^a-z0-9])' + pat + '(?:[^a-z0-9]|$)', 'i');
    }
    // Pre-compile.
    PLATFORM_CATALOG.forEach(function (e) {
        e._res = e.aliases.map(function (a) { return { len: a.replace(/[^a-z0-9]/gi, '').length, re: aliasRegex(a), alias: a }; });
    });

    /**
     * matchPlatformMention(text) → { display, class, domain, alias } | null.
     * Scans the catalog; returns the entry whose longest alias matches the text. Bare role
     * words never match (they are not aliases).
     */
    function matchPlatformMention(text) {
        if (isBlank(text)) return null;
        var t = ' ' + String(text).toLowerCase() + ' ';
        var best = null, bestLen = 0;
        for (var i = 0; i < PLATFORM_CATALOG.length; i++) {
            var e = PLATFORM_CATALOG[i];
            for (var j = 0; j < e._res.length; j++) {
                var r = e._res[j];
                if (r.len > bestLen && r.re.test(t)) { best = e; bestLen = r.len; }
            }
        }
        return best ? { display: best.display, class: best.class, domain: best.domain } : null;
    }

    // A value that could be a custom (authored) platform NAME: present and not a bare role.
    function isRealPlatformText(s) {
        if (isBlank(s)) return false;
        var n = norm(s);
        if (CAPABILITY_LABELS[n]) return false;          // it's a role word
        if (/^[a-z_]+$/.test(n) && n.length <= 12 && CAPABILITY_LABELS[n.replace(/_/g, '')]) return false;
        return true;
    }

    /**
     * enrichPlatform(unit, opts) → the best platform label + provenance.
     *   opts: { dbLitePlatform, documentEquipment, catalogPlatform, role }
     * Returns { label, provenance, confidence, generic, review, matched_class, capability_label }.
     * provenance ∈ authored | db_lite_exact | document_extracted | catalog | generic_fallback | none
     */
    function enrichPlatform(unit, opts) {
        unit = (unit && typeof unit === 'object') ? unit : {};
        opts = opts || {};
        var role = norm(opts.role != null ? opts.role : (unit.role || unit.type));
        var capability = CAPABILITY_LABELS[role] || null;

        function done(label, provenance, confidence, extra) {
            return Object.assign({
                label: label, provenance: provenance, confidence: confidence,
                generic: false, review: false, matched_class: null, capability_label: capability,
            }, extra || {});
        }

        // 1. Explicit authored platform/name fields.
        var platformFields = [unit.platform_name, unit.platform, unit.platform_type, unit.weapon_system, unit.equipment];
        for (var i = 0; i < platformFields.length; i++) {
            var v = platformFields[i];
            if (isBlank(v)) continue;
            var m = matchPlatformMention(v);
            if (m) return done(m.display, 'authored', 'high', { matched_class: m.class });
            if (isRealPlatformText(v)) return done(String(v), 'authored', 'high');
        }
        // name / name_en may embed a designation (e.g. "F-16 Squadron") — extract only.
        var mName = matchPlatformMention(unit.name_en) || matchPlatformMention(unit.name);
        if (mName) return done(mName.display, 'authored', 'high', { matched_class: mName.class });

        // 2. DB-Lite exact match — already a canonical full display; use it AS-IS (DB-Lite
        // is the authoritative catalog, never overridden by our mention catalog).
        if (!isBlank(opts.dbLitePlatform)) {
            return done(String(opts.dbLitePlatform), 'db_lite_exact', 'high');
        }

        // 3. Imported document equipment names.
        var docEq = !isBlank(opts.documentEquipment) ? opts.documentEquipment
            : (unit.document_equipment || unit.source_equipment || unit.imported_equipment || unit.equipment_name);
        if (!isBlank(docEq)) {
            var mDoc = matchPlatformMention(docEq);
            if (mDoc) return done(mDoc.display, 'document_extracted', 'medium', { matched_class: mDoc.class });
            if (isRealPlatformText(docEq)) return done(String(docEq), 'document_extracted', 'medium');
        }

        // 4. Caller-supplied unit-catalog mapping (a resolved platform, not invented here).
        if (!isBlank(opts.catalogPlatform)) {
            var mCat = matchPlatformMention(opts.catalogPlatform);
            return done(mCat ? mCat.display : String(opts.catalogPlatform), 'catalog', 'medium', { matched_class: mCat && mCat.class });
        }

        // 5. Generic capability fallback — NEVER an invented exact platform; flagged for review.
        if (capability) {
            return done(capability, 'generic_fallback', 'low', { generic: true, review: true });
        }
        return done(null, 'none', 'low', { generic: true });
    }

    var API = {
        PLATFORM_CATALOG: PLATFORM_CATALOG,
        CAPABILITY_LABELS: CAPABILITY_LABELS,
        matchPlatformMention: matchPlatformMention,
        enrichPlatform: enrichPlatform,
        VERSION: 'rmooz-platform-identity/1.0',
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof root !== 'undefined' && root) root.RmoozPlatformIdentity = API;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
