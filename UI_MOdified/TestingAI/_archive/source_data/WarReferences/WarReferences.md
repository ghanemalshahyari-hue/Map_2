# WarReferences — Historical analogs feeding the WarGamingClaude3 model

Purpose: extract concrete operational lessons + attrition numbers from real combined-arms / amphibious campaigns and translate each into a model coefficient or rule for the Gulf of Sidra 2026 simulation. Each section ends with **What this changes in Claude3** so the design plan is traceable to a source.

The scenario we're modeling has all three components on both sides: Red has ~115 landing ships, 18 destroyers, 19 frigates, 3 subs, 60 fighters, 72 strike aircraft, 48 explosive UAVs, 24 USVs, S-300 + Hawk + SAM-2/15 air defense; Blue has 400 pre-laid naval mines, 8 corvettes, 9 missile boats, 36 air-defense fighters, S-300 + 3× Hawk SAM bns, and an SSM brigade that **out-ranges Red SSM 800-1000 km vs 500-600 km.**

---

## 1. Iwo Jima (Feb-Mar 1945) — bombardment vs. deep defender

- 60,000 attackers vs 21,000 well-entrenched defenders. Battle lasted 26-36 days against a 5-day plan.
- USMC requested 9 days of pre-landing naval gunfire. Navy delivered **3 days, only ~13 hours of effective fire** due to weather.
- **Bombardment effectiveness against dug-in defenders was poor:** Japanese opened fire one minute after the first wave landed; their volume and accuracy were essentially undegraded.
- Attacker casualties: 25,851 in 36 days (33% of assault force), 6,821 killed.

**Lesson:** Pre-landing fires and air strikes have low coefficients of effect against prepared defenders in hardened positions. Don't assume "Day 1 bombardment kills the defense."

**What this changes in Claude3:**
- Add an explicit **pre-landing bombardment phase (D-3 to D-H)** with separate effectiveness coefficient. Default = **0.10 attrition multiplier** against dug-in coys, **0.30** against soft artillery emplacements, **0.05** against deep bunkers.
- Defender suppression from bombardment decays by 80% within 1 hour of the bombardment lifting (Iwo Jima: minute-1 reaction).

---

## 2. Tarawa (Nov 1943) — beach obstacles, tide, lift attrition

- 76-hour battle, 4,500 defenders, 1,000+ US dead, ~2,000 wounded.
- **Reef obstacle + low tide** caused Higgins boats to ground hundreds of meters offshore. Marines waded under fire.
- **17 of 4,500 Japanese surrendered** — defenders fought to last man.

**Lesson:** Beach gradient, tide, and reef obstacles can ground a significant fraction of the lift before troops are even ashore. The amphibious approach itself is a phase that produces losses.

**What this changes in Claude3:**
- New **D-2 to D-1 mine/obstacle clearance phase** with mine-sweeper attrition.
- **Lift attrition coefficient** applied to landing ships during the approach: % of craft grounded or destroyed before disembarking.
- Beach-throughput multiplied by **lift_survival_pct** at each step.

---

## 3. D-Day Normandy (Jun 1944) — what dominant air + sea does

- 7,000 ships, 195,000 naval personnel, 5 beaches, 80 km front.
- **1,200-plane airborne assault preceded the amphibious wave.** 270 medium bombers dropped 4,404 bombs.
- 4,000 killed of 133,000 landed = ~3% Day-1 fatality rate (very low compared to Tarawa).
- Allied air dominance was overwhelming; Luftwaffe nearly absent from the beachhead.
- Atlantic Wall: 2,400 miles of bunkers + landmines + beach + water obstacles — still penetrated.

**Lesson:** Overwhelming air superiority + massive bombardment + airborne vertical envelopment can break even a heavily fortified coast. But it requires near-total dominance — not parity.

