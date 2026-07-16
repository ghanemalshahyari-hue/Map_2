'use strict';
/**
 * scenario-revision-compare.js — Batch D Slice 3: field-level revision diff.
 *
 * Pure logic, no DB access — takes two full scenario JSON objects (already
 * loaded by the caller from scenario_revisions.content_json) and produces a
 * STRUCTURED, human-readable change summary sectioned the way a unit/
 * function manager actually thinks about a scenario, not a raw JSON diff:
 * units, placement, doctrine, missions, runtime events, objectives, victory
 * conditions, plus a generic "other metadata" bucket for everything else
 * (name/label/sides/postures/map/phase-table/etc).
 */

// Compare two arrays of objects keyed by `idField`, producing
// { added: [...ids], removed: [...ids], changed: [{id, fields: [{field, before, after}]}] }.
// A field-level diff within `changed` only looks at OWN enumerable keys
// present on either side of a given pair — nested objects/arrays are compared
// by JSON-stringify equality (good enough for "did this change," not a deep
// structural diff).
function diffKeyedArray(before, after, idField) {
    const beforeList = Array.isArray(before) ? before : [];
    const afterList = Array.isArray(after) ? after : [];
    const beforeMap = new Map(beforeList.filter((x) => x && x[idField] != null).map((x) => [String(x[idField]), x]));
    const afterMap = new Map(afterList.filter((x) => x && x[idField] != null).map((x) => [String(x[idField]), x]));

    const added = [];
    const removed = [];
    const changed = [];

    for (const [id, afterItem] of afterMap) {
        if (!beforeMap.has(id)) { added.push(afterItem); continue; }
        const beforeItem = beforeMap.get(id);
        const keys = new Set([...Object.keys(beforeItem), ...Object.keys(afterItem)]);
        const fields = [];
        for (const key of keys) {
            if (key === idField) continue;
            const b = beforeItem[key];
            const a = afterItem[key];
            if (JSON.stringify(b) !== JSON.stringify(a)) fields.push({ field: key, before: b === undefined ? null : b, after: a === undefined ? null : a });
        }
        if (fields.length) changed.push({ id, fields });
    }
    for (const [id, beforeItem] of beforeMap) {
        if (!afterMap.has(id)) removed.push(beforeItem);
    }
    return { added, removed, changed };
}

// Placement is deliberately split out of the generic unit diff — a manager
// asking "did anything MOVE" shouldn't have to scan unit-changed.fields for a
// coord key buried among unrelated field changes.
function diffPlacement(beforeUnits, afterUnits, idField, coordField) {
    const moved = [];
    const beforeMap = new Map((beforeUnits || []).filter((x) => x && x[idField] != null).map((x) => [String(x[idField]), x]));
    const afterMap = new Map((afterUnits || []).filter((x) => x && x[idField] != null).map((x) => [String(x[idField]), x]));
    for (const [id, afterItem] of afterMap) {
        const beforeItem = beforeMap.get(id);
        if (!beforeItem) continue;
        const b = beforeItem[coordField];
        const a = afterItem[coordField];
        if (JSON.stringify(b) !== JSON.stringify(a)) moved.push({ id, before: b || null, after: a || null });
    }
    return moved;
}

const METADATA_FIELDS = [
    'name', 'scenario_label', 'scenario_label_ar', 'scenario_id', 'model_version', 'schema_variant',
    'sides', 'postures', 'map_bbox', 'obj', 'pipeline', 'bls_template',
    'design_notes', 'authoring_status',
];

// Timing gets its OWN named section, not folded into generic metadata — a
// unit/function manager asking "did the schedule change" shouldn't have to
// find phase_table buried among unrelated authoring fields.
const TIMING_FIELDS = [
    'phase_table', 'steps', 'runtime_scenario', 'duration_minutes', 'duration_hours', 'start_time',
];

function diffFieldSet(before, after, fields) {
    const changed = [];
    for (const field of fields) {
        const b = before ? before[field] : undefined;
        const a = after ? after[field] : undefined;
        if (JSON.stringify(b) !== JSON.stringify(a)) {
            changed.push({ field, before: b === undefined ? null : b, after: a === undefined ? null : a });
        }
    }
    return changed;
}

function diffMetadata(before, after) { return diffFieldSet(before, after, METADATA_FIELDS); }
function diffTiming(before, after) { return diffFieldSet(before, after, TIMING_FIELDS); }

function isEmptySection(section) {
    if (Array.isArray(section)) return section.length === 0;
    return (!section.added || !section.added.length) &&
           (!section.removed || !section.removed.length) &&
           (!section.changed || !section.changed.length);
}

/**
 * compareScenarios(before, after) -> structured diff object.
 * `before`/`after` are full scenario JSON objects (e.g. from two
 * scenario_revisions.content_json rows).
 */
function compareScenarios(before, after) {
    before = before || {};
    after = after || {};

    const redUnits = diffKeyedArray(before.red_units, after.red_units, 'uid');
    const blueUnits = diffKeyedArray(before.blue_units_initial, after.blue_units_initial, 'unit_uid');
    const redPlacement = diffPlacement(before.red_units, after.red_units, 'uid', 'coord');
    const bluePlacement = diffPlacement(before.blue_units_initial, after.blue_units_initial, 'unit_uid', 'coord');

    const sections = {
        units: {
            added: [...redUnits.added, ...blueUnits.added],
            removed: [...redUnits.removed, ...blueUnits.removed],
            changed: [...redUnits.changed, ...blueUnits.changed],
        },
        placement: {
            moved: [...redPlacement, ...bluePlacement],
        },
        doctrine: diffKeyedArray(before.doctrine_rules, after.doctrine_rules, 'id'),
        missions: diffKeyedArray(before.mission_tasks, after.mission_tasks, 'id'),
        runtime_events: diffKeyedArray(before.runtime_events, after.runtime_events, 'id'),
        objectives: diffKeyedArray(before.objectives, after.objectives, 'id'),
        victory_conditions: diffKeyedArray(before.victory_conditions, after.victory_conditions, 'id'),
        timing: { changed: diffTiming(before, after) },
        metadata: { changed: diffMetadata(before, after) },
    };
    const CHANGED_ONLY_SECTIONS = new Set(['metadata', 'timing']);

    const sectionKeys = Object.keys(sections);
    const changedSections = sectionKeys.filter((k) => !isEmptySection(k === 'placement' ? sections[k].moved : (CHANGED_ONLY_SECTIONS.has(k) ? sections[k].changed : sections[k])));
    const summary = {};
    for (const k of sectionKeys) {
        const s = sections[k];
        if (k === 'placement') summary[k] = s.moved.length;
        else if (CHANGED_ONLY_SECTIONS.has(k)) summary[k] = s.changed.length;
        else summary[k] = s.added.length + s.removed.length + s.changed.length;
    }

    return {
        sections,
        summary,
        changed_sections: changedSections,
        has_changes: changedSections.length > 0,
    };
}

module.exports = { compareScenarios, diffKeyedArray, diffPlacement, diffMetadata, diffTiming };
