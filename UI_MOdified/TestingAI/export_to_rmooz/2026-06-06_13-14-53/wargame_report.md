# Wargame Narrative — Gulf of Sidra 2026 — Amphibious Assault

## Executive summary

- **Phases run**: 17 (steps 0–16)
- **Total adjudicated unit outcomes**: 0
- **Phase-level advantage calls**: RED_ADV=0, CONTESTED=7, BLUE_ADV=10
- **Final phase advantage**: **CONTESTED**
- **Final cumulative losses**: Red=0, Blue=0


---

## Force-ratio progression

| Phase | Time | Kind | FR local | FR op | Advantage | Red losses (cum) | Blue losses (cum) |
|------:|:-----|:-----|---------:|------:|:----------|-----------------:|------------------:|
| 0 | D-7 | shaping | 0.35:1 | 2.51:1 | BLUE_ADV | 0 | 0 |
| 1 | D-5 | strategic_strike | 0.35:1 | 2.51:1 | BLUE_ADV | 0 | 0 |
| 2 | D-3 | sead | 0.35:1 | 2.51:1 | BLUE_ADV | 0 | 0 |
| 3 | D-2 | naval_engagement | 0.35:1 | 2.51:1 | BLUE_ADV | 0 | 0 |
| 4 | D-1 | mine_clearance | 0.35:1 | 2.51:1 | BLUE_ADV | 0 | 0 |
| 5 | D-H | h_hour_strike | 0.35:1 | 2.51:1 | BLUE_ADV | 0 | 0 |
| 6 | D+2h | beach_assault | 0.35:1 | 2.51:1 | BLUE_ADV | 0 | 0 |
| 7 | D+6h | main_wave | 0.35:1 | 2.51:1 | BLUE_ADV | 0 | 0 |
| 8 | D+12h | beachhead_consolidation | 0.35:1 | 2.51:1 | BLUE_ADV | 0 | 0 |
| 9 | D+24h | first_counterattack | 0.35:1 | 2.51:1 | BLUE_ADV | 0 | 0 |
| 10 | D+36h | 9mid_lands | 1.67:1 | 2.51:1 | CONTESTED | 0 | 0 |
| 11 | D+48h | push_inland | 1.67:1 | 2.51:1 | CONTESTED | 0 | 0 |
| 12 | D+72h | 1ad_lands | 1.67:1 | 2.51:1 | CONTESTED | 0 | 0 |
| 13 | D+96h | blue_op_reserve | 1.67:1 | 2.51:1 | CONTESTED | 0 | 0 |
| 14 | D+120h | culmination_check | 1.67:1 | 2.51:1 | CONTESTED | 0 | 0 |
| 15 | D+132h | final_red_push | 1.67:1 | 2.51:1 | CONTESTED | 0 | 0 |
| 16 | D+144h | final_resolution | 1.67:1 | 2.51:1 | CONTESTED | 0 | 0 |


---


## Phase 0 — D-7 — تمهيد - الوضع قبل العمليات

*Kind:* `shaping` &nbsp; *Phase line:* 0.0 km from coast


**Scene.** At D-7, Red forces are positioning their shaping assets to establish control over key sea lanes and coastal areas, while Blue maintains a defensive posture focused on protecting its critical infrastructure and denying access to the littoral zone. The force ratio favors Blue locally but is heavily skewed in favor of Red at the operational level, indicating an impending amphibious operation with significant challenges for Blue's defenses.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.35:1 / 2.51:1**
- Engine call: **BLUE_ADV** — force ratio 0.35:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 400


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d0-قيادةا-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 84 / Blue alive 55. Red power total 160.5 / Blue power total 64.0. Mines remaining 400. Cum losses to date: Red 0, Blue 0.


## Phase 1 — D-5 — تبادل صواريخ استراتيجية

*Kind:* `strategic_strike` &nbsp; *Phase line:* 0.0 km from coast


