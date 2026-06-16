'use strict';
/* ============================================================================
 * free-fight-llm-capability-analyst.js — FREEFIGHT-LLM-CAPABILITY-ANALYST-A
 * ----------------------------------------------------------------------------
 * Intelligence-analyst layer for the Free Fight demo. Builds a richer per-unit
 * capability profile (domain/class/roles/scores/best-use/counters) so the COA
 * planner can reason about what each unit is good and bad at.
 *
 * PUBLIC / DEMO ABSTRACTION — REVIEW-ONLY. Every profile carries
 * review_required:true. The capability scores are rough 0-100 demo values for
 * relative comparison only. They are NOT real platform specifications, NOT
 * classified missile/radar/weapon ranges, and must not be read as
 * authoritative. Only public, general platform-role knowledge is used; no
 * classified data of any kind is encoded here.
 *
 * Scenario-generic: no hardcoded scenario/draft names, no hardcoded unit IDs.
 * Pure module — no DOM, no network, requireable in isolation (CommonJS).
 *
 * LOCAL-ONLY LLM POLICY (mirrors free-fight-llm-decision.js): this module ONLY
 * calls local providers (ollama / local). Remote providers (claude, zen,
 * openai, auto) are BLOCKED — the request falls back to the deterministic
 * heuristic, which reuses classifyUnit from platform-capability-catalog.js.
 * The LLM is only consulted when opts.useLlm && RMOOZ_ALLOW_SIM_RUN === '1';
 * any error/timeout/non-JSON/remote condition falls back to the heuristic.
 *
 * Exports:
 *   analyzeUnitCapabilities(units, context, opts, _providerOverride) → Promise<profiles[]>
 *   normalizeCapabilityProfile(raw, unit)                            → profile (pure, sync)
 *   buildCapabilitySummary(profiles)                                 → summary (pure, sync)
 *   selectBestUnitsForMission(profiles, missionType, side, limit)    → [{unit_uid,score,class,roles}] (pure, sync)
 *   HEURISTIC_BEST_USE                                               → exported table
 * ========================================================================== */

var aiProvider = require('./ai-provider');
var LLM_CFG = require('./llm-runtime-config'); // RMOOZ-LLM-RUNTIME-CONFIG-A: canonical provider/model/timeout
var CATALOG    = require('./platform-capability-catalog');

// RMOOZ-UNIT-IDENTITY-CONTRACT-A: ONE identity contract, shared with the client. A
// role token or a synthetic role-index label must NEVER become a platform name.
var IDENTITY = null;
try { IDENTITY = require('../../client/shared/unit-identity-resolver.js'); } catch (_) { IDENTITY = null; }

// Clean platform name: prefer the client-attached unit_identity, else the shared
// resolver, else an authored platform field — but never a role/synthetic label.
function cleanPlatformName(u) {
    if (u && u.unit_identity && u.unit_identity.platform_name) {
        return u.unit_identity.platform_name === 'unknown' ? null : u.unit_identity.platform_name;
    }
    if (IDENTITY && IDENTITY.unitIdentityForLlm) {
        try {
            var p = IDENTITY.unitIdentityForLlm(u).platform_name;
            return (p && p !== 'unknown') ? p : null;
        } catch (_) {}
    }
    return (u && (u.platform_name || u.platform)) || null;
}
function cleanDisplayName(u) {
    if (u && u.unit_identity && u.unit_identity.display_name) return u.unit_identity.display_name;
    if (u && u.display_name) return u.display_name;
    if (IDENTITY && IDENTITY.displayUnitName) {
        try { var n = IDENTITY.displayUnitName(u); if (n && n !== '—') return n; } catch (_) {}
    }
    return (u && (u.name || u.label)) || null;
}

// ── Local-only provider enforcement (mirrors free-fight-llm-decision.js) ─────
var REMOTE_PROVIDERS_BLOCKED = ['claude', 'zen', 'openai', 'auto'];

