# Location Intelligence Resolver — Design (DRAFT, awaiting owner approval)

**Status: DRAFT — do not code until approved.** Build slot (renumbered by owner roadmap
2026‑06‑11): **G‑3B — Location Intelligence Resolver** (server resolver + placement review
panel), **after G‑3A Planning Model Unification and before G‑4 Unit Tasking** (L12 in
`docs/coa-wargame-design.md`). Internal increments keep their LI‑n numbering. Extends the locked
contract in `docs/coa-wargame-design.md` and obeys its global rule:

> **AI understands → user reviews → RMOOZ validates → RMOOZ generates.** Everything AI‑produced is
> *AI‑assisted possibility / needs review* — never tactical truth.

Motivating example (Arabic narrative intel):

> «تتمركز قوات بحرية عبارة عن لواء في قاعدة بندر عباس وقاعدة شاه بهار»
> *(“Naval forces, a brigade, are based at Bandar Abbas base and Chah Bahar base.”)*

One sentence → **one naval brigade**, **two bases**, **no coordinates in‑line**. The resolver must
turn this into reviewable, cited, AO‑checked **placement candidates** — and must **not** invent a
single point or silently place a unit.

---

## 0. Locked‑style decision register (proposed — for owner ruling)

| # | Proposed ruling |
|---|---|
| **LI‑1** | The resolver emits **candidates only**. It never writes unit positions into a scenario. Placement happens through the existing review→generate path (feeds `brief-to-scenario.js`), never by the resolver. |
| **LI‑2** | **Resolution ladder is fixed priority (highest trust first):** ① explicit document coordinate → ② RMOOZ internal `location_db` → ③ uploaded intel incident log (مجرى الحوادث) → ④ approved public geocoder (**test‑mode only**, allowlisted) → ⑤ LLM suggestion. **LLM output is always `source:'llm'`, `confidence:'low'`, `needs_review:true`, never auto‑truth.** |
| **LI‑3** | Every candidate carries **`confidence` + `source citations[]` + `needs_review` + `warnings[]`** — the L6 invariant, no exceptions. |
| **LI‑4** | **Auto‑place is the exception, review is the default.** A candidate is `auto_place_eligible` ONLY if: `confidence == high` **AND** `chosen_method ∈ {document, internal_db}` **AND** AO `inside` **AND** no blocking incident status **AND** a rule explicitly enables auto‑place for that scenario. Everything else requires commander approval. |
| **LI‑5** | Position kind is explicit: **`known_base` ≠ `exact_unit_position` ≠ `approximate` ≠ `suspected`** (§4). “Based at <base>” ⇒ the unit’s position is the **base** coordinate ± `uncertainty_radius_m`, kind `approximate`, **not** an exact unit fix. |
| **LI‑6** | AO check: **inside = ok · outside = warning (still a candidate) · outside + strict mode = blocked**. AO geometry read from `scenario.ao_boundaries` (polygon) → fallback `map_bbox` → else `unknown`. |
| **LI‑7** | **`location_db` and `location_aliases` are reviewed data, not code** (additive JSON, same spirit as the DB‑Lite catalog). Every gazetteer row carries its own `coord_source` + `coord_confidence` + citations; unreviewed rows are usable only as low‑confidence candidates. |
| **LI‑8** | The **incident log (مجرى الحوادث) is evidence, not truth.** It is produced by the same extractor, append‑only, per scenario; a cross‑ref can *raise warnings and lower confidence* but never auto‑moves or auto‑kills a unit. |
| **LI‑9** | **Determinism:** identical input ⇒ identical candidates. No RNG. The LLM rung is optional and degrades gracefully (mirrors the existing `llm_fill.available:false` pattern) so the resolver runs fully offline on rungs ①–④. |
| **LI‑10** | **Arabic‑first.** Place matching normalizes Arabic (alef/yeh/hamza variants, taa marbuta, tatweel, ال‑prefix, space collapsing) before alias lookup; transliteration variants live in `location_aliases`. |
| **LI‑11** | **Dual input path parity (owner ruling 2026‑06‑11, = L13 in `coa-wargame-design.md`).** The resolver serves BOTH (A) document text from uploads AND (B) the **RMOOZ native scenario builder**: a manually **typed** place phrase enters the **same** extraction→ladder→classify→AO pipeline and emits the **same** `placement_candidate` contract; a **map click** by the operator bypasses resolution (coord is operator‑declared, `source.type:'map_click'`, `confidence:'high'`, no review gate) but still carries `source` + citation. **No upload‑only logic anywhere in the resolver.** Every candidate/incident carries a global `source.type` (§B.6). |

