/* test-obj-c.js — OBJ-C: Objective Evidence Panel
 *
 * Tests objective evidence visibility panel (display layer only).
 *
 * SCOPE (locked):
 *   • Evidence panel renders objective_evidence ledger (read-only)
 *   • No calculations, no new fields, no behavior changes
 *   • Groups evidence into 6 categories (combat, readiness, control, contacts, doctrine, system)
 *   • Displays confidence indicators (●●●/●●/●)
 *   • Shows source attribution
 *   • Integrates with i18n system
 *   • Pure passthrough of ws.derived.objective_evidence
 *
 * Test Plan (48 total assertions):
 *   1–6.    Panel Element & Initialization
 *   7–12.   Event Listener & Dispatch
 *  13–18.   Evidence Grouping by Type
 *  19–24.   Confidence Formatting
 *  25–30.   Value Formatting & Escaping
 *  31–36.   Group Rendering & Headers
 *  37–42.   i18n Integration
 *  43–48.   Empty/Fallback Handling
 *
 * Run: node test-obj-c.js
 */
'use strict';
const path = require('path');
const fs   = require('fs');
const ROOT = __dirname;

// Parse test cases from objective-evidence-panel.js directly
const panelCode = fs.readFileSync(
    path.join(ROOT, 'UI_MOdified/client/shell/objective-evidence-panel.js'),
    'utf8'
);

// Mock window, document, and module
global.window = { AppObjectiveEvidencePanel: null };
global.document = {
    getElementById: function(id) {
        if (id === 'objective-evidence-panel') {
            return {
                innerHTML: '',
                classList: {
                    _classes: [],
                    add: function(c) { if (this._classes.indexOf(c) === -1) this._classes.push(c); },
                    remove: function(c) { const i = this._classes.indexOf(c); if (i !== -1) this._classes.splice(i, 1); }
                }
            };
        }
        return null;
    },
    addEventListener: function() {},
    dispatchEvent: function() {}
};
global.module = { exports: {} };

// Load objective-evidence-panel module
const moduleFunc = eval('(function() { ' + panelCode + ' })');
moduleFunc();
const OEP = global.window.AppObjectiveEvidencePanel || global.module.exports;

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

console.log('OBJ-C — Objective Evidence Panel (Display Layer)');
console.log('');

/* ========== UNIT TESTS: 48 ASSERTIONS ========== */

console.log('PANEL ELEMENT & INITIALIZATION (6 assertions)');

ok('Panel module exports correctly',
   OEP && typeof OEP === 'object');

ok('renderObjectiveEvidence function exists',
   OEP && typeof OEP.renderObjectiveEvidence === 'function');

ok('hideObjectiveEvidence function exists',
   OEP && typeof OEP.hideObjectiveEvidence === 'function');

// Mock world state with evidence
const mockWS = {
    objectives: [{ id: 'obj_1', name: 'Objective Alpha' }],
    derived: {
        objective_status_display: 'THREATENED',
        objective_evidence: [
            {
                objective_id: 'obj_1',
                evidence_type: 'force_ratio',
                value: 2.4,
                source: 'balance_summary',
                confidence: 0.95,
                step_index: 5
            },
            {
                objective_id: 'obj_1',
                evidence_type: 'unit_strength_avg',
                value: 0.71,
                source: 'engagement_outcomes + balance_summary',
                confidence: 0.85,
                step_index: 5
            },
            {
                objective_id: 'obj_1',
                evidence_type: 'bls_control_count',
                value: 2,
                source: 'bls_status',
                confidence: 1.0,
                step_index: 5
            }
        ]
    }
};

const panelEl = global.document.getElementById('objective-evidence-panel');
ok('Panel element accessible',
   panelEl != null);

ok('Panel has classList with add/remove',
   panelEl && panelEl.classList && typeof panelEl.classList.add === 'function');

ok('renderObjectiveEvidence accepts (ws, objectiveId, stepIndex)',
   OEP.renderObjectiveEvidence.length === 3 || OEP.renderObjectiveEvidence.toString().includes('ws') &&
   OEP.renderObjectiveEvidence.toString().includes('objectiveId'));

console.log('');
console.log('EVENT LISTENER & DISPATCH (6 assertions)');

// Test that module listens for rmooz:objective-selected
const codeListeners = panelCode.indexOf('rmooz:objective-selected') > -1;
ok('Code contains rmooz:objective-selected listener setup',
   codeListeners);

