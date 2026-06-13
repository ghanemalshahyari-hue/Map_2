'use strict';

const aiProvider = require('./ai-provider');

const ALLOWED_CONFIDENCE = new Set(['low', 'medium', 'high']);
const ALLOWED_REACTIONS = new Set(['intercept', 'defend_objective', 'screen', 'hold']);
const FORBIDDEN_TEXT = /\b(weapon|weapons|missile|munition|fire mission|strike package|damage|destroy|kill|casualt|attrition|pk|probability of kill|white adjudication|final tasking|final coa|order|orders|execute|commit|world[- ]state|persist|write)\b/i;

function arr(v) { return Array.isArray(v) ? v : []; }
function finiteNumber(v) { return Number.isFinite(Number(v)); }
function sideOf(g) { return String((g && g.side) || '').toUpperCase(); }
function compactText(v, max) {
    const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    return s.slice(0, max || 400);
}
function safeWarnings(v) {
    return arr(v).map(x => compactText(x, 160)).filter(Boolean).slice(0, 8);
}
function groupSummary(g) {
    return {
        demo_group_id: g.id,
        side: sideOf(g),
        country: g.country || null,
        source_base: g.base_name_en || g.base_name_ar || null,
        platform_categories: Object.keys(g.category_counts || {}).filter(k => (g.category_counts || {})[k] > 0).slice(0, 8),
    };
}
function anchorSummary(groups) {
    const bases = new Set();
    arr(groups).forEach(g => {
        const name = g && (g.base_name_en || g.base_name_ar);
        if (name) bases.add(name);
    });
    return Array.from(bases).slice(0, 30);
}
function categorySummary(groups) {
    const cats = new Set();
    arr(groups).forEach(g => Object.keys((g && g.category_counts) || {}).forEach(k => cats.add(k)));
    return Array.from(cats).slice(0, 30);
}
function terrainSummary(body) {
    const t = body && body.terrain;
    if (!t || !t.available) return 'terrain unavailable; geometric demo movement only';
    return 'terrain available for route review; use only qualitative route summaries';
}
function buildLlmInput(body) {
    const groups = arr(body && body.groups);
    const objective = body && body.objective ? {
        name: 'Objective X',
        lat_present: finiteNumber(body.objective.lat),
        lon_present: finiteNumber(body.objective.lon),
    } : { name: 'Objective X', lat_present: false, lon_present: false };
    return {
        objective,
        red_groups: groups.filter(g => sideOf(g) === 'RED').map(groupSummary),
        blue_groups: groups.filter(g => sideOf(g) === 'BLUE').map(groupSummary),
        anchors: anchorSummary(groups),
        platform_categories: categorySummary(groups),
        terrain_summary: terrainSummary(body),
        missing_information: arr(body && body.missing_information).map(x => compactText(x, 120)).filter(Boolean).slice(0, 12),
        constraints: [
            'demo_only',
            'review_only',
            'no_weapons',
            'no_damage',
            'no_final_tasking',
            'requires_commander_approval',
        ],
    };
}

function parseJsonResponse(text) {
    const raw = String(text || '').trim();
    if (!raw) throw new Error('empty_llm_response');
    try { return JSON.parse(raw); } catch (_) {}
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error('invalid_json');
}

function assertNoForbiddenText(value, path, errors) {
    if (value == null) return;
    if (typeof value === 'string') {
        if (FORBIDDEN_TEXT.test(value)) errors.push(path + ': forbidden operational/effects language');
        if (/\b-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}\b/.test(value)) errors.push(path + ': exact coordinate-like text');
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((x, i) => assertNoForbiddenText(x, path + '[' + i + ']', errors));
        return;
    }
    if (typeof value === 'object') {
        Object.keys(value).forEach(k => {
            if (/weapon|damage|kill|effect|order|tasking|world|unit_position|lat|lon|lng/i.test(k)) {
                if (!/intercept_or_defend_location/i.test(k) && !/intercept_or_defend_location\.(lat|lon)$/i.test(path + '.' + k)) errors.push(path + '.' + k + ': forbidden field');
            }
            assertNoForbiddenText(value[k], path + '.' + k, errors);
        });
    }
}

