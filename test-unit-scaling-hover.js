'use strict';
// test-unit-scaling-hover.js — CMO-style zoom-responsive unit sizing + formation
// hover-peek. adjudicator-map.js is a browser IIFE → oracle (scale formula) +
// static wiring/safety checks + CSS checks.
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js');
const CSS = path.join(__dirname, 'UI_MOdified/client/style.css');
const src = fs.readFileSync(SRC, 'utf8');
const css = fs.readFileSync(CSS, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  PASS  ' + name); }
    else { fail++; console.log('  FAIL  ' + name + (extra != null ? '  — ' + extra : '')); }
}

// ── A. zoom-scale formula (oracle, mirrors unitScaleForZoom) ─────────────
function unitScaleForZoom(z) { return Math.max(0.4, Math.min(0.8, 0.42 + (z - 8) * 0.06)); }
console.log('\n─── A. zoom-responsive scale ───');
ok('A1 smaller when zoomed OUT than zoomed IN', unitScaleForZoom(8) < unitScaleForZoom(13), unitScaleForZoom(8) + ' vs ' + unitScaleForZoom(13));
ok('A2 monotonic non-decreasing with zoom', [6,8,10,12,14].every((z,i,a) => i === 0 || unitScaleForZoom(z) >= unitScaleForZoom(a[i-1])));
ok('A3 bounded (never huge, never invisible)', [4,6,8,10,12,14,16].every(z => unitScaleForZoom(z) >= 0.4 && unitScaleForZoom(z) <= 0.8));
ok('A4 wide zoom clearly shrinks symbols (<=0.5x at z8)', unitScaleForZoom(8) <= 0.45, String(unitScaleForZoom(8)));
console.log('       scale: z8=' + unitScaleForZoom(8) + ' z10=' + unitScaleForZoom(10) + ' z12=' + unitScaleForZoom(12).toFixed(2) + ' z14=' + unitScaleForZoom(14).toFixed(2));

console.log('\n─── B. sizing wiring ───');
ok('B1 unitScaleForZoom + updateUnitScale defined', /function unitScaleForZoom/.test(src) && /function updateUnitScale/.test(src));
ok('B2 sets --wg-unit-scale CSS var on the map container', /setProperty\('--wg-unit-scale'/.test(src));
ok('B3 recomputed on zoomend', /on\('zoomend', updateUnitScale\)/.test(src));
ok('B4 initial scale set after draw', /updateUnitScale\(\);[\s\S]{0,80}initial zoom-responsive/.test(src) || /updateUnitScale\(\); }/.test(src));
ok('B5 CSS scales the SVG (not the marker wrapper) via the var', /\.wg-adj-sidc svg[\s\S]{0,120}scale\(var\(--wg-unit-scale/.test(css));

console.log('\n─── C. formation hover-peek ───');
ok('C1 setFormationPeek defined (toggles .wg-peek)', /function setFormationPeek/.test(src) && /'wg-peek'/.test(src));
ok('C2 aggregates have mouseover + mouseout → peek on/off', /mk\.on\('mouseover'[\s\S]{0,80}setFormationPeek\(g, true\)/.test(src) && /mk\.on\('mouseout'[\s\S]{0,80}setFormationPeek\(g, false\)/.test(src));
ok('C3 click-to-drill still present (hover + click both expand)', /mk\.on\('click'/.test(src) && /setView\(b\.getCenter\(\), targetZ/.test(src));
ok('C4 CSS reveals peeked units while rolled up', /\.wg-rolled-up\s+\.wg-adj-sidc\.wg-peek[\s\S]{0,80}display:\s*block/.test(css));
ok('C5 tooltip explains hover + click', /hover to peek · click to zoom/.test(src));

console.log('\n─── D. safe / additive / reversible ───');
const block = src.slice(src.indexOf('CMO-style zoom-responsive unit sizing'), src.indexOf('AN2: read-only event pins'));
ok('D1 sizing/peek block does NOT change coordinates (no setLatLng)', !/setLatLng/.test(block));
ok('D2 does NOT mutate scenario', !/\.steps\s*\[[^\]]*\]\s*=/.test(block) && !/scenarioRef\s*=/.test(block));
ok('D3 reversible: CSS defaults to scale 1 when var unset', /var\(--wg-unit-scale, 1\)/.test(css));
ok('D4 no fabricated combat data', !/(\bammo\b|\bfuel\b|\bcasualt|\bcombat_power\b)/i.test(block));

console.log('\n═══════════════════════════════════════════════');
console.log('  Unit scaling + hover-peek — ' + (fail === 0 ? 'PASS' : 'FAIL') + '  (' + pass + ' passed, ' + fail + ' failed)');
console.log('═══════════════════════════════════════════════');
process.exit(fail === 0 ? 0 : 1);
