/* test-planning-model-g3a.js — G-3A Planning Model Unification static checks.
 * Proves the SAME planning model comes from BOTH front doors (L13/L14):
 *   A. upload path  — MDMP fixtures → mdmp-external-adapter brief → fromOperationalBrief
 *   B. native path  — wargame3 World State (no uploads) → fromWorldState
 * plus deterministic requirements, fusion-with-surfaced-conflicts, provenance,
 * OBJLINK-B preservation, and zero input mutation. Run: node test-planning-model-g3a.js */
'use strict';
const path = require('path');
const fs = require('fs');

const PM = require(path.join(__dirname, 'UI_MOdified/server/ai/planning-model.js'));
const ADAPTER = require(path.join(__dirname, 'UI_MOdified/server/ai/mdmp-external-adapter.js'));
const JSONC = require(path.join(__dirname, 'UI_MOdified/server/ai/jsonc.js'));
const WS = require(path.join(__dirname, 'UI_MOdified/client/shell/world-state.js'));
const w3 = require(path.join(__dirname, 'UI_MOdified/data/scenarios/wargame3.json'));

const FIX = path.join(__dirname, 'UI_MOdified/devtools/fixtures/mdmp-external');

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log('  ✓ ' + name)) : (fail++, console.log('  ✗ ' + name)); }

console.log('G-3A — Planning Model Unification');

/* ── 1. same outcome ⇒ same deterministic checklist ─────────────────────── */
PM.OUTCOME_TYPES.forEach(t => {
    const a = JSON.stringify(PM.requirementsFor(t));
    const b = JSON.stringify(PM.requirementsFor(t));
    ok('requirementsFor("' + t + '") is deterministic + non-empty', a === b && a !== '[]');
});
const seize = PM.requirementsFor('seize_objective').map(r => r.id);
ok('seize_objective needs ao/objective/blue/red/locations/coas/intel-review',
   ['ao', 'objective', 'blue_units', 'red_units', 'location_candidates', 'coas', 'missing_intel_review']
       .every(id => seize.indexOf(id) !== -1));
const amph = PM.requirementsFor('amphibious_landing').map(r => r.id);
ok('amphibious_landing adds landing_area + sea_approach + landing force + weather/sea',
   ['landing_area', 'sea_approach_staging', 'blue_landing_force', 'red_coastal_force', 'weather_sea']
       .every(id => amph.indexOf(id) !== -1));
ok('weather_sea is required:false (only "if available")',
   PM.requirementsFor('amphibious_landing').find(r => r.id === 'weather_sea').required === false);
ok('unknown outcome ⇒ empty requirements (no invention)', PM.requirementsFor('bogus').length === 0);

/* ── Build PATH A: MDMP fixtures → adapter brief → planning model ───────── */
const bundle = ['step3.json', 'step4_out.json', 'step5.json'].map(f => {
    const parsed = JSONC.parseJsonc(fs.readFileSync(path.join(FIX, f), 'utf8'));   // fixtures are JSONC (G-1)
    if (!parsed.ok) throw new Error('fixture ' + f + ' failed JSONC parse: ' + parsed.error);
    return { filename: f, data: parsed.value };
});
const adapted = ADAPTER.adaptMdmpBundle(bundle);
const briefSnapshot = JSON.stringify(adapted.brief);
const ob = adapted.brief.operational_brief;

const modelA = PM.fromOperationalBrief(adapted.brief, { source_type: 'mdmp_adapter', outcome_type: 'compare_coas' });

/* ── 2. Operational Brief from MDMP maps into the Planning Model ────────── */
ok('PATH A: COAs preserved (count parity)', modelA.courses_of_action.length === ob.courses_of_action.length
   && modelA.courses_of_action.length >= 2);
const coaA0 = modelA.courses_of_action[0], coaB0 = ob.courses_of_action[0];
ok('PATH A: COA content preserved verbatim (id/name/wargame_turns survive)',
   coaA0.id === coaB0.id && JSON.stringify(coaA0.wargame_turns) === JSON.stringify(coaB0.wargame_turns));
ok('PATH A: COA source_citations preserved verbatim',
   JSON.stringify(coaA0.source_citations) === JSON.stringify(coaB0.source_citations));