---

## A. Design — Location Intelligence Resolver

### A.1 Where it sits
A server pipeline that consumes the **same `/analyze` payload** the COA review already uses, plus
any uploaded intel docs — **and, with identical logic, native-builder input** (typed place
phrases, manual incident notes, map clicks; LI‑11). It produces a new `placement_candidates[]`
block alongside the existing `operational_brief`. The COA/placement review surface (G‑3B) renders it; commander approval feeds
the **existing** generate path. It is the bridge from *narrative intel* → *positioned draft units*,
replacing “template geometry only” placement with “evidence‑resolved, reviewed” placement.

```
intel text (brief field / MDMP stage / مجرى الحوادث / pasted statement)
   OR native-builder input (typed place phrase / manual incident note / map click†)   ← LI-11
        │
        ▼  (1) EXTRACT          server/ai/location-extractor.js
   location_mentions[]  ── unit descriptor · place phrases · inline coord tokens · relation · span
        │
        ▼  (2) RESOLVE (ladder) server/geo/location-resolver.js
   for each place: ① doc-coord ② location_db ③ incident_log ④ geocoder(test) ⑤ llm(candidate)
        │
        ▼  (3) CLASSIFY position kind  → known_base | exact | approximate | suspected
        │
        ▼  (4) CROSS-REF incident log (مجرى الحوادث) → status / last_seen / staleness
        │
        ▼  (5) VALIDATE AO (turf point-in-polygon) → inside | outside | blocked(strict)
        │
        ▼  (6) EMIT placement_candidates[]  (confidence · citations · needs_review · warnings · auto_place_eligible)
        │
        ▼  (7) REVIEW  client/shell/placement-review-panel.js  (commander approve / edit / reject)
        │
        ▼  (8) PLACE  → reviewed coords feed brief-to-scenario.js  (the only path to a real position)
```
† map click skips stages (1)–(4): the operator-declared coord still passes AO validation (stage 5)
then emits with `source.type:'map_click'`, `confidence:'high'`, no review gate — LI‑11.

### A.2 Stage 1 — Extraction (`location-extractor.js`)
Two cooperating extractors; deterministic always runs, LLM is candidate‑only.

- **Deterministic (HIGH trust):**
  - **Coordinate tokens** via a new `detectCoordFormat(token)` sniffer over the **existing**
    `lib/coord-utils.js` (decimal lat/lon, DMS, UTM) + `lib/mgrs.min.js` (MGRS). Reuse, don’t reinvent.
  - **Echelon lexicon** (Arabic→canonical): لواء→brigade, كتيبة→battalion, فرقة→division, سرية→company, فوج→regiment …
  - **Domain/type lexicon:** بحرية→naval, مدرعة→armor, مشاة→infantry, دفاع جوي→air_defense, جوية→air …
  - **Relation verbs** (sets the `position_kind` prior): تتمركز/يتمركز/ترابط/متمركزة → *basing*; شوهد/رُصد → *sighting*; دُمّر/أصيب → *status/strike*; يتحرك/متجه → *movement*.
  - **Place phrases:** noun phrases after locative prepositions (في/قرب/بالقرب من/عند) and after «قاعدة/ميناء/مطار/مدينة». Captures char spans for citation.
- **LLM (CANDIDATE only):** for prose the rules miss. Output is forced through the contract
  normalizer and tagged `source:'llm', needs_review:true, confidence:'low'`. Never promoted.
