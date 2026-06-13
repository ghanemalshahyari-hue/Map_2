# RMOOZ CMO-Derived Capability Roadmap

Purpose: map the YouTube-caption-derived CMO research into RMOOZ capability phases, so we do not lose the bigger target while Step 1 import is being stabilized.

Read with:

- `docs/RMOOZ_STEP1_TO_FREE_FIGHT_TODO.md`
- `docs/cmo-functional-rules/1-movement-detection.md`
- `docs/cmo-functional-rules/2-doctrine-wra-engagement.md`
- `docs/cmo-functional-rules/3-damage-attrition.md`
- `docs/cmo-functional-rules/4-scenario-authoring.md`
- `docs/cmo-functional-rules/exhaustive/terrain-environment.md`
- `docs/cmo-functional-rules/exhaustive/logistics-basing.md`
- `docs/cmo-functional-rules/exhaustive/naval-subsurface.md`
- `docs/cmo-functional-rules/exhaustive/strike-weapons-part1.md`
- `docs/cmo-functional-rules/exhaustive/strike-weapons-part2.md`
- `docs/cmo-functional-rules/exhaustive/strike-weapons-part3.md`
- `APP_INVENTORY.md`

---

## Owner target

RMOOZ should become a 2D/3D command-decision wargame inspired by CMO concepts, not a clone of CMO data/code. The app should let the operator import a scenario, verify RED/BLUE laydown, confirm Objective X, then run a live AI free fight where movement, detection, engagement, terrain, damage, supply, and doctrine make the battlefield feel alive and explainable.

Rule: do not wire advanced realism before Step 1 import, placement, unit names, symbols, Objective X, and refresh persistence are correct.

---

## CMO research buckets already in repo

### 1. Scenario authoring flow

CMO build order:

1. Pick concept/location.
2. Set database.
3. Add sides.
4. Set side posture.
5. Set doctrine/ROE.
6. Set time/duration.
7. Set weather.
8. Set realism/features.
9. Save base version.
10. Place units / OOB.
11. Build areas/reference points/zones.
12. Create missions.
13. Create events/scoring.
14. Test and balance.
15. Add briefing/final polish.

RMOOZ mapping:

- Step 1 import currently covers parts of sides, OOB, bases, and Objective X.
- Future authoring mode should add posture, doctrine, time/duration, weather, realism settings, areas, missions, events, testing, and briefing.
- Do not skip directly from document import to free fight without a reviewable scenario model.

### 2. Movement and detection

CMO rules captured:

- Altitude changes fuel, LOS, radar exposure, and engagement window.
- Waypoint speed/altitude changes apply per leg; route planning matters.
- Helicopters can terrain-mask and pop up.
- Ground movement can pause/resume through waypoint speed tricks or mission timing.
- Groups/formations matter; group lead, spacing, relative/fixed bearings, and ghost display affect map readability.
- Radar detection depends on band, horizon, altitude, target aspect/RCS, look-down limitations, IFF, ESM, jamming/EMCON, visual sensors, rain/clouds, and terrain.
- Terrain and land cover affect movement speed, detection, attack, and spotting.

RMOOZ mapping:

- Step 1: do not use this yet except for display-safe placement and future metadata.
- Free Fight v1: use simple movement by role/objective/contact.
- Free Fight v2: add terrain friction, LOS, altitude/speed/fuel, EMCON, radar horizon, and detection confidence.
- Later: add group/formation behavior and route planning.

### 3. Doctrine, WRA, and engagement decision-making

CMO rules captured:

- Doctrine has layered scope: side -> mission -> unit/group, with inheritance and force override.
- WRA is per weapon and per target environment.
- Weapons control differs by air/surface/subsurface/land target category.
- Ground units require opportunity-target doctrine or a mission/direct/self-defense trigger.
- Collective responsibility can escalate side hostility.
- OODA/proficiency affects reaction timing.
- Self-defense differs from automatic firing.
- Salvo sizing and shooters-per-salvo govern how much fire is committed.

RMOOZ mapping:

- Free Fight v1: every action must have a why-not/why explanation.
- Free Fight v2: add side doctrine, unit doctrine, target category, WRA-style fire authorization, self-defense, and salvo sizing.
- Later: add mission doctrine and force-override behavior.

### 4. Damage, weapons, attrition

CMO rules captured:

- Pk starts from weapon base probability and is modified by speed, range, agility, altitude, deflection angle, proficiency, LOS, and EW.
- Weapon malfunction/dud can nullify a hit.
- Bomb-sight tier dominates unguided bomb accuracy.
- Altitude affects bombing accuracy depending on sight tier.
- Terrain, wind, and land cover affect weapon effectiveness.
- Armor/penetration/HP determine damage.
- Batteries and grouped ground units are distributed systems; killing one component may not kill the whole capability.
- Point defense and saturation matter.
- Special weapon classes exist but should be deferred.

RMOOZ mapping:

- Free Fight v1: simple hit/degraded/destroyed/expended/delayed states.
- Free Fight v2: add Pk modifiers and magazine decrement.
- Later: add component-level damage, point-defense saturation, armor/penetration, duds, and special weapons.