**Scene.** At D-5, Red forces initiated strategic missile strikes from their northern positions against Blue's coastal defenses and command nodes along the phase line. Blue responded with robust anti-missile measures but remained on high alert, focusing on maintaining control of key areas near the objective.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.35:1 / 2.51:1**
- Engine call: **BLUE_ADV** — force ratio 0.35:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 400


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d0-قيادةا-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 84 / Blue alive 55. Red power total 160.5 / Blue power total 64.0. Mines remaining 400. Cum losses to date: Red 0, Blue 0.


## Phase 2 — D-3 — حملة قمع الدفاع الجوي SEAD

*Kind:* `sead` &nbsp; *Phase line:* 0.0 km from coast


**Scene.** At D-3, Red forces initiated SEAD operations to suppress Blue air defenses, while Blue maintained a defensive posture focusing on coastal anti-air and surface-to-surface missile readiness. The phase saw limited engagement as Red concentrated on neutralizing key air defense nodes before advancing towards the beachhead.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.35:1 / 2.51:1**
- Engine call: **BLUE_ADV** — force ratio 0.35:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 400


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d0-قيادةا-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 84 / Blue alive 55. Red power total 160.5 / Blue power total 64.0. Mines remaining 400. Cum losses to date: Red 0, Blue 0.


## Phase 3 — D-2 — اشتباك بحري سطحي + ASW

*Kind:* `naval_engagement` &nbsp; *Phase line:* 0.0 km from coast


**Scene.** At D-2, Red naval forces approach the phase line from the north, while Blue naval assets maintain a defensive posture in deeper waters to the south. The minefield remains active, with 400 mines still present and posing a significant threat to both sides' vessels.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.35:1 / 2.51:1**
- Engine call: **BLUE_ADV** — force ratio 0.35:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 400


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d0-قيادةا-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 84 / Blue alive 55. Red power total 160.5 / Blue power total 64.0. Mines remaining 400. Cum losses to date: Red 0, Blue 0.


## Phase 4 — D-1 — تطهير حقول الألغام البحرية

*Kind:* `mine_clearance` &nbsp; *Phase line:* 0.0 km from coast


**Scene.** At D-1, Red forces initiated mine clearance operations in preparation for their amphibious assault, while Blue maintained a defensive posture focusing on protecting its coastal assets and critical infrastructure. The force ratio of 0.35:1 locally favored Blue, indicating a cautious approach from Red as it navigated the challenging minefield environment.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.35:1 / 2.51:1**
- Engine call: **BLUE_ADV** — force ratio 0.35:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 400


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d0-قيادةا-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 84 / Blue alive 55. Red power total 160.5 / Blue power total 64.0. Mines remaining 340. Cum losses to date: Red 0, Blue 0.


## Phase 5 — D-H — الضربة المركزة متعددة الاتجاهات + الإنزال

*Kind:* `h_hour_strike` &nbsp; *Phase line:* 1.5 km from coast


**Scene.** At D-H, Red forces initiated their h-hour strike from the north, targeting Blue's coastal defenses and amphibious landing zones. Blue maintained a strong defensive posture along the phase line, deploying extensive minefields and anti-ship missiles to counter the approaching Red amphibious task force.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.35:1 / 2.51:1**
- Engine call: **BLUE_ADV** — force ratio 0.35:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 340


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d0-قيادةا-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 84 / Blue alive 55. Red power total 160.5 / Blue power total 64.0. Mines remaining 280. Cum losses to date: Red 0, Blue 0.


## Phase 6 — D+2h — اقتحام الشاطئ - المرحلة 1 (طلائع)

*Kind:* `beach_assault` &nbsp; *Phase line:* 3.0 km from coast


**Scene.** At D+2 hours, Red forces approach the beach line in a narrow front, while Blue defenders maintain a strong inland position. The low force ratio and degraded electronic warfare environment favor Blue's defensive posture as Red attempts to establish a foothold.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.35:1 / 2.51:1**
- Engine call: **BLUE_ADV** — force ratio 0.35:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 280


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d0-قيادةا-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 84 / Blue alive 55. Red power total 160.5 / Blue power total 64.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 7 — D+6h — المرحلة 2أ - الموجة الرئيسية للفرقة 4

