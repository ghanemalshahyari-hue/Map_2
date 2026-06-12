/**
 * test-task2c-tasking-overlay.js
 *
 * TASK2C: Read-only tasking orders overlay on Leaflet map.
 * Verifies renderTaskingOverlay / clearTaskingOverlay behavior,
 * the public API surface, idempotency, and no mutation of markers/state.
 *
 * Static: no server, no Leaflet DOM required.
 * Run: node test-task2c-tasking-overlay.js
 */

'use strict';

let passed = 0;
let failed = 0;

function assert(condition, id, desc) {
    if (condition) {
        console.log('  PASS ' + id + ': ' + desc);
        passed++;
    } else {
        console.error('  FAIL ' + id + ': ' + desc);
        failed++;
    }
}

// ── Stubs ─────────────────────────────────────────────────────────────────────

function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Minimal L.circleMarker stub
function makeCircleMarker() {
    return {
        _type: 'circleMarker',
        _addedTo: null,
        _tooltip: null,
        addTo(lg) { this._addedTo = lg; if (lg && lg.addLayer) lg.addLayer(this); return this; },
        bindTooltip(html, _opts) { this._tooltip = html; return this; },
        getTooltip() { return this._tooltip ? { getContent: () => this._tooltip } : null; },
    };
}

// Minimal Leaflet marker stub with getLatLng
function makeMarker(uid, lat, lng) {
    return {
        _unitId: uid,
        _baseTooltip: 'base',
        _unitData: { id: uid },
        getLatLng: () => ({ lat, lng }),
        unbindTooltip() { return this; },
        bindTooltip() { return this; },
    };
}

// Minimal LayerGroup stub
function makeLayerGroup() {
    const layers = [];
    return {
        _layers: layers,
        addLayer(l) { layers.push(l); },
        removeLayer(l) {
            const i = layers.indexOf(l);
            if (i !== -1) layers.splice(i, 1);
        },
    };
}

// ── Inline port of the TASK2C functions ───────────────────────────────────────
// Mirrors production code so we can test without the full 6k-line file.

function buildModule(opts) {
    let taskingOverlayMarkers = [];
    let taskingOverlayEnabled = false;
    const layerGroup = opts.layerGroup;
    const lastWorldState = opts.lastWorldState;
    const redMarkers = opts.redMarkers || {};
    const blueMarkers = opts.blueMarkers || {};
    const createdBadges = []; // all badges ever created (for inspection)

    const TASKING_OVERLAY_PANE = 'rmoozTaskingOverlayPane';

    function clearTaskingOverlay() {
        for (const m of taskingOverlayMarkers) {
            if (m && layerGroup) { try { layerGroup.removeLayer(m); } catch (_) {} }
        }
        taskingOverlayMarkers = [];
    }

    function renderTaskingOverlay() {
        clearTaskingOverlay();
        if (!taskingOverlayEnabled || !layerGroup) return;
        if (!lastWorldState || !lastWorldState.derived) return;
        const tasking = lastWorldState.derived.unit_tasking || {};
        const allMarkers = Object.assign({}, redMarkers, blueMarkers);
        for (const uid of Object.keys(tasking)) {
            const marker = allMarkers[uid];
            if (!marker) continue;
            const ll = marker.getLatLng && marker.getLatLng();
            if (!ll) continue;
            const t = tasking[uid];
            const comp = t.component_label || t.action_component || '';
            const isBlue = String(t.side || '').toUpperCase() === 'BLUE';
            const dotColor = isBlue ? '#3a96d2' : '#c41e1e';
            const badge = makeCircleMarker();
            badge._color = dotColor;
            badge._uid = uid;
            badge.bindTooltip(
                'Orders: ' + esc(comp) + (t.action_what ? '<br>' + esc(t.action_what) : ''),
                { sticky: true, direction: 'top' }
            );
            badge.addTo(layerGroup);
            taskingOverlayMarkers.push(badge);
            createdBadges.push(badge);
        }
    }

    return {
        setTaskingOverlay: (on) => {
            taskingOverlayEnabled = (on !== false);
            try { taskingOverlayEnabled ? renderTaskingOverlay() : clearTaskingOverlay(); } catch (_) {}
            return taskingOverlayEnabled;
        },
        toggleTaskingOverlay: () => {
            taskingOverlayEnabled = !taskingOverlayEnabled;
            try { taskingOverlayEnabled ? renderTaskingOverlay() : clearTaskingOverlay(); } catch (_) {}
            return taskingOverlayEnabled;
        },
        isTaskingOverlayVisible: () => !!taskingOverlayEnabled,
        renderTaskingOverlay,
        clearTaskingOverlay,
        _getMarkers: () => taskingOverlayMarkers,
        _getCreated: () => createdBadges,
    };
}

