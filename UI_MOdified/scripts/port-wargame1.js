#!/usr/bin/env node
/**
 * Port Wargame1 → data/scenarios/wargame1-brega.json.
 *
 * Wargame1 is the AGGRESSIVE-RED CAPTURED baseline — same operational area
 * as Wargame2 (same OBJ NASSER, same pipeline axis, same 4 BLS sites), but
 * the model lets Red reach PL=100 km and capture the objective by H+144.
 * That outcome contrast is the regression signal item #10 wants: a CI-style
 * comparison of "aggressive Red wins" vs "terrain-limited Blue denies".
 *
 * Strategy: inherit structural fields (red OOB, blue OOB initial, pipeline,
 * AO boundaries) from the already-ported wargame2-brega.json — both
 * scenarios share these. Only the per-step *_baseline trajectory + BLS
 * coordinates + Arabic narratives differ. We extract those directly from
 * Wargame1/step*.geojson so the baselines reflect the actual W1 outcomes
 * (PL 100 km, CAPTURED, 30 blue destroyed) rather than copy-pasting W2.
 *
 * Run from project root:
 *   node UI_MOdified/scripts/port-wargame1.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT     = path.join(__dirname, '..');
const W1_DIR   = path.join(ROOT, 'Wargame1');
const OUT_DIR  = path.join(ROOT, 'data', 'scenarios');
const OUT_FILE = path.join(OUT_DIR, 'wargame1-brega.json');
const W2_FILE  = path.join(OUT_DIR, 'wargame2-brega.json');

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function unique(list) {
    const seen = new Set();
    const out = [];
    for (const x of list) {
        if (!seen.has(x)) { seen.add(x); out.push(x); }
    }
    return out;
}

// Apply the item #11 doctrine universally: BLS marked permanently_limited
// cannot be SECURE in any baseline. Wargame1's original Python set BLS-4
// SECURE at steps 8/10/11 — that's a data bug, not a doctrine variant
// (the sabkha terrain is the same in both scenarios). We clamp to LIMITED
// here and log every change so the discrepancy is visible to maintainers.
function enforcePermanentlyLimited(blsStatus, blsTemplate, clampLog, stepIndex) {
    if (!blsStatus || !Array.isArray(blsTemplate)) return blsStatus;
    const out = { ...blsStatus };
    for (const b of blsTemplate) {
        if (!b || !b.permanently_limited) continue;
        if (out[b.name] === 'SECURE') {
            out[b.name] = 'LIMITED';
            clampLog.push(`  step ${stepIndex}: ${b.name} SECURE → LIMITED (permanently_limited terrain; item #11 doctrine)`);
        }
    }
    return out;
}

// Walk a Wargame1 step geojson and pull out the per-step baseline shape
// the adjudicator schema expects (mirrors port-wargame2.js's extractStepBaseline,
// but reads everything from the geojson — including blue-destroyed UIDs
// and red-degraded UIDs which Wargame2's script hand-encodes).
function extractStepBaseline(stepJson, stepIndex) {
    const md = stepJson.metadata || {};

    // Blue destroyed uids: any blue Point feature whose status !== 'ACTIVE'.
    // (DESTROYED is the only other observed value, but be permissive.)
    const blueDestroyed = stepJson.features
        .filter(f => f && f.geometry && f.geometry.type === 'Point'
                  && f.properties && f.properties.side === 'BLUE'
                  && f.properties.status && f.properties.status !== 'ACTIVE')
        .map(f => f.properties.unit_uid)
        .filter(Boolean);

    // Red degraded uids: status === 'DEGRADED' OR strength_current < 1.0.
    const redDegraded = stepJson.features
        .filter(f => f && f.geometry && f.geometry.type === 'Point'
                  && f.properties && f.properties.side === 'RED'
                  && (f.properties.status === 'DEGRADED'
                      || (Number.isFinite(f.properties.strength_current) && f.properties.strength_current < 1.0)))
        .map(f => f.properties.unit_uid)
        .filter(Boolean);

    // Build a red_strength_baseline keyed by uid (1.0 default, 0.7 for degraded).
    // Mirrors the convention the adjudicator schema uses.
    const redStrengthBaseline = {};
    for (const f of stepJson.features) {
        if (f && f.properties && f.properties.side === 'RED' && f.properties.unit_uid) {
            redStrengthBaseline[f.properties.unit_uid] =
                redDegraded.includes(f.properties.unit_uid) ? 0.7 : 1.0;
        }
    }

    const losses = md.losses_cumulative || {};

    return {
        index: stepIndex,
        time_label: md.time_label,
        elapsed_hours: md.elapsed_hours,
        phase: md.phase,
        phase_line_km_baseline: md.phase_line_km,
        objective_status_baseline: md.objective_status,
        decision_point_baseline: md.decision_point,
        force_ratio_baseline: md.force_ratio,
        ew_effect_baseline: md.ew_effect,
        mobility_state_baseline: md.mobility_state || null,
        logistics_state_baseline: md.logistics_state,
        narrative_en_fallback: md.narrative_en || '',
        narrative_ar_fallback: md.narrative_ar || '',
        bls_status_baseline: md.bls_status,
        blue_destroyed_baseline: unique(blueDestroyed),
        blue_destroyed_count_baseline: blueDestroyed.length,
        red_losses_cumulative_baseline: losses.red_company_equivalent != null ? losses.red_company_equivalent : 0,
        red_degraded_baseline: unique(redDegraded),
        red_strength_baseline: redStrengthBaseline,
        red_active_markers_baseline: md.red_active_markers,
    };
}

// Wargame1 doesn't ship a separate bls_selection.geojson — BLS positions
// live inside step00.geojson as features with name="BLS-N". Pull them out,
// stitch in the doctrinal throughput/capacity tags (same as Wargame2 — the
// beaches themselves are the same, only the operational outcome differs).
function buildBlsTemplate(step00Json, w2BlsTemplate) {
    const blsFeatures = step00Json.features.filter(f =>
        f && f.geometry && f.geometry.type === 'Point'
          && f.properties && /^BLS-[1-4]$/.test(f.properties.name || ''));
    if (blsFeatures.length !== 4) {
        throw new Error(`Wargame1 step00: expected 4 BLS points, got ${blsFeatures.length}`);
    }
    blsFeatures.sort((a, b) => a.properties.name.localeCompare(b.properties.name));

    // Inherit the doctrinal fields from W2's bls_template (same beaches,
    // same throughput/capacity/permanently_limited classification).
    const w2By = Object.fromEntries(w2BlsTemplate.map(b => [b.name, b]));

    return blsFeatures.map(f => {
        const name = f.properties.name;
        const inherit = w2By[name] || {};
        return {
            name,
            coord: f.geometry.coordinates,
            role: f.properties.role || inherit.role,
            capacity: inherit.capacity || 'Medium',
            permanently_limited: !!inherit.permanently_limited,
            throughput: inherit.throughput,
            nominal_throughput: inherit.nominal_throughput,
            terrain_friction: inherit.terrain_friction,
            score: inherit.score,
            nearest_blue_uid: inherit.nearest_blue_uid,
            nearest_blue_km: inherit.nearest_blue_km,
        };
    });
}

function buildScenario() {
    if (!fs.existsSync(W1_DIR)) throw new Error(`Wargame1 directory not found: ${W1_DIR}`);
    if (!fs.existsSync(W2_FILE)) throw new Error(`Run port-wargame2.js first — needs wargame2-brega.json as template`);

    const w2 = readJson(W2_FILE);
    const step00 = readJson(path.join(W1_DIR, 'step00.geojson'));

    // Override red/blue coords with Wargame1's step00 positions when present
    // (the OOB layout is identical between W1 and W2, but the step00 PNGs
    // may have nudged a few markers; honoring the data avoids visual drift).
    const w1RedCoords = {};
    const w1BlueInit  = {};
    for (const f of step00.features) {
        if (!f || !f.geometry || f.geometry.type !== 'Point') continue;
        const p = f.properties || {};
        if (p.side === 'RED' && p.unit_uid) {
            w1RedCoords[p.unit_uid] = f.geometry.coordinates;
        } else if (p.side === 'BLUE' && p.unit_uid) {
            w1BlueInit[p.unit_uid] = {
                unit_uid: p.unit_uid,
                base_id:  p.unit_uid.replace(/^BLUE_/, ''),
                echelon:  p.echelon,
                sidc:     p.sidc || null,
                coord:    f.geometry.coordinates,
                posture:  p.posture || null,
            };
        }
    }

    const redUnits = w2.red_units.map(u => ({
        ...u,
        coord: w1RedCoords[u.uid] || u.coord,
    }));

    const blueUnitsInitial = w2.blue_units_initial.map(b => w1BlueInit[b.unit_uid] || b);

    const blsTemplate = buildBlsTemplate(step00, w2.bls_template);

    // Per-step baselines from W1 geojsons. 12 steps total. We clamp
    // BLS-4 (and any other permanently_limited BLS) back from SECURE
    // to LIMITED so the baselines are consistent with item #11.
    const clampLog = [];
    const steps = [];
    for (let i = 0; i < 12; i++) {
        const file = path.join(W1_DIR, `step${String(i).padStart(2, '0')}.geojson`);
        const sj = readJson(file);
        const baseline = extractStepBaseline(sj, i);
        baseline.bls_status_baseline = enforcePermanentlyLimited(
            baseline.bls_status_baseline, blsTemplate, clampLog, i);
        steps.push(baseline);
    }
    if (clampLog.length) {
        console.log('Doctrine clamps applied to Wargame1 baselines (item #11):');
        for (const line of clampLog) console.log(line);
    }

    return {
        name: 'wargame1-brega',
        model_version: 'brega-wargame1-gis-v1.0',
        scenario_label: 'Brega-Ajdabiya GIS-informed amphibious assault (aggressive-Red baseline)',
        // Reuse W2's bbox + OBJ + pipeline + AO boundaries — same physical scenario.
        map_bbox: w2.map_bbox,
        obj:      w2.obj,
        pipeline: w2.pipeline,
        red_units: redUnits,
        blue_units_base_ids: w2.blue_units_base_ids,
        blue_units_initial:  blueUnitsInitial,
        blue_units_source:   'nato-map-layers.geojson',
        ao_boundaries:       w2.ao_boundaries,
        bls_template:        blsTemplate,
        nominal_throughput:  w2.nominal_throughput,
        phase_table:         w2.phase_table,
        throughput_ceilings_km: w2.throughput_ceilings_km,
        terrain_note: w2.terrain_note,
        // Item #10 — explicit regression markers so the test harness can
        // assert these without hard-coding expectations elsewhere.
        regression_expect: {
            final_objective_status: 'CAPTURED',
            final_phase_line_km:    100,
            final_blue_destroyed:   30,
        },
        steps,
        ported_at:   new Date().toISOString(),
        ported_from: 'UI_MOdified/Wargame1/{wargame.py, step00..11.geojson} + wargame2-brega.json structural fields',
    };
}

function main() {
    const scenario = buildScenario();
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(OUT_FILE, JSON.stringify(scenario, null, 2) + '\n', 'utf8');

    const last = scenario.steps[11];
    console.log(`Wrote ${OUT_FILE}`);
    console.log(`  steps:                             12`);
    console.log(`  red_units:                         ${scenario.red_units.length}`);
    console.log(`  blue_units:                        ${scenario.blue_units_base_ids.length}`);
    console.log(`  bls_template:                      ${scenario.bls_template.length}`);
    console.log(`  pipeline pts:                      ${scenario.pipeline.length}`);
    console.log(`  cumul blue destroyed at step 11:   ${last.blue_destroyed_count_baseline}`);
    console.log(`  final phase_line_km baseline:      ${last.phase_line_km_baseline}`);
    console.log(`  final objective_status baseline:   ${last.objective_status_baseline}`);
}

if (require.main === module) {
    try { main(); }
    catch (err) {
        console.error('ERROR:', err.message);
        process.exit(1);
    }
}

module.exports = { buildScenario };
