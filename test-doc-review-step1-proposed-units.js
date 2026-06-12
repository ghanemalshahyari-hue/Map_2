#!/usr/bin/env node
/*
 * Review UI smoke test for Step 1 task assembly and proposed RED units.
 */
'use strict';

const path = require('path');
global.window = {};

const ADAPTER = require(path.join(__dirname, 'UI_MOdified/server/ai/mdmp-external-adapter'));
const B = require(path.join(__dirname, 'UI_MOdified/server/ai/operational-brief'));
require(path.join(__dirname, 'UI_MOdified/client/shell/placement-candidates-panel.js'));
require(path.join(__dirname, 'UI_MOdified/client/shell/doc-understanding-review.js'));

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

const input = {
    task_assembly: {
        summary: '\u062a\u062c\u0645\u064a\u0639 \u0627\u0644\u0648\u0627\u062c\u0628 \u0627\u0644\u0623\u0648\u0644\u064a',
        main_task: '\u062d\u0645\u0627\u064a\u0629 \u0642\u0637\u0631',
        supporting_tasks: [{ unit: '\u0633\u0631\u0628', duty: '\u0645\u0631\u0627\u0642\u0628\u0629' }],
    },
    Units_Duty: '\u0648\u0627\u062c\u0628 \u0639\u0627\u0645',
    doctrine_upload_required: true,
    doctrine_sources: ['pending_upload'],
    doctrine_application_policy: 'operator_uploaded_doctrine_required_before_final_tasking',
    enemy_forces: {
        air_bases: [{
            base_name_ar: '\u0642\u0627\u0639\u062f\u0629 \u0627\u0644\u0634\u0647\u064a\u062f \u0646\u0648\u062c\u0647 / \u0647\u0645\u062f\u0627\u0646',
            base_name_en: 'Shahid Nojeh / Hamedan',
            lat: 35.2116,
            lon: 48.6534,
            units: [
                { platform: 'F-14A Tomcat', estimated_count: 24, type_ar: 'figter' },
                { platform: 'F-4D/E Phantom II', estimated_count: 12, type_ar: 'fighter' },
            ],
        }, {
            base_name_ar: '\u0645\u0637\u0627\u0631 \u0645\u0647\u0631\u0622\u0628\u0627\u062f',
            base_name_en: 'Mehrabad',
            lat: 35.6892,
            lon: 51.3134,
            units: [{ platform: 'F-5E Tiger II', estimated_count: 18, type_ar: 'fighter' }],
        }, {
            base_name_ar: '\u0642\u0627\u0639\u062f\u0629 \u0628\u0648\u0634\u0647\u0631',
            base_name_en: 'Bushehr',
            lat: 28.9448,
            lon: 50.8346,
            units: [{ platform: 'F-4E Phantom II', estimated_count: 10, type_ar: 'fighter' }],
        }, {
            base_name_ar: '\u0642\u0627\u0639\u062f\u0629 \u0628\u0646\u062f\u0631 \u0639\u0628\u0627\u0633',
            base_name_en: 'Bandar Abbas',
            lat: 27.2183,
            lon: 56.3778,
            units: [{ platform: 'Su-22', estimated_count: 8, type_ar: '\u0645\u0642\u0627\u062a\u0644\u0629 / \u0637\u0627\u0626\u0631\u0629' }],
        }, {
            base_name_ar: '\u0643\u0646\u0627\u0631\u0643 / \u062a\u0634\u0627\u0628\u0647\u0627\u0631',
            base_name_en: 'Konarak / Chabahar',
            lat: 25.4433,
            lon: 60.3821,
            units: [{ platform: 'P-3F Orion', estimated_count: 4, type_ar: '\u0637\u0627\u0626\u0631\u0629' }],
        }],
    },
    Assembly_Area: '40RCN596875',
};

const out = ADAPTER.adaptMdmpBundle([{ filename: 'qatar-iran-step1.jsonc', data: input }]);
out.understanding = B.understandingFromBrief(B.normalizeBrief(out.brief));

const container = {
    innerHTML: '',
    style: {},
    querySelector: function () { return null; },
};

