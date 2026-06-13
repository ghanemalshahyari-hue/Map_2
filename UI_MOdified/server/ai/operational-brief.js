/**
 * Operational Brief assembly — DOC-UNDERSTANDING-1 / Phase D (JS gate).
 *
 * Deterministic, no-LLM scaffolding that runs before generation:
 *   • buildDocumentSet()  — sha256 content-hash dedupe across upload slots.
 *       The SAME file dropped into both the friendly and the enemy slot is
 *       collapsed into ONE document tagged "Mixed Operational Document"
 *       (Phase G #1) — never two contradictory sources.
 *   • segmentSides()      — split one mixed order's text into friendly /
 *       enemy / neutral buckets by Arabic + English headings (Phase G #3).
 *   • emptyBrief()        — the canonical Operational Brief JSON shape; the
 *       Python LLM stage fills mission/intent/units/prose, this layer seeds
 *       the structural facts (document list, side text, ambiguities).
 *
 * The unified brief is the ONLY input scenario generation reads (Phase F),
 * so generation works from extracted facts, not raw document chunks.
 */
'use strict';

const crypto = require('crypto');
const C = require('./document-classifier');
const { extractDocxText } = require('./docx-text');

function sha256(input) {
    const h = crypto.createHash('sha256');
    h.update(Buffer.isBuffer(input) ? input : Buffer.from(String(input != null ? input : ''), 'utf8'));
    return h.digest('hex');
}

// ── Canonical Operational Brief shape (Phase D spec) ────────────────
function emptyBrief() {
    return {
        document_set_id: '',
        documents: [],
        operational_brief: {
            mission: '',
            commander_intent: '',
            area_of_operations: {},
            friendly: { summary: '', units: [], tasks: [] },
            enemy:    { summary: '', units: [], assessed_capabilities: [], tasks: [] },
            neutral:  { civilian: [], infrastructure: [] },
            objectives: [],
            phases: [],
            timeline: [],
            constraints: [],
            assumptions: [],
            missing_information: [],
            ambiguities: [],
            source_citations: [],
            task_assembly: null,
            units_duty: null,
            placement_candidates: [],
            proposed_units: [],
            enemy_bases: [],
            friendly_trial_bases: [],
            enemy_forces: null,
            staff_brief_2: null,
            external_raw: {},
            // ── COA layer (additive; D9 approved 2026-06-11) ─────────
            // Candidate courses of action (each with wargame_turns[] per
            // L10), the structured force comparison, and the AI/rule-engine
            // recommendation. coa_recommendation.decided_by may ONLY ever be
            // set by the operator — never by AI.
            courses_of_action: [],
            force_comparison: null,
            coa_recommendation: null,
        },
    };
}

// ── Slot dedupe → document set ──────────────────────────────────────
// inputs: [{ slot:'red'|'blue'|…, filename, text?, bytes?, hash? }]
// A precomputed `hash` (e.g. of the raw DOCX bytes captured at stage-doc)
// wins; otherwise we hash bytes, else the extracted text.
function buildDocumentSet(inputs) {
    const list = Array.isArray(inputs) ? inputs.filter(Boolean) : [];
    const byHash = new Map();

    for (const item of list) {
        const hash = item.hash || sha256(item.bytes != null ? item.bytes : (item.text || ''));
        if (!byHash.has(hash)) byHash.set(hash, { hash, slots: [], filenames: [], text: '' });
        const g = byHash.get(hash);
        if (item.slot && g.slots.indexOf(item.slot) === -1) g.slots.push(item.slot);
        if (item.filename && g.filenames.indexOf(item.filename) === -1) g.filenames.push(item.filename);
        if (item.text && !g.text) g.text = item.text;     // keep first non-empty text
    }

    const documents = [];
    let anyBothSides = false;
    for (const g of byHash.values()) {
        const cls = C.classifyDocument(g.text || '');
        g.slots.sort();
        const inBothSlots = g.slots.indexOf('red') !== -1 && g.slots.indexOf('blue') !== -1;
        if (cls.contains_both_sides || inBothSlots) anyBothSides = true;
        documents.push({
            filename: g.filenames[0] || null,
            filenames: g.filenames,
            slots: g.slots,
            hash: g.hash,
            detected_type: cls.type,
            type_label_ar: cls.type_label_ar,
            type_label_en: cls.type_label_en,
            language: cls.language,
            confidence: cls.confidence,
            contains_both_sides: cls.contains_both_sides,
            in_both_slots: inBothSlots,
        });
    }

    const sameInBothSlots = documents.some(d => d.in_both_slots);

    // Set-level type: a single source carrying both sides — or the same file
    // in both slots, or several different-side docs — is a Mixed Operational
    // Document. Otherwise the lone document's own type carries through.
    let setType;
    if (anyBothSides || sameInBothSlots) {
        setType = C.TYPES.MIXED;
    } else if (documents.length === 1) {
        setType = documents[0].detected_type;
    } else if (documents.length === 0) {
        setType = C.TYPES.UNKNOWN;
    } else {
        setType = C.TYPES.MIXED;     // multiple distinct documents → combined
    }

    const hashes = documents.map(d => d.hash).sort();
    const setId = 'ds_' + sha256(hashes.join('|')).slice(0, 16);

    return {
        document_set_id: setId,
        documents,
        set_type: setType,
        set_label_ar: (C.LABELS[setType] || C.LABELS.unknown).ar,
        set_label_en: (C.LABELS[setType] || C.LABELS.unknown).en,
        dedupe: {
            input_count: list.length,
            unique_count: documents.length,
            duplicates_removed: list.length - documents.length,
            same_in_both_slots: sameInBothSlots,
        },
    };
}

