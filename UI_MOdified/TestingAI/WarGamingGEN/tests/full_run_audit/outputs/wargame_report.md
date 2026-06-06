# Wargame Narrative — Gulf of Sidra 2026 — Amphibious Assault

## Executive summary

- **Phases run**: 3 (steps 0–2)
- **Total adjudicated unit outcomes**: 15
- **Phase-level advantage calls**: RED_ADV=0, CONTESTED=0, BLUE_ADV=3
- **Final phase advantage**: **BLUE_ADV**
- **Final cumulative losses**: Red=7, Blue=8


---

## Force-ratio progression

| Phase | Time | Kind | FR local | FR op | Advantage | Red losses (cum) | Blue losses (cum) |
|------:|:-----|:-----|---------:|------:|:----------|-----------------:|------------------:|
| 0 | D-7 | shaping | 0.22:1 | 1.45:1 | BLUE_ADV | 4 | 4 |
| 1 | D-5 | strategic_strike | 0.23:1 | 1.43:1 | BLUE_ADV | 5 | 5 |
| 2 | D-3 | sead | 0.23:1 | 1.43:1 | BLUE_ADV | 7 | 8 |


---


## Phase 0 — D-7 — تمهيد - الوضع قبل العمليات

*Kind:* `shaping` &nbsp; *Phase line:* 0.0 km from coast


**Scene.** At D-7, Red forces are in the initial stages of their amphibious assault operation, focusing on shaping the battlefield. Despite their efforts, they face a significant disadvantage in local force ratio and combat power, with Blue forces maintaining a strong defensive posture along the coast.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.22:1 / 1.45:1**
- Engine call: **BLUE_ADV** — force ratio 0.22:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 400


**Red intent.** Initiate shaping operations to weaken Blue's defenses and establish conditions for a successful amphibious assault. Focus on clearing maritime lanes, disrupting Blue's C2, and gathering intelligence to inform future phases. Preserve strategic assets for decisive moments.


**Red actions (per component):**

- **[strategic]** `R-d0-500-077` — Held in reserve — preserving SSM magazine for H-hour saturation salvo per opening-day concentration doctrine.
    - *why:* To ensure maximum impact during initial assault, aligning with the doctrine of saturation strikes. *(refs: WarReferences.md, Doctrines.md)*
    - *intended effect:* Maximize effectiveness of SSMs at a critical moment.
- **[maritime]** `R-d3-2-045` — Deploy mine sweepers to clear lanes in the approach corridor.
    - *why:* Establish sea control by clearing mines, enabling safe passage for landing forces as per sea control doctrine. *(refs: Doctrines.md, JP 3-02 Amphibious Operations)*
    - *intended effect:* Secure a safe maritime corridor for amphibious operations.
- **[air]** `R-d3-12-055` — Deploy UAVs for ISR to map Blue's defensive positions and minefields.
    - *why:* Gather intelligence to inform the landing plan and identify potential threats, following the principle of operational tempo. *(refs: AJP-3.3 Air & Space Operations)*
    - *intended effect:* Accurate intelligence on Blue's defenses and minefield layout.
- **[usv_uav]** `R-d3-16-067` — Deploy kamikaze UAVs to target Blue's naval assets in port.
    - *why:* Disrupt Blue's naval capabilities early, aligning with saturation strike doctrine. *(refs: Doctrines.md, WarReferences.md)*
    - *intended effect:* Reduce Blue's naval threat to Red's amphibious operations.
- **[sof]** `R-d2-211-074` — Insert SOF teams to conduct reconnaissance and sabotage on Blue's C2 nodes.
    - *why:* Disrupt Blue's command and control to facilitate Red's operational tempo and vertical envelopment. *(refs: WarReferences.md, Doctrines.md)*
    - *intended effect:* Degrade Blue's C2 effectiveness and create confusion.
