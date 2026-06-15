'use strict';
// test-intel-terrain-effects-a.js — terrain-effects-engine.js unit tests.
// Pure Node, no server, no DOM. Prints PASS:/FAIL:/TOTAL: and exits 1 on any fail.

const fs = require('fs');
const path = require('path');
const MODULE_PATH = path.join(__dirname, 'UI_MOdified/server/ai/terrain-effects-engine.js');
const t = require('./UI_MOdified/server/ai/terrain-effects-engine.js');
const SRC = fs.readFileSync(MODULE_PATH, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  PASS: ' + name); }
    else { fail++; console.log('  FAIL: ' + name + (extra != null ? '  — ' + extra : '')); }
}

const groundUnit = { uid: 'G-1', label: 'armor battalion', role: 'armor', side: 'RED' };
const navalUnit = { uid: 'N-1', label: 'frigate', side: 'RED' };

console.log('\n§1 no terrain in context → terrain_available false + neutral + unavailable note');
const none = t.terrainEffect(groundUnit, null, null, {});
ok('§1 terrain_available false', none.terrain_available === false, String(none.terrain_available));
ok('§1 movement_modifier ~1.0', Math.abs(none.movement_modifier - 1.0) < 0.001, none.movement_modifier);
ok('§1 note mentions unavailable', /unavailable/i.test(none.terrain_notes), none.terrain_notes);

console.log('\n§2 naval over sea → good movement; over land → near-0 + route_warning');
const navalSea = t.terrainEffect(navalUnit, null, null, { terrain: 'open sea' });
ok('§2 naval at sea movement > 1.0', navalSea.movement_modifier > 1.0, navalSea.movement_modifier);
const navalLand = t.terrainEffect(navalUnit, null, null, { terrain: 'mountain ridge' });
ok('§2 naval over land near-0 movement', navalLand.movement_modifier <= 0.001, navalLand.movement_modifier);
ok('§2 naval over land has route_warning', !!navalLand.route_warning, navalLand.route_warning);

console.log('\n§3 mountain → ground movement slow + los_risk high');
const mtn = t.terrainEffect(groundUnit, null, null, { terrain: 'mountainous' });
ok('§3 ground movement slow (<1)', mtn.movement_modifier < 1.0, mtn.movement_modifier);
ok('§3 los_risk high', mtn.los_risk === 'high', mtn.los_risk);

console.log('\n§4 urban → ground slow + concealment (visibility_modifier < 1)');
const urban = t.terrainEffect(groundUnit, null, null, { terrain: 'dense urban city' });
ok('§4 ground movement slow (<1)', urban.movement_modifier < 1.0, urban.movement_modifier);
ok('§4 visibility_modifier < 1 (concealment)', urban.visibility_modifier < 1.0, urban.visibility_modifier);

console.log('\n§5 desert / open → maneuver favorable (movement_modifier > 1)');
const desert = t.terrainEffect(groundUnit, null, null, { terrain: 'open desert' });
ok('§5 movement_modifier > 1', desert.movement_modifier > 1.0, desert.movement_modifier);

console.log('\n§6 terrainSummary returns a short honest string');
const sumNone = t.terrainSummary([groundUnit], [], {});
const sumSea = t.terrainSummary([navalUnit], [], { terrain: 'coastal sea' });
ok('§6 summary is a string', typeof sumNone === 'string' && typeof sumSea === 'string');
ok('§6 honest about unavailability', /unavailable/i.test(sumNone), sumNone);
ok('§6 reflects terrain when present', /sea|coast/i.test(sumSea), sumSea);

console.log('\n§7 no hardcoded draft name/uid in module source');
ok('§7 no attack_objective literal', SRC.indexOf('attack_objective') === -1);
ok('§7 no _draft / draft-N literal', SRC.indexOf('_draft') === -1 && !/draft-\d/.test(SRC));
ok('§7 no specific-uid literal (R-001/B-001)', SRC.indexOf('R-001') === -1 && SRC.indexOf('B-001') === -1);

console.log('\nTOTAL: ' + (pass + fail) + '  PASS: ' + pass + '  FAIL: ' + fail);
if (fail) process.exit(1);
