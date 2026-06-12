'use strict';
// test-p0b-animation-readiness.js — AUDIT check (not a feature test).
// Inventories, from real files, what scenario ANIMATION data exists, what render
// primitives exist, and whether the two are WIRED — so the readiness audit is
// grounded in facts, not assumptions. Read-only; changes nothing.
const fs = require('fs');
const path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const has = (src, re) => re.test(src);

const wg3 = require('./UI_MOdified/data/scenarios/wargame3.json');
const mapSrc = R('UI_MOdified/client/wargame/adjudicator-map.js');
const wsSrc  = R('UI_MOdified/client/shell/scenario-workspace.js');
const manSrc = (() => { try { return R('UI_MOdified/client/maneuver-arrow.js'); } catch (e) { return ''; } })();
const animSrc = (() => { try { return R('UI_MOdified/client/arrow-animation.js'); } catch (e) { return ''; } })();

const steps = wg3.steps || [];
const stepHasAll = (k) => steps.length > 0 && steps.every(s => s[k] !== undefined);

console.log('═══ P0B Animation & Presentation Readiness — fact check ═══\n');

console.log('── DATA available in scenario (Wargame 3) ──');
const dataInv = {
  'unit initial positions (red/blue *_units)': Array.isArray(wg3.red_units) && Array.isArray(wg3.blue_units_initial),
  'per-step movement coords (*_unit_step_coords)': !!(wg3.red_unit_step_coords && wg3.blue_unit_step_coords),
  'movement TRAIL coords (*_unit_step_prev)': !!(wg3.red_unit_step_prev && wg3.blue_unit_step_prev),
  'engagement_arcs (attack lines w/ coordinates+damage)': stepHasAll('engagement_arcs'),
  'affected units (status_change + damage_pct)': stepHasAll('affected'),
  'actors (action_what/why/intent)': stepHasAll('actors'),
  'objective status timeline (objective_status_baseline)': stepHasAll('objective_status_baseline'),
  'BLS status timeline (bls_status_baseline)': stepHasAll('bls_status_baseline'),
  'force ratio / red strength / attrition timelines': stepHasAll('force_ratio_baseline') && stepHasAll('red_strength_baseline') && stepHasAll('red_degraded_baseline'),
  'destroyed/degraded counts (blue_destroyed/red_degraded)': stepHasAll('blue_destroyed_baseline') && stepHasAll('red_degraded_baseline'),
  'EW effect (contact/detection proxy)': stepHasAll('ew_effect_baseline'),
  'explicit detection/contact model': false,
  'phase / time fields (phase, time_label, kind_native)': stepHasAll('phase') && stepHasAll('time_label'),
  'per-step narrative (ar/en)': stepHasAll('narrative_en_fallback'),
  'objective / BLS / pipeline / AO geometry': !!(wg3.obj && wg3.bls_template && wg3.pipeline && wg3.ao_boundaries),
};
Object.keys(dataInv).forEach(k => console.log('  ' + (dataInv[k] ? '✓ DATA' : '· none') + '  ' + k));

console.log('\n── RENDER primitives available (code) ──');
const render = {
  'polyline drawing (L.polyline)': has(mapSrc, /L\.polyline/),
  'unit state visuals DEGRADED/DESTROYED/DISPLACED (applyState)': has(mapSrc, /DESTROYED/) && has(mapSrc, /DEGRADED/) && has(mapSrc, /applyState/),
  'per-step marker movement (applyStepProgress)': has(mapSrc, /applyStepProgress/),
  'objective marker + security ring': has(mapSrc, /objSecurityRing|obj.*circle|L\.circle/i),
  'APP-6 / SIDC symbols': has(mapSrc, /sidcIcon|milsymbol|ms\.Symbol|\.asSVG/i),
  'legend + SITREP banner': has(mapSrc, /addLegend|addSitrep/),
  'animated arrows (AppArrowAnim)': has(animSrc, /AppArrowAnim/),
  'maneuver arrow tool (ManeuverArrow)': has(manSrc, /ManeuverArrow/),
  'Leaflet layer control (basemap/overlay toggles)': has(R('UI_MOdified/client/app.js'), /layerControl/),
};
Object.keys(render).forEach(k => console.log('  ' + (render[k] ? '✓ HAVE' : '· none') + '  ' + k));

