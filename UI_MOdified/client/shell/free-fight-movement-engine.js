/* ============================================================================
 * free-fight-movement-engine.js — RMOOZ-MOVEMENT-INTELLIGENCE-A
 * ----------------------------------------------------------------------------
 * Behavior-driven movement intelligence for the Free Fight COA engine.
 *
 * Core responsibilities:
 *   1. Unit domain classification (air/ground/naval/sensor/support/air_defense)
 *      from real unit fields (type, unit_type, class, name, symbol_category).
 *   2. Threat-axis computation (enemy centroid → bearing from objective).
 *   3. Behavior-to-waypoint conversion per domain + behavior + policy:
 *      approach / screen / intercept / defend / support / observe / reserve / hold
 *      patrol_loop / orbit / intercept_axis / hold_area / support_position / screen_line
 *   4. Movement intelligence context builder (per-unit capabilities, reachability).
 *   5. Relevant-unit selection (nearest taskable units, not all 400).
 *   6. Per-tick behavior step (returns next waypoint for deterministic engine).
 *
 * Architecture rule:
 *   The AI declares INTENT (behavior + waypoint_policy).
 *   This engine converts intent → actual lat/lon waypoints.
 *   The movement tick engine (free-fight-demo.js) advances units along waypoints.
 *   No rings as primary output. Rings kept ONLY as emergency fallback
 *   (marked fallback_formation:true, reason:'staff_safe_no_ai').
 *
 * Loaded BEFORE free-fight-demo.js.
 * window.RmoozMovementEngine = { ... }   (+ module.exports for Node tests)
 * ========================================================================== */
