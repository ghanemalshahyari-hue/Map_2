# 08 — Apple Silicon (M4) + MPS Setup for Docling

> Platform-specific: this doc describes the current Mac setup.
> For Windows / Linux / DGX Spark, see `transferOS.md` for deltas.

---

## What MPS is

**MPS** = Metal Performance Shaders. Apple's GPU compute framework for M-series chips. PyTorch has native MPS support since 1.12, stable on 2.x. For Docling's layout + TableFormer models, MPS gives a **3–10×** speedup over pure CPU on an M4.

## Our environment (pinned)

| Component | Version | Location |
|---|---|---|
| Host | Apple Silicon M4, macOS 24.3 (Sequoia) | native |
| Python | 3.12.13 | `/opt/homebrew/bin/python3.12` (Homebrew) |
| PyTorch | 2.11.0 | `venv/lib/python3.12/site-packages/torch` |
| torchvision | 0.26.0 | (companion) |
| Docker runtime | colima 0.10.1 + Docker CLI 29.4.0 | `/opt/homebrew/bin/` |
| Qdrant | image `qdrant/qdrant:latest` (v1.17.1) | Docker, port 6333/6334 |

## Verifying MPS is available

Quick Python check:
```python
import torch
print(torch.backends.mps.is_available())   # should be True
print(torch.backends.mps.is_built())       # should be True
x = torch.randn(3, 3, device="mps")        # should not raise
print(x.device)
```

If `is_available()` returns False on an M-series Mac:
- Check PyTorch version (must be ≥ 1.12; we're on 2.11).
- Check Python arch: `file $(which python3.12)` should show `Mach-O 64-bit executable arm64` (not x86_64).

## Pointing Docling at MPS

```python
from docling.document_converter import DocumentConverter, PdfFormatOption
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions
from docling.datamodel.accelerator_options import AcceleratorOptions, AcceleratorDevice

pipeline_options = PdfPipelineOptions()
pipeline_options.accelerator_options = AcceleratorOptions(
    num_threads=4,
    device=AcceleratorDevice.MPS,
)
pipeline_options.do_ocr = True                    # selective OCR — see referencedocs/15_ocr_options.md
pipeline_options.force_full_page_ocr = False      # keep PDF text layer where available
pipeline_options.do_table_structure = True

converter = DocumentConverter(
    format_options={
        InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options),
    }
)
```

`num_threads=4`: for CPU pre/post-processing around the MPS-accelerated model calls. The M4's 10-core CPU handles 4–6 threads well without starving MPS of attention.

## Expected performance

Rough calibration on M4 with MPS:

| Doc size | CPU time | MPS time |
|---|---|---|
| 10-page PDF | ~15 s | ~3 s |
| 50-page PDF | ~90 s | ~15 s |
| 300-page PDF (ADP-3-0 class) | ~20 min | ~3–5 min |
| Full 21-doc doctrine corpus | 4–6 hours | **40–60 min** |

First run is slower (model load ~30 s cold). Subsequent runs share the warm model cache.

## Memory considerations

MPS shares unified memory with CPU. An M4 with 16 GB RAM handles Docling easily; 8 GB is tight — monitor with Activity Monitor during a large parse. If swap explodes:
- Lower `num_threads`
- Parse sequentially rather than in parallel
- Reduce batch size for the layout model

## OCR on M4 — native Vision framework via `OcrMac`

Separate from the MPS accelerator (which drives Docling's layout + TableFormer
models), OCR on M4 runs on Apple's **Vision framework**, not MPS. `OcrMac`
(via the `ocrmac` package) calls macOS's native OCR — hardware-accelerated by
the system, no model download, no PyTorch involvement.

Our parser config wires this via `OcrAutoOptions`, which on macOS auto-selects
`OcrMac` if `ocrmac` is importable:

```python
from docling.datamodel.pipeline_options import OcrAutoOptions
pipeline_options.ocr_options = OcrAutoOptions()
```

If you need to pin the engine explicitly (for reproducibility across machines):

```python
from docling.datamodel.pipeline_options import OcrMacOptions
pipeline_options.ocr_options = OcrMacOptions(
    lang=["en-US"],                 # Vision uses locale codes, not ISO 639
    force_full_page_ocr=False,      # keep PDF text layer where available
)
```

Install:
```
pip install ocrmac
```

**Escalation path (Tesseract CLI)** — see `referencedocs/15_ocr_options.md`.
Tesseract runs as a subprocess (CPU-only; no GPU benefit) and is only invoked
on pages that the primary OcrMac pass flagged as suspect.

```
brew install tesseract
brew install tesseract-lang   # optional: all language packs
```

**Why `OcrMac` on macOS rather than EasyOCR / RapidOCR:**
- Zero extra model download (~500 MB saved vs EasyOCR).
- No PyTorch contention with the layout/TableFormer models that run on MPS.
- Native Vision is fast on Apple Silicon and quality is competitive with
  dedicated OCR packages for English and major European languages.

**What changes off macOS:** `OcrAutoOptions` falls through to RapidOCR (ONNX)
and then EasyOCR. See `transferOS.md` for the portable matrix.

## Falling back to CPU

On rare edge cases (specific bugs with MPS on certain layouts), you can force CPU:
```python
device=AcceleratorDevice.CPU
```
Slower but bulletproof. Keep this in mind as a debugging tool.

## Docker / Qdrant specifics on M4

colima runs a **Linux arm64 VM** under macOS Virtualization.Framework.
- Qdrant's official image (`qdrant/qdrant:latest`) has an arm64 variant — runs natively, no emulation.
- Port forwarding: colima maps container ports to `localhost` directly — no extra config.
- Storage: data persists in Docker volume `qdrant_storage`, mapped through colima's virtiofs mount.
- Start/stop colima to save resources between sessions:
  ```
  colima stop
  colima start    # resumes, containers auto-restart if they were running
  ```

## Background services to remember

| Service | Command | Port | Persistence |
|---|---|---|---|
| colima VM | `colima start` / `colima stop` | — | Runs until stopped |
| Qdrant container | `docker start qdrant` / `docker stop qdrant` | 6333, 6334 | Volume `qdrant_storage` |

## Known gotchas on M4

- **First MPS call is slow.** Model warm-up hits MPS kernel cache. Normal.
- **Some PyTorch ops still fall back to CPU silently on MPS.** Docling's models are fully supported, but if you ever see inexplicable slowdown, check `PYTORCH_ENABLE_MPS_FALLBACK=1` is active (default on modern torch).
- **Rosetta 2 interference**: don't run Docling via an x86_64 Python (e.g. some older Anaconda installs). Our Homebrew Python is arm64 — check with `file $(which python3.12)`.
- **16 GB RAM ceiling during large parses** — parallel parsing of multiple large PDFs can OOM. Sequential is safe.

## What to update if we move OS

See `transferOS.md` — the accelerator selection, Docker runtime, Python binary path, and venv activation all differ on Windows / Linux / DGX Spark.