- **[ew]** `R-d3-405-014` — Initiate continuous electronic warfare operations to jam Blue's C2.
    - *why:* Maintain pressure on Blue's communications to support Red's operational tempo and mass at the decisive point. *(refs: Doctrines.md)*
    - *intended effect:* Continuous disruption of Blue's communications.


**Blue intent.** Maintain a hold-and-attrit posture to force Red's culmination. Preserve key assets and counter Red's ISR and sabotage attempts while leveraging prepared defenses.


**Blue reactions (per component):**

- **[strategic]** `B-d0-99-000` — Held position — preserving strategic strike capability for decisive counterattack when Red culminates.
    - *why:* Red has not yet committed strategic assets, and our advantage lies in countering at culmination. *(refs: Doctrines.md - Tenet: Defense types: area defense, mobile defense, retrograde.)*
    - *intended effect:* Preserve strategic strike capability for future decisive action.
- **[maritime]** `B-d1-4-035` — Deploy coastal radars to monitor and target Red mine sweepers.
    - *why:* To ensure that Red's mine clearance efforts are disrupted and our sea mines remain effective. *(refs: Doctrines.md - Tenet: Obstacle types: existing, reinforcing (mines, wire, antitank ditch)., Doctrines.md - Tenet: Countermobility = terrain reinforcement + obstacle employment.)*
    - *intended effect:* Prevent Red from clearing minefields, maintaining the integrity of our maritime defense.
- **[air]** `B-d2-3-048` — Deploy fighter squadron to intercept and neutralize Red's ISR UAVs.
    - *why:* To prevent Red from mapping our defensive positions and gaining intelligence on our minefields. *(refs: Doctrines.md - Tenet: Air defense planning at brigade and below.)*
    - *intended effect:* Deny Red ISR capabilities, maintaining the secrecy of our defensive layout.
- **[usv_uav]** `B-d1-8-031` — Deploy corvettes with CRAM systems to intercept kamikaze UAVs targeting naval assets.
    - *why:* To protect naval assets in port from Red's kamikaze UAV attacks. *(refs: Doctrines.md - Tenet: C-UAS defeats Group 1-5 UAS through detect, identify, decide, defeat.)*
    - *intended effect:* Preserve naval strength by neutralizing incoming UAV threats.
- **[sof]** `B-d1-504-021` — Deploy signal battalion to detect and counter Red SOF reconnaissance and sabotage attempts.
    - *why:* To protect C2 nodes from sabotage and maintain operational integrity. *(refs: Doctrines.md - Tenet: Defense types: area defense, mobile defense, retrograde.)*
    - *intended effect:* Prevent Red SOF from disrupting our command and control capabilities.
- **[ew]** `B-d1-505-022` — Initiate counter-EW operations to mitigate Red's jamming efforts.
    - *why:* To ensure continued communication and coordination among Blue forces. *(refs: Doctrines.md - Tenet: Air defense planning at brigade and below.)*
    - *intended effect:* Maintain effective C2 despite Red's electronic warfare operations.


**Combined effect.** Red's initial shaping operations faced significant challenges. Blue's coastal radars effectively targeted Red's mine sweepers, causing attrition and maintaining the integrity of Blue's minefields. Red's UAV ISR efforts were largely neutralized by Blue's fighter squadron, preventing significant intelligence gathering. Red's kamikaze UAVs faced heavy interception by Blue's corvettes with CRAM systems, resulting in minimal damage to Blue's naval assets. Red's SOF teams encountered strong resistance from Blue's signal battalion, limiting their impact on Blue's C2 nodes.


**Adjudicator advantage call.** **BLUE_ADV** — Force ratio 0.22:1 < 1.5:1 per FM 3-90 — Red approaching culmination


**Unit-by-unit outcomes:**

