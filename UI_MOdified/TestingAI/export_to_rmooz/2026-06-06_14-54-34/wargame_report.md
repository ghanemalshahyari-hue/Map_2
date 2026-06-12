# Wargame Narrative — Gulf of Sidra 2026 — Amphibious Assault

## Executive summary

- **Phases run**: 17 (steps 0–16)
- **Total adjudicated unit outcomes**: 0
- **Phase-level advantage calls**: RED_ADV=0, CONTESTED=0, BLUE_ADV=17
- **Final phase advantage**: **BLUE_ADV**
- **Final cumulative losses**: Red=0, Blue=0


---

## Force-ratio progression

| Phase | Time | Kind | FR local | FR op | Advantage | Red losses (cum) | Blue losses (cum) |
|------:|:-----|:-----|---------:|------:|:----------|-----------------:|------------------:|
| 0 | D-7 | shaping | 0.29:1 | 1.15:1 | BLUE_ADV | 0 | 0 |
| 1 | D-5 | strategic_strike | 0.29:1 | 1.15:1 | BLUE_ADV | 0 | 0 |
| 2 | D-3 | sead | 0.29:1 | 1.15:1 | BLUE_ADV | 0 | 0 |
| 3 | D-2 | naval_engagement | 0.29:1 | 1.15:1 | BLUE_ADV | 0 | 0 |
| 4 | D-1 | mine_clearance | 0.29:1 | 1.15:1 | BLUE_ADV | 0 | 0 |
| 5 | D-H | h_hour_strike | 0.29:1 | 1.15:1 | BLUE_ADV | 0 | 0 |
| 6 | D+2h | beach_assault | 0.29:1 | 1.15:1 | BLUE_ADV | 0 | 0 |
| 7 | D+6h | main_wave | 0.29:1 | 1.15:1 | BLUE_ADV | 0 | 0 |
| 8 | D+12h | beachhead_consolidation | 0.29:1 | 1.15:1 | BLUE_ADV | 0 | 0 |
| 9 | D+24h | first_counterattack | 0.29:1 | 1.15:1 | BLUE_ADV | 0 | 0 |
| 10 | D+36h | 9mid_lands | 0.77:1 | 1.15:1 | BLUE_ADV | 0 | 0 |
| 11 | D+48h | push_inland | 0.77:1 | 1.15:1 | BLUE_ADV | 0 | 0 |
| 12 | D+72h | 1ad_lands | 0.77:1 | 1.15:1 | BLUE_ADV | 0 | 0 |
| 13 | D+96h | blue_op_reserve | 0.77:1 | 1.15:1 | BLUE_ADV | 0 | 0 |
| 14 | D+120h | culmination_check | 0.77:1 | 1.15:1 | BLUE_ADV | 0 | 0 |
| 15 | D+132h | final_red_push | 0.77:1 | 1.15:1 | BLUE_ADV | 0 | 0 |
| 16 | D+144h | final_resolution | 0.77:1 | 1.15:1 | BLUE_ADV | 0 | 0 |


---


## Phase 0 — D-7 — تمهيد - الوضع قبل العمليات

*Kind:* `shaping` &nbsp; *Phase line:* 0.0 km from coast


**Scene.** At D-7, Red forces are positioning their shaping assets to establish control over key sea lanes and coastal areas, while Blue maintains a defensive posture focused on protecting critical infrastructure and denying access to the objective area. The force ratio favors Blue locally but is unfavorable operationally, indicating a challenging environment for Red as they approach the amphibious landing phase.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.29:1 / 1.15:1**
- Engine call: **BLUE_ADV** — force ratio 0.29:1 < 1.5:1 — Red approaching culmination
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


**State after this phase.** Red alive 44 / Blue alive 55. Red power total 73.5 / Blue power total 64.0. Mines remaining 400. Cum losses to date: Red 0, Blue 0.


## Phase 1 — D-5 — تبادل صواريخ استراتيجية

*Kind:* `strategic_strike` &nbsp; *Phase line:* 0.0 km from coast


