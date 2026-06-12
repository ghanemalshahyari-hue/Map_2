"""scripts/tiered_retrieval_smoke.py — offline acceptance harness for the
tiered-retrieval architecture (§C28–§C31).

Stated as a Phase-7 deliverable in
``tiered_retrieval_implementation.md`` ("When you finish Phase 7" §2):

    Add a smoke test for tiered retrieval ... covering the six policies
    + coverage gate.

What this exercises (offline; no Qdrant, no LLM, no Docling):

  1. Coverage gate verdicts — strong / weak / empty + per-field threshold
     override merging onto env defaults.
  2. Citation-tag emission — legacy vs ``[O:]`` / ``[D:]`` prefixed shape.
  3. Citation-tag parsing — round-trip through ``_parse_citation_tag``
     for every shape (legacy, S/O/D-prefixed, malformed fallback).
  4. ``EvidenceBundle`` channel split — operationalfiles / doctrine
     hits routed by ``SourcedHit.tier``; FactSnippet emission gated on
     ``field_map`` × ``extracted_values`` overlap.
  5. Six tier-policy enum values resolve through ``GroupCacheKey``;
     flipping policy / source-files / kill-switch invalidates the
     digest as expected.
  6. Renderer endnote layout — flat-legacy, three-sub-heading-tiered,
     mixed-with-fallback. Produces three ``.docx`` artefacts under
     ``/tmp/tiered_retrieval_smoke/`` so a reviewer can open them.

The harness is intentionally unit-style: every assertion prints either
``PASS`` or ``FAIL`` and the script exits non-zero on any failure.
Useful as a Phase-7 regression gate after editing any of the modules
involved.
"""

from __future__ import annotations

import os
import sys
import tempfile
import traceback
from pathlib import Path
from types import SimpleNamespace
from typing import Any

# Make the repo root importable when the script is invoked as
# ``python scripts/tiered_retrieval_smoke.py``.
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# `.env` carries OPENAI_API_KEY + provider routing — `compute_group_cache_key`
# transitively touches `graph.config.get_config()` which requires the key.
# Same load pattern as `main.py` and `scripts/generate_documents.py`.
try:
    from dotenv import load_dotenv
    load_dotenv(REPO_ROOT / ".env")
except ImportError:
    pass


# --------------------------------------------------------------- result tracking

class _Counter:
    def __init__(self) -> None:
        self.passed = 0
        self.failed = 0
        self.failures: list[str] = []

    def ok(self, label: str) -> None:
        self.passed += 1
        print(f"  PASS  {label}")

    def fail(self, label: str, exc: BaseException | str) -> None:
        self.failed += 1
        msg = f"{label}: {exc}"
        self.failures.append(msg)
        print(f"  FAIL  {msg}")


def _run(label: str, fn, counter: _Counter) -> None:
    try:
        fn()
    except AssertionError as exc:
        counter.fail(label, exc)
    except Exception as exc:  # noqa: BLE001 — smoke harness wants to keep going
        counter.fail(label, f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}")
    else:
        counter.ok(label)


# --------------------------------------------------------------- fixtures

def _hit(
    *,
    src: str,
    score: float | None,
    para: str | None = None,
    heading: str = "",
    page: int | None = None,
    point_id: str | None = None,
):
    """Build a minimal SearchHit. Defaults exercise the full citation
    locator fallback chain when individual args are left ``None``."""
    from graph.retrieval.schema import SearchHit
    return SearchHit(
        point_id=point_id or f"id-{src}-{score}-{para}",
        text=f"محتوى مزيف من {src}",
        heading_path=heading,
        source_doc=src,
        page_numbers=[page] if page is not None else [],
        chunk_type="body",
        chunk_index=0,
        paragraph_number=para,
        paragraph_numbers=[],
        cross_refs=[],
        rrf_score=0.0,
        rerank_score=score,
    )


def _sourced(hit, *, collection: str, tier: str = "operationalfiles", tag: str = ""):
    from graph.generation.retrieval_group import SourcedHit
    return SourcedHit(
        hit=hit,
        collection=collection,
        rerank_score=hit.rerank_score,
        citation_tag=tag,
        tier=tier,  # type: ignore[arg-type]
    )


# --------------------------------------------------------------- 1. coverage gate