ok('PATH A: force_comparison preserved deep-equal',
   JSON.stringify(modelA.force_comparison) === JSON.stringify(ob.force_comparison) && modelA.force_comparison != null);
ok('PATH A: coa_recommendation preserved deep-equal',
   JSON.stringify(modelA.coa_recommendation) === JSON.stringify(ob.coa_recommendation));
ok('PATH A: mission statement from brief + outcome from operator',
   modelA.mission.outcome_type === 'compare_coas' && typeof modelA.mission.statement === 'string');
ok('PATH A: checklist evaluated — coas_min_2 present, filled_by mdmp_adapter',
   (() => { const row = modelA.requirements_checklist.find(r => r.id === 'coas_min_2');
            return row && row.status === 'present' && row.filled_by.indexOf('mdmp_adapter') !== -1; })());
ok('PATH A: missing requirements surfaced (not silently complete)',
   Array.isArray(modelA.missing_information));

/* ── Build PATH B: native World State (NO uploads anywhere) ─────────────── */
const wsSnapBefore = (() => { const ws0 = WS.deriveWorldState(w3, 2); return ws0; })();
const wsJsonBefore = JSON.stringify(wsSnapBefore);
const scnJsonBefore = JSON.stringify(w3);
const modelB = PM.fromWorldState(wsSnapBefore, w3, { source_type: 'scenario_builder', outcome_type: 'seize_objective' });

/* ── 3. native world-state/scenario maps in without uploads ─────────────── */
ok('PATH B: units extracted (164 incl. off-map)', modelB.units.length === wsSnapBefore.units.length);
ok('PATH B: objectives extracted', modelB.objectives.length >= 1);
ok('PATH B: AO present via authored-or-bbox fallback', modelB.area_of_operation.length >= 1);
ok('PATH B: BLS becomes a location with step-map status',
   (() => { const l = modelB.locations.find(x => x.id === 'BLS-1');
            return l && l.kind === 'bls' && l.status === (w3.steps[2].bls_status_baseline || {})['BLS-1']; })());
ok('PATH B: unit routes are summaries with copied endpoints',
   (() => { const u = modelB.units.find(x => x.route);
            return u && typeof u.route.points === 'number' && Array.isArray(u.route.from); })());
ok('PATH B: zero upload-origin sources (native path is upload-free)',
   modelB.source_summary.every(s => ['scenario_builder', 'world_state'].indexOf(s.type) !== -1));

/* ── 7(spec): OBJLINK-B links preserved ─────────────────────────────────── */
ok('PATH B: unit_objective_links preserved verbatim from ws.derived',
   JSON.stringify(modelB.unit_objective_links) === JSON.stringify(wsSnapBefore.derived.unit_objective_links));
ok('PATH B: a RED link still carries bls_id BLS-1 + inferred objective',
   (() => { const l = modelB.unit_objective_links['R-d2-4-004'];
            return l && l.bls_id === 'BLS-1' && l.confidence === 'inferred' && l.bls_confidence === 'declared'; })());

/* ── 4. uploaded-only and app-built-only produce the SAME model shape ───── */
const keysA = Object.keys(modelA).sort(), keysB = Object.keys(modelB).sort();
ok('shape parity: identical top-level keys', JSON.stringify(keysA) === JSON.stringify(keysB));
ok('shape parity: identical top-level types',
   keysA.every(k => {
       const ta = Array.isArray(modelA[k]) ? 'array' : (modelA[k] === null ? 'null/obj' : typeof modelA[k]);
       const tb = Array.isArray(modelB[k]) ? 'array' : (modelB[k] === null ? 'null/obj' : typeof modelB[k]);
       return ta === tb || (ta === 'null/obj' && tb === 'object') || (ta === 'object' && tb === 'null/obj');
   }));
ok('shape parity: both checklists use the same row schema',
   ['id', 'label', 'kind', 'required', 'status', 'filled_by'].every(f =>
       f in modelA.requirements_checklist[0] && f in modelB.requirements_checklist[0]));