**What this changes in Claude3:**
- Model **air-superiority phase before the surface approach.** Compute Red:Blue fighter ratio after attrition; multiply Red strike sortie effectiveness by `min(1, air_ratio/2)`.
- Add **Red airborne / vertical envelopment** using the 12 Red attack helos + 24 Red utility helos, attacking Blue rear at H-2.
- Add **Blue counter-air** consumption: 36 Blue fighters consume Red strike sorties at ~0.15 kill/intercept ratio.

---

## 4. Falklands / San Carlos (May 1982) — modern anti-ship + obsolete naval air defense

- Argentine A-4s & Super Étendards penetrated Royal Navy air defense regularly.
- **HMS Sheffield destroyed by single Exocet missile (May 4).**
- **San Carlos Bay 21-25 May:** HMS Ardent sunk, Argonaut damaged (May 21); Antelope sunk (May 23); Coventry sunk + Atlantic Conveyor sunk by Exocet (May 25).
- **British losses to bombs that failed to detonate:** Argentine pilots flew at 50 m vs bomb fuze armed for 150-200 m. Many UK ships hit but bombs didn't go off.
- Type 42 Sea Dart system **vacuum-tube warmup time** made it useless vs surprise low-level attacks.

**Lesson:** Anti-ship missiles can kill modern warships with single hits. Fleet air defense degrades against low-level, multi-axis attacks. A fraction of incoming weapons fail; build that fraction into the model.

**What this changes in Claude3:**
- Add **Exocet/SSM-class anti-ship missile model.** Each engagement: P(hit) ~ 0.5, P(kill | hit) ~ 0.4 for frigate/destroyer. Apply Red SSM bde + air-launched ASCM against Blue 8 corvettes + 9 missile boats.
- Add **dud factor** (~25% of bombs/missiles fail to detonate or miss).
- Naval CAP saturation: above 4 simultaneous incoming threats, P(intercept) per missile drops by 40%.

---

## 5. Gallipoli (1915) — mines + coastal artillery ruin a naval-first approach

- 18 March 1915: Allied fleet tried to force the Dardanelles with battleships. **Lost 3 battleships to mines (Bouvet, Irresistible, Ocean), severely damaged 3 more, in one day.**
- Ottoman mine line was simple but laid in unexpected location — adapted to Allied turn behavior.
- Naval-only campaign failed; required amphibious landing → 8-month stalemate → Allied withdrawal.

**Lesson:** Pre-laid sea mines defeat surface fleets that lack adequate mine countermeasures. **Blue's 400 naval mines are decisive in the maritime approach phase.**

**What this changes in Claude3:**
- Add **mine warfare attrition** to Red approach. Each 100 mines in the bbox channel produces ~5-12% capital ship loss probability until cleared. Red mine-sweepers (2 + 2 = 4) need ~5 days to clear if they survive coastal artillery fire.
- Blue 400 mines pre-laid offshore of BLS-1..4 will cause Red losses on every approach until clearance. **This is the most consequential factor my Claude2 model ignored.**

---

## 6. Wonsan 1950 — minesweeping is slow and lethal

- North Koreans laid **3,000+ mines** to block Wonsan amphibious. UN expected 5-day clearance.
- **Took 15 days, delayed amphibious D-Day by 10 days, cost 200 lives and 5 ships.**
- **All 5 USN warships sunk during the Korean War were minesweepers.** Mine sweepers are high-attrition assets.
- Magnetic mines were not detected until after a sweeper was already hit.

**Lesson:** Mine countermeasures are time-expensive and minesweepers themselves are casualties. The amphibious operation timetable is anchored to mine clearance, not to combat readiness.

**What this changes in Claude3:**
- **D-7 to D-Day clearance phase** with explicit minesweeper count, daily clearance rate, and minesweeper attrition under coastal-artillery fire.
- Red MCM force: 4 sweepers; if 50% lost to coastal artillery/SSM, clearance rate drops by half — H-hour slips.

---

## 7. Inchon (Sep 1950) — bold amphibious through difficult approach

