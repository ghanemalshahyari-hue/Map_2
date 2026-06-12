---
name: project_external_scenario_catalog_deferred
description: External Command scenario-pack catalog UI deferred; audit knowledge retained; next PR is internal staging-readiness planning
metadata: 
  node_type: memory
  type: project
  originSessionId: 8140ca27-7775-49e4-8ad0-80ea2c221e18
---

External scenario catalog UI (PR-167) was reverted after discussion. The HTML section, script tag, CSS block, and i18n keys were removed from app.html / style.css / i18n.js. `scen-catalog-contract.js` stays on disk unlinked as a dormant implementation.

**Why:** The full Command scenario-pack workflow is deferred; adding catalog UI now is premature.

**How to apply:** Do not add or expand external scenario catalog UI until explicitly asked. Audit knowledge is retained in `docs/pr-166-external-scenario-pack-audit.md` (.scen outer XML fields, Scenario_Compressed locked, .ini patches non-standalone, DB/Lua/freshness warnings needed later). The next PR should focus on internal RMOOZ staging-readiness planning only — read-only, no UI expansion unless necessary. Do not continue external scenario catalog work in the next PR.
