---
name: decision-package-import-contract
description: "RMOOZ imports external \"Decision Package\" folders (from the خطوات صنع القرار app) read-only; distinct from the internal adjudication scenario; import is already wired"
metadata: 
  node_type: memory
  type: project
  originSessionId: e14a492b-eb87-4f0e-9ccf-18500bc3ff4f
---

The project has **two distinct scenario input contracts** — do not conflate them:

1. **Internal adjudication scenario** — `UI_MOdified/data/scenarios/wargame3.json`, contract in `server/ai/scenario-schema-spec.js`. Feeds the AI adjudicator + Monte Carlo. Step shape = `actors`/`affected`/`engagement_arcs`. Domain = ground/amphibious (BLS, phase lines, throughput).

2. **External Decision Package ("خطوات صنع القرار")** — authored by a separate companion app/AI. Folder layout: `scenario_manifest.json` + `steps/stepXX.json` + `geojson/stepXX.geojson` + `images/stepXX.png` + `references/doctrine_sources.json` + `reports/decision_report.md` + root `validation_checklist.json`. Explicitly `read_only` / `no_auto_adjudication` / `dry_run_only` / `display_only`. Step shape = `decision_point`/`options`/`selected_decision`/`source_trace`/`safety`. Manifest `sides` are authored with roles. Sample/dummy packages live at `~/Downloads/rmooz_dummy_decision_packages/DP_01..03`.

The Decision Package import is **already wired** (not aspirational): ~25 funcs in `client/shell/scenario-workspace.js` (`normaliseDecisionPackage`, `loadDecisionPackagePreview`, `paintDecisionManifestCard`, `paintSourceTraceReviewCard`, `buildImportValidationSummary`, `buildPackageReadinessChecklist`, `importDecisionPackageJson`, …) and `/api/scenario/import` + `/api/scenario/events` + an `fs.watch` watcher in `server/web-server.js`. The DRP / `sw-dpkg-*` workspace cards render these packages.

**Why:** the user flagged that earlier analysis ignored these import formats and risked duplicating things that already exist. The two contracts cover much of what looks "missing" when only the internal schema is read.

Note: the Decision Package is one of **five** catalogued formats (A=canonical RMOOZ Live Scenario JSON, B=Decision Package, C=Wargame 3, D=Command/CSP51 detect-only, E=external catalog). Authoritative taxonomy + conversion matrix + canonical target (RMOOZ Live Scenario JSON v1): `docs/pr-286L2-scenario-folder-catalog-and-conversion-plan.md`. CSP51 specifics: [[project-csp51-audit]].

**How to apply:** before claiming a scenario field/feature is missing, check across formats (start with PR-286L2 + this contract + the internal schema). When working the import pipeline, the Downloads sample packages are the DP test fixtures. Full write-up in `docs/cmo-scenario-editor-application.md` ("Scenario Sources — One Canonical Target, Five Source Formats"). Related: [[external-scenario-catalog-deferred]] (catalog *UI* reverted; the package *contract* is live).
