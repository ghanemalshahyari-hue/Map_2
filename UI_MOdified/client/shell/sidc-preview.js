/* ============================================================================
 * sidc-preview.js — SIDC-BRIDGE-A (review-only SIDC preview bridge)
 * ----------------------------------------------------------------------------
 * Bridges the unit-intel normalizer (symbol_category + echelon + side) to the
 * existing AppSymbology / milsymbol world as a REVIEW-ONLY *preview* candidate.
 *
 * HARD BOUNDARY — this is a preview, never an authority:
 *   - NO final units, NO final/approved SIDC, NO world-state, NO tasking,
 *     NO weapons/damage/kill-probability/adjudication.
 *   - `sidc_candidate` stays "review_required"; `needs_review:true`,
 *     `exact_unit_position:false`. The display-glyph system (RmoozSymbolRegistry)
 *     remains the primary renderer; this only adds an optional preview.
 *
 * Rules (SIDC-BRIDGE-A):
 *   1. Use ONLY existing internal SIDC/AppSymbology data.
 *   2. Do NOT invent SIDC strings — emit a candidate only when the app already
 *      ships a known-safe code (a FALLBACK_SIDC_FAVORITES entry). The app builds
 *      other SIDCs by combining picker parts at selection time; reconstructing
 *      those here would be "inventing", so we do not.
 *   3. Uncertain → sidc_preview_candidate:null + warning "No safe internal SIDC
 *      mapping found" + sidc_candidate:"review_required".
 *   4. Safe → sidc_preview_candidate:{ sidc, source:"internal_app_symbology_mapping",
 *      confidence }, needs_review:true.
 *   5. Side/affiliation is PREVIEW-ONLY (selects which favorite variant to show).
 *   6. Echelon modifier is PREVIEW-ONLY — NOT encoded into the SIDC.
 *   7. Composition children do NOT create sub-markers.
 *   8. Category glyphs stay the fallback.
 *
 * Today the only pre-built app favorites are infantry (Friendly/Hostile/Unknown),
 * so infantry maps to a preview candidate and every other category safely
 * returns null + warning. As the app adds favorites, this bridge follows them.
 *
 *   window.RmoozSidcPreview = { previewFor(input), previewSvg(sidc, opts), affiliationOf(side) }
 *   (also module.exports for Node tests)
 * ========================================================================== */
(function (root) {
    'use strict';

    function W() { return (typeof window !== 'undefined') ? window : root; }
    function arr(v) { return Array.isArray(v) ? v : []; }

    // The app's known-safe, pre-built SIDC strings live in symbology.js →
    // window.AppSymbology.FALLBACK_SIDC_FAVORITES. We read those live when present;
    // this mirror (copied verbatim from that file) is the offline / Node fallback
    // so the bridge + its tests never depend on the browser-only global.
    var FAVORITE_MIRROR = [
        { sidc: '10031000001200000000', label: 'Friendly Infantry' },
        { sidc: '10033500001200000000', label: 'Hostile Infantry' },
        { sidc: '10037000001200000000', label: 'Unknown Infantry' },
    ];
    function favorites() {
        var w = W();
        var live = (w && w.AppSymbology && arr(w.AppSymbology.FALLBACK_SIDC_FAVORITES)) || null;
        return (live && live.length) ? live : FAVORITE_MIRROR;
    }
    function favByLabel(label) {
        var f = favorites().filter(function (x) { return x && x.label === label && x.sidc; })[0];
        return f ? String(f.sidc) : null;
    }

    // Side → 2525 affiliation family (preview-only). Unknown side stays unknown.
    function affiliationOf(side) {
        var s = String(side == null ? '' : side).toUpperCase();
        if (s === 'BLUE' || s === 'FRIEND' || s === 'FRIENDLY') return 'friend';
        if (s === 'RED' || s === 'HOSTILE' || s === 'ENEMY') return 'hostile';
        return 'unknown';
    }

    // symbol_category → the favorite label we can SAFELY reuse (only categories the
    // app already ships a pre-built SIDC for). Today: infantry only.
    function favoriteLabelFor(symbolCategory, affiliation) {
        if (symbolCategory === 'infantry') {
            return affiliation === 'friend' ? 'Friendly Infantry'
                 : affiliation === 'hostile' ? 'Hostile Infantry'
                 : 'Unknown Infantry';
        }
        return null;
    }

    // input: { symbol_category|unit_type, echelon, side|affiliation }
    function previewFor(input) {
        input = input || {};
        var symbolCategory = String(input.symbol_category || input.unit_type || 'unknown');
        var echelon = input.echelon || null;
        var side = input.side != null ? input.side : (input.affiliation != null ? input.affiliation : null);
        var affiliation = affiliationOf(side);
        var warnings = [];
        var out = {
            symbol_category: symbolCategory,
            echelon: echelon || 'unknown',
            side: side || null,
            affiliation_preview: affiliation,    // rule 5 — preview only
            echelon_preview: echelon || null,    // rule 6 — preview only, NOT in the SIDC
            sidc_preview_candidate: null,
            sidc_candidate: 'review_required',   // never final
            confidence: 'low',
            warnings: warnings,
            needs_review: true,
            exact_unit_position: false,
            source_type: 'sidc_preview_bridge',
        };
        if (!symbolCategory || symbolCategory === 'unknown') {
            warnings.push('No safe internal SIDC mapping found');
            return out;
        }
        var label = favoriteLabelFor(symbolCategory, affiliation);
        var sidc = label ? favByLabel(label) : null;
        if (!sidc) {
            warnings.push('No safe internal SIDC mapping found');
            return out;
        }
        out.sidc_preview_candidate = {
            sidc: sidc,
            source: 'internal_app_symbology_mapping',
            matched_favorite: label,
            confidence: affiliation === 'unknown' ? 'low' : 'medium',
        };
        out.confidence = out.sidc_preview_candidate.confidence;
        if (echelon && echelon !== 'unknown') warnings.push('echelon modifier is preview-only and not encoded in the SIDC');
        return out;
    }

    // Optional milsymbol SVG — guarded; returns null when milsymbol (window.ms) is
    // unavailable or the code cannot render (card then falls back to the glyph).
    function previewSvg(sidc, opts) {
        opts = opts || {};
        var w = W();
        if (!sidc || !w || !w.ms || typeof w.ms.Symbol !== 'function') return null;
        try { return new w.ms.Symbol(String(sidc), { size: opts.size || 24 }).asSVG(); } catch (_) { return null; }
    }

    var API = { previewFor: previewFor, previewSvg: previewSvg, affiliationOf: affiliationOf };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined') window.RmoozSidcPreview = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
