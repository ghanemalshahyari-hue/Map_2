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
            // PR-DOCTRINE-A: operator-declared engagement posture (read-only echo;
            // null for W3 → doctrine evidence falls back to 'active'). Evidence source only.
            posture: u.posture || null,
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
            // PR-DOCTRINE-A: side/scenario doctrine echo (WCS/EMCON/ROE/engage_ambiguous).
            // {} for W3 (no authored doctrine) → side-level doctrine evidence uses defaults.
            // Read-only projection; the single sanctioned read path for doctrine evidence.
            doctrine: clone(obj(scn.doctrine)),
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
                readiness: null, supply: null, posture: null, sensors: [], weapons: [], magazines: [],
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

        // PR-DB1: enrich units with DB1 capability catalog BEFORE deriving,
        // so that derived fields (e.g., contacts) can read enriched sensors/weapons.
        if (typeof root.AppWorldStateDB === 'object' && typeof root.AppWorldStateDB.enrichWorldState === 'function') {
            try { ws = root.AppWorldStateDB.enrichWorldState(ws) || ws; } catch (_) {}
        }

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

    // PR-WS4: a unit's operational weight in company-equivalents, used by the
    // balance math (force ratio + losses) and, later, threat/control. Kept
    // BEHIND A HELPER so DB2 can replace the source (unit profile: role/domain/
    // capability) without rewriting any caller. Today: an echelon lookup. The
    // table is the only place these constants live.
    var ECHELON_OPERATIONAL_WEIGHT = {
        division: 9, brigade: 3, regiment: 3, battalion: 1, company: 0.33, platoon: 0.1, team: 0.05
    };
    function getUnitOperationalWeight(unit) {
        var u = obj(unit);
        var ech = (u.echelon == null ? '' : String(u.echelon)).toLowerCase().trim();
        var w = ECHELON_OPERATIONAL_WEIGHT[ech];
        return (typeof w === 'number') ? w : 1;   // default ≈ company-plus
    }

    // PR-WS4: balance computed FROM World State units — the first real
    // Units → Balance link. Operational force ratio = Σ(red live·weight) /
    // Σ(blue live·weight); losses from unit status/strength. Pure; returns nulls
    // when units are absent so the objective rule falls back to the mirror.
    function computeBalanceSummary(ws) {
        var units = arr(ws && ws.units).filter(function (u) { return u && !u.off_map; });
        if (!units.length) return { force_ratio_value: null, losses: null };
        var redForce = 0, blueForce = 0, blueDestroyed = 0, blueTotal = 0, redCoyEq = 0;
        units.forEach(function (u) {
            var w = getUnitOperationalWeight(u);
            var s = (typeof u.strength === 'number' && isFinite(u.strength)) ? u.strength : 1;
            var live = Math.max(0, Math.min(1, s));
            var dead = (u.status === 'DESTROYED') || s <= 0;
            if (u.side === 'RED') {
                redForce += (dead ? 0 : live) * w;
                redCoyEq += (1 - live) * w;             // attrition in coy-equivalents
            } else if (u.side === 'BLUE') {
                blueTotal += 1;
                if (dead) blueDestroyed += 1; else blueForce += live * w;
            }
        });
        var fr = (blueForce > 0) ? (redForce / blueForce) : null;
        return {
            force_ratio_value: (fr != null && isFinite(fr)) ? Math.round(fr * 10) / 10 : null,
            losses: {
                blue_destroyed: blueDestroyed,
                blue_total: blueTotal,
                red_company_equivalent: Math.round(redCoyEq * 10) / 10
            }
        };
    }

    // PR-WS-BLS-A: contest zone radius — any RED unit closer than this (nm)
    // is counted as local to a BLS. One constant; no thresholds below.
    var BLS_RADIUS_NM = 10;   // 10 nm ≈ 18.5 km

    // PR-WS-BLS-A: first BLS ownership inversion.
    // Rule: CONTESTED if any non-destroyed, non-off-map RED unit is within
    // BLS_RADIUS_NM of the BLS position; STAGED otherwise.
    // Returns a { [bls_id]: 'CONTESTED'|'STAGED' } map, or null when the
    // parity gate fires (degraded/no-unit scenarios) so the renderer falls
    // through to the authored state.bls_status.
    function computeBlsStatus(ws) {
        if (!ws || ws.degraded) return null;
        var bls = arr(ws.lines && ws.lines.bls);
        if (!bls.length) return null;
        var allUnits = arr(ws.units);
        if (!allUnits.length) return null;  // parity gate: no units in scenario at all
        // Live RED units that can contest a BLS (destroyed / off-map are excluded).
        var reds = allUnits.filter(function (u) {
            return u.side === 'RED' && !u.off_map &&
                   u.status !== 'DESTROYED' && Array.isArray(u.position);
        });
        var result = {};
        bls.forEach(function (b) {
            if (!b.id || !Array.isArray(b.position)) return;
            var near = reds.some(function (u) {
                var d = nmBetween(b.position, u.position);
                return d != null && d <= BLS_RADIUS_NM;
            });
            result[b.id] = near ? 'CONTESTED' : 'STAGED';
        });
        return Object.keys(result).length ? result : null;
    }

    // PR-WS-BLS-B: control-based BLS status (SIMPLE ownership model).
    // Rule: STAGED if empty; SECURED if Red only; DENIED if Blue only;
    // CONTESTED if both Red & Blue are present locally.
    // This is a TEMPORARY, EXPLAINABLE model. Future MTH1 may replace it
    // with a richer control-score formula (e.g., force ratio, distance weight).
    // Uses the same BLS_RADIUS_NM (10 nm) and parity gates as WS-BLS-A.
    function computeBlsStatusB(ws) {
        if (!ws || ws.degraded) return null;
        var bls = arr(ws.lines && ws.lines.bls);
        if (!bls.length) return null;
        var allUnits = arr(ws.units);
        if (!allUnits.length) return null;  // parity gate: no units in scenario at all
        // Live units (destroyed / off-map excluded).
        var reds = allUnits.filter(function (u) {
            return u.side === 'RED' && !u.off_map &&
                   u.status !== 'DESTROYED' && Array.isArray(u.position);
        });
        var blues = allUnits.filter(function (u) {
            return u.side === 'BLUE' && !u.off_map &&
                   u.status !== 'DESTROYED' && Array.isArray(u.position);
        });
        var result = {};
        bls.forEach(function (b) {
            if (!b.id || !Array.isArray(b.position)) return;
            // Count live units of each side within radius.
            var redNear = reds.some(function (u) {
                var d = nmBetween(b.position, u.position);
                return d != null && d <= BLS_RADIUS_NM;
            });
            var blueNear = blues.some(function (u) {
                var d = nmBetween(b.position, u.position);
                return d != null && d <= BLS_RADIUS_NM;
            });
            // Control framing: who is present, who controls?
            if (!redNear && !blueNear) {
                result[b.id] = 'STAGED';      // empty beach
            } else if (redNear && !blueNear) {
                result[b.id] = 'SECURED';     // Red controls unopposed
            } else if (!redNear && blueNear) {
                result[b.id] = 'DENIED';      // Blue controls unopposed
            } else {
                result[b.id] = 'CONTESTED';   // both fighting for it
            }
        });
        return Object.keys(result).length ? result : null;
    }

    // PR-OBJ-A: Objective Evidence Ledger — evidence aggregation point.
    // Flat array of evidence records (no nesting, no grouping).
    // Each record: objective_id, evidence_type, value, source, confidence, step_index.
    // Storage only; no weights, scoring, or interpretation (deferred to OBJ-B).
    // Aggregates from: balance_summary, bls_status, engagement_outcomes, contacts.
    function computeObjectiveEvidence(ws) {
        if (!ws || ws.degraded) return null;  // parity gate
        var objectives = arr(ws.objectives);
        if (!objectives.length) return null;
        var objId = (objectives[0] && (objectives[0].id || objectives[0].objective_id)) || 'objective_0';
        var step = ws.meta ? (ws.meta.step_index || 0) : 0;
        var d = obj(ws && ws.derived);
        var result = [];

        // Collect evidence from balance_summary
        var bal = obj(d.balance_summary);
        if (bal.force_ratio_value != null) {
            result.push({
                objective_id: objId,
                evidence_type: 'force_ratio',
                value: bal.force_ratio_value,
                source: 'balance_summary',
                confidence: 0.95,
                step_index: step
            });
        }
        var losses = obj(bal.losses);
        if (losses.blue_destroyed != null) {
            result.push({
                objective_id: objId,
                evidence_type: 'blue_destroyed_count',
                value: losses.blue_destroyed,
                source: 'balance_summary',
                confidence: 1.0,
                step_index: step
            });
        }
        if (losses.blue_total != null && losses.blue_destroyed != null) {
            result.push({
                objective_id: objId,
                evidence_type: 'blue_intact_ratio',
                value: (losses.blue_total - losses.blue_destroyed) / losses.blue_total,
                source: 'balance_summary',
                confidence: 1.0,
                step_index: step
            });
        }
        if (losses.red_company_equivalent != null) {
            result.push({
                objective_id: objId,
                evidence_type: 'red_company_equivalent',
                value: losses.red_company_equivalent,
                source: 'balance_summary',
                confidence: 0.9,
                step_index: step
            });
        }

        // Collect evidence from bls_status
        var blsStatus = obj(d.bls_status);
        var blsControlCount = 0, blsContestedCount = 0, blsDeniedCount = 0, blsSecuredCount = 0;
        for (var blsKey in blsStatus) {
            if (Object.prototype.hasOwnProperty.call(blsStatus, blsKey)) {
                var status = blsStatus[blsKey];
                if (status === 'CONTESTED') blsContestedCount++;
                else if (status === 'DENIED') blsDeniedCount++;
                else if (status === 'SECURED') blsSecuredCount++;
            }
        }
        if (blsSecuredCount > 0 || blsDeniedCount > 0) {
            result.push({
                objective_id: objId,
                evidence_type: 'bls_control_count',
                value: blsSecuredCount + blsDeniedCount,
                source: 'bls_status',
                confidence: 1.0,
                step_index: step
            });
        }
        if (blsContestedCount > 0) {
            result.push({
                objective_id: objId,
                evidence_type: 'bls_contested_count',
                value: blsContestedCount,
                source: 'bls_status',
                confidence: 1.0,
                step_index: step
            });
        }

        // Collect evidence from engagement_outcomes
        var outcomes = arr(d.engagement_outcomes);
        if (outcomes.length > 0) {
            result.push({
                objective_id: objId,
                evidence_type: 'engagement_outcomes_total',
                value: outcomes.length,
                source: 'engagement_outcomes',
                confidence: 1.0,
                step_index: step
            });
            var engagedCount = outcomes.filter(function(o) { return o.status === 'engaged'; }).length;
            result.push({
                objective_id: objId,
                evidence_type: 'engagement_effectiveness_ratio',
                value: engagedCount / outcomes.length,
                source: 'engagement_outcomes',
                confidence: 0.85,
                step_index: step
            });
        }

        // Collect evidence from contacts
        var contacts = arr(d.contacts);
        if (contacts.length > 0) {
            var firmCount = contacts.filter(function(c) { return c.confidence === 'firm'; }).length;
            var probableCount = contacts.filter(function(c) { return c.confidence === 'probable'; }).length;
            var possibleCount = contacts.filter(function(c) { return c.confidence === 'possible'; }).length;
            result.push({
                objective_id: objId,
                evidence_type: 'contact_confidence_summary',
                value: {
                    total: contacts.length,
                    firm: firmCount,
                    probable: probableCount,
                    possible: possibleCount
                },
                source: 'contacts',
                confidence: 0.95,
                step_index: step
            });
        }

        // Collect evidence from readiness (READINESS-A: operational capability)
        // Uses existing fields: units[].strength, units[].status, units[].readiness, units[].supply
        // and engagement outcomes from balance_summary
        var units = arr(ws.units);
        var blueUnits = units.filter(function(u) { return u.side === 'BLUE' && !u.off_map; });

        // Type 1: unit_strength_avg — normalized operational effectiveness
        if (blueUnits.length > 0) {
            var totalStrength = 0, validStrengthCount = 0;
            for (var ui = 0; ui < blueUnits.length; ui++) {
                var u = blueUnits[ui];
                var str = num(u.strength);
                if (str != null) {
                    totalStrength += str;
                    validStrengthCount++;
                }
            }
            if (validStrengthCount > 0) {
                var avgStr = totalStrength / validStrengthCount;
                // normalize from 0..2.5 to 0..1
                var normalizedStr = Math.max(0, Math.min(1, (avgStr - 0.5) / 2.0));
                result.push({
                    objective_id: objId,
                    evidence_type: 'unit_strength_avg',
                    value: normalizedStr,
                    source: 'engagement_outcomes + balance_summary',
                    confidence: 0.85,
                    step_index: step
                });
            }
        }

        // Type 2: force_availability_ratio — percentage of force still active
        if (losses.blue_total != null && losses.blue_destroyed != null && losses.blue_total > 0) {
            var activeUnits = losses.blue_total - losses.blue_destroyed;
            var availability = activeUnits / losses.blue_total;
            result.push({
                objective_id: objId,
                evidence_type: 'force_availability_ratio',
                value: Math.max(0, Math.min(1, availability)),
                source: 'balance_summary.losses',
                confidence: 1.0,
                step_index: step
            });
        }

        // Type 3: ammunition_sustainability — estimated remaining ammo from engagements
        var outcomes = arr(d.engagement_outcomes);
        if (outcomes.length > 0) {
            var totalSalvo = 0;
            for (var oi = 0; oi < outcomes.length; oi++) {
                var o = outcomes[oi];
                var salvo = num(o.salvo);
                if (salvo != null) totalSalvo += salvo;
            }
            // Estimate: assume 1 magazine per shooter unit initially, each magazine ~30 rounds
            // After X salvos, magazine state estimated as remaining rounds
            var blueShooters = {};
            for (var oi2 = 0; oi2 < outcomes.length; oi2++) {
                var o2 = outcomes[oi2];
                if (o2.shooter && o2.shooter.uid) {
                    var shooterUid = o2.shooter.uid;
                    blueShooters[shooterUid] = (blueShooters[shooterUid] || 0) + num(o2.salvo || 0);
                }
            }
            var shoeterCount = Object.keys(blueShooters).length;
            if (shoeterCount > 0) {
                var roundsPerMag = 30;
                var totalMagRounds = shoeterCount * roundsPerMag;
                var estimatedRemaining = Math.max(0, totalMagRounds - totalSalvo);
                var ammoSustainability = estimatedRemaining / totalMagRounds;
                result.push({
                    objective_id: objId,
                    evidence_type: 'ammunition_sustainability',
                    value: Math.max(0, Math.min(1, ammoSustainability)),
                    source: 'engagement_outcomes',
                    confidence: 0.75,
                    step_index: step
                });
            } else {
                // No engagements yet — assume full magazines
                result.push({
                    objective_id: objId,
                    evidence_type: 'ammunition_sustainability',
                    value: 1.0,
                    source: 'engagement_outcomes',
                    confidence: 0.75,
                    step_index: step
                });
            }
        } else {
            // No engagement outcomes — assume full magazines
            result.push({
                objective_id: objId,
                evidence_type: 'ammunition_sustainability',
                value: 1.0,
                source: 'engagement_outcomes',
                confidence: 0.75,
                step_index: step
            });
        }

        // Type 4: supply_sustainability — average supply level
        if (blueUnits.length > 0) {
            var totalSupply = 0, supplyCount = 0;
            for (var sui = 0; sui < blueUnits.length; sui++) {
                var suUnit = blueUnits[sui];
                var sup = num(suUnit.supply);
                if (sup != null) {
                    totalSupply += sup;
                    supplyCount++;
                }
            }
            if (supplyCount > 0) {
                var avgSupply = totalSupply / supplyCount;
                result.push({
                    objective_id: objId,
                    evidence_type: 'supply_sustainability',
                    value: Math.max(0, Math.min(1, avgSupply)),
                    source: 'ws.units[].supply',
                    confidence: 0.7,
                    step_index: step
                });
            } else {
                // Supply field missing — fallback
                result.push({
                    objective_id: objId,
                    evidence_type: 'supply_sustainability',
                    value: 0.5,
                    source: 'ws.units[].supply',
                    confidence: 0.7,
                    step_index: step
                });
            }
        }

        // Type 5: combat_readiness_state — authored readiness enum
        if (blueUnits.length > 0) {
            var readyCount = 0, limitedCount = 0, notReadyCount = 0;
            for (var rui = 0; rui < blueUnits.length; rui++) {
                var runit = blueUnits[rui];
                var rdiness = runit.readiness || 'ready';
                if (rdiness === 'ready') readyCount++;
                else if (rdiness === 'limited') limitedCount++;
                else if (rdiness === 'not_ready') notReadyCount++;
            }
            // State is the majority state
            var maxCount = Math.max(readyCount, limitedCount, notReadyCount);
            var state = 'ready';
            if (limitedCount === maxCount) state = 'limited';
            else if (notReadyCount === maxCount) state = 'not_ready';
            result.push({
                objective_id: objId,
                evidence_type: 'combat_readiness_state',
                value: state,
                source: 'ws.units[].readiness',
                confidence: 0.8,
                step_index: step
            });
        }

        // Type 6: casualty_rate — fraction of force lost
        if (losses.blue_total != null && losses.blue_destroyed != null && losses.blue_total > 0) {
            var casualtyRate = losses.blue_destroyed / losses.blue_total;
            result.push({
                objective_id: objId,
                evidence_type: 'casualty_rate',
                value: Math.max(0, Math.min(1, casualtyRate)),
                source: 'balance_summary.losses',
                confidence: 0.9,
                step_index: step
            });
        }

        // PR-DOCTRINE-A: doctrine evidence (classification + read + defaults).
        // SOURCE layer only — no ROE/WRA/targeting/engagement behavior, no consumption.
        // Contract: DOCTRINE-A-SPECIFICATION.md. Records ride this same flat ledger.
        var doctrineRecords = computeDoctrineEvidence(ws, objId, step);
        for (var dri = 0; dri < doctrineRecords.length; dri++) result.push(doctrineRecords[dri]);

        return result.length ? result : null;
    }

    // PR-DOCTRINE-A: Doctrine evidence contributor — NOT a behavior engine.
    // Classifies + reads + defaults doctrine into evidence records (the 9 types in
    // DOCTRINE-A-SPECIFICATION.md). Pure: no mutation, no scoring, no decisions, no
    // consumption. Unit-level aggregates computed over BLUE units (the operator's
    // force, consistent with READINESS-A). Confidence = provenance certainty; a
    // hard-coded default for an absent scenario field drops confidence to 0.5 and
    // tags the source "(default — no scenario doctrine)".
    var DOCTRINE_POSTURES = ['active', 'defensive', 'hold', 'retire'];
    var DOCTRINE_WCS_DEFAULT = { air: 'FREE', surface: 'FREE', subsurface: 'HOLD' };

    function computeDoctrineEvidence(ws, objId, step) {
        var result = [];
        var units = arr(ws && ws.units);
        var blueUnits = units.filter(function (u) { return u.side === 'BLUE' && !u.off_map; });
        var doctrine = obj(ws && ws.doctrine);
        var majorityPosture = 'active';

        function rec(type, value, source, confidence) {
            return { objective_id: objId, evidence_type: type, value: value,
                     source: source, confidence: confidence, step_index: step };
        }

        // Type 1: unit_doctrine_tags — unique tags across BLUE units (from DB1 enrichment).
        if (blueUnits.length) {
            var tagSet = {};
            blueUnits.forEach(function (u) {
                arr(u.doctrine_tags).forEach(function (t) { if (t) tagSet[t] = true; });
            });
            var tags = Object.keys(tagSet).sort();
            result.push(rec('unit_doctrine_tags', tags, 'ws.units[].doctrine_tags',
                            tags.length ? 0.95 : 0.5));
        }

        // Type 2: unit_echelon_level — dominant (most common) echelon among BLUE units.
        if (blueUnits.length) {
            var ech = {};
            blueUnits.forEach(function (u) { if (u.echelon) ech[u.echelon] = (ech[u.echelon] || 0) + 1; });
            var echKeys = Object.keys(ech);
            if (echKeys.length) {
                echKeys.sort(function (a, b) { return ech[b] - ech[a] || (a < b ? -1 : 1); });
                result.push(rec('unit_echelon_level', echKeys[0], 'ws.units[].echelon', 0.95));
            } else {
                result.push(rec('unit_echelon_level', null, 'ws.units[].echelon', 0.5));
            }
        }

        // Type 3: unit_posture_state — majority posture (unauthored/null → 'active').
        if (blueUnits.length) {
            var pc = {};
            blueUnits.forEach(function (u) {
                var p = (DOCTRINE_POSTURES.indexOf(u.posture) >= 0) ? u.posture : 'active';
                pc[p] = (pc[p] || 0) + 1;
            });
            var pk = Object.keys(pc);
            pk.sort(function (a, b) { return pc[b] - pc[a] || (a < b ? -1 : 1); });
            majorityPosture = pk[0];
            var anyAuthored = blueUnits.some(function (u) { return DOCTRINE_POSTURES.indexOf(u.posture) >= 0; });
            result.push(rec('unit_posture_state', majorityPosture, 'ws.units[].posture',
                            anyAuthored ? 0.85 : 0.5));
        }

        // Type 4: side_weapons_control_status — per-domain ROE state (default liberal).
        var wcsAuthored = doctrine.weapon_control_status && typeof doctrine.weapon_control_status === 'object';
        var wcsSrc = doctrine.weapon_control_status || {};
        var wcs = {
            air: wcsSrc.air || DOCTRINE_WCS_DEFAULT.air,
            surface: wcsSrc.surface || DOCTRINE_WCS_DEFAULT.surface,
            subsurface: wcsSrc.subsurface || DOCTRINE_WCS_DEFAULT.subsurface
        };
        result.push(rec('side_weapons_control_status', wcs,
                        wcsAuthored ? 'ws.doctrine.weapon_control_status'
                                    : 'ws.doctrine.weapon_control_status (default — no scenario doctrine)',
                        wcsAuthored ? 0.95 : 0.5));

        // Type 5: side_emcon_status — electronics control state (default 'active').
        var emconAuthored = typeof doctrine.emcon === 'string';
        var emconVal = emconAuthored ? doctrine.emcon : 'active';
        result.push(rec('side_emcon_status', emconVal,
                        emconAuthored ? 'ws.doctrine.emcon'
                                      : 'ws.doctrine.emcon (default — no scenario doctrine)',
                        emconAuthored ? 0.9 : 0.5));

        // Type 6: side_engage_ambiguous — engage unidentified contacts? (default false, conservative).
        var ambAuthored = typeof doctrine.engage_ambiguous === 'boolean';
        result.push(rec('side_engage_ambiguous', ambAuthored ? doctrine.engage_ambiguous : false,
                        ambAuthored ? 'ws.doctrine.engage_ambiguous'
                                    : 'ws.doctrine.engage_ambiguous (default — no scenario doctrine)',
                        ambAuthored ? 0.95 : 0.5));

        // Type 7: unit_doctrine_inheritance_scope — inferred; W3 has no mission/override → 'side'.
        if (blueUnits.length) {
            result.push(rec('unit_doctrine_inheritance_scope', 'side',
                            'inferred (role/echelon; no mission/override fields)', 0.8));
        }

        // Type 8: objective_doctrine_priority — authored or CMO default (first objective = primary).
        var firstObj = obj(arr(ws && ws.objectives)[0]);
        var priorityAuthored = typeof firstObj.doctrine_priority === 'string';
        result.push(rec('objective_doctrine_priority',
                        priorityAuthored ? firstObj.doctrine_priority : 'primary',
                        priorityAuthored ? 'ws.objectives[].doctrine_priority'
                                         : 'objectives[].doctrine_priority (CMO default — first objective)',
                        0.7));

        // Type 9: doctrine_compliance_summary — audit trail. No enforcement: every unit is
        // "compliant" (DOCTRINE-A does not judge); constraints list = active non-default rules.
        if (blueUnits.length) {
            var constraints = [];
            if (wcs.air !== 'FREE') constraints.push('WCS_air_' + wcs.air);
            if (wcs.surface !== 'FREE') constraints.push('WCS_surface_' + wcs.surface);
            if (wcs.subsurface !== 'FREE') constraints.push('WCS_subsurface_' + wcs.subsurface);
            if (emconVal !== 'active') constraints.push('EMCON_' + emconVal);
            if (majorityPosture === 'hold') constraints.push('POSTURE_hold');
            result.push(rec('doctrine_compliance_summary', {
                compliant_unit_count: blueUnits.length,
                non_compliant_unit_count: 0,
                doctrine_constraints_active: constraints
            }, 'aggregate (doctrine_tags + ws.doctrine)', 0.75));
        }

        return result;
    }

    // Helper: extract evidence value by type from evidence ledger.
    // PR-OBJ-B: evidence-based consumer (replaces direct balance_summary reads).
    function getEvidenceValue(evidence, type) {
        if (!Array.isArray(evidence)) return null;
        for (var i = 0; i < evidence.length; i++) {
            if (evidence[i].evidence_type === type) return evidence[i].value;
        }
        return null;
    }

    // Objective status display: only CAPTURED is re-litigated against the
    // evidence (force ratio + losses); every other status passes through.
    // PR-OBJ-B: evidence is read from objective_evidence ledger (WS-owned);
    // balance_summary fallback remains for parity gate (degraded scenarios).
    function computeObjectiveStatusDisplay(ws) {
        var d = obj(ws && ws.derived);
        var status = d.objective_status || 'DORMANT';
        if (status !== 'CAPTURED') return status;

        // PR-OBJ-B: Try evidence ledger first
        var evidence = arr(d.objective_evidence);
        var useEvidencePath = evidence && evidence.length > 0;

        var frNum, blueLost, blueTotal, redCoyEq, frBlocks;

        if (useEvidencePath) {
            // Primary path: extract from objective_evidence ledger
            frNum    = getEvidenceValue(evidence, 'force_ratio');
            blueLost = getEvidenceValue(evidence, 'blue_destroyed_count');
            redCoyEq = getEvidenceValue(evidence, 'red_company_equivalent');
            // Compute blueTotal from blue_intact_ratio if available
            var blueIntactRatio = getEvidenceValue(evidence, 'blue_intact_ratio');
            if (blueIntactRatio != null && blueLost != null) {
                blueTotal = blueLost / (1 - blueIntactRatio);
            } else {
                blueTotal = 39;  // default fallback (from W3 scenario)
            }
            frBlocks = false;  // no keyword blocks from evidence ledger (only from authored mirror)
        } else {
            // Fallback path: use balance_summary (backward compat)
            var bal = obj(d.balance_summary);
            var b = obj(ws && ws.balance);
            var haveComputedFr = (typeof bal.force_ratio_value === 'number');
            frNum    = haveComputedFr ? bal.force_ratio_value : parseFrRatio(String(b.force_ratio || ''));
            frBlocks = !haveComputedFr && /\b(below\s+decisive|not\s+engaged|N\/A)\b/i.test(String(b.force_ratio || ''));
            var cl = obj(bal.losses);
            var lc = (cl.blue_destroyed != null || cl.red_company_equivalent != null) ? cl : obj(b.losses);
            blueLost  = Number(lc.blue_destroyed) || 0;
            blueTotal = Number(lc.blue_total) || 39;
            redCoyEq  = Number(lc.red_company_equivalent) || 0;
        }

        // Apply thresholds (unchanged logic)
        var frNumBlocks = (frNum !== null && frNum < 2);
        var blueIntact  = (blueLost / blueTotal) < 0.25;
        var redSpent    = redCoyEq > 6;
        if (frBlocks || frNumBlocks || blueIntact || redSpent) return 'DENIED';
        return status;
    }
    // Registry: derived-field name -> pure rule. The runner writes each result
    // into ws.derived[name]. This is the ONE place a new derived field is added.
    // ORDER MATTERS: balance_summary runs first so the objective rule sees the
    // computed evidence. New derived fields are added here (one row each).
    // PR-WS-DET1-A: contact generation — DET1 ownership inversion.
    // Computes detection contacts (radar/ESM) from enriched units (sensors, RCS).
    // Returns array of contacts with confidence/range or null if engine unavailable.
    // Parity gate: degraded scenario or missing engine → null (fallback to authored).
    function computeContacts(ws) {
        if (!ws || ws.degraded) return null;
        var det = root.AppDetection || (typeof require === 'function' ? (function() {
            try { return require('./detection.js'); } catch (_) { return null; }
        })() : null);
        if (!det || typeof det.computeContacts !== 'function') return null;
        try { return det.computeContacts(ws) || null; } catch (_) { return null; }
    }

    var DERIVATIONS = {
        balance_summary:          computeBalanceSummary,
        bls_status:               computeBlsStatusB,
        contacts:                 computeContacts,
        objective_evidence:       computeObjectiveEvidence,        // PR-OBJ-A: evidence ledger (before status)
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
        // PR-WS4: balance computed from units + the swappable weight helper
        // (DB2 will replace getUnitOperationalWeight's source).
        computeBalanceSummary: computeBalanceSummary,
        getUnitOperationalWeight: getUnitOperationalWeight,
        // PR-WS-BLS-A: BLS ownership inversion (presence-only rule).
        computeBlsStatus: computeBlsStatus,
        // PR-WS-BLS-B: BLS control ownership (STAGED/SECURED/DENIED/CONTESTED).
        // Temporary, explainable model; future MTH1 may use richer formula.
        computeBlsStatusB: computeBlsStatusB,
        // PR-WS-DET1-A: contact generation from World State (DET1 ownership inversion).
        // Computes detection contacts (radar/ESM) from enriched units with sensors.
        computeContacts: computeContacts,
        // PR-OBJ-A: objective evidence ledger (flat array of evidence records).
        // Aggregates balance, BLS, engagements, contacts into auditable evidence.
        computeObjectiveEvidence: computeObjectiveEvidence,
        // PR-DOCTRINE-A: doctrine evidence contributor (9 types). SOURCE layer only —
        // classification + read + defaults, no behavior. See DOCTRINE-A-SPECIFICATION.md.
        computeDoctrineEvidence: computeDoctrineEvidence,
        BLS_RADIUS_NM: BLS_RADIUS_NM,
        DERIVATIONS: DERIVATIONS,
        // exposed for tests / future rule modules
        _bearing: bearing,
        _nmBetween: nmBetween
    };

    root.AppWorldState = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
