"""
graph/nodes/check_documents.py
================================
LangGraph node #2 of 7 — PER-DOCUMENT LLM gate that decides whether each
document in the folder should be parsed, chunked, embedded, and upserted.
Runs AFTER initialpages_convert (which writes markdown previews of the
first 10 pages of every binary doc so this gate can read real content).

WHAT THIS NODE DOES:
  For EVERY document, the gate makes one independent LLM call and records a
  per-doc verdict ("enough" / "not enough").  Documents marked "not enough"
  stop here — only the accepted subset flows downstream as
  state["eligible_documents"].

  The folder-level state["decision"] is just a summary:
    - "enough"     if at least one doc was accepted (graph proceeds).
    - "not enough" if every doc was rejected        (graph stops at END).

  Previously this node made ONE LLM call for the whole folder and produced
  a single folder-wide decision.  That caused rejected docs to still be
  fully processed whenever at least one doc in the folder was accepted.
  The fix is strictly about routing/filtering; the per-doc prompt stays
  intact so topical filtering can evolve independently.

WHERE REJECTED DOCS GO:
  For each "not enough" doc we write a review bundle to
  output/not_enough/<folder_slug>/<safe_stem>/:
    - check_decision.json  (source path, filename, slug, decision, remarks,
                            timestamp, preview path)
    - initial_pages.md     (copied from the doc's normal output folder when
                            the preview exists — lets you see what the gate
                            actually read)
  If the same doc is accepted on a later run, its stale review folder is
  removed so artefacts always reflect the current run.

STALE QDRANT POINTS:
  If a doc was previously ingested and is now rejected, its points would
  otherwise remain searchable forever.  This node deletes those points
  best-effort via `source_doc == <filename>` filter on the target collection
  (if the collection exists).  Failures are logged, not fatal — the
  pipeline still proceeds for accepted docs.

PROMPT LOCATION / SCOPE:
  The prompt text lives in `graph/prompts.py::SUFFICIENCY_CHECK_PROMPT`.
  It is a TOPICAL filter — see its own header for the design discussion.
  This node feeds one document per call (numbered "DOCUMENT 1") so the LLM's
  existing rubric applies cleanly without any prompt rewrite.

WHAT TEXT IS SENT TO THE LLM?
  Only the file CONTENTS — never filenames (memory.md Rule 1).
    .txt files : decoded as UTF-8 text and sent in full.
    .pdf/.docx : initialpages_convert's markdown preview.
    fallback   : "[Binary document — ...]" placeholder when no preview.

_get_llm() / _get_client() LAZY SINGLETONS:
  Both instantiated inside helpers so load_dotenv() in main.py runs before
  any env var is read.  Module-level instantiation is explicitly disallowed
  by memory.md Rule 2.

HOW TO RUN IN ISOLATION:
  python -m graph.nodes.check_documents <folder_path_or_name>
  (Does not require any prior steps to have run.)
"""
from __future__ import annotations

import json
import re
import shutil
import sys
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from graph.config import (
    FILE_CHECK_DECISION_JSON,
    FILE_INITIAL_PAGES,
    FILE_INITIAL_PAGES_OCR,
    collection_name as make_collection_name,
    doc_output_dir,
    get_config,
    rejected_doc_dir,
    rejected_review_dir,
)
from graph.prompts import SUFFICIENCY_CHECK_SYSTEM_PROMPT
from graph.shared.responses_client import (
    ResponsesInvocationError,
    invoke_structured,
)
from graph.state import IngestionState


# ---------------------------------------------------------------------------
# PYDANTIC SCHEMA — forces the LLM to return a typed object, not free text.
# ---------------------------------------------------------------------------

class DocumentDecision(BaseModel):
    """Structured output for one document's sufficiency check."""

    decision: Literal["enough", "not enough"] = Field(
        description=(
            "Your verdict for this single document. Must be exactly one of: "
            "'enough' or 'not enough'."
        )
    )
    remarks: str = Field(
        description=(
            "A short, human-readable explanation of the decision for this "
            "document (why it is or is not in scope)."
        )
    )


# ---------------------------------------------------------------------------
# LAZY SINGLETONS
# ---------------------------------------------------------------------------
# The Phase 1 gate LLM now routes through
# ``graph/shared/responses_client.invoke_structured`` (§C27, 2026-04-24).
# The previous ChatOpenAI singleton shared with the Phase 2 HyDE path is
# gone — HyDE lives on the same adapter, so there is no singleton to
# share.  Client caching is handled inside the adapter itself.
_qdrant_client: Any = None  # typed Any to avoid importing qdrant at module load


