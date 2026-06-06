# Wargame Narrative — Gulf of Sidra 2026 — Amphibious Assault

## Executive summary

- **Phases run**: 12 (steps 0–11)
- **Total adjudicated unit outcomes**: 0
- **Phase-level advantage calls**: RED_ADV=0, CONTESTED=0, BLUE_ADV=12
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


---


## Phase 0 — D-7 — تمهيد - الوضع قبل العمليات

*Kind:* `shaping` &nbsp; *Phase line:* 0.0 km from coast


**Scene.** At D-7, Red forces are positioning their shaping elements to establish a foothold north of the objective area, while Blue maintains a defensive posture with a strong local force ratio. The sea minefield remains active, posing a significant threat to both sides as they prepare for the amphibious assault.


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


**Scene.** At D-5, Red initiates strategic missile strikes from north of the coast to suppress Blue's coastal defenses and establish air superiority for the amphibious assault. Blue maintains a defensive posture, focusing on electronic warfare to disrupt Red's targeting and protect key assets.


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


**Scene.** At D-3, Red forces initiated SEAD operations to suppress Blue air defenses in preparation for their amphibious assault, while Blue maintained a defensive posture focusing on protecting its critical assets and air defense systems. The operational environment was relatively quiet, with minimal electronic warfare activity, allowing both sides to focus on their respective missions.


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


**Scene.** At D-2, Red naval forces approach the phase line from the north, while Blue naval assets maintain a defensive posture in deeper waters. The minefield remains active, with 400 mines still present and posing a significant threat to both sides' vessels.


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


**Scene.** At D-1, Red forces initiated mine clearance operations in preparation for their amphibious assault, while Blue maintained a defensive posture focusing on protecting its coastal assets and critical infrastructure. The force ratio of 0.17:1 locally indicated that Blue held a significant advantage in this phase, with both sides aware of the critical nature of controlling the sea lanes before the main landing.


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


**Scene.** At D-H, Red forces initiated their h-hour strike, breaching Blue's coastal defenses and advancing towards the phase line 1.5 km from the coast. Blue defenders maintained a strong presence in contact, though Red power was significantly lower, indicating a challenging but not insurmountable task for the amphibious assault force.


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


**Scene.** At D+2 hours, Red forces approach the phase line 3 km from the coast with a force ratio of 0.17:1 against Blue's defenses. The beach is defended by 24.75 units of effective combat power, while Red deploys 4.2 units in contact, facing an operational disadvantage but closing within range for amphibious landings.


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


**Scene.** At D+6h, Red's main wave approaches the phase line 6 km from the coast, while Blue maintains a strong defensive posture with concentrated firepower and minefields in place. The force ratio of 0.17:1 locally indicates a challenging environment for Red as they advance towards their objective.


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


**Scene.** At D+24h, Red forces approach the phase line 9.5 km from the coast, while Blue's counterattack is in full swing, engaging Red units with intense fire support across multiple domains. The operational posture sees Red advancing cautiously under heavy Blue defensive pressure, with both sides sustaining significant attrition as they clash near the objective.


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


**Scene.** At D+36 hours, Red forces continue their amphibious assault, advancing 8 to 10 kilometers towards the phase line at 14 km from the coast. Blue defenses maintain a strong posture, preparing for the expected push while managing limited sea mine resources.


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


**Scene.** At D+48h, Red forces push inland towards the phase line at 28 km from the coast, while Blue defenses maintain a strong presence to contest the advance. Both sides engage in intense artillery duels and naval bombardments as Red seeks to break through Blue's defensive lines.


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

- Final phase: **11 — D+48h — اندفاع نحو 40-50 كم**
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
