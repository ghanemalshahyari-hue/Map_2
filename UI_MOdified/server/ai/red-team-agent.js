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

const fs        = require('fs');
const path      = require('path');
const ollama    = require('./ollama-client');
const aiProvider = require('./ai-provider');

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

// Build a per-turn worked example using REAL ids from the current snapshot.
// Small local models tend to copy whatever JSON example they see verbatim,
// so we feed them one that already uses valid unit ids — that way even pure
// regurgitation produces actions that pass validation. We bias the example
// to a HOLD action (always safe) so the model isn't tempted to copy the
// example's MOVE/ENGAGE geometry as-is.
function buildWorkedExample(side, friendly, hostile) {
    const isBlue = side === 'blue';
    const own    = isBlue ? friendly : hostile;
    if (!own.length) return '';
    const sample = own[0];
    const ex = {
        rationale: `Read of this turn: maintain pressure on the contact line; ${sample.id} stays in overwatch.`,
        actions: [
            { type: 'HOLD', unitId: sample.id, reason: 'No priority target in range this turn — preserve combat power.' },
        ],
    };
    return [
        '',
        '=== WORKED EXAMPLE (uses ids from THIS snapshot — pattern your JSON after this) ===',
        JSON.stringify(ex, null, 2),
        '=== END EXAMPLE ===',
        '',
    ].join('\n');
}

function buildUserPrompt({ turn, friendly, hostile, trimmedFriendly, trimmedHostile, side, coaContext, operatorIntent }) {
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
    const intent = String(operatorIntent || '').trim();
    const intentBlock = intent
        ? [
            '',
            '=== OPERATOR INTENT ===',
            intent,
            `Prioritize ${sideLabel} actions that support this idea unless the battlefield state makes it impossible.`,
        ].join('\n')
        : '';
    const exampleBlock = buildWorkedExample(side, friendly, hostile);
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
        intentBlock,
        exampleBlock,
        `Propose ${want} reactive actions for the ${sideLabel} units. Respond with the JSON schema only.`,
        `Reminder: every unitId/target must be COPIED from the unit lists above — do NOT invent short ids like r1/b1.`,
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

// Best-effort repair for common LLM JSON mistakes that strict JSON.parse
// rejects. Runs ONLY when JSON.parse has already failed once, so it never
// changes the happy path. Repairs we apply (string-literal-aware so we
// don't corrupt content inside quoted strings):
//
//   • trailing commas before `}` or `]`
//   • missing commas between adjacent objects/arrays (`}{` → `},{`,
//     `]{` → `],{`, `}[` → `},[`, `][` → `],[`)
//   • truncation: model ran out of token budget mid-output — close any
//     unterminated string + unmatched brackets/braces, drop a dangling
//     incomplete key-value pair (`...,"foo":` → `...`).
//   • leading ```json fences and trailing ``` fences
//
// Returns a string ready for JSON.parse — caller still wraps in try/catch.
function repairJson(s) {
    if (typeof s !== 'string' || !s) return s;

    // Strip ```json / ``` fences a chatty model may include.
    s = s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');

    // First pass: walk + emit, fixing commas and tracking depth/string state.
    const out = [];
    /** open bracket stack — '}' / ']' = the char needed to close. */
    const stack = [];
    let inStr = false, esc = false;
    // Track the absolute output position of the last *complete* top-level
    // value so we can roll back to it if the tail is unrecoverable.
    let lastCompleteEnd = -1;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (inStr) {
            out.push(ch);
            if (esc) { esc = false; continue; }
            if (ch === '\\') { esc = true; continue; }
            if (ch === '"') inStr = false;
            continue;
        }
        if (ch === '"') { inStr = true; out.push(ch); continue; }
        if (ch === ',') {
            // Drop a trailing comma directly before } or ].
            let j = i + 1;
            while (j < s.length && /\s/.test(s[j])) j++;
            const next = s[j];
            if (next === '}' || next === ']') continue;
            out.push(ch);
            continue;
        }
        if (ch === '{') { stack.push('}'); out.push(ch); continue; }
        if (ch === '[') { stack.push(']'); out.push(ch); continue; }
        if (ch === '}' || ch === ']') {
            // Close current structure; insert a missing separator if the
            // next non-whitespace char opens a new structure right after.
            stack.pop();
            out.push(ch);
            if (stack.length === 0) lastCompleteEnd = out.length;
            let j = i + 1;
            while (j < s.length && /\s/.test(s[j])) j++;
            const next = s[j];
            if (next === '{' || next === '[') out.push(',');
            continue;
        }
        out.push(ch);
    }

    // Second pass: synthesize closers for anything left open by truncation.
    let repaired = out.join('');
    if (inStr) {
        // Close the dangling string. If we were mid-escape, drop the
        // hanging backslash first — JSON forbids \" at end-of-string.
        if (esc) repaired = repaired.slice(0, -1);
        repaired += '"';
    }

    // If a key was emitted with no value yet — e.g. `..."foo":` or
    // `..."foo": ` at the end — drop it back to the previous separator so
    // we don't synthesize `: }` which JSON forbids.
    repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*$/, '');
    repaired = repaired.replace(/{\s*"[^"]*"\s*:\s*$/, '{');

    // Close remaining brackets/braces in reverse order.
    while (stack.length) repaired += stack.pop();

    // After synthesizing closers, run a final trailing-comma scrub —
    // closing brackets sometimes lands right after a now-orphaned ','.
    repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

    // Third pass: insert missing commas between a completed value and the
    // next key inside the same object. Pattern: <value-end> <ws> <"key":>.
    // value-end = quoted string | true/false/null | number | } | ]
    // We can apply this as a regex because by this point all structural
    // chars are intact and we're operating on whitespace gaps between
    // tokens — false positives inside strings are impossible because
    // backslash-escaped quotes don't terminate the value-end alternative.
    repaired = repaired.replace(
        /("(?:[^"\\]|\\.)*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?|\}|\])(\s+)("(?:[^"\\]|\\.)*"\s*:)/g,
        '$1,$2$3'
    );
    // Same fix, but separator is just whitespace with no newline (object
    // members on the same line: `"a":1 "b":2`).
    repaired = repaired.replace(
        /("(?:[^"\\]|\\.)*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?|\}|\])( )("(?:[^"\\]|\\.)*"\s*:)/g,
        '$1,$2$3'
    );

    return repaired;
}

