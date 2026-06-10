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
            ambiguities: [],
            source_citations: [],
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
};