def _get_qdrant_client():
    """Return the process-level QdrantClient singleton (lazy import)."""
    global _qdrant_client
    if _qdrant_client is None:
        from qdrant_client import QdrantClient
        cfg = get_config()
        kwargs: dict[str, Any] = {"url": cfg.qdrant_url}
        if cfg.qdrant_api_key:
            kwargs["api_key"] = cfg.qdrant_api_key
        _qdrant_client = QdrantClient(**kwargs, check_compatibility=False)
    return _qdrant_client


# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------

def _read_doc_text(doc: dict, initial_parsed_paths: dict[str, str]) -> str:
    """Read one document's content as a string for the LLM gate.

    Priority:
      1. .txt  — decoded as UTF-8 text directly.
      2. .pdf/.docx with a markdown preview in `initial_parsed_paths`.
      3. Fallback placeholder "[Binary document — ...]".

    Filenames are never included — memory.md Rule 1.
    """
    path = doc.get("path", "")
    ext = Path(path).suffix.lower()

    if ext == ".txt":
        try:
            return Path(path).read_text(encoding="utf-8")
        except OSError:
            return "[Could not read document — file may be missing or unreadable]"

    md_path = initial_parsed_paths.get(path)
    if md_path and Path(md_path).is_file():
        try:
            return Path(md_path).read_text(encoding="utf-8")
        except OSError:
            pass

    size_kb = doc.get("size", 0) // 1024
    return f"[Binary document — content to be extracted by the parser ({size_kb} KB)]"


def _write_rejected_review(
    doc: dict,
    folder_slug: str,
    decision: str,
    remarks: str,
    preview_path: str | None,
    doc_review_dir: Path,
    attempts: list[dict] | None = None,
    ocr_preview_path: str | None = None,
) -> None:
    """Write check_decision.json + copy initial_pages.md for a rejected doc.

    Always overwrites — the folder reflects the current run's verdict.

    When the OCR retry loop fired, `attempts` carries one dict per pass
    ({mode, decision, remarks}) and `ocr_preview_path` points at the OCR
    preview that was produced (so a reviewer can see both inputs the
    gate evaluated).
    """
    payload = {
        "source_path":      doc.get("path", ""),
        "filename":         doc.get("filename", ""),
        "folder_slug":      folder_slug,
        "decision":         decision,
        "remarks":          remarks,
        "timestamp":        _now(),
        "preview_path":     preview_path or "",
        "ocr_preview_path": ocr_preview_path or "",
        "attempts":         attempts or [],
    }
    (doc_review_dir / FILE_CHECK_DECISION_JSON).write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # Copy both previews into the review folder so a reviewer can inspect
    # exactly what the gate read.  Either one may legitimately be missing
    # (preview failed upstream, or OCR retry did not fire / failed).
    if preview_path and Path(preview_path).is_file():
        shutil.copy2(preview_path, doc_review_dir / FILE_INITIAL_PAGES)
    if ocr_preview_path and Path(ocr_preview_path).is_file():
        shutil.copy2(ocr_preview_path, doc_review_dir / FILE_INITIAL_PAGES_OCR)


def _purge_stale_downstream_artefacts(doc: dict, cfg) -> None:
    """Remove stale downstream artefacts for a newly-rejected doc.

    If a doc was ingested on a previous run and is rejected this run, its
    parsed.json / chunks.jsonl / enriched_chunks.jsonl / embeddings.npz /
    acronyms.json would otherwise sit on disk forever.  We keep only
    `initial_pages.md` (what the gate actually read) plus the fingerprint
    sidecar (so initialpages_convert can still cache-hit on future runs)
    so the per-doc folder reflects the current verdict.
    """
    from graph.fingerprints import FINGERPRINT_FILE, read_fingerprints, write_fingerprint

    filename = doc.get("filename", "")
    if not filename:
        return
    out_dir = doc_output_dir(filename, cfg)
    keep = {FILE_INITIAL_PAGES, FINGERPRINT_FILE}
    for entry in out_dir.iterdir():
        if entry.name in keep:
            continue
        try:
            if entry.is_file() or entry.is_symlink():
                entry.unlink(missing_ok=True)
            else:
                shutil.rmtree(entry, ignore_errors=True)
        except Exception:
            # Best-effort — a stale leftover is not worth aborting for.
            pass

    # Trim the fingerprint dict to ONLY the initial_pages.md entry — every
    # other fingerprint now points at a file we just deleted and would give
    # a false-positive cache hit if a downstream stage ran standalone.
    fps = read_fingerprints(out_dir)
    init_fp = fps.get(FILE_INITIAL_PAGES)
    fp_file = out_dir / FINGERPRINT_FILE
    if init_fp:
        fp_file.write_text(
            json.dumps({FILE_INITIAL_PAGES: init_fp}, indent=2, sort_keys=True),
            encoding="utf-8",
        )
    else:
        fp_file.unlink(missing_ok=True)


