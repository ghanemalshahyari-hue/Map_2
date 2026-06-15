'use strict';
/* ============================================================================
 * commander-brief.js — shared AI-intelligence narrative composer
 * ----------------------------------------------------------------------------
 * Composes a flowing commander / intelligence narrative from a COA `plan` and
 * its `intel` snapshot. Works for the ACTIVE side:
 *   • BLUE (defender)  → layered defense (early warning → engagement-ready).
 *   • RED  (attacker)  → approach axes + RED COA options.
 *
 * REVIEW-ONLY / DEMO. The brief is a deterministic narrative draft meant for
 * review and refinement (an LLM with doctrine can improve the prose). It is
 * NOT final tasking and requires commander approval. No classified data — all
 * platform / coalition references are public/demo abstractions. The brief
 * NEVER emits engage/destroy/kill instructions: posture / intercept / warn only.
 *
 * Scenario-generic: no hardcoded scenario/draft names, no hardcoded unit IDs.
 * Pure module — no DOM, no network, requireable in isolation (CommonJS).
 *
 * Exports:
 *   buildCommanderBrief(plan, intel, opts) → composed commander brief
 * ========================================================================== */

var coalition = require('./coalition-posture-engine');
var catalog = require('./platform-capability-catalog');
// RMOOZ-UNIT-IDENTITY-CONTRACT-A: shared identity contract, so the brief names units by
// their operator-facing displayName (with the linking code in parentheses), not a bare uid.
var IDENTITY = null;
try { IDENTITY = require('../../client/shared/unit-identity-resolver.js'); } catch (_) { IDENTITY = null; }

function arr(v) { return Array.isArray(v) ? v : []; }
function obj(v) { return (v && typeof v === 'object') ? v : {}; }
function str(v) { return String(v == null ? '' : v); }
function cap(s) { var t = str(s); return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }

// uid/internalKey → { displayName } index over the supplied units (which carry
// unit_identity from the client). Falls back to the shared resolver when needed.
function buildNameIndex(units) {
    var idx = {};
    arr(units).forEach(function (u) {
        if (!u) return;
        var key = u.uid || u.unit_uid || u.id;
        if (key == null) return;
        var dn = (u.unit_identity && u.unit_identity.display_name)
            || (u.identity && u.identity.displayName)
            || u.display_name
            || (IDENTITY && IDENTITY.displayUnitName ? IDENTITY.displayUnitName(u) : null);
        if (dn && dn !== '—') idx[String(key)] = str(dn);
    });
    return idx;
}
// "Display Name (CODE)" when both differ; just one otherwise; never empty.
function nameWithCode(uid, index) {
    var code = str(uid == null ? '' : uid);
    var dn = index && code && index[code];
    if (dn && dn !== code) return dn + ' (' + code + ')';
    return dn || code || 'asset';
}

// --------------------------------------------------------------------------
// Section helpers
// --------------------------------------------------------------------------

function resolveObjectiveName(plan, intel, opts) {
    var ss = obj(plan && plan.situation_state);
    var o = obj(ss.objective);
    if (o.name) return str(o.name);
    if (o.label) return str(o.label);
    var zs = obj(intel && intel.zone_state);
    if (zs.owner_country && zs.owner_country !== 'unknown') {
        var zt = str(zs.zone_type || 'protected area').replace(/_/g, ' ');
        return cap(zt) + ' (' + zs.owner_country + ')';
    }
    if (opts && opts.objective_name) return str(opts.objective_name);
    return 'Objective X';
}

function buildMissionUnderstanding(side, objectiveName) {
    if (side === 'RED') {
        return 'Mission: develop approaches against ' + objectiveName + ' as the active (attacking) side. ' +
            'The AI first builds an intelligence picture, then weighs approach axes and COA options before any ' +
            'commitment — expecting the defender to detect early, warn, intercept, reinforce and reach an ' +
            'engagement-ready (defensive) posture. This is a review-only draft, not committed tasking.';
    }
    return objectiveName + ' is treated as a protected area. Any hostile approach toward it triggers a layered ' +
        'defense — early detection, then warning, then intercept, then reinforcement, escalating to an ' +
        'engagement-ready (defensive) posture — and the AI builds an intelligence picture before committing any force.';
}

