---
name: project_rmooz_direction_reset
description: "AUTHORITATIVE RMOOZ direction (2026-06-01) — 2D regional operational command-decision sim = World State + AI Decision Support + Operator Review + Visualization. Build our own concepts, never copy CMO data/code/assets."
metadata: 
  node_type: memory
  type: project
  originSessionId: 7f50e4da-e782-4f7f-9ff3-a1bce14efef3
---

**AUTHORITATIVE — read before proposing any PR.** (Owner: Ghanem, 2026-06-01.)

**What RMOOZ is:** a **2D regional** operational **command-and-decision simulator** with AI assistance.
**Target product =** World State **+** AI Decision Support **+** Operator Review **+** Operational Visualization.

**NOT:** a CMO clone · a global military sim · 3D · database-first · dry-run-preview-first · docs-first.

**Core principle — the test for every PR:** the operator must feel **"my decision changed the battle."**
If a feature doesn't strengthen that feeling, it's lower priority.

**The flow we're moving FROM → TO (this is the whole point):**
- From: `Scenario → AI recommendation → Result`
- **To: `World State → AI recommendation → Operator decision → State transition → New World State → New decisions`**

**Priority order:**
1. Finish map presentation/animation polish (arrows, trails, event pins, playback, objective visuals) — *largely DONE; was gated on step-advance, now fixed.*
2. **World State Engine** (region, friendly/enemy units, contacts, objectives, phase/time, readiness, supply, **state transitions**) — *the biggest missing layer.*
3. **RMOOZ DB-Lite** — lightweight only: role, domain, readiness, supply, sensor class, weapon class, doctrine tags. NOT a CMO database.
4. **Doctrine / ROE** — make AI decisions **auditable**: why allowed, why rejected, what doctrine influenced it.
5. **Tasking** layer (missions/tasking).

**Architecture rules:** regional only · easy to extend · data-driven · **no hardcoded scenario logic** ·
no 3D · no CMO DB copying · no proprietary databases · no Lua execution · no giant simulation-first rewrite.

**CMO:** copy *concepts* only. NEVER copy databases / code / assets / scenarios / proprietary content.
Build OUR OWN: doctrine, ROE, missions, tasking, world state, detection, logistics, readiness.

**Prefer PRs:** world state · animation · operator impact · tasking · doctrine · readiness · supply · explainability.
**Deprioritize:** docs-only · cosmetic status cards · duplicate panels · large DB expansions · global-scale sim ·
CMO-clone features that don't improve decision-making.

**Progress vs this (2026-06-01):** WS1 (World State projection, [[project_rmooz_direction_reset]] roadmap in
APP_INVENTORY), MOVE1 (continuous movement), DET1 (detection: radar-horizon/RCS/EMCON), ENG1 (engagement:
WRA/channels/salvo with explainable blocked-reasons) — all pure/Node-tested, our values. **Next frontier = WS3:
the state-transition engine that closes the loop** (operator decision → new World State → new decisions) — the
literal embodiment of "my decision changed the battle." Editable-workspace work parked
([[project_workspace_editable_owner_ruling]]). Future readiness/reliability model:
[[project_personnel_maintenance_reliability_future]].