**Scene.** At D-5, Red initiates strategic missile strikes from north of the coast to suppress Blue's coastal defenses and establish air superiority. Blue maintains a defensive posture, focusing on maintaining control over key areas while preparing for potential amphibious landings.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.29:1 / 1.15:1**
- Engine call: **BLUE_ADV** — force ratio 0.29:1 < 1.5:1 — Red approaching culmination
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


**State after this phase.** Red alive 44 / Blue alive 55. Red power total 73.5 / Blue power total 64.0. Mines remaining 400. Cum losses to date: Red 0, Blue 0.


## Phase 2 — D-3 — حملة قمع الدفاع الجوي SEAD

*Kind:* `sead` &nbsp; *Phase line:* 0.0 km from coast


**Scene.** At D-3, Red forces initiated SEAD operations to suppress Blue air defenses in preparation for their amphibious assault, while Blue maintained a defensive posture focusing on electronic warfare and surface-to-air missile deployments. The operational environment was relatively quiet, with both sides positioning assets along the phase line ahead of the anticipated amphibious landing.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.29:1 / 1.15:1**
- Engine call: **BLUE_ADV** — force ratio 0.29:1 < 1.5:1 — Red approaching culmination
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


**State after this phase.** Red alive 44 / Blue alive 55. Red power total 73.5 / Blue power total 64.0. Mines remaining 400. Cum losses to date: Red 0, Blue 0.


## Phase 3 — D-2 — اشتباك بحري سطحي + ASW

*Kind:* `naval_engagement` &nbsp; *Phase line:* 0.0 km from coast


**Scene.** At D-2, Red naval forces approach the phase line from the north, while Blue maintains a defensive posture in deeper waters to the south. The minefield remains active, with 400 mines still present and posing a significant threat to both sides' surface vessels.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.29:1 / 1.15:1**
- Engine call: **BLUE_ADV** — force ratio 0.29:1 < 1.5:1 — Red approaching culmination
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


**State after this phase.** Red alive 44 / Blue alive 55. Red power total 73.5 / Blue power total 64.0. Mines remaining 400. Cum losses to date: Red 0, Blue 0.


## Phase 4 — D-1 — تطهير حقول الألغام البحرية

*Kind:* `mine_clearance` &nbsp; *Phase line:* 0.0 km from coast


**Scene.** At D-1, Red forces initiated mine clearance operations in preparation for their amphibious assault, while Blue maintained a defensive posture focusing on protecting its coastal assets and critical infrastructure. The force ratio of 0.29:1 locally indicated that Blue held a significant advantage, with both sides deploying limited electronic warfare resources.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.29:1 / 1.15:1**
- Engine call: **BLUE_ADV** — force ratio 0.29:1 < 1.5:1 — Red approaching culmination
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


**State after this phase.** Red alive 44 / Blue alive 55. Red power total 73.5 / Blue power total 64.0. Mines remaining 340. Cum losses to date: Red 0, Blue 0.


## Phase 5 — D-H — الضربة المركزة متعددة الاتجاهات + الإنزال

*Kind:* `h_hour_strike` &nbsp; *Phase line:* 1.5 km from coast


**Scene.** At D-H, Red forces initiated their h-hour strike from the north, breaching Blue's coastal defenses and advancing towards the phase line 1.5 km inland. Blue defenders maintained a strong presence along the coast but faced significant challenges in coordinating effective countermeasures against the concentrated Red assault.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.29:1 / 1.15:1**
- Engine call: **BLUE_ADV** — force ratio 0.29:1 < 1.5:1 — Red approaching culmination
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


**State after this phase.** Red alive 44 / Blue alive 55. Red power total 73.5 / Blue power total 64.0. Mines remaining 280. Cum losses to date: Red 0, Blue 0.


## Phase 6 — D+2h — اقتحام الشاطئ - المرحلة 1 (طلائع)

*Kind:* `beach_assault` &nbsp; *Phase line:* 3.0 km from coast


**Scene.** At D+2 hours, Red forces approach the phase line 3 km from the coast, deploying their initial wave of amphibious vehicles and infantry. Blue defenses are concentrated along the shoreline, maintaining a strong defensive posture to repel the assault.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.29:1 / 1.15:1**
- Engine call: **BLUE_ADV** — force ratio 0.29:1 < 1.5:1 — Red approaching culmination
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


