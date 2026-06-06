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
| 0 | D-7 | shaping | 0.17:1 | 1.06:1 | BLUE_ADV | 0 | 0 |
| 1 | D-5 | strategic_strike | 0.17:1 | 1.06:1 | BLUE_ADV | 0 | 0 |
| 2 | D-3 | sead | 0.17:1 | 1.06:1 | BLUE_ADV | 0 | 0 |
| 3 | D-2 | naval_engagement | 0.17:1 | 1.06:1 | BLUE_ADV | 0 | 0 |
| 4 | D-1 | mine_clearance | 0.17:1 | 1.06:1 | BLUE_ADV | 0 | 0 |
| 5 | D-H | h_hour_strike | 0.17:1 | 1.06:1 | BLUE_ADV | 0 | 0 |
| 6 | D+2h | beach_assault | 0.17:1 | 1.06:1 | BLUE_ADV | 0 | 0 |
| 7 | D+6h | main_wave | 0.17:1 | 1.06:1 | BLUE_ADV | 0 | 0 |
| 8 | D+12h | beachhead_consolidation | 0.17:1 | 1.06:1 | BLUE_ADV | 0 | 0 |
| 9 | D+24h | first_counterattack | 0.17:1 | 1.06:1 | BLUE_ADV | 0 | 0 |
| 10 | D+36h | 9mid_lands | 0.71:1 | 1.06:1 | BLUE_ADV | 0 | 0 |
| 11 | D+48h | push_inland | 0.71:1 | 1.06:1 | BLUE_ADV | 0 | 0 |
| 12 | D+72h | 1ad_lands | 0.71:1 | 1.06:1 | BLUE_ADV | 0 | 0 |
| 13 | D+96h | blue_op_reserve | 0.71:1 | 1.06:1 | BLUE_ADV | 0 | 0 |
| 14 | D+120h | culmination_check | 0.71:1 | 1.06:1 | BLUE_ADV | 0 | 0 |
| 15 | D+132h | final_red_push | 0.71:1 | 1.06:1 | BLUE_ADV | 0 | 0 |
| 16 | D+144h | final_resolution | 0.71:1 | 1.06:1 | BLUE_ADV | 0 | 0 |


---


## Phase 0 — D-7 — تمهيد - الوضع قبل العمليات

*Kind:* `shaping` &nbsp; *Phase line:* 0.0 km from coast


**Scene.** At D-7, Red forces are positioning their amphibious task force north of the objective area, preparing for an impending assault while Blue maintains a defensive posture along the coast. The force ratio favors Blue locally but is unfavorable operationally, indicating a challenging environment for Red's advance.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.17:1 / 1.06:1**
- Engine call: **BLUE_ADV** — force ratio 0.17:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 400


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d2-414-006` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-001` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 34 / Blue alive 36. Red power total 40.4 / Blue power total 38.0. Mines remaining 400. Cum losses to date: Red 0, Blue 0.


## Phase 1 — D-5 — تبادل صواريخ استراتيجية

*Kind:* `strategic_strike` &nbsp; *Phase line:* 0.0 km from coast


**Scene.** At D-5, Red initiates strategic strikes from north of the coast to weaken Blue's defenses along the phase line, while Blue maintains a strong defensive posture with substantial combat power in contact. Sea mines remain a significant threat, with 400 active and pre-laid across the operational area.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.17:1 / 1.06:1**
- Engine call: **BLUE_ADV** — force ratio 0.17:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 400


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d2-414-006` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-001` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 34 / Blue alive 36. Red power total 40.4 / Blue power total 38.0. Mines remaining 400. Cum losses to date: Red 0, Blue 0.


## Phase 2 — D-3 — حملة قمع الدفاع الجوي SEAD

*Kind:* `sead` &nbsp; *Phase line:* 0.0 km from coast


**Scene.** At D-3, Red forces initiated SEAD operations to suppress Blue air defenses in preparation for their amphibious assault, while Blue maintained a defensive posture focusing on protecting its critical assets and air defense systems. The operational environment was relatively quiet, with both sides engaging in electronic warfare but neither achieving significant dominance.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.17:1 / 1.06:1**
- Engine call: **BLUE_ADV** — force ratio 0.17:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 400


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d2-414-006` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-001` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 34 / Blue alive 36. Red power total 40.4 / Blue power total 38.0. Mines remaining 400. Cum losses to date: Red 0, Blue 0.


## Phase 3 — D-2 — اشتباك بحري سطحي + ASW

*Kind:* `naval_engagement` &nbsp; *Phase line:* 0.0 km from coast


**Scene.** At D-2, Red naval forces approach the phase line from the north, while Blue naval assets maintain a defensive posture in deeper waters to the south. The force ratio of 0.17:1 indicates that Blue holds a significant advantage, but Red continues its advance with limited contact and engagement.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.17:1 / 1.06:1**
- Engine call: **BLUE_ADV** — force ratio 0.17:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 400


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d2-414-006` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-001` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 34 / Blue alive 36. Red power total 40.4 / Blue power total 38.0. Mines remaining 400. Cum losses to date: Red 0, Blue 0.


