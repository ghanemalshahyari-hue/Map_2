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

// ── MIL-STD-2525D / NATO APP-6D SIDC builder ──────────────────────
//
// A SIDC is 20 ASCII digits:
//   pos 0-1   version       (always "10" for 2525D)
//   pos 2     context       ("0" = real)
//   pos 3     affiliation   ("3" = friend, "4" = neutral, "6" = hostile, "1" = unknown)
//   pos 4-5   symbol set    ("01" air, "10" land unit, "15" land equipment,
//                            "20" installation, "30" sea surface, "35" sea
//                            subsurface, "40" mine warfare)
//   pos 6     status        ("0" = present)
//   pos 7     HQ/TF/Dummy   ("0" = none)
//   pos 8-9   amplifier     (echelon code, "21" division, "18" brigade,
//                            "16" battalion, "15" company/squadron, "00" unknown)
//   pos 10-15 main icon     (6 digits identifying the symbol entity)
//   pos 16-17 modifier 1
//   pos 18-19 modifier 2

const SS_AIR          = '01';   // Symbol Set 01 — Air
const SS_LAND_UNIT    = '10';   // Symbol Set 10 — Land Unit
const SS_INSTALLATION = '20';   // Symbol Set 20 — Installations
const SS_SEA_SURFACE  = '30';   // Symbol Set 30 — Sea Surface
const SS_SEA_SUB      = '35';   // Symbol Set 35 — Sea Subsurface

const SI_BY_SIDE = { RED: '6', BLUE: '3', NEUTRAL: '4', UNKNOWN: '1' };

const AMP_BY_ECHELON = {
    division:  '21',
    brigade:   '18',
    battalion: '16',
    company:   '15',
    squadron:  '15',
    flotilla:  '14',
    platoon:   '13',
    section:   '12',
    squad:     '11',
    team:      '10',
    unit:      '00',
};