console.log('\n── WIRING: is the rich per-step data rendered? (verified by reading code, not just keyword) ──');
const wired = {
  // CONFIRMED by reading renderEngagementArcs() ~L2795: animated dashed LineStrings,
  // color by status_change, weight by damage_pct, declutter + fade. Real.
  'engagement_arcs drawn (animated dashed, color=status, weight=damage)': has(mapSrc, /renderEngagementArcs/) && has(mapSrc, /stepRow\.engagement_arcs/),
  // CONFIRMED by reading outcomeAccent()/salient ~L1867: salient dims/dashes/retracts
  // by objective_status; red advance arrow tracks main unit's current position. Real.
  'objective-status salient + tracking red advance arrow': has(mapSrc, /outcomeAccent/) && has(mapSrc, /reachFactor/),
  // FALSE POSITIVE in keyword search: *_step_prev is the move-animation START point
  // (interpolate prev→curr), NOT a persistent breadcrumb. No trail polyline is drawn.
  'persistent movement TRAILS / breadcrumbs': has(mapSrc, /drawTrail|breadcrumb|trailPolyline|_trailLayer|movementTrail/),
  // affected[].damage_pct / status_change does NOT drive per-unit marker icon swap
  // during step playback (applyState exists, but playback path doesn’t feed it affected).
  'per-step affected/damage drives INDIVIDUAL unit DEGRADED/DESTROYED icon swap in playback': has(mapSrc, /affected.*setIcon|degradeMarker|markDestroyed/i),
  'persistent clickable EVENT markers on map (where a loss/strike happened)': has(mapSrc, /eventMarker|lossMarker|strikeMarker/i),
  'phase annotation banner drawn ON the map canvas': has(mapSrc, /phaseAnnotation|phaseBanner|mapPhaseLabel/i),
  'timeline event highlights (event ticks on the scrubber)': has(wsSrc, /eventTick|timelineEventHighlight|event.?marker.*timeline/i),
  'before/after step comparison (A/B diff view)': has(wsSrc, /beforeAfter|stepDiff|abCompare/i),
};
Object.keys(wired).forEach(k => console.log('  ' + (wired[k] ? '✓ WIRED' : '✗ NOT wired') + '  ' + k));

console.log('\n── COVERAGE CAVEAT (critical for "any imported scenario") ──');
const w3only = has(mapSrc, /schema_variant\s*!==\s*'w3-rich'|schema_variant\s*===\s*'w3-rich'/);
console.log('  ' + (w3only ? '⚠ ' : '  ') + 'Rich animation (arcs + salient) is GATED on schema_variant==="w3-rich": ' + (w3only ? 'YES' : 'no'));
console.log('    → Wargame 3 is w3-rich (gets full animation). Converted Decision Packages / CSP51');
console.log('      that are NOT w3-rich get markers + movement only — no arcs, no salient.');
console.log('    → User goal "any imported scenario shows CMO-style animation" is NOT yet met for non-W3.');

console.log('\n── CLASSIFICATION summary (verified) ──');
const rows = [
  ['attack/counterattack arcs',   wired['engagement_arcs drawn (animated dashed, color=status, weight=damage)'] ? 'DONE (w3-rich only) — refine: add directional arrowheads' : 'RENDER missing'],
  ['red advance + objective salient', wired['objective-status salient + tracking red advance arrow'] ? 'DONE (w3-rich only)' : 'RENDER missing'],
  ['unit movement (markers step)', render['per-step marker movement (applyStepProgress)'] ? 'DONE' : 'RENDER missing'],
  ['movement trails / breadcrumbs', wired['persistent movement TRAILS / breadcrumbs'] ? 'DONE' : 'RENDER missing (data *_step_prev + L.polyline exist; not drawn)'],
  ['per-unit damage/degraded/destroyed', wired['per-step affected/damage drives INDIVIDUAL unit DEGRADED/DESTROYED icon swap in playback'] ? 'DONE' : 'WIRING missing (data affected[] + UNIT_STATUS/applyState exist; playback doesn’t feed affected to icons)'],
  ['event markers on map',        wired['persistent clickable EVENT markers on map (where a loss/strike happened)'] ? 'DONE' : 'RENDER missing (data + SIDC markers exist)'],
  ['phase annotation on map',     wired['phase annotation banner drawn ON the map canvas'] ? 'DONE' : 'RENDER missing (timeline/SITREP show phase; map canvas does not)'],
  ['timeline event highlights',   wired['timeline event highlights (event ticks on the scrubber)'] ? 'DONE' : 'UI missing'],
  ['before/after step compare',   wired['before/after step comparison (A/B diff view)'] ? 'DONE' : 'UI missing'],
  ['detection/contact state',     dataInv['explicit detection/contact model'] ? 'DATA present' : 'DATA + MODEL missing (only EW proxy) — simulation territory, out of scope'],
  ['non-W3 scenario animation',   w3only ? 'GAP — rich animation is W3-only; non-W3 imports get markers/movement only' : 'n/a'],
];
rows.forEach(r => console.log('  ' + r[0].padEnd(34) + ': ' + r[1]));

console.log('\nNote: audit inventory, not a pass/fail gate. See docs/scenario-animation-presentation-readiness-audit.md.');
