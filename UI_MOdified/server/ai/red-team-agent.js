/**
 * Red Team agent (Chunk 09 from wargame-vision.html).
 *
 * Pipeline: client → /api/ai/red-team/propose with a snapshot →
 *   1. extract Blue & Red unit lists from the snapshot
 *   2. build a compact battlefield text for the LLM
 *   3. ask Ollama (format: 'json') for action proposals
 *   4. validate each proposed action against game rules
 *   5. return both raw + validated to the client so the operator can decide
 *
 * The LLM never sees the full GeoJSON — we summarise to keep tokens low
 * and to stop the model from inventing geometry it can't see.
 */

const fs       = require('fs');
const path     = require('path');
const ollama   = require('./ollama-client');

// Two prompts so the same pipeline plays either side — الفعل ورد الفعل.
// The schemas are identical; only the perspective ("you command Red" vs
// "you command Blue") and operational principles differ.
const PROMPTS = {
    red:  fs.readFileSync(path.join(__dirname, 'prompts', 'red-team-system.txt'),  'utf8').trim(),
    blue: fs.readFileSync(path.join(__dirname, 'prompts', 'blue-team-system.txt'), 'utf8').trim(),
};
const SYSTEM_PROMPT = PROMPTS.red; // legacy alias for any external import

// Game rules — kept here (not in the prompt) so validation can run even
// when the LLM forgets or contradicts the doctrine.
const MAX_MOVE_KM   = 30;
const MAX_ENGAGE_KM = 30;

// ── Geo helpers ─────────────────────────────────────────────────────────
function haversineKm(a, b) {
    const R = 6371;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const la1  = toRad(a.lat);
    const la2  = toRad(b.lat);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

// ── Snapshot extraction ─────────────────────────────────────────────────
// captureSnapshot() returns the FeatureCollection produced by io.js.
// Each unit feature carries a SIDC string in properties; position 3 of
// the SIDC encodes affiliation (3=friendly, 6=hostile, 4=neutral, 1=unknown).
function affiliationOf(sidc) {
    if (typeof sidc !== 'string' || sidc.length < 4) return null;
    const d = sidc[3];
    if (d === '3') return 'friendly';
    if (d === '6') return 'hostile';
    if (d === '4') return 'neutral';
    if (d === '1') return 'unknown';
    return null;
}

function extractUnits(snapshot) {
    let collection = snapshot;
    if (typeof snapshot === 'string') {
        try { collection = JSON.parse(snapshot); } catch { return { friendly: [], hostile: [], skipped: 0 }; }
    }
    const features = (collection && Array.isArray(collection.features)) ? collection.features : [];
    const friendly = [], hostile = [];
    let skipped = 0;
    for (const f of features) {
        const props = f && f.properties || {};
        const sidc  = props.sidc || props.SIDC || props._sidc || null;
        const side  = affiliationOf(sidc);
        if (!side) { skipped++; continue; }
        if (side !== 'friendly' && side !== 'hostile') { skipped++; continue; }
        // Only points have an actionable location.
        const geom = f.geometry;
        if (!geom || geom.type !== 'Point' || !Array.isArray(geom.coordinates)) { skipped++; continue; }
        const [lng, lat] = geom.coordinates;
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) { skipped++; continue; }
        const u = {
            id:   props.id || props.code || props.name || `u-${friendly.length + hostile.length}`,
            name: props.name || props.code || '(unnamed)',
            sidc: sidc,
            lng, lat,
        };
        (side === 'hostile' ? hostile : friendly).push(u);
    }
    return { friendly, hostile, skipped };
}