def _clear_stale_rejected_dir(
    doc: dict,
    folder_slug: str,
    cfg,
) -> None:
    """Remove a previously-rejected doc's review folder.

    Called when a doc is accepted THIS run but may have been rejected on a
    previous run.  `rejected_doc_dir` re-creates the empty folder as a side
    effect; we remove it after so the filesystem only carries review
    artefacts for docs actually rejected by the current run.
    """
    target = rejected_doc_dir(folder_slug, doc["filename"], cfg)
    shutil.rmtree(target, ignore_errors=True)


def _delete_stale_qdrant_points(filename: str, coll_name: str, errors: list[dict]) -> None:
    """Best-effort delete of all Qdrant points for a now-rejected doc.

    Runs only if the target collection already exists.  Any failure (Qdrant
    down, network error) is logged under stage `check_documents:stale_qdrant`
    so the run can still proceed for accepted docs.
    """
    try:
        from qdrant_client.http.models import FieldCondition, Filter, MatchValue
        client = _get_qdrant_client()
        if not client.collection_exists(coll_name):
            return
        client.delete(
            collection_name=coll_name,
            points_selector=Filter(
                must=[FieldCondition(
                    key="source_doc",
                    match=MatchValue(value=filename),
                )]
            ),
        )
    except Exception:
        errors.append({
            "stage":     "check_documents:stale_qdrant",
            "file":      filename,
            "traceback": traceback.format_exc(),
            "ts":        _now(),
        })


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _cap_preview(content: str, filename: str, max_chars: int) -> str:
    """Truncate ``content`` to ``max_chars`` and log when truncation fires.

    Prompt-budget hardening (§C27, 2026-04-24).  Short-context local
    models (LM Studio default ``n_ctx=4096``) will silently drop the
    tail of an over-long prompt, which can flip a gate decision on a
    readable doc.  Cap on our side and surface a stderr breadcrumb so
    the operator can raise ``PHASE1_PREVIEW_MAX_CHARS`` (or the
    server's context window) if it's actually clipping real doctrine.
    """
    if max_chars <= 0 or len(content) <= max_chars:
        return content
    truncation_notice = (
        "\n\n[PREVIEW TRUNCATED — only the first "
        f"{max_chars} characters are shown to the gate.]"
    )
    print(
        json.dumps(
            {
                "phase1_preview_truncated": True,
                "file": filename,
                "original_chars": len(content),
                "cap_chars": max_chars,
            },
            ensure_ascii=False,
        ),
        file=sys.stderr,
    )
    return content[:max_chars] + truncation_notice


def _judge_one_doc(doc: dict, content: str) -> DocumentDecision:
    """Invoke the LLM on exactly one document and return its structured decision.

    We frame the document as "DOCUMENT 1" so the existing gate rubric
    applies unchanged — no prompt rewrite required for single-doc
    mode.  The preview is capped (`PHASE1_PREVIEW_MAX_CHARS`) so a
    short-context local model can't silently clip the body and flip
    the verdict.

    Structured output is routed through
    :func:`graph.shared.responses_client.invoke_structured` instead of
    LangChain's ``with_structured_output`` (§C27, 2026-04-24).  The
    adapter owns retry/finalize/repair; call-site semantics are
    unchanged.
    """
    cfg = get_config()
    capped = _cap_preview(content, doc.get("filename", ""), cfg.phase1_preview_max_chars)
    user_message = (
        "Please review the following document and determine if it is "
        "sufficient to complete the task.\n\n"
        "--- DOCUMENT 1 ---\n"
        f"{capped}\n"
        "--- END OF DOCUMENT 1 ---"
    )
    result = invoke_structured(
        role_env="PHASE1_GATE_MODEL",
        default_model="gpt-4o-mini",
        temperature=0.0,
        schema=DocumentDecision,
        system=SUFFICIENCY_CHECK_SYSTEM_PROMPT,
        user=user_message,
    )
    return result.value  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# OCR-RETRY CLASSIFIER — decides whether a REJECT justifies a force-OCR retry.
