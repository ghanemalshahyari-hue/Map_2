#!/usr/bin/env node
'use strict';
/**
 * SYMBOL-FLOW-1 — read-only unit-symbol audit.
 *
 * Reports how imported units are equipped for symbol rendering. READ-ONLY:
 * loads a scenario, computes coverage + symbol-set distribution + domain/set
 * mismatches, and prints RED/BLUE resolution examples. Mutates nothing,
 * fabricates no SIDCs, hardcodes no scenario names (auto-detects a w3-rich /
 * WarGamingGEN-imported scenario by data shape).
 *
 * Tier counts (proper milsymbol vs frame vs diamond) require the browser
 * resolver (auditResolvedUnitSymbols + milsymbol) and are NOT computed here —
 * this is a data-level audit only.
 *
 * Run:  node scripts/test-symbol-flow-1-audit.js [path/to/scenario.json]
 */
const fs = require('fs');
const path = require('path');

const SCN_DIR = path.join(__dirname, '..', 'data', 'scenarios');

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

// Auto-detect an imported WarGamingGEN/W3-rich scenario by DATA SHAPE.
function findScenario(argPath) {
    if (argPath) return argPath;
    let files = [];
    try { files = fs.readdirSync(SCN_DIR).filter(f => f.endsWith('.json') && f !== '_active.json'); }
    catch (_) { return null; }
    // Prefer w3-rich / generated-from-docs scenarios with a real OOB.
    const scored = files.map(f => {
        let d; try { d = loadJson(path.join(SCN_DIR, f)); } catch (_) { return null; }
        if (!d || (!Array.isArray(d.red_units) && !Array.isArray(d.blue_units_initial))) return null;
        const n = (d.red_units || []).length + (d.blue_units_initial || []).length;
        const w3 = d.schema_variant === 'w3-rich' || d.generated_from_docs ? 1 : 0;
        return { f, n, w3 };
    }).filter(Boolean);
    scored.sort((a, b) => (b.w3 - a.w3) || (b.n - a.n));
    return scored.length ? path.join(SCN_DIR, scored[0].f) : null;
}

const target = findScenario(process.argv[2]);
if (!target) { console.error('SKIP — no scenario with units found under data/scenarios'); process.exit(0); }

const sc = loadJson(target);
const SET_NAME = { '10': 'land', '30': 'sea-surface', '35': 'sea-sub', '01': 'air', '20': 'installation' };

function norm(u, side) {
    return {
        uid: u.uid || u.unit_uid || '(no-uid)',
        side,
        role: u.role || u.type || null,
        domain: u.domain || null,
        echelon: u.echelon || null,
        sidc: u.sidc || null,
        set: (u.sidc && u.sidc.length >= 6) ? u.sidc.slice(4, 6) : null,
    };
}
const units = []
    .concat((sc.red_units || []).map(u => norm(u, 'RED')))
    .concat((sc.blue_units_initial || []).map(u => norm(u, 'BLUE')));

const total = units.length;
const withSidc   = units.filter(u => u.sidc).length;
const withRole   = units.filter(u => u.role).length;
const roleOnly   = units.filter(u => u.role && !u.sidc).length;
const withDomain = units.filter(u => u.domain).length;
const withEch    = units.filter(u => u.echelon).length;
const unknownRole = units.filter(u => (u.role || '').toLowerCase() === 'unknown').length;

const setDist = {};
for (const u of units) { const k = u.set ? (SET_NAME[u.set] || u.set) : 'none'; setDist[k] = (setDist[k] || 0) + 1; }

// G1 heuristic: naval/air domain but LAND symbol set (10) — the porter's
// name-word override mapping a sea/air platform onto a land symbol.
const domainSetMismatch = units.filter(u =>
    (u.domain === 'naval' || u.domain === 'air') && u.set === '10');

function sample(side, n) {
    return units.filter(u => u.side === side).slice(0, n).map(u =>
        `    ${u.uid}  role=${u.role} domain=${u.domain} ech=${u.echelon} set=${u.set ? (SET_NAME[u.set] || u.set) : 'none'} sidc=${u.sidc}`);
}

console.log('\nSYMBOL-FLOW-1 — unit symbol audit (read-only)');
console.log('scenario:', path.basename(target), '| schema_variant:', sc.schema_variant || '(none)');
console.log('\n[coverage]');
console.log('  total units            :', total);
console.log('  with SIDC              :', withSidc, '/', total);
console.log('  with role/type         :', withRole, '/', total);
console.log('  role/type but NO SIDC  :', roleOnly);
console.log('  with domain            :', withDomain, '/', total);
console.log('  with echelon           :', withEch, '/', total);
console.log('  role === "unknown"     :', unknownRole);
console.log('\n[symbol-set distribution] (sidc digits 5-6)');
for (const [k, v] of Object.entries(setDist)) console.log(`  ${k.padEnd(14)}: ${v}`);
console.log('\n[G1 — naval/air domain rendered with LAND symbol set]');
console.log('  count:', domainSetMismatch.length);
domainSetMismatch.slice(0, 8).forEach(u =>
    console.log(`    ${u.uid}  role=${u.role} domain=${u.domain} set=land`));
console.log('\n[RED examples]');
sample('RED', 5).forEach(l => console.log(l));
console.log('\n[BLUE examples]');
sample('BLUE', 5).forEach(l => console.log(l));

console.log('\n[notes]');
console.log('  • Source GeoJSON ships NO sidc — the porter (w3SidcFor) builds it.');
console.log('  • Final milsymbol tier (proper / family-remap / frame / diamond) is');
console.log('    only observable in-browser via auditResolvedUnitSymbols(scenario).');

// Soft invariants — exit non-zero only on a structural problem.
let failed = 0;
function expect(name, cond) { if (cond) { /* ok */ } else { console.error('  FAIL:', name); failed++; } }
console.log('\n[invariants]');
expect('scenario has units', total > 0);
expect('every unit has a side', units.every(u => u.side === 'RED' || u.side === 'BLUE'));
if (!failed) console.log('  PASS — audit produced, all units have a side');

console.log('\n' + (failed ? 'FAIL' : 'PASS') + ' test-symbol-flow-1-audit');
process.exit(failed ? 1 : 0);