def check_coverage_verdicts(c: _Counter) -> None:
    print("\n[1] coverage gate verdicts")
    from graph.generation.coverage import (
        coverage_verdict,
        resolve_thresholds_for_group,
    )

    def empty_pool() -> None:
        v = coverage_verdict([], tau_strong=0.30, k_strong=8, m_docs=2)
        assert v == "empty", v

    def strong_pool() -> None:
        pool = [_sourced(_hit(src=f"FM-{i}", score=0.6), collection="X")
                for i in range(8)] + [_sourced(_hit(src="FM-Other", score=0.6), collection="X")]
        v = coverage_verdict(pool, tau_strong=0.30, k_strong=8, m_docs=2)
        assert v == "strong", v

    def weak_low_diversity() -> None:
        pool = [_sourced(_hit(src="FM-Z", score=0.5), collection="X") for _ in range(10)]
        v = coverage_verdict(pool, tau_strong=0.30, k_strong=8, m_docs=2)
        assert v == "weak", v

    def weak_low_top_score() -> None:
        pool = [_sourced(_hit(src=f"FM-{i}", score=0.10), collection="X") for i in range(10)]
        v = coverage_verdict(pool, tau_strong=0.30, k_strong=8, m_docs=2)
        assert v == "weak", v

    def threshold_resolver_default() -> None:
        # Save+clear so locked defaults apply during the test.
        saved = {k: os.environ.pop(k, None) for k in (
            "PHASE3_COVERAGE_TAU_STRONG",
            "PHASE3_COVERAGE_K_STRONG",
            "PHASE3_COVERAGE_M_DOCS",
        )}
        try:
            assert resolve_thresholds_for_group() == (0.30, 8, 2)
        finally:
            for k, v in saved.items():
                if v is not None:
                    os.environ[k] = v

    def threshold_resolver_override() -> None:
        out = resolve_thresholds_for_group({"tau_strong": 0.5, "k_strong": 12})
        # m_docs falls through to default (2).
        assert out == (0.5, 12, 2), out

    def threshold_resolver_garbage_fallback() -> None:
        out = resolve_thresholds_for_group({"tau_strong": "nope", "k_strong": "abc"})
        # Both garbage values fall back to defaults.
        assert out == (0.30, 8, 2), out

    _run("empty pool → 'empty'", empty_pool, c)
    _run("all signals strong → 'strong'", strong_pool, c)
    _run("single-source pool → 'weak'", weak_low_diversity, c)
    _run("low top rerank score → 'weak'", weak_low_top_score, c)
    _run("threshold resolver — env defaults", threshold_resolver_default, c)
    _run("threshold resolver — per-field override", threshold_resolver_override, c)
    _run("threshold resolver — garbage falls back", threshold_resolver_garbage_fallback, c)


# --------------------------------------------------------------- 2. citation tags emit

def check_citation_tag_emission(c: _Counter) -> None:
    print("\n[2] citation-tag emission")
    from graph.generation.retrieval_group import build_citation_tag

    def legacy_paragraph_number() -> None:
        tag = build_citation_tag(_hit(src="FM-5-0", score=None, para="3-14"))
        assert tag == "[FM-5-0 §3-14]", tag

    def legacy_strips_pdf_extension() -> None:
        tag = build_citation_tag(_hit(src="FM-5-0.pdf", score=None, para="3-14"))
        assert tag == "[FM-5-0 §3-14]", tag

    def legacy_heading_fallback() -> None:
        tag = build_citation_tag(_hit(src="ADP-5-0", score=None, heading="Chapter > Command and control"))
        assert tag == "[ADP-5-0 §Command and control]", tag

    def legacy_page_fallback() -> None:
        tag = build_citation_tag(_hit(src="FM-6-0", score=None, page=42))
        assert tag == "[FM-6-0 §p. 42]", tag

    def legacy_em_dash_final_fallback() -> None:
        tag = build_citation_tag(_hit(src="FM-6-0", score=None))
        assert tag == "[FM-6-0 §—]", tag

    def prefixed_operationalfiles() -> None:
        tag = build_citation_tag(
            _hit(src="FM-5-0", score=None, para="3-14"),
            tier="operationalfiles", emit_prefixed=True,
        )
        assert tag == "[O: FM-5-0 §3-14]", tag

    def prefixed_doctrine() -> None:
        tag = build_citation_tag(
            _hit(src="ADP-2-0", score=None, para="2-1"),
            tier="doctrine", emit_prefixed=True,
        )
        assert tag == "[D: ADP-2-0 §2-1]", tag

    def prefixed_off_when_flag_false() -> None:
        # tier supplied but emit_prefixed=False → still legacy shape.
        tag = build_citation_tag(
            _hit(src="FM-5-0", score=None, para="3-14"),
            tier="doctrine", emit_prefixed=False,
        )
        assert tag == "[FM-5-0 §3-14]", tag

    _run("legacy: paragraph_number wins", legacy_paragraph_number, c)
    _run("legacy: .pdf extension stripped", legacy_strips_pdf_extension, c)
    _run("legacy: heading fallback (no para)", legacy_heading_fallback, c)
    _run("legacy: page-number fallback", legacy_page_fallback, c)
    _run("legacy: em-dash final fallback", legacy_em_dash_final_fallback, c)
    _run("prefixed: operationalfiles → [O: …]", prefixed_operationalfiles, c)
    _run("prefixed: doctrine → [D: …]", prefixed_doctrine, c)
    _run("prefixed: emit_prefixed=False stays legacy", prefixed_off_when_flag_false, c)


# --------------------------------------------------------------- 3. citation tags parse