// ── Side segmentation (Arabic + English headings) ───────────────────
// Walk the text line by line. A SIDE heading (friendly/enemy/neutral) must
// START the line after any list bullet — see document-classifier.lineRole —
// so a mid-sentence mention ("كشف اتصالات العدو") does NOT switch buckets.
// A structure heading (المهمة/التنفيذ/قيود/…) resets to "unmapped" so an order
// section doesn't leak into the previous side bucket. Lines that aren't
// headings continue the current bucket.
function segmentSides(text) {
    const raw = typeof text === 'string' ? text : '';
    const buckets = { friendly: [], enemy: [], neutral: [], unmapped: [] };
    let cur = 'unmapped';

    for (const line of raw.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const role = C.lineRole(line);
        if (role === 'friendly' || role === 'enemy' || role === 'neutral') cur = role;
        else if (role === 'structure') cur = 'unmapped';
        buckets[cur].push(line.trim());
    }

    return {
        friendly: buckets.friendly.join('\n'),
        enemy:    buckets.enemy.join('\n'),
        neutral:  buckets.neutral.join('\n'),
        unmapped: buckets.unmapped.join('\n'),
        flags: {
            friendly: buckets.friendly.length > 0,
            enemy:    buckets.enemy.length > 0,
            neutral:  buckets.neutral.length > 0,
        },
    };
}

// ── Deterministic brief seeding (offline; LLM refines on deployment) ─
const AR_ORDINALS = ['الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة'];

// Phases: lines headed "المرحلة <ordinal>".
function extractPhases(text) {
    const lines = String(text == null ? '' : text).split(/\r?\n/);
    const seen = new Set();
    const out = [];
    for (const line of lines) {
        const norm = C.normalize(line);
        for (let i = 0; i < AR_ORDINALS.length; i++) {
            if (norm.indexOf(C.normalize('المرحلة ' + AR_ORDINALS[i])) !== -1 && !seen.has(i)) {
                seen.add(i);
                out.push({ index: i + 1, label: line.trim().slice(0, 100), source: 'phase-heading' });
            }
        }
    }
    return out.sort((a, b) => a.index - b.index);
}

// Objectives: "الهدف X" / "objective X" mentions (deduped).
function extractObjectives(text) {
    const norm = C.normalize(text || '');
    const out = [];
    const seen = new Set();
    const push = name => { const k = name.trim(); if (k && !seen.has(k)) { seen.add(k); out.push({ name: k, source: 'document' }); } };
    let m;
    const reAr = /الهدف\s+([^\s().،,]{1,16})/g;
    while ((m = reAr.exec(norm)) !== null) push('الهدف ' + m[1].toUpperCase());
    const reEn = /objective\s+([a-z0-9]{1,16})/g;
    while ((m = reEn.exec(norm)) !== null) push('Objective ' + m[1].toUpperCase());
    return out.slice(0, 10);
}