- **29-foot tide range, narrow channels, defender mine threat** — but executed with shock and overwhelming force.
- 13 Sept: pre-landing naval gunfire by 6 destroyers + 4 cruisers under fire from coastal batteries.
- 15 Sept 06:30: first Marines landed on Wolmi-do, secured by noon. Main beaches that afternoon.
- 230-ship armada; 1st Marine Division + 7th Infantry Division.
- Mines were few and unsophisticated — destroyers spotted them at low tide and shot them.

**Lesson:** Where defender mine density is low and attacker has overwhelming firepower, even unfavorable terrain (tides, channels) can be overcome. The reverse is not true: high mine density + dispersed firepower will block the operation.

**What this changes in Claude3:**
- Trade-space variable: **mine density × attacker fire-support density.** Below threshold mine density and above threshold fire density, attacker breaks through. Use this as a step-by-step gate.

---

## 8. Ukrainian USV ops vs Russian Black Sea Fleet (2022-2024) — the modern USV-swarm model

- Magura-V5 and Sea Baby USVs sank: **Ivanovets (Tarantul corvette, Feb 2024), Cesar Kunikov (Ropucha LST, Feb 2024), Olenegorskiy Gornyak (Ropucha, Aug 2023).**
- Russian Black Sea Fleet forced to **withdraw from Sevastopol to Novorossiysk** by mid-2024.
- Early ops: 4-6 USVs launched, **only 1-2 survived to attack.** Survivability rose with experience and EW.
- After March 2024, Russian layered defense (helos, EW, surveillance UAVs, kinetic) **dramatically reduced USV survival rate.**
- Ivan Khurs intel ship attacked 500 km from Ukrainian-controlled coast.

**Lesson:** A USV swarm of 24 against a CRAM-poor defender will probably get 6-10 hits. Against a defender with active counter-USV (helo patrol + EW + CRAM), USV survival drops by ~50-70%.

**What this changes in Claude3:**
- Red's 24 USVs: **base survivability 40%** (per Ukrainian data); against Blue with helos (24 naval helos) + corvette CRAM + coastal radar + EW → adjusted **survival 25-30%.**
- ~7 USVs reach targets, of which ~5 hit and ~3-4 sink/disable a Blue ship. Calibrated to Ukrainian sink-per-strike rate.
- Blue 24 naval helos and 4 coastal radars get assigned **counter-USV mission** with success per intercept ≈ 0.4.

---

## 9. Houthi Red Sea attacks (2023-2024) — coordinated multi-vector strike

- **178 vessels attacked** over the campaign; 4 sunk.
- US CENTCOM termed individual attacks "complex": bomb-carrying drones + anti-ship cruise missiles + anti-ship ballistic missiles **launched simultaneously.**
- Houthi USVs hit ships at waterline to disable, not necessarily sink.
- 13-14 April 2024: 185 suicide drones + 110 ballistic missiles + 36 cruise missiles in one coordinated wave (Iran/Yemen combined).

**Lesson:** A coordinated multi-vector strike saturates defenses. **Defender intercept probability drops sharply when threats arrive in the same 30-second window from multiple axes.** Red can pair USVs + air-launched ASCM + ballistic missile in one wave.

**What this changes in Claude3:**
- **Saturation rule:** If incoming threats > 4 in a 30-second window, defender CRAM hit rate × 0.6.
- Red's **48 explosive UAVs + 24 USVs + ~30 air-launched ASCMs** can be sequenced into 2-3 coordinated waves at H-2, H-1, H+1.

---

## 10. Latakia (Oct 1973) — first missile-on-missile sea battle, ECM matters

- Israeli Sa'ar boats vs Syrian Komar/Osa boats armed with Soviet Styx (P-15) missiles.
- Styx had **2× range advantage** over Israeli Gabriel.
- Israelis won by closing the range under **chaff + EW deception** that defeated incoming Styx, then ripple-firing Gabriels.
- 5 Gabriels → 1 Komar + 1 Osa sunk, 1 Komar damaged.

**Lesson:** Missile range advantage is partially offset by EW + soft-kill. Side with better EW/ECM can survive in a longer-range opponent's "envelope."