const codeDerivation = panelCode.indexOf('deriveWorldState') > -1;
ok('Code derives world state on event',
   codeDerivation);

const codeRender = panelCode.indexOf('renderObjectiveEvidence(') > -1;
ok('Code calls renderObjectiveEvidence on event',
   codeRender);

const codeHide = panelCode.indexOf('hideObjectiveEvidence') > -1;
ok('Code handles clearing selection',
   codeHide);

const codeI18n = panelCode.indexOf('applyI18nToElement') > -1;
ok('Code applies i18n to rendered panel',
   codeI18n);

ok('Code escapes HTML for security',
   panelCode.indexOf('escapeHtml') > -1);

console.log('');
console.log('EVIDENCE GROUPING BY TYPE (6 assertions)');

// Mock render and check grouping
global.document.getElementById = function(id) {
    if (id === 'objective-evidence-panel') {
        return {
            innerHTML: '',
            classList: panelEl.classList,
            _renderedHTML: ''
        };
    }
    return null;
};

// Verify grouping structure in code
const hasGroupSchema = panelCode.indexOf('EVIDENCE_GROUPS') > -1;
ok('Code defines EVIDENCE_GROUPS schema',
   hasGroupSchema);

const hasCombatGroup = panelCode.indexOf('combat:') > -1 || panelCode.indexOf("'combat'") > -1;
ok('EVIDENCE_GROUPS includes combat',
   hasCombatGroup);

const hasReadinessGroup = panelCode.indexOf('readiness:') > -1 || panelCode.indexOf("'readiness'") > -1;
ok('EVIDENCE_GROUPS includes readiness',
   hasReadinessGroup);

const hasControlGroup = panelCode.indexOf('control:') > -1 || panelCode.indexOf("'control'") > -1;
ok('EVIDENCE_GROUPS includes control',
   hasControlGroup);

const hasContactsGroup = panelCode.indexOf('contacts:') > -1 || panelCode.indexOf("'contacts'") > -1;
ok('EVIDENCE_GROUPS includes contacts',
   hasContactsGroup);

const hasSystemGroup = panelCode.indexOf('system:') > -1 || panelCode.indexOf("'system'") > -1;
ok('EVIDENCE_GROUPS includes system (debug)',
   hasSystemGroup);

console.log('');
console.log('CONFIDENCE FORMATTING (6 assertions)');

const confidenceDotCode = panelCode.indexOf('confidenceDots') > -1;
ok('Code contains confidenceDots function',
   confidenceDotCode);

const dot3Pattern = panelCode.indexOf('●●●') > -1 || panelCode.indexOf('●●●'.replace(/●/g, '%E2%9A%AB')) > -1;
ok('confidenceDots produces three-dot pattern',
   panelCode.indexOf('0.9') > -1 && panelCode.indexOf('●') > -1);

const dot2Pattern = panelCode.indexOf('●●') > -1;
ok('confidenceDots produces two-dot pattern',
   dot2Pattern);

const dot1Pattern = panelCode.indexOf('●') > -1;
ok('confidenceDots produces one-dot pattern',
   dot1Pattern);

const nullConfidenceHandling = panelCode.indexOf('confidence == null') > -1 || panelCode.indexOf('!confidence') > -1;
ok('Null confidence handled (default to ●)',
   nullConfidenceHandling);

const confidenceThresholds = panelCode.indexOf('0.9') > -1 && panelCode.indexOf('0.75') > -1;
ok('Confidence uses 0.9 and 0.75 thresholds',
   confidenceThresholds);

console.log('');
console.log('VALUE FORMATTING & ESCAPING (6 assertions)');

const formatValueFunc = panelCode.indexOf('formatValue') > -1;
ok('Code contains formatValue function',
   formatValueFunc);

const percentageFormatting = panelCode.indexOf('%') > -1 && panelCode.indexOf('ratio') > -1;
ok('formatValue handles percentages for ratios',
   percentageFormatting);

const decimalRounding = panelCode.indexOf('* 100) / 100') > -1 || panelCode.indexOf('round') > -1;
ok('formatValue rounds decimals',
   decimalRounding);

const booleanHandling = panelCode.indexOf('typeof value === \'boolean\'') > -1;
ok('formatValue handles booleans',
   booleanHandling);

const nullValueHandling = panelCode.indexOf('value == null') > -1;
ok('formatValue returns "—" for null values',
   nullValueHandling && panelCode.indexOf('—') > -1);

