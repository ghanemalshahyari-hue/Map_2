/**
 * test-freefight-ai-unit-identity-a.js — RMOOZ-UNIT-IDENTITY-CONTRACT-A (v2)
 *
 * The AI/COA path consumes the shared identity contract:
 *   - keeps the system-linking uid (R-047) so the engine can reference units;
 *   - never turns a role/synthetic key into a platform (platform stays "unknown");
 *   - exposes a real capability display name + canonical_id + tactical_code to the LLM;
 *   - honors a client-attached unit_identity; client normUnit wires the same resolver.
 */
'use strict';
var assert = require('assert');
var path = require('path');
var fs = require('fs');

var R        = require(path.join(__dirname, 'UI_MOdified/client/shared/unit-identity-resolver.js'));
var analyst  = require(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-llm-capability-analyst.js'));
var contract = require(path.join(__dirname, 'UI_MOdified/server/ai/rmooz-ai-tool-contract.js'));

var pass = 0;
function ok(name, fn) { fn(); pass++; console.log('  ✓ ' + name); }

console.log('\nRMOOZ-UNIT-IDENTITY-CONTRACT-A — AI / COA path (v2)\n');

// ── §1 analyst never makes a role/synthetic key the platform ──────────
console.log('§1 analyst: role is not a platform');
ok('real-data fires unit → platform_name null, display = capability name', function () {
    var u = { uid: 'R-047', label: 'fires-47', role: 'fires', domain: 'ground' };
    var prof = analyst.normalizeCapabilityProfile({}, u);
    assert.strictEqual(prof.platform_name, null, 'role/synthetic must NOT become platform');
    assert.strictEqual(prof.original_name, 'Rocket Artillery Battery', 'real capability name');
    assert.notStrictEqual(prof.original_name, 'fires-47');
    assert.notStrictEqual(prof.original_name, 'R-047');
    assert.strictEqual(prof.unit_uid, 'R-047', 'system key kept for engine linking');
});

// ── §2 analyst honors a client-attached unit_identity ─────────────────
console.log('§2 analyst honors client unit_identity');
ok('authored platform via unit_identity flows into profile', function () {
    var u = {
        uid: 'R-020', label: 'fighter-20', role: 'fighter', domain: 'air',
        unit_identity: R.unitIdentityForLlm({ uid: 'R-020', label: 'fighter-20', role: 'fighter', domain: 'air', platform: 'F-15 Eagle' }),
    };
    var prof = analyst.normalizeCapabilityProfile({}, u);
    assert.strictEqual(prof.platform_name, 'F-15 Eagle');
});

// ── §3 tool-contract OOB hands the LLM a trustworthy identity ─────────
console.log('§3 OOB identity for the LLM');
ok('OOB unit carries canonical_id, real display, platform unknown, warning', function () {
    var oob = contract.getScenarioOobTool({
        units: [
            { uid: 'R-047', label: 'fires-47', role: 'fires', domain: 'ground', side: 'RED', lat: 24.4, lon: 54.3 },
            { uid: 'R-020', label: 'fighter-20', role: 'fighter', domain: 'air', platform: 'F-15 Eagle', side: 'BLUE', lat: 24.5, lon: 54.2 },
        ],
    });
    assert.strictEqual(oob.ok, true);
    var red = oob.data.units.find(function (x) { return x.unit_uid === 'R-047'; });
    var blue = oob.data.units.find(function (x) { return x.unit_uid === 'R-020'; });
    assert.strictEqual(red.unit_uid, 'R-047', 'engine linking key kept');
    assert.strictEqual(red.display_name, 'Rocket Artillery Battery');
    assert.strictEqual(red.platform_name, 'unknown', 'NO exact/role platform claimed');
    assert.ok(/display_name_from_type|platform_unknown/.test(String(red.identity_warning)));
    assert.strictEqual(blue.platform_name, 'F-15 Eagle');
});

// ── §4 LLM identity block (v2 shape) ──────────────────────────────────
console.log('§4 unitIdentityForLlm contract');
ok('LLM block: uid=R-047 (link), canonical=fires-47, real display, unknown platform', function () {
    var llm = R.unitIdentityForLlm({ uid: 'R-047', label: 'fires-47', role: 'fires', domain: 'ground' });
    assert.strictEqual(llm.uid, 'R-047');
    assert.strictEqual(llm.canonical_id, 'fires-47');
    assert.strictEqual(llm.tactical_code, 'R-047');
    assert.strictEqual(llm.display_name, 'Rocket Artillery Battery');
    assert.strictEqual(llm.platform_name, 'unknown');
    assert.strictEqual(llm.role, 'fires');
    assert.strictEqual(llm.domain, 'ground');
});

// ── §5 client normUnit wiring (static) ────────────────────────────────
console.log('§5 client normUnit wiring (static)');
ok('free-fight-demo normUnit uses the shared resolver + attaches unit_identity', function () {
    var src = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'), 'utf8');
    var i = src.indexOf('function normUnit');
    assert.ok(i >= 0, 'normUnit not found');
    var slice = src.slice(i, i + 1800);
    assert.ok(/RmoozUnitIdentity/.test(slice), 'normUnit must use RmoozUnitIdentity');
    assert.ok(/unit_identity/.test(slice), 'normUnit must attach unit_identity');
    assert.ok(!/platform:\s*u\.platform\s*\|\|\s*u\.role/.test(slice), 'role-as-platform fallback still present');
});

// ── §6 no hardcoded scenario specifics in the touched server modules ──
console.log('§6 no hardcoding');
ok('analyst + contract have no hardcoded R-047 / fires-47 / draft name', function () {
    ['UI_MOdified/server/ai/free-fight-llm-capability-analyst.js',
     'UI_MOdified/server/ai/rmooz-ai-tool-contract.js'].forEach(function (f) {
        var src = fs.readFileSync(path.join(__dirname, f), 'utf8');
        assert.ok(!/R-047/.test(src), 'R-047 leaked into ' + f);
        assert.ok(!/fires-47/.test(src), 'fires-47 leaked into ' + f);
        assert.ok(!/attack_objective_draft/.test(src), 'draft name leaked into ' + f);
    });
});

console.log('\n✅ ' + pass + ' assertions passed (test-freefight-ai-unit-identity-a.js)\n');
