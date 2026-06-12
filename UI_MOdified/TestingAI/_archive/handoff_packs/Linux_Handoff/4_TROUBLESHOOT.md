# 4. Troubleshooting — common Linux issues

Organized by where the failure manifests.

## Transfer issues

### "Permission denied" on rsync from Mac

Enable Remote Login on Mac:
- **System Settings → General → Sharing → Remote Login** → on
- Verify your user is allowed under the user list

Also check the Mac firewall isn't blocking ssh (port 22).

### `rsync` says "command not found" on Mac

```bash
brew install rsync          # if you have Homebrew
# Or use the bundled BSD rsync (slower but works):
which rsync                 # should print /usr/bin/rsync
```

## Python / venv issues

### `python3.12: command not found`

Ubuntu 22.04 has 3.10 by default. Either use that or add deadsnakes PPA:

```bash
sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt update
sudo apt install python3.12 python3.12-venv python3.12-dev
```

For Debian without deadsnakes, falling back to `python3.11` or `python3.10` should work — the code is 3.10+ compatible.

### `pip install` fails with C compile errors

Make sure build tools are installed:

```bash
sudo apt install build-essential python3.12-dev libxml2-dev libxslt-dev libffi-dev
```

For ML-heavy deps (e.g. torch, onnxruntime):
- CPU-only is fine for the wargame (the heavy lifting is the LLM, not local inference)
- If you accidentally pull a CUDA build, swap to CPU: `pip install --force-reinstall torch --index-url https://download.pytorch.org/whl/cpu`

### "ModuleNotFoundError: graph" when running wargame

The wargame imports DMS via `sys.path` injection driven by `SMART_SEARCH_REPO_PATH`. If you see this:

```bash
# Verify in WGG/.env:
grep SMART_SEARCH_REPO_PATH ~/wargame/WarGameGenerator/.env
# Must be an absolute path, no trailing slash, pointing at the DMS folder
```

Common typo: `~/wargame/...` doesn't expand in `.env` files. Use `/home/<your_user>/wargame/DecisionMakingSteps_TRANSFER` instead.

### `langgraph` won't import

```bash
pip install --upgrade langgraph langchain
```

If on Python 3.10, you may need slightly older versions. Check `requirements.txt` in DMS for pins.

## Qdrant issues

### `docker compose up` says permission denied

You forgot to add yourself to the docker group:

```bash
sudo usermod -aG docker $USER
newgrp docker      # or log out + back in
```

### Port 6333 already in use

```bash
sudo ss -tlnp | grep 6333    # find what's using it
# If it's an old Qdrant, stop it:
docker stop $(docker ps -q --filter "publish=6333")
```

Or change the host port in `docker-compose.yml`:
```yaml
ports:
  - "6334:6333"           # host:container — host now 6334
```
Then update `QDRANT_URL=http://localhost:6334` in `.env`.

### Qdrant returns 404 for the collection

The ingestion step didn't run, or it created a different-named collection. Check what's actually there:

```bash
curl http://localhost:6333/collections
```

If `ingest__doctrine__bgem3` is missing but you see something like `doctrine` instead, your DMS version uses a different naming convention. Update `QDRANT_COLLECTION` in `.env` and `SMART_SEARCH_COLLECTION` in WGG's `.env` to match.

## Embedder issues

### Ollama: "model not found"

```bash
ollama list                  # see what's actually loaded
ollama pull bge-m3           # re-pull if missing
```

Note: bge-m3 in Ollama may be tagged differently — check `ollama search bge` for actual model IDs.

### Ollama /v1/embeddings returns "method not allowed"

Older Ollama versions (<0.4) didn't have the OpenAI-compatible endpoint. Upgrade:

```bash
curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl restart ollama
ollama --version              # should be ≥ 0.4.0
```

### Embedder returns wrong-dim vectors (causes Qdrant errors during ingestion)

bge-m3 must return 1024-dim vectors. If you accidentally configured a different model (e.g. nomic-embed-text returns 768-dim), update `.env`:

```dotenv
EMBED_DIM=1024
EMBED_MODEL=bge-m3
```

And re-create the Qdrant collection (delete + ingest fresh).

## LLM issues

### "OpenAI APIError 401 — Invalid API key"

```bash
# Read the key from apik.rtf (strip the RTF formatting):
grep -oE 'sk-proj-[A-Za-z0-9_\-]+' ~/wargame/apik.rtf
```

Paste that into `.env`'s `LLM_API_KEY=`.

