/* ============================================================================
 * brief-to-scenario-v2.js — Batch B Slice 9: brief-to-draft AI generation
 * ----------------------------------------------------------------------------
 * NOT a replacement of the retired ai/brief-to-scenario.js (frozen — never
 * touch it, see test-retire-legacy-brief-scenario-generator-main-batch-1.js).
 * This is a NEW module that:
 *   - reuses step1-llm-fill.js's LLM-calling machinery (local-only by
 *     construction — it always calls ollama-client.js, never a remote
 *     provider) instead of re-implementing a brief-parsing prompt
 *   - runs a repair loop (LLM_CFG.getRepairAttempts(), default 1 retry)
 *     before falling back to a deterministic, honest, ZERO-unit skeleton
 *     draft — never fabricates units when the LLM is unavailable/fails
 *   - stamps every generated unit needs_review:true / exact_unit_position:
 *     false / review_only:true (locked by ai-guardrails.js's normalizeUnit,
 *     not overridable here) so it is non-taskable under the existing
 *     unit-taskability.js gate until an operator verifies it
 *   - converts the intermediate LLM-fill output into the EXACT canonical
 *     scenario schema shape, then runs it through the real
 *     scenario-normalizer.js + scenario-validator.js
 *   - NEVER writes to disk, NEVER activates a scenario — returns a draft
 *     object only; the caller (an authenticated HTTP endpoint) hands it
 *     straight back to the operator's Edit Mode workspace
 * ========================================================================== */
'use strict';

var path = require('path');
var STEP1_FILL = require(path.join(__dirname, 'step1-llm-fill.js'));
var LLM_CFG = require(path.join(__dirname, 'llm-runtime-config.js'));
var NORMALIZER = require(path.join(__dirname, 'scenario-normalizer.js'));
var VALIDATOR = require(path.join(__dirname, 'scenario-validator.js'));

var VERSION = 'brief-to-scenario-v2-1';
var MIN_BRIEF_LENGTH = 10;

function isFiniteNum(n) { return typeof n === 'number' && isFinite(n); }
function clampNum(v, fallback) { return isFiniteNum(Number(v)) ? Number(v) : fallback; }

function defaultPhaseTable() {
    return [
        { index: 0, time_label: 'H-3',   elapsed_hours: -3,  phase: 'PRE-H' },
        { index: 1, time_label: 'H+0',   elapsed_hours: 0,   phase: 'PHASE 1' },
        { index: 2, time_label: 'H+12',  elapsed_hours: 12,  phase: 'PHASE 2A' },
        { index: 3, time_label: 'H+36',  elapsed_hours: 36,  phase: 'PHASE 2B' },
        { index: 4, time_label: 'H+72',  elapsed_hours: 72,  phase: 'PHASE 3' },
        { index: 5, time_label: 'H+120', elapsed_hours: 120, phase: 'RESOLUTION' }
    ];
}

/* A minimal, honest, deterministic scenario skeleton — no invented units,
 * no invented geography beyond a small default box around the given (or
 * default 0,0) center point. Every generated unit later fills the same
 * placeholder coordinate — real placement is explicitly left to the
 * operator (exact_unit_position:false is the truthful signal for this). */
function skeletonDraft(seed) {
    seed = seed || {};
    var lon = clampNum(seed.center_lon, 0);
    var lat = clampNum(seed.center_lat, 0);
    var center = [lon, lat];
    var phaseTable = defaultPhaseTable();
    return {
        name: String(seed.name || 'ai-draft-scenario').slice(0, 80),
        scenario_label: String(seed.scenario_label || 'AI-Generated Draft (needs review)').slice(0, 200),
        map_bbox: [lon - 0.5, lat - 0.5, lon + 0.5, lat + 0.5],
        obj: { name: 'Objective (draft — needs review)', coord: center, target_depth_km: 0, carver: 0 },
        pipeline: [center.slice(), [lon + 0.01, lat + 0.01]],
        bls_template: [{ name: 'AO-CENTER', coord: center.slice() }],
        red_units: [],
        blue_units_initial: [],
        blue_units_base_ids: [],
        neutral_units: [],
        phase_table: phaseTable,
        steps: phaseTable.map(function (p) { return Object.assign({}, p); }),
        generated_from_brief_v2: true,
        commander_review_status: 'needs_review'
    };
}

/* ai-guardrails.js::normalizeUnit already stamped side/platform/role/
 * confidence/source_evidence/needs_review/exact_unit_position/review_only —
 * this only maps that shape onto the canonical red_units/blue_units_initial/
 * neutral_units item shape the schema requires (uid|unit_uid, label, bls|
 * base_id, appear, role, coord). Coordinates are always the placeholder
 * center — never invented per-unit, matching the AI/sim boundary rule. */