| Unit (UID) | Status | Damage | Cause | Doctrine |
|:-----------|:-------|------:|:------|:---------|
| `R-d3-2-045` | damaged_partial | 40% | B-d1-4-035 — Coastal radar targeting of mine sweepers | Wonsan 1950: 50% MCM attrition under coastal artillery overwatch |
| `R-d3-12-055` | damaged_partial | 30% | B-d2-3-048 — Fighter squadron intercept of ISR UAVs | Falklands air-to-air loss ratio 1:3 attacker:defender |
| `R-d3-16-067` | expended | 70% | B-d1-8-031 — CRAM interception of kamikaze UAVs | Black Sea 2024 USV survival 25-30% × 60-70% hit rate |
| `R-d2-211-074` | suppressed | 50% | B-d1-504-021 — Signal battalion counter-SOF operations | Doctrines.md - Tenet: Defense types: area defense, mobile defense, retrograde |
| `B-d1-4-035` | unchanged | 0% | R-d3-2-045 — Mine sweeper attempts to clear lanes | JP 3-02 Amphibious Operations |
| `B-d2-3-048` | unchanged | 0% | R-d3-12-055 — ISR UAV deployment | AJP-3.3 Air & Space Operations |
| `B-d1-8-031` | unchanged | 0% | R-d3-16-067 — Kamikaze UAV attack | Doctrines.md - Tenet: C-UAS defeats Group 1-5 UAS |
| `B-d1-504-021` | unchanged | 0% | R-d2-211-074 — SOF reconnaissance and sabotage | WarReferences.md - SOF operations |


**State after this phase.** Red alive 84 / Blue alive 89. Red power total 158.65 / Blue power total 111.0. Mines remaining 400. Cum losses to date: Red 4, Blue 4.


## Phase 1 — D-5 — تبادل صواريخ استراتيجية

*Kind:* `strategic_strike` &nbsp; *Phase line:* 0.0 km from coast


**Scene.** At D-5, Red initiated a strategic missile exchange targeting Blue's coastal defenses, but their efforts were largely ineffective due to the overwhelming Blue defensive capabilities. Both sides maintained equal electronic warfare intensity, but Red's limited combat power in contact hindered their ability to make significant progress.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.23:1 / 1.43:1**
- Engine call: **BLUE_ADV** — force ratio 0.23:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.70 / Blue 0.70
- Sea mines remaining: 400


**Red intent.** Preserve strategic assets for decisive engagement at H-hour while initiating EW operations to disrupt Blue's C2. This approach maintains flexibility and readiness for future phases, ensuring maximum impact when the main assault begins.


**Red actions (per component):**

- **[strategic]** `R-d0-500-077` — Held in reserve — preserving SSM magazine for H-hour saturation salvo per opening-day concentration doctrine
    - *why:* Preserving strategic strike capability for a decisive opening move at H-hour to achieve maximum impact. *(refs: WarReferences.md §1)*
    - *intended effect:* Maintain full SSM capability for future decisive engagement.
- **[ew]** `R-d3-405-014` — Initiate continuous jamming operations against Blue's C2 systems.
    - *why:* To disrupt Blue's command and control, maintaining operational tempo and reducing Blue's ability to coordinate defenses. *(refs: Operational tempo over methodical advance)*
    - *intended effect:* Degrade Blue's C2 effectiveness by ≥30% during initial phases.


**Blue intent.** Hold-and-attrit posture. Preserve strategic strike capability for decisive engagement. Counter Red's EW operations to maintain C2 integrity.


**Blue reactions (per component):**

- **[strategic]** `B-d0-المكون-030` — Held position — preserving SSM magazine for decisive engagement at Red culmination per ADP 3-0.
    - *why:* Red has not committed its SSMs, indicating a potential future saturation strike. Holding preserves our strategic strike capability for a decisive counter when Red culminates. *(refs: Doctrines.md — Tenet: Defending division shapes the close, deep, support area., Doctrines.md — Application: Blue strikes Red's follow-on echelons with 800-1000 km SSM.)*
    - *intended effect:* Maintain strategic strike capability for future decisive engagement.
- **[ew]** `B-d1-505-022` — Initiate counter-EW operations to protect C2 systems.
    - *why:* Red's continuous jamming operations threaten our C2 integrity. Counter-EW operations are necessary to maintain command and control. *(refs: WarReferences.md — Lesson: Side with better EW/ECM can survive in a longer-range opponent's 'envelope.')*
    - *intended effect:* Disrupt Red's jamming efforts and maintain C2 functionality.


