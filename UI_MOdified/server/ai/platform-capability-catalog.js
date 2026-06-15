'use strict';
/* ============================================================================
 * platform-capability-catalog.js — shared AI-intelligence module
 * ----------------------------------------------------------------------------
 * Classifies scenario units into a coarse capability profile so the rest of the
 * intel layer (zones, contacts, ROE, COA) can reason about what a force can do.
 *
 * PUBLIC / DEMO ABSTRACTION — REVIEW-ONLY. The capability scores below are
 * rough 0-100 demo values for relative comparison only. They are NOT real
 * platform specifications, NOT classified missile/radar ranges, and must not be
 * read as authoritative. No classified data of any kind is encoded here.
 *
 * Scenario-generic: no hardcoded scenario/draft names, no hardcoded unit IDs.
 * Pure module — no DOM, no network, requireable in isolation (CommonJS).
 *
 * Exports:
 *   classifyUnit(unit)                       → capability profile
 *   summarizeCapabilities(units)             → { red, blue }
 *   computeSuperiority(units)                → { air, naval, ground, sensor }
 *   bestAssetsForSide(units, side, role)     → [{ unit_uid, class, score }]
 * ========================================================================== */

var CAPABILITY_KEYS = [
    'air_superiority', 'naval_strike', 'ground_attack',
    'air_defense', 'sensor', 'mobility', 'survivability',
];

function zeroScores() {
    return { air_superiority: 0, naval_strike: 0, ground_attack: 0, air_defense: 0, sensor: 0, mobility: 0, survivability: 0 };
}
function scores(partial) {
    var s = zeroScores();
    if (partial) { for (var i = 0; i < CAPABILITY_KEYS.length; i++) { var k = CAPABILITY_KEYS[i]; if (partial[k] != null) s[k] = Number(partial[k]) || 0; } }
    return s;
}

function arr(v) { return Array.isArray(v) ? v : []; }
function unitUid(u) { return (u && (u.uid || u.unit_uid || u.id)) || null; }
function unitSide(u) { return String((u && u.side) || 'RED').toUpperCase(); }

// Combined lowercased keyword signal from every label-ish field a unit may carry.
function keywordSignal(u) {
    if (!u) return '';
    var parts = [u.role, u.label, u.platform, u.class, u.type, u.platform_name];
    return parts.filter(function (p) { return p != null; }).join(' ').toLowerCase();
}

function has(sig, words) {
    for (var i = 0; i < words.length; i++) { if (sig.indexOf(words[i]) !== -1) return true; }
    return false;
}

