/**
 * Scenario schema descriptor — parametric.
 *
 * Machine-readable spec for what an incoming scenario JSON must contain.
 * Used by scenario-validator.js to check externally-produced files BEFORE
 * the adjudicator/map/MC runner touches them, so missing or malformed
 * fields fail fast with a useful error path instead of crashing later.
 *
 * Style mirrors the rest of the project: plain JS objects, no AJV / no
 * external schema lib, terse paths in JSON-Pointer-ish form ("red_units[0].coord").
 *
 * Reuses enums from adjudicator-schema.js so the scenario's seed values
 * are validated against the same allowed set the adjudicator uses at runtime.
 */

'use strict';

const adjSchema = require('./adjudicator-schema');

// ── Allowed count ranges ───────────────────────────────────────────
// Parametric: the wargame2/1 scenarios use 12/4/11/39, but the system
// must accept smaller and larger operations as long as they stay sane.
// The validator emits a *warning* (not an error) when counts deviate
// from the established wargame1/2 norms (only when a `normal` is set), so
// producers know they're off the well-trodden path without being blocked.
//
// DOC-UNDERSTANDING-1 (2026-06-10): a single real-world operational order
// (Arabic "الأمر الإنذاري" / OPORD) can field a large ORBAT per side. The
// per-side ceilings were raised to 500 (red_units / blue_units_initial /
// optional neutral_units) so a faithful import is not rejected. Validation
// is NOT removed — anything over 500/side is still a hard error, and the
// deterministic normalizer (scenario-normalizer.js) caps counts before save
// so a generated scenario both writes AND loads.
const COUNT_BOUNDS = Object.freeze({
    steps:              { min: 4,  max: 20,  normal: 12 },
    bls_template:       { min: 1,  max: 8,   normal: 4  },
    red_units:          { min: 1,  max: 500, normal: 11 },
    blue_units_initial: { min: 1,  max: 500, normal: 39 },
    // Optional side — only enforced when the scenario actually carries it
    // (validateCounts skips fields whose value isn't an array). normal:null
    // ⇒ no off-norm warning, since there is no established neutral baseline.
    neutral_units:      { min: 0,  max: 500, normal: null },
    pipeline:           { min: 2,  max: 64,  normal: 15 },
});

// ── Top-level keys ─────────────────────────────────────────────────
// Each entry: { required, type, desc, validator? }
// `type` is a primitive name or 'array' / 'object' / 'array-of-coord'.
// `validator` is an optional fn (value, ctx) → array of {path, msg} errors.
const TOP_LEVEL = Object.freeze({
    name:               { required: true,  type: 'string',
        desc: 'Unique scenario id (filename without .json). Must match the on-disk filename.' },

    scenario_label:     { required: true,  type: 'string',
        desc: 'Human-readable title shown in the HUD.' },

    model_version:      { required: false, type: 'string',
        desc: 'Producer-defined version tag.' },

    map_bbox:           { required: true,  type: 'bbox',
        desc: '[lon_min, lat_min, lon_max, lat_max] of the operation map.' },

    obj:                { required: true,  type: 'object',
        desc: 'Mission objective. Required sub-keys: name, coord, target_depth_km, carver.' },

    pipeline:           { required: true,  type: 'array-of-coord',
        desc: 'Planned Red advance route — chain of [lon, lat] waypoints.' },

    red_units:          { required: true,  type: 'array',
        desc: 'Red OOB. Each item: { uid, label, bls, appear, role, coord }.' },

    blue_units_base_ids:{ required: true,  type: 'array-of-string',
        desc: 'Short base ids for Blue units; corresponds 1:1 with blue_units_initial.base_id.' },

    blue_units_initial: { required: true,  type: 'array',
        desc: 'Blue starting positions. Each item: { unit_uid, base_id, echelon?, sidc?, coord, posture? }.' },

    // DOC-UNDERSTANDING-1: optional NEUTRAL/civilian/infrastructure track.
    // Absent on all legacy W1/W2/W3 scenarios; emitted by the document
    // pipeline when a source order names neutral or civilian entities.
    neutral_units:      { required: false, type: 'array',
        desc: 'Optional Neutral/civilian/infrastructure entities. Each item: { uid, coord, label?, kind? }.' },

    bls_template:       { required: true,  type: 'array',
        desc: 'Beach Landing Sites. Each: { name, coord, role?, throughput?, terrain_friction?, permanently_limited? }.' },

    ao_boundaries:      { required: false, type: 'array',
        desc: 'Optional AO/zone polygons for map overlay.' },

    phase_table:        { required: true,  type: 'array',
        desc: 'Phase rows. Each: { index, time_label, elapsed_hours, phase }. Length must equal steps.length.' },

    throughput_ceilings_km: { required: false, type: 'object',
        desc: 'Per-time-checkpoint hard upper bounds on phase_line_km, e.g. { H24: 12, H48: 50, ... }.' },

    terrain_note:       { required: false, type: 'string',
        desc: 'Free-text operational constraint note shown in the adjudicator prompt.' },

    steps:              { required: true,  type: 'array',
        desc: 'Per-step baselines. Each: { index, time_label, elapsed_hours, phase, ... }. Length sets the trial length (4-20).' },

    nominal_throughput: { required: false, type: 'object',
        desc: 'Optional per-BLS nominal capacities. Defaults to bls_template[i].throughput.' },

    // Provenance metadata — optional, kept by the port scripts so we
    // know where a scenario came from when debugging.
    blue_units_source:  { required: false, type: 'string', desc: 'Source path for provenance.' },
    ported_at:          { required: false, type: 'string', desc: 'ISO timestamp of generation.' },
    ported_from:        { required: false, type: 'string', desc: 'Source folder/script identifier.' },
    schema_variant:     { required: false, type: 'string', desc: 'Producer schema variant tag (e.g. "w3-rich", "w4-strike").' },

    // ── W3-rich (Wargame3+) extensions ────────────────────────────
    // These let the renderer animate units along authentic per-step
    // positions instead of the legacy BLS→OBJ lerp, and surface the
    // explicit engagement arcs / actor narratives the W3 producer
    // emits. All optional; absent on legacy W1/W2 scenarios.
    red_unit_step_coords: { required: false, type: 'object',
        desc: 'W3: { uid: [coord_step0, coord_step1, …] } authoritative per-step positions for red.' },
    red_unit_step_prev:   { required: false, type: 'object',
        desc: 'W3: { uid: [prev_coord_step0, …] } — animation hooks (lerp start). Mirrors W3 prev_lon/prev_lat.' },
    blue_unit_step_coords:{ required: false, type: 'object',
        desc: 'W3: { uid: [coord_step0, …] } per-step positions for blue.' },
    blue_unit_step_prev:  { required: false, type: 'object',
        desc: 'W3: { uid: [prev_coord_step0, …] } animation start positions for blue.' },
    off_map_markers:      { required: false, type: 'array',
        desc: 'W3: strategic-level bases/SSMs outside the AO. Each: { id, side, type, coord, name_ar?, name_en? }. Phase-independent.' },

    // ── PR-1 (Operational Shell Foundation): data foundation for per-side views.
    // Both optional today. scenario-loader default-fills BLUE/RED/NEUTRAL +
    // a HOSTILE/NEUTRAL/FRIENDLY posture matrix so legacy W1/W2/W3 scenarios
    // load unchanged. Producers may also emit these explicitly.
    sides: { required: false, type: 'array',
        desc: 'Per-side identity. Each: { id, name_en?, name_ar?, color? }. Default: BLUE/RED/NEUTRAL.' },
    postures: { required: false, type: 'object',
        desc: 'Pairwise posture matrix postures[from][to] ∈ { FRIENDLY | NEUTRAL | UNFRIENDLY | HOSTILE }. Default: BLUE↔RED HOSTILE, both NEUTRAL to NEUTRAL.' },
});

