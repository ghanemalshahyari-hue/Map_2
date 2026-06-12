#!/usr/bin/env node
/**
 * Decision Package  →  RMOOZ Live Scenario JSON converter  (PR-242)
 *
 * Turns an external "Decision Package" folder (خطوات صنع القرار) into a
 * RMOOZ live-scenario JSON that the Operational Scenario HUD can DRAW on the
 * map and the adjudicator can read — closing the gap where Decision Packages
 * were preview-only and never reached the map.
 *
 *   node UI_MOdified/scripts/convert-decision-package.js <DP_folder> [--name <id>] [--force]
 *
 * Output: UI_MOdified/data/scenarios/<scenario_id>.json
 *
 * Source package layout (read-only — never modified):
 *   scenario_manifest.json
 *   steps/stepNN.json          (units[]{uid,side,name,role,position}, decision_point, options, ...)
 *   geojson/stepNN.geojson     (optional — used only for non-unit geometry)
 *   images/stepNN.png          (optional — referenced, not copied)
 *
 * Refinements (per PR-242 plan):
 *   1. Keep decision points + options       → step.decision_point_baseline + step.decisionOptions
 *   2. Keep source_trace + provenance       → step.source_trace + scenario.converted_from
 *   3. Carry per-step image refs            → step.image_ref
 *   4. Overwrite protection                 → suffix unless --force
 *
 * Boundaries: reads the package read-only; writes ONE new scenario file; emits
 * NO unsafe keys (lua, script, execute-prefixed, url-suffixed, storage,
 * liveMutationAllowed, backendCommitAllowed) so the result passes
 * validateLiveScenarioJson; no
 * backend, no auto-adjudication, no mutation of existing scenarios.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT      = path.join(__dirname, '..');
const SCENARIOS = path.join(ROOT, 'data', 'scenarios');

const STEP_RE = /^step(\d{1,3})\.json$/i;

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

// Generic 20-char SIDC, affiliation by side (3=friend/BLUE, 6=hostile/RED,
// 1=unknown), land-unit symbol set. Mirrors port-wargame.js buildSidc layout:
//   10 + 0(context) + aff + ss(2) + 0(status) + 0(HQ) + amp(2) + icon(6) + m1(2) + m2(2)
function sidcForSide(side) {
    const s   = String(side || '').toUpperCase();
    const aff = s === 'BLUE' ? '3' : s === 'RED' ? '6' : '1';
    return '10' + '0' + aff + '10' + '0' + '0' + '00' + '000000' + '00' + '00';
}

// Great-circle distance (km, 1 dp) between two [lon,lat] points.
function haversineKm(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return null;
    const toRad = d => d * Math.PI / 180;
    const R = 6371;
    const dLat = toRad(b[1] - a[1]), dLon = toRad(b[0] - a[0]);
    const h = Math.pow(Math.sin(dLat / 2), 2) +
        Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.pow(Math.sin(dLon / 2), 2);
    return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))) * 10) / 10;
}

// Pull the first signed number out of a DP time_label ("D-2h"→-2, "D+6h"→6,
// "H+0"→0); fall back to the step index for labels like "PRE-H".
function parseHoursFromLabel(label, fallback) {
    const m = String(label || '').match(/([+-]?\d+(?:\.\d+)?)/);
    if (m) { const n = parseFloat(m[1]); if (Number.isFinite(n)) return n; }
    return fallback;
}

// Map a Decision Package objective_status onto the RMOOZ adjudicator enum
// [DORMANT|THREATENED|CONTESTED|CAPTURED|DENIED]. DP uses a mission-oriented
// vocabulary (OPEN/READY/IN_PROGRESS/COMPLETE/SECURE/HELD/...) — collapse it.
function mapObjectiveStatus(v) {
    const s = String(v || '').toUpperCase().trim();
    const M = {
        DORMANT: 'DORMANT', OPEN: 'DORMANT', READY: 'DORMANT', WATCHED: 'DORMANT',
        IDLE: 'DORMANT', QUIET: 'DORMANT',
        THREATENED: 'THREATENED', AT_RISK: 'THREATENED', 'AT-RISK': 'THREATENED',
        CONTESTED: 'CONTESTED', IN_PROGRESS: 'CONTESTED', ENGAGED: 'CONTESTED', ACTIVE: 'CONTESTED',
        CAPTURED: 'CAPTURED', SEIZED: 'CAPTURED', TAKEN: 'CAPTURED', FALLEN: 'CAPTURED', LOST: 'CAPTURED',
        DENIED: 'DENIED', HELD: 'DENIED', SECURE: 'DENIED', SECURED: 'DENIED',
        COMPLETE: 'DENIED', REPELLED: 'DENIED',
    };
    return M[s] || 'DORMANT';
}

// Load a Decision Package folder into { manifest, steps[], dir }.
function loadDecisionPackage(dir) {
    const manifestPath = path.join(dir, 'scenario_manifest.json');
    if (!fs.existsSync(manifestPath)) {
        throw new Error('Not a Decision Package (no scenario_manifest.json): ' + dir);
    }
    const manifest = readJson(manifestPath);
    const stepsDir = path.join(dir, 'steps');
    let steps = [];
    if (fs.existsSync(stepsDir)) {
        steps = fs.readdirSync(stepsDir)
            .filter(f => STEP_RE.test(f))
            .map(f => readJson(path.join(stepsDir, f)));
        steps.sort((a, b) => (a.step_index || 0) - (b.step_index || 0));
    }
    return { manifest, steps, dir };
}

// Pure converter: Decision Package object → RMOOZ scenario object.
function buildScenarioFromDecisionPackage(pkg, opts) {
    opts = opts || {};
    const m     = pkg.manifest || {};
    const steps = Array.isArray(pkg.steps) ? pkg.steps : [];
    const nSteps = steps.length;

    // ── Units: stable uid across steps → per-side lists + per-step coords ──
    const meta       = {};   // uid → { uid, side, name, role, firstStep, firstCoord }
    const stepCoords = {};   // uid → [ [lon,lat] | null ] length nSteps
    steps.forEach((st, si) => {
        (st.units || []).forEach(u => {
            if (!u || !u.uid) return;
            if (!meta[u.uid]) {
                meta[u.uid] = {
                    uid:       u.uid,
                    side:      String(u.side || '').toUpperCase(),
                    name:      u.name || u.uid,
                    role:      u.role || 'unit',
                    firstStep: si,
                    firstCoord: Array.isArray(u.position) ? u.position.slice() : null,
                };
                stepCoords[u.uid] = new Array(nSteps).fill(null);
            }
            if (Array.isArray(u.position)) stepCoords[u.uid][si] = u.position.slice();
        });
    });
    // Carry-forward fill: a unit absent in a step keeps its last known position
    // (and back-fills its first-known position for steps before it appears).
    Object.keys(stepCoords).forEach(uid => {
        const arr = stepCoords[uid];
        let last = meta[uid].firstCoord || [0, 0];
        for (let i = 0; i < nSteps; i++) {
            if (arr[i] == null) arr[i] = last.slice ? last.slice() : last;
            else last = arr[i];
        }
    });

    const red_units = [], blue_units_initial = [];
    const red_unit_step_coords = {}, blue_unit_step_coords = {};
    Object.keys(meta).forEach(uid => {
        const u = meta[uid];
        const coord = u.firstCoord || (stepCoords[uid] && stepCoords[uid][0]) || [0, 0];
        if (u.side === 'RED') {
            red_units.push({
                uid: u.uid, label: u.name, role: u.role, domain: 'ground',
                echelon: 'unit', sidc: sidcForSide('RED'), coord: coord,
                name_ar: u.name, appear: u.firstStep, bls: 'BLS-1',
            });
            red_unit_step_coords[u.uid] = stepCoords[uid];
        } else {
            // Everything not explicitly RED is treated as BLUE-side (friendly).
            blue_units_initial.push({
                unit_uid: u.uid, base_id: u.uid, label: u.name, role: u.role,
                domain: 'ground', echelon: 'unit', sidc: sidcForSide('BLUE'),
                coord: coord, posture: null, name_ar: u.name, appear: u.firstStep,
            });
            blue_unit_step_coords[u.uid] = stepCoords[uid];
        }
    });

    // ── Steps ──
    const outSteps = steps.map((st, si) => {
        const sit = st.situation || {};
        const dp  = st.decision_point || {};
        const opt = Array.isArray(st.options) ? st.options : [];
        const res = st.result || {};
        return {
            index:                     (typeof st.step_index === 'number' ? st.step_index : si),
            step_id:                   st.step_id || ('step' + String(si).padStart(2, '0')),
            time_label:                st.time_label || ('STEP ' + si),
            elapsed_hours:             parseHoursFromLabel(st.time_label, si),
            phase:                     st.phase || ('PHASE-' + si),
            // narratives — recognized names + wargame3 fallback names
            narrative_en:              sit.summary_en || '',
            narrative_ar:              sit.summary_ar || '',
            narrative_en_fallback:     sit.summary_en || '',
            narrative_ar_fallback:     sit.summary_ar || '',
            situation:                 { summary_en: sit.summary_en || '', summary_ar: sit.summary_ar || '' },
            objective_status_baseline: mapObjectiveStatus(st.objective_status),
            objective_status_source:   st.objective_status || null,
            // Refinement 1: decision point + options (decision card reads step.decisionOptions)
            decision_point_baseline:    dp.question_en || null,
            decision_point_ar_baseline: dp.question_ar || null,
            decisionOptions: opt.map(o => ({
                id:          String(o.id || ''),
                label:       String(o.text_en || o.text_ar || ''),
                description: String(o.text_ar || ''),
                intent:      o.risk ? ('Risk: ' + String(o.risk)) : '',
                source:      'source_json',
            })),
            // Refinement 2: source_trace (provenance per step)
            source_trace: st.source_trace || null,
            // Refinement 3: per-step image reference (display-only path into the package)
            image_ref: (st.source_trace && st.source_trace.source_image) ||
                       ('images/step' + String(si).padStart(2, '0') + '.png'),
            // Display-only context
            friendly_forces_summary: st.friendly_forces_summary || null,
            enemy_forces_summary:    st.enemy_forces_summary || null,
            result_en:               res.effect_en || null,
            result_ar:               res.effect_ar || null,
            n_units:                 (st.units || []).length,
        };
    });

    const phase_table = outSteps.map(s => ({
        index: s.index, phase: s.phase, time_label: s.time_label, elapsed_hours: s.elapsed_hours,
    }));

    // ── Geometry the strict scenario schema requires but the DP lacks ──
    // Synthesized + clearly marked: DP packages carry no BLS, pipeline, or
    // objective depth/CARVER. These satisfy scenario-validator's [1..8] BLS /
    // [2..64] pipeline / obj.target_depth_km+carver requirements.
    const _bbox = (Array.isArray(m.map_bbox) && m.map_bbox.length >= 4) ? m.map_bbox : null;
    const _sw = _bbox ? [_bbox[0], _bbox[1]] : [0, 0];
    const _ne = _bbox ? [_bbox[2], _bbox[3]] : [0, 0];
    const _center = _bbox ? [(_bbox[0] + _bbox[2]) / 2, (_bbox[1] + _bbox[3]) / 2] : [0, 0];
    const objCoord = (m.objective && m.objective.position) ? m.objective.position : _ne;

    const pipeStart = (red_units[0] && red_units[0].coord) || _sw;
    let pipeline = [pipeStart, objCoord];
    if (pipeStart[0] === objCoord[0] && pipeStart[1] === objCoord[1]) pipeline = [_sw, _ne];

    let targetDepth = haversineKm(pipeStart, objCoord);
    if (!Number.isFinite(targetDepth) || targetDepth <= 0) targetDepth = 50;

    const obj = {
        name: (m.objective && (m.objective.name || m.objective.id)) || 'Objective',
        coord: objCoord,
        target_depth_km: targetDepth,
        carver: 30,
        radius_km: 5,
    };

    // One synthesized BLS placeholder (schema requires 1..8; DP has none).
    const blsCoord = (blue_units_initial[0] && blue_units_initial[0].coord) || _center;
    const bls_template = [{
        name: 'BLS-1', coord: blsCoord,
        role: 'Synthesized support site (Decision Package carries no BLS)',
        capacity: 'Medium', throughput: 1, terrain_friction: 1, permanently_limited: false,
    }];

    const sides = (m.sides && typeof m.sides === 'object')
        ? Object.keys(m.sides).map(k => ({
            id: k, name_en: m.sides[k].label_en, name_ar: m.sides[k].label_ar, role: m.sides[k].role }))
        : null;

    const scenarioId = String(opts.name || m.scenario_id || 'decision-package')
        .replace(/[^A-Za-z0-9._-]+/g, '_').toLowerCase().slice(0, 64) || 'decision-package';

    return {
        name:               scenarioId,
        scenario_id:        scenarioId,
        scenario_label:     m.scenario_title_en || m.scenario_id || scenarioId,
        purpose_en:         m.scenario_title_en || '',
        purpose_ar:         m.scenario_title_ar || '',
        map_bbox:           m.map_bbox || null,
        obj:                obj,
        sides:              sides,
        pipeline:           pipeline,
        red_units:          red_units,
        red_unit_step_coords:  red_unit_step_coords,
        blue_units_base_ids:   blue_units_initial.map(b => b.base_id),
        blue_units_initial:    blue_units_initial,
        blue_unit_step_coords: blue_unit_step_coords,
        blue_units_source:  'derived from Decision Package per-step units[]',
        off_map_markers:    [],
        ao_boundaries:      [],
        bls_template:       bls_template,
        nominal_throughput: null,
        phase_table:        phase_table,
        steps:              outSteps,
        schema_variant:     'decision-package-v1',
        // Refinement 2: provenance (NOT an unsafe key — display/audit only)
        converted_from: {
            type:        'decision_package',
            scenario_id: m.scenario_id || null,
            title_en:    m.scenario_title_en || null,
            title_ar:    m.scenario_title_ar || null,
            source_dir:  path.basename(pkg.dir || ''),
            total_steps: nSteps,
        },
        converted_at: opts.stampedAt || null,
    };
}

function writeScenario(scenario, opts) {
    opts = opts || {};
    if (!fs.existsSync(SCENARIOS)) fs.mkdirSync(SCENARIOS, { recursive: true });
    const base = scenario.name;
    let target = path.join(SCENARIOS, base + '.json');
    // Refinement 4: overwrite protection
    if (fs.existsSync(target) && !opts.force) {
        const suffixed = base + '-from-dp';
        target = path.join(SCENARIOS, suffixed + '.json');
        scenario.name = suffixed;
        scenario.scenario_id = suffixed;
        console.warn('[convert-dp] ' + base + '.json already exists — writing ' +
                     suffixed + '.json instead. Pass --force to overwrite ' + base + '.json.');
    }
    fs.writeFileSync(target, JSON.stringify(scenario, null, 2));
    return target;
}

// ── CLI ──
if (require.main === module) {
    const args  = process.argv.slice(2);
    const force = args.includes('--force');
    const nameIdx = args.indexOf('--name');
    const nameArg = nameIdx >= 0 ? args[nameIdx + 1] : null;
    const dirArg  = args.filter((a, i) =>
        a.indexOf('--') !== 0 && i !== (nameIdx >= 0 ? nameIdx + 1 : -1))[0];

    if (!dirArg) {
        console.error('Usage: node UI_MOdified/scripts/convert-decision-package.js <DP_folder> [--name <id>] [--force]');
        process.exit(1);
    }
    const dir = path.resolve(dirArg);
    let pkg;
    try { pkg = loadDecisionPackage(dir); }
    catch (e) { console.error(String(e.message || e)); process.exit(1); }

    if (!pkg.steps.length) {
        console.error('[convert-dp] no steps/stepNN.json found in ' + dir);
        process.exit(1);
    }

    const scenario = buildScenarioFromDecisionPackage(pkg, { name: nameArg });
    const out = writeScenario(scenario, { force: force });
    console.log('Converted Decision Package → ' + out);
    console.log('  scenario_id:   ' + scenario.scenario_id);
    console.log('  steps:         ' + scenario.steps.length);
    console.log('  red_units:     ' + scenario.red_units.length);
    console.log('  blue_units:    ' + scenario.blue_units_initial.length);
    console.log('  objective:     ' + (scenario.obj && scenario.obj.name));
    console.log('  bbox:          ' + JSON.stringify(scenario.map_bbox));
}

module.exports = { loadDecisionPackage, buildScenarioFromDecisionPackage, writeScenario, sidcForSide };
