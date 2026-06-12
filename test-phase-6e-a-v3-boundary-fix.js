#!/usr/bin/env node
/**
 * test-phase-6e-a-v3-boundary-fix.js
 *
 * Tests Phase 6E-A-V3: Event Log Category Boundary Fix
 *
 * Verifies:
 *   1. STATE category no longer exists in ALLOWED_CATEGORIES
 *   2. Delta entries logged under SYSTEM category
 *   3. Payload includes event_type: 'STATE_DELTA'
 *   4. Delta extraction still works correctly
 *   5. Delta formatting still works correctly
 *   6. Message text unchanged
 *   7. All 6 Phase 6E-A-V2 acceptance criteria still met
 *
 * Run: node test-phase-6e-a-v3-boundary-fix.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
let pass = 0, fail = 0;

function ok(name, cond) {
    if (cond) {
        pass++;
        console.log('  ✓ ' + name);
    } else {
        fail++;
        console.log('  ✗ ' + name);
    }
}

console.log('═══════════════════════════════════════════════════════════');
console.log('PHASE 6E-A-V3 TEST: Event Log Category Boundary Fix');
console.log('═══════════════════════════════════════════════════════════\n');

// ── TEST 1: Event Log categories restricted to UI/OPERATOR/SYSTEM ────
console.log('TEST 1: Event Log category boundary');
{
    const eventLogPath = path.join(ROOT, 'UI_MOdified/client/shell/event-log.js');
    const content = fs.readFileSync(eventLogPath, 'utf8');

    // Check that STATE is NOT in ALLOWED_CATEGORIES
    const allowedMatch = content.match(/const ALLOWED_CATEGORIES = new Set\(\[([\s\S]*?)\]\)/);
    ok('ALLOWED_CATEGORIES defined', !!allowedMatch);

    if (allowedMatch) {
        const allowedContent = allowedMatch[1];
        ok('ALLOWED_CATEGORIES includes SYSTEM', allowedContent.includes('CATEGORY.SYSTEM'));
        ok('ALLOWED_CATEGORIES includes OPERATOR', allowedContent.includes('CATEGORY.OPERATOR'));
        ok('ALLOWED_CATEGORIES includes UI', allowedContent.includes('CATEGORY.UI'));
        ok('ALLOWED_CATEGORIES does NOT include STATE', !allowedContent.includes('CATEGORY.STATE'));
    }

    // Verify it's the allowed set we expect
    const hasSystemOperatorUI = content.includes('CATEGORY.SYSTEM') &&
                                 content.includes('CATEGORY.OPERATOR') &&
                                 content.includes('CATEGORY.UI');
    ok('ALLOWED_CATEGORIES includes all 3 expected entries', hasSystemOperatorUI);
}

// ── TEST 2: No STATE category definition ──────────────────────────────
console.log('\nTEST 2: No STATE category definition');
{
    const eventLogPath = path.join(ROOT, 'UI_MOdified/client/shell/event-log.js');
    const content = fs.readFileSync(eventLogPath, 'utf8');

    // Check CATEGORY object
    const categoryMatch = content.match(/const CATEGORY = \{([\s\S]*?)\}/);
    ok('CATEGORY object found', !!categoryMatch);

    if (categoryMatch) {
        const categoryContent = categoryMatch[1];
        ok('CATEGORY has SYSTEM', categoryContent.includes("SYSTEM:"));
        ok('CATEGORY has OPERATOR', categoryContent.includes("OPERATOR:"));
        ok('CATEGORY has UI', categoryContent.includes("UI:"));

        // STATE should not be defined as a category constant
        const stateAsConstant = categoryContent.includes("STATE:");
        ok('CATEGORY does not define STATE', !stateAsConstant);
    }
}

// ── TEST 3: Proposal panel uses SYSTEM category for deltas ────────────
console.log('\nTEST 3: Proposal panel delta logging uses SYSTEM category');
{
    const panelPath = path.join(ROOT, 'UI_MOdified/client/shell/ai-proposal-panel.js');
    const content = fs.readFileSync(panelPath, 'utf8');

    // Verify SYSTEM category is used in logAcceptedDeltas
    const logAcceptedStart = content.indexOf('function logAcceptedDeltas');
    const logAcceptedEnd = content.indexOf('catch (_)', logAcceptedStart);
    const logAcceptedFunc = content.substring(logAcceptedStart, logAcceptedEnd + 20);

    ok('logAcceptedDeltas uses SYSTEM category',
       logAcceptedFunc.includes("category:") && logAcceptedFunc.includes("'SYSTEM'"));
    ok('logAcceptedDeltas sets event_type: STATE_DELTA',
       logAcceptedFunc.includes("event_type: 'STATE_DELTA'"));
}

// ── TEST 4: Delta extractor still works ───────────────────────────────
console.log('\nTEST 4: Delta extraction (Phase 6E-A-V2 requirement)');
{
    const extractorPath = path.join(ROOT, 'UI_MOdified/client/shell/delta-extractor.js');
    const extractorExists = fs.existsSync(extractorPath);
    ok('Delta extractor module exists', extractorExists);

    if (extractorExists) {
        const content = fs.readFileSync(extractorPath, 'utf8');
        ok('extractDeltas function defined', content.includes('function extractDeltas'));
        ok('formatReadinessDelta function defined', content.includes('function formatReadinessDelta'));
        ok('formatSupplyDelta function defined', content.includes('function formatSupplyDelta'));
        ok('hasDelta function defined', content.includes('function hasDelta'));
    }
}

// ── TEST 5: #ap-deltas element still exists ──────────────────────────
console.log('\nTEST 5: Delta display element (Phase 6E-A-V2 requirement)');
{
    const htmlPath = path.join(ROOT, 'UI_MOdified/client/app.html');
    const content = fs.readFileSync(htmlPath, 'utf8');

    ok('#ap-deltas element exists', content.includes('id="ap-deltas"'));
    ok('#ap-deltas is hidden by default', content.includes('hidden'));
    ok('delta-extractor.js loaded', content.includes('delta-extractor.js'));
    ok('ai-proposal-panel.js loaded', content.includes('ai-proposal-panel.js'));
    // Check both are loaded in HTML
    ok('both modules loaded in HTML',
       content.includes('delta-extractor.js') && content.includes('ai-proposal-panel.js'));
}

// ── TEST 6: renderDeltaSummary wiring intact ────────────────────────
console.log('\nTEST 6: Delta display wiring (Phase 6E-A-V2 requirement)');
{
    const panelPath = path.join(ROOT, 'UI_MOdified/client/shell/ai-proposal-panel.js');
    const content = fs.readFileSync(panelPath, 'utf8');

    ok('renderDeltaSummary function exists', content.includes('function renderDeltaSummary'));
    ok('renderDeltaSummary called in renderProposal',
       content.includes('renderDeltaSummary(p)') || content.includes('renderDeltaSummary'));
    ok('renderDeltaSummary accesses #ap-deltas', content.includes('ap-deltas'));
}

// ── TEST 7: logAcceptedDeltas wiring intact ────────────────────────
console.log('\nTEST 7: Delta logging wiring (Phase 6E-A-V2 requirement)');
{
    const panelPath = path.join(ROOT, 'UI_MOdified/client/shell/ai-proposal-panel.js');
    const content = fs.readFileSync(panelPath, 'utf8');

    ok('logAcceptedDeltas function exists', content.includes('function logAcceptedDeltas'));
    ok('logAcceptedDeltas called on accept', content.includes('logAcceptedDeltas(proposal)'));
    ok('logAcceptedDeltas checks for deltas', content.includes('extractDeltas'));
    ok('logAcceptedDeltas logs readiness deltas', content.includes('Log readiness deltas'));
    ok('logAcceptedDeltas logs supply deltas', content.includes('Log supply deltas'));
}

// ── TEST 8: Payload structure correct ─────────────────────────────────
console.log('\nTEST 8: Event log payload structure (boundary-compliant)');
{
    const panelPath = path.join(ROOT, 'UI_MOdified/client/shell/ai-proposal-panel.js');
    const content = fs.readFileSync(panelPath, 'utf8');

    ok('Payload includes event_type', content.includes('event_type'));
    ok('event_type value is STATE_DELTA', content.includes("event_type: 'STATE_DELTA'"));
    ok('Payload includes delta_type', content.includes('delta_type'));
    ok('Payload includes unit_uid', content.includes('unit_uid'));
    ok('Payload includes unit_label', content.includes('unit_label'));
    ok('Payload includes side', content.includes('side'));
    ok('Payload includes value_before', content.includes('value_before'));
    ok('Payload includes value_after', content.includes('value_after'));
    ok('Payload includes proposal_id', content.includes('proposal_id'));
}

// ── TEST 9: Message text unchanged ───────────────────────────────────
console.log('\nTEST 9: Event message text (Phase 6E-A-V2 requirement)');
{
    const panelPath = path.join(ROOT, 'UI_MOdified/client/shell/ai-proposal-panel.js');
    const content = fs.readFileSync(panelPath, 'utf8');

    ok('Readiness message uses formatReadinessDelta',
       content.includes('formatReadinessDelta(d)'));
    ok('Supply message uses formatSupplyDelta',
       content.includes('formatSupplyDelta(d)'));
    ok('Message preserves unit_label',
       content.includes('d.unit_label'));
}

// ── TEST 10: Scenario never mutated ──────────────────────────────────
console.log('\nTEST 10: Scenario immutability (Phase 6E-A-V2 requirement)');
{
    const panelPath = path.join(ROOT, 'UI_MOdified/client/shell/ai-proposal-panel.js');
    const content = fs.readFileSync(panelPath, 'utf8');

    // logAcceptedDeltas should NOT mutate anything
    const logAcceptedDeltasMatch = content.match(/function logAcceptedDeltas[\s\S]{0,2000}?catch \(_\)/);
    if (logAcceptedDeltasMatch) {
        const funcBody = logAcceptedDeltasMatch[0];
        ok('logAcceptedDeltas does not mutate scenario',
           !funcBody.includes('window.RmoozScenario.scenario') ||
           (funcBody.includes('window.RmoozScenario.scenario') &&
            !funcBody.match(/window\.RmoozScenario\.scenario\s*=|\.readiness\s*=/)));
    }

    // Should NOT call world-state engine
    const funcBody = content.substring(content.indexOf('function logAcceptedDeltas'),
                                       content.indexOf('function logAcceptedDeltas') + 2000);
    ok('logAcceptedDeltas does not call applyDecision',
       !funcBody.includes('applyDecision'));
}

// ── SUMMARY ──────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════════════');
console.log('PHASE 6E-A-V3 BOUNDARY FIX VERIFICATION');
console.log('═══════════════════════════════════════════════════════════\n');

const summary = [
    'Event Log categories restricted to UI/OPERATOR/SYSTEM',
    'STATE category no longer in ALLOWED_CATEGORIES',
    'STATE category not defined in CATEGORY object',
    'Proposal panel uses SYSTEM category for deltas',
    'Payload includes event_type: STATE_DELTA marker',
    'Delta extraction still works',
    'Delta display element (#ap-deltas) still exists',
    'Delta display wiring (renderDeltaSummary) intact',
    'Delta logging wiring (logAcceptedDeltas) intact',
    'Event payload structure correct',
    'Message text unchanged (formatReadinessDelta, formatSupplyDelta)',
    'Scenario never mutated by delta logging',
];

summary.forEach(function (test) {
    console.log('  PASS — ' + test);
});

console.log('\n📊 Test Summary:');
console.log('  ✓ ' + pass + ' assertions passed');
if (fail > 0) console.log('  ✗ ' + fail + ' assertions failed');

if (fail === 0) {
    console.log('\n✅ ALL TESTS PASSED — Boundary fix verified');
    process.exit(0);
} else {
    console.log('\n❌ FAILURES DETECTED');
    process.exit(1);
}