function resolveLocalProvider() {
    // RMOOZ-LLM-RUNTIME-CONFIG-A: provider from the canonical resolver.
    return LLM_CFG.getProvider();
}
function isRemoteProvider(name) {
    name = String(name || '').toLowerCase().trim();
    // RMOOZ-OPENROUTER-QWEN35-CLOUD-MODE-A: openrouter allowed ONLY in explicit cloud mode.
    if (name === 'openrouter') return !LLM_CFG.openrouterReady();
    return REMOTE_PROVIDERS_BLOCKED.indexOf(name) !== -1;
}
function resolveLocalModel() {
    // RMOOZ-LLM-RUNTIME-CONFIG-A: model from the canonical resolver — task override
    // (RMOOZ_LLM_MODEL_CAPABILITY_ANALYST) → operator UI selection → env default.
    return LLM_CFG.getModel('capability_analyst');
}

// ── Allowed enum sets for the profile schema ─────────────────────────────────
var ALLOWED_DOMAINS = ['air', 'naval', 'ground', 'air_defense', 'radar', 'base', 'logistics', 'unknown'];
var ALLOWED_CLASSES = ['fighter', 'interceptor', 'strike_aircraft', 'frigate', 'corvette', 'patrol_boat', 'sam', 'radar', 'infantry', 'armor', 'base', 'unknown'];
var ALLOWED_ROLES   = ['air_superiority', 'intercept', 'air_defense', 'naval_screen', 'naval_strike', 'ground_hold', 'ground_attack', 'recon', 'sensor', 'support', 'reserve'];
var ALLOWED_CONF    = ['low', 'medium', 'high'];
var ALLOWED_SOURCE  = ['llm_inferred', 'heuristic', 'explicit_scenario', 'catalog'];

var SCORE_KEYS = [
    'air_superiority', 'intercept', 'naval_strike', 'naval_screen',
    'ground_attack', 'ground_hold', 'air_defense', 'sensor', 'mobility', 'survivability',
];

// ── small helpers ────────────────────────────────────────────────────────────
function arr(v) { return Array.isArray(v) ? v : []; }
function str(v, max) { var s = String(v == null ? '' : v); return max ? s.slice(0, max) : s; }
function unitUid(u) { return (u && (u.uid || u.unit_uid || u.id)) || null; }
function unitSide(u) { return String((u && u.side) || 'RED').toUpperCase(); }

function clampScore(v) {
    var n = Number(v);
    if (!Number.isFinite(n)) return 0;
    n = Math.round(n);
    if (n < 0) return 0;
    if (n > 100) return 100;
    return n;
}
function zeroScoreSet() {
    var s = {};
    for (var i = 0; i < SCORE_KEYS.length; i++) s[SCORE_KEYS[i]] = 0;
    return s;
}
function scoreSet(partial) {
    var s = zeroScoreSet();
    if (partial) {
        for (var i = 0; i < SCORE_KEYS.length; i++) {
            var k = SCORE_KEYS[i];
            if (partial[k] != null) s[k] = clampScore(partial[k]);
        }
    }
    return s;
}
function whitelistRoles(roles) {
    var out = [], seen = {};
    arr(roles).forEach(function (r) {
        var v = str(r).toLowerCase().trim();
        if (ALLOWED_ROLES.indexOf(v) !== -1 && !seen[v]) { seen[v] = true; out.push(v); }
    });
    return out;
}
function whitelistDomain(d) {
    var v = str(d).toLowerCase().trim();
    return ALLOWED_DOMAINS.indexOf(v) !== -1 ? v : 'unknown';
}
function whitelistClass(c) {
    var v = str(c).toLowerCase().trim();
    return ALLOWED_CLASSES.indexOf(v) !== -1 ? v : 'unknown';
}
function whitelistConfidence(c) {
    var v = str(c).toLowerCase().trim();
    return ALLOWED_CONF.indexOf(v) !== -1 ? v : 'medium';
}
function whitelistSource(s, fallback) {
    var v = str(s).toLowerCase().trim();
    return ALLOWED_SOURCE.indexOf(v) !== -1 ? v : (fallback || 'heuristic');
}