// ── Prompt assembly ─────────────────────────────────────────────────────
// `side` controls which side the AI commands: 'red' = adversary (default),
// 'blue' = friendly counter-react. The other side is the opponent we react
// against. Action counts scale with the commanding side's force size.
// Render the active COA (Course of Action) as a prompt block so Blue's
// per-step actions advance the commander's chosen plan. Red sees nothing
// here — Red doesn't know Blue's plan. Empty coaContext → empty string.
function formatCoaContext(coaContext) {
    if (!coaContext || typeof coaContext !== 'object') return '';
    const c = coaContext;
    const phases = Array.isArray(c.plan) ? c.plan : [];
    const phasesBlock = phases.length
        ? phases.map((p, i) => `  ${i + 1}. ${p}`).join('\n')
        : '  (no explicit phases)';
    const assumptions = Array.isArray(c.key_assumptions) && c.key_assumptions.length
        ? `Key assumptions: ${c.key_assumptions.join(' · ')}\n`
        : '';
    return [
        '',
        '=== ACTIVE COMMANDER\'S PLAN (Blue side) ===',
        `Plan name: ${c.name || '(unnamed)'}`,
        `Risk: ${c.risk_tier || '?'}    ETA: ${c.eta_hours != null ? c.eta_hours + 'h' : '?'}    Blue p50 casualties: ${c.blue_casualty_p50 != null ? c.blue_casualty_p50 : '?'}`,
        c.rationale ? `Rationale: ${c.rationale}` : '',
        '',
        'Plan phases (execute in order across the 11-turn engagement):',
        phasesBlock,
        '',
        assumptions,
        'Choose Blue actions THIS TURN that advance the current phase of this plan.',
        'Pick whichever plan phase best matches the current turn number and battlefield state.',
        '=== END PLAN ===',
        '',
    ].filter(Boolean).join('\n');
}

function buildUserPrompt({ turn, friendly, hostile, trimmedFriendly, trimmedHostile, side, coaContext }) {
    const fmtUnit = u => `  - ${u.id}  (${u.name})  at [${u.lng.toFixed(4)}, ${u.lat.toFixed(4)}]`;
    const blueBlock = friendly.length ? friendly.map(fmtUnit).join('\n') : '  (none)';
    const redBlock  = hostile.length  ? hostile.map(fmtUnit).join('\n')  : '  (none)';
    const trimNote = (trimmedFriendly || trimmedHostile)
        ? `\nNote: only the units nearest the contact line are listed${
            trimmedFriendly ? ` (${trimmedFriendly} more friendly in rear)` : ''
          }${
            trimmedHostile  ? ` (${trimmedHostile} more hostile in rear)` : ''
          }.`
        : '';
    const isBlue = side === 'blue';
    const commanded = isBlue ? friendly : hostile;
    const want = commanded.length <= 3 ? '1' : commanded.length <= 8 ? '2-4' : '4-7';
    const sideLabel = isBlue ? 'Blue' : 'Red';
    // Only Blue sees the COA — Red is the opposing force, plans aren't shared.
    const coaBlock = isBlue ? formatCoaContext(coaContext) : '';
    return [
        `Current turn: ${turn || 0}`,
        trimNote,
        '',
        isBlue ? 'Friendly (Blue) units — you command these:' : 'Friendly (Blue) units:',
        blueBlock,
        '',
        isBlue ? 'Hostile (Red) units:' : 'Hostile (Red) units — you command these:',
        redBlock,
        coaBlock,
        `Propose ${want} reactive actions for the ${sideLabel} units. Respond with the JSON schema only.`,
    ].join('\n');
}

// ── Output sanitisation ────────────────────────────────────────────────
// Reasoning models often produce JSON cleanly but occasionally wrap it in
// a ```json fence or prefix a single sentence. Grab the first {...} blob
// using a brace counter so embedded braces in strings don't fool us.
function extractJson(s) {
    if (typeof s !== 'string') return '{}';
    const start = s.indexOf('{');
    if (start === -1) return '{}';
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
        const ch = s[i];
        if (inStr) {
            if (esc) { esc = false; continue; }
            if (ch === '\\') { esc = true; continue; }
            if (ch === '"') inStr = false;
            continue;
        }
        if (ch === '"') { inStr = true; continue; }
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return s.slice(start, i + 1);
        }
    }
    return s.slice(start); // unbalanced — let JSON.parse report the error
}

