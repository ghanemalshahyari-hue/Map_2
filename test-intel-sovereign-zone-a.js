'use strict';
// test-intel-sovereign-zone-a.js — sovereign-zone-engine.js unit tests.
// Pure Node, no server, no DOM. Prints PASS:/FAIL:/TOTAL: and exits 1 on any fail.

const fs = require('fs');
const path = require('path');
const MODULE_PATH = path.join(__dirname, 'UI_MOdified/server/ai/sovereign-zone-engine.js');
const z = require('./UI_MOdified/server/ai/sovereign-zone-engine.js');
const SRC = fs.readFileSync(MODULE_PATH, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  PASS: ' + name); }
    else { fail++; console.log('  FAIL: ' + name + (extra != null ? '  — ' + extra : '')); }
}

const OBJ = [{ name: 'protected site', lat: 24.25, lon: 54.55 }];
const SCEN_UAE = { name: 'Defense of Abu Dhabi', units: [] };
const SCEN_GENERIC = { name: 'Northern Front', units: [] };

console.log('\n§1 inferZones builds an inferred review-only zone around the objective');
const zones = z.inferZones(SCEN_UAE, OBJ);
ok('§1 zones produced', Array.isArray(zones) && zones.length >= 3, zones.length);
ok('§1 every zone source inferred_review_only', zones.every((zz) => zz.source === 'inferred_review_only'));
ok('§1 zone centered on objective [lat,lon]', zones[0].center[0] === 24.25 && zones[0].center[1] === 54.55, JSON.stringify(zones[0].center));

console.log('\n§2 UAE scenario name → owner_country UAE; generic → unknown');
ok('§2 UAE owner_country', z.inferZones(SCEN_UAE, OBJ)[0].owner_country === 'UAE', z.inferZones(SCEN_UAE, OBJ)[0].owner_country);
ok('§2 generic owner_country unknown', z.inferZones(SCEN_GENERIC, OBJ)[0].owner_country === 'unknown', z.inferZones(SCEN_GENERIC, OBJ)[0].owner_country);

console.log('\n§3 RED unit inside warning ring → violation true / severity warning');
// ~0.30° east of objective → inside 0.35 warning ring, outside 0.20 defended.
const warnEval = z.evaluateZone({ label: 'f-14', side: 'RED' }, { lat: 24.25, lon: 54.85 }, z.inferZones(SCEN_UAE, OBJ));
ok('§3 violation true', warnEval.violation === true, JSON.stringify(warnEval));
ok('§3 severity warning', warnEval.severity === 'warning', warnEval.severity);

console.log('\n§4 defended ring → alert; engagement ring → engagement_ready');
const alertEval = z.evaluateZone({ label: 'f-14', side: 'RED' }, { lat: 24.25, lon: 54.73 }, z.inferZones(SCEN_UAE, OBJ)); // ~0.18
const engEval = z.evaluateZone({ label: 'f-14', side: 'RED' }, { lat: 24.25, lon: 54.63 }, z.inferZones(SCEN_UAE, OBJ));   // ~0.08
ok('§4 defended ring severity alert', alertEval.severity === 'alert', alertEval.severity);
ok('§4 engagement ring severity engagement_ready', engEval.severity === 'engagement_ready', engEval.severity);

console.log('\n§5 RED far outside → violation false / severity watch / zone_type unknown');
const farEval = z.evaluateZone({ label: 'f-14', side: 'RED' }, { lat: 10.0, lon: 10.0 }, z.inferZones(SCEN_UAE, OBJ));
ok('§5 violation false', farEval.violation === false, JSON.stringify(farEval));
ok('§5 severity watch', farEval.severity === 'watch', farEval.severity);
ok('§5 zone_type unknown', farEval.zone_type === 'unknown', farEval.zone_type);

console.log('\n§6 air-domain → airspace; naval → territorial_waters');
const airEval = z.evaluateZone({ label: 'f-14 tomcat', role: 'interceptor', side: 'RED' }, { lat: 24.25, lon: 54.85 }, z.inferZones(SCEN_UAE, OBJ));
const navalEval = z.evaluateZone({ label: 'frigate', side: 'RED' }, { lat: 24.25, lon: 54.85 }, z.inferZones(SCEN_UAE, OBJ));
ok('§6 air zone_type airspace', airEval.zone_type === 'airspace', airEval.zone_type);
ok('§6 naval zone_type territorial_waters', navalEval.zone_type === 'territorial_waters', navalEval.zone_type);

console.log('\n§7 zone label/source clearly inferred / review-only');
ok('§7 label says inferred + review-only', /inferred/i.test(zones[0].label) && /review-only/i.test(zones[0].label), zones[0].label);
ok('§7 eval result source inferred_review_only', warnEval.source === 'inferred_review_only', warnEval.source);

console.log('\n§8 no hardcoded draft name/uid in module source');
ok('§8 no attack_objective literal', SRC.indexOf('attack_objective') === -1);
ok('§8 no _draft / draft-N literal', SRC.indexOf('_draft') === -1 && !/draft-\d/.test(SRC));
ok('§8 no specific-uid literal (R-001/B-001)', SRC.indexOf('R-001') === -1 && SRC.indexOf('B-001') === -1);

console.log('\nTOTAL: ' + (pass + fail) + '  PASS: ' + pass + '  FAIL: ' + fail);
if (fail) process.exit(1);