// ============================================================================
// HEURISTIC enrich table — public abstraction, demo scores.
// Maps the coarse catalog class → the richer Free-Fight profile fields.
// ============================================================================
var HEURISTIC_BEST_USE = {
    fighter: {
        best_use: ['intercept hostile aircraft', 'protect defended airspace', 'air superiority'],
        not_best_for: ['ground holding', 'static base defense alone', 'naval occupation'],
        countered_by: ['layered SAM', 'numerically superior fighters'],
    },
    interceptor: {
        best_use: ['intercept hostile aircraft', 'protect defended airspace', 'air superiority'],
        not_best_for: ['ground holding', 'static base defense alone', 'naval occupation'],
        countered_by: ['layered SAM', 'numerically superior fighters'],
    },
    strike_aircraft: {
        best_use: ['strike ground/naval targets'],
        not_best_for: ['air superiority', 'sustained intercept'],
        countered_by: ['fighters', 'air defense'],
    },
    sam: {
        best_use: ['defend airspace / deny air approach'],
        not_best_for: ['offensive maneuver', 'ground assault'],
        countered_by: ['SEAD', 'saturation', 'standoff'],
    },
    radar: {
        best_use: ['early warning', 'cue interceptors/SAM'],
        not_best_for: ['any direct engagement', 'maneuver as assault'],
        countered_by: ['jamming', 'destruction of radar'],
    },
    frigate: {
        best_use: ['maritime screen/patrol', 'intercept naval approach'],
        not_best_for: ['land holding', 'air superiority'],
        countered_by: ['air strike', 'submarine', 'missile saturation'],
    },
    corvette: {
        best_use: ['maritime screen/patrol', 'intercept naval approach'],
        not_best_for: ['land holding', 'air superiority'],
        countered_by: ['air strike', 'submarine', 'missile saturation'],
    },
    patrol_boat: {
        best_use: ['maritime screen/patrol', 'intercept naval approach'],
        not_best_for: ['land holding', 'air superiority'],
        countered_by: ['air strike', 'submarine', 'missile saturation'],
    },
    infantry: {
        best_use: ['hold ground / defend area'],
        not_best_for: ['air intercept', 'naval', 'rapid deep maneuver'],
        countered_by: ['armor', 'artillery', 'air'],
    },
    armor: {
        best_use: ['ground blocking / counterattack', 'armored maneuver'],
        not_best_for: ['air intercept', 'naval'],
        countered_by: ['anti-armor', 'air', 'difficult terrain'],
    },
    base: {
        best_use: ['defended asset / sustainment'],
        not_best_for: ['any maneuver'],
        countered_by: ['standoff strike'],
    },
    unknown: {
        best_use: [],
        not_best_for: [],
        countered_by: [],
    },
};

// Map the catalog class (platform-capability-catalog.js vocabulary) to this
// module's richer class enum.
function catalogClassToRich(catClass) {
    switch (catClass) {
        case 'interceptor':   return 'interceptor';
        case 'fighter':       return 'fighter';
        case 'bomber':        return 'strike_aircraft';
        case 'frigate':       return 'frigate';
        case 'corvette':      return 'corvette';
        case 'missile_boat':  return 'patrol_boat';
        case 'destroyer':     return 'frigate';   // closest rich class for a surface combatant
        case 'ship':          return 'frigate';
        case 'sam':           return 'sam';
        case 'radar':         return 'radar';
        case 'infantry':      return 'infantry';
        case 'armor':         return 'armor';
        case 'base':          return 'base';
        default:              return 'unknown';
    }
}
// Map the catalog domain vocabulary to this module's domain enum.
function catalogDomainToRich(catDomain, richClass) {
    switch (catDomain) {
        case 'air':          return 'air';
        case 'naval':        return 'naval';
        case 'ground':       return 'ground';
        case 'air_defense':  return 'air_defense';
        case 'radar':        return 'radar';
        case 'base':         return richClass === 'base' ? 'base' : 'base';
        default:             return 'unknown';
    }
}

