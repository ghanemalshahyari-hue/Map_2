#!/usr/bin/env node
/*
 * Review UI smoke test for Step 1 task assembly and proposed RED units.
 */
'use strict';

const path = require('path');
global.window = {};

const ADAPTER = require(path.join(__dirname, 'UI_MOdified/server/ai/mdmp-external-adapter'));
const B = require(path.join(__dirname, 'UI_MOdified/server/ai/operational-brief'));
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

assert(html.indexOf('\u062a\u062c\u0645\u064a\u0639 \u0627\u0644\u0648\u0627\u062c\u0628') !== -1 && html.indexOf('Task Assembly') !== -1, 'task assembly section');
assert(html.indexOf('main_task') !== -1 && html.indexOf('supporting_tasks') !== -1, 'task assembly fields');
assert(html.indexOf('pending_upload') !== -1, 'doctrine source');
assert(html.indexOf('operator_uploaded_doctrine_required_before_final_tasking') !== -1, 'doctrine policy');
assert(html.indexOf('\u0644\u0627 \u064a\u062a\u0645 \u0627\u0639\u062a\u0645\u0627\u062f \u0627\u0644\u062a\u062e\u0637\u064a\u0637 \u0627\u0644\u0646\u0647\u0627\u0626\u064a \u062f\u0648\u0646 \u0631\u0641\u0639 \u0627\u0644\u0639\u0642\u064a\u062f\u0629 \u0648\u0645\u0631\u0627\u062c\u0639\u062a\u0647\u0627.') !== -1, 'doctrine gate label');
assert(html.indexOf('\u0627\u0644\u0648\u062d\u062f\u0627\u062a \u0627\u0644\u0645\u0642\u062a\u0631\u062d\u0629') !== -1 && html.indexOf('Proposed Units') !== -1, 'proposed units section');
assert(html.indexOf('BLUE 0 / RED 2 / NEUTRAL 0') !== -1, 'RED count shown');
assert(html.indexOf('F-14A Tomcat') !== -1 && html.indexOf('24') !== -1, 'F-14 card');
assert(html.indexOf('F-4D/E Phantom II') !== -1 && html.indexOf('12') !== -1, 'F-4 card');
assert(html.indexOf('35.2116, 48.6534') !== -1, 'coordinates shown');
assert(html.indexOf('base_known_exact_unit_position_unknown') !== -1, 'warning shown');
assert(html.indexOf('AI information requires review') !== -1, 'AI review warning');
assert(html.indexOf('Accept') === -1 && html.indexOf('Reject') === -1, 'no Accept/Reject controls');

console.log('  [PASS] Step 1 review UI shows task assembly and proposed RED units');