def check_citation_tag_parsing(c: _Counter) -> None:
    print("\n[3] citation-tag parsing")
    from graph.generation.renderers.arabic_docx import _parse_citation_tag

    def parse_legacy() -> None:
        slug, loc, tier = _parse_citation_tag("[FM-5-0 §3-14]", "fallback")
        assert (slug, loc, tier) == ("FM-5-0", "3-14", ""), (slug, loc, tier)

    def parse_operationalfiles() -> None:
        slug, loc, tier = _parse_citation_tag("[O: FM-5-0 §3-14]", "fallback")
        assert (slug, loc, tier) == ("FM-5-0", "3-14", "operationalfiles"), (slug, loc, tier)

    def parse_doctrine() -> None:
        slug, loc, tier = _parse_citation_tag("[D: ADP-2-0 §2-1]", "fallback")
        assert (slug, loc, tier) == ("ADP-2-0", "2-1", "doctrine"), (slug, loc, tier)

    def parse_source_files() -> None:
        slug, loc, tier = _parse_citation_tag("[S: warning_order §extracted]", "fallback")
        assert (slug, loc, tier) == ("warning_order", "extracted", "source_files"), (slug, loc, tier)

    def parse_malformed_fallback() -> None:
        slug, loc, tier = _parse_citation_tag("malformed-no-brackets", "FM-Fallback.pdf")
        # Fallback strips .pdf and uses inner as locator; tier stays "".
        assert tier == "", tier
        assert slug == "FM-Fallback", slug

    _run("parse legacy [<slug> §<loc>]", parse_legacy, c)
    _run("parse [O: <slug> §<loc>]", parse_operationalfiles, c)
    _run("parse [D: <slug> §<loc>]", parse_doctrine, c)
    _run("parse [S: <kind> §extracted]", parse_source_files, c)
    _run("parse malformed → fallback path", parse_malformed_fallback, c)


# --------------------------------------------------------------- 4. EvidenceBundle

def check_evidence_bundle_assembly(c: _Counter) -> None:
    print("\n[4] EvidenceBundle assembly")
    from graph.generation.evidence import build_evidence_bundle

    def empty_bundle() -> None:
        b = build_evidence_bundle()
        assert b.source_files_evidence == ()
        assert b.operationalfiles_evidence == ()
        assert b.doctrine_evidence == ()
        assert b.coverage_verdict == "n/a"
        assert b.tiers_consulted == ()

    def source_files_only() -> None:
        rec = SimpleNamespace(kind="warning_order", sha256="abc123def456")
        b = build_evidence_bundle(
            extracted_values={"task_org": "اللواء الأول"},
            field_map={"task_organization_text": "task_org"},
            source_file_records=[rec],
        )
        assert len(b.source_files_evidence) == 1
        snip = b.source_files_evidence[0]
        assert snip.field_name == "task_organization_text"
        assert snip.text == "اللواء الأول"
        assert b.tiers_consulted == ("source_files",)

    def sparse_field_map_skips_missing() -> None:
        b = build_evidence_bundle(
            extracted_values={"present_field": "x"},
            field_map={"a_field": "present_field", "b_field": "absent_field"},
        )
        assert len(b.source_files_evidence) == 1
        assert b.source_files_evidence[0].field_name == "a_field"

    def mixed_tier_split() -> None:
        of = _sourced(_hit(src="FM-5-0", score=0.4, para="3-14"),
                      collection="ingest__operationalfiles__bgem3", tier="operationalfiles")
        doc = _sourced(_hit(src="ADP-2-0", score=0.3, para="2-1"),
                       collection="ingest__doctrine__bgem3", tier="doctrine")
        fake_group = SimpleNamespace(hits=(of, doc))
        b = build_evidence_bundle(group_result=fake_group)  # type: ignore[arg-type]
        assert len(b.operationalfiles_evidence) == 1
        assert len(b.doctrine_evidence) == 1
        assert b.tiers_consulted == ("operationalfiles", "doctrine")

    def all_three_channels_consulted_order() -> None:
        of = _sourced(_hit(src="FM-5-0", score=0.4, para="3-14"),
                      collection="X", tier="operationalfiles")
        doc = _sourced(_hit(src="ADP-2-0", score=0.3, para="2-1"),
                       collection="Y", tier="doctrine")
        fake_group = SimpleNamespace(hits=(of, doc))
        rec = SimpleNamespace(kind="warning_order", sha256="aa")
        b = build_evidence_bundle(
            group_result=fake_group,  # type: ignore[arg-type]
            extracted_values={"x": "fact"},
            field_map={"f": "x"},
            source_file_records=[rec],
        )
        # Canonical order is source_files → operationalfiles → doctrine.
        assert b.tiers_consulted == ("source_files", "operationalfiles", "doctrine"), b.tiers_consulted

    _run("empty bundle has all-empty channels + 'n/a' verdict", empty_bundle, c)
    _run("source_files-only: FactSnippet emitted, tiers=('source_files',)", source_files_only, c)
    _run("sparse field_map: missing key skipped silently", sparse_field_map_skips_missing, c)
    _run("mixed-tier hits: split by SourcedHit.tier", mixed_tier_split, c)
    _run("all-three channels: canonical tiers_consulted order", all_three_channels_consulted_order, c)