// Build the richer capability_scores object from the catalog's coarse scores
// plus the derived intercept/naval_screen/ground_hold dimensions per class.
function enrichScores(richClass, catScores) {
    catScores = catScores || {};
    var airSup   = clampScore(catScores.air_superiority);
    var navStrike = clampScore(catScores.naval_strike);
    var gndAtk   = clampScore(catScores.ground_attack);
    var airDef   = clampScore(catScores.air_defense);
    var sensor   = clampScore(catScores.sensor);
    var mobility = clampScore(catScores.mobility);
    var surv     = clampScore(catScores.survivability);

    var base = {
        air_superiority: airSup,
        intercept: 0,
        naval_strike: navStrike,
        naval_screen: 0,
        ground_attack: gndAtk,
        ground_hold: 0,
        air_defense: airDef,
        sensor: sensor,
        mobility: mobility,
        survivability: surv,
    };

    switch (richClass) {
        case 'fighter':
        case 'interceptor':
            base.intercept = airSup;                       // intercept ≈ air_superiority
            break;
        case 'strike_aircraft':
            // ground_attack/naval_strike already high; air-to-air weak.
            base.air_superiority = Math.min(base.air_superiority, 30);
            base.intercept = Math.min(airSup, 25);
            break;
        case 'sam':
            base.air_defense = Math.max(airDef, 80);
            base.intercept = Math.round(base.air_defense * 0.55); // moderate intercept
            base.mobility = Math.min(mobility, 25);               // low mobility
            break;
        case 'radar':
            base.air_superiority = 0; base.naval_strike = 0; base.naval_screen = 0;
            base.ground_attack = 0; base.ground_hold = 0; base.air_defense = 0;
            base.intercept = 0;
            base.sensor = Math.max(sensor, 85);
            break;
        case 'frigate':
        case 'corvette':
        case 'patrol_boat':
            base.naval_screen = Math.max(navStrike, sensor);     // screen ≈ strike/sensor
            break;
        case 'infantry':
            base.ground_hold = Math.max(gndAtk + 25, 60);
            base.ground_attack = Math.min(gndAtk, 45);
            base.mobility = Math.min(mobility, 45);              // low-med mobility
            break;
        case 'armor':
            base.ground_hold = Math.max(gndAtk - 10, 55);
            base.mobility = Math.max(mobility, 60);              // high mobility
            break;
        case 'base':
            base.ground_hold = Math.max(surv, 60);
            base.mobility = 0;
            base.air_superiority = 0; base.naval_strike = 0; base.ground_attack = 0; base.intercept = 0;
            break;
        default:
            break;
    }
    return scoreSet(base);
}

// Derive the rich role list per class.
function rolesForClass(richClass) {
    switch (richClass) {
        case 'fighter':
        case 'interceptor':   return ['air_superiority', 'intercept'];
        case 'strike_aircraft': return ['ground_attack', 'naval_strike'];
        case 'sam':           return ['air_defense', 'intercept'];
        case 'radar':         return ['sensor', 'recon'];
        case 'frigate':
        case 'corvette':
        case 'patrol_boat':   return ['naval_screen', 'naval_strike', 'sensor'];
        case 'infantry':      return ['ground_hold', 'support'];
        case 'armor':         return ['ground_attack', 'ground_hold'];
        case 'base':          return ['support', 'reserve'];
        default:              return ['support', 'reserve'];
    }
}