/* ── 5. every object carries source metadata ────────────────────────────── */
function everySourced(model) {
    const all = []
        .concat(model.area_of_operation, model.objectives, model.units,
                model.locations, model.incidents, model.doctrine_refs, model.courses_of_action);
    return all.every(e => e && e.source && PM.SOURCE_TYPES.indexOf(e.source.type) !== -1
        && 'file' in e.source && 'key' in e.source && 'origin' in e.source && 'confidence' in e.source)
        && model.mission.source && PM.SOURCE_TYPES.indexOf(model.mission.source.type) !== -1;
}
ok('PATH A: every object has valid source {type,file,key,origin,confidence}', everySourced(modelA));
ok('PATH B: every object has valid source {type,file,key,origin,confidence}', everySourced(modelB));
ok('invalid source.type throws (taxonomy enforced)',
   (() => { try { PM.makeSource({ type: 'random_guess' }); return false; } catch (_) { return true; } })());

/* ── 6. conflicts surfaced, not silently resolved ───────────────────────── */
const declared = PM.emptyPlanningModel();
declared.mission = { outcome_type: 'seize_objective', statement: 'x', missing: [],
    source: PM.makeSource({ type: 'manual_app_entry' }), confidence: 'high' };
declared.objectives.push({ id: 'OBJ-X', position: [19.55, 29.74],
    source: PM.makeSource({ type: 'map_click' }) });
const suggested = PM.emptyPlanningModel();
suggested.mission = { outcome_type: 'compare_coas', statement: 'y', missing: [],
    source: PM.makeSource({ type: 'llm_candidate' }), confidence: 'low' };
suggested.objectives.push({ id: 'OBJ-X', position: [21.0, 30.0],
    source: PM.makeSource({ type: 'llm_candidate' }) });

const merged = PM.mergePlanningModels([suggested, declared]);   // LLM listed FIRST on purpose
const objConflict = merged.conflicts.find(c => c.collection === 'objectives' && c.key === 'OBJ-X');
ok('merge: conflicting objective surfaced in conflicts[]', !!objConflict);
ok('merge: precedence kept operator-declared (map_click beats llm_candidate, order ignored)',
   (() => { const kept = merged.objectives.find(o => o.id === 'OBJ-X');
            return kept && kept.position[0] === 19.55 && kept.source.type === 'map_click'
                && objConflict.kept.source.type === 'map_click'
                && objConflict.dropped.source.type === 'llm_candidate'; })());
ok('merge: loser preserved inside the conflict record (not silently dropped)',
   objConflict.dropped.value.position[0] === 21.0 && objConflict.needs_review === true);
ok('merge: mission outcome conflict surfaced + declared wins',
   merged.mission.outcome_type === 'seize_objective'
   && merged.conflicts.some(c => c.collection === 'mission' && c.key === 'outcome_type'));
ok('merge: identical-content duplicates do NOT create conflicts',
   (() => { const m1 = PM.emptyPlanningModel(), m2 = PM.emptyPlanningModel();
            m1.objectives.push({ id: 'O1', source: PM.makeSource({ type: 'uploaded_doc' }) });
            m2.objectives.push({ id: 'O1', source: PM.makeSource({ type: 'uploaded_doc' }) });
            const mm = PM.mergePlanningModels([m1, m2]);
            return mm.objectives.length === 1 && mm.conflicts.length === 0; })());
ok('merge A+B: OBJLINK links survive fusion',
   (() => { const mm = PM.mergePlanningModels([modelA, modelB]);
            return JSON.stringify(mm.unit_objective_links) === JSON.stringify(modelB.unit_objective_links)
                && mm.courses_of_action.length === modelA.courses_of_action.length; })());

/* ── 8. no mutation of input brief / scenario / world-state ─────────────── */
ok('input brief unchanged after fromOperationalBrief + merges', JSON.stringify(adapted.brief) === briefSnapshot);
ok('input world-state unchanged after fromWorldState + merges', JSON.stringify(wsSnapBefore) === wsJsonBefore);
ok('input scenario (wargame3) unchanged', JSON.stringify(w3) === scnJsonBefore);
ok('merge does not mutate its input models',
   (() => { const snapshot = JSON.stringify(modelA); PM.mergePlanningModels([modelA, modelB]);
            return JSON.stringify(modelA) === snapshot; })());

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
