#!/usr/bin/env node
/*
 * STEP1-B: live External MDMP upload path routes wrapped Step 1 JSON through
 * the Step1-A adapter instead of generic Operational Brief handling.
 */
'use strict';

const path = require('path');
const { Readable } = require('stream');
const BRIDGE = require(path.join(__dirname, 'UI_MOdified/server/wargame-sim-bridge'));
const BRIEF = require(path.join(__dirname, 'UI_MOdified/server/ai/operational-brief'));

global.window = {};
require(path.join(__dirname, 'UI_MOdified/client/shell/doc-understanding-review.js'));

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assertion failed'); }

function base(base_name_ar, base_name_en, lat, lon, units) {
    return { base_name_ar, base_name_en, lat, lon, site_type: 'airbase', country: '\u0625\u064a\u0631\u0627\u0646', units };
}
function unit(platform, estimated_count, type_ar) {
    return { platform, estimated_count, type_ar: type_ar || 'fighter' };
}

const IRAN_QATAR_STEP1 = {
    operational_brief: {
        scenario_metadata: { scenario_type: 'MDMP Step 1 - Qatar / Iran trial' },
        letter_ref_number: 'IQ-STEP1-TRIAL',
        task_assembly: {
            summary: '\u062a\u062c\u0645\u064a\u0639 \u0648\u0627\u062c\u0628\u0627\u062a \u0623\u0648\u0644\u064a \u0644\u062d\u0645\u0627\u064a\u0629 \u0642\u0637\u0631.',
            main_task: '\u062d\u0645\u0627\u064a\u0629 \u0642\u0637\u0631',
            supporting_tasks: [{ unit: '\u0627\u0644\u0642\u0648\u0627\u062a \u0627\u0644\u062c\u0648\u064a\u0629', duty: '\u0645\u0631\u0627\u0642\u0628\u0629 \u0642\u0648\u0627\u0639\u062f \u0627\u0644\u0639\u062f\u0648' }],
        },
        Units_Duty: '\u0648\u0627\u062c\u0628\u0627\u062a \u0623\u0648\u0644\u064a\u0629 \u062a\u062d\u062a\u0627\u062c \u0645\u0631\u0627\u062c\u0639\u0629.',
        doctrine_upload_required: true,
        doctrine_sources: ['pending_upload'],
        doctrine_application_policy: 'operator_uploaded_doctrine_required_before_final_tasking',
        join_op_mission: '\u062d\u0645\u0627\u064a\u0629 \u0642\u0637\u0631 \u0648\u0631\u062f\u0639 \u062a\u0647\u062f\u064a\u062f\u0627\u062a \u0625\u064a\u0631\u0627\u0646.',
        Assembly_Area: '25.29, 51.53',
        enemy_forces: {
            air_bases: [
                base('\u0642\u0627\u0639\u062f\u0629 \u0627\u0644\u0634\u0647\u064a\u062f \u0646\u0648\u062c\u0647 / \u0647\u0645\u062f\u0627\u0646', 'Shahid Nojeh / Hamedan', 35.2116, 48.6534, [
                    unit('F-14A Tomcat', 24), unit('F-4D/E Phantom II', 12), unit('F-5E Tiger II', 8),
                ]),
                base('\u0645\u0637\u0627\u0631 \u0645\u0647\u0631\u0622\u0628\u0627\u062f', 'Mehrabad', 35.6892, 51.3134, [
                    unit('F-5E Tiger II', 18), unit('C-130H Hercules', 6), unit('Boeing 707 Tanker', 2),
                ]),
                base('\u0642\u0627\u0639\u062f\u0629 \u0628\u0648\u0634\u0647\u0631', 'Bushehr', 28.9448, 50.8346, [
                    unit('F-4E Phantom II', 10), unit('Bell 214', 6),
                ]),
                base('\u0642\u0627\u0639\u062f\u0629 \u0628\u0646\u062f\u0631 \u0639\u0628\u0627\u0633', 'Bandar Abbas', 27.2183, 56.3778, [
                    unit('F-4D/E Phantom II', 12), unit('Su-22', 8), unit('P-3F Orion', 4),
                ]),
                base('\u0643\u0646\u0627\u0631\u0643 / \u062a\u0634\u0627\u0628\u0647\u0627\u0631', 'Konarak / Chabahar', 25.4433, 60.3821, [
                    unit('P-3F Orion', 4), unit('F-27 Friendship', 3),
                ]),
                base('\u0642\u0627\u0639\u062f\u0629 \u062f\u0632\u0641\u0648\u0644', 'Dezful', 32.4344, 48.3976, [
                    unit('F-5E Tiger II', 16), unit('F-5F Tiger II', 4),
                ]),
                base('\u0623\u0635\u0641\u0647\u0627\u0646 / \u0634\u0647\u064a\u062f \u0628\u0647\u0634\u062a\u064a', 'Isfahan / Shahid Beheshti', 32.7508, 51.8613, [
                    unit('F-14A Tomcat', 18), unit('PC-7', 8),
                ]),
                base('\u0634\u064a\u0631\u0627\u0632', 'Shiraz', 29.5392, 52.5898, [
                    unit('Su-24MK', 12), unit('Il-76', 4), unit('C-130H Hercules', 4),
                ]),
                base('\u062a\u0628\u0631\u064a\u0632', 'Tabriz', 38.1339, 46.235, [
                    unit('MiG-29A Fulcrum', 12), unit('F-5E Tiger II', 10),
                ]),
                base('\u0645\u0634\u0647\u062f', 'Mashhad', 36.2352, 59.6409, [
                    unit('Mirage F1EQ', 8), unit('Mi-17', 6),
                ]),
                base('\u0643\u0631\u0645\u0627\u0646', 'Kerman', 30.2744, 56.9511, [
                    unit('Shahed UAV', 12), unit('Bell 214', 4), unit('Ababil UAV', 6),
                ]),
            ],
        },
    },
};