// Lines under the first heading starting with one of `startMarkers`, up to
// maxLines, stopping at the next heading of any kind.
function extractSection(text, startMarkers, maxLines) {
    const lines = String(text == null ? '' : text).split(/\r?\n/);
    const out = [];
    let collecting = false;
    for (const line of lines) {
        if (!line.trim()) continue;
        if (!collecting && C.headingFor(line, startMarkers)) {
            collecting = true;
            const after = line.split(/[:：]/).slice(1).join(':').trim();
            if (after) out.push(after);
            continue;
        }
        if (collecting) {
            if (C.lineRole(line) !== null) break;
            out.push(line.trim());
            if (maxLines && out.length >= maxLines) break;
        }
    }
    return out;
}

// Rough per-side unit estimate from echelon-word occurrences (a labelled estimate).
function estimateUnitCount(text) {
    const n = C.normalize(text || '');
    let c = 0;
    for (const raw of C.UNIT_ECHELON_MARKERS) {
        const m = C.normalize(raw);
        if (!m) continue;
        let i = 0;
        while ((i = n.indexOf(m, i)) !== -1) { c++; i += m.length; }
    }
    return Math.min(500, c);
}

// ── Orchestrator: documents → AI-Understanding payload ──────────────
// inputs: [{ slot:'red'|'blue', filename, bytes?, text? }]
// Extracts text, dedupes by content hash, classifies, separates by side
// (slot first; a genuinely-mixed single doc is segmented), and seeds the
// Operational Brief deterministically. The Python docling+LLM stage refines
// mission/intent/units when reachable (see llm_fill marker).
function analyzeDocuments(inputs, opts) {
    opts = opts || {};
    const items = (Array.isArray(inputs) ? inputs : []).filter(Boolean).map(it => ({
        slot: it.slot, filename: it.filename, bytes: it.bytes, hash: it.hash,
        text: (it.text != null && it.text !== '') ? it.text
            : (it.bytes != null ? extractDocxText(it.bytes) : ''),
    }));

    const set = buildDocumentSet(items);

    const textByHash = new Map();
    for (const it of items) {
        const h = it.hash || sha256(it.bytes != null ? it.bytes : (it.text || ''));
        if (it.text && !textByHash.has(h)) textByHash.set(h, it.text);
    }

    const friendlyText = [], enemyText = [], neutralText = [], orderText = [];
    for (const doc of set.documents) {
        const text = textByHash.get(doc.hash) || '';
        orderText.push(text);
        if (doc.contains_both_sides || doc.in_both_slots) {
            const seg = segmentSides(text);
            if (seg.friendly) friendlyText.push(seg.friendly);
            if (seg.enemy) enemyText.push(seg.enemy);
            if (seg.neutral) neutralText.push(seg.neutral);
        } else if (doc.slots.indexOf('blue') !== -1 || doc.detected_type === C.TYPES.FRIENDLY_ORBAT) {
            friendlyText.push(text);
        } else if (doc.slots.indexOf('red') !== -1 || doc.detected_type === C.TYPES.ENEMY_ORBAT) {
            enemyText.push(text);
        }
    }
    const fJoin = friendlyText.join('\n'), eJoin = enemyText.join('\n'),
          nJoin = neutralText.join('\n'), allText = orderText.join('\n');

    const missionLines = extractSection(allText, ['المهمة المستخلصة', 'المهمة', 'mission'], 2);
    const intentLines  = extractSection(allText, ['نية القائد', "commander's intent", 'commander intent'], 3);
    const constraints  = extractSection(allText, ['قيود', 'القيود', 'مخاطر', 'المخاطر', 'constraints'], 8)
        .map(t => ({ text: t, source: 'constraints-section' }));
    const phases       = extractPhases(allText);
    const objectives   = extractObjectives(allText);

    const brief = emptyBrief();
    brief.document_set_id = set.document_set_id;
    brief.documents = set.documents.map(d => ({
        filename: d.filename, slots: d.slots, hash: d.hash,
        detected_type: d.detected_type, type_label_ar: d.type_label_ar,
        type_label_en: d.type_label_en, language: d.language, confidence: d.confidence,
    }));
    const ob = brief.operational_brief;
    ob.mission = missionLines.join(' ').slice(0, 600);
    ob.commander_intent = intentLines.join(' ').slice(0, 600);
    ob.friendly.summary = fJoin.slice(0, 500);
    ob.enemy.summary = eJoin.slice(0, 500);
    if (nJoin) ob.neutral.civilian = [nJoin.slice(0, 300)];
    ob.objectives = objectives;
    ob.phases = phases.map(p => ({ index: p.index, label: p.label }));
    ob.constraints = constraints;

    const proposed_unit_counts = {
        red: estimateUnitCount(eJoin),
        blue: estimateUnitCount(fJoin),
        neutral: nJoin ? estimateUnitCount(nJoin) : 0,
    };

    const ambiguities = [];
    if (!ob.mission) ambiguities.push('Mission not found deterministically — confirm or let the LLM extract it.');
    if (!objectives.length) ambiguities.push('No named objective (الهدف …) detected — set the objective position on the map.');
    if (!phases.length) ambiguities.push('No phases (المرحلة …) detected.');
    ambiguities.push('Map bounds / منطقة العمليات not specified in the document — operator must set the objective position.');
    for (const d of set.documents) {
        if (d.confidence < 0.5) ambiguities.push('Low-confidence document type for ' + (d.filename || d.hash.slice(0, 8)) + ' — please confirm.');
    }
    if (!proposed_unit_counts.blue) ambiguities.push('Could not estimate friendly (BLUE) unit count.');
    if (!proposed_unit_counts.red) ambiguities.push('Could not estimate enemy (RED) unit count.');

    return {
        ok: true,
        document_set_id: set.document_set_id,
        set_type: set.set_type,
        set_label_ar: set.set_label_ar,
        set_label_en: set.set_label_en,
        documents: brief.documents,
        dedupe: set.dedupe,
        brief,
        understanding: {
            set_type: set.set_type,
            set_label_ar: set.set_label_ar,
            set_label_en: set.set_label_en,
            mission: ob.mission,
            commander_intent: ob.commander_intent,
            friendly: { summary: ob.friendly.summary, source: 'BLUE slot / friendly ORBAT' },
            enemy: { summary: ob.enemy.summary, source: 'RED slot / enemy ORBAT' },
            neutral: ob.neutral,
            objectives, phases, constraints,
            assumptions: ob.assumptions,
            ambiguities,
            proposed_unit_counts,
            proposed_map_bounds: null,
        },
        llm_fill: { available: false, reason: opts.llmReason || 'LLM endpoint not reached from this host; deterministic JS-gate brief only.' },
    };
}

