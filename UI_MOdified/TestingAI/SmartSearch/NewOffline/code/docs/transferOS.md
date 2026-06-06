# transferOS.md — What Changes Across Operating Systems

> Living doc. Updated whenever we introduce anything platform-specific.
> Current primary platform: macOS on Apple Silicon M4. Secondary targets noted.
>
> If you are moving this project to a different machine, read this before
> running anything. Every row below is a thing that will break or need changing.
>
> Last updated: 2026-04-22 (Phase 2 retrieval added — Streamlit UI port,
> reranker ONNX cache, LibreOffice intake dependency, `start.sh` bring-up,
> and `data/doctrine/` termbase portability notes folded into §10 below
> and the summary table).

---

## Summary table

| Concern | macOS (current) | Windows | Linux (x86) | DGX Spark (ARM64 + Blackwell GB10) |
|---|---|---|---|---|
| PyTorch backend | **MPS** | CPU or CUDA | CUDA (NVIDIA) | **CUDA 12.x** — pick `torch` wheel built for `aarch64` + CUDA 12 |
| Accelerator device in Docling | `AcceleratorDevice.MPS` | `AcceleratorDevice.CPU` or `.CUDA` | `.CUDA` | `.CUDA` |
| Python install | `brew install python@3.12` | Python.org installer or `winget install Python.Python.3.12` | `apt install python3.12` / pyenv | Ships with DGX image |
| Python executable path | `/opt/homebrew/bin/python3.12` | `%LOCALAPPDATA%\Programs\Python\Python312\python.exe` | `/usr/bin/python3.12` | `/usr/bin/python3.12` |
| venv activate | `source venv/bin/activate` | `venv\Scripts\activate` (cmd) or `venv\Scripts\Activate.ps1` (PowerShell) | `source venv/bin/activate` | same as Linux |
| Docker runtime | **colima** (headless VM) | **Docker Desktop with WSL2 backend** | native `docker` daemon | native `docker` daemon |
| Docker CLI install | `brew install docker docker-compose` | Docker Desktop bundles CLI | `apt install docker.io` or Docker official repo | same as Linux |
| Docker socket | `/Users/hextechkraken/.colima/default/docker.sock` | Windows named pipe / WSL2 socket | `/var/run/docker.sock` | `/var/run/docker.sock` |
| Qdrant image | `qdrant/qdrant:latest` (arm64 variant auto-pulled) | `qdrant/qdrant:latest` (amd64) | `qdrant/qdrant:latest` (amd64) | `qdrant/qdrant:latest` (arm64) |
| Qdrant volume mount | Docker volume `qdrant_storage` via colima virtiofs | WSL2-mediated bind mount (or named volume) | native bind mount | native bind mount |
| Homebrew equivalent | `brew` | `winget` / `choco` / `scoop` | apt / dnf / pacman | same as Linux |
| Path separator in code | forward `/` via `pathlib.Path` | **use `pathlib.Path`** — never hardcode backslashes | `/` | `/` |
| Line endings in text files | LF | CRLF trap on git clone → need `.gitattributes` | LF | LF |
| Shell | zsh (default) | cmd / PowerShell / Git Bash | bash | bash |
| `.env` loading | `python-dotenv` — no platform difference | same | same | same |
| Claude Desktop filesystem MCP | `command: /opt/homebrew/bin/npx` in config | `command: npx` with full Windows path | `npx` on PATH | same as Linux |
| LibreOffice (Phase 2 intake norm) | `brew install --cask libreoffice` → `/Applications/LibreOffice.app/Contents/MacOS/soffice` | installer from libreoffice.org; add to PATH | `apt install libreoffice` | `apt install libreoffice` (ARM builds) |
| Streamlit dev UI | `streamlit run ui/app.py` on `STREAMLIT_PORT=8501` | same command; firewall may prompt | same | same |
| FastEmbed reranker ONNX cache | `~/.cache/fastembed/` (shared with bge-m3) — ~560 MB on first use | `%USERPROFILE%\.cache\fastembed\` | `~/.cache/fastembed/` | same as Linux |
| `start.sh` bring-up | works as-is (bash + colima + docker) | use WSL2 and run from Ubuntu inside WSL | works as-is | works as-is |

---

## Detailed notes

### 1. PyTorch backend switching

All code that constructs `AcceleratorOptions` in Docling must be platform-aware:

```python
import torch
from docling.datamodel.accelerator_options import AcceleratorOptions, AcceleratorDevice

