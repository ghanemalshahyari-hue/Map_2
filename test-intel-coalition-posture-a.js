'use strict';
// test-intel-coalition-posture-a.js — coalition-posture-engine.js unit tests.
// Pure Node, no server, no DOM. Prints PASS:/FAIL:/TOTAL: and exits 1 on any fail.

const fs = require('fs');
const path = require('path');
const MODULE_PATH = path.join(__dirname, 'UI_MOdified/server/ai/coalition-posture-engine.js');
const cp = require('./UI_MOdified/server/ai/coalition-posture-engine.js');
const SRC = fs.readFileSync(MODULE_PATH, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  PASS: ' + name); }
    else { fail++; console.log('  FAIL: ' + name + (extra != null ? '  — ' + extra : '')); }
}
function noEngageVerbs(s) { return !/\b(engage|destroy|kill)\b/i.test(String(s || '')); }

console.log('\n§1 detectCoalition GCC members → GCC');
ok('§1 UAE → GCC', cp.detectCoalition('UAE').coalition === 'GCC', cp.detectCoalition('UAE').coalition);
ok('§1 Abu Dhabi → GCC', cp.detectCoalition('Abu Dhabi').coalition === 'GCC', cp.detectCoalition('Abu Dhabi').coalition);
ok('§1 Saudi Arabia → GCC', cp.detectCoalition('Saudi Arabia').coalition === 'GCC', cp.detectCoalition('Saudi Arabia').coalition);

console.log('\n§2 detectCoalition NATO members → NATO');
ok('§2 France → NATO', cp.detectCoalition('France').coalition === 'NATO', cp.detectCoalition('France').coalition);
ok('§2 United States → NATO', cp.detectCoalition('United States').coalition === 'NATO', cp.detectCoalition('United States').coalition);
ok('§2 Turkey → NATO', cp.detectCoalition('Turkey').coalition === 'NATO', cp.detectCoalition('Turkey').coalition);
ok('§2 Germany → NATO', cp.detectCoalition('Germany').coalition === 'NATO', cp.detectCoalition('Germany').coalition);

console.log('\n§3 unknown / empty → none, confidence low');
ok('§3 Atlantis → none', cp.detectCoalition('Atlantis').coalition === 'none', cp.detectCoalition('Atlantis').coalition);
ok('§3 unknown confidence low', cp.detectCoalition('Atlantis').confidence === 'low', cp.detectCoalition('Atlantis').confidence);
ok('§3 empty → none', cp.detectCoalition('').coalition === 'none', cp.detectCoalition('').coalition);
ok('§3 null → none', cp.detectCoalition(null).coalition === 'none', cp.detectCoalition(null).coalition);

console.log('\n§4 coalitionPosture escalates with alert state');
const pWatch = cp.coalitionPosture('GCC', 'WATCH', 'UAE');
const pWarn = cp.coalitionPosture('GCC', 'WARNING', 'UAE');
const pAlert = cp.coalitionPosture('GCC', 'ALERT', 'UAE');
const pEng = cp.coalitionPosture('GCC', 'ENGAGEMENT_READY', 'UAE');
function subsetOf(a, b) { return a.every(function (x) { return b.indexOf(x) !== -1; }); }
ok('§4 WATCH ⊂ ALERT support_actions', subsetOf(pWatch.support_actions, pAlert.support_actions),
    JSON.stringify(pWatch.support_actions) + ' ⊄ ' + JSON.stringify(pAlert.support_actions));
ok('§4 WARNING ⊂ ALERT support_actions', subsetOf(pWarn.support_actions, pAlert.support_actions));
ok('§4 ALERT ⊂ ENGAGEMENT_READY support_actions', subsetOf(pAlert.support_actions, pEng.support_actions));
ok('§4 ENGAGEMENT_READY has most support_actions',
    pEng.support_actions.length > pAlert.support_actions.length &&
    pAlert.support_actions.length > pWarn.support_actions.length &&
    pWarn.support_actions.length > pWatch.support_actions.length,
    [pWatch, pWarn, pAlert, pEng].map(function (p) { return p.support_actions.length; }).join(','));