function postAnalyze(body) {
    return new Promise((resolve, reject) => {
        const payload = Buffer.from(JSON.stringify(body), 'utf8');
        const req = Readable.from([payload]);
        req.method = 'POST';
        req.url = '/api/wargame-sim/analyze';
        const res = {
            statusCode: 0,
            headers: {},
            writeHead: function (code, headers) { this.statusCode = code; this.headers = headers || {}; },
            end: function (text) {
                try { resolve({ status: this.statusCode, body: JSON.parse(text) }); }
                catch (e) { reject(e); }
            },
        };
        const handled = BRIDGE.handle(req, res, {
            url: new URL('http://local.test/api/wargame-sim/analyze'),
            pathname: '/api/wargame-sim/analyze',
            method: 'POST',
            sendJson: function (r, code, obj) {
                r.writeHead(code, { 'Content-Type': 'application/json' });
                r.end(JSON.stringify(obj));
            },
        });
        if (!handled) reject(new Error('route not handled'));
    });
}

(async function main() {
    const det = BRIEF.detectMdmp(IRAN_QATAR_STEP1);
    assert(det.is && det.step === 'planning_guidance', 'wrapped Step 1 detected');
    assert(BRIEF.classifyJsonInput(IRAN_QATAR_STEP1) === 'mdmp_external', 'classification is mdmp_external');

    const response = await postAnalyze({
        bundle: [{ filename: 'Iran_Qatar.json', content: JSON.stringify(IRAN_QATAR_STEP1) }],
    });
    assert(response.status === 200, 'analyze route returns 200');
    const out = response.body;
    assert(out.kind === 'mdmp_external', 'route kind is mdmp_external');
    assert(out.understanding.set_label_en === 'External App Step 1', 'type label is External App Step 1');
    assert(out.understanding.set_label_en !== 'Operational Brief', 'not generic Operational Brief');
    const ob = out.brief.operational_brief;
    assert(ob.task_assembly && ob.task_assembly.summary === IRAN_QATAR_STEP1.operational_brief.task_assembly.summary, 'task_assembly preserved');
    assert(ob.units_duty && ob.units_duty.summary, 'Units_Duty preserved');
    assert(ob.task_assembly.doctrine_upload_required === true, 'doctrine_upload_required true');
    assert(Array.isArray(ob.enemy_bases) && ob.enemy_bases.length === 11, '11 enemy bases extracted');
    assert(Array.isArray(ob.proposed_units) && ob.proposed_units.length === 27, '27 proposed RED unit groups extracted');
    assert(out.understanding.proposed_unit_counts.red === 27, 'RED count is non-zero');
    assert(ob.proposed_units.every(u => u.side === 'RED' && u.needs_review === true), 'proposed units need review');
    assert(ob.proposed_units.every(u => u.exact_unit_position === false), 'exact_unit_position remains false');
    assert(ob.enemy.units.length === 0 && ob.friendly.units.length === 0, 'no final placement mutation');
    assert(ob.placement_candidates.some(c => c.base_name_en === 'Bandar Abbas' && c.exact_unit_position === false), 'Bandar Abbas placement anchor');

    const container = { innerHTML: '', style: {}, querySelector: function () { return null; } };
    window.RmoozDocReview.render(container, out, {});
    const html = container.innerHTML;
    const caps = window.RmoozDocReview.assessReviewPayloadCapabilities(out);
    assert(caps.status === 'map_ready', 'full Step 1 route capability status map_ready');
    assert(caps.map_preview_ready === true, 'full Step 1 route map preview ready');
    assert(html.indexOf('Task Assembly') !== -1, 'Task Assembly section renders');
    assert(html.indexOf('Doctrine Required') !== -1, 'Doctrine section renders');
    assert(html.indexOf('Proposed Units') !== -1, 'Proposed Units section renders');
    assert(html.indexOf('Enemy Bases') !== -1, 'Enemy Bases section renders');
    assert(html.indexOf('pending_upload') !== -1, 'Doctrine warning/source renders');
    ['Shahid Nojeh', 'Bandar Abbas', 'Konarak / Chabahar'].forEach(name => {
        assert(html.indexOf(name) !== -1, name + ' appears');
    });
    assert(html.indexOf('BLUE 0 / RED 27 / NEUTRAL 0') !== -1, 'UI count includes RED 27');
    assert(html.indexOf('template/partial planning guide') === -1, 'full Step 1 does not show partial/template warning');
    assert(html.indexOf('Input capability check') !== -1, 'full Step 1 shows capability box');
    assert(html.indexOf('data-act="preview"') !== -1, 'full Step 1 still shows Preview Decision Steps');

    const partialStep1 = {
        operational_brief: {
            scenario_metadata: { scenario_type: 'MDMP Step 1 template / partial planning guide' },
            letter_ref_number: '<\u0631\u0642\u0645 \u0627\u0644\u0645\u0631\u062c\u0639>',
            task_assembly: '\u064a\u0635\u062f\u0631 \u0644\u0627\u062d\u0642\u0627\u064b',
            Units_Duty: '<\u0648\u0627\u062c\u0628\u0627\u062a \u0623\u0648\u0644\u064a\u0629>',
            doctrine_upload_required: true,
            doctrine_sources: ['pending_upload'],
            doctrine_application_policy: 'operator_uploaded_doctrine_required_before_final_tasking',
            Assembly_Area: 'R CN 64215 7114840',
            join_op_mission: '<\u0627\u0644\u0645\u0647\u0645\u0629>',
        },
    };
    const partialResponse = await postAnalyze({
        bundle: [{ filename: 'step1-template-guide.json', content: JSON.stringify(partialStep1) }],
    });
    assert(partialResponse.status === 200, 'partial Step 1 analyze route returns 200');
    const partialOut = partialResponse.body;
    assert(partialOut.kind === 'mdmp_external', 'partial Step 1 still classified as mdmp_external');
    const partialOb = partialOut.brief.operational_brief;
    assert(Array.isArray(partialOb.proposed_units) && partialOb.proposed_units.length === 0, 'partial Step 1 has no proposed units');
    assert(Array.isArray(partialOb.enemy_bases) && partialOb.enemy_bases.length === 0, 'partial Step 1 has no enemy bases');
    const partialSnap = JSON.stringify(partialOut.brief);
    const partialContainer = { innerHTML: '', style: {}, querySelector: function () { return null; } };
    window.RmoozDocReview.render(partialContainer, partialOut, {});
    const partialHtml = partialContainer.innerHTML;
    const partialCaps = window.RmoozDocReview.assessReviewPayloadCapabilities(partialOut);
    assert(partialCaps.status === 'text_only' || partialCaps.status === 'insufficient', 'partial Step 1 route is not map_ready');
    assert(partialCaps.map_preview_ready === false, 'partial Step 1 route map preview not ready');
    assert(partialCaps.missing_for_map_preview.indexOf('proposed_units') !== -1, 'partial Step 1 route missing proposed_units');
    assert(partialHtml.indexOf('Input capability check') !== -1, 'partial Step 1 shows generic capability box');
    assert(partialHtml.indexOf('AI understood the document, but no map-ready units were found') !== -1, 'partial Step 1 shows upload quality warning');
    assert(partialHtml.indexOf('Unit map preview requires proposed_units and placement_candidates') !== -1, 'partial warning explains preview requirements');
    assert(partialHtml.indexOf('data-act="preview"') === -1, 'partial Step 1 hides Preview Decision Steps');
    assert(partialHtml.indexOf('data-act="preview-disabled"') !== -1, 'partial Step 1 shows disabled map preview button');
    assert(partialHtml.indexOf('Missing / ambiguous') !== -1, 'partial Step 1 keeps ambiguity list');
    assert(JSON.stringify(partialOut.brief) === partialSnap, 'partial Step 1 render does not mutate payload');

    console.log('  [PASS] External Step 1 live route renders proposed RED units');
})().catch(e => {
    console.error('  [FAIL] ' + e.message);
    process.exit(1);
});