If you've rotated the key in OpenAI's dashboard, the old one won't work — generate a new one.

### Local Qwen runs out of memory

```bash
free -h                       # check available RAM
nvidia-smi                    # check VRAM if GPU
```

Q4_K_M Qwen 32B needs ~22 GB. Options:
- Drop to Q3_K (smaller, slightly worse quality): `ollama pull qwen2.5:32b-instruct-q3_K_M`
- Drop to 14B: `ollama pull qwen2.5:14b-instruct`
- Use cloud (OpenAI) — much faster, $2.40 per full run

### Local LLM: "method not allowed" on /v1/chat/completions

Ollama versions before 0.4 didn't have OpenAI-compatible chat. Upgrade.
Also: set `LLM_USE_RESPONSES_API=0` in `.env` for local models — they don't support OpenAI's Responses API, only Chat Completions.

## Wargame runtime issues

### "LLM output failed schema validation after 3 attempts"

The LLM is being stubborn on a UID hallucination or empty-components issue. Common with small/quantized local LLMs.

1. Try a larger model (32B+ recommended over 14B)
2. Check the audit logs to see what the LLM is repeatedly emitting:
   ```bash
   ls -lt runs/latest/llm_audit/*.json | head -10
   cat runs/latest/llm_audit/<most-recent>.json | python -m json.tool | less
   ```
3. Resume with `--resume` — sometimes a fresh sample succeeds

### Run crashes with `KeyError: 'side'` or similar Pydantic errors

You're on a stale checkpoint format (from before a schema update). Delete the run dir and start fresh:

```bash
rm -rf ~/wargame/WarGameGenerator/runs/<that-run-dir>
python tests/test_full_run.py --all       # starts fresh in a new timestamped dir
```

### CSV/MD/GeoJSON outputs not produced even though run finished

Quality-checks failure can short-circuit the writer. Force-write:

```bash
# Manually run just the writer logic:
python -c "
from pathlib import Path
from tests.test_full_run import _restore_checkpoints
from src.parsers.scenario_parser import load_scenario
from src.parsers.docx_parser import parse_docx_oob
from src.parsers.gis_loader import load_gis
from src.state.world_state import build_world_state_from_inputs
from src.state.force_model import ForceModel
from src.output.csv_schedule import write_schedule_csv
from src.output.markdown_report import write_markdown_report
from src.output.geojson_writer import write_phase_geojsons

run = Path('runs/latest')
scenario = load_scenario(Path('inputs/scenario.json'))
red = parse_docx_oob(Path('inputs/forces/red_team.docx'), 'RED')
blue = parse_docx_oob(Path('inputs/forces/blue_team.docx'), 'BLUE')
gis = load_gis(Path('inputs/gis'), tuple(scenario.bbox_wgs84))
world = build_world_state_from_inputs(scenario, red, blue, gis)
fm = ForceModel()
records, _ = _restore_checkpoints(run, world, fm)
out = run / 'outputs'; out.mkdir(exist_ok=True)
write_schedule_csv(records, out / 'wargameschedule.csv')
write_markdown_report(records, out / 'wargame_report.md', scenario.operation_name)
write_phase_geojsons(records, world, scenario, out / 'geojson')
print(f'wrote outputs to {out}')
"
```

## Performance tuning

### Qwen 2.5 32B is too slow on CPU

If wall clock per phase is >5 min on local CPU, options:
- Use a GPU build of Ollama (nvidia-container-toolkit)
- Switch to Qwen 14B (smaller, faster, slightly worse outputs)
- Run on cloud LLM (OpenAI ~$2.40 total for the full run)

### Ingestion is slow

bge-m3 on CPU does ~10-30 embeddings/sec. For ~300 chunks: ~10-30 sec total. If it takes >5 min, your embedder is misconfigured (probably running on CPU when GPU is available, or the wrong model).

## Where to get help

- **Mac-side codebase has comprehensive READMEs**: `WarGameGenerator/README.md` is ~150 lines of offline-edit map and architecture
- **DMS-side docs**: `DecisionMakingSteps_TRANSFER/CLAUDE.md`, `AGENTS.md`, `OFFLINE_RUNBOOK.md` document the smart-search internals
- **Audit dirs**: every LLM call is logged at `runs/<dir>/llm_audit/*.json` — best way to debug "why did the LLM say X?"

If you're stuck on a specific error, paste the **first** stack trace line (not the wrapping RuntimeError) into Claude. The first failure is usually the real cause.
