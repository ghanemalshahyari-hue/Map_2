'use strict';

function r5(n) { return Math.round(n * 1e5) / 1e5; }

function ring(center, n, radiusDeg) {
    var out = [];
    var lon = Array.isArray(center) ? Number(center[0]) : 0;
    var lat = Array.isArray(center) ? Number(center[1]) : 0;
    var count = Math.max(0, Math.floor(Number(n) || 0));
    var radius = Number(radiusDeg) || 0;
    var lonScale = Math.max(0.2, Math.cos(lat * Math.PI / 180));
    for (var i = 0; i < count; i++) {
        var a = (2 * Math.PI * i) / Math.max(1, count);
        out.push([r5(lon + (radius / lonScale) * Math.cos(a)), r5(lat + radius * Math.sin(a))]);
    }
    return out;
}

function axis(center, n, bearingDeg, distDeg, spreadDeg) {
    var out = [];
    var lon = Array.isArray(center) ? Number(center[0]) : 0;
    var lat = Array.isArray(center) ? Number(center[1]) : 0;
    var count = Math.max(0, Math.floor(Number(n) || 0));
    var br = (Number(bearingDeg) || 0) * Math.PI / 180;
    var dist = Number(distDeg) || 0;
    var spread = Number(spreadDeg) || 0;
    var lonScale = Math.max(0.2, Math.cos(lat * Math.PI / 180));
    var baseLon = lon + (dist * Math.sin(br)) / lonScale;
    var baseLat = lat + (dist * Math.cos(br));
    var perp = br + Math.PI / 2;
    for (var i = 0; i < count; i++) {
        var off = (count > 1) ? (spread * ((i / (count - 1)) - 0.5)) : 0;
        out.push([r5(baseLon + (off * Math.sin(perp)) / lonScale), r5(baseLat + off * Math.cos(perp))]);
    }
    return out;
}

function retiredResult() {
    return {
        requiresObjective: true,
        disabled: true,
        retired: true,
        code: 'legacy_ai_scenario_generator_retired',
        reason: 'This legacy draft builder is retired. Use Start New, Load Scenario, Edit Mode, and the live workspace. A replacement will be built later on the stable base workflow.',
        next_step: 'Use the live workspace and Edit Mode path.'
    };
}

function generateScenarioFromBrief() {
    return retiredResult();
}

module.exports = { generateScenarioFromBrief: generateScenarioFromBrief, ring: ring, axis: axis, retiredResult: retiredResult };
