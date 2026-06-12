/* test-location-intelligence-g3b.js — G-3B Location Intelligence Resolver.
 * Deterministic, offline (no network/LLM). Proves coordinate detection, alias
 * resolution (Bandar Abbas / Chabahar variants incl. Arabic), the two-base
 * naval-brigade sentence, base-anchor vs exact-position, unknown→missing_info,
 * incident damaged/destroyed warnings, AO inside/outside, source priority
 * (explicit coords > gazetteer), and no-mutation enrichment.
 * Run: node test-location-intelligence-g3b.js */
'use strict';
const path = require('path');
const LI = require(path.join(__dirname, 'UI_MOdified/server/ai/location-intelligence.js'));
const PM = require(path.join(__dirname, 'UI_MOdified/server/ai/planning-model.js'));

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log('  ✓ ' + name)) : (fail++, console.log('  ✗ ' + name)); }

console.log('G-3B — Location Intelligence Resolver');

/* ── 1. coordinate format detection ─────────────────────────────────────── */
const dec = LI.detectCoordinate('27.15, 56.2167');
ok('decimal pair detected', dec && dec.format === 'decimal' && dec.lat === 27.15 && dec.lon === 56.2167);
const decN = LI.detectCoordinate('29.74 N 19.55 E');
ok('decimal with N/E hemisphere detected (lat/lon by hemisphere)',
   decN && decN.format === 'decimal' && decN.lat === 29.74 && decN.lon === 19.55);
const dms = LI.detectCoordinate("27°09'00\"N 56°13'00\"E");
ok('simple DMS detected + converted', dms && dms.format === 'dms' && Math.abs(dms.lat - 27.15) < 0.01 && Math.abs(dms.lon - 56.2167) < 0.01);
const mg = LI.detectCoordinate('grid 38SMB4612345678');
ok('MGRS-like flagged as mgrs_candidate, NOT converted', mg && mg.format === 'mgrs_candidate' && mg.lat === null && mg.warnings.indexOf('mgrs_not_converted') !== -1);
ok('plain place text → no coordinate', LI.detectCoordinate('قاعدة بندر عباس') === null);

/* ── 2. named resolution via aliases (incl. Arabic) ─────────────────────── */
ok('Bandar Abbas (EN) resolves to base id', LI.resolveGazetteer(LI.normalize('Bandar Abbas'))[0].location_id === 'IR-NAVBASE-BANDAR-ABBAS');
ok('بندر عباس (AR) resolves to same id', LI.resolveGazetteer(LI.normalize('بندر عباس'))[0].location_id === 'IR-NAVBASE-BANDAR-ABBAS');
ok('قاعدة بندر عباس resolves (place-noun + name)', LI.resolveGazetteer(LI.normalize('قاعدة بندر عباس'))[0].location_id === 'IR-NAVBASE-BANDAR-ABBAS');
ok('Chabahar resolves', LI.resolveGazetteer(LI.normalize('Chabahar'))[0].location_id === 'IR-NAVBASE-CHABAHAR');
ok('Shah Bahar (variant) resolves to Chabahar', LI.resolveGazetteer(LI.normalize('Shah Bahar'))[0].location_id === 'IR-NAVBASE-CHABAHAR');
ok('شاه بهار (AR) resolves to Chabahar', LI.resolveGazetteer(LI.normalize('شاه بهار'))[0].location_id === 'IR-NAVBASE-CHABAHAR');
ok('تشابهار (AR variant) resolves to Chabahar', LI.resolveGazetteer(LI.normalize('تشابهار'))[0].location_id === 'IR-NAVBASE-CHABAHAR');

/* ── 3+5. Arabic sentence: naval brigade at TWO bases ───────────────────── */
const sentence = 'لواء بحري في قاعدة بندر عباس وقاعدة شاه بهار';
const mentions = LI.extractPlaceMentions(sentence);
const mLocs = mentions.map(m => m.location_id).filter(Boolean);
ok('sentence yields exactly two known-base mentions',
   mLocs.indexOf('IR-NAVBASE-BANDAR-ABBAS') !== -1 && mLocs.indexOf('IR-NAVBASE-CHABAHAR') !== -1 && mLocs.length === 2);