**State after this phase.** Red alive 44 / Blue alive 55. Red power total 73.5 / Blue power total 64.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 7 — D+6h — المرحلة 2أ - الموجة الرئيسية للفرقة 4

*Kind:* `main_wave` &nbsp; *Phase line:* 6.0 km from coast


**Scene.** At D+6h, Red's main wave approaches the phase line 6 km from the coast, while Blue maintains a strong defensive posture with concentrated firepower and minefields in place. The force ratio of 0.29:1 favors Blue locally, but Red's amphibious forces are closing the gap, setting the stage for intense combat as they advance towards their objective.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.29:1 / 1.15:1**
- Engine call: **BLUE_ADV** — force ratio 0.29:1 < 1.5:1 — Red approaching culmination
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


**State after this phase.** Red alive 44 / Blue alive 55. Red power total 73.5 / Blue power total 64.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 8 — D+12h — تكوين رأس الجسر

*Kind:* `beachhead_consolidation` &nbsp; *Phase line:* 8.5 km from coast


**Scene.** At D+12 hours, Red forces have consolidated their beachhead up to 8.5 km inland but face a significant power gap as they advance against Blue's prepared defenses. The operational posture is characterized by a localized Red offensive with limited contact and heavy reliance on coastal defense systems from Blue.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.29:1 / 1.15:1**
- Engine call: **BLUE_ADV** — force ratio 0.29:1 < 1.5:1 — Red approaching culmination
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


**State after this phase.** Red alive 44 / Blue alive 55. Red power total 73.5 / Blue power total 64.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 9 — D+24h — الهجوم الأزرق المضاد الأول (لواء 72 المدرع)

*Kind:* `first_counterattack` &nbsp; *Phase line:* 9.5 km from coast


**Scene.** At D+24h, Red forces approach the phase line 9.5 km from the coast, while Blue's counterattack is in full swing, engaging Red units with intense fire support and maneuvering to disrupt their advance. The operational posture sees Red pushing forward but facing increasing resistance as Blue seeks to regain the initiative.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.29:1 / 1.15:1**
- Engine call: **BLUE_ADV** — force ratio 0.29:1 < 1.5:1 — Red approaching culmination
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


**State after this phase.** Red alive 44 / Blue alive 55. Red power total 73.5 / Blue power total 64.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 10 — D+36h — الفرقة 9 تلتحق - دفع 8-10 كم

*Kind:* `9mid_lands` &nbsp; *Phase line:* 14.0 km from coast


**Scene.** At D+36 hours, Red forces continue their amphibious assault, advancing 8 to 10 kilometers towards the phase line, while Blue defenses maintain a strong presence along the coast, preparing for the inevitable push inland. Sea mines remain a significant threat, with 220 out of 400 pre-laid mines still active in the operational area.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.77:1 / 1.15:1**
- Engine call: **BLUE_ADV** — force ratio 0.77:1 < 1.5:1 — Red approaching culmination
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


**State after this phase.** Red alive 44 / Blue alive 55. Red power total 73.5 / Blue power total 64.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 11 — D+48h — اندفاع نحو 40-50 كم

*Kind:* `push_inland` &nbsp; *Phase line:* 28.0 km from coast


**Scene.** At D+48 hours, Red forces push inland towards the phase line at 28 km from the coast, while Blue defenses maintain a strong presence to halt the advance. Both sides engage in intense artillery duels and naval skirmishes along the coastal zone.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.77:1 / 1.15:1**
- Engine call: **BLUE_ADV** — force ratio 0.77:1 < 1.5:1 — Red approaching culmination
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


**State after this phase.** Red alive 44 / Blue alive 55. Red power total 73.5 / Blue power total 64.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 12 — D+72h — المرحلة 3 - الفرقة المدرعة 1 تنزل

*Kind:* `1ad_lands` &nbsp; *Phase line:* 50.0 km from coast


