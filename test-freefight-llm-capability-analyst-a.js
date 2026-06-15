#!/usr/bin/env node
/*
 * FREEFIGHT-LLM-CAPABILITY-ANALYST-A — standalone test suite
 *
 * §1   heuristic: F-14/Tomcat → domain air, class fighter|interceptor, roles air_superiority+intercept
 * §2   heuristic: radar → domain radar, class radar, sensor high, weapon scores ~0
 * §3   heuristic: SAM/Patriot/S-300 → domain air_defense, class sam, air_defense high
 * §4   heuristic: frigate/corvette/patrol boat → domain naval, naval_screen role
 * §5   heuristic: infantry & armor → domain ground (armor higher ground_attack)
 * §6   LLM cannot invent IDs (GHOST-999 dropped; all uids ∈ input)
 * §7   remote provider blocked → heuristic, provider never called
 * §8   LLM timeout/error → heuristic fallback, no throw
 * §9   buildCapabilitySummary best.* picks the right class
 * §10  selectBestUnitsForMission('air_intercept','BLUE',2) → interceptors/fighters first
 * §11  normalizeCapabilityProfile clamps/whitelists/forces review + uid from unit
 * §12  no classified claims: disclaimer present, no positive classified claim, no hardcoded literals
 * §13  scenario-generic: arbitrary names classify; one-per-unit, in input order
 * §14  every profile review_required===true and valid source enum
 */
'use strict';

var path = require('path');
var fs   = require('fs');
var MOD  = require(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-llm-capability-analyst.js'));

var passed = 0, failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  [PASS] ' + label); }
    else       { failed++; console.log('  [FAIL] ' + label); }
}

var VALID_SOURCES = ['llm_inferred', 'heuristic', 'explicit_scenario', 'catalog'];
var INPUT_UIDS = function (units) { return units.map(function (u) { return u.uid || u.unit_uid || u.id; }); };

function saveEnv(k) { return process.env[k]; }
function restoreEnv(k, v) { if (v !== undefined) process.env[k] = v; else delete process.env[k]; }

// Mock provider: returns a {profiles:[...]} JSON response.
function mockProfiles(profilesArr) {
    var called = false;
    return {
        generate: function () {
            called = true;
            return Promise.resolve({ ok: true, response: JSON.stringify({ profiles: profilesArr }) });
        },
        wasCalled: function () { return called; },
    };
}
function mockReject() {
    var called = false;
    return {
        generate: function () { called = true; return Promise.reject(new Error('boom')); },
        wasCalled: function () { return called; },
    };
}
function mockNotOk() {
    var called = false;
    return {
        generate: function () { called = true; return Promise.resolve({ ok: false, error: 'timeout' }); },
        wasCalled: function () { return called; },
    };
}