const candBandar  = LI.resolveMention('قاعدة بندر عباس')[0];
const candChabahar = LI.resolveMention('قاعدة شاه بهار')[0];
ok('Bandar candidate is a known_base anchor, NOT exact unit position',
   candBandar.placement_type === 'known_base' && candBandar.exact_unit_position === false);
ok('Chabahar candidate is a known_base anchor', candChabahar.placement_type === 'known_base' && candChabahar.location_id === 'IR-NAVBASE-CHABAHAR');
ok('base candidate carries needs_review + base-known warning',
   candBandar.needs_review === true && candBandar.warnings.indexOf('base_known_exact_unit_position_unknown') !== -1);
ok('base candidate has real coordinates from gazetteer', candBandar.lat === 27.15 && candBandar.lon === 56.2167);

/* ── unknown named place → unresolved + missing_information ──────────────── */
const unkCands = LI.resolveMention('قاعدة المجهول');
ok('unknown place → single unresolved candidate', unkCands.length === 1 && unkCands[0].placement_type === 'unknown_named'
   && unkCands[0].location_id === null && unkCands[0].warnings.indexOf('unknown_location') !== -1);

/* ── 6. incident history attaches damaged/destroyed warning ─────────────── */
const incidents = LI.parseIncidents([
    { location: 'قاعدة بندر عباس', location_id: 'IR-NAVBASE-BANDAR-ABBAS', text: 'دُمّر رصيف الصواريخ', date: '2026-06-02', confidence: 'medium' },
    { location: 'Chabahar', location_id: 'IR-NAVBASE-CHABAHAR', text: 'facility damaged in strike', date: '2026-06-05' },
]);
ok('incident parsed: destroyed classified from Arabic text', incidents[0].event_type === 'destroyed_reported' && incidents[0].date === '2026-06-02');
ok('incident parsed: damaged classified from English text', incidents[1].event_type === 'damaged_reported');
ok('incident carries source citation (incident_log)', incidents[0].source && incidents[0].source.type === 'incident_log');
const bandarWithInc = LI.resolveMention('قاعدة بندر عباس', { incidents: incidents })[0];
ok('candidate matched to incident → incident_status attached + destroyed warning',
   bandarWithInc.incident_status && bandarWithInc.incident_status.event_type === 'destroyed_reported'
   && bandarWithInc.warnings.indexOf('incident_destroyed') !== -1);
const chabaharWithInc = LI.resolveMention('Chabahar', { incidents: incidents })[0];
ok('damaged incident → incident_damaged warning', chabaharWithInc.warnings.indexOf('incident_damaged') !== -1);

/* ── 7. AO validation inside/outside ────────────────────────────────────── */
const aoBbox = [55, 26, 57, 28];                                   // [minLon,minLat,maxLon,maxLat] around Bandar Abbas
ok('AO bbox: Bandar Abbas inside', LI.aoCheck(27.15, 56.2167, aoBbox) === 'inside');
ok('AO bbox: Chabahar outside → outside_warn', LI.aoCheck(25.29, 60.62, aoBbox) === 'outside_warn');
ok('AO unknown when no polygon', LI.aoCheck(27.15, 56.2167, null) === 'unknown');
ok('AO unknown when no coordinate (named-only candidate)', LI.aoCheck(null, null, aoBbox) === 'unknown');
const inAoCand = LI.resolveMention('Bandar Abbas', { ao: aoBbox })[0];
ok('resolved candidate carries ao_check inside (no outside warning)', inAoCand.ao_check === 'inside' && inAoCand.warnings.indexOf('outside_ao') === -1);
const outAoCand = LI.resolveMention('Chabahar', { ao: aoBbox })[0];
ok('out-of-AO candidate warns but is NOT blocked (still a candidate)', outAoCand.ao_check === 'outside_warn' && outAoCand.warnings.indexOf('outside_ao') !== -1 && !!outAoCand.id);

/* ── source priority: explicit coordinates > gazetteer ──────────────────── */
const both = LI.resolveMention('Bandar Abbas 25.00, 61.00')[0];     // name says one place, coords say another
ok('explicit coords win over gazetteer name', both.lat === 25.00 && both.lon === 61.00
   && both.placement_type === 'exact_unit_position' && both.coordinate_format === 'decimal');