function buildThreatSummary(intel) {
    var zs = obj(intel && intel.zone_state);
    var cp = obj(intel && intel.contact_picture);
    var nearest = arr(cp.nearest_threats);
    var parts = [];
    if (zs.violation) {
        var ztype = str(zs.zone_type || 'zone').replace(/_/g, ' ');
        var owner = (zs.owner_country && zs.owner_country !== 'unknown') ? ' (' + zs.owner_country + ')' : '';
        parts.push('Active violation: intruder inside the inferred ' + ztype + owner +
            ' — severity ' + str(zs.severity || 'watch') + '.');
    } else {
        parts.push('No current zone violation — maintain watch.');
    }
    if (nearest.length) {
        var n0 = obj(nearest[0]);
        var dTxt = (n0.distance_deg != null) ? (' at ~' + (Math.round(Number(n0.distance_deg) * 1000) / 1000) + ' deg') : '';
        parts.push('Nearest threat ' + str(n0.unit_uid || 'contact') + dTxt +
            (nearest.length > 1 ? ' (' + nearest.length + ' threats tracked).' : '.'));
    }
    return parts.join(' ');
}

// Derive present domains from enemy units (classifyUnit) and/or superiority keys.
function buildDomains(intel, opts, side) {
    var present = {};
    var units = arr(opts && opts.units);
    var enemySide = side === 'RED' ? 'BLUE' : 'RED';
    units.forEach(function (u) {
        if (!u) return;
        if (String(u.side || '').toUpperCase() !== enemySide) return;
        var c = catalog.classifyUnit(u);
        var d = str(c.domain).toLowerCase();
        if (d === 'air' || d === 'air_defense' || d === 'radar') present.air = true;
        else if (d === 'naval') present.naval = true;
        else if (d === 'ground' || d === 'base') present.ground = true;
    });
    // Supplement from superiority keys (a contested/enemy-held domain is "present").
    var sup = obj(intel && intel.superiority);
    if (sup.air && sup.air !== 'unknown') present.air = true;
    if (sup.naval && sup.naval !== 'unknown') present.naval = true;
    if (sup.ground && sup.ground !== 'unknown') present.ground = true;
    var out = [];
    if (present.air) out.push('air');
    if (present.naval) out.push('naval');
    if (present.ground) out.push('ground');
    return out;
}

function buildMostCapableFriendly(intel) {
    var best = arr(intel && intel.best_blue_assets).slice(0, 3);
    var role = str((intel && intel.best_asset_role) || '');
    return best.map(function (b) {
        b = obj(b);
        return { unit_uid: b.unit_uid != null ? b.unit_uid : null, class: str(b.class || 'unknown'), role: role || 'defend' };
    });
}

function buildMostDangerousEnemy(intel) {
    var cp = obj(intel && intel.contact_picture);
    return arr(cp.nearest_threats).slice(0, 3).map(function (t) {
        t = obj(t);
        var dTxt = (t.distance_deg != null) ? ('~' + (Math.round(Number(t.distance_deg) * 1000) / 1000) + ' deg from the objective') : 'bearing on the objective';
        return { unit_uid: t.unit_uid != null ? t.unit_uid : null, note: 'Nearest threat, ' + dTxt + '.' };
    });
}

function findRecommendedCoa(plan) {
    var coas = arr(plan && plan.coas);
    var recId = plan && plan.recommended_plan_id;
    var rec = null;
    if (recId != null) rec = coas.filter(function (c) { return c && c.plan_id === recId; })[0] || null;
    if (!rec) rec = coas.filter(function (c) { return c && c.recommended; })[0] || null;
    if (!rec) rec = coas[0] || null;
    return rec;
}

// Derive recommended-COA actions from its role_breakdown + any warning_actions.
function buildCoaActions(coa) {
    var actions = [];
    var rb = obj(coa && coa.role_breakdown);
    function add(role, verb) {
        var n = Number(rb[role]) || 0;
        if (n > 0) actions.push(cap(verb) + ' with ' + n + ' ' + role + ' unit' + (n === 1 ? '' : 's') + '.');
    }
    add('intercept', 'move to intercept/block the approach axis');
    add('screen', 'screen the flank');
    add('reinforce', 'reinforce the protected area');
    add('defend', 'hold prepared defensive positions');
    add('reserve', 'keep in reserve for depth');
    add('recon', 'lead with reconnaissance to develop the picture');
    add('assault', 'commit assault element along the chosen axis');
    add('support', 'fix the enemy by support fire (no engagement without approval)');
    add('hold', 'hold position pending results');
    arr(coa && coa.warning_actions).forEach(function (w) {
        var t = str(w && (w.text || w.label || w)).trim();
        if (t) actions.push(t);
    });
    if (!actions.length) actions.push('Maintain current posture pending commander direction.');
    return actions;
}

