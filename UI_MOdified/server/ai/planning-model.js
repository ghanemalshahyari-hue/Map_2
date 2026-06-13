/* ============================================================================
 * planning-model.js — DOC-UNDERSTANDING-1 / G-3A: Planning Model Unification
 * ----------------------------------------------------------------------------
 * ONE deterministic planning model, produced from EITHER front door (L13/L14,
 * docs/coa-wargame-design.md §0.5–§0.6):
 *   A. uploaded/imported sources  → fromOperationalBrief(brief)
 *   B. native in-app sources      → fromWorldState(ws, scenario)
 * plus mergePlanningModels(models[]) — fusion with surfaced conflicts (L15).
 *
 * Rules enforced here:
 *   - Every object carries source: { type, file, key, origin, confidence }
 *     with type from the global SOURCE_TYPES taxonomy.
 *   - Deterministic: same input ⇒ same output. No Date.now, no RNG, no IO.
 *   - Pure: inputs are deep-cloned; converters/merge NEVER mutate arguments.
 *   - Fusion precedence (L15): operator-declared > reviewed > derived >
 *     AI-suggested. Conflicts are SURFACED in conflicts[] — the higher-
 *     precedence value is kept as the working value, the loser is preserved
 *     inside the conflict record, needs_review:true. Never silently resolved.
 *   - requirements checklist is a fixed, data-driven needs-matrix per
 *     outcome_type (§0.6.2) — the same outcome always yields the same items.
 *
 * NOT here (later slots): UI (G-3B review panel), tasking (G-4), timeline
 * (G-5), generation changes. This module only models and fuses.
 * ========================================================================== */
'use strict';

/* ── Taxonomies ─────────────────────────────────────────────────────────── */

const OUTCOME_TYPES = Object.freeze([
    'seize_objective',
    'amphibious_landing',
    'protect_base',
    'prevent_enemy_advance',
    'evaluate_enemy_reaction',
    'compare_coas',
    'generic_training',
]);

const SOURCE_TYPES = Object.freeze([
    'uploaded_doc',
    'external_json',
    'mdmp_adapter',
    'manual_app_entry',
    'map_click',
    'location_db',
    'incident_log',
    'llm_candidate',
    'doctrine_rule',
    'world_state',
    'scenario_builder',
    // GIS-TERRAIN-1 (T-2, design §5): terrain becomes a first-class source.
    'terrain_layer',     // direct reading of curated terrain data (elevation at a point)
    'gis_analysis',      // computed product (slope class, profile, LOS, LZ score)
]);

// L15 precedence: operator-declared(4) > reviewed(3) > derived(2) > AI(1).
// terrain_layer ranks with curated data (location_db); gis_analysis is a
// derived computation and ranks with world_state — so operator declarations
// override terrain, and terrain overrides AI guesses, with no new logic.
const TRUST_RANK = Object.freeze({
    manual_app_entry: 4, map_click: 4, scenario_builder: 4,
    uploaded_doc: 3, external_json: 3, mdmp_adapter: 3, location_db: 3, doctrine_rule: 3,
    terrain_layer: 3,
    world_state: 2, incident_log: 2, gis_analysis: 2,
    llm_candidate: 1,
});

const DEFAULT_CONFIDENCE = Object.freeze({ 4: 'high', 3: 'medium', 2: 'medium', 1: 'low' });

function trustOf(sourceType) { return TRUST_RANK[sourceType] || 1; }

/* ── Helpers (pure) ─────────────────────────────────────────────────────── */

function clone(o) { return o === undefined ? undefined : JSON.parse(JSON.stringify(o)); }
function arr(v) { return Array.isArray(v) ? v : []; }
function obj(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }
function str(v) { return (typeof v === 'string') ? v : ''; }
function upper(v) { return String(v == null ? '' : v).toUpperCase(); }

/** Validated source descriptor. Unknown type throws — a programmer error,
 *  never a data condition (callers pick the type, data never does). */
