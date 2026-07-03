'use strict';

/*
 * RMOOZ cleanup gate: legacy brief-to-scenario path must stay retired.
 *
 * Product ruling:
 * - Do not use the old brief-to-scenario draft generator as a product path.
 * - New scenario building must come from the real live workspace / Edit Mode base.
 * - This gate intentionally targets the legacy module only and does not touch offline.
 */

var fs = require('fs');
var path = require('path');
var file = path.join(__dirname, 'UI_MOdified', 'server', 'ai', 'brief-to-scenario.js');
var source = fs.readFileSync(file, 'utf8');
var stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
var passed = 0;
var failed = 0;
function assert(label, cond) {
    if (cond) { console.log('PASS ' + label); passed += 1; }
    else { console.error('FAIL ' + label); failed += 1; }
}

console.log('\n=== RMOOZ legacy brief scenario generator retirement gate ===\n');

assert('legacy module still exists only as a compatibility boundary', fs.existsSync(file));
assert('retirement marker is present', /retired|disabled|legacy_ai_scenario_generator_retired/i.test(source));
assert('generator no longer returns a scenario object', !/return\s*\{\s*scenario\s*,\s*report\s*\}/.test(stripped));
assert('generator no longer stamps generated_from_brief scenario output', !/generated_from_brief\s*:\s*true/.test(stripped));
assert('generator no longer ports from brief-to-scenario', !/ported_from\s*:\s*['"]brief-to-scenario\.js['"]/.test(stripped));
assert('legacy template geometry is not used to create units', !/template_geometry_relative_to_objective/.test(stripped));
assert('legacy generated RED draft units are not emitted', !/const\s+red_units\s*=\s*\[\]/.test(stripped));
assert('legacy generated BLUE draft units are not emitted', !/const\s+blue_units_initial\s*=\s*\[\]/.test(stripped));

console.log('\nResults: ' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
