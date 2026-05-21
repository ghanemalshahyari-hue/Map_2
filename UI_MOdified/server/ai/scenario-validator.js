/**
 * Scenario validator.
 *
 * Validates an incoming scenario JSON against scenario-schema-spec.js.
 * Returns a flat list of errors (blockers) and warnings (deviations from
 * wargame1/2 norms that are still allowed). The HUD's import panel shows
 * errors as red blockers and warnings as yellow "proceed with caution".
 *
 * Hooked into scenario-loader.loadScenario(): a malformed JSON now throws
 * a structured error BEFORE the adjudicator/map see it, instead of crashing
 * later at runtime with a cryptic "cannot read property X of undefined".
 *
 * Returns shape:
 *   {
 *     ok: boolean,                                // true iff errors.length === 0
 *     errors:   [{ path, msg }],                  // blockers
 *     warnings: [{ path, msg }],                  // soft issues
 *     summary: { stepCount, blsCount, redCount, blueCount }
 *   }
 */

'use strict';

const spec      = require('./scenario-schema-spec');
const adjSchema = require('./adjudicator-schema');

// ── Type checks ────────────────────────────────────────────────────
function isFiniteNum(v) { return typeof v === 'number' && Number.isFinite(v); }
function isCoord(v) {
    return Array.isArray(v) && v.length === 2 && isFiniteNum(v[0]) && isFiniteNum(v[1])
        && v[0] >= -180 && v[0] <= 180 && v[1] >= -90 && v[1] <= 90;
}
function isBbox(v) {
    return Array.isArray(v) && v.length === 4
        && v.every(isFiniteNum)
        && v[0] < v[2] && v[1] < v[3]   // lon_min<lon_max, lat_min<lat_max
        && v[0] >= -180 && v[2] <= 180 && v[1] >= -90 && v[3] <= 90;
}

function typeMatches(value, typeName) {
    switch (typeName) {
        case 'string':          return typeof value === 'string';
        case 'number':          return isFiniteNum(value);
        case 'integer':         return Number.isInteger(value);
        case 'boolean':         return typeof value === 'boolean';
        case 'object':          return value !== null && typeof value === 'object' && !Array.isArray(value);
        case 'array':           return Array.isArray(value);
        case 'array-of-string': return Array.isArray(value) && value.every(s => typeof s === 'string');
        case 'array-of-coord':  return Array.isArray(value) && value.every(isCoord);
        case 'coord':           return isCoord(value);
        case 'bbox':            return isBbox(value);
        default:                return false;
    }
}

// ── Helpers ────────────────────────────────────────────────────────
function pushErr(list, path, msg)  { list.push({ path, msg }); }
function pushWarn(list, path, msg) { list.push({ path, msg }); }

// Validate one object against a shape descriptor (required/optional/enums).
// `pathPrefix` is the JSON-Pointer-ish path to this object for error reporting.
function validateShape(obj, shape, pathPrefix, errors) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        pushErr(errors, pathPrefix, 'expected object');
        return;
    }
    for (const key of shape.required) {
        if (!(key in obj) || obj[key] == null) {
            pushErr(errors, pathPrefix + '.' + key, 'required');
        }
    }
    if (shape.enums) {
        for (const [key, allowed] of Object.entries(shape.enums)) {
            if (key in obj && obj[key] != null && !allowed.includes(obj[key])) {
                pushErr(errors, pathPrefix + '.' + key,
                    `must be one of [${allowed.join('|')}], got "${obj[key]}"`);
            }
        }
    }
}

// Per-item shape check + coordinate sanity for arrays of structured items.
function validateArrayOfShape(arr, shape, pathPrefix, errors) {
    for (let i = 0; i < arr.length; i++) {
        validateShape(arr[i], shape, `${pathPrefix}[${i}]`, errors);
        // Sub-key coord sanity (the shape doesn't carry type info, just key lists).
        if (arr[i] && Array.isArray(arr[i].coord) && !isCoord(arr[i].coord)) {
            pushErr(errors, `${pathPrefix}[${i}].coord`,
                'must be [lon, lat] with valid earth coordinates');
        }
    }
}

