'use strict';
// test-intel-capability-catalog-a.js — platform-capability-catalog.js unit tests.
// Pure Node, no server, no DOM. Prints PASS:/FAIL:/TOTAL: and exits 1 on any fail.

const fs = require('fs');
const path = require('path');
const MODULE_PATH = path.join(__dirname, 'UI_MOdified/server/ai/platform-capability-catalog.js');
const cat = require('./UI_MOdified/server/ai/platform-capability-catalog.js');
const SRC = fs.readFileSync(MODULE_PATH, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  PASS: ' + name); }
    else { fail++; console.log('  FAIL: ' + name + (extra != null ? '  — ' + extra : '')); }
}

console.log('\n§1 F-14 / Tomcat → air / fighter|interceptor / air_superiority+intercept');
const f14 = cat.classifyUnit({ uid: 'R-001', label: 'f-14 tomcat', role: 'interceptor', coord: [48.55, 34.87], side: 'RED' });
ok('§1 domain air', f14.domain === 'air', f14.domain);
ok('§1 class fighter or interceptor', f14.class === 'fighter' || f14.class === 'interceptor', f14.class);
ok('§1 roles include air_superiority', f14.roles.indexOf('air_superiority') !== -1, JSON.stringify(f14.roles));
ok('§1 roles include intercept', f14.roles.indexOf('intercept') !== -1, JSON.stringify(f14.roles));
ok('§1 high air_superiority score', f14.capability_scores.air_superiority >= 75, f14.capability_scores.air_superiority);

console.log('\n§2 SAM / Patriot / S-300 → air_defense / sam / high air_defense');
const sam = cat.classifyUnit({ uid: 'B-001', label: 'patriot battery', role: 'sam', side: 'BLUE' });
const s300 = cat.classifyUnit({ uid: 'B-002', label: 's-300 site', side: 'BLUE' });
ok('§2 SAM domain air_defense', sam.domain === 'air_defense', sam.domain);
ok('§2 SAM class sam', sam.class === 'sam', sam.class);
ok('§2 SAM high air_defense', sam.capability_scores.air_defense >= 75, sam.capability_scores.air_defense);
ok('§2 S-300 domain air_defense', s300.domain === 'air_defense', s300.domain);

console.log('\n§3 Radar / P-37 → radar / high sensor / ~0 attack');
const radar = cat.classifyUnit({ uid: 'B-003', label: 'p-37 early-warning radar', side: 'BLUE' });
ok('§3 domain radar', radar.domain === 'radar', radar.domain);
ok('§3 class radar', radar.class === 'radar', radar.class);
ok('§3 high sensor', radar.capability_scores.sensor >= 80, radar.capability_scores.sensor);
ok('§3 ~0 ground_attack', radar.capability_scores.ground_attack === 0, radar.capability_scores.ground_attack);
ok('§3 ~0 air_superiority', radar.capability_scores.air_superiority === 0, radar.capability_scores.air_superiority);

console.log('\n§4 Frigate / corvette / patrol boat → naval');
ok('§4 frigate domain naval', cat.classifyUnit({ label: 'frigate', side: 'BLUE' }).domain === 'naval');
ok('§4 corvette domain naval', cat.classifyUnit({ label: 'corvette', side: 'BLUE' }).domain === 'naval');
ok('§4 patrol boat domain naval', cat.classifyUnit({ label: 'missile patrol-boat', side: 'BLUE' }).domain === 'naval');

console.log('\n§5 Infantry & armor → ground (armor > infantry ground_attack)');
const inf = cat.classifyUnit({ label: 'infantry company', role: 'infantry', side: 'RED' });
const arm = cat.classifyUnit({ label: 'armor battalion', role: 'armor', side: 'RED' });
ok('§5 infantry domain ground', inf.domain === 'ground', inf.domain);
ok('§5 armor domain ground', arm.domain === 'ground', arm.domain);
ok('§5 armor ground_attack > infantry', arm.capability_scores.ground_attack > inf.capability_scores.ground_attack,
    arm.capability_scores.ground_attack + ' vs ' + inf.capability_scores.ground_attack);

