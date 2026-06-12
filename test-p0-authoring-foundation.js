'use strict';
// test-p0-authoring-foundation.js — Node tests for the RMOOZ Authoring Foundation (P0).
// Pure data/schema module; runs in plain Node (no browser globals) — which itself
// proves the module has no DOM/fetch/storage/map usage (those would ReferenceError here).
const fs = require('fs');
const path = require('path');

const MODULE_PATH = './UI_MOdified/client/shell/scenario-authoring-schema.js';
const A = require(MODULE_PATH);

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (extra != null ? '  — ' + extra : '')); }
}

console.log('\n─── 1-4: API surface ───');
ok('T1 buildStandardScenarioAuthoringTemplate exists', typeof A.buildStandardScenarioAuthoringTemplate === 'function');
ok('T2 fillScenarioAuthoringGaps exists', typeof A.fillScenarioAuthoringGaps === 'function');
ok('T3 diagnoseScenarioAuthoringGaps exists', typeof A.diagnoseScenarioAuthoringGaps === 'function');
ok('T4 isScenarioAuthoringDraftSafe exists', typeof A.isScenarioAuthoringDraftSafe === 'function');

console.log('\n─── 5-7: standard template ───');
const tmpl = A.buildStandardScenarioAuthoringTemplate();
const REQUIRED_SECTIONS = ['metadata','sides','posture','units','orbat','objectives','bls','phases','missions','events','doctrine','capabilities','logistics','attrition','detection','provenance','validation'];
ok('T5 template includes all required sections', REQUIRED_SECTIONS.every(s => s in tmpl), 'missing: ' + REQUIRED_SECTIONS.filter(s => !(s in tmpl)).join(','));
ok('T5b template safety flags correct', tmpl.authoringMode === true && tmpl.reviewModeCompatible === true && tmpl.liveMutationAllowed === false && tmpl.aiCommitAllowed === false && tmpl.operatorEditable === true);
const tj = JSON.stringify(tmpl);
ok('T6 no fabricated weapons/ammo/fuel/damage/detection values', !/("ammo"|"rounds"|"fuel_pct"|"fuel_percent"|"casualties"|"kills"|"combat_power"|"weapons?"\s*:\s*\[|"sensors?"\s*:\s*\[)/i.test(tj), tj.slice(0,80));
ok('T6b capabilities/logistics/attrition/detection are not_modeled', tmpl.capabilities.state === 'not_modeled' && tmpl.logistics.state === 'not_modeled' && tmpl.attrition.state === 'not_modeled' && tmpl.detection.state === 'not_modeled');
ok('T7 doctrine skeleton uses manual_required (no invented ROE)', tmpl.doctrine.weapon_control_status === 'manual_required' && tmpl.doctrine.roe === 'manual_required' && tmpl.doctrine.emcon === 'manual_required');
ok('T7b metadata uses not_assigned / unknown placeholders', tmpl.metadata.scenario_id === 'not_assigned' && tmpl.metadata.producer === 'unknown');

console.log('\n─── 8-10: gap-fill defaulter ───');
const input = {
    scenario_id: 'fix1', scenario_label: 'Fixture', model_version: 'v1',
    red_units: [{ uid: 'R-1' }], blue_units_initial: [{ unit_uid: 'B-1' }],
    obj: { name: 'OBJ' }, bls_template: [{ name: 'BLS-1' }], phase_table: [{ index: 0 }],
    sides: [{ id: 'BLUE', name_en: 'Custom Blue' }]
};
const inputClone = JSON.parse(JSON.stringify(input));
const filled = A.fillScenarioAuthoringGaps(input);
ok('T8 gap-fill does NOT mutate input', JSON.stringify(input) === JSON.stringify(inputClone));
ok('T9 gap-fill preserves existing scenario data', filled.scenario_id === 'fix1' && filled.red_units.length === 1 && filled.obj.name === 'OBJ' && filled.bls_template.length === 1);
ok('T9b existing sides preserved, not overwritten', Array.isArray(filled.sides) && filled.sides.length === 1 && filled.sides[0].name_en === 'Custom Blue' && filled._authoring.preserved.indexOf('sides') !== -1);
ok('T9c missing section (doctrine) added', filled.doctrine && filled.doctrine.weapon_control_status === 'manual_required');
const dm = filled._authoring && filled._authoring.defaulted && filled._authoring.defaulted.doctrine;
ok('T10 defaults marked source/confidence/operator_editable/requires_review', !!dm && dm.source === 'standard_template' && dm.confidence === 'template' && dm.operator_editable === true && dm.requires_review === true);
ok('T10b object-shaped default also stamped (_authoring on doctrine)', filled.doctrine._authoring && filled.doctrine._authoring.source === 'standard_template' && filled.doctrine._authoring.requires_review === true);

console.log('\n─── 11: diagnostics on a Wargame-style scenario ───');
let wg3 = null;
try { wg3 = require('./UI_MOdified/data/scenarios/wargame3.json'); } catch (e) { wg3 = input; }
const diag = A.diagnoseScenarioAuthoringGaps(wg3);
const reported = diag.gaps.map(g => g.section).concat(diag.warnings.map(w => w.section));
ok('T11 diagnostics reports missing doctrine/missions/events/capability profiles', ['doctrine','missions','events','capabilities'].every(s => reported.indexOf(s) !== -1), 'reported: ' + reported.join(','));
ok('T11b diagnostics shape {passed,gaps,warnings,summary}', ('passed' in diag) && Array.isArray(diag.gaps) && Array.isArray(diag.warnings) && typeof diag.summary === 'string');
ok('T11c WG3 has high-severity gaps (sides/posture) → passed=false', diag.passed === false && diag.gaps.some(g => g.section === 'sides' && g.severity === 'high'));

console.log('\n─── 12: safety guard ───');
ok('T12a safe on the standard template', A.isScenarioAuthoringDraftSafe(tmpl).safe === true, JSON.stringify(A.isScenarioAuthoringDraftSafe(tmpl).violations));
ok('T12b safe on gap-filled scenario', A.isScenarioAuthoringDraftSafe(filled).safe === true, JSON.stringify(A.isScenarioAuthoringDraftSafe(filled).violations));
ok('T12c blocks lua', A.isScenarioAuthoringDraftSafe({ lua: 'os.execute()' }).safe === false);
ok('T12d blocks script', A.isScenarioAuthoringDraftSafe({ nested: { script: 'doThing()' } }).safe === false);
ok('T12e blocks executable function value', A.isScenarioAuthoringDraftSafe({ onTick: 'function(){ return 1; }' }).safe === false);
ok('T12f blocks backend URL', A.isScenarioAuthoringDraftSafe({ backendUrl: 'https://example/api' }).safe === false);
ok('T12g blocks fetch instruction value', A.isScenarioAuthoringDraftSafe({ hook: 'fetch(/api/commit)' }).safe === false);
ok('T12h blocks autoApply=true', A.isScenarioAuthoringDraftSafe({ autoApply: true }).safe === false);
ok('T12i blocks liveMutationAllowed=true', A.isScenarioAuthoringDraftSafe({ liveMutationAllowed: true }).safe === false);
ok('T12j blocks aiCommitAllowed=true', A.isScenarioAuthoringDraftSafe({ aiCommitAllowed: true }).safe === false);
ok('T12k blocks localStorage/storageKey keys', A.isScenarioAuthoringDraftSafe({ storageKey: 'x', localStorage: {} }).safe === false);

console.log('\n─── 13-17: purity (no UI / backend / storage / fetch / map) ───');
// Running ALL functions in plain Node (no window/document/fetch/localStorage/map) without
// throwing proves the module never touches those — any such usage would ReferenceError here.
let pureRan = false;
try {
    A.buildStandardScenarioAuthoringTemplate();
    A.fillScenarioAuthoringGaps({ red_units: [{ uid: 'R-1' }] });
    A.diagnoseScenarioAuthoringGaps({});
    A.isScenarioAuthoringDraftSafe({});
    pureRan = true;
} catch (e) { pureRan = e; }
ok('T13/16/17 module is pure (runs in Node w/o DOM/fetch/storage/map globals)', pureRan === true && typeof window === 'undefined' && typeof document === 'undefined', String(pureRan));
// Source-level guard: no actual browser/DOM API *calls* (allowing the forbidden-token
// lists inside the safety guard, which are data, not calls).
const src = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/shell/scenario-authoring-schema.js'), 'utf8');
ok('T16b no document./innerHTML/querySelector DOM calls', !/document\s*\.|\.innerHTML|querySelector/.test(src));
ok('T17b no Leaflet/map geometry calls', !/window\.map|L\.marker|\.setLatLng\(|\.fitBounds\(|drawScenario\(/.test(src));

console.log('\n─── 14-15: scope (verify via git separately) ───');
console.log('  NOTE  T14/T15 (no backend / no wargame3.json change) are verified by git status —');
console.log('        this PR adds only: scenario-authoring-schema.js + test-p0-authoring-foundation.js (+ optional doc).');

console.log('\n═══════════════════════════════════════════════');
console.log('  P0 Authoring Foundation — ' + (fail === 0 ? 'PASS' : 'FAIL') + '  (' + pass + ' passed, ' + fail + ' failed)');
console.log('═══════════════════════════════════════════════');
process.exit(fail === 0 ? 0 : 1);
