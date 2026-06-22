'use strict';
/* ============================================================================
 * mission-role-contract.js — RMOOZ-MISSION-ROLE-CONTRACT-A
 * ----------------------------------------------------------------------------
 * Derives mission roles from an imported scenario JSON.
 * Priority (first match wins):
 *   1. generation.template  — file_explicit, confidence=high
 *   2. Unit role analysis   — role_inferred, confidence=medium
 *   3. Default              — provisional, confidence=low
 *
 * Exports:
 *   buildMissionRoleContract(scenario)  → contract object (8 fields + confidence)
 * ========================================================================== */

var OFFENSIVE_ROLES = ['armor', 'mech_infantry', 'fires', 'assault', 'attack',
                       'armored', 'mechanized', 'artillery', 'rocket', 'strike'];

function _centroid(units) {
    var n = 0, sLat = 0, sLon = 0;
    (units || []).forEach(function (u) {
        var c = u.coord;
        if (c && c.length >= 2 && Number.isFinite(+c[0]) && Number.isFinite(+c[1])) {
            sLon += +c[0]; sLat += +c[1]; n++;
        }
    });
    return n ? { lat: sLat / n, lon: sLon / n } : null;
}

function _distSq(lat1, lon1, lat2, lon2) {
    var dlat = lat1 - lat2, dlon = lon1 - lon2;
    return dlat * dlat + dlon * dlon;
}

function _deriveObjOwner(sc) {
    var obj = sc.obj;
    if (!obj || !obj.coord || !Number.isFinite(+obj.coord[0]) || !Number.isFinite(+obj.coord[1])) {
        return 'uncontrolled';
    }
    var oLon = +obj.coord[0], oLat = +obj.coord[1];
    var rc = _centroid(sc.red_units);
    var bc = _centroid(sc.blue_units_initial || sc.blue_units);
    if (!rc || !bc) return 'uncontrolled';
    var dR = _distSq(oLat, oLon, rc.lat, rc.lon);
    var dB = _distSq(oLat, oLon, bc.lat, bc.lon);
    return dB < dR ? 'BLUE' : 'RED';
}

function _countOffensiveRoles(units) {
    return (units || []).filter(function (u) {
        var role = String(u.role || u.type || '').toLowerCase();
        return OFFENSIVE_ROLES.some(function (r) { return role.indexOf(r) !== -1; });
    }).length;
}

function buildMissionRoleContract(scenario) {
    if (!scenario) {
        return {
            attacker_side: 'RED', defender_side: 'BLUE',
            objective_owner_side: 'uncontrolled', initial_actor: 'RED',
            active_coa_side: 'RED', reaction_side: 'BLUE',
            mission_type: 'attack', objective_source: 'provisional', confidence: 'low'
        };
    }

    var objOwner = _deriveObjOwner(scenario);

    // Priority 1: generation.template (most reliable signal)
    var tpl = String((scenario.generation && scenario.generation.template) || '').toLowerCase().trim();
    if (tpl === 'attack_objective' || tpl === 'attack') {
        return {
            attacker_side: 'RED', defender_side: 'BLUE',
            objective_owner_side: objOwner, initial_actor: 'RED',
            active_coa_side: 'RED', reaction_side: 'BLUE',
            mission_type: 'attack', objective_source: 'file_explicit', confidence: 'high'
        };
    }
    if (tpl === 'defend_objective' || tpl === 'defend') {
        return {
            attacker_side: 'BLUE', defender_side: 'RED',
            objective_owner_side: objOwner, initial_actor: 'BLUE',
            active_coa_side: 'BLUE', reaction_side: 'RED',
            mission_type: 'defend', objective_source: 'file_explicit', confidence: 'high'
        };
    }

    // Priority 2: unit role analysis
    var redOff  = _countOffensiveRoles(scenario.red_units);
    var blueOff = _countOffensiveRoles(scenario.blue_units_initial || scenario.blue_units);
    if (redOff > 0 || blueOff > 0) {
        var atk = redOff >= blueOff ? 'RED' : 'BLUE';
        var def = atk === 'RED' ? 'BLUE' : 'RED';
        return {
            attacker_side: atk, defender_side: def,
            objective_owner_side: objOwner, initial_actor: atk,
            active_coa_side: atk, reaction_side: def,
            mission_type: 'attack', objective_source: 'role_inferred', confidence: 'medium'
        };
    }

    // Priority 3: default
    return {
        attacker_side: 'RED', defender_side: 'BLUE',
        objective_owner_side: objOwner, initial_actor: 'RED',
        active_coa_side: 'RED', reaction_side: 'BLUE',
        mission_type: 'attack', objective_source: 'provisional', confidence: 'low'
    };
}

module.exports = { buildMissionRoleContract: buildMissionRoleContract };