**Combined effect.** Red initiated EW operations to disrupt Blue's C2, but Blue's counter-EW measures maintained C2 integrity. Both sides preserved their strategic missile capabilities for future decisive engagements. No significant attrition occurred as both sides focused on electronic warfare and strategic posturing.


**Adjudicator advantage call.** **BLUE_ADV** — Force ratio 0.23:1 < 1.5:1 per FM 3-90 — Red approaching culmination.


**Unit-by-unit outcomes:**

| Unit (UID) | Status | Damage | Cause | Doctrine |
|:-----------|:-------|------:|:------|:---------|
| `R-d3-405-014` | unchanged | 0% | B-d1-505-022 — Counter-EW operations maintained C2 functionality | WarReferences.md — Side with better EW/ECM can survive in a longer-range opponent's 'envelope.' |
| `B-d1-505-022` | unchanged | 0% | R-d3-405-014 — Continuous jamming operations against Blue's C2 | Operational tempo over methodical advance |


**State after this phase.** Red alive 84 / Blue alive 89. Red power total 158.65 / Blue power total 111.0. Mines remaining 400. Cum losses to date: Red 5, Blue 5.


## Phase 2 — D-3 — حملة قمع الدفاع الجوي SEAD

*Kind:* `sead` &nbsp; *Phase line:* 0.0 km from coast


**Scene.** At D-3, Red initiated a SEAD campaign against Blue's coastal defenses, but faced significant challenges due to a local force ratio of 0.23:1, indicating a strong Blue defensive posture. Both sides employed equal EW strength, but Red's limited power in contact hindered their ability to suppress Blue's air defenses effectively.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.23:1 / 1.43:1**
- Engine call: **BLUE_ADV** — force ratio 0.23:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.70 / Blue 0.70
- Sea mines remaining: 400


**Red intent.** The primary focus of this phase is to conduct effective SEAD operations to degrade Blue's air defense systems. This will enable Red air superiority and facilitate subsequent phases of the operation. Strategic SSMs are held in reserve for a decisive strike during the main assault.


**Red actions (per component):**

- **[strategic]** `R-d0-500-077` — Held in reserve — preserving SSM magazine for H-hour saturation salvo per opening-day concentration doctrine.
    - *why:* Strategic SSMs are more effective when used in a coordinated saturation strike at the decisive moment. *(refs: FM 3-09 §3-15, AJP-3.1 Ed B)*
    - *intended effect:* Maximize impact during the main assault phase.
- **[air]** `R-d3-14-051` — Conduct SEAD operations using Su-24 strike aircraft targeting Blue's 9th AD Bde (Hawk and S-300 systems).
    - *why:* SEAD is essential to degrade Blue's air defenses and enable Red air superiority over the AOI. *(refs: WarReferences.md [1], WarReferences.md [2], Doctrines.md [3])*
    - *intended effect:* Reduce Blue's strategic air defense capability by 10-15%.
- **[sof]** `R-d2-212-075` — Conduct reconnaissance and sabotage operations against Blue's air defense communication nodes.
    - *why:* Disrupt Blue's C2 to enhance the effectiveness of SEAD operations. *(refs: Doctrines.md [3])*
    - *intended effect:* Compromise Blue's air defense coordination and response time.
- **[ew]** `R-d3-405-014` — Conduct persistent jamming operations targeting Blue's air defense radar systems.
    - *why:* Continuous EW support is crucial to reduce Blue's radar effectiveness during SEAD operations. *(refs: Doctrines.md [3])*
    - *intended effect:* Decrease Blue's radar detection capability, enhancing SEAD effectiveness.


**Blue intent.** Hold-and-attrit posture, absorbing Red's SEAD efforts while preserving air defense capabilities. Utilize hardening and dispersal to minimize SEAD effectiveness and maintain operational readiness.


