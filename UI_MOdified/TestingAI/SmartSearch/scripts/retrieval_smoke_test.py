"""
scripts/retrieval_smoke_test.py
=================================
Repo-native, READ-ONLY smoke test for the Phase 2 retrieval stack.

The goal is to answer one question in a single command:

    "Does search() actually work against my currently-ingested
     doctrine collection, given everything the pipeline has built?"

It does that by exercising eight orthogonal concerns against a
real Qdrant collection:

  1. Collection discovery                (_registry manifest + live points_count)
  2. Legacy-file presence in the corpus  (extension classification of source_doc
                                          values — did the new LibreOffice path
                                          land any .doc/.rtf/.xls etc.?)
  3. Acronym retrieval                   (sample rows from data/doctrine/acronyms.csv,
                                          query each, confirm a relevant hit)
  4. Doctrine cross-reference retrieval  (sample observed cross_refs, filter by
                                          them, confirm every hit carries the
                                          filtered reference)
  5. Natural-language retrieval          (fixed realistic doctrine questions)
  6. Filter integrity                    (source_doc + chunk_type filters; every
                                          returned hit must satisfy the filter)
  7. Reranker impact                     (same query with/without reranker;
                                          report top-3 overlap)
  8. Glossary impact                     (query containing a known acronym;
                                          verify expanded_query differs)

NOTHING in this script writes to Qdrant, touches the filesystem
outside of stdout, or re-runs ingestion.  It is safe to run on a
live corpus at any time.

USAGE
-----
  python scripts/retrieval_smoke_test.py
  python scripts/retrieval_smoke_test.py --collection ingest__doctrine__bgem3
  python scripts/retrieval_smoke_test.py --collection ingest__foo__bgem3 \\
      --max-glossary 5 --max-cross-refs 5
  python scripts/retrieval_smoke_test.py --top-k 3 --verbose

Without `--collection` the script picks the "largest" collection
from `_registry` (most live points).  This matches how a human
would pick the best-populated collection to test.

Exit code: 0 if no FAIL rows landed in the summary, 1 otherwise.
INFO rows are informational and never flip the exit code.
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable


# ---------------------------------------------------------------------------
# Repo-root sys.path injection — so `python scripts/<name>.py ...` and
# `python -m scripts.<name> ...` both resolve the `graph` / `utils` imports.
# Matches the pattern used by scripts/peek_qdrant.py.
# ---------------------------------------------------------------------------
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from dotenv import load_dotenv  # noqa: E402

# load_dotenv BEFORE any graph/ import — every singleton in the
# project assumes env vars are resolved at import time.
load_dotenv()

from graph.doctrine_vocab import load_acronyms_dict                 # noqa: E402
from graph.retrieval.registry import (                                # noqa: E402
    RegistryEntry,
    _get_client,
    list_registry_entries,
)
from graph.retrieval.schema import SearchRequest                     # noqa: E402
from graph.retrieval.search import search                            # noqa: E402
from utils.file_normalizer import (                                    # noqa: E402
    DOCLING_NATIVE_EXTENSIONS,
    LEGACY_OFFICE_EXTENSIONS,
)


# ---------------------------------------------------------------------------
# RESULT BOOKKEEPING
# ---------------------------------------------------------------------------

@dataclass
class TestResult:
    name: str
    status: str          # "PASS" | "FAIL" | "INFO"
    message: str = ""


class Report:
    """Running tally.  Each section appends one or more TestResult."""
    def __init__(self) -> None:
        self._rows: list[TestResult] = []

    def add(self, result: TestResult) -> None:
        self._rows.append(result)
        tag = f"[{result.status}]".ljust(7)
        print(f"  {tag} {result.name}" + (f" — {result.message}" if result.message else ""))

    def summary(self) -> tuple[int, int, int]:
        pass_ = sum(1 for r in self._rows if r.status == "PASS")
        fail = sum(1 for r in self._rows if r.status == "FAIL")
        info = sum(1 for r in self._rows if r.status == "INFO")
        return pass_, fail, info

    @property
    def rows(self) -> list[TestResult]:
        return list(self._rows)


# ---------------------------------------------------------------------------
# DEFAULT NATURAL-LANGUAGE QUERIES
# ---------------------------------------------------------------------------
# Chosen so a human can eyeball whether the top hit is sensible for
# a US Army doctrine corpus.  Kept terse and varied.
_NL_QUERIES: tuple[str, ...] = (
    "What is the commander's intent?",
    "How does a commander develop a course of action?",
    "What are the principles of mission command?",
    "What are the warfighting functions?",
    "What steps are in the military decision-making process?",
)


# A doctrine acronym that SHOULD live in data/doctrine/acronyms.csv by
# default.  Used by the glossary-impact test below to check that
# use_glossary=True rewrites the query and use_glossary=False does not.
_GLOSSARY_PROBE_ACRONYM = "COA"
_GLOSSARY_PROBE_QUERY = "how does the commander develop a COA?"


# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------

def _classify_extension(filename: str) -> str:
    """Return 'native' | 'legacy' | 'unknown' for a source_doc filename."""
    ext = Path(filename).suffix.lower()
    if ext in DOCLING_NATIVE_EXTENSIONS:
        return "native"
    if ext in LEGACY_OFFICE_EXTENSIONS:
        return "legacy"
    return "unknown"


def _facet(client: Any, collection: str, key: str, limit: int = 200) -> list[tuple[str, int]]:
    """Wrap client.facet, fail-soft: return [] on any error."""
    try:
        response = client.facet(
            collection_name=collection, key=key, limit=limit, exact=False
        )
    except Exception as exc:
        print(f"  (facet({key!r}) failed: {exc})")
        return []
    hits = getattr(response, "hits", None) or []
    return [(str(getattr(h, "value", "")), int(getattr(h, "count", 0))) for h in hits]


def _pick_best_collection(entries: list[RegistryEntry]) -> RegistryEntry | None:
    """Pick the collection with the most live points; break ties by manifest."""
    if not entries:
        return None
    def _key(e: RegistryEntry) -> tuple[int, int, str]:
        live = e.live_points_count if e.live_points_count is not None else -1
        return (live, e.manifest_chunk_count, e.slug)
    return max(entries, key=_key)


def _short(s: str, n: int = 80) -> str:
    s = (s or "").replace("\n", " ")
    return s if len(s) <= n else s[: n - 1] + "…"


def _do_search(collection: str, query: str, **kwargs: Any):
    """Thin wrapper around search() with defaults appropriate for a smoke test."""
    request = SearchRequest(
        query=query,
        collection=collection,
        top_n_in=kwargs.pop("top_n_in", 50),
        top_k_out=kwargs.pop("top_k_out", 5),
        use_reranker=kwargs.pop("use_reranker", True),
        use_glossary=kwargs.pop("use_glossary", True),
        use_hyde=kwargs.pop("use_hyde", False),
        debug=kwargs.pop("debug", False),
        filters=kwargs.pop("filters", {}),
    )
    return search(request)


# ---------------------------------------------------------------------------
# SECTION 1 — COLLECTION DISCOVERY
# ---------------------------------------------------------------------------

def section_discovery(report: Report, entries: list[RegistryEntry],
                      chosen: RegistryEntry) -> None:
    print("\n--- 1. Collection discovery ---")
    if not entries:
        report.add(TestResult("registry.has_entries", "FAIL",
                              "_registry returned zero entries"))
        return

    report.add(TestResult(
        "registry.has_entries", "PASS",
        f"found {len(entries)} collection(s) in _registry",
    ))

    # Print each entry so the operator can eyeball the matrix.
    for e in entries:
        tag = "  (picked)" if e.collection_name == chosen.collection_name else ""
        live = e.live_points_count if e.live_points_count is not None else "—"
        stale = " STALE" if e.counts_disagree else ""
        print(f"    - {e.collection_name}  manifest={e.manifest_chunk_count}  "
              f"live={live}{stale}{tag}")

    if chosen.live_points_count is None or chosen.live_points_count == 0:
        report.add(TestResult(
            "chosen_collection.has_live_points", "FAIL",
            f"{chosen.collection_name!r} has no live points — cannot search",
        ))
    else:
        report.add(TestResult(
            "chosen_collection.has_live_points", "PASS",
            f"{chosen.collection_name!r} has {chosen.live_points_count} live points",
        ))


# ---------------------------------------------------------------------------
# SECTION 2 — LEGACY-FILE PRESENCE IN THE INGESTED COLLECTION
# ---------------------------------------------------------------------------

def section_legacy(report: Report, collection: str) -> dict[str, list[str]]:
    """Return {category: [filenames...]} so later sections can reuse."""
    print("\n--- 2. Legacy-file presence in the ingested corpus ---")
    client = _get_client()
    source_docs = _facet(client, collection, "source_doc", limit=500)

    if not source_docs:
        report.add(TestResult(
            "facet.source_doc", "FAIL",
            "facet(source_doc) returned no values — either the index is "
            "missing or the collection is empty",
        ))
        return {"native": [], "legacy": [], "unknown": []}

    report.add(TestResult(
        "facet.source_doc", "PASS",
        f"{len(source_docs)} distinct source_doc values",
    ))

    buckets: dict[str, list[str]] = {"native": [], "legacy": [], "unknown": []}
    for name, _count in source_docs:
        buckets[_classify_extension(name)].append(name)

    print(f"    native   : {len(buckets['native'])} files")
    print(f"    legacy   : {len(buckets['legacy'])} files "
          "(pre-2007 .doc/.ppt/.xls + templates + .rtf)")
    print(f"    unknown  : {len(buckets['unknown'])} files "
          "(extensions outside SUPPORTED_EXTENSIONS)")

    if buckets["legacy"]:
        print("    legacy sample:")
        for name in buckets["legacy"][:5]:
            print(f"      - {name}")
        report.add(TestResult(
            "corpus.has_legacy_files", "PASS",
            f"{len(buckets['legacy'])} file(s) arrived via LibreOffice normalization",
        ))
    else:
        report.add(TestResult(
            "corpus.has_legacy_files", "INFO",
            "no legacy-format files in the current corpus — "
            "the LibreOffice path is untested end-to-end on this run",
        ))

    if buckets["unknown"]:
        report.add(TestResult(
            "corpus.unknown_extensions", "INFO",
            f"{len(buckets['unknown'])} file(s) with unrecognised extensions "
            f"(sample: {buckets['unknown'][:3]})",
        ))

    return buckets


# ---------------------------------------------------------------------------
# SECTION 3 — ACRONYM RETRIEVAL
# ---------------------------------------------------------------------------

def section_acronyms(report: Report, collection: str, *, max_n: int,
                     top_k: int, verbose: bool) -> None:
    print(f"\n--- 3. Acronym retrieval (probing up to {max_n}) ---")
    acronyms = load_acronyms_dict()
    if not acronyms:
        report.add(TestResult(
            "acronyms.load", "FAIL",
            "data/doctrine/acronyms.csv loaded zero active entries",
        ))
        return
    report.add(TestResult(
        "acronyms.load", "PASS",
        f"{len(acronyms)} active entries in data/doctrine/acronyms.csv",
    ))

    # Deterministic sampling — alphabetical so re-runs are reproducible.
    sample = sorted(acronyms.items())[:max_n]

    for term, expansion in sample:
        query = f"What is {term}?"
        try:
            response = _do_search(collection, query, top_k_out=top_k,
                                  use_reranker=True, use_glossary=True)
        except Exception as exc:
            report.add(TestResult(
                f"acronym.{term}", "FAIL",
                f"search raised {type(exc).__name__}: {exc}",
            ))
            continue

        if not response.hits:
            report.add(TestResult(
                f"acronym.{term}", "FAIL", "search returned zero hits",
            ))
            continue

        # Did ANY top-k hit actually mention the acronym OR its expansion?
        needle_short = term.lower()
        needle_long = expansion.lower()
        def _mentions(h) -> bool:
            blob = f"{h.text} {h.heading_path}".lower()
            return needle_short in blob or needle_long in blob

        mentioning = [h for h in response.hits if _mentions(h)]
        top = response.hits[0]
        if mentioning:
            report.add(TestResult(
                f"acronym.{term}", "PASS",
                f"{len(mentioning)}/{len(response.hits)} hits mention "
                f"'{term}' or its expansion; top: "
                f"{top.source_doc} "
                f"¶{top.paragraph_number or '-'}",
            ))
        else:
            report.add(TestResult(
                f"acronym.{term}", "INFO",
                f"no hit mentioned '{term}' or '{expansion}' — "
                f"corpus may not cover this term; top hit: "
                f"{top.source_doc} ¶{top.paragraph_number or '-'}",
            ))

        if verbose:
            print(f"      top text: {_short(top.text, 100)}")


# ---------------------------------------------------------------------------
# SECTION 4 — DOCTRINE CROSS-REFERENCE RETRIEVAL
# ---------------------------------------------------------------------------

def section_cross_refs(report: Report, collection: str, *, max_n: int,
                       top_k: int) -> None:
    print(f"\n--- 4. Doctrine cross-reference retrieval (probing up to {max_n}) ---")
    client = _get_client()
    facets = _facet(client, collection, "cross_refs", limit=200)
    if not facets:
        report.add(TestResult(
            "cross_refs.facet", "INFO",
            "facet(cross_refs) returned nothing — this corpus does not "
            "carry extracted cross references (unusual for doctrine)",
        ))
        return

    report.add(TestResult(
        "cross_refs.facet", "PASS",
        f"{len(facets)} distinct cross_refs values in index",
    ))

    sample = [v for v, _ in facets[:max_n]]

    for ref in sample:
        query = ref
        try:
            response = _do_search(
                collection,
                query,
                top_k_out=top_k,
                use_reranker=True,
                use_glossary=False,   # references are codes; glossary is irrelevant
                filters={"cross_refs": ref},
            )
        except Exception as exc:
            report.add(TestResult(
                f"cross_ref.{ref}", "FAIL",
                f"search raised {type(exc).__name__}: {exc}",
            ))
            continue

        if not response.hits:
            report.add(TestResult(
                f"cross_ref.{ref}", "FAIL",
                f"filtered search returned zero hits even though the "
                f"facet reported this value exists",
            ))
            continue

        # Every returned hit MUST carry the filtered cross-ref.
        ok = all(ref in (h.cross_refs or []) for h in response.hits)
        top = response.hits[0]
        if ok:
            report.add(TestResult(
                f"cross_ref.{ref}", "PASS",
                f"{len(response.hits)}/{len(response.hits)} hits carry "
                f"cross_refs⊇{{{ref}}}; top: {top.source_doc} "
                f"¶{top.paragraph_number or '-'}",
            ))
        else:
            missing = sum(1 for h in response.hits if ref not in (h.cross_refs or []))
            report.add(TestResult(
                f"cross_ref.{ref}", "FAIL",
                f"{missing}/{len(response.hits)} hits are missing {ref!r} "
                f"in their cross_refs payload — filter integrity broken",
            ))


# ---------------------------------------------------------------------------
# SECTION 5 — NATURAL-LANGUAGE RETRIEVAL
# ---------------------------------------------------------------------------

def section_nl_queries(report: Report, collection: str, *, top_k: int,
                       verbose: bool) -> None:
    print("\n--- 5. Natural-language retrieval ---")
    for query in _NL_QUERIES:
        try:
            response = _do_search(collection, query, top_k_out=top_k)
        except Exception as exc:
            report.add(TestResult(
                f"nl.{_short(query, 40)}", "FAIL",
                f"search raised {type(exc).__name__}: {exc}",
            ))
            continue

        if not response.hits:
            report.add(TestResult(
                f"nl.{_short(query, 40)}", "FAIL", "no hits",
            ))
            continue

        top = response.hits[0]
        report.add(TestResult(
            f"nl.{_short(query, 40)}", "PASS",
            f"top: {top.source_doc} ¶{top.paragraph_number or '-'}  "
            f"rrf={top.rrf_score:.3f}  "
            f"rerank={top.rerank_score:+.3f}" if top.rerank_score is not None
            else f"top: {top.source_doc} ¶{top.paragraph_number or '-'}  "
                 f"rrf={top.rrf_score:.3f}",
        ))
        if verbose:
            print(f"      top text: {_short(top.text, 100)}")


# ---------------------------------------------------------------------------
# SECTION 6 — FILTER INTEGRITY
# ---------------------------------------------------------------------------

def section_filters(report: Report, collection: str, *, top_k: int,
                    source_doc_sample: str | None) -> None:
    print("\n--- 6. Filter integrity ---")

    # 6a — source_doc filter
    if source_doc_sample is None:
        report.add(TestResult(
            "filter.source_doc", "INFO",
            "no source_doc available to probe — skipping",
        ))
    else:
        try:
            response = _do_search(
                collection,
                "mission",          # a generic word likely to hit
                top_k_out=top_k,
                use_reranker=False,  # quicker; we're testing filters, not ranking
                use_glossary=False,
                filters={"source_doc": source_doc_sample},
            )
        except Exception as exc:
            report.add(TestResult(
                "filter.source_doc", "FAIL",
                f"search raised {type(exc).__name__}: {exc}",
            ))
        else:
            if not response.hits:
                report.add(TestResult(
                    "filter.source_doc", "FAIL",
                    f"no hits for source_doc={source_doc_sample!r} + 'mission'",
                ))
            else:
                ok = all(h.source_doc == source_doc_sample for h in response.hits)
                if ok:
                    report.add(TestResult(
                        "filter.source_doc", "PASS",
                        f"{len(response.hits)}/{len(response.hits)} hits have "
                        f"source_doc={source_doc_sample!r}",
                    ))
                else:
                    wrong = [h.source_doc for h in response.hits
                             if h.source_doc != source_doc_sample]
                    report.add(TestResult(
                        "filter.source_doc", "FAIL",
                        f"{len(wrong)} hit(s) violated the filter "
                        f"(sample offenders: {wrong[:3]})",
                    ))

    # 6b — chunk_type filter
    try:
        response = _do_search(
            collection,
            "operations",
            top_k_out=top_k,
            use_reranker=False,
            use_glossary=False,
            filters={"chunk_type": "body"},
        )
    except Exception as exc:
        report.add(TestResult(
            "filter.chunk_type", "FAIL",
            f"search raised {type(exc).__name__}: {exc}",
        ))
        return

    if not response.hits:
        report.add(TestResult(
            "filter.chunk_type", "INFO",
            "chunk_type=body yielded no hits — corpus may have no body chunks",
        ))
        return

    ok = all(h.chunk_type == "body" for h in response.hits)
    if ok:
        report.add(TestResult(
            "filter.chunk_type", "PASS",
            f"{len(response.hits)}/{len(response.hits)} hits have chunk_type=body",
        ))
    else:
        wrong = [h.chunk_type for h in response.hits if h.chunk_type != "body"]
        report.add(TestResult(
            "filter.chunk_type", "FAIL",
            f"{len(wrong)} hit(s) had the wrong chunk_type "
            f"(sample: {wrong[:3]})",
        ))


# ---------------------------------------------------------------------------
# SECTION 7 — RERANKER IMPACT
# ---------------------------------------------------------------------------

def section_reranker(report: Report, collection: str, *, top_k: int) -> None:
    print("\n--- 7. Reranker impact ---")
    query = "mission command philosophy and commander's intent"

    try:
        with_rr = _do_search(collection, query, top_k_out=top_k,
                             use_reranker=True, use_glossary=False)
        no_rr = _do_search(collection, query, top_k_out=top_k,
                           use_reranker=False, use_glossary=False)
    except Exception as exc:
        report.add(TestResult(
            "reranker.impact", "FAIL",
            f"search raised {type(exc).__name__}: {exc}",
        ))
        return

    if not with_rr.hits or not no_rr.hits:
        report.add(TestResult(
            "reranker.impact", "FAIL", "one of the two runs had zero hits",
        ))
        return

    ids_a = [h.point_id for h in with_rr.hits[:3]]
    ids_b = [h.point_id for h in no_rr.hits[:3]]
    shared = len(set(ids_a) & set(ids_b))

    top_a = with_rr.hits[0]
    top_b = no_rr.hits[0]
    same_top = top_a.point_id == top_b.point_id

    # "Reranker is doing something" = either top-1 differs or top-3 is not a
    # complete overlap.  A total overlap with identical ordering is a sign
    # the reranker did not reorder anything, which is fine for trivially
    # unambiguous queries but usually a miss on doctrine-shaped text.
    if (not same_top) or (shared < 3):
        report.add(TestResult(
            "reranker.impact", "PASS",
            f"reranker changed the order (top-3 shared: {shared}/3, "
            f"same top-1: {same_top}); "
            f"with: {top_a.source_doc} ¶{top_a.paragraph_number or '-'}, "
            f"without: {top_b.source_doc} ¶{top_b.paragraph_number or '-'}",
        ))
    else:
        report.add(TestResult(
            "reranker.impact", "INFO",
            "top-3 identical with and without the reranker — could be a "
            "trivially unambiguous query, or the reranker is a no-op here",
        ))


# ---------------------------------------------------------------------------
# SECTION 8 — GLOSSARY IMPACT
# ---------------------------------------------------------------------------

def section_glossary(report: Report, collection: str, *, top_k: int) -> None:
    print("\n--- 8. Glossary impact ---")
    acronyms = load_acronyms_dict()
    if _GLOSSARY_PROBE_ACRONYM not in acronyms:
        report.add(TestResult(
            "glossary.probe_seed", "INFO",
            f"acronym {_GLOSSARY_PROBE_ACRONYM!r} not in acronyms.csv — "
            "add it to enable this test",
        ))
        return

    probe_expansion = acronyms[_GLOSSARY_PROBE_ACRONYM]

    try:
        with_g = _do_search(collection, _GLOSSARY_PROBE_QUERY, top_k_out=top_k,
                            use_reranker=False, use_glossary=True, debug=True)
        no_g = _do_search(collection, _GLOSSARY_PROBE_QUERY, top_k_out=top_k,
                          use_reranker=False, use_glossary=False, debug=True)
    except Exception as exc:
        report.add(TestResult(
            "glossary.impact", "FAIL",
            f"search raised {type(exc).__name__}: {exc}",
        ))
        return

    exp_with = with_g.expanded_query or ""
    exp_no = no_g.expanded_query or _GLOSSARY_PROBE_QUERY

    # With glossary on, the expanded query must carry the CSV expansion
    # inline; with it off, it must equal the raw query.
    ok_with = probe_expansion.lower() in exp_with.lower()
    ok_no = exp_no.strip() == _GLOSSARY_PROBE_QUERY.strip()

    if ok_with and ok_no:
        report.add(TestResult(
            "glossary.impact", "PASS",
            f"use_glossary=True expanded {_GLOSSARY_PROBE_ACRONYM!r} inline; "
            f"use_glossary=False left the query untouched",
        ))
    elif not ok_with:
        report.add(TestResult(
            "glossary.impact", "FAIL",
            f"use_glossary=True did NOT inject the expansion "
            f"(got: {exp_with!r})",
        ))
    else:
        report.add(TestResult(
            "glossary.impact", "FAIL",
            f"use_glossary=False modified the query anyway "
            f"(got: {exp_no!r})",
        ))


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------

def _parse_args(argv: list[str]) -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="retrieval_smoke_test",
        description=(
            "READ-ONLY smoke test for the Phase 2 retrieval stack. "
            "Exercises collection discovery, legacy-file presence, acronym + "
            "cross-reference retrieval, natural-language search, filter "
            "integrity, reranker impact, and glossary impact against a live "
            "ingested collection."
        ),
    )
    p.add_argument(
        "--collection",
        help="Explicit collection name (e.g. ingest__doctrine__bgem3). "
             "If omitted, the collection with the most live points wins.",
    )
    p.add_argument(
        "--max-glossary", type=int, default=5,
        help="Number of acronyms from data/doctrine/acronyms.csv to probe (default 5).",
    )
    p.add_argument(
        "--max-cross-refs", type=int, default=5,
        help="Number of cross-reference values to probe (default 5).",
    )
    p.add_argument(
        "--top-k", type=int, default=5,
        help="top_k_out for every SearchRequest (default 5).",
    )
    p.add_argument(
        "--verbose", action="store_true",
        help="Print the full top-hit text for every query.",
    )
    return p.parse_args(argv)


def _print_header(chosen: RegistryEntry) -> None:
    from datetime import datetime, timezone
    ts = datetime.now(timezone.utc).isoformat(timespec="seconds")
    print("=" * 68)
    print(f"Retrieval smoke test — {ts}")
    print("=" * 68)
    print(f"Collection : {chosen.collection_name}")
    live = chosen.live_points_count if chosen.live_points_count is not None else "—"
    stale = " (STALE vs manifest)" if chosen.counts_disagree else ""
    print(f"Manifest   : {chosen.manifest_chunk_count} chunks "
          f"({chosen.manifest_doc_count} docs) recorded by last ingest")
    print(f"Live       : {live} points{stale}")
    print(f"Status     : {chosen.status}")
    print(f"Hash       : {chosen.content_hash_of_folder}")
    print(f"Source     : {chosen.source_folder_abs}")


def main(argv: list[str]) -> int:
    args = _parse_args(argv)
    started = time.time()

    # --- Pick the collection ---
    entries = list_registry_entries()
    chosen: RegistryEntry | None
    if args.collection:
        chosen = next((e for e in entries if e.collection_name == args.collection), None)
        if chosen is None:
            print(f"Error: collection {args.collection!r} not found in _registry.",
                  file=sys.stderr)
            print("Available collections:", file=sys.stderr)
            for e in entries:
                print(f"  - {e.collection_name}", file=sys.stderr)
            return 1
    else:
        chosen = _pick_best_collection(entries)
        if chosen is None:
            print("Error: _registry is empty — ingest a folder first.",
                  file=sys.stderr)
            return 1

    _print_header(chosen)
    report = Report()

    # --- Run sections ---
    section_discovery(report, entries, chosen)

    buckets = section_legacy(report, chosen.collection_name)

    # Pick a representative source_doc for the filter-integrity section.
    source_doc_sample: str | None = None
    if buckets["native"]:
        source_doc_sample = buckets["native"][0]
    elif buckets["legacy"]:
        source_doc_sample = buckets["legacy"][0]
    elif buckets["unknown"]:
        source_doc_sample = buckets["unknown"][0]

    section_acronyms(
        report, chosen.collection_name,
        max_n=args.max_glossary, top_k=args.top_k, verbose=args.verbose,
    )
    section_cross_refs(
        report, chosen.collection_name,
        max_n=args.max_cross_refs, top_k=args.top_k,
    )
    section_nl_queries(
        report, chosen.collection_name,
        top_k=args.top_k, verbose=args.verbose,
    )
    section_filters(
        report, chosen.collection_name,
        top_k=args.top_k, source_doc_sample=source_doc_sample,
    )
    section_reranker(report, chosen.collection_name, top_k=args.top_k)
    section_glossary(report, chosen.collection_name, top_k=args.top_k)

    # --- Summary ---
    elapsed = time.time() - started
    pass_, fail, info = report.summary()
    print("\n" + "=" * 68)
    print(f"Summary — {pass_} PASS, {fail} FAIL, {info} INFO  "
          f"(total rows: {len(report.rows)}, wall: {elapsed:.1f}s)")
    print("=" * 68)
    if fail:
        print("\nFAIL rows:")
        for r in report.rows:
            if r.status == "FAIL":
                print(f"  - {r.name}: {r.message}")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