- **Native-builder input (LI‑11):** a place phrase **typed in the app** (unit "assign/request
  location" field, manual incident note) is fed to the SAME deterministic extractor as document
  text — same lexicons, same ladder downstream. The only difference is provenance:
  `source.type:'manual_app_entry'` instead of `'uploaded_doc'`. A typed **inline coordinate** is
  operator-declared (rung ① equivalent, `confidence:'high'`).

`location_mention` (intermediate): `{ unit:{descriptor_raw, side, domain, echelon, type, quantity},
place_phrases[], inline_coords[{raw, format, coord}], relation, raw_text, char_span }`.

> Canonical sentence → `unit:{domain:naval, echelon:brigade, quantity:1}`, `place_phrases:["قاعدة
> بندر عباس","قاعدة شاه بهار"]`, `relation:'basing'`, `inline_coords:[]`.

### A.3 Stage 2 — Resolution ladder (`location-resolver.js`) — LI‑2
For each place phrase, try rungs **in fixed order**; record **every rung that fires** (not just the
winner — this is what powers the proof plan, §D):

| Rung | Source | Confidence seed | Notes |
|---|---|---|---|
| ① explicit document coordinate | `document` | high | a coord in the same statement/brief for this place |
| ② RMOOZ `location_db` (+aliases) | `internal_db` | high (exact base) / medium (city) | Arabic‑normalized alias match (LI‑10) |
| ③ incident log مجرى الحوادث | `incident_log` | = incident’s own confidence × staleness decay | a prior entry that geolocated this place/unit |
| ④ public geocoder (test mode) | `geocoder` | medium | **allowlisted, offline‑recordable**; off in prod unless enabled |
| ⑤ LLM suggestion | `llm` | low | candidate only; never promoted above ①–④ |

The resolver returns `resolution.ladder[]` (all hits) + `chosen_method` (highest‑trust hit) +
`confidence`. **Disagreement** between rungs (e.g. db says X, llm says Y > Δkm away) → a
`coord_conflict` warning + forced `needs_review` (§D acceptance).

### A.4 Stage 3 — Position classification — LI‑5
| `position_kind` | When | Coord meaning | default `uncertainty_radius_m` |
|---|---|---|---|
| `known_base` | resolved to a `location_db` facility, relation = basing | the **facility** point | facility’s own radius (e.g. 500) |
| `exact_unit_position` | statement asserts a precise unit fix (inline coords / “at grid …”) | the unit itself | small (e.g. 50–100) |
| `approximate` | “based at <base>” with no precise fix | base point, unit somewhere within | base radius × k (e.g. ×3) |
| `suspected` | hedged language (يُحتمل/يُشتبه/تقارير غير مؤكدة) or LLM‑only / geocoder‑only | best guess | large (e.g. 5–10 km) |

**Multi‑base ambiguity** (the canonical example): one unit ↔ two bases ⇒ **two candidates**, each
`approximate`, both flagged `warnings:['multi_base_ambiguity']`, `needs_review:true`. The resolver
never silently splits strength or picks one — the commander decides (split / pick / HQ‑at‑one).

### A.5 Stage 4 — Incident cross‑reference (مجرى الحوادث) — LI‑8 / req #6
For each candidate, query `incident_log` by `unit descriptor` and by `loc_id`/proximity. Attach:
`{ last_status (active|damaged|destroyed|suspected|withdrawn), last_seen_dtg, staleness_days,
staleness_flag (> threshold), damage_pct?, refs[] }`. Effects: `destroyed/withdrawn` →
`warnings:['status_'+s']` + `needs_review`; stale beyond threshold → `warnings:['stale_intel']` +
confidence downgrade. **Never** auto‑removes or auto‑moves a unit (evidence, not truth).

### A.6 Stage 5 — AO validation — LI‑6 / req #7
`validateAO(coord, scenario, {strict}) → { status: inside|outside|unknown, strict_blocked }` using
`turf.booleanPointInPolygon` over `scenario.ao_boundaries` (→ `map_bbox` → `unknown`). `outside` adds
`warnings:['outside_ao']`; `strict` makes outside `strict_blocked:true` (candidate cannot be placed,
still shown so the analyst sees why).

### A.7 Stage 6 — Candidate emission + auto‑place gate — LI‑3/LI‑4 / req #8,#9
Emit `placement_candidate` (schema §B.4) with full provenance. `auto_place_eligible` per the LI‑4
truth table. Default review. The resolver stops here — **placement is a separate, commander‑gated
action.**

### A.8 Module seams (named now; built per §E)
| Concern | Module | Reuse? |
|---|---|---|
| Coord format detect/parse | `lib/coord-utils.js` (+ `detectCoordFormat`) · `lib/mgrs.min.js` | **reuse** |
| AO point‑in‑polygon | `lib/turf.min.js` | **reuse** |
| Extraction | `server/ai/location-extractor.js` | new |
| Gazetteer load + Arabic‑normalized match | `server/geo/location-db.js` | new |
| Geocoder (test mode, allowlist, recordable) | `server/geo/geocoder-adapter.js` | new |
| Incident log store + query | `server/geo/incident-log.js` | new |
| Ladder + classify + crossref + AO + emit | `server/geo/location-resolver.js` | new |
| Review UI | `client/shell/placement-review-panel.js` | new (sibling of `coa-review-panel.js`) |
| Gazetteer / aliases / incidents data | `data/geo/location_db.json`, `data/geo/location_aliases.json`, `data/incidents/<scenario>.jsonl` | new |

---

## B. Proposed schemas

### B.1 `location_db` (gazetteer — `data/geo/location_db.json`)
```jsonc
{
  "loc_id": "IR-NAVBASE-BANDAR-ABBAS",          // stable key
  "canonical_name_ar": "قاعدة بندر عباس البحرية",
  "canonical_name_en": "Bandar Abbas Naval Base",
  "type": "naval_base",                          // naval_base|airbase|army_base|port|city|sam_site|objective|...
  "coord": [56.2167, 27.1500],                   // [lon, lat]
  "coord_source": "osint",                       // surveyed|osint|document|estimated
  "coord_confidence": "high",                    // high|medium|low
  "uncertainty_radius_m": 500,
  "country": "IR", "admin_region": "Hormozgan",
  "domain_affinity": ["naval"],                  // plausible basing for these unit domains
  "status": "active",                            // active|deprecated
  "reviewed": true,
  "citations": [{ "source": "OSINT", "ref": "…", "date": "2026-…" }],
  "added_by": "…", "added_at": "…"
}
```

### B.2 `location_aliases` (`data/geo/location_aliases.json`)
```jsonc
{
  "alias": "بندرعباس",                            // raw surface form (no space variant)
  "loc_id": "IR-NAVBASE-BANDAR-ABBAS",
  "alias_kind": "spelling",                       // spelling|transliteration|abbreviation|historical|colloquial
  "lang": "ar",                                   // ar|en|fa
  "confidence": "high"
}
// e.g. also: "Bandar Abbas"(en,translit), "Bandar-e Abbas"(en,translit), "بندر عباس"(ar,spelling)
```
Matcher normalizes both sides (LI‑10) before compare: strip tatweel/diacritics, unify
`أ/إ/آ→ا`, `ى→ي`, `ة→ه`, drop leading `ال`, collapse whitespace.

### B.3 `incident_log` / مجرى الحوادث (`data/incidents/<scenario>.jsonl`, append‑only)
```jsonc
{
  "incident_id": "INC-0007",
  "dtg": "2026-06-02T14:00:00Z",                 // when the event occurred
  "reported_at": "2026-06-02T16:30:00Z",
  "source": { "name": "…", "kind": "humint", "confidence": "medium" },  // sigint|humint|osint|doc
  "subject_unit": { "descriptor": "لواء بحري", "side": "RED", "uid_guess": null },
  "location": { "place_phrase": "قاعدة بندر عباس", "loc_id": "IR-NAVBASE-BANDAR-ABBAS",
                "coord": [56.2167, 27.15], "coord_format": "named", "position_kind": "known_base" },
  "event_type": "strike",                         // sighting|strike|movement|status_report|basing
  "status_assertion": "damaged",                  // active|damaged|destroyed|suspected|withdrawn
  "damage_pct": 40,
  "raw_text": "…", 
  "citation": { "document_set_id": "…", "doc_ref": "مجرى الحوادث p3", "char_span": [120, 188] },
  "needs_review": true
}
```

### B.4 `placement_candidate`
```jsonc
{
  "candidate_id": "PC-0003",
  "scenario_name": "…", "document_set_id": "…",
  "unit": { "descriptor_raw": "قوات بحرية عبارة عن لواء", "side": "RED",
            "domain": "naval", "echelon": "brigade", "type": "naval_brigade",
            "quantity": 1, "uid_guess": null },
  "place": { "phrase": "قاعدة بندر عباس", "loc_id": "IR-NAVBASE-BANDAR-ABBAS", "normalized": "بندر عباس" },
  "position": { "coord": [56.2167, 27.15], "position_kind": "approximate", "uncertainty_radius_m": 1500 },
  "resolution": {
    "chosen_method": "internal_db", "confidence": "high",
    "ladder": [
      { "method": "document",   "coord": null,              "confidence": null, "citation": null },
      { "method": "internal_db","coord": [56.2167,27.15],   "confidence": "high","citation": {"loc_id":"IR-NAVBASE-BANDAR-ABBAS"} }
      // … any geocoder/llm hits also recorded here for the proof trail
    ]
  },
  "incident_crossref": { "last_status": "damaged", "last_seen_dtg": "2026-06-02T14:00:00Z",
                         "staleness_days": 9, "staleness_flag": false, "refs": ["INC-0007"] },
  "ao": { "status": "inside", "strict_blocked": false },
  "citations": [ { "kind": "internal_db", "ref": "IR-NAVBASE-BANDAR-ABBAS" },
                 { "kind": "document", "ref": "brief.enemy.units[2]", "char_span": [40, 96] } ],
  "warnings": ["multi_base_ambiguity", "status_damaged"],
  "needs_review": true,
  "auto_place_eligible": false,
  "decision": { "state": "proposed", "decided_by": null, "decided_at": null, "final_coord": null }
}
```

### B.5 AO validation (contract, not stored)
```
validateAO(coord, scenario, opts={strict}) -> { status:"inside"|"outside"|"unknown", strict_blocked:bool }
```

### B.6 Global `source.type` taxonomy (LI‑11 / L13) — mandatory on every planning object
Every `placement_candidate`, `incident_log` row, and downstream planning object carries
`source: { type, ref?, citation? }` using the **global** taxonomy from
`coa-wargame-design.md` §0.5:

```
uploaded_doc · external_json · mdmp_adapter · manual_app_entry · map_click
location_db · incident_log · llm_candidate · doctrine_rule
```

The resolver's internal rung names map onto it (the rung name stays in
`resolution.chosen_method`; `source.type` is the global provenance):