// ── JSON input support (Phase F, steps 2-5) ─────────────────────────
function arr(v) { return Array.isArray(v) ? v : []; }
function mergeSide(side, defaults) {
    var out = Object.assign({}, defaults);
    if (side && typeof side === 'object') {
        if (typeof side.summary === 'string') out.summary = side.summary;
        if (Array.isArray(side.units)) out.units = side.units;
        if (Array.isArray(side.tasks)) out.tasks = side.tasks;
        if (Array.isArray(side.assessed_capabilities)) out.assessed_capabilities = side.assessed_capabilities;
    }
    return out;
}

// ── MDMP-EXTERNAL-1 (G-1): detect the other app's MDMP-stage JSON ────
// The external pipeline emits flat key→Arabic-narrative objects per MDMP
// stage. We recognize them by KEY fingerprints (values are often placeholder
// templates), and tag which stage so the adapter (G-2, pending owner
// decisions) and the review screen know what they hold. Order matters:
// the most distinctive stages are checked first.
const MDMP_STEPS = [
    { step: 'coa_analysis',     // step 4 — wargame (action/reaction/counteraction)
      any: ['possible_operation_phase1', 'Most_likely_enemy_action',
            'crossing_LD_and_breaching_mines_acting', 'combat_on_objectives_acting_phase1'] },
    { step: 'coa_comparison',   // step 5 — strengths/weaknesses per criterion
      any: ['possible_operation_1', 'strengths_attacking_cog',
            'overall_comparison_conclusion', 'strengths_attacking_cog_c2'] },
    { step: 'coa_development',  // step 3 — force comparison + possible works
      any: ['phose_one', 'Infantry_Battalion_total_our', 'Our_available_forces',
            'Strengths_and_weaknesses_of_the_enemy_in_terms_of_maneuverability'] },
    // planning_guidance BEFORE staff_brief: the step-1 package embeds the
    // intel-summary keys too, so it must be claimed by its unique header
    // fields (letter ref / assembly area / task_assembly) first.
    { step: 'planning_guidance', // step 1 / WARNO package (also the field dictionary)
      any: ['letter_ref_number', 'Assembly_Area', 'task_assembly',
            'Units_Duty', 'GROUND_COMPONENT_MISSION', 'Operational_Assumptions'] },
    { step: 'staff_brief_2',
      any: ['Staff_Brief_2', 'staff_brief_2', 'sections', 'intel_summary', 'enemy_capabilities',
            'operations', 'hr', 'logistics'] },
    { step: 'staff_brief',      // step 2 outputs — intel summary / capabilities
      any: ['Enemy_Capabilities', 'First_light', 'Recent_and_Ongoing_Activities',
            'join_op_mission'] },
];

