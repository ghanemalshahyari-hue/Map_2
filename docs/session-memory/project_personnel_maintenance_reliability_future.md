---
name: project_personnel_maintenance_reliability_future
description: "FUTURE (not now) — personnel/crew, maintenance, reliability & controlled uncontrolled-events model for World State / DB-Lite. Equipment can't operate by itself."
metadata: 
  node_type: memory
  type: project
  originSessionId: 7f50e4da-e782-4f7f-9ff3-a1bce14efef3
---

**Status: FUTURE feature direction — do NOT implement unless explicitly requested / unless it fits the
current PR.** Captured 2026-06-01 at owner's request.

**Concept:** equipment cannot operate by itself. Every platform/system/vehicle/radar/launcher/
aircraft/ship/weapon depends on **personnel availability, crew readiness, shift schedule, fatigue,
maintenance status, supply status, equipment reliability, unexpected malfunction, damaged weapons /
failed interceptors.** RMOOZ should eventually model this as part of World State / DB-Lite.

**Proposed future schema fields (per unit/component):**
```js
{
  personnel:   { requiredCrew:4, availableCrew:3, shiftStatus:"active|resting|fatigued|unavailable",
                 fatigueLevel:0.25, trainingLevel:"standard" },
  maintenance: { status:"operational|degraded|maintenance|offline", reliability:0.92,
                 lastServiceHoursAgo:18, failureRisk:"low" },
  supply:      { fuel:"normal", ammo:"limited", spareParts:"low" },
  randomEvents:{ enabled:false, possibleEvents:["equipment_failure","weapon_misfire",
                 "sensor_degradation","crew_fatigue","maintenance_delay"] }
}
```

**HARD design rule:** NOT fake randomness that makes it feel like a game. Must be **controlled,
explainable, and optional** (`randomEvents.enabled:false` by default).

**Future behavior examples:** radar degrades if maintenance poor · launcher won't fire if crew
insufficient · missile fails/underperforms if weapon damaged · fatigued/shift-change units respond
slower (OODA latency) · units under maintenance are NOT available for tasking · **AI must CITE these
constraints when proposing a COA**.

**Where it plugs in (the existing roadmap tracks — see APP_INVENTORY "ACTIVE BUILD ROADMAP"):**
- **World State Engine** — `units[].personnel/maintenance/supply` carried in the snapshot.
- **RMOOZ DB-Lite (DB1/DB2)** — component-level reliability/crew fields alongside sensor/weapon class.
- **Readiness/Supply model** — `readiness`/`supply` slots already stubbed in WS1's unit projection.
- **Detection/engagement math (DET1/ENG1)** — these fields become **multipliers/gates** on the
  mathematical rules (reliability × detection Pd; crew availability gates firing; fatigue → +OODA;
  weapon condition → hit/underperform). This is the realism layer ON TOP of the physics formulas.
- **Doctrine/ROE/AI explanation (DOC1)** — constraints become citable reasons in AI COA proposals.

Related: [[project_rmooz_direction_reset]] (mimic CMO structurally; math rules added in current build
to make it as real as possible — these fields feed those rules later).
