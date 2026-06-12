"""utils/file_normalizer.py
===========================
Single source of truth for which file formats this pipeline accepts,
plus a pre-parse normalization layer that converts legacy Microsoft
Office binary / template formats into a Docling-supported format via
LibreOffice headless before Docling sees them.

EXTENSION SETS
--------------
DOCLING_NATIVE_EXTENSIONS
    Formats Docling 2.89.0 parses directly.  Verified against the
    pinned source at libs/docling-2.89.0/docling/datamodel/base_models.py
    (FormatToExtensions).  PDF version (1.0-2.0) is not a separate
    extension — PDF is PDF, Docling's PDF backend handles all versions;
    scanned / image-only PDFs are covered by the existing selective-OCR
    path in graph/nodes/convert_document.py.

LEGACY_OFFICE_EXTENSIONS
    Pre-2007 Microsoft Office binary / template formats + RTF.  Docling
    cannot parse these directly; LibreOffice headless converts them to
    the modern OOXML equivalent before Docling parses the converted
    copy.  Mapping: ext -> target-format (the `--convert-to` value
    passed to `soffice`).

SUPPORTED_EXTENSIONS
    The union of the two above.  utils/file_reader.py, the retrieval-
    side glossary walker, and any other code that walks the corpus
    should read this set from here so the lists never drift.

NORMALIZATION
-------------
`normalize_document(path)` returns a NormalizedInput describing where
Docling should read from and whether a temp file needs cleaning up.

- Native format: parse_path == original_path, is_temp=False.
- Legacy format: LibreOffice is invoked; a converted copy is written
  into a fresh temp directory; parse_path points there.  Callers must
  invoke `.cleanup()` (or use it in a try/finally) to delete the
  temp directory once parsing is done.

When LibreOffice is missing the call raises LibreOfficeUnavailableError
with an actionable install hint.  When conversion runs but produces
no output the call raises ConversionFailedError carrying soffice's
stderr.  The calling node catches either and records a skip-and-log
entry in `ingestion_errors` — it never aborts the folder.

LIBREOFFICE DISCOVERY
---------------------
Looked for in this order:

  1. `soffice` on PATH
  2. `libreoffice` on PATH
  3. /Applications/LibreOffice.app/Contents/MacOS/soffice  (macOS default)
  4. /usr/bin/libreoffice                                  (Debian/Ubuntu default)
  5. /usr/bin/soffice                                      (some distros)

The first match wins.  Anything else means "not installed" from the
pipeline's perspective.

References
----------
- Docling supported formats: libs/docling-2.89.0/docling/datamodel/
  base_models.py (FormatToExtensions dict).
- LibreOffice headless conversion docs: `soffice --help` + the
  official "Using LibreOffice in the command line" guide on
  help.libreoffice.org.
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path


# ---------------------------------------------------------------------------
# EXTENSIONS
# ---------------------------------------------------------------------------

# Lowercase-including-leading-dot so `Path.suffix.lower()` matches directly.
DOCLING_NATIVE_EXTENSIONS: frozenset[str] = frozenset({
    # Word — modern Office Open XML family
    ".docx", ".dotx", ".docm", ".dotm",
    # PowerPoint — modern Office Open XML family
    ".pptx", ".potx", ".ppsx", ".pptm", ".potm", ".ppsm",
    # Excel — modern Office Open XML family (Docling parses the .xlsm macro
    # variant too; tabular chunks may look different from prose but they
    # flow through the pipeline cleanly).
    ".xlsx", ".xlsm",
    # PDF (any version)
    ".pdf",
    # Plain prose
    ".txt", ".md",
    # HTML
    ".html", ".htm",
})


# Legacy Microsoft Office binary / template formats and RTF.  Each value is
# the target format passed to `soffice --convert-to <target>`.  We always
# convert upward into the OOXML equivalent (docx / pptx / xlsx) because
# that is what Docling 2.89.0's native parsers accept.
LEGACY_OFFICE_EXTENSIONS: dict[str, str] = {
    # Word — binary + template + RTF interchange
    ".doc":  "docx",
    ".dot":  "docx",
    ".rtf":  "docx",
    # PowerPoint — binary + template + slideshow
    ".ppt":  "pptx",
    ".pot":  "pptx",
    ".pps":  "pptx",
    # Excel — binary + template + binary-workbook (.xlsb)
    ".xls":  "xlsx",
    ".xlt":  "xlsx",
    ".xlsb": "xlsx",
}


# Union: the canonical "what this pipeline accepts" set.
SUPPORTED_EXTENSIONS: frozenset[str] = (
    DOCLING_NATIVE_EXTENSIONS | frozenset(LEGACY_OFFICE_EXTENSIONS.keys())
)


# ---------------------------------------------------------------------------
# ERRORS
# ---------------------------------------------------------------------------

class NormalizationError(RuntimeError):
    """Base class for pre-parse normalization failures."""


class LibreOfficeUnavailableError(NormalizationError):
    """soffice / libreoffice could not be located on this host.

    The skip-and-log handler in each convert node prints this message
    verbatim, so make sure it stays actionable.
    """


class ConversionFailedError(NormalizationError):
    """LibreOffice ran but did not produce the expected output file."""


# ---------------------------------------------------------------------------
# RESULT
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class NormalizedInput:
    """Where Docling should read from + how to clean up afterwards.

    Callers should treat `parse_path` as the file to pass to
    `DocumentConverter.convert(...)`, keep using `original_path` for
    all bookkeeping (filename, source_doc payload, sha256 — we never
    re-hash the converted copy), and invoke `.cleanup()` in a finally
    block so temp directories for converted files do not accumulate.
    """
    parse_path: Path
    original_path: Path
    is_temp: bool
    conversion_note: str | None   # e.g. "libreoffice .doc -> .docx in 1.23s"

    def cleanup(self) -> None:
        """Remove the temp directory for converted files.  Idempotent."""
        if self.is_temp:
            shutil.rmtree(self.parse_path.parent, ignore_errors=True)


# ---------------------------------------------------------------------------
# LIBREOFFICE DISCOVERY
# ---------------------------------------------------------------------------

_SOFFICE_PATH_NAMES = ("soffice", "libreoffice")

_SOFFICE_ABSOLUTE_CANDIDATES: tuple[str, ...] = (
    # macOS — default install location when the user has the GUI app
    # but has not added the CLI to PATH.
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    # Common Linux paths (Debian/Ubuntu/Fedora).
    "/usr/bin/libreoffice",
    "/usr/bin/soffice",
    "/usr/local/bin/soffice",
)


def _find_soffice() -> str | None:
    """Locate a LibreOffice binary; return None if none is found."""
    for name in _SOFFICE_PATH_NAMES:
        found = shutil.which(name)
        if found:
            return found
    for cand in _SOFFICE_ABSOLUTE_CANDIDATES:
        if Path(cand).is_file():
            return cand
    return None


def is_libreoffice_available() -> bool:
    """True when `soffice` / `libreoffice` is callable on this host."""
    return _find_soffice() is not None


# ---------------------------------------------------------------------------
# CONVERSION
# ---------------------------------------------------------------------------

# Hard cap on a single LibreOffice invocation.  Old scanned-into-Word
# docs with embedded images can take a while; 180 s is generous enough
# for real-world cases without hanging the pipeline indefinitely.
_SOFFICE_TIMEOUT_SECONDS = 180


def normalize_document(path: Path | str) -> NormalizedInput:
    """Return a NormalizedInput pointing at a Docling-ingestible file.

    - Native format -> parse_path == original_path, no conversion.
    - Legacy format -> soffice headless conversion into a fresh temp
      directory; parse_path points at the converted copy.  The caller
      MUST invoke `.cleanup()` once parsing is done.

    Raises
    ------
    LibreOfficeUnavailableError
        Extension is legacy but no LibreOffice binary is on this host.
    ConversionFailedError
        LibreOffice ran but the expected output file is missing.
    NormalizationError
        Extension is not in SUPPORTED_EXTENSIONS.
    """
    src = Path(path).resolve()
    ext = src.suffix.lower()

    if ext in DOCLING_NATIVE_EXTENSIONS:
        return NormalizedInput(
            parse_path=src,
            original_path=src,
            is_temp=False,
            conversion_note=None,
        )

    if ext not in LEGACY_OFFICE_EXTENSIONS:
        raise NormalizationError(
            f"Unsupported extension {ext!r}. Supported extensions: "
            f"{sorted(SUPPORTED_EXTENSIONS)}."
        )

    target_format = LEGACY_OFFICE_EXTENSIONS[ext]

    soffice = _find_soffice()
    if soffice is None:
        raise LibreOfficeUnavailableError(
            f"Cannot normalize legacy Office file {src.name!r} (extension "
            f"{ext!r}) because LibreOffice is not installed on this host. "
            "Install LibreOffice and re-run, or remove the legacy files "
            "from the inputs folder. "
            "macOS: `brew install --cask libreoffice`. "
            "Ubuntu 22.04: `apt-get install -y libreoffice`. "
            "Then verify with `soffice --version`."
        )

    tmpdir = Path(tempfile.mkdtemp(prefix="docling_normalize_"))
    started = time.monotonic()
    cmd = [
        soffice,
        "--headless",
        "--convert-to", target_format,
        "--outdir", str(tmpdir),
        str(src),
    ]

    try:
        completed = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=_SOFFICE_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as exc:
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise ConversionFailedError(
            f"LibreOffice timed out after {_SOFFICE_TIMEOUT_SECONDS}s "
            f"converting {src.name!r}. stderr so far: "
            f"{(exc.stderr or b'').decode('utf-8', 'replace')[:400]!r}"
        ) from exc

    elapsed = time.monotonic() - started

    # Expected output location: <tmpdir>/<src_stem>.<target_format>
    out_path = tmpdir / f"{src.stem}.{target_format}"

    if completed.returncode != 0 or not out_path.is_file():
        stderr = (completed.stderr or "").strip()
        stdout = (completed.stdout or "").strip()
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise ConversionFailedError(
            f"LibreOffice failed to convert {src.name!r} to .{target_format}. "
            f"exit={completed.returncode}. stderr={stderr[:400]!r}. "
            f"stdout={stdout[:400]!r}."
        )

    return NormalizedInput(
        parse_path=out_path,
        original_path=src,
        is_temp=True,
        conversion_note=(
            f"libreoffice {ext} -> .{target_format} in {elapsed:.2f}s"
        ),
    )