// Try JSON.parse, then attempt repair, then parse again. As a last resort,
// roll back to the last completely balanced top-level value the original
// contained (useful when the tail is irretrievably corrupted). Throws the
// original error if every recovery path fails.
function tolerantParse(text) {
    try { return JSON.parse(text); }
    catch (firstErr) {
        const repaired = repairJson(text);
        if (repaired !== text) {
            try { return JSON.parse(repaired); } catch { /* fall through */ }
        }
        // Last resort: walk the original from the start and return the
        // largest balanced prefix that parses. This recovers the data the
        // model DID get right when only the tail was malformed.
        const prefix = balancedPrefix(text);
        if (prefix && prefix !== text) {
            try { return JSON.parse(prefix); } catch { /* fall through */ }
        }
        throw firstErr;
    }
}

// Return the longest prefix of `s` that's a syntactically balanced JSON
// value at depth 0 (i.e. trims the unrecoverable tail of a truncated blob).
function balancedPrefix(s) {
    if (typeof s !== 'string') return '';
    const start = s.indexOf('{');
    if (start === -1) return '';
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
        if (ch === '{' || ch === '[') depth++;
        else if (ch === '}' || ch === ']') {
            depth--;
            if (depth === 0) return s.slice(start, i + 1);
        }
    }
    return '';
}

// Some models (gpt-oss family) route JSON-formatted output into a hidden
// "thinking" channel when Ollama's `format:'json'` is set, leaving the
// public `response` empty. For those we must NOT request JSON mode and
// rely on the system prompt + repair fallback instead.
function shouldRequestJsonFormat(model) {
    const m = String(model || '').toLowerCase();
    if (!m) return false; // unknown model id — be conservative
    if (m.startsWith('gpt-oss')) return false;
    return true;
}

// ── Validation ──────────────────────────────────────────────────────────
// Side-aware: ownIndex = units the AI commands; oppIndex = the opponent.
// Same rules regardless of side, just different sources for who attacks whom.

// Small LLMs often reference units by their `name` (e.g. "1BCT") rather than
// the synthetic `id` (e.g. "b1") we show in the prompt — both fields appear
// in the prompt line `- b1  (1BCT)  at [...]`, and the model picks whichever
// one looks more semantic. Build a secondary lookup by name/code (case-
// insensitive) so we can resolve those references and rewrite act.unitId to
// the canonical id before the client tries to find the marker.
function buildLookup(index) {
    const byName = new Map();
    for (const [, u] of index) {
        if (u && u.name) byName.set(String(u.name).toLowerCase(), u);
        if (u && u.code) byName.set(String(u.code).toLowerCase(), u);
    }
    return byName;
}

function resolveUnitRef(ref, primaryIndex, byNameLookup) {
    if (ref == null) return null;
    const direct = primaryIndex.get(ref);
    if (direct) return direct;
    const lc = String(ref).toLowerCase();
    return byNameLookup.get(lc) || null;
}