*Kind:* `main_wave` &nbsp; *Phase line:* 6.0 km from coast


**Scene.** At D+6h, Red's main wave approaches the phase line 6 km from the coast, while Blue maintains a strong defensive posture along the phase line to counter Red's amphibious assault. The force ratio of 0.35:1 locally favors Blue, who are prepared to exploit this advantage with intense coastal defense measures.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.35:1 / 2.51:1**
- Engine call: **BLUE_ADV** — force ratio 0.35:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 220


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d0-قيادةا-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 84 / Blue alive 55. Red power total 160.5 / Blue power total 64.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 8 — D+12h — تكوين رأس الجسر

*Kind:* `beachhead_consolidation` &nbsp; *Phase line:* 8.5 km from coast


**Scene.** At D+12 hours, Red forces have consolidated their beachhead up to 8.5 km inland, facing a Blue defense that remains largely intact but is under pressure from Red's sustained amphibious operations. The operational posture sees Red advancing cautiously while Blue holds its positions, with both sides engaged in a contest for control of the coastal region.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.35:1 / 2.51:1**
- Engine call: **BLUE_ADV** — force ratio 0.35:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 220


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d0-قيادةا-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 84 / Blue alive 55. Red power total 160.5 / Blue power total 64.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 9 — D+24h — الهجوم الأزرق المضاد الأول (لواء 72 المدرع)

*Kind:* `first_counterattack` &nbsp; *Phase line:* 9.5 km from coast


**Scene.** At D+24h, Red forces approach the phase line 9.5 km from the coast, while Blue's counterattack is in full swing, pushing to halt the amphibious assault. The battlefield remains heavily contested, with both sides engaging in intense close-quarters combat and naval mine warfare.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.35:1 / 2.51:1**
- Engine call: **BLUE_ADV** — force ratio 0.35:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 220


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d0-قيادةا-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 84 / Blue alive 55. Red power total 160.5 / Blue power total 64.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 10 — D+36h — الفرقة 9 تلتحق - دفع 8-10 كم

*Kind:* `9mid_lands` &nbsp; *Phase line:* 14.0 km from coast


**Scene.** At D+36 hours, Red forces continue their amphibious assault, advancing 8 to 10 kilometers inland from the phase line, while Blue defenses maintain a steady resistance along the coast. The force ratio of 1.67:1 locally indicates a contested engagement as both sides engage in intense combat across multiple domains.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **1.67:1 / 2.51:1**
- Engine call: **CONTESTED** — force ratio 1.67:1 ∈ [1.5:1, 3.0:1] — contested
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 220


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d0-قيادةا-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **CONTESTED** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 84 / Blue alive 55. Red power total 160.5 / Blue power total 64.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 11 — D+48h — اندفاع نحو 40-50 كم

*Kind:* `push_inland` &nbsp; *Phase line:* 28.0 km from coast


**Scene.** At D+48h, Red forces push inland towards the phase line at 28 km from the coast, while Blue defenses maintain a steady resistance along the projected advance route. The battlefield is characterized by contested control, with both sides engaging in a balanced struggle for territorial gains and dominance.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **1.67:1 / 2.51:1**
- Engine call: **CONTESTED** — force ratio 1.67:1 ∈ [1.5:1, 3.0:1] — contested
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 220


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d0-قيادةا-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **CONTESTED** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 84 / Blue alive 55. Red power total 160.5 / Blue power total 64.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 12 — D+72h — المرحلة 3 - الفرقة المدرعة 1 تنزل

*Kind:* `1ad_lands` &nbsp; *Phase line:* 50.0 km from coast