def pick_device() -> AcceleratorDevice:
    if torch.cuda.is_available():
        return AcceleratorDevice.CUDA       # Linux / Windows NVIDIA / DGX Spark
    if torch.backends.mps.is_available():
        return AcceleratorDevice.MPS        # macOS Apple Silicon
    return AcceleratorDevice.CPU

accel = AcceleratorOptions(num_threads=4, device=pick_device())
```

Use this helper everywhere Docling is configured. Never hardcode a device.

### 2. DGX Spark specifics (when we get there)

DGX Spark = ARM64 + NVIDIA GB10 (Grace Blackwell). Key differences:
- Need `torch` wheels built for `linux_aarch64` + CUDA 12.x — NOT the default x86_64 CUDA wheels.
- Install via NVIDIA's channel: check `pip install torch --index-url https://download.pytorch.org/whl/cu124` for the right CUDA variant.
- Docling's default models run on CUDA with no code changes once torch is right.
- Expected parse speedup: significant — Blackwell's tensor cores accelerate layout/table models heavily. Orders of magnitude faster than M4 MPS for large batches.
- Qdrant: arm64 Docker image works natively.

**Add a `setup_dgx.sh` script when we move**. Pin the torch CUDA wheel URL at that point.

### 3. Windows setup (if we ever need it)

- Install WSL2 → use Ubuntu inside. Treat the project as a Linux deploy.
- OR native Windows: Docker Desktop for the Qdrant container, Python.org installer for Python, `venv\Scripts\activate` for activation.
- Windows Defender can slow Python imports — exclude the project directory.
- Line-ending gotcha: `git clone` on Windows may convert LF → CRLF. Add `.gitattributes`:
  ```
  * text=auto
  *.py text eol=lf
  *.md text eol=lf
  ```

### 4. Linux x86 setup

Closest to DGX Spark structurally, just without the ARM + Blackwell deltas.
```
apt install python3.12 python3.12-venv
apt install docker.io docker-compose
# or Docker official repo for newer versions
```
No colima needed — Linux runs Docker natively.

### 5. Paths in code

Every path-handling line in the project must use `pathlib.Path` — not string concatenation. Grep for hardcoded `/` before moving OS:
```
grep -rn 'os.path.join\|"/"' graph/ utils/ main.py
```
Refactor any hits to `Path(...)` before cross-platform testing.

### 6. Node.js / Claude Desktop MCP

