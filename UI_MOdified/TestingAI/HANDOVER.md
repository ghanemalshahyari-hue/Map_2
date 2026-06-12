# WarGame Project — Handover

**Last updated:** 2026-06-03
**Prepared for:** incoming colleague taking over the project

This document explains everything in `TestingAI/`. Read it top to bottom once; it's organized so you can then jump to whichever component you're working on.

---

## 1. What this project is, in one paragraph

A **doctrine-driven, AI-orchestrated amphibious wargame simulator**. You give it two orders-of-battle (Red attacker + Blue defender as `.docx`), a scenario definition, GIS terrain, and a corpus of military doctrine. Three LLM agents — Red commander, Blue commander, and a neutral Adjudicator — play out a multi-phase operation turn by turn. Every action is grounded in real doctrine retrieved from a RAG (retrieval) system, and a deterministic Python engine (not the LLM) computes all the numbers (force ratios, attrition, mine/EW state). The output is a set of machine-readable files (CSV schedule, Markdown narrative, per-phase GeoJSON) plus an in-progress Unity 3D visualization that renders the operation on a real Earth globe.

It is **scenario-portable**: swap the inputs and it runs a different operation. The reference scenario is "Gulf of Sidra 2026 — Amphibious Assault" (Libya coast), 17 phases (D-7 through D+144h).

---

## 2. The three main folders

```
TestingAI/
├── SmartSearch/            ← the RAG retrieval system (doctrine search). DO NOT MODIFY ITS CODE.
├── WarGamingGEN/           ← the wargame generator (the actual simulator). This is the heart.
├── WarGameVisualization/   ← Unity 3D viewer (work-in-progress).
├── _archive/               ← old benchmarks, raw source files, handoff packs, API key.
└── HANDOVER.md             ← this file.
```

> **Naming note:** `SmartSearch/` was previously named `DecisionMakingSteps_TRANSFER`. It is the *same* system. The folder was renamed for clarity at handover. Its internal docs (`SmartSearch/CLAUDE.md`, `AGENTS.md`, `OFFLINE_RUNBOOK.md`) still say "DecisionMakingSteps" — that is intentional and correct; that is the system's real name and the offline-VM copies keep it.

### 2.1 SmartSearch/ (9.7 GB — but 7.5 GB is throwaway venvs)

The retrieval brain. A LangGraph + Qdrant + bge-m3 embedding stack that ingests a doctrine corpus and answers semantic queries (`graph.retrieval.search()`). WarGamingGEN calls into it as a **read-only client**.

- **HARD RULE:** Do not modify any code inside `SmartSearch/`. It is already deployed byte-for-byte on an offline VM. The only files you may touch are `.env` and `inputs/doctrine/` (the corpus). This rule has held the entire project; keep it.
- Stack: Qdrant (vector DB, runs in Docker), bge-m3 embeddings (served locally via LM Studio on Mac, or Ollama/TEI on Linux), optional bge-reranker (degrades to RRF-only if unavailable).
- The 7.5 GB `venv/` + `venv_mac/` are Mac-Python virtual environments. **They do not transfer between machines.** Rebuild them on whatever machine you use (see §4).
- Read `SmartSearch/CLAUDE.md` and `SmartSearch/OFFLINE_RUNBOOK.md` for its internals.

### 2.2 WarGamingGEN/ (974 MB — the simulator)

This is where the real work lives and where you'll spend most of your time. Pure Python.

```
WarGamingGEN/
├── inputs/
│   ├── scenario.json            ← operation definition: bbox, objective, D-day, 17 phases, off-map markers
│   ├── forces/red_team.docx     ← Red order of battle (84 units, Arabic)
│   ├── forces/blue_team.docx    ← Blue order of battle (89 units, Arabic)
│   └── gis/                     ← terrain, elevation (libya_dem.tif), imagery, boundaries
├── src/
│   ├── parsers/                 ← docx OOB parser, scenario parser, GIS loader
│   ├── state/
│   │   ├── world_state.py       ← single source of truth; only mutable via apply_resolution()
│   │   └── force_model.py       ← ALL the numeric math (force ratios, EW, mines). LLM never computes numbers.
│   ├── retrieval/
│   │   └── smart_search_client.py  ← read-only client into SmartSearch (sys.path injection)
│   ├── llm/
│   │   ├── client.py            ← OpenAI Responses-API wrapper + Pydantic validation + retry-with-feedback
│   │   └── schemas.py           ← strict JSON contracts (TurnAction, PhaseResolution, etc.)
│   ├── agents/
│   │   ├── red_agent.py / blue_agent.py / adjudicator.py
│   │   ├── base_agent.py
│   │   └── personas/*.md        ← the system prompts that define each commander's doctrine/style
│   ├── output/
│   │   ├── csv_schedule.py      ← writes wargameschedule.csv
│   │   ├── markdown_report.py   ← writes the narrative report
│   │   └── geojson_writer.py    ← writes per-phase stepNN.geojson (v2 — full force + movement + arcs)
│   ├── tools/
│   │   └── regenerate_outputs.py ← rebuild CSV/MD/GeoJSON from existing checkpoints WITHOUT re-running the LLM ($0)
│   └── orchestrator.py          ← the turn loop: scene → Red → Blue → Adjudicator → apply → next phase
├── tests/
│   ├── test_full_run.py         ← the main entry point. Runs the whole wargame.
│   └── test_one_phase.py        ← runs a single phase end-to-end (debugging)
├── runs/
│   ├── <timestamp>_<name>/      ← every run is versioned here (never overwrites)
│   │   ├── checkpoints/phaseNN.json  ← per-phase records (resumable)
│   │   ├── outputs/             ← wargameschedule.csv, wargame_report.md, geojson/
│   │   └── llm_audit/           ← every LLM prompt+response logged
│   └── latest -> <newest run>  ← symlink
├── .env                         ← config (LLM model, API key, smart-search path). NOT in git.
└── README.md                    ← extensive: architecture + "offline-edit map" (what file to change for what)
```