**Blue reactions (per component):**

- **[air]** `B-d2-3-048` — Conduct air patrols with F-16 squadron to deter and engage Red's SEAD aircraft.
    - *why:* To protect air defense assets by intercepting and disrupting Red's SEAD operations, leveraging air superiority to minimize attrition on ground-based systems. *(refs: ATP 3-01.4 J-SEAD — ALSA, ATP 3-01.8 Combined Arms for Air Defense (2016) — RDL Army)*
    - *intended effect:* Reduce effectiveness of Red's SEAD operations, preserving Blue's air defense capabilities.
- **[sof]** `B-d1-504-021` — Held position — maintaining communication integrity against Red SOF operations.
    - *why:* Preserving communication nodes to ensure continuous command and control, vital for coordinated defense operations. *(refs: Doctrines.md — Tenet: Protection through hardening, dispersal, concealment, deception.)*
    - *intended effect:* Prevent disruption of air defense communication, maintaining operational effectiveness.
- **[ew]** `B-d1-505-022` — Conduct counter-jamming operations to mitigate Red's persistent jamming efforts.
    - *why:* To maintain radar functionality and air defense coordination, countering Red's electronic warfare tactics. *(refs: ATP 3-01.8 Combined Arms for Air Defense (2016) — RDL Army)*
    - *intended effect:* Sustain radar operations and air defense network integrity despite Red's jamming.


**Combined effect.** Red's SEAD operations using Su-24s targeted Blue's 9th AD Bde, achieving partial degradation of air defenses. Blue's F-16 patrols intercepted, resulting in airframe losses for Red. Red's SOF operations disrupted some communication nodes, but Blue's hardening and dispersal minimized impact. EW operations from both sides neutralized each other, maintaining radar functionality.


**Adjudicator advantage call.** **BLUE_ADV** — Force ratio 0.23:1 < 1.5:1 per FM 3-90 — Red approaching culmination.


**Unit-by-unit outcomes:**

| Unit (UID) | Status | Damage | Cause | Doctrine |
|:-----------|:-------|------:|:------|:---------|
| `R-d3-14-051` | damaged_partial | 5% | B-d2-3-048 — Intercepted by F-16 squadron during SEAD operations | Falklands air-to-air loss ratio 1:3 attacker:defender |
| `B-d1-51-001` | damaged_partial | 10% | R-d3-14-051 — SEAD operations targeting Hawk and S-300 systems | Wild Weasel SEAD wave 10-15% AD attrition |
| `B-d1-52-005` | damaged_partial | 10% | R-d3-14-051 — SEAD operations targeting Hawk and S-300 systems | Wild Weasel SEAD wave 10-15% AD attrition |
| `B-d1-504-021` | suppressed | 10% | R-d2-212-075 — SOF operations disrupting communication nodes | Doctrines.md — Tenet: Protection through hardening, dispersal |
| `R-d3-405-014` | suppressed | 10% | B-d1-505-022 — Counter-jamming operations maintaining radar functionality | ATP 3-01.8 Combined Arms for Air Defense |


**State after this phase.** Red alive 84 / Blue alive 89. Red power total 158.4 / Blue power total 110.65. Mines remaining 400. Cum losses to date: Red 7, Blue 8.


---

## Final state at end of run

- Final phase: **2 — D-3 — حملة قمع الدفاع الجوي SEAD**
- Final adjudicator call: **BLUE_ADV**
- Final force ratio (local): 0.23:1
- Total Red losses: **7** units
- Total Blue losses: **8** units
- Red power remaining: 158.4
- Blue power remaining: 110.65

### Final inventory by domain

| Domain | Red alive/total | Blue alive/total |
|:-------|----------------:|-----------------:|
| strategic | 1/1 | 0/0 |
| naval | 18/18 | 6/6 |
| air | 21/21 | 19/19 |
| ground | 40/40 | 64/64 |
| sof | 4/4 | 0/0 |
