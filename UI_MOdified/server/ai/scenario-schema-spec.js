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
// from the established wargame1/2 norms, so producers know they're off
// the well-trodden path without being blocked.
const COUNT_BOUNDS = Object.freeze({
    steps:              { min: 4,  max: 20, normal: 12 },
    bls_template:       { min: 1,  max: 8,  normal: 4  },
    red_units:          { min: 1,  max: 50, normal: 11 },
    blue_units_initial: { min: 1,  max: 100, normal: 39 },
    pipeline:           { min: 2,  max: 64, normal: 15 },
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
    phase_table_item: {
        required: ['index', 'time_label', 'elapsed_hours', 'phase'],
        optional: [],
        enums: { phase: adjSchema.PHASES },
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
        ],
        enums: {
            phase: adjSchema.PHASES,
            objective_status_baseline: adjSchema.OBJECTIVE_STATUS,
        },
    },
});

module.exports = {
    COUNT_BOUNDS,
    TOP_LEVEL,
    SHAPES,
};
