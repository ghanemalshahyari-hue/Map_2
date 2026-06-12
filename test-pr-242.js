#!/usr/bin/env node
/**
 * test-pr-242.js — Decision Package → Live Scenario converter
 *
 * Verifies UI_MOdified/scripts/convert-decision-package.js:
 *   - output passes the strict scenario-validator (HUD/server load path)
 *   - output passes the live-import safety gate (no unsafe keys)
 *   - unit / coordinate / objective / step fidelity vs the source package
 *   - the four PR-242 refinements (decision options, source_trace+provenance,
 *     image refs, overwrite protection)
 *   - DP objective_status mapped into the RMOOZ enum
 *
 * Skips gracefully if the dummy Decision Packages aren't present.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const REPO = __dirname;
const UI   = path.join(REPO, 'UI_MOdified');
const C    = require(path.join(UI, 'scripts', 'convert-decision-package.js'));
const V    = require(path.join(UI, 'server', 'ai', 'scenario-validator.js'));

const DP_BASE = path.join(process.env.HOME || '', 'Downloads', 'rmooz_dummy_decision_packages');
const PACKAGES = [
    'DP_01_Fictional_Coastal_Corridor',
    'DP_02_Desert_Logistics_Route',
    'DP_03_Urban_Evacuation_Decision',
];

const OBJ_ENUM = ['DORMANT', 'THREATENED', 'CONTESTED', 'CAPTURED', 'DENIED'];
const UNSAFE_KEYS = ['scenario_compressed', 'compressed', 'compressedPayload', 'lua', 'script',
    'scripts', 'execute', 'executeNow', 'applyNow', 'commitNow', 'gate7Approved',
    'backendUrl', 'fetchUrl', 'apiUrl', 'urlToFetch', 'storageKey', 'localStorage',
    'sessionStorage', 'indexedDB'];

let passed = 0, failed = 0;
function check(name, cond) {
    if (cond) { passed++; console.log('  ✅ ' + name); }
    else      { failed++; console.log('  ❌ ' + name); }
}
function unsafeKeysIn(o) {
    if (!o || typeof o !== 'object') return [];
    const hit = UNSAFE_KEYS.filter(k => Object.prototype.hasOwnProperty.call(o, k));
    if (o.liveMutationAllowed === true) hit.push('liveMutationAllowed');
    if (o.backendCommitAllowed === true) hit.push('backendCommitAllowed');
    return hit;
}

if (!fs.existsSync(DP_BASE)) {
    console.log('SKIP: Decision Package samples not found at ' + DP_BASE);
    process.exit(0);
}

for (const name of PACKAGES) {
    const dir = path.join(DP_BASE, name);
    if (!fs.existsSync(path.join(dir, 'scenario_manifest.json'))) {
        console.log('SKIP ' + name + ' (missing)'); continue;
    }
    console.log('\n=== ' + name + ' ===');

    const pkg = C.loadDecisionPackage(dir);
    const s   = C.buildScenarioFromDecisionPackage(pkg, {});
    const man = pkg.manifest;

    // Distinct units by side from the source steps
    const srcUids = {}, srcSides = {};
    pkg.steps.forEach(st => (st.units || []).forEach(u => {
        if (u && u.uid) { srcUids[u.uid] = true; srcSides[u.uid] = String(u.side || '').toUpperCase(); }
    }));
    const srcRed  = Object.keys(srcSides).filter(u => srcSides[u] === 'RED').length;
    const srcBlue = Object.keys(srcSides).length - srcRed;

    // 1. Strict scenario-validator (the server/HUD load path)
    const v = V.validateScenario(s);
    check('passes scenario-validator (0 errors)', v.ok === true && v.errors.length === 0);
    if (v.errors.length) console.log('     errors: ' + JSON.stringify(v.errors.slice(0, 5)));

    // 2. Live-import safety gate (no unsafe keys at root or any step)
    let unsafe = unsafeKeysIn(s);
    s.steps.forEach(st => { unsafe = unsafe.concat(unsafeKeysIn(st)); });
    check('no unsafe keys (live-import gate)', unsafe.length === 0);

    // 3. Step count fidelity
    check('steps.length === manifest.total_steps', s.steps.length === man.total_steps);

    // 4. Unit counts + side split
    check('unit counts match source', s.red_units.length === srcRed && s.blue_units_initial.length === srcBlue);

    // 5. Coordinate fidelity (per-step coords length + first coord preserved)
    const allCoordArrays = Object.values(s.red_unit_step_coords).concat(Object.values(s.blue_unit_step_coords));
    check('step-coord arrays length === steps', allCoordArrays.every(a => a.length === s.steps.length));
    const firstRed = s.red_units[0];
    const firstRedSrc = (() => { for (const st of pkg.steps) for (const u of (st.units || [])) if (u.uid === (firstRed && firstRed.uid)) return u.position; })();
    check('first red unit coord preserved', !firstRed || JSON.stringify(firstRed.coord) === JSON.stringify(firstRedSrc));

    // 6. Objective mapping + required fields
    check('obj.coord === manifest.objective.position',
        JSON.stringify(s.obj.coord) === JSON.stringify(man.objective.position));
    check('obj has target_depth_km + carver', typeof s.obj.target_depth_km === 'number' && typeof s.obj.carver === 'number');

    // 7. Refinement 1 — decision points + options carried
    check('every step has decisionOptions array', s.steps.every(st => Array.isArray(st.decisionOptions)));
    check('options carried where source had them',
        pkg.steps.every((src, i) => (src.options || []).length === s.steps[i].decisionOptions.length));
    check('a decision_point_baseline is present somewhere', s.steps.some(st => st.decision_point_baseline));

    // 8. Refinement 2 — source_trace + provenance
    check('every step carries source_trace', s.steps.every(st => st.source_trace && st.source_trace.source_file));
    check('scenario.converted_from provenance present',
        s.converted_from && s.converted_from.type === 'decision_package' && s.converted_from.source_dir === name);

    // 9. Refinement 3 — image refs
    check('every step has image_ref', s.steps.every(st => typeof st.image_ref === 'string' && /\.png$/i.test(st.image_ref)));

    // 10. objective_status mapped into enum
    check('all objective_status_baseline in RMOOZ enum',
        s.steps.every(st => OBJ_ENUM.indexOf(st.objective_status_baseline) >= 0));

    // 11. Synthesized geometry within schema bounds + required unit/step fields
    check('bls_template count in [1..8]', s.bls_template.length >= 1 && s.bls_template.length <= 8);
    check('pipeline count in [2..64]', s.pipeline.length >= 2 && s.pipeline.length <= 64);
    check('all red_units have bls', s.red_units.every(u => typeof u.bls === 'string' && u.bls));
    check('all steps + phase_table have elapsed_hours',
        s.steps.every(st => typeof st.elapsed_hours === 'number') &&
        s.phase_table.every(p => typeof p.elapsed_hours === 'number'));
}

// 12. Refinement 4 — overwrite protection (suffix unless --force)
console.log('\n=== overwrite protection ===');
{
    const pkg = C.loadDecisionPackage(path.join(DP_BASE, PACKAGES[0]));
    const s1 = C.buildScenarioFromDecisionPackage(pkg, { name: 'pr242-ovwr-test' });
    const p1 = C.writeScenario(s1, { force: false });
    const s2 = C.buildScenarioFromDecisionPackage(pkg, { name: 'pr242-ovwr-test' });
    const p2 = C.writeScenario(s2, { force: false });   // exists now → must suffix
    check('first write uses requested name', /pr242-ovwr-test\.json$/.test(p1));
    check('second write is suffixed (no clobber)', /pr242-ovwr-test-from-dp\.json$/.test(p2) && p1 !== p2);
    try { fs.unlinkSync(p1); } catch (_) {}
    try { fs.unlinkSync(p2); } catch (_) {}
    console.log('  (cleaned up temp scenario files)');
}

console.log('\n═════════════════════════════════════════');
console.log('  Passed: ' + passed + '  |  Failed: ' + failed);
console.log('  Verdict: ' + (failed === 0 ? 'PASS' : 'FAIL'));
console.log('═════════════════════════════════════════');
process.exit(failed === 0 ? 0 : 1);