**Read `WarGamingGEN/README.md` next — it has a full offline-edit map (which file to change for any tweak) and scenario-portability recipes.**

### 2.3 WarGameVisualization/ (14 GB — Unity viewer, WORK IN PROGRESS)

Unity 6.3 LTS project that reads WarGamingGEN's output and renders it on a real Earth globe (Cesium for Unity + Cesium ion). **This is the least-finished component — see §5 for exact status.**

```
WarGameVisualization/
├── Assets/
│   ├── Scripts/
│   │   ├── Importer/   UnitCatalog.cs, WargameRun.cs   ← read JSON outputs
│   │   ├── Spawner/    UnitSpawner, UnitController, PhaseOrchestrator, EngagementArcRenderer
│   │   ├── UI/         NarrativePanel, PhaseScrubberUI  ← (scripts exist, UI not built in-scene yet)
│   │   └── Editor/     SceneAutoBootstrap, CesiumSceneSetup, VisualDiagnostic, PlayModeSmokeTest
│   ├── Models/         ← 65 free CC0/CC-BY 3D models (ships, tanks, jets, drones)
│   ├── Resources/Models/ ← same models, in a Resources folder so they load at runtime
│   └── Scenes/LibyaOps.unity  ← the scene (auto-created by SceneAutoBootstrap)
├── Packages/
│   ├── manifest.json          ← declares Cesium (file:cesium-unity-1.23.2), Cinemachine, Recorder, Newtonsoft, etc.
│   └── cesium-unity-1.23.2/   ← Cesium for Unity, installed as a local tarball (437 MB, has the prebuilt native binary)
├── data/
│   ├── unit_catalog.json      ← maps each "<domain>/<type>" to a 3D model + physical specs + animations
│   └── wargame_run -> ../../WarGamingGEN/runs/latest   ← symlink: viewer always sees the newest run
└── local/cesium_ion_token.txt ← your Cesium ion access token (NOT in git)
```

Most of the 14 GB is regenerable Unity cache (`Library/`, `Library/PackageCache/`). The real source is `Assets/`, `Packages/manifest.json`, `data/`.

---

## 3. How the three connect (data flow)

```
  inputs (.docx, scenario.json, GIS, doctrine corpus)
        │
        ▼
  ┌──────────────┐   retrieval queries    ┌──────────────┐
  │ WarGamingGEN │ ─────────────────────► │ SmartSearch  │
  │ (orchestrator│ ◄───────────────────── │ (Qdrant RAG) │
  │  + 3 agents) │   doctrine chunks       └──────────────┘
  └──────┬───────┘
         │ writes
         ▼
  runs/<timestamp>/outputs/
     ├── wargameschedule.csv
     ├── wargame_report.md
     └── geojson/stepNN.geojson   ◄── RFC 7946 compliant, has its own JSON Schema
         │
         │ symlinked as data/wargame_run
         ▼
  ┌──────────────────────┐
  │ WarGameVisualization │  ← Unity reads the GeoJSON + checkpoints, renders on Cesium globe
  └──────────────────────┘
```

Key point: **WarGamingGEN is the producer; SmartSearch is its retrieval dependency; WarGameVisualization is a downstream consumer.** The GeoJSON output is also a clean handoff format for *any* external visualization app (a colleague was building a separate one — see `_archive/handoff_packs/GeoJSON_Schema_Pack/` for the formal schema + docs).

---

## 4. How to run each component

