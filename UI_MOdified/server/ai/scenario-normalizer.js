/**
 * Scenario unit normalizer — DOC-UNDERSTANDING-1 / Phase C.
 *
 * Deterministic, no-LLM pass that runs BEFORE a generated scenario is
 * saved/imported. It guarantees each side stays within the schema ceiling
 * (≤ 500, see scenario-schema-spec.js COUNT_BOUNDS) so a faithful import
 * both WRITES and LOADS, while keeping the militarily-important units.
 *
 * It NEVER invents units. When a side is over the cap it:
 *   1. PRESERVES, in priority order, units that matter:
 *        5  referenced by a phase/step (actors / affected / engagement arcs)
 *        4  HQ / command units
 *        3  air defense / sensors / high-value assets (SAM, radar, ISR, EW, SSM…)
 *        2  objective-linked units (inside the objective radius, or named "OBJ")
 *        1  BLS-linked units (red unit whose `bls` references a known BLS)
 *        0  plain / support units  ← the only tier eligible to fold or drop
 *   2. AGGREGATES duplicate plain/support units (same side+role+echelon+bls+kind)
 *      into a single existing representative carrying `aggregated_count` /
 *      `aggregated_uids` — only as many as needed to get under the cap.
 *   3. HARD-DROPS the lowest-priority remaining plain units only if
 *      aggregation cannot free enough slots (e.g. all singletons).
 *
 * Returns { scenario, report, changed }. The scenario is mutated IN PLACE
 * (its side arrays are replaced) and also returned for convenience. When no
 * side exceeds the cap the scenario is untouched and changed === false.
 *
 * Report shape:
 *   {
 *     cap,                       // per-side ceiling used
 *     changed,                   // did any side get normalized?
 *     before:  { red, blue, neutral },
 *     after:   { red, blue, neutral },
 *     preserved:  [{ side, uid, reason }],
 *     aggregated: [{ side, representative_uid, merged_count, merged_uids, key }],
 *     dropped:    [{ side, uid, reason }],
 *   }
 */
'use strict';

const DEFAULT_CAP = 500;
const DEFAULT_OBJ_RADIUS_KM = 15;

// Which scenario arrays are per-side ORBATs, and how a unit's id is keyed.
const SIDE_DEFS = [
    { key: 'red',     arr: 'red_units',          idKey: 'uid' },
    { key: 'blue',    arr: 'blue_units_initial', idKey: 'unit_uid' },
    { key: 'neutral', arr: 'neutral_units',      idKey: 'uid' },
];

// ── Classification keyword sets (English regex + Arabic substrings) ──
const RE_HQ    = /\b(hq|hqs|command|cmd|comd|headquarters|cp|tac|toc|c2)\b/i;
const AR_HQ    = ['قياد', 'سيطر', 'مركز قيادة', 'ركن'];
const RE_ADHVA = /\b(air[\s-]?def|sam|gbad|manpad|adm|radar|sensor|isr|sigint|elint|ew|awacs|surface[\s-]?to[\s-]?air|ssm|tbm|missile|battery)\b/i;
const AR_ADHVA = ['دفاع جوي', 'مضاد للطائرات', 'رادار', 'استطلاع', 'صاروخ', 'صواريخ'];
const RE_OBJ   = /\b(obj|objective)\b/i;
const AR_OBJ   = ['هدف'];

function matchAny(text, re, arabicList) {
    if (!text) return false;
    if (re && re.test(text)) return true;
    for (const a of arabicList) if (text.indexOf(a) !== -1) return true;
    return false;
}

// Free-text blob used for keyword classification.
function unitText(u) {
    return [u.role, u.label, u.echelon, u.name_ar, u.name_en, u.kind, u.sidc]
        .filter(Boolean).join(' ');
}

function isCoord(c) {
    return Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]);
}