/**
 * heuristicProfile(unit) — pure. Reuses classifyUnit from the catalog (NO
 * re-implementation of keyword classification), then enriches the coarse
 * profile into the Free-Fight capability schema.
 */
function heuristicProfile(unit) {
    var u = unit || {};
    var c = CATALOG.classifyUnit(u);   // reuse, don't duplicate
    var richClass = catalogClassToRich(c.class);
    var richDomain = catalogDomainToRich(c.domain, richClass);

    // Strike-aircraft keyword wins its air-defense domain; keep simple mapping.
    var enrich = HEURISTIC_BEST_USE[richClass] || HEURISTIC_BEST_USE.unknown;
    var roles = rolesForClass(richClass);

    // For multirole fighters, surface the optional strike role when the coarse
    // catalog credits ground/naval strike.
    if ((richClass === 'fighter' || richClass === 'interceptor') &&
        ((Number(c.capability_scores.ground_attack) || 0) >= 35 ||
         (Number(c.capability_scores.naval_strike) || 0) >= 35)) {
        roles = roles.concat(['ground_attack']);
    }

    var profile = {
        unit_uid: unitUid(u),
        original_name: cleanDisplayName(u),
        platform_name: cleanPlatformName(u),
        side: unitSide(u),
        domain: whitelistDomain(richDomain),
        class: whitelistClass(richClass),
        roles: whitelistRoles(roles),
        capability_scores: enrichScores(richClass, c.capability_scores),
        best_use: (enrich.best_use || []).slice(),
        not_best_for: (enrich.not_best_for || []).slice(),
        countered_by: (enrich.countered_by || []).slice(),
        commander_notes: [],
        confidence: richClass === 'unknown' ? 'low' : 'medium',
        source: 'heuristic',
        review_required: true,
    };

    // base/logistics defended_asset note.
    if (richClass === 'base') {
        profile.commander_notes = ['defended_asset'];
    }

    // Explicit scenario fields override the heuristic (highest precedence).
    var explicitUsed = false;
    if (u.domain != null) { profile.domain = whitelistDomain(u.domain); explicitUsed = true; }
    if (u.class != null) { profile.class = whitelistClass(u.class); explicitUsed = true; }
    if (u.capability_scores && typeof u.capability_scores === 'object') {
        var merged = scoreSet(profile.capability_scores);
        for (var i = 0; i < SCORE_KEYS.length; i++) {
            var k = SCORE_KEYS[i];
            if (u.capability_scores[k] != null) merged[k] = clampScore(u.capability_scores[k]);
        }
        profile.capability_scores = merged;
        explicitUsed = true;
    }
    if (u.roles != null && Array.isArray(u.roles) && u.roles.length) {
        var wl = whitelistRoles(u.roles);
        if (wl.length) { profile.roles = wl; explicitUsed = true; }
    }
    if (explicitUsed) {
        profile.source = 'explicit_scenario';
        if (profile.confidence === 'low') profile.confidence = 'medium';
    }

    return profile;
}

/**
 * normalizeCapabilityProfile(raw, unit) — pure, sync.
 * Coerce an LLM raw object into the schema. unit_uid is ALWAYS taken from the
 * trusted unit (never from raw — prevents ID spoofing). Scores clamped 0-100,
 * roles/domain/class whitelisted, review_required forced true, confidence
 * defaults 'medium' and is only 'high' if raw says so AND carries scores.
 */