function makeSource(input) {
    const s = obj(input);
    if (SOURCE_TYPES.indexOf(s.type) === -1) {
        throw new Error('planning-model.makeSource: invalid source.type "' + s.type +
            '" (allowed: ' + SOURCE_TYPES.join(', ') + ')');
    }
    return {
        type: s.type,
        file: s.file != null ? String(s.file) : null,
        key: s.key != null ? String(s.key) : null,
        origin: s.origin != null ? String(s.origin) : null,
        confidence: s.confidence != null ? String(s.confidence) : DEFAULT_CONFIDENCE[trustOf(s.type)],
    };
}

/** Clone an entry and attach a source ONLY if it does not already carry one
 *  (existing provenance — e.g. adapter citations — is never overwritten). */
function withSource(entry, src) {
    const e = (entry && typeof entry === 'object') ? clone(entry) : { value: entry };
    if (!e.source || typeof e.source !== 'object' || SOURCE_TYPES.indexOf(e.source.type) === -1) {
        e.source = makeSource(src);
    }
    return e;
}

/* ── GIS-TERRAIN-1 (T-2): terrain collections ───────────────────────────── */
/** Append a terrain layer record (registry entry: dem/hillshade/roads/…) to
 *  model.terrain_layers. The input is cloned (never mutated); an existing
 *  valid source on the entry is preserved, otherwise srcInput (default
 *  terrain_layer) is stamped. Returns the stored entry. */
function attachTerrainLayer(model, layer, srcInput) {
    const m = obj(model);
    if (!Array.isArray(m.terrain_layers)) m.terrain_layers = [];   // pre-T-2 models
    const entry = withSource(layer, Object.assign({ type: 'terrain_layer' }, obj(srcInput)));
    m.terrain_layers.push(entry);
    return entry;
}

/** Append a terrain analysis product (profile/slope/LZ/LOS result) to
 *  model.terrain_analysis. Same clone/source rules; analyses are derived
 *  computations, so the default source type is gis_analysis and
 *  needs_review defaults to true (L6 — never presented as operator truth). */
function attachTerrainAnalysis(model, analysis, srcInput) {
    const m = obj(model);
    if (!Array.isArray(m.terrain_analysis)) m.terrain_analysis = [];
    const entry = withSource(analysis, Object.assign({ type: 'gis_analysis' }, obj(srcInput)));
    if (entry.needs_review !== false) entry.needs_review = true;
    m.terrain_analysis.push(entry);
    return entry;
}

/* ── Empty model (the one shape, both paths) ────────────────────────────── */

function emptyPlanningModel() {
    return {
        mission: {
            outcome_type: null,
            statement: '',
            source: null,
            confidence: null,
            missing: [],
        },
        area_of_operation: [],
        objectives: [],
        units: [],
        locations: [],
        incidents: [],
        doctrine_refs: [],
        // GIS-TERRAIN-1 (T-2): terrain registry + analysis products. Always
        // present (empty arrays) — absent terrain must never break a flow.
        terrain_layers: [],
        terrain_analysis: [],
        courses_of_action: [],
        force_comparison: null,
        coa_recommendation: null,           // preserved from briefs (additive key)
        unit_objective_links: {},
        requirements_checklist: [],
        conflicts: [],
        missing_information: [],
        source_summary: [],
    };
}

/* ── Requirements needs-matrix (deterministic, §0.6.2) ──────────────────── */
// kind 'data' rows are auto-evaluated against the model; kind 'process' rows
// are operator steps that stay 'pending' here (no auto-completion). required:
// false rows surface on the checklist but never join missing_information.