function toRedEntry(u, idx, center) {
    return {
        uid: 'RED-' + (idx + 1), label: u.platform, bls: 'AO-CENTER', appear: 0,
        role: u.role || 'unknown', coord: center.slice(),
        needs_review: true, exact_unit_position: false, review_only: true,
        estimated_count: u.estimated_count, confidence: u.confidence,
        source_evidence: u.source_evidence, source_type: u.source_type
    };
}
function toBlueEntry(u, idx, center) {
    return {
        unit_uid: 'BLUE-' + (idx + 1), base_id: 'AO-CENTER', coord: center.slice(),
        label: u.platform, role: u.role || 'unknown',
        needs_review: true, exact_unit_position: false, review_only: true,
        estimated_count: u.estimated_count, confidence: u.confidence,
        source_evidence: u.source_evidence, source_type: u.source_type
    };
}
function toNeutralEntry(u, idx, center) {
    return {
        uid: 'NEUTRAL-' + (idx + 1), label: u.platform, coord: center.slice(),
        role: u.role || 'unknown',
        needs_review: true, exact_unit_position: false, review_only: true,
        estimated_count: u.estimated_count, confidence: u.confidence,
        source_evidence: u.source_evidence, source_type: u.source_type
    };
}

function applyProposedUnits(draft, proposedUnits, center) {
    (proposedUnits || []).forEach(function (u) {
        var side = String((u && u.side) || 'NEUTRAL').toUpperCase();
        if (side === 'RED') draft.red_units.push(toRedEntry(u, draft.red_units.length, center));
        else if (side === 'BLUE') draft.blue_units_initial.push(toBlueEntry(u, draft.blue_units_initial.length, center));
        else draft.neutral_units.push(toNeutralEntry(u, draft.neutral_units.length, center));
    });
    draft.blue_units_base_ids = draft.blue_units_initial.map(function () { return 'AO-CENTER'; });
    if (!draft.neutral_units.length) delete draft.neutral_units; // optional field — omit when empty
}

/* One repair-budget attempt beyond the first, mirroring the free-fight-
 * coa-planner.js repair-loop shape: retry once on a failed/unparseable LLM
 * call, then accept whatever the last attempt produced (which may itself be
 * a clean "no units extracted" result — that's a valid, honest outcome, not
 * a failure). Never retries indefinitely. */
function fillWithRepair(det, inputs, opts) {
    var maxAttempts = 1 + Math.max(0, LLM_CFG.getRepairAttempts());
    var fillFn = (opts && typeof opts.fillFn === 'function') ? opts.fillFn : STEP1_FILL.fill;
    var attempt = 0;
    function tryOnce(lastResult) {
        attempt += 1;
        if (lastResult && lastResult.llm_fill && lastResult.llm_fill.available === true) return Promise.resolve(lastResult);
        if (attempt > maxAttempts) return Promise.resolve(lastResult || det);
        return fillFn(det, inputs, opts).then(function (result) {
            if (result.llm_fill && result.llm_fill.available === true) return result;
            if (attempt >= maxAttempts) return result;
            return tryOnce(result);
        });
    }
    return tryOnce(null).then(function (result) { return { result: result, attempts: attempt }; });
}

/**
 * generateScenarioDraftFromBrief(input) -> Promise<{ok, scenario, validation, ai_status}>
 * input: { brief_text (required), name?, scenario_label?, center_lon?, center_lat? }
 * Never writes to disk. Never activates a scenario. Pure orchestration.
 */
function generateScenarioDraftFromBrief(input) {
    input = input || {};
    var briefText = typeof input.brief_text === 'string' ? input.brief_text.trim() : '';
    if (briefText.length < MIN_BRIEF_LENGTH) {
        return Promise.resolve({ ok: false, error: 'brief_text is required (min ' + MIN_BRIEF_LENGTH + ' chars)' });
    }

    var draft = skeletonDraft(input);
    var center = draft.obj.coord;
    var det = { ok: true, brief: { operational_brief: { proposed_units: [], placement_candidates: [], mission: '' } }, understanding: {} };
    var inputsForFill = [{ slot: 'combined', filename: 'brief.txt', text: briefText }];
    var timeoutMs = input.timeout_ms || LLM_CFG.getTimeoutMs('plan');

    return fillWithRepair(det, inputsForFill, { timeoutMs: timeoutMs, model: input.model, fillFn: input.fillFn }).then(function (filled) {
        var result = filled.result;
        var ob = (result && result.brief && result.brief.operational_brief) || {};
        applyProposedUnits(draft, ob.proposed_units, center);
        if (ob.mission) draft.scenario_label = draft.scenario_label + ' — ' + String(ob.mission).slice(0, 120);

        var clone = JSON.parse(JSON.stringify(draft));
        var normReport = NORMALIZER.normalizeScenario(clone);
        var validation = VALIDATOR.validateScenario(clone);

        return {
            ok: true,
            version: VERSION,
            scenario: clone,
            validation: validation,
            normalize_report: normReport && normReport.report,
            ai_status: {
                llm_available: !!(result && result.llm_fill && result.llm_fill.available),
                reason: result && result.llm_fill && result.llm_fill.reason,
                attempts: filled.attempts,
                units_added: (draft.red_units.length + draft.blue_units_initial.length + (draft.neutral_units || []).length),
                model: result && result.llm_fill && result.llm_fill.model
            }
        };
    });
}

module.exports = {
    VERSION: VERSION,
    generateScenarioDraftFromBrief: generateScenarioDraftFromBrief,
    skeletonDraft: skeletonDraft,
    applyProposedUnits: applyProposedUnits,
    toRedEntry: toRedEntry,
    toBlueEntry: toBlueEntry,
    toNeutralEntry: toNeutralEntry
};
