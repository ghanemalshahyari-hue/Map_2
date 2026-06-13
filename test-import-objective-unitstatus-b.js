#!/usr/bin/env node
/*
 * RMOOZ-IMPORT-OBJECTIVE-UNITSTATUS-FIX-B
 *
 * Section 1 (D) — unit-status displayUnitName(): the selected-unit name resolves
 *   from whatever identity field a marker carries (name / name_ar / unit_uid /
 *   base_id), not only `label`. Functional — loads the real module via a DOM stub.
 * Section 2 (A/B) — wizard source assertions: Review gating requires Red+Blue for
 *   DOCX (MDMP-only excepted), the explanatory text is present, Objective X sync
 *   helpers exist, and Generate reads the Scenario Setup objective inputs.
 * Section 3 (C) — brief-to-scenario places draft RED/BLUE at reviewed anchors with
 *   the right provenance, and falls back to template geometry only when no anchor.
 */
'use strict';

var path = require('path');
var fs = require('fs');

var passed = 0, failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  [PASS] ' + label); }
    else { failed++; console.log('  [FAIL] ' + label); }
}

console.log('IMPORT-OBJECTIVE-UNITSTATUS-B');

// ── Section 1 (D): displayUnitName — functional, via real module + DOM stub ──
(function () {
    var listeners = {};
    global.window = {};
    global.document = {
        readyState: 'complete',
        getElementById: function () { return null; },
        querySelector: function () { return null; },
        querySelectorAll: function () { return []; },
        addEventListener: function (n, fn) { listeners[n] = fn; },
        createElement: function () { return { style: {}, classList: { add: function () {}, remove: function () {}, toggle: function () {} }, setAttribute: function () {}, appendChild: function () {}, addEventListener: function () {} }; },
    };
    global.window.document = global.document;
    require(path.join(__dirname, 'UI_MOdified/client/shell/unit-status-panel.js'));
    var P = global.window.AppUnitStatusPanel;
    var dn = P && P.displayUnitName;
    ok('unit-status exposes displayUnitName', typeof dn === 'function');
    ok('only label → label', dn({ label: 'Alpha Coy' }) === 'Alpha Coy');
    ok('only name → name', dn({ name: 'Bravo' }) === 'Bravo');
    ok('only name_ar → name_ar', dn({ name_ar: 'كتيبة المدرعات' }) === 'كتيبة المدرعات');
    ok('only unit_uid → unit_uid', dn({ unit_uid: 'BLUE_lc' }) === 'BLUE_lc');
    ok('only base_id → base_id', dn({ base_id: 'b7' }) === 'b7');
    ok('only uid → uid', dn({ uid: 'R-001' }) === 'R-001');
    ok('label wins over name (precedence)', dn({ label: 'L', name: 'N' }) === 'L');
    ok('name wins over unit_uid', dn({ name: 'N', unit_uid: 'U' }) === 'N');
    ok('empty unit → em dash', dn({}) === '—');
    ok('null unit → em dash', dn(null) === '—');
    // cleanup globals so they don't leak into other sections
    try { delete global.window; delete global.document; } catch (_) {}
})();

