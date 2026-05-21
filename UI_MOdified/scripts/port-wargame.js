#!/usr/bin/env node
/**
 * Generic wargame folder → scenario JSON porter.
 *
 * Drop a `WargameN/` folder anywhere under UI_MOdified/ with:
 *   step00.geojson … stepNN.geojson   (N+1 = number of steps, 4..20)
 *   wargame.meta.json                 (optional — overrides + non-derivable fields)
 *
 * Then run:
 *   node UI_MOdified/scripts/port-wargame.js                 ports every Wargame folder
 *   node UI_MOdified/scripts/port-wargame.js Wargame3        ports just one folder
 *   node UI_MOdified/scripts/port-wargame.js path/to/folder  any path
 *
 * Output: UI_MOdified/data/scenarios/<name>.json, where <name> comes from
 * wargame.meta.json or defaults to the lowercased folder name.
 *
 * The porter derives everything it can from the step geojsons:
 *   - OBJ (Point feature whose name starts with "OBJ ")
 *   - pipeline route (LineString feature)
 *   - BLS template (Point features named "BLS-N")
 *   - AO boundaries (Polygon/MultiPolygon features with app.autoFlank metadata)
 *   - Red OOB (union of RED-side Point features across all steps)
 *   - Blue starting positions (BLUE-side Point features in step00)
 *   - phase_table (one row per step, from step metadata)
 *   - per-step baselines (phase_line_km, objective_status, bls_status,
 *     narratives, losses, red-degraded, blue-destroyed, etc.)
 *
 * The optional wargame.meta.json sidecar provides:
 *   - name, scenario_label, model_version
 *   - throughput_ceilings_km, nominal_throughput, terrain_note
 *   - regression_expect (item #10 — final-state assertions for tests)
 *   - red_units overrides (e.g. units missing from geojsons, role/bls fixes)
 *   - narrative_ar_per_step (fallback strings if metadata.narrative_ar is empty)
 *   - any top-level field you want to override
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT       = path.join(__dirname, '..');
const SCENARIOS  = path.join(ROOT, 'data', 'scenarios');

const STEP_RE   = /^step(\d{2,3})\.geojson$/i;
const BLS_RE    = /^BLS-\d+$/i;
const OBJ_RE    = /^OBJ\b/i;

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readJsonOptional(file) {
    if (!fs.existsSync(file)) return null;
    try { return readJson(file); } catch (e) {
        console.warn(`[port-wargame] could not parse ${file}: ${e.message}`);
        return null;
    }
}

function unique(list) {
    const seen = new Set();
    const out = [];
    for (const x of list) {
        if (!seen.has(x)) { seen.add(x); out.push(x); }
    }
    return out;
}

function listStepFiles(folder) {
    const files = fs.readdirSync(folder)
        .filter(f => STEP_RE.test(f))
        .map(f => ({ file: f, idx: parseInt(f.match(STEP_RE)[1], 10) }))
        .sort((a, b) => a.idx - b.idx);
    if (!files.length) {
        throw new Error(`no step*.geojson files found in ${folder}`);
    }
    // Verify the sequence is dense from 0..N-1 (no gaps).
    for (let i = 0; i < files.length; i++) {
        if (files[i].idx !== i) {
            throw new Error(`step file sequence has a gap at step${String(i).padStart(2, '0')} in ${folder}`);
        }
    }
    return files.map(f => path.join(folder, f.file));
}

// ── Geometry extractors ─────────────────────────────────────────────

function extractObj(step0) {
    const obj = step0.features.find(f =>
        f && f.geometry && f.geometry.type === 'Point'
          && f.properties && OBJ_RE.test(f.properties.name || ''));
    if (!obj) return null;
    const p = obj.properties;
    const carver = (p.carver_assessment && Number.isFinite(p.carver_assessment.total))
        ? p.carver_assessment.total
        : (Number.isFinite(p.carver) ? p.carver : null);
    return {
        name:             p.name,
        coord:            obj.geometry.coordinates,
        target_depth_km:  Number.isFinite(p.depth_from_coast_km) ? p.depth_from_coast_km
                          : Number.isFinite(p.target_depth_km)   ? p.target_depth_km
                          : null,
        radius_km:        Number.isFinite(p.radius_km) ? p.radius_km : 5.0,
        carver:           carver,
        carver_assessment: p.carver_assessment || null,
    };
}

function extractPipeline(step0) {
    // Prefer a LineString whose name contains "pipeline"; otherwise first LineString.
    const named = step0.features.find(f =>
        f && f.geometry && f.geometry.type === 'LineString'
          && f.properties && /pipeline/i.test(f.properties.name || ''));
    const line = named || step0.features.find(f => f && f.geometry && f.geometry.type === 'LineString');
    if (!line) return [];
    return line.geometry.coordinates;
}

function extractAoBoundaries(step0) {
    return step0.features
        .filter(f => f && f.geometry
                  && (f.geometry.type === 'MultiPolygon' || f.geometry.type === 'Polygon')
                  && f.properties && f.properties.app && f.properties.app.autoFlank
                  && f.properties.app.autoFlank.areaRole)
        .map(f => ({
            type:        f.geometry.type,
            coordinates: f.geometry.coordinates,
            role:        f.properties.app.autoFlank.areaRole,
            tag:         f.properties.app.autoFlank.tag || null,
            lengthKm:    f.properties.app.autoFlank.lengthKm || null,
        }));
}

function extractBlsTemplate(step0, blsSelectionJson) {
    // Prefer bls_selection.geojson (W2-style — has richer doctrine props), else
    // fall back to BLS-N point features inside step00.
    const source = blsSelectionJson || step0;
    const features = source.features.filter(f =>
        f && f.geometry && f.geometry.type === 'Point'
          && f.properties && BLS_RE.test(f.properties.name || ''));
    // De-dupe by name (step00 may also contain the BLS points alongside selection).
    const byName = new Map();
    for (const f of features) {
        if (!byName.has(f.properties.name)) byName.set(f.properties.name, f);
    }
    const sorted = [...byName.values()].sort((a, b) =>
        (a.properties.name || '').localeCompare(b.properties.name || ''));
    return sorted.map(f => {
        const p = f.properties;
        return {
            name:                 p.name,
            coord:                f.geometry.coordinates,
            role:                 p.role || null,
            capacity:             p.capacity || null,
            throughput:           Number.isFinite(p.throughput_factor) ? p.throughput_factor
                                  : Number.isFinite(p.throughput) ? p.throughput : null,
            terrain_friction:     Number.isFinite(p.terrain_friction) ? p.terrain_friction : null,
            score:                Number.isFinite(p.score) ? p.score
                                  : Number.isFinite(p.candidate_score) ? p.candidate_score : null,
            nearest_blue_uid:     p.nearest_blue_uid || null,
            nearest_blue_km:      Number.isFinite(p.nearest_blue_km) ? p.nearest_blue_km : null,
            permanently_limited:  p.permanently_limited === true,
        };
    });
}

function deriveBbox(allSteps, padDeg = 0.05) {
    let minLon = +Infinity, minLat = +Infinity;
    let maxLon = -Infinity, maxLat = -Infinity;
    const visit = (geom) => {
        if (!geom) return;
        const t = geom.type;
        const c = geom.coordinates;
        if (t === 'Point') {
            const [x, y] = c;
            if (Number.isFinite(x) && Number.isFinite(y)) {
                if (x < minLon) minLon = x; if (x > maxLon) maxLon = x;
                if (y < minLat) minLat = y; if (y > maxLat) maxLat = y;
            }
        } else if (t === 'LineString' || t === 'MultiPoint') {
            for (const pt of c) visit({ type: 'Point', coordinates: pt });
        } else if (t === 'Polygon' || t === 'MultiLineString') {
            for (const ring of c) for (const pt of ring) visit({ type: 'Point', coordinates: pt });
        } else if (t === 'MultiPolygon') {
            for (const poly of c) for (const ring of poly) for (const pt of ring) visit({ type: 'Point', coordinates: pt });
        }
    };
    for (const step of allSteps) {
        for (const f of step.features) visit(f.geometry);
    }
    if (!Number.isFinite(minLon)) return null;
    return [
        +(minLon - padDeg).toFixed(4),
        +(minLat - padDeg).toFixed(4),
        +(maxLon + padDeg).toFixed(4),
        +(maxLat + padDeg).toFixed(4),
    ];
}

// ── OOB extraction (Red + Blue) ─────────────────────────────────────

function extractBlueInitial(step0) {
    return step0.features
        .filter(f => f && f.geometry && f.geometry.type === 'Point'
                  && f.properties && f.properties.side === 'BLUE')
        .map(f => {
            const p = f.properties;
            return {
                unit_uid: p.unit_uid,
                base_id:  p.id || (p.unit_uid || '').replace(/^BLUE_/, ''),
                echelon:  p.echelon || null,
                sidc:     p.sidc || null,
                coord:    f.geometry.coordinates,
                posture:  p.posture || null,
            };
        })
        .filter(b => b.unit_uid);
}

// Build the Red OOB by unioning all RED features across all steps. The
// `appear` field is the first step index where a unit's status is no
// longer 'STAGED'/'HIDDEN'. Defaults to 1 if always active.
function extractRedUnits(stepJsons) {
    const byUid = new Map();   // uid → { uid, label, echelon, role, bls, coord, sidc, appear, status_history }

    for (let i = 0; i < stepJsons.length; i++) {
        const step = stepJsons[i];
        for (const f of step.features) {
            if (!f || !f.geometry || f.geometry.type !== 'Point') continue;
            const p = f.properties;
            if (!p || p.side !== 'RED' || !p.unit_uid) continue;

            let rec = byUid.get(p.unit_uid);
            if (!rec) {
                rec = {
                    uid:     p.unit_uid,
                    label:   p.id || p.label || p.unit_uid,
                    echelon: p.echelon || null,
                    role:    p.role || null,
                    bls:     p.assigned_bls || p.bls || null,
                    sidc:    p.sidc || null,
                    coord:   f.geometry.coordinates,
                    appear:  null,
                    _statuses: [],
                };
                byUid.set(p.unit_uid, rec);
            }
            // Use step00 coords if available; otherwise first-seen coord wins.
            if (i === 0) rec.coord = f.geometry.coordinates;
            rec._statuses[i] = p.status || null;

            // First step where status is "active" (anything other than STAGED/HIDDEN).
            const s = (p.status || '').toUpperCase();
            const isLive = s && s !== 'STAGED' && s !== 'HIDDEN' && s !== 'PLANNED';
            if (isLive && rec.appear == null) rec.appear = i;
        }
    }

    const out = [];
    for (const rec of byUid.values()) {
        out.push({
            uid:     rec.uid,
            label:   rec.label,
            echelon: rec.echelon,
            role:    rec.role,
            bls:     rec.bls,
            sidc:    rec.sidc,
            coord:   rec.coord,
            appear:  rec.appear == null ? 1 : rec.appear,
        });
    }
    // Stable order: by appear, then uid.
    out.sort((a, b) => (a.appear - b.appear) || a.uid.localeCompare(b.uid));
    return out;
}

// ── Per-step baseline ───────────────────────────────────────────────

function extractStepBaseline(stepJson, stepIndex, narrativeOverrideAr) {
    const md = stepJson.metadata || {};

    const blueDestroyed = stepJson.features
        .filter(f => f && f.geometry && f.geometry.type === 'Point'
                  && f.properties && f.properties.side === 'BLUE'
                  && f.properties.status && f.properties.status !== 'ACTIVE')
        .map(f => f.properties.unit_uid)
        .filter(Boolean);

    const redDegraded = stepJson.features
        .filter(f => f && f.geometry && f.geometry.type === 'Point'
                  && f.properties && f.properties.side === 'RED'
                  && (f.properties.status === 'DEGRADED'
                      || (Number.isFinite(f.properties.strength_current)
                          && f.properties.strength_current < 1.0)))
        .map(f => f.properties.unit_uid)
        .filter(Boolean);

    const redStrengthBaseline = {};
    for (const f of stepJson.features) {
        if (f && f.properties && f.properties.side === 'RED' && f.properties.unit_uid) {
            redStrengthBaseline[f.properties.unit_uid] =
                Number.isFinite(f.properties.strength_current) ? f.properties.strength_current
                : redDegraded.includes(f.properties.unit_uid) ? 0.7
                : 1.0;
        }
    }

    const losses = md.losses_cumulative || {};
    const arFromMd = md.narrative_ar || '';

    return {
        index:                          stepIndex,
        time_label:                     md.time_label,
        elapsed_hours:                  md.elapsed_hours,
        phase:                          md.phase,
        phase_line_km_baseline:         md.phase_line_km,
        objective_status_baseline:      md.objective_status,
        decision_point_baseline:        md.decision_point,
        force_ratio_baseline:           md.force_ratio,
        ew_effect_baseline:             md.ew_effect,
        mobility_state_baseline:        md.mobility_state || null,
        logistics_state_baseline:      md.logistics_state,
        narrative_en_fallback:          md.narrative_en || '',
        narrative_ar_fallback:          arFromMd || narrativeOverrideAr || '',
        bls_status_baseline:            md.bls_status,
        blue_destroyed_baseline:        unique(blueDestroyed),
        blue_destroyed_count_baseline:  blueDestroyed.length,
        red_losses_cumulative_baseline: losses.red_company_equivalent != null ? losses.red_company_equivalent : 0,
        red_degraded_baseline:          unique(redDegraded),
        red_strength_baseline:          redStrengthBaseline,
        red_active_markers_baseline:    md.red_active_markers,
    };
}

function buildPhaseTable(stepJsons) {
    return stepJsons.map((s, i) => {
        const md = s.metadata || {};
        return {
            index:         i,
            time_label:    md.time_label,
            elapsed_hours: md.elapsed_hours,
            phase:         md.phase,
        };
    });
}

// Clamp permanently_limited BLSs back to LIMITED when a baseline marks
// them SECURE (data bug, not doctrine). Mirrors the W1 porter's behavior.
function enforcePermanentlyLimited(steps, blsTemplate) {
    const limitedNames = new Set(blsTemplate.filter(b => b.permanently_limited).map(b => b.name));
    if (!limitedNames.size) return [];
    const log = [];
    for (const step of steps) {
        if (!step.bls_status_baseline) continue;
        for (const name of limitedNames) {
            if (step.bls_status_baseline[name] === 'SECURE') {
                step.bls_status_baseline[name] = 'LIMITED';
                log.push(`  step ${step.index}: ${name} SECURE → LIMITED (permanently_limited)`);
            }
        }
    }
    return log;
}

// ── W4-shape (kind-based, no metadata block) ───────────────────────
// Wargame4-style folders carry a different model: features have a `kind`
// property (objective / actor_unit / affected_unit / phase_line), each
// feature has its own `phase` integer, and the step files have no
// top-level `metadata` block. There are no BLSs, no persistent OOB
// roster, and no pipeline route.
//
// We map this onto the scenario schema with synthesized placeholders so
// the file passes validation and renders. The adjudicator-driven numbers
// (PL km, casualties, EW) are doctrinally meaningless on this scenario —
// it's a viewer, not a simulation. This is option B from the conversation.

function isW4Shape(stepJsons) {
    const s0 = stepJsons[0];
    if (!s0 || !Array.isArray(s0.features) || !s0.features.length) return false;
    const noMetadata = !s0.metadata || Object.keys(s0.metadata).length === 0;
    const hasKind = s0.features.some(f => f && f.properties && typeof f.properties.kind === 'string');
    return noMetadata && hasKind;
}

// Heuristic phase grouping for the 17-phase strike model:
//   0..4 PRE-H, 5..7 PHASE 1, 8..10 PHASE 2A, 11..12 PHASE 2B,
//   13..15 PHASE 3, 16 RESOLUTION.
// For longer/shorter scenarios, the cutoffs scale by stepCount / 17.
function w4PhaseLabel(stepIndex, stepCount) {
    const t = stepIndex / Math.max(1, stepCount - 1); // 0..1
    if (t < 5 / 16) return 'PRE-H';
    if (t < 8 / 16) return 'PHASE 1';
    if (t < 11 / 16) return 'PHASE 2A';
    if (t < 13 / 16) return 'PHASE 2B';
    if (t < 16 / 16) return 'PHASE 3';
    return 'RESOLUTION';
}

// Parse a time_label like "D-H", "D+2h", "D+144h", "P0" into hours.
function parseElapsedHours(label, stepIndex) {
    if (!label) return (stepIndex - 5) * 6; // synthetic; pre-H is negative
    const m = String(label).match(/^D([+-])(\d+)h?$/i);
    if (m) return (m[1] === '-' ? -1 : 1) * parseInt(m[2], 10);
    if (/^D-H$/i.test(label)) return 0;
    return (stepIndex - 5) * 6;
}

function shortenLabel(s, max = 60) {
    if (!s) return '';
    const t = String(s).replace(/\s+/g, ' ').trim();
    return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function buildW4Scenario(stepJsons, folderName, meta) {
    const stepCount = stepJsons.length;
    const defaultName = folderName.toLowerCase();

    // Per-step phase_line index (the LineString feature with kind=phase_line
    // belonging to step i, if any).
    const phaseLineByStep = {};
    for (let i = 0; i < stepCount; i++) {
        const pl = stepJsons[i].features.find(f => f && f.properties && f.properties.kind === 'phase_line');
        if (pl) phaseLineByStep[i] = pl;
    }

    // OBJ from step00's objective feature.
    const objFeat = stepJsons[0].features.find(f => f && f.properties && f.properties.kind === 'objective');
    const obj = objFeat ? {
        name:            objFeat.properties.name_en || objFeat.properties.id || 'OBJ',
        coord:           objFeat.geometry.coordinates,
        target_depth_km: Number.isFinite(objFeat.properties.depth_km_from_coast)
                            ? objFeat.properties.depth_km_from_coast : 50,
        radius_km:       5.0,
        carver:          30, // placeholder; W4 source has no CARVER score
    } : null;

    // Pipeline: concatenate every phase_line LineString in step order. Each
    // phase_line has 2 points, so phase_line_count*2 pipeline points total.
    // Validator wants 2..64; W4 typically has ~12 phase_lines = 24 points. OK.
    const pipeline = [];
    for (let i = 0; i < stepCount; i++) {
        const pl = phaseLineByStep[i];
        if (pl && pl.geometry && Array.isArray(pl.geometry.coordinates)) {
            for (const c of pl.geometry.coordinates) pipeline.push(c);
        }
    }
    // Cap at 64 to stay within validator bounds (drop overflow from the middle).
    while (pipeline.length > 64) pipeline.splice(Math.floor(pipeline.length / 2), 1);
    // Ensure at least 2 points: fall back to a 2-point line at OBJ if all phases lacked phase_lines.
    if (pipeline.length < 2 && obj) {
        pipeline.push([obj.coord[0] - 0.1, obj.coord[1]]);
        pipeline.push(obj.coord);
    }

    // BLS: synthesize one dummy "BLS-1" at the OBJ coord (or origin).
    const blsTemplate = [{
        name:                'BLS-1',
        coord:               obj ? obj.coord : [0, 0],
        role:                'Synthetic anchor (W4 has no BLS concept)',
        capacity:            'Medium',
        throughput:          1.0,
        terrain_friction:    1.0,
        permanently_limited: false,
    }];

    // OOB: union actor_unit + affected_unit across all steps, grouped by uid.
    const oobByUid = new Map(); // uid → { side, name_ar, type, domain, coord, firstStep }
    for (let i = 0; i < stepCount; i++) {
        for (const f of stepJsons[i].features) {
            const p = f && f.properties;
            if (!p || (p.kind !== 'actor_unit' && p.kind !== 'affected_unit')) continue;
            if (!p.uid) continue;
            if (!oobByUid.has(p.uid)) {
                oobByUid.set(p.uid, {
                    uid:       p.uid,
                    side:      p.side || 'RED',
                    label:     shortenLabel(p.name_ar || p.name_en || p.uid),
                    type:      p.type || 'unit',
                    domain:    p.domain || 'land',
                    coord:     f.geometry && f.geometry.coordinates,
                    firstStep: i,
                });
            }
        }
    }

    const redUnits = [];
    const blueInitial = [];
    for (const u of oobByUid.values()) {
        if (u.side === 'RED') {
            redUnits.push({
                uid:     u.uid,
                label:   u.label,
                echelon: 'support',
                role:    u.type,
                bls:     'BLS-1',
                coord:   u.coord || (obj ? obj.coord : [0, 0]),
                appear:  Math.max(1, u.firstStep || 1),
            });
        } else {
            blueInitial.push({
                unit_uid: u.uid,
                base_id:  u.uid.replace(/^B-/, '').replace(/[^\w-]/g, '_'),
                echelon:  'support',
                sidc:     null,
                coord:    u.coord || (obj ? obj.coord : [0, 0]),
                posture:  null,
            });
        }
    }
    // Validator requires at least 1 red and 1 blue. If a side is empty,
    // synthesize a single placeholder so the file loads.
    if (!redUnits.length) {
        redUnits.push({ uid: 'RED_PLACEHOLDER', label: 'placeholder', echelon: 'support',
                        role: 'unknown', bls: 'BLS-1', coord: pipeline[0] || [0, 0], appear: 1 });
    }
    if (!blueInitial.length) {
        blueInitial.push({ unit_uid: 'BLUE_PLACEHOLDER', base_id: 'PLACEHOLDER', echelon: 'support',
                           sidc: null, coord: pipeline[pipeline.length - 1] || [0, 0], posture: null });
    }

    // Per-step baselines.
    const steps = [];
    const phaseTable = [];
    let prevPl = 0;
    for (let i = 0; i < stepCount; i++) {
        const pl = phaseLineByStep[i];
        const time_label = (pl && pl.properties && pl.properties.time_label) || `P${i}`;
        const elapsed_hours = parseElapsedHours(time_label, i);
        const phaseEnum = w4PhaseLabel(i, stepCount);
        const plKm = (pl && pl.properties && Number.isFinite(pl.properties.phase_line_km))
                    ? pl.properties.phase_line_km : prevPl;
        prevPl = plKm;

        phaseTable.push({ index: i, time_label, elapsed_hours, phase: phaseEnum });

        // Objective status progression — DORMANT until phase lines start,
        // THREATENED/CONTESTED while advancing, CAPTURED/DENIED at the end.
        let objStatus;
        if (i < 5)                        objStatus = 'DORMANT';
        else if (i < Math.floor(stepCount * 0.7)) objStatus = 'THREATENED';
        else if (i < stepCount - 1)       objStatus = 'CONTESTED';
        else {
            const targetKm = obj && Number.isFinite(obj.target_depth_km) ? obj.target_depth_km : 100;
            objStatus = plKm >= targetKm * 0.9 ? 'CAPTURED' : 'DENIED';
        }

        // Affected uids in this step → treat damaged BLUE as blue_destroyed,
        // damaged RED as red_degraded. Status_change values include
        // damaged_partial, damaged_heavy, destroyed, etc.
        const blueDestroyed = [];
        const redDegraded = [];
        const arNarratives = [];
        for (const f of stepJsons[i].features) {
            const p = f && f.properties; if (!p) continue;
            if (p.kind === 'affected_unit' && p.uid) {
                const damaged = p.status_change && p.status_change !== 'ok' && p.status_change !== 'staged';
                if (damaged) {
                    if (p.side === 'BLUE') blueDestroyed.push(p.uid);
                    else if (p.side === 'RED') redDegraded.push(p.uid);
                }
            }
            if (p.name_ar) arNarratives.push(p.name_ar);
        }

        steps.push({
            index:                          i,
            time_label,
            elapsed_hours,
            phase:                          phaseEnum,
            phase_line_km_baseline:         plKm,
            objective_status_baseline:      objStatus,
            decision_point_baseline:        null,
            force_ratio_baseline:           null,
            ew_effect_baseline:             null,
            mobility_state_baseline:        null,
            logistics_state_baseline:       null,
            narrative_en_fallback:          '',
            narrative_ar_fallback:          arNarratives.slice(0, 3).join(' · '),
            bls_status_baseline:            { 'BLS-1': 'SECURE' },
            blue_destroyed_baseline:        unique(blueDestroyed),
            blue_destroyed_count_baseline:  unique(blueDestroyed).length,
            red_losses_cumulative_baseline: 0,
            red_degraded_baseline:          unique(redDegraded),
            red_strength_baseline:          {},
            red_active_markers_baseline:    null,
        });
    }

    const bbox = deriveBbox(stepJsons);

    return {
        name:                meta.name || defaultName,
        model_version:       meta.model_version || `${defaultName}-v1.0`,
        scenario_label:      meta.scenario_label || `${folderName} (W4 strike model — synthesized BLS placeholder)`,
        map_bbox:            meta.map_bbox || bbox,
        obj:                 meta.obj || obj,
        pipeline:            (meta.pipeline && meta.pipeline.length) ? meta.pipeline : pipeline,
        red_units:           redUnits,
        blue_units_base_ids: meta.blue_units_base_ids || blueInitial.map(b => b.base_id),
        blue_units_initial:  blueInitial,
        blue_units_source:   'derived from W4 step features (actor_unit + affected_unit)',
        ao_boundaries:       [],
        bls_template:        blsTemplate,
        nominal_throughput:  meta.nominal_throughput || null,
        phase_table:         phaseTable,
        throughput_ceilings_km: meta.throughput_ceilings_km || null,
        terrain_note:        meta.terrain_note || 'W4 strike model: BLS/pipeline are synthesized placeholders. Adjudicator-driven numbers are not doctrinally meaningful for this scenario.',
        steps,
        regression_expect:   meta.regression_expect || null,
        schema_variant:      'w4-strike',
        ported_at:           new Date().toISOString(),
        ported_from:         `UI_MOdified/${folderName}/{step00..${String(stepCount - 1).padStart(2, '0')}.geojson}`,
    };
}

// ── W3-shape (kind-based, FeatureCollection.properties metadata) ────
// Wargame3-style folders carry the richest model: a full 173-unit OOB,
// per-unit strength counters, is_actor / is_affected flags, engagement
// arcs, and authentic force-ratio + step_advantage fields in the
// FeatureCollection-level `properties` block (not per-feature `metadata`).
//
// Discriminator from W4: W3 files have `properties.phase` (integer) at
// the FeatureCollection level and use `kind: "unit"` for all 173 OOB
// entries. W4 uses `kind: "actor_unit"` / `kind: "affected_unit"`.

const W3_ECHELON_MAP = {
    div: 'division', bde: 'brigade', bn: 'battalion',
    coy: 'company',  sqn: 'squadron', flot: 'unit', unit: 'unit',
};

function w3SidcFor(side, role, echelon) {
    const affiliation = String(side || '').toUpperCase() === 'RED' ? '100610' : '100310';
    const ech = String(echelon || '').toLowerCase();
    const r   = String(role || '').toLowerCase();

    let hqEch;
    if (ech === 'division')       hqEch = '0221';
    else if (ech === 'brigade')   hqEch = '0218';
    else if (ech === 'battalion') hqEch = '0216';
    else                          hqEch = '0015';

    let iconMod = '1211020000'; // mechanized infantry
    if (/recon/.test(r))                        iconMod = '1211050000';
    else if (/armored|armor|tank|armd/.test(r)) iconMod = '1211030000';
    else if (/fire|arty|artillery/.test(r))     iconMod = '1303000000';
    else if (/ew|signal|comm/.test(r))          iconMod = '1300000000';
    else if (/cbrn|chem/.test(r))               iconMod = '1417000000';
    else if (/naval|submarine|landing_ship|amphib/.test(r)) iconMod = '1211000000';

    return affiliation + hqEch + iconMod;
}

function isW3Shape(stepJsons) {
    const s0 = stepJsons[0];
    if (!s0 || !Array.isArray(s0.features) || !s0.features.length) return false;
    const hasCollectionPhase = s0.properties && Number.isInteger(s0.properties.phase);
    const hasUnitKind = s0.features.some(f => f && f.properties && f.properties.kind === 'unit');
    return hasCollectionPhase && hasUnitKind;
}

function buildW3Scenario(stepJsons, folderName, meta) {
    const stepCount  = stepJsons.length;
    const defaultName = folderName.toLowerCase();

    // OBJ from step00 objective feature.
    const objFeat = stepJsons[0].features.find(f => f && f.properties && f.properties.kind === 'objective');
    const obj = objFeat ? {
        name:            objFeat.properties.name_en || objFeat.properties.id || 'OBJ',
        coord:           objFeat.geometry.coordinates,
        target_depth_km: Number.isFinite(objFeat.properties.depth_km_from_coast)
                            ? objFeat.properties.depth_km_from_coast : 90,
        radius_km: 5.0,
        carver: 30,
    } : null;

    // Pipeline: concatenate all phase_line LineStrings in step order.
    const pipeline = [];
    for (let i = 0; i < stepCount; i++) {
        const pl = stepJsons[i].features.find(f => f && f.properties && f.properties.kind === 'phase_line');
        if (pl && pl.geometry && Array.isArray(pl.geometry.coordinates)) {
            for (const c of pl.geometry.coordinates) pipeline.push(c);
        }
    }
    while (pipeline.length > 64) pipeline.splice(Math.floor(pipeline.length / 2), 1);
    if (pipeline.length < 2 && obj) {
        pipeline.push([obj.coord[0] - 0.1, obj.coord[1]]);
        pipeline.push(obj.coord);
    }

    // BLS: place at the pipeline start (coastline / amphibious landing beach),
    // NOT at the objective.  redPositionLonLat() stages red units 10 km north
    // of this coord; with BLS at the coast they spawn at sea and advance toward
    // the OBJ, which is the correct tactical geometry for an amphibious assault.
    const blsCoord = pipeline.length > 0 ? pipeline[0] : (obj ? obj.coord : [0, 0]);
    const blsTemplate = [{
        name: 'BLS-1', coord: blsCoord,
        role: 'Amphibious landing beach (W3 coastline)',
        capacity: 'Medium', throughput: 1.0, terrain_friction: 1.0,
        permanently_limited: false,
    }];

    // Build uid → firstRealCoord: scan all steps so we can replace the W3
    // staging placeholders ([18,32], [18,33], [18.3,32.5], …) that the source
    // GeoJSON uses for off-map units.  Any coord with lat > 31 is outside the
    // operational area (Brega is ~30.4°N) and treated as a staging placeholder.
    const isPlaceholder = (c) => c && (c[1] > 31 || (c[0] === 18 && c[1] === 32));
    const firstRealCoord = new Map();
    for (const stepJson of stepJsons) {
        for (const f of stepJson.features) {
            const p = f && f.properties;
            if (!p || p.kind !== 'unit' || !p.uid) continue;
            if (firstRealCoord.has(p.uid)) continue;
            const c = f.geometry && f.geometry.coordinates;
            if (c && !isPlaceholder(c)) firstRealCoord.set(p.uid, c);
        }
    }

    // Returns false for pure organisational nodes that should not appear as
    // map markers: command HQs, base location labels, and narrative entries.
    function isW3CombatUnit(p) {
        const depth = (p.uid || '').split('-')[1]; // 'd0','d1','d2','d3'
        const name  = p.name_ar || '';
        if (p.side === 'RED') {
            // RED: skip d0/d1 HQ placeholders, base labels, abstract plan/phase entries
            if ((depth === 'd0' || depth === 'd1') && p.echelon === 'unit') return false;
            if (name.startsWith('قاعدة')) return false;        // قاعدة = "Base"
            if (name.startsWith('العمل الممكن')) return false; // "Possible operation"
            if (name.startsWith('المرحلة')) return false;      // "Phase"
        } else {
            // BLUE: skip d0 component descriptions, air-base labels, artillery
            //       section header, mine-count entry, and reserve HQ
            if (depth === 'd0' && p.echelon === 'unit') return false;
            if (name.startsWith('القاعدة')) return false;      // "Air/Naval Base"
            if (name.startsWith('المدفعيـة') || name === 'المدفعية') return false; // section header
            if (name.startsWith('(') && name.includes('لغم')) return false; // mine count
        }
        return true;
    }

    // OOB from step00 unit features (173 entries — full order of battle).
    const redUnits    = [];
    const blueInitial = [];
    for (const f of stepJsons[0].features) {
        const p = f && f.properties;
        if (!p || p.kind !== 'unit' || !p.uid) continue;
        // Skip organisational/HQ nodes that are not deployable combat units.
        if (!isW3CombatUnit(p)) continue;
        const echelon  = W3_ECHELON_MAP[p.echelon] || 'unit';
        const rawCoord = f.geometry && f.geometry.coordinates;
        // Replace staging placeholder with first real on-map position; fall back to pipeline start.
        const coord    = isPlaceholder(rawCoord)
            ? (firstRealCoord.get(p.uid) || pipeline[0] || rawCoord)
            : rawCoord;
        const role    = p.type || p.domain || 'unit';
        const label   = shortenLabel(p.name_ar || p.uid);
        const sidc    = w3SidcFor(p.side, role, echelon);
        if (p.side === 'RED') {
            redUnits.push({
                uid:     p.uid,
                label,
                echelon: echelon,
                role,
                bls:     'BLS-1',
                sidc,
                coord:   coord,
                appear:  1,
            });
        } else {
            blueInitial.push({
                unit_uid: p.uid,
                base_id:  p.uid.replace(/[^\w-]/g, '_'),
                label,
                role,
                domain:   p.domain || null,
                echelon:  echelon,
                sidc,
                coord:    coord,
                posture:  null,
            });
        }
    }
    if (!redUnits.length)   redUnits.push({ uid: 'RED_PH',  label: 'placeholder', echelon: 'unit', role: 'unknown', bls: 'BLS-1', coord: pipeline[0] || [0,0], appear: 1 });
    if (!blueInitial.length) blueInitial.push({ unit_uid: 'BLUE_PH', base_id: 'BLUE_PH', echelon: 'unit', sidc: null, coord: pipeline[pipeline.length-1] || [0,0], posture: null });

    // Build authentic per-step positions for each red unit from the source GeoJSON.
    // The map renderer uses these instead of the generic BLS→OBJ lerp so units
    // move to their real battle positions at each phase rather than collapsing
    // onto a single axis line.
    const redUnitStepCoords = {};
    for (const unit of redUnits) {
        const stepCoords = [];
        for (let i = 0; i < stepCount; i++) {
            const feat = stepJsons[i].features.find(f => f.properties && f.properties.uid === unit.uid);
            const c = feat && feat.geometry && feat.geometry.coordinates;
            stepCoords.push((c && !isPlaceholder(c)) ? c : null);
        }
        // Fill nulls: use the unit's initial coord (first real position) for
        // any step where the source GeoJSON still has a staging placeholder.
        const fallback = unit.coord;
        for (let i = 0; i < stepCoords.length; i++) {
            if (stepCoords[i] === null) stepCoords[i] = fallback;
        }
        redUnitStepCoords[unit.uid] = stepCoords;
    }

    // Per-step baselines from FeatureCollection.properties (the rich block).
    const steps      = [];
    const phaseTable = [];

    for (let i = 0; i < stepCount; i++) {
        const cp          = stepJsons[i].properties || {};
        const time_label  = cp.time_label || `P${i}`;
        const elapsed_h   = parseElapsedHours(time_label, i);
        const phaseKind   = cp.kind || w4PhaseLabel(i, stepCount);
        const plKm        = Number.isFinite(cp.phase_line_km) ? cp.phase_line_km : 0;
        const frLocal     = Number.isFinite(cp.force_ratio_local) ? cp.force_ratio_local : null;
        const advantage   = String(cp.step_advantage || '');

        phaseTable.push({ index: i, time_label, elapsed_hours: elapsed_h, phase: phaseKind });

        // Objective status: use step_advantage + phase progression.
        // All 17 W3 steps have BLUE_ADV → final result is DENIED.
        let objStatus;
        if (i < 5)                         objStatus = 'DORMANT';
        else if (i < 9)                    objStatus = 'THREATENED';
        else if (i < stepCount - 1)        objStatus = 'CONTESTED';
        else                               objStatus = advantage === 'RED_ADV' ? 'CAPTURED' : 'DENIED';

        // Per-step unit outcomes.
        const blueDestroyed = [];
        const redDegraded   = [];
        const redStrength   = {};

        for (const f of stepJsons[i].features) {
            const p = f && f.properties;
            if (!p || p.kind !== 'unit' || !p.uid) continue;
            if (p.side === 'RED') {
                const str = (Number.isFinite(p.current_strength) && Number.isFinite(p.initial_strength) && p.initial_strength > 0)
                    ? p.current_strength / p.initial_strength : 1.0;
                redStrength[p.uid] = +(str.toFixed(3));
                if (p.is_affected && p.status_change && p.status_change !== 'unchanged') redDegraded.push(p.uid);
            } else if (p.side === 'BLUE') {
                // W3 schema marks affected blue units via is_affected+status_change,
                // not destroyed===true. Treat any damage (partial or heavy) as a
                // degraded unit so per_unit_deltas drives map attack effects.
                const isAffected = p.is_affected && p.status_change &&
                                   p.status_change !== 'unchanged' && p.status_change !== 'ok';
                const isDestroyed = p.destroyed === true || p.status_change === 'destroyed';
                if (isAffected || isDestroyed) blueDestroyed.push(p.uid);
            }
        }

        // BLS status mirrors Red's momentum: LIMITED pre-H, THREATENED early assault, SECURE once inland.
        const blsStatus = i < 5 ? 'LIMITED' : i < 12 ? 'THREATENED' : 'SECURE';

        // Collect engagement arc descriptions for a detailed narrative.
        const arcDescriptions = [];
        for (const f of stepJsons[i].features) {
            const p = f && f.properties;
            if (!p || p.kind !== 'engagement_arc') continue;
            if (p.cause_what) arcDescriptions.push(`[${p.actor_side}→${p.target_side}] ${p.cause_what}`);
        }
        const detailedNarEn = cp.combined_effect
            ? cp.combined_effect + (arcDescriptions.length ? '\n\nEngagements:\n' + arcDescriptions.join('\n') : '')
            : arcDescriptions.join('\n');

        steps.push({
            index:                          i,
            time_label,
            elapsed_hours:                  elapsed_h,
            phase:                          phaseKind,
            phase_line_km_baseline:         plKm,
            objective_status_baseline:      objStatus,
            decision_point_baseline:        null,
            force_ratio_baseline:           frLocal,
            ew_effect_baseline:             cp.step_advantage || null,
            mobility_state_baseline:        null,
            logistics_state_baseline:       null,
            narrative_en_fallback:          detailedNarEn,
            narrative_ar_fallback:          cp.phase_name_ar   || '',
            bls_status_baseline:            { 'BLS-1': blsStatus },
            blue_destroyed_baseline:        unique(blueDestroyed),
            blue_destroyed_count_baseline:  unique(blueDestroyed).length,
            red_losses_cumulative_baseline: 0,
            red_degraded_baseline:          unique(redDegraded),
            red_strength_baseline:          redStrength,
            red_active_markers_baseline:    null,
        });
    }

    const bbox = deriveBbox(stepJsons);

    return {
        name:                meta.name     || defaultName,
        model_version:       meta.model_version || `${defaultName}-v1.0`,
        scenario_label:      meta.scenario_label || 'Wargame 3 — Brega Amphibious Assault (173-unit OOB, 17 phases)',
        map_bbox:            meta.map_bbox  || bbox,
        obj:                 meta.obj       || obj,
        pipeline:            (meta.pipeline && meta.pipeline.length) ? meta.pipeline : pipeline,
        red_units:              redUnits,
        red_unit_step_coords:   redUnitStepCoords,
        blue_units_base_ids:    blueInitial.map(b => b.base_id),
        blue_units_initial:     blueInitial,
        blue_units_source:      'derived from W3 step00 unit features (173-unit full OOB)',
        ao_boundaries:       [],
        bls_template:        blsTemplate,
        nominal_throughput:  meta.nominal_throughput  || null,
        phase_table:         phaseTable,
        throughput_ceilings_km: meta.throughput_ceilings_km || null,
        terrain_note:        meta.terrain_note || 'W3 rich OOB: 173 units, 17 phases D-7→D+144h. Force ratios and phase-line progression are authentic from the source data. BLS is a synthesized placeholder.',
        steps,
        regression_expect:   meta.regression_expect || null,
        schema_variant:      'w3-rich',
        ported_at:           new Date().toISOString(),
        ported_from:         `UI_MOdified/${folderName}/{step00..${String(stepCount-1).padStart(2,'0')}.geojson}`,
    };
}

// ── Top-level: port one folder ──────────────────────────────────────

function buildScenarioFromFolder(folder) {
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
        throw new Error(`folder not found: ${folder}`);
    }

    const stepFiles = listStepFiles(folder);
    const stepJsons = stepFiles.map(readJson);
    const step0 = stepJsons[0];

    const meta = readJsonOptional(path.join(folder, 'wargame.meta.json')) || {};
    const blsSelection = readJsonOptional(path.join(folder, 'bls_selection.geojson'));

    const folderName = path.basename(folder);
    const defaultName = folderName.toLowerCase();

    // Route W3-shape folders first (kind-based with FeatureCollection.properties.phase
    // + kind:"unit" features). W3 satisfies isW4Shape() too, so this must come first.
    if (isW3Shape(stepJsons)) {
        console.log(`  (detected W3 rich OOB schema — 173-unit full OOB, authentic force ratios)`);
        return buildW3Scenario(stepJsons, folderName, meta);
    }

    // Route Wargame4-shape folders (kind-based, no metadata block) through
    // the synthesized-BLS path so the file passes the scenario validator.
    if (isW4Shape(stepJsons)) {
        console.log(`  (detected W4 strike-model schema — synthesizing BLS/OOB placeholders)`);
        return buildW4Scenario(stepJsons, folderName, meta);
    }

    const blsTemplate  = extractBlsTemplate(step0, blsSelection);
    const aoBoundaries = extractAoBoundaries(step0);
    const obj          = extractObj(step0);
    const pipeline     = extractPipeline(step0);
    const blueInitial  = extractBlueInitial(step0);
    const blueBaseIds  = blueInitial.map(b => b.base_id);
    const redUnits     = extractRedUnits(stepJsons);
    const phaseTable   = buildPhaseTable(stepJsons);
    const bbox         = deriveBbox(stepJsons);

    // Merge red_unit overrides from meta (add missing units, fix roles/bls/appear).
    if (Array.isArray(meta.red_units_overrides)) {
        const byUid = new Map(redUnits.map(u => [u.uid, u]));
        for (const ov of meta.red_units_overrides) {
            if (!ov || !ov.uid) continue;
            const existing = byUid.get(ov.uid);
            if (existing) Object.assign(existing, ov);
            else redUnits.push({ ...ov, appear: Number.isFinite(ov.appear) ? ov.appear : 1 });
        }
        redUnits.sort((a, b) => (a.appear - b.appear) || a.uid.localeCompare(b.uid));
    }

    const narrativeOverrides = Array.isArray(meta.narrative_ar_per_step) ? meta.narrative_ar_per_step : [];
    const steps = stepJsons.map((sj, i) =>
        extractStepBaseline(sj, i, narrativeOverrides[i] || ''));

    const clampLog = enforcePermanentlyLimited(steps, blsTemplate);
    if (clampLog.length) {
        console.log('Doctrine clamps applied (permanently_limited BLSs):');
        for (const line of clampLog) console.log(line);
    }

    const scenario = {
        name:                folderName === folderName ? (meta.name || defaultName) : defaultName,
        model_version:       meta.model_version || `${defaultName}-v1.0`,
        scenario_label:      meta.scenario_label || folderName,
        map_bbox:            meta.map_bbox || bbox,
        obj:                 meta.obj || obj,
        pipeline:            (meta.pipeline && meta.pipeline.length) ? meta.pipeline : pipeline,
        red_units:           redUnits,
        blue_units_base_ids: meta.blue_units_base_ids || blueBaseIds,
        blue_units_initial:  blueInitial,
        blue_units_source:   meta.blue_units_source || 'derived from step00.geojson',
        ao_boundaries:       aoBoundaries,
        bls_template:        blsTemplate,
        nominal_throughput:  meta.nominal_throughput || null,
        phase_table:         phaseTable,
        throughput_ceilings_km: meta.throughput_ceilings_km || null,
        terrain_note:        meta.terrain_note || '',
        steps,
        regression_expect:   meta.regression_expect || null,
        ported_at:           new Date().toISOString(),
        ported_from:         `UI_MOdified/${folderName}/{step00..${String(stepJsons.length - 1).padStart(2, '0')}.geojson${blsSelection ? ', bls_selection.geojson' : ''}${meta && Object.keys(meta).length ? ', wargame.meta.json' : ''}}`,
    };

    // Apply remaining top-level overrides from meta (anything the user
    // explicitly set wins). Skip the keys we've already handled to avoid
    // clobbering derived structure with empty sidecar fields.
    const handled = new Set([
        'name', 'model_version', 'scenario_label', 'map_bbox', 'obj', 'pipeline',
        'blue_units_base_ids', 'blue_units_source', 'nominal_throughput',
        'throughput_ceilings_km', 'terrain_note', 'regression_expect',
        'red_units_overrides', 'narrative_ar_per_step',
    ]);
    for (const [k, v] of Object.entries(meta)) {
        if (!handled.has(k)) scenario[k] = v;
    }

    return scenario;
}

function writeScenario(scenario) {
    fs.mkdirSync(SCENARIOS, { recursive: true });
    const out = path.join(SCENARIOS, scenario.name + '.json');
    fs.writeFileSync(out, JSON.stringify(scenario, null, 2) + '\n', 'utf8');
    return out;
}

function summarize(scenario, outFile) {
    const last = scenario.steps[scenario.steps.length - 1];
    console.log(`  → ${outFile}`);
    console.log(`     steps:           ${scenario.steps.length}`);
    console.log(`     red_units:       ${scenario.red_units.length}`);
    console.log(`     blue_units:      ${scenario.blue_units_initial.length}`);
    console.log(`     bls_template:    ${scenario.bls_template.length}`);
    console.log(`     pipeline pts:    ${(scenario.pipeline || []).length}`);
    console.log(`     final PL km:     ${last && last.phase_line_km_baseline}`);
    console.log(`     final OBJ:       ${last && last.objective_status_baseline}`);
}

function findWargameFolders() {
    const entries = fs.readdirSync(ROOT, { withFileTypes: true });
    return entries
        .filter(e => e.isDirectory() && /^Wargame/i.test(e.name))
        .map(e => path.join(ROOT, e.name))
        .filter(d => fs.readdirSync(d).some(f => STEP_RE.test(f)));
}

function resolveFolderArg(arg) {
    if (path.isAbsolute(arg) && fs.existsSync(arg)) return arg;
    const candidates = [
        path.resolve(arg),
        path.join(ROOT, arg),
        path.join(process.cwd(), arg),
    ];
    for (const c of candidates) {
        if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return c;
    }
    throw new Error(`folder not found: ${arg}`);
}

function main() {
    const args = process.argv.slice(2);
    const folders = args.length
        ? args.map(resolveFolderArg)
        : findWargameFolders();

    if (!folders.length) {
        console.error('No Wargame*/ folders found under UI_MOdified/ and no folder arg given.');
        process.exit(1);
    }

    let failed = 0;
    for (const folder of folders) {
        console.log(`Porting ${path.basename(folder)} …`);
        try {
            const scenario = buildScenarioFromFolder(folder);
            const outFile = writeScenario(scenario);
            summarize(scenario, outFile);
        } catch (err) {
            failed++;
            console.error(`  ERROR: ${err.message}`);
        }
    }
    if (failed) process.exit(1);
}

if (require.main === module) {
    try { main(); }
    catch (err) {
        console.error('ERROR:', err.message);
        process.exit(1);
    }
}

module.exports = { buildScenarioFromFolder, writeScenario, findWargameFolders };