// --------------------------------------------------------------------------
// Keyword → class catalog (public abstraction; demo scores). The first match
// in evaluation order wins. Order matters: more specific before generic.
// --------------------------------------------------------------------------
function catalogClassify(sig) {
    // Air defense / SAM first (so "missile-battery" doesn't fall into bomber).
    if (has(sig, ['sam', 'patriot', 's-300', 's300', 's-400', 's400', 'hawk', 'sa-', 'missile-battery', 'missile battery', 'air-defen', 'air defen', 'air-defence', 's-200'])) {
        return { domain: 'air_defense', class: 'sam', roles: ['defend', 'intercept'],
            capability_scores: scores({ air_defense: 88, sensor: 70, survivability: 55, mobility: 25 }),
            best_use: ['area air defense', 'intercept incoming air threats'], weaknesses: ['low mobility', 'vulnerable to saturation / standoff'] };
    }
    // Radar / sensor / early warning.
    if (has(sig, ['radar', 'p-37', 'p37', 'early-warning', 'early warning', 'aewc', 'awacs', 'sensor', 'surveillance'])) {
        return { domain: 'radar', class: 'radar', roles: ['recon', 'sensor'],
            capability_scores: scores({ sensor: 90, survivability: 40, mobility: 20 }),
            best_use: ['wide-area surveillance', 'cueing interceptors'], weaknesses: ['no organic strike', 'high-value soft target'] };
    }
    // Interceptor (Tomcat / F-14 / interceptor explicitly).
    if (has(sig, ['f-14', 'f14', 'tomcat', 'interceptor'])) {
        return { domain: 'air', class: 'interceptor', roles: ['air_superiority', 'intercept', 'strike'],
            capability_scores: scores({ air_superiority: 88, sensor: 78, mobility: 82, survivability: 55, ground_attack: 35 }),
            best_use: ['long-range intercept', 'air superiority'], weaknesses: ['limited persistence', 'dependent on tanker/cueing'] };
    }
    // Fighter aircraft (generic air superiority).
    if (has(sig, ['f-15', 'f15', 'f-16', 'f16', 'mig', 'su-', 'su2', 'su3', 'rafale', 'typhoon', 'fighter', 'f-18', 'f18', 'mirage'])) {
        return { domain: 'air', class: 'fighter', roles: ['air_superiority', 'intercept', 'strike'],
            capability_scores: scores({ air_superiority: 85, sensor: 70, mobility: 85, survivability: 55, ground_attack: 45, naval_strike: 40 }),
            best_use: ['air superiority', 'intercept', 'multirole strike'], weaknesses: ['limited persistence', 'needs basing/support'] };
    }
    // Bomber / strike aircraft.
    if (has(sig, ['bomber', 'b-52', 'b52', 'strike-aircraft', 'strike aircraft', 'b-1', 'b-2', 'attack-aircraft'])) {
        return { domain: 'air', class: 'bomber', roles: ['strike'],
            capability_scores: scores({ ground_attack: 85, naval_strike: 80, mobility: 70, survivability: 45, sensor: 50 }),
            best_use: ['standoff strike', 'anti-ship strike'], weaknesses: ['poor air-to-air', 'needs escort/SEAD'] };
    }
    // Naval surface combatants.
    if (has(sig, ['frigate'])) {
        return { domain: 'naval', class: 'frigate', roles: ['screen', 'naval_strike', 'patrol', 'recon'],
            capability_scores: scores({ naval_strike: 70, sensor: 72, survivability: 65, air_defense: 50, mobility: 45 }),
            best_use: ['surface screen', 'anti-ship engagement'], weaknesses: ['slow vs air threat', 'limited area AD'] };
    }
    if (has(sig, ['destroyer'])) {
        return { domain: 'naval', class: 'destroyer', roles: ['screen', 'naval_strike', 'patrol', 'recon'],
            capability_scores: scores({ naval_strike: 78, sensor: 78, survivability: 72, air_defense: 65, mobility: 45 }),
            best_use: ['surface and air screen', 'anti-ship strike'], weaknesses: ['high value', 'limited numbers'] };
    }
    if (has(sig, ['corvette'])) {
        return { domain: 'naval', class: 'corvette', roles: ['screen', 'naval_strike', 'patrol', 'recon'],
            capability_scores: scores({ naval_strike: 62, sensor: 60, survivability: 50, air_defense: 35, mobility: 55 }),
            best_use: ['coastal patrol', 'anti-ship engagement'], weaknesses: ['light air defense', 'limited endurance'] };
    }
    if (has(sig, ['patrol-boat', 'patrol boat', 'missile-boat', 'missile boat', 'fast-attack', 'fac'])) {
        return { domain: 'naval', class: 'missile_boat', roles: ['screen', 'naval_strike', 'patrol'],
            capability_scores: scores({ naval_strike: 60, sensor: 45, survivability: 35, mobility: 70 }),
            best_use: ['littoral strike', 'fast patrol'], weaknesses: ['fragile', 'short range', 'weak air defense'] };
    }
    if (has(sig, ['ship', 'naval', 'vessel', 'cruiser', 'warship'])) {
        return { domain: 'naval', class: 'ship', roles: ['screen', 'naval_strike', 'patrol', 'recon'],
            capability_scores: scores({ naval_strike: 65, sensor: 65, survivability: 60, air_defense: 45, mobility: 45 }),
            best_use: ['surface screen', 'naval strike'], weaknesses: ['vulnerable to air/sub threat'] };
    }
    // Ground forces.
    if (has(sig, ['armor', 'tank', 'armored', 'armoured', 'mbt'])) {
        return { domain: 'ground', class: 'armor', roles: ['ground_attack', 'screen', 'defend'],
            capability_scores: scores({ ground_attack: 80, survivability: 75, mobility: 60, sensor: 30 }),
            best_use: ['mounted assault', 'mobile defense'], weaknesses: ['vulnerable from the air', 'logistics-heavy'] };
    }
    if (has(sig, ['infantry', 'mechanized', 'mechanised', 'motorized', 'motorised'])) {
        return { domain: 'ground', class: 'infantry', roles: ['defend', 'screen', 'hold'],
            capability_scores: scores({ ground_attack: 45, survivability: 50, mobility: 40, sensor: 30 }),
            best_use: ['hold ground', 'screen / defend terrain'], weaknesses: ['limited mobility', 'low organic firepower'] };
    }
    // Fixed sites / bases.
    if (has(sig, ['airbase', 'air-base', 'air base', 'naval-base', 'naval base', 'airfield', 'port', 'logistics', 'base', 'depot'])) {
        return { domain: 'base', class: 'base', roles: ['defend', 'support'],
            capability_scores: scores({ survivability: 70, sensor: 35, mobility: 0 }),
            best_use: ['sustainment / basing of forces', 'defended site'], weaknesses: ['fixed / cannot maneuver', 'high-value target'] };
    }
    return null;
}

