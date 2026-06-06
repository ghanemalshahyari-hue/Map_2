# Wargame Narrative — Gulf of Sidra 2026 — Amphibious Assault

## Executive summary

- **Phases run**: 1 (steps 0–0)
- **Total adjudicated unit outcomes**: 0
- **Phase-level advantage calls**: RED_ADV=0, CONTESTED=0, BLUE_ADV=1
- **Final phase advantage**: **BLUE_ADV**
- **Final cumulative losses**: Red=0, Blue=0


---

## Force-ratio progression

| Phase | Time | Kind | FR local | FR op | Advantage | Red losses (cum) | Blue losses (cum) |
|------:|:-----|:-----|---------:|------:|:----------|-----------------:|------------------:|
| 0 | D-7 | shaping | 0.22:1 | 1.45:1 | BLUE_ADV | 0 | 0 |


---


## Phase 0 — D-7 — تمهيد - الوضع قبل العمليات

*Kind:* `shaping` &nbsp; *Phase line:* 0.0 km from coast


**Scene.** At D-7, Red forces are positioning for an amphibious assault along a narrow front north of the objective, while Blue maintains a strong coastal defense posture with significant power in contact. The low force ratio suggests a challenging environment for Red's advance, but Blue is not yet at full operational strength.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.22:1 / 1.45:1**
- Engine call: **BLUE_ADV** — force ratio 0.22:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 400


**Red intent.** Establish air superiority and suppress Blue's coastal defenses to facilitate amphibious landings.


**Red actions (per component):**

- **[maritime]** `R-d1-القوات-025` — Held in reserve — preserving naval surface assets for follow-on operations per operational tempo doctrine.
    - *why:* Blue's force ratio is favorable, but maintaining a strong naval presence ensures flexibility and readiness for subsequent phases. *(refs: AJP-3.1 Ed B §4-2)*
    - *intended effect:* Maintain operational flexibility while focusing on air superiority and land-based operations.
- **[air]** `R-d3-12-008` — Conduct a SEAD (Suppression of Enemy Air Defense) mission targeting Blue's coastal radars and air defense systems.
    - *why:* Prevent Blue from effectively engaging Red forces during the amphibious assault, ensuring air superiority for landings. *(refs: FM 3-09 §4-6)*
    - *intended effect:* Suppress Blue's air defenses to allow safe insertion of SOF and secure beachheads.
- **[usv_uav]** `R-d1-8-080` — Deploy USVs to lay additional minefields in key areas, enhancing the defensive barrier.
    - *why:* Increase Blue's minefield complexity and reduce their ability to safely navigate through the landing zones. *(refs: AJP-3.1 Ed B §5-4)*
    - *intended effect:* Complicate Blue's naval operations by adding more mine hazards around the landing area.
- **[sof]** `R-d1-21-073` — Insert a reconnaissance team to gather intelligence on Blue's coastal defenses and minefield layout.
    - *why:* Provide critical information for the amphibious assault, enabling Red forces to exploit any weaknesses in Blue's defense. *(refs: FM 3-05.17 §2-4)*
    - *intended effect:* Gain situational awareness of enemy dispositions to inform landing operations and subsequent maneuvers.
- **[ew]** `R-d0-500-077` — Maintain continuous electronic warfare against Blue's C2 networks to disrupt their command and control.
    - *why:* Persistent EW ensures Red forces can operate with minimal interference from Blue's communications, enhancing operational tempo. *(refs: AJP-3.1 Ed B §6-2)*
    - *intended effect:* Disrupt Blue's ability to coordinate defenses and maintain situational awareness during the amphibious assault.


**Blue intent.** Active defense with layered air defense and strategic strike advantage, holding ground units in reserve for Red culmination.


**Blue reactions (per component):**

- **[air]** `B-d1-2-013` — Conduct a counter-SHAD mission against Red's SEAD efforts, targeting their UAVs and radars.
    - *why:* Per FM 3-90 air defense doctrine, engage enemy air defense systems to protect friendly C2 networks and reduce the effectiveness of Red's SEAD operations. *(refs: FM 3-90)*
    - *intended effect:* Neutralize Red's SEAD capabilities, preserving Blue's command and control integrity.
- **[usv_uav]** `B-d1-2-013` — Deploy air-launched USVs to counter Red's USV minefield laying efforts, ensuring the defensive barrier remains intact.
    - *why:* Per ADP 3-90, use mobile air assets to counter enemy maritime threats and maintain control of key areas. *(refs: ADP 3-90)*
    - *intended effect:* Prevent additional minefields from degrading Blue's sea lanes and maintaining a robust defensive perimeter.
- **[ew]** `B-d1-501-014` — Engage Red's EW efforts with counter-electronic warfare measures, disrupting their C2 networks and reducing their operational tempo.
    - *why:* Per ATP 3-01.8, use electronic warfare to degrade enemy command and control capabilities, forcing them into a less coordinated engagement pattern. *(refs: ATP 3-01.8)*
    - *intended effect:* Disrupt Red's ability to coordinate operations effectively, leading to degraded performance in subsequent phases.


**Combined effect.** Local model fallback used after invalid adjudicator output. No additional combat effects were applied this phase.


**Adjudicator advantage call.** **BLUE_ADV** — Engine metrics preserved; local fallback after: ValidationError: 9 validation errors for PhaseResolution
phase
  Input should be a valid integer [type=int_type, input_value={'combined_effect': 'Blue...'ew_strength_blue': 0.0}, i


**State after this phase.** Red alive 84 / Blue alive 89. Red power total 160.5 / Blue power total 111.0. Mines remaining 400. Cum losses to date: Red 0, Blue 0.


---

## Final state at end of run

- Final phase: **0 — D-7 — تمهيد - الوضع قبل العمليات**
- Final adjudicator call: **BLUE_ADV**
- Final force ratio (local): 0.22:1
- Total Red losses: **0** units
- Total Blue losses: **0** units
- Red power remaining: 160.5
- Blue power remaining: 111.0

### Final inventory by domain

| Domain | Red alive/total | Blue alive/total |
|:-------|----------------:|-----------------:|
| strategic | 1/1 | 0/0 |
| naval | 18/18 | 6/6 |
| air | 21/21 | 19/19 |
| ground | 40/40 | 64/64 |
| sof | 4/4 | 0/0 |
