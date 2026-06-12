"""
smart_search_client.py — thin client wrapping DecisionMakingSteps's retrieval API.

Supports two modes (set via SMART_SEARCH_MODE in .env):

  - "local"  : sys.path-inject SMART_SEARCH_REPO_PATH and call graph.retrieval.search()
               directly in-process. Fastest. Matches what the smart-search system
               itself uses internally.
  - "http"   : POST to SMART_SEARCH_HTTP_URL. Used if/when the smart-search is
               deployed as a service.

Single public function: retrieve(query, collection=None, top_k=None) -> list[Chunk]
"""
from __future__ import annotations
import os
import sys
import json
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from ..config import load_smart_search_config


@dataclass
class Chunk:
    """One retrieved doctrine/historical chunk."""
    text: str
    source_doc: str
    score: float | None = None
    heading_path: list[str] | None = None
    chunk_index: int | None = None
    chunk_type: str | None = None
    paragraph_number: str | None = None
    point_id: str | None = None

    @classmethod
    def from_dict(cls, d: dict) -> "Chunk":
        return cls(
            text=d.get("text") or d.get("chunk_text") or "",
            source_doc=d.get("source_doc") or "",
            score=d.get("score"),
            heading_path=d.get("heading_path"),
            chunk_index=d.get("chunk_index"),
            chunk_type=d.get("chunk_type"),
            paragraph_number=d.get("paragraph_number"),
            point_id=d.get("point_id"),
        )

    def short(self, n: int = 200) -> str:
        return self.text[:n].replace("\n", " ")


# ---------------------------------------------------------------------------
# Lazy local-mode importer
# ---------------------------------------------------------------------------
_local_imports_done = False


def _ensure_local_imports(repo_path) -> None:
    """Inject the DecisionMakingSteps repo onto sys.path and import its modules.
    Done once, lazily, to keep our startup fast when only http mode is needed.
    """
    global _local_imports_done
    if _local_imports_done:
        return
    if repo_path is None:
        raise RuntimeError(
            "SMART_SEARCH_MODE=local requires SMART_SEARCH_REPO_PATH to be set."
        )
    p = str(repo_path)
    if p not in sys.path:
        sys.path.insert(0, p)
    # Their config requires load_dotenv on THEIR .env so embedder / LLM keys
    # are resolved before any graph/ import.
    from dotenv import load_dotenv
    dms_env = os.path.join(p, ".env")
    if os.path.exists(dms_env):
        load_dotenv(dms_env, override=False)
    _local_imports_done = True


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------
def retrieve(query: str, collection: str | None = None, top_k: int | None = None,
             use_reranker: bool = True, use_glossary: bool = False) -> list[Chunk]:
    """Retrieve top-k doctrine chunks for a query.

    Args:
        query: free-form search string.
        collection: Qdrant collection name. Defaults to SMART_SEARCH_COLLECTION.
        top_k: number of chunks to return. Defaults to SMART_SEARCH_TOP_K.
        use_reranker: ask the smart-search to apply its reranker. Falls back to
                      RRF-only if the reranker is unavailable (graceful).
        use_glossary: cheap acronym expansion. Off by default.

    Returns:
        list[Chunk] — empty list on retrieval failure (never raises).
    """
    cfg = load_smart_search_config()
    coll = collection or cfg.collection
    k = top_k or cfg.top_k

    try:
        if cfg.mode == "local":
            return _retrieve_local(query, coll, k, use_reranker, use_glossary, cfg.repo_path)
        return _retrieve_http(query, coll, k, use_reranker, use_glossary, cfg.http_url)
    except Exception as e:
        # Never crash a wargame turn because retrieval failed. Use a small
        # local Markdown fallback so prompts still get doctrine context when
        # Qdrant/embedder services are unavailable on a bridge machine.
        chunks = _retrieve_markdown_fallback(query, k, cfg.repo_path)
        if chunks:
            return chunks
        print(f"[smart_search] WARN: retrieval failed: {e}")
        return []