**Scene.** At D+72 hours, Red's 1st Armored Division initiates its amphibious landing at 50 km from the coast, facing a Blue force that maintains a local numerical superiority of 1.15:1 across the operational area. The beach is defended by an extensive minefield with 220 mines remaining, and both sides engage in intense naval and coastal artillery exchanges.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.77:1 / 1.15:1**
- Engine call: **BLUE_ADV** — force ratio 0.77:1 < 1.5:1 — Red approaching culmination
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


**State after this phase.** Red alive 44 / Blue alive 55. Red power total 73.5 / Blue power total 64.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 13 — D+96h — الاحتياطي الأزرق العملياتي (لواء 73)

*Kind:* `blue_op_reserve` &nbsp; *Phase line:* 65.0 km from coast


**Scene.** At D+96 hours, Blue's reserve force prepares to counter Red's amphibious assault along a 65 km line from the coast. The local force ratio of 0.77:1 indicates a challenging environment for Blue as Red advances towards the objective, with both sides maintaining significant combat power in contact.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.77:1 / 1.15:1**
- Engine call: **BLUE_ADV** — force ratio 0.77:1 < 1.5:1 — Red approaching culmination
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


**State after this phase.** Red alive 44 / Blue alive 55. Red power total 73.5 / Blue power total 64.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 14 — D+120h — اقتراب من نقطة الانهيار

*Kind:* `culmination_check` &nbsp; *Phase line:* 80.0 km from coast


**Scene.** At D+120 hours, Red forces have advanced to within 80 km of their objective, OBJ-X, while Blue continues to hold a defensive posture along the phase line. Both sides maintain significant combat power in contact, but the force ratio remains unfavorable for Red at 0.77:1 locally and 1.15:1 operationally.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.77:1 / 1.15:1**
- Engine call: **BLUE_ADV** — force ratio 0.77:1 < 1.5:1 — Red approaching culmination
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


**State after this phase.** Red alive 44 / Blue alive 55. Red power total 73.5 / Blue power total 64.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 15 — D+132h — ضربة صواريخ أحمر نهائية + دفع أخير

*Kind:* `final_red_push` &nbsp; *Phase line:* 88.0 km from coast


**Scene.** At D+132 hours, Red forces push towards the phase line at 88 km from the coast, deploying a final salvo of cruise missiles and amphibious assault craft. Blue defenses remain robust, maintaining their positions along the coastal zone with heavy minefields and artillery emplacements.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.77:1 / 1.15:1**
- Engine call: **BLUE_ADV** — force ratio 0.77:1 < 1.5:1 — Red approaching culmination
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


**State after this phase.** Red alive 44 / Blue alive 55. Red power total 73.5 / Blue power total 64.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 16 — D+144h — الحسم النهائي عند الهدف X

*Kind:* `final_resolution` &nbsp; *Phase line:* 10.0 km from coast


**Scene.** At D+144 hours, Red forces approach the phase line 10 km from the coast, having depleted their initial sea mine cover while Blue maintains a robust defensive posture along the objective area. Both sides engage in intense surface-to-surface missile exchanges and naval gunfire support, with neither side achieving decisive advantage as of this phase.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.77:1 / 1.15:1**
- Engine call: **BLUE_ADV** — force ratio 0.77:1 < 1.5:1 — Red approaching culmination
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


**State after this phase.** Red alive 44 / Blue alive 55. Red power total 73.5 / Blue power total 64.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


---

## Final state at end of run

- Final phase: **16 — D+144h — الحسم النهائي عند الهدف X**
- Final adjudicator call: **BLUE_ADV**
- Final force ratio (local): 0.77:1
- Total Red losses: **0** units
- Total Blue losses: **0** units
- Red power remaining: 73.5
- Blue power remaining: 64.0

### Final inventory by domain

| Domain | Red alive/total | Blue alive/total |
|:-------|----------------:|-----------------:|
| strategic | 1/1 | 0/0 |
| naval | 8/8 | 3/3 |
| air | 6/6 | 9/9 |
| ground | 26/26 | 43/43 |
| sof | 3/3 | 0/0 |
