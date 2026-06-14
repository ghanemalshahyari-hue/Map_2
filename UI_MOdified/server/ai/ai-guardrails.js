/**
 * ai-guardrails.js — shared safety normalization for LLM-derived data
 *
 * All LLM output passes through here before it can touch scenario state.
 *
 * Invariants (inviolable — see safety contract in step1-llm-fill.js):
 *   • exact_unit_position is always false
 *   • needs_review is always true
 *   • lat/lon are always null  (LLM must never place units on the map)
 *   • source_type is stamped to identify LLM origin
 *   • confidence is clamped to 'high'|'medium'|'low'  (default: 'low')
 *
 * This was extracted from step1-llm-fill.js (AI-GLOBAL-REFACTOR-PHASE-1-A).
 * Behavior is identical to the original normalizeUnit / normalizeBase —
 * no logic change.  The optional third argument (opts) is new surface area
 * that lets future callers override source_type without forking the function;
 * step1-llm-fill.js passes no opts, so defaults remain 'llm_fill' throughout.
 */
'use strict';

// ── Confidence normalizer ────────────────────────────────────────────────────
// Accepts only the three valid string literals; everything else becomes 'low'.
function safeConfidence(val) {
    return (val === 'high' || val === 'medium') ? val : 'low';
}

// ── Unit normalizer ──────────────────────────────────────────────────────────
// Converts a raw LLM unit object → review-safe proposed_unit shape.
// opts.sourceType — override the default 'llm_fill' stamp (optional).
function normalizeUnit(u, idx, opts) {
    opts = opts || {};
    var sourceType = opts.sourceType || 'llm_fill';
    var side = String((u && u.side) || '').trim().toUpperCase();
    if (side !== 'RED' && side !== 'BLUE' && side !== 'NEUTRAL') side = 'NEUTRAL';
    return {
        side: side,
        platform:             String((u.platform || u.name || '') || '').slice(0, 100) || ('LLM-UNIT-' + (idx + 1)),
        estimated_count:      (typeof u.estimated_count === 'number' && u.estimated_count > 0) ? Math.floor(u.estimated_count) : 1,
        role:                 String(u.role || 'unknown').slice(0, 50),
        // Coordinates are ALWAYS null — LLM must never invent positions
        lat:  null,
        lon:  null,
        // Review-safety flags — locked; cannot be overridden by LLM output
        exact_unit_position:  false,
        needs_review:         true,
        review_only:          true,
        draft:                true,
        placement_confidence: 'low',
        source_type:          sourceType,
        confidence:           safeConfidence(u.confidence),
        source_evidence:      (typeof u.source_evidence === 'string') ? u.source_evidence.slice(0, 200) : null,
        warnings:             ['llm_extracted_unit_requires_operator_review'],
    };
}

// ── Base normalizer ──────────────────────────────────────────────────────────
// Converts a raw LLM base object → review-safe placement_candidate shape.
// opts.sourceType — override the default 'llm_fill' stamp (optional).
function normalizeBase(b, idx, opts) {
    opts = opts || {};
    var sourceType = opts.sourceType || 'llm_fill';
    var side = String((b && b.side) || '').trim().toUpperCase();
    if (side !== 'RED' && side !== 'BLUE') side = 'RED';
    var siteType = String(b.type || 'unknown').toLowerCase();
    if (!/naval|air|land|unknown/.test(siteType)) siteType = 'unknown';
    return {
        side: side,
        base_name_en:         String((b.name || '') || '').slice(0, 100) || ('LLM-BASE-' + (idx + 1)),
        site_type:            siteType,
        // Coordinates locked null — LLM must not invent geocoords
        lat:  null,
        lon:  null,
        exact_unit_position:  false,
        needs_review:         true,
        placement_type:       'base_location_anchor',
        source_type:          sourceType,
        confidence:           safeConfidence(b.confidence),
        source_evidence:      (typeof b.source_evidence === 'string') ? b.source_evidence.slice(0, 200) : null,
        warnings:             ['llm_named_location_requires_geocoding'],
    };
}

module.exports = { normalizeUnit, normalizeBase, safeConfidence };
