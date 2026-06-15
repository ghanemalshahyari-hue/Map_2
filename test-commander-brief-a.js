'use strict';
// test-commander-brief-a.js — commander-brief.js unit tests.
// Pure Node, no server, no DOM. Builds a small scenario, calls buildScenarioIntel
// + planCoas, then buildCommanderBrief. Prints PASS:/FAIL:/TOTAL:, exits 1 on fail.

const fs = require('fs');
const path = require('path');
const MODULE_PATH = path.join(__dirname, 'UI_MOdified/server/ai/commander-brief.js');
const brief = require('./UI_MOdified/server/ai/commander-brief.js');
const INTEL = require('./UI_MOdified/server/ai/scenario-intel.js');
const PLANNER = require('./UI_MOdified/server/ai/free-fight-coa-planner.js');
const SRC = fs.readFileSync(MODULE_PATH, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  PASS: ' + name); }
    else { fail++; console.log('  FAIL: ' + name + (extra != null ? '  — ' + extra : '')); }
}
function noKillVerbs(s) { return !/\b(engage|destroy|kill)\b/i.test(String(s || '')); }

// ── Small Abu-Dhabi-style scenario (generic IDs, demo country) ────────────────
const objective = { name: 'Northern Coastal Approach', lat: 24.6, lon: 54.4 };
function blueScenario(country) {
    return {
        units: [
            { uid: 'BLU-1', side: 'BLUE', role: 'fighter', label: 'air patrol', country: country, coord: [54.42, 24.62] },
            { uid: 'BLU-2', side: 'BLUE', role: 'sam', label: 'patriot battery', country: country, coord: [54.41, 24.6] },
            { uid: 'BLU-3', side: 'BLUE', role: 'radar', label: 'early-warning radar', country: country, coord: [54.4, 24.58] },
            { uid: 'BLU-4', side: 'BLUE', role: 'frigate', label: 'coastal frigate', country: country, coord: [54.5, 24.65] },
            { uid: 'RED-1', side: 'RED', role: 'fighter', label: 'incoming flight', coord: [54.9, 24.9] },
            { uid: 'RED-2', side: 'RED', role: 'missile-boat', label: 'fast attack craft', coord: [54.95, 24.95] },
        ],
        objectives: [objective],
    };
}

