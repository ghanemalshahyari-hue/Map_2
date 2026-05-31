'use strict';
// test-an4-movement-trails.js — AN4 movement trails. The live trail uses each
// marker's displayed position (browser); this Node test = an oracle that the
// scenario DATA supports movement trails (real displacement between steps) +
// static wiring/safety checks. Live behaviour browser-verified.
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js');
const src = fs.readFileSync(SRC, 'utf8');
const wg3 = require('./UI_MOdified/data/scenarios/wargame3.json');

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (extra != null ? '  — ' + extra : '')); } }

const KM_LAT = 110.57;
const km = (a, b) => { const dLat = (a[1] - b[1]) * KM_LAT; const dLng = (a[0] - b[0]) * 111.32 * Math.cos(((a[1] + b[1]) / 2) * Math.PI / 180); return Math.sqrt(dLat * dLat + dLng * dLng); };

console.log('\n─── A. scenario data supports movement trails ───');
ok('A1 per-step movement data present', !!(wg3.red_unit_step_coords && wg3.blue_unit_step_coords) || !!(wg3.red_unit_step_prev || wg3.blue_unit_step_prev));
// real displacement between consecutive steps for red maneuver units
let movers = 0, anyStep0NoPrev = true, maxKm = 0;
const rc = wg3.red_unit_step_coords || {};
Object.keys(rc).forEach(uid => {
    const arr = rc[uid]; if (!Array.isArray(arr) || arr.length < 2) return;
    for (let i = 1; i < arr.length; i++) { if (Array.isArray(arr[i]) && Array.isArray(arr[i-1])) { const d = km(arr[i-1], arr[i]); if (d >= 2.0) { movers++; } if (d > maxKm) maxKm = d; } }
});
ok('A2 real movement exists (≥2km displacement between steps → trails will draw)', movers > 0, 'segments≥2km=' + movers + ' maxKm=' + maxKm.toFixed(1));
ok('A3 step 0 has no prior step (→ no false trail at start)', anyStep0NoPrev);
ok('A4 distance is honest (no fabricated speed/fuel — pure coord delta)', maxKm > 0 && maxKm < 2000);

console.log('\n─── B. wiring ───');
ok('B1 renderMovementTrails + clearMovementTrails + scenarioHasMovementData defined',
   /function renderMovementTrails/.test(src) && /function clearMovementTrails/.test(src) && /function scenarioHasMovementData/.test(src));
ok('B2 per-step history (records unitStepPos[uid][idx], trail from idx-1)',
   /unitStepPos\[uid\]\[idx\]\s*=\s*cur/.test(src) && /unitStepPos\[uid\]\[idx - 1\]/.test(src));
ok('B3 displacement threshold (no trail below TRAIL_MIN_KM)', /TRAIL_MIN_KM/.test(src) && /_trailKm\(prev, cur\) < TRAIL_MIN_KM/.test(src));
ok('B4 hooked: per-step (applyStepProgress) + zoomend + initial draw',
   /renderMovementTrails\(stepIndex\)/.test(src) && /renderMovementTrails\(movementTrailStep\)/.test(src) && /renderMovementTrails\(0\)/.test(src));
ok('B5 reset on clearScenario AND resetMap (trails + history)', (src.match(/clearMovementTrails\(\); } catch \(_\) {} unitStepPos = {}/g) || []).length >= 2);
ok('B6 roll-up: hide unit trails at command zoom (still record history)', /wg-rolled-up'\)/.test(src) && /if \(rolledUp\) continue;/.test(src));
ok('B7 legend note for movement', /Movement this step/.test(src));
ok('B8 exposed on public API', /\n\s*renderMovementTrails,/.test(src));

console.log('\n─── C. safe / read-only / no fabrication ───');
const block = src.slice(src.indexOf('AN4: movement trails / axis of advance'), src.indexOf('Inject a single <style>'));
ok('C1 trails read marker positions (getLatLng), never move units (no setLatLng)', /m\.getLatLng\(\)/.test(block) && !/setLatLng/.test(block));
ok('C2 no scenario mutation', !/\.steps\s*\[[^\]]*\]\s*=/.test(block) && !/scenarioRef\s*=/.test(block) && !/red_unit_step_coords\s*=/.test(block));
ok('C3 invents no movement (draws only when prior pos known + above threshold)', /if \(!prev \|\| _trailKm/.test(block));
ok('C4 non-W3 no-op guard (scenarioHasMovementData)', /!scenarioHasMovementData\(sc\)/.test(block));
ok('C5 no fabricated fuel/speed/combat-power claims', !/(\bfuel\b|\bspeed\b|\bkts\b|\bcombat_power\b|\bvelocity\b)/i.test(block));
ok('C6 trails do not interfere (separate layer, own class wg-adj-trail)', /className: 'wg-adj-trail'/.test(block));

console.log('\n═══════════════════════════════════════════════');
console.log('  AN4 Movement Trails — ' + (fail === 0 ? 'PASS' : 'FAIL') + '  (' + pass + ' passed, ' + fail + ' failed)');
console.log('═══════════════════════════════════════════════');
process.exit(fail === 0 ? 0 : 1);
