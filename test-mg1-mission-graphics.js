'use strict';
// test-mg1-mission-graphics.js — MG1: wire Wargame-3 engagements to the existing
// Tactical Mission Graphics (Attack / Counter-attack) the operator already draws.
//
// Both adjudicator-map.js and app.js are browser IIFEs (Leaflet + milsymbol +
// the TMG renderer all need a DOM), so this is a STATIC source check + a DATA
// ORACLE that the scenario supports the mapping. The live render (head points at
// the target, chevron at the right zoom) is browser-verified separately.
const fs = require('fs');
const path = require('path');
const MAP = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8');
const APP = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/app.js'), 'utf8');
const SYM = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/symbology.js'), 'utf8');
const wg3 = require('./UI_MOdified/data/scenarios/wargame3.json');

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (extra != null ? '  — ' + extra : '')); } }

// the renderer block (the new mission-graphics function only)
const fn = MAP.slice(MAP.indexOf('function renderEngagementMissionGraphics'), MAP.indexOf('// ── Per-step unit movement'));
// the app.js read-only wrapper
const wrap = APP.slice(APP.indexOf('function buildReadonlyTmgMarker'), APP.indexOf('if (window.AppGraphics) window.AppGraphics.buildReadonlyTmgMarker') + 120);

console.log('\n─── A. app.js read-only TMG bridge (reuses the operator renderer) ───');
ok('A1 buildReadonlyTmgMarker defined + attached to window.AppGraphics',
   /function buildReadonlyTmgMarker\(latlng1, latlng2, typeId, color/.test(APP) &&
   /window\.AppGraphics\.buildReadonlyTmgMarker = buildReadonlyTmgMarker/.test(APP));
ok('A2 reuses the existing operator icon builder (getTmgIconOptions)', /getTmgIconOptions\(ll1, ll2, typeId, color/.test(wrap));
ok('A3 read-only marker: interactive:false, no popup/drag/operator-layer registration',
   /interactive: false/.test(wrap) && !/bindPopup/.test(wrap) && !/draggable/.test(wrap) && !/addToActiveLayer/.test(wrap) && !/dragend/.test(wrap));
ok('A4 places on the caller-supplied pane (read-only scenario pane), no map mutation',
   /if \(paneName\) mopts\.pane = paneName/.test(wrap) && !/\.addTo\(/.test(wrap));

console.log('\n─── B. adjudicator-map.js engagement mission graphics ───');
ok('B1 renderEngagementMissionGraphics defined; old renderEngagementArcs gone',
   /function renderEngagementMissionGraphics\(state, scenario\)/.test(MAP) && !/function renderEngagementArcs/.test(MAP));
ok('B2 RED actor → "attack", BLUE actor → "counterattack"',
   /const isBlue\s*=\s*sideRaw === 'BLUE'/.test(fn) && /const typeId\s*=\s*isBlue \? 'counterattack' : 'attack'/.test(fn));
ok('B3 graphic colour = ACTOR affiliation (side palette, not the status/effect palette)',
   /const ENGAGEMENT_RED\s*=\s*'#c41e1e'/.test(MAP) && /const ENGAGEMENT_BLUE\s*=\s*'#3a96d2'/.test(MAP) &&
   /const color\s*=\s*isBlue \? ENGAGEMENT_BLUE : ENGAGEMENT_RED/.test(fn));
ok('B4 draws via the read-only bridge (window.AppGraphics.buildReadonlyTmgMarker)',
   /window\.AppGraphics\.buildReadonlyTmgMarker/.test(fn) && /const buildTmg =/.test(fn));
ok('B5 head at TARGET: builds with (start=actor, end=target) — head→latlng2',
   /const start = \[src\[1\], src\[0\]\]; \/\/ actor/.test(fn) && /const end\s*= \[dst\[1\], dst\[0\]\]; \/\/ target/.test(fn) && /buildTmg\(start, end, typeId, color/.test(fn));
ok('B6 graceful fallback to the legacy arc + arrowhead when the bridge is absent',
   /\/\/ Fallback/.test(fn) && /makeArrowhead\(start, end, fbColor/.test(fn) && /let layer = buildTmg \?/.test(fn));
ok('B7 wired on BOTH paths: harness applyState + operator applyStepProgress + zoomend',
   /renderEngagementMissionGraphics\(state, scenario \|\| scenarioRef\)/.test(MAP) &&
   /renderEngagementMissionGraphics\(\{ step_index: stepIndex \}, scenarioRef\)/.test(MAP) &&
   /renderEngagementMissionGraphics\(\{ step_index: engagementGraphicsStep \}, scenarioRef\)/.test(MAP));
ok('B8 cleared per step + step tracker reset on clear/reset',
   /clearEngagementArcs\(\);/.test(fn) && (MAP.match(/engagementGraphicsStep = 0;/g) || []).length >= 2);
ok('B9 exposed on the public API', /\n\s*renderEngagementMissionGraphics,/.test(MAP));
ok('B10 declutter retained (primary shooter prominent, extra arcs dimmed)',
   /const isPrimary = dense/.test(fn) && /setOpacity\(0\.45\)/.test(fn));

console.log('\n─── C. data oracle — wargame3 supports the mapping ───');
let total = 0, withSide = 0, redA = 0, blueA = 0, withCoords = 0, twoPt = 0;
(wg3.steps || []).forEach(s => (s.engagement_arcs || []).forEach(a => {
    total++;
    if (a.actor_side === 'RED') redA++; else if (a.actor_side === 'BLUE') blueA++;
    if (a.actor_side !== undefined) withSide++;
    const c = Array.isArray(a.coordinates) ? a.coordinates : null;
    if (c && c.length >= 2 && Array.isArray(c[0]) && Array.isArray(c[1])) { withCoords++; if (c.length === 2) twoPt++; }
}));
ok('C1 engagement_arcs exist with actor_side on every arc', total > 0 && withSide === total, 'total=' + total + ' withSide=' + withSide);
ok('C2 both sides act (RED→attack, BLUE→counterattack)', redA > 0 && blueA > 0, 'RED=' + redA + ' BLUE=' + blueA);
ok('C3 every arc carries actor→target coordinates ([src],[dst])', withCoords === total && twoPt === total, 'withCoords=' + withCoords + ' twoPt=' + twoPt);

console.log('\n─── D. symbology — the TMG types exist (operator + scenario share them) ───');
ok('D1 "attack" mission graphic exists in TACTICAL_GRAPHICS', /id: 'attack'/.test(SYM));
ok('D2 "counterattack" mission graphic exists in TACTICAL_GRAPHICS', /id: 'counterattack'/.test(SYM));
ok('D3 TACTICAL_GRAPHICS exposed for the bridge (window.AppSymbology / used by app.js)', /TACTICAL_GRAPHICS/.test(APP));

console.log('\n─── E. safe / read-only / no fabrication ───');
ok('E1 no scenario mutation (no steps[x]=, no scenarioRef=, no *_step_coords=)',
   !/\.steps\s*\[[^\]]*\]\s*=[^=]/.test(fn) && !/scenarioRef\s*=/.test(fn) && !/_step_coords\s*=/.test(fn));
ok('E2 never moves a unit (no setLatLng in the renderer)', !/setLatLng/.test(fn));
ok('E3 does NOT invoke the operator editing machinery (createTmgLayer / selectTmgType / addToActiveLayer)',
   !/createTmgLayer/.test(fn) && !/selectTmgType/.test(fn) && !/addToActiveLayer/.test(fn));
ok('E4 the app.js wrapper invokes no operator state (no selectTmgType / updateTmgLayer / persistence)',
   !/selectTmgType/.test(wrap) && !/updateTmgLayer/.test(wrap) && !/saveState|localStorage|fetch\(/.test(wrap));
ok('E5 no backend / storage / fetch in the renderer', !/\bfetch\(|localStorage|sessionStorage|XMLHttpRequest/.test(fn));
ok('E6 no fabricated combat fields (ammo/fuel/readiness/combat power)',
   !/(\bammo\b|\bfuel\b|\breadiness\b|\bcombat_power\b|\bsortie)/i.test(fn));
ok('E7 W3-only guard (non-W3 scenarios are a no-op)', /sc\.schema_variant !== 'w3-rich'/.test(fn));

console.log('\n═══════════════════════════════════════════════');
console.log('  MG1 Engagement Mission Graphics — ' + (fail === 0 ? 'PASS' : 'FAIL') + '  (' + pass + ' passed, ' + fail + ' failed)');
console.log('═══════════════════════════════════════════════');
process.exit(fail === 0 ? 0 : 1);