// ── Top-level validation ───────────────────────────────────────────
function validateTopLevel(scenario, errors) {
    if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) {
        pushErr(errors, '', 'scenario must be a JSON object');
        return false;
    }
    for (const [key, descriptor] of Object.entries(spec.TOP_LEVEL)) {
        const present = (key in scenario) && scenario[key] != null;
        if (descriptor.required && !present) {
            pushErr(errors, key, 'required');
            continue;
        }
        if (!present) continue;     // optional + absent → fine
        if (!typeMatches(scenario[key], descriptor.type)) {
            pushErr(errors, key,
                `must be ${descriptor.type}, got ${Array.isArray(scenario[key]) ? 'array' : typeof scenario[key]}`);
        }
    }
    return true;
}

// ── Count range check (errors when wildly out of bounds, warnings when off-norm) ──
function validateCounts(scenario, errors, warnings, isW3) {
    const summary = {};
    // W3-rich carries a full 173-unit OOB; raise the red cap to accommodate it.
    const W3_RED_MAX = 200;
    for (const [field, bounds] of Object.entries(spec.COUNT_BOUNDS)) {
        const value = scenario[field];
        if (!Array.isArray(value)) continue;     // missing required arrays caught by top-level
        const n = value.length;
        summary[field] = n;
        const effectiveMax = (isW3 && field === 'red_units') ? W3_RED_MAX : bounds.max;
        if (n < bounds.min || n > effectiveMax) {
            pushErr(errors, field,
                `count ${n} out of allowed range [${bounds.min}..${effectiveMax}]`);
        } else if (n !== bounds.normal) {
            pushWarn(warnings, field,
                `count ${n} deviates from wargame1/2 norm (${bounds.normal}); valid but off-pattern`);
        }
    }
    return summary;
}

// ── Cross-field consistency ────────────────────────────────────────
function validateConsistency(scenario, errors, warnings) {
    // phase_table.length must equal steps.length (one phase row per step).
    if (Array.isArray(scenario.phase_table) && Array.isArray(scenario.steps)
        && scenario.phase_table.length !== scenario.steps.length) {
        pushErr(errors, 'phase_table',
            `length ${scenario.phase_table.length} must equal steps.length (${scenario.steps.length})`);
    }
    // blue_units_base_ids and blue_units_initial must agree in count.
    if (Array.isArray(scenario.blue_units_base_ids) && Array.isArray(scenario.blue_units_initial)
        && scenario.blue_units_base_ids.length !== scenario.blue_units_initial.length) {
        pushWarn(warnings, 'blue_units_base_ids',
            `length ${scenario.blue_units_base_ids.length} != blue_units_initial.length (${scenario.blue_units_initial.length}); shapes may diverge during render`);
    }
    // Every red_units[i].bls must reference an existing BLS name.
    if (Array.isArray(scenario.bls_template) && Array.isArray(scenario.red_units)) {
        const blsNames = new Set(scenario.bls_template.map(b => b && b.name).filter(Boolean));
        scenario.red_units.forEach((u, i) => {
            if (u && u.bls && !blsNames.has(u.bls)) {
                pushErr(errors, `red_units[${i}].bls`,
                    `references unknown BLS "${u.bls}" (known: ${[...blsNames].join(', ')})`);
            }
        });
    }
    // Every red_units[i].appear must be within steps range.
    if (Array.isArray(scenario.red_units) && Array.isArray(scenario.steps)) {
        const lastStep = scenario.steps.length - 1;
        scenario.red_units.forEach((u, i) => {
            if (u && Number.isInteger(u.appear) && (u.appear < 0 || u.appear > lastStep)) {
                pushErr(errors, `red_units[${i}].appear`,
                    `step ${u.appear} out of range [0..${lastStep}]`);
            }
        });
    }
    // OBJ coord must lie within map_bbox (else the operation map can't see it).
    if (Array.isArray(scenario.map_bbox) && scenario.obj && isCoord(scenario.obj.coord)) {
        const [lo, la]              = scenario.obj.coord;
        const [lon0, lat0, lon1, lat1] = scenario.map_bbox;
        if (lo < lon0 || lo > lon1 || la < lat0 || la > lat1) {
            pushWarn(warnings, 'obj.coord',
                `objective at [${lo},${la}] lies outside map_bbox [${lon0},${lat0},${lon1},${lat1}]; map may not render it`);
        }
    }
    // name should match the on-disk filename — but loader checks that.
}

