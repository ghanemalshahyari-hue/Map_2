/* ============================================================================
 * symbol-registry.js — DOC-UNDERSTANDING-1 / SYMBOL-DB-B (symbol mapping)
 * ----------------------------------------------------------------------------
 * A safe, review-only RMOOZ symbol layer for Step 1 anchors and proposed-unit
 * categories. It maps object_type / base_type / platform_category → a display
 * SYMBOL DESCRIPTOR (glyph + bilingual label + source/fallback flags).
 *
 * This is DELIBERATELY NOT the milsymbol / MIL-STD-2525 SIDC system
 * (client/symbology.js → window.AppSymbology), which renders REAL scenario
 * units. This registry exists so Step 1 base anchors stop rendering as a
 * generic "B" (or as infantry) and instead show a base/facility symbol that
 * matches their type — while every anchor stays review_only / needs_review /
 * exact_unit_position:false.
 *
 *   window.RmoozSymbolRegistry = {
 *     OBJECT_SYMBOLS, PLATFORM_SYMBOLS,
 *     normObjectType(s), objectSymbol(type), platformSymbol(cat),
 *     resolveBaseSymbol(anchorOrBase), iconHtml(sym, {side})
 *   }   (also module.exports for Node tests)
 *
 * FUTURE (NOT implemented now) — aircraft sortie lifecycle for demo movement:
 *   parked → taxi → runway → airborne → enroute → mission → return → landed.
 *   Symbols here are display-only; no taxi/takeoff/flight modeling yet.
 * ========================================================================== */