**Scene.** At D+72 hours, Red's 1st Armored Division initiates its amphibious landing phase, pushing inland from the coast to secure a beachhead. Blue forces maintain defensive positions along the phase line, preparing for the expected assault with limited electronic warfare support.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **1.67:1 / 2.51:1**
- Engine call: **CONTESTED** — force ratio 1.67:1 ∈ [1.5:1, 3.0:1] — contested
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 220


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d0-قيادةا-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **CONTESTED** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 84 / Blue alive 55. Red power total 160.5 / Blue power total 64.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 13 — D+96h — الاحتياطي الأزرق العملياتي (لواء 73)

*Kind:* `blue_op_reserve` &nbsp; *Phase line:* 65.0 km from coast


**Scene.** At D+96h, Blue's reserve force prepares to counter Red's amphibious assault along a 65 km line from the coast. The local force ratio of 1.67:1 suggests a balanced engagement, with both sides maintaining significant combat power in contact.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **1.67:1 / 2.51:1**
- Engine call: **CONTESTED** — force ratio 1.67:1 ∈ [1.5:1, 3.0:1] — contested
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 220


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d0-قيادةا-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **CONTESTED** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 84 / Blue alive 55. Red power total 160.5 / Blue power total 64.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 14 — D+120h — اقتراب من نقطة الانهيار

*Kind:* `culmination_check` &nbsp; *Phase line:* 80.0 km from coast


**Scene.** At D+120 hours, Red forces have advanced to within 80 kilometers of their objective, OBJ-X, while Blue defenses remain concentrated along the phase line. Both sides maintain high combat power totals, with Red holding a local force ratio of 1.67:1 and an operational ratio of 2.51:1, indicative of a contested engagement.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **1.67:1 / 2.51:1**
- Engine call: **CONTESTED** — force ratio 1.67:1 ∈ [1.5:1, 3.0:1] — contested
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 220


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d0-قيادةا-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **CONTESTED** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 84 / Blue alive 55. Red power total 160.5 / Blue power total 64.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 15 — D+132h — ضربة صواريخ أحمر نهائية + دفع أخير

*Kind:* `final_red_push` &nbsp; *Phase line:* 88.0 km from coast


**Scene.** At D+132 hours, Red forces push towards the phase line at 88 km from the coast, maintaining a local force ratio of 1.67:1 against Blue's defensive positions. The final amphibious assault wave encounters minimal electronic warfare interference as both sides prepare for decisive combat in the littoral zone.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **1.67:1 / 2.51:1**
- Engine call: **CONTESTED** — force ratio 1.67:1 ∈ [1.5:1, 3.0:1] — contested
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 220


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d0-قيادةا-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **CONTESTED** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 84 / Blue alive 55. Red power total 160.5 / Blue power total 64.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 16 — D+144h — الحسم النهائي عند الهدف X

*Kind:* `final_resolution` &nbsp; *Phase line:* 10.0 km from coast


**Scene.** At D+144 hours, Red forces push towards the final phase of their amphibious assault, breaching the 10 km phase line with a force ratio of 1.67:1. Blue defenses remain stubborn but are under pressure, focusing on delaying and degrading Red's advance without achieving decisive engagement.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **1.67:1 / 2.51:1**
- Engine call: **CONTESTED** — force ratio 1.67:1 ∈ [1.5:1, 3.0:1] — contested
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 220


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d0-قيادةا-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-000` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **CONTESTED** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 84 / Blue alive 55. Red power total 160.5 / Blue power total 64.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


---

## Final state at end of run

- Final phase: **16 — D+144h — الحسم النهائي عند الهدف X**
- Final adjudicator call: **CONTESTED**
- Final force ratio (local): 1.67:1
- Total Red losses: **0** units
- Total Blue losses: **0** units
- Red power remaining: 160.5
- Blue power remaining: 64.0

### Final inventory by domain

| Domain | Red alive/total | Blue alive/total |
|:-------|----------------:|-----------------:|
| strategic | 1/1 | 0/0 |
| naval | 18/18 | 3/3 |
| air | 21/21 | 9/9 |
| ground | 40/40 | 43/43 |
| sof | 4/4 | 0/0 |