const REQUIREMENTS = Object.freeze({
    seize_objective: [
        { id: 'ao',                    label: 'Area of Operation',                   kind: 'data', required: true },
        { id: 'objective',             label: 'Objective',                           kind: 'data', required: true },
        { id: 'blue_units',            label: 'BLUE units',                          kind: 'data', required: true },
        { id: 'red_units',             label: 'RED units or enemy assumption',       kind: 'data', required: true },
        { id: 'location_candidates',   label: 'Location candidates',                 kind: 'data', required: true },
        { id: 'coas',                  label: 'Courses of action',                   kind: 'data', required: true },
        { id: 'missing_intel_review',  label: 'Missing intelligence review',         kind: 'process', required: true },
    ],
    amphibious_landing: [
        { id: 'ao',                    label: 'Area of Operation',                   kind: 'data', required: true },
        { id: 'objective',             label: 'Objective',                           kind: 'data', required: true },
        { id: 'landing_area',          label: 'Landing area',                        kind: 'data', required: true },
        { id: 'sea_approach_staging',  label: 'Sea approach / staging area',         kind: 'data', required: true },
        { id: 'blue_landing_force',    label: 'BLUE landing force',                  kind: 'data', required: true },
        { id: 'red_coastal_force',     label: 'RED coastal/enemy force',             kind: 'data', required: true },
        { id: 'location_candidates',   label: 'Location candidates',                 kind: 'data', required: true },
        { id: 'weather_sea',           label: 'Weather/sea constraints (if available)', kind: 'data', required: false },
        { id: 'coas',                  label: 'Courses of action',                   kind: 'data', required: true },
        { id: 'missing_intel_review',  label: 'Missing intelligence review',         kind: 'process', required: true },
    ],
    protect_base: [
        { id: 'ao',                    label: 'Area of Operation',                   kind: 'data', required: true },
        { id: 'base_location',         label: 'Base location',                       kind: 'data', required: true },
        { id: 'blue_units',            label: 'BLUE defenders',                      kind: 'data', required: true },
        { id: 'red_units',             label: 'RED threat',                          kind: 'data', required: true },
        { id: 'location_candidates',   label: 'Location candidates',                 kind: 'data', required: true },
        { id: 'incident_history',      label: 'Incident history (مجرى الحوادث)',     kind: 'data', required: false },
        { id: 'coas',                  label: 'Courses of action',                   kind: 'data', required: true },
        { id: 'missing_intel_review',  label: 'Missing intelligence review',         kind: 'process', required: true },
    ],
    prevent_enemy_advance: [
        { id: 'ao',                    label: 'Area of Operation',                   kind: 'data', required: true },
        { id: 'avenue_of_approach',    label: 'Avenue of approach (enemy route)',    kind: 'data', required: true },
        { id: 'red_units',             label: 'RED units',                           kind: 'data', required: true },
        { id: 'blue_units',            label: 'BLUE blocking units',                 kind: 'data', required: true },
        { id: 'location_candidates',   label: 'Location candidates',                 kind: 'data', required: true },
        { id: 'coas',                  label: 'Courses of action',                   kind: 'data', required: true },
        { id: 'missing_intel_review',  label: 'Missing intelligence review',         kind: 'process', required: true },
    ],
    evaluate_enemy_reaction: [
        { id: 'existing_plan',         label: 'Existing plan / taskings / links',    kind: 'data', required: true },
        { id: 'red_units',             label: 'RED units',                           kind: 'data', required: true },
        { id: 'red_posture_doctrine',  label: 'RED posture / doctrine references',   kind: 'data', required: false },
        { id: 'coas',                  label: 'Courses of action',                   kind: 'data', required: true },
        { id: 'missing_intel_review',  label: 'Missing intelligence review',         kind: 'process', required: true },
    ],
    compare_coas: [
        { id: 'coas_min_2',            label: 'At least two courses of action',      kind: 'data', required: true },
        { id: 'evaluation_criteria',   label: 'Evaluation criteria / force comparison', kind: 'data', required: true },
        { id: 'missing_intel_review',  label: 'Missing intelligence review',         kind: 'process', required: true },
    ],
    generic_training: [
        { id: 'ao',                    label: 'Area of Operation',                   kind: 'data', required: true },
        { id: 'objective',             label: 'Objective',                           kind: 'data', required: true },
        { id: 'blue_units',            label: 'BLUE units',                          kind: 'data', required: true },
        { id: 'red_units',             label: 'RED units',                           kind: 'data', required: true },
        { id: 'missing_intel_review',  label: 'Missing intelligence review',         kind: 'process', required: true },
    ],
});