## Phase 4 — D-1 — تطهير حقول الألغام البحرية

*Kind:* `mine_clearance` &nbsp; *Phase line:* 0.0 km from coast


**Scene.** At D-1, Red forces initiated mine clearance operations in preparation for their amphibious assault, while Blue maintained a defensive posture focusing on protecting its coastal assets and critical infrastructure. The force ratio of 0.17:1 locally indicated that Blue held a significant advantage in the minefield clearing phase, with both sides aware of the critical nature of these early actions.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.17:1 / 1.06:1**
- Engine call: **BLUE_ADV** — force ratio 0.17:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 400


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d2-414-006` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-001` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 34 / Blue alive 36. Red power total 40.4 / Blue power total 38.0. Mines remaining 340. Cum losses to date: Red 0, Blue 0.


## Phase 5 — D-H — الضربة المركزة متعددة الاتجاهات + الإنزال

*Kind:* `h_hour_strike` &nbsp; *Phase line:* 1.5 km from coast


**Scene.** At D-H, Red forces initiated their h-hour strike from the north, targeting Blue's coastal defenses and amphibious landing zones. Blue maintained a strong defensive posture along the phase line, deploying extensive minefields and anti-ship missiles to counter the approaching Red amphibious task force.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.17:1 / 1.06:1**
- Engine call: **BLUE_ADV** — force ratio 0.17:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 340


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d2-414-006` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-001` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 34 / Blue alive 36. Red power total 40.4 / Blue power total 38.0. Mines remaining 280. Cum losses to date: Red 0, Blue 0.


## Phase 6 — D+2h — اقتحام الشاطئ - المرحلة 1 (طلائع)

*Kind:* `beach_assault` &nbsp; *Phase line:* 3.0 km from coast


**Scene.** At D+2 hours, Red forces approach the beach line in a narrow front, while Blue defenders maintain a strong inland position. The low force ratio indicates a challenging assault for Red, with limited initial contact and significant defensive strength to overcome.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.17:1 / 1.06:1**
- Engine call: **BLUE_ADV** — force ratio 0.17:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 280


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d2-414-006` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-001` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 34 / Blue alive 36. Red power total 40.4 / Blue power total 38.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 7 — D+6h — المرحلة 2أ - الموجة الرئيسية للفرقة 4

*Kind:* `main_wave` &nbsp; *Phase line:* 6.0 km from coast


**Scene.** At D+6h, Red's main wave approaches the phase line 6 km from the coast, while Blue maintains a strong defensive posture with superior combat power in contact. The force ratio of 0.17:1 locally indicates a contested situation as Red advances towards its objective.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.17:1 / 1.06:1**
- Engine call: **BLUE_ADV** — force ratio 0.17:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 220


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d2-414-006` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-001` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 34 / Blue alive 36. Red power total 40.4 / Blue power total 38.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 8 — D+12h — تكوين رأس الجسر

*Kind:* `beachhead_consolidation` &nbsp; *Phase line:* 8.5 km from coast


**Scene.** At D+12 hours, Red forces have consolidated their beachhead up to 8.5 km inland but face a significant power gap as they advance against Blue's entrenched positions. The operational posture is characterized by a localized Red offensive with limited contact and heavy reliance on coastal defenses from Blue.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.17:1 / 1.06:1**
- Engine call: **BLUE_ADV** — force ratio 0.17:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 220


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d2-414-006` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-001` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 34 / Blue alive 36. Red power total 40.4 / Blue power total 38.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 9 — D+24h — الهجوم الأزرق المضاد الأول (لواء 72 المدرع)

*Kind:* `first_counterattack` &nbsp; *Phase line:* 9.5 km from coast


**Scene.** At D+24h, Red forces approach the phase line 9.5 km from the coast, while Blue's counterattack is in full mobilization to repel the amphibious assault. The operational posture sees Red with a force ratio of 0.17:1 against Blue, indicating a challenging but not insurmountable task for the defenders as they prepare for intense combat along the beachhead.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.17:1 / 1.06:1**
- Engine call: **BLUE_ADV** — force ratio 0.17:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 220


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d2-414-006` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-001` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 34 / Blue alive 36. Red power total 40.4 / Blue power total 38.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 10 — D+36h — الفرقة 9 تلتحق - دفع 8-10 كم

*Kind:* `9mid_lands` &nbsp; *Phase line:* 14.0 km from coast


**Scene.** At D+36 hours, Red forces have advanced to the phase line, 14 kilometers from the coast, while Blue continues to hold defensive positions along the objective area's coastline. The amphibious assault is entering its critical phase as Red approaches within striking distance of OBJ-X 'الهدف X (نقطة الناصر-البريقة)', with both sides maintaining significant combat power in contact.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.71:1 / 1.06:1**
- Engine call: **BLUE_ADV** — force ratio 0.71:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 220


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d2-414-006` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-001` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 34 / Blue alive 36. Red power total 40.4 / Blue power total 38.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 11 — D+48h — اندفاع نحو 40-50 كم

*Kind:* `push_inland` &nbsp; *Phase line:* 28.0 km from coast


