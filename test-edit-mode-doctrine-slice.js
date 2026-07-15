#!/usr/bin/env node
/**
 * test-edit-mode-doctrine-slice.js — Batch B Slice 5
 *
 * Static (no server) verifier for the Doctrine/ROE/WRA authoring UI:
 * un-gaps the "doctrine" STEPS placeholder with a real Forces-card-shell
 * list+detail editor writing `doctrine_rules`/`roe_rules`/`wra_rules` at
 * scenario top level, and adds `validateDoctrineHardRules` (authoring-side
 * rejection of bad refs/ranges — the runtime evaluator in doctrine-rules.js
 * is deliberately lenient and never rejects, so this check has to live here).
 *
 * Proves:
 *   - a clean, canonically-shaped authored rule set passes the new gate
 *   - that same rule set round-trips through doctrine-rules.js's real
 *     normalizeDoctrineRules/normalizeRoeRules/normalizeWraRules unchanged
 *   - bad refs (unknown side) / bad ranges / bad enums / duplicate ids are
 *     each individually rejected
 *   - the UI card renders without throwing and add/select/remove works
 *   - the STEPS table no longer carries a doctrine placeholder gap
 *
 * Sibling to test-edit-mode-slice2{a,b,c,d,e}.js / test-edit-mode-savegate-slice.js. Run:
 *   node test-edit-mode-doctrine-slice.js
 */
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;
const EDIT_MODE_PATH = path.join(ROOT, 'UI_MOdified/client/shell/scenario-edit-mode.js');
const DOCTRINE_RULES_PATH = path.join(ROOT, 'UI_MOdified/client/shell/doctrine-rules.js');