window.RmoozDocReview.render(container, out, {});
const html = container.innerHTML;
const caps = window.RmoozDocReview.assessReviewPayloadCapabilities(out);

assert(caps.status === 'map_ready', 'full Step 1 capability status map_ready');
assert(caps.map_preview_ready === true, 'full Step 1 map preview ready');
assert(caps.text_preview_ready === true, 'full Step 1 text preview ready');
assert(html.indexOf('\u062a\u062c\u0645\u064a\u0639 \u0627\u0644\u0648\u0627\u062c\u0628') !== -1 && html.indexOf('Task Assembly') !== -1, 'task assembly section');
assert(html.indexOf('\u0648\u0627\u062c\u0628\u0627\u062a \u0627\u0644\u0648\u062d\u062f\u0627\u062a') !== -1 && html.indexOf('Units Duty') !== -1, 'Units Duty section');
assert(html.indexOf('main_task') !== -1 && html.indexOf('supporting_tasks') !== -1, 'task assembly fields');
assert(html.indexOf('pending_upload') !== -1, 'doctrine source');
assert(html.indexOf('operator_uploaded_doctrine_required_before_final_tasking') !== -1, 'doctrine policy');
assert(html.indexOf('\u0627\u0644\u0639\u0642\u064a\u062f\u0629 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629') !== -1 && html.indexOf('Doctrine Required') !== -1, 'Doctrine Required section');
assert(html.indexOf('\u0644\u0627 \u064a\u062a\u0645 \u0627\u0639\u062a\u0645\u0627\u062f \u0627\u0644\u062a\u062e\u0637\u064a\u0637 \u0627\u0644\u0646\u0647\u0627\u0626\u064a \u062f\u0648\u0646 \u0631\u0641\u0639 \u0627\u0644\u0639\u0642\u064a\u062f\u0629 \u0648\u0645\u0631\u0627\u062c\u0639\u062a\u0647\u0627.') !== -1, 'doctrine gate label');
assert(html.indexOf('\u0642\u0648\u0627\u062a \u0627\u0644\u0639\u062f\u0648 \u0627\u0644\u0645\u0646\u0638\u0645\u0629') !== -1 && html.indexOf('Enemy Force Structure') !== -1, 'enemy force structure section');
assert(html.indexOf('\u0642\u0648\u0627\u0639\u062f \u0648\u0645\u0637\u0627\u0631\u0627\u062a \u0627\u0644\u0639\u062f\u0648') !== -1 && html.indexOf('Enemy Bases') !== -1, 'enemy bases section');
assert(html.indexOf('BLUE 0 / RED 6 / NEUTRAL 0') !== -1, 'RED count shown');
assert(html.indexOf('F-14A Tomcat') !== -1 && html.indexOf('24') !== -1, 'F-14 card');
assert(html.indexOf('F-4D/E Phantom II') !== -1 && html.indexOf('12') !== -1, 'F-4 card');
['Shahid Nojeh', 'Mehrabad', 'Bushehr', 'Bandar Abbas', 'Konarak / Chabahar'].forEach(name => {
    assert(html.indexOf(name) !== -1, name + ' base shown');
});
['18', '10', '8', '4'].forEach(count => assert(html.indexOf(count) !== -1, 'count ' + count + ' shown'));
assert(html.indexOf('35.2116, 48.6534') !== -1, 'coordinates shown');
assert(html.indexOf('site_type') !== -1 && html.indexOf('air_base') !== -1, 'site_type shown');
assert(html.indexOf('source_type') !== -1 && html.indexOf('ai_candidate_from_external_llm') !== -1, 'source type shown');
assert(html.indexOf('base_known_exact_unit_position_unknown') !== -1, 'warning shown');
assert(html.indexOf('AI information requires review') !== -1, 'AI review warning');
assert(html.indexOf('Accept') === -1 && html.indexOf('Reject') === -1, 'no Accept/Reject controls');
assert(html.indexOf('template/partial planning guide') === -1, 'full Step 1 input does not show partial/template warning');
assert(html.indexOf('Input capability check') !== -1, 'full Step 1 shows generic capability check');
assert(html.indexOf('Map preview') !== -1 && html.indexOf('ready') !== -1, 'full Step 1 capability box shows map ready');
assert(html.indexOf('data-act="preview"') !== -1, 'full Step 1 input still shows Preview Decision Steps');