function normalizeCapabilityProfile(raw, unit) {
    raw = (raw && typeof raw === 'object') ? raw : {};
    var u = unit || {};

    var hasScores = raw.capability_scores && typeof raw.capability_scores === 'object';
    var conf = whitelistConfidence(raw.confidence);
    // Never allow 'high' unless raw explicitly said high AND provided scores.
    if (conf === 'high' && !(str(raw.confidence).toLowerCase().trim() === 'high' && hasScores)) {
        conf = 'medium';
    }

    return {
        unit_uid: unitUid(u),  // trusted source, NOT raw
        original_name: cleanDisplayName(u) || (raw.original_name != null ? str(raw.original_name, 120) : null),
        platform_name: cleanPlatformName(u) || (raw.platform_name != null ? str(raw.platform_name, 120) : null),
        side: unitSide(u),
        domain: whitelistDomain(raw.domain),
        class: whitelistClass(raw.class),
        roles: whitelistRoles(raw.roles),
        capability_scores: scoreSet(hasScores ? raw.capability_scores : null),
        best_use: arr(raw.best_use).map(function (x) { return str(x, 120); }).filter(Boolean).slice(0, 8),
        not_best_for: arr(raw.not_best_for).map(function (x) { return str(x, 120); }).filter(Boolean).slice(0, 8),
        countered_by: arr(raw.countered_by).map(function (x) { return str(x, 120); }).filter(Boolean).slice(0, 8),
        commander_notes: arr(raw.commander_notes).map(function (x) { return str(x, 200); }).filter(Boolean).slice(0, 8),
        confidence: conf,
        source: whitelistSource(raw.source, 'llm_inferred'),
        review_required: true,
    };
}

// Strip common LLM preamble so JSON.parse succeeds.
function parseJsonSafe(text) {
    var s = str(text).trim();
    var m = s.match(/\{[\s\S]*\}/);
    return JSON.parse(m ? m[0] : s);
}

/**
 * analyzeUnitCapabilities(units, context, opts, _providerOverride) → Promise<profiles[]>
 * Returns exactly one profile per input unit that has a uid, in input order.
 * Uses the local-only LLM when enabled; otherwise / on any failure falls back
 * to the deterministic heuristic.
 */
