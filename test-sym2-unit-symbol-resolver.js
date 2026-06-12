'use strict';
// test-sym2-unit-symbol-resolver.js — SYM2 resolver. The live resolver uses
// milsymbol (browser); this Node test = an ORACLE that mirrors the tier logic
// against real wargame3.json (stub validity = SYM1's known-unsupported entity
// set) + static wiring/safety checks. Live milsymbol tiers are browser-verified
// (audit: tier1=117, tier2=31, tier3=5, tier4=0; 0 generic diamonds).
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js');
const src = fs.readFileSync(SRC, 'utf8');
const wg3 = require('./UI_MOdified/data/scenarios/wargame3.json');

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (extra != null ? '  — ' + extra : '')); } }

// ── Oracle: mirror the resolver tiers (stub validity from SYM1 finding) ──
const UNSUPPORTED = new Set(['120103','120104','120105','120106','120601','120602','120902','120903','130201','130501','130502','130901']);
const MAP = { destroyer:'120100', corvette:'120100', missile_boat:'120100', naval_unit:'120100', mine_sweeper:'120600', mine_layer:'120600', landing_ship:'120900', hovercraft:'120900', submarine:'110100', manpads:'130500', sam_s300:'130500', sam_hawk:'130500', sam_other:'130500', air_defense:'130500', ssm_brigade:'130600', radar:'130700', air_unit:'110100', fighter_ad:'110100', awacs:'110100', uav_isr:'110100', transport:'110100', utility_helo:'110100' };
const SETDEF = { '30':'120100', '35':'110100', '01':'110100' };
const valid = (sidc) => !UNSUPPORTED.has(String(sidc).slice(10, 16)); // 000000 frame + canonical parents are all valid
function resolve(u) {
    const orig = String(u.sidc), ent = orig.slice(10, 16), set = orig.slice(4, 6);
    if (valid(orig)) return { tier: 1 };
    const ne = MAP[u.role] || SETDEF[set] || null;
    if (ne && valid(orig.slice(0, 10) + ne + orig.slice(16))) return { tier: 2, resolved: orig.slice(0, 10) + ne + orig.slice(16) };
    const frame = orig.slice(0, 10) + '000000' + orig.slice(16);
    if (valid(frame)) return { tier: 3, resolved: frame };
    return { tier: 4 };
}
const units = [].concat((wg3.red_units || []), (wg3.blue_units_initial || []).map(u => ({ uid: u.unit_uid, sidc: u.sidc, role: u.role, domain: u.domain, echelon: u.echelon })));
const tiers = { 1: 0, 2: 0, 3: 0, 4: 0 };
units.forEach(u => { tiers[resolve(u).tier]++; });

console.log('\n─── A. resolver tiers on Wargame 3 ───');
ok('A1 Tier 1 (already-valid) = 117 unchanged', tiers[1] === 117, String(tiers[1]));
ok('A2 Tier 4 (generic diamond/square fallback) = 0', tiers[4] === 0, String(tiers[4]));
ok('A3 all 36 previously-generic units now get a milsymbol symbol (tier2+tier3)', tiers[2] + tiers[3] === 36, 't2=' + tiers[2] + ' t3=' + tiers[3]);
ok('A4 most are remapped to a family ICON (tier2 majority)', tiers[2] >= 28, String(tiers[2]));
console.log('       tiers: 1=' + tiers[1] + ' 2=' + tiers[2] + ' 3=' + tiers[3] + ' 4=' + tiers[4]);

console.log('\n─── B. remap preserves affiliation / set / echelon (only entity changes) ───');
const destroyer = units.find(u => u.role === 'destroyer');
const r = resolve(destroyer);
ok('B1 destroyer remapped to sea-combatant 120100', r.tier === 2 && r.resolved.slice(10, 16) === '120100', r.resolved);
ok('B2 affiliation preserved', r.resolved[3] === String(destroyer.sidc)[3]);
ok('B3 symbol set preserved (naval 30)', r.resolved.slice(4, 6) === String(destroyer.sidc).slice(4, 6));
ok('B4 echelon amplifier preserved', r.resolved.slice(8, 10) === String(destroyer.sidc).slice(8, 10));
const ml = units.find(u => u.role === 'mine_layer'); const ad = units.find(u => u.role === 'manpads');
ok('B5 honest family targets (mine_layer→120600, manpads→130500)', resolve(ml).resolved.slice(10,16) === '120600' && resolve(ad).resolved.slice(10,16) === '130500');

console.log('\n─── C. source wiring ───');
ok('C1 resolveUnitSymbolProfile + auditResolvedUnitSymbols defined', /function resolveUnitSymbolProfile/.test(src) && /function auditResolvedUnitSymbols/.test(src));
ok('C2 4-tier shape (scenario_sidc / role_domain_template / symbol_set_frame / unknown)',
   /'scenario_sidc'/.test(src) && /'role_domain_template'/.test(src) && /'symbol_set_frame'/.test(src) && /fallback_reason/.test(src));
ok('C3 mapping table present (verified family entities)', /SYMBOL_FAMILY_ENTITY/.test(src) && /destroyer:'120100'/.test(src) && /mine_sweeper:'120600'/.test(src));
ok('C4 routed into RED marker creation', /resolveUnitSymbolProfile\(unit\)[\s\S]{0,160}sidcIcon\(_sym\.resolved_sidc/.test(src));
ok('C5 routed into BLUE marker creation', /sidcIcon\(_symB\.resolved_sidc/.test(src));
ok('C6 marker._sidc uses the resolved SIDC (attrition operates on rendered symbol)', /_sym\.resolved_sidc \|\| sidc/.test(src) && /_symB\.resolved_sidc \|\| sidc/.test(src));
ok('C7 exposed on public API', /\n\s*resolveUnitSymbolProfile,/.test(src) && /\n\s*auditResolvedUnitSymbols,/.test(src));
ok('C8 re-validates remap against milsymbol (_msSidcValid)', /_msSidcValid/.test(src) && /isValid\(\)/.test(src));

console.log('\n─── D. safe / read-only / no fabrication ───');
const block = src.slice(src.indexOf('SYM2: unit symbol resolver'), src.indexOf('function auditResolvedUnitSymbols') + 1200);
ok('D1 resolver block does not mutate scenario', !/\.steps\s*\[[^\]]*\]\s*=/.test(block) && !/red_units\s*=|blue_units_initial\s*=/.test(block));
ok('D2 no coordinate change (no setLatLng)', !/setLatLng/.test(block));
// NOTE: "sensor"/"AD"/"ship" are legitimate symbol-FAMILY category words here
// (e.g. radar → sensor symbol); D3 guards against fabricated combat VALUE fields.
ok('D3 no fabricated combat value-fields (ammo/fuel/rounds/casualties/combat_power/readiness)',
   !/(\bammo\b|\bfuel_pct\b|\brounds_remaining\b|\bcasualt|\bcombat_power\b|\breadiness\s*:|\bdamage_pct\s*:)/i.test(block));
ok('D4 preserves original_sidc in profile (authoritative data kept)', /original_sidc/.test(src));

console.log('\n═══════════════════════════════════════════════');
console.log('  SYM2 Symbol Resolver — ' + (fail === 0 ? 'PASS' : 'FAIL') + '  (' + pass + ' passed, ' + fail + ' failed)');
console.log('  → 117 unchanged · ' + tiers[2] + ' remapped · ' + tiers[3] + ' frame-only · ' + tiers[4] + ' generic fallback');
console.log('═══════════════════════════════════════════════');
process.exit(fail === 0 ? 0 : 1);
