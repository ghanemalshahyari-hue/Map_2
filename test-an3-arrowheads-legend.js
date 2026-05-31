'use strict';
// test-an3-arrowheads-legend.js — AN3: engagement arrowheads + legend.
// Arrowheads already existed (makeArrowhead, part of the base W3 renderer); AN3
// adds the legend colour key so arcs + AN2 event pins + AN1 attrition are
// legible. adjudicator-map.js is a browser IIFE → static source checks + a
// palette-consistency check.
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js');
const src = fs.readFileSync(SRC, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (extra != null ? '  — ' + extra : '')); }
}

console.log('\n─── A. engagement arrowheads (pre-existing — verified present) ───');
ok('A1 makeArrowhead() defined (filled directional triangle polygon)',
   /function makeArrowhead\s*\(start, end, color/.test(src) && /window\.L\.polygon\(\[\[tipLat, tipLng\]/.test(src));
// MG1 supersedes the arc+arrowhead as the PRIMARY engagement render (now a
// mission graphic); the arrowhead remains in the legacy FALLBACK path used when
// the AppGraphics TMG bridge is unavailable. These assert that fallback.
ok('A2 engagement FALLBACK draws an arrowhead at the TARGET end (start→end)',
   /\/\/ Fallback/.test(src) && /makeArrowhead\(start, end, fbColor, weight \* 4/.test(src));
ok('A3 fallback arrowhead colour matches the fallback arc (status colour)', /const head = makeArrowhead\(start, end, fbColor/.test(src));

console.log('\n─── B. legend extension (AN3) ───');
const legend = src.slice(src.indexOf('function addLegend'), src.indexOf('function removeLegend'));
ok('B1 tmgRow (maneuver chevron) + pinRow (effect dot) helpers', /const tmgRow = \(color, label\)/.test(legend) && /const pinRow = \(color, label\)/.test(legend) && /9654/.test(legend) && /9679/.test(legend));
ok('B2 "Engagements (current step)" section header', /Engagements \(current step\)/.test(legend));
const STATUS_KEYS = ['destroyed', 'damaged_partial', 'suppressed', 'delayed', 'expended', 'unchanged'];
ok('B3 all 6 status colours keyed (matches arc + event-pin palette)',
   STATUS_KEYS.every(k => new RegExp('STATUS_COLORS\\.' + k).test(legend)),
   'missing: ' + STATUS_KEYS.filter(k => !new RegExp('STATUS_COLORS\\.' + k).test(legend)).join(','));
ok('B4 mission-graphic direction note (actor → target) + event-pin note', /points&nbsp;actor/.test(legend) && /event pin/.test(legend));
ok('B5 unit state key (degraded / destroyed)',
   /Degraded/.test(legend) && /Destroyed/.test(legend));
ok('B6 reuses STATUS_COLORS for the effect key (consistent with AN2 pins; no new palette)', /pinRow\(STATUS_COLORS\./.test(legend));

console.log('\n─── C. safe / read-only ───');
ok('C1 legend builds DOM only (no scenario mutation)', !/\.steps\s*\[[^\]]*\]\s*=/.test(legend) && !/scenarioRef\s*=/.test(legend));
ok('C2 no setLatLng / no coordinate change in legend', !/setLatLng/.test(legend));
ok('C3 legend wired in drawScenario (addLegend called) + removed on clear', /addLegend\(\);/.test(src) && /removeLegend\(\)/.test(src));
ok('C4 no new fabricated combat fields in legend', !/(\bammo\b|\bfuel\b|\bcasualt|\bcombat_power\b)/i.test(legend));

console.log('\n═══════════════════════════════════════════════');
console.log('  AN3 Arrowheads + Legend — ' + (fail === 0 ? 'PASS' : 'FAIL') + '  (' + pass + ' passed, ' + fail + ' failed)');
console.log('═══════════════════════════════════════════════');
process.exit(fail === 0 ? 0 : 1);
