# Ubuntu 22.04 LTS Deployment Shadow

> **Purpose.** The project is developed on macOS (Apple Silicon M4) but the **final
> deployment target is Ubuntu Linux 22.04 LTS**. Every decision we make for
> macOS must "shadow" into what it looks like on Ubuntu, so the move over is a
> config/package swap, never a code rewrite.
>
> **Last updated: 2026-04-22 (Phase 2 retrieval implemented on `main`; reranker EP rows, Streamlit UI row, LibreOffice normalization row, and external doctrine termbase row added to §2 below; §5 reranker-EP "open" entry resolved.)**

This file is a living ledger. Each time a new decision is made for the macOS
development environment, add the corresponding Ubuntu row so nothing is
forgotten at deployment time.

---

## 1. Guiding Principles

1. **All configuration in `.env`.** No hardcoded hosts, ports, paths, API keys,
   device flags, or execution providers in Python source. The switch between
   macOS-dev and Ubuntu-prod is a `.env` swap, not a code edit.
2. **Same Python source on both platforms.** No `if platform.system() == "Darwin"`
   branching in business logic — only in low-level init helpers (e.g. ONNX
   provider selection). Keep those helpers in one dedicated module.
3. **Versions pinned identically.** Python 3.12.13, Docling 2.89, FastEmbed 0.8,
   qdrant-client 1.17, Qdrant server 1.17. Both platforms pull the same pins.
4. **Reproducible install.** `requirements.txt` is the source of truth.
   Platform-specific packages (`fastembed` vs `fastembed-gpu`) go into
   `requirements.macos.txt` and `requirements.ubuntu.txt` extras.
5. **Docker image is the deployment unit on Ubuntu.** The image pre-bakes the
   bge-m3 weights (~2.3 GB) so cold starts don't stall on model download.

---

## 2. Component Shadow Table