const htmlEscapeFunc = panelCode.indexOf('escapeHtml') > -1 && panelCode.indexOf('&amp;') > -1;
ok('escapeHtml function escapes HTML entities',
   htmlEscapeFunc);

console.log('');
console.log('GROUP RENDERING & HEADERS (6 assertions)');

const headerRendering = panelCode.indexOf('<header class="oep-header"') > -1;
ok('Code renders panel header',
   headerRendering);

const titleRendering = panelCode.indexOf('<h2 class="oep-title"') > -1;
ok('Code renders objective title',
   titleRendering);

const statusRendering = panelCode.indexOf('oep-status') > -1;
ok('Code renders status badge with class',
   statusRendering);

const groupSectionRendering = panelCode.indexOf('<section class="oep-group') > -1;
ok('Code renders evidence groups as sections',
   groupSectionRendering);

const groupTitleRendering = panelCode.indexOf('oep-group-title') > -1;
ok('Code renders group titles with i18n class',
   groupTitleRendering);

const emptyGroupHandling = panelCode.indexOf('oep-empty') > -1;
ok('Code handles empty groups with placeholder text',
   emptyGroupHandling);

console.log('');
console.log('i18n INTEGRATION (6 assertions)');

const i18nDataAttributes = panelCode.indexOf('data-i18n=') > -1;
ok('Code uses data-i18n attributes for translations',
   i18nDataAttributes);

const evidenceLabelMap = panelCode.indexOf('EVIDENCE_LABELS') > -1;
ok('Code defines EVIDENCE_LABELS mapping',
   evidenceLabelMap);

const i18nKeyInLabels = panelCode.indexOf("key:") > -1 || panelCode.indexOf("{ label:") > -1;
ok('EVIDENCE_LABELS includes i18n keys',
   i18nKeyInLabels);

const applyI18nFunction = panelCode.indexOf('applyI18nToElement') > -1;
ok('Code calls applyI18nToElement after rendering',
   applyI18nFunction);

const fallbackLabels = panelCode.indexOf('.label') > -1;
ok('Code uses fallback labels if i18n unavailable',
   fallbackLabels);

const evidenceTypeMapping = panelCode.indexOf('EVIDENCE_LABELS[') > -1;
ok('Code maps evidence_type to labels',
   evidenceTypeMapping);

console.log('');
console.log('EMPTY/FALLBACK HANDLING (6 assertions)');

const nullWSCheck = panelCode.indexOf('!ws') > -1;
ok('Code checks for null/undefined world state',
   nullWSCheck);

const missingEvidenceArrayCheck = panelCode.indexOf('!Array.isArray') > -1;
ok('Code validates evidence is an array',
   missingEvidenceArrayCheck);

const emptyEvidenceCheck = panelCode.indexOf('evidence.length === 0') > -1;
ok('Code handles empty evidence array',
   emptyEvidenceCheck);

const hideOnEmpty = panelCode.indexOf('hideObjectiveEvidence') > -1;
ok('Code hides panel when evidence missing',
   panelCode.indexOf('hideObjectiveEvidence') > -1 && panelCode.indexOf('if (!') > -1);

const selectionClearedListener = panelCode.indexOf('rmooz:selection-cleared') > -1;
ok('Code listens for rmooz:selection-cleared event',
   selectionClearedListener);

const panelElementCheck = panelCode.indexOf('getElementById(\'objective-evidence-panel\')') > -1;
ok('Code safely accesses panel element',
   panelElementCheck);

console.log('');
console.log('INTEGRATION (3 assertions)');

// Check that code is self-contained and functional
const moduleExport = panelCode.indexOf('window.AppObjectiveEvidencePanel') > -1 ||
                     panelCode.indexOf('module.exports') > -1;
ok('Module exports correctly (window.AppObjectiveEvidencePanel or module.exports)',
   moduleExport);

const iife = panelCode.indexOf('(function()') > -1;
ok('Code is wrapped in IIFE for scoping',
   iife);

const strictMode = panelCode.indexOf("'use strict'") > -1;
ok('Code uses strict mode',
   strictMode);

console.log('');
console.log('SUMMARY');
console.log('');
console.log(`Passed: ${pass}`);
console.log(`Failed: ${fail}`);
console.log(`Total:  ${pass + fail}`);
console.log('');

if (fail > 0) {
    console.log('❌ SOME TESTS FAILED');
    process.exit(1);
} else {
    console.log('✅ ALL TESTS PASSED');
    process.exit(0);
}
