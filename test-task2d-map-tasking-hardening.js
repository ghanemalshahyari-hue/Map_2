/**
 * test-task2d-map-tasking-hardening.js
 *
 * TASK2-D: Hardening / regression tests for the completed Map Tasking Evidence layer.
 *
 * Items covered (1–11):
 *   1.  Both paths (TASK2-B tooltip, TASK2-C overlay) read ws.derived.unit_tasking[uid]
 *   2.  Custom labels propagate verbatim through both paths
 *   3.  No hardcoded operational strings in any display path
 *   4.  Overlay badges never mutate main unit markers
 *   5.  Enable / disable is idempotent (no duplicates, no residue)
 *   6.  Step change refreshes overlay badge count
 *   7.  clearScenario() removes overlay markers
 *   8.  HUD button active class matches map API state
 *   9.  Existing coverage / detection / engagement toggle API unchanged
 *  10.  wargame 6 backup file is untouched
 *  11.  No mutation / apply / execute in map tasking paths
 *
 * Static: no server, no Leaflet DOM.
 * Run: node test-task2d-map-tasking-hardening.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

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

// ── Source files (read once) ──────────────────────────────────────────────────

const MAP_SRC = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js'), 'utf8');
const HUD_SRC = fs.readFileSync(
    path.join(__dirname, 'UI_MOdified/client/wargame/adjudicator-hud.js'), 'utf8');

// wargame 6 backup — path has a space
const BACKUP_PATH = path.join(__dirname, 'UI_MOdified/client/wargame 6/adjudicator-map.js');
const BACKUP_SRC  = fs.existsSync(BACKUP_PATH) ? fs.readFileSync(BACKUP_PATH, 'utf8') : null;

// ── Stubs ─────────────────────────────────────────────────────────────────────

function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function makeLayerGroup() {
    const layers = [];
    return {
        _layers: layers,
        addLayer(l)    { layers.push(l); },
        removeLayer(l) { const i = layers.indexOf(l); if (i !== -1) layers.splice(i, 1); },
    };
}

function makeMarker(uid, lat, lng) {
    return {
        _unitId: uid,
        _baseTooltip: `<b>${uid}</b>`,
        _unitData: { id: uid, name: uid + '-name', role: 'test-role' },
        _currentTooltip: null,
        _taskingApplied: false,
        getLatLng: () => ({ lat, lng }),
        unbindTooltip() { return this; },
        bindTooltip(html) { this._currentTooltip = html; return this; },
        getTooltip()      { return this._currentTooltip ? { getContent: () => this._currentTooltip } : null; },
    };
}

function makeCircleMarker() {
    return {
        _type: 'circleMarker',
        _addedTo: null,
        _tooltip: null,
        _color: null,
        addTo(lg) { this._addedTo = lg; if (lg && lg.addLayer) lg.addLayer(this); return this; },
        bindTooltip(html) { this._tooltip = html; return this; },
    };
}

// ── Combined harness — exact port of both TASK2-B and TASK2-C functions ───────

function buildCombinedModule(opts) {
    let lastWorldState     = opts.lastWorldState  || null;
    let taskingOverlayMarkers = [];
    let taskingOverlayEnabled = false;
    const layerGroup       = opts.layerGroup;
    let redMarkers         = Object.assign({}, opts.redMarkers  || {});
    let blueMarkers        = Object.assign({}, opts.blueMarkers || {});

    // ── TASK2-B path (exact port) ──
    function _applyTaskingToMarkerMap(markerMap, tasking) {
        for (const uid of Object.keys(markerMap)) {
            const m = markerMap[uid];
            if (!m || !m._baseTooltip) continue;
            const t = tasking[uid];
            if (!t) {
                try { m.unbindTooltip().bindTooltip(m._baseTooltip, { permanent: false }); } catch (_) {}
                continue;
            }
            const comp = t.component_label || t.action_component || '';
            const what = t.action_what || '';
            const taskLine = '<div style="margin-top:4px;padding-top:3px;border-top:1px solid #4a4a3a;font-size:9px;color:#c8c080;font-family:monospace;">'
                + '<span style="opacity:.7;">Orders:</span> ' + esc(comp)
                + (what ? '<br><span style="opacity:.7;">Mission:</span> ' + esc(what) : '')
                + '</div>';
            try { m.unbindTooltip().bindTooltip(m._baseTooltip + taskLine, { permanent: false }); } catch (_) {}
        }
    }

    function _refreshTaskingTooltips() {
        if (!lastWorldState || !lastWorldState.derived) return;
        const tasking = lastWorldState.derived.unit_tasking || {};
        _applyTaskingToMarkerMap(redMarkers, tasking);
        _applyTaskingToMarkerMap(blueMarkers, tasking);
    }

    // ── TASK2-C path (exact port) ──
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
            badge._uid   = uid;
            badge._color = dotColor;
            badge.bindTooltip(
                'Orders: ' + esc(comp) + (t.action_what ? '<br>' + esc(t.action_what) : ''),
                { sticky: true, direction: 'top' }
            );
            badge.addTo(layerGroup);
            taskingOverlayMarkers.push(badge);
        }
    }

    // ── clearScenario simulation ──
    function clearScenario() {
        taskingOverlayMarkers = [];
        redMarkers  = {};
        blueMarkers = {};
    }

    return {
        // Mutators for step-change / scenario-change tests
        setWorldState(ws)   { lastWorldState = ws; },
        setRedMarkers(m)    { redMarkers  = Object.assign({}, m); },
        setBlueMarkers(m)   { blueMarkers = Object.assign({}, m); },
        // TASK2-B
        _refreshTaskingTooltips,
        _applyTaskingToMarkerMap,
        // TASK2-C
        clearTaskingOverlay,
        renderTaskingOverlay,
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
        clearScenario,
        // Inspection
        _getOverlayMarkers: () => taskingOverlayMarkers,
        _getRedMarkers:     () => redMarkers,
        _getBlueMarkers:    () => blueMarkers,
    };
}

// ── Shared fixtures ───────────────────────────────────────────────────────────

function makeWs(extra) {
    const unit_tasking = {
        'R-001': { uid: 'R-001', side: 'RED',  component_label: 'Land Maneuver',      action_what: 'Advance to objective' },
        'B-002': { uid: 'B-002', side: 'BLUE', component_label: 'Amphibious Assault', action_what: 'Seize beachhead'      },
    };
    for (const [uid, t] of Object.entries(extra || {})) unit_tasking[uid] = t;
    return { derived: { unit_tasking } };
}

// ═════════════════════════════════════════════════════════════════════════════
// Group A — Item 1: Both paths read ws.derived.unit_tasking[uid]
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nA: Shared data source (Item 1)');
{
    const lg  = makeLayerGroup();
    const red = { 'R-001': makeMarker('R-001', 32.0, 23.0) };
    const blu = { 'B-002': makeMarker('B-002', 32.1, 23.1) };
    const ws  = makeWs();
    const mod = buildCombinedModule({ layerGroup: lg, lastWorldState: ws, redMarkers: red, blueMarkers: blu });

    // Run TASK2-B path
    mod._refreshTaskingTooltips();
    // Run TASK2-C path
    mod.setTaskingOverlay(true);

    // Both touched the same UIDs
    const tooltipHitR = red['R-001']._currentTooltip && red['R-001']._currentTooltip.includes('Orders:');
    const tooltipHitB = blu['B-002']._currentTooltip && blu['B-002']._currentTooltip.includes('Orders:');
    const badgeUids   = mod._getOverlayMarkers().map(b => b._uid);

    assert(tooltipHitR, 'T2D-01', 'TASK2-B tooltip path reads unit_tasking for R-001');
    assert(tooltipHitB, 'T2D-02', 'TASK2-B tooltip path reads unit_tasking for B-002');
    assert(badgeUids.includes('R-001'), 'T2D-03', 'TASK2-C overlay path reads unit_tasking for R-001');
    assert(badgeUids.includes('B-002'), 'T2D-04', 'TASK2-C overlay path reads unit_tasking for B-002');

    // Both process the exact same uid set
    const tooltipUids  = ['R-001', 'B-002'].filter(uid => {
        const m = (red[uid] || blu[uid]);
        return m && m._currentTooltip && m._currentTooltip.includes('Orders:');
    });
    const overlayUids  = new Set(badgeUids);
    const tooltipUidSet = new Set(tooltipUids);
    assert(
        [...tooltipUidSet].every(u => overlayUids.has(u)) && [...overlayUids].every(u => tooltipUidSet.has(u)),
        'T2D-05', 'Both paths process the identical uid set from unit_tasking'
    );
}

// ═════════════════════════════════════════════════════════════════════════════
// Group B — Item 2: Custom labels propagate verbatim through both paths
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nB: Verbatim label propagation (Item 2)');
{
    const CUSTOM_LABEL = 'XR99_CustomOp_Label_Unique';
    const CUSTOM_WHAT  = 'XR99_CustomAction_Unique';
    const lg  = makeLayerGroup();
    const red = { 'R-X': makeMarker('R-X', 31.0, 22.0) };
    const ws  = { derived: { unit_tasking: {
        'R-X': { uid: 'R-X', side: 'RED', component_label: CUSTOM_LABEL, action_what: CUSTOM_WHAT }
    }}};
    const mod = buildCombinedModule({ layerGroup: lg, lastWorldState: ws, redMarkers: red });

    mod._refreshTaskingTooltips();
    mod.setTaskingOverlay(true);

    const tooltip = red['R-X']._currentTooltip || '';
    const badge   = mod._getOverlayMarkers()[0];

    assert(tooltip.includes(CUSTOM_LABEL), 'T2D-06', 'Custom component_label verbatim in TASK2-B tooltip');
    assert(tooltip.includes(CUSTOM_WHAT),  'T2D-07', 'Custom action_what verbatim in TASK2-B tooltip');
    assert(badge && badge._tooltip && badge._tooltip.includes(CUSTOM_LABEL), 'T2D-08', 'Custom component_label verbatim in TASK2-C badge tooltip');
    assert(badge && badge._tooltip && badge._tooltip.includes(CUSTOM_WHAT),  'T2D-09', 'Custom action_what verbatim in TASK2-C badge tooltip');

    // Cross-verify: the label text that appears in the tooltip matches the badge tooltip
    const ttLabel  = tooltip.includes(CUSTOM_LABEL);
    const badLabel = badge && badge._tooltip && badge._tooltip.includes(CUSTOM_LABEL);
    assert(ttLabel && badLabel, 'T2D-10', 'Same custom label appears identically in both tooltip and badge (cross-verify)');
}

// ═════════════════════════════════════════════════════════════════════════════
// Group C — Item 3: No hardcoded operational strings in display paths
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nC: No hardcoded operational strings (Item 3)');
{
    const OPERATIONAL_STRINGS = [
        'Land Maneuver', 'Amphibious Assault', 'Electronic Warfare',
        'Air Defense', 'Logistics', 'Strategic Strike', 'Naval Maneuver',
        'Advance to objective', 'Seize beachhead', 'Fire 12 SSMs',
        'R-d3', 'B-d3', 'Lahej', 'Libya',
    ];

    // Extract the renderTaskingOverlay function block
    const rtStart  = MAP_SRC.indexOf('function renderTaskingOverlay');
    const rtEnd    = MAP_SRC.indexOf('function _refreshTaskingTooltips');
    const rtBlock  = rtStart !== -1 && rtEnd !== -1 ? MAP_SRC.slice(rtStart, rtEnd) : '';

    // Extract the _applyTaskingToMarkerMap function block
    const atStart  = MAP_SRC.indexOf('function _applyTaskingToMarkerMap');
    const atEnd    = MAP_SRC.indexOf('function clearScenario');
    const atBlock  = atStart !== -1 && atEnd !== -1 ? MAP_SRC.slice(atStart, atEnd) : '';

    // Extract the _refreshTaskingTooltips block
    const rfStart  = MAP_SRC.indexOf('function _refreshTaskingTooltips');
    const rfEnd    = MAP_SRC.indexOf('function _applyTaskingToMarkerMap');
    const rfBlock  = rfStart !== -1 && rfEnd !== -1 ? MAP_SRC.slice(rfStart, rfEnd) : '';

    for (const s of OPERATIONAL_STRINGS) {
        assert(!rtBlock.includes(s), 'T2D-11a-' + s.replace(/\s+/g,'_').slice(0,20),
            'renderTaskingOverlay: no hardcoded "' + s + '"');
        assert(!atBlock.includes(s), 'T2D-11b-' + s.replace(/\s+/g,'_').slice(0,20),
            '_applyTaskingToMarkerMap: no hardcoded "' + s + '"');
    }

    // HUD orders button has no hardcoded unit labels
    const hudBtnStart = HUD_SRC.indexOf('wg-adj-orders-btn');
    const hudBtnBlock = hudBtnStart !== -1 ? HUD_SRC.slice(hudBtnStart, hudBtnStart + 500) : '';
    let hudHardcoded = false;
    for (const s of OPERATIONAL_STRINGS) {
        if (hudBtnBlock.includes(s)) { hudHardcoded = true; console.error('    HUD hardcoded: ' + s); }
    }
    assert(!hudHardcoded, 'T2D-12', 'HUD orders button has no hardcoded operational labels');
}

// ═════════════════════════════════════════════════════════════════════════════
// Group D — Item 4: Overlay badges never mutate main unit markers
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nD: Overlay marker immutability (Item 4)');
{
    const lg  = makeLayerGroup();
    const red = { 'R-001': makeMarker('R-001', 32.0, 23.0) };
    const ws  = makeWs();
    const mod = buildCombinedModule({ layerGroup: lg, lastWorldState: ws, redMarkers: red });

    const m = red['R-001'];
    const origBase     = m._baseTooltip;
    const origUnitData = JSON.stringify(m._unitData);

    mod.setTaskingOverlay(true);

    assert(m._baseTooltip === origBase,           'T2D-13', 'renderTaskingOverlay: _baseTooltip unchanged on main marker');
    assert(JSON.stringify(m._unitData) === origUnitData, 'T2D-14', 'renderTaskingOverlay: _unitData unchanged on main marker');

    // Production code must not call setIcon or setLatLng inside renderTaskingOverlay
    const rtStart = MAP_SRC.indexOf('function renderTaskingOverlay');
    const rtEnd   = MAP_SRC.indexOf('// TASK2B: Read-only tasking evidence');
    const rtBlock = rtStart !== -1 && rtEnd !== -1 ? MAP_SRC.slice(rtStart, rtEnd) : '';
    assert(!rtBlock.includes('.setIcon('),    'T2D-15', 'renderTaskingOverlay source: no setIcon calls');
    assert(!rtBlock.includes('.setLatLng('),  'T2D-16', 'renderTaskingOverlay source: no setLatLng calls on unit markers');
    assert(!rtBlock.includes('._baseTooltip ='), 'T2D-17', 'renderTaskingOverlay source: no _baseTooltip write');
    assert(!rtBlock.includes('._unitData ='),    'T2D-18', 'renderTaskingOverlay source: no _unitData write');

    // Overlay markers are separate objects — not the same references as unit markers
    mod.setTaskingOverlay(true);
    const overlayMarkers = mod._getOverlayMarkers();
    const unitMarkerRefs = Object.values(red);
    const anyShared = overlayMarkers.some(b => unitMarkerRefs.includes(b));
    assert(!anyShared, 'T2D-19', 'Overlay badge objects are distinct from unit marker objects (no shared refs)');
}

// ═════════════════════════════════════════════════════════════════════════════
// Group E — Item 5: Idempotency
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nE: Idempotency (Item 5)');
{
    const lg  = makeLayerGroup();
    const red = { 'R-001': makeMarker('R-001', 32.0, 23.0) };
    const blu = { 'B-002': makeMarker('B-002', 32.1, 23.1) };
    const ws  = makeWs();
    const mod = buildCombinedModule({ layerGroup: lg, lastWorldState: ws, redMarkers: red, blueMarkers: blu });

    // Enable twice
    mod.setTaskingOverlay(true);
    mod.setTaskingOverlay(true);
    assert(mod._getOverlayMarkers().length === 2, 'T2D-20', 'Enable twice: exactly 2 badges (no duplicates)');
    assert(lg._layers.length === 2,               'T2D-21', 'Enable twice: exactly 2 layers in group (no duplicates)');

    // Disable twice
    mod.setTaskingOverlay(false);
    mod.setTaskingOverlay(false);
    assert(mod._getOverlayMarkers().length === 0, 'T2D-22', 'Disable twice: 0 badges remain');
    assert(lg._layers.length === 0,               'T2D-23', 'Disable twice: 0 layers in group');
    assert(!mod.isTaskingOverlayVisible(),         'T2D-24', 'Disable twice: isTaskingOverlayVisible() is false');

    // Toggle sequence: off → on → off → on
    mod.toggleTaskingOverlay(); // on
    const c1 = mod._getOverlayMarkers().length;
    mod.toggleTaskingOverlay(); // off
    const c2 = mod._getOverlayMarkers().length;
    mod.toggleTaskingOverlay(); // on
    const c3 = mod._getOverlayMarkers().length;
    assert(c1 === 2 && c2 === 0 && c3 === 2, 'T2D-25', 'Toggle sequence off→on→off→on: counts are 2,0,2 (idempotent)');

    // TASK2-B tooltip refresh is also idempotent
    mod._refreshTaskingTooltips();
    const tt1 = red['R-001']._currentTooltip;
    mod._refreshTaskingTooltips();
    const tt2 = red['R-001']._currentTooltip;
    assert(tt1 === tt2, 'T2D-26', '_refreshTaskingTooltips called twice: tooltip content identical (idempotent)');
}

// ═════════════════════════════════════════════════════════════════════════════
// Group F — Item 6: Step change refreshes overlay badge count
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nF: Step change refreshes overlay count (Item 6)');
{
    const lg = makeLayerGroup();
    // Step A: 3 tasked units, all have markers
    const wsA = { derived: { unit_tasking: {
        'R-1': { uid: 'R-1', side: 'RED',  component_label: 'Alpha', action_what: 'Act A' },
        'R-2': { uid: 'R-2', side: 'RED',  component_label: 'Beta',  action_what: 'Act B' },
        'B-3': { uid: 'B-3', side: 'BLUE', component_label: 'Gamma', action_what: 'Act C' },
    }}};
    const markersA = {
        'R-1': makeMarker('R-1', 30.0, 20.0),
        'R-2': makeMarker('R-2', 30.1, 20.1),
        'B-3': makeMarker('B-3', 30.2, 20.2),
    };

    // Step B: only 1 tasked unit
    const wsB = { derived: { unit_tasking: {
        'R-1': { uid: 'R-1', side: 'RED', component_label: 'AlphaB', action_what: 'Act A-2' },
    }}};

    const mod = buildCombinedModule({ layerGroup: lg, lastWorldState: wsA,
        redMarkers: { 'R-1': markersA['R-1'], 'R-2': markersA['R-2'] },
        blueMarkers: { 'B-3': markersA['B-3'] },
    });

    mod.setTaskingOverlay(true);
    const countA = mod._getOverlayMarkers().length;
    assert(countA === 3, 'T2D-27', 'Step A: 3 tasked units → 3 overlay badges');
    assert(lg._layers.length === 3, 'T2D-27b', 'Step A: 3 layers in group');

    // Simulate step change: update world state and re-render
    mod.setWorldState(wsB);
    mod.renderTaskingOverlay();  // re-render with new world state
    const countB = mod._getOverlayMarkers().length;
    assert(countB === 1, 'T2D-28', 'Step B: 1 tasked unit → 1 overlay badge (down from 3)');
    assert(lg._layers.length === 1, 'T2D-28b', 'Step B: 1 layer in group (old 3 cleared)');

    // Tooltip also updates on step change
    mod.setWorldState(wsA);
    mod._refreshTaskingTooltips();
    const ttA = markersA['R-1']._currentTooltip || '';
    mod.setWorldState(wsB);
    mod._refreshTaskingTooltips();
    const ttB = markersA['R-1']._currentTooltip || '';
    assert(ttA.includes('Alpha') && ttB.includes('AlphaB'), 'T2D-29', 'Tooltip content updates on step change (label differs between steps)');
    assert(ttA !== ttB, 'T2D-30', 'Tooltip is different for different steps (not cached)');

    // Step change with 0 tasked units clears all
    mod.setWorldState({ derived: { unit_tasking: {} } });
    mod.renderTaskingOverlay();
    assert(mod._getOverlayMarkers().length === 0, 'T2D-31', 'Step with 0 tasking units clears all badges');
    assert(lg._layers.length === 0,               'T2D-31b', 'Step with 0 units: group empty');
}

// ═════════════════════════════════════════════════════════════════════════════
// Group G — Item 7: clearScenario removes overlay markers
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nG: clearScenario removes overlay markers (Item 7)');
{
    // Static: verify clearScenario in production source resets taskingOverlayMarkers
    const csStart = MAP_SRC.indexOf('function clearScenario');
    const csEnd   = MAP_SRC.indexOf('function applyState');
    const csBlock = csStart !== -1 && csEnd !== -1 ? MAP_SRC.slice(csStart, csEnd) : '';
    assert(csBlock.includes('taskingOverlayMarkers = []'), 'T2D-32',
        'clearScenario() resets taskingOverlayMarkers = [] in production code');

    // Dynamic: inline clearScenario resets the array
    const lg  = makeLayerGroup();
    const red = { 'R-001': makeMarker('R-001', 32.0, 23.0) };
    const ws  = makeWs();
    const mod = buildCombinedModule({ layerGroup: lg, lastWorldState: ws, redMarkers: red });

    mod.setTaskingOverlay(true);
    assert(mod._getOverlayMarkers().length > 0, 'T2D-33', 'Pre-condition: badges exist before clearScenario');

    mod.clearScenario();
    assert(mod._getOverlayMarkers().length === 0, 'T2D-34', 'After clearScenario: overlay markers array is empty');
    assert(Object.keys(mod._getRedMarkers()).length  === 0, 'T2D-35', 'After clearScenario: redMarkers cleared');
    assert(Object.keys(mod._getBlueMarkers()).length === 0, 'T2D-36', 'After clearScenario: blueMarkers cleared');

    // clearTaskingOverlay also removes from the layerGroup (not just resets the array)
    const lg2  = makeLayerGroup();
    const red2 = { 'R-001': makeMarker('R-001', 32.0, 23.0) };
    const mod2 = buildCombinedModule({ layerGroup: lg2, lastWorldState: ws, redMarkers: red2 });
    mod2.setTaskingOverlay(true);
    const countBefore = lg2._layers.length;
    mod2.clearTaskingOverlay();
    assert(countBefore > 0 && lg2._layers.length === 0, 'T2D-37', 'clearTaskingOverlay removes badges from layerGroup');
}

// ═════════════════════════════════════════════════════════════════════════════
// Group H — Item 8: HUD button state matches map API state
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nH: HUD button-state sync (Item 8)');
{
    // Verify the HUD orders button wiring pattern in source
    const hudOrdStart = HUD_SRC.indexOf("querySelector('#wg-adj-orders-btn')");
    const hudOrdBlock = hudOrdStart !== -1 ? HUD_SRC.slice(hudOrdStart, hudOrdStart + 500) : '';

    assert(hudOrdBlock.includes('toggleTaskingOverlay'),           'T2D-38', "HUD: calls toggleTaskingOverlay on click");
    assert(hudOrdBlock.includes("classList.toggle('active', !!on)"), 'T2D-39', "HUD: classList.toggle('active', !!on) on click");
    assert(hudOrdBlock.includes("typeof map.toggleTaskingOverlay !== 'function'") ||
           hudOrdBlock.includes('typeof map.toggleTaskingOverlay !== "function"'),
        'T2D-40', 'HUD: null-guards toggleTaskingOverlay before calling');

    // Verify consistent pattern: all three existing toggles and the new one use the same pattern
    const patterns = [
        { name: 'coverageRings',     fn: 'toggleCoverageRings',     btn: 'wg-adj-rings-btn'    },
        { name: 'detectionContacts', fn: 'toggleDetectionContacts', btn: 'wg-adj-contacts-btn' },
        { name: 'engagements',       fn: 'toggleEngagements',       btn: 'wg-adj-eng-btn'      },
        { name: 'taskingOverlay',    fn: 'toggleTaskingOverlay',    btn: 'wg-adj-orders-btn'   },
    ];
    for (const p of patterns) {
        const bStart = HUD_SRC.indexOf(`querySelector('#${p.btn}')`);
        const bBlock = bStart !== -1 ? HUD_SRC.slice(bStart, bStart + 500) : '';
        assert(bBlock.includes(p.fn) && bBlock.includes("classList.toggle('active', !!on)"),
            'T2D-41-' + p.name, `HUD button #${p.btn}: uses ${p.fn} + classList.toggle pattern`);
    }

    // Dynamic: verify isTaskingOverlayVisible() mirrors what toggleTaskingOverlay returned
    const lg  = makeLayerGroup();
    const red = { 'R-001': makeMarker('R-001', 32.0, 23.0) };
    const ws  = makeWs();
    const mod = buildCombinedModule({ layerGroup: lg, lastWorldState: ws, redMarkers: red });

    const r1 = mod.toggleTaskingOverlay(); // on
    assert(r1 === true && mod.isTaskingOverlayVisible() === true, 'T2D-42', 'toggleTaskingOverlay returns match isTaskingOverlayVisible (on)');
    const r2 = mod.toggleTaskingOverlay(); // off
    assert(r2 === false && mod.isTaskingOverlayVisible() === false, 'T2D-43', 'toggleTaskingOverlay return matches isTaskingOverlayVisible (off)');
}

// ═════════════════════════════════════════════════════════════════════════════
// Group I — Item 9: Existing toggle API unchanged
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nI: Existing overlay toggle API unchanged (Item 9)');
{
    const existingApi = [
        'renderCoverageRings', 'clearCoverageRings', 'setCoverageRings', 'toggleCoverageRings', 'isCoverageRingsVisible',
        'renderDetectionContacts', 'clearDetectionContacts', 'setDetectionContacts', 'toggleDetectionContacts', 'isDetectionContactsVisible',
        'renderEngagements', 'clearEngagements', 'setEngagements', 'toggleEngagements', 'isEngagementsVisible',
    ];
    for (const fn of existingApi) {
        assert(MAP_SRC.includes(fn + ':') || MAP_SRC.includes('function ' + fn),
            'T2D-44-' + fn, `Existing toggle function '${fn}' still present in adjudicator-map.js`);
    }

    // The 4 panes are all created in ensureScenarioGraphicsPane
    const egpStart = MAP_SRC.indexOf('function ensureScenarioGraphicsPane');
    const egpEnd   = MAP_SRC.indexOf('function drawScenario');
    const egpBlock = egpStart !== -1 && egpEnd !== -1 ? MAP_SRC.slice(egpStart, egpEnd) : '';
    assert(egpBlock.includes('COVERAGE_RINGS_PANE'),   'T2D-45', 'ensureScenarioGraphicsPane still creates COVERAGE_RINGS_PANE');
    assert(egpBlock.includes('CONTACTS_PANE'),          'T2D-46', 'ensureScenarioGraphicsPane still creates CONTACTS_PANE');
    assert(egpBlock.includes('ENGAGEMENTS_PANE'),       'T2D-47', 'ensureScenarioGraphicsPane still creates ENGAGEMENTS_PANE');
    assert(egpBlock.includes('TASKING_OVERLAY_PANE'),   'T2D-48', 'ensureScenarioGraphicsPane creates new TASKING_OVERLAY_PANE');

    // Pane zIndex values unchanged for existing three panes
    const p415 = egpBlock.match(/COVERAGE_RINGS_PANE[\s\S]{0,200}?zIndex\s*=\s*'(\d+)'/);
    const p430 = egpBlock.match(/CONTACTS_PANE[\s\S]{0,200}?zIndex\s*=\s*'(\d+)'/);
    const p425 = egpBlock.match(/ENGAGEMENTS_PANE[\s\S]{0,200}?zIndex\s*=\s*'(\d+)'/);
    const p435 = egpBlock.match(/TASKING_OVERLAY_PANE[\s\S]{0,200}?zIndex\s*=\s*'(\d+)'/);
    assert(p415 && p415[1] === '415', 'T2D-49', 'COVERAGE_RINGS_PANE zIndex still 415');
    assert(p430 && p430[1] === '430', 'T2D-50', 'CONTACTS_PANE zIndex still 430');
    assert(p425 && p425[1] === '425', 'T2D-51', 'ENGAGEMENTS_PANE zIndex still 425');
    assert(p435 && p435[1] === '435', 'T2D-52', 'TASKING_OVERLAY_PANE zIndex is 435 (above contacts, below graphics)');

    // HUD: existing three toggle buttons still present
    assert(HUD_SRC.includes("'#wg-adj-rings-btn'"),    'T2D-53', 'HUD: wg-adj-rings-btn still present');
    assert(HUD_SRC.includes("'#wg-adj-contacts-btn'"), 'T2D-54', 'HUD: wg-adj-contacts-btn still present');
    assert(HUD_SRC.includes("'#wg-adj-eng-btn'"),      'T2D-55', 'HUD: wg-adj-eng-btn still present');
}

// ═════════════════════════════════════════════════════════════════════════════
// Group J — Item 10: wargame 6 backup untouched
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nJ: wargame 6 backup untouched (Item 10)');
{
    assert(BACKUP_SRC !== null, 'T2D-56', 'wargame 6/adjudicator-map.js backup file exists');

    if (BACKUP_SRC) {
        // TASK2-B markers must NOT be in the backup
        assert(!BACKUP_SRC.includes('_refreshTaskingTooltips'), 'T2D-57',
            'Backup does not contain _refreshTaskingTooltips (TASK2-B)');
        assert(!BACKUP_SRC.includes('_applyTaskingToMarkerMap'), 'T2D-58',
            'Backup does not contain _applyTaskingToMarkerMap (TASK2-B)');
        assert(!BACKUP_SRC.includes('m._baseTooltip = _redTT'), 'T2D-59',
            'Backup does not contain _baseTooltip assignment from TASK2-B draw loop');

        // TASK2-C markers must NOT be in the backup
        assert(!BACKUP_SRC.includes('taskingOverlayMarkers'), 'T2D-60',
            'Backup does not contain taskingOverlayMarkers (TASK2-C)');
        assert(!BACKUP_SRC.includes('renderTaskingOverlay'), 'T2D-61',
            'Backup does not contain renderTaskingOverlay (TASK2-C)');
        assert(!BACKUP_SRC.includes('TASKING_OVERLAY_PANE'), 'T2D-62',
            'Backup does not contain TASKING_OVERLAY_PANE constant (TASK2-C)');

        // Backup has the original drawScenario / applyState / clearScenario functions
        assert(BACKUP_SRC.includes('function drawScenario') || BACKUP_SRC.includes('drawScenario,'), 'T2D-63',
            'Backup still has drawScenario (structural sanity)');
        assert(BACKUP_SRC.includes('AppAdjudicatorMap'), 'T2D-64',
            'Backup still exposes AppAdjudicatorMap (structural sanity)');
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Group K — Item 11: No mutation / apply / execute in map tasking paths
// ═════════════════════════════════════════════════════════════════════════════
console.log('\nK: No mutation / apply / execute (Item 11)');
{
    // Extract both tasking function blocks from production source
    const rtStart  = MAP_SRC.indexOf('function renderTaskingOverlay');
    const rtEnd    = MAP_SRC.indexOf('// TASK2B: Read-only tasking evidence');
    const rtBlock  = rtStart !== -1 && rtEnd !== -1 ? MAP_SRC.slice(rtStart, rtEnd) : '';

    const rfStart  = MAP_SRC.indexOf('function _refreshTaskingTooltips');
    const rfEnd    = MAP_SRC.indexOf('function clearScenario');
    const rfBlock  = rfStart !== -1 && rfEnd !== -1 ? MAP_SRC.slice(rfStart, rfEnd) : '';

    const FORBIDDEN = [
        { pattern: 'fetch(',         label: 'fetch()' },
        { pattern: 'XMLHttpRequest', label: 'XMLHttpRequest' },
        { pattern: 'localStorage',   label: 'localStorage' },
        { pattern: 'sessionStorage', label: 'sessionStorage' },
        { pattern: '/api/',          label: '/api/ endpoint' },
        { pattern: 'sim/commit',     label: 'sim/commit' },
        { pattern: 'sim/execute',    label: 'sim/execute' },
        { pattern: 'applyDecision',  label: 'applyDecision' },
        { pattern: 'stepIndex =',    label: 'stepIndex mutation' },
        { pattern: 'window.units',   label: 'window.units mutation' },
        { pattern: 'scenarioRef.steps', label: 'scenarioRef.steps mutation' },
    ];

    for (const { pattern, label } of FORBIDDEN) {
        assert(!rtBlock.includes(pattern), 'T2D-65-' + label.replace(/[^a-z0-9]/gi,'_').slice(0,20),
            'renderTaskingOverlay: no ' + label);
        assert(!rfBlock.includes(pattern), 'T2D-66-' + label.replace(/[^a-z0-9]/gi,'_').slice(0,20),
            '_refreshTaskingTooltips+_apply…: no ' + label);
    }

    // HUD orders listener also forbidden
    const hudOrdStart = HUD_SRC.indexOf("querySelector('#wg-adj-orders-btn')");
    const hudOrdBlock = hudOrdStart !== -1 ? HUD_SRC.slice(hudOrdStart, hudOrdStart + 400) : '';
    const HUD_FORBIDDEN = ['fetch(', 'XMLHttpRequest', '/api/', 'sim/commit', 'applyDecision', 'stepIndex ='];
    for (const p of HUD_FORBIDDEN) {
        assert(!hudOrdBlock.includes(p), 'T2D-67-' + p.replace(/[^a-z0-9]/gi,'_').slice(0,15),
            'HUD orders listener: no ' + p);
    }

    // Overlay is interactive: false (never intercepts clicks — cannot trigger actions)
    // Check both properties separately to avoid CRLF sensitivity
    assert(rtBlock.includes('interactive: false') && rtBlock.includes('pane: TASKING_OVERLAY_PANE'), 'T2D-68',
        'Tasking overlay circleMarker has interactive:false and is placed in TASKING_OVERLAY_PANE');

    // clearTaskingOverlay only calls removeLayer — no scenario mutation
    const ctStart = MAP_SRC.indexOf('function clearTaskingOverlay');
    const ctEnd   = MAP_SRC.indexOf('function renderTaskingOverlay');
    const ctBlock = ctStart !== -1 && ctEnd !== -1 ? MAP_SRC.slice(ctStart, ctEnd) : '';
    assert(ctBlock.includes('removeLayer') && !ctBlock.includes('fetch(') && !ctBlock.includes('/api/'),
        'T2D-69', 'clearTaskingOverlay: only removes layers, no side-effects');
}

// ═════════════════════════════════════════════════════════════════════════════
// Summary
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n─────────────────────────────────────────────────────────────');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed === 0) {
    console.log('ALL PASS ✓');
} else {
    process.exitCode = 1;
}