| Layer | macOS (M4 dev) | Ubuntu 22.04 LTS (prod) | Porting note |
|---|---|---|---|
| Python | 3.12.13 (Homebrew) | 3.12.x (deadsnakes PPA or pyenv) | Pin to 3.12.13 for byte-for-byte parity |
| Virtualenv | `venv/` via `python3.12 -m venv` | same, or container-native | Keep out of git either way (`.gitignore`) |
| Package set | `requirements.txt` + `requirements.macos.txt` | `requirements.txt` + `requirements.ubuntu.txt` | `fastembed` vs `fastembed-gpu` is the main diff |
| Docker runtime | colima 0.10.1 + docker CLI 29.4.0 | native `docker.io` or Docker Engine from Docker's apt repo | Same `docker run` commands; colima → bare docker |
| Qdrant server | Docker container `qdrant/qdrant:latest` (1.17) on `localhost:6333` | same image, same port — typically behind a private-network reverse proxy | Storage volume moves from `qdrant_storage` (colima) to a host bind-mount on prod |
| Qdrant URL | `http://localhost:6333` (via `QDRANT_URL` in `.env`) | `http://qdrant:6333` inside Docker network, or an internal DNS name | Read from `.env` — never hardcode |
| Docling parser accel | `AcceleratorDevice.MPS` (Apple GPU for layout + TableFormer) | `AcceleratorDevice.CUDA` on GPU boxes; `AcceleratorDevice.CPU` on CPU-only | Config flag in `.env`: `DOCLING_DEVICE=auto` → helper resolves |
| FastEmbed dense (bge-m3) | `fastembed==0.8.0`, CPU ONNX EP only (CoreML EP not viable) | `fastembed-gpu==0.8.0` with `providers=["CUDAExecutionProvider","CPUExecutionProvider"]` | One helper `get_embedder()` reads `.env` and picks providers |
| FastEmbed BM25 | CPU (always) | CPU (always) | Identical — sparse is free either way |
| CUDA / cuDNN | n/a | CUDA 12.x + cuDNN 9.x installed from NVIDIA apt repos **before** `pip install fastembed-gpu` | Dockerfile base image: `nvidia/cuda:12.x-cudnn9-runtime-ubuntu22.04` |
| OCR engine | `OcrAutoOptions` → `OcrMac` (native Vision) default | `OcrAutoOptions` → `EasyOCR` default fallback. Tesseract CLI still used for per-page escalation | Install `tesseract-ocr` + `tesseract-ocr-*` language packs via `apt` on Ubuntu |
| Tesseract CLI | `brew install tesseract tesseract-lang` | `apt install tesseract-ocr tesseract-ocr-eng tesseract-ocr-osd ...` | Both expose `tesseract` on PATH; Docling's `TesseractCliOcrOptions` is unchanged |
| Model cache | `~/.cache/fastembed/` | bake into Docker image layer OR mount a persistent volume at `/root/.cache/fastembed/` | Cold-start hazard — see §4 |
| Env vars | `.env` in project root | same `.env` format, **different values** (URLs, device flags) | `.env` template lives inline as comments in `.env` itself; real `.env` stays gitignored |
| LLM (OpenAI) | `OPENAI_API_KEY` in `.env` | same | No infra change; only cloud dependency |
| Upstream cache | `FORCE_REPARSE=0` in `.env` (cache active); `output/<stem>/.stage_fingerprints.json` sidecars | same | Purely on-disk JSON — fully portable. Persist `output/` across runs on prod to keep the cache warm. |
| Per-doc gate artefacts | `output/not_enough/<slug>/<stem>/` | same | Review bundle survives redeploy; portable JSON + markdown. |
| Phase 2 reranker (bge-reranker-v2-m3) | `fastembed==0.8.0`, `RERANKER_PROVIDERS=CPUExecutionProvider`; model cached under `~/.cache/fastembed/` (~560 MB). Import: `from fastembed.rerank.cross_encoder import TextCrossEncoder`. | `fastembed-gpu==0.8.0`, `RERANKER_PROVIDERS=CUDAExecutionProvider,CPUExecutionProvider` under CUDA 12.x + cuDNN 9.x (same stack as dense bge-m3). Bake the model into the Docker image layer. | One env var flip. Cold-start ~1 GB download on first use — mitigate with image-layer bake (prod) or `start.sh`-equivalent pre-warm (dev). `mogolloni/bge-reranker-v2-m3-onnx` HF file layout is `onnx/model.onnx` + `onnx/model.onnx_data` (single underscore — distinct from `aapot/bge-m3-onnx`'s dot separator). |
| Phase 2 reranker fallback | not wired (documented in `graph/retrieval/rerank.py`) | same | If custom-model registration regresses (e.g. FastEmbed bump or `mogolloni` takedown), swap to `BAAI/bge-reranker-base` (1.04 GB, ships natively in FastEmbed 0.8.0). Same `.rerank()` surface; no `add_custom_model` call. |
| Phase 2 HyDE LLM | `QUERY_EXPAND_HYDE=off` by default; when on, `QUERY_EXPAND_LLM_MODEL=gpt-4o-mini` via `graph.shared.llm._get_llm()` | same | Identical — HyDE is a cloud LLM round-trip either way. Default remains OFF in prod until eval proves it helps. |
| Phase 2 Streamlit dev UI | `streamlit run ui/app.py` on `STREAMLIT_PORT=8501`; **local-only dev tool, not a deployed surface** | NOT deployed. Internal devs can `ssh -L 8501:localhost:8501 <host>` if they need to poke a prod-shaped collection; no public HTTP surface. | UI is a dev aid. Prod-facing retrieval (if ever built) is a future FastAPI wrapper around `graph/retrieval/search.py::search()` — not shipped yet. |
| Phase 2 harvested feedback | `output/_eval/feedback.jsonl` (gitignored) | same — persist across redeploy via bind-mount | Portable JSONL. Grows on every 👍/👎 click. Used for precision@k A/B, NOT Recall@k. |
| Phase 2 doctrine termbase | `data/doctrine/{acronyms.csv, classification_markings.txt, cross_ref_prefixes.txt}` (committed) | same — committed files are identical across platforms | Hand-editable; `graph/doctrine_vocab.py` loads once per process; edits to `acronyms.csv` take effect at query time via `graph/retrieval/glossary.py` (no re-ingest needed). |
| Phase 2 eval seed files | `data/eval/cross_ref_prefixes_unseen.txt` (committed placeholder; UI auto-appends); `data/eval/gold_queries.jsonl` (not yet authored) | same | Portable text/JSONL. `gold_queries.jsonl` is a future deliverable consumed by `scripts/eval_retrieval.py` (also not yet written). |
| Intake normalization (legacy Office) | `/Applications/LibreOffice.app/Contents/MacOS/soffice` (installer or `brew install --cask libreoffice`) | `apt install libreoffice` | Headless `soffice --headless --convert-to ...` on both. Supported-extension list is centralized; failure is skip-and-log into `ingestion_errors` with `stage=intake_normalization`. |
| One-command bring-up | `./start.sh` (colima + qdrant + ingest + UI) | Typically a systemd unit or container orchestrator invoking `python main.py` and an optional UI port-forward; `start.sh` itself is dev-oriented | The bring-up steps generalise; only the service wrapper differs. |

---

## 3. Concrete Porting Checklist

When moving the project to Ubuntu 22.04 LTS, these are the ONLY steps:

1. Install system prerequisites:
   ```bash
   sudo apt update
   sudo apt install -y python3.12 python3.12-venv tesseract-ocr \
                       tesseract-ocr-eng tesseract-ocr-osd \
                       docker.io
   # For GPU boxes only:
   sudo apt install -y cuda-toolkit-12-x cudnn9
   ```
2. Clone the repo, create venv, install deps:
   ```bash
   git clone <repo> && cd DecisionMakingSteps
   python3.12 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   pip install -r requirements.ubuntu.txt    # fastembed-gpu, platform extras
   ```
3. Create `.env` (copy the commented template from the macOS `.env`) and set the Ubuntu-specific values:
   ```
   # Phase 1 (ingestion)
   QDRANT_URL=http://qdrant:6333
   DOCLING_DEVICE=cuda                      # or cpu
   EMBEDDER_PROVIDERS=CUDAExecutionProvider,CPUExecutionProvider
   OPENAI_API_KEY=<same-key>

   # Phase 2 (retrieval) — see referencedocs/17_phase2_retrieval.md §10.4
   RERANK_MODEL=BAAI/bge-reranker-v2-m3
   RERANK_MODEL_SOURCE=mogolloni/bge-reranker-v2-m3-onnx
   RERANKER_PROVIDERS=CUDAExecutionProvider,CPUExecutionProvider
   RERANK_TOP_N_IN=50
   RERANK_TOP_K_OUT=8
   HYBRID_DENSE_PREFETCH=50
   HYBRID_SPARSE_PREFETCH=50
   QUERY_EXPAND_ACRONYMS=on
   QUERY_EXPAND_HYDE=off                    # experimental — default OFF
   QUERY_EXPAND_LLM_MODEL=gpt-4o-mini       # only used if HyDE is on
   QUERY_EXPAND_HYDE_MAX_TOKENS=256
   HYDE_DOMAIN=military doctrine
   STREAMLIT_PORT=8501                      # local dev only; not exposed on prod
   EVAL_FEEDBACK_PATH=output/_eval/feedback.jsonl
   ```
4. Run Qdrant:
   ```bash
   docker run -d --name qdrant --network host \
     -v /srv/qdrant_storage:/qdrant/storage \
     qdrant/qdrant:1.17.1
   ```
5. Pre-warm model caches (optional but recommended — bake into image layer on prod):
   ```bash
   # Dense embedder (~2.3 GB)
   python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-m3')"

   # Phase 2 cross-encoder reranker (~560 MB)
   python -c "from graph.retrieval.rerank import _get_reranker; _get_reranker()"
   ```
6. Install LibreOffice for legacy Office intake (`.doc`, `.rtf`, `.xls`, `.xlsx`, `.ppt`, `.pptx`, `.odt`):
   ```bash
   sudo apt install -y libreoffice
   ```
7. Run `python main.py` — should behave identically to macOS dev. End-to-end retrieval health check:
   ```bash
   python scripts/retrieval_smoke_test.py --collection ingest__<slug>__bgem3
   ```
8. Phase 2 UI (dev only; skip on prod unless you have reason):
   ```bash
   streamlit run ui/app.py --server.port "$STREAMLIT_PORT"
   ```

If any of those steps required a *code* change, the code has drifted from
"platform-agnostic with env-driven config" — fix the drift, don't paper over it.

---

## 4. Known Landmines

- **FastEmbed CPU/GPU packages collide.** `fastembed` and `fastembed-gpu` ship
  different ONNX Runtime deps. Never have both in the same venv. Use one per
  platform; installer scripts / Dockerfile pick exactly one.
- **bge-m3 cold download is ~2.3 GB.** On Ubuntu, bake this into the Docker
  image layer so first request doesn't time out the caller.
- **CoreML EP is NOT used on macOS.** Community `onnxruntime-silicon` isn't in
  FastEmbed's test matrix and XLM-RoBERTa ops fall back silently. M4 dev runs
  CPU ORT — fine for dev-scale corpora. Don't pretend it's accelerated.
- **TensorRT EP is NOT used on Ubuntu.** CUDA EP is the supported path for
  bge-m3 under FastEmbed 0.8. TRT EP has dynamic-shape issues with this model.
- **Tesseract language packs must match `TesseractCliOcrOptions(lang=[...])`.**
  `lang=["auto"]` requires `tesseract-ocr-osd`; named langs require their
  specific packs. The macOS `brew install tesseract-lang` bundles everything;
  on Ubuntu `apt` ships one `tesseract-ocr-<iso>` package per language.
- **Colima storage ≠ host storage.** On macOS, Qdrant's Docker volume lives
  inside the colima VM. On Ubuntu, it lives on the host. If you ever copy the
  Qdrant volume between boxes, account for that.
- **Docling MPS → CUDA isn't free.** Layout and TableFormer models load
  differently; `AcceleratorDevice.AUTO` is recommended so Docling picks the
  right backend per platform.

---

## 5. What Still Needs a Shadow (open)

Fill these in as decisions are made:

- [ ] Exact reverse-proxy / auth layer in front of Qdrant on Ubuntu (none on
      macOS; prod needs at least network ACLs).
- [ ] Logging backend (stdout on dev; journald or ELK on prod — whatever the
      deployment host uses).
- [ ] Process supervisor (none on dev; `systemd` or container orchestrator on
      prod).
- [ ] Monitoring / health-check endpoints. **Deferred beyond Phase 2** —
      Phase 2 ships a local Streamlit dev UI only (not deployed to prod).
      A `/healthz` endpoint will be added when/if a FastAPI prod wrapper
      is later built around `graph/retrieval/search.py::search()`. Until
      then, `scripts/retrieval_smoke_test.py` is the read-only health
      probe.
- [x] Reranker execution-provider shadow rows — **resolved 2026-04-22**.
      Added to §2 above after R1/R2 spikes confirmed the FastEmbed
      `TextCrossEncoder` + `mogolloni/bge-reranker-v2-m3-onnx` path
      works under pinned `fastembed==0.8.0`.
- [ ] Secret management (`.env` on dev; secrets manager or bind-mounted file
      on prod — do NOT commit `.env` to the prod box). Also scope:
      `OPENAI_API_KEY` is used by both Phase 1 (`check_documents` gate)
      and Phase 2 (optional `hyde.py`); the same key covers both.

---

## 6. Cross-References

- Hardware-specific acceleration notes: [`referencedocs/08_apple_silicon_mps_setup.md`](../referencedocs/08_apple_silicon_mps_setup.md)
- Portability notes (broader than just Ubuntu): [`transferOS.md`](transferOS.md)
- Locked decisions and version pins: [`memory.md`](memory.md)
- Pipeline walkthrough: [`walkthrough.md`](walkthrough.md)