ok('explicit-coord evidence shows coordinate rung hit first', both.evidence[0].method === 'explicit_coordinate' && both.evidence[0].hit === true);

/* ── every candidate has source / evidence / confidence / needs_review ──── */
const allCands = [candBandar, candChabahar, unkCands[0], bandarWithInc, inAoCand, outAoCand, both];
ok('every candidate has valid source {type,...}', allCands.every(c => c.source && PM.SOURCE_TYPES.indexOf(c.source.type) !== -1 && 'confidence' in c.source));
ok('every candidate has evidence[] (ladder rungs)', allCands.every(c => Array.isArray(c.evidence) && c.evidence.length >= 1));
ok('every candidate has confidence + needs_review:true', allCands.every(c => typeof c.confidence === 'string' && c.needs_review === true));
ok('candidate ids deterministic (same mention → same id)', LI.resolveMention('Bandar Abbas')[0].id === LI.resolveMention('Bandar Abbas')[0].id);

/* ── 8. enrichPlanningModelLocations — integration + no mutation ────────── */
const baseModel = PM.emptyPlanningModel();
baseModel.mission = { outcome_type: 'seize_objective', statement: 'x', missing: [], source: PM.makeSource({ type: 'manual_app_entry' }), confidence: 'high' };
baseModel.objectives.push({ id: 'OBJ-Y', name: 'قاعدة المجهول', source: PM.makeSource({ type: 'manual_app_entry' }) });  // unresolved, no coord
const modelSnapshot = JSON.stringify(baseModel);

const enriched = LI.enrichPlanningModelLocations(baseModel, {
    mentions: [{ text: sentence, source: PM.makeSource({ type: 'manual_app_entry' }) }],
    ao: aoBbox, incidents: incidents,
});
ok('enrich does NOT mutate the input model', JSON.stringify(baseModel) === modelSnapshot);
ok('enrich produced placement_candidates', Array.isArray(enriched.placement_candidates) && enriched.placement_candidates.length >= 2);
ok('enrich: two-base sentence → Bandar + Chabahar candidates present',
   ['IR-NAVBASE-BANDAR-ABBAS', 'IR-NAVBASE-CHABAHAR'].every(id => enriched.placement_candidates.some(c => c.location_id === id)));
ok('enrich: unresolved objective name → missing_information entry',
   enriched.missing_information.some(s => s.indexOf('unresolved_location') === 0));
ok('enrich: candidates preserve source metadata + needs_review',
   enriched.placement_candidates.every(c => c.source && c.needs_review === true && Array.isArray(c.evidence)));
ok('enrich: incident warning carried into the model candidate',
   enriched.placement_candidates.some(c => c.location_id === 'IR-NAVBASE-BANDAR-ABBAS' && c.warnings.indexOf('incident_destroyed') !== -1));

/* ── ambiguity → conflict (same mention, >1 distinct location) ──────────── */
// inject a temporary ambiguous alias scenario via a mention matching two ids:
const ambModel = PM.emptyPlanningModel();
const ambEnriched = LI.enrichPlanningModelLocations(ambModel, { mentions: ['بندر عباس شاه بهار'] }); // one phrase, both aliases inside
const ambConflict = ambEnriched.conflicts.find(c => c.collection === 'placement_candidates');
// extractPlaceMentions splits this into two known mentions (not ambiguous) → assert no false conflict, two candidates
ok('co-located aliases split into distinct candidates (no false ambiguity conflict)',
   ambEnriched.placement_candidates.length >= 2 && !ambConflict);

/* ── no internet / no LLM required (sanity: module has no net/LLM imports) ─ */
const src = require('fs').readFileSync(path.join(__dirname, 'UI_MOdified/server/ai/location-intelligence.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');     // strip comments — test real CALLS, not prose
ok('module makes no network/LLM/wall-clock calls (Date.parse on caller dates is OK)',
   !/require\(['"]https?:|fetch\s*\(|http\.request|Date\.now\s*\(|require\(['"][^'"]*(ollama|anthropic|zen-client|claude-client)/i.test(src));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