/**
 * classifyUnit(unit) → capability profile.
 * Precedence: explicit scenario fields override the keyword catalog, which
 * overrides the heuristic fallback. `source` reflects which path produced it.
 */
function classifyUnit(unit) {
    var u = unit || {};
    var sig = keywordSignal(u);
    var cat = catalogClassify(sig);

    // Heuristic fallback if no catalog keyword matched.
    var profile = cat || {
        domain: 'unknown', class: 'unknown', roles: ['support'],
        capability_scores: scores({ survivability: 30, mobility: 30 }),
        best_use: ['undetermined — review unit data'], weaknesses: ['unknown capability profile'],
    };
    var source = cat ? 'catalog' : 'heuristic';
    var confidence = cat ? 'medium' : 'low';

    // Explicit scenario overrides (highest precedence).
    var explicitUsed = false;
    if (u.domain != null) { profile.domain = String(u.domain); explicitUsed = true; }
    if (u.class != null) { profile.class = String(u.class); explicitUsed = true; }
    if (u.roles != null && Array.isArray(u.roles) && u.roles.length) { profile.roles = u.roles.slice(); explicitUsed = true; }
    if (u.capability_scores && typeof u.capability_scores === 'object') {
        var merged = scores(profile.capability_scores);
        for (var i = 0; i < CAPABILITY_KEYS.length; i++) {
            var k = CAPABILITY_KEYS[i];
            if (u.capability_scores[k] != null) merged[k] = Number(u.capability_scores[k]) || 0;
        }
        profile.capability_scores = merged;
        explicitUsed = true;
    }
    if (explicitUsed) { source = 'explicit_scenario'; confidence = 'high'; }

    return {
        unit_uid: unitUid(u),
        platform_name: u.platform_name || u.platform || u.label || u.role || null,
        domain: profile.domain,
        class: profile.class,
        roles: profile.roles.slice(),
        capability_scores: scores(profile.capability_scores),
        best_use: (profile.best_use || []).slice(),
        weaknesses: (profile.weaknesses || []).slice(),
        confidence: confidence,
        source: source,
        demo_only: true, review_only: true,
    };
}

function classifiedBySide(units) {
    var red = [], blue = [];
    arr(units).forEach(function (u) {
        var c = classifyUnit(u);
        if (unitSide(u) === 'BLUE') blue.push(c); else red.push(c);
    });
    return { red: red, blue: blue };
}