// ── Validation ──────────────────────────────────────────────────────────
// Side-aware: ownIndex = units the AI commands; oppIndex = the opponent.
// Same rules regardless of side, just different sources for who attacks whom.
function validateAction(act, ownIndex, oppIndex, ownLabel, oppLabel) {
    const errors = [];
    if (!act || typeof act !== 'object') return { ok: false, errors: ['not an object'] };
    const type = String(act.type || '').toUpperCase();
    if (!['MOVE', 'ENGAGE', 'HOLD'].includes(type)) errors.push(`unknown type "${act.type}"`);
    const own = ownIndex.get(act.unitId);
    if (!own) errors.push(`unitId "${act.unitId}" is not a ${ownLabel} unit in this snapshot`);

    if (type === 'MOVE') {
        if (!Array.isArray(act.to) || act.to.length !== 2
            || !Number.isFinite(act.to[0]) || !Number.isFinite(act.to[1])) {
            errors.push('move requires "to": [lng, lat]');
        } else if (own) {
            const dist = haversineKm({ lat: own.lat, lng: own.lng }, { lat: act.to[1], lng: act.to[0] });
            if (dist > MAX_MOVE_KM) errors.push(`move distance ${dist.toFixed(1)} km exceeds ${MAX_MOVE_KM} km`);
        }
    }
    if (type === 'ENGAGE') {
        if (!act.target) errors.push('engage requires "target"');
        else {
            const opp = oppIndex.get(act.target);
            if (!opp) errors.push(`target "${act.target}" is not a ${oppLabel} unit in this snapshot`);
            else if (own) {
                const dist = haversineKm({ lat: own.lat, lng: own.lng }, { lat: opp.lat, lng: opp.lng });
                if (dist > MAX_ENGAGE_KM) errors.push(`engage range ${dist.toFixed(1)} km exceeds ${MAX_ENGAGE_KM} km`);
            }
        }
    }
    return { ok: errors.length === 0, errors };
}

// Accept a pre-built unit list from the client. This is the path the
// browser actually uses: placed units live in AppUnitsMap (not in the
// drawing-layers snapshot) so the client sends them straight through.
function unitsFromList(units) {
    const friendly = [], hostile = [];
    let skipped = 0;
    if (!Array.isArray(units)) return { friendly, hostile, skipped };
    for (const u of units) {
        if (!u) { skipped++; continue; }
        const lat = u.lat, lng = u.lng;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) { skipped++; continue; }
        // Prefer the explicit `side` field; fall back to SIDC identity digit
        // for units that haven't been classified yet.
        let side = u.side;
        if (side !== 'friendly' && side !== 'hostile') side = affiliationOf(u.sidc);
        if (side !== 'friendly' && side !== 'hostile') { skipped++; continue; }
        const out = {
            id:   u.id || u.code || u.name || `u-${friendly.length + hostile.length}`,
            name: u.name || u.code || '(unnamed)',
            sidc: u.sidc || null,
            lng, lat,
        };
        (side === 'hostile' ? hostile : friendly).push(out);
    }
    return { friendly, hostile, skipped };
}

// Pick the N units on `side` closest to the opposing-side centroid.
// Tactical relevance proxy: units near the contact line drive what Red
// should do this turn. Far-rear units stay implicit ("plus M more").
function pickRelevant(units, opposingCentroid, maxN) {
    if (!opposingCentroid || units.length <= maxN) return { picked: units, rest: 0 };
    const scored = units.map(u => ({
        u,
        d: haversineKm({ lat: u.lat, lng: u.lng }, opposingCentroid),
    }));
    scored.sort((a, b) => a.d - b.d);
    return {
        picked: scored.slice(0, maxN).map(s => s.u),
        rest:   scored.length - maxN,
    };
}
function centroid(units) {
    if (!units.length) return null;
    let lat = 0, lng = 0;
    for (const u of units) { lat += u.lat; lng += u.lng; }
    return { lat: lat / units.length, lng: lng / units.length };
}

// ── Public entry point ─────────────────────────────────────────────────
// Per-side cap on units sent to the LLM. Measured: gpt-oss:20b runs at
// ~24 tok/s locally. To keep responses under ~120 s we cap num_predict to
// ~2500 and the prompt stays tight. 8 + 8 is the sweet spot for the
// token/time budget on this hardware.
const MAX_UNITS_PER_SIDE = 8;