**What this changes in Claude3:**
- Blue 8 corvettes + 9 missile boats + 4 coastal radar arrays vs Red 18 destroyers + 19 frigates + 38 missile boats — without ECM modeling, Blue dies fast.
- Add **EW soft-kill probability** ~25-35% per incoming missile when defender has EW suite. Both sides have EW battalions.

---

## 11. Operation Praying Mantis (1988) — modern surface engagement scale

- One day, US Navy vs Iranian Navy in Persian Gulf.
- **2 Iranian ships sunk, 1 severely damaged, 2 surveillance platforms destroyed** by US Navy in retaliation for mining of USS Samuel B. Roberts (FFG-58).
- First US anti-ship missile vs ship exchange post-WWII.

**Lesson:** Concentrated combatant strike on a numerically inferior opponent achieves heavy losses in hours. **Red's destroyer/frigate mass vs Blue's corvette mass would be decisive at sea unless Blue substitutes mines + air + EW.**

**What this changes in Claude3:**
- Model **at-sea fleet engagement at D-Day.** Without mines, Blue 8 corvettes + 9 missile boats lose to Red 18 destroyers + 19 frigates + 38 missile boats in ~6 hours with > 70% Blue losses.
- With 400 pre-laid mines + S-300 covering naval-air + Blue's longer-range SSM hitting Red's port, Blue can delay/disrupt Red.

---

## 12. SEAD doctrine (Wild Weasel, 1965-present)

- Vietnam: SA-2 SAMs forced US to develop SEAD; modifications reduced SA-2 hit rate from non-trivial to **1 hit per 48 launches.**
- **In modern war: SEAD = up to 30% of sorties in week 1**, 25% of all sorties in recent conflicts.
- Wild Weasel/Iron Hand tactic: HARM anti-radiation missile + drawing radars to emit then engaging.

**Lesson:** Without dedicated SEAD, an air force cannot operate in airspace defended by S-300 + Hawk. Red must run a SEAD campaign to use its 72 strike aircraft + 48 explosive UAVs over Blue's territory.

**What this changes in Claude3:**
- Add **SEAD phase D-3 to D+0** consuming Red strike sorties (~30% of total) against Blue's 9th AD Bde (3 Hawk bns + 1 S-300 bn).
- Blue Hawk/S-300 batteries attrit by ~10-15% per SEAD wave but consume Red strike aircraft at ~5% loss per sortie.
- Net effect: by D+1, Blue strategic AD is degraded ~30-50% AND Red strike fleet is ~10-20% attrited.

---

# Calibration table feeding the Claude3 model

| Coefficient | Value | Source |
|---|---|---|
| Pre-landing bombardment effect vs dug-in defender | 0.10 attrition | Iwo Jima |
| Bombardment suppression decay | 80% in 1 hr | Iwo Jima |
| Sea mine kill rate (capital ship per 100 mines in channel) | 5-12% | Gallipoli, Wonsan |
| Mine clearance days (per 100 mines, 4 sweepers) | 1-2 days | Wonsan |
| Minesweeper attrition under coastal fire | 30-50% over operation | Wonsan |
| USV survival vs CRAM defender | 25-30% | Black Sea 2024 |
| USV kill per surviving USV | 60-70% (hit + disable) | Black Sea, Houthi |
| ASCM hit probability | 0.5 | Falklands, Black Sea |
| ASCM kill given hit | 0.4 (frigate), 0.2 (destroyer hardened) | Falklands |
| Dud / fuze-failure factor | 25% | Falklands |
| EW soft-kill of incoming missile | 25-35% | Latakia |
| Saturation degradation (>4 threats /30 sec) | × 0.6 defender hit rate | Houthi |
| SEAD share of strike sorties | 25-30% week 1 | SEAD doctrine |
| Hawk/S-300 attrition per SEAD wave | 10-15% | Wild Weasel |
| Strike-aircraft loss per SEAD sortie | 5% | Wild Weasel |
| Air-to-air loss ratio | 1:3 attacker:defender if numerical parity | Falklands, modern doctrine |
| Beachhead day-1 fatality (with overwhelming fires) | 3% | Normandy |
| Beachhead day-1 fatality (without overwhelming fires) | 15-25% | Tarawa |
| Defender 3:1 force ratio standard | 3:1 attacker | FM 3-90 |