// Pick the symbol set from a unit's domain + echelon + Arabic description.
// W3 sources tag `domain` ∈ {strategic, naval, air, ground, sof} but the
// Arabic name sometimes contradicts it. Rule: if the Arabic name STARTS
// with a ship/aircraft noun, override the source domain; if the noun
// appears only deep in the description (e.g. a ground brigade that
// happens to mention having "12 unmanned boats"), trust the source.
function pickSymbolSet(props) {
    const dom  = String(props.domain || '').toLowerCase();
    const name = stripArabicDiacritics(props.name_ar);
    const role = String(props.type || props.role || '').toLowerCase();

    // First-word vocabulary tells us what KIND of unit this primarily is.
    // We strip leading numerics ("10 فرقاطات" → "فرقاطات") before checking.
    const head = name.replace(/^\s*[(\d\s]+/, '').trim();

    // Sea subsurface — submarines override everything regardless of dom.
    if (dom === 'subsurface' || /غواصة/.test(head) || role === 'submarine') return SS_SEA_SUB;

    // Arabic unit-prefix words that mark this as a LAND unit definitively.
    // "كتيبة 85 مدفعية مضاد طائرات" = "85th AAA Battalion" — even though
    // it's anti-aircraft, it's a ground-based artillery battery. We
    // pin it to SS_LAND when the name STARTS with one of these prefixes,
    // overriding any air/naval domain mistag in the source.
    const landPrefix = /^(?:ال)?(?:كتيبة|كتائب|لواء|فرقة|سرية|سرايا|قيادة|احتياط|المرحلة|العمل|المكون|المدفع)/.test(head);

    // Sea surface — first-word ship vocabulary OR explicit naval domain.
    // "10 فرقاطات" (10 frigates) → ship at head; tag as SEA.
    // "لواء المشاة 23 ... + 12 زورق" (infantry brigade with attached boats)
    // → "لواء" (brigade) at head; KEEP as land unit.
    const shipHead = /^(?:زورق|سفينة|سفن|مدمر|مدمرات|فرقاط|كورفيت|إبرار|هوفر|كاسحة|قانصة|قاعدة\s*[أب]?\s*البحري)/.test(head);
    if (!landPrefix && (shipHead || dom === 'naval' || dom === 'subsurface')) return SS_SEA_SURFACE;

    // Air — first-word aircraft vocabulary OR explicit air domain.
    // "سرب طائرات" (squadron of aircraft) → air at head.
    // "رف طائرات" (flight of aircraft) → air at head.
    const airHead = /^(?:سرب|رف|طائرات?|عمودي)/.test(head);
    if (!landPrefix && (airHead || dom === 'air')) return SS_AIR;

    return SS_LAND_UNIT;
}

// Strip Arabic combining diacritics (shadda, fatha, kasra, damma, sukun,
// tanwin, etc.) so regex matching doesn't depend on the source's specific
// combining-mark ordering. The W3 producer stores "مسيَّر" with combining
// marks in [shadda, fatha] order, but our regex literals use [fatha,
// shadda]; both render identically but compare unequal byte-for-byte. The
// safest fix is to remove all diacritics from both sides of the test.
// Covers U+064B..U+0652 (tashkil), U+0670 (alef superscript), U+0653..065F.
function stripArabicDiacritics(s) {
    return String(s || '').replace(/[ً-ٰٟ]/g, '');
}

// Pick the 6-digit main icon code. Reads the Arabic name first (most
// specific), falls back to the W3 `type` (role) when name parsing is
// ambiguous. Codes are MIL-STD-2525D Table B-V (symbol set 10 = land
// unit) / Table B-XII (symbol set 30 = sea surface) / Table B-IX
// (symbol set 01 = air). Unknown codes degrade gracefully to a blank
// frame in milsymbol.
function pickMainIcon(props, ss) {
    // Normalize the name: strip all Arabic diacritics so combining-mark
    // ordering doesn't bypass our pattern matches.
    const n    = stripArabicDiacritics(props.name_ar);
    const role = String(props.type || props.role || '').toLowerCase();

    if (ss === SS_AIR) {
        // Rotary-wing first — "عمودي" disambiguates from fixed-wing.
        if (/عمودي/.test(n)) {
            if (/هجوم|attack|strike/i.test(n + role))      return '120100'; // attack helo
            if (/نقل|cargo|transport/i.test(n + role))     return '120200'; // cargo helo
            return '120300';                                                 // utility helo
        }
        // Unmanned aerial systems (n is diacritic-stripped: "مسيَّرة" → "مسيرة")
        if (/مسير|uav|drone/i.test(n + role)) {
            if (/استطلاع|مراقبة|isr|recon/i.test(n + role)) return '130100'; // ISR UAV
            if (/متفجر|هجوم|kamikaze|loitering/i.test(n + role)) return '130200'; // attack UAV
            return '130000';
        }
        // Fixed-wing
        if (/إنذار مبكر|awacs|aew/i.test(n + role))           return '110600'; // surveillance / AEW
        if (/نقل|سي\s*130|c-?130|transport|cargo/i.test(n + role)) return '110400';
        if (/ميراج|سوخوي|sukhoi|mirage|هجوم\s*أرضي|attack|strike/i.test(n + role)) return '110200';
        if (/ميج|mig|رافال|rafale|أف\s*16|f-?16|دفاع\s*جوي|fighter/i.test(n + role)) return '110100';
        return '110000'; // generic fixed-wing
    }

    if (ss === SS_SEA_SUB) return '110000';

    if (ss === SS_SEA_SURFACE) {
        if (/مدمر|destroyer/i.test(n + role))                          return '120103';
        if (/فرقاط|frigate/i.test(n + role))                            return '120104';
        if (/كورفيت|corvette/i.test(n + role))                          return '120105';
        if (/زورق\s*صواريخ|missile.boat|fast.attack/i.test(n + role))   return '120106';
        // Mine warfare — "قانصة الغام" = mine hunter, "كاسحة ألغام" = sweeper
        if (/كاسحة|قانصة|mine.?sweep|mine.?hunt/i.test(n + role))       return '120601';
        if (/بث\s*ألغام|mine.?lay/i.test(n + role))                     return '120602';
        if (/سفينة\s*إبرار|landing_ship/i.test(n + role))                return '120903';
        if (/زورق\s*إبرار|زورق\s*انزال|landing.craft/i.test(n + role))   return '120902';
        if (/هوفر|hover/i.test(n + role))                                return '120902'; // LCAC
        if (/تجاري|merchant/i.test(n))                                  return '120201';
        if (/قيادة|command/i.test(n + role))                             return '120200';
        if (/مرور|تفتيش|patrol|coastal|اسناد\s*ساحلي/i.test(n + role))   return '120200';
        if (/اخلاء\s*طبي|medical.evac/i.test(n + role))                  return '120203';
        if (/إمداد|صيانة|auxiliary|supply/i.test(n + role))              return '120300';
        // Coastal radar / sea-mine field — still in sea-surface set
        if (/رادار\s*ساحلي|coastal.radar/i.test(n + role))               return '120200';
        if (/لغم\s*بحري|sea.?mine/i.test(n + role))                      return '120601';
        return '120100'; // generic surface combatant
    }

    // ── Land Unit (Symbol Set 10) ──
    // Special operations
    if (/(?:عمليات\s*خاصة)|sof|special.ops|special.forces/i.test(n + role)) return '161000';
    // ATGM / anti-tank guided missile. Arabic encodes this as "م/د"
    // (mudaad-dabbabat = anti-armor) with various separators: "م / د",
    // "م/د", "م . د". The trailing context might be the digit "402" so
    // we don't anchor on \b. Also catches "قاذف" (launcher) co-mentioned.
    if (/م\s*[\/.]\s*د(?:\s|$|\d)|atgm|anti.?tank|antitank/i.test(n + role)) return '120401';
    // Air defense / SAM / MANPADS / SSM / AAA. "م/د" above must be checked
    // first because "كتيبة م / د" can look like AD otherwise. The Arabic
    // "ال" definite article (e.g. "الدفاع الجوي" = "the air defense")
    // is allowed: regex permits an optional "ال" + space between دفاع
    // and جوي.
    if (/(?:ال)?دفاع\s*(?:ال)?جوي|سام|hawk|هوك|اس\s*300|s-?300|sam|air.?defense/i.test(n + role)) return '130501';
    if (/manpads|كتف\s*حرارية/i.test(n + role))                           return '130502';
    if (/(?:مدفعية\s*مضاد|مدفعية\s*م\s*ضد|مضاد\s*طائرات|aaa)/i.test(n + role)) return '130502';
    if (/(?:صواريخ.*أرض)|(?:صواريخ.*\d+\s*كم)|ssm_brigade|surface.?to.?surface/i.test(n + role)) return '130201';
    if (/(?:صواريخ\s*متوسط|medium.?range)/i.test(n + role))               return '130201';
    // Armor and infantry
    if (/(?:دبابات|مدرع)|tank|armored/i.test(n + role))                   return '121300';
    if (/(?:مشاة\s*الآلي|الآلية|الآلي)|mech_(?:inf|brigade|bn)|mechanized/i.test(n + role)) return '121102';
    if (/استطلاع|recon|reconnaissance/i.test(n + role))                   return '121105';
    if (/مشاة|infantry/i.test(n + role))                                  return '121100';
    // Field artillery
    if (/مدفعية|artillery|field_arty/i.test(n + role))                    return '130301';
    // Sensor / radar
    if (/رادار|radar|sensor/i.test(n + role))                             return '130901';
    // Engineer / signal / CBRN / EW / medical / supply / maintenance / MP
    if (/هندسة|engineer/i.test(n + role))                                 return '140700';
    if (/(?:اشارة|إشارة)|signal|comm/i.test(n + role))                    return '140900';
    if (/كيميائي|chem|cbrn/i.test(n + role))                              return '141700';
    if (/(?:حرب\s*الكترونية|electronic.warfare|ew_bn)/i.test(n + role))   return '141400';
    if (/(?:طبية|طبي)|medical/i.test(n + role))                           return '141100';
    if (/(?:تزويد|إمداد|نقل|supply|logistics|transport)/i.test(n + role)) return '141500';
    if (/صيانة|maintenance/i.test(n + role))                              return '141800';
    if (/(?:شرطة\s*عسكرية)|military.police|\bmp\b/i.test(n + role))       return '161100';
    // HQ / command nodes (Arabic "قيادة" = "command", "احتياط" = "reserve")
    if (/قيادة|احتياط|hq|command|reserve/i.test(n + role))                return '121000';
    // Fallback: friendly/hostile generic combat unit. milsymbol always
    // renders the affiliation-tagged frame even when the entity icon
    // code is just a parent category, so this guarantees visibility.
    return '121100'; // generic infantry — universally rendered
}

// Off-map markers use the Installation symbol set (20). Pick a doctrinal
// site code that maps cleanly to milsymbol's installation rendering.
function pickInstallationIcon(om) {
    const t = String(om.type || '').toLowerCase();
    const n = String(om.name_ar || '');
    if (t === 'air_base'       || /قاعدة.*جوي|airfield|airbase/i.test(n + t)) return '110203';
    if (t === 'naval_base'     || /قاعدة.*بحري|naval.?base|port/i.test(n + t)) return '110204';
    if (t === 'ssm_brigade'    || /صواريخ.*أرض|ssm/i.test(n + t))              return '110702';
    if (t === 'logistics_node' || /إمداد|تزويد|نقل|logistic|supply/i.test(n + t)) return '110800';
    return '110100'; // generic military installation
}

// Build a full 20-char SIDC from the assembled pieces.
function buildSidc({ side, symbolSet, echelon, mainIcon, mod1 = '00', mod2 = '00' }) {
    const aff  = SI_BY_SIDE[String(side || '').toUpperCase()] || '1';
    const ss   = (symbolSet || SS_LAND_UNIT).slice(0, 2);
    const amp  = AMP_BY_ECHELON[String(echelon || 'unit').toLowerCase()] || '00';
    const icon = String(mainIcon || '000000').padEnd(6, '0').slice(0, 6);
    const m1   = String(mod1 || '00').padEnd(2, '0').slice(0, 2);
    const m2   = String(mod2 || '00').padEnd(2, '0').slice(0, 2);
    // 10 (version) + 0 (context) + aff + ss + 0 (status) + 0 (HQ) + amp + icon + m1 + m2
    return '10' + '0' + aff + ss + '0' + '0' + amp + icon + m1 + m2;
}

// W3-rich SIDC for a unit feature. Replaces the legacy w3SidcFor() which
// used only role+echelon and assumed Land Unit symbol set. The new builder
// reads name_ar to pick the correct symbol set + main icon so a helicopter
// squadron renders as a helo, a destroyer as a destroyer, a base as a
// base, etc.
function w3SidcFor(props) {
    // Back-compat shim: legacy callers passed (side, role, echelon) positionally.
    // New callers pass a single props object containing the full feature properties.
    if (typeof props === 'string') {
        const [side, role, echelon] = arguments;
        props = { side, type: role, echelon };
    }
    const ss   = pickSymbolSet(props);
    const echelon = String(props.echelon || 'unit').toLowerCase();
    const icon = pickMainIcon(props, ss);
    return buildSidc({ side: props.side, symbolSet: ss, echelon, mainIcon: icon });
}

function w3SidcForOffMap(om) {
    return buildSidc({
        side:      om.side,
        symbolSet: SS_INSTALLATION,
        echelon:   'unit',
        mainIcon:  pickInstallationIcon(om),
    });
}

function isW3Shape(stepJsons) {
    const s0 = stepJsons[0];
    if (!s0 || !Array.isArray(s0.features) || !s0.features.length) return false;
    const hasCollectionPhase = s0.properties && Number.isInteger(s0.properties.phase);
    const hasUnitKind = s0.features.some(f => f && f.properties && f.properties.kind === 'unit');
    return hasCollectionPhase && hasUnitKind;
}

// W3 source `kind` (per-phase narrative label, e.g. "shaping", "h_hour_strike")
// → legacy `phase` enum used by the W1/W2 renderer + HUD switches. Anything
// not in the table falls back to `w4PhaseLabel(stepIndex, stepCount)` so the
// scenario still loads.
// Mapping covers every `kind` value the W3 producer emits across the 17
// canonical phases (D-7 → D+144h). New / unknown kinds fall back to
// w4PhaseLabel(stepIndex, stepCount).
const W3_PHASE_TO_LEGACY = {
    // D-7 .. D-1: pre-H shaping operations
    shaping:                 'PRE-H',
    strategic_strike:        'PRE-H',
    sead:                    'PRE-H',
    naval_engagement:        'PRE-H',
    mine_clearance:          'PRE-H',
    mine_warfare:            'PRE-H',
    isr_buildup:             'PRE-H',
    counter_c2:              'PRE-H',
    // D-H: the assault begins
    h_hour_strike:           'PHASE 1',
    amphibious_landing:      'PHASE 1',
    // D+2h .. D+24h: assault and lodgement expansion
    beach_assault:           'PHASE 2A',
    main_wave:               'PHASE 2A',
    beachhead_consolidation: 'PHASE 2A',
    first_counterattack:     'PHASE 2A',
    lodgement_expansion:     'PHASE 2A',
    blue_counterattack:      'PHASE 2A',
    // D+36h .. D+48h: follow-on force commit + push inland
    '9mid_lands':            'PHASE 2B',
    push_inland:             'PHASE 2B',
    follow_on_force:         'PHASE 2B',
    breakout:                'PHASE 2B',
    // D+72h .. D+132h: armored exploitation, Blue counter-stroke, culmination
    '1ad_lands':             'PHASE 3',
    blue_op_reserve:         'PHASE 3',
    culmination_check:       'PHASE 3',
    final_red_push:          'PHASE 3',
    exploitation:            'PHASE 3',
    operational_pause:       'PHASE 3',
    final_assault:           'PHASE 3',
    // D+144h: end-state
    final_resolution:        'RESOLUTION',
    resolution:              'RESOLUTION',
};

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

    // Off-map markers: bases / SSM brigades / logistics nodes that exist
    // outside the AO but matter operationally. Per the W3 schema README,
    // these should render as smaller, dimmer Points colored by side and
    // labeled with their id. They are PHASE-INDEPENDENT — the same set of
    // ~11 markers appears in every step file at the same coords — so we
    // de-duplicate by id and emit a single static array. Their lat/lon
    // (32–33 for RED bases up north, 28.9–29.5 for BLUE bases down south)
    // is real geography, NOT a placeholder; we keep them as-is.
    const offMapMarkersById = new Map();
    for (const stepJson of stepJsons) {
        for (const f of stepJson.features) {
            const p = f && f.properties;
            if (!p || p.kind !== 'off_map_marker' || !p.id) continue;
            if (offMapMarkersById.has(p.id)) continue;
            const c = f.geometry && f.geometry.coordinates;
            if (!Array.isArray(c) || c.length !== 2) continue;
            const om = {
                id:      p.id,
                side:    p.side || 'NEUTRAL',
                type:    p.type || 'logistics_node',     // naval_base | air_base | ssm_brigade | logistics_node
                coord:   c,
                name_ar: p.name_ar || null,
                name_en: p.name_en || null,
            };
            // Encode the installation as an APP-6D SIDC (symbol set 20) so
            // the renderer can use the same milsymbol pipeline as on-map
            // units — airfields, naval ports, SSM sites, and logistics
            // sites each get their doctrinal symbol.
            om.sidc = w3SidcForOffMap(om);
            offMapMarkersById.set(p.id, om);
        }
    }
    const offMapMarkers = [...offMapMarkersById.values()];

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

    // Compute bbox up-front so we know where "offshore staging" should sit.
    // Anchoring staging to bbox.maxLat is tempting but wrong here — the bbox
    // is inflated by W3's off_map_marker bases (naval / air bases at 32–33°N)
    // and the W3 source's own "off-map" placeholder coords. Using that as
    // the staging lat puts units 280+ km north of the coast, so the D-H
    // transition looks like a teleport across the entire map.
    //
    // Instead, anchor staging to the actual coastline: the pipeline's
    // northernmost latitude is the phase_line lat at D-H (the line of
    // departure, ≈ 30.54° N for Brega). +0.5° puts staging ~55 km offshore,
    // which is a realistic amphibious task-force standoff distance and
    // keeps the D-H sweep visible-but-not-jarring.
    const bbox = deriveBbox(stepJsons);
    const coastLat = pipeline.length
        ? Math.max.apply(null, pipeline.map(p => p[1]))
        : (bbox ? bbox[3] - 0.5 : 30.55);
    const stagingLat = +(coastLat + 0.5).toFixed(4);

    // PRESERVE SOURCE COORDINATES. The W3 producer authored each unit's
    // position per phase deliberately — phase 0 has everyone at their
    // home base ([18, 32] / [18, 33]), and later phases move units to
    // their operating zones (air at 30.3, naval at 30.9, ground at the
    // phase line, SSM at base). Previously we treated lat>31 as a
    // placeholder and remapped to an offshore staging line; that broke
    // the schema's intent — naval bases, SSM brigades, and air bases
    // that are LEGITIMATELY at lat 32-33 got moved. Use the source
    // coords as-is. The renderer's per-uid jitter (±1.5 km) breaks up
    // any visual pile-up without distorting the source.
    //
    // `firstRealCoord` (kept for the engagement-arc endpoint remap) is
    // now just "first non-null source coord we see for this uid". No
    // placeholder filtering — every coord is treated as real.
    const firstRealCoord = new Map();
    for (const stepJson of stepJsons) {
        for (const f of stepJson.features) {
            const p = f && f.properties;
            if (!p || p.kind !== 'unit' || !p.uid) continue;
            if (firstRealCoord.has(p.uid)) continue;
            const c = f.geometry && f.geometry.coordinates;
            if (Array.isArray(c) && c.length === 2) firstRealCoord.set(p.uid, c);
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
        // Seed coord = whatever the source put in phase 0. Unit might be
        // at its home base (lat 32-33), an offshore staging point, or
        // already in-theater depending on the W3 scenario design. We
        // don't second-guess the source.
        const coord    = Array.isArray(rawCoord) ? rawCoord : null;
        const role    = p.type || p.domain || 'unit';
        const label   = shortenLabel(p.name_ar || p.uid);
        // Build the SIDC from the full source props — name_ar drives the
        // most specific icon (helo vs fixed-wing fighter, destroyer vs
        // corvette, S-300 vs HAWK, etc). The new builder also flips
        // symbol set per domain so naval units don't render as land.
        const sidc    = w3SidcFor({
            side:    p.side,
            type:    p.type,
            domain:  p.domain,
            echelon,
            name_ar: p.name_ar,
        });
        // Persist the source domain so the renderer can scale icons /
        // choose nuances per domain (e.g. smaller for air assets, etc.).
        const srcDomain = p.domain || null;
        if (p.side === 'RED') {
            redUnits.push({
                uid:     p.uid,
                label,
                echelon: echelon,
                role,
                domain:  srcDomain,
                bls:     'BLS-1',
                sidc,
                coord:   coord,
                name_ar: p.name_ar || null,
                // `appear` is the first step where the unit transitions out of
                // placeholder state. Renderer uses this to suppress the
                // role-based spread offset during the offshore-staging phase.
                appear:  null,    // filled in by the redUnitStepCoords loop below
            });
        } else {
            blueInitial.push({
                unit_uid: p.uid,
                base_id:  p.uid.replace(/[^\w-]/g, '_'),
                label,
                role,
                domain:   srcDomain,
                echelon:  echelon,
                sidc,
                coord:    coord,
                posture:  null,
                name_ar:  p.name_ar || null,
                // Filled in by the per-step coords loop below — first step
                // where the unit transitions out of placeholder state.
                // W3 blue units are typically on-map from step 0 so this
                // ends up as 0, but we wire the gate the same way as red
                // for symmetry with applyW3Spread.
                appear:   null,
            });
        }
    }
    if (!redUnits.length)   redUnits.push({ uid: 'RED_PH',  label: 'placeholder', echelon: 'unit', role: 'unknown', bls: 'BLS-1', coord: pipeline[0] || [0,0], appear: 1 });
    if (!blueInitial.length) blueInitial.push({ unit_uid: 'BLUE_PH', base_id: 'BLUE_PH', echelon: 'unit', sidc: null, coord: pipeline[pipeline.length-1] || [0,0], posture: null });

    // Build per-step `coord` and `prev_*` arrays for every unit, on both sides.
    // The map renderer uses these instead of the generic BLS→OBJ lerp so units
    // move to their authentic battle positions at each phase. `prev_*` enables
    // mid-step interpolation per the W3 schema's animation hooks.
    function buildPerStep(unitList, sideKey) {
        const stepCoords = {};
        const stepPrev   = {};
        for (const unit of unitList) {
            const uid = unit.uid || unit.unit_uid;
            if (!uid) continue;
            const coords = new Array(stepCount).fill(null);
            const prev   = new Array(stepCount).fill(null);
            const firstSeed = firstRealCoord.get(uid) || null;
            for (let i = 0; i < stepCount; i++) {
                const feat = stepJsons[i].features.find(f => f.properties && f.properties.uid === uid);
                const p = feat && feat.properties;
                const c = feat && feat.geometry && feat.geometry.coordinates;
                // Use the source coord exactly as authored. If the unit
                // doesn't appear in a given step (rare — most W3 units are
                // in every step), fall back to the first coord we ever saw.
                coords[i] = (Array.isArray(c) && c.length === 2) ? c : firstSeed;
                // prev_lon / prev_lat are the W3 schema's explicit
                // animation hooks. Use them verbatim when present; else
                // fall back to the prior step's coord (or current for step 0).
                if (p && Number.isFinite(p.prev_lon) && Number.isFinite(p.prev_lat)) {
                    prev[i] = [p.prev_lon, p.prev_lat];
                } else if (i === 0) {
                    prev[i] = coords[i];
                } else {
                    prev[i] = coords[i - 1];
                }
            }
            stepCoords[uid] = coords;
            stepPrev[uid]   = prev;
            // appear = 0 since every unit is in every W3 step file. The
            // visual change comes from the source's per-phase coords.
            unit.appear = 0;
        }
        return { stepCoords, stepPrev };
    }
    const redPS  = buildPerStep(redUnits, 'red');
    const bluePS = buildPerStep(blueInitial, 'blue');
    const redUnitStepCoords   = redPS.stepCoords;
    const redUnitStepPrev     = redPS.stepPrev;
    const blueUnitStepCoords  = bluePS.stepCoords;
    const blueUnitStepPrev    = bluePS.stepPrev;

    // Per-step baselines from FeatureCollection.properties (the rich block).
    const steps      = [];
    const phaseTable = [];

    // Cumulative red losses counter (units that transitioned into a degraded
    // status_change at least once). Used for the panel's "RED coy-eq" readout.
    const redKilledOnce = new Set();

    for (let i = 0; i < stepCount; i++) {
        const cp          = stepJsons[i].properties || {};
        const time_label  = cp.time_label || `P${i}`;
        const elapsed_h   = parseElapsedHours(time_label, i);
        const kindNative  = cp.kind || null;
        const phaseLegacy = (kindNative && W3_PHASE_TO_LEGACY[kindNative])
                            || w4PhaseLabel(i, stepCount);
        const plKm        = Number.isFinite(cp.phase_line_km) ? cp.phase_line_km : 0;
        const frLocal     = Number.isFinite(cp.force_ratio_local) ? cp.force_ratio_local : null;
        const advantage   = String(cp.step_advantage || '');

        phaseTable.push({
            index:         i,
            time_label,
            elapsed_hours: elapsed_h,
            phase:         phaseLegacy,
            kind_native:   kindNative,
        });

        // Objective status: use step_advantage + phase progression.
        // All 17 W3 steps have BLUE_ADV → final result is DENIED.
        let objStatus;
        if (i < 5)                         objStatus = 'DORMANT';
        else if (i < 9)                    objStatus = 'THREATENED';
        else if (i < stepCount - 1)        objStatus = 'CONTESTED';
        else                               objStatus = advantage === 'RED_ADV' ? 'CAPTURED' : 'DENIED';

        // Per-step unit outcomes + actor / affected detail.
        //
        // The W3 schema distinguishes 6 status_change values: destroyed,
        // damaged_partial, suppressed, delayed, expended, unchanged. Only
        // `destroyed` is sticky and should drive the kill-X overlay; the
        // others are per-phase damage states that should colour-tint the
        // marker but not retire it. We track them in two buckets:
        //   - blue_destroyed_baseline / red_degraded_baseline:
        //       uids that have transitioned to DESTROYED status (sticky)
        //   - affected[]: per-step damage detail for ALL affected units
        //       including the destroyed ones; the renderer reads this to
        //       apply STATUS_COLORS tint and resets it each step.
        const blueDestroyed = [];
        const redDegraded   = [];
        const redStrength   = {};
        const actors        = [];
        const affected      = [];
        // Per-step "live state" map for EVERY unit: keyed by uid, captures
        // the source's full operational state — strengths, status flags,
        // domain-specific counters (magazine, airframes, hulls). This is
        // the W3 schema's `unit` live-state block (see schema/README.md).
        // The renderer can read this to drive hover tooltips, panel detail
        // tabs, and analytics without re-parsing source GeoJSON.
        const unitState = {};

        const isDamageStatus = (sc) => sc && sc !== 'unchanged' && sc !== 'ok';

        for (const f of stepJsons[i].features) {
            const p = f && f.properties;
            if (!p || p.kind !== 'unit' || !p.uid) continue;
            const destroyed = (p.destroyed === true) || (p.status_change === 'destroyed');
            if (p.side === 'RED') {
                const str = (Number.isFinite(p.current_strength) && Number.isFinite(p.initial_strength) && p.initial_strength > 0)
                    ? p.current_strength / p.initial_strength : 1.0;
                redStrength[p.uid] = +(str.toFixed(3));
                if (destroyed) {
                    redDegraded.push(p.uid);
                    redKilledOnce.add(p.uid);
                }
            } else if (p.side === 'BLUE') {
                if (destroyed) blueDestroyed.push(p.uid);
            }
            // Capture the full per-unit live state for this phase. Every
            // field that varies phase-to-phase ends up here so consumers
            // can read e.g. "R-SSM magazine = 8 missiles remaining" or
            // "B-d2-3-048 airframes = 11 of 12" without going back to
            // the source GeoJSON. Sticky fields (destroyed) are still on
            // top-level red_degraded / blue_destroyed for the legacy
            // pipeline.
            unitState[p.uid] = {
                current_strength: Number.isFinite(p.current_strength) ? p.current_strength : null,
                initial_strength: Number.isFinite(p.initial_strength) ? p.initial_strength : null,
                destroyed:        p.destroyed === true,
                suppressed_pct:   Number.isFinite(p.suppressed_pct)   ? p.suppressed_pct   : 0,
                delayed_pct:      Number.isFinite(p.delayed_pct)      ? p.delayed_pct      : 0,
                // Domain-specific counters — non-null only when applicable.
                // The W3 schema uses these for "munitions remaining" type
                // bookkeeping. Surfacing them lets the operator see e.g.
                // an SSM brigade's magazine dropping or a sqdn's airframes
                // being attrited.
                magazine:         Number.isFinite(p.magazine)         ? p.magazine         : null,
                airframes:        Number.isFinite(p.airframes)        ? p.airframes        : null,
                hulls_remaining:  Number.isFinite(p.hulls_remaining)  ? p.hulls_remaining  : null,
                is_actor:         p.is_actor    === true,
                is_affected:      p.is_affected === true,
            };
            // Actor narrative: any side, any phase. The renderer can show a
            // floating callout above the marker for the duration of the phase.
            if (p.is_actor) {
                actors.push({
                    uid:                    p.uid,
                    side:                   p.side,
                    action_component:       p.action_component || null,
                    action_what:            p.action_what || null,
                    action_why:             p.action_why || null,
                    action_intended_effect: p.action_intended_effect || null,
                    action_doctrine_cited:  Array.isArray(p.action_doctrine_cited) ? p.action_doctrine_cited : null,
                });
            }
            // Affected detail: cause-effect chain. Captures every damage
            // event this step (including destroyed). The renderer tints
            // markers per status_change and clears tints not in this list.
            if (p.is_affected && isDamageStatus(p.status_change)) {
                affected.push({
                    uid:            p.uid,
                    side:           p.side,
                    status_change:  p.status_change,
                    damage_pct:     Number.isFinite(p.damage_pct) ? p.damage_pct : null,
                    cause_actor:    p.cause_actor || null,
                    cause_what:     p.cause_what || null,
                    cause_doctrine: p.cause_doctrine || null,
                });
            }
        }

        // BLS status mirrors Red's momentum: LIMITED pre-H, THREATENED early assault, SECURE once inland.
        const blsStatus = i < 5 ? 'LIMITED' : i < 12 ? 'THREATENED' : 'SECURE';

        // Engagement arcs: one entry per `kind: "engagement_arc"` LineString
        // in this step. The renderer draws these as dashed polylines colored
        // by status_change, fading after ~1.5s. Per schema README.
        //
        // The W3 source emits arc coordinates using each unit's source
        // position, which for staged off-map units is the literal
        // placeholder coord ([18, 32], [18.3, 32.5], …) — that would draw
        // arcs leaping ~280 km north of the AOR into the deep
        // Mediterranean. We remap each arc endpoint through the ported
        // per-step coords (offshore staging or on-map) so arcs always
        // connect the ON-SCREEN positions of the actor and target.
        function arcEndpointFor(uid, side, fallback) {
            if (!uid) return fallback;
            const arr = side === 'BLUE' ? blueUnitStepCoords[uid] : redUnitStepCoords[uid];
            if (Array.isArray(arr) && arr[i]) return arr[i];
            return fallback;
        }
        const arcDescriptions = [];
        const engagementArcs  = [];
        for (const f of stepJsons[i].features) {
            const p = f && f.properties;
            if (!p || p.kind !== 'engagement_arc') continue;
            const raw = f.geometry && Array.isArray(f.geometry.coordinates)
                          ? f.geometry.coordinates : null;
            // Remap each endpoint to the ported on-map position by joining
            // on cause_actor / target_uid → red/blue_unit_step_coords[step].
            // Falls back to the raw arc coord if the uid isn't in the OOB
            // (e.g. an arc referencing an off_map_marker we didn't extract).
            let coords = raw;
            if (raw && raw.length === 2) {
                const a = arcEndpointFor(p.cause_actor, p.actor_side, raw[0]);
                const t = arcEndpointFor(p.target_uid,  p.target_side, raw[1]);
                coords = [a, t];
            }
            engagementArcs.push({
                actor_uid:      p.cause_actor || null,
                target_uid:     p.target_uid || null,
                actor_side:     p.actor_side || null,
                target_side:    p.target_side || null,
                status_change:  p.status_change || 'unchanged',
                damage_pct:     Number.isFinite(p.damage_pct) ? p.damage_pct : null,
                cause_what:     p.cause_what || null,
                cause_doctrine: p.cause_doctrine || null,
                coordinates:    coords,
            });
            if (p.cause_what) arcDescriptions.push(`[${p.actor_side}→${p.target_side}] ${p.cause_what}`);
        }
        const detailedNarEn = cp.combined_effect
            ? cp.combined_effect + (arcDescriptions.length ? '\n\nEngagements:\n' + arcDescriptions.join('\n') : '')
            : arcDescriptions.join('\n');

        steps.push({
            index:                          i,
            time_label,
            elapsed_hours:                  elapsed_h,
            phase:                          phaseLegacy,
            kind_native:                    kindNative,
            phase_name_ar:                  cp.phase_name_ar   || null,
            phase_line_km_baseline:         plKm,
            objective_status_baseline:      objStatus,
            decision_point_baseline:        null,
            force_ratio_baseline:           frLocal,
            // The W3 source distinguishes LOCAL (close-fight) vs OPERATIONAL
            // (theater-level) force ratios. Preserve both — the legacy
            // `force_ratio_baseline` keeps the local number for the panel,
            // and the new operational field is exposed for analytics.
            force_ratio_local:              Number.isFinite(cp.force_ratio_local)       ? cp.force_ratio_local       : null,
            force_ratio_operational:        Number.isFinite(cp.force_ratio_operational) ? cp.force_ratio_operational : null,
            // step_advantage is the source's call on who won this phase
            // (RED_ADV / BLUE_ADV). We preserve it as a first-class field
            // and ALSO push it through ew_effect_baseline for back-compat
            // with the legacy HUD that reads ew_effect.
            step_advantage:                 cp.step_advantage  || null,
            ew_effect_baseline:             cp.step_advantage  || null,
            mobility_state_baseline:        null,
            logistics_state_baseline:       null,
            // Long-form English narrative summarizing the phase. The W3
            // source pre-computes this in `combined_effect`; we keep the
            // raw source string available alongside the engagement-appended
            // version used by the legacy panel.
            combined_effect:                cp.combined_effect || null,
            narrative_en_fallback:          detailedNarEn,
            narrative_ar_fallback:          cp.phase_name_ar   || '',
            bls_status_baseline:            { 'BLS-1': blsStatus },
            blue_destroyed_baseline:        unique(blueDestroyed),
            blue_destroyed_count_baseline:  unique(blueDestroyed).length,
            red_losses_cumulative_baseline: redKilledOnce.size,
            red_degraded_baseline:          unique(redDegraded),
            red_strength_baseline:          redStrength,
            red_active_markers_baseline:    null,
            // Source's own counts of feature presence this phase. Useful
            // for sanity checks (n_actors should equal actors.length, etc.).
            n_units:                        Number.isFinite(cp.n_units)            ? cp.n_units            : null,
            n_actors:                       Number.isFinite(cp.n_actors)           ? cp.n_actors           : actors.length,
            n_affected:                     Number.isFinite(cp.n_affected)         ? cp.n_affected         : affected.length,
            n_engagement_arcs:              Number.isFinite(cp.n_engagement_arcs)  ? cp.n_engagement_arcs  : engagementArcs.length,
            actors,
            affected,
            engagement_arcs:                engagementArcs,
            // Per-unit live state map: uid → { current_strength, initial_strength,
            // destroyed, suppressed_pct, delayed_pct, magazine, airframes,
            // hulls_remaining, is_actor, is_affected }. The W3 schema's
            // full per-phase unit block.
            unit_state:                     unitState,
        });
    }

    return {
        name:                meta.name     || defaultName,
        model_version:       meta.model_version || `${defaultName}-v1.0`,
        scenario_label:      meta.scenario_label || 'Wargame 3 — Brega Amphibious Assault (173-unit OOB, 17 phases)',
        map_bbox:            meta.map_bbox  || bbox,
        obj:                 meta.obj       || obj,
        pipeline:            (meta.pipeline && meta.pipeline.length) ? meta.pipeline : pipeline,
        red_units:              redUnits,
        red_unit_step_coords:   redUnitStepCoords,
        red_unit_step_prev:     redUnitStepPrev,
        blue_units_base_ids:    blueInitial.map(b => b.base_id),
        blue_units_initial:     blueInitial,
        blue_unit_step_coords:  blueUnitStepCoords,
        blue_unit_step_prev:    blueUnitStepPrev,
        blue_units_source:      'derived from W3 step00 unit features (173-unit full OOB)',
        // Off-map markers: ~11 strategic-level bases / SSM brigades that
        // exist outside the AOR. Phase-independent (same coords across
        // all 17 steps). Renderer draws them as small dimmed points to
        // contextualize "where Red's fighters launch from", etc.
        off_map_markers:        offMapMarkers,
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
