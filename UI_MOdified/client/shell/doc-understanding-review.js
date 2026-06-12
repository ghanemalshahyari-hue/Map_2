/* ============================================================================
 * doc-understanding-review.js — DOC-UNDERSTANDING-1 / Phase E
 * ----------------------------------------------------------------------------
 * Single source of the "AI Understanding" review renderer. Given the payload
 * from POST /api/wargame-sim/analyze, it paints what the AI understood BEFORE
 * generation (document type, mission, intent, friendly/enemy/neutral,
 * objectives, phases, constraints, proposed counts/bounds, ambiguities) plus
 * the four operator actions.
 *
 * Used by the import wizard (scenario-import-wizard.js) and by the standalone
 * verify page (doc-understanding-verify.html) so the rendered UI is identical.
 *
 *   window.RmoozDocReview.render(container, payload, handlers)
 *     handlers = { onGenerate, onUploadMore, onCancel }  (all optional)
 * ========================================================================== */
(function () {
    'use strict';

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch];
        });
    }
    function chip(label, val, color) {
        return '<span style="display:inline-block;margin:2px 6px 2px 0;padding:2px 8px;border-radius:10px;font-size:11px;' +
            'background:#16222e;border:1px solid #2e5d7d;color:' + (color || '#cfe6ff') + ';">' +
            esc(label) + (val != null ? ': <b>' + esc(val) + '</b>' : '') + '</span>';
    }
    function briefBlock(title, text) {
        return '<div style="margin-bottom:8px;"><div style="font-size:11px;color:#8fa5b8;margin-bottom:2px;">' + esc(title) +
            '</div><div style="font-size:12px;color:#e8eaed;direction:rtl;text-align:right;background:#121a22;border-radius:4px;padding:6px;">' +
            esc(text) + '</div></div>';
    }
    function sideBlock(title, text, bg, fg) {
        if (!text) return '';
        return '<div style="margin-bottom:8px;"><div style="font-size:11px;color:' + fg + ';margin-bottom:2px;">' + esc(title) +
            '</div><div style="font-size:12px;color:#e8eaed;direction:rtl;text-align:right;background:' + bg +
            ';border:1px solid #2a2f37;border-radius:4px;padding:6px;white-space:pre-wrap;max-height:150px;overflow:auto;">' + esc(text) + '</div></div>';
    }
    function listBlock(title, items, color) {
        items = (items || []).filter(Boolean);
        if (!items.length) return '';
        var lis = items.map(function (it) { return '<li style="margin:1px 0;">' + esc(it) + '</li>'; }).join('');
        return '<div style="margin-bottom:8px;"><div style="font-size:11px;color:' + (color || '#8fa5b8') + ';margin-bottom:2px;">' +
            esc(title) + ' (' + items.length + ')</div><ul style="margin:0;padding:0 18px;font-size:12px;color:#e8eaed;direction:rtl;text-align:right;">' +
            lis + '</ul></div>';
    }
    function opBrief(p) {
        return (p && p.brief && p.brief.operational_brief) || (p && p.operational_brief) || {};
    }
    function fieldRow(label, value) {
        if (value == null || value === '' || (Array.isArray(value) && !value.length)) return '';
        var text = Array.isArray(value) ? value.join(', ') : value;
        return '<div style="display:grid;grid-template-columns:minmax(110px,180px) 1fr;gap:8px;margin:3px 0;font-size:12px;">' +
            '<div style="color:#8fa5b8;">' + esc(label) + '</div><div style="color:#e8eaed;direction:rtl;text-align:right;">' + esc(text) + '</div></div>';
    }
    function renderTaskAssembly(p) {
        var ob = opBrief(p);
        var ta = ob.task_assembly || (p.understanding && p.understanding.task_assembly);
        if (!ta) return '';
        var supporting = Array.isArray(ta.supporting_tasks) ? ta.supporting_tasks : [];
        var supportText = supporting.map(function (t) {
            if (t && typeof t === 'object') return [(t.unit || t.unit_name || ''), (t.duty || t.task || t.summary || '')].filter(Boolean).join(': ');
            return String(t || '');
        }).filter(Boolean);
        var sources = Array.isArray(ta.doctrine_sources) && ta.doctrine_sources.length ? ta.doctrine_sources : ['pending_upload'];
        var html = '<section style="margin:10px 0;padding:8px 0;border-top:1px solid #23303d;">' +
            '<div style="font-size:13px;color:#cfe6ff;font-weight:600;margin-bottom:6px;">\u062a\u062c\u0645\u064a\u0639 \u0627\u0644\u0648\u0627\u062c\u0628 \u2014 Task Assembly</div>';
        html += fieldRow('summary', ta.summary);
        html += fieldRow('main_task', ta.main_task);
        html += listBlock('supporting_tasks', supportText);
        html += fieldRow('tasking_status', ta.tasking_status);
        html += fieldRow('commander_review_required', ta.commander_review_required === true ? 'true' : (ta.commander_review_required === false ? 'false' : ''));
        html += fieldRow('doctrine_upload_required', ta.doctrine_upload_required === true ? 'true' : (ta.doctrine_upload_required === false ? 'false' : ''));
        html += fieldRow('doctrine_sources', sources);
        html += fieldRow('doctrine_application_policy', ta.doctrine_application_policy);
        html += '<div style="margin-top:6px;padding:6px 8px;border-radius:4px;background:#2a2412;border:1px solid #b8860b;color:#e0c060;font-size:12px;direction:rtl;text-align:right;">' +
            '\u0644\u0627 \u064a\u062a\u0645 \u0627\u0639\u062a\u0645\u0627\u062f \u0627\u0644\u062a\u062e\u0637\u064a\u0637 \u0627\u0644\u0646\u0647\u0627\u0626\u064a \u062f\u0648\u0646 \u0631\u0641\u0639 \u0627\u0644\u0639\u0642\u064a\u062f\u0629 \u0648\u0645\u0631\u0627\u062c\u0639\u062a\u0647\u0627.' +
            '</div></section>';
        return html;
    }
    function renderUnitsDuty(p) {
        var ud = opBrief(p).units_duty;
        if (!ud) return '';
        var duties = Array.isArray(ud.duties) ? ud.duties : [];
        var html = '<section style="margin:10px 0;padding:8px 0;border-top:1px solid #23303d;">' +
            '<div style="font-size:13px;color:#cfe6ff;font-weight:600;margin-bottom:6px;">\u0648\u0627\u062c\u0628\u0627\u062a \u0627\u0644\u0648\u062d\u062f\u0627\u062a \u2014 Units Duty</div>';
        html += fieldRow('summary', ud.summary || (typeof ud === 'string' ? ud : ''));
        html += listBlock('duties', duties.map(function (d) {
            if (d && typeof d === 'object') return [(d.unit || d.unit_name || ''), (d.duty || d.task || d.summary || '')].filter(Boolean).join(': ');
            return String(d || '');
        }));
        html += fieldRow('needs_review', ud.needs_review ? 'true' : 'false');
        html += fieldRow('source_type', ud.source_type);
        html += '</section>';
        return html;
    }
    function renderDoctrineRequired(p) {
        var ta = opBrief(p).task_assembly || {};
        var hasDoctrine = ('doctrine_upload_required' in ta) || Array.isArray(ta.doctrine_sources) || ta.doctrine_application_policy;
        if (!hasDoctrine) return '';
        var sources = Array.isArray(ta.doctrine_sources) && ta.doctrine_sources.length ? ta.doctrine_sources : ['pending_upload'];
        var html = '<section style="margin:10px 0;padding:8px 0;border-top:1px solid #23303d;">' +
            '<div style="font-size:13px;color:#e0c060;font-weight:600;margin-bottom:6px;">\u0627\u0644\u0639\u0642\u064a\u062f\u0629 \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 \u2014 Doctrine Required</div>';
        html += fieldRow('doctrine_upload_required', ta.doctrine_upload_required === true ? 'true' : (ta.doctrine_upload_required === false ? 'false' : ''));
        html += fieldRow('doctrine_sources', sources);
        html += fieldRow('doctrine_application_policy', ta.doctrine_application_policy);
        html += '</section>';
        return html;
    }
    function renderProposedUnits(p) {
        var ob = opBrief(p);
        var units = (Array.isArray(ob.proposed_units) && ob.proposed_units.length) ? ob.proposed_units :
            ((p.understanding && Array.isArray(p.understanding.proposed_units)) ? p.understanding.proposed_units : []);
        units = units.filter(function (u) { return String((u && u.side) || '').toUpperCase() === 'RED'; });
        if (!units.length) return '';
        var groups = {};
        units.forEach(function (u) {
            var key = (u.base_name_ar || u.base_name_en || 'RED base') + '|' + (u.lat != null ? u.lat : '') + ',' + (u.lon != null ? u.lon : '');
            (groups[key] = groups[key] || []).push(u);
        });
        var html = '<section style="margin:10px 0;padding:8px 0;border-top:1px solid #23303d;">' +
            '<div style="font-size:13px;color:#f0a0a0;font-weight:600;margin-bottom:2px;">\u0627\u0644\u0648\u062d\u062f\u0627\u062a \u0627\u0644\u0645\u0642\u062a\u0631\u062d\u0629 \u2014 Proposed Units</div>' +
            '<div style="font-size:11px;color:#8fa5b8;margin-bottom:6px;">\u0642\u0648\u0627\u062a \u0627\u0644\u0639\u062f\u0648 \u0627\u0644\u0645\u0646\u0638\u0645\u0629 \u2014 Enemy Force Structure</div>';
        Object.keys(groups).forEach(function (k) {
            var list = groups[k], first = list[0] || {};
            var coord = (first.lat != null && first.lon != null) ? (first.lat + ', ' + first.lon) : 'pending';
            html += '<div style="margin:8px 0;"><div style="font-size:12px;color:#f0a0a0;margin-bottom:4px;direction:rtl;text-align:right;">' +
                esc(first.base_name_ar || first.base_name_en || 'RED base') + ' <span style="color:#8fa5b8;">(' + esc(coord) + ')</span></div>';
            list.forEach(function (u) {
                html += '<div style="margin:4px 0;padding:6px 8px;border:1px solid #3d2a2a;background:#1a1212;border-radius:4px;font-size:12px;">' +
                    fieldRow('platform', u.platform) +
                    fieldRow('estimated_count', u.estimated_count) +
                    fieldRow('type', u.type_ar) +
                    fieldRow('needs_review', u.needs_review ? 'true' : 'false') +
                    fieldRow('source_type', u.source_type) +
                    fieldRow('warning', u.warning || (u.warnings || []).join(', ')) +
                    '<div style="color:#e0a93a;font-size:11px;direction:rtl;text-align:right;">AI information requires review</div>' +
                    '</div>';
            });
            html += '</div>';
        });
        html += '</section>';
        return html;
    }
    function renderEnemyBases(p) {
        var bases = opBrief(p).enemy_bases || [];
        var friendlyTrials = opBrief(p).friendly_trial_bases || [];
        if (!bases.length && !friendlyTrials.length) return '';
        var html = '<section style="margin:10px 0;padding:8px 0;border-top:1px solid #23303d;">' +
            '<div style="font-size:13px;color:#f0a0a0;font-weight:600;margin-bottom:6px;">\u0642\u0648\u0627\u0639\u062f \u0648\u0645\u0637\u0627\u0631\u0627\u062a \u0627\u0644\u0639\u062f\u0648 \u2014 Enemy Bases</div>';
        html += '<div style="margin-bottom:6px;">' + chip('RED bases', bases.length, '#f0a0a0') +
            chip('BLUE trial bases', friendlyTrials.length, '#7fd6a0') + '</div>';
        bases.forEach(function (b) {
            var coord = (b.lat != null && b.lon != null) ? (b.lat + ', ' + b.lon) : 'pending';
            html += '<div style="margin:4px 0;padding:6px 8px;border:1px solid #3d2a2a;background:#1a1212;border-radius:4px;font-size:12px;">' +
                fieldRow('base_name_ar', b.base_name_ar) +
                fieldRow('base_name_en', b.base_name_en) +
                fieldRow('coordinates', coord) +
                fieldRow('site_type', b.site_type || 'airbase') +
                fieldRow('needs_review', b.needs_review ? 'true' : 'false') +
                fieldRow('source_type', b.source_type) +
                '</div>';
        });
        friendlyTrials.forEach(function (b) {
            var coord = (b.lat != null && b.lon != null) ? (b.lat + ', ' + b.lon) : 'pending';
            html += '<div style="margin:4px 0;padding:6px 8px;border:1px solid #294333;background:#121a16;border-radius:4px;font-size:12px;">' +
                fieldRow('base_name_ar', b.base_name_ar) +
                fieldRow('base_name_en', b.base_name_en) +
                fieldRow('coordinates', coord) +
                fieldRow('site_type', b.site_type || 'friendly_trial_anchor') +
                fieldRow('side', b.side || 'BLUE') +
                fieldRow('needs_review', b.needs_review ? 'true' : 'false') +
                fieldRow('source_type', b.source_type) +
                '</div>';
        });
        html += '</section>';
        return html;
    }
    function renderMissingInformation(p) {
        var ob = opBrief(p);
        var missing = (ob.missing_information || []).concat((ob.staff_brief_2 && ob.staff_brief_2.missing_information) || []);
        var seen = {};
        missing = missing.filter(function (m) { if (!m || seen[m]) return false; seen[m] = true; return true; });
        if (!missing.length) return '';
        return '<section style="margin:10px 0;padding:8px 0;border-top:1px solid #23303d;">' +
            '<div style="font-size:13px;color:#e0a93a;font-weight:600;margin-bottom:6px;">\u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0627\u0644\u0646\u0627\u0642\u0635\u0629 \u2014 Missing Information</div>' +
            listBlock('missing_information', missing, '#e0a93a') + '</section>';
    }
    function renderStaffBrief2(p) {
        var sb = opBrief(p).staff_brief_2;
        if (!sb || !sb.sections) return '';
        var labels = {
            intel_summary: '\u0645\u0644\u062e\u0635 \u0627\u0644\u0627\u0633\u062a\u062e\u0628\u0627\u0631\u0627\u062a \u2014 Intel Summary',
            enemy_capabilities: '\u0642\u062f\u0631\u0627\u062a \u0627\u0644\u0639\u062f\u0648 \u2014 Enemy Capabilities',
            operations: '\u0627\u0644\u0639\u0645\u0644\u064a\u0627\u062a \u2014 Operations',
            hr: '\u0627\u0644\u0642\u0648\u0649 \u0627\u0644\u0628\u0634\u0631\u064a\u0629 \u2014 HR',
            logistics: '\u0627\u0644\u0625\u0645\u062f\u0627\u062f \u2014 Logistics',
        };
        var html = '<section style="margin:10px 0;padding:8px 0;border-top:1px solid #23303d;">' +
            '<div style="font-size:13px;color:#cfe6ff;font-weight:600;margin-bottom:6px;">Staff Brief 2 \u2014 \u0625\u064a\u062c\u0627\u0632 \u0627\u0644\u0623\u0631\u0643\u0627\u0646 2</div>';
        html += fieldRow('external_step', sb.external_step);
        html += fieldRow('package_type', sb.package_type);
        Object.keys(labels).forEach(function (name) {
            var section = sb.sections[name] || {};
            var keys = Object.keys(section);
            html += '<div style="margin:8px 0;"><div style="font-size:12px;color:#8fa5b8;margin-bottom:4px;">' + esc(labels[name]) + '</div>';
            if (!keys.length) html += '<div style="font-size:12px;color:#e0a93a;">missing_information</div>';
            keys.forEach(function (k) {
                var item = section[k] || {};
                html += '<div style="margin:3px 0;padding:5px 7px;border:1px solid #2a2f37;background:#121a22;border-radius:4px;">' +
                    fieldRow(k, item.value) +
                    fieldRow('needs_review', item.needs_review ? 'true' : 'false') +
                    fieldRow('source_type', item.source_type) +
                    '</div>';
            });
            html += '</div>';
        });
        var conclusionRows = [];
        ['intel_summary', 'operations', 'hr', 'logistics'].forEach(function (name) {
            Object.keys(sb.sections[name] || {}).forEach(function (k) {
                if (/Conclusions?$/i.test(k) || /_Conclusions$/i.test(k)) {
                    conclusionRows.push(name + ': ' + k + ' = ' + ((sb.sections[name][k] || {}).value || ''));
                }
            });
        });
        html += '<div style="margin:8px 0;"><div style="font-size:12px;color:#8fa5b8;margin-bottom:4px;">\u0627\u0644\u0627\u0633\u062a\u0646\u062a\u0627\u062c\u0627\u062a \u2014 Conclusions</div>';
        html += conclusionRows.length ? listBlock('conclusions', conclusionRows) : '<div style="font-size:12px;color:#e0a93a;">missing_information</div>';
        html += '</div>';
        html += '<div style="margin:8px 0;"><div style="font-size:12px;color:#e0a93a;margin-bottom:4px;">\u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062a \u0627\u0644\u0646\u0627\u0642\u0635\u0629 \u2014 Missing Information</div>';
        html += (sb.missing_information && sb.missing_information.length)
            ? listBlock('missing_information', sb.missing_information, '#e0a93a')
            : '<div style="font-size:12px;color:#8fa5b8;">none</div>';
        html += '</div>';
        if (sb.step1_linkage) {
            html += '<div style="margin:8px 0;"><div style="font-size:12px;color:#8fa5b8;margin-bottom:4px;">Step 1 linkage</div>' +
                fieldRow('task_assembly', sb.step1_linkage.task_assembly ? 'true' : 'false') +
                fieldRow('proposed_units', sb.step1_linkage.proposed_units) +
                fieldRow('doctrine_upload_required', sb.step1_linkage.doctrine_upload_required ? 'true' : 'false') +
                fieldRow('placement_candidates', sb.step1_linkage.placement_candidates) + '</div>';
        }
        if (sb.duplicate_key_warnings && sb.duplicate_key_warnings.length) {
            html += listBlock('duplicate_key_warnings', sb.duplicate_key_warnings.map(function (w) { return w.section + '.' + w.key; }), '#e0a93a');
        }
        if (sb.conflicts && sb.conflicts.length) {
            html += listBlock('conflicts', sb.conflicts.map(function (c) { return c.key + ': ' + c.type; }), '#e0a93a');
        }
        html += '</section>';
        return html;
    }

    function render(container, p, handlers) {
        handlers = handlers || {};
        p = p || {};
        var u = p.understanding || {};
        var pc = u.proposed_unit_counts || {};
        var html = '<div style="font-size:14px;color:#7fd6a0;font-weight:600;margin-bottom:8px;">AI understood this as — فهم الذكاء الاصطناعي</div>';
        html += '<div style="margin-bottom:8px;">' + chip('Type / النوع', (u.set_label_en || '') + ' — ' + (u.set_label_ar || ''), '#7fd6a0');
        (p.documents || []).forEach(function (d) {
            html += chip(d.filename || (d.hash || '').slice(0, 8), (d.type_label_en || d.detected_type) + ' · ' + Math.round((d.confidence || 0) * 100) + '%');
        });
        html += '</div>';
        if (p.dedupe && p.dedupe.same_in_both_slots) {
            html += '<div style="margin-bottom:8px;padding:6px 8px;border-radius:5px;background:#2a2412;border:1px solid #b8860b;color:#e0c060;font-size:12px;">' +
                '⮕ Same document in both slots — treated as ONE Mixed Operational Document. نفس الوثيقة في الخانتين — عوملت كوثيقة عمليات واحدة.</div>';
        }
        if (u.mission) html += briefBlock('Mission — المهمة', u.mission);
        if (u.commander_intent) html += briefBlock("Commander's intent — نية القائد", u.commander_intent);
        html += sideBlock('Friendly (BLUE) — قواتنا (الزرقاء)', u.friendly && u.friendly.summary, '#16241b', '#7fd6a0');
        html += sideBlock('Enemy (RED) — العدو (الحمراء)', u.enemy && u.enemy.summary, '#241616', '#f0a0a0');
        if (u.neutral && (u.neutral.civilian || []).length) html += sideBlock('Neutral / civilian — محايد / مدني', (u.neutral.civilian || []).join('\n'), '#24220f', '#d8d870');
        html += listBlock('Objectives — الأهداف', (u.objectives || []).map(function (o) { return o.name; }));
        html += listBlock('Phases — المراحل', (u.phases || []).map(function (ph) { return 'P' + ph.index + ': ' + ph.label; }));
        html += listBlock('Constraints / ROE — القيود', (u.constraints || []).map(function (c) { return c.text; }));
        html += '<div style="margin:8px 0;">' +
            chip('Proposed units — أعداد مقترحة', 'BLUE ' + (pc.blue || 0) + ' / RED ' + (pc.red || 0) + ' / NEUTRAL ' + (pc.neutral || 0)) +
            chip('Map bounds — حدود الخريطة', u.proposed_map_bounds ? 'from document' : 'not specified — set objective on map') + '</div>';
        html += listBlock('Missing / ambiguous — نواقص وغموض', u.ambiguities || [], '#e0a93a');
        html += renderTaskAssembly(p);
        html += renderUnitsDuty(p);
        html += renderDoctrineRequired(p);
        html += renderProposedUnits(p);
        html += renderEnemyBases(p);
        html += renderMissingInformation(p);
        html += renderStaffBrief2(p);
        if (p.llm_fill && !p.llm_fill.available) {
            html += '<div style="font-size:11px;color:#9aa3ad;margin:6px 0;">ℹ Deep extraction (exact units &amp; intent) runs on the deployment LLM; this is the offline structural read.</div>';
        }
        // DOC-UNDERSTANDING-1 / G-3: COA Review Panel mount point. Painted by
        // shell/coa-review-panel.js when the brief carries courses_of_action[].
        html += '<div data-el="coa-panel"></div>';
        // DOC-UNDERSTANDING-1 / G-3C: location placement-candidates mount point.
        // Painted by shell/placement-candidates-panel.js when the wizard has
        // attached payload.placement (from /api/wargame-sim/placement).
        html += '<div data-el="placement-panel"></div>';
        html += '<div style="margin:10px 0 6px;font-size:12px;color:#9aa3ad;display:flex;align-items:center;gap:6px;flex-wrap:wrap;border-top:1px solid #23303d;padding-top:10px;">' +
            '<span>Operation template — قالب العملية:</span>' +
            '<select data-el="template" style="font:inherit;background:#161b18;color:#e8eaed;border:1px solid #4a5a6a;border-radius:4px;padding:3px 6px;">' +
            '<option value="">(auto-detect — كشف تلقائي)</option>' +
            '<option value="amphibious_landing">amphibious_landing — عملية إبرار</option>' +
            '<option value="attack_objective">attack_objective — هجوم على هدف</option>' +
            '<option value="defend_objective">defend_objective — دفاع عن هدف</option>' +
            '<option value="reconnaissance">reconnaissance — استطلاع</option>' +
            '<option value="air_defense">air_defense — دفاع جوي</option>' +
            '</select></div>';
        // G-3 approval gate message (hidden until a blocked Generate attempt).
        html += '<div data-el="coa-block-warn" style="display:none;margin:0 0 8px;padding:6px 8px;border-radius:5px;background:#2a2412;border:1px solid #b8860b;color:#e0c060;font-size:12px;"></div>';
        html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
            '<button type="button" data-act="generate" style="font:inherit;cursor:pointer;border:1px solid #2e7d54;background:#1f3a2b;color:#7fd6a0;border-radius:6px;padding:7px 14px;font-weight:600;">Generate Scenario — توليد السيناريو</button>' +
            '<button type="button" data-act="edit" style="font:inherit;cursor:pointer;border:1px solid #4a7bb8;background:#22303f;color:#cfe6ff;border-radius:6px;padding:7px 14px;">Edit Understanding — تعديل الفهم</button>' +
            '<button type="button" data-act="more" style="font:inherit;cursor:pointer;border:1px solid #5a6270;background:#2a2f37;color:#e8eaed;border-radius:6px;padding:7px 14px;">Upload More — وثائق إضافية</button>' +
            '<button type="button" data-act="cancel" style="font:inherit;cursor:pointer;border:1px solid #5a6270;background:#2a2f37;color:#e8eaed;border-radius:6px;padding:7px 14px;">Cancel — إلغاء</button>' +
            '</div>' +
            '<details data-el="editbox" style="margin-top:8px;"><summary style="cursor:pointer;font-size:12px;color:#8fa5b8;">Operational Brief JSON — مسودة الموجز</summary>' +
            '<textarea data-el="json" spellcheck="false" style="width:100%;height:160px;margin-top:6px;background:#0a0e12;color:#c0c6cd;border:1px solid #2a2f37;border-radius:4px;font-size:11px;font-family:monospace;box-sizing:border-box;"></textarea>' +
            '<div style="font-size:11px;color:#9aa3ad;margin-top:4px;">Structured editing is applied on the deployment network; this view is for review/transparency.</div></details>';
        container.innerHTML = html;
        container.style.display = 'block';

        // G-3: paint the COA cards when the brief carries courses_of_action[].
        var coaMount = container.querySelector('[data-el="coa-panel"]');
        if (coaMount && window.RmoozCoaPanel && window.RmoozCoaPanel.hasCoas(p)) {
            try { window.RmoozCoaPanel.render(coaMount, p); } catch (eCoa) {
                coaMount.innerHTML = '<div style="color:#e0a93a;font-size:11px;">COA panel failed to render: ' + esc(eCoa && eCoa.message) + '</div>';
            }
        }

        // G-3C: paint placement candidates when the wizard attached p.placement.
        var placeMount = container.querySelector('[data-el="placement-panel"]');
        if (placeMount && window.RmoozPlacementPanel && window.RmoozPlacementPanel.hasCandidates(p)) {
            try { window.RmoozPlacementPanel.render(placeMount, p); } catch (ePl) {
                placeMount.innerHTML = '<div style="color:#e0a93a;font-size:11px;">Placement panel failed to render: ' + esc(ePl && ePl.message) + '</div>';
            }
        }

        function bind(act, fn) {
            var b = container.querySelector('[data-act="' + act + '"]');
            if (b && fn) b.addEventListener('click', fn);
            return b;
        }
        // Generate passes the chosen operation template (or null = auto-detect).
        // G-3 approval rule: when COAs exist, generation requires an operator-
        // selected BLUE COA (recommendation alone never satisfies this — D9).
        bind('generate', function () {
            var warn = container.querySelector('[data-el="coa-block-warn"]');
            if (window.RmoozCoaPanel && window.RmoozCoaPanel.hasCoas(p)) {
                var gate = window.RmoozCoaPanel.canGenerateNow();
                if (!gate.ok) {
                    if (warn) { warn.style.display = 'block'; warn.textContent = '⛔ ' + (gate.reason || window.RmoozCoaPanel.BLOCK_MESSAGE); }
                    return;
                }
                if (warn) warn.style.display = 'none';
                // Safe metadata wiring only: stamp the operator's approval on
                // the brief (the COA's own status survives normalizeBrief).
                try {
                    var chosen = window.RmoozCoaPanel.getSelectedBlue();
                    var ob = p.brief && p.brief.operational_brief;
                    if (chosen && ob) {
                        ob.approved_coa_id = chosen.id;
                        (ob.courses_of_action || []).forEach(function (c) {
                            if (c && c.id === chosen.id) { c.status = 'approved'; c.approved_by = 'operator'; }
                        });
                    }
                } catch (_) {}
            }
            var sel = container.querySelector('[data-el="template"]');
            if (handlers.onGenerate) handlers.onGenerate(sel ? (sel.value || null) : null);
        });
        bind('edit', function () {
            var ta = container.querySelector('[data-el="json"]');
            var box = container.querySelector('[data-el="editbox"]');
            if (ta && !ta.value) { try { ta.value = JSON.stringify(p.brief, null, 2); } catch (_) {} }
            if (box) box.open = true;
        });
        bind('more', handlers.onUploadMore);
        bind('cancel', handlers.onCancel || function () { container.style.display = 'none'; });
    }

    window.RmoozDocReview = { render: render, esc: esc };
})();
