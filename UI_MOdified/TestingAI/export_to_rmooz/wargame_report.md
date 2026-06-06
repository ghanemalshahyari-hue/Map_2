# Wargame Narrative — Gulf of Sidra 2026 — Amphibious Assault

## Executive summary

- **Phases run**: 17 (steps 0–16)
- **Total adjudicated unit outcomes**: 147
- **Phase-level advantage calls**: RED_ADV=0, CONTESTED=0, BLUE_ADV=17
- **Final phase advantage**: **BLUE_ADV**
- **Final cumulative losses**: Red=76, Blue=70


---

## Force-ratio progression

| Phase | Time | Kind | FR local | FR op | Advantage | Red losses (cum) | Blue losses (cum) |
|------:|:-----|:-----|---------:|------:|:----------|-----------------:|------------------:|
| 0 | D-7 | shaping | 0.22:1 | 1.45:1 | BLUE_ADV | 6 | 6 |
| 1 | D-5 | strategic_strike | 0.24:1 | 1.41:1 | BLUE_ADV | 8 | 8 |
| 2 | D-3 | sead | 0.24:1 | 1.41:1 | BLUE_ADV | 9 | 11 |
| 3 | D-2 | naval_engagement | 0.25:1 | 1.41:1 | BLUE_ADV | 14 | 16 |
| 4 | D-1 | mine_clearance | 0.26:1 | 1.41:1 | BLUE_ADV | 16 | 18 |
| 5 | D-H | h_hour_strike | 0.24:1 | 1.41:1 | BLUE_ADV | 21 | 21 |
| 6 | D+2h | beach_assault | 0.25:1 | 1.4:1 | BLUE_ADV | 26 | 26 |
| 7 | D+6h | main_wave | 0.26:1 | 1.4:1 | BLUE_ADV | 31 | 31 |
| 8 | D+12h | beachhead_consolidation | 0.26:1 | 1.4:1 | BLUE_ADV | 35 | 35 |
| 9 | D+24h | first_counterattack | 0.26:1 | 1.4:1 | BLUE_ADV | 39 | 39 |
| 10 | D+36h | 9mid_lands | 0.99:1 | 1.39:1 | BLUE_ADV | 43 | 41 |
| 11 | D+48h | push_inland | 0.99:1 | 1.39:1 | BLUE_ADV | 49 | 44 |
| 12 | D+72h | 1ad_lands | 0.98:1 | 1.38:1 | BLUE_ADV | 53 | 48 |
| 13 | D+96h | blue_op_reserve | 0.98:1 | 1.38:1 | BLUE_ADV | 58 | 53 |
| 14 | D+120h | culmination_check | 0.97:1 | 1.37:1 | BLUE_ADV | 64 | 58 |
| 15 | D+132h | final_red_push | 0.97:1 | 1.37:1 | BLUE_ADV | 71 | 65 |
| 16 | D+144h | final_resolution | 0.97:1 | 1.37:1 | BLUE_ADV | 76 | 70 |


---


## Phase 0 — D-7 — تمهيد - الوضع قبل العمليات

*Kind:* `shaping` &nbsp; *Phase line:* 0.0 km from coast


**Scene.** At D-7, Red forces are in the initial stages of their amphibious assault, with a focus on shaping operations. Despite their efforts, they face a significant disadvantage in local force ratio and combat power, indicating a challenging operational posture as they approach culmination.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.22:1 / 1.45:1**
- Engine call: **BLUE_ADV** — force ratio 0.22:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.00 / Blue 0.00
- Sea mines remaining: 400


**Red intent.** The intent for Phase 0 is to shape the battlefield by securing sea control, degrading Blue's defensive capabilities, and gathering intelligence. This will set the conditions for a successful amphibious assault by exploiting identified weaknesses and ensuring safe passage for the main landing force.


**Red actions (per component):**

- **[strategic]** `R-d0-500-077` — Held in reserve — preserving SSM magazine for H-hour saturation salvo per opening-day concentration doctrine.
    - *why:* Holding SSMs for a decisive initial strike aligns with the doctrine of overwhelming the defender's intercept capacity at the critical moment. *(refs: Doctrines.md, WarReferences.md)*
    - *intended effect:* Maximize impact during the initial assault by conserving strategic missiles.
- **[maritime]** `R-d3-10-034` — Deploy mine layers to reinforce sea denial and prepare the approach corridor.
    - *why:* Establishing sea control is essential for power projection and protecting the landing force. *(refs: Doctrines.md)*
    - *intended effect:* Secure the approach corridor by deterring Blue naval movements.
- **[air]** `R-d3-12-055` — Deploy UAVs for ISR to identify Blue's defensive positions and reserve locations.
    - *why:* ISR is crucial for identifying gaps and weaknesses in Blue's defenses to exploit during the assault. *(refs: AJP-3.3 Air & Space Operations Ed B)*
    - *intended effect:* Gain actionable intelligence on Blue's defensive layout.
- **[mines]** `R-d3-2-045` — Deploy mine sweepers to clear a path through Blue's minefields.
    - *why:* Clearing mines is necessary to ensure safe passage for the amphibious landing forces. *(refs: ATP 3-90.4 Combined Arms Mobility)*
    - *intended effect:* Create a secure corridor for landing operations.
- **[usv_uav]** `R-d3-16-056` — Conduct a UAV strike on identified Blue radar installations.
    - *why:* Disrupting Blue's radar capabilities will degrade their situational awareness and defensive response. *(refs: AJP-3.3.3 Air-Maritime Coordination)*
    - *intended effect:* Reduce Blue's radar coverage and reaction time.
- **[sof]** `R-d2-211-074` — Insert SOF to conduct reconnaissance and disrupt Blue's rear-area C2.
    - *why:* Vertical envelopment with SOF can create chaos and confusion in Blue's command structure. *(refs: WarReferences.md)*
    - *intended effect:* Disrupt Blue's command and control in the rear area.
- **[ew]** `R-d3-405-014` — Initiate continuous EW operations to jam Blue's C2.
    - *why:* Persistent EW will degrade Blue's ability to coordinate their defense and react to Red's operations. *(refs: Doctrines.md)*
    - *intended effect:* Reduce Blue's command and control effectiveness.


**Blue intent.** Maintain a defensive posture by leveraging prepared positions and layered defenses. Focus on disrupting Red's ISR and mine-clearing efforts while preserving key assets for future phases. Hold reserves for Red's culmination.


**Blue reactions (per component):**

- **[strategic]** `B-d0-99-000` — Held position — preserving strategic assets for future engagement per ADP 3-0.
    - *why:* Strategic assets are held to ensure readiness for decisive engagements when Red reaches culmination. *(refs: ADP 3-0 reserve commitment at culmination)*
    - *intended effect:* Maintain strategic advantage and readiness for future phases.
- **[maritime]** `B-d1-6-034` — Deploy coastal support boats to monitor and disrupt Red mine-laying operations.
    - *why:* Prevent Red from reinforcing sea denial and ensure our minefields remain effective. *(refs: Doctrines.md - Obstacle effects: disrupt, fix, turn, block)*
    - *intended effect:* Disrupt Red's mine-laying efforts and maintain control over the maritime domain.
- **[air]** `B-d2-3-048` — Deploy F-16 squadron to intercept Red UAVs conducting ISR.
    - *why:* Prevent Red from gaining intelligence on Blue defensive positions and reserves. *(refs: Doctrines.md - C-UAS defeats Group 1-5 UAS)*
    - *intended effect:* Deny Red ISR capabilities and protect Blue's defensive posture.
- **[mines]** `B-d1-502-015` — Deploy ATGM battalion to cover minefields and engage Red mine sweepers.
    - *why:* Ensure minefields are effective by providing overwatch and fire support. *(refs: Doctrines.md - Countermobility = terrain reinforcement + obstacle employment)*
    - *intended effect:* Prevent Red from clearing minefields and maintain sea denial.
- **[usv_uav]** `B-d1-4-035` — Activate coastal radar systems to detect and track incoming UAVs targeting radar installations.
    - *why:* Protect critical radar infrastructure from UAV strikes. *(refs: Doctrines.md - Air defense planning at brigade and below)*
    - *intended effect:* Preserve radar capabilities and maintain situational awareness.
- **[sof]** `B-d1-504-021` — Deploy signal battalion to monitor and counter Red SOF reconnaissance activities.
    - *why:* Protect rear-area C2 from disruption and maintain communication integrity. *(refs: Doctrines.md - Defense types: area defense, mobile defense, retrograde)*
    - *intended effect:* Deny Red SOF effective reconnaissance and disruption capabilities.
- **[ew]** `B-d1-505-022` — Initiate counter-EW operations to protect Blue's C2 from Red jamming efforts.
    - *why:* Ensure continuous communication and command capabilities. *(refs: Doctrines.md - Air defense planning at brigade and below)*
    - *intended effect:* Neutralize Red's EW operations and maintain C2 effectiveness.


**Combined effect.** Red's attempts to shape the battlefield were largely thwarted by Blue's defensive measures. Red's UAV ISR efforts were intercepted by Blue's F-16s, resulting in significant losses. Red's mine-clearing operations faced heavy resistance from Blue's ATGM battalion, leading to high attrition among Red's minesweepers. Blue's counter-EW operations effectively neutralized Red's jamming attempts, maintaining Blue's C2 integrity.


**Adjudicator advantage call.** **BLUE_ADV** — Force ratio 0.22:1 < 1.5:1 per FM 3-90 — Red approaching culmination.


**Unit-by-unit outcomes:**

| Unit (UID) | Status | Damage | Cause | Doctrine |
|:-----------|:-------|------:|:------|:---------|
| `R-d3-12-055` | damaged_partial | 50% | B-d2-3-048 — UAVs intercepted by F-16 squadron | Doctrines.md - C-UAS defeats Group 1-5 UAS |
| `B-d2-3-048` | expended | 25% | R-d3-12-055 — Sorties flown to intercept Red UAVs | Doctrines.md - C-UAS defeats Group 1-5 UAS |
| `R-d3-2-045` | damaged_partial | 50% | B-d1-502-015 — Mine sweepers engaged by ATGM battalion | Wonsan 1950: 50% MCM attrition under coastal artillery overwatch |
| `B-d1-502-015` | unchanged | 0% | R-d3-2-045 — Engaged Red mine sweepers | Doctrines.md - Countermobility = terrain reinforcement + obstacle employment |
| `R-d3-405-014` | suppressed | 30% | B-d1-505-022 — EW operations countered by Blue | Doctrines.md - Air defense planning at brigade and below |
| `B-d1-505-022` | unchanged | 0% | R-d3-405-014 — Counter-EW operations against Red jamming | Doctrines.md - Air defense planning at brigade and below |
| `R-d3-16-056` | damaged_partial | 30% | B-d1-4-035 — UAV strike on radar installations intercepted | Doctrines.md - Air defense planning at brigade and below |
| `B-d1-4-035` | unchanged | 0% | R-d3-16-056 — Protected radar installations from UAV strike | Doctrines.md - Air defense planning at brigade and below |
| `R-d3-10-034` | suppressed | 20% | B-d1-6-034 — Mine-laying operations disrupted by coastal support boats | Doctrines.md - Obstacle effects: disrupt, fix, turn, block |
| `B-d1-6-034` | unchanged | 0% | R-d3-10-034 — Disrupted Red mine-laying operations | Doctrines.md - Obstacle effects: disrupt, fix, turn, block |
| `R-d2-211-074` | suppressed | 30% | B-d1-504-021 — SOF reconnaissance disrupted by signal battalion | Doctrines.md - Defense types: area defense, mobile defense, retrograde |
| `B-d1-504-021` | unchanged | 0% | R-d2-211-074 — Countered Red SOF reconnaissance | Doctrines.md - Defense types: area defense, mobile defense, retrograde |


**State after this phase.** Red alive 84 / Blue alive 89. Red power total 156.3 / Blue power total 111.0. Mines remaining 370. Cum losses to date: Red 6, Blue 6.


## Phase 1 — D-5 — تبادل صواريخ استراتيجية

*Kind:* `strategic_strike` &nbsp; *Phase line:* 0.0 km from coast


**Scene.** At D-5, Red initiated a strategic missile exchange targeting Blue's coastal defenses, but their efforts were largely ineffective due to the overwhelming Blue defensive measures. Both sides maintained equal electronic warfare intensity, but Red's limited combat power in contact hindered their ability to achieve significant breakthroughs.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.24:1 / 1.41:1**
- Engine call: **BLUE_ADV** — force ratio 0.24:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.70 / Blue 0.70
- Sea mines remaining: 370


**Red intent.** Initiate the operation with a strategic strike to degrade Blue's naval capabilities, setting conditions for the amphibious assault. Maintain electronic warfare pressure to disrupt Blue's command and control, ensuring operational advantage in the upcoming phases.


**Red actions (per component):**

- **[strategic]** `R-d0-500-077` — Fire 12 SSMs at Blue's coastal naval installations to degrade their naval capabilities by approximately 40%.
    - *why:* Pre-strike on enemy ports is a doctrinal opening move to degrade naval bases and immobilize assets, as seen in Libya 2011. *(refs: WarReferences.md §1 'Pre-strike on enemy ports', WarReferences.md §2 'Tomahawk salvo on naval base')*
    - *intended effect:* Reduce Blue's naval base effectiveness by 40% to limit their maritime response capability.
- **[ew]** `R-d3-405-014` — Continue persistent jamming of Blue's C2 systems to disrupt their coordination.
    - *why:* Continuous EW is essential to maintain pressure on Blue's C2 throughout operations, aligning with the doctrine of persistent EW. *(refs: EW persistent throughout)*
    - *intended effect:* Disrupt Blue's command and control to reduce their operational coordination.


**Blue intent.** Hold-and-attrit posture. Preserve naval capabilities and maintain C2 integrity despite Red's strategic and EW attacks. Focus on absorbing the initial strike and preparing for future engagements.


**Blue reactions (per component):**

- **[strategic]** `B-d1-4-035` — Held position — Red strike already absorbed by hardened coastal installations, counter-launch wastes magazine per ATP 3-01.8 economy of force.
    - *why:* Preserving strategic strike capabilities for future engagements when Red forces are more exposed. *(refs: Doctrines.md — Tenet: Defending division shapes the close, deep, support area., WarReferences.md — ASCM kill on cruiser (pair-launch, surprise).)*
    - *intended effect:* Maintain strategic strike potential for decisive future engagements.
- **[ew]** `B-d1-505-022` — Conduct counter-EW operations to mitigate Red's jamming efforts.
    - *why:* Ensure continuity of C2 systems to maintain coordination and operational effectiveness. *(refs: Doctrines.md — Tenet: Corps as senior tactical HQ; controls multiple divisions plus enablers.)*
    - *intended effect:* Reduce the impact of Red's jamming and maintain effective communication channels.


**Combined effect.** Red's strategic strike with 12 SSMs targeted Blue's coastal naval installations, but hardened defenses absorbed the impact, resulting in minimal degradation. Blue's counter-EW operations effectively mitigated Red's jamming, maintaining C2 integrity. Red's EW pressure was persistent but matched by Blue's countermeasures, resulting in a stalemate in electronic warfare.


**Adjudicator advantage call.** **BLUE_ADV** — Force ratio 0.24:1 < 1.5:1 per FM 3-90 — Red approaching culmination, unable to achieve decisive impact.


**Unit-by-unit outcomes:**

| Unit (UID) | Status | Damage | Cause | Doctrine |
|:-----------|:-------|------:|:------|:---------|
| `R-d0-500-077` | expended | 33% | R-d0-500-077 — Fired 12 SSMs at Blue's coastal naval installations | Libya 2011: Opening-day Tomahawk-class strike ~110 missiles degrade coastal naval base by ~40% |
| `B-d1-4-035` | unchanged | 0% | R-d0-500-077 — SSM strike absorbed by hardened coastal installations | ATP 3-01.8: Economy of force, preserving strategic strike capabilities |
| `R-d3-405-014` | unchanged | 0% | B-d1-505-022 — Persistent jamming met with effective counter-EW operations | EW persistent throughout |
| `B-d1-505-022` | unchanged | 0% | R-d3-405-014 — Counter-EW operations mitigated Red's jamming efforts | Doctrines.md: Corps as senior tactical HQ; controls multiple divisions plus enablers |


**State after this phase.** Red alive 84 / Blue alive 89. Red power total 156.3 / Blue power total 111.0. Mines remaining 370. Cum losses to date: Red 8, Blue 8.


## Phase 2 — D-3 — حملة قمع الدفاع الجوي SEAD

*Kind:* `sead` &nbsp; *Phase line:* 0.0 km from coast


**Scene.** At D-3, Red initiated a SEAD campaign against Blue's coastal defenses, but faced significant challenges due to a local force ratio of 0.24:1. Both sides employed equal EW strength, resulting in a stalemate that limited Red's ability to suppress Blue's air defenses effectively.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.24:1 / 1.41:1**
- Engine call: **BLUE_ADV** — force ratio 0.24:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.70 / Blue 0.70
- Sea mines remaining: 370


**Red intent.** Execute a SEAD campaign to degrade Blue's air defense systems, focusing on their Hawk and S-300 batteries. This will enable future air and amphibious operations by reducing the threat to Red's strike and landing forces. Maintain electronic warfare pressure to disrupt Blue's C2 and enhance SEAD effectiveness.


**Red actions (per component):**

- **[strategic]** `R-d0-500-077` — Held in reserve — preserving SSM magazine for H-hour saturation salvo per opening-day concentration doctrine.
    - *why:* Strategic SSMs are more effective when used in a coordinated saturation strike during the main assault. *(refs: AJP-3.1 Ed B)*
    - *intended effect:* Ensure maximum impact of SSMs during the main assault phase.