function avgScores(classified) {
    var sum = zeroScores();
    if (!classified.length) return sum;
    classified.forEach(function (c) {
        CAPABILITY_KEYS.forEach(function (k) { sum[k] += Number(c.capability_scores[k]) || 0; });
    });
    var out = {};
    CAPABILITY_KEYS.forEach(function (k) { out[k] = Math.round((sum[k] / classified.length) * 10) / 10; });
    return out;
}

function uniqueClasses(classified) {
    var seen = {}, out = [];
    classified.forEach(function (c) { if (c.class && !seen[c.class]) { seen[c.class] = true; out.push(c.class); } });
    return out;
}

/** summarizeCapabilities(units) → { red, blue } summary blocks. */
function summarizeCapabilities(units) {
    var split = classifiedBySide(units);
    return {
        red: { count: split.red.length, classes: uniqueClasses(split.red), avg: avgScores(split.red) },
        blue: { count: split.blue.length, classes: uniqueClasses(split.blue), avg: avgScores(split.blue) },
        demo_only: true, review_only: true,
    };
}

// Summed score for a capability across a classified side (captures both quality
// and quantity — more capable units → higher side total).
function sideTotal(classified, key) {
    var t = 0;
    classified.forEach(function (c) { t += Number(c.capability_scores[key]) || 0; });
    return t;
}

function compareSide(redTotal, blueTotal) {
    if (redTotal <= 0 && blueTotal <= 0) return 'unknown';
    var hi = Math.max(redTotal, blueTotal), lo = Math.min(redTotal, blueTotal);
    // "Close" if the weaker side is within 25% of the stronger → contested.
    if (lo > 0 && lo >= hi * 0.75) return 'contested';
    return redTotal > blueTotal ? 'RED' : 'BLUE';
}

/** computeSuperiority(units) → per-capability RED/BLUE/contested/unknown verdict. */
function computeSuperiority(units) {
    var split = classifiedBySide(units);
    return {
        air: compareSide(sideTotal(split.red, 'air_superiority'), sideTotal(split.blue, 'air_superiority')),
        naval: compareSide(sideTotal(split.red, 'naval_strike'), sideTotal(split.blue, 'naval_strike')),
        ground: compareSide(sideTotal(split.red, 'ground_attack'), sideTotal(split.blue, 'ground_attack')),
        sensor: compareSide(sideTotal(split.red, 'sensor'), sideTotal(split.blue, 'sensor')),
        demo_only: true, review_only: true,
    };
}

// Map a "role needed" to the capability score used to rank assets for it.
var ROLE_SCORE = {
    intercept: 'air_superiority',
    air_superiority: 'air_superiority',
    naval_strike: 'naval_strike',
    air_defense: 'air_defense',
    defend: 'air_defense',
    ground_attack: 'ground_attack',
    sensor: 'sensor',
    recon: 'sensor',
};

/**
 * bestAssetsForSide(units, side, roleNeeded) → [{unit_uid, class, score}] desc.
 * Ranks the requested side's units by the capability that matters for the role.
 */
function bestAssetsForSide(units, side, roleNeeded) {
    var want = String(side || 'BLUE').toUpperCase();
    var key = ROLE_SCORE[roleNeeded] || 'survivability';
    var out = [];
    arr(units).forEach(function (u) {
        if (unitSide(u) !== want) return;
        var c = classifyUnit(u);
        out.push({ unit_uid: c.unit_uid, class: c.class, score: Number(c.capability_scores[key]) || 0 });
    });
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
}

module.exports = {
    classifyUnit: classifyUnit,
    summarizeCapabilities: summarizeCapabilities,
    computeSuperiority: computeSuperiority,
    bestAssetsForSide: bestAssetsForSide,
    CAPABILITY_KEYS: CAPABILITY_KEYS,
};