async function propose({ snapshot, units, turn, model, timeoutMs, side, coaContext }) {
    // Normalise side: default red (legacy callers). Blue path is the new
    // counter-react direction the operator invokes after a Red move.
    // coaContext is honoured only on the Blue side (the side that chose
    // the plan). Red AI ignores it — Red doesn't know Blue's plan.
    const playSide = side === 'blue' ? 'blue' : 'red';
    // Prefer a pre-built units list (what the browser actually sends);
    // fall back to extracting from a GeoJSON snapshot for API users
    // calling the endpoint directly (tests, CLI tools).
    const all = Array.isArray(units) && units.length
        ? unitsFromList(units)
        : extractUnits(snapshot);
    const { skipped } = all;
    // Proximity filter: trim each side down to the units closest to the
    // opposing centroid so the LLM reasons about contact-line geometry,
    // not the 30 rear-area markers that won't move this turn anyway.
    const friendlyCent = centroid(all.friendly);
    const hostileCent  = centroid(all.hostile);
    const fp = pickRelevant(all.friendly, hostileCent,  MAX_UNITS_PER_SIDE);
    const hp = pickRelevant(all.hostile,  friendlyCent, MAX_UNITS_PER_SIDE);
    const friendly = fp.picked;
    const hostile  = hp.picked;
    const trimmedFriendly = fp.rest;
    const trimmedHostile  = hp.rest;
    const commanded = playSide === 'blue' ? friendly : hostile;
    if (commanded.length === 0) {
        return {
            ok: true,
            empty: true,
            reason: playSide === 'blue'
                ? 'No friendly units on the battlefield — nothing for Blue to do.'
                : 'No hostile units on the battlefield — nothing for Red to do.',
            counts: { friendly: all.friendly.length, hostile: all.hostile.length, skipped },
            side: playSide,
        };
    }

    const userPrompt = buildUserPrompt({ turn, friendly, hostile, trimmedFriendly, trimmedHostile, side: playSide, coaContext });
    const llm = await ollama.generate({
        model,
        system:  PROMPTS[playSide],
        prompt:  userPrompt,
        // Deliberately NOT setting Ollama's `format:'json'`. For reasoning
        // models like gpt-oss it routes visible output into a hidden
        // "thinking" channel and the `response` field comes back empty.
        // The system prompt already commits the model to raw JSON; we
        // strip code-fence noise defensively below.
        // Budget: gpt-oss:20b at ~24 tok/s × 2500 ≈ 100 s. Leaves room under
        // the 150 s timeout. Lower temp = less rambling reasoning.
        options: { num_predict: 2500, temperature: 0.2 },
        timeoutMs: timeoutMs || 150_000,
    });

    if (!llm.ok) {
        return { ok: false, error: llm.error || 'LLM call failed', counts: { friendly: friendly.length, hostile: hostile.length, skipped } };
    }

    const cleaned = extractJson(llm.response || '');
    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch (e) {
        return { ok: false, error: 'Model did not return valid JSON: ' + e.message, raw: llm.response, counts: { friendly: friendly.length, hostile: hostile.length, skipped } };
    }
    const rawActions = Array.isArray(parsed.actions) ? parsed.actions : [];

    const redIndex  = new Map(hostile.map(u => [u.id, u]));
    const blueIndex = new Map(friendly.map(u => [u.id, u]));
    const ownIndex = playSide === 'blue' ? blueIndex : redIndex;
    const oppIndex = playSide === 'blue' ? redIndex  : blueIndex;
    const ownLabel = playSide === 'blue' ? 'friendly' : 'hostile';
    const oppLabel = playSide === 'blue' ? 'hostile'  : 'friendly';
    const actions = rawActions.map((act, i) => ({
        idx: i,
        type: String(act.type || '').toUpperCase(),
        unitId: act.unitId,
        to: act.to,
        target: act.target,
        reason: act.reason || '',
        validation: validateAction(act, ownIndex, oppIndex, ownLabel, oppLabel),
    }));

    return {
        ok: true,
        empty: actions.length === 0,
        side: playSide,
        rationale: parsed.rationale || '',
        actions,
        counts: {
            friendly: all.friendly.length,
            hostile:  all.hostile.length,
            sentFriendly: friendly.length,
            sentHostile:  hostile.length,
            skipped,
        },
    };
}

module.exports = {
    propose,
    extractUnits,
    extractJson,
    unitsFromList,
    pickRelevant,
    centroid,
    affiliationOf,
    haversineKm,
    MAX_MOVE_KM,
    MAX_ENGAGE_KM,
};