- **[air]** `R-d3-14-051` — Conduct SEAD sorties against Blue's 9th AD Bde using Su-24 strike aircraft with HARM missiles.
    - *why:* To reduce the effectiveness of Blue's air defenses by targeting Hawk and S-300 systems, enabling Red air operations. *(refs: WarReferences.md, Doctrines.md)*
    - *intended effect:* Degrade Blue's strategic air defense by 10-15%, reducing threat to Red air operations.
- **[ew]** `R-d3-405-014` — Continue electronic warfare operations to jam Blue's C2 systems.
    - *why:* Persistent EW disrupts Blue's command and control, enhancing SEAD effectiveness by reducing coordination. *(refs: Doctrines.md)*
    - *intended effect:* Maintain disruption of Blue's C2 to support SEAD operations.


**Blue intent.** Hold-and-attrit posture. Preserve air defense capabilities against SEAD while maintaining readiness for Red's culmination. Absorb electronic warfare impact to retain C2 integrity.


**Blue reactions (per component):**

- **[air]** `B-d2-3-048` — Held position — preserving fighter AD for Red culmination per ATP 3-01.8 economy of force.
    - *why:* Red's SEAD sorties are targeting our air defenses. By holding our fighter squadrons, we conserve airframes and counter Red's air operations when they are more vulnerable. *(refs: ATP 3-01.8 Combined Arms for Air Defense (2016))*
    - *intended effect:* Maintain air defense integrity and readiness for future Red air operations.
- **[ew]** `B-d1-505-022` — Held position — absorbing EW impact while maintaining C2 integrity per ATP 3-01.81.
    - *why:* Red's electronic warfare is attempting to disrupt our C2 systems. By holding, we focus on maintaining communication and coordination across our forces. *(refs: ATP 3-01.81 C-UAS (Aug 2023))*
    - *intended effect:* Preserve C2 functionality despite Red's EW efforts.


**Combined effect.** Red's SEAD campaign using Su-24s with HARM missiles targeted Blue's 9th AD Bde, achieving a 12% degradation of Blue's Hawk and S-300 systems. Blue's air defense preserved its fighter AD, minimizing losses. Red's EW operations maintained pressure on Blue's C2, but Blue's systems remained functional. Red lost 5% of its strike aircraft during SEAD sorties, consistent with historical SEAD operations.


**Adjudicator advantage call.** **BLUE_ADV** — Force ratio 0.24:1 < 1.5:1 per FM 3-90 — Red approaching culmination.


**Unit-by-unit outcomes:**

| Unit (UID) | Status | Damage | Cause | Doctrine |
|:-----------|:-------|------:|:------|:---------|
| `R-d3-14-051` | expended | 5% | B-d2-3-048 — SEAD sorties against Blue's 9th AD Bde | Wild Weasel: 5% strike loss per SEAD sortie |
| `B-d1-51-001` | damaged_partial | 12% | R-d3-14-051 — HARM missile strike on Hawk/S-300 systems | Wild Weasel: 10-15% AD attrition per SEAD wave |
| `B-d1-52-005` | damaged_partial | 12% | R-d3-14-051 — HARM missile strike on Hawk/S-300 systems | Wild Weasel: 10-15% AD attrition per SEAD wave |
| `B-d1-505-022` | suppressed | 30% | R-d3-405-014 — EW operations jamming Blue's C2 systems | Persistent EW disrupts C2, enhancing SEAD effectiveness |


**State after this phase.** Red alive 84 / Blue alive 89. Red power total 156.3 / Blue power total 110.49. Mines remaining 370. Cum losses to date: Red 9, Blue 11.


## Phase 3 — D-2 — اشتباك بحري سطحي + ASW

*Kind:* `naval_engagement` &nbsp; *Phase line:* 0.0 km from coast


**Scene.** At D-2, Red's naval forces engaged Blue in a surface and anti-submarine warfare battle near the coast. Despite Red's electronic warfare advantage, Blue's superior local combat power and pre-laid sea mines constrained Red's advance, indicating a defensive posture for Blue.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.25:1 / 1.41:1**
- Engine call: **BLUE_ADV** — force ratio 0.25:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.70 / Blue 0.35
- Sea mines remaining: 370


**Red intent.** Execute a coordinated naval and air assault to degrade Blue's maritime capabilities and prepare for the amphibious landing. Utilize EW to disrupt Blue's C2 and enhance the effectiveness of our missile strikes.


**Red actions (per component):**

- **[strategic]** `R-d0-500-077` — Held in reserve — preserving SSM magazine for H-hour saturation salvo per opening-day concentration doctrine.
    - *why:* To ensure maximum impact during the initial assault on Blue's coastal defenses. *(refs: AJP-3.1 Maritime Operations, JP 3-02 Amphibious Operations)*
    - *intended effect:* Maintain SSM readiness for decisive engagement at H-hour.
- **[maritime]** `R-d3-20-033` — Deploy missile boats to engage Blue's coastal support boats and clear a path for landing ships.
    - *why:* To reduce Blue's maritime threat and secure a safe passage for the amphibious landing. *(refs: AJP-3.1 Maritime Operations, WarReferences.md)*
    - *intended effect:* Neutralize Blue's coastal support boats, reducing their ability to disrupt our operations.
- **[air]** `R-d3-11-049` — Launch MiG-29 squadron to provide air cover and engage Blue's F-16s.
    - *why:* To establish air superiority and protect our naval forces from Blue's air threats. *(refs: AJP-3.3 Air & Space Operations, Doctrines.md)*
    - *intended effect:* Achieve air dominance over the AOI, reducing Blue's air threat.
- **[mines]** `R-d3-2-035` — Deploy minesweepers to clear a path through the remaining sea mines.
    - *why:* To ensure safe passage for our landing ships during the amphibious assault. *(refs: ATP 3-90.4 Combined Arms Mobility)*
    - *intended effect:* Clear a secure lane through the minefield for the amphibious force.
- **[usv_uav]** `R-d3-16-056` — Launch UAVs in a mass strike against Blue's coastal radar installations.
    - *why:* To degrade Blue's ISR capabilities and facilitate our naval and air operations. *(refs: WarReferences.md, AJP-3.3.3 Air-Maritime Coordination)*
    - *intended effect:* Disrupt Blue's radar coverage, enhancing our operational freedom.
- **[sof]** `R-d2-212-075` — Conduct reconnaissance to identify Blue's naval positions and vulnerabilities.
    - *why:* To gather intelligence for targeting and operational planning. *(refs: JP 3-02 Amphibious Operations)*
    - *intended effect:* Provide actionable intelligence on Blue's naval deployments.
- **[ew]** `R-d3-405-014` — Continue EW operations to jam Blue's C2 systems.
    - *why:* To disrupt Blue's command and control, reducing their operational effectiveness. *(refs: AJP-3 Conduct of Operations)*
    - *intended effect:* Impair Blue's ability to coordinate their defenses.


**Blue intent.** Hold-and-attrit posture to exploit Red's culmination. Maintain defensive positions, preserve key assets, and leverage coastal defenses to inflict maximum attrition on Red forces.


**Blue reactions (per component):**

- **[strategic]** `B-d0-المكون-030` — Held position — preserving SSM magazine for critical engagement at Red's culmination per ADP 3-0.
    - *why:* Strategic strike advantage requires holding SSMs for decisive engagement. *(refs: ADP 3-0, Doctrines.md)*
    - *intended effect:* Ensure SSM availability for maximum impact at Red culmination.
- **[maritime]** `B-d1-8-031` — Deploy corvettes to engage Red missile boats and protect minefields.
    - *why:* Sea denial through active engagement of Red naval forces to prevent mine clearance. *(refs: Doctrines.md, WarReferences.md)*
    - *intended effect:* Neutralize Red missile boats and maintain minefield integrity.
- **[air]** `B-d2-1-052` — Launch Rafale squadron to intercept Red MiG-29s and protect F-16s.
    - *why:* Air superiority is crucial to protect naval and coastal assets. *(refs: Doctrines.md, AJP-3.3 Air & Space Operations)*
    - *intended effect:* Achieve air superiority and prevent Red from gaining air cover.
- **[mines]** `B-d1-6-034` — Deploy coastal support boats to monitor and disrupt Red minesweeping operations.
    - *why:* Preserve minefield effectiveness by preventing Red clearance efforts. *(refs: Doctrines.md, WarReferences.md)*
    - *intended effect:* Delay or prevent Red's mine clearance to maintain sea denial.
- **[usv_uav]** `B-d1-501-014` — Deploy UAVs to intercept and neutralize Red UAV mass strike.
    - *why:* Protect coastal radar installations critical for surveillance and targeting. *(refs: Doctrines.md, AJP-3.3.3 Air-Maritime Coordination)*
    - *intended effect:* Minimize damage to radar installations and maintain situational awareness.
- **[sof]** `B-d2-سريةال-023` — Conduct counter-reconnaissance operations to locate and neutralize Red SOF.
    - *why:* Prevent Red from identifying vulnerabilities in Blue's naval positions. *(refs: Doctrines.md, AJP-3.2 Land Operations)*
    - *intended effect:* Deny Red valuable intelligence and maintain operational security.
- **[ew]** `B-d1-505-022` — Held position — EW systems suppressed, conserving resources for critical phases.
    - *why:* Preserve EW capabilities for future engagements when suppression is reduced. *(refs: Doctrines.md, ATP 3-01.8)*
    - *intended effect:* Maintain EW capability for decisive future operations.


**Combined effect.** Red's missile boats attempted to engage Blue's coastal support boats but were intercepted by Blue's corvettes, resulting in significant Red losses. Red's MiG-29s clashed with Blue's Rafales, with Blue maintaining air superiority. Red's UAV strike on Blue's radar installations was partially successful, but Blue's UAVs intercepted a portion of the strike. Red's minesweepers faced heavy resistance from Blue's coastal support boats, resulting in high attrition. Force ratio 0.25:1 < 1.5:1 per FM 3-90 — BLUE_ADV holds as Red approaches culmination.


**Adjudicator advantage call.** **BLUE_ADV** — Force ratio 0.25:1 < 1.5:1 per FM 3-90 — Red approaching culmination.


**Unit-by-unit outcomes:**

| Unit (UID) | Status | Damage | Cause | Doctrine |
|:-----------|:-------|------:|:------|:---------|
| `R-d3-20-033` | damaged_partial | 50% | B-d1-8-031 — Intercepted by Blue corvettes during missile boat engagement | Falklands ASCM hit probability 0.5, kill given hit 0.4 |
| `B-d1-8-031` | damaged_partial | 30% | R-d3-20-033 — Engaged by Red missile boats | Falklands ASCM hit probability 0.5, kill given hit 0.4 |
| `R-d3-11-049` | damaged_partial | 20% | B-d2-1-052 — Intercepted by Blue Rafales during air cover operation | SEAD strike-aircraft loss per sortie 5% |
| `B-d2-1-052` | damaged_partial | 10% | R-d3-11-049 — Engaged by Red MiG-29s | SEAD strike-aircraft loss per sortie 5% |
| `R-d3-16-056` | expended | 40% | B-d1-501-014 — Intercepted during UAV mass strike | Black Sea 2024 USV survival 25-30% |
| `B-d1-501-014` | damaged_partial | 20% | R-d3-16-056 — Engaged by Red UAVs | Black Sea 2024 USV survival 25-30% |
| `R-d3-2-035` | damaged_partial | 50% | B-d1-6-034 — Disrupted during mine clearance by Blue coastal support boats | Wonsan 1950 minesweeper attrition 30-50% |
| `B-d1-6-034` | damaged_partial | 20% | R-d3-2-035 — Engaged by Red minesweepers | Wonsan 1950 minesweeper attrition 30-50% |
| `R-d2-212-075` | suppressed | 30% | B-d2-سريةال-023 — Counter-reconnaissance operations by Blue SOF | Cyprus 1974 airborne drop loss 5-8% |
| `B-d2-سريةال-023` | suppressed | 20% | R-d2-212-075 — Engaged by Red SOF reconnaissance | Cyprus 1974 airborne drop loss 5-8% |


**State after this phase.** Red alive 84 / Blue alive 89. Red power total 154.35 / Blue power total 109.29. Mines remaining 340. Cum losses to date: Red 14, Blue 16.


## Phase 4 — D-1 — تطهير حقول الألغام البحرية

*Kind:* `mine_clearance` &nbsp; *Phase line:* 0.0 km from coast


**Scene.** At D-1, Red forces attempted mine clearance operations under significant Blue defensive pressure. Despite Red's electronic warfare efforts, Blue's superior local combat power and remaining sea mines hindered Red's progress, indicating a challenging operational posture for Red.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.26:1 / 1.41:1**
- Engine call: **BLUE_ADV** — force ratio 0.26:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.70 / Blue 0.17
- Sea mines remaining: 340


**Red intent.** Focus on clearing sea mines to ensure safe passage for the amphibious landing. Utilize electronic warfare to disrupt Blue's overwatch capabilities and protect mine-clearing operations. Hold strategic and air assets in reserve for later phases when they can be more decisive.


**Red actions (per component):**

- **[strategic]** `R-d0-500-077` — Held in reserve — preserving SSM magazine for H-hour saturation salvo per opening-day concentration doctrine.
    - *why:* Strategic missiles are more effective when used in a concentrated salvo to overwhelm Blue defenses at a critical moment. *(refs: AJP-3.1 Ed B)*
    - *intended effect:* Maximize impact during the main assault phase.
- **[maritime]** `R-d3-2-035` — Deploy minesweepers to begin clearing sea mines along the designated amphibious approach routes.
    - *why:* Mine clearance is critical to ensure the safe passage of landing forces and prevent delays in the operation. *(refs: WarReferences.md, Doctrines.md)*
    - *intended effect:* Clear a safe path through the minefield to enable the landing of forces.
- **[air]** `R-d3-11-049` — Held in reserve — preserving fighter AD for later phases when Blue's air defenses are more attrited.
    - *why:* Conserving air assets for a decisive air superiority push during the main assault. *(refs: ATP 3-01.8)*
    - *intended effect:* Ensure air superiority during the critical landing phase.
- **[mines]** `R-d3-2-035` — Deploy minesweepers to clear sea mines at a rate of 50 mines per day per sweeper.
    - *why:* Clearing mines is essential to secure the approach for the amphibious assault. *(refs: Doctrines.md, WarReferences.md)*
    - *intended effect:* Reduce mine threat to acceptable levels for safe passage.
- **[ew]** `R-d3-405-014` — Continue electronic warfare operations to disrupt Blue's C2 and reduce their ability to coordinate defenses.
    - *why:* Persistent EW is necessary to degrade Blue's command and control, facilitating mine clearance and reducing risk to Red forces. *(refs: FM 3-09 §3-15, AJP-3.1 Ed B)*
    - *intended effect:* Disrupt Blue's overwatch and reduce effectiveness of their defensive operations.


**Blue intent.** Hold-and-attrit posture to delay Red's mine clearance and preserve strategic assets. Focus on attriting Red's minesweepers with coastal artillery and maintaining air defense readiness for future phases.


**Blue reactions (per component):**

- **[strategic]** `B-d0-99-000` — Held position — preserving strategic strike capability for Red culmination per ADP 3-0.
    - *why:* Strategic assets are held in reserve to maximize impact during Red's culmination phase. *(refs: ADP 3-0 reserve commitment at culmination)*
    - *intended effect:* Maintain strategic strike advantage for decisive engagements.
- **[maritime]** `B-d1-4-035` — Deploy coastal radars to monitor and target Red minesweepers.
    - *why:* Ensure mines are covered by observation and fire to disrupt Red's clearance operations. *(refs: FM 3-90's obstacle employment, Wonsan 1950 baseline)*
    - *intended effect:* Attrit Red's minesweeper force, slowing their clearance rate.
- **[air]** `B-d2-3-048` — Held position — preserving fighter AD for later phases when Red's air force engages.
    - *why:* Maintain air defense readiness for future Red air operations. *(refs: ATP 3-01.8 economy of force)*
    - *intended effect:* Ensure air superiority during critical phases.
- **[mines]** `B-d1-3-036` — Deploy mine layers to reinforce minefields in response to Red's clearance efforts.
    - *why:* Increase mine density to delay Red's clearance operations and protect coastal approaches. *(refs: FM 3-90's counter-mobility, Wonsan 1950 baseline)*
    - *intended effect:* Extend the time required for Red to clear mines, delaying their amphibious assault.
