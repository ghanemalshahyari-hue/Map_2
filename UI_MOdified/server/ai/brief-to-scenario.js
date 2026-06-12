/**
 * Brief → RMOOZ scenario generator — DOC-UNDERSTANDING-1 / Phase F.
 *
 * Deterministic, NO-LLM generation of a DRAFT scenario from a *reviewed*
 * Operational Brief plus an operation template. This is the "RMOOZ generates"
 * step of the global rule (AI understands → user reviews → RMOOZ validates →
 * RMOOZ generates). It never reads raw document chunks and never calls an LLM.
 *
 * Rules honored:
 *   • Requires an objective coordinate (operator-set or carried in the brief);
 *     without one it returns { requiresObjective:true } so the UI asks the
 *     operator to set the objective on the map. It does NOT invent an objective.
 *   • Unit positions are DRAFT — laid out by the template geometry RELATIVE to
 *     the objective, every unit flagged draft / needs_review / low confidence.
 *   • Counts come from the reviewed brief's proposed_unit_counts (clamped ≤500).
 *   • Output is a schema-valid scenario (see scenario-schema-spec.js); the
 *     caller still runs the normalizer + validator before saving.
 *
 * generateScenarioFromBrief(brief, opts) → { scenario, report } | { requiresObjective, reason }
 *   opts = { objective:{lon,lat,name?}, template?, name? }
 */
'use strict';

const TPL = require('./operation-templates');

function num(v, d) { return Number.isFinite(v) ? v : d; }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function r5(n) { return Math.round(n * 1e5) / 1e5; }
function sanitizeName(s) {
    return String(s == null ? '' : s).trim().replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'brief_scenario';
}

// n points on a ring around center; lon radius scaled for latitude.
function ring(center, n, radiusDeg) {
    const out = [], lon = center[0], lat = center[1];
    const lonScale = Math.max(0.2, Math.cos(lat * Math.PI / 180));
    for (let i = 0; i < n; i++) {
        const a = (2 * Math.PI * i) / Math.max(1, n);
        out.push([r5(lon + (radiusDeg / lonScale) * Math.cos(a)), r5(lat + radiusDeg * Math.sin(a))]);
    }
    return out;
}
// n points along an approach axis offset from center toward bearingDeg, spread laterally.
function axis(center, n, bearingDeg, distDeg, spreadDeg) {
    const out = [], lon = center[0], lat = center[1];
    const br = bearingDeg * Math.PI / 180;
    const lonScale = Math.max(0.2, Math.cos(lat * Math.PI / 180));
    const baseLon = lon + (distDeg * Math.sin(br)) / lonScale;
    const baseLat = lat + (distDeg * Math.cos(br));
    const perp = br + Math.PI / 2;
    for (let i = 0; i < n; i++) {
        const off = (n > 1) ? (spreadDeg * ((i / (n - 1)) - 0.5)) : 0;
        out.push([r5(baseLon + (off * Math.sin(perp)) / lonScale), r5(baseLat + off * Math.cos(perp))]);
    }
    return out;
}

function resolveObjective(brief, ob, opts) {
    if (opts.objective && Number.isFinite(opts.objective.lon) && Number.isFinite(opts.objective.lat)) {
        return { coord: [opts.objective.lon, opts.objective.lat], name: opts.objective.name || null, source: 'operator' };
    }
    const ao = ob.area_of_operations || {};
    if (ao && Array.isArray(ao.center) && ao.center.length === 2 &&
        Number.isFinite(ao.center[0]) && Number.isFinite(ao.center[1])) {
        return { coord: [ao.center[0], ao.center[1]], name: ao.name || null, source: 'brief' };
    }
    if (Array.isArray(ob.objectives)) {
        for (const o of ob.objectives) {
            if (o && Array.isArray(o.coord) && o.coord.length === 2 &&
                Number.isFinite(o.coord[0]) && Number.isFinite(o.coord[1])) {
                return { coord: [o.coord[0], o.coord[1]], name: o.name || null, source: 'brief' };
            }
        }
    }
    return null;
}