const fullSnap = JSON.stringify(out.brief.operational_brief.proposed_units);
window.RmoozDocReview.render({ innerHTML: '', style: {}, querySelector: function () { return null; } }, out, {});
assert(JSON.stringify(out.brief.operational_brief.proposed_units) === fullSnap, 'full payload not mutated by render');

const rawValidUnits = [];
for (let i = 1; i <= 76; i++) {
    rawValidUnits.push({
        id: 'RED-RAW-' + i,
        side: 'RED',
        platform: 'RED trial platform ' + i,
        estimated_count: 1,
        base_name_en: 'Nested RED Base ' + ((i % 32) + 1),
        lat: 25 + (i / 1000),
        lon: 51 + (i / 1000),
    });
}
for (let i = 1; i <= 7; i++) {
    rawValidUnits.push({
        id: 'BLUE-RAW-' + i,
        side: 'BLUE',
        platform: 'BLUE trial platform ' + i,
        estimated_count: 1,
        base_name_en: 'BLUE Trial Anchor ' + i,
        lat: 24 + (i / 1000),
        lon: 52 + (i / 1000),
    });
}
const rawValidBases = [];
for (let i = 1; i <= 32; i++) {
    rawValidBases.push({
        base_name_ar: '\u0642\u0627\u0639\u062f\u0629 \u062a\u062c\u0631\u064a\u0628 \u0645\u062a\u062f\u0627\u062e\u0644\u0629 ' + i,
        base_name_en: 'Nested RED Base ' + i,
        lat: 26 + (i / 100),
        lon: 50 + (i / 100),
        site_type: i <= 11 ? 'air_base' : (i <= 20 ? 'naval_base' : 'land_base'),
    });
}
const rawValidPlacements = [];
for (let i = 1; i <= 36; i++) {
    rawValidPlacements.push({
        mention: 'Raw placement candidate ' + i,
        side: i <= 7 ? 'BLUE' : 'RED',
        site_type: i <= 11 ? 'air_base' : 'known_base',
        lat: 24 + (i / 100),
        lon: 51 + (i / 100),
        exact_unit_position: false,
    });
}
const rawValidStep1 = {
    task_assembly: {
        summary: 'Raw valid Step 1 task assembly',
        main_task: 'Review UAE/Iran trial posture',
        supporting_tasks: [{ unit: 'air component', duty: 'confirm posture' }],
    },
    proposed_units: rawValidUnits,
    placement_candidates: rawValidPlacements,
    enemy_forces: {
        bases: rawValidBases,
        air_bases: rawValidBases.slice(0, 11),
        naval_bases: rawValidBases.slice(11, 20),
        land_bases: rawValidBases.slice(20),
    },
    doctrine_upload_required: true,
};
const rawValidSnap = JSON.stringify(rawValidStep1);
const rawValidContainer = {
    innerHTML: '',
    style: {},
    querySelector: function () { return null; },
};
window.RmoozDocReview.render(rawValidContainer, rawValidStep1, {});
const rawValidHtml = rawValidContainer.innerHTML;
const rawValidCaps = window.RmoozDocReview.assessReviewPayloadCapabilities(rawValidStep1);

