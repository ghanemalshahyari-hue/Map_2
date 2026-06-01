/* test-db1-capabilities.js — PR-DB1 static checks (no server).
 * Verifies the role→capability catalog, enrichment (no overwrite of authored
 * components), and — the payoff — the full engine stack (DET1/ENG1/WS3) lighting
 * up on the REAL Wargame 3 scenario once units are enriched.
 * Run: node test-db1-capabilities.js */
'use strict';
const path = require('path');
const DB  = require(path.join(__dirname, 'UI_MOdified/client/shell/world-state-db.js'));
const WS  = require(path.join(__dirname, 'UI_MOdified/client/shell/world-state.js'));
const DET = require(path.join(__dirname, 'UI_MOdified/client/shell/detection.js'));
const ENG = require(path.join(__dirname, 'UI_MOdified/client/shell/engagement.js'));
const WS3 = require(path.join(__dirname, 'UI_MOdified/client/shell/world-state-transition.js'));
const w3scn = require(path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json'));

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log('  ✓ ' + name)) : (fail++, console.log('  ✗ ' + name)); }

console.log('PR-DB1 — DB-Lite (role → capability) + full-stack on real W3');

/* 1. classification (generic role/domain rules) */
ok('air-defense role → air_defense', DB.classifyKind({ role: 'sam_battery', domain: 'ground' }) === 'air_defense');
ok('domain air → air_unit', DB.classifyKind({ role: 'fighter_sqn', domain: 'air' }) === 'air_unit');
ok('naval → naval_combatant', DB.classifyKind({ role: 'destroyer', domain: 'sea' }) === 'naval_combatant');
ok('base/strategic → ew_site', DB.classifyKind({ role: 'naval_base', domain: 'strategic' }) === 'ew_site');
ok('mech division → ground_maneuver', DB.classifyKind({ role: 'mech_inf_div', domain: 'ground' }) === 'ground_maneuver');

/* 2. enrichment attaches components from the catalog */
const ad = DB.enrichUnit({ uid: 'AD1', side: 'RED', role: 'sam_battery', domain: 'ground', position: [19, 30] });
ok('enriched air-defense gets radar + SAM + magazine + rcs',
   ad.sensors.length >= 2 && ad.weapons.some(w => w.class === 'long_range_sam') && ad.magazines.length >= 1 && ad.rcs_class);
ok('enriched unit gets readiness/supply/doctrine_tags',
   ad.readiness && ad.supply != null && Array.isArray(ad.doctrine_tags) && ad.doctrine_tags.includes('IADS'));

/* 3. authored components are NOT overwritten */
const authored = DB.enrichUnit({ uid: 'X', role: 'destroyer', domain: 'sea', position: [19, 30],
    sensors: [{ id: 'custom', type: 'radar', class: 'long_range_3d', emcon: 'silent' }] });
ok('authored sensors preserved (no overwrite)', authored.sensors.length === 1 && authored.sensors[0].id === 'custom');

/* 4. THE PAYOFF — real W3 scenario lights up after enrichment */
const wsRaw = WS.deriveWorldState(w3scn, 4);
ok('raw W3 units carry NO components (baseline)',
   wsRaw.units.every(u => (u.sensors || []).length === 0));
const wsEnriched = DB.enrichWorldState(wsRaw);
ok('enriched W3 units now carry sensors',
   wsEnriched.units.filter(u => (u.sensors || []).length > 0).length > 0);
ok('enriched W3 units carry rcs_class', wsEnriched.units.every(u => u.rcs_class));

const contactsRaw = DET.computeContacts(wsRaw);
const contactsEnriched = DET.computeContacts(wsEnriched);
ok('raw W3 → 0 contacts; enriched W3 → contacts appear',
   contactsRaw.length === 0 && contactsEnriched.length > 0);
console.log('     (enriched W3 contacts: ' + contactsEnriched.length + ')');

/* 5. full loop on enriched real scenario: an ENGAGE on a detected pair resolves */
// pick a detected enemy pair from the enriched contacts
const aContact = contactsEnriched[0];
const shooter = wsEnriched.units.find(u => u.side === aContact.detected_by_side && (u.weapons || []).length);
let engagedOnReal = false;
if (shooter) {
    const res = WS3.applyDecision(wsEnriched, { type: 'ENGAGE', shooter: shooter.uid, target: aContact.target_uid, force: true });
    engagedOnReal = res.effects.some(e => e.type === 'engagement' && (e.status === 'engaged' || e.reason === 'out_of_range'));
}
ok('WS3 ENGAGE runs end-to-end on the enriched real scenario', engagedOnReal);

/* 6. EMCON narrative on the real scenario: silence all radars → contacts drop */
const wsSilent = DB.enrichWorldState(wsRaw);
wsSilent.units.forEach(u => (u.sensors || []).forEach(s => { if ((s.type || 'radar') === 'radar') s.emcon = 'silent'; }));
ok('all-EMCON-silent on real W3 → fewer/zero contacts',
   DET.computeContacts(wsSilent).length < contactsEnriched.length);

/* 7. purity */
const snap = JSON.stringify(wsRaw);
DB.enrichWorldState(wsRaw);
ok('enrichWorldState does not mutate input', JSON.stringify(wsRaw) === snap);

console.log(`\nPR-DB1: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