function validateAction(act, ownIndex, oppIndex, ownLabel, oppLabel, ownByName, oppByName) {
    const errors = [];
    if (!act || typeof act !== 'object') return { ok: false, errors: ['not an object'] };
    const type = String(act.type || '').toUpperCase();
    if (!['MOVE', 'ENGAGE', 'HOLD'].includes(type)) errors.push(`unknown type "${act.type}"`);

    // Resolve unitId via id-first, name-fallback. Rewrite the action so
    // downstream code (and the browser's markerById lookup) sees the
    // canonical id even when the model used a name.
    const own = resolveUnitRef(act.unitId, ownIndex, ownByName);
    if (!own) errors.push(`unitId "${act.unitId}" is not a ${ownLabel} unit in this snapshot`);
    else if (own.id !== act.unitId) act.unitId = own.id;

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
            const opp = resolveUnitRef(act.target, oppIndex, oppByName);
            if (!opp) errors.push(`target "${act.target}" is not a ${oppLabel} unit in this snapshot`);
            else {
                if (opp.id !== act.target) act.target = opp.id;
                if (own) {
                    const dist = haversineKm({ lat: own.lat, lng: own.lng }, { lat: opp.lat, lng: opp.lng });
                    if (dist > MAX_ENGAGE_KM) errors.push(`engage range ${dist.toFixed(1)} km exceeds ${MAX_ENGAGE_KM} km`);
                }
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

async function propose({ snapshot, units, turn, model, timeoutMs, side, coaContext, provider, operatorIntent }) {
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

    const userPrompt = buildUserPrompt({ turn, friendly, hostile, trimmedFriendly, trimmedHostile, side: playSide, coaContext, operatorIntent });
    // Request JSON-mode output from Ollama when the model supports it
    // (everything except reasoning models like gpt-oss). This stops the
    // model from emitting prose preamble or fenced code blocks and
    // dramatically reduces the parse-failure rate seen with small models.
    const useJsonFormat = shouldRequestJsonFormat(model);
    const llm = await aiProvider.generate({
        provider,
        model,
        system:  PROMPTS[playSide],
        prompt:  userPrompt,
        format:  useJsonFormat ? 'json' : undefined,
        // 4000 (was 2500) — small models often need more headroom for
        // multi-action plans with rationale + per-action `reason` fields.
        // The previous cap was hitting at ~position 460-520 mid-object,
        // truncating the response and breaking JSON.parse.
        options: { num_predict: 4000, temperature: 0.2 },
        timeoutMs: timeoutMs || 150_000,
    });
    // Log which provider was actually used (handles auto-fallback).
    const usedProvider = llm.providerUsed || provider || 'ollama';

    if (!llm.ok) {
        return { ok: false, error: llm.error || 'LLM call failed', counts: { friendly: friendly.length, hostile: hostile.length, skipped } };
    }

    const cleaned = extractJson(llm.response || '');
    let parsed;
    try { parsed = tolerantParse(cleaned); }
    catch (e) {
        return {
            ok: false,
            error: 'Model did not return valid JSON: ' + e.message,
            raw: llm.response,
            rawHead: (llm.response || '').slice(0, 400),
            counts: { friendly: friendly.length, hostile: hostile.length, skipped },
        };
    }
    const rawActions = Array.isArray(parsed.actions) ? parsed.actions : [];

    const redIndex  = new Map(hostile.map(u => [u.id, u]));
    const blueIndex = new Map(friendly.map(u => [u.id, u]));
    const ownIndex = playSide === 'blue' ? blueIndex : redIndex;
    const oppIndex = playSide === 'blue' ? redIndex  : blueIndex;
    const ownByName = buildLookup(ownIndex);
    const oppByName = buildLookup(oppIndex);
    const ownLabel = playSide === 'blue' ? 'friendly' : 'hostile';
    const oppLabel = playSide === 'blue' ? 'hostile'  : 'friendly';
    const actions = rawActions.map((act, i) => {
        // validateAction may rewrite act.unitId / act.target to the
        // canonical id when the model used a name — run it first, then
        // snapshot the (possibly-corrected) fields into the result.
        const validation = validateAction(act, ownIndex, oppIndex, ownLabel, oppLabel, ownByName, oppByName);
        return {
            idx: i,
            type: String(act.type || '').toUpperCase(),
            unitId: act.unitId,
            to: act.to,
            target: act.target,
            reason: act.reason || '',
            validation,
        };
    });

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
    repairJson,
    tolerantParse,
    shouldRequestJsonFormat,
    unitsFromList,
    pickRelevant,
    centroid,
    affiliationOf,
    haversineKm,
    MAX_MOVE_KM,
    MAX_ENGAGE_KM,
};
