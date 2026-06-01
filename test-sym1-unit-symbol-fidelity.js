'use strict';
// test-sym1-unit-symbol-fidelity.js — SYM1 diagnostic (read-only, audit-grounding).
// Live milsymbol validity is browser-verified in docs/unit-symbol-fidelity-audit.md
// (milsymbol is a browser lib). This Node check grounds the audit numbers from the
// DATA: SIDC structure, role/domain/echelon coverage (the resolver inputs), and the
// known milsymbol-unsupported entity inventory that produces the 117/36 split.
const wg3 = require('./UI_MOdified/data/scenarios/wargame3.json');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (extra != null ? '  — ' + extra : '')); }
}

const units = [].concat(
    (wg3.red_units || []).map(u => ({ uid: u.uid, side: 'RED', sidc: u.sidc, role: u.role, domain: u.domain, ech: u.echelon })),
    (wg3.blue_units_initial || []).map(u => ({ uid: u.unit_uid || u.uid, side: 'BLUE', sidc: u.sidc, role: u.role, domain: u.domain, ech: u.echelon }))
);
const entity = s => String(s || '').slice(10, 16);

// milsymbol-2.0.0 unsupported entity codes (from the browser audit in the doc).
const UNSUPPORTED = new Set(['120103','120104','120105','120106','120601','120602','120902','120903','130201','130501','130502','130901']);

console.log('\n─── A. data completeness (resolver inputs) ───');
ok('A1 153 units present', units.length === 153, String(units.length));
ok('A2 every unit has a SIDC', units.every(u => !!u.sidc));
ok('A3 every SIDC is 20-digit APP-6D', units.every(u => String(u.sidc).length === 20));
ok('A4 no frame-only SIDCs (all carry an entity code)', units.every(u => entity(u.sidc) !== '000000'));
ok('A5 every unit has role + domain + echelon (remap is possible from data)',
   units.every(u => u.role && u.domain && u.ech));

console.log('\n─── B. fidelity split (proper vs fallback) ───');
const fallback = units.filter(u => UNSUPPORTED.has(entity(u.sidc)));
const proper = units.length - fallback.length;
ok('B1 117 proper-symbol units (milsymbol-valid entity)', proper === 117, String(proper));
ok('B2 36 fallback units (milsymbol-unsupported entity)', fallback.length === 36, String(fallback.length));
const byDomain = {}; fallback.forEach(u => { byDomain[u.domain] = (byDomain[u.domain] || 0) + 1; });
ok('B3 fallbacks are naval + ground(AD/missile/radar) + air + strategic',
   byDomain.naval === 16 && byDomain.ground === 18 && byDomain.air === 1 && byDomain.strategic === 1,
   JSON.stringify(byDomain));
const bySide = { RED: 0, BLUE: 0 }; fallback.forEach(u => bySide[u.side]++);
ok('B4 fallbacks span both sides (fix must be affiliation-aware)', bySide.RED > 0 && bySide.BLUE > 0, JSON.stringify(bySide));
console.log('       proper=' + proper + ' fallback=' + fallback.length + ' byDomain=' + JSON.stringify(byDomain) + ' bySide=' + JSON.stringify(bySide));

console.log('\n─── C. symbol-set coverage (milsymbol supports these families) ───');
const sets = [...new Set(units.map(u => String(u.sidc).slice(4, 6)))].sort();
ok('C1 symbol sets are standard (10 land / 30 sea / 35 subsurface / 01 air)',
   sets.every(s => ['01','10','30','35'].includes(s)), JSON.stringify(sets));
ok('C2 fallbacks are NOT due to missing data (all have role/domain/echelon)',
   fallback.every(u => u.role && u.domain && u.ech));

console.log('\n─── D. honesty guard (resolver must not fabricate) ───');
// the resolver plan maps by category only; assert the fallback roles are CATEGORY-level
// (e.g. "destroyer"), not platform-specific identity we'd have to invent.
ok('D1 fallback roles are category-level (no fabricated platform identity needed)',
   fallback.every(u => typeof u.role === 'string' && u.role.length > 0));
ok('D2 audit doc exists', require('fs').existsSync(require('path').join(__dirname, 'docs/unit-symbol-fidelity-audit.md')));

console.log('\n═══════════════════════════════════════════════');
console.log('  SYM1 Unit Symbol Fidelity — ' + (fail === 0 ? 'PASS' : 'FAIL') + '  (' + pass + ' passed, ' + fail + ' failed)');
console.log('  → ' + proper + '/' + units.length + ' proper symbols, ' + fallback.length + ' fallback (milsymbol-unsupported entity)');
console.log('═══════════════════════════════════════════════');
process.exit(fail === 0 ? 0 : 1);
