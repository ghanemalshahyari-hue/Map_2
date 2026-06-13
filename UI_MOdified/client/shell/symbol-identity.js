/* ============================================================================
 * symbol-identity.js — GLOBAL-SYMBOL-IDENTITY-A
 * ----------------------------------------------------------------------------
 * ONE shared, review-only symbol-identity resolver for ALL RMOOZ review surfaces
 * (Free Fight, Step 1 review, base/anchor cards, future scenario editor / import
 * wizard / unit status cards / map review layers). It composes the existing
 * deterministic pieces into a single decision:
 *
 *   unit-intel-normalizer  → understand Arabic/English unit text
 *   symbol-registry        → display glyph (unit category + object/base)
 *   sidc-preview           → optional, additive review-only SIDC preview
 *
 * HARD BOUNDARY — identity only, never authority:
 *   - NO final units, NO final/approved SIDC (sidc_candidate stays
 *     "review_required"), NO world-state, NO weapons/damage/kill/adjudication,
 *     NO exact positions. needs_review:true, exact_unit_position:false.
 *   - This does NOT replace the real milsymbol path (symbology.js / units-map.js /
 *     adjudicator-map.js); those remain the only authoritative unit symbology.
 *
 *   window.RmoozSymbolIdentity = { resolve(input) }   (+ module.exports for Node)
 * ========================================================================== */
(function (root) {
    'use strict';

    function W() { return (typeof window !== 'undefined') ? window : root; }
    function arr(v) { return Array.isArray(v) ? v : []; }
    function dedupe(a) { var seen = {}, out = []; arr(a).forEach(function (x) { if (x && !seen[x]) { seen[x] = 1; out.push(x); } }); return out; }

    function normalizer() { var w = W(); if (w && w.RmoozUnitIntelNormalizer) return w.RmoozUnitIntelNormalizer; try { return require('./unit-intel-normalizer.js'); } catch (_) { return null; } }
    function registry() { var w = W(); if (w && w.RmoozSymbolRegistry) return w.RmoozSymbolRegistry; try { return require('./symbol-registry.js'); } catch (_) { return null; } }
    function sidc() { var w = W(); if (w && w.RmoozSidcPreview) return w.RmoozSidcPreview; try { return require('./sidc-preview.js'); } catch (_) { return null; } }

    var AR_RE = /[؀-ۿ]/;
    function hasUnitText(input) {
        if (input.unit_intel) return true;
        var t = [input.original_text, input.name].filter(Boolean).join(' ');
        if (AR_RE.test(t) || /[A-Za-z]/.test(t)) return true;
        // input.type may be a unit phrase ("Tank Battalion") rather than an object type.
        return !!(input.type && (AR_RE.test(String(input.type)) || /[A-Za-z]/.test(String(input.type))) && !input.object_type);
    }
    function safeNormalize(N, input) {
        try {
            if (input.unit_intel) return input.unit_intel;
            return N.normalizeUnit({
                original_text: input.original_text, name: input.name, platform: input.name,
                type_ar: input.type, type: input.type, description: input.original_text,
            });
        } catch (_) { return null; }
    }
    // object_type → a platform-registry category (for the symbol_category field on
    // bases). Display glyph itself comes from object_symbol; this is secondary.
    function objCategory(REG, objectType) {
        var t = (REG && REG.normObjectType) ? REG.normObjectType(objectType) : null;
        var MAP = {
            air_base: 'air_base', airport: 'air_base', naval_base: 'naval_base', port: 'naval_base',
            land_base: 'land_base', base_facility: 'land_base', radar_site: 'radar',
            air_defense_site: 'air_defense', logistics_node: 'logistics', hq: 'hq',
        };
        return (t && MAP[t]) || 'unknown';
    }

    function resolve(input) {
        input = input || {};
        var N = normalizer(), REG = registry(), SP = sidc();
        var objectType = input.object_type || null;

        // 1. deterministic unit-intel first (only when there is unit text / intel)
        var intel = hasUnitText(input) && N ? safeNormalize(N, input) : (input.unit_intel || null);

        // 2. symbol category: normalized intel → explicit input → object-derived → platform → unknown
        var symCat =
            (intel && intel.symbol_category && intel.symbol_category !== 'unknown') ? intel.symbol_category :
            (input.symbol_category && input.symbol_category !== 'unknown') ? input.symbol_category :
            (objectType ? objCategory(REG, objectType) :
            (input.platform_category && input.platform_category !== 'unknown') ? input.platform_category : 'unknown');

        // 3. display glyph — object/base uses object_symbol; else the category glyph
        var objectSymbol = (objectType && REG && REG.objectSymbol) ? REG.objectSymbol(objectType) : null;
        var disp = objectSymbol || (REG && REG.platformSymbol ? REG.platformSymbol(symCat) : null);
        var display_glyph = (disp && disp.glyph) || '?';
        var display_label = disp ? (disp.label_en || disp.object_type || disp.symbol_category || 'Unknown') : 'Unknown';

        // 4. optional, additive review-only SIDC preview
        var echelon = (intel && intel.echelon) || input.echelon || null;
        var sp = SP ? SP.previewFor({ symbol_category: symCat, echelon: echelon, side: input.side }) : null;

        // 5. warnings / missing / unknown handling
        var warnings = [];
        if (intel) arr(intel.warnings).forEach(function (w) { warnings.push(w); });
        if (disp && disp.warning) warnings.push(disp.warning);
        if (sp) arr(sp.warnings).forEach(function (w) { warnings.push(w); });
        var missing = intel ? arr(intel.missing_information).slice() : [];
        if (symCat === 'unknown' && warnings.indexOf('unknown_unit_type') === -1) warnings.push('unknown_unit_type');

        var confidence = intel ? (intel.confidence || 'low')
            : (objectSymbol && objectSymbol.fallback === false) ? 'medium'
            : (sp && sp.sidc_preview_candidate) ? sp.confidence : 'low';

        return {
            original_text: (intel && intel.original_text) || input.original_text || input.name || '',
            normalized_unit_intel: intel || null,
            display_glyph: display_glyph,
            display_label: display_label,
            symbol_category: symCat,
            platform_category: (intel && intel.platform_category) || input.platform_category || (symCat !== 'unknown' ? symCat : 'unknown'),
            object_symbol: objectSymbol,
            sidc_preview: sp ? sp.sidc_preview_candidate : null,
            sidc_candidate: 'review_required',   // never final
            confidence: confidence,
            warnings: dedupe(warnings),
            missing_information: dedupe(missing),
            needs_review: true,
            exact_unit_position: false,
            source_type: input.source_type || 'symbol_identity_resolve',
        };
    }

    var API = { resolve: resolve };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined') window.RmoozSymbolIdentity = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
