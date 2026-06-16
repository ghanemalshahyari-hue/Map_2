/**
 * STEP1-AI-LLM-FILL-INTEGRATION-A
 *
 * LLM enrichment stage for Step 1 DOCX analysis.  Called when the
 * deterministic JS-gate (operational-brief.js) extracts nothing useful:
 * zero proposed_units AND zero placement_candidates.
 *
 * Safety contract (inviolable):
 *   • All LLM-derived units carry exact_unit_position:false, needs_review:true
 *   • lat/lon are ALWAYS null — LLM must never invent coordinates
 *   • source_type:'llm_fill' on every output item for UI labelling
 *   • Any item whose side is ambiguous defaults to review_only:true
 *   • If the LLM call fails, the caller falls back to the deterministic result
 *   • This module never mutates the caller's input object in place
 */
'use strict';

var path      = require('path');
var AI        = require(path.join(__dirname, 'ollama-client.js'));
var cfg       = require(path.join(__dirname, 'ai-config.js'));
var MODEL_SELECTION = require(path.join(__dirname, 'model-selection.js')); // RMOOZ-LOCAL-MODEL-SELECTOR-A
var aiJson    = require(path.join(__dirname, 'ai-json.js'));
var aiGuards  = require(path.join(__dirname, 'ai-guardrails.js'));

// ── Weakness detection ───────────────────────────────────────────────
// Returns true when deterministic extraction produced nothing actionable.
// Used by the bridge to decide whether to attempt LLM fill.
function isWeak(det) {
    if (!det || !det.ok) return false;
    var ob  = (det.brief && det.brief.operational_brief) || {};
    var pu  = Array.isArray(ob.proposed_units)      ? ob.proposed_units.length      : 0;
    var pc  = Array.isArray(ob.placement_candidates) ? ob.placement_candidates.length : 0;
    var mis = !ob.mission || ob.mission.trim().length < 5;
    return pu === 0 && pc === 0;
}

// ── Provider availability check ──────────────────────────────────────
// Returns false when no LLM provider is wired (aiProvider=auto with no key).
function providerAvailable() {
    var p = cfg.aiProvider || 'auto';
    if (p === 'ollama') return true;
    if (p === 'claude') return !!(cfg.claude && cfg.claude.apiKey);
    if (p === 'zen')    return !!(cfg.zen    && cfg.zen.apiKey);
    // 'auto': use Ollama (local, no key needed)
    return true;
}

// ── LLM prompt ───────────────────────────────────────────────────────
var SCHEMA_COMMENT = [
    '/* IMPORTANT: output ONLY the JSON object below — no prose, no markdown.',
    '   lat and lon MUST be null always (never invent coordinates).',
    '   source_evidence must be an exact short quote from the document text.',
    '   confidence per item: "high"|"medium"|"low" */',
].join('\n');

var OUTPUT_SCHEMA = [
    '{',
    '  "sides": { "red_name": "...", "blue_name": "..." },',
    '  "mission": "...",',
    '  "units": [',
    '    { "side": "RED|BLUE|NEUTRAL", "platform": "...", "estimated_count": 1,',
    '      "role": "naval|air|land|unknown", "lat": null, "lon": null,',
    '      "confidence": "high|medium|low", "source_evidence": "exact quote" }',
    '  ],',
    '  "bases": [',
    '    { "side": "RED|BLUE", "name": "...", "type": "naval|air|land|unknown",',
    '      "lat": null, "lon": null,',
    '      "confidence": "high|medium|low", "source_evidence": "exact quote" }',
    '  ],',
    '  "objectives": [ "..." ],',
    '  "locations": [ "..." ],',
    '  "assumptions": [ "..." ],',
    '  "uncertainties": [ "..." ],',
    '  "overall_confidence": "high|medium|low"',
    '}',
].join('\n');

function buildPrompt(docTexts) {
    var parts = [
        'You are a military document analyst for the RMOOZ scenario adjudication system.',
        'Extract structured military intelligence from the provided documents.',
        '',
        SCHEMA_COMMENT,
        '',
        'Required output schema:',
        OUTPUT_SCHEMA,
        '',
        '--- DOCUMENTS ---',
    ];
    var slotLabels = { red: 'RED SLOT (enemy / threat forces)', blue: 'BLUE SLOT (friendly / own forces)' };
    docTexts.forEach(function (d) {
        var label = slotLabels[d.slot] || ('SLOT: ' + d.slot);
        parts.push('[' + label + '] filename: ' + (d.filename || '?'));
        parts.push(d.text.slice(0, 3000));
        parts.push('');
    });
    parts.push('--- END DOCUMENTS ---');
    parts.push('');
    parts.push('Output ONLY the JSON object. Start your response with { and end with }.');
    return parts.join('\n');
}

// ── JSON extraction ───────────────────────────────────────────────────
// Delegates to ai-json.js (AI-GLOBAL-REFACTOR-PHASE-1-A).
// Re-exported here so the public API of this module is unchanged.
var extractJson = aiJson.extractJson;

// ── Shape normalization ───────────────────────────────────────────────
// Delegates to ai-guardrails.js (AI-GLOBAL-REFACTOR-PHASE-1-A).
// Re-exported here so the public API of this module is unchanged.
// All safety invariants (exact_unit_position:false, lat/lon:null, etc.)
// are enforced inside ai-guardrails.js — behavior is identical to before.
var normalizeUnit = aiGuards.normalizeUnit;
var normalizeBase = aiGuards.normalizeBase;