/** Deterministic needs-list for an outcome (fresh clone every call). */
function requirementsFor(outcomeType) {
    if (OUTCOME_TYPES.indexOf(outcomeType) === -1) return [];
    return clone(REQUIREMENTS[outcomeType]);
}

/* ── Requirement evaluators (pure reads of the model) ───────────────────── */

function unitsOfSide(model, side) {
    return arr(model.units).filter(u => upper(u && u.side) === side);
}
function locationsOfKind(model, kinds) {
    return arr(model.locations).filter(l => l && kinds.indexOf(String(l.kind || '')) !== -1);
}

const EVALUATORS = {
    ao:                  m => arr(m.area_of_operation).length > 0,
    objective:           m => arr(m.objectives).length > 0,
    blue_units:          m => unitsOfSide(m, 'BLUE').length > 0,
    red_units:           m => unitsOfSide(m, 'RED').length > 0,
    location_candidates: m => arr(m.locations).length > 0,
    coas:                m => arr(m.courses_of_action).length > 0,
    coas_min_2:          m => arr(m.courses_of_action).length >= 2,
    landing_area:        m => locationsOfKind(m, ['landing_area']).length > 0
                              || arr(m.objectives).some(o => o && o.kind === 'landing_area'),
    sea_approach_staging: m => locationsOfKind(m, ['sea_approach', 'staging_area']).length > 0,
    blue_landing_force:  m => unitsOfSide(m, 'BLUE')
                              .some(u => ['naval', 'amphibious', 'marine'].indexOf(String(u.domain || '')) !== -1),
    red_coastal_force:   m => unitsOfSide(m, 'RED').length > 0,
    base_location:       m => locationsOfKind(m, ['base', 'naval_base', 'airbase', 'army_base']).length > 0,
    avenue_of_approach:  m => unitsOfSide(m, 'RED').some(u => u && u.route && u.route.points > 0),
    existing_plan:       m => arr(m.courses_of_action).length > 0
                              || Object.keys(obj(m.unit_objective_links)).length > 0,
    red_posture_doctrine: m => arr(m.doctrine_refs).length > 0
                              || unitsOfSide(m, 'RED').some(u => u && u.posture),
    evaluation_criteria: m => m.force_comparison != null,
    weather_sea:         m => arr(m.locations).some(l => l && l.kind === 'weather_sea_constraint'),
    incident_history:    m => arr(m.incidents).length > 0,
};

/** Sources that contributed to a satisfied requirement (for filled_by). */
function contributingSources(model, reqId) {
    const collections = {
        ao: model.area_of_operation, objective: model.objectives,
        blue_units: model.units, red_units: model.units, blue_landing_force: model.units,
        red_coastal_force: model.units, blue_blocking_units: model.units,
        avenue_of_approach: model.units,
        location_candidates: model.locations, landing_area: model.locations,
        sea_approach_staging: model.locations, base_location: model.locations,
        weather_sea: model.locations,
        coas: model.courses_of_action, coas_min_2: model.courses_of_action,
        existing_plan: model.courses_of_action,
        red_posture_doctrine: model.doctrine_refs,
        incident_history: model.incidents,
    };
    const coll = arr(collections[reqId]);
    const types = [];
    coll.forEach(e => {
        const t = e && e.source && e.source.type;
        if (t && types.indexOf(t) === -1) types.push(t);
    });
    return types.sort();
}

/** Recompute requirements_checklist + missing_information for the model's
 *  outcome. Without an outcome_type the checklist is empty and the missing
 *  list says so explicitly (honest gap, not a guess). */
