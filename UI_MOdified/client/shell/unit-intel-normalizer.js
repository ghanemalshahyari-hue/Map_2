/* ============================================================================
 * unit-intel-normalizer.js - SYMBOL-UNIT-INTEL-A
 * ----------------------------------------------------------------------------
 * Pure review-only Arabic/English unit text normalizer for Step 1 and Free Fight
 * demo display. It does not create scenario units, assign tasking, approve SIDCs,
 * infer exact positions, or mutate world state.
 *
 *   window.RmoozUnitIntelNormalizer = { normalizeUnitText, normalizeUnit, normalizeUnits }
 *   module.exports = same API for Node tests.
 * ========================================================================== */
(function (root) {
    'use strict';

    var CONF_ALLOWED = { low: true, medium: true, high: true };
    var AR_RE = /[\u0600-\u06FF]/;

    var ECHELONS = [
        { key: 'brigade', ar: /لواء|ألوية|الوية/, en: /\bbrigade\b|\bbde\b/i },
        { key: 'battalion', ar: /كتيبة|كتائب/, en: /\bbattalion\b|\bbn\b/i },
        { key: 'company', ar: /سرية|سرايا/, en: /\bcompany\b|\bco\b/i },
        { key: 'platoon', ar: /فصيل|فصائل/, en: /\bplatoon\b/i },
        { key: 'battery', ar: /بطارية|بطاريات/, en: /\bbattery\b/i },
        { key: 'site', ar: /موقع|نقطة/, en: /\bsite\b|\bnode\b/i },
        { key: 'base', ar: /قاعدة|قواعد/, en: /\bbase\b|\bfacility\b/i },
    ];

    var TYPES = [
        { key: 'mechanized_infantry', family: 'infantry', symbol: 'mechanized_infantry', platform: 'ground_unit',
            ar: /(?:ال)?مشاة\s*(?:ال)?(آلي|الى|آلية|الية|ميكانيكي|ميكانيكية)|ميكانيكي|ميكانيكية/,
            en: /\bmechanized infantry\b|\bmechanised infantry\b|\bmech(?:anized)?\b/i,
            arName: 'مشاة آلي', enName: 'Mechanized Infantry' },
        { key: 'surface_to_air_missile', family: 'air_defense', symbol: 'air_defense', platform: 'air_defense',
            ar: /صواريخ\s*أرض\s*جو|صواريخ\s*ارض\s*جو|سام|دفاع\s*جوي/,
            en: /\bsurface[-\s]?to[-\s]?air\b|\bSAM\b|\bair defen[cs]e\b|\bshorad\b/i,
            arName: 'دفاع جوي', enName: 'Surface-to-Air Missile' },
        { key: 'air_defense', family: 'air_defense', symbol: 'air_defense', platform: 'air_defense',
            ar: /دفاع\s*جوي/, en: /\bair defen[cs]e\b|\banti[-\s]?air\b/i,
            arName: 'دفاع جوي', enName: 'Air Defense' },
        { key: 'tank', family: 'armor', symbol: 'armor', platform: 'ground_unit',
            ar: /دبابات|دبابة/, en: /\btanks?\b/i,
            arName: 'دبابات', enName: 'Tank' },
        { key: 'armor', family: 'armor', symbol: 'armor', platform: 'ground_unit',
            ar: /مدرع|مدرعة|مدرعات/, en: /\barmo(?:u)?r(?:ed)?\b/i,
            arName: 'مدرع', enName: 'Armor' },
        { key: 'recon', family: 'reconnaissance', symbol: 'reconnaissance', platform: 'ground_unit',
            ar: /استطلاع|استكشاف/, en: /\brecon(?:naissance)?\b|\bscout\b/i,
            arName: 'استطلاع', enName: 'Reconnaissance' },
        { key: 'radar', family: 'radar', symbol: 'radar', platform: 'radar',
            ar: /رادار|إنذار\s*مبكر|انذار\s*مبكر/, en: /\bradar\b|\bEWR\b|\bsensor\b/i,
            arName: 'رادار', enName: 'Radar' },
        { key: 'engineer', family: 'engineer', symbol: 'engineer', platform: 'ground_unit',
            ar: /هندسة|مهندسين/, en: /\bengineer(?:s|ing)?\b/i,
            arName: 'هندسة', enName: 'Engineer' },
        { key: 'artillery', family: 'artillery', symbol: 'artillery', platform: 'ground_unit',
            ar: /مدفعية|مدافع/, en: /\bartillery\b|\bguns?\b/i,
            arName: 'مدفعية', enName: 'Artillery' },
        { key: 'logistics', family: 'logistics', symbol: 'logistics', platform: 'logistics',
            ar: /لوجستي|لوجستية|إمداد|امداد|تموين/, en: /\blogistic(?:s)?\b|\bsupply\b|\bdepot\b/i,
            arName: 'إمداد', enName: 'Logistics' },
        { key: 'hq', family: 'hq', symbol: 'hq', platform: 'hq',
            ar: /قيادة|مقر|رئاسة/, en: /\bHQ\b|\bheadquarters?\b|\bcommand\b/i,
            arName: 'قيادة', enName: 'HQ' },
        { key: 'air_base', family: 'base', symbol: 'air_base', platform: 'air_base',
            ar: /قاعدة\s*جوية|مطار/, en: /\bair base\b|\bairfield\b|\bairport\b/i,
            arName: 'قاعدة جوية', enName: 'Air Base' },
        { key: 'naval_base', family: 'base', symbol: 'naval_base', platform: 'naval_base',
            ar: /قاعدة\s*بحرية|ميناء/, en: /\bnaval base\b|\bport\b|\bharbo[u]?r\b/i,
            arName: 'قاعدة بحرية', enName: 'Naval Base' },
        { key: 'land_base', family: 'base', symbol: 'land_base', platform: 'land_base',
            ar: /قاعدة\s*برية|قاعدة\s*أرضية|قاعدة\s*ارضية/, en: /\bland base\b|\barmy base\b|\bground base\b/i,
            arName: 'قاعدة برية', enName: 'Land Base' },
        { key: 'infantry', family: 'infantry', symbol: 'infantry', platform: 'ground_unit',
            ar: /(?:ال)?مشاة/, en: /\binfantry\b/i,
            arName: 'مشاة', enName: 'Infantry' },
    ];

    function arr(v) { return Array.isArray(v) ? v : []; }
    function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }
    function hasArabic(s) { return AR_RE.test(String(s || '')); }
    function hasLatin(s) { return /[A-Za-z]/.test(String(s || '')); }
    function languageOf(text) {
        var ar = hasArabic(text), en = hasLatin(text);
        if (ar && en) return 'mixed';
        if (ar) return 'ar';
        if (en) return 'en';
        return 'unknown';
    }
    function parseNumber(text) {
        var map = { '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9' };
        var s = String(text || '').replace(/[٠-٩]/g, function (ch) { return map[ch] || ch; });
        var m = s.match(/\b(\d{1,4})\b/);
        return m ? m[1] : null;
    }
    function countOf(text) {
        var n = parseNumber(text);
        if (n != null) return Math.max(1, Number(n));
        if (/three|\b3\b/i.test(text)) return 3;
        if (/two|\b2\b/i.test(text)) return 2;
        return 1;
    }
    function matchEchelon(text) {
        for (var i = 0; i < ECHELONS.length; i++) {
            var e = ECHELONS[i];
            if ((e.ar && e.ar.test(text)) || (e.en && e.en.test(text))) return e.key;
            if (e.ar) e.ar.lastIndex = 0;
        }
        return null;
    }
    function matchType(text) {
        for (var i = 0; i < TYPES.length; i++) {
            var t = TYPES[i];
            if ((t.ar && t.ar.test(text)) || (t.en && t.en.test(text))) return t;
            if (t.ar) t.ar.lastIndex = 0;
        }
        return null;
    }
    function stripComposition(text) {
        return clean(String(text || '').replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' '));
    }
    function compositionText(text) {
        var m = String(text || '').match(/\(([^)]*)\)/);
        return m ? m[1] : '';
    }
    function splitComposition(text) {
        return clean(text).split(/\s*(?:\+|,|،|;|؛| and )\s*/i).map(clean).filter(Boolean);
    }
    function synthName(typeInfo, echelon, number, lang) {
        var t = typeInfo || {};
        var en = [t.enName || 'Unknown', echelon ? title(echelon) : null, number].filter(Boolean).join(' ');
        var arE = { brigade: 'لواء', battalion: 'كتيبة', company: 'سرية', platoon: 'فصيل', battery: 'بطارية', site: 'موقع', base: 'قاعدة' };
        var ar = [arE[echelon] || null, t.arName || 'غير معروف', number].filter(Boolean).join(' ');
        return lang === 'ar' ? { ar: ar, en: en } : { ar: ar, en: en };
    }
    function title(s) { return String(s || '').replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); }
    function confidenceLabel(score) {
        if (score >= 0.82) return 'high';
        if (score >= 0.58) return 'medium';
        return 'low';
    }
    function normalizeUnitText(text, opts) {
        opts = opts || {};
        var original = clean(text);
        var lang = languageOf(original);
        var base = stripComposition(original);
        var echelon = matchEchelon(base);
        var typeInfo = matchType(base);
        var unitNumber = parseNumber(base);
        var warnings = [];
        var missing = [];
        if (!original) warnings.push('empty_unit_text');
        if (!echelon) missing.push('echelon');
        if (!typeInfo) {
            warnings.push('unknown_unit_type');
            missing.push('unit_type');
            typeInfo = { key: 'unknown', family: 'unknown', symbol: 'unknown', platform: 'unknown', arName: 'غير معروف', enName: 'Unknown' };
        }
        var comp = splitComposition(compositionText(original)).map(function (part) {
            var child = normalizeUnitText(part, { source_type: 'composition_item', noComposition: true });
            return {
                count: countOf(part),
                original_text: part,
                echelon: child.echelon,
                unit_family: child.unit_family,
                unit_type: child.unit_type,
                symbol_category: child.symbol_category,
            };
        });
        var score = 0.22 + (typeInfo.key !== 'unknown' ? 0.42 : 0) + (echelon ? 0.16 : 0) + (unitNumber ? 0.06 : 0) + (comp.length ? 0.08 : 0);
        if (warnings.length) score = Math.min(score, 0.45);
        var names = synthName(typeInfo, echelon, unitNumber, lang);
        var out = {
            original_text: original,
            language: lang,
            normalized_name_ar: lang === 'ar' || lang === 'mixed' ? original || names.ar : names.ar,
            normalized_name_en: lang === 'en' ? original || names.en : names.en,
            unit_number: unitNumber,
            echelon: echelon || 'unknown',
            unit_family: typeInfo.family || 'unknown',
            unit_type: typeInfo.key || 'unknown',
            symbol_category: typeInfo.symbol || 'unknown',
            platform_category: typeInfo.platform || 'unknown',
            sidc_candidate: 'review_required',
            sidc_confidence: 'review_required',
            composition: opts.noComposition ? [] : comp,
            confidence: confidenceLabel(score),
            warnings: warnings,
            missing_information: missing,
            needs_review: true,
            exact_unit_position: false,
            source_type: opts.source_type || 'unit_text_candidate',
        };
        if (!CONF_ALLOWED[out.confidence]) out.confidence = 'low';
        return out;
    }
    function textFromUnit(unit) {
        if (typeof unit === 'string') return unit;
        unit = unit || {};
        return clean([
            unit.original_text, unit.name, unit.unit_name, unit.platform, unit.platform_name,
            unit.type_ar, unit.type, unit.description
        ].filter(Boolean).join(' '));
    }
    function normalizeUnit(unit, opts) {
        return normalizeUnitText(textFromUnit(unit), opts || {});
    }
    function normalizeUnits(units, opts) {
        return arr(units).map(function (u) { return normalizeUnit(u, opts || {}); });
    }

    var API = {
        normalizeUnitText: normalizeUnitText,
        normalizeUnit: normalizeUnit,
        normalizeUnits: normalizeUnits,
        languageOf: languageOf,
        SYMBOL_CATEGORIES: ['infantry', 'mechanized_infantry', 'armor', 'reconnaissance', 'artillery', 'air_defense', 'radar', 'engineer', 'logistics', 'hq', 'air_base', 'naval_base', 'land_base', 'unknown'],
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined') window.RmoozUnitIntelNormalizer = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