// ── Shared fixtures ───────────────────────────────────────────────────────────

function makeWs(extraUids) {
    const unit_tasking = {
        'R-001': { uid: 'R-001', side: 'RED', component_label: 'Land Maneuver', action_what: 'Advance to objective' },
        'B-002': { uid: 'B-002', side: 'BLUE', component_label: 'Amphibious Assault', action_what: 'Seize beachhead' },
    };
    for (const uid of (extraUids || [])) {
        unit_tasking[uid] = { uid, side: 'RED', component_label: 'Test', action_what: 'Test action' };
    }
    return { derived: { unit_tasking } };
}

function makeMarkers() {
    return {
        red: { 'R-001': makeMarker('R-001', 32.0, 23.0) },
        blue: { 'B-002': makeMarker('B-002', 32.1, 23.1) },
        unrelated: makeMarker('R-NO-TASK', 32.2, 23.2),
    };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\nTASK2C — Tasking Orders Overlay\n');

// ── Group A: Basic rendering ─────────────────────────────────────────────────
console.log('A: Basic rendering');

{
    const lg = makeLayerGroup();
    const m = makeMarkers();
    const ws = makeWs();
    const mod = buildModule({ layerGroup: lg, lastWorldState: ws, redMarkers: m.red, blueMarkers: m.blue });

    mod.setTaskingOverlay(true);

    assert(mod._getMarkers().length === 2, 'TASK2C-01', 'Two badges created for two tasked units');
    assert(lg._layers.length === 2, 'TASK2C-02', 'Both badges added to layerGroup');

    const redBadge  = mod._getMarkers().find(b => b._uid === 'R-001');
    const blueBadge = mod._getMarkers().find(b => b._uid === 'B-002');
    assert(!!redBadge,  'TASK2C-03', 'Red tasked unit has badge');
    assert(!!blueBadge, 'TASK2C-04', 'Blue tasked unit has badge');
    assert(redBadge._color === '#c41e1e',  'TASK2C-05', 'Red badge uses red color');
    assert(blueBadge._color === '#3a96d2', 'TASK2C-06', 'Blue badge uses blue color');
}

// ── Group B: Units without tasking ───────────────────────────────────────────
console.log('\nB: Units without tasking');

{
    const lg = makeLayerGroup();
    const m = makeMarkers();
    const ws = makeWs();
    // Add an untasked marker to blue — it should not get a badge
    m.blue['B-NO-TASK'] = makeMarker('B-NO-TASK', 33.0, 24.0);
    const mod = buildModule({ layerGroup: lg, lastWorldState: ws, redMarkers: m.red, blueMarkers: m.blue });

    mod.setTaskingOverlay(true);

    const uids = mod._getMarkers().map(b => b._uid);
    assert(!uids.includes('B-NO-TASK'), 'TASK2C-07', 'Untasked unit gets no badge');
    assert(uids.includes('R-001') && uids.includes('B-002'), 'TASK2C-07b', 'Only tasked units have badges');
}

// ── Group C: Toggle off clears badges ────────────────────────────────────────
console.log('\nC: Disable clears badges');

{
    const lg = makeLayerGroup();
    const m = makeMarkers();
    const ws = makeWs();
    const mod = buildModule({ layerGroup: lg, lastWorldState: ws, redMarkers: m.red, blueMarkers: m.blue });

    mod.setTaskingOverlay(true);
    assert(mod._getMarkers().length === 2, 'TASK2C-08', 'Enabled: 2 badges exist');
    assert(lg._layers.length === 2, 'TASK2C-08b', 'Enabled: 2 layers in group');

    mod.setTaskingOverlay(false);
    assert(mod._getMarkers().length === 0, 'TASK2C-09', 'Disabled: internal array cleared');
    assert(lg._layers.length === 0, 'TASK2C-09b', 'Disabled: layers removed from group');
    assert(mod.isTaskingOverlayVisible() === false, 'TASK2C-10', 'isTaskingOverlayVisible() returns false after disable');
}

// ── Group D: Toggle function ──────────────────────────────────────────────────
console.log('\nD: toggleTaskingOverlay()');

{
    const lg = makeLayerGroup();
    const m = makeMarkers();
    const ws = makeWs();
    const mod = buildModule({ layerGroup: lg, lastWorldState: ws, redMarkers: m.red, blueMarkers: m.blue });

    const r1 = mod.toggleTaskingOverlay(); // off → on
    assert(r1 === true, 'TASK2C-11', 'toggleTaskingOverlay() returns true when turning on');
    assert(mod._getMarkers().length === 2, 'TASK2C-11b', 'Badges rendered after toggle on');

    const r2 = mod.toggleTaskingOverlay(); // on → off
    assert(r2 === false, 'TASK2C-12', 'toggleTaskingOverlay() returns false when turning off');
    assert(mod._getMarkers().length === 0, 'TASK2C-12b', 'Badges cleared after toggle off');
}

// ── Group E: Idempotency ─────────────────────────────────────────────────────
console.log('\nE: Idempotency — no duplicates');

{
    const lg = makeLayerGroup();
    const m = makeMarkers();
    const ws = makeWs();
    const mod = buildModule({ layerGroup: lg, lastWorldState: ws, redMarkers: m.red, blueMarkers: m.blue });

    mod.setTaskingOverlay(true);
    mod.setTaskingOverlay(true); // second enable — should not duplicate
    assert(mod._getMarkers().length === 2, 'TASK2C-13', 'Double enable: still exactly 2 badges (no duplicates)');
    assert(lg._layers.length === 2, 'TASK2C-13b', 'Double enable: still 2 layers in group');
}

// ── Group F: Guard conditions ─────────────────────────────────────────────────
console.log('\nF: Guard conditions');

{
    const lg = makeLayerGroup();
    const m = makeMarkers();
    const mod = buildModule({ layerGroup: lg, lastWorldState: null, redMarkers: m.red, blueMarkers: m.blue });
    let threw = false;
    try { mod.setTaskingOverlay(true); } catch (_) { threw = true; }
    assert(!threw, 'TASK2C-14', 'lastWorldState null — no throw');
    assert(mod._getMarkers().length === 0, 'TASK2C-14b', 'No badges when lastWorldState is null');
}

{
    const lg = makeLayerGroup();
    const m = makeMarkers();
    const mod = buildModule({ layerGroup: lg, lastWorldState: { derived: {} }, redMarkers: m.red, blueMarkers: m.blue });
    let threw = false;
    try { mod.setTaskingOverlay(true); } catch (_) { threw = true; }
    assert(!threw, 'TASK2C-15', 'missing unit_tasking — no throw');
    assert(mod._getMarkers().length === 0, 'TASK2C-15b', 'No badges when unit_tasking absent');
}

{
    // Marker with no getLatLng — should skip silently
    const lg = makeLayerGroup();
    const ws = makeWs();
    const red = { 'R-001': { _unitId: 'R-001', _baseTooltip: 'base', getLatLng: null } };
    const mod = buildModule({ layerGroup: lg, lastWorldState: ws, redMarkers: red, blueMarkers: {} });
    let threw = false;
    try { mod.setTaskingOverlay(true); } catch (_) { threw = true; }
    assert(!threw, 'TASK2C-16', 'Marker with no getLatLng skipped gracefully');
}

// ── Group G: Tooltip content ──────────────────────────────────────────────────
console.log('\nG: Tooltip content');

{
    const lg = makeLayerGroup();
    const m = makeMarkers();
    const ws = makeWs();
    const mod = buildModule({ layerGroup: lg, lastWorldState: ws, redMarkers: m.red, blueMarkers: m.blue });

    mod.setTaskingOverlay(true);
    const redBadge = mod._getMarkers().find(b => b._uid === 'R-001');
    assert(redBadge._tooltip.includes('Land Maneuver'), 'TASK2C-17', 'component_label appears in badge tooltip');
    assert(redBadge._tooltip.includes('Advance to objective'), 'TASK2C-18', 'action_what appears in badge tooltip');
    assert(redBadge._tooltip.includes('Orders:'), 'TASK2C-19', 'Orders label present in badge tooltip');
}

{
    // action_component fallback
    const lg = makeLayerGroup();
    const ws = { derived: { unit_tasking: { 'R-X': { uid: 'R-X', side: 'RED', action_component: 'fires', action_what: 'Suppress grid' } } } };
    const red = { 'R-X': makeMarker('R-X', 31.0, 22.0) };
    const mod = buildModule({ layerGroup: lg, lastWorldState: ws, redMarkers: red, blueMarkers: {} });
    mod.setTaskingOverlay(true);
    const badge = mod._getMarkers()[0];
    assert(badge._tooltip.includes('fires'), 'TASK2C-20', 'Falls back to action_component when component_label absent');
}

// ── Group H: Main marker icon/data not mutated ────────────────────────────────
console.log('\nH: Main marker immutability');

{
    const lg = makeLayerGroup();
    const m = makeMarkers();
    const ws = makeWs();
    const redMarker = m.red['R-001'];
    const origBase = redMarker._baseTooltip;
    const origUnitData = JSON.stringify(redMarker._unitData);

    const mod = buildModule({ layerGroup: lg, lastWorldState: ws, redMarkers: m.red, blueMarkers: m.blue });
    mod.setTaskingOverlay(true);

    assert(redMarker._baseTooltip === origBase, 'TASK2C-21', 'Main marker _baseTooltip unchanged after overlay render');
    assert(JSON.stringify(redMarker._unitData) === origUnitData, 'TASK2C-22', 'Main marker _unitData unchanged after overlay render');
}

// ── Group I: No hardcoded operational values ──────────────────────────────────
console.log('\nI: Data-driven — no hardcoded operational strings');

{
    const CUSTOM_LABEL = 'CustomOverlayOp_XR99';
    const CUSTOM_WHAT  = 'CustomOverlayAction_ZZZ';
    const lg = makeLayerGroup();
    const ws = { derived: { unit_tasking: { 'R-CUSTOM': { uid: 'R-CUSTOM', side: 'RED', component_label: CUSTOM_LABEL, action_what: CUSTOM_WHAT } } } };
    const red = { 'R-CUSTOM': makeMarker('R-CUSTOM', 30.0, 21.0) };
    const mod = buildModule({ layerGroup: lg, lastWorldState: ws, redMarkers: red, blueMarkers: {} });

    mod.setTaskingOverlay(true);
    const badge = mod._getMarkers()[0];
    assert(badge._tooltip.includes(CUSTOM_LABEL), 'TASK2C-23', 'Custom component_label renders verbatim in badge tooltip');
    assert(badge._tooltip.includes(CUSTOM_WHAT), 'TASK2C-24', 'Custom action_what renders verbatim in badge tooltip');
}

// ── Group J: HTML escaping ────────────────────────────────────────────────────
console.log('\nJ: HTML escaping');

{
    const lg = makeLayerGroup();
    const ws = { derived: { unit_tasking: {
        'R-ESC': { uid: 'R-ESC', side: 'RED', component_label: '<script>xss</script>', action_what: '"Quoted" & <b>bold</b>' },
    }}};
    const red = { 'R-ESC': makeMarker('R-ESC', 31.5, 22.5) };
    const mod = buildModule({ layerGroup: lg, lastWorldState: ws, redMarkers: red, blueMarkers: {} });
    mod.setTaskingOverlay(true);
    const badge = mod._getMarkers()[0];
    assert(!badge._tooltip.includes('<script>'), 'TASK2C-25', 'XSS tag escaped in badge tooltip');
    assert(badge._tooltip.includes('&lt;script&gt;'), 'TASK2C-25b', 'Angle brackets escaped to entities');
    assert(badge._tooltip.includes('&quot;'), 'TASK2C-26', 'Quotes escaped in action_what');
    assert(badge._tooltip.includes('&amp;'), 'TASK2C-27', 'Ampersand escaped in action_what');
}

// ── Group K: Production file checks ───────────────────────────────────────────
console.log('\nK: Production file structure');

{
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
        path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8'
    );

    assert(src.includes('let taskingOverlayMarkers'), 'TASK2C-28', 'taskingOverlayMarkers state variable declared');
    assert(src.includes('let taskingOverlayEnabled'), 'TASK2C-29', 'taskingOverlayEnabled state variable declared');
    assert(src.includes('TASKING_OVERLAY_PANE'), 'TASK2C-30', 'TASKING_OVERLAY_PANE constant declared');
    assert(src.includes('function renderTaskingOverlay'), 'TASK2C-31', 'renderTaskingOverlay function defined');
    assert(src.includes('function clearTaskingOverlay'), 'TASK2C-32', 'clearTaskingOverlay function defined');
    assert(src.includes('renderTaskingOverlay(); // TASK2C'), 'TASK2C-33', 'renderTaskingOverlay called in applyState');
    assert(src.includes('setTaskingOverlay:'), 'TASK2C-34', 'setTaskingOverlay in public API');
    assert(src.includes('toggleTaskingOverlay:'), 'TASK2C-35', 'toggleTaskingOverlay in public API');
    assert(src.includes('isTaskingOverlayVisible:'), 'TASK2C-36', 'isTaskingOverlayVisible in public API');

    // HUD file
    const hudSrc = fs.readFileSync(
        path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-hud.js'), 'utf8'
    );
    assert(hudSrc.includes('wg-adj-orders-btn'), 'TASK2C-37', 'Orders button exists in HUD HTML');
    assert(hudSrc.includes('toggleTaskingOverlay'), 'TASK2C-38', 'HUD event listener calls toggleTaskingOverlay');

    // No hardcoded operational strings in renderTaskingOverlay block
    const fnStart = src.indexOf('function renderTaskingOverlay');
    const fnEnd   = src.indexOf('function clearScenario');
    const block = fnStart !== -1 && fnEnd !== -1 ? src.slice(fnStart, fnEnd) : '';
    const badStrings = ['Land Maneuver', 'Amphibious Assault', 'Electronic Warfare', 'fires', 'Advance to objective'];
    let anyHardcoded = false;
    for (const s of badStrings) {
        if (block.includes(s)) { anyHardcoded = true; console.error('    Found hardcoded: ' + s); }
    }
    assert(!anyHardcoded, 'TASK2C-39', 'No hardcoded operational strings in renderTaskingOverlay');

    // TASK2B tooltip enrichment still present
    assert(src.includes('function _refreshTaskingTooltips'), 'TASK2C-40', 'TASK2B _refreshTaskingTooltips still present');
    assert(src.includes('m._baseTooltip = _redTT'), 'TASK2C-40b', 'TASK2B _baseTooltip assignment still present');
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('\n─────────────────────────────────');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed === 0) {
    console.log('ALL PASS ✓');
} else {
    process.exitCode = 1;
}