function buildRoe(intel) {
    return {
        alert: str((intel && intel.alert_state) || 'WATCH'),
        roe: str((intel && intel.roe_state) || 'hold'),
        note: 'ROE / alert reflect the inferred situation — posture and warnings only; engagement requires approval.',
    };
}

// BLUE layered defense — 5 layers, referencing real assets / zone where present.
function buildLayeredDefense(intel, objectiveName, friendly) {
    var lead = (friendly[0] && (friendly[0].name || friendly[0].unit_uid != null)) ? (' (e.g. ' + str(friendly[0].name || friendly[0].unit_uid) + ')') : '';
    var zs = obj(intel && intel.zone_state);
    var owner = (zs.owner_country && zs.owner_country !== 'unknown') ? (zs.owner_country + ' ') : '';
    return [
        { layer: 1, name: 'Early warning', text: 'Sensors and early-warning assets detect and track approaching contacts toward ' + objectiveName + '.' },
        { layer: 2, name: 'Warning zone', text: 'Contacts entering the inferred ' + owner + 'warning zone are challenged and warned off before any closer approach.' },
        { layer: 3, name: 'Intercept line', text: 'Interceptors / screening assets' + lead + ' move to the approach axis to block and shadow the threat short of the protected area.' },
        { layer: 4, name: 'Defended zone', text: 'Reinforcement assets thicken the defense of ' + objectiveName + ' to absorb pressure and deny penetration.' },
        { layer: 5, name: 'Engagement-ready', text: 'Force reaches an engagement-ready (defensive) posture — engagement only on approved hostile criteria; escalation requires ROE / national / coalition approval.' },
    ];
}

// RED approach axes (used instead of layered defense for the attacking side).
function buildApproachAxes(domains, objectiveName) {
    var axes = [];
    if (domains.indexOf('naval') !== -1) axes.push({ axis: 'sea', text: 'Maritime approach toward ' + objectiveName + ' — expect surface screen and territorial-waters challenge.' });
    if (domains.indexOf('air') !== -1) axes.push({ axis: 'air', text: 'Air approach toward ' + objectiveName + ' — expect early-warning detection and intercept short of the protected area.' });
    if (domains.indexOf('ground') !== -1) axes.push({ axis: 'land', text: 'Land approach toward ' + objectiveName + ' — expect buffer screening and prepared defensive positions.' });
    if (!axes.length) axes.push({ axis: 'air', text: 'Primary approach toward ' + objectiveName + ' — defender will detect, warn and intercept before commitment.' });
    return axes;
}

function buildCoalitionPosture(intel, opts, side) {
    var zs = obj(intel && intel.zone_state);
    var defending = str((intel && intel.defending_side) || 'BLUE').toUpperCase();
    // Prefer the zone owner's country; otherwise infer from the defender's units / scenario name.
    var coName = coalition.detectCoalition(zs.owner_country).coalition;
    if (coName === 'none') {
        coName = coalition.coalitionForSide(arr(opts && opts.units), defending, opts && opts.scenario_name);
    }
    var alert = str((intel && intel.alert_state) || 'WATCH');
    var posture = coalition.coalitionPosture(coName, alert, null);
    var text;
    if (coName === 'none') {
        text = 'No recognized coalition inferred — national defense posture only at alert ' + posture.alert_state + '.';
    } else {
        text = coName + ' coalition: ' + posture.lead_nation + ' responds first; partner readiness ' +
            posture.partner_readiness + ' at alert ' + posture.alert_state + '. ' +
            'Support: ' + arr(posture.support_actions).join('; ') + '. ' + posture.escalation_rule + '.';
    }
    return {
        coalition: posture.coalition,
        lead_nation: posture.lead_nation,
        text: text,
        event_log_entries: arr(posture.event_log_entries).slice(),
    };
}