# --------------------------------------------------------------- 5. cache key invalidation

def check_cache_key_invalidation(c: _Counter) -> None:
    print("\n[5] GroupCacheKey — six policies + invalidation triggers")
    from graph.generation.cache import (
        TIER_POLICIES,
        compute_group_cache_key,
        resolve_default_tier_policy,
        resolve_tiered_retrieval_enabled,
    )
    from graph.generation.retrieval_group import GroupSpec, GroupRetrievalResult

    # Use one of the v1 templates as a real on-disk YAML to read.
    template_path = REPO_ROOT / "prompts" / "staff_brief" / "template.yaml"
    assert template_path.exists(), f"Phase-7 smoke needs {template_path} to exist"

    # Synthetic GroupSpec — collect_group_specs(real-template) would also
    # work but we want full control over the inputs to `compute_group_cache_key`.
    spec = GroupSpec(
        group_name="OPERATIONS_ESTIMATE",
        schema_name="OPERATIONS_ESTIMATE",
        field_names=("Friendly_force_assesment",),
        field_specs=tuple(),  # not used by the digest fields we exercise
        query_seeds=("test seed",),
        collections=("ingest__operationalfiles__bgem3",),
        filters={},
        top_k_per_query=8,
        merge_pool_size=25,
        merged_top_k=15,
        rerank_query_ar=None,
    )
    retrieval = GroupRetrievalResult(
        group=spec,
        hits=tuple(),
        resolved_seeds=("test seed",),
        dropped_seeds=tuple(),
        canonical_rerank_query="test seed",
        allowlist_elided=tuple(),
    )

    def make_key(**overrides: Any):
        # `_prompt_ar_concat_hash` zips field_names with field_specs, so
        # passing equal-length empty tuples is safe — the concat is "".
        kwargs = dict(
            template_path=template_path,
            group=spec,
            retrieval=retrieval,
            draft_model="gemma",
            draft_temperature=0.2,
            critique_model="gemma",
            critique_temperature=0.0,
            use_glossary=True,
            use_reranker_final=True,
            use_hyde=False,
            inputs_raw={},
        )
        kwargs.update(overrides)
        return compute_group_cache_key(**kwargs)

    def six_policies_distinct_digests() -> None:
        digests: dict[str, str] = {}
        for policy in TIER_POLICIES:
            key = make_key(tier_policy=policy)
            digests[policy] = key.digest
            assert key.tier_policy == policy
        # All six digests must be distinct — flipping policy MUST
        # invalidate cache.
        assert len(set(digests.values())) == len(TIER_POLICIES), digests

    def source_evidence_changes_digest() -> None:
        a = make_key(
            tier_policy="operationalfiles_then_doctrine",
            field_map={"f": "x"},
            extracted_values={"x": "نسخة أ"},
        )
        b = make_key(
            tier_policy="operationalfiles_then_doctrine",
            field_map={"f": "x"},
            extracted_values={"x": "نسخة ب"},
        )
        assert a.digest != b.digest, (a.digest, b.digest)

    def source_evidence_unicode_canonical() -> None:
        # NFC-normalised vs NFD-normalised same string must hash equal.
        # Lam + alef ligature: NFC "لا" vs NFD "ل" + " ا".  Use a string
        # with a combining mark to exercise the NFC normalisation rule.
        import unicodedata
        nfc = unicodedata.normalize("NFC", "اللواء")
        nfd = unicodedata.normalize("NFD", "اللواء")
        a = make_key(field_map={"f": "x"}, extracted_values={"x": nfc})
        b = make_key(field_map={"f": "x"}, extracted_values={"x": nfd})
        assert a.digest == b.digest, ("NFC vs NFD digests must match", a.digest, b.digest)

    def doctrine_collections_change_digest() -> None:
        a = make_key(tier_policy="operationalfiles_then_doctrine", doctrine_collections=())
        b = make_key(
            tier_policy="operationalfiles_then_doctrine",
            doctrine_collections=("ingest__doctrine__bgem3",),
        )
        assert a.digest != b.digest, (a.digest, b.digest)

    def operationalfiles_collections_change_digest() -> None:
        a = make_key(operationalfiles_collections=("ingest__operationalfiles__bgem3",))
        b = make_key(operationalfiles_collections=("ingest__operationalfiles__bgem3", "extra"))
        assert a.digest != b.digest

    def kill_switch_changes_digest() -> None:
        # Flip env then re-resolve.
        saved = os.environ.get("PHASE3_TIERED_RETRIEVAL")
        try:
            os.environ["PHASE3_TIERED_RETRIEVAL"] = "1"
            a = make_key(tier_policy="operationalfiles_then_doctrine")
            os.environ["PHASE3_TIERED_RETRIEVAL"] = "0"
            b = make_key(tier_policy="operationalfiles_then_doctrine")
            assert a.tiered_retrieval_enabled is True
            assert b.tiered_retrieval_enabled is False
            assert a.digest != b.digest
        finally:
            if saved is None:
                os.environ.pop("PHASE3_TIERED_RETRIEVAL", None)
            else:
                os.environ["PHASE3_TIERED_RETRIEVAL"] = saved
        # Kill-switch back to default
        assert resolve_tiered_retrieval_enabled() in (True, False)

    def default_resolver_returns_legacy_when_unset() -> None:
        saved = os.environ.pop("PHASE3_DEFAULT_TIER_POLICY", None)
        try:
            assert resolve_default_tier_policy() == "operationalfiles_only"
        finally:
            if saved is not None:
                os.environ["PHASE3_DEFAULT_TIER_POLICY"] = saved

    _run("six tier policies → six distinct digests", six_policies_distinct_digests, c)
    _run("flipping extracted_values content invalidates digest", source_evidence_changes_digest, c)
    _run("NFC vs NFD same Arabic string → equal digest", source_evidence_unicode_canonical, c)
    _run("declaring doctrine_collections invalidates digest", doctrine_collections_change_digest, c)
    _run("changing operationalfiles_collections invalidates digest", operationalfiles_collections_change_digest, c)
    _run("PHASE3_TIERED_RETRIEVAL kill-switch invalidates digest", kill_switch_changes_digest, c)
    _run("PHASE3_DEFAULT_TIER_POLICY unset → legacy default", default_resolver_returns_legacy_when_unset, c)


