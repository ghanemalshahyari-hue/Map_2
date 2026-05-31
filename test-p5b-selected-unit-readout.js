'use strict';
// test-p5b-selected-unit-readout.js — P5b Selected Unit panel operational readout.
// unit-panel.js is a browser IIFE; this is a static/source check that the panel
// surfaces REAL marker data (symbol profile, current-step status) + honest
// placeholders only, with no fabrication, no map/scenario mutation, no new panel.
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, 'UI_MOdified/client/shell/unit-panel.js');
const src = fs.readFileSync(SRC, 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log('  PASS  ' + name); } else { fail++; console.log('  FAIL  ' + name + (extra != null ? '  — ' + extra : '')); } }

// the P5b additions block (between the marker-readout comment and renderEmpty)
const block = src.slice(src.indexOf('P5b: marker-derived readouts'), src.indexOf('function renderEmpty'));

console.log('\n─── A. functions defined ───');
ok('A1 findSelectedMarker + ensureSection + setKv', /function findSelectedMarker/.test(src) && /function ensureSection/.test(src) && /function setKv/.test(src));
ok('A2 renderSymbolProfile + renderStepStatus + renderCapability', /function renderSymbolProfile/.test(src) && /function renderStepStatus/.test(src) && /function renderCapability/.test(src));

console.log('\n─── B. real data sources (marker-derived, no fabrication) ───');
ok('B1 reads the live marker via getScenarioMarkers()', /getScenarioMarkers\(\)/.test(block) && /marker\._symbolProfile/.test(block) && /marker\._attrition/.test(block));
ok('B2 matches the selected unit by uid (_unitId / _unitData.id)', /_unitId/.test(block) && /_unitData && m\._unitData\.id/.test(block));
ok('B3 symbol profile shows original + resolved SIDC + family + source/confidence/fallback', /original_sidc/.test(block) && /resolved_sidc/.test(block) && /symbol_family/.test(block) && /\.source/.test(block) && /\.confidence/.test(block) && /fallback_reason/.test(block));
ok('B4 current-step status from real attrition (status/damage/cause/doctrine/step)', /status_change/.test(block) && /damage_pct/.test(block) && /cause_what/.test(block) && /cause_doctrine/.test(block));
ok('B5 position prefers the LIVE marker getLatLng (tracks step changes)', /_marker\.getLatLng\(\)/.test(src) && /_marker && typeof _marker\.getLatLng/.test(src));

console.log('\n─── C. honest labelling (no fake platform/operational status) ───');
ok('C1 remapped symbols labelled family/category, NOT exact platform', /not exact platform/.test(block) && /Family \/ category symbol/.test(block));
ok('C2 unchanged original SIDC labelled clearly', /Original scenario symbol \(unchanged\)/.test(block));
ok('C3 capability = honest placeholders only (Not assigned / scenario step data)', /Not assigned/.test(block) && /Scenario step data only/.test(block));
ok('C4 affected-only: shows "No change this step" when no attrition (no fake damage)', /No change this step/.test(block));
ok('C5 NO fabricated combat values (no hardcoded fuel %/ammo counts/readiness %/combat power)',
   !/(\d+\s*%\s*fuel|fuel.*\d+\s*%|rounds:\s*\d|ammo:\s*\d|readiness:\s*\d|combat_power|\bsortie)/i.test(block));

console.log('\n─── D. safe / reuse / scope ───');
ok('D1 reuses existing panel (injects sections, no new panel/container created)', !/document\.body\.appendChild/.test(block) && /insertAdjacentElement\('afterend'/.test(block));
ok('D2 no scenario mutation / no map rendering change', !/setLatLng/.test(block) && !/drawScenario/.test(block) && !/scenarioRef/.test(block) && !/red_unit_step/.test(block));
ok('D3 no backend/storage/fetch', !/\bfetch\(|localStorage|sessionStorage|XMLHttpRequest/.test(block));
ok('D4 textContent-only (no data injected via innerHTML)', !/innerHTML/.test(block));
ok('D5 does not overwrite existing identity/combat fields (own section ids)', /up-section-symprofile/.test(block) && /up-section-stepstatus/.test(block) && /up-section-capability/.test(block) && !/up-callsign/.test(block) && !/up-field-fuel/.test(block));

console.log('\n─── E. live update on step change ───');
ok('E1 listens to rmooz:timeline-ui-action and re-renders the selected unit', /addEventListener\('rmooz:timeline-ui-action'/.test(src) && /renderUnit\(currentUnit, currentSelectedAt\)/.test(src));
ok('E2 new sections hidden in the empty state', /up-section-symprofile'.*up-section-stepstatus'.*up-section-capability'/.test(src) || (/up-section-symprofile/.test(src) && /renderEmpty/.test(src) && src.indexOf("up-section-symprofile','up-section-stepstatus','up-section-capability") > -1));

console.log('\n═══════════════════════════════════════════════');
console.log('  P5b Selected Unit Readout — ' + (fail === 0 ? 'PASS' : 'FAIL') + '  (' + pass + ' passed, ' + fail + ' failed)');
console.log('═══════════════════════════════════════════════');
process.exit(fail === 0 ? 0 : 1);