function evaluateRequirements(model) {
    const out = { requirements_checklist: [], missing_information: [] };
    const outcome = model && model.mission && model.mission.outcome_type;
    if (OUTCOME_TYPES.indexOf(outcome) === -1) {
        out.missing_information.push('mission.outcome_type');
        return out;
    }
    requirementsFor(outcome).forEach(req => {
        let status;
        if (req.kind === 'process') {
            status = 'pending';                                   // operator step — never auto-done
        } else {
            const fn = EVALUATORS[req.id];
            status = (fn && fn(model)) ? 'present' : 'missing';
        }
        out.requirements_checklist.push({
            id: req.id, label: req.label, kind: req.kind, required: req.required,
            status: status,
            filled_by: status === 'present' ? contributingSources(model, req.id) : [],
        });
        if (status === 'missing' && req.required) out.missing_information.push(req.id);
    });
    return out;
}

/** Tally of source.type across every sourced object (sorted, deterministic). */
function computeSourceSummary(model) {
    const counts = {};
    const bump = t => { if (t) counts[t] = (counts[t] || 0) + 1; };
    if (model.mission && model.mission.source) bump(model.mission.source.type);
    ['area_of_operation', 'objectives', 'units', 'locations', 'incidents',
     'doctrine_refs', 'terrain_layers', 'terrain_analysis',
     'courses_of_action'].forEach(k => {
        arr(model[k]).forEach(e => bump(e && e.source && e.source.type));
    });
    return Object.keys(counts).sort().map(type => ({ type: type, count: counts[type] }));
}

/** Run the deterministic finishing pass (checklist + missing + summary). */
function finalize(model) {
    const ev = evaluateRequirements(model);
    model.requirements_checklist = ev.requirements_checklist;
    model.missing_information = ev.missing_information;
    model.source_summary = computeSourceSummary(model);
    return model;
}

/* ── Converter A: Operational Brief → Planning Model ────────────────────── */
/**
 * fromOperationalBrief(brief, opts?)
 *   brief: the analyze payload's brief ({document_set_id, documents,
 *          operational_brief:{...}}), or a bare operational_brief object.
 *   opts:  { source_type? ('uploaded_doc' | 'external_json' | 'mdmp_adapter'),
 *            outcome_type?, file? }
 * Preserves courses_of_action / force_comparison / coa_recommendation /
 * source_citations VERBATIM (cloned). Never mutates the input.
 */
function fromOperationalBrief(brief, opts) {
    const o = obj(opts);
    const srcType = o.source_type || 'uploaded_doc';
    const b = clone(obj(brief));                                   // never touch the input
    const ob = obj(b.operational_brief && typeof b.operational_brief === 'object' ? b.operational_brief
        : (b.brief && b.brief.operational_brief) ? b.brief.operational_brief
        : b);
    const docs = arr(b.documents).length ? arr(b.documents) : arr(b.brief && b.brief.documents);
    const defaultFile = o.file || (docs[0] && (docs[0].filename || docs[0].file)) || null;
    const src = (extra) => makeSource(Object.assign({ type: srcType, file: defaultFile, origin: 'brief' }, extra));

    const m = emptyPlanningModel();

    // mission
    m.mission.statement = str(ob.mission);
    m.mission.outcome_type = OUTCOME_TYPES.indexOf(o.outcome_type) !== -1 ? o.outcome_type : null;
    m.mission.source = src({ key: 'operational_brief.mission' });
    m.mission.confidence = m.mission.source.confidence;
    if (!m.mission.outcome_type) m.mission.missing.push('outcome_type');
    if (!m.mission.statement) m.mission.missing.push('statement');

    // AO — the brief carries one area_of_operations object (may be empty {})
    const ao = obj(ob.area_of_operations);
    if (Object.keys(ao).length) m.area_of_operation.push(withSource(ao, src({ key: 'operational_brief.area_of_operations' })));

    // objectives (strings or objects)
    arr(ob.objectives).forEach((entry, i) => {
        const e = (entry && typeof entry === 'object') ? entry : { name: String(entry) };
        m.objectives.push(withSource(e, src({ key: 'operational_brief.objectives[' + i + ']' })));
    });

    // units — friendly ⇒ BLUE, enemy ⇒ RED (strings tolerated)
    const pushUnits = (list, side, keyBase) => {
        arr(list).forEach((entry, i) => {
            const e = (entry && typeof entry === 'object') ? clone(entry) : { label: String(entry) };
            e.side = e.side || side;
            m.units.push(withSource(e, src({ key: keyBase + '[' + i + ']' })));
        });
    };
    pushUnits(obj(ob.friendly).units, 'BLUE', 'operational_brief.friendly.units');
    pushUnits(obj(ob.enemy).units, 'RED', 'operational_brief.enemy.units');

    // incidents — additive seat (G-3B fills it; briefs may carry none today)
    arr(ob.incidents || b.incidents).forEach((entry, i) => {
        m.incidents.push(withSource(entry, src({ key: 'incidents[' + i + ']' })));
    });

    // COA layer — preserved verbatim (existing source_citations untouched);
    // each card gains a model-level source pointing at its first cited file.
    arr(ob.courses_of_action).forEach((coa, i) => {
        const cites = arr(coa && coa.source_citations);
        const file = (cites[0] && cites[0].file) || defaultFile;
        m.courses_of_action.push(withSource(coa, src({ file: file, key: 'operational_brief.courses_of_action[' + i + ']' })));
    });
    m.force_comparison = ob.force_comparison != null ? clone(ob.force_comparison) : null;
    m.coa_recommendation = ob.coa_recommendation != null ? clone(ob.coa_recommendation) : null;

    return finalize(m);
}

