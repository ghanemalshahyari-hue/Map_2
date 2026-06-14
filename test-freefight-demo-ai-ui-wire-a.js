#!/usr/bin/env node
/*
 * FREEFIGHT-DEMO-AI-UI-WIRE-A
 *
 * Tests for the Free Fight AI Demo UI wiring.
 * No DOM server required — pure Node.
 *
 * Tests:
 *   §1  renderDecision includes action_type in output HTML
 *   §2  renderDecision includes unit_uid in output HTML
 *   §3  renderDecision includes reason text in output HTML
 *   §4  renderDecision includes event_log_entry in output HTML
 *   §5  renderDecision includes "Apply AI Action" button
 *   §6  renderDecision handles ok:false gracefully (no crash, shows fallback)
 *   §7  server logic: decideAction + validateAction + applyAction chain ok:true
 *   §8  event_log_entry format matches expected pattern
 *   §9  PANEL.openPanel is undefined (separate card removed — FREEFIGHT-DEMO-AI-INTEGRATE-A)
 */
'use strict';

var path = require('path');

// ── DOM stub ─────────────────────────────────────────────────────────────────
var elements = {};
function makeEl(tag) {
    return {
        tagName: String(tag), id: '', className: '', innerHTML: '', textContent: '',
        children: [], attrs: {}, style: {},
        disabled: false,
        appendChild: function (el) { this.children.push(el); if (el.id) elements[el.id] = el; return el; },
        setAttribute: function (k, v) { this.attrs[k] = v == null ? '' : String(v); },
        removeAttribute: function (k) { delete this.attrs[k]; },
        hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); },
        addEventListener: function () {},
        querySelector: function () { return { addEventListener: function () {}, disabled: false, style: {} }; },
        querySelectorAll: function () { return []; },
        insertBefore: function (el) { this.children.push(el); return el; },
    };
}
global.document = {
    body: makeEl('body'), head: makeEl('head'),
    createElement: function (t) { return makeEl(t); },
    getElementById: function (id) { return elements[id] || null; },
};
global.window = {};
global.window.document = global.document;

// Load the panel module — the IIFE uses global.window (set above) as its `win` context.
require(path.join(__dirname, 'UI_MOdified/client/shell/free-fight-demo-ai-panel.js'));
var PANEL = global.window.RmoozFreeFightAiPanel;

// Load the engine for §7 and §8
var ENGINE = require(path.join(__dirname, 'UI_MOdified/server/ai/free-fight-action-engine.js'));

var passed = 0, failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  [PASS] ' + label); }
    else       { failed++; console.log('  [FAIL] ' + label); }
}

console.log('FREEFIGHT-DEMO-AI-UI-WIRE-A');

// ── Fixture ───────────────────────────────────────────────────────────────────
var DECISION = {
    ok: true,
    action: {
        action_type: 'MOVE_TOWARD_OBJECTIVE',
        side: 'RED',
        unit_uid: 'IR-F14-WIRE-001',
        target: { type: 'objective', lat: 26.0, lon: 53.0 },
        reason: 'Advance to strike position.',
        risk: 'medium',
        confidence: 'medium',
        source: 'deterministic_demo_ai',
        demo_only: true,
        needs_review: true,
    },
    validation: { ok: true },
    apply_result: { ok: true, old_pos: { lat: 27.21, lon: 56.38 }, new_pos: { lat: 27.17, lon: 56.34 }, moved_km: 5.6 },
    event_log_entry: 'AI Decision: RED IR-F14-WIRE-001 moved toward Objective X — reason: Advance to strike position. — confidence: medium [deterministic_demo_ai]',
    changed_unit: { id: 'IR-F14-WIRE-001', side: 'RED', platform: 'F-14A Tomcat', lat: 27.17, lon: 56.34 },
    scenario_patch: { unit_uid: 'IR-F14-WIRE-001', lat: 27.17, lon: 56.34 },
};

// ── §1  action_type ───────────────────────────────────────────────────────────
console.log('\n§1  renderDecision: action_type in output HTML');

ok('§1 PANEL loaded', !!PANEL);
ok('§1 renderDecision is a function', typeof (PANEL && PANEL.renderDecision) === 'function');

var c1 = makeEl('div');
if (PANEL && PANEL.renderDecision) PANEL.renderDecision(c1, DECISION);
ok('§1 container.innerHTML set', c1.innerHTML.length > 0);
ok('§1 action_type MOVE_TOWARD_OBJECTIVE in HTML', /MOVE_TOWARD_OBJECTIVE/.test(c1.innerHTML));

// ── §2  unit_uid ──────────────────────────────────────────────────────────────
console.log('\n§2  renderDecision: unit_uid in output HTML');

var c2 = makeEl('div');
PANEL.renderDecision(c2, DECISION);
ok('§2 unit_uid IR-F14-WIRE-001 in HTML', /IR-F14-WIRE-001/.test(c2.innerHTML));