- **[ew]** `B-d1-505-022` — Conduct electronic countermeasures to disrupt Red's EW operations.
    - *why:* Reduce the effectiveness of Red's EW efforts to maintain Blue's C2 capabilities. *(refs: FM 3-90's C2 protection)*
    - *intended effect:* Preserve Blue's ability to coordinate defenses effectively.


**Combined effect.** Red's minesweeping operations faced significant attrition under Blue's coastal artillery fire, with two minesweepers lost. Blue's reinforcement of minefields further delayed Red's clearance efforts. Red's EW operations partially disrupted Blue's C2, but Blue's countermeasures maintained overall defensive coordination. The mine clearance rate was severely impacted, paralleling Wonsan 1950's high minesweeper attrition under fire.


**Adjudicator advantage call.** **BLUE_ADV** — Force ratio 0.26:1 < 1.5:1 per FM 3-90 — Red approaching culmination.


**Unit-by-unit outcomes:**

| Unit (UID) | Status | Damage | Cause | Doctrine |
|:-----------|:-------|------:|:------|:---------|
| `R-d3-2-035` | destroyed | 100% | B-d1-4-035 — Coastal artillery fire on Red minesweepers | Wonsan 1950: 50% MCM attrition under coastal artillery fire |
| `R-d3-2-035` | destroyed | 100% | B-d1-3-036 — Reinforced minefield impact on Red minesweepers | Wonsan 1950: 50% MCM attrition under coastal artillery fire |
| `B-d1-4-035` | suppressed | 30% | R-d3-405-014 — Red EW operations disrupting Blue C2 | FM 3-09 §3-15: EW operations degrade C2 |
| `B-d1-505-022` | suppressed | 20% | R-d3-405-014 — Red EW operations disrupting Blue C2 | FM 3-09 §3-15: EW operations degrade C2 |
| `R-d3-405-014` | suppressed | 30% | B-d1-505-022 — Blue ECM countering Red EW | FM 3-90's C2 protection |


**State after this phase.** Red alive 83 / Blue alive 89. Red power total 153.7 / Blue power total 108.89. Mines remaining 310. Cum losses to date: Red 16, Blue 18.


## Phase 5 — D-H — الضربة المركزة متعددة الاتجاهات + الإنزال

*Kind:* `h_hour_strike` &nbsp; *Phase line:* 1.5 km from coast


**Scene.** At D-H, Red's amphibious assault encountered significant resistance as they approached the coast, with Blue's defensive positions effectively engaging the incoming forces. Despite Red's efforts, the local force ratio of 0.24:1 indicates a challenging operational posture for Red, as they face strong Blue defenses and are nearing culmination.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.24:1 / 1.41:1**
- Engine call: **BLUE_ADV** — force ratio 0.24:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.70 / Blue 0.70
- Sea mines remaining: 310


**Red intent.** Execute a coordinated multi-domain assault to overwhelm Blue's defenses at the beachhead, establish a foothold at OBJ-X, and disrupt Blue's command and control. Preserve strategic assets for future decisive engagements while maintaining operational tempo.


**Red actions (per component):**

- **[strategic]** `R-d0-500-077` — Held in reserve — preserving SSM magazine for H-hour saturation salvo per opening-day concentration doctrine.
    - *why:* To ensure maximum impact during a critical phase, maintaining magazine depth for decisive engagement. *(refs: WarReferences.md)*
    - *intended effect:* Preserve strategic strike capability for future decisive engagement.
- **[maritime]** `R-d3-60-028` — Deploy 60 medium landing ships to approach the coastline, supporting the amphibious assault.
    - *why:* To mass at the decisive point and ensure operational tempo by landing ground forces swiftly. *(refs: WarReferences.md)*
    - *intended effect:* Successfully land ground forces to establish a beachhead.
- **[air]** `R-d3-11-049` — Launch MiG-29 squadron to establish air superiority and protect the landing operation.
    - *why:* To ensure air dominance and protect the amphibious forces from Blue's air threats. *(refs: WarReferences.md)*
    - *intended effect:* Secure airspace over the landing zone, reducing Blue's air threat.
- **[mines]** `R-d3-2-045` — Deploy mine sweepers to clear paths through remaining sea mines for landing ships.
    - *why:* To ensure safe passage for amphibious forces and maintain operational tempo. *(refs: WarReferences.md)*
    - *intended effect:* Clear mine lanes to enable landing operations without hindrance.
- **[usv_uav]** `R-d3-16-063` — Launch explosive UAVs in a coordinated wave with USVs to saturate Blue's defenses.
    - *why:* To overwhelm Blue's intercept capacity and deplete their defensive resources. *(refs: WarReferences.md)*
    - *intended effect:* Reduce Blue's interception capability and create openings for Red forces.
- **[sof]** `R-d1-21-073` — Conduct vertical envelopment to disrupt Blue's rear-area C2.
    - *why:* To exploit gaps and disrupt Blue's command and control, aligning with operational tempo doctrine. *(refs: WarReferences.md)*
    - *intended effect:* Disrupt Blue's C2 to facilitate Red's main assault.
- **[land]** `R-d3-41-005` — Land and advance towards OBJ-X to establish a foothold.
    - *why:* To mass at the decisive point and exploit operational momentum. *(refs: WarReferences.md)*
    - *intended effect:* Secure a foothold at OBJ-X, advancing Red's operational objectives.
- **[ew]** `R-d3-405-014` — Continue EW operations to jam Blue's C2 systems.
    - *why:* To maintain pressure on Blue's communications and disrupt their coordination. *(refs: WarReferences.md)*
    - *intended effect:* Degrade Blue's C2 effectiveness, aiding Red's assault.


**Blue intent.** Hold-and-attrit posture to force Red culmination. Preserve air defense magazines and reserves, while targeting Red's MCM operations to maintain minefield integrity.


**Blue reactions (per component):**

- **[maritime]** `B-d1-8-031` — Deploy corvettes to interdict Red's mine sweepers and protect remaining sea mines.
    - *why:* Protecting the minefield is crucial to delaying Red's amphibious landing. By targeting MCM operations, we maintain the integrity of our defensive minefield, a key component of our coastal defense strategy. *(refs: WarReferences.md - Sea mines as campaign-decisive weapon, Doctrines.md - Coastal defense uses CDCM, coastal artillery, surveillance, and naval forces in concert.)*
    - *intended effect:* Prevent Red from clearing mine paths, maintaining minefield effectiveness and delaying Red's landing.
- **[air]** `B-d2-3-048` — Launch F-16 squadron to contest air superiority against Red's MiG-29s.
    - *why:* Maintaining air superiority is critical to protect our forces and infrastructure from Red's air operations. Engaging Red's air assets directly reduces their ability to support the amphibious assault. *(refs: ATP 3-01.8 Combined Arms for Air Defense, Doctrines.md - Joint multi-service tactics for suppressing enemy SAM and AAA systems.)*
    - *intended effect:* Deny Red air superiority, reducing their ability to protect landing operations and support ground forces.
- **[mines]** `B-d1-3-036` — Deploy mine layers to reinforce existing minefields and complicate Red's MCM efforts.
    - *why:* Reinforcing minefields increases the difficulty and time required for Red's MCM operations, maintaining our defensive posture and delaying Red's landing. *(refs: WarReferences.md - Sea mines as campaign-decisive weapon)*
    - *intended effect:* Increase the density and complexity of minefields, slowing Red's clearance efforts and protecting the coast.
- **[usv_uav]** `B-d2-12-050` — Launch UAVs to intercept and neutralize Red's explosive UAVs and USVs.
    - *why:* Countering Red's multi-vector strike is essential to preserve our defensive capabilities and prevent saturation of our defenses. *(refs: Doctrines.md - C-UAS defeats Group 1-5 UAS through detect, identify, decide, defeat, WarReferences.md - Saturation rule for multi-vector strikes)*
    - *intended effect:* Neutralize the majority of Red's UAV and USV threats, preserving our air defense magazines for future engagements.
- **[land]** `B-d1-51-001` — Hold position — preserving reserve combat power for Red culmination per ADP 3-0.
    - *why:* Engaging prematurely could expose our forces to unnecessary risk. Holding allows us to engage Red at their culmination point, maximizing our defensive advantage. *(refs: ADP 3-0 Unified Land Operations, FM 3-90 Tactics)*
    - *intended effect:* Preserve combat power for decisive engagement at Red's culmination.
- **[ew]** `B-d1-505-022` — Conduct counter-EW operations to disrupt Red's jamming efforts.
    - *why:* Maintaining C2 integrity is critical for effective coordination and response to Red's actions. Counter-EW operations help preserve our communication capabilities. *(refs: Doctrines.md - Joint multi-service tactics for suppressing enemy SAM and AAA systems)*
    - *intended effect:* Reduce the effectiveness of Red's jamming, maintaining operational C2.


**Combined effect.** Red's multi-domain assault faced significant challenges. Blue's corvettes successfully interdicted Red's mine sweepers, maintaining the integrity of the minefield and delaying Red's landing. Blue's F-16s contested air superiority, resulting in the loss of several Red MiG-29s. Red's explosive UAVs and USVs were largely intercepted by Blue's UAVs, preserving Blue's defensive capabilities. Red's EW efforts were countered effectively, maintaining Blue's C2 integrity.


**Adjudicator advantage call.** **BLUE_ADV** — Force ratio 0.24:1 < 1.5:1 per FM 3-90 — Red approaching culmination, unable to sustain offensive momentum.


**Unit-by-unit outcomes:**

| Unit (UID) | Status | Damage | Cause | Doctrine |
|:-----------|:-------|------:|:------|:---------|
| `R-d3-60-028` | delayed | 50% | B-d1-8-031 — Corvettes interdicted mine sweepers, delaying landing ships | Wonsan 1950: 50% MCM attrition under coastal artillery overwatch |
| `R-d3-11-049` | damaged_partial | 30% | B-d2-3-048 — F-16s contested air superiority, damaging MiG-29s | Cyprus 1974: 5-8% loss when alerted |
| `R-d3-16-063` | expended | 70% | B-d2-12-050 — UAVs intercepted explosive UAVs and USVs | Black Sea 2024: USV survival 25-30% |
| `R-d3-2-045` | destroyed | 100% | B-d1-8-031 — Corvettes destroyed mine sweepers | Wonsan 1950: 50% MCM attrition under coastal artillery overwatch |
| `B-d1-8-031` | damaged_partial | 20% | R-d3-16-063 — Explosive UAVs damaged corvettes | Black Sea 2024: USV kill per surviving USV 60-70% |
| `B-d2-3-048` | damaged_partial | 10% | R-d3-11-049 — MiG-29s engaged F-16s | Cyprus 1974: 5-8% loss when alerted |
| `B-d2-12-050` | expended | 50% | R-d3-16-063 — Intercepted explosive UAVs and USVs | Black Sea 2024: USV survival 25-30% |
| `R-d3-405-014` | suppressed | 40% | B-d1-505-022 — Counter-EW operations disrupted jamming | Doctrines.md: Joint multi-service tactics for suppressing enemy SAM and AAA systems |


**State after this phase.** Red alive 82 / Blue alive 89. Red power total 151.86 / Blue power total 108.35. Mines remaining 280. Cum losses to date: Red 21, Blue 21.


## Phase 6 — D+2h — اقتحام الشاطئ - المرحلة 1 (طلائع)

*Kind:* `beach_assault` &nbsp; *Phase line:* 3.0 km from coast


**Scene.** At D+2h, Red's initial beach assault faces significant challenges as they encounter strong Blue defenses. Despite Red's efforts, the local force ratio heavily favors Blue, with Red's combat power in contact significantly outmatched.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.25:1 / 1.4:1**
- Engine call: **BLUE_ADV** — force ratio 0.25:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.70 / Blue 0.70
- Sea mines remaining: 280


**Red intent.** The intent is to establish a secure beachhead through coordinated air, naval, and land operations while disrupting Blue's defenses and C2. By maintaining pressure across all domains, we aim to create conditions for a successful follow-on assault and eventual seizure of Objective X.


**Red actions (per component):**

- **[strategic]** `R-d0-500-077` — Held in reserve — preserving SSM magazine for H-hour saturation salvo per opening-day concentration doctrine.
    - *why:* To maintain strategic strike capability for critical phases and ensure a decisive impact when Blue forces are most vulnerable. *(refs: FM 3-09 §3-15, AJP-3.1 Ed B)*
    - *intended effect:* Maximize impact during a critical engagement phase.
- **[maritime]** `R-d3-10-030` — Deploy destroyers to provide naval gunfire support and protect landing craft from Blue's corvettes.
    - *why:* To ensure safe passage for landing forces and provide fire support as per US Navy/Marine Corps amphibious doctrine. *(refs: Doctrines.md §4, WarReferences.md §5)*
    - *intended effect:* Secure beachhead by neutralizing Blue's naval threats.
- **[air]** `R-d3-11-049` — Launch MiG-29 squadron to achieve air superiority over the landing zone.
    - *why:* To protect landing forces from Blue's air threats and maintain operational tempo. *(refs: WarReferences.md §2)*
    - *intended effect:* Establish air dominance to facilitate unhindered amphibious operations.
- **[mines]** `R-d3-10-034` — Deploy mine layers to create defensive minefields protecting the landing zone from Blue naval counterattacks.
    - *why:* To disrupt and block Blue's naval movements, securing the amphibious approach. *(refs: Doctrines.md §3)*
    - *intended effect:* Prevent Blue naval forces from interfering with the landing.
- **[usv_uav]** `R-d3-16-067` — Launch kamikaze UAVs to overwhelm Blue's air defense systems at the beachhead.
    - *why:* To saturate Blue's defenses and create openings for follow-on forces. *(refs: Saturation strikes doctrine)*
    - *intended effect:* Reduce Blue's air defense effectiveness by ≥40%.
- **[sof]** `R-d1-21-073` — Conduct vertical envelopment by inserting behind Blue's beach defenses to disrupt C2.
    - *why:* To exploit gaps and disrupt Blue's command and control, enhancing operational tempo. *(refs: Vertical envelopment doctrine)*
    - *intended effect:* Disrupt Blue's rear-area C2 and create confusion.
- **[land]** `R-d2-4-004` — Commence landing operations with 4-MID to establish a foothold on the beach.
    - *why:* To mass at the decisive point and exploit Blue's defenses. *(refs: Mass at the decisive point doctrine)*
    - *intended effect:* Secure a beachhead for follow-on forces.
- **[ew]** `R-d3-405-014` — Conduct continuous jamming of Blue's C2 systems to degrade their operational effectiveness.
    - *why:* To maintain EW pressure and disrupt Blue's coordination. *(refs: EW persistent throughout doctrine)*
    - *intended effect:* Reduce Blue's C2 capability by ≥30%.


**Blue intent.** Hold-and-attrit strategy to exploit Red's culmination. Preserve reserves while maximizing attrition on Red's initial landing forces. Engage Red's air and naval threats to maintain control over the beachhead.


**Blue reactions (per component):**

- **[strategic]** `B-d0-99-000` — Held position — preserving strategic strike capability for Red culmination per ADP 3-0.
    - *why:* Strategic assets are preserved for decisive engagement at Red's culmination.
    - *intended effect:* Maintain strategic strike capability for future phases.
- **[maritime]** `B-d1-8-031` — Deploy corvettes to intercept Red destroyers and protect minefields.
    - *why:* Corvettes provide naval gunfire support and protect pre-laid mines per coastal defense doctrine. *(refs: Doctrines.md — Coastal defense uses CDCM, coastal artillery, surveillance, and naval forces in concert.)*
    - *intended effect:* Prevent Red naval gunfire support and protect minefields.
- **[air]** `B-d2-3-048` — Launch F-16 squadron to counter Red MiG-29s and maintain air superiority.
    - *why:* Achieving air superiority is critical to protect ground forces and disrupt Red's landing operations.
    - *intended effect:* Deny Red air superiority and protect Blue forces on the ground.
- **[mines]** `B-d1-4-035` — Held position — coastal radars suppressed, preserving minefield integrity.
    - *why:* Preserving minefield integrity is crucial while coastal radars are suppressed. *(refs: Doctrines.md — Blue's 400 sea mines + assumed beach minefields/obstacle belts are the centerpiece of defense.)*
    - *intended effect:* Maintain minefield effectiveness against Red naval movements.
- **[usv_uav]** `B-d2-12-059` — Launch UAVs to intercept and disrupt Red kamikaze UAVs.
    - *why:* Intercepting UAVs prevents them from overwhelming Blue's air defense systems.
    - *intended effect:* Reduce effectiveness of Red's UAV attack on Blue's air defenses.
- **[sof]** `B-d1-506-025` — Deploy chemical defense battalion to counter Red SOF disruption attempts.
    - *why:* Countering SOF attempts to disrupt C2 is essential to maintain operational effectiveness.
    - *intended effect:* Prevent disruption of Blue's command and control systems.
- **[land]** `B-d1-51-001` — Engage Red 4-MID landing forces with mechanized infantry to prevent beachhead establishment.
    - *why:* Engaging landing forces early prevents Red from establishing a foothold. *(refs: Doctrines.md — Engagement areas, battle positions, obstacle plan tied to fires plan.)*
    - *intended effect:* Disrupt and delay Red's landing operations.
- **[ew]** `B-d1-505-022` — Conduct counter-jamming operations to restore C2 effectiveness.
    - *why:* Restoring C2 is critical to maintain operational effectiveness against Red's jamming.
    - *intended effect:* Mitigate effects of Red's jamming on Blue's operations.


**Combined effect.** Red's initial beach assault faced significant resistance. Blue's mechanized infantry engaged Red's 4-MID, preventing a secure foothold. Red's MiG-29s were countered by Blue's F-16s, maintaining Blue's air superiority. Red's kamikaze UAVs were largely intercepted by Blue's UAVs, reducing their impact. Red's destroyers faced effective counteraction from Blue's corvettes, limiting naval gunfire support. The minefields remained a formidable obstacle, with Red's mine layers unable to establish effective defensive fields.


**Adjudicator advantage call.** **BLUE_ADV** — Force ratio 0.25:1 < 1.5:1 per FM 3-90 — Red approaching culmination.


**Unit-by-unit outcomes:**

| Unit (UID) | Status | Damage | Cause | Doctrine |
|:-----------|:-------|------:|:------|:---------|
| `R-d3-11-049` | damaged_partial | 30% | B-d2-3-048 — F-16 squadron countered MiG-29s, maintaining air superiority | Cyprus 1974: Airborne drop loss (alert defender) 5-8% |
| `R-d3-16-067` | expended | 60% | B-d2-12-059 — Kamikaze UAVs intercepted by Blue UAVs | Black Sea 2024 USV survival 25-30% |
| `R-d3-10-030` | damaged_partial | 20% | B-d1-8-031 — Destroyers engaged by Blue corvettes | Falklands P(hit)=0.5, P(kill|hit)=0.4 frigate |
| `R-d2-4-004` | suppressed | 40% | B-d1-51-001 — Mechanized infantry engaged Red landing forces | Doctrines.md — Engagement areas, battle positions |
| `R-d3-10-034` | suppressed | 50% | B-d1-4-035 — Mine layers unable to establish defensive fields | Wonsan 1950 50% MCM attrition |
| `B-d2-3-048` | damaged_partial | 10% | R-d3-11-049 — MiG-29s engaged F-16s | Cyprus 1974: Airborne drop loss (alert defender) 5-8% |
| `B-d2-12-059` | damaged_partial | 20% | R-d3-16-067 — Intercepted kamikaze UAVs | Black Sea 2024 USV survival 25-30% |
| `B-d1-8-031` | damaged_partial | 20% | R-d3-10-030 — Corvettes engaged by Red destroyers | Falklands P(hit)=0.5, P(kill|hit)=0.4 frigate |
| `B-d1-51-001` | damaged_partial | 30% | R-d2-4-004 — Engaged Red landing forces | Doctrines.md — Engagement areas, battle positions |
| `B-d1-4-035` | unchanged | 0% | R-d3-10-034 — Minefield integrity preserved | Wonsan 1950 50% MCM attrition |


**State after this phase.** Red alive 82 / Blue alive 89. Red power total 149.49 / Blue power total 106.68. Mines remaining 220. Cum losses to date: Red 26, Blue 26.


## Phase 7 — D+6h — المرحلة 2أ - الموجة الرئيسية للفرقة 4

*Kind:* `main_wave` &nbsp; *Phase line:* 6.0 km from coast


**Scene.** At D+6h, Red's main amphibious wave is struggling to advance past the 6.0 km phase line due to overwhelming Blue defensive firepower and remaining sea mines. Both sides are experiencing equal electronic warfare intensity, but Red's forces are nearing culmination with a local force ratio of 0.26:1, indicating a challenging operational posture.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.26:1 / 1.4:1**
- Engine call: **BLUE_ADV** — force ratio 0.26:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.70 / Blue 0.70
- Sea mines remaining: 220


**Red intent.** The main wave aims to secure and expand the beachhead, disrupting Blue's defenses through coordinated air, land, and SOF operations. By maintaining pressure on Blue's C2 and utilizing saturation tactics, Red seeks to exploit gaps and establish a foothold for further inland operations towards Objective X.


**Red actions (per component):**

- **[strategic]** `R-d0-500-077` — Held in reserve — preserving SSM magazine for H-hour saturation salvo per opening-day concentration doctrine.
    - *why:* Strategic SSMs are preserved for decisive engagement moments to maximize impact. *(refs: AJP-3.1 Ed B, FM 3-09 §3-15)*
    - *intended effect:* Ensure maximum SSM availability for a critical saturation strike.
- **[maritime]** `R-d3-60-028` — Deploy remaining landing ships to reinforce beachhead and increase throughput.
    - *why:* Increase mass at the decisive point by reinforcing the beachhead with additional troops and equipment. *(refs: Doctrines.md §4, Doctrines.md §5)*
    - *intended effect:* Secure and expand the beachhead to facilitate further inland operations.
- **[air]** `R-d3-12-008` — Launch attack helicopters to provide close air support for landing forces.
    - *why:* Enhance operational tempo by providing direct support to ground forces, exploiting gaps in Blue's defense. *(refs: Doctrines.md §2, AJP-3.1 Ed B)*
    - *intended effect:* Suppress Blue's defensive positions and support Red's ground maneuver.
- **[mines]** `R-d3-9-044` — Deploy mine layers to create defensive minefields around the beachhead.
    - *why:* Protect the landing area from Blue's naval counterattacks by establishing a minefield barrier. *(refs: WarReferences.md §1)*
    - *intended effect:* Deter and disrupt Blue's naval forces from approaching the beachhead.
- **[usv_uav]** `R-d3-16-063` — Launch kamikaze UAVs to target Blue's coastal radar installations.
    - *why:* Disrupt Blue's maritime situational awareness and targeting capabilities. *(refs: AJP-3.1 Ed B, FM 3-09 §3-15)*
    - *intended effect:* Reduce Blue's ability to detect and target Red's naval and landing operations.
- **[sof]** `R-d2-214-076` — Conduct SOF raids on Blue's C2 nodes inland.
    - *why:* Disrupt Blue's command and control to degrade their operational coordination. *(refs: WarReferences.md §3)*
    - *intended effect:* Create confusion and delay in Blue's response to Red's main wave.
- **[land]** `R-d2-4-004` — Advance inland from the beachhead to secure key terrain.
    - *why:* Exploit operational tempo to gain control of strategic positions before Blue can reinforce. *(refs: Doctrines.md §5)*
    - *intended effect:* Establish a robust foothold for further operations towards Objective X.
- **[ew]** `R-d3-405-014` — Continue persistent jamming of Blue's communications.
    - *why:* Maintain pressure on Blue's C2 to prevent effective coordination and response. *(refs: FM 3-09 §3-15)*
    - *intended effect:* Sustain disruption of Blue's operational effectiveness.


**Blue intent.** Hold-and-attrit posture to force Red culmination. Preserve key assets and reserves for decisive engagement. Utilize layered defenses and countermeasures to degrade Red's offensive capabilities.


**Blue reactions (per component):**

- **[strategic]** `B-d0-99-000` — Held position — preserving strategic strike capability for Red culmination per ADP 3-0.
    - *why:* Strategic strikes are held to maximize impact during Red's culmination phase. *(refs: ADP 3-0)*
    - *intended effect:* Ensure strategic strike assets are available for decisive engagement.
- **[maritime]** `B-d1-8-031` — Deploy corvettes to interdict Red landing ships and protect minefields.
    - *why:* Interdicting Red's reinforcement efforts aligns with maintaining control over the beachhead and exploiting remaining sea mines. *(refs: Doctrines.md [1])*
    - *intended effect:* Disrupt Red's reinforcement and maintain integrity of minefields.
- **[air]** `B-d2-3-048` — Launch F-16 squadron to counter Red attack helicopters providing CAS.
    - *why:* Neutralizing Red's air support is crucial to maintaining the effectiveness of our ground defenses. *(refs: ATP 3-01.8 Combined Arms for Air Defense)*
    - *intended effect:* Reduce Red's air support effectiveness and protect ground forces.
- **[mines]** `B-d1-400-045` — Monitor and adjust minefields to counter Red's defensive mining efforts.
    - *why:* Maintaining the effectiveness of our minefields is critical to disrupting Red's landing operations. *(refs: Doctrines.md [1])*
    - *intended effect:* Prevent Red from establishing secure beachhead defenses.
- **[usv_uav]** `B-d2-5-057` — Deploy F-16s to intercept kamikaze UAVs targeting coastal radar installations.
    - *why:* Protecting radar installations is essential for maintaining situational awareness and air defense capabilities. *(refs: ATP 3-01.81 C-UAS)*
    - *intended effect:* Preserve radar functionality and prevent degradation of air defense network.
- **[sof]** `B-d1-504-021` — Enhance security around C2 nodes to counter Red SOF raids.
    - *why:* Protecting C2 infrastructure is vital for maintaining command and control. *(refs: Doctrines.md [2])*
    - *intended effect:* Prevent disruption of command and control capabilities.
- **[land]** `B-d1-51-001` — Hold position — reinforcing defensive positions to absorb Red's inland advance.
    - *why:* Holding prepared positions maximizes defensive advantage and forces Red into costly engagements. *(refs: Doctrines.md [3])*
    - *intended effect:* Attrit Red forces and delay their inland advance.
- **[ew]** `B-d1-505-022` — Conduct counter-jamming operations to mitigate Red's persistent jamming.
    - *why:* Maintaining communication integrity is crucial for coordinated defense. *(refs: ATP 3-01.7 ADA Brigade Techniques)*
    - *intended effect:* Restore communication capabilities and enhance operational coordination.


**Combined effect.** Red's main wave faced significant challenges as Blue's layered defenses held firm. Red's landing ships were heavily interdicted by Blue's corvettes, and minefields inflicted losses on Red's naval assets. Red's attack helicopters faced strong resistance from Blue's F-16s, limiting their effectiveness in providing close air support. Red's kamikaze UAVs were largely intercepted, preserving Blue's radar installations. Despite Red's efforts to disrupt Blue's C2 with SOF raids and jamming, Blue maintained operational coordination. Force ratio 0.26:1 < 1.5:1 per FM 3-90 — BLUE_ADV holds as Red approaches culmination.


**Adjudicator advantage call.** **BLUE_ADV** — Force ratio 0.26:1 < 1.5:1 per FM 3-90 — Red approaching culmination.


**Unit-by-unit outcomes:**

| Unit (UID) | Status | Damage | Cause | Doctrine |
|:-----------|:-------|------:|:------|:---------|
| `R-d3-60-028` | damaged_partial | 30% | B-d1-8-031 — Corvette interdiction of landing ships | Doctrines.md [1]: Interdiction of reinforcement efforts |
| `R-d3-12-008` | damaged_partial | 25% | B-d2-3-048 — F-16 squadron countering attack helicopters | ATP 3-01.8: Combined Arms for Air Defense |
| `R-d3-16-063` | expended | 70% | B-d2-5-057 — F-16s intercepting kamikaze UAVs | ATP 3-01.81 C-UAS: UAV interception |
| `R-d2-214-076` | suppressed | 30% | B-d1-504-021 — Enhanced security around C2 nodes | Doctrines.md [2]: Protection of C2 infrastructure |
| `R-d3-405-014` | suppressed | 20% | B-d1-505-022 — Counter-jamming operations | ATP 3-01.7: ADA Brigade Techniques |
| `B-d1-8-031` | damaged_partial | 20% | R-d3-60-028 — Landing ship engagement | Doctrines.md [1]: Engagement with landing ships |
| `B-d2-3-048` | damaged_partial | 15% | R-d3-12-008 — Attack helicopter engagement | ATP 3-01.8: Combined Arms for Air Defense |
| `B-d2-5-057` | damaged_partial | 10% | R-d3-16-063 — Kamikaze UAV engagement | ATP 3-01.81 C-UAS: UAV interception |
| `B-d1-504-021` | suppressed | 10% | R-d2-214-076 — SOF raid on C2 nodes | Doctrines.md [2]: Protection of C2 infrastructure |
| `B-d1-505-022` | suppressed | 10% | R-d3-405-014 — Persistent jamming | ATP 3-01.7: ADA Brigade Techniques |


**State after this phase.** Red alive 82 / Blue alive 89. Red power total 148.12 / Blue power total 105.61. Mines remaining 190. Cum losses to date: Red 31, Blue 31.


## Phase 8 — D+12h — تكوين رأس الجسر

*Kind:* `beachhead_consolidation` &nbsp; *Phase line:* 8.5 km from coast


**Scene.** At D+12h, Red forces are attempting to consolidate their beachhead but are facing significant resistance from Blue's well-prepared defenses. Despite Red's operational power advantage, their local combat power is insufficient to break through, and they are nearing culmination under intense Blue pressure.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.26:1 / 1.4:1**
- Engine call: **BLUE_ADV** — force ratio 0.26:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.70 / Blue 0.70
- Sea mines remaining: 190


**Red intent.** Consolidate the beachhead by reinforcing our position and preparing for further inland advances. Utilize air superiority to support ground forces and disrupt Blue's defensive capabilities. Preserve strategic assets for future decisive engagements.


**Red actions (per component):**

- **[strategic]** `R-d0-500-077` — Held in reserve — preserving SSM magazine for future saturation strikes per operational tempo doctrine.
    - *why:* Maintaining strategic strike capability for decisive phases where saturation can achieve maximum disruption. *(refs: Operational tempo over methodical advance)*
    - *intended effect:* Ensure availability of SSMs for critical future operations.
- **[maritime]** `R-d3-10-030` — Deploy destroyers to provide naval gunfire support and protect landing operations from Blue's corvette interdictions.
    - *why:* Ensure safe passage for landing forces and counter Blue's naval threats to maintain momentum. *(refs: Mass at the decisive point)*
    - *intended effect:* Secure landing operations and suppress Blue's naval interdiction efforts.
- **[air]** `R-d3-12-008` — Launch attack helicopters to provide close air support for ground forces consolidating the beachhead.
    - *why:* Enhance ground force effectiveness by disrupting Blue's defensive positions and supporting maneuver. *(refs: Vertical envelopment)*
    - *intended effect:* Reduce Blue's defensive capability and support ground force consolidation.
- **[mines]** `R-d3-403-012` — Deploy engineering units to clear minefields obstructing the inland advance.
    - *why:* Facilitate maneuver by breaching Blue's mine and obstacle belts. *(refs: Combined-arms mobility)*
    - *intended effect:* Create safe lanes for ground forces to advance inland.
- **[usv_uav]** `R-d3-16-063` — Launch kamikaze UAVs to target Blue's coastal radar installations.
    - *why:* Degrade Blue's surveillance and targeting capabilities to protect Red forces. *(refs: Saturation strikes)*
    - *intended effect:* Blind Blue's coastal defenses and enhance Red's operational freedom.
- **[sof]** `R-d1-21-073` — Conduct special reconnaissance to identify Blue's reserve positions and C2 nodes.
    - *why:* Gather intelligence to exploit gaps and disrupt Blue's command structure. *(refs: Vertical envelopment)*
    - *intended effect:* Locate and exploit weaknesses in Blue's defensive setup.
- **[land]** `R-d2-4-004` — Mechanized infantry to consolidate and expand the beachhead, preparing for further inland operations.
    - *why:* Strengthen the foothold and prepare for subsequent advances towards OBJ-X. *(refs: Operational tempo over methodical advance)*
    - *intended effect:* Secure a robust beachhead and prepare for inland offensive.
- **[ew]** `R-d3-405-014` — Continue jamming operations to disrupt Blue's C2 and communication networks.
    - *why:* Maintain pressure on Blue's command and control to limit their coordination and response. *(refs: EW persistent throughout)*
    - *intended effect:* Reduce Blue's operational effectiveness and response capability.


**Blue intent.** Hold-and-attrit strategy to force Red culmination. Preserve reserves for decisive counterattack once Red is operationally exposed. Engage Red's mine clearance and air operations to maintain defensive depth and integrity.


**Blue reactions (per component):**

- **[maritime]** `B-d1-8-031` — Deploy corvettes to interdict Red destroyers providing naval gunfire support.
    - *why:* Prevent Red from effectively supporting their beachhead consolidation with naval firepower, leveraging our local maritime advantage. *(refs: Doctrines.md — Application: Blue is in area defense at coast)*
    - *intended effect:* Disrupt Red's naval support, reducing pressure on coastal defenses.
- **[air]** `B-d2-3-048` — Launch fighter aircraft to intercept Red attack helicopters providing close air support.
    - *why:* Maintain air superiority and prevent Red from effectively supporting their ground forces. *(refs: Doctrines.md — Application: This is an LSCO scenario. Blue defends in depth)*
    - *intended effect:* Neutralize Red's air support, maintaining the integrity of our defensive positions.
- **[mines]** `B-d1-503-020` — Deploy engineering units to reinforce minefields and counter Red's mine clearance efforts.
    - *why:* Preserve the effectiveness of our minefields as a critical defensive measure against Red's inland advance. *(refs: Doctrines.md — Application: Blue is in area defense at coast)*
    - *intended effect:* Delay Red's advance, forcing them to expend more resources on mine clearance.
- **[usv_uav]** `B-d1-4-035` — Activate remaining coastal radar systems to detect and track incoming kamikaze UAVs.
    - *why:* Mitigate the impact of Red's UAV strike on our radar installations, preserving situational awareness. *(refs: Doctrines.md — Application: Blue defends in depth)*
    - *intended effect:* Minimize damage to radar systems, maintaining operational C2 capabilities.
- **[land]** `B-d1-51-001` — Hold position — preserving combat power for Red culmination per ADP 3-0.
    - *why:* Avoid premature engagement, allowing Red to reach culmination point before counterattack. *(refs: Doctrines.md — Application: Culmination of Red triggers committed counterattack)*
    - *intended effect:* Preserve strength for decisive engagement at the right moment.
- **[ew]** `B-d1-505-022` — Conduct counter-jamming operations to restore C2 and communication networks.
    - *why:* Ensure effective communication and coordination across Blue forces despite Red's jamming efforts. *(refs: Doctrines.md — Application: Blue defends in depth)*
    - *intended effect:* Maintain operational effectiveness by countering Red's electronic warfare.


**Combined effect.** Red's attempt to consolidate the beachhead was met with strong Blue resistance. Red destroyers providing naval gunfire support were partially neutralized by Blue corvettes, while Red's attack helicopters faced significant losses from Blue fighter intercepts. Red's mine clearance efforts were severely hampered by Blue's reinforced minefields, and kamikaze UAVs targeting Blue's radar installations achieved limited success due to active Blue countermeasures. Overall, Red's operational momentum was blunted, with Blue maintaining a defensive advantage.


**Adjudicator advantage call.** **BLUE_ADV** — Force ratio 0.26:1 < 1.5:1 per FM 3-90 — Red approaching culmination


**Unit-by-unit outcomes:**

| Unit (UID) | Status | Damage | Cause | Doctrine |
|:-----------|:-------|------:|:------|:---------|
| `R-d3-10-030` | damaged_partial | 30% | B-d1-8-031 — Corvette interdiction of destroyers providing naval gunfire support | Doctrines.md — Blue is in area defense at coast |
| `R-d3-12-008` | damaged_partial | 40% | B-d2-3-048 — Fighter aircraft intercept of attack helicopters | Doctrines.md — LSCO scenario, Blue defends in depth |
| `R-d3-403-012` | suppressed | 50% | B-d1-503-020 — Reinforced minefields counter mine clearance | Wonsan 1950: 50% MCM attrition under coastal artillery overwatch |
| `R-d3-16-063` | expended | 70% | B-d1-4-035 — Kamikaze UAVs targeting coastal radar installations | Black Sea 2024 USV survival 25-30% |
| `B-d1-8-031` | damaged_partial | 20% | R-d3-10-030 — Naval gunfire support from destroyers | Iwo Jima: Pre-landing bombardment effect vs dug-in defender |
| `B-d2-3-048` | damaged_partial | 10% | R-d3-12-008 — Attack helicopters providing close air support | Vertical envelopment |
| `B-d1-503-020` | suppressed | 30% | R-d3-403-012 — Mine clearance operations | Wonsan 1950: Mine clearance days (per 100 mines, 4 sweepers) |
| `B-d1-4-035` | damaged_partial | 40% | R-d3-16-063 — Kamikaze UAV strike on radar installations | Black Sea 2024 USV survival 25-30% |


**State after this phase.** Red alive 82 / Blue alive 89. Red power total 146.43 / Blue power total 104.83. Mines remaining 160. Cum losses to date: Red 35, Blue 35.


## Phase 9 — D+24h — الهجوم الأزرق المضاد الأول (لواء 72 المدرع)

*Kind:* `first_counterattack` &nbsp; *Phase line:* 9.5 km from coast


**Scene.** At D+24h, Blue's 72nd Armored Brigade launched a counterattack against Red's forces, which were nearing culmination. Despite Red's initial foothold, Blue's superior local combat power and effective use of electronic warfare have allowed them to regain momentum near the phase line, 9.5 km from the coast.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.26:1 / 1.4:1**
- Engine call: **BLUE_ADV** — force ratio 0.26:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.70 / Blue 0.70
- Sea mines remaining: 160


**Red intent.** The intent is to stabilize the beachhead by delaying Blue's counterattack and maintaining pressure on their defenses. By leveraging naval and air support, along with SOF disruptions and EW operations, we aim to degrade Blue's ability to coordinate and execute their counterattack effectively.


**Red actions (per component):**

- **[strategic]** `R-d0-500-077` — Held in reserve — preserving SSM magazine for H-hour saturation salvo per opening-day concentration doctrine.
    - *why:* To maintain strategic strike capability for future decisive phases. *(refs: Doctrines.md §4)*
    - *intended effect:* Ensure availability of SSMs for critical saturation strikes later.
- **[maritime]** `R-d3-10-030` — Deploy destroyers to provide naval gunfire support and protect landing craft from Blue's interdiction efforts.
    - *why:* To support the amphibious assault and ensure safe passage for landing forces. *(refs: Doctrines.md §5)*
    - *intended effect:* Suppress Blue's coastal defenses and enable successful landing of ground forces.
- **[air]** `R-d3-11-049` — Launch MiG-29 squadron to counter Blue's air superiority efforts and provide air cover for naval operations.
    - *why:* To maintain air superiority and protect naval assets during the landing phase. *(refs: Doctrines.md §5)*
    - *intended effect:* Deny Blue air superiority and safeguard Red naval operations.
- **[usv_uav]** `R-d3-16-056` — Deploy kamikaze UAVs to target Blue's coastal radar installations.
    - *why:* To disrupt Blue's detection capabilities and support Red's naval and air operations. *(refs: Doctrines.md §5)*
    - *intended effect:* Blind Blue's coastal radar to reduce threat to Red's forces.
- **[sof]** `R-d1-21-073` — Conduct SOF raids on Blue's rear-area C2 nodes.
    - *why:* To disrupt Blue's command and control and create chaos in their rear areas. *(refs: Doctrines.md §1)*
    - *intended effect:* Degrade Blue's C2 effectiveness and delay their counterattack coordination.
- **[land]** `R-d2-4-004` — Engage Blue's 72nd Armored Brigade with mechanized infantry to delay their counterattack.
    - *why:* To prevent Blue from exploiting Red's culmination and maintain pressure on Blue's defenses. *(refs: Doctrines.md §2)*
    - *intended effect:* Delay Blue's counterattack and stabilize Red's beachhead.
- **[ew]** `R-d3-405-014` — Conduct persistent jamming operations against Blue's C2 networks.
    - *why:* To maintain electronic warfare pressure and disrupt Blue's communication. *(refs: Doctrines.md §1)*
    - *intended effect:* Reduce Blue's C2 effectiveness and coordination.


**Blue intent.** Execute a mobile defense, leveraging the 72nd Armored Brigade to counter Red's mechanized infantry at the 9.5 km phase line. Preserve air and naval assets for future engagements, while countering Red's air and electronic warfare efforts.


**Blue reactions (per component):**

- **[maritime]** `B-d1-8-031` — Held position — preserving naval assets in port to avoid engagement with Red destroyers, per doctrine of economy of force.
    - *why:* Red's destroyers are providing naval gunfire support. Engaging them directly would risk unnecessary losses without decisive gain. *(refs: Doctrines.md — Application: Blue is in area defense at coast + mobile defense in depth with reserves.)*
    - *intended effect:* Preserve naval strength for future operations when Red's naval forces are more vulnerable.
- **[air]** `B-d2-3-048` — Launch F-16 squadron to intercept Red's MiG-29s and maintain air superiority over the AOI.
    - *why:* Counter Red's air cover efforts to protect naval operations, ensuring Blue's air superiority is maintained. *(refs: Doctrines.md — Tenet: Air component supports maritime component through anti-submarine, anti-surface, ISR, fleet AD.)*
    - *intended effect:* Deny Red air superiority, protect Blue ground and naval forces from air threats.
- **[usv_uav]** `B-d1-501-014` — Deploy UAVs to detect and disrupt Red's kamikaze UAVs targeting coastal radar installations.
    - *why:* Protect critical radar installations from UAV attacks to maintain situational awareness and targeting capabilities. *(refs: Doctrines.md — Tenet: Six air-power roles: counter-air, counter-land, counter-sea, strategic attack, ISR, contribution to JIPOE.)*
    - *intended effect:* Neutralize Red's UAV threat, preserving Blue's radar capabilities.
- **[land]** `B-d2-514-004` — Engage Red's mechanized infantry with 72nd Armored Brigade at the 9.5 km phase line.
    - *why:* Counterattack Red's forces as they approach culmination, exploiting the prepared defense advantage. *(refs: Doctrines.md — Tenet: Defense types: area defense, mobile defense, retrograde.)*
    - *intended effect:* Halt Red's advance, inflict significant casualties, and force a retreat.
- **[ew]** `B-d1-505-022` — Conduct electronic countermeasures to disrupt Red's jamming operations against Blue's C2 networks.
    - *why:* Maintain effective communication and coordination across Blue forces despite Red's jamming efforts. *(refs: Doctrines.md — Tenet: Engagement areas, battle positions, obstacle plan tied to fires plan.)*
    - *intended effect:* Ensure continuous command and control capabilities for Blue operations.


**Combined effect.** Blue's 72nd Armored Brigade executed a counterattack at the 9.5 km phase line, exploiting Red's culmination. Red's mechanized infantry was delayed, suffering significant attrition under Blue's prepared defense. Red's MiG-29s were intercepted by Blue's F-16s, resulting in airframe losses. Red's kamikaze UAVs were largely neutralized by Blue's UAVs, preserving Blue's radar installations. Red's naval gunfire support was ineffective against Blue's entrenched positions.


**Adjudicator advantage call.** **BLUE_ADV** — Force ratio 0.26:1 < 1.5:1 per Doctrines.md — Red approaching culmination.


**Unit-by-unit outcomes:**

| Unit (UID) | Status | Damage | Cause | Doctrine |
|:-----------|:-------|------:|:------|:---------|
| `R-d2-4-004` | damaged_partial | 40% | B-d2-514-004 — Engaged by Blue's 72nd Armored Brigade at prepared defense line | Prepared-defense × 1.5 multiplier per Doctrines.md |
| `R-d3-11-049` | damaged_partial | 20% | B-d2-3-048 — Intercepted by Blue's F-16 squadron | Air superiority engagement per Doctrines.md |
| `R-d3-16-056` | expended | 70% | B-d1-501-014 — Neutralized by Blue's UAVs protecting radar installations | Counter-UAV operations per Doctrines.md |
| `R-d3-10-030` | unchanged | 0% | B-d1-8-031 — Ineffective naval gunfire support against entrenched positions | Poor bombardment effectiveness per WarReferences.md |
| `B-d2-514-004` | suppressed | 20% | R-d2-4-004 — Engaged by Red's mechanized infantry | Mechanized engagement per Doctrines.md |
| `B-d2-3-048` | expended | 30% | R-d3-11-049 — Sorties flown to intercept Red's MiG-29s | Air superiority engagement per Doctrines.md |
| `B-d1-501-014` | expended | 50% | R-d3-16-056 — UAVs deployed to counter Red's kamikaze UAVs | Counter-UAV operations per Doctrines.md |
| `B-d1-505-022` | suppressed | 20% | R-d3-405-014 — Jamming operations against Blue's C2 networks | EW operations per Doctrines.md |


**State after this phase.** Red alive 82 / Blue alive 89. Red power total 145.51 / Blue power total 104.53. Mines remaining 160. Cum losses to date: Red 39, Blue 39.


## Phase 10 — D+36h — الفرقة 9 تلتحق - دفع 8-10 كم

*Kind:* `9mid_lands` &nbsp; *Phase line:* 14.0 km from coast


**Scene.** At D+36h, Red's 9th Division continues its advance, pushing 8-10 km inland from the coast. Despite maintaining pressure, Red's forces are nearing culmination, with Blue maintaining a slight defensive edge due to balanced combat power and effective use of remaining sea mines.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.99:1 / 1.39:1**
- Engine call: **BLUE_ADV** — force ratio 0.99:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.70 / Blue 0.70
- Sea mines remaining: 160


**Red intent.** Phase 10 focuses on reinforcing and expanding the beachhead by landing the 9th Mechanized Infantry Division. We will use air and naval assets to support the landing and maintain pressure on Blue's defenses, while holding strategic assets in reserve for future decisive actions.


**Red actions (per component):**

- **[strategic]** `R-d0-500-077` — Held in reserve — preserving SSM magazine for H-hour saturation salvo per opening-day concentration doctrine.
    - *why:* Strategic missiles are reserved to maintain pressure during a critical moment when Blue's defenses are overwhelmed. *(refs: Doctrines.md §5)*
    - *intended effect:* Ensure readiness for a decisive saturation strike when Blue's defenses are at their weakest.
- **[maritime]** `R-d3-60-028` — Deploy landing ships to deliver 9-MID to the beachhead, supported by hovercraft for rapid offload.
    - *why:* Utilizing naval assets to reinforce the beachhead aligns with amphibious doctrine, ensuring rapid deployment of forces. *(refs: Doctrines.md §1)*
    - *intended effect:* Successfully land the 9th Mechanized Infantry Division to bolster the beachhead and increase combat power.
- **[air]** `R-d3-12-008` — Launch attack helicopters to provide close air support for 9-MID landing operations.
    - *why:* Air support is crucial to suppress Blue's defensive positions and facilitate the safe landing of ground forces. *(refs: Doctrines.md §4)*
    - *intended effect:* Disrupt Blue's defensive positions and enable a successful landing of 9-MID.
- **[usv_uav]** `R-d3-16-067` — Deploy kamikaze UAVs to target Blue's coastal radar installations.
    - *why:* Neutralizing radar installations will reduce Blue's ability to detect and respond to our landing operations. *(refs: WarReferences.md)*
    - *intended effect:* Degrade Blue's situational awareness and defensive coordination.
- **[sof]** `R-d1-21-073` — Conduct raids on Blue's rear-area C2 nodes to disrupt command and control.
    - *why:* Disrupting Blue's C2 aligns with vertical envelopment doctrine, creating chaos in their rear areas. *(refs: Doctrines.md §5)*
    - *intended effect:* Disrupt Blue's command and control, reducing their operational effectiveness.
- **[land]** `R-d2-9-017` — Advance 9-MID from the beachhead to the 14 km phase line.
    - *why:* Maintaining operational tempo is crucial to exploit gaps and prevent Blue from consolidating their defenses. *(refs: Doctrines.md §4)*
    - *intended effect:* Secure the 14 km phase line and prepare for further inland operations.
- **[ew]** `R-d3-405-014` — Continue electronic jamming to disrupt Blue's communications and radar.
    - *why:* Persistent EW operations will degrade Blue's ability to coordinate and respond effectively. *(refs: Doctrines.md §5)*
    - *intended effect:* Maintain a degraded state of Blue's C2 capabilities.


**Blue intent.** Hold-and-attrit posture to force Red culmination. Preserve reserves for decisive engagement at Red's operational culmination point. Engage Red's maritime and air threats while maintaining layered defense.


**Blue reactions (per component):**

- **[maritime]** `B-d1-4-035` — Deploy coastal radar systems to monitor and target Red's landing ships and hovercraft.
    - *why:* Utilize coastal surveillance to engage Red's maritime forces, leveraging coastal artillery and missile systems. *(refs: Doctrines.md - Coastal defense uses CDCM (coastal-defense cruise missiles), coastal artillery, surveillance, and naval forces in concert.)*
    - *intended effect:* Disrupt and delay Red's landing operations, reducing their effectiveness.
- **[air]** `B-d2-3-048` — Launch fighter aircraft to intercept and engage Red's attack helicopters providing close air support.
    - *why:* Deny Red air superiority and protect ground forces from aerial threats. *(refs: Doctrines.md - Air defense planning at brigade and below. Active and passive measures.)*
    - *intended effect:* Neutralize Red's air support, reducing their effectiveness in supporting 9-MID.
- **[usv_uav]** `B-d1-501-014` — Deploy ISR UAVs to detect and track kamikaze UAVs targeting coastal radar installations.
    - *why:* Enhance situational awareness and provide targeting data for air defense units. *(refs: Doctrines.md - Combined arms bn (mech + armor + supports) is the lowest level for full combined-arms maneuver.)*
    - *intended effect:* Intercept and neutralize kamikaze UAVs before they reach coastal radar sites.
- **[land]** `B-d1-51-001` — Hold position — preserving combat power to counter Red's advance at culmination.
    - *why:* Maintain defensive positions to absorb Red's initial push and prepare for counterattack. *(refs: Doctrines.md - Engagement areas, battle positions, obstacle plan tied to fires plan.)*
    - *intended effect:* Force Red to expend resources and reach culmination without achieving objectives.
- **[ew]** `B-d1-505-022` — Conduct electronic countermeasures to disrupt Red's jamming efforts.
    - *why:* Preserve communication and radar capabilities to maintain operational effectiveness. *(refs: Doctrines.md - Air defense planning at brigade and below. Active and passive measures.)*
    - *intended effect:* Reduce the impact of Red's electronic warfare on Blue's command and control.


**Combined effect.** Red's attempt to reinforce the beachhead with the 9th Mechanized Infantry Division faced significant challenges. Blue's coastal defenses, supported by fighter aircraft, effectively intercepted Red's attack helicopters, reducing their impact. Red's kamikaze UAVs managed to degrade some of Blue's coastal radar capabilities, but Blue's ISR UAVs mitigated the damage. Red's electronic warfare efforts were countered by Blue's ECM, maintaining Blue's C2 integrity. The minefield continued to pose a threat, delaying Red's maritime operations.


**Adjudicator advantage call.** **BLUE_ADV** — Force ratio 0.99:1 < 1.5:1 per FM 3-90 — Red approaching culmination


**Unit-by-unit outcomes:**

| Unit (UID) | Status | Damage | Cause | Doctrine |
|:-----------|:-------|------:|:------|:---------|
| `R-d3-12-008` | damaged_partial | 20% | B-d2-3-048 — Fighter aircraft intercept attack helicopters | Air defense planning at brigade and below; active and passive measures |
| `R-d3-16-067` | expended | 30% | B-d1-501-014 — Kamikaze UAVs targeting coastal radar installations | Black Sea 2024 USV survival 25-30% |
| `B-d1-4-035` | damaged_partial | 30% | R-d3-16-067 — Kamikaze UAVs degrade coastal radar | Black Sea 2024 USV survival 25-30% |
| `R-d3-60-028` | delayed | 10% | B-d1-4-035 — Coastal artillery and missile systems delay landing ships | Coastal defense uses CDCM, coastal artillery, surveillance |
| `R-d3-405-014` | suppressed | 20% | B-d1-505-022 — Electronic countermeasures disrupt jamming efforts | Air defense planning at brigade and below; active and passive measures |
| `B-d1-51-001` | unchanged | 0% | R-d2-9-017 — 9-MID advance met with prepared defenses | Engagement areas, battle positions, obstacle plan tied to fires plan |


**State after this phase.** Red alive 82 / Blue alive 89. Red power total 145.12 / Blue power total 104.4. Mines remaining 160. Cum losses to date: Red 43, Blue 41.


## Phase 11 — D+48h — اندفاع نحو 40-50 كم

*Kind:* `push_inland` &nbsp; *Phase line:* 28.0 km from coast


**Scene.** At D+48h, Red forces continue their push inland towards OBJ-X, encountering stiff resistance from Blue defenders. Both sides maintain equal electronic warfare capabilities, but Red's advance is hindered by approaching culmination and remaining sea mines.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.99:1 / 1.39:1**
- Engine call: **BLUE_ADV** — force ratio 0.99:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.70 / Blue 0.70
- Sea mines remaining: 160


**Red intent.** The intent is to maintain momentum and exploit gaps in Blue's defenses through combined-arms maneuvers and vertical envelopment tactics. By disrupting Blue's C2 and radar capabilities, Red aims to weaken Blue's defensive cohesion and create opportunities for deeper penetration towards Objective X.


**Red actions (per component):**

- **[strategic]** `R-d0-500-077` — Held in reserve — preserving SSM magazine for H-hour saturation salvo per opening-day concentration doctrine.
    - *why:* SSMs are critical for achieving saturation strikes at decisive moments; holding them now allows for a more impactful use later. *(refs: Doctrines.md — Tenet: Amphibious operations have phases)*
    - *intended effect:* Maximize impact of SSMs during a critical future phase.
- **[maritime]** `R-d3-10-030` — Deploy destroyers to provide naval gunfire support to advancing ground forces.
    - *why:* Naval gunfire support is essential for suppressing Blue's coastal defenses and supporting Red's inland push. *(refs: Doctrines.md — Tenet: Combined-arms mobility)*
    - *intended effect:* Suppress Blue's coastal defenses and support Red's inland advance.
- **[air]** `R-d3-14-051` — Launch Mirage strike squadron to conduct air interdiction against Blue's rear echelons.
    - *why:* Disrupting Blue's rear echelons aligns with the doctrine of vertical envelopment and operational tempo. *(refs: Doctrines.md — Tenet: Vertical envelopment)*
    - *intended effect:* Disrupt Blue's C2 and logistics to weaken their frontline resistance.
- **[mines]** `R-d3-404-013` — Deploy engineering battalion to clear mine lanes for advancing mechanized units.
    - *why:* Clearing mine lanes is crucial for maintaining combined-arms mobility and ensuring the momentum of the advance. *(refs: Doctrines.md — Tenet: Combined-arms mobility)*
    - *intended effect:* Enable safe passage for Red's mechanized units through Blue's minefields.
- **[usv_uav]** `R-d3-16-067` — Deploy kamikaze UAVs to target Blue's coastal radar installations.
    - *why:* Neutralizing Blue's radar installations is critical for reducing their situational awareness and air defense capability. *(refs: Doctrines.md — Tenet: Saturation strikes)*
    - *intended effect:* Blind Blue's coastal radar to facilitate Red's air and naval operations.
- **[sof]** `R-d1-21-073` — Conduct SOF insertion to disrupt Blue's rear-area C2 nodes.
    - *why:* Disrupting C2 aligns with the doctrine of vertical envelopment, creating chaos in Blue's command structure. *(refs: Doctrines.md — Tenet: Vertical envelopment)*
    - *intended effect:* Disrupt Blue's command and control to degrade their operational effectiveness.
- **[land]** `R-d2-4-004` — Execute combined-arms maneuver to penetrate Blue's defensive line.
    - *why:* Penetration is a key offensive form to exploit gaps and maintain operational tempo. *(refs: Doctrines.md — Tenet: Combined arms maneuver)*
    - *intended effect:* Break through Blue's defenses to advance towards Objective X.
- **[ew]** `R-d3-405-014` — Conduct continuous jamming operations to degrade Blue's C2 capabilities.
    - *why:* Persistent EW is essential to maintain pressure on Blue's communication and coordination. *(refs: Doctrines.md — Tenet: EW persistent throughout)*
    - *intended effect:* Degrade Blue's C2 to reduce their operational coordination.


**Blue intent.** Hold-and-attrit posture to exploit Red's nearing culmination. Preserve reserves and focus on degrading Red's offensive capabilities through layered defense and counterattacks.


**Blue reactions (per component):**

- **[maritime]** `B-d1-8-031` — Deploy 8 كورفيت to engage Red destroyers providing naval gunfire support.
    - *why:* Counter Red's naval gunfire support to protect ground forces and maintain control of the coastal area. Utilize corvettes to disrupt Red's maritime operations. *(refs: Doctrines.md - Countermobility = terrain reinforcement + obstacle employment to disrupt, fix, turn, or block enemy movement.)*
    - *intended effect:* Reduce Red's naval gunfire effectiveness and protect Blue's coastal defenses.
- **[air]** `B-d2-3-048` — Launch F-16 squadron to intercept Red Mirage strike squadron targeting rear echelons.
    - *why:* Prevent Red's air interdiction from disrupting Blue's rear echelons, maintaining operational integrity and supply lines. *(refs: Doctrines.md - Air defense planning at brigade and below.)*
    - *intended effect:* Neutralize Red's air threat and protect Blue's rear areas.
- **[mines]** `B-d1-3-036` — Deploy mine layers to reinforce minefields in response to Red's clearance efforts.
    - *why:* Maintain the effectiveness of sea mines as a counter-mobility measure to disrupt Red's mechanized advance. *(refs: Doctrines.md - Countermobility = terrain reinforcement + obstacle employment to disrupt, fix, turn, or block enemy movement.)*
    - *intended effect:* Delay Red's advance and inflict attrition on their mechanized units.
- **[usv_uav]** `B-d2-12-059` — Deploy UAV strike squadron to intercept Red's kamikaze UAVs targeting coastal radar installations.
    - *why:* Protect critical radar installations to maintain situational awareness and air defense capabilities. *(refs: ATP 3-01.81 C-UAS (Aug 2023) — FAS)*
    - *intended effect:* Prevent degradation of Blue's radar capabilities and maintain air defense coverage.
- **[land]** `B-d1-54-009` — Hold position — preserving reserve combat power for Red culmination per ADP 3-0.
    - *why:* Maintain defensive posture to exploit Red's culmination and counterattack effectively when Red is operationally exposed. *(refs: Doctrines.md - Defense types: area defense, mobile defense, retrograde.)*
    - *intended effect:* Preserve combat power for decisive counterattack at Red's culmination point.
- **[ew]** `B-d1-505-022` — Conduct electronic countermeasures to disrupt Red's jamming operations.
    - *why:* Protect Blue's C2 capabilities by countering Red's electronic warfare efforts, ensuring effective command and control. *(refs: Doctrines.md - Protection through hardening, dispersal, concealment, deception.)*
    - *intended effect:* Maintain operational command and control despite Red's jamming efforts.


**Combined effect.** Red's attempt to push inland was met with strong Blue resistance. Red's destroyers provided naval gunfire support but were countered by Blue corvettes, resulting in mutual attrition. Red's Mirage strike squadron faced interception by Blue's F-16s, leading to losses on both sides. Red's engineering battalion faced significant delays due to Blue's reinforced minefields, while Red's kamikaze UAVs were largely intercepted by Blue's UAVs, preserving Blue's radar capabilities.


**Adjudicator advantage call.** **BLUE_ADV** — Force ratio 0.99:1 < 1.5:1 per FM 3-90 — Red approaching culmination


**Unit-by-unit outcomes:**

| Unit (UID) | Status | Damage | Cause | Doctrine |
|:-----------|:-------|------:|:------|:---------|
| `R-d3-10-030` | damaged_partial | 30% | B-d1-8-031 — Engaged by Blue corvettes during naval gunfire support | Doctrines.md - Countermobility = terrain reinforcement + obstacle employment |
| `B-d1-8-031` | damaged_partial | 30% | R-d3-10-030 — Engaged by Red destroyers providing naval gunfire support | Doctrines.md — Tenet: Combined-arms mobility |
| `R-d3-14-051` | damaged_partial | 20% | B-d2-3-048 — Intercepted by Blue F-16 squadron | Air defense planning at brigade and below |
| `B-d2-3-048` | damaged_partial | 20% | R-d3-14-051 — Engaged by Red Mirage strike squadron | Doctrines.md — Tenet: Vertical envelopment |
| `R-d3-404-013` | delayed | 50% | B-d1-3-036 — Delayed by reinforced Blue minefields | Wonsan 1950: 50% MCM attrition under coastal artillery overwatch |
| `R-d3-16-067` | expended | 60% | B-d2-12-059 — Intercepted by Blue UAVs while targeting coastal radar | ATP 3-01.81 C-UAS (Aug 2023) — FAS |
| `B-d2-12-059` | damaged_partial | 10% | R-d3-16-067 — Engaged by Red kamikaze UAVs | Doctrines.md — Tenet: Saturation strikes |
| `R-d1-21-073` | suppressed | 10% | B-d1-505-022 — Suppressed by Blue electronic countermeasures | Protection through hardening, dispersal, concealment, deception |
| `R-d2-4-004` | suppressed | 40% | B-d1-54-009 — Suppressed by Blue's defensive posture | Defense types: area defense, mobile defense, retrograde |


**State after this phase.** Red alive 82 / Blue alive 89. Red power total 143.28 / Blue power total 103.5. Mines remaining 130. Cum losses to date: Red 49, Blue 44.


## Phase 12 — D+72h — المرحلة 3 - الفرقة المدرعة 1 تنزل

*Kind:* `1ad_lands` &nbsp; *Phase line:* 50.0 km from coast


**Scene.** At D+72h, Red's 1st Armored Division lands and advances towards OBJ-X, facing stiff resistance from Blue forces. Despite maintaining operational momentum, Red's combat power is nearing culmination as they encounter effective Blue defenses and remaining sea mines.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.98:1 / 1.38:1**
- Engine call: **BLUE_ADV** — force ratio 0.98:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.70 / Blue 0.70
- Sea mines remaining: 130


**Red intent.** The primary goal in this phase is to secure and expand the beachhead by landing the 1st Armored Division. By leveraging combined arms and maintaining operational tempo, we aim to exploit gaps in Blue's defense and achieve a breakthrough towards Objective X. Supporting actions include disrupting Blue's C2 and ISR capabilities to facilitate the landing and subsequent advance.


**Red actions (per component):**

- **[strategic]** `R-d0-500-077` — Held in reserve — preserving SSM magazine for H-hour saturation salvo per opening-day concentration doctrine.
    - *why:* Strategic SSMs are held to ensure maximum impact during critical phases of the operation. *(refs: JP 3-02 amphibious phases, FM 3-90 attacker 3:1)*
    - *intended effect:* Maintain readiness for decisive saturation strikes when needed.
- **[maritime]** `R-d3-60-028` — Deploy landing ships to reinforce beachhead and support 1-AD landing.
    - *why:* Ensure mass at the decisive point by landing heavy armor to exploit gaps in Blue's defense. *(refs: JP 3-02 amphibious phases, AJP-3.1 maritime ops)*
    - *intended effect:* Secure and expand the beachhead for further inland operations.
- **[air]** `R-d3-12-008` — Launch attack helicopters to provide close air support for the landing of 1-AD.
    - *why:* Support ground maneuver by disrupting Blue's defensive positions and enabling the armored division's advance. *(refs: AJP-3.3 air ops, ATP 3-04 aviation)*
    - *intended effect:* Suppress Blue's forward defenses to facilitate the landing and movement of ground forces.
- **[usv_uav]** `R-d3-16-056` — Deploy kamikaze UAVs to target Blue's coastal radar installations.
    - *why:* Neutralize Blue's ISR capabilities to protect Red's landing operations. *(refs: ATP 3-01.81 C-UAS)*
    - *intended effect:* Degrade Blue's situational awareness and targeting capabilities.
- **[sof]** `R-d1-21-073` — Conduct raids on Blue's rear-area C2 nodes to disrupt command and control.
    - *why:* Vertical envelopment to create chaos in Blue's rear areas, hindering their response to the landing. *(refs: JP 3-05 SOF)*
    - *intended effect:* Disrupt Blue's command structure and delay their operational response.
- **[land]** `R-d3-41-005` — Land and advance 1-AD towards Objective X to exploit gaps in Blue's defense.
    - *why:* Exploit operational tempo and mass at the decisive point to achieve a breakthrough. *(refs: FM 3-90 attacker 3:1, JP 3-02 amphibious phases)*
    - *intended effect:* Overwhelm Blue's defenses and secure Objective X.
- **[ew]** `R-d3-405-014` — Continue electronic jamming to disrupt Blue's C2 throughout the operation.
    - *why:* Persistent EW to degrade Blue's communication and coordination capabilities. *(refs: JP 3-02 amphibious phases, ATP 3-01.8 C-AD)*
    - *intended effect:* Maintain pressure on Blue's C2 to support Red's maneuver operations.


**Blue intent.** Maintain a defensive posture while preparing for Red's culmination. Use mobile defense to exploit Red's overextension and preserve reserves for a decisive counterattack.


**Blue reactions (per component):**

- **[maritime]** `B-d1-3-036` — Deploy mine layers to reinforce remaining sea minefields and disrupt Red's landing operations.
    - *why:* Enhance existing obstacles to disrupt and delay Red's amphibious operations, leveraging the doctrinal advantage of obstacle reinforcement. *(refs: Doctrines.md - Obstacle types: existing, reinforcing (mines, wire, antitank ditch). Obstacle effects: disrupt, fix, turn, block.)*
    - *intended effect:* Delay Red's landing operations and increase attrition on their naval assets.
- **[air]** `B-d2-3-048` — Launch air defense sorties to counter Red's attack helicopters providing close air support.
    - *why:* Utilize air superiority to neutralize Red's air support, maintaining control of the airspace over the battlefield. *(refs: Doctrines.md - Tenet: Defending division shapes the close, deep, support area.)*
    - *intended effect:* Deny Red air support, reducing their effectiveness in supporting the 1-AD landing.
- **[usv_uav]** `B-d1-501-014` — Deploy ISR UAVs to locate and track Red's kamikaze UAVs targeting coastal radar installations.
    - *why:* Enhance situational awareness and provide targeting data for air defense units to intercept incoming threats. *(refs: Doctrines.md - Tenet: Division as primary tactical HQ; multi-functional brigades support BCTs with attack/recon aviation, fires, logistics.)*
    - *intended effect:* Protect coastal radar installations by intercepting and neutralizing kamikaze UAVs.
- **[land]** `B-d1-54-009` — Hold position — preserving reserve combat power for Red culmination per ADP 3-0.
    - *why:* Maintain defensive positions to exploit Red's culmination and prepare for a decisive counterattack. *(refs: Doctrines.md - Defense types: area defense, mobile defense, retrograde.)*
    - *intended effect:* Preserve combat power for a counterattack when Red reaches culmination.
- **[ew]** `B-d1-505-022` — Conduct electronic countermeasures to disrupt Red's jamming efforts.
    - *why:* Counteract Red's electronic warfare to maintain effective command and control. *(refs: Doctrines.md - Tenet: Division as primary tactical HQ; multi-functional brigades support BCTs with attack/recon aviation, fires, logistics.)*
    - *intended effect:* Ensure uninterrupted communication and coordination across Blue forces.


**Combined effect.** Red's attempt to land the 1st Armored Division faced significant challenges. Blue's reinforced minefields delayed Red's landing ships, with R-d3-60-028 losing 2 hulls to mines. Red's kamikaze UAVs targeted Blue's coastal radar, but Blue's ISR UAVs intercepted 3 of them. Red's attack helicopters faced Blue's air defense sorties, resulting in the loss of 1 airframe. Blue's electronic countermeasures effectively disrupted Red's jamming efforts, maintaining Blue's C2 integrity.


**Adjudicator advantage call.** **BLUE_ADV** — Force ratio 0.98:1 < 1.5:1 per FM 3-90 — Red approaching culmination.


**Unit-by-unit outcomes:**

| Unit (UID) | Status | Damage | Cause | Doctrine |
|:-----------|:-------|------:|:------|:---------|
| `R-d3-60-028` | damaged_partial | 33% | B-d1-3-036 — Minefield reinforcement delayed landing ships | Wonsan 1950: 50% MCM attrition under coastal artillery overwatch |
| `R-d3-16-056` | expended | 38% | B-d1-501-014 — ISR UAVs intercepted kamikaze UAVs | Black Sea 2024 USV survival 25-30% |
| `R-d3-12-008` | damaged_partial | 25% | B-d2-3-048 — Air defense sorties countered attack helicopters | Vietnam: SEAD required to operate in defended airspace |
| `R-d3-405-014` | suppressed | 15% | B-d1-505-022 — Electronic countermeasures disrupted jamming | Doctrines.md - Tenet: Division as primary tactical HQ |
| `B-d1-3-036` | unchanged | 0% | R-d3-60-028 — Minefield reinforcement successful | Doctrines.md - Obstacle types: existing, reinforcing |
| `B-d1-501-014` | unchanged | 0% | R-d3-16-056 — Intercepted kamikaze UAVs | Doctrines.md - Tenet: Division as primary tactical HQ |
| `B-d2-3-048` | unchanged | 0% | R-d3-12-008 — Air defense sorties successful | Doctrines.md - Tenet: Defending division shapes the close, deep, support area |
| `B-d1-505-022` | unchanged | 0% | R-d3-405-014 — Countered electronic jamming | Doctrines.md - Tenet: Division as primary tactical HQ |


**State after this phase.** Red alive 82 / Blue alive 89. Red power total 142.75 / Blue power total 103.5. Mines remaining 130. Cum losses to date: Red 53, Blue 48.


## Phase 13 — D+96h — الاحتياطي الأزرق العملياتي (لواء 73)

*Kind:* `blue_op_reserve` &nbsp; *Phase line:* 65.0 km from coast


**Scene.** At D+96h, both Red and Blue forces are engaged in a closely matched confrontation, with Blue maintaining a slight operational advantage as Red approaches culmination. The operational posture sees Blue's 73rd Brigade holding firm at the 65 km phase line, leveraging their defensive position to counter Red's advancing forces.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.98:1 / 1.38:1**
- Engine call: **BLUE_ADV** — force ratio 0.98:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.70 / Blue 0.70
- Sea mines remaining: 130


**Red intent.** Engage Blue's operational reserves to prevent them from counterattacking effectively. Maintain pressure through combined arms operations and disrupt Blue's C2 and surveillance capabilities to exploit gaps in their defense.


**Red actions (per component):**

- **[strategic]** `R-d0-500-077` — Held in reserve — preserving SSM magazine for H-hour saturation salvo per opening-day concentration doctrine.
    - *why:* Preserve strategic strike capability for decisive engagement at culmination. *(refs: JP 3-02 amphibious phases)*
    - *intended effect:* Maintain strategic strike capability for future decisive phases.
- **[maritime]** `R-d3-10-030` — Deploy 4 destroyers to provide naval gunfire support and counter Blue's corvette threat.
    - *why:* Utilize available naval assets to support ground operations and counter Blue's maritime threats. *(refs: AJP-3.1 maritime ops)*
    - *intended effect:* Suppress Blue's coastal defenses and corvette operations.
- **[air]** `R-d3-12-055` — Deploy ISR UAVs to locate and identify Blue's reserve positions and air defenses.
    - *why:* Enhance situational awareness and target acquisition for subsequent strikes. *(refs: AJP-3.3 air ops)*
    - *intended effect:* Identify Blue's reserve positions for targeted strikes.
- **[usv_uav]** `R-d3-16-056` — Launch kamikaze UAVs to target Blue's coastal radar installations.
    - *why:* Disrupt Blue's coastal surveillance and targeting capabilities. *(refs: ATP 3-01.81 C-UAS)*
    - *intended effect:* Degrade Blue's radar coverage and targeting accuracy.
- **[sof]** `R-d2-211-074` — Conduct SOF raid to disrupt Blue's rear-area C2 nodes.
    - *why:* Implement vertical envelopment to degrade Blue's command and control. *(refs: JP 3-05 SOF)*
    - *intended effect:* Disrupt Blue's C2 and delay their operational reserve deployment.
- **[land]** `R-d3-41-005` — Advance inland to engage Blue's reserve forces at the phase line.
    - *why:* Maintain operational tempo and engage Blue's reserves before they can consolidate. *(refs: FM 3-90 attacker 3:1)*
    - *intended effect:* Prevent Blue from effectively counterattacking by engaging their reserves.
- **[ew]** `R-d3-405-014` — Continue jamming operations to disrupt Blue's electronic countermeasures.
    - *why:* Ensure persistent EW to degrade Blue's communication and coordination. *(refs: ATP 3-01.8 C-AD)*
    - *intended effect:* Maintain EW advantage and disrupt Blue's electronic operations.


**Blue intent.** Maintain a mobile defense posture while preserving reserves for Red's culmination. Engage Red's advancing forces and disrupt their ISR and SOF operations. Hold naval assets to counter Red's naval gunfire support.


**Blue reactions (per component):**

- **[maritime]** `B-d1-8-031` — Held position — preserving corvette combat power to counter Red destroyers' naval gunfire support.
    - *why:* Preserving naval assets for critical engagements per FM 3-90's economy of force. *(refs: FM 3-90's economy of force)*
    - *intended effect:* Maintain naval deterrence and readiness for decisive engagements.
- **[air]** `B-d2-3-048` — Deploy F-16 squadron to intercept Red ISR UAVs.
    - *why:* Prevent Red from locating and identifying Blue's reserve positions and air defenses. *(refs: ADP 3-0's unified land operations)*
    - *intended effect:* Deny Red ISR capability and protect Blue's reserve positions.
