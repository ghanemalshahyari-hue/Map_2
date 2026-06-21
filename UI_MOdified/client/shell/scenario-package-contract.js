/* ============================================================================
 * scenario-package-contract.js — RMOOZ-AI-FREE-FIGHT-OPERATING-1 (Slice 1)
 * ----------------------------------------------------------------------------
 * The CANONICAL resolved-scenario contract. One pure normalizer that turns an
 * imported scenario package into the single inspectable object the operator
 * flow reads everywhere:
 *
 *   { scenario_id, operation_name, area_of_interest, objectives[], units[],
 *     infrastructure[], resolver_report[] }
 *
 * Each objective/unit carries coord + coord_status (exact|candidate|missing) +
 * confidence + source (json|gazetteer|llm|manual|candidate) + needs_review.
 *
 * It accepts EITHER:
 *   (a) a live RMOOZ scenario object (red_units / blue_units_initial / obj …), OR
 *   (b) a "Review AI Understanding" payload ({ brief.operational_brief, placement })
 *       produced by /api/wargame-sim/analyze + /api/wargame-sim/placement.
 *
 * It REUSES (does not replace) the existing extraction the engine already does —
 * this is a read-only projection for honest import summaries + the AI/non-AI
 * fork. It NEVER mutates inputs, calls the network, or touches window.units/map.
 *
 * Coords are [lon, lat] throughout (matching scenario JSON + the spec contract).
 *
 * Window API: window.RmoozScenarioPackage = { build, summarize, coordStatusOf }
 * Node:       module.exports = same
 * ========================================================================== */