let pass = 0, fail = 0;
function ok(cond, label, detail) {
    if (cond) { console.log('  ok   ' + label); pass++; }
    else      { console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); fail++; }
}
function eq(a, b, label) { ok(a === b, label, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

// ── Load the IIFE into a fresh sandbox (same pattern as prior slice tests) ──
function loadSandbox() {
    const sandboxWindow = {
        AppEditMode: null,
        fetch: function () { return Promise.resolve({ ok: true, json: () => Promise.resolve({}) }); },
        URL: { createObjectURL: function () { return 'blob:stub'; }, revokeObjectURL: function () {} },
        Blob: function (parts, o) { this.parts = parts; this.opts = o; }
    };
    const stubDoc = {
        createElement: function (tag) {
            const kids = [];
            return {
                tag: tag, setAttribute() {}, style: {},
                appendChild: function (k) { kids.push(k); },
                get _kids() { return kids; },
                addEventListener() {}, click() {},
                set innerHTML(_v) { kids.length = 0; }, get innerHTML() { return ''; }
            };
        },
        getElementById: function () { return null; },
        addEventListener: function () {},
        body: { appendChild: function () {}, removeChild: function () {} }
    };
    const fnStub = function () {};
    const src = fs.readFileSync(EDIT_MODE_PATH, 'utf8');
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', 'navigator', 'setTimeout', 'requestAnimationFrame', 'Blob', 'URL', 'fetch', src)(
        sandboxWindow, stubDoc, { clipboard: { writeText: () => Promise.resolve() } }, fnStub, fnStub,
        sandboxWindow.Blob, sandboxWindow.URL, sandboxWindow.fetch
    );
    return sandboxWindow.AppEditMode && sandboxWindow.AppEditMode._testing;
}

const DoctrineRules = require(DOCTRINE_RULES_PATH);

function baseDraft() {
    return {
        name: 'doctrine-test', scenario_label: 'Doctrine Test',
        sides: [{ id: 'BLUE', name_en: 'Blue' }, { id: 'RED', name_en: 'Red' }],
        doctrine_rules: [], roe_rules: [], wra_rules: []
    };
}

console.log('\n=== Batch B Slice 5: Doctrine / ROE / WRA authoring ===\n');

const T = loadSandbox();
ok(!!T, 'AppEditMode._testing exposed');
ok(typeof T.validateDoctrineHardRules === 'function', 'validateDoctrineHardRules exposed');
ok(typeof T.renderDoctrineCard === 'function', 'renderDoctrineCard exposed');
ok(Array.isArray(T.DOCTRINE_RULE_KINDS) && T.DOCTRINE_RULE_KINDS.length === 3, 'DOCTRINE_RULE_KINDS has 3 kinds (doctrine/roe/wra)');

// ── 1. Clean canonical rule set passes the gate ────────────────────────────
console.log('\n[1] Clean, canonically-shaped rules pass validateDoctrineHardRules');
const draft = baseDraft();
draft.doctrine_rules.push({
    id: 'd1', enabled: true, decision: 'block', severity: 'critical',
    reason: 'no fire in restricted zone', requires_authority: true, tags: ['test'],
    applies_to_side: 'RED', condition: 'in_restricted_zone', action: 'fire'
});
draft.roe_rules.push({
    id: 'r1', enabled: true, decision: 'require_approval', severity: 'warn', reason: 'confirm hostile first',
    target_domain: 'air', target_status: 'unknown', hostile_confirmed_required: true,
    collateral_risk_max: 0.3, restricted_area_ids: ['AREA-1']
});
draft.wra_rules.push({
    id: 'w1', enabled: true, decision: 'allow', severity: 'info', reason: 'standard AAM release',
    weapon_class: 'AAM', target_class: 'air', max_range_nm: 40, min_confidence: 0.7,
    required_sensor_quality: 'high', salvo_limit: 2
});
{
    const r = T.validateDoctrineHardRules(draft);
    ok(r.ok, 'clean rule set: ok:true', r.why);
    const all = T.validateAllHardRules(draft);
    ok(all.ok, 'validateAllHardRules also passes (doctrine wired into the composite gate)', all.why);
}

// ── 2. Round-trips unchanged through doctrine-rules.js's real normalizers ──
console.log('\n[2] Authored rules round-trip through doctrine-rules.js normalizers unchanged');
{
    const nd = DoctrineRules.normalizeDoctrineRules(draft)[0];
    eq(nd.id, 'd1', 'doctrine: id unchanged');
    eq(nd.decision, 'block', 'doctrine: decision unchanged');
    eq(nd.severity, 'critical', 'doctrine: severity unchanged');
    eq(nd.reason, 'no fire in restricted zone', 'doctrine: reason unchanged');
    eq(nd.requires_authority, true, 'doctrine: requires_authority unchanged');
    eq(nd.applies_to_side, 'RED', 'doctrine: applies_to_side unchanged');
    eq(nd.condition, 'in_restricted_zone', 'doctrine: condition unchanged');
    eq(nd.action, 'fire', 'doctrine: action unchanged');
    ok(Array.isArray(nd.tags) && nd.tags.length === 1 && nd.tags[0] === 'test', 'doctrine: tags unchanged');

    const nr = DoctrineRules.normalizeRoeRules(draft)[0];
    eq(nr.id, 'r1', 'roe: id unchanged');
    eq(nr.decision, 'require_approval', 'roe: decision unchanged');
    eq(nr.target_domain, 'air', 'roe: target_domain unchanged');
    eq(nr.hostile_confirmed_required, true, 'roe: hostile_confirmed_required unchanged');
    eq(nr.collateral_risk_max, 0.3, 'roe: collateral_risk_max unchanged');
    ok(Array.isArray(nr.restricted_area_ids) && nr.restricted_area_ids[0] === 'AREA-1', 'roe: restricted_area_ids unchanged');

    const nw = DoctrineRules.normalizeWraRules(draft)[0];
    eq(nw.id, 'w1', 'wra: id unchanged');
    eq(nw.weapon_class, 'AAM', 'wra: weapon_class unchanged');
    eq(nw.max_range_nm, 40, 'wra: max_range_nm unchanged');
    eq(nw.min_confidence, 0.7, 'wra: min_confidence unchanged');
    eq(nw.required_sensor_quality, 'high', 'wra: required_sensor_quality unchanged');
    eq(nw.salvo_limit, 2, 'wra: salvo_limit unchanged');
}

// ── 3. Bad refs / ranges / enums are rejected (authoring-side, not runtime) ─
console.log('\n[3] Bad refs/ranges/enums rejected by validateDoctrineHardRules');
function expectRejected(mutateFn, label) {
    const d = baseDraft();
    mutateFn(d);
    const r = T.validateDoctrineHardRules(d);
    ok(r.ok === false, label, r.why || '(no why)');
}
expectRejected(d => d.doctrine_rules.push({ id: 'x1', applies_to_side: 'PURPLE' }), 'unknown applies_to_side rejected');
expectRejected(d => d.roe_rules.push({ id: 'x2', collateral_risk_max: 5 }), 'collateral_risk_max > 1 rejected');
expectRejected(d => d.wra_rules.push({ id: 'x3', min_confidence: -1 }), 'min_confidence < 0 rejected');
expectRejected(d => d.wra_rules.push({ id: 'x4', max_range_nm: -10 }), 'negative max_range_nm rejected');
expectRejected(d => d.wra_rules.push({ id: 'x5', salvo_limit: 2.5 }), 'non-integer salvo_limit rejected');
expectRejected(d => d.doctrine_rules.push({ id: 'x6', decision: 'maybe' }), 'unknown decision enum rejected');
expectRejected(d => d.doctrine_rules.push({ id: 'x7', severity: 'urgent' }), 'unknown severity enum rejected');
expectRejected(d => { d.doctrine_rules.push({ id: 'dup' }); d.doctrine_rules.push({ id: 'dup' }); }, 'duplicate id within an array rejected');
// doctrine-rules.js itself is confirmed lenient — it never rejects, only coerces.
{
    const badScenario = { doctrine_rules: [{ id: 'x', decision: 'maybe', severity: 'urgent' }] };
    const nd = DoctrineRules.normalizeDoctrineRules(badScenario)[0];
    eq(nd.decision, 'allow', 'runtime normalizer coerces bad decision to allow (confirms authoring gate is the real rejector)');
    eq(nd.severity, 'info', 'runtime normalizer coerces bad severity to info');
}

// ── 4. UI smoke: render + add + select + remove ────────────────────────────
console.log('\n[4] renderDoctrineCard — add/select/remove smoke test');
{
    const T2 = loadSandbox();
    const d2 = baseDraft();
    T2._setDraftForTest(d2);
    const host = { appendChild(k) { (this._kids = this._kids || []).push(k); } };
    let threw = false;
    try { T2.renderDoctrineCard(host); } catch (e) { threw = true; console.log('   threw:', e && e.message); }
    ok(!threw, 'renderDoctrineCard does not throw against an empty rule set');
    ok((host._kids || []).length > 0, 'renderDoctrineCard appends content to the host');

    const rule = T2.defaultRuleForKind('doctrine', d2.doctrine_rules);
    eq(rule.id, 'doctrine-1', 'defaultRuleForKind generates the expected first id');
    eq(rule.decision, 'allow', 'defaultRuleForKind defaults decision to allow');
    d2.doctrine_rules.push(rule);
    const nextId = T2.nextFreeRuleId('doctrine', d2.doctrine_rules);
    eq(nextId, 'doctrine-2', 'nextFreeRuleId avoids collision with an existing rule');

    T2._selectRuleForTest('doctrine', rule.id);
    let threw2 = false;
    try { T2.renderDoctrineCard(host); } catch (e) { threw2 = true; }
    ok(!threw2, 'renderDoctrineCard does not throw with a rule selected (detail pane path)');
    T2._clearRuleSelectionForTest();
}

// ── 5. Source-scan: the STEPS table no longer gates doctrine as a placeholder ─
console.log('\n[5] Source-scan — doctrine STEPS entry un-gapped, validateAllHardRules wired');
{
    const src = fs.readFileSync(EDIT_MODE_PATH, 'utf8');
    const stepsBlock = src.slice(src.indexOf('var STEPS = ['), src.indexOf('/* ---- Slice 2C: per-step completion predicates'));
    const doctrineEntry = stepsBlock.slice(stepsBlock.indexOf("id: 'doctrine'"), stepsBlock.indexOf("id: 'time'"));
    ok(!/gap:\s*true/.test(doctrineEntry), 'doctrine STEPS entry no longer carries gap:true');
    ok(/renderDoctrineCard/.test(doctrineEntry), 'doctrine STEPS entry renders renderDoctrineCard');
    const allRulesFn = src.slice(src.indexOf('function validateAllHardRules'), src.indexOf('function validateAllHardRules') + 400);
    ok(/validateDoctrineHardRules/.test(allRulesFn), 'validateAllHardRules composes validateDoctrineHardRules');
}

console.log('\n' + (fail === 0 ? 'OK' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
