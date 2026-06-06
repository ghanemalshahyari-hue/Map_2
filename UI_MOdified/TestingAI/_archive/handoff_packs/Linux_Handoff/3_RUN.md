# 3. Run — ingest doctrine + execute the wargame

Assumes `2_SETUP.md` is complete: Python venv, Qdrant, embedder, LLM, both `.env` files all configured.

## 3.1 Ingest the doctrine corpus

The smart-search system needs the doctrine corpus loaded into Qdrant before any LLM call can retrieve from it.

```bash
cd ~/wargame/DecisionMakingSteps_TRANSFER
source venv_linux/bin/activate

# Check that the corpus files exist on disk
# (the doctrine corpus lives under DMS, NOT under WGG)
ls -la inputs/doctrine/    # should show Doctrines.md, WarReferences.md, possibly others

# Run the ingestion script (exact command depends on DMS version; check their CLAUDE.md/AGENTS.md)
python -m graph.scripts.ingest_doctrine
# OR (if that doesn't exist, check)
ls graph/scripts/
# Common alternatives:
#   python scripts/ingest.py
#   python main.py --ingest
#   bash start.sh ingest
```

This takes 1-5 min depending on corpus size + embedder speed (Ollama on CPU is slower than GPU).

### Verify ingestion

```bash
# Check Qdrant now has the collection populated
curl http://localhost:6333/collections/ingest__doctrine__bgem3 | python -m json.tool
# Look for "vectors_count": > 0
```

You should see something like `"vectors_count": 200-500` depending on how many chunks the corpus produced.

If you get `404` or `vectors_count: 0`, ingestion didn't run. Re-check the script name in `DecisionMakingSteps_TRANSFER/CLAUDE.md` or `AGENTS.md`.

## 3.2 Smoke test the retrieval

```bash
cd ~/wargame/WarGameGenerator
python -m src.retrieval.smart_search_client    # built-in smoke test
```

Expected output:
```
[smart-search] querying: 'amphibious operation preparation'
  → returned N chunks
  chunk[0]: ... text snippet ...
```

If 0 chunks returned, retrieval isn't connecting. Check:
- DMS `.env` `EMBED_BASE_URL` matches what your embedder is serving on
- Qdrant has data (verify step 3.1)
- `SMART_SEARCH_REPO_PATH` points to the DMS dir

## 3.3 Run a 3-phase smoke

```bash
cd ~/wargame/WarGameGenerator
python tests/test_full_run.py --max-phases 3
```

This costs roughly:
- **$0.45** on GPT-4o cloud
- **$0** with local Qwen (but slower — ~3-5 min per phase, so ~15 min total)

Expected console output: 3 phases run, world snapshots printed, **11/11 quality checks pass** at the end.

If any phase fails with a schema validation error after 3 retries, paste the error to Claude — it usually means:
- LLM is hallucinating UIDs that aren't in the OOB (the strict UID validator catches this)
- LLM is returning empty components when it should hold (the all-null validator catches this)

Both validators retry-with-feedback automatically. Persistent failures suggest the LLM is too small (try a larger Qwen).

## 3.4 Full 17-phase run

```bash
cd ~/wargame/WarGameGenerator
python tests/test_full_run.py --all
```

Cost:
- **~$2.40** on GPT-4o cloud (wall clock ~16 min)
- **$0** with Qwen 2.5 32B (wall clock ~45-90 min depending on hardware)

Output goes to `runs/<timestamp>_<optional_name>/`:
```
runs/
├── 2026-MM-DD_HH-MM-SS/
│   ├── checkpoints/phase00.json … phase16.json
│   ├── llm_audit/                              (every LLM call recorded)
│   ├── outputs/
│   │   ├── wargameschedule.csv                 (~112 rows)
│   │   ├── wargame_report.md                   (~130 KB)
│   │   └── geojson/
│   │       ├── step00.geojson … step16.geojson
│   │       └── all_phases.geojson
│   └── run_index.json
└── latest -> 2026-MM-DD_HH-MM-SS/              (symlink to most recent)
```

### Resume a crashed run

If the LLM hits a hard validation failure mid-run (rare), checkpoints are saved. Resume:

```bash
python tests/test_full_run.py --all --resume
```

This picks up from the latest checkpoint in `runs/latest/`.

### Run with a custom name (useful for comparing models)

```bash
python tests/test_full_run.py --all --run-name qwen32b
# Creates runs/<timestamp>_qwen32b/

python tests/test_full_run.py --all --run-name gpt4o
# Creates runs/<timestamp>_gpt4o/
```

This is useful for A/B testing — run the same scenario with different LLMs and compare outputs.

## 3.5 Verify final outputs

```bash
cd ~/wargame/WarGameGenerator/runs/latest

# CSV — should have ~112 rows for a 17-phase run
wc -l outputs/wargameschedule.csv

# Markdown — should be 100-150 KB
ls -la outputs/wargame_report.md

# GeoJSON — should have 17 step files + 1 combined
ls outputs/geojson/

# Index summary
cat run_index.json | python -m json.tool | head -20

# Quality checks count — last lines of the run log show 11/11 if it's a clean run
# (these print at end of test_full_run.py; if you want to re-verify, run again)
```

If all of the above check out, the pipeline is fully operational on Linux.

## 3.6 What the outputs mean (quick recap)

- **`wargameschedule.csv`** — one row per (phase, active component). Machine-readable for downstream tools.
- **`wargame_report.md`** — human-readable narrative report with executive summary, force-ratio progression table, per-phase sections, unit outcomes, final state.
- **`geojson/stepNN.geojson`** — per-phase geographic data: affected units, actors, objective marker, phase line. Consumed later by the Unity 3D viz (out of scope for this handoff).
- **`checkpoints/phaseNN.json`** — full per-phase records (Red action, Blue reaction, adjudicator resolution, metrics). Used for resuming runs and feeding the viz.
- **`llm_audit/*.json`** — every LLM call's prompt + response. Useful for debugging quality issues.

## 3.7 Iteration loop

Want to tweak something? Common workflow:

| Want to change | Edit | Then rerun |
|---|---|---|
| Force-ratio thresholds | `inputs/scenario.json` | `tests/test_full_run.py --all` |
| Doctrine corpus | `inputs/doctrine/*.md` | Re-ingest via DMS script, then rerun |
| Agent personas | `src/agents/personas/*.md` | rerun |
| LLM model | `.env` `LLM_MODEL` + `LLM_BASE_URL` | rerun |
| Engine math (mines/EW coefficients) | `src/state/force_model.py` | rerun |
| Add a new phase kind | `inputs/scenario.json` + add queries in all 3 agent files | rerun |

See `~/wargame/WarGameGenerator/README.md` for the comprehensive offline-edit map.

Proceed to `4_TROUBLESHOOT.md` for common Linux issues.