(function (root) {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch];
        });
    }
    function assign(t, s) { for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) t[k] = s[k]; return t; }

    // ── Object / base / site symbols (monochrome BMP glyphs — take text color) ──
    var OBJECT_SYMBOLS = {
        air_base:               { glyph: '✈', label_en: 'Air Base',          label_ar: 'قاعدة جوية', kind: 'base' },        // ✈
        airport:                { glyph: '✈', label_en: 'Airport',           label_ar: 'مطار', kind: 'base' },                                          // ✈
        naval_base:             { glyph: '⚓', label_en: 'Naval Base',        label_ar: 'قاعدة بحرية', kind: 'base' },      // ⚓
        port:                   { glyph: '⚓', label_en: 'Port',              label_ar: 'ميناء', kind: 'base' },                                     // ⚓
        land_base:              { glyph: '▣', label_en: 'Land Base',         label_ar: 'قاعدة برية', kind: 'base' },           // ▣
        friendly_trial_anchor:  { glyph: '◇', label_en: 'Trial Anchor',      label_ar: 'مرساة تجريبية', kind: 'anchor' }, // ◇
        base_facility:          { glyph: '⬢', label_en: 'Base / Facility',   label_ar: 'قاعدة / منشأة', kind: 'base' },    // ⬢
        radar_site:             { glyph: '◎', label_en: 'Radar Site',        label_ar: 'موقع رادار', kind: 'site' },           // ◎
        air_defense_site:       { glyph: '⊕', label_en: 'Air Defense Site',  label_ar: 'موقع دفاع جوي', kind: 'site' }, // ⊕
        logistics_node:         { glyph: '▦', label_en: 'Logistics Node',    label_ar: 'عقدة إمداد', kind: 'site' },           // ▦
        hq:                     { glyph: '★', label_en: 'HQ',                label_ar: 'قيادة', kind: 'site' },                                     // ★
        objective:              { glyph: '◉', label_en: 'Objective',         label_ar: 'هدف', kind: 'objective' },                                           // ◉
        infrastructure:         { glyph: '⌂', label_en: 'Infrastructure',    label_ar: 'بنية تحتية', kind: 'infrastructure' },  // ⌂
        unknown:                { glyph: '?',      label_en: 'Unknown',           label_ar: 'غير معروف', kind: 'unknown' },
    };

    // ── Platform-category symbols (display in the Base Status Panel) ──
    var PLATFORM_SYMBOLS = {
        air_fighter:     { glyph: '▲', label_en: 'Fighter',          label_ar: 'مقاتلة' },                       // ▲
        air_attack:      { glyph: '◆', label_en: 'Attack / Strike',  label_ar: 'هجوم' },                                   // ◆
        air_transport:   { glyph: '▭', label_en: 'Transport',        label_ar: 'نقل جوي' },                      // ▭
        maritime_patrol: { glyph: '▿', label_en: 'Maritime Patrol',  label_ar: 'دورية بحرية' }, // ▿
        helicopter:      { glyph: '✚', label_en: 'Helicopter',       label_ar: 'مروحية' },                       // ✚
        uav:             { glyph: '◇', label_en: 'UAV',              label_ar: 'طائرة بدون طيار' }, // ◇
        naval_surface:   { glyph: '▢', label_en: 'Naval Surface',    label_ar: 'سطحية بحرية' }, // ▢
        submarine:       { glyph: '⊓', label_en: 'Submarine',        label_ar: 'غواصة' },                             // ⊓
        ground_unit:     { glyph: '▬', label_en: 'Ground Unit',      label_ar: 'وحدة برية' },           // ▬
        air_defense:     { glyph: '⊕', label_en: 'Air Defense',      label_ar: 'دفاع جوي' },                 // ⊕
        radar:           { glyph: '◎', label_en: 'Radar',            label_ar: 'رادار' },                             // ◎
        logistics:       { glyph: '▦', label_en: 'Logistics',        label_ar: 'إمداد' },                             // ▦
        infantry:        { glyph: 'I',      label_en: 'Infantry',         label_ar: 'مشاة' },
        mechanized_infantry: { glyph: 'M',  label_en: 'Mechanized Infantry', label_ar: 'مشاة آلي' },
        armor:           { glyph: 'T',      label_en: 'Armor / Tank',     label_ar: 'مدرع / دبابات' },
        reconnaissance:  { glyph: 'R',      label_en: 'Reconnaissance',   label_ar: 'استطلاع' },
        artillery:       { glyph: 'A',      label_en: 'Artillery',        label_ar: 'مدفعية' },
        engineer:        { glyph: 'E',      label_en: 'Engineer',         label_ar: 'هندسة' },
        hq:              { glyph: '★',      label_en: 'HQ',               label_ar: 'قيادة' },
        air_base:        { glyph: '✈',      label_en: 'Air Base',         label_ar: 'قاعدة جوية' },
        naval_base:      { glyph: '⚓',      label_en: 'Naval Base',       label_ar: 'قاعدة بحرية' },
        land_base:       { glyph: '▣',      label_en: 'Land Base',        label_ar: 'قاعدة برية' },
        unknown:         { glyph: '?',      label_en: 'Unknown',          label_ar: 'غير معروف' },
    };

    // Normalize any object/base type string → a canonical OBJECT_SYMBOLS key (or
    // null when unrecognized). Order matters: specific sites before generic
    // air/naval/land, and the generic "base/facility" catch comes LAST so
    // "air_base"/"naval_base" resolve to their specific symbol first.
    function normObjectType(s) {
        s = String(s == null ? '' : s).toLowerCase();
        if (!s) return null;
        if (/friendly_trial|trial/.test(s)) return 'friendly_trial_anchor';
        if (/radar|ewr|\bsensor\b/.test(s)) return 'radar_site';
        if (/air.?def|\bsam\b|\baaa\b|shorad|missile.?def|دفاع/.test(s)) return 'air_defense_site';
        if (/logist|supply|depot|إمداد/.test(s)) return 'logistics_node';
        if (/\bhq\b|headquarter|command|قيادة/.test(s)) return 'hq';
        if (/objective|\bobj\b|target|هدف/.test(s)) return 'objective';
        if (/infrastructure|\binfra\b|bridge|بنية/.test(s)) return 'infrastructure';
        if (/airport/.test(s)) return 'airport';
        if (/\bport\b|harbou|مينا/.test(s)) return 'port';
        if (/naval|بحر/.test(s)) return 'naval_base';
        if (/land|ground|army|بري|برية/.test(s)) return 'land_base';
        if (/air|airfield|جو|مطار/.test(s)) return 'air_base';
        if (/facility|base/.test(s)) return 'base_facility';
        return null;
    }

    function objectSymbol(type) {
        var key = OBJECT_SYMBOLS[type] ? type : normObjectType(type);
        if (key && OBJECT_SYMBOLS[key]) return assign({ object_type: key, symbol_source: 'registry', fallback: false, warning: null }, OBJECT_SYMBOLS[key]);
        return assign({ object_type: 'unknown', symbol_source: 'fallback_unknown', fallback: true, warning: 'no symbol mapping — unknown object type' }, OBJECT_SYMBOLS.unknown);
    }

    function platformSymbol(cat) {
        var key = String(cat == null ? '' : cat).toLowerCase();
        if (PLATFORM_SYMBOLS[key]) return assign({ symbol_category: key, symbol_source: 'registry', fallback: false, warning: null }, PLATFORM_SYMBOLS[key]);
        return assign({ symbol_category: 'unknown', symbol_source: 'fallback_unknown', fallback: true, warning: 'unknown platform category' }, PLATFORM_SYMBOLS.unknown);
    }

    // Resolve a Step 1 anchor / base object → a base symbol descriptor.
    // Two-tier fallback (per spec): a base-ish object with an unmapped type →
    // base_facility (warning); a truly unrecognized object → unknown (warning).
    function resolveBaseSymbol(input) {
        input = input || {};
        var raw = input.object_type || input.site_type || input.base_type || input.anchor_type || input.placement_type || input.type || '';
        var t = normObjectType(raw);
        if (t && OBJECT_SYMBOLS[t]) {
            return assign({ object_type: t, base_type: t, raw_type: String(raw || ''), symbol_source: 'registry', fallback: false, warning: null }, OBJECT_SYMBOLS[t]);
        }
        var looksLikeBase = !!(input.base_name_ar || input.base_name_en || input.base_id ||
            input.grouped_units_count != null || input.grouped_unit_count != null ||
            /anchor|base|قاعد/.test(String(raw)));
        if (looksLikeBase) {
            return assign({ object_type: 'base_facility', base_type: 'base_facility', raw_type: String(raw || ''),
                symbol_source: 'fallback_base_facility', fallback: true,
                warning: 'no specific base symbol for "' + String(raw || '(empty)') + '" — using base_facility' }, OBJECT_SYMBOLS.base_facility);
        }
        return assign({ object_type: 'unknown', base_type: 'unknown', raw_type: String(raw || ''),
            symbol_source: 'fallback_unknown', fallback: true,
            warning: 'no symbol mapping for "' + String(raw || '(empty)') + '" — using unknown fallback' }, OBJECT_SYMBOLS.unknown);
    }

    // Marker HTML for a Leaflet divIcon — side drives fill/ring; the glyph is the
    // registry symbol. NOT a unit/infantry symbol; bases read as bases.
    function iconHtml(sym, opts) {
        opts = opts || {};
        var side = String(opts.side || '').toUpperCase();
        var fill = side === 'BLUE' ? '#1f7a4d' : (side === 'RED' ? '#8f1f1f' : '#33475f');
        var ring = side === 'BLUE' ? '#7fd6a0' : (side === 'RED' ? '#f0a0a0' : '#cfe6ff');
        var glyph = (sym && sym.glyph) || OBJECT_SYMBOLS.unknown.glyph;
        var title = (sym && (sym.label_en || sym.object_type)) || 'object';
        return '<div title="' + esc(title) + '" style="width:20px;height:20px;border-radius:4px;background:' + fill +
            ';border:2px solid ' + ring + ';box-shadow:0 0 0 2px rgba(16,24,32,.6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;line-height:1;">' + glyph + '</div>';
    }

    var API = {
        OBJECT_SYMBOLS: OBJECT_SYMBOLS, PLATFORM_SYMBOLS: PLATFORM_SYMBOLS,
        normObjectType: normObjectType, objectSymbol: objectSymbol, platformSymbol: platformSymbol,
        resolveBaseSymbol: resolveBaseSymbol, iconHtml: iconHtml,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined') window.RmoozSymbolRegistry = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