| `resolution.chosen_method` | global `source.type` |
|---|---|
| `document` (coord in an uploaded doc) | `uploaded_doc` |
| `document` (coord typed by the operator in-app) | `manual_app_entry` |
| `internal_db` | `location_db` |
| `incident_log` | `incident_log` |
| `geocoder` (test-mode rung) | `location_db` after review-import, else stays candidate-only |
| `llm` | `llm_candidate` |
| — (operator map click, no resolution) | `map_click` |

`source.type` composes with the L6/LI‑3 invariants — it never replaces
`confidence`/`needs_review`/`citations[]`.

---

## C. Tests (proposed — all pure/Node, deterministic; pattern = existing `scripts/test-*.js`)

1. **coord‑format detector** — decimal / DMS / UTM / MGRS positives; prose & near‑miss negatives; round‑trip parse↔format. (`test-coord-detect.js`)
2. **extraction lexicon** — لواء→brigade, بحرية→naval, دفاع جوي→air_defense; relation verbs set the kind prior. (`test-location-extractor.js`)
3. **canonical sentence** — yields **2 candidates**, `multi_base_ambiguity`, `needs_review`, `position_kind:approximate`, quantity not split.
4. **alias normalization** — بندر عباس / بندرعباس / Bandar Abbas / Bandar‑e Abbas → same `loc_id`; ال‑prefix + tatweel + alef/yeh variants. (`test-location-aliases.js`)
5. **ladder priority** — when several rungs can resolve, assert `chosen_method` = highest‑trust available; assert all hits recorded in `ladder[]`. (`test-location-resolver.js`)
6. **LLM is never truth** — LLM‑only resolution ⇒ `confidence:'low'`, `needs_review:true`, `auto_place_eligible:false`; LLM vs DB disagreement > Δ ⇒ `coord_conflict` warning + `needs_review`.
7. **incident cross‑ref** — `destroyed`/`withdrawn` ⇒ status warning + review; `last_seen` older than threshold ⇒ `stale_intel` + confidence downgrade; no auto‑move/kill.
8. **AO** — inside ⇒ ok; outside ⇒ `outside_ao` warning, still a candidate; outside + strict ⇒ `strict_blocked:true`.
9. **auto‑place gate truth table** — only (high ∧ {document|internal_db} ∧ inside ∧ no‑block ∧ rule‑on) ⇒ `auto_place_eligible:true`; every other combination ⇒ false.
10. **determinism** — same input twice ⇒ byte‑identical candidates (no RNG, no clock in the resolver core).
11. **offline degrade** — geocoder disabled + no LLM ⇒ rungs ①–③ still produce candidates (mirrors `llm_fill.available:false`).
12. **dual‑path parity (LI‑11 / owner tests #3–#4)** — (a) resolver works from **document text**
    (the canonical sentence via the upload path: tests #2/#3 above, asserted with
    `source.type:'uploaded_doc'`); (b) the **same place phrase manually typed** in the native
    builder produces **structurally identical candidates** (same `loc_id`, coord, position_kind,
    ladder) differing only in provenance (`source.type:'manual_app_entry'`); (c) a **map click**
    emits a candidate with `source.type:'map_click'`, `confidence:'high'`, AO‑validated, no
    review gate; (d) grep‑level guard: no resolver module branches on "uploaded" vs "manual"
    input. (`test-location-dual-path.js`)
13. **`source.type` always present** — every emitted candidate + incident row carries a valid
    global taxonomy value (§B.6); unknown/missing type fails validation.

---

## D. Proof plan — LLM coordinates vs verified geocoder / internal DB

**Goal:** evidence that justifies LI‑2 (LLM is bottom rung). Harness `scripts/proof-location-llm-vs-verified.js`.

- **Fixture:** N labeled place phrases (AR + EN), each with a **ground‑truth coord** (surveyed/DB).
  Include hard cases: spelling variants, two‑base sentences, a **non‑existent/placeholder** place
  (hallucination trap), a stale‑intel place.
- **Procedure (per phrase):** resolve via (a) internal_db/geocoder and (b) ask the LLM for a coord;
  compute **great‑circle error (km)** of each vs ground truth.
- **Metrics reported:** error distribution & median for DB/geocoder vs LLM; **% within {1,5,25} km**;
  **hallucination rate** (LLM returns a confident coord for the non‑existent place); **agreement matrix**
  (LLM vs DB within Δ); count of `coord_conflict` flags raised.
- **Acceptance criteria (must all hold):**
  1. LLM is **never** promoted above DB/geocoder for any fixture.
  2. Every LLM coord surfaces only as `confidence:'low'`, `needs_review:true`.
  3. LLM vs DB disagreement > Δkm always raises `coord_conflict`.
  4. The hallucination‑trap place yields **no** auto‑placeable candidate.
  5. DB/geocoder median error ≤ a stated bound; LLM error is reported (not gated) purely as evidence.
- **Offline‑friendly:** geocoder responses **recorded/mocked**; LLM rung **optional** (skips with a
  logged note if no provider) so CI runs deterministically. Output: a short markdown report under
  `docs/proof/location-llm-vs-verified.md` (the artifact that ratifies the ladder).

---

## E. Recommended build order (after approval)

| Step | Slot | Deliverable | Depends |
|---|---|---|---|
| **LI‑0** | — | **This design, approved** (rulings LI‑1…LI‑10 ratified) | — |
| **LI‑1** | G‑3A | `location_db` + `location_aliases` data + `location-db.js` (Arabic‑normalized match) + tests (#4). Pure data, no LLM. | LI‑0 |
| **LI‑2** | G‑3A | `detectCoordFormat()` over coord‑utils/mgrs + deterministic `location-extractor.js` + tests (#1,#2,#3). | LI‑1 |
| **LI‑3** | G‑3A | `location-resolver.js` ladder ①②④⑤ + classification + tests (#5,#6); geocoder behind test‑mode allowlist. | LI‑2 |
| **LI‑4** | G‑3A | `incident-log.js` (مجرى الحوادث ingest via same extractor) + cross‑ref rung ③ + tests (#7). | LI‑3 |
| **LI‑5** | G‑3A | AO validation + `placement_candidate` assembly + auto‑place gate + tests (#8,#9,#10,#11). Surface candidates in the `/analyze` response. | LI‑4 |
| **LI‑6** | G‑3A | Proof harness (§D) + report. | LI‑5 |
| **LI‑7** | G‑3B | `placement-review-panel.js` — review/approve/edit/reject candidates (sibling of COA panel, RTL); approved coords feed `brief-to-scenario.js` (replaces template‑geometry‑only placement). Real‑app verification + screenshot. | LI‑5 |
| **then** | **G‑4** | Unit Tasking (unchanged plan) — now consuming reviewed, positioned units. | LI‑7 |

**Answer to “possibly G‑3A”:** yes — recommend **G‑3A = server resolver (LI‑1…LI‑6)** and **G‑3B =
placement review panel (LI‑7)**, both **before G‑4**. Tasking needs units to exist at known positions;
this pipeline is how narrative intel becomes those positions, with provenance and commander control.

---

### Open questions for the owner (please rule before LI‑1)
1. **Gazetteer seed scope** — which theatre(s) seed `location_db` first (e.g. Gulf/Hormozgan), and is the seed reviewed by you or imported then reviewed?
2. **Geocoder** — which public geocoder is “approved,” and confirm **test‑mode‑only + allowlist + recorded responses** (no live calls in prod)?
3. **Staleness threshold** — days after which intel is flagged `stale_intel` (proposed default: 7).
4. **Strict‑mode default** — off (warn) or on (block outside‑AO) for first build? (proposed: off.)
5. **Auto‑place** — keep it **disabled by default** for v1 (everything reviewed), enabling LI‑4’s rule later? (proposed: yes.)
6. **Δkm conflict threshold** for `coord_conflict` (proposed default: 5 km).
