"""graph/generation/source_file_reader.py — read user source files to text.

The Phase 3 two-file workflow takes a Warning Order and an Intel Report
(and optionally additional files) as inputs. This module converts each
file to markdown text suitable for LLM extraction.

Format support:
  * ``.txt`` / ``.md``         — read as UTF-8 directly.
  * ``.pdf``                   — Docling text-layer converter; on garbage
                                 output, caller may retry with OCR.
  * ``.docx``                  — Docling (format auto-detected by Docling).
  * anything else              — rejected.

Length cap:
  Long Intel Reports can blow the extractor LLM's context budget. Each
  file is truncated to ``MAX_CHARS_PER_FILE`` characters (default
  48 000 ≈ ~12 K tokens). When truncation happens, a clear Arabic
  audit notice is appended to the text so the LLM knows the file was
  cut. Caller receives a list of ``ReadFile`` records with the flag.

Structure-aware slicing is a v2 concern; v1 takes the head of the file.
"""

from __future__ import annotations

import gc
import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

__all__ = [
    "SourceFileKind",
    "ReadFile",
    "SourceFileReadError",
    "read_source_file",
    "read_source_files",
    "MAX_CHARS_PER_FILE",
]


# 48 000 ~ 12 K tokens — fits comfortably inside a 32K-context model
# with room for the system prompt + extraction schema. Bump via env
# PHASE3_SOURCE_FILE_MAX_CHARS if the user confirms their model has
# more headroom.
import os
try:
    MAX_CHARS_PER_FILE = int(os.getenv("PHASE3_SOURCE_FILE_MAX_CHARS", "48000"))
except ValueError:
    MAX_CHARS_PER_FILE = 48_000


_TRUNCATION_NOTICE_AR = (
    "\n\n[...تنبيه: تم اقتطاع هذا الملف إلى {kept:,} حرفاً من إجمالي "
    "{total:,} بسبب حد طول المُدخَل. المحتوى أعلاه هو بداية الملف — "
    "المُستخرِج يعلم أن بعض المحتوى قد يكون مفقوداً...]"
)


# Known canonical kinds. Free-form "other" also accepted for extra files
# beyond the two core sources.
SourceFileKind = str  # "warning_order" | "intel_report" | "other"


class SourceFileReadError(Exception):
    """Raised when a source file cannot be read / parsed to usable text."""


@dataclass(frozen=True)
class ReadFile:
    """One source file after reading + optional truncation.

    Attributes:
        path:      original on-disk path (may be outside the repo).
        kind:      logical role — "warning_order" / "intel_report" / "other".
                   Steers the extractor's per-field ``source_hint`` logic.
        text:      markdown / plain text extracted from the file,
                   possibly truncated to ``MAX_CHARS_PER_FILE`` chars
                   (with an Arabic audit notice appended).
        sha256:    hex digest of the ORIGINAL file bytes (not the
                   truncated text) — goes into the extractor cache key
                   so a file swap invalidates the cache.
        original_chars:   character count of the full text before truncation.
        truncated: True iff the returned ``text`` is shorter than the
                   original full conversion (the audit notice is also
                   appended in that case).
    """

    path: Path
    kind: SourceFileKind
    text: str
    sha256: str
    original_chars: int
    truncated: bool


# --------------------------------------------------------------- helpers

def _file_sha256(path: Path) -> str:
    """SHA-256 of file bytes — 8 KB chunked."""
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def _truncate_if_needed(text: str, max_chars: int) -> tuple[str, int, bool]:
    """Return ``(text_out, original_char_count, was_truncated)``."""
    n = len(text)
    if n <= max_chars:
        return text, n, False
    kept = text[:max_chars]
    notice = _TRUNCATION_NOTICE_AR.format(kept=max_chars, total=n)
    return kept + notice, n, True