const STEP1_WRAPPER_KEYS = [
    'operational_brief', 'step1', 'Step1', 'Step_1', 'planning_guidance',
    'Planning_Guidance', 'external_step1', 'External_Step_1',
    'step_1', 'Step_1_Output', 'initial_planning_guide',
    'initial_planning_guidance', 'data', 'payload', 'document',
    'external_json', 'raw_external_json',
];

function step1FingerprintKeys(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return [];
    var matched = [];
    ['task_assembly', 'Units_Duty', 'doctrine_upload_required', 'letter_ref_number',
     'warning_order', 'Warning_Order', 'WARNORD', 'Assembly_Area',
     'GROUND_COMPONENT_MISSION', 'Operational_Assumptions'].forEach(function (k) {
        if (k in obj) matched.push(k);
    });
    if (String(obj.external_step || obj.step || '').trim() === '1') matched.push('external_step');
    var pkg = String(obj.package_type || obj.Package_Type || obj.document_type || obj.type || '');
    if (/step\s*[-_ ]*1|staff\s*brief\s*1|planning\s*guidance|initial\s*planning|warnord|warning\s*order/i.test(pkg)) {
        matched.push('package_type');
    }
    if (obj.enemy_forces && typeof obj.enemy_forces === 'object') {
        ['bases', 'air_bases', 'naval_bases', 'land_bases'].forEach(function (k) {
            if (Array.isArray(obj.enemy_forces[k])) matched.push('enemy_forces.' + k);
        });
    }
    if (obj.friendly_forces && typeof obj.friendly_forces === 'object' &&
            Array.isArray(obj.friendly_forces.trial_bases)) matched.push('friendly_forces.trial_bases');
    var sm = obj.scenario_metadata;
    var st = sm && sm.scenario_type;
    if (typeof st === 'string' && /step\s*[-_ ]*1/i.test(st)) matched.push('scenario_metadata.scenario_type');
    return matched;
}

function getExternalStep1Root(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    var roots = [{ path: '', value: obj }];
    var seen = new Set([obj]);
    for (var depth = 0; depth < roots.length && depth < 24; depth++) {
        var cur = roots[depth].value;
        STEP1_WRAPPER_KEYS.forEach(function (k) {
            if (cur[k] && typeof cur[k] === 'object' && !Array.isArray(cur[k]) && !seen.has(cur[k])) {
                seen.add(cur[k]);
                roots.push({ path: roots[depth].path ? roots[depth].path + '.' + k : k, value: cur[k] });
            }
        });
    }
    var baseRoots = roots.slice();
    for (var ui = 0; ui < baseRoots.length; ui++) {
        var root = baseRoots[ui].value;
        if (root.operational_brief && typeof root.operational_brief === 'object' && !Array.isArray(root.operational_brief)) {
            var merged = Object.assign({}, root.operational_brief);
            ['task_assembly', 'Units_Duty', 'doctrine_upload_required', 'doctrine_sources',
             'doctrine_application_policy', 'enemy_forces', 'friendly_forces',
             'proposed_units', 'placement_candidates', 'missing_information',
             'external_step', 'step', 'package_type', 'Package_Type', 'document_type',
             'type', 'scenario_metadata'].forEach(function (k) {
                if (root[k] !== undefined && merged[k] === undefined) merged[k] = root[k];
            });
            roots.push({
                path: baseRoots[ui].path ? baseRoots[ui].path + '.operational_brief' : 'operational_brief',
                value: merged,
            });
        }
    }
    for (var i = 0; i < roots.length; i++) {
        var matched = step1FingerprintKeys(roots[i].value);
        if (matched.length) return {
            root: roots[i].value,
            path: roots[i].path,
            matched: matched.map(function (k) { return roots[i].path ? roots[i].path + '.' + k : k; }),
        };
    }
    return null;
}