// ── Section 2 (A/B): wizard source assertions ──
(function () {
    var src = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/shell/scenario-import-wizard.js'), 'utf8');
    // (A) gating: DOCX needs both red+blue; MDMP-only is the single-input exception
    ok('gating defines docxReady = red && blue', /var docxReady = !!\(st\.red && st\.blue\)/.test(src));
    ok('gating defines mdmpOnly from staged MDMP', /var mdmpOnly = !!\(st\.mdmpFiles && st\.mdmpFiles\.length\)/.test(src));
    ok('analyze disabled unless mdmpOnly OR docxReady', /el\.analyze\.disabled = st\.running \|\| !\(mdmpOnly \|\| docxReady\)/.test(src));
    ok('OLD permissive gate (red OR blue OR mdmp) removed', !/disabled = !\(st\.red \|\| st\.blue \|\| \(st\.mdmpFiles/.test(src));
    // (A) explanatory UI text
    ok('UI text: DOCX review uses Red + Blue', /DOCX review uses staged <b>Red \+ Blue<\/b> documents/.test(src));
    ok('UI text: MDMP JSON review can run separately', /<b>MDMP JSON<\/b> review can run separately/.test(src));
    ok('dynamic one-DOCX hint present', /DOCX review needs <b>both<\/b> Red \+ Blue staged/.test(src));
    // (B) objective sync
    ok('objective source indicator element', /id="wg-wz-obj-source"/.test(src));
    ok('setObjectiveSourceLabel labels default vs override', /function setObjectiveSourceLabel/.test(src) && /operator override/.test(src) && /server default/.test(src));
    ok('syncObjectiveToConsumers pushes to Free Fight + event', /function syncObjectiveToConsumers/.test(src) && /__rmoozFreeFightObjective/.test(src) && /RmoozFreeFightDemo/.test(src) && /rmooz:objective-x-changed/.test(src));
    ok('loadObjective calls the sync helpers', /setObjectiveSourceLabel\(effSource/.test(src) && /syncObjectiveToConsumers\(effLon/.test(src));
    // (B) Generate uses the same Scenario Setup objective inputs
    ok('generateFromReviewedBrief reads el.objLon/objLat', /function generateFromReviewedBrief[\s\S]{0,200}el\.objLon[\s\S]{0,120}el\.objLat/.test(src));
})();

// ── Section 3 (C): brief-to-scenario anchor placement + provenance ──
(function () {
    var gen = require(path.join(__dirname, 'UI_MOdified/server/ai/brief-to-scenario.js'));
    function near(a, b) { return Math.abs(Number(a) - Number(b)) <= 0.06; }
    var brief = {
        understanding: { proposed_unit_counts: { red: 3, blue: 2 } },
        operational_brief: {
            mission: 'Seize and hold.',
            placement_candidates: [
                { side: 'RED', base_name_en: 'Red Air Base', lat: 33.40, lon: 44.10 },
                { side: 'RED', base_name_en: 'Red Naval Base', lat: 33.30, lon: 44.30 },
                // NOTE: no BLUE anchors → BLUE must fall back to template geometry
            ],
            proposed_units: [
                { side: 'RED', base_name_en: 'Red Air Base', platform: 'T-72' },
                { side: 'BLUE', base_name_en: 'Blue', platform: 'M1A2' },
            ],
        },
    };
    var out = gen.generateScenarioFromBrief(brief, { objective: { lon: 50.0, lat: 20.0 }, name: 'fixb_anchor' });
    var s = out && out.scenario;
    ok('generation returns a scenario', !!s && !out.requiresObjective);
    var red = (s && s.red_units) || [], blue = (s && s.blue_units_initial) || [];
    ok('RED units use reviewed_base_anchor (anchors exist)',
        red.length > 0 && red.every(function (u) { return u.placement_source === 'reviewed_base_anchor' && u.exact_unit_position === false && u.needs_review === true && u.draft_template_position === false; }));
    ok('RED units sit AT reviewed anchors, NOT at the objective (20,50)',
        red.length > 0 && red.every(function (u) {
            var atAnchor = (near(u.coord[0], 44.10) && near(u.coord[1], 33.40)) || (near(u.coord[0], 44.30) && near(u.coord[1], 33.30));
            var atObjective = near(u.coord[0], 50.0) && near(u.coord[1], 20.0);
            return atAnchor && !atObjective;
        }));
    ok('BLUE units fall back to template_geometry (no BLUE anchor)',
        blue.length > 0 && blue.every(function (u) { return u.placement_source === 'template_geometry_relative_to_objective' && u.draft_template_position === true && u.exact_unit_position === false; }));
})();

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