def _read_text_file(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def _read_with_docling(path: Path) -> str:
    """Convert PDF / DOCX to markdown via the shared Docling converter."""
    # Import here to avoid pulling Docling's weight into processes that
    # only read .txt files.
    from graph.docling_converters import get_textlayer_converter

    converter = get_textlayer_converter()
    result = converter.convert(str(path))
    try:
        # Prefer markdown export — readable by the LLM, preserves headings.
        md = result.document.export_to_markdown()
    finally:
        # Release the DoclingDocument promptly; extractor only needs text.
        del result
        gc.collect()
    return md


# --------------------------------------------------------------- main entry

def read_source_file(
    path: str | Path,
    kind: SourceFileKind,
    *,
    max_chars: int | None = None,
) -> ReadFile:
    """Read one source file into a :class:`ReadFile`.

    ``kind`` must be one of ``"warning_order"`` / ``"intel_report"`` /
    ``"other"``. The value is echoed into the LLM's context header so
    the extractor knows which file it's looking at — unknown values are
    accepted but treated as ``"other"`` for prompt-labelling purposes.

    Raises:
        FileNotFoundError:   path does not exist.
        SourceFileReadError: unsupported suffix or conversion failed.
    """
    p = Path(path).expanduser().resolve()
    if not p.is_file():
        raise FileNotFoundError(f"source file not found: {p}")

    suffix = p.suffix.lower()
    if suffix in {".txt", ".md"}:
        text = _read_text_file(p)
    elif suffix in {".pdf", ".docx"}:
        try:
            text = _read_with_docling(p)
        except Exception as e:  # Docling can raise many exception types
            raise SourceFileReadError(
                f"{p}: Docling conversion failed ({type(e).__name__}: {e})"
            ) from e
    else:
        raise SourceFileReadError(
            f"{p}: unsupported extension {suffix!r}. Supported: .txt, .md, .pdf, .docx"
        )

    if text is None or not text.strip():
        raise SourceFileReadError(f"{p}: conversion produced empty text")

    cap = max_chars if max_chars is not None else MAX_CHARS_PER_FILE
    text_out, original, truncated = _truncate_if_needed(text, cap)
    sha = _file_sha256(p)

    return ReadFile(
        path=p,
        kind=kind,
        text=text_out,
        sha256=sha,
        original_chars=original,
        truncated=truncated,
    )


def read_source_files(
    warning_order: str | Path | None,
    intel_report: str | Path | None,
    extra: Iterable[tuple[str | Path, SourceFileKind]] | None = None,
    *,
    max_chars: int | None = None,
) -> list[ReadFile]:
    """Convenience wrapper: read the canonical pair + any extras in one shot.

    Either of ``warning_order`` / ``intel_report`` may be ``None`` if the
    user supplies only one of them. At least one canonical file OR at
    least one ``extra`` file must be provided — the extractor needs
    something to read.
    """
    files: list[ReadFile] = []
    if warning_order is not None:
        files.append(read_source_file(warning_order, "warning_order", max_chars=max_chars))
    if intel_report is not None:
        files.append(read_source_file(intel_report, "intel_report", max_chars=max_chars))
    if extra is not None:
        for path, kind in extra:
            files.append(read_source_file(path, kind or "other", max_chars=max_chars))
    if not files:
        raise SourceFileReadError(
            "read_source_files: no files provided (need at least a Warning Order, "
            "an Intel Report, or one `extra` entry)."
        )
    return files


# ---------------------------------------------------------------- standalone
if __name__ == "__main__":
    import json
    import sys

    if len(sys.argv) < 3 or len(sys.argv) % 2 == 0:
        print(
            "usage: python -m graph.generation.source_file_reader "
            "<kind> <path> [<kind> <path> ...]",
            file=sys.stderr,
        )
        print("  <kind> one of: warning_order | intel_report | other", file=sys.stderr)
        sys.exit(2)

    pairs = list(zip(sys.argv[1::2], sys.argv[2::2]))
    results: list[ReadFile] = []
    for kind, path in pairs:
        rf = read_source_file(path, kind)
        results.append(rf)
        print(
            f"OK {rf.path.name} kind={rf.kind} sha={rf.sha256[:12]} "
            f"chars={len(rf.text):,} (original={rf.original_chars:,}; "
            f"{'TRUNCATED' if rf.truncated else 'full'})"
        )
    # Also print the first 400 chars of each file for eyeball inspection.
    print()
    for rf in results:
        preview = rf.text[:400].replace("\n", " ⏎ ")
        print(f"--- {rf.kind} preview ---\n{preview}\n")
