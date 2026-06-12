# NewOffline — transfer bundle for the airgapped machine

Drop this whole folder onto your offline machine (USB stick / external
drive / scp). It contains everything you need:

```
NewOffline/
├── README.md             ← this file
├── images/
│   ├── dms_app.tar       ← application docker image (~4.4 GB)
│   └── qdrant.tar        ← vector DB image (~190 MB)
└── code/                 ← source tree mounted into dms_app at runtime
    ├── .env              ← edit this (3 vLLM endpoints)
    ├── docker-compose.yml
    ├── Dockerfile        ← reference only; you don't rebuild offline
    ├── main.py
    ├── graph/  scripts/  prompts/  templates/  data/  ui/  utils/
    ├── inputs/operationalfiles/   ← drop your PDFs / .md / .docx here
    ├── inputs/doctrine/           ← (empty unless you ingest doctrine PDFs)
    ├── output/                    ← per-doc artefacts written here
    └── output_docs/               ← generated .docx written here
```

Total bundle size: **~4.5 GB** (4.4 GB images + ~3 MB code).

---

## What you need on the offline machine

Just **Docker**.  Nothing else.  The dms_app image bakes in Python + every
dependency + Docling layout models + the bge-m3 tokenizer.  You don't run
`pip install`, you don't run `apt install python3-anything`.

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-plugin
sudo usermod -aG docker $USER          # then logout/login
docker --version && docker compose version
```

---

## One-time setup (do once on the offline machine)

```bash
# 1. Move this folder somewhere stable.
mv NewOffline ~/dms && cd ~/dms

# 2. Load the docker images.
docker load -i images/dms_app.tar      # ~30-90 sec
docker load -i images/qdrant.tar       # ~5 sec
docker images | grep -E "dms_app|qdrant"
# Expected:
#   dms_app          latest    ...   ~13 GB on disk
#   qdrant/qdrant    latest    ...   ~285 MB on disk

# 3. Edit code/.env — fill in your three vLLM endpoints + API keys.
cd code
nano .env       # or vi, or any editor
```

The `.env` is heavily commented; the only required edits are the four
URLs, four API keys, and four model ids.  Defaults for everything else
already work.

---

## Daily use

```bash
cd ~/dms/code

# 1. Drop your source documents.
cp /path/to/your/*.pdf inputs/operationalfiles/

# 2. Start qdrant (once; restarts automatically afterwards).
docker compose up -d qdrant

# 3. Ingest.
docker compose run --rm app python main.py

# 4. Generate the four MDMP documents.
docker compose run --rm app python scripts/generate_documents.py \
  --warning-order data/phase3_prompt_2.example.txt \
  --intel-report  data/phase3_prompt_3.example.txt \
  --source-file   other=data/phase3_prompt_1.example.txt \
  --docs time_analysis initial_planning_guidance staff_brief warning_order \
  --out output_docs/

# 5. (Optional) Streamlit UI on http://localhost:8501.
docker compose up app
```

---

## Sanity-probe before you ingest

If something fails, run these from inside the dms_app container — they
verify each model endpoint is reachable and behaving correctly.  Each
should produce real output; if any fails, your `.env` URL/model id/api
key for that endpoint is wrong (or the endpoint is unreachable).

```bash
cd ~/dms/code
docker compose run --rm --no-deps app bash -c '
  echo "=== embedder ==="
  python -m graph.shared.embedders probe "MDMP staff coordination"

  echo "=== reranker ==="
  python -m graph.retrieval.rerank "test query" "relevant document" "irrelevant cat sat on mat"

  echo "=== llm factory ==="
  python -m graph.shared.llm_factory

  echo "=== llm round-trip ==="
  python -c "
import os
from openai import OpenAI
c = OpenAI(base_url=os.environ[\"LLM_BASE_URL\"], api_key=os.environ[\"LLM_API_KEY\"])
r = c.responses.create(model=os.environ[\"LLM_MODEL\"], input=\"reply with single word: ok\", max_output_tokens=512)
print(\"llm responded:\", repr((r.output_text or \"\").strip()[:80]))
"'
```

Expected:
- embedder: `vector dim : 1024`, `vector norm (L2) : 1.000000`
- reranker: `rank 1` is the relevant doc with score near 1.0, the irrelevant one near 0.0
- llm factory: `Responses API : ON (/v1/responses)` + your endpoint tag
- llm round-trip: `llm responded: 'ok'`

---

## Resetting state (clean re-ingest)

```bash
docker compose down -v         # wipes Qdrant volume too
docker run --rm -v "$PWD/output:/o" -v "$PWD/output_docs:/od" busybox \
  sh -c 'rm -rf /o/* /od/*'    # nukes per-doc artefacts (root-owned files)
docker compose up -d qdrant
docker compose run --rm app python main.py
```

---

## What's different vs the previous transfer

The dms_app image is HTTP-only for embedder + reranker.  No `fastembed`
fallback path can fire silently.  If your `.env` is incomplete or has a
typo, the code raises a clear `RuntimeError` naming the missing variable
instead of silently trying to download bge-m3 ONNX from HuggingFace
(which would fail / hang on an airgapped machine).

The only places fastembed still appears in the code:
- `graph/shared/embedders.py::_get_sparse_embedder()` — pure-Python BM25
  algorithm, no model weights, no network.  Runs in-process.

---

## Troubleshooting

| symptom | cause | fix |
|---|---|---|
| `docker: Got permission denied` | user not in docker group | `sudo usermod -aG docker $USER` then logout/login |
| `Cannot connect to the Docker daemon` | docker service not running | `sudo systemctl start docker` |
| `Error response from daemon: pull access denied for dms_app` | image not loaded | `docker load -i images/dms_app.tar` |
| `RuntimeError: HttpDenseEmbedder requires EMBED_BASE_URL` | `.env` missing or empty | edit `code/.env`, fill in `EMBED_BASE_URL` + `EMBED_API_KEY` + `EMBED_MODEL` |
| Connection refused on probe | endpoint URL wrong, or vLLM bound to 127.0.0.1 only | use the LAN IP/hostname, not `localhost`, for vLLM endpoints; or have vLLM bind to `0.0.0.0` |
| Phase 1 gate rejects all docs | gate is MDMP-topical | content must be military doctrine; broaden `graph/prompts.py::SUFFICIENCY_CHECK_PROMPT` if needed |
