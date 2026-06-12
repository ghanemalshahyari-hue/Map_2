"""
utils/file_reader.py
====================
Helper for enumerating documents in an ingestion folder.

list_documents() scans a folder for the supported document types
(modern Office Open XML formats, PDF, plain text, HTML, plus legacy
Microsoft Office binary / template formats) and returns a list of
dicts describing each file: path, filename, SHA-256 fingerprint, and
size in bytes.

The authoritative set of supported extensions lives in
utils/file_normalizer.py (SUPPORTED_EXTENSIONS).  Legacy binary
Office formats (.doc, .ppt, .xls, their templates, .rtf, .xlsb) flow
through the LibreOffice-backed normalization layer inside each
convert node before Docling sees them.

IMPORTANT RULE (enforced throughout the project):
  Filenames must NEVER be sent to an AI/LLM.  The AI must judge documents
  purely by their content, not by what they are called.  list_documents()
  does store filenames (we need them for bookkeeping in the database), but
  it is the caller's responsibility not to forward them to any AI call.
  See check_documents.py for where that rule is enforced.

NOTE ON sha256:
  The fingerprint is always computed over the ORIGINAL file bytes, not
  over any temporary copy produced by the normalizer.  This keeps the
  cache gate stable: re-ingesting the same .doc file always hashes to
  the same value, regardless of which temp directory the conversion
  happened to land in.
"""

import hashlib    # used to compute the SHA-256 fingerprint of a file
import os         # used for file/folder path operations

from utils.file_normalizer import SUPPORTED_EXTENSIONS


def list_documents(folder_path: str) -> list[dict]:
    """
    Scan folder_path and return a list of dicts — one per supported document.

    Each dict contains:
        "path"     — the full file path on disk   e.g. "/data/docs/report.pdf"
        "filename" — just the file name           e.g. "report.pdf"
        "sha256"   — a SHA-256 fingerprint of the file's bytes.
                     A 64-character string that uniquely represents the file's
                     content.  Any change to the bytes produces a completely
                     different hash.  Used by upsert_to_qdrant to skip
                     unchanged documents (hash-gated re-ingest).
        "size"     — file size in bytes            e.g. 204800

    Files are returned sorted alphabetically by filename so the order is
    consistent across runs.

    Only extensions listed in utils/file_normalizer.SUPPORTED_EXTENSIONS
    are included — everything else is ignored.
    """
    results = []

    # Try to list the folder.  If it doesn't exist or can't be read,
    # return an empty list instead of crashing.
    try:
        entries = sorted(os.listdir(folder_path))
    except OSError:
        return results

    for name in entries:
        # Get the file extension, lowercased so ".PDF" and ".pdf" both work.
        ext = os.path.splitext(name)[1].lower()

        # Skip files we don't support (images, spreadsheets, etc.)
        if ext not in SUPPORTED_EXTENSIONS:
            continue

        full_path = os.path.join(folder_path, name)

        # Skip anything that isn't a plain file (e.g. sub-folders)
        if not os.path.isfile(full_path):
            continue

        # Read the file's raw bytes once so we can compute both the
        # SHA-256 fingerprint and the file size in one pass.
        # If the file can't be read (permissions issue, etc.), skip it.
        try:
            with open(full_path, "rb") as f:
                file_bytes = f.read()
            sha256 = hashlib.sha256(file_bytes).hexdigest()
            size = len(file_bytes)
        except OSError:
            continue

        results.append({
            "path": full_path,      # used to open the file later
            "filename": name,        # used as the source_doc label in Qdrant
            "sha256": sha256,        # used to detect whether the file changed
            "size": size,            # stored for reference
        })

    return results
