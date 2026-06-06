"""Resolve and log the runtime accelerator the pipeline will actually use.

Called once at the top of each entry point (main.py, scripts/generate_documents.py)
after load_dotenv() so operators can verify the auto-detect picked the right
device on each machine.

Reads:
- DOCLING_DEVICE — passed straight to Docling's AcceleratorDevice

Reports:
- torch.cuda.is_available() + device names
- onnxruntime.get_available_providers() (informational; sparse BM25 stays
  in-process, dense embedder + reranker are HTTP-only now)
- which Docling device will be used after auto-resolution
- the embedder + reranker HTTP endpoints in use
"""

from __future__ import annotations

import os


def print_device_banner() -> None:
    try:
        import torch
        torch_cuda = torch.cuda.is_available()
        torch_devices = (
            [torch.cuda.get_device_name(i) for i in range(torch.cuda.device_count())]
            if torch_cuda else []
        )
    except Exception:
        torch_cuda = False
        torch_devices = []

    try:
        import onnxruntime as ort
        ort_available = ort.get_available_providers()
    except Exception:
        ort_available = []

    docling_requested = os.environ.get("DOCLING_DEVICE", "auto").strip() or "auto"
    docling_resolved = (
        "cuda" if (docling_requested == "auto" and torch_cuda)
        else ("cpu" if docling_requested == "auto" else docling_requested)
    )

    embed_base = os.environ.get("EMBED_BASE_URL", "").strip() or "MISSING"
    embed_model = os.environ.get("EMBED_MODEL", "").strip() or "MISSING"
    rerank_base = os.environ.get("RERANK_BASE_URL", "").strip() or "MISSING"
    rerank_model = os.environ.get("RERANK_MODEL", "").strip() or "MISSING"
    llm_base = os.environ.get("LLM_BASE_URL", "").strip() or "(default cloud)"
    llm_model = os.environ.get("LLM_MODEL", "").strip() or "MISSING"

    print("─" * 72, flush=True)
    print("[device] torch CUDA available  :", torch_cuda, flush=True)
    if torch_devices:
        for i, name in enumerate(torch_devices):
            print(f"[device]   GPU[{i}]              : {name}", flush=True)
    print("[device] ORT providers (wheel) :", ort_available, flush=True)
    print(
        f"[device] Docling               : requested={docling_requested}  →  resolved={docling_resolved}",
        flush=True,
    )
    print(f"[model ] LLM endpoint          : {llm_base}  ({llm_model})", flush=True)
    print(f"[model ] Embedder endpoint     : {embed_base}  ({embed_model})", flush=True)
    print(f"[model ] Reranker endpoint     : {rerank_base}  ({rerank_model})", flush=True)
    print("─" * 72, flush=True)