;(function (root) {
    'use strict';

    // ── Constants ────────────────────────────────────────────────────────────────
    var EARTH_KM_DEG      = 111;          // km per degree latitude
    var APPROACH_KM       = 5;            // ground approach: engage distance from obj
    var SCREEN_KM         = 18;           // screen line: perpendicular offset from axis
    var INTERCEPT_KM      = 14;           // intercept: on axis toward enemy, km from obj
    var DEFEND_KM         = 3;            // defensive perimeter: km from obj
    var SUPPORT_KM        = 9;            // fire support / reinforce: km from obj
    var OBSERVE_KM        = 6;            // observation post: km from obj
    var RESERVE_KM        = 22;           // reserve: rear-area km from obj
    var PATROL_RADIUS_KM  = 28;           // aircraft patrol loop radius
    var ORBIT_RADIUS_KM   = 12;           // tight ISR orbit radius
    var NAVAL_PATROL_KM   = 25;           // naval patrol loop radius
    var SLOT_SPREAD_KM    = 2.5;          // lateral separation between same-role units
    var MAX_RELEVANT      = 25;           // cap for chooseRelevantUnits

    // ── Reach limits by domain (km): beyond this, unit is irrelevant ─────────────
    var REACH_KM = { air: 1500, naval: 800, ground: 250, air_defense: 120, support: 160, sensor: 350, unknown: 250 };

    // ── Domain keyword patterns ──────────────────────────────────────────────────
    // Tested against unit.type / unit.unit_type / unit.class / unit.symbol_category
    // / unit.name — joined + lowercased.
    var RE_AIR  = /\b(fighter|bomber|attack aircraft|multirole|f-1[4-9]|f-22|f-35|f-16|f-15|mig-|su-[0-9]|eurofighter|typhoon|tornado|gripen|rafale|mirage|ah-64|uh-60|ch-47|osprey|blackhawk|chinook|uav|drone|rpas|helicopter|heli|rotary|fixed.?wing|transport aircraft|cargo aircraft|tanker aircraft|kc-135|kc-10|c-130|c-17|awacs|sentry|jstars|rivet|maritime patrol aircraft|nimrod|aurora|p-3|p-8|sea king|seahawk|air_fighter|air_attack|air_transport)\b/i;
    var RE_NAVAL= /\b(frigate|destroyer|corvette|submarine|sub|u-boat|patrol boat|fast.?attack|missile boat|landing ship|lst|lha|lhd|amphibi|cruiser|carrier|battle.?ship|aegis|mine.?sweep|coast.?guard|naval|warship|vessel|dhow|naval_surface|maritime)\b/i;
    var RE_AD   = /\b(air.?defense|air.?defence|sam|manpad|patriot|hawk|nasam|s-300|s-400|s-500|sa-[0-9]|shorad|thaad|iron.?dome|david.*sling|arrow|buk|tor|pantsir|rapier|starstreak|stinger|avenger|phalanx|ciws|shorad|air_defense)\b/i;
    var RE_SENS = /\b(radar|sensor|isr|intelligence|surveillance|observation.?post|op|ewb|jammer|sigint|comint|elint|ground.?radar|aew|awacs|jstars|ground.?sensor|acoustic)\b/i;
    var RE_SUPP = /\b(logistics|supply|fuel|maintenance|hospital|medevac|medical|engineer|bridge|construction|depot|base|hq|headquarters|command.?post|cp|toc|artillery|howitzer|mlrs|rocket.?arty|field.?arty|logistics|support|css)\b/i;

    function fin(v) { return typeof v === 'number' && isFinite(v); }
    function arr(v) { return Array.isArray(v) ? v : (v ? [v] : []); }

    // ── Domain classification ────────────────────────────────────────────────────
    function classifyUnitDomain(unit) {
        if (!unit) return 'unknown';
        // 1. Try symbol_category lookup via RmoozDomainMovement (loaded before us)
        if (typeof root.RmoozDomainMovement === 'object' && root.RmoozDomainMovement.classifyMovementDomain) {
            var sdomain = root.RmoozDomainMovement.classifyMovementDomain(unit);
            if (sdomain && sdomain !== 'unknown') return sdomain;
        }
        // 2. Keyword scan on text fields
        var text = [unit.type, unit.unit_type, unit.class, unit.symbol_category, unit.category, unit.name, unit.designation].filter(Boolean).join(' ');
        if (RE_AIR.test(text))  return 'air';
        if (RE_NAVAL.test(text)) return 'naval';
        if (RE_AD.test(text))   return 'air_defense';
        if (RE_SENS.test(text)) return 'sensor';
        if (RE_SUPP.test(text)) return 'support';
        if (text)               return 'ground';   // default: assume ground if any text
        return 'unknown';
    }

    function movementModeFor(domain) {
        if (domain === 'air') return 'air';
        if (domain === 'naval') return 'naval';
        if (domain === 'air_defense' || domain === 'sensor' || domain === 'support') return 'static';
        return 'ground';
    }

    // ── Geometry ─────────────────────────────────────────────────────────────────
    function kmBetween(a, b) {
        if (!fin(a.lat) || !fin(a.lon) || !fin(b.lat) || !fin(b.lon)) return Infinity;
        var dlat = (a.lat - b.lat) * EARTH_KM_DEG;
        var dlon = (a.lon - b.lon) * EARTH_KM_DEG * Math.cos(a.lat * Math.PI / 180);
        return Math.sqrt(dlat * dlat + dlon * dlon);
    }

    function bearingDeg(from, to) {
        var dlat = to.lat - from.lat;
        var dlon = (to.lon - from.lon) * Math.cos(from.lat * Math.PI / 180);
        return (Math.atan2(dlon, dlat) * 180 / Math.PI + 360) % 360;
    }

    // Place a point at dist_km from origin along bearing_deg, with optional slot spread.
    // slot=0 → on axis, slot=1,2,3 → alternating left/right of axis (spread = slot*SLOT_SPREAD_KM).
    function positionAt(origin, bearing_deg, dist_km, slot) {
        var spreadSign = (slot && slot % 2 === 1) ? 1 : -1;
        var spreadKm   = slot ? Math.ceil(slot / 2) * SLOT_SPREAD_KM * spreadSign : 0;
        var adjBear    = bearing_deg + (spreadKm !== 0 ? Math.atan2(spreadKm, dist_km) * 180 / Math.PI : 0);
        var adjDist    = Math.sqrt(dist_km * dist_km + spreadKm * spreadKm);
        var brRad = adjBear * Math.PI / 180;
        var cosLat = Math.cos(origin.lat * Math.PI / 180);
        return {
            lat: origin.lat + (adjDist / EARTH_KM_DEG) * Math.cos(brRad),
            lon: origin.lon + (adjDist / (EARTH_KM_DEG * (cosLat || 0.001))) * Math.sin(brRad)
        };
    }

    // ── Threat axis ──────────────────────────────────────────────────────────────
    function unitLatLon(u) {
        var lat = (u.lat != null) ? +u.lat : (Array.isArray(u.coord) ? +u.coord[1] : null);
        var lon = (u.lon != null) ? +u.lon : (Array.isArray(u.coord) ? +u.coord[0] : null);
        return (fin(lat) && fin(lon)) ? { lat: lat, lon: lon } : null;
    }

    function computeEnemyCentroid(enemyUnits) {
        var tLat = 0, tLon = 0, n = 0;
        arr(enemyUnits).forEach(function (u) {
            var p = unitLatLon(u);
            if (p) { tLat += p.lat; tLon += p.lon; n++; }
        });
        return n ? { lat: tLat / n, lon: tLon / n } : null;
    }

    // Bearing from objective TOWARD enemy (direction of threat).
    // If no enemy data, defaults to NE (30°) — canonical RED approach direction.
    function computeThreatBearing(objective, enemyUnits) {
        var centroid = computeEnemyCentroid(enemyUnits);
        if (!centroid) return 30;
        return bearingDeg(objective, centroid);
    }

    // ── Waypoint builders per domain ─────────────────────────────────────────────

    // Ground units: axis-aware positions that respect behavior.
    // threatBear = bearing from objective toward enemy threat.
    // rearBear   = opposite direction (friendly rear).
    function buildGroundWaypoints(behavior, objective, threatBear, slot) {
        var rearBear = (threatBear + 180) % 360;
        switch (behavior) {
            case 'approach':
                // Advance toward objective along threat axis, stop at engagement range.
                return [positionAt(objective, threatBear, APPROACH_KM, slot)];
            case 'screen':
            case 'screen_line':
                // Screen line: perpendicular to threat axis at screen distance.
                return [positionAt(objective, threatBear + 90, SCREEN_KM, slot)];
            case 'intercept':
            case 'intercept_axis':
                // Block enemy approach: on axis between enemy and objective.
                return [positionAt(objective, threatBear, INTERCEPT_KM, slot)];
            case 'defend':
                // Defensive perimeter: just forward of objective, facing threat.
                return [positionAt(objective, threatBear, DEFEND_KM, slot)];
            case 'support':
            case 'support_position':
            case 'reinforce':
                // Fire support / reinforce: offset ~60° from threat axis.
                return [positionAt(objective, threatBear - 60, SUPPORT_KM, slot)];
            case 'observe':
                // Observation post: on axis, closer than intercept.
                return [positionAt(objective, threatBear, OBSERVE_KM, slot)];
            case 'reserve':
            case 'hold_area':
                // Reserve: rear area relative to objective.
                return [positionAt(objective, rearBear, RESERVE_KM, slot)];
            case 'hold':
                return null;   // no movement
            default:
                return [positionAt(objective, threatBear, DEFEND_KM + slot * 1.5, slot)];
        }
    }

    // Aircraft: domain-appropriate behaviors; they NEVER stop at objective.
    function buildAircraftWaypoints(behavior, objective, threatBear, slot) {
        var rearBear = (threatBear + 180) % 360;
        // Patrol orbit center: offset toward threat so the aircraft is over the threat corridor.
        var orbitCenter = positionAt(objective, threatBear, PATROL_RADIUS_KM * 0.6, 0);
        switch (behavior) {
            case 'patrol_loop':
                // Racetrack: 4-point loop around orbit center.
                return [0, 90, 180, 270].map(function (a) {
                    return positionAt(orbitCenter, threatBear + a, PATROL_RADIUS_KM * 0.5, slot);
                });
            case 'orbit':
                // Tight ISR orbit over objective area.
                return [0, 90, 180, 270].map(function (a) {
                    return positionAt(objective, a, ORBIT_RADIUS_KM, slot);
                });
            case 'intercept':
            case 'intercept_axis':
                // Intercept vector: station on approach axis ahead of objective.
                return [positionAt(objective, threatBear, INTERCEPT_KM * 2, slot)];
            case 'observe':
            case 'support':
                // ISR / CAS orbit at offset altitude.
                return [0, 120, 240].map(function (a) {
                    return positionAt(objective, a + threatBear, ORBIT_RADIUS_KM * 1.5, slot);
                });
            case 'screen':
                return [positionAt(objective, threatBear + 90, SCREEN_KM * 1.2, slot)];
            case 'reserve':
                return [positionAt(objective, rearBear, PATROL_RADIUS_KM, slot)];
            default:
                // Default: patrol loop (aircraft never stops at objective).
                return [0, 90, 180, 270].map(function (a) {
                    return positionAt(orbitCenter, a, PATROL_RADIUS_KM * 0.45, slot);
                });
        }
    }

    // Naval units: must stay in water areas (approximate — no coastline GIS).
    function buildNavalWaypoints(behavior, objective, threatBear, slot) {
        var orbitCenter = positionAt(objective, threatBear, NAVAL_PATROL_KM * 0.7, 0);
        switch (behavior) {
            case 'patrol_loop':
                return [0, 90, 180, 270].map(function (a) {
                    return positionAt(orbitCenter, threatBear + a, NAVAL_PATROL_KM * 0.5, slot);
                });
            case 'intercept':
            case 'intercept_axis':
                return [positionAt(objective, threatBear, INTERCEPT_KM * 1.3, slot)];
            case 'defend':
            case 'support':
            case 'support_position':
                return [positionAt(objective, threatBear, SUPPORT_KM, slot)];
            case 'screen':
                return [positionAt(objective, threatBear + 90, SCREEN_KM, slot)];
            case 'reserve':
                return [positionAt(objective, (threatBear + 180) % 360, NAVAL_PATROL_KM, slot)];
            default:
                return [0, 90, 180, 270].map(function (a) {
                    return positionAt(orbitCenter, a, NAVAL_PATROL_KM * 0.4, slot);
                });
        }
    }

    // Support / sensor / air_defense: mostly static, but may hold or reposition.
    function buildSupportWaypoints(behavior, objective, threatBear, slot) {
        if (behavior === 'hold' || behavior === 'hold_area') return null;
        if (behavior === 'observe' || behavior === 'sensor') {
            return [positionAt(objective, threatBear, OBSERVE_KM * 1.5, slot)];
        }
        // Default: position at support distance behind objective.
        return [positionAt(objective, (threatBear + 180) % 360, SUPPORT_KM, slot)];
    }

    // Master waypoint builder.
    function buildWaypointsForAssignment(unit, assignment, objective, enemyUnits, slot) {
        if (!unit || !assignment || !objective) return null;
        if (!fin(objective.lat) || !fin(objective.lon)) return null;
        var behavior     = assignment.behavior || assignment.role || 'approach';
        var domain       = classifyUnitDomain(unit);
        var threatBear   = computeThreatBearing(objective, enemyUnits);
        var slotN        = slot || 0;
        var wps;
        if (domain === 'air')                                          wps = buildAircraftWaypoints(behavior, objective, threatBear, slotN);
        else if (domain === 'naval')                                   wps = buildNavalWaypoints(behavior, objective, threatBear, slotN);
        else if (domain === 'support' || domain === 'sensor' || domain === 'air_defense')
                                                                       wps = buildSupportWaypoints(behavior, objective, threatBear, slotN);
        else                                                           wps = buildGroundWaypoints(behavior, objective, threatBear, slotN);
        return wps || null;
    }

    // ── Movement intelligence context ─────────────────────────────────────────────
    // Returns one entry per unit with capability/reachability fields for the AI prompt.
    function buildMovementIntelligenceContext(objective, units, enemyUnits) {
        if (!objective || !arr(units).length) return [];
        var enemyCentroid = computeEnemyCentroid(enemyUnits);
        var result = [];
        arr(units).forEach(function (u) {
            var p = unitLatLon(u);
            if (!p) return;   // skip units without real coords
            var domain    = classifyUnitDomain(u);
            var distObj   = kmBetween(p, objective);
            var distEnemy = enemyCentroid ? kmBetween(p, enemyCentroid) : null;
            var canReach  = distObj <= (REACH_KM[domain] || REACH_KM.unknown);
            var movMode   = movementModeFor(domain);

            // Recommended use based on domain, position, and side.
            var side = String(u.side || '').toUpperCase();
            var recUse;
            if (domain === 'air')                    recUse = canReach ? 'patrol' : 'hold';
            else if (domain === 'naval')             recUse = 'patrol';
            else if (domain === 'sensor')            recUse = 'observe';
            else if (domain === 'support')           recUse = 'support';
            else if (domain === 'air_defense')       recUse = 'defend';
            else if (side === 'RED')                 recUse = distObj > 150 ? 'approach' : 'intercept';
            else                                     recUse = distObj > 100 ? 'reserve' : 'intercept';

            result.push({
                uid:                         u.id || u.uid || u.unit_uid,
                side:                        side,
                lat:                         p.lat,
                lon:                         p.lon,
                unit_type:                   u.type || u.unit_type || u.class || '',
                domain:                      domain,
                distance_to_objective_km:    fin(distObj) ? Math.round(distObj) : null,
                distance_to_nearest_enemy_km: (distEnemy != null && fin(distEnemy)) ? Math.round(distEnemy) : null,
                can_reach_objective_area:    canReach,
                movement_mode_supported:     movMode,
                can_patrol:                  domain === 'air' || domain === 'naval',
                can_hold:                    true,
                can_intercept:               domain !== 'support',
                recommended_use:             recUse,
            });
        });
        return result;
    }

    // ── Relevant unit selection ───────────────────────────────────────────────────
    // Returns up to maxN units, sorted by a score that favours:
    //   - proximity to objective (dominant)
    //   - air/naval domain (farther reach, so reach penalty reduced)
    // Only units with real coordinates are returned.
    function chooseRelevantUnits(units, objective, side, maxN) {
        if (!arr(units).length || !objective) return [];
        var max = maxN || MAX_RELEVANT;
        var hasSide = (side === 'RED' || side === 'BLUE');
        var candidates = arr(units).filter(function (u) {
            if (hasSide && String(u.side || '').toUpperCase() !== side) return false;
            return !!unitLatLon(u);
        });
        var scored = candidates.map(function (u) {
            var p    = unitLatLon(u);
            var dist = kmBetween(p, objective);
            var dom  = classifyUnitDomain(u);
            // Reach factor: air units are "closer" because they can travel farther.
            var rf   = dom === 'air' ? 5 : dom === 'naval' ? 2 : 1;
            return { unit: u, score: -(dist / rf) };
        });
        scored.sort(function (a, b) { return b.score - a.score; });
        return scored.slice(0, max).map(function (s) { return s.unit; });
    }

    // ── Per-tick step ─────────────────────────────────────────────────────────────
    // Returns the next waypoint target for the unit.
    // state.waypoint_index tracks which waypoint the unit is heading toward.
    // Aircraft loop infinitely; ground/naval stop at last waypoint.
    function stepUnitAlongBehavior(unit, assignment, waypoints, state) {
        if (!waypoints || !waypoints.length) return null;
        var domain = classifyUnitDomain(unit);
        var loops  = (domain === 'air' || domain === 'naval');
        var wpIdx  = (state && typeof state.waypoint_index === 'number') ? state.waypoint_index : 0;
        if (wpIdx >= waypoints.length) {
            if (loops) wpIdx = 0;   // loop back for patrol
            else return null;       // arrived at final waypoint
        }
        var tgt = waypoints[wpIdx];
        if (!tgt || !fin(tgt.lat) || !fin(tgt.lon)) return null;
        return { lat: tgt.lat, lon: tgt.lon, waypoint_index: wpIdx, total_waypoints: waypoints.length };
    }

    // ── Export ────────────────────────────────────────────────────────────────────
    var API = {
        classifyUnitDomain:              classifyUnitDomain,
        movementModeFor:                 movementModeFor,
        buildMovementIntelligenceContext: buildMovementIntelligenceContext,
        chooseRelevantUnits:             chooseRelevantUnits,
        buildWaypointsForAssignment:     buildWaypointsForAssignment,
        stepUnitAlongBehavior:           stepUnitAlongBehavior,
        computeEnemyCentroid:            computeEnemyCentroid,
        computeThreatBearing:            computeThreatBearing,
        positionAt:                      positionAt,
        kmBetween:                       kmBetween,
        bearingDeg:                      bearingDeg,
        // Constants (for tests)
        APPROACH_KM: APPROACH_KM, SCREEN_KM: SCREEN_KM, INTERCEPT_KM: INTERCEPT_KM,
        DEFEND_KM: DEFEND_KM, SUPPORT_KM: SUPPORT_KM, OBSERVE_KM: OBSERVE_KM,
        RESERVE_KM: RESERVE_KM, PATROL_RADIUS_KM: PATROL_RADIUS_KM,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    if (typeof root !== 'undefined') root.RmoozMovementEngine = API;
}(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this)));