### Prerequisites (once per machine)
- Python 3.10+ (3.12 used on the Mac)
- Docker (for Qdrant)
- A local embedding server for bge-m3: **LM Studio** (Mac, GUI) or **Ollama** (Linux, headless — recommended for servers)
- An OpenAI API key (in `_archive/apik.rtf`, also already pasted into both `.env` files) — OR a local LLM (Qwen 2.5 32B) for $0 runs

### Run the wargame (the main thing)
```bash
# 1. Start Qdrant
cd SmartSearch && docker compose up -d

# 2. Start the embedder (Mac: LM Studio with text-embedding-bge-m3 on :1234)
#    (Linux: ollama pull bge-m3 && ollama serve)

# 3. Ingest doctrine into Qdrant (one-time, or after changing the corpus)
cd SmartSearch && python -m graph.scripts.ingest_doctrine

# 4. Build / activate the Python env
python3.12 -m venv SmartSearch/venv_mac        # if not already built
source SmartSearch/venv_mac/bin/activate
pip install -r WarGamingGEN/requirements.txt

# 5. Run the wargame
cd WarGamingGEN
python tests/test_full_run.py --max-phases 3   # fast smoke (~$0.45, ~3 min on GPT-4o)
python tests/test_full_run.py --all            # full 17-phase run (~$2.40, ~16 min)
python tests/test_full_run.py --all --resume   # resume a crashed run
```
Outputs land in `WarGamingGEN/runs/<timestamp>/outputs/`. `runs/latest` always points to the newest.

### Regenerate outputs without paying for the LLM again
If you change a writer (CSV/MD/GeoJSON format) and want fresh outputs from an existing run:
```bash
cd WarGamingGEN
python -m src.tools.regenerate_outputs        # uses runs/latest, $0, ~5 sec
```

### Open the Unity viewer
1. Open Unity Hub → add/open `WarGameVisualization/` with Unity **6.3 LTS (6000.3.16f1)**
2. Wait for package import (Cesium is a local tarball, no download needed)
3. Open `Assets/Scenes/LibyaOps.unity`, press Play
4. The Cesium ion token in `local/cesium_ion_token.txt` is auto-loaded by `CesiumSceneSetup.cs`

---

## 5. Current state — what works, what doesn't

