/* ============================================================================
 * world-state.js — RMOOZ World State Engine (PR-WS1: projection + components)
 * ----------------------------------------------------------------------------
 * Direction reset 2026-06-01: RMOOZ = World State + AI Decision Support +
 * Operator Review + Operational Visualization. Mimic CMO STRUCTURALLY (composite
 * platforms, kinematics, detection/engagement rules) — NOT by copying its data.
 * See memory [[project_rmooz_direction_reset]] + APP_INVENTORY "ACTIVE BUILD ROADMAP".
 *
 * PR-WS1 scope — the FOUNDATION, deliberately small & safe:
 *   - deriveWorldState(scenario, stepIndex) → normalized, region-agnostic snapshot
 *     that READS an existing scenario (W3-rich or degraded) WITHOUT mutating it.
 *   - Units carry the CMO-style COMPONENT shape: sensors[] / weapons[] / magazines[]
 *     (empty for W3 today; populated once RMOOZ DB-Lite lands in PR-DB1).
 *   - Units carry KINEMATICS (course / heading / speed_kn) so PR-MOVE1 can do
 *     continuous motion instead of per-step teleport.
 *   - contacts[] + a detection seam (filled by PR-DET1).
 *   - applyDecision(state, decision) → nextState : PURE transition SEED (PR-WS3
 *     grows this). Never mutates its input.
 *
 * SAFETY: pure data. No DOM, no fetch, no storage, no mutation of the live
 * scenario. NOT wired into adjudicator-map / applyState — Wargame 3 renders
 * exactly as before. Framework-free so it can also run server-side later.
 * ========================================================================== */