assert(rawValidCaps.status === 'map_ready', 'raw valid Step 1 capability status map_ready');
assert(rawValidCaps.proposed_unit_count === 83, 'raw valid Step 1 capability counts 83 units');
assert(rawValidCaps.placement_candidate_count === 36, 'raw valid Step 1 capability counts 36 placement candidates');
assert(rawValidCaps.enemy_base_count === 32, 'raw valid Step 1 capability counts 32 nested RED bases');
assert(rawValidHtml.indexOf('BLUE 7 / RED 76 / NEUTRAL 0') !== -1, 'raw valid Step 1 shows 83 proposed units');
assert(rawValidHtml.indexOf('RED bases') !== -1 && rawValidHtml.indexOf('<b>32</b>') !== -1, 'raw valid Step 1 shows 32 nested RED bases');
assert(rawValidHtml.indexOf('Nested RED Base 1') !== -1, 'raw valid Step 1 renders nested enemy_forces.bases');
assert(rawValidHtml.indexOf('template/partial planning guide') === -1, 'raw valid Step 1 does not show partial/template warning');
assert(rawValidHtml.indexOf('data-act="preview"') !== -1, 'raw valid Step 1 enables Preview Decision Steps');
assert(window.RmoozPlacementPanel.hasCandidates(rawValidStep1), 'raw valid Step 1 placement panel reads top-level placement_candidates');
assert(window.RmoozPlacementPanel.hasCandidates({ brief: { operational_brief: rawValidStep1 } }), 'placement panel reads analyzed operational_brief placement_candidates');
assert(JSON.stringify(rawValidStep1) === rawValidSnap, 'raw valid Step 1 payload not mutated by render');

const partialInput = {
    letter_ref_number: '<\u0631\u0642\u0645 \u0627\u0644\u0645\u0631\u062c\u0639>',
    task_assembly: '\u064a\u0635\u062f\u0631 \u0644\u0627\u062d\u0642\u0627\u064b',
    Units_Duty: '<\u0648\u0627\u062c\u0628\u0627\u062a \u0623\u0648\u0644\u064a\u0629>',
    doctrine_upload_required: true,
    doctrine_sources: ['pending_upload'],
    doctrine_application_policy: 'operator_uploaded_doctrine_required_before_final_tasking',
    Assembly_Area: 'R CN 64215 7114840',
    join_op_mission: '<\u0627\u0644\u0645\u0647\u0645\u0629>',
};
const partialOut = ADAPTER.adaptMdmpBundle([{ filename: 'step1-template-guide.json', data: partialInput }]);
partialOut.understanding = B.understandingFromBrief(B.normalizeBrief(partialOut.brief));
const partialSnap = JSON.stringify(partialOut.brief);
const partialContainer = {
    innerHTML: '',
    style: {},
    querySelector: function () { return null; },
};
window.RmoozDocReview.render(partialContainer, partialOut, {});
const partialHtml = partialContainer.innerHTML;
const partialCaps = window.RmoozDocReview.assessReviewPayloadCapabilities(partialOut);

assert(partialCaps.status === 'text_only' || partialCaps.status === 'insufficient', 'partial/template Step 1 is not map_ready');
assert(partialCaps.map_preview_ready === false, 'partial/template Step 1 map preview not ready');
assert(partialCaps.missing_for_map_preview.indexOf('proposed_units') !== -1, 'partial/template Step 1 missing proposed_units');
assert(partialHtml.indexOf('Input capability check') !== -1, 'partial/template Step 1 shows generic capability check');
assert(partialHtml.indexOf('AI understood the document, but no map-ready units were found') !== -1, 'partial/template Step 1 shows English capability warning');
assert(partialHtml.indexOf('\u0641\u0647\u0645 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a \u0645\u062d\u062a\u0648\u0649 \u0627\u0644\u0645\u0644\u0641') !== -1, 'partial/template Step 1 shows Arabic capability warning');
assert(partialHtml.indexOf('Unit map preview requires proposed_units and placement_candidates') !== -1, 'warning names preview data requirements');
assert(partialHtml.indexOf('Upload the full Step 1 generated output or run deep extraction') !== -1, 'warning recommends full Step 1 or deep extraction');
assert(partialHtml.indexOf('data-act="preview"') === -1, 'partial/template Step 1 disables Preview Decision Steps');
assert(partialHtml.indexOf('data-act="preview-disabled"') !== -1, 'partial/template Step 1 shows disabled Map Preview Not Ready button');
assert(partialHtml.indexOf('Missing / ambiguous') !== -1, 'partial/template Step 1 keeps missing/ambiguous list readable');
assert(partialHtml.indexOf('BLUE 0 / RED 0 / NEUTRAL 0') !== -1, 'partial/template Step 1 still shows honest zero counts');
assert(JSON.stringify(partialOut.brief) === partialSnap, 'partial/template payload not mutated by render');

console.log('  [PASS] Step 1 review UI shows task assembly and proposed RED units');