// Haversine great-circle distance in km.
function haversineKm(a, b) {
    const R = 6371;
    const toRad = d => (d * Math.PI) / 180;
    const dLat = toRad(b[1] - a[1]);
    const dLon = toRad(b[0] - a[0]);
    const lat1 = toRad(a[1]);
    const lat2 = toRad(b[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Collect every uid that a phase/step (or authoritative per-step coord map)
// references — these units must survive so the timeline stays renderable.
function buildReferencedSet(scenario) {
    const ref = new Set();
    const add = v => { if (v != null && v !== '') ref.add(String(v)); };

    const steps = Array.isArray(scenario.steps) ? scenario.steps : [];
    for (const s of steps) {
        if (!s || typeof s !== 'object') continue;
        for (const a of (Array.isArray(s.actors) ? s.actors : []))   add(a && a.uid);
        for (const a of (Array.isArray(s.affected) ? s.affected : [])) add(a && a.uid);
        for (const e of (Array.isArray(s.engagement_arcs) ? s.engagement_arcs : [])) {
            add(e && e.actor_uid); add(e && e.target_uid);
        }
    }
    // W3-rich authoritative per-step position maps are keyed by uid.
    for (const mapKey of ['red_unit_step_coords', 'red_unit_step_prev',
                          'blue_unit_step_coords', 'blue_unit_step_prev']) {
        const m = scenario[mapKey];
        if (m && typeof m === 'object' && !Array.isArray(m)) {
            for (const k of Object.keys(m)) add(k);
        }
    }
    return ref;
}

function buildContext(scenario, opts) {
    const blsNames = new Set(
        (Array.isArray(scenario.bls_template) ? scenario.bls_template : [])
            .map(b => b && b.name).filter(Boolean)
    );
    const objCoord = scenario.obj && isCoord(scenario.obj.coord) ? scenario.obj.coord : null;
    const objRadiusKm = (scenario.obj && Number.isFinite(scenario.obj.radius_km) && scenario.obj.radius_km > 0)
        ? scenario.obj.radius_km
        : (opts.objRadiusKm || DEFAULT_OBJ_RADIUS_KM);
    return {
        referenced: buildReferencedSet(scenario),
        blsNames,
        objCoord,
        objRadiusKm,
    };
}

// Returns { score, reason } — higher score = higher retention priority.
function classify(u, sideKey, ctx) {
    const id = u[SIDE_DEFS.find(d => d.key === sideKey).idKey];
    if (id != null && ctx.referenced.has(String(id))) return { score: 5, reason: 'referenced-by-phase' };

    const text = unitText(u);
    if (matchAny(text, RE_HQ, AR_HQ))       return { score: 4, reason: 'hq-command' };
    if (matchAny(text, RE_ADHVA, AR_ADHVA)) return { score: 3, reason: 'air-defense/sensor/high-value' };

    if (ctx.objCoord && isCoord(u.coord) && haversineKm(u.coord, ctx.objCoord) <= ctx.objRadiusKm) {
        return { score: 2, reason: 'objective-linked' };
    }
    if (matchAny(text, RE_OBJ, AR_OBJ))     return { score: 2, reason: 'objective-linked' };

    if (sideKey === 'red' && u.bls && ctx.blsNames.has(u.bls)) return { score: 1, reason: 'bls-linked' };

    return { score: 0, reason: 'plain' };
}

function aggKey(u, sideKey) {
    return [sideKey, u.role || '', u.echelon || '', u.bls || '', u.kind || '']
        .join('|').toLowerCase();
}

// Normalize one side's array in place. Mutates scenario[def.arr] and report.
function normalizeSide(scenario, def, cap, ctx, report) {
    const arr = scenario[def.arr];
    if (!Array.isArray(arr)) return;
    const before = arr.length;
    report.before[def.key] = before;
    report.after[def.key] = before;
    if (before <= cap) return;            // under cap → untouched

    report.changed = true;

    const annotated = arr.map((u, idx) => {
        const c = classify(u, def.key, ctx);
        return { u, idx, id: String(u[def.idKey]), score: c.score, reason: c.reason };
    });
    const preserved = annotated.filter(a => a.score > 0);
    const plain     = annotated.filter(a => a.score === 0);

    for (const p of preserved) report.preserved.push({ side: def.key, uid: p.id, reason: p.reason });

    let kept;
    if (preserved.length >= cap) {
        // Pathological: even the must-keep set exceeds the cap. Trim it by
        // priority (highest score first, then original order), drop the rest.
        preserved.sort((a, b) => (b.score - a.score) || (a.idx - b.idx));
        const keepP = preserved.slice(0, cap);
        for (const d of preserved.slice(cap)) {
            report.dropped.push({ side: def.key, uid: d.id, reason: 'over cap even among preserved units (' + d.reason + ')' });
        }
        for (const d of plain) {
            report.dropped.push({ side: def.key, uid: d.id, reason: 'over cap; preserved set alone exceeds cap' });
        }
        kept = keepP.map(x => x.u);
    } else {
        const budget = cap - preserved.length;       // slots available for plain units
        let need = plain.length - budget;             // > 0 (we are over cap)

        // Group plain units by (side, role, echelon, bls, kind); process the
        // biggest groups first so we fold the most-duplicated units.
        const groups = new Map();
        for (const p of plain) {
            const k = aggKey(p.u, def.key);
            if (!groups.has(k)) groups.set(k, []);
            groups.get(k).push(p);
        }
        const groupList = [...groups.entries()]
            .map(([k, items]) => ({ k, items }))
            .sort((a, b) => (b.items.length - a.items.length) || (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));

        const keptPlain = [];
        for (const g of groupList) {
            const items = g.items.slice().sort((a, b) => a.idx - b.idx);
            if (need > 0 && items.length > 1) {
                const freeHere   = Math.min(items.length - 1, need);  // slots this group frees
                const mergeCount = freeHere + 1;                       // units folded into the rep
                const repAnn = items[0];
                const merged = items.slice(1, mergeCount);
                const rest   = items.slice(mergeCount);

                const rep = repAnn.u;
                rep.aggregated = true;
                rep.aggregated_count = mergeCount;
                rep.aggregated_uids = merged.map(m => m.id);
                report.aggregated.push({
                    side: def.key, representative_uid: repAnn.id,
                    merged_count: mergeCount, merged_uids: rep.aggregated_uids.slice(), key: g.k,
                });
                keptPlain.push(repAnn);
                for (const r of rest) keptPlain.push(r);
                need -= freeHere;
            } else {
                for (const it of items) keptPlain.push(it);
            }
        }

        // Could not aggregate enough (remaining plain are unique) → hard-drop
        // the lowest-priority singletons, highest original index first.
        if (need > 0) {
            const droppable = keptPlain.filter(x => !x.u.aggregated).sort((a, b) => b.idx - a.idx);
            const toDrop = new Set();
            for (let i = 0; i < droppable.length && need > 0; i++) { toDrop.add(droppable[i]); need--; }
            for (const d of toDrop) {
                report.dropped.push({ side: def.key, uid: d.id, reason: 'count over cap (lowest priority, not aggregatable)' });
            }
            const finalPlain = keptPlain.filter(x => !toDrop.has(x));
            keptPlain.length = 0;
            keptPlain.push(...finalPlain);
        }

        kept = preserved.map(x => x.u).concat(keptPlain.map(x => x.u));
    }

    scenario[def.arr] = kept;
    report.after[def.key] = kept.length;

    // Keep blue_units_base_ids aligned with the (possibly trimmed) blue OOB
    // so the validator's count-consistency check stays green.
    if (def.key === 'blue' && Array.isArray(scenario.blue_units_base_ids)) {
        scenario.blue_units_base_ids = kept
            .map(u => (u.base_id != null ? u.base_id : u.unit_uid))
            .filter(v => v != null && v !== '');
    }
}

function normalizeScenario(scenario, opts) {
    opts = opts || {};
    const cap = Number.isFinite(opts.cap) && opts.cap > 0 ? opts.cap : DEFAULT_CAP;
    const report = {
        cap,
        changed: false,
        before:  { red: 0, blue: 0, neutral: 0 },
        after:   { red: 0, blue: 0, neutral: 0 },
        preserved: [],
        aggregated: [],
        dropped: [],
    };
    if (!scenario || typeof scenario !== 'object') {
        return { scenario, report, changed: false };
    }

    // Initialize before/after counts from whatever is present (so the report
    // always reflects reality, even for the no-op case).
    for (const def of SIDE_DEFS) {
        const n = Array.isArray(scenario[def.arr]) ? scenario[def.arr].length : 0;
        report.before[def.key] = n;
        report.after[def.key] = n;
    }

    const ctx = buildContext(scenario, opts);
    for (const def of SIDE_DEFS) normalizeSide(scenario, def, cap, ctx, report);

    return { scenario, report, changed: report.changed };
}

module.exports = {
    normalizeScenario,
    DEFAULT_CAP,
    // exposed for tests / introspection:
    classify,
    buildReferencedSet,
    haversineKm,
};