---

---

# Modern operations (added — post-2008)

## 13. Russia–Georgia 2008 — Battle off the coast of Abkhazia + Ochamchire landing

- Russian Black Sea Fleet task force off Georgia 9 Aug 2008: **Slava-class cruiser Moskva, Kashin destroyer Smetlivyi, multiple Grisha corvettes, Nanuchka missile ship Mirazh, 3 amphibious LSTs (Tsesar Kunikov, Yamal, Saratov), 2 mine warfare ships, transport, tug.**
- **4,000 Russian troops landed at Ochamchire**, advanced into Kodori Gorge.
- Naval engagement: Russian Mirazh sank Georgian patrol boat with anti-ship missile (likely Malakhit) — **first ASCM-vs-small-boat surface engagement of the 21st century.**
- Russia exploited absence of Georgian coastal AD/ASM to land brigades unopposed.

**Lesson:** Even a small numerical naval superiority + ASCM-armed escorts is sufficient to land 4,000 troops in <24h IF the defender lacks coastal anti-ship missiles and pre-laid mines. The Gulf of Sidra defender has both → very different dynamic.

**Coefficient feed:** Defender ASCM/CDCM availability is a binary multiplier on amphibious-approach attrition. With CDCM = 0, attacker losses ~0; with CDCM present, attacker capital-ship loss expected at 1-3 per landing wave.

## 14. NATO Operation Unified Protector — Libya 2011 (Gulf of Sidra — same AOI!)

- **Same geography as our scenario.** UN-mandated no-fly zone + arms embargo + civilian protection.
- 19 March 2011: opening strike — **110 Tomahawk cruise missiles** from UK/US ships in the Mediterranean.
- NATO took over 23-31 March. Total: **~9,700 strike sorties + 7,700 precision-guided munitions over 7 months.**
- Gaddafi's S-200/SA-3/SA-5 air defenses destroyed or kept silent within days by coordinated SEAD.
- Naval blockade in Gulf of Sidra and broader Med — Gaddafi navy effectively neutralized in first week (Tomahawk strikes on naval bases).
- Ground forces (Gaddafi armor) attrited steadily by precision air over 7 months — air alone couldn't end the war but couldn't allow Gaddafi to win either.

**Lesson:** In **this exact bbox**, a 7-month air-only campaign with overwhelming SEAD against a comparable IADS achieved sustained air dominance and naval interdiction. **Pre-strike on enemy ports (Tomahawk salvo) is doctrinal opening move.**

**Coefficient feed:** Opening-day Tomahawk-class strike: ~110 missiles can degrade a coastal naval base by ~40% (immobilize, damage, ammunition-store loss). Apply to both Red SSM-on-Blue-port and (notional) cruise-missile alternative.

## 15. Turkish invasion of Cyprus — Operation Atilla, July 1974

- **20 July 1974: 3,000 Turkish troops amphibious landing at Pentemilli (5-Mile Beach), 8 km west of Kyrenia.** Combined with airborne drop on Nicosia International Airport.
- 50th Paratroop Brigade dropped on Nicosia — **inaccurate drops landed elements directly in defended positions**, took heavy losses.
- Turkish mechanized force secured beachhead by evening of D-Day.
- By 22 July (D+2): Turkey held narrow corridor Kyrenia→Nicosia, ~3% of island.
- Turkish casualties (announced 25 July): 57 killed, 184 wounded, **242 missing** (significant — airborne accuracy + Greek resistance).

**Lesson:** Amphibious + airborne combined achieves beachhead in <12 hours when defender is reactive (not pre-positioned in depth). Airborne drop accuracy matters — **lethal if mis-drop puts troops in defender's kill zone**.