function analyzeUnitCapabilities(units, context, opts, _providerOverride) {
    context = context || {};
    opts = opts || {};
    var provider = _providerOverride || aiProvider;

    var inputUnits = arr(units).filter(function (u) { return unitUid(u); });

    var allowedIds = arr(opts.allowed_unit_ids).filter(Boolean);
    var effectiveAllowed = allowedIds.length
        ? allowedIds
        : inputUnits.map(function (u) { return unitUid(u); }).filter(Boolean);
    var allowedSet = {};
    effectiveAllowed.forEach(function (id) { allowedSet[String(id)] = true; });

    function heuristicAll() {
        return inputUnits.map(function (u) { return heuristicProfile(u); });
    }

    // ── Decide whether the LLM may be consulted at all ───────────────────────
    var llmEnabled = !!(opts.useLlm && process.env.RMOOZ_ALLOW_SIM_RUN === '1');
    if (!llmEnabled) {
        return Promise.resolve(heuristicAll());
    }
    var providerName = resolveLocalProvider();
    if (isRemoteProvider(providerName)) {
        // remote blocked → heuristic, never call the provider
        return Promise.resolve(heuristicAll());
    }
    var model = resolveLocalModel();
    // RMOOZ-AI-COA-TIMEOUT-RETRY-A: 45s was too tight for a 7B-class model on CPU/modest GPU. 120s default.
    // RMOOZ-LLM-RUNTIME-CONFIG-A: timeout from the canonical resolver
    // (RMOOZ_LLM_TIMEOUT_MS[/_CAPABILITY_ANALYST] → legacy RMOOZ_FREE_FIGHT_TIMEOUT_MS/RMOOZ_AI_TIMEOUT_MS).
    var timeoutMs = LLM_CFG.getTimeoutMs('capability_analyst');

    var system = [
        'You are an intelligence analyst for an advisory-only demo.',
        'Return ONLY JSON: {"profiles":[...]}.',
        'Every unit_uid MUST be one of allowed_unit_ids — never invent IDs.',
        'Use public/general platform-role knowledge only; do NOT claim classified or exact weapon specs.',
        'If uncertain, confidence low or medium. Prefer broad capability classes.',
        'Every profile review_required:true.',
    ].join(' ');

    var unitList = inputUnits.map(function (u) {
        return {
            unit_uid: unitUid(u),
            name: u.name || u.label || null,
            platform: u.platform || u.type || null,
            role: u.role || null,
            side: unitSide(u),
        };
    });

    var prompt = JSON.stringify({
        units: unitList,
        context: {
            active_side: context.active_side || null,
            objective: context.objective || null,
            threat_type: context.threat_type || null,
            zone_violation: context.zone_violation != null ? context.zone_violation : null,
        },
        allowed_unit_ids: effectiveAllowed,
        required_output_schema: {
            profiles: [{
                unit_uid: '<MUST be one of allowed_unit_ids — no other value>',
                domain: ALLOWED_DOMAINS.join('|'),
                class: ALLOWED_CLASSES.join('|'),
                roles: ALLOWED_ROLES,
                capability_scores: SCORE_KEYS.reduce(function (acc, k) { acc[k] = '0-100'; return acc; }, {}),
                best_use: ['<short phrase>'],
                not_best_for: ['<short phrase>'],
                countered_by: ['<short phrase>'],
                commander_notes: ['<short phrase>'],
                confidence: 'low|medium|high',
                review_required: true,
            }],
        },
        constraint: 'Every unit_uid MUST be exactly one of allowed_unit_ids — do not invent IDs. Public/general knowledge only; no classified or exact weapon specs.',
    });

    return Promise.resolve()
        .then(function () {
            return provider.generate({
                provider: providerName,
                model: model,
                system: system,
                prompt: prompt,
                format: 'json',
                options: { temperature: 0.2, numPredict: 2500 },
                timeoutMs: timeoutMs,
            });
        })
        .then(function (result) {
            if (!result || !result.ok) return heuristicAll();

            var parsed;
            try { parsed = parseJsonSafe(result.response || ''); }
            catch (e) { return heuristicAll(); }

            var rawProfiles = parsed && Array.isArray(parsed.profiles) ? parsed.profiles : null;
            if (!rawProfiles) return heuristicAll();

            // Index LLM profiles by unit_uid, dropping invented/unknown uids.
            var byUid = {};
            rawProfiles.forEach(function (rp) {
                var rid = rp && (rp.unit_uid != null ? String(rp.unit_uid) : '');
                if (rid && allowedSet[rid] && !byUid[rid]) byUid[rid] = rp;
            });

            var llmFilled = 0;
            var out = inputUnits.map(function (u) {
                var uid = String(unitUid(u));
                if (Object.prototype.hasOwnProperty.call(byUid, uid)) {
                    llmFilled++;
                    var p = normalizeCapabilityProfile(byUid[uid], u);
                    p.source = 'llm_inferred';
                    return p;
                }
                // missing from LLM → fill from heuristic
                return heuristicProfile(u);
            });

            // If the LLM omitted a unit or returned <50% coverage, the missing
            // ones are already heuristic-filled above; nothing else to do —
            // the array is in input order, one per unit.
            // (llmFilled retained for clarity / future tracing.)
            void llmFilled;
            return out;
        })
        .catch(function () {
            return heuristicAll();
        });
}

// ============================================================================
// buildCapabilitySummary(profiles) — pure, sync.
// ============================================================================
function emptyCounts() {
    return { air: 0, naval: 0, ground: 0, air_defense: 0, radar: 0, base: 0, unknown: 0 };
}
function bumpCounts(counts, domain) {
    if (Object.prototype.hasOwnProperty.call(counts, domain)) counts[domain]++;
    else counts.unknown++;
}

// Map a mission type to the capability score key used to rank for it.
var MISSION_SCORE = {
    air_intercept: 'intercept',
    intercept: 'intercept',
    air_superiority: 'air_superiority',
    naval_screen: 'naval_screen',
    naval_strike: 'naval_strike',
    air_defense: 'air_defense',
    sensor: 'sensor',
    ground_hold: 'ground_hold',
    ground_attack: 'ground_attack',
};

