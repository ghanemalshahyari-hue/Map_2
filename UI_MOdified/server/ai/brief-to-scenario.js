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
// STEP1-BASE-TYPE-SYMBOL-RESTORE-A: normalize a base/facility type from whatever
// field a reviewed candidate carries (base_type → site_type → object_type →
// anchor_type → placement_type). Unknown → 'base_facility' (NEVER null, NEVER a
// unit type). Mirrors the client baseTypeOf() so persisted anchors keep the type.
function normalizeBaseType(c) {
    const s = String((c && (c.base_type || c.site_type || c.object_type || c.anchor_type || c.placement_type)) || '').toLowerCase();
    if (/friendly_trial|trial/.test(s)) return 'friendly_trial_anchor';
    if (/naval|harbou|\bport\b|بحر|مينا/.test(s)) return 'naval_base';
    if (/land|ground|army|بري|برية/.test(s)) return 'land_base';
    if (/air|airfield|airport|جو|مطار/.test(s)) return 'air_base';
    return 'base_facility';
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
    // opts.noWrite: when true the caller guarantees no file side-effects should
    // occur from this invocation. This generator is already fs-free (pure in-memory),
    // so noWrite is a contract marker — any future fs.writeFileSync / fs.mkdirSync
    // additions here MUST be gated with `if (!opts.noWrite)`.
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
    // IMPORT-UNITS-BASE-PLACEMENT-FIX-A (#4): when the reviewed brief carries base
    // anchors (placement_candidates), lay DRAFT units at those base coordinates
    // instead of a ring around the objective. Falls back to template geometry when
    // a side has no reviewed anchors. Still DRAFT / needs_review — never exact.
    function anchorsForSide(side) {
        const cands = Array.isArray(ob.placement_candidates) ? ob.placement_candidates : [];
        return cands.filter(function (c) {
            return c && String(c.side || '').toUpperCase() === side &&
                Number.isFinite(+c.lon) && Number.isFinite(+c.lat);
        });
    }
    function placeFromAnchors(side, n) {
        const a = anchorsForSide(side);
        if (!a.length) return null;   // no reviewed anchors → caller uses template geometry
        const out = [];
        for (let i = 0; i < n; i++) {
            const c = a[i % a.length];
            const k = Math.floor(i / a.length);                 // wrap count for co-anchored units
            const jit = k === 0 ? 0 : 0.008 * k;                 // tiny deterministic jitter so they don't overlap
            const ang = i * 2.39996323;                          // golden-angle spread
            const lonScale = Math.max(0.2, Math.cos((+c.lat) * Math.PI / 180));
            out.push([r5((+c.lon) + (jit / lonScale) * Math.cos(ang)), r5((+c.lat) + jit * Math.sin(ang))]);
        }
        return out;
    }
    const redAnchorCoords = placeFromAnchors('RED', redN);
    const blueAnchorCoords = placeFromAnchors('BLUE', blueN);
    const redCoords = redAnchorCoords || placeCoords(tpl.red_scheme, redN);
    const blueCoords = blueAnchorCoords || placeCoords(tpl.blue_scheme, blueN);
    const RED_PLACEMENT_SRC = redAnchorCoords ? 'reviewed_base_anchor' : 'template_geometry_relative_to_objective';
    const BLUE_PLACEMENT_SRC = blueAnchorCoords ? 'reviewed_base_anchor' : 'template_geometry_relative_to_objective';

    const red_units = [];
    for (let i = 0; i < redN; i++) {
        const role = tpl.red_roles[i % tpl.red_roles.length];
        red_units.push({
            uid: 'R-' + String(i + 1).padStart(3, '0'), label: role + '-' + (i + 1),
            bls: 'BLS-1', appear: 0, role: role, coord: (redCoords[i] || objCoord.slice()),
            side: 'RED', draft: true, needs_review: true, placement_confidence: 'low',
            // IMPORT-UNITS-BASE-PLACEMENT-FIX-A (#3): provenance — never an exact/final position.
            exact_unit_position: false, placement_source: RED_PLACEMENT_SRC,
            draft_template_position: RED_PLACEMENT_SRC === 'template_geometry_relative_to_objective',
        });
    }
    const blue_units_initial = [];
    for (let i = 0; i < blueN; i++) {
        const role = tpl.blue_roles[i % tpl.blue_roles.length];
        blue_units_initial.push({
            unit_uid: 'B-' + String(i + 1).padStart(3, '0'), base_id: 'b' + (i + 1),
            role: role, coord: (blueCoords[i] || objCoord.slice()), posture: 'DEFEND',
            side: 'BLUE', draft: true, needs_review: true, placement_confidence: 'low',
            // IMPORT-UNITS-BASE-PLACEMENT-FIX-A (#3): provenance — never an exact/final position.
            exact_unit_position: false, placement_source: BLUE_PLACEMENT_SRC,
            draft_template_position: BLUE_PLACEMENT_SRC === 'template_geometry_relative_to_objective',
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

    // RMOOZ-DOC-REVIEW-PERSISTENCE-AND-DEMO-CLEANUP-A (Part C): preserve the reviewed
    // base anchors + proposed units as REVIEW-ONLY metadata so a reloaded scenario can
    // redraw the review anchor layer. These are NOT final units / NOT exact positions.
    const review_placement_candidates = (Array.isArray(ob.placement_candidates) ? ob.placement_candidates : [])
        .map(function (c) {
            return {
                base_id: c.base_id != null ? c.base_id : (c.id != null ? c.id : null),
                id: c.id != null ? c.id : (c.base_id != null ? c.base_id : null),
                base_name_en: c.base_name_en || c.mention || null,
                base_name_ar: c.base_name_ar || null,
                country: c.country || null, country_key: c.country_key || null,
                side: c.side || null,
                lat: Number.isFinite(+c.lat) ? +c.lat : null,
                lon: Number.isFinite(+c.lon) ? +c.lon : null,
                site_type: c.site_type || c.object_type || null,
                // STEP1-BASE-TYPE-SYMBOL-RESTORE-A (req #1/#6): always persist a base_type
                // (air_base | naval_base | land_base | base_facility) so a reloaded scenario
                // redraws the correct typed base symbol — never null, never a unit symbol.
                base_type: normalizeBaseType(c),
                source_type: c.source_type || 'reviewed_placement_candidate',
                needs_review: true, exact_unit_position: false,
            };
        })
        .filter(function (a) { return a.lat != null && a.lon != null; });
    const review_proposed_units = (Array.isArray(ob.proposed_units) ? ob.proposed_units : [])
        .slice(0, 1000)
        .map(function (u) {
            return {
                assigned_base_id: u.assigned_base_id != null ? u.assigned_base_id : (u.base_id != null ? u.base_id : null),
                base_id: u.base_id != null ? u.base_id : null,
                base_name_en: u.base_name_en || null, base_name_ar: u.base_name_ar || null,
                side: u.side || null, country: u.country || null, country_key: u.country_key || null,
                platform: u.platform || u.platform_name || null,
                estimated_count: u.estimated_count != null ? u.estimated_count : null,
                symbol_category: u.symbol_category || null,
                needs_review: true, exact_unit_position: false, review_only: true,
            };
        });

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
        // Part C: review-only anchor layer for redraw-on-reload (top-level mirror).
        review_placement_candidates: review_placement_candidates,
        generation: {
            from: 'operational_brief',
            template: tpl.id, template_name_en: tpl.name_en, template_name_ar: tpl.name_ar,
            draft: true, placement_confidence: 'low',
            objective_source: objective.source,
            document_set_id: (brief && brief.document_set_id) || null,
            source_citations: (Array.isArray(ob.source_citations) ? ob.source_citations.slice(0, 50) : []),
            missing_fields,
            proposed_unit_counts: { red: redN, blue: blueN },
            // IMPORT-UNITS-BASE-PLACEMENT-FIX-A: where DRAFT unit coords came from.
            placement_sources: { red: RED_PLACEMENT_SRC, blue: BLUE_PLACEMENT_SRC },
            exact_unit_position: false,
            // Part C: review-only anchors + proposed rows preserved for reload redraw.
            review_placement_candidates: review_placement_candidates,
            review_proposed_units: review_proposed_units,
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
