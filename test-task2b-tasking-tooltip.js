/**
 * test-task2b-tasking-tooltip.js
 *
 * TASK2B: Read-only tasking evidence in map marker tooltips.
 * Verifies that _refreshTaskingTooltips() correctly enriches/restores
 * scenario marker tooltips from ws.derived.unit_tasking without mutating
 * any simulation or marker state.
 *
 * Static: no server, no Leaflet, no DOM required.
 * Run: node test-task2b-tasking-tooltip.js
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

// ── Minimal stubs ────────────────────────────────────────────────────────────

// esc() — mirrors the implementation in adjudicator-map.js
function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Minimal Leaflet marker stub that tracks tooltip binding
function makeMarker(uid, baseTooltip) {
    let _tooltipContent = baseTooltip;
    const m = {
        _unitId: uid,
        _baseTooltip: baseTooltip,
        _unitData: { id: uid, name: 'Unit-' + uid, role: 'infantry' },
        _boundCount: 0,
        _unbound: false,
        _lastTooltip: baseTooltip,
        unbindTooltip() {
            this._unbound = true;
            return this;
        },
        bindTooltip(html, _opts) {
            this._lastTooltip = html;
            this._boundCount++;
            this._unbound = false;
            return this;
        },
    };
    return m;
}

// ── Inline port of _refreshTaskingTooltips / _applyTaskingToMarkerMap ────────
// Mirrors the production code so we can test without loading the full 6k-line file.

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

function _refreshTaskingTooltips(lastWorldState, redMarkers, blueMarkers) {
    if (!lastWorldState || !lastWorldState.derived) return;
    const tasking = lastWorldState.derived.unit_tasking || {};
    _applyTaskingToMarkerMap(redMarkers, tasking);
    _applyTaskingToMarkerMap(blueMarkers, tasking);
}

// ── Tests ────────────────────────────────────────────────────────────────────

console.log('\nTASK2B — Tasking Tooltip Enrichment\n');

// ── Group A: Basic enrichment ────────────────────────────────────────────────
console.log('A: Basic enrichment');

{
    const red = { 'RED_001': makeMarker('RED_001', 'Alpha — infantry — STAGED<div>note</div>') };
    const blue = {};
    const ws = {
        derived: {
            unit_tasking: {
                'RED_001': {
                    uid: 'RED_001',
                    side: 'RED',
                    component_label: 'Land Maneuver',
                    action_what: 'Seize Objective NASSER',
                    action_why: 'Secure the pipeline terminal',
                    action_intended_effect: 'Neutralize defensive positions',
                    action_doctrine_cited: ['FM 3-90'],
                    step_index: 2,
                },
            },
        },
    };
    _refreshTaskingTooltips(ws, red, blue);

    assert(red['RED_001']._lastTooltip.includes('Land Maneuver'), 'TASK2B-01', 'Red marker with tasking includes component_label');
    assert(red['RED_001']._lastTooltip.includes('Seize Objective NASSER'), 'TASK2B-02a', 'Red marker tooltip includes action_what');
    assert(red['RED_001']._lastTooltip.startsWith('Alpha'), 'TASK2B-02b', 'Red marker tooltip starts with base content');
    assert(red['RED_001']._lastTooltip.includes('Orders:'), 'TASK2B-02c', 'Red marker tooltip includes Orders label');
    assert(red['RED_001']._lastTooltip.includes('Mission:'), 'TASK2B-02d', 'Red marker tooltip includes Mission label');
}

{
    const red = {};
    const blue = { 'BLUE_lc': makeMarker('BLUE_lc', 'BLUE_lc (TF) — ACTIVE<div>offset note</div>') };
    const ws = {
        derived: {
            unit_tasking: {
                'BLUE_lc': {
                    uid: 'BLUE_lc',
                    side: 'BLUE',
                    component_label: 'Amphibious Assault',
                    action_what: 'Establish beachhead at LIMA',
                    step_index: 1,
                },
            },
        },
    };
    _refreshTaskingTooltips(ws, red, blue);

    assert(blue['BLUE_lc']._lastTooltip.includes('Amphibious Assault'), 'TASK2B-03', 'Blue marker with tasking includes component_label');
    assert(blue['BLUE_lc']._lastTooltip.includes('Establish beachhead at LIMA'), 'TASK2B-04', 'Blue marker tooltip includes action_what');
}

// ── Group B: Units without tasking ───────────────────────────────────────────
console.log('\nB: Units without tasking');

{
    const BASE = 'Delta — logistics — STAGED<div>note</div>';
    const red = { 'RED_LOG': makeMarker('RED_LOG', BASE) };
    const blue = {};
    const ws = {
        derived: {
            unit_tasking: {}, // RED_LOG has no tasking
        },
    };
    _refreshTaskingTooltips(ws, red, blue);

    assert(red['RED_LOG']._lastTooltip === BASE, 'TASK2B-05', 'Marker without tasking retains original tooltip verbatim');
    assert(!red['RED_LOG']._lastTooltip.includes('Orders:'), 'TASK2B-05b', 'No Orders label when no tasking');
}

// ── Group C: Idempotency ─────────────────────────────────────────────────────
console.log('\nC: Idempotency');

{
    const red = { 'RED_002': makeMarker('RED_002', 'Bravo — armor — STAGED<div>note</div>') };
    const blue = {};
    const ws = {
        derived: {
            unit_tasking: {
                'RED_002': {
                    uid: 'RED_002',
                    component_label: 'Armored Assault',
                    action_what: 'Break through Red line',
                },
            },
        },
    };
    _refreshTaskingTooltips(ws, red, blue);
    const afterFirst = red['RED_002']._lastTooltip;
    _refreshTaskingTooltips(ws, red, blue);
    const afterSecond = red['RED_002']._lastTooltip;

    assert(afterFirst === afterSecond, 'TASK2B-06', 'Calling refresh twice is idempotent — same tooltip HTML');
    const count = (afterSecond.match(/Orders:/g) || []).length;
    assert(count === 1, 'TASK2B-06b', 'Only one Orders line after double refresh (no duplication)');
}

// ── Group D: Guard conditions ─────────────────────────────────────────────────
console.log('\nD: Guard conditions');

{
    let threw = false;
    try { _refreshTaskingTooltips(null, {}, {}); } catch (_) { threw = true; }
    assert(!threw, 'TASK2B-07', 'lastWorldState null — returns without throwing');
}

{
    let threw = false;
    try { _refreshTaskingTooltips({}, {}, {}); } catch (_) { threw = true; }
    assert(!threw, 'TASK2B-08', 'lastWorldState without .derived — returns without throwing');
}

{
    let threw = false;
    try { _refreshTaskingTooltips({ derived: {} }, {}, {}); } catch (_) { threw = true; }
    assert(!threw, 'TASK2B-09', 'missing unit_tasking entirely — no throw (defaults to {})');
}

{
    // Marker without _baseTooltip — should skip gracefully
    const red = { 'RED_X': { _unitId: 'RED_X', _baseTooltip: null, unbindTooltip() { return this; }, bindTooltip() { return this; } } };
    let threw = false;
    try {
        _refreshTaskingTooltips(
            { derived: { unit_tasking: { 'RED_X': { component_label: 'Test', action_what: 'Go' } } } },
            red, {}
        );
    } catch (_) { threw = true; }
    assert(!threw, 'TASK2B-10', 'Marker without _baseTooltip skipped gracefully');
}

// ── Group E: No hardcoding — data-driven rendering ───────────────────────────
console.log('\nE: Data-driven (no hardcoded operational strings)');

{
    const CUSTOM_LABEL = 'CustomTestOperation_XR-77';
    const CUSTOM_WHAT  = 'Execute Zebra Phase Three';
    const red = { 'RED_T': makeMarker('RED_T', 'Test base<div>note</div>') };
    const blue = {};
    const ws = {
        derived: {
            unit_tasking: {
                'RED_T': {
                    uid: 'RED_T',
                    component_label: CUSTOM_LABEL,
                    action_what: CUSTOM_WHAT,
                },
            },
        },
    };
    _refreshTaskingTooltips(ws, red, blue);

    assert(red['RED_T']._lastTooltip.includes(CUSTOM_LABEL), 'TASK2B-11', 'Custom component_label renders verbatim');
    assert(red['RED_T']._lastTooltip.includes(CUSTOM_WHAT), 'TASK2B-12', 'Custom action_what renders verbatim');
}

{
    // action_component fallback when component_label absent
    const red = { 'RED_U': makeMarker('RED_U', 'Gamma — artillery — STAGED<div>note</div>') };
    const ws = {
        derived: {
            unit_tasking: {
                'RED_U': {
                    uid: 'RED_U',
                    action_component: 'fires',  // no component_label
                    action_what: 'Suppress grid 42RTQ',
                },
            },
        },
    };
    _refreshTaskingTooltips(ws, red, {});

    assert(red['RED_U']._lastTooltip.includes('fires'), 'TASK2B-13', 'Falls back to action_component when component_label absent');
    assert(red['RED_U']._lastTooltip.includes('Suppress grid 42RTQ'), 'TASK2B-14', 'action_what still appears in fallback path');
}

// ── Group F: No marker._unitData mutation ────────────────────────────────────
console.log('\nF: Immutability');

{
    const ORIG_NAME = 'OriginalName';
    const ORIG_ROLE = 'original_role';
    const red = { 'RED_V': makeMarker('RED_V', 'base<div>n</div>') };
    red['RED_V']._unitData = { id: 'RED_V', name: ORIG_NAME, role: ORIG_ROLE };
    const ws = {
        derived: {
            unit_tasking: {
                'RED_V': { uid: 'RED_V', component_label: 'Electronic Warfare', action_what: 'Jam Blue comms' },
            },
        },
    };
    _refreshTaskingTooltips(ws, red, {});

    assert(red['RED_V']._unitData.name === ORIG_NAME, 'TASK2B-15', 'marker._unitData.name unchanged after refresh');
    assert(red['RED_V']._unitData.role === ORIG_ROLE, 'TASK2B-16', 'marker._unitData.role unchanged after refresh');
}

// ── Group G: HTML escaping ────────────────────────────────────────────────────
console.log('\nG: HTML escaping');

{
    const red = { 'RED_W': makeMarker('RED_W', 'base<div>n</div>') };
    const ws = {
        derived: {
            unit_tasking: {
                'RED_W': {
                    uid: 'RED_W',
                    component_label: '<script>alert("xss")</script>',
                    action_what: '"Quoted" & <tagged>',
                },
            },
        },
    };
    _refreshTaskingTooltips(ws, red, {});
    const tt = red['RED_W']._lastTooltip;

    assert(!tt.includes('<script>'), 'TASK2B-17', 'XSS script tag is escaped in component_label');
    assert(tt.includes('&lt;script&gt;'), 'TASK2B-17b', 'component_label angle brackets escaped to &lt; &gt;');
    assert(tt.includes('&quot;Quoted&quot;'), 'TASK2B-18', 'Quotes in action_what escaped to &quot;');
    assert(tt.includes('&amp;'), 'TASK2B-19', 'Ampersand in action_what escaped to &amp;');
}

// ── Group H: Step transition ──────────────────────────────────────────────────
console.log('\nH: Step transition (tasking appears then disappears)');

{
    const BASE = 'Echo — recon — STAGED<div>note</div>';
    const red = { 'RED_R': makeMarker('RED_R', BASE) };

    // Step 1: unit has tasking
    const ws1 = {
        derived: {
            unit_tasking: {
                'RED_R': { uid: 'RED_R', component_label: 'Reconnaissance', action_what: 'Screen eastern flank' },
            },
        },
    };
    _refreshTaskingTooltips(ws1, red, {});
    assert(red['RED_R']._lastTooltip.includes('Reconnaissance'), 'TASK2B-20', 'Step 1: tasking appears');

    // Step 2: unit loses tasking
    const ws2 = { derived: { unit_tasking: {} } };
    _refreshTaskingTooltips(ws2, red, {});
    assert(red['RED_R']._lastTooltip === BASE, 'TASK2B-21', 'Step 2: tasking removed, tooltip restored to base');
}

// ── Group I: Production code no-hardcode check ───────────────────────────────
console.log('\nI: No hardcoded operational strings in production path');

{
    const fs = require('fs');
    const src = fs.readFileSync(
        require('path').join(__dirname, 'UI_MOdified/client/wargame/adjudicator-map.js'),
        'utf8'
    );
    // Find the _refreshTaskingTooltips / _applyTaskingToMarkerMap block
    const blockStart = src.indexOf('function _refreshTaskingTooltips');
    const blockEnd   = src.indexOf('function clearScenario');
    assert(blockStart !== -1, 'TASK2B-22', '_refreshTaskingTooltips function exists in production file');
    const block = blockStart !== -1 && blockEnd !== -1 ? src.slice(blockStart, blockEnd) : '';

    // Must not contain hardcoded example operational values
    const badStrings = [
        'Land Maneuver', 'Armored Assault', 'Seize Objective',
        'Establish beachhead', 'Electronic Warfare', 'Reconnaissance',
    ];
    let anyHardcoded = false;
    for (const s of badStrings) {
        if (block.includes(s)) { anyHardcoded = true; console.error('    Found hardcoded: ' + s); }
    }
    assert(!anyHardcoded, 'TASK2B-23', 'No hardcoded operational strings in _refreshTaskingTooltips block');

    // Verify the call site exists after applyW3UnitNarrative with a w3-rich guard
    assert(src.includes('_refreshTaskingTooltips();'), 'TASK2B-24', '_refreshTaskingTooltips() call exists in production file');
    assert(src.includes("schema_variant !== 'w3-rich'"), 'TASK2B-24b', 'w3-rich guard present — prevents overwriting applyW3UnitNarrative output');
    // Verify applyW3UnitNarrative uses component_label from world state
    assert(src.includes('_wsT[uid].component_label') || src.includes('unit_tasking[uid].component_label'), 'TASK2B-24c', 'applyW3UnitNarrative tooltipFor reads component_label from world state');

    // Verify _baseTooltip is assigned for red markers
    assert(src.includes('m._baseTooltip = _redTT'), 'TASK2B-25', '_baseTooltip stored on red markers');

    // Verify _baseTooltip is assigned for blue markers
    assert(src.includes('m._baseTooltip = _blueTT'), 'TASK2B-26', '_baseTooltip stored on blue markers');
}

// ── Summary ──────────────────────────────────────────────────────────────────

console.log('\n─────────────────────────────────');
console.log('Results: ' + passed + ' passed, ' + failed + ' failed');
if (failed === 0) {
    console.log('ALL PASS ✓');
} else {
    process.exitCode = 1;
}