function bestForMission(profiles, scoreKey) {
    var best = null;
    arr(profiles).forEach(function (p) {
        var sc = Number(p.capability_scores && p.capability_scores[scoreKey]) || 0;
        if (sc <= 0) return;
        if (!best || sc > best.score) {
            best = { unit_uid: p.unit_uid, class: p.class, score: sc };
        }
    });
    return best;
}

function bestBlock(profiles) {
    return {
        air_intercept: bestForMission(profiles, 'intercept'),
        sensor: bestForMission(profiles, 'sensor'),
        air_defense: bestForMission(profiles, 'air_defense'),
        naval_screen: bestForMission(profiles, 'naval_screen'),
        ground_hold: bestForMission(profiles, 'ground_hold'),
    };
}

function sumScore(profiles, key) {
    var t = 0;
    arr(profiles).forEach(function (p) { t += Number(p.capability_scores && p.capability_scores[key]) || 0; });
    return t;
}
function compareSide(redTotal, blueTotal) {
    if (redTotal <= 0 && blueTotal <= 0) return 'unknown';
    var hi = Math.max(redTotal, blueTotal), lo = Math.min(redTotal, blueTotal);
    if (lo > 0 && lo >= hi * 0.75) return 'contested';
    return redTotal > blueTotal ? 'RED' : 'BLUE';
}

function buildCapabilitySummary(profiles) {
    var list = arr(profiles);
    var counts = emptyCounts();
    var red = [], blue = [];
    var redCounts = emptyCounts(), blueCounts = emptyCounts();

    list.forEach(function (p) {
        bumpCounts(counts, p.domain);
        if (String(p.side).toUpperCase() === 'BLUE') { blue.push(p); bumpCounts(blueCounts, p.domain); }
        else { red.push(p); bumpCounts(redCounts, p.domain); }
    });

    return {
        counts: counts,
        by_side: { RED: redCounts, BLUE: blueCounts },
        best: bestBlock(list),
        best_by_side: { RED: bestBlock(red), BLUE: bestBlock(blue) },
        superiority: {
            air: compareSide(sumScore(red, 'air_superiority'), sumScore(blue, 'air_superiority')),
            naval: compareSide(sumScore(red, 'naval_strike'), sumScore(blue, 'naval_strike')),
            ground: compareSide(sumScore(red, 'ground_attack'), sumScore(blue, 'ground_attack')),
            sensor: compareSide(sumScore(red, 'sensor'), sumScore(blue, 'sensor')),
        },
        review_required: true,
    };
}

// ============================================================================
// selectBestUnitsForMission(profiles, missionType, side, limit) — pure, sync.
// ============================================================================
function selectBestUnitsForMission(profiles, missionType, side, limit) {
    var key = MISSION_SCORE[String(missionType || '').toLowerCase().trim()] || 'survivability';
    var want = side != null ? String(side).toUpperCase() : null;
    var lim = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : Infinity;

    var rows = arr(profiles)
        .filter(function (p) { return want == null || String(p.side).toUpperCase() === want; })
        .map(function (p) {
            return {
                unit_uid: p.unit_uid,
                score: Number(p.capability_scores && p.capability_scores[key]) || 0,
                class: p.class,
                roles: arr(p.roles).slice(),
            };
        });

    rows.sort(function (a, b) { return b.score - a.score; });
    return lim === Infinity ? rows : rows.slice(0, lim);
}

module.exports = {
    analyzeUnitCapabilities: analyzeUnitCapabilities,
    normalizeCapabilityProfile: normalizeCapabilityProfile,
    buildCapabilitySummary: buildCapabilitySummary,
    selectBestUnitsForMission: selectBestUnitsForMission,
    HEURISTIC_BEST_USE: HEURISTIC_BEST_USE,
};