console.log('\n§5 escalation_rule always requires approval; no engage/destroy verbs');
[pWatch, pWarn, pAlert, pEng].forEach(function (p, i) {
    ok('§5[' + i + '] escalation_rule requires approval', /approval/i.test(p.escalation_rule), p.escalation_rule);
    ok('§5[' + i + '] no engage/destroy in output', noEngageVerbs(JSON.stringify(p)));
});
const pNone = cp.coalitionPosture('none', 'ALERT', null);
ok('§5 none posture no engage/destroy', noEngageVerbs(JSON.stringify(pNone)));
ok('§5 none escalation_rule requires approval', /approval/i.test(pNone.escalation_rule));

console.log('\n§6 GENERIC data-driven COALITION_TABLE (adding a key works)');
ok('§6 has GCC', !!cp.COALITION_TABLE.GCC && Array.isArray(cp.COALITION_TABLE.GCC.members));
ok('§6 has NATO', !!cp.COALITION_TABLE.NATO && Array.isArray(cp.COALITION_TABLE.NATO.members));
ok('§6 GCC lead_default present', !!cp.COALITION_TABLE.GCC.lead_default, cp.COALITION_TABLE.GCC.lead_default);
ok('§6 NATO lead_default present', !!cp.COALITION_TABLE.NATO.lead_default, cp.COALITION_TABLE.NATO.lead_default);
// Add a brand-new coalition purely as data and confirm detection + posture work.
cp.COALITION_TABLE.TESTPACT = { members: ['atlantis', 'wakanda'], lead_default: 'Atlantis', doctrine_note: 'Test coalition (inferred).' };
ok('§6 data-driven add: Atlantis → TESTPACT', cp.detectCoalition('Atlantis').coalition === 'TESTPACT', cp.detectCoalition('Atlantis').coalition);
const pTest = cp.coalitionPosture('TESTPACT', 'ALERT', null);
ok('§6 data-driven posture: TESTPACT lead Atlantis', pTest.lead_nation === 'Atlantis', pTest.lead_nation);
ok('§6 data-driven posture no engage/destroy', noEngageVerbs(JSON.stringify(pTest)));
delete cp.COALITION_TABLE.TESTPACT; // restore

console.log('\n§7 coalitionForSide infers from unit.country fields');
const gccUnits = [
    { uid: 'u1', side: 'BLUE', country: 'UAE' },
    { uid: 'u2', side: 'BLUE', country: 'Saudi Arabia' },
    { uid: 'u3', side: 'RED', country: 'Atlantis' },
];
ok('§7 BLUE UAE units → GCC', cp.coalitionForSide(gccUnits, 'BLUE') === 'GCC', cp.coalitionForSide(gccUnits, 'BLUE'));
const natoUnits = [{ uid: 'n1', side: 'BLUE', country: 'France' }, { uid: 'n2', side: 'BLUE', country: 'Germany' }];
ok('§7 BLUE France units → NATO', cp.coalitionForSide(natoUnits, 'BLUE') === 'NATO', cp.coalitionForSide(natoUnits, 'BLUE'));
ok('§7 no-country side → none', cp.coalitionForSide([{ uid: 'x', side: 'BLUE' }], 'BLUE') === 'none');
ok('§7 fallback to scenario name', cp.coalitionForSide([{ uid: 'x', side: 'BLUE' }], 'BLUE', 'NATO patrol drill') === 'NATO');

console.log('\n§8 source hygiene: no hardcoded scenario/draft/uid + review-only disclaimer');
ok('§8 no draft- in source', !/\bdraft-\d+/i.test(SRC));
ok('§8 no attack_objective in source', !/attack_objective/i.test(SRC));
ok('§8 no specific R-/B- unit id in source', !/['"][RB]-\d{3}['"]/.test(SRC));
ok('§8 header says review-only', /review-only/i.test(SRC));
ok('§8 header disclaims classified data', /no classified data/i.test(SRC));
ok('§8 mentions LLM/doctrine can refine', /(llm|doctrine)/i.test(SRC) && /refine/i.test(SRC));

console.log('\nPASS: ' + pass + '  FAIL: ' + fail + '  TOTAL: ' + (pass + fail));
if (fail) process.exit(1);