# --------------------------------------------------------------- 6. renderer endnote layout

def check_renderer_endnote_layout(c: _Counter) -> None:
    print("\n[6] renderer endnote layout (writes .docx fixtures)")
    from graph.generation.renderers.arabic_docx import (
        ArabicDocumentContext,
        CitationEntry,
        configure_document,
        configure_last_page_section,
        render_citations_section,
    )

    out_root = Path(tempfile.gettempdir()) / "tiered_retrieval_smoke"
    out_root.mkdir(parents=True, exist_ok=True)

    def render(entries: list[CitationEntry], filename: str) -> Path:
        ctx = ArabicDocumentContext.new()
        configure_document(ctx.document)
        render_citations_section(ctx, entries)
        configure_last_page_section(ctx.document)
        path = out_root / filename
        ctx.document.save(str(path))
        # Read paragraph texts back to assert layout.
        return path

    def paragraph_texts(path: Path) -> list[str]:
        # Re-open and pull every paragraph's text. The smoke is interested
        # in *headings*; specific spacing is validated by the existing
        # renderer self-tests, not here.
        from docx import Document
        doc = Document(str(path))
        return [p.text for p in doc.paragraphs]

    def flat_legacy_layout() -> None:
        entries = [
            CitationEntry(
                number=i + 1, source_doc=f"FM-{i}", locator=f"3-{i}",
                full_tag=f"[FM-{i} §3-{i}]", collection="ingest__operationalfiles__bgem3",
                tier="legacy",
            )
            for i in range(3)
        ]
        path = render(entries, "endnote_flat_legacy.docx")
        texts = paragraph_texts(path)
        assert "الاستشهادات" in texts
        for sub in ("ملفات مرفوعة من المستخدم", "المصادر التشغيلية", "المرجع العقيدي"):
            assert sub not in texts, f"sub-heading {sub!r} leaked into pure-legacy layout"
        for i in range(3):
            assert any(f"[{i + 1}] FM-{i} — فقرة 3-{i}" in t for t in texts), texts

    def single_tier_flat_layout() -> None:
        # Locked behaviour: a single populated named tier renders flat,
        # not under a sub-heading.  Sub-headings are an ambiguity-
        # resolution device; with one channel there is nothing to
        # disambiguate.  This guard catches the §C29 default
        # ``tier="operationalfiles"`` from leaking sub-headings into
        # pure-legacy templates.
        entries = [
            CitationEntry(number=i + 1, source_doc=f"FM-{i}", locator=f"3-{i}",
                          full_tag=f"[FM-{i} §3-{i}]",
                          collection="ingest__operationalfiles__bgem3",
                          tier="operationalfiles")
            for i in range(3)
        ]
        path = render(entries, "endnote_single_tier_flat.docx")
        texts = paragraph_texts(path)
        assert "الاستشهادات" in texts
        for sub in ("ملفات مرفوعة من المستخدم", "المصادر التشغيلية", "المرجع العقيدي"):
            assert sub not in texts, f"sub-heading {sub!r} leaked into single-tier output"

    def three_sub_heading_layout() -> None:
        entries = [
            CitationEntry(number=1, source_doc="warning_order", locator="extracted",
                          full_tag="[S: warning_order §extracted]", collection="",
                          tier="source_files"),
            CitationEntry(number=2, source_doc="FM-5-0", locator="3-14",
                          full_tag="[O: FM-5-0 §3-14]",
                          collection="ingest__operationalfiles__bgem3",
                          tier="operationalfiles"),
            CitationEntry(number=3, source_doc="ADP-2-0", locator="2-1",
                          full_tag="[D: ADP-2-0 §2-1]",
                          collection="ingest__doctrine__bgem3",
                          tier="doctrine"),
        ]
        path = render(entries, "endnote_three_subheadings.docx")
        texts = paragraph_texts(path)
        assert "الاستشهادات" in texts
        for sub in ("ملفات مرفوعة من المستخدم", "المصادر التشغيلية", "المرجع العقيدي"):
            assert sub in texts, (sub, texts)
        assert "مصادر" not in texts, "fallback heading leaked into pure-tiered layout"

    def two_tiers_plus_legacy_fallback() -> None:
        # Multi-tier output with a legacy entry: two named sub-headings
        # appear PLUS the مصادر catch-all for the legacy row.
        entries = [
            CitationEntry(number=1, source_doc="FM-5-0", locator="3-14",
                          full_tag="[O: FM-5-0 §3-14]",
                          collection="ingest__operationalfiles__bgem3",
                          tier="operationalfiles"),
            CitationEntry(number=2, source_doc="ADP-2-0", locator="2-1",
                          full_tag="[D: ADP-2-0 §2-1]",
                          collection="ingest__doctrine__bgem3",
                          tier="doctrine"),
            CitationEntry(number=3, source_doc="LEGACY-DOC", locator="X",
                          full_tag="[LEGACY-DOC §X]", collection="ingest__legacy__bgem3",
                          tier="legacy"),
        ]
        path = render(entries, "endnote_mixed_with_fallback.docx")
        texts = paragraph_texts(path)
        assert "المصادر التشغيلية" in texts, texts
        assert "المرجع العقيدي" in texts, texts
        assert "مصادر" in texts, texts
        # Source-files sub-heading absent (no source_files entries).
        assert "ملفات مرفوعة من المستخدم" not in texts

    def empty_entries_skip_layout() -> None:
        # Should not even add the heading.
        path = render([], "endnote_empty.docx")
        texts = paragraph_texts(path)
        assert "الاستشهادات" not in texts, texts

    _run("flat legacy layout (no sub-headings)", flat_legacy_layout, c)
    _run("single-tier output → flat layout (byte-equal pre-§C31)", single_tier_flat_layout, c)
    _run("three-sub-heading tiered layout", three_sub_heading_layout, c)
    _run("two named tiers + legacy → catch-all مصادر heading", two_tiers_plus_legacy_fallback, c)
    _run("empty entries skip the entire endnote section", empty_entries_skip_layout, c)

    print(f"  (docx fixtures written under {out_root})")


