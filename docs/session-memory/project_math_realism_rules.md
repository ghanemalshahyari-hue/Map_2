---
name: project-math-realism-rules
description: "Future direction — RMOOZ gradually adds simple, explainable formulas (movement time, detection/engagement probability, attrition, readiness/supply/fatigue, reliability) that all read from and write to World State. Hard rule — no hidden/magical math."
metadata:
  node_type: memory
  type: project
---

**Direction (owner, 2026-06-02):** mathematical realism is part of RMOOZ's future.
RMOOZ should *gradually* add simple, explainable formulas to make outcomes more
realistic — WITHOUT copying CMO's proprietary models. Examples named by owner:
distance/movement time, speed vs terrain friction, readiness degradation, supply
consumption, fatigue accumulation, detection probability, engagement probability,
attrition/damage estimate, objective control score, reliability/failure chance.

**HARD RULE — no hidden or magical calculations.** Every formula must be:
- simple
- documented
- explainable to the operator
- editable later
- connected to World State

**Formula path (every formula follows this):**
World State → Inputs → Formula → Result → Explanation → Visualization.

Worked example given by owner:
`unit movement delay = distance / speed × terrain_friction × readiness_penalty`.

**Gating:** this is FUTURE direction, NOT a license to build now. It is still
subject to [[project-world-state-connection-central]] — no formula gets built
until it operates on a LIVE World State (the 4 connection questions apply). The
substrate already carries the right inputs (WS1 units have `kinematics.speed_kn`,
`kinematics.course`, `nmBetween` distance; bls carry `terrain_friction`;
`readiness`/`supply` fields exist but are currently dead — see audit). The WS4
`getUnitOperationalWeight(unit)` helper is the first DB2-swappable input seam.
When formulas land, they attach at the World State read seam, emit a `Result` +
an operator-facing `Explanation`, and the explanation must be surfaced, never
silent. Reconciles with [[feedback_ranges_from_db_not_invented]] (values come from
the DB, not invented) and [[feedback_real_world_judgment]].