# ---------------------------------------------------------------------------
# Triggers when EITHER:
#   (a) the rejection remark mentions one of the keywords below (case-insensitive), OR
#   (b) the text the gate saw was suspiciously light on ASCII letters — a
#       strong signal that the text layer is encoded garbage (e.g. a Caesar-
#       shifted CMap where letters land on punctuation/control bytes).
#
# Keyword list is deliberately short — a broader regex risks firing on
# docs that are legitimately outside the topical scope.
_GARBAGE_REMARK_PATTERN = re.compile(
    r"\b(garbled|garbage|corrupt(?:ed)?|unreadable|gibberish|encoded|cipher|"
    r"nonsense|unintelligible|illegible|mojibake)\b",
    re.IGNORECASE,
)

# Fallback signal: if the preview the gate saw was <40% ASCII letters, the
# text layer is almost certainly broken even if the LLM did not use one of
# the keywords above.  Chosen empirically — ADP 2-0's Caesar-shifted text
# lands around 10–15%; English doctrine text lands around 70–85%.
_MIN_ASCII_LETTER_RATIO = 0.40
_MIN_CONTENT_CHARS_FOR_RATIO_CHECK = 500  # skip tiny docs / placeholders


def _should_retry_with_ocr(content: str, remarks: str) -> bool:
    """Return True iff a REJECT should be retried with force-full-page OCR."""
    if _GARBAGE_REMARK_PATTERN.search(remarks or ""):
        return True
    if len(content) >= _MIN_CONTENT_CHARS_FOR_RATIO_CHECK:
        letters = sum(1 for c in content if c.isascii() and c.isalpha())
        ratio = letters / len(content)
        if ratio < _MIN_ASCII_LETTER_RATIO:
            return True
    return False


# ---------------------------------------------------------------------------
# MAIN NODE FUNCTION
# ---------------------------------------------------------------------------