def _retrieve_local(query: str, collection: str, k: int,
                    use_reranker: bool, use_glossary: bool, repo_path) -> list[Chunk]:
    _ensure_local_imports(repo_path)
    from graph.retrieval.search import search           # type: ignore
    from graph.retrieval.schema import SearchRequest    # type: ignore
    from dataclasses import asdict

    resp = search(SearchRequest(
        query=query,
        collection=collection,
        top_n_in=max(20, k * 5),
        top_k_out=k,
        use_reranker=use_reranker,
        use_glossary=use_glossary,
        use_hyde=False,
    ))
    out: list[Chunk] = []
    for h in resp.hits:
        d = asdict(h) if hasattr(h, "__dataclass_fields__") else (vars(h) if not isinstance(h, dict) else h)
        out.append(Chunk.from_dict(d))
    return out


def _retrieve_http(query: str, collection: str, k: int,
                   use_reranker: bool, use_glossary: bool, http_url: str) -> list[Chunk]:
    payload = {
        "query": query,
        "collection": collection,
        "top_n_in": max(20, k * 5),
        "top_k_out": k,
        "use_reranker": use_reranker,
        "use_glossary": use_glossary,
    }
    req = urllib.request.Request(
        url=http_url.rstrip("/") + "/search",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return [Chunk.from_dict(h) for h in data.get("hits", [])]


def _retrieve_markdown_fallback(query: str, k: int, repo_path) -> list[Chunk]:
    roots: list[Path] = []
    here = Path(__file__).resolve().parents[2]
    roots.append(here / "inputs" / "doctrine")
    roots.append(here.parent / "SmartSearch" / "inputs" / "doctrine")
    if repo_path:
        roots.append(Path(repo_path) / "inputs" / "doctrine")

    terms = [t.lower() for t in query.replace("-", " ").split() if len(t) > 2]
    scored: list[tuple[int, Path, str]] = []
    seen_roots: set[Path] = set()
    for root in roots:
        root = root.resolve()
        if root in seen_roots:
            continue
        seen_roots.add(root)
        if not root.exists():
            continue
        for path in root.glob("*.md"):
            try:
                text = path.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue
            blocks = [b.strip() for b in text.split("\n\n") if b.strip()]
            for block in blocks:
                low = block.lower()
                score = sum(low.count(t) for t in terms)
                if score > 0:
                    scored.append((score, path, block[:1800]))
    scored.sort(key=lambda row: row[0], reverse=True)
    out: list[Chunk] = []
    seen: set[str] = set()
    for score, path, block in scored:
        key = f"{path}:{block[:120]}"
        if key in seen:
            continue
        seen.add(key)
        out.append(Chunk(text=block, source_doc=path.name, score=float(score)))
        if len(out) >= k:
            break
    return out


def format_for_prompt(chunks: list[Chunk], max_chars: int = 4000) -> str:
    """Format a list of chunks for inclusion in an LLM prompt."""
    if not chunks:
        return "(no doctrine retrieved)"
    parts: list[str] = []
    total = 0
    for i, c in enumerate(chunks, 1):
        block = f"[{i}] {c.source_doc} — {c.text.strip()}"
        if total + len(block) > max_chars:
            parts.append(f"... ({len(chunks) - i + 1} more chunks omitted for length)")
            break
        parts.append(block)
        total += len(block)
    return "\n\n".join(parts)


if __name__ == "__main__":
    test_queries = [
        "amphibious assault 3:1 force ratio prepared defense",
        "Iwo Jima pre-landing bombardment effectiveness",
        "Ukrainian USV swarm Black Sea Fleet",
    ]
    for q in test_queries:
        print(f"\n=== {q} ===")
        chunks = retrieve(q, top_k=3, use_reranker=True)
        for c in chunks:
            print(f"  ({c.source_doc:25s}) {c.short(160)}")
