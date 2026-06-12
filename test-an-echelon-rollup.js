'use strict';
// test-an-echelon-rollup.js — CMO-style echelon roll-up (division ↔ units).
// adjudicator-map.js is a browser IIFE, so this combines (A) an oracle that
// mirrors parseUnitDivision/grouping against real wargame3.json, and (B) static
// checks that the feature is wired + additive/reversible (no marker-pipeline
// mutation; hides via a CSS class; non-W3 guard; reset on clear).
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js');
const CSS = path.join(__dirname, 'UI_MOdified/client/style.css');
const src = fs.readFileSync(SRC, 'utf8');
const css = fs.readFileSync(CSS, 'utf8');
const wg3 = require('./UI_MOdified/data/scenarios/wargame3.json');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (extra != null ? '  — ' + extra : '')); }
}

// ── (A) Oracle: mirror parseUnitDivision + division grouping ─────────────
function parseUnitDivision(uid) {
    const m = String(uid || '').match(/^([A-Za-z])-d(\d+)-/);
    return m ? { side: m[1].toUpperCase(), div: m[2], key: m[1].toUpperCase() + '-d' + m[2] } : null;
}
function groupByDivision(scenario) {
    const groups = new Map();
    const add = (uid) => { const p = parseUnitDivision(uid); if (!p) return; if (!groups.has(p.key)) groups.set(p.key, []); groups.get(p.key).push(uid); };
    (scenario.blue_units_initial || []).forEach(u => add(u.unit_uid || u.uid));
    (scenario.red_units || []).forEach(u => add(u.uid));
    return groups;
}

console.log('\n─── A. division grouping on real Wargame 3 ───');
const groups = groupByDivision(wg3);
const totalUnits = (wg3.red_units || []).length + (wg3.blue_units_initial || []).length;
const grouped = [...groups.values()].reduce((a, arr) => a + arr.length, 0);
ok('A1 parser tolerant of Arabic FORM (e.g. R-d3-رادارت-072)', !!parseUnitDivision('R-d3-رادارت-072') && parseUnitDivision('R-d3-رادارت-072').key === 'R-d3');
ok('A2 yields multiple division groups (declutter)', groups.size >= 5, 'groups=' + groups.size);
ok('A3 expected division keys present', ['R-d3', 'B-d1', 'B-d2'].every(k => groups.has(k)), 'keys=' + [...groups.keys()].join(','));
ok('A4 groups are far fewer than units (real declutter)', groups.size < totalUnits / 5, groups.size + ' groups vs ' + totalUnits + ' units');
ok('A5 most units are grouped', grouped >= totalUnits - 12, grouped + '/' + totalUnits);
ok('A6 largest group is the main assault (R-d3)', (groups.get('R-d3') || []).length >= 20, 'R-d3=' + (groups.get('R-d3') || []).length);
console.log('       groups: ' + [...groups.entries()].map(([k, v]) => k + ':' + v.length).join('  '));

console.log('\n─── B. source wiring (adjudicator-map.js) ───');
ok('B1 renderEchelonRollup + buildEchelonDivisionGroups + parseUnitDivision defined',
   /function renderEchelonRollup/.test(src) && /function buildEchelonDivisionGroups/.test(src) && /function parseUnitDivision/.test(src));
ok('B2 zoom-responsive (ECHELON_EXPAND_ZOOM + zoom < threshold gate)',
   /ECHELON_EXPAND_ZOOM\s*=\s*\d+/.test(src) && /zoom < ECHELON_EXPAND_ZOOM/.test(src));
ok('B3 bound to zoomend', /on\('zoomend', renderEchelonRollup\)/.test(src));
ok('B4 initial render after fitScenarioAO in drawScenario', /fitScenarioAO\(\);[\s\S]{0,400}renderEchelonRollup\(\)/.test(src));
ok('B5 repositions per step (in applyStepProgress guard)', /applyStepAttrition\(stepIndex\)[\s\S]{0,400}renderEchelonRollup\(\)/.test(src));
ok('B6 exposed on public API (renderEchelonRollup + setEchelonRollup)', /\n\s*renderEchelonRollup,/.test(src) && /setEchelonRollup:/.test(src));
ok('B7 click-to-expand drills IN (>= expand zoom, clamped)', /mk\.on\('click'/.test(src) && /getBoundsZoom/.test(src) && /Math\.max\(fitZ, ECHELON_EXPAND_ZOOM\)/.test(src) && /setView\(b\.getCenter\(\), targetZ/.test(src));

console.log('\n─── C. additive / reversible / safe ───');
ok('C1 hides units via CSS class toggle, not marker removal', /classList\.add\('wg-rolled-up'\)/.test(src) && /classList\.remove\('wg-rolled-up'\)/.test(src));
ok('C2 CSS hides unit symbols (sidc + destroyed diamond), keeps aggregates visible',
   /\.wg-rolled-up\s+\.wg-adj-sidc[\s\S]{0,90}display:\s*none/.test(css) && /\.wg-rolled-up\s+\.wg-adj-diamond[\s\S]{0,40}display:\s*none/.test(css) && /\.wg-adj-aggregate/.test(css));
ok('C3 non-W3 no-op guard (needs >=2 division groups)', /groups\.length >= 2/.test(src));
ok('C4 reset on clearScenario AND resetMap (drop aggregates + remove class)',
   (src.match(/clearEchelonAggregates\(\)/g) || []).length >= 3 && (src.match(/classList\.remove\('wg-rolled-up'\)/g) || []).length >= 3);
ok('C5 master toggle present (setEchelonRollup / echelonRollupEnabled)', /echelonRollupEnabled/.test(src));
// the roll-up block must not mutate unit coordinates or scenario data
const block = src.slice(src.indexOf('Echelon roll-up (CMO-style zoom-responsive'), src.indexOf('function drawScenario'));
ok('C6 roll-up block does not move units (no setLatLng) or mutate scenario', !/setLatLng/.test(block) && !/\.steps\s*\[[^\]]*\]\s*=/.test(block) && !/red_units\s*=|blue_units_initial\s*=/.test(block));
ok('C7 aggregates carry their own class (not hidden by the unit selector)', /className:\s*'wg-adj-aggregate'/.test(src));

console.log('\n═══════════════════════════════════════════════');
console.log('  Echelon roll-up — ' + (fail === 0 ? 'PASS' : 'FAIL') + '  (' + pass + ' passed, ' + fail + ' failed)');
console.log('═══════════════════════════════════════════════');
process.exit(fail === 0 ? 0 : 1);