Current macOS setup: config references `/opt/homebrew/bin/npx`.
- **Windows**: `where npx` to find the path — typically `C:\Program Files\nodejs\npx.cmd` or in `%APPDATA%\npm\`. Use the full path in `claude_desktop_config.json`.
- **Linux**: depends on install — `which npx`. Typically `/usr/bin/npx` after `apt install nodejs npm`.

### 7. File permissions

- macOS: `.env` should be `chmod 600`.
- Linux: same.
- Windows: ACLs are different; rely on user directory protection.

### 8. Environment variables

`.env` format is identical across platforms. Use `python-dotenv` to load; never rely on shell-exported vars that differ per OS.

### 9. On-disk artefacts (cache + rejected-doc review)

The `output/<stem>/.stage_fingerprints.json` sha256 sidecars and the
`output/not_enough/<slug>/<stem>/` review bundles are plain JSON + markdown
and are fully OS-portable. To keep the sha256 cache warm across machines,
copy the entire `output/` tree alongside the `inputs/` folder. `FORCE_REPARSE=1`
in `.env` is the cross-platform bypass when tuning a stage.

### 10. Phase 2 portability notes

Phase 2 retrieval is fully OS-portable — the only platform differences
are model caches and the LibreOffice binary path.

- **Committed assets** (identical on every OS): `graph/retrieval/`,
  `graph/shared/`, `graph/doctrine_vocab.py`, `ui/app.py`,
  `scripts/retrieval_smoke_test.py`, `start.sh`,
  `data/doctrine/{acronyms.csv, classification_markings.txt,
  cross_ref_prefixes.txt}`, `data/eval/cross_ref_prefixes_unseen.txt`.
- **Runtime artefacts**: `output/_eval/feedback.jsonl` is plain JSONL;
  copies cleanly between machines. Gitignored — don't commit.
- **Reranker model cache**: `~/.cache/fastembed/` (shared with the
  dense bge-m3 cache). First request downloads ~560 MB from
  `mogolloni/bge-reranker-v2-m3-onnx` (`onnx/model.onnx` +
  `onnx/model.onnx_data` — note the **single underscore**, distinct
  from bge-m3's `model.onnx.data` dot separator). To avoid the
  download on a new machine, `rsync -av ~/.cache/fastembed/`
  across.
- **LibreOffice** is required for `.doc / .rtf / .xls / .xlsx / .ppt
  / .pptx / .odt` intake. The headless command `soffice --headless
  --convert-to ...` works identically on macOS, Linux, and Windows
  — only the binary path differs (see summary table).
- **ONNX EPs**: the `RERANKER_PROVIDERS` env var follows the same
  pattern as `EMBEDDER_PROVIDERS` — macOS / Windows (CPU)
  `CPUExecutionProvider`, Linux / DGX Spark
  `CUDAExecutionProvider,CPUExecutionProvider` (requires
  `fastembed-gpu==0.8.0` + CUDA 12.x + cuDNN 9.x).
- **Streamlit UI** binds to `STREAMLIT_PORT` (default `8501`); no
  cross-platform surprises. On Windows + WSL2, run the whole
  project inside WSL and open `http://localhost:8501` from the
  Windows browser — Streamlit's dev server works unchanged.
- **`start.sh` portability**: bash + colima + docker on macOS;
  native bash + docker on Linux / DGX Spark; run inside WSL on
  Windows. `SKIP_INGEST=1` / `NO_UI=1` / `UI_PORT=...` /
  `BOOTSTRAP=1` flags work the same on every supported platform.

---

## When to edit this file

Append a new row to the summary table whenever any of these changes:
- New hardcoded path in code
- New platform-specific install step
- New GPU / accelerator selection logic
- New external service that has platform-specific install
- New shell command that doesn't translate 1:1

Format: one row per concern, one column per target platform, exact command or path.

---

## Move checklist (when actually transferring the project)

1. Clone / copy the project to the new machine.
2. Read this file top to bottom.
3. Install Python 3.12 using the new-platform method.
4. Delete `venv/`. Recreate with `python3.12 -m venv venv`.
5. `pip install -r requirements.txt` (and anything else pinned in `memory.md`).
6. Install Docker via the new-platform method. Pull `qdrant/qdrant:latest`.
7. Install LibreOffice for Phase 2 legacy-Office intake (see summary table for the command per OS).
8. Pre-warm the FastEmbed model caches (dense bge-m3 ~2.3 GB; reranker ~560 MB) to avoid first-request delays.
9. Run `python scripts/sanity_check.py` (to be built — checks all imports, Qdrant reachable, MPS/CUDA detected).
10. Ingest the smallest test folder to verify end-to-end (`python main.py` or `./start.sh`).
11. Run `python scripts/retrieval_smoke_test.py --collection ingest__<slug>__bgem3` to confirm Phase 2 is healthy end-to-end on the new machine.
12. Compare chunk counts and Qdrant point counts with the previous machine's run. Should be identical.
13. Update `memory.md` infrastructure state section to reflect new platform.