def check_documents(state: IngestionState) -> dict[str, Any]:
    """LangGraph node #2: per-document LLM gate.

    Reads from state:
        documents            — file metadata list (path, filename, sha256, size)
        source_folder_slug   — used for the rejected-review layout + collection name
        initial_parsed_paths — markdown previews keyed by source path
        ingestion_errors     — carried forward

    Writes to state:
        decision             — folder-level "enough"/"not enough" (summary)
        remarks              — folder-level human-readable summary
        document_decisions   — filename -> "enough" | "not enough"
        document_remarks     — filename -> LLM remark for that doc
        eligible_documents   — subset of `documents` accepted
        rejected_documents   — subset of `documents` rejected
        rejected_review_dir  — output/not_enough/<slug>/
        ingestion_errors     — appended
    """
    cfg = get_config()
    documents: list[dict] = state.get("documents") or []
    errors: list[dict] = list(state.get("ingestion_errors") or [])
    initial_parsed_paths: dict[str, str] = state.get("initial_parsed_paths") or {}
    folder_slug: str = state.get("source_folder_slug", "")

    # ------------------------------------------------------------------
    # Guard: no documents → short-circuit.
    # ------------------------------------------------------------------
    if not documents:
        return {
            "decision":            "not enough",
            "remarks":             "No documents found in the folder — nothing to ingest.",
            "document_decisions":  {},
            "document_remarks":    {},
            "eligible_documents":  [],
            "rejected_documents":  [],
            "rejected_review_dir": str(rejected_review_dir(folder_slug, cfg)) if folder_slug else "",
            "ingestion_errors":    errors,
        }

    # ------------------------------------------------------------------
    # Per-doc LLM calls.
    # ------------------------------------------------------------------
    document_decisions: dict[str, str] = {}
    document_remarks: dict[str, str] = {}
    eligible: list[dict] = []
    rejected: list[dict] = []

    coll_name = make_collection_name(folder_slug, cfg) if folder_slug else ""

    # Per-folder OCR-retry budget (plan B, docs/pdf_failure_fallback_plan.md).
    ocr_retries_used = 0

    for doc in documents:
        filename = doc["filename"]
        preview_path = initial_parsed_paths.get(doc.get("path", ""))
        content = _read_doc_text(doc, initial_parsed_paths)

        # `attempts` records every (mode, decision, remarks) triple the gate
        # saw for this doc, for audit in check_decision.json.  Populated
        # whether or not the retry fires.
        attempts: list[dict] = []
        ocr_preview_path_str: str | None = None

        def _call_gate(_content: str) -> tuple[str, str]:
            try:
                result = _judge_one_doc(doc, _content)
                return result.decision, result.remarks
            except Exception:
                # One bad LLM call must not take down the whole gate.  Log and
                # default this doc to "not enough" so it cannot slip through.
                errors.append({
                    "stage":     "check_documents",
                    "file":      filename,
                    "traceback": traceback.format_exc(),
                    "ts":        _now(),
                })
                return (
                    "not enough",
                    "LLM call failed — see ingestion_errors for details.",
                )

        decision, remarks_text = _call_gate(content)
        attempts.append({
            "mode":     "textlayer",
            "decision": decision,
            "remarks":  remarks_text,
        })

        # ------------------------------------------------------------------
        # OCR retry: if the gate rejected a doc that looks like a broken-
        # CMap / garbage-text-layer case, force-OCR the first 10 pages and
        # let the gate re-score.  Capped by OCR_RETRY_MAX_PER_FOLDER so a
        # whole folder of unreadable files cannot burn unbounded OCR time.
        # See docs/pdf_failure_fallback_plan.md §3.
        # ------------------------------------------------------------------
        if (
            decision == "not enough"
            and cfg.ocr_retry_on_garbage
            and ocr_retries_used < cfg.ocr_retry_max_per_folder
            and _should_retry_with_ocr(content, remarks_text)
        ):
            # Import here to avoid a module-load-time cycle with
            # initialpages_convert (which imports nothing from this node).
            from graph.nodes.initialpages_convert import ocr_retry_preview

            errors.append({
                "stage":     "check_documents:ocr_retry",
                "file":      filename,
                "traceback": (
                    "Text-layer reject looks like broken-CMap garbage "
                    "— retrying with force_full_page_ocr=True. "
                    f"Original remark: {remarks_text[:200]}"
                ),
                "ts":        _now(),
            })

            ocr_md_path, ocr_err = ocr_retry_preview(doc, cfg)
            ocr_retries_used += 1

            if ocr_md_path is None:
                errors.append({
                    "stage":     "check_documents:ocr_retry_failed",
                    "file":      filename,
                    "traceback": ocr_err or "unknown OCR failure",
                    "ts":        _now(),
                })
                attempts.append({
                    "mode":     "ocr",
                    "decision": "not enough",
                    "remarks":  f"OCR retry failed: {ocr_err or 'unknown'}",
                })
            else:
                ocr_preview_path_str = str(ocr_md_path)
                try:
                    ocr_content = Path(ocr_md_path).read_text(encoding="utf-8")
                except OSError:
                    ocr_content = ""
                if ocr_content.strip():
                    ocr_decision, ocr_remarks = _call_gate(ocr_content)
                    attempts.append({
                        "mode":     "ocr",
                        "decision": ocr_decision,
                        "remarks":  ocr_remarks,
                    })
                    # Promote the OCR verdict to this doc's final decision.
                    decision, remarks_text = ocr_decision, ocr_remarks

        document_decisions[filename] = decision
        document_remarks[filename]   = remarks_text

        if decision == "enough":
            # If OCR rescued this doc, tag it so convert_document goes straight
            # to full-page Tesseract OCR for the full parse (the text-layer
            # path would otherwise re-produce the same encoded garbage —
            # thin-page detection can't catch this because the failure is a
            # broken text-layer, not a scanned-bitmap page).
            if ocr_preview_path_str and len(attempts) > 1 and attempts[-1]["mode"] == "ocr":
                doc = {**doc, "needs_full_ocr": True}
            eligible.append(doc)
            # Note: convert_document re-parses from the source PDF (not the
            # preview).  We swap the doc dict above so the downstream node
            # picks up the needs_full_ocr marker.
            # Doc was previously rejected? Clean its stale review folder so
            # output/not_enough always reflects the current run's verdicts.
            if folder_slug:
                _clear_stale_rejected_dir(doc, folder_slug, cfg)
        else:
            rejected.append(doc)
            if folder_slug:
                # Fresh review bundle (always overwrites any previous one).
                doc_dir = rejected_doc_dir(folder_slug, filename, cfg)
                _write_rejected_review(
                    doc=doc,
                    folder_slug=folder_slug,
                    decision=decision,
                    remarks=remarks_text,
                    preview_path=preview_path,
                    doc_review_dir=doc_dir,
                    attempts=attempts,
                    ocr_preview_path=ocr_preview_path_str,
                )
                # If this doc was fully processed on a previous run, drop
                # its stale per-doc artefacts (parsed.json / chunks.jsonl /
                # enriched_chunks.jsonl / embeddings.npz / acronyms.json)
                # so the per-doc folder reflects the current verdict.
                _purge_stale_downstream_artefacts(doc, cfg)
                # Same idea for Qdrant: delete any points previously upserted
                # for this doc so they do not linger as phantom search hits.
                if coll_name:
                    _delete_stale_qdrant_points(filename, coll_name, errors)

    # ------------------------------------------------------------------
    # Folder-level summary.
    # ------------------------------------------------------------------
    folder_decision: Literal["enough", "not enough"] = (
        "enough" if eligible else "not enough"
    )
    folder_remarks = (
        f"{len(eligible)}/{len(documents)} document(s) accepted; "
        f"{len(rejected)} rejected. "
        f"{'Proceeding with accepted docs only.' if eligible else 'No eligible docs — stopping.'}"
    )

    review_root = str(rejected_review_dir(folder_slug, cfg)) if folder_slug else ""

    return {
        "decision":            folder_decision,
        "remarks":             folder_remarks,
        "document_decisions":  document_decisions,
        "document_remarks":    document_remarks,
        "eligible_documents":  eligible,
        "rejected_documents":  rejected,
        "rejected_review_dir": review_root,
        "ingestion_errors":    errors,
    }


