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
    function distance(a, b) {
        a = normalizePoint(a); b = normalizePoint(b);
        if (!a || !b) return 0;
        var dx = b[0] - a[0], dy = b[1] - a[1];
        return Math.sqrt(dx * dx + dy * dy);
    }
    function routeDistance(route) {
        var total = 0;
        var pts = arr(route).map(normalizePoint).filter(Boolean);
        for (var i = 1; i < pts.length; i++) total += distance(pts[i - 1], pts[i]);
        return total;
    }
    function interpolate(a, b, t) {
        a = normalizePoint(a); b = normalizePoint(b);
        if (!a || !b) return null;
        t = Math.max(0, Math.min(1, num(t, 0)));
        return [round6(a[0] + (b[0] - a[0]) * t), round6(a[1] + (b[1] - a[1]) * t)];
    }
    function pointAtRouteProgress(route, progress) {
        var pts = arr(route).map(normalizePoint).filter(Boolean);
        if (!pts.length) return null;
        if (pts.length === 1) return pts[0].slice();
        progress = Math.max(0, Math.min(1, num(progress, 0)));
        if (progress <= 0) return pts[0].slice();
        if (progress >= 1) return pts[pts.length - 1].slice();
        var total = routeDistance(pts);
        if (total <= 0) return pts[pts.length - 1].slice();
        var target = total * progress, walked = 0;
        for (var i = 1; i < pts.length; i++) {
            var leg = distance(pts[i - 1], pts[i]);
            if (walked + leg >= target) {
                return interpolate(pts[i - 1], pts[i], leg > 0 ? ((target - walked) / leg) : 1);
            }
            walked += leg;
        }
        return pts[pts.length - 1].slice();
    }
    function trailAtRouteProgress(route, progress) {
        var pts = arr(route).map(normalizePoint).filter(Boolean);
        if (!pts.length) return [];
        if (pts.length === 1) return [pts[0].slice()];
        progress = Math.max(0, Math.min(1, num(progress, 0)));
        if (progress <= 0) return [pts[0].slice()];
        if (progress >= 1) return pts.map(clone);
        var total = routeDistance(pts);
        if (total <= 0) return [pts[0].slice(), pts[pts.length - 1].slice()];
        var target = total * progress, walked = 0;
        var out = [pts[0].slice()];
        for (var i = 1; i < pts.length; i++) {
            var leg = distance(pts[i - 1], pts[i]);
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
            movements: {},
            runtime_positions: {},
            runtime_world_state: { positions: {} },
            arrival_events: [],
            movement_journal_events: [],
            movement_journaled_ids: {},
            last_movement_journal_error: null
        };
    }
    function normalizeMovementState(state) {
        var st = isObj(state) ? clone(state) : emptyState();
        st.movements = isObj(st.movements) ? st.movements : {};
        st.runtime_positions = isObj(st.runtime_positions) ? st.runtime_positions : {};
        st.runtime_world_state = isObj(st.runtime_world_state) ? st.runtime_world_state : {};
        st.runtime_world_state.positions = isObj(st.runtime_world_state.positions) ? st.runtime_world_state.positions : {};
        st.arrival_events = arr(st.arrival_events);
        st.movement_journal_events = arr(st.movement_journal_events);
        st.movement_journaled_ids = isObj(st.movement_journaled_ids) ? st.movement_journaled_ids : {};
        st.last_movement_journal_error = st.last_movement_journal_error || null;
        return st;
    }
    function movementId(plan) {
        return String((plan && (plan.movement_id || plan.execution_id || plan.source_effect_id || plan.effect_id)) || '');
    }
    function isMovementExecutionPlan(plan) {
        if (!isObj(plan)) return false;
        var kind = String(plan.effect_kind || plan.kind || plan.type || '').toLowerCase();
        if (kind === 'runtime_movement' || kind === 'movement' || kind === 'move_unit') return true;
        var p = isObj(plan.payload) ? plan.payload : {};
        var pk = String(p.effect_kind || p.kind || p.type || p.action_type || '').toLowerCase();
        return pk === 'runtime_movement' || pk === 'movement' || pk === 'move_unit' || pk === 'move';
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
    function resolveMovementSpeed(plan, payload, context, unitId) {
        var explicit = num(payload && payload.speed, num(payload && payload.speed_per_hour, num(plan && plan.speed, NaN)));
        if (isFinite(+explicit)) return { speed: +explicit, source: 'effect' };
        var unitSpeeds = (context && (context.unit_speeds || context.unit_speed_by_id)) || {};
        var unitSpeed = unitId && unitSpeeds ? num(unitSpeeds[unitId], NaN) : NaN;
        if (isFinite(+unitSpeed)) return { speed: +unitSpeed, source: 'unit' };
        var unit = candidateUnit(context, unitId);
        unitSpeed = unit ? num(unit.speed || unit.speed_per_hour || unit.movement_speed, NaN) : NaN;
        if (isFinite(+unitSpeed)) return { speed: +unitSpeed, source: 'unit' };
        var domain = String((payload && (payload.domain || payload.movement_domain)) || (plan && (plan.domain || plan.movement_domain)) || (unit && (unit.domain || unit.movement_domain)) || '').toLowerCase();
        var domainSpeeds = (context && (context.domain_speeds || context.speed_by_domain)) || {};
        var domainSpeed = domain && domainSpeeds ? num(domainSpeeds[domain], NaN) : NaN;
        if (isFinite(+domainSpeed)) return { speed: +domainSpeed, source: 'domain', domain: domain };
        var fallback = num(context && context.default_speed, 1);
        return { speed: fallback, source: 'default', domain: domain || null };
    }
    function movementFromExecutionPlan(plan, context) {
        var p = isObj(plan && plan.payload) ? plan.payload : {};
        var unitId = plan.unit_id || p.unit_id || p.unit_uid || p.uid || p.actor;
        var start = normalizePoint(p.from || p.start || p.current_position || candidatePosition(context, unitId));
        var end = normalizePoint(p.to || p.destination || p.target || p.position);
        var route = arr(p.route).map(normalizePoint).filter(Boolean);
        if (!route.length && start && end) route = [start, end];
        if (route.length && !start) start = route[0];
        if (route.length && !end) end = route[route.length - 1];
        var resolvedSpeed = resolveMovementSpeed(plan, p, context || {}, unitId);
        var speed = resolvedSpeed.speed;
        var started = num(context && context.elapsed_hours, num(plan.planned_at_elapsed_hours, 0));
        var id = movementId(plan);
        var base = {
            movement_id: id,
            execution_id: plan.execution_id || id,
            unit_id: unitId ? String(unitId) : '',
            from: start,
            to: end,
            route: route,
            speed: speed,
            speed_source: resolvedSpeed.source,
            domain: resolvedSpeed.domain || String((p.domain || p.movement_domain || plan.domain || plan.movement_domain || '') || '').toLowerCase() || null,
            started_at_elapsed_hours: started,
            eta_elapsed_hours: null,
            progress: 0,
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
        var d = routeDistance(route);
        base.eta_elapsed_hours = d > 0 ? round6(started + (d / speed)) : started;
        if (samePoint(start, end) || d <= 0) {
            base.progress = 1;
            base.status = 'arrived';
            base.current_position = end;
        }
        return base;
    }
    function syncPosition(st, mv) {
        if (!mv || !mv.unit_id || !mv.current_position) return;
        mv.trail = trailAtRouteProgress(mv.route, mv.progress);
        st.runtime_positions[mv.unit_id] = clone(mv.current_position);
        st.runtime_world_state.positions[mv.unit_id] = {
            unit_id: mv.unit_id,
            position: clone(mv.current_position),
            source: 'runtime_movement',
            movement_id: mv.movement_id,
            progress: mv.progress,
            status: mv.status,
            eta_elapsed_hours: mv.eta_elapsed_hours,
            speed: mv.speed,
            speed_source: mv.speed_source || null,
            domain: mv.domain || null,
            route: clone(mv.route),
            trail: clone(mv.trail)
        };
    }
    function addJournal(st, kind, mv, elapsed) {
        if (!st || !mv || !mv.movement_id) return;
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
    function startMovementExecutionPlans(state, executionPlans, context) {
        var st = normalizeMovementState(state);
        var created = [];
        arr(executionPlans).forEach(function (plan) {
            if (!isMovementExecutionPlan(plan)) return;
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
        var updates = [], arrivals = [];
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
                }
            } else {
                addJournal(st, 'movement_update', mv, elapsed);
            }
            syncPosition(st, mv);
            updates.push(clone(mv));
        });
        return { state: st, updates: updates, arrivals: arrivals };
    }
    function summarizeRuntimeMovement(state) {
        var st = normalizeMovementState(state);
        var counts = { planned: 0, moving: 0, arrived: 0, paused: 0, blocked: 0 };
        var next = null, lastArrival = null;
        Object.keys(st.movements).forEach(function (id) {
            var mv = st.movements[id];
            var status = mv && mv.status || 'planned';
            counts[status] = (counts[status] || 0) + 1;
            if ((status === 'moving' || status === 'paused') && isFinite(+mv.eta_elapsed_hours)) {
                if (!next || +mv.eta_elapsed_hours < +next.eta_elapsed_hours) next = clone(mv);
            }
        });
        if (st.arrival_events.length) lastArrival = clone(st.arrival_events[st.arrival_events.length - 1]);
        return {
            planned: counts.planned,
            moving: counts.moving,
            arrived: counts.arrived,
            paused: counts.paused,
            blocked: counts.blocked,
            runtime_position_count: Object.keys(st.runtime_positions).length,
            next_eta: next ? next.eta_elapsed_hours : null,
            next_movement: next,
            last_arrival: lastArrival,
            journal_events: st.movement_journal_events.length,
            read_only: true
        };
    }

    return {
        normalizePoint: normalizePoint,
        normalizeMovementState: normalizeMovementState,
        routeDistance: routeDistance,
        pointAtRouteProgress: pointAtRouteProgress,
        trailAtRouteProgress: trailAtRouteProgress,
        resolveMovementSpeed: resolveMovementSpeed,
        isMovementExecutionPlan: isMovementExecutionPlan,
        movementFromExecutionPlan: movementFromExecutionPlan,
        startMovementExecutionPlans: startMovementExecutionPlans,
        updateRuntimeMovementState: updateRuntimeMovementState,
        summarizeRuntimeMovement: summarizeRuntimeMovement
    };
});