function detectMdmp(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { is: false };
    var step1 = getExternalStep1Root(obj);
    if (step1) return { is: true, step: 'planning_guidance', matched: step1.matched };
    for (const def of MDMP_STEPS) {
        const matched = def.any.filter(k => k in obj);
        if (matched.length) return { is: true, step: def.step, matched };
    }
    return { is: false };
}

// Detect what a posted JSON object is.
function classifyJsonInput(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return 'unknown';
    if (Array.isArray(obj.red_units) && Array.isArray(obj.blue_units_initial)) return 'rmooz_scenario';
    if (detectMdmp(obj).is) return 'mdmp_external';
    if (obj.operational_brief && typeof obj.operational_brief === 'object') return 'operational_brief';
    if (obj.friendly && obj.enemy &&
        (typeof obj.mission === 'string' || Array.isArray(obj.objectives) || Array.isArray(obj.phases))) {
        return 'operational_brief';   // bare operational_brief object
    }
    return 'unknown';
}

// Lenient brief validation: present operational_brief ⇒ ok; thin fields ⇒ warnings.
function validateBrief(input) {
    var errors = [], warnings = [];
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        errors.push({ path: '', msg: 'brief must be a JSON object' });
        return { ok: false, errors, warnings };
    }
    var ob = (input.operational_brief && typeof input.operational_brief === 'object') ? input.operational_brief : input;
    if (!ob || typeof ob !== 'object') { errors.push({ path: 'operational_brief', msg: 'missing operational_brief' }); }
    else {
        if (typeof ob.mission !== 'string' || !ob.mission.trim()) warnings.push({ path: 'mission', msg: 'mission empty' });
        if (!ob.friendly || typeof ob.friendly !== 'object') warnings.push({ path: 'friendly', msg: 'missing friendly' });
        if (!ob.enemy || typeof ob.enemy !== 'object') warnings.push({ path: 'enemy', msg: 'missing enemy' });
        if (!Array.isArray(ob.objectives) || !ob.objectives.length) warnings.push({ path: 'objectives', msg: 'no objectives' });
    }
    return { ok: errors.length === 0, errors, warnings };
}

// Coerce any brief (wrapped or bare) into the canonical emptyBrief() shape.
function normalizeBrief(input) {
    var out = emptyBrief();
    if (!input || typeof input !== 'object') return out;
    var ob = (input.operational_brief && typeof input.operational_brief === 'object') ? input.operational_brief : input;
    out.document_set_id = input.document_set_id || ('ds_brief_' + sha256(JSON.stringify(ob)).slice(0, 12));
    out.documents = arr(input.documents);
    if (input.template) out.template = input.template;
    if (input.set_type) out.set_type = input.set_type;
    var o = out.operational_brief;
    o.mission = typeof ob.mission === 'string' ? ob.mission : '';
    o.commander_intent = typeof ob.commander_intent === 'string' ? ob.commander_intent : '';
    o.area_of_operations = (ob.area_of_operations && typeof ob.area_of_operations === 'object') ? ob.area_of_operations : {};
    o.friendly = mergeSide(ob.friendly, { summary: '', units: [], tasks: [] });
    o.enemy = mergeSide(ob.enemy, { summary: '', units: [], assessed_capabilities: [], tasks: [] });
    o.neutral = (ob.neutral && typeof ob.neutral === 'object')
        ? { civilian: arr(ob.neutral.civilian), infrastructure: arr(ob.neutral.infrastructure) }
        : { civilian: [], infrastructure: [] };
    o.objectives = arr(ob.objectives);
    o.phases = arr(ob.phases);
    o.timeline = arr(ob.timeline);
    o.constraints = arr(ob.constraints);
    o.assumptions = arr(ob.assumptions);
    o.missing_information = arr(ob.missing_information);
    o.ambiguities = arr(ob.ambiguities);
    o.source_citations = arr(ob.source_citations);
    o.task_assembly = (ob.task_assembly && typeof ob.task_assembly === 'object') ? ob.task_assembly : null;
    o.units_duty = ob.units_duty != null ? ob.units_duty : null;
    o.placement_candidates = arr(ob.placement_candidates);
    o.proposed_units = arr(ob.proposed_units);
    o.enemy_bases = arr(ob.enemy_bases);
    o.friendly_trial_bases = arr(ob.friendly_trial_bases);
    o.enemy_forces = (ob.enemy_forces && typeof ob.enemy_forces === 'object') ? ob.enemy_forces : null;
    o.staff_brief_2 = (ob.staff_brief_2 && typeof ob.staff_brief_2 === 'object') ? ob.staff_brief_2 : null;
    o.external_raw = (ob.external_raw && typeof ob.external_raw === 'object') ? ob.external_raw : {};
    // COA layer (additive, D9) — preserved verbatim through normalization.
    o.courses_of_action = arr(ob.courses_of_action);
    o.force_comparison = (ob.force_comparison && typeof ob.force_comparison === 'object') ? ob.force_comparison : null;
    o.coa_recommendation = (ob.coa_recommendation && typeof ob.coa_recommendation === 'object') ? ob.coa_recommendation : null;
    return out;
}