# --------------------------------------------------------------- 7. tiered retrieve_group routing

def check_retrieve_group_routing(c: _Counter) -> None:
    """Six policies × routing logic on retrieve_group, mocking
    ``_fan_out_search`` so we exercise the policy decision tree without
    needing Qdrant. Verifies:

      * Legacy fast-path is taken for ``operationalfiles_only`` and
        when kill-switch off, regardless of policy.
      * Doctrine fan-out fires unconditionally for the 'and' /
        'all_channels' / 'doctrine_only' policies.
      * ``operationalfiles_then_doctrine`` only fans out doctrine when
        coverage gate verdict is 'weak' / 'empty'.
      * Citation tags emitted match the expected legacy / prefixed
        shape per branch.
    """
    print("\n[7] retrieve_group routing — six policies + kill-switch")
    import json
    import graph.generation.retrieval_group as rg
    from graph.generation.retrieval_group import GroupSpec, retrieve_group, SourcedHit
    from graph.generation.schema.inputs import load_inputs

    # Phase3Inputs has required nested models; load the canonical example
    # so we have a valid instance.  Our seed is a literal (no `{...}`
    # placeholders) so the inputs object is not actually consumed beyond
    # `resolve_seeds`.
    inputs_path = REPO_ROOT / "data" / "phase3_inputs.example.json"
    inputs = load_inputs(json.loads(inputs_path.read_text(encoding="utf-8")))

    def fake_fanout_factory(of_pool, doc_pool):
        """Returns a callable that mimics ``_fan_out_search`` and emits
        either the operationalfiles or the doctrine pool based on which
        ``collections`` argument the tiered code path passes in."""
        def fake(group, resolved_seeds, *, use_glossary, collections=None):
            # Route by collection identity. Legacy callers pass
            # ``collections=None`` → behave like operationalfiles.
            cols = collections if collections is not None else group.collections
            if any("doctrine" in c for c in cols):
                return ({sh.hit.point_id: sh for sh in doc_pool}, [])
            return ({sh.hit.point_id: sh for sh in of_pool}, [])
        return fake

    # Patch rerank() to be the identity (same input order, same scores)
    # so we don't need a live reranker. Only used by _single_final_rerank.
    def patch_rerank(monkeypatch_target):
        from graph.retrieval.rerank import RerankedHit
        orig = monkeypatch_target.rerank

        def fake_rerank(query, texts):
            return [RerankedHit(original_index=i, score=0.5) for i in range(len(texts))]
        monkeypatch_target.rerank = fake_rerank
        return orig

    def make_spec(*, policy: str, of_cols=("ingest__operationalfiles__bgem3",),
                  doc_cols=()):
        return GroupSpec(
            group_name="g",
            schema_name="X",
            field_names=("f",),
            field_specs=tuple(),
            query_seeds=("seed text",),  # literal — resolve_seeds keeps it
            collections=of_cols,
            filters={},
            top_k_per_query=4,
            merge_pool_size=10,
            merged_top_k=8,
            rerank_query_ar=None,
            tier_policy=policy,
            operationalfiles_collections=of_cols,
            doctrine_collections=doc_cols,
        )

    of_pool_strong = [
        _sourced(_hit(src=f"FM-{i}", score=0.6, para=f"3-{i}"),
                 collection="ingest__operationalfiles__bgem3", tier="operationalfiles")
        for i in range(9)
    ] + [_sourced(_hit(src="FM-Other", score=0.6, para="9-1"),
                  collection="ingest__operationalfiles__bgem3", tier="operationalfiles")]
    of_pool_weak = [
        _sourced(_hit(src="FM-Z", score=0.05, para="z-0"),
                 collection="ingest__operationalfiles__bgem3", tier="operationalfiles"),
    ]
    doc_pool = [
        _sourced(_hit(src="ADP-2-0", score=0.4, para=f"2-{i}"),
                 collection="ingest__doctrine__bgem3", tier="doctrine")
        for i in range(3)
    ]

    # We need to orchestrate the kill-switch + monkeypatching. Save
    # originals.
    original_fan_out = rg._fan_out_search
    original_rerank_module_attr = rg.rerank

    def with_patches(of_pool, doc_pool, kill_switch_value=None):
        rg._fan_out_search = fake_fanout_factory(of_pool, doc_pool)
        from graph.retrieval.rerank import RerankedHit
        rg.rerank = lambda q, texts: [RerankedHit(original_index=i, score=0.5) for i in range(len(texts))]
        if kill_switch_value is not None:
            os.environ["PHASE3_TIERED_RETRIEVAL"] = kill_switch_value

    def restore_patches(saved_kill):
        rg._fan_out_search = original_fan_out
        rg.rerank = original_rerank_module_attr
        if saved_kill is None:
            os.environ.pop("PHASE3_TIERED_RETRIEVAL", None)
        else:
            os.environ["PHASE3_TIERED_RETRIEVAL"] = saved_kill

    saved_kill = os.environ.get("PHASE3_TIERED_RETRIEVAL")

    def legacy_fast_path_no_doctrine() -> None:
        try:
            with_patches(of_pool_strong, doc_pool)
            spec = make_spec(policy="operationalfiles_only",
                             doc_cols=("ingest__doctrine__bgem3",))
            res = retrieve_group(spec, inputs)
            # Only operationalfiles hits returned.
            assert all(sh.tier == "operationalfiles" for sh in res.hits), [sh.tier for sh in res.hits]
            # Citation tags must be LEGACY shape (no prefix).
            assert all(not sh.citation_tag.startswith("[O:") for sh in res.hits)
            assert any(sh.citation_tag.startswith("[FM-") for sh in res.hits)
        finally:
            restore_patches(saved_kill)

    def kill_switch_forces_legacy() -> None:
        try:
            with_patches(of_pool_strong, doc_pool, kill_switch_value="0")
            spec = make_spec(policy="operationalfiles_then_doctrine",
                             doc_cols=("ingest__doctrine__bgem3",))
            res = retrieve_group(spec, inputs)
            # Kill-switch off → legacy fast-path → no doctrine hits, no [O:] prefix.
            assert all(sh.tier == "operationalfiles" for sh in res.hits)
            assert all(not sh.citation_tag.startswith("[O:") for sh in res.hits)
            assert all(not sh.citation_tag.startswith("[D:") for sh in res.hits)
        finally:
            restore_patches(saved_kill)

    def of_then_doctrine_strong_skips_doctrine() -> None:
        try:
            with_patches(of_pool_strong, doc_pool, kill_switch_value="1")
            spec = make_spec(policy="operationalfiles_then_doctrine",
                             doc_cols=("ingest__doctrine__bgem3",))
            res = retrieve_group(spec, inputs)
            # Strong OF coverage → doctrine fallback NOT fired.
            assert all(sh.tier == "operationalfiles" for sh in res.hits)
            # Tier-aware → prefixed tags.
            assert all(sh.citation_tag.startswith("[O:") for sh in res.hits)
            assert not any(sh.citation_tag.startswith("[D:") for sh in res.hits)
        finally:
            restore_patches(saved_kill)

    def of_then_doctrine_weak_fires_doctrine() -> None:
        try:
            with_patches(of_pool_weak, doc_pool, kill_switch_value="1")
            spec = make_spec(policy="operationalfiles_then_doctrine",
                             doc_cols=("ingest__doctrine__bgem3",))
            res = retrieve_group(spec, inputs)
            tiers = {sh.tier for sh in res.hits}
            assert "operationalfiles" in tiers
            assert "doctrine" in tiers, ("doctrine fallback should have fired", tiers)
            o_tags = [sh for sh in res.hits if sh.citation_tag.startswith("[O:")]
            d_tags = [sh for sh in res.hits if sh.citation_tag.startswith("[D:")]
            assert o_tags and d_tags
        finally:
            restore_patches(saved_kill)

    def of_and_doctrine_unconditional() -> None:
        try:
            with_patches(of_pool_strong, doc_pool, kill_switch_value="1")
            spec = make_spec(policy="operationalfiles_and_doctrine",
                             doc_cols=("ingest__doctrine__bgem3",))
            res = retrieve_group(spec, inputs)
            tiers = {sh.tier for sh in res.hits}
            # Even with strong OF, doctrine fans out unconditionally.
            assert tiers == {"operationalfiles", "doctrine"}, tiers
        finally:
            restore_patches(saved_kill)

    def doctrine_only_skips_operationalfiles() -> None:
        try:
            with_patches(of_pool_strong, doc_pool, kill_switch_value="1")
            spec = make_spec(policy="doctrine_only",
                             doc_cols=("ingest__doctrine__bgem3",))
            res = retrieve_group(spec, inputs)
            assert all(sh.tier == "doctrine" for sh in res.hits), [sh.tier for sh in res.hits]
            assert all(sh.citation_tag.startswith("[D:") for sh in res.hits)
        finally:
            restore_patches(saved_kill)

    def all_channels_pulls_both_unconditional() -> None:
        try:
            with_patches(of_pool_strong, doc_pool, kill_switch_value="1")
            spec = make_spec(policy="all_channels",
                             doc_cols=("ingest__doctrine__bgem3",))
            res = retrieve_group(spec, inputs)
            tiers = {sh.tier for sh in res.hits}
            assert tiers == {"operationalfiles", "doctrine"}, tiers
        finally:
            restore_patches(saved_kill)

    def doctrine_unreachable_no_hard_fail() -> None:
        # When doc_cols=() the doctrine fan-out is silently skipped —
        # locked plan acceptance criterion: "Doctrine collection
        # unreachable still produces output".
        try:
            with_patches(of_pool_strong, doc_pool, kill_switch_value="1")
            spec = make_spec(policy="operationalfiles_then_doctrine", doc_cols=())
            res = retrieve_group(spec, inputs)
            # Only operationalfiles hits; no exception raised.
            assert all(sh.tier == "operationalfiles" for sh in res.hits)
        finally:
            restore_patches(saved_kill)

    _run("operationalfiles_only → legacy tags, no doctrine fan-out", legacy_fast_path_no_doctrine, c)
    _run("kill-switch=0 forces legacy path even on tiered policy", kill_switch_forces_legacy, c)
    _run("operationalfiles_then_doctrine + strong OF → doctrine skipped", of_then_doctrine_strong_skips_doctrine, c)
    _run("operationalfiles_then_doctrine + weak OF → doctrine fires", of_then_doctrine_weak_fires_doctrine, c)
    _run("operationalfiles_and_doctrine → both unconditionally", of_and_doctrine_unconditional, c)
    _run("doctrine_only → doctrine tier only, no OF fan-out", doctrine_only_skips_operationalfiles, c)
    _run("all_channels → both fan out unconditionally", all_channels_pulls_both_unconditional, c)
    _run("doctrine collection unreachable → graceful, OF only", doctrine_unreachable_no_hard_fail, c)


# --------------------------------------------------------------- entry point

def main() -> int:
    print("=" * 72)
    print("Tiered-retrieval smoke harness — offline acceptance for §C28–§C31")
    print("=" * 72)
    counter = _Counter()

    check_coverage_verdicts(counter)
    check_citation_tag_emission(counter)
    check_citation_tag_parsing(counter)
    check_evidence_bundle_assembly(counter)
    check_cache_key_invalidation(counter)
    check_renderer_endnote_layout(counter)
    check_retrieve_group_routing(counter)

    print("\n" + "=" * 72)
    total = counter.passed + counter.failed
    print(f"summary: {counter.passed}/{total} PASS,  {counter.failed} FAIL")
    if counter.failed:
        print("\nfailures:")
        for f in counter.failures:
            print(f"  - {f}")
        return 1
    print("\nAll tiered-retrieval architecture checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