function validateAndSanitize(plan, groups) {
    const errors = [];
    const byId = new Map(arr(groups).map(g => [String(g.id), g]));
    if (!plan || typeof plan !== 'object') errors.push('plan is not an object');
    if (plan && plan.ok !== true) errors.push('ok must be true');
    if (plan && plan.planner !== 'llm_advisory') errors.push('planner must be llm_advisory');
    if (plan && !ALLOWED_CONFIDENCE.has(plan.confidence)) errors.push('top-level confidence must be low|medium|high');
    assertNoForbiddenText(plan, 'plan', errors);

    function cleanCommon(e, expectedSide, idx, label) {
        const id = String(e && e.demo_group_id || '');
        const g = byId.get(id);
        if (!id || !g) errors.push(label + '[' + idx + ']: demo_group_id does not exist');
        if (g && sideOf(g) !== expectedSide) errors.push(label + '[' + idx + ']: side mismatch');
        if (!ALLOWED_CONFIDENCE.has(e && e.confidence)) errors.push(label + '[' + idx + ']: confidence invalid');
        return {
            demo_group_id: id,
            country: g ? (g.country || null) : null,
            source_base: g ? (g.base_name_en || g.base_name_ar || null) : null,
            reason: compactText(e && e.reason, 500),
            route_summary: compactText(e && e.route_summary, 240),
            confidence: ALLOWED_CONFIDENCE.has(e && e.confidence) ? e.confidence : 'low',
            warnings: safeWarnings(e && e.warnings),
            demo_only: true,
            review_only: true,
            needs_review: true,
            requires_commander_approval: true,
            exact_unit_position: false,
        };
    }

    const red = arr(plan && plan.red_attack_plan).slice(0, 3).map((e, i) => cleanCommon(e, 'RED', i, 'red_attack_plan'));
    const blue = arr(plan && plan.blue_reaction_plan).slice(0, 3).map((e, i) => {
        const out = cleanCommon(e, 'BLUE', i, 'blue_reaction_plan');
        const rt = e && e.reaction_type;
        if (!ALLOWED_REACTIONS.has(rt)) errors.push('blue_reaction_plan[' + i + ']: reaction_type invalid');
        out.reaction_type = ALLOWED_REACTIONS.has(rt) ? rt : 'hold';
        const loc = e && e.intercept_or_defend_location;
        if (!loc || !finiteNumber(loc.lat) || !finiteNumber(loc.lon)) {
            errors.push('blue_reaction_plan[' + i + ']: intercept_or_defend_location invalid');
            out.intercept_or_defend_location = null;
        } else {
            out.intercept_or_defend_location = {
                lat: Math.round(Number(loc.lat) * 1e5) / 1e5,
                lon: Math.round(Number(loc.lon) * 1e5) / 1e5,
            };
        }
        return out;
    });

    if (errors.length) return { ok: false, errors };
    return {
        ok: true,
        planner: 'llm_advisory',
        red_attack_plan: red,
        blue_reaction_plan: blue,
        warnings: safeWarnings(plan.warnings),
        missing_information: safeWarnings(plan.missing_information),
        confidence: plan.confidence,
        validation: {
            ok: true,
            result: 'accepted',
            constraints_enforced: [
                'existing_demo_group_ids_only',
                'side_match',
                'allowed_reaction_type',
                'allowed_confidence',
                'no_new_units',
                'no_new_bases',
                'no_weapons_effects_damage',
                'no_tasking_orders',
                'no_world_state_mutation',
            ],
        },
        advisory_only: true,
    };
}

async function createPlan(body) {
    if (process.env.RMOOZ_FREE_FIGHT_LLM !== '1') {
        return { status: 200, payload: { ok: false, reason: 'llm_disabled' } };
    }
    const llmInput = buildLlmInput(body || {});
    const system = [
        'You produce advisory JSON for a RMOOZ Free Fight demo.',
        'Return only JSON matching the requested schema.',
        'Do not create units, bases, weapons, damage, effects, final tasking, final COA, orders, adjudication, or world-state writes.',
        'Use only supplied demo_group_id values and keep this review-only.',
    ].join(' ');
    const prompt = JSON.stringify({
        input: llmInput,
        output_schema: {
            ok: true,
            planner: 'llm_advisory',
            red_attack_plan: [{ demo_group_id: 'string', reason: 'string', route_summary: 'string', confidence: 'low|medium|high', warnings: [] }],
            blue_reaction_plan: [{ demo_group_id: 'string', reaction_type: 'intercept|defend_objective|screen|hold', intercept_or_defend_location: { lat: 0, lon: 0 }, reason: 'string', route_summary: 'string', confidence: 'low|medium|high', warnings: [] }],
            warnings: [],
            missing_information: [],
            confidence: 'low|medium|high',
        },
    });
    const timeoutMs = Number.parseInt(process.env.RMOOZ_FREE_FIGHT_LLM_TIMEOUT_MS || process.env.RMOOZ_AI_TIMEOUT_MS || process.env.RMOOZ_OLLAMA_TIMEOUT_MS || '30000', 10);
    const result = await aiProvider.generate({
        provider: process.env.RMOOZ_FREE_FIGHT_LLM_PROVIDER || process.env.RMOOZ_AI_PROVIDER || 'auto',
        model: process.env.RMOOZ_FREE_FIGHT_LLM_MODEL || process.env.RMOOZ_AI_MODEL || process.env.RMOOZ_OLLAMA_MODEL,
        system,
        prompt,
        format: 'json',
        options: { temperature: 0.1, numPredict: 1400 },
        timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 30000,
    });
    if (!result || !result.ok) {
        return { status: 200, payload: { ok: false, reason: 'llm_unavailable', error: result && result.error ? String(result.error).slice(0, 240) : 'unknown' } };
    }
    let parsed;
    try { parsed = parseJsonResponse(result.response); }
    catch (e) { return { status: 200, payload: { ok: false, reason: 'invalid_json', error: e.message || String(e) } }; }
    const validated = validateAndSanitize(parsed, arr(body && body.groups));
    if (!validated.ok) return { status: 200, payload: { ok: false, reason: 'validation_failed', validation: { ok: false, errors: validated.errors } } };
    return { status: 200, payload: Object.assign(validated, { provider_used: result.providerUsed || null }) };
}

module.exports = {
    createPlan,
    buildLlmInput,
    parseJsonResponse,
    validateAndSanitize,
    _internals: { ALLOWED_CONFIDENCE, ALLOWED_REACTIONS, FORBIDDEN_TEXT },
};