/* ── Converter B: World State (+ scenario) → Planning Model ─────────────── */
/**
 * fromWorldState(ws, scenario?, opts?)
 *   opts: { source_type? ('world_state' | 'scenario_builder'), outcome_type? }
 * Extracts AO / objectives / units (+route copies) / BLS locations and
 * preserves ws.derived.unit_objective_links (OBJLINK-B) verbatim.
 * Reads clones only — never mutates ws or scenario.
 */
function fromWorldState(ws, scenario, opts) {
    const o = obj(opts);
    const srcType = o.source_type === 'scenario_builder' ? 'scenario_builder' : (o.source_type || 'world_state');
    const w = clone(obj(ws));                                      // never touch the inputs
    const scn = clone(obj(scenario));
    const src = (extra) => makeSource(Object.assign({ type: srcType, origin: 'world_state' }, extra));

    const m = emptyPlanningModel();

    // mission
    m.mission.statement = str(scn.scenario_label || scn.name || (w.meta && w.meta.scenario_label));
    m.mission.outcome_type = OUTCOME_TYPES.indexOf(o.outcome_type) !== -1 ? o.outcome_type : null;
    m.mission.source = src({ key: 'meta.scenario_label' });
    m.mission.confidence = m.mission.source.confidence;
    if (!m.mission.outcome_type) m.mission.missing.push('outcome_type');
    if (!m.mission.statement) m.mission.missing.push('statement');

    // AO — authored boundaries first; honest bbox fallback when none
    const region = obj(w.region);
    arr(region.ao_boundaries).forEach((g, i) => {
        m.area_of_operation.push(withSource({ kind: 'boundary', geometry: g }, src({ key: 'region.ao_boundaries[' + i + ']' })));
    });
    if (!m.area_of_operation.length && Array.isArray(region.bbox) && region.bbox.length === 4) {
        m.area_of_operation.push(withSource({ kind: 'bbox', bbox: region.bbox }, src({ key: 'region.bbox' })));
    }

    // objectives
    arr(w.objectives).forEach((entry, i) => {
        m.objectives.push(withSource(entry, src({ key: 'objectives[' + i + ']' })));
    });

    // units — stable projection; route is a COPY (OBJLINK-B hygiene rule)
    arr(w.units).forEach((u, i) => {
        if (!u || !u.uid) return;
        const course = arr(u.kinematics && u.kinematics.course);
        const c0 = course[0], cN = course[course.length - 1];
        m.units.push(withSource({
            uid: u.uid, side: u.side || null, role: u.role || null,
            domain: u.domain || null, echelon: u.echelon || null,
            label: u.label || null, position: Array.isArray(u.position) ? u.position.slice(0, 2) : null,
            strength: (typeof u.strength === 'number') ? u.strength : null,
            status: u.status || null, posture: u.posture || null,
            bls: u.bls != null ? u.bls : null,
            off_map: !!u.off_map,
            route: course.length ? {
                points: course.length,
                from: Array.isArray(c0) ? c0.slice(0, 2) : null,
                to: Array.isArray(cN) ? cN.slice(0, 2) : null,
            } : null,
        }, src({ key: 'units[' + i + ']' })));
    });

    // locations — BLS lines are named places; status by id from the authored
    // step map (the OBJLINK-B wrinkle rule), never from lines.bls[].status.
    const lines = obj(w.lines);
    const blsBaseline = obj(lines.bls_status_baseline);
    arr(lines.bls).forEach((b, i) => {
        if (!b || b.id == null) return;
        m.locations.push(withSource({
            id: b.id, kind: 'bls', position: b.position || null,
            throughput: (typeof b.throughput === 'number') ? b.throughput : null,
            status: blsBaseline[b.id] != null ? blsBaseline[b.id] : null,
        }, src({ key: 'lines.bls[' + i + ']' })));
    });

    // OBJLINK-B evidence — preserved verbatim
    m.unit_objective_links = clone(obj(w.derived && w.derived.unit_objective_links));

    return finalize(m);
}