// ── Sub-shapes for nested keys ─────────────────────────────────────
// Each: list of required keys, optional keys, and optional value enums.
const SHAPES = Object.freeze({
    obj: {
        required: ['name', 'coord', 'target_depth_km', 'carver'],
        optional: ['radius_km'],
    },
    bls_template_item: {
        required: ['name', 'coord'],
        optional: ['role', 'capacity', 'throughput', 'nominal_throughput',
                   'terrain_friction', 'score', 'nearest_blue_uid',
                   'nearest_blue_km', 'permanently_limited'],
    },
    red_units_item: {
        required: ['uid', 'label', 'bls', 'appear', 'role', 'coord'],
        optional: ['echelon', 'strength', 'sidc'],
    },
    blue_units_initial_item: {
        required: ['unit_uid', 'base_id', 'coord'],
        optional: ['echelon', 'sidc', 'posture'],
    },
    // DOC-UNDERSTANDING-1: lenient neutral/civilian/infrastructure shape.
    // Only uid + coord are mandatory; everything else is optional so the
    // document pipeline can emit sparse civilian/infrastructure markers.
    neutral_units_item: {
        required: ['uid', 'coord'],
        optional: ['label', 'kind', 'sidc', 'role', 'echelon', 'side'],
    },
    phase_table_item: {
        required: ['index', 'time_label', 'elapsed_hours', 'phase'],
        // kind_native: optional W3-rich field carrying the source `kind`
        // (e.g. "h_hour_strike") so the HUD can show "PHASE 1 (h_hour_strike)".
        optional: ['kind_native'],
    },
    steps_item: {
        // The adjudicator falls back to scenario.steps[i] for baseline state
        // when the LLM call fails; only the index/time_label/elapsed_hours/phase
        // are strictly required for that fallback to work.
        required: ['index', 'time_label', 'elapsed_hours', 'phase'],
        optional: [
            'phase_line_km_baseline', 'objective_status_baseline',
            'bls_status_baseline', 'blue_destroyed_baseline',
            'red_strength_baseline', 'force_ratio_baseline',
            'ew_effect_baseline', 'logistics_state_baseline',
            'narrative_ar_baseline', 'narrative_en_baseline',
            // W3-rich step extensions:
            'kind_native',          // source `kind` (e.g. "beach_assault")
            'actors',               // [{ uid, side, action_what, action_why, … }]
            'affected',             // [{ uid, side, status_change, damage_pct, cause_actor, … }]
            'engagement_arcs',      // [{ actor_uid, target_uid, status_change, coordinates, … }]
        ],
        enums: {
            objective_status_baseline: adjSchema.OBJECTIVE_STATUS,
        },
    },
});

module.exports = {
    COUNT_BOUNDS,
    TOP_LEVEL,
    SHAPES,
};