// RED COA narrative — summarize plan.coas (or generic RED families) as
// {intent, why, risk, expected_reaction}. recommended_red_coa = a low-risk
// recon/probe first if available, else the plan's recommended COA.
var GENERIC_RED_FAMILIES = [
    { plan_id: 'RED-PROBE', title: 'Probe / Recon', risk: 'low',
      intent: 'Develop the defender picture before committing the main body.',
      why: 'Reveals the layered defense and reduces uncertainty at lowest exposure.',
      expected_reaction: 'Defender stays concealed or warns the probe; may displace before the main body commits.' },
    { plan_id: 'RED-FLANK', title: 'Flank / Fix', risk: 'medium',
      intent: 'Fix the defender by demonstration while a flank develops an alternate axis.',
      why: 'Balances tempo and force preservation against a layered defense.',
      expected_reaction: 'Defender reinforces the threatened axis and screens the flank.' },
    { plan_id: 'RED-DIRECT', title: 'Direct Approach', risk: 'high',
      intent: 'Apply maximum pressure on the most direct axis to the objective.',
      why: 'Fastest tempo — accepts the highest exposure to intercept and defended-zone fires.',
      expected_reaction: 'Defender concentrates intercept and reinforcement on the approach axis.' },
];

function buildRedCoaNarrative(plan, side) {
    var coas = arr(plan && plan.coas).slice(0, 3);
    var list;
    if (coas.length) {
        list = coas.map(function (c) {
            c = obj(c);
            var why = arr(c.rationale)[0] || (cap(c.risk || 'medium') + '-risk course of action.');
            var reaction = arr(c.expected_enemy_reaction)[0] || 'Defender reaction uncertain — review-only preview.';
            return {
                plan_id: str(c.plan_id || 'COA-?'),
                title: str(c.title || 'Course of action'),
                intent: str(c.summary || c.title || 'Course of action'),
                why: str(why),
                risk: str(c.risk || 'medium'),
                expected_reaction: str(reaction),
            };
        });
    } else {
        list = GENERIC_RED_FAMILIES.slice();
    }
    return list;
}

function pickRecommendedRed(narrative, plan) {
    // Prefer a low-risk recon/probe option first.
    var probe = arr(narrative).filter(function (n) {
        return n && (str(n.risk).toLowerCase() === 'low' || /probe|recon/i.test(str(n.title)));
    })[0];
    if (probe) return probe.plan_id;
    if (plan && plan.recommended_plan_id != null) return str(plan.recommended_plan_id);
    return (arr(narrative)[0] && arr(narrative)[0].plan_id) || null;
}

// --------------------------------------------------------------------------
// Prose assembly
// --------------------------------------------------------------------------
function assembleText(b) {
    var lines = [];
    lines.push('AI Commander Decision — ' + b.objective_name + ' (' + b.side + ', review-only)');
    lines.push('');
    lines.push('Mission Understanding: ' + b.mission_understanding);
    lines.push('');
    lines.push('Threat Summary: ' + b.threat_summary);
    if (b.domains.length) lines.push('Domains in contact: ' + b.domains.join(', ') + '.');
    lines.push('');
    if (b.most_capable_friendly.length) {
        lines.push('Most capable friendly assets:');
        b.most_capable_friendly.forEach(function (f) {
            lines.push('  - ' + str(f.name || (f.unit_uid != null ? f.unit_uid : 'asset')) + ' [' + f.class + '] role ' + f.role + '.');
        });
    }
    if (b.most_dangerous_enemy.length) {
        lines.push('Most dangerous enemy:');
        b.most_dangerous_enemy.forEach(function (e) {
            lines.push('  - ' + str(e.name || (e.unit_uid != null ? e.unit_uid : 'contact')) + ': ' + e.note);
        });
    }
    lines.push('');
    if (b.recommended_coa && b.recommended_coa.plan_id) {
        lines.push('Recommended COA: ' + b.recommended_coa.plan_id + ' — ' + b.recommended_coa.title + '.');
        if (b.why.length) { lines.push('Why:'); b.why.forEach(function (w) { lines.push('  - ' + str(w)); }); }
        if (b.actions.length) { lines.push('Actions:'); b.actions.forEach(function (a) { lines.push('  - ' + str(a)); }); }
        if (b.expected_enemy_reaction.length) {
            lines.push('Expected enemy reaction (preview only):');
            b.expected_enemy_reaction.forEach(function (r) { lines.push('  - ' + str(r)); });
        }
    }
    lines.push('');
    lines.push('ROE / Alert: alert ' + b.roe.alert + ', ROE ' + b.roe.roe + '. ' + b.roe.note);
    lines.push('');
    if (b.layered_defense && b.layered_defense.length) {
        lines.push('Layered defense:');
        b.layered_defense.forEach(function (l) { lines.push('  ' + l.layer + '. ' + l.name + ' — ' + l.text); });
        lines.push('');
    }
    if (b.approach_axes && b.approach_axes.length) {
        lines.push('Approach axes:');
        b.approach_axes.forEach(function (a) { lines.push('  - ' + cap(a.axis) + ': ' + a.text); });
        lines.push('');
    }
    if (b.coalition_posture) {
        lines.push('Coalition posture: ' + b.coalition_posture.text);
        lines.push('');
    }
    if (b.red_coa_narrative && b.red_coa_narrative.length) {
        lines.push('RED COA options:');
        b.red_coa_narrative.forEach(function (r) {
            lines.push('  - ' + r.plan_id + ' ' + r.title + ' [' + r.risk + ' risk]: ' + r.intent);
            lines.push('    why: ' + r.why);
            lines.push('    expected reaction: ' + r.expected_reaction);
        });
        if (b.recommended_red_coa) lines.push('  Recommended RED COA: ' + b.recommended_red_coa + '.');
        lines.push('');
    }
    lines.push('NOTE: This is a review-only draft — not final tasking; requires commander approval. ' +
        'Posture / intercept / warning only — no engagement without approved ROE.');
    return lines.join('\n');
}

