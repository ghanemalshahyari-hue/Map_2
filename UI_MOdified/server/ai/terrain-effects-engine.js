'use strict';
/* ============================================================================
 * terrain-effects-engine.js — shared AI-intelligence module
 * ----------------------------------------------------------------------------
 * Coarse terrain effect heuristic for movement / visibility / line-of-sight.
 *
 * DEMO / REVIEW-ONLY HEURISTIC. Terrain is inferred from a free-text terrain
 * hint in the context (context.terrain or context.terrain_note). When NO terrain
 * information is present the engine is HONEST about it: terrain_available:false
 * and neutral (1.0) modifiers — it never fabricates terrain. No classified data.
 *
 * Scenario-generic: no hardcoded scenario/draft names, no hardcoded unit IDs.
 * Pure module — no DOM, no network, requireable in isolation (CommonJS).
 *
 * Exports:
 *   terrainEffect(unit, start, target, context) → effect profile
 *   terrainSummary(units, objectives, context)  → short string
 * ========================================================================== */

var catalog = require('./platform-capability-catalog');

function arr(v) { return Array.isArray(v) ? v : []; }

function terrainHint(context) {
    var c = context || {};
    var raw = '';
    if (c.terrain != null) raw += ' ' + c.terrain;
    if (c.terrain_note != null) raw += ' ' + c.terrain_note;
    if (c.terrain_notes != null) raw += ' ' + c.terrain_notes;
    return raw.toLowerCase().trim();
}

function has(hint, words) {
    for (var i = 0; i < words.length; i++) { if (hint.indexOf(words[i]) !== -1) return true; }
    return false;
}

function neutral(extra) {
    var base = {
        movement_modifier: 1.0,
        visibility_modifier: 1.0,
        los_risk: 'medium',
        terrain_notes: '',
        route_warning: null,
        confidence: 'low',
        terrain_available: false,
        demo_only: true, review_only: true,
    };
    if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) base[k] = extra[k]; } }
    return base;
}

/**
 * terrainEffect(unit, start, target, context) → effect profile.
 * start/target are accepted for signature completeness; the demo heuristic keys
 * off the terrain hint and the unit's domain (from the capability catalog).
 */
function terrainEffect(unit, start, target, context) {
    var hint = terrainHint(context);
    if (!hint) {
        return neutral({ terrain_available: false, los_risk: 'medium',
            terrain_notes: 'terrain data unavailable — review-only' });
    }

    var domain = catalog.classifyUnit(unit || {}).domain;
    var isNaval = domain === 'naval';
    var isGround = domain === 'ground' || domain === 'base';

    var eff = neutral({ terrain_available: true, confidence: 'medium', terrain_notes: '' });

    var notes = [];
    var sea = has(hint, ['sea', 'ocean', 'open-water', 'open water', 'maritime', 'gulf', 'strait']);
    var coast = has(hint, ['coast', 'coastal', 'littoral', 'shore', 'beach', 'amphib']);
    var mountain = has(hint, ['mountain', 'mountainous', 'highland', 'ridge', 'alpine']);
    var urban = has(hint, ['urban', 'city', 'built-up', 'built up', 'town']);
    var desertOpen = has(hint, ['desert', 'open', 'flat', 'plain', 'steppe']);

    if (sea) {
        if (isNaval) { eff.movement_modifier = 1.2; notes.push('open-sea transit favorable for naval movement'); }
        else if (isGround) { eff.movement_modifier = 0.0; eff.route_warning = 'land/ground unit cannot transit open sea — route impossible'; notes.push('sea is impassable for ground forces'); }
        else { eff.movement_modifier = 1.0; notes.push('over-water leg (air/other)'); }
        eff.visibility_modifier = 1.1; eff.los_risk = 'low';
    } else if (coast) {
        if (isNaval) { eff.movement_modifier = 1.1; }
        notes.push('coastal terrain — naval / amphibious approach relevant');
        eff.visibility_modifier = 1.0; eff.los_risk = 'medium';
    } else if (mountain) {
        if (isGround) eff.movement_modifier = 0.6;
        eff.visibility_modifier = 0.7; eff.los_risk = 'high';
        eff.route_warning = 'restricted mountain terrain — slow movement, line-of-sight broken';
        notes.push('mountainous terrain slows ground movement and breaks LOS');
    } else if (urban) {
        if (isGround) eff.movement_modifier = 0.7;
        eff.visibility_modifier = 0.6; eff.los_risk = 'high';
        notes.push('urban terrain — slow movement, strong concealment');
    } else if (desertOpen) {
        eff.movement_modifier = 1.1;
        eff.visibility_modifier = 1.15; eff.los_risk = 'low';
        notes.push('open/desert terrain — favorable maneuver, long sightlines');
    } else {
        notes.push('terrain hint present but unclassified — neutral effect applied');
        eff.confidence = 'low';
    }

    // Naval unit on explicitly land terrain → impossible route.
    if (isNaval && (mountain || urban || (desertOpen && !coast && !sea))) {
        eff.movement_modifier = 0.0;
        eff.route_warning = 'naval unit cannot transit land terrain — route impossible';
        notes.push('naval unit over land is not navigable');
    }

    eff.terrain_notes = notes.join('; ');
    return eff;
}

/**
 * terrainSummary(units, objectives, context) → short honest string.
 * e.g. "coastal / open / terrain unavailable".
 */
function terrainSummary(units, objectives, context) {
    var hint = terrainHint(context);
    if (!hint) return 'terrain unavailable (review-only)';
    var tags = [];
    if (has(hint, ['sea', 'ocean', 'maritime', 'gulf', 'strait'])) tags.push('sea');
    if (has(hint, ['coast', 'coastal', 'littoral', 'shore'])) tags.push('coastal');
    if (has(hint, ['mountain', 'mountainous', 'highland', 'ridge'])) tags.push('mountain');
    if (has(hint, ['urban', 'city', 'built-up', 'town'])) tags.push('urban');
    if (has(hint, ['desert'])) tags.push('desert');
    if (has(hint, ['open', 'flat', 'plain', 'steppe'])) tags.push('open');
    if (!tags.length) return 'terrain hint present but unclassified (review-only)';
    return tags.join(' / ');
}

module.exports = {
    terrainEffect: terrainEffect,
    terrainSummary: terrainSummary,
};