/* ── Fusion: mergePlanningModels(models[]) ──────────────────────────────── */

const MERGE_COLLECTIONS = Object.freeze([
    { key: 'area_of_operation',  idOf: e => e.id || e.name || (e.kind === 'bbox' ? 'bbox:' + JSON.stringify(e.bbox) : JSON.stringify(e.geometry || e)) },
    { key: 'objectives',         idOf: e => e.id || e.name || JSON.stringify(e) },
    { key: 'units',              idOf: e => e.uid || e.label || JSON.stringify(e) },
    { key: 'locations',          idOf: e => e.id || e.name || JSON.stringify(e) },
    { key: 'incidents',          idOf: e => e.incident_id || e.id || JSON.stringify(e) },
    { key: 'doctrine_refs',      idOf: e => e.card_id || e.id || e.ref || JSON.stringify(e) },
    { key: 'courses_of_action',  idOf: e => e.id || e.coa_id || e.name || JSON.stringify(e) },
]);

function comparable(entry) {                       // identity-relevant content (provenance excluded)
    const e = clone(entry); delete e.source; return JSON.stringify(e);
}
function entryTrust(entry) { return trustOf(entry && entry.source && entry.source.type); }

/**
 * mergePlanningModels(models[]) → one fused model.
 *   - provenance preserved on every kept object;
 *   - same key + same content → single entry (highest trust provenance kept);
 *   - same key + DIFFERENT content → CONFLICT: higher-precedence entry kept as
 *     the working value, the loser preserved inside the conflict record,
 *     needs_review:true — never silently resolved (L15);
 *   - precedence: operator-declared > reviewed > derived > AI-suggested;
 *     ties keep the EARLIER model's entry (input order is deterministic).
 * Inputs are cloned — never mutated.
 */
