#!/usr/bin/env node
/*
 * RMOOZ-DOC-REVIEW-PERSISTENCE-AND-DEMO-CLEANUP-A — Part A (no stacked overlays)
 *
 * The two preview overlays — legacy Demo Movement (RmoozDemoMovement) and the
 * Free Fight preview (RmoozFreeFightDemo) — must never stack. Mounting either one
 * clears the other first, so only ONE demo overlay's groups exist at a time.
 *
 * Headless: no Leaflet, no DOM render (mapReady()=false, no document). We assert on
 * the state each module exposes (getGroups), which is enough to prove the cross-clear.
 */
'use strict';

var path = require('path');

global.window = {};           // modules attach window.Rmooz* and read each other via W()
global.window.document = undefined;   // force renderAiPanel/marker paths to no-op

var SHELL = path.join(__dirname, 'UI_MOdified/client/shell');
require(path.join(SHELL, 'symbol-registry.js'));   // glyphs (optional dep)
require(path.join(SHELL, 'domain-movement.js'));   // route domains (free-fight dep)
require(path.join(SHELL, 'free-fight-ai.js'));     // planner (free-fight dep)
require(path.join(SHELL, 'demo-units.js'));        // proposed_units -> demo_units
require(path.join(SHELL, 'demo-movement.js'));     // legacy preview
require(path.join(SHELL, 'free-fight-demo.js'));   // free fight preview

var Demo = global.window.RmoozDemoMovement;
var FF = global.window.RmoozFreeFightDemo;

var passed = 0, failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  [PASS] ' + label); }
    else { failed++; console.log('  [FAIL] ' + label); }
}
function len(api) { try { return (api.getGroups() || []).length; } catch (_) { return -1; } }

console.log('DEMO-OVERLAY-NO-STACK-A — Free Fight and legacy Demo preview never stack');

ok('both overlay modules expose mount + clear',
    Demo && typeof Demo.mount === 'function' && typeof Demo.clear === 'function' &&
    FF && typeof FF.mount === 'function' && typeof FF.clear === 'function');

// A coalition-ish payload: RED + BLUE base anchors with coords + proposed_units
// assigned to them. Enough for both modules to build movement groups.
var payload = {
    documents: [{ filename: 'iran_qatar_step1.json' }],
    brief: { operational_brief: {
        placement_candidates: [
            { base_id: 'R1', id: 'R1', side: 'RED', base_name_en: 'Red Air Base', site_type: 'air_base', lat: 33.6, lon: 44.4 },
            { base_id: 'R2', id: 'R2', side: 'RED', base_name_en: 'Red Naval Base', site_type: 'naval_base', lat: 27.2, lon: 56.3 },
            { base_id: 'B1', id: 'B1', side: 'BLUE', base_name_en: 'Blue Base One', site_type: 'air_base', lat: 25.3, lon: 51.5 },
            { base_id: 'B2', id: 'B2', side: 'BLUE', base_name_en: 'Blue Base Two', site_type: 'ground_base', lat: 24.4, lon: 54.4 },
            { base_id: 'B3', id: 'B3', side: 'BLUE', base_name_en: 'Blue Base Three', site_type: 'air_base', lat: 26.2, lon: 50.6 },
        ],
        proposed_units: [
            { side: 'RED', assigned_base_id: 'R1', base_name_en: 'Red Air Base', platform: 'F-4E', estimated_count: 6, symbol_category: 'air_fighter' },
            { side: 'RED', assigned_base_id: 'R2', base_name_en: 'Red Naval Base', platform: 'P-3F', estimated_count: 2, symbol_category: 'naval' },
            { side: 'BLUE', assigned_base_id: 'B1', base_name_en: 'Blue Base One', platform: 'F-16', estimated_count: 8, symbol_category: 'air_fighter' },
            { side: 'BLUE', assigned_base_id: 'B2', base_name_en: 'Blue Base Two', platform: 'M1A2', estimated_count: 10, symbol_category: 'ground_armor' },
            { side: 'BLUE', assigned_base_id: 'B3', base_name_en: 'Blue Base Three', platform: 'AH-64', estimated_count: 4, symbol_category: 'helicopter' },
        ],
    } },
};
var objective = { lat: 29.0, lon: 50.5 };   // somewhere central — gives Free Fight its targets

// 1) Mount Free Fight first → it has groups, legacy Demo has none.
FF.mount(payload, { objective: objective });
ok('Free Fight builds preview groups when mounted', len(FF) > 0);
ok('legacy Demo has no groups yet', len(Demo) === 0);

// 2) Mount legacy Demo → its mount() must CLEAR Free Fight (no stacking).
Demo.mount(payload);
ok('mounting legacy Demo builds its groups', len(Demo) > 0);
ok('mounting legacy Demo CLEARED the Free Fight overlay (no stack)', len(FF) === 0);

// 3) Mount Free Fight again → its mount() must CLEAR legacy Demo.
FF.mount(payload, { objective: objective });
ok('re-mounting Free Fight builds its groups again', len(FF) > 0);
ok('re-mounting Free Fight CLEARED the legacy Demo overlay (no stack)', len(Demo) === 0);

// 4) Invariant: at no point do BOTH overlays hold groups simultaneously.
ok('only one overlay holds groups at a time (final state)',
    !(len(FF) > 0 && len(Demo) > 0));

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