async function main() {
    const sc = blueScenario('UAE');
    const intel = INTEL.buildScenarioIntel(sc.units, sc.objectives, { defending_side: 'BLUE', active_side: 'BLUE', scenario_name: 'demo coastal defense' });
    const plan = await PLANNER.planCoas(sc.units, sc.objectives, { active_side: 'BLUE', scenario_name: 'demo coastal defense' }, { preferSide: 'BLUE' });

    console.log('\n§1 BLUE brief core fields');
    const b = brief.buildCommanderBrief(plan, intel, { side: 'BLUE', units: sc.units, scenario_name: 'demo coastal defense' });
    ok('§1 mission_understanding non-empty', typeof b.mission_understanding === 'string' && b.mission_understanding.length > 10);
    ok('§1 threat_summary non-empty', typeof b.threat_summary === 'string' && b.threat_summary.length > 5);
    ok('§1 recommended_coa has plan_id', !!(b.recommended_coa && b.recommended_coa.plan_id), JSON.stringify(b.recommended_coa));
    ok('§1 why is array', Array.isArray(b.why) && b.why.length > 0);
    ok('§1 actions is array', Array.isArray(b.actions) && b.actions.length > 0);
    ok('§1 roe present', !!(b.roe && b.roe.alert && b.roe.roe));
    ok('§1 expected_enemy_reaction array', Array.isArray(b.expected_enemy_reaction));

    console.log('\n§2 BLUE 5 layered_defense layers');
    ok('§2 exactly 5 layers', Array.isArray(b.layered_defense) && b.layered_defense.length === 5, b.layered_defense.length);
    ok('§2 layer 1 Early warning', /early warning/i.test(b.layered_defense[0].name), b.layered_defense[0].name);
    ok('§2 layer 5 Engagement-ready', /engagement-ready/i.test(b.layered_defense[4].name), b.layered_defense[4].name);
    ok('§2 layers numbered 1..5', b.layered_defense.every(function (l, i) { return l.layer === i + 1; }));

    console.log('\n§3 best assets / nearest threats reflected');
    const intelBestUids = (intel.best_blue_assets || []).slice(0, 3).map(function (a) { return a.unit_uid; });
    const briefFriendlyUids = b.most_capable_friendly.map(function (f) { return f.unit_uid; });
    ok('§3 most_capable_friendly from intel best assets', briefFriendlyUids.length > 0 &&
        briefFriendlyUids.every(function (u) { return intelBestUids.indexOf(u) !== -1; }),
        JSON.stringify(briefFriendlyUids) + ' vs ' + JSON.stringify(intelBestUids));
    const threatUids = (intel.contact_picture.nearest_threats || []).map(function (t) { return t.unit_uid; });
    ok('§3 most_dangerous_enemy from nearest threats', b.most_dangerous_enemy.length > 0 &&
        b.most_dangerous_enemy.every(function (e) { return threatUids.indexOf(e.unit_uid) !== -1; }),
        JSON.stringify(b.most_dangerous_enemy.map(function (e) { return e.unit_uid; })));

    console.log('\n§4 coalition_posture present + correct coalition');
    ok('§4 coalition_posture present', !!b.coalition_posture);
    ok('§4 UAE scenario → GCC', b.coalition_posture.coalition === 'GCC', b.coalition_posture.coalition);
    ok('§4 GCC lead UAE', b.coalition_posture.lead_nation === 'UAE', b.coalition_posture.lead_nation);
    // NATO-country scenario
    const scN = blueScenario('France');
    const intelN = INTEL.buildScenarioIntel(scN.units, scN.objectives, { defending_side: 'BLUE', active_side: 'BLUE' });
    const planN = await PLANNER.planCoas(scN.units, scN.objectives, { active_side: 'BLUE' }, { preferSide: 'BLUE' });
    const bN = brief.buildCommanderBrief(planN, intelN, { side: 'BLUE', units: scN.units });
    ok('§4 France scenario → NATO', bN.coalition_posture.coalition === 'NATO', bN.coalition_posture.coalition);

    console.log('\n§5 includeRed → red_coa_narrative + recommended_red_coa');
    const bRed = brief.buildCommanderBrief(plan, intel, { side: 'BLUE', includeRed: true, units: sc.units });
    ok('§5 red_coa_narrative non-empty', Array.isArray(bRed.red_coa_narrative) && bRed.red_coa_narrative.length > 0, bRed.red_coa_narrative.length);
    ok('§5 red coa has intent/why/risk/expected_reaction', bRed.red_coa_narrative.every(function (r) {
        return r.intent && r.why && r.risk && r.expected_reaction;
    }), JSON.stringify(bRed.red_coa_narrative[0]));
    ok('§5 recommended_red_coa present', !!bRed.recommended_red_coa, bRed.recommended_red_coa);

    console.log('\n§6 text multi-line, starts AI Commander Decision, mentions objective + disclaimer');
    ok('§6 text is string', typeof b.text === 'string');
    ok('§6 multi-line', b.text.split('\n').length > 5, b.text.split('\n').length);
    ok('§6 starts with AI Commander Decision', /^AI Commander Decision/.test(b.text), b.text.slice(0, 40));
    ok('§6 mentions objective', b.text.indexOf(objective.name) !== -1);
    ok('§6 review-only / commander-approval disclaimer', /review-only/i.test(b.text) && /commander approval/i.test(b.text));

    console.log('\n§7 no engage/destroy/kill anywhere in brief text or actions');
    ok('§7 text no kill verbs', noKillVerbs(b.text));
    ok('§7 actions no kill verbs', b.actions.every(noKillVerbs), JSON.stringify(b.actions));
    ok('§7 red narrative no kill verbs', noKillVerbs(JSON.stringify(bRed.red_coa_narrative)));
    ok('§7 layered_defense no kill verbs', noKillVerbs(JSON.stringify(b.layered_defense)));

    console.log('\n§8 scenario-generic: arbitrary objective + unit IDs + NATO country');
    const genUnits = [
        { uid: 'XJ-9981', side: 'BLUE', role: 'destroyer', label: 'flagship', country: 'Germany', coord: [10.1, 53.5] },
        { uid: 'XJ-9982', side: 'BLUE', role: 'sam', label: 'air defense', country: 'Germany', coord: [10.0, 53.4] },
        { uid: 'ZZ-0001', side: 'RED', role: 'bomber', label: 'raider', coord: [10.5, 53.9] },
    ];
    const genObj = [{ name: 'Harbor Sector Zulu', lat: 53.4, lon: 10.0 }];
    const genIntel = INTEL.buildScenarioIntel(genUnits, genObj, { defending_side: 'BLUE', active_side: 'BLUE' });
    const genPlan = await PLANNER.planCoas(genUnits, genObj, { active_side: 'BLUE' }, { preferSide: 'BLUE' });
    const bGen = brief.buildCommanderBrief(genPlan, genIntel, { side: 'BLUE', units: genUnits, scenario_name: 'arbitrary harbor drill' });
    ok('§8 valid brief for arbitrary scenario', !!bGen && typeof bGen.text === 'string' && bGen.text.length > 50);
    ok('§8 arbitrary objective name in text', bGen.text.indexOf('Harbor Sector Zulu') !== -1);
    ok('§8 NATO coalition resolved', bGen.coalition_posture.coalition === 'NATO', bGen.coalition_posture.coalition);
    ok('§8 still 5 layers', bGen.layered_defense.length === 5);

    console.log('\n§9 source hygiene: no hardcoded draft/uid in module source');
    ok('§9 no draft- in source', !/\bdraft-\d+/i.test(SRC));
    ok('§9 no attack_objective in source', !/attack_objective/i.test(SRC));
    ok('§9 no specific BLU-/RED- unit id in source', !/['"](BLU|RED|XJ|ZZ)-\d+['"]/.test(SRC));
    ok('§9 header review-only', /review-only/i.test(SRC));

    console.log('\nPASS: ' + pass + '  FAIL: ' + fail + '  TOTAL: ' + (pass + fail));
    if (fail) process.exit(1);
}

main().catch(function (e) { console.error('FATAL', e); process.exit(1); });