function mergePlanningModels(models) {
    const list = arr(models).map(m => clone(obj(m)));
    if (!list.length) return finalize(emptyPlanningModel());

    const out = emptyPlanningModel();

    // mission — highest trust wins; differing outcome_types are a conflict
    let mission = null;
    list.forEach(m => {
        const cand = obj(m.mission);
        if (!cand.source) return;
        if (!mission) { mission = cand; return; }
        const better = trustOf(cand.source.type) > trustOf(mission.source.type);
        if (cand.outcome_type && mission.outcome_type && cand.outcome_type !== mission.outcome_type) {
            const kept = better ? cand : mission;
            const dropped = better ? mission : cand;
            out.conflicts.push({
                collection: 'mission', key: 'outcome_type',
                kept: { value: kept.outcome_type, source: kept.source },
                dropped: { value: dropped.outcome_type, source: dropped.source },
                resolution: 'precedence', needs_review: true,
            });
        }
        if (better || (!mission.outcome_type && cand.outcome_type)) mission = cand;
    });
    if (mission) out.mission = mission;

    // collections — keyed merge with surfaced conflicts
    MERGE_COLLECTIONS.forEach(({ key, idOf }) => {
        const seen = {};                                            // id → index in out[key]
        list.forEach(m => {
            arr(m[key]).forEach(entry => {
                if (entry == null) return;
                const id = String(idOf(entry));
                if (!(id in seen)) {
                    seen[id] = out[key].length;
                    out[key].push(entry);
                    return;
                }
                const kept = out[key][seen[id]];
                if (comparable(kept) === comparable(entry)) {
                    // identical content — keep one, prefer higher-trust provenance
                    if (entryTrust(entry) > entryTrust(kept)) out[key][seen[id]] = entry;
                    return;
                }
                // value mismatch — precedence picks the working value; SURFACE it
                const entryWins = entryTrust(entry) > entryTrust(kept);
                const winner = entryWins ? entry : kept;
                const loser = entryWins ? kept : entry;
                out[key][seen[id]] = winner;
                out.conflicts.push({
                    collection: key, key: id,
                    kept: { source: winner.source || null, value: clone(winner) },
                    dropped: { source: loser.source || null, value: clone(loser) },
                    resolution: 'precedence', needs_review: true,
                });
            });
        });
    });

    // unit_objective_links — derived evidence (no per-entry source): first
    // occurrence wins, mismatching later links are surfaced as conflicts.
    list.forEach(m => {
        const links = obj(m.unit_objective_links);
        Object.keys(links).forEach(uid => {
            if (!(uid in out.unit_objective_links)) { out.unit_objective_links[uid] = links[uid]; return; }
            if (JSON.stringify(out.unit_objective_links[uid]) !== JSON.stringify(links[uid])) {
                out.conflicts.push({
                    collection: 'unit_objective_links', key: uid,
                    kept: { source: null, value: clone(out.unit_objective_links[uid]) },
                    dropped: { source: null, value: clone(links[uid]) },
                    resolution: 'first_model_order', needs_review: true,
                });
            }
        });
    });

    // singletons preserved verbatim — first non-null wins, later different
    // values are surfaced (these carry no own source; order = caller intent)
    ['force_comparison', 'coa_recommendation'].forEach(k => {
        list.forEach(m => {
            if (m[k] == null) return;
            if (out[k] == null) { out[k] = m[k]; return; }
            if (JSON.stringify(out[k]) !== JSON.stringify(m[k])) {
                out.conflicts.push({
                    collection: k, key: k,
                    kept: { source: null, value: clone(out[k]) },
                    dropped: { source: null, value: clone(m[k]) },
                    resolution: 'first_model_order', needs_review: true,
                });
            }
        });
    });

    // carry forward conflicts already recorded on the inputs
    list.forEach(m => { arr(m.conflicts).forEach(c => out.conflicts.push(c)); });

    return finalize(out);
}

/* ── Exports ────────────────────────────────────────────────────────────── */

module.exports = {
    OUTCOME_TYPES,
    SOURCE_TYPES,
    TRUST_RANK,
    trustOf,
    makeSource,
    emptyPlanningModel,
    requirementsFor,
    evaluateRequirements,
    computeSourceSummary,
    fromOperationalBrief,
    fromWorldState,
    mergePlanningModels,
    // GIS-TERRAIN-1 (T-2)
    attachTerrainLayer,
    attachTerrainAnalysis,
    // exposed for tests
    _internal: { withSource, comparable, EVALUATORS },
};
