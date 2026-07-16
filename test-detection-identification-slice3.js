#!/usr/bin/env node
/**
 * test-detection-identification-slice3.js — Batch E Slice 3 (CORRECTED per the
 * real-CMO manual audit): contact knowledge and affiliation are INDEPENDENT
 * axes, not a single ladder.
 *
 * Every contact carries four independent fields:
 *   detection_state      ('imprecise' | 'precise')
 *   classification_level ('unknown' | 'classified')
 *   identity             (exact unit identity, nullable)
 *   affiliation          ('unknown' | 'friendly' | 'neutral' | 'unfriendly' | 'hostile')
 *
 * Hard rules asserted here:
 *   - scenario `side` NEVER auto-populates affiliation;
 *   - detection confidence NEVER implies hostility;
 *   - 'hostile'/'friendly' are NOT part of the knowledge (classification) enum;
 *   - legacy records normalize through the adapter without inventing affiliation.
 *
 *   node test-detection-identification-slice3.js
 */
'use strict';

const path = require('path');
const detection = require(path.join(__dirname, 'UI_MOdified/client/shell/detection.js'));

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  PASS  ' + label); pass++; }
    else      { console.error('  FAIL  ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

console.log('\n=== Part 1: the enums are separate — affiliation is NOT in the knowledge enum ===\n');
(function enums() {
    eq(detection.DETECTION_STATES.join(','), 'imprecise,precise', 'detection_state axis');
    eq(detection.CLASSIFICATION_LEVELS.join(','), 'unknown,classified', 'classification_level axis (knowledge only)');
    eq(detection.AFFILIATIONS.join(','), 'unknown,friendly,neutral,unfriendly,hostile', 'affiliation axis (separate)');
    ok(detection.CLASSIFICATION_LEVELS.indexOf('hostile') === -1 && detection.CLASSIFICATION_LEVELS.indexOf('friendly') === -1,
        "'hostile'/'friendly' are NOT part of the classification (knowledge) enum");
    ok(typeof detection.IDENTIFICATION_STATES === 'undefined',
        'the old single identification ladder enum is removed entirely');
    ok(typeof detection.identificationFor === 'undefined',
        'the old identificationFor() ladder function is removed entirely');
})();

console.log('\n=== Part 2: detectionAxesFor — pure axis derivation, affiliation always unknown ===\n');
(function pureAxes() {
    const firmRadar = detection.detectionAxesFor('radar', 'firm');
    eq(firmRadar.detection_state, 'precise', 'firm radar -> precise track');
    eq(firmRadar.classification_level, 'classified', 'firm radar resolves a class');
    eq(firmRadar.identity, null, 'identity is not resolved from sensors this batch (null, honestly)');
    eq(firmRadar.affiliation, 'unknown', 'firm radar affiliation is unknown — confidence NEVER implies hostility');

    const weakRadar = detection.detectionAxesFor('radar', 'tentative');
    eq(weakRadar.detection_state, 'imprecise', 'tentative radar -> imprecise track');
    eq(weakRadar.classification_level, 'unknown', 'tentative radar does not resolve a class');
    eq(weakRadar.affiliation, 'unknown', 'tentative radar affiliation unknown');

    const esm = detection.detectionAxesFor('esm', 'tentative');
    eq(esm.classification_level, 'unknown', 'ESM bearing carries no class');
    eq(esm.affiliation, 'unknown', 'ESM affiliation unknown');

    const esmFirm = detection.detectionAxesFor('esm', 'firm');
    eq(esmFirm.classification_level, 'unknown', 'ESM never classifies even at firm confidence');
})();

console.log('\n=== Part 3: computeContacts — real contacts carry all four axes, affiliation never from side ===\n');
(function realContacts() {
    const ws = {
        units: [
            { uid: 'RED-1', side: 'RED', domain: 'ground', position: [10, 30],
              sensors: [{ id: 's1', type: 'radar', class: 'surface_search', emcon: 'active' }] },
            { uid: 'BLUE-1', side: 'BLUE', domain: 'ground', position: [10.01, 30], role: 'infantry' },
        ],
    };
    const contacts = detection.computeContacts(ws);
    const c = contacts.find((x) => x.target_uid === 'BLUE-1');
    ok(!!c, 'sanity: the close radar contact is produced');
    eq(c.detection_state, 'precise', 'contact carries detection_state');
    eq(c.classification_level, 'classified', 'contact carries classification_level');
    ok('identity' in c && c.identity === null, 'contact carries a nullable identity (null here)');
    eq(c.affiliation, 'unknown',
        'CRITICAL: RED-1 detecting a BLUE-side unit yields affiliation "unknown" — side did NOT auto-populate hostility');

    // Prove the god's-eye side is present on the target but deliberately NOT copied to the contact.
    const target = ws.units.find((u) => u.uid === 'BLUE-1');
    eq(target.side, 'BLUE', 'sanity: the target really is BLUE side (opposite the RED observer)');
    ok(c.affiliation !== 'hostile' && c.affiliation !== 'friendly',
        'the contact is neither hostile nor friendly despite a known-opposite side — affiliation stays unknown');
})();

console.log('\n=== Part 4: normalization adapter — legacy records coerce without inventing affiliation ===\n');
(function adapter() {
    const legacyClassified = detection.normalizeContactIdentity({ target_uid: 'X', identification: 'classified' });
    eq(legacyClassified.classification_level, 'classified', 'legacy identification:"classified" -> classification_level classified');
    eq(legacyClassified.detection_state, 'precise', 'legacy classified -> precise');
    eq(legacyClassified.affiliation, 'unknown', 'legacy record does NOT gain an affiliation from the adapter');

    const legacyDetected = detection.normalizeContactIdentity({ target_uid: 'Y', identification: 'detected' });
    eq(legacyDetected.classification_level, 'unknown', 'legacy "detected" -> classification unknown');
    eq(legacyDetected.detection_state, 'precise', 'legacy "detected" -> precise (a track existed)');

    // A hypothetical old bad record that literally carried a hostility value in
    // the identification field must NOT be honored as affiliation evidence.
    const legacyHostile = detection.normalizeContactIdentity({ target_uid: 'Z', identification: 'hostile' });
    eq(legacyHostile.affiliation, 'unknown',
        'a legacy identification:"hostile" is NOT mapped to affiliation — detection can never imply hostility');

    const empty = detection.normalizeContactIdentity({});
    eq(empty.detection_state, 'imprecise', 'a bare record gets safe defaults');
    eq(empty.classification_level, 'unknown', 'bare record classification defaults unknown');
    eq(empty.identity, null, 'bare record identity defaults null');
    eq(empty.affiliation, 'unknown', 'bare record affiliation defaults unknown');

    const alreadyNew = detection.normalizeContactIdentity({ detection_state: 'precise', classification_level: 'classified', identity: 'USS X', affiliation: 'friendly' });
    eq(alreadyNew.identity, 'USS X', 'an already-four-axis record is preserved (identity kept)');
    eq(alreadyNew.affiliation, 'friendly', 'an explicitly-set affiliation (from posture/manual, not detection) is preserved');
})();

console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