(function (global) {
    'use strict';

    function isFiniteNum(n) { return typeof n === 'number' && isFinite(n); }
    function arr(x) { return Array.isArray(x) ? x : []; }
    function obj(x) { return (x && typeof x === 'object' && !Array.isArray(x)) ? x : {}; }
    function str(x) { return x == null ? '' : String(x); }
    function norm(s) { return str(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }

    // Accept a coord in any of the shapes the codebase uses and return [lon,lat]
    // or null. Scenario JSON is [lon,lat]; planning-model uses position:[lon,lat];
    // some payloads carry flat lat/lon. Never guesses — only finite pairs pass.
    function toLonLat(o) {
        if (!o) return null;
        if (Array.isArray(o) && o.length >= 2 && isFiniteNum(+o[0]) && isFiniteNum(+o[1])) return [+o[0], +o[1]];
        if (Array.isArray(o.coord) && o.coord.length >= 2 && isFiniteNum(+o.coord[0]) && isFiniteNum(+o.coord[1])) return [+o.coord[0], +o.coord[1]];
        if (Array.isArray(o.position) && o.position.length >= 2 && isFiniteNum(+o.position[0]) && isFiniteNum(+o.position[1])) return [+o.position[0], +o.position[1]];
        if (isFiniteNum(+o.lon) && isFiniteNum(+o.lat)) return [+o.lon, +o.lat];
        if (isFiniteNum(+o.lng) && isFiniteNum(+o.lat)) return [+o.lng, +o.lat];
        return null;
    }

    // Coarse domain inference (engine's Step-1 gate is authoritative for tasking;
    // this is only for the import summary). Honors an explicit domain first.
    function inferDomain(u) {
        var d = norm(u && (u.domain || u.warfare_domain));
        if (/air.?def|sam|missile.?def/.test(d)) return 'air_defense';
        if (d) {
            if (/air|aircraft|fighter|fixed|rotary|uav/.test(d)) return 'air';
            if (/naval|ship|sea|mar/.test(d)) return 'naval';
            if (/ground|land|mech|armor|infantry/.test(d)) return 'ground';
            if (/fires|artillery|mlrs|rocket/.test(d)) return 'fires';
            if (/base|airfield|port|facility/.test(d)) return 'base';
            if (/support|logist|c2|command/.test(d)) return 'support';
        }
        var r = norm(u && u.role);
        if (/air.?def|sam/.test(r)) return 'air_defense';
        if (/air|cap|strike|intercept|sortie/.test(r)) return 'air';
        if (/naval|ship|patrol|blockade|interdict/.test(r)) return 'naval';
        if (/fires|artillery|mlrs/.test(r)) return 'fires';
        if (/command|c2|hq|support|logist/.test(r)) return 'support';
        if (/ground|maneuver|mech|armor|infantry|assault|hold|defend/.test(r)) return 'ground';
        return 'unknown';
    }

    // Resolve the placement candidate (if any) the resolver produced for a name.
    // Returns { lonlat, confidence, source, placement_type } or null.
    function candidateFor(name, candidates) {
        var n = norm(name);
        if (!n) return null;
        for (var i = 0; i < candidates.length; i++) {
            var c = candidates[i];
            var names = [c.mention, c.canonical, c.normalized_name, c.name, c.base_name, c.base_name_en, c.location_name]
                .map(norm).filter(Boolean);
            if (names.indexOf(n) === -1) continue;
            var ll = toLonLat(c);
            if (!ll) continue;
            var src = (c.source && (c.source.origin || c.source.type)) || c.origin || 'gazetteer';
            return {
                lonlat: ll,
                confidence: isFiniteNum(+c.confidence) ? +c.confidence : null,
                source: src === 'location_db' ? 'gazetteer' : (src === 'llm_candidate' ? 'llm' : str(src) || 'candidate'),
                placement_type: c.placement_type || null,
            };
        }
        return null;
    }

    // Stamp a coord_status object for one entity given its raw coord + any resolver
    // candidate keyed by its name. Pure — returns a fresh object.
    function resolveEntity(rawCoord, name, candidates) {
        var exact = toLonLat(rawCoord);
        if (exact) {
            return { coord: exact, coord_status: 'exact', confidence: 1, source: 'json', needs_review: false };
        }
        var cand = candidateFor(name, candidates);
        if (cand) {
            return {
                coord: cand.lonlat, coord_status: 'candidate',
                confidence: cand.confidence == null ? 0.5 : cand.confidence,
                source: cand.source, needs_review: true,
                placement_type: cand.placement_type || undefined,
            };
        }
        return { coord: null, coord_status: 'missing', confidence: 0, source: 'candidate', needs_review: true };
    }

    // ── input adapters ───────────────────────────────────────────────────────
    // Pull the raw unit/objective/AOI lists out of whichever shape we were given.
    function extract(input) {
        input = obj(input);
        // Review payload: { brief: { operational_brief: {...} }, placement: {...}, understanding }
        var review = input.brief || input.placement || input.understanding;
        if (review) {
            var ob = obj((input.brief && input.brief.operational_brief) || input.brief);
            var placement = obj(input.placement);
            var cands = []
                .concat(arr(placement.placement_candidates))
                .concat(arr(ob.placement_candidates))
                .concat(arr(ob.enemy_bases))
                .concat(arr(ob.country_bases));
            return {
                kind: 'review',
                scenario_id: str(ob.scenario_id || input.scenario_id || 'imported'),
                operation_name: str(ob.operation_name || ob.operation || input.operation_name || ''),
                aoi: ob.area_of_interest || ob.ao || ob.aoi || null,
                rawUnits: arr(ob.proposed_units),
                rawObjectives: arr(ob.objectives),
                rawInfra: arr(ob.infrastructure).concat(arr(ob.country_bases)),
                candidates: cands,
                missing: arr(placement.missing_information),
                report: arr(placement.source_summary),
            };
        }
        // Live scenario object: red_units / blue_units_initial / obj
        var s = obj(input.scenario || input);
        var redUnits = arr(s.red_units).map(function (u) { return assignSide(u, 'RED'); });
        var blueUnits = arr(s.blue_units_initial || s.blue_units).map(function (u) { return assignSide(u, 'BLUE'); });
        var neutralUnits = arr(s.neutral_units).map(function (u) { return assignSide(u, 'NEUTRAL'); });
        var objectives = arr(s.objectives);
        if (!objectives.length && (s.obj || s.objective)) objectives = [s.obj || s.objective];
        return {
            kind: 'scenario',
            scenario_id: str(s.scenario_id || s.name || 'scenario'),
            operation_name: str(s.operation_name || s.scenario_label || s.name || ''),
            aoi: s.area_of_interest || (s.map_bbox ? { bbox: s.map_bbox } : null),
            rawUnits: redUnits.concat(blueUnits).concat(neutralUnits),
            rawObjectives: objectives,
            rawInfra: arr(s.bases).concat(arr(s.infrastructure)),
            candidates: [],
            missing: [],
            report: [],
        };
    }
    function assignSide(u, side) { var c = obj(u); var o = {}; for (var k in c) o[k] = c[k]; if (!o.side) o.side = side; return o; }

    function uidOf(u, i) { return str(u.uid || u.unit_uid || u.id || ('U-' + (i + 1))); }
    function sideOf(u) {
        var s = str(u.side || u.force || u.team).toUpperCase();
        if (s.indexOf('RED') !== -1) return 'RED';
        if (s.indexOf('BLUE') !== -1) return 'BLUE';
        if (s.indexOf('NEUTRAL') !== -1 || s.indexOf('GREEN') !== -1 || s.indexOf('WHITE') !== -1) return 'NEUTRAL';
        return s || 'NEUTRAL';
    }

    // ── public: build the canonical resolved object ────────────────────────────
    function build(input) {
        var x = extract(input);
        var cands = x.candidates;

        var units = x.rawUnits.map(function (u, i) {
            u = obj(u);
            var name = str(u.label || u.name || u.display_name);
            var r = resolveEntity(u, name || uidOf(u, i), cands);
            return {
                uid: uidOf(u, i),
                side: sideOf(u),
                name: name || uidOf(u, i),
                domain: inferDomain(u),
                home_base: str(u.home_base || u.base_id || u.assigned_base_id || u.assigned_base || ''),
                coord: r.coord,
                coord_status: r.coord_status,
                confidence: r.confidence,
                taskable: r.coord_status === 'exact',
                source: r.source,
                needs_review: r.needs_review,
            };
        });

        var objectives = x.rawObjectives.map(function (o, i) {
            o = obj(o);
            var name = str(o.name || o.label || o.objective_name || ('OBJ-' + String(i + 1).padStart(3, '0')));
            var r = resolveEntity(o, name, cands);
            return {
                id: str(o.id || o.objective_id || ('OBJ-' + String(i + 1).padStart(3, '0'))),
                name: name,
                type: str(o.type || o.kind || 'unknown'),
                coord: r.coord,
                coord_status: r.coord_status,
                confidence: r.confidence,
                source: r.source,
                needs_review: r.needs_review,
            };
        });

        var infrastructure = x.rawInfra.map(function (f, i) {
            f = obj(f);
            var name = str(f.name || f.base_name || f.label || ('INFRA-' + (i + 1)));
            var r = resolveEntity(f, name, cands);
            return { id: str(f.id || f.base_id || ('INFRA-' + (i + 1))), name: name, type: str(f.type || f.kind || 'infrastructure'),
                coord: r.coord, coord_status: r.coord_status, confidence: r.confidence, source: r.source, needs_review: r.needs_review };
        });

        // resolver_report: one row per missing/weak item + the resolver's own notes.
        var report = [];
        objectives.concat(units).concat(infrastructure).forEach(function (e) {
            if (e.coord_status !== 'exact') {
                report.push({ ref: e.id || e.uid, name: e.name, status: e.coord_status, source: e.source,
                    confidence: e.confidence, needs_review: e.needs_review });
            }
        });
        arr(x.missing).forEach(function (m) {
            report.push({ ref: str((m && (m.mention || m.name)) || 'unknown'), name: str(m && (m.mention || m.name)),
                status: 'missing', source: 'resolver', confidence: 0, needs_review: true,
                note: str(m && (m.reason || m.warning || m.warnings)) || 'unresolved' });
        });

        return {
            scenario_id: x.scenario_id,
            operation_name: x.operation_name,
            area_of_interest: x.aoi || null,
            objectives: objectives,
            units: units,
            infrastructure: infrastructure,
            resolver_report: report,
            _kind: x.kind,
        };
    }

    function coordStatusOf(e) { return (e && e.coord_status) || 'missing'; }

    // ── public: a compact, honest summary for the operator UI ──────────────────
    function summarize(resolved) {
        resolved = obj(resolved);
        var units = arr(resolved.units), objs = arr(resolved.objectives);
        function bySide(side) { return units.filter(function (u) { return u.side === side; }); }
        function counts(list) {
            var c = { total: list.length, exact: 0, candidate: 0, missing: 0 };
            list.forEach(function (e) { c[coordStatusOf(e)] = (c[coordStatusOf(e)] || 0) + 1; });
            return c;
        }
        var red = bySide('RED'), blue = bySide('BLUE'), neutral = bySide('NEUTRAL');
        var allMissing = units.concat(objs).filter(function (e) { return coordStatusOf(e) === 'missing'; }).length;
        var allCandidate = units.concat(objs).filter(function (e) { return coordStatusOf(e) === 'candidate'; }).length;
        return {
            operation_name: resolved.operation_name || resolved.scenario_id || 'scenario',
            red: counts(red), blue: counts(blue), neutral: counts(neutral),
            objectives: counts(objs),
            taskable_units: units.filter(function (u) { return u.taskable; }).length,
            total_units: units.length,
            unresolved: allMissing,
            candidates_proposed: allCandidate,
            review_required: allMissing > 0 || allCandidate > 0,
        };
    }

    var API = { build: build, summarize: summarize, coordStatusOf: coordStatusOf };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof window !== 'undefined') window.RmoozScenarioPackage = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