// ── Main entry ─────────────────────────────────────────────────────
function validateScenario(parsed) {
    const errors   = [];
    const warnings = [];

    if (!validateTopLevel(parsed, errors)) {
        return { ok: false, errors, warnings, summary: {} };
    }

    // W3-rich scenarios carry a full 173-unit OOB and use their own phase kind
    // labels ("shaping", "h_hour_strike", …) rather than the standard PHASES enum.
    const isW3 = parsed.schema_variant === 'w3-rich';

    const summary = validateCounts(parsed, errors, warnings, isW3);

    // For W3, build phase-enum-free shape variants so the native W3 phase labels
    // (shaping, h_hour_strike, beach_assault, …) don't trip the enum check.
    const phaseTableShape = isW3
        ? { required: spec.SHAPES.phase_table_item.required, optional: [], enums: {} }
        : spec.SHAPES.phase_table_item;
    const stepsShape = isW3
        ? { required: spec.SHAPES.steps_item.required, optional: spec.SHAPES.steps_item.optional,
            enums: { objective_status_baseline: adjSchema.OBJECTIVE_STATUS } }
        : spec.SHAPES.steps_item;

    // Sub-shape validation only when the parent array is present + correct type.
    if (parsed.obj && typeof parsed.obj === 'object') {
        validateShape(parsed.obj, spec.SHAPES.obj, 'obj', errors);
        if (parsed.obj.coord && !isCoord(parsed.obj.coord)) {
            pushErr(errors, 'obj.coord', 'must be [lon, lat]');
        }
        if (parsed.obj.carver != null && (
            !Number.isInteger(parsed.obj.carver) || parsed.obj.carver < 0 || parsed.obj.carver > 60)) {
            pushErr(errors, 'obj.carver', 'must be integer 0..60');
        }
    }
    if (Array.isArray(parsed.bls_template)) {
        validateArrayOfShape(parsed.bls_template, spec.SHAPES.bls_template_item, 'bls_template', errors);
    }
    if (Array.isArray(parsed.red_units)) {
        validateArrayOfShape(parsed.red_units, spec.SHAPES.red_units_item, 'red_units', errors);
    }
    if (Array.isArray(parsed.blue_units_initial)) {
        validateArrayOfShape(parsed.blue_units_initial, spec.SHAPES.blue_units_initial_item, 'blue_units_initial', errors);
    }
    if (Array.isArray(parsed.phase_table)) {
        validateArrayOfShape(parsed.phase_table, phaseTableShape, 'phase_table', errors);
    }
    if (Array.isArray(parsed.steps)) {
        validateArrayOfShape(parsed.steps, stepsShape, 'steps', errors);
    }

    validateConsistency(parsed, errors, warnings);

    return {
        ok:       errors.length === 0,
        errors,
        warnings,
        summary: {
            stepCount:  Array.isArray(parsed.steps)              ? parsed.steps.length              : 0,
            blsCount:   Array.isArray(parsed.bls_template)       ? parsed.bls_template.length       : 0,
            redCount:   Array.isArray(parsed.red_units)          ? parsed.red_units.length          : 0,
            blueCount:  Array.isArray(parsed.blue_units_initial) ? parsed.blue_units_initial.length : 0,
            ...summary,
        },
    };
}

// Format a flat error list for human reading (used in thrown errors).
function formatErrors(issues) {
    if (!Array.isArray(issues) || issues.length === 0) return '(no issues)';
    return issues.map(e => `  - ${e.path || '(root)'}: ${e.msg}`).join('\n');
}

module.exports = {
    validateScenario,
    formatErrors,
    // Exposed for tests / introspection:
    isCoord,
    isBbox,
    typeMatches,
};
