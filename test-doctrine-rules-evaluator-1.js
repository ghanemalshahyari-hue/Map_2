'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const Doctrine = require(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'doctrine-rules.js'));
const source = fs.readFileSync(path.join(ROOT, 'UI_MOdified', 'client', 'shell', 'doctrine-rules.js'), 'utf8');

let passed = 0;
let failed = 0;
function ok(label, cond) {
    if (cond) { passed++; console.log('  PASS  ' + label); }
    else { failed++; console.error('  FAIL  ' + label); }
}
function clone(v) { return JSON.parse(JSON.stringify(v)); }
function cleanSource(text) {
    return String(text || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function scenario() {
    return {
        name: 'doc1',
        doctrine_rules: [
            { id: 'disabled-doc', enabled: false, action: 'move', decision: 'block', reason: 'disabled ignored' },
            { id: 'no-fire-zone', action: 'fire', applies_to_side: 'BLUE', decision: 'block', severity: 'critical', reason: 'fires forbidden in zone' },
            { id: 'commander-approval', action: 'jam', applies_to_side: 'BLUE', decision: 'require_approval', requires_authority: 'JTF Commander', reason: 'EW requires commander authority' }
        ],
        roe_rules: [
            { id: 'hostile-confirmed', target_domain: 'air', hostile_confirmed_required: true, decision: 'block', reason: 'hostile confirmation required' },
            { id: 'restricted-area', restricted_area_ids: ['RA-1'], decision: 'require_approval', requires_authority: 'ROE Cell', reason: 'restricted area approval required' }
        ],
        wra_rules: [
            { id: 'confidence', weapon_class: 'SAM', min_confidence: 0.8, decision: 'block', reason: 'confidence below WRA minimum' },
            { id: 'range', weapon_class: 'SAM', max_range_nm: 40, decision: 'block', reason: 'target beyond WRA range' },
            { id: 'cruise-auth', weapon_class: 'CRUISE', decision: 'require_approval', requires_authority: 'JFC', reason: 'cruise weapon release approval required' }
        ]
    };
}

console.log('\n=== DOC1 Doctrine / ROE / WRA evaluator ===\n');

(function () {
    ok('T-1 missing doctrine arrays are backward-compatible',
        Doctrine.normalizeDoctrineRules({}).length === 0 &&
        Doctrine.evaluateDoctrineForAction({}, { action_kind: 'move' }, {}).decision === 'allow' &&
        Doctrine.evaluateWraForWeaponRelease({}, { weapon_class: 'SAM' }, {}).decision === 'require_approval');

    const s = scenario();
    ok('T-2 disabled rule is ignored',
        Doctrine.evaluateDoctrineForAction(s, { side: 'BLUE', action_kind: 'move' }, {}).decision === 'allow');

    ok('T-3 ROE can block engagement without hostile confirmation',
        Doctrine.evaluateRoeForEngagement(s, { target_domain: 'air', target_status: 'unknown', hostile_confirmed: false }, {}).decision === 'block');

    const restricted = Doctrine.evaluateRoeForEngagement(s, { target_domain: 'ground', area_id: 'RA-1', hostile_confirmed: true }, {});
    ok('T-4 ROE can require approval for restricted area',
        restricted.decision === 'require_approval' && restricted.required_authority === 'ROE Cell');

    ok('T-5 WRA can block weapon release below sensor confidence',
        Doctrine.evaluateWraForWeaponRelease(s, { weapon_class: 'SAM', confidence: 0.5, range_nm: 20 }, {}).decision === 'block');

    ok('T-6 WRA can block weapon release beyond max range',
        Doctrine.evaluateWraForWeaponRelease(s, { weapon_class: 'SAM', confidence: 0.9, range_nm: 80 }, {}).decision === 'block');

    const cruise = Doctrine.evaluateWraForWeaponRelease(s, { weapon_class: 'CRUISE', confidence: 1, range_nm: 10 }, {});
    ok('T-7 WRA can require approval by weapon class',
        cruise.decision === 'require_approval' && cruise.required_authority === 'JFC');

    ok('T-8 doctrine rule can block forbidden action',
        Doctrine.evaluateDoctrineForAction(s, { side: 'BLUE', action_kind: 'fire' }, {}).decision === 'block');

    const ew = Doctrine.evaluateDoctrineForAction(s, { side: 'BLUE', action_kind: 'jam' }, {});
    ok('T-9 doctrine rule can require authority',
        ew.decision === 'require_approval' && ew.required_authority === 'JTF Commander');

    const combined = Doctrine.buildDoctrineDecisionSummary([
        Doctrine.evaluateRoeForEngagement(s, { area_id: 'RA-1', hostile_confirmed: true }, {}),
        Doctrine.evaluateWraForWeaponRelease(s, { weapon_class: 'SAM', confidence: 0.5, range_nm: 80 }, {})
    ]);
    ok('T-10 multiple rules aggregate reasons',
        combined.reasons.length >= 2 && combined.matched_rules.length >= 2);
    ok('T-11 most restrictive decision wins: block > require_approval > allow',
        combined.decision === 'block');
})();

(function () {
    const s = scenario();
    const actionContext = { side: 'BLUE', actor_unit_id: 'B1', action_kind: 'fire', target_domain: 'air', weapon_class: 'SAM', range_nm: 20, confidence: 0.9 };
    const runtimeState = { clock: { current_hours: 1 } };
    const before = JSON.stringify({ s, actionContext, runtimeState });
    Doctrine.evaluateDoctrineForAction(s, actionContext, runtimeState);
    Doctrine.evaluateRoeForEngagement(s, actionContext, runtimeState);
    Doctrine.evaluateWraForWeaponRelease(s, actionContext, runtimeState);
    ok('T-12 evaluator does not mutate scenario/actionContext/runtimeState',
        JSON.stringify({ s, actionContext, runtimeState }) === before);

    ok('T-13 no step/snapshot/turn dependency',
        !/(stepIndex|step_index|snapshot|turn-engine|scenario_turn|Next Turn)/.test(cleanSource(source)));

    ok('T-14 browser facade export exists',
        Doctrine.DOC1_VERSION === '1.0.0-doc1-doctrine-rules' &&
        typeof globalThis.AppDoctrineRules === 'object' &&
        typeof globalThis.AppDoctrineRules.evaluateWraForWeaponRelease === 'function');

    ok('T-15 no DOM/backend/map/journal mutation surfaces',
        !/(document\.|querySelector|getElementById|fetch\s*\(|XMLHttpRequest|AppAdjudicatorMap|window\.units|localStorage|indexedDB|appendJournal|journal)/.test(cleanSource(source)));
})();

console.log('\n=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
process.exit(failed ? 1 : 0);
