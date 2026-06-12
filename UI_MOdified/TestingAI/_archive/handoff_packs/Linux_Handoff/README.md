# Linux Handoff — WarGame Generator + Smart Search

This folder contains everything another Claude instance on a Linux machine needs to bring the **smart-search + wargame generation pipeline** online. Scope is explicitly limited to:

✅ **In scope**
- `DecisionMakingSteps_TRANSFER` — the RAG smart-search system (Qdrant + bge-m3 embedder)
- `WarGameGenerator` — 3-agent (Red/Blue/Adjudicator) wargame orchestrator + Python engine
- Outputs: CSV schedule, Markdown report, per-phase GeoJSON files

❌ **Out of scope** (do NOT bring these over)
- `WarGameViz` — Unity 3D viewer
- `viewer/` (Cesium HTML inside WarGameGenerator)
- 3D models, Cesium plugins, GLB/OBJ assets

## How to use this folder

1. **Read these docs in order**:
   - `1_TRANSFER.md` — which files to copy from Mac to Linux (rsync/scp commands provided)
   - `2_SETUP.md` — Python venv, Qdrant, embedder (Ollama recommended), LLM, .env config
   - `3_RUN.md` — ingest doctrine corpus, run the wargame, verify outputs
   - `4_TROUBLESHOOT.md` — common Linux issues + fixes
   - `5_CHANGES_GEOJSON_V2.md` — **READ THIS** — explains the GeoJSON output format (v2 has full force + movement + engagement arcs; v1 was sparse and is deprecated)

2. **Paste this prompt into Claude on the Linux machine**:
   - See `PROMPT_FOR_CLAUDE.md` — copy that content into a fresh Claude conversation
   - Claude will read the rest of the docs and walk you through

## Quick map of what exists

```
Mac side (current):
/Users/hextechkraken/Desktop/TestingAI/
├── DecisionMakingSteps_TRANSFER/       # 2.2 GB (excluding venvs)  ← transfer
├── WarGameGenerator/                    # ~970 MB                  ← transfer
└── WarGameViz/                          # 100 MB                   ← SKIP (Unity 3D viz)

Linux side (target):
~/wargame/
├── DecisionMakingSteps_TRANSFER/
└── WarGameGenerator/
```

## What you should achieve after following these docs

1. `python tests/test_full_run.py --all` runs end-to-end
2. Produces `runs/<timestamp>/outputs/`:
   - `wargameschedule.csv` (~110 rows, phase × component matrix)
   - `wargame_report.md` (~130 KB, narrative report)
   - `geojson/step00.geojson` … `step16.geojson` (17 per-phase files)
3. Quality checks 11/11 pass

If at the end of the docs you have a `runs/latest/outputs/` with those three things, you're done. The 3D viz layer can be added later from a separate handoff.

## Architecture in 3 sentences

The wargame generator is a Python orchestrator that runs 17 turn-based phases. Each phase invokes 3 LLM agents (Red attacker, Blue defender, neutral Adjudicator) grounded in retrieved doctrine via the smart-search system (Qdrant + bge-m3 embedder). The deterministic Python engine computes force ratios, mines/EW evolution, and unit attrition; the LLMs propose actions and narrate outcomes, but never compute numbers.

For deeper understanding, see the existing READMEs:
- `WarGameGenerator/README.md` (extensive offline-edit map)
- `DecisionMakingSteps_TRANSFER/AGENTS.md` + `CLAUDE.md`