// ── §3  reason ────────────────────────────────────────────────────────────────
console.log('\n§3  renderDecision: reason in output HTML');

var c3 = makeEl('div');
PANEL.renderDecision(c3, DECISION);
ok('§3 reason text "Advance to strike position" in HTML', /Advance to strike position/.test(c3.innerHTML));

// ── §4  event_log_entry ───────────────────────────────────────────────────────
console.log('\n§4  renderDecision: event_log_entry in output HTML');

var c4 = makeEl('div');
PANEL.renderDecision(c4, DECISION);
ok('§4 event_log_entry text appears in HTML', /deterministic_demo_ai/.test(c4.innerHTML));
ok('§4 "AI Decision:" in HTML', /AI Decision:/.test(c4.innerHTML));

// ── §5  Apply AI Action button ────────────────────────────────────────────────
console.log('\n§5  renderDecision: "Apply AI Action" button present');

var c5 = makeEl('div');
PANEL.renderDecision(c5, DECISION);
ok('§5 "Apply AI Action" text in HTML', /Apply AI Action/.test(c5.innerHTML));
ok('§5 data-act="apply-ai" in HTML', /data-act="apply-ai"/.test(c5.innerHTML));

// ── §6  ok:false handled gracefully ──────────────────────────────────────────
console.log('\n§6  renderDecision: ok:false handled gracefully');

var c6 = makeEl('div');
var threw = false;
try { PANEL.renderDecision(c6, { ok: false, reason: 'no_movable_unit' }); } catch (e) { threw = true; }
ok('§6 no exception on ok:false', !threw);
ok('§6 fallback content rendered', c6.innerHTML.length > 0);
ok('§6 fallback contains "no movable unit" text', /no movable unit/i.test(c6.innerHTML));

// ── §7  Server logic chain ────────────────────────────────────────────────────
console.log('\n§7  Server logic: decideAction + validateAction + applyAction chain');

var units7 = [
    { id: 'IR-F14-SRV', side: 'RED', lat: 27.21, lon: 56.38, platform: 'F-14A Tomcat',
      needs_review: true, exact_unit_position: false, source_type: 'deterministic_demo_ai' },
];
var objectives7 = [{ lat: 26.0, lon: 53.0 }];

var action7 = ENGINE.decideAction(units7, objectives7, { preferSide: 'RED' });
ok('§7 decideAction returns action', !!action7);

var validation7 = ENGINE.validateAction(action7, units7, objectives7);
ok('§7 validateAction ok=true for valid action', validation7.ok === true);

var unitsCopy7 = units7.map(function (u) { return Object.assign({}, u); });
var apply7 = ENGINE.applyAction(action7, unitsCopy7);
ok('§7 applyAction ok=true', apply7.ok === true);
ok('§7 apply result has new_pos', !!(apply7.ok && apply7.new_pos));

var scenario_patch7 = apply7.ok
    ? { unit_uid: action7.unit_uid, lat: apply7.new_pos.lat, lon: apply7.new_pos.lon }
    : null;
ok('§7 scenario_patch has unit_uid', !!(scenario_patch7 && scenario_patch7.unit_uid));
ok('§7 scenario_patch lat is a number', !!(scenario_patch7 && typeof scenario_patch7.lat === 'number'));

var entry7 = ENGINE.makeEventLogEntry(action7, apply7);
ok('§7 event_log_entry non-empty', typeof entry7 === 'string' && entry7.length > 0);

// ── §8  event_log_entry format ────────────────────────────────────────────────
console.log('\n§8  event_log_entry format matches expected pattern');

var unitLog = { id: 'IR-F14-LOG', side: 'RED', lat: 27.0, lon: 56.0, platform: 'F-14A Tomcat',
                needs_review: true, exact_unit_position: false };
var actionLog = ENGINE.decideAction([unitLog], [{ lat: 26.0, lon: 53.0 }]);
var resultLog = ENGINE.applyAction(actionLog, [Object.assign({}, unitLog)]);
var logEntry = ENGINE.makeEventLogEntry(actionLog, resultLog);

ok('§8 starts with "AI Decision:"', /^AI Decision:/.test(logEntry));
ok('§8 contains side RED', /RED/.test(logEntry));
ok('§8 contains platform name F-14A Tomcat', /F-14A Tomcat/.test(logEntry));
ok('§8 contains "reason:"', /reason:/.test(logEntry));
ok('§8 contains source tag [deterministic_demo_ai]', /\[deterministic_demo_ai\]/.test(logEntry));

// ── §9  openPanel is gone ─────────────────────────────────────────────────────
console.log('\n§9  PANEL.openPanel is undefined (separate card removed)');

ok('§9 PANEL.openPanel is undefined', typeof PANEL.openPanel === 'undefined');
ok('§9 PANEL.renderDecision still present', typeof PANEL.renderDecision === 'function');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