/**
 * buildCommanderBrief(plan, intel, opts) → composed commander brief.
 * opts: { includeRed?, side?, units?, scenario_name? }
 */
function buildCommanderBrief(plan, intel, opts) {
    plan = obj(plan);
    intel = obj(intel);
    opts = obj(opts);

    var side = str(opts.side || plan.active_side || 'BLUE').toUpperCase();
    if (side !== 'RED' && side !== 'BLUE') side = 'BLUE';

    var objectiveName = resolveObjectiveName(plan, intel, opts);
    var domains = buildDomains(intel, opts, side);
    var friendly = buildMostCapableFriendly(intel);
    var dangerous = buildMostDangerousEnemy(intel);

    // RMOOZ-UNIT-IDENTITY-CONTRACT-A: name assets by operator-facing displayName (linking
    // code in parens), consuming the same identity the marker/panel/LLM use.
    var nameIndex = buildNameIndex(opts.units);
    friendly.forEach(function (f) { f.name = nameWithCode(f.unit_uid, nameIndex); });
    dangerous.forEach(function (e) { e.name = nameWithCode(e.unit_uid, nameIndex); });

    var recCoa = findRecommendedCoa(plan);
    var recommended_coa = recCoa
        ? { plan_id: str(recCoa.plan_id || 'COA-?'), title: str(recCoa.title || 'Course of action') }
        : { plan_id: null, title: null };
    var why = recCoa ? arr(recCoa.rationale).map(str) : [];
    var actions = recCoa ? buildCoaActions(recCoa) : ['Maintain current posture pending commander direction.'];
    var expected_enemy_reaction = recCoa ? arr(recCoa.expected_enemy_reaction).map(str) : [];

    var roe = buildRoe(intel);
    var coalition_posture = buildCoalitionPosture(intel, opts, side);

    var layered_defense = (side === 'BLUE') ? buildLayeredDefense(intel, objectiveName, friendly) : [];
    var approach_axes = (side === 'RED') ? buildApproachAxes(domains, objectiveName) : [];

    var includeRed = !!opts.includeRed || side === 'RED';
    var red_coa_narrative = includeRed ? buildRedCoaNarrative(plan, side) : [];
    var recommended_red_coa = includeRed ? pickRecommendedRed(red_coa_narrative, plan) : null;

    var brief = {
        side: side,
        objective_name: objectiveName,
        mission_understanding: buildMissionUnderstanding(side, objectiveName),
        threat_summary: buildThreatSummary(intel),
        domains: domains,
        most_capable_friendly: friendly,
        most_dangerous_enemy: dangerous,
        recommended_coa: recommended_coa,
        why: why,
        actions: actions,
        roe: roe,
        expected_enemy_reaction: expected_enemy_reaction,
        layered_defense: layered_defense,
        approach_axes: approach_axes,
        coalition_posture: coalition_posture,
        red_coa_narrative: red_coa_narrative,
        recommended_red_coa: recommended_red_coa,
        demo_only: true,
        review_only: true,
    };
    brief.text = assembleText(brief);
    return brief;
}

module.exports = {
    buildCommanderBrief: buildCommanderBrief,
};
