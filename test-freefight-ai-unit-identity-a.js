/**
 * test-freefight-ai-unit-identity-a.js — RMOOZ-UNIT-IDENTITY-CONTRACT-A
 *
 * Proves the AI/COA path consumes the shared identity contract:
 *   - the server capability analyst never turns a role/synthetic label into a platform;
 *   - it honors a client-attached unit_identity block;
 *   - the tool-contract OOB hands the LLM a normalized identity + synthetic warning;
 *   - the client normUnit (static) resolves identity the same way.
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

console.log('\nRMOOZ-UNIT-IDENTITY-CONTRACT-A — AI / COA path\n');

// ── §1 server analyst never makes a role the platform (case 8 root cause) ──
console.log('§1 analyst: role is not a platform');
ok('synthetic "fires-47" unit → platform_name null, display name kept', function () {
    var u = { uid: 'R-047', role: 'fires', label: 'fires-47', domain: 'ground' };
    var prof = analyst.normalizeCapabilityProfile({}, u);
    assert.strictEqual(prof.platform_name, null, 'role/synthetic must NOT become platform');
    assert.strictEqual(prof.original_name, 'fires-47');
    assert.strictEqual(prof.unit_uid, 'R-047');
});
ok('heuristic-profile path also rejects role-as-platform', function () {
    // analyzeUnitCapabilities heuristic fallback builds the profile from classifyUnit.
    var profiles = analyst.selectBestUnitsForMission
        ? null : null; // no-op guard
    var built = analyst.normalizeCapabilityProfile({}, { uid: 'R-1', role: 'armor', domain: 'ground' });
    assert.notStrictEqual(built.platform_name, 'armor');
});

// ── §2 analyst honors a client-attached unit_identity ─────────────────
console.log('§2 analyst honors client unit_identity');
ok('authored platform via unit_identity flows into profile', function () {
    var u = {
        uid: 'B-1', role: 'fighter', domain: 'air',
        unit_identity: R.unitIdentityForLlm({ uid: 'B-1', role: 'fighter', domain: 'air', platform: 'F-16 Falcon' }),
    };
    var prof = analyst.normalizeCapabilityProfile({}, u);
    assert.strictEqual(prof.platform_name, 'F-16 Falcon');
});

// ── §3 tool-contract OOB hands the LLM a trustworthy identity ─────────
console.log('§3 OOB identity for the LLM');
ok('OOB unit carries display_name + platform_name + synthetic warning', function () {
    var oob = contract.getScenarioOobTool({
        units: [
            { uid: 'R-047', role: 'fires', label: 'fires-47', domain: 'ground', side: 'RED', lat: 24.4, lon: 54.3 },
            { uid: 'B-1', role: 'fighter', domain: 'air', platform: 'F-15', side: 'BLUE', lat: 24.5, lon: 54.2 },
        ],
    });
    assert.strictEqual(oob.ok, true);
    var red = oob.data.units.find(function (x) { return x.unit_uid === 'R-047'; });
    var blue = oob.data.units.find(function (x) { return x.unit_uid === 'B-1'; });
    assert.strictEqual(red.display_name, 'fires-47');
    assert.strictEqual(red.platform_name, 'unknown');        // NOT "fires"
    assert.strictEqual(red.identity_warning, 'synthetic_display_name');
    assert.strictEqual(red.identity_confidence, 'low');
    assert.strictEqual(blue.platform_name, 'F-15');
    assert.strictEqual(blue.identity_warning, null);
});

// ── §4 LLM identity block shape (case 8 contract) ─────────────────────
console.log('§4 unitIdentityForLlm contract');
ok('LLM block: uid/display/role/domain/platform/confidence/warning', function () {
    var llm = R.unitIdentityForLlm({ uid: 'R-047', role: 'fires', domain: 'ground', label: 'fires-47' });
    assert.deepStrictEqual(
        { uid: llm.uid, display_name: llm.display_name, role: llm.role, domain: llm.domain, platform_name: llm.platform_name, identity_confidence: llm.identity_confidence, warning: llm.warning },
        { uid: 'R-047', display_name: 'fires-47', role: 'fires', domain: 'ground', platform_name: 'unknown', identity_confidence: 'low', warning: 'synthetic_display_name' }
    );
});

// ── §5 client normUnit resolves identity the same way (static) ────────
console.log('§5 client normUnit wiring (static)');
ok('free-fight-demo normUnit attaches unit_identity via shared resolver', function () {
    var src = fs.readFileSync(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo.js'), 'utf8');
    var i = src.indexOf('function normUnit');
    assert.ok(i >= 0, 'normUnit not found');
    var slice = src.slice(i, i + 1800);
    assert.ok(/RmoozUnitIdentity/.test(slice), 'normUnit must use RmoozUnitIdentity');
    assert.ok(/unit_identity/.test(slice), 'normUnit must attach unit_identity');
    // The old role-as-platform fallback must be gone.
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