// ── Main fill function ───────────────────────────────────────────────
// det  : result of BRIEF.analyzeDocuments(inputs) — NOT mutated
// inputs : [{ slot, filename, bytes?, text? }]  — same list passed to analyzeDocuments
// Returns a Promise that resolves to an enriched payload (same shape as det).
function fill(det, inputs, opts) {
    opts = opts || {};
    var timeout = opts.timeoutMs || 90000;

    // Build doc text list for the prompt
    var docTexts = (inputs || []).map(function (it) {
        var text = it.text || '';
        if (!text && it.bytes) {
            try {
                var docxText = require(path.join(__dirname, 'docx-text.js'));
                text = docxText.extractDocxText(it.bytes) || '';
            } catch (_) {}
        }
        return { slot: it.slot || 'unknown', filename: it.filename || '', text: text };
    }).filter(function (d) { return d.text.length > 10; });

    if (!docTexts.length) {
        return Promise.resolve(mergeFailure(det, 'no readable document text for LLM fill'));
    }

    var prompt = buildPrompt(docTexts);
    var model  = opts.model || MODEL_SELECTION.getSelectedModel(); // RMOOZ-LOCAL-MODEL-SELECTOR-A

    return AI.generate({
        model:    model,
        prompt:   prompt,
        options:  { temperature: 0, num_predict: 3000 },
        timeoutMs: timeout,
    }).then(function (r) {
        if (!r.ok) return mergeFailure(det, 'LLM call failed: ' + (r.error || '?'));

        var parsed = extractJson(r.response || '');
        if (!parsed) return mergeFailure(det, 'LLM returned unparseable JSON');

        return mergeSuccess(det, parsed, model, r.response);
    }).catch(function (e) {
        return mergeFailure(det, 'LLM call threw: ' + (e && e.message || String(e)));
    });
}

// ── Merge helpers ────────────────────────────────────────────────────
function mergeFailure(det, reason) {
    var out = shallowCopy(det);
    out.llm_fill = { available: false, attempted: true, reason: reason };
    return out;
}

function mergeSuccess(det, parsed, model, rawResponse) {
    var out      = shallowCopy(det);
    var ob       = out.brief && out.brief.operational_brief;
    if (!ob) return mergeFailure(det, 'no operational_brief in deterministic result');

    // Shallow-copy ob so we don't mutate the original
    ob = Object.assign({}, ob);
    out.brief = Object.assign({}, out.brief, { operational_brief: ob });

    // Units → proposed_units
    var rawUnits = Array.isArray(parsed.units) ? parsed.units : [];
    var newUnits = rawUnits.map(normalizeUnit);
    ob.proposed_units = (Array.isArray(ob.proposed_units) ? ob.proposed_units : []).concat(newUnits);

    // Bases → placement_candidates
    var rawBases = Array.isArray(parsed.bases) ? parsed.bases : [];
    var newCandidates = rawBases.map(normalizeBase);
    ob.placement_candidates = (Array.isArray(ob.placement_candidates) ? ob.placement_candidates : []).concat(newCandidates);

    // Mission — fill only if empty
    if ((!ob.mission || ob.mission.trim().length < 5) && typeof parsed.mission === 'string' && parsed.mission.trim()) {
        ob.mission = parsed.mission.slice(0, 600);
    }

    // Update understanding mirror
    var u = out.understanding ? Object.assign({}, out.understanding) : {};
    out.understanding = u;

    // Merge side names if present
    if (parsed.sides) {
        if (parsed.sides.red_name && !u.red_side_name) u.red_side_name = String(parsed.sides.red_name).slice(0, 80);
        if (parsed.sides.blue_name && !u.blue_side_name) u.blue_side_name = String(parsed.sides.blue_name).slice(0, 80);
    }
    if (!u.mission && ob.mission) u.mission = ob.mission;

    // Merge ambiguities with LLM uncertainties
    var ambig = Array.isArray(u.ambiguities) ? u.ambiguities.slice() : [];
    (Array.isArray(parsed.uncertainties) ? parsed.uncertainties : []).forEach(function (s) {
        if (typeof s === 'string' && s.trim()) ambig.push('[AI uncertainty] ' + s.trim().slice(0, 200));
    });
    u.ambiguities = ambig;

    // Update proposed_unit_counts
    var counts = { red: 0, blue: 0, neutral: 0 };
    ob.proposed_units.forEach(function (pu) {
        var side = String(pu.side || '').toUpperCase();
        if (side === 'RED') counts.red++;
        else if (side === 'BLUE') counts.blue++;
        else counts.neutral++;
    });
    u.proposed_unit_counts = counts;

    // Add LLM-extracted objectives
    var objs = Array.isArray(u.objectives) ? u.objectives.slice() : [];
    (Array.isArray(parsed.objectives) ? parsed.objectives : []).forEach(function (s) {
        if (typeof s === 'string' && s.trim()) objs.push({ name: s.trim().slice(0, 80), source: 'llm_fill' });
    });
    u.objectives = objs;

    out.llm_fill = {
        available:     true,
        model:         model,
        units_added:   newUnits.length,
        bases_added:   newCandidates.length,
        overall_confidence: parsed.overall_confidence || 'low',
        // Preserve a truncated sample of the raw response for debugging
        raw_sample:    (rawResponse || '').slice(0, 400),
    };

    return out;
}

function shallowCopy(det) {
    return Object.assign({}, det);
}

module.exports = { isWeak, fill, providerAvailable, buildPrompt, normalizeUnit, normalizeBase, extractJson };