console.log('\n§6 base / airbase → base / mobility 0');
const base = cat.classifyUnit({ label: 'forward airbase', side: 'BLUE' });
ok('§6 domain base', base.domain === 'base', base.domain);
ok('§6 mobility 0', base.capability_scores.mobility === 0, base.capability_scores.mobility);

console.log('\n§7 computeSuperiority RED air / contested / unknown');
const redAirStrong = [
    { uid: 'R-1', label: 'f-15 fighter', side: 'RED' },
    { uid: 'R-2', label: 'f-16 fighter', side: 'RED' },
    { uid: 'B-1', label: 'infantry', side: 'BLUE' },
];
ok('§7 strong RED air → air RED', cat.computeSuperiority(redAirStrong).air === 'RED', cat.computeSuperiority(redAirStrong).air);
const balanced = [
    { uid: 'R-1', label: 'f-15 fighter', side: 'RED' },
    { uid: 'B-1', label: 'f-16 fighter', side: 'BLUE' },
];
ok('§7 balanced air → contested', cat.computeSuperiority(balanced).air === 'contested', cat.computeSuperiority(balanced).air);
const noNaval = [
    { uid: 'R-1', label: 'infantry', side: 'RED' },
    { uid: 'B-1', label: 'infantry', side: 'BLUE' },
];
ok('§7 no naval anywhere → naval unknown', cat.computeSuperiority(noNaval).naval === 'unknown', cat.computeSuperiority(noNaval).naval);

console.log('\n§8 explicit scenario capability_scores override catalog (source explicit_scenario)');
const overridden = cat.classifyUnit({ uid: 'X-1', label: 'infantry', side: 'RED', capability_scores: { ground_attack: 99 } });
ok('§8 source explicit_scenario', overridden.source === 'explicit_scenario', overridden.source);
ok('§8 override applied', overridden.capability_scores.ground_attack === 99, overridden.capability_scores.ground_attack);
const explicitDomain = cat.classifyUnit({ uid: 'X-2', label: 'something', side: 'RED', domain: 'space', class: 'satellite' });
ok('§8 explicit domain overrides', explicitDomain.domain === 'space' && explicitDomain.source === 'explicit_scenario', explicitDomain.domain + '/' + explicitDomain.source);

console.log('\n§9 unknown keyword → class unknown / confidence low / source heuristic');
const unk = cat.classifyUnit({ uid: 'Q-1', label: 'mystery blob', role: 'glorp', side: 'RED' });
ok('§9 class unknown', unk.class === 'unknown', unk.class);
ok('§9 confidence low', unk.confidence === 'low', unk.confidence);
ok('§9 source heuristic', unk.source === 'heuristic', unk.source);

console.log('\n§10 NO classified data — disclaimer present, no classified markers');
const lower = SRC.toLowerCase();
ok('§10 has public/demo/abstraction/review-only disclaimer',
    /public|demo|abstraction|review-only/.test(lower),
    'no disclaimer keyword found');
// Look for genuine classification BANNER markings, not the English word
// "classified" (which legitimately appears in the no-classified-data disclaimer
// and in code identifiers like classifyUnit / classifiedBySide).
ok('§10 no classified banner marker',
    !/(top secret|\bsecret\/\/|\/\/noforn|\bnoforn\b|classification:\s*(secret|confidential|top))/.test(lower),
    'classification banner marker found');

console.log('\n§11 scenario-generic — arbitrary IDs classify; no hardcoded draft/uid literals');
const zulu = cat.classifyUnit({ uid: 'ZULU-9', label: 'f-15 fighter', side: 'RED' });
ok('§11 arbitrary id classifies fine', zulu.unit_uid === 'ZULU-9' && zulu.domain === 'air', JSON.stringify({ id: zulu.unit_uid, d: zulu.domain }));
ok('§11 no attack_objective literal', SRC.indexOf('attack_objective') === -1);
ok('§11 no _draft literal', SRC.indexOf('_draft') === -1 && !/draft-\d/.test(SRC));
ok('§11 no specific-uid literal (R-001/B-001)', SRC.indexOf('R-001') === -1 && SRC.indexOf('B-001') === -1);

console.log('\nTOTAL: ' + (pass + fail) + '  PASS: ' + pass + '  FAIL: ' + fail);
if (fail) process.exit(1);
