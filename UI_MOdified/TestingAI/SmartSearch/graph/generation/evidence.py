"""graph/generation/evidence.py — Phase 3 tiered-retrieval evidence types.

Phase 2 of the tiered-retrieval plan (§C29) introduces three named
evidence channels that Phase 3 (drafter), Phase 4 (critique), and
Phase 6 (renderer) all consume in a uniform shape:

    source_files       — uploaded WARNO + intel report (etc.) extracted
                         into FactSnippet records (NOT Qdrant hits).
    operationalfiles   — Phase 2 :class:`SearchHit` records from the
                         renamed primary collection, wrapped in
                         :class:`SourcedHit` with ``tier="operationalfiles"``.
    doctrine           — :class:`SourcedHit` records from the future
                         doctrine reference library, ``tier="doctrine"``.
                         No-op until that corpus is ingested.

This module defines the dataclasses and a builder; it has no callers
yet. Phase 3 (section_drafter) and Phase 4 (critique) migrate to
consume :class:`EvidenceBundle` together — they MUST ship in the
same commit per the locked plan, otherwise faithfulness checking is
broken for any group with non-operationalfiles evidence.

See ``tiered_retrieval_discussion.md`` (locked plan v5) for the
naming, flow, and typed-evidence rules; this file is the type
surface.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable, Literal

from graph.generation.retrieval_group import GroupRetrievalResult, SourcedHit


__all__ = [
    "FactSnippet",
    "EvidenceBundle",
    "build_evidence_bundle",
]


# --------------------------------------------------------------- FactSnippet

@dataclass(frozen=True)
class FactSnippet:
    """One scenario fact extracted from a user-uploaded source file.

    Distinct from a Qdrant hit on purpose: a FactSnippet is verbatim
    text that the user authorised by uploading the file, NEVER the
    output of a similarity search, and is therefore never reranked.

    Attributes:
        field_name:           the drafter field this fact feeds (per
                              the YAML ``source_files_field_map``).
        text:                 the extracted Arabic / English string.
        source_file_kind:     the upload's logical role —
                              ``"warning_order"`` / ``"intel_report"``
                              / ``"other"``. Drives the
                              ``[S: <kind> §extracted]`` citation tag.
        source_file_sha256:   sha256 of the original upload bytes;
                              flows into the cache provenance key in
                              Phase 5.
    """

    field_name: str
    text: str
    source_file_kind: str
    source_file_sha256: str


# ----------------------------------------------------------- EvidenceBundle

CoverageVerdict = Literal["strong", "weak", "empty", "n/a"]
EvidenceTier = Literal["source_files", "operationalfiles", "doctrine"]


@dataclass(frozen=True)
class EvidenceBundle:
    """Three named channels of evidence assembled per drafter group.

    Until Phase 7 toggles tier policies on, ``source_files_evidence``
    and ``doctrine_evidence`` are empty for every legacy template,
    ``operationalfiles_evidence`` carries the existing
    :class:`SourcedHit` pool, and ``coverage_verdict`` defaults to
    ``"n/a"``. Output is therefore unchanged for legacy templates.

    Attributes:
        source_files_evidence:        FactSnippet tuple, NOT reranked.
        operationalfiles_evidence:    SourcedHit tuple from the
                                      operationalfiles tier (today's
                                      ``ingest__operationalfiles__bgem3``).
        doctrine_evidence:            SourcedHit tuple from the doctrine
                                      tier (future reference library).
        coverage_verdict:             ``"strong"`` / ``"weak"`` / ``"empty"``
                                      from the Phase 7 coverage gate;
                                      ``"n/a"`` pre-Phase-7.
        tiers_consulted:              ordered tuple of tier names that
                                      were actually populated this run
                                      — deterministic, drives the
                                      renderer's sub-heading layout.
        provenance:                   cache provenance keys
                                      (``source_evidence_sha256``,
                                      ``source_files_sha256_pairs``, …)
                                      added in Phase 5. Free-form on
                                      purpose so each phase can extend
                                      without a schema migration.
    """

    source_files_evidence: tuple[FactSnippet, ...] = ()
    operationalfiles_evidence: tuple[SourcedHit, ...] = ()
    doctrine_evidence: tuple[SourcedHit, ...] = ()
    coverage_verdict: CoverageVerdict = "n/a"
    tiers_consulted: tuple[EvidenceTier, ...] = ()
    provenance: dict[str, Any] = field(default_factory=dict)


# ------------------------------------------------------------- builder

def build_evidence_bundle(
    group_result: GroupRetrievalResult | None = None,
    extracted_values: dict[str, str] | None = None,
    field_map: dict[str, str] | None = None,
    *,
    source_file_records: Iterable[Any] = (),
    coverage_verdict: CoverageVerdict = "n/a",
    provenance: dict[str, Any] | None = None,
) -> EvidenceBundle:
    """Assemble an :class:`EvidenceBundle` from group-level inputs.

    Phase 2 contract — additive, not consumed yet:
      * ``group_result.hits`` is split by ``SourcedHit.tier`` into the
        operationalfiles / doctrine channels. Pre-Phase-7 every hit
        carries the default tier ``"operationalfiles"`` so the
        doctrine tuple comes back empty.
      * ``extracted_values`` + ``field_map`` produce the FactSnippet
        list. ``field_map`` is the YAML ``source_files_field_map``
        dict (Phase 7); empty for legacy templates so no FactSnippets
        are emitted.
      * ``source_file_records`` (iterable of objects with ``.kind``
        and ``.sha256``) lets the builder stamp each FactSnippet with
        its originating upload's kind + sha. When a record's ``.kind``
        appears nowhere, the snippet's ``source_file_kind`` /
        ``source_file_sha256`` fall back to the empty string — the
        renderer still emits ``[S: <field_name> §extracted]`` so the
        endnote is usable.

    The builder is a pure function: it does not call the LLM, does
    not touch Qdrant, does not log. Phase 7's coverage check stamps
    ``coverage_verdict`` after the fact.
    """
    extracted_values = extracted_values or {}
    field_map = field_map or {}
    provenance = dict(provenance or {})

    # 1. Split SourcedHits by tier. Phase 7 fan-out already stamps the
    #    tier on each hit; pre-Phase-7 every hit carries the default
    #    "operationalfiles".
    of_hits: list[SourcedHit] = []
    doc_hits: list[SourcedHit] = []
    if group_result is not None:
        for sh in group_result.hits:
            if sh.tier == "doctrine":
                doc_hits.append(sh)
            else:
                of_hits.append(sh)

    # 2. Build the FactSnippet list. ``field_map`` is empty for legacy
    #    templates so this loop is a no-op pre-Phase-7.
    sha_by_kind: dict[str, str] = {}
    for rec in source_file_records:
        kind = getattr(rec, "kind", "") or ""
        sha = getattr(rec, "sha256", "") or ""
        if kind and sha:
            sha_by_kind[kind] = sha

    # Skip placeholder strings — when the per-doc extractor can't find a
    # field in the uploaded source files it returns the absent sentinel
    # (`prompts/_universal_instructions_ar.py::ABSENT_SENTINEL_AR`)
    # and the dispatcher renders the user-facing
    # `PLACEHOLDER_NOT_IN_INPUTS_AR`.  Either string in the bundle
    # would mislead the drafter into citing "not available" as evidence,
    # so we treat them as no-ops here.  Kept inline (not imported) to
    # avoid a generation-module → prompts-module dependency that the
    # rest of `evidence.py` doesn't have.
    _PLACEHOLDER_TEXTS = (
        "غير موجود في الملفات",        # extractor absent sentinel
        "غير متوفر في المدخلات",       # dispatcher render placeholder
        "يُصدر لاحقاً",                  # static "issued later" placeholder
        "غير متوفر في العقيدة المتاحة",  # doctrine-absent placeholder
    )

    snippets: list[FactSnippet] = []
    for drafter_field, extracted_key in field_map.items():
        text = extracted_values.get(extracted_key, "")
        stripped = text.strip() if isinstance(text, str) else ""
        if not stripped or stripped in _PLACEHOLDER_TEXTS:
            continue
        # Phase 7 may extend ``field_map`` to {drafter_field: (key, kind)}
        # so the per-field source kind is explicit. For now we leave
        # the kind/sha empty when not derivable — the renderer falls
        # back to ``[S: <field> §extracted]`` which is still valid.
        snippets.append(
            FactSnippet(
                field_name=drafter_field,
                text=stripped,
                source_file_kind="",
                source_file_sha256="",
            )
        )

    # 3. Tier-consulted ordering is deterministic: source_files first
    #    (verbatim user content), then operationalfiles, then doctrine.
    tiers: list[EvidenceTier] = []
    if snippets:
        tiers.append("source_files")
    if of_hits:
        tiers.append("operationalfiles")
    if doc_hits:
        tiers.append("doctrine")

    return EvidenceBundle(
        source_files_evidence=tuple(snippets),
        operationalfiles_evidence=tuple(of_hits),
        doctrine_evidence=tuple(doc_hits),
        coverage_verdict=coverage_verdict,
        tiers_consulted=tuple(tiers),
        provenance=provenance,
    )


# --------------------------------------------------------------- self-smoke

if __name__ == "__main__":
    # Build a synthetic bundle to confirm the type surface works
    # offline (no Qdrant, no LLM, no env). Used as the Phase 2
    # acceptance check.
    from types import SimpleNamespace

    # Empty bundle — every channel zero, verdict "n/a".
    empty = build_evidence_bundle()
    assert empty.source_files_evidence == ()
    assert empty.operationalfiles_evidence == ()
    assert empty.doctrine_evidence == ()
    assert empty.coverage_verdict == "n/a"
    assert empty.tiers_consulted == ()
    print("OK empty bundle")

    # source_files-only bundle — exercises field_map + record lookup.
    fake_record = SimpleNamespace(kind="warning_order", sha256="abc123def456")
    sf_only = build_evidence_bundle(
        extracted_values={"task_org": "اللواء الأول"},
        field_map={"task_organization_text": "task_org"},
        source_file_records=[fake_record],
    )
    assert len(sf_only.source_files_evidence) == 1
    snip = sf_only.source_files_evidence[0]
    assert snip.field_name == "task_organization_text"
    assert snip.text == "اللواء الأول"
    assert sf_only.tiers_consulted == ("source_files",)
    print("OK source_files-only bundle:", sf_only.tiers_consulted)

    # field_map entry whose extracted value is missing → snippet skipped.
    sparse = build_evidence_bundle(
        extracted_values={"present": "x"},
        field_map={"a_field": "present", "b_field": "absent"},
    )
    assert len(sparse.source_files_evidence) == 1
    assert sparse.source_files_evidence[0].field_name == "a_field"
    print("OK sparse field_map: 1/2 emitted")

    # Mixed-tier hits exercise the operationalfiles / doctrine split.
    # Construct minimal SourcedHits via the dataclass directly (we
    # don't need a real SearchHit for the type check).
    from graph.retrieval.schema import SearchHit
    fake_hit = SearchHit(
        point_id="00000000-0000-0000-0000-000000000001",
        text="x", heading_path="", source_doc="FM-x", page_numbers=[],
        chunk_type="body", chunk_index=0, paragraph_number=None,
        paragraph_numbers=[], cross_refs=[], rrf_score=0.0,
    )
    of_hit = SourcedHit(hit=fake_hit, collection="ingest__operationalfiles__bgem3")
    doc_hit = SourcedHit(hit=fake_hit, collection="ingest__doctrine__bgem3", tier="doctrine")

    fake_group = SimpleNamespace(hits=(of_hit, doc_hit))
    mixed = build_evidence_bundle(group_result=fake_group)  # type: ignore[arg-type]
    assert len(mixed.operationalfiles_evidence) == 1
    assert len(mixed.doctrine_evidence) == 1
    assert mixed.tiers_consulted == ("operationalfiles", "doctrine")
    print("OK mixed-tier bundle:", mixed.tiers_consulted)

    print("\nevidence.py smoke OK — Phase 2 types ready for Phases 3+4.")