# =============================================================================
# STANDALONE MODE
# =============================================================================
# Usage:
#   python -m graph.nodes.check_documents <folder_path_or_name>

if __name__ == "__main__":
    import re as _re
    from dotenv import load_dotenv
    from utils.file_reader import list_documents

    load_dotenv()

    if len(sys.argv) < 2:
        print("Usage: python -m graph.nodes.check_documents <folder_path_or_name>")
        sys.exit(1)

    folder = Path(sys.argv[1])
    if not folder.is_absolute():
        candidate = Path("inputs") / sys.argv[1]
        if candidate.is_dir():
            folder = candidate
    folder = folder.resolve()

    if not folder.is_dir():
        print(f"Error: '{folder}' is not a valid directory.")
        sys.exit(1)

    slug = _re.sub(r"[^a-z0-9_-]", "_", folder.name.lower())[:48]
    docs = list_documents(str(folder))

    print(f"Folder    : {folder}")
    print(f"Slug      : {slug}")
    print(f"Documents : {len(docs)}")
    for d in docs:
        print(f"  {d['filename']}  ({d['size']} bytes)")
    print()

    from graph.config import (
        FILE_INITIAL_PAGES,
        doc_output_dir as _doc_output_dir,
        get_config as _get_cfg,
    )
    _cfg = _get_cfg()
    _doc_output_dirs: dict[str, str] = {
        d["filename"]: str(_doc_output_dir(d["filename"], _cfg)) for d in docs
    }
    _initial_paths: dict[str, str] = {}
    for d in docs:
        md = Path(_doc_output_dirs[d["filename"]]) / FILE_INITIAL_PAGES
        if md.is_file():
            _initial_paths[d["path"]] = str(md)

    dummy_state: IngestionState = {
        "source_folder":        str(folder),
        "source_folder_slug":   slug,
        "documents":            docs,
        "doc_output_dirs":      _doc_output_dirs,
        "initial_parsed_paths": _initial_paths,
        "ingestion_errors":     [],
    }

    print("Calling LLM once per doc…")
    out = check_documents(dummy_state)

    print(f"\nFolder decision : {out['decision']}")
    print(f"Folder remarks  : {out['remarks']}")
    print(f"Eligible        : {len(out.get('eligible_documents', []))}")
    print(f"Rejected        : {len(out.get('rejected_documents', []))}")
    print(f"Review dir      : {out.get('rejected_review_dir', '')}")
    print()
    print("Per-doc verdicts:")
    for fn, dec in out.get("document_decisions", {}).items():
        mark = "OK " if dec == "enough" else "REJ"
        remark = out.get("document_remarks", {}).get(fn, "")[:100]
        print(f"  [{mark}] {fn} — {remark}")
    if out.get("ingestion_errors"):
        print("\nErrors:")
        for e in out["ingestion_errors"]:
            print(f"  [{e['stage']}] {e.get('file','?')}: {str(e.get('traceback',''))[:200]}")