**Scene.** At D+48h, Red forces push inland towards the phase line at 28 km from the coast, while Blue maintains a defensive posture along the projected phase line. Both sides engage in intense artillery duels and attempt to disrupt each other's advance with limited electronic warfare interference.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.71:1 / 1.06:1**
- Engine call: **BLUE_ADV** — force ratio 0.71:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 220


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d2-414-006` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-001` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 34 / Blue alive 36. Red power total 40.4 / Blue power total 38.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 12 — D+72h — المرحلة 3 - الفرقة المدرعة 1 تنزل

*Kind:* `1ad_lands` &nbsp; *Phase line:* 50.0 km from coast


**Scene.** At D+72 hours, Red's 1st Armored Division begins its amphibious landing at a phase line 50 km from the coast, while Blue maintains a defensive posture with forces in contact but not engaging aggressively. The force ratio locally favors Blue by 0.71:1, indicating a contested environment as Red advances towards the objective.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.71:1 / 1.06:1**
- Engine call: **BLUE_ADV** — force ratio 0.71:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 220


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d2-414-006` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-001` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 34 / Blue alive 36. Red power total 40.4 / Blue power total 38.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 13 — D+96h — الاحتياطي الأزرق العملياتي (لواء 73)

*Kind:* `blue_op_reserve` &nbsp; *Phase line:* 65.0 km from coast


**Scene.** At D+96 hours, Blue's reserve force prepares to counter Red's amphibious assault along a 65 km line from the coast. The local force ratio of 0.71:1 indicates a challenging environment for Blue as Red advances towards the objective, with both sides maintaining significant combat power in contact.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.71:1 / 1.06:1**
- Engine call: **BLUE_ADV** — force ratio 0.71:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 220


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d2-414-006` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-001` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 34 / Blue alive 36. Red power total 40.4 / Blue power total 38.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 14 — D+120h — اقتراب من نقطة الانهيار

*Kind:* `culmination_check` &nbsp; *Phase line:* 80.0 km from coast


**Scene.** At D+120 hours, Red forces have reached the culmination check line at 80 km from the coast, while Blue defenses remain in position to contest the advance. Both sides maintain significant combat power, but the force ratio of 0.71:1 indicates a challenging environment for Red as it approaches the objective.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.71:1 / 1.06:1**
- Engine call: **BLUE_ADV** — force ratio 0.71:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 220


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d2-414-006` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-001` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 34 / Blue alive 36. Red power total 40.4 / Blue power total 38.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 15 — D+132h — ضربة صواريخ أحمر نهائية + دفع أخير

*Kind:* `final_red_push` &nbsp; *Phase line:* 88.0 km from coast


**Scene.** At D+132 hours, Red forces push towards the phase line at 88 km from the coast, while Blue defenses maintain a strong posture along the objective area. Both sides engage in intense artillery exchanges and minefield clearance operations, with Red making steady progress but facing significant resistance.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.71:1 / 1.06:1**
- Engine call: **BLUE_ADV** — force ratio 0.71:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 220


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d2-414-006` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-001` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 34 / Blue alive 36. Red power total 40.4 / Blue power total 38.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


## Phase 16 — D+144h — الحسم النهائي عند الهدف X

*Kind:* `final_resolution` &nbsp; *Phase line:* 10.0 km from coast


**Scene.** At D+144 hours, Red forces have reached the phase line 10 km from the coast, while Blue defenses remain in place along the objective area. Both sides maintain significant combat power, with Blue holding a slight edge locally but facing a more formidable Red force at the operational level.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.71:1 / 1.06:1**
- Engine call: **BLUE_ADV** — force ratio 0.71:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 220


**Red intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Red actions (per component):**

- **[land]** `R-d2-414-006` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Blue intent.** No kinetic engagement - local model fallback used after schema failure; forces hold position pending a valid commander decision.


**Blue reactions (per component):**

- **[land]** `B-d0-99-001` — Held position - local model fallback after invalid structured output.
    - *why:* Fallback preserves run continuity; original error: LLM_LOCAL_FORCE_FALLBACK=1 *(refs: local-model-fallback)*
    - *intended effect:* Maintain state without inventing combat effects.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: LLM_LOCAL_FORCE_FALLBACK=1


**State after this phase.** Red alive 34 / Blue alive 36. Red power total 40.4 / Blue power total 38.0. Mines remaining 220. Cum losses to date: Red 0, Blue 0.


---

## Final state at end of run

- Final phase: **16 — D+144h — الحسم النهائي عند الهدف X**
- Final adjudicator call: **BLUE_ADV**
- Final force ratio (local): 0.71:1
- Total Red losses: **0** units
- Total Blue losses: **0** units
- Red power remaining: 40.4
- Blue power remaining: 38.0

### Final inventory by domain

| Domain | Red alive/total | Blue alive/total |
|:-------|----------------:|-----------------:|
| strategic | 0/0 | 0/0 |
| naval | 18/18 | 12/12 |
| air | 4/4 | 4/4 |
| ground | 11/11 | 20/20 |
| sof | 1/1 | 0/0 |