### 5. Terrain and environment

CMO rules captured:

- Terrain/elevation masks radar and visual LOS.
- Curved Earth/horizon caps detection.
- Slant range consumes sensor range.
- Rain/clouds affect EO/IR/laser differently than radar.
- Land cover changes visual spotting, movement, and weapon effect.
- Terrain can create masked routes and defensive geometry.

RMOOZ mapping:

- Step 1: use terrain only to inform review hints, not to mutate placement.
- Free Fight v2: apply LOS and terrain friction to movement/detection.
- Later: use terrain-aware route selection and best-LOS observation points.

### 6. Logistics and basing

CMO rules captured:

- Airfields/ports/ships act as hosts for aircraft/ships/cargo.
- Airfields are composed of sub-components: runway, taxiway, access points, tarmac, hangars, ammo/fuel dumps.
- Runway/taxiway/access-point damage affects launch ability differently.
- Magazines and rearming depend on finite/unlimited ammo settings.
- Ports launch ships with delay and can refuel/rearm docked ships.
- Cargo, containers, UNREP, aerial refueling, sortie cycle, ready/arm state, and fuel/range are key logistics constraints.

RMOOZ mapping:

- Step 1: bases are anchors and status cards only.
- Free Fight v2: bases provide launch/rearm/refuel/supply effects.
- Later: add component-level base damage, runway/access-point shutdowns, magazines, sortie cycles, cargo, refueling, and maintenance.

### 7. Naval and subsurface

CMO rules captured:

- Naval formation spacing changes defensive fire geometry and missile leakers.
- Ships/ports can host boats and launch with delay.
- Subsurface domain has sonar, acoustic conditions, depth, and contact uncertainty constraints.

RMOOZ mapping:

- Free Fight v1: keep naval movement simple but side-aware.
- Later: add formation spacing, maritime interception, port hosting, sonar/acoustic detection, depth bands, and contact classification.

### 8. Strike and weapons planning

CMO rules captured:

- Strike planning depends on aimpoints, loadouts, WRA, altitude, weather, defense, and re-attack logic.
- Auto-target selection can pick wrong sub-targets unless controlled.
- Airfield attacks require distributed targeting, not dumping all weapons on one aimpoint.
- Manual targeting, target list, flight size, and weapon impacts per target matter.

RMOOZ mapping:

- Free Fight v1: basic attack/counterattack against Objective X and nearby units.
- Free Fight v2: strike-package logic, aimpoint selection, target allocation, re-attack, and WRA per target class.

---

## Capability phase plan

### Phase A — Step 1 import foundation

Must be completed before real Free Fight.

- Import RED/BLUE documents or JSON.
- Review AI understanding.
- Correct side separation.
- Correct base/anchor grouping.
- Correct unit names.
- Correct symbology or safe family-symbol fallback.
- Correct Objective X.
- Generated draft positions use reviewed anchors.
- Refresh keeps review/base state understandable.

### Phase B — Reviewable draft scenario

- Scenario has sides, posture placeholders, objective, bases, unit list, symbols, draft provenance.
- Operator can see what is exact, what is review-only, and what is inferred.
- Unit Status, Base Status, Objective Status, and Import Summary agree.

### Phase C — Free Fight v1

- Both RED and BLUE act from World State.
- Simple movement toward/away/flank/hold based on Objective X and enemy contacts.
- Simple engagement: detect -> decide -> fire/hold -> effect.
- Map shows movement, attack/counterattack arrows, attrition, status.
- Every decision has a reason and why-not blockers.

### Phase D — Doctrine/WRA v1

- Side/mission/unit doctrine placeholders.
- Weapons-control per target class.
- Opportunity-target flag.
- Self-defense logic.
- Salvo sizing and ammo decrement.
- OODA/proficiency delay.

### Phase E — Movement/detection/terrain v1

- Terrain friction.
- LOS/radar horizon.
- EMCON and passive detection.
- Sensor range and confidence.
- Weather/cloud/rain modifiers.
- Movement by domain: ground, air, naval, subsurface.

### Phase F — Damage/logistics v1

- Damage states: active, degraded, suppressed, destroyed, expended, delayed.
- Magazine/ammo/fuel state.
- Base rearm/refuel/supply effects.
- Component-level targets for important bases.

### Phase G — Advanced realism

- Formation behavior.
- Strike packages and aimpoint allocation.
- Base component damage and repair.
- Naval formation/point-defense saturation.
- Subsurface/acoustic detection.
- Advanced weapon effects and special weapons only after core realism is stable.

---

## Guardrails

- CMO concepts are guidance; do not copy CMO data/code.
- Do not activate advanced physics to compensate for bad import placement.
- Do not turn review/demo markers into final unit positions without explicit operator approval.
- Every AI action should be explainable.
- Every generated position should carry provenance.
- Every future realism rule must be testable with a small fixture before live wiring.

---

## Immediate action

Keep the active implementation focused on `docs/RMOOZ_STEP1_TO_FREE_FIGHT_TODO.md` until Step 1 passes. Use this roadmap to choose the next phase after Step 1 is stable.