### ✅ Done & verified
- **WarGamingGEN: fully working.** 17-phase Libya run completed, 11/11 internal quality checks pass. Real unit IDs, doctrine citations, force-ratio progression, mine/EW evolution. Output matches or exceeds the old manual Claude3 benchmark.
- **GeoJSON output (v2):** every phase emits all 173 units + engagement arcs + movement deltas. RFC 7946 compliant (validated against the official IETF schema) — opens in geojson.io, Mapbox, deck.gl, Cesium. Formal JSON Schema + consumer docs in `_archive/handoff_packs/GeoJSON_Schema_Pack/`.
- **Run versioning + resume + regenerate-without-LLM** all work.
- **SmartSearch:** deployed and working (it's the mature, offline-deployed component).
- **Unity baseline:** project compiles clean (0 errors), Cesium globe + Bing satellite imagery render in Scene view, 173 units spawn anchored to correct real-world lat/lon (verified via `VisualDiagnostic` — units span the real 230km × 430km AO).

### 🚧 Work-in-progress / known issues (Unity viewer)
1. **Map disappears when you press Play.** It renders fine in the Scene (edit) view but Cesium tiles need to re-stream when Play mode starts and the active camera changes. Needs: aggressive tile preload settings + camera positioned identically between edit/play. (Was mid-fix at handover.)
2. **Units are placeholder cubes/cylinders, not the real 3D models.** The 65 downloaded models exist in `Assets/Models/` but `UnitSpawner` currently spawns colored primitives sized to be visible at altitude. Re-enabling real models + a zoom-aware marker overlay was the next step.
3. **No camera controls yet.** Need a fly-camera script (orbit/pan/zoom). Planned, not built.
4. **No phase scrubber UI in-scene.** The C# scripts (`PhaseScrubberUI`, `NarrativePanel`) exist but aren't wired to in-scene UI elements. The viewer currently shows only phase 0 (initial spawn), not the animation through phases 0→16.
5. **Custom DEM uploaded but not active.** A high-res Libya DEM (`libya_demx5.tif`, 1.78 GB) was uploaded to Cesium ion as **asset 4823305**. It was still processing server-side at handover, so `CesiumSceneSetup.cs` currently points at Cesium World Terrain (asset 1). To switch: change `ionAssetID` from `1L` to `4823305L` in `CesiumSceneSetup.cs` once the asset finishes processing in the Cesium ion dashboard.

### Diagnostic tools (use these instead of clicking Play repeatedly)
- `WarGameVisualization/Assets/Scripts/Editor/VisualDiagnostic.cs` — run headless, dumps every unit's world position + renders a screenshot to `/tmp/wargame_viewer_latest.png`. Invoke:
  ```bash
  /Applications/Unity/Hub/Editor/6000.3.16f1/Unity.app/Contents/MacOS/Unity \
    -batchmode -projectPath WarGameVisualization \
    -executeMethod WarGameViz.VisualDiagnostic.Run -quit
  ```
- `PlayModeSmokeTest.cs` — verifies the orchestrator loads the run + spawns units headlessly.

---

## 6. The deployment story (important context)

This runs across **three machines**, increasingly locked-down:
1. **This Mac** — development. Internet on. Where everything was built.
2. **A Linux laptop** — online first (to set up via Claude), then internet removed and tested offline.
3. **An air-gapped machine** — fully off-grid, final target.

The smart-search system is already on machine 2 and headed to machine 3. The `_archive/handoff_packs/Linux_Handoff/` folder contains the full step-by-step for getting WarGamingGEN + SmartSearch running on Linux (transfer manifest, Qdrant/Ollama setup, run instructions, troubleshooting). Those docs use the path `~/wargame/...` and the original `DecisionMakingSteps_TRANSFER` name — they describe the *Linux* layout, not this Mac, so don't be confused by the naming difference.

For a fully offline LLM (no OpenAI), the plan is **Qwen 2.5 32B** (or Qwen3 MoE) via Ollama/LM Studio. The LLM client already supports swapping endpoints via `.env` (`LLM_BASE_URL`, `LLM_MODEL`, `LLM_USE_RESPONSES_API=0` for local chat-completions models).

---

## 7. What's in _archive/

Nothing here is needed to run the project. It's kept for reference.

```
_archive/
├── apik.rtf                      ← the OpenAI API key (also already in both .env files)
├── old_wargames/
│   ├── WarGamingClaude3/         ← the ORIGINAL hand-built Claude3 wargame (the quality benchmark we
│   │                                measured the automated system against). Pre-dates WarGamingGEN.
│   └── Wargame1/                 ← an even earlier prototype.
├── source_data/                  ← raw originals (already copied into the projects' inputs/):
│   ├── geo/ (2.7 GB)             ← GIS source data + the DEM
│   ├── info/                     ← OOB source docx
│   ├── Doctrines/, WarReferences/ ← doctrine corpus masters
│   ├── enemy.docx, nato-map-layers.geojson
└── handoff_packs/
    ├── Linux_Handoff/            ← how to deploy on Linux (machine 2/3)
    ├── GeoJSON_Schema_Pack/      ← formal GeoJSON schema + docs for the external viz-app colleague
    ├── geojson_edits/            ← the GeoJSON v2 writer change-set + docs
    └── latestgeojson/            ← a copy of the latest run's GeoJSON output
```

> **The API key in `apik.rtf` is live.** Rotate it if this project leaves your control. It's already embedded in `WarGamingGEN/.env` and `SmartSearch/.env`.

---

## 8. Standing rules / gotchas (learned the hard way)

1. **Never modify code inside `SmartSearch/`.** Only `.env` and `inputs/doctrine/`. It must stay byte-identical to the offline deployment.
2. **No fake/forced numbers in the wargame.** The LLM proposes actions and narrates; the Python `force_model.py` computes every number. Injecting real engine/doctrine data is fine; hardcoded magic numbers are not. This was a hard quality bar.
3. **Run outputs are versioned, never overwritten.** Each `tests/test_full_run.py` makes a new `runs/<timestamp>/`. Don't add code that writes into a fixed dir.
4. **Python venvs do not transfer between machines.** Rebuild them. (The rename of DMS→SmartSearch left the Mac `venv_mac` technically working when called by absolute path, but treat venvs as disposable.)
5. **Unity placeholder vs real models:** at AO-overview altitude (~80 km) a real 150 m ship is sub-pixel. Any viz work needs a visible marker layer separate from the detailed model.
6. **Cesium for Unity must be the tarball release, not the git URL.** The git version is missing a prebuilt native binary (`Reinterop.dll`) and throws ~380 compile errors. We use `Packages/cesium-unity-1.23.2/` installed via `file:` in the manifest. Don't "upgrade" it to the git URL.

---

## 9. Suggested first steps for you

1. Read `WarGamingGEN/README.md` (the offline-edit map is gold).
2. Build the venv, start Qdrant + embedder, run `python tests/test_full_run.py --max-phases 3`. Confirm you get a 3-phase run with outputs. That proves the whole GEN + SmartSearch chain works for you.
3. Open `runs/latest/outputs/wargame_report.md` to see what the system produces.
4. If continuing the Unity viewer: tackle the §5 issues in order (1: Play-mode tile streaming, 2: real models + markers, 3: camera controls, 4: phase scrubber). Use `VisualDiagnostic.cs` to test headlessly instead of clicking Play repeatedly.

Good luck. The generator is solid and is the valuable core; the visualization is the open frontier.