function generateScenarioFromBrief(brief, opts) {
    opts = opts || {};
    const ob = (brief && brief.operational_brief) || brief || {};
    const understanding = (brief && brief.understanding) || {};

    const objective = resolveObjective(brief, ob, opts);
    if (!objective) {
        return { requiresObjective: true, reason: 'No objective coordinate available — operator must set the objective position on the map before generating.' };
    }
    const [lon, lat] = objective.coord;
    if (!(Math.abs(lon) <= 180 && Math.abs(lat) <= 90)) {
        return { requiresObjective: true, reason: 'Objective coordinate is out of range — re-set it on the map.' };
    }
    const objName = objective.name || (Array.isArray(ob.objectives) && ob.objectives[0] && ob.objectives[0].name) || 'OBJ X';

    const tplId = opts.template || (brief && brief.template) || TPL.inferTemplateId(brief);
    const tpl = TPL.getTemplate(tplId) || TPL.getTemplate(TPL.DEFAULT_TEMPLATE);

    const pc = understanding.proposed_unit_counts || {};
    const redN  = clamp(Math.round(num(pc.red,  (ob.enemy && (ob.enemy.units || []).length) || 6)) || 6, 1, 500);
    const blueN = clamp(Math.round(num(pc.blue, (ob.friendly && (ob.friendly.units || []).length) || 6)) || 6, 1, 500);

    // Phases / steps from the template.
    const steps = tpl.phases.map((ph, i) => ({
        index: i,
        time_label: (i === 0 ? 'H0' : 'H+' + (i * 6)),
        elapsed_hours: i * 6,
        phase: ph.kind,
        kind_native: ph.kind,
    }));
    const phase_table = steps.map((s, i) => ({ index: i, time_label: s.time_label, elapsed_hours: s.elapsed_hours, phase: s.phase, kind_native: tpl.phases[i].kind }));

    // Map bbox around the objective (clamped to world range, kept ordered).
    const m = 0.6;
    const map_bbox = [
        r5(clamp(lon - m, -179.9, 179.8)), r5(clamp(lat - m, -89.9, 89.8)),
        r5(clamp(lon + m, -179.8, 179.9)), r5(clamp(lat + m, -89.8, 89.9)),
    ];
    const objCoord = [r5(lon), r5(lat)];
    const obj = { name: objName, coord: objCoord, target_depth_km: tpl.target_depth_km, carver: tpl.carver, radius_km: 10 };

    // Draft BLS near the objective.
    const blsCount = clamp(tpl.bls_count || 1, 1, 8);
    const bls_template = ring(objCoord, blsCount, 0.12).map((c, i) =>
        ({ name: 'BLS-' + (i + 1), coord: c, role: 'staging', draft: true, needs_review: true }));

    // Draft pipeline: attacker approach origin → objective.
    const approachOrigin = axis(objCoord, 1, tpl.bearing_deg, 0.45, 0)[0];
    const pipeline = [approachOrigin, [r5((approachOrigin[0] + objCoord[0]) / 2), r5((approachOrigin[1] + objCoord[1]) / 2)], objCoord.slice()];

    function placeCoords(scheme, n) {
        return scheme === 'ring' ? ring(objCoord, n, 0.07) : axis(objCoord, n, tpl.bearing_deg, 0.30, 0.30);
    }
    const redCoords = placeCoords(tpl.red_scheme, redN);
    const blueCoords = placeCoords(tpl.blue_scheme, blueN);

    const red_units = [];
    for (let i = 0; i < redN; i++) {
        const role = tpl.red_roles[i % tpl.red_roles.length];
        red_units.push({
            uid: 'R-' + String(i + 1).padStart(3, '0'), label: role + '-' + (i + 1),
            bls: 'BLS-1', appear: 0, role: role, coord: (redCoords[i] || objCoord.slice()),
            side: 'RED', draft: true, needs_review: true, placement_confidence: 'low',
        });
    }
    const blue_units_initial = [];
    for (let i = 0; i < blueN; i++) {
        const role = tpl.blue_roles[i % tpl.blue_roles.length];
        blue_units_initial.push({
            unit_uid: 'B-' + String(i + 1).padStart(3, '0'), base_id: 'b' + (i + 1),
            role: role, coord: (blueCoords[i] || objCoord.slice()), posture: 'DEFEND',
            side: 'BLUE', draft: true, needs_review: true, placement_confidence: 'low',
        });
    }
    const blue_units_base_ids = blue_units_initial.map(u => u.base_id);

    // Missing / low-confidence fields the operator should resolve.
    const missing_fields = [];
    if (objective.source !== 'operator') missing_fields.push('objective_position (using brief value — confirm on map)');
    if (!(pc.red > 0)) missing_fields.push('enemy (RED) unit count (used default)');
    if (!(pc.blue > 0)) missing_fields.push('friendly (BLUE) unit count (used default)');
    missing_fields.push('all unit positions are DRAFT — refine on the map');
    missing_fields.push('precise coordinates were not taken from the document');
    if (!ob.mission) missing_fields.push('mission text');
    if (!(Array.isArray(ob.constraints) && ob.constraints.length)) missing_fields.push('constraints / ROE');

    const scenario = {
        name: sanitizeName(opts.name || tpl.id + '_draft'),
        scenario_label: (ob.mission && String(ob.mission).slice(0, 60)) || (tpl.name_en + ' (draft)'),
        model_version: 'brief-gen-v1',
        map_bbox, obj, pipeline,
        red_units, blue_units_base_ids, blue_units_initial,
        bls_template, phase_table, steps,
        terrain_note: 'Draft scenario generated from a reviewed Operational Brief. Positions are placeholders for operator review.',
        // provenance + draft markers (extra keys; validator ignores unknown keys)
        source: 'OperationalBrief',
        generated_from_brief: true,
        generation: {
            from: 'operational_brief',
            template: tpl.id, template_name_en: tpl.name_en, template_name_ar: tpl.name_ar,
            draft: true, placement_confidence: 'low',
            objective_source: objective.source,
            document_set_id: (brief && brief.document_set_id) || null,
            source_citations: (Array.isArray(ob.source_citations) ? ob.source_citations.slice(0, 50) : []),
            missing_fields,
            proposed_unit_counts: { red: redN, blue: blueN },
        },
        ported_from: 'brief-to-scenario.js',
    };

    const report = {
        template: tpl.id, template_name_en: tpl.name_en, template_name_ar: tpl.name_ar,
        objective: { coord: objCoord, name: objName, source: objective.source },
        phases: tpl.phases.map(p => ({ index: p.index, kind: p.kind, name_en: p.name_en, name_ar: p.name_ar })),
        placed: { red: redN, blue: blueN, bls: blsCount },
        placement_confidence: 'low',
        draft: true,
        missing_fields,
    };

    return { scenario, report };
}

module.exports = { generateScenarioFromBrief, ring, axis };
