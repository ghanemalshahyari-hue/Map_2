/* test-eng1-engagement.js — PR-ENG1 static checks (no server).
 * Verifies the engagement chain: detection-gated, WRA range modes, ammo,
 * fire-control channel limits, salvo Pk math, point-defense autonomy, blocked
 * reasons, purity, and graceful degrade. Run: node test-eng1-engagement.js */
'use strict';
const path = require('path');
const ENG = require(path.join(__dirname, 'UI_MOdified/client/shell/engagement.js'));
const DET = require(path.join(__dirname, 'UI_MOdified/client/shell/detection.js'));
const w3  = require(path.join(__dirname, 'UI_MOdified/client/shell/world-state.js'));
const w3scn = require(path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json'));

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log('  ✓ ' + name)) : (fail++, console.log('  ✗ ' + name)); }
function approx(a, b, t) { return Math.abs(a - b) <= (t || 1e-6); }

console.log('PR-ENG1 — engagement rules (FC channels → WRA → salvo)');

/* salvo Pk math: 1-(1-pk)^n */
ok('Pk salvo: pk .7 ×2 = 0.91', approx(ENG.pkSalvo(0.7, 2), 0.91, 1e-9));
ok('Pk salvo grows with salvo', ENG.pkSalvo(0.5, 3) > ENG.pkSalvo(0.5, 1));

/* helpers */
function near(lon, lat, dNm, brg) {
    var dLat = (dNm / 60) * Math.cos((brg || 0) * Math.PI / 180);
    var dLon = (dNm / 60) * Math.sin((brg || 0) * Math.PI / 180) / Math.cos(lat * Math.PI / 180);
    return [lon + dLon, lat + dLat];
}
const base = [19, 30];
function sam(extra) {
    return Object.assign({
        uid: 'RED-SAM', side: 'RED', domain: 'ground', position: base,
        sensors: [{ id: 'fc', class: 'fire_control', subtype: 'fire_control', channels: 2 }],
        weapons: [{ id: 'w1', type: 'sam_lr', class: 'long_range_sam', mount: 'm1', wra: { mode: 'max', salvo: 2 } }],
        magazines: [{ mount: 'm1', stock: { sam_lr: 8 } }]
    }, extra || {});
}
function airTgt(uid, dNm) { return { uid, side: 'BLUE', domain: 'air', position: near(base[0], base[1], dNm, 90), sensors: [], weapons: [], magazines: [] }; }
// contacts: RED has detected the listed BLUE targets
function contactsFor(uids) { return uids.map(u => ({ target_uid: u, detected_by_side: 'RED', confidence: 'firm' })); }

/* 1. basic engage: 1 detected target in range → engaged with salvo + Pk */
let ws = { units: [sam(), airTgt('B1', 40)] };
let eng = ENG.computeEngagements(ws, contactsFor(['B1']));
let e1 = eng.find(e => e.target === 'B1');
ok('engages a detected in-range target', e1 && e1.status === 'engaged');
ok('records salvo + Pk_kill', e1 && e1.salvo === 2 && approx(e1.pk_kill, 0.91, 1e-3));
ok('decrements magazine (8 → 6)', e1 && e1.rounds_remaining === 6);

/* 2. detection gate: target NOT in contacts → no engagement at all */
let engND = ENG.computeEngagements({ units: [sam(), airTgt('B1', 40)] }, []);
ok('no detection → not engaged (no fabrication)', !engND.some(e => e.status === 'engaged'));

/* 3. range gate (WRA max = 80 nm) */
let engOOR = ENG.computeEngagements({ units: [sam(), airTgt('FAR', 120)] }, contactsFor(['FAR']));
ok('out-of-range target → blocked out_of_range',
   engOOR.some(e => e.target === 'FAR' && e.status === 'blocked' && e.reason === 'out_of_range'));

/* 3b. WRA 75% mode shrinks the gate (90 nm target: in-range at max, out at 75%) */
let s75 = sam(); s75.weapons[0].wra = { mode: '75pct', salvo: 2 };  // 80*0.75 = 60 nm
let eng75 = ENG.computeEngagements({ units: [s75, airTgt('T70', 70)] }, contactsFor(['T70']));
ok('WRA 75% tightens range (70 nm now out)', eng75.some(e => e.target === 'T70' && e.reason === 'out_of_range'));

/* 4. fire-control channel limit: 3 targets, 2 channels → 2 engaged, 1 blocked */
let ws3 = { units: [sam(), airTgt('A', 30), airTgt('B', 40), airTgt('C', 50)] };
let engCh = ENG.computeEngagements(ws3, contactsFor(['A', 'B', 'C']));
let engagedN = engCh.filter(e => e.status === 'engaged').length;
ok('FC channels cap simultaneous engagements (2 of 3)', engagedN === 2);
ok('the excess target is blocked: no_fire_control_channel',
   engCh.some(e => e.status === 'blocked' && e.reason === 'no_fire_control_channel'));

/* 5. point-defense is autonomous (no channel needed) */
let ciws = { uid: 'RED-CIWS', side: 'RED', domain: 'sea', position: base, sensors: [],
    weapons: [{ id: 'c', type: 'ciws', class: 'point_defense', mount: 'mc' }],
    magazines: [{ mount: 'mc', stock: { ciws: 2000 } }] };
let engPD = ENG.computeEngagements({ units: [ciws, airTgt('M', 3)] }, contactsFor(['M']));
ok('point-defense engages with no FC channel', engPD.some(e => e.shooter === 'RED-CIWS' && e.status === 'engaged'));

/* 6. winchester: empty magazine → blocked */
let dry = sam(); dry.magazines[0].stock.sam_lr = 0;
let engDry = ENG.computeEngagements({ units: [dry, airTgt('B1', 40)] }, contactsFor(['B1']));
ok('empty magazine → blocked winchester', engDry.some(e => e.reason === 'winchester'));

/* 7. WRA hold → blocked */
let hold = sam(); hold.weapons[0].wra = { mode: 'max', salvo: 2, hold: true };
let engHold = ENG.computeEngagements({ units: [hold, airTgt('B1', 40)] }, contactsFor(['B1']));
ok('WRA hold → blocked weapons_hold', engHold.some(e => e.reason === 'weapons_hold'));

/* 8. domain filter: SAM (vs air) ignores a ground target */
let engDom = ENG.computeEngagements({ units: [sam(), { uid: 'G', side: 'BLUE', domain: 'ground', position: near(base[0],base[1],20,90), sensors:[],weapons:[],magazines:[] }] }, contactsFor(['G']));
ok('SAM does not target a ground unit (domain filter)', !engDom.some(e => e.target === 'G'));

/* 9. purity */
let wsP = { units: [sam(), airTgt('B1', 40)] };
let snap = JSON.stringify(wsP);
ENG.computeEngagements(wsP, contactsFor(['B1']));
ok('input world state not mutated (magazine clone)', JSON.stringify(wsP) === snap);

/* 10. degrade — real W3 units carry no weapons yet → no engagements */
let wsW3 = w3.deriveWorldState(w3scn, 5);
let cW3 = DET.computeContacts(wsW3);
ok('W3 (no weapon components) → zero engagements', ENG.computeEngagements(wsW3, cW3).length === 0);
ok('empty / null input does not throw',
   (() => { try { ENG.computeEngagements({}, []); ENG.computeEngagements(null, null); return true; } catch (_) { return false; } })());

console.log(`\nPR-ENG1: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
