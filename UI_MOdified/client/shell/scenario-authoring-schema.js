/**
 * RMOOZ Scenario Authoring Foundation (P0).
 *
 * PURE data/schema utilities for the future Scenario Authoring Mode. This module
 * has NO DOM, NO fetch, NO storage, NO map, NO simulation, NO AI, and performs NO
 * mutation of live scenario state. It does NOT touch the read-only Review/Playback
 * mode and does NOT lift the locked AI/sim no-mutation boundary — it only DESCRIBES,
 * TEMPLATES, GAP-FILLS (on copies), DIAGNOSES, and SAFETY-CHECKS scenario *data*.
 *
 * Honest placeholders are used for any operational field RMOOZ does not model or
 * know — never fabricated weapons / ammo / fuel / damage / detection / casualties.
 *
 * Dual export: window.AppScenarioAuthoring (browser, console-testable) +
 * module.exports (Node tests). Loads cleanly in pure Node (no browser globals).
 */
(function (factory) {
    'use strict';
    var api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.AppScenarioAuthoring = api;
})(function () {
    'use strict';

    var SCHEMA_VERSION = 'rmooz-authoring-v0.1';

    // Honest placeholder values — used wherever RMOOZ does not model/know a field.
    var V = Object.freeze({
        UNKNOWN: 'unknown',
        NOT_ASSIGNED: 'not_assigned',
        NOT_MODELED: 'not_modeled',
        MANUAL_REQUIRED: 'manual_required',
        NOT_AVAILABLE: 'not_available'
    });

    // ── 1. Canonical authoring schema descriptor ────────────────────────────
    // Each section: importance, how it is defaulted, whether it counts as a gap,
    // and how it is recognised in a raw scenario (live/internal OR authoring shape).
    //   defaultKind: 'standard'    — structural default (identities/relationships),
    //                                NOT combat data (sides, posture, provenance);
    //                'empty'       — empty collection the operator fills;
    //                'skeleton'    — fields present, values = MANUAL_REQUIRED (doctrine);
    //                'not_modeled' — RMOOZ does not model this; honest placeholder.
    var SECTIONS = Object.freeze([
        { key: 'metadata',     label: 'Metadata',                        importance: 'required',    defaultKind: 'standard',    gapEligible: true  },
        { key: 'sides',        label: 'Sides',                           importance: 'required',    defaultKind: 'standard',    gapEligible: true  },
        { key: 'posture',      label: 'Posture matrix',                  importance: 'required',    defaultKind: 'standard',    gapEligible: true  },
        { key: 'units',        label: 'Units (order of battle)',         importance: 'required',    defaultKind: 'empty',       gapEligible: true  },
        { key: 'orbat',        label: 'ORBAT',                           importance: 'recommended', defaultKind: 'empty',       gapEligible: false },
        { key: 'objectives',   label: 'Objectives',                      importance: 'required',    defaultKind: 'empty',       gapEligible: true  },
        { key: 'bls',          label: 'BLS / reference points',          importance: 'recommended', defaultKind: 'empty',       gapEligible: true  },
        { key: 'phases',       label: 'Phases / timeline',               importance: 'required',    defaultKind: 'empty',       gapEligible: true  },
        { key: 'missions',     label: 'Missions',                        importance: 'recommended', defaultKind: 'empty',       gapEligible: true  },
        { key: 'events',       label: 'Events',                          importance: 'recommended', defaultKind: 'empty',       gapEligible: true  },
        { key: 'doctrine',     label: 'Doctrine / ROE / EMCON',          importance: 'recommended', defaultKind: 'skeleton',    gapEligible: true  },
        { key: 'capabilities', label: 'Unit capability profiles',        importance: 'optional',    defaultKind: 'not_modeled', gapEligible: true  },
        { key: 'logistics',    label: 'Logistics state',                 importance: 'optional',    defaultKind: 'not_modeled', gapEligible: true  },
        { key: 'attrition',    label: 'Damage / attrition state',        importance: 'optional',    defaultKind: 'not_modeled', gapEligible: true  },
        { key: 'detection',    label: 'Detection / contact state',       importance: 'optional',    defaultKind: 'not_modeled', gapEligible: true  },
        { key: 'provenance',   label: 'Source / confidence / provenance', importance: 'recommended', defaultKind: 'standard',   gapEligible: true  },
        { key: 'validation',   label: 'Validation diagnostics',          importance: 'optional',    defaultKind: 'empty',       gapEligible: false }
    ]);

    function nonEmptyArr(a) { return Array.isArray(a) && a.length > 0; }
    function nonEmptyObj(o) { return o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o).length > 0; }

    // Recognise an authoring section in a RAW scenario (internal/live OR authoring shape).
    function sectionPresent(scenario, key) {
        if (!scenario || typeof scenario !== 'object') return false;
        switch (key) {
            case 'metadata':     return !!(scenario.scenario_id || scenario.name || scenario.scenario_label || nonEmptyObj(scenario.metadata));
            case 'sides':        return nonEmptyArr(scenario.sides) || nonEmptyObj(scenario.sides);
            case 'posture':      return nonEmptyObj(scenario.postures) || nonEmptyObj(scenario.posture);
            case 'units':        return nonEmptyArr(scenario.units) || nonEmptyArr(scenario.red_units) || nonEmptyArr(scenario.blue_units_initial);
            case 'orbat':        return nonEmptyObj(scenario.orbat) || nonEmptyArr(scenario.red_units) || nonEmptyArr(scenario.blue_units_initial);
            case 'objectives':   return nonEmptyArr(scenario.objectives) || nonEmptyObj(scenario.obj);
            case 'bls':          return nonEmptyArr(scenario.bls_template) || nonEmptyArr(scenario.bls);
            case 'phases':       return nonEmptyArr(scenario.phase_table) || nonEmptyArr(scenario.phases) || nonEmptyArr(scenario.steps);
            case 'missions':     return nonEmptyArr(scenario.missions);
            case 'events':       return nonEmptyArr(scenario.events);
            case 'doctrine':     return nonEmptyObj(scenario.doctrine);
            case 'capabilities': return nonEmptyArr(scenario.unit_capabilities) || nonEmptyObj(scenario.capabilities);
            case 'logistics':    return nonEmptyObj(scenario.logistics);
            case 'attrition':    return nonEmptyObj(scenario.attrition) || nonEmptyObj(scenario.damage_state);
            case 'detection':    return nonEmptyObj(scenario.detection) || nonEmptyObj(scenario.contact_state);
            case 'provenance':   return !!(scenario.ported_from || scenario.ported_at || scenario.model_version || scenario.blue_units_source || nonEmptyObj(scenario.provenance));
            case 'validation':   return nonEmptyObj(scenario.validation);
            default:             return false;
        }
    }

    // ── 2. Standard scenario authoring template ─────────────────────────────
    function defaultMetadata() {
        return {
            scenario_id: V.NOT_ASSIGNED, scenario_label: V.NOT_ASSIGNED,
            model_version: V.UNKNOWN, period: V.UNKNOWN, producer: V.UNKNOWN,
            language: ['en', 'ar'], authoring_status: 'draft'
        };
    }
    function defaultSides() {
        // Structural identities only — NOT combat data.
        return [
            { id: 'BLUE',    name_en: 'Blue Force', name_ar: 'القوة الزرقاء', role: 'friendly', color: '#3a7bd5' },
            { id: 'RED',     name_en: 'Red Force',  name_ar: 'القوة الحمراء', role: 'hostile',  color: '#d54a3a' },
            { id: 'NEUTRAL', name_en: 'Neutral',    name_ar: 'محايد',         role: 'neutral',  color: '#c9a23a' }
        ];
    }
    function defaultPosture() {
        // Directional relationship matrix posture[from][to].
        return {
            BLUE:    { BLUE: 'FRIENDLY', RED: 'HOSTILE',  NEUTRAL: 'NEUTRAL' },
            RED:     { BLUE: 'HOSTILE',  RED: 'FRIENDLY', NEUTRAL: 'NEUTRAL' },
            NEUTRAL: { BLUE: 'NEUTRAL',  RED: 'NEUTRAL',  NEUTRAL: 'FRIENDLY' }
        };
    }
    function defaultDoctrineSkeleton() {
        // Skeleton ONLY — no invented ROE claims. Operator must set each value.
        return {
            weapon_control_status: V.MANUAL_REQUIRED,
            emcon: V.MANUAL_REQUIRED,
            roe: V.MANUAL_REQUIRED,
            engage_ambiguous: V.MANUAL_REQUIRED,
            withdraw_on_fuel_state: V.MANUAL_REQUIRED,
            overrides: []
        };
    }
    function notModeled(note) { return { state: V.NOT_MODELED, note: note || V.NOT_MODELED }; }
    function defaultProvenance() {
        return { source: V.UNKNOWN, confidence: V.UNKNOWN, producer: V.UNKNOWN, generated_by_ai: false, created_at: V.UNKNOWN };
    }

    function buildStandardScenarioAuthoringTemplate(options) {
        options = options || {};
        return {
            schemaVersion: SCHEMA_VERSION,
            authoringMode: true,
            reviewModeCompatible: true,
            liveMutationAllowed: false,
            aiCommitAllowed: false,
            operatorEditable: true,
            metadata: defaultMetadata(),
            sides: defaultSides(),
            posture: defaultPosture(),
            units: [],
            orbat: { roots: [], note: V.MANUAL_REQUIRED },
            objectives: [],
            bls: [],
            phases: [],
            missions: [],
            events: [],
            doctrine: defaultDoctrineSkeleton(),
            capabilities: notModeled('Unit capability profiles are not modeled by RMOOZ; author manually if required.'),
            logistics: notModeled('Logistics state is not modeled by RMOOZ.'),
            attrition: notModeled('Damage / attrition state is not modeled (no fabricated combat outputs).'),
            detection: notModeled('Detection / contact state is not modeled by RMOOZ.'),
            provenance: defaultProvenance(),
            validation: { passed: null, gaps: [], note: 'Run diagnoseScenarioAuthoringGaps()' }
        };
    }

    // ── 3. Gap-fill defaulter ───────────────────────────────────────────────
    function deepCopy(o) { return (o == null) ? o : JSON.parse(JSON.stringify(o)); }

    function fillScenarioAuthoringGaps(scenario, options) {
        options = options || {};
        var src = (scenario && typeof scenario === 'object') ? scenario : {};
        var out = deepCopy(src);                       // never mutate the input
        var template = buildStandardScenarioAuthoringTemplate(options);
        var mark = { source: 'standard_template', confidence: 'template', operator_editable: true, requires_review: true };

        var authoring = {
            schemaVersion: SCHEMA_VERSION,
            authoringMode: true,
            reviewModeCompatible: true,
            liveMutationAllowed: false,
            aiCommitAllowed: false,
            operatorEditable: true,
            defaulted: {},   // sectionKey -> mark + defaultKind
            preserved: []    // sections already present in the input (untouched)
        };

        SECTIONS.forEach(function (sec) {
            var key = sec.key;
            if (sectionPresent(src, key)) { authoring.preserved.push(key); return; }
            // Missing section → add the standard/empty/skeleton/not_modeled default
            // under its authoring key WITHOUT overwriting any existing scenario field.
            if (!(key in out)) out[key] = deepCopy(template[key]);
            authoring.defaulted[key] = { source: mark.source, confidence: mark.confidence, operator_editable: mark.operator_editable, requires_review: mark.requires_review, defaultKind: sec.defaultKind };
            // Stamp provenance into object-shaped defaulted sections too (arrays can't carry it).
            if (out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
                out[key]._authoring = { source: mark.source, confidence: mark.confidence, operator_editable: mark.operator_editable, requires_review: mark.requires_review };
            }
        });

        out._authoring = authoring;
        return out;
    }

    // ── 4. Gap diagnostics ──────────────────────────────────────────────────
    function diagnoseScenarioAuthoringGaps(scenario) {
        var gaps = [], warnings = [];
        SECTIONS.forEach(function (sec) {
            if (!sec.gapEligible) return;
            if (sectionPresent(scenario, sec.key)) return;
            var severity = (sec.importance === 'required') ? 'high'
                : (sec.defaultKind === 'not_modeled') ? 'info'
                : 'medium';
            gaps.push({
                section: sec.key, label: sec.label, importance: sec.importance,
                severity: severity, defaultKind: sec.defaultKind,
                message: sec.label + ' missing — ' + (sec.defaultKind === 'not_modeled'
                    ? 'not modeled by RMOOZ (author manually if required)'
                    : 'standard default available; operator review required')
            });
        });
        // Soft quality notes (present-but-partial).
        if (sectionPresent(scenario, 'provenance') && !nonEmptyObj(scenario.provenance) && !scenario.model_version) {
            warnings.push({ section: 'provenance', message: 'Provenance present but confidence/source not fully stated.' });
        }
        if (sectionPresent(scenario, 'sides') && !(nonEmptyObj(scenario.postures) || nonEmptyObj(scenario.posture))) {
            warnings.push({ section: 'posture', message: 'Sides are present but no posture matrix is defined.' });
        }
        var highCount = gaps.filter(function (g) { return g.severity === 'high'; }).length;
        var passed = highCount === 0;
        var summary = (gaps.length === 0)
            ? 'No authoring gaps. ' + warnings.length + ' note(s).'
            : gaps.length + ' authoring gap(s) [' + highCount + ' high]: '
                + gaps.map(function (g) { return g.section; }).join(', ')
                + (warnings.length ? ' · ' + warnings.length + ' note(s)' : '')
                + ' — operator review required.';
        return { passed: passed, gaps: gaps, warnings: warnings, summary: summary };
    }

    // ── 5. Validation / safety guard ────────────────────────────────────────
    // Rejects backend URLs, fetch/exec instructions, scripts/lua, auto-apply flags,
    // aiCommitAllowed/liveMutationAllowed=true, and executable/hidden-result content.
    var FORBIDDEN_KEYS = [
        'lua', 'script', 'scripts', 'executable', 'execute', 'executenow', 'applynow',
        'commitnow', 'autoapply', 'gate7approved', 'backendurl', 'fetchurl', 'apiurl',
        'urltofetch', 'storagekey', 'localstorage', 'sessionstorage', 'indexeddb',
        'simulationresult', 'hiddensimulationresult', 'combatresult', 'committedresult'
    ];
    var FLAG_TRUE_KEYS = [
        'aicommitallowed', 'livemutationallowed', 'autoapply', 'applynow', 'commitnow',
        'executenow', 'gate7approved', 'autoexecute', 'autocommit'
    ];
    var FORBIDDEN_VALUE_RE = /(https?:\/\/[^\s"']+|\bfetch\s*\(|\bXMLHttpRequest\b|=>\s*[\({]|\bfunction\s*\(|\.lua\b|<\s*script|\beval\s*\()/i;
    function normKey(k) { return String(k).toLowerCase().replace(/[^a-z0-9]/g, ''); }

    function isScenarioAuthoringDraftSafe(draft) {
        var violations = [];
        var seen = [];
        function walk(node, path) {
            if (node == null) return;
            if (typeof node === 'string') {
                if (FORBIDDEN_VALUE_RE.test(node)) violations.push('unsafe value @ ' + path);
                return;
            }
            if (typeof node !== 'object') return;
            if (seen.indexOf(node) !== -1) return; // cycle guard
            seen.push(node);
            Object.keys(node).forEach(function (k) {
                var nk = normKey(k);
                if (FORBIDDEN_KEYS.indexOf(nk) !== -1) violations.push('forbidden key "' + k + '" @ ' + path);
                if (FLAG_TRUE_KEYS.indexOf(nk) !== -1 && node[k] === true) violations.push('forbidden flag "' + k + '"=true @ ' + path);
                walk(node[k], path + '.' + k);
            });
        }
        try { walk(draft, '$'); } catch (e) { violations.push('walk error: ' + (e && e.message)); }
        violations = violations.filter(function (v, i, a) { return a.indexOf(v) === i; });
        return { safe: violations.length === 0, violations: violations };
    }

    // ── 6. Exports ───────────────────────────────────────────────────────────
    return {
        SCHEMA_VERSION: SCHEMA_VERSION,
        PLACEHOLDERS: V,
        AUTHORING_SECTIONS: SECTIONS,
        sectionPresent: sectionPresent,
        buildStandardScenarioAuthoringTemplate: buildStandardScenarioAuthoringTemplate,
        fillScenarioAuthoringGaps: fillScenarioAuthoringGaps,
        diagnoseScenarioAuthoringGaps: diagnoseScenarioAuthoringGaps,
        isScenarioAuthoringDraftSafe: isScenarioAuthoringDraftSafe
    };
});