(function (root) {
    'use strict';

    var WS_VERSION = '1.0.0-ws1';

    /* ---- helpers ---------------------------------------------------------- */
    function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
    function arr(v) { return Array.isArray(v) ? v : []; }
    function obj(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; }
    function clone(o) { try { return JSON.parse(JSON.stringify(o)); } catch (_) { return o; } }
    function clampStep(scn, i) {
        var steps = arr(scn.steps);
        if (!steps.length) return 0;
        if (typeof i !== 'number' || i < 0) return 0;
        return i >= steps.length ? steps.length - 1 : i;
    }
    function coordAt(map, uid, step, fallback) {
        var seq = map && map[uid];
        if (Array.isArray(seq) && seq.length) {
            var c = seq[Math.min(step, seq.length - 1)];
            if (Array.isArray(c) && c.length >= 2) return [c[0], c[1]];
        }
        return (Array.isArray(fallback) && fallback.length >= 2) ? [fallback[0], fallback[1]] : null;
    }
    // Great-circle-ish bearing (deg, 0=N) — adequate at regional scale.
    function bearing(a, b) {
        if (!a || !b) return null;
        var toR = Math.PI / 180, toD = 180 / Math.PI;
        var lon1 = a[0] * toR, lat1 = a[1] * toR, lon2 = b[0] * toR, lat2 = b[1] * toR;
        var y = Math.sin(lon2 - lon1) * Math.cos(lat2);
        var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
        var d = Math.atan2(y, x) * toD;
        return (d + 360) % 360;
    }
    function nmBetween(a, b) {
        if (!a || !b) return null;
        var toR = Math.PI / 180, R = 3440.065; // nm
        var dLat = (b[1] - a[1]) * toR, dLon = (b[0] - a[0]) * toR;
        var lat1 = a[1] * toR, lat2 = b[1] * toR;
        var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
    }

    /* ---- per-unit projection (incl. CMO-style component slots + kinematics) */
    function projectUnit(u, side, scn, step, prevElapsed, curElapsed) {
        var uid = u.unit_uid || u.uid;
        if (!uid) return null;
        var coordMap = side === 'BLUE' ? scn.blue_unit_step_coords : scn.red_unit_step_coords;
        var prevMap  = side === 'BLUE' ? scn.blue_unit_step_prev   : scn.red_unit_step_prev;
        var pos  = coordAt(coordMap, uid, step, u.coord);
        var prev = coordAt(prevMap, uid, step, null) || coordAt(coordMap, uid, Math.max(0, step - 1), null);

        // live per-unit state for this step (W3 carries steps[i].unit_state[uid])
        var us = obj((obj(arr(scn.steps)[step]).unit_state) || {})[uid] || {};

        // kinematics: full course (all known step positions) + heading/speed for MOVE1
        var course = [];
        var seq = coordMap && coordMap[uid];
        if (Array.isArray(seq)) seq.forEach(function (c) {
            if (Array.isArray(c) && c.length >= 2) course.push([c[0], c[1]]);
        });
        var heading = bearing(prev, pos);
        var dNm = nmBetween(prev, pos);
        var dHr = (num(curElapsed) != null && num(prevElapsed) != null) ? (curElapsed - prevElapsed) : null;
        var speedKn = (dNm != null && dHr && dHr > 0) ? (dNm / dHr) : null;

        return {
            uid: uid,
            side: side,
            role: u.role || null,
            domain: u.domain || null,
            echelon: u.echelon || null,
            sidc: u.sidc || null,
            label: u.label || u.name_ar || u.name_en || null,
            position: pos,
            // live state
            strength: num(us.current_strength != null ? us.current_strength : u.strength),
            status: us.destroyed ? 'DESTROYED' : (us.status || null),
            suppressed_pct: num(us.suppressed_pct),
            // operator/sustainment slots (null for W3; filled by DB-Lite/WS3)
            readiness: u.readiness || null,
            supply: num(u.supply),
            // CMO-style COMPONENT shape — empty for W3, populated by PR-DB1
            sensors: arr(u.sensors),
            weapons: arr(u.weapons),
            magazines: arr(u.magazines),
            // kinematics for PR-MOVE1 (continuous motion, not teleport)
            kinematics: { prev: prev, course: course, heading: heading, speed_kn: speedKn }
        };
    }

    /* ---- main projection -------------------------------------------------- */
    function deriveWorldState(scenario, stepIndex) {
        var scn = obj(scenario);
        var step = clampStep(scn, stepIndex);
        var steps = arr(scn.steps);
        var s = obj(steps[step]);
        var sPrev = obj(steps[Math.max(0, step - 1)]);
        var w3 = scn.schema_variant === 'w3-rich';
        var curEl = num(s.elapsed_hours), prevEl = num(sPrev.elapsed_hours);

        var ws = {
            ws_version: WS_VERSION,
            source_variant: scn.schema_variant || null,
            degraded: !w3,                         // honest: non-W3 = positions/objectives/phase only
            meta: {
                scenario_id: scn.scenario_id || null,
                scenario_label: scn.scenario_label || scn.name || null,
                step_index: step,
                step_count: steps.length,
                phase: s.phase || null,
                time_label: s.time_label || null,
                elapsed_hours: curEl
            },
            region: {
                bbox: Array.isArray(scn.map_bbox) ? scn.map_bbox.slice() : null,
                ao_boundaries: clone(arr(scn.ao_boundaries))
            },
            objectives: [],
            units: [],
            contacts: [],                          // seam — filled by PR-DET1
            lines: {
                phase_line_km: num(s.phase_line_km_baseline),
                bls: arr(scn.bls_template).map(function (b) {
                    return { id: b.name || null, position: b.coord || null,
                             status: null, throughput: num(b.throughput),
                             terrain_friction: num(b.terrain_friction) };
                })
            },
            balance: {
                force_ratio_local: num(s.force_ratio_local),
                force_ratio_operational: num(s.force_ratio_operational),
                // PR-WS2.5: inputs for the derived-field rules (force ratio string
                // + cumulative losses). Populated from scenario baselines here;
                // the live app overwrites them with the running `state` values
                // before re-running the rules (same Inputs→Rule→Output path).
                force_ratio: (typeof s.force_ratio_baseline === 'string') ? s.force_ratio_baseline : null,
                losses: {
                    blue_destroyed: num(s.blue_destroyed_count_baseline),
                    blue_total: num(s.blue_total),
                    red_company_equivalent: num(s.red_losses_cumulative_baseline)
                },
                ew_effect: s.ew_effect_baseline || null,
                logistics_state: s.logistics_state_baseline || null
            },
            decisions: [],                         // seam — appended by applyDecision / PR-WS3
            derived: {
                objective_status: s.objective_status_baseline || null,
                decision_point: s.decision_point_baseline || null
            }
        };

        // objective(s)
        var o = obj(scn.obj);
        if (o.name || o.coord) {
            ws.objectives.push({
                id: o.name || 'OBJ', name: o.name || null, position: o.coord || null,
                status: s.objective_status_baseline || null,
                radius_km: num(o.radius_km), target_depth_km: num(o.target_depth_km)
            });
        }

        // bls status per step (W3 carries one bls_status_baseline applied to staged set)
        var blsStatus = s.bls_status_baseline || null;
        if (blsStatus) ws.lines.bls.forEach(function (b) { if (b.status == null) b.status = blsStatus; });

        // units (red + blue)
        arr(scn.red_units).forEach(function (u) {
            var p = projectUnit(u, 'RED', scn, step, prevEl, curEl); if (p) ws.units.push(p);
        });
        arr(scn.blue_units_initial).forEach(function (u) {
            var p = projectUnit(u, 'BLUE', scn, step, prevEl, curEl); if (p) ws.units.push(p);
        });

        // off-map strategic markers → low-detail units (phase-independent)
        arr(scn.off_map_markers).forEach(function (m) {
            ws.units.push({
                uid: m.id, side: m.side || null, role: m.type || null, domain: 'strategic',
                echelon: null, sidc: m.sidc || null, label: m.name_ar || m.name_en || m.id,
                position: m.coord || null, strength: null, status: null, suppressed_pct: null,
                readiness: null, supply: null, sensors: [], weapons: [], magazines: [],
                kinematics: { prev: null, course: [], heading: null, speed_kn: null },
                off_map: true
            });
        });

        // step activity (actors / affected / engagement_arcs) — read-only echo
        ws.activity = {
            actors: clone(arr(s.actors)),
            affected: clone(arr(s.affected)),
            engagement_arcs: clone(arr(s.engagement_arcs))
        };

        // PR-WS2.5: World State computes its derived fields from its OWN inputs
        // (objective_status_display today; balance/threat/control/readiness later
        // add a row to DERIVATIONS). Owns the derivation, not just storage.
        applyDerivations(ws);
        return ws;
    }

    /* ---- derived-field rules (Inputs → Rule → Derived Output) -------------
     * Each rule is a PURE (ws) -> value that reads its inputs from the snapshot
     * and returns ONE derived output. World State owns the derivation; consumers
     * (the renderer, 3D, future formula layer) read the result. Add a future
     * field by adding ONE row to DERIVATIONS — same pattern, no new plumbing.
     * WS2.5 ships the first rule, relocated VERBATIM from the renderer's
     * deriveDisplayOutcome (no new formula).
     * ---------------------------------------------------------------------- */
    function parseFrRatio(s) {
        if (typeof s !== 'string') return null;
        var m = s.match(/^(\d{1,2}(?:\.\d)?):1/);
        return m ? Number(m[1]) : null;
    }
    // Objective status display: only CAPTURED is re-litigated against the
    // evidence (force ratio + losses); every other status passes through.
    function computeObjectiveStatusDisplay(ws) {
        var d = obj(ws && ws.derived);
        var status = d.objective_status || 'DORMANT';
        if (status !== 'CAPTURED') return status;
        var b = obj(ws && ws.balance);
        var fr = String(b.force_ratio || '');
        var lc = obj(b.losses);
        var blueLost  = Number(lc.blue_destroyed) || 0;
        var blueTotal = Number(lc.blue_total) || 39;
        var redCoyEq  = Number(lc.red_company_equivalent) || 0;
        var frBlocks    = /\b(below\s+decisive|not\s+engaged|N\/A)\b/i.test(fr);
        var frNum       = parseFrRatio(fr);
        var frNumBlocks = (frNum !== null && frNum < 2);
        var blueIntact  = (blueLost / blueTotal) < 0.25;
        var redSpent    = redCoyEq > 6;
        if (frBlocks || frNumBlocks || blueIntact || redSpent) return 'DENIED';
        return status;
    }
    // Registry: derived-field name -> pure rule. The runner writes each result
    // into ws.derived[name]. This is the ONE place a new derived field is added.
    var DERIVATIONS = {
        objective_status_display: computeObjectiveStatusDisplay
    };
    function applyDerivations(ws) {
        if (!ws) return ws;
        ws.derived = obj(ws.derived);
        for (var key in DERIVATIONS) {
            if (Object.prototype.hasOwnProperty.call(DERIVATIONS, key)) {
                ws.derived[key] = DERIVATIONS[key](ws);
            }
        }
        return ws;
    }

    /* ---- pure transition SEED (PR-WS3 expands) ---------------------------- */
    var DECISION_TYPES = ['NOTE', 'UNIT_MOVE', 'READINESS_DELTA', 'SUPPLY_DELTA'];

    function applyDecision(state, decision) {
        var next = clone(obj(state));               // never mutate input
        var d = obj(decision);
        next.decisions = arr(next.decisions).slice();
        next.decisions.push({
            step: next.meta ? next.meta.step_index : null,
            type: DECISION_TYPES.indexOf(d.type) >= 0 ? d.type : 'NOTE',
            actor: d.actor || null, target_uid: d.target_uid || null,
            value: (d.value !== undefined ? d.value : null), note: d.note || null
        });

        if (d.target_uid && Array.isArray(next.units)) {
            for (var i = 0; i < next.units.length; i++) {
                var u = next.units[i];
                if (u.uid !== d.target_uid) continue;
                if (d.type === 'UNIT_MOVE' && Array.isArray(d.value) && d.value.length >= 2) {
                    u.kinematics = u.kinematics || {};
                    u.kinematics.prev = u.position;
                    u.position = [d.value[0], d.value[1]];
                    u.kinematics.heading = bearing(u.kinematics.prev, u.position);
                } else if (d.type === 'READINESS_DELTA' && typeof d.value === 'string') {
                    u.readiness = d.value;
                } else if (d.type === 'SUPPLY_DELTA' && num(d.value) != null) {
                    var base = num(u.supply) != null ? u.supply : 1;
                    u.supply = Math.max(0, Math.min(1, base + d.value));
                }
                break;
            }
        }
        return next;
    }

    var api = {
        WS_VERSION: WS_VERSION,
        DECISION_TYPES: DECISION_TYPES,
        deriveWorldState: deriveWorldState,
        applyDecision: applyDecision,
        // PR-WS2.5: derived-field rules (Inputs → Rule → Derived Output).
        // applyDerivations re-runs all rules over a snapshot (used live after the
        // app projects fresh inputs); computeObjectiveStatusDisplay is the first.
        applyDerivations: applyDerivations,
        computeObjectiveStatusDisplay: computeObjectiveStatusDisplay,
        DERIVATIONS: DERIVATIONS,
        // exposed for tests / future rule modules
        _bearing: bearing,
        _nmBetween: nmBetween
    };

    root.AppWorldState = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