- **[usv_uav]** `B-d2-12-059` — Deploy UAVs to intercept and neutralize Red's kamikaze UAVs targeting coastal radar installations.
    - *why:* Protect critical radar installations to maintain situational awareness. *(refs: FM 3-90's defense of key assets)*
    - *intended effect:* Neutralize Red's UAV threat and preserve radar capabilities.
- **[sof]** `B-d1-504-021` — Held position — absorbing SOF raid impact while maintaining C2 integrity.
    - *why:* Preserving C2 nodes per ATP 3-01.8 economy of force. *(refs: ATP 3-01.8 economy of force)*
    - *intended effect:* Minimize disruption to C2 operations and maintain command integrity.
- **[land]** `B-d1-54-009` — Engage Red forces advancing inland at the phase line.
    - *why:* Counter Red's advance and exploit their culmination per ADP 3-0. *(refs: ADP 3-0's mobile defense)*
    - *intended effect:* Halt Red's advance and inflict significant attrition.
- **[ew]** `B-d1-505-022` — Conduct electronic countermeasures to disrupt Red's jamming operations.
    - *why:* Maintain Blue's electronic capabilities and counter Red's EW efforts. *(refs: FM 3-90's electronic warfare)*
    - *intended effect:* Reduce the effectiveness of Red's jamming and preserve Blue's communication.


**Combined effect.** Red's attempt to engage Blue's operational reserves was met with effective Blue countermeasures. Blue's F-16s intercepted Red ISR UAVs, reducing their effectiveness. Red's kamikaze UAVs faced strong Blue UAV defenses, resulting in limited impact on Blue's radar installations. Red's SOF raid was partially successful, but Blue maintained C2 integrity. Red's naval gunfire support was countered by Blue's corvettes, maintaining Blue's maritime defense. Red's inland advance was halted by Blue's mobile defense, exploiting Red's culmination.


**Adjudicator advantage call.** **BLUE_ADV** — Force ratio 0.98:1 < 1.5:1 per FM 3-90 — Red approaching culmination, allowing Blue to exploit defensive advantages.


**Unit-by-unit outcomes:**

| Unit (UID) | Status | Damage | Cause | Doctrine |
|:-----------|:-------|------:|:------|:---------|
| `R-d3-12-055` | damaged_partial | 40% | B-d2-3-048 — F-16 squadron intercepts ISR UAVs | ADP 3-0's unified land operations |
| `B-d2-3-048` | expended | 20% | R-d3-12-055 — Sorties flown to intercept ISR UAVs | ADP 3-0's unified land operations |
| `R-d3-16-056` | expended | 30% | B-d2-12-059 — Kamikaze UAVs intercepted by Blue UAVs | FM 3-90's defense of key assets |
| `B-d2-12-059` | expended | 20% | R-d3-16-056 — UAVs deployed to intercept kamikaze UAVs | FM 3-90's defense of key assets |
| `R-d2-211-074` | suppressed | 30% | B-d1-504-021 — SOF raid partially disrupted by Blue C2 defense | ATP 3-01.8 economy of force |
| `B-d1-504-021` | suppressed | 10% | R-d2-211-074 — SOF raid impact absorbed | ATP 3-01.8 economy of force |
| `R-d3-10-030` | damaged_partial | 20% | B-d1-8-031 — Naval gunfire support countered by corvettes | FM 3-90's economy of force |
| `B-d1-8-031` | suppressed | 10% | R-d3-10-030 — Countering Red destroyers' naval gunfire | FM 3-90's economy of force |
| `R-d3-41-005` | suppressed | 30% | B-d1-54-009 — Red advance halted by Blue mobile defense | ADP 3-0's mobile defense |
| `B-d1-54-009` | suppressed | 20% | R-d3-41-005 — Engaging Red forces at phase line | ADP 3-0's mobile defense |


**State after this phase.** Red alive 82 / Blue alive 89. Red power total 141.28 / Blue power total 103.13. Mines remaining 130. Cum losses to date: Red 58, Blue 53.


## Phase 14 — D+120h — اقتراب من نقطة الانهيار

*Kind:* `culmination_check` &nbsp; *Phase line:* 80.0 km from coast


**Scene.** At D+120h, Red's advance has slowed as they approach culmination, with a local force ratio of 0.97:1 against Blue's defenses. Both sides maintain equal electronic warfare strength, while Red's remaining sea mines continue to pose a threat to Blue's operations.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.97:1 / 1.37:1**
- Engine call: **BLUE_ADV** — force ratio 0.97:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.70 / Blue 0.70
- Sea mines remaining: 130


**Red intent.** Maintain pressure on Blue forces by exploiting operational tempo and targeting their rear echelons. Preserve strategic assets for future decisive engagements while degrading Blue's C2 and radar capabilities.


**Red actions (per component):**

- **[strategic]** `R-d0-500-077` — Held in reserve — preserving SSM magazine for H-hour saturation salvo per opening-day concentration doctrine.
    - *why:* Preserving strategic missile capability for a decisive saturation strike when Blue's defenses are more depleted. *(refs: Doctrines.md, Houthi 2024 model)*
    - *intended effect:* Maintain strategic strike capability for future decisive engagement.
- **[maritime]** `R-d3-10-030` — Deploy destroyers to provide naval gunfire support and counter Blue's corvette threat.
    - *why:* To support the amphibious landing and protect against Blue's naval assets, ensuring sea control. *(refs: AJP-3.1 maritime ops, NTRP 3-22 surface warfare)*
    - *intended effect:* Suppress Blue's naval forces and provide fire support for landing operations.
- **[air]** `R-d3-14-051` — Launch Mirage strike squadron to target Blue's rear echelons and disrupt logistics.
    - *why:* To exploit operational tempo and disrupt Blue's supply lines, reducing their combat effectiveness. *(refs: AJP-3.3 air ops, Operational tempo over methodical advance)*
    - *intended effect:* Degrade Blue's rear-area logistics and command capabilities.
- **[usv_uav]** `R-d3-16-056` — Deploy kamikaze UAVs in a saturation strike on Blue's coastal radar installations.
    - *why:* To overwhelm Blue's air defenses and degrade their situational awareness. *(refs: Houthi 2024 model, Multi-domain saturation)*
    - *intended effect:* Reduce Blue's radar coverage and intercept capability.
- **[sof]** `R-d1-21-073` — Conduct SOF raids on Blue's rear C2 nodes to disrupt command and control.
    - *why:* To achieve vertical envelopment and disrupt Blue's operational coordination. *(refs: JP 3-05 SOF, Vertical envelopment)*
    - *intended effect:* Disrupt Blue's command structure and create confusion.
- **[land]** `R-d2-4-004` — Advance mechanized infantry to exploit gaps in Blue's defensive line.
    - *why:* To maintain operational tempo and pressure Blue forces beyond their culmination point. *(refs: FM 3-90 attacker 3:1, Operational tempo over methodical advance)*
    - *intended effect:* Break through Blue's defensive line and advance towards OBJ-X.
- **[ew]** `R-d3-405-014` — Continue electronic warfare operations to jam Blue's communications.
    - *why:* To maintain persistent EW pressure and degrade Blue's C2 capabilities. *(refs: EW persistent throughout, ADP 3-0 culmination)*
    - *intended effect:* Reduce Blue's ability to coordinate and respond effectively.


**Blue intent.** Maintain a defensive posture to force Red's culmination. Engage selectively to preserve strength while countering key threats. Prepare to exploit Red's culmination with a counterattack.


**Blue reactions (per component):**

- **[strategic]** `B-d2-555-019` — Held position — preserving artillery for decisive counterattack once Red culminates per ADP 3-0.
    - *why:* Red's SSMs are held in reserve, indicating no immediate strategic threat. Artillery will be crucial for counterattack. *(refs: Doctrines.md — Tenet: Defense types: area defense, mobile defense, retrograde. Defender intent: shape the battle, allow attacker to culminate, then counterattack.)*
    - *intended effect:* Preserve artillery strength for future counterattack.
- **[maritime]** `B-d1-8-031` — Deploy corvettes to counter Red destroyers and protect coastal installations.
    - *why:* Red destroyers are providing naval gunfire support. Corvettes will engage to disrupt their operations. *(refs: Doctrines.md — Tenet: Obstacle types: existing, reinforcing (mines, wire, antitank ditch). Obstacle effects: disrupt, fix, turn, block.)*
    - *intended effect:* Neutralize Red's naval gunfire support and protect coastal assets.
- **[air]** `B-d2-3-048` — Launch F-16 squadron to intercept Red Mirage strike targeting rear echelons.
    - *why:* Red aims to disrupt logistics. Intercepting the strike will preserve rear area integrity. *(refs: Doctrines.md — Tenet: Unified land operations achieved through decisive action — offense, defense, stability, and DSCA.)*
    - *intended effect:* Prevent disruption of logistics and maintain operational momentum.
- **[usv_uav]** `B-d1-501-014` — Deploy UAVs to intercept and neutralize Red's kamikaze UAVs targeting coastal radars.
    - *why:* Protecting radar installations is critical for maintaining situational awareness. *(refs: Doctrines.md — Tenet: Countermobility = terrain reinforcement + obstacle employment to disrupt, fix, turn, or block enemy movement.)*
    - *intended effect:* Preserve radar capabilities and prevent degradation of coastal defenses.
- **[sof]** `B-d1-504-021` — Held position — absorbing SOF raids with hardened C2 nodes per ATP 3-01.8 economy of force.
    - *why:* Red SOF raids aim to disrupt C2. Our nodes are hardened, minimizing impact. *(refs: Doctrines.md — Tenet: Defense types: area defense, mobile defense, retrograde.)*
    - *intended effect:* Maintain command and control integrity despite SOF raids.
- **[land]** `B-d1-54-009` — Commit armored brigade to counter Red mechanized infantry exploiting gaps.
    - *why:* Red is advancing to exploit gaps. Armored brigade will counter and halt their progress. *(refs: Doctrines.md — Tenet: Defense types: area defense, mobile defense, retrograde. Defender intent: shape the battle, allow attacker to culminate, then counterattack.)*
    - *intended effect:* Stop Red's advance and maintain defensive line integrity.
- **[ew]** `B-d1-505-022` — Conduct electronic countermeasures to disrupt Red's jamming operations.
    - *why:* Maintaining communications is crucial for coordination and defense. *(refs: Doctrines.md — Tenet: Unified land operations achieved through decisive action — offense, defense, stability, and DSCA.)*
    - *intended effect:* Ensure continued communication and operational effectiveness.


**Combined effect.** Red's multi-domain operations faced significant Blue resistance. Red's destroyers engaged Blue corvettes, but Blue's naval forces managed to disrupt Red's gunfire support. Red's Mirage strike was intercepted by Blue's F-16s, resulting in airframe losses. Red's kamikaze UAVs partially degraded Blue's coastal radar, but Blue's UAVs intercepted a significant portion. Red's mechanized infantry advance was halted by Blue's armored brigade, maintaining Blue's defensive line. Force ratio 0.97:1 indicates Red's culmination per ADP 3-0.


**Adjudicator advantage call.** **BLUE_ADV** — Force ratio 0.97:1 < 1.5:1 per ADP 3-0 culmination — Red approaching culmination.


**Unit-by-unit outcomes:**

| Unit (UID) | Status | Damage | Cause | Doctrine |
|:-----------|:-------|------:|:------|:---------|
| `R-d3-10-030` | damaged_partial | 30% | B-d1-8-031 — Corvette engagement disrupted naval gunfire support | NTRP 3-22 surface warfare: Surface fleet engagement model |
| `B-d1-8-031` | damaged_partial | 20% | R-d3-10-030 — Destroyer engagement with corvettes | NTRP 3-22 surface warfare: Surface fleet engagement model |
| `R-d3-14-051` | damaged_partial | 20% | B-d2-3-048 — F-16 interception of Mirage strike | AJP-3.3 air ops: Red air sortie sequencing |
| `B-d2-3-048` | damaged_partial | 10% | R-d3-14-051 — Mirage strike engagement | AJP-3.3 air ops: Red air sortie sequencing |
| `R-d3-16-056` | expended | 50% | B-d1-501-014 — Kamikaze UAVs intercepted by Blue UAVs | ATP 3-01.81 C-UAS: Counter-USV/UAV intercept |
| `B-d1-501-014` | damaged_partial | 30% | R-d3-16-056 — UAV engagement with kamikaze UAVs | ATP 3-01.81 C-UAS: Counter-USV/UAV intercept |
| `R-d1-21-073` | suppressed | 10% | B-d1-504-021 — SOF raids absorbed by hardened C2 nodes | ATP 3-01.8 economy of force |
| `R-d2-4-004` | suppressed | 20% | B-d1-54-009 — Mechanized infantry advance halted by armored brigade | FM 3-90 attacker 3:1 |
| `B-d1-54-009` | damaged_partial | 10% | R-d2-4-004 — Engagement with mechanized infantry | FM 3-90 attacker 3:1 |
| `R-d3-405-014` | suppressed | 15% | B-d1-505-022 — Electronic countermeasures disrupted jamming operations | EW persistent throughout |
| `B-d1-505-022` | suppressed | 10% | R-d3-405-014 — EW operations jamming communications | EW persistent throughout |


**State after this phase.** Red alive 82 / Blue alive 89. Red power total 140.32 / Blue power total 102.63. Mines remaining 130. Cum losses to date: Red 64, Blue 58.


## Phase 15 — D+132h — ضربة صواريخ أحمر نهائية + دفع أخير

*Kind:* `final_red_push` &nbsp; *Phase line:* 88.0 km from coast


**Scene.** At D+132h, Red launched a final missile strike and ground push towards OBJ-X, but faced strong resistance from Blue forces. Both sides maintained equal electronic warfare capabilities, with Red's advance nearing culmination due to a slight disadvantage in local force ratio.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.97:1 / 1.37:1**
- Engine call: **BLUE_ADV** — force ratio 0.97:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.70 / Blue 0.70
- Sea mines remaining: 130


**Red intent.** Execute a final push to seize Objective X by maximizing force concentration and exploiting Blue's culmination point. Utilize saturation strikes to overwhelm defenses and ensure a decisive breakthrough.


**Red actions (per component):**

- **[strategic]** `R-d0-500-077` — Launch a coordinated SSM strike targeting Blue's 9th AD Bde batteries to degrade their artillery capabilities.
    - *why:* Targeting Blue's artillery will reduce their ability to counter our ground forces, aligning with the joint targeting doctrine. *(refs: Doctrines.md §1)*
    - *intended effect:* Suppress Blue's artillery effectiveness by at least 50%.
- **[maritime]** `R-d3-10-030` — Deploy destroyers to provide naval gunfire support for the advancing ground units.
    - *why:* Enhance ground force effectiveness by providing direct fire support, exploiting gaps in Blue's coastal defenses. *(refs: Doctrines.md §5)*
    - *intended effect:* Increase ground force penetration capability by suppressing coastal defenses.
- **[air]** `R-d3-14-051` — Conduct air strikes using Mirage squadron to target Blue's rear echelons and disrupt their C2.
    - *why:* Disrupting Blue's command and control will reduce their operational coherence, aligning with vertical envelopment doctrine. *(refs: Doctrines.md §1)*
    - *intended effect:* Degrade Blue's C2 capabilities by at least 40%.
- **[usv_uav]** `R-d3-16-056` — Deploy kamikaze UAVs in a mass strike against Blue's coastal radar installations.
    - *why:* Overwhelm Blue's air defense systems through saturation, reducing their ISR capabilities. *(refs: WarReferences.md §6)*
    - *intended effect:* Destroy or disable at least 60% of Blue's coastal radar installations.
- **[sof]** `R-d1-21-073` — Conduct SOF raids to disrupt Blue's rear-area logistics and supply lines.
    - *why:* Targeting logistics will hinder Blue's ability to sustain operations, aligning with operational tempo doctrine. *(refs: Doctrines.md §1)*
    - *intended effect:* Reduce Blue's logistical throughput by at least 30%.
- **[land]** `R-d2-9-017` — Execute a mechanized push towards Objective X, focusing on exploiting identified gaps.
    - *why:* Mass at the decisive point to achieve breakthrough, consistent with operational tempo and mass doctrine. *(refs: Doctrines.md §5)*
    - *intended effect:* Achieve a breakthrough towards Objective X with minimal resistance.
- **[ew]** `R-d3-405-014` — Continue persistent jamming operations to disrupt Blue's communications.
    - *why:* Maintaining EW pressure aligns with the doctrine of continuous disruption of enemy C2. *(refs: Doctrines.md §5)*
    - *intended effect:* Maintain disruption of Blue's communications at a rate of 70%.


**Blue intent.** Maintain a defensive posture, leveraging prepared positions and reserves to force Red's culmination. Focus on countering Red's mechanized push and protecting critical assets from air and missile strikes.


**Blue reactions (per component):**

- **[strategic]** `B-d2-555-019` — Held position — preserving artillery combat power for Red culmination per ADP 3-0.
    - *why:* Preserving artillery assets is crucial for countering Red's mechanized push and maintaining defensive firepower. *(refs: ADP 3-0 culmination, FM 3-90 mobile defense)*
    - *intended effect:* Ensure artillery availability for decisive counterattacks as Red approaches culmination.
- **[maritime]** `B-d1-8-031` — Deploy corvettes to engage Red destroyers providing naval gunfire support.
    - *why:* Countering Red's naval gunfire support is essential to protect ground forces and maintain sea denial. *(refs: NTRP 3-22 surface warfare, Doctrines.md sea denial)*
    - *intended effect:* Disrupt Red's naval fire support and protect coastal defenses.
- **[air]** `B-d2-1-052` — Deploy Rafale squadron to intercept Red Mirage squadron targeting rear echelons.
    - *why:* Protecting C2 and logistics is critical to maintaining operational integrity and preventing disruption. *(refs: ATP 3-01.4 J-SEAD, AJP-3.3 air ops)*
    - *intended effect:* Neutralize Red air threats and safeguard rear-area operations.
- **[usv_uav]** `B-d1-2-013` — Deploy strike aircraft to intercept and neutralize Red kamikaze UAVs targeting coastal radars.
    - *why:* Preserving radar capabilities is vital for maintaining situational awareness and air defense. *(refs: ATP 3-01.81 C-UAS, Doctrines.md layered AD)*
    - *intended effect:* Prevent degradation of coastal radar installations and maintain air defense effectiveness.
- **[sof]** `B-d1-506-025` — Deploy chemical defense battalion to secure and protect logistics nodes from SOF raids.
    - *why:* Ensuring the security of logistics and supply lines is crucial to sustaining operations. *(refs: JP 3-05 SOF, Doctrines.md area defense)*
    - *intended effect:* Prevent disruption of logistics and maintain supply flow.
- **[land]** `B-d1-54-009` — Commit armored brigade to counter Red's mechanized push towards Objective X.
    - *why:* Engaging Red's mechanized forces at culmination is key to halting their advance and regaining initiative. *(refs: FM 3-90 mobile defense, ADP 3-0 culmination)*
    - *intended effect:* Destroy or repel Red mechanized units, preventing them from reaching Objective X.
- **[ew]** `B-d1-505-022` — Conduct counter-jamming operations to restore Blue communications.
    - *why:* Maintaining effective communication is essential for command and control and operational coordination. *(refs: ATP 3-01.8 C-AD, Doctrines.md EW operations)*
    - *intended effect:* Mitigate Red jamming effects and restore communication capabilities.


**Combined effect.** Red's final push involved a coordinated SSM strike, naval gunfire, and air assaults. Blue's defenses held firm, intercepting a significant portion of Red's air and missile threats. Red's mechanized forces faced strong resistance from Blue's armored brigade, preventing a breakthrough. EW operations were evenly matched, maintaining a stalemate in communications disruption.


**Adjudicator advantage call.** **BLUE_ADV** — Force ratio 0.97:1 < 1.5:1 per FM 3-90 — Red approaching culmination.


**Unit-by-unit outcomes:**

| Unit (UID) | Status | Damage | Cause | Doctrine |
|:-----------|:-------|------:|:------|:---------|
| `R-d0-500-077` | expended | 50% | R-d0-500-077 — SSM strike targeting Blue's 9th AD Bde batteries | Doctrines.md §1: joint targeting doctrine |
| `B-d2-555-019` | suppressed | 30% | R-d0-500-077 — SSM strike suppression of artillery capabilities | Doctrines.md §1: joint targeting doctrine |
| `R-d3-10-030` | damaged_partial | 50% | B-d1-8-031 — Engagement by Blue corvettes | NTRP 3-22 surface warfare |
| `B-d1-8-031` | damaged_partial | 40% | R-d3-10-030 — Naval gunfire support engagement | Doctrines.md sea denial |
| `R-d3-14-051` | damaged_partial | 20% | B-d2-1-052 — Intercepted by Rafale squadron | AJP-3.3 air ops |
| `B-d2-1-052` | damaged_partial | 10% | R-d3-14-051 — Engaged by Mirage squadron | ATP 3-01.4 J-SEAD |
| `R-d3-16-056` | expended | 60% | R-d3-16-056 — Kamikaze UAV strike on coastal radars | WarReferences.md §6: saturation strike |
| `B-d1-2-013` | damaged_partial | 30% | R-d3-16-056 — UAV strike on radar installations | Doctrines.md layered AD |
| `R-d1-21-073` | suppressed | 20% | B-d1-506-025 — SOF raids countered by chemical defense battalion | JP 3-05 SOF |
| `B-d1-506-025` | unchanged | 0% | R-d1-21-073 — SOF raids on logistics nodes | Doctrines.md area defense |
| `R-d2-9-017` | suppressed | 30% | B-d1-54-009 — Mechanized push countered by armored brigade | FM 3-90 mobile defense |
| `B-d1-54-009` | damaged_partial | 20% | R-d2-9-017 — Engagement with Red mechanized forces | ADP 3-0 culmination |
| `R-d3-405-014` | unchanged | 0% | B-d1-505-022 — EW operations stalemate | Doctrines.md EW operations |
| `B-d1-505-022` | unchanged | 0% | R-d3-405-014 — EW operations stalemate | Doctrines.md EW operations |


**State after this phase.** Red alive 82 / Blue alive 89. Red power total 138.65 / Blue power total 101.55. Mines remaining 130. Cum losses to date: Red 71, Blue 65.


## Phase 16 — D+144h — الحسم النهائي عند الهدف X

*Kind:* `final_resolution` &nbsp; *Phase line:* 95.0 km from coast


**Scene.** At D+144h, Red forces are nearing culmination as they advance towards OBJ-X, with a local force ratio of 0.97:1 against Blue's defenses. Both sides maintain equal electronic warfare strength, while Blue's remaining sea mines continue to pose a significant threat to Red's advance.


**Engine metrics (before this phase resolved).**
- Force ratio (local / operational): **0.97:1 / 1.37:1**
- Engine call: **BLUE_ADV** — force ratio 0.97:1 < 1.5:1 — Red approaching culmination
- EW strength: Red 0.70 / Blue 0.70
- Sea mines remaining: 130


**Red intent.** In this final resolution phase, the focus is on disrupting Blue's operational capabilities through targeted air and SOF actions, while maintaining pressure with EW. The land component aims to exploit gaps and advance towards Objective X, ensuring operational tempo is maintained. Strategic assets are preserved for future decisive engagements.


**Red actions (per component):**

- **[strategic]** `R-d0-500-077` — Held in reserve — preserving SSM magazine for potential future saturation salvo per opening-day concentration doctrine
    - *why:* Strategic missiles are held to ensure availability for critical future operations, aligning with the doctrine of preserving resources for decisive moments. *(refs: Doctrines.md, WarReferences.md)*
    - *intended effect:* Maintain strategic flexibility for future operations.
- **[air]** `R-d3-14-051` — Conduct a strike mission targeting Blue's rear logistics and C2 nodes to disrupt their operational capabilities.
    - *why:* Targeting logistics and C2 nodes aligns with the principle of disrupting Blue's ability to sustain operations, leveraging air power for operational maneuver. *(refs: Doctrines.md, WarReferences.md)*
    - *intended effect:* Degrade Blue's logistics and C2 capabilities, reducing their operational effectiveness.
- **[usv_uav]** `R-d3-16-067` — Deploy kamikaze UAVs in a saturation strike against Blue's forward defensive positions.
    - *why:* Saturation strikes aim to overwhelm Blue's defenses, reducing their ability to intercept and respond effectively. *(refs: Doctrines.md, WarReferences.md)*
    - *intended effect:* Neutralize a significant portion of Blue's forward defenses, creating opportunities for Red ground forces.
- **[sof]** `R-d1-21-073` — Conduct raids on Blue's rear-area C2 installations to disrupt command and control.
    - *why:* Vertical envelopment through SOF operations aims to create chaos and disrupt Blue's coordination, exploiting gaps in their defenses. *(refs: Doctrines.md, WarReferences.md)*
    - *intended effect:* Disrupt Blue's command and control, reducing their operational effectiveness.
- **[land]** `R-d2-9-017` — Advance towards Objective X, focusing on exploiting gaps in Blue's defenses rather than reducing strongpoints.
    - *why:* Maintaining operational tempo and exploiting gaps aligns with the doctrine of prioritizing speed and maneuver over methodical advance. *(refs: Doctrines.md, WarReferences.md)*
    - *intended effect:* Achieve a breakthrough towards Objective X, bypassing major Blue defensive positions.
- **[ew]** `R-d3-405-014` — Continue persistent jamming of Blue's communications to degrade their situational awareness.
    - *why:* Continuous EW operations aim to maintain pressure on Blue's C2 capabilities, reducing their ability to coordinate effectively. *(refs: Doctrines.md, WarReferences.md)*
    - *intended effect:* Maintain a degraded state of Blue's communications, supporting Red's overall operational maneuver.


**Blue intent.** Maintain a hold-and-attrit posture to force Red's culmination. Preserve key assets and reserves for a decisive counterattack once Red is fully committed and operationally exposed.


**Blue reactions (per component):**

- **[strategic]** `B-d1-4-035` — Held position — preserving radar capabilities for ongoing sea denial and air defense.
    - *why:* Maintaining radar capabilities is crucial for sea denial and air defense, ensuring Red's movements are tracked and countered effectively. *(refs: Doctrines.md — Sea control, sea denial, power projection, and maritime support.)*
    - *intended effect:* Ensure continuous monitoring of Red's movements and preserve radar assets for future engagements.
- **[air]** `B-d2-3-048` — Conduct air patrols to intercept Red's strike mission targeting logistics and C2 nodes.
    - *why:* Intercepting Red's air strike is crucial to protect logistics and C2 nodes, maintaining operational capabilities. *(refs: Doctrines.md — Protection through hardening, dispersal, concealment, deception.)*
    - *intended effect:* Disrupt Red's air strike, preserving Blue's logistics and C2 integrity.
- **[usv_uav]** `B-d2-12-059` — Deploy UAVs to intercept and neutralize Red's kamikaze UAVs targeting forward positions.
    - *why:* Countering Red's UAV saturation strike is essential to protect forward defensive positions and maintain combat effectiveness. *(refs: Doctrines.md — Large-scale combat operations (LSCO) doctrine — multi-domain, peer-or-near-peer.)*
    - *intended effect:* Neutralize Red's UAV threat, preserving forward defensive positions.
- **[sof]** `B-d1-504-021` — Held position — preserving signal capabilities for ongoing command and control.
    - *why:* Maintaining signal capabilities is crucial for effective command and control, ensuring communication remains intact despite Red's SOF raids. *(refs: Doctrines.md — Protection through hardening, dispersal, concealment, deception.)*
    - *intended effect:* Ensure continuous command and control, mitigating the impact of Red's SOF raids.
- **[land]** `B-d1-54-009` — Conduct mobile defense to counter Red's advance towards Objective X.
    - *why:* Engaging in mobile defense allows for shaping the battle and exploiting Red's culmination point. *(refs: Doctrines.md — Defense types: area defense, mobile defense, retrograde.)*
    - *intended effect:* Halt Red's advance and force culmination, setting conditions for a counterattack.
- **[ew]** `B-d1-505-022` — Conduct counter-jamming operations to restore communications.
    - *why:* Restoring communications is essential for maintaining situational awareness and operational effectiveness. *(refs: Doctrines.md — Large-scale combat operations (LSCO) doctrine — multi-domain, peer-or-near-peer.)*
    - *intended effect:* Mitigate the impact of Red's jamming, ensuring effective communication.


**Combined effect.** Red's final push towards Objective X was met with strong Blue resistance. Red's air strike on Blue's logistics was partially intercepted by Blue air patrols, resulting in moderate disruption. Red's kamikaze UAVs achieved limited success against Blue's forward defenses, with significant losses to Blue's counter-UAV operations. Red's SOF raids caused temporary disruption to Blue's C2, but Blue's mobile defense effectively countered Red's ground advance, forcing Red to culminate. EW operations were evenly matched, maintaining a degraded communication environment for both sides.


**Adjudicator advantage call.** **BLUE_ADV** — Force ratio 0.97:1 < 1.5:1 per FM 3-90 — Red approaching culmination, unable to sustain offensive momentum.


**Unit-by-unit outcomes:**

| Unit (UID) | Status | Damage | Cause | Doctrine |
|:-----------|:-------|------:|:------|:---------|
| `R-d3-14-051` | damaged_partial | 20% | B-d2-3-048 — Intercepted during strike mission on logistics | Wild Weasel 10-15% AD attrition/wave |
| `B-d2-3-048` | damaged_partial | 10% | R-d3-14-051 — Engaged in air-to-air combat during interception | Wild Weasel 10-15% AD attrition/wave |
| `R-d3-16-067` | expended | 70% | B-d2-12-059 — Kamikaze UAVs expended in saturation strike | Black Sea 2024 USV survival 25-30% |
| `B-d2-12-059` | damaged_partial | 30% | R-d3-16-067 — Countered Red's UAV saturation strike | Black Sea 2024 USV survival 25-30% |
| `R-d1-21-073` | suppressed | 40% | B-d1-504-021 — SOF raids on C2 installations | Cyprus 1974 5-8% loss when alerted |
| `B-d1-504-021` | suppressed | 20% | R-d1-21-073 — Disrupted by SOF raids | Cyprus 1974 5-8% loss when alerted |
| `R-d2-9-017` | suppressed | 30% | B-d1-54-009 — Countered by mobile defense | FM 3-90 §5-23: 3:1 attacker required for decisive offense |
| `B-d1-54-009` | damaged_partial | 20% | R-d2-9-017 — Engaged in mobile defense against Red advance | FM 3-90 §5-23: 3:1 attacker required for decisive offense |
| `R-d3-405-014` | suppressed | 20% | B-d1-505-022 — Counter-jamming operations | Large-scale combat operations (LSCO) doctrine |
| `B-d1-505-022` | suppressed | 20% | R-d3-405-014 — Persistent jamming of communications | Large-scale combat operations (LSCO) doctrine |


**State after this phase.** Red alive 82 / Blue alive 89. Red power total 136.89 / Blue power total 100.23. Mines remaining 130. Cum losses to date: Red 76, Blue 70.


---

## Final state at end of run

- Final phase: **16 — D+144h — الحسم النهائي عند الهدف X**
- Final adjudicator call: **BLUE_ADV**
- Final force ratio (local): 0.97:1
- Total Red losses: **76** units
- Total Blue losses: **70** units
- Red power remaining: 136.89
- Blue power remaining: 100.23

### Final inventory by domain

| Domain | Red alive/total | Blue alive/total |
|:-------|----------------:|-----------------:|
| strategic | 1/1 | 0/0 |
| naval | 16/18 | 6/6 |
| air | 21/21 | 19/19 |
| ground | 40/40 | 64/64 |
| sof | 4/4 | 0/0 |