// Build the AI-Understanding payload from a normalized brief.
function understandingFromBrief(brief) {
    var ob = (brief && brief.operational_brief) || {};
    var ambiguities = arr(ob.ambiguities).slice();
    var proposedUnits = arr(ob.proposed_units);
    var countSide = function (side) {
        return proposedUnits.filter(function (u) { return String((u && u.side) || '').toUpperCase() === side; }).length;
    };
    var redCount = countSide('RED') || arr(ob.enemy && ob.enemy.units).length;
    var blueCount = countSide('BLUE') || arr(ob.friendly && ob.friendly.units).length;
    var neutralCount = countSide('NEUTRAL') || arr(ob.neutral && ob.neutral.civilian).length;
    if (!ob.mission) ambiguities.push('Mission not present in the brief.');
    if (!arr(ob.objectives).length) ambiguities.push('No objectives in the brief — set the objective on the map.');
    if (!arr(ob.phases).length) ambiguities.push('No phases in the brief.');
    var labelEn = 'Operational Brief';
    var labelAr = 'الموجز التشغيلي';
    if (brief && brief.set_type === 'mdmp_external') {
        var steps = arr(brief.documents).map(function (d) { return d && d.mdmp_step; }).filter(Boolean);
        var uniqueSteps = Array.from(new Set(steps));
        if (uniqueSteps.length === 1 && uniqueSteps[0] === 'planning_guidance') {
            labelEn = 'External App Step 1';
            labelAr = 'خطوة 1 من تطبيق خارجي';
        } else if (uniqueSteps.indexOf('planning_guidance') !== -1) {
            labelEn = 'External MDMP Bundle (Step 1 included)';
            labelAr = 'حزمة MDMP خارجية تتضمن الخطوة 1';
        } else if (uniqueSteps.length === 1 && uniqueSteps[0] === 'staff_brief_2') {
            labelEn = 'External Staff Brief 2';
            labelAr = 'إيجاز الأركان 2 من تطبيق خارجي';
        } else {
            labelEn = 'External MDMP Bundle';
            labelAr = 'حزمة MDMP خارجية';
        }
    }
    return {
        set_type: brief.set_type || 'operational_brief',
        set_label_en: labelEn, set_label_ar: labelAr,
        mission: ob.mission || '', commander_intent: ob.commander_intent || '',
        friendly: { summary: (ob.friendly && ob.friendly.summary) || '', source: 'brief JSON' },
        enemy: { summary: (ob.enemy && ob.enemy.summary) || '', source: 'brief JSON' },
        neutral: ob.neutral || { civilian: [], infrastructure: [] },
        objectives: arr(ob.objectives), phases: arr(ob.phases), constraints: arr(ob.constraints),
        assumptions: arr(ob.assumptions), ambiguities: ambiguities,
        proposed_unit_counts: {
            red: redCount,
            blue: blueCount,
            neutral: neutralCount,
        },
        proposed_units: proposedUnits,
        task_assembly: ob.task_assembly || null,
        staff_brief_2: ob.staff_brief_2 || null,
        proposed_map_bounds: (ob.area_of_operations && ob.area_of_operations.bbox) || null,
        // COA layer summary (additive, D9) — cards rendered by the COA panel (G-3).
        coas: arr(ob.courses_of_action).map(function (c) {
            return { id: c.id, name: c.name, side: c.side, confidence: c.confidence,
                     turns: arr(c.wargame_turns).length, needs_review: c.needs_review !== false };
        }),
        coa_recommendation: ob.coa_recommendation || null,
    };
}

