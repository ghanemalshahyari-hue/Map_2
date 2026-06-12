"""
graph/fingerprints.py — sha256-gated cache for the per-doc upstream stages.

WHAT THE FINGERPRINT FILE IS:
  Every per-doc output folder (output/<safe_stem>/) may contain a sidecar
  file named `.stage_fingerprints.json`.  It is a flat dict mapping the
  artefact file name (e.g. "parsed.json", "chunks.jsonl") to the sha256 of
  the source document that produced it:

      {
        "initial_pages.md":       "<sha256>",
        "parsed.json":            "<sha256>",
        "diagnostics.json":       "<sha256>",
        "chunks.jsonl":           "<sha256>",
        "enriched_chunks.jsonl":  "<sha256>",
        "embeddings.npz":         "<sha256>"
      }

WHY IT EXISTS:
  Before this cache, every rerun recomputed Docling parses, chunks, and
  embeddings for byte-identical documents — turning a "nothing changed"
  rerun into a 20+ minute job.  Each upstream node now checks the sidecar
  first; if the fingerprint equals the source file's current sha256 AND
  the artefact is on disk, the node skips the heavy call and reuses the
  artefact.  The sha256 we already compute in utils/file_reader.py is the
  only source of truth — we never rely on mtime.

CONTRACT FOR STAGES:
  - All-or-nothing: a stage that writes multiple artefacts (e.g.
    convert_document writes parsed.json + diagnostics.json) must write a
    fingerprint for every one and may only skip when every one is fresh.
    Any missing file or mismatched fingerprint → full re-run.
  - Missing or malformed `.stage_fingerprints.json` is treated as cache
    miss.  Never partially skip.
  - Cache-hit audit entries are appended to `ingestion_errors` with
    `stage="<stage>:cached"` so they flow through the existing skip
    tolerance (entries ending in `:skipped` or `:cached` do not flip
    ingestion_status to "partial").
  - FORCE_REPARSE=1 in `.env` (-> cfg.force_reparse) short-circuits the
    gate so every stage does the full work.  Default is 0.
"""
from __future__ import annotations

import json
from pathlib import Path

# The sidecar file name.  Lives inside output/<stem>/ next to the stage
# artefacts.  Dot-prefix hides it from `ls` by default but stays visible
# to `ls -la` when a human wants to inspect the cache state.
FINGERPRINT_FILE = ".stage_fingerprints.json"


def _fp_path(doc_out_dir: Path | str) -> Path:
    """Absolute path to the .stage_fingerprints.json sidecar for this doc."""
    return Path(doc_out_dir) / FINGERPRINT_FILE


def read_fingerprints(doc_out_dir: Path | str) -> dict[str, str]:
    """Return the per-doc fingerprint dict.

    Missing file → empty dict.  Malformed JSON → empty dict (cache miss).
    We do NOT raise — a corrupt sidecar must degrade gracefully to a full
    re-run, never break ingestion.
    """
    fp = _fp_path(doc_out_dir)
    if not fp.is_file():
        return {}
    try:
        data = json.loads(fp.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            return {}
        # Coerce values to strings defensively; any non-string entry is
        # treated as "no fingerprint" so the stage re-runs.
        return {k: v for k, v in data.items() if isinstance(v, str)}
    except (OSError, json.JSONDecodeError):
        return {}


def write_fingerprint(
    doc_out_dir: Path | str,
    artefact_name: str,
    sha256: str,
) -> None:
    """Record one artefact's fingerprint, preserving sibling entries.

    Read-modify-write so stages running in sequence (and standalone reruns
    of a single node) never clobber fingerprints for artefacts they did
    not produce themselves.
    """
    data = read_fingerprints(doc_out_dir)
    data[artefact_name] = sha256
    fp = _fp_path(doc_out_dir)
    fp.parent.mkdir(parents=True, exist_ok=True)
    fp.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")


def is_artefact_fresh(
    doc_out_dir: Path | str,
    artefact_name: str,
    expected_sha256: str,
    artefact_path: Path | str,
) -> bool:
    """Return True iff `artefact_path` exists on disk AND its recorded
    fingerprint equals `expected_sha256`.

    Both conditions must hold.  An artefact file on disk without a
    matching fingerprint entry is considered stale (cache miss), and a
    fingerprint entry without the file on disk is also a cache miss.
    """
    if not expected_sha256:
        return False
    if not Path(artefact_path).is_file():
        return False
    recorded = read_fingerprints(doc_out_dir).get(artefact_name)
    return recorded == expected_sha256


def all_fresh(
    doc_out_dir: Path | str,
    expected_sha256: str,
    artefacts: dict[str, Path | str],
) -> bool:
    """Convenience: True iff every (name → path) pair in `artefacts` is
    fresh for the same `expected_sha256`.

    Stages that produce more than one artefact per doc call this instead
    of doing the all-or-nothing check themselves.
    """
    if not expected_sha256:
        return False
    fingerprints = read_fingerprints(doc_out_dir)
    for name, path in artefacts.items():
        if fingerprints.get(name) != expected_sha256:
            return False
        if not Path(path).is_file():
            return False
    return True
