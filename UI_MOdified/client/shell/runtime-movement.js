'use strict';

(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.AppRuntimeMovement = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    function arr(x) { return Array.isArray(x) ? x : []; }
    function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
    function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
    function num(v, fallback) { return isFinite(+v) ? +v : fallback; }
    function round6(n) { return Math.round(+n * 1e6) / 1e6; }
    var EARTH_RADIUS_KM = 6371.0088;
    var KNOT_TO_KPH = 1.852;
    // MOV3 deterministic defaults: ground 40 kph, naval 30 kt, air 800 kph, unknown 40 kph.
    var DOMAIN_DEFAULT_SPEED_KPH = {
        ground: 40,
        land: 40,
        naval: 30 * KNOT_TO_KPH,
        maritime: 30 * KNOT_TO_KPH,
        sea: 30 * KNOT_TO_KPH,
        air: 800,
        unknown: 40
    };

    function normalizePoint(p) {
        if (Array.isArray(p) && p.length >= 2 && isFinite(+p[0]) && isFinite(+p[1])) {
            return [round6(+p[0]), round6(+p[1])];
        }
        if (isObj(p)) {
            var x = p.lon != null ? p.lon : (p.lng != null ? p.lng : (p.x != null ? p.x : null));
            var y = p.lat != null ? p.lat : (p.y != null ? p.y : null);
            if (isFinite(+x) && isFinite(+y)) return [round6(+x), round6(+y)];
        }
        return null;
    }
    function samePoint(a, b) {
        a = normalizePoint(a); b = normalizePoint(b);
        return !!(a && b && Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9);
    }
    function coordinateDistance(a, b) {
        a = normalizePoint(a); b = normalizePoint(b);
        if (!a || !b) return 0;
        var dx = b[0] - a[0], dy = b[1] - a[1];
        return Math.sqrt(dx * dx + dy * dy);
    }
    function distanceKm(a, b) {
        a = normalizePoint(a); b = normalizePoint(b);
        if (!a || !b) return 0;
        var lat1 = a[1] * Math.PI / 180, lat2 = b[1] * Math.PI / 180;
        var dLat = (b[1] - a[1]) * Math.PI / 180;
        var dLon = (b[0] - a[0]) * Math.PI / 180;
        var sLat = Math.sin(dLat / 2), sLon = Math.sin(dLon / 2);
        var h = sLat * sLat + Math.cos(lat1) * Math.cos(lat2) * sLon * sLon;
        return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
    }
    function routeDistanceWith(route, distanceFn) {
        var total = 0;
        var pts = arr(route).map(normalizePoint).filter(Boolean);
        for (var i = 1; i < pts.length; i++) total += distanceFn(pts[i - 1], pts[i]);
        return total;
    }
    function routeDistance(route) { return round6(routeDistanceWith(route, distanceKm)); }
    function routeDistanceUnits(route) { return routeDistanceWith(route, coordinateDistance); }
    function metersPerDegreeLon(lat) {
        var c = Math.cos((isFinite(+lat) ? +lat : 0) * Math.PI / 180);
        return Math.max(1, 111320 * Math.abs(c));
    }
    function offsetPointMeters(point, eastMeters, northMeters) {
        var p = normalizePoint(point);
        if (!p) return null;
        var lat = p[1] + ((isFinite(+northMeters) ? +northMeters : 0) / 110574);
        var lon = p[0] + ((isFinite(+eastMeters) ? +eastMeters : 0) / metersPerDegreeLon(p[1]));
        return normalizePoint([lon, lat]);
    }
    function vectorMeters(a, b) {
        a = normalizePoint(a); b = normalizePoint(b);
        if (!a || !b) return { east: 0, north: 0 };
        var lat = (a[1] + b[1]) / 2;
        return {
            east: (b[0] - a[0]) * metersPerDegreeLon(lat),
            north: (b[1] - a[1]) * 110574
        };
    }
    function routeForwardUnit(route) {
        var pts = arr(route).map(normalizePoint).filter(Boolean);
        for (var i = 1; i < pts.length; i++) {
            var v = vectorMeters(pts[i - 1], pts[i]);
            var mag = Math.sqrt(v.east * v.east + v.north * v.north);
            if (mag > 1) return { east: v.east / mag, north: v.north / mag };
        }
        return { east: 1, north: 0 };
    }
    function offsetRouteMeters(route, eastMeters, northMeters) {
        return arr(route).map(function (p) { return offsetPointMeters(p, eastMeters, northMeters); }).filter(Boolean);
    }
    function interpolate(a, b, t) {
        a = normalizePoint(a); b = normalizePoint(b);
        if (!a || !b) return null;
        t = Math.max(0, Math.min(1, num(t, 0)));
        return [round6(a[0] + (b[0] - a[0]) * t), round6(a[1] + (b[1] - a[1]) * t)];
    }
    function routeSampleAtProgress(route, progress) {
        var pts = arr(route).map(normalizePoint).filter(Boolean);
        if (!pts.length) return { point: null, segment_index: null };
        if (pts.length === 1) return { point: pts[0].slice(), segment_index: 0 };
        progress = Math.max(0, Math.min(1, num(progress, 0)));
        if (progress <= 0) return { point: pts[0].slice(), segment_index: 0 };
        if (progress >= 1) return { point: pts[pts.length - 1].slice(), segment_index: Math.max(0, pts.length - 2) };
        var total = routeDistanceWith(pts, distanceKm);
        if (total <= 0) return { point: pts[pts.length - 1].slice(), segment_index: Math.max(0, pts.length - 2) };
        var target = total * progress, walked = 0;
        for (var i = 1; i < pts.length; i++) {
            var leg = distanceKm(pts[i - 1], pts[i]);
            if (walked + leg >= target) {
                return {
                    point: interpolate(pts[i - 1], pts[i], leg > 0 ? ((target - walked) / leg) : 1),
                    segment_index: i - 1
                };
            }
            walked += leg;
        }
        return { point: pts[pts.length - 1].slice(), segment_index: Math.max(0, pts.length - 2) };
    }
    function pointAtRouteProgress(route, progress) {
        var sample = routeSampleAtProgress(route, progress);
        return sample && sample.point;
    }
    function currentSegmentIndexAtRouteProgress(route, progress) {
        var sample = routeSampleAtProgress(route, progress);
        return sample ? sample.segment_index : null;
    }
    function trailAtRouteProgress(route, progress) {
        var pts = arr(route).map(normalizePoint).filter(Boolean);
        if (!pts.length) return [];
        if (pts.length === 1) return [pts[0].slice()];
        progress = Math.max(0, Math.min(1, num(progress, 0)));
        if (progress <= 0) return [pts[0].slice()];
        if (progress >= 1) return pts.map(clone);
        var total = routeDistanceWith(pts, distanceKm);
        if (total <= 0) return [pts[0].slice(), pts[pts.length - 1].slice()];
        var target = total * progress, walked = 0;
        var out = [pts[0].slice()];
        for (var i = 1; i < pts.length; i++) {
            var leg = distanceKm(pts[i - 1], pts[i]);
            if (walked + leg >= target) {
                var cur = interpolate(pts[i - 1], pts[i], leg > 0 ? ((target - walked) / leg) : 1);
                if (cur && !samePoint(out[out.length - 1], cur)) out.push(cur);
                return out;
            }
            walked += leg;
            if (!samePoint(out[out.length - 1], pts[i])) out.push(pts[i].slice());
        }
        return out;
    }

    function emptyState() {
        return {
            group_movements: {},
            movements: {},
            runtime_positions: {},
            runtime_world_state: { positions: {} },
            arrival_events: [],
            group_arrival_events: [],
            movement_runtime_events: [],
            pending_decision_points: {},
            runtime_flags: {},
            movement_journal_events: [],
            movement_journaled_ids: {},
            pending_journal_records: [],
            last_journal_error: null,
            last_movement_journal_error: null,
            arrival_triggers_fired: {}
        };
    }
    function normalizeMovementState(state) {
        var st = isObj(state) ? clone(state) : emptyState();
        st.group_movements = isObj(st.group_movements) ? st.group_movements : {};
        st.movements = isObj(st.movements) ? st.movements : {};
        st.runtime_positions = isObj(st.runtime_positions) ? st.runtime_positions : {};
        st.runtime_world_state = isObj(st.runtime_world_state) ? st.runtime_world_state : {};
        st.runtime_world_state.positions = isObj(st.runtime_world_state.positions) ? st.runtime_world_state.positions : {};
        st.arrival_events = arr(st.arrival_events);
        st.group_arrival_events = arr(st.group_arrival_events);
        st.movement_runtime_events = arr(st.movement_runtime_events);
        st.pending_decision_points = isObj(st.pending_decision_points) ? st.pending_decision_points : {};
        st.runtime_flags = isObj(st.runtime_flags) ? st.runtime_flags : {};
        st.movement_journal_events = arr(st.movement_journal_events);
        st.movement_journaled_ids = isObj(st.movement_journaled_ids) ? st.movement_journaled_ids : {};
        st.pending_journal_records = arr(st.pending_journal_records);
        st.last_journal_error = st.last_journal_error || null;
        st.last_movement_journal_error = st.last_movement_journal_error || null;
        st.arrival_triggers_fired = isObj(st.arrival_triggers_fired) ? st.arrival_triggers_fired : {};
        return st;
    }
    function movementId(plan) {
        return String((plan && (plan.movement_id || plan.execution_id || plan.source_effect_id || plan.effect_id)) || '');
    }
    function isMovementExecutionPlan(plan) {
        if (!isObj(plan)) return false;
        var kind = String(plan.effect_kind || plan.kind || plan.type || '').toLowerCase();
        if (kind === 'runtime_group_movement' || kind === 'group_movement' || kind === 'move_group') return true;
        if (kind === 'runtime_movement' || kind === 'movement' || kind === 'move_unit') return true;
        var p = isObj(plan.payload) ? plan.payload : {};
        var pk = String(p.effect_kind || p.kind || p.type || p.action_type || '').toLowerCase();
        return pk === 'runtime_group_movement' || pk === 'group_movement' || pk === 'move_group' ||
            pk === 'runtime_movement' || pk === 'movement' || pk === 'move_unit' || pk === 'move';
    }
    function isGroupMovementExecutionPlan(plan) {
        if (!isObj(plan)) return false;
        var p = isObj(plan.payload) ? plan.payload : {};
        var kind = String(plan.effect_kind || plan.kind || plan.type || p.effect_kind || p.kind || p.type || p.action_type || '').toLowerCase();
        return kind === 'runtime_group_movement' || kind === 'group_movement' || kind === 'move_group';
    }
    function candidatePosition(context, unitId) {
        var positions = (context && (context.runtime_positions || context.positions)) || {};
        if (unitId && positions && positions[unitId]) return normalizePoint(positions[unitId]);
        var units = arr(context && context.units);
        for (var i = 0; i < units.length; i++) {
            var u = units[i];
            if (!u) continue;
            var id = u.unit_id || u.uid || u.id || u.name;
            if (String(id) !== String(unitId)) continue;
            return normalizePoint(u.position || u.coord || u);
        }
        return null;
    }
    function candidateUnit(context, unitId) {
        var units = arr(context && context.units);
        for (var i = 0; i < units.length; i++) {
            var u = units[i];
            if (!u) continue;
            var id = u.unit_id || u.unit_uid || u.uid || u.id || u.name;
            if (String(id) === String(unitId)) return u;
        }
        return null;
    }
    function firstNum() {
        for (var i = 0; i < arguments.length; i++) {
            if (arguments[i] != null && arguments[i] !== '' && isFinite(+arguments[i])) return +arguments[i];
        }
        return NaN;
    }
    function speedResult(speed, speedKph, source, domain, units, speedKnots) {
        return {
            speed: isFinite(+speed) ? +speed : NaN,
            speed_kph: isFinite(+speedKph) ? round6(+speedKph) : null,
            speed_knots: isFinite(+speedKnots) ? round6(+speedKnots) : null,
            source: source,
            domain: domain || null,
            units: units || 'kph'
        };
    }
    function domainDefaultSpeedKph(domain) {
        var d = String(domain || 'unknown').toLowerCase();
        return DOMAIN_DEFAULT_SPEED_KPH[d] || DOMAIN_DEFAULT_SPEED_KPH.unknown;
    }
    function resolveMovementSpeed(plan, payload, context, unitId) {
        plan = plan || {};
        payload = payload || {};
        context = context || {};
        var unit = candidateUnit(context, unitId);
        var domain = String((payload && (payload.domain || payload.movement_domain)) || (plan && (plan.domain || plan.movement_domain)) || (unit && (unit.domain || unit.movement_domain)) || '').toLowerCase();

        var explicitKph = firstNum(payload.speed_kph, payload.movement_speed_kph, plan.speed_kph, plan.movement_speed_kph);
        if (isFinite(+explicitKph)) return speedResult(explicitKph, explicitKph, 'speed_kph', domain, 'kph');
        var explicitKnots = firstNum(payload.speed_knots, payload.movement_speed_knots, plan.speed_knots, plan.movement_speed_knots);
        if (isFinite(+explicitKnots)) return speedResult(explicitKnots * KNOT_TO_KPH, explicitKnots * KNOT_TO_KPH, 'speed_knots', domain, 'kph', explicitKnots);

        var explicitLegacy = firstNum(payload.speed, payload.speed_per_hour, plan.speed, plan.speed_per_hour);
        if (isFinite(+explicitLegacy)) return speedResult(explicitLegacy, null, 'speed', domain, 'route_units');

        var unitKphMaps = context.unit_speeds_kph || context.unit_speed_kph_by_id || context.unit_movement_speed_kph_by_id || {};
        var unitKph = unitId && unitKphMaps ? firstNum(unitKphMaps[unitId]) : NaN;
        if (!isFinite(+unitKph) && unit) unitKph = firstNum(unit.speed_kph, unit.movement_speed_kph);
        if (isFinite(+unitKph)) return speedResult(unitKph, unitKph, 'unit_speed_kph', domain, 'kph');

        var unitKnotsMaps = context.unit_speeds_knots || context.unit_speed_knots_by_id || {};
        var unitKnots = unitId && unitKnotsMaps ? firstNum(unitKnotsMaps[unitId]) : NaN;
        if (!isFinite(+unitKnots) && unit) unitKnots = firstNum(unit.speed_knots, unit.movement_speed_knots);
        if (isFinite(+unitKnots)) return speedResult(unitKnots * KNOT_TO_KPH, unitKnots * KNOT_TO_KPH, 'unit_speed_knots', domain, 'kph', unitKnots);

        var unitSpeeds = (context && (context.unit_speeds || context.unit_speed_by_id)) || {};
        var unitSpeed = unitId && unitSpeeds ? num(unitSpeeds[unitId], NaN) : NaN;
        if (isFinite(+unitSpeed)) return speedResult(unitSpeed, null, 'unit', domain, 'route_units');
        unitSpeed = unit ? firstNum(unit.speed, unit.speed_per_hour, unit.movement_speed) : NaN;
        if (isFinite(+unitSpeed)) return speedResult(unitSpeed, null, 'unit', domain, 'route_units');

        var domainSpeedsKph = (context && (context.domain_speeds_kph || context.speed_kph_by_domain || context.domain_speed_kph_by_id)) || {};
        var domainSpeedKph = domain && domainSpeedsKph ? num(domainSpeedsKph[domain], NaN) : NaN;
        if (isFinite(+domainSpeedKph)) return speedResult(domainSpeedKph, domainSpeedKph, 'domain', domain, 'kph');

        var domainSpeeds = (context && (context.domain_speeds || context.speed_by_domain)) || {};
        var domainSpeed = domain && domainSpeeds ? num(domainSpeeds[domain], NaN) : NaN;
        if (isFinite(+domainSpeed)) return speedResult(domainSpeed, null, 'domain', domain, 'route_units');

        var fallbackKph = firstNum(context && context.default_speed_kph, context && context.default_movement_speed_kph);
        if (isFinite(+fallbackKph)) return speedResult(fallbackKph, fallbackKph, 'default_speed_kph', domain, 'kph');
        var fallbackLegacy = num(context && context.default_speed, NaN);
        if (isFinite(+fallbackLegacy)) return speedResult(fallbackLegacy, null, 'default', domain, 'route_units');
        return speedResult(domainDefaultSpeedKph(domain), domainDefaultSpeedKph(domain), 'domain_default', domain || 'unknown', 'kph');
    }
    function movementFromExecutionPlan(plan, context) {
        var p = isObj(plan && plan.payload) ? plan.payload : {};
        var unitId = plan.unit_id || p.unit_id || p.unit_uid || p.uid || p.actor;
        var start = normalizePoint(p.from || p.start || p.current_position || candidatePosition(context, unitId));
        var end = normalizePoint(p.to || p.destination || p.target || p.position);
        var route = arr(p.route).map(normalizePoint).filter(Boolean);
        if (!route.length && start && end) route = [start, end];
        if (route.length) {
            start = route[0];
            end = route[route.length - 1];
        }
        var resolvedSpeed = resolveMovementSpeed(plan, p, context || {}, unitId);
        var speed = resolvedSpeed.speed;
        var distanceKm = routeDistance(route);
        var distanceUnits = routeDistanceUnits(route);
        var travelDistance = resolvedSpeed.units === 'route_units' ? distanceUnits : distanceKm;
        var started = num(context && context.elapsed_hours, num(p.start_elapsed_hours, num(plan.start_elapsed_hours, num(plan.planned_at_elapsed_hours, 0))));
        var id = movementId(plan);
        var base = {
            movement_id: id,
            execution_id: plan.execution_id || id,
            unit_id: unitId ? String(unitId) : '',
            from: start,
            to: end,
            route: route,
            speed: speed,
            speed_kph: resolvedSpeed.speed_kph,
            speed_knots: resolvedSpeed.speed_knots,
            speed_units: resolvedSpeed.units,
            speed_source: resolvedSpeed.source,
            domain: resolvedSpeed.domain || String((p.domain || p.movement_domain || plan.domain || plan.movement_domain || '') || '').toLowerCase() || null,
            distance_km: distanceKm,
            distance_units: round6(distanceUnits),
            started_at_elapsed_hours: started,
            eta_elapsed_hours: null,
            progress: 0,
            current_segment_index: route.length > 1 ? 0 : null,
            status: 'planned',
            source_execution_plan: clone(plan),
            current_position: start,
            trail: trailAtRouteProgress(route, 0),
            arrival_fired: false,
            reason: null
        };
        if (!id || !unitId || !start || !end || !route.length || !(speed > 0)) {
            base.status = 'blocked';
            base.reason = 'movement plan missing unit, route, destination, or positive speed';
            return base;
        }
        base.eta_elapsed_hours = travelDistance > 0 ? round6(started + (travelDistance / speed)) : started;
        if (samePoint(start, end) || travelDistance <= 0) {
            base.progress = 1;
            base.status = 'arrived';
            base.current_position = end;
            base.current_segment_index = currentSegmentIndexAtRouteProgress(route, 1);
        }
        return base;
    }
    function syncPosition(st, mv) {
        if (!mv || !mv.unit_id || !mv.current_position) return;
        mv.trail = trailAtRouteProgress(mv.route, mv.progress);
        mv.current_segment_index = currentSegmentIndexAtRouteProgress(mv.route, mv.progress);
        st.runtime_positions[mv.unit_id] = clone(mv.current_position);
        st.runtime_world_state.positions[mv.unit_id] = {
            unit_id: mv.unit_id,
            position: clone(mv.current_position),
            source: 'runtime_movement',
            movement_id: mv.movement_id,
            progress: mv.progress,
            status: mv.status,
            eta_elapsed_hours: mv.eta_elapsed_hours,
            distance_km: mv.distance_km,
            speed: mv.speed,
            speed_kph: mv.speed_kph,
            speed_knots: mv.speed_knots,
            speed_units: mv.speed_units || null,
            speed_source: mv.speed_source || null,
            domain: mv.domain || null,
            group_movement_id: mv.group_movement_id || null,
            group_id: mv.group_id || null,
            leader_unit_id: mv.leader_unit_id || null,
            formation: mv.formation || null,
            formation_index: isFinite(+mv.formation_index) ? +mv.formation_index : null,
            current_segment_index: mv.current_segment_index,
            current_position: clone(mv.current_position),
            route: clone(mv.route),
            trail: clone(mv.trail)
        };
    }
    function addJournal(st, kind, mv, elapsed) {
        if (!st || !mv || !mv.movement_id) return;
        if (kind === 'movement_update') return;
        var id = mv.movement_id + ':' + kind + ':' + (kind === 'movement_update' ? String(round6(num(elapsed, 0))) : 'once');
        if (st.movement_journaled_ids[id]) return;
        st.movement_journaled_ids[id] = true;
        st.movement_journal_events.push({
            schema_version: 'runtime-movement-v1',
            kind: kind,
            movement_id: mv.movement_id,
            execution_id: mv.execution_id,
            unit_id: mv.unit_id,
            elapsed_hours: isFinite(+elapsed) ? +elapsed : null,
            status: mv.status,
            progress: mv.progress,
            position: clone(mv.current_position),
            eta_elapsed_hours: mv.eta_elapsed_hours
        });
    }
    function maybeRound(n) { return isFinite(+n) ? round6(+n) : null; }
    function scenarioTimeLabel(options, elapsed) {
        options = isObj(options) ? options : {};
        if (options.scenario_time_label != null) return String(options.scenario_time_label);
        if (options.time_label != null) return String(options.time_label);
        if (!isFinite(+elapsed)) return null;
        return 'H+' + round6(+elapsed);
    }
    function movementRuntimeEventId(event) {
        return [
            event && event.kind,
            event && (event.event_id || event.trigger_id || event.movement_id || event.group_movement_id),
            event && event.unit_id,
            event && event.arrived_at_elapsed_hours
        ].map(function (v) { return v == null ? '' : String(v); }).join('|');
    }
    function pushMovementRuntimeEvent(st, event) {
        if (!st || !event || !event.kind) return null;
        var ev = clone(event);
        ev.source = ev.source || 'runtime_movement';
        ev.read_only = true;
        ev.event_id = ev.event_id || movementRuntimeEventId(ev);
        var id = 'runtime_event|' + movementRuntimeEventId(ev);
        if (st.arrival_triggers_fired[id]) return null;
        st.arrival_triggers_fired[id] = true;
        st.movement_runtime_events.push(ev);
        return ev;
    }
    function movementUnitArrivalRecord(mv, elapsed, options) {
        return {
            schema_version: 'runtime-movement-arrival-v1',
            source: 'runtime_movement',
            kind: 'movement_unit_arrived',
            movement_id: mv.movement_id || null,
            group_movement_id: mv.group_movement_id || null,
            unit_id: mv.unit_id || null,
            group_id: mv.group_id || null,
            arrived_at_elapsed_hours: maybeRound(elapsed),
            scenario_time_label: scenarioTimeLabel(options, elapsed),
            final_position: clone(normalizePoint(mv.current_position || mv.to)),
            route_distance_km: maybeRound(mv.distance_km),
            eta_elapsed_hours: maybeRound(mv.eta_elapsed_hours),
            status: 'arrived'
        };
    }
    function movementGroupLeader(st, gm) {
        if (!st || !gm || !gm.unit_movements) return null;
        var leaderId = gm.leader_unit_id || arr(gm.unit_ids)[0];
        return leaderId && st.movements ? st.movements[gm.unit_movements[leaderId]] : null;
    }
    function movementGroupArrivalRecord(st, gm, elapsed, options) {
        var leader = movementGroupLeader(st, gm);
        return {
            schema_version: 'runtime-movement-arrival-v1',
            source: 'runtime_movement',
            kind: 'movement_group_arrived',
            movement_id: gm.movement_id || gm.group_movement_id || null,
            group_movement_id: gm.group_movement_id || gm.movement_id || null,
            unit_id: null,
            group_id: gm.group_id || null,
            leader_unit_id: gm.leader_unit_id || null,
            unit_ids: clone(arr(gm.unit_ids).map(String)),
            arrived_unit_ids: clone(arr(gm.arrived_unit_ids).map(String)),
            arrived_at_elapsed_hours: maybeRound(elapsed),
            scenario_time_label: scenarioTimeLabel(options, elapsed),
            final_position: clone(normalizePoint(gm.leader_position || (leader && leader.current_position))),
            route_distance_km: maybeRound((leader && leader.distance_km) || routeDistance(gm.route)),
            eta_elapsed_hours: maybeRound(gm.group_eta_elapsed_hours),
            status: 'arrived'
        };
    }
    function movementJournalId(record) {
        return [
            record && record.schema_version,
            record && record.kind,
            record && record.movement_id,
            record && record.group_movement_id,
            record && record.unit_id,
            record && record.group_id,
            record && record.arrived_at_elapsed_hours
        ].map(function (v) { return v == null ? '' : String(v); }).join('|');
    }
    function rememberMovementJournalFailure(st, record, err) {
        var msg = err && err.message ? err.message : String(err || 'movement_journal_failed');
        st.last_journal_error = msg;
        st.last_movement_journal_error = msg;
        var id = movementJournalId(record);
        var exists = arr(st.pending_journal_records).some(function (r) { return movementJournalId(r) === id; });
        if (!exists) st.pending_journal_records.push(clone(record));
    }
    function notifyMovementJournalFailure(st, record, err, options) {
        rememberMovementJournalFailure(st, record, err);
        if (options && typeof options.onMovementJournalFailure === 'function') {
            try { options.onMovementJournalFailure(clone(record), err); } catch (_) {}
        }
    }
    function movementJournalWriter(options) {
        options = isObj(options) ? options : {};
        if (typeof options.journalMovementRecord === 'function') return options.journalMovementRecord;
        if (typeof options.journal_movement_record === 'function') return options.journal_movement_record;
        if (typeof options.movementJournalWriter === 'function') return options.movementJournalWriter;
        return null;
    }
    function journalMovementArrivalRecord(st, record, options) {
        options = isObj(options) ? options : {};
        if (!st || !record || options.movementJournal === false || options.journalMovement === false) return record || null;
        var id = movementJournalId(record);
        if (st.movement_journaled_ids[id]) return record;
        st.movement_journaled_ids[id] = true;
        st.movement_journal_events.push(clone(record));
        var writer = movementJournalWriter(options);
        if (typeof writer !== 'function') return record;
        try {
            var res = writer(clone(record), options);
            if (res && typeof res.then === 'function') {
                res.catch(function (err) { notifyMovementJournalFailure(st, record, err, options); });
            } else if (res && res.ok === false) {
                notifyMovementJournalFailure(st, record, res.error || res.reason || 'movement_journal_failed', options);
            }
        } catch (err) {
            notifyMovementJournalFailure(st, record, err, options);
        }
        return record;
    }
    function arrivalTriggersFromPlan(plan) {
        plan = isObj(plan) ? plan : {};
        var payload = isObj(plan.payload) ? plan.payload : {};
        return arr(plan.on_arrival).concat(arr(payload.on_arrival)).filter(function (t) { return t != null; });
    }
    function triggerKind(trigger) {
        if (typeof trigger === 'string') return String(trigger).toLowerCase();
        trigger = isObj(trigger) ? trigger : {};
        return String(trigger.kind || trigger.type || trigger.action || '').toLowerCase();
    }
    function triggerPayload(trigger) {
        if (!isObj(trigger)) return {};
        return isObj(trigger.payload) ? clone(trigger.payload) : {};
    }
    function fireMovementArrivalTrigger(st, record, trigger, index) {
        var kind = triggerKind(trigger);
        trigger = isObj(trigger) ? trigger : { kind: kind };
        var triggerId = String(trigger.id || trigger.trigger_id || (kind + '-' + (index + 1)));
        var owner = record.movement_id || record.group_movement_id || record.group_id || record.unit_id || 'movement';
        var key = 'arrival_trigger|' + record.kind + '|' + owner + '|' + triggerId;
        if (st.arrival_triggers_fired[key]) return null;
        st.arrival_triggers_fired[key] = true;
        var payload = triggerPayload(trigger);
        var base = {
            event_id: key,
            trigger_id: triggerId,
            movement_id: record.movement_id || null,
            group_movement_id: record.group_movement_id || null,
            unit_id: record.unit_id || null,
            group_id: record.group_id || null,
            source_arrival_kind: record.kind,
            arrived_at_elapsed_hours: record.arrived_at_elapsed_hours,
            scenario_time_label: record.scenario_time_label || null,
            payload: clone(payload)
        };
        if (kind === 'add_notification') {
            base.kind = 'add_notification';
            base.status = 'applied_safe';
            base.title = trigger.title || payload.title || 'Movement arrived';
            return pushMovementRuntimeEvent(st, base);
        }
        if (kind === 'open_decision_point') {
            var dpId = String(trigger.decision_point_id || payload.decision_point_id || triggerId);
            st.pending_decision_points[dpId] = {
                decision_point_id: dpId,
                trigger_id: triggerId,
                title: trigger.title || payload.title || 'Movement decision',
                status: 'pending',
                movement_id: record.movement_id || null,
                group_movement_id: record.group_movement_id || null,
                unit_id: record.unit_id || null,
                group_id: record.group_id || null,
                arrived_at_elapsed_hours: record.arrived_at_elapsed_hours,
                scenario_time_label: record.scenario_time_label || null,
                payload: clone(payload),
                read_only: true
            };
            base.kind = 'open_decision_point';
            base.status = 'pending';
            base.decision_point_id = dpId;
            base.title = st.pending_decision_points[dpId].title;
            return pushMovementRuntimeEvent(st, base);
        }
        if (kind === 'set_runtime_flag') {
            var flag = String(trigger.flag || trigger.key || payload.flag || payload.key || triggerId);
            st.runtime_flags[flag] = payload.value !== undefined ? clone(payload.value) : true;
            base.kind = 'set_runtime_flag';
            base.status = 'applied_safe';
            base.flag = flag;
            return pushMovementRuntimeEvent(st, base);
        }
        base.kind = kind || 'unsupported_arrival_trigger';
        base.status = 'blocked';
        base.reason = 'unsupported_arrival_trigger';
        return pushMovementRuntimeEvent(st, base);
    }
    function recordMovementArrivalContract(st, record, sourcePlan, options) {
        if (!st || !record) return null;
        pushMovementRuntimeEvent(st, record);
        pushMovementRuntimeEvent(st, {
            event_id: 'movement-route-completed:' + record.kind + ':' + (record.movement_id || record.group_movement_id || record.group_id || record.unit_id || 'movement'),
            kind: 'movement_route_completed',
            movement_id: record.movement_id || null,
            group_movement_id: record.group_movement_id || null,
            unit_id: record.unit_id || null,
            group_id: record.group_id || null,
            arrived_at_elapsed_hours: record.arrived_at_elapsed_hours,
            scenario_time_label: record.scenario_time_label || null,
            final_position: clone(record.final_position),
            route_distance_km: record.route_distance_km,
            eta_elapsed_hours: record.eta_elapsed_hours,
            status: 'arrived'
        });
        arrivalTriggersFromPlan(sourcePlan).forEach(function (trigger, idx) {
            fireMovementArrivalTrigger(st, record, trigger, idx);
        });
        journalMovementArrivalRecord(st, record, options);
        return record;
    }
    function unwrapMovementJournalRow(row) {
        row = isObj(row) ? row : {};
        var mods = isObj(row.mods) ? row.mods : {};
        if (isObj(mods.movement_journal)) return mods.movement_journal;
        if (isObj(mods.movement_journal_record)) return mods.movement_journal_record;
        if (isObj(row.movement_journal)) return row.movement_journal;
        if (isObj(row.movement_journal_record)) return row.movement_journal_record;
        if (isObj(row.record)) return row.record;
        return row;
    }
    function isMovementJournalKind(kind) {
        kind = String(kind || '').toLowerCase();
        return kind === 'movement_unit_arrived' || kind === 'movement_group_arrived' || kind === 'movement_route_completed';
    }
    function normalizeMovementJournalRecord(row) {
        var r = unwrapMovementJournalRow(row);
        if (!isObj(r)) return null;
        var kind = String(r.kind || '').toLowerCase();
        if (!isMovementJournalKind(kind)) return null;
        if (r.schema_version && r.schema_version !== 'runtime-movement-arrival-v1' && r.source !== 'runtime_movement') return null;
        var out = clone(r);
        out.schema_version = 'runtime-movement-arrival-v1';
        out.source = 'runtime_movement';
        out.kind = kind;
        out.movement_id = out.movement_id != null ? String(out.movement_id) : null;
        out.group_movement_id = out.group_movement_id != null ? String(out.group_movement_id) : null;
        out.unit_id = out.unit_id != null ? String(out.unit_id) : null;
        out.group_id = out.group_id != null ? String(out.group_id) : null;
        out.arrived_at_elapsed_hours = maybeRound(out.arrived_at_elapsed_hours != null ? out.arrived_at_elapsed_hours : out.elapsed_hours);
        out.scenario_time_label = out.scenario_time_label != null ? String(out.scenario_time_label) : null;
        out.final_position = normalizePoint(out.final_position || out.position || out.current_position);
        out.route_distance_km = maybeRound(out.route_distance_km != null ? out.route_distance_km : out.distance_km);
        out.eta_elapsed_hours = maybeRound(out.eta_elapsed_hours);
        out.status = out.status || 'arrived';
        out.unit_ids = arr(out.unit_ids).map(String);
        out.arrived_unit_ids = arr(out.arrived_unit_ids).map(String);
        return out;
    }
    function extractMovementJournalRecords(rows) {
        return arr(rows).map(normalizeMovementJournalRecord).filter(Boolean);
    }
    function movementRecordTime(record) {
        return isFinite(+record.arrived_at_elapsed_hours) ? +record.arrived_at_elapsed_hours : Number.POSITIVE_INFINITY;
    }
    function buildMovementReplay(records) {
        var warnings = [];
        var normalized = [];
        arr(records).forEach(function (row, idx) {
            var rec = normalizeMovementJournalRecord(row);
            if (!rec) {
                warnings.push('ignored_movement_record_' + idx);
                return;
            }
            if (!rec.movement_id && !rec.group_movement_id) warnings.push('missing_movement_id_' + idx);
            if (!rec.final_position) warnings.push('missing_final_position_' + idx);
            normalized.push(rec);
        });
        normalized.sort(function (a, b) {
            var d = movementRecordTime(a) - movementRecordTime(b);
            if (d !== 0) return d;
            return String(a.kind + (a.movement_id || a.group_movement_id || '')).localeCompare(String(b.kind + (b.movement_id || b.group_movement_id || '')));
        });
        var unitMovements = {}, groupMovements = {};
        normalized.forEach(function (rec) {
            if (rec.kind === 'movement_unit_arrived') unitMovements[rec.movement_id || rec.unit_id || ('unit-' + Object.keys(unitMovements).length)] = clone(rec);
            if (rec.kind === 'movement_group_arrived') groupMovements[rec.group_movement_id || rec.group_id || ('group-' + Object.keys(groupMovements).length)] = clone(rec);
        });
        return {
            arrivals: clone(normalized),
            unit_movements: unitMovements,
            group_movements: groupMovements,
            warnings: warnings,
            read_only: true
        };
    }
    function buildMovementAarSummary(records) {
        var replay = buildMovementReplay(records);
        var units = {}, groups = {};
        var unitArrivals = 0, groupArrivals = 0, routeCompleted = 0, distance = 0;
        replay.arrivals.forEach(function (rec) {
            if (rec.kind === 'movement_unit_arrived') {
                unitArrivals++;
                if (rec.unit_id) units[rec.unit_id] = true;
            } else if (rec.kind === 'movement_group_arrived') {
                groupArrivals++;
                if (rec.group_id || rec.group_movement_id) groups[rec.group_id || rec.group_movement_id] = true;
                arr(rec.arrived_unit_ids.length ? rec.arrived_unit_ids : rec.unit_ids).forEach(function (uid) { if (uid) units[uid] = true; });
            } else if (rec.kind === 'movement_route_completed') {
                routeCompleted++;
            }
            if (isFinite(+rec.route_distance_km)) distance += +rec.route_distance_km;
        });
        return {
            total_arrivals: unitArrivals + groupArrivals,
            unit_arrivals: unitArrivals,
            group_arrivals: groupArrivals,
            route_completed: routeCompleted,
            unit_count: Object.keys(units).length,
            group_count: Object.keys(groups).length,
            units: Object.keys(units).sort(),
            groups: Object.keys(groups).sort(),
            route_distance_km: round6(distance),
            ordered_arrivals: clone(replay.arrivals),
            warnings: clone(replay.warnings),
            read_only: true
        };
    }
    function planValue(plan, payload, names) {
        for (var i = 0; i < names.length; i++) {
            var k = names[i];
            if (payload && payload[k] != null) return payload[k];
            if (plan && plan[k] != null) return plan[k];
        }
        return null;
    }
    function uniqueStrings(values) {
        var seen = {}, out = [];
        arr(values).forEach(function (v) {
            if (v == null || v === '') return;
            var s = String(v);
            if (seen[s]) return;
            seen[s] = true;
            out.push(s);
        });
        return out;
    }
    function leaderRouteForGroupPlan(plan, payload, context, leaderId) {
        var route = arr(planValue(plan, payload, ['route', 'path', 'waypoints'])).map(normalizePoint).filter(Boolean);
        if (route.length) return route;
        var start = normalizePoint(planValue(plan, payload, ['from', 'start', 'current_position'])) || candidatePosition(context, leaderId);
        var end = normalizePoint(planValue(plan, payload, ['destination', 'to', 'target', 'position']));
        return (start && end) ? [start, end] : [];
    }
    function orderedGroupUnitIds(unitIds, leaderId) {
        var ids = uniqueStrings(unitIds);
        if (!ids.length && leaderId) ids = [String(leaderId)];
        leaderId = leaderId ? String(leaderId) : ids[0];
        var out = [];
        if (leaderId) out.push(leaderId);
        ids.forEach(function (id) { if (String(id) !== String(leaderId)) out.push(String(id)); });
        return uniqueStrings(out);
    }
    function formationOffsetMeters(index, formation, spacingMeters, forward) {
        var spacing = Math.max(0, num(spacingMeters, 0));
        var f = forward || { east: 1, north: 0 };
        var lateral = { east: -f.north, north: f.east };
        if (index <= 0 || spacing <= 0) return { east: 0, north: 0 };
        formation = String(formation || 'column').toLowerCase();
        if (formation === 'line') {
            var side = (index % 2 === 1) ? 1 : -1;
            var rank = Math.ceil(index / 2);
            return { east: lateral.east * spacing * rank * side, north: lateral.north * spacing * rank * side };
        }
        if (formation === 'wedge' || formation === 'simple_spread' || formation === 'spread') {
            var wside = (index % 2 === 1) ? 1 : -1;
            var row = Math.ceil(index / 2);
            var behind = spacing * row;
            var spread = spacing * row * 0.75;
            return {
                east: (-f.east * behind) + (lateral.east * spread * wside),
                north: (-f.north * behind) + (lateral.north * spread * wside)
            };
        }
        return { east: -f.east * spacing * index, north: -f.north * spacing * index };
    }
    function groupChildPlan(groupPlan, payload, groupId, unitId, route, started) {
        var childPayload = {
            unit_id: unitId,
            from: route[0],
            to: route[route.length - 1],
            route: route,
            domain: planValue(groupPlan, payload, ['domain', 'movement_domain'])
        };
        ['speed_kph', 'movement_speed_kph', 'speed_knots', 'movement_speed_knots', 'speed', 'speed_per_hour'].forEach(function (k) {
            var v = planValue(groupPlan, payload, [k]);
            if (v != null) childPayload[k] = v;
        });
        return {
            movement_id: groupId + ':' + unitId,
            execution_id: groupId + ':' + unitId,
            effect_kind: 'runtime_movement',
            classification: groupPlan.classification || 'requires_world_state_executor',
            status: groupPlan.status || 'requires_executor',
            planned_at_elapsed_hours: started,
            payload: childPayload,
            source_group_movement_id: groupId
        };
    }
    function refreshGroupMovementState(st, gm, elapsed, groupArrivals, options) {
        if (!st || !gm) return null;
        groupArrivals = arr(groupArrivals);
        var unitIds = arr(gm.unit_ids).map(String);
        var arrived = [], blocked = [];
        var counts = { planned: 0, moving: 0, paused: 0, arrived: 0, blocked: 0 };
        var leader = null;
        unitIds.forEach(function (uid) {
            var mid = gm.unit_movements && gm.unit_movements[uid];
            var mv = mid && st.movements[mid];
            if (!mv) return;
            if (String(uid) === String(gm.leader_unit_id)) leader = mv;
            var status = mv.status || 'planned';
            counts[status] = (counts[status] || 0) + 1;
            if (status === 'arrived') arrived.push(uid);
            if (status === 'blocked') blocked.push(uid);
        });
        if (!leader && unitIds.length && gm.unit_movements) leader = st.movements[gm.unit_movements[unitIds[0]]];
        var activeCount = unitIds.length - blocked.length;
        var groupStatus = 'planned';
        if (blocked.length > 0) groupStatus = 'blocked';
        else if (activeCount > 0 && arrived.length >= activeCount) groupStatus = 'arrived';
        else if (counts.paused > 0) groupStatus = 'paused';
        else if (counts.moving > 0) groupStatus = 'moving';
        else if (counts.blocked > 0) groupStatus = 'blocked';
        gm.arrived_unit_ids = arrived;
        gm.blocked_unit_ids = blocked;
        gm.group_status = groupStatus;
        gm.group_progress = leader && isFinite(+leader.progress) ? +leader.progress : 0;
        gm.group_eta_elapsed_hours = leader && isFinite(+leader.eta_elapsed_hours) ? +leader.eta_elapsed_hours : null;
        gm.leader_position = leader ? clone(leader.current_position) : null;
        if (groupStatus === 'arrived' && !gm.group_arrival_fired) {
            gm.group_arrival_fired = true;
            var ev = {
                event_id: 'group-arrival:' + gm.group_movement_id,
                kind: 'group_movement_arrival',
                group_movement_id: gm.group_movement_id,
                group_id: gm.group_id || null,
                leader_unit_id: gm.leader_unit_id || null,
                unit_ids: clone(unitIds),
                at_elapsed_hours: isFinite(+elapsed) ? +elapsed : null,
                position: clone(gm.leader_position)
            };
            st.group_arrival_events.push(ev);
            groupArrivals.push(clone(ev));
            recordMovementArrivalContract(st, movementGroupArrivalRecord(st, gm, elapsed, options), gm.source_execution_plan, options);
        }
        return gm;
    }
    function startGroupMovementExecutionPlan(st, plan, context) {
        var payload = isObj(plan && plan.payload) ? plan.payload : {};
        var groupMovementId = movementId(plan);
        if (!groupMovementId || st.group_movements[groupMovementId]) return { created: [] };
        var leaderId = planValue(plan, payload, ['leader_unit_id', 'leader']);
        var unitIds = orderedGroupUnitIds(planValue(plan, payload, ['unit_ids', 'units']), leaderId);
        leaderId = leaderId ? String(leaderId) : unitIds[0];
        var leaderRoute = leaderRouteForGroupPlan(plan, payload, context || {}, leaderId);
        var formation = String(planValue(plan, payload, ['formation', 'formation_type']) || 'column').toLowerCase();
        var spacing = num(planValue(plan, payload, ['spacing_meters', 'spacing']), 0);
        var started = num(context && context.elapsed_hours, num(planValue(plan, payload, ['start_elapsed_hours']), num(plan.planned_at_elapsed_hours, 0)));
        var gm = {
            group_movement_id: groupMovementId,
            movement_id: groupMovementId,
            group_id: String(planValue(plan, payload, ['group_id']) || groupMovementId),
            unit_ids: clone(unitIds),
            unit_movements: {},
            leader_unit_id: leaderId || null,
            formation: formation,
            spacing_meters: spacing,
            route: clone(leaderRoute),
            group_status: 'planned',
            group_progress: 0,
            group_eta_elapsed_hours: null,
            arrived_unit_ids: [],
            blocked_unit_ids: [],
            group_arrival_fired: false,
            source_execution_plan: clone(plan)
        };
        if (!unitIds.length || !leaderId || leaderRoute.length < 2) {
            gm.group_status = 'blocked';
            gm.reason = 'group movement plan missing unit_ids, leader, or route';
            st.group_movements[groupMovementId] = gm;
            return { created: [] };
        }
        st.group_movements[groupMovementId] = gm;
        var forward = routeForwardUnit(leaderRoute);
        var created = [];
        unitIds.forEach(function (uid, index) {
            var offset = formationOffsetMeters(index, formation, spacing, forward);
            var unitRoute = offsetRouteMeters(leaderRoute, offset.east, offset.north);
            var child = groupChildPlan(plan, payload, groupMovementId, uid, unitRoute, started);
            var mv = movementFromExecutionPlan(child, context || {});
            mv.group_movement_id = groupMovementId;
            mv.group_id = gm.group_id;
            mv.leader_unit_id = leaderId;
            mv.formation = formation;
            mv.formation_index = index;
            mv.formation_offset_meters = { east: round6(offset.east), north: round6(offset.north) };
            if (mv.status === 'planned') mv.status = (context && context.paused) ? 'paused' : 'moving';
            st.movements[mv.movement_id] = mv;
            gm.unit_movements[uid] = mv.movement_id;
            syncPosition(st, mv);
            if (mv.status === 'moving' || mv.status === 'arrived') addJournal(st, 'movement_start', mv, mv.started_at_elapsed_hours);
            created.push(clone(mv));
        });
        refreshGroupMovementState(st, gm, started, [], {});
        return { created: created };
    }
    function startMovementExecutionPlans(state, executionPlans, context) {
        var st = normalizeMovementState(state);
        var created = [];
        arr(executionPlans).forEach(function (plan) {
            if (!isMovementExecutionPlan(plan)) return;
            if (isGroupMovementExecutionPlan(plan)) {
                var gr = startGroupMovementExecutionPlan(st, plan, context || {});
                created = created.concat(arr(gr && gr.created));
                return;
            }
            var id = movementId(plan);
            if (!id || st.movements[id]) return;
            var mv = movementFromExecutionPlan(plan, context || {});
            if (mv.status === 'planned') mv.status = (context && context.paused) ? 'paused' : 'moving';
            st.movements[mv.movement_id || id] = mv;
            syncPosition(st, mv);
            if (mv.status === 'moving' || mv.status === 'arrived') addJournal(st, 'movement_start', mv, mv.started_at_elapsed_hours);
            created.push(clone(mv));
        });
        return { state: st, created: created };
    }
    function updateRuntimeMovementState(state, elapsedHours, options) {
        var st = normalizeMovementState(state);
        var elapsed = num(elapsedHours, 0);
        var paused = !!(options && options.paused);
        var updates = [], arrivals = [], groupArrivals = [];
        Object.keys(st.movements).forEach(function (id) {
            var mv = st.movements[id];
            if (!mv || mv.status === 'blocked' || mv.status === 'arrived') {
                if (mv) syncPosition(st, mv);
                return;
            }
            if (paused) {
                if (mv.status === 'moving') {
                    mv.status = 'paused';
                    mv.paused_at_elapsed_hours = elapsed;
                }
                syncPosition(st, mv);
                updates.push(clone(mv));
                return;
            }
            if (mv.status === 'paused') {
                var pausedAt = num(mv.paused_at_elapsed_hours, elapsed);
                var delta = Math.max(0, elapsed - pausedAt);
                mv.started_at_elapsed_hours = round6(num(mv.started_at_elapsed_hours, elapsed) + delta);
                mv.eta_elapsed_hours = round6(num(mv.eta_elapsed_hours, elapsed) + delta);
                mv.paused_at_elapsed_hours = null;
                mv.status = 'moving';
            }
            if (mv.status === 'planned') mv.status = 'moving';
            var start = num(mv.started_at_elapsed_hours, elapsed);
            var eta = num(mv.eta_elapsed_hours, start);
            var span = eta - start;
            mv.progress = span <= 0 ? 1 : Math.max(0, Math.min(1, (elapsed - start) / span));
            mv.current_position = pointAtRouteProgress(mv.route, mv.progress) || mv.current_position || mv.from;
            if (mv.progress >= 1) {
                mv.status = 'arrived';
                mv.current_position = normalizePoint(mv.to) || mv.current_position;
                if (!mv.arrival_fired) {
                    mv.arrival_fired = true;
                    var ev = {
                        event_id: 'arrival:' + mv.movement_id,
                        kind: 'movement_arrival',
                        movement_id: mv.movement_id,
                        execution_id: mv.execution_id,
                        unit_id: mv.unit_id,
                        at_elapsed_hours: elapsed,
                        position: clone(mv.current_position)
                    };
                    st.arrival_events.push(ev);
                    arrivals.push(clone(ev));
                    addJournal(st, 'movement_arrival', mv, elapsed);
                    recordMovementArrivalContract(st, movementUnitArrivalRecord(mv, elapsed, options), mv.source_execution_plan, options);
                }
            } else {
                addJournal(st, 'movement_update', mv, elapsed);
            }
            syncPosition(st, mv);
            updates.push(clone(mv));
        });
        Object.keys(st.group_movements).forEach(function (id) {
            refreshGroupMovementState(st, st.group_movements[id], elapsed, groupArrivals, options);
        });
        return { state: st, updates: updates, arrivals: arrivals, group_arrivals: groupArrivals };
    }
    function summarizeRuntimeMovement(state) {
        var st = normalizeMovementState(state);
        var counts = { planned: 0, moving: 0, arrived: 0, paused: 0, blocked: 0 };
        var groupCounts = { planned: 0, moving: 0, arrived: 0, paused: 0, blocked: 0 };
        var next = null, lastArrival = null;
        Object.keys(st.movements).forEach(function (id) {
            var mv = st.movements[id];
            var status = mv && mv.status || 'planned';
            counts[status] = (counts[status] || 0) + 1;
            if ((status === 'moving' || status === 'paused') && isFinite(+mv.eta_elapsed_hours)) {
                if (!next || +mv.eta_elapsed_hours < +next.eta_elapsed_hours) next = clone(mv);
            }
        });
        Object.keys(st.group_movements).forEach(function (id) {
            var gm = st.group_movements[id];
            var status = gm && gm.group_status || 'planned';
            groupCounts[status] = (groupCounts[status] || 0) + 1;
        });
        if (st.arrival_events.length) lastArrival = clone(st.arrival_events[st.arrival_events.length - 1]);
        return {
            planned: counts.planned,
            moving: counts.moving,
            arrived: counts.arrived,
            paused: counts.paused,
            blocked: counts.blocked,
            group_movement_count: Object.keys(st.group_movements).length,
            group_status_summary: groupCounts,
            runtime_position_count: Object.keys(st.runtime_positions).length,
            next_eta: next ? next.eta_elapsed_hours : null,
            next_movement: next,
            last_arrival: lastArrival,
            last_group_arrival: st.group_arrival_events.length ? clone(st.group_arrival_events[st.group_arrival_events.length - 1]) : null,
            journal_events: st.movement_journal_events.length,
            movement_runtime_events: st.movement_runtime_events.length,
            movement_journal_retry_queue: st.pending_journal_records.length,
            last_movement_journal_error: st.last_journal_error || st.last_movement_journal_error || null,
            read_only: true
        };
    }

    return {
        normalizePoint: normalizePoint,
        normalizeMovementState: normalizeMovementState,
        routeDistance: routeDistance,
        routeDistanceUnits: routeDistanceUnits,
        pointAtRouteProgress: pointAtRouteProgress,
        currentSegmentIndexAtRouteProgress: currentSegmentIndexAtRouteProgress,
        trailAtRouteProgress: trailAtRouteProgress,
        resolveMovementSpeed: resolveMovementSpeed,
        isGroupMovementExecutionPlan: isGroupMovementExecutionPlan,
        isMovementExecutionPlan: isMovementExecutionPlan,
        movementFromExecutionPlan: movementFromExecutionPlan,
        startMovementExecutionPlans: startMovementExecutionPlans,
        updateRuntimeMovementState: updateRuntimeMovementState,
        summarizeRuntimeMovement: summarizeRuntimeMovement,
        normalizeMovementJournalRecord: normalizeMovementJournalRecord,
        extractMovementJournalRecords: extractMovementJournalRecords,
        buildMovementReplay: buildMovementReplay,
        buildMovementAarSummary: buildMovementAarSummary
    };
});