// Summarize an already-built RMOOZ scenario for the review screen.
function understandingFromScenario(scn) {
    scn = scn || {};
    return {
        set_type: 'rmooz_scenario', set_label_en: 'RMOOZ Scenario', set_label_ar: 'سيناريو جاهز',
        mission: scn.scenario_label || '', commander_intent: '',
        friendly: { summary: 'BLUE units: ' + arr(scn.blue_units_initial).length, source: 'scenario JSON' },
        enemy: { summary: 'RED units: ' + arr(scn.red_units).length, source: 'scenario JSON' },
        neutral: { civilian: [], infrastructure: [] },
        objectives: (scn.obj && scn.obj.name) ? [{ name: scn.obj.name, coord: scn.obj.coord, source: 'scenario' }] : [],
        phases: arr(scn.phase_table).map(function (p, i) { return { index: i, label: String(p.phase || p.time_label || ('P' + i)) }; }),
        constraints: [], assumptions: [], ambiguities: [],
        proposed_unit_counts: { red: arr(scn.red_units).length, blue: arr(scn.blue_units_initial).length, neutral: arr(scn.neutral_units).length },
        proposed_map_bounds: scn.map_bbox || null,
    };
}

// Best-effort map an unrecognized JSON object into a low-confidence brief.
function unknownToBrief(input) {
    var out = emptyBrief();
    var mapped = [], o = out.operational_brief;
    if (input && typeof input === 'object' && !Array.isArray(input)) {
        var pick = function (keys) { for (var i = 0; i < keys.length; i++) { var k = keys[i]; if (typeof input[k] === 'string' && input[k].trim()) return input[k]; } return ''; };
        o.mission = pick(['mission', 'task', 'objective_text', 'summary']); if (o.mission) mapped.push('mission');
        o.commander_intent = pick(['commander_intent', 'intent']); if (o.commander_intent) mapped.push('commander_intent');
        if (Array.isArray(input.objectives)) {
            o.objectives = input.objectives.map(function (x) {
                return typeof x === 'string' ? { name: x, source: 'unknown-json' }
                    : (x && x.name ? { name: x.name, coord: x.coord, source: 'unknown-json' } : null);
            }).filter(Boolean);
            if (o.objectives.length) mapped.push('objectives');
        }
        if (Array.isArray(input.phases)) {
            o.phases = input.phases.map(function (x, i) {
                return typeof x === 'string' ? { index: i + 1, label: x }
                    : (x && (x.label || x.name) ? { index: x.index || i + 1, label: x.label || x.name } : null);
            }).filter(Boolean);
            if (o.phases.length) mapped.push('phases');
        }
        if (input.friendly) { o.friendly.summary = typeof input.friendly === 'string' ? input.friendly : (input.friendly.summary || ''); if (o.friendly.summary) mapped.push('friendly'); }
        if (input.enemy) { o.enemy.summary = typeof input.enemy === 'string' ? input.enemy : (input.enemy.summary || ''); if (o.enemy.summary) mapped.push('enemy'); }
    }
    out.document_set_id = 'ds_unknown_' + sha256(JSON.stringify(input || {})).slice(0, 12);
    var ambiguities = ['Input JSON type not recognized — mapped best-effort into an Operational Brief. Review every field before generating.'];
    if (!mapped.length) ambiguities.push('No recognizable operational fields were found.');
    out.operational_brief.ambiguities = ambiguities;
    return { brief: out, mapped: mapped, confidence: 'low' };
}

module.exports = {
    sha256,
    emptyBrief,
    buildDocumentSet,
    segmentSides,
    extractPhases,
    extractObjectives,
    extractSection,
    estimateUnitCount,
    analyzeDocuments,
    // Phase F JSON input:
    classifyJsonInput,
    detectMdmp,
    getExternalStep1Root,
    validateBrief,
    normalizeBrief,
    understandingFromBrief,
    understandingFromScenario,
    unknownToBrief,
};
