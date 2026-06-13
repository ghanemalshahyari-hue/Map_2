/* ============================================================================
 * doc-understanding-review.js â€” DOC-UNDERSTANDING-1 / Phase E
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
        if (p && p.brief && p.brief.operational_brief) return p.brief.operational_brief;
        if (p && p.operational_brief) return p.operational_brief;
        if (p && p.brief && typeof p.brief === 'object' && !Array.isArray(p.brief)) return p.brief;
        return (p && typeof p === 'object' && !Array.isArray(p)) ? p : {};
    }
    function arr(v) {
        return Array.isArray(v) ? v : [];
    }
    function baseSourceType(base) {
        return (base && base.source_type) || 'ai_candidate_from_external_llm';
    }
    function normalizeReviewBase(base, side, siteType) {
        base = base || {};
        return {
            base_name_ar: base.base_name_ar || base.name_ar || base.name || base.mention,
            base_name_en: base.base_name_en || base.name_en || base.name || base.mention,
            lat: base.lat,
            lon: base.lon,
            side: base.side || side,
            site_type: base.site_type || base.base_type || siteType,
            needs_review: base.needs_review !== false,
            source_type: baseSourceType(base),
        };
    }
    function enemyBases(p) {
        var ob = opBrief(p);
        if (arr(ob.enemy_bases).length) return arr(ob.enemy_bases);
        var ef = ob.enemy_forces || {};
        if (arr(ef.bases).length) {
            return arr(ef.bases).map(function (b) {
                return normalizeReviewBase(b, 'RED', b && (b.site_type || b.base_type) || 'enemy_base');
            });
        }
        return []
            .concat(arr(ef.air_bases).map(function (b) { return normalizeReviewBase(b, 'RED', 'air_base'); }))
            .concat(arr(ef.naval_bases).map(function (b) { return normalizeReviewBase(b, 'RED', 'naval_base'); }))
            .concat(arr(ef.land_bases).map(function (b) { return normalizeReviewBase(b, 'RED', 'land_base'); }));
    }
    function friendlyTrialBases(p) {
        var ob = opBrief(p);
        if (arr(ob.friendly_trial_bases).length) return arr(ob.friendly_trial_bases);
        var ff = ob.friendly_forces || {};
        return arr(ff.trial_bases).map(function (b) {
            return normalizeReviewBase(b, 'BLUE', 'friendly_trial_anchor');
        });
    }
    function proposedUnits(p) {
        var ob = opBrief(p);
        return (Array.isArray(ob.proposed_units) && ob.proposed_units.length) ? ob.proposed_units :
            ((p && p.understanding && Array.isArray(p.understanding.proposed_units)) ? p.understanding.proposed_units : []);
    }
    function placementCandidates(p) {
        var ob = opBrief(p);
        var src = (p && p.placement) || p || {};
        var out = [];
        if (p && p.placement) {
            if (Array.isArray(src.placement_candidates)) return src.placement_candidates;
            if (Array.isArray(src.candidates)) return src.candidates;
        }
        if (Array.isArray(ob.placement_candidates)) out = out.concat(ob.placement_candidates);
        if (src !== ob && Array.isArray(src.placement_candidates)) out = out.concat(src.placement_candidates);
        if (src !== ob && Array.isArray(src.candidates)) out = out.concat(src.candidates);
        return out;
    }
    function objectives(p) {
        var ob = opBrief(p);
        var u = (p && p.understanding) || {};
        var fromBrief = arr(ob.objectives).concat(arr(ob.objectives_list));
        if (fromBrief.length) return fromBrief;
        return arr(u.objectives);
    }
    function proposedCounts(p) {
        var u = (p && p.understanding) || {};
        var pc = u.proposed_unit_counts || {};
        var units = proposedUnits(p);
        if (units.length) {
            var counts = { blue: 0, red: 0, neutral: 0 };
            units.forEach(function (unit) {
                var side = String((unit && unit.side) || '').toUpperCase();
                if (side === 'BLUE') counts.blue++;
                else if (side === 'NEUTRAL') counts.neutral++;
                else counts.red++;
            });
            return counts;
        }
        return { blue: pc.blue || 0, red: pc.red || 0, neutral: pc.neutral || 0 };
    }
    function hasUsablePlacementCandidates(p) {
        return placementCandidates(p).some(function (c) {
            return c && Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lon));
        });
    }
    function textLooksPlaceholder(value) {
        var text = String(value == null ? '' : value).trim().toLowerCase();
        if (!text) return true;
        return /<[^>]+>|\u064a\u0635\u062f\u0631\s+\u0644\u0627\u062d\u0642|later|tbd|todo|placeholder|template/.test(text);
    }
    function taskAssemblyLooksPlaceholder(p) {
        var ta = opBrief(p).task_assembly || (p && p.understanding && p.understanding.task_assembly);
        if (!ta || typeof ta !== 'object' || Array.isArray(ta)) return true;
        var supporting = Array.isArray(ta.supporting_tasks) ? ta.supporting_tasks : [];
        return textLooksPlaceholder(ta.summary) &&
            textLooksPlaceholder(ta.main_task) &&
            supporting.length === 0;
    }
    function isStep1LikePayload(p) {
        var u = (p && p.understanding) || {};
        var label = String(u.set_label_en || u.detected_type || p && p.kind || '').toLowerCase();
        if (/external app step 1|step 1|planning_guidance|mdmp_external|operational brief/.test(label)) return true;
        return ((p && p.documents) || []).some(function (d) {
            var bits = [d && d.filename, d && d.detected_type, d && d.mdmp_step, d && d.type_label_en].join(' ').toLowerCase();
            return /step\s*1|planning_guidance|mdmp/.test(bits);
        });
    }
    function hasStep1MissingMarkers(p) {
        var ob = opBrief(p);
        var missing = (ob.missing_information || []).concat((p && p.understanding && p.understanding.ambiguities) || []);
        return missing.some(function (m) {
            return /\[step1\]|task_assembly|units_duty|placeholder|not found/i.test(String(m || ''));
        });
    }
    function hasOperationalBriefText(p) {
        var ob = opBrief(p);
        var u = (p && p.understanding) || {};
        return !!(ob.mission || ob.commander_intent || ob.task_assembly || ob.units_duty ||
            ob.staff_brief_2 || u.mission || u.commander_intent ||
            (u.friendly && u.friendly.summary) || (u.enemy && u.enemy.summary) ||
            isStep1LikePayload(p));
    }
    function assessReviewPayloadCapabilities(p) {
        p = p || {};
        var units = proposedUnits(p);
        var candidates = placementCandidates(p);
        var usableCandidates = candidates.filter(function (c) {
            return c && Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lon));
        });
        var redBases = enemyBases(p);
        var blueBases = friendlyTrialBases(p);
        var obj = objectives(p);
        var caps = {
            has_operational_brief: hasOperationalBriefText(p),
            has_proposed_units: units.length > 0,
            proposed_unit_count: units.length,
            has_placement_candidates: usableCandidates.length > 0,
            placement_candidate_count: usableCandidates.length,
            has_enemy_bases: redBases.length > 0,
            enemy_base_count: redBases.length,
            has_friendly_bases: blueBases.length > 0,
            friendly_base_count: blueBases.length,
            has_objectives: obj.length > 0,
            map_preview_ready: false,
            text_preview_ready: false,
            status: 'insufficient',
            missing_for_map_preview: [],
            warnings: [],
        };
        caps.text_preview_ready = caps.has_operational_brief;
        if (!caps.has_proposed_units) caps.missing_for_map_preview.push('proposed_units');
        if (!caps.has_placement_candidates) caps.missing_for_map_preview.push('placement_candidates');
        if (!caps.has_enemy_bases && !caps.has_friendly_bases && !caps.has_objectives) {
            caps.missing_for_map_preview.push('enemy_bases/friendly_trial_bases/objectives');
        }
        caps.map_preview_ready = caps.has_proposed_units && caps.has_placement_candidates &&
            (caps.has_enemy_bases || caps.has_friendly_bases || caps.has_objectives);
        var hasAnyMapData = caps.has_proposed_units || caps.has_enemy_bases || caps.has_friendly_bases;
        if (caps.map_preview_ready) caps.status = 'map_ready';
        else if (hasAnyMapData) caps.status = 'partial_map';
        else if (caps.text_preview_ready) caps.status = 'text_only';
        else caps.status = 'insufficient';
        if (caps.text_preview_ready && !caps.map_preview_ready) {
            caps.warnings.push('text_understood_map_units_missing');
        }
        if (taskAssemblyLooksPlaceholder(p) || hasStep1MissingMarkers(p)) {
            caps.warnings.push('partial_or_placeholder_fields');
        }
        return caps;
    }
    function renderCapabilityStatus(p, caps) {
        var u = (p && p.understanding) || {};
        var type = (u.set_label_en || u.detected_type || p.kind || 'unknown');
        var statusColor = caps.map_preview_ready ? '#7fd6a0' :
            (caps.status === 'partial_map' ? '#e0c060' : (caps.text_preview_ready ? '#e0a93a' : '#c98'));
        var mapText = caps.map_preview_ready ? 'ready' : (caps.status === 'partial_map' ? 'partial' : 'not ready');
        var html = '<section data-el="review-capability-status" style="margin:8px 0 10px;padding:8px 10px;border-radius:6px;' +
            'background:#101820;border:1px solid #284050;color:#e8eaed;font-size:12px;line-height:1.35;">' +
            '<div style="font-weight:700;color:#cfe6ff;margin-bottom:5px;">Input capability check â€” ÙØ­Øµ Ø¬Ø§Ù‡Ø²ÙŠØ© Ø§Ù„Ù…Ù„Ù</div>' +
            '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:5px;">' +
            chip('AI understood this file as', type, '#7fd6a0') +
            chip('Text understanding', caps.text_preview_ready ? 'available' : 'not available', caps.text_preview_ready ? '#7fd6a0' : '#c98') +
            chip('Units', caps.proposed_unit_count + ' found', caps.has_proposed_units ? '#7fd6a0' : '#e0a93a') +
            chip('Placement anchors', caps.placement_candidate_count + ' found', caps.has_placement_candidates ? '#7fd6a0' : '#e0a93a') +
            chip('Bases', (caps.enemy_base_count + caps.friendly_base_count) + ' found', (caps.has_enemy_bases || caps.has_friendly_bases) ? '#7fd6a0' : '#e0a93a') +
            chip('Map preview', mapText, statusColor) +
            '</div>';
        if (caps.text_preview_ready && !caps.map_preview_ready) {
            html += '<div data-el="map-readiness-warning" style="margin-top:6px;padding:6px 8px;border-radius:5px;background:#2a2412;border:1px solid #b8860b;color:#e0c060;">' +
                '<div>AI understood the document, but no map-ready units were found. Unit map preview requires proposed_units and placement_candidates.</div>' +
                '<div style="direction:rtl;text-align:right;margin-top:4px;">' +
                '\u0641\u0647\u0645 \u0627\u0644\u0630\u0643\u0627\u0621 \u0627\u0644\u0627\u0635\u0637\u0646\u0627\u0639\u064a \u0645\u062d\u062a\u0648\u0649 \u0627\u0644\u0645\u0644\u0641\u060c \u0644\u0643\u0646 \u0644\u0645 \u064a\u062a\u0645 \u0627\u0644\u0639\u062b\u0648\u0631 \u0639\u0644\u0649 \u0648\u062d\u062f\u0627\u062a \u062c\u0627\u0647\u0632\u0629 \u0644\u0644\u0639\u0631\u0636 \u0639\u0644\u0649 \u0627\u0644\u062e\u0631\u064a\u0637\u0629. \u0645\u0639\u0627\u064a\u0646\u0629 \u0627\u0644\u0648\u062d\u062f\u0627\u062a \u062a\u062d\u062a\u0627\u062c proposed_units \u0648 placement_candidates.' +
                '</div>' +
                '<div style="margin-top:5px;color:#f4d98a;">Upload the full Step 1 generated output or run deep extraction before using map preview.</div>' +
                '</div>';
        }
        if (caps.missing_for_map_preview.length && !caps.map_preview_ready) {
            html += '<div style="margin-top:5px;color:#9aa3ad;">Missing for map preview: ' +
                esc(caps.missing_for_map_preview.join(', ')) + '</div>';
        }
        html += '</section>';
        return html;
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
        var units = proposedUnits(p);
        if (!units.length) return '';
        var friendly = [], enemy = [], unknown = [];
        units.forEach(function (u) {
            var cat = getSideCategory(String((u && u.side) || ''));
            if (cat === 'friendly') friendly.push(u);
            else if (cat === 'enemy') enemy.push(u);
            else unknown.push(u);
        });
        function bucket(label, list, sideColor, sideBg, sideBorder) {
            if (!list.length) return '';
            var groups = {};
            list.forEach(function (u) {
                var key = (u.base_name_ar || u.base_name_en || label) + '|' + (u.lat != null ? u.lat : '') + ',' + (u.lon != null ? u.lon : '');
                (groups[key] = groups[key] || []).push(u);
            });
            var h = '<div style="margin:8px 0;">' +
                '<div style="font-size:12px;font-weight:600;color:' + sideColor + ';padding:4px 8px;border-radius:4px;background:' + sideBg + ';border-left:3px solid ' + sideColor + ';margin-bottom:6px;">' +
                esc(label) + ' <span style="font-weight:400;color:#8fa5b8;font-size:11px;">(' + list.length + ')</span></div>';
            Object.keys(groups).forEach(function (k) {
                var glist = groups[k], first = glist[0] || {};
                var coord = (first.lat != null && first.lon != null) ? (first.lat + ', ' + first.lon) : 'pending';
                h += '<div style="font-size:11px;color:#8fa5b8;direction:rtl;text-align:right;margin:3px 0 2px;">' +
                    esc(first.base_name_ar || first.base_name_en || '\u2014') + ' (' + esc(coord) + ')</div>';
                glist.forEach(function (u) {
                    h += '<div style="margin:3px 0;padding:5px 8px;border:1px solid ' + sideBorder + ';background:' + sideBg + ';border-radius:4px;font-size:12px;">' +
                        fieldRow('platform', u.platform) +
                        fieldRow('estimated_count', u.estimated_count) +
                        fieldRow('type_ar', u.type_ar) +
                        fieldRow('side', u.side) +
                        fieldRow('source_type', u.source_type) +
                        (u.warning || (u.warnings || []).length ? fieldRow('warning', u.warning || (u.warnings || []).join(', ')) : '') +
                        '<div style="color:#e0a93a;font-size:10px;margin-top:2px;">needs_review: true \u00b7 exact_unit_position: false</div>' +
                        '</div>';
                });
            });
            h += '</div>';
            return h;
        }
        var html = '<section data-el="proposed-units" style="margin:10px 0;padding:8px 0;border-top:1px solid #23303d;">' +
            '<div style="font-size:13px;color:#cfe6ff;font-weight:600;margin-bottom:6px;">\u0627\u0644\u0648\u062d\u062f\u0627\u062a \u0627\u0644\u0645\u0642\u062a\u0631\u062d\u0629 \u2014 Proposed Units (' + units.length + ')</div>';
        html += bucket('Friendly (BLUE) \u2014 \u0627\u0644\u0642\u0648\u0627\u062a \u0627\u0644\u0635\u062f\u064a\u0642\u0629', friendly, '#7fd6a0', '#121a16', '#294333');
        html += bucket('Enemy (RED) \u2014 \u0642\u0648\u0627\u062a \u0627\u0644\u0639\u062f\u0648', enemy, '#f0a0a0', '#1a1212', '#3d2a2a');
        html += bucket('Unknown / Neutral \u2014 \u063a\u064a\u0631 \u0645\u062d\u062f\u062f', unknown, '#c9ced6', '#151a20', '#3d4a57');
        html += '</section>';
        return html;
    }
    function renderEnemyBasesReviewPanel(bases, friendlyTrials) {
        var html = '';
        if (bases.length) {
            html += '<div style="font-size:12px;color:#f0a0a0;font-weight:600;margin:6px 0 3px;">Enemy Bases (RED) â€” Ù‚ÙˆØ§Ø¹Ø¯ Ø§Ù„Ø¹Ø¯Ùˆ (' + bases.length + ')</div>';
            bases.forEach(function (b) {
                var coord = (b.lat != null && b.lon != null) ? (b.lat + ', ' + b.lon) : null;
                html += '<div style="margin:3px 0;padding:6px 8px;border:1px solid #3d2a2a;background:#1a1212;border-radius:4px;font-size:12px;">' +
                    fieldRow('base_name_ar', b.base_name_ar) + fieldRow('base_name_en', b.base_name_en) +
                    (coord ? fieldRow('coordinates', coord) : '<div style="color:#e0a93a;font-size:11px;">âš  No coordinate â€” ÙŠØ­ØªØ§Ø¬ Ø¨ÙŠØ§Ù†Ø§Øª Ù…ÙˆÙ‚Ø¹</div>') +
                    fieldRow('site_type', b.site_type || 'airbase') + fieldRow('source_type', b.source_type) + '</div>';
            });
        }
        if (friendlyTrials.length) {
            html += '<div style="font-size:12px;color:#7fd6a0;font-weight:600;margin:8px 0 3px;">Friendly Anchors (BLUE) â€” Ù…Ø±Ø§Ø³Ù ØµØ¯ÙŠÙ‚Ø© (' + friendlyTrials.length + ')</div>';
            friendlyTrials.forEach(function (b) {
                var coord = (b.lat != null && b.lon != null) ? (b.lat + ', ' + b.lon) : null;
                html += '<div style="margin:3px 0;padding:6px 8px;border:1px solid #294333;background:#121a16;border-radius:4px;font-size:12px;">' +
                    fieldRow('base_name_ar', b.base_name_ar) + fieldRow('base_name_en', b.base_name_en) +
                    (coord ? fieldRow('coordinates', coord) : '<div style="color:#e0a93a;font-size:11px;">âš  No coordinate â€” ÙŠØ­ØªØ§Ø¬ Ø¨ÙŠØ§Ù†Ø§Øª Ù…ÙˆÙ‚Ø¹</div>') +
                    fieldRow('site_type', b.site_type || 'friendly_trial_anchor') + fieldRow('source_type', b.source_type) + '</div>';
            });
        }
        var missingAll = bases.concat(friendlyTrials).filter(function (b) { return !baseHasLocation(b); });
        if (missingAll.length) {
            html += '<div style="margin-top:6px;padding:5px 8px;border-radius:4px;background:#2a2412;border:1px solid #8b6a16;color:#e0c060;font-size:11px;">' +
                'âš  ' + missingAll.length + ' base(s) missing coordinates â€” need location data</div>';
        }
        return html;
    }
    function renderEnemyBases(p) {
        var bases = enemyBases(p);
        var friendlyTrials = friendlyTrialBases(p);
        if (!bases.length && !friendlyTrials.length) return '';
        var hasBothSides = bases.length > 0 && friendlyTrials.length > 0;
        var sectionLabel = hasBothSides ? 'Bases Review â€” Ù…Ø±Ø§Ø¬Ø¹Ø© Ø§Ù„Ù‚ÙˆØ§Ø¹Ø¯' : (friendlyTrials.length ? 'Friendly Anchors â€” Ù…Ø±Ø§Ø³Ù ØµØ¯ÙŠÙ‚Ø©' : 'Enemy Bases â€” Ù‚ÙˆØ§Ø¹Ø¯ Ø§Ù„Ø¹Ø¯Ùˆ');
        var sectionColor = hasBothSides ? '#cfe6ff' : (friendlyTrials.length ? '#7fd6a0' : '#f0a0a0');
        return '<section data-el="enemy-bases" style="margin:10px 0;padding:8px 0;border-top:1px solid #23303d;">' +
            '<div style="font-size:13px;color:' + sectionColor + ';font-weight:600;margin-bottom:6px;">' + esc(sectionLabel) + '</div>' +
            '<div style="margin-bottom:6px;">' + chip('Enemy', bases.length, '#f0a0a0') + chip('Friendly', friendlyTrials.length, '#7fd6a0') + '</div>' +
            renderEnemyBasesReviewPanel(bases, friendlyTrials) +
            '</section>';
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

    // â”€â”€ Import Summary helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    function getSideCategory(sideStr) {
        var s = String(sideStr || '').toUpperCase();
        if (/^(BLUE|FRIENDLY|BLUE_TEAM|FRIENDLY_FORCES|BLUE_SIDE)/.test(s)) return 'friendly';
        if (/^(RED|ENEMY|RED_TEAM|ENEMY_FORCES|RED_SIDE)/.test(s)) return 'enemy';
        return 'unknown';
    }
    function baseHasLocation(b) {
        if (!b) return false;
        if (Number.isFinite(Number(b.lat)) && Number.isFinite(Number(b.lon))) return true;
        if (Array.isArray(b.coord) && b.coord.length >= 2) return true;
        if (Array.isArray(b.coordinates) && b.coordinates.length >= 2) return true;
        if (b.location && Number.isFinite(Number(b.location.lat)) && Number.isFinite(Number(b.location.lon))) return true;
        return false;
    }
    function countMissingLocationBases(bases) {
        return arr(bases).filter(function (b) { return !baseHasLocation(b); }).length;
    }
    function issueText(item) {
        if (!item) return '';
        if (typeof item === 'string') return item;
        if (typeof item !== 'object') return String(item);
        return [item.key || item.field || item.name || item.mention || item.base_name_en || item.base_name_ar,
            item.type || item.reason || item.message || item.summary || item.status]
            .filter(Boolean).join(': ');
    }
    function uniqueIssueTexts(items) {
        var seen = {};
        return arr(items).map(issueText).filter(function (text) {
            if (!text || seen[text]) return false; seen[text] = true; return true;
        });
    }
    function criticalIssues(p) {
        var placement = (p && p.placement) || {};
        var understanding = (p && p.understanding) || {};
        return {
            missing_information: uniqueIssueTexts(placement.missing_information),
            conflicts: uniqueIssueTexts(placement.conflicts),
            ambiguities: uniqueIssueTexts(understanding.ambiguities),
        };
    }
    function hasCriticalIssues(p) {
        var issues = criticalIssues(p);
        return issues.missing_information.length > 0 || issues.conflicts.length > 0 || issues.ambiguities.length > 0;
    }
    function importSummary(p) {
        var ob = opBrief(p);
        var rollup = coalitionRollup(p);
        var issues = criticalIssues(p);
        var coalitionCount = rollup ? arr(rollup.coalitions).length : arr(ob.coalitions).length;
        var countryCount = rollup ? Number(rollup.country_count || arr(rollup.countries).length || 0) : arr(ob.countries).length;
        var allBases = arr(enemyBases(p)).concat(arr(friendlyTrialBases(p)));
        var units = proposedUnits(p);
        var friendly_units = 0, enemy_units = 0, unknown_units = 0;
        units.forEach(function (unit) {
            var category = getSideCategory(String((unit && unit.side) || ''));
            if (category === 'friendly') friendly_units++;
            else if (category === 'enemy') enemy_units++;
            else unknown_units++;
        });
        return {
            proposed_units: units.length,
            friendly_units: friendly_units,
            enemy_units: enemy_units,
            unknown_units: unknown_units,
            placement_candidates: placementCandidates(p).length,
            objectives: objectives(p).length,
            missing_information: issues.missing_information.length,
            conflicts: issues.conflicts.length,
            coalitions: coalitionCount,
            countries: countryCount,
            enemy_bases: arr(enemyBases(p)).length,
            friendly_trial_bases: arr(friendlyTrialBases(p)).length,
            missing_location_bases: countMissingLocationBases(allBases),
            readiness: hasCriticalIssues(p) ? 'Needs Review' : 'Ready',
        };
    }
    function summaryCard(label, value, tone, note) {
        return '<div style="min-width:120px;flex:1 1 120px;padding:8px 10px;border-radius:6px;background:#101820;border:1px solid #284050;">' +
            '<div style="font-size:11px;color:#8fa5b8;">' + esc(label) + '</div>' +
            '<div style="font-size:18px;font-weight:700;color:' + (tone || '#cfe6ff') + ';margin-top:2px;">' + esc(value) + '</div>' +
            (note ? '<div style="font-size:11px;color:#8fa5b8;margin-top:2px;">' + esc(note) + '</div>' : '') +
            '</div>';
    }
    function summaryChip(label, value, color, bg, border) {
        return '<span style="display:inline-block;margin:2px 4px 2px 0;padding:2px 7px;border-radius:999px;font-size:10px;line-height:1.3;color:' + color + ';background:' + bg + ';border:1px solid ' + border + ';">' +
            esc(label) + ': <b>' + esc(value) + '</b></span>';
    }
    function summaryCardWithChips(label, value, tone, chipsHtml) {
        return '<div style="min-width:120px;flex:1 1 120px;padding:8px 10px;border-radius:6px;background:#101820;border:1px solid #284050;">' +
            '<div style="font-size:11px;color:#8fa5b8;">' + esc(label) + '</div>' +
            '<div style="font-size:18px;font-weight:700;color:' + (tone || '#cfe6ff') + ';margin-top:2px;">' + esc(value) + '</div>' +
            '<div style="margin-top:3px;">' + chipsHtml + '</div>' +
            '</div>';
    }
    function renderImportSummary(p) {
        var summary = importSummary(p);
        var readinessTone = summary.readiness === 'Ready' ? '#7fd6a0' : '#e0c060';
        var coalitionNote = [];
        if (summary.coalitions) coalitionNote.push(summary.coalitions + ' coalitions');
        if (summary.countries) coalitionNote.push(summary.countries + ' countries');
        var proposedChips =
            summaryChip('Friendly / BLUE', summary.friendly_units, '#7fd6a0', '#121a16', '#294333') +
            summaryChip('Enemy / RED', summary.enemy_units, '#f0a0a0', '#1a1212', '#3d2a2a') +
            summaryChip('Unknown', summary.unknown_units, '#c9ced6', '#151a20', '#3d4a57');
        var baseChips =
            summaryChip('Enemy', summary.enemy_bases, '#f0a0a0', '#1a1212', '#3d2a2a') +
            summaryChip('Friendly', summary.friendly_trial_bases, '#7fd6a0', '#121a16', '#294333') +
            summaryChip('Missing loc', summary.missing_location_bases, '#e0c060', '#2a2412', '#5a4c2a');
        return '<section data-el="import-summary" style="margin:8px 0 10px;padding:10px;border-radius:6px;background:#0f171f;border:1px solid #284050;">' +
            '<div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap;margin-bottom:8px;">' +
            '<div>' +
            '<div style="font-size:13px;color:#cfe6ff;font-weight:700;">Import Summary â€” Ù…Ù„Ø®Øµ Ø§Ù„Ø§Ø³ØªÙŠØ±Ø§Ø¯</div>' +
            '<div style="font-size:12px;color:#9aa3ad;margin-top:2px;">Review counts first, then open only the sections that need attention.</div>' +
            '</div>' +
            '<div style="padding:5px 9px;border-radius:999px;border:1px solid ' + (summary.readiness === 'Ready' ? '#2e7d54' : '#8b6a16') + ';background:' + (summary.readiness === 'Ready' ? '#132219' : '#2a2412') + ';color:' + readinessTone + ';font-size:12px;font-weight:700;">' + esc(summary.readiness) + '</div>' +
            '</div>' +
            '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
            summaryCardWithChips('Proposed units', summary.proposed_units, '#cfe6ff', proposedChips) +
            summaryCard('Placement candidates', summary.placement_candidates, '#e0c060') +
            summaryCard('Objectives', summary.objectives, '#7fd6a0') +
            summaryCard('Missing information', summary.missing_information, summary.missing_information ? '#e0a93a' : '#7fd6a0') +
            summaryCard('Conflicts', summary.conflicts, summary.conflicts ? '#e0a93a' : '#7fd6a0') +
            ((summary.coalitions || summary.countries) ? summaryCard('Coalition / countries', summary.countries || 0, '#cfe6ff', coalitionNote.join(' Â· ')) : '') +
            (summary.enemy_bases || summary.friendly_trial_bases ? summaryCardWithChips('Bases', summary.enemy_bases + summary.friendly_trial_bases, '#cfe6ff', baseChips) : '') +
            '</div>' +
            '</section>';
    }
    function renderCriticalIssues(p) {
        var issues = criticalIssues(p);
        var total = issues.missing_information.length + issues.conflicts.length + issues.ambiguities.length;
        if (!total) {
            return '<section data-el="critical-issues" style="margin:8px 0 10px;padding:8px 10px;border-radius:6px;background:#101820;border:1px solid #284050;color:#7fd6a0;font-size:12px;">No critical issues detected.</section>';
        }
        return '<details data-el="critical-issues" open style="margin:8px 0 10px;padding:8px 10px;border-radius:6px;background:#101820;border:1px solid #5a4c2a;">' +
            '<summary style="cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:8px;align-items:center;color:#e0c060;font-size:13px;font-weight:700;">' +
            '<span>Critical Issues â€” Ø§Ù„Ù‚Ø¶Ø§ÙŠØ§ Ø§Ù„Ø­Ø±Ø¬Ø©</span><span style="font-size:11px;color:#9aa3ad;">' + esc(total) + ' items require review</span></summary>' +
            '<div style="margin-top:8px;">' +
            (issues.missing_information.length ? listBlock('Missing information', issues.missing_information, '#e0a93a') : '') +
            (issues.conflicts.length ? listBlock('Conflicts', issues.conflicts, '#e0a93a') : '') +
            (issues.ambiguities.length ? listBlock('Ambiguities', issues.ambiguities, '#e0a93a') : '') +
            '</div></details>';
    }

    // MULTI-COUNTRY-A: read the coalition rollup from understanding.coalition,
    // falling back to the brief's own coalition arrays. Null for non-coalition
    // payloads (so the section never renders for ordinary Step 1 imports).
    function coalitionRollup(p) {
        var u = (p && p.understanding) || {};
        if (u.coalition) return u.coalition;
        var ob = opBrief(p);
        if (arr(ob.coalitions).length || arr(ob.countries).length) {
            return {
                coalitions: arr(ob.coalitions), countries: arr(ob.countries),
                country_count: arr(ob.countries).length,
                red_country_count: arr(ob.countries).filter(function (c) { return c.side === 'RED'; }).length,
                blue_country_count: arr(ob.countries).filter(function (c) { return c.side === 'BLUE'; }).length,
                coalition_totals: ob.coalition_totals || null,
            };
        }
        return null;
    }
    // FREE-FIGHT-AI-LITE visibility fix: SHOWING the Free Fight card must NOT
    // require an Objective X â€” the operator places Objective X *inside* the demo,
    // so gating the card on an objective is a deadlock (can't open the card to
    // place the objective the card itself requires). Show whenever ANY demo-able
    // Step 1 data exists. Whether the demo can START (objective + groups +
    // anchors) is decided separately in free-fight-demo.js (canStartFreeFight).
    function canShowFreeFight(p) {
        if (coalitionRollup(p)) return true;                       // coalition implies data (not required)
        var ob = opBrief(p);
        var src = (p && p.placement) || {};
        var u = (p && p.understanding) || {};
        var hasUnits = arr(ob.proposed_units).length > 0 || arr(u.proposed_units).length > 0;
        var hasAnchorOrBase = arr(ob.placement_candidates).length > 0 || arr(src.placement_candidates).length > 0 ||
            arr(ob.enemy_bases).length > 0 || arr(ob.friendly_trial_bases).length > 0 || arr(ob.country_bases).length > 0;
        return hasUnits && hasAnchorOrBase;                        // units AND an anchor/base source â€” NO objective gate
    }
    function ffHasObjective(p) {
        var ob = opBrief(p);
        return arr(ob.objectives).length > 0 || arr((p && p.understanding && p.understanding.objectives)).length > 0 ||
            !!(ob.area_of_operations && ob.area_of_operations.center);
    }
    function canFreeFight(p) { return canShowFreeFight(p); }   // back-compat alias (no objective gate)
    function sideTone(side) {
        side = String(side || '').toUpperCase();
        return side === 'BLUE' ? '#7fd6a0' : (side === 'RED' ? '#f0a0a0' : '#d8d870');
    }
    function renderCoalitionRollup(p) {
        var r = coalitionRollup(p);
        if (!r) return '';
        var html = '<section data-el="coalition-rollup" style="margin:10px 0;padding:8px 0;border-top:1px solid #23303d;">' +
            '<div style="font-size:13px;color:#cfe6ff;font-weight:600;margin-bottom:6px;">Ø±Ø¨Ø· Ø§Ù„Ù‚ÙˆØ§Øª Ù…ØªØ¹Ø¯Ø¯ Ø§Ù„Ø¯ÙˆÙ„ â€” Coalition ORBAT</div>';
        html += '<div style="margin-bottom:6px;">' +
            chip('Countries detected â€” Ø§Ù„Ø¯ÙˆÙ„', r.country_count) +
            chip('RED countries â€” Ø¯ÙˆÙ„ Ø­Ù…Ø±Ø§Ø¡', r.red_country_count, '#f0a0a0') +
            chip('BLUE countries â€” Ø¯ÙˆÙ„ Ø²Ø±Ù‚Ø§Ø¡', r.blue_country_count, '#7fd6a0') + '</div>';
        // Per-side coalition totals.
        var totals = r.coalition_totals || {};
        Object.keys(totals).forEach(function (side) {
            var t = totals[side] || {};
            html += '<div style="margin:3px 0;font-size:12px;color:' + sideTone(side) + ';">' +
                esc(side) + ' coalition: ' +
                '<span style="color:#e8eaed;">' + (t.countries || 0) + ' countries Â· ' +
                (t.total_bases || 0) + ' bases (air ' + (t.air_bases || 0) + ' / naval ' + (t.naval_bases || 0) + ' / land ' + (t.land_bases || 0) + ') Â· ' +
                (t.proposed_units || 0) + ' proposed units</span></div>';
        });
        // Per-country breakdown.
        (r.countries || []).forEach(function (c) {
            var bc = c.base_counts || {};
            html += '<div style="margin:5px 0;padding:6px 8px;border:1px solid #2a2f37;background:#101820;border-radius:4px;font-size:12px;">' +
                '<div style="color:' + sideTone(c.side) + ';font-weight:600;direction:rtl;text-align:right;">' +
                esc(c.name || '-') + (c.name_en ? ' â€” ' + esc(c.name_en) : '') + ' <span style="color:#8fa5b8;">[' + esc(c.side) + ']</span></div>' +
                '<div style="color:#9ab;margin-top:3px;">' +
                'bases: air ' + (bc.air || 0) + ' Â· naval ' + (bc.naval || 0) + ' Â· land ' + (bc.land || 0) + ' Â· total <b>' + (bc.total || 0) + '</b>' +
                ' &nbsp;Â·&nbsp; proposed units <b>' + (c.proposed_unit_count || 0) + '</b></div></div>';
        });
        // Coalition membership lines.
        (r.coalitions || []).forEach(function (co) {
            html += '<div style="margin:3px 0;font-size:11px;color:#8fa5b8;">' +
                esc(co.name_en || co.id) + ': ' + esc((co.participants || []).join('ØŒ ')) + '</div>';
        });
        html += '</section>';
        return html;
    }

    function render(container, p, handlers) {
        handlers = handlers || {};
        p = p || {};
        var u = p.understanding || {};
        var pc = proposedCounts(p);
        var caps = assessReviewPayloadCapabilities(p);
        var html = '<div style="font-size:14px;color:#7fd6a0;font-weight:600;margin-bottom:8px;">AI understood this as â€” ÙÙ‡Ù… Ø§Ù„Ø°ÙƒØ§Ø¡ Ø§Ù„Ø§ØµØ·Ù†Ø§Ø¹ÙŠ</div>';
        html += '<div style="margin-bottom:8px;">' + chip('Type / Ø§Ù„Ù†ÙˆØ¹', (u.set_label_en || '') + ' â€” ' + (u.set_label_ar || ''), '#7fd6a0');
        (p.documents || []).forEach(function (d) {
            html += chip(d.filename || (d.hash || '').slice(0, 8), (d.type_label_en || d.detected_type) + ' Â· ' + Math.round((d.confidence || 0) * 100) + '%');
        });
        html += '</div>';
        if (p.debug_line || p.debug) {
            var dbg = p.debug || {};
            var debugLine = p.debug_line || ('build ' + (dbg.build_commit || '?') +
                ' | type ' + (dbg.detected_type || u.set_label_en || '?') +
                ' | proposed_units ' + (dbg.proposed_units_count || 0) +
                ' | placement_candidates ' + (dbg.placement_candidates_count || 0) +
                ' | enemy_bases ' + (dbg.enemy_bases_count || 0));
            html += '<div style="margin:0 0 8px;padding:5px 7px;border:1px solid #4a5a6a;background:#101820;color:#cfe6ff;border-radius:4px;font-size:11px;font-family:Consolas,monospace;direction:ltr;text-align:left;">' +
                esc(debugLine) + '</div>';
        }
        html += renderImportSummary(p);
        html += renderCriticalIssues(p);
        html += renderCapabilityStatus(p, caps);
        if (p.dedupe && p.dedupe.same_in_both_slots) {
            html += '<div style="margin-bottom:8px;padding:6px 8px;border-radius:5px;background:#2a2412;border:1px solid #b8860b;color:#e0c060;font-size:12px;">' +
                'â®• Same document in both slots â€” treated as ONE Mixed Operational Document. Ù†ÙØ³ Ø§Ù„ÙˆØ«ÙŠÙ‚Ø© ÙÙŠ Ø§Ù„Ø®Ø§Ù†ØªÙŠÙ† â€” Ø¹ÙˆÙ…Ù„Øª ÙƒÙˆØ«ÙŠÙ‚Ø© Ø¹Ù…Ù„ÙŠØ§Øª ÙˆØ§Ø­Ø¯Ø©.</div>';
        }
        if (u.mission) html += briefBlock('Mission â€” Ø§Ù„Ù…Ù‡Ù…Ø©', u.mission);
        if (u.commander_intent) html += briefBlock("Commander's intent â€” Ù†ÙŠØ© Ø§Ù„Ù‚Ø§Ø¦Ø¯", u.commander_intent);
        html += sideBlock('Friendly (BLUE) â€” Ù‚ÙˆØ§ØªÙ†Ø§ (Ø§Ù„Ø²Ø±Ù‚Ø§Ø¡)', u.friendly && u.friendly.summary, '#16241b', '#7fd6a0');
        html += sideBlock('Enemy (RED) â€” Ø§Ù„Ø¹Ø¯Ùˆ (Ø§Ù„Ø­Ù…Ø±Ø§Ø¡)', u.enemy && u.enemy.summary, '#241616', '#f0a0a0');
        if (u.neutral && (u.neutral.civilian || []).length) html += sideBlock('Neutral / civilian â€” Ù…Ø­Ø§ÙŠØ¯ / Ù…Ø¯Ù†ÙŠ', (u.neutral.civilian || []).join('\n'), '#24220f', '#d8d870');
        html += listBlock('Objectives â€” Ø§Ù„Ø£Ù‡Ø¯Ø§Ù', (u.objectives || []).map(function (o) { return o.name; }));
        html += listBlock('Phases â€” Ø§Ù„Ù…Ø±Ø§Ø­Ù„', (u.phases || []).map(function (ph) { return 'P' + ph.index + ': ' + ph.label; }));
        html += listBlock('Constraints / ROE â€” Ø§Ù„Ù‚ÙŠÙˆØ¯', (u.constraints || []).map(function (c) { return c.text; }));
        html += '<div style="margin:8px 0;">' +
            chip('Proposed units â€” Ø£Ø¹Ø¯Ø§Ø¯ Ù…Ù‚ØªØ±Ø­Ø©', 'BLUE ' + (pc.blue || 0) + ' / RED ' + (pc.red || 0) + ' / NEUTRAL ' + (pc.neutral || 0)) +
            chip('Map bounds â€” Ø­Ø¯ÙˆØ¯ Ø§Ù„Ø®Ø±ÙŠØ·Ø©', u.proposed_map_bounds ? 'from document' : 'not specified â€” set objective on map') + '</div>';
        html += renderCoalitionRollup(p);
        html += listBlock('Missing / ambiguous â€” Ù†ÙˆØ§Ù‚Øµ ÙˆØºÙ…ÙˆØ¶', u.ambiguities || [], '#e0a93a');
        html += renderTaskAssembly(p);
        html += renderUnitsDuty(p);
        html += renderDoctrineRequired(p);
        html += renderProposedUnits(p);
        html += renderEnemyBases(p);
        html += renderMissingInformation(p);
        html += renderStaffBrief2(p);
        if (p.llm_fill && !p.llm_fill.available) {
            html += '<div style="font-size:11px;color:#9aa3ad;margin:6px 0;">â„¹ Deep extraction (exact units &amp; intent) runs on the deployment LLM; this is the offline structural read.</div>';
        }
        // DOC-UNDERSTANDING-1 / G-3: COA Review Panel mount point. Painted by
        // shell/coa-review-panel.js when the brief carries courses_of_action[].
        html += '<div data-el="coa-panel"></div>';
        // DOC-UNDERSTANDING-1 / G-3C: location placement-candidates mount point.
        // Painted by shell/placement-candidates-panel.js when the wizard has
        // attached payload.placement (from /api/wargame-sim/placement).
        var placementList = placementCandidates(p);
        var placementClosed = Array.isArray(placementList) && placementList.length > 10;
        html += '<details data-el="placement-section"' + (placementClosed ? '' : ' open') + ' style="margin:10px 0;padding:8px 0;border-top:1px solid #23303d;">' +
            '<summary style="cursor:pointer;font-size:13px;color:#e0c060;font-weight:600;display:flex;justify-content:space-between;gap:8px;align-items:center;">' +
            '<span>Placement Candidates â€” Ù…ÙˆØ§Ù‚Ø¹ Ù…Ù‚ØªØ±Ø­Ø©</span>' +
            '<span style="font-size:11px;color:#8fa5b8;">' + esc(placementList.length) + ' found</span></summary>' +
            '<div style="font-size:11px;color:#8fa5b8;margin:6px 0;">Map anchors render immediately on the map; open this section for the full candidate list.</div>' +
            '<div data-el="placement-panel"></div>' +
            '</details>';
        html += '<div style="margin:10px 0 6px;font-size:12px;color:#9aa3ad;display:flex;align-items:center;gap:6px;flex-wrap:wrap;border-top:1px solid #23303d;padding-top:10px;">' +
            '<span>Operation template â€” Ù‚Ø§Ù„Ø¨ Ø§Ù„Ø¹Ù…Ù„ÙŠØ©:</span>' +
            '<select data-el="template" style="font:inherit;background:#161b18;color:#e8eaed;border:1px solid #4a5a6a;border-radius:4px;padding:3px 6px;">' +
            '<option value="">(auto-detect â€” ÙƒØ´Ù ØªÙ„Ù‚Ø§Ø¦ÙŠ)</option>' +
            '<option value="amphibious_landing">amphibious_landing â€” Ø¹Ù…Ù„ÙŠØ© Ø¥Ø¨Ø±Ø§Ø±</option>' +
            '<option value="attack_objective">attack_objective â€” Ù‡Ø¬ÙˆÙ… Ø¹Ù„Ù‰ Ù‡Ø¯Ù</option>' +
            '<option value="defend_objective">defend_objective â€” Ø¯ÙØ§Ø¹ Ø¹Ù† Ù‡Ø¯Ù</option>' +
            '<option value="reconnaissance">reconnaissance â€” Ø§Ø³ØªØ·Ù„Ø§Ø¹</option>' +
            '<option value="air_defense">air_defense â€” Ø¯ÙØ§Ø¹ Ø¬ÙˆÙŠ</option>' +
            '</select></div>';
        // G-3 approval gate message (hidden until a blocked Generate attempt).
        html += '<div data-el="coa-block-warn" style="display:none;margin:0 0 8px;padding:6px 8px;border-radius:5px;background:#2a2412;border:1px solid #b8860b;color:#e0c060;font-size:12px;"></div>';
        // DEMO-ACTUAL-1: map preview is available only when structured map
        // inputs exist. Text understanding alone remains visible but cannot
        // create preview layers without an extraction path.
        var showPreviewBtn = caps.map_preview_ready;
        var disabledPreview = !showPreviewBtn && caps.text_preview_ready;
        // FREE-FIGHT-DEMO-B (TEMPORARY debug): explains why the Free Fight button
        // is shown/hidden for the current review payload.
        var _ffOb = opBrief(p);
        var _ffBaseCount = arr(_ffOb.enemy_bases).length + arr(_ffOb.friendly_trial_bases).length + arr(_ffOb.country_bases).length;
        var _ffCardVisible = canShowFreeFight(p), _ffHasObj = ffHasObjective(p);
        html += '<div data-el="free-fight-debug" style="margin:8px 0;padding:5px 7px;border:1px dashed #4a5a6a;border-radius:4px;background:#0c1118;color:#8fb8e0;font-size:11px;font-family:Consolas,monospace;direction:ltr;text-align:left;">' +
            'free-fight debug Â· kind=' + esc(p.kind || (u && u.set_label_en) || 'unknown') +
            ' Â· has_coalition=' + (!!coalitionRollup(p)) +
            ' Â· has_objective=' + _ffHasObj +
            ' Â· proposed_units_count=' + proposedUnits(p).length +
            ' Â· placement_candidates_count=' + placementCandidates(p).length +
            ' Â· base_count=' + _ffBaseCount +
            ' Â· free_fight_card_visible=' + (!!_ffCardVisible) +
            ' Â· start_enabled=' + (!!(_ffCardVisible && _ffHasObj)) + '</div>';
        html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
            '<button type="button" data-act="generate" style="font:inherit;cursor:pointer;border:1px solid #2e7d54;background:#1f3a2b;color:#7fd6a0;border-radius:6px;padding:7px 14px;font-weight:600;">Generate Scenario â€” ØªÙˆÙ„ÙŠØ¯ Ø§Ù„Ø³ÙŠÙ†Ø§Ø±ÙŠÙˆ</button>' +
            '<button type="button" data-act="edit" style="font:inherit;cursor:pointer;border:1px solid #4a7bb8;background:#22303f;color:#cfe6ff;border-radius:6px;padding:7px 14px;">Edit Understanding â€” ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„ÙÙ‡Ù…</button>' +
            '<button type="button" data-act="more" style="font:inherit;cursor:pointer;border:1px solid #5a6270;background:#2a2f37;color:#e8eaed;border-radius:6px;padding:7px 14px;">Upload More â€” ÙˆØ«Ø§Ø¦Ù‚ Ø¥Ø¶Ø§ÙÙŠØ©</button>' +
            (showPreviewBtn ? '<button type="button" data-act="preview" style="font:inherit;cursor:pointer;border:1px solid #b8860b;background:#2a2412;color:#e0c060;border-radius:6px;padding:7px 14px;">Preview Decision Steps â€” Ù…Ø¹Ø§ÙŠÙ†Ø© Ø®Ø·ÙˆØ§Øª Ø§Ù„Ù‚Ø±Ø§Ø±</button>' : '') +
            (disabledPreview ? '<button type="button" data-act="preview-disabled" disabled title="' + esc('Missing: ' + caps.missing_for_map_preview.join(', ')) + '" style="font:inherit;cursor:not-allowed;border:1px solid #5a4c2a;background:#191711;color:#9a8550;border-radius:6px;padding:7px 14px;">Map Preview Not Ready â€” Ù…Ø¹Ø§ÙŠÙ†Ø© Ø§Ù„Ø®Ø±ÙŠØ·Ø© ØºÙŠØ± Ø¬Ø§Ù‡Ø²Ø©</button>' : '') +
            (coalitionRollup(p) ? '<button type="button" data-act="demo-movement" title="Symbolic demo only â€” not final tasking" style="font:inherit;cursor:pointer;border:1px solid #b8860b;background:#2a2412;color:#e0c060;border-radius:6px;padding:7px 14px;">Demo Movement â€” Ø­Ø±ÙƒØ© Ø¹Ø±Ø¶ (demo only)</button>' : '') +
            (canShowFreeFight(p) ? '<button type="button" data-act="free-fight" title="Symbolic AI-assisted demo â€” not final tasking" style="font:inherit;cursor:pointer;border:1px solid #7a3030;background:#241414;color:#f0a0a0;border-radius:6px;padding:7px 14px;">Free Fight Demo â€” Ù‚ØªØ§Ù„ ØªØ¬Ø±ÙŠØ¨ÙŠ (demo only)</button>' : '') +
            '<button type="button" data-act="cancel" style="font:inherit;cursor:pointer;border:1px solid #5a6270;background:#2a2f37;color:#e8eaed;border-radius:6px;padding:7px 14px;">Cancel â€” Ø¥Ù„ØºØ§Ø¡</button>' +
            '</div>' +
            '<details data-el="editbox" style="margin-top:8px;"><summary style="cursor:pointer;font-size:12px;color:#8fa5b8;">Operational Brief JSON â€” Ù…Ø³ÙˆØ¯Ø© Ø§Ù„Ù…ÙˆØ¬Ø²</summary>' +
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
        // selected BLUE COA (recommendation alone never satisfies this â€” D9).
        bind('generate', function () {
            var warn = container.querySelector('[data-el="coa-block-warn"]');
            if (window.RmoozCoaPanel && window.RmoozCoaPanel.hasCoas(p)) {
                var gate = window.RmoozCoaPanel.canGenerateNow();
                if (!gate.ok) {
                    if (warn) { warn.style.display = 'block'; warn.textContent = 'â›” ' + (gate.reason || window.RmoozCoaPanel.BLOCK_MESSAGE); }
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
        // DEMO-ACTUAL-1: preview decision steps (no write, no commit, no mutation).
        bind('preview', function () {
            if (!window.RmoozDemoPreview || typeof window.RmoozDemoPreview.build !== 'function') {
                alert('Preview module not loaded (shell/demo-scenario-preview.js)');
                return;
            }
            var previewBtn = container.querySelector('[data-act="preview"]');
            var prevLabel = previewBtn ? previewBtn.textContent : '';
            if (previewBtn) { previewBtn.disabled = true; previewBtn.textContent = 'â€¦'; }
            window.RmoozDemoPreview.build(p).then(function () {
                if (previewBtn) { previewBtn.disabled = false; previewBtn.textContent = prevLabel; }
            }).catch(function (err) {
                if (previewBtn) { previewBtn.disabled = false; previewBtn.textContent = prevLabel; }
                console.error('[demo-preview] build failed:', err);
                alert('Preview failed: ' + (err && (err.message || String(err))));
            });
        });
        bind('cancel', handlers.onCancel || function () { container.style.display = 'none'; });
        // MULTI-COUNTRY-DEMO-A: symbolic demo-movement overlay (demo only â€” no
        // final tasking, no world-state mutation). Shown for coalition briefs.
        bind('demo-movement', function () {
            if (window.RmoozDemoMovement && typeof window.RmoozDemoMovement.mount === 'function') {
                window.RmoozDemoMovement.mount(p);
            } else {
                alert('Demo movement module not loaded (shell/demo-movement.js)');
            }
        });
        // FREE-FIGHT-DEMO-A: symbolic RED-attacks-X / BLUE-reacts overlay (demo only).
        bind('free-fight', function () {
            if (window.RmoozFreeFightDemo && typeof window.RmoozFreeFightDemo.mount === 'function') {
                window.RmoozFreeFightDemo.mount(p);
            } else {
                alert('Free Fight demo module not loaded (shell/free-fight-demo.js)');
            }
        });
    }

    window.RmoozDocReview = { render: render, esc: esc, assessReviewPayloadCapabilities: assessReviewPayloadCapabilities };
})();
