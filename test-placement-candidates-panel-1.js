/* test-placement-candidates-panel-1.js — DOC-UNDERSTANDING-1 / G-3C static checks.
 * Read-only Location Placement Candidates panel: render output + hasCandidates.
 * No server, no real DOM — a global.window stub + a fake mount element.
 * Mirrors the browser acceptance criteria (Bandar Abbas / Chah Bahar candidates,
 * known_base, exact_unit_position=false, needs_review, base-known warning).
 * The panel is a READ-ONLY surface: it surfaces honesty fields and emits NO
 * action buttons — Accept/Reject/Mark-approximate live behind a future commit
 * path, not in this read-only mirror.
 */
'use strict';
var path = require('path');

// The panel is an IIFE that assigns window.RmoozPlacementPanel — load it
// against a window stub so we can exercise it headless.
global.window = {};
require(path.join(__dirname, 'UI_MOdified/client/shell/placement-candidates-panel.js'));
var Panel = global.window.RmoozPlacementPanel;

var passed = 0, failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  ✓ ' + label); }
    else { failed++; console.log('  ✗ ' + label); }
}

console.log('G-3C — Location Placement Candidates panel (read-only render)');

ok('exposes RmoozPlacementPanel { hasCandidates, render }',
   Panel && typeof Panel.hasCandidates === 'function' && typeof Panel.render === 'function');

var bandar = {
    mention: 'Bandar Abbas base', normalized_name: 'Bandar Abbas',
    placement_type: 'known_base', needs_review: true,
    lat: 27.19611, lon: 56.28778, coordinate_format: 'decimal',
    ao_check: 'inside', confidence: 'high', location_id: 'BANDAR_ABBAS',
    exact_unit_position: false, source: { type: 'location_db' },
    warnings: ['base_known_exact_unit_position_unknown'],
};
var chabahar = {
    mention: 'Chah Bahar base', normalized_name: 'Chabahar',
    placement_type: 'known_base', needs_review: true,
    lat: 25.29278, lon: 60.64972, coordinate_format: 'decimal',
    ao_check: 'outside_warn', confidence: 'medium', location_id: 'CHABAHAR',
    exact_unit_position: false, source: { type: 'location_db' },
    warnings: ['base_known_exact_unit_position_unknown', 'outside_ao'],
};
var payload = { brief: {}, placement: { placement_candidates: [bandar, chabahar], missing_information: [], conflicts: [] } };

ok('hasCandidates true when placement_candidates present', Panel.hasCandidates(payload) === true);
ok('hasCandidates false for empty payload', Panel.hasCandidates({}) === false);
ok('hasCandidates false when list empty', Panel.hasCandidates({ placement: { placement_candidates: [] } }) === false);

var mount = { innerHTML: '' };
Panel.render(mount, payload);
var html = mount.innerHTML;

ok('renders the section header (Location Placement Candidates)', /Location Placement Candidates/.test(html));
ok('renders the Bandar Abbas candidate', /Bandar Abbas/.test(html));
ok('renders the Chah Bahar candidate', /Chah Bahar/.test(html));
ok('labels the known_base placement type', /Known base/.test(html));
ok('shows a needs-review badge', /needs review/.test(html));
ok('states exact unit position: no (never final placement)', /exact unit position:\s*<b[^>]*>no<\/b>/.test(html));
ok('surfaces the base-known / exact-unknown warning', /base known/.test(html) && /exact unit position unknown/.test(html));
ok('surfaces the outside-AO warning for Chah Bahar', /outside area of operation/.test(html));
ok('shows base coordinates', /27\.19611/.test(html) && /56\.28778/.test(html));

// Read-only surface invariant: no action buttons emitted from this mirror.
ok('READ-ONLY: emits no action buttons / data-act', html.indexOf('<button') === -1 && html.indexOf('data-act') === -1);

// Empty render clears the mount (no stray markup left behind).
var m2 = { innerHTML: 'STALE' };
Panel.render(m2, { placement: { placement_candidates: [] } });
ok('empty candidates → mount cleared', m2.innerHTML === '');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