(async function main() {

    // ── §1  heuristic: fighter ───────────────────────────────────────────────
    console.log('\n§1  heuristic: F-14/Tomcat → air / fighter|interceptor / air_superiority+intercept');
    var u1 = [{ id: 'A1', side: 'BLUE', platform: 'F-14A Tomcat' }];
    var p1 = await MOD.analyzeUnitCapabilities(u1, {}, {});
    var pr1 = p1[0];
    ok('§1 one profile returned', p1.length === 1);
    ok('§1 domain = air', pr1.domain === 'air');
    ok('§1 class fighter|interceptor', pr1.class === 'fighter' || pr1.class === 'interceptor');
    ok('§1 roles include air_superiority', pr1.roles.indexOf('air_superiority') !== -1);
    ok('§1 roles include intercept', pr1.roles.indexOf('intercept') !== -1);
    ok('§1 source = heuristic', pr1.source === 'heuristic');
    ok('§1 intercept score > 0', pr1.capability_scores.intercept > 0);

    // ── §2  heuristic: radar ──────────────────────────────────────────────────
    console.log('\n§2  heuristic: radar → radar / sensor high / weapons ~0');
    var u2 = [{ id: 'R1', side: 'RED', platform: 'Early-Warning Radar' }];
    var p2 = await MOD.analyzeUnitCapabilities(u2, {}, {});
    var pr2 = p2[0];
    ok('§2 domain = radar', pr2.domain === 'radar');
    ok('§2 class = radar', pr2.class === 'radar');
    ok('§2 sensor high (>=70)', pr2.capability_scores.sensor >= 70);
    ok('§2 air_superiority ~0', pr2.capability_scores.air_superiority === 0);
    ok('§2 naval_strike ~0', pr2.capability_scores.naval_strike === 0);
    ok('§2 ground_attack ~0', pr2.capability_scores.ground_attack === 0);
    ok('§2 air_defense ~0', pr2.capability_scores.air_defense === 0);
    ok('§2 roles include sensor', pr2.roles.indexOf('sensor') !== -1);

    // ── §3  heuristic: SAM ────────────────────────────────────────────────────
    console.log('\n§3  heuristic: SAM/Patriot/S-300 → air_defense / sam / air_defense high');
    var u3 = [
        { id: 'S1', side: 'RED', platform: 'SAM battery' },
        { id: 'S2', side: 'RED', platform: 'Patriot' },
        { id: 'S3', side: 'RED', platform: 'S-300' },
    ];
    var p3 = await MOD.analyzeUnitCapabilities(u3, {}, {});
    p3.forEach(function (pr, i) {
        ok('§3[' + i + '] domain = air_defense', pr.domain === 'air_defense');
        ok('§3[' + i + '] class = sam', pr.class === 'sam');
        ok('§3[' + i + '] air_defense high (>=70)', pr.capability_scores.air_defense >= 70);
    });

    // ── §4  heuristic: naval ──────────────────────────────────────────────────
    console.log('\n§4  heuristic: frigate/corvette/patrol boat → naval / naval_screen role');
    var u4 = [
        { id: 'N1', side: 'BLUE', platform: 'Frigate' },
        { id: 'N2', side: 'BLUE', platform: 'Corvette' },
        { id: 'N3', side: 'BLUE', platform: 'Patrol Boat' },
    ];
    var p4 = await MOD.analyzeUnitCapabilities(u4, {}, {});
    p4.forEach(function (pr, i) {
        ok('§4[' + i + '] domain = naval', pr.domain === 'naval');
        ok('§4[' + i + '] roles include naval_screen', pr.roles.indexOf('naval_screen') !== -1);
        ok('§4[' + i + '] naval_screen score > 0', pr.capability_scores.naval_screen > 0);
    });

    // ── §5  heuristic: ground (armor higher ground_attack) ────────────────────
    console.log('\n§5  heuristic: infantry & armor → ground (armor higher ground_attack)');
    var u5 = [
        { id: 'G1', side: 'RED', platform: 'Infantry battalion' },
        { id: 'G2', side: 'RED', platform: 'Armor / MBT' },
    ];
    var p5 = await MOD.analyzeUnitCapabilities(u5, {}, {});
    var inf = p5[0], arm = p5[1];
    ok('§5 infantry domain = ground', inf.domain === 'ground');
    ok('§5 infantry class = infantry', inf.class === 'infantry');
    ok('§5 armor domain = ground', arm.domain === 'ground');
    ok('§5 armor class = armor', arm.class === 'armor');
    ok('§5 armor ground_attack > infantry ground_attack',
        arm.capability_scores.ground_attack > inf.capability_scores.ground_attack);
    ok('§5 infantry ground_hold high (>=50)', inf.capability_scores.ground_hold >= 50);

    // ── §6  LLM cannot invent IDs ─────────────────────────────────────────────
    console.log('\n§6  LLM cannot invent IDs (GHOST-999 dropped)');
    var s6 = saveEnv('RMOOZ_ALLOW_SIM_RUN');
    var s6p = saveEnv('RMOOZ_FREE_FIGHT_PROVIDER');
    process.env.RMOOZ_ALLOW_SIM_RUN = '1';
    delete process.env.RMOOZ_FREE_FIGHT_PROVIDER;
    var u6 = [
        { id: 'REAL-1', side: 'BLUE', platform: 'F-16 Fighter' },
        { id: 'REAL-2', side: 'RED', platform: 'Frigate' },
    ];
    var mock6 = mockProfiles([
        { unit_uid: 'GHOST-999', domain: 'air', class: 'fighter', capability_scores: { intercept: 90, air_superiority: 90 }, confidence: 'high' },
        { unit_uid: 'REAL-1', domain: 'air', class: 'fighter', roles: ['air_superiority', 'intercept'], capability_scores: { air_superiority: 88, intercept: 88 }, confidence: 'high' },
        { unit_uid: 'REAL-2', domain: 'naval', class: 'frigate', roles: ['naval_screen'], capability_scores: { naval_screen: 70 }, confidence: 'medium' },
    ]);
    var p6 = await MOD.analyzeUnitCapabilities(u6, {}, { useLlm: true }, mock6);
    var uids6 = INPUT_UIDS(u6);
    var allInInput = p6.every(function (pr) { return uids6.indexOf(pr.unit_uid) !== -1; });
    ok('§6 provider was called', mock6.wasCalled() === true);
    ok('§6 every returned uid ∈ input uids', allInInput === true);
    ok('§6 no profile has GHOST-999', p6.every(function (pr) { return pr.unit_uid !== 'GHOST-999'; }));
    ok('§6 one profile per input unit', p6.length === u6.length);
    ok('§6 REAL-1 source llm_inferred', p6[0].unit_uid === 'REAL-1' && p6[0].source === 'llm_inferred');
    ok('§6 input order preserved', p6[0].unit_uid === 'REAL-1' && p6[1].unit_uid === 'REAL-2');
    restoreEnv('RMOOZ_ALLOW_SIM_RUN', s6); restoreEnv('RMOOZ_FREE_FIGHT_PROVIDER', s6p);

    // ── §7  remote provider blocked ───────────────────────────────────────────
    console.log('\n§7  remote provider blocked → heuristic, provider never called');
    var s7 = saveEnv('RMOOZ_ALLOW_SIM_RUN');
    var s7p = saveEnv('RMOOZ_FREE_FIGHT_PROVIDER');
    process.env.RMOOZ_ALLOW_SIM_RUN = '1';
    process.env.RMOOZ_FREE_FIGHT_PROVIDER = 'claude';
    var mock7 = mockProfiles([{ unit_uid: 'A1', domain: 'air', class: 'fighter' }]);
    var p7 = await MOD.analyzeUnitCapabilities(u1, {}, { useLlm: true }, mock7);
    ok('§7 provider NOT called (remote blocked)', mock7.wasCalled() === false);
    ok('§7 source = heuristic', p7[0].source === 'heuristic');
    ok('§7 one profile per unit', p7.length === u1.length);
    restoreEnv('RMOOZ_ALLOW_SIM_RUN', s7); restoreEnv('RMOOZ_FREE_FIGHT_PROVIDER', s7p);

    // ── §8  LLM timeout/error → heuristic fallback ────────────────────────────
    console.log('\n§8  LLM timeout/error → heuristic fallback, no throw');
    var s8 = saveEnv('RMOOZ_ALLOW_SIM_RUN');
    var s8p = saveEnv('RMOOZ_FREE_FIGHT_PROVIDER');
    process.env.RMOOZ_ALLOW_SIM_RUN = '1';
    delete process.env.RMOOZ_FREE_FIGHT_PROVIDER;
    var u8 = [{ id: 'A1', side: 'BLUE', platform: 'F-14 Tomcat' }, { id: 'R1', side: 'RED', platform: 'Radar' }];
    var p8reject = await MOD.analyzeUnitCapabilities(u8, {}, { useLlm: true }, mockReject());
    ok('§8 reject → all heuristic', p8reject.every(function (pr) { return pr.source === 'heuristic'; }));
    ok('§8 reject → one per unit', p8reject.length === u8.length);
    var p8notok = await MOD.analyzeUnitCapabilities(u8, {}, { useLlm: true }, mockNotOk());
    ok('§8 !ok → all heuristic', p8notok.every(function (pr) { return pr.source === 'heuristic'; }));
    ok('§8 !ok → one per unit', p8notok.length === u8.length);
    // non-JSON response → heuristic
    var mockGarbage = { generate: function () { return Promise.resolve({ ok: true, response: 'not json at all' }); } };
    var p8garbage = await MOD.analyzeUnitCapabilities(u8, {}, { useLlm: true }, mockGarbage);
    ok('§8 non-JSON → all heuristic', p8garbage.every(function (pr) { return pr.source === 'heuristic'; }));
    restoreEnv('RMOOZ_ALLOW_SIM_RUN', s8); restoreEnv('RMOOZ_FREE_FIGHT_PROVIDER', s8p);

    // ── §9  buildCapabilitySummary ────────────────────────────────────────────
    console.log('\n§9  buildCapabilitySummary best.* per mission');
    var u9 = [
        { id: 'F', side: 'BLUE', platform: 'F-16 Fighter' },
        { id: 'RAD', side: 'BLUE', platform: 'Radar' },
        { id: 'SAM', side: 'BLUE', platform: 'SAM Patriot' },
        { id: 'FRIG', side: 'BLUE', platform: 'Frigate' },
        { id: 'INF', side: 'BLUE', platform: 'Infantry' },
    ];
    var p9 = await MOD.analyzeUnitCapabilities(u9, {}, {});
    var sum9 = MOD.buildCapabilitySummary(p9);
    ok('§9 best.air_intercept = F (fighter)', sum9.best.air_intercept && sum9.best.air_intercept.unit_uid === 'F');
    ok('§9 best.sensor = RAD (radar)', sum9.best.sensor && sum9.best.sensor.unit_uid === 'RAD');
    ok('§9 best.air_defense = SAM', sum9.best.air_defense && sum9.best.air_defense.unit_uid === 'SAM');
    ok('§9 best.naval_screen = FRIG', sum9.best.naval_screen && sum9.best.naval_screen.unit_uid === 'FRIG');
    ok('§9 counts.air >= 1', sum9.counts.air >= 1);
    ok('§9 counts.radar >= 1', sum9.counts.radar >= 1);
    ok('§9 by_side.BLUE present', !!sum9.by_side.BLUE);
    ok('§9 review_required true', sum9.review_required === true);

    // ── §10  selectBestUnitsForMission ────────────────────────────────────────
    console.log('\n§10  selectBestUnitsForMission(air_intercept, BLUE, 2) → fighters first');
    var u10 = [
        { id: 'F1', side: 'BLUE', platform: 'F-16 Fighter' },
        { id: 'F2', side: 'BLUE', platform: 'F-14 Interceptor' },
        { id: 'INF', side: 'BLUE', platform: 'Infantry' },
        { id: 'REDF', side: 'RED', platform: 'Fighter' },
    ];
    var p10 = await MOD.analyzeUnitCapabilities(u10, {}, {});
    var best10 = MOD.selectBestUnitsForMission(p10, 'air_intercept', 'BLUE', 2);
    ok('§10 returns 2 rows', best10.length === 2);
    ok('§10 all BLUE', best10.every(function (r) {
        var match = u10.filter(function (u) { return u.id === r.unit_uid; })[0];
        return match && match.side === 'BLUE';
    }));
    ok('§10 top rows are fighter/interceptor', best10.every(function (r) { return r.class === 'fighter' || r.class === 'interceptor'; }));
    ok('§10 sorted desc by score', best10[0].score >= best10[1].score);
    ok('§10 rows carry roles', Array.isArray(best10[0].roles));

    // ── §11  normalizeCapabilityProfile ───────────────────────────────────────
    console.log('\n§11  normalizeCapabilityProfile clamps/whitelists/forces review/uid-from-unit');
    var raw11 = {
        unit_uid: 'SPOOFED-ID',  // must be ignored
        domain: 'space',          // invalid → unknown
        class: 'death_star',      // invalid → unknown
        roles: ['air_superiority', 'teleport', 'intercept'],  // teleport dropped
        capability_scores: { air_superiority: 9999, intercept: -50, sensor: 42 },
        confidence: 'high',       // no scores test below covers; here scores present so high allowed
        source: 'remote_haxxor',  // invalid → llm_inferred default
    };
    var unit11 = { id: 'TRUE-UID', side: 'BLUE', platform: 'F-16' };
    var n11 = MOD.normalizeCapabilityProfile(raw11, unit11);
    ok('§11 unit_uid taken from unit (not raw)', n11.unit_uid === 'TRUE-UID');
    ok('§11 domain whitelisted (space → unknown)', n11.domain === 'unknown');
    ok('§11 class whitelisted (death_star → unknown)', n11.class === 'unknown');
    ok('§11 roles whitelisted (teleport dropped)', n11.roles.indexOf('teleport') === -1 && n11.roles.indexOf('air_superiority') !== -1);
    ok('§11 score clamped to 100', n11.capability_scores.air_superiority === 100);
    ok('§11 negative score clamped to 0', n11.capability_scores.intercept === 0);
    ok('§11 valid score preserved', n11.capability_scores.sensor === 42);
    ok('§11 source whitelisted → llm_inferred', n11.source === 'llm_inferred');
    ok('§11 review_required forced true', n11.review_required === true);
    // confidence high downgraded when no scores
    var n11b = MOD.normalizeCapabilityProfile({ confidence: 'high' }, unit11);
    ok('§11 confidence high without scores → medium', n11b.confidence === 'medium');

    // ── §12  no classified claims ─────────────────────────────────────────────
    console.log('\n§12  no classified claims / no hardcoded literals');
    var srcPath = path.join(__dirname, 'UI_MOdified/server/ai/free-fight-llm-capability-analyst.js');
    var src = fs.readFileSync(srcPath, 'utf8');
    ok('§12 has public/demo/abstraction disclaimer', /public/i.test(src) && /(demo|abstraction|review-only|review_required)/i.test(src));
    ok('§12 no "classified ranges:" positive claim', !/classified ranges:/i.test(src));
    ok('§12 no hardcoded "attack_objective" literal', !/attack_objective/i.test(src));
    ok('§12 no hardcoded "draft-" literal', !/draft-\d/i.test(src));
    ok('§12 no obvious hardcoded scenario UID literal', !/IR-F14-LOCAL/i.test(src));

    // ── §13  scenario-generic ─────────────────────────────────────────────────
    console.log('\n§13  scenario-generic: arbitrary names classify; one-per-unit in order');
    var u13 = [
        { uid: 'ZULU-9', side: 'RED', platform: 'Su-30' },
        { uid: 'HOSTILE-7', side: 'BLUE', platform: 'frigate' },
    ];
    var p13 = await MOD.analyzeUnitCapabilities(u13, {}, {});
    ok('§13 one per unit', p13.length === 2);
    ok('§13 input order preserved', p13[0].unit_uid === 'ZULU-9' && p13[1].unit_uid === 'HOSTILE-7');
    ok('§13 Su-30 → air domain', p13[0].domain === 'air');
    ok('§13 frigate → naval domain', p13[1].domain === 'naval');

    // ── §14  every profile review_required + valid source ─────────────────────
    console.log('\n§14  every profile review_required===true and valid source enum');
    var all14 = [].concat(p1, p2, p3, p4, p5, p6, p7, p8reject, p9, p10, p13);
    ok('§14 all review_required === true', all14.every(function (pr) { return pr.review_required === true; }));
    ok('§14 all source ∈ valid enum', all14.every(function (pr) { return VALID_SOURCES.indexOf(pr.source) !== -1; }));
    ok('§14 all have unit_uid', all14.every(function (pr) { return !!pr.unit_uid; }));
    ok('§14 all domain ∈ allowed', all14.every(function (pr) {
        return ['air', 'naval', 'ground', 'air_defense', 'radar', 'base', 'logistics', 'unknown'].indexOf(pr.domain) !== -1;
    }));

    console.log('\nTOTAL: ' + (passed + failed) + '  PASS: ' + passed + '  FAIL: ' + failed);
    process.exit(failed ? 1 : 0);

}()).catch(function (e) {
    console.error('FATAL:', e);
    process.exit(1);
});