**Coefficient feed:** Red 21st SOF Bde + 12 attack helos used as vertical envelopment → calibrate to Cyprus drop losses (~5-8% of force at landing if defender alerted, ~2% if surprise).

## 16. Russia annexation of Crimea — Feb-Mar 2014

- 20 Feb 2014: Putin orders Spetsnaz + airborne to reinforce covert assets on the peninsula.
- Units identified: **18th Motor Rifle Bde, 31st Air Assault Bde, 22nd Spetsnaz Bde, 810th Naval Infantry Bde** — operated in "unmarked" mode (little green men).
- 27 Feb: troop infiltration via Russian Black Sea Fleet ships (Sevastopol bases).
- **Black Sea Fleet's main role: prevent Ukrainian naval departure**, not amphibious assault per se. Russian forces seized Ukrainian ships in Crimean ports.
- Bloodless takeover completed by mid-March; referendum + annexation 18 March.

**Lesson:** A **hybrid amphibious–airborne–information operation** can seize a coastal region without classical assault if (a) you already have basing rights (Sevastopol), (b) defender is politically disorganized, (c) sufficient SOF/airborne presence to control key nodes. **Our scenario is the opposite case — defender mobilized, no Red basing on coast.**

**Coefficient feed:** N/A directly, but reminds us that **SOF + airborne arriving fast at key inland nodes can be decisive even without large land force** — supports modeling Red 21st SOF + 24 utility helos doing heli-mobile insertions on Blue C2/SAM sites.

## 17. Ukraine 2022 — Snake Island + sinking of Moskva

- 24 Feb 2022: Russian cruiser Moskva + patrol Vasily Bykov shell Snake Island, demand surrender ("Russian warship go f— yourself"). Russians seize island.
- **13-14 April 2022: 2× Ukrainian Neptune ASCMs sink RFS Moskva (12,500-ton Slava-class cruiser).** Flagship of Black Sea Fleet, gone, off Odesa coast. US intelligence reportedly assisted targeting.
- After Moskva: Russians **withdraw fleet beyond Neptune range** — strategic effect of single ship-killer asymmetry.
- 30 June 2022: Russia abandons Snake Island. Ukrainian flag raised 4 July.

**Lesson:** A **single capable shore-based ASCM** (Neptune, range 280 km) can drive a numerically superior fleet **out of an entire sea zone**. **Blue's 800-1000 km SSM is comparable.** If Blue uses it as an anti-ship weapon (with terminal guidance), it could push the Red fleet back from the assault area entirely.

**Coefficient feed:** Single ASCM-vs-cruiser engagement: P(hit | undetected pair-launch) ≈ 0.9; P(kill | hit) ≈ 0.6 for capital ship. After first loss, surviving fleet typically withdraws ≥ 1.5× ASCM range.

## 18. Houthi Red Sea ops — multi-vector swarm + ASBM era (2023-25)

- **First operational use of anti-ship ballistic missiles (ASBM) in combat** by Houthis (Iranian Asef/Falaq series).
- US CENTCOM tracked ~178 ships attacked, 4 sunk, dozens damaged. **Sustained pressure for 24+ months** with limited resources.
- April 13-14, 2024: Iran combined 185 Shahed drones + 110 ballistic + 36 cruise missiles in **single coordinated wave.** Israel + US/UK/France/Jordan intercepted **99%** with Arrow 3 + David's Sling + Patriot + Aegis + US Navy SM + RAF Typhoon.
- Cost asymmetry: **$2k drone vs $1-4 million interceptor** — pressure on magazine depth.
- Houthi USVs hit at **waterline to disable rather than sink** — different doctrine from Ukrainian sink-the-ship.

**Lesson:** Multi-domain saturation (drone + cruise + ballistic in same window) can be intercepted at >95% IF defender has layered AD with adequate magazine depth. **Magazine depletion is the key vulnerability** — sustained 24-month pressure can exhaust even Patriot/Hawk stocks.

**Coefficient feed:** Magazine model: Blue 9th AD Bde (3 Hawk + 1 S-300) has ~500 effective interceptions assumed. After saturation waves, interceptor depletion drops Blue intercept rate from 0.85 to 0.60 to 0.40 over days. Red explosive UAV swarm (48 + USVs + ASCMs in 30-second window) is intended to force interceptor exhaustion.

---

# Updated calibration table (incl. modern ops)

Adding rows from the new entries (see also original table above):

| Coefficient | Value | Source |
|---|---|---|
| ASCM kill on cruiser (pair-launch, surprise) | 0.6 | Moskva, Ukraine 2022 |
| Defender fleet withdrawal trigger | first capital ship loss | Black Sea 2022, Cyprus 1974 |
| Opening-day Tomahawk salvo on naval base | 110 missiles → 40% base degrade | Libya 2011 |
| 7-month sustained PGM strike sorties (NATO Libya) | ~9,700 sorties | Libya 2011 |
| Hybrid SOF + airborne C2 seizure | sufficient if defender unmobilized | Crimea 2014 |
| Airborne drop loss (alert defender) | 5-8% | Cyprus 1974 |
| Airborne drop loss (surprise) | 2% | Cyprus 1974 |
| Layered AD intercept rate (saturated) | 95-99% | Israel 14 Apr 2024 |
| Interceptor magazine depth (Hawk bn) | ~150 missiles | Open-source estimate |
| ASBM (anti-ship ballistic missile) hit prob | unknown — first combat use 2024 | Houthi ops |
| ASBM intercept difficulty | High (terminal speed > Mach 5) | Houthi ops |
| Cost asymmetry drone/missile | $2k drone vs $1-4M interceptor | Israel Apr 2024 |

# Sources

- [Battle of Iwo Jima — Wikipedia](https://en.wikipedia.org/wiki/Battle_of_Iwo_Jima)
- [Iwo Jima — Naval History and Heritage Command](https://www.history.navy.mil/browse-by-topic/wars-conflicts-and-operations/world-war-ii/1945/battle-of-iwo-jima.html)
- [Battle of Tarawa — Wikipedia](https://en.wikipedia.org/wiki/Battle_of_Tarawa)
- [Photo Finish: The Battle of Tarawa — National WWII Museum](https://www.nationalww2museum.org/war/articles/photo-finish-battle-tarawa)
- [Operation Overlord — Wikipedia](https://en.wikipedia.org/wiki/Operation_Overlord)
- [D-Day Timeline — National WWII Museum](https://www.nationalww2museum.org/d-day-timeline)
- [Falkland Islands Conflict 1982: Air Defense of the Fleet — GlobalSecurity](https://www.globalsecurity.org/military/library/report/1984/HJA.htm)
- [San Carlos Waters — History Learning Site](https://www.historylearningsite.co.uk/modern-world-history-1918-to-1980/the-falklands-war-1982/san-carlos-waters/)
- [British Ships Sunk and Damaged 1982 — Naval-History.net](https://www.naval-history.net/F62-Falklands-British_ships_lost.htm)
- [Naval operations in the Dardanelles campaign — Wikipedia](https://en.wikipedia.org/wiki/Naval_operations_in_the_Dardanelles_campaign)
- [Decision and Disaster at the Dardanelles — USNI](https://www.usni.org/magazines/naval-history/2025/april/decision-and-disaster-dardanelles)
- [The Mining of Wonsan Harbor, North Korea in 1950 — DTIC](https://apps.dtic.mil/sti/pdfs/ADA529052.pdf)
- [Mines: Korea and Vietnam — Gears of History](https://gearsofhistory.com/home/2018/11/7/mines-korea-and-vietnam-1945-1975)
- [Sea Mines in Amphibious Operations — Strategy Bridge](https://thestrategybridge.org/the-bridge/2018/8/8/sea-mines-in-amphibious-operations)
- [Battle of Inchon — Wikipedia](https://en.wikipedia.org/wiki/Battle_of_Inchon)
- [Operation Chromite: Target Inchon — USNI](https://www.usni.org/magazines/naval-history-magazine/2010/october/operation-chromite-target-inchon)
- [Black Sea battle: how Ukraine's drones overpowered the Russian Navy — Navy Lookout](https://www.navylookout.com/black-sea-battle-how-ukraines-drones-overpowered-the-russian-navy/)
- [Ukrainian USV attack on ships of the Black Sea Fleet — ResearchGate](https://www.researchgate.net/publication/380912497_Ukrainian_USV_Uncrewed_Surface_Vessel_attack_on_ships_of_the_Black_Sea_Fleet_Lessons_learned)
- [Sea Baby — Wikipedia](https://en.wikipedia.org/wiki/Sea_Baby)
- [Red Sea crisis — Wikipedia](https://en.wikipedia.org/wiki/Red_Sea_crisis)
- [Timeline: Houthi Attacks — Wilson Center](https://www.wilsoncenter.org/article/timeline-houthi-attacks)
- [Battle of Latakia — Wikipedia](https://en.wikipedia.org/wiki/Battle_of_Latakia)
- [Battle of Latakia: An operation changed naval warfare — Naval Post](https://navalpost.com/battle-of-latakia/)
- [Operation Praying Mantis — Wikipedia](https://en.wikipedia.org/wiki/Operation_Praying_Mantis)
- [Operation Praying Mantis — Naval History and Heritage](https://www.history.navy.mil/browse-by-topic/wars-conflicts-and-operations/middle-east/praying-mantis.html)
- [Suppression of enemy air defenses — Wikipedia](https://en.wikipedia.org/wiki/Suppression_of_enemy_air_defenses)
- [Defense Suppression: Building Some Operational Concepts — DOD](https://media.defense.gov/2017/Dec/28/2001861734/-1/-1/0/T_DOUGHERTY_DEFENSE_SUPPRESSION.PDF)
- [Battle off the coast of Abkhazia — Wikipedia](https://en.wikipedia.org/wiki/Battle_off_the_coast_of_Abkhazia)
- [Operation Unified Protector — Wikipedia](https://en.wikipedia.org/wiki/Operation_Unified_Protector)
- [NATO and Libya (Feb-Oct 2011) — NATO Topic](https://www.nato.int/en/what-we-do/operations-and-missions/nato-and-libya-february-october-2011)
- [Timeline of the 2011 military intervention in Libya — Wikipedia](https://en.wikipedia.org/wiki/Timeline_of_the_2011_military_intervention_in_Libya)
- [Military operations during the Turkish invasion of Cyprus — Wikipedia](https://en.wikipedia.org/wiki/Military_operations_during_the_Turkish_invasion_of_Cyprus)
- [Operation Attila — War History](https://warhistory.org/@msw/article/operation-attila)
- [Black Sea Fleet — Wikipedia](https://en.wikipedia.org/wiki/Black_Sea_Fleet)
- [What Can We Learn about Amphibious Warfare from Ukraine — Modern War Institute](https://mwi.westpoint.edu/what-can-we-learn-about-amphibious-warfare-from-a-conflict-that-has-had-very-little-of-it-a-lot/)
- [Sinking of the Moskva — Wikipedia](https://en.wikipedia.org/wiki/Sinking_of_the_Moskva)
- [Snake Island campaign — Wikipedia](https://en.wikipedia.org/wiki/Snake_Island_campaign)
- [Neptune anti-ship missile — Military Times](https://www.militarytimes.com/off-duty/gearscout/2022/05/12/the-neptune-anti-ship-missile-the-weapon-that-may-have-sunk-the-russian-flagship-moskva/)
- [April 2024 Iranian strikes on Israel — Wikipedia](https://en.wikipedia.org/wiki/April_2024_Iranian_strikes_on_Israel)
- [How Israel intercepted 99% of Iran's drones and missiles — Iran International](https://www.iranintl.com/en/202404152333)
